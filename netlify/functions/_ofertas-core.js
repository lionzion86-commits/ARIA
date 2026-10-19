/* ============================================================
   Ofertas, thin (2026-10-19, #409) -- the one place that decides
   which deals a page of ofertas.html shows, and in what order.

   scripts/build-ofertas-slices.mjs uses it to write the first page of
   every (store, sort) pair as a static file under assets/ofertas/
   slices/; netlify/functions/ofertas.js uses it to answer "Mostrar más"
   and the page's search box from assets/ofertas/deals.json. One module,
   so page 2 always continues page 1 in the same order.

   A deal card carries only what the card draws: id, title, brand,
   store, usd, wasUsd, pct, image. Never sizes, descriptions or weights.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PAGE_SIZE = 48;
export const DEALS_FILE = "assets/ofertas/deals.json";
export const SLICES_DIR = "assets/ofertas/slices";
export const SORTS = ["discount", "priceAsc", "priceDesc"];
export const MAX_Q = 80;

/* deals.json keeps each card as an array, in this order. */
export const FIELDS = ["id", "title", "brand", "store", "usd", "wasUsd", "pct", "image"];
export function packCard(c) { return FIELDS.map((f) => (c[f] == null ? "" : c[f])); }
export function unpackCard(a) {
  const c = {};
  for (let i = 0; i < FIELDS.length; i++) c[FIELDS[i]] = a[i];
  return c;
}

/* Accent- and case-blind text, for the search box. */
export function fold(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* Ties broken by id so every page boundary is stable. */
function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
const COMPARE = {
  discount: (a, b) => (b.pct - a.pct) || (a.usd - b.usd) || byId(a, b),
  priceAsc: (a, b) => (a.usd - b.usd) || (b.pct - a.pct) || byId(a, b),
  priceDesc: (a, b) => (b.usd - a.usd) || (b.pct - a.pct) || byId(a, b),
};
export function normSort(s) { return SORTS.includes(s) ? s : "discount"; }
export function normStore(s, stores) {
  const k = String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return k && (!stores || stores.some((x) => x.key === k)) ? k : "";
}
export function normQ(q) { return String(q || "").replace(/\s+/g, " ").trim().slice(0, MAX_Q); }

/* Every word of the query must appear in the title or the brand --
   the old page's substring match, accent-blind and word by word. */
export function selectDeals(cards, { store = "", sort = "discount", q = "" } = {}) {
  let pool = store ? cards.filter((c) => c.store === store) : cards.slice();
  const words = fold(normQ(q)).split(" ").filter(Boolean);
  if (words.length) {
    pool = pool.filter((c) => {
      const t = c._text || (c._text = fold(c.title + " " + c.brand));
      return words.every((w) => t.includes(w));
    });
  }
  return pool.sort(COMPARE[normSort(sort)]);
}

export function pageOf(list, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
  const items = list.slice((p - 1) * size, p * size).map(({ _text, ...c }) => c);
  return { total: list.length, page: p, pages, pageSize: size, items };
}

/* ---------- the function's copy of deals.json ---------- */
const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);

let loaded = null;
export function loadDeals(rootDir) {
  if (loaded && !rootDir) return loaded;
  const dirs = rootDir ? [rootDir] : CANDIDATES;
  for (const dir of dirs) {
    const p = join(dir, DEALS_FILE);
    try {
      if (!existsSync(p)) continue;
      const raw = JSON.parse(readFileSync(p, "utf8"));
      const out = { generatedAt: raw.generatedAt || null, stores: raw.stores || [], cards: (raw.items || []).map(unpackCard) };
      if (!rootDir) loaded = out;
      return out;
    } catch { /* try the next */ }
  }
  throw new Error(`${DEALS_FILE} no está junto a la función de ofertas`);
}
