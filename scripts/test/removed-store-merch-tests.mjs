/* ==================================================================
   REMOVAL COMPLETENESS: NO MERCHANDISING FOR AN OFF-SALE STORE (#443).

   #457 took 21 stores off sale through the data (catalogues, search,
   Ofertas, tiles, the assistant), but static markup does not read
   off-sale.js: a hard-coded Best Buy banner's comments and CSS, the
   off-sale stores' ambient themes and Best Buy's "Por qué compramos"
   trust strip survived in the page templates. Danny spotted it live.

   This holds every page template (the root *.html files) to the rule:
   for every store on off-sale.js's list there is
     - no ambient theme or interior-photo CSS
       ([data-store-theme="<key>"], .storePhotoBg--<key>),
     - no store rail, banner or feature markup (data-store-rail,
       data-store-rail-row, data-<key>-feature),
     - no <img> of the store's own logo (logos/<key>.*) in the markup,
     - and none of the Best Buy promotional pieces by name.

   NOT in scope (mechanism, not merchandising): off-sale.js itself, the
   retailer registries and label dictionaries pages and the bundle carry
   (they are gated by off-sale.js at run time), image-host patterns, and
   brand names on products that live stores sell (Nike at Pro Soccer,
   Golden Goose at Farfetch).

   RUNNING IT
     node scripts/test/removed-store-merch-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const OFF = JSON.parse("[" + /var OFF_SALE_RETAILERS = \[([\s\S]*?)\];/.exec(readFileSync(ROOT + "off-sale.js", "utf8"))[1]
  .replace(/'/g, '"').replace(/,\s*$/, "") + "]");
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();

/* Markup only: the page with its <script> bodies removed, so a registry
   inside a script is not mistaken for a tag. Styles stay in. */
const markupOf = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

check(`the off-sale list is the one #457 set (${OFF.length} stores)`, () => {
  for (const k of ["bestbuy", "target", "costco", "victoriassecret", "pacsun"]) assert.ok(OFF.includes(k), `${k} is not on off-sale.js`);
});

for (const page of PAGES) {
  const html = readFileSync(ROOT + page, "utf8");
  const markup = markupOf(html);
  check(`${page}: no theme, rail, banner or logo markup for an off-sale store`, () => {
    const found = [];
    for (const k of OFF) {
      const rx = [
        [`theme CSS`, new RegExp(`data-store-theme="${k}"`)],
        [`photo backdrop CSS`, new RegExp(`storePhotoBg--${k}\\b`)],
        [`store rail`, new RegExp(`data-store-rail(-row)?="${k}"`)],
        [`feature block`, new RegExp(`data-${k}-feature\\b`)],
        [`logo <img>`, new RegExp(`<img\\b[^>]*\\bsrc="/?logos/${k}\\.(svg|png|jpg|webp)"`, "i")],
      ];
      for (const [what, re] of rx) if (re.test(markup)) found.push(`${k}: ${what}`);
    }
    assert.deepEqual(found, []);
  });
}

check("the Best Buy banner, its CSS and its trust strip are gone", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  assert.doesNotMatch(home, /BEST BUY BANNER/);
  assert.doesNotMatch(home, /\.bb(Band|TagRule|Logo|Kicker|Cta|Points)\b/);
  assert.doesNotMatch(readFileSync(ROOT + "tienda.html", "utf8"), /Por qué compramos en Best Buy/);
});

check("no orphan block comments for removed shelves (Costco treasure hunt, Target rail)", () => {
  const home = readFileSync(ROOT + "index.html", "utf8");
  assert.doesNotMatch(home, /TREASURE-HUNT SHELF/);
  assert.doesNotMatch(home, /Target rail removed/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
