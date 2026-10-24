/* ============================================================
   DEPARTMENT CORE (2026-10-19, #409 track T5) — the carousels of
   departamento.html, shared by the build (scripts/build-department-
   slices.mjs writes the static slices with it) and the endpoint
   (netlify/functions/department.js answers filters and "Ver todo"
   with it), so the two can never disagree about what a department
   shows.

   Files: assets/sections/departamento/_fn/<dept>.json, shipped beside
   the function by netlify.toml included_files and found by probing,
   like _search-core.js. No import.meta: Netlify's bundler compiles
   functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { conditionOfTitle } from "../../scripts/lib/condition.js";

export const PAGE_SIZE = 48;     // cards per "Ver todo" / "Mostrar más" slice
export const RAIL_CARDS = 12;    // cards drawn in one carousel
export const HEAD_RAILS = 3;     // carousels whose cards ride in head.json
export const RAIL_BATCH = 6;     // carousels per rails-<b>.json after those
export const FN_DIR = "assets/sections/departamento/_fn";
export const DEPT_KEY_RX = /^[a-z_]{2,40}$/;

export function typeLabel(t) {
  return String(t).split(/[\s_\-]+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

/* The page's carousels, from a (possibly filtered) list in page order:
   Ofertas (biggest discount first) or, with no sales, Destacados; then
   one per product type with 3+ items, biggest first; then the rest. */
/* REACONDICIONADOS (#443): the rule is /condition.js, shared with the
   product page and the order line. Re-exported for the builder. */
export { conditionOfTitle };

/* ---------- PERFUMES (#443 item 32, Aria Perfumes) ----------
   The department that is all Aria Perfumes gets its own rails, in
   Danny's order: the sales, then the classics Peru's department stores
   do not range online, then each class on its own rail (testers,
   minis, gift sets -- never merged with the boxed bottle), then the
   houses by how much of each we carry, body care last. The class is
   read from the title scripts/build-perfumes-catalog.mjs writes, so the
   static slices and the endpoint (fn rows: title, brand, type) agree. */
export const PERFUME_STORE = "ariaperfumes";
export const PERFUME_CLASSICS = [
  ["Christian Dior", "Sauvage"], ["Creed", "Aventus"], ["Paco Rabanne", "1 Million"],
  ["Carolina Herrera", "Good Girl"], ["Yves Saint Laurent", "Black Opium"], ["Calvin Klein", "Ck One"],
];
export function perfumeClassOf(p) {
  const t = String((p && p.title) || "");
  if (/\(([^)]*\b)?Tester\b/.test(t)) return "testers";
  if (/— Set de regalo\b/.test(t)) return "sets";
  if (/\(([^)]*\b)?Mini\)/.test(t)) return "minis";
  if (String((p && p.type) || "") === "Cuidado corporal" || /— (Body mist|Body spray|After shave|Perfume para el cabello|Desodorante|Gel de ducha|Loción corporal|Jabón|Crema|Talco|Aroma para el hogar|Labial|Afeitado|Baño|Gel de baño|Aceite corporal|Manteca corporal|Vela)\b/.test(t)) return "cuidado";
  return "frasco";
}
const PERFUME_RAILS = { testers: "Testers", minis: "Minis y de viaje", sets: "Sets de regalo", cuidado: "Cuerpo y cuidado" };
export function buildPerfumeSections(list) {
  const sections = [];
  const sales = list.filter((p) => p.salePct > 0 && perfumeClassOf(p) === "frasco").map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  const classics = [];
  PERFUME_CLASSICS.forEach(([brand, name], rank) => {
    for (const p of list) {
      if (perfumeClassOf(p) !== "frasco" || String(p.brand || "") !== brand) continue;
      /* The bottle people picture: no refill, no unboxed variant. */
      if (/\((?:[^)]*\b)?(?:Repuesto|Sin caja)\b/.test(String(p.title || ""))) continue;
      if (String(p.title || "").indexOf(name + " — ") === 0) classics.push({ p, rank });
    }
  });
  classics.sort((a, b) => (a.rank - b.rank) || (a.p.rawPrice - b.p.rawPrice));
  if (classics.length) sections.push({ key: "clasicos", title: "Los clásicos", items: classics.map((x) => x.p) });
  for (const k of ["testers", "minis", "sets"]) {
    const l = list.filter((p) => perfumeClassOf(p) === k);
    if (l.length) sections.push({ key: "clase:" + k, title: PERFUME_RAILS[k], items: l });
  }
  const byBrand = {}, order = [];
  for (const p of list) {
    if (perfumeClassOf(p) !== "frasco") continue;
    const b = String(p.brand || "").trim() || "__otros__";
    if (!byBrand[b]) { byBrand[b] = []; order.push(b); }
    byBrand[b].push(p);
  }
  const groups = []; let small = [];
  order.forEach((b, idx) => { const l = byBrand[b]; if (b !== "__otros__" && l.length >= 3) groups.push({ b, l, idx }); else small = small.concat(l); });
  groups.sort((a, b) => (b.l.length - a.l.length) || (a.idx - b.idx));
  for (const g of groups) sections.push({ key: "marca:" + g.b.toLowerCase(), title: g.b, items: g.l });
  if (small.length) sections.push({ key: "marca:otras", title: "Más perfumes", items: small });
  const care = list.filter((p) => perfumeClassOf(p) === "cuidado");
  if (care.length) sections.push({ key: "clase:cuidado", title: PERFUME_RAILS.cuidado, items: care });
  return sections;
}

export function buildSections(list) {
  if (list.length && list.every((p) => p.retailer === PERFUME_STORE)) return buildPerfumeSections(list);
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  const sections = [];
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  else if (list.length) sections.push({ key: "destacados", title: "Destacados", items: list });
  /* Reacondicionados: second in every department with 3+ such products
     (not in the department made of nothing else). */
  const refurb = list.filter((p) => conditionOfTitle(p.title));
  if (refurb.length >= 3 && refurb.length < list.length) sections.push({ key: "reacondicionados", title: "Reacondicionados", items: refurb });
  const byType = {}, order = [];
  for (const p of list) {
    const t = (String(p.type || "").trim().toLowerCase()) || "__otros__";
    if (!byType[t]) { byType[t] = []; order.push(t); }
    byType[t].push(p);
  }
  const groups = []; let small = [];
  order.forEach((t, idx) => {
    const l = byType[t];
    if (t !== "__otros__" && l.length >= 3) groups.push({ t, l, idx });
    else small = small.concat(l);
  });
  groups.sort((a, b) => (b.l.length - a.l.length) || (a.idx - b.idx));
  for (const g of groups) sections.push({ key: "tipo:" + g.t, title: typeLabel(g.t), items: g.l });
  if (small.length) sections.push({ key: "tipo:otros", title: "Más productos", items: small });
  return sections;
}

/* A card: what the tile and the tap need, nothing else.
   t title, b brand, r store, p store price (USD, before Aria's margin
   and tax -- the page prices it with its own finalUsd), o the was-price
   on the same basis (sales only), s percent off, i photo, k condition. */
export function cardOf(p) {
  const c = { t: p.title, r: p.retailer, p: p.rawPrice };
  if (p.brand) c.b = p.brand;
  if (p.salePct > 0) { c.s = p.salePct; if (p.wasPrice > p.rawPrice) c.o = p.wasPrice; }
  if (p.image) c.i = p.image;
  /* k: the condition label (/condition.js) when the store's title says
     refurbished, used or open-box. */
  const cond = conditionOfTitle(p.title);
  if (cond) c.k = cond.label;
  return c;
}

export function storeChips(list) {
  const n = {};
  for (const p of list) n[p.retailer] = (n[p.retailer] || 0) + 1;
  return Object.keys(n).sort().map((k) => ({ k, n: n[k] }));
}
export function labelsOf(list, allLabels) {
  const out = {};
  for (const p of list) if (allLabels[p.retailer]) out[p.retailer] = allLabels[p.retailer];
  return out;
}

/* head.json's shape -- also what the endpoint answers for a filter. */
export function headOf(key, list, sections, allLabels, extra = {}) {
  return {
    v: 1,
    dept: key,
    count: list.length,
    stores: storeChips(list),
    labels: labelsOf(list, allLabels),
    pageSize: PAGE_SIZE,
    railCards: RAIL_CARDS,
    headRails: HEAD_RAILS,
    railBatch: RAIL_BATCH,
    rails: sections.map((s, i) => {
      const r = { i, title: s.title, count: s.items.length, pages: Math.ceil(s.items.length / PAGE_SIZE) };
      if (i < HEAD_RAILS) r.cards = s.items.slice(0, RAIL_CARDS).map(cardOf);
      return r;
    }),
    ...extra,
  };
}
export function batchCount(sections) { return Math.max(0, Math.ceil((sections.length - HEAD_RAILS) / RAIL_BATCH)); }
/* Batch b: the first cards of carousels HEAD_RAILS + b*RAIL_BATCH onward. */
export function batchOf(sections, b) {
  const from = HEAD_RAILS + b * RAIL_BATCH;
  if (!(b >= 0) || from >= sections.length) return null;
  return { b, rails: sections.slice(from, from + RAIL_BATCH).map((s, k) => ({ i: from + k, cards: s.items.slice(0, RAIL_CARDS).map(cardOf) })) };
}
export function pageOf(sections, rail, page) {
  const s = sections[rail];
  if (!s || !(page >= 0)) return null;
  const cards = s.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf);
  return { rail, title: s.title, page, pages: Math.ceil(s.items.length / PAGE_SIZE), count: s.items.length, cards };
}

/* The endpoint's copy of a department: one row per card plus its type. */
export function fnRow(p) {
  return [p.title, p.brand || "", p.retailer, p.rawPrice, p.wasPrice || 0, p.salePct || 0, p.image || "", p.type || ""];
}
export function rowItem(r) {
  return { title: r[0], brand: r[1], retailer: r[2], rawPrice: r[3], wasPrice: r[4], salePct: r[5], image: r[6], type: r[7] };
}

/* The page's filters, unchanged: one store, and every word of the
   department search box in the title or brand. */
export function filterList(list, { r = "", q = "" } = {}) {
  const words = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    if (r && r !== "all" && p.retailer !== r) return false;
    if (words.length) {
      const hay = (p.title + " " + (p.brand || "")).toLowerCase();
      for (const w of words) if (hay.indexOf(w) === -1) return false;
    }
    return true;
  });
}

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
const deptCache = new Map();
/* A department's full list, in page order, or null for an unknown key. */
export function loadDept(key, roots = CANDIDATES) {
  if (!DEPT_KEY_RX.test(String(key || ""))) return null;
  if (deptCache.has(key)) return deptCache.get(key);
  for (const dir of roots) {
    const p = join(dir, FN_DIR, key + ".json");
    try {
      if (!existsSync(p)) continue;
      const f = JSON.parse(readFileSync(p, "utf8"));
      const d = { key, labels: f.labels || {}, list: (f.rows || []).map(rowItem) };
      deptCache.set(key, d);
      return d;
    } catch { /* try the next */ }
  }
  return null;
}

/* One answer: a head (no rail/batch), a carousel batch, or a page of a
   carousel -- each optionally filtered by store (r) and words (q). */
export function answer(qs, roots) {
  const d = loadDept(String(qs.dept || ""), roots);
  if (!d) return { status: 404, body: { error: "Departamento no encontrado." } };
  const r = String(qs.r || "").slice(0, 40), q = String(qs.q || "").slice(0, 80);
  const list = (r && r !== "all") || q.trim() ? filterList(d.list, { r, q }) : d.list;
  const sections = buildSections(list);
  if (qs.rail !== undefined && qs.rail !== "") {
    const out = pageOf(sections, Number(qs.rail), Number(qs.page) || 0);
    return out ? { status: 200, body: out } : { status: 404, body: { error: "Sin más productos." } };
  }
  if (qs.batch !== undefined && qs.batch !== "") {
    const out = batchOf(sections, Number(qs.batch));
    return out ? { status: 200, body: out } : { status: 404, body: { error: "Sin más carruseles." } };
  }
  return { status: 200, body: headOf(d.key, list, sections, d.labels, { r: r || "all", q }) };
}
