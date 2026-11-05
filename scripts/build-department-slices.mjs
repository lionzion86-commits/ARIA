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
import { TECH_BUCKETS } from "./lib/brandsmart.js";
import { photoCount } from "./lib/photo-counts.js";
import { CI_BUCKETS } from "./lib/calzedonia-intimissimi.js";
import { CAB_BUCKETS, AISLE_LABELS as CAB_LABELS, hairAisle, PERU_SOLD_HAIR_RX } from "./lib/sleekshop.js";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { RETAILERS } from "./lib/retailers.js";
import { isGymApparel } from "./lib/gym-apparel.js";
import { joyasTypeAllowed } from "./lib/section-allowlist.js";
import { isAdultInKids, kidProof, STYLE_TRAP_RX } from "./lib/kids-truth.js";
import { foreignFamily, storeTypeFamily, deptSells, slipType, ONE_FAMILY_DEPTS, FASHION_DEPT_EXTRA, BABY_DEPT } from "./lib/type-family.js";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { isDroneProduct, isNotElectronics } from "./lib/tech-aisle.js";
import "../not-sold.js";
const isNotSold = globalThis.AriaNotSold.isNotSold;
import { BEAUTY_DEPT, BEAUTY_SCENT_DOOR } from "../netlify/functions/_department-core.js";
import { beautyAisle } from "./lib/storefronts.js";
import { PAGE_SIZE, RAIL_CARDS, HEAD_RAILS, RAIL_BATCH, FN_DIR, buildSections, sectionOpts, SHOE_DEPTS, TECH_DEPT, homeTechPills, hubLenses, perfumePills, brandRoomPills, BRAND_ROOMS, AUDIENCE_SHELVES, audiencePills, headOf, batchOf, batchCount, fnRow, labelsOf, conditionOfTitle, audienceSwitch, deptStats, typeKeyOf } from "../netlify/functions/_department-core.js";
import { garmentAudience, storeAudiences } from "./lib/offer-category.js";
import { isShoeForDept, isGarmentTail, footwearClass, shoeGender, isFootwear } from "./lib/footwear.js";
import { stampHomePhotos } from "./stamp-home-photos.mjs";
import { hasExtendedSizes, extendedSizesOf } from "./lib/sizes.js";
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
  "/fuji-catalog.json", "/gymrat-catalog.json", "/gym-brands-catalog.json", "/hottopic-catalog.json",
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
  /* DSW (#443): Zapatos' shoe warehouse, stocked 2026-11-02. */
  "/dsw-catalog.json",
  /* Tennis Warehouse (#443 c.6578887587): the Tenis department's store. */
  "/tenniswarehouse-catalog.json",
  /* SNIPES (sneakers and streetwear) + Carolina Herrera (luxury), #443,
     pulled 2026-10-27. */
  "/snipes-catalog.json",
  /* Calzedonia + Intimissimi (#443 c.6512405832, pulled 2026-10-29). */
  "/intimissimi-catalog.json",
  "/calzedonia-catalog.json",
  /* BrandsMart USA (Build Order B, #443, pulled 2026-10-28). */
  "/brandsmart-catalog.json",
  /* The 2026-10-28 electronics drops (Order C, #443): scripts/build-electronics-drops.mjs. */
  "/walmart-electronics-catalog.json",
  "/costco-electronics-catalog.json",
  "/microcenter-catalog.json",
  /* SleekShop (#443 c.6475799491, pulled 2026-10-28): the Cabello shelf. */
  "/sleekshop-catalog.json",
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
  /* BrandsMart USA's aisles (tech_*, scripts/lib/brandsmart.js) are
     Electrónica's: the store anchors the department (Build Order B). */
  electronics: { buckets: ["electronics", "electronica", ...BESTBUY_TECH, ...TECH_BUCKETS] },
  clothing: { buckets: ["clothing"] },
  men: { buckets: ["men", "apparel_men"] },
  /* Intimissimi's and Calzedonia's aisles (scripts/lib/calzedonia-intimissimi.js) are Mujer's. */
  women: { buckets: ["women", "apparel_women", ...CI_BUCKETS] },
  kids: { buckets: ["kids", "apparel_kids"] },
  candy_chocolate: { buckets: ["candy_chocolate"] },
  sporting_goods: { buckets: ["sporting_goods"] },
  /* Casa Aria (#443 c.6458486219): the home wing, with Crate & Barrel's and
     Pier 1's aisles (scripts/lib/home-pull-normalize.js) and the Libros de
     mesa halo (deptItems). */
  home_goods: { buckets: ["home_goods", "home", "hogar", "small_appliances", ...CASA_BUCKETS] },
  home_decor: { buckets: ["home_decor", "casa_decoracion", "casa_velas", "casa_navidad"] },
  curvy: { buckets: ["clothing", "men", "women", "apparel_men", "apparel_women", "apparel_kids"], extendedSizes: true },
  /* GYM RAT = APPAREL ONLY (#443 c.6542490625): clothing from the gym
     brands, and the clothing (never the gloves, wraps or gis) of the fight
     brands that stay in the lineup -- Venum, Everlast, Tatami. The rule is
     scripts/lib/gym-apparel.js, read here so no pull can leak gear in. */
  /* Gym Rat is the gym brands' clothing (bucket gym_rat) plus the
     training clothing of every fight store that carries a real range of
     it -- read from the data (apparelStores), never a typed list, so the
     next ingest lands here by itself (#443 c.6544412516). */
  gym_rat: { buckets: ["gym_rat"], apparelOnly: true, apparelFrom: { buckets: ["combat_sports"], minClothing: 25 } },
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
  /* SleekShop's hair-treatment aisles (cab_*, scripts/lib/sleekshop.js) are Belleza's. */
  beauty: { buckets: ["beauty", "fragrance", "grooming_women", "belleza", ...CAB_BUCKETS] },
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
  /* Cabello (#443 c.6473257128): SleekShop's treatment aisles and every
     beauty store's hair care, under the Peru-presence rule (deptItems). */
  cabello: { kind: "cabello" },
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
const BEAUTY_BUCKETS = new Set(["beauty", "belleza", "grooming_women", "grooming_men", "fragrance", "hair", "haircare", "hair_care"]);
/* A bottle of scent by its own name; what only names a scent. */
export const TRUE_FRAGRANCE_RX = /\b(eau\s+de\s+(?:parfum|toilette|cologne)|eau\s+fra[iî]che|extrait(?:\s+de\s+parfum)?|parfum|perfumes?|edp|edt|colognes?|body\s+mists?|hair\s+mists?|fragrance\s+mists?|perfume\s+(?:mists?|oils?|sticks?))\b/i;
/* A fragrance line's shower gel stays, as Cuidado corporal (perfumeType). */
export const FRAGRANCE_BODY_CARE_RX = /\b(shower\s+gels?|body\s+washes?|bath\s+(?:and|&)\s+shower\s+gels?)\b/i;
const NOT_A_FRAGRANCE_RX = /\b(uv\s+creams?|sun\s*screens?|spf|plugs?|plug[-\s]?ins?|wipes|candles?|detergents?|air\s+fresheners?)\b/i;
export const KIND_MATCH = {
  cabello: (t, p) => Boolean(p) && (CAB_BUCKETS.includes(p.bucket) || (BEAUTY_BUCKETS.has(p.bucket) && Boolean(hairAisle(p.title)))),
  /* Aria Perfumes' stock, and every true fragrance any store sells --
     not a sun cream, a wall plug or wipes that only name a scent
     ("Peach Fragrance UV Cream", "Wallflowers Fragrance Plug"),
     #443 c.6585323562. */
  perfumes: (t, p) => Boolean(p && (p.retailer === "ariaperfumes" ||
    (productClass(p) === "perfumes" && !(NOT_A_FRAGRANCE_RX.test(p.title || "") && !TRUE_FRAGRANCE_RX.test(p.title || ""))))),
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
    /* A type that names a home piece, a book or a toy is that thing (Pier 1's
       "Napkin Rings", "Christmas Ornaments", "Framed Wall Art"), #443 c.6615548354. */
    if (!joyasTypeAllowed(p)) return false;
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
  shoes: (t, p) => (p && p.retailer === "dsw" && !/^(purses|accesorios|peluches)$/.test(String(p.bucket || "")) && !isGarmentTail(p.title)) || isShoeForDept(p, p && p.retailer),
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

/* The stores whose clothing joins an apparel-only department from the
   rule's other buckets: those carrying at least `minClothing` pieces of
   training clothing there (a lone tee in a glove shop is not a range). */
export function apparelStores(from, all) {
  const n = new Map();
  for (const p of all) {
    if (from.buckets.indexOf(p.bucket) === -1 || !isGymApparel(p)) continue;
    const k = String(p.retailer || "").toLowerCase();
    n.set(k, (n.get(k) || 0) + 1);
  }
  return [...n].filter(([, c]) => c >= (from.minClothing || 1)).map(([k]) => k).sort();
}
/* A rule with its data-derived parts filled in from the items. */
export function resolveRule(rule, all) {
  if (!rule || !rule.apparelFrom || rule.apparelFrom.stores) return rule;
  return { ...rule, apparelFrom: { ...rule.apparelFrom, stores: apparelStores(rule.apparelFrom, all) } };
}

/* TALLAS PLUS (Danny, #443 c.6526833313). A product belongs only when it
   is apparel the store OFFERS in extended sizes -- women's XL / 1X+ or
   14+, men's XL+ or waist 40+ (scripts/lib/sizes.js) -- read from the
   store's own size list. "Curvy" or "Plus" in a title or a fit name never
   qualifies (a REVOLVE cream got in through a "Womens Plus" label), and
   a child's or a non-apparel product never belongs. */
const PLUS_KIDS_RX = /\b(kids?|youth|boys?|girls?|toddlers?|infants?|baby|babies|juniors?|ni[ñn][oa]s?)\b/i;
const PLUS_WOMEN_RX = /\b(women'?s?|womens|woman|ladies|mujer(es)?)\b/i;
const PLUS_MEN_RX = /\b(men'?s?|mens|man|hombres?)\b/i;
export function plusGender(p) {
  const t = String((p && p.title) || ""), b = String((p && p.bucket) || "");
  if (PLUS_KIDS_RX.test(t) || /kids/.test(b)) return null;
  if (PLUS_WOMEN_RX.test(t)) return "women";
  if (PLUS_MEN_RX.test(t)) return "men";
  return /women/.test(b) ? "women" : /men/.test(b) ? "men" : null;
}
export function isTallasPlus(p) {
  const g = plusGender(p);
  if (!g) return false;
  const fam = productClass(p);
  if (fam !== "ropa" && fam !== "trajes_bano") return false;
  return hasExtendedSizes({ availableSizes: p.sizes }, g);
}

export function belongsToDept(rule, p) {
  try {
    if (rule.apparelOnly) {
      const from = rule.apparelFrom;
      const inBucket = rule.buckets.indexOf(p.bucket) !== -1 ||
        (from && from.stores && from.buckets.indexOf(p.bucket) !== -1 && from.stores.indexOf(String(p.retailer || "").toLowerCase()) !== -1);
      return inBucket && isGymApparel(p);
    }
    if (rule.buckets) {
      if (rule.buckets.indexOf(p.bucket) === -1) return false;
      if (rule.extendedSizes) return isTallasPlus(p);
      return true;
    }
    /* An electronics store's aisles (BrandsMart, tech_*) are Electrónica's
       and, when refurbished, Reacondicionados': a laptop case is not
       jewellery, a neoprene sleeve is not spearfishing gear. */
    if (rule.kind && rule.kind !== "refurb" && TECH_BUCKETS.includes(p.bucket)) return false;
    if (rule.kind && KIND_MATCH[rule.kind]) {
      const hay = ((p.title || "") + " " + (p.brand || "") + " " + (p.type || "")).toLowerCase();
      return KIND_MATCH[rule.kind](hay, p);
    }
    return false;
  } catch { return false; }
}

/* THE TYPE IS WHAT THE PRODUCT IS (#443 c.6585323562, Danny: "There
   should not be a ropa in a perfume store"). A department's type lenses
   -- its Por tipo rails, the header's Tipo filter, Explorar todo -- read
   the row's type. Pullers stamp a catch-all on a whole export: Macy's
   files its Beauty and Home pages APPAREL, so 60 Marc Jacobs Daisy
   bottles, lip balms and bath towels were a «Ropa (60)» filter and a
   ROPA rail in Perfumes, Belleza and Hogar. A clothing type on a product
   whose own name says it is not clothing (product-type.js, the head noun)
   now takes the type of what it is. A name that still carries a garment
   noun keeps its type ("RC Essential Tank", "Puzzle Dress", "Heater
   Sweats" are clothes the classifier misreads), and families the head
   noun reads loosely (deportes, bebe, repuestos) are left to report. */
export const CLOTHING_TYPE_LABELS = new Set(["Ropa", "Ropa deportiva", "Ropa interior", "Lencería", "Fajas y shapewear", "Bodies", "Pijamas", "Batas",
  "Medias", "Leggings", "Enterizos", "Ternos", "Blazers", "Conjuntos", "Casacas y abrigos", "Casacas", "Casacas y chompas", "Pantalones y jeans",
  "Pantalones y faldas", "Pantalones", "Pantalón", "Polos", "Chompas y polerones", "Polerones", "Vestidos", "Faldas", "Shorts", "Blusas y tops",
  "Camisas", "Ropa de baño", "Ropa de gimnasio", "Conjuntos y enterizos", "Denim"]);
/* The family's type (a name the type lenses show in Spanish); "" for a
   family with no lens name (it joins «Más productos», never «Ropa»). */
const FAMILY_TYPE = { perfumes: "Fragancia", belleza: "Belleza", hogar: "Hogar", carteras: "Carteras", joyas: "Joyas", accesorios: "Accesorios",
  sombreros: "Sombreros", zapatos: "Zapatos", juguetes: "", electronica: "", libros: "", dulces: "", deportes: "" };
/* A store's catch-all ("APPAREL", "Clothing", "Ropa", "Sets") says
   nothing about the product: the product's own name decides. A specific
   garment type ("TOP", "Pantalón", "Medias") is believed unless the name
   plainly names another thing -- its main phrase ENDS on one
   (NOT_GARMENT_TAIL_RX), or it is a family the head noun reads reliably
   (a bottle of scent, a jewel, a bag, a toy) and carries no garment noun.
   A ski sock called "Targeted Cushion" stays a sock. */
const CATCHALL_LABELS = new Set(["Ropa", "Ropa deportiva", "Conjuntos"]);
const RELIABLE_FAMILIES = new Set(["perfumes", "joyas", "accesorios", "carteras", "juguetes", "sombreros", "libros"]);
const LOOSE_FAMILIES = new Set(["deportes"]);
/* The main phrase's last noun, when it is plainly not a garment: "Oakley
   Eye Jacket Sunglasses", "Top-Handle Crossbody Bag", "Polo Player Hand
   Towel", "Kiama Bucket Hat", "Economy Tent", "6-cup Rice Cooker" -- a
   garment word earlier in the name is a model name. */
const NOT_GARMENT_TAIL_RX = /\b(sunglasses|eyewear|bags?|handbags?|totes?|duff(?:el|le)s?|backpacks?|crossbody|satchels?|clutch(?:es)?|wallets?|keychains?|key\s*rings?|earrings?|necklaces?|bracelets?|rings?|hoops?|pendants?|charms?|watch(?:es)?|cufflinks|hats?|beanies?|caps?|visors?|balaclavas?|towels?|washcloths?|blankets?|throws?|pillows?|pillowcases?|comforters?|duvets?|sheets?|rugs?|mugs?|cups?(?<!\be\s+cups?)|bowls?|plates?|tents?|chairs?|stools?|tables?|cabinets?|lamps?|candles?|cookers?|processors?|blenders?|makers?|kettles?|toasters?|fryers?|mixers?|ovens?|servers?|cookware|scarf|scarves|belts?|perfumes?|parfums?|colognes?|mists?|fragrances?|lipsticks?|mascaras?|palettes?|serums?|moisturi[sz]ers?|cleansers?|primers?|glosses|balms?|concealers?|eyeliners?|figures?|dolls?|posters?|signs?|bushings?|snowboards?|skateboards?|surfboards?|fins?|shoes|sneakers?|sandals?|slides|slippers|pumps|loafers?|flats|boots|heels|mules?|clogs?)(?:\s+(?:gift\s+)?(?:sets?|packs?|duo|trio|kits?|pairs?))?\s*$/i;
/* A home piece by its last noun, whatever a stray word says ("Ice Cream
   Maker" is no cream, "Cable Washcloth" no cable, "Plush Throw" no toy). */
const HOME_TAIL_RX = /\b(towels?|washcloths?|blankets?|throws?|pillows?|pillowcases?|comforters?|duvets?|sheets?|rugs?|mugs?|bowls?|plates?|cookers?|processors?|blenders?|makers?|kettles?|toasters?|fryers?|mixers?|ovens?|cookware)(?:\s+(?:gift\s+)?(?:sets?|packs?|pairs?))?\s*$/i;
const mainPhrase = (t) => String(t || "").split(/\s[-–—|]\s|,|\s\(|\s(?:with|w\/|for|in|featuring|includes?|including)\s/i)[0].replace(/[^A-Za-z0-9\s'’]+$/, "").trim();
const SCENT_WORD_RX = /\b(fragrances?|perfumes?|parfums?|colognes?|eau\s+de|edp|edt|body\s+mists?)\b/i;
const GARMENT_WORD_RX = /\b(t-?shirts?|shirts?|overshirts?|button[-\s]?(?:ups?|downs?)|tees?|tanks?|blouses?|sweaters?|cardigans?|hoodies?|sweats|sweatshirts?|sweatpants|sweatshorts?|pullovers?|jackets?|coats?|parkas?|vests?|blazers?|dress(?:es)?(?!\s+(?:pumps?|shoes?|belts?|wallets?|sandals?))|gowns?|skirts?|skorts?|pants?|trousers|jeans|jean(?!\s+(?:paul|pierre|patou|charles|michel|louis|claude|marc|philippe))|denim|leggings?|shorts?|joggers?|pajamas?|pyjamas?|robes?|bras?|bralettes?|panty|panties|briefs?|boxers?|thongs?|tangas?|bodysuits?|rompers?|jumpsuits?|onesies?|swimsuits?|bikinis?|cheeky|skimpy|hi\s+cut|bottoms?|volleys?|boardshorts?|bordshorts?|trunks?|polos?|henleys?|kilts?|crop|tops?(?!\s*(?:handle|zip(?:per)?|shelf|grain|coat|stitch))|outfits?|sleep\s+sets?|lounge\s+sets?|leotards?|socks?|tights|camis?|fleece|crews?|tunics?|kimonos?|ponchos?|scrubs?|uniforms?|overalls?|sleeves?)\b/i;
const clothingTypeMemo = new Map();
export function isClothingType(type) {
  const k = String(type || "").trim();
  if (!k) return false;
  if (!clothingTypeMemo.has(k)) clothingTypeMemo.set(k, CLOTHING_TYPE_LABELS.has(typeKeyOf({ type: k }).label));
  return clothingTypeMemo.get(k);
}
/* A «dress shirt» is a shirt (Kohl's types its men's dress shirts
   «Vestido», Macy's DRESS, Surf Station «Vestidos y faldas»): the Hombre
   flyout listed «Vestidos» (#443 c.6634907518). */
const DRESS_TYPE_LABELS = new Set(["Vestidos", "Vestidos y faldas", "Faldas"]);
const DRESS_SHIRT_RX = /\bdress\s+shirts?\b/i;
export function trueType(p) {
  if (p && DRESS_SHIRT_RX.test(String(p.title || "")) && DRESS_TYPE_LABELS.has(typeKeyOf(p).label)) return "Camisas";
  if (!p || !isClothingType(p.type)) return p ? p.type : "";
  const fam = productClass(p);
  if (!Object.prototype.hasOwnProperty.call(FAMILY_TYPE, fam)) return p.type;
  const title = String(p.title || "");
  const main = mainPhrase(title);
  /* The whole name's last noun counts too ("Girl in Dancing Pose ... Hula
     Doll"), unless a store suffix follows ("SLEEP SET | PINK SNACK BAG"). */
  const tail = NOT_GARMENT_TAIL_RX.test(main) || (!/\s[|]\s|\s[-–—]\s/.test(title) && NOT_GARMENT_TAIL_RX.test(title.replace(/[^A-Za-z0-9\s'’]+$/, "").trim()));
  const garment = GARMENT_WORD_RX.test(title) && !(fam === "perfumes" && SCENT_WORD_RX.test(title));
  const catchall = CATCHALL_LABELS.has(typeKeyOf(p).label);
  const ok = tail || (!garment && !LOOSE_FAMILIES.has(fam) && (catchall || RELIABLE_FAMILIES.has(fam)));
  if (!ok) return p.type;
  if (HOME_TAIL_RX.test(main)) return FAMILY_TYPE.hogar;
  if (fam === "zapatos") return footwearClass({ title, type: "" }, p.retailer);
  return FAMILY_TYPE[fam];
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
    /* The store's own size run (Tallas Plus reads it, never the title). */
    sizes: Array.isArray(raw.sizes) && raw.sizes.length ? raw.sizes.filter((s) => typeof s === "string") : (raw.availableSizes || []),
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
export const DEPT_HELD = new Set(["sephora"]);
const KID_BUCKETS = new Set(["kids", "apparel_kids"]);
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
      /* Sephora's whole catalogue reaches no department, as on main
         before 2026-11-04 (its storefront stands): Danny's call. */
      if (DEPT_HELD.has(rk)) continue;
      const buckets = (data.retailers[rk] || {}).departments || {};
      for (const bk of Object.keys(buckets)) {
        /* A bucket is { items: [...] }, or a bare array: beauty-catalog.json
           files Victoria's Secret's that way, so none of its 268 beauty
           products reached Beauty and §8's «VS sprays first» had nothing
           to lead with. A bare BEAUTY bucket is read now. Its clothing
           (VS «women», 1,381) and Walmart's bare «mens» (376) stay out as
           on main: they would lead Mujer and Tallas Plus -- Danny's call. */
        const b = buckets[bk];
        const items = Array.isArray(b) ? (BEAUTY_BUCKETS.has(bk) ? b : []) : (b || {}).items || [];
        for (const it of items) {
          let p;
          try { p = normalizeItem(it, rk, bk, AriaSale); } catch { p = null; }
          if (!p) continue;
          /* Pills and food are not sold (/not-sold.js): never a card. */
          if (isNotSold(p)) continue;
          const rf = REFILES[rk] && REFILES[rk][p.title];
          /* A re-file into kids needs the product's own proof (#443
             c.6635747308): the audit filed AE's «Cropped Baby Tee» there. */
          if (rf && rf[0] === bk && !(KID_BUCKETS.has(rf[1]) && !kidProof(p.title))) p.bucket = rf[1];
          /* A clothing type on what is not clothing takes its own (#443 c.6585323562). */
          const storeType = p.type;
          p.type = trueType(p);
          if (p.type !== storeType) p.storeType = storeType;
          const key = rk + "::" + p.title;
          if (seen.has(key)) continue;
          seen.add(key);
          /* ph: the photo count when 2+ (scripts/lib/photo-counts.js), so the card's arrows are never dead. */
          const ph = photoCount(root, p.title, rk);
          if (ph) p.ph = ph;
          out.push(p);
        }
      }
    }
  }
  return out;
}

/* PERFUMES OFFERS FRAGRANCE TYPES ONLY (#443 c.6585323562): Fragancia,
   and Cuidado corporal for a fragrance line's body care. */
export const PERFUME_TYPES = new Set(["fragancia", "cuidado-corporal"]);
export function perfumeType(p) {
  if (PERFUME_TYPES.has(typeKeyOf(p).k)) return p.type;
  return FRAGRANCE_BODY_CARE_RX.test(String((p && p.title) || "")) ? "Cuidado corporal" : "Fragancia";
}
/* A bottle's door from another store: its own words first (tester, set,
   mini, for her / for him / unisex), then the Aria Perfumes line it
   belongs to -- same house, the line's name leading the title ("Daisy
   Murakami Pink ... Eau de Parfum" is Marc Jacobs' Daisy, a women's
   line) -- when every bottle of that line opens one door. Otherwise
   none: the bottle stays in its house's rail, out of the doors. */
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const GENDER_DOORS = new Set(["mujer", "hombre", "unisex"]);
export function perfumeDoorOfWords(title) {
  const t = String(title || "");
  if (/\btesters?\b/i.test(t)) return "testers";
  if (/\b(gift\s+sets?|coffrets?|\d+\s*-?\s*(?:pc|pcs|piece)\b|sets?\b)/i.test(t)) return "sets";
  if (/\b(minis?|travel\s+size|travel\s+spray|rollerball)\b/i.test(t)) return "minis";
  const her = /\b(for\s+women|women'?s|womens|for\s+her|pour\s+femme|femme|donna|para\s+mujer)\b/i.test(t);
  const him = /\b(for\s+men|men'?s|mens|for\s+him|pour\s+homme|homme|uomo|para\s+hombre)\b/i.test(t);
  if (/\bunisex\b/i.test(t) || (her && him)) return "unisex";
  return her ? "mujer" : him ? "hombre" : "";
}
export function perfumeDoorIndex(all) {
  /* house -> line -> doors, from Aria Perfumes' catalogue ("Daisy — Eau de Toilette ... para mujer"). */
  const lines = new Map();
  for (const p of all) {
    if (p.retailer !== "ariaperfumes") continue;
    const line = fold(String(p.title || "").split(" — ")[0]), house = fold(p.brand);
    if (line.length < 3 || !house) continue;
    const door = GENDER_DOORS.has(p.bucket) ? p.bucket : (/\bpara mujer\b/.test(p.title) ? "mujer" : /\bpara hombre\b/.test(p.title) ? "hombre" : /\bunisex\b/i.test(p.title) ? "unisex" : "");
    if (!door) continue;
    if (!lines.has(house)) lines.set(house, new Map());
    const m = lines.get(house);
    if (!m.has(line)) m.set(line, new Set());
    m.get(line).add(door);
  }
  return (p) => {
    const own = perfumeDoorOfWords(p.title);
    if (own) return own;
    const house = fold(p.brand), m = lines.get(house);
    if (!m) return "";
    let t = fold(p.title);
    if (t.startsWith(house + " ")) t = t.slice(house.length + 1);
    let best = "";
    for (const line of m.keys()) if ((t === line || t.startsWith(line + " ")) && line.length > best.length) best = line;
    const doors = best ? m.get(best) : null;
    return doors && doors.size === 1 ? [...doors][0] : "";
  };
}

export const MEDIA_RX = /\b(dvd|blu-?ray|audio cd|music cd|the very best of|greatest hits|soundtrack|original motion picture)\b(?!\s*(players?|drives?|burners?|writers?|recorders?))|\[(dvd|blu-?ray|cd)\]/i;
const BEAUTY_SPORT_TYPE_RX = /m[aá]scaras?\s+y\s+snorkels?|trajes?\s+de\s+neopreno|neopreno|wetsuits?|snorkel|f[uú]tbol|soccer/i;
const BEAUTY_SPORT_TITLE_RX = /\b(snorkels?|goggles?|wetsuits?|dive\s+masks?|neoprene|spearfishing|fins)\b/i;
export function isBeautySportGear(p) {
  return BEAUTY_SPORT_TYPE_RX.test(String(p.type || "")) || BEAUTY_SPORT_TITLE_RX.test(String(p.title || ""));
}
const SUN_RX = /\b(sun\s*screens?|sunscreens?|spf\s*\d*|sun\s+sticks?|sunblock|zinc\s+oxide|after[- ]sun|aloe)\b/i;
const LIP_RX = /\blip\s*(balms?|shimmers?|gloss|sticks?|care)?\b|\blips\b/i;
const AISLE_TYPE = { maquillaje: "Maquillaje", piel: "Cuidado de la piel", cabello: "Cabello", cuerpo: "Cuidado corporal", unas: "Uñas", herramientas: "Herramientas de belleza" };
export function beautyAisleType(p) {
  const t = String(p.title || "");
  if (SUN_RX.test(t)) return "Protector solar";
  if (LIP_RX.test(t)) return "Labios";
  return AISLE_TYPE[beautyAisle({ name: t })] || "";
}
const WOMENS_SCENT_STORES = new Set(["victoriassecret", "bathandbodyworks"]);
const WOMENS_SCENT_RX = /\b(women'?s?|woman|for\s+her|pour\s+femme|femme|donna|mujer|ladies)\b/i;
const MENS_SCENT_RX = /\b(him|homme|men'?s|for\s+men|cologne|colonia|uomo|hombre)\b/i;
const SCENT_RX = /\b(shimmer\s+mists?|mini\s+mists?|mists?\s+(gift\s+)?sets?)\b/i;
export function isWomensScent(p) {
  const t = String(p.title || "");
  if (MENS_SCENT_RX.test(t) || NOT_A_FRAGRANCE_RX.test(t) && !TRUE_FRAGRANCE_RX.test(t)) return false;
  if (FRAGRANCE_BODY_CARE_RX.test(t) || /\blotions?\b|\bcreams?\b|\bwash\b/i.test(t)) return false;
  return TRUE_FRAGRANCE_RX.test(t) || SCENT_RX.test(t) || productClass(p) === "perfumes";
}
/* CATEGORY IS THE PRODUCT'S REAL TYPE (#443 c.6634907518, Danny's mom:
   «CARTERAS shows PAÑALES»). A fashion department takes a store's whole
   aisle (bucket) or a name's word; the store's own type then says what
   the product really is: JuJuBe's PAÑALES clutches are diaper bags, a
   surf shop's «Tablas de surf» bag is a board bag, Bentgo's lunch boxes
   sat in Niños, Assouline's Chanel books in Diseñador. Such a product
   leaves the fashion department (scripts/lib/type-family.js) -- unless
   its own name names a thing that department sells (earrings typed
   «Belleza» stay earrings). Baby goods go to Mama's Fashion, beauty to
   Aria Beauty, where their type is at home; sunglasses a dive shop typed
   «Pesca submarina» stay in Lentes de Sol as «Lentes de sol». A baby
   store's catch-all type («RETAIL») is the store's family: baby. */
const SKU_CATCHALL_RX = /^(?=[a-z_ ]{0,6}\d)[a-z0-9_ ]+$|^(?:general|retail|sample|wholesale|accessory|accessories|accesorios|gear|)$/i;
const storeFamily = (r) => { try { return PT.classify({ name: "", type: "", retailer: r }); } catch { return ""; } };
export function misfiledFamily(key, p) {
  const f = foreignFamily(key, { storeType: p.storeType || p.type, type: typeKeyOf(p).label }, nameFamily(p));
  if (f) return f;
  if (FASHION_DEPT_EXTRA[key] && SKU_CATCHALL_RX.test(String(p.type || "").trim()) && storeFamily(p.retailer) === "bebe") return "bebe";
  return "";
}
/* Where a family a fashion aisle carried is at home. */
export const REROUTE = { bebe: BABY_DEPT, belleza: BEAUTY_DEPT };
let rerouteMemo = null;
function reroutedTo(all, key) {
  if (!rerouteMemo || rerouteMemo.all !== all) {
    const by = new Map(), seen = new Set();
    for (const k of Object.keys(FASHION_DEPT_EXTRA)) {
      const rule = resolveRule(DEPT_RULES[k], all);
      for (const p of all) {
        if (seen.has(p) || !belongsToDept(rule, p)) continue;
        const to = REROUTE[misfiledFamily(k, p)];
        if (!to) continue;
        seen.add(p);
        (by.get(to) || by.set(to, []).get(to)).push(p);
      }
    }
    rerouteMemo = { all, by };
  }
  return rerouteMemo.by.get(key) || [];
}
export function deptItems(all, key) {
  const rule = resolveRule(DEPT_RULES[key], all);
  let list = all.filter((p) => belongsToDept(rule, p));
  /* NIÑOS IS ONLY FOR KIDS (#443 c.6635747308): an adult's piece a
     store's kids aisle carries («Juniors' Baby Tee», «Women's ... Baby
     T-Shirt») leaves it (scripts/lib/kids-truth.js). */
  if (key === "kids") list = list.filter((p) => !isAdultInKids(p));
  if (FASHION_DEPT_EXTRA[key] || key === BEAUTY_DEPT) {
    list = list.flatMap((p) => {
      const f = misfiledFamily(key, p);
      if (!f) {
        /* Kept by its own name (earrings typed «Belleza», cufflinks typed
           «Manta»): its type is what the name names, never the aisle's. */
        const g = storeTypeFamily(typeKeyOf(p).label) || storeTypeFamily(p.type);
        if (!g || deptSells(key, g)) return [p];
        const nf = nameFamily(p);
        const type = nf === "zapatos" ? footwearClass({ title: p.title, type: "" }, p.retailer) : FAMILY_TYPE[nf] || "";
        return [{ ...p, storeType: p.storeType || p.type, type }];
      }
      if (key === "sunglasses" && f !== "juguetes" && f !== "fiesta") return [{ ...p, storeType: p.storeType || p.type, type: "Lentes de sol" }];
      return [];
    });
  }
  if (ONE_FAMILY_DEPTS[key]) list = list.map((p) => { const t = slipType(key, typeKeyOf(p).label, p.type); return t ? { ...p, storeType: p.storeType || p.type, type: t } : p; });
  if (REROUTE.bebe === key || REROUTE.belleza === key) {
    const have = new Set(list);
    list = list.concat(reroutedTo(all, key).filter((p) => !have.has(p)));
  }
  /* Perfumes: each bottle's door is the catalogue's own department
     (mujer / hombre / unisex / minis / sets / testers ...), carried as `a`. */
  /* ...and another store's bottle takes the door its own words or the
     Aria Perfumes line it belongs to say (perfumeDoor), never a guess.
     Its type is a fragrance type: the department offers no other. */
  if (key === "perfumes") {
    const doorOf = perfumeDoorIndex(all);
    list = list.map((p) => {
      const type = perfumeType(p);
      if (p.retailer === "ariaperfumes") return { ...p, type, ...(p.bucket ? { a: p.bucket } : {}) };
      const a = type === "Cuidado corporal" ? "cuidado" : doorOf(p);
      return { ...p, type, ...(a ? { a } : {}) };
    });
  }
  /* ARIA BEAUTY (§8, #443 c.6504037778): sports gear out (snorkels, dive
     masks, goggles, wetsuits, cloth face masks -- they stay in their own
     departments); «Accesorios» is jewellery only, so a sunscreen or a
     lip balm a surf shop typed «Accesorios» takes the aisle it is; a
     women's scent (not a cologne, not «for him») is marked for the
     «Perfumes y brumas» rail. */
  if (key === BEAUTY_DEPT) {
    /* Women's only when the data says so -- a women's house (Victoria's
       Secret, Bath & Body Works), its own words, or its Aria Perfumes line
       -- never guessed: Ulta's «Sauvage» or «1 Million» name no wearer and
       stay in their own aisle. */
    const doorOf = perfumeDoorIndex(all);
    const isWomens = (p) => isWomensScent(p) && (WOMENS_SCENT_STORES.has(p.retailer) || WOMENS_SCENT_RX.test(String(p.title || "")) || doorOf(p) === "mujer");
    list = list.filter((p) => !isBeautySportGear(p)).map((p) => {
      let q = p;
      if (/^(accesorios|accessories)$/i.test(String(p.type || "").trim()) && nameFamily(p) !== "joyas") q = { ...p, storeType: p.type, type: beautyAisleType(p) };
      if (isWomens(q)) q = { ...q, a: BEAUTY_SCENT_DOOR };
      return q;
    });
  }
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
  /* Music and films are not electronics (a pre-owned John Denver CD led
     Electrónica's Reacondicionados): they stay in their store, out of the
     department. A Blu-ray PLAYER is electronics. */
  if (key === "electronics") list = list.filter((p) => !MEDIA_RX.test(p.title || ""));
  /* ...and Electrónica is what the product IS (#443 c.6579542290): a TV
     console, a fireplace, a gift card or pool chlorine a store filed under
     electronics stays out of it, and every lens, rail and pill with it.
     A drone is the Drones type, whatever the store typed it (#443
     c.6579603095): its Por tipo rail and t=drones page. */
  if (key === "electronics") list = list.filter((p) => !isNotElectronics(p.title)).map((p) => (isDroneProduct(p) ? { ...p, type: "tech_drones" } : p));
  /* Cabello: each product's treatment aisle is its type (the rails and the
     pills read it); a brand Peru sells cheaply enters only on sale, and
     the lines Peru does not carry lead (the stable sort below keeps it). */
  if (key === "cabello") {
    list = list.map((p) => ({ ...p, type: CAB_LABELS[CAB_BUCKETS.includes(p.bucket) ? p.bucket : hairAisle(p.title)] }))
      .filter((p) => p.type && (!PERU_SOLD_HAIR_RX.test(p.title + " " + (p.brand || "")) || p.salePct > 0));
    const peru = (p) => (PERU_SOLD_HAIR_RX.test(p.title + " " + (p.brand || "")) ? 1 : 0);
    return list.map((p, i) => ({ p, i })).sort((a, b) => (peru(a.p) - peru(b.p)) || ((b.p.salePct > 0) - (a.p.salePct > 0)) || (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i)).map((x) => x.p);
  }
  if (SHOE_DEPTS.has(key)) list = list.map((p) => ({ ...p, type: footwearClass(p, p.retailer), ...(key === "shoes" ? { g: shoeGender(p, p.bucket) } : {}) }));
  /* Tallas Plus leads with her (Danny's 2026-09-24 rule) and with the
     true plus run -- 1X+, XXL+, 16+ -- before a run that only reaches XL. */
  if (key === "curvy") {
    const depth = (p) => { const g = plusGender(p); return extendedSizesOf({ availableSizes: p.sizes }, g).some((s) => !/^(xl|14)\b/i.test(String(s).trim())) ? 1 : 0; };
    return list.map((p, i) => ({ p: { ...p, g: plusGender(p) }, i, d: depth(p) }))
      .sort((a, b) => ((b.p.g === "women") - (a.p.g === "women")) || (b.d - a.d) || ((b.p.salePct > 0) - (a.p.salePct > 0)) || (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i)).map((x) => x.p);
  }
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

/* u: who each product is for (#443 header): a shoe by footwear.js's
   rule, anything else by its own words, then its store when that store
   sells to one adult audience (offer-category.js). Never guessed. */
/* AUDIENCE-TRUE (#443 c.6634907518, Danny's mom: «HOMBRE contains
   ARETES»). Earrings, heels, dresses, skirts, bras and lingerie are hers
   unless the product's own words say otherwise: a store's men's aisle
   (SSENSE files Justine Clenquet's earrings under men) or a shoe rule's
   «unisex» for a pump that names no wearer does not make one his. Such a
   product is hers when it was «unisex», and nobody's (it leaves the
   Hombre switch and column) when only the store's aisle said «men». */
export const WOMENS_TYPE_RX = /\b(earrings?|aretes?|ear\s+(?:cuffs?|climbers?|crawlers?)|heels?|tacones|pumps?|dress(?:es)?|vestidos?|skirts?|faldas?|bras?|bralettes?|sost[eé]n(?:es)?|lencer[ií]a|lingerie)\b/i;
export const HIS_WORDS_RX = /\b(men|mens|men's|man|male|hombres?|him|homme|uomo|caballeros?|unisex|boys?|guys?)\b/i;
const NOT_A_DRESS_RX = /\bdress\s+(?:shirts?|pants|trousers|shoes?|socks?|belts?|boots?|watch(?:es)?)\b/i;
export function audienceTrue(p, u) {
  /* Kids only when the product proves it: an adult cut or an adult's
     word is the adult's, else nobody's. */
  if (u === "kids" && isAdultInKids(p)) {
    const t = String(p.title || "");
    return /\b(women['’]?s?|womens|woman|ladies|juniors?['’]?s?|maternity)(?![a-z])/i.test(t) || STYLE_TRAP_RX.test(t) ? "women" : /\b(men['’]?s?|mens)(?![a-z])/i.test(t) ? "men" : "";
  }
  if (u !== "men" && u !== "unisex") return u;
  const what = typeKeyOf(p).label + " " + String(p.type || "") + " " + String(p.storeType || "");
  if (!WOMENS_TYPE_RX.test(what) || HIS_WORDS_RX.test(String(p.title || "")) || NOT_A_DRESS_RX.test(String(p.title || ""))) return u;
  return u === "unisex" ? "women" : "";
}
export function audienceTagger(all) {
  const storeAud = storeAudiences(all, (p) => { try { return productClass(p); } catch { return ""; } });
  return (p) => audienceTrue(p, isFootwear({ title: p.title, name: p.title, type: p.type }, p.retailer) ? shoeGender(p, p.bucket) : (garmentAudience(p, storeAud) || ""));
}
/* The header's part of head.json: the hero's stats chips, and the
   audience switch where the data says who the department is for
   (Perfumes keeps its own doors). */
export function headerExtra(key, list) {
  const aud = key === "perfumes" ? null : audienceSwitch(list);
  return { stats: deptStats(list), ...(aud ? { aud } : {}) };
}

export function build(root = ROOT) {
  const all = loadAllItems(root);
  const outRoot = join(root, OUT_DIR);
  const summary = {};
  /* A hub pill can open another department's lens (Belleza > Cabello). */
  const lists = new Map();
  const audienceFor = audienceTagger(all);
  const listOf = (k) => { if (!lists.has(k)) lists.set(k, deptItems(all, k).map((p) => ({ ...p, u: audienceFor(p) }))); return lists.get(k); };
  for (const key of Object.keys(DEPT_RULES)) {
    const dir = join(outRoot, key);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const list = listOf(key);
    const sections = buildSections(list, sectionOpts(key));
    /* Order D: the hub's pill row rides in head.json; each lens is its own file. */
    const { lenses, extra } = hubLenses(key, list, ALL_LABELS, listOf);
    for (const l of lenses) writeFileSync(join(dir, `lens-${l.k}.json`), JSON.stringify(l));
    /* Perfumes' doors and brand pills ride in its head (the universal format). */
    const pills = key === "perfumes" ? perfumePills(list) : BRAND_ROOMS.has(key) ? brandRoomPills(list) : {};
    /* The header (#443 c.6545712892): the hero's stats chips, and the
       audience switch where the data says who the department is for
       (Perfumes keeps its own doors). */
    writeFileSync(join(dir, "head.json"), JSON.stringify(headOf(key, list, sections, ALL_LABELS, { ...extra, ...pills, ...headerExtra(key, list) })));
    /* The homepage Electrónica carousel's pills (c.6485409220). */
    /* home.json is the pill row and the first pill's cards (the first
       screen, under the 32KB budget); each other pill is its own
       home-<pill>.json, fetched after the section paints. */
    if (key === TECH_DEPT) {
      const { pills } = homeTechPills(list);
      writeFileSync(join(dir, "home.json"), JSON.stringify({ v: 1, pills: pills.map((p) => ({ k: p.k, label: p.label, n: p.cards.length, ...(p.note ? { note: p.note } : {}), ...(p.door ? { door: p.door } : {}) })), cards: pills.length ? pills[0].cards : [] }));
      for (const p of pills.slice(1)) { writeFileSync(join(dir, `home-${p.k}.json`), JSON.stringify({ k: p.k, cards: p.cards })); }
    }
    let files = 1;
    for (let b = 0; b < batchCount(sections); b++) { writeFileSync(join(dir, `rails-${b}.json`), JSON.stringify(batchOf(sections, b))); files++; }
    mkdirSync(join(root, FN_DIR), { recursive: true });
    writeFileSync(join(root, FN_DIR, key + ".json"), JSON.stringify({ v: 1, dept: key, labels: labelsOf(list, ALL_LABELS), rows: list.map(fnRow) }));
    /* The store's own size runs, row for row (the header's Talla filter,
       netlify/functions/_nav-filter-core.js). Each distinct run is kept
       once; rows[i] is its index (0: the store published none). */
    writeFileSync(join(root, FN_DIR, key + ".sizes.json"), JSON.stringify(sizeRuns(list)));
    summary[key] = { items: list.length, rails: sections.length, files };
  }
  /* The homepage audience carousels (c.6483623203): <aud>.json is the pill
     row and the first pill's cards; each other pill is <aud>-<pill>.json. */
  const audDir = join(root, AUDIENCE_DIR);
  if (existsSync(audDir)) rmSync(audDir, { recursive: true });
  mkdirSync(audDir, { recursive: true });
  for (const aud of Object.keys(AUDIENCE_SHELVES)) {
    const { pills } = audiencePills(aud, listOf);
    writeFileSync(join(audDir, aud + ".json"), JSON.stringify({ v: 1, pills: pills.map((p) => ({ k: p.k, label: p.label, dept: p.dept, n: p.cards.length })), cards: pills.length ? pills[0].cards : [] }));
    for (const p of pills.slice(1)) writeFileSync(join(audDir, `${aud}-${p.k}.json`), JSON.stringify({ k: p.k, cards: p.cards }));
    summary["home:" + aud] = { items: pills.length, rails: 1, files: pills.length };
  }
  /* The audience pill cards with 2+ photos carry their count (#443). */
  stampHomePhotos(root, [AUDIENCE_DIR]);
  return summary;
}
export const AUDIENCE_DIR = "assets/home/pills";
export function sizeRuns(list) {
  const runs = [[]], at = new Map([["", 0]]);
  const rows = list.map((p) => {
    const run = [...new Set((Array.isArray(p.sizes) ? p.sizes : []).map((z) => String(z || "").trim()).filter(Boolean))];
    const k = run.join("\u0001");
    if (!at.has(k)) { at.set(k, runs.length); runs.push(run); }
    return at.get(k);
  });
  return { v: 1, runs, rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = Date.now();
  const s = build();
  for (const [k, v] of Object.entries(s)) console.log(`${k.padEnd(18)} ${String(v.items).padStart(6)} items  ${String(v.rails).padStart(3)} rails  ${v.files} files`);
  console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s -> ${OUT_DIR}/`);
}
