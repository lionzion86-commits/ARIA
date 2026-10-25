#!/usr/bin/env node
/* ============================================================
   perfumes-catalog.json — ARIA PERFUMES, FROM THE FRAGRANCEX FEED
   (#443 item 32, Danny's order, 2026-10-24).

   IN:  hidden-docs/fragrancex/aria-perfumes-ingest.json (Lucifer's
        audited ingest: 10,656 SKUs, prices triple-verified). It lives
        under hidden-docs/, which netlify.toml forces to 404: the
        supplier's wholesale list is never served.
   OUT: perfumes-catalog.json, the public catalogue every page reads,
        store key "ariaperfumes" ("Aria Perfumes").

   THE PRICE IS ALREADY FINAL. Every other catalogue carries the store's
   own shelf price and the pages add Aria's margin and the Miami sales
   tax. Here the store price would be the wholesale cost, so it never
   leaves this script: each row carries Aria's price (cost x the perfume
   lane's margin) and the pages show it as is (PRE_PRICED in
   /pricing-rules.js). The import-tax base is the goods' true value,
   price / factor, never the margin.

   THE PROMO (standing doctrine): 18% lane-wide for the first 90 days
   from the public launch, then the standard tiered margin. Set
   PERFUME_LAUNCH below the day the department goes live; the build
   prices at 18% until launch + 90 days and at the standard margin after.
   Re-run the builder and the PRE_PRICED factor follows (see
   pricing-rules.js).

   CLASSES, NEVER MERGED. Testers, unboxed, minis/travel, gift sets,
   refills and the fragrance-adjacent lines (body mist, lotion, after
   shave...) keep their own label and their own rail. Near-duplicate
   groups (dup_group) keep one SKU: the cheapest sellable.

   WEIGHT. The feed has none (0/10,656). Until the supplier answers
   (ticket #3077845) every row carries a size-class estimate with
   weightEstimated: true -- never presented as verified.

   STOCK. QTY 500 is the feed's "in stock" sentinel, never a count;
   QTY <= 20 is real scarcity (lowStock: true). No count is shown.

     node scripts/build-perfumes-catalog.mjs
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tieredMarginUsd } from "../weight-data.js";
import { spanishFor } from "./lib/description-es.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const INGEST = "hidden-docs/fragrancex/aria-perfumes-ingest.json";
export const OUT_FILE = "perfumes-catalog.json";
export const STORE_KEY = "ariaperfumes";
export const STORE_LABEL = "Aria Perfumes";

/* The launch day (YYYY-MM-DD). null = not launched yet: the promo
   margin applies, since the 90 days have not started. */
export const PERFUME_LAUNCH = null;
export const PROMO_MARGIN = 0.18;
export const PROMO_DAYS = 90;

export function promoActive(now = new Date(), launch = PERFUME_LAUNCH) {
  if (!launch) return true;
  const end = new Date(launch + "T00:00:00Z").getTime() + PROMO_DAYS * 86400000;
  return now.getTime() < end;
}
const r2 = (n) => Math.round(Number(n) * 100) / 100;
/** Aria's price for one bottle from its cost. */
export function ariaPrice(costUsd, promo = promoActive()) {
  const c = Number(costUsd);
  return r2(promo ? c * (1 + PROMO_MARGIN) : c + tieredMarginUsd(c));
}

const CONC = { EDP: "Eau de Parfum", EDT: "Eau de Toilette", EDC: "Eau de Cologne", Extrait: "Extrait de Parfum", Parfum: "Parfum" };
const ADJ = {
  body_mist: "Body mist", body_spray: "Body spray", deodorant: "Desodorante", shower_gel: "Gel de ducha", body_lotion: "Loción corporal",
  after_shave: "After shave", hair: "Perfume para el cabello", soap: "Jabón", body_cream: "Crema corporal", powder: "Talco",
  incense_home: "Aroma para el hogar", lip: "Labial", shaving: "Afeitado", bath: "Baño", body_wash: "Gel de baño", body_oil: "Aceite corporal",
  hand_cream: "Crema de manos", body_butter: "Manteca corporal", candle: "Vela",
};
/* Lines that travel as a fragrance (alcohol / aerosol): the four-per-order
   cap counts them. Lotions, gels, soap and the rest do not. */
const ADJ_FRAGRANCE = new Set(["body_mist", "body_spray", "after_shave", "hair"]);
const FOR = { Women: "para mujer", Men: "para hombre" };

function sizeText(p) {
  const ml = Number(p.size_ml);
  const oz = /[0-9]/.test(String(p.size_label || "")) ? String(p.size_label).trim() : "";
  if (ml > 0) return `${Math.round(ml)} ml${oz ? ` (${oz})` : ""}`;
  return oz;
}
function baseName(p) {
  return String(p.name || "").replace(/\s+by\s+.+$/i, "").trim() || String(p.name || "");
}

/** The Spanish title, built from the feed's own parts -- no free text invented. */
export function titleEs(p) {
  /* A body-care line keeps its own name even as a tester (a 248 ml body
     mist is not a perfume); a bottle whose concentration the feed does
     not state is a "Perfume" -- the word a shopper searches. */
  const adjacent = p.primary_class === "fragrance_adjacent" || (p.adjacent_subtype && ADJ[p.adjacent_subtype]);
  const what = adjacent
    ? (ADJ[p.adjacent_subtype] || "Cuidado corporal")
    : p.primary_class === "gift_set" ? "Set de regalo"
    : (CONC[p.concentration] || (p.form === "oil" ? "Aceite de perfume" : "Perfume"));
  const form = p.form === "spray" && !adjacent && p.primary_class !== "gift_set" ? " en spray" : "";
  const marks = [p.classes.includes("tester") ? "Tester" : "", p.classes.includes("unboxed") ? "Sin caja" : "", p.classes.includes("refill") ? "Repuesto" : "",
    p.classes.includes("mini") || p.classes.includes("travel") || p.primary_class === "mini_travel" ? "Mini" : ""].filter(Boolean);
  const who = p.unisex ? "unisex" : (FOR[p.gender] || "");
  return [`${baseName(p)} — ${what}${form}`, sizeText(p), marks.length ? `(${marks.join(", ")})` : "", who].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/* Size-class gross weight (kg): glass, cap and box over the juice. A
   working estimate until the supplier's weights land; always marked. */
export function estimateKg(p) {
  const ml = Number(p.size_ml) > 0 ? Number(p.size_ml) : (Number(p.size_oz) > 0 ? Number(p.size_oz) * 29.57 : 100);
  const cls = p.primary_class;
  let kg;
  if (cls === "gift_set") kg = 0.30 + ml * 0.0045;
  else if (cls === "fragrance_adjacent") kg = 0.06 + ml * 0.0012;
  else if (cls === "mini_travel" || ml <= 15) kg = 0.06 + ml * 0.002;
  else if (p.classes.includes("tester") || p.classes.includes("unboxed")) kg = 0.08 + ml * 0.003;
  else kg = 0.12 + ml * 0.0035;
  return Math.min(Math.max(Math.round(kg * 100) / 100, 0.05), 2.5);
}

/* The rail each row lives on. Retail bottles go by who they are for;
   every other class is its own rail, never mixed in. */
export function bucketOf(p) {
  if (p.classes.includes("tester") || p.primary_class === "tester") return "testers";
  if (p.primary_class === "gift_set") return "sets";
  if (p.primary_class === "mini_travel") return "minis";
  if (p.primary_class === "fragrance_adjacent") return "cuidado";
  if (p.primary_class === "refill") return "repuestos";
  if (p.unisex) return "unisex";
  return p.gender === "Men" ? "hombre" : "mujer";
}
export const BUCKET_LABELS = {
  mujer: "Perfumes de mujer", hombre: "Perfumes de hombre", unisex: "Perfumes unisex", testers: "Testers",
  minis: "Minis y de viaje", sets: "Sets de regalo", cuidado: "Cuerpo y cuidado", repuestos: "Repuestos",
};

/** One public row. Nothing in it is a cost. */
export function rowOf(p, promo = promoActive()) {
  const price = ariaPrice(p.wholesale_usd, promo);
  const row = {
    title: titleEs(p),
    title_en: p.title_raw,
    brand: p.brand,
    price,
    image: p.image_url,
    retailer: STORE_KEY,
    sku: String(p.sku),
    type: p.primary_class === "fragrance_adjacent" && !ADJ_FRAGRANCE.has(p.adjacent_subtype) ? "Cuidado corporal" : "Fragancia",
    concentration: p.concentration || null,
    sizeOz: p.size_oz != null ? Math.round(Number(p.size_oz) * 100) / 100 : null,
    sizeMl: p.size_ml != null ? Math.round(Number(p.size_ml)) : null,
    gender: p.unisex ? "unisex" : (p.gender === "Men" ? "hombre" : "mujer"),
    productClass: p.primary_class,
    tester: p.classes.includes("tester"),
    unboxed: p.classes.includes("unboxed"),
    weightKg: estimateKg(p),
    weightEstimated: true,
    weightBasis: "size-class",
    currency: "USD",
  };
  /* SPANISH ON THE PAGE (#443 c.6402691998): the feed's copy is English;
     the stored translation (scripts/lib/description-es.js) is the
     description. The English stays for the record and is never shown. */
  if (p.description_en) {
    const es = spanishFor(STORE_KEY, p.description_en);
    if (es) row.description = es;
    row.description_en = p.description_en;
  }
  if (p.low_stock_signal || (Number(p.qty_feed) > 0 && Number(p.qty_feed) <= 20)) row.lowStock = true;
  /* WAS-PRICE WARNING (the audit): the feed MSRP is stale on 132 rows and
     missing on 35%. A compare-at is shown only when it really is above
     Aria's price. */
  const msrp = Number(p.msrp_usd);
  if (msrp > price * 1.05) { row.originalPrice = r2(msrp); row.onSale = true; }
  return row;
}

export function buildPerfumesCatalog(products, { promo = promoActive() } = {}) {
  const stats = { in: products.length, unsellable: 0, dupDropped: 0, out: 0, byBucket: {} };
  /* One SKU per near-duplicate group: the cheapest sellable. */
  const bestOfGroup = new Map();
  for (const p of products) {
    if (!p.sellable || !(Number(p.wholesale_usd) > 0)) continue;
    if (!p.dup_group) continue;
    const had = bestOfGroup.get(p.dup_group);
    if (!had || Number(p.wholesale_usd) < Number(had.wholesale_usd)) bestOfGroup.set(p.dup_group, p);
  }
  const departments = {};
  for (const p of products) {
    if (!p.sellable || !(Number(p.wholesale_usd) > 0)) { stats.unsellable++; continue; }
    if (p.dup_group && bestOfGroup.get(p.dup_group) !== p) { stats.dupDropped++; continue; }
    const b = bucketOf(p);
    (departments[b] = departments[b] || { label: BUCKET_LABELS[b], items: [] }).items.push(rowOf(p, promo));
    stats.byBucket[b] = (stats.byBucket[b] || 0) + 1;
    stats.out++;
  }
  return {
    catalog: {
      source: "Aria Perfumes (audited supplier feed, #443 item 32) -- priced by scripts/build-perfumes-catalog.mjs",
      pricing: { prePriced: true, margin: promo ? "promo-18" : "tiered" },
      declaredProductCount: stats.out,
      retailers: { [STORE_KEY]: { label: STORE_LABEL, departments } },
    },
    stats,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ingest = JSON.parse(readFileSync(ROOT + INGEST, "utf8"));
  const { catalog, stats } = buildPerfumesCatalog(ingest.products || []);
  writeFileSync(ROOT + OUT_FILE, JSON.stringify(catalog));
  console.log(`${OUT_FILE}: ${stats.out} products (${stats.unsellable} unsellable, ${stats.dupDropped} near-duplicates dropped), ${catalog.pricing.margin}`);
  console.log("  " + Object.entries(stats.byBucket).map(([k, v]) => `${k} ${v}`).join(" · "));
}
