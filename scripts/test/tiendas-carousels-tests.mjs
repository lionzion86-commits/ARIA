/* ==================================================================
   «TODAS LAS TIENDAS» -- CATEGORY CAROUSELS OF STORES (#443, Danny's
   rulings 2026-11-01).

     - every pill is a STORE with a live storefront (never a brand);
     - each store's rail in a carousel holds only that category's
       products, and its count is the store's true total;
     - every rail ends on «Ver más en <tienda>», the door into its page;
     - the old one-rail-per-store carousels are gone; Hero/Ofertas,
       Perfumes, Aria Luxury and the category carousels stay, in order,
       above the block;
     - no emoji, every photo lazy, nothing catalogue-sized at load;
     - at 390px the block renders and a pill switches the rail.

     node scripts/test/tiendas-carousels-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { TIENDAS_DIR, RAIL_CARDS, MIN_CARDS, buildCarousels, liveStorefronts, storeRegistry, categoryOf } from "../build-tiendas-carousels.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");
const json = (f) => JSON.parse(read(f));
const index = json(`${TIENDAS_DIR}/index.json`);
const html = read("index.html");
const js = read("assets/js/tiendas-carousels.js");
/* The homepage view only (the Tiendas directory view keeps its own rails). */
const home = html.slice(html.indexOf('<div id="homeView"'), html.indexOf('<div id="resultsView"'));
const mobile = home.slice(home.indexOf('<div id="mobileShopfront"'), home.indexOf('<div id="desktopShopfront"'));
const desktop = home.slice(home.indexOf('<div id="desktopShopfront"'));
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

await check("every pill is a live storefront: tienda.html registry row, assets/tienda/<key>/index.json with products, not off sale", () => {
  const reg = storeRegistry(ROOT);
  assert.ok(index.carousels.length >= 10, `${index.carousels.length} carousels`);
  for (const c of index.carousels) {
    assert.ok(c.stores.length >= 1, c.k);
    for (const s of c.stores) {
      const f = `assets/tienda/${s.k}/index.json`;
      assert.ok(existsSync(ROOT + f), `${c.title}: ${s.k} has no storefront`);
      assert.ok(json(f).count > 0, `${c.title}: ${s.k}'s storefront is empty`);
      assert.ok(reg[s.k] && !reg[s.k].pendingCatalog, `${c.title}: ${s.k} is not in tienda.html's registry`);
      assert.ok(!isOffSaleRetailer(s.k), `${c.title}: ${s.k} is off sale`);
      assert.equal(s.label, reg[s.k].label, `${s.k}: the pill does not carry the store's own name`);
    }
  }
});

await check("stores, never brands: no brand-only name has a pill (unless its storefront lands)", () => {
  const BRANDS = { sephora: "Sephora", ulta: "Ulta", yesstyle: "YesStyle", bestbuy: "Best Buy", macys: "Macy's", kohls: "Kohl's", gap: "Gap", costco: "Costco",
    gymshark: "Gymshark", buybuybaby: "buybuy BABY", tactics: "Tactics", evo: "Evo", newegg: "Newegg", crutchfield: "Crutchfield", hm: "H&M", zara: "Zara",
    urbanoutfitters: "Urban Outfitters", asos: "ASOS", fashionnova: "Fashion Nova", nike: "Nike", underarmour: "Under Armour", reebok: "Reebok" };
  const live = new Set(liveStorefronts(ROOT).map((s) => s.k));
  for (const c of index.carousels) for (const s of c.stores) {
    for (const [k, label] of Object.entries(BRANDS)) {
      if (live.has(k)) continue;
      assert.ok(s.k !== k && s.label.toLowerCase() !== label.toLowerCase(), `${c.title}: «${s.label}» is a brand with no storefront`);
    }
  }
});

await check("the committed files are what the slices compute today (true totals, data-driven membership)", () => {
  const { carousels } = buildCarousels(ROOT);
  assert.deepEqual(index.carousels.map((c) => ({ k: c.k, stores: c.stores.map((s) => [s.k, s.n, s.cat]) })),
    carousels.map((c) => ({ k: c.k, stores: c.stores.map((s) => [s.k, s.n, s.cat]) })), "stale -- node scripts/build-tiendas-carousels.mjs");
  for (const c of carousels) for (const s of c.stores) {
    const f = json(`${TIENDAS_DIR}/${c.k}-${s.k}.json`);
    assert.equal(f.n, s.n, `${c.k}-${s.k}: n`);
    assert.deepEqual(f.cards.map((x) => x.title), s.rows.slice(0, RAIL_CARDS).map((r) => r[0]), `${c.k}-${s.k}: cards stale`);
  }
});

await check("category truth: each store's rail in a carousel holds only that category's products, and a full rail of them", () => {
  for (const c of index.carousels) for (const s of c.stores) {
    const fn = json(`assets/tienda/_fn/${s.k}.json`), idx = json(`assets/tienda/${s.k}/index.json`);
    const labels = Object.fromEntries((idx.rails || []).map((r) => [r.key, r.title]));
    const top = new Map(), subs = new Map();
    for (const [key, list] of Object.entries(fn.rails)) {
      if (/^(ofertas|masvendidos|destacados|t-mas|d-mas)$/.test(key) || /^[bc]-/.test(key)) continue;
      if (key.includes("~")) { if (!/^t-/.test(key)) continue; const [a, g, x] = key.split("~"); for (const i of list) { if (!subs.has(i)) subs.set(i, []); subs.get(i).push({ a, g, s: x }); } continue; }
      for (const i of list) if (!top.has(i)) top.set(i, key);
    }
    const catsOf = new Map();
    fn.rows.forEach((r, i) => {
      const t = String(r[0]).trim();
      if (!catsOf.has(t)) catsOf.set(t, new Set());
      catsOf.get(t).add(categoryOf(s.k, r, top.get(i), subs.get(i), labels[top.get(i)]));
    });
    const rail = json(`${TIENDAS_DIR}/${c.k}-${s.k}.json`);
    assert.equal(rail.cat, s.cat);
    assert.ok(rail.cards.length >= Math.min(MIN_CARDS, RAIL_CARDS), `${c.k}-${s.k}: ${rail.cards.length} cards`);
    for (const card of rail.cards) {
      assert.equal(card.retailer, s.k, `${c.k}-${s.k}: a card from another store`);
      assert.match(card.image, /^https?:\/\//, `${c.k}-${s.k}: a card without its photo`);
      assert.ok(catsOf.get(String(card.title).trim())?.has(s.cat), `${c.k}-${s.k}: «${card.title}» is not ${s.cat}`);
    }
  }
  /* Spot checks on the ruling's own examples. */
  const pills = (k) => (index.carousels.find((c) => c.k === k) || { stores: [] }).stores.map((s) => s.k);
  assert.ok(pills("lenceria").includes("calzedonia") && pills("lenceria").includes("intimissimi"), "Lencería without Calzedonia/Intimissimi");
  assert.ok(pills("exclusiva").includes("farfetch") && pills("zapatos").includes("farfetch"), "Farfetch: clothing in Moda Exclusiva, shoes in Zapatos");
  assert.ok(!pills("bano").includes("calzedonia"), "Calzedonia has no swim in its slices");
  for (const empty of ["dsw", "bathandbodyworks", "tenniswarehouse"]) {
    if (json(`assets/tienda/${empty}/index.json`).count > 0) continue;
    for (const c of index.carousels) assert.ok(!c.stores.some((s) => s.k === empty), `${empty} is empty and has a pill`);
  }
});

await check("every rail ends on «Ver más en <tienda>», the door into the store's own page", () => {
  for (const c of index.carousels) for (const s of c.stores) assert.equal(json(`${TIENDAS_DIR}/${c.k}-${s.k}.json`).door, `/tienda.html?tienda=${s.k}`);
  assert.match(js, /rail\.innerHTML = cards\.map\(cardHTML\)\.join\(""\) \+ doorHTML\(s\)/);
  assert.match(js, /Ver más en ' \+ esc\(s\.label\)/);
  assert.match(js, /"\/tienda\.html\?tienda=" \+ encodeURIComponent\(key\)/);
  assert.doesNotMatch(js, /https?:\/\//, "no link out of Aria");
});

await check("the old one-rail-per-store carousels are gone; the block closes on «Ver todas las tiendas»", () => {
  assert.ok(!/data-store-rail="/.test(home), "a store rail is still on the homepage");
  assert.ok(!/data-store-rail-row="/.test(home), "a store rail row is still on the homepage");
  for (const tree of [mobile, desktop]) {
    const b = tree.indexOf("data-tiendas-block");
    assert.ok(b > 0, "no Tiendas block");
    const end = tree.indexOf("</section>", b);
    assert.match(tree.slice(b, end), /data-tiendas-all[^>]*>Ver todas las tiendas/);
  }
  assert.match(html, /<script src="\/assets\/js\/tiendas-carousels\.js" defer><\/script>/);
});

await check("Hero/Ofertas, Perfumes, Aria Luxury and the category carousels stay, in order, above the block", () => {
  const CATEGORIES = ["Electrónica", "Gym Rat", "Fútbol", "Aria Fight Club", "Aria Beauty", "Surf &amp; Skate", "Juguetes", "Zapatos", "Lentes de Sol", "Ropa Interior Mujer", "Ropa Interior Hombre", "Joyas y accesorios"];
  const at = (tree, l) => tree.indexOf(`aria-label="${l}"`);
  const hero = home.indexOf('class="ariaHero"');
  for (const [name, tree] of [["phone", mobile], ["desktop", desktop]]) {
    const block = tree.indexOf('aria-label="Todas las Tiendas"');
    assert.ok(home.indexOf('aria-label="Ofertas"') > 0 && home.indexOf('aria-label="Ofertas"') < home.indexOf("data-tiendas-block"), "Ofertas");
    const seq = ["Aria Perfumes", "Aria Luxury"].map((l) => at(tree, l));
    assert.ok(seq.every((i) => i >= 0), `${name}: ${seq}`);
    for (const i of seq) assert.ok(i < block, `${name}: a kept block sits under Tiendas`);
    const cats = CATEGORIES.map((l) => [l, at(tree, l)]).filter(([, i]) => i >= 0);
    assert.ok(cats.length >= (name === "phone" ? 12 : 11), `${name}: ${cats.length} category carousels`);
    for (const [l, i] of cats) assert.ok(i > at(tree, "Aria Perfumes") && i < block, `${name}: ${l} out of place`);
  }
  assert.ok(hero > 0 && hero < home.indexOf('data-tiendas-block'), "the hero");
});

await check("zero emoji: the block, its script and its files", () => {
  const b = mobile.indexOf("data-tiendas-block");
  assert.doesNotMatch(mobile.slice(b - 600, mobile.indexOf("</section>", b)), EMOJI);
  assert.doesNotMatch(js, EMOJI);
  for (const f of readdirSync(ROOT + TIENDAS_DIR)) {
    const body = json(`${TIENDAS_DIR}/${f}`);
    const labels = JSON.stringify(f === "index.json" ? body : { label: body.label });
    assert.doesNotMatch(labels, EMOJI, f);
  }
});

await check("the Mountain Test: lazy photos, labels-only index, small rails, nothing at load", () => {
  assert.match(js, /loading="lazy"/);
  const bundleName = /<script src="\/(build\/app-[0-9a-f]+\.js)"><\/script>/.exec(html)[1];
  const bundle = read(bundleName);
  const photo = bundle.slice(bundle.indexOf("function cardPhotoHTML("), bundle.indexOf("function cardPhotoHTML(") + 2000);
  assert.match(photo, /loading="lazy"/, "the bundle's card photo is not lazy");
  assert.match(js, /IntersectionObserver/);
  assert.ok(statSync(ROOT + TIENDAS_DIR + "/index.json").size < 16000, "index.json is not small");
  for (const f of readdirSync(ROOT + TIENDAS_DIR)) if (f !== "index.json") assert.ok(statSync(`${ROOT}${TIENDAS_DIR}/${f}`).size < 12000, `${f} is not small`);
  assert.doesNotMatch(js, /-catalog\.json|_fn\//, "a catalogue on the path");
});

/* ---------- the page at 390px ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml" };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(p));
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

await check("390px: the block renders, a pill switches the rail, the rail ends on its door, photos lazy", async () => {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { throw new Error("playwright is not installed"); }
  const srv = await serve();
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    /* Retailer photos are outside the sandbox: a 1x1 stands in, so a card is
       not dropped as photo-less (no image, no card). */
    const PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => /\.(png|jpe?g|webp|gif|avif)(\?|$)|\/image|images?\//i.test(r.request().url()) || r.request().resourceType() === "image"
      ? r.fulfill({ status: 200, contentType: "image/png", body: PX }) : r.abort());
    const early = [];
    page.on("request", (r) => { if (/\/assets\/home\/tiendas\//.test(r.url())) early.push(r.url()); });
    await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" });
    await page.waitForTimeout(800);
    assert.equal(early.length, 0, "the block fetched before it neared the screen: " + early.join(", "));
    const block = page.locator("#mobileShopfront [data-tiendas-block]");
    await block.scrollIntoViewIfNeeded();
    const car = page.locator('#mobileShopfront [data-tiendas-carousel="lenceria"]');
    await car.waitFor({ timeout: 20000 });
    await car.scrollIntoViewIfNeeded();
    const rail = car.locator("[data-tiendas-rail]");
    await page.waitForFunction(() => { const r = document.querySelector('#mobileShopfront [data-tiendas-carousel="lenceria"] [data-tiendas-rail]'); return r && r.querySelector("[data-tiendas-door]"); }, null, { timeout: 20000 });
    const first = await rail.getAttribute("data-tiendas-store");
    await car.locator('[data-tiendas-pill="calzedonia"]').click();
    await page.waitForFunction(() => document.querySelector('#mobileShopfront [data-tiendas-carousel="lenceria"] [data-tiendas-rail]').getAttribute("data-tiendas-store") === "calzedonia", null, { timeout: 20000 });
    assert.notEqual(first, "calzedonia");
    const state = await rail.evaluate((r) => ({
      last: r.lastElementChild && r.lastElementChild.getAttribute("href"),
      lastText: r.lastElementChild && r.lastElementChild.textContent.replace(/\s+/g, " ").trim(),
      cards: r.querySelectorAll("[data-tiendas-card]").length,
      stores: [...r.querySelectorAll("[data-tiendas-card]")].map((c) => c.getAttribute("data-cp-r") || "calzedonia"),
      eager: [...r.querySelectorAll("img")].filter((i) => i.getAttribute("loading") !== "lazy").length,
      selected: [...r.closest("[data-tiendas-carousel]").querySelectorAll('[aria-selected="true"]')].map((b) => b.getAttribute("data-tiendas-pill")),
      /* The block itself never pushes the page sideways (the header's own
         404px overflow at 390 predates this block and is not its). */
      width: Math.round(r.closest("[data-tiendas-block]").getBoundingClientRect().right),
    }));
    assert.equal(state.last, "/tienda.html?tienda=calzedonia");
    assert.match(state.lastText, /^Ver más en Calzedonia/);
    assert.ok(state.cards >= 8, `${state.cards} cards`);
    assert.ok(state.stores.every((s) => s === "calzedonia"), "a card from another store");
    assert.equal(state.eager, 0, "an eager photo in the rail");
    assert.deepEqual(state.selected, ["calzedonia"]);
    assert.ok(state.width <= 390, `the block runs past the screen (${state.width}px)`);
  } finally {
    await browser.close();
    srv.close();
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
