// Shared definition of WHERE Ofertas looks for deals and HOW a scraped row
// becomes a deal.
//
// index.html carries its own copy of all of this because it is a plain
// <script> and cannot import a module — the same reason the retailer badge
// and the batch-hour helpers are duplicated there. That duplication is
// only safe because it is asserted: test-sales-parity cross-checks this
// module against index.html's own SALES_SOURCES and normalizeLiveItem over
// the real cached payloads. Change one, change the other, or the test
// fails.
//
// The refresh script (scripts/refresh-sales-cache.js) is the only writer
// of the deals cache in normal operation, so what it considers a deal has
// to match what the page would have considered a deal.

// Confirmed department sources — see the SALES_SOURCES comment in
// index.html for why these and not a keyword search.
export const SALES_SOURCES = [
  { retailer: "oldnavy", department: "men" },
  { retailer: "oldnavy", department: "women" },
  { retailer: "oldnavy", department: "kids" },
  { retailer: "footlocker", department: "sale" },
  { retailer: "footlocker", department: "women" },
  { retailer: "footlocker", department: "kids" },
  { retailer: "walmart", department: "clothing" },
  { retailer: "walmart", department: "electronics" },
  { retailer: "walmart", department: "sporting_goods" },
  { retailer: "target", department: "clothing" },
  { retailer: "target", department: "electronics" },
  { retailer: "target", department: "sporting_goods" },
];

// Must match index.html exactly.
export const SALES_TAX_RATE = 1.07;
export const LIVE_PRICE_MARKUP = 1.24; // band-1 rate / legacy reference; live pricing uses tieredMarginUsd
export const MIN_DISCOUNT_PCT = 5;

/* TIERED MARGINAL MARGIN (2026-10-02, Danny — LOCKED). Must match
   tieredMarginUsd() in index.html exactly: 24% on the first $500 of the
   US shelf price, 18% on $500–$2,000, 12% on $2,000–$5,000, 8% above.
   Under $500 this is exactly the old flat 24%. */
export function tieredMarginUsd(rawUsd) {
  const r = Number(rawUsd);
  if (!(r > 0)) return 0;
  return Math.min(r, 500) * 0.24
    + Math.min(Math.max(r - 500, 0), 1500) * 0.18
    + Math.min(Math.max(r - 2000, 0), 3000) * 0.12
    + Math.max(r - 5000, 0) * 0.08;
}

import {
  bulkyWeightKg, freightUsd, freightShare, withBuffer, withoutBundledClauses,
  titleWeight, FREIGHT_FEATURE_CEILING, weightSanity, footwearWeightKg, ballWeightKg, bookWeightKg,
  candleWeightKg, GENERIC_FALLBACK_KG,
} from "./item-weight.js";
import { beautyWeightDetail } from "./beauty-weight.js";
import { supplementWeightKg } from "./supplement-weight.js";

// The public charged rate, and only that. weight-data.js also exports our
// internal courier cost and margin; neither may travel with anything that
// reaches a customer, so this module imports neither.
export const CHARGE_PER_KG_USD = 13;

// General-retail fallbacks. This is an EXACT mirror of
// RETAIL_WEIGHT_ESTIMATES_KG in index.html -- same rows, same order, same
// confidence tiers -- because both sides must produce the identical weight
// for the same title. They diverged once: this table was written without
// the `tier` field, so every row got the 1.20 'reasoned' buffer while the
// page gave 'cited' rows 1.10, and a pair of sneakers came out 1.32kg here
// against 1.21kg there. The freight gate runs on these numbers, so a
// mismatch means the page can show a deal the refresh suppressed.
// test-freight asserts row-for-row agreement.
//
// 2026-09-20: the `dimCm` field is gone from every row. It existed to
// bill rigid boxed goods at their dimensional weight; the courier
// contract bills actual scale weight only, so the box no longer enters
// the quote and these are plain masses.
const MONITOR_IMPOSTOR_RE = /\b(baby|audio|security)\b/i;
const RETAIL_WEIGHT_FALLBACK_KG = [
  { match: /\bjeans?\b|denim/i, kg: 1, tier: 'cited' },              // std pair of jeans ~1.5-2lb / 0.68-0.9kg shipping-budget consensus (parcelpath.com, sinofinetex.com)
  { match: /t-?shirt|\btee\b|undershirt/i, kg: 0.2, tier: 'cited' },   // std cotton tee ~140-200g (printful.com, printkk.com)
  { match: /hoodie|sweatshirt/i, kg: 0.8, tier: 'cited' },              // cotton hoodie ~450-680g (printful.com)
  /* BLAZERS (2026-10-01, Danny): structured blazers — lighter than a winter
     jacket (1.3) but heavier than a shirt. ~600-800g; higher-end 0.8 kg. */
  { match: /\b(blazer|saco)\b/i, kg: 0.8, tier: 'reasoned' },
  { match: /jacket|\bcoat\b/i, kg: 1.3, tier: 'reasoned' },             // heavier outerwear than a hoodie — reasoned estimate, no single citation
  // Footwear is owned by footwearWeightKg() — one source, sized by what
  // is in the box rather than one number for every pair.
  { match: /underwear|boxer|\bbriefs?\b|panty|panties/i, kg: 0.08, tier: 'cited' }, // ~30-70g/pair (crescendoapparel.com)
  { match: /\bsocks?\b/i, kg: 0.1, tier: 'cited' },
  /* JEWELRY (2026-09-30, Danny): a necklace is grams, not kilos. Without a
     row these fell to the 0.6 kg generic and quoted ~$10 of freight on a
     50 g pendant. Boxed fashion jewelry ~0.1 kg. The not-guard keeps
     "ring light" and "jewelry box" out — neither is wearable jewelry. */
  { match: /\b(necklace|collar|bracelet|pulsera|earrings?|aretes|pendant|dije|brooch|broche|charm|dije|anklet|tobillera|cuff|jewelry|joyer[ií]a|bisuter[ií]a|anillo|wedding band)\b/i, not: /\bring\s+light\b|\bjewelry\s+box\b/i, kg: 0.1, tier: 'cited' },
  /* SWIMWEAR (2026-10-01, Danny): 603 Latino-designer items (bikinis,
     one-pieces, swim sets) had no row and fell to the generic fallback.
     Individual pieces ~70-160g, full sets 140-320g (ubuy.com listings).
     Danny 2026-10-01: use the average (0.17 kg), not the high end -
     swimwear must stay inexpensive for everybody. */
  { match: /\b(bikini|swimsuit|swimwear|tankini|maillot|bottoms?|trunks?)\b/i, kg: 0.17, tier: 'cited' },
  /* SURFSUITS (2026-10-01, Danny): neoprene surfsuits — 0.9-0.95 kg packaged
     (3/2mm full suits). Higher-end 1.0 kg. */
  { match: /\b(wetsuit|surfsuit)\b/i, kg: 1, tier: 'cited' },
  /* SWIM COVERUPS (2026-10-01, Danny): pareos/sarongs ~150-200g; beaded
     kaftans are caught by the beaded row below. Higher-end 0.3 kg. */
  { match: /\b(pareo|sarong|cover[- ]?up)\b/i, kg: 0.3, tier: 'reasoned' },
  /* 2026-09-19: these were the biggest slice of the "unclassified guess"
     review queue — a clothing-heavy catalogue with no row for trousers,
     shorts or a button-up shirt. Every one of them was quoting the 1.08 kg
     generic fallback. Cited tier: these are ordinary garment weights. */
  { match: /\b(pants|trousers|chinos?|cargo pants|sweatpants|joggers?|leggings?|overalls)\b/i, kg: 0.55, tier: 'cited' },
  { match: /\b(shorts)\b/i, kg: 0.32, tier: 'cited' },
  { match: /\b(shirt|polo|blouse|button[- ]?up|button[- ]?down)\b/i, kg: 0.35, tier: 'cited' },
  /* TOPS (2026-10-01, Danny): 291 Latino-designer tops/bodysuits had no row —
     not t-shirts (0.2), not button-ups (0.35). Women's woven tops ~150-250g.
     Higher-end 0.25 kg. Placed before beaded so an embroidered bra top stays
     a top; "Tunic Dress" and "Halter Gown" fall through to dress/gown. */
  { match: /\b(tops?|bodysuit)\b/i, kg: 0.25, tier: 'reasoned' },
  /* BEADED/EMBELLISHED (2026-10-01, Danny): PatBO et al do heavy beadwork —
     an embroidered maxi is 790-870g vs 420g plain (carlyna.com), heavy beading
     runs to 2.5kg. Higher-end 1.0 kg. The not-guard keeps embroidered tops
     on the top row; swimwear was already caught above. */
  { match: /\b(beaded|beadwork|embroidered|embroidery|rhinestone|sequin(?:ned)?|crystal)\b/i, not: /\btop\b/i, kg: 1, tier: 'cited' },
  { match: /\b(dress|skirt|romper|jumpsuit)\b/i, kg: 0.42, tier: 'cited' },
  /* GOWNS (2026-10-01, Danny): evening/formal gowns carry more fabric than a
     day dress — Target ship weights 0.44-0.64 kg; designer runway pieces run
     heavier. Higher-end 0.8 kg. Beaded gowns were already caught above. */
  { match: /\b(gown|caftan)\b/i, kg: 0.8, tier: 'cited' },
  { match: /\b(sweater|cardigan|fleece|vest|pullover)\b/i, kg: 0.6, tier: 'cited' },
  { match: /\b(pajamas?|pyjamas?|\bpj\b|robe|sleepwear|loungewear|eye mask)\b/i, kg: 0.6, tier: 'reasoned' },
  /* BAGS & SMALL ACCESSORIES (2026-10-01, Danny): 74 Latino-designer handbags
     plus belts, hats, scarves, gloves, sunglasses, capes had no rows.
     Handbags 400-725g (ubuy.com) -> 0.7 kg higher-end; women's leather belts
     ~300g (berbanto.com) -> 0.3 kg; hats/scarves/gloves/sunglasses/capes are
     reasoned higher-end estimates. */
  { match: /\b(handbag|tote|clutch|bag|pouch|mochila|bols[oa])\b/i, kg: 0.7, tier: 'cited' },
  { match: /\b(belt|cintur[oó]n)\b/i, kg: 0.3, tier: 'cited' },
  { match: /\b(hat|sombrero|cap|visor)\b/i, kg: 0.15, tier: 'reasoned' },
  { match: /\b(scarf|bufanda|shawl|pashmina)\b/i, kg: 0.2, tier: 'reasoned' },
  { match: /\b(gloves?|guantes)\b/i, kg: 0.15, tier: 'reasoned' },
  /* EYEWEAR (2026-10-02, Danny): a pair of glasses is 30-50 g, not 1.16 kg.
     Two fixes: (1) the row was 0.15 kg base -- real cased shipments run
     50-150 g, so 0.04 kg base quotes ~54 g with the reasoned buffer;
     (2) the match now catches eyewear sold without the literal word
     "sunglasses" -- "Ray-Ban RB2132" and "reading glasses" were falling
     to the 0.6 kg generic. Eyewear-only brands (Ray-Ban, Persol, Costa
     Del Mar, Maui Jim, Warby Parker) are safe to name; Oakley/Smith also
     make helmets and apparel, so they stay on the product nouns. */
  { match: /\b(sunglasses|eyeglasses?|spectacles|eyewear|gafas|reading glasses|blue light glasses|computer glasses)\b|\bray-?ban\b|\bpersol\b|\bcosta del mar\b|\bmaui jim\b|\bwarby parker\b/i, kg: 0.04, tier: 'reasoned' },
  /* WATCHES (2026-10-02, Danny): a Timex Weekender is ~50 g, not the 0.6 kg
     generic. Boxed ~150 g; 0.12 kg base quotes 0.16 kg. The not-guard keeps
     smartwatches on their own row below. */
  { match: /\b(watch|watches|reloj(?:es)?)\b/i, not: /smartwatch|apple watch/i, kg: 0.12, tier: 'reasoned' },
  /* WALLETS (2026-10-02, Danny): ~80-120 g, not the 0.6 kg generic.
     0.1 kg base quotes 0.14 kg. */
  { match: /\b(wallet|wallets|billetera(?:s)?)\b/i, kg: 0.1, tier: 'reasoned' },
  /* KEYCHAINS (2026-10-02, Danny): ~20-40 g, not the 0.6 kg generic.
     0.03 kg base quotes 0.04 kg. */
  { match: /\b(keychain|keychains|key ring|llavero(?:s)?)\b/i, kg: 0.03, tier: 'reasoned' },
  { match: /\b(cape|capa|poncho)\b/i, kg: 0.5, tier: 'reasoned' },
  { match: /\b(towels?|washcloths?|dishcloths?)\b/i, kg: 0.3, tier: 'reasoned' },
  /* TABLECLOTHS (2026-10-01, Danny): a few designer table linens in the pull.
     ~300-500g; higher-end 0.5 kg. */
  { match: /\b(tablecloth|mantel)\b/i, kg: 0.5, tier: 'reasoned' },
  { match: /\b(blu-?ray|\bdvd\b|4k ultra hd|box set|complete series)\b/i, kg: 0.3, tier: 'reasoned' },
  { match: /\b(knee brace|ankle brace|elbow brace|wrist brace|compression sleeve|back brace|ankle wraps?)\b/i, kg: 0.2, tier: 'reasoned' },
  // Balls are handled by ballWeightKg() (real mass x count vs the box),
  // not by a single row that made a golf ball and a basketball equal.
  { match: /\bfootballs?\b/i, kg: 0.45, tier: 'cited' },
  // Bedding is the heaviest thing a clothing-and-home catalogue sells by
  // volume, and it had no row at all: a queen comforter is nearly 3 kg.
  { match: /\b(comforter|duvet|quilt|bedspread|coverlet)\b/i, kg: 2.8, tier: 'reasoned' },
  { match: /\b(sheet set|bed sheets?|pillowcases?|bedding set|mattress pad|mattress protector)\b/i, kg: 1.6, tier: 'reasoned' },
  { match: /\b(pillows?|cushions?|throw blanket|blankets?)\b/i, kg: 1.2, tier: 'reasoned' },
  { match: /\b(curtains?|drapes?|shower curtain)\b/i, kg: 1, tier: 'reasoned' },                    // ~40-60g/pair (deadsoxy.com)
  { match: /smartphone|iphone|galaxy s\d|\bphone\b/i, kg: 0.3, tier: 'cited' }, // mainstream phones ~160-220g (devicetests.com)
  { match: /laptop|notebook|macbook|chromebook/i, kg: 2.4, tier: 'cited' }, // mainstream laptops 0.9-3.2kg; 1.8kg centers on the common 13-15" range (pcbuildadvisor.com)
  { match: /\bhdmi\b|\busb\b|\bcable\b|\bcord\b/i, kg: 0.25, tier: 'cited' }, // typical 3-6ft HDMI/USB cable ~100-200g (cablematters.com)
  { match: /\bremote\b/i, kg: 0.2, tier: 'reasoned' },
  // Rigid boxed goods. These rows used to carry a dimCm (the typical
  // retail box) and bill the greater of mass and dimensional weight; the
  // courier contract has no dimensional component, so they are plain
  // masses now. Mirrors RETAIL_WEIGHT_FALLBACK_KG in
  // scripts/lib/sales-sources.js; test-sales-parity asserts both agree.
  { match: /airpods max|over-?ear|\bheadphones?\b|\bheadset\b|aud[ií]fonos|auriculares/i, kg: 0.9, tier: 'reasoned' },
  /* PORTABLE SPEAKERS (2026-09-30): a "JBL Flip Bluetooth Speaker" is ~1 kg
     boxed, not the 4 kg soundbar the row below prices. Placed first so the
     generic speaker row never sees it. PartyBox-style boomboxes stay out
     via the not-guard — those really are 10 kg. */
  { match: /\b(portable|bluetooth|mini|pocket|port[áa]til)\b[^,]{0,30}\b(speakers?|parlante|bocina)\b|\b(speakers?|parlante|bocina)\b[^,]{0,30}\b(portable|bluetooth|mini|pocket|port[áa]til)\b/i, not: /\bparty\s?box\b/i, kg: 1, tier: 'reasoned' },
  { match: /\bsoundbar\b|\bspeaker\b|\bparlante\b|barra de sonido/i, kg: 4, tier: 'reasoned' },
  { match: /\bmonitor\b/i, not: MONITOR_IMPOSTOR_RE, kg: 5.5, tier: 'reasoned' },
  { match: /\bprinter\b|impresora/i, kg: 7, tier: 'reasoned' },
  { match: /\bstroller\b|car seat|silla de auto/i, kg: 8, tier: 'reasoned' },
  { match: /airpods|earbuds/i, kg: 0.35, tier: 'reasoned' },
  { match: /\bipad\b|\btablet\b/i, kg: 1.1, tier: 'reasoned' },
  { match: /smartwatch|apple watch/i, kg: 0.4, tier: 'reasoned' },
  /* THE VITAMINS ROW IS GONE (2026-09-20). One row at 0.5 kg —
     withBuffer made it 0.68 — served a 30-tablet bottle and a tub of
     protein alike, and quoted the identical number for two unrelated
     products live. Supplements are read by supplementWeightDetail()
     above, which does the arithmetic the title already contains.
     Mirrors scripts/lib/sales-sources.js. */
  /* PROJECTORS (2026-09-20). There was no row at all, which is how a "5G
     WiFi Bluetooth Projector" quoted freight on 0.065 kg. Bimodal
     category, so two rows: a pocket/portable unit is about a kilo boxed,
     a mainstream one two and a bit. "Projector screen" is a different
     object and is matched earlier, in the bulky table. */
  { match: /\b(mini|portable|pocket|pico|port[áa]til)\b[^,]{0,28}\b(projectors?|proyector(?:es)?)\b|\b(projectors?|proyector(?:es)?)\b[^,]{0,28}\b(mini|portable|pocket|pico|port[áa]til)\b/i, kg: 1, tier: 'reasoned' },
  { match: /\b(projectors?|proyector(?:es)?)\b/i, kg: 2.2, tier: 'reasoned' },
];

/* ============================================================
   KEYWORD WEIGHTS (2026-10-08) -- Lucifer's table, folded in.

   Kohl's and Macy's arrived with no usable weights, and ~53,000 titles
   across the catalogues fell to GENERIC_FALLBACK_KG. Lucifer's table
   (branch lucifer/weight-estimates, weight-estimates.json) names product
   types in Spanish and English with a packaged weight in kg. Danny's
   call: one table, not two -- so the keywords join this one, AFTER every
   row above. A row above always wins; these only answer a title that
   would otherwise get the generic fallback.

   How they match: whole words (no "top" inside "laptop"), accents
   optional, plural optional, never a part number ("BRA-126-C"), longest
   keyword first ("leather jacket" before "jacket"). Tier 'reasoned', so
   the same CONFIDENCE_BUFFER (x1.35) as every other estimate.

   Left out on purpose: words that name an audience or a department, not
   a product (women, men, kids, for her, apparel, ropa, accessor, gym,
   kitchen, bath, storage, home decor, ...). On a title that says nothing
   else they would LOWER the quote below the generic fallback -- a
   cheaper guess for an unknown product. Also "coche" (a car in a LEGO
   title; "coche de bebe" kept), "traje", "cable", "usb", "notebook",
   "lactancia". Guards below stop the false hits the catalogue showed.

   MIRRORED: index.html RETAIL_WEIGHT_ESTIMATES_KG and
   scripts/lib/sales-sources.js RETAIL_WEIGHT_FALLBACK_KG carry identical
   rows, so the card and the checkout agree; weight-table-tests fails
   the build if they ever differ.
   ============================================================ */
const KEYWORD_WEIGHT_KG = [
  ["winter coat", 1.4], ["abrigo de invierno", 1.4], ["parka", 1.4], ["down coat", 1.4], ["plumas", 1.4],
  ["overcoat", 1.1], ["trench", 1.1], ["leather jacket", 1.2], ["chaqueta de cuero", 1.2], ["casaca de cuero", 1.2],
  ["denim jacket", 0.9], ["casaca jean", 0.9], ["chaqueta jean", 0.9], ["jacket", 0.9], ["casaca", 0.9],
  ["chaqueta", 0.9], ["chamarra", 0.9], ["outerwear", 0.9], ["blazer", 0.8], ["saco", 0.8], ["hoodie", 0.6],
  ["sudadera con capucha", 0.6], ["poleron", 0.6], ["sweatshirt", 0.55], ["sudadera", 0.55], ["hoodies & zipups", 0.55],
  ["crewnecks", 0.55], ["sweater", 0.5], ["chompa", 0.5], ["sueter", 0.5], ["cardigan", 0.5], ["knits", 0.5],
  ["pullover", 0.5], ["wetsuit", 0.9], ["traje de neopreno", 0.9], ["neopreno", 0.9], ["rash guard", 0.25],
  ["jeans", 0.7], ["jean", 0.7], ["pants", 0.6], ["pantalon", 0.6], ["pantalones", 0.6], ["trousers", 0.6],
  ["sweatpants", 0.55], ["jogger", 0.55], ["buzo", 0.55], ["leggings", 0.3], ["licra", 0.3], ["shorts", 0.35],
  ["bermuda", 0.35], ["boardshorts", 0.35], ["t-shirt", 0.25], ["camiseta", 0.25], ["polo", 0.25], ["polos y camisetas", 0.25],
  ["tshirts", 0.25], ["tank top", 0.25], ["camisilla", 0.25], ["shirt", 0.3], ["camisa", 0.3], ["blusa", 0.3],
  ["blouse", 0.3], ["shirts", 0.3], ["dress", 0.4], ["vestido", 0.4], ["vestidos", 0.4], ["skirt", 0.3],
  ["falda", 0.3], ["faldas", 0.3], ["jumpsuit", 0.45], ["enterizo", 0.45], ["mameluco", 0.45], ["suit", 1.0],
  ["terno", 1.0], ["bikini", 0.2], ["swimsuit", 0.2], ["traje de bano", 0.2], ["ropa de bano", 0.2], ["swim", 0.2],
  ["underwear", 0.15], ["ropa interior", 0.15], ["panty", 0.15], ["calzon", 0.15], ["boxer", 0.15], ["brief", 0.15],
  ["bra", 0.15], ["brassiere", 0.15], ["sosten", 0.15], ["socks", 0.1], ["medias", 0.1], ["calcetin", 0.1],
  ["pajama", 0.4], ["pijama", 0.4], ["robe", 0.5], ["bata", 0.5], ["maternity", 0.4], ["maternidad", 0.4],
  ["embarazo", 0.4], ["activewear", 0.35], ["tops", 0.25], ["sneaker", 1.0], ["zapatilla", 1.0], ["tenis", 1.0],
  ["low top sneakers", 1.0], ["lace ups", 1.0], ["running shoe", 1.0], ["chimpunes", 1.0], ["shoe", 1.1],
  ["zapato", 1.1], ["calzado", 1.1], ["shoes", 1.1], ["oxford", 1.1], ["boot", 1.5], ["bota", 1.5], ["botin", 1.5],
  ["ankle boots", 1.5], ["sandal", 0.5], ["sandalia", 0.5], ["flip flop", 0.5], ["heeled sandals", 0.5],
  ["heel", 0.8], ["tacon", 0.8], ["tacones", 0.8], ["heels", 0.8], ["slipper", 0.4], ["pantufla", 0.4], ["slippers & loafers", 0.4],
  ["clog", 0.4], ["crocs", 0.4], ["loafer", 0.9], ["mocasin", 0.9], ["handbag", 0.8], ["cartera", 0.8], ["bolso", 0.8],
  ["purse", 0.8], ["shoulder bags", 0.8], ["tote", 0.8], ["satchel", 0.8], ["duffle", 0.8], ["top handle", 0.8],
  ["backpack", 0.9], ["mochila", 0.9], ["messenger bag", 0.7], ["wallet", 0.2], ["billetera", 0.2], ["card holder", 0.2],
  ["belt", 0.25], ["correa", 0.25], ["cinturon", 0.25], ["suspenders", 0.25], ["hat", 0.2], ["gorra", 0.2],
  ["sombrero", 0.2], ["gorro", 0.2], ["beanie", 0.2], ["caps", 0.2], ["sunglasses", 0.15], ["lentes de sol", 0.15],
  ["gafas de sol", 0.15], ["glasses", 0.15], ["lentes", 0.15], ["gafas", 0.15], ["watch", 0.3], ["reloj", 0.3],
  ["necklace", 0.1], ["collar", 0.1], ["cadenita", 0.1], ["bracelet", 0.1], ["pulsera", 0.1], ["brazalete", 0.1],
  ["earring", 0.1], ["arete", 0.1], ["zarcillo", 0.1], ["ring", 0.1], ["anillo", 0.1], ["sortija", 0.1],
  ["charm", 0.1], ["dije", 0.1], ["jewelry", 0.15], ["joyeria", 0.15], ["joya", 0.15], ["bisuteria", 0.15],
  ["scarf", 0.2], ["bufanda", 0.2], ["chalina", 0.2], ["pashmina", 0.2], ["glove", 0.2], ["guante", 0.2],
  ["tie", 0.15], ["corbata", 0.15], ["hair accessory", 0.1], ["accesorio de cabello", 0.1], ["vincha", 0.1],
  ["bag charm", 0.1], ["small leather", 0.25], ["leather goods", 0.25], ["marroquineria", 0.25], ["perfume", 0.4],
  ["fragrance", 0.4], ["cologne", 0.4], ["colonia", 0.4], ["locion", 0.4], ["makeup", 0.2], ["maquillaje", 0.2],
  ["lipstick", 0.2], ["labial", 0.2], ["foundation", 0.2], ["skincare", 0.3], ["cuidado de la piel", 0.3],
  ["serum", 0.3], ["serums", 0.3], ["moisturizer", 0.3], ["hidratante", 0.3], ["cream", 0.3], ["crema", 0.3],
  ["shampoo", 0.5], ["acondicionador", 0.5], ["conditioner", 0.5], ["body wash", 0.5], ["jabón liquido", 0.5],
  ["gel de ducha", 0.5], ["body lotion", 0.4], ["locion corporal", 0.4], ["deodorant", 0.2], ["desodorante", 0.2],
  ["mascarilla", 0.15], ["mask", 0.15], ["hair care", 0.3], ["doll", 0.5], ["muneca", 0.5], ["barbie", 0.5],
  ["lego", 0.8], ["building set", 0.8], ["bloques", 0.8], ["action figure", 0.3], ["figura coleccionable", 0.3],
  ["figura de accion", 0.3], ["board game", 1.0], ["juego de mesa", 1.0], ["plush", 0.4], ["peluche", 0.4],
  ["stuffed", 0.4], ["educational toy", 0.6], ["juguete educativo", 0.6], ["outdoor toy", 1.2], ["juguete exterior", 1.2],
  ["balloon", 0.2], ["globo", 0.2], ["toy", 0.5], ["juguete", 0.5], ["toys", 0.5], ["laptop", 2.5], ["tablet", 0.7],
  ["ipad", 0.7], ["headphone", 0.4], ["audifono", 0.4], ["earbud", 0.15], ["airpods", 0.15], ["speaker", 1.2],
  ["parlante", 1.2], ["bocina", 1.2], ["camera", 0.8], ["camara", 0.8], ["tripod", 1.0], ["tripode", 1.0],
  ["drone", 1.0], ["dron", 1.0], ["charger", 0.2], ["memory card", 0.1], ["tarjeta de memoria", 0.1], ["smart home", 0.6],
  ["alexa", 0.6], ["google home", 0.6], ["flash de estudio", 1.5], ["studio light", 1.5], ["beard trimmer", 0.5],
  ["afeitadora", 0.5], ["rasuradora", 0.5], ["skateboard completo", 3.5], ["skateboards completos", 3.5],
  ["complete skateboard", 3.5], ["deck", 1.5], ["tabla de skate", 1.5], ["tablas de skate", 1.5], ["longboard", 4.0],
  ["trucks", 0.8], ["truck", 0.8], ["surfboard", 4.0], ["tabla de surf", 4.0], ["tablas de surf", 4.0], ["helmet", 0.8],
  ["casco", 0.8], ["boxing glove", 1.0], ["guante de box", 1.0], ["soccer", 0.8], ["futbol", 0.8], ["chimpun", 0.8],
  ["tire", 8.0], ["llanta", 8.0], ["neumatico", 8.0], ["fishing", 1.0], ["pesca", 1.0], ["submarina", 1.0],
  ["toalla", 0.6], ["towel", 0.6], ["poncho", 0.6], ["bedding", 1.5], ["ropa de cama", 1.5], ["edredon", 1.5],
  ["sabana", 1.5], ["toalla de bano", 0.8], ["organizador", 1.2], ["baby room", 3.0], ["habitacion bebe", 3.0],
  ["cuna", 3.0], ["diaper", 1.0], ["panal", 1.0], ["panales", 1.0], ["baby wash", 0.4], ["baby shampoo", 0.4],
  ["biberon", 0.5], ["stroller", 8.0], ["cochecito", 8.0], ["car seat", 5.0], ["asiento de auto", 5.0], ["book", 0.8],
  ["libro", 0.8], ["coffee table book", 0.8], ["sticker", 0.1], ["calcomania", 0.1], ["coche de bebe", 8.0],
  ["funko pop", 0.35], ["vinyl figure", 0.35], ["cufflinks", 0.1],
];
/* Titles a keyword must not claim (seen in the catalogue). */
const KEYWORD_WEIGHT_NOT = {
  tire: /\bskateboard|\bwheels?\b|\b\d{2,3}a\b/i,
  heel: /\btar heels\b|\bswitch heel\b|\bwheels?\b|\bheel (?:cups?|grips?|pads?)\b/i,
  glasses: /\b(?:figurines?|statues?|sculptures?|wine|drinking|glassware|shot|cocktail)\b/i,
  balloon: /\b(?:mixer|whisk|cover)\b/i,
  tie: /\btie rods?\b|\btie[- ]?(?:dye|front|waist|neck|back)\b|\bside[- ]tie\b/i,
  ring: /\bring (?:lights?|binders?|toss)\b|\bkey ?rings?\b|\bteeth?ing\b|\bjuego\b/i,
  anillo: /\bse[nñ]or de los anillos\b/i,
  alexa: /\b(?:bulbs?|bombillas?)\b/i,
  trench: /\blego\b|\bdiorama\b/i,
  deck: /\bdeck wrap\b|\bfingerboard\b|\btraction\b|\bgrip ?tape\b|\bcards?\b|\bdecks of\b/i,
  surfboard: /\bfins?\b|\bleash(?:es)?\b|\btraction\b|\bpads?\b|\bwax\b|\bbags?\b|\bracks?\b|\bsocks?\b|\bcovers?\b|\bstickers?\b|\bplugs?\b|\bstraps?\b/i,
  longboard: /\bwheels?\b|\bbearings?\b|\btrucks?\b|\bfins?\b|\bleash(?:es)?\b|\bbushings?\b|\bpads?\b/i,
};
function keywordWeightPattern(k){
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/a/g, '[aá]').replace(/e/g, '[eé]').replace(/i/g, '[ií]')
    .replace(/o/g, '[oó]').replace(/u/g, '[uúü]').replace(/n/g, '[nñ]')
    .replace(/ /g, '[\\s-]+');
  return new RegExp('\\b' + esc + '(?:s|es)?\\b(?!-\\d)', 'i');
}
RETAIL_WEIGHT_FALLBACK_KG.push(...KEYWORD_WEIGHT_KG
  .map(([k, kg], i) => ({ k, kg, i }))
  .sort((a, b) => (b.k.length - a.k.length) || (a.i - b.i))
  .map(({ k, kg }) => ({ match: keywordWeightPattern(k), not: KEYWORD_WEIGHT_NOT[k] || KEYWORD_WEIGHT_NOT[k.replace(/s$/, '')], kg, tier: 'reasoned', keyword: k })));
// The generic fallback lives in item-weight.js — one number for the
// whole site, deliberately low. See GENERIC_FALLBACK_KG there.
const TV_ACCESSORY_RE = /\bcable\b|\bcord\b|\bmount\b|\bstand\b|\bremote\b|\bantenna\b|\bbracket\b|\badapter\b|\bconverter\b|\bscreen protector\b/i;

/* RETIRED 2026-09-26 (Danny's no-TV rule): kept for reference, no longer called. */
function tvWeightKg(title) {
  const m = /(\d{2})\s*(?:"|in\b|inch)/i.exec(title);
  const inches = m ? parseInt(m[1], 10) : null;
  const kg = inches == null ? 14 : inches <= 32 ? 8 : inches <= 43 ? 12
    : inches <= 50 ? 19 : inches <= 55 ? 23 : inches <= 65 ? 31 : 40;
  return withBuffer(kg, "cited");
}

/**
 * Billable weight for a title when a real category matches, else null.
 *
 * Returning null for "nothing matched" is what lets the checkout weight
 * resolver tell a category estimate apart from the generic fallback, and
 * label them differently to the customer.
 */
export function categoryWeightKg(title, hints = {}) {
  const t = String(title || "");
  const bulky = bulkyWeightKg(t);
  if (bulky != null) return bulky;
  /* Beauty is read BEFORE footwear, because the footwear detector matches
     on brand names and several of those brands also sell fragrance —
     "Puma Energy Eau de Toilette" is a 0.25 kg bottle, not a 1.30 kg pair
     of trainers. */
  const beauty = beautyWeightDetail(t, hints);
  if (beauty) return beauty.kg;
  /* Books are read BEFORE footwear for the same collision reason: the
     footwear detector matches on brand names, and a "Nike: Better is
     Temporary" hardcover is a book, not a pair of trainers. */
  const book = bookWeightKg(t);
  if (book != null) return book;
  /* Supplements before footwear for the brand-collision reason again,
     and after beauty because a "Vitamin C Serum" is skincare sold in a
     dropper bottle, not a bottle of pills. */
  const supplement = supplementWeightKg(t, hints);
  if (supplement != null) return supplement;
  // A sneaker listed by model name ("New Balance 204L") is still a sneaker.
  const shoes = footwearWeightKg(t);
  if (shoes != null) return shoes;
  // A ball's real mass and count, against the box that gets billed.
  const ball = ballWeightKg(t);
  if (ball != null) return ball;
  /* No TV branch: Danny banned TVs and TV mounts outright (2026-09-26).
     tvWeightKg stays defined below for reference only. */
  const hit = RETAIL_WEIGHT_FALLBACK_KG.find((p) => p.match.test(t) && !(p.not && p.not.test(t)));
  if (!hit) return null;
  return withBuffer(hit.kg, hit.tier);
}

/**
 * Estimated shipping weight for a scraped title.
 *
 * The chain, in order of how much it is worth trusting:
 *   1. a weight the retailer stated in the title ("4 oz") — a fact
 *   2. our category table — a reasoned guess, biased high
 *   3. the generic floor — never zero
 * (A scraped spec weight beats all three, and is applied before this is
 * ever called: see netlify/functions/_weight-resolve.js.)
 */
export function estimateWeightKg(title, hints = {}) {
  return estimateWeightDetail(title, hints).kg;
}

/**
 * The same chain, with its reasoning attached — and with the sanity
 * bounds applied at the end, so nothing implausible leaves this function.
 *
 * { kg, source: "title"|"category"|"candle"|"fallback", flagged, bound, reason }
 *
 * `flagged` means the chain produced a weight the bounds rejected: the
 * floor is used instead (never under-quote) and the caller is expected to
 * SAY SO rather than publish it quietly. That is the whole point — a
 * wrong weight is money straight off the margin, because we honour the
 * freight we quoted.
 */
export function estimateWeightDetail(title, hints = {}) {
  /* BEAUTY FIRST, ahead of the title parse (2026-09-20). A cosmetic's
     title states the VOLUME in the bottle — "Eau de Toilette 3.4 oz" —
     and reading that as a shipped weight ignores the glass, the cap and
     the box, which are most of the parcel. Everywhere else a weight the
     retailer wrote in the title is still a fact that beats any table. */
  const beauty = beautyWeightDetail(title, hints);
  /* CANDLES BEFORE THE TITLE PARSE (2026-09-25): "22 oz" on a candle is
     wax weight, not parcel weight — the glass jar is another half kilo.
     candleWeightKg beats the stated-weight path or freight is underquoted. */
  const candle = candleWeightKg(title);
  const stated = beauty || candle ? null : titleWeight(title);
  const raw = beauty ? { kg: beauty.kg, source: "beauty", beautyKey: beauty.key }
    : candle != null ? { kg: candle, source: "candle" }
    : stated ? { kg: stated.kg, source: "title" }
    : (() => {
        const category = categoryWeightKg(title, hints);
        return category != null
          ? { kg: category, source: "category" }
          : { kg: GENERIC_FALLBACK_KG, source: "fallback" };
      })();

  const check = weightSanity(title, raw.kg);
  const kg = check.kg;

  /* THREE STATES, NOT TWO (2026-09-20).

     out-of-band  the estimate is outside what this category can plausibly
                  weigh, in either direction. FAIL CLOSED: `needsReview`
                  is set, nothing may render a freight quote from it, and
                  it is kept out of Ofertas until a human fixes it.
     gap          no category row matched, so this is the generic guess.
                  Quotable (we must quote something, and it is labelled an
                  estimate) but never promoted as a deal, and printed by
                  the refresh scripts so a real row gets written.
     calibration  a beauty estimate: it HAS a row, and the row is a
                  conservative figure waiting to be checked against a real
                  parcel. Not a defect — it sells, it shows in Ofertas, and
                  it appears under its own heading in the refresh output.

     `flagged` means the first two: a human must look. Keeping
     calibration out of it is deliberate — folding every beauty item into
     the same list would bury the genuine gaps under a hundred lipsticks
     and quietly delist the entire beauty catalogue from Ofertas. */
  if (!check.ok) {
    return { kg, source: raw.source, estimated: true, flagged: true, needsReview: true,
      reviewKind: "out-of-band", bound: check.key, minKg: check.minKg, maxKg: check.maxKg,
      reason: check.reason };
  }
  if (raw.source === "fallback") {
    return { kg, source: raw.source, estimated: true, flagged: true, needsReview: false,
      reviewKind: "gap", bound: check.key, minKg: check.minKg, maxKg: check.maxKg,
      reason: `sin categoría — estimado genérico de ${kg} kg, necesita una fila de categoría` };
  }
  if (raw.source === "beauty") {
    return { kg, source: "beauty", estimated: true, flagged: false, needsReview: false,
      reviewKind: "calibration", bound: check.key, minKg: check.minKg, maxKg: check.maxKg,
      reason: `peso estimado de belleza (${raw.beautyKey}) — ${kg} kg, calibrar con el primer pedido real` };
  }
  // A category estimate is still an estimate; only a stated weight is a fact.
  return { kg, source: raw.source, estimated: raw.source !== "title", flagged: false,
    needsReview: false, reviewKind: null, bound: check.key,
    minKg: check.minKg, maxKg: check.maxKg, reason: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

function num(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function safeUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

// Mirrors normalizeLiveItem() in index.html for the fields the deals cache
// stores. Deliberately NOT a full copy — weight/size estimation lives in
// the page and is not needed here.
export function normalizeDeal(item, retailer) {
  const title = item.title || item.name || item.productTitle || item.productName || "";
  const rawPrice = num(item.price ?? item.currentPrice ?? item.salePrice ?? item.effectivePrice
    ?? item?.priceInfo?.price ?? item?.priceInfo?.currentPrice);
  const price = Number.isFinite(rawPrice) ? round2((rawPrice + tieredMarginUsd(rawPrice)) * SALES_TAX_RATE) : null;

  const rawImages = Array.isArray(item.images) ? item.images : [];
  const images = [...new Set([item.image, item.imageUrl, item.thumbnail, ...rawImages].map(safeUrl).filter(Boolean))].slice(0, 8);

  const ratingRaw = Number(item.rating ?? item.stars ?? item.reviewScore ?? item.averageRating);
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 && ratingRaw <= 5 ? Math.round(ratingRaw * 10) / 10 : null;

  const sizes = Array.isArray(item.availableSizes)
    ? item.availableSizes.filter((s) => typeof s === "string" && s.trim()).slice(0, 40)
    : [];

  const onSaleFlag = item.onSale === true || item.isOnSale === true
    || (typeof item.savingsAmount === "number" && item.savingsAmount > 0)
    || (typeof item.savingsPercent === "number" && item.savingsPercent > 0)
    || (typeof item.percentageOff === "number" && item.percentageOff > 0)
    || (typeof item.percentOff === "number" && item.percentOff > 0);

  const rawOriginal = num(item.regularPrice ?? item.wasPrice ?? item.was_price ?? item.originalPrice);
  const hasAny = onSaleFlag && Number.isFinite(rawOriginal) && Number.isFinite(rawPrice) && rawOriginal > rawPrice;
  const pct = hasAny ? Math.round((1 - rawPrice / rawOriginal) * 100) : 0;
  const isDeal = hasAny && pct >= MIN_DISCOUNT_PCT;

  if (!isDeal || !title || price == null) return null;

  /* WHAT KEEPS AN ITEM OUT OF OFERTAS (2026-09-20).

     Two things, and neither of them hides the product — both only decide
     what Ofertas may FEATURE. Everything rejected here stays fully
     available in search, in its category and in its store, freight and
     all; it is simply not presented as a deal.

     1. A WEIGHT WE DO NOT BELIEVE — an estimate outside its category's
        plausible band, or a title with no category row at all. Ofertas
        promotes a product, and promoting a price we cannot stand behind
        is the expensive mistake.

     2. FREIGHT ABOVE THE PRODUCT'S OWN PRICE. Between 50% and 100% the
        item is featured and badged, because the shopper can weigh that
        for themselves against the real figure. Past 100% there is no
        reading under which "deal" is honest: getting it here costs more
        than the thing. Badged everywhere else, never featured here.

     Freight below the ceiling is never a reason to drop anything. The old
     30% rule did, and hiding the cost is the opposite of the argument
     this shop is built on. */
  const weight = estimateWeightDetail(title);
  if (weight.flagged) return null;
  const weightKg = weight.kg;
  const freight = freightUsd(weightKg, CHARGE_PER_KG_USD);
  const share = freightShare(weightKg, price, CHARGE_PER_KG_USD);
  if (share > FREIGHT_FEATURE_CEILING) return null;

  return {
    retailer,
    title,
    price,
    originalPrice: round2((rawOriginal + tieredMarginUsd(rawOriginal)) * SALES_TAX_RATE),
    rating,
    weightKg,
    // The card must be able to say "estimado" rather than print a guess as
    // a measurement. A flagged weight never reaches this point at all —
    // it was returned null above — so anything here is quotable.
    weightEstimated: weight.estimated,
    weightSource: weight.source,
    weightReviewKind: weight.reviewKind,
    freightUsd: freight,
    /* Kept as data, not as a verdict. Nothing renders a label off this
       number any more (the "Flete alto" badge is gone — it measured
       cheapness, not weight); it is here so the refresh script and any
       later calibration can see the distribution. Anything past the
       feature ceiling never reaches this object at all. */
    freightShare: Math.round(share * 1000) / 1000,
    sizes,
    image: images[0] || null,
    images,
    onSale: true,
  };
}

// Same collapse the page does: colour/size variants of one product share a
// title, so key on retailer+title (never price) and keep the cheapest.
export function dedupeKey(retailer, title) {
  return retailer + "::" + String(title || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function collapseVariants(deals) {
  const byKey = new Map();
  for (const d of deals) {
    const k = dedupeKey(d.retailer, d.title);
    const existing = byKey.get(k);
    if (!existing || d.price < existing.price) byKey.set(k, d);
  }
  return [...byKey.values()];
}
