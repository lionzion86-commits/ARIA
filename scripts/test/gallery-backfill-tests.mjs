/* ==================================================================
   GALLERY BACKFILL (#443, comms #443 "Zumiez pass", FIX 2).

   Pins scripts/lib/gallery-backfill.js and the command around it
   (scripts/backfill-gallery.mjs) without spending a cent or touching
   the network:
   - the targets are the catalogue's own product URLs, one per page,
     only products on 0-1 photo unless --all;
   - the estimate is the repo's cost model, the $200 wave cap refuses a
     backfill that would pass it, and each run is guarded again;
   - the merge adds photos ONLY: price, sizes and every other field are
     untouched; one copy of each photo whatever its size (producto.html
     galleryPhotoKey), size charts last, the card photo first; rows
     that match no record are ignored; nothing non-http is kept;
   - the catalogue is written back in its own JSON style (zumiez-catalog
     .json round-trips byte for byte);
   - the command prints the estimate and stops (exit 2) without
     --confirm-spend, and refuses (exit 3) over the cap.
   Fixture products below are synthetic test data, never written to a
   catalogue.

   RUNNING IT
     node scripts/test/gallery-backfill-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { liftPage } from "../build-pdp-slices.mjs";
import {
  backfillTargets, estimateBackfill, capGuard, mergeGalleries, serializerFor, pyDumps, actorInput, planRuns,
  costRatesFromEnv, WAVE_CAP_USD, DEFAULT_ACTOR,
} from "../lib/gallery-backfill.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const P = liftPage(ROOT);
const rule = { photoKey: (u) => P.galleryPhotoKey(u), isChart: (u) => P.galleryIsChart(u) };
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const S7 = "https://scene7.example.com/is/image/store/";
const fixture = () => ({
  retailers: { teststore: { departments: {
    tops: { items: [
      { name: "Tee A", price: 10, originalPrice: 20, sizes: ["S", "M"], url: "https://www.example.com/tee-a.html", image: S7 + "cat_max/Tee-A-_1.jpg", images: [S7 + "cat_max/Tee-A-_1.jpg"] },
      { name: "Tee B", price: 12, sizes: ["L"], url: "https://www.example.com/tee-b.html?ref=x", image: S7 + "cat_max/Tee-B-_2.jpg", images: [S7 + "cat_max/Tee-B-_2.jpg", S7 + "cat_max/Tee-B-_2-alt.jpg"] },
      { name: "Tee C", price: 9, url: "", image: S7 + "c.jpg" },
    ] },
  } } },
});

check("targets: the catalogue's own product URLs, one per page, only products on 0-1 photo", () => {
  const t = backfillTargets(fixture(), { retailerKey: "teststore", ...rule });
  assert.deepEqual(t.targets, ["https://www.example.com/tee-a.html"]);
  assert.equal(t.noUrl, 1);
  assert.equal(t.alreadyMulti, 1);
  assert.equal(backfillTargets(fixture(), { retailerKey: "teststore", ...rule, onlySingle: false }).targets.length, 2);
});

check("the estimate: per run + per 1,000 results, and the $200 wave cap", () => {
  const rates = costRatesFromEnv({});
  assert.deepEqual(rates, { costPerRun: 0.06, costPer1000: 5.7 });
  const est = estimateBackfill(2494, rates);
  assert.equal(est.runs, 5);
  assert.equal(est.estimateUsd, 14.52);
  assert.equal(est.capUsd, WAVE_CAP_USD);
  assert.equal(est.stopAboveUsd, 18.15);
  assert.equal(est.overCap, false);
  const tight = estimateBackfill(2494, rates, { spentUsd: 190 });
  assert.equal(tight.capRemainingUsd, 10);
  assert.equal(tight.overCap, true, "an estimate above the cap left is refused");
  assert.equal(costRatesFromEnv({ APIFY_COST_PER_1000_RESULTS_USD: "3" }).costPer1000, 3);
});

check("capGuard: a run that would pass the stop line does not start; the charge limit is what is left", () => {
  const est = estimateBackfill(2494, costRatesFromEnv({}));
  const g0 = capGuard(0, 500, est);
  assert.equal(g0.ok, true);
  assert.equal(g0.chargeLimitUsd, 200);
  const g1 = capGuard(16, 500, est);
  assert.equal(g1.ok, false);
  assert.match(g1.reason, /TOPE DE GASTO/);
  assert.equal(capGuard(3, 500, est, 6).ok, false, "a run going 6x hot is caught");
});

check("the actor input: product URLs as [{url}] under the (overridable) input key", () => {
  assert.equal(DEFAULT_ACTOR, "apify/e-commerce-scraping-tool");
  assert.deepEqual(actorInput(["https://a/x", "https://a/y"]), { detailsUrls: [{ url: "https://a/x" }, { url: "https://a/y" }], maxProductResults: 2 });
  assert.deepEqual(Object.keys(actorInput(["https://a/x"], "startUrls")), ["startUrls", "maxProductResults"]);
  assert.deepEqual(planRuns([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

check("the merge adds photos only: one copy per photo, charts last, card first, prices and sizes untouched", () => {
  const cat = fixture();
  const before = JSON.parse(JSON.stringify(cat));
  const rows = [
    { url: "https://www.example.com/tee-a.html", images: [
      S7 + "cat_max/Tee-A-_1.jpg?$zoom$",                 // the card photo again, another preset
      S7 + "Tee-A-size-chart.jpg",                          // a size chart: last
      { url: S7 + "cat_max/Tee-A-_1-back.jpg" },
      S7 + "cat_max/Tee-A-_1-side_1800x1800.jpg", S7 + "cat_max/Tee-A-_1-side_480x480.jpg",
      "data:image/png;base64,AAA", "/relative.jpg", "https://x.example.com/placeholder.png",
    ], price: 1, sizes: ["XXL"] },                           // a row's price / sizes are never read
    { url: "https://www.example.com/not-in-catalogue.html", images: [S7 + "zzz.jpg"] },
  ];
  const res = mergeGalleries(cat, rows, { retailerKey: "teststore", ...rule, stamp: "test" });
  const a = cat.retailers.teststore.departments.tops.items[0];
  assert.deepEqual(a.images, [S7 + "cat_max/Tee-A-_1.jpg", S7 + "cat_max/Tee-A-_1-back.jpg", S7 + "cat_max/Tee-A-_1-side_1800x1800.jpg", S7 + "Tee-A-size-chart.jpg"]);
  const b0 = before.retailers.teststore.departments.tops.items[0];
  for (const k of Object.keys(b0)) if (k !== "images") assert.deepEqual(a[k], b0[k], `${k} changed`);
  assert.equal(a.imagesBackfill, "test");
  assert.deepEqual(cat.retailers.teststore.departments.tops.items.slice(1), before.retailers.teststore.departments.tops.items.slice(1), "a record with no new photo changed");
  assert.equal(res.updated, 1);
  assert.equal(res.photosAdded, 3);
  assert.equal(res.unmatchedRows, 1);
  assert.deepEqual(res.before, { single: 2, multi: 1 });
  assert.deepEqual(res.after, { single: 1, multi: 2 });
});

check("a page that offers nothing new leaves its record exactly as it was", () => {
  const cat = fixture();
  const before = JSON.stringify(cat);
  const res = mergeGalleries(cat, [{ url: "https://www.example.com/tee-a.html", image: S7 + "cat_max/Tee-A-_1.jpg?$x$" }], { retailerKey: "teststore", ...rule, stamp: "t" });
  assert.equal(JSON.stringify(cat), before);
  assert.equal(res.updated, 0);
});

check("zumiez-catalog.json is written back in its own style, byte for byte", () => {
  const text = readFileSync(ROOT + "zumiez-catalog.json", "utf8");
  const write = serializerFor(text);
  assert.ok(write, "its JSON style is not reproduced");
  assert.equal(write(JSON.parse(text)), text);
  assert.equal(pyDumps({ a: [1, "ñ"], b: null }), '{"a": [1, "ñ"], "b": null}');
  assert.equal(serializerFor('{"a":1.0}'), null, "a style it cannot reproduce is refused");
});

check("the command: Zumiez targets and estimate printed, nothing run without --confirm-spend (exit 2); over the cap refused (exit 3)", () => {
  const run = (args) => {
    try { return { code: 0, out: execFileSync("node", [ROOT + "scripts/backfill-gallery.mjs", ...args], { encoding: "utf8", env: { ...process.env, APIFY_API_KEY: "" } }) }; }
    catch (e) { return { code: e.status, out: String(e.stdout) }; }
  };
  const a = run(["--store", "zumiez"]);
  assert.equal(a.code, 2);
  assert.match(a.out, /2494 records, 2494 product pages/);
  assert.match(a.out, /ESTIMATED COST: ~\$14\.52/);
  assert.match(a.out, /Not run\./);
  const b = run(["--store", "zumiez", "--spent-usd", "195"]);
  assert.equal(b.code, 3);
  assert.match(b.out, /REFUSED/);
  assert.doesNotMatch(a.out + b.out, /\p{Extended_Pictographic}/u);
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
