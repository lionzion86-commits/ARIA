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
/* Sephora (lane closed, resale prohibited), SSENSE (lane closed) and
   Surf World (the store closed) followed Target out (#443 item 40);
   Sephora's and SSENSE's data is shelved under hidden-docs/shelved/,
   which is never served. */
const CLOSED = { target: "Target", rockauto: "RockAuto", sephora: "Sephora", ssense: "SSENSE", surfworld: "Surf World" };

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
    const files = tracked.filter((f) => !f.startsWith("hidden-docs/") && new RegExp(`(^|/)(${key}-catalog|department-cache-${key})\\.json$|^logos/${key}\\.`).test(f));
    assert.deepEqual(files, [], "files still present");
    const rx = new RegExp(`${key}-catalog\\.json|department-cache-${key}\\.json|logos/${key}\\.`);
    const bad = tracked.filter((f) => /\.(html|js|mjs)$/.test(f) && !/^(build\/min|scripts\/test|reports|hidden-docs)\//.test(f) && rx.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(bad, []);
  });

  check(`${label}: no registry row in the bundle, the store pages or retailers.js`, () => {
    const rx = new RegExp(`(?:\\b${key}\\s*:\\s*\\{|['"]${key}['"]\\s*:\\s*\\{|\\{\\s*k:\\s*'${key}'|key:\\s*['"]${key}['"]|['"]${key}['"]\\s*:\\s*['"]${label}['"]|\\b${key}\\s*:\\s*['"]${label}['"])`);
    const where = [`build/${bundle}`, "index.html", "tienda.html", "producto.html", "ofertas.html", "auto.html", "departamento.html", "scripts/lib/retailers.js", "netlify/functions/_store-knowledge.js"];
    const bad = where.filter((f) => rx.test(readFileSync(ROOT + f, "utf8")));
    assert.deepEqual(bad, []);
  });
}

check("the Toys aisle and the store photo backdrop are Walmart only", () => {
  const src = readFileSync(ROOT + `build/${bundle}`, "utf8");
  assert.match(src, /const STORE_CATEGORY_STORES = \['walmart'\];/);
  assert.ok(!/['"]target['"]\s*[,:\]]/.test(src), "a quoted 'target' store key survives in the bundle");
  assert.ok(!/storePhotoBg--target/.test(src));
});

check("the shelved data is under hidden-docs/ (forced 404), never at the root", () => {
  assert.ok(existsSync(ROOT + "hidden-docs/shelved/ssense-catalog.json"), "SSENSE's catalogue is not shelved");
  assert.ok(existsSync(ROOT + "hidden-docs/shelved/sephora-beauty-catalog.json"), "Sephora's rows are not shelved");
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /from = "\/hidden-docs\/\*"\s+to = "\/404"\s+status = 404\s+force = true/);
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
