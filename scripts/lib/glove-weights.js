/* ============================================================
   COMBAT GLOVES, FLAT BY THE PAIR (#443 c.6648881889, corrected by
   c.6648728121 -- Danny's flat billing rule, which supersedes the
   per-ounce math).

     a BOXING glove pair  weighs 1.00 kg
     an MMA glove pair    weighs 0.50 kg

   No judgment calls: a listing that is a boxing glove pair is 1.00, an
   MMA pair is 0.50, whatever the store or the title's ounces say. This
   module is the one place that decides what a glove pair is. The same
   function answers the catalogue sweep (scripts/apply-glove-weights.mjs),
   the checkout and product-page resolver
   (netlify/functions/_weight-resolve.js) and, through its mirror in the
   app bundle (gloveFlatOfTitle), the card's weight line -- so a pair
   weighs the same on the card, on the product page and at checkout.

   WHAT DECIDES. The TITLE decides that a listing is a glove pair and
   which class it is: it is the one thing every surface has (a cart line
   carries no store type). The store's own type and the shared
   product-type classifier (product-type.js) may only VETO -- a store
   that files a listing as a T-shirt, a key chain or a charm, or a
   product family that is not sporting goods or accessories, is not a
   glove pair. scripts/test/glove-weights-tests.mjs proves over every
   committed catalogue that the vetoes never change the title's answer,
   so the title-only surfaces agree with the sweep.

   THE RULE, IN ORDER
     1. It names a glove: "glove(s)", "guante(s)", or a "bag mitt".
     2. Nothing excludes it (first match wins, and is the reason given):
          hand-wraps     wraps, quick wraps, glove wraps, vendas
          inner-gloves   inner gloves, undergloves, glove liners
          mitts-pads     focus / punch / target / Thai mitts, any pads,
                         manoplas, paos ("bag mitts" are not this: see 4)
          bundle         a kit, bundle, set, combo, pack, "4 pc", or
                         gloves sold with shoes / wraps / headgear
          single         a glove sold singly: "single", "sold
                         individually", "left/right hand only", "each"
          toy-novelty    toys, dolls, plush, costumes, minis, key chains,
                         ornaments, charms, earrings, mirror hangers
          apparel-print  a tee, shirt, hoodie, hat, sock, poster,
                         sticker or mug that prints the word "gloves"
          accessory      a thing FOR gloves: bags, deodorizers, dryers,
                         sprays, hangers, cases, a car's glove box
          non-combat     gardening, work, nitrile, oven, cycling, winter,
                         ski, driving, dress, batting, goalkeeper, golf,
                         motorcycle, wetsuit, Body Glove (a surf brand)
     3. It is a combat glove. MMA words win over boxing words:
          MMA     "mma", "grappling", "ufc", "guantes de mma"; and
                  "fight gloves" / "hybrid gloves" when no boxing word
                  is present ("Pro Boxing Fight Gloves" is boxing)
          boxing  "boxing", "boxeo", "box gloves", "guantes de box",
                  "muay thai", "kickboxing", "sparring", "bag gloves",
                  "bag mitts", "pro style", "lace up" / "laced"
        Fitness words (gym, workout, lifting, fitness, exercise,
        fingerless, half finger, plain "training") are not combat words:
        a "training glove" with none of the words above is a gym glove.
     4. EDGE CASES, decided by the rule above (EDGE_CASES below lists
        each with its answer; the tests assert every one):
          "bag mitts"            boxing: a bag glove by another name, a
                                 pair worn on the hands (not a pad).
          "focus mitts"          excluded: a pad the coach holds.
          "open palm / open fingered gloves" with no MMA word
                                 not a combat glove: fashion stores sell
                                 "open fingered gloves" too, and a cart
                                 line cannot tell them apart.
          kids' / youth gloves   a real pair of boxing gloves for a child
                                 is a boxing pair (1.00); a toy is not.
          "Kickboxing" filed by the store as MMA_GLOVES
                                 boxing: the title outranks the aisle.
          "Hybrid 25 Boxing Gloves"
                                 boxing: "hybrid" is a model name there;
                                 only "hybrid glove(s)" side by side is
                                 the MMA hybrid.
          a single "Glove" in the name ("Titan Pro MMA Glove")
                                 a pair: stores name a pair in the
                                 singular; only explicit single-sale
                                 wording excludes.

   The weight is billed, not estimated: the listing is marked
   weightBasis "gloveFlat" and keeps weightEstimated true (it is not a
   scale reading the store published).
   ============================================================ */

export const GLOVE_FLAT_KG = Object.freeze({ boxing: 1.0, mma: 0.5 });
export const GLOVE_BASIS = "gloveFlat";

/** Lower case, accents off, curly quotes straight, "_" and "/" as spaces. */
export function gloveText(s) {
  return String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"')
    .replace(/[_/]+/g, " ")
    .toLowerCase();
}

const NAMES_GLOVE = /\b(gloves?|guantes?)\b|\bbag\s*mitts?\b/;

/* Step 2, in order: the first that matches is the reason. */
export const GLOVE_EXCLUSIONS = Object.freeze([
  ["hand-wraps", /\bwraps?\b|\bvendas?\b|\bvendajes?\b/],
  ["inner-gloves", /\binner\s*gloves?\b|\bunder\s*-?\s*gloves?\b|\bglove\s*liners?\b|\bliners?\b|\bguantes?\s+interiores?\b/],
  ["mitts-pads", /\b(?:focus|punch(?:ing)?|target|coach(?:ing)?|thai|kick|strike|speed|hook\s*(?:and|&)\s*jab)\s*mitts?\b|\bmitts?\b(?<!\bbag\s*mitts?)|\bpads?\b|\bmanoplas?\b|\bpaos?\b|\bescudos?\b/],
  ["bundle", /\b(?:bundles?|kits?|sets?|combos?|packs?|pairs?\s+of\s+\d|\d+\s*-?\s*(?:pc|pcs|pieces?|piezas?)|\d+\s*-?\s*pk)\b|\b(?:and|with|\+|&|y)\s+(?:\w+\s+){0,3}(?:hand\s*wraps?|wraps?|shoes?|headgear|head\s*guard|mouth\s*guard|bag|zapatillas?)\b|\bshoe\b/],
  ["single", /\bsingle\b|\bsold\s+(?:individually|separately|singly|as\s+(?:a\s+)?single)\b|\b(?:left|right)\s*-?\s*hand(?:ed)?\s+only\b|\bone\s+glove\b|\b(?:each|per\s+glove|unidad)\b|\(1\)/],
  ["toy-novelty", /\b(?:toys?|juguetes?|dolls?|munecas?|barbie|plush|peluche|inflatable|costumes?|disfra(?:z|ces)|novelty|mini|miniatures?|keychains?|key\s*chains?|key\s*rings?|llaveros?|ornaments?|charms?|earrings?|necklaces?|pendants?|figures?|figurines?|(?:rear\s*view\s*)?mirror)\b/],
  ["apparel-print", /\b(?:t\s*-?\s*shirts?|tees?|shirts?|hoodies?|sweatshirts?|tank\s*tops?|hats?|caps?|beanies?|socks?|posters?|stickers?|decals?|mugs?|polos?|camisetas?|poleras?)\b/],
  ["accessory", /\bgloves?\s+(?:bags?|backpacks?|deodori[sz]ers?|dryers?|fresheners?|inserts?|sprays?|hangers?|holders?|racks?|cleaners?|covers?|cases?|tape|laces|boxes?|box|cubby|mounts?|compartments?|clips?)\b|\b(?:bags?|backpacks?|duffels?)\s+for\s+(?:\w+\s+){0,2}gloves?\b/],
  ["non-combat", /\b(?:garden(?:ing)?|jardin(?:eria)?|work|trabajo|nitrile|nitrilo|exam|latex|disposable|desechables?|cleaning|dish(?:washing)?|kitchen|oven|bbq|grill|cycling|bike|bicycle|mtb|ciclismo|winter|invierno|ski|snow|thermal|touch\s*screen|driving|dress|fashion|evening|opera|bridal|batting|baseball|softball|beisbol|goal\s*keeper|goalkeeper|goalie|arquero|portero|golf|motorcycle|moto|motocross|dirt\s*bike|racing|wetsuit|neopreno|neoprene|surf|dive|diving|buceo|reef|body\s*glove|football|receiver|lacrosse|hockey|racquetball|archery|hunting|fishing|tactical|rowing|sailing|equestrian|riding)\b/],
]);

const MMA_WORDS = /\bmma\b|\bgrappling\b|\bufc\b|\bguantes?\s+(?:de\s+)?mma\b/;
/* Weaker MMA words: an MMA glove when no boxing word says otherwise
   ("Pro Boxing Fight Gloves" is a boxing glove). */
const MMA_WEAK_WORDS = /\bfight\s*gloves?\b|\bhybrid\s*gloves?\b/;
const BOXING_WORDS = /\bboxing\b|\bboxeo\b|\bbox\s+gloves?\b|\bguantes?\s+de\s+box\b|\bmuay\s*thai\b|\bkick\s*-?\s*boxing\b|\bsparring\b|\bbag\s*(?:gloves?|mitts?)\b|\bpro\s*-?\s*style\b|\blace\s*-?\s*up\b|\blaced\b/;

/* What the title alone says. { cls: "boxing" | "mma" | null, reason }.
   reason names the rule: "mma" / "boxing" when it is a pair, else the
   exclusion, "no-glove" or "no-combat-word". */
export function gloveClassOfTitle(title) {
  const t = gloveText(title);
  if (!NAMES_GLOVE.test(t)) return { cls: null, reason: "no-glove" };
  for (const [reason, rx] of GLOVE_EXCLUSIONS) if (rx.test(t)) return { cls: null, reason };
  if (MMA_WORDS.test(t)) return { cls: "mma", reason: "mma" };
  if (BOXING_WORDS.test(t)) return { cls: "boxing", reason: "boxing" };
  if (MMA_WEAK_WORDS.test(t)) return { cls: "mma", reason: "mma" };
  return { cls: null, reason: "no-combat-word" };
}

/* Store types that name a different product. A glove pair is never
   filed as one of these, so the store's own type vetoes. The aisle a
   store uses for fitness or combat gear ("FITNESS_TRAINING", "GEAR",
   "accessories") is not a product and does not veto. */
const NOT_A_GLOVE_TYPE = /\b(?:t\s*-?\s*shirts?|tees?|tops?|camisas?|camisetas?|polos?|hoodies?|sweatshirts?|key\s*chains?|charms?|bag\s*charms?|earrings?|necklaces?|bracelets?|rings?|jewelry|joyeria|wetsuits?|trajes\s+de\s+neopreno|swimsuits?|sneakers?|shoes?|zapatillas?|heels?|boots?|flats|loafers|slippers|jeans|dress(?:es)?|skirts?|figura(?:s)?(?:\s+coleccionables?)?|toys?|juguetes?|headprotectivegear|head\s*protective\s*gear|tires|skateboards?|decks?|longboards?)\b/;
/* The product families a glove pair can belong to in the shared
   classifier (product-type.js): sporting goods, accessories, and the
   catch-all it answers when nothing else claims a listing. */
export const GLOVE_FAMILIES = Object.freeze(["deportes", "accesorios", "ropa"]);

/**
 * The listing's glove class: { cls, kg, reason, vetoedBy }.
 * item: { title|name, type, retailer, brand }.
 * opts.productType: the shared classifier (globalThis.AriaProductType),
 * when the caller has it loaded; without it only the store type vetoes.
 */
export function gloveClass(item, opts = {}) {
  const title = String(item?.title ?? item?.name ?? "");
  const byTitle = gloveClassOfTitle(title);
  if (!byTitle.cls) return { cls: null, kg: null, reason: byTitle.reason, vetoedBy: null };
  const type = gloveText(item?.type);
  if (type && NOT_A_GLOVE_TYPE.test(type)) return { cls: null, kg: null, reason: "store-type", vetoedBy: "type:" + String(item.type) };
  const PT = opts.productType;
  if (PT && typeof PT.classify === "function") {
    const fam = PT.classify({ title, name: title, type: item?.type, brand: item?.brand, retailer: item?.retailer }, item?.retailer);
    if (fam && !GLOVE_FAMILIES.includes(fam)) return { cls: null, kg: null, reason: "product-type", vetoedBy: "family:" + fam };
  }
  return { cls: byTitle.cls, kg: GLOVE_FLAT_KG[byTitle.cls], reason: byTitle.reason, vetoedBy: null };
}

/** The flat weight a line is billed at, or null when it is not a glove pair. */
export function gloveFlatKg(item, opts) {
  return gloveClass(item, opts).kg;
}

/* The edge cases, with the answer the rule gives. The tests assert each
   one, and the report lists them. */
export const EDGE_CASES = Object.freeze([
  ["Everlast Pro Style Bag Mitts", "boxing", "a bag mitt is a bag glove: a pair worn on the hands"],
  ["Century Brave Grip Bag Gloves", "boxing", "bag gloves are boxing gloves"],
  ["Fairtex FMV9 Contoured Focus Mitts", null, "focus mitts are a pad the coach holds"],
  ["adidas Combat 50 Focus Mitts", null, "focus mitts are a pad the coach holds"],
  ["Venum Gel Kontact Quick Wraps - Black/Red", null, "quick wraps are hand wraps"],
  ["Gel Glove Wraps - Black/White", null, "glove wraps are hand wraps"],
  ["Everlast Inner Gloves", null, "inner gloves are worn under the glove"],
  ["Tapout 4 PC Boxing Gloves Pad Kit", null, "a kit is not one glove pair: it ships heavier"],
  ["Powerlock OG Laced Training Gloves and 1910 Hand Wraps", null, "gloves sold with hand wraps are a bundle"],
  ["Black Elite Boxing Shoe, Glove and Hand Wrap Bundle", null, "a bundle"],
  ["Ringside Single Boxing Glove - Left Hand Only", null, "a glove sold singly"],
  ["Barbie Boxer Brunette Doll With Boxing Outfit And Pink Boxing Gloves", null, "a toy"],
  ["Everlast X Hoonigan Rear View Mirror Gloves", null, "a mirror hanger"],
  ["Real Ones Boxing Gloves Tee", null, "a T-shirt printed with the word"],
  ["Venum HyperLift 2.0 Weightlifting Gloves", null, "lifting gloves: no combat word"],
  ["Mitchell Training Gloves 2.0 - Black/Gray", null, "a plain training glove is a gym glove"],
  ["Black Open Fingered Gloves", null, "open fingered with no MMA word: fashion stores sell these too"],
  ["Century Youth Brave Open Palm Gloves", null, "open palm with no MMA word (flagged in the report)"],
  ["Venum Contender 1.5 Kids Boxing Gloves", "boxing", "a real pair for a child is a boxing pair"],
  ["Kickboxing Gloves Pink", "boxing", "the title outranks the store's MMA_GLOVES aisle"],
  ["adidas Youth Hybrid 25 Boxing Gloves", "boxing", "hybrid is a model name here"],
  ["FUJI Ultimate Hybrid Gloves", "mma", "hybrid gloves are the MMA hybrid"],
  ["Titan Pro MMA Glove", "mma", "a pair named in the singular"],
  ["Ely MMA Sparring Gloves - Black/White", "mma", "MMA words win over sparring"],
  ["Ringside Pro Style Training Gloves", "boxing", "pro style is a boxing glove"],
  ["Guantes de boxeo profesionales", "boxing", "Spanish: guantes de boxeo"],
  ["Guantes de MMA de entrenamiento", "mma", "Spanish: guantes de MMA"],
  ["Glove Box Mount", null, "a car's glove box"],
  ["adidas Predator GL Pro Hybrid PC Goalkeeper Gloves", null, "goalkeeper gloves"],
  ["Body Glove Men's Pro 3 2mm Spring Wetsuit", null, "Body Glove is a surf brand"],
]);
