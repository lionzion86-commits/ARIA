/* ============================================================
   THE CHECKOUT MODEL — what an order costs, decided by the server. PURE.

   2026-10-08, Stripe checkout (brief "Stripe Checkout Integration").
   Until now orders-create.js recorded what the browser said and nothing
   charged anyone. Once it opens a Stripe session, every number it
   accepts from the browser is a number someone can rewrite into a
   cheaper charge. This file holds the rules that stop that, with no
   Blobs, no HTTP and no Stripe -- so scripts/test/checkout-tests.mjs can
   run them as they are.

     repriceCart()        each line at the price the card showed, looked
                          up in price-index.json (index.html's own
                          pricing, precomputed). A line the index cannot
                          vouch for is kept at the browser's price and
                          FLAGGED for ops -- never silently trusted.
     freightFloorUsd()    freight is never below the server-resolved
                          weight at $13/kg.
     expressFeePen()      "Recibir cada paquete ni bien llegue": $8.
     refFromCookie()      ?ref= influencer attribution, 30-day cookie.
     stripeSessionForm()  the Checkout Session, in SOLES, for exactly the
                          order's total.
   ============================================================ */
import { createHash } from "node:crypto";

const r2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---------- SHIPPING (standing decision 2026-09-25) ----------
   One toggle, plain language. Consolidated is free and the default;
   express costs $8 (raised from $5 to discourage it). Cross-customer
   Miami batching stays invisible. */
export const SHIPPING_MODES = {
  consolidated: { label: "Recibir todo junto", feeUsd: 0 },
  express: { label: "Recibir cada paquete ni bien llegue", feeUsd: 8 },
};
export const DEFAULT_SHIPPING_MODE = "consolidated";
export function shippingModeOf(raw) {
  return Object.prototype.hasOwnProperty.call(SHIPPING_MODES, raw) ? raw : DEFAULT_SHIPPING_MODE;
}
/** The express fee in soles at today's venta rate; 0 for consolidated. */
export function expressFeePen(mode, fxVenta) {
  const usd = SHIPPING_MODES[shippingModeOf(mode)].feeUsd;
  return usd > 0 && fxVenta > 0 ? r2(usd * fxVenta) : 0;
}

/* ---------- PRICES ---------- */
/** The connector's public product id (scripts/lib/mcp/catalog.mjs). */
export function productIdFor(retailer, title) {
  return createHash("sha1").update(`${retailer}::${title}`).digest("base64url").slice(0, 16);
}
const MAX_QTY = 20;
const PRICE_EPSILON = 0.011;

/**
 * Every cart line at a price the server can stand behind.
 *
 * `prices` is price-index.json's map: id -> [cardUsd, dutiableUsd,
 * saleUsd?, saleDutiableUsd?]. A browser price that matches either the
 * card or the sale price is kept (both were really shown); any other
 * figure is replaced by the card price and recorded as an adjustment.
 * Lines the index does not know -- live-scraped results, combo
 * discounts -- keep the browser's figure with priceVerified: false, and
 * the order is flagged for a human before anything is bought.
 */
export function repriceCart(items, prices) {
  const lines = [];
  const adjustments = [];
  const unverified = [];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== "object") continue;
    const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(raw.qty) || 1)));
    const retailer = String(raw.retailer || "");
    const title = String(raw.title || raw.name || "");
    const sent = Number(raw.priceUsd);
    const line = { ...raw, qty };
    /* A combo discount is a negative line (index.html
       comboDiscountLineFields). It can only lower a total, so it is
       never repriced -- but it is bounded and flagged. */
    if (raw.lineType === "bundle-discount") {
      line.priceUsd = Number.isFinite(sent) && sent < 0 ? r2(sent) : 0;
      line.dutiableUsd = 0;
      line.priceVerified = false;
      unverified.push({ title, reason: "descuento de combo" });
      lines.push(line);
      continue;
    }
    const known = prices && prices[productIdFor(retailer, title)];
    if (!known) {
      line.priceVerified = false;
      unverified.push({ title, retailer, reason: "precio no verificable en el catálogo" });
      lines.push(line);
      continue;
    }
    const [card, cardDutiable, sale, saleDutiable] = known;
    if (sale != null && Math.abs(sent - sale) < PRICE_EPSILON) {
      line.priceUsd = sale;
      line.dutiableUsd = saleDutiable ?? sale;
    } else {
      if (!(Math.abs(sent - card) < PRICE_EPSILON)) adjustments.push({ title, retailer, sentUsd: Number.isFinite(sent) ? sent : null, chargedUsd: card });
      line.priceUsd = card;
      line.dutiableUsd = cardDutiable;
    }
    line.priceVerified = true;
    lines.push(line);
  }
  return { lines, adjustments, unverified };
}

/** Goods (what the cards charge) and the dutiable FOB, in USD. */
export function goodsTotals(lines) {
  let goodsUsd = 0, fobUsd = 0, preDiscountGoodsUsd = 0;
  for (const l of lines) {
    const q = Number(l.qty) || 1;
    goodsUsd += (Number(l.priceUsd) || 0) * q;
    fobUsd += (Number(l.dutiableUsd) || 0) * q;
    if (Number(l.priceUsd) > 0) preDiscountGoodsUsd += Number(l.priceUsd) * q;
  }
  return { goodsUsd: r2(goodsUsd), fobUsd: r2(fobUsd), preDiscountGoodsUsd: r2(preDiscountGoodsUsd) };
}

/** Freight is never below the server-resolved weight at the per-kg rate. */
export function freightFloorUsd(sentFreightUsd, resolvedKg, chargePerKg) {
  const floor = r2(Math.max(0, Number(resolvedKg) || 0) * chargePerKg);
  const sent = Number(sentFreightUsd);
  return Number.isFinite(sent) && sent >= floor ? r2(sent) : floor;
}

/* The soles total the page showed and the one the server computed may
   differ by rounding only. Anything more (a stale exchange rate in the
   browser's cache, a repriced line) is sent back to the page to show
   before anyone is charged -- "the price you see is the price you pay". */
export const SHOWN_TOTAL_TOLERANCE_PEN = 0.05;
export function totalsAgree(serverPen, shownPen) {
  const s = Number(shownPen);
  return Number.isFinite(s) && Math.abs(r2(serverPen) - s) <= SHOWN_TOTAL_TOLERANCE_PEN;
}

/* ---------- INFLUENCER ATTRIBUTION ----------
   ?ref= links, never codes (Danny: "nobody remembers codes"). ref.js sets
   the cookie on landing; the most recent ref link wins and lasts 30
   days. Commission is computed on the PRE-DISCOUNT figures the order
   records (preDiscountGoodsUsd, orderTotalPen before saldo), always. */
export const REF_COOKIE = "aria_ref";
export const REF_MAX_AGE_DAYS = 30;
export function normalizeRef(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,39}$/.test(s) ? s : null;
}
/** { ref, setAt } from a Cookie header, or null. Expired values are ignored. */
export function refFromCookie(cookieHeader, now = Date.now()) {
  const m = new RegExp(`(?:^|;\\s*)${REF_COOKIE}=([^;]*)`).exec(String(cookieHeader || ""));
  if (!m) return null;
  const [code, at] = decodeURIComponent(m[1]).split("|");
  const ref = normalizeRef(code);
  const setAt = Number(at);
  if (!ref) return null;
  if (Number.isFinite(setAt) && now - setAt > REF_MAX_AGE_DAYS * 864e5) return null;
  return { ref, setAt: Number.isFinite(setAt) ? new Date(setAt).toISOString() : null };
}

/* ---------- STRIPE ---------- */
/**
 * A test key everywhere but production. A deploy preview can never
 * charge a real card, whatever is pasted into its environment.
 */
export function stripeKeyUsable(key, context) {
  const k = String(key || "");
  if (!/^(sk|rk)_(test|live)_/.test(k)) return { ok: false, reason: "STRIPE_SECRET_KEY no está configurado" };
  const live = /^(sk|rk)_live_/.test(k);
  if (live && context && context !== "production") return { ok: false, reason: "clave live fuera de producción" };
  return { ok: true, live };
}

/** Soles to Stripe's minor units (céntimos). */
export const toMinor = (pen) => Math.round(Number(pen) * 100);

/**
 * The Checkout Session as Stripe's form fields. One line for the whole
 * order, so the amount charged is exactly order.pricePenCharged -- no
 * per-line rounding can make Stripe's sum differ from the total shown.
 * The order id rides on the session AND the payment intent, because
 * Stripe sends events for both (stripe-webhook.js reads either).
 */
export function stripeSessionForm(order, { origin }) {
  const id = order.orderId;
  const lines = (order.items || []).filter((l) => Number(l.priceUsd) > 0);
  const summary = lines.slice(0, 6).map((l) => `${l.qty > 1 ? l.qty + "× " : ""}${String(l.title || "").slice(0, 60)}`).join(" · ")
    + (lines.length > 6 ? ` · y ${lines.length - 6} más` : "");
  const form = {
    mode: "payment",
    locale: "es",
    client_reference_id: id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "pen",
    "line_items[0][price_data][unit_amount]": String(toMinor(order.pricePenCharged)),
    "line_items[0][price_data][product_data][name]": `Pedido Aria ${id}`,
    "line_items[0][price_data][product_data][description]": (summary || "Compra en Aria Shop").slice(0, 480),
    "metadata[orderId]": id,
    "payment_intent_data[metadata][orderId]": id,
    "payment_intent_data[description]": `Aria Shop ${id}`,
    success_url: `${origin}/checkout.html?pagado=${encodeURIComponent(id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout.html?cancelado=${encodeURIComponent(id)}`,
  };
  const email = order.customer && order.customer.email;
  if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) form.customer_email = email;
  if (order.attribution && order.attribution.ref) form["metadata[ref]"] = order.attribution.ref;
  return form;
}
