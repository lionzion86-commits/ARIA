/* ============================================================
   PERFUMES -- THE CAROUSEL'S RULES (#443, Danny, 2026-10-22).

   One rail, two doors: the home page (assets/home/shelves/perfumes.json,
   lazy, below the fold) and the lead rail of Aria Beauty > Fragancias.
   Built by scripts/build-perfumes-shelf.mjs; this file is the pure
   part, so the tests read the same rules the builder runs.

   WHAT IS ON IT
     1. Perfume bottles only (scripts/lib/fragrance.js isPerfumeBottle,
        the one fragrance definition -- the 4-per-order cap reads it too).
     2. SALES ONLY (sale-rule.js, the one sale definition), with one
        exception: the HERO ANCHORS in scripts/lib/perfume-hero-anchors.json,
        a short reviewed list of iconic bottles that may show at full
        price in the anchor slots -- and only when that exact product is
        in a live catalogue.
     3. Never a store that is off sale (/off-sale.js) or ruled out for
        this rail (EXCLUDED_RETAILERS: Sephora, resale prohibited).

   ORDER (the repo's merchandising rules, LATINO DESIGNERS PRICE MIX /
   CHEAP-FIRST): the very well-known designer houses lead, cheapest
   first inside each tier; anchors sit in ANCHOR_SLOTS, cheapest anchor
   first; anything at PREMIUM_USD or more is sprinkled at positions
   5, 11, 17 ... and never leads. The first card is never the most
   expensive one on the rail.

   A NEW SOURCE (FragranceX wholesale, Amazon Business fragrance houses,
   ...) plugs in with no UI change: drop its catalogue in the repo root
   as <name>-catalog.json in the usual envelope
     { "retailers": { "<key>": { "departments": { "<dept>": { "items": [ ... ] } } } } }
   (title or name, brand, price, regularPrice/originalPrice when on
   sale, image), register the retailer the way every store is registered
   (RETAILERS / CATALOGUE_FILES, so the product page and cart can open
   it), and re-run node scripts/build-perfumes-shelf.mjs. sourceFiles()
   reads every catalogue in the root; the classifier, the sale rule and
   the ordering below decide the rest.
   ============================================================ */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isPerfumeBottle } from "./fragrance.js";
import { isOffSaleRetailer } from "./off-sale.js";
import { perfumeClassOf } from "../../netlify/functions/_department-core.js";
import "../../sale-rule.js";

const AriaSale = globalThis.AriaSale;

/* Stores this rail never shows, with the ruling. Off-sale stores are
   already out by /off-sale.js; these are on top of that. */
/* THE RAIL IS ARIA PERFUMES NOW (#443 item 32, Danny's order): the
   generic perfume carousel is replaced by the FragranceX stock. Every
   other store's bottles are excluded from it (they stay in their own
   stores and in search). */
export const PERFUME_RAIL_STORE = "ariaperfumes";
export const EXCLUDED_RETAILERS = Object.freeze({
  sephora: "DO NOT BUILD (Danny, #443): Sephora's terms prohibit resale; its home rail is being removed.",
});

/* The houses a Peruvian shopper knows by name. Tier 0 leads the rail.
   Order inside the list does not matter; aliases map to one name. */
export const DESIGNER_BRANDS = Object.freeze([
  ["Ralph Lauren", ["ralph lauren", "polo ralph lauren"]],
  ["Giorgio Armani", ["giorgio armani", "armani beauty", "armani"]],
  ["Calvin Klein", ["calvin klein"]],
  ["Carolina Herrera", ["carolina herrera"]],
  ["Paco Rabanne", ["paco rabanne", "rabanne"]],
  ["Versace", ["versace"]],
  ["Dolce & Gabbana", ["dolce & gabbana", "dolce&gabbana", "dolce and gabbana"]],
  ["Hugo Boss", ["hugo boss"]],
  ["Yves Saint Laurent", ["yves saint laurent", "ysl"]],
  ["Gucci", ["gucci"]],
  ["Dior", ["christian dior", "dior"]],
  ["Chanel", ["chanel"]],
  ["Lancôme", ["lancôme", "lancome"]],
  ["Burberry", ["burberry"]],
  ["Prada", ["prada"]],
  ["Givenchy", ["givenchy"]],
  ["Jean Paul Gaultier", ["jean paul gaultier"]],
  ["Montblanc", ["montblanc", "mont blanc"]],
  ["Tommy Hilfiger", ["tommy hilfiger"]],
  ["Lacoste", ["lacoste"]],
  ["Valentino", ["valentino"]],
  ["Azzaro", ["azzaro"]],
  ["Creed", ["creed"]],
  ["Tom Ford", ["tom ford"]],
  ["Marc Jacobs", ["marc jacobs"]],
  ["Viktor&Rolf", ["viktor&rolf", "viktor & rolf", "viktor and rolf"]],
  ["Mugler", ["mugler", "thierry mugler"]],
  ["Bvlgari", ["bvlgari", "bulgari"]],
  ["Hermès", ["hermès", "hermes"]],
  ["Michael Kors", ["michael kors"]],
  ["Coach", ["coach"]],
  ["Issey Miyake", ["issey miyake"]],
  ["Kenzo", ["kenzo"]],
  ["Moschino", ["moschino"]],
  ["Jimmy Choo", ["jimmy choo"]],
  ["Estée Lauder", ["estée lauder", "estee lauder"]],
  ["Antonio Banderas", ["antonio banderas"]],
]);

/* Rail shape. */
/* 25 cards (Danny, #443 c.6539643881: every Compra por categoría rail). */
export const RAIL_MAX = 25;
export const RAIL_MIN = 4;            /* fewer cards than this: the section stands down */
export const ANCHOR_SLOTS = [0, 2, 4, 6, 8];
export const PREMIUM_USD = 200;       /* card price; the LATINO DESIGNERS PRICE MIX line */
export const PREMIUM_FIRST_SLOT = 5;
export const PREMIUM_EVERY = 6;

function words(s) { return " " + String(s || "").toLowerCase().replace(/\s+/g, " ") + " "; }
function hasPhrase(hay, phrase) {
  const p = String(phrase || "").toLowerCase().trim();
  if (!p) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9à-ÿ])" + esc + "($|[^a-z0-9à-ÿ])", "i").test(hay);
}
export function titleOf(it) { return String((it && (it.title || it.name || it.productTitle || it.productName)) || ""); }

/* The house: the catalogue's own brand when it is a known house, else the
   house named in the title (Walmart's rows carry no brand field). Never
   invented: a title that names no known house keeps the catalogue's
   brand, or none. */
export function designerOf(it) {
  const brand = String((it && (it.brand || it.designer)) || "").trim();
  const hay = words(brand + " | " + titleOf(it));
  for (const [name, aliases] of DESIGNER_BRANDS) {
    for (const a of aliases) if (hasPhrase(hay, a)) return name;
  }
  return null;
}
export function brandTier(it) { return designerOf(it) ? 0 : 1; }

/* The hero anchor this row IS, or null: brand + every titleAll phrase,
   none of titleNone. */
/* The file name of a row's photo, lower-cased, without extension or query:
   .../large/COMES17.jpg -> "comes17". */
export function imageKeyOf(row) {
  const src = String((row && (row.image || row.imageUrl || row.image_url)) || "").split("?")[0];
  return (src.split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

export function heroAnchorOf(row, anchors) {
  const title = titleOf(row);
  const hay = words(String(row.brand || "") + " | " + title);
  for (const a of anchors || []) {
    if (!(a.brands || []).some((b) => hasPhrase(hay, b))) continue;
    if (!(a.titleAll || []).every((p) => hasPhrase(words(title), p))) continue;
    if ((a.titleNone || []).some((p) => hasPhrase(words(title), p))) continue;
    /* An anchor pinned to one side (Creed Aventus is the men's bottle)
       skips a row the catalogue files for the other. */
    if (a.gender && row.gender && String(row.gender).toLowerCase() !== a.gender) continue;
    /* An anchor pinned to one photo (Danny's lead trio) is that exact bottle. */
    if (a.image && imageKeyOf(row) !== String(a.image).toLowerCase()) continue;
    return a;
  }
  return null;
}

export function loadHeroAnchors(root) {
  return JSON.parse(readFileSync(join(root, "scripts/lib/perfume-hero-anchors.json"), "utf8")).anchors;
}

/* Every catalogue in the repo root that can hold products: the per-store
   catalogues and the split department-cache parts (the legacy merged
   department-cache.json repeats the parts and is skipped). */
export function sourceFiles(root) {
  return readdirSync(root).filter((f) => /-catalog\.json$/.test(f) || /^department-cache-[a-z0-9]+\.json$/.test(f)).sort();
}

/* Every perfume-bottle row in every catalogue, with why it is or is not
   eligible. Pure over the files; no pricing. */
export function scanPerfumeRows(root) {
  const rows = [];
  const seen = new Set();
  for (const f of sourceFiles(root)) {
    let j;
    try { j = JSON.parse(readFileSync(join(root, f), "utf8")); } catch { continue; }
    for (const [retailer, bucket] of Object.entries((j && j.retailers) || {})) {
      for (const [dept, entry] of Object.entries((bucket && bucket.departments) || {})) {
        const list = Array.isArray(entry) ? entry : (entry && entry.items) || [];
        for (const raw of list) {
          if (!raw || !isPerfumeBottle(raw)) continue;
          /* Aria Perfumes: the boxed retail bottle only -- minis, vials,
             testers, sets, refills, unboxed and body care keep their own
             rails in the Perfumes department, never this carousel. */
          if (retailer === PERFUME_RAIL_STORE && (perfumeClassOf({ title: titleOf(raw), type: raw.type }) !== "frasco"
            || /\((?:[^)]*\b)?(?:Repuesto|Sin caja)\b/.test(titleOf(raw)))) continue;
          const key = retailer + "::" + titleOf(raw).trim();
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            file: f, retailer, dept, raw,
            title: titleOf(raw).trim(),
            offSale: isOffSaleRetailer(retailer),
            excluded: Object.prototype.hasOwnProperty.call(EXCLUDED_RETAILERS, retailer) || retailer !== PERFUME_RAIL_STORE,
            onSale: AriaSale.isOnSale(raw),
            designer: designerOf(raw),
          });
        }
      }
    }
  }
  return rows;
}

/* Counts for the report: by store and by house, with and without the
   excluded stores. */
export function census(rows) {
  const live = rows.filter((r) => !r.offSale);
  const summarize = (list) => {
    const byStore = {}, byBrand = {};
    for (const r of list) {
      const s = (byStore[r.retailer] ||= { bottles: 0, sale: 0 });
      s.bottles++; if (r.onSale) s.sale++;
      const b = (byBrand[r.designer || String(r.raw.brand || "").trim() || "(sin marca)"] ||= { bottles: 0, sale: 0 });
      b.bottles++; if (r.onSale) b.sale++;
    }
    return { bottles: list.length, sale: list.filter((r) => r.onSale).length, byStore, byBrand };
  };
  return {
    withExcluded: summarize(live),
    withoutExcluded: summarize(live.filter((r) => !r.excluded)),
    offSaleBottles: rows.length - live.length,
  };
}

/* THE ORDER. `cards` are priced cards ({ price, onSale, heroAnchor? }).
   Sales lead by house tier then price; anchors take ANCHOR_SLOTS,
   cheapest first; premium is sprinkled, never first.

   RECOGNITION FIRST (#443 item 39 D, Danny): the names stop the scroll,
   then the price is the shock. So every hero shows once (its cheapest
   bottle -- three 212s is one hero, not three), the premium heroes
   (Creed Aventus) get their reserved slots instead of being crowded out
   by a full rail, one fragrance never shows twice in two sizes, and no
   house takes more than SALES_PER_HOUSE of the sale slots.

   LEAD FIRST (#443 item 39 revision, Danny 2026-10-25): the anchors
   carrying `lead` (Aventus, Coco Mademoiselle, Y) open the carousel in
   that order, ahead of every rule below; `leadOf` maps a hero id to its
   position. The rest of the rail is ordered as before. */
export const SALES_PER_HOUSE = 2;
export const PREMIUM_MAX = 2;
const fragranceName = (p) => String(titleOf(p).split(" \u2014 ")[0] || titleOf(p)).toLowerCase().trim();
function onePerKey(list, keyOf) {
  const seen = new Set();
  return list.filter((p) => { const k = keyOf(p); if (seen.has(k)) return false; seen.add(k); return true; });
}
export function orderRail(cards, max = RAIL_MAX, leadOf = {}) {
  const leadPos = (p) => (p.heroAnchor && Number.isFinite(leadOf[p.heroAnchor]) ? leadOf[p.heroAnchor] : null);
  const leads = onePerKey([...cards].filter((p) => leadPos(p) != null).sort((a, b) => leadPos(a) - leadPos(b)), (p) => p.heroAnchor);
  if (leads.length) {
    const rest = orderRail(cards.filter((p) => leadPos(p) == null), max - leads.length);
    return [...leads, ...rest].slice(0, max);
  }
  const price = (p) => Number(p.price);
  const isPremium = (p) => price(p) >= PREMIUM_USD;
  const byTierThenPrice = (a, b) => (brandTier(a) - brandTier(b)) || (price(a) - price(b));
  const cheapestFirst = [...cards].sort((a, b) => price(a) - price(b));
  const heroes = onePerKey(cheapestFirst.filter((p) => p.heroAnchor), (p) => p.heroAnchor);
  const anchors = heroes.filter((p) => !isPremium(p));
  const perHouse = {};
  const sales = onePerKey(cards.filter((p) => !p.heroAnchor && p.onSale && !isPremium(p)).sort(byTierThenPrice), fragranceName)
    .filter((p) => { const h = designerOf(p) || String(p.brand || "").toLowerCase(); perHouse[h] = (perHouse[h] || 0) + 1; return perHouse[h] <= SALES_PER_HOUSE; });
  const premium = [...heroes.filter(isPremium), ...onePerKey(cards.filter((p) => isPremium(p) && !p.heroAnchor && p.onSale).sort(byTierThenPrice), fragranceName)]
    .slice(0, PREMIUM_MAX);
  const base = max - premium.length;
  const rail = [];
  let ai = 0, si = 0;
  while (rail.length < base && (ai < anchors.length || si < sales.length)) {
    const slot = rail.length;
    if (ANCHOR_SLOTS.includes(slot) && ai < anchors.length) rail.push(anchors[ai++]);
    else if (si < sales.length) rail.push(sales[si++]);
    else rail.push(anchors[ai++]);
  }
  /* Premium: positions 5, 11, 17 ... (or the end of a short rail), never 0. */
  let k = 0;
  for (const p of premium) {
    if (rail.length >= max) break;
    const pos = Math.max(1, Math.min(rail.length, PREMIUM_FIRST_SLOT + k * PREMIUM_EVERY));
    rail.splice(pos, 0, p);
    k++;
  }
  /* The first card is never the most expensive one. */
  if (rail.length > 1) {
    const top = Math.max(...rail.map(price));
    if (price(rail[0]) === top) {
      const j = rail.findIndex((p) => price(p) < top);
      if (j > 0) { const [c] = rail.splice(j, 1); rail.unshift(c); }
    }
  }
  return rail.slice(0, max);
}
