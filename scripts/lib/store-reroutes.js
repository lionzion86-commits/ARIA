/* ============================================================
   STORE PAGES, LABEL-TRUE (#443 c.6522560722, Lucifer's store-page
   audit; re-audited fresh on main 2026-11-04, c.6623383286 item 5).
   Danny: "a «Juguetes» rail holding a skateboard deck makes us look like
   we don't have our act together. Every store page must be label-true."

   What the 2026-11-04 audit still found on main (store pages only):
     PARROT -- 329 decks, 29 completes and the cruisers sat in one
       «Deportes» rail with leashes, fins and trucks; Globe's «Blazer»
       cruisers (16) were Ropa; Firewire / Thunderbolt / JS surfboards
       (model-only titles, the store's blind «Accesorios» stamp) were
       Accesorios; «Santa Cruz Slime Scream 8.25» was Juguetes, «Jacuzzi
       Ring Of Fire 8.5» Joyas; Veia board socks were Ropa.
     VICTORIA'S SECRET -- shimmer and mini mists, mist gift sets in
       Belleza; panties, a bra, a playsuit and a garter belt in «Más de
       Victoria's Secret» (part names -- ring hardware, chain strap, «in a
       Bag» -- misled the classifier).

   The rule: a strong title noun (or the store's own board stamp) outranks
   the family the shared classifier gave. A board is a board; a mist is a
   perfume; a panty is clothing. Re-route, never remove. The family keys
   below are build-store-slices' rail families ("t-<family>").
   ============================================================ */

import { isShoeItem, garmentFamily, notShoeNoun } from "./store-truth.js";

export const BOARD_FAMILIES = {
  tablas_skate: "Tablas de skate",
  tablas_surf: "Tablas de surf",
};

/* What a board's title or stamp never is: the parts, the bags, the
   socks, the clothes and the trinkets named after it. */
const BOARD_ACCESSORY_RX = /\b(modems?|routers?|wi-?fi|docsis|ornaments?|art|decor|signs?|prints?|posters?|necklaces?|pendants?|charms?|plush|mugs?|glass(es)?|totes?|backpacks?|boardshorts?|trunks?|shorts|jackets?|vests?|dress(es)?|swim\w*|wetsuits?|rash\s*guards?|combs?|toys?|lego|fingerboards?|finger\s*boards?|tech\s*deck|hot\s*wheels|barbie|playsets?|figures?|bags?|socks?|covers?|leash(es)?|fins?|wax|keychains?|earrings?|coasters?|tees?|t-shirts?|shirts?|hoodies?|pants?|chinos?|trucks?|wheels?|bearings?|hardware|bolts?|risers?|grip(tape)?|tape|rails?|tools?|racks?|books?|stickers?|magnets?|towels?|hats?|caps?|beanies?|shoes?|sneakers?|pads?|bushings?|helmets?|skates|lessons?|gift\s*cards?|traction|leashes|plugs?|sleeves?|straps?|nose\s*guards?|repair|ding|boots?|sandals?|slides?|gloves?|land\s+cruiser|fresheners?|jerseys?|tanks?|hangers?|tumblers?|bottles?|openers?|speakers?|umbrellas?|keyrings?|pins?|sunglasses|short|kits?|infill)\b/i;
const SKATE_STAMP_RX = /^(decks?\b|tablas? de skate|skateboards? complet|cruisers?$)/i;
/* «Longboards» is a skate stamp at CCS and a surf stamp at Island Water
   Sports: a deck, a complete or a skate word says skate; otherwise surf. */
const LONGBOARD_STAMP_RX = /^longboards?$/i;
const LONGBOARD_SKATE_RX = /\b(decks?|completes?|cruisers?|skate\w*|surfskate)\b/i;
const SURF_STAMP_RX = /^tablas? de surf$/i;
const SKATE_TITLE_RX = /\bskateboards?\b|\bskate\s+(deck|cruiser|complete)s?\b/i;
/* «Deck», «Cruiser» and «Complete» are boards only where skating is said:
   the store's skate stamp, or a skate word in the title. */
const SKATE_WORD_RX = /\b(skate\w*|cruiser\s+board)\b/i;
const SKATE_NOUN_RX = /\b(deck|cruiser|complete)s?\b/i;
/* A deck named by its graphic and its width: «Anti Hero Absentes 8.38». */
const DECK_WIDTH_RX = /\b(7\.[5-9]\d?|8\.\d{1,3}|9\.\d{1,3}|10\.\d{1,3})\s*("|in|″)?\s*$/i;
const SKATE_STAMP_LOOSE_RX = /^(accesorios( de skate)?)$/i;
/* Surfboards carry the shaper's model only («5.10 Helium Mashup»); a fin
   set from the same maker names its fins, or its fin box and set. */
export const SHAPERS = new Set(["firewire", "thunderbolt", "js surfboards", "channel islands", "pyzel", "haydenshapes", "sharp eye", "sharpeye", "chilli", "dhd", "torq"]);
/* The shaper rule reads only what the classifier left as gear: a shaper's
   tee or boardshort is clothing, whatever it is called. */
const SHAPER_FAMILIES = new Set(["accesorios", "deportes", "juguetes", "joyas"]);
const FIN_RX = /\b(fins?|fin\s+set|keel|tri|quad|twin|thruster|tab|fut|endorfins|velox|5\s*fin|single\s+tab|dual\s+tab)\b/i;
const BOARD_LENGTH_LEAD_RX = /^\s*\d{1,2}[.'’]\d{1,2}\b/;
const SURF_TITLE_RX = /\b(surfboard|softboard|funboard)s?\b/i;

/** "tablas_skate" | "tablas_surf" | null: is this product a board? */
export function boardFamily(p, fam = "") {
  const name = String(p?.name || p?.title || "");
  const type = String(p?.type || "").trim();
  const brand = String(p?.brand || "").trim().toLowerCase();
  if (!name || fam === "zapatos") return null;
  if (BOARD_ACCESSORY_RX.test(name)) return null;
  /* Surf: the store's own stamp, a surfboard noun, or a shaper's model. */
  if (SURF_STAMP_RX.test(type) || SURF_TITLE_RX.test(name)) return "tablas_surf";
  if (SHAPERS.has(brand) && SHAPER_FAMILIES.has(fam) && (BOARD_LENGTH_LEAD_RX.test(name) || !FIN_RX.test(name))) return "tablas_surf";
  /* Skate: the store's deck / complete / cruiser stamp, a deck noun, or a
     deck's width under a skate stamp. */
  if (LONGBOARD_STAMP_RX.test(type)) return LONGBOARD_SKATE_RX.test(name + " " + brand) ? "tablas_skate" : "tablas_surf";
  if (SKATE_STAMP_RX.test(type) || SKATE_TITLE_RX.test(name)) return "tablas_skate";
  if (SKATE_NOUN_RX.test(name) && (SKATE_WORD_RX.test(name) || SKATE_WORD_RX.test(type))) return "tablas_skate";
  if (SKATE_STAMP_LOOSE_RX.test(type) && SHAPER_FAMILIES.has(fam) && DECK_WIDTH_RX.test(name)) return "tablas_skate";
  return null;
}

/* A board's sock or cover is surf gear, not clothing (Veia, Channel Islands). */
const BOARD_SOCK_RX = /\b(surf\s*board|surfboard|board)\s+(socks?|covers?)\b/i;
/* A mist is a perfume (VS: shimmer, mini, travel, hair & body, gift sets). */
const MIST_RX = /\b(fragrance|body|shimmer|hair\s*(&|and)\s*body|fine\s+fragrance)\s+mists?\b|\bmini\s+mists?\b|\bmists?\s+(gift\s+set|wreath|layering)\b|\bmist\s+layering\b/i;
const NOT_MIST_RX = /\b(lotions?|creams?|wash|scrub|setting\s+(spray|mist)|face|facial|makeup|toner|sunscreen|spf|texturi[sz]ing|sea\s+salt|cooling|after[- ]sun)\b/i;
/* Intimates by their own noun, whatever part name sits in front of it. */
const INTIMATE_RX = /\b(panty|panties|bras?|bralettes?|playsuits?|garter\s+belts?|thongs?|bodysuits?|babydolls?|tee-?jamas?|pajamas?|pj\s+sets?|chemises?)\b/i;
/* ...but a «Bra Bag», a charm or a mat is what its last noun says. */
const NOT_INTIMATE_RX = /\b(dolls?|barbie|toys?|bags?|keychains?|charms?|earrings?|mats?|rugs?|makeup|brush(es)?|wash|detergent|hangers?|organi[sz]ers?|tint)\b/i;
const NOT_CLOTHING_FAMILIES = new Set(["joyas", "accesorios", "carteras", "hogar", "juguetes", "sombreros"]);

/**
 * The family a store page files a product under: the shared classifier's
 * answer `fam`, unless a strong title noun says otherwise.
 */
const SNOWBOARD_RX = /\b(directional|camber|rocker|flat\s+top|split\s*boards?|snowboards?)\b/i;
/* Families a garment already belongs to. */
const GARMENT_HOME = new Set(["ropa", "trajes_bano"]);
const GARMENT_FROM = new Set(["accesorios", "joyas", "hogar", "juguetes"]);
/**
 * THE AUDIT'S RE-FILE (#443 c.6635296341, the full store audit), every
 * storefront: shoes are Zapatos, and a garment is clothing.
 *   - a shoe by its name or its house's model line (scripts/lib/store-
 *     truth.js) -- Parrot's «Skate Old Skool 195», Val Surf's «Hi-Standard
 *     OG», Reef's «Cushion Court» -- is Zapatos, whatever blind stamp
 *     («Accesorios»), part word or décor word misfiled it;
 *   - what Zapatos held that its own head noun says is not a shoe (a
 *     glove liner, a goggle, a «Boot Jean», a cleaning kit) leaves it;
 *   - a garment under an accessory, jewellery, home or toy family
 *     («2% Hijinx Hoody», «Skimpy Bottom», Miu Miu's «Chino Bermudas»)
 *     is clothing (or swimwear).
 */
export function truthFamily(p, fam, retailer = p?.retailer) {
  const name = String(p?.name || p?.title || "");
  if (fam !== "zapatos" && !BOARD_FAMILIES[fam] && isShoeItem(p, retailer)) return "zapatos";
  if (fam === "zapatos" && notShoeNoun(p) && !isShoeItem(p, retailer)) return garmentFamily(name) || "accesorios";
  if (GARMENT_FROM.has(fam)) { const g = garmentFamily(name); if (g) return g; }
  return fam;
}
export function storeFamily(p, fam, retailer = p?.retailer) {
  const name = String(p?.name || p?.title || "");
  const board = boardFamily(p, fam);
  if (board) return board;
  const t = truthFamily(p, fam, retailer);
  if (t !== fam) return t;
  /* A snowboard named by its profile («Fish 3D Directional Flat Top») is
     gear, not a top (Val Surf's Hombre pill opened on it). */
  if (fam === "ropa" && SNOWBOARD_RX.test(name) && !garmentFamily(name)) return "deportes";
  if (BOARD_SOCK_RX.test(name) && fam === "ropa") return "deportes";
  if ((fam === "belleza" || fam === "hogar" || fam === "accesorios") && MIST_RX.test(name) && !NOT_MIST_RX.test(name)) return "perfumes";
  if (NOT_CLOTHING_FAMILIES.has(fam) && INTIMATE_RX.test(name) && !NOT_INTIMATE_RX.test(name.replace(/\bin\s+a\s+bag\b/i, ""))) return "ropa";
  return fam;
}

/* SOCKS NEVER LEAD A RAIL OF CLOTHES (Danny's standing rule, #443
   c.6567120876 item 4: "never lead with socks or accessories"). The
   homepage carousels keep it (build-home-category-pills `worn`); on main
   2026-11-04 the store Ropa rails did not: Parrot, AYBL, Kill Crew and
   Oner Active opened on four socks. Socks move to the back of the rail,
   in their own order; nothing is removed. */
const SOCK_RX = /\b(socks?|calcetines?|no[- ]show(s)?)\b/i;
const SOCK_TYPE_RX = /\b(socks?|calcetines?|medias)\b/i;
export const isSockItem = (p) => SOCK_RX.test(String(p?.name || p?.title || "")) || SOCK_TYPE_RX.test(String(p?.type || ""));
export function socksToBack(list) {
  const worn = [], socks = [];
  for (const p of list) (isSockItem(p) ? socks : worn).push(p);
  return worn.concat(socks);
}
