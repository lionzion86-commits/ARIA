/* ============================================================
   THE FILTER BAR'S ANSWERS (#443 c.6616347095, the Nordstrom pattern).

   departamento.html?dept=<key>&nav=1 draws the category the header's
   flyout opened: the type pills (Todas las botas · Botines · Caña
   alta ...) and the dropdown bar (Filtrar · Ordenar · Marca · Talla ·
   Precio). Every facet stacks with every other one -- audience x type x
   style x brand x size x price x Ofertas -- and each one's options are
   counted under all the OTHER selections, so the bar only offers a
   choice that returns products (no zero-result path).

   The data is the department's own server-side list (assets/sections/
   departamento/_fn/<key>.json) plus the store's own size runs, row for
   row (_fn/<key>.sizes.json, scripts/build-department-slices.mjs). The
   phone never downloads either: it gets one page of cards and the
   facet counts.

   A size is the store's own label, read, never invented: «9.5», «9.5M»
   and «9 | US» are US 9.5; «IT 41» stays IT 41; a dual run («M 10 / W
   11.5») is US 10 for men and US 11.5 for women. A size the reader does
   not recognise is kept as the store wrote it.

   STYLES. A type can split into the styles its products' own names
   say they are -- a boot's noun phrase («Chelsea boot», «knee-high
   boot», «rain boot»). A product its name does not place stays in
   «Todas las botas» only; nothing is guessed.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDept, inAudience, typeKeyOf, cardOf, deptStats, photosFirst, PAGE_SIZE, AUD, FN_DIR, PLUS_DEPT } from "./_department-core.js";
import { PLUS_LINGERIE_LEAD, leadFirst, isLingerieSet, isPlusSizeLabel } from "../../scripts/lib/plus-lingerie.js";

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);

export const NF_SORTS = [["deal", "Mayor descuento"], ["low", "Precio: menor a mayor"], ["high", "Precio: mayor a menor"]];

/* ---------- styles: a type's sub-kinds, from the product's own name ---------- */
export const STYLES = {
  "botas-y-botines": {
    all: "Todas las botas",
    rules: [
      ["chelsea", "Chelsea", /\bchelsea\b/i],
      ["cana-alta", "Caña alta", /\b(knee[- ]?high|over[- ]the[- ]knee|thigh[- ]high|tall\s+(boots?|shaft)|riding\s+boots?|ca[ñn]a\s+alta)\b/i],
      ["lluvia", "De lluvia", /\b(rain\s*boots?|rainboots?|wellingtons?|wellies|lluvia)\b/i],
      ["nieve", "De nieve e invierno", /\b(snow|winter|snowboard|apr[eè]s[- ]ski|shearling|nieve)\b/i],
      ["trabajo", "De trabajo", /\b(work\s+boots?|steel[- ]toe|composite[- ]toe|safety\s+toe|tactical|hiker\s+work|trabajo)\b/i],
      ["vaqueras", "Vaqueras", /\b(western|cowboy|cowgirl|vaquer[ao]s?)\b/i],
      ["montana", "De montaña", /\b(hiking|hiker|trail\s+boots?|trekking)\b/i],
      ["botines", "Botines", /\b(ankle|booties?|bootie|botin(es)?|botín|chukka|combat\s+boots?|biker|lug\s+boots?)\b/i],
    ],
  },
};
export function styleOf(p, tkey) {
  const st = STYLES[tkey];
  if (!st) return "";
  for (const [k, , rx] of st.rules) if (rx.test(p.title || "")) return k;
  return "";
}
export function styleLabel(tkey, k) {
  const st = STYLES[tkey];
  const r = st && st.rules.find((x) => x[0] === k);
  return r ? r[1] : "";
}

/* ---------- sizes ---------- */
const trimZero = (n) => String(Number(n));
/* One store size -> [{ z, side }] (side: "m" men, "w" women, "" both). */
export function normSize(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  let m;
  /* «M 10 / W 11.5», «M7W9», «Men's 9 / Women's 10.5». */
  if ((m = /^(?:m|men'?s?)\s*(\d{1,2}(?:\.5)?)\s*\/?\s*(?:w|women'?s?)\s*(\d{1,2}(?:\.5)?)$/i.exec(s)))
    return [{ z: "US " + trimZero(m[1]), side: "m" }, { z: "US " + trimZero(m[2]), side: "w" }];
  /* «US 11 = IT 44». */
  if ((m = /^us\s*(\d{1,2}(?:\.5)?)\s*=\s*(it|eu)\s*(\d{2}(?:\.5)?)$/i.exec(s)))
    return [{ z: "US " + trimZero(m[1]), side: "" }, { z: m[2].toUpperCase() + " " + trimZero(m[3]), side: "" }];
  if ((m = /^(it|eu|uk)\s*(\d{1,2}(?:\.5)?)$/i.exec(s))) return [{ z: m[1].toUpperCase() + " " + trimZero(m[2]), side: "" }];
  /* «Women's 6», «Men's 9». */
  if ((m = /^(women'?s?|men'?s?)\s*(\d{1,2}(?:\.5)?)$/i.exec(s))) return [{ z: "US " + trimZero(m[2]), side: /^w/i.test(m[1]) ? "w" : "m" }];
  /* «9.5», «9.0», «9.5M», «9 | US», «US 9», «9 US». */
  if ((m = /^(?:us\s*)?(\d{1,2}(?:\.[05])?)\s*(?:m|w|\|\s*us|us)?$/i.exec(s))) {
    const n = Number(m[1]);
    if (n >= 30) return [{ z: "EU " + trimZero(m[1]), side: "" }];
    if (n > 0 && n <= 18) return [{ z: "US " + trimZero(m[1]), side: "" }];
  }
  if ((m = /^(\d{2}(?:\.5)?)$/.exec(s)) && Number(m[1]) >= 30) return [{ z: "EU " + trimZero(m[1]), side: "" }];
  /* Kids: «10C», «2Y», «10.5 Little Kid». */
  if ((m = /^(\d{1,2}(?:\.5)?)\s*(c|y|t|k)$/i.exec(s))) return [{ z: trimZero(m[1]) + m[2].toUpperCase(), side: "" }];
  /* Letters. */
  const up = s.toUpperCase().replace(/\s+/g, "");
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|5XL|1X|2X|3X|4X|OS|ONESIZE)$/.test(up)) return [{ z: up === "ONESIZE" ? "Talla única" : up === "OS" ? "Talla única" : up.replace(/^XXL$/, "2XL").replace(/^XXXL$/, "3XL"), side: "" }];
  if (/^(one size|talla [uú]nica|única)$/i.test(s)) return [{ z: "Talla única", side: "" }];
  return [{ z: s.slice(0, 24), side: "" }];
}
const LETTER_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "1X", "2X", "3X", "4X", "Talla única"];
export function sizeOrder(a, b) {
  const rank = (z) => {
    let m;
    if ((m = /^US (\d+(?:\.\d)?)$/.exec(z))) return [0, Number(m[1])];
    if ((m = /^(\d+(?:\.\d)?)[CYTK]$/.exec(z))) return [1, Number(m[1])];
    if ((m = /^EU (\d+(?:\.\d)?)$/.exec(z))) return [2, Number(m[1])];
    if ((m = /^IT (\d+(?:\.\d)?)$/.exec(z))) return [3, Number(m[1])];
    if ((m = /^UK (\d+(?:\.\d)?)$/.exec(z))) return [4, Number(m[1])];
    const i = LETTER_ORDER.indexOf(z);
    if (i >= 0) return [5, i];
    return [6, 0];
  };
  const x = rank(a), y = rank(b);
  return (x[0] - y[0]) || (x[1] - y[1]) || (a < b ? -1 : a > b ? 1 : 0);
}

const sizeCache = new Map();
/* The department's size runs, normalised once per run: rows[i] -> [{z, side}]. */
export function loadSizes(key, roots = CANDIDATES) {
  if (sizeCache.has(key)) return sizeCache.get(key);
  let out = null;
  for (const dir of roots) {
    const p = join(dir, FN_DIR, key + ".sizes.json");
    try {
      if (!existsSync(p)) continue;
      const f = JSON.parse(readFileSync(p, "utf8"));
      const runs = (f.runs || []).map((run) => {
        const seen = new Map();
        for (const raw of run) for (const t of normSize(raw)) {
          const k = t.z + "|" + t.side;
          if (!seen.has(k)) seen.set(k, t);
        }
        return [...seen.values()];
      });
      out = (f.rows || []).map((i) => runs[i] || []);
      break;
    } catch { /* next */ }
  }
  sizeCache.set(key, out);
  return out;
}
/* The sizes one product offers to this audience. */
function sizesFor(tokens, u) {
  const out = new Set();
  for (const t of tokens || []) if (!t.side || !u || u === "kids" || (u === "men" ? t.side === "m" : u === "women" ? t.side === "w" : true)) out.add(t.z);
  return out;
}

/* ---------- price bands, in soles ---------- */
export const PRICE_BANDS = [[0, 100], [100, 250], [250, 500], [500, 1000], [1000, 0]];
export const bandKey = (b) => b[0] + "-" + (b[1] || "");
export function bandLabel(b) {
  return b[1] ? (b[0] ? "S/ " + b[0] + " – " + b[1] : "Hasta S/ " + b[1]) : "Más de S/ " + b[0];
}
function inBand(soles, key) {
  const b = PRICE_BANDS.find((x) => bandKey(x) === key);
  if (!b) return true;
  return soles >= b[0] && (!b[1] || soles < b[1]);
}

const brandKey = (p) => String((p && p.brand) || "").trim().toLowerCase();

/* The filters, read and clamped from a query. */
export function readFilters(qs) {
  const s = (k, n) => String(qs[k] || "").trim().slice(0, n);
  const u = AUD.some(([k]) => k === qs.u) ? qs.u : "";
  const fx = Number(qs.fx);
  return {
    u, t: s("t", 60).toLowerCase(), s: s("s", 30).toLowerCase(), b: s("b", 80).toLowerCase(), z: s("z", 24),
    p: PRICE_BANDS.some((x) => bandKey(x) === qs.p) ? qs.p : "", o: qs.o === "1" ? "1" : "",
    fx: fx >= 2 && fx <= 6 ? fx : 0,
  };
}

/* One department under every filter; each facet counted under the others. */
export function navFilter(key, f, sort = "deal", page = 0, roots = CANDIDATES) {
  const d = loadDept(key, roots);
  if (!d) return null;
  const sizes = loadSizes(key, roots) || [];
  const fx = f.fx || 0;
  const rows = d.list.map((p, i) => {
    const t = typeKeyOf(p);
    return { p, i, t, st: styleOf(p, t.k), b: brandKey(p), z: sizesFor(sizes[i], f.u), soles: fx ? p.rawPrice * fx : 0 };
  });
  const match = (r, skip) => {
    if (skip !== "u" && f.u && !inAudience(r.p, f.u)) return false;
    if (skip !== "t" && f.t && r.t.k !== f.t) return false;
    if (skip !== "s" && skip !== "t" && f.s && r.st !== f.s) return false;
    if (skip !== "b" && f.b && r.b !== f.b) return false;
    if (skip !== "z" && f.z && !r.z.has(f.z)) return false;
    if (skip !== "p" && f.p && fx && !inBand(r.soles, f.p)) return false;
    if (skip !== "o" && f.o && !(r.p.salePct > 0)) return false;
    return true;
  };
  const count = (skip, keysOf) => {
    const n = new Map();
    for (const r of rows) {
      if (!match(r, skip)) continue;
      for (const [k, label] of keysOf(r)) {
        if (!k) continue;
        const o = n.get(k) || [k, label, 0];
        o[2]++; n.set(k, o);
      }
    }
    return [...n.values()];
  };
  const byN = (a, b) => (b[2] - a[2]) || (a[1] < b[1] ? -1 : 1);
  const facets = {
    u: AUD.map(([k, label]) => [k, label, rows.filter((r) => match(r, "u") && inAudience(r.p, k)).length]).filter((x) => x[2] > 0),
    t: count("t", (r) => [[r.t.k === "otros" ? "" : r.t.k, r.t.label]]).sort(byN),
    s: f.t && STYLES[f.t] ? count("s", (r) => [[r.st, styleLabel(f.t, r.st)]]).sort((a, b) => STYLES[f.t].rules.findIndex((x) => x[0] === a[0]) - STYLES[f.t].rules.findIndex((x) => x[0] === b[0])) : [],
    b: count("b", (r) => [[r.b, String(r.p.brand || "").trim()]]).sort(byN),
    z: count("z", (r) => [...r.z].map((z) => [z, z])).sort((a, b) => sizeOrder(a[0], b[0])),
    p: fx ? PRICE_BANDS.map((b) => [bandKey(b), bandLabel(b), rows.filter((r) => match(r, "p") && inBand(r.soles, bandKey(b))).length]).filter((x) => x[2] > 0) : [],
    o: [["1", "Ofertas", rows.filter((r) => match(r, "o") && r.p.salePct > 0).length]].filter((x) => x[2] > 0),
  };
  let hits = rows.filter((r) => match(r));
  if (sort === "low") hits.sort((a, b) => (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i));
  else if (sort === "high") hits.sort((a, b) => (b.p.rawPrice - a.p.rawPrice) || (a.i - b.i));
  else hits.sort((a, b) => ((b.p.salePct || 0) - (a.p.salePct || 0)) || (a.i - b.i));
  let list = hits.map((r) => r.p);
  if (sort === "deal") list = photosFirst(list);
  /* LENCERÍA + TALLAS PLUS (Danny, #443 c.6621407508): lingerie in Tallas
     Plus, or under a plus Talla (1X, 2XL, 16W ...), opens on Lane Bryant --
     its lingerie is photographed on plus-size women. The curated order
     only: a price sort stays a price sort. */
  if (sort === "deal" && (key === PLUS_DEPT || (f.z && f.u !== "men" && isPlusSizeLabel(f.z))) && list.some((p) => p.retailer === PLUS_LINGERIE_LEAD) && isLingerieSet(list)) list = leadFirst(list);
  const pages = Math.ceil(list.length / PAGE_SIZE);
  const tl = f.t ? ((rows.find((r) => r.t.k === f.t) || {}).t || {}).label || "" : "";
  return {
    dept: key, f: { u: f.u, t: f.t, s: f.s, b: f.b, z: f.z, p: f.p, o: f.o }, sort, tl,
    sl: f.s ? styleLabel(f.t, f.s) : "", sAll: f.t && STYLES[f.t] ? STYLES[f.t].all : "",
    count: list.length, page, pages, cards: list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf),
    facets, stats: deptStats(list),
  };
}

export function answerNav(qs, roots) {
  const key = String(qs.dept || "");
  const f = readFilters(qs);
  const sort = NF_SORTS.some(([k]) => k === qs.sort) ? qs.sort : "deal";
  const out = navFilter(key, f, sort, Math.max(0, Math.min(500, Number(qs.page) || 0)), roots);
  return out ? { status: 200, body: out } : { status: 404, body: { error: "Departamento no encontrado." } };
}
