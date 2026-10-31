/* ==================================================================
   PER-STORE SHIPPING TRANSPARENCY (#443 c.6511807569, c.6511829027,
   c.6511908498, Danny): each US store's own fee to Miami, store by
   store, shown on the expanded card and the product page (both numbers,
   a meter of THAT store's subtotal) and itemized at checkout, where
   orders-create.js charges the same figure.

     node scripts/test/store-shipping-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  STORE_SHIPPING, SHIPPING_SALES_TAX_EXEMPT, shippingRuleText, cartShipping,
  shippingMeterText, shippingStandingText,
} from "../lib/store-shipping.js";
import { TAX_EXEMPT } from "../../netlify/functions/_search-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const bundle = read("build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)));

check("the table: Lucifer's sourced figures (Oct 30), each with its source; nothing guessed", () => {
  const r = (k) => [STORE_SHIPPING[k].feeUsd, STORE_SHIPPING[k].freeOverUsd];
  /* Danny's member doctrine: VS & PINK Rewards, $8 under $50 (c.6524139671). */
  assert.deepEqual(r("victoriassecret"), [8, 50]);
  assert.deepEqual(r("macys"), [10.95, 49]);
  for (const k of ["calzedonia", "intimissimi"]) assert.deepEqual(r(k), [9, 75]);
  assert.deepEqual(r("boxlunch"), [7.99, 75], "the observed 7.99, not the stale 6.99 (c.6524803125)");
  assert.deepEqual(r("walmart"), [6.99, 35]);
  assert.deepEqual(r("revolve"), [0, 0], "always free");
  assert.deepEqual(r("zumiez"), [null, 64.94], "calculated at the store's checkout; the corrected threshold");
  assert.deepEqual(r("parrot"), [null, null]);
  assert.ok(!STORE_SHIPPING.fuji, "FUJI waits for its threshold to be settled");
  for (const [k, x] of Object.entries(STORE_SHIPPING)) assert.match(x.source, /#443 c\.\d+/, k);
  assert.equal(shippingRuleText("fuji"), null, "no sourced terms: no rule (the box says the store calculates it)");
});

check("Foot Locker: the public rule, $7.99 under $99, free from $99 (#443 c.6547441472; FLX member rule on hold)", () => {
  assert.deepEqual([STORE_SHIPPING.footlocker.feeUsd, STORE_SHIPPING.footlocker.freeOverUsd], [7.99, 99]);
  assert.match(STORE_SHIPPING.footlocker.source, /#443 c\.6547441472/);
  assert.equal(shippingRuleText("footlocker"), "Envío gratis desde $99 · $7.99 debajo de ese monto");
  const under = cartShipping([{ retailer: "footlocker", dutiableUsd: 64.2, qty: 1 }]).stores[0];
  assert.equal(under.feeUsd, 7.99);
  assert.equal(shippingStandingText(under, "Foot Locker"), "Te faltan $39 para envío gratis en Foot Locker");
  const over = cartShipping([{ retailer: "footlocker", dutiableUsd: 107, qty: 1 }]).stores[0];
  assert.ok(over.met && over.feeUsd === 0);
});

check("never \"por confirmar\" on a store-shipping row: comparator, product page, checkout (#443 c.6547441472)", () => {
  const slice = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a) + a.length));
  const rows = {
    "search.html shipHTML": slice(read("search.html"), "function shipHTML(", "function compareRowHTML("),
    "producto.html shipBoxHtml": slice(read("producto.html"), "function shipBoxHtml(", "function refreshShipBox("),
    "checkout.html renderStoreShipping": slice(read("checkout.html"), "function renderStoreShipping(", "One renderer for the tax row"),
    "store-shipping.js": read("store-shipping.js").replace(/\/\*[\s\S]*?\*\//g, ""),
  };
  for (const [k, src] of Object.entries(rows)) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(code.length > 50, k + " not found");
    assert.doesNotMatch(code, /por confirmar|estamos confirmando/i, k);
  }
  assert.match(rows["search.html shipHTML"], /lo calcula la tienda al pagar<\/span>';\s*\}\s*$/);
});

/* THE FLAGGED STORES: live (in the search index) with no published fee on
   the table -- not on it, or feeUsd null. They read "lo calcula la tienda
   al pagar" and are charged nothing; listed here by name until their
   published policy is sourced. Foot Locker is no longer one of them. */
check("the stores still without a published fee are listed by name; Foot Locker is not one of them", () => {
  const idx = JSON.parse(read("assets/search/catalog-index.json"));
  const ri = idx.fields.indexOf("retailer");
  const live = [...new Set(idx.rows.map((r) => r[ri]))].sort();
  const flagged = live.filter((k) => !STORE_SHIPPING[k] || STORE_SHIPPING[k].feeUsd == null);
  assert.ok(!flagged.includes("footlocker"));
  console.log("         flagged (" + flagged.length + "): " + flagged.join(", "));
});

check("the card line carries the store's own rule, in every shape", () => {
  assert.equal(shippingRuleText("victoriassecret"), "Envío gratis desde $50 · $8 debajo de ese monto");
  assert.equal(shippingRuleText("everlast"), "Envío de la tienda en EE.UU.: $9.99");
  assert.equal(shippingRuleText("revolve"), "Envío gratis en EE.UU.");
  assert.equal(shippingRuleText("zumiez"), "Envío gratis desde $64.94 · debajo de ese monto lo calcula la tienda al pagar");
  assert.equal(shippingRuleText("parrot"), "Envío en EE.UU.: lo calcula la tienda al pagar");
});

check("the meter is per store, on the store's own prices; a store that calculates its fee is never charged a guess", () => {
  /* A $10.99 VS item: the cart line's dutiable base is the price plus the 7% sales tax. */
  const cart = [{ retailer: "victoriassecret", dutiableUsd: 11.76, qty: 1 }, { retailer: "zumiez", dutiableUsd: 21.4, qty: 1 }, { retailer: "fuji", dutiableUsd: 30, qty: 1 }];
  const ship = cartShipping(cart);
  const vs = ship.stores.find((s) => s.store === "victoriassecret");
  assert.equal(shippingMeterText(vs), "Estás en $10.99 de $50");
  assert.equal(shippingStandingText(vs, "Victoria's Secret"), "Te faltan $39.01 para envío gratis en Victoria's Secret");
  assert.equal(vs.feeUsd, 8);
  assert.equal(ship.totalUsd, 8, "Zumiez (calculated) and FUJI (no terms) are charged nothing");
  assert.deepEqual(ship.pending, ["zumiez"]);
  const met = cartShipping([{ retailer: "victoriassecret", dutiableUsd: 26.75, qty: 2 }]).stores[0];
  assert.ok(met.met && met.feeUsd === 0 && met.progress === 1);
  assert.equal(shippingStandingText(met, "Victoria's Secret"), "Envío gratis en Victoria's Secret: ya lo tienes");
  const free = cartShipping([{ retailer: "revolve", dutiableUsd: 10.7, qty: 1 }]).stores[0];
  assert.ok(free.met && free.feeUsd === 0 && !free.pending);
  assert.equal(cartShipping([{ retailer: "victoriassecret", lineType: "bundle-discount", dutiableUsd: 0, priceUsd: -5 }]).totalUsd, 0);
});

check("the sales-tax rule matches the one the search core and the product page use", () => {
  assert.deepEqual(SHIPPING_SALES_TAX_EXEMPT, TAX_EXEMPT);
  assert.match(read("producto.html"), /var TAX_EXEMPT = \{"walmart": 1\};/);
});

check("the product page: the store's box FIRST, above Impuestos and Peso, with its meter; re-drawn on add", () => {
  const html = read("producto.html");
  assert.match(html, /<script src="\/store-shipping\.js"><\/script>/);
  const i = html.indexOf("priceHtml += shipBoxHtml(p);"), t = html.indexOf(`priceHtml += '<div id="p-tax"`), w = html.indexOf(`priceHtml += '<div id="p-weight"`);
  assert.ok(i > 0 && i < t && t < w, "Costo de envío, then Impuestos, then Peso");
  assert.match(html, /Costo de envío de la tienda/);
  assert.match(html, /p-ship-meter/);
  assert.match(html, /refreshShipBox\(p\);/);
});

check("the expanded card on the homepage carries the line", () => {
  assert.match(read("index.html"), /<div id="productViewShipping"/);
  assert.match(read("index.html"), /<script src="\/store-shipping\.js"><\/script>/);
  assert.match(bundle, /S\.ruleText\(retailer\)/);
});

check("checkout: one group per store with its meter, its own row in the total; orders-create charges the same", () => {
  const co = read("checkout.html");
  assert.match(co, /const shipping = cartShipping\(cart\)\.totalUsd;/);
  assert.match(co, /totalUsd: round2\(goods \+ freight \+ tax \+ shipping\)/);
  assert.match(co, /id="storeShipPanel"/);
  assert.match(co, /storeShippingUsd: orderTotalsUsd\(\)\.shipping,/);
  const oc = read("netlify/functions/orders-create.js");
  assert.match(oc, /const storeShipping = cartShipping\(items\);/);
  assert.match(oc, /priceUsdTotal \+ freightUsdQuoted \+ taxEstimatedUsd \+ storeShippingUsd/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
