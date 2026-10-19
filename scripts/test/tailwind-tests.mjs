/* ==================================================================
   THE HOME PAGE'S TAILWIND IS PREBUILT, AND CURRENT (#417 iPhone QA).

   index.html used to compile Tailwind on the shopper's phone
   (cdn.tailwindcss.com). It now links assets/css/tailwind.css, built by
   scripts/build-tailwind.mjs from the class names in index.html and the
   app bundle. A class added to either without rebuilding would render
   unstyled -- this suite rebuilds and compares.

   RUNNING IT (needs devDependencies: npm install)
     node scripts/test/tailwind-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTailwindCss, CSS_PATH } from "../build-tailwind.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const home = readFileSync(ROOT + "index.html", "utf8");

check("the home page never compiles Tailwind on the phone", () => {
  assert.ok(!/<script[^>]+cdn\.tailwindcss\.com/.test(home), "index.html loads the cdn.tailwindcss.com runtime again");
  assert.match(home, /<link rel="stylesheet" href="\/assets\/css\/tailwind\.css">\r?\n<\/head>/,
    "the prebuilt stylesheet is not the last thing in <head> (where the runtime put its rules)");
});

check("assets/css/tailwind.css is what the classes in use build today", () => {
  const fresh = buildTailwindCss();
  const committed = readFileSync(ROOT + CSS_PATH, "utf8");
  assert.ok(fresh === committed, `${CSS_PATH} is stale (${committed.length} vs ${fresh.length} bytes) — run: node scripts/build-tailwind.mjs`);
});

check("the search boxes work before the app bundle arrives", () => {
  const early = home.indexOf("window.doSearch = function(which){");
  const bundle = home.search(/<script src="\/build\/app-[0-9a-f]+\.js"><\/script>/);
  const firstBox = home.indexOf('id="searchInput"');
  assert.ok(early > 0 && early < firstBox && firstBox < bundle, "doSearch is not defined before the first search box");
  for (const id of ["searchInput", "searchInputD", "searchInput2"]) assert.ok(home.includes(`id="${id}"`), `#${id} moved`);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
