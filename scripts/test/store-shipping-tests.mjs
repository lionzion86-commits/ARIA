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

check("the table: Danny's figures, each with its source; nothing guessed", () => {
  assert.deepEqual({ ...STORE_SHIPPING.victoriassecret, source: undefined, verified: undefined }, { feeUsd: 7.99, freeOverUsd: 35, source: undefined, verified: undefined });
  for (const k of ["calzedonia", "intimissimi"]) assert.equal(STORE_SHIPPING[k].freeOverUsd, 75);
  assert.equal(STORE_SHIPPING.macys.feeUsd, 10.95);
  for (const [k, r] of Object.entries(STORE_SHIPPING)) assert.ok(r.source && typeof r.verified === "boolean", k);
  assert.equal(shippingRuleText("walmart"), null, "no sourced terms: no line");
});

check("the card line carries both numbers", () => {
  assert.equal(shippingRuleText("victoriassecret"), "Envío gratis desde $35 · $7.99 debajo de ese monto");
  assert.equal(shippingRuleText("macys"), "Envío de la tienda en EE.UU.: $10.95");
});

check("the meter is per store, on the store's own prices: «Estás en $10.99 de $35»", () => {
  /* A $10.99 VS item: the cart line's dutiable base is the price plus the 7% sales tax. */
  const cart = [{ retailer: "victoriassecret", dutiableUsd: 11.76, qty: 1 }, { retailer: "walmart", dutiableUsd: 60, qty: 1 }];
  const ship = cartShipping(cart);
  const vs = ship.stores.find((s) => s.store === "victoriassecret");
  assert.equal(shippingMeterText(vs), "Estás en $10.99 de $35");
  assert.equal(shippingStandingText(vs, "Victoria's Secret"), "Te faltan $24.01 para envío gratis en Victoria's Secret");
  assert.equal(vs.feeUsd, 7.99);
  assert.equal(ship.totalUsd, 7.99, "Walmart's $60 does not count toward VS, and Walmart (no terms) is charged nothing");
  const met = cartShipping([{ retailer: "victoriassecret", dutiableUsd: 21.4, qty: 2 }]).stores[0];
  assert.ok(met.met && met.feeUsd === 0 && met.progress === 1);
  assert.equal(shippingStandingText(met, "Victoria's Secret"), "Envío gratis en Victoria's Secret: ya lo tienes");
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
