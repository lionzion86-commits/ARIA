/* ==================================================================
   ARIA PERFUMES -- the Perfumes department from the FragranceX feed
   (#443 item 32, 2026-10-24).

   The rules: Aria's price is cost x 1.18 for the launch promo (tiered
   after 90 days); the supplier's cost never reaches a public file; the
   import-tax base is the goods' true value, never the margin; testers,
   minis, sets and body care are their own classes, never merged; the
   four-per-order perfume cap counts them.

     node scripts/test/perfumes-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as B from "../build-perfumes-catalog.mjs";
import { PRE_PRICED, LAUNCH_PRICED, LAUNCH_LABEL, tieredMarginUsd } from "../../weight-data.js";
import { buildPerfumeSections, perfumeClassOf } from "../../netlify/functions/_department-core.js";
import { isFragranceItem } from "../lib/fragrance.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}
const fixture = (over = {}) => ({
  sku: "900001", name: "Fixture Eau by Fixture House", brand: "Fixture House", type_raw: "Eau De Parfum Spray 3.4 oz", title_raw: "Fixture Eau by Fixture House Eau De Parfum Spray 3.4 oz for Women",
  description_en: "A fixture.", concentration: "EDP", form: "spray", size_label: "3.4 oz", size_oz: 3.4, size_metric_raw: "100 ml", size_ml: 100, gender: "Women", unisex: false,
  msrp_usd: 120, wholesale_usd: 50, image_url: "https://img.example.test/a.jpg", product_url: "https://supplier.example.test/p/1", qty_feed: 500, low_stock_signal: false,
  classes: [], primary_class: "retail_spray", adjacent_subtype: null, sellable: true, exclude_reason: null, dup_group: null, data_needs: ["weight_kg", "upc"], ...over,
});

await check("Aria's price is cost x 1.18 during the promo, the tiered margin after it", () => {
  assert.equal(B.ariaPrice(150, true), 177);
  assert.equal(B.ariaPrice(397, true), 468.46);
  assert.equal(B.ariaPrice(23.10, true), 27.26);
  assert.equal(B.ariaPrice(150, false), Math.round((150 + tieredMarginUsd(150)) * 100) / 100);
  assert.equal(B.promoActive(new Date("2027-01-01"), null), true, "no launch date yet: the promo has not started counting");
  assert.equal(B.promoActive(new Date("2026-11-20"), "2026-11-01"), true);
  assert.equal(B.promoActive(new Date("2027-02-01"), "2026-11-01"), false, "90 days after launch the promo ends");
  assert.equal(PRE_PRICED.ariaperfumes, 1 + B.PROMO_MARGIN, "the pages' factor is the builder's margin");
});

await check("launch pricing is one switch: the label shows exactly while the promo prices the lane", () => {
  assert.equal(!!LAUNCH_PRICED.ariaperfumes, B.promoActive(), "weight-data.js LAUNCH_PRICED disagrees with the builder's promo");
  assert.equal(LAUNCH_LABEL, "Precio de lanzamiento");
  const pages = { "departamento.html": /var LAUNCH_PRICED = (\{[^}]*\});/, "producto.html": /var LAUNCH_PRICED = (\{[^}]*\});/, "search.html": /var LAUNCH_PRICED = (\{[^}]*\});/ };
  for (const [f, rx] of Object.entries(pages)) {
    const m = rx.exec(readFileSync(ROOT + f, "utf8"));
    assert.ok(m, f + " has no LAUNCH_PRICED");
    assert.deepEqual(JSON.parse(m[1]), { ...LAUNCH_PRICED }, f + "'s launch list drifted from weight-data.js");
    assert.ok(readFileSync(ROOT + f, "utf8").includes(LAUNCH_LABEL), f + " never prints the label");
  }
  const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((x) => /^app-[0-9a-f]{16}\.js$/.test(x)), "utf8");
  const bm = /const LAUNCH_PRICED = \{ ariaperfumes: (true|false) \};/.exec(bundle);
  assert.ok(bm && (bm[1] === "true") === !!LAUNCH_PRICED.ariaperfumes, "the bundle's launch list drifted");
});

await check("a public row carries no cost, no supplier link, no stock count", () => {
  const r = B.rowOf(fixture({ low_stock_signal: true, qty_feed: 7 }));
  const s = JSON.stringify(r);
  assert.equal(r.price, 59);
  for (const bad of ["wholesale", "msrp", "product_url", "supplier.example.test", "qty", "\"url\""]) assert.ok(!s.includes(bad), bad + " leaked: " + s);
  assert.equal(r.lowStock, true);
  assert.equal(r.weightEstimated, true, "a size-class weight is never presented as verified");
  assert.equal(r.retailer, "ariaperfumes");
  assert.match(r.title, /^Fixture Eau — Eau de Parfum en spray 100 ml \(3\.4 oz\) para mujer$/);
});

await check("a compare-at shows only when the store's list price is really above Aria's", () => {
  assert.equal(B.rowOf(fixture({ msrp_usd: 120 })).originalPrice, 120);
  assert.equal(B.rowOf(fixture({ msrp_usd: 59.5 })).originalPrice, undefined, "a list price within 5% is not a sale");
  assert.equal(B.rowOf(fixture({ msrp_usd: 40 })).originalPrice, undefined, "a stale list price under cost is never a was-price");
  assert.equal(B.rowOf(fixture({ msrp_usd: null })).originalPrice, undefined);
});

await check("classes are never merged: testers, minis, sets, refills and body care keep their label and rail", () => {
  const t = B.rowOf(fixture({ classes: ["tester"], primary_class: "tester" }));
  assert.match(t.title, /\(Tester\)/); assert.equal(t.tester, true); assert.equal(B.bucketOf(fixture({ classes: ["tester"], primary_class: "tester" })), "testers");
  assert.match(B.rowOf(fixture({ classes: ["unboxed"] })).title, /\(Sin caja\)/);
  assert.match(B.rowOf(fixture({ primary_class: "mini_travel", size_ml: 5, size_label: ".17 oz" })).title, /\(Mini\)/);
  assert.equal(B.bucketOf(fixture({ primary_class: "gift_set" })), "sets");
  const lotion = fixture({ primary_class: "fragrance_adjacent", adjacent_subtype: "body_lotion", concentration: null });
  assert.equal(B.rowOf(lotion).type, "Cuidado corporal");
  assert.match(B.rowOf(lotion).title, /— Loción corporal/);
  assert.equal(B.rowOf(fixture({ primary_class: "fragrance_adjacent", adjacent_subtype: "body_mist" })).type, "Fragancia", "a body mist flies as a fragrance");
});

await check("one SKU per near-duplicate group (the cheapest), and unsellable rows never list", () => {
  const { catalog, stats } = B.buildPerfumesCatalog([
    fixture({ sku: "1", dup_group: "g1", wholesale_usd: 25.76 }), fixture({ sku: "2", dup_group: "g1", wholesale_usd: 23.10 }),
    fixture({ sku: "3", sellable: false, wholesale_usd: 0 }), fixture({ sku: "4" }),
  ], { promo: true });
  const items = Object.values(catalog.retailers.ariaperfumes.departments).flatMap((d) => d.items);
  assert.deepEqual(items.map((i) => i.sku).sort(), ["2", "4"]);
  assert.equal(stats.dupDropped, 1); assert.equal(stats.unsellable, 1);
});

await check("the committed catalogue is the builder's output and holds no cost", () => {
  const ingest = JSON.parse(readFileSync(ROOT + B.INGEST, "utf8"));
  const { catalog } = B.buildPerfumesCatalog(ingest.products);
  const committed = JSON.parse(readFileSync(ROOT + B.OUT_FILE, "utf8"));
  assert.equal(committed.declaredProductCount, catalog.declaredProductCount, "run: node scripts/build-perfumes-catalog.mjs");
  const raw = readFileSync(ROOT + B.OUT_FILE, "utf8");
  for (const bad of ["wholesale", "msrp_usd", "fragrancex.com/products", "qty_feed"]) assert.ok(!raw.includes(bad), bad);
  /* Spot-check the audit's anchors. */
  const items = Object.values(committed.retailers.ariaperfumes.departments).flatMap((d) => d.items);
  const find = (re) => items.find((i) => re.test(i.title));
  assert.equal(find(/^Sauvage — Eau de Toilette en spray 100 ml \(3\.4 oz\) para hombre$/).price, 177);
  assert.equal(find(/^Aventus — Eau de Parfum en spray 100 ml \(3\.3 oz\) para hombre$/).price, 468.46);
});

await check("the supplier file and checkout's price list are never served", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /from = "\/hidden-docs\/\*"\s+to = "\/404"\s+status = 404\s+force = true/);
  assert.match(toml, /from = "\/price-index\.json"\s+to = "\/404"\s+status = 404\s+force = true/);
  assert.ok(B.INGEST.startsWith("hidden-docs/"));
});

await check("checkout charges Aria's price and taxes the goods' true value, never the margin", () => {
  const idx = JSON.parse(readFileSync(ROOT + "price-index.json", "utf8")).prices;
  const vals = Object.values(idx);
  assert.ok(vals.some(([p, d]) => p === 177 && d === 150), "Sauvage 100 ml: US$177, dutiable US$150");
  assert.ok(vals.some(([p, d]) => p === 468.46 && d === 397), "Aventus 100 ml: US$468.46, dutiable US$397 (over the US$200 line)");
});

await check("the department: the great houses first, then the sales, each class, the houses (classics first), body care last", () => {
  const head = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/perfumes/head.json", "utf8"));
  const titles = head.rails.map((r) => r.title);
  assert.deepEqual(titles.slice(0, 5), ["Las grandes casas", "Ofertas", "Testers", "Minis y de viaje", "Sets de regalo"]);
  assert.equal(titles[5], "Christian Dior", "the house rails open on the classics' houses");
  assert.equal(titles[titles.length - 1], "Cuerpo y cuidado");
  assert.deepEqual(head.labels, { ariaperfumes: "Aria Perfumes" });
  const lead = head.rails[0].cards;
  for (const c of lead) {
    assert.ok(!/\((?:[^)]*\b)?(?:Tester|Mini|Repuesto|Sin caja)\b/.test(c.t), "a great-house card is the boxed bottle: " + c.t);
  }
  assert.match(lead[0].t, /^Sauvage — /, "Sauvage leads");
  assert.ok(lead.some((c) => /^Aventus — .* para hombre$/.test(c.t)), "the men's Aventus is the classic");
  const names = lead.map((c) => c.t.split(" — ")[0]);
  assert.equal(new Set(names).size, names.length, "a fragrance shows twice on the lead rail");
  assert.ok(lead.some((c) => c.s > 0) && lead.some((c) => !(c.s > 0)), "classics and sales interleave");
  assert.ok(head.rails[2].cards.every((c) => /\bTester\b/.test(c.t)), "the Testers rail is testers");
  /* A tester never sits on a house rail. */
  const sections = buildPerfumeSections([
    { title: "A — Eau de Parfum en spray 100 ml (3.4 oz) (Tester) para mujer", brand: "Lattafa", retailer: "ariaperfumes", rawPrice: 10, salePct: 0, type: "Fragancia" },
    ...["A", "B", "C"].map((n) => ({ title: `${n} — Eau de Parfum en spray 100 ml (3.4 oz) para mujer`, brand: "Lattafa", retailer: "ariaperfumes", rawPrice: 20, salePct: 0, type: "Fragancia" })),
  ]);
  const house = sections.find((s) => s.key === "marca:lattafa");
  assert.equal(house.items.length, 3);
  assert.equal(perfumeClassOf({ title: "X — Loción corporal 200 ml para mujer", type: "Cuidado corporal" }), "cuidado");
});

await check("the four-per-order cap counts perfumes, testers and sets -- not a lotion", () => {
  const items = Object.values(JSON.parse(readFileSync(ROOT + B.OUT_FILE, "utf8")).retailers.ariaperfumes.departments).flatMap((d) => d.items);
  const of = (re) => items.find((i) => re.test(i.title));
  assert.equal(isFragranceItem(of(/^Sauvage — Eau de Toilette/)), true);
  assert.equal(isFragranceItem(of(/\(Tester\)/)), true);
  assert.equal(isFragranceItem(of(/— Set de regalo/)), true);
  assert.equal(isFragranceItem(of(/— Loción corporal/)), false);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
