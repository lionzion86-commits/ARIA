/* ==================================================================
   WALMART DENSITY PROGRAM -- OFFLINE TESTS (#443).

   No network, no spend. Every row is a TEST FIXTURE written by hand
   (example.test image hosts, "Fixture" names); none is product data.

     node scripts/test/walmart-density-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as W from "../lib/walmart-density.js";
import { mergePull } from "../build-walmart-catalog.mjs";
import { loadShippable } from "../build-store-slices.mjs";
import { specWeightKg } from "../../netlify/functions/_weight-resolve.js";
import { liftDeclarations } from "../lib/page-lift.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}
const ctx = { band: W.PRICE_BAND_USD, isShippableItem: loadShippable(ROOT), specWeightKg: (x) => specWeightKg(x), generatedAt: "2026-01-01T00:00:00.000Z" };
const img = (n, q = "") => `https://i5.walmartimages.example.test/seo/fixture-${n}.jpeg${q}`;

/* TEST FIXTURES, in the shape Lucifer's trial described (allImages, priceInfo, upc). */
function detail(over = {}) {
  return {
    usItemId: "1001", name: "Fixture Bluey Plush 12 in", brand: "Fixture Toys", url: "https://www.walmart.com/ip/fixture-bluey/1001",
    priceInfo: { currentPrice: { price: 9.97, currencyUnit: "USD" }, wasPrice: { price: 14.97 } },
    allImages: [img(1, "?odnHeight=612&odnWidth=612"), img(1, "?odnHeight=100&odnWidth=100"), img(2), img(3)],
    upc: "036000291452",
    shortDescription: "A soft fixture plush for tests. Second fixture sentence. Third one.",
    specifications: [{ name: "Assembled Product Weight", value: "0.4 lb" }],
    availabilityStatus: "IN_STOCK",
    ...over,
  };
}
const listing = (over = {}) => ({ name: "Fixture Bluey Plush 12 in", price: 9.97, image: img(1), url: "https://www.walmart.com/ip/fixture-bluey/1001?athbdg=L1600", onSale: true, ...over });

console.log("\n  Walmart density -- the plan");

await check("toys and kids/baby run first; clearance leads every department; every run uses the site's confirmed listing input", () => {
  const plan = W.listingPlan();
  assert.deepEqual([...new Set(plan.slice(0, 33).map((r) => r.dept))], ["toys", "kids_baby"]);
  for (const d of W.DENSITY_PLAN) {
    const runs = plan.filter((r) => r.dept === d.dept);
    const firstNonSale = runs.findIndex((r) => !r.clearance);
    assert.ok(runs.slice(firstNonSale).every((r) => !r.clearance), `${d.dept}: a clearance term runs after the depth`);
    assert.ok(runs[0].clearance, `${d.dept}: does not lead with clearance`);
  }
  assert.deepEqual(W.listingInput(plan[0]), { targets: ["toys clearance"], maxResults: 120 });
  assert.match(readFileSync(ROOT + "netlify/functions/apify-scrape-start.js", "utf8"), /actorId: "devcake\/walmart-product-scraper"[\s\S]{0,900}return \{ targets: \[target\], maxResults: maxItems \}/, "the site's listing actor input changed");
  assert.ok(["toys_games", "jewelry_accessories", "fashion", "shoes", "home_decor", "fitness", "electronics", "beauty"].every((b) => W.DENSITY_PLAN.some((d) => d.bucket === b)), "existing Walmart buckets unused");
});

await check("the estimate fits the $200 program envelope and refuses what is left over", () => {
  const rates = W.ratesFromEnv({});
  const est = W.estimateProgram(W.listingPlan(), rates);
  assert.ok(est.estimateUsd > 50 && est.estimateUsd < 200, `estimate $${est.estimateUsd}`);
  assert.equal(est.overCap, false);
  assert.equal(W.estimateProgram(W.listingPlan(), rates, { spentBeforeUsd: 150 }).overCap, true);
  assert.deepEqual(W.detailInput(["u1"]), { startUrls: [{ url: "u1" }] });
  assert.deepEqual(W.detailInput(["u1"], "productUrls"), { productUrls: ["u1"] });
});

console.log("\n  Walmart density -- the rules");

await check("exclusions: aerosols, pesticides, firearms, fuel, supplements, furniture, freeze-dried meals out; traps, Dutch ovens, massage guns, Nerf, ink in", () => {
  const out = { "Raid Ant Killer Aerosol": "dangerous-goods", "Fixture Wasp Spray Insecticide": "dangerous-goods", "Fixture .22 Rifle": "firearm",
    "Fixture Propane Cylinder 16 oz": "dangerous-goods", "Fixture Vitamin D3 Gummies": "supplement", "Fixture 6-Drawer Dresser": "furniture",
    "Fixture Freeze Dried Meal": "food-import", "Fixture Rifle Scope 3-9x": "firearm", "Fixture Chest Freezer": "large-appliance" };
  for (const [name, kind] of Object.entries(out)) assert.equal(W.exclusionOf(name), `excluded-${kind}`, name);
  for (const name of ["Fixture Mouse Trap 4 Pack", "Fixture Fly Ribbon", "Fixture Dutch Oven 6 qt", "Fixture Massage Gun", "Fixture Nerf Elite Blaster", "Fixture 67 Ink Cartridge", "Fixture Water Gun"]) assert.equal(W.exclusionOf(name), null, name);
});

await check("a detail row maps to a full product: every distinct photo, was-price, UPC, the PDP's sentences, a verified weight", () => {
  const row = W.detailToRow(detail(), listing());
  const v = W.ingestRow(row, { dept: "toys", bucket: "toys_games", clearance: true, maxItems: 10 }, ctx);
  assert.ok(v.item, JSON.stringify(v));
  const it = v.item;
  assert.equal(it.retailer, "walmart");
  assert.equal(it.images.length, 3, "presets of one photo were kept twice: " + JSON.stringify(it.images));
  assert.deepEqual([it.price, it.originalPrice, it.onSale], [9.97, 14.97, true]);
  assert.equal(it.gtin, "036000291452");
  assert.equal(it.description, "A soft fixture plush for tests. Second fixture sentence.");
  assert.equal(it.descriptionSource, "walmart-pdp");
  assert.equal(it.weightEstimated, false);
  assert.equal(it.blastEligible, true);
  assert.equal(it.clearanceListing, true);
  assert.equal(v.bucket, "toys_games");
});

await check("the weight gate: no published weight or over 5 kg is held from promotion, never dropped", () => {
  const run = { dept: "outdoors", bucket: "outdoors", maxItems: 10 };
  const none = W.ingestRow(W.detailToRow(detail({ specifications: [] })), run, ctx).item;
  assert.deepEqual([none.blastEligible, none.blastHold], [false, "no-published-weight"]);
  const heavy = W.ingestRow(W.detailToRow(detail({ name: "Fixture 6-Person Tent", specifications: [{ name: "Assembled Product Weight", value: "14 lb" }] })), run, ctx).item;
  assert.deepEqual([heavy.blastEligible, heavy.blastHold], [false, "over-5kg"]);
});

await check("car seats are safety gear: flagged, with any manufacture/expiry date the PDP publishes", () => {
  const seat = W.ingestRow(W.detailToRow(detail({ name: "Fixture Infant Car Seat", specifications: [{ name: "Assembled Product Weight", value: "9 lb" }, { name: "Expiration Date", value: "10 years from manufacture" }] })), { dept: "kids_baby", bucket: "kids_baby", maxItems: 1 }, ctx).item;
  assert.equal(seat.safetyGear, true);
  assert.deepEqual(seat.safetyDates, [{ name: "Expiration Date", value: "10 years from manufacture" }]);
});

await check("a listing row with no detail row keeps its one photo and its price, and the report counts it as a gallery hole", () => {
  const pulled = mergePull([{ run: { dept: "toys", bucket: "toys_games", clearance: true, maxItems: 5 }, items: [listing(), listing({ name: "Fixture Lonely Toy", url: "https://www.walmart.com/ip/x/2", price: 5 })] }], [detail()]);
  const { stats, catalog } = W.ingestProgram(pulled, ctx);
  assert.equal(stats.published, 2);
  assert.equal(stats.gallery, 1, "only the product with a detail row has a gallery");
  assert.equal(stats.perDept.toys.clearance, 2);
  assert.equal(W.productCount(catalog), 2);
});

await check("the trial report: distinct photos with presets collapsed, coverage, raw keys, PASS/FAIL", () => {
  const html = readFileSync(ROOT + "producto.html", "utf8").replace(/<script\b[^>]*>/g, "\n").replace(/<\/script>/g, "\n");
  const photoKey = liftDeclarations(html, ["galleryPhotoKey"]).galleryPhotoKey;
  const t = W.trialReport([detail(), detail({ usItemId: "2", allImages: [img(9)] })], { photoKey });
  assert.equal(t.avgDistinctPhotos, 2, `avg ${t.avgDistinctPhotos}`);
  assert.equal(t.multiPhotoShare, 0.5);
  assert.equal(t.pass, false, "half single-photo must fail");
  assert.ok(t.rawKeys.some((k) => k.startsWith("allImages")));
  assert.equal(W.trialReport(Array.from({ length: 5 }, (_, i) => detail({ usItemId: String(i) })), { photoKey }).pass, true);
});

console.log("\n  CLI");

await check("the default run prints the estimate and spends nothing (exit 2); --src --dry-run ingests a saved pull and writes nothing", () => {
  const env = { ...process.env, APIFY_API_KEY: "", GROQ_API_KEY: "" };
  const r = spawnSync(process.execPath, [ROOT + "scripts/build-walmart-catalog.mjs"], { env, encoding: "utf8" });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /ESTIMATED COST: ~\$\d+/);
  assert.match(r.stdout, /Nothing was spent/);
  const dir = mkdtempSync(join(tmpdir(), "wm-"));
  try {
    const src = join(dir, "raw.json");
    writeFileSync(src, JSON.stringify({ listings: [{ run: { dept: "toys", bucket: "toys_games", clearance: true, maxItems: 5 }, items: [listing()] }], details: [detail()], spentUsd: 1.23 }));
    const d = spawnSync(process.execPath, [ROOT + "scripts/build-walmart-catalog.mjs", "--src", src, "--dry-run", "--no-weight-estimates"], { env, encoding: "utf8" });
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.match(d.stdout, /Walmart ingest: 1 published of 1 rows/);
    assert.match(d.stdout, /toys\s+5 \/\s+1 \/\s+1 \/\s+1/);
    assert.match(d.stdout, /WEIGHT GATE: 1 promotable/);
    assert.match(d.stdout, /\$1\.23 drawn of \$200\.00/);
    assert.equal(existsSync(ROOT + W.OUT_FILE), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const t = spawnSync(process.execPath, [ROOT + "scripts/build-walmart-catalog.mjs", "--trial", "20"], { env, encoding: "utf8" });
  assert.equal(t.status, 2, "a trial without --confirm-spend must not run");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
