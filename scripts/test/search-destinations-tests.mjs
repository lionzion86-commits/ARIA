#!/usr/bin/env node
/* ==================================================================
   THE SEARCH DESTINATION GUARDRAIL (#443 c.6569512697, c.6569515583,
   c.6569529913 -- Danny, "100%").

   Every search lands on a STORE page, a BRAND page or a CATEGORY page --
   or, when the matcher cannot decide, on search.html's CHOOSER (at most
   three rails, each a door to one of those surfaces). Never a pooled
   grid, never a results wall. A resolved landing carries the other close
   matches as «También puede ser…» chips.

     node scripts/test/search-destinations-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/search-destinations-tests.mjs   (also saves the 390px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const dept = await import("../../netlify/functions/_department-core.js");
const dst = await import("../../netlify/functions/_search-destinations.js");
const PAGE = readFileSync(join(ROOT, "search.html"), "utf8");
const DEST = JSON.parse(readFileSync(join(ROOT, dst.DEST_FILE), "utf8"));

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
const param = (url, k) => new URLSearchParams(url.split("?")[1] || "").get(k);

/* The battery: query -> the kind it must land on. */
const BATTERY = [
  ["sephora", "store"], ["sepho", "store"], ["Victoria's Secret", "store"], ["walmart", "store"], ["foot locker", "store"],
  ["kohls", "store"], ["calzed", "store"], ["tienda sephora", "store"], ["gap hoodie", "store"], ["crocs", "store"],
  ["new balance", "store"], ["sephorra", "store"],
  ["nike", "brand"], ["adidas", "brand"], ["converse", "brand"], ["skechers", "brand"], ["under armour", "brand"],
  ["disney", "brand"], ["adiddas", "brand"], ["nikee", "brand"],
  ["nike air force 1", "brand"], ["air force 1", "brand"], ["converse all star", "brand"], ["adidas samba", "brand"],
  ["samba", "brand"], ["airpods", "brand"], ["zapatillas nike", "brand"], ["levis jeans", "brand"], ["jordan 1", "brand"],
  ["vestidos", "category"], ["dresses", "category"], ["zapatillas", "category"], ["sneakers", "category"], ["laptops", "category"],
  ["juguetes", "category"], ["toys", "category"], ["pesas", "category"], ["dumbbells", "category"], ["perfumes", "category"],
  ["perfume mujer", "category"], ["lentes de sol", "category"], ["sunglasses", "category"], ["polos hombre", "category"],
  ["cartera cuero", "category"], ["zapatillas mujer", "category"], ["lego", "category"], ["barbie", "category"],
  ["maybelline", "category"], ["juguetez", "category"], ["lapto", "category"], ["vestido rojo", "category"], ["libros", "category"],
  ["pesca submarina", "category"], ["boxeo", "category"],
  ["iphone 15 case", "chooser"], ["unicornio", "chooser"], ["taza", "chooser"], ["zapatix", "chooser"],
  ["blorptastic", "chooser"], ["qwrtplk", "chooser"], ["a", "chooser"],
];
/* Verified to name no store, no brand and no category (the acceptance's miss-words). */
const MISS_WORDS = ["blorptastic", "qwrtplk"];

const ANSWERS = new Map();
await check(`the battery (${BATTERY.length} queries): every one lands on a store, a brand, a category or the chooser -- the kind it should`, async () => {
  const bad = [];
  for (const [q, want] of BATTERY) {
    const a = await route(q);
    ANSWERS.set(q, a);
    const d = a.destination;
    if (!["store", "brand", "category", "chooser"].includes(d.kind)) bad.push(`${q}: ${d.kind}`);
    else if (d.kind !== want) bad.push(`${q}: ${d.kind}:${d.key} (want ${want})`);
  }
  assert.deepEqual(bad, []);
  assert.ok(BATTERY.length >= 40);
});

await check("every landing is a built surface: a storefront, a brand head, a department (with a type lens it has); the url says only that", async () => {
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    if (d.kind === "chooser") continue;
    assert.match(d.url, dst.SURFACE_RX, q);
    assert.ok(d.href.startsWith(d.url), q);
    if (d.kind === "store") { assert.ok(DEST.stores[d.key], q); assert.ok(JSON.parse(readFileSync(join(ROOT, "assets/tienda", d.key, "index.json"), "utf8")).count > 0, q); }
    if (d.kind === "brand") assert.ok(existsSync(join(ROOT, "assets/sections/marca", d.key + ".json")), q);
    if (d.kind === "category") {
      assert.ok(DEST.depts[d.key], q);
      const t = param(d.url, "t");
      if (t) assert.ok(DEST.depts[d.key][1] && DEST.depts[d.key][1][t], `${q}: ${d.key} has no lens ${t}`);
    }
  }
});

await check("a category landing's narrowing (t, a, q) still finds products on that department page", async () => {
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    if (d.kind !== "category") continue;
    const qs = { dept: d.key };
    for (const k of ["t", "a", "q"]) if (param(d.url, k)) qs[k] = param(d.url, k);
    const r = dept.answer(qs);
    if (r.status === 404 && /ropa_interior/.test(d.key)) continue; // departamento.html sends these to ropa-interior.html
    assert.equal(r.status, 200, q);
    assert.ok(r.body.count > 0, `${q}: ${d.url} shows nothing`);
  }
});

await check("a brand + model lands on the brand page focused on the model, and the focus finds it at the stores (Comparador / rails)", async () => {
  for (const q of ["nike air force 1", "air force 1", "converse all star", "adidas samba"]) {
    const d = ANSWERS.get(q).destination;
    assert.ok(d.q, `${q}: no model on ${d.url}`);
    const label = DEST.brands[d.key][0];
    const r = JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q: label + " " + d.q, page: "1" } }, { fetchImpl })).body);
    assert.ok((r.lanes || []).some((l) => l.store), `${q}: the focus has no store rail`);
  }
  assert.equal(ANSWERS.get("air force 1").destination.key, "nike");
  assert.equal(ANSWERS.get("converse all star").destination.url, "marca.html?marca=converse&q=all%20star");
});

await check("«También puede ser…» rides on a resolved landing: other close matches, each a door to a surface, on the url as &tp=", async () => {
  let carried = 0;
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    if (d.kind === "chooser") { assert.deepEqual(a.alternatives, [], q); continue; }
    assert.ok(a.alternatives.length <= dst.ALT_MAX, q);
    for (const x of a.alternatives) {
      assert.match(x.url, dst.SURFACE_RX, `${q}: ${x.url}`);
      assert.ok(!(x.kind === d.kind && x.key === d.key), `${q}: the landing offered as its own alternative`);
    }
    if (a.alternatives.length) {
      carried++;
      const tp = JSON.parse(param(d.href, "tp"));
      assert.deepEqual(tp, a.alternatives.map((x) => [x.kind, x.label, x.url]), q);
    }
  }
  assert.ok(carried >= 30, `only ${carried} landings carry alternatives`);
  const crocs = ANSWERS.get("crocs");
  assert.ok(crocs.alternatives.some((x) => x.kind === "brand" && x.key === "crocs"), "Crocs the store offers Crocs the brand");
});

await check("the chooser: at most three rails -- store, brand, category, one each -- each with a door to its own page; a miss gets entry doors", async () => {
  for (const [q, a] of ANSWERS) {
    if (a.destination.kind !== "chooser") continue;
    const rails = a.chooser.rails;
    assert.ok(rails.length >= 1 && rails.length <= 3, `${q}: ${rails.length} rails`);
    if (rails[0].kind === "entry") {
      assert.deepEqual(rails.map((r) => r.url), ["ofertas.html", "tiendas.html", "categorias.html"], q);
      continue;
    }
    const kinds = rails.map((r) => r.kind);
    assert.equal(new Set(kinds).size, kinds.length, `${q}: two rails of one kind`);
    for (const r of rails) {
      assert.ok(["store", "brand", "category"].includes(r.kind), q);
      assert.match(r.url, dst.SURFACE_RX, `${q}: ${r.url}`);
      assert.match(r.door, /^Ver todo en /, q);
      assert.ok(r.items.length > 0 && r.items.length <= dst.RAIL_ITEMS, `${q}: ${r.kind} rail has ${r.items.length} cards`);
    }
  }
});

await check(`the miss-words (${MISS_WORDS.join(", ")}): no store, no brand, no category, nothing found -- the chooser's entry doors`, async () => {
  for (const w of MISS_WORDS) {
    const a = ANSWERS.get(w) || await route(w);
    assert.equal(a.destination.kind, "chooser", w);
    assert.equal(a.chooser.reason, "doors", w);
    const D = dst.destinations({ _dest: null, ...{} }, undefined);
    assert.equal(dst.storeOf(D, w), null, w);
    assert.ok(!D.brandNames.has(dst.nameKey(w)), w);
    assert.equal(dst.categoryOfQuery(D, w), null, w);
    const r = JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q: w, page: "1" } }, { fetchImpl })).body);
    assert.equal(r.state, "none", `${w}: the engine finds ${r.total}`);
  }
});

await check("the surfaces list is current (node scripts/build-search-destinations.mjs) and ships with the search function", () => {
  execFileSync(process.execPath, [join(ROOT, "scripts/build-search-destinations.mjs"), "--check"], { stdio: "pipe" });
  assert.match(readFileSync(join(ROOT, "netlify.toml"), "utf8"), /\[functions\."search"\]\s*\n\s*included_files = \[[^\]]*"assets\/search\/destinations\.json"/);
});

await check("search.html asks the router before anything else and draws no results wall: ?resultados=1 is the only way to the old answer, and no page links to it", () => {
  const fn = PAGE.slice(PAGE.indexOf("async function doSearch()"), PAGE.indexOf("function renderAnswer("));
  const routeAt = fn.indexOf("routeFor(query"), fetchAt = fn.indexOf("fetchPage(query, 1)");
  assert.ok(routeAt > 0 && fetchAt > routeAt, "doSearch does not route first");
  assert.match(fn, /if \(!keepPlainSearch\(\)\)\{[\s\S]*?return;\n  \}/, "the routed branch does not end the search");
  assert.match(fn, /location\.replace\(d\.href \|\| d\.url\)/);
  assert.match(fn, /renderChooser\(query, route\)/);
  for (const f of readdirSync(ROOT).filter((n) => n.endsWith(".html") && n !== "search.html")) {
    assert.ok(!/resultados=1/.test(readFileSync(join(ROOT, f), "utf8")), `${f} links to the plain results`);
  }
  for (const f of ["assets/js/tambien.js", "assets/js/marca-focus.js"]) assert.ok(!/resultados=1/.test(readFileSync(join(ROOT, f), "utf8")), f);
  for (const f of ["tienda.html", "marca.html", "departamento.html"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /<script src="\/assets\/js\/tambien\.js" defer><\/script>/, f);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE + readFileSync(join(ROOT, "assets/js/tambien.js"), "utf8") + readFileSync(join(ROOT, "assets/js/marca-focus.js"), "utf8")), "an emoji");
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
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors };
  };
  const SHOT = process.env.SHOT_DIR || "";
  try {
    await check(`browser: a miss-word (search.html?q=${MISS_WORDS[0]}) shows the chooser -- three entry doors, no grid, no cards`, async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${MISS_WORDS[0]}`);
      await page.waitForSelector(".ch-head", { timeout: 60000 });
      const doors = await page.$$eval(".ch-door", (a) => a.map((x) => x.getAttribute("href")));
      assert.deepEqual(doors, ["ofertas.html", "tiendas.html", "categorias.html"]);
      assert.equal(await page.$$eval("#results .card", (x) => x.length), 0);
      assert.match(await page.textContent(".ch-head h2"), /No encontramos/);
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-chooser.png"), fullPage: true });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser: a low-confidence query (search.html?q=iphone 15 case) shows at most three rails, each with its door", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${encodeURIComponent("iphone 15 case")}`);
      await page.waitForSelector(".ch-lane", { timeout: 60000 });
      const lanes = await page.$$eval(".ch-lane", (ls) => ls.map((l) => ({ kind: l.getAttribute("data-kind"), door: l.querySelector(".lane-door").getAttribute("href"), cards: l.querySelectorAll(".card").length })));
      assert.ok(lanes.length >= 1 && lanes.length <= 3);
      for (const l of lanes) { assert.match(l.door, dst.SURFACE_RX); assert.ok(l.cards > 0); }
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-chooser-low.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser: «nike air force 1» lands on marca.html (Nike), focused on the model -- Comparador + store rails -- with «También puede ser…»", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${encodeURIComponent("nike air force 1")}`);
      await page.waitForURL(/marca\.html\?marca=nike&q=air%20force%201&tp=/, { timeout: 60000 });
      await page.waitForSelector("#tpRow a", { timeout: 30000 });
      await page.waitForSelector("#brandFocus .fc-lane", { timeout: 60000 });
      const chips = await page.$$eval("#tpRow a", (a) => a.map((x) => x.getAttribute("href")));
      assert.ok(chips.length >= 1);
      for (const h of chips) assert.match(h, dst.SURFACE_RX);
      assert.match(await page.textContent("#tpRow"), /También puede ser/);
      assert.ok(await page.$("#brandFocus .fc-chart"), "no Comparador for Air Force 1");
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-tambien.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser: «vestidos» lands on Moda Mujer · Vestidos (departamento.html, t=vestidos) with the chips under the hero; «sephora» on its store", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=vestidos`);
      await page.waitForURL(/departamento\.html\?dept=women&t=vestidos&tp=/, { timeout: 60000 });
      await page.waitForSelector("#tpRow a", { timeout: 30000 });
      assert.ok(await page.evaluate(() => document.getElementById("deptHero").nextElementSibling.id === "tpRow"), "the chips are not under the hero");
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-tambien-dept.png") });
      await page.goto(`${BASE}/search.html?q=sephora`);
      await page.waitForURL(/tienda\.html\?tienda=sephora/, { timeout: 60000 });
      await page.waitForSelector("#tpRow a", { timeout: 30000 });
      assert.deepEqual(errors, []);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (process.env.TABLE) {
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    const where = d.kind === "chooser" ? a.chooser.rails.map((r) => r.kind + ":" + r.key).join(" + ") : d.url;
    console.log(`| ${q} | ${d.kind} | ${d.kind === "chooser" ? d.key : d.key} | ${where} | ${a.alternatives.map((x) => x.kind + ":" + x.key).join(", ")} |`);
  }
}
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
