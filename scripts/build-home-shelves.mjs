#!/usr/bin/env node
/* ============================================================
   assets/home/shelves/ — THE HOME PAGE'S SHELVES, PRECOMPUTED.

   WHY (2026-10-19, #417 night order 3). Scrolling the home page on a
   phone downloaded 26.7MB of catalogue JSON (gzipped): every rail
   fetched its store's whole catalogue file, and the category zone,
   Bolsos, Joyas and Moda waited on all 63 sources -- to show a dozen
   cards each. On Danny's iPhone the page took ~30s and reloaded itself
   (Safari reclaiming the tab's memory). The Mountain Test standard:
   nothing catalogue-sized on any path a shopper takes.

   HOW. Nothing is re-implemented. This loads the real home page in a
   headless browser, against the committed catalogues, lets the page's
   own code compute every shelf exactly as it does for a shopper (store
   rails, category zone, brand strip, Fiestas, Bolsos, Joyas, Joyas de
   lujo, Moda, department tiles and their brand lines), then reads the
   answers out of the page and writes them as small files:

     assets/home/shelves/index.json      families, tiles, brand strip
     assets/home/shelves/store-<key>.json  one store rail
     assets/home/shelves/<family>.json   one rail family

   At runtime each rail fetches its own slice (a few KB) instead of the
   catalogue (megabytes). When a slice is missing the rail falls back to
   the old path, so a stale or absent build never breaks the page.

   REGENERATE after any catalogue change (with Playwright + Chromium):
     npm i --no-save playwright
     node scripts/build-home-shelves.mjs
   PLAYWRIGHT_CHROMIUM=<path> uses an installed Chromium.
   scripts/test/home-shelves-tests.mjs fails when a shelf shows a
   product the catalogues no longer carry.
   ============================================================ */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const SHELVES_DIR = "assets/home/shelves";

/* What a card and a tap need. Everything else stays in the catalogue
   (producto.html loads the full record by name and store). */
const CARD_FIELDS = ["title", "brand", "price", "originalPrice", "regularPrice", "wasPrice", "was_price", "compareAt",
  "onSale", "image", "retailer", "departments", "dutiableUsd", "weightKg", "catalogWeightKg", "rating", "sizes", "type",
  "joyasStyle", "finalPrice", "url"];
export function cardOf(p) {
  const out = {};
  for (const k of CARD_FIELDS) if (p && p[k] !== undefined && p[k] !== null && p[k] !== "") out[k] = p[k];
  return out;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(p));
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function scrollThrough(page) {
  const H = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < H + 1000; y += 600) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(250);
  }
}

export async function snapshotShelves() {
  const { chromium } = await import("playwright");
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    /* Only the repo: no live sales API, no retailer images, no fonts. */
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.route(/\.(png|jpe?g|webp|gif|avif)(\?|$)/i, (r) => r.fulfill({ status: 204, body: "" }));
    /* Rails inside a [hidden] section, or in another SPA view (the
       Tiendas view's rails), are not the home page: they keep their own
       path. */
    /* The snapshot computes from the catalogues, never from a shelf. */
    /* perfumes.json is the exception: scripts/build-perfumes-shelf.mjs
       builds it first, and the Perfumes pill's shelf is that file. */
    await page.route(/\/assets\/home\/shelves\/(?!perfumes\.json)/, (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(base + "/", { waitUntil: "load" });
    await scrollThrough(page);
    /* Phone, tablet (the surf shops' rails live only there) and desktop
       shopfronts each carry their own rows. */
    for (const width of [900, 1400]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await scrollThrough(page);
    }
    /* Every family settles, then the full catalogue (Bolsos and the zone
       load it) gives the tiles and the brand strip their full counts. */
    await page.waitForFunction(() => {
      const keys = [...new Set([...document.querySelectorAll("[data-store-rail-row]")].filter((r) => { const v = r.closest(".view"); return !r.closest("[hidden]") && (!v || getComputedStyle(v).display !== "none"); }).map((r) => r.getAttribute("data-store-rail-row")))];
      return keys.every((k) => Array.isArray(storeRailsRendered[k]))
        && Object.keys(categoryRailsRendered).length > 0
        && Array.isArray(bolsosRendered) && bolsosRendered.length > 0
        && Array.isArray(modaRendered) && modaRendered.length > 0
        && Array.isArray(joyasLujoRendered) && joyasLujoRendered.length > 0
        && joyasRendered && Array.isArray(joyasRendered.mixed) && joyasRendered.mixed.length > 0
        /* Fiestas paints only where the page has its rows (none today). */
        && (!document.querySelector("[data-fiestas-rail-row]") || Object.keys(fiestasRailsRendered).length > 0);
    }, null, { timeout: 180000, polling: 1000 }).catch(async (e) => {
      const state = await page.evaluate(() => {
        const keys = [...new Set([...document.querySelectorAll("[data-store-rail-row]")].filter((r) => { const v = r.closest(".view"); return !r.closest("[hidden]") && (!v || getComputedStyle(v).display !== "none"); }).map((r) => r.getAttribute("data-store-rail-row")))];
        return { storeMissing: keys.filter((k) => !Array.isArray(storeRailsRendered[k])), category: Object.keys(categoryRailsRendered).length,
          bolsos: (bolsosRendered || []).length, moda: (modaRendered || []).length, joyasLujo: (joyasLujoRendered || []).length,
          joyas: joyasRendered && joyasRendered.mixed ? joyasRendered.mixed.length : null, fiestas: Object.keys(fiestasRailsRendered).length };
      });
      throw new Error("the page did not compute every shelf: " + JSON.stringify(state));
    });
    await page.evaluate(() => loadDepartmentCache());
    /* THE SHELVES A SHOPPER SEES AFTER THE MARKDOWNS ARRIVE (2026-10-19,
       #413). The store rails are sales-only (storeRailPicks, Danny
       2026-10-03), but they first compute before the file-backed
       markdowns are folded in, and the snapshot used to be taken in that
       window: 17 of 19 saved store shelves were the best-seller fill,
       not one sale among them. The page's own enrich runs here, and its
       own repaint recomputes every shelf, before anything is read. */
    await page.evaluate(async () => { await enrichSalesFromCatalog(); await repaintRailsAfterEnrich(); });
    return await page.evaluate(() => {
      const keys = [...new Set([...document.querySelectorAll("[data-store-rail-row]")].filter((r) => { const v = r.closest(".view"); return !r.closest("[hidden]") && (!v || getComputedStyle(v).display !== "none"); }).map((r) => r.getAttribute("data-store-rail-row")))];
      const brandLines = {};
      for (const el of document.querySelectorAll("[data-brandline]")) {
        const k = el.getAttribute("data-brandline");
        brandLines[k] = topBrandsFor(k, departmentCacheData);
      }
      const tiles = homeRowTiles().map((t) => { const o = {}; for (const [k, v] of Object.entries(t)) if (!k.startsWith("_") && typeof v !== "function") o[k] = v; return o; });
      return {
        store: Object.fromEntries(keys.map((k) => [k, storeRailsRendered[k]])),
        category: categoryRailsRendered,
        fiestas: fiestasRailsRendered,
        bolsos: bolsosRendered,
        joyas: joyasRendered.mixed,
        joyasLujo: joyasLujoRendered,
        moda: modaRendered,
        brandStrip: brandStripBrands(),
        tiles,
        brandLines,
      };
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

/* The snapshot as files: one per store rail, one per family, an index. */
export function shelfFiles(snap) {
  const cards = (list) => (Array.isArray(list) ? list.map(cardOf) : []);
  const files = {};
  for (const [k, list] of Object.entries(snap.store)) files[`store-${k}.json`] = { picks: cards(list) };
  files["category.json"] = { rails: Object.fromEntries(Object.entries(snap.category).map(([k, l]) => [k, cards(l)])) };
  files["fiestas.json"] = { rails: Object.fromEntries(Object.entries(snap.fiestas).map(([k, l]) => [k, cards(l)])) };
  for (const fam of ["bolsos", "joyas", "joyasLujo", "moda"]) files[`${fam}.json`] = { picks: cards(snap[fam]) };
  files["index.json"] = {
    v: 1,
    stores: Object.keys(snap.store),
    tiles: snap.tiles,
    brandLines: snap.brandLines,
    brandStrip: snap.brandStrip,
  };
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const snap = await snapshotShelves();
  const files = shelfFiles(snap);
  const dir = join(ROOT, SHELVES_DIR);
  /* perfumes.json is scripts/build-perfumes-shelf.mjs's file (#443): kept. */
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f !== "perfumes.json") rmSync(join(dir, f));
  mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const [name, body] of Object.entries(files)) {
    const text = JSON.stringify(body);
    total += text.length;
    writeFileSync(join(dir, name), text);
  }
  console.log(`${SHELVES_DIR}: ${Object.keys(files).length} files, ${(total / 1024).toFixed(0)}KB raw`);
}
