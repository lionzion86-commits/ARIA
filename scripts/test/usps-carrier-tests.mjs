/* ==================================================================
   USPS EXPOSURE -- the carrier matrix as data, the alert, the widened
   window, and both shipping options at checkout.
   (#443 c.6612459871 + addendum c.6612548967, Danny, 2026-11-03)

   WHY: Aria's own Victoria's Secret order shipped USPS, was marked
   delivered and was not received; USPS holds packages and drops them in
   weekly batches. Customers must see it BEFORE they buy.

   Pins:
     - the metadata (data/store-shipping-terms.json, /store-carrier-data.js)
       is today's build of the matrix, and its counts per class / group;
     - the exact alert copy per class and the group-1 line;
     - the +5 widening (3-6 -> 3-11) on every displayed window;
     - no alert, no widening, no options for non-USPS and unknown stores;
     - the checkout options for VS, PacSun and Ulta are the matrix tiers;
     - a store-priced tier reads «se calcula en la tienda al pagar», never $0;
     - the chosen tier, its price and the buyer note land on the order
       (the real orders-create handler), and the totals include it;
     - in a browser at 390px: the VS product page shows the alert, the VS
       checkout shows both options and charges the pick, a mixed-class
       store page shows its alert, a non-USPS product page shows none.

   RUN: node scripts/test/usps-carrier-tests.mjs
   Screenshots (optional): USPS_SHOTS=<dir> writes usps-*.png there.
   Port: USPS_PORT (default 8997).
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import jpegjs from "jpeg-js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("    ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failures.push(`${name}\n         ${String(e && e.stack || e).split("\n").slice(0, 4).join("\n         ")}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");

/* ---- @netlify/blobs, in memory ---- */
globalThis.__blobs = new Map();
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "const S = globalThis.__blobs;" +
      "export const connectLambda = () => {};" +
      "export function getStore(name){ if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null," +
      " setJSON: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; }," +
      " set: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, String(v)); return { modified: true }; }," +
      " delete: async (k)=>{ m.delete(k); }, list: async ()=>({ blobs: [...m.keys()].map(key=>({key})) }) }; }"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);

const SC = await import(ROOT + "scripts/lib/store-carrier.js");
const C = SC.STORE_CARRIER;
const SS = await import(ROOT + "scripts/lib/store-shipping.js");
const RD = await import(ROOT + "scripts/lib/retailer-delivery.js");
const W = await import(ROOT + "weight-data.js");
const CO = await import(ROOT + "couriers.js");
const M = await import(ROOT + "netlify/functions/_checkout-model.js");
const BF = await import(ROOT + "scripts/lib/buyer-fee.js");
const { handler: createOrder } = await import(ROOT + "netlify/functions/orders-create.js");
const { handler: dniUpload } = await import(ROOT + "netlify/functions/dni-upload.js");
const { resolveCartWeights } = await import(ROOT + "netlify/functions/_weight-resolve.js");
const DATA = JSON.parse(read("data/store-shipping-terms.json"));
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const FX = 3.75;
const ofClass = (k) => Object.values(DATA.stores).filter((s) => s.carrierClass === k).map((s) => s.slug);
const ofGroup = (g) => Object.values(DATA.stores).filter((s) => s.group === g).map((s) => s.slug);

/* ------------------------------------------------------------------
   THE DATA.
   ------------------------------------------------------------------ */
await check("the metadata is today's build of the matrix (node scripts/build-store-carrier.mjs --check)", () => {
  const r = spawnSync(process.execPath, [ROOT + "scripts/build-store-carrier.mjs", "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, "stale: " + r.stderr);
  assert.match(r.stderr, /every matrix slug maps to a store key/);
  const js = read("store-carrier-data.js");
  assert.deepEqual(JSON.parse(/AriaStoreCarrierData = (\{.*\});/.exec(js)[1]), DATA, "the page copy and the JSON differ");
});
await check("counts per class and group: 120 active stores, 61 USPS-exposed", () => {
  assert.equal(Object.keys(DATA.stores).length, 120);
  assert.equal(ofGroup(1).length, 52, "group 1, BOTH");
  assert.equal(ofGroup(2).length, 0, "group 2");
  assert.equal(ofGroup(3).length, 9, "group 3, MIXED");
  assert.equal(ofGroup(4).length, 12, "group 4, non-USPS");
  assert.equal(ofGroup(5).length, 47, "group 5, UNKNOWN");
  assert.equal(ofClass("usps").length + ofClass("mixed").length, 61, "USPS-exposed total");
  assert.equal(ofClass("non-usps").length, 12);
  assert.equal(ofClass("unknown").length, 47);
  assert.deepEqual(DATA.counts, { usps: ofClass("usps").length, mixed: ofClass("mixed").length, "non-usps": 12, unknown: 47 });
  /* every group-1 and group-3 store is exposed; nothing else is */
  for (const s of [...ofGroup(1), ...ofGroup(3)]) assert.ok(C.isExposed(s), s);
  for (const s of [...ofGroup(4), ...ofGroup(5)]) assert.ok(!C.isExposed(s), s);
});
await check("Sam's Club is on the record only (removed), never a store here", () => {
  assert.ok(!DATA.stores.samsclub);
  assert.deepEqual(DATA.removed.map((r) => r.slug), ["samsclub"]);
  assert.deepEqual(C.alertLines("samsclub"), []);
});
await check("each store row keeps the policy detail, the alternative and the source verbatim", () => {
  const vs = DATA.stores.victoriassecret;
  assert.equal(vs.carrierClass, "usps");
  assert.equal(vs.group, 1);
  assert.match(vs.carrierNote, /W173492948/);
  assert.match(vs.paidAlternative, /^3 Bus\. Day Express \$16/);
  assert.match(vs.source, /customercare\.victoriassecret\.com/);
  assert.equal(DATA.stores.newbalance.carrierClass, "non-usps");
  assert.equal(DATA.stores.kohls.carrierClass, "unknown");
  assert.equal(DATA.stores.macys.carrierClass, "mixed");
});
await check("every quoted window is the one Aria already shows (retailer-delivery), else the matrix's own, else none", () => {
  for (const s of Object.values(DATA.stores)) {
    const rd = RD.quotedDeliveryFor(s.slug);
    if (rd) assert.deepEqual([s.quotedWindow.min, s.quotedWindow.max, s.quotedWindow.source], [rd.miamiMin, rd.miamiMax, "retailer-delivery"], s.slug);
    else if (s.quotedWindow) assert.equal(s.quotedWindow.source, "matrix", s.slug);
  }
});

/* ------------------------------------------------------------------
   THE ALERT, EXACT COPY.
   ------------------------------------------------------------------ */
const USPS_COPY = "Esta tienda envía con USPS, el servicio postal del gobierno de EE. UU. USPS a veces retiene los paquetes y los entrega por tandas: tu pedido puede tardar de 3 a 5 días más de lo que indica la tienda. El plazo que te mostramos ya incluye ese margen.";
const MIXED_COPY = "Esta tienda elige el transportista al despachar y tu pedido puede viajar con USPS, el servicio postal del gobierno de EE. UU. USPS a veces retiene los paquetes y los entrega por tandas: tu pedido puede tardar de 3 a 5 días más de lo que indica la tienda. El plazo que te mostramos ya incluye ese margen.";
const G1_COPY = "Si prefieres evitarlo, elige la otra opción de envío antes de pagar y la aplicamos tal cual en la tienda.";
await check("the alert copy, word for word, per class", () => {
  assert.equal(SC.ALERT_USPS, USPS_COPY);
  assert.equal(SC.ALERT_MIXED, MIXED_COPY);
  assert.deepEqual(C.alertLines("victoriassecret"), [USPS_COPY, G1_COPY], "VS: USPS + group-1 line");
  assert.deepEqual(C.alertLines("macys"), [MIXED_COPY, G1_COPY], "Macy's: MIXED + group-1 line");
  assert.deepEqual(C.alertLines("bestbuy"), [MIXED_COPY], "Best Buy: group 3, MIXED, no group-1 line");
  for (const s of ofClass("usps")) assert.equal(C.alertLines(s)[0], USPS_COPY, s);
  for (const s of ofClass("mixed")) assert.equal(C.alertLines(s)[0], MIXED_COPY, s);
});
await check("the group-1 line: exactly the 52 stores with a selectable alternative", () => {
  assert.equal(SC.ALERT_GROUP1, G1_COPY);
  const withLine = Object.keys(DATA.stores).filter((s) => C.alertLines(s).includes(G1_COPY));
  assert.deepEqual(withLine.sort(), ofGroup(1).sort());
});
await check("no alert, no widening, no options for non-USPS and unknown stores", () => {
  for (const s of [...ofClass("non-usps"), ...ofClass("unknown"), "nosuchstore"]) {
    assert.deepEqual(C.alertLines(s), [], s);
    assert.ok(!C.hasOptions(s), s);
    assert.deepEqual(C.optionsFor(s, 50, SS.shippingStandingOf(s, 50)), [], s);
    const rd = RD.quotedDeliveryFor(s);
    assert.deepEqual(RD.deliveryFor(s), rd, s + ": window changed");
  }
  assert.equal(RD.miamiRangeEs(RD.deliveryFor("dicks")), "3–6 días", "Dick's (unknown) untouched");
  assert.equal(RD.miamiRangeEs(RD.deliveryFor("newbalance")), "2–5 días", "New Balance (non-USPS) untouched");
  /* a tier pick on a store without options is dropped */
  assert.deepEqual(C.sanitizeTiers({ newbalance: "expedited", kohls: "x", victoriassecret: "nope" }), {});
});

/* ------------------------------------------------------------------
   THE WIDENED WINDOW.
   ------------------------------------------------------------------ */
await check("+5 on the upper end, every displayed window of a usps/mixed store (3–6 becomes 3–11)", () => {
  assert.equal(SC.WIDEN_DAYS, 5);
  assert.equal(RD.miamiRangeEs(RD.quotedDeliveryFor("victoriassecret")), "3–6 días", "the store's own quote stays in the table");
  assert.equal(RD.miamiRangeEs(RD.deliveryFor("victoriassecret")), "3–11 días");
  assert.equal(RD.storeDeliveryLineEs("victoriassecret"), "Llega a nuestro almacén en Miami en 3–11 días.");
  assert.equal(C.windowText("victoriassecret"), "3–11 días");
  assert.equal(RD.miamiRangeEs(RD.deliveryFor("pacsun")), "5–12 días");
  assert.equal(RD.miamiRangeEs(RD.deliveryFor("bestbuy")), "2–8 días", "group 3 widens too");
  assert.equal(RD.storeDeliveryLineEs("skims"), "Llega a nuestro almacén en Miami en 12 días como máximo.");
  for (const s of [...ofClass("usps"), ...ofClass("mixed")]) {
    const q = RD.quotedDeliveryFor(s);
    if (q) assert.equal(RD.deliveryFor(s).miamiMax, q.miamiMax + 5, s);
    const w = C.windowOf(s);
    if (w) assert.equal(w.max, DATA.stores[s].quotedWindow.max + 5, s);
  }
  /* the slowest-store logic runs on the widened windows */
  assert.equal(RD.slowestDeliveryKey(["dicks", "victoriassecret"]), "victoriassecret");
});
await check("the app bundle and the page mirror widen the same way", () => {
  const bundle = read("build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)));
  assert.match(bundle, /window\.AriaStoreCarrier \? window\.AriaStoreCarrier\.widen\(k, row\) : row/);
  const idx = read("index.html");
  assert.match(idx, /<script src="\/store-carrier-data\.js"[^>]*><\/script>\r?\n<script src="\/store-carrier\.js"[^>]*><\/script>/);
  for (const f of ["producto.html", "tienda.html"]) assert.match(read(f), /<script src="\/store-carrier-data\.js"><\/script>\n<script src="\/store-carrier\.js"><\/script>/, f);
});

/* ------------------------------------------------------------------
   THE OPTIONS AT CHECKOUT -- THE RETAILER'S OWN TIERS.
   ------------------------------------------------------------------ */
const opt = (store, sub) => C.optionsFor(store, sub, SS.shippingStandingOf(store, sub));
const brief = (o) => [o.id, o.label, o.speedText, o.priceText];
await check("Victoria's Secret: Standard + 3-Day / 2-Day / Next-Day at the matrix prices, both sides of $50", () => {
  assert.deepEqual(opt("victoriassecret", 30).map(brief), [
    ["standard", "Envío estándar de la tienda", "3–11 días hasta nuestro almacén en Miami", "US$ 8.00"],
    ["3-bus-day-express", "3 Bus. Day Express", "3 días hábiles", "US$ 16.00"],
    ["2-bus-day-express", "2 Bus. Day Express", "2 días hábiles", "US$ 19.00"],
    ["next-bus-day-express", "Next Bus. Day Express", "1 día hábil", "US$ 26.00"],
  ]);
  assert.deepEqual(opt("victoriassecret", 60).map((o) => o.priceText), ["Gratis", "US$ 8.00", "US$ 11.00", "US$ 18.00"]);
  /* "free 2-day/3-day on orders >$200" */
  assert.deepEqual(opt("victoriassecret", 250).map((o) => o.priceText), ["Gratis", "Gratis", "Gratis", "US$ 18.00"]);
  assert.equal(opt("victoriassecret", 30)[0].name, "Standard Delivery");
});
await check("PacSun: Standard + Express $10 / 2nd Day $15 / Overnight $20", () => {
  assert.deepEqual(opt("pacsun", 40).map(brief), [
    ["standard", "Envío estándar de la tienda", "5–12 días hasta nuestro almacén en Miami", "US$ 7.00"],
    ["express", "Express", "2–4 días hábiles", "US$ 10.00"],
    ["2nd-day", "2nd Day", "2 días hábiles", "US$ 15.00"],
    ["overnight", "Overnight", "1 día hábil", "US$ 20.00"],
  ]);
});
await check("Ulta: Standard + Expedited $12.95 / Premium $19.95", () => {
  assert.deepEqual(opt("ulta", 20).map(brief), [
    ["standard", "Envío estándar de la tienda", "3–13 días hasta nuestro almacén en Miami", "US$ 6.95"],
    ["expedited", "Expedited", "1–2 días hábiles", "US$ 12.95"],
    ["premium", "Premium", "1 día hábil", "US$ 19.95"],
  ]);
});
await check("a tier the store prices at its own checkout reads «se calcula en la tienda al pagar», never $0", () => {
  assert.equal(SC.PRICE_AT_STORE, "se calcula en la tienda al pagar");
  const fl = opt("footlocker", 50);
  assert.deepEqual(fl.slice(1).map(brief), [
    ["expedited-2-day", "Expedited 2-Day", "2 días hábiles", "se calcula en la tienda al pagar"],
    ["next-day", "Next-Day", "1 día hábil", "se calcula en la tienda al pagar"],
  ]);
  for (const s of ofGroup(1)) for (const o of opt(s, 40)) {
    assert.ok(o.priceUsd == null ? o.priceText === SC.PRICE_AT_STORE : true, s + " " + o.id);
    assert.doesNotMatch(o.priceText, /\$\s?0(\.00)?\b/, s + " " + o.id + " shows $0");
  }
  /* a store with no sourced standard fee: its standard option is not $0 either */
  assert.equal(opt("ancora", 50)[0].priceText, SC.PRICE_AT_STORE);
  /* charged nothing, flagged pending */
  const st = SS.cartShipping([{ retailer: "footlocker", dutiableUsd: 53.5, qty: 1 }], undefined, { tiers: { footlocker: "next-day" } }).stores[0];
  assert.equal(st.feeUsd, 0);
  assert.equal(st.pending, true);
});
await check("every group-1 store offers its standard option and at least one tier; group 3 offers none", () => {
  for (const s of ofGroup(1)) { const o = opt(s, 40); assert.ok(o.length >= 2 && o[0].id === "standard", s); }
  for (const s of ofGroup(3)) assert.deepEqual(opt(s, 40), [], s);
});
await check("Ancora: +$12 expedited, arranged via the store's customer service, carried as a buyer note", () => {
  const t = C.tierOf("ancora", "expedited-shipping");
  assert.deepEqual(t.price, { kind: "adder", usd: 12 });
  assert.equal(t.viaCustomerService, true);
  assert.match(DATA.stores.ancora.buyerNote, /servicio al cliente/);
  assert.match(DATA.stores.ancora.buyerNote, /\+\$12/);
});

/* ------------------------------------------------------------------
   THE ORDER: THE PICK, ITS PRICE, THE BUYER NOTE, THE TOTAL.
   ------------------------------------------------------------------ */
const VS = { retailer: "victoriassecret", title: "Fixture Lace Bralette", priceUsd: 39, dutiableUsd: 32.1, weightKg: 0.3, weightEstimated: true, qty: 1, image: "" };
const ANC = { retailer: "ancora", title: "Fixture Swim Top", priceUsd: 70, dutiableUsd: 64.2, weightKg: 0.3, weightEstimated: true, qty: 1, image: "" };
const NB = { retailer: "newbalance", title: "Fixture Runner", priceUsd: 90, dutiableUsd: 85.6, weightKg: 0.9, weightEstimated: true, qty: 1, image: "" };
await check("totals: the chosen tier replaces the store's standard fee, at cost", () => {
  const sub = SS.cartShipping([VS]).stores[0].subtotalUsd;
  assert.equal(sub, 30);
  assert.equal(SS.cartShipping([VS]).totalUsd, 8, "standard");
  assert.equal(SS.cartShipping([VS], undefined, { tiers: { victoriassecret: "2-bus-day-express" } }).totalUsd, 19);
  assert.equal(SS.cartShipping([VS, NB], undefined, { tiers: { victoriassecret: "next-bus-day-express" } }).totalUsd, 26, "NB ships free; VS Next-Day $26");
  assert.equal(SS.cartShipping([VS], undefined, { tiers: { victoriassecret: "standard" } }).totalUsd, 8);
  assert.equal(SS.cartShipping([VS], undefined, { tiers: { victoriassecret: "bogus" } }).totalUsd, 8, "a bogus id is the standard option");
  /* Crocs Express via UPS at $120+: 12.5% of the order total */
  assert.equal(SS.cartShipping([{ retailer: "crocs", dutiableUsd: 160.5, qty: 1 }], undefined, { tiers: { crocs: "express-via-ups" } }).totalUsd, 18.75);
});

let stripeCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.endsWith("/.netlify/functions/exchange-rate")) return new Response(JSON.stringify({ venta: FX, compra: 3.7 }));
  if (u === "https://api.stripe.com/v1/checkout/sessions") {
    stripeCalls.push({ form: Object.fromEntries(new URLSearchParams(opts.body)) });
    return new Response(JSON.stringify({ id: "cs_test_usps", url: "https://checkout.stripe.com/c/pay/cs_test_usps", livemode: false, expires_at: 1 }));
  }
  return realFetch(url, opts);
};
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
const HOST = "deploy-preview-1--ariashopperu.netlify.app";
function fixturePhotoBase64(w = 160, h = 110) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 7919 + (i >> 5) * 104729) % 251;
  return jpegjs.encode({ data, width: w, height: h }, 90).data.toString("base64");
}
async function photos() {
  const out = {};
  for (const side of ["front", "back"]) {
    const r = await dniUpload({ httpMethod: "POST", headers: {}, body: JSON.stringify({ side, data: fixturePhotoBase64() }) });
    out[side] = JSON.parse(r.body).token;
  }
  return out;
}
async function post(body) {
  const res = await createOrder({ httpMethod: "POST", headers: { host: HOST }, body: JSON.stringify({ dniDocs: await photos(), ...body }) });
  return { status: res.statusCode, data: JSON.parse(res.body) };
}
const orderBody = (items, extra = {}) => ({
  customer: { name: "Ana Prueba", email: "ana@correo.test", idNumber: "45678912" },
  shipping: { destCity: "Lima" }, items,
  quote: { total_usd: 100, flete_usd: 26, source: "avi" }, shippingMode: "consolidated", ...extra,
});
/* The total by the published rules: goods + freight + tax + store shipping (with the pick), then the soles fees. */
function expectedPen(items, tiers) {
  const goods = items.reduce((s, it) => s + it.priceUsd * it.qty, 0);
  const fob = items.reduce((s, it) => s + it.dutiableUsd * it.qty, 0);
  const freight = M.freightFloorUsd(26, resolveCartWeights(items).totalKg, W.CHARGE_PER_KG);
  const tax = W.importTaxEstimateUsd(fob, freight);
  const ship = SS.cartShipping(items, undefined, { tiers }).totalUsd;
  const usd = r2(goods + freight + tax + ship);
  return r2(usd * FX + W.smallOrderFeePen(r2((goods + freight) * FX)) + CO.provinciaFeePen("Lima") + M.expressFeePen("consolidated", FX) + BF.buyerFeePen(items));
}
const orderOf = (id) => JSON.parse(globalThis.__blobs.get("orders").get(id));

await check("server: VS 2-Day is charged $19 (not the $8 standard), recorded with the buyer instruction", async () => {
  const items = [VS];
  const tiers = { victoriassecret: "2-bus-day-express" };
  const want = expectedPen(items, tiers);
  assert.equal(r2(want - expectedPen(items, {})), r2((19 - 8) * FX), "the pick moves the total by exactly the tier difference");
  const stale = await post(orderBody(items, { storeShippingTiers: tiers, shownTotalPen: expectedPen(items, {}) }));
  assert.equal(stale.status, 409, "the standard total was accepted for a 2-Day pick");
  assert.equal(stale.data.totalPen, want);
  stripeCalls = [];
  const ok = await post(orderBody(items, { storeShippingTiers: tiers, shownTotalPen: want }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(Number(stripeCalls.at(-1).form["line_items[0][price_data][unit_amount]"]), Math.round(want * 100));
  const o = orderOf(ok.data.orderId);
  assert.equal(o.storeShippingUsd, 19);
  assert.deepEqual(o.storeShipping, [{ store: "victoriassecret", subtotalUsd: 30, feeUsd: 19, tierId: "2-bus-day-express" }]);
  assert.equal(o.storeShippingChoices.length, 1);
  const c = o.storeShippingChoices[0];
  assert.equal(c.tierId, "2-bus-day-express");
  assert.equal(c.tierName, "2 Bus. Day Express");
  assert.equal(c.chargedUsd, 19);
  assert.equal(c.pricedAtStore, false);
  assert.equal(c.carrierClass, "usps");
  assert.equal(c.buyerInstruction, "En el checkout de Victoria's Secret, elige exactamente «2 Bus. Day Express»: es la opción que eligió el cliente.");
});
await check("server: no pick is the standard option, on the record too; a non-USPS store has no choice row", async () => {
  const items = [VS, NB];
  const want = expectedPen(items, {});
  const ok = await post(orderBody(items, { shownTotalPen: want }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const o = orderOf(ok.data.orderId);
  assert.deepEqual(o.storeShippingChoices.map((c) => [c.store, c.tierId, c.chargedUsd]), [["victoriassecret", "standard", 8]]);
  assert.match(o.storeShippingChoices[0].buyerInstruction, /«Standard Delivery»/);
});
await check("server: a tampered pick (a store without options, a made-up tier) is ignored", async () => {
  const items = [VS, NB];
  const want = expectedPen(items, {});
  const ok = await post(orderBody(items, { storeShippingTiers: { newbalance: "expedited-ups-2-day-air", victoriassecret: "free-shipping" }, shownTotalPen: want }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(orderOf(ok.data.orderId).storeShippingUsd, 8);
});
await check("server: Ancora expedited carries the customer-service note into the order record", async () => {
  const items = [ANC];
  const tiers = { ancora: "expedited-shipping" };
  const want = expectedPen(items, tiers);
  const ok = await post(orderBody(items, { storeShippingTiers: tiers, shownTotalPen: want }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const c = orderOf(ok.data.orderId).storeShippingChoices[0];
  assert.equal(c.tierId, "expedited-shipping");
  assert.match(c.buyerNote, /servicio al cliente/);
  assert.equal(c.pricedAtStore, true, "Ancora's standard fee is not sourced, so the +$12 total is set at the store");
  assert.match(c.buyerInstruction, /lo fija la tienda al pagar/);
});

/* ------------------------------------------------------------------
   THE PAGES, 390 PX.
   ------------------------------------------------------------------ */
let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
const SHOTS = process.env.USPS_SHOTS || "";

/* A real product page per store, from the PDP shards (no catalogue fetch). */
function pdpTitle(store) {
  const dir = ROOT + "assets/pdp/p/";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const j = JSON.parse(readFileSync(dir + f, "utf8"));
    for (const arr of Object.values(j)) for (const p of Array.isArray(arr) ? arr : [])
      if (p && String(p.retailer || "").toLowerCase() === store && p.name && p.image) return p.name;
  }
  return null;
}

if (!chromium) {
  console.log("    (browser checks skipped: no Playwright)");
} else {
  const state = { posted: [], answers: [] };
  async function fn(name, req, body) {
    if (name === "exchange-rate") return [200, { compra: 3.7, venta: FX, fecha: "2026-11-03" }];
    if (["wallet-get", "cart-save", "cart-get"].includes(name)) return [401, { error: "No autenticado" }];
    if (name === "founders-status") return [200, {}];
    if (name === "auth-me") return [200, { email: null }];
    if (name === "dni-pack") return [200, { signedIn: false, recipients: [] }];
    if (name === "shipping-quote") {
      const b = JSON.parse(body || "{}");
      const flete = r2(Math.max(0, Number(b.peso_kg) || 0) * W.CHARGE_PER_KG);
      return [200, { total_usd: r2((Number(b.valor_usd) || 0) + flete), flete_usd: flete, source: "avi" }];
    }
    const known = { "dni-upload": dniUpload, "orders-create": createOrder };
    let h = known[name];
    if (!h && existsSync(ROOT + `netlify/functions/${name}.js`)) h = (await import(ROOT + `netlify/functions/${name}.js`)).handler;
    if (h) {
      if (name === "orders-create") state.posted.push(JSON.parse(body));
      const u = new URL(req.url, "http://x");
      const r = await h({ httpMethod: req.method, headers: { ...req.headers, host: HOST }, body, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
      if (name === "orders-create") state.answers.push({ status: r.statusCode, data: JSON.parse(r.body) });
      return [r.statusCode, JSON.parse(r.body)];
    }
    return [404, { error: "no function " + name }];
  }
  function checkoutTailwind() {
    const dir = mkdtempSync(join(tmpdir(), "usps-tw-"));
    writeFileSync(join(dir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
    writeFileSync(join(dir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
    const r = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(dir, "tw.config.cjs"), "-i", join(dir, "in.css"), "-o", join(dir, "out.css")], { encoding: "utf8" });
    return r.status === 0 ? readFileSync(join(dir, "out.css"), "utf8") : "";
  }
  const TW_CSS = checkoutTailwind();
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const PORT = Number(process.env.USPS_PORT || 8997);
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, "http://x");
        if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
        const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (m) {
          const [code, json] = await fn(m[1], req, body);
          res.writeHead(code, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(json));
        }
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        res.end(readFileSync(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));
  const BASE = `http://127.0.0.1:${PORT}`;
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  async function openPage(path, setup) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host === `127.0.0.1:${PORT}`) return route.continue();
      if (u.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    if (setup) { await page.goto(`${BASE}/terminos.html`, { waitUntil: "domcontentloaded" }); await page.evaluate(setup.fn, setup.arg); }
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    return { context, page, errors };
  }
  const shot = async (page, name, el) => { if (SHOTS) await (el ? page.locator(el) : page).screenshot({ path: join(SHOTS, name) }); };

  try {
    await check("browser: the Victoria's Secret product page shows the USPS alert and the widened window", async () => {
      const title = pdpTitle("victoriassecret");
      assert.ok(title, "no VS product in the PDP shards");
      const { context, page, errors } = await openPage(`/producto.html?producto=${encodeURIComponent(title)}&tienda=victoriassecret`);
      try {
        await page.waitForSelector("#p-usps", { timeout: 30000 });
        const t = await page.$eval("#p-usps", (e) => [...e.querySelectorAll("p")].map((p) => p.textContent));
        assert.deepEqual(t, [USPS_COPY, G1_COPY, "Llega a nuestro almacén en Miami en 3–11 días."]);
        await page.$eval("#p-usps", (e) => e.scrollIntoView({ block: "center" }));
        await shot(page, "usps-vs-pdp.png");
        assert.deepEqual(errors, []);
        return title;
      } finally { await context.close(); }
    });
    await check("browser: a non-USPS product page (New Balance) shows no alert", async () => {
      const title = pdpTitle("newbalance");
      assert.ok(title, "no New Balance product in the PDP shards");
      const { context, page } = await openPage(`/producto.html?producto=${encodeURIComponent(title)}&tienda=newbalance`);
      try {
        await page.waitForSelector("#p-ship", { timeout: 30000 });
        assert.equal(await page.$("#p-usps"), null);
        const body = await page.textContent("body");
        assert.ok(!body.includes(USPS_COPY) && !body.includes(MIXED_COPY) && !body.includes(G1_COPY), "alert copy on a non-USPS page");
        await page.$eval("#p-ship", (e) => e.scrollIntoView({ block: "center" }));
        await shot(page, "usps-nonusps-pdp.png");
        return title;
      } finally { await context.close(); }
    });
    await check("browser: a mixed-class store page (Macy's) leads with the MIXED alert", async () => {
      const { context, page } = await openPage(`/tienda.html?tienda=macys`);
      try {
        await page.waitForSelector("#carrierAlert:not([hidden])", { timeout: 30000 });
        const t = await page.$eval("#carrierAlert", (e) => [...e.querySelectorAll("p")].map((p) => p.textContent));
        assert.deepEqual(t, [MIXED_COPY, G1_COPY, "Llega a nuestro almacén en Miami en 3–11 días."]);
        await shot(page, "usps-mixed-store.png");
      } finally { await context.close(); }
    });
    await check("browser: a non-USPS store page (New Balance) has no alert", async () => {
      const { context, page } = await openPage(`/tienda.html?tienda=newbalance`);
      try {
        await page.waitForSelector("#storeWrap:not([hidden])", { timeout: 30000 });
        assert.equal(await page.$eval("#carrierAlert", (e) => e.hidden), true);
      } finally { await context.close(); }
    });
    await check("browser: the VS checkout shows the alert and both options; the pick moves the total and is posted", async () => {
      state.posted.length = 0; state.answers.length = 0;
      const { context, page, errors } = await openPage(`/checkout.html`, { fn: (c) => localStorage.setItem("aria_cart_v1", JSON.stringify(c)), arg: [VS] });
      try {
        await page.waitForSelector('[data-ship-options="victoriassecret"]', { timeout: 30000 });
        const alert = await page.$eval('[data-store-ship="victoriassecret"] [data-usps-alert]', (e) => [...e.querySelectorAll("p")].map((p) => p.textContent));
        assert.deepEqual(alert, [USPS_COPY, G1_COPY]);
        const rows = await page.$$eval('[data-ship-options="victoriassecret"] [data-ship-option]', (els) => els.map((e) => e.getAttribute("data-ship-option") + " | " + e.textContent.replace(/\s+/g, " ").trim()));
        assert.equal(rows.length, 4);
        assert.match(rows[0], /^standard \| Envío estándar de la tienda ?S\/ 30\.00 \$8\.00 En la tienda: «Standard Delivery» Plazo: 3–11 días hasta nuestro almacén en Miami$/);
        assert.match(rows[1], /^3-bus-day-express \| «3 Bus\. Day Express» ?S\/ 60\.00 \$16\.00 Plazo de la tienda: 3 días hábiles/);
        assert.match(rows[2], /^2-bus-day-express \| «2 Bus\. Day Express» ?S\/ 71\.25 \$19\.00/);
        assert.match(rows[3], /^next-bus-day-express \| «Next Bus\. Day Express» ?S\/ 97\.50 \$26\.00/);
        const shipBefore = await page.textContent("#sumShip");
        assert.match(shipBefore, /S\/\s30\.00/);
        await page.locator('[data-ship-options="victoriassecret"]').scrollIntoViewIfNeeded();
        await shot(page, "usps-vs-checkout.png");
        await page.check('input[name="shipTier-victoriassecret"][value="2-bus-day-express"]');
        await page.waitForFunction(() => /71\.25/.test(document.getElementById("sumShip").textContent), null, { timeout: 10000 });
        assert.match(await page.textContent('[data-store-ship="victoriassecret"]'), /Opción de la tienda: 2 Bus\. Day Express/);
        assert.match(await page.textContent("#deliverySummaryWrap"), /2 días hábiles/);
        await page.locator('[data-ship-options="victoriassecret"]').scrollIntoViewIfNeeded();
        await shot(page, "usps-vs-checkout-picked.png");
        const stored = await page.evaluate(() => sessionStorage.getItem("aria_ship_tiers_v1"));
        assert.deepEqual(JSON.parse(stored), { victoriassecret: "2-bus-day-express" });
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
    await check("browser: a non-USPS store at checkout shows no alert and no options", async () => {
      const { context, page } = await openPage(`/checkout.html`, { fn: (c) => localStorage.setItem("aria_cart_v1", JSON.stringify(c)), arg: [NB] });
      try {
        await page.waitForSelector('[data-store-ship="newbalance"]', { timeout: 30000 });
        assert.equal(await page.$("[data-usps-alert]"), null);
        assert.equal(await page.$("[data-ship-options]"), null);
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log("  FAIL " + f);
process.exit(failures.length ? 1 : 0);
