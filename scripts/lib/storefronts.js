/* ============================================================
   EVERY STORE WITH PRODUCTS HAS ITS STOREFRONT (#443, Danny's rulings
   2026-11-01). Aria Perfumes is the flagship; then the Belleza three
   (Sephora, Ulta, YesStyle), then Kohl's, Macy's, Costco, Miu Miu and
   the rest. Best Buy keeps its own #413 builder (build-store-slices
   SLICED_STORES) and follows the same order.

   THE ORDER INSIDE EVERY STOREFRONT (Danny, locked):
     1. Ofertas de <tienda> -- sale items only, by the site's one sale
        rule (sale-rule.js: a real was-price). A store with no real
        markdown has no Ofertas rail; none is made up.
     2. the store's category rails -- only the categories it truly sells,
        each one holding only that category. No Más vendidos, no
        Destacados, no mixed «Más de <tienda>» tail between them.
   A thin store keeps the same order (PacSun's 18 products still open on
   Ofertas, then Ropa).

   WHAT A PRODUCT IS (the hard rule). The family is the site's one
   classifier (product-type.js, via tienda.html's productTypeOf): never a
   brand or a keyword in the store's own type field. Inside a family a
   store sells deep (Ropa at Kohl's, Belleza at Sephora), the rails are
   its aisles, read from the product's own noun:
     - Ropa: scripts/lib/store-subrails.js (the garment aisles every
       storefront's «Ver todo» already opens into), plus one gym aisle:
       a sports bra is training wear, not lingerie;
     - Belleza: BEAUTY_AISLES below -- the HEAD noun of the title (the
       last product noun before «with / for / +»): a «Foundation Brush»
       is a brush, a «Dry Shampoo Gift Set» is hair care. The stores'
       own type fields are not read: Sephora files dry shampoo under
       «Fragancia», YesStyle a cushion foundation under «Mascarillas».
     - a beauty store's product whose head noun is a beauty product IS
       beauty, whatever its store's type field says: Ulta files its sugar
       scrubs under «Baño y cuerpo», which the shared classifier reads as
       swimwear; YesStyle's «Sleeping Heel Patch» is not a shoe;
     - at a training brand (Alphalete, Gymshark, Athleta: `training`) a
       bra is a sports bra.
   A product no aisle claims stays in its family's «Más <familia>» rail
   (still that family), and every product stays in Todo and the search.

   ARIA PERFUMES (the flagship, Danny: "probably the BEST storefront we
   have"). Its rails come from the catalogue's own classes and fields
   (scripts/build-perfumes-catalog.mjs): Ofertas (the great houses lead,
   the department's own order), Para mujer / Para hombre / Unisex (the
   catalogue's doors), the concentrations (its `concentration` field:
   Eau de Parfum, Eau de Toilette, Parfum y extrait, Eau de Cologne),
   Sets de regalo, Testers, Minis, Cuerpo y cuidado, Repuestos, then the
   great houses, one rail each. The house strip (real logo files only)
   opens each house's rail.
   ============================================================ */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SUB_TAXONOMY } from "./store-subrails.js";
import { PERFUME_DESIGNER_HOUSES, PERFUME_MAINSTREAM, perfumeClassOf, perfumeBrands, isKnownPerfumeBrand } from "../../netlify/functions/_department-core.js";

/* The storefronts this rule builds (build-store-slices.mjs reads it).
   `split`: the families whose aisles become the store's rails. */
export const STOREFRONTS = {
  ariaperfumes: { flagship: "perfumes" },
  sephora: { split: ["belleza"] },
  ulta: { split: ["belleza"] },
  yesstyle: { split: ["belleza"] },
  kohls: { split: ["ropa"] },
  macys: { split: ["ropa"] },
  costco: { split: [] },
  miumiu: { split: ["ropa"] },
  alphalete: { split: ["ropa"], training: true },
  gymshark: { split: ["ropa"], training: true },
  bananarepublic: { split: ["ropa"] },
  newbalance: { split: ["ropa"] },
  gap: { split: ["ropa"] },
  athleta: { split: ["ropa"], training: true },
  oldnavy: { split: ["ropa"] },
  pacsun: { split: ["ropa"] },
};
/* On Danny's 2026-11-01 list, NOT built: Sam's Club was taken off the
   site by his own order (#443 c.6468346931: one scrape of a disposables
   aisle is not a store). It waits for his confirmation. */
export const HELD_STOREFRONTS = { samsclub: "Retirada del sitio por orden de Danny (#443 c.6468346931); espera su confirmación." };

/* A store this size or smaller is thin: its rails take fewer products. */
export const THIN_STORE = 200;
export const FAMILY_MIN = 12, FAMILY_MIN_THIN = 2;
/* A family is one of the store's categories when it holds this share of
   the store too: ten «Technical yarn» bag charms at Miu Miu are not a
   Hogar aisle. */
export const FAMILY_SHARE = 0.005;
export const AISLE_MIN = 12, AISLE_MIN_THIN = 4;

/* ---------------- Belleza: the head noun ---------------- */
export const BEAUTY_AISLES = [
  ["maquillaje", "Maquillaje"], ["piel", "Cuidado de la piel"], ["cabello", "Cabello"],
  ["cuerpo", "Cuerpo y baño"], ["unas", "Uñas"], ["herramientas", "Brochas y herramientas"],
];
const BEAUTY_NOUNS = [
  ["herramientas", /\b(mitts?|loofahs?|tapes?|brush(es)?|sponges?|blenders?|applicators?|tweezers?|sharpeners?|lash\s+curlers?|eyelash\s+curlers?|mirrors?|hair\s*dryers?|blow\s*dryers?|dryers?|flat\s*irons?|curling\s+(irons?|wands?)|straighteners?|hot\s+brush|combs?|rollers?|gua\s*sha|tools?|pouch(es)?|makeup\s+bags?|cosmetic\s+bags?)\b/i],
  ["unas", /\b(nail\s+(polish(es)?|lacquers?|colou?rs?|kits?|care|treatments?|strengtheners?|oils?)|nails?|manicure|pedicure|top\s*coats?|base\s*coats?|cuticles?)\b/i],
  ["cabello", /\b(shampoos?|conditioners?|dry\s+shampoo|hair\s*sprays?|hairsprays?|hair\s+(masks?|oils?|serums?|creams?|treatments?|mists?|gels?|sprays?|primers?|perfumes?|care|color|dyes?|repair)|leave[- ]in|scalp\s*\w*|curl\s+(creams?|defin\w*)|styling\s+\w+|pomades?|mousse|texturi[sz]ing\s+sprays?|heat\s+protect\w*|edge\s+control)\b/i],
  ["maquillaje", /\b(foundations?|concealers?|correctors?|mascaras?|eye\s*liners?|eyeliners?|eye\s*shadows?|eyeshadows?|palettes?|blush(es|er)?|bronzers?|highlighters?|contour\w*|primers?|setting\s+(sprays?|powders?|mists?)|powders?|cushions?|bb\s+creams?|cc\s+creams?|tinted\s+moisturi[sz]ers?|skin\s+tints?|lip\s*sticks?|lipsticks?|lip\s+(gloss(es)?|liners?|stains?|tints?|oils?|glaze|balms?|plumpers?|kits?|mud|masks?|treatments?)|lip\s*&\s*cheek|glosses|lips?|brows?|eyebrows?|lash(es)?|false\s+lashes|makeup|make-up|cheeks?)\b/i],
  ["cuerpo", /\b(body\s+(wash(es)?|lotions?|creams?|butters?|scrubs?|oils?|mists?|sprays?|milks?|serums?|polish|bars?)|shower\s+(gels?|oils?|creams?|foams?)|bath\s+(bombs?|salts?|soaks?|oils?|soaps?)|bubble\s+bath|hand\s+(creams?|lotions?|washes?|soaps?)|foot\s+(creams?|masks?|peels?)|deodorants?|antiperspirants?|sanitizers?|body\s+care|shower\s+steamers?|steamers?|bars?|self[- ]tan\w*|tanning\s+\w+|bronzing\s+(foams?|drops?|mousse)|soaps?)\b/i],
  ["piel", /\b(serums?|s[eé]rums?|ampoules?|essences?|moisturi[sz]ers?|creams?|cr[eè]mes?|gel\s+creams?|lotions?|emulsions?|cleansers?|wash(es)?|cleansing\s+(balms?|oils?|foams?|waters?|milks?)|face\s+wash(es)?|micellar\s+waters?|toners?|tonics?|mists?|essences?|masks?|masques?|sheet\s+masks?|peels?|exfoliat\w*|scrubs?|sunscreens?|sun\s*screens?|sun\s+(creams?|sticks?|serums?|milks?)|spf\s*\d*|eye\s+(creams?|serums?|patch(es)?|gels?|balms?)|patch(es)?|pads?|oils?|balms?|retinol|retinal|vitamin\s+c|treatments?|milk|gel|skin\s*care|skincare|acne|pimple|blemish)\b/i],
];
const BEAUTY_BODY_RX = /\b(body|hand|foot|feet|shower|bath)\b/i;
/* The title, cut before what only describes it: «with», «for», «+», «|», « - ». */
const headPart = (name) => String(name || "").split(/\s+(?:with|for|featuring|w\/|and\s+(?:mini|travel|full))\s+|\s*[+|]\s*|\s+[-–—]\s+|\s*\(\s*/i)[0];
/** The beauty aisle a product IS, by its head noun; null when no noun says. */
export function beautyAisle(item) {
  const name = String(item?.name || item?.title || "");
  const pick = (text) => {
    let best = null, at = -1;
    for (const [k, rx] of BEAUTY_NOUNS) {
      const g = new RegExp(rx.source, "gi");
      let m;
      while ((m = g.exec(text))) if (m.index > at || (m.index === at && best === null)) { best = k; at = m.index; }
    }
    return best;
  };
  let a = pick(headPart(name)) || pick(name);
  if (a === "piel" && BEAUTY_BODY_RX.test(headPart(name))) a = "cuerpo";
  return a;
}

/* ---------------- Ropa: the garment aisles ---------------- */
const SPORTS_BRA_RX = /\b(sports?|training|workout|seamless|high[- ]support|low[- ]support|medium[- ]support|longline)\s+bras?\b|\bbra\s+tops?\b/i;
export const GARMENT_AISLES = [["deportivos", "Sostenes deportivos"], ...SUB_TAXONOMY.ropa.aisles.map((a) => [a.k, a.label])];
const GARMENT_KEYS = new Set(GARMENT_AISLES.map(([k]) => k));
const BRA_RX = /\b(bras?|bralettes?)\b/i;
/* The singular nouns the shared rules read only in the plural: a
   «Strike Short» is a short, a «Power Long Sleeve» a top. */
const SLEEVE_TOP_RX = /\b(short|long)[- ]sleeves?\b|\bsleeveless\b|\bLS\b/;
const SHORT_RX = /\b(short|pant|jogger|legging|sweatpant|tight)\b/i;
/* Clothing nouns the aisles do not name: a product the shared classifier
   only calls Ropa by default (it has no other answer -- Costco's paper cup
   sleeves, its lemonade) is clothing only when its title says so. */
const APPAREL_RX = /\b(apparel|clothing|popovers?|tunics?|robes?|kimonos?|caftans?|ponchos?|uniforms?|scrubs?\s+(tops?|pants)|onesies?|bodysuits?|rompers?|polos?|henleys?|tanks?|sleeves?|pants?|shorts?|joggers?|leggings?|bras?|hoodies?|zip[- ]?ups?|sweats|tees?|shirts?|tops?|dress(es)?|skirts?|jackets?|coats?|vests?|cardigans?|sweaters?|pajamas?|socks?|underwear|briefs?|boxers?|panty|panties|trunks?|jeans?|denim|overalls?|jumpsuits?|suits?|blazers?|outfits?|sets?)\b/i;
/** The garment aisle a piece of clothing IS (store-subrails.js), or null. */
export function garmentAisle(item, training = false) {
  const name = String(item?.name || item?.title || "");
  if (SPORTS_BRA_RX.test(name) || (training && BRA_RX.test(name))) return "deportivos";
  const a = SUB_TAXONOMY.ropa.aisle({ ...item, name });
  if (a && GARMENT_KEYS.has(a)) return a;
  if (SLEEVE_TOP_RX.test(name)) return "tops";
  if (SHORT_RX.test(name)) return "pants";
  return null;
}

export const SPLITTERS = {
  belleza: { aisles: BEAUTY_AISLES, aisleOf: beautyAisle, more: "Más belleza" },
  ropa: { aisles: GARMENT_AISLES, aisleOf: garmentAisle, more: "Más ropa" },
};

/* ---------------- what a product is ---------------- */
/** The family a storefront files a product under (see the header). */
export const NO_FAMILY = "otros";
export function familyOf(p, R, cfg = {}) {
  let f = "ropa";
  try { f = R.productTypeOf(p); } catch {}
  if ((cfg.split || []).includes("belleza") && f !== "perfumes" && f !== "belleza" && beautyAisle(p)) return "belleza";
  if (f === "ropa" && !garmentAisle(p, !!cfg.training) && !APPAREL_RX.test(String(p.name || p.title || ""))) return NO_FAMILY;
  return f;
}
export const aisleOf = (fam, p, cfg = {}) => (fam === "ropa" ? garmentAisle(p, !!cfg.training) : SPLITTERS[fam] ? SPLITTERS[fam].aisleOf(p) : null);

/* ---------------- the rails of a storefront ---------------- */
/**
 * Ofertas, then the category rails. `R` is tienda.html's rules (saleTier,
 * productTypeOf, PRODUCT_TYPES); `sort` the store template's sellable
 * order. Every rail carries `cat` ({ fam, aisle }) -- what it holds.
 */
export function storefrontRails(key, label, items, R, sort, cfg) {
  const rails = [];
  const sales = items.filter((p) => R.saleTier(p) > 0).sort(sort);
  if (sales.length) rails.push({ key: "ofertas", title: "Ofertas de " + label, items: sales });
  const thin = items.length <= THIN_STORE;
  const famMin = thin ? FAMILY_MIN_THIN : Math.max(FAMILY_MIN, Math.ceil(items.length * FAMILY_SHARE)), aisleMin = thin ? AISLE_MIN_THIN : AISLE_MIN;
  const byFam = new Map();
  for (const p of items) {
    const f = familyOf(p, R, cfg);
    if (!byFam.has(f)) byFam.set(f, []);
    byFam.get(f).push(p);
  }
  const shown = new Set(rails.flatMap((r) => r.items.slice(0, 16)));
  const fresh = (arr) => arr.filter((p) => !shown.has(p)).concat(arr.filter((p) => shown.has(p)));
  const famLabel = (f) => (R.PRODUCT_TYPES.find((t) => t.key === f) || { label: f }).label;
  const groups = [...byFam.entries()].filter(([f, l]) => f !== NO_FAMILY && l.length >= famMin).sort((a, b) => b[1].length - a[1].length);
  for (const [fam, list] of groups) {
    const sp = (cfg.split || []).includes(fam) ? SPLITTERS[fam] : null;
    if (sp) {
      const by = new Map();
      for (const p of list) { const a = aisleOf(fam, p, cfg); if (a) { if (!by.has(a)) by.set(a, []); by.get(a).push(p); } }
      const own = sp.aisles.filter(([a]) => (by.get(a) || []).length >= aisleMin).sort((x, y) => by.get(y[0]).length - by.get(x[0]).length);
      if (own.length >= 2) {
        const claimed = new Set();
        for (const [a, title] of own) {
          for (const p of by.get(a)) claimed.add(p);
          rails.push({ key: `t-${fam}-${a}`, title, cat: { fam, aisle: a }, items: fresh(by.get(a).slice().sort(sort)) });
        }
        const rest = list.filter((p) => !claimed.has(p));
        if (rest.length >= famMin) rails.push({ key: `t-${fam}-mas`, title: sp.more, cat: { fam, aisle: null, rest: own.map(([a]) => a) }, items: fresh(rest.sort(sort)) });
        continue;
      }
    }
    rails.push({ key: "t-" + fam, title: famLabel(fam), cat: { fam }, items: fresh(list.slice().sort(sort)) });
  }
  return rails;
}

/* ---------------- Aria Perfumes, the flagship ---------------- */
export const PERFUME_DOOR_RAILS = [["mujer", "Para mujer"], ["hombre", "Para hombre"], ["unisex", "Unisex"]];
export const PERFUME_CONCENTRATIONS = [["edp", "Eau de Parfum", ["EDP"]], ["edt", "Eau de Toilette", ["EDT"]],
  ["parfum", "Parfum y extrait", ["Parfum", "Extrait"]], ["edc", "Eau de Cologne", ["EDC"]]];
export const PERFUME_CLASS_RAILS = [["sets", "Sets de regalo"], ["testers", "Testers"], ["minis", "Minis y de viaje"],
  ["cuidado", "Cuerpo y cuidado"], ["repuestos", "Repuestos"]];
export const PERFUME_CHIP_ORDER = ["mujer", "hombre", "unisex", "sets", "testers", "minis", "cuidado", "repuestos"];
export const PERFUME_HOUSE_RAILS = 18;
/* The houses lead in the order a shopper in Peru names them: the
   classics (PERFUME_CLASSICS) and the homepage's house strip first, then
   the other great houses by their true count. */
export const PERFUME_HOUSE_LEAD = ["christian dior", "creed", "carolina herrera", "paco rabanne", "yves saint laurent", "versace",
  "giorgio armani", "gucci", "prada", "burberry", "calvin klein", "tom ford", "valentino", "dolce & gabbana", "givenchy",
  "hugo boss", "jean paul gaultier", "hermes"];
/* The house logos the repo already holds (logos/brands/), by the
   catalogue's own brand string. No file, no tile: never a drawn logo. */
export const PERFUME_HOUSE_LOGOS = {
  "christian dior": "dior.svg", "versace": "versace.svg", "yves saint laurent": "saintlaurent.svg", "gucci": "gucci.svg",
  "prada": "prada.svg", "burberry": "burberry.svg", "calvin klein": "calvinklein.svg", "tom ford": "tomford.svg",
  "valentino": "valentino.svg", "givenchy": "givenchy.svg", "hermes": "hermes.svg", "chanel": "chanel.svg", "hugo boss": "boss.svg",
};
const brandKeyOf = (p) => String(p.brand || "").trim().toLowerCase();
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const bottle = (p) => (perfumeClassOf({ title: p.name, type: p.type }) === "frasco" ? 0 : 1);
/* The great houses lead, then the household names, then a really cheap
   lesser name, then the rest (the Perfumes department's sale order). */
const houseRank = (p, R) => (PERFUME_DESIGNER_HOUSES.has(brandKeyOf(p)) ? 0 : PERFUME_MAINSTREAM.has(brandKeyOf(p)) ? 1 : (R.saleTier(p) > 0 && p.price < 30) ? 2 : 3);
export function perfumeSalesSort(R) {
  return (a, b) => (houseRank(a, R) - houseRank(b, R)) || (bottle(a) - bottle(b)) || (R.discountPct(b) - R.discountPct(a)) || (a.price - b.price);
}
/* Inside a rail: the great houses first, the boxed bottle before its
   variants, on sale first, then the deeper discount, then the price. */
export function perfumeRailSort(R) {
  const lead = (p) => (PERFUME_DESIGNER_HOUSES.has(brandKeyOf(p)) ? 0 : PERFUME_MAINSTREAM.has(brandKeyOf(p)) ? 1 : 2);
  return (a, b) => (lead(a) - lead(b)) || (bottle(a) - bottle(b)) || ((R.saleTier(b) > 0) - (R.saleTier(a) > 0)) ||
    (R.discountPct(b) - R.discountPct(a)) || (a.price - b.price);
}
export function perfumeRails(label, items, R, root) {
  const rails = [];
  const sales = items.filter((p) => R.saleTier(p) > 0).sort(perfumeSalesSort(R));
  if (sales.length) rails.push({ key: "ofertas", title: "Ofertas de " + label, items: sales });
  const sort = perfumeRailSort(R);
  const shown = new Set(rails.flatMap((r) => r.items.slice(0, 16)));
  const fresh = (arr) => arr.filter((p) => !shown.has(p)).concat(arr.filter((p) => shown.has(p)));
  const push = (key, title, cat, list) => { if (list.length) rails.push({ key, title, cat, items: fresh(list.slice().sort(sort)) }); };
  const doors = new Set(PERFUME_DOOR_RAILS.map(([d]) => d));
  for (const [d, title] of PERFUME_DOOR_RAILS) push("t-perfumes-" + d, title, { fam: "perfumes", dept: d }, items.filter((p) => p.dept === d));
  const bottles = items.filter((p) => doors.has(p.dept));
  for (const [k, title, codes] of PERFUME_CONCENTRATIONS) push("t-perfumes-" + k, title, { fam: "perfumes", conc: codes }, bottles.filter((p) => codes.includes(p.conc)));
  for (const [d, title] of PERFUME_CLASS_RAILS) push("t-perfumes-" + d, title, { fam: "perfumes", dept: d }, items.filter((p) => p.dept === d));
  const houses = perfumeBrands(items.map((p) => ({ ...p, _p: p }))).filter(isKnownPerfumeBrand)
    .sort((a, b) => {
      const la = PERFUME_HOUSE_LEAD.indexOf(a.key), lb = PERFUME_HOUSE_LEAD.indexOf(b.key);
      return ((la < 0 ? 99 : la) - (lb < 0 ? 99 : lb)) || (PERFUME_DESIGNER_HOUSES.has(b.key) - PERFUME_DESIGNER_HOUSES.has(a.key)) || (b.items.length - a.items.length);
    })
    .slice(0, PERFUME_HOUSE_RAILS);
  const strip = [];
  for (const g of houses) {
    const key = "t-perfumes-casa-" + slug(g.key);
    push(key, g.label, { fam: "perfumes", brand: g.key }, g.items.map((x) => x._p));
    const logo = PERFUME_HOUSE_LOGOS[g.key];
    if (logo && existsSync(join(root, "logos/brands", logo))) strip.push({ k: key, t: g.label, logo: "/logos/brands/" + logo });
  }
  return { rails, houses: strip };
}
