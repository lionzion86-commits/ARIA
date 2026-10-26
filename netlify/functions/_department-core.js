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

/* Aria's own footwear classes (scripts/lib/footwear.js SHOE_CLASSES) are
   titles already: "Botas y botines", not "Botas Y Botines". */
const SHOE_CLASS_LABELS = new Map(["Zapatillas", "Sandalias", "Botas y botines", "Tacones", "Chimpunes", "Mocasines y pantuflas", "Zapatos"].map((l) => [l.toLowerCase(), l]));
export function typeLabel(t) {
  if (SHOE_CLASS_LABELS.has(String(t).toLowerCase())) return SHOE_CLASS_LABELS.get(String(t).toLowerCase());
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
   Danny's order: the great houses (the classics, sales between them),
   then the sales, then each class on its own rail (testers, minis,
   gift sets -- never merged with the boxed bottle), then the houses --
   the designer houses first -- body care last. The class is
   read from the title scripts/build-perfumes-catalog.mjs writes, so the
   static slices and the endpoint (fn rows: title, brand, type) agree. */
export const PERFUME_STORE = "ariaperfumes";
export const PERFUME_CLASSICS = [
  /* [house, fragrance, side]: Creed Aventus is the men's bottle -- the
     women's Aventus is a different scent. */
  ["Christian Dior", "Sauvage"], ["Creed", "Aventus", "para hombre"], ["Paco Rabanne", "1 Million"],
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
/* The houses a shopper in Peru knows by name (the catalogue's own brand
   strings). They lead: their rail comes first and their house rails
   come before the long tail (#443 item 39 D -- recognition stops the
   scroll, then the price is the shock). */
export const PERFUME_DESIGNER_HOUSES = new Set([
  "christian dior", "creed", "paco rabanne", "carolina herrera", "yves saint laurent", "giorgio armani", "versace",
  "gucci", "prada", "burberry", "calvin klein", "tom ford", "valentino", "hugo boss", "dolce & gabbana",
  "jean paul gaultier", "chanel", "givenchy", "lancome", "ralph lauren", "azzaro", "montblanc", "mont blanc",
  "tommy hilfiger", "lacoste", "bvlgari", "hermes", "marc jacobs", "viktor & rolf", "thierry mugler", "mugler",
  "issey miyake", "kenzo", "jimmy choo", "michael kors", "coach", "estee lauder", "narciso rodriguez", "kilian",
  "maison francis kurkdjian", "xerjoff", "parfums de marly",
]);
export function isDesignerHouse(p) { return PERFUME_DESIGNER_HOUSES.has(String((p && p.brand) || "").trim().toLowerCase()); }
const perfumeName = (p) => String((p && p.title) || "").split(" — ")[0].toLowerCase();
export function buildPerfumeSections(list) {
  const sections = [];
  const sales = list.filter((p) => p.salePct > 0 && perfumeClassOf(p) === "frasco").map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  /* LAS GRANDES CASAS: each classic once (its cheapest boxed bottle),
     with a designer-house sale between them -- sale-led picks
     interleaved, not all of them. */
  const classics = [];
  PERFUME_CLASSICS.forEach(([brand, name, side], rank) => {
    for (const p of list) {
      if (perfumeClassOf(p) !== "frasco" || String(p.brand || "") !== brand) continue;
      /* The bottle people picture: no refill, no unboxed variant. */
      if (/\((?:[^)]*\b)?(?:Repuesto|Sin caja)\b/.test(String(p.title || ""))) continue;
      if (side && !String(p.title || "").endsWith(" " + side)) continue;
      if (String(p.title || "").indexOf(name + " — ") === 0) classics.push({ p, rank });
    }
  });
  classics.sort((a, b) => (a.rank - b.rank) || (a.p.rawPrice - b.p.rawPrice));
  const heroes = [], seenRank = new Set();
  for (const c of classics) if (!seenRank.has(c.rank)) { seenRank.add(c.rank); heroes.push(c.p); }
  const seenName = new Set(heroes.map(perfumeName));
  const houseSales = sales.filter((p) => isDesignerHouse(p) && !seenName.has(perfumeName(p)) && (seenName.add(perfumeName(p)), true)).slice(0, heroes.length);
  const lead = [];
  heroes.forEach((h, i) => { lead.push(h); if (houseSales[i]) lead.push(houseSales[i]); });
  if (lead.length) sections.push({ key: "grandes-casas", title: "Las grandes casas", items: lead });
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
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
  /* The designer houses first, then the rest; inside each, by how much
     of the house we carry. */
  const classicRank = (g) => { const i = PERFUME_CLASSICS.findIndex((c) => c[0] === g.b); return i === -1 ? PERFUME_CLASSICS.length : i; };
  const known = (g) => (PERFUME_DESIGNER_HOUSES.has(g.b.toLowerCase()) ? 0 : 1);
  groups.sort((a, b) => (classicRank(a) - classicRank(b)) || (known(a) - known(b)) || (b.l.length - a.l.length) || (a.idx - b.idx));
  for (const g of groups) sections.push({ key: "marca:" + g.b.toLowerCase(), title: g.b, items: g.l });
  if (small.length) sections.push({ key: "marca:otras", title: "Más perfumes", items: small });
  const care = list.filter((p) => perfumeClassOf(p) === "cuidado");
  if (care.length) sections.push({ key: "clase:cuidado", title: PERFUME_RAILS.cuidado, items: care });
  return sections;
}

/* The shoe departments (#443 c.6405702652): their types are Aria's own
   footwear classes, and the front of a mixed rail is interleaved so one
   cheap class cannot take it (the Shoes rail's first 24 cards were all
   sandals). */
export const SHOE_DEPTS = new Set(["shoes", "shoes_women", "shoes_men"]);
export function sectionOpts(key) { return SHOE_DEPTS.has(key) ? { interleave: true } : {}; }
export const FRONT = 24, FRONT_CAP = 6;

/* The first FRONT cards of a mixed rail hold at most FRONT_CAP of any one
   type, taken round-robin in rail order; the rest follow unchanged. */
export function interleaveFront(items, front = FRONT, cap = FRONT_CAP) {
  const types = new Set(items.slice(0, front * 4).map((p) => p.type || ""));
  if (types.size < 2) return items;
  const head = [], used = new Map(), rest = [];
  for (const p of items) {
    const t = p.type || "", n = used.get(t) || 0;
    if (head.length < front && n < cap) { head.push(p); used.set(t, n + 1); }
    else rest.push(p);
  }
  return head.concat(rest);
}

/* A card without a photo never leads a rail (the Sandalias lead was the
   rail's only imageless item): photographed items keep their order and
   come first. */
export function photosFirst(items) {
  const a = [], b = [];
  for (const p of items) (p.image ? a : b).push(p);
  return b.length ? a.concat(b) : items;
}

export function buildSections(list, opts = {}) {
  const secs = buildSectionsRaw(list);
  for (const s of secs) {
    s.items = photosFirst(s.items);
    if (opts.interleave && (s.key === "ofertas" || s.key === "destacados")) s.items = interleaveFront(s.items);
  }
  return secs;
}
function buildSectionsRaw(list) {
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
  const sections = buildSections(list, sectionOpts(d.key));
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
