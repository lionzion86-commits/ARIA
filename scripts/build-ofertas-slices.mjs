#!/usr/bin/env node
/* ============================================================
   assets/ofertas/ -- OFERTAS.HTML'S DEALS, SLICED (2026-10-19, #409).

   WHY. ofertas.html downloaded ofertas-feed-lite.json (751KB, ~100KB
   gzipped: 800 full feed items with sizes, descriptions and weights)
   to draw every deal it held at once -- ~755 cards, every photo asked
   for by the browser's own lazy loader -- and it only ever saw the
   four stores at the head of the feed. The Mountain Test: nothing
   catalogue-sized on the path, 48 cards at a time.

   WHAT. From ofertas-feed.json, the deals the page has always shown
   (sale-rule.js isMixDeal -- the one sale definition and the $150
   cap -- plus a real photo, deduplicated by store + title), reduced to
   card fields, written as:

     assets/ofertas/deals.json
        every deal, packed (netlify/functions/ofertas.js reads it to
        answer "Mostrar más" and the search box; never sent to a phone)
     assets/ofertas/slices/<store|all>.<sort>.json
        page 1 (48 cards) of each store and sort, with the total and
        the store list -- what the page paints first, from the CDN

   Order and paging come from netlify/functions/_ofertas-core.js, the
   same module the function uses, so page 2 continues page 1.

   This does not touch ofertas-feed-lite.json (producto.html and the app
   bundle read it; scripts/build-ofertas-lite.mjs builds it).

   REGENERATE whenever ofertas-feed.json is rebuilt:
     node scripts/build-ofertas-slices.mjs
   scripts/test/ofertas-thin-tests.mjs fails when the slices are stale.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { RETAILERS } from "./lib/retailers.js";
import { PAGE_SIZE, DEALS_FILE, SLICES_DIR, SORTS, packCard, selectDeals, pageOf } from "../netlify/functions/_ofertas-core.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/* The one on-sale definition, exactly as the page loads it. */
export function loadSaleRule(root = ROOT) {
  const sandbox = { globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(root, "sale-rule.js"), "utf8"), sandbox);
  return sandbox.AriaSale;
}

/* The page's realImage: the first usable http photo. */
export function realImage(p) {
  const cands = [p.image, p.imageUrl, p.img, p.thumbnail, ...(Array.isArray(p.images) ? p.images : [])];
  for (const u of cands) {
    if (typeof u !== "string" || !u) continue;
    if (u.includes("foto-en-camino") || u.includes("placeholder") || u.includes("no-image")) continue;
    if (u.indexOf("http") === 0 && u.length > 20) return u;
  }
  return null;
}

/* Scraped text is text: "Lizzie &#38; Oliver" ships as "Lizzie & Oliver". */
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "®", trade: "™", copy: "©", deg: "°", eacute: "é", ntilde: "ñ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
export function decodeEntities(s) {
  if (typeof s !== "string" || !s.includes("&")) return s || "";
  for (let pass = 0; pass < 2 && s.includes("&"); pass++) {
    s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      const v = NAMED[e.toLowerCase()];
      return v === undefined ? m : v;
    });
  }
  return s;
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;
export function dealId(store, title) {
  return createHash("sha1").update(store + "::" + title).digest("hex").slice(0, 12);
}

/* Feed items -> cards, the page's filter and dedupe. */
export function buildCards(items, sale) {
  const seen = new Set(), cards = [];
  for (const p of items || []) {
    if (!p) continue;
    const k = (p.retailer || "") + "::" + (p.title || "");
    if (seen.has(k)) continue;
    seen.add(k);
    if (!sale.isMixDeal(p)) continue;
    const image = realImage(p);
    if (!image) continue;
    cards.push({
      id: dealId(p.retailer || "", p.title || ""),
      title: decodeEntities(p.title || "").trim(),
      brand: decodeEntities(p.brand || "").trim(),
      store: String(p.retailer || ""),
      usd: round2(p.price),
      wasUsd: round2(sale.originalPrice(p)),
      pct: sale.discountPct(p),
      image,
    });
  }
  return cards;
}

export function storeList(cards) {
  const n = {};
  for (const c of cards) n[c.store] = (n[c.store] || 0) + 1;
  return Object.keys(n).sort().map((key) => {
    const label = RETAILERS[key] && RETAILERS[key].label;
    return label ? { key, label, n: n[key] } : { key, n: n[key] };
  });
}

export function build(root = ROOT) {
  const sale = loadSaleRule(root);
  const feed = JSON.parse(readFileSync(join(root, "ofertas-feed.json"), "utf8"));
  const cards = buildCards(feed.items, sale);
  const stores = storeList(cards);
  const generatedAt = feed.generatedAt || null;
  return { generatedAt, stores, cards };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { generatedAt, stores, cards } = build();
  const dir = join(ROOT, SLICES_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(ROOT, DEALS_FILE), JSON.stringify({ generatedAt, pageSize: PAGE_SIZE, stores, items: cards.map(packCard) }));
  let files = 0, biggest = 0;
  for (const scope of ["all", ...stores.map((s) => s.key)]) {
    for (const sort of SORTS) {
      const out = pageOf(selectDeals(cards, { store: scope === "all" ? "" : scope, sort }), 1);
      const f = join(dir, `${scope}.${sort}.json`);
      writeFileSync(f, JSON.stringify({ generatedAt, store: scope === "all" ? "" : scope, sort, q: "", ...out, stores }));
      biggest = Math.max(biggest, statSync(f).size);
      files++;
    }
  }
  const dealsKB = Math.round(statSync(join(ROOT, DEALS_FILE)).size / 1024);
  console.log(`${cards.length} deals, ${stores.length} stores; ${DEALS_FILE} ${dealsKB}KB; ${files} slices in ${SLICES_DIR} (largest ${Math.round(biggest / 1024)}KB, ${readdirSync(dir).length} files)`);
}
