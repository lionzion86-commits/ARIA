#!/usr/bin/env node
/* ============================================================
   assets/home/shelves/perfumes.json -- THE PERFUMES CAROUSEL (#443).

   WHAT. One small shelf file (a few KB) that two rails paint from:
   the home page's Perfumes rail (lazy, when the section nears the
   screen -- the Bolsos/Moda pattern) and the lead rail of Aria Beauty >
   Fragancias. Nothing catalogue-sized is fetched for either: the
   Mountain Test.

   HOW.
     1. scripts/lib/perfume-rail.js scanPerfumeRows() reads EVERY
        catalogue in the repo root and keeps the perfume bottles
        (scripts/lib/fragrance.js, the one fragrance definition).
     2. Off-sale stores (/off-sale.js) and the stores ruled out for this
        rail (EXCLUDED_RETAILERS -- Sephora) are dropped.
     3. Each row is priced by the page's own normalizeLiveItem() in a
        headless browser over the committed repo -- the same price every
        other card on the site shows (soles first, US$ under it, margin
        never visible). Quarantined photos and rows without a real photo
        are dropped (the page's own notQuarantined / hasRealImage).
     4. Sales only (sale-rule.js), plus the named hero anchors
        (scripts/lib/perfume-hero-anchors.json) that exist in a live
        catalogue; ordered by orderRail().

   The builder prints the census (bottles and sales, by store and house,
   with and without the excluded stores) every run.

   A NEW SOURCE plugs in with no UI change -- see perfume-rail.js.

   RUN (Playwright + Chromium, never "playwright install"):
     node scripts/build-perfumes-shelf.mjs
   PLAYWRIGHT_CHROMIUM=<path> uses an installed Chromium.
   scripts/build-home-shelves.mjs leaves perfumes.json in place.
   scripts/test/perfume-carousel-tests.mjs holds the rules.
   ============================================================ */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanPerfumeRows, census, loadHeroAnchors, heroAnchorOf, designerOf, orderRail, RAIL_MIN } from "./lib/perfume-rail.js";
import { cardOf, SHELVES_DIR } from "./build-home-shelves.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PERFUMES_SHELF = "perfumes.json";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css" };
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

/* The page prices each row exactly as it prices every card. */
async function priceRows(rows) {
  const { chromium } = await import("playwright");
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.route(/\.(png|jpe?g|webp|gif|avif)(\?|$)/i, (r) => r.fulfill({ status: 204, body: "" }));
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForFunction(() => typeof normalizeLiveItem === "function" && typeof hasRealImage === "function", null, { timeout: 60000 });
    return await page.evaluate((rows) => rows.map((r) => {
      if (!notQuarantined(r.raw)) return null;
      let it = null;
      try { it = normalizeLiveItem(r.raw, { retailer: r.retailer }); } catch { return null; }
      if (!it || !it.title || !(Number(it.price) > 0) || !hasRealImage(it)) return null;
      return { ...it, retailer: r.retailer };
    }), rows.map((r) => ({ raw: r.raw, retailer: r.retailer })));
  } finally {
    await browser.close();
    srv.close();
  }
}

export async function buildPerfumesShelf() {
  const rows = scanPerfumeRows(ROOT);
  const anchors = loadHeroAnchors(ROOT);
  const eligible = rows.filter((r) => !r.offSale && !r.excluded)
    .map((r) => ({ ...r, anchor: heroAnchorOf(r.raw, anchors) }))
    .filter((r) => r.onSale || r.anchor);
  const priced = await priceRows(eligible);
  const cards = [];
  eligible.forEach((r, i) => {
    const it = priced[i];
    if (!it) return;
    const card = cardOf(it);
    /* The house named in the title when the catalogue has no brand field
       (Walmart): read, never invented. */
    if (!card.brand && r.designer) card.brand = r.designer;
    /* Fragrance is beauty, never a clothing aisle -- whatever bucket the
       store filed it under (#443 standing rule). */
    card.departments = ["beauty"];
    /* No door to the store's own site travels with the card (never link
       out); the product page opens the record by store and title. */
    delete card.url;
    /* The card prices the page computed; onSale is the one sale rule on
       the store's own numbers. */
    card.onSale = r.onSale;
    if (!r.onSale) { delete card.originalPrice; }
    if (r.anchor) card.heroAnchor = r.anchor.id;
    cards.push(card);
  });
  const picks = orderRail(cards);
  return { rows, picks, census: census(rows), anchorsFound: [...new Set(cards.filter((c) => c.heroAnchor).map((c) => c.heroAnchor))] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { picks, census: c, anchorsFound } = await buildPerfumesShelf();
  const dir = join(ROOT, SHELVES_DIR);
  mkdirSync(dir, { recursive: true });
  const body = { v: 1, min: RAIL_MIN, picks };
  const text = JSON.stringify(body);
  writeFileSync(join(dir, PERFUMES_SHELF), text);
  console.log(`${SHELVES_DIR}/${PERFUMES_SHELF}: ${picks.length} cards, ${(text.length / 1024).toFixed(1)}KB raw`);
  console.log(`anchors found in live catalogues: ${anchorsFound.join(", ") || "(none)"}`);
  for (const p of picks) console.log(`  ${p.heroAnchor ? "ANCHOR " : "SALE   "} $${p.price}  ${p.brand || ""} | ${p.title} [${p.retailer}]`);
  console.log("census (perfume bottles, live stores):");
  console.log(JSON.stringify(c, null, 1));
}
