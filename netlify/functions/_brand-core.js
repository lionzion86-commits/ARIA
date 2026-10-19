/* ============================================================
   BRAND CORE (2026-10-19, #409 track T5) — the carousels of
   marca.html, shared by the build (scripts/build-brand-index.mjs)
   and the endpoint (netlify/functions/brand.js), so the static slices
   and the live answers can never disagree.

   marca.html serves every brand on the site (5,000+) from one URL,
   ?marca=<key>. A brand is the normalized brand field (the site's
   brandKeyOf) or, for keys of 4+ characters, a whole word of the
   title ("Young LA" items with an empty brand field) -- the page's
   own rule, unchanged.

   Files: assets/sections/marca/_fn/items.json, shipped beside the
   function by netlify.toml included_files and found by probing, like
   _search-core.js. No import.meta: Netlify's bundler compiles
   functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PAGE_SIZE = 48;   // cards per "Ver todo" / "Mostrar más" slice
export const RAIL_CARDS = 12;  // cards drawn in one carousel
export const FN_FILE = "assets/sections/marca/_fn/items.json";
export const KEY_RX = /^[a-z0-9]{1,60}$/;

/* The page's carousels after the sales one, in this order. */
export const PRODUCT_TYPES = [
  { key: "trajes_bano", label: "Trajes de Baño" },
  { key: "carteras", label: "Carteras y mochilas" },
  { key: "joyas", label: "Joyas" },
  { key: "zapatos", label: "Zapatos" },
  { key: "sombreros", label: "Sombreros" },
  { key: "accesorios", label: "Accesorios" },
  { key: "ropa", label: "Ropa" },
];

export function brandKeyOf(label) {
  return String(label == null ? "" : label).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
export function titleWords(name) {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) || [];
}

/* Exact normalized brand key, or (keys of 4+) a whole title word. */
export function filterByBrand(items, bkey) {
  if (!bkey) return [];
  const out = [];
  for (const p of items) {
    if (p.brandKey === bkey) { out.push(p); continue; }
    if (bkey.length < 4) continue;
    const words = p.words || (p.words = " " + titleWords(p.name).join(" ") + " ");
    if (words.indexOf(" " + bkey + " ") !== -1) out.push(p);
  }
  return out;
}
/* Most common brand label among the matches (first to reach the top count). */
export function deriveBrandLabel(items) {
  const counts = {}; let best = "", bestN = 0;
  for (const p of items) {
    const b = p.brand; if (!b) continue;
    counts[b] = (counts[b] || 0) + 1;
    if (counts[b] > bestN) { bestN = counts[b]; best = b; }
  }
  return best;
}

/* Ofertas de <marca> (biggest discount first) or, with no sales,
   Destacados de <marca> (dearest first); then one per product type. */
export function buildRails(items, label) {
  const stable = (arr, cmp) => arr.map((p, i) => ({ p, i })).sort((a, b) => cmp(a.p, b.p) || (a.i - b.i)).map((x) => x.p);
  const rails = [];
  const sales = items.filter((p) => p.pct > 0);
  if (sales.length) rails.push({ title: "Ofertas de " + label, items: stable(sales, (a, b) => b.pct - a.pct) });
  else rails.push({ title: "Destacados de " + label, items: stable(items, (a, b) => b.price - a.price) });
  const byType = {};
  for (const p of items) (byType[p.ptype || "ropa"] = byType[p.ptype || "ropa"] || []).push(p);
  for (const t of PRODUCT_TYPES) if ((byType[t.key] || []).length) rails.push({ title: t.label, items: byType[t.key] });
  return rails;
}

/* A card: t title, b brand, r store, p store price (USD, before Aria's
   margin and tax -- the page prices it), o was-price on that basis
   (sales only), s percent off, i photo. */
export function cardOf(p) {
  const c = { t: p.name, r: p.retailer, p: p.price };
  if (p.brand) c.b = p.brand;
  if (p.pct > 0) { c.s = p.pct; if (p.orig > p.price) c.o = p.orig; }
  if (p.image) c.i = p.image;
  return c;
}

export function headOf(key, items, allLabels) {
  const label = deriveBrandLabel(items) || (key.charAt(0).toUpperCase() + key.slice(1));
  const rails = items.length ? buildRails(items, label) : [];
  const labels = {};
  for (const p of items) if (allLabels[p.retailer]) labels[p.retailer] = allLabels[p.retailer];
  return {
    v: 1, key, label, count: items.length, labels, pageSize: PAGE_SIZE, railCards: RAIL_CARDS,
    rails: rails.map((r, i) => ({ i, title: r.title, count: r.items.length, pages: Math.ceil(r.items.length / PAGE_SIZE), cards: r.items.slice(0, RAIL_CARDS).map(cardOf) })),
  };
}
export function pageOf(key, items, rail, page) {
  const label = deriveBrandLabel(items) || (key.charAt(0).toUpperCase() + key.slice(1));
  const r = buildRails(items, label)[rail];
  if (!r || !(page >= 0)) return null;
  return { key, rail, title: r.title, page, pages: Math.ceil(r.items.length / PAGE_SIZE), count: r.items.length, cards: r.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf) };
}

/* The endpoint's copy: one row per product. */
export function fnRow(p) { return [p.name, p.brand, p.retailer, p.price, p.orig || 0, p.pct || 0, p.image, p.ptype]; }
export function rowItem(r) {
  return { name: r[0], brand: r[1], brandKey: brandKeyOf(r[1]), retailer: r[2], price: r[3], orig: r[4], pct: r[5], image: r[6], ptype: r[7] };
}

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
let LOADED = null;
export function loadItems(roots = CANDIDATES) {
  if (LOADED) return LOADED;
  for (const dir of roots) {
    const p = join(dir, FN_FILE);
    try {
      if (!existsSync(p)) continue;
      const f = JSON.parse(readFileSync(p, "utf8"));
      LOADED = { labels: f.labels || {}, items: (f.rows || []).map(rowItem) };
      return LOADED;
    } catch { /* try the next */ }
  }
  throw new Error(FN_FILE + " no está junto a la función");
}

/* One answer: a brand's head, or one page of one of its carousels. */
export function answer(qs, roots) {
  const key = brandKeyOf(qs.marca || "");
  if (!KEY_RX.test(key)) return { status: 400, body: { error: "Falta la marca." } };
  const { items, labels } = loadItems(roots);
  const mine = filterByBrand(items, key);
  if (qs.rail !== undefined && qs.rail !== "") {
    const out = pageOf(key, mine, Number(qs.rail), Number(qs.page) || 0);
    return out ? { status: 200, body: out } : { status: 404, body: { error: "Sin más productos." } };
  }
  return { status: 200, body: headOf(key, mine, labels) };
}
