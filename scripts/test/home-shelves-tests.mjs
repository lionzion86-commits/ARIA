/* ==================================================================
   THE HOME PAGE'S SHELVES ARE SLICES, AND THEY ARE TRUE (#417 order 3).

   Scrolling the home page on a phone used to download 26.7MB of
   catalogue JSON. Each rail now fetches a precomputed slice
   (assets/home/shelves/, built by scripts/build-home-shelves.mjs from
   the page's own picks). These checks hold that in place:

   - every visible home store rail and rail family has its slice;
   - every product on a shelf is still in the committed catalogues or
     feeds, with a photo and a price (a stale slice would sell something
     that is gone -- rebuild after a catalogue refresh);
   - each family reads its slice before any catalogue, and falls back to
     the catalogue only when the slice is missing;
   - the slices stay small.

   RUNNING IT
     node scripts/test/home-shelves-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIR = ROOT + "assets/home/shelves/";
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const home = readFileSync(ROOT + "index.html", "utf8");
const bundleName = /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(home)[1];
const bundle = readFileSync(ROOT + bundleName, "utf8");
const read = (f) => JSON.parse(readFileSync(DIR + f, "utf8"));
const index = read("index.json");

check("every home store rail and rail family has its slice", () => {
  const rows = [...home.matchAll(/data-store-rail-row="([a-z0-9_]+)"/g)].map((m) => m[1]);
  /* 19 before the sourcing audit took the REMOVE stores off sale (#443). */
  assert.ok(index.stores.length >= 8, `only ${index.stores.length} store slices`);
  for (const k of index.stores) {
    assert.ok(rows.includes(k), `store slice ${k} has no rail on the page`);
    assert.ok(existsSync(DIR + `store-${k}.json`), `store-${k}.json is missing`);
    assert.ok(read(`store-${k}.json`).picks.length > 0, `store-${k}.json is empty`);
  }
  for (const f of ["category.json", "bolsos.json", "joyas.json", "joyasLujo.json", "moda.json"]) assert.ok(existsSync(DIR + f), `${f} is missing`);
  assert.ok(Object.keys(read("category.json").rails).length >= 10, "the category zone slice is thin");
  assert.ok(index.tiles.length > 0 && index.brandStrip.length > 0, "tiles or brand strip missing");
});

/* Every product the committed sources carry, by store and title. */
const known = new Set();
const add = (retailer, title) => { if (retailer && title) known.add(String(retailer).toLowerCase() + "::" + String(title).trim()); };
for (const f of readdirSync(ROOT).filter((f) => /(-catalog|^department-cache-[a-z]+|feed(-lite)?|^vs-deals)\.json$/.test(f))) {
  let j; try { j = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
  for (const [rk, r] of Object.entries((j && j.retailers) || {})) for (const sec of ["departments", "brands"]) for (const b of Object.values((r && r[sec]) || {})) {
    for (const it of (Array.isArray(b) ? b : (b && b.items) || [])) if (it) add(it.retailer || rk, it.title || it.name || it.productName);
  }
  for (const it of (j && (j.items || j.products)) || []) if (it) add(it.retailer, it.title || it.name || it.productName);
}

check("every product on a shelf is still sold, with a photo and a price", () => {
  const stale = [], broken = [];
  let n = 0;
  for (const f of readdirSync(DIR).filter((f) => f !== "index.json")) {
    const body = read(f);
    const lists = body.picks ? [body.picks] : Object.values(body.rails || {});
    for (const list of lists) for (const p of list) {
      n++;
      if (!(Number(p.price) > 0) || !p.image || !p.title) broken.push(`${f}: ${p.title}`);
      if (!known.has(String(p.retailer).toLowerCase() + "::" + String(p.title).trim())) stale.push(`${f}: ${p.retailer} ${p.title}`);
    }
  }
  assert.ok(n > 300, `only ${n} shelf cards`);
  assert.deepEqual(broken, [], "cards without a price, photo or title");
  assert.equal(stale.length, 0, `${stale.length} shelf products are no longer in the catalogues, e.g. ${stale.slice(0, 3).join(" | ")} — run: node scripts/build-home-shelves.mjs`);
});

check("the slices stay small (the whole set under 100KB gzipped)", () => {
  let gz = 0;
  for (const f of readdirSync(DIR)) {
    const size = gzipSync(readFileSync(DIR + f)).length;
    gz += size;
    /* category.json holds every Compra por categoría rail at 25 cards
       (Danny, #443 c.6539643881); it loads when those rails near the screen. */
    assert.ok(size < (f === "category.json" ? 56 : 40) * 1024, `${f} is ${size} bytes gzipped`);
  }
  assert.ok(gz < 100 * 1024, `the shelves total ${gz} bytes gzipped`);
});

check("every family reads its slice before any catalogue", () => {
  assert.match(bundle, /const HOME_SHELVES_DIR = '\/assets\/home\/shelves\/';/);
  assert.match(bundle, /const saved = await homeShelfPicks\('store-' \+ key\);[\s\S]{0,400}const pool = await poolForRetailers\(\[key\]\);/, "store rails");
  assert.match(bundle, /const saved = await homeShelf\('category'\);[\s\S]{0,400}const pool = await relatedPool\(\);/, "category zone");
  assert.match(bundle, /homeShelf\('index'\);\s*let brands = /, "brand strip");
  assert.match(bundle, /bolsosRendered = \(await homeShelfPicks\('bolsos'\)\) \|\| bolsosPicks\(await loadDepartmentCache\(\)\);/, "bolsos");
  assert.match(bundle, /const saved = await homeShelfPicks\('joyas'\);/, "joyas");
  assert.match(bundle, /joyasLujoRendered = \(await homeShelfPicks\('joyasLujo'\)\) \|\| /, "joyas de lujo");
  assert.match(bundle, /modaRendered = \(await homeShelfPicks\('moda'\)\) \|\| /, "moda");
  assert.match(bundle, /homeShelf\('index'\)\.then\(index => \{\s*if \(index && Array\.isArray\(index\.tiles\)/, "tiles");
});

check("rails painted by section watch every copy of their section (phone and desktop)", () => {
  for (const fam of ["bolsos", "joyas", "joyas-lujo", "moda"]) {
    assert.ok(bundle.includes(`paintRailWhenNear(document.querySelectorAll('[data-${fam}-section]')`), `${fam} watches one copy only`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
