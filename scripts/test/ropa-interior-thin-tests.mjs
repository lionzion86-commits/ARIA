/* ==================================================================
   ROPA INTERIOR, MOUNTAIN-WEIGHT (2026-10-19, #409 track T5).

   ropa-interior.html already reads two small built feeds
   (scripts/build-ropa-interior-feed.mjs, ~128KB gzipped each), not the
   catalogues. What made it heavy on a slow phone was the drawing:
   ~30 carousels x 20 cards in the DOM at once and loading="lazy"
   photos (228 requests / 1.2MB on the mountain profile, first-screen
   photos at 29s). These checks pin the fix: 12 cards a carousel drawn
   on approach, photos on approach, shape-held cards, soles first.

   RUNNING IT
     node scripts/test/ropa-interior-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = readFileSync(ROOT + "ropa-interior.html", "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "");

check("no catalogue: only the two built feeds", () => {
  assert.ok(!/-catalog\.json|department-cache/.test(PAGE));
  assert.deepEqual([...PAGE.matchAll(/getFeed\('([^']+)'\)/g)].map((m) => m[1]).sort(), ["/ropa-interior-feed.json", "/ropa-interior-women-feed.json"]);
});

check("carousels: at most 12 cards, drawn when about to be seen", () => {
  assert.match(PAGE, /var RAIL_MAX = 12, RAIL_MIN = 4, PAGE = 24, DEEP = 30;/);
  assert.match(PAGE, /'<\/div><div class="track" data-fill="' \+ esc\(P \+ ':' \+ r\.key\) \+ '">' \+ skeletons\(/);
  assert.match(PAGE, /function watchRails\(/);
  assert.match(PAGE, /watchRails\(document\);/);
});

check("photos on approach, never loading=lazy", () => {
  assert.ok(!/loading="lazy"/.test(code));
  assert.match(PAGE, /'<img data-src="' \+ esc\(p\.img\) \+ '"/);
  assert.match(PAGE, /function watchPhotos\(/);
  assert.match(PAGE, /watchPhotos\(el\('grid'\)\);/);
});

check("shape-held cards and card-shaped placeholders before any script", () => {
  assert.match(PAGE, /\.card \.ph\{position:relative;width:100%;aspect-ratio:4\/5;/);
  assert.match(PAGE, /@supports not \(aspect-ratio:4\/5\)\{\.card \.ph\{height:0;padding-top:125%\}\}/);
  assert.equal((PAGE.match(/<div class="track" aria-hidden="true" style="text-align:left"><div class="card sk"/g) || []).length, 2, "both sections need placeholder cards in the HTML");
  assert.ok(!/class="spinner"/.test(PAGE), "a spinner instead of cards");
});

check("soles first with the shared rate, painted in place", () => {
  assert.match(PAGE, /FX_CACHE_KEY = 'aria_fx_rate_v1'/);
  assert.ok(!/aria_fx_cache/.test(PAGE));
  const pi = PAGE.slice(PAGE.indexOf("function priceInner("), PAGE.indexOf("function paintPrices("));
  assert.match(pi, /'<span class="now">' \+ esc\(pen\(now\)\) \+ '<\/span>'/);
  assert.ok(!/aprox\./.test(PAGE));
  assert.ok(!/S\.renderRails\(\); S\.repaintGrid\(\)/.test(PAGE), "the rate still redraws every carousel");
});

const MIN_CHECKS = 5;
if (passed + failures.length < MIN_CHECKS) { console.log(`\n  SUITE INCOMPLETE`); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
