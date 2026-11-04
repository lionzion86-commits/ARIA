#!/usr/bin/env node
/* ==================================================================
   ONE SEARCH REGIMEN (#443 c.6621737932, c.6621809703 -- Danny on his
   phone: «Nike Jordans» answered ONE SSENSE Jordan padded with sandals
   and Off-White sneakers, while «Nike Air Force One» worked perfectly).

   Every brand / model / brand+model search follows the regimen that
   works for «nike air force one»:
     1. a COMPARISON CHART on top when the model is at 2+ stores (every
        row with its photo);
     2. an OFERTAS rail for the model / brand;
     3. ONE RAIL PER STORE, the store that has most of it first, each
        holding that store's items for the model -- the model, then the
        same brand, and nothing else. Anything else is ONE rail headed
        «También puedes ver», never silent filler inside a store's rail.
   The pins:
     - «nike jordans», «air jordan», «jordans», «jordan», «airjordan»,
       «air-jordan», «nike air jordan 1» are the Jordan set: canonical
       "jordan" (or "jordan 1"), the true count, Jordan-pure rails, the
       footwear leading (_search-core.js foldSubBrands, brandLead);
     - «nike air force one» is unchanged: the same charts, rails and counts;
     - «adidas» (the control) keeps its Ofertas and its per-store rails,
       adidas-pure;
     - a search for a brand alone lands focused on the brand
       (marca.html?marca=<key>&q=<Brand>) and draws the same regimen;
     - the header never intercepts or reroutes a search: its form goes to
       /search.html?q=, the nav menu listens to no submit.

     node scripts/test/search-regimen-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/search-regimen-tests.mjs   (also saves the 390px screenshot)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const core = await import("../../netlify/functions/_search-core.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
async function call(qs) {
  const r = await search.handler({ httpMethod: "GET", queryStringParameters: qs }, { fetchImpl });
  assert.equal(r.statusCode, 200, JSON.stringify(qs));
  return JSON.parse(r.body);
}
const ask = (q) => call({ q });
const route = (q) => call({ q, route: "1" });
const param = (url, k) => new URLSearchParams(url.split("?")[1] || "").get(k);
const brandIs = (c, rx) => rx.test(String(c.brand || "").trim());
const storeLanes = (a) => (a.lanes || []).filter((l) => /^tienda:/.test(l.key));

/* The catalogue's own Jordan count: the regimen's total must be it (one
   card per product: the same title at the same store is one product). */
const ctx = core.loadSearch({ labels: search.LABELS });
const JORDAN_ROWS = ctx.products.filter((p) => /^jordan$/i.test(p.brand)).length;

const JORDAN_FAMILY = ["nike jordans", "air jordan", "jordans", "jordan", "airjordan", "air-jordan", "Nike Jordans", "AIR JORDAN"];

await check(`the sub-brand rule: «Nike Jordan» and «Air Jordan» (a handful of products) fold into Jordan (${JORDAN_ROWS}); «Jordan Craig» and «Michael Jordan» stay themselves`, () => {
  assert.ok(JORDAN_ROWS >= 500, "Jordan rows " + JORDAN_ROWS);
  assert.equal(ctx.products.filter((p) => /^(nike jordan|air jordan)$/i.test(p.brand)).length, 0, "a sub-brand label survived");
  assert.ok(ctx.products.some((p) => p.brand === "Jordan Craig"), "Jordan Craig was folded");
  /* The rule itself, on a made-up catalogue. */
  const mk = (brand, title, n = 1) => Array.from({ length: n }, (_, i) => ({ brand, title: title + " " + i }));
  const ps = [...mk("Zed", "Zed Air Runner", 60), ...mk("Air Zed", "Runner"), ...mk("Mako", "Mako Tee", 30), ...mk("Mako Zed", "Low"),
    ...mk("Zed Craig", "Jeans", 40), ...mk("Bob Zed", "Book")];
  const { alias } = core.foldSubBrands(ps);
  assert.deepEqual([...alias.entries()].sort(), [["air zed", "zed"], ["mako zed", "zed"]]);
  assert.ok(ps.filter((p) => p.brand === "Zed").length === 62, "folded products take the big brand's name");
  assert.ok(ps.some((p) => p.brand === "Bob Zed") && ps.some((p) => p.brand === "Zed Craig"));
});

const JORDAN = new Map();
for (const q of JORDAN_FAMILY) {
  await check(`«${q}»: the Jordan set -- canonical "jordan", the true count, a chart, Ofertas, SNIPES (the most Jordans) first, every rail Jordan-pure, footwear leading`, async () => {
    const a = await ask(q);
    JORDAN.set(q, a);
    assert.equal(a.state, "results");
    assert.equal((a.canonical || a.q).toLowerCase(), "jordan");
    assert.ok(a.total >= 350 && a.total <= JORDAN_ROWS, `total ${a.total}`);
    assert.ok(a.compares.length >= 1, "no comparison chart");
    for (const c of a.compares) {
      assert.ok(c.image, "a chart without its photo");
      assert.ok(c.stores.length >= 2 && c.stores.every((s) => s.image), "a chart row without its photo");
      assert.ok(brandIs(c, /^jordan$/i), "chart of " + c.brand);
    }
    assert.equal(a.lanes[0].key, "ofertas", "the first rail is " + a.lanes[0].key);
    const st = storeLanes(a);
    assert.equal(st[0].store, "snipes", "the first store rail is " + st[0].store);
    for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].exact >= st[i].exact, `rails not biggest first: ${st[i - 1].title} ${st[i - 1].exact} < ${st[i].title} ${st[i].exact}`);
    for (const l of a.lanes.filter((x) => x.key !== "tambien")) for (const c of l.items) assert.ok(brandIs(c, /^jordan$/i), `${l.title}: ${c.brand} ${c.title}`);
    /* «the Jordan set (shoes)»: the Ofertas rail and the biggest store's rail open on shoes. */
    for (const l of [a.lanes[0], st[0]]) assert.ok(l.items.slice(0, 6).every((c) => c.category === "footwear" || /air jordan|jordan (aj|retro|\d)|spizike|6 rings|max aura|shoe|sneaker/i.test(c.title)), `${l.title} opens on ${l.items.slice(0, 6).map((c) => c.title).join(" / ")}`);
    assert.equal(a.alsoTry.length + (a.didYouMean ? 1 : 0), 0, "a suggestion on a resolved search");
  });
}

await check("«nike air jordan 1» is the Air Jordan 1: canonical \"jordan 1\", Jordan only, the model at the head of every store rail", async () => {
  const a = await ask("nike air jordan 1");
  assert.equal(a.canonical, "jordan 1");
  assert.ok(a.total >= 30, "total " + a.total);
  for (const l of a.lanes.filter((x) => x.key !== "tambien")) {
    for (const c of l.items) assert.ok(brandIs(c, /^jordan$/i), `${l.title}: ${c.brand} ${c.title}`);
    if (l.key !== "ofertas" && l.exact) assert.match(l.items[0].title, /\b(1|aj 1|aj1)\b/i, `${l.title} opens on ${l.items[0].title}`);
  }
});

await check("every Jordan form routes to the Jordan page, focused (marca.html?marca=jordan&q=Jordan; «nike air jordan 1» q=1)", async () => {
  const bad = [];
  for (const q of [...JORDAN_FAMILY, "nike air jordan 1"]) {
    const d = (await route(q)).destination;
    const want = q === "nike air jordan 1" ? "1" : "Jordan";
    if (d.kind !== "brand" || d.key !== "jordan" || param(d.href, "q") !== want) bad.push(`${q}: ${d.kind}:${d.key} ${d.href}`);
  }
  assert.deepEqual(bad, []);
});

await check("«nike air force one» is unchanged: canonical, 66 found, the '07 chart at 3 stores, SNIPES / Foot Locker / SSENSE first, every rail Nike, no «También» rail, its landing", async () => {
  const a = await ask("nike air force one");
  assert.equal(a.canonical, "nike air force 1");
  assert.equal(a.total, 66);
  assert.equal(a.compares.length, 4);
  assert.match(a.compares[0].title, /Air Force 1 '07/);
  assert.equal(a.compares[0].stores.length, 3);
  assert.deepEqual(storeLanes(a).slice(0, 3).map((l) => [l.store, l.exact]), [["snipes", 41], ["footlocker", 11], ["ssense", 8]]);
  assert.deepEqual(storeLanes(a).slice(0, 3).map((l) => l.n), [517, 47, 67]);
  for (const l of a.lanes) for (const c of l.items) assert.ok(brandIs(c, /^nike$/i), `${l.title}: ${c.brand} ${c.title}`);
  for (const l of storeLanes(a).filter((x) => x.exact)) assert.match(l.items[0].title, /air force 1/i, l.title);
  const d = (await route("nike air force one")).destination;
  assert.equal(d.url, "marca.html?marca=nike&q=air%20force%201");
});

await check("«adidas» (control): Ofertas first, one adidas rail per store biggest first, every rail adidas, a chart; the search lands focused on the brand", async () => {
  const a = await ask("adidas");
  assert.equal(a.lanes[0].key, "ofertas");
  const st = storeLanes(a);
  assert.ok(st.length >= 10, "store rails " + st.length);
  for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].exact >= st[i].exact, `${st[i - 1].title} before ${st[i].title}`);
  for (const l of a.lanes.filter((x) => x.key !== "tambien")) for (const c of l.items) assert.ok(brandIs(c, /^adidas$/i), `${l.title}: ${c.brand} ${c.title}`);
  assert.ok(a.compares.length >= 1);
  const d = (await route("adidas")).destination;
  assert.equal(d.url, "marca.html?marca=adidas");
  assert.equal(param(d.href, "q"), "adidas");
});

await check("no silent filler, as a class: across brand and model searches, a rail holds the query's brand -- anything else sits in ONE rail headed «También puedes ver», after the store rails", async () => {
  const bad = [];
  for (const [q, rx] of [["nike jordans", /^jordan$/i], ["nike air force 1", /^nike$/i], ["adidas samba", /^adidas$/i], ["converse all star", /^converse$/i],
    ["levis jeans", /^levi'?s®?$/i], ["new balance 550", /^new balance$/i], ["vans old skool", /^vans$/i], ["crocs", /^crocs$/i]]) {
    const a = await ask(q);
    const at = a.lanes.findIndex((l) => l.key === "tambien");
    if (at >= 0) {
      if (a.lanes[at].title !== "También puedes ver" || at !== a.lanes.length - 1) bad.push(`${q}: «${a.lanes[at].title}» at ${at}`);
    }
    for (const l of a.lanes.filter((x) => x.key !== "tambien")) {
      const off = l.items.filter((c) => !brandIs(c, rx));
      if (off.length) bad.push(`${q} / ${l.title}: ${off.slice(0, 2).map((c) => c.brand + " " + c.title).join("; ")}`);
    }
  }
  assert.deepEqual(bad, []);
});

await check("the header never intercepts a search: its form goes to /search.html?q=; the nav menu has no submit listener and sets no location", () => {
  const hs = readFileSync("assets/js/header-search.js", "utf8"), nm = readFileSync("assets/js/nav-menu.js", "utf8");
  assert.match(hs, /'\/search\.html\?q=' \+ encodeURIComponent\(q\)/);
  assert.match(hs, /classList\.contains\('hs-form'\)/, "the header's submit handler is not limited to its own form");
  assert.doesNotMatch(nm, /['"]submit['"]/, "nav-menu.js listens to submit");
  assert.doesNotMatch(nm, /location\.(href|assign|replace)|location\s*=/, "nav-menu.js navigates");
});

/* ------------------------- in the browser ------------------------- */
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
  const SHOT = process.env.SHOT_DIR || "";
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors };
  };
  const lanesOn = (page) => page.$$eval("#brandFocus .fc-lane", (ls) => ls.map((l) => ({
    h: l.querySelector("h2").textContent.trim(),
    brands: [...l.querySelectorAll(".card .brand")].map((x) => x.textContent.trim()),
  })));
  try {
    await check("browser 390px: «nike jordans» typed in the header search on the Nike page lands on the Jordan regimen -- Comparador, «Ofertas de Jordan», SNIPES first, Jordan only, no duplicate brand rails", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/marca.html?marca=nike`, { waitUntil: "load" });
      await page.tap(".hs-pill");
      await page.fill(".hs-in", "nike jordans");
      await page.press(".hs-in", "Enter");
      await page.waitForURL(/marca\.html\?marca=jordan&q=Jordan/, { timeout: 60000 });
      await page.waitForSelector("#brandFocus .fc-lane .card", { timeout: 60000 });
      assert.ok(await page.$$eval("#brandFocus .fc-chart", (x) => x.length) >= 1, "no Comparador");
      const lanes = await lanesOn(page);
      assert.equal(lanes[0].h, "Ofertas de Jordan");
      assert.equal(lanes[1].h, "SNIPES");
      for (const l of lanes.filter((x) => x.h !== "También puedes ver")) for (const b of l.brands) assert.match(b, /^jordan$/i, l.h + ": " + b);
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("rails")).display), "none", "the brand page's own rails repeat the regimen");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
      if (SHOT) { await page.waitForTimeout(800); await page.screenshot({ path: join(SHOT, "regimen-test-nike-jordans.png") }); }
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser 390px: «nike air force one» from the search page lands as before -- the model focus over the Nike page", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=nike%20air%20force%20one`, { waitUntil: "load" });
      await page.waitForURL(/marca\.html\?marca=nike&q=air%20force%201/, { timeout: 60000 });
      await page.waitForSelector("#brandFocus .fc-lane .card", { timeout: 60000 });
      const lanes = await lanesOn(page);
      assert.deepEqual(lanes.slice(0, 3).map((l) => l.h), ["SNIPES", "Foot Locker", "SSENSE"]);
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById("rails")).display), "none", "the Nike page below the model went away");
      assert.deepEqual(errors, []);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL " + f + "\n");
process.exit(failures.length ? 1 : 0);
