#!/usr/bin/env node
/* ==================================================================
   THE CARD STACK: SOLES FIRST, THE US$ LINE UNDER, THE IMP LINE IN
   SOLES (#443 c.6629785432; restored by the P0 c.6648727667 / Lucifer
   c.6648738235). Danny's approved card: «S/ 455.26», then «US$ 131.35 ·
   TC hoy 3.47», then «+ S/ ___ IMP» where the #624 rule calls for it.

   #658 made every card soles-only and drew a waiting placeholder until
   the shared rate (/import-tax.js AriaImportTax.fx) answered; a phone
   holding the /import-tax.js from before it (unversioned, cached an
   hour) never got one, and the cards showed grey bars for good (the
   Lentes department's Knockaround and Costa Del Mar rails, every Aria
   Auto card). The P0 puts the pre-#658 card back: each page asks its own
   rate, paints at once (dollars until a rate is known), and fills the
   soles in place when one lands -- late, or from the shared module's
   retries.

   1. THE RATE. netlify/functions/exchange-rate.js: SUNAT -> its last good
      answer from the "fx" store (stale: true, ten-minute cache) -> an
      error that is never cached. orders-create never charges on a stale
      rate; checkout never caches one as today's.
   2. STATIC. Every card price formatter carries the US$ reference and
      never returns a waiting bar; the pages ask the rate themselves and
      load /import-tax.js by its own hash.
   3. THE SURFACES AT 390px: the rate fresh; the endpoint down with a
      days-old rate on the phone; no rate at all (dollars, at once), then
      the rate back (soles fill in place). Plus the P0 surfaces with a
      phone holding the pre-#658 /import-tax.js, the rate present and late.

     node scripts/test/card-soles-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/card-soles-tests.mjs   (also saves card-soles-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
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
  ["ofertas.html", "priceInner"], ["producto.html", "relCardHTML"], ["assets/js/vehicle-fit.js", "priceHTML"], ["ropa-interior.html", "priceInner"], ["cuenta.html", "cardPrice"],
  [bundleRel, "railCardHTML"], [bundleRel, "railLeadPrice"], [bundleRel, "carouselCardHTML"], [bundleRel, "productCardHTML"], [bundleRel, "renderCrossSellRail"],
];
const WAIT_RX = /<i><\/i><\/div>'|<i class="bar"><\/i><\/span>'|S\/ \\u2026|S\/ …|\.slot\(/;
await check("static: every card price formatter carries the US$ reference line and never returns a waiting bar", () => {
  const bad = [];
  for (const [rel, name] of FORMATTERS) {
    const body = fnBody(readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n"), name);
    if (!DOLLAR_RX.test(body)) bad.push(`${rel}:${name} has no US$ line`);
    const w = WAIT_RX.exec(body);
    if (w) bad.push(`${rel}:${name} waits on ${w[0]}`);
  }
  assert.deepEqual(bad, []);
});
await check("static: the pages ask the rate themselves (never only through AriaImportTax.fx) and load /import-tax.js", () => {
  for (const p of ["departamento.html", "tienda.html", "search.html", "marca.html", "ofertas.html", "ropa-interior.html", "producto.html", "disenadores.html", "motos.html", "aria-auto.html", "cuenta.html"]) {
    const src = readFileSync(join(ROOT, p), "utf8");
    assert.match(src, /\/\.netlify\/functions\/exchange-rate|FX_URLS?\b/, p + " never asks the rate itself");
    assert.ok(!/if \(!F\)\{? ?(?:fxRate = undefined; )?return;/.test(src), p + " gives up when the shared module has no .fx");
    assert.ok(src.search(/<script src="\/import-tax\.js(?:\?v=[0-9a-f]{16})?"[^>]*><\/script>/) > 0, p + " does not load /import-tax.js");
  }
  for (const k of ["get", "now", "on", "soles", "slot"]) assert.equal(typeof T.fx[k], "function", "AriaImportTax.fx." + k);
  assert.equal(T.fx.soles(10), "", "no rate in node: no soles figure");
  assert.equal(T.lineHTML({ usd: 900, retailer: "ssense", title: "x" }).replace(/<[^>]+>/g, "").replace(/^\+ /, "").startsWith("US$ "), true, "no rate: the IMP line reads dollars, never a placeholder");
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
/* P0 (#443 c.6648727667): what the phone's cache holds for /import-tax.js.
   "current": the file itself. "cached-old": the unversioned URL answers
   with a copy from before AriaImportTax.fx (what a browser kept for an
   hour under _headers' "/*.js max-age=3600" after #658 deployed); only
   the URL that carries this file's own hash reaches today's file.
   "absent": the script never loads. FX_DELAY_MS: the rate lands late. */
let IT_MODE = "current";
let FX_DELAY_MS = 0;
const IT_SRC = readFileSync(join(ROOT, "import-tax.js"), "utf8");
const IT_V = createHash("sha256").update(readFileSync(join(ROOT, "import-tax.js"))).digest("hex").slice(0, 16);
const IT_OLD = IT_SRC.replace(/,\s*\/\*[^]*?\*\/\s*fx: Object\.freeze\(\{[^}]*\}\)/, "");
assert.ok(IT_OLD !== IT_SRC && !/fx: Object\.freeze/.test(IT_OLD), "could not build the pre-fx /import-tax.js");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const fn = /^\/\.netlify\/functions\/([a-z0-9-]+)/.exec(u.pathname);
  if (fn) {
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    if (fn[1] === "exchange-rate") {
      if (FX_DELAY_MS) await new Promise((r) => setTimeout(r, FX_DELAY_MS));
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
  if (u.pathname === "/import-tax.js" && IT_MODE !== "current") {
    if (IT_MODE === "absent") { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": "text/javascript" });
    return res.end(u.searchParams.get("v") === IT_V ? IT_SRC : IT_OLD);
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
      solesFirst: text.search(/S\/\s?\d/) >= 0 && (text.search(/US\$/) < 0 || text.search(/S\/\s?\d/) < text.search(/US\$/)),
      dollars: /US\$|(?<![A-Za-z/])\$\s?\d/.test(text),
      soles: /S\/\s?\d/.test(text),
      waiting: /S\/\s?…/.test(text) || !!el.querySelector(".pen i, .now i.bar, .pen-row i"),
      imp: imps.map((x) => x.textContent),
    });
  });
  return out;
}, CARDS);
/* The card stack: with a rate, soles first and the US$ line under them;
   without one, the dollars at once -- never a bar or «S/ …» that waits. */
function verdict(cards, where, { rate }) {
  const bad = [];
  let priced = 0, lines = 0;
  for (const c of cards) {
    if (c.waiting) bad.push(`${where}: a waiting placeholder on the card -- ${c.text}`);
    if (/Precio no disponible|Ver detalle/.test(c.text)) continue;
    if (rate === "either" && !c.soles) {
      /* A days-old rate with the endpoint down: soles from it, or the dollars -- never a wait. */
      if (!c.dollars) bad.push(`${where}: no price -- ${c.text}`);
    } else if (rate) {
      if (c.soles) priced++; else bad.push(`${where}: no soles price -- ${c.text}`);
      if (!c.dollars) bad.push(`${where}: no US$ reference line -- ${c.text}`);
      else if (c.soles && !c.solesFirst) bad.push(`${where}: dollars before soles -- ${c.text}`);
    } else if (!c.dollars) bad.push(`${where}: no price at all without a rate -- ${c.text}`);
    for (const t of c.imp) {
      lines++;
      if (rate === true ? !/^\+ S\/ [\d,]+\.\d{2} IMP$/.test(t) : !/^\+ (?:S\/ [\d,]+\.\d{2}|US\$ ?[\d,]+\.\d{2}) IMP$/.test(t)) bad.push(`${where}: IMP line reads ${JSON.stringify(t)}`);
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
      await check(`390px, ${S.label}, ${mode === "fresh" ? "today's rate" : "endpoint down, a 3-day-old rate on the phone"}: ${mode === "fresh" ? "soles first, the US$ line under, every IMP line in soles" : "soles from that rate or the dollars, never a waiting bar"}`, async () => {
        FX_UP = mode === "fresh";
        const { c, page, errors } = await phone(mode);
        try {
          await page.goto(`${BASE}/${S.url}`, { waitUntil: "domcontentloaded" });
          await settle(page, S.ready);
          const cards = await readCards(page);
          assert.ok(cards.length >= S.min, `only ${cards.length} cards`);
          const n = verdict(cards, S.label, { rate: mode === "fresh" ? true : "either" });
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
  /* A phone that never had a rate, the endpoint down: the dollars at once,
     never a waiting bar; then the endpoint comes back and the same cards
     fill in soles in place. */
  for (const S of SURFACES.filter((s) => ["disenador", "tienda-ssense", "inicio", "marca-marc-jacobs", "ofertas"].includes(s.name))) {
    await check(`390px, ${S.label}, no rate at all: the dollars at once, no waiting bar; filled in soles in place once the rate is back`, async () => {
      FX_UP = false;
      const { c, page, errors } = await phone("cold");
      try {
        await page.goto(`${BASE}/${S.url}`, { waitUntil: "domcontentloaded" });
        await settle(page, S.ready);
        const before = await readCards(page);
        assert.ok(before.length >= S.min, `only ${before.length} cards`);
        verdict(before, S.label + " (no rate)", { rate: false });
        assert.ok(before.every((x) => !x.soles), "a soles figure without a rate");
        if (SHOT && S.name === "disenador") await page.screenshot({ path: join(SHOT, `card-soles-${S.name}-no-rate.png`) });
        FX_UP = true;
        await page.waitForFunction((sel) => { const cs = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && !e.closest(".sk")); return cs.length && cs.filter((e) => /S\/\s?\d/.test(e.innerText)).length >= cs.length * 0.9; }, CARDS, { timeout: 90000 });
        const after = await readCards(page);
        const n = verdict(after, S.label + " (rate back)", { rate: true });
        assert.ok(n.priced >= S.min, `only ${n.priced} cards filled in soles`);
        assert.deepEqual(errors, []);
      } finally { await c.close(); }
    });
  }
  /* ----------------------------------------------------------------
     P0 (#443 c.6648727667, Danny on the live site after #658): grey
     placeholder bars where the price goes on the Lentes department's
     Knockaround and Costa Del Mar rails (Island Water Sports' Paso
     Robles first) and on every Aria Auto card. The pages read the rate
     only through AriaImportTax.fx; a phone still holding the
     /import-tax.js from before #658 (cached an hour, unversioned URL)
     has no .fx, and those pages then never asked for a rate at all. Now
     the pages ask the rate themselves again (pre-#658), paint at once and
     fill in place, and load /import-tax.js?v=<its hash>. Each surface: the
     rate on the phone, and the rate landing late; every card in soles at
     the data's own price with the «US$» line under it, the IMP line in
     soles directly under the price wherever the #624 rule calls for it.
     ---------------------------------------------------------------- */
  const fmtSol = (n) => "S/ " + (Math.round(n * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /* Every visible card: its price row, the data's own US$ (data-usd), its
     IMP line, and whether the line sits right under the price. */
  const readFaces = (page, scope) => page.evaluate((scope) => {
    const out = [];
    const roots = scope ? [...document.querySelectorAll(scope)] : [document];
    roots.forEach((root) => root.querySelectorAll("a.card").forEach((a) => {
      if (a.closest(".sk") || a.classList.contains("sk") || !a.getClientRects().length) return;
      const pr = a.querySelector("[data-usd], .pprice");
      const imp = a.querySelector("[data-card-imp]");
      const r = (/[?&]tienda=([^&]+)/.exec(a.getAttribute("href") || "") || [])[1] || "";
      out.push({
        title: ((a.querySelector(".card-title, h3") || {}).textContent || "").trim().slice(0, 60),
        rail: scope ? ((root.querySelector("h2, .rail-title") || {}).textContent || "").trim().replace(/\s*[\d.,]+$/, "") : "",
        usd: pr ? (pr.hasAttribute("data-usd") ? Number(pr.getAttribute("data-usd")) : Number(((/US\$\s?([\d,]+\.\d{2})/.exec(pr.textContent) || [])[1] || "").replace(/,/g, ""))) : NaN,
        pen: pr ? ((pr.querySelector(".pen, b") || pr).textContent || "").replace(/\s+/g, " ").trim() : "",
        bar: !!(pr && pr.querySelector("i")),
        usdLine: (() => { const k = a.cloneNode(true); k.querySelectorAll("[data-card-imp], h3, .card-title").forEach((x) => x.remove()); const t = k.innerText; return /US\$\s?[\d,]+\.\d{2}/.test(t) && t.search(/S\/\s?\d/) >= 0 && t.search(/S\/\s?\d/) < t.search(/US\$/); })(),
        imp: imp ? imp.textContent.trim() : null,
        impUsd: imp ? Number(imp.getAttribute("data-imp-usd")) : 0,
        under: !!(imp && pr && (imp.previousElementSibling === pr || imp.previousElementSibling === pr.parentNode || pr.contains(imp.previousElementSibling))),
        owes: !!(pr && window.AriaImportTax && window.AriaImportTax.cardImpUsd({ usd: Number(pr.getAttribute("data-usd")), retailer: r }, 0) > 0),
      });
    }));
    return out;
  }, scope || null);
  function judgeFaces(cards, where, rate) {
    const bad = [];
    for (const c of cards) {
      const want = fmtSol(c.usd * rate).replace(/\s/g, " ");
      const got = c.pen.replace(/ /g, " ");
      if (c.bar || !got.replace(/,/g, "").startsWith(want.replace(/,/g, ""))) bad.push(`${where}: ${c.title} reads ${JSON.stringify(c.pen)}${c.bar ? " (grey bar)" : ""}, want ${want}`);
      if (!c.usdLine) bad.push(`${where}: ${c.title} has no «US$» reference line under its soles`);
      if (c.owes && !c.imp) bad.push(`${where}: ${c.title} (US$ ${c.usd}) is over the line and carries no IMP line`);
      if (!c.owes && c.imp) bad.push(`${where}: ${c.title} (US$ ${c.usd}) is under the line and carries ${c.imp}`);
      if (c.imp && c.imp !== "+ " + fmtSol(c.impUsd * rate) + " IMP") bad.push(`${where}: ${c.title} IMP line reads ${JSON.stringify(c.imp)}`);
      if (c.imp && !c.under) bad.push(`${where}: ${c.title} IMP line is not directly under the price`);
    }
    assert.deepEqual(bad.slice(0, 8), [], `${bad.length} problems`);
  }
  const P0 = [
    { name: "lentes-knockaround-costa", label: "Lentes: the Knockaround and Costa Del Mar rails", url: "departamento.html?dept=sunglasses",
      ready: ".rail a.card", scope: ".rail-sec", rails: ["Knockaround", "Costa Del Mar"], first: "Knockaround Paso Robles Polarized Sunglasses" },
    { name: "aria-auto", label: "Aria Auto's car cards (/auto, auto.ariashop.pe)", url: "aria-auto.html", ready: "a.card [data-usd]", min: 12, minImp: 1 },
    { name: "aria-auto-vehiculo", label: "Aria Auto's vehicle view (2011 BMW 3 Series brake pads)", url: "aria-auto.html?vy=2011&vmk=bmw&vmd=3-series&t=pastillas-de-freno#buscar", ready: "a.card [data-usd]", min: 4, minImp: 0 },
    { name: "ssense-joyas", label: "SSENSE Vivienne Westwood necklaces", url: "tienda.html?tienda=ssense&q=" + encodeURIComponent("vivienne westwood necklace"), ready: ".sl a.card", min: 12, minImp: 12 },
  ];
  for (const [itMode, rateMode, only] of [["cached-old", "present"], ["cached-old", "late"], ["absent", "late", ["lentes-knockaround-costa", "aria-auto"]]]) {
    for (const S of P0.filter((x) => !only || only.includes(x.name))) {
      const why = itMode === "cached-old" ? "a phone holding the /import-tax.js from before #658" : "/import-tax.js never loads";
      await check(`390px P0, ${S.label}, ${why}, the rate ${rateMode === "present" ? "on the phone" : "landing 5 s late"}: every price filled in soles, the US$ line and the IMP line under it`, async () => {
        IT_MODE = itMode; FX_UP = true; FX_DELAY_MS = rateMode === "late" ? 5000 : 0;
        const { c, page, errors } = await phone(rateMode === "present" ? "fresh" : "cold");
        try {
          await page.goto(`${BASE}/${S.url}`, { waitUntil: "domcontentloaded" });
          await page.waitForSelector(S.ready, { timeout: 90000 });
          /* Bring the lower rails in (the brand rails draw as they near the screen). */
          await page.evaluate(async () => { for (let y = 0; y < 6000; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); } window.scrollTo(0, 0); });
          if (S.rails) await page.waitForFunction((t) => [...document.querySelectorAll(".rail-sec h2")].some((h) => h.textContent.trim().startsWith(t)), S.rails[1], { timeout: 60000 });
          /* A late rate has landed by now; nothing may still wait for it. */
          await page.waitForTimeout(rateMode === "late" ? 8000 : 2000);
          let cards = await readFaces(page, S.scope);
          if (S.rails) {
            const seen = new Set();
            cards = cards.filter((x) => S.rails.includes(x.rail) && !seen.has(x.rail + "|" + x.title) && seen.add(x.rail + "|" + x.title));
            for (const t of S.rails) assert.ok(cards.filter((x) => x.rail === t).length >= 6, `the ${t} rail holds ${cards.filter((x) => x.rail === t).length} cards`);
            assert.ok(cards.some((x) => x.title === S.first), S.first + " is not on the Knockaround rail");
          } else assert.ok(cards.length >= S.min, `only ${cards.length} cards`);
          judgeFaces(cards, S.label, VENTA);
          const imps = cards.filter((x) => x.imp).length;
          /* With /import-tax.js gone there is no IMP line to draw (it is that module's). */
          if (itMode !== "absent") assert.ok(imps >= (S.minImp || 0), `only ${imps} IMP lines`);
          assert.deepEqual(errors, []);
          console.log(`         ${S.label} (${itMode}, rate ${rateMode}): ${cards.length} cards in soles, ${imps} IMP lines`);
          if (SHOT && itMode === "cached-old") {
            if (S.rails) await page.evaluate((t) => { const h = [...document.querySelectorAll(".rail-sec h2")].find((x) => x.textContent.trim() === t); if (h) h.closest(".rail-sec").scrollIntoView(); }, S.rails[0]);
            else await page.evaluate(() => { const a = document.querySelector("a.card [data-usd]"); if (a) a.closest("a.card").scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
            await page.waitForTimeout(600);
            await page.screenshot({ path: join(SHOT, `card-soles-p0-${S.name}-${rateMode}.png`) });
          }
        } finally { await c.close(); IT_MODE = "current"; FX_DELAY_MS = 0; }
      });
    }
  }
  await check("static P0: every page loads /import-tax.js by its own hash, so no phone can pair today's page with an older copy", () => {
    const bad = [];
    for (const p of readdirSync(ROOT).filter((x) => x.endsWith(".html"))) {
      const src = readFileSync(join(ROOT, p), "utf8");
      for (const m of src.matchAll(/<script src="\/import-tax\.js([^"]*)"/g)) if (m[1] !== "?v=" + IT_V) bad.push(`${p}: /import-tax.js${m[1]}`);
    }
    assert.deepEqual(bad, [], "re-stamp the tags with ?v=" + IT_V);
  });
} finally {
  await browser.close();
  srv.close();
}

const MIN_CHECKS = 1 + 6 + 2 + 2 + 2 + 1 + SURFACES.length * 2 + 5 + 4 + 4 + 2 + 1;
if (passed + failures.length < MIN_CHECKS) { console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
/* The in-process server's keep-alive sockets must not hold the run open. */
process.exit(0);
