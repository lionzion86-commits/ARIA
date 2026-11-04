#!/usr/bin/env node
/* ==================================================================
   THE HEADER SEARCH (Danny, 2026-11-02: "Put a search bar up there in
   the header, by the little cart. If I scroll down I'll still always
   have a search bar available to click and search.").

   PAGE (static)
   - every page with the site header carries the same block, current
     with scripts/header-search.mjs (CSS inline, so first paint reserves
     the pill's room; behaviour in assets/js/header-search.js, inlined
     on index.html so the homepage makes no new request);
   - Spanish, no emoji; the homepage's own hero search is untouched.
   BROWSER (headless Chromium, 390x844 phone and 1280x800 desktop)
   - on every page the header search is visible at the top AND after
     scrolling 2000px (the header is sticky), not covered by anything;
   - phone: a pill of at least 40x40; tapping it opens the field over the
     header row with the input focused; × closes it; desktop: a real
     field in the row (the homepage, whose nav fills the row, keeps the
     pill);
   - «adidas samba» + Enter goes to search.html?q=adidas%20samba, and on
     to the destination search.html's router picks; an empty query stays;
   - search.html's header field says the current q;
   - no horizontal overflow at 390 (also logged in on the homepage), no
     page errors.

     node scripts/test/header-search-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/header-search-tests.mjs   (also saves the 390px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const HS = await import("../header-search.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

/* ------------------------------ static ------------------------------ */
await check(`every page with the site header (${HS.HS_PAGES.length}) carries the header search, current with scripts/header-search.mjs`, () => {
  assert.deepEqual(HS.syncPages({ write: false }), [], "a copy is stale -- run: node scripts/header-search.mjs");
  for (const f of HS.HS_PAGES) {
    const s = read(f);
    assert.equal((s.match(/<div class="hs[ "]/g) || []).length, 1, `${f}: one header search`);
    const head = s.slice(0, s.indexOf("</head>"));
    assert.ok(head.includes('<style id="hs-css">'), `${f}: the CSS is not inline in <head>`);
    const hdr = s.slice(s.indexOf("<header"), s.indexOf("</header>"));
    assert.ok(hdr.includes('class="hs'), `${f}: the search is not inside the header`);
    assert.ok(hdr.includes("hs-row"), `${f}: the header row is not the field's anchor`);
    assert.match(hdr, /action="\/search\.html" method="get"/, `${f}: the form does not go to search.html`);
    assert.ok(hdr.includes(`placeholder="${HS.HS_PLACEHOLDER}"`), f);
    if (f === "index.html") continue;
    assert.ok(head.includes('<script src="/assets/js/header-search.js" defer></script>'), `${f}: header-search.js is not loaded`);
  }
});

await check("the homepage makes no new request for it: the behaviour is inline in <head>, before the hero search box and the app bundle", () => {
  const home = read("index.html");
  assert.ok(!home.includes('src="/assets/js/header-search.js"'), "index.html fetches header-search.js");
  const js = home.indexOf('<script id="hs-js">'), box = home.indexOf('id="searchInput"'), bundle = home.search(/<script src="\/build\/app-[0-9a-f]+\.js"[^>]*>/);
  assert.ok(js > 0 && js < home.indexOf("</head>") && js < box && box < bundle);
  assert.ok(!/<link[^>]+header-search/.test(home));
});

await check("the homepage's hero search is unchanged: its boxes, the early doSearch and its route", () => {
  const home = read("index.html");
  for (const id of ["searchInput", "searchInput2", "searchInputD"]) assert.ok(home.includes(`id="${id}"`), id);
  assert.match(home, /window\.doSearch = function\(which\)\{[\s\S]*?window\.location\.href = '\/search\.html\?q=' \+ encodeURIComponent\(raw\);/);
  assert.match(read("assets/js/header-search.js"), /window\.location\.href = '\/search\.html\?q=' \+ encodeURIComponent\(q\)/, "the header search does not take the hero's route");
});

await check("Spanish and no emoji in the markup, the CSS and the script", () => {
  const all = HS.hsMarkup() + HS.HS_CSS + read("assets/js/header-search.js") + read("scripts/header-search.mjs");
  assert.ok(!EMOJI.test(all), "an emoji");
  assert.match(HS.hsMarkup(), /aria-label="Cerrar búsqueda"/);
  assert.match(HS.hsMarkup(), /<span class="hs-lbl">Buscar<\/span>/);
  assert.equal(HS.HS_PLACEHOLDER, "Buscar productos, marcas o tiendas");
});

/* ----------------------------- browser ------------------------------ */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const handlers = {
    search: (await import("../../netlify/functions/search.js")).handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  /* checkout.html compiles Tailwind from cdn.tailwindcss.com, which this
     sandbox cannot reach: the same classes are built here and served. */
  const twDir = mkdtempSync(join(tmpdir(), "hs-tw-"));
  writeFileSync(join(twDir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(join(twDir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
  const tw = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(twDir, "tw.config.cjs"), "-i", join(twDir, "in.css"), "-o", join(twDir, "out.css")], { encoding: "utf8" });
  const TW_CSS = tw.status === 0 ? readFileSync(join(twDir, "out.css"), "utf8") : "";
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
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

  /* A Zumiez record with its own page, for producto.html. */
  const zum = JSON.parse(read("zumiez-catalog.json"));
  let ZT = "";
  for (const b of Object.values(zum.retailers.zumiez.departments)) for (const it of (Array.isArray(b) ? b : b.items || [])) if (!ZT && (it.title || it.name)) ZT = it.title || it.name;
  const PAGES = [
    ["index.html", "/"],
    ["tienda.html", "/tienda.html?tienda=sephora"],
    ["marca.html", "/marca.html?marca=nike"],
    ["departamento.html", "/departamento.html?dept=women"],
    ["search.html", "/search.html?q=blorptastic"],
    ["producto.html", `/producto.html?producto=${encodeURIComponent(ZT)}&tienda=zumiez`],
    ["ofertas.html", "/ofertas.html"],
    ["tiendas.html", "/tiendas.html"],
    ["categorias.html", "/categorias.html"],
    ["cuenta.html", "/cuenta.html"],
    ["keyclub.html", "/keyclub.html"],
    ["checkout.html", "/checkout.html"],
    ["disenadores.html", "/disenadores.html"],
    ["motos.html", "/motos.html"],
    ["ropa-interior.html", "/ropa-interior.html"],
    ["como-funciona.html", "/como-funciona.html"],
    ["nosotros.html", "/nosotros.html"],
    ["devoluciones.html", "/devoluciones.html"],
    ["opinion.html", "/opinion.html"],
    ["restricciones.html", "/restricciones.html"],
  ];
  await check("browser: the page list covers every page that carries the header search", () => {
    assert.deepEqual(PAGES.map((p) => p[0]).sort(), [...HS.HS_PAGES].sort());
  });

  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const open = async (w) => {
    const phone = w < 768;
    const c = await browser.newContext(phone
      ? { viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: w, height: 800 } });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
      const u = new URL(r.request().url());
      if (u.host === "cdn.tailwindcss.com") return r.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
      return r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort();
    });
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors, phone };
  };
  /* Is the search on screen, inside the header, and the thing a tap there hits? */
  const seen = (page) => page.evaluate(() => {
    const hs = document.querySelector(".hs");
    if (!hs) return "no .hs";
    const vis = [...hs.querySelectorAll(".hs-pill, .hs-form")].find((e) => getComputedStyle(e).display !== "none");
    if (!vis) return "nothing of .hs is displayed";
    const r = vis.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return `${Math.round(r.width)}x${Math.round(r.height)} is under 40x40`;
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return `off screen: ${JSON.stringify(r)}`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !hs.contains(hit)) return `covered by ${hit && hit.tagName}.${hit && hit.className}`;
    return "ok";
  });
  const SHOT = process.env.SHOT_DIR || "";
  const SHOTS = { "index.html": "home", "tienda.html": "store", "producto.html": "product" };
  const navTo = (page) => page.waitForRequest((r) => r.isNavigationRequest() && /\/search\.html\?q=adidas%20samba$/.test(r.url()), { timeout: 15000 });

  try {
    for (const W of [390, 1280]) {
      for (const [name, path] of PAGES) {
        await check(`browser ${W}px: ${name} -- the header search is visible at the top and after scrolling 2000px; it opens, searches «adidas samba»; no overflow, no errors`, async () => {
          const { c, page, errors, phone } = await open(W);
          await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
          await page.waitForTimeout(600);
          const shot = SHOT && W === 390 && SHOTS[name];
          assert.equal(await seen(page), "ok", "at the top");
          const pill = phone || name === "index.html";
          if (shot) await page.screenshot({ path: join(SHOT, `hdr-${shot}-top.png`) });
          if (pill) {
            assert.equal(await page.isVisible(".hs-pill"), true, "no pill");
            if (phone) {
              const r = await page.$eval(".hs-pill", (e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; });
              assert.ok(r[0] >= 40 && r[1] >= 40, `pill ${r}`);
            }
            assert.equal(await page.isVisible(".hs-in"), false, "the field shows before the tap");
          } else {
            assert.equal(await page.isVisible(".hs-in"), true, "no field on a wide screen");
            assert.equal(await page.isVisible(".hs-pill"), false);
          }
          await page.evaluate(() => window.scrollTo(0, 2000));
          await page.waitForTimeout(250);
          const scrolled = await page.evaluate(() => window.scrollY);
          assert.equal(await seen(page), "ok", `after scrolling to ${scrolled}px`);
          if (shot) await page.screenshot({ path: join(SHOT, `hdr-${shot}-scrolled.png`) });
          if (phone) {
            const sw = await page.evaluate(() => document.documentElement.scrollWidth);
            assert.ok(sw <= W, `scrollWidth ${sw} > ${W}`);
          }
          if (pill) {
            await (phone ? page.tap(".hs-pill") : page.click(".hs-pill"));
            assert.equal(await page.isVisible(".hs-in"), true, "the tap did not open the field");
            assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "hsInput", "the field is not focused");
            assert.equal(await page.getAttribute(".hs-pill", "aria-expanded"), "true");
            const cover = await page.evaluate(() => { const f = document.querySelector(".hs-form").getBoundingClientRect(), row = document.querySelector(".hs-row").getBoundingClientRect(); return [f.left - row.left, row.right - f.right, f.top - row.top, row.bottom - f.bottom].map(Math.round); });
            assert.deepEqual(cover, [0, 0, 0, 0], "the open field does not cover the header row");
            if (shot) await page.screenshot({ path: join(SHOT, `hdr-${shot}-scrolled-open.png`) });
            await (phone ? page.tap(".hs-x") : page.click(".hs-x"));
            assert.equal(await page.isVisible(".hs-in"), false, "× did not close it");
            if (shot) {
              await page.evaluate(() => window.scrollTo(0, 0));
              await page.waitForTimeout(150);
              await page.tap(".hs-pill");
              await page.screenshot({ path: join(SHOT, `hdr-${shot}-top-open.png`) });
            } else await (phone ? page.tap(".hs-pill") : page.click(".hs-pill"));
          }
          /* an empty query does nothing */
          const before = page.url();
          await page.focus(".hs-in");
          await page.fill(".hs-in", "   ");
          await page.press(".hs-in", "Enter");
          await page.waitForTimeout(300);
          assert.equal(page.url(), before, "an empty query navigated");
          if (name === "search.html") assert.equal(await page.inputValue(".hs-in"), "   ");
          await page.fill(".hs-in", "adidas samba");
          const went = navTo(page);
          await page.press(".hs-in", "Enter");
          await went;
          if ((W === 390 && (name === "index.html" || name === "tienda.html")) || (W === 1280 && name === "marca.html")) {
            await page.waitForURL(/\/marca\.html\?marca=adidas&q=samba/, { timeout: 60000 });
          }
          assert.deepEqual(errors, []);
          await c.close();
        });
      }
    }

    await check("browser 390px: search.html's header field says the current q", async () => {
      const { c, page, errors } = await open(390);
      await page.goto(`${BASE}/search.html?q=blorptastic`, { waitUntil: "load" });
      assert.equal(await page.inputValue(".hs-in"), "blorptastic");
      assert.deepEqual(errors, []);
      await c.close();
    });

    await check("browser 390px: the homepage header fits logged in too, admin included, 360 to 1440 (Mi cuenta stays, Salir waits in the menu on a phone)", async () => {
      const { c, page, errors } = await open(390);
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      await page.evaluate(() => { currentUser = "danny@ariashop.pe"; renderAuthUI(); }); // eslint-disable-line no-undef
      assert.equal(await page.isVisible('#authArea a[href="/cuenta.html"]'), true, "Mi cuenta is not in the row");
      assert.ok(await page.$('#authAreaMobile button[onclick^="logout"]'), "Salir is not in the menu");
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= 390, `scrollWidth ${sw}`);
      assert.equal(await seen(page), "ok");
      if (SHOT) await page.screenshot({ path: join(SHOT, "hdr-home-top-logged-in.png") });
      for (const admin of [false, true]) {
        await page.evaluate((a) => { currentUserIsAdmin = a; renderAuthUI(); }, admin); // eslint-disable-line no-undef
        for (const w of [360, 390, 430, 520, 640, 700, 768, 900, 1024, 1100, 1280, 1440]) {
          await page.setViewportSize({ width: w, height: 800 });
          const s = await page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(s <= w, `logged in${admin ? " as admin" : ""} at ${w}px: scrollWidth ${s}`);
        }
      }
      assert.deepEqual(errors, []);
      await c.close();
    });

    await check("browser: the homepage header row no longer overflows at any width from 360 to 1440 (logged out)", async () => {
      const { c, page, errors } = await open(1280);
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      const bad = [];
      for (const w of [360, 390, 430, 520, 600, 640, 700, 768, 900, 1024, 1100, 1280, 1440]) {
        await page.setViewportSize({ width: w, height: 800 });
        const s = await page.evaluate(() => document.querySelector(".hs-row").scrollWidth - document.querySelector(".hs-row").clientWidth);
        if (s > 0) bad.push(`${w}px: +${s}`);
      }
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
      await c.close();
    });

    await check("browser 390px: Escape closes the open field; a tap outside does too", async () => {
      const { c, page } = await open(390);
      await page.goto(`${BASE}/tienda.html?tienda=sephora`, { waitUntil: "load" });
      await page.tap(".hs-pill");
      await page.keyboard.press("Escape");
      assert.equal(await page.isVisible(".hs-in"), false);
      await page.tap(".hs-pill");
      await page.evaluate(() => document.body.click());
      assert.equal(await page.isVisible(".hs-in"), false);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
