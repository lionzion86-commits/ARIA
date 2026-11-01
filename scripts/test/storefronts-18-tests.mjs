/* ==================================================================
   EVERY STORE WITH PRODUCTS HAS ITS STOREFRONT (#443, Danny's rulings
   2026-11-01). Aria Perfumes is the flagship; Sam's Club is held.

     1. each new store has assets/tienda/<key>/index.json with products,
        its endpoint file, a registry row, and is on sale;
     2. Ofertas leads whenever the store has a real markdown (sale-rule.js)
        and is absent when it has none; then only category rails;
     3. a category rail holds only its category, by what the product IS
        (the shared classifier, then the aisle's head noun);
     4. no Sam's Club storefront (held: Danny's own removal order);
     5. each storefront wears its own theme (colours, logo or wordmark);
     6. searching the store's name opens its storefront;
     7. zero emojis;
     8. Aria Perfumes and Sephora render at 390px.

     node scripts/test/storefronts-18-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import vm from "node:vm";
import { buildAll, tiendaStores, loadStoreRules, SLICED_STORES } from "../build-store-slices.mjs";
import { STOREFRONTS, HELD_STOREFRONTS, familyOf, aisleOf, beautyAisle, garmentAisle, NO_FAMILY,
  PERFUME_DOOR_RAILS, PERFUME_CLASS_RAILS, PERFUME_CONCENTRATIONS } from "../lib/storefronts.js";
import { loadStore } from "../../netlify/functions/_tienda-core.js";
import { isOffSaleRetailer } from "../lib/off-sale.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));
let passed = 0, skipped = 0;
const failures = [];
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === "skip") { skipped++; console.log("    skip " + name); return; }
    passed++; console.log("    ok   " + name);
  } catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

/* Danny's list (2026-11-01), minus Sam's Club. Best Buy keeps its own #413 builder;
   it is off sale again (Danny, 2026-10-21; #443 c.6564970704), so it drops out here. */
const NEW = [...Object.keys(STOREFRONTS), "bestbuy"].filter((k) => !isOffSaleRetailer(k));
const STORES = tiendaStores(ROOT);
const idx = (k) => json(`assets/tienda/${k}/index.json`);
const saleCtx = {}; saleCtx.globalThis = saleCtx;
vm.runInNewContext(read("sale-rule.js"), saleCtx);
const Sale = saleCtx.AriaSale;
const rules = loadStoreRules(ROOT);
const built = buildAll(ROOT, NEW);

await check("16 storefronts (Best Buy off sale again): each has its first screen with products, its endpoint file and a registry row, and is on sale", () => {
  assert.equal(NEW.length, 16);
  for (const k of NEW) {
    assert.ok(STORES[k], `${k}: not in tienda.html's registry`);
    assert.ok(!isOffSaleRetailer(k), `${k}: still off sale`);
    assert.ok(existsSync(ROOT + `assets/tienda/${k}/index.json`), `${k}: no index.json`);
    assert.ok(existsSync(ROOT + `assets/tienda/_fn/${k}.json`), `${k}: no endpoint file`);
    assert.ok(idx(k).count > 0, `${k}: no products`);
    assert.ok(idx(k).rails.length >= 2, `${k}: ${idx(k).rails.length} rail`);
  }
  assert.ok(idx("ariaperfumes").count > 10000, "Aria Perfumes is the whole perfume catalogue");
});

await check("the slices are current (node scripts/build-store-slices.mjs --only <stores>)", () => {
  const stale = [];
  for (const [k, b] of Object.entries(built)) {
    for (const [name, body] of Object.entries(b.files)) if (read(`assets/tienda/${k}/${name}`) !== JSON.stringify(body)) stale.push(`${k}/${name}`);
    if (read(`assets/tienda/_fn/${k}.json`) !== JSON.stringify(b.fn)) stale.push(`_fn/${k}.json`);
  }
  assert.deepEqual(stale.slice(0, 10), []);
});

await check("Ofertas first whenever the store has a real markdown, none when it has none; then category rails only", () => {
  for (const k of NEW) {
    const ix = idx(k), fn = loadStore(k, [ROOT]);
    const onSale = fn.rows.filter((r) => r[4] > 0 && Sale.isOnSale({ price: r[2], originalPrice: r[3] })).length;
    const keys = ix.rails.map((r) => r.key);
    if (onSale) {
      assert.equal(keys[0], "ofertas", `${k}: ${keys.join(",")}`);
      assert.equal(ix.rails[0].title, "Ofertas de " + (SLICED_STORES[k] ? SLICED_STORES[k].label : STORES[k].label));
      assert.equal(fn.rails.ofertas.length, onSale, `${k}: a sale missing from Ofertas`);
      for (const i of fn.rails.ofertas) assert.ok(Sale.isOnSale({ price: fn.rows[i][2], originalPrice: fn.rows[i][3] }), `${k}: "${fn.rows[i][0]}" in Ofertas without a sale`);
    } else {
      assert.ok(!keys.includes("ofertas"), `${k}: an Ofertas rail with no markdown`);
    }
    for (const r of keys.slice(onSale ? 1 : 0)) assert.match(r, SLICED_STORES[k] ? /^d-/ : /^t-/, `${k}: ${r} is not a category rail`);
    assert.ok(!keys.some((r) => ["masvendidos", "destacados", "t-mas", "d-mas"].includes(r)), `${k}: ${keys.join(",")}`);
  }
});

await check("a category rail holds only its category, by what the product is (classifier, then the head noun)", () => {
  const { R } = rules;
  for (const k of Object.keys(STOREFRONTS)) {
    const cfg = STOREFRONTS[k];
    for (const r of built[k].rails) {
      if (r.key === "ofertas") continue;
      assert.ok(r.cat && r.cat.fam, `${k}: ${r.key} says nothing about what it holds`);
      for (const p of r.items) {
        const it = { ...p, retailer: k };
        if (cfg.flagship) {
          assert.equal(R.productTypeOf(it), "perfumes", `${k}: ${p.name}`);
          if (r.cat.dept) assert.equal(p.dept, r.cat.dept, `${k} ${r.key}: ${p.name} is ${p.dept}`);
          if (r.cat.conc) { assert.ok(r.cat.conc.includes(p.conc), `${k} ${r.key}: ${p.name} is ${p.conc}`); assert.ok(["mujer", "hombre", "unisex"].includes(p.dept)); }
          if (r.cat.brand) assert.equal(String(p.brand).trim().toLowerCase(), r.cat.brand, `${k} ${r.key}: ${p.brand}`);
          continue;
        }
        const fam = familyOf(it, R, cfg);
        assert.notEqual(fam, NO_FAMILY, `${k} ${r.key}: "${p.name}" is not ${r.cat.fam}`);
        assert.equal(fam, r.cat.fam, `${k} ${r.key}: "${p.name}" is ${fam}`);
        if (r.cat.aisle) assert.equal(aisleOf(fam, it, cfg), r.cat.aisle, `${k} ${r.key}: "${p.name}"`);
        if (r.cat.rest) assert.ok(!r.cat.rest.includes(aisleOf(fam, it, cfg)), `${k} ${r.key}: "${p.name}" has its own aisle`);
      }
    }
  }
  /* Aria Perfumes' doors, classes and concentrations are the catalogue's own. */
  const ap = idx("ariaperfumes").rails.map((r) => r.title);
  for (const [, t] of [...PERFUME_DOOR_RAILS, ...PERFUME_CLASS_RAILS]) assert.ok(ap.includes(t), "Aria Perfumes has no " + t);
  for (const [, t] of PERFUME_CONCENTRATIONS) assert.ok(ap.includes(t), "Aria Perfumes has no " + t);
});

await check("what a product IS: the head noun, never the store's type field or a brand name", () => {
  assert.equal(beautyAisle({ name: "Kabuki-Buff Foundation Brush 115" }), "herramientas");
  assert.equal(beautyAisle({ name: "Insta-Wow Advanced Dry Shampoo Full-Size and Mini Gift Set", type: "Fragancia" }), "cabello");
  assert.equal(beautyAisle({ name: "Daily Defense Face Fluid SPF 50 Sunscreen" }), "piel");
  assert.equal(beautyAisle({ name: "Mask Fit Red Cushion - 40 Colors", type: "Mascarillas" }), "maquillaje");
  assert.equal(beautyAisle({ name: "KP Body Smoother 10% Glycolic Acid Body Scrub" }), "cuerpo");
  assert.equal(beautyAisle({ name: "Watermelon Glow Niacinamide Dew Drops Serum", brand: "Hair Rituel by Sisley" }), "piel");
  assert.equal(beautyAisle({ name: "Precision Lip Liner", brand: "Skin Tint Co" }), "maquillaje");
  assert.equal(garmentAisle({ name: "Women's Medium Impact Sports Bra" }), "deportivos");
  assert.equal(garmentAisle({ name: "Aura Sculpt Bra - White" }, true), "deportivos", "a training brand's bra is a sports bra");
  assert.equal(garmentAisle({ name: "Bali Comfort Revolution Wireless Bra DF3463" }), "lingerie");
  assert.equal(garmentAisle({ name: "Strike Short - Black" }), "pants");
  const { R } = rules;
  /* Ulta's «Baño y cuerpo» is not swimwear; a paper cup sleeve is not clothing. */
  assert.equal(familyOf({ name: "Vanilla Shea Sugar Scrub", type: "Baño y cuerpo", retailer: "ulta", dept: "beauty" }, R, STOREFRONTS.ulta), "belleza");
  assert.notEqual(familyOf({ name: "Kirkland Signature, Organic Lemonade, 96 fl oz, 2-count", retailer: "costco", dept: "dulces" }, R, STOREFRONTS.costco), "ropa");
});

await check("Sam's Club is held: no storefront, no registry row, no tile, no search door; still off sale", () => {
  assert.ok(HELD_STOREFRONTS.samsclub);
  assert.ok(isOffSaleRetailer("samsclub"), "samsclub left the off-sale list");
  assert.ok(!existsSync(ROOT + "assets/tienda/samsclub"), "assets/tienda/samsclub exists");
  assert.ok(!existsSync(ROOT + "assets/tienda/_fn/samsclub.json"));
  assert.ok(!STORES.samsclub && !STOREFRONTS.samsclub);
  assert.ok(!read("tiendas.html").includes("tienda=samsclub"));
  assert.ok(!/ samsclub /.test(/var STORE_PAGES = "([^"]*)"/.exec(read("search.html"))[1]));
});

await check("each storefront wears its own theme: colours, its logo file or a wordmark in its colours", () => {
  const hex = /^#[0-9A-F]{6}$/i;
  const all = JSON.parse(/var STORES = (\{.*\});/.exec(read("tienda.html"))[1]);
  for (const k of NEW) {
    const s = all[k];
    assert.ok(s, k);
    assert.match(s.color, hex, `${k}: colour`);
    assert.match(s.tag, hex, `${k}: tag`);
    if (s.color.toUpperCase() !== "#000000" && k !== "bestbuy") assert.match(s.heroEnd || "", hex, `${k}: no hero end colour`);
    if (s.logo) assert.ok(existsSync(ROOT + s.logo.replace(/^\//, "")), `${k}: ${s.logo} is not in the repo`);
    /* A logo is what its name says: logos/kohls.svg is a PNG, served as SVG it draws a broken image. */
    if (s.logo) {
      const head = readFileSync(ROOT + s.logo.replace(/^\//, "")).subarray(0, 300).toString("latin1");
      if (/\.svg$/.test(s.logo)) assert.match(head, /<svg|<\?xml/, `${k}: ${s.logo} is not an SVG`);
      if (/\.png$/.test(s.logo)) assert.match(head, /^\x89PNG/, `${k}: ${s.logo} is not a PNG`);
    }
    assert.ok(s.tagline && !/\b(the|and|shop|store|sale)\b/i.test(s.tagline), `${k}: tagline "${s.tagline}"`);
    if (s.backdrop) assert.ok(existsSync(ROOT + `assets/tienda/hero/${k}.jpg`) && statSync(ROOT + `assets/tienda/hero/${k}.jpg`).size < 90 * 1024, `${k}: no phone-sized backdrop`);
  }
  /* The stores with no logo file in the repo wear a wordmark (flagged in the PR). */
  assert.deepEqual(NEW.filter((k) => !all[k].logo).sort(), ["ariaperfumes", "athleta", "bananarepublic", "gap"]);
  /* The flagship: Aria's own house. */
  const ap = all.ariaperfumes;
  assert.equal(ap.flagship, "perfumes");
  assert.equal(ap.kicker, "Precio de lanzamiento");
  const page = read("tienda.html");
  assert.match(page, /function paintFlagship\(hero\)/);
  assert.match(page, /html\.store-flagship body\{/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)\{\.fl-sheen\{animation:none/);
  assert.match(page, /var LAUNCH_PRICED = \{"ariaperfumes": true\};/);
  const houses = idx("ariaperfumes").houses || [];
  assert.ok(houses.length >= 6, "the house strip");
  for (const h of houses) {
    assert.ok(existsSync(ROOT + h.logo.replace(/^\//, "")), h.logo);
    assert.ok(idx("ariaperfumes").rails.some((r) => r.key === h.k), `${h.t}: its tile opens no rail`);
  }
});

await check("searching a store's name opens its storefront (storeFor + search.html's STORE_PAGES)", async () => {
  const { loadSearch, storeFor } = await import("../../netlify/functions/_search-core.js");
  const { RETAILERS } = await import("../lib/retailers.js");
  const labels = Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label || k]));
  const ctx = loadSearch({ labels });
  const pages = /var STORE_PAGES = "([^"]*)"/.exec(read("search.html"))[1];
  /* Danny, 2026-11-01: every store's name opens that store, even when
     other stores sell its brand too (New Balance, Miu Miu, Crocs). */
  const asBrand = new Set();
  const wrong = [];
  for (const k of NEW) {
    assert.ok(pages.includes(" " + k + " "), `${k}: search.html has no door to it`);
    const got = storeFor(ctx, labels[k]);
    if (asBrand.has(k) ? got !== null : got !== k) wrong.push(`"${labels[k]}" -> ${got}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(storeFor(ctx, "aria perfumes"), "ariaperfumes");
  assert.equal(storeFor(ctx, "sephora"), "sephora");
  assert.ok(!/departamento\.html\?dept=perfumes&b=/.test(read("search.html")), "Aria Perfumes' search door still opens the department");
  assert.match(read("search.html"), /location\.replace\("tienda\.html\?tienda=" \+ encodeURIComponent\(data\.store\)\)/);
});

await check("zero emojis: the page, the registry, the slices, the rules", () => {
  const rx = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
  for (const f of ["tienda.html", "tiendas.html", "search.html", "scripts/lib/storefronts.js", "scripts/test/storefronts-18-tests.mjs"]) assert.doesNotMatch(read(f), rx, f);
  for (const k of NEW) assert.doesNotMatch(read(`assets/tienda/${k}/index.json`), rx, k);
});

await check("Mountain Test: thin first screens (under 30KB gzipped), no wholesale cost in any served file", async () => {
  const { gzipSync } = await import("node:zlib");
  for (const k of NEW) {
    const t = read(`assets/tienda/${k}/index.json`);
    assert.ok(gzipSync(t).length < 30 * 1024, `${k}: ${(gzipSync(t).length / 1024).toFixed(1)}KB`);
    assert.doesNotMatch(t, /wholesale|costUsd|supplierCost/i, k);
    assert.doesNotMatch(read(`assets/tienda/_fn/${k}.json`), /wholesale|costUsd|supplierCost/i, k);
  }
});

await check("headless at 390px: Aria Perfumes (flagship) and Sephora paint from their slices, no catalogue, no sideways scroll", async () => {
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { return "skip"; } }
  const http = await import("node:http");
  const { join, extname } = await import("node:path");
  const { handler } = await import(ROOT + "netlify/functions/tienda.js");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
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
    for (const store of ["ariaperfumes", "sephora"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const pg = await ctx.newPage();
      await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      /* Off-site photos answer with a 1x1 PNG (no image, no card). */
      await pg.route(/\.(png|jpe?g|webp|gif)(\?|$)|imwidth=|productimages/i, (r) => (r.request().url().startsWith(base) ? r.continue() : r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") })));
      const reqs = [], errs = [];
      pg.on("request", (r) => reqs.push(r.url()));
      pg.on("pageerror", (e) => errs.push(String(e)));
      await pg.goto(`${base}/tienda.html?tienda=${store}`, { waitUntil: "load" });
      await pg.waitForFunction(() => document.querySelectorAll(".rail-sec .card:not(.sk)").length >= 8, null, { timeout: 30000 });
      const r = await pg.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        first: document.querySelector(".rail-title").textContent,
        flagship: document.documentElement.classList.contains("store-flagship"),
        kicker: (document.querySelector(".fl-kicker") || {}).textContent || "",
        houses: document.querySelectorAll(".fl-house").length,
        launch: document.querySelectorAll(".card .launch").length,
        logo: !document.getElementById("heroLogo").hidden,
        pen: (document.querySelector(".card .pen") || {}).textContent || "",
      }));
      const ix = idx(store);
      assert.ok(r.sw <= 390, `${store}: the page scrolls sideways (${r.sw}px)`);
      assert.equal(r.first, ix.rails[0].title, store);
      assert.match(r.pen, /^S\/ \d/, store);
      if (store === "ariaperfumes") {
        assert.equal(r.first, "Ofertas de Aria Perfumes");
        assert.ok(r.flagship, "the flagship theme is not on");
        assert.equal(r.kicker, "Precio de lanzamiento");
        assert.ok(r.houses >= 6, `${r.houses} house tiles`);
        assert.ok(r.launch > 0, "no launch label on the cards");
        await pg.click(".fl-house");
        await pg.waitForFunction(() => document.querySelectorAll("#reGrid .card:not(.sk)").length > 0, null, { timeout: 30000 });
      } else {
        assert.ok(!r.flagship && r.logo, "Sephora wears its own logo, not the flagship");
        assert.equal(r.launch, 0);
      }
      const bad = reqs.filter((u) => /-catalog\.json|department-cache|catalog-index\.json|ofertas-feed|\/_fn\//.test(u));
      assert.deepEqual(bad, [], `${store} fetched ${bad.join(", ")}`);
      assert.deepEqual(errs, [], `${store}: ${errs.join("; ")}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} skipped` : ""}\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
