/* ==================================================================
   NEIMAN MARCUS PULL — OFFLINE TESTS FOR THE ESTIMATE AND THE INGEST.

   No network, no servers, no spend. Every row below is a TEST FIXTURE
   written by hand for these assertions: the names, brands, prices,
   sizes, GTINs and image URLs are FAKE (example.test hosts, "Fixture"
   brands) and are NOT product data. Nothing here is ever written into a
   catalogue the site serves.

     node scripts/test/neimanmarcus-pull-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  NM_KEY, NM_LABEL, OUT_FILE, PRICE_BAND_USD, GALLERY_CAP, pullPlan, estimatePull, spendCheck, costRatesFromEnv,
  ingestRow, ingestPull, sellerVerdict, bucketOf, parseDelimited, feedToRows, productCount, emptyCatalog,
  selectForTarget, proportionalQuotas, formatSelection, scopeVerdict, isBestSellerRow, NM_TARGET, nmActorInput,
} from "../lib/neimanmarcus.js";
import { coverageOf, verdictOf } from "../lib/pull-quality.js";
import { ingestPull as dswIngestPull, DSW_KEY } from "../lib/dsw.js";
import { loadShippable } from "../build-store-slices.mjs";
import { specWeightKg } from "../../netlify/functions/_weight-resolve.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const failures = [];
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (err) { failures.push(name); console.log("    FAIL " + name + "\n         " + String(err && err.message || err).split("\n").join("\n         ")); }
}

const ctx = { isShippableItem: loadShippable(ROOT), specWeightKg: (x) => specWeightKg(x), generatedAt: "2026-01-01T00:00:00.000Z" };
const img = (n) => `https://img.example.test/fixture/${n}.jpg`;

/* TEST FIXTURE — not product data. */
function fixtureRow(over = {}) {
  return {
    productId: "FIXTURE-001",
    name: "Fixture Women's Silk Blouse",
    brand: "Fixture Brand",
    price: "$295.00",
    originalPrice: "$395.00",
    currency: "USD",
    images: [img(1), img(2), img(3)],
    description: "<p>A fixture blouse for tests. Second fixture sentence. Third sentence is cut.</p>",
    breadcrumbs: ["Women", "Clothing", "Tops"],
    variants: [
      { size: "XS", inStock: true, gtin: "036000291452" },
      { size: "S", inStock: false },
      { size: "M", inStock: true },
    ],
    specifications: [{ name: "Shipping Weight", value: "0.6 lb" }, { name: "Dimensions", value: "12 x 10 x 2 in" }],
    gtin: "4006381333931",
    url: "https://shop.example.test/fixture-001",
    ...over,
  };
}

console.log("\n  Neiman Marcus pull — estimate");

test("plan runs phase 1 (sale, clearance, best sellers) before the department depth", () => {
  const plan = pullPlan();
  assert.deepEqual(plan.slice(0, 3).map((q) => q.category), ["sale", "clearance", "bestsellers"]);
  assert.ok(plan.slice(3).every((q) => q.phase === 2));
  assert.equal(plan.length, 12);
});

test("estimate uses the DSW pricing math and the +25% stop", () => {
  const rates = costRatesFromEnv({}, { costPerRun: 0.06 });
  const est = estimatePull(pullPlan(), rates);
  assert.equal(est.items, 9450);
  assert.equal(est.estimateUsd, 54.59);
  assert.equal(est.stopAboveUsd, Math.round(est.quoteUsd * 1.25 * 100) / 100);
  const quoted = estimatePull(pullPlan(), rates, { quoteUsd: 60 });
  assert.equal(quoted.stopAboveUsd, 75);
});

test("spend check stops a pull running hot", () => {
  const plan = pullPlan();
  const est = estimatePull(plan, costRatesFromEnv({}, { costPerRun: 0.06 }));
  const hot = spendCheck([{ quota: plan[0], usd: 60 }], plan.slice(1), est);
  assert.equal(hot.stop, true);
  const cool = spendCheck([{ quota: plan[0], usd: 10 }], plan.slice(1), est);
  assert.equal(cool.stop, false);
});

test("the CLI prints the estimate and spends nothing without --confirm-spend (exit 2)", () => {
  const env = { ...process.env };
  delete env.APIFY_API_KEY; delete env.NM_ACTOR_ID;
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs")], { env, encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /ESTIMATED COST: ~\$54\.59/);
  assert.match(r.stdout, /Nothing was spent/);
  assert.match(r.stdout, /ASSUMPTIONS/);
});

test("--confirm-spend without the env var names refuses before any network call", () => {
  const env = { ...process.env };
  delete env.APIFY_API_KEY; delete env.NM_ACTOR_ID;
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--confirm-spend"], { env, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /APIFY_API_KEY and NM_ACTOR_ID/);
});

console.log("\n  Neiman Marcus pull — ingest (fixture rows)");

test("a clean USD row publishes with the DSW row shape under neimanmarcus", () => {
  const v = ingestRow(fixtureRow(), { category: "women_apparel", gender: "women" }, ctx);
  assert.ok(v.item, JSON.stringify(v));
  const it = v.item;
  assert.equal(it.retailer, NM_KEY);
  assert.equal(it.seller, NM_LABEL);
  assert.equal(it.currency, "USD");
  assert.equal(it.price, 295);
  assert.equal(it.originalPrice, 395);
  assert.equal(it.onSale, true);
  assert.equal(v.bucket, "women");
  assert.equal(it.descriptionSource, "neimanmarcus-pdp");
  assert.equal(it.description, "A fixture blouse for tests. Second fixture sentence.");
});

test("sizes exactly as scraped: in-stock variants, source order, none invented", () => {
  const it = ingestRow(fixtureRow(), {}, ctx).item;
  assert.deepEqual(it.availableSizes, ["XS", "M"]);
  assert.equal(it.sizeSource, "variants-in-stock");
  const none = ingestRow(fixtureRow({ variants: undefined }), {}, ctx).item;
  assert.deepEqual(none.availableSizes, []);
});

test("GTIN captured (checksum-valid only), per size when variants carry it", () => {
  const it = ingestRow(fixtureRow(), {}, ctx).item;
  assert.equal(it.gtin, "4006381333931");
  assert.deepEqual(it.variantGtins, { XS: "036000291452" });
  const bad = ingestRow(fixtureRow({ gtin: "036000291453", variants: [] }), {}, ctx).item;
  assert.equal(bad.gtin, undefined);
});

test("real weight and dimensions from the source; the whole gallery (no 12-photo cut)", () => {
  const it = ingestRow(fixtureRow({ images: Array.from({ length: 15 }, (_, i) => img(i)) }), {}, ctx).item;
  assert.equal(it.weightEstimated, false);
  assert.ok(it.weightKg > 0.2 && it.weightKg < 0.3);
  assert.equal(it.dimensions, "12 x 10 x 2 in");
  assert.equal(it.images.length, 15, "every image the source offers");
  assert.ok(GALLERY_CAP >= 40, "the cap is a runaway guard, not a selection");
  const dup = ingestRow(fixtureRow({ images: [img(1), img(1) + "?wid=300", img(2), "https://img.example.test/fixture/size-chart.jpg", img(3)] }), {}, ctx).item;
  assert.deepEqual(dup.images, [img(1), img(2), img(3), "https://img.example.test/fixture/size-chart.jpg"], "duplicates out, size chart last");
  assert.equal(it.image, it.images[0]);
});

test("currency: non-USD and unstated are quarantined; --assume-usd flags", () => {
  assert.equal(ingestRow(fixtureRow({ currency: "CAD" }), {}, ctx).quarantine, "currency-CAD");
  assert.equal(ingestRow(fixtureRow({ currency: undefined }), {}, ctx).quarantine, "currency-unstated");
  const assumed = ingestRow(fixtureRow({ currency: undefined }), {}, { ...ctx, assumeUsd: true }).item;
  assert.equal(assumed.currencyAssumed, true);
});

test("seller must be Neiman Marcus", () => {
  assert.equal(sellerVerdict(fixtureRow()).source, "source");
  assert.equal(sellerVerdict(fixtureRow({ seller: "Neiman Marcus" })).source, "row");
  assert.equal(ingestRow(fixtureRow({ seller: "Fixture Marketplace Partner" }), {}, ctx).quarantine, "seller-not-neiman-marcus");
  assert.ok(ingestRow(fixtureRow({ soldBy: "Neiman Marcus" }), {}, ctx).item);
});

test("sanity band quarantines (luxury band, not DSW's)", () => {
  assert.equal(PRICE_BAND_USD.max, 5000);
  assert.match(ingestRow(fixtureRow({ price: "$9,999.00", originalPrice: null }), {}, ctx).quarantine, /price-outside-band/);
  assert.match(ingestRow(fixtureRow({ price: "$4.00", originalPrice: null }), {}, ctx).quarantine, /price-outside-band/);
});

test("shippable only: out of stock, freight, store-only and the site's own rule drop", () => {
  assert.equal(ingestRow(fixtureRow({ inStock: false }), {}, ctx).drop, "out-of-stock");
  assert.equal(ingestRow(fixtureRow({ shippingMessage: "Ships via freight delivery" }), {}, ctx).drop, "oversize");
  assert.equal(ingestRow(fixtureRow({ shippingMessage: "In-store only" }), {}, ctx).drop, "store-only");
  assert.equal(ingestRow(fixtureRow({ specifications: [{ name: "Shipping Weight", value: "90 lb" }] }), {}, ctx).drop, "site-unshippable");
  assert.equal(ingestRow(fixtureRow({ images: [] }), {}, ctx).drop, "no-image");
});

test("buckets use the site's existing names only", () => {
  const known = new Set(["women", "men", "kids", "purses", "beauty", "jewelry", "home_decor", "footwear", "clothing"]);
  const cases = [
    [{ name: "Fixture Eau de Parfum", breadcrumbs: ["Beauty", "Fragrance"] }, {}, "beauty"],
    [{ name: "Fixture Leather Tote Bag", breadcrumbs: ["Handbags"] }, {}, "purses"],
    [{ name: "Fixture Pendant Necklace", breadcrumbs: ["Jewelry"] }, {}, "jewelry"],
    [{ name: "Fixture Men's Loafer", breadcrumbs: ["Men", "Shoes"] }, {}, "men"],
    [{ name: "Fixture Candle", breadcrumbs: ["Home", "Candles"] }, {}, "home_decor"],
    [{ name: "Fixture Sneaker", breadcrumbs: [] }, {}, "footwear"],
  ];
  for (const [raw, q, want] of cases) {
    const got = bucketOf(raw, q);
    assert.equal(got, want, raw.name);
    assert.ok(known.has(got));
  }
});

test("the envelope matches the DSW builder's shape; sale copy wins, best-seller rank kept", () => {
  const pulled = [
    { quota: { category: "sale", phase: 1 }, items: [fixtureRow()] },
    { quota: { category: "bestsellers", phase: 1 }, items: [fixtureRow({ productId: "FIXTURE-002", name: "Fixture Men's Shirt", breadcrumbs: ["Men"] }), fixtureRow()] },
  ];
  const { catalog, stats } = ingestPull(pulled, ctx);
  const dsw = dswIngestPull(pulled, ctx).catalog;
  assert.deepEqual(Object.keys(catalog).sort(), Object.keys(dsw).sort());
  assert.deepEqual(Object.keys(catalog.retailers), [NM_KEY]);
  assert.deepEqual(Object.keys(catalog.retailers[NM_KEY]).sort(), Object.keys(dsw.retailers[DSW_KEY]).sort());
  assert.equal(catalog.declaredProductCount, 2);
  assert.equal(productCount(catalog), 2);
  assert.equal(stats.dropped.duplicate, 1);
  const women = catalog.retailers[NM_KEY].departments.women.items[0];
  assert.equal(women.bestSellerRank, 2);
  const dswItem = dsw.retailers[DSW_KEY].departments.women.items[0];
  for (const k of Object.keys(dswItem)) if (k !== "descriptionSource") assert.ok(k in women, "missing " + k);
  assert.equal(productCount(emptyCatalog()), 0);
});

console.log("\n  Neiman Marcus pull — affiliate feed (fixture CSV)");

/* TEST FIXTURE — a hand-written two-product feed, not a real export. */
const FEED = [
  "id,item_group_id,title,description,link,image_link,additional_image_link,price,sale_price,availability,brand,gtin,size,color,product_type,shipping_weight",
  'F1-XS,F1,"Fixture Women\'s Wrap Dress","A fixture dress, for tests. It has two sentences.",https://shop.example.test/f1,' + img("f1a") + ',"' + img("f1b") + "," + img("f1c") + '",450.00 USD,315.00 USD,in stock,Fixture Brand,036000291452,XS,Black,Women > Dresses,1.1 lb',
  'F1-S,F1,"Fixture Women\'s Wrap Dress","A fixture dress, for tests. It has two sentences.",https://shop.example.test/f1,' + img("f1a") + ',,450.00 USD,315.00 USD,out of stock,Fixture Brand,012345678905,S,Black,Women > Dresses,1.1 lb',
  'F1-M,F1,"Fixture Women\'s Wrap Dress","A fixture dress, for tests. It has two sentences.",https://shop.example.test/f1,' + img("f1a") + ',,450.00 USD,315.00 USD,in stock,Fixture Brand,,M,Black,Women > Dresses,1.1 lb',
  "F2,,Fixture Cologne,A fixture cologne.,https://shop.example.test/f2," + img("f2a") + ",,120.00,,in stock,Fixture Brand,4006381333931,,,Beauty > Fragrance,",
].join("\n");

test("feed parse: quoted cells, commas inside quotes, one row per variant", () => {
  const recs = parseDelimited(FEED);
  assert.equal(recs.length, 4);
  assert.equal(recs[0].description, "A fixture dress, for tests. It has two sentences.");
  assert.equal(recs[0].additional_image_link, img("f1b") + "," + img("f1c"));
});

test("feed rows: variants grouped, sizes in feed order, GTIN per size, USD from the price column", () => {
  const rows = feedToRows(parseDelimited(FEED));
  assert.equal(rows.length, 2);
  const dress = ingestRow(rows[0], { category: "feed" }, ctx);
  assert.ok(dress.item, JSON.stringify(dress));
  assert.deepEqual(dress.item.availableSizes, ["XS", "M"]);
  assert.deepEqual(dress.item.variantGtins, { XS: "036000291452", S: "012345678905" });
  assert.equal(dress.item.gtin, undefined);
  assert.equal(dress.item.price, 315);
  assert.equal(dress.item.originalPrice, 450);
  assert.equal(dress.item.images.length, 3);
  assert.equal(dress.item.weightEstimated, false);
  assert.equal(dress.bucket, "women");
  /* The cologne's price column carries no currency code: held unless
     the operator asserts USD for the feed. */
  assert.equal(ingestRow(rows[1], { category: "feed" }, ctx).quarantine, "currency-unstated");
  const cologne = ingestRow(rows[1], { category: "feed" }, { ...ctx, assumeUsd: true });
  assert.equal(cologne.item.gtin, "4006381333931");
  assert.equal(cologne.bucket, "beauty");
});

test("the CLI ingests a feed with --src and writes the envelope (temp dir only)", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-pull-test-"));
  try {
    const feed = join(dir, "fixture-feed.csv");
    const out = join(dir, OUT_FILE);
    writeFileSync(feed, FEED);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--src", feed, "--out", out, "--no-weight-estimates"],
      { env: { ...process.env, NM_DATA_DIR: join(dir, "data"), GROQ_API_KEY: "" }, encoding: "utf8" });
    /* English descriptions and no GROQ_API_KEY: written, loudly DO NOT SHIP. */
    assert.equal(r.status, 4, r.stdout + r.stderr);
    assert.match(r.stdout, /INGEST REPORT — Neiman Marcus/);
    assert.match(r.stdout, /ES description coverage is 0\.0%: GROQ_API_KEY is not set/);
    assert.match(r.stdout, /VERDICT: DO NOT SHIP/);
    const cat = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(cat.declaredProductCount, 1);
    assert.equal(productCount(cat), 1);
    assert.ok(existsSync(join(dir, "data")), "quarantine file for the unstated-currency fixture row");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log("\n  Neiman Marcus pull — the 30,000 selection, scope, report (fixture rows)");

/* TEST FIXTURE — n fake pool entries for the selection math. */
function poolEntries(spec) {
  const out = [];
  let i = 0;
  for (const [bucket, n, flags] of spec) {
    for (let k = 0; k < n; k++) out.push({ bucket, item: { name: `Fixture ${bucket} ${i++}`, onSale: Boolean(flags && flags.sale), ...(flags && flags.best ? { bestSeller: true } : {}) } });
  }
  return out;
}

test("the target is ~30,000 (SSENSE parity)", () => {
  assert.equal(NM_TARGET, 30000);
});

test("selection, pool < target: ALL taken, the true ceiling stated, nothing padded", () => {
  const entries = poolEntries([["women", 50, { sale: true }], ["men", 30], ["beauty", 20, { best: true }]]);
  const { selected, plan } = selectForTarget(entries, 30000);
  assert.equal(selected.length, 100);
  assert.equal(plan.ceiling, 100);
  assert.equal(plan.pool, 100);
  const text = formatSelection(plan, { "out-of-scope-furniture": 3, duplicate: 2 });
  assert.match(text, /candidate pool \(shippable, in scope, de-duplicated\): 100/);
  assert.match(text, /true ceiling from this feed is 100, not 30,000/);
  assert.match(text, /out-of-scope-furniture 3/);
});

test("selection, pool > target: sale ALL first, then best sellers, then quotas proportional to pool", () => {
  const entries = poolEntries([
    ["women", 4000, { sale: true }], ["men", 1000, { sale: true }],
    ["beauty", 3000, { best: true }],
    ["women", 20000], ["men", 10000], ["purses", 6000], ["beauty", 4000],
  ]);
  const { selected, plan } = selectForTarget(entries, 30000);
  assert.equal(selected.length, 30000, "exactly the target");
  assert.equal(plan.sale.taken, 5000, "all sale");
  assert.equal(plan.best.taken, 3000, "all best sellers");
  const slots = 30000 - 5000 - 3000;
  assert.deepEqual(plan.quotas, {
    women: { pool: 20000, quota: 11000 }, men: { pool: 10000, quota: 5500 },
    purses: { pool: 6000, quota: 3300 }, beauty: { pool: 4000, quota: 2200 },
  });
  assert.equal(Object.values(plan.quotas).reduce((n, q) => n + q.quota, 0), slots);
  assert.equal(selected.filter((e) => e.item.onSale).length, 5000);
  assert.equal(plan.ceiling, null);
  /* The sale tier alone over the target: proportional within sale. */
  const saleHeavy = selectForTarget(poolEntries([["women", 300, { sale: true }], ["men", 100, { sale: true }], ["kids", 50]]), 200);
  assert.equal(saleHeavy.selected.length, 200);
  assert.equal(saleHeavy.plan.sale.taken, 200);
  assert.equal(saleHeavy.selected.filter((e) => e.bucket === "women").length, 150);
});

test("proportional quotas: largest remainder, never above a department's pool", () => {
  assert.deepEqual(proportionalQuotas({ a: 10, b: 5, c: 1 }, 7), { a: 4, b: 2, c: 1 });
  assert.deepEqual(proportionalQuotas({ a: 3, b: 3 }, 10), { a: 3, b: 3 });
  assert.deepEqual(proportionalQuotas({ a: 3 }, 0), { a: 0 });
});

test("scope: gift cards, furniture and alcohol never enter the pool; look-alike duplicates count once", () => {
  assert.equal(scopeVerdict({ name: "Fixture E-Gift Card" }), "out-of-scope-gift-card");
  assert.equal(scopeVerdict({ name: "Fixture Velvet Sofa", breadcrumbs: ["Home", "Furniture"] }), "out-of-scope-furniture");
  assert.equal(scopeVerdict({ name: "Fixture Champagne Gift Set", breadcrumbs: ["Gifts", "Wine & Champagne"] }), "out-of-scope-alcohol");
  assert.equal(scopeVerdict({ name: "Fixture Wine-Colored Dress", breadcrumbs: ["Women", "Dresses"] }), null, "a colour is not a drink");
  assert.equal(ingestRow(fixtureRow({ name: "Fixture Area Rug", breadcrumbs: ["Home", "Rugs"] }), {}, ctx).drop, "out-of-scope-furniture");
  const pulled = [{ quota: { category: "feed" }, items: [fixtureRow(), fixtureRow({ productId: "FIXTURE-001-B" }), fixtureRow({ productId: "FIXTURE-003", name: "Fixture Women's Silk Skirt" })] }];
  const { stats } = ingestPull(pulled, { ...ctx, target: 30000 });
  assert.equal(stats.pool, 2, "the same brand + name + colour under another id is a duplicate");
  assert.equal(stats.dropped.duplicate, 1);
  assert.equal(stats.selection.ceiling, 2);
});

test("best sellers come from the source's own signal only", () => {
  assert.equal(isBestSellerRow({ labels: ["Best Seller"] }), true);
  assert.equal(isBestSellerRow({ labels: ["New Arrival"] }), false);
  assert.equal(isBestSellerRow({}), false);
  const rows = feedToRows(parseDelimited("id,title,price,custom_label_0,image_link\nB1,Fixture Bag,100.00 USD,bestseller," + img("b1")));
  assert.deepEqual(rows[0].labels, ["bestseller"]);
  assert.equal(ingestRow(rows[0], {}, ctx).item.bestSeller, true);
});

test("the generic actor path keeps its own input shape (no actor is verified for neimanmarcus.com)", () => {
  assert.deepEqual(nmActorInput({ query: "fixture" }, 5), { searchQueries: ["fixture"], maxItems: 5 });
});

/* TEST FIXTURE — a hand-written Spanish feed that meets every line. */
const FEED_ES = [
  "id,item_group_id,title,description,link,image_link,additional_image_link,price,availability,brand,gtin,size,product_type,shipping_weight,custom_label_0",
  ...["XS", "S"].map((sz, i) => `G1-${sz},G1,"Fixture Women's Blouse","Una blusa de prueba para los tests, con botones.",https://shop.example.test/g1,${img("g1a")},${img("g1b")},200.00 USD,in stock,Fixture Brand,${["036000291452", "012345678905"][i]},${sz},Women > Tops,0.5 lb,`),
  `G2,,"Fixture Leather Tote","Un bolso de prueba para los tests, de cuero.",https://shop.example.test/g2,${img("g2a")},${img("g2b")},300.00 USD,in stock,Fixture Brand,4006381333931,,Handbags > Totes,1.5 lb,best seller`,
  `G3,,"Fixture E-Gift Card","Una tarjeta de regalo de prueba.",https://shop.example.test/g3,${img("g3a")},,50.00 USD,in stock,Fixture Brand,,,Gift Cards,,`,
].join("\n");

test("CLI --src --target --dry-run: the pool report, then the coverage report; writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-pool-test-"));
  try {
    const feed = join(dir, "fixture-feed.csv");
    writeFileSync(feed, FEED_ES);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--src", feed, "--target", "30000", "--dry-run"],
      { env: { ...process.env, NM_DATA_DIR: join(dir, "data"), GROQ_API_KEY: "" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /CANDIDATE POOL AND THE 30,000 SELECTION/);
    assert.match(r.stdout, /candidate pool \(shippable, in scope, de-duplicated\): 2/);
    assert.match(r.stdout, /out-of-scope-gift-card 1/);
    assert.match(r.stdout, /2\. best sellers \(source's signal\):  1 of 1/);
    assert.match(r.stdout, /true ceiling from this feed is 2, not 30,000/);
    assert.match(r.stdout, /INGEST REPORT — Neiman Marcus \(dry run, nothing written\)/);
    assert.match(r.stdout, /--dry-run: nothing written/);
    assert.equal(existsSync(join(dir, "data")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI --src on a complete Spanish feed: every coverage line met, VERDICT: SHIP (exit 0)", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-ship-test-"));
  try {
    const feed = join(dir, "fixture-feed.csv");
    const out = join(dir, OUT_FILE);
    writeFileSync(feed, FEED_ES);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--src", feed, "--out", out, "--target", "30000", "--no-weight-estimates"],
      { env: { ...process.env, NM_DATA_DIR: join(dir, "data"), GROQ_API_KEY: "" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /VERDICT: SHIP/);
    const cat = JSON.parse(readFileSync(out, "utf8"));
    const cov = coverageOf(cat, NM_KEY);
    assert.equal(cov.published, 2);
    assert.equal(cov.shares.es, 1);
    assert.equal(cov.shares.gtin, 1);
    assert.equal(verdictOf(cov).ship, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("no catalogue file is committed and the store is not wired", () => {
  assert.equal(existsSync(join(ROOT, OUT_FILE)), false);
  const reg = readFileSync(join(ROOT, "scripts/lib/retailers.js"), "utf8");
  assert.equal(/neimanmarcus/i.test(reg), false);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
