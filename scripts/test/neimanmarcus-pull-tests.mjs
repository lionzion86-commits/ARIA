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
import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  NM_KEY, NM_LABEL, OUT_FILE, PRICE_BAND_USD, GALLERY_CAP, pullPlan, estimatePull, spendCheck, costRatesFromEnv,
  ingestRow, ingestPull, sellerVerdict, bucketOf, parseDelimited, feedToRows, productCount, emptyCatalog,
  selectForTarget, proportionalQuotas, formatSelection, scopeVerdict, isBestSellerRow, NM_TARGET, nmActorInput,
} from "../lib/neimanmarcus.js";
import { coverageOf, verdictOf } from "../lib/pull-quality.js";
import {
  SOVRN_PRODUCTS_URL, SOVRN_MAX_PER_REQUEST, SOVRN_RATE_LIMIT, SOVRN_NM_MERCHANT_ID, checkSweepPlan, termsOf, buildRequest,
  throttleIntervalMs, requestsPerWindow, makeThrottle, productsOf, sovrnToRow, plainNmUrl, dedupeKeys, fieldReport,
  formatFieldReport, runSweep, replayResponses, sweepToPulled, groupIdGuidance, neimanEntries,
} from "../lib/sovrn.js";
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

/* ==================================================================
   --via sovrn: THE SOVRN API HARVEST. Every Sovrn "response" below is a
   TEST FIXTURE written by hand: the product ids, names, brands, prices,
   GTINs and image URLs are FAKE (FIXTURE ids, example.test image hosts,
   "Fixture" brands) and are NOT product data; the response shapes are
   plausible guesses for the tolerant mapper, NOT Sovrn's documented
   format (the repo has none). No request leaves this machine: the sweep
   takes an injected request function, and the one CLI run against an
   HTTP answer uses a local server on 127.0.0.1:8990.
   ================================================================== */
console.log("\n  Neiman Marcus via Sovrn — sweep, throttle, mapper, report (fixture responses)");

async function atest(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (err) { failures.push(name); console.log("    FAIL " + name + "\n         " + String(err && err.stack || err).split("\n").slice(0, 6).join("\n         ")); }
}

/* TEST FIXTURE — not product data. One plausible flat product shape. */
function sovrnFixture(n, over = {}) {
  return {
    productId: `FIXTURE-SV-${n}`,
    name: `Fixture Women's Knit Top ${n}`,
    brand: "Fixture Brand",
    price: 120 + n,
    currency: "USD",
    imageUrl: img(`sv-${n}-a`),
    additionalImages: [img(`sv-${n}-b`)],
    merchantName: "Neiman Marcus",
    merchantId: 2243,
    description: "A fixture top for tests. Second fixture sentence.",
    category: "Women > Clothing > Tops",
    ...over,
  };
}
const fakeClock = () => {
  let t = 0;
  const slept = [];
  return { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; }, slept, advance: (ms) => { t += ms; } };
};
const noWait = () => { const c = fakeClock(); return makeThrottle({ intervalMs: 0, now: c.now, sleep: c.sleep }); };
const tinyPlan = (departments, extra = {}) => ({ request: { method: "POST", query: { apiKey: "{apiKey}", includeMerchants: "{groupId}", numProducts: "{numProducts}" }, body: { keywords: "{term}" } }, departments, ...extra });
const ok = (list, key = "products") => ({ ok: true, status: 200, body: key ? { [key]: list } : list });

test("the checked-in sweep plan is valid, sale/clearance first, and covers every department #443 names", () => {
  const plan = checkSweepPlan(JSON.parse(readFileSync(join(ROOT, "scripts/neimanmarcus/sovrn-sweep-plan.json"), "utf8")));
  const cats = plan.departments.map((d) => d.category);
  assert.deepEqual(cats.slice(0, 2), ["sale", "clearance"]);
  for (const c of ["women_apparel", "men_apparel", "women_shoes", "men_shoes", "handbags", "accessories", "jewelry", "beauty", "kids", "home_small"]) assert.ok(cats.includes(c), c);
  assert.ok(plan.departments[0].terms.some((t) => /\bsale\b/.test(t)) && plan.departments.some((d) => d.terms.some((t) => /clearance/.test(t))));
  assert.match(JSON.stringify(plan.request), /\{term\}/);
  assert.doesNotMatch(JSON.stringify(plan), /[A-Za-z0-9]{24,}/, "a key-like string in the plan");
  const expanded = termsOf({ category: "x", expand: true, terms: ["dress", "Dress", "top"] }, ["black"]);
  assert.deepEqual(expanded, ["dress", "top", "black dress", "black top"]);
});

test("the request: key in the query only, redacted from what is logged; numProducts capped at 50", () => {
  const plan = tinyPlan([{ category: "a", terms: ["t"] }]);
  const r = buildRequest(plan, { term: "silk scarf", apiKey: "TESTKEY123", groupId: "G-FIXTURE", numProducts: 500 });
  assert.equal(r.method, "POST");
  assert.ok(r.url.startsWith(SOVRN_PRODUCTS_URL + "?"));
  assert.match(r.url, /apiKey=TESTKEY123/);
  assert.match(r.url, /includeMerchants=G-FIXTURE/);
  assert.match(r.url, /numProducts=50\b/);
  assert.deepEqual(r.body, { keywords: "silk scarf" });
  assert.doesNotMatch(JSON.stringify(r.logged), /TESTKEY123/);
  assert.match(r.logged.url, /apiKey=%3Credacted%3E/);
  assert.equal(SOVRN_MAX_PER_REQUEST, 50);
});

test("throttle math: 10% of 30k / 5 min = one request per 100 ms = 3,000 per window, well under the limit", () => {
  assert.deepEqual(SOVRN_RATE_LIMIT, { requests: 30000, windowMs: 300000 });
  assert.equal(throttleIntervalMs(), 100);
  assert.equal(requestsPerWindow(100), 3000);
  assert.ok(requestsPerWindow(throttleIntervalMs()) <= SOVRN_RATE_LIMIT.requests * 0.1);
  assert.equal(throttleIntervalMs({ share: 0.5 }), 20);
  assert.ok(requestsPerWindow(throttleIntervalMs({ share: 0.5 })) <= SOVRN_RATE_LIMIT.requests / 2);
  for (const share of [0.01, 0.05, 0.1, 0.25, 0.5]) assert.ok(requestsPerWindow(throttleIntervalMs({ share })) <= SOVRN_RATE_LIMIT.requests * share, String(share));
});

await atest("throttle spacing: N waits take at least (N-1) x interval on the clock", async () => {
  const c = fakeClock();
  const th = makeThrottle({ intervalMs: 100, now: c.now, sleep: c.sleep });
  const starts = [];
  for (let i = 0; i < 25; i++) { starts.push(await th.wait()); c.advance(7); }
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 100, `gap ${i}`);
  assert.ok(starts[24] - starts[0] >= 2400);
});

await atest("sweep de-duplicates by product id and by brand + name + colour; the first (sale) copy wins", async () => {
  const plan = tinyPlan([{ category: "sale", phase: 1, terms: ["sale"] }, { category: "women_apparel", gender: "women", terms: ["top", "blouse"] }]);
  const answers = {
    sale: [sovrnFixture(1, { originalPrice: 200 }), sovrnFixture(2)],
    top: [sovrnFixture(1), sovrnFixture(3)],
    /* same brand + name + colour under another id: one product */
    blouse: [sovrnFixture(4, { productId: "FIXTURE-SV-OTHER", name: "Fixture Women's Knit Top 3" }), sovrnFixture(5)],
  };
  const sweep = await runSweep({ plan, throttle: noWait(), request: async (term) => ok(answers[term]) });
  assert.equal(sweep.requests, 3);
  assert.equal(sweep.unique, 4);
  assert.deepEqual(sweep.found.map((f) => f.row.productId), ["FIXTURE-SV-1", "FIXTURE-SV-2", "FIXTURE-SV-3", "FIXTURE-SV-5"]);
  assert.equal(sweep.found[0].department, "sale");
  assert.equal(sweep.found[0].row.originalPrice, 200);
  assert.deepEqual(sweep.perDepartment.women_apparel, { requests: 2, returned: 4, new: 2, terms: 2, stoppedBy: "terms-exhausted" });
  const pulled = sweepToPulled(sweep.found, plan);
  assert.deepEqual(pulled.map((p) => [p.quota.category, p.items.length]), [["sale", 2], ["women_apparel", 2]]);
  assert.equal(pulled[1].quota.gender, "women");
  assert.notEqual(dedupeKeys({ name: "A", brand: "B", color: "Red" }).look, dedupeKeys({ name: "A", brand: "B", color: "Blue" }).look);
});

await atest("yield stop: a department whose last window finds too few new products stops; the next department still runs", async () => {
  const terms = Array.from({ length: 30 }, (_, i) => `term ${i}`);
  const plan = tinyPlan([{ category: "beauty", bucket: "beauty", terms }, { category: "kids", gender: "kids", terms: ["kids a"] }]);
  let k = 0;
  const sweep = await runSweep({
    plan, throttle: noWait(), minYield: 2, yieldWindow: 4,
    request: async (term) => {
      if (term === "kids a") return ok([sovrnFixture(900)]);
      /* first two terms: 5 new each; after that the same products again */
      k++;
      return ok(k <= 2 ? Array.from({ length: 5 }, (_, i) => sovrnFixture(k * 10 + i)) : [sovrnFixture(10)]);
    },
  });
  assert.equal(sweep.perDepartment.beauty.requests, 5, "4-request window, min 2 x 4 = 8: after request 4, 5+5+0+0 = 10 keeps going; after request 5, 5+0+0+0 = 5 stops");
  assert.match(sweep.perDepartment.beauty.stoppedBy, /^yield \(5 new in the last 4 requests\)/);
  assert.equal(sweep.perDepartment.kids.new, 1);
  assert.equal(sweep.stopped, "plan-exhausted");
});

await atest("target stop: the sweep stops as soon as the unique pool reaches --target", async () => {
  const plan = tinyPlan([{ category: "women_apparel", terms: Array.from({ length: 20 }, (_, i) => `t${i}`) }]);
  let n = 0;
  const sweep = await runSweep({ plan, throttle: noWait(), target: 120, request: async () => ok(Array.from({ length: 50 }, () => sovrnFixture(n++))) });
  assert.equal(sweep.requests, 3);
  assert.equal(sweep.unique, 120);
  assert.equal(sweep.stopped, "target");
});

await atest("--max-requests guard: never more requests than allowed, 429 retries counted", async () => {
  const plan = tinyPlan([{ category: "a", terms: Array.from({ length: 50 }, (_, i) => `t${i}`) }]);
  const c = fakeClock();
  let calls = 0, n = 0;
  const sweep = await runSweep({
    plan, throttle: makeThrottle({ intervalMs: 100, now: c.now, sleep: c.sleep }), maxRequests: 7, backoffMs: 1000, minYield: 0,
    request: async () => { calls++; return calls === 2 ? { ok: false, status: 429, body: {} } : ok([sovrnFixture(n++)]); },
  });
  assert.equal(calls, 7);
  assert.equal(sweep.requests, 7);
  assert.equal(sweep.stopped, "max-requests");
  assert.ok(c.slept.includes(1000), "backed off after the 429");
});

await atest("a failing first request stops the sweep at once (auth / template / shape problem), answer saved", async () => {
  const plan = tinyPlan([{ category: "a", terms: ["t1", "t2", "t3"] }]);
  const saved = [];
  const s1 = await runSweep({ plan, throttle: noWait(), request: async () => ({ ok: false, status: 401, body: { error: "fixture" } }), onResponse: (seq, d, t, r) => saved.push([seq, r.status]) });
  assert.equal(s1.requests, 1);
  assert.match(s1.stopped, /^first-request-failed \(HTTP 401\)/);
  assert.deepEqual(saved, [[1, 401]]);
  const s2 = await runSweep({ plan, throttle: noWait(), request: async () => ok({ unexpected: true }, null) });
  assert.match(s2.stopped, /no product array/);
});

test("missing group id: the guidance names the env var, the flag and the Approved Merchants API, and invents no ID or URL", () => {
  const g = groupIdGuidance();
  assert.match(g, /NM_SOVRN_GROUP_ID/);
  assert.match(g, /--merchant-group/);
  assert.match(g, /Approved Merchants API/);
  assert.match(g, /--approved-merchants-url/);
  assert.doesNotMatch(g, /https?:\/\//, "an endpoint was invented");
  const hits = neimanEntries({ merchants: [{ name: "Fixture Other", id: 1 }, { name: "Neiman Marcus", groupId: "G-FIXTURE" }, { merchantId: "2243" }] });
  assert.equal(hits.length, 2);
});

test("CLI --via sovrn: no SOVRN_API_KEY -> exit 1; no group id -> guidance and exit 5; nothing requested or saved", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-sovrn-"));
  try {
    const base = { ...process.env, NM_DATA_DIR: join(dir, "data"), SOVRN_PRODUCTS_URL: "http://127.0.0.1:9/never" };
    delete base.SOVRN_API_KEY; delete base.NM_SOVRN_GROUP_ID; delete base.SOVRN_APPROVED_MERCHANTS_URL;
    const a = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--via", "sovrn", "--dry-run"], { env: base, encoding: "utf8" });
    assert.equal(a.status, 1, a.stdout + a.stderr);
    assert.match(a.stderr, /SOVRN_API_KEY/);
    const b = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--via", "sovrn", "--dry-run"], { env: { ...base, SOVRN_API_KEY: "TESTKEY" }, encoding: "utf8" });
    assert.equal(b.status, 5, b.stdout + b.stderr);
    assert.match(b.stdout, /GROUP ID MISSING -- nothing was requested/);
    assert.equal(existsSync(join(dir, "data")), false, "something was saved");
    const c = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--via", "site"], { env: base, encoding: "utf8" });
    assert.notEqual(c.status, 0);
    assert.match(c.stderr, /only harvest mode is --via sovrn/);
    const d = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--via", "sovrn", "--throttle-share", "0.9"], { env: base, encoding: "utf8" });
    assert.notEqual(d.status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mapper: three plausible response shapes (flat camelCase, snake_case with nested price, data.products)", () => {
  /* TEST FIXTURES — not product data. */
  const flat = {
    productId: "FIXTURE-SV-A", name: "Fixture Silk Scarf", brand: "Fixture Brand", price: "495.00", salePrice: 395, currency: "usd",
    imageUrl: img("a1"), images: [img("a1"), img("a2")], gtin: "036000291452", merchantName: "Neiman Marcus", merchantId: 2243,
    url: "https://redirect.example.test/click?u=fixture", merchantUrl: "https://www.neimanmarcus.com/TEST-FIXTURE-not-a-product?ecid=x#top",
    color: "Ivory", inStock: true, description: "Fixture copy.",
  };
  const a = sovrnToRow(flat);
  assert.equal(a.productId, "FIXTURE-SV-A");
  assert.equal(a.price, 395);
  assert.equal(a.originalPrice, 495);
  assert.equal(a.currency, "USD");
  assert.deepEqual(a.images, [img("a1"), img("a2"), img("a1")], "every listed image, as given (ingest dedupes)");
  assert.equal(a.url, "https://www.neimanmarcus.com/TEST-FIXTURE-not-a-product");
  assert.equal(a.seller, "Neiman Marcus");
  assert.equal(a.inStock, true);

  const snake = {
    product_id: 77, title: "Fixture Leather Belt", brand: { name: "Fixture Maker" }, price: { amount: "180.00", currency: "USD" },
    image_url: img("b1"), upc: "4006381333931", sizes: "S, M, L", product_url: "https://sovrn.example.test/r/fixture", merchant: { id: 2243, name: "Neiman Marcus" },
    categories: ["Men", "Accessories", "Belts"],
  };
  const b = sovrnToRow(snake);
  assert.equal(b.productId, "77");
  assert.equal(b.name, "Fixture Leather Belt");
  assert.equal(b.brand, "Fixture Maker");
  assert.equal(b.price, 180);
  assert.equal(b.currency, "USD");
  assert.deepEqual(b.availableSizes, ["S", "M", "L"]);
  assert.equal(b.gtin, "4006381333931");
  assert.equal(b.url, undefined, "a non-Neiman-Marcus (redirect) URL was kept");

  const body = { data: { products: [{ id: "FIXTURE-SV-C", productName: "Fixture Tote", brandName: "Fixture House", finalPrice: "$1,250.00 USD", thumbnail: img("c1"), merchantId: 999, merchantName: "Fixture Other Store", variants: [{ size: "One Size", inStock: true }] }] } };
  const { list, at: where } = productsOf(body);
  assert.equal(where, "data.products");
  const c = sovrnToRow(list[0]);
  assert.equal(c.price, 1250);
  assert.equal(c.currency, "USD");
  assert.equal(c.seller, "Fixture Other Store");
  assert.equal(productsOf([{ a: 1 }]).at, "(body)");
  assert.equal(productsOf({ results: [] }).at, "results");
  assert.equal(productsOf({ nothing: 1 }).at, null);
  assert.equal(sovrnToRow({ id: "FIXTURE-X", merchantId: 2243 }, { merchantIds: ["2243"] }).seller, undefined);
  assert.equal(sovrnToRow({ id: "FIXTURE-Y", merchantId: "G-FIXTURE" }, { merchantIds: ["2243", "G-FIXTURE"] }).seller, undefined);
});

test("mapped rows go through the SAME ingest: USD asserted, seller == Neiman Marcus, shippable only, GTIN checksum, gallery dedupe", () => {
  /* TEST FIXTURES — not product data. */
  const rows = [
    sovrnToRow(sovrnFixture(1, { gtin: "036000291452", images: [img("g1"), img("g1") + "?wid=200", img("size-chart-g1")] })),
    sovrnToRow(sovrnFixture(2, { currency: undefined })),
    sovrnToRow(sovrnFixture(3, { currency: "EUR" })),
    sovrnToRow(sovrnFixture(4, { merchantId: 999, merchantName: "Fixture Other Store" })),
    sovrnToRow(sovrnFixture(5, { inStock: false })),
    sovrnToRow(sovrnFixture(6, { gtin: "036000291453" })),
  ];
  const { catalog, stats, quarantined } = ingestPull([{ quota: { category: "women_apparel", phase: 2, gender: "women" }, items: rows }], { ...ctx, target: 30000 });
  assert.equal(stats.published, 2);
  assert.equal(stats.quarantined["currency-unstated"], 1);
  assert.equal(stats.quarantined["currency-EUR"], 1);
  assert.equal(stats.quarantined["seller-not-neiman-marcus"], 1);
  assert.equal(stats.dropped["out-of-stock"], 1);
  assert.equal(quarantined.length, 3);
  const items = catalog.retailers[NM_KEY].departments.women.items;
  assert.equal(items[0].gtin, "036000291452");
  assert.equal(items[1].gtin, undefined, "a bad check digit was kept");
  assert.equal(items[0].images[items[0].images.length - 1], img("size-chart-g1"), "size chart not last");
  assert.equal(items[0].images.filter((u) => u.startsWith(img("g1"))).length, 1, "the same photo twice");
  assert.ok(items.every((it) => it.currency === "USD" && it.seller === NM_LABEL));
});

test("field report: a field missing in >50% of rows is flagged and every raw key name seen is listed", () => {
  /* TEST FIXTURES with keys the mapper does not know (pname, cost, pic). */
  const raws = [
    { pname: "Fixture One", cost: "10.00", pic: img("u1"), brand: "Fixture Brand", productId: "FIXTURE-U1", merchant: { id: 2243 } },
    { pname: "Fixture Two", cost: "12.00", pic: img("u2"), brand: "Fixture Brand", productId: "FIXTURE-U2", merchant: { id: 2243 } },
    sovrnFixture(9),
  ];
  const rep = fieldReport(raws.map((raw) => ({ raw, row: sovrnToRow(raw) })));
  assert.ok(rep.flagged.includes("name") && rep.flagged.includes("price") && rep.flagged.includes("images"));
  assert.ok(!rep.flagged.includes("brand") && !rep.flagged.includes("id"));
  const keys = rep.rawKeys.map((k) => k.key);
  for (const k of ["pname", "cost", "pic", "merchant.id"]) assert.ok(keys.includes(k), k);
  assert.equal(rep.rawKeys.find((k) => k.key === "pname").read, false);
  const text = formatFieldReport(rep);
  assert.match(text, /MAPPING TO FIX: .*name/);
  assert.match(text, /pname\(2\)\*/);
  assert.match(text, /cost\(2\)\*/);
  assert.match(text, /--src <sovrn-raw dir>/);
  const full = sovrnFixture(1, { gtin: "036000291452", sizes: ["S", "M"], color: "Black", inStock: true, productUrl: "https://www.neimanmarcus.com/TEST-FIXTURE-1" });
  const clean = formatFieldReport(fieldReport([{ raw: full, row: sovrnToRow(full) }]));
  assert.doesNotMatch(clean, /MAPPING TO FIX/);
});

test("never a link out: no affiliate / redirect URL survives; `url` is a plain neimanmarcus.com page, data only, never in a rendered record", () => {
  /* TEST FIXTURES — not product data. */
  const raw = sovrnFixture(1, {
    url: "https://redirect.example.test/click?id=fixture", deepLink: "https://sovrn.example.test/deep/fixture", affiliateUrl: "https://aff.example.test/fixture",
    clickUrl: "https://click.example.test/fixture", link: "http://www.neimanmarcus.com/insecure-fixture",
  });
  const row = sovrnToRow(raw);
  assert.equal(row.url, undefined, "an affiliate / redirect / http URL was stored");
  const { catalog } = ingestPull([{ quota: { category: "women_apparel", gender: "women" }, items: [row, sovrnToRow(sovrnFixture(2, { productUrl: "https://www.neimanmarcus.com/TEST-FIXTURE-2?utm_source=sovrn" }))] }], ctx);
  const items = catalog.retailers[NM_KEY].departments.women.items;
  for (const it of items) {
    for (const [k, v] of Object.entries(it)) {
      assert.doesNotMatch(k, /link|href|affiliate|deep|click|redirect/i, "an outbound link field: " + k);
      if (typeof v === "string" && /^https?:/.test(v) && k !== "image") assert.ok(k === "url" && plainNmUrl(v) === v, `${k}: ${v}`);
    }
  }
  assert.equal(items[1].url, "https://www.neimanmarcus.com/TEST-FIXTURE-2");
  assert.equal(plainNmUrl("https://www.neimanmarcus.com.evil.example.test/x"), null);
  /* The product page's record never carries the source url. */
  const slices = readFileSync(join(ROOT, "scripts/build-pdp-slices.mjs"), "utf8");
  const fields = /const RECORD_FIELDS = \[([^\]]*)\]/.exec(slices)[1];
  assert.doesNotMatch(fields, /"url"|"link"/);
  const rail = /const RAIL_FIELDS = \[([^\]]*)\]/.exec(slices)[1];
  assert.doesNotMatch(rail, /"url"|"link"/);
});

test("replay: saved raw answers re-map through the current mapper with no request", () => {
  const responses = [
    { department: "sale", status: 200, body: { products: [sovrnFixture(1), sovrnFixture(2)] } },
    { department: "women_apparel", status: 500, body: { error: "fixture" } },
    { department: "women_apparel", status: 200, body: { products: [sovrnFixture(2), sovrnFixture(3)] } },
  ];
  const sweep = replayResponses(responses);
  assert.equal(sweep.unique, 3);
  assert.equal(sweep.perDepartment.women_apparel.new, 1);
  assert.equal(sweep.requests, 3);
});

function sovrnRawDir(root, responses, index = {}) {
  const d = join(root, "sovrn-raw-fixture");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "index.json"), JSON.stringify({ via: "sovrn", groupId: "G-FIXTURE", departments: [{ category: "sale", phase: 1, terms: ["-"] }, { category: "women_apparel", phase: 2, gender: "women", terms: ["-"] }], ...index }));
  responses.forEach((r, i) => writeFileSync(join(d, `req-${String(i + 1).padStart(5, "0")}.json`), JSON.stringify({ seq: i + 1, ...r })));
  return d;
}

test("CLI --src <sovrn-raw dir> --dry-run: sweep summary, field report, 30k selection, coverage report; writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-sovrn-"));
  try {
    const raw = sovrnRawDir(dir, [
      { department: "sale", status: 200, body: { products: [sovrnFixture(1, { originalPrice: 300 }), sovrnFixture(2)] } },
      { department: "women_apparel", status: 200, body: { products: [sovrnFixture(2), sovrnFixture(3)] } },
    ]);
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--src", raw, "--target", "30000", "--dry-run", "--no-weight-estimates"],
      { env: { ...process.env, NM_DATA_DIR: join(dir, "data"), GROQ_API_KEY: "" }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /NEIMAN MARCUS VIA SOVRN — THE SWEEP/);
    assert.match(r.stdout, /unique products found \(the candidate pool before ingest\): 3/);
    assert.match(r.stdout, /PARTIAL/);
    assert.match(r.stdout, /SOVRN FIELD MAPPING/);
    assert.match(r.stdout, /candidate pool \(shippable, in scope, de-duplicated\): 3/);
    assert.match(r.stdout, /THE POOL IS UNDER THE TARGET/);
    assert.match(r.stdout, /INGEST REPORT/);
    assert.match(r.stdout, /--dry-run: nothing written/);
    assert.equal(existsSync(join(dir, "data")), false);
    assert.equal(existsSync(join(ROOT, OUT_FILE)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* One end-to-end run over HTTP against a LOCAL fixture server
   (127.0.0.1:8990; SOVRN_PRODUCTS_URL points the CLI at it). */
function runCli(argv, env) {
  return new Promise((res) => {
    const p = spawn(process.execPath, argv, { env });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => res({ status: code, stdout: out, stderr: err }));
  });
}
await atest("CLI --via sovrn --dry-run (local fixture server): sweep, raw answers saved without the key, selection, no catalogue", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nm-sovrn-"));
  const seen = [];
  let n = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, body });
      const list = n < 6 ? Array.from({ length: 3 }, () => sovrnFixture(n++)) : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ products: list }));
    });
  });
  await new Promise((r) => server.listen(8990, "127.0.0.1", r));
  try {
    const plan = join(dir, "plan.json");
    writeFileSync(plan, JSON.stringify(tinyPlan([{ category: "sale", phase: 1, terms: ["sale"] }, { category: "women_apparel", gender: "women", terms: ["top", "dress", "skirt"] }])));
    const env = { ...process.env, NM_DATA_DIR: join(dir, "data"), GROQ_API_KEY: "", SOVRN_API_KEY: "TESTKEY-FIXTURE-0001", NM_SOVRN_GROUP_ID: "G-FIXTURE", SOVRN_PRODUCTS_URL: "http://127.0.0.1:8990/ai-orchestration/products" };
    const r = await runCli([join(ROOT, "scripts/build-neimanmarcus-catalog.mjs"), "--via", "sovrn", "--dry-run", "--sweep-plan", plan, "--max-requests", "10", "--no-weight-estimates"], env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(seen.length, 4);
    assert.ok(seen.every((s) => s.method === "POST" && /apiKey=TESTKEY-FIXTURE-0001/.test(s.url) && /includeMerchants=G-FIXTURE/.test(s.url) && /numProducts=50/.test(s.url)));
    assert.deepEqual(JSON.parse(seen[1].body), { keywords: "top" });
    assert.match(r.stdout, /requests made: 4/);
    assert.match(r.stdout, /unique products found \(the candidate pool before ingest\): 6/);
    assert.match(r.stdout, /sale\s+1 \/\s+3 \/\s+3/);
    assert.match(r.stdout, /THE 30,000 SELECTION/);
    assert.match(r.stdout, /--dry-run: nothing written/);
    const dataDirs = readdirSync(join(dir, "data"));
    assert.equal(dataDirs.length, 1);
    assert.match(dataDirs[0], /^sovrn-raw-/);
    const files = readdirSync(join(dir, "data", dataDirs[0])).sort();
    assert.deepEqual(files, ["index.json", "req-00001.json", "req-00002.json", "req-00003.json", "req-00004.json"]);
    for (const f of files) assert.doesNotMatch(readFileSync(join(dir, "data", dataDirs[0], f), "utf8"), /TESTKEY-FIXTURE-0001/, `the key was written to ${f}`);
    assert.equal(existsSync(join(ROOT, OUT_FILE)), false);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
