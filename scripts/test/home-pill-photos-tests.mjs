/* ==================================================================
   EVERY HOMEPAGE PILL IS A REAL PHOTO (#443 item 38, Danny's iPhone
   review: "many pills do not carry real pictures" -- the sunglasses one
   was clip art). Zero emojis, never an icon, never a letter, never a
   placeholder: each pill on CATEGORY_TAB_ORDER has a cover that is a
   photograph -- a file under assets/category/ that exists, or the real
   product photo of a card in our own catalogues.

     node scripts/test/home-pill-photos-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const bundleFile = readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
const SRC = readFileSync(ROOT + "build/" + bundleFile, "utf8");
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const order = JSON.parse(/const CATEGORY_TAB_ORDER = (\[[^\]]*\])/.exec(SRC)[1].replace(/'/g, '"'));
const coverBlock = /const CATEGORY_COVERS = \{([\s\S]*?)\n\};/.exec(SRC)[1];
const covers = {};
for (const m of coverBlock.matchAll(/^\s*([a-z_]+):\s*'([^']+)'/gm)) covers[m[1]] = m[2];
/* Every catalogue's photo URLs, to prove a remote cover is a real card's. */
const catalogText = readdirSync(ROOT).filter((f) => /-catalog\.json$|^ropa-interior.*feed\.json$|^department-cache-[a-z]+\.json$/.test(f))
  .map((f) => readFileSync(ROOT + f, "utf8")).join("\n")
  + readFileSync(ROOT + "assets/sections/departamento/_fn/reacondicionados.json", "utf8");

check("every pill on the order has a photo cover", () => {
  const missing = order.filter((k) => !covers[k]);
  assert.deepEqual(missing, [], "pills with no photo");
});
check("each cover is a photo file that exists, or a real product photo from our catalogues", () => {
  for (const k of order) {
    const c = covers[k];
    if (/^https?:\/\//.test(c)) assert.ok(catalogText.includes(JSON.stringify(c).slice(1, -1)), `${k}: ${c} is no card's photo`);
    else {
      assert.match(c, /\.(jpe?g|webp|png)$/i, `${k}: ${c} is not a photo`);
      assert.ok(existsSync(ROOT + c), `${k}: ${c} is missing`);
    }
  }
});
check("the clip-art covers are gone (sunglasses, soccer) and a pill never falls back to a letter", () => {
  assert.ok(!/^assets\/category\/(sunglasses|soccer)\.jpg$/.test(covers.sunglasses) && !/^assets\/category\/soccer\.jpg$/.test(covers.soccer));
  assert.ok(!/charAt\(0\)\.toUpperCase\(\)\}<\/span>`\);/.test(SRC.slice(SRC.indexOf("function categoryTabPillHTML"), SRC.indexOf("function categoryTabPillHTML") + 1600)), "the letter fallback is back");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
