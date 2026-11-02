/* ==================================================================
   ONE STORE, ONE PLACE ON THE HOMEPAGE (#443 c.6578980524, Danny's live
   QA 2026-11-02: "Walmart, Diseñadores Latinos, then Victoria's Secret,
   Walmart AGAIN, Foot Locker...").

   The cause: the wide Walmart tile (the Aria Auto band's big store card,
   2026-09-30) was moved whole into the stores block by the categories-
   above-stores order (2c68fc8), two sections above Walmart's own store
   rail. The tile is gone; the rail is Walmart's place.

   At 390x844, served from this checkout, after scrolling the whole page:
     - every store block a shopper sees (a store rail, data-store-rail, or
       a big store tile, a tiendaJump/openStore door with its own band) is
       counted by store: each store appears ONCE;
     - the sequence after Diseñadores Latinos opens on Victoria's Secret,
       then Walmart, Foot Locker, Dick's (Danny's narrated order, without
       the repeat);
     - the source agrees: neither shopfront (phone, desktop) carries two
       store bands for one store, nor a store tile next to its own rail.

     node scripts/test/home-store-rails-tests.mjs
   HOME_STORE_RAILS_PORT picks the port (default 8917).
   ================================================================== */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;
const PORT = Number(process.env.HOME_STORE_RAILS_PORT || 8917);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const html = readFileSync(join(ROOT, "index.html"), "utf8");
const trees = {
  phone: html.slice(html.indexOf('<div id="mobileShopfront"'), html.indexOf('<div id="desktopShopfront"')),
  desktop: html.slice(html.indexOf('<div id="desktopShopfront"'), html.indexOf('<div id="resultsView"')),
};
/* A store band: a rail (data-store-rail="<key>") or a big tile (a section
   whose door is tiendaJump('<key>')). */
function storeBands(tree) {
  const out = [];
  for (const m of tree.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)) {
    const sec = m[0];
    const rail = /data-store-rail="([a-z0-9]+)"/.exec(sec.slice(0, 400));
    if (rail) { out.push(rail[1]); continue; }
    const tiles = [...sec.matchAll(/<button onclick="tiendaJump\('([a-z0-9]+)'\)"/g)].map((t) => t[1]);
    if (tiles.length && tiles.length <= 2) out.push(...tiles);
  }
  return out;
}

for (const [name, tree] of Object.entries(trees)) {
  await check(`${name} source: no store has two bands (rail or big tile)`, () => {
    const bands = storeBands(tree);
    assert.ok(bands.length >= 10, `${name}: only ${bands.length} store bands found`);
    const dup = bands.filter((k, i) => bands.indexOf(k) !== i);
    assert.deepEqual(dup, [], `${name}: ${bands.join(", ")}`);
    assert.ok(!/La favorita de Estados Unidos/.test(tree), `${name}: the wide Walmart tile is back`);
  });
}

const server = createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname.startsWith("/.netlify/functions/") || u.pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(u.pathname.endsWith("exchange-rate") ? '{"venta":3.75}' : "{}");
    return;
  }
  let path = decodeURIComponent(u.pathname);
  const bundle = /^\/build\/(app-[0-9a-f]+\.js)$/.exec(path);
  if (bundle && existsSync(join(ROOT, "build/min", bundle[1]))) path = "/build/min/" + bundle[1];
  let p = normalize(join(ROOT, path));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(p));
});
await new Promise((resolve, reject) => {
  server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set HOME_STORE_RAILS_PORT`) : e));
  server.listen(PORT, "127.0.0.1", resolve);
});
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  /* Nothing leaves the machine; remote photos are a 1x1 PNG so cards keep their photo. */
  await page.route((url) => url.host !== `127.0.0.1:${PORT}`, (r) => (r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort()));
  await page.goto(BASE + "/", { waitUntil: "load" });
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H + 2000; y += 700) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(100); }
  await page.waitForTimeout(1500);
  /* What a shopper sees: visible store bands in page order. */
  const seen = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.width > 0 && !el.closest("[hidden]") && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden"; };
    const out = [];
    for (const sec of document.querySelectorAll("#homeView section")) {
      if (!vis(sec)) continue;
      const rail = sec.getAttribute("data-store-rail");
      if (rail) { out.push({ k: rail, kind: "rail", label: sec.getAttribute("aria-label"), top: Math.round(sec.getBoundingClientRect().top + scrollY) }); continue; }
      const tiles = [...sec.querySelectorAll(':scope button[onclick^="tiendaJump("]')].filter(vis);
      if (tiles.length && tiles.length <= 2 && !sec.querySelector("section")) for (const t of tiles) out.push({ k: /tiendaJump\('([^']+)'\)/.exec(t.getAttribute("onclick"))[1], kind: "tile", label: sec.getAttribute("aria-label"), top: Math.round(t.getBoundingClientRect().top + scrollY) });
    }
    const latino = [...document.querySelectorAll('#homeView section[aria-label="Diseñadores Latinos"]')].find(vis);
    return { bands: out.sort((a, b) => a.top - b.top), latino: latino ? Math.round(latino.getBoundingClientRect().top + scrollY) : -1 };
  });
  console.log("    ..   390px store bands: " + seen.bands.map((b) => b.k + (b.kind === "tile" ? "(tile)" : "")).join(" > "));

  await check("390px: every store's band appears once on the homepage", () => {
    const keys = seen.bands.map((b) => b.k);
    assert.ok(keys.length >= 10, "only " + keys.length + " store bands rendered");
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    assert.deepEqual([...new Set(dup)], [], "stores shown twice: " + seen.bands.map((b) => `${b.k}@${b.top}(${b.kind})`).join(", "));
  });
  await check("390px: after Diseñadores Latinos the stores open Victoria's Secret, Walmart, Foot Locker, Dick's -- one Walmart", () => {
    assert.ok(seen.latino > 0, "no Diseñadores Latinos band");
    const after = seen.bands.filter((b) => b.top > seen.latino).map((b) => b.k);
    assert.deepEqual(after.slice(0, 4), ["victoriassecret", "walmart", "footlocker", "dicks"], after.join(" > "));
    assert.equal(seen.bands.filter((b) => b.k === "walmart").length, 1, "Walmart count");
    assert.ok(!seen.bands.some((b) => b.top < seen.latino && b.k === "walmart"), "a Walmart band above Diseñadores Latinos");
  });
  await check("390px: each store rail row paints once (one row per store, one card set)", async () => {
    const rows = await page.evaluate(() => [...document.querySelectorAll("#homeView [data-store-rail-row]")].filter((r) => { const b = r.getBoundingClientRect(); return b.height > 0 && !r.closest("[hidden]"); }).map((r) => r.getAttribute("data-store-rail-row")));
    const dup = rows.filter((k, i) => rows.indexOf(k) !== i);
    assert.deepEqual(dup, [], rows.join(", "));
  });
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
