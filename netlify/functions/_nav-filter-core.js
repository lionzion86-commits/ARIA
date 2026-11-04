/* ============================================================
   THE FILTER BAR'S ANSWERS, EVERYWHERE (#443 c.6616347095, refined
   c.6616389410, amended c.6616425433: "every option, everywhere").

   One engine for every listing the site has -- a department, a store,
   a brand, Ofertas, Ropa Interior and a search. Each page shows the
   same type pills (a type's styles, or its sibling types) and the same
   dropdown bar (Filtrar · Ordenar · Marca · Talla · Precio). Every
   facet stacks with every other one -- audience x type x style x
   brand x size x price x Ofertas -- several brands, sizes or prices at
   once inside one facet (OR within, AND across), and each option is
   counted under all the OTHER selections, so the bar only offers a
   choice that returns products (no zero-result path).

   SOURCES. Each listing keeps its own rows and its own card (the page
   draws the card it always drew); the engine reads from every row the
   same few facts:
     dept=<key>    assets/sections/departamento/_fn/<key>.json (+ the
                   store size runs, _fn/<key>.sizes.json)
     tienda=<key>  assets/tienda/_fn/<key>.json (_tienda-core.js)
     marca=<key>   assets/sections/marca/_fn/items.json (_brand-core.js)
     ofertas=1     assets/ofertas/deals.json (_ofertas-core.js)
     ri=mujer|hombre  ropa-interior(-women)-feed.json
     (search: netlify/functions/search.js, &nf=1, with this engine)
   A product's type, audience and sizes outside a department come from
   the department rows -- the same product, the same facts -- through
   assets/sections/nav/_fn/facts.json (scripts/build-nav-menu.mjs),
   keyed by store + title. A product no department carries keeps its
   store's own type and no audience: nothing is guessed.

   A size is the store's own label, read, never invented: «9.5», «9.5M»
   and «9 | US» are US 9.5; «IT 41» stays IT 41; a dual run («M 10 / W
   11.5») is US 10 for men and US 11.5 for women.

   STYLES. A type splits into the styles its products' own names say
   they are (a boot's «Chelsea», a dress's «midi», a sandal's «slide»).
   A product its name does not place stays in «Todas» only.

   PRICES are the card's own: the store price with Aria's margin and the
   sales tax (finalUsd, the number every card shows) at the day's rate.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDept, inAudience, typeKeyOf, cardOf as deptCard, photosFirst, PAGE_SIZE, AUD, FN_DIR, lensSlug, typeLabel } from "./_department-core.js";
import { finalUsd } from "./_search-core.js";
import { RETAILERS } from "../../scripts/lib/retailers.js";
const storeLabel = (k) => (RETAILERS[k] && RETAILERS[k].label) || k;
import { PLUS_LINGERIE_LEAD, leadFirst, isLingerieSet, isPlusSizeLabel } from "../../scripts/lib/plus-lingerie.js";

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
function readFrom(roots, rel) {
  for (const dir of roots || CANDIDATES) {
    const p = join(dir, rel);
    try { if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")); } catch { /* next */ }
  }
  return null;
}

export const NF_SORTS = [["deal", "Mayor descuento"], ["low", "Precio: menor a mayor"], ["high", "Precio: mayor a menor"]];
/* Facets that take several values at once (OR inside the facet). */
export const MULTI = ["b", "z", "p", "r"];
export const SEP = "|";

/* ---------- styles: a type's sub-kinds, from the product's own name ---------- */
const S = (all, rules) => ({ all, rules });
export const STYLES = {
  "botas-y-botines": S("Todas las botas", [
    ["chelsea", "Chelsea", /\bchelsea\b/i],
    ["cana-alta", "Caña alta", /\b(knee[- ]?high|over[- ]the[- ]knee|thigh[- ]high|tall\s+(boots?|shaft)|riding\s+boots?|ca[ñn]a\s+alta)\b/i],
    ["lluvia", "De lluvia", /\b(rain\s*boots?|rainboots?|wellingtons?|wellies|lluvia)\b/i],
    ["nieve", "De nieve e invierno", /\b(snow|winter|snowboard|apr[eè]s[- ]ski|shearling|nieve)\b/i],
    ["trabajo", "De trabajo", /\b(work\s+boots?|steel[- ]toe|composite[- ]toe|safety\s+toe|tactical|hiker\s+work|trabajo)\b/i],
    ["vaqueras", "Vaqueras", /\b(western|cowboy|cowgirl|vaquer[ao]s?)\b/i],
    ["montana", "De montaña", /\b(hiking|hiker|trail\s+boots?|trekking)\b/i],
    ["botines", "Botines", /\b(ankle|booties?|bootie|botin(es)?|botín|chukka|combat\s+boots?|biker|lug\s+boots?)\b/i],
  ]),
  zapatillas: S("Todas las zapatillas", [
    ["running", "Running", /\b(running|runners?|run\b|trail\s+running|marathon)\b/i],
    ["basquet", "Básquet", /\b(basketball|b[aá]squet)\b/i],
    ["skate", "Skate", /\b(skate(boarding)?\s+shoes?|skate\b|pro\s+skate)\b/i],
    ["training", "Training", /\b(training|trainers?|cross[- ]?train\w*|gym)\b/i],
    ["tenis-padel", "Tenis y pádel", /\b(tennis|pickleball|p[aá]del)\b/i],
    ["caminar", "Para caminar", /\b(walking|walk)\b/i],
    ["plataforma", "Plataforma", /\bplatform\b/i],
    ["slip-on", "Slip-on", /\bslip[- ]?ons?\b/i],
    ["botitas", "Caña alta", /\bhigh[- ]?tops?\b|\bhi\b/i],
  ]),
  sandalias: S("Todas las sandalias", [
    ["slides", "Slides", /\bslides?\b/i],
    ["chanclas", "Chanclas", /\b(flip[- ]?flops?|thongs?|chanclas?)\b/i],
    ["plataforma", "Plataforma y cuña", /\b(platform|wedges?|cu[ñn]a)\b/i],
    ["taco", "Con taco", /\b(heels?|heeled)\b/i],
    ["deportivas", "Deportivas", /\b(sport|hiking|trail|water)\s+sandals?\b/i],
  ]),
  "mocasines-y-pantuflas": S("Todos", [
    ["mocasines", "Mocasines", /\b(loafers?|moccasins?|mocasines?|drivers?)\b/i],
    ["pantuflas", "Pantuflas", /\b(slippers?|pantuflas?)\b/i],
    ["zuecos", "Zuecos", /\b(clogs?|zuecos?)\b/i],
    ["mules", "Mules", /\bmules?\b/i],
  ]),
  vestidos: S("Todos los vestidos", [
    ["mini", "Mini", /\bmini\b/i],
    ["midi", "Midi", /\bmidi\b/i],
    ["maxi", "Maxi", /\bmaxi\b|\bgowns?\b|\bfloor[- ]length\b/i],
    ["fiesta", "De fiesta", /\b(cocktail|evening|party|gowns?|formal|sequin\w*)\b/i],
    ["camiseros", "Camiseros", /\bshirt\s*dress\b/i],
    ["slip", "Slip", /\bslip\s+dress\b/i],
  ]),
  "pantalones-y-jeans": S("Todos", [
    ["jeans", "Jeans", /\b(jeans?|denim)\b/i],
    ["joggers", "Joggers y buzos", /\b(joggers?|sweatpants?|track\s*pants?)\b/i],
    ["leggings", "Leggings", /\b(leggings?|tights)\b/i],
    ["cargo", "Cargo", /\bcargo\b/i],
    ["anchos", "Anchos", /\b(wide[- ]leg|palazzo|flare\w*|baggy|relaxed)\b/i],
    ["vestir", "De vestir", /\b(trousers?|dress\s+pants?|chinos?|slacks)\b/i],
  ]),
  "blusas-y-tops": S("Todos", [
    ["polos", "Polos", /\b(t-?shirts?|tees?\b)/i],
    ["crop", "Tops cortos", /\bcrop(ped)?\b/i],
    ["tank", "Bividís y camisoles", /\b(tanks?|camis?|camisoles?)\b/i],
    ["bodies", "Bodies", /\bbodysuits?\b/i],
    ["blusas", "Blusas", /\bblouses?\b/i],
    ["manga-larga", "Manga larga", /\blong[- ]sleeves?\b/i],
  ]),
  "casacas-y-abrigos": S("Todos", [
    ["abrigos", "Abrigos", /\b(coats?|trench\w*|overcoats?|parkas?)\b/i],
    ["acolchadas", "Acolchadas", /\b(puffers?|down|quilted|padded)\b/i],
    ["cuero", "De cuero", /\bleather\b/i],
    ["denim", "Denim", /\b(denim|jean\s+jackets?)\b/i],
    ["blazers", "Blazers", /\bblazers?\b/i],
    ["rompevientos", "Rompevientos", /\b(windbreakers?|anoraks?|rain\s+jackets?|shell)\b/i],
    ["chalecos", "Chalecos", /\b(vests?|gilets?)\b/i],
  ]),
  "chompas-y-polerones": S("Todos", [
    ["polerones", "Polerones", /\b(hoodies?|hooded|sweatshirts?|crewnecks?)\b/i],
    ["cardigans", "Cárdigans", /\bcardigans?\b/i],
    ["chompas", "Chompas", /\b(sweaters?|pullovers?|knit)\b/i],
  ]),
  fragancia: S("Todas las fragancias", [
    ["edp", "Eau de parfum", /\b(eau\s+de\s+parfum|edp|parfum)\b/i],
    ["edt", "Eau de toilette", /\b(eau\s+de\s+toilette|edt)\b/i],
    ["colonia", "Colonia", /\b(cologne|colonia|eau\s+de\s+cologne)\b/i],
    ["sets", "Sets de regalo", /\b(gift\s+set|sets?\b|coffret)\b/i],
    ["minis", "Minis y viaje", /\b(mini|travel|rollerball|\d(\.\d)?\s*ml)\b/i],
  ]),
  carteras: S("Todas las carteras", [
    ["mochilas", "Mochilas", /\bbackpacks?\b/i],
    ["tote", "Tote", /\btotes?\b/i],
    ["bandolera", "Bandolera", /\b(crossbody|cross-body|messenger|sling)\b/i],
    ["hombro", "De hombro", /\b(shoulder|hobo)\b/i],
    ["clutch", "Clutch y de noche", /\b(clutch|evening|minaudi[eè]re)\b/i],
    ["billeteras", "Billeteras", /\b(wallets?|card\s+holders?|cardholders?)\b/i],
  ]),
  "lentes-de-sol": S("Todos los lentes", [
    ["polarizados", "Polarizados", /\bpolari[sz]ed\b/i],
    ["aviador", "Aviador", /\baviators?\b/i],
    ["cat-eye", "Cat eye", /\bcat[- ]?eye\b/i],
    ["redondos", "Redondos", /\bround\b/i],
    ["deportivos", "Deportivos", /\b(sport|wrap|shield)\b/i],
  ]),
  shorts: S("Todos los shorts", [
    ["denim", "Denim", /\b(denim|jean)\b/i],
    ["deportivos", "Deportivos", /\b(running|athletic|training|gym|sport|basketball)\b/i],
    ["bano", "De baño", /\b(swim|board\s*shorts?|boardshorts?)\b/i],
    ["cargo", "Cargo", /\bcargo\b/i],
  ]),
};
export function styleOf(title, tkey) {
  const st = STYLES[tkey];
  if (!st) return "";
  for (const [k, , rx] of st.rules) if (rx.test(title || "")) return k;
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
  if ((m = /^(?:m|men'?s?)\s*(\d{1,2}(?:\.5)?)\s*\/?\s*(?:w|women'?s?)\s*(\d{1,2}(?:\.5)?)$/i.exec(s)))
    return [{ z: "US " + trimZero(m[1]), side: "m" }, { z: "US " + trimZero(m[2]), side: "w" }];
  if ((m = /^us\s*(\d{1,2}(?:\.5)?)\s*=\s*(it|eu)\s*(\d{2}(?:\.5)?)$/i.exec(s)))
    return [{ z: "US " + trimZero(m[1]), side: "" }, { z: m[2].toUpperCase() + " " + trimZero(m[3]), side: "" }];
  if ((m = /^(it|eu|uk)\s*(\d{1,2}(?:\.5)?)$/i.exec(s))) return [{ z: m[1].toUpperCase() + " " + trimZero(m[2]), side: "" }];
  if ((m = /^(women'?s?|men'?s?)\s*(\d{1,2}(?:\.5)?)$/i.exec(s))) return [{ z: "US " + trimZero(m[2]), side: /^w/i.test(m[1]) ? "w" : "m" }];
  if ((m = /^(?:us\s*)?(\d{1,2}(?:\.[05])?)\s*(?:m|w|\|\s*us|us)?$/i.exec(s))) {
    const n = Number(m[1]);
    if (n >= 30) return [{ z: "EU " + trimZero(m[1]), side: "" }];
    if (n > 0 && n <= 18) return [{ z: "US " + trimZero(m[1]), side: "" }];
  }
  if ((m = /^(\d{2}(?:\.5)?)$/.exec(s)) && Number(m[1]) >= 30) return [{ z: "EU " + trimZero(m[1]), side: "" }];
  if ((m = /^(\d{1,2}(?:\.5)?)\s*(c|y|t|k)$/i.exec(s))) return [{ z: trimZero(m[1]) + m[2].toUpperCase(), side: "" }];
  const up = s.toUpperCase().replace(/\s+/g, "");
  if (/^(XXS|XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|5XL|1X|2X|3X|4X|OS|ONESIZE)$/.test(up)) return [{ z: up === "ONESIZE" || up === "OS" ? "Talla única" : up.replace(/^XXL$/, "2XL").replace(/^XXXL$/, "3XL"), side: "" }];
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
const runCache = new WeakMap();
/* One size run -> its tokens (cached per run array). */
function tokensOf(run) {
  if (!run || !run.length) return [];
  if (runCache.has(run)) return runCache.get(run);
  const seen = new Map();
  for (const raw of run) for (const t of normSize(raw)) { const k = t.z + "|" + t.side; if (!seen.has(k)) seen.set(k, t); }
  const out = [...seen.values()];
  runCache.set(run, out);
  return out;
}
function sizesFor(tokens, u) {
  const out = new Set();
  for (const t of tokens || []) if (!t.side || !u || u === "kids" || (u === "men" ? t.side === "m" : t.side === "w")) out.add(t.z);
  return out;
}

/* ---------- price bands, in soles ---------- */
export const PRICE_BANDS = [[0, 100], [100, 250], [250, 500], [500, 1000], [1000, 0]];
export const bandKey = (b) => b[0] + "-" + (b[1] || "");
export function bandLabel(b) {
  return b[1] ? (b[0] ? "S/ " + b[0] + " – " + b[1] : "Hasta S/ " + b[1]) : "Más de S/ " + b[0];
}
function bandOf(soles) {
  for (const b of PRICE_BANDS) if (soles >= b[0] && (!b[1] || soles < b[1])) return bandKey(b);
  return "";
}

/* ---------- the facts of a product outside its department ---------- */
/* cyrb53: a short, stable key for store + title. */
export function factKey(retailer, title) {
  const str = String(retailer || "") + "\u0000" + String(title || "");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const FACTS_FILE = "assets/sections/nav/_fn/facts.json";
export const U_CODES = ["", "women", "men", "kids", "unisex"];
let FACTS = null;
/* { types: [[k,label]], runs: [[sizes]], keys: { key: [typeIdx, uCode, runIdx] } } */
export function loadFacts(roots) {
  if (FACTS && !roots) return FACTS;
  const f = readFrom(roots, FACTS_FILE) || { types: [], runs: [], keys: {} };
  if (!roots) FACTS = f;
  return f;
}
function factsOf(F, retailer, title) {
  const r = F.keys[factKey(retailer, title)];
  if (!r) return null;
  const t = F.types[r[0]] || null;
  return { t: t ? { k: t[0], label: t[1] } : null, u: U_CODES[r[1]] || "", run: F.runs[r[2]] || null };
}

/* ---------- the filters, read from a query ---------- */
const listOf = (v, n) => String(v || "").split(SEP).map((x) => x.trim()).filter(Boolean).slice(0, 12).map((x) => x.slice(0, n));
export function readFilters(qs) {
  const s = (k, n) => String(qs[k] || "").trim().slice(0, n);
  const u = AUD.some(([k]) => k === qs.u) ? qs.u : "";
  const fx = Number(qs.fx);
  return {
    u, t: s("t", 60).toLowerCase(), s: s("s", 30).toLowerCase(),
    b: listOf(qs.b, 80).map((x) => x.toLowerCase()), z: listOf(qs.z, 24),
    p: listOf(qs.p, 12).filter((x) => PRICE_BANDS.some((b) => bandKey(b) === x)),
    o: qs.o === "1" ? "1" : "", fx: fx >= 2 && fx <= 6 ? fx : 0,
    r: listOf(qs.r, 40).map((x) => x.toLowerCase()), w: s("w", 80).toLowerCase(),
  };
}

/* ---------- the engine ----------
   rows: [{ x (the source's own item), title, brand, retailer, usd (the
   card's price), sale, t: {k,label}, u, run }] in the listing's order. */
const rowType = (r) => (r.x && (r.x.type ?? r.x._type ?? r.x.pt)) ?? "";
function plusLingerieRows(hits) {
  return hits.some((r) => r.retailer === PLUS_LINGERIE_LEAD) && isLingerieSet(hits.map((r) => ({ title: r.title, type: rowType(r) })));
}
export function facetAnswer(rows, f, sort = "deal", page = 0, card = (x) => x) {
  const fx = f.fx || 0;
  const B = new Set(f.b || []), Z = new Set(f.z || []), P = new Set(f.p || []), RR = new Set(f.r || []);
  const words = String(f.w || "").split(/\s+/).filter(Boolean);
  /* No image, no card (#443 c.6547325227): a row the page cannot draw is
     never counted. */
  const R = rows.filter((r) => r.image).map((r, i) => ({
    ...r, i, st: styleOf(r.title, r.t.k), bk: String(r.brand || "").trim().toLowerCase(),
    z: sizesFor(tokensOf(r.run), f.u), band: fx ? bandOf(r.usd * fx) : "",
  }));
  const match = (r, skip) => {
    if (skip !== "u" && f.u && !inAudience(r, f.u)) return false;
    if (skip !== "t" && f.t && r.t.k !== f.t) return false;
    if (skip !== "s" && skip !== "t" && f.s && r.st !== f.s) return false;
    if (skip !== "b" && B.size && !B.has(r.bk)) return false;
    if (skip !== "z" && Z.size) { let hit = false; for (const z of r.z) if (Z.has(z)) { hit = true; break; } if (!hit) return false; }
    if (skip !== "p" && P.size && fx && !P.has(r.band)) return false;
    if (skip !== "o" && f.o && !(r.sale > 0)) return false;
    if (skip !== "r" && RR.size && !RR.has(r.retailer)) return false;
    if (words.length) { const hay = (r.title + " " + (r.brand || "")).toLowerCase(); for (const w of words) if (hay.indexOf(w) === -1) return false; }
    return true;
  };
  const count = (skip, keysOf) => {
    const n = new Map();
    for (const r of R) {
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
  const styleIdx = (k) => (STYLES[f.t] ? STYLES[f.t].rules.findIndex((x) => x[0] === k) : 0);
  const facets = {
    u: AUD.map(([k, label]) => [k, label, R.filter((r) => match(r, "u") && inAudience(r, k)).length]).filter((x) => x[2] > 0),
    t: count("t", (r) => [[r.t.k === "otros" ? "" : r.t.k, r.t.label]]).sort(byN),
    s: f.t && STYLES[f.t] ? count("s", (r) => [[r.st, styleLabel(f.t, r.st)]]).sort((a, b) => styleIdx(a[0]) - styleIdx(b[0])) : [],
    b: count("b", (r) => [[r.bk, String(r.brand || "").trim()]]).sort(byN),
    z: count("z", (r) => [...r.z].map((z) => [z, z])).sort((a, b) => sizeOrder(a[0], b[0])),
    p: fx ? PRICE_BANDS.map((b) => [bandKey(b), bandLabel(b), R.filter((r) => match(r, "p") && r.band === bandKey(b)).length]).filter((x) => x[2] > 0) : [],
    r: count("r", (r) => [[r.retailer, storeLabel(r.retailer)]]).sort(byN),
    o: [["1", "Ofertas", R.filter((r) => match(r, "o") && r.sale > 0).length]].filter((x) => x[2] > 0),
  };
  /* A selection the others emptied stays listed (at its own count under
     the others, which is zero only when it is the one being removed). */
  let hits = R.filter((r) => match(r));
  if (sort === "low") hits.sort((a, b) => (a.usd - b.usd) || (a.i - b.i));
  else if (sort === "high") hits.sort((a, b) => (b.usd - a.usd) || (a.i - b.i));
  else hits.sort((a, b) => ((b.sale || 0) - (a.sale || 0)) || (a.i - b.i));
  if (sort === "deal") { const withImg = hits.filter((r) => r.image !== ""), none = hits.filter((r) => r.image === ""); hits = withImg.concat(none); }
  /* LENCERÍA + TALLAS PLUS (Danny, #443 c.6621407508): lingerie under a
     plus Talla (1X, 2XL, 16W ...) opens on Lane Bryant -- its lingerie is
     photographed on plus-size women. The bar's own order only (a price
     sort stays a price sort); the allowlist decides what is lingerie. */
  if (sort === "deal" && f.u !== "men" && (f.z || []).length && f.z.every(isPlusSizeLabel) && plusLingerieRows(hits)) hits = leadFirst(hits);
  const pages = Math.ceil(hits.length / PAGE_SIZE);
  const tl = f.t ? ((R.find((r) => r.t.k === f.t) || {}).t || {}).label || "" : "";
  return {
    f: { u: f.u, t: f.t, s: f.s, b: f.b, z: f.z, p: f.p, o: f.o, r: f.r, w: f.w }, sort, tl,
    sl: f.s ? styleLabel(f.t, f.s) : "", sAll: f.t && STYLES[f.t] ? STYLES[f.t].all : "",
    count: hits.length, page, pages, tAll: R.filter((r) => match(r, "t")).length,
    cards: hits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => card(r.x)),
    facets,
  };
}

/* ---------- the sources ---------- */
const typeOfRaw = (raw) => { const t = typeKeyOf({ type: raw }); return t; };
const sizesCache = new Map();
function deptSizes(key, roots) {
  const ck = key + "|" + (roots ? roots.join() : "");
  if (sizesCache.has(ck)) return sizesCache.get(ck);
  const f = readFrom(roots, join(FN_DIR, key + ".sizes.json"));
  const out = f ? (f.rows || []).map((i) => (f.runs || [])[i] || []) : [];
  sizesCache.set(ck, out);
  return out;
}
function deptRows(key, roots) {
  const d = loadDept(key, roots || CANDIDATES);
  if (!d) return null;
  const z = deptSizes(key, roots);
  return d.list.map((p, i) => ({ x: p, title: p.title, brand: p.brand, retailer: p.retailer, usd: finalUsd(p.rawPrice, p.retailer), sale: p.salePct || 0, image: p.image || "", t: typeKeyOf(p), u: p.u || "", run: z[i] }));
}
/* A product outside a department: the department's facts, else its own type. */
function withFacts(F, retailer, title, ownType) {
  const fa = factsOf(F, retailer, title);
  return { t: (fa && fa.t) || ownType || { k: "otros", label: "Más productos" }, u: (fa && fa.u) || "", run: fa && fa.run };
}
async function tiendaRows(key, roots) {
  const T = await import("./_tienda-core.js");
  const s = T.loadStore(key, roots || undefined);
  if (!s) return null;
  const F = loadFacts(roots);
  /* The store's own audience per row (build-store-slices: the title, the
     store's facet, its bucket; a silent adult wearable is unisex). */
  const AUD_CODE = { m: "men", w: "women", k: "kids", u: "unisex" };
  const shoes = Array.isArray(s.shoes) ? new Set(s.shoes) : null;
  return (s.rows || []).map((r, i) => {
    const own = T.typeOfRow(s, r, i, roots || undefined);
    const ownT = own && own !== "Más productos" ? { k: lensSlug(own), label: own } : null;
    const fx = withFacts(F, s.store || key, r[0], ownT);
    /* LABEL-TRUE (#443 c.6635296341): the department's type is the store's
       own type field -- a blind «Accesorios» stamp at the surf shops --
       so it yields to the store page's aisle when it is a catch-all or
       contradicts it (a Vans shoe is not «Accesorios»). */
    const aisle = T.aisleOfRow(s, i, roots || undefined);
    const aisleT = aisle && !/^(Más|Ofertas)\b/.test(aisle.title) ? { k: lensSlug(aisle.title), label: aisle.title } : null;
    if (fx.t && fx.t.k !== "otros" && aisle && !T.typeAgrees(fx.t.label, aisle.key, aisle.title)) fx.t = ownT || aisleT || { k: "otros", label: "Más productos" };
    /* A row the store files as a shoe is never another type's shoe. */
    if (shoes && fx.t) {
      const shoe = shoes.has(i), shoeLabel = T.SHOE_TYPE_RX.test(fx.t.label);
      if (shoe && !shoeLabel) fx.t = ownT && T.SHOE_TYPE_RX.test(ownT.label) ? ownT : { k: "zapatos", label: "Zapatos" };
      else if (!shoe && shoeLabel && !(aisle && /^t-zapatos(~|$)/.test(aisle.key))) fx.t = ownT && !T.SHOE_TYPE_RX.test(ownT.label) ? ownT : aisleT && !T.SHOE_TYPE_RX.test(aisleT.label) ? aisleT : { k: "otros", label: "Más productos" };
    }
    if (!fx.u && s.aud && AUD_CODE[s.aud[i]]) fx.u = AUD_CODE[s.aud[i]];
    return { x: T.cardOfRow(r), title: r[0], brand: r[1], retailer: s.store || key, usd: finalUsd(r[2], s.store || key), sale: r[4] || 0, image: r[5] || "", ...fx };
  });
}
async function marcaRows(key, roots) {
  const Bc = await import("./_brand-core.js");
  const { items, labels, aliases } = Bc.loadItems(roots || undefined);
  let k = Bc.brandKeyOf(key);
  if (aliases[k]) k = aliases[k];
  const mine = Bc.filterByBrand(items, k);
  if (!mine.length) return null;
  const F = loadFacts(roots);
  void labels;
  return mine.map((p) => ({ x: Bc.cardOf(p), title: p.name, brand: p.brand, retailer: p.retailer, usd: finalUsd(p.price, p.retailer), sale: p.pct || 0, image: p.image || "",
    ...withFacts(F, p.retailer, p.name, p.ptype ? typeOfRaw(p.ptype) : null) }));
}
async function ofertasRows(roots) {
  const O = await import("./_ofertas-core.js");
  const d = O.loadDeals(roots ? roots[0] : undefined);
  const F = loadFacts(roots);
  return d.cards.map((c) => ({ x: c, title: c.title, brand: c.brand, retailer: c.store, usd: Number(c.usd) || 0, sale: Number(c.pct) || 0, image: c.image || "",
    ...withFacts(F, c.store, c.title, null) }));
}
/* Ropa Interior's own kinds (the feed's sub), in Spanish. */
const RI_SUB = { bra: "Sostenes", panty: "Panties", lingerie: "Lencería", shapewear: "Fajas y shapewear", boxer_brief: "Bóxer brief", brief: "Calzoncillos", trunk: "Trunks", hosiery: "Pantis y medias nylon", casual: "Medias", sport: "Medias deportivas", dress: "Medias de vestir" };
export function riRows(who, roots) {
  const file = who === "mujer" ? "ropa-interior-women-feed.json" : who === "hombre" ? "ropa-interior-feed.json" : "";
  if (!file) return null;
  const j = readFrom(roots, file);
  if (!j) return null;
  const F = loadFacts(roots);
  /* The page's own rule: a photo not cleared of its US price sticker is no photo. */
  return (j.items || []).filter((p) => p && p.t && p.p > 0 && p.img && (!p.ir || p.ir === "clean")).map((p) => {
    const sub = String(p.sub || "").toLowerCase();
    const label = RI_SUB[sub] || (p.ty === "socks" ? "Medias" : "");
    const fa = factsOf(F, p.r, p.t);
    const sale = p.o > p.p ? Math.round((1 - p.p / p.o) * 100) : 0;
    return { x: p, title: p.t, brand: p.b, retailer: p.r, usd: finalUsd(p.p, p.r), sale, image: p.img || "",
      t: label ? { k: lensSlug(label), label } : { k: "otros", label: "Más productos" }, u: who === "mujer" ? "women" : "men", run: fa && fa.run };
  });
}
export async function rowsOf(src, roots) {
  if (src.dept) return deptRows(src.dept, roots);
  if (src.tienda) return tiendaRows(src.tienda, roots);
  if (src.marca) return marcaRows(src.marca, roots);
  if (src.ofertas) return ofertasRows(roots);
  if (src.ri) return riRows(src.ri, roots);
  return null;
}
export function sourceOf(qs) {
  const k = (v, rx) => (rx.test(String(v || "")) ? String(v) : "");
  if (qs.dept) return { dept: k(qs.dept, /^[a-z_]{2,40}$/) };
  if (qs.tienda) return { tienda: k(qs.tienda, /^[a-z0-9_]{2,40}$/) };
  if (qs.marca) return { marca: k(qs.marca, /^[a-z0-9]{1,60}$/) };
  if (qs.ofertas === "1") return { ofertas: true };
  if (qs.ri) return { ri: k(qs.ri, /^(mujer|hombre)$/) };
  return {};
}
const cardFor = (src) => (src.dept ? deptCard : (x) => x);

/* Phase 1's name, kept: one department under every filter. */
export function navFilter(key, f, sort = "deal", page = 0, roots) {
  const rows = deptRows(key, roots);
  if (!rows) return null;
  return { dept: key, ...facetAnswer(rows, f, sort, page, deptCard) };
}

export async function answerNav(qs, roots) {
  const src = sourceOf(qs);
  const rows = await rowsOf(src, roots);
  if (!rows) return { status: 404, body: { error: "No encontramos esta página." } };
  const f = readFilters(qs);
  const sort = NF_SORTS.some(([k]) => k === qs.sort) ? qs.sort : "deal";
  const out = facetAnswer(rows, f, sort, Math.max(0, Math.min(500, Number(qs.page) || 0)), cardFor(src));
  return { status: 200, body: { src, ...out } };
}

/* Search: the engine over the ranked hits (netlify/functions/search.js). */
export function searchFacets(hits, qs, card, roots) {
  const F = loadFacts(roots);
  const rows = hits.map((p) => ({ x: p, title: p.title, brand: p.brand, retailer: p.retailer, usd: p.finalPrice ? Number(p.price) : finalUsd(p.price, p.retailer),
    sale: Number(p.originalPrice) > Number(p.price) ? Math.round((1 - Number(p.price) / Number(p.originalPrice)) * 100) : 0, image: p.image || "",
    ...withFacts(F, p.retailer, p.title, null) }));
  const f = readFilters(qs);
  const sort = NF_SORTS.some(([k]) => k === qs.sort) ? qs.sort : "deal";
  return facetAnswer(rows, f, sort, Math.max(0, Math.min(500, Number(qs.page) || 0)), card);
}
void typeLabel; void photosFirst;
