/* ==================================================================
   STRIPE CHECKOUT — the 2026-10-08 brief, end to end without a network.

   The real orders-create handler runs against stubbed Blobs, a stubbed
   exchange rate and a stubbed Stripe; the pure rules
   (_checkout-model.js) and the payment state machine are run as they
   are. What Danny will verify on the preview, checked here first:
   the PEN charge equals the soles total on screen, the order records
   correctly, and a webhook moves it.

   RUNNING IT
     node scripts/test/checkout-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.stack.split("\n").slice(0, 2).join(" | ")}`); }
}

/* ---- @netlify/blobs, in memory (installed only on Netlify) ---- */
globalThis.__blobs = new Map();
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "const S = globalThis.__blobs;" +
      "export const connectLambda = () => {};" +
      "export function getStore(name){ if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null, setJSON: async (k,v)=>{ m.set(k, JSON.stringify(v)); }," +
      " set: async (k,v)=>{ m.set(k, String(v)); }, delete: async (k)=>{ m.delete(k); }, list: async ()=>({ blobs: [...m.keys()].map(key=>({key})) }) }; }"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);

const M = await import(ROOT + "netlify/functions/_checkout-model.js");
const PM = await import(ROOT + "netlify/functions/_payments-model.js");
const SV = await import(ROOT + "netlify/functions/_stripe-verify.js");
const { handler: createOrder } = await import(ROOT + "netlify/functions/orders-create.js");
const { buildPriceIndex } = await import(ROOT + "scripts/build-price-index.mjs");

const index = JSON.parse(readFileSync(ROOT + "price-index.json", "utf8"));

/* ------------------------------------------------------------------
   THE PRICE INDEX IS TODAY'S CATALOGUE.
   ------------------------------------------------------------------ */
await check("price-index.json is what the catalogues price today", () => {
  const fresh = buildPriceIndex();
  assert.equal(index.count, fresh.count, `index has ${index.count}, catalogues give ${fresh.count} — run: node scripts/build-price-index.mjs`);
  assert.deepEqual(index.prices, fresh.prices, "price-index.json is stale — run: node scripts/build-price-index.mjs");
});
await check("the function bundle ships the price index", () => {
  assert.match(readFileSync(ROOT + "netlify.toml", "utf8"), /included_files = \[[^\]]*"price-index\.json"/);
});

/* A real product, priced the way its card is. */
const kohls = JSON.parse(readFileSync(ROOT + "kohls-catalog.json", "utf8"));
let product = null;
for (const b of Object.values(kohls.retailers.kohls.departments)) {
  for (const it of (Array.isArray(b) ? b : b.items || [])) {
    const title = it.title || it.name;
    const p = index.prices[M.productIdFor("kohls", title)];
    if (p && p[0] > 15 && p[0] < 60) { product = { retailer: "kohls", title, priceUsd: p[0], dutiableUsd: p[1], weightKg: 0.4, qty: 1 }; break; }
  }
  if (product) break;
}

/* ------------------------------------------------------------------
   THE RULES.
   ------------------------------------------------------------------ */
await check("a line at its card price is kept; a rewritten price is not", () => {
  assert.ok(product, "no Kohl's product in the index");
  const ok = M.repriceCart([product], index.prices);
  assert.equal(ok.lines[0].priceUsd, product.priceUsd);
  assert.equal(ok.lines[0].priceVerified, true);
  assert.equal(ok.adjustments.length, 0);
  const cheat = M.repriceCart([{ ...product, priceUsd: 0.5, dutiableUsd: 0.1 }], index.prices);
  assert.equal(cheat.lines[0].priceUsd, product.priceUsd, "a tampered price was charged");
  assert.equal(cheat.lines[0].dutiableUsd, product.dutiableUsd);
  assert.equal(cheat.adjustments.length, 1);
});
await check("a sale-feed price is honoured; unknown lines and combo discounts are flagged", () => {
  const id = Object.keys(index.prices).find((k) => index.prices[k][2] != null);
  if (id) {
    const [, , sale] = index.prices[id];
    const r = M.repriceCart([{ retailer: "x", title: "x", priceUsd: sale }], { [M.productIdFor("x", "x")]: index.prices[id] });
    assert.equal(r.lines[0].priceUsd, sale);
  }
  const u = M.repriceCart([{ retailer: "live", title: "Live scraped thing", priceUsd: 12 },
    { lineType: "bundle-discount", title: "Descuento combo", priceUsd: -5 },
    { lineType: "bundle-discount", title: "Bad", priceUsd: 50 }], index.prices);
  assert.equal(u.unverified.length, 3);
  assert.equal(u.lines[0].priceUsd, 12);
  assert.equal(u.lines[1].priceUsd, -5);
  assert.equal(u.lines[2].priceUsd, 0, "a positive 'discount' must not add to the charge");
  assert.equal(M.repriceCart([{ ...product, qty: 999 }], index.prices).lines[0].qty, 20);
});
await check("freight never falls below the resolved weight at $13/kg", () => {
  assert.equal(M.freightFloorUsd(1, 2, 13), 26);
  assert.equal(M.freightFloorUsd(30, 2, 13), 30);
  assert.equal(M.freightFloorUsd(undefined, 1.5, 13), 19.5);
});
await check("shipping toggle: todo junto is free and the default, cada paquete is $8", () => {
  assert.equal(M.shippingModeOf(undefined), "consolidated");
  assert.equal(M.shippingModeOf("express"), "express");
  assert.equal(M.expressFeePen("consolidated", 3.75), 0);
  assert.equal(M.expressFeePen("express", 3.75), 30);
  assert.equal(M.SHIPPING_MODES.consolidated.label, "Recibir todo junto");
  assert.equal(M.SHIPPING_MODES.express.label, "Recibir cada paquete ni bien llegue");
  const page = readFileSync(ROOT + "checkout.html", "utf8");
  assert.match(page, new RegExp(`const EXPRESS_FEE_USD = ${M.SHIPPING_MODES.express.feeUsd};`), "checkout.html shows a different express fee");
  assert.match(page, /value="consolidated" checked/, "todo junto is not pre-selected");
});
await check("?ref= attribution: 30-day cookie, most recent wins, codes validated", () => {
  const now = Date.UTC(2026, 9, 8);
  assert.deepEqual(M.refFromCookie(`a=1; aria_ref=${encodeURIComponent("ale|" + (now - 864e5))}`, now), { ref: "ale", setAt: new Date(now - 864e5).toISOString() });
  assert.equal(M.refFromCookie(`aria_ref=${encodeURIComponent("ale|" + (now - 31 * 864e5))}`, now), null, "an expired ref must not attribute");
  assert.equal(M.refFromCookie("aria_ref=%3Cscript%3E", now), null);
  assert.equal(M.normalizeRef("ALE"), "ale");
  const js = readFileSync(ROOT + "ref.js", "utf8");
  assert.match(js, /\/\^\[a-z0-9\]\[a-z0-9_-\]\{0,39\}\$\//, "ref.js validates differently from the server");
  assert.match(js, /30 \* 24 \* 60 \* 60/);
  for (const f of readdirSync(ROOT).filter((f) => f.endsWith(".html") && f !== "admin.html")) {
    assert.match(readFileSync(ROOT + f, "utf8"), /<script src="\/ref\.js"><\/script>/, `${f} does not capture ?ref=`);
  }
});
await check("a live Stripe key can never charge from a preview", () => {
  assert.equal(M.stripeKeyUsable("sk_live_x", "preview").ok, false);
  assert.equal(M.stripeKeyUsable("sk_test_x", "preview").ok, true);
  assert.equal(M.stripeKeyUsable("sk_live_x", "production").ok, true);
  assert.equal(M.stripeKeyUsable("", "production").ok, false);
});
await check("the Stripe session charges the order's soles total, exactly, in PEN", () => {
  const f = M.stripeSessionForm({ orderId: "ARIA-1", pricePenCharged: 123.45, customer: { email: "a@b.pe" },
    items: [{ title: "Polo", qty: 2, priceUsd: 10 }], attribution: { ref: "ale" } }, { origin: "https://x.netlify.app" });
  assert.equal(f["line_items[0][price_data][currency]"], "pen");
  assert.equal(f["line_items[0][price_data][unit_amount]"], "12345");
  assert.equal(f["metadata[orderId]"], "ARIA-1");
  assert.equal(f["payment_intent_data[metadata][orderId]"], "ARIA-1");
  assert.equal(f["metadata[ref]"], "ale");
  assert.equal(f.customer_email, "a@b.pe");
  assert.match(f.success_url, /^https:\/\/x\.netlify\.app\/checkout\.html\?pagado=ARIA-1&session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.equal(M.toMinor(0.1 + 0.2), 30);
});

/* ------------------------------------------------------------------
   THE HANDLER, END TO END.
   ------------------------------------------------------------------ */
const FX = 3.75;
let stripeCalls = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.endsWith("/.netlify/functions/exchange-rate")) return new Response(JSON.stringify({ venta: FX, compra: 3.7 }));
  if (url === "https://api.stripe.com/v1/checkout/sessions") {
    stripeCalls.push({ opts, form: Object.fromEntries(new URLSearchParams(opts.body)) });
    return new Response(JSON.stringify({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123", livemode: false, expires_at: 1 }));
  }
  throw new Error("unexpected fetch " + url);
};
function orderBody(extra = {}) {
  const goods = product.priceUsd;
  const freight = 26;
  return {
    customer: { name: "Danny", email: "danny@ariashop.pe" },
    shipping: { destCity: "Lima" },
    items: [product],
    quote: { total_usd: goods + freight, flete_usd: freight, source: "avi" },
    shippingMode: "consolidated",
    ...extra,
  };
}
async function post(body, { host = "deploy-preview-1--ariashopperu.netlify.app", cookie = "" } = {}) {
  const res = await createOrder({ httpMethod: "POST", headers: { host, cookie }, body: JSON.stringify(body) });
  return { status: res.statusCode, data: JSON.parse(res.body) };
}
const W = await import(ROOT + "weight-data.js");
function expectedPen(mode = "consolidated", freight = 26) {
  const tax = W.importTaxEstimateUsd(product.dutiableUsd, freight);
  const usd = Math.round((product.priceUsd + freight + tax) * 100) / 100;
  const base = Math.round((product.priceUsd + freight) * FX * 100) / 100;
  return Math.round((usd * FX + W.smallOrderFeePen(base) + M.expressFeePen(mode, FX)) * 100) / 100;
}

await check("a preview with no Stripe key refuses instead of faking a payment", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const r = await post(orderBody({ shownTotalPen: expectedPen() }));
  assert.equal(r.status, 503);
  assert.match(r.data.error, /no está configurado/);
});
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
await check("the order is priced by the server and charged in soles, exactly what was shown", async () => {
  stripeCalls = [];
  const shown = expectedPen();
  const r = await post(orderBody({ shownTotalPen: shown }), { cookie: `aria_ref=${encodeURIComponent("ale|" + Date.now())}` });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.equal(stripeCalls.length, 1);
  const f = stripeCalls[0].form;
  assert.equal(f["line_items[0][price_data][currency]"], "pen");
  assert.equal(Number(f["line_items[0][price_data][unit_amount]"]), Math.round(shown * 100), "Stripe was asked for a different amount than the page showed");
  const order = JSON.parse(globalThis.__blobs.get("orders").get(r.data.orderId));
  assert.equal(order.pricePenCharged, shown);
  assert.equal(order.status, "pending_payment");
  assert.equal(order.paymentStatus, "unpaid");
  assert.equal(order.stripeSessionId, "cs_test_123");
  assert.equal(order.fxRateUsed, FX);
  assert.equal(order.shippingMode, "consolidated");
  assert.equal(order.attribution.ref, "ale");
  assert.equal(order.needsPriceReview, false);
  assert.equal(stripeCalls[0].opts.headers["Idempotency-Key"], `checkout-${r.data.orderId}`);
});
await check("a rewritten price in the request is not what gets charged", async () => {
  stripeCalls = [];
  const cheap = { ...product, priceUsd: 0.5 };
  const r = await post(orderBody({ items: [cheap], shownTotalPen: 1 }));
  assert.equal(r.status, 409, "a tampered total was accepted");
  const real = await post(orderBody({ items: [cheap], shownTotalPen: expectedPen() }));
  assert.equal(real.status, 200);
  assert.equal(Number(stripeCalls.at(-1).form["line_items[0][price_data][unit_amount]"]), Math.round(expectedPen() * 100));
});
await check("express adds $8 in soles; a cheap freight quote is floored", async () => {
  stripeCalls = [];
  const r = await post(orderBody({ shippingMode: "express", shownTotalPen: expectedPen("express") }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.expressFeePen, 30);
  const low = await post(orderBody({ quote: { total_usd: 1, flete_usd: 0.01 }, shownTotalPen: 1 }));
  assert.equal(low.status, 409, "freight of $0.01 was accepted");
});
await check("a stale total on screen is refused before anything is created", async () => {
  const before = globalThis.__blobs.get("orders").size;
  const r = await post(orderBody({ shownTotalPen: expectedPen() + 3 }));
  assert.equal(r.status, 409);
  assert.equal(r.data.totalChanged, true);
  assert.equal(r.data.totalPen, expectedPen());
  assert.equal(globalThis.__blobs.get("orders").size, before, "an order was created on a refused total");
});
await check("a live key on a preview charges nothing", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_live_dummy";
  const r = await post(orderBody({ shownTotalPen: expectedPen() }));
  assert.equal(r.status, 503);
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
});

/* ------------------------------------------------------------------
   THE WEBHOOK SIDE.
   ------------------------------------------------------------------ */
await check("payment success confirms the order; an abandoned page closes it", () => {
  const order = { orderId: "ARIA-1", status: "pending_payment", pricePenCharged: 100 };
  const done = SV.normalizeStripeEvent({ id: "evt_1", type: "checkout.session.completed", created: 1,
    data: { object: { id: "cs_1", payment_intent: "pi_1", currency: "pen", amount_total: 10000, payment_status: "paid", metadata: { orderId: "ARIA-1" } } } });
  const paid = PM.applyPaymentEvent(null, done);
  assert.equal(paid.status, "succeeded");
  const patch = PM.orderPatchForPayment(order, paid);
  assert.equal(patch.paymentStatus, "paid");
  assert.equal(patch.status, "confirmed");
  assert.equal(patch.amountMismatchPen, 0);
  const exp = SV.normalizeStripeEvent({ id: "evt_2", type: "checkout.session.expired", created: 2,
    data: { object: { id: "cs_2", payment_intent: null, currency: "pen", amount_total: 10000, payment_status: "unpaid", metadata: { orderId: "ARIA-1" } } } });
  assert.ok(SV.HANDLED_EVENTS.has("checkout.session.expired"));
  const gone = PM.applyPaymentEvent(null, exp);
  assert.equal(gone.status, "expired");
  assert.equal(PM.orderPatchForPayment(order, gone).status, "payment_expired");
  const late = PM.applyPaymentEvent(paid, { ...exp, paymentId: "pi_1" });
  assert.equal(late.status, "succeeded", "an expiry must not undo a payment");
  const unpaid = PM.applyPaymentEvent(null, { ...done, paymentStatus: "unpaid" });
  assert.equal(unpaid.status, "processing", "a delayed method is not money yet");
});

const MIN_CHECKS = 16;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
