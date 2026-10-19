/* ==================================================================
   IF A RAIL SHOWS IT, THE PRODUCT PAGE OPENS IT (2026-10-18, #367
   rehearsal finding #6: a Hollister "The Premium Tee" card opened to
   "No encontramos ... en el catálogo").

   Every card on the site links to producto.html?producto=<title>&
   tienda=<retailer>, with the title index.html's normalizeLiveItem
   gives the item. producto.html keeps its own store tables and its own
   normaliser, and both had drifted: the October stores (Hollister,
   Abercrombie, Gap, Banana Republic) were missing, and it read `name`
   before `title`. This suite holds producto.html to the site's registry
   and then resolves EVERY catalogue item, by that exact title, through
   producto.html's own lookup (lifted, not copied).

   RUNNING IT
     node scripts/test/pdp-resolve-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { liftDeclarations, pageHtml } from "../lib/page-lift.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const I = liftDeclarations(pageHtml(ROOT), ["CATALOGUE_FILES", "SOURCE_RETAILERS", "RETAILERS"]);
const P = liftDeclarations(readFileSync(ROOT + "producto.html", "utf8"),
  ["STORE_FILES", "CATALOG_FILES", "STORE_LABELS", "NAMED_ENTITIES", "decodeEntities", "normalizeItem", "extractItems", "norm", "SIZE_ALPHA_ORDER", "SIZE_NUMERIC", "sortSizes", "truthfulSizes"], { extra: "var window = {};\n" });

check("producto.html knows every store and file the site's registry does", () => {
  const missingFiles = [...I.CATALOGUE_FILES].filter((f) => !P.CATALOG_FILES.includes(f));
  assert.deepEqual(missingFiles, [], "producto.html's fallback list lacks " + missingFiles.join(", "));
  const gaps = [];
  for (const [file, keys] of Object.entries(I.SOURCE_RETAILERS)) for (const k of keys) {
    if (!P.STORE_FILES[k] || !P.STORE_FILES[k].includes(file)) gaps.push(`${k} -> ${file}`);
    if (!P.STORE_LABELS[k]) gaps.push(`${k} has no label`);
  }
  assert.deepEqual(gaps, [], "producto.html's store tables drifted from the registry: " + gaps.slice(0, 12).join("; "));
});

check("every catalogue item opens on its product page, by the title its card links with", () => {
  const read = new Map();
  const itemsOf = (f) => {
    if (!read.has(f)) {
      const p = ROOT + f.slice(1);
      read.set(f, existsSync(p) ? P.extractItems(JSON.parse(readFileSync(p, "utf8"))) : []);
    }
    return read.get(f);
  };
  /* What the page searches for ?tienda=<k>: every file in STORE_FILES[k]. */
  const keysByStore = new Map();
  const titleKeys = (k) => {
    if (!keysByStore.has(k)) keysByStore.set(k, new Set((P.STORE_FILES[k] || []).flatMap((f) => itemsOf(f)).map((it) => P.norm(it.name))));
    return keysByStore.get(k);
  };
  let n = 0;
  const misses = [];
  for (const [file, keys] of Object.entries(I.SOURCE_RETAILERS)) {
    const p = ROOT + file.slice(1);
    if (!existsSync(p)) continue;
    const data = JSON.parse(readFileSync(p, "utf8"));
    for (const k of keys) {
      const r = data.retailers && data.retailers[k];
      if (!r) continue;
      for (const section of ["departments", "brands"]) for (const bucket of Object.values(r[section] || {})) {
        for (const it of (Array.isArray(bucket) ? bucket : bucket && bucket.items) || []) {
          if (!it || !(Number(it.price) > 0)) continue;
          const title = it.title || it.name || it.productTitle || it.productName;   /* index.html normalizeLiveItem */
          if (!title) continue;
          n++;
          if (!titleKeys(k).has(P.norm(title))) misses.push(`${k}: ${title}`);
        }
      }
    }
  }
  assert.ok(n > 100000, `only ${n} items checked`);
  if (process.env.SHOW) console.log(JSON.stringify(misses));
  assert.deepEqual(misses.slice(0, 15), [], `${misses.length} of ${n} cards open to "No encontramos"`);
  console.log(`         (${n} items resolved)`);
});

check("a miss is never a dead end: the store, a search for what was tapped, and in-lane sale items", () => {
  const page = readFileSync(ROOT + "producto.html", "utf8");
  const f = page.slice(page.indexOf("function fail(msg, ctx)"), page.indexOf("\n}\n", page.indexOf("function fail(msg, ctx)")));
  assert.match(f, /tienda\.html\?tienda=/, "no route to the product's store");
  assert.match(f, /search\.html\?q=/, "the search link is not seeded with the product");
  assert.match(f, /buildRelatedRails\(/, "no similar items on a miss");
  assert.ok(!/href="search\.html"/.test(f), "the bare, empty search link is back");
  assert.match(page, /fail\([^)]*\{ store: tienda, query: want, pool: lastPool \}\)/);
});

const MIN_CHECKS = 3;
if (passed + failures.length < MIN_CHECKS) { console.log("\n  SUITE INCOMPLETE"); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
