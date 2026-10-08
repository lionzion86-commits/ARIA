// Where an order is CREATED, and -- since 2026-10-08 -- where its Stripe
// Checkout Session is opened. It still never marks anything paid: the
// customer pays on Stripe's page, and stripe-webhook.js, after verifying
// Stripe's signature, is the only writer of paymentStatus.
//
// STRIPE CHECKOUT (2026-10-08 brief). With STRIPE_SECRET_KEY set, the
// order is priced HERE, not in the browser (_checkout-model.js): every
// line repriced from price-index.json, freight floored at the resolved
// weight, the exchange rate fetched server-side, the express fee and the
// small-order fee recomputed -- and charged in SOLES, the figure on the
// card. If the soles total the page showed disagrees with the server's,
// nothing is created and the page is told the new figure first. Without
// a key, production keeps its old behaviour (an order record, no charge)
// and a preview refuses, so a test checkout can never look paid when it
// was not.
//
// This function enforces the daily order cap / kill switch ("launch cash
// control") and persists an order record that orders-remaining.js's
// counter, the admin margin view (admin-orders-*.js) and the ops
// dashboard (admin-dashboard.js) all read from.
//
// NOT atomic: the counter is a plain read-modify-write against Blobs, not
// a compare-and-swap. Acceptable for a low-volume launch-phase cap (a
// couple of near-simultaneous orders at the exact cap boundary could both
// slip through) — a real atomic counter would need a different storage
// primitive than Blobs offers; flagged here rather than silently assumed
// perfect.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { readWallet, postTransaction, applicableCreditPen } from "./_wallet.js";
import { peruDateKey, normalizeBatchHour, DEFAULT_BATCH_HOUR } from "./_peru-time.js";
import { randomBytes } from "node:crypto";
import { smallOrderFeePen, importTaxEstimateUsd, TAX_ESTIMATE_RATE, dutiableBaseUsd } from "../../weight-data.js";
/* PROVINCIA LAST-MILE (2026-09-27): the flat Lima → province leg. The
   browser sends what it showed, but the charge is decided here from
   destCity — a tampered request must not be able to zero it. */
import { provinciaFeePen as provinciaFeeFor } from "../../couriers.js";
import { CHARGE_PER_KG } from "../../weight-data.js";
import { resolveCartWeights } from "./_weight-resolve.js";
import { loadPriceIndex } from "./_price-index.js";
import { createCheckoutSession } from "./_stripe-api.js";
import {
  repriceCart, goodsTotals, freightFloorUsd, expressFeePen, shippingModeOf, SHIPPING_MODES,
  totalsAgree, refFromCookie, normalizeRef, stripeKeyUsable, stripeSessionForm,
} from "./_checkout-model.js";

/* The production hosts. Anything else (deploy previews, branch deploys,
   localhost) is a test environment and may only hold a test key. */
const PRODUCTION_HOSTS = new Set(["ariashop.pe", "www.ariashop.pe"]);

/* Today's venta rate from the site's own endpoint (SUNAT, CDN-cached),
   the same source the page reads -- never a number the browser sent. */
async function serverFxVenta(origin) {
  try {
    const res = await fetch(`${origin}/.netlify/functions/exchange-rate`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    return typeof data.venta === "number" && data.venta > 2 && data.venta < 6 ? data.venta : null;
  } catch { return null; }
}

const DEFAULT_SETTINGS = { paused: false, dailyCap: 40, batchHour: DEFAULT_BATCH_HOUR };
const HELD_MESSAGE = "Estamos en lanzamiento y queremos que tu pedido llegue perfecto: procesamos un número limitado de pedidos por día. Si el cupo de hoy se completa, tu carrito se guarda automáticamente y tu pedido entra primero mañana. Gracias por ser parte del inicio de Aria.";

// Real Culqi/Niubiz-class card-gateway fee is not something I can verify
// from here — this is a disclosed estimate (common Peru gateway rate),
// not a confirmed real number. The admin view (Phase 5) shows it labeled
// as an estimate, never as a real reconciled fee.
const GATEWAY_FEE_RATE_ESTIMATE = 0.0399;
const GATEWAY_FEE_FIXED_PEN_ESTIMATE = 0.5;

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * The person who will actually take the parcel, or null for the buyer.
 *
 * THE DOCUMENT IS MANDATORY and it is enforced here, not only in the
 * form: aduanas and the courier check ID at handoff, and a recipient
 * whose document is missing from the manifest can be refused the box.
 * A recipient with no name or no document is therefore not a
 * half-filled recipient — it is no recipient, and recording it as one
 * would put a name on the manifest that the courier cannot verify.
 */
function normalizeRecipient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const recipient = {
    name: clean(raw.name, 120),
    idNumber: clean(raw.idNumber ?? raw.doc, 40),
    relationship: clean(raw.relationship, 80),
    deliveryInstructions: clean(raw.deliveryInstructions, 400),
  };
  if (!recipient.name || !recipient.idNumber) return null;
  return recipient;
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const sentItems = Array.isArray(body.items) ? body.items : [];
  const quote = body.quote || {};
  if (!sentItems.length || typeof quote.total_usd !== "number") {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Pedido inválido" }) };
  }

  /* WHO MAY CHARGE, decided before anything is written. */
  const host = String(event.headers?.host || event.headers?.Host || "").toLowerCase();
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host || "ariashop.pe"}`;
  const isProduction = PRODUCTION_HOSTS.has(host);
  const stripeKey = process.env.STRIPE_SECRET_KEY || "";
  const keyCheck = stripeKeyUsable(stripeKey, isProduction ? "production" : "preview");
  const charging = keyCheck.ok;
  if (!charging && !isProduction) {
    return { statusCode: 503, headers, body: JSON.stringify({
      error: `El pago de prueba no está configurado en este entorno (${keyCheck.reason}). No se creó ningún pedido.`,
    }) };
  }

  /* EVERY LINE AT THE PRICE THE CARD SHOWED (see _checkout-model.js). */
  const { lines: items, adjustments: priceAdjustments, unverified: unverifiedLines } =
    charging ? repriceCart(sentItems, loadPriceIndex()) : { lines: sentItems, adjustments: [], unverified: [] };

  try {
    const settingsStore = getStore("settings");
    const ordersStore = getStore("orders");
    const settings = (await settingsStore.get("global", { type: "json" })) || DEFAULT_SETTINGS;

    const batchHour = normalizeBatchHour(settings.batchHour);

    if (settings.paused) {
      return { statusCode: 200, headers, body: JSON.stringify({ held: true, message: HELD_MESSAGE, batchHour }) };
    }

    // Peru-day key, not UTC: this counter is what "pedidos por día" means
    // to the customer, and the batch runs on Peru mornings. See
    // _peru-time.js for why the UTC date was wrong.
    const dateKey = peruDateKey();
    const counterKey = `count:${dateKey}`;
    const counter = (await ordersStore.get(counterKey, { type: "json" })) || { count: 0 };

    if (counter.count >= settings.dailyCap) {
      return { statusCode: 200, headers, body: JSON.stringify({ held: true, message: HELD_MESSAGE, batchHour }) };
    }

    /* THE RECIPIENT IS VALIDATED BEFORE ANYTHING IS CHARGED. The form
       marks the fields required, but a form can be bypassed, and a box
       that reaches Lima addressed to a name with no document is a failed
       delivery we have already paid the freight on. */
    const recipientAsked = body.recipient && typeof body.recipient === "object";
    const recipient = normalizeRecipient(body.recipient);
    if (recipientAsked && !recipient) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Falta el nombre o el documento de quien recibe el paquete. El courier necesita ambos para entregarlo.",
        }),
      };
    }

    /* Server-side numbers when charging: the exchange rate from the
       site's own endpoint, freight never under the resolved weight. */
    const fxRateVenta = charging
      ? await serverFxVenta(origin)
      : (typeof body.fxRateVenta === "number" ? body.fxRateVenta : null);
    if (charging && fxRateVenta == null) {
      return { statusCode: 503, headers, body: JSON.stringify({
        error: "No pudimos obtener el tipo de cambio de hoy. Intenta de nuevo en un momento; no se cobró nada.",
      }) };
    }
    const resolvedKg = charging ? resolveCartWeights(items).totalKg : null;
    const freightUsdQuoted = charging
      ? freightFloorUsd(quote.flete_usd, resolvedKg, CHARGE_PER_KG)
      : (typeof quote.flete_usd === "number" ? quote.flete_usd : 0);
    const shippingMode = shippingModeOf(body.shippingMode);
    const expressFeePenCharged = expressFeePen(shippingMode, fxRateVenta);

    const priceUsdTotal = items.reduce((sum, it) => sum + (Number(it.priceUsd) || 0) * (Number(it.qty) || 1), 0);
    /* DUTIABLE BASE (2026-09-27): the import-tax threshold and estimate
       are computed on what the goods really cost (raw x per-retailer
       sales-tax rate: 1.07 default, 1.0 for DR-13-exempt retailers),
       NEVER on the marked-up card price. The browser sends dutiableUsd per line;
       the server resolves it through the same canonical helper, so a
       tampered or legacy line (no stamp) gets the exact reversal and
       cannot shift the tax base. */
    const dutiableUsdTotal = items.reduce((sum, it) => {
      const d = dutiableBaseUsd(it.priceUsd, it.dutiableUsd);
      return sum + (Number.isFinite(d) ? d : 0) * (Number(it.qty) || 1);
    }, 0);
    const weightKgTotal = resolvedKg ?? items.reduce((sum, it) => sum + (Number(it.weightKg) || 0) * (Number(it.qty) || 1), 0);
    /* SMALL-ORDER FEE. The browser sends what it showed, but the server
       decides what is charged: the fee is recomputed here, so a tampered
       request cannot zero it and a stale page cannot charge one that no
       longer applies. The rule and both numbers live in weight-data.js —
       never inlined.

       BASE: PRODUCTS + INTERNATIONAL FREIGHT (2026-09-20). Measuring the
       threshold against products alone charged a "pedido pequeño" fee on
       a S/ 54.76 order whose own label promised no charge from S/ 50.
       The freight component comes off the same quote the customer was
       shown; duty is deliberately excluded (see weight-data.js). */
    const productsPen = fxRateVenta ? Math.round(priceUsdTotal * fxRateVenta * 100) / 100 : null;
    const orderBasePen = productsPen == null
      ? null
      : Math.round((priceUsdTotal + freightUsdQuoted) * fxRateVenta * 100) / 100;
    const smallOrderFeePenCharged = orderBasePen != null ? smallOrderFeePen(orderBasePen) : 0;

    /* PROVINCIA LAST-MILE (2026-09-27): the flat Lima → province courier
       leg, recomputed from destCity — never accepted from the client —
       for the same reason as the small-order fee and the tax above. The
       courier choice itself rides along inside body.shipping for the
       manifest sort; it carries no price. */
    const destCity = (body.shipping && body.shipping.destCity) || "";
    const provinciaFeePenCharged = provinciaFeeFor(destCity);

    /* IMPORT TAX — RECOMPUTED, NOT ACCEPTED (2026-09-21).

       The browser sends what it showed so the record can prove the two
       agreed, but the charge is decided here, from the same shared
       helper, for the same reason the small-order fee is: a tampered
       request must not be able to zero it, and a stale page must not be
       able to charge an old rate.

       THE BASE IS THE ORDER'S OWN NUMBERS: goods from the items'
       dutiable base (declaredValueUsd — the true FOB, never the marked-up
       card price), freight from the quote the customer was shown. The
       threshold is on the goods (FOB), the rate is on goods + freight
       (CIF) — see importTaxEstimateUsd().

       AND IT IS WHAT THE CUSTOMER PAYS, not what the courier bills. The
       quote's total_usd still carries AVI's own duty and is recorded
       below for the margin view, but the customer's total is built from
       goods + freight + THIS number. When AVI bills more, Aria absorbs
       it; when the real SUNAT figure comes in lower, the difference is
       credited back as saldo. taxActual and sunatDocRef are where that
       reconciliation lands. */
    const taxEstimatedUsd = importTaxEstimateUsd(dutiableUsdTotal, freightUsdQuoted);
    const customerTotalUsd = Math.round((priceUsdTotal + freightUsdQuoted + taxEstimatedUsd) * 100) / 100;
    const taxEstimatedPen = fxRateVenta ? Math.round(taxEstimatedUsd * fxRateVenta * 100) / 100 : null;
    const totalPen = fxRateVenta
      ? Math.round((customerTotalUsd * fxRateVenta + smallOrderFeePenCharged + provinciaFeePenCharged + expressFeePenCharged) * 100) / 100
      : null;

    /* THE PRICE YOU SEE IS THE PRICE YOU PAY. The page sends the soles
       total it showed; if the server's differs (a stale cached exchange
       rate, a repriced line) nothing is created and nothing is charged --
       the page shows the new figure and the customer decides. */
    if (charging && !totalsAgree(totalPen, body.shownTotalPen)) {
      return { statusCode: 409, headers, body: JSON.stringify({
        error: "El total cambió desde que abriste el checkout. Revisa el nuevo total antes de pagar.",
        totalChanged: true, totalPen, fxVenta: fxRateVenta, priceAdjustments,
        /* What the page needs to redraw the summary on the server's
           figures, so the next tap charges exactly what is shown. */
        freightUsd: freightUsdQuoted, expressFeePen: expressFeePenCharged,
      }) };
    }
    /* SALDO ARIA. The browser asks for an amount; the server decides it.
       The balance is re-read here and capped against both the real
       balance and the order total, so a tampered request can only ever
       spend money the customer actually has (see applicableCreditPen).
       Only a signed-in customer has a wallet at all. */
    const buyerEmail = await getSessionEmail(event);
    /* INFLUENCER ATTRIBUTION: the cookie ref.js set from a ?ref= link
       (30 days, most recent link wins); the body's copy only when the
       browser blocked the cookie. */
    const cookieRef = refFromCookie(event.headers?.cookie || event.headers?.Cookie);
    const bodyRef = normalizeRef(body.ref);
    const attribution = cookieRef ? { ...cookieRef, source: "cookie" }
      : bodyRef ? { ref: bodyRef, setAt: null, source: "page" } : null;
    let walletAppliedPen = 0;
    let walletBalanceBeforePen = null;
    if (buyerEmail && totalPen != null && Number(body.applyWalletPen) > 0) {
      const wallet = await readWallet(buyerEmail);
      walletBalanceBeforePen = wallet.balancePen;
      walletAppliedPen = applicableCreditPen(wallet.balancePen, totalPen, Number(body.applyWalletPen));
    }
    const chargedPen = totalPen != null ? Math.round((totalPen - walletAppliedPen) * 100) / 100 : null;

    // The gateway fee is charged on what the card actually pays, which is
    // the total after any saldo — crediting a wallet does not make us pay
    // a processor fee on money that never moved.
    const gatewayFeeEstimatePen = chargedPen != null
      ? Math.round((chargedPen * GATEWAY_FEE_RATE_ESTIMATE + GATEWAY_FEE_FIXED_PEN_ESTIMATE) * 100) / 100
      : null;

    // Order IDs carry the same Peru date the counter is keyed on, so an
    // ID always matches the batch day it was counted against.
    const orderId = "ARIA-" + dateKey.replace(/-/g, "") + "-" + randomBytes(3).toString("hex").toUpperCase();
    const order = {
      orderId,
      createdAt: new Date().toISOString(),
      /* ---- STATUS, AND WHY IT IS NO LONGER "confirmed" -------------
         This field said "confirmed" on every order from the first one,
         and nothing had confirmed anything: there is no card form, no
         gateway call and — until stripe-webhook.js — no webhook. The
         checkout button says "Pagar", shows a success screen, and no
         money moves. An order record that claimed otherwise was the
         single most misleading thing in this codebase, because it is the
         field ops would reconcile the bank against.

         So there are two fields now and they answer different questions:

           status         where the order is in FULFILMENT.
                          pending_payment -> confirmed -> (shipping
                          statuses live on the shipment, not here).
           paymentStatus  whether MONEY ARRIVED. Written ONLY by
                          stripe-webhook.js, only after a signature
                          verified against STRIPE_WEBHOOK_SECRET.

         Both start at the honest value. Nothing in this function can
         move either of them, which is the point: the server that creates
         an order is not the server that can say it was paid. */
      status: "pending_payment",
      paymentStatus: "unpaid",
      paymentProvider: null,
      paymentId: null,
      paidAt: null,
      /* What the gateway actually captured, versus what we billed
         (pricePenCharged below). Null until a payment event lands; a
         zero here would read as "checked, nothing came in". */
      amountCapturedPen: null,
      amountRefundedPen: null,
      amountMismatchPen: null,
      customer: body.customer || {},
      shipping: body.shipping || {},
      /* Per-line dutiable base, resolved server-side: the set-aside
         bucket below is auditable line by line against the courier's
         SUNAT invoice. */
      items: items.map((it) => {
        const d = dutiableBaseUsd(it.priceUsd, it.dutiableUsd);
        return Number.isFinite(d) && !(Number(it.dutiableUsd) > 0) ? { ...it, dutiableUsd: d } : it;
      }),
      weightEstimatedKg: Math.round(weightKgTotal * 100) / 100,
      priceScrapedUsdTotal: null, // admin view reverses each line with its own retailer rate (see computeMargin) — not re-sent over the wire
      pricePenCharged: chargedPen,      // after saldo Aria — what the card pays
      orderTotalPen: totalPen,          // before saldo, for the margin view
      walletAppliedPen,
      walletBalanceBeforePen,
      buyerEmail: buyerEmail || null,
      fxRateUsed: fxRateVenta,
      freteChargedUsd: freightUsdQuoted,
      freteQuotedUsd: typeof quote.flete_usd === "number" ? quote.flete_usd : null,
      /* "Recibir todo junto" (free) or "Recibir cada paquete ni bien
         llegue" ($8, in soles at today's rate). */
      shippingMode,
      shippingModeLabel: SHIPPING_MODES[shippingMode].label,
      expressFeePen: expressFeePenCharged,
      /* ?ref= attribution. Commission (Ale: 25% of margin) is computed on
         the PRE-DISCOUNT figures -- preDiscountGoodsUsd and orderTotalPen
         (before saldo) -- always. */
      attribution,
      preDiscountGoodsUsd: goodsTotals(items).preDiscountGoodsUsd,
      /* What the server changed or could not vouch for. Unverified lines
         are charged at the page's price and must be checked by a human
         before anything is bought for this order. */
      priceAdjustments,
      unverifiedLines,
      needsPriceReview: unverifiedLines.length > 0,
      // Itemised on the record, not folded into the total, so the margin
      // view can tell handling revenue apart from freight and product.
      smallOrderFeePen: smallOrderFeePenCharged,
      // The Lima → province courier leg, itemised the same way.
      provinciaFeePen: provinciaFeePenCharged,
      totalUsd: customerTotalUsd,          // what the customer is charged, in USD
      courierTotalUsd: quote.total_usd,    // what AVI quoted, duty and all — margin view only
      gatewayFeeEstimatePen,
      quoteSource: quote.source || null,

      /* ---- IMPORT TAX, AND ITS RECONCILIATION ----------------------
         taxEstimated* is charged today. taxActual and sunatDocRef are
         written later, when the real assessment arrives, and they exist
         from the first order rather than being bolted on afterwards —
         an order placed before the reconciliation UI ships still has
         somewhere for its real figure to go, so no order is unresolvable
         later for want of a field.

         THE SET-ASIDE BUCKET (2026-09-27): declaredValueUsd is the
         dutiable sum — what the goods really cost (raw x per-retailer
         rate), never the marked-up card price — and taxEstimated*
         is computed on it.
         This is the figure Danny reconciles against the courier's SUNAT
         invoice after every transaction. Per-line dutiableUsd is stamped
         on items above so the bucket is auditable line by line.

         THE RULE WHEN THEY DIFFER, so the UI cannot invent its own:
           taxActual < taxEstimated  -> credit the difference as saldo Aria.
           taxActual > taxEstimated  -> Aria absorbs it. The customer is
                                        never billed a second time.
         taxReconciledAt stays null until someone has actually done it;
         a null here means "not yet", never "nothing owed". */
      declaredValueUsd: Math.round(dutiableUsdTotal * 100) / 100,
      taxEstimatedUsd,
      taxEstimatedPen,
      taxRateUsed: taxEstimatedUsd > 0 ? TAX_ESTIMATE_RATE : null,
      taxActualUsd: null,
      taxActualPen: null,
      sunatDocRef: null,
      taxReconciledAt: null,

      /* Null when the buyer receives it themselves. Carried onto the
         courier manifest — see manifestRow() in _shipping/service.js. */
      recipient,
    };

    await ordersStore.setJSON(orderId, order);
    await ordersStore.setJSON(counterKey, { count: counter.count + 1 });

    /* Debited AFTER the order exists, and never before: a held order (cap
       reached / paused) returns above without touching the wallet, so a
       customer cannot lose saldo on an order that was not placed. If the
       debit itself fails the order still stands and the balance is
       untouched — the customer keeps their money and ops reconciles, which
       is the right way round to fail. */
    let walletBalanceAfterPen = walletBalanceBeforePen;
    if (walletAppliedPen > 0) {
      try {
        const { balancePen } = await postTransaction({
          email: buyerEmail, kind: "debit", amountPen: walletAppliedPen,
          reason: `Aplicado al pedido ${orderId}`, by: "order", orderId,
        });
        walletBalanceAfterPen = balancePen;
      } catch {
        walletAppliedPen = 0;
        await ordersStore.setJSON(orderId, { ...order, walletAppliedPen: 0, pricePenCharged: totalPen });
      }
    }

    /* THE CHARGE. Stripe's hosted page takes the card; the order stays
       pending_payment until stripe-webhook.js hears it succeeded. */
    let checkoutUrl = null;
    if (charging && chargedPen > 0) {
      const saved = (await ordersStore.get(orderId, { type: "json" })) || order;
      try {
        const session = await createCheckoutSession(stripeSessionForm(saved, { origin }), stripeKey, { idempotencyKey: `checkout-${orderId}` });
        checkoutUrl = session.url;
        await ordersStore.setJSON(orderId, {
          ...saved, paymentProvider: "stripe", stripeSessionId: session.id,
          stripeLivemode: session.livemode, stripeSessionExpiresAt: session.expiresAt,
        });
      } catch (err) {
        /* No session, no charge: the order is closed and any saldo that
           was reserved for it goes straight back. */
        if (walletAppliedPen > 0) {
          try {
            await postTransaction({ email: buyerEmail, kind: "credit", amountPen: walletAppliedPen,
              reason: `Devuelto: el pago del pedido ${orderId} no se pudo iniciar`, by: "order", orderId });
          } catch { /* ops reconciles from the order record */ }
        }
        await ordersStore.setJSON(orderId, { ...saved, status: "payment_not_started", paymentError: err.message });
        return { statusCode: 502, headers, body: JSON.stringify({
          error: "No pudimos abrir el pago. No se cobró nada; intenta de nuevo en un momento.", detail: err.message,
        }) };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true, orderId, totalUsd: quote.total_usd, totalPen,
        walletAppliedPen, chargedPen, walletBalancePen: walletBalanceAfterPen,
        checkoutUrl, expressFeePen: expressFeePenCharged, priceAdjustments,
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
