/* ============================================================
   GYM RAT = APPAREL ONLY (Danny, #443 c.6542490625).

   Gym Rat carries gym CLOTHING: tees, tanks, shorts, leggings, joggers,
   hoodies, sports bras, jackets, socks, caps -- training clothing. No
   fight gear and no equipment, from ANY brand: no gloves, wraps, gis,
   shin guards, bags, mitts, mouthguards, belts, straps, sleeves.

   One rule, read by the section's data (scripts/build-department-slices
   gym_rat) and by the gym ingest (scripts/build-gym-pulls.mjs), so a
   future pull cannot leak gear back in:

     gymKind(item) -> "apparel"  belongs in Gym Rat
                      "fight"    fight / training gear: Aria Fight Club
                      "other"    neither (bottles, bags, decals, shoes,
                                 jewellery): not Gym Rat, held
   The item's own category (type / subcategory) is read first; the name
   decides only when the category says nothing ("accessories", "").
   ============================================================ */

/* Fight and training gear: Fight Club's, never Gym Rat's. */
const FIGHT_WORDS = "boxing gloves?|gloves?|hand ?wraps?|wraps?|mitts?|focus pads?|shin ?guards?|mouth ?guards?|head ?gear|headgear|gis?|kimonos?|lifting belts?|weight ?lifting belts?|belts?|straps?|grips?|(?:knee|elbow|wrist) (?:sleeves?|wraps?|cuffs?)|cuffs?|jump ?ropes?|resistance bands?|glute bands?|calf sleeves?|equipment|lifting accessories";
/* Not clothing and not fight gear. */
const OTHER_WORDS = "bottles?|shakers?|bags?|backpacks?|duffels?|totes?|towels?|toiletry|keychains?|key ?chains?|decals?|stickers?|patch(?:es)?|flags?|mugs?|tumblers?|jugs?|gift ?cards?|shoes?|sneakers?|boots?|slides?|sandals?|bracelets?|necklaces?|chains?|rings?|earrings?|pendants?|jewel(?:le)?ry|sunglasses|phone cases?|posters?|scrunchies?|neck warmers?|running belts?|pad inserts?|insurance|flip ?flops?|lanyards?|wallets?";
/* Clothing words: what Gym Rat is. */
const APPAREL_WORDS = "t ?shirts?|tees?|tops?|tanks?|stringers?|singlets?|crops?|bras?|bralettes?|bandeau|leggings?|tights?|jeans?|jorts|denim|bottoms?|joggers?|sweat ?pants?|sweatpants|pants?|trousers?|shorts?|skorts?|skirts?|dresses?|hoodies?|hoodie|sweatshirts?|crewnecks?|pullovers?|jumpers?|knitwear|cardigans?|jackets?|coats?|outerwear|vests?|gilets?|unitards?|bodysuits?|onesies?|shortsuits?|rompers?|long ?sleeves?|short ?sleeves?|sleeveless|base ?layers?|polos?|flannels?|shirts?|capris?|socks?|underwear|briefs?|boxers?|thongs?|caps?|hats?|beanies?|headbands?|swim(?:suits?)?|bikinis?|maternity|apparel|clothing|seamless|zip ?ups?|quarter ?zips?|half ?zips?|windbreakers?|parkas?|sets?|sweaters?|boleros?|jumpsuits?|shrugs?|crew ?necks?|jerseys?|sweatshorts?|sweats|flares?|camis?|cut ?offs?|overalls?|trunks?|henleys?|thermals?";
const FIGHT_SHORTS_RX = /\b(fight|mma|muay thai|board fight) shorts?\b/;
/* Grappling wear is fight gear whatever its store files it under
   ("No Gi Rashguards" in COMPRESSION_T-SHIRTS): rashguards, spats, vale
   tudo shorts, BJJ / no-gi pieces. A gi brand's hoodie ("Urban Gi
   Hoodie") and a Yu-Gi-Oh! tee are clothing. */
const GRAPPLING_RX = /\b(rash ?guards?|spats|vale tudo|no ?gi|bjj|jiu ?jitsu|grappling)\b/;
const WORD_RX = new RegExp("\\b(?:(" + FIGHT_WORDS + ")|(" + OTHER_WORDS + ")|(" + APPAREL_WORDS + "))\\b", "g");

const norm = (s) => String(s || "").replace(/[_-]+/g, " ").replace(/&/g, " ").toLowerCase();

/* The thing a phrase names: its LAST item word ("Ballet Wrap Top" is a
   top, "Wrap Lifting Gloves" gloves, "Denali Belt Bag" a bag, "Pilates
   Grip Socks 1 Pack" socks). */
function lastItem(text) {
  let hit = null, m;
  WORD_RX.lastIndex = 0;
  while ((m = WORD_RX.exec(text))) hit = { kind: m[1] ? "fight" : m[2] ? "other" : "apparel", word: m[0] };
  return hit;
}
/* A name that ENDS on one of these is that object, whatever its category
   says (a "clothing" entry named "Lifting Gloves"). Colour and design
   words -- "Range Shirt Flag", "Peach Rings", "Ballet Wrap" -- never
   outrank a clothing category. */
const STRONG_RX = /^(gloves?|boxing gloves?|lifting belts?|weight ?lifting belts?|belts?|straps?|hand ?wraps?|(knee|elbow|wrist) (sleeves?|wraps?|cuffs?)|bags?|backpacks?|duffels?|totes?|bottles?|shakers?|jugs?|towels?|shoes?|sneakers?|boots?|slides?|sandals?|bracelets?|necklaces?|chains?|keychains?|decals?|stickers?|patch(es)?|resistance bands?|equipment)$/;
const GENERIC_CAT_RX = /^(accessories|apparel accessories|clothing accessories|other|gym|apparel|clothing|)$/;

export function gymKind(item) {
  const cat = norm((item && (item.subcategory || item.type)) || "").trim();
  const name = norm((item && (item.name || item.title)) || "");
  /* Fight shorts are fight apparel: Fight Club's. */
  if (FIGHT_SHORTS_RX.test(cat) || FIGHT_SHORTS_RX.test(name) || GRAPPLING_RX.test(name)) return "fight";
  /* The product's name says what it is (the part before " - " / " | " is
     the product, the rest its colour: "Pursuit Pullover - Chalk"). */
  const head = name.split(/ - | \| /)[0];
  const byName = lastItem(head) || lastItem(name);
  const byCat = GENERIC_CAT_RX.test(cat) ? null : lastItem(cat);
  if (byCat && byCat.kind === "apparel") {
    return byName && byName.kind !== "apparel" && STRONG_RX.test(byName.word) ? byName.kind : "apparel";
  }
  if (byCat) return byName && byName.kind === "apparel" ? "apparel" : byCat.kind;
  if (byName) return byName.kind;
  /* A clothing store's catch-all ("For Him", "Women") with a style name
     ("The Bestie"): clothing -- its jewellery and bags say so by name. */
  if (/^(for (him|her)|men|women|mens|womens|unisex)$/.test(cat)) return "apparel";
  return "other";
}

export const isGymApparel = (item) => gymKind(item) === "apparel";
