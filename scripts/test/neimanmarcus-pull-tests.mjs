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
} from "../lib/neimanmarcus.js";
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

test("real weight and dimensions from the source; gallery up to 12", () => {
  const it = ingestRow(fixtureRow({ images: Array.from({ length: 15 }, (_, i) => img(i)) }), {}, ctx).item;
  assert.equal(it.weightEstimated, false);
  assert.ok(it.weightKg > 0.2 && it.weightKg < 0.3);
  assert.equal(it.dimensions, "12 x 10 x 2 in");
  assert.equal(it.images.length, GALLERY_CAP);
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
      { env: { ...process.env, NM_DATA_DIR: join(dir, "data") }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const cat = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(cat.declaredProductCount, 1);
    assert.equal(productCount(cat), 1);
    assert.ok(existsSync(join(dir, "data")), "quarantine file for the unstated-currency fixture row");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("no catalogue file is committed and the store is not wired", () => {
  assert.equal(existsSync(join(ROOT, OUT_FILE)), false);
  const reg = readFileSync(join(ROOT, "scripts/lib/retailers.js"), "utf8");
  assert.equal(/neimanmarcus/i.test(reg), false);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
