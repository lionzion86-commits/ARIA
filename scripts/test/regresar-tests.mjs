/* ==================================================================
   «← REGRESAR» LANDS ON THE CARD THAT WAS TAPPED (#443 c.6641939238,
   Danny live from his phone: open a mixed-store carousel, tap a product
   from store B, hit Regresar, land back on the SAME carousel at the SAME
   spot, in one tap).

   At 390px (phone, taps) and 1366px (laptop, clicks), for each origin
     the homepage's carousels (its button cards and its data-pdp cards;
     index.html sends both to producto.html), a store page,
     a department page (and one of its hub-pill lenses, an in-place
     view), a search's rails, a brand page and Ofertas
   a carousel below the fold is scrolled sideways to a card from another
   store than its first, the card is tapped, and then -- once with the
   «Regresar» pill, once with the browser's back button --
     - the pill is on the first screen of the product, «Ir a la tienda»
       beside it;
     - the URL is the origin's again (the lens is back for the lens);
     - window.scrollY is where it was, within 4px;
     - the carousel's scrollLeft is where it was, within 4px;
     - the tapped card is on screen.
   Then: a direct arrival (a shared link, nothing behind it) falls back
   to the product's type section, a real department page; «Ir a la
   tienda» still opens the product's store; the static half (the script
   is small, fetches nothing, has no unload handler, and every card page
   loads it, deferred, through scripts/header-search.mjs).

   Playwright's Chromium runs without the back-forward cache, so every
   back here is the harder path: a fresh load, restored by regresar.js.

     node scripts/test/regresar-tests.mjs
     ONLY="tienda" node scripts/test/regresar-tests.mjs
     RG_SHOTS=<dir> node scripts/test/regresar-tests.mjs   390px screenshots (regresar-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { /* no browser here */ }

let passed = 0;
const failures = [];
async function check(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).split("\n").slice(0, 4).join("\n         ")}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(ROOT + f, "utf8");

/* ---------- the static half ---------- */
const RG = read("assets/js/regresar.js");
await check("regresar.js is small, fetches nothing and keeps the bfcache (no unload handler)", () => {
  assert.ok(Buffer.byteLength(RG) < 16000, `regresar.js is ${Buffer.byteLength(RG)} bytes`);
  const code = RG.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|sendBeacon/, "regresar.js reaches the network");
  assert.doesNotMatch(code, /['"](before)?unload['"]|onunload/, "an unload handler keeps a page out of the bfcache");
});
await check("every page that renders cards, and producto.html, loads regresar.js once, deferred (scripts/header-search.mjs)", async () => {
  const { RG_PAGES, RG_SCRIPT, syncPages } = await import(pathToFileURL(ROOT + "scripts/header-search.mjs").href);
  for (const f of ["index.html", "tienda.html", "marca.html", "departamento.html", "search.html", "producto.html", "ofertas.html", "disenadores.html", "ropa-interior.html"]) {
    assert.ok(RG_PAGES.includes(f), f + " is not in RG_PAGES");
    const html = read(f);
    assert.equal(html.split(RG_SCRIPT).length - 1, 1, f + " loads regresar.js " + (html.split("regresar.js").length - 1) + " times");
  }
  assert.match(RG_SCRIPT, / defer><\/script>$/);
  assert.deepEqual(syncPages({ write: false }), [], "a page is stale -- run node scripts/header-search.mjs");
});
await check("the pills: producto.html carries «Regresar» and «Ir a la tienda» first in <main>; the in-app view's back is «Regresar»", () => {
  const p = read("producto.html");
  assert.match(p, /<main>\s*<nav class="rg-bar"[^>]*><a class="rg-pill" id="rgBack"[^>]* data-rg>[\s\S]*?Regresar<\/a><a class="rg-pill" id="rgStore"[^>]*>Ir a la tienda/);
  const ix = read("index.html");
  assert.match(ix, /<div id="productView" class="view">\r?\n\s*<div[^>]*>\r?\n\s*<!--[^\n]*-->\r?\n\s*<button type="button" id="productViewBack" onclick="goBack\(\)"[\s\S]{0,900}?Regresar\r?\n\s*<\/button>/);
  assert.doesNotMatch(ix.slice(ix.indexOf('<div id="productView"'), ix.indexOf('<div id="productView"') + 1500), />\s*Volver\s*</);
  const m = /<script src="\/build\/(app-[0-9a-f]{16})\.js" defer><\/script>/.exec(ix);
  assert.ok(m, "index.html loads no deferred bundle");
  assert.match(read("build/" + m[1] + ".js"), /AriaRegresar\.fallback\(/, "goBack() has no direct-arrival fallback");
});

if (!chromium) {
  console.log("    --   no Playwright here: the browser checks were skipped");
} else {
  /* ---------- a local server: the worktree, its functions in-process ---------- */
  const TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
  const fns = {};
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.includes("exchange-rate")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75}'); return; }
    const m = /^\/\.netlify\/functions\/([\w-]+)$/.exec(u.pathname);
    if (m) {
      const f = join(ROOT, "netlify/functions", m[1] + ".js");
      if (!existsSync(f)) { res.writeHead(404); res.end("{}"); return; }
      try {
        fns[m[1]] = fns[m[1]] || await import(pathToFileURL(f).href);
        const h = fns[m[1]].handler || (fns[m[1]].default && fns[m[1]].default.handler);
        const r = await h({ httpMethod: req.method, headers: {}, queryStringParameters: Object.fromEntries(u.searchParams), path: u.pathname }, {});
        res.writeHead(r.statusCode || 200, { "Content-Type": "application/json" }); res.end(r.body || "");
      } catch (e) { res.writeHead(500); res.end("{}"); }
      return;
    }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(404); res.end("{}"); return; }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const browser = await chromium.launch();
  const SHOTS = process.env.RG_SHOTS || "";
  const TOL = 4;

  /* ---------- in-page helpers ---------- */
  const HELPERS = `
    window.__rg = {
      ROW: '.ariaRail, div.rail, .track, .rel-row',
      vis: function(e){ return !!(e && e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden'; },
      ident: function(c){ return c.getAttribute('href') || c.getAttribute('data-pdp') || c.getAttribute('onclick') || ''; },
      store: function(c){ if (c.getAttribute('data-cp-r')) return c.getAttribute('data-cp-r'); var m = /[?&]tienda=([^&]+)/.exec(__rg.ident(c)); return m ? m[1] : ''; },
      app: function(c){ return /^open\\w*Product\\(|showProduct\\(/.test(c.getAttribute('onclick') || ''); },
      pdp: function(c){ return /producto\\.html\\?producto=/.test(c.getAttribute('href') || c.getAttribute('data-pdp') || ''); },
      product: function(c){ var k = window.__rgKind; return k === 'app' ? __rg.app(c) : k === 'pdp' ? __rg.pdp(c) : (__rg.app(c) || __rg.pdp(c)); },
      heading: function(row){ var s = row.closest('section, .rail-sec, .shelf, [aria-label]'), h = s && s.querySelector('h2, h3');
        var n = (s && s.getAttribute('aria-label')) || (h && h.textContent) || '';
        if (!/\\S/.test(n) && row.firstElementChild) n = 'c:' + String(row.firstElementChild.getAttribute('onclick') || '').replace(/\\d+\\)$/, '');
        return n.replace(/\\s+/g, ' ').trim().toLowerCase().slice(0, 80); },
      rails: function(scope){ var root = scope ? document.querySelector(scope) : document; return root ? Array.prototype.filter.call(root.querySelectorAll(__rg.ROW), function(r){
        return __rg.vis(r) && r.scrollWidth > r.clientWidth + 40 && Array.prototype.filter.call(r.children, __rg.product).length >= 5; }) : []; },
      /* the probe: the rail and the tapped card, found again by heading + nth and by the card's own link */
      all: function(){ return Array.prototype.filter.call(document.querySelectorAll(__rg.ROW), function(r){ return r.getClientRects().length > 0; }); },
      find: function(p){ var all = __rg.all(), n = 0;
        for (var i = 0; i < all.length; i++) if (__rg.heading(all[i]) === p.h) { if (n === p.n) return all[i]; n++; } return null; },
      onScreen: function(e){ var b = e.getBoundingClientRect(); var cx = b.left + b.width / 2, cy = b.top + Math.min(b.height / 2, 80); return cx > 0 && cx < innerWidth && cy > 0 && cy < innerHeight; }
    };`;
  async function open(ctx, url) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await page.route((u) => u.host !== new URL(base).host, (r) => (r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort()));
    await page.addInitScript(HELPERS);
    await page.goto(base + url, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    page._errs = errs;
    return page;
  }
  /* Scrolls down until the nth product carousel is drawn, brings it to the
     middle of the screen, swipes it sideways to a card from another store
     than its first, and returns the probe. */
  async function aim(page, { nth = 1, scope = null, mixed = true, kind = "" } = {}) {
    await page.evaluate((k) => { window.__rgKind = k; }, kind);
    let rails = 0;
    for (let i = 0; i < 30 && rails <= nth; i++) {
      rails = await page.evaluate((s) => __rg.rails(s).length, scope);
      if (rails > nth) break;
      await page.mouse.wheel(0, 700); await page.waitForTimeout(250);
    }
    const probe = await page.evaluate(({ nth, scope, mixed }) => {
      const list = __rg.rails(scope);
      let row = null, card = null;
      const order = list.slice(nth).concat(list.slice(0, nth));
      for (const r of order) {
        const cards = Array.prototype.filter.call(r.children, __rg.product);
        const s0 = __rg.store(cards[0]);
        const pick = cards.slice(3).find((c) => !mixed || !s0 || __rg.store(c) !== s0) || cards[4];
        if (pick) { row = r; card = pick; break; }
      }
      if (!row) return null;
      row.scrollIntoView({ block: 'center' });
      row.scrollLeft = Math.max(0, card.offsetLeft - row.offsetLeft - 30);
      const all = __rg.all(), h = __rg.heading(row);
      let n = 0; for (const r of all) { if (r === row) break; if (__rg.heading(r) === h) n++; }
      card.setAttribute('data-rg-probe', '');
      return { h, n, ident: __rg.ident(card), store: __rg.store(card), first: __rg.store(Array.prototype.filter.call(row.children, __rg.product)[0]) };
    }, { nth, scope, mixed });
    assert.ok(probe, "no carousel with five product cards");
    await page.waitForTimeout(500);
    const at = await page.evaluate((p) => { const r = __rg.find(p); return { y: Math.round(scrollY), x: Math.round(r.scrollLeft), top: Math.round(r.getBoundingClientRect().top), url: location.pathname + location.search }; }, probe);
    return { ...probe, ...at };
  }
  async function tap(page, sel, mobile) {
    const el = await page.waitForSelector(sel, { state: "attached", timeout: 15000 });
    if (mobile) await el.tap(); else await el.click();
  }
  /* Back on the origin: polls until it is drawn and put back (or 10s). */
  async function landed(page, probe) {
    let got = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      got = await page.evaluate((p) => {
        const r = __rg.find(p);
        const c = r && Array.prototype.find.call(r.children, (k) => __rg.ident(k) === p.ident);
        return { url: location.pathname + location.search, y: Math.round(scrollY), x: r ? Math.round(r.scrollLeft) : null, top: r ? Math.round(r.getBoundingClientRect().top) : null, card: !!(c && __rg.onScreen(c)) };
      }, probe);
      if (got.url === probe.url && got.x != null && Math.abs(got.x - probe.x) <= TOL && Math.abs(got.top - probe.top) <= TOL && got.card) {
        await page.waitForTimeout(600);   // and it stays there
        return page.evaluate((p) => { const r = __rg.find(p); const c = r && Array.prototype.find.call(r.children, (k) => __rg.ident(k) === p.ident);
          return { url: location.pathname + location.search, y: Math.round(scrollY), x: r ? Math.round(r.scrollLeft) : null, top: r ? Math.round(r.getBoundingClientRect().top) : null, card: !!(c && __rg.onScreen(c)) }; }, probe);
      }
    }
    return got;
  }
  function assertLanded(where, probe, got) {
    assert.equal(got.url, probe.url, `${where}: the URL`);
    /* scrollY is where it was -- unless the page above the carousel drew
       taller or shorter on the fresh load (a photo, a late banner): then
       the scroll follows the carousel, which must sit where it sat. */
    const grew = (got.y + got.top) - (probe.y + probe.top);
    if (Math.abs(got.y - probe.y) > TOL) {
      assert.ok(Math.abs(grew) > TOL && Math.abs(got.y - probe.y - grew) <= TOL, `${where}: scrollY ${got.y}, was ${probe.y}`);
      console.log(`         note ${where}: the page above the carousel drew ${grew}px ${grew > 0 ? "taller" : "shorter"}; scrollY ${probe.y} -> ${got.y} keeps the carousel in place`);
    }
    assert.ok(got.x != null, `${where}: the carousel «${probe.h}» is not there`);
    assert.ok(Math.abs(got.x - probe.x) <= TOL, `${where}: the carousel's scrollLeft ${got.x}, was ${probe.x}`);
    assert.ok(Math.abs(got.top - probe.top) <= TOL, `${where}: the carousel sits at ${got.top}px on the screen, was ${probe.top}px`);
    assert.ok(got.card, `${where}: the tapped card is not on screen`);
  }
  /* The pill is on the product's first screen, without scrolling. */
  async function pillOnFirstScreen(page, sel, where) {
    await page.waitForSelector(sel, { state: "visible", timeout: 15000 });
    const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, y: scrollY, text: e.textContent.trim() }; });
    assert.equal(r.y, 0, `${where}: the product view opened scrolled (${r.y})`);
    assert.ok(r.top >= 0 && r.bottom <= (await page.evaluate(() => innerHeight)), `${where}: the pill is not on the first screen (${Math.round(r.top)}-${Math.round(r.bottom)})`);
    assert.match(r.text, /^Regresar$/, `${where}: the pill reads «${r.text}»`);
  }

  const VIEWPORTS = [
    { tag: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    { tag: "1366", viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 },
  ];
  /* The origins. app: the card opens the homepage's in-app product view. */
  const ORIGINS = [
    { key: "home", url: "/", nth: 1, kind: "app" },
    { key: "home-pdp", url: "/", nth: 0, kind: "pdp" },
    { key: "tienda", url: "/tienda.html?tienda=walmart", nth: 2, mixed: false },
    { key: "departamento", url: "/departamento.html?dept=women", nth: 2 },
    { key: "departamento-lens", url: "/departamento.html?dept=women", nth: 0, lens: true },
    { key: "search", url: "/search.html?q=unicornio", nth: 1 },
    { key: "marca", url: "/marca.html?marca=nike", nth: 2 },
    { key: "ofertas", url: "/ofertas.html", nth: 2 },
  ];

  for (const vp of VIEWPORTS) {
    const mobile = !!vp.isMobile;
    for (const o of ORIGINS) {
      for (const how of ["Regresar", "browser back"]) {
        await check(`${o.key} ${vp.tag}: ${how} lands on the same carousel, same spot`, async () => {
          const ctx = await browser.newContext(vp);
          try {
            const page = await open(ctx, o.url);
            let lensK = "";
            if (o.lens) {
              await page.waitForSelector("#hubPills .hub-pill[data-k]:not([data-k=''])", { state: "visible", timeout: 20000 });
              lensK = await page.$eval("#hubPills .hub-pill[data-k]:not([data-k=''])", (b) => b.getAttribute("data-k"));
              await tap(page, `#hubPills .hub-pill[data-k="${lensK}"]`, mobile);
              await page.waitForSelector("#lens div.rail a", { state: "visible", timeout: 20000 });
              await page.waitForTimeout(800);
            }
            const probe = await aim(page, { nth: o.nth, scope: o.lens ? "#lens" : null, mixed: o.mixed !== false, kind: o.kind || "" });
            if (o.key === "home") assert.ok(probe.ident, "home: no card");
            if (SHOTS && vp.tag === "390" && how === "Regresar") await page.screenshot({ path: `${SHOTS}/regresar-${o.key}-390-1-origin.png` });
            await tap(page, "[data-rg-probe]", mobile);
            await page.waitForURL(/\/producto\.html\?/, { timeout: 15000 });
            await page.waitForSelector("#p-body .grid2", { timeout: 20000 });
            await pillOnFirstScreen(page, "#rgBack", `${o.key} ${vp.tag}`);
            assert.equal(await page.getAttribute("#rgBack", "data-rg-to"), "origin", "the pill does not know the origin");
            if (probe.store) {
              assert.equal(await page.isVisible("#rgStore"), true, "«Ir a la tienda» is not beside «Regresar»");
              assert.match(await page.getAttribute("#rgStore", "href"), new RegExp("tienda=" + probe.store + "$|disenadores|auto"));
            }
            if (SHOTS && vp.tag === "390" && how === "Regresar") await page.screenshot({ path: `${SHOTS}/regresar-${o.key}-390-2-product.png` });
            if (how === "Regresar") await tap(page, "#rgBack", mobile);
            else await page.goBack();
            const got = await landed(page, probe);
            if (o.lens) assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-lens")), lensK, "the lens is not back");
            assertLanded(`${o.key} ${vp.tag} ${how}`, probe, got);
            if (SHOTS && vp.tag === "390" && how === "Regresar") await page.screenshot({ path: `${SHOTS}/regresar-${o.key}-390-3-back.png` });
            assert.deepEqual(page._errs, []);
          } finally { await ctx.close(); }
        });
      }
    }
  }

  /* ---------- a direct arrival: the type section ---------- */
  const DIRECT = [
    { name: "Air Jordan 1 Mid Sneakers", tienda: "ssense", want: /^\/departamento\.html\?dept=shoes/ },
    { name: "Women's Printed Short-Sleeve Knit Dress", tienda: "macys", want: /^\/departamento\.html\?dept=women/ },
    { name: "Barbie Unicorn Doll with Pink Hair, Ombre Outfit & Accessories", tienda: "walmart", want: /^\/departamento\.html\?dept=toys$/ },
  ];
  for (const vp of VIEWPORTS) {
    const mobile = !!vp.isMobile;
    await check(`direct ${vp.tag}: a shared product link falls back to its type section (producto.html)`, async () => {
      for (const d of DIRECT) {
        const ctx = await browser.newContext(vp);
        try {
          const page = await open(ctx, `/producto.html?producto=${encodeURIComponent(d.name)}&tienda=${d.tienda}`);
          await pillOnFirstScreen(page, "#rgBack", "direct " + d.name);
          assert.equal(await page.getAttribute("#rgBack", "data-rg-to"), "section");
          const href = await page.getAttribute("#rgBack", "href");
          assert.match(href, d.want, d.name + " -> " + href);
          await tap(page, "#rgBack", mobile);
          await page.waitForURL((u) => u.pathname === "/departamento.html", { timeout: 15000 });
          await page.waitForSelector("div.rail a", { state: "visible", timeout: 25000 });
          if (SHOTS && vp.tag === "390" && d === DIRECT[0]) await page.screenshot({ path: `${SHOTS}/regresar-direct-390-section.png` });
          assert.deepEqual(page._errs, []);
        } finally { await ctx.close(); }
      }
    });
    /* The homepage sends every card and every ?producto= link to
       producto.html (index.html's showProduct override); the bundle's
       in-app view stays as the fallback. Shown here as goBack() sees it
       when the app pushed nothing: no history of ours, a pending product. */
    await check(`direct ${vp.tag}: the in-app product view's «Regresar», with nothing behind it, opens the type section`, async () => {
      const ctx = await browser.newContext(vp);
      try {
        const page = await open(ctx, "/");
        await page.waitForFunction(() => typeof goBack === "function" && window.AriaRegresar, null, { timeout: 20000 });
        await page.evaluate((name) => { pendingProduct = { name, retailer: "walmart", brand: "Barbie", returnView: "homeView" }; routeDepth = 0; showPage("productView"); }, DIRECT[2].name);
        await pillOnFirstScreen(page, "#productViewBack", "direct in-app");
        await tap(page, "#productViewBack", mobile);
        await page.waitForURL((u) => u.pathname === "/departamento.html", { timeout: 15000 });
        assert.match(new URL(page.url()).search, /^\?dept=toys$/);
        await page.waitForSelector("div.rail a", { state: "visible", timeout: 25000 });
      } finally { await ctx.close(); }
    });
    await check(`ir a la tienda ${vp.tag}: still opens the product's store, beside Regresar`, async () => {
      const ctx = await browser.newContext(vp);
      try {
        const page = await open(ctx, "/tienda.html?tienda=walmart");
        await aim(page, { nth: 0, mixed: false });
        await tap(page, "[data-rg-probe]", mobile);
        await page.waitForSelector("#p-body .grid2", { timeout: 20000 });
        await tap(page, "#rgStore", mobile);
        await page.waitForURL((u) => u.pathname === "/tienda.html" && u.searchParams.get("tienda") === "walmart", { timeout: 15000 });
      } finally { await ctx.close(); }
    });
  }
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log("  FAIL " + f + "\n");
process.exit(failures.length ? 1 : 0);
