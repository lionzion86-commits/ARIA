/* ==================================================================
   BEST BUY, LAUNCHED (Issue #413).

   The store-launch standard, held in place:

   - the catalogue is the Oct 18 dataset, ingested by flag: no
     third-party marketplace record (sellerType "3P", Danny's ruling),
     every first-party record present, sizes never invented, weights the
     record's own or the site's estimate;
   - Best Buy is a live, browse-only store in every registry mirror, its
     departments map into Electrónica / Hogar, its customer price is the
     standing stack (tiered margin + 7%, the DR-13 exemption never
     itemized);
   - the homepage carries the Best Buy banner and carousel, billed
     before Aria Auto, and the Tiendas strip leads with Best Buy (Walmart
     and Target stay at the back); the carousel is sale items only;
   - tienda.html registers a themed, sliced storefront: Ofertas first,
     Más vendidos second, department rails after, a trust strip -- and
     the slices are current;
   - every Best Buy record opens on producto.html through the shards;
   - search, Ofertas and the checkout price index carry Best Buy;
   - no catalogue on the homepage or storefront path (static checks, and
     a headless load when Chromium is available).

   RUNNING IT
     node scripts/test/bestbuy-tests.mjs
   PLAYWRIGHT_CHROMIUM=<path> (or /opt/pw-browsers/chromium) enables the
   headless request check.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { RETAILERS } from "../lib/retailers.js";
import { BUCKET_SPEC, departmentItems } from "../lib/department-map.js";
import { readSource, ingest, isExcludedRecord, isMarketplaceRecord, HELD_FOR_PRICE_REVIEW, OUT_FILE } from "../build-bestbuy-catalog.mjs";
import { buildStore, SLICES_DIR, FN_DIR, PAGE_SIZE } from "../build-store-slices.mjs";
import { liftPage } from "../build-pdp-slices.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0, skipped = 0;
const failures = [];
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === "skip") { skipped++; console.log("    skip " + name); return; }
    passed++; console.log("    ok   " + name);
  } catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

const read = (f) => readFileSync(ROOT + f, "utf8");
const catalog = JSON.parse(read(OUT_FILE));
const depts = catalog.retailers.bestbuy.departments;
const items = Object.values(depts).flatMap((d) => d.items);
const home = read("index.html");
const bundleName = /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(home)[1];
const bundle = read(bundleName);
const tienda = read("tienda.html");
const saleCtx = {}; saleCtx.globalThis = saleCtx;
vm.runInNewContext(read("sale-rule.js"), saleCtx);
const Sale = saleCtx.AriaSale;

/* OFF SALE (#443, sourcing audit Part A). Best Buy is a REMOVE store:
   its catalogue and registry row stay (the checks on them still run),
   while every selling surface is gone. The launch checks below run while
   Best Buy sells, and are skipped -- and their absence asserted -- while
   it is off sale. */
const BB_OFF = isOffSaleRetailer("bestbuy");
const launchOnly = (name, fn) => check(name, () => (BB_OFF ? "skip" : fn()));

/* The Oct 18 dataset, when this checkout can reach it. */
let source = null;
try { source = readSource(); } catch { source = null; }

/* ---------------- the catalogue ---------------- */
await check("the catalogue holds no third-party marketplace record", () => {
  for (const p of items) {
    assert.ok(!("sellerType" in p) || !isExcludedRecord(p), `3P record in the catalogue: ${p.name}`);
    assert.equal(p.retailer, "bestbuy", `${p.name} is not filed as bestbuy`);
  }
  if (!source) return;
  const thirdParty = new Set(), market = new Set();
  for (const d of Object.values(source.retailers.bestbuy.departments)) for (const p of d.items) {
    if (String(p.sellerType || "").toUpperCase() === "3P") thirdParty.add(p.sku);
    if (isMarketplaceRecord(p)) market.add(String(p.sku));
  }
  assert.equal(thirdParty.size, 178, "the dataset's 3P count moved");
  for (const p of items) assert.ok(!market.has(String(p.sku)), `Marketplace SKU ${p.sku} reached the catalogue: ${p.name}`);
});

/* #432: a Marketplace seller's offer never becomes Best Buy's price. */
await check("sold by Best Buy only: no Marketplace SKU, the audit's rows fixed", () => {
  for (const p of items) if (p.sku != null) assert.match(String(p.sku), /^\d{1,7}$/, `${p.name}: SKU ${p.sku} is a Marketplace listing`);
  const ps5pro = items.filter((p) => /^PlayStation 5 Pro Console$/.test(p.name));
  assert.equal(ps5pro.length, 1);
  assert.equal(ps5pro[0].price, 699.99, "the PS5 Pro is not Best Buy's own price");
  assert.equal(ps5pro[0].sku, "6601524");
  const bad = items.filter((p) => (/DJI - Mini 4 Pro Drone and RC 2/.test(p.name) && p.price >= 4000)
    || /^Bundle - Switch 2/.test(p.name) || (/^XBOX Series X 1TB Console - XBOX Wireless Controller/.test(p.name) && p.price === 879)
    || (/PlayStation 5 Slim/.test(p.name) && (p.price === 710 || p.price === 439.99)));
  assert.deepEqual(bad.map((p) => `${p.name} $${p.price}`), []);
  for (const sku of Object.keys(HELD_FOR_PRICE_REVIEW)) assert.ok(!items.some((p) => String(p.sku) === sku), `held SKU ${sku} is in the catalogue`);
  assert.ok(!items.some((p) => /Echo Dot \(5th Gen/.test(p.name) && p.price === 79.99), "the $79.99 Echo Dot is back");
});

await check("counts: 5,142 pulled, 2,253 Marketplace excluded, 2 replaced, 2 held, 2,889 ingested, per department", () => {
  assert.equal(items.length, 2889);
  assert.equal(catalog.declaredProductCount, 2889);
  const per = Object.fromEntries(Object.entries(depts).map(([k, d]) => [k, d.items.length]));
  assert.deepEqual(per, { tablets: 98, laptops: 455, phones: 494, cameras: 230, gaming: 691, audio: 354, monitors: 106,
    small_appliances: 203, wearables: 155, accessories: 87, electronics: 16 });
  if (!source) return;
  const { stats } = ingest(source);
  assert.equal(stats.source, 5142);
  assert.equal(stats.excluded3P, 178);
  assert.equal(stats.excludedMarketplace, 2073);
  assert.equal(stats.replaced, 2);
  assert.equal(stats.held, 2);
  assert.equal(stats.ingested, 2889);
});

await check("the ingest is the committed catalogue (rebuild after a ruling or a re-pull)", () => {
  if (!source) return "skip";
  const { catalog: fresh } = ingest(source);
  const fItems = Object.values(fresh.retailers.bestbuy.departments).flatMap((d) => d.items);
  assert.equal(fItems.length, items.length);
  for (let i = 0; i < fItems.length; i++) {
    assert.equal(items[i].sku, fItems[i].sku, "record order or membership moved at " + i);
    assert.equal(items[i].price, fItems[i].price, `${items[i].name}: price moved`);
  }
});

await check("weights: the record's own where Best Buy published one, the site's estimate otherwise", () => {
  const bySku = new Map();
  if (source) for (const d of Object.values(source.retailers.bestbuy.departments)) for (const p of d.items) bySku.set(p.sku, p);
  let real = 0;
  for (const p of items) {
    assert.ok(Number(p.weightKg) > 0, `${p.name} has no weight`);
    if (p.weightEstimated === false) {
      real++;
      const s = bySku.get(p.sku);
      if (s) assert.equal(p.weightKg, s.weightKg, `${p.name}: real weight changed`);
    } else {
      assert.equal(p.weightEstimated, true, `${p.name}: weight neither real nor flagged estimated`);
      const s = bySku.get(p.sku);
      if (s) assert.ok(!(s.weightEstimated === false && s.weightKg > 0), `${p.name}: a real weight was replaced by an estimate`);
    }
  }
  assert.equal(real, 2217);
});

await check("no invented sizes, no retailer link on a card", () => {
  for (const p of items) assert.deepEqual(p.availableSizes, [], `${p.name} carries sizes`);
  /* The store's search box asks the storefront endpoint (#409 T2), whose
     rows live in assets/tienda/_fn/bestbuy.json. */
  for (const f of [`${SLICES_DIR}/bestbuy/index.json`, `${FN_DIR}/bestbuy.json`].filter((f) => existsSync(ROOT + f))) assert.doesNotMatch(read(f), /bestbuy\.com/i, `${f} carries a bestbuy.com link`);
});

/* ---------------- registries, taxonomy, price ---------------- */
await check("Best Buy is a live browse-only store in the module and the page mirror", () => {
  const r = RETAILERS.bestbuy;
  assert.ok(r && r.browse === true && !r.retired && r.search === false, "registry row is not live/browse-only");
  assert.equal(r.color, "#0046BE");
  assert.equal(Object.keys(RETAILERS)[0], "bestbuy", "Best Buy is not billed first in the registry");
  /* The real yellow-tag mark (#431 QA), in the module and the page mirror,
     as a plain SVG a phone renders as an <img> (no DTD entities). */
  assert.equal(r.logo, "logos/bestbuy.svg");
  assert.match(bundle, /bestbuy:\s+\{ key: 'bestbuy',\s+label: 'Best Buy',\s+color: '#0046BE', logo: 'logos\/bestbuy\.svg',[^\n]*browse: true \}/);
  const svg = read("logos/bestbuy.svg");
  assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svg, /<!DOCTYPE|&ns_/, "the logo still carries Illustrator DTD entities");
  assert.doesNotMatch(bundle, /key: 'bestbuy'[^\n]*retired: true/);
  assert.match(bundle, /const CATALOGUE_FILES = \[[^\]]*'\/bestbuy-catalog\.json'[,\]]/);
  assert.match(bundle, /"\/bestbuy-catalog\.json":\["bestbuy"\]/);
});

await check("its departments map into the site's taxonomy (Electrónica, Hogar)", () => {
  for (const k of Object.keys(depts)) {
    const want = k === "small_appliances" ? "home" : "electronics";
    assert.equal(BUCKET_SPEC[k] && BUCKET_SPEC[k].category, want, `${k} is not mapped in department-map.js`);
    assert.match(bundle, new RegExp(`\\n  ${k}:\\s+\\{ category: '${want}' \\}`), `${k} is not mapped in the page's BUCKET_SPEC`);
  }
  const elec = departmentItems(catalog.retailers.bestbuy, "electronics", "bestbuy").length;
  const homeN = departmentItems(catalog.retailers.bestbuy, "home_goods", "bestbuy").length;
  assert.ok(elec > 2500, `only ${elec} Best Buy items reach Electrónica`);
  assert.equal(homeN, 203);
});

await launchOnly("customer price: the standing stack (tiered margin + 7%), exemption never itemized", () => {
  assert.match(bundle, /\n  bestbuy: 'unknown',/, "Best Buy's tax status is not 'unknown' (x1.07)");
  const idx = JSON.parse(read("price-index.json"));
  const margin = (r) => Math.min(r, 500) * 0.24 + Math.min(Math.max(r - 500, 0), 1500) * 0.18 + Math.min(Math.max(r - 2000, 0), 3000) * 0.12 + Math.max(r - 5000, 0) * 0.08;
  const feed = JSON.parse(read("ofertas-feed.json")).items.filter((i) => i.retailer === "bestbuy");
  assert.ok(feed.length > 1000, "Best Buy deals missing from the Ofertas feed");
  const byName = new Map();
  for (const p of items) { if (!byName.has(p.name)) byName.set(p.name, []); byName.get(p.name).push(p); }
  const stack = (r) => Math.round((r + margin(r)) * 1.07 * 100) / 100;
  let n = 0;
  for (const d of feed.slice(0, 200)) {
    const srcs = byName.get(d.title);
    if (!srcs) continue;
    assert.ok(srcs.some((src) => Math.abs(d.price - stack(src.price)) < 0.011), `${d.title}: ${d.price} is not the stack of any Best Buy price`);
    n++;
  }
  assert.ok(n > 100);
  assert.ok(Object.keys(idx.prices).length > 0);
  /* Nothing a shopper reads mentions the exemption. */
  const block = home.slice(home.indexOf("<!-- BEST BUY BANNER + CAROUSEL (2026-10-19"), home.indexOf('<section aria-label="Aria Auto"'));
  for (const text of [block, tienda, read("producto.html"), read(`${SLICES_DIR}/bestbuy/index.json`)]) {
    assert.doesNotMatch(text, /DR-13|exenci[oó]n de impuestos|tax[- ]exempt|libre de impuestos/i, "the exemption is itemized to shoppers");
  }
});

/* ---------------- homepage ---------------- */
await launchOnly("homepage: Best Buy banner + carousel, phone and desktop, billed before Aria Auto", () => {
  const feats = [...home.matchAll(/<section aria-label="Best Buy" data-store-rail="bestbuy" data-bestbuy-feature/g)];
  assert.equal(feats.length, 2, "expected one banner per breakpoint");
  for (const id of ["mStoreRail-bestbuy", "dStoreRail-bestbuy"]) assert.match(home, new RegExp(`id="${id}" data-store-rail-row="bestbuy"`));
  const auto = [...home.matchAll(/<section aria-label="Aria Auto"/g)].map((m) => m.index);
  feats.forEach((f, i) => assert.ok(f.index < auto[i], "the Best Buy banner is not above Aria Auto"));
  assert.match(home, /onclick="tiendaJump\('bestbuy'\)" class="bbCta/);
  assert.match(bundle, /const STORE_RAIL_STORES = \['bestbuy',/);
});

await launchOnly("Tiendas strip: Best Buy leads, Walmart and Target stay at the back", () => {
  const strip = /const TIENDAS_STRIP = \[([\s\S]*?)\n\];/.exec(bundle)[1];
  const keys = [...strip.matchAll(/\{k:'([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.equal(keys[0], "bestbuy");
  assert.ok(keys.indexOf("walmart") > keys.length / 2 && keys.indexOf("target") > keys.length / 2, "Walmart/Target moved forward");
});

await launchOnly("the homepage Best Buy carousel is sale items only (one sale rule)", () => {
  const shelf = JSON.parse(read("assets/home/shelves/store-bestbuy.json"));
  assert.ok(shelf.picks.length >= 8, "the shelf is thin");
  for (const p of shelf.picks) {
    assert.equal(p.retailer, "bestbuy");
    assert.ok(Sale.isOnSale(p), `${p.title} is on the sale rail without a sale`);
  }
  const index = JSON.parse(read("assets/home/shelves/index.json"));
  assert.ok(index.stores.includes("bestbuy"));
});

/* ---------------- storefront ---------------- */
const STORES = JSON.parse(/var STORES = (\{.*\});/.exec(tienda)[1]);
const sliceDir = `${SLICES_DIR}/bestbuy/`;
const sIndex = existsSync(ROOT + sliceDir + "index.json") ? JSON.parse(read(sliceDir + "index.json")) : null;

await check("tienda.html registers a themed, sliced Best Buy storefront", () => {
  const s = STORES.bestbuy;
  assert.ok(s, "no STORES.bestbuy");
  assert.equal(s.color, "#0046BE");
  assert.equal(s.tag, "#FFE000");
  assert.equal(s.slices, "/" + sliceDir);
  /* `files` names the catalogue for the build scripts (Ofertas feed);
     every storefront boots from its slices (#409 T2: the page has no
     catalogue loader at all any more). */
  assert.equal(JSON.stringify(s.files), JSON.stringify(["/bestbuy-catalog.json"]));
  const boot = tienda.slice(tienda.indexOf("function boot(isRetry)"), tienda.indexOf("function bindUI()"));
  assert.ok(boot.indexOf("bootSliced();") !== -1 && !/function loadStore\(/.test(tienda),
    "the storefront could reach a catalogue download");
  assert.equal(s.trust, "bestbuy");
  assert.match(s.heroPhoto, /^\/assets\/stores\/bestbuy-interior\.jpg$/);
  /* The "Por qué compramos en Best Buy" trust strip was promotional
     markup; it went with the rest of Best Buy's merchandising (#443). */
  assert.doesNotMatch(tienda, /Por qué compramos en Best Buy/);
  assert.match(bundle, /const THIN_STOREFRONTS = new Set\(\['bestbuy'(, '[a-z]+')*\]\);/);
});

/* Danny's storefront order (#443, 2026-11-01, locked): Ofertas, then the
   departments -- Más vendidos no longer sits between them. */
await launchOnly("storefront rails: Ofertas first (sale only), departments after", () => {
  const keys = sIndex.rails.map((r) => r.key);
  assert.equal(keys[0], "ofertas");
  assert.equal(sIndex.rails[0].title, "Ofertas de Best Buy");
  assert.ok(!keys.includes("masvendidos"), "Más vendidos is back between Ofertas and the departments");
  assert.ok(keys.slice(1).every((k) => k.startsWith("d-")), "a non-department rail after Ofertas");
  assert.ok(keys.length >= 10, "too few department rails");
  const r = sIndex.rails[0];
  for (let n = 1; n <= r.pages; n++) {
    const page = JSON.parse(read(`${sliceDir}rails/ofertas-${n}.json`));
    assert.ok(page.items.length <= PAGE_SIZE);
    for (const c of page.items) assert.ok(Sale.isOnSale({ price: c.price, originalPrice: c.was }), `${c.name} in Ofertas without a sale`);
  }
  for (const c of r.head.slice(0, 4)) assert.ok(c.price < 1000, `premium ${c.name} leads Ofertas`);
});

await launchOnly("storefront slices are current and phone-sized", () => {
  const { files } = buildStore("bestbuy");
  const committed = readdirSync(ROOT + sliceDir + "rails").map((f) => "rails/" + f).concat(["index.json"]);
  assert.deepEqual(committed.sort(), Object.keys(files).sort(), "slice files differ from a fresh build");
  for (const [name, body] of Object.entries(files)) {
    const text = read(sliceDir + name);
    assert.equal(text, JSON.stringify(body), `${name} is stale -- node scripts/build-store-slices.mjs`);
    assert.ok(gzipSync(text).length < 30 * 1024, `${name} is over 30KB gzipped`);
  }
});

/* ---------------- product page ---------------- */
await check("every Best Buy record opens on producto.html through the shards", () => {
  const P = liftPage(ROOT);
  const files = P.STORE_FILES.bestbuy.concat(P.CATALOG_FILES);
  assert.equal(JSON.stringify(P.STORE_FILES.bestbuy), JSON.stringify(["/bestbuy-catalog.json"]));
  const cache = new Map();
  const shard = (s) => { if (!cache.has(s)) cache.set(s, JSON.parse(read("assets/pdp/p/" + s + ".json"))); return cache.get(s); };
  let n = 0;
  for (const p of items) {
    const key = P.norm(p.name);
    const rec = P.pickRecord(shard(P.pdpShard(key))[key] || null, files);
    assert.ok(rec, `${p.name} does not resolve`);
    assert.equal(rec.retailer, "bestbuy", `${p.name} resolves to ${rec.retailer}`);
    n++;
  }
  assert.equal(n, 2889);
});

/* ---------------- search, Ofertas, comparison ---------------- */
await launchOnly("search covers Best Buy with the same row fields every store carries", () => {
  const idx = JSON.parse(read("assets/search/catalog-index.json"));
  const ri = idx.fields.indexOf("retailer");
  const rows = idx.rows.filter((r) => r[ri] === "bestbuy");
  assert.ok(rows.length >= 2850, `only ${rows.length} Best Buy rows in the search index`);
  for (const r of rows.slice(0, 500)) assert.equal(r.length, idx.fields.length);
  const di = idx.fields.indexOf("department");
  assert.ok(rows.some((r) => r[di] === "laptops") && rows.some((r) => r[di] === "gaming"));
  assert.match(read("scripts/build-search-index.mjs"), /"bestbuy-catalog\.json"/);
});

await launchOnly("Ofertas carries Best Buy deals (feed and slices)", () => {
  const d = JSON.parse(read("assets/ofertas/deals.json"));
  const s = d.stores.find((x) => x.key === "bestbuy");
  assert.ok(s && s.n > 500, "Best Buy missing from the Ofertas slices");
  assert.ok(existsSync(ROOT + "assets/ofertas/slices/bestbuy.discount.json"));
});

await launchOnly("the assistant knows Best Buy is stocked", async () => {
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");
  assert.ok(K.STORE_KNOWLEDGE.bestbuy && !K.NOT_STOCKED.bestbuy);
  assert.equal(K.STORE_KNOWLEDGE.bestbuy.product_count, 2889);
});

await launchOnly("no emoji in the Best Buy surfaces", () => {
  const rx = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
  const block = home.slice(home.indexOf("<!-- BEST BUY BANNER + CAROUSEL (2026-10-19"), home.indexOf('<section aria-label="Aria Auto"'));
  assert.doesNotMatch(block, rx);
  const sl = tienda.slice(tienda.indexOf("SLICED STOREFRONT (2026-10-19"), tienda.indexOf("/* ---------- boot ---------- */"));
  assert.doesNotMatch(sl, rx);
  assert.doesNotMatch(read(sliceDir + "index.json"), rx);
});

/* ---------------- off sale (#443) ---------------- */
await check("off sale: no Best Buy banner, tile, shelf, storefront, search row, deal, price or assistant entry; the data stays", async () => {
  if (!BB_OFF) return "skip";
  assert.ok(items.length === 2889, "the Best Buy catalogue was not retained");
  assert.ok(!home.includes('data-store-rail="bestbuy"'), "the homepage still carries the Best Buy banner");
  assert.ok(!/BEST BUY BANNER|\.bb(Band|TagRule|Logo|Kicker|Cta|Points)\b/.test(home), "the Best Buy banner's markup comments or CSS survived");
  assert.ok(!existsSync(ROOT + "assets/home/shelves/store-bestbuy.json"), "a Best Buy home shelf");
  assert.ok(!existsSync(ROOT + sliceDir + "index.json") && !existsSync(ROOT + `${FN_DIR}/bestbuy.json`), "Best Buy storefront slices");
  const idx = JSON.parse(read("assets/search/catalog-index.json"));
  const ri = idx.fields.indexOf("retailer");
  assert.equal(idx.rows.filter((r) => r[ri] === "bestbuy").length, 0, "Best Buy rows in search");
  assert.ok(!JSON.parse(read("assets/ofertas/deals.json")).stores.some((x) => x.key === "bestbuy"), "Best Buy in Ofertas");
  assert.ok(!existsSync(ROOT + "assets/ofertas/slices/bestbuy.discount.json"), "a Best Buy Ofertas slice");
  assert.equal(JSON.parse(read("ofertas-feed.json")).items.filter((i) => i.retailer === "bestbuy").length, 0, "Best Buy deals in the feed");
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");
  assert.ok(!K.STORE_KNOWLEDGE.bestbuy, "the assistant still describes Best Buy");
  assert.equal(K.getStoreInfo("best buy").off_sale, true);
});

/* ---------------- no catalogue on the critical path ---------------- */
await launchOnly("the storefront and homepage fetch no catalogue (headless)", async () => {
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { return "skip"; } }
  const http = await import("node:http");
  const { join, extname } = await import("node:path");
  const { statSync } = await import("node:fs");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css" };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75}'); return; }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    for (const path of ["/tienda.html?tienda=bestbuy", "/"]) {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await page.route(/\.(png|jpe?g|webp|gif|svg)(\?|$)/i, (r) => r.fulfill({ status: 204, body: "" }));
      const reqs = [];
      page.on("request", (r) => reqs.push(r.url()));
      await page.goto(base + path, { waitUntil: "load" });
      if (path === "/") {
        await page.evaluate(() => document.querySelector("[data-bestbuy-feature]").scrollIntoView());
        await page.waitForFunction(() => document.querySelectorAll('#mStoreRail-bestbuy [data-store-rail-card="bestbuy"]').length >= 8, null, { timeout: 30000 });
      } else {
        await page.waitForFunction(() => document.querySelectorAll(".rail-sec .card:not(.sk)").length >= 16, null, { timeout: 30000 });
        const order = await page.evaluate(() => [...document.querySelectorAll(".rail-title")].slice(0, 2).map((e) => e.textContent));
        assert.deepEqual(order, ["Ofertas de Best Buy", "Computación"]);
        const minH = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".rail .card")].slice(0, 6).map((c) => c.getBoundingClientRect().height)));
        assert.ok(minH > 200, `a storefront card collapsed to ${minH}px`);
      }
      await page.waitForTimeout(1500);
      const bad = reqs.filter((u) => /-catalog\.json|department-cache|catalog-index\.json|ofertas-feed\.json/.test(u));
      assert.deepEqual(bad, [], `${path} fetched ${bad.join(", ")}`);
      await page.context().close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
});

console.log(`\n${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} skipped` : ""}`);
if (failures.length) {
  for (const f of failures) console.log("  FAIL " + f);
  process.exit(1);
}
