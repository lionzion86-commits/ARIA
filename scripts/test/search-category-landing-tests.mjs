#!/usr/bin/env node
/* ==================================================================
   EVERY SECTION NAME LANDS ON ITS SECTION (#443 c.6674074811).

   «tallas plus» fell to the chooser, with a JanSport backpack and a
   surfboard on its «Categoría · Ropa» rail. Danny's ruling: every section
   and category name on the site is a door to that section, never the
   chooser, and a category rail carries only its own category.

     node scripts/test/search-category-landing-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/search-category-landing-tests.mjs   (390 px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const dst = await import("../../netlify/functions/_search-destinations.js");
const { audit, PLUS_QUERIES, KNOWN_EXCEPTIONS } = await import("../audit-search-categories.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
async function route(q) {
  const r = await search.handler({ httpMethod: "GET", queryStringParameters: { q, route: "1" } }, { fetchImpl });
  assert.equal(r.statusCode, 200, q);
  return JSON.parse(r.body);
}
const NAV_PLUS = "departamento.html?dept=curvy";

await check("Tallas Plus: every name for it lands ON the Tallas Plus department (the nav's own page), accents and case aside", async () => {
  const qs = [...PLUS_QUERIES, "Tallas plus", "TALLA PLUS", "plus size", "Plus-Size", "tallas especiales", "Curvy", "tállas plus", "talla grande", "tallas grandes"];
  for (const q of qs) {
    const j = await route(q);
    assert.equal(j.destination.kind, "category", q + " -> " + j.destination.kind);
    assert.equal(j.destination.key, "curvy", q + " -> " + j.destination.key);
    assert.ok(j.destination.url.startsWith(NAV_PLUS + "&") || j.destination.url === NAV_PLUS, q + " -> " + j.destination.url);
    assert.ok(!j.chooser, q + " fell to the chooser");
  }
});

const rows = await audit(ROOT);
await check(`the class: all ${rows.length} section and category names (departments, Moda lenses, type rails, nav) land on a category, never the chooser`, () => {
  const bad = rows.filter((r) => !r.ok).map((r) => `${r.label} (${r.from}) -> ${r.kind} ${r.url}`);
  assert.deepEqual(bad, []);
  assert.ok(rows.length >= 200, "the label list is complete: " + rows.length);
});
await check("every department name lands on its own department", () => {
  for (const r of rows.filter((x) => x.from === "department")) {
    if (KNOWN_EXCEPTIONS[r.label.toLowerCase()]) continue;
    assert.equal(r.key, r.dept, r.label);
  }
});
await check("the nav tabs «Mujer», «Hombre», «Niños» open their Moda departments", async () => {
  for (const [q, k] of [["Mujer", "women"], ["hombre", "men"], ["Niños", "kids"], ["moda mujer", "women"], ["ropa de hombre", "men"]]) {
    const j = await route(q);
    assert.equal(j.destination.key, k, q);
  }
});
await check("what did not change: product words keep their type page, brands their brand page, audiences still move shoes", async () => {
  for (const [q, kind, key] of [["celular", "category", "electronics"], ["nike", "brand", "nike"], ["zapatillas mujer", "category", "shoes_women"], ["vestidos", "category", "women"], ["drone para niños", "category", "electronics"], ["sephora", "store", "sephora"]]) {
    const j = await route(q);
    assert.equal(j.destination.kind, kind, q); assert.equal(j.destination.key, key, q);
  }
  assert.match((await route("drone para niños")).destination.url, /pasillo%3Atech_drones/);
});

const NOT_CLOTHING = /\b(backpacks?|mochilas?|surfboards?|tablas?|boards?|decks?|wax|leash(es)?|fins?|traction|goggles|otg|bags?)\b/i;
await check("chooser purity: a clothing category rail carries clothing only, by the product's own type (no backpack, no surfboard)", async () => {
  /* The two products from Danny's screenshot, as the store filed them. */
  assert.equal(dst.railDeptOf({ title: "JanSport SuperBreak Plus Backpack", departments: ["clothing"] }), "");
  assert.equal(dst.railDeptOf({ title: "CJ Nelson 9.6 Parallax Plus BLACK", departments: ["clothing"] }), "");
  assert.equal(dst.railDeptOf({ title: "Women's Plus Blouse with 3/4-Length Puff Sleeves", departments: ["clothing"] }), "clothing");
  let seen = 0;
  for (const q of ["summer", "plus", "comp plus", "superbreak plus", "parallax", "pogo plus", "black", "vintage", "blorptastic"]) {
    const j = await route(q);
    for (const rail of (j.chooser && j.chooser.rails) || []) {
      if (rail.kind !== "category" || !["clothing", "women", "men", "kids", "curvy"].includes(rail.key)) continue;
      seen++;
      const bad = rail.items.filter((p) => NOT_CLOTHING.test(p.title)).map((p) => p.title);
      assert.deepEqual(bad, [], `«${q}» ${rail.title}`);
    }
  }
  assert.ok(seen >= 1, "at least one clothing rail was checked");
});

let pw = null;
try { pw = await import("playwright"); } catch { /* reported */ }
await check("browser: playwright is available", () => assert.ok(pw));
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
  try {
    for (const [q, shot] of [["tallas plus", "search-tallas-plus.png"], ["plus size", "search-plus-size.png"]]) {
      await check(`browser 390: searching «${q}» lands on the Tallas Plus department page`, async () => {
        const { c, page, errors } = await phone();
        await page.goto(`${BASE}/search.html?q=${encodeURIComponent(q)}`);
        await page.waitForURL(/departamento\.html\?dept=curvy/, { timeout: 60000 });
        await page.waitForLoadState("load");
        await page.waitForTimeout(2500);
        assert.ok(!(await page.locator("text=¿Dónde quieres buscar").count()), "no chooser");
        if (SHOT) await page.screenshot({ path: join(SHOT, shot) });
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
    await check("browser 390: an ambiguous word's chooser shows a clean «Categoría · Ropa» rail", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=summer`);
      await page.waitForSelector(".ch-lane", { timeout: 60000 });
      const lane = page.locator('.ch-lane[data-kind="category"]');
      const titles = await lane.locator(".card").allInnerTexts();
      assert.ok(titles.length > 0);
      assert.deepEqual(titles.filter((t) => NOT_CLOTHING.test(t)), []);
      if (SHOT) await page.screenshot({ path: join(SHOT, "search-chooser-ropa.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
