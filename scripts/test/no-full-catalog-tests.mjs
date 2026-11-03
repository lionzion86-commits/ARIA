#!/usr/bin/env node
/* ==================================================================
   NO PAGE DOWNLOADS THE CATALOGUE ON LOAD (#443 freeze P0, Lucifer's
   production audit c.6615765591; Danny's freeze directive c.6615548354).

   The homepage froze Danny's mom's Mac and iPhone and a Chromebook
   ("Page Unresponsive"): a shelf whose saved slice was missing computed
   itself from the catalogues, and on a desktop width the first idle
   pulled the whole department cache (73 store files + 3 cache parts,
   31MB gzipped / 255MB raw) and the 19MB deals feed, parsed on the main
   thread while the page was still painting.

   This suite fails when
     - any page fetches a catalogue-sized file (a *-catalog.json, a
       department-cache part, the full ofertas-feed.json, a function's
       _fn/ list, the search index) while it loads or while the shopper
       scrolls it top to bottom, at 390px and at 1366px;
     - any JSON a page asks for on load answers 404 (the published set:
       the worktree's files, the /build/* -> /build/min/* rewrite, the
       forced 404s of netlify.toml);
     - a page's initial JSON passes its gzipped budget;
     - the homepage's app bundle loads blocking (no defer), or a home
       shelf the bundle asks for has no file;
     - a home-shelf fallback reaches the catalogue outside the shelf
       build (shelfFallback / isShelfBuild).

     node scripts/test/no-full-catalog-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

/* What counts as a catalogue: whole-store or whole-pool files. */
export const CATALOG_RX = /(-catalog\.json|\/department-cache[^/]*\.json|\/ofertas-feed\.json|\/auto-cache\.json|\/price-index\.json|\/catalog-index\.json|\/_fn\/|\/assets\/ofertas\/deals\.json)/;
/* Initial JSON budgets, gzipped bytes, per page (measured 2026-11-03 with
   room to spare; the homepage's light path is ~0.2MB). */
const BUDGET = { "/": 600e3, departamento: 600e3, tienda: 600e3, search: 600e3, marca: 600e3, ofertas: 900e3, producto: 600e3 };
const budgetOf = (path) => (path === "/" ? BUDGET["/"] : BUDGET[(/^\/([a-z]+)\.html/.exec(path) || [])[1]] || 600e3);

const html = read("index.html");
const tag = /<script\b[^>]*\bsrc="\/build\/(app-[0-9a-f]{16}\.js)"[^>]*><\/script>/.exec(html);
const bundle = tag ? read("build/" + tag[1]) : "";

await check("index.html names its app bundle, and the file is there (source and the minified copy the rewrite serves)", () => {
  assert.ok(tag, "no /build/app-<hash>.js script tag");
  assert.ok(existsSync(join(ROOT, "build/min", tag[1])), "build/min/" + tag[1] + " is missing (node scripts/build-app-min.mjs)");
});

await check("the app bundle loads deferred, never blocking -- and the scripts before it keep their order (defer, not async)", () => {
  assert.match(tag[0], /\sdefer\b/, "the bundle tag has no defer: " + tag[0]);
  assert.doesNotMatch(tag[0], /\sasync\b/, "async would break the order the page relies on");
  const before = html.slice(0, tag.index);
  const tail = before.slice(before.lastIndexOf("</div>"));
  for (const m of tail.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)) assert.match(m[0], /\s(defer|async)\b/, m[1] + " blocks the parser right before the bundle");
});

await check("the inline blocks that call the bundle wait for DOMContentLoaded (the bundle is deferred)", () => {
  const after = html.slice(tag.index + tag[0].length);
  for (const m of after.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const body = m[1];
    if (/\b(initRouter|startOrbSwim|sweepStoreLogos)\(\)|window\.openCatalog/.test(body))
      assert.match(body, /addEventListener\('DOMContentLoaded'/, "an inline block calls the bundle at parse time: " + body.slice(0, 80));
  }
});

await check("every home shelf the bundle asks for has its file in assets/home/shelves/ (a missing slice was the freeze)", () => {
  const names = new Set([...bundle.matchAll(/homeShelf(?:Picks)?\('([A-Za-z-]+)'\)/g)].map((m) => m[1]));
  const idx = JSON.parse(read("assets/home/shelves/index.json"));
  for (const k of idx.stores) names.add("store-" + k);
  assert.ok(names.size >= 8, "found only " + [...names]);
  const missing = [...names].filter((n) => !existsSync(join(ROOT, "assets/home/shelves", n + ".json")));
  assert.deepEqual(missing, []);
});

await check("no home-shelf fallback reaches the catalogue except through shelfFallback / isShelfBuild", () => {
  assert.match(bundle, /function shelfFallback\(compute\)\{\r?\n  return isShelfBuild\(\) \? compute\(\) : \[\];/);
  /* homeShelfPicks(x) || somethingPicks(await loadDepartmentCache()) -- the old shape. */
  assert.doesNotMatch(bundle, /homeShelfPicks\('[^']+'\)\)\s*\|\|\s*[A-Za-z]+\(await loadDepartmentCache\(\)\)/);
  /* The desktop idle passes (enrich, full deals feed) are shelf-build only. */
  assert.match(bundle, /if \(!isMobileWidth && isShelfBuild\(\)\)\{/);
  assert.match(bundle, /if \(isShelfBuild\(\) && \(!window\.matchMedia/);
  /* The shelf build is the one door: it sets the flag before the page loads. */
  assert.match(read("scripts/build-home-shelves.mjs"), /ARIA_SHELF_BUILD = true/);
});

let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));

if (pw) {
  const { createServer } = await import("node:http");
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const handlers = {};
  for (const n of ["search", "brand", "department", "tienda", "ofertas", "motos"]) handlers[n] = (await import(`../../netlify/functions/${n}.js`)).handler;
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const gz = new Map();
  const gzSize = (f) => { if (!gz.has(f)) gz.set(f, gzipSync(readFileSync(f)).length); return gz.get(f); };
  const FORCED_404 = /^\/(price-index\.json|hidden-docs\/|voice-agent\/)/;
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      try {
        const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
        res.writeHead(r.statusCode, r.headers || {}); return res.end(r.body || "");
      } catch { res.writeHead(500); return res.end("{}"); }
    }
    let p = decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname);
    if (FORCED_404.test(p.slice(0))) { res.writeHead(404); return res.end(""); }
    if (/^\/build\//.test(p) && !/^\/build\/min\//.test(p)) p = "/build/min/" + p.slice(7); /* netlify.toml */
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || f.includes("node_modules") || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const PAGES = [
    "/", "/departamento.html?dept=women", "/departamento.html?dept=shoes", "/tienda.html?tienda=ssense", "/tienda.html?tienda=walmart",
    "/departamento.html?dept=electronics", "/search.html?q=zapatillas", "/marca.html?marca=nike", "/ofertas.html",
    /* A product the homepage links to (its Walmart shelf). */
    "/producto.html?producto=" + encodeURIComponent(JSON.parse(read("assets/home/shelves/store-walmart.json")).picks[0].title) + "&tienda=walmart",
  ];
  const VIEWS = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, laptop: { viewport: { width: 1366, height: 768 } } };
  async function visit(path, view) {
    const c = await browser.newContext(VIEWS[view]);
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const seen = [];
    page.on("response", (r) => { const u = new URL(r.url()); if (u.origin === BASE) seen.push({ path: u.pathname, status: r.status(), phase: "load" }); });
    await page.goto(BASE + path, { waitUntil: "load", timeout: 90000 });
    /* The desktop's old idle passes fired up to 15s after load. */
    await page.waitForTimeout(path === "/" ? 17000 : 5000);
    const loadJson = seen.filter((r) => /\.json$/.test(r.path));
    const initialGz = loadJson.filter((r) => r.status === 200).reduce((s, r) => s + gzSize(join(ROOT, r.path)), 0);
    const mark = seen.length;
    await page.evaluate(async () => {
      for (let y = 0; y < Math.min(document.body.scrollHeight, 40000); y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    });
    await page.waitForTimeout(2500);
    for (const r of seen.slice(mark)) r.phase = "scroll";
    await c.close();
    return { seen, initialGz, jsonFiles: loadJson.length };
  }
  try {
    for (const view of ["phone", "laptop"]) {
      for (const path of PAGES) {
        let got = null;
        await check(`browser ${view}: ${path} fetches no catalogue on load or while scrolling`, async () => {
          got = await visit(path, view);
          const cats = got.seen.filter((r) => CATALOG_RX.test(r.path)).map((r) => `${r.phase}:${r.path}`);
          assert.deepEqual(cats, []);
        });
        if (!got) continue;
        await check(`browser ${view}: every JSON ${path} asks for exists in the published set (no 404)`, () => {
          assert.deepEqual(got.seen.filter((r) => /\.json$/.test(r.path) && r.status === 404).map((r) => r.path), []);
        });
        await check(`browser ${view}: ${path}'s initial JSON stays under ${(budgetOf(path) / 1e6).toFixed(1)}MB gzipped`, () => {
          assert.ok(got.initialGz <= budgetOf(path), `${(got.initialGz / 1e6).toFixed(2)}MB gzipped in ${got.jsonFiles} files`);
        });
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.join("\n")); process.exit(1); }
