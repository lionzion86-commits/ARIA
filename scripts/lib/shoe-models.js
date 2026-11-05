/* ============================================================
   FOOTWEAR HOUSES AND THEIR MODEL LINES (#443 c.6635296341, the full
   store audit). A leaf module (no imports) so that footwear.js -- the
   department's shoe door -- and store-truth.js -- the store pages' -- read
   the same lexicon. Surf and skate shops sell shoes by the model alone
   («Skate Old Skool 195», «Cambridge kids KS123», «Hi-Standard OG»):
   the brand must make shoes AND the title must name one of its models,
   and the name's own head noun must not be a tee, a bag or a board.
   ============================================================ */
const M = (s) => new RegExp("\\b(" + s + ")\\b", "i");
export const SHOE_HOUSES = {
  vans: M("authentic|era|old\\s*skool|sk8[- ]?(hi|low|mid)?|slip[- ]?on|half\\s*cab|cab\\s*\\d*|chukka|kyle(\\s+walker|\\s+\\d)?|gilbert\\s+crockett|crockett|rowan|rowley|ave(\\s+\\d(\\.\\d)?)?|vans\\s+sport|sport\\s+low|ultra\\s*range|mte|hylane|mary\\s+jane|zahba|lowland|grosso|curren\\s+caples|knu\\s*skool|style\\s*\\d+|lampin|berle|bmx|destruct|evdnt|crosspath|hi-?standard|infuse|invado|aura\\s+(og|pro)|encore|juvie|verse|navigator|nexpa|surf\\s+boot|range\\s+exp|seldan|atwood|filmore|ward|doheny|asher|sentry|upland|cruze|wayvee|fairlane|hylane"),
  "nike sb": M("air\\s+force|blazer|janoski|vertebrae|pogo|ishod|nyjah|malor|ps8|react\\s+leo|leo|day\\s+one|bruin|tennis\\s+classic|dunk|force\\s*58|chron|zoom|shane|adversary|alleyoop|react|air\\s+max|portmore|stefan|delta\\s+force|heritage\\s+vulc|vulc"),
  nike: M("blazer|janoski|vertebrae|pogo|ishod|nyjah|malor|ps8|react\\s+leo|day\\s+one|bruin|tennis\\s+classic|dunk|force\\s*58|air\\s+max|air\\s+force|cortez|pegasus|vomero|jordan|chron|shane|portmore|vulc"),
  lakai: M("cambridge|cardiff|essex|flaco|griffin|riley|staple|telford|manchester|newport|owen|evo|atlantic|sheffield|carroll"),
  dc: M("control|lotus|mora|phase|judge|lynx|court\\s+graffik|pure|manteca|kalis|net|anvil|trase|josh\\s+kalis|transit|search|pure\\s+high|construct|metric|ascend|gaveler|stag|travis"),
  "dc shoes": M("control|lotus|mora|phase|judge|lynx|court\\s+graffik|pure|manteca|kalis|net|anvil|trase|transit|metric|ascend|gaveler"),
  ugg: M("classic\\s+(ultra\\s+)?mini|ultra\\s+mini|classic\\s+tall|tasman|tazz|disquette|goldenstar|fluff|neumel|lowmel|scuffette|ansley|venture|cozy"),
  converse: M("chuck(\\s+taylor|\\s*70)?|all\\s+star|one\\s+star|as-?1|run\\s+star|cons|louie\\s+lopez|weapon|star\\s+player|jack\\s+purcell|pro\\s+leather"),
  etnies: M("marana|jameson|josl1n|windrow|kingpin|fader|joslin|veer|calli|barge|scout|semenuk|mc\\s+rap|lo-?cut|kingpin"),
  emerica: M("reynolds\\s+(low|g6|3|cruiser)|romero|servold|wino|provost|tilt|figgy|kody|temple|pillar|ksl|gamma|figueroa"),
  "new balance numeric": M("\\d{3,4}|nm\\d+|tiago|jamie\\s+foy|brandon\\s+westgate"),
  "new balance": M("[a-z]{0,4}\\d{2,4}[a-z]?(v\\d+)?|fresh\\s+foam|fuelcell|arishi|rave\\s+run|coco|ac\\s+runner|new-b|rainbow|nergize|dynasoft|minimus|ellipse|hierro|freeze\\w*|netrush|brighton|[a-z]*\\s*v\\d+|hook\\s*(&|and)\\s*loop|bungee"),
  reef: M("cushion|fanning|j-?bay|draftsmen|drift|phantom|santa\\s+ana|oasis|water\\s+vista|bounce|sands|breeze|dawn|vista|bondi|bonzer|court|swellsole|deckhand|ahi|stargazer|little\\s+one|spring|twinpin|grombows?|one\\s+slide"),
  rainbow: M("301|302|single\\s+layer|double\\s+layer|east\\s+cape|classic\\s+leather|hemp"),
  olukai: M("ohana|nohea|moloa|upena|pehuea|mio|ulele|nalu|kipi|hokua|kia['’]?i|mea\\s+ola|paniolo|pikoi|honu|nu['’]?a"),
  birkenstock: M("barbados|arizona|boston|gizeh|madrid|milano|mayari|kyoto|naples|zurich|buckley|bend|lutry"),
  crocs: M("classic\\s+clog|clog|crush|echo|mellow|bae|literide|baya"),
  sanuk: M("sidewalk\\s+surfer|donna|yoga|pick\\s+pocket|vagabond|chiba|shaka|cozy\\s+vibe|furreal"),
  heydude: M("wendy|wally|thad|austin|paul|karina"),
  "hey dude": M("wendy|wally|thad|austin|paul|karina"),
  teva: M("hurricane|original\\s+universal|terra|midform|flatform|zymic|tirra|ember|reember"),
  globe: M("dimension|tilt|mahalo|encore[- ]?2|motley|liaizon|sabre|fusion|gs\\b|chukka|los\\s+angered|plaza"),
  "last resort ab": M("vm\\d+|cm\\d+|nm\\d+|ab\\s+vm"),
  cariuma: M("catiba|oca|vallely|naioca|ibi|uba|salvas|pacific"),
  hoka: M("clifton|bondi|arahi|mach|speedgoat|challenger|transport|ora|kawana|rincon|hopara"),
  thirtytwo: M("lashed|tm-?\\d+|light\\s+jp|stw|shifty|lashed\\s+double|exit|tm-two|focus\\s+boa"),
  adidas: M("samba|gazelle|campus|superstar|stan\\s+smith|busenitz|tyshawn|puig|forum|adimatic|matchbreak|copa|nora|aloha\\s+super|lucas"),
  "adidas skateboarding": M("samba|gazelle|campus|superstar|busenitz|tyshawn|puig|forum|adimatic|matchbreak|copa|nora|aloha\\s+super|lucas"),
  "straye": M("ventura|logan|stanton|fairfax"),
  "heelys": M("\\w+"),
  "state footwear": M("\\w+"),
  "fallen": M("patriot|trooper|ripper|bomber|clipper|forte"),
  "osiris": M("d3|nyc|protocol|clone|peril"),
  "supra": M("vaider|skytop|stacks|hammer"),
};
/* A shoe house's title that names another kind of product. */
export const NOT_SHOE_WORD_RX = /\b(tees?|t-?shirts?|shirts?|wovens?|flannels?|polos?|jerseys?|tanks?|(?<!(?:low|high|mid|hi)[- ]?)tops?(?!\s+straps?)|hood(y|ie|ies)|pullovers?|crews?|sweat(shirt|er|pants?)s?|fleece|jackets?|vests?|parkas?|anoraks?|windbreakers?|coats?|pants?|shorts?|boardshorts?|trunks|jeans?|chinos?|joggers?|leggings?|dress(es)?|skirts?|bikinis?|bottoms?|bras?|swim\w*|socks?|crew\s+socks?|hats?|caps?|snapbacks?|beanies?|visors?|bucket|gloves?|mitt(en)?s?|liners?|belts?|wallets?|backpacks?|skatepacks?|bags?|totes?|duffels?|duffles?|crossbody|pouch(es)?|sling(?!\s*backs?)|keychains?|stickers?|decks?|cruisers?|boards?|(?:snow|skate|surf|long|body|skim|paddle|wake|kite|foil|fin)boards?|wheels?|trucks?|bearings?|wax|laces|shoelaces?|insoles?|sunglasses|goggles?|helmets?|pads?|towels?|blankets?|bottles?|mugs?|koozies?|banners?|posters?|bandanas?|scarf|scarves|masks?|balaclavas?|tracksuits?|overalls?|onesies?|rash\s*guards?|wetsuits?|knit|long\s*sleeve|l\/s|s\/s|surf\/skate|bindings?)\b/i;

/* The house a store's brand line belongs to: «Vans Girls», «Reef
   Sandals», «NIKE» -- the longest house the brand opens with. */
let houseKeys = null;
export function houseOf(brand) {
  const b = String(brand || "").toLowerCase().replace(/[™®]/g, "").replace(/\s+/g, " ").trim();
  if (!b) return "";
  houseKeys = houseKeys || Object.keys(SHOE_HOUSES).sort((a, c) => c.length - a.length);
  return houseKeys.find((k) => b === k || b.startsWith(k + " ")) || "";
}

/* The product's own words, before its colourway: «Ultrarange VR3 -
   Dress Blues / Multi» is an Ultrarange, not a dress. */
export function headOf(name) {
  const n = String(name || "").trim();
  /* The first separator whose tail is a colourway (four words or fewer):
     «Kids' Zipline BOA Snowboard Boots, Black», never «Honeycomb
     Toddler, Little, and Big Kid Slip On Knit Sneakers». */
  const rx = /\s+[-\u2013|]\s+|,\s+/g;
  let m;
  while ((m = rx.exec(n))) {
    const tail = n.slice(m.index + m[0].length);
    /* ...and names no product of its own («Cow Print Brown, White & Blue Shoes»). */
    if (m.index >= 3 && tail.split(/\s+/).filter(Boolean).length <= 4 && !FOOT_RX.test(tail)) return n.slice(0, m.index).trim();
  }
  return n;
}


/* The words a shoe's name ends on (its head noun). Singular «pump»,
   «wedge», «runner» are left out: «Hand Vacuum Pump», «Wedge Pillow»
   end on them too. A singular «flat» counts only as the name's last word
   after a word («ELSA FLAT», «Iconic Ballet Flat», #443 c.6642247782),
   never after a size or a comma («Skate Rail – 6ft Flat»); «Flat Iron»
   does not end on it. product-type.js's zapatos nouns carry the same rule. */
export const FOOT_RX = /\b(derbys|derbies|shoes?|sneakers?|boots?|booties|bootie|sandals?|slides?|flip[- ]?flops?|cleats?|loafers?|moc+asins?|espadrilles?|heels?|clogs?|slippers?|mules|oxfords|flats|pumps|slingbacks?|sling\s*backs?|mary\s*janes?|ballerinas?|(?<!\d\w*\s|,\s?)flat(?=\s*$)|wedges|trainers|huaraches?|slip[- ]?ons?|zapatillas?|zapatos?|sandalias?|botas?|botines?|pantuflas?|chanclas?)\b/i;
export const lastAt = (rx, s) => { const g = new RegExp(rx.source, "gi"); let m, at = -1; while ((m = g.exec(s))) at = m.index; return at; };

/** A footwear house's model line, by its name and brand. */
export function isShoeModel(name, brand) {
  const n = String(name || "").replace(/[™®]/g, "");
  /* The house the brand names -- or the one the title opens with
     («Nike SB Dunk Low ...» filed under the store's own name). */
  const rx = SHOE_HOUSES[houseOf(brand) || houseOf(n.split(/\s+/).slice(0, 2).join(" "))];
  if (!rx || !n) return false;
  const h = headOf(n);
  if (lastAt(NOT_SHOE_WORD_RX, h) > lastAt(FOOT_RX, h)) return false;
  return rx.test(h);
}

export const GARMENT_RX = /\b(v[- ]?necks?|scoop\s+necks?|crops?|crew\s*$|l\/s|s\/s|t-?shirts?|tees?|shirts?|wovens?|flannels?|polos?|tank\s*tops?|tanks?|crop\s+tops?|tube\s+tops?|(?<!(?:low|high|mid|hi)[- ]?)tops?(?!\s+straps?)|blouses?|hood(y|ie|ies)|pullovers?|sweat(shirt|er)s?|sweatpants?|crew\s*necks?|crewnecks?|cardigans?|fleeces?|jackets?|vests?|parkas?|anoraks?|windbreakers?|coats?|pants|trousers|shorts?|walkshorts?|volleys?|jeans?|bermudas?|lycras?|hooded|chinos?|joggers?|leggings|dress(es)?|skirts?|gowns?|rompers?|jumpsuits?|overalls?|onesies?)\b/i;
