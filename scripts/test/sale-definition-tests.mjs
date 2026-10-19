/* ==================================================================
   ONE ON-SALE DEFINITION (2026-10-13 audit, Part 2).

   Department Ofertas (rawItemOnSale), the store rails (itemSaleTier /
   carouselIsSale / carouselDiscountPct), the cross-store mix
   (isSaleItem) and the standalone pages (sale-rule.js, generated from
   index.html) must give one answer: a real was-price, 5-70% off. A
   merchant flag with no was-price is never a deal.

   The page's own functions are lifted out of index.html (not copied)
   and run over every committed catalogue.

   RUNNING IT
     node scripts/test/sale-definition-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { liftDeclarations, pageHtml } from "../lib/page-lift.mjs";
import { buildSaleRuleSource } from "../build-sale-rule.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const html = pageHtml(ROOT);
const P = liftDeclarations(html, ["MIN_DISCOUNT_PCT", "OFERTAS_MAX_DISCOUNT_PCT", "SALE_ORIGINAL_FIELDS", "saleNumber",
  "salePriceOf", "saleOriginalPrice", "saleDiscountPct", "isOnSaleItem", "rawItemOnSale", "carouselDiscountPct",
  "carouselIsSale", "itemSaleTier", "OFERTAS_MIX_MAX_PRICE_USD", "isSaleItem", "DEPT_CACHE_PARTS", "CATALOGUE_FILES"]);

/* Every committed catalogue item, per retailer. */
const byStore = {};
for (const url of [...P.DEPT_CACHE_PARTS, ...P.CATALOGUE_FILES]) {
  const path = ROOT + url.slice(1);
  if (!existsSync(path)) continue;
  for (const [rk, r] of Object.entries(JSON.parse(readFileSync(path, "utf8")).retailers || {}))
    for (const d of Object.values(r.departments || {})) for (const it of d.items || []) (byStore[rk] = byStore[rk] || []).push(it);
}

check("the rule: a real was-price, 5-70% off; a flag alone is nothing", () => {
  const pct = P.saleDiscountPct;
  assert.equal(pct({ price: 69.99, onSale: true }), 0, "a bare onSale flag is a sale");
  assert.equal(pct({ price: 50, isOnSale: true, percentOff: 30 }), 0, "a percentOff with no was-price is a sale");
  assert.equal(pct({ price: 35, originalPrice: 65 }), 46, "a was-price with no flag (Finish Line) is not a sale");
  assert.equal(pct({ price: 60, compareAt: 80 }), 25, "Shopify's compareAt is not a was-price");
  assert.equal(pct({ price: "$45.00", regularPrice: "$60.00" }), 25, "string prices are not read");
  assert.equal(pct({ price: 10, originalPrice: 0, regularPrice: 20 }), 50, "a zero-filled originalPrice hides the regularPrice");
  assert.equal(pct({ price: 6, originalPrice: 20 }), 70, "exactly 70% is a sale");
  assert.equal(pct({ price: 5.8, originalPrice: 20 }), 0, "71% off is a sale");
  assert.equal(pct({ price: 2, originalPrice: 705 }), 0, "a $705 crate at 99% off is a sale");
  assert.equal(pct({ price: 96, originalPrice: 100 }), 0, "4% off is a sale");
  assert.equal(pct({ price: 95.4, originalPrice: 100 }), 5, "4.6% (badge -5%) is not a sale");
  assert.equal(pct({ price: 100, originalPrice: 90 }), 0, "a was-price below the price is a sale");
});

check("department, rails and the mix ask the same question of every catalogue item", () => {
  let n = 0;
  for (const [rk, items] of Object.entries(byStore)) for (const it of items) {
    n++;
    const on = P.isOnSaleItem(it);
    assert.equal(P.rawItemOnSale(it), on, `${rk} "${it.name || it.title}": department disagrees`);
    assert.equal(P.carouselIsSale(it), on, `${rk} "${it.name || it.title}": carouselIsSale disagrees`);
    assert.equal(P.itemSaleTier(it) > 0, on, `${rk} "${it.name || it.title}": the rail tier disagrees`);
    assert.equal(P.carouselDiscountPct(it), P.saleDiscountPct(it), `${rk} "${it.name || it.title}": the rail's % disagrees`);
    assert.equal(P.isSaleItem(it), on && P.salePriceOf(it) <= P.OFERTAS_MIX_MAX_PRICE_USD, `${rk}: the mix is not the rule plus the cap`);
  }
  assert.ok(n > 100000, `only ${n} items loaded`);
});

check("the brief's spot checks: CCS, Target, SSENSE count the same everywhere; New Balance has no Ofertas", () => {
  for (const rk of ["ccs", "target", "ssense", "finishline", "mainland"]) {
    const items = byStore[rk] || [];
    const dept = items.filter(P.rawItemOnSale).length, rail = items.filter(it => P.itemSaleTier(it) > 0).length;
    assert.ok(dept > 0, `${rk} has no sales at all`);
    assert.equal(dept, rail, `${rk}: department ${dept}, rail ${rail}`);
  }
  const nb = byStore.newbalance || [];
  assert.ok(nb.length > 500, "newbalance-catalog.json did not load");
  assert.ok(nb.some(it => it.onSale === true), "New Balance no longer carries flag-only items (update this check)");
  assert.equal(nb.filter(it => P.itemSaleTier(it) > 0).length, 0, "a flagged New Balance item with no was-price is on sale");
});

check("every item on sale has a was-price above its price and a badge between 5% and 70%", () => {
  for (const [rk, items] of Object.entries(byStore)) for (const it of items) {
    const pct = P.saleDiscountPct(it);
    if (!pct) continue;
    assert.ok(P.saleOriginalPrice(it) > P.salePriceOf(it), `${rk} "${it.name || it.title}" has no was-price`);
    assert.ok(pct >= 5 && pct <= 70, `${rk} "${it.name || it.title}" badges -${pct}%`);
  }
  const feed = JSON.parse(readFileSync(ROOT + "ofertas-feed.json", "utf8")).items || [];
  /* The feed is built with this rule (scripts/build-ofertas-feed.mjs,
     2026-10-13 #386), so no row may sit outside it: none over 70% off,
     none the rule would not call a sale. */
  const over = feed.filter(it => Math.round((1 - it.price / it.originalPrice) * 100) > 70);
  assert.equal(over.length, 0, `${over.length} feed rows are over 70% off — rebuild: node scripts/build-ofertas-feed.mjs`);
  /* Feed prices are card prices: the tiered margin can round a raw 5%
     markdown down to a 4% badge above $500 (one RevZilla helmet today).
     Nothing else may fall under the floor. */
  const under = feed.filter(it => Math.round((1 - it.price / it.originalPrice) * 100) < 5);
  assert.ok(under.length <= 3 && under.every(it => Math.round((1 - it.price / it.originalPrice) * 100) === 4 && it.originalPrice > 500),
    "feed rows under the 5% floor: " + under.slice(0, 3).map(it => it.retailer + " " + it.title).join(" | "));
});

check("normalizeLiveItem builds its badge from the same rule", () => {
  const src = html.replace(/\r\n/g, "\n");
  const at = src.indexOf("function normalizeLiveItem(");
  const body = src.slice(at, src.indexOf("\nfunction ", at + 10));
  assert.match(body, /const hasRealDiscount = price != null && saleDiscountPct\(item\) > 0;/, "normalizeLiveItem has its own sale rule");
  assert.match(body, /const rawOriginalNum = saleOriginalPrice\(item\);/, "normalizeLiveItem picks its own was-price");
  assert.ok(!/onSaleFlag/.test(body), "normalizeLiveItem still reads the merchant flag");
  for (const gone of ["itemIsOnSaleFlagged", "CAROUSEL_MIN_DISCOUNT_PCT"])
    assert.ok(!new RegExp(`\\b${gone}\\b`).test(src), `${gone} is back in index.html`);
});

/* The standalone pages. */
const PAGES = ["tienda.html", "marca.html", "ofertas.html", "departamento.html", "motos.html", "disenadores.html", "ropa-interior.html"];
/* ofertas.html draws server-built slices (#409): its sale rule runs in
   scripts/build-ofertas-slices.mjs, so it loads no rule of its own. */
const RULE_PAGES = PAGES.filter((p) => p !== "ofertas.html");
const win = {};
new Function("window", readFileSync(ROOT + "sale-rule.js", "utf8"))(win);

check("sale-rule.js is index.html's rule today, and the standalone pages load it first", () => {
  assert.equal(readFileSync(ROOT + "sale-rule.js", "utf8"), buildSaleRuleSource(), "sale-rule.js is stale — run: node scripts/build-sale-rule.mjs");
  for (const [rk, items] of Object.entries(byStore)) for (const it of items.slice(0, 400))
    assert.equal(win.AriaSale.discountPct(it), P.saleDiscountPct(it), `sale-rule.js and index.html disagree on ${rk} "${it.name || it.title}"`);
  for (const page of RULE_PAGES) {
    const src = readFileSync(ROOT + page, "utf8");
    const tag = src.indexOf('<script src="sale-rule.js"></script>');
    assert.ok(tag > 0, `${page} does not load sale-rule.js`);
    assert.ok(tag < src.search(/<script>/), `${page} loads sale-rule.js after its own script`);
    assert.match(src, /window\.AriaSale\./, `${page} does not ask sale-rule.js`);
  }
});

check("the store page: New Balance's flagged items make no Ofertas rail; CCS's compareAt sales do", () => {
  const src = readFileSync(ROOT + "tienda.html", "utf8");
  const lift = (sig) => { const at = src.indexOf(sig); assert.ok(at >= 0, sig + " moved"); return src.slice(at, src.indexOf("\n}\n", at) + 2); };
  const T = new Function("window", [lift("function discountPct("), lift("function saleTier(")].join("\n") + "\nreturn { discountPct, saleTier };")(win);
  assert.ok(!/\.onSale\b/.test(lift("function saleTier(")), "saleTier reads the merchant flag");
  assert.equal((byStore.newbalance || []).filter(it => T.saleTier(it) > 0).length, 0, "New Balance's store page has an Ofertas rail");
  const ccs = (byStore.ccs || []);
  assert.equal(ccs.filter(it => T.saleTier(it) > 0).length, ccs.filter(P.rawItemOnSale).length, "CCS's store page and department disagree");
  /* The crossed-out price carries the same margin and tax as the price. */
  assert.match(src, /'<span class="price-old">' \+ fmtUSD\(finalUsd\(p\.originalPrice, storeKey\)\)/, "the store card crosses out the raw US price");
});

check("no standalone page treats a bare onSale flag as a sale", () => {
  for (const page of PAGES) {
    const src = readFileSync(ROOT + page, "utf8");
    assert.ok(!/!!\(\s*(?:raw|it)\.onSale\b/.test(src), `${page} copies the merchant flag into onSale`);
    assert.ok(!/\(\s*a\.onSale\s*\?\s*1/.test(src), `${page} sorts by the merchant flag`);
  }
  const ofertas = readFileSync(ROOT + "scripts/build-ofertas-slices.mjs", "utf8");
  /* The gate is the one rule; the $150 cap is the shared rule's own and
     applies to the all-stores mix only (#386: a single store shows its
     full count). */
  assert.match(ofertas, /if \(!sale\.isOnSale\(p\)\) continue;/, "the Ofertas slices have their own deal gate");
  assert.match(ofertas, /m: sale\.isMixDeal\(p\) \? 1 : 0/, "the Ofertas mix keeps its own price cap");
  assert.ok(!/PRICE_CAP_USD|MAX_PCT\s*=/.test(ofertas), "the Ofertas slices keep their own cap or ceiling");
});

const MIN_CHECKS = 8;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
