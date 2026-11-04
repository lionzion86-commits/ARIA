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
import { conditionOfTitle } from "../../scripts/lib/condition.js";
import { loadDept, typeKeyOf } from "./_department-core.js";

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
  /* k: the condition label (/condition.js, c.6526570723) the store's title states. */
  const cond = conditionOfTitle(r[0]);
  if (cond && cond.label) c.k = cond.label;
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

/* ---------- THE STORE'S RAILED VIEW (#443, Danny: "never a side-by-side grid") ----------
   A search narrowed to one store (tienda.html?tienda=ccs&q=alien), a
   chip, or a carousel's «Ver todo» is carousels, never a grid: the set's
   sales first (when only some of it is on sale), then one carousel per
   product type, the biggest first, «Más productos» last. A product's type
   is the finest the data states: the store page's own sub-carousel
   (Tops y blusas), else the department's vetted Spanish type (Skateboards,
   Decks), else the store page's carousel (Maquillaje). ?group=1 answers
   the carousels' first cards; &gk=<key>&page=<n> one carousel's pages. */
export const GROUP_CARDS = 12;
const deptTypeCache = new Map();
function deptTypes(dept, roots) {
  if (deptTypeCache.has(dept)) return deptTypeCache.get(dept);
  const m = new Map();
  try {
    const d = loadDept(dept, roots);
    if (d) for (const p of d.list) { const k = p.retailer + "\u0000" + p.title; if (m.has(k)) continue; const t = typeKeyOf(p); if (t.k !== "otros") m.set(k, t.label); }
  } catch { /* no department file beside the function: the store's own aisles */ }
  deptTypeCache.set(dept, m);
  return m;
}
const taxCache = new Map();
/* row index -> [finest store-page carousel title, is it a sub-carousel]. */
function storeAisles(s, roots) {
  if (taxCache.has(s.store)) return taxCache.get(s.store);
  const out = new Map();
  for (const dir of roots || CANDIDATES) {
    const p = join(dir, "assets/tienda", s.store, "index.json");
    try {
      if (!existsSync(p)) continue;
      const ix = JSON.parse(readFileSync(p, "utf8"));
      const titles = new Map();
      for (const r of ix.rails || []) {
        /* A themed store's department rails (d-<dept>: DSW's «Medias y
           accesorios») answer the filter bar's agreement test only. */
        if (/^d-/.test(r.key || "") && r.key !== "d-mas") { titles.set(r.key, [r.title, false, r.key, true]); continue; }
        if (!/^t-/.test(r.key || "")) continue;
        titles.set(r.key, [r.title, false, r.key]);
        /* A sub-carousel keeps its audience (Zapatillas Mujer, Zapatillas Niños). */
        for (const sub of r.subs || []) titles.set(sub.k, [sub.t + (sub.a ? " " + sub.a : ""), true, sub.k]);
      }
      for (const [key, idx] of Object.entries(s.rails || {})) {
        const t = titles.get(key);
        if (!t) continue;
        for (const i of idx) { const had = out.get(i); if (!had || (had[3] && !t[3]) || (t[1] && !had[1] && !t[3])) out.set(i, t); }
      }
      break;
    } catch { /* try the next */ }
  }
  taxCache.set(s.store, out);
  return out;
}
/* The department's labels title-case every word («Stickers Y Decoración»):
   the small words read as Spanish writes them. */
const SMALL_WORDS_RX = / (Y|E|O|De|Del|La|Las|Los|El|Para|Con|En|Sin|Por)(?=[ )])/g;
export const tidyLabel = (t) => String(t || "").replace(SMALL_WORDS_RX, (m) => m.toLowerCase()).replace(/\((\p{Ll})/u, (m) => m);
const slugOf = (t) => foldText(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "otros";
/* LABEL-TRUE «VER TODO» (#443 c.6635296341, the full store audit): the
   department's type is the store's own type field, and at the surf shops
   that field is a blind stamp -- Parrot's Vans shoes opened as
   «Accesorios» (74) and «Accesorios de Skate» (19) inside its own Zapatos
   rail. A catch-all stamp never names a carousel when the store page has
   filed the product in an aisle, and a type never contradicts that aisle
   (a shoe type outside Zapatos, a non-shoe type inside it). */
export const CATCHALL_TYPE_RX = /^(accesorios(\s+de\s+.+)?|repuestos\s+y\s+accesorios\b.*|más\s+productos|otros)$/i;
export const SHOE_TYPE_RX = /^(zapat|calzado|sandalias|botas|botines|chimpunes|pantuflas|mocasines|tacones|vestir\b|guantes y botines)/i;
export function typeAgrees(label, aisleKey, aisleTitle = "") {
  const t = String(label || "").trim();
  if (!aisleKey) return true;
  if (CATCHALL_TYPE_RX.test(t)) return false;
  const shoeAisle = /^t-zapatos(~|$)/.test(aisleKey) || (/^d-/.test(aisleKey) && (SHOE_TYPE_RX.test(aisleTitle) || /^más zapatos/i.test(aisleTitle)));
  const shoeType = SHOE_TYPE_RX.test(t);
  return shoeType === shoeAisle || (shoeAisle && /^guantes y botines$/i.test(t));
}
/** The store-page rail (t-<family>, or its sub-carousel) a row sits in, or "". */
export function aisleOfRow(s, i, roots) {
  const a = storeAisles(s, roots).get(i);
  return a ? { key: a[2], title: a[0] } : null;
}
export function typeOfRow(s, r, i, roots) {
  const a0 = storeAisles(s, roots).get(i);
  const aisle = a0 && !a0[3] ? a0 : undefined;
  if (aisle && aisle[1]) return aisle[0];
  const t = r[6] ? deptTypes(r[6], roots).get(s.store + "\u0000" + r[0]) : "";
  const tail = !aisle || /^Más\b/.test(aisle[0]);
  /* The rows the store files as shoes (fn.shoes): a shoe never opens under
     another type's name, nor a non-shoe under a shoe's. */
  if (t && s.shoes) {
    const shoe = (s._shoes || (s._shoes = new Set(s.shoes))).has(i);
    const shoeLabel = SHOE_TYPE_RX.test(String(t).trim());
    if (shoe && !shoeLabel) return aisle && SHOE_TYPE_RX.test(aisle[0]) ? aisle[0] : "Zapatos";
    if (!shoe && shoeLabel && !(aisle && /^t-zapatos(~|$)/.test(aisle[2]))) return aisle && !tail ? aisle[0] : "Más productos";
  }
  if (t && (!aisle || (tail ? !CATCHALL_TYPE_RX.test(String(t).trim()) : typeAgrees(t, aisle[2], aisle[0])))) return tidyLabel(t);
  if (aisle && !/^Más\b/.test(aisle[0])) return aisle[0];
  return "Más productos";
}
export function groupsOf(s, list, roots) {
  const index = s._rowIndex || (s._rowIndex = new Map((s.rows || []).map((r, i) => [r, i])));
  const groups = new Map();
  for (const r of list) {
    const t = typeOfRow(s, r, index.get(r), roots), k = slugOf(t);
    if (!groups.has(k)) groups.set(k, { k, t, rows: [] });
    groups.get(k).rows.push(r);
  }
  let out = [...groups.values()];
  /* A type with one or two products joins «Más productos». */
  if (out.length > 1) {
    const small = out.filter((g) => g.rows.length < 3 || g.k === "mas-productos");
    if (small.length && small.length < out.length) {
      out = out.filter((g) => !small.includes(g));
      out.push({ k: "mas-productos", t: "Más productos", rows: list.filter((r) => small.some((g) => g.rows.includes(r))) });
    }
  }
  out.sort((a, b) => ((a.k === "mas-productos") - (b.k === "mas-productos")) || (b.rows.length - a.rows.length) || (a.t < b.t ? -1 : 1));
  const sales = list.filter((r) => r[4] > 0);
  if (sales.length && sales.length < list.length) out.unshift({ k: "ofertas", t: "Ofertas", rows: sales.slice().sort(saleCompare) });
  return out;
}

/* One answer: a page of a rail, the store's railed view, or a page of the filtered set. */
export function answer(qs, roots) {
  const s = loadStore(qs.store, roots);
  if (!s) return { status: 404, body: { error: "Tienda no encontrada." } };
  const rows = s.rows || [];
  const grouped = qs.group !== undefined && qs.group !== "";
  if (qs.rail !== undefined && qs.rail !== "" && grouped) {
    const idx = (s.rails || {})[String(qs.rail)];
    if (!idx) return { status: 404, body: { error: "Sin más productos." } };
    return groupedAnswer(s, idx.map((i) => rows[i]), qs, roots, { rail: String(qs.rail) });
  }
  if (qs.rail !== undefined && qs.rail !== "") {
    const idx = (s.rails || {})[String(qs.rail)];
    if (!idx) return { status: 404, body: { error: "Sin más productos." } };
    return { status: 200, body: { store: s.store, rail: String(qs.rail), ...pageOf(idx.map((i) => rows[i]), qs.page) } };
  }
  const d = String(qs.d || "").slice(0, 60), g = String(qs.g || "").slice(0, 40), c = String(qs.c || "").slice(0, 80);
  const q = String(qs.q || "").slice(0, 80).trim();
  const sort = SORTS.includes(qs.sort) ? qs.sort : "relevance";
  let list = rows;
  /* A chip with its own membership (an audience pill, a type pill that
     keeps only its type: build-store-slices' chip lists) opens exactly
     what it counts. */
  const member = d && s.chips && Array.isArray(s.chips[d]) ? new Set(s.chips[d].map((i) => rows[i])) : null;
  if (d || g || c) list = list.filter((r) => (!d || (member ? member.has(r) : r[6] === d)) && (!g || r[7] === g) && (!c || r[8] === c));
  if (q) list = searchRows(list, q);
  list = sortRows(list, sort);
  if (grouped) return groupedAnswer(s, list, qs, roots, { d, g, c, q, sort });
  return { status: 200, body: { store: s.store, d, g, c, q, sort, ...pageOf(list, qs.page) } };
}
function groupedAnswer(s, list, qs, roots, echo) {
  const groups = groupsOf(s, list, roots);
  const gk = String(qs.gk || "").slice(0, 40);
  if (gk) {
    const g = groups.find((x) => x.k === gk);
    if (!g) return { status: 404, body: { error: "Sin más productos." } };
    return { status: 200, body: { store: s.store, ...echo, gk, title: g.t, ...pageOf(g.rows, qs.page) } };
  }
  return { status: 200, body: { store: s.store, ...echo, total: list.length,
    groups: groups.map((g) => ({ k: g.k, t: g.t, n: g.rows.length, items: g.rows.slice(0, GROUP_CARDS).map(cardOfRow) })) } };
}
