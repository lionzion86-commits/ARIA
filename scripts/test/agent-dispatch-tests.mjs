/* ==================================================================
   COMPRADORES PHASE 2 -- LIVE DISPATCH (#443 c.6551091244 and the
   binding comments around it). Danny's test ladder, rungs 1 and 2,
   against the FAKES: no Stripe, no Lithic, no network.

     node scripts/test/agent-dispatch-tests.mjs
     DISPATCH_SHOTS=/some/dir node scripts/test/agent-dispatch-tests.mjs   (also writes the screenshots)

   @netlify/blobs is replaced by an in-memory store that implements the
   parts dispatch relies on -- etags, onlyIfNew, onlyIfMatch -- with the
   check-and-write done atomically and every call yielding first, so
   concurrent requests really interleave. Every person, email, phone and
   account number below is a TEST FIXTURE.
   ================================================================== */
import assert from "node:assert/strict";
import { register } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e && e.stack).split("\n").slice(0, process.env.DISPATCH_DEBUG ? 12 : 3).join(" | ")}`); console.log("    FAIL " + name); }
}

/* ---------------- @netlify/blobs, in memory, with etags ---------------- */
const STORES = new Map();
let etagSeq = 0;
const yieldNow = () => new Promise((r) => setTimeout(r, Math.random() * 4));
function stubStore(name) {
  if (!STORES.has(name)) STORES.set(name, new Map());
  const m = STORES.get(name);
  /* The conditional write is decided and applied in one synchronous step,
     as the Blobs server does: nothing can run between the check and the set. */
  const put = (k, str, o = {}) => {
    const cur = m.get(k);
    if (o.onlyIfNew && cur) return { modified: false };
    if (o.onlyIfMatch && (!cur || cur.etag !== o.onlyIfMatch)) return { modified: false };
    const etag = `"e${++etagSeq}"`;
    m.set(k, { v: str, etag });
    return { modified: true, etag };
  };
  return {
    async get(k, o) { await yieldNow(); const c = m.get(k); return c ? (o && o.type === "json" ? JSON.parse(c.v) : c.v) : null; },
    async getWithMetadata(k, o) { await yieldNow(); const c = m.get(k); return c ? { data: o && o.type === "json" ? JSON.parse(c.v) : c.v, etag: c.etag, metadata: {} } : null; },
    async setJSON(k, v, o) { await yieldNow(); return put(k, JSON.stringify(v), o); },
    async set(k, v, o) { await yieldNow(); return put(k, String(v), o); },
    async delete(k) { await yieldNow(); m.delete(k); },
    async list(o) { await yieldNow(); const p = (o && o.prefix) || ""; return { blobs: [...m.entries()].filter(([k]) => k.startsWith(p)).map(([key, c]) => ({ key, etag: c.etag })), directories: [] }; },
  };
}
globalThis.__dispatchTestGetStore = (n) => stubStore(typeof n === "string" ? n : n.name);
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "export const connectLambda = () => {};" +
      "export const getStore = (n) => globalThis.__dispatchTestGetStore(n);"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);
const getStore = globalThis.__dispatchTestGetStore;
const resetStores = () => STORES.clear();

/* ---------------- environment: names only, test values ---------------- */
const SECRET = "whsec_dispatch_test_fixture";
const ADMIN = "jefe@correo.test", AG1 = "compra1@correo.test", AG2 = "compra2@correo.test", AG3 = "compra3@correo.test", SHOPPER = "clienta@correo.test";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.ADMIN_EMAILS = ADMIN;
delete process.env.LITHIC_API_KEY; delete process.env.RESEND_API_KEY; delete process.env.SMTP_HOST;

const D = await import(ROOT + "assets/agent/dispatch-core.js");
const C = await import(ROOT + "assets/agent/agent-core.js");
const { dispatchEngine, casUpdate, namespaceFor } = await import(ROOT + "netlify/functions/_dispatch.js");
const CP = await import(ROOT + "netlify/functions/_card-program.js");
const { handler: webhook } = await import(ROOT + "netlify/functions/stripe-webhook.js");
const AGD = await import(ROOT + "netlify/functions/agent-dispatch.js");
const ADD = await import(ROOT + "netlify/functions/admin-dispatch.js");
const { SAMPLE_BATCH } = await import(ROOT + "assets/agent/sample-batch.js");

/* ---------------- fixtures ---------------- */
const byStore = new Map();
for (const o of SAMPLE_BATCH.orders) (byStore.get(o.store) || byStore.set(o.store, []).get(o.store)).push(o);
const PRODUCTS = [...byStore.values()].map((g) => g[0]); // real catalogue products, one per store
const STORE_PRODUCTS = [...byStore.values()];               // ...and every product of each store
const line = (o) => ({ retailer: o.storeLabel, title: o.title, priceUsd: o.priceUsd, dutiableUsd: o.priceUsd, qty: 1, image: o.image, url: o.url, selectedSize: o.selectedSize, color: o.color });
let orderSeq = 0;
/* counts: products per store, e.g. [4, 2, 1] -- a real cart with several items per store. */
function seedOrder({ stores = 1, name = "María Torres", orderId, counts = null } = {}) {
  const id = orderId || `ARIA-20261101-T${String(++orderSeq).padStart(4, "0")}`;
  const order = {
    orderId: id, createdAt: new Date().toISOString(), status: "pending_payment", paymentStatus: "unpaid", pricePenCharged: 412.3, fxRateUsed: 3.4,
    customer: { name, email: "cliente@correo.test", idNumber: "00000000", phone: "900000000" },
    shipping: { address: "Calle Prueba 123", district: "Miraflores", destCity: "Lima" },
    items: counts ? counts.flatMap((n, i) => STORE_PRODUCTS[i].slice(0, n).map(line)) : PRODUCTS.slice(0, stores).map(line),
  };
  const st = STORES.get("orders") || (getStore("orders"), STORES.get("orders"));
  st.set(id, { v: JSON.stringify(order), etag: `"e${++etagSeq}"` });
  return order;
}
const ACCOUNTS_ALL = PRODUCTS.map((o) => ({ id: o.store + "-1", store: o.store, label: o.storeLabel + " · cuenta 1", dailyCap: 5 }));
let evtSeq = 0;
function signedEvent(evt, { secret = SECRET, t = Math.floor(Date.now() / 1000), host = "localhost:8888" } = {}) {
  const body = JSON.stringify(evt);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return { httpMethod: "POST", body, headers: { "stripe-signature": `t=${t},v1=${sig}`, host } };
}
const paidEvent = (orderId, { id = "evt_test_" + (++evtSeq), type = "checkout.session.completed", amount = 41230 } = {}) => (
  type === "checkout.session.completed"
    ? { id, type, created: Math.floor(Date.now() / 1000), data: { object: { id: "cs_" + orderId, payment_intent: "pi_" + orderId, currency: "pen", amount_total: amount, payment_status: "paid", metadata: { orderId } } } }
    : { id, type, created: Math.floor(Date.now() / 1000), data: { object: { id: "pi_" + orderId, currency: "pen", amount_received: amount, metadata: { orderId } } } }
);
const online = { clockedIn: true, online: true, onBreak: null, focus: false };
const engine = (opts = {}) => dispatchEngine({ getStore, host: "localhost", ...opts });
/* Since the board (#443 c.6559624585) an order placed while NOBODY is
   online skips the ring and goes straight to the board. Tests about the
   ring itself keep one more buyer online and free, so the order rings. */
const standby = (E) => E.poll(AG3, online);
function fakeClock(start = "2026-11-01T15:00:00.000Z") {
  let t = Date.parse(start);
  const f = () => new Date(t).toISOString();
  f.advance = (sec) => { t += sec * 1000; };
  return f;
}
const SHOT = { name: "confirmacion.png", size: 2048 };
const bought = (orderId, checkoutId, num, usd, id) => ({ id: id || `ev-${checkoutId}`, type: "checkout_comprado", orderId, checkoutId, at: new Date().toISOString(), data: { retailerOrderNumber: num, chargedTotalUsd: usd, screenshot: SHOT } });

/* ================================================================== */
console.log("\n  Dispatch -- the rules (dispatch-core.js)");

await check("config defaults are Danny's numbers: S/ 1 per checkout, 30 s ring, S/ 10 minimum, S/ 2 fee, S/ 27,500 Yape cap, draft file on", () => {
  const c = D.dispatchConfig();
  assert.equal(c.payBasePen, 1); assert.equal(c.payStepPen, 0.5); assert.equal(c.payStepEvery, 2); assert.equal(c.ringSeconds, 30); assert.equal(c.cashoutMinPen, 10);
  assert.equal(c.cashoutFeePen, 2); assert.equal(c.yapeMonthlyCapPen, 27500); assert.equal(c.payoutFileDraft, true);
  assert.equal(c.potLowAlertPen, null, "no refill threshold was stated, so none is invented");
  assert.equal(D.dispatchConfig({ cashoutFeePen: 3, ringSeconds: "x" }).cashoutFeePen, 3);
  assert.equal(D.dispatchConfig({ ringSeconds: "x" }).ringSeconds, 30);
});

await check("pay ladder: 1, 2, 3, 4, 5, 9, 10, 11 products -> S/ 1, 1.50, 1.50, 2, 2, 3, 3.50, 3.50 (pay(n) = 1 + 0.5 x floor(n/2))", () => {
  const cfg = D.dispatchConfig();
  assert.deepEqual([1, 2, 3, 4, 5, 9, 10, 11].map((n) => D.payForProducts(n, cfg)), [1, 1.5, 1.5, 2, 2, 3, 3.5, 3.5]);
  assert.deepEqual([6, 7, 8].map((n) => D.payForProducts(n, cfg)), [2.5, 2.5, 3]);
  assert.equal(D.payForProducts(3, D.dispatchConfig({ payBasePen: 2, payStepPen: 1 })), 3, "the ladder is not config");
});

await check("ONE packet per store: a 3-store order with 4 / 2 / 1 items is three store checkouts with item rows, one card budget and one ALMACEN each", () => {
  const o = seedOrder({ counts: [4, 2, 1], name: "María Torres" });
  const p = D.buildPacket(o);
  assert.equal(p.checkouts.length, 3, "packets were split per item");
  assert.deepEqual(p.checkouts.map((c) => c.items.length), [4, 2, 1]);
  assert.deepEqual(p.checkouts.map((c) => c.itemCount), [4, 2, 1]);
  for (const [i, c] of p.checkouts.entries()) {
    assert.deepEqual(c.items.map((x) => x.url), STORE_PRODUCTS[i].slice(0, c.items.length).map((x) => x.url), "each row keeps its own line.url");
    assert.equal(c.budgetUsd, D.round2(c.items.reduce((t, x) => t + x.ceilingUsd, 0)), "the card is not sized to the store total");
  }
  assert.equal(new Set(p.checkouts.map((c) => c.id)).size, 3);
  assert.deepEqual(p.almacen, ["ARIASHOP María Torres", "AMEX", "8010 NW 66th Street, Miami, FL 33166", "+1 828 458 8578"]);
  /* quantity counts as products */
  const q = D.buildPacket({ orderId: "Q", customer: { name: "A" }, items: [{ retailer: "Crocs", title: "t", priceUsd: 10, qty: 3, url: "https://www.crocs.com/p/x/1.html" }] });
  assert.equal(q.checkouts[0].itemCount, 3);
  assert.equal(D.payForProducts(q.checkouts[0].itemCount), 1.5);
  /* the sandbox «Pedido de prueba» is per store too */
  const sim = D.buildPacket(ADD.sandboxOrder(3, 123456));
  assert.deepEqual(sim.checkouts.map((c) => c.items.length), [4, 2, 1]);
});

await check("pop-up shows ONE ladder total for the bundle, never the formula: 4 / 2 / 1 -> «S/ 4.50 · 3 compras · 3 tiendas»", () => {
  const cfg = D.dispatchConfig();
  const r = D.newDispatch(seedOrder({ counts: [4, 2, 1] }), { now: "2026-11-01T15:00:00.000Z" });
  D.release(r, "2026-11-01T15:00:01.000Z", cfg);
  assert.deepEqual(r.packet.checkouts.map((c) => c.payPen), [2, 1.5, 1]);
  const m = D.popupModel(r, cfg);
  assert.equal(`${m.headline} · ${m.sub}`, "S/ 4.50 · 3 compras · 3 tiendas");
  assert.ok(!/0[.,]5|por cada|floor|\+/.test(JSON.stringify({ h: m.headline, s: m.sub })), "the pop-up shows the formula");
  /* what was offered is what is paid, even if the ladder changes afterwards */
  assert.equal(D.popupModel(r, D.dispatchConfig({ payBasePen: 5 })).headline, "S/ 4.50");
});

await check("buy packet: per-store sub-checkouts, exact links, ceilings, budget, the ALMACEN block with the customer's full name", () => {
  const o = seedOrder({ stores: 3, name: "María  Torres" });
  const p = D.buildPacket(o);
  assert.equal(p.checkouts.length, 3);
  assert.deepEqual(p.almacen, ["ARIASHOP María Torres", "AMEX", "8010 NW 66th Street, Miami, FL 33166", "+1 828 458 8578"]);
  for (const [i, c] of p.checkouts.entries()) {
    assert.equal(c.items[0].url, PRODUCTS[i].url, "the exact product link is kept");
    assert.equal(c.items[0].ceilingUsd, C.ceilingUsd(PRODUCTS[i].priceUsd, 1));
    assert.equal(c.budgetUsd, c.items[0].ceilingUsd);
    assert.equal(c.state, "PENDING");
  }
  assert.equal(p.private.dni, "00000000");
  const noLink = D.buildPacket({ orderId: "X", customer: { name: "A" }, items: [{ retailer: "Crocs", title: "t", priceUsd: 10 }] });
  assert.equal(noLink.checkouts[0].items[0].url, null);
  assert.equal(noLink.checkouts[0].items[0].linkProblem, "No hay link guardado");
});

await check("pop-up copy: «Pedido de …», «S/ 1 · 1 compra · 1 tienda» and «S/ 3 · 3 compras · 3 tiendas»; no DNI, address or phone", () => {
  const cfg = D.dispatchConfig();
  const one = D.popupModel(D.newDispatch(seedOrder({ stores: 1, name: "María Torres" }), { now: "2026-11-01T15:00:00.000Z" }), cfg);
  assert.equal(`${one.header} — ${one.headline} · ${one.sub}`, "Pedido de María Torres — S/ 1 · 1 compra · 1 tienda");
  const three = D.popupModel(D.newDispatch(seedOrder({ stores: 3 }), { now: "2026-11-01T15:00:00.000Z" }), cfg);
  assert.equal(`${three.headline} · ${three.sub}`, "S/ 3 · 3 compras · 3 tiendas");
  assert.equal(three.stores.length, 3); assert.equal(three.photos.length, 3);
  const json = JSON.stringify(three);
  for (const secret of ["00000000", "900000000", "Calle Prueba", "Miraflores", "dni", "phone", "address"]) assert.ok(!json.includes(secret), "the pop-up carries " + secret);
});

await check("every transition is timestamped, and an illegal one is refused", () => {
  const r = D.newDispatch(seedOrder(), { now: "2026-11-01T15:00:00.000Z" });
  D.release(r, "2026-11-01T15:00:01.000Z", D.dispatchConfig());
  assert.equal(r.stateAt.CLAIMABLE, "2026-11-01T15:00:01.000Z");
  assert.equal(r.history.at(-1).from, "PAID");
  assert.throws(() => D.transition(r, "BOUGHT", "2026-11-01T15:00:02.000Z"), /No se puede pasar/);
});

await check("payouts: fee and net, the minimum, the balance, Yape routed to CCI near the monthly cap", () => {
  const cfg = D.dispatchConfig();
  const L = D.emptyLedger(AG1);
  L.registration = { yape: "900000001", cci: "00000000000000000001" };
  for (let i = 0; i < 30; i++) L.earnings.push({ id: "c" + i, amountPen: 1, at: "2026-11-01T15:00:00.000Z" });
  assert.match(D.cashoutQuote(L, 9, cfg, "2026-11-01T16:00:00.000Z").errors.join(), /mínimo es S\/ 10/);
  const q = D.cashoutQuote(L, 25, cfg, "2026-11-01T16:00:00.000Z");
  assert.deepEqual([q.ok, q.grossPen, q.feePen, q.netPen, q.channel], [true, 25, 2, 23, "yape"]);
  assert.match(D.cashoutQuote(L, 31, cfg, "2026-11-01T16:00:00.000Z").errors.join(), /Tu saldo es S\/ 30/);
  D.requestCashout(L, 25, cfg, "2026-11-01T16:00:00.000Z");
  assert.equal(D.balancePen(L), 5);
  L.payouts.push({ channel: "yape", requestedAt: "2026-11-01T10:00:00.000Z", netPen: 26100, grossPen: 0, feePen: 0, status: "confirmado" });
  for (let i = 0; i < 20; i++) L.earnings.push({ id: "d" + i, amountPen: 1, at: "2026-11-01T15:00:00.000Z" });
  assert.equal(D.cashoutQuote(L, 20, cfg, "2026-11-01T16:00:00.000Z").channel, "cci", "nearing the Yape cap must route to CCI");
  assert.equal(D.validateRegistration({ yape: "12345", cci: "1" }).ok, false);
  const p = { status: "solicitado", statusAt: {} };
  D.advancePayout(p, "en_lote", "t"); D.advancePayout(p, "enviado", "t");
  assert.throws(() => D.advancePayout(p, "solicitado", "t"));
  D.advancePayout(p, "confirmado", "t");
  assert.equal(p.status, "confirmado");
});

console.log("\n  Dispatch -- rung 1: a Stripe test payment to BOUGHT and paid");

let R1 = null;
await check("rung 1: webhook -> PAID + packet -> claimable and pinged -> claim + sandbox card -> retailer number -> BOUGHT -> S/ 1 earned", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const order = seedOrder({ stores: 1, name: "María Torres" });
  await standby(E);
  const res = await webhook(signedEvent(paidEvent(order.orderId)));
  assert.equal(res.statusCode, 200, res.body);
  const body = JSON.parse(res.body);
  assert.equal(body.dispatch.created, true);
  /* 1. PAID in the existing orders store, and the packet built */
  const stored = JSON.parse(STORES.get("orders").get(order.orderId).v);
  assert.equal(stored.paymentStatus, "paid");
  let rec = await E.orderRecord(order.orderId);
  assert.equal(rec.history[0].to, "PAID");
  assert.equal(rec.packet.checkouts.length, 1);
  assert.equal(rec.packet.almacen[0], "ARIASHOP María Torres");
  /* 2. claimable, and the ping reaches an online agent */
  assert.equal(rec.state, "CLAIMABLE");
  const poll = await E.poll(AG1, online);
  assert.ok(poll.ping, "no ping for an online, available agent");
  assert.equal(poll.ping.header, "Pedido de María Torres");
  assert.equal(`${poll.ping.headline} · ${poll.ping.sub}`, "S/ 1 · 1 compra · 1 tienda");
  /* 3. claim and the one-order sandbox card */
  const mine = await E.claimOrder(AG1, order.orderId);
  const card = mine.packet.checkouts[0].card;
  assert.ok(card && card.token.startsWith("fake_"), "no sandbox card at claim");
  assert.equal(card.type, "MERCHANT_LOCKED");
  assert.equal(card.spendLimitUsd, mine.packet.checkouts[0].budgetUsd, "the card is not locked to the exact amount");
  assert.equal(card.merchant, PRODUCTS[0].storeLabel);
  assert.equal(card.mode, "SANDBOX");
  assert.ok(!JSON.stringify(mine).match(/"pan"|"cvv"/), "a full card number left the server");
  /* 4. retailer number -> BOUGHT */
  const ck = mine.packet.checkouts[0];
  const ev = await E.applyEvents(AG1, [bought(order.orderId, ck.id, "CR-100", PRODUCTS[0].priceUsd)]);
  assert.deepEqual(ev.rejected, []);
  rec = await E.orderRecord(order.orderId);
  assert.equal(rec.state, "BOUGHT");
  assert.equal(rec.packet.checkouts[0].card.state, "CLOSED", "the card is not closed after capture");
  /* 5. S/ 1 earned */
  const L = await E.ledger(AG1);
  assert.equal(D.balancePen(L), 1);
  /* The existing ledger reads the real cost from the order */
  const after = JSON.parse(STORES.get("orders").get(order.orderId).v);
  assert.equal(after.actuals.precioRealPagadoUsd, PRODUCTS[0].priceUsd);
  assert.equal(after.retailerOrders[0].retailerOrderNumber, "CR-100");
  /* The board saw every state, with times */
  const b = await E.board();
  const row = b.orders.find((o) => o.orderId === order.orderId);
  assert.deepEqual(row.history.map((h) => h.to).filter((t) => t !== "CHECKOUT_BOUGHT"), ["PAID", "CLAIMABLE", "CLAIMED", "BOUGHT"]);
  assert.ok(row.history.every((h) => !Number.isNaN(Date.parse(h.at))));
  assert.equal(row.customerName, "María Torres");
  R1 = { E, order };
});

await check("rung 1: the nightly 3-way reconciliation matches the Stripe payment, the retailer number and the card charge", async () => {
  const r = await R1.E.reconcile();
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0].issues, []);
  assert.equal(r.rows[0].stripeStatus, "paid");
  assert.equal(r.rows[0].retailerOrderNumber, "CR-100");
  assert.equal(r.rows[0].cardCapturedUsd, PRODUCTS[0].priceUsd);
  assert.equal(r.payoutLedger[0].earnedPen, 1);
});

console.log("\n  Dispatch -- rung 2: sabotage");

await check("double claim: two agents at once, twenty times over -- exactly one winner each time, the other is told «taken»", async () => {
  for (let round = 0; round < 20; round++) {
    resetStores();
    const E = engine();
    await E.setAccounts(ACCOUNTS_ALL);
    const o = seedOrder({ stores: 2 });
    await E.intake({ ...o, paymentStatus: "paid" }, { eventId: "evt_dc_" + round });
    const results = await Promise.allSettled([E.claimOrder(AG1, o.orderId), E.claimOrder(AG2, o.orderId)]);
    const won = results.filter((x) => x.status === "fulfilled");
    const lost = results.filter((x) => x.status === "rejected");
    assert.equal(won.length, 1, `round ${round}: ${won.length} winners`);
    assert.equal(lost[0].reason.code, 409);
    assert.equal(lost[0].reason.taken, true);
    const rec = await E.orderRecord(o.orderId);
    assert.equal(rec.history.filter((h) => h.to === "CLAIMED").length, 1);
    /* The loser's screen: the watched order reads taken by someone else */
    const loser = won[0].value === undefined ? null : (rec.claimedBy === AG1 ? AG2 : AG1);
    const p = await E.poll(loser, { ...online, watching: o.orderId });
    assert.equal(p.watch.takenByOther, true);
    assert.equal(p.ping, null);
  }
});

await check("the same claim through the HTTP door: 200 for one, 409 { taken } for the other", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder();
  await E.intake({ ...o, paymentStatus: "paid" });
  const ctx = (email) => ({ email, role: "agent", user: { name: email } });
  const [a, b] = await Promise.all([AGD.dispatchAgentResponse(ctx(AG1), { action: "claim", orderId: o.orderId }, E), AGD.dispatchAgentResponse(ctx(AG2), { action: "claim", orderId: o.orderId }, E)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal([a, b].find((x) => x.status === 409).body.taken, true);
});

await check("float gate: float below the order -> visible FUNDS-HOLD with the shortfall and NO ping; float raised -> it rings", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  await E.program.setFloat(5);
  const o = seedOrder({ stores: 1 });
  const res = await webhook(signedEvent(paidEvent(o.orderId)));
  assert.equal(res.statusCode, 200);
  let rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "FUNDS_HOLD");
  assert.equal(rec.fundsHold.shortfallUsd, D.round2(rec.packet.budgetUsd - 5));
  assert.equal((await E.poll(AG1, online)).ping, null, "a held order pinged someone");
  const b = await E.board();
  assert.equal(b.counts.FUNDS_HOLD, 1);
  assert.equal(b.fundsHoldShortfallUsd, rec.fundsHold.shortfallUsd);
  assert.equal(b.float.availableUsd, 5);
  await E.setFakeFloat(500);
  rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "CLAIMABLE");
  assert.ok((await E.poll(AG1, online)).ping);
});

await check("float gate: outstanding released budgets count -- a second order waits until the first is bought", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o1 = seedOrder({ stores: 1 }), o2 = seedOrder({ stores: 1 });
  const need = D.buildPacket(o1).budgetUsd;
  await E.program.setFloat(need + 1); // room for one, not two
  await standby(E);
  await E.intake({ ...o1, paymentStatus: "paid", paidAt: "2026-11-01T10:00:00.000Z" });
  await E.intake({ ...o2, paymentStatus: "paid", paidAt: "2026-11-01T10:01:00.000Z" });
  assert.equal((await E.orderRecord(o1.orderId)).state, "CLAIMABLE");
  assert.equal((await E.orderRecord(o2.orderId)).state, "FUNDS_HOLD");
  const mine = await E.claimOrder(AG1, o1.orderId);
  await E.applyEvents(AG1, [bought(o1.orderId, mine.packet.checkouts[0].id, "N-1", PRODUCTS[0].priceUsd)]);
  await E.program.setFloat(need + 1); // the program topped up after the capture
  await E.tick();
  assert.equal((await E.orderRecord(o2.orderId)).state, "CLAIMABLE");
});

await check("no answer inside the ring (fake clock, 30 s) -> the sin-asignar pool, counted on the board, with the reason", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ stores: 1 });
  await E.poll(AG1, online);
  await E.intake({ ...o, paymentStatus: "paid" });
  await E.poll(AG1, online); // she sees it and does nothing
  clock.advance(29); await E.poll(AG1, online); // still online, still not taking it
  assert.equal((await E.orderRecord(o.orderId)).state, "CLAIMABLE");
  clock.advance(2); await E.tick();
  const rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "SIN_ASIGNAR");
  assert.equal(rec.unassignedReason, "Nadie lo tomó en 30 s");
  const b = await E.board();
  assert.equal(b.counts.SIN_ASIGNAR, 1);
  await E.reRingOrder(o.orderId);
  assert.equal((await E.orderRecord(o.orderId)).state, "CLAIMABLE", "Danny cannot ring it again");
});

await check("duplicate webhook delivery is acted on exactly once; a second event for the same order dispatches nothing new", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder();
  const evt = paidEvent(o.orderId, { id: "evt_dup_1" });
  const first = JSON.parse((await webhook(signedEvent(evt))).body);
  const again = JSON.parse((await webhook(signedEvent(evt))).body);
  assert.equal(first.dispatch.created, true);
  assert.equal(again.duplicate, true, "the same event id was applied twice");
  const other = JSON.parse((await webhook(signedEvent(paidEvent(o.orderId, { id: "evt_dup_2", type: "payment_intent.succeeded" })))).body);
  assert.equal(other.dispatch.duplicate, true);
  const rec = await E.orderRecord(o.orderId);
  assert.equal(rec.history.filter((h) => h.to === "PAID").length, 1);
  assert.equal(rec.history.filter((h) => h.to === "CLAIMABLE").length, 1, "rang twice");
  assert.deepEqual(rec.stripeEventIds, ["evt_dup_1", "evt_dup_2"]);
  assert.equal([...STORES.get("dispatch-sandbox-orders").keys()].length, 1);
  /* And a resent outbox event pays once */
  const mine = await E.claimOrder(AG1, o.orderId);
  const ev = bought(o.orderId, mine.packet.checkouts[0].id, "N-9", PRODUCTS[0].priceUsd, "ev-same");
  await E.applyEvents(AG1, [ev]); await E.applyEvents(AG1, [ev]);
  assert.equal((await E.ledger(AG1)).earnings.length, 1, "a resent completion paid twice");
});

await check("a bad signature is rejected (400) and nothing is dispatched; so is a stale timestamp", async () => {
  resetStores();
  const o = seedOrder();
  const bad = await webhook(signedEvent(paidEvent(o.orderId), { secret: "whsec_wrong" }));
  assert.equal(bad.statusCode, 400);
  const stale = await webhook(signedEvent(paidEvent(o.orderId), { t: Math.floor(Date.now() / 1000) - 3600 }));
  assert.equal(stale.statusCode, 400);
  assert.ok(!STORES.get("dispatch-sandbox-orders") || STORES.get("dispatch-sandbox-orders").size === 0);
  assert.equal(JSON.parse(STORES.get("orders").get(o.orderId).v).paymentStatus, "unpaid");
});

await check("a buyer on a break (Baño / Almuerzo) or in focus mode mid-checkout is not pinged; back and free, she is", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder();
  await standby(E);
  await E.intake({ ...o, paymentStatus: "paid" });
  assert.equal((await E.poll(AG1, { clockedIn: true, onBreak: "bano" })).ping, null);
  assert.equal((await E.poll(AG1, { clockedIn: true, onBreak: "almuerzo" })).ping, null);
  assert.equal((await E.poll(AG1, { clockedIn: true, focus: true })).ping, null);
  assert.equal((await E.poll(AG1, { clockedIn: false })).ping, null, "pinged while not clocked in");
  assert.ok((await E.poll(AG1, online)).ping);
  /* The broadcast list at release excluded the one on a break */
  resetStores();
  const E2 = engine();
  await E2.setAccounts(ACCOUNTS_ALL);
  await E2.poll(AG1, online); await E2.poll(AG2, { clockedIn: true, onBreak: "bano" });
  const o2 = seedOrder();
  await E2.intake({ ...o2, paymentStatus: "paid" });
  assert.deepEqual((await E2.orderRecord(o2.orderId)).pinged, [AG1]);
});

await check("go online: offline -> no ping; online -> ping; offline while clocked in keeps the shift and gets no ping; a break gets none; the board shows each state", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder();
  await standby(E);
  await E.intake({ ...o, paymentStatus: "paid" });
  assert.equal((await E.poll(AG1, { clockedIn: true, online: false })).ping, null, "pinged while offline");
  assert.equal((await E.poll(AG1, { clockedIn: true })).ping, null, "no online flag must mean offline");
  const off = await E.poll(AG1, { clockedIn: true, online: false });
  assert.equal(off.availability.reason, "fuera_de_linea");
  assert.ok((await E.poll(AG1, online)).ping, "no ping while online");
  assert.equal((await E.poll(AG1, { ...online, onBreak: "almuerzo" })).ping, null);
  await E.poll(AG2, { clockedIn: true, online: false });
  const b = await E.board();
  const by = Object.fromEntries(b.presence.map((p) => [p.agentId, p.availability.reason]));
  assert.deepEqual([by[AG1], by[AG2]], ["pausa", "fuera_de_linea"]);
  await E.poll(AG1, online);
  assert.equal((await E.board()).presence.find((p) => p.agentId === AG1).availability.ok, true);
  assert.equal(D.AVAILABILITY_LABELS.fuera_de_linea, "Fuera de línea");
});

await check("Pasar is always allowed, recorded on the order and in her history, and she is not pinged with it again", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder();
  await standby(E);
  await E.intake({ ...o, paymentStatus: "paid" });
  await E.passOrder(AG1, o.orderId);
  await E.passOrder(AG1, o.orderId);
  assert.equal((await E.ledger(AG1)).passes.length, 1);
  assert.equal((await E.orderRecord(o.orderId)).passes[0].agentId, AG1);
  assert.equal((await E.poll(AG1, online)).ping, null);
  assert.ok((await E.poll(AG2, online)).ping);
  const b = await E.board();
  assert.equal(b.passesByAgent[AG1].length, 1, "cherry-picking is not visible to Danny");
});

await check("store-account caps: a 3-store bundle goes only to a buyer with cap left in EVERY store; otherwise it waits in sin asignar", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  /* AG1 owns accounts for two of the three stores; AG2 for all three; one of AG2's is full. */
  await E.setAccounts([
    { id: "a1-0", store: PRODUCTS[0].store, label: "x", dailyCap: 3, agentId: AG1 },
    { id: "a1-1", store: PRODUCTS[1].store, label: "x", dailyCap: 3, agentId: AG1 },
    { id: "a2-0", store: PRODUCTS[0].store, label: "x", dailyCap: 3, agentId: AG2 },
    { id: "a2-1", store: PRODUCTS[1].store, label: "x", dailyCap: 3, agentId: AG2 },
    { id: "a2-2", store: PRODUCTS[2].store, label: "x", dailyCap: 0, agentId: AG2 },
  ]);
  const o = seedOrder({ stores: 3 });
  await E.poll(AG1, online); await E.poll(AG2, online);
  await E.intake({ ...o, paymentStatus: "paid" });
  assert.equal((await E.poll(AG1, online)).ping, null, "offered without cap in every store");
  assert.equal((await E.poll(AG2, online)).ping, null, "offered with one store's cap used up");
  await assert.rejects(E.claimOrder(AG1, o.orderId), /no tienen cupo/);
  clock.advance(29); await E.poll(AG1, online); await E.poll(AG2, online);
  clock.advance(2); await E.tick();
  const rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "SIN_ASIGNAR");
  assert.match(rec.unassignedReason, new RegExp(`Sin cuenta de tienda con cupo para: .*${PRODUCTS[2].storeLabel}`));
  /* Danny gives AG2 room; ring again; now it is hers to take */
  const accs = await E.accounts(); accs.find((a) => a.id === "a2-2").dailyCap = 2; await E.setAccounts(accs);
  await E.reRingOrder(o.orderId);
  assert.ok((await E.poll(AG2, online)).ping);
  const mine = await E.claimOrder(AG2, o.orderId);
  assert.deepEqual(mine.packet.checkouts.map((c) => c.accountId), ["a2-0", "a2-1", "a2-2"]);
});

await check("a partial bundle pays only its BOUGHT checkouts; the failed store is an exception with its reason and its card closes uncharged", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ stores: 3 });
  await E.intake({ ...o, paymentStatus: "paid" });
  const mine = await E.claimOrder(AG1, o.orderId);
  const [c1, c2, c3] = mine.packet.checkouts;
  const r = await E.applyEvents(AG1, [
    bought(o.orderId, c1.id, "A-1", PRODUCTS[0].priceUsd),
    { id: "ex-2", type: "checkout_excepcion", orderId: o.orderId, checkoutId: c2.id, at: new Date().toISOString(), data: { reason: "sin_stock" } },
    bought(o.orderId, c3.id, "A-3", PRODUCTS[2].priceUsd),
  ]);
  assert.deepEqual(r.rejected, []);
  const rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "PARTIAL");
  assert.equal(rec.packet.checkouts[1].reasonLabel, "Sin stock");
  assert.equal(rec.packet.checkouts[1].card.state, "CLOSED");
  assert.deepEqual(await E.program.charges(rec.packet.checkouts[1].card.token), []);
  const L = await E.ledger(AG1);
  assert.equal(L.earnings.length, 2);
  assert.equal(D.balancePen(L), 2);
  /* Over the ceiling is refused, never paid */
  resetStores();
  const E2 = engine();
  await E2.setAccounts(ACCOUNTS_ALL);
  const o2 = seedOrder();
  await E2.intake({ ...o2, paymentStatus: "paid" });
  const m2 = await E2.claimOrder(AG1, o2.orderId);
  const over = await E2.applyEvents(AG1, [bought(o2.orderId, m2.packet.checkouts[0].id, "B-1", m2.packet.checkouts[0].budgetUsd + 5)]);
  assert.equal(over.rejected[0].code, 400);
  assert.equal((await E2.ledger(AG1)).earnings.length, 0);
});

await check("ladder partial: a 4 / 2 / 1 bundle with the 2-item store failed pays S/ 2.00 + S/ 1.00 only, at BOUGHT", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ counts: [4, 2, 1] });
  await E.intake({ ...o, paymentStatus: "paid" });
  const mine = await E.claimOrder(AG1, o.orderId);
  const [c1, c2, c3] = mine.packet.checkouts;
  const sum = (c) => D.round2(c.items.reduce((t, x) => t + x.lineUsd, 0));
  await E.applyEvents(AG1, [bought(o.orderId, c1.id, "L-1", sum(c1))]);
  assert.equal(D.balancePen(await E.ledger(AG1)), 2, "the 4-product store did not pay S/ 2.00");
  /* the screenshot stays mandatory: no receipt, no BOUGHT, no pay */
  const noShot = await E.applyEvents(AG1, [{ ...bought(o.orderId, c3.id, "L-3", sum(c3), "ev-noshot"), data: { retailerOrderNumber: "L-3", chargedTotalUsd: sum(c3) } }]);
  assert.equal(noShot.rejected[0].error, "Falta la captura de la confirmación");
  await E.applyEvents(AG1, [
    { id: "ex-l2", type: "checkout_excepcion", orderId: o.orderId, checkoutId: c2.id, at: new Date().toISOString(), data: { reason: "precio_subio" } },
    bought(o.orderId, c3.id, "L-3", sum(c3)),
  ]);
  const rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "PARTIAL");
  const L = await E.ledger(AG1);
  assert.deepEqual(L.earnings.map((e) => [e.amountPen, e.items]), [[2, 4], [1, 1]]);
  assert.equal(D.balancePen(L), 3);
});

await check("cash-out: under the minimum refused; S/ 2 fee and the net correct; the request lands in Danny's queue; «generar lote» makes a DRAFT file and nothing is sent", async () => {
  resetStores();
  const E = engine();
  const ctx = { email: AG1, role: "agent", user: {} };
  const reg = await AGD.dispatchAgentResponse(ctx, { action: "register", yape: "900 000 001", cci: "00000000000000000001" }, E);
  assert.equal(reg.status, 200);
  await E.updateLedger(AG1, (L) => ({ ...L, earnings: Array.from({ length: 30 }, (_, i) => ({ id: "x" + i, orderId: "O", store: "S", customerName: "C", amountPen: 1, at: new Date().toISOString() })) }));
  const low = await AGD.dispatchAgentResponse(ctx, { action: "cashout", amountPen: 9 }, E);
  assert.equal(low.status, 400); assert.match(low.body.error, /mínimo es S\/ 10/);
  const ok = await AGD.dispatchAgentResponse(ctx, { action: "cashout", amountPen: 25 }, E);
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.payout.grossPen, ok.body.payout.feePen, ok.body.payout.netPen, ok.body.payout.status, ok.body.payout.channel], [25, 2, 23, "solicitado", "yape"]);
  assert.equal(ok.body.ledger.balancePen, 5);
  const adminCtx = { email: ADMIN, role: "admin", user: {} };
  const board = await ADD.dispatchAdminResponse(adminCtx, "GET", {}, E);
  assert.equal(board.body.payoutQueue.length, 1);
  assert.equal(board.body.payoutQueue[0].netPen, 23);
  const realFetch = globalThis.fetch; let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error("no network in this test"); };
  try {
    const batch = await ADD.dispatchAdminResponse(adminCtx, "POST", { action: "batch" }, E);
    assert.equal(batch.status, 200);
    assert.equal(batch.body.batch.draft, true); assert.equal(batch.body.batch.sent, false);
    const file = await ADD.dispatchAdminResponse(adminCtx, "GET", {}, E, { batch: batch.body.batch.id });
    assert.ok(file.csv.startsWith("﻿\"BORRADOR"), "the file is not labelled DRAFT");
    assert.match(file.csv, /"900000001"/); assert.match(file.csv, /"23\.00"/);
    assert.equal((await E.ledger(AG1)).payouts[0].status, "en_lote");
    await ADD.dispatchAdminResponse(adminCtx, "POST", { action: "batchStatus", id: batch.body.batch.id, to: "enviado" }, E);
    await ADD.dispatchAdminResponse(adminCtx, "POST", { action: "batchStatus", id: batch.body.batch.id, to: "confirmado" }, E);
    assert.equal((await E.ledger(AG1)).payouts[0].status, "confirmado");
    assert.equal(fetched, 0, "the payout path called the network");
  } finally { globalThis.fetch = realFetch; }
  await E.setConfig({ payoutFileDraft: false });
  await AGD.dispatchAgentResponse(ctx, { action: "cashout", amountPen: 10 }, E).catch(() => null);
  assert.equal((await ADD.dispatchAdminResponse(adminCtx, "POST", { action: "batch" }, E)).status, 409, "the draft flag does not gate the file");
});

await check("watchdog: CLAIMED past its window escalates once, saying what is stuck and for how long", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ name: "María Torres" });
  await E.intake({ ...o, paymentStatus: "paid" });
  await E.claimOrder(AG1, o.orderId);
  clock.advance(59 * 60); assert.equal((await E.watchdog()).escalations.length, 0);
  clock.advance(6 * 60);
  const w = await E.watchdog();
  assert.equal(w.escalations.length, 1);
  assert.equal(w.escalations[0].text, `Pedido de María Torres: lleva 1 h 5 min tomado (${AG1}) y sin compra (límite 1 h).`);
  await E.watchdog();
  assert.equal((await E.orderRecord(o.orderId)).escalations.length, 1, "escalated more than once for the same stretch");
  assert.equal((await E.board()).escalations.length, 1);
});

await check("weekly sweep: what was not cashed out goes to CCI on the configured day, once", async () => {
  resetStores();
  const clock = fakeClock("2026-11-02T15:00:00.000Z"); // a Monday in Lima
  const E = engine({ clock });
  await E.register(AG1, { yape: "900000001", cci: "00000000000000000001" });
  await E.updateLedger(AG1, (L) => ({ ...L, earnings: [{ id: "s1", amountPen: 7, at: clock() }] }));
  const s = await E.sweep();
  assert.equal(s.swept.length, 1);
  const L = await E.ledger(AG1);
  assert.deepEqual([L.payouts[0].kind, L.payouts[0].channel, L.payouts[0].netPen], ["barrido", "cci", 5]);
  assert.equal((await E.sweep()).already, true);
});

console.log("\n  Dispatch -- the board: compras que todavía hay que hacer (#443 c.6559624585)");

/* Ring an order out with nobody taking it: online buyers see it ring, the clock passes the ring. */
async function ringOut(E, clock, o, { paidAt, who = [AG1, AG2] } = {}) {
  for (const a of who) await E.poll(a, online);
  await E.intake({ ...o, paymentStatus: "paid", ...(paidAt ? { paidAt } : {}) });
  clock.advance(31);
  for (const a of who) await E.poll(a, online); // still online, nobody taps ACEPTAR
}

await check("board: an order nobody claims in the ring lands on the board for EVERY online buyer, unassigned, oldest first; offline sees no board", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const first = seedOrder({ stores: 1, name: "Ana Prueba" }), second = seedOrder({ stores: 2, name: "Bruno Prueba" });
  await ringOut(E, clock, second, { paidAt: "2026-11-01T14:58:00.000Z" });
  await ringOut(E, clock, first, { paidAt: "2026-11-01T14:50:00.000Z" });
  for (const id of [first.orderId, second.orderId]) {
    const r = await E.orderRecord(id);
    assert.equal(r.state, "SIN_ASIGNAR");
    assert.equal(r.claimedBy, null, "a board order was assigned to someone");
    assert.equal(r.unassignedReason, "Nadie lo tomó en 30 s");
  }
  for (const a of [AG1, AG2]) {
    const p = await E.poll(a, online);
    assert.equal(p.ping, null, "a board order came back as a live ping");
    assert.equal(p.board.count, 2);
    assert.equal(p.board.headline, "Hay 2 compras esperando");
    assert.deepEqual(p.board.orders.map((o) => o.header), ["Pedido de Ana Prueba", "Pedido de Bruno Prueba"], "not oldest first");
    assert.ok(p.board.orders.every((o) => o.eligible.ok));
  }
  assert.equal((await E.poll(AG3, { clockedIn: true, online: false })).board, null, "an offline buyer sees the board");
  assert.equal((await E.poll(AG3, { clockedIn: false })).board, null);
});

await check("board: an order placed while zero buyers are online goes STRAIGHT to the board (no empty ring); a buyer on a break does not count as online", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ stores: 2, name: "Carla Prueba" });
  await E.intake({ ...o, paymentStatus: "paid" });
  let r = await E.orderRecord(o.orderId);
  assert.equal(r.state, "SIN_ASIGNAR", "it rang to an empty room");
  assert.equal(r.unassignedReason, D.NOBODY_ONLINE_REASON);
  assert.deepEqual(r.pinged, []);
  assert.deepEqual(r.history.map((h) => h.to), ["PAID", "CLAIMABLE", "SIN_ASIGNAR"]);
  assert.ok(r.packet.checkouts.every((c) => typeof c.payPen === "number"), "the pay was not stamped when it was offered");
  const p = await E.poll(AG1, online);
  assert.equal(p.ping, null);
  assert.equal(p.board.count, 1);
  assert.equal(p.board.orders[0].header, "Pedido de Carla Prueba");
  /* only someone on a break: still nobody to ring */
  await E.poll(AG1, { ...online, onBreak: "bano" });
  const o2 = seedOrder({ stores: 1 });
  await E.intake({ ...o2, paymentStatus: "paid" });
  assert.equal((await E.orderRecord(o2.orderId)).state, "SIN_ASIGNAR");
  /* someone online and free: it rings as before */
  await E.poll(AG2, online);
  const o3 = seedOrder({ stores: 1 });
  await E.intake({ ...o3, paymentStatus: "paid" });
  assert.equal((await E.orderRecord(o3.orderId)).state, "CLAIMABLE");
});

await check("board grab: two buyers tap «Tomar» at once, twenty times over -- exactly one winner, the other gets 409 «Otra compradora lo tomó»; same through the HTTP door", async () => {
  for (let round = 0; round < 20; round++) {
    resetStores();
    const E = engine();
    await E.setAccounts(ACCOUNTS_ALL);
    const o = seedOrder({ stores: 2 });
    await E.intake({ ...o, paymentStatus: "paid" }); // nobody online: straight to the board
    await E.poll(AG1, online); await E.poll(AG2, online);
    const results = await Promise.allSettled([E.grabOrder(AG1, o.orderId), E.grabOrder(AG2, o.orderId)]);
    const won = results.filter((x) => x.status === "fulfilled"), lost = results.filter((x) => x.status === "rejected");
    assert.equal(won.length, 1, `round ${round}: ${won.length} winners`);
    assert.equal(lost[0].reason.code, 409);
    assert.equal(lost[0].reason.taken, true);
    assert.equal(lost[0].reason.message, "Otra compradora lo tomó");
    const rec = await E.orderRecord(o.orderId);
    assert.equal(rec.history.filter((h) => h.to === "CLAIMED").length, 1);
    const loser = rec.claimedBy === AG1 ? AG2 : AG1;
    assert.equal((await E.poll(loser, online)).board.count, 0, "the grabbed order stayed on the board");
  }
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder();
  await E.intake({ ...o, paymentStatus: "paid" });
  await E.poll(AG1, online); await E.poll(AG2, online);
  const ctx = (email) => ({ email, role: "agent", user: { name: email } });
  const [a, b] = await Promise.all([AGD.dispatchAgentResponse(ctx(AG1), { action: "grab", orderId: o.orderId }, E), AGD.dispatchAgentResponse(ctx(AG2), { action: "grab", orderId: o.orderId }, E)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const l = [a, b].find((x) => x.status === 409);
  assert.equal(l.body.taken, true);
  assert.equal(l.body.error, "Otra compradora lo tomó");
});

await check("board grab issues the cards AT the claim, never before: none while it waits, one per store checkout after, sized to its ceiling", async () => {
  resetStores();
  const calls = [];
  const base = CP.cardProgram({ env: {}, meta: getStore("dispatch-sandbox-meta") });
  const spy = { ...base, mode: base.mode, issueCard: async (x) => { calls.push(x); return base.issueCard(x); } };
  const E = engine({ card: spy });
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ counts: [4, 2, 1] });
  await E.intake({ ...o, paymentStatus: "paid" });
  await E.poll(AG1, online);
  let rec = await E.orderRecord(o.orderId);
  assert.equal(rec.state, "SIN_ASIGNAR");
  assert.ok(rec.packet.checkouts.every((c) => c.card == null && c.accountId == null), "a card or account existed while it waited on the board");
  assert.equal(calls.length, 0, "a card was issued before the grab");
  const p = await E.poll(AG1, online);
  assert.ok(!/"card"|token|last4/.test(JSON.stringify(p.board)), "card data on the board");
  const mine = await E.grabOrder(AG1, o.orderId);
  assert.equal(calls.length, 3, "not one card per store checkout");
  assert.equal(mine.packet.checkouts.length, 3, "the packet lost its per-store structure");
  assert.deepEqual(mine.packet.checkouts.map((c) => c.items.length), [4, 2, 1]);
  for (const c of mine.packet.checkouts) {
    assert.ok(c.card && c.card.token, "no card after the grab");
    assert.equal(c.card.spendLimitUsd, c.budgetUsd, "the card is not the checkout's ceiling");
    assert.equal(c.budgetUsd, D.round2(c.items.reduce((t, x) => t + x.ceilingUsd, 0)));
    assert.ok(c.accountId, "no store account reserved at the grab");
  }
  rec = await E.orderRecord(o.orderId);
  assert.ok(Date.parse(rec.packet.checkouts[0].card.issuedAt) >= Date.parse(rec.claimedAt), "card issued before the claim");
  assert.ok(mine.packet.private && mine.packet.private.dni, "the winner's focus screen lacks the customer data");
});

await check("board first: the poll after going online carries the board count and state («Hay 3 compras esperando»), separate from the live ping", async () => {
  resetStores();
  const E = engine();
  await E.setAccounts(ACCOUNTS_ALL);
  for (const n of [1, 2, 3]) { const o = seedOrder({ stores: n }); await E.intake({ ...o, paymentStatus: "paid" }); }
  const off = await E.poll(AG1, { clockedIn: true, online: false });
  assert.equal(off.board, null);
  const on = await E.poll(AG1, online);
  assert.equal(on.board.count, 3);
  assert.equal(on.board.headline, "Hay 3 compras esperando");
  assert.equal(on.ping, null, "the board was sent as a ping");
  assert.equal(D.boardHeadline(1), "Hay 1 compra esperando");
  assert.equal(D.boardHeadline(0), "No hay compras esperando");
  /* a live order rings while the board is full: it arrives as the ping, not on the board */
  const live = seedOrder({ stores: 1, name: "Pedido en vivo" });
  await E.intake({ ...live, paymentStatus: "paid" });
  const again = await E.poll(AG1, online);
  assert.equal(again.ping && again.ping.header, "Pedido de Pedido en vivo");
  assert.equal(again.board.count, 3);
});

await check("board card = the pop-up's decision layer + how long it waited; no DNI, address or phone anywhere in it", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ counts: [4, 2, 1], name: "María Torres" });
  await E.intake({ ...o, paymentStatus: "paid", paidAt: clock() });
  clock.advance(12 * 60);
  const p = await E.poll(AG1, online);
  const card = p.board.orders[0];
  assert.equal(card.header, "Pedido de María Torres");
  assert.equal(`${card.headline} · ${card.sub}`, "S/ 4.50 · 3 compras · 3 tiendas");
  assert.deepEqual(card.stores, D.buildPacket(o).checkouts.map((c) => c.storeLabel));
  assert.equal(card.photos.length, 7);
  assert.equal(card.totalUsd, D.buildPacket(o).totalUsd);
  assert.equal(card.waitingMin, 12);
  assert.equal(card.waitingText, "Esperando hace 12 min");
  const json = JSON.stringify(p.board);
  for (const s of ["00000000", "900000000", "Calle Prueba", "Miraflores", "dni", "phone", "address", "private"]) assert.ok(!json.includes(s), "the board carries " + s);
  const rec = await E.orderRecord(o.orderId);
  const pop = D.popupModel(rec, D.dispatchConfig());
  for (const k of ["header", "headline", "sub", "stores", "photos", "totalUsd", "itemText", "payPen"]) assert.deepEqual(card[k], pop[k], "the board differs from the pop-up in " + k);
});

await check("board eligibility = ping eligibility: no cap in a store, on a break, mid-checkout -> greyed with the reason and the grab refused; free -> allowed", async () => {
  resetStores();
  const E = engine();
  /* AG2 has no account for the third store: Danny's own default, cap for EVERY store in the bundle. */
  await E.setAccounts([
    { id: "s0", store: PRODUCTS[0].store, label: "x", dailyCap: 5 },
    { id: "s1", store: PRODUCTS[1].store, label: "x", dailyCap: 5 },
    { id: "a1-2", store: PRODUCTS[2].store, label: "x", dailyCap: 5, agentId: AG1 },
  ]);
  const o = seedOrder({ stores: 3 });
  await E.intake({ ...o, paymentStatus: "paid" });
  const p2 = await E.poll(AG2, online);
  const card = p2.board.orders[0];
  assert.equal(card.eligible.ok, false);
  assert.equal(card.eligible.reason, "tope");
  assert.equal(card.eligible.label, `Sin cupo en ${PRODUCTS[2].storeLabel} hoy`);
  await assert.rejects(E.grabOrder(AG2, o.orderId), (e) => e.code === 409 && e.message === `Sin cupo en ${PRODUCTS[2].storeLabel} hoy` && !e.taken);
  const brk = await E.poll(AG1, { ...online, onBreak: "almuerzo" });
  assert.equal(brk.board.orders[0].eligible.label, "Estás en pausa");
  await assert.rejects(E.grabOrder(AG1, o.orderId), /Estás en pausa/);
  const foc = await E.poll(AG1, { ...online, focus: true });
  assert.equal(foc.board.orders[0].eligible.reason, "enfocada");
  await assert.rejects(E.grabOrder(AG1, o.orderId), /Termina la compra que tienes abierta/);
  assert.equal((await E.orderRecord(o.orderId)).state, "SIN_ASIGNAR", "a refused grab changed the order");
  /* a «Pasar» on the ping does not hide it from her board */
  await E.passOrder(AG1, o.orderId);
  const free = await E.poll(AG1, online);
  assert.equal(free.board.orders[0].eligible.ok, true);
  const mine = await E.grabOrder(AG1, o.orderId);
  assert.deepEqual(mine.packet.checkouts.map((c) => c.accountId), ["s0", "s1", "a1-2"]);
  /* two store names: «Sin cupo en A y B hoy» */
  const two = D.boardEligibility({ state: "SIN_ASIGNAR", packet: D.buildPacket(seedOrder({ stores: 3 })) }, AG3, { presence: { clockedIn: true, online: true, seenAt: "2026-11-01T15:00:00.000Z" }, accounts: [{ id: "s0", store: PRODUCTS[0].store, dailyCap: 5 }], usage: {}, now: "2026-11-01T15:00:01.000Z", cfg: D.dispatchConfig() });
  assert.equal(two.label, `Sin cupo en ${PRODUCTS[1].storeLabel} y ${PRODUCTS[2].storeLabel} hoy`);
});

await check("board pay is identical to a pinged order: the same 4 / 2 / 1 cart pays S/ 4.50 either way, per checkout, at BOUGHT", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const pinged = seedOrder({ counts: [4, 2, 1], name: "Por timbre" }), boarded = seedOrder({ counts: [4, 2, 1], name: "Por tablero" });
  await E.intake({ ...boarded, paymentStatus: "paid" }); // nobody online: the board
  await E.poll(AG1, online);
  await E.intake({ ...pinged, paymentStatus: "paid" }); // she is online: it rings
  const p = await E.poll(AG1, online);
  assert.equal(p.ping.header, "Pedido de Por timbre");
  assert.equal(p.board.orders[0].header, "Pedido de Por tablero");
  assert.equal(p.board.orders[0].headline, p.ping.headline);
  assert.equal(p.board.orders[0].payPen, p.ping.payPen);
  const a = await E.claimOrder(AG1, pinged.orderId);
  const b = await E.grabOrder(AG1, boarded.orderId);
  assert.deepEqual(b.packet.checkouts.map((c) => c.payPen), a.packet.checkouts.map((c) => c.payPen));
  for (const m of [a, b]) {
    await E.applyEvents(AG1, m.packet.checkouts.map((c, i) => bought(m.orderId, c.id, "N-" + i, D.round2(c.items.reduce((t, x) => t + x.lineUsd, 0)), "ev-" + c.id)));
  }
  const L = await E.ledger(AG1);
  const per = (id) => D.round2(L.earnings.filter((e) => e.orderId === id).reduce((t, e) => t + e.amountPen, 0));
  assert.equal(per(pinged.orderId), 4.5);
  assert.equal(per(boarded.orderId), 4.5, "a board order paid differently");
  assert.equal(D.balancePen(L), 9);
});

await check("watchdog: a board order never ages out silently -- escalates at its window, again each time the wait doubles, is never archived, and stays on both boards", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const o = seedOrder({ stores: 1, name: "Olvido Prueba" });
  await E.intake({ ...o, paymentStatus: "paid", paidAt: clock() });
  clock.advance(9 * 60); assert.equal((await E.watchdog()).escalations.length, 0);
  clock.advance(2 * 60);
  const w = await E.watchdog();
  assert.equal(w.escalations.length, 1);
  assert.equal(w.escalations[0].text, "Pedido de Olvido Prueba: lleva 11 min en el tablero sin que nadie lo tome (límite 10 min).");
  await E.watchdog();
  assert.equal((await E.orderRecord(o.orderId)).escalations.length, 1, "re-escalated inside the same window");
  clock.advance(10 * 60); await E.watchdog(); // 21 min: the wait doubled
  assert.equal((await E.orderRecord(o.orderId)).escalations.length, 2);
  clock.advance(3 * 24 * 3600); await E.watchdog(); // three days later
  const rec = await E.orderRecord(o.orderId);
  assert.ok(rec, "the board order was archived or dropped");
  assert.equal(rec.state, "SIN_ASIGNAR");
  assert.equal(rec.escalations.length, 3);
  assert.ok(rec.escalations.length < 20, "one escalation per five minutes");
  const p = await E.poll(AG1, online);
  assert.equal(p.board.count, 1);
  assert.match(p.board.orders[0].waitingText, /^Esperando hace 72 h/);
  const b = await E.board();
  assert.equal(b.counts.SIN_ASIGNAR, 1);
  assert.equal(b.board.count, 1);
  assert.ok(b.board.oldestMin >= 3 * 24 * 60);
  assert.ok(b.escalations.some((e) => e.orderId === o.orderId));
});

await check("Danny's view of the same pool: count, oldest wait, who can see it; «Volver a ofrecer» rings it again and, untaken, it returns to the board", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  const o1 = seedOrder({ stores: 1 }), o2 = seedOrder({ stores: 2 });
  await E.intake({ ...o1, paymentStatus: "paid", paidAt: clock() });
  clock.advance(5 * 60);
  await E.intake({ ...o2, paymentStatus: "paid", paidAt: clock() });
  clock.advance(60);
  await E.poll(AG1, online); await E.poll(AG2, { clockedIn: true, online: false });
  let b = await E.board();
  assert.deepEqual(b.board, { count: 2, oldestMin: 6, visibleTo: 1 });
  assert.equal(b.orders.find((x) => x.orderId === o1.orderId).waitingMin, 6);
  await E.reRingOrder(o1.orderId);
  assert.equal((await E.poll(AG1, online)).ping.orderId, o1.orderId, "«Volver a ofrecer» did not ring it");
  clock.advance(31); await E.poll(AG1, online);
  assert.equal((await E.orderRecord(o1.orderId)).state, "SIN_ASIGNAR");
  b = await E.board();
  assert.equal(b.board.count, 2);
});

console.log("\n  Dispatch -- what agents see: human words, truthful presence (#443 c.6560497090, c.6560568865)");

const ENV_NAMES = /LITHIC_|DISPATCH_|STRIPE_|_KEY\b|_SECRET\b|_KEY[^a-z]|_SECRET[^a-z]/;
await check("agent-facing responses never carry env-var or config names (LITHIC_, DISPATCH_, STRIPE_, _KEY, _SECRET): every action, production off in each way, and the preview", async () => {
  const saved = { k: process.env.LITHIC_API_KEY, e: process.env.LITHIC_ENV, l: process.env.DISPATCH_LIVE };
  const ctx = { email: AG1, role: "agent", user: { name: "Rosa" } };
  const envs = [{}, { DISPATCH_LIVE: "on" }, { LITHIC_API_KEY: "test_fixture_key", LITHIC_ENV: "sandbox", DISPATCH_LIVE: "on" }, { LITHIC_API_KEY: "test_fixture_key" }];
  try {
    for (const [i, env] of envs.entries()) {
      resetStores();
      for (const k of ["LITHIC_API_KEY", "LITHIC_ENV", "DISPATCH_LIVE"]) { if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
      const P = dispatchEngine({ getStore, host: "ariashop.pe", fetchImpl: async () => { throw new Error("no network in tests"); } });
      assert.equal(P.gate.on, false, "case " + i);
      const o = seedOrder();
      for (const body of [{ action: "poll", ...online }, { action: "claim", orderId: o.orderId }, { action: "grab", orderId: o.orderId }, { action: "pass", orderId: o.orderId }, { action: "events", events: [bought(o.orderId, "x", "N", 1)] }, { action: "register", yape: "1", cci: "2" }, { action: "cashout", amountPen: 10 }, { action: "leave" }, { action: "nope" }]) {
        const r = await AGD.dispatchAgentResponse(ctx, body, P);
        assert.ok(!ENV_NAMES.test(JSON.stringify(r.body)), `case ${i} ${body.action}: ${JSON.stringify(r.body).slice(0, 160)}`);
      }
      /* Danny's board keeps the technical reason */
      const b = await ADD.dispatchAdminResponse({ email: ADMIN, role: "admin" }, "GET", {}, P);
      assert.ok(ENV_NAMES.test(JSON.stringify(b.body.gate)), "Danny lost the technical detail");
    }
    for (const k of ["LITHIC_API_KEY", "LITHIC_ENV", "DISPATCH_LIVE"]) delete process.env[k];
    resetStores();
    const E = engine();
    await E.setAccounts(ACCOUNTS_ALL);
    const o = seedOrder();
    await E.intake({ ...o, paymentStatus: "paid" });
    for (const body of [{ action: "poll", ...online }, { action: "grab", orderId: o.orderId }, { action: "grab", orderId: o.orderId }, { action: "claim", orderId: "nada" }, { action: "events", events: [{ id: "e", type: "checkout_comprado", orderId: o.orderId, checkoutId: "x" }] }, { action: "cashout", amountPen: 1 }]) {
      const r = await AGD.dispatchAgentResponse(ctx, body, E);
      assert.ok(!ENV_NAMES.test(JSON.stringify(r.body)), `preview ${body.action}: ${JSON.stringify(r.body).slice(0, 160)}`);
    }
    /* and the scrubber itself */
    assert.equal(AGD.agentSafeError(Object.assign(new Error("Despacho apagado: falta DISPATCH_LIVE=on"), { code: 503 })), AGD.AGENT_OFF_TEXT);
    assert.ok(!ENV_NAMES.test(AGD.agentSafeError(new Error("LITHIC_API_KEY rechazada"))));
  } finally {
    for (const [k, v] of [["LITHIC_API_KEY", saved.k], ["LITHIC_ENV", saved.e], ["DISPATCH_LIVE", saved.l]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});

await check("presence is a heartbeat: a buyer whose tab died is offline server-side after the window (no pings, not counted online); «leave» makes it immediate", async () => {
  resetStores();
  const clock = fakeClock();
  const E = engine({ clock });
  await E.setAccounts(ACCOUNTS_ALL);
  await E.poll(AG1, online);
  clock.advance(D.dispatchConfig().presenceTtlSeconds + 1); // her phone stopped polling
  const o = seedOrder();
  await E.intake({ ...o, paymentStatus: "paid" });
  const r = await E.orderRecord(o.orderId);
  assert.equal(r.state, "SIN_ASIGNAR", "a dead session was counted online");
  assert.deepEqual(r.pinged, []);
  assert.equal((await E.board()).presence.find((p) => p.agentId === AG1).availability.reason, "sin_senal");
  await E.poll(AG2, online);
  await E.leave(AG2);
  assert.equal((await E.board()).presence.find((p) => p.agentId === AG2).availability.reason, "fuera_de_linea");
  const o2 = seedOrder();
  await E.intake({ ...o2, paymentStatus: "paid" });
  assert.equal((await E.orderRecord(o2.orderId)).state, "SIN_ASIGNAR");
});

console.log("\n  Dispatch -- auth, quarantine, the Lithic adapter");

await check("auth: agent-dispatch 401 signed out / 403 shopper; admin-dispatch only for Danny; the sandbox simulator refuses production", async () => {
  resetStores();
  const E = engine();
  assert.equal((await AGD.dispatchAgentResponse({ email: null, role: null }, { action: "poll" }, E)).status, 401);
  assert.equal((await AGD.dispatchAgentResponse({ email: SHOPPER, role: null }, { action: "poll" }, E)).status, 403);
  assert.equal((await AGD.dispatchAgentResponse({ email: ADMIN, role: "admin" }, { action: "poll", ...online }, E)).status, 200, "Danny is on the launch roster");
  assert.equal((await ADD.dispatchAdminResponse({ email: AG1, role: "agent" }, "GET", {}, E)).status, 403);
  assert.equal((await ADD.dispatchAdminResponse({ email: null, role: null }, "GET", {}, E)).status, 401);
  const prod = dispatchEngine({ getStore, host: "ariashop.pe" });
  assert.equal((await ADD.dispatchAdminResponse({ email: ADMIN, role: "admin" }, "POST", { action: "simulate", stores: 1 }, prod)).status, 403);
  const sim = await ADD.dispatchAdminResponse({ email: ADMIN, role: "admin" }, "POST", { action: "simulate", stores: 3 }, E);
  assert.equal(sim.status, 200);
  assert.ok(!STORES.get("orders") || ![...STORES.get("orders").keys()].includes(sim.body.orderId), "the simulator wrote to the real orders store");
});

await check("quarantine: previews and localhost use «dispatch-sandbox», the production domain «dispatch» -- never the same board", async () => {
  assert.equal(namespaceFor("deploy-preview-600--ariashopperu.netlify.app"), "dispatch-sandbox");
  assert.equal(namespaceFor("localhost:8888"), "dispatch-sandbox");
  assert.equal(namespaceFor("ariashop.pe"), "dispatch");
  assert.equal(namespaceFor("www.ariashop.pe"), "dispatch");
});

console.log("\n  Dispatch -- the production switch (rung 3 only after Danny's pass)");

/* Runs the real webhook for one paid order on a host, with these env values, and reports what happened. */
async function prodRun(host, env) {
  resetStores();
  const keys = ["LITHIC_API_KEY", "LITHIC_ENV", "DISPATCH_LIVE"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  const realFetch = globalThis.fetch, lithic = [], logs = [], realLog = console.log;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (!/lithic\.com$/.test(u.hostname)) throw new Error("unexpected fetch " + url);
    lithic.push({ url: String(url), method: init.method || "GET" });
    const body = u.pathname === "/v1/balances" ? { data: [{ financial_account_type: "ISSUING", available_amount: 500000 }] } : { token: "tok_live_fixture", last_four: "1111", state: "OPEN", type: "MERCHANT_LOCKED", spend_limit: 100 };
    return { ok: true, status: 200, json: async () => body };
  };
  console.log = (...a) => { logs.push(a.join(" ")); };
  try {
    const o = seedOrder();
    const res = await webhook(signedEvent(paidEvent(o.orderId), { host }));
    const body = JSON.parse(res.body);
    const prodRecs = STORES.get("dispatch-orders"), sbxRecs = STORES.get("dispatch-sandbox-orders");
    return { status: res.statusCode, body, paid: JSON.parse(STORES.get("orders").get(o.orderId).v).paymentStatus, prod: prodRecs ? prodRecs.size : 0, sandbox: sbxRecs ? sbxRecs.size : 0, lithic, logs, orderId: o.orderId };
  } finally {
    globalThis.fetch = realFetch; console.log = realLog;
    for (const k of keys) { if (prev[k] == null) delete process.env[k]; else process.env[k] = prev[k]; }
  }
}

await check("production + no Lithic key: no dispatch, no fake card, the webhook still marks the order paid, one log line", async () => {
  const r = await prodRun("ariashop.pe", { DISPATCH_LIVE: "on" });
  assert.equal(r.status, 200); assert.equal(r.paid, "paid");
  assert.equal(r.prod, 0); assert.equal(r.sandbox, 0);
  assert.ok(!("dispatch" in r.body), "the webhook response changed while dispatch is off");
  assert.deepEqual(r.logs.filter((l) => l.startsWith("[dispatch]")), ["[dispatch] off on production: falta la tarjeta real (LITHIC_API_KEY)"]);
});

await check("production + live key but DISPATCH_LIVE unset: no dispatch", async () => {
  const r = await prodRun("ariashop.pe", { LITHIC_API_KEY: "test-key-fixture" });
  assert.equal(r.paid, "paid"); assert.equal(r.prod, 0); assert.equal(r.lithic.length, 0);
  assert.ok(r.logs.includes("[dispatch] off on production: falta DISPATCH_LIVE=on"));
});

await check("production + LITHIC_ENV=sandbox: no dispatch, even with DISPATCH_LIVE=on", async () => {
  const r = await prodRun("www.ariashop.pe", { LITHIC_API_KEY: "test-key-fixture", LITHIC_ENV: "sandbox", DISPATCH_LIVE: "on" });
  assert.equal(r.paid, "paid"); assert.equal(r.prod, 0); assert.equal(r.lithic.length, 0);
  assert.ok(r.logs.includes("[dispatch] off on production: la tarjeta es de prueba (LITHIC_ENV=sandbox)"));
});

await check("production + live key + DISPATCH_LIVE=on: dispatch runs, in the production store, against Lithic", async () => {
  const r = await prodRun("ariashop.pe", { LITHIC_API_KEY: "test-key-fixture", LITHIC_ENV: "production", DISPATCH_LIVE: "on" });
  assert.equal(r.body.dispatch.created, true);
  assert.equal(r.prod, 1); assert.equal(r.sandbox, 0);
  assert.ok(r.lithic.some((c) => c.url === "https://api.lithic.com/v1/balances"), "the float did not come from Lithic");
});

await check("preview: dispatch with the fake, in the sandbox store", async () => {
  const r = await prodRun("deploy-preview-578--ariashopperu.netlify.app", {});
  assert.equal(r.body.dispatch.created, true);
  assert.equal(r.sandbox, 1); assert.equal(r.prod, 0); assert.equal(r.lithic.length, 0);
});

await check("production switched off: the fake can never run, buyers get 503 and accrue nothing, Danny's board says why", async () => {
  resetStores();
  const prev = process.env.DISPATCH_LIVE; process.env.DISPATCH_LIVE = "on";
  try {
    const P = dispatchEngine({ getStore, host: "ariashop.pe", card: CP.fakeProgram({ meta: getStore("m") }) });
    assert.equal(P.gate.on, false);
    assert.equal(P.program.mode.source, "off", "a fake card program ran on production");
    await assert.rejects(P.program.issueCard({ checkoutId: "x", amountUsd: 1, merchant: "m" }), /Despacho apagado/);
    const o = seedOrder();
    assert.equal((await P.intake({ ...o, paymentStatus: "paid" })).off, true);
    const ctx = { email: AG1, role: "agent", user: {} };
    for (const action of ["poll", "claim", "grab", "events", "cashout"]) {
      const r = await AGD.dispatchAgentResponse(ctx, { action, orderId: o.orderId, events: [bought(o.orderId, o.orderId + "~x", "N", 1)], amountPen: 10 }, P);
      /* Off, in human words: agents never see the switch's variable names (c.6560497090). */
      assert.equal(r.status, 503, action); assert.equal(r.body.off, true, action); assert.equal(r.body.error, AGD.AGENT_OFF_TEXT, action);
    }
    assert.equal((await P.ledger(AG1)).earnings.length, 0);
    const b = await ADD.dispatchAdminResponse({ email: ADMIN, role: "admin" }, "GET", {}, P);
    assert.equal(b.body.off, true);
    assert.deepEqual(b.body.gate.reasons, ["falta la tarjeta real (LITHIC_API_KEY)"]);
  } finally { if (prev == null) delete process.env.DISPATCH_LIVE; else process.env.DISPATCH_LIVE = prev; }
});

await check("compare-and-set: forty concurrent increments on one key all land", async () => {
  resetStores();
  const st = getStore("cas-test");
  await Promise.all(Array.from({ length: 40 }, () => casUpdate(st, "n", (cur) => ({ n: ((cur && cur.n) || 0) + 1 }))));
  assert.equal((await st.get("n", { type: "json" })).n, 40);
});

await check("Lithic adapter: documented REST shapes, base URL by LITHIC_ENV, key in Authorization, no PAN kept; FAKE without a key", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const body = path === "/v1/balances" ? { data: [{ financial_account_type: "ISSUING", available_amount: 123456, currency: "USD" }] }
      : init.method === "POST" ? { token: "tok_1", last_four: "4242", state: "OPEN", type: "MERCHANT_LOCKED", spend_limit: 3299, pan: "4111111111111111", cvv: "123", exp_month: "12", exp_year: "2030" }
      : { token: "tok_1", last_four: "4242", state: JSON.parse(init.body).state, type: "MERCHANT_LOCKED", spend_limit: 3299 };
    return { ok: true, status: 200, json: async () => body };
  };
  const env = { LITHIC_API_KEY: "test-key-fixture", LITHIC_ENV: "sandbox" };
  const L = CP.lithicProgram({ env, fetchImpl });
  assert.equal(await L.availableFloatUsd(), 1234.56);
  const card = await L.issueCard({ checkoutId: "O~crocs", amountUsd: 32.99, merchant: "Crocs" });
  const post = calls.find((c) => c.init.method === "POST");
  assert.equal(post.url, "https://sandbox.lithic.com/v1/cards");
  assert.deepEqual(Object.keys(JSON.parse(post.init.body)).sort(), ["memo", "spend_limit", "spend_limit_duration", "type"]);
  assert.equal(JSON.parse(post.init.body).spend_limit, 3299);
  assert.equal(JSON.parse(post.init.body).spend_limit_duration, "TRANSACTION");
  assert.equal(JSON.parse(post.init.body).type, "MERCHANT_LOCKED");
  assert.equal(post.init.headers.Authorization, "test-key-fixture");
  assert.ok(!JSON.stringify(card).includes("4111111111111111") && !("cvv" in card), "the PAN or CVV was kept");
  assert.equal(card.last4, "4242");
  await L.setState("tok_1", "CLOSED");
  const patch = calls.find((c) => c.init.method === "PATCH");
  assert.equal(patch.url, "https://sandbox.lithic.com/v1/cards/tok_1");
  assert.equal(JSON.parse(patch.init.body).state, "CLOSED");
  assert.equal(CP.lithicBaseUrl({ LITHIC_ENV: "production" }), "https://api.lithic.com");
  assert.equal(CP.cardProgramMode({}).label, "SANDBOX");
  assert.equal(CP.cardProgramMode(env).label, "SANDBOX");
  assert.equal(CP.cardProgramMode({ LITHIC_API_KEY: "k" }).label, "LIVE");
  assert.equal(CP.cardProgram({ env: {}, meta: getStore("m") }).mode.source, "fake");
});

await check("copy guards: no emoji and no model names in the new files; secrets referenced by NAME only", () => {
  for (const f of ["assets/agent/dispatch-core.js", "netlify/functions/_dispatch.js", "netlify/functions/_card-program.js", "netlify/functions/agent-dispatch.js", "netlify/functions/admin-dispatch.js", "agente.html", "admin-agentes.html"]) {
    const t = readFileSync(ROOT + f, "utf8");
    assert.ok(!C.hasEmoji(t), f + " has an emoji");
    assert.ok(!/claude|anthropic|gpt-|openai/i.test(t), f + " names a model");
    assert.ok(!/whsec_[A-Za-z0-9]{8,}|sk_live|sk_test_[A-Za-z0-9]{8,}/.test(t), f + " holds a secret");
  }
});

/* ------------------------- in the browser ------------------------- */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const SHOTS = process.env.DISPATCH_SHOTS || null;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  /* Screenshots wait out the slide-in and clear any toast, so the picture is the settled screen. */
  const shot = async (page, name, fullPage = false) => {
    if (!SHOTS) return;
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.classList.remove("on")));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
  };
  const { createServer } = await import("node:http");
  const { join, extname } = await import("node:path");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
  const FX = 3.75;
  const handlers = {};
  for (const n of ["agent-queue", "agent-dispatch", "admin-dispatch", "admin-agents", "stripe-webhook", "auth-logout", "auth-login"]) {
    if (existsSync(ROOT + `netlify/functions/${n}.js`)) handlers[n] = (await import(ROOT + `netlify/functions/${n}.js`)).handler;
  }
  /* Sessions the real getSessionEmail reads. TEST FIXTURES. */
  const SESS = { [ADMIN]: "sess-admin", [AG1]: "sess-ag1", [AG2]: "sess-ag2" };
  const seedPeople = () => {
    const sessions = new Map(Object.entries(SESS).map(([email, sid]) => [sid, { v: JSON.stringify({ email, createdAt: new Date().toISOString() }), etag: '"s"' }]));
    STORES.set("sessions", sessions);
    STORES.set("users", new Map([
      [ADMIN, { v: JSON.stringify({ email: ADMIN, name: "Danny" }), etag: '"u"' }],
      [AG1, { v: JSON.stringify({ email: AG1, name: "Rosa", role: "agent", agentActive: true }), etag: '"u"' }],
      [AG2, { v: JSON.stringify({ email: AG2, name: "Carlos", role: "agent", agentActive: true }), etag: '"u"' }],
    ]));
  };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ compra: 3.7, venta: FX, fecha: "fixture", origen: "SUNAT" })); }
    const fn = u.pathname.startsWith("/.netlify/functions/") ? u.pathname.split("/").pop() : null;
    if (fn) {
      if (!handlers[fn]) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
      let body = ""; for await (const ch of req) body += ch;
      const out = await handlers[fn]({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(out.statusCode, out.headers || { "Content-Type": "application/json" }); return res.end(out.body || "");
    }
    let p = decodeURIComponent(u.pathname); if (p === "/agente") p = "/agente.html";
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c8d3ea"/></svg>';
  const open = async (email, { phone = true } = {}) => {
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    await ctx.addCookies([{ name: "aria_session", value: SESS[email], url: BASE }]);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.env.DISPATCH_DEBUG) { page.on("pageerror", (e) => console.log("PAGEERROR", e.stack)); page.on("console", (m) => console.log("CONSOLE", m.text())); }
    return { ctx, page, errors };
  };
  const clockIn = async (page) => {
    await page.goto(BASE + "/agente.html");
    await page.waitForSelector("#goOnline");
    await page.click("#goOnline");
    try { await page.waitForSelector("#waitHero", { timeout: 8000 }); }
    catch (e) { if (process.env.DISPATCH_DEBUG) console.log("MAIN:", (await page.textContent("main")).slice(0, 600)); throw e; }
  };
  const poke = (page) => page.evaluate(() => window.__compradores.dxPoll());
  const sendWebhook = async (orderId) => {
    const ev = signedEvent(paidEvent(orderId), { host: "127.0.0.1" });
    const r = await fetch(BASE + "/.netlify/functions/stripe-webhook", { method: "POST", headers: { "stripe-signature": ev.headers["stripe-signature"], "content-type": "application/json" }, body: ev.body });
    assert.equal(r.status, 200, await r.text());
  };
  const E = () => dispatchEngine({ getStore, host: "127.0.0.1" });

  let shared = null;
  await check("browser rung 1: Stripe event -> the pop-up on two phones -> one ACEPTAR, the other sees «taken» -> three store checkouts -> BOUGHT and S/ 3, with the admin board beside them", async () => {
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    await E().setConfig({ pollSeconds: 2 });
    const a = await open(AG1), b = await open(AG2), adm = await open(ADMIN, { phone: false });
    await clockIn(a.page); await clockIn(b.page);
    await adm.page.goto(BASE + "/admin-agentes.html");
    await adm.page.waitForSelector("#kSin");
    const order = seedOrder({ counts: [4, 2, 1], name: "María Torres" });
    await sendWebhook(order.orderId);
    await Promise.all([poke(a.page), poke(b.page)]);
    await a.page.waitForSelector("#ringPop"); await b.page.waitForSelector("#ringPop");
    assert.equal(await a.page.textContent("#ringH"), "Pedido de María Torres");
    assert.equal(await a.page.textContent("#ringPay"), "S/ 4.50");
    assert.equal(await a.page.textContent("#ringSub"), "3 compras · 3 tiendas");
    await a.page.waitForFunction(() => /S\/ \d/.test(document.getElementById("ringTotal").textContent));
    const total = await a.page.textContent("#ringTotal");
    const usdTotal = D.buildPacket(order).totalUsd;
    assert.equal(total, `$${usdTotal.toFixed(2)} · S/ ${(Math.round(usdTotal * FX * 100) / 100).toFixed(2)}`);
    const popText = await a.page.textContent("#ringPop");
    for (const s of ["00000000", "900000000", "Calle Prueba"]) assert.ok(!popText.includes(s), "the pop-up shows " + s);
    assert.equal(await a.page.locator("#ringPop .strip-photos img").count(), 7);
    assert.match(await a.page.textContent("#ringPop"), /7 artículos/);
    assert.ok(Number(await a.page.textContent("#ringCount")) <= 30);
    await shot(a.page, "1-popup-pedido-S4.50-3-compras-3-tiendas");
    await adm.page.evaluate(async () => { const r = await fetch("/.netlify/functions/admin-dispatch"); return r.ok; });
    await adm.page.waitForFunction(() => document.querySelector('.dxo [data-state="CLAIMABLE"]'), null, { timeout: 8000 });
    await a.page.click("#ringAccept");
    await a.page.waitForSelector(".cktabs");
    await poke(b.page);
    await b.page.waitForSelector("#ringTaken");
    assert.equal(await b.page.textContent("#ringTaken"), "Otra compradora lo tomó");
    await shot(b.page, "2-taken-segunda-compradora");
    await adm.page.waitForFunction(() => document.querySelector('.dxo [data-state="CLAIMED"]'), null, { timeout: 8000 });
    /* The focus screen: the only place the private fields appear */
    const focus = await a.page.textContent("main");
    assert.ok(focus.includes("00000000") && focus.includes("Calle Prueba"), "the claimed order's focus screen lacks the customer data");
    const counts = [4, 2, 1];
    for (let i = 0; i < 3; i++) {
      /* One packet per store: one row per item, each with its own link and checks; one card for the store */
      await a.page.waitForSelector(".item[data-row]");
      assert.equal(await a.page.locator(".item[data-row]").count(), counts[i], "not one row per item in the store packet");
      const hrefs = await a.page.$$eval(".item[data-row] a.btn", (as) => as.map((x) => x.getAttribute("href")));
      assert.deepEqual(hrefs, STORE_PRODUCTS[i].slice(0, counts[i]).map((x) => x.url));
      assert.equal(await a.page.locator("[data-reveal]").count(), 1, "more than one card for one store checkout");
      assert.equal(await a.page.locator("#almacenText").count(), 1);
      for (let r = 0; r < counts[i]; r++) {
        await a.page.check(`[data-rowcheck$="#${r}"][data-k="exacto"]`);
        await a.page.check(`[data-rowcheck$="#${r}"][data-k="carrito"]`);
      }
      assert.match(await a.page.textContent("#ckSummary"), new RegExp(`${counts[i]} de ${counts[i]} en el carrito`));
      if (i === 0) await shot(a.page, "1b-paquete-por-tienda-4-productos", true);
      await a.page.waitForSelector("[data-reveal]");
      await a.page.click("[data-reveal]");
      await a.page.waitForSelector(".vcard");
      assert.match(await a.page.textContent(".vcard"), /SANDBOX/);
      await a.page.click("#done");
      await a.page.waitForSelector("#cf");
      await a.page.fill("#cf [name=num]", "R-" + (i + 1));
      await a.page.fill("#cf [name=total]", String(D.round2(STORE_PRODUCTS[i].slice(0, counts[i]).reduce((t, x) => t + x.priceUsd, 0))));
      await a.page.setInputFiles("#cf [name=shot]", { name: "c.png", mimeType: "image/png", buffer: Buffer.from("89504e47", "hex") });
      await a.page.click("#cf button[type=submit]");
      await a.page.waitForTimeout(150);
    }
    try { await a.page.waitForSelector("#dxSection", { timeout: 8000 }); }
    catch (e) { if (process.env.DISPATCH_DEBUG) console.log("AFTER:", (await a.page.textContent("body")).slice(0, 1500)); throw e; }
    await a.page.evaluate(() => window.__compradores.sync());
    await a.page.waitForFunction(() => /Sincronizado/.test(document.getElementById("syncTag").textContent), null, { timeout: 8000 });
    const rec = await E().orderRecord(order.orderId);
    assert.equal(rec.state, "BOUGHT");
    assert.equal(D.balancePen(await E().ledger(AG1)), 4.5);
    await adm.page.waitForFunction(() => document.querySelector('.dxo [data-state="BOUGHT"]'), null, { timeout: 8000 });
    const hist = await adm.page.evaluate(() => [...document.querySelectorAll(".dxo.BOUGHT .tl li")].map((l) => l.textContent));
    for (const s of ["Pagado", "Sonando", "Tomado", "Comprado"]) assert.ok(hist.some((h) => h.includes(s)), "the board's timeline lacks " + s);
    await poke(a.page);
    await a.page.click('#tabs [data-tab="pagos"]');
    await a.page.waitForSelector("#dxBalance");
    assert.equal(await a.page.textContent("#dxBalance"), "S/ 4.50");
    assert.match(await a.page.textContent("main"), /4 productos[\s\S]*\+ S\/ 2\.00/);
    await a.page.evaluate(() => [...document.querySelectorAll("h2")].find((h) => /Lo que ganaste/.test(h.textContent)).scrollIntoView({ block: "center" }));
    await shot(a.page, "4b-ganancias-por-compra");
    for (const x of [a, b, adm]) assert.deepEqual(x.errors, []);
    shared = { a, b, adm };
  });

  await check("browser: Pagos -- register Yape/CCI, the fee and the net before confirming, and the request in Danny's payout queue", async () => {
    const { a, adm } = shared;
    await E().updateLedger(AG1, (L) => ({ ...L, earnings: L.earnings.concat(Array.from({ length: 17 }, (_, i) => ({ id: "earlier-" + i, orderId: "ARIA-EARLIER", store: "Crocs", customerName: "Cliente anterior", amountPen: 1, at: new Date().toISOString() }))) }));
    await poke(a.page);
    await a.page.waitForFunction(() => document.getElementById("dxBalance") && document.getElementById("dxBalance").textContent === "S/ 21.50");
    await a.page.fill("#regForm [name=yape]", "900000001");
    await a.page.fill("#regForm [name=cci]", "00000000000000000001");
    await a.page.click("#regForm button[type=submit]");
    await a.page.waitForSelector("#dxAmt");
    await a.page.fill("#dxAmt", "8");
    assert.match(await a.page.textContent("#dxQuote"), /El retiro mínimo es S\/ 10/);
    assert.equal(await a.page.isDisabled("#dxCash"), true);
    await a.page.fill("#dxAmt", "15");
    assert.equal(await a.page.textContent("#dxNet"), "S/ 13.00");
    assert.match(await a.page.textContent("#dxQuote"), /Comisión- S\/ 2\.00/);
    await shot(a.page, "4-saldo-y-retiro-comision-neto");
    await a.page.click("#dxCash");
    await a.page.waitForSelector(".sheet [data-go]");
    assert.match(await a.page.textContent(".sheet"), /Recibes\s*S\/ 13\.00/);
    await a.page.click(".sheet [data-go]");
    await a.page.waitForFunction(() => document.getElementById("dxBalance").textContent === "S/ 6.50");
    await adm.page.click('[data-tab="pagos"]');
    await adm.page.waitForSelector("#payQueue");
    const q = await adm.page.textContent("#payQueue");
    assert.match(q, /Rosa/); assert.match(q, /S\/ 13\.00/); assert.match(q, /Yape/);
    await adm.page.evaluate(() => window.scrollTo(0, 0));
    await shot(adm.page, "5-admin-cola-de-retiros", true);
  });

  await check("browser: Danny's board shows FUNDS-HOLD with the shortfall and the sin-asignar pool counted, live", async () => {
    const { adm } = shared;
    await E().setConfig({ ringSeconds: 5 });
    await E().program.setFloat(0); // nothing is free
    const held = seedOrder({ stores: 2, name: "Lucía Prueba Ramos" });
    await sendWebhook(held.orderId);
    await E().program.setFloat(D.buildPacket(seedOrder({ stores: 1 })).budgetUsd + 0.5);
    const lone = seedOrder({ stores: 1, name: "Diego Prueba Rojas" });
    await E().tick();
    await sendWebhook(lone.orderId);
    /* nobody is available: the phones are closed for this one */
    await shared.a.ctx.close(); await shared.b.ctx.close();
    await new Promise((r) => setTimeout(r, 5600));
    await E().tick();
    await adm.page.click('[data-tab="despacho"]');
    await adm.page.waitForFunction(() => document.querySelector('.dxo [data-state="SIN_ASIGNAR"]') && document.querySelector('.dxo [data-state="FUNDS_HOLD"]'), null, { timeout: 8000 });
    assert.equal(await adm.page.textContent("#kSin b"), "1");
    assert.match(await adm.page.textContent(".dxo.FUNDS_HOLD .shortfall"), /^Faltan \$\d+\.\d{2}: fondo disponible \$/);
    assert.match(await adm.page.textContent("#kFunds"), /faltan \$/);
    assert.match(await adm.page.textContent(".dxo.SIN_ASIGNAR"), /Pedido de Diego Prueba Rojas/);
    assert.match(await adm.page.textContent(".dxo.SIN_ASIGNAR"), /Nadie disponible en el timbre|Nadie lo tomó en 5 s/);
    await adm.page.evaluate(() => window.scrollTo(0, 0));
    await shot(adm.page, "3-admin-fondos-en-espera-y-sin-asignar", true);
    assert.deepEqual(adm.errors, []);
    await adm.ctx.close();
  });

  await check("browser: «Ponerse en línea» -- offline, online (green EN LÍNEA, waiting state), offline again with the shift open, paused; no DEMO and no sample list for a real agent", async () => {
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    const a = await open(AG1);
    await a.page.goto(BASE + "/agente.html");
    await a.page.waitForSelector("#goOnline");
    const noDemo = async () => {
      assert.equal(await a.page.isVisible("#demoTag"), false, "DEMO badge for a signed-in agent");
      assert.equal(await a.page.$("#demoBanner"), null);
      assert.equal(await a.page.$("[data-pick]"), null);
      assert.equal(await a.page.$(".row"), null, "a sample list for a signed-in agent");
      assert.equal(await a.page.$("#clockIn"), null, "«Marcar entrada» is still the visible action");
    };
    await noDemo();
    assert.equal(await a.page.textContent("#goOnline"), "Ponerse en línea");
    assert.equal(await a.page.textContent("#lineTag"), "FUERA DE LÍNEA");
    assert.ok(await a.page.evaluate(() => document.getElementById("goOnline").getBoundingClientRect().height >= 76));
    await shot(a.page, "7-fuera-de-linea-ponerse-en-linea");
    /* an order rings while she is offline (not clocked in): nothing */
    const o1 = seedOrder({ stores: 1 });
    await standby(E());
    await sendWebhook(o1.orderId);
    await a.page.waitForTimeout(300);
    assert.equal(await a.page.$("#ringPop"), null);
    await a.page.click("#goOnline");
    await a.page.waitForSelector("#waitHero");
    assert.equal(await a.page.textContent("#lineTag"), "EN LÍNEA");
    assert.equal(await a.page.getAttribute("#lineTag", "data-state"), "on");
    assert.ok(await a.page.evaluate(() => window.__compradores.S.day.shifts[window.__compradores.S.agentId].clockIn), "going online did not open the shift");
    await noDemo();
    await poke(a.page);
    await a.page.waitForSelector("#ringPop");
    await a.page.click("#ringPass");
    await a.page.waitForFunction(() => /Recibiendo pedidos/.test(document.getElementById("waitLine").textContent));
    await shot(a.page, "8-en-linea-esperando-pedidos");
    /* offline while clocked in: the shift stays open, no ping */
    await a.page.click("#goOffline");
    await a.page.waitForSelector("#offlineHero");
    assert.equal(await a.page.textContent("#lineTag"), "FUERA DE LÍNEA");
    assert.match(await a.page.textContent("#offlineHero"), /Tu turno sigue abierto/);
    const sh = await a.page.evaluate(() => window.__compradores.S.day.shifts[window.__compradores.S.agentId]);
    assert.ok(sh.clockIn && !sh.clockOut, "going offline ended the shift");
    const o2 = seedOrder({ stores: 1 });
    await standby(E());
    await sendWebhook(o2.orderId);
    await poke(a.page); await a.page.waitForTimeout(300);
    assert.equal(await a.page.$("#ringPop"), null, "pinged while offline and clocked in");
    /* paused */
    await a.page.click("#goOnline");
    await a.page.waitForSelector("#waitHero");
    await poke(a.page);
    await a.page.waitForSelector("#ringPop"); // the order that rang while she was offline reaches her now
    await a.page.click("#ringPass");
    await a.page.click('[data-break="almuerzo"]');
    await a.page.waitForSelector("#endBreak");
    assert.equal(await a.page.textContent("#lineTag"), "EN PAUSA");
    await poke(a.page); await a.page.waitForTimeout(300);
    assert.equal(await a.page.$("#ringPop"), null, "pinged on a break");
    await shot(a.page, "9-en-pausa");
    /* Danny's board: online / offline / paused per buyer */
    const b = await E().board();
    assert.equal(b.presence.find((p) => p.agentId === AG1).availability.reason, "pausa");
    assert.deepEqual(a.errors, []);
    await a.ctx.close();
  });

  await check("browser: a buyer on a break gets no pop-up while an order rings", async () => {
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    const a = await open(AG1);
    await clockIn(a.page);
    await a.page.click('[data-break="bano"]');
    await a.page.waitForSelector("#endBreak");
    const o = seedOrder({ stores: 1 });
    await standby(E());
    await sendWebhook(o.orderId);
    await poke(a.page); await a.page.waitForTimeout(300);
    assert.equal(await a.page.$("#ringPop"), null, "pinged on a break");
    await a.page.click("#endBreak");
    await poke(a.page);
    await a.page.waitForSelector("#ringPop");
    assert.deepEqual(a.errors, []);
    await a.ctx.close();
  });

  await check("browser: on the production domain with dispatch off, Danny's board shows «Despacho apagado» and why", async () => {
    resetStores();
    const P = dispatchEngine({ getStore, host: "ariashop.pe" });
    const boardBody = (await ADD.dispatchAdminResponse({ email: ADMIN, role: "admin" }, "GET", {}, P)).body;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route("https://ariashop.pe/**", async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === "/.netlify/functions/admin-agents") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sample: false, payPerPurchasePen: null, logins: [], board: [], accounts: [], exceptions: [] }) });
      if (u.pathname === "/.netlify/functions/admin-dispatch") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(boardBody) });
      let p = u.pathname; const f = join(ROOT, p);
      return existsSync(f) && !f.endsWith("/") ? r.fulfill({ status: 200, contentType: MIME[extname(f)] || "text/plain", body: readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
    });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("https://ariashop.pe/admin-agentes.html");
    await page.waitForSelector("#dispatchOff");
    assert.equal(await page.textContent("#dispatchOff"), "Despacho apagado: falta la tarjeta real (LITHIC_API_KEY) y falta DISPATCH_LIVE=on.");
    await shot(page, "6-produccion-despacho-apagado");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  /* The board's own screenshots go to BOARD_SHOTS (else DISPATCH_SHOTS). */
  const BSHOTS = process.env.BOARD_SHOTS || SHOTS;
  if (BSHOTS) mkdirSync(BSHOTS, { recursive: true });
  const bshot = async (target, name) => {
    if (!BSHOTS) return;
    const page = target.page ? target.page() : target;
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.classList.remove("on")));
    await page.waitForTimeout(300);
    await target.screenshot({ path: `${BSHOTS}/${name}.png` });
  };

  await check("browser board: going online, the board is the FIRST thing («Hay 3 compras esperando»), each card with the pop-up's facts and its wait; ineligible greyed with why; two «Tomar» at once -> one wins, the other sees «Otra compradora lo tomó»; Danny sees the same pool", async () => {
    resetStores(); seedPeople();
    /* Rosa (AG1) owns the only account for the third store: Carlos (AG2) has no cap there. */
    await E().setAccounts([
      { id: "s0", store: PRODUCTS[0].store, label: PRODUCTS[0].storeLabel + " · cuenta 1", dailyCap: 5 },
      { id: "s1", store: PRODUCTS[1].store, label: PRODUCTS[1].storeLabel + " · cuenta 1", dailyCap: 5 },
      { id: "r2", store: PRODUCTS[2].store, label: PRODUCTS[2].storeLabel + " · Rosa", dailyCap: 5, agentId: AG1 },
    ]);
    await E().setConfig({ pollSeconds: 2 });
    /* Three orders came in overnight with nobody online: straight to the board. */
    const t0 = Date.now();
    const oA = seedOrder({ stores: 1, name: "Ana Prueba Soto" }), oB = seedOrder({ counts: [4, 2, 1], name: "María Torres" }), oC = seedOrder({ stores: 2, name: "Bruno Prueba Díaz" });
    await E().intake({ ...oA, paymentStatus: "paid", paidAt: new Date(t0 - 47 * 60000).toISOString() });
    await E().intake({ ...oB, paymentStatus: "paid", paidAt: new Date(t0 - 21 * 60000).toISOString() });
    await E().intake({ ...oC, paymentStatus: "paid", paidAt: new Date(t0 - 6 * 60000).toISOString() });
    for (const o of [oA, oB, oC]) assert.equal((await E().orderRecord(o.orderId)).state, "SIN_ASIGNAR");

    const a = await open(AG1), b = await open(AG2), adm = await open(ADMIN, { phone: false });
    await clockIn(a.page); await clockIn(b.page);
    for (const x of [a, b]) {
      await x.page.waitForSelector("#boardHead[data-count='3']");
      assert.equal(await x.page.textContent("#boardLine"), "Hay 3 compras esperando");
      /* FIRST: the board heads the screen, above the live-ping waiting state */
      assert.equal(await x.page.evaluate(() => document.getElementById("dxSection").firstElementChild.id), "boardHead");
      const order = await x.page.evaluate(() => [...document.querySelectorAll("#dxSection > *, #boardList > *")].map((e) => e.id || e.dataset.board || e.className));
      assert.ok(order.indexOf("boardHead") < order.indexOf("waitHero"), "the board is not above the waiting state");
      assert.deepEqual(await x.page.$$eval("[data-board] [data-head]", (h) => h.map((e) => e.textContent)), ["Pedido de Ana Prueba Soto", "Pedido de María Torres", "Pedido de Bruno Prueba Díaz"], "not oldest first");
      assert.equal(await x.page.$("#ringPop"), null, "a board order rang as a live ping");
    }
    const cardB = `[data-board="${oB.orderId}"]`;
    await a.page.waitForFunction((s) => /S\/ \d/.test(document.querySelector(s + " [data-total]").textContent), cardB);
    assert.equal(await a.page.textContent(`${cardB} [data-pay]`), "S/ 4.50");
    assert.equal(await a.page.textContent(`${cardB} [data-sub]`), "3 compras · 3 tiendas");
    assert.equal(await a.page.locator(`${cardB} .strip-photos img`).count(), 7);
    assert.equal(await a.page.locator(`${cardB} .chips .pill`).count(), 3);
    const usdTotal = D.buildPacket(oB).totalUsd;
    assert.equal(await a.page.textContent(`${cardB} [data-total]`), `$${usdTotal.toFixed(2)} · S/ ${(Math.round(usdTotal * FX * 100) / 100).toFixed(2)}`);
    assert.match(await a.page.textContent(`${cardB} [data-wait]`), /^Esperando hace 2[01] min$/);
    const boardText = await a.page.textContent("#boardList");
    for (const s of ["00000000", "900000000", "Calle Prueba", "Miraflores"]) assert.ok(!boardText.includes(s), "the board shows " + s);
    /* Carlos has no cap in the third store: greyed, with why, no Tomar */
    assert.equal(await b.page.getAttribute(cardB, "class"), "card bcard off");
    assert.equal(await b.page.textContent(`${cardB} [data-why]`), `Sin cupo en ${PRODUCTS[2].storeLabel} hoy`);
    assert.equal(await b.page.$(`${cardB} [data-grab]`), null);
    await a.page.evaluate(() => window.scrollTo(0, 0));
    await bshot(a.page, "1-tablero-al-ponerse-en-linea-3-esperando");
    await bshot(a.page.locator(cardB), "2-tarjeta-de-pedido-en-el-tablero");
    await b.page.locator(cardB).scrollIntoViewIfNeeded();
    await bshot(b.page.locator(cardB), "2b-tarjeta-sin-cupo-gris");
    /* Danny: the same pool, count, age, «Volver a ofrecer» */
    await adm.page.goto(BASE + "/admin-agentes.html");
    await adm.page.waitForSelector("#kSin");
    await adm.page.waitForFunction(() => /la ven 2 en línea/.test(document.getElementById("kSinAge").textContent), null, { timeout: 8000 });
    assert.equal(await adm.page.textContent("#kSin b"), "3");
    assert.match(await adm.page.textContent("#kSinAge"), /la más antigua espera 4[78] min/);
    assert.equal(await adm.page.locator(".dxo.SIN_ASIGNAR [data-rering]").count(), 3);
    assert.deepEqual(await adm.page.$$eval(".dxo.SIN_ASIGNAR .h strong", (h) => h.map((e) => e.textContent)), ["Pedido de Ana Prueba Soto", "Pedido de María Torres", "Pedido de Bruno Prueba Díaz"]);
    assert.match(await adm.page.textContent(`.dxo.SIN_ASIGNAR[data-order="${oA.orderId}"] [data-age]`), /En el tablero · esperando 4[78] min/);
    await adm.page.evaluate(() => window.scrollTo(0, 0));
    await bshot(adm.page, "4-admin-tablero-sin-asignar");
    /* Both tap «Tomar» on Ana's order at the same moment */
    const cardA = `[data-board="${oA.orderId}"]`;
    await Promise.all([a.page.click(`${cardA} [data-grab]`), b.page.click(`${cardA} [data-grab]`)]);
    let rec = null;
    for (let i = 0; i < 80 && !(rec && rec.state === "CLAIMED"); i++) { await new Promise((r) => setTimeout(r, 100)); rec = await E().orderRecord(oA.orderId); }
    assert.equal(rec.state, "CLAIMED");
    const [win, lose] = rec.claimedBy === AG1 ? [a, b] : [b, a];
    await lose.page.waitForSelector(`${cardA} [data-taken]`);
    assert.equal(await lose.page.textContent(`${cardA} [data-taken]`), "Otra compradora lo tomó");
    await bshot(lose.page.locator(cardA), "3-otra-compradora-lo-tomo");
    await win.page.waitForSelector(`[data-bundle="${oA.orderId}"]`);
    assert.ok((await E().orderRecord(oA.orderId)).packet.checkouts.every((c) => c.card && c.card.token), "no card at the grab");
    await lose.page.waitForFunction((s) => !document.querySelector(s), cardA, { timeout: 8000 });
    await lose.page.waitForSelector("#boardHead[data-count='2']");
    assert.equal(await lose.page.textContent("#boardLine"), "Hay 2 compras esperando");
    for (const x of [a, b, adm]) assert.deepEqual(x.errors, []);
    for (const x of [a, b, adm]) await x.ctx.close();
  });

  await check("browser training story, preview sandbox: «Pedido de prueba» with nobody online -> clock in -> the board -> grab the leftover -> a live ping arrives for the second order", async () => {
    await new Promise((r) => setTimeout(r, 600)); // let polls in flight from closed phones land first
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    await E().setConfig({ pollSeconds: 2 });
    const adm = await open(ADMIN, { phone: false });
    await adm.page.goto(BASE + "/admin-agentes.html");
    await adm.page.waitForSelector("[data-sim='3']");
    /* 1. Danny places a «Pedido de prueba» while no buyer is online: it goes straight to the board */
    await adm.page.click("[data-sim='3']");
    await adm.page.waitForFunction(() => document.querySelector("#kSin b") && document.querySelector("#kSin b").textContent === "1", null, { timeout: 8000 });
    const first = (await E().records())[0];
    assert.equal(first.state, "SIN_ASIGNAR");
    assert.equal(first.unassignedReason, D.NOBODY_ONLINE_REASON);
    assert.ok(first.sandbox && first.orderId.startsWith("SBX-"));
    /* 2. She clocks in: the board first */
    const a = await open(AG1);
    await clockIn(a.page);
    await a.page.waitForSelector("#boardHead[data-count='1']");
    assert.equal(await a.page.textContent("#boardLine"), "Hay 1 compra esperando");
    assert.equal(await a.page.evaluate(() => document.getElementById("dxSection").firstElementChild.id), "boardHead");
    assert.match(await a.page.textContent(`[data-board="${first.orderId}"] .bc-top`), /SANDBOX/);
    /* 3. She grabs the leftover: hers, with its per-store packet and its cards */
    await a.page.click(`[data-board="${first.orderId}"] [data-grab]`);
    await a.page.waitForSelector(`[data-bundle="${first.orderId}"]`);
    await a.page.waitForSelector("#boardHead[data-count='0']");
    assert.equal(await a.page.textContent("#boardLine"), "No hay compras esperando");
    const mine = await E().orderRecord(first.orderId);
    assert.equal(mine.claimedBy, AG1);
    assert.deepEqual(mine.packet.checkouts.map((c) => c.items.length), [4, 2, 1]);
    assert.ok(mine.packet.checkouts.every((c) => c.card && c.card.fake && c.card.spendLimitUsd === c.budgetUsd));
    /* 4. A second «Pedido de prueba» comes in while she is online: the live ping, as built */
    await poke(a.page);
    await adm.page.click("[data-sim='1']");
    await poke(a.page);
    await a.page.waitForSelector("#ringPop", { timeout: 8000 });
    const second = (await E().records()).find((r) => r.orderId !== first.orderId);
    assert.equal(second.state, "CLAIMABLE");
    assert.equal(await a.page.getAttribute("#ringPop .ring", "data-order"), second.orderId);
    assert.equal(await a.page.textContent("#ringPay"), "S/ 1");
    await a.page.click("#ringAccept");
    await a.page.waitForSelector(".cktabs");
    const both = await E().records();
    assert.deepEqual(both.map((r) => r.claimedBy), [AG1, AG1]);
    assert.ok(both.every((r) => r.packet.checkouts.every((c) => c.card && c.card.token)));
    await adm.page.waitForFunction(() => document.querySelectorAll('.dxo [data-state="CLAIMED"]').length === 2, null, { timeout: 8000 });
    assert.equal(await adm.page.textContent("#kSin b"), "0");
    for (const x of [a, adm]) assert.deepEqual(x.errors, []);
    for (const x of [a, adm]) await x.ctx.close();
  });

  const runningIn = (page, sel) => page.evaluate((s) => {
    const root = document.querySelector(s);
    return root ? document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.target && root.contains(a.effect.target)).map((a) => a.animationName || "") : null;
  }, sel);

  await check("browser: EN LÍNEA waiting view MOVES (pulsing radar, «Esperando pedidos…»); FUERA DE LÍNEA is still; reduced motion keeps a gentle pulse", async () => {
    await new Promise((r) => setTimeout(r, 600));
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    const a = await open(AG1);
    await a.page.goto(BASE + "/agente.html");
    await a.page.waitForSelector("#offlineHero");
    assert.deepEqual(await runningIn(a.page, "#app"), [], "the offline view animates");
    await a.page.click("#goOnline");
    await a.page.waitForSelector("#waitHero .radar");
    assert.equal(await a.page.textContent("#waitHero h2"), "Esperando pedidos…");
    const names = await runningIn(a.page, "#waitHero");
    assert.ok(names.length >= 2 && names.every((n) => n === "ping"), "the radar is not pulsing: " + names);
    assert.ok(await a.page.evaluate(() => { const r = document.querySelector("#waitHero .radar").getBoundingClientRect(); return r.width >= 100 && r.top < innerHeight; }), "the radar is not on screen");
    /* Two frames of the moving radar (the poll may repaint the section: clip by position, not by node) */
    if (BSHOTS) {
      await a.page.evaluate(() => document.getElementById("waitHero").scrollIntoView({ block: "center" }));
      await a.page.waitForTimeout(400);
      const box = await a.page.evaluate(() => { const r = document.getElementById("waitHero").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      await a.page.screenshot({ path: `${BSHOTS}/5a-en-linea-radar-cuadro-1.png`, clip: box });
      await a.page.waitForTimeout(700);
      await a.page.screenshot({ path: `${BSHOTS}/5b-en-linea-radar-cuadro-2.png`, clip: box });
    }
    await a.page.click("#goOffline");
    await a.page.waitForSelector("#offlineHero");
    assert.deepEqual(await runningIn(a.page, "#app"), [], "the offline view animates");
    await a.ctx.close();
    /* reduced motion: still alive, gently */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addCookies([{ name: "aria_session", value: SESS[AG2], url: BASE }]);
    const p = await ctx.newPage();
    await p.goto(BASE + "/agente.html");
    await p.click("#goOnline");
    await p.waitForSelector("#waitHero .radar");
    const soft = await runningIn(p, "#waitHero");
    assert.ok(soft.length >= 1 && soft.every((n) => n === "breathe"), "reduced motion stopped the pulse: " + soft);
    await ctx.close();
  });

  await check("browser: a dead session heals -- online, tab killed, heartbeat lapses: no pings while dead; reopened, she is FUERA DE LÍNEA with a working «Ponerse en línea»", async () => {
    await new Promise((r) => setTimeout(r, 600));
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addCookies([{ name: "aria_session", value: SESS[AG1], url: BASE }]);
    let page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await clockIn(page);
    await poke(page);
    assert.equal(await page.textContent("#lineTag"), "EN LÍNEA");
    /* the tab dies with no goodbye (crash, battery): no beacon reaches the server */
    await ctx.route("**/agent-dispatch", (r) => r.abort());
    await page.close({ runBeforeUnload: false });
    await new Promise((r) => setTimeout(r, 300));
    await ctx.unroute("**/agent-dispatch");
    /* two minutes pass: the server's presence and the phone's heartbeat are that old */
    const ago = new Date(Date.now() - 120000).toISOString();
    const pres = STORES.get("dispatch-sandbox-agents");
    const pk = "presence/" + AG1;
    pres.set(pk, { v: JSON.stringify({ ...JSON.parse(pres.get(pk).v), online: true, seenAt: ago }), etag: '"aged"' });
    assert.equal((await E().board()).presence.find((x) => x.agentId === AG1).availability.reason, "sin_senal", "the server still thinks she is online");
    const o = seedOrder({ stores: 1, name: "Mientras dormía" });
    await sendWebhook(o.orderId);
    const rec = await E().orderRecord(o.orderId);
    assert.equal(rec.state, "SIN_ASIGNAR", "a dead session was pinged / counted online");
    assert.deepEqual(rec.pinged, []);
    const fix = await ctx.newPage();
    await fix.goto(BASE + "/no-existe");
    await fix.evaluate((t) => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("aria-compradores-live-")) { const d = JSON.parse(localStorage.getItem(k)); d.lastBeatAt = t; localStorage.setItem(k, JSON.stringify(d)); } } }, ago);
    await fix.close();
    /* she opens the app again (her session cookie is still good) */
    page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/agente.html");
    await page.waitForSelector("#offlineHero");
    assert.equal(await page.textContent("#lineTag"), "FUERA DE LÍNEA");
    assert.match(await page.textContent("#offlineHero"), /Tu sesión anterior se cerró sola/);
    assert.equal(await page.isEnabled("#goOnline"), true);
    const st = await page.evaluate(() => { const { S } = window.__compradores; return { online: S.day.dispatchOnline, shift: S.day.shifts[S.agentId] || null, past: (S.day.pastShifts || []).length }; });
    assert.equal(st.online, false); assert.equal(st.shift, null, "the dead shift is still open"); assert.equal(st.past, 1);
    await page.click("#goOnline");
    await page.waitForSelector("#waitHero");
    assert.equal(await page.textContent("#lineTag"), "EN LÍNEA");
    await poke(page);
    await page.waitForSelector("#boardHead[data-count='1']");
    assert.equal((await E().board()).presence.find((x) => x.agentId === AG1).availability.ok, true, "header and server disagree");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check("browser: Cerrar sesión is real -- turno, Terminar turno, Cerrar sesión: login screen, server session gone, phone state cleared, back button does not restore it", async () => {
    await new Promise((r) => setTimeout(r, 600));
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    const a = await open(AG1);
    await clockIn(a.page);
    await poke(a.page);
    /* Terminar turno from the header menu: still signed in, on Fin de turno */
    await a.page.click("#menuBtn");
    await a.page.waitForSelector(".sheet [data-signout]");
    await a.page.click(".sheet [data-end]");
    await a.page.click(".sheet [data-out]");
    await a.page.waitForSelector(".summary-h");
    assert.equal(await a.page.textContent(".summary-h h1"), "Fin de turno");
    assert.ok(STORES.get("sessions").has(SESS[AG1]), "Terminar turno ended the session");
    await a.page.evaluate(() => window.__compradores.sync());
    await a.page.waitForFunction(() => /Sincronizado/.test(document.getElementById("syncTag").textContent), null, { timeout: 8000 });
    await bshot(a.page, "6a-fin-de-turno-con-cerrar-sesion");
    await a.page.click("#signOut");
    await a.page.waitForSelector("#login", { timeout: 8000 });
    await a.page.evaluate(() => document.getElementById("login").scrollIntoView({ block: "center" }));
    await bshot(a.page, "6b-login-tras-cerrar-sesion");
    assert.equal(STORES.get("sessions").has(SESS[AG1]), false, "the server session survived");
    assert.equal((await a.ctx.cookies()).filter((c) => c.name === "aria_session" && c.value).length, 0, "the session cookie survived");
    const keys = await a.page.evaluate(() => Object.keys(localStorage));
    assert.deepEqual(keys.filter((k) => k.startsWith("aria-compradores-live-") || k === "aria-compradores-last-v1"), [], "agent state left on the phone");
    /* Her photos (the worker's image cache) are gone; the shell cache is the public page's own code, refilled by any visit. */
    assert.deepEqual(await a.page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("aria-agente-img"))), [], "the worker cache kept her photos");
    assert.equal(await a.page.isVisible("#menuBtn"), false);
    assert.equal((await E().board()).presence.find((x) => x.agentId === AG1).availability.ok, false);
    /* the back button: nothing comes back */
    await a.page.goBack().catch(() => null);
    await a.page.goForward().catch(() => null);
    await a.page.goto(BASE + "/agente.html");
    await a.page.waitForSelector("#login");
    assert.equal(await a.page.$("#lineTag:not([hidden])"), null);
    assert.equal(await a.page.textContent("#whoTop"), "");
    assert.deepEqual(a.errors, []);
    await a.ctx.close();
  });

  await check("browser: Cerrar sesión with items not synced warns, can sync first, and if they still cannot go keeps them on the phone under her name, sent at her next sign-in", async () => {
    await new Promise((r) => setTimeout(r, 600));
    resetStores(); seedPeople();
    await E().setAccounts(ACCOUNTS_ALL);
    const a = await open(AG1);
    await clockIn(a.page);
    await a.page.route("**/.netlify/functions/agent-queue", (r) => r.request().method() === "POST" ? r.fulfill({ status: 503, body: "{}" }) : r.continue());
    const agentId = await a.page.evaluate(() => window.__compradores.S.agentId);
    await a.page.click("#menuBtn"); await a.page.click(".sheet [data-end]"); await a.page.click(".sheet [data-out]");
    await a.page.waitForSelector("#signOut");
    await a.page.click("#signOut");
    await a.page.waitForSelector(".sheet [data-sync]");
    assert.match(await a.page.textContent("#soPending"), /Tienes 1 por sincronizar/);
    await a.page.click(".sheet [data-sync]");
    await a.page.waitForFunction(() => /Todavía quedan 1/.test(document.getElementById("soPending").textContent));
    await a.page.click(".sheet [data-anyway]");
    await a.page.waitForSelector("#login");
    const stash = await a.page.evaluate((id) => JSON.parse(localStorage.getItem("aria-compradores-pending-" + id) || "null"), agentId);
    assert.equal(stash.length, 1); assert.equal(stash[0].type, "salida");
    assert.equal(STORES.get("sessions").has(SESS[AG1]), false);
    /* next sign-in: the queued item goes */
    await a.page.unroute("**/.netlify/functions/agent-queue");
    seedPeople();
    await a.ctx.addCookies([{ name: "aria_session", value: SESS[AG1], url: BASE }]);
    await a.page.goto(BASE + "/agente.html");
    await a.page.waitForSelector("#goOnline");
    await a.page.waitForFunction(() => /Sincronizado/.test(document.getElementById("syncTag").textContent), null, { timeout: 8000 });
    assert.equal(await a.page.evaluate((id) => localStorage.getItem("aria-compradores-pending-" + id), agentId), null);
    assert.deepEqual(a.errors, []);
    await a.ctx.close();
  });

  await check("browser: production with dispatch off, the AGENT sees human words («aún no está activado»), never a variable name; Danny's board keeps the detail", async () => {
    await new Promise((r) => setTimeout(r, 600));
    resetStores(); seedPeople();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies([{ name: "aria_session", value: SESS[AG1], url: "https://ariashop.pe" }]);
    await ctx.route(/^https?:\/\/(?!ariashop\.pe)/, (r) => r.abort());
    await ctx.route("https://ariashop.pe/**", async (r) => {
      const u = new URL(r.request().url());
      const fn = u.pathname.startsWith("/.netlify/functions/") ? u.pathname.split("/").pop() : null;
      if (fn === "exchange-rate") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ compra: 3.7, venta: FX, fecha: "fixture", origen: "SUNAT" }) });
      if (fn) {
        if (!handlers[fn]) return r.fulfill({ status: 404, body: "{}" });
        const h = await r.request().allHeaders();
        const out = await handlers[fn]({ httpMethod: r.request().method(), headers: { ...h, host: "ariashop.pe" }, body: r.request().postData() || "", queryStringParameters: Object.fromEntries(u.searchParams) });
        return r.fulfill({ status: out.statusCode, headers: out.headers || { "Content-Type": "application/json" }, body: out.body || "" });
      }
      const f = join(ROOT, u.pathname);
      return existsSync(f) && !f.endsWith("/") ? r.fulfill({ status: 200, contentType: MIME[extname(f)] || "text/plain", body: readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
    });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const bodies = [];
    page.on("response", async (res) => { if (res.url().includes("/.netlify/functions/agent-")) bodies.push(await res.text().catch(() => "")); });
    await page.goto("https://ariashop.pe/agente.html");
    await page.waitForSelector("#goOnline");
    await page.click("#goOnline");
    await page.waitForSelector("#dxOff");
    assert.equal(await page.textContent("#dxOff"), "El despacho en vivo aún no está activado. Tu turno está abierto; los pedidos en vivo llegan cuando se active.");
    const text = await page.evaluate(() => document.body.innerText);
    assert.ok(!ENV_NAMES.test(text), "the agent's screen shows a variable name");
    assert.ok(!/Despacho apagado|LITHIC|Lithic/i.test(text));
    assert.ok(bodies.length >= 2 && bodies.every((b) => !ENV_NAMES.test(b)), "an agent response carried a variable name");
    await bshot(page, "7-despacho-no-activado-agente");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await browser.close();
  srv.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
process.exit(0);
