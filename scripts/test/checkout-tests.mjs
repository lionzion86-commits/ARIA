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
      "export function getStore(name){ if (globalThis.__blobsFail === name) { const boom = async ()=>{ throw new Error('conditional writes unsupported'); }; return { get: boom, set: boom, setJSON: boom, delete: boom }; }" +
      " if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null," +
      " setJSON: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; }," +
      " set: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, String(v)); return { modified: true }; }," +
      " delete: async (k)=>{ m.delete(k); }, list: async ()=>({ blobs: [...m.keys()].map(key=>({key})) }) }; }"
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
    customer: { name: "Danny", email: "danny@ariashop.pe", idNumber: "45678912" },
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

await check("stripe-check: the right account, its own webhook, every event, the secret installed", async () => {
  const { stripeCheckReport, REQUIRED_WEBHOOK_EVENTS } = await import(ROOT + "netlify/functions/stripe-check.js");
  const host = "deploy-preview-367--ariashopperu.netlify.app";
  const hook = { url: `https://${host}/.netlify/functions/stripe-webhook`, status: "enabled", livemode: false, enabled_events: REQUIRED_WEBHOOK_EVENTS };
  const base = { host, keyMode: "test", webhookSecretSet: true, emailKeySet: true, account: { id: "acct_1URJryD00oB1thiK" }, endpoints: [hook], expect: "acct_1URJryD00oB1thiK" };
  assert.equal(stripeCheckReport(base).ready, true);
  /* Finding #10: no email provider key, not ready. */
  assert.equal(stripeCheckReport({ ...base, emailKeySet: false }).ready, false);
  /* The sandbox account's key is not the new account. */
  const wrong = stripeCheckReport({ ...base, account: { id: "acct_1URJsADnA3YvCFDC" } });
  assert.equal(wrong.accountMatchesExpected, false);
  assert.equal(wrong.ready, false);
  /* A webhook for another URL, a missing event, a live-mode hook or no secret is not ready. */
  assert.equal(stripeCheckReport({ ...base, endpoints: [{ ...hook, url: "https://ariashop.pe/.netlify/functions/stripe-webhook" }] }).ready, false);
  const partial = stripeCheckReport({ ...base, endpoints: [{ ...hook, enabled_events: REQUIRED_WEBHOOK_EVENTS.slice(1) }] });
  assert.deepEqual(partial.webhook.missingEvents, ["checkout.session.completed"]);
  assert.equal(stripeCheckReport({ ...base, endpoints: [{ ...hook, livemode: true }] }).ready, false);
  assert.equal(stripeCheckReport({ ...base, webhookSecretSet: false }).ready, false);
  /* The charge: PEN, and the céntimos equal the order's soles total. */
  const order = { pricePenCharged: 439.81 };
  assert.equal(stripeCheckReport({ ...base, order, session: { id: "cs_1", currency: "pen", amount_total: 43981 } }).charge.penAndExact, true);
  assert.equal(stripeCheckReport({ ...base, order, session: { id: "cs_1", currency: "pen", amount_total: 43980 } }).charge.penAndExact, false);
  assert.equal(stripeCheckReport({ ...base, order, session: { id: "cs_1", currency: "usd", amount_total: 43981 } }).charge.penAndExact, false);
});

await check("stripe-check never answers on production and never prints a secret", async () => {
  const { handler } = await import(ROOT + "netlify/functions/stripe-check.js");
  const prod = await handler({ httpMethod: "GET", headers: { host: "ariashop.pe" }, queryStringParameters: {} });
  assert.equal(prod.statusCode, 404);
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const none = await handler({ httpMethod: "GET", headers: { host: "deploy-preview-367--ariashopperu.netlify.app" }, queryStringParameters: {} });
  assert.equal(JSON.parse(none.body).ready, false);
  if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
  const src = readFileSync(ROOT + "netlify/functions/stripe-check.js", "utf8");
  assert.ok(!/report[^;]*\b(?:key|secret)\s*:\s*(?:key|process\.env)/i.test(src), "the report carries a key");
});

await check("a charged order carries the buyer's DNI, and one without it charges nothing", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  const calls = stripeCalls.length;
  const none = await post(orderBody({ customer: { name: "Ana", email: "a@b.pe" }, shownTotalPen: expectedPen() }));
  assert.equal(none.status, 400);
  assert.match(none.data.error, /documento/);
  assert.equal(stripeCalls.length, calls, "a session was opened without a document");
  const ok = await post(orderBody({ customer: { name: "Ana", email: "a@b.pe", idNumber: " 4567 8912 " }, shownTotalPen: expectedPen() }));
  assert.equal(ok.status, 200);
  const rec = await globalThis.__blobs.get("orders").get(ok.data.orderId);
  assert.equal(JSON.parse(rec).customer.idNumber, "45678912");
  const page = readFileSync(ROOT + "checkout.html", "utf8");
  assert.match(page, /id="custDoc"[^>]*required/, "the checkout form does not ask for the buyer's document");
  assert.match(page, /idNumber: document\.getElementById\('custDoc'\)/, "the document is not sent");
});

await check("rehearsal (Oct 17): Pagar's function ships only what it reads; couriers by destination; photos; honest failures", async () => {
  /* 1. No repo file list under [functions] itself: it was copied into every
        function (222MB in orders-create). Only mcp and orders-create read files. */
  const toml = readFileSync(ROOT + "netlify.toml", "utf8").replace(/#.*$/gm, "");
  const globalBlock = (toml.match(/^\[functions\]\s*\n([\s\S]*?)(?=^\[)/m) || [, ""])[1];
  assert.ok(!/included_files/.test(globalBlock), "included_files is back under [functions] for every function");
  assert.match(toml, /\[functions\."orders-create"\]\s*\n\s*included_files = \["price-index\.json"\]/);
  assert.match(toml, /\[functions\."mcp"\]\s*\n\s*included_files = \[[^\]]*\*-catalog\.json/);
  /* 2. Lima is Reparto Aria only; provincias never get it. */
  const C = await import(ROOT + "couriers.js");
  assert.deepEqual(C.couriersFor("Lima").map((c) => c.id), ["aria-lima"]);
  for (const city of ["Arequipa", "Otra"]) {
    const ids = C.couriersFor(city).map((c) => c.id);
    assert.ok(ids.includes("olva") && ids.includes("shalom") && !ids.includes("aria-lima"), city + ": " + ids.join(","));
  }
  /* 3. Lines added from a product page carry the photo the checkout shows. */
  const producto = readFileSync(ROOT + "producto.html", "utf8");
  const add = producto.slice(producto.indexOf("function addCurrentToCart("), producto.indexOf("toast('Agregado al carrito.');"));
  assert.match(add, /image: p\.image/);
  /* 4. A failed Pagar keeps the summary's figure and names the failure. */
  const page = readFileSync(ROOT + "checkout.html", "utf8");
  assert.ok(!/payLabel\(latestQuote\.total_usd/.test(page), "the button falls back to the courier quote's total again");
  assert.ok(!/fmtPrimary\(latestQuote\.total_usd\)/.test(page), "the success screen shows the courier quote's total");
  assert.match(page, /El servidor de pagos no respondió \(código \$\{res\.status\}/);
  /* 5. The handler answers our own { error } whatever throws. */
  const { handler } = await import(ROOT + "netlify/functions/orders-create.js");
  const r = await handler({ httpMethod: "POST", headers: { host: "deploy-preview-1--ariashopperu.netlify.app" }, body: JSON.stringify({ items: [null, { qty: "x", priceUsd: "y" }], quote: { total_usd: 1 }, customer: { idNumber: "45678912" }, shownTotalPen: 1 }) });
  assert.ok(r.body && JSON.parse(r.body).error, "a failure without an error message");
});

await check("product pages upsell: same store and same kind of thing, sale items only, in the shopper's lane", async () => {
  const { liftDeclarations } = await import(ROOT + "scripts/lib/page-lift.mjs");
  const page = readFileSync(ROOT + "producto.html", "utf8");
  assert.ok(page.indexOf('<script src="sale-rule.js"></script>') > 0 && page.indexOf('<script src="product-type.js"></script>') > 0, "producto.html does not load the sale rule and the classifier");
  const extra = "var window = {};\n" + readFileSync(ROOT + "product-type.js", "utf8").replace(/\r\n/g, "\n") + "\n";
  const P = liftDeclarations(page, ["norm", "REL_MAX", "REL_MIN", "REL_LANES", "relLane", "relGender", "relKey", "relPick"], { extra });
  const lane = (t, dept = "") => (P.relLane({ name: t, dept }) || {}).key;
  assert.equal(lane("Adidas Samba ADV Shoes - Blush Pink"), "zapatos", "'Blush Pink' shoes read as beauty");
  assert.notEqual(lane("Women's 725 High-Rise Kick Boot Jeans"), "zapatos", "kick-boot jeans read as shoes");
  assert.notEqual(lane("AE Cap-Sleeve Button-Up Top"), "sombreros", "a cap-sleeve top read as a hat");
  assert.equal(lane("Ultimate Glamour Box Slumber Party Makeover Kit", "beauty"), "beauty");
  assert.equal(lane("AE Ford Mustang Retro Hat"), "sombreros");
  const item = (name, extra = {}) => ({ name, retailer: "americaneagle", image: "x", salePct: 40, dept: "women", ...extra });
  const anchor = item("AE On a Roll Off-the-Shoulder Sweatshirt", { salePct: 0 });
  const pool = [item("AE Boxy T-Shirt"), item("AE Hoodie", { salePct: 0 }), item("Men's AE Flex Jeans", { dept: "men" }),
    item("AE Ford Mustang Retro Hat"), item("AE Cami Top", { image: "" }), item("AE On a Roll Off-the-Shoulder Sweatshirt")];
  const picks = Array.from(P.relPick(anchor, pool, { sameStore: true, requireLane: true }), (x) => x.name);
  assert.deepEqual(picks, ["AE Boxy T-Shirt"], "the rail took a full-price, other-gender, other-lane, photo-less or same item: " + picks.join(", "));
});

await check("no function module reads import.meta: Netlify bundles .js functions to CommonJS, where it is {} (rehearsal round 2: 502 · TypeError)", () => {
  const dir = ROOT + "netlify/functions/";
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const code = readFileSync(dir + f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\bimport\.meta\b/.test(code), f + " reads import.meta -- it throws while the function loads on Netlify");
  }
});

await check("on a phone, Pagar comes after the form it depends on, and mirrors the summary (rehearsal #8)", () => {
  const page = readFileSync(ROOT + "checkout.html", "utf8");
  assert.match(page, /grid-template-areas:"product" "summary" "customer" "shipping" "destination" "payend"/, "the closing pay bar is not last on phones");
  assert.match(page, /\n  #payBtn\{ display:none; \}/, "two pay buttons on screen");
  assert.match(page, /"destination summary" "payend summary"/, "on desktop the pay bar does not close the form column");
  assert.doesNotMatch(page, /\.gridPayEnd\{ display:none; \}/, "the closing pay bar is hidden somewhere");
  assert.match(page, /<button id="payBtnEnd" type="submit"/);
  const mirror = page.slice(page.indexOf("(function mirrorPayEnd(){"), page.indexOf("})();", page.indexOf("(function mirrorPayEnd(){")));
  for (const must of ["endBtn.textContent = payBtn.textContent", "endBtn.disabled = payBtn.disabled", "endTotal.innerHTML = sumTotalEl.innerHTML"])
    assert.ok(mirror.includes(must), "the bar does not mirror: " + must);
});

await check("/carrito.html is the real cart, never a placeholder", () => {
  const page = readFileSync(ROOT + "carrito.html", "utf8");
  assert.ok(!/reconstrucci[oó]n|Vuelve pronto/i.test(page), "carrito.html is the empty placeholder again");
  assert.match(page, /location\.replace\('\/\?carrito=1'/);
  assert.match(page, /http-equiv="refresh" content="0; url=\/\?carrito=1"/);
});

/* Lucifer, #367 round 3: the header cart opened a blank body. Store rails
   added on main (Hot Topic, BoxLunch, Banana Republic, Gap, A&F, Finish
   Line) never closed their <section>, so every view after the shopfront
   was parsed INSIDE #homeView -- and showPage() hides #homeView. */
await check("no SPA view is nested inside another view (cart, results, stores ...)", () => {
  const html = readFileSync(ROOT + "index.html", "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
  const stack = [];
  const nested = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (let m; (m = tag.exec(html));) {
    const [, close, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (close) {
      const i = stack.map((e) => e.name).lastIndexOf(name);
      if (i >= 0) stack.length = i;
      continue;
    }
    if (VOID.has(name) || /\/\s*$/.test(attrs)) continue;
    const id = (/\bid="([^"]*)"/.exec(attrs) || [])[1] || "";
    const isView = /\bclass="view\b/.test(attrs) && /View$/.test(id);
    if (isView) {
      const outer = stack.filter((e) => e.view).map((e) => e.id);
      if (outer.length) nested.push(`${id} inside ${outer.join(" > ")}`);
    }
    stack.push({ name, id, view: isView });
  }
  assert.deepEqual(nested, [], "views swallowed by an unclosed tag: " + nested.join("; "));
});

await check("provincia offers Olva and Shalom only; Lima offers Reparto Aria only", async () => {
  const { couriersFor } = await import(ROOT + "couriers.js");
  assert.deepEqual(couriersFor("Arequipa").map((c) => c.id), ["olva", "shalom"]);
  assert.deepEqual(couriersFor("Lima").map((c) => c.id), ["aria-lima"]);
});

await check("the dollar total on screen carries the soles fees too (provincia, small order, express)", () => {
  const page = readFileSync(ROOT + "checkout.html", "utf8");
  assert.match(page, /const shownUsd = orderTotalUsdShown\(totals\.totalUsd, smallOrderFee \+ provFee \+ expressFee\);/);
  assert.match(page, /payBtn\.textContent = payLabel\(shownUsd, /, "Pagar label prints the dollar total without the fees");
  assert.doesNotMatch(page, /sumTotal\.innerHTML = fmtPrimary\(totals\.totalUsd\)/, "a summary total still omits the soles fees");
});

/* Danny, finding #9 (launch blocker): the declared value is the goods'
   raw US cost; printed beside the total it discloses Aria's margin. */
await check("the declared value and content description never reach the shopper's screen", () => {
  const page = readFileSync(ROOT + "checkout.html", "utf8");
  for (const id of ["valorInput", "descInput"]) {
    const at = page.indexOf(`<input id="${id}"`);
    assert.ok(at > 0, id + " is gone (the quote and the order record read it)");
    const opener = page.lastIndexOf("<div", page.lastIndexOf(`<label for="${id}"`, at));
    assert.match(page.slice(opener, opener + 12), /^<div hidden>/, id + " is visible to the shopper");
  }
  assert.doesNotMatch(page, /line\.textContent = `[^`]*\$\{fob/, "the tax tracker prints the declared value");
  const app = readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
  const bundle = readFileSync(ROOT + "build/" + app, "utf8");
  assert.doesNotMatch(bundle, /Vas en \$\$\{Math\.round\(usdSubtotal\)\}/, "the cart's tax bar prints the declared value");
  assert.match(bundle, /function healCartLineImages\(\)/, "photoless cart lines no longer recover their photo");
});

/* Finding #10 (Danny): the confirmation email is part of the payment. */
const PAID_ORDER = {
  orderId: "ARIA-20261018-5CEECF", paymentStatus: "paid", pricePenCharged: 670.55, amountCapturedPen: 670.55,
  declaredValueUsd: 141.58, taxEstimatedUsd: 0, totalUsd: 195.44,
  customer: { name: "Daniel Leon", email: "danielleon@ariashop.pe" },
  shipping: { destCity: "Arequipa", courier: { id: "olva", name: "Olva Courier" } },
  items: [{ title: "Bare Eau de Parfum", qty: 2, priceUsd: 31.82 }, { title: "6006 - Cargo Rave Pants", selectedSize: "Medium", qty: 1, priceUsd: 52 }],
};

await check("the confirmation email names the order, every line, the soles paid and what happens next -- and no margin", async () => {
  const E = await import(ROOT + "netlify/functions/_order-email.js");
  const m = E.orderConfirmationEmail(PAID_ORDER);
  assert.equal(m.to, "danielleon@ariashop.pe");
  assert.match(m.subject, /ARIA-20261018-5CEECF/);
  for (const part of [m.text, m.html]) {
    assert.match(part, /ARIA-20261018-5CEECF/);
    assert.match(part, /Bare Eau de Parfum x2/);
    assert.match(part, /6006 - Cargo Rave Pants \(talla Medium\) x1/);
    assert.match(part, /S\/ 670[.,]55/);
    assert.match(part, /Arequipa/, "no delivery estimate for the destination");
    assert.match(part, /contacto@ariashop\.pe/);
    assert.doesNotMatch(part, /141[.,]58|195[.,]44|declarad/i, "the email leaks the declared value or the dollar total");
  }
  assert.equal(E.confirmationRecipient({ customer: { email: "nope" }, buyerEmail: "ana@correo.com" }), "ana@correo.com");
  assert.equal(E.confirmationRecipient({ customer: {} }), null);
});

await check("the email is sent once per order, keyed on it, and a failure never throws into the webhook", async () => {
  const E = await import(ROOT + "netlify/functions/_order-email.js");
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ id: "em_1" }) }; };
  /* Zoho (or any SMTP) first: Aria's mail already lives there. */
  assert.equal(E.emailProvider({ SMTP_HOST: "smtp.zoho.com", SMTP_USER: "pedidos@ariashop.pe", SMTP_PASS: "x", RESEND_API_KEY: "k" }), "smtp");
  assert.equal(E.emailProvider({ RESEND_API_KEY: "k" }), "resend");
  assert.equal(E.emailProvider({ SMTP_HOST: "smtp.zoho.com" }), null, "a half-configured SMTP counts as configured");
  let made = null, mailed = null;
  const createTransport = (opts) => { made = opts; return { sendMail: async (m) => { mailed = m; return { messageId: "<m1@zoho>" }; } }; };
  const smtpEnv = { SMTP_HOST: "smtp.zoho.com", SMTP_USER: "pedidos@ariashop.pe", SMTP_PASS: "secret" };
  assert.deepEqual(await E.sendOrderConfirmation(PAID_ORDER, { env: smtpEnv, createTransport }), { sent: true, id: "<m1@zoho>" });
  assert.deepEqual([made.host, made.port, made.secure, made.auth.user], ["smtp.zoho.com", 465, true, "pedidos@ariashop.pe"]);
  assert.equal(mailed.from, "Aria <pedidos@ariashop.pe>", "Zoho only sends as the signed-in mailbox");
  assert.equal(mailed.to, "danielleon@ariashop.pe");
  assert.match(mailed.subject, /ARIA-20261018-5CEECF/);
  const smtpDown = () => ({ sendMail: async () => { throw new Error("535 Authentication Failed"); } });
  assert.deepEqual(await E.sendOrderConfirmation(PAID_ORDER, { env: smtpEnv, createTransport: smtpDown }), { sent: false, error: "535 Authentication Failed" });
  const sent = await E.sendOrderConfirmation(PAID_ORDER, { env: { RESEND_API_KEY: "re_test" }, fetchImpl: ok });
  assert.deepEqual(sent, { sent: true, id: "em_1" });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers["Idempotency-Key"], "order-confirmation/ARIA-20261018-5CEECF");
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ["danielleon@ariashop.pe"]);
  assert.equal((await E.sendOrderConfirmation(PAID_ORDER, { env: {}, fetchImpl: ok })).sent, false, "sent with no key");
  const boom = async () => { throw new Error("network down"); };
  assert.deepEqual(await E.sendOrderConfirmation(PAID_ORDER, { env: { RESEND_API_KEY: "k" }, fetchImpl: boom }), { sent: false, error: "network down" });
  const refused = async () => ({ ok: false, status: 403, json: async () => ({ message: "domain not verified" }) });
  assert.equal((await E.sendOrderConfirmation(PAID_ORDER, { env: { RESEND_API_KEY: "k" }, fetchImpl: refused })).error, "domain not verified");
});

await check("two paid events at once (session + intent) send exactly one email, from the real webhook", async () => {
  const { createHmac } = await import("node:crypto");
  const secret = "whsec_test_email";
  const prev = { ...process.env };
  Object.assign(process.env, { STRIPE_WEBHOOK_SECRET: secret, RESEND_API_KEY: "re_test" });
  delete process.env.SMTP_HOST;
  const realFetch = globalThis.fetch;
  const resendCalls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com/")) { resendCalls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ id: "em_" + resendCalls.length }) }; }
    return realFetch(url, init);
  };
  try {
    const orderId = "ARIA-20261018-0C6674";
    globalThis.__blobs.set("orders", globalThis.__blobs.get("orders") || new Map());
    globalThis.__blobs.get("orders").set(orderId, JSON.stringify({ ...PAID_ORDER, orderId, status: "pending_payment", paymentStatus: "unpaid", pricePenCharged: 222.88, amountCapturedPen: null }));
    const { handler } = await import(ROOT + "netlify/functions/stripe-webhook.js");
    const signed = (evt) => {
      const body = JSON.stringify(evt), t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
      return { httpMethod: "POST", body, headers: { "stripe-signature": `t=${t},v1=${sig}` } };
    };
    const meta = { orderId };
    const [a, b] = await Promise.all([
      handler(signed({ id: "evt_cs", type: "checkout.session.completed", created: 1, data: { object: { id: "cs_1", payment_intent: "pi_1", currency: "pen", amount_total: 22288, payment_status: "paid", metadata: meta } } })),
      handler(signed({ id: "evt_pi", type: "payment_intent.succeeded", created: 1, data: { object: { id: "pi_1", currency: "pen", amount_received: 22288, metadata: meta } } })),
    ]);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    assert.equal(resendCalls.length, 1, `sent ${resendCalls.length} emails for one payment`);
    assert.deepEqual(resendCalls[0].to, ["danielleon@ariashop.pe"]);
    const rec = JSON.parse(globalThis.__blobs.get("orders").get(orderId));
    assert.equal(rec.paymentStatus, "paid");
    assert.ok(rec.confirmationEmailSentAt, "the order does not record that its email went out");
    /* A retried event later sends nothing more. */
    await handler(signed({ id: "evt_pi_retry", type: "payment_intent.succeeded", created: 2, data: { object: { id: "pi_1", currency: "pen", amount_received: 22288, metadata: meta } } }));
    assert.equal(resendCalls.length, 1, "a retried event sent the email again");

    /* The claim store failing must not cost the email or fail the webhook
       (second proof run: paid order, no email). */
    const order2 = "ARIA-20261018-382DBD";
    globalThis.__blobs.get("orders").set(order2, JSON.stringify({ ...PAID_ORDER, orderId: order2, status: "pending_payment", paymentStatus: "unpaid", pricePenCharged: 128.15, amountCapturedPen: null }));
    globalThis.__blobsFail = "order-email-claims";
    const c = await handler(signed({ id: "evt_cs2", type: "checkout.session.completed", created: 3, data: { object: { id: "cs_2", payment_intent: "pi_2", currency: "pen", amount_total: 12815, payment_status: "paid", metadata: { orderId: order2 } } } }));
    globalThis.__blobsFail = null;
    assert.equal(c.statusCode, 200, "the webhook failed because the claim store did: " + c.body);
    assert.equal(resendCalls.length, 2, "no email when the claim store is unavailable");
    assert.ok(JSON.parse(globalThis.__blobs.get("orders").get(order2)).confirmationEmailSentAt);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]) { if (k in prev) process.env[k] = prev[k]; else delete process.env[k]; }
  }
});

await check("email-check: says why mail would fail, sends a test only to @ariashop.pe, never shows a secret", async () => {
  const { handler } = await import(ROOT + "netlify/functions/email-check.js");
  const preview = (qs) => ({ httpMethod: "GET", headers: { host: "deploy-preview-367--ariashopperu.netlify.app" }, queryStringParameters: qs });
  assert.equal((await handler({ ...preview({}), headers: { host: "ariashop.pe" } })).statusCode, 404, "email-check is reachable on production");
  const none = JSON.parse((await handler(preview({}), { env: {} })).body);
  assert.equal(none.mail.provider, null);
  assert.equal(none.claimStore, "ok");
  const env = { SMTP_HOST: "smtp.zoho.com", SMTP_USER: "pedidos@ariashop.pe", SMTP_PASS: "s3cret-pass" };
  let mailed = null;
  const okT = () => ({ verify: async () => true, sendMail: async (m) => { mailed = m; return { messageId: "<t1@zoho>" }; } });
  const r = await handler(preview({ to: "DanielLeon@ariashop.pe", send: "1" }), { env, createTransport: okT });
  const body = JSON.parse(r.body);
  assert.equal(body.mail.provider, "smtp");
  assert.equal(body.smtpLogin, "ok");
  assert.equal(body.testSend.sent, true);
  assert.equal(mailed.to, "danielleon@ariashop.pe");
  assert.doesNotMatch(r.body, /s3cret-pass/, "a secret leaked into the report");
  const badLogin = () => ({ verify: async () => { throw new Error("535 Authentication Failed"); } });
  assert.match(JSON.parse((await handler(preview({}), { env, createTransport: badLogin })).body).smtpLogin, /FAILED: 535/);
  assert.equal((await handler(preview({ to: "someone@gmail.com", send: "1" }), { env, createTransport: okT })).statusCode, 400, "the preview can mail outside ariashop.pe");
  globalThis.__blobsFail = "order-email-claims";
  assert.match(JSON.parse((await handler(preview({}), { env: {} })).body).claimStore, /FAILED/);
  globalThis.__blobsFail = null;
});

const MIN_CHECKS = 32;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
