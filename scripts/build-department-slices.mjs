#!/usr/bin/env node
/* ============================================================
   assets/sections/departamento/ — EVERY DEPARTMENT, PRECOMPUTED.

   WHY (2026-10-19, #409 track T5). departamento.html serves 31
   departments (Moda Mujer/Hombre/Niños, Curvy, Gym Rat, Aria Beauty,
   Mama's Fashion, Aria Fight Club, Juguetes, Surf & Skate, Zapatos,
   Diseñador y Lujo, ...). Every one of them downloaded the same 60
   catalogue files -- 219MB raw -- and filtered them on the phone to
   draw a handful of carousels. The Mountain Test: nothing
   catalogue-sized on any path a shopper takes.

   WHAT THIS WRITES (per department <key>):
     <key>/head.json   the hero count, the store chips, every carousel
                       (title + count) and the first cards of the first
                       carousels -- everything the first screen needs
     <key>/rails-<b>.json
                       the first cards of the next 6 carousels, fetched
                       when the shopper scrolls near them
     _fn/<key>.json    every card of the department plus its product
                       type, for netlify/functions/department.js, which
                       answers "Ver todo" / "Mostrar más" (48 cards at a
                       time), the store chips and the department search
                       box. It is never sent to a phone.

   The rules are the page's own, moved here unchanged: the same 60
   files in the same order, the same item normalisation and de-dup,
   the same bucket / keyword membership, the same sort (on sale first,
   then cheapest) and the same carousels (netlify/functions/
   _department-core.js, which the endpoint shares) (Ofertas or Destacados, then
   one per product type with 3+ items, then "Más productos").

   REGENERATE after any catalogue change:
     node scripts/build-department-slices.mjs
   scripts/test/departamento-thin-tests.mjs fails when the slices no
   longer match what the rules compute from the committed catalogues.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RETAILERS } from "./lib/retailers.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { PAGE_SIZE, RAIL_CARDS, HEAD_RAILS, RAIL_BATCH, FN_DIR, buildSections, sectionOpts, SHOE_DEPTS, headOf, batchOf, batchCount, fnRow, labelsOf, conditionOfTitle } from "../netlify/functions/_department-core.js";
import { isShoeForDept, footwearClass, shoeGender } from "./lib/footwear.js";
export { PAGE_SIZE, RAIL_CARDS, HEAD_RAILS, RAIL_BATCH };

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_DIR = "assets/sections/departamento";

/* The page's 60 sources, in the page's order (first file wins a de-dup). */
export const CATALOG_FILES = [
  "/department-cache-walmart.json",
  "/department-cache-oldnavy.json", "/department-cache-footlocker.json",
  "/advanceauto-catalog.json", "/ae-catalog.json", "/baublebar-catalog.json",
  "/beauty-catalog.json", "/bentgo-catalog.json", "/bhphoto-catalog.json",
  "/books-catalog.json", "/boxlunch-catalog.json", "/ccs-catalog.json",
  "/combatcorner-catalog.json", "/costco-catalog.json", "/crocs-catalog.json",
  "/dicks-catalog.json", "/everlast-catalog.json", "/ezpz-catalog.json",
  "/farfetch-catalog.json", "/fightclub-catalog.json", "/finishline-catalog.json",
  "/fuji-catalog.json", "/gymrat-catalog.json", "/hottopic-catalog.json",
  "/islandwatersports-catalog.json", "/juguetes-catalog.json", "/jwpei-catalog.json",
  "/kohls-catalog.json", "/lanebryant-catalog.json", "/macys-catalog.json",
  "/mainland-catalog.json", "/meliebianco-catalog.json", "/miumiu-catalog.json",
  "/mmawarehouse-catalog.json", "/moms-catalog.json", "/mushie-catalog.json",
  "/nautilus-catalog.json", "/newbalance-catalog.json", "/pacsun-catalog.json",
  "/parrot-catalog.json", "/partycity-catalog.json", "/quietstorm-catalog.json",
  "/revolve-catalog.json", "/samsclub-catalog.json", "/skims-catalog.json",
  "/soccer-catalog.json", "/ssense-catalog.json", "/statebags-catalog.json",
  "/sunglasses-catalog.json", "/surfstation-catalog.json", 
  "/tatami-catalog.json", "/tennis-catalog.json",
  "/ulta-catalog.json", "/valsurf-catalog.json", "/venum-catalog.json",
  "/yesstyle-catalog.json", "/zumiez-catalog.json",
  /* Best Buy (2026-10-19, #413): Electrónica's specialist and Hogar's
     small appliances. */
  "/bestbuy-catalog.json",
  /* DSW (#443): Zapatos' shoe warehouse. The committed empty envelope
     until the pull lands. */
  "/dsw-catalog.json",
  /* Aria Perfumes (#443 item 32): the Perfumes department's own stock. */
  "/perfumes-catalog.json",
];
/* Best Buy files under its own department names (scripts/lib/
   department-map.js maps them the same way). */
const BESTBUY_TECH = ["laptops", "gaming", "audio", "phones", "cameras", "accessories", "wearables", "tablets", "monitors"];

/* Membership rules per department (names and hero copy stay in the page,
   which needs them before any data arrives). A department with its own
   page (ropa_interior*) is a redirect there and has no rule here. */
export const DEPT_RULES = {
  electronics: { buckets: ["electronics", "electronica", ...BESTBUY_TECH] },
  clothing: { buckets: ["clothing"] },
  men: { buckets: ["men", "apparel_men"] },
  women: { buckets: ["women", "apparel_women"] },
  kids: { buckets: ["kids", "apparel_kids"] },
  candy_chocolate: { buckets: ["candy_chocolate"] },
  sporting_goods: { buckets: ["sporting_goods"] },
  home_goods: { buckets: ["home_goods", "home", "hogar", "small_appliances"] },
  home_decor: { buckets: ["home_decor"] },
  curvy: { buckets: ["clothing", "men", "women", "apparel_men", "apparel_women", "apparel_kids"], extendedSizes: true },
  gym_rat: { buckets: ["gym_rat"] },
  surf_skate: { kind: "surfskate" },
  spearfishing: { kind: "spearfishing" },
  soccer: { kind: "soccer" },
  tennis: { kind: "tennis" },
  sunglasses: { kind: "sunglasses" },
  mens_grooming: { buckets: ["grooming_men"] },
  combat_sports: { buckets: ["combat_sports"] },
  /* jewelry folded into joyas_accesorios (#443 item 40): its old links
     land there (departamento.html DEPTS.jewelry.href). */
  joyas_accesorios: { kind: "joyas" },
  purses: { buckets: ["purses"] },
  party: { kind: "party" },
  toys: { kind: "toys" },
  beauty: { buckets: ["beauty", "fragrance", "grooming_women", "belleza"] },
  books: { buckets: ["books"] },
  moms: { buckets: ["moms", "baby"] },
  shoes: { kind: "shoes" },
  shoes_women: { kind: "shoes_women" },
  shoes_men: { kind: "shoes_men" },
  auto_parts: { kind: "autoparts" },
  luxury: { kind: "luxury" },
  /* Reacondicionados (#443): every store's refurbished, used and
     open-box stock the law lets us sell, by its own title. */
  reacondicionados: { kind: "refurb" },
  /* Perfumes (#443 item 32): the Aria Perfumes stock, its own department. */
  perfumes: { kind: "perfumes" },
};

function hasAny(hay, words) {
  for (const w of words) if (hay.indexOf(w) !== -1) return true;
  return false;
}
export const KIND_MATCH = {
  perfumes: (t, p) => Boolean(p && p.retailer === "ariaperfumes"),
  refurb: (t, p) => Boolean(conditionOfTitle(p && p.title)),
  surfskate: (t) => hasAny(t, ["surfboard", "surf board", "skateboard", "skate board", "longboard", "wakeboard", "bodyboard", "paddleboard", "sup board"]),
  spearfishing: (t) => hasAny(t, ["speargun", "spear gun", "freediv", "apnea", "wetsuit", "neoprene", "fins", "snorkel", "weight belt", "dive knife"]),
  soccer: (t) => hasAny(t, ["soccer", "futbol", "football boot", "cleat"]) && t.indexOf("american football") === -1,
  tennis: (t) => hasAny(t, ["tennis racket", "tennis racquet", "tennis ball", "tennis shoe", "tennis skirt"]),
  sunglasses: (t) => hasAny(t, ["sunglasses", "lentes de sol", "gafas de sol", "sun glasses"]),
  /* A perfume called "Miss Charming" is not a charm (#443 item 40). */
  joyas: (t, p) => (!p || p.retailer !== "ariaperfumes") && hasAny(t, ["earring", "necklace", "bracelet", "pendant", "charm", "anillo", "collar", "pulsera", "arete"]),
  party: (t) => hasAny(t, ["party", "fiesta", "balloon", "globo", "birthday", "cumplea", "decoration", "decoraci", "confetti", "piñata", "pinata"]),
  toys: (t) => hasAny(t, ["toy", "juguete", "lego", "doll", "muñeca", "action figure", "plush", "peluche", "board game", "puzzle"]),
  /* DSW (#443) is a shoe warehouse: everything it files outside its
     bags bucket is footwear, whatever the title calls it ("Kassy Pump",
     "Rina Mule"). Only DSW rows take this branch. */
  /* ONE CLASSIFIER (#443 c.6405702652): the vetted footwear rules
     (scripts/lib/footwear.js), not a substring list -- "heel" inside
     "wheels" filled Zapatos with skate trucks. */
  shoes: (t, p) => (p && p.retailer === "dsw" && p.bucket !== "purses") || isShoeForDept(p, p && p.retailer),
  /* Whole words: "men" is inside "women", and the men's department led
     with New Balance Women's 796v4 (#443 c.6405702652). */
  shoes_women: (t, p) => KIND_MATCH.shoes(t, p) && (/\b(women|womens|women's|woman|mujer|mujeres|ladies|dama|damas|female)\b/.test(t) || (p && p.retailer === "dsw" && p.bucket === "women")),
  shoes_men: (t, p) => KIND_MATCH.shoes(t, p) && (/\b(men|mens|men's|man|hombre|hombres|caballero|male)\b/.test(t) || (p && p.retailer === "dsw" && p.bucket === "men")),
  autoparts: (t) => hasAny(t, ["brake", "freno", "oil filter", "filtro de aceite", "spark plug", "bujía", "bujias", "air filter", "filtro de aire", "alternator", "alternador", "battery", "batería", "radiator", "radiador", "shock absorber", "amortiguador", "clutch", "embrague", "timing belt", "correa"]),
  luxury: (t, p) => ["ssense", "miumiu", "farfetch"].indexOf(p.retailer) !== -1 ||
    hasAny(t, ["gucci", "prada", "louis vuitton", "chanel", "dior", "versace", "burberry", "fendi", "givenchy", "balenciaga", "saint laurent", "valentino"]),
};

export function belongsToDept(rule, p) {
  try {
    if (rule.buckets) {
      if (rule.buckets.indexOf(p.bucket) === -1) return false;
      if (rule.extendedSizes) {
        const sz = ((p.sizes || "") + " " + (p.title || "")).toLowerCase();
        if (!/(\b[2-9]x\b|xxl|3xl|4xl|plus|curvy|talla grande)/.test(sz)) return false;
      }
      return true;
    }
    if (rule.kind && KIND_MATCH[rule.kind]) {
      const hay = ((p.title || "") + " " + (p.brand || "") + " " + (p.type || "")).toLowerCase();
      return KIND_MATCH[rule.kind](hay, p);
    }
    return false;
  } catch { return false; }
}

/* sale-rule.js is index.html's one on-sale definition; run it here. */
export function loadSaleRule(root = ROOT) {
  const win = {};
  new Function("window", readFileSync(join(root, "sale-rule.js"), "utf8"))(win);
  return win.AriaSale;
}

export function normalizeItem(raw, retailer, bucket, AriaSale) {
  const title = raw.name || raw.title || "";
  if (!title) return null;
  const price = Number(raw.price);
  if (!(price > 0)) return null;
  const salePct = AriaSale.discountPct(raw);
  return {
    title: String(title),
    brand: raw.brand || "",
    type: raw.type || "",
    rawPrice: price,
    wasPrice: salePct > 0 ? Number(AriaSale.originalPrice(raw)) || 0 : 0,
    salePct,
    image: raw.image || (raw.images && raw.images[0]) || "",
    retailer,
    bucket,
    sizes: (raw.availableSizes || []).join(" "),
  };
}

/* Every normalised item across the 60 sources, de-duplicated exactly as
   the page did (retailer + title, first source wins). */
export function loadAllItems(root = ROOT) {
  const AriaSale = loadSaleRule(root);
  const out = [], seen = new Set();
  for (const f of CATALOG_FILES) {
    let data;
    try { data = JSON.parse(readFileSync(join(root, f), "utf8")); } catch { continue; }
    if (!data || !data.retailers) continue;
    for (const rk of Object.keys(data.retailers)) {
      if (isOffSaleRetailer(rk)) continue;   /* /off-sale.js */
      const buckets = (data.retailers[rk] || {}).departments || {};
      for (const bk of Object.keys(buckets)) {
        const items = (buckets[bk] || {}).items || [];
        for (const it of items) {
          let p;
          try { p = normalizeItem(it, rk, bk, AriaSale); } catch { p = null; }
          if (!p) continue;
          const key = rk + "::" + p.title;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(p);
        }
      }
    }
  }
  return out;
}

export function deptItems(all, key) {
  const rule = DEPT_RULES[key];
  let list = all.filter((p) => belongsToDept(rule, p));
  /* THE SHOE AISLES (#443 c.6405702652): the rails are Aria's classes
     (Zapatillas, Sandalias, Botas y botines...), not each store's own
     words -- sandals no longer split five ways or land in Zapatillas. */
  /* ...and in Zapatos each class is a Mujer and a Hombre aisle (#443
     c.6412658814): the gender is read before the class replaces the
     store's own type, which is where Farfetch says WOMEN or MEN. */
  if (SHOE_DEPTS.has(key)) list = list.map((p) => ({ ...p, type: footwearClass(p, p.retailer), ...(key === "shoes" ? { g: shoeGender(p, p.bucket) } : {}) }));
  /* Stable sort: on sale first, then cheapest (the page's order). */
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const as = a.p.salePct > 0 ? 1 : 0, bs = b.p.salePct > 0 ? 1 : 0;
      if (as !== bs) return bs - as;
      return (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i);
    })
    .map((x) => x.p);
}

/* Store names for chips and cards, from the retailer registry. */
/* Catalogue retailer keys the registry does not list (sub-stores of a
   catalogue file); without these the chip would read the raw key. */
const EXTRA_LABELS = {
  americaneagle: "American Eagle", partycity: "Party City", elite: "Elite Sports", gameness: "Gameness",
  tennisexpress: "Tennis Express", academy: "Academy Sports", prosoccer: "Pro Soccer", xtremesoccer: "Xtreme Soccer",
};
export const ALL_LABELS = { ...EXTRA_LABELS, ...Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label || k])) };

export function build(root = ROOT) {
  const all = loadAllItems(root);
  const outRoot = join(root, OUT_DIR);
  const summary = {};
  for (const key of Object.keys(DEPT_RULES)) {
    const dir = join(outRoot, key);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const list = deptItems(all, key);
    const sections = buildSections(list, sectionOpts(key));
    writeFileSync(join(dir, "head.json"), JSON.stringify(headOf(key, list, sections, ALL_LABELS)));
    let files = 1;
    for (let b = 0; b < batchCount(sections); b++) { writeFileSync(join(dir, `rails-${b}.json`), JSON.stringify(batchOf(sections, b))); files++; }
    mkdirSync(join(root, FN_DIR), { recursive: true });
    writeFileSync(join(root, FN_DIR, key + ".json"), JSON.stringify({ v: 1, dept: key, labels: labelsOf(list, ALL_LABELS), rows: list.map(fnRow) }));
    summary[key] = { items: list.length, rails: sections.length, files };
  }
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  const s = build();
  for (const [k, v] of Object.entries(s)) console.log(`${k.padEnd(18)} ${String(v.items).padStart(6)} items  ${String(v.rails).padStart(3)} rails  ${v.files} files`);
  console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s -> ${OUT_DIR}/`);
}
