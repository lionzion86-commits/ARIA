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
   (sale-rule.js isOnSale -- the one sale definition -- plus a real
   photo, deduplicated by store + title; m marks the ones under the
   $150 cap, isMixDeal, which alone make the all-stores mix), reduced
   to card fields, written as:

     assets/ofertas/deals.json
        every deal, packed (netlify/functions/ofertas.js reads it to
        answer "Mostrar más" and the search box; never sent to a phone)
     assets/ofertas/slices/<store|all>.<sort>.json
        page 1 (48 cards) of each store and sort, with the total and
        the store list -- each store rail fills from its own
     assets/ofertas/rails.json
        THE CAROUSEL PAGE'S FIRST PAINT (#443, Danny: "the same
        carousel experience as the homepage Ofertas section"): the
        lead rail's cards in the homepage's own order (railsIndex),
        the store rails in sales-led order, and the few cards of the
        stores too small for a rail of their own

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
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { photoCount } from "./lib/photo-counts.js";
import { PAGE_SIZE, DEALS_FILE, SLICES_DIR, SORTS, packCard, selectDeals, pageOf } from "../netlify/functions/_ofertas-core.js";
import { loadAllItems, productClass } from "./build-department-slices.mjs";
import { OFFER_CATEGORIES, DANNY_ORDER, MIN_CAT, offerCategory, storeAudiences } from "./lib/offer-category.js";

export const RAILS_FILE = "assets/ofertas/rails.json";
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
/* The photo count the PDP shard holds for this product (#538), 2+ or 0. */
function photosOf(p) {
  const n = photoCount(ROOT, p.title || "", p.retailer || "");
  return n > 1 ? n : 0;
}
export function buildCards(items, sale) {
  const seen = new Set(), cards = [];
  for (const p of items || []) {
    if (!p || isOffSaleRetailer(p.retailer)) continue;
    /* Keyed on the title as the card shows it: two rows whose titles
       differ only in entities or spacing are one card. */
    const k = (p.retailer || "") + "::" + decodeEntities(p.title || "").trim();
    if (seen.has(k)) continue;
    seen.add(k);
    if (!sale.isOnSale(p)) continue;
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
      m: sale.isMixDeal(p) ? 1 : 0,
      ph: photosOf(p),
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

/* ---------- the carousel page's index (#443) ----------
   THE LEAD RAIL IS THE HOMEPAGE'S OFERTAS RAIL. The same three steps
   the app bundle's renderMobileDealsRail takes over the sale cache,
   taken here over the all-stores mix (m = 1):
     1. pull brands first (OFERTAS_LEAD_BRANDS, ofertasLeadRank), the
        biggest discount deciding within;
     2. the first LEAD_SPREAD cards from different stores
        (spreadDealsByStore);
     3. never more than MAX_RUN cards in a row from one store
        (interleaveRetailerCap), cut to LEAD_N (MOBILE_RAIL_DEALS).
   A pull brand that is off sale has no cards, so it simply ranks
   nothing. STORE RAILS, SALES-LED: the stores with the most deep
   markdowns (50% or more) first, then the deepest single markdown,
   then the most deals. A store with fewer than MIN_RAIL deals has no
   rail of its own: its cards ride in one last rail, deepest first. */
export const LEAD_BRANDS = ["victoriassecret", "sephora", "macys", "gymshark", "youngla"];
export const LEAD_N = 20, LEAD_SPREAD = 5, MAX_RUN = 3, MIN_RAIL = 4, DEEP_PCT = 50;
const leadRank = (c) => { const i = LEAD_BRANDS.indexOf(c.store); return i === -1 ? LEAD_BRANDS.length : i; };
export function spreadByStore(sorted, lead) {
  const first = [], held = [], seen = new Set();
  for (const c of sorted) {
    if (first.length >= lead || seen.has(c.store)) { held.push(c); continue; }
    seen.add(c.store);
    first.push(c);
  }
  while (first.length < lead && held.length) first.push(held.shift());
  return first.concat(held);
}
export function interleaveStoreCap(items, maxRun) {
  const pool = [...items], out = [];
  let run = null, count = 0;
  while (pool.length) {
    let i = pool.findIndex((c) => c.store !== run || count < maxRun);
    if (i < 0) i = 0;
    const c = pool.splice(i, 1)[0];
    if (c.store === run) count++; else { run = c.store; count = 1; }
    out.push(c);
  }
  return out;
}
/* THE LEAD OPENS ON VICTORIA'S SECRET (#443, Danny c.6483501901,
   c.6495111883), as the homepage rail does (ofertasOpenBlock in the
   bundle): its deepest markdowns, up to OPEN_N and one per product
   name, come first; the spread and the run cap order the rest. */
export const OPEN_STORE = "victoriassecret", OPEN_N = 6;
const titleKey = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function openBlock(sorted) {
  const open = [], rest = [], seen = new Set();
  for (const c of sorted) {
    const k = c.store === OPEN_STORE ? titleKey(c.title) : "";
    if (c.store === OPEN_STORE && open.length < OPEN_N && !seen.has(k)) { seen.add(k); open.push(c); }
    else rest.push(c);
  }
  return { open, rest };
}
export function leadRail(cards) {
  const mix = selectDeals(cards, { sort: "discount" });
  const sorted = [...mix].sort((a, b) => (leadRank(a) - leadRank(b)) || (b.pct - a.pct));
  const { open, rest } = openBlock(sorted);
  const tail = interleaveStoreCap(spreadByStore(rest.filter((c) => c.store !== OPEN_STORE), LEAD_SPREAD), MAX_RUN);
  return open.concat(tail, rest.filter((c) => c.store === OPEN_STORE)).slice(0, LEAD_N).map(({ _text, ...c }) => c);
}
/* THE STORE RAILS' CURATED ORDER (#443 c.6546035414, Danny's ruling):
   the front of [Por tienda] sells the mall, not the skate shops.
     - STORE_LEAD opens it, in this order (a store with no rail is
       simply skipped): Victoria's Secret, Zumiez, Walmart, then the
       gym and beauty names Danny named, Born Primitive and SKIMS;
     - OUT_OF_FRONT stores (Venum, and the surf and skate shops) sit no
       higher than position FRONT_N: out of the lead, not at the bottom;
     - STORE_LAST (CCS) goes to the very bottom;
     - every other store keeps its sales-led place below the lead.
   Editorial order for the Ofertas store rails only: search lanes and
   store pages are untouched. */
export const STORE_LEAD = ["victoriassecret", "zumiez", "walmart", "bornprimitive", "skims"];
export const OUT_OF_FRONT = ["venum", "surfstation", "islandwatersports", "quietstorm", "mainland", "parrot", "valsurf"];
export const STORE_LAST = ["ccs"];
export const FRONT_N = 12;
export function curatedStoreOrder(ranked) {
  const at = (k) => ranked.find((s) => s.key === k);
  const lead = STORE_LEAD.map(at).filter(Boolean);
  const last = STORE_LAST.map(at).filter(Boolean);
  const placed = new Set([...STORE_LEAD, ...STORE_LAST]);
  const rest = ranked.filter((s) => !placed.has(s.key));
  const out = lead.slice();
  const held = [];
  for (const s of rest) {
    if (OUT_OF_FRONT.includes(s.key) && out.length < FRONT_N) held.push(s);
    else out.push(s);
    while (held.length && out.length >= FRONT_N) out.push(held.shift());
  }
  return out.concat(held, last);
}
export function railsIndex(cards, stores, generatedAt, categories = cats(cards)) {
  const stat = {};
  for (const c of cards) {
    const s = stat[c.store] || (stat[c.store] = { top: 0, deep: 0 });
    if (c.pct > s.top) s.top = c.pct;
    if (c.pct >= DEEP_PCT) s.deep++;
  }
  const ranked = stores.map((s) => ({ ...s, top: stat[s.key].top, deep: stat[s.key].deep }))
    .sort((a, b) => (b.deep - a.deep) || (b.top - a.top) || (b.n - a.n) || (a.key < b.key ? -1 : 1));
  const small = new Set(ranked.filter((s) => s.n < MIN_RAIL).map((s) => s.key));
  return {
    generatedAt,
    total: cards.length,
    lead: leadRail(cards),
    stores: curatedStoreOrder(ranked.filter((s) => !small.has(s.key))),
    more: cards.filter((c) => small.has(c.store))
      .sort((a, b) => (b.pct - a.pct) || (a.usd - b.usd) || (a.id < b.id ? -1 : 1))
      .map(({ _text, ...c }) => c),
    moreStores: ranked.filter((s) => small.has(s.key)),
    /* [Por categoría]: the categories with real offer volume, each rail
       filling from its own slice (cat-<key>.discount.json). */
    cats: categories,
  };
}

/* ---------- Por categoría (#443 c.6544455377) ----------
   Each card's category, read from its catalogue row (bucket, type) when
   the catalogue has it, else from the feed row's own name; then the
   categories with real offer volume, Danny's six first, the rest by
   size. */
export function categorize(cards, feedItems, all) {
  const key = (r, t) => r + "::" + decodeEntities(String(t || "")).trim().toLowerCase();
  const rows = new Map();
  for (const p of all) { const k = key(p.retailer, p.title); if (!rows.has(k)) rows.set(k, p); }
  const feedRow = new Map();
  for (const p of feedItems || []) { const k = key(p.retailer, p.title); if (!feedRow.has(k)) feedRow.set(k, p); }
  const audience = storeAudiences(all, productClass);
  for (const c of cards) {
    const k = key(c.store, c.title);
    const row = rows.get(k) || { title: c.title, brand: c.brand, retailer: c.store, type: (feedRow.get(k) || {}).type || "", bucket: "" };
    c.k = offerCategory(row, productClass(row), audience);
  }
  return cats(cards);
}
export function cats(cards) {
  const stat = {};
  for (const c of cards) {
    if (!c.k) continue;
    const s = stat[c.k] || (stat[c.k] = { n: 0, top: 0 });
    s.n++;
    if (c.pct > s.top) s.top = c.pct;
  }
  const list = OFFER_CATEGORIES.map(([key, label], i) => ({ key, label, i, ...(stat[key] || { n: 0, top: 0 }) }))
    .filter((c) => c.n >= MIN_CAT);
  const first = list.filter((c) => c.i < DANNY_ORDER), rest = list.filter((c) => c.i >= DANNY_ORDER).sort((a, b) => b.n - a.n);
  return first.concat(rest).map(({ i, ...c }) => c);
}

export function build(root = ROOT) {
  const sale = loadSaleRule(root);
  const feed = JSON.parse(readFileSync(join(root, "ofertas-feed.json"), "utf8"));
  const cards = buildCards(feed.items, sale);
  const stores = storeList(cards);
  const categories = categorize(cards, feed.items, loadAllItems(root));
  const generatedAt = feed.generatedAt || null;
  return { generatedAt, stores, cats: categories, cards };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { generatedAt, stores, cats: categories, cards } = build();
  const dir = join(ROOT, SLICES_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(ROOT, DEALS_FILE), JSON.stringify({ generatedAt, pageSize: PAGE_SIZE, stores, cats: categories, items: cards.map(packCard) }));
  writeFileSync(join(ROOT, RAILS_FILE), JSON.stringify(railsIndex(cards, stores, generatedAt, categories)));
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
  /* Page 1 of each category, every store, deepest first. */
  for (const c of categories) {
    const out = pageOf(selectDeals(cards, { cat: c.key, sort: "discount" }), 1);
    const f = join(dir, `cat-${c.key}.discount.json`);
    writeFileSync(f, JSON.stringify({ generatedAt, store: "", cat: c.key, sort: "discount", q: "", ...out }));
    biggest = Math.max(biggest, statSync(f).size);
    files++;
  }
  const dealsKB = Math.round(statSync(join(ROOT, DEALS_FILE)).size / 1024);
  console.log(`${cards.length} deals, ${stores.length} stores, ${categories.length} categories (${categories.map((c) => c.key + " " + c.n).join(", ")}); ${DEALS_FILE} ${dealsKB}KB; ${files} slices in ${SLICES_DIR} (largest ${Math.round(biggest / 1024)}KB, ${readdirSync(dir).length} files)`);
}
