/* ==================================================================
   MI CUENTA -- the member account area's rules (#443, member-account-
   area brief + addenda, 2026-10-22).

   In-memory stand-ins for Netlify Blobs; every person, email, address
   and order here is a TEST FIXTURE.

     node scripts/test/account-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import jpegjs from "jpeg-js";
import * as A from "../../netlify/functions/_account.js";
import * as D from "../../netlify/functions/_dni-docs.js";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}
function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}

/* TEST FIXTURES */
const ME = "socia@correo.test";
const OTHER = "otra@correo.test";
const order = (id, over = {}) => ({
  orderId: id, createdAt: "2026-10-20T15:00:00.000Z", status: "confirmed", paymentStatus: "paid",
  buyerEmail: ME, customer: { name: "Socia Prueba", email: ME, phone: "999000111" },
  shipping: { addrLine: "Calle Prueba 123", addrDistrict: "Miraflores", destCity: "Lima" },
  items: [{ title: "Fixture Doll", brand: "Fixture", priceUsd: 20, qty: 2, image: "https://img.example.test/doll.jpg", selectedSize: null }],
  orderTotalPen: 250.5, pricePenCharged: 230.5, walletAppliedPen: 20,
  /* Fields the account must never show. */
  courierTotalUsd: 41.2, gatewayFeeEstimatePen: 9.1, actuals: { precioRealPagadoUsd: 30, notas: "operator note" },
  ...over,
});
function stores({ orders = {}, shipments = {}, wallet = {}, carts = {}, users = {}, packs = {} } = {}) {
  return {
    orders: memStore(orders), shipments: memStore(shipments), wallet: memStore(wallet),
    carts: memStore(carts), users: memStore(users), packs: memStore(packs),
  };
}

console.log("\n  Mi cuenta -- whose orders");

await check("orders attach by email: signed-in orders and guest orders with the same email; never someone else's", async () => {
  const S = stores({ orders: {
    "ARIA-20261020-AAA111": order("ARIA-20261020-AAA111"),
    "ARIA-20261019-BBB222": order("ARIA-20261019-BBB222", { buyerEmail: null, customer: { name: "Socia", email: "  Socia@Correo.TEST " }, createdAt: "2026-10-19T10:00:00.000Z" }),
    "ARIA-20261021-CCC333": order("ARIA-20261021-CCC333", { buyerEmail: OTHER, customer: { email: ME } }),
    "ARIA-20261018-DDD444": order("ARIA-20261018-DDD444", { buyerEmail: null, customer: { email: OTHER } }),
    "counter:2026-10-20": { count: 3 },
  } });
  const o = await A.accountOrders(S, ME);
  assert.deepEqual(o.map((x) => x.orderId), ["ARIA-20261020-AAA111", "ARIA-20261019-BBB222"]);
  assert.equal(o[0].via, "account");
  assert.equal(o[1].via, "email");
  assert.deepEqual(await A.accountOrders(S, null), []);
});

await check("an order view carries no cost, margin, courier or operator field; a guest-attached order carries no address", async () => {
  const S = stores({ orders: {
    "ARIA-20261020-AAA111": order("ARIA-20261020-AAA111", { recipient: { name: "Recibe Prueba", idNumber: "12345678", relationship: "Hermana" } }),
    "ARIA-20261019-BBB222": order("ARIA-20261019-BBB222", { buyerEmail: null, customer: { email: ME } }),
  } });
  const [mine, guest] = await A.accountOrders(S, ME);
  const text = JSON.stringify(mine);
  for (const bad of ["courierTotalUsd", "gatewayFee", "actuals", "operator note", "41.2", "precioReal", "12345678", "999000111"]) assert.ok(!text.includes(bad), `leaked ${bad}`);
  assert.equal(mine.delivery.address, "Calle Prueba 123, Miraflores, Lima");
  assert.deepEqual(mine.delivery.recipient, { name: "Recibe Prueba", relationship: "Hermana" });
  assert.equal(guest.delivery, undefined, "guest-attached order must not show the address");
  assert.deepEqual(mine.totals, { totalPen: 250.5, saldoPen: 20, cardPen: 230.5 });
  assert.deepEqual(mine.items[0], { title: "Fixture Doll", brand: "Fixture", size: null, condition: null, qty: 2, image: "https://img.example.test/doll.jpg" });
});

console.log("\n  Mi cuenta -- status as a message from Aria");

await check("each state maps onto the seven Aria words and the message answers where / next / action", () => {
  const ship = (status, extra = {}) => ({ shipmentId: "ARIA-SHIP-261020-AB12", status, orderIds: ["X"], trackingNumber: "AVI-SECRET-1", courier: "avi", statusHistory: [{ status: "purchased_usa", at: "2026-10-20T00:00:00Z" }, { status, at: "2026-10-22T00:00:00Z", raw: "EN RUTA" }], ...extra });
  const cases = [
    [order("X", { paymentStatus: "unpaid", status: "pending_payment" }), null, "processing", /esperando la confirmación de tu pago/],
    [order("X"), null, "processing", /comprando tus productos/],
    [order("X"), ship("purchased_usa"), "purchased", /Ya compramos/],
    [order("X"), ship("miami_received"), "purchased", /con nosotros en Miami/],
    [order("X"), ship("in_transit", { transitDaysMin: 5, transitDaysMax: 8 }), "in_transit", /volando de Miami a Lima\. Calculamos entre 5 y 8 días/],
    [order("X"), ship("in_customs"), "in_customs", /aduana.*nada más que pagar/],
    [order("X"), ship("out_for_delivery"), "out_for_delivery", /sale hoy/],
    [order("X"), ship("lince_available"), "out_for_delivery", /Lince/],
    [order("X"), ship("delivered", { deliveredAt: "2026-10-30T00:00:00Z" }), "delivered", /llegó/],
  ];
  const labels = new Set();
  for (const [o, s, stage, rx] of cases) {
    const st = A.orderStatus(o, s, []);
    assert.equal(st.stage, stage, `${s && s.status}: ${st.stage}`);
    assert.match(st.message, rx);
    assert.ok(/no tienes que hacer nada|nada más que pagar|recoger|avisa|escríbenos|Si ya pagaste/i.test(st.message), `no action line: ${st.message}`);
    labels.add(st.label);
  }
  for (const l of labels) assert.ok(["Procesando", "Comprado", "En tránsito", "En aduanas", "En reparto", "Entregado", "Cancelado"].includes(l));
  const ex = A.orderStatus(order("X"), ship("exception"), []);
  assert.equal(ex.stage, "purchased", "an exception keeps the last real stage");
  assert.match(ex.message, /inconveniente.*nueva fecha/);
});

await check("cancelled orders say what came back: card refund, saldo credit, or nothing charged", () => {
  const unpaid = A.orderStatus(order("X", { status: "payment_expired", paymentStatus: "expired" }), null, []);
  assert.equal(unpaid.label, "Cancelado");
  assert.match(unpaid.message, /no se te cobró nada/);
  const refunded = A.orderStatus(order("X", { paymentStatus: "refunded", amountRefundedPen: 230.5 }), null, [{ kind: "credit", amountPen: 20, orderId: "X" }]);
  assert.match(refunded.message, /S\/\s?230\.50 a tu tarjeta.*S\/\s?20\.00 como saldo Aria/);
  assert.deepEqual(refunded.refund, { refundedToCardPen: 230.5, creditedAsSaldoPen: 20 });
});

await check("the timeline fills as states advance; tracking shows Aria's guía and never the courier's number or name", async () => {
  assert.deepEqual(A.timeline("in_customs").map((s) => s.state), ["done", "done", "done", "current", "ahead", "ahead"]);
  assert.deepEqual(A.timeline("delivered").map((s) => s.state), ["done", "done", "done", "done", "done", "done"]);
  assert.deepEqual(A.timeline("cancelled"), []);
  const S = stores({
    orders: { "ARIA-20261020-AAA111": order("ARIA-20261020-AAA111") },
    shipments: {
      "ARIA-SHIP-261020-AB12": { shipmentId: "ARIA-SHIP-261020-AB12", createdAt: "2026-10-21T00:00:00Z", status: "in_transit", orderIds: ["ARIA-20261020-AAA111"], trackingNumber: "AVI-77001", provider: "avi", costUsd: 31,
        statusHistory: [{ status: "purchased_usa", at: "2026-10-20T01:00:00Z", by: "ops@aria.test" }, { status: "in_transit", at: "2026-10-22T01:00:00Z", raw: "EN RUTA AVI" }] },
      "track:AVI-77001": { shipmentId: "ARIA-SHIP-261020-AB12" },
      "ARIA-SHIP-261020-ZZ99": { shipmentId: "ARIA-SHIP-261020-ZZ99", status: "delivered", orderIds: ["ARIA-20990101-NOTME1"] },
    },
  });
  const [o] = await A.accountOrders(S, ME);
  assert.equal(o.stage, "in_transit");
  assert.equal(o.tracking.guia, "ARIA-SHIP-261020-AB12");
  assert.deepEqual(o.tracking.history.map((h) => h.label), ["Comprado", "En tránsito"]);
  const text = JSON.stringify(o);
  for (const bad of ["AVI", "avi", "costUsd", "ops@aria.test", "EN RUTA"]) assert.ok(!text.includes(bad), `leaked ${bad}`);
});

console.log("\n  Mi cuenta -- the wallet");

await check("credit math is exact to the cent and proportional; merchandise only", () => {
  assert.equal(A.keyClubCreditPen(37), 1.85);
  assert.equal(A.keyClubCreditPen(100), 5);
  assert.equal(A.keyClubCreditPen(0), 0);
  assert.equal(A.freightOverageCreditUsd(1.4), 18.2);
  assert.equal(A.merchandiseSubtotalUsd([{ priceUsd: 19.99, qty: 2 }, { priceUsd: 5.5 }, { priceUsd: null }, { title: "freight", flete: 30 }]), 45.48);
  assert.ok(A.WALLET_RULES.some((r) => /\$5 por cada \$100 en productos/.test(r) && /sin contar impuestos ni flete/.test(r)));
});

await check("the wallet always renders, S/ 0.00 included, with the full ledger: amount, reason, date", async () => {
  const empty = await A.accountOverview(stores({ users: { [ME]: { email: ME, name: "Socia Prueba", founderStatus: "fundador", passwordHash: "x:y" } } }), ME);
  assert.equal(empty.wallet.balancePen, 0);
  assert.deepEqual(empty.wallet.ledger, []);
  assert.ok(empty.wallet.rules.length >= 3);
  assert.ok(!JSON.stringify(empty).includes("passwordHash") && !JSON.stringify(empty).includes("x:y"), "password hash leaked");
  const txns = Array.from({ length: 14 }, (_, i) => ({ id: String(i), ts: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`, kind: i % 3 ? "credit" : "debit", amountPen: 1.25 + i, reason: `Motivo ${i}`, by: "admin@aria.test", orderId: null, balanceAfterPen: 10 }));
  const full = await A.accountOverview(stores({ wallet: { [ME]: { balancePen: 18.2, txns } } }), ME);
  assert.equal(full.wallet.balancePen, 18.2);
  assert.equal(full.wallet.ledger.length, 14, "the member sees the full history, not the last ten");
  assert.deepEqual(Object.keys(full.wallet.ledger[0]).sort(), ["amountPen", "balanceAfterPen", "date", "kind", "orderId", "reason"]);
  assert.ok(!JSON.stringify(full.wallet).includes("admin@aria.test"), "issuer leaked");
});

console.log("\n  Mi cuenta -- profile, recipients, documents, cart");

await check("profile and Key Club state; recipients from own orders and saved packs, documents masked to the last three", async () => {
  const S = stores({
    users: { [ME]: { email: ME, name: "Socia Prueba", phone: "999000111", founderStatus: "fundador", createdAt: "2026-10-01T00:00:00Z" } },
    orders: {
      "ARIA-20261020-AAA111": order("ARIA-20261020-AAA111", { recipient: { name: "Recibe Prueba", idNumber: "12345678", relationship: "Hermana" } }),
      "ARIA-20261019-BBB222": order("ARIA-20261019-BBB222", { buyerEmail: null, customer: { email: ME }, recipient: { name: "Guest Typed", idNumber: "87654321" } }),
    },
    packs: { [ME]: { recipients: [{ docNumber: "12345678", name: "Recibe Prueba", front: "f".repeat(32), back: "b".repeat(32), updatedAt: "2026-10-20T00:00:00Z" }] } },
  });
  const ov = await A.accountOverview(S, ME);
  assert.equal(ov.profile.keyClub.member, true);
  assert.equal(ov.profile.name, "Socia Prueba");
  assert.deepEqual(ov.profile.recipients, [{ name: "Recibe Prueba", docEnd: "678", relationship: "Hermana", savedDocuments: true }]);
  assert.ok(!JSON.stringify(ov.profile).includes("Guest Typed"), "a guest-attached order's recipient must not reach the profile");
  assert.equal(ov.documents.length, 1);
  assert.equal(ov.documents[0].docEnd, "678");
  assert.ok(!JSON.stringify(ov.documents).includes("f".repeat(32)), "photo ids leaked");
  const pending = await A.accountOverview(stores({ users: { [ME]: { email: ME, founderStatus: "pending" } } }), ME);
  assert.equal(pending.profile.keyClub.member, false);
});

await check("the saved cart comes back as lines with photo, size, qty and USD price", async () => {
  const S = stores({ carts: { [ME]: { cart: [{ title: "Fixture Sneaker", priceUsd: 89.99, qty: 1, selectedSize: "9", image: "https://img.example.test/s.jpg", dutiableUsd: 70, weightKg: 1.1 }, { priceUsd: 3 }] } } });
  const ov = await A.accountOverview(S, ME);
  assert.deepEqual(ov.cart, [{ title: "Fixture Sneaker", brand: null, size: "9", condition: null, qty: 1, image: "https://img.example.test/s.jpg", priceUsd: 89.99 }]);
  assert.deepEqual(await A.accountOverview(S, null), { signedIn: false });
});

/* TEST FIXTURE: random pixels, not a document. */
function photo(w = 160, h = 110) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 7919 + (i >> 5) * 104729) % 251;
  return jpegjs.encode({ data, width: w, height: h }, 90).data.toString("base64");
}
async function up(S, side, owner) {
  const v = D.validateUpload({ side, data: photo() });
  return D.saveUpload(S.docs, { side, ...v }, { owner });
}

await check("Reemplazar: a member's new photos replace the pack and the old ones go; a guest token cannot be pulled in", async () => {
  const S = { docs: memStore(), packs: memStore() };
  const f1 = await up(S, "front", ME), b1 = await up(S, "back", ME);
  await D.registerPack(S, ME, { docNumber: "12345678", name: "Recibe Prueba", front: f1, back: b1 });
  const f2 = await up(S, "front", ME), b2 = await up(S, "back", ME);
  const r = await D.replacePack(S, ME, { docNumber: "12345678", front: f2, back: b2 });
  assert.ok(r.ok, r.error);
  const pack = await D.packFor(S.packs, ME, "12345678");
  assert.deepEqual([pack.front, pack.back, pack.name], [f2, b2, "Recibe Prueba"]);
  assert.equal(S.docs.m.has(`img:${f1}`), false, "old photo kept");
  const gf = await up(S, "front", null), gb = await up(S, "back", null);
  assert.equal((await D.replacePack(S, ME, { docNumber: "12345678", front: gf, back: gb })).ok, false);
  const of = await up(S, "front", OTHER), ob = await up(S, "back", OTHER);
  assert.equal((await D.replacePack(S, ME, { docNumber: "12345678", front: of, back: ob })).ok, false);
  assert.equal((await D.replacePack(S, null, { docNumber: "12345678", front: f2, back: b2 })).ok, false);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
