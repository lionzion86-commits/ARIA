/* ==================================================================
   SALES PARITY: THE PRICE A SHOPPER SEES IS THE PRICE CHECKOUT CHARGES,
   AT EVERY STORE (#443 c.6684452115, Danny 2026-11-06; c.6675535499).

   The ruling: every store's price is shelf x 1.07 x tier, Walmart
   included (the 7% is computed on the shelf price, the margin after).
   The cost side stays separate: where Aria pays no tax at the register
   (Walmart, CCS, Venum -- addendum c.6684509088) the goods' true value,
   the dutiable base, carries no 7%.

   - one rule: /import-tax.js holds SALES_TAX_RATE, TAX_EXEMPT (price
     side, empty), COST_TAX_EXEMPT and PRE_PRICED; every copy (the
     bundle, each page, _search-core, store-shipping.js, sales-sources.js)
     agrees with it;
   - every copy prices the same raw shelf price to the same cent, for
     every store;
   - DISPLAYED == CHECKOUT, for every store: each storefront slice's
     products, priced the way tienda.html shows them, are the card price
     price-index.json holds, and repriceCart charges exactly that;
   - the live-deals cache (normalizeDeal) shows what checkout charges;
   - the worked checks: the $159.99 Walmart camera is $212.27 (was
     $198.39), its dutiable value stays $159.99; Aria Perfumes' stack;
   - the price index covers gym-brands, Calzedonia and Intimissimi
     (c.6675535499 defect 2).

     node scripts/test/sales-parity-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import "../../import-tax.js";
import { liftDeclarations, pageHtml } from "../lib/page-lift.mjs";
import { productIdFor, repriceCart } from "../../netlify/functions/_checkout-model.js";
import * as Core from "../../netlify/functions/_search-core.js";
import * as Ship from "../lib/store-shipping.js";
import * as Sales from "../lib/sales-sources.js";
import { costTaxRate as wdCostTaxRate, salesTaxRate as wdSalesTaxRate, PRE_PRICED as WD_PRE } from "../../weight-data.js";

const T = globalThis.AriaImportTax;
const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
const r2 = (n) => Math.round(Number(n) * 100) / 100;
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log(`  ok   ${name}${note ? ` -- ${note}` : ""}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e && e.stack || e).split("\n").slice(0, 4).join(" | ")}`); }
}
const keys = (o) => Object.keys(o || {}).sort();

/* ---- every copy of the rule ---- */
const html = pageHtml(ROOT);
const B = liftDeclarations(html, ["SALES_TAX_RATE", "TAX_EXEMPT_STATUS", "salesTaxRateFor", "costTaxRateFor", "PRE_PRICED", "tieredMarginUsd"]);
const PAGES = ["tienda.html", "auto.html", "producto.html", "motos.html", "ropa-interior.html", "aria-auto.html", "departamento.html", "marca.html"];
function pageCopies(file) {
  const src = read(file).replace(/\r\n/g, "\n");
  const out = [];
  const re = /var TAX_EXEMPT = (\{[^}]*\});/g;
  let m;
  while ((m = re.exec(src))) {
    const tail = src.slice(m.index, m.index + 4000);
    const grab = (rx) => { const x = rx.exec(tail); return x ? x[0] : ""; };
    const code = [
      grab(/var TAX_EXEMPT = \{[^}]*\};/), grab(/var COST_TAX_EXEMPT = \{[^}]*\};/), grab(/var PRE_PRICED = \{[^}]*\};/),
      grab(/function salesTaxRate\(retailer\)\{[^\n]*\}/), grab(/function costTaxRate\(retailer\)\{[^\n]*\}/),
    ];
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(code.join("\n") + "\nthis.api = { TAX_EXEMPT, COST_TAX_EXEMPT, PRE_PRICED, salesTaxRate, costTaxRate };", ctx);
    out.push(ctx.api);
  }
  return out;
}

console.log("\n  One rule, every copy");
await check("import-tax.js: x1.07 price side at every store, cost side exempt only at Walmart, CCS, Venum; perfumes 1.07 x 1.18", () => {
  assert.equal(T.SALES_TAX_RATE, 1.07);
  assert.deepEqual(keys(T.TAX_EXEMPT), []);
  assert.deepEqual(keys(T.COST_TAX_EXEMPT), ["ccs", "venum", "walmart"]);
  assert.deepEqual({ ...T.PRE_PRICED }, { ariaperfumes: 1.2626 });
  assert.equal(T.salesTaxRate("walmart"), 1.07);
  assert.equal(T.costTaxRate("walmart"), 1);
  assert.equal(wdSalesTaxRate("Walmart"), 1.07);
  assert.equal(wdCostTaxRate("venum"), 1);
  assert.deepEqual({ ...WD_PRE }, { ...T.PRE_PRICED });
});
await check("the bundle: salesTaxRateFor is 1.07 for every store; its 'exempt' rows are the cost-side list; PRE_PRICED matches", () => {
  for (const k of ["walmart", "ccs", "venum", "macys", "nike", "", null]) assert.equal(B.salesTaxRateFor(k), 1.07, String(k));
  const exempt = Object.entries(B.TAX_EXEMPT_STATUS).filter(([, s]) => s === "exempt").map(([k]) => k).sort();
  assert.deepEqual(exempt, keys(T.COST_TAX_EXEMPT));
  for (const k of exempt) assert.equal(B.costTaxRateFor(k), 1);
  assert.equal(B.costTaxRateFor("macys"), 1.07);
  assert.deepEqual({ ...B.PRE_PRICED }, { ...T.PRE_PRICED });
});
await check("every page copy and _search-core carry the same lists", () => {
  let n = 0;
  for (const f of PAGES) for (const api of pageCopies(f)) {
    n++;
    assert.deepEqual(keys(api.TAX_EXEMPT), [], f + ": price-side exemption");
    assert.deepEqual(keys(api.COST_TAX_EXEMPT), keys(T.COST_TAX_EXEMPT), f + ": cost side");
    assert.deepEqual({ ...api.PRE_PRICED }, { ...T.PRE_PRICED }, f + ": PRE_PRICED");
    assert.equal(api.salesTaxRate("walmart"), 1.07, f);
    assert.equal(api.costTaxRate("walmart"), 1, f);
  }
  assert.equal(n, PAGES.length + 1, "aria-auto.html carries two copies");
  assert.deepEqual(keys(Core.TAX_EXEMPT), []);
  assert.deepEqual(keys(Core.COST_TAX_EXEMPT), keys(T.COST_TAX_EXEMPT));
  assert.deepEqual({ ...Core.PRE_PRICED }, { ...T.PRE_PRICED });
  return `${n} page copies`;
});
await check("store-shipping.js backs a line's store price out with the cost-side rate; sales-sources.js prices deals at 1.07", () => {
  assert.deepEqual(keys(Ship.SHIPPING_SALES_TAX_EXEMPT), keys(T.COST_TAX_EXEMPT));
  assert.equal(Sales.SALES_TAX_RATE, T.SALES_TAX_RATE);
  assert.equal(Sales.tieredMarginUsd(159.99), B.tieredMarginUsd(159.99));
});

/* ---- every store's formula ---- */
const stores = readdirSync(ROOT + "assets/tienda").filter((k) => !k.startsWith("_") && existsSync(`${ROOT}assets/tienda/${k}/index.json`));
const tienda = (() => {
  const src = read("tienda.html").replace(/\r\n/g, "\n");
  const lift = (start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); let d = 0, j = src.indexOf("{", i); for (; j < src.length; j++) { if (src[j] === "{") d++; else if (src[j] === "}" && --d === 0) break; } return src.slice(i, j + 1); };
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext([lift("function tieredMarginUsd("), /var TAX_EXEMPT = \{[^}]*\};/.exec(src)[0], /var COST_TAX_EXEMPT = \{[^}]*\};/.exec(src)[0], /var PRE_PRICED = \{[^}]*\};/.exec(src)[0],
    /function salesTaxRate\(retailer\)\{[^\n]*\}/.exec(src)[0], lift("function finalUsd(")].join("\n") + "\nthis.finalUsd = finalUsd;", ctx);
  return ctx.finalUsd;
})();
await check(`every store (${stores.length}): tienda.html, import-tax.js and _search-core price a shelf price the same, x1.07 x tier`, () => {
  const bad = [];
  for (const k of stores) for (const raw of [9.99, 49.5, 159.99, 612.4, 2500]) {
    const want = T.PRE_PRICED[k] ? r2(raw) : r2((raw + B.tieredMarginUsd(raw)) * 1.07);
    const got = [tienda(raw, k), T.finalUsd(raw, k), Core.finalUsd(raw, k)];
    if (got.some((g) => g !== want)) bad.push(`${k} ${raw}: want ${want}, got ${got.join("/")}`);
  }
  assert.deepEqual(bad, []);
});

/* ---- displayed == checkout, every store ---- */
const index = JSON.parse(read("price-index.json"));
const prices = index.prices;
/* A title several listings carry at different prices (colourways, sale
   twins) is charged by its listing id (variantId), which a storefront
   head card does not carry: those titles are checked by catalogue-parity
   and the variant tests, not here. Only single-price titles are compared. */
const multiPrice = (() => {
  const si = JSON.parse(read("assets/search/catalog-index.json"));
  const F = Object.fromEntries(si.fields.map((f, i) => [f, i]));
  const seen = new Map();
  for (const r of si.rows) {
    const k = r[F.retailer] + "\u0000" + r[F.title];
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k).add(r[F.price]);
  }
  return new Set([...seen].filter(([, v]) => v.size > 1).map(([k]) => k));
})();
await check("DISPLAYED == CHECKOUT at every store: each storefront's products, as tienda.html shows them, are the price checkout charges", () => {
  const bad = [], covered = [], uncovered = [];
  let lines = 0;
  for (const k of stores) {
    const f = JSON.parse(read(`assets/tienda/${k}/index.json`));
    const items = (f.rails || []).flatMap((r) => r.head || []).filter((it) => Number(it.price) > 0 && it.name).slice(0, 12);
    let hit = 0;
    for (const it of items) {
      if (multiPrice.has(k + "\u0000" + it.name)) continue;
      const shown = tienda(it.price, k);
      const known = prices[productIdFor(k, it.name)];
      if (!known) continue;
      hit++;
      const [card, , sale] = known;
      if (shown !== card && shown !== sale) { bad.push(`${k} «${it.name}»: shows ${shown}, index ${card}${sale != null ? "/" + sale : ""}`); continue; }
      const { lines: out, adjustments } = repriceCart([{ retailer: k, title: it.name, priceUsd: shown, qty: 1 }], prices);
      lines++;
      if (adjustments.length || out[0].priceUsd !== shown || !out[0].priceVerified) bad.push(`${k} «${it.name}»: checkout charged ${out[0].priceUsd}`);
    }
    (hit ? covered : uncovered).push(k);
  }
  assert.deepEqual(bad.slice(0, 15), [], `${bad.length} mismatches`);
  assert.ok(covered.includes("walmart"), "Walmart is not covered");
  return `${lines} lines across ${covered.length} stores verified; no index rows for: ${uncovered.join(", ") || "none"}`;
});
await check("the live-deals cache (normalizeDeal) shows what checkout charges, Walmart included", () => {
  for (const retailer of ["walmart", "oldnavy", "footlocker"]) {
    const d = Sales.normalizeDeal({ title: "Women's Crew Neck T-Shirt", price: 50, wasPrice: 80, onSale: true }, retailer);
    assert.ok(d, retailer + ": the fixture was not kept as a deal");
    assert.equal(d.price, T.finalUsd(50, retailer), retailer);
    assert.equal(d.price, 66.34, retailer + ": $50 shelf -> (50 + 12) x 1.07 (c.6675535499's figure)");
  }
});

/* ---- worked checks ---- */
await check("Walmart worked check: the $159.99 camera is $212.27 (was $198.39); cost side stays $159.99", () => {
  assert.equal(T.finalUsd(159.99, "walmart"), 212.27);
  assert.equal(tienda(159.99, "walmart"), 212.27);
  assert.equal(T.dutiableOf({ raw: 159.99, retailer: "walmart" }), 159.99);
  assert.equal(T.dutiableOf({ usd: 212.27, retailer: "walmart" }), 159.99);
  assert.equal(T.dutiableOf({ raw: 100, retailer: "macys" }), 107);
  assert.equal(T.dutiableOf({ raw: 100, retailer: "ccs" }), 100);
});
await check("the index carries Walmart at x1.07 with a x1.00 dutiable value, and Aria Perfumes' stack", () => {
  const vals = Object.values(prices);
  const wm = JSON.parse(read("assets/tienda/walmart/index.json")).rails.flatMap((r) => r.head || []).find((it) => prices[productIdFor("walmart", it.name)]);
  const [card, dut] = prices[productIdFor("walmart", wm.name)];
  assert.equal(card, r2((wm.price + B.tieredMarginUsd(wm.price)) * 1.07), "Walmart card " + wm.name);
  assert.equal(dut, r2(wm.price), "Walmart dutiable " + wm.name);
  assert.ok(vals.some(([p, d]) => p === 189.39 && d === 150), "Sauvage EDT 100 ml: $189.39 / cost $150");
  assert.ok(vals.some(([p, d]) => p === 69.24 && d === 54.84), "1 Million: $69.24 / cost $54.84");
  return `Walmart «${wm.name}» shelf $${wm.price} -> $${card}, dutiable $${dut}`;
});
await check("the price index covers the 14 stores c.6675535499 found missing (gym-brands, Calzedonia, Intimissimi)", () => {
  const want = ["athleta", "aybl", "killcrew", "oneractive", "calzedonia", "intimissimi", "ryderwear", "bornprimitive", "buffbunny", "gorillawear", "fleo", "tlfapparel", "ironrebel", "paragonfitwear"];
  const missing = [];
  for (const k of want) {
    const f = `assets/tienda/${k}/index.json`;
    if (!existsSync(ROOT + f)) { missing.push(k + " (no storefront)"); continue; }
    const it = JSON.parse(read(f)).rails.flatMap((r) => r.head || []).find((x) => x.name && Number(x.price) > 0);
    if (!it || !prices[productIdFor(k, it.name)]) missing.push(k);
  }
  assert.deepEqual(missing, []);
});

await check("wholesale cost is never served: no public perfume row carries a cost or dutiable field", () => {
  const files = ["perfumes-catalog.json", "ofertas-feed.json", "ofertas-feed-lite.json",
    ...readdirSync(ROOT + "assets/home/shelves").map((f) => "assets/home/shelves/" + f),
    "assets/tienda/_fn/ariaperfumes.json", "assets/sections/departamento/_fn/perfumes.json"];
  const bad = [];
  const walk = (o, f) => {
    if (Array.isArray(o)) { for (const v of o) walk(v, f); return; }
    if (!o || typeof o !== "object") return;
    if (o.retailer === "ariaperfumes") for (const k of Object.keys(o)) if (/wholesale|cost|dutiable|msrp/i.test(k)) bad.push(`${f}: ${k}`);
    for (const v of Object.values(o)) walk(v, f);
  };
  for (const f of files) if (existsSync(ROOT + f)) walk(JSON.parse(read(f)), f);
  assert.deepEqual([...new Set(bad)], []);
  assert.doesNotMatch(read("perfumes-catalog.json"), /wholesale|msrp_usd/);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
