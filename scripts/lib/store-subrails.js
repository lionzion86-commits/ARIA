/* ============================================================
   SUB-CAROUSELS (#443 c.6458236993 Part 2, c.6458506223): a multi-
   family set opens into LABELLED SUB-CAROUSELS, never one
   undifferentiated grid. Audience first (Mujer / Hombre / Niños), then
   type: Zapatos opens into Zapatillas, Sandalias, Pantuflas, Vestir,
   Botas...; Ropa, Accesorios, Joyas and Carteras the same way; a Hogar
   pill (Walmart) into Ropa de cama, Toallas, Baño, Cocina, Cestas y
   organización, Lámparas, Decoración.

   ONLY AISLES THE DATA FILLS. An aisle needs SUB_MIN products, an
   audience axis needs two audiences that each fill one, and a split
   needs two carousels; otherwise the set stays one grid. Whatever no
   aisle claims is in the "ver todo junto" grid under the carousels,
   as is everything else: nothing is hidden.

   Audience comes from the data, never a guess: the title first (kids
   wins), then the store's own gender facet or type, then the bucket it
   was scraped from. Unisex (or silent) shoes sit in both adult
   carousels, as Danny ruled for shoes ("the ones that are unisex can go
   in both carousels"); any other piece whose audience the data does
   not state is left to the grid, never guessed into one.
   ============================================================ */
import { footwearClass, shoeGender } from "./footwear.js";
import { genderFromTitle } from "./department-map.js";
import { subcategoryOfItem } from "./subcategories.js";

export const SUB_MIN = 4;
const KNOWN_AUDIENCE_SHARE = 0.5;
const AUDIENCE_MIN_SHARE = 0.05;
export const AUDIENCES = [["women", "Mujer"], ["men", "Hombre"], ["kids", "Niños"]];

/* ---------- audience ---------- */
const PINK_BRAND = /\bpink\b/i;
const BUCKET_KIDS_RX = /(^|[_\-\s])(kids?|baby|babies|boys?|girls?|toddlers?|ninos?|niñas?|youth|juniors?)([_\-\s]|$)/i;
const BUCKET_WOMEN_RX = /(^|[_\-\s])(women|womens|mujer|ladies|her)([_\-\s]|$)/i;
const BUCKET_MEN_RX = /(^|[_\-\s])(men|mens|hombre|him)([_\-\s]|$)/i;
const FACET_GENDER = { Mujer: "women", Hombre: "men", "Niños": "kids", Unisex: null };
const NAME_UNISEX_RX = /\bunisex\b/i;
/* department-map.js's markers, widened to the words store titles use
   ("Dresses for Women", "Ladies", "Boys"); a title naming both adults
   ("Women Men Shoes") is unisex. Kids win only alone: a piece "for
   Women and Girls" is a women's piece (shoes keep footwear.js's rule). */
const NAME_KIDS_RX = /\b(kids?|boys?|girls?|toddlers?|infants?|ni[ñn][oa]s?|newborns?|youth|baby\s+(boys?|girls?)|little\s+kids?|big\s+kids?)\b|\b(boy|girl)['’]s\b/i;
const NAME_WOMEN_RX = /\b(women|womens|woman|ladies|lady|mujer(es)?|damas?|maternity)\b|\bwomen['’]s\b/i;
const NAME_MEN_RX = /\b(men|mens|hombres?|caballeros?)\b|\bmen['’]s\b/i;
function titleAudience(name) {
  const w = NAME_WOMEN_RX.test(name), m = NAME_MEN_RX.test(name);
  /* "Necklace for Women and Girls" is an adult piece sold to both. */
  if (NAME_KIDS_RX.test(name) && !w && !m) return "kids";
  if (w && m) return "both";
  return w ? "women" : m ? "men" : genderFromTitle(name);
}

/** "women", "men", "kids" or null (unisex, or the data says nothing). */
export function audienceOf(item, family) {
  const name = String(item?.name || item?.title || "");
  if (family === "zapatos") {
    const g = shoeGender({ title: name, type: item?.type }, item?.dept);
    return g === "unisex" ? null : g;
  }
  if (PINK_BRAND.test(String(item?.brand || ""))) return "women";
  if (NAME_UNISEX_RX.test(name)) return null;
  const t = titleAudience(name);
  if (t) return t === "both" ? null : t;
  if (item?.gender && item.gender in FACET_GENDER) return FACET_GENDER[item.gender];
  const d = String(item?.dept || "");
  if (BUCKET_KIDS_RX.test(d)) return "kids";
  if (BUCKET_WOMEN_RX.test(d)) return "women";
  if (BUCKET_MEN_RX.test(d)) return "men";
  return null;
}

/* ---------- type, one table per family ---------- */
const rules = (list) => list.map(([k, label, rx]) => ({ k, label, rx }));
const firstRule = (table, text) => { for (const r of table) if (r.rx && r.rx.test(text)) return r.k; return null; };
/* A home title names its product first ("Bud Vase Set ... for
   Bathroom", "Wall Art ... Bathroom Decor"): the rule matching earliest
   wins, the table's order breaking ties. */
const HOME_MASK_RX = /\bjack[- ]?o['’]?[- ]?lanterns?\b|\b(halloween|thanksgiving|easter|wedding|birthday|party)\b/gi;
function earliestRule(table, text) {
  const t = String(text || "").replace(HOME_MASK_RX, (m) => " ".repeat(m.length));
  let best = null, at = Infinity;
  for (const r of table) { const m = r.rx.exec(t); if (m && m.index < at) { best = r.k; at = m.index; } }
  return best;
}

/* Zapatos: footwear.js's classes in the doctrine's words. Heels and
   dress shoes are "Vestir"; a shoe that names no style is left to the grid. */
const DRESS_SHOE_RX = /\b(oxfords?|derby|derbies|brogues?|dress\s+shoes?|wingtips?|monk\s*straps?|flats?|ballet|ballerinas?|mary\s*janes?|pumps?|kitten|slingbacks?|d'orsay)\b/i;
const SHOE_AISLES = rules([
  ["zapatillas", "Zapatillas"], ["sandalias", "Sandalias"], ["pantuflas", "Pantuflas y mocasines"],
  ["vestir", "Vestir"], ["botas", "Botas"], ["chimpunes", "Chimpunes"],
]);
const SHOE_CLASS_AISLE = { Zapatillas: "zapatillas", Sandalias: "sandalias", "Mocasines y pantuflas": "pantuflas",
  Tacones: "vestir", "Botas y botines": "botas", Chimpunes: "chimpunes" };
function shoeAisle(item) {
  const cls = footwearClass({ title: item.name, type: item.type }, item.retailer);
  if (SHOE_CLASS_AISLE[cls]) return SHOE_CLASS_AISLE[cls];
  return DRESS_SHOE_RX.test(item.name) ? "vestir" : null;
}

/* Ropa: subcategories.js's aisles, in its editorial order (lingerie
   last); the title decides when the store sent no type. Order of the
   tests matters: a pajama set is sleepwear, a sweatshirt not a shirt,
   a shirt jacket a jacket, denim shorts jeans. */
const GARMENT_AISLES = rules([
  ["dresses", "Vestidos y faldas"], ["tops", "Tops y blusas"], ["knitwear", "Chompas y polerones"],
  ["jeans", "Jeans"], ["pants", "Pantalones y shorts"], ["outerwear", "Casacas y abrigos"],
  ["sets", "Conjuntos y enterizos"], ["swim", "Ropa de baño"], ["lingerie", "Ropa interior y pijamas"],
]);
const GARMENT_RULES = rules([
  ["lingerie", "", /\b(bras?|bralettes?|panty|panties|underwear|boxers?|briefs?|lingerie|pajamas?|pyjamas?|sleep\w*|night\s*gowns?|nightgowns?|robes?|socks?|hosiery|tights|loungewear|shapewear|thongs?|camisoles?|undershirts?|long\s+johns|thermal)\b/i],
  ["swim", "", /\b(swim\w*|bikinis?|trunks|board\s*shorts|boardshorts|rash\s*guards?|cover[- ]?ups?|tankinis?|one[- ]piece)\b/i],
  ["sets", "", /\b(jumpsuits?|rompers?|overalls?|tracksuits?|(two|2|three|3)[- ]piece|outfits?|sets?|suits?|playsuits?|coveralls?)\b/i],
  ["dresses", "", /\b(dress(es)?(?!\s+(shirts?|shoes?|pants|slacks|socks|boots?|belts?))|skirts?|skort|gowns?|vestidos?|faldas?)\b/i],
  ["jeans", "", /\b(jeans?|denim)\b/i],
  ["outerwear", "", /\b(jackets?|coats?|blazers?|vests?|gilets?|parkas?|puffers?|windbreakers?|anoraks?|shackets?|ponchos?|casacas?|raincoats?|trench)\b/i],
  ["knitwear", "", /\b(sweaters?|sweatshirts?|hoodies?|hoody|cardigans?|pullovers?|fleece|crew\s*necks?|crewnecks?|turtlenecks?|quarter[- ]zip|half[- ]zip|1\/4[- ]zip|jumpers?|knit)\b/i],
  ["pants", "", /\b(pants|shorts|trousers|leggings?|joggers?|sweatpants|chinos?|capris?|cargos?|bermudas?|culottes|pantal[oó]n(es)?|flares?|bike\s+shorts?)\b/i],
  ["tops", "", /\b(t-?shirts?|tees?|shirts?|tops?|blouses?|polos?|tanks?|camis?|henleys?|bodysuits?|tunics?|jerseys?|crop|button[- ]?(up|down)s?|camisas?|blusas?|polera)\b/i],
]);
function garmentAisle(item) {
  return firstRule(GARMENT_RULES, item.name) || subcategoryOfItem(item);
}

const ACCESSORY_AISLES = rules([
  ["lentes", "Lentes de sol", /\b(sunglass(es)?|shades|gafas|lentes|eyewear|aviators?)\b/i],
  ["gorras", "Gorras y sombreros", /\b(hats?|caps?|beanies?|visors?|fedoras?|bucket\s+hat|snapback|trucker|gorras?|sombreros?|balaclava)\b/i],
  ["cinturones", "Cinturones", /\b(belts?|cinturón|cinturones)\b/i],
  ["billeteras", "Billeteras y tarjeteros", /\b(wallets?|card\s*(holders?|cases?)|coin\s+purses?|billeteras?|money\s+clips?)\b/i],
  ["bufandas", "Bufandas y guantes", /\b(scarf|scarves|gloves?|mittens?|shawls?|wraps?|pashminas?|bufandas?|guantes?|ear\s*muffs?|earmuffs?)\b/i],
  ["corbatas", "Corbatas y pañuelos", /\b((?<!hair\s)ties|neckties?|bow\s*ties?|pocket\s+squares?|bandanas?|corbatas?)\b/i],
  ["pelo", "Accesorios para el pelo", /\b(hair|scrunchies?|headbands?|claw\s+clips?|barrettes?|bobby\s+pins?|hair\s+ties?|bows?)\b/i],
  ["relojes", "Relojes", /\b(watch(es)?|smartwatch|relojes?)\b/i],
  ["medias", "Medias", /\b(socks?|medias?|calcetines?)\b/i],
  ["llaveros", "Llaveros y charms", /\b(key\s*chains?|keychains?|key\s*rings?|bag\s+charms?|llaveros?|lanyards?)\b/i],
]);
const JEWELRY_AISLES = rules([
  ["sets", "Sets", /\b(jewelry\s+sets?|gift\s+sets?|sets?\s+of\s+\d|\d[- ]piece|necklace\s+and\s+earrings?|earrings?\s+and\s+necklace)\b/i],
  ["relojes", "Relojes", /\b(watch(es)?|relojes?)\b/i],
  ["aretes", "Aretes", /\b(earrings?|studs?|hoops?|huggies?|ear\s+cuffs?|climbers?|aretes?|pendientes?)\b/i],
  ["pulseras", "Pulseras y tobilleras", /\b(bracelets?|bangles?|cuffs?|anklets?|pulseras?|tobilleras?)\b/i],
  ["collares", "Collares y dijes", /\b(necklaces?|pendants?|chains?|chokers?|lockets?|charms?|collares?|dijes?)\b/i],
  ["anillos", "Anillos", /\b(rings?|bands?|anillos?|sortijas?)\b/i],
  ["broches", "Broches y pines", /\b(brooch(es)?|pins?|broches?)\b/i],
]);
const BAG_AISLES = rules([
  ["mochilas", "Mochilas", /\b(backpacks?|mochilas?|rucksacks?)\b/i],
  ["viaje", "Viaje y deporte", /\b(duffels?|duffle|luggage|suitcases?|carry[- ]on|travel|weekender|gym\s+bags?|maletas?)\b/i],
  ["loncheras", "Loncheras", /\b(lunch\s*(bags?|box(es)?)|loncheras?|bento)\b/i],
  ["pequenas", "Billeteras y estuches", /\b(wallets?|card\s*(holders?|cases?)|pouch(es)?|cosmetic|makeup\s+bags?|pencil\s+cases?|coin\s+purses?|estuches?)\b/i],
  ["carteras", "Carteras y bolsos", /\b(handbags?|purses?|totes?|crossbody|cross-body|shoulder\s+bags?|satchels?|clutch(es)?|hobo|bucket\s+bags?|belt\s+bags?|fanny|sling|bags?|carteras?|bolsos?)\b/i],
]);
/* Hogar: the store's floor, as Walmart walks it; Mesa y vajilla, Velas
   and Navidad (Casa Aria's aisles) when the data fills them. A throw
   blanket is bedding, a throw pillow decor. */
const HOME_RULES = rules([
  ["navidad", "", /\b(christmas|xmas|ornaments?|wreaths?|garlands?|nativity|advent|nutcrackers?|stockings?|navidad|santa)\b/i],
  ["velas", "", /\b(candles?|diffusers?|wax\s+melts?|room\s+sprays?|incense|tea\s*lights?|tealights?|votives?|lanterns?|velas?)\b/i],
  ["banio", "", /\b(shower|toilet|bath\s*(mats?|rugs?|accessor\w*|sets?|caddy|caddies)|bathroom|soap\s+(dispensers?|dish(es)?)|toothbrush|vanity|plunger)\b/i],
  ["cocina", "", /\b(kitchen|cookware|bakeware|baking|frying|fry\s+pans?|skillets?|saucepans?|stock\s*pots?|dutch\s+ovens?|knives|knife|cutting\s+boards?|utensils?|spatulas?|whisks?|ladles?|tongs|colanders?|strainers?|dish\s+racks?|drying\s+racks?|paper\s+towel|food\s+storage|containers?|lunch\s*box|measuring|mixing\s+bowls?|can\s+openers?|peelers?|graters?|kettles?|aprons?|oven\s+mitts?|pot\s+holders?|trivets?|cocina)\b/i],
  ["cama", "", /\b(sheets?|comforters?|duvets?|quilts?|bedding|bedspreads?|coverlets?|pillow\s*cases?|pillowcases?|bed\s+pillows?|mattress|blankets?|throws?(?!\s+pillows?)|shams?|bed\s+skirts?|sábanas?|edredones?|frazadas?)\b/i],
  ["toallas", "", /\b(towels?|washcloths?|toallas?)\b/i],
  ["mesa", "", /\b(plates?|bowls?|mugs?|cups?|glass(es|ware)?|flatware|silverware|cutlery|dinnerware|drinkware|tumblers?|napkins?|placemats?|tablecloths?|table\s+runners?|serving|platters?|pitchers?|coasters?|wine|champagne|carafes?|teapots?)\b/i],
  ["organizacion", "", /\b(baskets?|bins?|storage|organi[sz]ers?|hangers?|hooks?|shelf|shelves|drawers?|hampers?|laundry|closet|racks?|caddy|caddies|totes?|canisters?|cestas?)\b/i],
  ["lamparas", "", /\b(lamps?|lights?|lighting|bulbs?|sconces?|chandeliers?|night\s*lights?|lámparas?)\b/i],
  ["decoracion", "", /\b(decor\w*|vases?|frames?|wall\s+art|art|mirrors?|artificial|faux|flowers?|plants?|planters?|signs?|figurines?|sculptures?|clocks?|curtains?|rugs?|pillows?|cushions?|bookends?|statues?|wall\s+(hangings?|decals?)|tapestr(y|ies)|cojines?)\b/i],
]);
const HOME_AISLES = rules([
  ["cama", "Ropa de cama"], ["toallas", "Toallas"], ["banio", "Baño"], ["cocina", "Cocina"], ["mesa", "Mesa y vajilla"],
  ["organizacion", "Cestas y organización"], ["lamparas", "Lámparas"], ["velas", "Velas y aromas"],
  ["decoracion", "Decoración"], ["navidad", "Navidad"],
]);

/* Which families split, how, and whether they have an audience axis.
   A family not here (Juguetes, Belleza, Electrónica...) is a single
   topic and stays one grid. */
export const SUB_TAXONOMY = {
  zapatos: { label: "Zapatos", audience: true, aisles: SHOE_AISLES, aisle: shoeAisle },
  ropa: { label: "Ropa", audience: true, aisles: GARMENT_AISLES, aisle: garmentAisle },
  trajes_bano: { label: "Trajes de baño", audience: true, aisles: [], aisle: () => null },
  accesorios: { label: "Accesorios", audience: true, aisles: ACCESSORY_AISLES, aisle: (p) => firstRule(ACCESSORY_AISLES, p.name) },
  sombreros: { label: "Sombreros", audience: true, aisles: [], aisle: () => null },
  joyas: { label: "Joyas", audience: true, aisles: JEWELRY_AISLES, aisle: (p) => firstRule(JEWELRY_AISLES, p.name) },
  carteras: { label: "Carteras y mochilas", audience: true, aisles: BAG_AISLES, aisle: (p) => firstRule(BAG_AISLES, p.name) },
  hogar: { label: "Hogar", audience: false, aisles: HOME_AISLES, aisle: (p) => earliestRule(HOME_RULES, p.name) },
};

/* The carousels a set of products opens into, in the order shown, or
   null when it stays one grid. `items` keep the set's own order (sale
   depth first), so each carousel leads with its best offers. */
export function subRails(items, family) {
  const tax = SUB_TAXONOMY[family];
  if (!tax || items.length < SUB_MIN * 2) return null;
  const aisleOf = new Map(items.map((p) => [p, tax.aisle(p)]));
  let groups = [[null, null, items]];
  if (tax.audience) {
    const aud = new Map(items.map((p) => [p, audienceOf(p, family)]));
    const known = items.filter((p) => aud.get(p)).length;
    /* Unisex shoes sit in both adult carousels (Danny's ruling for
       shoes); any other piece the data does not place stays in the
       grid rather than in a guessed audience. */
    const both = family === "zapatos";
    const by = AUDIENCES.map(([k, label]) => [k, label, items.filter((p) => aud.get(p) === k || (both && !aud.get(p) && k !== "kids"))]);
    /* An audience is a section only when it is a real share of the set:
       five men's pieces in a women's department are not a "Hombre". */
    const floor = Math.max(SUB_MIN, Math.ceil(items.length * AUDIENCE_MIN_SHARE));
    const filled = by.filter(([, , list]) => list.length >= floor);
    if (known / items.length >= KNOWN_AUDIENCE_SHARE && filled.length >= 2) groups = filled;
  }
  const out = [];
  for (const [ak, alabel, list] of groups) {
    const mine = [];
    for (const a of tax.aisles) {
      const sub = list.filter((p) => aisleOf.get(p) === a.k);
      if (sub.length >= SUB_MIN) mine.push({ aud: ak, audLabel: alabel, aisle: a.k, title: a.label, items: sub });
    }
    /* An audience with no aisle of its own is one carousel: "Mujer".
       What no aisle names is not an aisle ("Otros" would be a bin): it
       stays in the grid under the carousels. */
    if (!mine.length) { if (ak) out.push({ aud: ak, audLabel: alabel, aisle: "todo", title: tax.label, items: list }); continue; }
    out.push(...mine);
  }
  return out.length >= 2 ? out : null;
}

/* The family a store department mostly is (Walmart's "Hogar" pill is
   hogar), or null when it is a mix. */
export function dominantFamily(items, familyOf, share = 0.6) {
  const n = {};
  for (const p of items) { const f = familyOf(p); n[f] = (n[f] || 0) + 1; }
  const [f, c] = Object.entries(n).sort((a, b) => b[1] - a[1])[0] || [];
  return f && c / items.length >= share ? f : null;
}

export const subKey = (railKey, s) => `${railKey}~${s.aud || "all"}~${s.aisle}`;
