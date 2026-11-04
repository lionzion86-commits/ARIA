#!/usr/bin/env node
/* ==================================================================
   CAROUSELS ONLY (#443, Danny 2026-11-02): "Never again any combination
   of words, letters or numbers goes to a side-by-side grid. Eliminate any
   side-by-side grid format in the code."

   The one landing format, for every search: the product's Ofertas
   carousel on top, then one carousel per store that carries it (the
   biggest store first; B&H Photo first in Electrónica, DJI leading the
   drones). An ambiguous or unknown query lands on the chooser: four
   carousels -- Categoría, Marca, Producto, Ofertas -- each a door to that
   same format, never zero. A carousel's «Ver más» / «Ver todo» opens a
   railed view (by store, then by type or brand) or brings the next cards
   into the carousel; a store's carousel opens the store's page narrowed
   to the search, in carousels by product type (Danny's «alien» at CCS).

   This guard fails the build when:
     - a shipped page still carries a grid renderer (static check);
     - a landing, from either search box at 390px, draws product cards in
       more than one row and more than one column, or draws no carousel;
     - a landing's «Ver más» / «Ver todo» opens anything but carousels;
     - the drone words do not land on one and the same Drones page, B&H
       first, DJI first in each store, every drone on it.

     node scripts/test/carousels-only-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/carousels-only-tests.mjs   (also saves the 390px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { storeDoors } from "../build-store-doors.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const dept = await import("../../netlify/functions/_department-core.js");
const tcore = await import("../../netlify/functions/_tienda-core.js");
const dst = await import("../../netlify/functions/_search-destinations.js");
const DEST = JSON.parse(readFileSync(join(ROOT, dst.DEST_FILE), "utf8"));
const read = (f) => readFileSync(join(ROOT, f), "utf8");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message.split("\n")[0]); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
async function route(q) {
  const r = await search.handler({ httpMethod: "GET", queryStringParameters: { q, route: "1" } }, { fetchImpl });
  assert.equal(r.statusCode, 200, q);
  return JSON.parse(r.body);
}

/* ------------------------- the code ------------------------- */
const SHIPPED = ["search.html", "departamento.html", "marca.html", "tienda.html", "ofertas.html", "ropa-interior.html", "assets/js/dept-header.js", "assets/js/marca-focus.js"];
const GRID_RENDERERS = [
  [/re-grid|reGrid/, "the «Ver todo» grid overlay (.re-grid)"],
  [/railExpand|openRailExpand|closeRailExpand|moreExpand/, "the rail-expand overlay"],
  [/typeLead|tlGrid|renderTypeLead|moreTypeLead/, "the type page's grid (#typeLead)"],
  [/dh-grid|dhMore\b/, "a grid of cards (.dh-grid)"],
  [/class=\\?["']grid\b|className\s*=\s*["']grid\b|<div class="grid/, "a .grid container"],
  [/skel-grid/, "a grid of placeholders"],
  [/ch-doors|ch-door\b/, "the chooser's tile grid"],
  [/more-btn|slGridMore|slOpenSubs|slGrid\b/, "a page-wide «Mostrar más» grid"],
  [/juntos<\/button>|' juntos'/, "the «Ver los N juntos» grid"],
];
await check("static: no shipped page carries a grid renderer (re-grid, the overlay, #typeLead, .grid, the chooser tiles, «Mostrar más» grids)", () => {
  const bad = [];
  for (const f of SHIPPED) {
    const s = read(f);
    for (const [rx, what] of GRID_RENDERERS) if (rx.test(s)) bad.push(`${f}: ${what} (${rx.exec(s)[0]})`);
    /* search.html's old pager drew 48 more cards into the results box. */
    if (f === "search.html" && /function showMore\(/.test(s)) bad.push("search.html: the results pager (showMore)");
    /* No CSS rule lays cards out on a grid: a selector naming a card or a
       results container with display:grid. */
    for (const m of s.matchAll(/([^{}]*)\{([^{}]*display\s*:\s*grid[^{}]*)\}/g)) {
      const sel = m[1].trim().split(/\n/).pop();
      if (/card|result|grid|rail|lane|items|products/i.test(sel) && !/place-items:center/.test(m[2]) && !/dir-grid|store-grid|dh-sel|ch-head|trust/.test(sel)) bad.push(`${f}: CSS «${sel.slice(-60)}» is a grid`);
    }
  }
  assert.deepEqual(bad, []);
});
await check("static: every carousel's last card is a door or grows in place (rail-next / lane-more-card / fc-more / sl-grow), never an overlay", () => {
  assert.match(read("departamento.html"), /function nextCardHTML\(r, shown\)/);
  assert.match(read("departamento.html"), /function growRail\(btn\)/);
  assert.match(read("marca.html"), /function nextCardHTML\(r, shown\)/);
  assert.match(read("tienda.html"), /function slShowGroups\(query, title, back\)/);
  assert.match(read("tienda.html"), /function slGrow\(btn\)/);
  assert.match(read("search.html"), /storeDoor\(store, (l\.doorQ \|\| )?STATE\.q\)/);
  assert.match(read("assets/js/marca-focus.js"), /function storeDoor\(l\)/);
  assert.match(read("assets/js/dept-header.js"), /function axisDoor\(r\)/);
});
await check("static: the storefront lists (search.html, marca.html) are exactly the stores with products (scripts/build-store-doors.mjs)", () => {
  /* A door to an empty store is a card with no picture (Danny: no image,
     no card): a store with a door has products, a store with products
     has a door -- the set scripts/build-store-doors.mjs writes. */
  const { keys } = storeDoors(ROOT);
  assert.ok(keys.length > 0);
  for (const k of keys) assert.ok(Number(JSON.parse(read("assets/tienda/" + k + "/index.json")).count) > 0, k + ": a door to an empty store");
  const stocked = readdirSync(join(ROOT, "assets/tienda")).filter((k) => existsSync(join(ROOT, "assets/tienda", k, "index.json"))
    && Number(JSON.parse(read("assets/tienda/" + k + "/index.json")).count) > 0 && !isOffSaleRetailer(k));
  for (const k of stocked) assert.ok(keys.includes(k), k + ": a store with products and no door");
  for (const f of ["search.html", "marca.html"]) {
    const m = /var STORE_PAGES = " ([^"]+) ";/.exec(read(f));
    assert.ok(m, f);
    assert.deepEqual(m[1].split(" ").sort(), keys.slice().sort(), f);
  }
});

/* ------------------------- the servers ------------------------- */
/* («drone 4k» / «mini drone» join them with the phrase routing of #614.) */
const DRONE_WORDS = ["dron", "drón", "drons", "drone", "drones", "DRONE", "Drones", "dji", "cuadricóptero", "quadcopter"];
let DRONE_URL = "";
await check(`server: every drone word (${DRONE_WORDS.length}) lands on one and the same Drones page (departamento.html?dept=electronics&ver=pasillo:tech_drones)`, async () => {
  const urls = new Map();
  for (const q of DRONE_WORDS) urls.set(q, (await route(q)).destination.href);
  DRONE_URL = urls.get("drones");
  assert.match(DRONE_URL, /^departamento\.html\?dept=electronics&ver=pasillo%3Atech_drones(&|$)/);
  for (const [q, u] of urls) assert.equal(u, DRONE_URL, q);
});
const DRONES = dept.answer({ dept: "electronics", ver: "pasillo:tech_drones" }).body;
const DRONE_STORES = DRONES.rails.filter((r) => /^tienda:/.test(r.k));
await check("server: the Drones page is the landing format -- Ofertas, then one carousel per store, B&H Photo first, DJI first in every store that sells DJI, every drone on it once", () => {
  const head = JSON.parse(read("assets/sections/departamento/electronics/head.json"));
  const drones = head.rails.find((r) => r.k === "pasillo:tech_drones");
  assert.ok(drones && drones.count > 0, "no Drones rail in Electrónica");
  assert.equal(DRONES.count, drones.count, "the page does not hold every drone");
  assert.equal(DRONES.vt, "Drones");
  assert.equal(DRONES.rails[0].k, "ofertas");
  assert.equal(DRONE_STORES[0].k, "tienda:bhphoto");
  assert.equal(DRONE_STORES.reduce((n, r) => n + r.count, 0), DRONES.count, "the store carousels do not add up to the page");
  const list = dept.loadDept("electronics").list;
  for (const r of DRONE_STORES) {
    const store = r.k.slice(7);
    const page = dept.answer({ dept: "electronics", ver: "pasillo:tech_drones", rail: String(r.i), page: "0" }).body;
    const dji = page.cards.some((c) => /^dji$/i.test(c.b || "")) || list.some((p) => p.retailer === store && /^dji$/i.test(p.brand || "") && dept.techAisleOf(p) === "tech_drones" && !dept.conditionOfTitle(p.title));
    if (dji) assert.match(page.cards[0].b || "", /^DJI$/i, `${store}: the first drone is ${page.cards[0].b}`);
  }
});
await check("server: a store's carousel on the Drones page opens the drones at that store, by brand (DJI first); a set that splits no further is one carousel", () => {
  const bh = dept.answer({ dept: "electronics", ver: "pasillo:tech_drones", r: "bhphoto" }).body;
  const rails = bh.rails.filter((r) => r.k !== "ofertas");
  assert.ok(rails.length >= 2);
  assert.equal(rails[0].k, "marca:dji");
  for (const r of bh.rails) assert.ok(!/^tienda:/.test(r.k), r.k);
});
await check("server: every type landing a product word opens is the landing format (Ofertas first when some are on sale, then stores, biggest first)", () => {
  for (const [id, t] of Object.entries(dst.PRODUCT_TYPES)) {
    if (!(DEST.types[t.dept] && DEST.types[t.dept][t.ver])) continue;
    const a = dept.answer({ dept: t.dept, ver: t.ver, ...(t.q ? { q: t.q } : {}) });
    assert.equal(a.status, 200, id);
    const rails = a.body.rails;
    assert.ok(rails.length >= 1, id);
    const stores = rails.filter((r) => /^tienda:/.test(r.k));
    if (stores.length) for (let i = 1; i < stores.length; i++) if (stores[i - 1].k !== "tienda:bhphoto") assert.ok(stores[i - 1].count >= stores[i].count, `${id}: ${stores[i - 1].title} before ${stores[i].title}`);
  }
});
const CHOOSER_QS = ["blorptastic", "qwrtplk", "zapatix", "iphone 15 case", "unicornio", "taza", "a", "xq", "999999"];
await check(`server: the chooser (${CHOOSER_QS.length} queries) is four carousels -- Categoría, Marca, Producto, Ofertas -- each with products, never zero`, async () => {
  for (const q of CHOOSER_QS) {
    const a = await route(q);
    if (a.destination.kind !== "chooser") continue;
    assert.deepEqual(a.chooser.rails.map((r) => r.kind), dst.CHOOSER_KINDS, q);
    for (const r of a.chooser.rails) {
      assert.ok(r.items.length > 0 && r.n > 0, `${q}: ${r.kind} is empty`);
      assert.ok(dst.SURFACE_RX.test(r.url) || /^search\.html\?resultados=1&q=[^&"<>\s#]*(#lane-ofertas)?$/.test(r.url) || r.url === "ofertas.html", `${q}: ${r.url}`);
    }
  }
});
await check("server: a store narrowed to a search is carousels by product type (CCS + Alien Workshop: Ofertas, Skateboards, Tops y blusas...), every product once", () => {
  const a = tcore.answer({ store: "ccs", q: "alien workshop", group: "1" }).body;
  assert.ok(a.groups.length >= 3);
  assert.equal(a.groups[0].k, "ofertas");
  const types = a.groups.slice(1);
  assert.ok(types.some((g) => g.t === "Skateboards"), types.map((g) => g.t).join(", "));
  assert.equal(types.reduce((n, g) => n + g.n, 0), a.total);
  const more = types.find((g) => g.n > tcore.GROUP_CARDS) || types[0];
  const page = tcore.answer({ store: "ccs", q: "alien workshop", group: "1", gk: more.k, page: "1" }).body;
  assert.equal(page.total, more.n);
});

/* ------------------------- in the browser ------------------------- */
/* The sweep: drawn from the real index -- the biggest brands and stores,
   every product word, model families, typos, unknown words, numbers. */
const topBrands = Object.entries(DEST.brands).sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([, v]) => v[0]);
const someStores = ["sephora", "walmart", "ccs", "bhphoto", "macys"].filter((k) => DEST.stores[k]).map((k) => DEST.stores[k]);
const productWords = Object.keys(dst.PRODUCT_WORDS).map((id) => dst.PRODUCT_WORDS[id].split("|")[0]);
const SWEEP = [...new Set([
  "dron", "drons", "drone", "drones",
  ...topBrands, ...someStores, ...productWords,
  "air force 1", "samba", "iphone 15", "galaxy s24", "stanley quencher",
  "sephorra", "adiddas", "celualr", "zapatix", "vestdos",
  "blorptastic", "qwrtplk", "unicornio", "alien", "extraterrestre", "marciano",
  "550", "2024", "4k", "drone 4k", "mini drone", "juguetes", "vestidos", "perfume mujer",
])];

let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const handlers = {
    search: search.handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors };
  };
  const SHOT = process.env.SHOT_DIR || "";
  const CARD = ".card:not(.sk)";
  /* Type the words in a search box and wait for the landing to draw. */
  async function land(page, q, box) {
    if (box === "home") {
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      const id = await page.evaluate(() => { for (const i of ["searchInput", "searchInputD", "searchInput2"]) { const e = document.getElementById(i); if (e && e.offsetParent) return i; } return "searchInput"; });
      await page.fill("#" + id, q, { force: true });
      await page.press("#" + id, "Enter");
    } else {
      await page.goto(`${BASE}/ofertas.html`, { waitUntil: "domcontentloaded" });
      await page.tap(".hs-pill");
      await page.fill(".hs-in", q);
      await page.press(".hs-in", "Enter");
    }
    await page.waitForURL(/\/(search|departamento|marca|tienda)\.html/, { timeout: 60000 });
    await settle(page);
  }
  async function settle(page) {
    await page.waitForFunction((sel) => !/search\.html\?q=/.test(location.href) || document.querySelector(".ch-head, .empty"), null, { timeout: 60000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction((sel) => document.querySelector(".rail " + sel) || document.querySelector(".empty, .state"), CARD, { timeout: 60000 });
    await page.waitForTimeout(400);
  }
  /* A grid is product cards in more than one row AND more than one column
     inside one box -- however it is styled -- or a box laid out as a grid
     or a wrapping row around 2+ cards. */
  const shape = () => {
    const out = { grids: [], rails: 0, cards: 0, banned: document.querySelectorAll(".re-grid, #typeLead, #tlGrid, .dh-grid, #reGrid, #railExpand, .grid > .card").length };
    for (const el of document.querySelectorAll("body *")) {
      const kids = [...el.children].filter((k) => k.matches(".card:not(.sk), .dh-item") && k.getClientRects().length);
      if (kids.length < 2) continue;
      const cs = getComputedStyle(el);
      const rows = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size;
      const cols = new Set(kids.map((k) => Math.round(k.getBoundingClientRect().left + el.scrollLeft))).size;
      if (/grid/.test(cs.display) || (/flex/.test(cs.display) && cs.flexWrap !== "nowrap") || (rows > 1 && cols > 1)) out.grids.push((el.id ? "#" + el.id : "") + "." + String(el.className).replace(/\s+/g, "."));
    }
    out.rails = [...document.querySelectorAll(".rail")].filter((r) => r.querySelector(".card:not(.sk)")).length;
    out.cards = document.querySelectorAll(".rail .card:not(.sk)").length;
    return out;
  };
  async function assertRails(page, what) {
    const s = await page.evaluate(shape);
    assert.equal(s.banned, 0, `${what}: a grid element is on the page`);
    assert.deepEqual(s.grids, [], `${what}: cards side by side in rows`);
    assert.ok(s.rails >= 1 && s.cards >= 1, `${what}: no carousel`);
    return s;
  }
  try {
    /* The drone words, from both boxes. */
    const seen = new Map();
    for (const box of ["header", "home"]) for (const q of ["dron", "drons", "drone", "drones"]) {
      await check(`browser 390px: «${q}» in the ${box} search lands on the Drones carousels -- Ofertas on top, B&H Photo the first store, DJI first in each store, every drone on it`, async () => {
        const { c, page, errors } = await phone();
        await land(page, q, box);
        await page.waitForSelector('#rails .rail-sec[data-k^="tienda:"] .rail ' + CARD, { timeout: 60000 });
        /* The carousels after the first three come as the page scrolls. */
        for (let i = 0; i < 20; i++) {
          const n = await page.$$eval('#rails .rail-sec[data-k^="tienda:"]', (x) => x.length);
          if (n >= DRONE_STORES.length) break;
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(500);
        }
        await page.waitForFunction(() => ![...document.querySelectorAll('#rails .rail-sec .rail')].some((r) => r.querySelector(".sk")), null, { timeout: 30000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const url = page.url().replace(BASE + "/", "");
        seen.set(`${box}:${q}`, url);
        assert.equal(url, DRONE_URL, `${box}:${q} landed on ${url}`);
        await assertRails(page, q);
        const info = await page.evaluate(() => {
          const top = document.querySelector("#salesTop .rail-sec h2");
          const stores = [...document.querySelectorAll('#rails .rail-sec[data-k^="tienda:"]')].map((s) => ({
            k: s.getAttribute("data-k"), title: s.querySelector("h2").textContent, n: Number(s.querySelector(".rail-count").textContent.replace(/\D/g, "")),
            first: ((s.querySelector(".card:not(.sk) .card-brand") || {}).textContent || "").trim() }));
          return { top: top && top.textContent, stores, hero: document.getElementById("heroTitle").textContent,
            stat: ((document.querySelector("#dhStats b") || {}).textContent || "").replace(/\D/g, "") };
        });
        assert.equal(info.hero, "Drones");
        assert.equal(info.top, "Ofertas", "the Ofertas carousel is not on top");
        assert.equal(info.stores[0].title, "B&H Photo");
        assert.deepEqual(info.stores.map((s) => s.k), DRONE_STORES.map((r) => r.k));
        for (const s of info.stores) {
          const r = DRONE_STORES.find((x) => x.k === s.k);
          const dji = dept.answer({ dept: "electronics", ver: "pasillo:tech_drones", rail: String(r.i), page: "0" }).body.cards[0];
          if (/^dji$/i.test(dji.b || "")) assert.match(s.first, /^DJI$/i, `${s.title}: first card ${s.first}`);
        }
        assert.equal(info.stores.reduce((n, s) => n + s.n, 0), DRONES.count, "the store carousels do not hold every drone");
        assert.equal(Number(info.stat), DRONES.count, "the hero's count");
        if (SHOT && box === "header" && (q === "drone" || q === "dron")) await page.screenshot({ path: join(SHOT, `rails-${q}.png`) });
        if (SHOT && box === "header" && q === "drones") {
          await page.screenshot({ path: join(SHOT, "drones-shelf-top.png") });
          await page.locator('#rails .rail-sec[data-k^="tienda:"]').nth(0).scrollIntoViewIfNeeded();
          await page.evaluate(() => { const s = document.querySelector('#rails .rail-sec[data-k^="tienda:"]'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 70); });
          await page.waitForTimeout(500);
          await page.screenshot({ path: join(SHOT, "drones-shelf-stores-1-2.png") });
        }
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
    await check("browser: the eight drone landings are one and the same url", () => {
      assert.equal(new Set(seen.values()).size, 1, JSON.stringify([...seen]));
    });
    await check("browser 390px: on the Drones page a store's «Ver todo» opens the drones at that store as carousels by brand -- DJI first, no grid", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/${DRONE_URL}`);
      await page.waitForSelector('#rails .rail-sec[data-k="tienda:bhphoto"] a.rail-next', { timeout: 60000 });
      const href = await page.getAttribute('#rails .rail-sec[data-k="tienda:bhphoto"] a.rail-next', "href");
      assert.match(href, /&tienda=bhphoto$/);
      await page.goto(`${BASE}/${href}`);
      await settle(page);
      await assertRails(page, "B&H drones");
      assert.equal(await page.getAttribute("#rails .rail-sec", "data-k"), "marca:dji");
      /* That carousel grows in place. */
      const before = await page.$$eval('#rails .rail-sec[data-k="marca:dji"] .card:not(.sk)', (x) => x.length);
      await page.click('#rails .rail-sec[data-k="marca:dji"] button.rail-next');
      await page.waitForFunction((n) => document.querySelectorAll('#rails .rail-sec[data-k="marca:dji"] .card:not(.sk)').length > n, before, { timeout: 30000 });
      await assertRails(page, "B&H DJI grown");
      assert.deepEqual(errors, []);
      await c.close();
    });

    /* Danny's «alien»: the brand page's CCS carousel ends at CCS's page
       narrowed to the brand, in carousels by type. */
    await check("browser 390px: «alien» -> Alien Workshop; the CCS carousel's «Ver todo» opens CCS narrowed to it, by type (Skateboards, Tops y blusas...), never a list", async () => {
      const { c, page, errors } = await phone();
      await land(page, "alien", "header");
      assert.match(page.url(), /marca\.html\?marca=alienworkshop/);
      await assertRails(page, "alien");
      if (SHOT) await page.screenshot({ path: join(SHOT, "rails-alien.png") });
      const door = await page.$$eval("#rails .rail-section", (ss) => {
        for (const s of ss) if (/CCS/.test(s.querySelector("h2").textContent)) { const a = s.querySelector("a.rail-next"); return a && a.getAttribute("href"); }
        return null;
      });
      assert.equal(door, "tienda.html?tienda=ccs&q=Alien%20Workshop");
      await page.goto(`${BASE}/${door}`);
      await page.waitForSelector("#content .rail-sec[data-gk] .rail " + CARD, { timeout: 60000 });
      await assertRails(page, "CCS · Alien Workshop");
      const titles = await page.$$eval("#content .rail-sec[data-gk] .rail-title", (h) => h.map((x) => x.textContent));
      assert.equal(titles[0], "Ofertas");
      assert.ok(titles.includes("Skateboards"), titles.join(", "));
      if (SHOT) { await page.waitForTimeout(400); await page.screenshot({ path: join(SHOT, "rails-ccs-ver-mas.png") }); }
      const grow = await page.$("#content button.sl-grow");
      if (grow) {
        const rail = await grow.evaluateHandle((b) => b.parentNode);
        const n0 = await rail.evaluate((r) => r.querySelectorAll(".card:not(.sk)").length);
        await grow.click();
        await page.waitForFunction((r) => r.querySelectorAll(".card:not(.sk)").length > 12, rail, { timeout: 30000 });
        assert.ok(await rail.evaluate((r, n) => r.querySelectorAll(".card:not(.sk)").length > n, n0));
        await assertRails(page, "CCS grown");
      }
      assert.deepEqual(errors, []);
      await c.close();
    });

    /* The sweep, from the header search. */
    const LANDED = [];
    await check(`browser 390px sweep (${SWEEP.length} queries from the index: brands, stores, product words, models, typos, unknown words, numbers): every landing is carousels, never a grid`, async () => {
      const bad = [];
      const { c, page, errors } = await phone();
      for (const q of SWEEP) {
        try {
          await land(page, q, "header");
          const s = await page.evaluate(shape);
          const url = page.url().replace(BASE + "/", "");
          LANDED.push([q, url]);
          if (s.banned || s.grids.length || !(s.rails >= 1)) bad.push(`${q} -> ${url}: rails=${s.rails} grids=${s.grids.join(",")} banned=${s.banned}`);
          if (SHOT && q === "blorptastic") await page.screenshot({ path: join(SHOT, "rails-unknown.png") });
          if (SHOT && q === "zapatix") await page.screenshot({ path: join(SHOT, "rails-typo.png") });
        } catch (e) { bad.push(`${q}: ${e.message.split("\n")[0]}`); }
      }
      if (process.env.TABLE) for (const [q, u] of LANDED) console.log(`      ${q.padEnd(22)} ${u.replace(/&tp=.*$/, "")}`);
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser 390px: the chooser is four carousels -- Categoría, Marca, Producto, Ofertas -- each with products, and each door opens carousels", async () => {
      const { c, page, errors } = await phone();
      for (const q of ["blorptastic", "zapatix"]) {
        await land(page, q, "header");
        const kinds = await page.$$eval(".ch-lane", (ls) => ls.map((l) => [l.getAttribute("data-kind"), l.querySelectorAll(".card").length, l.querySelector(".lane-door").getAttribute("href")]));
        assert.deepEqual(kinds.map((k) => k[0]), ["category", "brand", "product", "ofertas"], q);
        for (const [k, n] of kinds) assert.ok(n > 0, `${q}: ${k} has no products`);
        for (const [k, , href] of kinds) {
          await page.goto(`${BASE}/${href}`);
          await settle(page);
          await assertRails(page, `${q} · ${k} (${href})`);
        }
      }
      assert.deepEqual(errors, []);
      await c.close();
    });
    /* Every «Ver más» / «Ver todo» on a landing: a door opens carousels;
       a button grows its carousel in place. */
    await check("browser 390px: every landing's «Ver más» / «Ver todo» opens carousels (a door) or grows the carousel in place (a button)", async () => {
      const bad = [];
      const { c, page, errors } = await phone();
      const sample = LANDED.filter(([q]) => ["drone", "Nike", "CCS", "celular", "vestidos", "alien", "samba", "sephorra", "juguetes", "iphone 15"].includes(q));
      for (const [q, url] of sample) {
        try {
          await page.goto(`${BASE}/${url}`);
          await settle(page);
          const door = await page.$$eval("a.rail-next, a.lane-more-card, a.fc-more", (a) => (a[0] ? a[0].getAttribute("href") : null));
          const btn = await page.$("button.rail-next:not(.rail-ver), button.lane-more-card, button.fc-more, button.sl-grow");
          const slDoor = await page.$("#content button.rail-ver");
          if (btn) {
            const rail = await btn.evaluateHandle((b) => b.parentNode);
            const n0 = await rail.evaluate((r) => r.querySelectorAll(".card:not(.sk)").length);
            await btn.scrollIntoViewIfNeeded();
            await btn.click();
            await page.waitForFunction(([r, n]) => r.querySelectorAll(".card:not(.sk)").length > n, [rail, n0], { timeout: 30000 });
            const s = await page.evaluate(shape);
            if (s.grids.length || s.banned) bad.push(`${q}: growing made a grid ${s.grids}`);
          }
          if (door) {
            await page.goto(`${BASE}/${door}`);
            await settle(page);
            const s = await page.evaluate(shape);
            if (s.grids.length || s.banned || !s.rails) bad.push(`${q}: ${door} -> rails=${s.rails} grids=${s.grids}`);
          }
          if (slDoor) {
            await page.goto(`${BASE}/${url}`);
            await settle(page);
            await page.click("#content button.rail-ver");
            await page.waitForSelector("#content .sl-back", { timeout: 30000 });
            await page.waitForSelector("#content .rail-sec[data-gk] .rail .card:not(.sk)", { timeout: 60000 });
            const s = await page.evaluate(shape);
            if (s.grids.length || s.banned || !s.rails) bad.push(`${q}: the store's «Ver todo» -> rails=${s.rails} grids=${s.grids}`);
          }
        } catch (e) { bad.push(`${q}: ${e.message.split("\n")[0]}`); }
      }
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
