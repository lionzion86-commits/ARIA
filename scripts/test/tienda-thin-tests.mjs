/* ==================================================================
   EVERY STOREFRONT, THIN (#409 track T2).

   tienda.html used to draw a store by downloading its whole catalogue
   (SSENSE 39.8MB, Target 18MB in three files). Now every store answers
   from assets/tienda/<key>/index.json (the first screen) and
   /.netlify/functions/tienda (Ver todo, chips, search, sort; 48 cards a
   time). Held in place here:

   - the slices are current with the committed catalogues, for every
     store in the registry, and the build runs the page's own rules;
   - no storefront requests a catalogue (static checks + headless);
   - the first rail is "Ofertas de <store>" whenever the store has a
     sale, and it holds sale items only (sale-rule.js);
   - caps: 16 cards per rail on the first screen, 48 per page after;
   - cards hold their shape, soles lead, cards open producto.html only;
   - chips use shopper words, never Aria's taxonomy (F-NB-CHIP);
   - no sizes and no retailer links in the slices; no emoji.

   RUNNING IT
     node scripts/test/tienda-thin-tests.mjs
   PLAYWRIGHT_CHROMIUM=<path> (or /opt/pw-browsers/chromium) enables the
   headless checks.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import vm from "node:vm";
import { buildAll, tiendaStores, SLICES_DIR, FN_DIR, RAIL_HEAD, PAGE_SIZE, SLICED_STORES } from "../build-store-slices.mjs";
import { answer, loadStore } from "../../netlify/functions/_tienda-core.js";

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
const page = read("tienda.html");
const STORES = tiendaStores(ROOT);
const keys = Object.keys(STORES);
/* LIVE LANES (#443). The registry's stores minus the ones taken off sale
   (/off-sale.js). This battery first ran on SSENSE, Target, Gymshark,
   New Balance and Best Buy; the same shapes now come from stores that
   still sell: CCS (the big catalogue, no demand), Walmart (departments,
   demand), YoungLA (gender facets), ProSoccer (category facets). Best
   Buy's themed slices are checked while a themed store is live. */
/* A store whose catalogue is still pending (DSW, #443) is not live. */
const LIVE_SLICED = Object.keys(SLICED_STORES).filter((k) => STORES[k] && !STORES[k].pendingCatalog);
/* The 2026-10-27 pulls (SNIPES, Carolina Herrera) carry no was-price and
   no demand signal: no Ofertas or Más vendidos rail to page. Their rail
   order is pinned in store-pulls-tests.mjs. */
const PULL_ONLY = new Set(["snipes", "carolinaherrera"]);
const LIVE_DEALS = LIVE_SLICED.filter((k) => !PULL_ONLY.has(k));
const saleCtx = {}; saleCtx.globalThis = saleCtx;
vm.runInNewContext(read("sale-rule.js"), saleCtx);
const Sale = saleCtx.AriaSale;
const idx = (k) => JSON.parse(read(`${SLICES_DIR}/${k}/index.json`));
const roots = [ROOT];

/* ---------------- the slices ---------------- */
const built = buildAll(ROOT);

await check("every store in the registry has its first screen and its endpoint file", () => {
  assert.ok(keys.length >= 80, `only ${keys.length} stores in the registry`);
  for (const k of keys) {
    assert.ok(existsSync(ROOT + `${SLICES_DIR}/${k}/index.json`), `${k}: no index.json`);
    assert.ok(existsSync(ROOT + `${FN_DIR}/${k}.json`), `${k}: no endpoint file`);
  }
  const dirs = readdirSync(ROOT + SLICES_DIR).filter((d) => !["_fn", "hero"].includes(d));
  assert.deepEqual(dirs.filter((d) => !STORES[d]), [], "a store folder with no store");
  const fns = readdirSync(ROOT + FN_DIR).map((f) => f.replace(/\.json$/, ""));
  assert.deepEqual(fns.filter((d) => !STORES[d]), [], "an endpoint file with no store");
});

await check("the slices are current with the catalogues (node scripts/build-store-slices.mjs)", () => {
  const stale = [];
  for (const [k, b] of Object.entries(built)) {
    for (const [name, body] of Object.entries(b.files)) {
      if (read(`${SLICES_DIR}/${k}/${name}`) !== JSON.stringify(body)) stale.push(`${k}/${name}`);
    }
    if (read(`${FN_DIR}/${k}.json`) !== JSON.stringify(b.fn)) stale.push(`_fn/${k}.json`);
  }
  assert.deepEqual(stale.slice(0, 10), [], `${stale.length} stale files -- run: node scripts/build-store-slices.mjs`);
});

await check("the build runs the page's own rules: same items, dedupe and chips the old loadStore made", () => {
  /* YoungLA's single gym_rat bucket becomes gender pills; ProSoccer's
     feed types become category pills. */
  const g = idx("youngla");
  assert.equal(g.chips.mode, "facet");
  assert.deepEqual(g.chips.genders.map((x) => x.key), ["Mujer", "Hombre"]);
  const ps = idx("prosoccer");
  assert.equal(ps.chips.mode, "facet");
  assert.ok(ps.chips.cats.some((c) => c.key === "Chimpunes"));
  /* Walmart's departments in shopper words, sorted as the page sorted them. */
  const t = idx("walmart");
  assert.equal(t.chips.mode, "dept");
  const labels = t.chips.depts.map((d) => d.label);
  assert.deepEqual(labels, labels.slice().sort((a, b) => a.localeCompare(b, "es")));
  /* Counts: every catalogue item with a name, a price and a real photo, once. */
  const cat = JSON.parse(read("ccs-catalog.json")).retailers.ccs;
  const seen = new Set();
  for (const d of Object.values(cat.departments)) for (const p of (d.items || d)) {
    const img = [p.image, p.imageUrl, p.img, p.thumbnail, ...(p.images || [])].find((u) => typeof u === "string" && u.indexOf("http") === 0 && u.length > 20 && !/foto-en-camino|placeholder|no-image/.test(u));
    if ((p.name || p.title || p.productName) && Number(p.price) > 0 && img) seen.add((p.name || p.title || p.productName) + "||" + img);
  }
  assert.equal(idx("ccs").count, seen.size, "CCS's count differs from its catalogue");
});

await check("Ofertas de <store> leads whenever the store has a sale, and holds sale items only", () => {
  for (const k of keys) {
    const ix = idx(k), fn = loadStore(k, roots);
    if (!ix.count) continue;
    const onSale = fn.rows.filter((r) => r[4] > 0).length;
    assert.equal(ix.onSale, onSale, `${k}: onSale count`);
    if (onSale) {
      assert.equal(ix.rails[0].key, "ofertas", `${k}: the first rail is ${ix.rails[0].key}`);
      assert.equal(ix.rails[0].title, "Ofertas de " + (SLICED_STORES[k] ? SLICED_STORES[k].label : STORES[k].label));
      for (const c of ix.rails[0].head) assert.ok(Sale.isOnSale({ price: c.price, originalPrice: c.was }), `${k}: "${c.name}" in Ofertas without a sale`);
      for (const i of fn.rails.ofertas) assert.ok(fn.rows[i][4] > 0 && Sale.isOnSale({ price: fn.rows[i][2], originalPrice: fn.rows[i][3] }), `${k}: "${fn.rows[i][0]}" in Ofertas without a sale`);
      assert.equal(fn.rails.ofertas.length, onSale, `${k}: a sale missing from Ofertas`);
    } else {
      assert.notEqual(ix.rails[0].key, "ofertas", `${k}: an Ofertas rail with no sale`);
    }
    /* A card's was-price only where the rule says sale. */
    for (const r of fn.rows) if (r[3]) assert.ok(r[4] > 0, `${k}: "${r[0]}" carries a was-price but no sale`);
  }
  /* A store whose items carry no real was-price leads with Destacados (one rule). */
  assert.equal(idx("valsurf").rails[0].key, "destacados");
});

await check("Más vendidos follows Ofertas where the store publishes demand; type rails after", () => {
  /* Sephora was the beauty sample here; it has no storefront since #443
     (DO NOT BUILD), so Hollister (Destacados, then Más vendidos) stands in. */
  for (const k of ["walmart", "hollister", "abercrombie", "finishline", "crocs", ...LIVE_DEALS]) {
    const ks = idx(k).rails.map((r) => r.key);
    assert.equal(ks[1], "masvendidos", `${k}: ${ks.join(",")}`);
  }
  for (const k of keys.filter((x) => !SLICED_STORES[x])) {
    const ks = idx(k).rails.map((r) => r.key);
    assert.ok(ks.slice(ks[1] === "masvendidos" ? 2 : 1).every((x) => x.startsWith("t-")), `${k}: ${ks.join(",")}`);
  }
  assert.equal(idx("ccs").rails[1].key, "t-trajes_bano", "CCS publishes no demand: no Más vendidos");
});

await check("caps: 16 cards per rail on the first screen, 48 per page, first screen under 30KB gzipped", () => {
  for (const k of keys) {
    const text = read(`${SLICES_DIR}/${k}/index.json`), ix = JSON.parse(text);
    assert.ok(gzipSync(text).length < 30 * 1024, `${k}: index.json is ${(gzipSync(text).length / 1024).toFixed(1)}KB gzipped`);
    for (const r of ix.rails) {
      assert.ok(r.head.length <= RAIL_HEAD, `${k}/${r.key}: ${r.head.length} cards`);
      assert.equal(r.pages, Math.ceil(r.total / PAGE_SIZE));
    }
  }
  const big = answer({ store: "ccs", c: "", d: "", q: "" }, roots);
  assert.equal(big.body.items.length, PAGE_SIZE);
  assert.equal(big.body.total, idx("ccs").count);
});

await check("cards: no sizes, no retailer link, nothing but what a tile draws", () => {
  for (const k of keys) {
    for (const r of idx(k).rails) for (const c of r.head) {
      assert.deepEqual(Object.keys(c).filter((x) => !["name", "brand", "price", "was", "image"].includes(x)), [], `${k}: card fields`);
    }
  }
  for (const k of ["ccs", "walmart", "zumiez"]) {
    const t = read(`${FN_DIR}/${k}.json`);
    assert.ok(!/"(url|link|sizes)"/.test(t), `${k}: endpoint file carries url/link/sizes`);
  }
});

await check("chips use shopper words, never Aria's taxonomy (F-NB-CHIP)", () => {
  for (const k of keys) {
    const ix = idx(k);
    const words = ix.depts ? ix.depts.map((d) => d.label) : ix.chips.mode === "facet"
      ? ix.chips.genders.concat(ix.chips.cats).map((c) => c.label) : ix.chips.depts.map((d) => d.label);
    for (const w of words) {
      assert.ok(!/gym rat/i.test(w), `${k} shows "${w}"`);
      assert.ok(!/_/.test(w) && !/^[a-z]/.test(w), `${k} shows the raw key "${w}"`);
    }
  }
});

/* ---------------- the endpoint ---------------- */
await check("the endpoint pages a rail in the build's order, 48 at a time", () => {
  const fn = loadStore("ccs", roots);
  const p2 = answer({ store: "ccs", rail: "t-zapatos", page: "2" }, roots).body;
  assert.equal(p2.page, 2);
  assert.equal(p2.total, fn.rails["t-zapatos"].length);
  assert.deepEqual(p2.items.map((c) => c.name), fn.rails["t-zapatos"].slice(48, 96).map((i) => fn.rows[i][0]));
  const head = idx("ccs").rails.find((r) => r.key === "t-zapatos").head.map((c) => c.name);
  assert.deepEqual(answer({ store: "ccs", rail: "t-zapatos", page: "1" }, roots).body.items.slice(0, head.length).map((c) => c.name), head);
  /* A themed store's static pages and the endpoint agree. */
  for (const k of LIVE_DEALS) {
    const bb = JSON.parse(read(`${SLICES_DIR}/${k}/rails/ofertas-2.json`));
    assert.deepEqual(answer({ store: k, rail: "ofertas", page: "2" }, roots).body.items, bb.items);
  }
  /* An off-sale store has no endpoint. */
  /* (SSENSE is back as an untested lane, #443 2026-10-24; Kohl's is still off sale.) */
  assert.equal(answer({ store: "kohls", rail: "ofertas" }, roots).status, 404);
  assert.equal(answer({ store: "nope", rail: "x" }, roots).status, 404);
  assert.equal(answer({ store: "../etc" }, roots).status, 404);
  assert.equal(answer({ store: "ccs", rail: "x" }, roots).status, 404);
});

await check("the endpoint filters by chip (facets combine), searches and sorts like the old page", () => {
  /* No live store carries both facets today (Gymshark did): each is
     checked on its own store. */
  const both = answer({ store: "youngla", g: "Mujer", sort: "discount" }, roots).body;
  const fn = loadStore("youngla", roots);
  assert.equal(both.total, fn.rows.filter((r) => r[7] === "Mujer").length);
  assert.ok(both.total > 10);
  const chimp = answer({ store: "prosoccer", c: "Chimpunes" }, roots).body;
  assert.equal(chimp.total, loadStore("prosoccer", roots).rows.filter((r) => r[8] === "Chimpunes").length);
  assert.ok(chimp.total > 10);
  /* Mayor descuento: sales first, deepest first. */
  const pct = (c) => Sale.discountPct({ price: c.price, originalPrice: c.was });
  for (let i = 1; i < both.items.length; i++) assert.ok(pct(both.items[i - 1]) >= pct(both.items[i]), "discount order");
  const asc = answer({ store: "walmart", d: "toys", sort: "priceAsc" }, roots).body;
  for (let i = 1; i < asc.items.length; i++) assert.ok(asc.items[i - 1].price <= asc.items[i].price, "priceAsc order");
  const desc = answer({ store: "walmart", sort: "priceDesc" }, roots).body;
  for (let i = 1; i < desc.items.length; i++) assert.ok(desc.items[i - 1].price >= desc.items[i].price, "priceDesc order");
  /* Every word, title or brand, accents folded. */
  const s = answer({ store: "ccs", q: "black hoodie", sort: "relevance" }, roots).body;
  assert.ok(s.total > 20);
  for (const c of s.items) assert.ok(/black/i.test(c.name + " " + (c.brand || "")) && /hoodie/i.test(c.name + " " + (c.brand || "")), c.name);
  /* The product the words name leads (Walmart's AirPods, not cases for them). */
  const a = answer({ store: "walmart", q: "airpods", sort: "relevance" }, roots).body;
  assert.match(a.items[0].name, /^Apple AirPods/);
  assert.equal(answer({ store: "ccs", q: "zzqxv" }, roots).body.total, 0);
  const last = answer({ store: "walmart", page: "99999" }, roots).body;
  assert.equal(last.page, last.pages, "a page past the end is clamped");
});

await check("netlify.toml ships the endpoint its data and nothing else", () => {
  const toml = read("netlify.toml");
  assert.match(toml, /\[functions\."tienda"\]\s*\n\s*included_files = \["assets\/tienda\/_fn\/\*\.json"\]/);
  let bytes = 0;
  for (const f of readdirSync(ROOT + FN_DIR)) bytes += statSync(ROOT + FN_DIR + "/" + f).size;
  assert.ok(bytes < 60 * 1048576, `endpoint data is ${(bytes / 1048576).toFixed(1)}MB`);
});

/* ---------------- the page ---------------- */
await check("the page never fetches a catalogue: one boot path, from the slices", () => {
  assert.ok(!/function loadStore\(/.test(page), "the catalogue loader is back");
  assert.ok(!/storeMeta\.files/.test(page.replace(/`files` names[^\n]*/g, "")), "the page reads storeMeta.files");
  assert.ok(!/fetchJson\([^)]*(?:-catalog|department-cache|find\.json)/.test(page), "a catalogue URL in a fetch");
  const boot = page.slice(page.indexOf("function boot(isRetry)"), page.indexOf("function bindUI()"));
  assert.match(boot, /bootSliced\(\);/);
  assert.ok(!/<script src="product-type\.js">/.test(page), "the page still downloads the classifier it no longer runs");
  assert.match(page, /var TIENDA_FN = BASE \+ '\/\.netlify\/functions\/tienda';/);
});

await check("cards hold their shape and lead with soles; cards open producto.html, never the retailer", () => {
  assert.match(page, /\.sl \.card-img\{aspect-ratio:1\/1;/);
  assert.match(page, /@supports not \(aspect-ratio:1\/1\)\{ \.sl \.card-img\{height:0;padding-top:100%\} \}/);
  assert.match(page, /\.sl \.card-title\{min-height:36px\}/);
  assert.match(page, /\.sl \.card-prices\{min-height:44px;/);
  const inner = page.slice(page.indexOf("function slPriceInner("), page.indexOf("var fxFailed"));
  assert.ok(inner.indexOf('class="pen"') < inner.indexOf('class="usd"'), "soles do not lead");
  assert.match(page, /var href = 'producto\.html\?producto=' \+ encodeURIComponent\(p\.name \|\| ''\) \+ '&tienda=' \+ encodeURIComponent\(storeKey\);/);
  assert.ok(!/target="_blank"|\.url\b.*href|href="' \+ esc\(p\.url/.test(page), "a card links out");
  assert.match(page, /aria_fx_rate_v1/, "no cached rate");
  /* The card's inline onerror runs in the global scope. */
  assert.match(page, /window\.imgOrigRetry = imgOrigRetry;/, "a failed photo would throw (imgOrigRetry is not global)");
});

await check("no emoji in the page or the slices", () => {
  const rx = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
  assert.doesNotMatch(page, rx);
  for (const k of keys) assert.doesNotMatch(read(`${SLICES_DIR}/${k}/index.json`), rx, k);
});

await check("store backdrops: a phone-sized copy for every store photo (python3 scripts/build-tienda-heroes.py)", () => {
  for (const k of keys) {
    if (STORES[k].heroPhoto || !existsSync(ROOT + `assets/stores/${k}.jpg`)) continue;
    const p = ROOT + `assets/tienda/hero/${k}.jpg`;
    assert.ok(existsSync(p), `${k}: no phone-sized backdrop`);
    assert.ok(statSync(p).size < 90 * 1024, `${k}: backdrop is ${(statSync(p).size / 1024).toFixed(0)}KB`);
  }
  assert.match(page, /'\/assets\/tienda\/hero\/' \+ storeKey \+ '\.jpg'/);
});

/* ---------------- headless ---------------- */
await check("headless: storefronts paint from slices, fetch no catalogue, cards shaped, soles first, chips and search answer", async () => {
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { return "skip"; } }
  const http = await import("node:http");
  const { join, extname } = await import("node:path");
  const { handler } = await import(ROOT + "netlify/functions/tienda.js");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css" };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75}'); return; }
    if (u.pathname === "/.netlify/functions/tienda") {
      const r = await handler({ httpMethod: "GET", queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(r.statusCode, { "Content-Type": "application/json" }); res.end(r.body); return;
    }
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
    for (const store of ["ccs", "walmart", "zumiez", "youngla", "prosoccer", "hollister", ...LIVE_SLICED]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const pg = await ctx.newPage();
      await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      await pg.route(/\.(png|jpe?g|webp|gif|svg)(\?|$)/i, (r) => r.fulfill({ status: 204, body: "" }));
      const reqs = [];
      pg.on("request", (r) => reqs.push(r.url()));
      const errs = [];
      pg.on("pageerror", (e) => errs.push(String(e)));
      await pg.goto(`${base}/tienda.html?tienda=${store}`, { waitUntil: "load" });
      await pg.waitForFunction(() => document.querySelectorAll(".rail-sec .card:not(.sk)").length >= 8, null, { timeout: 30000 });
      const r = await pg.evaluate(() => ({
        first: document.querySelector(".rail-title").textContent,
        firstRailSale: [...document.querySelector(".rail").querySelectorAll(".card")].every((c) => !!c.querySelector(".badge")),
        minH: Math.min(...[...document.querySelectorAll(".rail .card")].slice(0, 6).map((c) => c.getBoundingClientRect().height)),
        pen: document.querySelector(".card .pen").textContent,
        hrefs: [...document.querySelectorAll("a.card")].map((a) => a.getAttribute("href")),
        cards: document.querySelectorAll(".card").length,
      }));
      const ix = idx(store);
      assert.equal(r.first, ix.rails[0].title, store);
      if (ix.rails[0].key === "ofertas") assert.ok(r.firstRailSale, `${store}: a card without a sale badge in Ofertas`);
      assert.ok(r.minH > 200, `${store}: a card collapsed to ${r.minH}px`);
      assert.match(r.pen, /^S\/ \d/, `${store}: the price does not lead in soles ("${r.pen}")`);
      assert.ok(r.hrefs.every((h) => h.indexOf("producto.html?producto=") === 0), `${store}: a card links elsewhere`);
      assert.ok(r.cards <= ix.rails.length * RAIL_HEAD, `${store}: ${r.cards} cards drawn`);
      /* A chip (Best Buy: its department in the overlay), then the search box. */
      await pg.click(".chips .chip:nth-child(2)");
      /* A store sliced by department (Best Buy, SNIPES, Carolina Herrera)
         opens the chip's department rail in the Ver todo overlay. */
      if (ix.depts) {
        await pg.waitForFunction(() => document.querySelectorAll("#reGrid .card:not(.sk)").length > 0, null, { timeout: 30000 });
        /* The overlay is a fixed-height scroller: its cards must keep their
           height (they were 16px lines) and only on-screen photos load. */
        const ov = await pg.evaluate(() => ({
          minH: Math.min(...[...document.querySelectorAll("#reGrid .card")].map((c) => c.getBoundingClientRect().height)),
          photos: [...document.querySelectorAll("#reGrid img")].filter((i) => !i.dataset.src).length,
        }));
        assert.ok(ov.minH > 200, `${store}: Ver todo cards collapsed to ${ov.minH}px`);
        assert.ok(ov.photos <= 8, `${store}: Ver todo fetched ${ov.photos} photos at once`);
        await pg.click("#reBack");
        assert.equal(await pg.evaluate(() => document.getElementById("railExpand").hidden), true, "the back arrow does not close Ver todo");
      } else {
        await pg.waitForFunction(() => document.querySelectorAll("#slGrid .card").length > 0, null, { timeout: 30000 });
        const n = await pg.evaluate(() => document.querySelectorAll("#slGrid .card").length);
        assert.ok(n > 0 && n <= 48, `${store}: chip drew ${n}`);
        await pg.click(".chips .chip:first-child");
        await pg.waitForFunction(() => document.querySelectorAll(".rail-sec").length > 0, null, { timeout: 10000 });
      }
      await pg.fill("#q", store === "bestbuy" ? "airpods" : "black");
      await pg.waitForFunction(() => document.querySelectorAll("#slGrid .card").length > 0 || document.querySelector(".state"), null, { timeout: 30000 });
      await pg.waitForTimeout(500);
      const bad = reqs.filter((u) => /-catalog\.json|department-cache|catalog-index\.json|ofertas-feed|find\.json|\/_fn\//.test(u));
      assert.deepEqual(bad, [], `${store} fetched ${bad.join(", ")}`);
      assert.deepEqual(errs, [], `${store}: ${errs.join("; ")}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
});

const MIN_CHECKS = 15;
if (passed + skipped + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + skipped + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} skipped` : ""}\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
