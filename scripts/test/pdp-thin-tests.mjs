/* ==================================================================
   THE PRODUCT PAGE FETCHES ONE PRODUCT, NOT A CATALOGUE (#409 T1).

   producto.html used to download its store's whole catalogue (39.8MB
   for SSENSE) to show one product, and every catalogue on a miss. It
   now reads one shard of assets/pdp/ (scripts/build-pdp-slices.mjs).
   These checks hold that in place:

   - the page fetches no catalogue, department cache, auto cache or
     Ofertas feed;
   - EVERY catalogue item, tapped from its store with the title its card
     links with, opens through the shards to the same record the old
     download-and-scan found (a stale build fails here -- rebuild after
     a catalogue refresh);
   - every AutoZone part number and title resolves through its small
     shard to the record the full auto-cache scan found;
   - the related rails, picked by the page's own relPick from the
     slices, are the rails the old full pools gave;
   - shards and slices stay small enough for 400 kbps.

   RUNNING IT
     node scripts/test/pdp-thin-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { liftDeclarations, pageHtml } from "../lib/page-lift.mjs";
import { liftPage, sourceFiles, MAX_SHARD_GZ, ofertasRows } from "../build-pdp-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PDP = ROOT + "assets/pdp/";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const page = readFileSync(ROOT + "producto.html", "utf8").replace(/\r\n/g, "\n");
const P = liftPage(ROOT);
const extra = "var window = {};\n" + readFileSync(ROOT + "sale-rule.js", "utf8") + "\n" + readFileSync(ROOT + "product-type.js", "utf8") + "\n";
const R = liftDeclarations(page, ["NAMED_ENTITIES", "decodeEntities", "norm", "REL_MAX", "REL_MIN", "REL_LANES", "relLane", "relGender", "relKey", "relPick", "pdpHash", "deptSlug", "railPath", "unpackImages", "recordToItem"], { extra });
const shardCache = new Map();
const shard = (s) => {
  if (!shardCache.has(s)) shardCache.set(s, JSON.parse(readFileSync(PDP + "p/" + s + ".json", "utf8")));
  return shardCache.get(s);
};
const lookup = (key) => shard(P.pdpShard(key))[key] || null;

await check("the page fetches no catalogue, cache or feed -- only its shards, slices, the rate and search", () => {
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "");
  const urls = [...code.matchAll(/fetch(?:Json)?\(([^;\n]*)/g)].map((m) => m[1]);
  for (const u of urls) assert.doesNotMatch(u, /catalog\.json|department-cache|auto-cache|ofertas-feed/, "fetches " + u);
  assert.doesNotMatch(code, /function fetchOne\(|fetch\(f\)/, "the per-catalogue fetcher is back");
  assert.doesNotMatch(code, /"\/(?:auto-cache|ofertas-feed-lite|ofertas-feed)\.json"/, "a whole-cache URL is back in the page");
  assert.match(code, /fetchJson\(PDP_BASE \+ "p\/" \+ s \+ "\.json"\)/);
  assert.match(code, /huntAuto\(autoUrl\(\)\)/);
});

await check("the page and the build hash the same way (the shard a title lives in)", () => {
  for (const t of ["the premium tee", "lizzie & oliver", "duralast ceramic brake pads d1114", "ñandú zapatilla", ""]) {
    assert.equal(R.pdpHash(t), P.pdpHash(t));
  }
  assert.equal(P.pdpShard("x").length, 3);
  assert.equal(P.autoShard("x").length, 2);
});

/* What the old page did for ?producto=<title>&tienda=<k>: fetch every
   file of STORE_FILES[k], take the first exact title in file order;
   on a miss, the same over CATALOG_FILES. */
const itemsOf = new Map();
for (const f of sourceFiles(P)) {
  const p = ROOT + f.slice(1);
  itemsOf.set(f, existsSync(p) ? P.extractItems(JSON.parse(readFileSync(p, "utf8"))) : []);
}
const firstByFile = new Map();
for (const [f, items] of itemsOf) {
  const m = new Map();
  items.forEach((it) => { const k = P.norm(it.name); if (!m.has(k)) m.set(k, it); });
  firstByFile.set(f, m);
}
function oldHunt(key, files) {
  for (const f of files) { const it = firstByFile.get(f) && firstByFile.get(f).get(key); if (it) return it; }
  return null;
}
const SAME = ["name", "brand", "price", "wasPrice", "salePct", "image", "description", "dept", "retailer", "sizesTier", "sizesSource"];
function same(a, b) {
  for (const k of SAME) if ((a[k] || "") !== (b[k] || "")) return k;
  if (JSON.stringify(Array.from(a.sizes || [])) !== JSON.stringify(Array.from(b.sizes || []))) return "sizes";
  /* The gallery (#434 / #440): the record's photos, the card photo alone when it has no other. */
  const gal = (x) => JSON.stringify(Array.from(x.images && x.images.length ? x.images : x.image ? [x.image] : []));
  if (gal(a) !== gal(b)) return "images";
  return null;
}

await check("every catalogue item opens through the shards, to the record the old scan found", () => {
  const I = liftDeclarations(pageHtml(ROOT), ["SOURCE_RETAILERS"]);
  let n = 0;
  const misses = [];
  for (const [file, keys] of Object.entries(I.SOURCE_RETAILERS)) {
    const p = ROOT + file.slice(1);
    if (!existsSync(p)) continue;
    const data = JSON.parse(readFileSync(p, "utf8"));
    for (const k of keys) {
      const r = data.retailers && data.retailers[k];
      if (!r) continue;
      const list = P.STORE_FILES[k] || [];
      for (const section of ["departments", "brands"]) for (const bucket of Object.values(r[section] || {})) {
        for (const it of (Array.isArray(bucket) ? bucket : bucket && bucket.items) || []) {
          if (!it || !(Number(it.price) > 0)) continue;
          const title = it.title || it.name || it.productTitle || it.productName;
          if (!title) continue;
          n++;
          const key = P.norm(title);
          const want = oldHunt(key, list) || oldHunt(key, P.CATALOG_FILES);
          const cands = lookup(key);
          const rec = P.pickRecord(cands, list) || P.pickRecord(cands, P.CATALOG_FILES);
          if (!rec) { misses.push(`${k}: ${title} -- not in its shard`); continue; }
          const d = want ? same(R.recordToItem(rec), want) : "old scan missed";
          if (d) misses.push(`${k}: ${title} -- ${d} differs`);
        }
      }
    }
  }
  assert.ok(n > 100000, `only ${n} items checked`);
  assert.deepEqual(misses.slice(0, 10), [], `${misses.length} of ${n} taps open a different record (rebuild: node scripts/build-pdp-slices.mjs)`);
  console.log(`         (${n} taps resolved, all to the old record)`);
});

await check("sizes ride the record as the verified list (#411), never invented", () => {
  let sized = 0;
  for (const s of ["000", "3a7", "800", "fff"]) for (const cands of Object.values(shard(s))) for (const r of cands) {
    if (!r.sizes) continue;
    sized++;
    assert.deepEqual(Array.from(P.truthfulSizes(r.sizes)), r.sizes, "a stored list is not the truthful one: " + r.name);
  }
  assert.ok(sized > 0, "no sized record in the sampled shards");
});

await check("every AutoZone part number and title resolves through its small shard, as the full cache scan did", async () => {
  const cache = JSON.parse(readFileSync(ROOT + "auto-cache.json", "utf8"));
  const lift = (sig) => {
    const at = page.indexOf(sig);
    assert.ok(at >= 0, sig + " moved -- update this test");
    let depth = 0, i = page.indexOf("{", at);
    for (; i < page.length; i++) { if (page[i] === "{") depth++; else if (page[i] === "}" && --depth === 0) break; }
    return page.slice(at, i + 1);
  };
  const src = [lift("function norm("), lift("function decodeEntities("), "var NAMED_ENTITIES = " + JSON.stringify(R.NAMED_ENTITIES) + ";",
    lift("function normalizeItem("), lift("function truthfulSizes("), lift("function sortSizes("), lift("function sizeKey("), lift("function alphaRank("),
    "var SIZE_ALPHA_ORDER = " + JSON.stringify(P.SIZE_ALPHA_ORDER) + "; var SIZE_NUMERIC = " + P.SIZE_NUMERIC + "; var SIZE_ALPHA_ALIAS = " + JSON.stringify(P.SIZE_ALPHA_ALIAS) + ";",
    lift("async function huntAuto(")].join("\n");
  const run = (q, data) => {
    const params = new URLSearchParams(q);
    const fetch = async () => ({ ok: true, json: async () => data });
    return new Function("params", "fetch", "want", "tienda", "window", src + "\nreturn huntAuto('x');")(params, fetch, params.get("producto"), params.get("tienda"), {});
  };
  const read = (dir, key) => { const f = PDP + dir + "/" + P.autoShard(key) + ".json"; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {}; };
  const pick = (p) => p && JSON.stringify([p.name, p.brand, p.price, p.image, p.partNumber, p.retailer]);
  const pns = Object.keys(cache.partNumberIndex || {});
  const titles = new Set();
  for (const k in cache.partSearches) for (const s in cache.partSearches[k]) for (const r of cache.partSearches[k][s]) titles.add(r.productTitle || r.title || "");
  let n = 0;
  const bad = [];
  for (const pn of pns) {
    const q = "producto=x&tienda=autozone&pn=" + encodeURIComponent(pn);
    const [a, b] = [await run(q, cache), await run(q, read("auto-pn", pn))];
    n++;
    if (pick(a) !== pick(b)) bad.push("pn " + pn);   /* a stale index entry: null both ways */
  }
  let t = 0;
  for (const title of titles) {
    if (!title || t++ % 4) continue;   /* every fourth title: the full scan is slow */
    const q = "producto=" + encodeURIComponent(title) + "&tienda=autozone";
    const [a, b] = [await run(q, cache), await run(q, read("auto-t", R.norm(title)))];
    n++;
    if (!a || pick(a) !== pick(b)) bad.push("title " + title);
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} of ${n} parts resolve differently`);
  console.log(`         (${n} part lookups match the full cache)`);
});

await check("the related rails from the slices are the rails the full pools gave", () => {
  /* The old pools: the store's catalogue items (?tienda= = the item's
     own store) and the whole Ofertas head. */
  const byRetailer = new Map();
  for (const items of itemsOf.values()) for (const it of items) {
    if (!byRetailer.has(it.retailer)) byRetailer.set(it.retailer, []);
    byRetailer.get(it.retailer).push(it);
  }
  const rows = ofertasRows(P, ROOT);
  const railFile = (rel) => { const f = PDP + rel; return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).items : []; };
  let n = 0, storeSame = 0, crossSame = 0, crossN = 0;
  const diffs = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const [retailer, all] of byRetailer) {
    if (!/^[a-z0-9_-]+$/i.test(retailer)) continue;
    const oldPool = (P.STORE_FILES[retailer] || []).flatMap((f) => itemsOf.get(f) || []).filter((it) => it.retailer === retailer);
    const pool = oldPool.length ? oldPool : all;
    for (let i = 0; i < 12; i++) {
      const anchor = all[Math.floor(rnd() * all.length)];
      n++;
      const slice = railFile(R.railPath(retailer, anchor)).filter((it) => it.retailer === retailer);
      const keys = (l) => l.map((x) => R.relKey(x)).join("\n");
      const pickStore = (sp) => {
        let s = R.relPick(anchor, sp, { sameStore: true, requireLane: true });
        if (s.length < R.REL_MIN) s = R.relPick(anchor, sp, { sameStore: true });
        return s;
      };
      const [a, b] = [pickStore(pool), pickStore(slice)];
      if (keys(a) === keys(b)) storeSame++; else diffs.push(`store rail ${retailer}: ${anchor.name}`);
      const lane = R.relLane(anchor);
      if (!lane) continue;
      crossN++;
      const laneRows = railFile("rails/lane-" + lane.key + ".json");
      const ca = R.relPick(anchor, rows.concat(pool), { requireLane: true, exclude: a, preferOtherStores: true });
      const cb = R.relPick(anchor, laneRows.concat(slice), { requireLane: true, exclude: b, preferOtherStores: true });
      if (keys(ca) === keys(cb)) crossSame++; else diffs.push(`cross rail ${retailer}: ${anchor.name}`);
    }
  }
  console.log(`         (store rail ${storeSame}/${n} identical, cross rail ${crossSame}/${crossN} identical)`);
  if (process.env.SHOW) console.log(diffs.join("\n"));
  assert.ok(n > 500, "too few anchors sampled");
  assert.ok(storeSame / n >= 0.99 && crossSame / Math.max(1, crossN) >= 0.99, "rails drifted from the full-pool rails: " + diffs.slice(0, 6).join("; "));
});

await check("every shard and rail slice stays under 30KB gzipped (400 kbps: under a second)", () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => statSync(dir + f).isDirectory() ? walk(dir + f + "/") : [dir + f]);
  let worst = 0, worstName = "", count = 0;
  for (const f of walk(PDP)) {
    const gz = gzipSync(readFileSync(f)).length;
    count++;
    if (gz > worst) { worst = gz; worstName = f.slice(PDP.length); }
  }
  assert.ok(count > 4096, `only ${count} files under assets/pdp`);
  assert.ok(worst <= MAX_SHARD_GZ, `${worstName} is ${worst} bytes gzipped`);
  console.log(`         (${count} files, largest ${worstName} ${(worst / 1024).toFixed(1)}KB gz)`);
});

await check("the page holds its shape and loads rail photos only when about to be seen", () => {
  assert.match(page, /@supports not \(aspect-ratio:1\/1\)\{\.rel-img\{height:0;padding-top:100%\}\}/);
  assert.match(page, /@supports not \(aspect-ratio:1\/1\)\{\.p-photo\{height:0;padding-top:100%\}\}/);
  assert.match(page, /'<img data-src="' \+ esc\(sizedImageUrl\(it\.image, 360\)\)/, "rail photos load eagerly again");
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\//g, ""), /loading="lazy"/, "native lazy loading fetched every rail photo at once on slow links");
  assert.match(page, /new IntersectionObserver\(/);
  assert.match(page, /relSkeletonHTML\(\)/);
  assert.match(page, /FX_CACHE_KEY = "aria_fx_rate_v1"/, "the shared rate cache is not used");
});

const MIN_CHECKS = 8;
if (passed + failures.length < MIN_CHECKS) { console.log("\n  SUITE INCOMPLETE"); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
