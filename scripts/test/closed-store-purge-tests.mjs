/* ==================================================================
   CLOSED STORES ARE GONE, NOT HIDDEN (#443 item 37, 2026-10-24).

   Target was closed as a source on Oct 22, but off-sale.js only hid it
   at run time: 769 products still sat in department-cache.json, the
   catalogues and the photo-search index, and the store registries still
   carried its tile. RockAuto was a hollow registry tile with no
   products. Danny's ruling: a closed (failed) lane comes down entirely,
   as if never listed.

   This holds the repo to it, for every store on CLOSED:
     - no product row (retailer/store = key) in any served JSON,
       including the photo-search shards and every derived slice;
     - no catalogue file, logo file or file-map entry for it;
     - no registry row (key/label/logo) in the app bundle, the store
       pages or scripts/lib/retailers.js.
   off-sale.js may keep the key: it is the run-time gate that blocks a
   stale cart line, not merchandising.

     node scripts/test/closed-store-purge-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url).pathname;
/* Surf World closed (the store itself, Sept 2026; #443 item 40). */
const CLOSED = { target: "Target", rockauto: "RockAuto", surfworld: "Surf World" };

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter((f) => f && existsSync(ROOT + f));
const served = (f) => !/^(hidden-docs|reports|scripts|netlify|node_modules)\//.test(f);
const bundle = readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));

for (const [key, label] of Object.entries(CLOSED)) {
  check(`${label}: no product row in any served JSON (catalogues, caches, slices, photo index)`, () => {
    const rx = new RegExp(`"(?:retailer|store)"\\s*:\\s*"${key}"`);
    const bad = tracked.filter((f) => served(f) && f.endsWith(".json") && !/audit/.test(f) && rx.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(bad, []);
  });

  check(`${label}: no catalogue, logo or file-map entry`, () => {
    const files = tracked.filter((f) => new RegExp(`(^|/)(${key}-catalog|department-cache-${key})\\.json$|^logos/${key}\\.`).test(f));
    assert.deepEqual(files, [], "files still present");
    const rx = new RegExp(`${key}-catalog\\.json|department-cache-${key}\\.json|logos/${key}\\.`);
    const bad = tracked.filter((f) => /\.(html|js|mjs)$/.test(f) && !/^(build\/min|scripts\/test|reports|hidden-docs)\//.test(f) && rx.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(bad, []);
  });

  check(`${label}: no registry row in the bundle, the store pages or retailers.js`, () => {
    const rx = new RegExp(`(?:\\b${key}\\s*:\\s*\\{|['"]${key}['"]\\s*:\\s*\\{|\\{\\s*k:\\s*'${key}'|key:\\s*['"]${key}['"]|['"]${key}['"]\\s*:\\s*['"]${label}['"]|\\b${key}\\s*:\\s*['"]${label}['"])`);
    const where = [`build/${bundle}`, "index.html", "tienda.html", "tiendas.html", "producto.html", "ofertas.html", "auto.html", "departamento.html", "scripts/lib/retailers.js"];
    const bad = where.filter((f) => rx.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(bad, []);
    /* The assistant's knowledge keeps no entry for it; its off-sale name and
       live alternatives stay (named, she says it is off sale and names a
       live door -- mechanism, like off-sale.js). */
    const K = readFileSync(ROOT + "netlify/functions/_store-knowledge.js", "utf8");
    assert.doesNotMatch(K, new RegExp(`\\n  ${key}: \\{\\n\\s+name:`), "the assistant still describes it as a store");
  });
}

/* SHELVED, NOT DELETED (#443 c.6468346931, Danny, 2026-10-28): Sam's Club
   was one scrape of a disposables aisle, which cannot be a real store. It
   leaves every shopper surface and registry, but its catalogue stays in
   the repo untouched (the Sephora/SSENSE pattern) for a club that can
   return real. off-sale.js keeps the key (it blocks a stale cart line). */
const SHELVED = { samsclub: "Sam's Club" };
const SHELVED_FILE = (key) => `${key}-catalog.json`;
const NAME_RX = /sams\s*club|sam['’]s\s*club|sam&#39;s\s*club|samsclub|member['’]?s\s+mark/i;
for (const [key, label] of Object.entries(SHELVED)) {
  check(`${label}: shelved -- the catalogue is kept, and no file list, registry or served file names the store`, () => {
    assert.ok(existsSync(ROOT + SHELVED_FILE(key)), "the shelved catalogue was deleted");
    const rowRx = new RegExp(`"(?:retailer|store)"\\s*:\\s*"${key}"`);
    const rows = tracked.filter((f) => served(f) && f.endsWith(".json") && f !== SHELVED_FILE(key) && rowRx.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(rows, [], "product rows outside the shelved catalogue");
    /* Every served text file, the app bundle included: only the off-sale
       gate and the shelved catalogue itself may carry the name. */
    const named = tracked.filter((f) => served(f) && /\.(html|js|mjs|css|json|xml|txt)$/.test(f)
      && f !== SHELVED_FILE(key) && f !== "off-sale.js" && NAME_RX.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(named, [], "served files still name the store");
    const server = ["scripts/lib/retailers.js", "netlify/functions/_aria-prompt.js", "scripts/lib/retailer-delivery.js", "scripts/lib/item-weight.js",
      "scripts/build-search-index.mjs", "scripts/build-department-slices.mjs", "scripts/build-brand-index.mjs"];
    assert.deepEqual(server.filter((f) => NAME_RX.test(readFileSync(ROOT + f, "utf8"))), [], "a builder or registry still names it");
    const K = readFileSync(ROOT + "netlify/functions/_store-knowledge.js", "utf8");
    assert.doesNotMatch(K, new RegExp(`\\n  ${key}: \\{\\n\\s+name:`), "the assistant still describes it as a store");
    assert.match(readFileSync(ROOT + "off-sale.js", "utf8"), new RegExp(`'${key}'`), "a stale cart line would pass the door");
  });
}

check("the homepage's US-stores band is one wide Walmart tile, phone and desktop", () => {
  const html = readFileSync(ROOT + "index.html", "utf8");
  const bands = html.match(/<section aria-label="Walmart" class="relative overflow-hidden"[\s\S]*?<\/section>/g) || [];
  assert.equal(bands.length, 2, "the phone and desktop bands");
  for (const b of bands) {
    const tiles = b.match(/<button onclick="tiendaJump\('([a-z]+)'\)"[^>]*>/g) || [];
    assert.equal(tiles.length, 1, "one tile");
    assert.match(tiles[0], /tiendaJump\('walmart'\)/);
    assert.match(tiles[0], /class="col-span-2 /, "the tile spans both slots");
  }
});

check("the Toys aisle and the store photo backdrop are Walmart only", () => {
  const src = readFileSync(ROOT + `build/${bundle}`, "utf8");
  assert.match(src, /const STORE_CATEGORY_STORES = \['walmart'\];/);
  assert.ok(!/['"]target['"]\s*[,:\]]/.test(src), "a quoted 'target' store key survives in the bundle");
  assert.ok(!/storePhotoBg--target/.test(src));
});

check("the photo-search manifest counts match the shards after the purge", () => {
  const man = JSON.parse(readFileSync(ROOT + "visual-index/manifest.json", "utf8"));
  let total = 0;
  for (const s of man.shards) {
    const meta = JSON.parse(readFileSync(ROOT + "visual-index/" + s.meta, "utf8"));
    const bytes = readFileSync(ROOT + "visual-index/" + s.bin).length;
    assert.equal(meta.length, s.count, s.meta);
    assert.equal(bytes, s.count * man.dim, s.bin);
    total += s.count;
  }
  assert.equal(man.total, total);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
