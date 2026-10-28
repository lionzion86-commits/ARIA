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
import vm from "node:vm";
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
  "/kohls-catalog.json", "/crateandbarrel-catalog.json", "/pier1-catalog.json", "/lanebryant-catalog.json", "/macys-catalog.json",
  "/mainland-catalog.json", "/meliebianco-catalog.json", "/miumiu-catalog.json",
  "/mmawarehouse-catalog.json", "/moms-catalog.json", "/mushie-catalog.json",
  "/nautilus-catalog.json", "/newbalance-catalog.json", "/pacsun-catalog.json",
  "/parrot-catalog.json", "/partycity-catalog.json", "/quietstorm-catalog.json",
  "/revolve-catalog.json", "/skims-catalog.json",
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
  /* SNIPES (sneakers and streetwear) + Carolina Herrera (luxury), #443,
     pulled 2026-10-27. */
  "/snipes-catalog.json",
  "/carolinaherrera-catalog.json",
  /* Aria Perfumes (#443 item 32): the Perfumes department's own stock. */
  "/perfumes-catalog.json",
];
/* Best Buy files under its own department names (scripts/lib/
   department-map.js maps them the same way). */
const BESTBUY_TECH = ["laptops", "gaming", "audio", "phones", "cameras", "accessories", "wearables", "tablets", "monitors"];

/* Membership rules per department (names and hero copy stay in the page,
   which needs them before any data arrives). A department with its own
   page (ropa_interior*) is a redirect there and has no rule here. */
/* Crate & Barrel's and Pier 1's departments are Casa Aria's aisles. */
const CASA_BUCKETS = ["casa_navidad", "casa_velas", "casa_textiles", "casa_cama_bano", "casa_mesa", "casa_cocina", "casa_iluminacion", "casa_decoracion"];
/* The Libros de mesa halo: the coffee-table book houses. */
const CASA_BOOK_STORES = new Set(["assouline", "chronicle"]);
export const DEPT_RULES = {
  electronics: { buckets: ["electronics", "electronica", ...BESTBUY_TECH] },
  clothing: { buckets: ["clothing"] },
  men: { buckets: ["men", "apparel_men"] },
  women: { buckets: ["women", "apparel_women"] },
  kids: { buckets: ["kids", "apparel_kids"] },
  candy_chocolate: { buckets: ["candy_chocolate"] },
  sporting_goods: { buckets: ["sporting_goods"] },
  /* Casa Aria (#443 c.6458486219): the home wing, with Crate & Barrel's and
     Pier 1's aisles (scripts/lib/home-pull-normalize.js) and the Libros de
     mesa halo (deptItems). */
  home_goods: { buckets: ["home_goods", "home", "hogar", "small_appliances", ...CASA_BUCKETS] },
  home_decor: { buckets: ["home_decor", "casa_decoracion", "casa_velas", "casa_navidad"] },
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
/* WHAT THE PRODUCT IS (#443 re-route audit, c.6460976249). The kind
   departments matched raw substrings of title + brand + type: "heel" in
   Hot Wheels filled Zapatos, CCS's "Birthday" skateboards filled Aria
   Party, every Toy Machine sock was a toy, "collar" (a polo's) and
   "pendant" (a Christmas ornament's) were Joyas, an RC car's "battery"
   was Repuestos. They now ask product-type.js -- the store rails' own
   classifier, by the head noun of the product's own name -- what the
   product IS, and match their words as whole words only. */
export function loadProductType(root = ROOT) {
  const win = {};
  vm.runInNewContext(readFileSync(join(root, "product-type.js"), "utf8"), { window: win });
  return win.AriaProductType;
}
const PT = loadProductType();
const itemOf = (p) => ({ name: (p && p.title) || "", type: (p && p.type) || "", retailer: (p && p.retailer) || "", brand: (p && p.brand) || "", bucket: (p && p.bucket) || "" });
/* The product's family: its name, then its type, then its brand. */
export const productClass = (p) => PT.classify(itemOf(p));
/* What its own name says, "" when the name names nothing. */
export const nameFamily = (p) => PT.familyOfName((p && p.title) || "");
const wordsRx = (words) => new RegExp("(?:^|[^a-z0-9ñáéíóú])(?:" + words.join("|") + ")(?![a-z0-9ñáéíóú])", "i");
/* Accessories a shopper would not look for among jewellery: stickers,
   phone cases, insoles. */
const NOT_JOYAS_RX = wordsRx(["stickers?", "decals?", "patch(?:es)?", "phone cases?", "cases? for", "screen protectors?", "iphone", "ipad", "galaxy", "airpods", "apple watch", "pc case", "insoles?", "shoe ?laces?", "laces"]);
const JOYAS_TYPE_RX = /jewel|joy|bisuter|earring|arete|necklace|collar|bracelet|pulsera|\brings?\b|anillo|pendant|charm|anklet|brooch|watch|reloj|belt|cintur|scarf|scarves|bufanda|wallet|billeter|card\s*holder|glove|guante|keychain|llavero|cufflink|hair\s*(?:acc|clip)|headband/i;
const SUNGLASS_RX = wordsRx(["sunglass(?:es)?", "sun glasses", "lentes de sol", "gafas de sol"]);
const PARTY_RX = wordsRx(["party", "parties", "fiesta", "fiestas", "balloons?", "globos?", "birthday", "cumplea[ñn]os", "decorations?", "decoraci[oó]n(?:es)?", "confetti", "pi[ñn]atas?"]);
/* A party word on a garment, a board, a jewel or a gadget is a theme. */
const PARTY_FORMS = new Set(["", "hogar", "juguetes", "dulces", "sombreros"]);
const SPEAR_RX = wordsRx(["spear ?guns?", "freediv\\w*", "apnea", "wetsuits?", "neoprene", "fins", "snorkels?", "weight belts?", "dive knife"]);
const SPEAR_VETO = new Set(["belleza", "perfumes", "juguetes", "carteras", "hogar", "electronica", "dulces"]);
const SOCCER_RX = wordsRx(["soccer", "f[uú]tbol", "football boots?", "cleats?"]);
/* A soccer charm is jewellery, soccer plates are party ware. */
const SOCCER_VETO = new Set(["joyas", "hogar", "juguetes", "belleza", "dulces", "perfumes"]);
const AUTO_RX = wordsRx(["brakes?", "frenos?", "oil filters?", "filtros? de aceite", "spark plugs?", "buj[ií]as?", "air filters?", "filtros? de aire", "alternators?", "alternador(?:es)?", "radiators?", "radiador(?:es)?", "shock absorbers?", "amortiguador(?:es)?", "embragues?", "timing belts?", "correas? de distribuci[oó]n"]);
/* Aria Auto's stores: what they sell is a part unless its name says otherwise. */
const AUTO_RETAILERS = new Set(["advanceauto", "autozone"]);
const NOT_A_PART = new Set(["juguetes", "ropa", "zapatos", "carteras", "joyas", "sombreros", "trajes_bano", "belleza", "perfumes", "libros", "dulces", "bebe"]);
export const KIND_MATCH = {
  /* Aria Perfumes' stock, and every true fragrance any store sells. */
  perfumes: (t, p) => Boolean(p && (p.retailer === "ariaperfumes" || productClass(p) === "perfumes")),
  refurb: (t, p) => Boolean(conditionOfTitle(p && p.title)),
  surfskate: (t) => hasAny(t, ["surfboard", "surf board", "skateboard", "skate board", "longboard", "wakeboard", "bodyboard", "paddleboard", "sup board"]),
  spearfishing: (t, p) => SPEAR_RX.test(t) && !SPEAR_VETO.has(nameFamily(p)),
  soccer: (t, p) => SOCCER_RX.test(t) && t.indexOf("american football") === -1 && !SOCCER_VETO.has(nameFamily(p)),
  tennis: (t) => hasAny(t, ["tennis racket", "tennis racquet", "tennis ball", "tennis shoe", "tennis skirt"]),
  sunglasses: (t, p) => SUNGLASS_RX.test(t) && (nameFamily(p) === "" || nameFamily(p) === "accesorios"),
  /* Jewellery and accessories -- watches, belts, scarves, wallets too --
     by what the product is. A perfume called "Miss Charming" is not a
     charm (#443 item 40); sunglasses have their own department. */
  joyas: (t, p) => {
    if (!p || p.retailer === "ariaperfumes" || SUNGLASS_RX.test(t) || NOT_JOYAS_RX.test(p.title || "")) return false;
    const f = nameFamily(p);
    if (f) return f === "joyas" || f === "accesorios";
    /* A name that names nothing: only a type that does ("EARRINGS",
       "BELTS"); surf shops type everything "Accesorios". */
    return JOYAS_TYPE_RX.test(p.type || "") && !/^accesor|^accessor/i.test(String(p.type || "").trim());
  },
  party: (t, p) => PARTY_RX.test(t) && PARTY_FORMS.has(nameFamily(p)),
  /* Toys, and only toys: a toy-themed tee is Moda Niños, a Toy Machine
     deck is a skateboard. */
  toys: (t, p) => productClass(p) === "juguetes",
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
  /* A part by what it is (struts, control arms, pumps, sensors...), an
     auto store's stock, or a part word on a name that names nothing
     else ("battery" is not one: RC cars include theirs). */
  autoparts: (t, p) => {
    const c = productClass(p);
    if (c === "repuestos") return true;
    if (p && AUTO_RETAILERS.has(p.retailer)) return !NOT_A_PART.has(c);
    const f = nameFamily(p);
    return AUTO_RX.test(t) && (f === "" || f === "repuestos");
  },
  luxury: (t, p) => ["ssense", "miumiu", "farfetch", "carolinaherrera"].indexOf(p.retailer) !== -1 ||
    hasAny(t, ["gucci", "prada", "louis vuitton", "chanel", "dior", "versace", "burberry", "fendi", "givenchy", "balenciaga", "saint laurent", "valentino", "carolina herrera"]),
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
/* THE BUCKET RE-FILES (#443 re-route audit, layer B): items a puller
   filed under the wrong bucket, by retailer + name + the bucket they came
   in -- scripts/build-reroute-refiles.mjs, kept out of the catalogues so a
   re-pull does not undo them. */
export function loadRefiles(root = ROOT) {
  try { return JSON.parse(readFileSync(join(root, "scripts/data/reroute-refiles.json"), "utf8")); } catch { return {}; }
}
export function loadAllItems(root = ROOT) {
  const AriaSale = loadSaleRule(root);
  const REFILES = loadRefiles(root);
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
          const rf = REFILES[rk] && REFILES[rk][p.title];
          if (rf && rf[0] === bk) p.bucket = rf[1];
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
  if (key === "home_goods") {
    list = list.map((p) => (CASA_BUCKETS.includes(p.bucket) ? { ...p, a: p.bucket } : p));
    list = all.filter((p) => CASA_BOOK_STORES.has(p.retailer)).map((p) => ({ ...p, a: "libros" })).concat(list);
  }
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
