/* ============================================================
   WHAT A STORE PRODUCT TRULY IS (#443 c.6635296341 + c.6635303627,
   Danny's full store audit).

   Danny found it live: Parrot's «Accesorios» rail led with Vans shoes,
   its «Accesorios de Skate» held only shoes; Val Surf showed 685
   accesorios against 36 zapatillas. Surf shops sell shoes, and they
   name them the way a skate shop does -- by the model alone: «Skate
   Old Skool 195», «CLEARANCE Kyle Walker B9M», «Nike SB Zoom Janoski
   OG+ 002», «Cambridge kids KS123», «Hi-Standard OG» (a snowboard
   boot). No title says "shoe", and the store's own type field is a
   blind «Accesorios» stamp, so every classifier filed them as
   accessories.

   THE RULE (one rule, every store, never per item):
     1. footwear.js isShoeForDept -- the department's vetted classifier
        (a published footwear type, a footwear store, a shoe noun) --
        is a shoe;
     2. a FOOTWEAR HOUSE's MODEL LINE is a shoe: the brand makes shoes
        (Vans, Nike SB, Lakai, DC, UGG, Converse, Reef...) and the
        title names one of that brand's shoe models -- unless the title
        names something else (a tee, a backpack, a beanie, a sock: the
        «Old Skool Check Backpack» is a bag, «Nike SB Ishod Cargo
        Pants» are pants, Globe's «Blazer 26" Cruiser» is a board).
   The store's type field is not read for rule 2: at the surf shops it
   is a blind stamp (Parrot files a Janoski under «Polos y camisetas»
   as readily as under «Accesorios»); the veto words keep everything
   that is not a shoe out.

   And the mirror image: a GARMENT stamped «Accesorios» (Parrot's
   «2% Hijinx Hoody», «Be My Frond Skimpy Bottom», «Coastline
   Flannel») is clothing -- its head noun says so, and no accessory
   noun says otherwise.

   scripts/lib/store-reroutes.js files by these rules;
   scripts/store-audit.mjs audits every store section against them.
   ============================================================ */
import { isShoeForDept, isGarmentTail } from "./footwear.js";

/* Footwear houses and their shoe model lines (whole words, case-free).
   A model only counts under its own house: «Blazer» is a Nike shoe and
   a Globe cruiser; «Classic» is everything. */
import { SHOE_HOUSES, NOT_SHOE_WORD_RX, houseOf, headOf, FOOT_RX, lastAt, isShoeModel, GARMENT_RX } from "./shoe-models.js";
export { SHOE_HOUSES, NOT_SHOE_WORD_RX, houseOf, headOf, isShoeModel };

/* A head noun that is not a shoe, wherever a shoe word sits before it:
   the heel patch, the cold-shoe bracket, the cleaning kit, the slide bag. */
const SHOE_THING_RX = /\b(patch(es)?|brackets?|cold\s+shoe|hot\s+shoe|mounts?|cleaners?|cleaning|kits?|insoles?|deodori[sz]ers?|horns?|shoe\s+trees?|crease|protectors?|sprays?|jibbitz|covers?|organi[sz]ers?|racks?|trays?|otg|cabinets?|benches?|seats?|signs?|goggles?|liners?|completes?|surfskates?|bundles?|guards?|pillows?|flat\s+irons?|lipsticks?|devices?|seating|patio|box(es)?|ledges?|ramps?|clips?|rollers?|essences?|pumps?\s+for)\b/i;
/* Never a shoe, wherever it says one: toys, dolls, trinkets. */
/* Never a shoe, wherever it says one: toys and games. */
const NEVER_SHOE_RX = /\b(dolls?|barbie|lego|figures?|figurines?|playsets?|plush|toys?|funko|bobbleheads?|inflatable|water\s+slides?|hot\s+wheels|blasters?|darts?|socks?(?!\s+(sneakers?|boots?|booties|shoes?))|shoe\s*laces?|shoelaces?|boot[- ]?cut|bootcut)\b/i;
/* Trinkets, read as the name's head noun: «Slide Rings», a «Horseshoe»
   bracelet -- but SSENSE's «Gancini Ornament Loafers» are loafers. */
const TRINKET_RX = /\b(ornaments?|stickers?|keychains?|key\s+chains?|enamel\s+pins?|cufflinks?|slide\s+rings?|horseshoes?|bracelets?|necklaces?|earrings?|keyboards?|sunglasses|cases?|phone)\b/i;
/* Names that carry a shoe word and are not about shoes. */
const BRAND_PHRASE_RX = /\btoy\s+(machine|story)\b|\b(the\s+)?critical\s+slide\s+society\b|\btar\s+heels\b|\bslide\s+society\b/gi;


/** Is this product a shoe? `p` carries name/title, brand and the store's own type. */
export function isShoeItem(p, retailer) {
  if (!p) return false;
  const name = String(p.name || p.title || "");
  /* A garment by its head noun is a garment (Burton's «Crown ...
     Full-Zip Fleece» under the type «Guantes y botines»). */
  if (garmentFamily(name)) return false;
  const head = headNoun(name);
  if (NEVER_SHOE_RX.test(head)) return false;
  /* THE HEAD NOUN DECIDES: the last thing the name names. «Deck Boots»
     and «Suede Deck mules» are shoes; «City Hiker ... Backpack», a
     «Slide Bag», a «Shoe Cleaning Kit» are not. */
  const foot = lastAt(FOOT_RX, head);
  const thing = Math.max(lastAt(SHOE_THING_RX, head), lastAt(NOT_SHOE_WORD_RX, head), lastAt(TRINKET_RX, head));
  if (thing >= 0 && thing >= foot) return false;
  if (foot >= 0) return true;
  /* No shoe noun: the store's own footwear type (O'Neill files its
     booties «Guantes y botines»), a footwear store, DSW's shoe buckets
     (build-department-slices' own rule), a footwear house's model line. */
  if (p.type && isShoeForDept({ title: head, type: p.type }, retailer)) return true;
  if (isShoeForDept({ title: head }, retailer)) return true;
  if (retailer === "dsw" && /^(women|men|kids|footwear)$/.test(String(p.dept || "")) && !isGarmentTail(head)) return true;
  /* The surf shops' type fields are blind stamps (Parrot files its
     Janoski under «Polos y camisetas» as readily as «Accesorios»), so a
     house's model line is read from the title alone, behind its veto. */
  return isShoeModel(name, p.brand);
}

/** A product whose own head noun says it is NOT a shoe (a garment, a
    glove liner, a goggle, a cleaning kit, a toy) -- the positive evidence
    that takes it out of a shoe aisle. A shoe the rules merely fail to
    recognise («Bianka Sling») is never moved. */
export function notShoeNoun(p) {
  const name = String(p?.name || p?.title || "");
  if (garmentFamily(name)) return true;
  const head = headNoun(name);
  if (NEVER_SHOE_RX.test(head)) return true;
  /* Only a strong noun takes a product out of Zapatos (a kit, a goggle, a
     liner, a trinket), never the broad veto list: «Soccer Cleats - Road
     To Glory Pack» stays a cleat. */
  const thing = Math.max(lastAt(SHOE_THING_RX, head), lastAt(TRINKET_RX, head));
  return thing >= 0 && thing >= lastAt(FOOT_RX, head);
}
/* The words the head-noun rules read: before the colourway, before a
   «with ...» clause («sneakers with crown patch»), brand phrases out. */
function headNoun(name) {
  return headOf(name).replace(/[™®]/g, "").replace(BRAND_PHRASE_RX, " ").split(/\s+with\s+/i)[0];
}

/* ---------- garments a blind «Accesorios» stamp hid ---------- */
/* Swim first (a bikini bottom is not a pair of pants), then clothes. */
const SWIM_RX = /\b((?<!(?:base\s+layer|thermal|merino|skins?|pepperskins|layer)\s+)bot(tom)?s?\s*$|cover[- ]?ups?|rash(\s*guards?)?|bikinis?|swimsuits?|swim\s*(suits?|wear|tops?|bottoms?|trunks?|shorts?)|one[- ]piece|tankinis?|bandeau|skimpy|cheeky|cheekini|(bikini|swim|hipster|skimpy|cheeky|surf)\s+bottoms?|boardshorts?|board\s+shorts?|swim\s+trunks?|rash\s*guards?)\b/i;
/* ...unless an accessory noun or a neoprene piece says otherwise. */
const NOT_GARMENT_RX = /\b(directional|flat\s+top|camber|rocker|circuits?|testers?|cables?|keyboards?|handles?|nets?|socks?|hats?|caps?|snapbacks?|beanies?|visors?|belts?|wallets?|bags?|bookbags?|backpacks?|totes?|duffels?|keychains?|key\s*rings?|lanyards?|stickers?|magnets?|sunglasses|towels?|ponchos?|blankets?|gloves?|mitt(en)?s?|tights|cufflinks?|card\s+holders?|wetsuits?|springsuits?|spring\s+suits?|full\s*suits?|neoprene|\d(\.\d)?\s*mm|\d\/\d|hoods?\b(?!ie|y)|leash(es)?|fins?|wax|koozies?|bottles?|mugs?|tumblers?|cups?|patch(es)?|pins?|air\s+fresheners?|fresheners?|watch(es)?|jewelry|necklaces?|bracelets?|earrings?|rings?|charms?|dolls?|plush|toys?|covers?|cases?|hangers?|decks?|boards?(?!\s*shorts?)|cruisers?|surf\/skate|tote|umbrellas?|chairs?|coolers?|scarf|scarves|bandanas?|neck\s+gaiters?|gaiters?|masks?|balaclavas?|headbands?|scrunchies?|clips?|neck\s*ties?|bow\s*ties?|hair\s*ties?)\b/i;

/* A name that ends on a shoe is a shoe («Top Sandal»). */
const SHOE_TAIL_RX = /\b(sandals?|slides?|shoes?|sneakers?|boots?|booties|slippers?|clogs?|loafers?|flip[- ]?flops?)\s*$/i;
/** "trajes_bano" | "ropa" | null: a garment by its own head noun. */
export function garmentFamily(name) {
  /* What precedes the first « - » names the product («Bomber Jacket -
     Dark Wheat Boot» is a jacket); otherwise the colourway-free head. */
  const strict = String(name || "").split(/\s+[-\u2013|]\s+/)[0].trim();
  if (strict && strict !== String(name || "").trim()) { const g = garmentOf(strict); if (g) return g; }
  return garmentOf(headOf(name));
}
function garmentOf(n) {
  if (!n || NOT_GARMENT_RX.test(n) || SHOE_TAIL_RX.test(n)) return null;
  const fam = SWIM_RX.test(n) ? "trajes_bano" : GARMENT_RX.test(n) ? "ropa" : null;
  if (!fam) return null;
  /* The head noun is the last one: «Western Boots Crew Fleece» is a
     fleece, «Ankle Boots Fleece Lined ... Style Boots» are boots. */
  const g = Math.max(lastAt(SWIM_RX, n), lastAt(GARMENT_RX, n));
  return lastAt(FOOT_RX, n) > g ? null : fam;
}

/* ---------- what a section's label promises ---------- */
const SHOE_LABEL_RX = /^(zapat|calzado|sandalias|botas|chimpunes|pantuflas|mocasines|tacones|vestir\b|más zapatos|shoes?\b|footwear)/i;
const ACC_LABEL_RX = /^(accesorios|más accesorios|repuestos y accesorios|medias y accesorios)/i;
const ROPA_LABEL_RX = /^(ropa(?! de baño)|tops|blusas|polos|camisetas|pantalones|chompas|casacas|vestidos|denim|conjuntos|shorts|lencería)/i;
/* Mixed by nature: the deals, a brand, the tail, and a SPORT (a «Tenis»
   or «Fútbol» section sells the sport's shoes with its rackets). */
const MIXED_LABEL_RX = /^(ofertas|destacados|más vendidos|más de |más productos|todo|ver todo|tenis$|fútbol$|futbol$|pádel$|padel$|golf$|running$|básquet$|béisbol$)/i;
/** "shoe" | "accesorios" | "ropa" | "other" | "mixed" */
export function sectionKind(label) {
  const t = String(label || "").trim();
  if (!t || MIXED_LABEL_RX.test(t)) return "mixed";
  if (SHOE_LABEL_RX.test(t)) return "shoe";
  if (ACC_LABEL_RX.test(t)) return "accesorios";
  if (ROPA_LABEL_RX.test(t)) return "ropa";
  return "other";
}
