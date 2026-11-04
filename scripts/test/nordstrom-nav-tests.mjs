#!/usr/bin/env node
/* ==================================================================
   THE NORDSTROM NAVIGATION PATTERN (#443 c.6616347095, c.6616389410,
   c.6616425433).

   Pins:
     - the menu data and every page's tab row are what
       scripts/build-nav-menu.mjs computes today (--check);
     - every leaf of the menu lands on products (counts > 0), every
       registry department with products sits under a tab;
     - the filter answers stack (audience x type x brand x size x price x
       Ofertas) and every option offered returns products;
     - no filter UI renders a checkbox;
     - desktop 1366x768 (no touch): hovering Zapatos opens the flyout
       over the homepage; a click outside closes it on the same URL;
       clicking Botas navigates; the type pills re-render in place;
       Marca + Talla stack as chips; no zero-result option; no
       catalogue file is requested while the menu is open;
     - phone 390: a tap opens the sheet, a tap outside closes it.

     node scripts/test/nordstrom-nav-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/nordstrom-nav-tests.mjs   (also saves nav-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMenu, syncPages, MENU_FILE, INVENTORY_FILE, inventoryMarkdown, NM_PAGES } from "../build-nav-menu.mjs";
import { navFilter, normSize, readFilters } from "../../netlify/functions/_nav-filter-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const read = (f) => readFileSync(join(ROOT, f), "utf8");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message.split("\n")[0]); }
}

const B = buildMenu(ROOT);
await check("the menu JSON, the inventory and every page's tab row are current (node scripts/build-nav-menu.mjs)", () => {
  assert.equal(read(MENU_FILE), JSON.stringify(B.menu) + "\n", MENU_FILE + " is stale");
  assert.equal(read(INVENTORY_FILE), inventoryMarkdown(B), INVENTORY_FILE + " is stale");
  assert.deepEqual(syncPages(B.menu, { write: false, root: ROOT }), []);
  for (const f of NM_PAGES) if (existsSync(join(ROOT, f))) {
    const s = read(f);
    assert.match(s, /<nav class="nm[^"]*" data-nm/, f + " has no tab row");
    assert.match(s, /<script src="\/assets\/js\/nav-menu\.js" defer><\/script>/, f + " does not load the menu");
  }
});
await check("index.html stays CRLF with the tab row in it", () => {
  const s = readFileSync(join(ROOT, "index.html"));
  const lf = s.filter((c, i) => c === 10 && s[i - 1] !== 13).length;
  assert.equal(lf, 0, `${lf} bare LF line endings in index.html`);
});
await check("the menu is small and lazy: under 64KB, fetched by the script, never inlined", () => {
  assert.ok(read(MENU_FILE).length < 64 * 1024, "nav-menu.json is " + read(MENU_FILE).length + " bytes");
  assert.ok(!read("index.html").includes('"tabs":['), "index.html inlines the menu");
  assert.match(read("assets/js/nav-menu.js"), /fetch\('\/assets\/data\/nav-menu\.json'\)/);
});
await check("every section Danny named is a tab or a section in one", () => {
  const all = JSON.stringify(B.menu);
  for (const name of ["Deportes", "Gym Rat", "Fútbol", "Tenis", "Aria Fight Club", "Surf & Skate", "Diseñadores Latinos", "Tallas Plus", "Perfumes", "Aria Beauty",
    "Mujer", "Hombre", "Niños", "Belleza", "Zapatos", "Zapatillas", "Accesorios", "Diseñador", "Joyas", "Hogar", "Electrónica", "Juguetes", "Lencería", "Ropa Interior Hombre", "Lentes de Sol", "Aria Auto", "Motos", "Ofertas", "Key Club"])
    assert.ok(all.includes('"' + name), name + " is missing from the menu");
  assert.deepEqual(B.unplaced, [], "registry departments with products under no tab");
});
await check("Zapatos opens Mujer / Hombre / Niños columns of real types and a Marcas column", () => {
  const z = B.menu.tabs.find((t) => t.k === "zapatos");
  assert.deepEqual(z.cols.slice(0, 4).map((c) => c.h), ["Mujer", "Hombre", "Niños", "Marcas"]);
  const botas = z.cols[0].links.find((l) => /^Botas/.test(l[0]));
  assert.ok(botas && botas[2] > 0 && /dept=shoes&nav=1&u=women&t=botas-y-botines/.test(botas[1]), JSON.stringify(botas));
});
await check("every leaf lands on products: a nav=1 leaf's own filters return exactly its count", () => {
  for (const t of B.menu.tabs) for (const c of t.cols) for (const [label, href, n] of c.links) {
    assert.ok(n > 0, `${t.label} > ${c.h} > ${label}: 0`);
    const u = new URL(href, "http://x");
    if (u.pathname !== "/departamento.html" || u.searchParams.get("nav") !== "1") continue;
    const qs = Object.fromEntries(u.searchParams);
    const r = navFilter(qs.dept, readFilters(qs), "deal", 0, [ROOT]);
    assert.equal(r.count, n, `${t.label} > ${c.h} > ${label}: menu says ${n}, the page finds ${r.count}`);
  }
});
await check("sizes are the store's own labels, read not invented", () => {
  assert.deepEqual(normSize("9.5M"), [{ z: "US 9.5", side: "" }]);
  assert.deepEqual(normSize("9 | US"), [{ z: "US 9", side: "" }]);
  assert.deepEqual(normSize("IT 41"), [{ z: "IT 41", side: "" }]);
  assert.deepEqual(normSize("M 10 / W 11.5"), [{ z: "US 10", side: "m" }, { z: "US 11.5", side: "w" }]);
  assert.deepEqual(normSize("10.0"), [{ z: "US 10", side: "" }]);
});
await check("facets stack (Niños x Botas x a brand x a size) and every offered option returns products", () => {
  const base = { u: "women", t: "botas-y-botines", s: "", b: [], z: [], p: [], o: "", fx: 3.75 };
  const r0 = navFilter("shoes", base, "deal", 0, [ROOT]);
  assert.ok(r0.count > 0 && r0.facets.b.length && r0.facets.z.length && r0.facets.s.length);
  const b = r0.facets.b[0][0];
  const r1 = navFilter("shoes", { ...base, b: [b] }, "deal", 0, [ROOT]);
  assert.equal(r1.count, r0.facets.b[0][2], "the brand count is the brand's result");
  const z = r1.facets.z[0];
  const r2 = navFilter("shoes", { ...base, b: [b], z: [z[0]] }, "deal", 0, [ROOT]);
  assert.equal(r2.count, z[2], "the size count is the stacked result");
  assert.ok(r2.count <= r1.count && r1.count <= r0.count);
  for (const k of ["u", "t", "s", "b", "z", "p", "o"]) for (const x of r2.facets[k]) assert.ok(x[2] > 0, `${k} ${x[0]} offered at 0`);
  const p = r2.facets.p[0];
  if (p) assert.equal(navFilter("shoes", { ...base, b: [b], z: [z[0]], p: [p[0]] }, "deal", 0, [ROOT]).count, p[2]);
  const kids = navFilter("shoes", { ...base, u: "kids", b: ["ugg"] }, "deal", 0, [ROOT]);
  for (const c of kids.cards) assert.equal(String(c.b).toLowerCase(), "ugg");
});
await check("no filter UI renders a checkbox (the bar, the menu, the department page)", () => {
  for (const f of ["assets/js/nav-filter.js", "assets/js/nav-menu.js", "assets/js/dept-header.js", "departamento.html", "search.html", "marca.html", "tienda.html", "ofertas.html", "ropa-interior.html"])
    assert.ok(!/type=["']?checkbox/.test(read(f)), f + " renders a checkbox");
});

await check("the homepage's Categorías store rail is chips, not a checkbox sidebar (the checkboxes are hidden state)", () => {
  const s = read("index.html");
  const i = s.indexOf('id="categoriesStoreFilters"');
  const aside = s.lastIndexOf("<aside", i);
  assert.match(s.slice(aside, aside + 40), /<aside hidden aria-hidden="true">/);
  assert.match(s, /<div id="categoriesStoreChips" class="flex gap-2/);
});
await check("the menu and the bar lay nothing out on a grid (carousels only)", () => {
  for (const f of ["assets/js/nav-filter.js", "assets/js/nav-menu.js"]) assert.ok(!/display\s*:\s*grid/.test(read(f)), f);
  assert.match(read("assets/js/nav-filter.js"), /class="rail nf-rail" id="nfRail"/);
});

let pw = null;
try { pw = await import("playwright"); } catch { /* reported */ }
await check("browser: playwright is available", () => assert.ok(pw));
if (pw) {
  const { createServer } = await import("node:http");
  const handlers = {
    "nav-filter": (await import("../../netlify/functions/nav-filter.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    ofertas: (await import("../../netlify/functions/ofertas.js")).handler,
    search: (await import("../../netlify/functions/search.js")).handler,
  };
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
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
    if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  const ctx = async (desktop) => {
    const c = await browser.newContext(desktop ? { viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const reqs = [];
    page.on("request", (r) => reqs.push(r.url()));
    return { c, page, reqs };
  };
  /* The flyout is open with its columns. Polled from here: the homepage's
     own timers make an in-page waitForFunction miss its ticks. */
  const flyoutOpen = async (page, col = "Mujer") => {
    for (let t = Date.now(); Date.now() - t < 15000; await page.waitForTimeout(100)) {
      const ok = await page.evaluate((c) => {
        const f = document.getElementById("nmFlyout");
        const a = f && !f.hidden && f.querySelector('[data-nm-col="' + c + '"] a');
        return !!(a && a.getBoundingClientRect().height > 0);
      }, col);
      if (ok) return;
    }
    throw new Error("the flyout did not open with its " + col + " column");
  };
  const CATALOG_RX = /-catalog\.json|department-cache|auto-cache\.json|ofertas-feed\.json|catalog-index\.json|\/_fn\//;
  try {
    await check("browser desktop 1366: hover Zapatos opens the flyout over the homepage; outside click closes it on the same URL; no catalogue requested", async () => {
      const { c, page, reqs } = await ctx(true);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-nm-tab="zapatos"]');
      await page.waitForFunction(() => document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(200);
      const url0 = page.url();
      const before = reqs.length;
      await page.hover('[data-nm-tab="zapatos"]');
      await flyoutOpen(page);
      const y0 = await page.evaluate(() => window.scrollY);
      const cols = await page.$$eval("#nmFlyout .nmf-col h3", (h) => h.map((x) => x.textContent));
      assert.deepEqual(cols.slice(0, 4), ["Mujer", "Hombre", "Niños", "Marcas"]);
      assert.ok(await page.isVisible('#nmFlyout [data-nm-col="Marcas"] a'));
      if (SHOT) await page.screenshot({ path: join(SHOT, "nav-desktop-zapatos-flyout.png") });
      const during = reqs.slice(before);
      assert.deepEqual(during.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested with the menu open");
      assert.ok(during.some((u) => /nav-menu\.json/.test(u)) || reqs.some((u) => /nav-menu\.json/.test(u)));
      await page.mouse.move(683, 700);
      await page.mouse.click(683, 700);
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(page.url(), url0, "clicking off navigated");
      assert.equal(await page.evaluate(() => window.scrollY), y0, "the scroll moved");
      /* Click opens it too, Esc closes it. */
      await page.click('[data-nm-tab="deportes"]');
      await page.waitForSelector('#nmFlyout:not([hidden]) .nmf-col');
      await page.keyboard.press("Escape");
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(page.url(), url0);
      await c.close();
    });
    await check("browser desktop 1366: Zapatos > Mujer > Botas navigates; the pills re-render in place; Marca + Talla stack as chips; nothing at zero; no checkbox", async () => {
      const { c, page, reqs } = await ctx(true);
      await page.goto(BASE + "/departamento.html?dept=shoes", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.hover('[data-nm-tab="zapatos"]');
      const leaf = '#nmFlyout [data-nm-col="Mujer"] a[href*="t=botas-y-botines"]';
      await page.waitForSelector(leaf, { timeout: 10000 });
      await Promise.all([page.waitForURL(/t=botas-y-botines/), page.click(leaf)]);
      assert.match(page.url(), /dept=shoes&nav=1&u=women&t=botas-y-botines/);
      await page.waitForSelector(".nf-pill[data-nf-s]", { timeout: 60000 });
      await page.waitForSelector("#nfRail .card");
      const pills = await page.$$eval(".nf-pill[data-nf-s]", (p) => p.map((x) => x.textContent));
      assert.match(pills[0], /^Todas las botas/);
      assert.ok(pills.length >= 3, pills.join(" | "));
      /* One tap on a pill: same document, new results. */
      await page.evaluate(() => { window.__same = 1; });
      const n0 = await page.textContent("#nfCount");
      await page.click(".nf-pill[data-nf-s]:not([data-nf-s=''])");
      await page.waitForFunction((n) => document.getElementById("nfCount").textContent !== n && !/Cargando/.test(document.getElementById("nfCount").textContent), n0);
      assert.equal(await page.evaluate(() => window.__same), 1, "the pill navigated");
      assert.match(page.url(), /&s=/);
      await page.click(".nf-pill[data-nf-s='']");
      await page.waitForFunction(() => !/[?&]s=/.test(location.search));
      await page.waitForFunction(() => !/Cargando/.test(document.getElementById("nfCount").textContent));
      /* Marca, then Talla: both chips, the count narrows. */
      await page.click('[data-nf-btn="b"]');
      await page.waitForSelector(".nf-pan [data-nf-b]");
      const brand = await page.$eval(".nf-pan [data-nf-b]", (b) => b.querySelector("span").textContent);
      await page.click(".nf-pan [data-nf-b]");
      await page.waitForSelector('[data-nf-x="b"]');
      await page.waitForFunction(() => !/Cargando/.test(document.getElementById("nfCount").textContent));
      /* Marca takes several: the panel stays open until «Listo». */
      assert.ok(await page.isVisible(".nf-pan [data-nf-done]"));
      await page.click(".nf-pan [data-nf-done]");
      await page.click('[data-nf-btn="z"]');
      await page.waitForSelector(".nf-pan [data-nf-z]");
      const zeros = await page.$$eval(".nf-pan button small", (s) => s.filter((x) => /^0$/.test(x.textContent.trim())).length);
      assert.equal(zeros, 0, "an option at zero is offered");
      await page.click(".nf-pan [data-nf-z]");
      await page.waitForSelector('[data-nf-x="z"]');
      await page.waitForFunction(() => !/Cargando/.test(document.getElementById("nfCount").textContent));
      await page.click(".nf-pan [data-nf-done]");
      const chips = await page.$$eval(".nf-x", (x) => x.map((e) => e.textContent));
      assert.ok(chips.some((t) => t === "Marca: " + brand), chips.join(" | "));
      assert.ok(chips.some((t) => /^Talla: /.test(t)), chips.join(" | "));
      assert.ok(chips.includes("Mujer"));
      assert.match(page.url(), /[?&]b=/); assert.match(page.url(), /[?&]z=/);
      const cards = await page.$$eval("#nfRail .card", (c) => c.length);
      assert.ok(cards > 0, "no products after stacking");
      /* Every option in every panel has products. */
      for (const k of ["f", "b", "z", "p"]) {
        const btn = await page.$(`[data-nf-btn="${k}"]`);
        if (!btn || !(await btn.isVisible())) continue;
        await btn.click();
        await page.waitForSelector(".nf-pan");
        const z = await page.$$eval(".nf-pan button small", (s) => s.filter((x) => /^0$/.test(x.textContent.trim())).length);
        assert.equal(z, 0, k + ": an option at zero");
        await page.keyboard.press("Escape");
      }
      assert.equal(await page.$$eval('input[type="checkbox"]', (x) => x.filter((e) => e.offsetParent).length), 0, "a visible checkbox");
      /* Results are one carousel: one row of cards. */
      const rows = await page.$$eval("#nfRail .card", (cs) => new Set(cs.map((c) => Math.round(c.getBoundingClientRect().top))).size);
      assert.equal(rows, 1, "cards in more than one row");
      if (SHOT) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(SHOT, "nav-desktop-botas-pills-chips.png") }); }
      /* Back walks the filters. */
      await page.goBack();
      await page.waitForFunction(() => !/[?&]z=/.test(location.search));
      await page.waitForFunction(() => !document.querySelector('[data-nf-x="z"]'));
      assert.equal(reqs.filter((u) => CATALOG_RX.test(u)).length, 0, "a catalogue file was requested");
      await c.close();
    });
    await check("browser phone 390: a tap opens the sheet, a tap outside closes it on the same page", async () => {
      const { c, page } = await ctx(false);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      const url0 = page.url();
      await page.tap('[data-nm-tab="zapatos"]');
      await flyoutOpen(page);
      const box = await page.$eval("#nmFlyout", (e) => { const r = e.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
      assert.equal(box.bottom, 844, "the sheet sits on the bottom edge");
      if (SHOT) await page.screenshot({ path: join(SHOT, "nav-phone-zapatos-sheet.png") });
      await page.tap("[data-nm-backdrop]", { position: { x: 195, y: 40 } });
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(page.url(), url0);
      /* The filter bar's panels are bottom sheets on a phone too. */
      await page.goto(BASE + "/departamento.html?dept=shoes&nav=1&u=women&t=botas-y-botines", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#nfRail .card", { timeout: 60000 });
      await page.tap('[data-nf-btn="z"]');
      await page.waitForSelector(".nf-pan [data-nf-z]");
      if (SHOT) await page.screenshot({ path: join(SHOT, "nav-phone-talla-sheet.png") });
      await page.tap("[data-nf-scrim]", { position: { x: 195, y: 60 } });
      await page.waitForSelector(".nf-pan", { state: "detached" });
      await c.close();
    });
    /* ---------- Phase 2: the same bar on every listing ---------- */
    const LISTINGS = [
      ["departamento", "/departamento.html?dept=women"],
      ["tienda", "/tienda.html?tienda=macys"],
      ["marca", "/marca.html?marca=nike"],
      ["ofertas", "/ofertas.html"],
      ["ropa-interior", "/ropa-interior.html#mujer"],
      ["search", "/search.html?q=" + encodeURIComponent("mochila") + "&resultados=1"],
    ];
    for (const [name, path] of LISTINGS) {
      await check(`browser phone 390: ${name} has the type pills and the dropdown bar; two values of one facet stack as two chips; results are one carousel; no zero option; no checkbox; no catalogue`, async () => {
        const { c, page, reqs } = await ctx(false);
        const errors = []; page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelectorAll("#nfPills .nf-pill").length > 1, null, { timeout: 60000 });
        const btns = await page.$$eval("#nfBar .nf-dd:not([hidden]) .nf-btn span", (x) => x.map((e) => e.textContent));
        assert.ok(btns.includes("Filtrar") && btns.includes("Ordenar") && btns.includes("Talla") || btns.includes("Precio"), btns.join(" | "));
        /* Two values of the multi facet the page offers: Marca, else Talla, else Precio. */
        const k = await page.evaluate(() => ["b", "z", "p"].find((k) => { const d = document.querySelector('[data-dd="' + k + '"]'); return d && !d.hidden; }));
        assert.ok(k, "no multi-value facet offered");
        await page.tap(`[data-nf-btn="${k}"]`);
        await page.waitForSelector(`.nf-pan [data-nf-${k}]`);
        assert.equal(await page.$$eval(".nf-pan button small", (s) => s.filter((x) => /^0$/.test(x.textContent.trim())).length), 0, "an option at zero");
        await page.tap(`.nf-pan [data-nf-${k}]`);
        await page.waitForFunction((k) => document.querySelectorAll('[data-nf-x="' + k + '"]').length === 1 && !/Cargando/.test(document.getElementById("nfCount").textContent), k, { timeout: 60000 });
        const second = await page.$(`.nf-pan [data-nf-${k}][aria-pressed="false"]`);
        if (second) {
          await second.tap();
          await page.waitForFunction((k) => document.querySelectorAll('[data-nf-x="' + k + '"]').length === 2 && !/Cargando/.test(document.getElementById("nfCount").textContent), k, { timeout: 60000 });
        }
        await page.tap(".nf-pan [data-nf-done]");
        await page.waitForSelector("#nfRail .card", { timeout: 60000 });
        const rows = await page.$$eval("#nfRail .card", (cs) => new Set(cs.map((x) => Math.round(x.getBoundingClientRect().top))).size);
        assert.equal(rows, 1, "cards in more than one row");
        assert.match(page.url(), new RegExp("[?&]f?" + k + "="));
        assert.equal(await page.$$eval('input[type="checkbox"]', (x) => x.filter((e) => e.offsetParent).length), 0, "a visible checkbox");
        if (SHOT) await page.screenshot({ path: join(SHOT, "nav2-" + name + ".png") });
        /* Clearing it all brings the page's own landing back. */
        const clear = await page.$("[data-nf-clear]");
        if (clear) await clear.tap(); else await page.tap('[data-nf-x]');
        await page.waitForFunction(() => !document.documentElement.classList.contains("nf-on"), null, { timeout: 60000 });
        assert.deepEqual(reqs.filter((u) => /-catalog\.json|department-cache|auto-cache\.json|catalog-index\.json|\/_fn\//.test(u)), [], "a catalogue file was requested");
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
