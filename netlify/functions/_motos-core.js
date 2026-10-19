/* ============================================================
   MOTOS CORE (2026-10-19, #409 track T5) — Aria Motos' grid, shared by
   the build (scripts/build-motos-slices.mjs writes the static pages
   with it) and the endpoint (netlify/functions/motos.js answers the
   search box with it), so the two can never disagree.

   The page's rules, unchanged: RevZilla then Dennis Kirk, priced items
   only, sale first then cheapest, the moto subtype by title words, and
   the filters (type chip, store chip, every word in title/brand/type).

   Files: assets/sections/motos/_fn/items.json, shipped beside the
   function by netlify.toml included_files and found by probing, like
   _search-core.js. No import.meta: Netlify's bundler compiles
   functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PAGE_SIZE = 48;
export const FN_FILE = "assets/sections/motos/_fn/items.json";
export const TYPES = ["all", "cascos", "llantas", "repuestos", "ropa_equipo", "accesorios"];
export const STORES = ["all", "revzilla", "denniskirk"];

export function subType(title) {
  const t = String(title || "").toLowerCase();
  if (/\b(helmet|casco)s?\b/.test(t)) return "cascos";
  if (/\b(tire|tyre|tires|llanta)s?\b/.test(t)) return "llantas";
  if (/\b(brake|pad|rotor|chain|sprocket|filter|gasket|clutch|battery|mirror|lever|spark|belt|repuesto)s?\b/.test(t)) return "repuestos";
  if (/\b(glove|boot|jacket|pant|vest|suit|rain|guante|bota|chaqueta)s?\b/.test(t)) return "ropa_equipo";
  return "accesorios";
}

export function filterList(list, { t = "all", r = "all", q = "" } = {}) {
  const words = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    if (r && r !== "all" && p.retailer !== r) return false;
    if (t && t !== "all" && p.subtype !== t) return false;
    if (words.length) {
      const hay = (p.title + " " + (p.brand || "") + " " + (p.type || "")).toLowerCase();
      for (const w of words) if (hay.indexOf(w) === -1) return false;
    }
    return true;
  });
}

/* t title, b brand, r store, p store price (USD, raw: the page prices
   it), o raw was-price (sales only), s percent off, i photo. */
export function cardOf(p) {
  const c = { t: p.title, r: p.retailer, p: p.rawPrice };
  if (p.brand) c.b = p.brand;
  if (p.salePct > 0) { c.s = p.salePct; if (p.wasPrice > p.rawPrice) c.o = p.wasPrice; }
  if (p.image) c.i = p.image;
  return c;
}
export function pageOf(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  return { count: list.length, page, pages, cards: list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf) };
}

export function fnRow(p) { return [p.title, p.brand || "", p.retailer, p.rawPrice, p.wasPrice || 0, p.salePct || 0, p.image || "", p.type || ""]; }
export function rowItem(r) {
  return { title: r[0], brand: r[1], retailer: r[2], rawPrice: r[3], wasPrice: r[4], salePct: r[5], image: r[6], type: r[7], subtype: subType(r[0]) };
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
      LOADED = JSON.parse(readFileSync(p, "utf8")).rows.map(rowItem);
      return LOADED;
    } catch { /* try the next */ }
  }
  throw new Error(FN_FILE + " no está junto a la función");
}

export function answer(qs, roots) {
  const t = TYPES.includes(qs.t) ? qs.t : "all";
  const r = STORES.includes(qs.r) ? qs.r : "all";
  const q = String(qs.q || "").slice(0, 80);
  const page = Math.max(0, Number(qs.page) || 0);
  const list = filterList(loadItems(roots), { t, r, q });
  if (page > 0 && page * PAGE_SIZE >= list.length) return { status: 404, body: { error: "Sin más productos." } };
  return { status: 200, body: { t, r, q, ...pageOf(list, page) } };
}
