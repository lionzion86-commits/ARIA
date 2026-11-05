/* ==================================================================
   A PILL CHANGES THE VIEW, IN PLACE (#443 c.6635583042, c.6635642176,
   c.6635829511 -- Danny's live QA on Cabello).

   Danny tapped «Por marca», «Por tipo», «Por tienda» and the type pills
   on Cabello: nothing filtered, and the page scroll-jumped past the
   carousels to land mid-section. THE RULE, final: clicking a pill
   CHANGES THE FULL SCREEN FROM THE TOP -- the view re-renders with the
   filter applied, from the page's own data, and the shopper's scroll
   does not move (the Lencería audience switcher is the model). No anchor
   jumps, no mid-section landings, on any page.

   For every pill below, at 390px (phone, taps) and 1366px (laptop,
   clicks), tapping it:
     - leaves window.scrollY unchanged (or, for a sticky bar the shopper
       tapped from deep in the page, starts the view right under the bar:
       its top, never its middle);
     - changes the rendered products to exactly that subset (every card
       on screen belongs to the pill's own data, and the unfiltered
       carousels are gone);
     - updates the counts;
     - and clearing it («Todas» / «Todo», or the active pill again)
       returns the full set and the counts.
   Pages: Cabello (its type pills and Todo / Por tipo / Por marca / Por
   tienda / Explorar todo), a sample of every department kind (Moda
   Mujer's type and store pills, Electrónica's store pills, Zapatos'
   audience switch and views, Perfumes' doors, Belleza's Cabello pill),
   Ropa Interior, Diseñadores Latinos, a store (tienda.html), a brand
   (marca.html), Ofertas, Auto y Motos and the homepage's rail pills.
   Set PILL_SHOTS=<dir> for 390px screenshots of Cabello before and after
   a pill (pills-*.png).

     node scripts/test/pill-behavior-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = new URL("../../", import.meta.url).pathname;
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

/* ---------- the static half: no pill is an anchor ---------- */
const read = (f) => readFileSync(ROOT + f, "utf8");
await check("no pill row is a row of #anchors (dept header, Ropa Interior, Diseñadores)", () => {
  assert.doesNotMatch(read("assets/js/dept-header.js"), /href="#dh-/, "dept-header.js still draws #dh- anchors");
  assert.doesNotMatch(read("ropa-interior.html"), /<a href="#[wm]-(tipo|marca|tienda|explorar)"/, "Ropa Interior's jump bar is still anchors");
  assert.doesNotMatch(read("disenadores.html"), /<a href="#(vestidor|galeria|proximamente)"/, "Diseñadores' header still jumps");
  assert.doesNotMatch(read("departamento.html"), /data-to-refurb|scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/, "departamento.html still scroll-jumps to a rail");
  assert.doesNotMatch(read("ropa-interior.html"), /el\('explorar'\)\.scrollIntoView/, "a rail's Ver todo still scroll-jumps to Explorar todo");
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
  const SHOTS = process.env.PILL_SHOTS || "";

  /* ---------- in-page helpers ---------- */
  const HELPERS = `
    window.__pv = {
      vis: function(e){ return !!(e && e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden'; },
      key: function(href){ try { var u = new URL(href, location.href); return (u.searchParams.get('producto') || '').trim(); } catch(e){ return ''; } },
      cards: function(scope){
        var root = scope ? document.querySelector(scope) : document.body;
        if (!root) return [];
        return Array.prototype.filter.call(root.querySelectorAll('a[href*="producto.html?producto="]'), function(a){
          return __pv.vis(a) && !a.closest('header, [data-nm], .nm-fly, .nm-panel, #hsForm, .ariaNav');
        }).map(function(a){ return __pv.key(a.getAttribute('href')); }).filter(Boolean);
      },
      dec: function(s){ var t = document.createElement('textarea'); for (var i = 0; i < 2; i++){ t.innerHTML = String(s || ''); s = t.value; } return s.trim(); }
    };`;
  async function open(ctx, url, ready) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await page.route((u) => u.host !== new URL(base).host, (r) => (r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort()));
    await page.addInitScript(HELPERS);
    await page.goto(base + url, { waitUntil: "load" });
    if (ready) await page.waitForSelector(ready, { state: "visible", timeout: 30000 });
    await page.waitForTimeout(800);
    page._errs = errs;
    return page;
  }
  /* The rendered set has settled: the same cards for 700ms, nothing «Cargando…» in view. */
  async function settle(page, scope) {
    let last = "", same = 0;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const sig = await page.evaluate((s) => { const c = __pv.cards(s); const busy = /Cargando…/.test(Array.prototype.filter.call(document.querySelectorAll("p,span,h3"), __pv.vis).map((x) => x.textContent).join(" ")); return c.length + ":" + c.slice(0, 30).join("|") + (busy ? ":busy" : ""); }, scope || null);
      if (sig === last && !/:busy$/.test(sig)) { if (++same >= 3) return; } else same = 0;
      last = sig;
    }
  }
  /* Puts the pill on screen at y=160 (as far as the page allows), then taps it; the scroll before and after. */
  async function tapPill(page, sel, mobile, opts = {}) {
    const el = await page.waitForSelector(sel, { state: "visible", timeout: 20000 });
    if (!opts.noPlace) await el.evaluate((e) => { const r = e.getBoundingClientRect(); window.scrollTo(0, Math.max(0, window.scrollY + r.top - 160)); });
    await page.waitForTimeout(300);
    await el.evaluate((e) => { const row = e.parentElement; if (row && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, e.offsetLeft - 20); });
    const y0 = await page.evaluate(() => window.scrollY);
    if (mobile) await el.tap(); else await el.click();
    await settle(page, opts.scope);
    await page.waitForTimeout(200);
    const y1 = await page.evaluate(() => window.scrollY);
    return { y0, y1 };
  }
  function assertStill(where, s) {
    assert.ok(Math.abs(s.y1 - s.y0) <= 2, `${where}: the scroll moved ${s.y0} -> ${s.y1}`);
  }
  const fmt = (n) => Number(n).toLocaleString("es-PE");
  const subset = async (page, scope, keys, where) => {
    const got = await page.evaluate((s) => __pv.cards(s), scope || null);
    assert.ok(got.length > 0, `${where}: no products on screen`);
    const want = new Set(keys);
    const out = got.filter((k) => !want.has(k));
    assert.deepEqual(out.slice(0, 5), [], `${where}: ${out.length} of ${got.length} products on screen are not the pill's own (first: ${out.slice(0, 3).join(" / ")})`);
    return got;
  };
  const decKeys = (page, list) => page.evaluate((l) => l.map((c) => __pv.dec(c.t || c.title || c.name || "")), list);
  const first = (page) => page.evaluate(() => __pv.cards(null).slice(0, 12).join("|"));

  const VIEWPORTS = [
    { tag: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    { tag: "1366", viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 },
  ];

  /* ---------- departamento.html: a hub pill (a lens) and the view switch ---------- */
  async function deptLens(ctx, mobile, tag, dept, nth) {
    const page = await open(ctx, `/departamento.html?dept=${dept}`, "#hubPills .hub-pill");
    await page.waitForSelector("#dhStats:not([hidden])", { timeout: 20000 });
    const full = { cards: await first(page), stats: await page.textContent("#dhStats") };
    const pills = await page.$$eval("#hubPills .hub-pill", (bs) => bs.map((b) => b.getAttribute("data-k")).filter(Boolean));
    const ks = nth == null ? pills : [pills[Math.min(nth, pills.length - 1)]];
    for (const k of ks) {
      const s = await tapPill(page, `#hubPills .hub-pill[data-k="${k}"]`, mobile);
      assertStill(`${dept} ${tag} pill ${k}`, s);
      const lens = JSON.parse(readFileSync(ROOT + `assets/sections/departamento/${dept}/lens-${k}.json`, "utf8"));
      await subset(page, null, await decKeys(page, lens.rails.flatMap((r) => r.cards)), `${dept} ${tag} pill ${k}`);
      assert.equal(await page.isVisible("#rails"), false, `${dept} ${tag} pill ${k}: the department's carousels are still drawn under the filter`);
      assert.equal(await page.isVisible("#dhAxes"), false, `${dept} ${tag} pill ${k}: the department's axes are still drawn`);
      assert.match(await page.textContent("#lensCount"), new RegExp("^" + fmt(lens.count) + " producto"), `${dept} ${tag} pill ${k}: the lens count`);
      assert.ok(lens.stats, `${dept}/lens-${k}.json carries no stats`);
      assert.match(await page.textContent("#dhStats"), new RegExp(fmt(lens.stats.n) + "\\s*producto"), `${dept} ${tag} pill ${k}: the hero's count did not update`);
    }
    if (SHOTS && tag === "390" && dept === "cabello") await page.screenshot({ path: `${SHOTS}/pills-cabello-390-after-${ks[ks.length - 1]}.png` });
    const c = await tapPill(page, `#hubPills .hub-pill[data-k=""]`, mobile, { noPlace: true });
    assertStill(`${dept} ${tag} «Todas»`, c);
    assert.equal(await first(page), full.cards, `${dept} ${tag}: «Todas» did not bring the department back`);
    assert.equal(await page.textContent("#dhStats"), full.stats, `${dept} ${tag}: «Todas» did not bring the counts back`);
    assert.deepEqual(page._errs, []);
    await page.close();
  }
  async function deptViews(ctx, mobile, tag, dept, views) {
    const page = await open(ctx, `/departamento.html?dept=${dept}`, "#dhJump button");
    await page.waitForSelector("#dhStats:not([hidden])", { timeout: 20000 });
    await settle(page);
    if (SHOTS && tag === "390" && dept === "cabello") {
      await page.$eval("#dhJump", (e) => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 160));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/pills-cabello-390-before.png` });
    }
    const full = await first(page);
    for (const v of views) {
      const s = await tapPill(page, `#dhJump button[data-view="${v}"]`, mobile);
      assertStill(`${dept} ${tag} ${v}`, s);
      assert.equal(await page.isVisible("#rails"), false, `${dept} ${tag} ${v}: the department's carousels are still drawn`);
      if (v === "explorar") {
        const data = await page.evaluate(async (d) => (await fetch(`/.netlify/functions/department?dept=${d}&explore=1`)).json(), dept);
        await subset(page, null, await decKeys(page, data.cards), `${dept} ${tag} Explorar todo`);
        assert.equal(await page.textContent("#dhCount"), fmt(data.count) + (data.count === 1 ? " producto" : " productos"), `${dept} ${tag} Explorar todo: its count`);
      } else {
        const data = await page.evaluate(async ([d, a]) => (await fetch(`/.netlify/functions/department?dept=${d}&axis=${a}`)).json(), [dept, v]);
        await subset(page, `#dh-${v}`, await decKeys(page, data.rails.flatMap((r) => r.cards)), `${dept} ${tag} Por ${v}`);
        const all = await page.evaluate(() => __pv.cards(null).length), inside = await page.evaluate((x) => __pv.cards(x).length, `#dh-${v}`);
        assert.equal(all, inside, `${dept} ${tag} Por ${v}: ${all - inside} products outside the view`);
        assert.deepEqual(await page.$$eval(`#dh-${v} .rail-sec h2`, (hs) => hs.map((h) => h.textContent)), data.rails.map((r) => r.title), `${dept} ${tag} Por ${v}: not the axis's own carousels`);
        assert.match(await page.textContent(`#dh-${v} .dh-tally`), new RegExp("^" + fmt(data.rails.length) + " "), `${dept} ${tag} Por ${v}: its count`);
      }
      if (SHOTS && tag === "390" && dept === "cabello" && v === "marca") await page.screenshot({ path: `${SHOTS}/pills-cabello-390-after-por-marca.png` });
    }
    const c = await tapPill(page, `#dhJump button[data-view=""]`, mobile, { noPlace: true });
    assertStill(`${dept} ${tag} «Todo»`, c);
    assert.equal(await page.isVisible("#rails"), true, `${dept} ${tag}: «Todo» did not bring the carousels back`);
    assert.equal(await first(page), full, `${dept} ${tag}: «Todo» did not bring the department back`);
    assert.deepEqual(page._errs, []);
    await page.close();
  }

  for (const V of VIEWPORTS) {
    const ctx = await browser.newContext(V);
    const mobile = !!V.isMobile, tag = V.tag;

    await check(`${tag}: Cabello -- every type pill filters in place (only its products, the hero's counts), «Todas» brings it all back, the scroll never moves`, () => deptLens(ctx, mobile, tag, "cabello", null));
    await check(`${tag}: Cabello -- Por tipo / Por marca / Por tienda / Explorar todo replace the view under the bar (never a jump), «Todo» brings it back`, () => deptViews(ctx, mobile, tag, "cabello", ["tipo", "marca", "tienda", "explorar"]));
    await check(`${tag}: Moda Mujer -- a type pill and a store pill filter in place`, async () => { await deptLens(ctx, mobile, tag, "women", 0); await deptLens(ctx, mobile, tag, "women", 99); });
    await check(`${tag}: Electrónica -- a store pill filters in place`, () => deptLens(ctx, mobile, tag, "electronics", 1));
    await check(`${tag}: Belleza -- the Cabello pill filters in place`, () => deptLens(ctx, mobile, tag, "beauty", 0));
    await check(`${tag}: Zapatos -- Por marca and Por tienda replace the view in place`, () => deptViews(ctx, mobile, tag, "shoes", ["marca", "tienda"]));

    await check(`${tag}: Zapatos -- the audience switch (the model) re-renders in place, «Todo» brings it back`, async () => {
      const page = await open(ctx, "/departamento.html?dept=shoes", "#dhAud button");
      await page.waitForSelector("#dhStats:not([hidden])", { timeout: 20000 });
      await settle(page);
      const full = { cards: await first(page), stats: await page.textContent("#dhStats") };
      const s = await tapPill(page, '#dhAud button[data-u="women"]', mobile);
      assertStill(`shoes ${tag} Mujer`, s);
      const head = await page.evaluate(async () => (await fetch("/.netlify/functions/department?dept=shoes&u=women")).json());
      await subset(page, "#rails", await decKeys(page, head.rails.flatMap((r) => r.cards || [])), `shoes ${tag} Mujer (first carousels)`);
      assert.match(await page.textContent("#dhStats"), new RegExp(fmt(head.stats.n) + "\\s*producto"));
      const c = await tapPill(page, '#dhAud button[data-u=""]', mobile, { noPlace: true });
      assertStill(`shoes ${tag} Todo`, c);
      assert.equal(await page.textContent("#dhStats"), full.stats);
      assert.equal(await first(page), full.cards);
      await page.close();
    });

    await check(`${tag}: Perfumes -- a door pill re-renders the room in place, «Todos» brings it back`, async () => {
      const page = await open(ctx, "/departamento.html?dept=perfumes", "#pDoors .hub-pill");
      await settle(page);
      const full = { cards: await first(page), stats: await page.textContent("#dhStats") };
      const s = await tapPill(page, "#pDoors .hub-pill:nth-child(2)", mobile);
      assertStill(`perfumes ${tag} door`, s);
      const a = await page.evaluate(() => new URL(location.href).searchParams.get("a"));
      const head = await page.evaluate(async (x) => (await fetch(`/.netlify/functions/department?dept=perfumes&a=${x}`)).json(), a);
      await subset(page, "#rails", await decKeys(page, head.rails.flatMap((r) => r.cards || [])), `perfumes ${tag} door ${a} (first carousels)`);
      assert.match(await page.textContent("#dhStats"), new RegExp(fmt(head.stats.n) + "\\s*producto"));
      const c = await tapPill(page, "#pDoors .hub-pill:nth-child(1)", mobile, { noPlace: true });
      assertStill(`perfumes ${tag} Todos`, c);
      assert.equal(await page.textContent("#dhStats"), full.stats);
      await page.close();
    });

    /* ---------- Ropa Interior: the doors (the model) and the view switch ---------- */
    await check(`${tag}: Ropa Interior -- Por tipo / Por marca / Por tienda / Explorar todo replace Mujer's view in place; from deep in the page the view starts right under the sticky bar`, async () => {
      const page = await open(ctx, "/ropa-interior.html", "#w-jump button");
      await settle(page);
      const full = await first(page);
      for (const v of ["tipo", "marca", "tienda", "explorar"]) {
        const s = await tapPill(page, `#w-jump button[data-view="${v}"]`, mobile);
        assertStill(`ropa interior ${tag} ${v}`, s);
        const all = await page.evaluate(() => __pv.cards(null).length), inside = await page.evaluate((x) => __pv.cards(x).length, `#w-${v}`);
        assert.ok(inside > 0 && all === inside, `ropa interior ${tag} ${v}: ${all - inside} of ${all} products outside the view`);
        if (v === "explorar") assert.match(await page.textContent("#w-count"), /^\d[\d,.]* productos en oferta$/);
      }
      const c = await tapPill(page, '#w-jump button[data-view=""]', mobile, { noPlace: true });
      assertStill(`ropa interior ${tag} Todo`, c);
      assert.equal(await first(page), full, `ropa interior ${tag}: «Todo» did not bring every axis back`);
      /* Deep in Mujer (the bar is stuck): the view starts at its top, under the bar. */
      await page.$eval("#w-tienda", (e) => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top + 400));
      await page.waitForTimeout(400);
      const y0 = await page.evaluate(() => window.scrollY);
      const b = await page.$('#w-jump button[data-view="marca"]');
      if (mobile) await b.tap(); else await b.click();
      await page.waitForTimeout(500);
      const at = await page.evaluate(() => ({ y: window.scrollY, bar: document.getElementById("w-jump").getBoundingClientRect().bottom, top: document.getElementById("w-main").getBoundingClientRect().top }));
      assert.ok(at.y < y0 && Math.abs(at.top - at.bar) <= 2, `ropa interior ${tag}: from deep in the page the view does not start under the bar: ${JSON.stringify({ y0, ...at })}`);
      assert.deepEqual(page._errs, []);
      await page.close();
    });

    /* ---------- Diseñadores Latinos: designer chips, type tiles, the header's views ---------- */
    await check(`${tag}: Diseñadores -- a designer chip and a type tile filter the gallery in place; clearing brings it back`, async () => {
      const page = await open(ctx, "/disenadores.html", "#designerChips .chip:nth-child(2)");
      await settle(page);
      const full = await page.$$eval("#galeria .room", (rs) => rs.map((r) => r.getAttribute("data-room")).join("|"));
      const chip = await page.$eval("#designerChips .chip:nth-child(3)", (b) => ({ k: b.getAttribute("data-d"), n: Number((b.querySelector(".n") || {}).textContent || 0) }));
      const s = await tapPill(page, "#designerChips .chip:nth-child(3)", mobile);
      assertStill(`diseñadores ${tag} chip`, s);
      const rooms = await page.$$eval("#galeria .room", (rs) => rs.filter((r) => r.getClientRects().length).map((r) => ({ d: r.getAttribute("data-designer"), n: Number((r.querySelector(".show-all") || { getAttribute: () => 0 }).getAttribute("data-count")) })));
      assert.ok(rooms.length === 1 && rooms[0].d === chip.k, `diseñadores ${tag}: the chip shows ${JSON.stringify(rooms)}`);
      if (rooms[0].n) assert.equal(rooms[0].n, chip.n, `diseñadores ${tag}: the room's count is not the chip's`);
      const c = await tapPill(page, "#designerChips .chip:nth-child(1)", mobile, { noPlace: true });
      assertStill(`diseñadores ${tag} Todo`, c);
      assert.equal(await page.$$eval("#galeria .room", (rs) => rs.map((r) => r.getAttribute("data-room")).join("|")), full);
      const t = await page.$eval("#typeTiles .tile:nth-child(2)", (b) => b.getAttribute("data-t"));
      const s2 = await tapPill(page, "#typeTiles .tile:nth-child(2)", mobile);
      assertStill(`diseñadores ${tag} tile`, s2);
      const rs2 = await page.$$eval("#galeria .room", (rs) => rs.map((r) => r.getAttribute("data-room")));
      assert.ok(rs2.length && rs2.every((r) => r.endsWith("-" + t)), `diseñadores ${tag}: the ${t} tile shows ${rs2.join(", ")}`);
      const c2 = await tapPill(page, "#typeTiles .tile:nth-child(2)", mobile, { noPlace: true });
      assertStill(`diseñadores ${tag} tile off`, c2);
      assert.equal(await page.$$eval("#galeria .room", (rs) => rs.map((r) => r.getAttribute("data-room")).join("|")), full);
      if (!mobile) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const s3 = await tapPill(page, '.inpage-nav button[data-view="disenadores"]', false, { noPlace: true });
        assertStill(`diseñadores ${tag} header view`, s3);
        assert.equal(await page.isVisible("#vestidor"), false);
        assert.equal(await page.isVisible("#galeria"), true);
        await tapPill(page, '.inpage-nav button[data-view="disenadores"]', false, { noPlace: true });
        assert.equal(await page.isVisible("#vestidor"), true);
      }
      assert.deepEqual(page._errs, []);
      await page.close();
    });

    /* ---------- a store and a brand: the type pills (nav-filter) and the page's own pills ---------- */
    async function nfCase(url, where) {
      const page = await open(ctx, url, "#nfPills .nf-pill:nth-child(3)");
      await settle(page);
      const full = await first(page);
      const s = await tapPill(page, "#nfPills .nf-pill:nth-child(3)", mobile);
      assertStill(`${where} ${tag} type pill`, s);
      const data = await page.evaluate(async () => (await fetch(window.AriaNF.url())).json());
      const got = await subset(page, null, await decKeys(page, data.cards), `${where} ${tag} type pill`);
      assert.equal(got.length, await page.evaluate(() => __pv.cards("#nfRail").length), `${where} ${tag}: products outside the results`);
      assert.equal(await page.textContent("#nfCount"), fmt(data.count) + (data.count === 1 ? " producto" : " productos"), `${where} ${tag}: the count`);
      const c = await tapPill(page, '#nfPills .nf-pill[data-nf-t=""]', mobile, { noPlace: true });
      assertStill(`${where} ${tag} Todo`, c);
      assert.equal(await first(page), full, `${where} ${tag}: «Todo» did not bring the page back`);
      assert.deepEqual(page._errs, []);
      return page;
    }
    await check(`${tag}: a store (Macy's) -- a type pill filters in place, «Todo» brings the store back`, async () => {
      const page = await nfCase("/tienda.html?tienda=macys", "macys");
      /* The store's own chip row (its departments) filters in place too. */
      const full = await first(page);
      const s = await tapPill(page, "#deptChips .chip:nth-child(3)", mobile);
      assertStill(`macys ${tag} chip`, s);
      assert.notEqual(await first(page), full, `macys ${tag}: the chip changed nothing`);
      assert.match(await page.textContent("#countLine"), /^\d[\d,.]* productos? en /);
      const c = await tapPill(page, "#deptChips .chip:nth-child(1)", mobile, { noPlace: true });
      assertStill(`macys ${tag} chip Todo`, c);
      assert.equal(await first(page), full);
      await page.close();
    });
    await check(`${tag}: a brand (Nike) -- a type pill and a store pill filter in place`, async () => {
      const page = await nfCase("/marca.html?marca=Nike", "nike");
      const full = await first(page);
      const s = await tapPill(page, "#brandPills button:nth-child(2)", mobile);
      assertStill(`nike ${tag} store pill`, s);
      assert.notEqual(await first(page), full, `nike ${tag}: the store pill changed nothing`);
      const secs = await page.$$eval("#salesTop .rail-section, #rails .rail-section", (ss) => ss.filter((x) => x.getClientRects().length).length);
      assert.equal(secs, 1, `nike ${tag}: ${secs} carousels on screen under one pill (the brand's Ofertas still showing?)`);
      const c = await tapPill(page, "#brandPills button:nth-child(1)", mobile, { noPlace: true });
      assertStill(`nike ${tag} store pill Todo`, c);
      assert.equal(await first(page), full);
      await page.close();
    });

    /* ---------- Ofertas: the view pills and the category pills ---------- */
    await check(`${tag}: Ofertas -- Por categoría and a category pill re-render in place, «Todas» brings it back`, async () => {
      const page = await open(ctx, "/ofertas.html", "#mode [data-mode]");
      await settle(page);
      const s = await tapPill(page, '#mode [data-mode="categoria"]', mobile);
      assertStill(`ofertas ${tag} Por categoría`, s);
      await settle(page);
      const full = { cards: await first(page), count: await page.textContent("#countLine") };
      const s2 = await tapPill(page, "#cats button:nth-child(3)", mobile);
      assertStill(`ofertas ${tag} category`, s2);
      const all = await page.evaluate(() => __pv.cards(null).length), inside = await page.evaluate(() => __pv.cards("#results").length);
      assert.ok(inside > 0 && all === inside, `ofertas ${tag}: ${all - inside} products outside the category's results`);
      assert.notEqual(await page.textContent("#countLine"), full.count, `ofertas ${tag}: the count did not change`);
      const c = await tapPill(page, "#cats button:nth-child(1)", mobile, { noPlace: true });
      assertStill(`ofertas ${tag} Todas`, c);
      assert.equal(await first(page), full.cards);
      await page.close();
    });

    /* ---------- Auto y Motos ---------- */
    await check(`${tag}: Motos -- a type chip filters in place, «Todo» brings it back`, async () => {
      const page = await open(ctx, "/motos.html", "#typeChips .chip:nth-child(2)");
      await settle(page);
      const full = { cards: await first(page), count: await page.textContent("#count") };
      const s = await tapPill(page, "#typeChips .chip:nth-child(2)", mobile);
      assertStill(`motos ${tag} type`, s);
      assert.notEqual(await first(page), full.cards);
      assert.notEqual(await page.textContent("#count"), full.count);
      const c = await tapPill(page, "#typeChips .chip:nth-child(1)", mobile, { noPlace: true });
      assertStill(`motos ${tag} Todo`, c);
      assert.equal(await first(page), full.cards);
      await page.close();
    });

    /* ---------- the homepage: each rail's pills swap that rail in place ---------- */
    if (mobile) await check(`${tag}: homepage -- a category carousel's store pill, a store rail's aisle pill and an audience carousel's type pill swap their rail in place`, async () => {
      const page = await open(ctx, "/", null);
      const rows = [["#mobileShopfront .hcp", 'button[data-hcp]:not([data-hcp=""])', 'button[data-hcp=""]'], ["#mobileShopfront .srp", 'button[data-srp]:not([data-srp=""])', 'button[data-srp=""]'],
        ['#mobileShopfront [data-pill-shelf="mujer"] [data-pill-row]', "button:nth-child(2)", "button:nth-child(1)"]];
      const railOf = (b) => { const bar = b.closest(".hcp, .srp, [data-pill-row]"); return bar.matches(".hcp") ? bar.parentNode.querySelector('[data-cat-pills="' + bar.getAttribute("data-cat-pills-bar") + '"]') : bar.matches("[data-pill-row]") ? bar.closest("section").querySelector("[data-pill-rail]") : bar.nextElementSibling; };
      for (const [row, pill, clear] of rows) {
        const sel = row + " " + pill;
        for (let i = 0; i < 80 && !(await page.$(sel)); i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(150); }
        const b = await page.waitForSelector(sel, { timeout: 30000 });
        await b.evaluate((e) => e.closest("section").scrollIntoView({ block: "center" }));
        await page.waitForTimeout(2000);
        const rail = () => page.$eval(sel, (e, f) => { const x = new Function("return " + f)()(e); return Array.prototype.map.call(x.children, (c) => c.getAttribute("data-pdp") || c.getAttribute("href") || ((i) => i && (i.getAttribute("data-src") || i.getAttribute("src")))(c.querySelector("img")) || c.textContent.replace(/[‹›\s]+/g, " ").trim().slice(0, 40)).join("|"); }, railOf.toString());
        const before = await rail();
        const y0 = await page.evaluate(() => window.scrollY);
        await (await page.$(sel)).tap();
        await page.waitForFunction(([s, f, b0]) => { const e = document.querySelector(s); const x = new Function("return " + f)()(e); return Array.prototype.map.call(x.children, (c) => c.getAttribute("data-pdp") || c.getAttribute("href") || ((i) => i && (i.getAttribute("data-src") || i.getAttribute("src")))(c.querySelector("img")) || c.textContent.replace(/[‹›\s]+/g, " ").trim().slice(0, 40)).join("|") !== b0; }, [sel, railOf.toString(), before], { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(400);
        assertStill(`homepage ${row}`, { y0, y1: await page.evaluate(() => window.scrollY) });
        assert.notEqual(await rail(), before, `homepage ${row}: the pill changed nothing`);
        const y2 = await page.evaluate(() => window.scrollY);
        await (await page.$(row + " " + clear)).tap();
        await page.waitForFunction(([s, f, b0]) => { const e = document.querySelector(s); const x = new Function("return " + f)()(e); return Array.prototype.map.call(x.children, (c) => c.getAttribute("data-pdp") || c.getAttribute("href") || ((i) => i && (i.getAttribute("data-src") || i.getAttribute("src")))(c.querySelector("img")) || c.textContent.replace(/[‹›\s]+/g, " ").trim().slice(0, 40)).join("|") === b0; }, [sel, railOf.toString(), before], { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(400);
        assertStill(`homepage ${row} back`, { y0: y2, y1: await page.evaluate(() => window.scrollY) });
        { const now = await rail(); const a1 = now.split("|"), b1 = before.split("|"); assert.equal(now, before, `homepage ${row}: the first pill did not put the rail back (${a1.length} vs ${b1.length} cards; first diff at ${a1.findIndex((x, i) => x !== b1[i])}: ${a1.find((x, i) => x !== b1[i])} / ${b1.find((x, i) => x !== a1[i])})`); }
      }
      await page.close();
    });
    await ctx.close();
  }
  await browser.close(); server.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
