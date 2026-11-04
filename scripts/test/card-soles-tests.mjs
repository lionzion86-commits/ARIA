#!/usr/bin/env node
/* ==================================================================
   THE CARD IS IN SOLES, AND SO IS ITS IMP LINE (#443 c.6629785432,
   c.6629812301). Danny: "we only show soles. Then we show the import
   underneath." His Diseñador screenshots read «US$ 119.41» and
   «+ US$ 156.84 IMP»: every card page fell back to dollars whenever the
   exchange-rate endpoint gave no rate, and a failed answer was cached
   for a day.

   1. THE RATE. netlify/functions/exchange-rate.js: SUNAT -> its last good
      answer from the "fx" store (stale: true, ten-minute cache) -> an
      error that is never cached. orders-create never charges on a stale
      rate; checkout never caches one as today's.
   2. STATIC. Every card price formatter on the site draws soles only:
      no dollar formatter, no dollar reference line; the pages ask the
      shared rate (/import-tax.js AriaImportTax.fx).
   3. THE SURFACES AT 390px, three ways: the rate fresh; the endpoint
      down with a days-old rate on the phone; the endpoint down on a
      phone that never had one, then back. Diseñador, Mujer, a store
      (SSENSE), a multi-brand store with brand rails (Macy's), a brand
      (Marc Jacobs), search, the homepage rails, Lencería, Ofertas,
      Diseñadores Latinos and a product page's rails. No card shows a
      dollar figure; every IMP line reads «+ S/ … IMP»; a placeholder
      fills in place once a rate lands.

     node scripts/test/card-soles-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/card-soles-tests.mjs   (also saves card-soles-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(ROOT);
await import("../../import-tax.js");
const T = globalThis.AriaImportTax;
const VENTA = 3.75;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message); }
}

/* ------------------------------------------------------------------
   1. THE RATE.
   ------------------------------------------------------------------ */
const FX = await import("../../netlify/functions/exchange-rate.js");
function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), setJSON: async (k, v) => { m.set(k, v); } };
}
const sunatOk = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ compra: 3.73, venta: 3.75, origen: "SUNAT", fecha: "2026-11-04" }) });
const sunat429 = async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ message: "Too many requests" }) });
const sunatHtml = async () => ({ ok: true, status: 200, text: async () => "<html>down</html>" });
const sunatThrows = async () => { throw new Error("ECONNRESET"); };
const GET = { httpMethod: "GET", queryStringParameters: {} };

await check("rate: SUNAT's answer is served, cached for a day, and kept as the last good one", async () => {
  const store = memStore();
  const r = await FX.handler(GET, { fetchImpl: sunatOk, fxStore: store });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["Cache-Control"], "public, max-age=86400");
  const b = JSON.parse(r.body);
  assert.equal(b.venta, 3.75); assert.equal(b.compra, 3.73); assert.ok(!b.stale);
  assert.equal(store.m.get("sunat-tc").venta, 3.75);
  assert.equal(store.m.get("sunat-venta").venta, 3.75, "search.js's key is fed too");
});

for (const [why, f] of [["a 429", sunat429], ["a non-JSON page", sunatHtml], ["a network error", sunatThrows]]) {
  await check(`rate: on ${why}, the last good SUNAT answer, marked stale, held ten minutes`, async () => {
    const store = memStore({ "sunat-tc": { compra: 3.7, venta: 3.72, fecha: "2026-11-02", origen: "SUNAT", at: Date.now() - 2 * 864e5 } });
    const r = await FX.handler(GET, { fetchImpl: f, fxStore: store });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers["Cache-Control"], "public, max-age=600");
    const b = JSON.parse(r.body);
    assert.deepEqual([b.venta, b.compra, b.stale, b.fecha], [3.72, 3.7, true, "2026-11-02"]);
  });
  await check(`rate: on ${why} with nothing stored, an error that is never cached`, async () => {
    const r = await FX.handler(GET, { fetchImpl: f, fxStore: memStore() });
    assert.ok(r.statusCode >= 400, String(r.statusCode));
    assert.equal(r.headers["Cache-Control"], "no-store");
    assert.ok(!("venta" in JSON.parse(r.body)));
  });
}
await check("rate: a stored rate older than a week is not served; search.js's venta-only key is read when the full one is missing", async () => {
  const old = memStore({ "sunat-tc": { venta: 3.5, at: Date.now() - 8 * 864e5 } });
  assert.equal(JSON.parse((await FX.handler(GET, { fetchImpl: sunat429, fxStore: old })).body).venta, undefined);
  const vOnly = memStore({ "sunat-venta": { venta: 3.71, at: Date.now() - 3600e3 } });
  const b = JSON.parse((await FX.handler(GET, { fetchImpl: sunat429, fxStore: vOnly })).body);
  assert.equal(b.venta, 3.71); assert.equal(b.stale, true); assert.equal(b.compra, null);
});
await check("rate: orders-create never charges on a stale rate; checkout never caches one as today's", () => {
  const oc = readFileSync(join(ROOT, "netlify/functions/orders-create.js"), "utf8");
  assert.match(oc, /async function serverFxVenta[\s\S]{0,400}if \(data && data\.stale\) return null;/);
  const co = readFileSync(join(ROOT, "checkout.html"), "utf8");
  assert.match(co, /if \(!data\.stale\) \{ try \{ localStorage\.setItem\(FX_CACHE_KEY/);
});

/* ------------------------------------------------------------------
   2. STATIC: the card price formatters draw soles only.
   ------------------------------------------------------------------ */
function fnBody(src, name) {
  const m = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{").exec(src);
  assert.ok(m, "no function " + name);
  let i = m.index + m[0].length, depth = 1;
  for (; i < src.length && depth > 0; i++) { const ch = src.charCodeAt(i); if (ch === 123) depth++; else if (ch === 125) depth--; }
  return src.slice(m.index, i).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const bundleRel = "build/" + readdirSync(join(ROOT, "build")).find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
const DOLLAR_RX = /\bfmtUSD\(|\bfmtUsd\(|['"]US\$|'US' \+|\bfmtPriceLabel\(|\bfmtDisplayPrice\(|\bsolesUnderHTML\(|\brailRefPriceHTML\(|\busd\(now\)|class="usd">' \+ esc\(fmtU/;
const FORMATTERS = [
  ["departamento.html", "priceInner"], ["motos.html", "priceInner"], ["aria-auto.html", "priceInner"], ["marca.html", "priceInner"],
  ["disenadores.html", "priceInner"], ["tienda.html", "slPriceInner"], ["search.html", "priceHTML"], ["search.html", "amountHTML"],
  ["ofertas.html", "priceHTML"], ["producto.html", "relCardHTML"], ["assets/js/vehicle-fit.js", "priceHTML"], ["ropa-interior.html", "priceInner"], ["cuenta.html", "cardPrice"],
  [bundleRel, "railCardHTML"], [bundleRel, "railLeadPrice"], [bundleRel, "carouselCardHTML"], [bundleRel, "productCardHTML"], [bundleRel, "renderCrossSellRail"],
];
await check("static: every card price formatter draws soles only -- no dollar formatter, no dollar reference line", () => {
  const bad = [];
  for (const [rel, name] of FORMATTERS) {
    const body = fnBody(readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n"), name);
    const m = DOLLAR_RX.exec(body);
    if (m) bad.push(`${rel}:${name} uses ${m[0]}`);
  }
  for (const rel of ["auto.html", "aria-auto.html"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    if (/class="pprice"><b>' \+ fmtPEN\(usd \* rateNow\(\)\) \+ '<\/b><small>/.test(src)) bad.push(rel + ": the parts card carries a dollar line");
  }
  const b = readFileSync(join(ROOT, bundleRel), "utf8");
  if (/solesUnderHTML\(displayPriceUsd\(Number\(item\.price\)/.test(b)) bad.push("the assistant card carries a dollar-first price");
  assert.deepEqual(bad, []);
});
await check("static: the pages ask the one shared rate (/import-tax.js AriaImportTax.fx), loaded before they draw", () => {
  for (const p of ["departamento.html", "tienda.html", "search.html", "marca.html", "ofertas.html", "ropa-interior.html", "producto.html", "disenadores.html", "motos.html", "aria-auto.html"]) {
    const src = readFileSync(join(ROOT, p), "utf8");
    assert.match(src, /AriaImportTax\.fx/, p + " does not use the shared rate");
    assert.ok(src.search(/<script src="\/import-tax\.js"[^>]*><\/script>/) > 0, p + " does not load /import-tax.js");
  }
  const b = readFileSync(join(ROOT, bundleRel), "utf8");
  assert.match(b, /function cardSolesHTML\(/);
  assert.match(b, /window\.AriaImportTax\.fx/);
  for (const k of ["get", "now", "on", "soles", "slot"]) assert.equal(typeof T.fx[k], "function", "AriaImportTax.fx." + k);
  assert.equal(T.fx.soles(10), "", "no rate in node: no figure, never dollars");
  assert.match(T.fx.slot(10), /^<span data-soles-usd="10">S\/ …<\/span>$/);
});

/* ------------------------------------------------------------------
   2b. THE DISEÑADOR FILTER PARITY (#443 c.6629785432: "the designer
   filter was weird, it didn't work like the other filters"). Diseñador is
   the one department with both the audience switch and brand pills, and
   the two did not stack: under «Hombre» the pills kept the whole room's
   counts (Miu Miu 1,001 -- the men's room holds none: an empty page), a
   brand dropped «Hombre» from the address, the switch never counted the
   brand, and Explorar todo ignored the brand. Every other department's
   controls narrow everything below them; so do these now.
   ------------------------------------------------------------------ */
const DEPT = (await import("../../netlify/functions/department.js")).handler;
const dq = async (q) => JSON.parse((await DEPT({ httpMethod: "GET", queryStringParameters: q })).body);
await check("parity (server): Diseñador's brand pills count under the audience; the switch counts under the brand", async () => {
  const men = await dq({ dept: "luxury", u: "men" });
  assert.ok(men.brands && men.brands.length > 10);
  assert.ok(!men.brands.some((x) => x.label === "Miu Miu"), "Miu Miu offered under Hombre");
  const all = await dq({ dept: "luxury", b: "Rick Owens" });
  const n = Object.fromEntries(all.audn.map((x) => [x.k, x.n]));
  assert.equal(n.men, (await dq({ dept: "luxury", b: "Rick Owens", u: "men" })).count);
  assert.equal(n.women, (await dq({ dept: "luxury", b: "Rick Owens", u: "women" })).count);
  assert.equal(men.brands.find((x) => x.label === "Rick Owens").n, n.men);
  const miu = await dq({ dept: "luxury", b: "Miu Miu" });
  assert.equal(miu.audn.find((x) => x.k === "men").n, 0);
  const landing = await dq({ dept: "luxury" });
  assert.ok(!("audn" in landing), "the landing keeps the static switch");
});
await check("parity (static): the brand keeps the audience in the address; Explorar todo follows the brand pill", () => {
  const dep = readFileSync(join(ROOT, "departamento.html"), "utf8");
  assert.match(fnBody(dep, "perfumeUrl"), /fU \? '&para='/);
  assert.match(dep, /if \(\(fA \|\| fT \|\| fU\) && !fB && data\.brands\) P_BRANDS = data\.brands;/);
  assert.match(dep, /brand: function\(\)\{ return fB; \}/);
  const dh = readFileSync(join(ROOT, "assets/js/dept-header.js"), "utf8");
  assert.match(dh, /AUDN = head && head\.audn \? head\.audn : null;/);
  assert.match(dh, /LAST_B = brand; EX\.b = brand;/);
});

/* ------------------------------------------------------------------
   3. THE SURFACES.
   ------------------------------------------------------------------ */
const handlers = {};
const fnFetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });
let FX_UP = true;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const fn = /^\/\.netlify\/functions\/([a-z0-9-]+)/.exec(u.pathname);
  if (fn) {
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    if (fn[1] === "exchange-rate") {
      /* The real handler: SUNAT answering, or down with nothing stored. */
      const r = await FX.handler({ httpMethod: "GET", queryStringParameters: {} }, {
        fetchImpl: FX_UP ? async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ compra: VENTA - 0.02, venta: VENTA, origen: "SUNAT" }) }) : sunat429,
        fxStore: null,
      });
      res.writeHead(r.statusCode, { ...r.headers, "Cache-Control": "no-store" });
      return res.end(r.body);
    }
    if (fn[1] === "auth-me") return send(200, { email: null });
    let body = "";
    for await (const ch of req) body += ch;
    const file = join(ROOT, "netlify/functions", fn[1] + ".js");
    if (!existsSync(file)) return send(404, {});
    try {
      handlers[fn[1]] = handlers[fn[1]] || (await import(file)).handler;
      const r = await handlers[fn[1]]({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams), body, headers: {} }, { fetchImpl: fnFetch });
      res.writeHead(r.statusCode, r.headers || { "Content-Type": "application/json" });
      return res.end(r.body || "");
    } catch (e) { return send(500, { error: String(e) }); }
  }
  const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#dfe6f2"/></svg>';
/* mode: fresh (today's rate cached) | stale (a 3-day-old rate, endpoint down) | cold (no rate, endpoint down) */
async function phone(mode) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await c.addInitScript(({ venta, mode }) => {
    try {
      if (sessionStorage.getItem("__seeded")) return;
      sessionStorage.setItem("__seeded", "1");
      if (mode === "fresh") localStorage.setItem("aria_fx_rate_v1", JSON.stringify({ venta, compra: venta - 0.02, fetchedAt: Date.now() }));
      if (mode === "stale") localStorage.setItem("aria_fx_rate_v1", JSON.stringify({ venta, compra: venta - 0.02, fetchedAt: Date.now() - 3 * 864e5 }));
    } catch (e) {}
  }, { venta: VENTA, mode });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { c, page, errors };
}
/* Every visible product card: what its price row and its IMP line say. */
const CARDS = `a.card, a.rel-card, a.fc-row, a.cmp-row, .sl a.card, [data-card-root], article.card, .pick, .pcard`;
const readCards = (page) => page.evaluate((sel) => {
  const seen = [];
  const out = [];
  document.querySelectorAll(sel).forEach((el) => {
    if (el.closest(".sk") || el.classList.contains("sk") || el.getAttribute("aria-hidden") === "true") return;
    if (seen.some((x) => x.contains(el))) return;
    seen.push(el);
    if (!el.getClientRects().length) return;
    const shown = el.cloneNode(true);
    const imps = [...shown.querySelectorAll("[data-card-imp]")];
    imps.forEach((x) => x.remove());
    /* A title quoting a price ("a $293 value!") is the store's words, not ours. */
    shown.querySelectorAll("h3, .card-title, .rel-title, .title, [class*='line-clamp'], .ptitle").forEach((x) => x.remove());
    const text = shown.innerText.replace(/\s+/g, " ");
    out.push({
      text: text.slice(0, 140),
      dollars: /US\$|(?<![A-Za-z/])\$\s?\d/.test(text),
      soles: /S\/\s?\d/.test(text),
      waiting: /S\/\s?…/.test(text) || !!el.querySelector(".pen i, .now i.bar, .pen-row i"),
      imp: imps.map((x) => x.textContent),
    });
  });
  return out;
}, CARDS);
function verdict(cards, where, { allowWaiting }) {
  const bad = [];
  let priced = 0, lines = 0;
  for (const c of cards) {
    if (c.dollars) bad.push(`${where}: a dollar figure on the card -- ${c.text}`);
    if (c.soles) priced++;
    else if (!(allowWaiting && c.waiting) && !/Precio no disponible|Ver detalle/.test(c.text)) bad.push(`${where}: no soles price -- ${c.text}`);
    for (const t of c.imp) {
      lines++;
      if (allowWaiting ? !/^\+ S\/ (?:[\d,]+\.\d{2}|…) IMP$/.test(t) : !/^\+ S\/ [\d,]+\.\d{2} IMP$/.test(t)) bad.push(`${where}: IMP line reads ${JSON.stringify(t)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} problems`);
  return { priced, lines };
}
async function settle(page, ready) {
  await page.waitForSelector(ready, { timeout: 90000 });
  await page.waitForTimeout(1500);
  /* Bring the lower rails in (the axes, Explorar todo, lazy rails). */
  await page.evaluate(async () => { for (let y = 0; y < 5000; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(1500);
}
const SURFACES = [
  { name: "disenador", label: "Diseñador department", url: "departamento.html?dept=luxury", ready: ".rail a.card", min: 20, minImp: 5 },
  { name: "mujer", label: "Mujer department", url: "departamento.html?dept=women", ready: ".rail a.card", min: 20, minImp: 1 },
  { name: "tienda-ssense", label: "store page (SSENSE)", url: "tienda.html?tienda=ssense", ready: ".sl a.card", min: 20, minImp: 5 },
  { name: "tienda-macys", label: "multi-brand store with brand rails (Macy's)", url: "tienda.html?tienda=macys", ready: ".sl a.card", min: 20, minImp: 0 },
  { name: "marca-marc-jacobs", label: "brand page (Marc Jacobs)", url: "marca.html?marca=marc-jacobs", ready: "a.card", min: 8, minImp: 1 },
  { name: "busqueda", label: "search results (miu miu)", url: "search.html?resultados=1&q=" + encodeURIComponent("miu miu"), ready: "a.card", min: 8, minImp: 1 },
  { name: "inicio", label: "homepage rails", url: "index.html", ready: "[data-card-root]", min: 8, minImp: 0 },
  { name: "lenceria", label: "Lencería (ropa-interior)", url: "ropa-interior.html#mujer", ready: "a.card", min: 8, minImp: 0 },
  { name: "ofertas", label: "Ofertas", url: "ofertas.html", ready: "a.card", min: 8, minImp: 0 },
  { name: "disenadores-latinos", label: "Diseñadores Latinos", url: "disenadores.html", ready: "article.card, a.card", min: 8, minImp: 1 },
  { name: "producto-rails", label: "product page rails", url: "producto.html?producto=" + encodeURIComponent("Dice charm with logo") + "&tienda=miumiu", ready: "a.rel-card", min: 4, minImp: 0 },
];
const SHOT = process.env.SHOT_DIR || "";
try {
  await check("390px, Diseñador filter parity: Hombre, then a brand -- the pills, the switch, the address and Explorar todo all stack", async () => {
    FX_UP = true;
    const { c, page, errors } = await phone("fresh");
    try {
      const state = () => page.evaluate(() => ({
        url: location.search,
        aud: [...document.querySelectorAll("#dhAud button")].map((b) => b.getAttribute("data-u") + ":" + (b.querySelector("small") || {}).textContent),
        pressed: (document.querySelector('#dhAud button[aria-pressed="true"]') || {}).getAttribute?.("data-u"),
        brands: [...document.querySelectorAll("#pBrands .hub-pill")].map((b) => b.getAttribute("data-brand") + ":" + ((b.querySelector(".n") || {}).textContent || "")),
        exploreB: (document.getElementById("dhB") || {}).value,
        count: (document.getElementById("dhCount") || {}).textContent,
      }));
      const toExplore = async () => { await page.evaluate(() => document.getElementById("dh-explorar").scrollIntoView()); await page.waitForTimeout(2500); await page.evaluate(() => window.scrollTo(0, 0)); };
      await page.goto(`${BASE}/departamento.html?dept=luxury`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#pBrands .hub-pill", { timeout: 60000 });
      await page.waitForSelector("#dhAud button[data-u=men]", { timeout: 60000 });
      await page.click("#dhAud button[data-u=men]");
      await page.waitForFunction(() => ![...document.querySelectorAll("#pBrands .hub-pill")].some((b) => b.getAttribute("data-brand") === "Miu Miu"), null, { timeout: 30000 });
      await toExplore();
      const men = await state();
      const ro = men.brands.find((x) => x.startsWith("Rick Owens:"));
      assert.ok(ro, "Rick Owens is not among Hombre's brands");
      await page.click('#pBrands .hub-pill[data-brand="Rick Owens"]');
      await page.waitForFunction(() => /b=Rick/.test(location.search) && document.querySelector("#scopeBar:not([hidden])"), null, { timeout: 30000 });
      await page.waitForTimeout(2500);
      await toExplore();
      await page.waitForFunction(() => (document.getElementById("dhB") || {}).value === "rick owens", null, { timeout: 30000 });
      const both = await state();
      assert.match(both.url, /para=men/, "the brand dropped the audience: " + both.url);
      assert.equal(both.pressed, "men");
      const ron = Number(ro.split(":")[1].replace(/[^\d]/g, ""));
      assert.ok(both.aud.some((x) => x === "men:" + ron.toLocaleString("es-PE")), "the switch does not count the brand: " + both.aud.join(" "));
      assert.ok(!both.aud.some((x) => x.startsWith("kids:")), "an empty audience is offered: " + both.aud.join(" "));
      assert.equal(Number(both.count.replace(/[^\d]/g, "")), ron, "Explorar todo: " + both.count);
      const cards = await page.evaluate(() => [...document.querySelectorAll("#rails a.card .card-brand")].slice(0, 30).map((e) => e.textContent.trim()));
      assert.ok(cards.length && cards.every((b) => /rick owens/i.test(b)), "a card outside the brand: " + cards.join(", "));
      assert.deepEqual(errors, []);
      if (SHOT) await page.screenshot({ path: join(SHOT, "card-soles-disenador-filtro-hombre-rick-owens.png") });
    } finally { await c.close(); }
  });
  for (const S of SURFACES) {
    for (const mode of ["fresh", "stale"]) {
      await check(`390px, ${S.label}, ${mode === "fresh" ? "today's rate" : "endpoint down, a 3-day-old rate on the phone"}: every card in soles, every IMP line in soles, no dollar figure`, async () => {
        FX_UP = mode === "fresh";
        const { c, page, errors } = await phone(mode);
        try {
          await page.goto(`${BASE}/${S.url}`, { waitUntil: "domcontentloaded" });
          await settle(page, S.ready);
          const cards = await readCards(page);
          assert.ok(cards.length >= S.min, `only ${cards.length} cards`);
          const n = verdict(cards, S.label, { allowWaiting: false });
          assert.ok(n.lines >= S.minImp, `only ${n.lines} IMP lines`);
          const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          assert.ok(wide <= 1, `the page scrolls sideways by ${wide}px`);
          assert.deepEqual(errors, []);
          console.log(`         ${S.label} (${mode}): ${cards.length} cards, ${n.priced} in soles, ${n.lines} IMP lines`);
          if (SHOT && mode === "fresh") await page.screenshot({ path: join(SHOT, `card-soles-${S.name}.png`) });
          if (SHOT && mode === "stale" && S.name === "disenador") await page.screenshot({ path: join(SHOT, `card-soles-${S.name}-stale-rate.png`) });
        } finally { await c.close(); }
      });
    }
  }
  /* A phone that never had a rate, the endpoint down: placeholders, never
     dollars; then the endpoint comes back and the same cards fill in soles. */
  for (const S of SURFACES.filter((s) => ["disenador", "tienda-ssense", "inicio", "marca-marc-jacobs", "ofertas"].includes(s.name))) {
    await check(`390px, ${S.label}, no rate at all: soles placeholders and «+ S/ … IMP», never dollars; filled in soles once the rate is back`, async () => {
      FX_UP = false;
      const { c, page, errors } = await phone("cold");
      try {
        await page.goto(`${BASE}/${S.url}`, { waitUntil: "domcontentloaded" });
        await settle(page, S.ready);
        const before = await readCards(page);
        assert.ok(before.length >= S.min, `only ${before.length} cards`);
        verdict(before, S.label + " (no rate)", { allowWaiting: true });
        assert.ok(before.every((x) => !x.soles), "a soles figure without a rate");
        if (SHOT && S.name === "disenador") await page.screenshot({ path: join(SHOT, `card-soles-${S.name}-no-rate.png`) });
        FX_UP = true;
        await page.waitForFunction(() => !document.body.innerText.includes("S/ …") && !document.querySelector("a.card .pen i, .sl a.card .pen:empty"), null, { timeout: 45000 });
        const after = await readCards(page);
        const n = verdict(after, S.label + " (rate back)", { allowWaiting: false });
        assert.ok(n.priced >= S.min, `only ${n.priced} cards filled in soles`);
        assert.deepEqual(errors, []);
      } finally { await c.close(); }
    });
  }
} finally {
  await browser.close();
  srv.close();
}

const MIN_CHECKS = 1 + 6 + 2 + 2 + 2 + 1 + SURFACES.length * 2 + 5;
if (passed + failures.length < MIN_CHECKS) { console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
