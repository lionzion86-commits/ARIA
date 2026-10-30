/* ============================================================
   STOREFRONT CORE (2026-10-19, #409 track T2) — what tienda.html's
   grids show past its first screen, shared by the build
   (scripts/build-store-slices.mjs writes each store's rows with it) and
   the endpoint (netlify/functions/tienda.js answers with it), so the two
   can never disagree.

   The first screen of every storefront is static (assets/tienda/<key>/
   index.json: chips, rail titles and each rail's first cards). This
   answers what depends on the shopper, 48 cards at a time:
     ?store=<k>&rail=<r>&page=<n>             "Ver todo" / "Mostrar más"
     ?store=<k>[&d=][&g=][&c=][&q=][&sort=][&page=]
                                              a chip, the search box, the
                                              sort menu -- or all three

   Files: assets/tienda/_fn/<key>.json, shipped beside the function by
   netlify.toml included_files and found by probing, like
   _department-core.js. No import.meta: Netlify's bundler compiles
   functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PAGE_SIZE = 48;
export const FN_DIR = "assets/tienda/_fn";
export const STORE_KEY_RX = /^[a-z0-9_]{2,40}$/;
export const SORTS = ["relevance", "discount", "priceAsc", "priceDesc"];

/* One row per product, in the store's own order:
   [name, brand, price (store's USD), was (sales only, else 0),
    pct off (the one sale rule, else 0), image, dept, gender, cat,
    photos (2+ only, scripts/lib/photo-counts.js; else absent)] */
export const ROW = { name: 0, brand: 1, price: 2, was: 3, pct: 4, image: 5, dept: 6, gender: 7, cat: 8, ph: 9 };

/* A card: what the tile and the tap need. The page prices it (tiered
   margin + tax, soles first) with its own finalUsd. */
export function cardOfRow(r) {
  const c = { name: r[0], price: r[2], image: r[5] };
  if (r[1]) c.brand = r[1];
  if (r[3]) c.was = r[3];
  if (r[9] > 1) c.ph = r[9];
  return c;
}

export function foldText(s) {
  s = String(s || "").toLowerCase();
  try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch { /* old engine */ }
  return s;
}

/* The store page's sale-first order: on sale before full price, deeper
   discount first, then the dearer product (hero products lead instead of
   cheap accessories). */
export function saleCompare(a, b) {
  const ta = a[4] > 0 ? 1 : 0, tb = b[4] > 0 ? 1 : 0;
  if (ta !== tb) return tb - ta;
  if (a[4] !== b[4]) return b[4] - a[4];
  return b[2] - a[2];
}

/* Every word of the search box in the title or brand. With the
   "Destacados" order, the product the words name leads: a title whose
   head ("Brand - Product", before the first qualifier) holds every word
   comes before one that only mentions them ("...for AirPods"). */
export function searchRows(rows, q) {
  const words = foldText(q).split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  const lead = [], rest = [];
  for (const r of rows) {
    const t = foldText(r[0] + " " + r[1]);
    let ok = true;
    for (const w of words) if (t.indexOf(w) === -1) { ok = false; break; }
    if (!ok) continue;
    const head = foldText(String(r[0]).split(/ - | with | for | para | con /i).slice(0, 2).join(" "));
    let inHead = true;
    for (const w of words) if (head.indexOf(w) === -1) { inHead = false; break; }
    (inHead ? lead : rest).push(r);
  }
  return lead.concat(rest);
}

export function sortRows(rows, sort) {
  if (sort === "priceAsc") return rows.slice().sort((a, b) => a[2] - b[2]);
  if (sort === "priceDesc") return rows.slice().sort((a, b) => b[2] - a[2]);
  if (sort === "discount") return rows.slice().sort(saleCompare);
  return rows;
}

export function pageOf(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const n = Math.min(Math.max(1, Math.floor(Number(page) || 1)), pages);
  return { page: n, pages, total: list.length, items: list.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE).map(cardOfRow) };
}

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
const cache = new Map();
export function loadStore(key, roots = CANDIDATES) {
  key = String(key || "");
  if (!STORE_KEY_RX.test(key)) return null;
  if (cache.has(key)) return cache.get(key);
  for (const dir of roots) {
    const p = join(dir, FN_DIR, key + ".json");
    try {
      if (!existsSync(p)) continue;
      const f = JSON.parse(readFileSync(p, "utf8"));
      cache.set(key, f);
      return f;
    } catch { /* try the next */ }
  }
  return null;
}

/* One answer: a page of a rail, or a page of the filtered grid. */
export function answer(qs, roots) {
  const s = loadStore(qs.store, roots);
  if (!s) return { status: 404, body: { error: "Tienda no encontrada." } };
  const rows = s.rows || [];
  if (qs.rail !== undefined && qs.rail !== "") {
    const idx = (s.rails || {})[String(qs.rail)];
    if (!idx) return { status: 404, body: { error: "Sin más productos." } };
    return { status: 200, body: { store: s.store, rail: String(qs.rail), ...pageOf(idx.map((i) => rows[i]), qs.page) } };
  }
  const d = String(qs.d || "").slice(0, 60), g = String(qs.g || "").slice(0, 40), c = String(qs.c || "").slice(0, 80);
  const q = String(qs.q || "").slice(0, 80).trim();
  const sort = SORTS.includes(qs.sort) ? qs.sort : "relevance";
  let list = rows;
  if (d || g || c) list = list.filter((r) => (!d || r[6] === d) && (!g || r[7] === g) && (!c || r[8] === c));
  if (q) list = searchRows(list, q);
  list = sortRows(list, sort);
  return { status: 200, body: { store: s.store, d, g, c, q, sort, ...pageOf(list, qs.page) } };
}
