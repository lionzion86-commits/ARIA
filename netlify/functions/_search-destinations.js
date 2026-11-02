/* ==================================================================
   THE SEARCH DESTINATION GUARDRAIL (#443 c.6569512697, c.6569515583,
   c.6569529913 -- Danny, confirmed "100%").

   Every search lands on ONE of three built surfaces:
     store     tienda.html?tienda=<key>[&q=]
     brand     marca.html?marca=<key>[&q=<model>]  (the brand pattern; a
               model query leads with its Comparador, Ofertas and one rail
               per store -- marca.html's focus block)
     category  departamento.html?dept=<key>[&t=<type>][&a=][&q=]
   and, when the matcher cannot decide, the CHOOSER on search.html: at
   most three rails -- the store that carries it, the brand, the category
   -- each a door («Ver todo en …») to its own surface. A query nothing
   is close to gets three entry doors (Ofertas, Todas las tiendas,
   Categorías). No pooled grid, no results wall, ever.

   Resolution order: store (exact, its full name, "tienda X", the start
   of its name, a store name followed by words) -> brand (exact, a brand
   name inside the query: brand + model) -> category (the department
   vocabulary below, Spanish through the search dictionary) -> what the
   engine found (a corrected spelling; one marquee brand holding half
   the answer; one department holding most of it) -> the chooser
   (built from the answer, or, for a miss, from the closest store, brand
   and category by spelling).

   Every resolved landing carries the other close matches as
   «También puede ser…» (alternatives; the page passes them on as &tp=).

   The surfaces come from assets/search/destinations.json
   (scripts/build-search-destinations.mjs): only a store with a
   storefront, a brand with a static marca.html head, a department of
   departamento.html and its type lenses can be a destination.
   ================================================================== */
import { readRepoFile, equivalentQuery, isMarquee, cardOf, storeFor, canonicalTokens, pairCount, dictWords } from "./_search-core.js";

export const DEST_FILE = "assets/search/destinations.json";
export const CHOOSER_MAX = 3, ALT_MAX = 4, RAIL_ITEMS = 12;

export const nameKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const deaccent = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const spaced = (s) => deaccent(s).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const wordsOf = (s) => spaced(s).split(" ").filter(Boolean);

/* ---------- the department vocabulary ----------
   English concept -> [department, type lens]. Spanish reaches it through
   the search dictionary (assets/search/synonyms-es.json: "vestidos" ->
   "dress"), through each department's own name and each type lens's own
   label (destinations.json: "Vestidos", "Faldas", "Polerones"), and
   through the few Spanish words below that the dictionary leaves as-is. */
const CONCEPTS = {
  dress: ["women", "vestidos"], gown: ["women", "vestidos"], skirt: ["women", "faldas"], blouse: ["women", "tops"],
  "t-shirt": ["clothing", "tops"], tshirt: ["clothing", "tops"], tee: ["clothing", "tops"], shirt: ["men", "camisas"],
  hoodie: ["clothing", "polerones"], sweatshirt: ["clothing", "polerones"], sweater: ["clothing", "polerones"],
  jacket: ["clothing", "chaquetas"], coat: ["clothing", "chaquetas"], pants: ["clothing", "pantalones"], jeans: ["clothing", "pantalones"],
  shorts: ["clothing", "shorts"], joggers: ["clothing", "pantalones"], leggings: ["gym_rat"], pajamas: ["clothing"], suit: ["men"],
  clothes: ["clothing"], clothing: ["clothing"], apparel: ["clothing"], jumpsuit: ["women"], cap: ["clothing", "gorras"], hat: ["clothing", "gorras"],
  beanie: ["clothing", "gorras"], swimsuit: ["women", "bano"], bikini: ["women", "bano"], swimwear: ["women", "bano"],
  underwear: ["ropa_interior"], "boxer briefs": ["ropa_interior"], boxers: ["ropa_interior"], socks: ["ropa_interior"],
  bra: ["ropa_interior_mujer"], panties: ["ropa_interior_mujer"], thong: ["ropa_interior_mujer"], lingerie: ["ropa_interior_mujer"],
  sneakers: ["shoes", "zapatillas"], trainers: ["shoes", "zapatillas"], shoes: ["shoes", "zapatos"], boots: ["shoes", "zapatos"],
  sandals: ["shoes", "zapatos"], slippers: ["shoes", "zapatos"], "flip flops": ["shoes", "zapatos"], clogs: ["shoes", "zapatos"],
  heels: ["shoes_women"], booties: ["shoes_women"], "ballet flats": ["shoes_women"], "platform shoes": ["shoes_women"], loafers: ["shoes_men"],
  cleats: ["soccer"], "baby shoes": ["kids", "zapatos"],
  handbag: ["purses", "carteras"], purse: ["purses", "carteras"], bag: ["purses", "carteras"], backpack: ["purses", "carteras"],
  wallet: ["purses"], tote: ["purses"], sunglasses: ["sunglasses", "lentes"], glasses: ["sunglasses", "lentes"],
  jewelry: ["joyas_accesorios", "joyas"], earrings: ["joyas_accesorios", "joyas"], necklace: ["joyas_accesorios", "joyas"],
  bracelet: ["joyas_accesorios", "joyas"], ring: ["joyas_accesorios", "joyas"], watch: ["joyas_accesorios"], belt: ["joyas_accesorios"],
  scarf: ["joyas_accesorios"], keychain: ["joyas_accesorios"],
  phone: ["electronics"], smartphone: ["electronics"], laptop: ["electronics"], computer: ["electronics"], tablet: ["electronics"],
  headphones: ["electronics"], earbuds: ["electronics"], speaker: ["electronics"], tv: ["electronics"], television: ["electronics"],
  camera: ["electronics"], monitor: ["electronics"], keyboard: ["electronics"], charger: ["electronics"], smartwatch: ["electronics"],
  console: ["electronics"], "video game": ["electronics"], electronics: ["electronics"], drone: ["electronics"], printer: ["electronics"],
  perfume: ["perfumes"], cologne: ["perfumes"], fragrance: ["perfumes"],
  makeup: ["beauty"], lipstick: ["beauty"], mascara: ["beauty"], eyeliner: ["beauty"], blush: ["beauty"], foundation: ["beauty"],
  concealer: ["beauty"], eyeshadow: ["beauty"], "nail polish": ["beauty"], skincare: ["beauty"], cream: ["beauty"], sunscreen: ["beauty"],
  serum: ["beauty"], moisturizer: ["beauty"], deodorant: ["beauty"], beauty: ["beauty"], "face mask": ["beauty"],
  shampoo: ["cabello"], conditioner: ["cabello"], keratin: ["cabello"], "hair mask": ["cabello"], "flat iron": ["cabello"], straightening: ["cabello"],
  toy: ["toys"], toys: ["toys"], doll: ["toys"], plush: ["toys"], "action figure": ["toys"], puzzle: ["toys"], "board game": ["toys"],
  "toy car": ["toys"], "remote control car": ["toys"], tricycle: ["toys"],
  stroller: ["moms"], "baby bottle": ["moms"], diapers: ["moms"], pacifier: ["moms"], "baby monitor": ["moms"],
  dumbbell: ["sporting_goods"], kettlebell: ["sporting_goods"], weights: ["sporting_goods"], barbell: ["sporting_goods"],
  bicycle: ["sporting_goods"], bike: ["sporting_goods"], ball: ["sporting_goods"], "yoga mat": ["sporting_goods"], treadmill: ["sporting_goods"],
  boxing: ["combat_sports"], mma: ["combat_sports"], bjj: ["combat_sports"], "jiu jitsu": ["combat_sports"], "muay thai": ["combat_sports"],
  soccer: ["soccer"], tennis: ["tennis"], racket: ["tennis"], padel: ["tennis"],
  surf: ["surf_skate"], surfboard: ["surf_skate"], wetsuit: ["surf_skate"], skateboard: ["surf_skate"], skates: ["surf_skate"], skate: ["surf_skate"],
  spearfishing: ["spearfishing"], speargun: ["spearfishing"], freediving: ["spearfishing"],
  dinnerware: ["home_goods"], cookware: ["home_goods"], kitchen: ["home_goods"], "sheet set": ["home_goods"], sheets: ["home_goods"],
  towels: ["home_goods"], bedding: ["home_goods"], candle: ["home_decor"], decor: ["home_decor"], lamp: ["home_decor"], rug: ["home_decor"],
  book: ["books"], books: ["books"], candy: ["candy_chocolate"], chocolate: ["candy_chocolate"], snacks: ["candy_chocolate"],
  party: ["party"], balloons: ["party"], razor: ["mens_grooming"], shaver: ["mens_grooming"], trimmer: ["mens_grooming"], beard: ["mens_grooming"],
  brake: ["auto_parts"], brakes: ["auto_parts"], "brake pads": ["auto_parts"], "oil filter": ["auto_parts"], "auto parts": ["auto_parts"],
  refurbished: ["reacondicionados"], "plus size": ["curvy"], luxury: ["luxury"], designer: ["luxury"],
};
/* Spanish the dictionary does not translate (it is a word list for the
   engine, not a department map). */
const SPANISH = {
  electronica: "electronics", tecnologia: "electronics", celulares: "phone", telefono: "phone", telefonos: "phone", laptops: "laptop",
  computadoras: "computer", tablets: "tablet", televisor: "tv", televisores: "tv", tele: "tv", consolas: "console",
  libros: "book", libro: "book", dulces: "candy", golosinas: "candy", caramelos: "candy", chocolates: "chocolate",
  decoracion: "decor", velas: "candle", vela: "candle", cocina: "kitchen", lamparas: "lamp", lampara: "lamp", alfombras: "rug",
  repuestos: "auto parts", autopartes: "auto parts", futbol: "soccer", raqueta: "racket", raquetas: "racket",
  boxeo: "boxing", tablas: "surfboard", deportes: "ball", ropa: "clothes", moda: "clothes", belleza: "beauty", perfumeria: "perfume",
  cabello: "shampoo", pelo: "shampoo", joyeria: "jewelry", bisuteria: "jewelry", accesorios: "jewelry", reacondicionados: "refurbished",
  reacondicionado: "refurbished", lujo: "luxury", fiesta: "party", globos: "balloons", afeitadora: "razor", rasuradora: "razor",
  barba: "beard", maquinillas: "razor", bebes: "stroller", pesa: "weights", pesas: "weights", mancuernas: "dumbbell",
  medias: "socks", lenceria: "lingerie", sneakers: "sneakers", zapatillas: "sneakers",
};
/* ---------- the product word -> its TYPE page (#443 c.6579541628) ----------
   Danny's final ruling: a word that names a product type ("celular",
   "laptop", "champú", "shorts") opens THAT TYPE's page -- the full type
   listing departamento.html draws for one rail (?dept=X&ver=<rail key>),
   the "Celulares 87" page -- never the department's home and never a
   generic Ofertas rail. Resolved before the department-level vocabulary
   above. A type lands only when destinations.json lists its rail with
   products (scripts/build-search-destinations.mjs); a word whose type is
   missing falls through to the department words and, from there, to the
   chooser. Where no type of its own exists, the word lands on the
   closest real one (a hair iron on Keratina y alisados; a monitor on
   Accesorios y energía narrowed to monitors) -- see q below.

   type id -> { dept, ver (the rail key), q (an optional narrowing the
   department endpoint matches in titles), sib ([dept, rail key, q?]: sibling types offered as
   «También puede ser…» -- never a brand or a store) }. */
export const PRODUCT_TYPES = {
  celulares: { dept: "electronics", ver: "pasillo:tech_celulares", sib: [["reacondicionados", "aisle:tech_celulares"], ["electronics", "pasillo:tech_relojes"]] },
  computadoras: { dept: "electronics", ver: "pasillo:tech_computadoras", sib: [["electronics", "chromebooks"], ["reacondicionados", "aisle:tech_computadoras"], ["electronics", "pasillo:tech_componentes"]] },
  chromebooks: { dept: "electronics", ver: "chromebooks", sib: [["electronics", "pasillo:tech_computadoras"], ["reacondicionados", "aisle:tech_computadoras"]] },
  consolas: { dept: "electronics", ver: "consolas", sib: [["electronics", "pasillo:tech_gaming"]] },
  audifonos: { dept: "electronics", ver: "pasillo:tech_audifonos", sib: [["electronics", "pasillo:tech_audio"], ["reacondicionados", "aisle:tech_audifonos"]] },
  camaras: { dept: "electronics", ver: "pasillo:tech_camaras", sib: [["reacondicionados", "aisle:tech_camaras"]] },
  /* Drones, their own type (#443 c.6579603095): DJI's pro line leads it. */
  drones: { dept: "electronics", ver: "pasillo:tech_drones", sib: [["electronics", "pasillo:tech_camaras"]] },
  monitores: { dept: "electronics", ver: "pasillo:tech_accesorios", q: "monitor", sib: [["electronics", "pasillo:tech_gaming", "monitor"], ["electronics", "pasillo:tech_computadoras"]] },
  champu: { dept: "cabello", ver: "tipo:champú y acondicionador", sib: [["cabello", "tipo:mascarillas"], ["beauty", "tipo:cuidado-del-cabello"]] },
  keratina: { dept: "cabello", ver: "tipo:keratina y alisados", sib: [["cabello", "tipo:reparación"], ["cabello", "tipo:mascarillas"]] },
  mascarilla: { dept: "cabello", ver: "tipo:mascarillas", sib: [["beauty", "tipo:mascarillas"], ["cabello", "tipo:reparación"]] },
  labial: { dept: "beauty", ver: "tipo:labios", sib: [["beauty", "tipo:maquillaje"]] },
  pesas: { dept: "sporting_goods", ver: "tipo:pesas-y-cinturones", sib: [] },
  vajilla: { dept: "home_goods", ver: "casa:casa_mesa", sib: [["home_goods", "casa:casa_cocina"]] },
  shorts: { dept: "clothing", ver: "tipo:shorts", sib: [["women", "tipo:shorts"], ["men", "tipo:shorts"], ["kids", "tipo:shorts"]] },
  polerones: { dept: "men", ver: "tipo:chompas-y-polerones", sib: [["women", "tipo:chompas-y-polerones"], ["kids", "tipo:chompas-y-polerones"]] },
};
/* The words, Spanish, English and the misspellings people type (accents
   and case already folded; "|" between phrases). A phrase is matched whole, filler words
   («un», «para», «barato») aside; the search dictionary's Spanish ->
   English (synonyms-es.json) reaches the English rows, and the engine's
   own spelling fix reaches all of them. */
export const PRODUCT_WORDS = {
  celulares: "celular|celulares|telefono|telefonos|telefono celular|telefonos celulares|telefono movil|fono|fonos|movil|moviles|smartphone|smartphones|smart phone|cell|cells|cellphone|cellphones|cell phone|cell phones|phone|phones|mobile phone|mobile phones|celuar|celualr|selular|selulares|celulr",
  computadoras: "laptop|laptops|computadora|computadoras|computador|computadores|computadora portatil|laptop computer|laptop computers|notebook|notebooks|portatil|portatiles|lapto|labtop|labtops|lap top|lap tops|computer|computers|ordenador",
  chromebooks: "chromebook|chromebooks|chrome book|chrome books|chromebok",
  consolas: "consola|consolas|consola de videojuegos|consolas de videojuegos|console|consoles|game console|game consoles|video game console|playstation|play station|xbox|consola playstation|consola xbox",
  audifonos: "audifonos|audifono|audifonos inalambricos|audifonos bluetooth|auriculares|auricular|headphones|headphone|earbuds|earphones|headset|headsets",
  drones: "dron|drones|drone|dji|drone dji|dron dji|drones dji|cuadricoptero|cuadricopteros|quadcopter|quadcopters|dron con camara|drone con camara|drone with camera|drones con camara|dorn|drom|drones fpv|fpv drone",
  camaras: "camara|camaras|camara fotografica|camaras fotograficas|camara digital|camaras digitales|camera|cameras|digital camera|digital cameras",
  monitores: "monitor|monitores|monitor de computadora|monitor gamer|monitores gamer|computer monitor|computer monitors|gaming monitor|gaming monitors",
  champu: "champu|champus|champoo|shampoo|shampoos|shampu|shampo|champu y acondicionador|acondicionador|acondicionadores|conditioner|conditioners",
  keratina: "keratina|keratinas|keratin|queratina|alisado|alisados|alisado de keratina|alisado brasilero|alisado brasileno|tratamiento de keratina|brazilian blowout|keratin treatment|plancha|planchas|plancha de pelo|plancha de cabello|plancha para el pelo|plancha para cabello|planchas de pelo|flat iron|flat irons|hair straightener|hair straighteners",
  mascarilla: "mascarilla|mascarillas|mascarilla para el pelo|mascarilla para cabello|mascarilla capilar|mascarillas capilares|hair mask|hair masks",
  labial: "labial|labiales|lapiz labial|lapices labiales|pintalabios|lipstick|lipsticks|lip gloss|brillo labial",
  pesas: "pesas|pesa|mancuernas|mancuerna|dumbbell|dumbbells|weights|pesas de gimnasio",
  vajilla: "vajilla|vajillas|platos|juego de platos|dinnerware|dinner plates",
  shorts: "short|shorts|chort|chorts|shor|shorst|shors|bermuda|bermudas",
  polerones: "polera|poleras|poleron|polerones|hoodie|hoodies|hudi|hudis|hodie|hodies|hoddie|hoodi|sudadera|sudaderas|sudadera con capucha|sudaderas con capucha|buzo con capucha|sweatshirt|sweatshirts|swetshert|swetshirt|sweatshert|sweat shirt",
};
/* Who it is for: switches a fashion department to that audience's. */
const AUDIENCE = {
  mujer: "women", mujeres: "women", dama: "women", damas: "women", femenino: "women", women: "women", womens: "women", woman: "women",
  ladies: "women", nina: "kids", ninas: "kids", hombre: "men", hombres: "men", caballero: "men", caballeros: "men", masculino: "men",
  men: "men", mens: "men", man: "men", nino: "kids", ninos: "kids", infantil: "kids", kids: "kids", kid: "kids", boys: "kids", girls: "kids",
};
/* Words that carry no destination ("para", "de", "barato"). */
const FILLER = new Set("de del para el la los las con y en un una unos unas mi mis por al que quiero busco necesito the for and with of a an new nuevo nueva nuevos nuevas original originales barato baratos barata baratas economico economicos cheap best mejor mejores".split(" "));
const STORE_FILLER = new Set(["tienda", "tiendas", "store", "shop", "peru", "oficial", "online", "usa"]);
const STORE_ALIASES = { vs: "victoriassecret", victoriasecret: "victoriassecret", victoria: "victoriassecret", victorias: "victoriassecret",
  ae: "americaneagle", af: "abercrombie", abercrombiefitch: "abercrombie", abercrombieandfitch: "abercrombie", bh: "bhphoto", bandh: "bhphoto",
  bhphotovideo: "bhphoto", pierone: "pier1", dick: "dicks", dickssportinggoods: "dicks", brandsmartusa: "brandsmart", cratebarrel: "crateandbarrel",
  walmartbebe: "walmartbaby", ariaperfume: "ariaperfumes" };

/* ---------- the surfaces, built once per container ---------- */
export function destinations(ctx, read = readRepoFile) {
  if (ctx._dest) return ctx._dest;
  const raw = JSON.parse(read(DEST_FILE));
  const D = { stores: raw.stores || {}, brands: raw.brands || {}, depts: raw.depts || {}, types: raw.types || {} };
  /* The product words: phrase -> type id (only a type whose rail exists). */
  D.productWords = new Map();
  for (const [id, list] of Object.entries(PRODUCT_WORDS)) {
    const t = PRODUCT_TYPES[id];
    if (!t || !(D.types[t.dept] && D.types[t.dept][t.ver])) continue;
    for (const w of list.split("|")) { const k = spaced(w); if (k && !D.productWords.has(k)) D.productWords.set(k, id); }
  }
  /* Store names: key, label, label without "&", aliases. */
  D.storeNames = new Map();
  for (const [k, label] of Object.entries(D.stores)) {
    for (const n of [k, nameKey(label), nameKey(String(label).replace(/&/g, " ")), nameKey(String(label).replace(/'s\b/gi, "s"))]) if (n.length >= 2 && !D.storeNames.has(n)) D.storeNames.set(n, k);
  }
  for (const [a, k] of Object.entries(STORE_ALIASES)) if (D.stores[k] && !D.storeNames.has(a)) D.storeNames.set(a, k);
  /* Brand names: key and label key ("Levi's" -> levis). */
  D.brandNames = new Map();
  for (const [k, [label]] of Object.entries(D.brands)) {
    for (const n of [k, nameKey(label)]) if (n.length >= 2 && !D.brandNames.has(n)) D.brandNames.set(n, k);
  }
  /* Other spellings of a brand ("herschel supply", "vuori inc"). */
  for (const [a, k] of Object.entries(raw.brandAliases || {})) if (D.brands[k] && a.length >= 2 && !D.brandNames.has(a)) D.brandNames.set(a, k);
  /* Category words: concept -> [dept, lens] (only departments that exist). */
  const vocab = new Map();
  const put = (w, v) => { const k = spaced(w); if (k && v && D.depts[v[0]] && !vocab.has(k)) vocab.set(k, v); };
  for (const [en, v] of Object.entries(CONCEPTS)) put(en, v);
  for (const [es, en] of Object.entries(SPANISH)) put(es, CONCEPTS[en]);
  /* The search dictionary's Spanish -> English. */
  const dict = (() => { try { return JSON.parse(read("assets/search/synonyms-es.json")); } catch { return {}; } })();
  D.en = new Map();
  for (const sec of ["phrases", "footwear", "clothing", "accessories", "beauty", "toys", "auto", "modifiers", "colors"]) {
    for (const [es, en] of Object.entries(dict[sec] || {})) {
      const first = Array.isArray(en) ? en[0] : en;
      if (typeof first !== "string") continue;
      if (!D.en.has(spaced(es))) D.en.set(spaced(es), first);
      if (CONCEPTS[first] && sec !== "modifiers" && sec !== "colors") put(es, CONCEPTS[first]);
    }
  }
  /* Each department's own name, and each type lens's label ("Vestidos",
     "Blusas y tops"), as typed. Women, then men, then kids, own a lens
     word they share; the audience word moves it. */
  for (const k of ["women", "men", "kids"]) {
    const lenses = (D.depts[k] && D.depts[k][1]) || {};
    for (const [slug, label] of Object.entries(lenses)) {
      put(slug, [k, slug]);
      for (const part of spaced(label).split(" y ")) put(part, [k, slug]);
    }
  }
  for (const [k, [name]] of Object.entries(D.depts)) put(name, [k]);
  D.vocab = vocab;
  D.vocabLongest = Math.max(1, ...[...vocab.keys()].map((w) => w.split(" ").length));
  return (ctx._dest = D);
}

/* ---------- urls ---------- */
const enc = encodeURIComponent;
export function storeUrl(key, q) { return "tienda.html?tienda=" + enc(key) + (q ? "&q=" + enc(q) : ""); }
export function brandUrl(key, q) { return "marca.html?marca=" + enc(key) + (q ? "&q=" + enc(q) : ""); }
/* ver: what the page leads with when a search lands there -- a type
   rail's key (that type's full listing: departamento.html's type page) or
   "tipos" (the department's own types; its Ofertas rail never leads a
   search landing -- #443 c.6579064382). */
export const VER_TYPES = "tipos";
export function deptUrl(key, { t, a, q, ver = VER_TYPES } = {}) {
  return "departamento.html?dept=" + enc(key) + (t ? "&t=" + enc(t) : "") + (a ? "&a=" + enc(a) : "") + (q ? "&q=" + enc(q) : "") + (ver ? "&ver=" + enc(ver) : "");
}
/* The only urls a destination, an alternative or a door may carry. */
export const SURFACE_RX = /^(tienda|marca|departamento)\.html\?(tienda|marca|dept)=[a-z0-9_]+(&[a-z]+=[^&"<>\s]*)*$/;
export const ENTRY_RX = /^(ofertas|tiendas|categorias)\.html$/;

const storeDest = (D, key, q) => ({ kind: "store", key, label: D.stores[key] || key, url: storeUrl(key, q), ...(q ? { q } : {}) });
const brandDest = (D, key, q) => ({ kind: "brand", key, label: D.brands[key][0], url: brandUrl(key, q), ...(q ? { q } : {}) });
function deptLabel(D, key, t, ver) {
  const d = D.depts[key];
  if (!d) return key;
  const type = ver && D.types[key] && D.types[key][ver];
  if (type) return type[0] + " · " + d[0];
  const lens = t && d[1] && d[1][t];
  return lens ? lens + " · " + d[0] : d[0];
}
const deptDest = (D, key, opts = {}) => ({ kind: "category", key, label: deptLabel(D, key, opts.t, opts.ver), url: deptUrl(key, opts),
  ...(opts.t ? { t: opts.t } : {}), ...(opts.q ? { q: opts.q } : {}), ...(opts.ver && opts.ver !== VER_TYPES ? { ver: opts.ver } : {}) });
/* A product type's page: { dest, alternatives } (its siblings and its
   department -- never a brand or a store guess against the word). */
function typeDest(D, id) {
  const t = PRODUCT_TYPES[id];
  return deptDest(D, t.dept, { ver: t.ver, q: t.q || "" });
}
function typeAlternatives(D, id) {
  const t = PRODUCT_TYPES[id], out = [];
  for (const [dk, ver, q] of t.sib) if (D.types[dk] && D.types[dk][ver] && out.length < ALT_MAX - 1) out.push(deptDest(D, dk, { ver, q: q || "" }));
  out.push({ ...deptDest(D, t.dept), key: t.dept });
  return out;
}
/* The product word the whole query names (filler aside), or "". */
export function productTypeOf(D, q) {
  const all = wordsOf(q), words = all.filter((w) => !FILLER.has(w));
  if (!words.length || words.length > 5) return "";
  const phrase = words.join(" ");
  const look = (k) => D.productWords.get(k) || "";
  /* "sudadera con capucha": the phrase as written, then without its filler. */
  return look(all.join(" ")) || look(phrase) || look(spaced(D.en.get(phrase) || "")) ||
    (words.length === 1 ? look(phrase.replace(/(es|s)$/, "")) || look(phrase + "s") : "");
}

/* ---------- the store ---------- */
export function storeOf(D, q) {
  const k = nameKey(q);
  if (k.length < 2) return null;
  if (D.storeNames.has(k)) return D.storeNames.get(k);
  const k2 = nameKey(wordsOf(q).filter((w) => !STORE_FILLER.has(w)).join(" "));
  if (k2 !== k && k2.length >= 2 && D.storeNames.has(k2)) return D.storeNames.get(k2);
  /* The start of one store's name ("sepho", "calzed"). */
  if (k.length >= 5) {
    const hits = new Set();
    for (const [n, key] of D.storeNames) if (n.startsWith(k) && k.length >= n.length * 0.5) hits.add(key);
    if (hits.size === 1) return [...hits][0];
  }
  return null;
}
/* A name spanning words i..j ("new balance", "levi s"): the longest one
   found in `names`, as { key, from, to }. */
function spanOf(names, words, { minLen = 3, skip = () => false } = {}) {
  let best = null;
  for (let i = 0; i < words.length; i++) {
    for (let j = Math.min(words.length, i + 4); j > i; j--) {
      const part = words.slice(i, j), k = part.join("");
      if (k.length < minLen || !names.has(k) || skip(part.join(" "))) continue;
      if (!best || (j - i) > (best.to - best.from)) best = { key: names.get(k), from: i, to: j };
      break;
    }
  }
  return best;
}
const restOf = (words, span) => words.filter((_, i) => i < span.from || i >= span.to).filter((w) => !FILLER.has(w)).join(" ");

/* ---------- the category ---------- */
/* Read the query as category words: { dept, t, a, rest[] } or null when
   no word names a department. */
export function categoryOfQuery(D, q) {
  const words = wordsOf(q);
  if (!words.length) return null;
  let concept = null, audience = "";
  const rest = [];
  for (let i = 0; i < words.length;) {
    let took = 0;
    for (let n = Math.min(D.vocabLongest, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(" ");
      let v = D.vocab.get(phrase);
      /* plurals the vocabulary does not list ("laptops", "vestido") */
      if (!v && n === 1) v = D.vocab.get(phrase.replace(/(es|s)$/, "")) || D.vocab.get(phrase + "s") || D.vocab.get(phrase + "es");
      if (v) { if (!concept) concept = v; took = n; break; }
    }
    if (took) { i += took; continue; }
    const w = words[i];
    if (AUDIENCE[w]) audience = audience || AUDIENCE[w];
    else if (!FILLER.has(w)) rest.push(w);
    i++;
  }
  if (!concept) return null;
  let [dept, t] = concept;
  const lensOf = (k, slug) => (slug && D.depts[k] && D.depts[k][1] && D.depts[k][1][slug] ? slug : "");
  let a = "";
  if (audience) {
    if (dept === "shoes" || dept === "shoes_women" || dept === "shoes_men") {
      if (audience === "women") { dept = "shoes_women"; t = ""; }
      else if (audience === "men") { dept = "shoes_men"; t = ""; }
      else { dept = "kids"; t = "zapatos"; }
    } else if (dept === "perfumes") {
      a = audience === "men" ? "hombre" : audience === "women" ? "mujer" : "";
    } else if (["women", "men", "kids", "clothing"].includes(dept) && D.depts[audience]) {
      dept = audience;
    } else if (dept === "ropa_interior" && audience === "women" && D.depts.ropa_interior_mujer) {
      dept = "ropa_interior_mujer";
    }
  }
  return { dept, t: lensOf(dept, t), a, rest };
}

/* ---------- what each product belongs to ---------- */
/* The store department field -> a departamento.html department. */
const DEPT_OF_FIELD = {
  women: "women", mujer: "women", moda_mujer: "women", latino_designers: "women", men: "men", hombre: "men", moda_hombre: "men", mens: "men",
  clothing: "clothing", ropa: "clothing", fashion: "clothing", unisex: "clothing", gorras: "clothing", kids: "kids", ropa_ninos: "kids",
  calzado_ninos: "kids", sporting_goods: "sporting_goods", fitness: "sporting_goods", gym_rat: "gym_rat", toys: "toys", toys_games: "toys",
  beauty: "beauty", belleza: "beauty", cuidado: "beauty", fragancias: "perfumes", testers: "perfumes", minis: "perfumes",
  jewelry: "joyas_accesorios", jewelry_accessories: "joyas_accesorios", accesorios: "joyas_accesorios", moms: "moms", bebe: "moms",
  purses: "purses", luxury_brands: "luxury", electronics: "electronics", home: "home_goods", hogar: "home_goods", small_home: "home_goods",
  home_decor: "home_decor", casa_decoracion: "home_decor", casa_velas: "home_decor", casa_iluminacion: "home_decor", combat_sports: "combat_sports",
  auto_parts: "auto_parts", repuestos: "auto_parts", calzado: "shoes", shoes: "shoes", footwear: "shoes", sunglasses: "sunglasses",
  books: "books", skate_snow: "surf_skate", balloons: "party", favors: "party", dulces: "candy_chocolate", calzones: "ropa_interior_mujer",
  brasieres: "ropa_interior_mujer", medias_panty: "ropa_interior_mujer",
};
export function deptOfProduct(p) {
  if (p._cat === "soccer") return "soccer";
  if (p.retailer === "ariaperfumes") return "perfumes";
  const f = String((p.departments && p.departments[0]) || "");
  if (/^tech_/.test(f)) return "electronics";
  if (/^cab_/.test(f)) return "cabello";
  if (/^casa_/.test(f)) return DEPT_OF_FIELD[f] || "home_goods";
  return DEPT_OF_FIELD[f] || (p._cat === "footwear" ? "shoes" : p._cat === "jewelry" ? "joyas_accesorios" : "");
}

/* Per-container indexes for rails with no query answer behind them. */
function railIndex(ctx, D) {
  if (ctx._destIdx) return ctx._destIdx;
  const byStore = new Map(), byBrand = new Map(), byDept = new Map();
  const push = (m, k, p) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, a = []); a.push(p); };
  for (const p of ctx.products) {
    if (!p.image) continue;
    if (D.stores[p.retailer]) push(byStore, p.retailer, p);
    const b = D.brandNames.get(nameKey(p.brand));
    if (b) push(byBrand, b, p);
    push(byDept, deptOfProduct(p), p);
  }
  const best = (a) => a.slice().sort((x, y) => (onSale(y) - onSale(x)) || ((y.reviews || 0) - (x.reviews || 0))).slice(0, RAIL_ITEMS);
  return (ctx._destIdx = { byStore, byBrand, byDept, best });
}
const onSale = (p) => (Number(p.originalPrice) > Number(p.price) ? 1 : 0);

/* ---------- spelling: the closest name ---------- */
export function editDistance(a, b, max = 9) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
const fuzzyMax = (len) => (len < 4 ? 0 : len < 6 ? 1 : len < 9 ? 2 : 3);
/* The closest name in `names` (Map name -> key): { key, d } or null. */
function closest(names, k, weight = () => 0) {
  const max = fuzzyMax(k.length);
  let best = null;
  for (const [n, key] of names) {
    if (Math.abs(n.length - k.length) > max + 0 && !(n.startsWith(k) && k.length >= 4 && k.length >= n.length * 0.6)) continue;
    const d = n.startsWith(k) && k.length >= 4 && k.length >= n.length * 0.6 ? Math.min(1, n.length - k.length) : editDistance(k, n, max);
    if (d > max) continue;
    if (!best || d < best.d || (d === best.d && weight(key) > weight(best.key))) best = { key, d };
  }
  return best;
}

/* ---------- reading the engine's answer ---------- */
const brandOfHit = (D, p) => D.brandNames.get(nameKey(p.brand)) || "";
function tally(list, keyOf) {
  const n = new Map();
  for (const p of list) { const k = keyOf(p); if (k) n.set(k, (n.get(k) || 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]);
}
/* Query words found in most of `list` (the department endpoint matches
   words in titles): its narrowing, or "". */
function narrowing(q, list) {
  if (!list.length) return "";
  const hay = list.map((p) => (String(p.title || "") + " " + String(p.brand || "")).toLowerCase());
  const keep = wordsOf(q).filter((w) => w.length >= 2 && !FILLER.has(w) && !AUDIENCE[w])
    .filter((w) => hay.filter((h) => h.includes(w)).length >= Math.max(4, list.length * 0.5));
  return keep.join(" ");
}
const ACCESSORY_RX = /\b(cases?|covers?|fundas?|forros?|estuches?|cargador(es)?|chargers?|micas?|protector(es)?|cables?|soportes?|holders?)\b/;
const DEVICE_RX = /\b(iphone|ipad|airpods|samsung|galaxy|pixel|motorola|xiaomi|celular(es)?|telefonos?|phones?|smartphones?|laptops?|macbook|tablets?|tabletas?|switch|ps5|xbox)\b/;
/* "iphone 15 case": the case is not the phone, and its makers are many --
   the shopper chooses (the electronics door narrowed to the accessory). */
export const isAccessoryQuery = (q) => ACCESSORY_RX.test(deaccent(q)) && DEVICE_RX.test(deaccent(q));
const ACCESSORY_EN = [[/\b(cases?|fundas?|forros?|estuches?|covers?)\b/, "case"], [/\b(cargador(es)?|chargers?)\b/, "charger"],
  [/\b(micas?|protector(es)?)\b/, "screen protector"], [/\bcables?\b/, "cable"]];

/* ---------- one query, one destination (#443 c.6585818498, c.6585840723) ----------
   Every variant of a name routes as one query: the router reads the
   ROUTE KEY, never the typed text. It starts from the engine's canonical
   form (_search-core.js canonicalTokens: case, accents, punctuation,
   numerals, joined/apart) and adds, by rule:
     - brand initials: a brand whose name has two or more words or
       capitalised parts answers to its initials and its numbers
       ("New Balance" -> nb, "PlayStation 5" -> ps5), when those
       initials are one brand's (or one brand's by far), are not a word
       Aria's vocabulary or a store knows, and are rare in titles;
     - spelling: a word nothing knows (5+ letters, under 3 titles) is
       the closest known name -- a brand, a store, a product or
       category word, a word 5+ titles carry -- within one edit (two
       from ten letters); a tie goes to Aria's own names, then to the
       word the catalogue writes next to its neighbours;
     - singular and plural: a word is its -s/-es family's one member --
       a brand's or store's name when one is (its name plus -s), else the form
       titles carry most (Spanish, which titles do not carry: the plural);
     - word order: the store the query names, or else its biggest brand
       (50+ products), leads ("samba adidas" is "adidas samba"); a name
       under three letters stays where it is (it reads as a word).
   The router's answer depends only on the key, so every variant gets
   the identical destination, alternatives and url. */
const KEY_TYPO_MIN = 5, KEY_TYPO_RARE = 3, KEY_MODEL_WORD = 20, KEY_TYPO_TARGET = 5, ABBR_RARE = 200, ABBR_BRAND_MIN = 10;
function lexicon(ctx, D) {
  if (D._lex) return D._lex;
  const W = (ctx.products && ctx.products._windex) || new Map();
  const freq = (w) => { const l = W.get(w); return l ? l.length : 0; };
  /* Aria's own names and words (tier 1) and the catalogue's (tier 2). */
  const own = new Set();
  const addWords = (s) => { for (const w of wordsOf(s)) if (w.length >= 2) own.add(w); };
  for (const k of D.brandNames.keys()) own.add(k);
  for (const k of D.storeNames.keys()) own.add(k);
  for (const [, [label]] of Object.entries(D.brands)) addWords(label);
  for (const label of Object.values(D.stores)) addWords(label);
  for (const k of D.vocab.keys()) addWords(k);
  for (const k of D.productWords.keys()) addWords(k);
  for (const k of D.en.keys()) addWords(k);
  for (const w of dictWords(ctx)) own.add(w);
  for (const w of Object.keys(AUDIENCE)) own.add(w);
  const typo = new Map();
  const put = (w, tier) => { if (!/^[a-z]+$/.test(w) || w.length < 4) return; const was = typo.get(w); if (!was || tier < was.tier) typo.set(w, { tier, n: freq(w) }); };
  for (const w of own) put(w, 1);
  for (const [w, l] of W) if (l.length >= KEY_TYPO_TARGET) put(w, 2);
  const byLen = new Map();
  for (const [w, v] of typo) { let a = byLen.get(w.length); if (!a) byLen.set(w.length, a = []); a.push([w, v]); }
  /* Brand initials -> the brand's words. */
  const initials = new Map();
  for (const [key, [label, n]] of Object.entries(D.brands)) {
    if (n < ABBR_BRAND_MIN) continue;
    const parts = String(label).normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/)
      .flatMap((p) => p.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z])/)).filter(Boolean);
    const alpha = parts.filter((p) => /^[A-Za-z]{2,}$/.test(p));
    if (alpha.length < 2) continue;
    const ab = parts.map((p) => (/^\d+$/.test(p) ? p : /^[A-Za-z]{2,}$/.test(p) ? p[0] : "")).join("").toLowerCase();
    if (ab.length < 2) continue;
    let a = initials.get(ab); if (!a) initials.set(ab, a = []); a.push([key, n]);
  }
  const abbr = new Map();
  for (const [ab, list] of initials) {
    list.sort((x, y) => y[1] - x[1]);
    if (list.length > 1 && list[0][1] < 5 * list[1][1]) continue;
    if (own.has(ab) || FILLER.has(ab) || STORE_FILLER.has(ab) || STORE_ALIASES[ab] || freq(ab) >= ABBR_RARE) continue;
    abbr.set(ab, wordsOf(D.brands[list[0][0]][0]));
  }
  return (D._lex = { own, typo, byLen, abbr, freq });
}
const lexLess = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
/* The closest known word to an unknown one, or "". */
function respelled(ctx, L, D, w, prev, next) {
  if (w.length < KEY_TYPO_MIN || !/^[a-z]+$/.test(w) || L.own.has(w) || L.freq(w) >= KEY_TYPO_RARE) return "";
  /* The start of a store's or brand's name is that name (storeOf). */
  for (const names of [D.storeNames, D.brandNames]) for (const n of names.keys()) if (n.startsWith(w) && w.length >= n.length * 0.5) return "";
  const max = w.length >= 10 ? 2 : 1;
  let best = null;
  for (let len = w.length - max; len <= w.length + max; len++) {
    for (const [c, v] of L.byLen.get(len) || []) {
      const d = editDistance(w, c, max);
      if (d > max) continue;
      const side = (prev ? pairCount(ctx, prev, c) : 0) + (next ? pairCount(ctx, c, next) : 0);
      const rank = [d, v.tier, -side, -v.n];
      if (!best || lexLess(rank, best.rank)) best = { c, rank };
    }
  }
  return best ? best.c : "";
}
/* The -s/-es family member Aria's vocabulary uses, or the word. */
function singularPlural(L, D, w) {
  if (w.length < 4 || !/^[a-z]+$/.test(w) || D.brandNames.has(w) || D.storeNames.has(w)) return w;
  const bases = new Set([w]);
  if (w.endsWith("s")) bases.add(w.slice(0, -1));
  if (w.endsWith("es")) bases.add(w.slice(0, -2));
  const fam = new Set();
  for (const b of bases) if (b.length >= 3) { fam.add(b); fam.add(b + "s"); fam.add(b + "es"); }
  /* Its members: the forms Aria's vocabulary or the catalogue
     (KEY_MODEL_WORD titles) writes -- a brand's own name among them. */
  const members = [...fam].filter((m) => L.own.has(m) || L.freq(m) >= KEY_MODEL_WORD);
  if (!members.length) return w;
  const named = members.find((m) => D.brandNames.has(m) || D.storeNames.has(m));
  if (named) return named;
  members.sort((a, b) => (L.freq(b) - L.freq(a)) || (Number(b.endsWith("s")) - Number(a.endsWith("s"))) || (a < b ? -1 : 1));
  return members[0];
}
/** The route key of a query: the one text every variant of it routes as. */
export function routeKey(ctx, D, q) {
  const memo = D._keys || (D._keys = new Map());
  const typed = String(q == null ? "" : q).trim().slice(0, 120);
  const mk = typed.toLowerCase();
  if (memo.has(mk)) return memo.get(mk);
  const L = lexicon(ctx, D);
  let toks = canonicalTokens(ctx, typed);
  /* Brand initials ("nb 550", "ps5"). */
  const ab = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], n = toks[i + 1];
    if (L.abbr.has(t)) { ab.push(...L.abbr.get(t)); continue; }
    if (n && /^\d+$/.test(n) && L.abbr.has(t + n)) { ab.push(...L.abbr.get(t + n)); i++; continue; }
    ab.push(t);
  }
  toks = ab;
  /* Spelling, then singular/plural. */
  toks = toks.map((t, i) => respelled(ctx, L, D, t, toks[i - 1], toks[i + 1]) || t);
  toks = toks.map((t) => singularPlural(L, D, t));
  /* The store, or else the biggest brand, the query names leads. */
  if (toks.length >= 2 && toks.length <= 4) {
    const skip = (p) => D.vocab.has(p) || FILLER.has(p) || !!AUDIENCE[p];
    let lead = null;
    for (let i = 0; i < toks.length; i++) {
      for (let j = Math.min(toks.length, i + 4); j > i; j--) {
        const k = toks.slice(i, j).join("");
        if (k.length < 3 || skip(toks.slice(i, j).join(" "))) continue;
        const w = D.storeNames.has(k) ? 1e9 + (j - i) : D.brandNames.has(k) ? D.brands[D.brandNames.get(k)][1] : -1;
        if (w < 0) continue;
        if (!lead || w > lead.w) lead = { from: i, to: j, w };
        break;
      }
    }
    if (lead && lead.from > 0 && lead.w >= 50) toks = [...toks.slice(lead.from, lead.to), ...toks.slice(0, lead.from), ...toks.slice(lead.to)];
  }
  const key = toks.join(" ");
  memo.set(mk, key);
  if (memo.size > 5000) memo.delete(memo.keys().next().value);
  return key;
}

/* ---------- the router ---------- */
/**
 * Where `q` lands: { q, destination, alternatives, chooser? }.
 * destination.kind: "store" | "brand" | "category" | "chooser".
 */
export function destinationFor(ctx, q, { fx = null, read = readRepoFile } = {}) {
  const D = destinations(ctx, read);
  const typed = String(q == null ? "" : q).trim().replace(/\s+/g, " ").slice(0, 120);
  /* The router reads the route key: every variant of a name is one query. */
  const query = routeKey(ctx, D, typed) || typed;
  const out = routeOf(ctx, D, query, fx, read, 0);
  out.q = typed;
  if (query !== typed) out.canonical = query;
  if (out.chooser) out.chooser.title = out.chooser.title.replace("“" + query + "”", "“" + typed + "”");
  return out;
}
/* Known words: the catalogue carries them, or Aria's vocabulary does. */
function isKnownWord(ctx, D, w) {
  const L = lexicon(ctx, D);
  return L.own.has(w) || L.freq(w) >= KEY_TYPO_RARE;
}
function routeOf(ctx, D, query, fx, read, depth) {
  const words = wordsOf(query);
  const key = nameKey(query);
  if (key.length < 2) return chooserAnswer(ctx, D, query, [], fx, "short");

  const direct = resolveDirect(D, query, words);
  const r = equivalentQuery(ctx, query);
  const hits = r && r.state === "results" ? r.hits : [];
  if (direct) return withAlternatives(ctx, D, query, checked(D, direct, hits), hits);

  /* The engine read it as another spelling ("sephorra" -> "sephora"). */
  if (r && r.shown && nameKey(r.shown) !== key) {
    const fixed = resolveDirect(D, r.shown, wordsOf(r.shown));
    if (fixed) return withAlternatives(ctx, D, query, checked(D, fixed, hits), hits);
  }
  /* A store Aria sells without a storefront of its own ("best buy"): the
     chooser of what it carries -- its brands and categories. */
  const sf = storeFor(ctx, query);
  if (sf && !D.stores[sf]) {
    const shelf = ctx.products.filter((p) => p.retailer === sf && p.image).sort((x, y) => (y.reviews || 0) - (x.reviews || 0));
    if (shelf.length) return chooserAnswer(ctx, D, query, shelf, fx, "low");
  }
  if (hits.length && isAccessoryQuery(query)) return chooserAnswer(ctx, D, query, hits, fx, "low");
  if (hits.length) {
    const top = hits.slice(0, 100);
    /* One marquee brand holds half of what was found ("air force 1",
       "samba", "airpods"): its page, focused on the query. */
    const [b] = tally(top, (p) => brandOfHit(D, p));
    if (b && b[1] >= top.length * 0.5 && top.length >= 3 && !ACCESSORY_RX.test(deaccent(query)) &&
        (isMarquee(ctx, spaced(D.brands[b[0]][0])) || D.brands[b[0]][1] >= 100)) {
      const bw = new Set(wordsOf(D.brands[b[0]][0]));
      const model = words.filter((w) => !bw.has(w) && !FILLER.has(w)).join(" ");
      return withAlternatives(ctx, D, query, brandDest(D, b[0], model), hits);
    }
    /* One department holds most of it ("lego" -> Juguetes, narrowed). */
    const [d] = tally(top, deptOfProduct);
    if (d && d[1] >= top.length * 0.6 && top.length >= 3) {
      const inDept = top.filter((p) => deptOfProduct(p) === d[0]);
      const nq = narrowing(query, inDept);
      if (nq) return withAlternatives(ctx, D, query, deptDest(D, d[0], { q: nq }), hits);
    }
    return chooserAnswer(ctx, D, query, hits, fx, "low");
  }
  /* Unknown words beside known ones ("samba blorptastic", "nike air
     zoomzoom9000"): the known words route -- the closest real match,
     never a dead end. */
  if (!depth && words.length >= 2) {
    const known = words.filter((w) => isKnownWord(ctx, D, w));
    if (known.length && known.length < words.length && known.some((w) => !/^\d+$/.test(w) && !FILLER.has(w))) {
      const out = routeOf(ctx, D, known.join(" "), fx, read, 1);
      if (out.destination.kind !== "chooser" || out.chooser.reason !== "doors") return out;
    }
  }
  /* A miss: one close spelling of one kind lands there; otherwise the
     chooser of the closest store, brand and category. */
  const near = nearest(D, key, words);
  const exact1 = near.filter((n) => n.d <= 1 && key.length >= 5);
  if (exact1.length === 1) return withAlternatives(ctx, D, query, exact1[0].dest, [], near.filter((n) => n !== exact1[0]).map((n) => n.dest));
  return chooserAnswer(ctx, D, query, [], fx, near.length ? "miss" : "doors", near);
}

/* A category's narrowing stays only when what was found carries it
   (the department endpoint matches English title words). */
function checked(D, dest, hits) {
  if (dest.kind !== "category" || !dest.q || dest.ptype) return dest;
  const inDept = hits.filter((p) => deptOfProduct(p) === dest.key);
  const nq = narrowing(dest.q, inDept.length >= 8 ? inDept : hits);
  return deptDest(D, dest.key, { t: dest.t, a: new URLSearchParams(dest.url.split("?")[1]).get("a") || "", q: nq });
}

/* Store, brand and category read from the words alone. */
function resolveDirect(D, query, words) {
  /* A product word opens its type page (Danny's final ruling, c.6579541628):
     before a store, a brand or the department words -- "xbox" alone is
     the console, "celular" the Celulares page. */
  const pt = productTypeOf(D, query);
  if (pt) return { ...typeDest(D, pt), ptype: pt };
  const s = storeOf(D, query);
  if (s) return storeDest(D, s);
  /* A store's name, then what to look for there ("gap hoodie"). */
  const ss = spanOf(D.storeNames, words, { minLen: 3, skip: (p) => D.vocab.has(p) });
  if (ss && ss.from === 0) {
    const rest = restOf(words, ss);
    if (rest) return storeDest(D, ss.key, rest);
  }
  const key = nameKey(query);
  const cat = categoryOfQuery(D, query);
  const pureCat = cat && !cat.rest.length;
  /* A brand's name. A category word that is also a small brand's name
     ("Dress", "Toys") stays the category. */
  if (D.brandNames.has(key)) {
    const bk = D.brandNames.get(key);
    if (!pureCat || D.brands[bk][1] >= 300) return brandDest(D, bk);
  }
  /* A brand inside the query: brand + model ("nike air force 1",
     "zapatillas nike", "converse all star"). */
  const bs = spanOf(D.brandNames, words, { minLen: 3, skip: (p) => D.vocab.has(p) || FILLER.has(p) || !!AUDIENCE[p] });
  if (bs && (bs.from === 0 || D.brands[bs.key][1] >= 50)) {
    const rest = restOf(words, bs);
    return brandDest(D, bs.key, rest);
  }
  if (cat) {
    /* Words beyond the category narrow it only when they are English the
       department's titles carry (its endpoint matches title words). */
    const extra = cat.rest.map((w) => D.en.get(w) || w).filter((w) => /^[a-z0-9 -]+$/.test(w));
    return deptDest(D, cat.dept, { t: cat.t, a: cat.a, q: extra.join(" ") });
  }
  return null;
}

/* The closest store, brand and category by spelling, each a destination. */
function nearest(D, key, words = []) {
  const all = [key, ...words.filter((w) => w.length >= 4 && !FILLER.has(w) && !STORE_FILLER.has(w)).map(nameKey)];
  const best = new Map();
  for (const k of [...new Set(all)]) for (const n of nearestOne(D, k)) if (!best.has(n.kind) || n.d < best.get(n.kind).d) best.set(n.kind, n);
  return [...best.values()].sort((x, y) => x.d - y.d);
}
function nearestOne(D, key) {
  const out = [];
  if (key.length < 3) return out;
  const s = closest(D.storeNames, key);
  if (s) out.push({ kind: "store", d: s.d, dest: storeDest(D, s.key) });
  const b = closest(D.brandNames, key, (k) => D.brands[k][1]);
  if (b) out.push({ kind: "brand", d: b.d, dest: brandDest(D, b.key) });
  const vn = new Map();
  for (const [w, v] of D.vocab) vn.set(w.replace(/ /g, ""), v);
  const c = closest(vn, key);
  if (c) out.push({ kind: "category", d: c.d, dest: deptDest(D, c.key[0], { t: c.key[1] || "" }) });
  return out.sort((x, y) => x.d - y.d);
}

/* The other close matches, one tap sideways from the landing. */
function alternativesFor(ctx, D, query, dest, hits, extra = []) {
  const out = [], seen = new Set([dest.kind + ":" + dest.key]);
  const add = (a) => { if (!a) return; const k = a.kind + ":" + a.key; if (seen.has(k) || out.length >= ALT_MAX) return; seen.add(k); out.push(a); };
  const words = wordsOf(query), key = nameKey(query);
  /* The same name as a store and a brand (Crocs, New Balance). */
  if (D.brandNames.has(key)) add(brandDest(D, D.brandNames.get(key)));
  const s = storeOf(D, query);
  if (s) add(storeDest(D, s));
  const cat = categoryOfQuery(D, query);
  if (cat) add(deptDest(D, cat.dept, { t: cat.t, a: cat.a }));
  extra.forEach(add);
  /* The landing's own shelf when the answer is about something else
     (a store's name, a bare brand, a category the words name but the
     engine reads otherwise -- «boxeo» finds boxers). */
  const idx = railIndex(ctx, D);
  const inDept = dest.kind === "category" ? hits.filter((p) => deptOfProduct(p) === dest.key) : [];
  const own = dest.kind === "store" ? idx.byStore.get(dest.key) : dest.kind === "brand" && !dest.q ? idx.byBrand.get(dest.key)
    : dest.kind === "category" && inDept.length < 10 ? idx.byDept.get(dest.key) : null;
  const top = own || (inDept.length ? inDept : hits).slice(0, 300);
  if (top.length) {
    const sq = own ? "" : query;
    const [ts] = tally(top, (p) => (D.stores[p.retailer] ? p.retailer : ""));
    if (ts && ts[1] >= 3) add(storeDest(D, ts[0], nameKey(sq) === nameKey(D.stores[ts[0]]) ? "" : sq));
    const [tb] = tally(top, (p) => brandOfHit(D, p));
    if (tb && tb[1] >= 3) {
      const bw = new Set(wordsOf(D.brands[tb[0]][0]));
      const model = own ? "" : words.filter((w) => !bw.has(w) && !FILLER.has(w)).join(" ");
      add(brandDest(D, tb[0], model));
    }
    const [td] = tally(top, deptOfProduct);
    if (td && td[1] >= 3) add(deptDest(D, td[0]));
  }
  return out;
}
function withAlternatives(ctx, D, query, dest, hits, extra = []) {
  /* A model with unknown words beside known ones keeps the known ones. */
  if (dest.q && (dest.kind === "brand" || dest.kind === "store")) {
    const w = wordsOf(dest.q), known = w.filter((x) => isKnownWord(ctx, D, x));
    if (known.length && known.length < w.length) dest = dest.kind === "brand" ? brandDest(D, dest.key, known.join(" ")) : storeDest(D, dest.key, known.join(" "));
  }
  /* An unambiguous product word: its sibling types and its department
     only -- no brand or store guess that contradicts the word. */
  const alternatives = dest.ptype ? typeAlternatives(D, dest.ptype) : alternativesFor(ctx, D, query, dest, hits, extra);
  const { ptype, ...clean } = dest;
  return { q: query, destination: { ...clean, ...(ptype ? { type: ptype } : {}), href: hrefWith(dest.url, alternatives) }, alternatives };
}
/* The landing url with its «También puede ser» list (&tp=). */
export function hrefWith(url, alternatives) {
  if (!alternatives || !alternatives.length) return url;
  return url + "&tp=" + enc(JSON.stringify(alternatives.map((a) => [a.kind, a.label, a.url])));
}

/* ---------- the chooser ---------- */
const DOOR_WORD = { store: "Tienda", brand: "Marca", category: "Categoría" };
const ENTRY_DOORS = [
  { kind: "entry", key: "ofertas", label: "Ofertas", url: "ofertas.html", door: "Ver las ofertas", note: "Lo que está en oferta hoy, en todas las tiendas." },
  { kind: "entry", key: "tiendas", label: "Todas las tiendas", url: "tiendas.html", door: "Ver las tiendas", note: "Cada tienda de Estados Unidos con su propia página." },
  { kind: "entry", key: "categorias", label: "Categorías", url: "categorias.html", door: "Ver las categorías", note: "Moda, zapatos, belleza, electrónica, juguetes y más." },
];
function railOf(ctx, D, dest, items, fx) {
  return { kind: dest.kind, key: dest.key, label: dest.label, title: DOOR_WORD[dest.kind] + " · " + dest.label, url: dest.url,
    door: "Ver todo en " + dest.label, n: items.length, items: items.slice(0, RAIL_ITEMS).map((p) => cardOf(p, fx, ctx.labels)) };
}
function chooserAnswer(ctx, D, query, hits, fx, reason, near = []) {
  const rails = [];
  const idx = railIndex(ctx, D);
  if (hits.length) {
    /* From the answer: the store carrying most of it, the brand, the
       category -- each with its own products from the answer. */
    const top = hits.slice(0, 200);
    const pick = (keyOf, make) => {
      const [t] = tally(top, keyOf);
      if (!t || t[1] < 2) return;
      const items = hits.filter((p) => p.image && keyOf(p) === t[0]);
      rails.push(railOf(ctx, D, make(t[0], items), items, fx));
    };
    pick((p) => (D.stores[p.retailer] ? p.retailer : ""), (k) => storeDest(D, k, query));
    pick((p) => brandOfHit(D, p), (k) => {
      const bw = new Set(wordsOf(D.brands[k][0]));
      return brandDest(D, k, wordsOf(query).filter((w) => !bw.has(w) && !FILLER.has(w)).join(" "));
    });
    if (isAccessoryQuery(query) && D.depts.electronics) {
      const acc = (ACCESSORY_EN.find(([rx]) => rx.test(deaccent(query))) || [, ""])[1];
      const items = hits.filter((p) => p.image && deptOfProduct(p) === "electronics");
      rails.push(railOf(ctx, D, deptDest(D, "electronics", { q: acc }), items.length ? items : hits.filter((p) => p.image), fx));
    } else pick(deptOfProduct, (k, items) => deptDest(D, k, { q: narrowing(query, items) }));
  } else {
    /* A miss: the closest names, each with its own best products. */
    for (const n of near) {
      const list = n.kind === "store" ? idx.byStore.get(n.dest.key) : n.kind === "brand" ? idx.byBrand.get(n.dest.key) : idx.byDept.get(n.dest.key);
      rails.push(railOf(ctx, D, n.dest, idx.best(list || []), fx));
    }
  }
  const out = rails.slice(0, CHOOSER_MAX);
  const doors = !out.length;
  return {
    q: query,
    destination: { kind: "chooser", key: doors ? "doors" : reason, label: "Elige por dónde seguir", url: "search.html?q=" + enc(query) },
    alternatives: [],
    chooser: {
      reason: doors ? "doors" : reason,
      title: doors || reason === "miss" ? "No encontramos “" + query + "”" : "¿Dónde quieres buscar “" + query + "”?",
      sub: doors ? "Empieza por aquí:" : reason === "miss" ? "Lo más parecido que tenemos:" : "Elige una tienda, una marca o una categoría:",
      rails: doors ? ENTRY_DOORS.map((d) => ({ ...d, title: d.label, n: 0, items: [] })) : out,
    },
  };
}
