/* ============================================================
   SPANISH → ENGLISH, BEFORE THE QUERY LEAVES FOR A US RETAILER

   THE BUG THIS EXISTS FOR, reported live: a shopper types "celular" and
   gets nonsense, because "celular" went to Walmart's search verbatim and
   Walmart has never heard of it. A Peruvian shopper must never have to
   know the English word — that is the entire job of an import shop.

   WHAT WAS ALREADY HERE, AND WHY IT WAS NOT ENOUGH
   index.html had a SPANISH_SYNONYMS object: one word in, one word out,
   applied in doSearch(). Three holes, all of which the "celular" report
   is an instance of:

     1. It was a short list of apparel slang. "celular" was simply not in
        it, and neither was most of what a shopper types.
     2. It translated WORD BY WORD, so "plancha de cabello" stayed
        "plancha de cabello" — no single word maps, and the phrase is the
        only thing that means anything.
     3. Accents and plurals were literal keys. "audífonos" was mapped and
        "audifonos" separately; "celulares" would have missed even if
        "celular" had been there.

   HOW THIS ONE WORKS
     - PHRASES FIRST, longest first. "plancha de cabello" is matched and
       replaced before anything looks at "plancha", which on its own is
       an iron for clothes.
     - Accent- and case-insensitive. "Audífonos", "audifonos" and
       "AUDIFONOS" are one key.
     - Plurals fall back to the singular, so the table holds one entry per
       thing rather than two.
     - EVERYTHING ELSE PASSES THROUGH UNCHANGED. A brand, a model number,
       an English word a shopper already typed, a Spanish word that
       really does appear in US listings — none of it is touched. This
       never guesses; it only knows.

   NOT A TRANSLATOR. It is a retail vocabulary. Anything not in the table
   goes out exactly as typed, which is the same behaviour as before for
   every query this does not recognise.
   ============================================================ */

/** Lowercase, strip accents, collapse whitespace. */
export function normalizeQueryText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* MULTI-WORD PHRASES. Checked before single words, longest first, because
   the phrase means something its parts do not: "plancha de cabello" is a
   hair straightener, "plancha" alone is a clothes iron. */
export const ES_EN_PHRASES = [
  ["plancha de cabello", "hair straightener"],
  ["plancha de pelo", "hair straightener"],
  ["secadora de cabello", "hair dryer"],
  ["secadora de pelo", "hair dryer"],
  ["base de maquillaje", "foundation makeup"],
  ["sombra de ojos", "eyeshadow"],
  ["esmalte de unas", "nail polish"],
  ["crema hidratante", "moisturizer"],
  ["protector solar", "sunscreen"],
  ["pasta de dientes", "toothpaste"],
  ["cepillo de dientes", "toothbrush"],
  ["papel higienico", "toilet paper"],
  ["pañales", "diapers"],
  ["toallas humedas", "baby wipes"],
  ["coche de bebe", "stroller"],
  ["silla de auto", "car seat"],
  ["olla arrocera", "rice cooker"],
  ["olla de presion", "pressure cooker"],
  ["freidora de aire", "air fryer"],
  ["licuadora de mano", "immersion blender"],
  ["maquina de afeitar", "electric shaver"],
  ["cortadora de cabello", "hair clippers"],
  ["reloj inteligente", "smartwatch"],
  ["audifonos inalambricos", "wireless earbuds"],
  ["parlante bluetooth", "bluetooth speaker"],
  ["cargador inalambrico", "wireless charger"],
  ["disco duro", "hard drive"],
  ["memoria usb", "usb flash drive"],
  ["tarjeta de memoria", "memory card"],
  ["consola de videojuegos", "game console"],
  ["ropa deportiva", "activewear"],
  ["ropa interior", "underwear"],
  ["traje de bano", "swimsuit"],
  /* REPORTED LIVE 2026-09-26: Danny's dad searched "aletas de buceo"
     and got zero results — the Dick's catalog already had the fin sets. */
  ["aletas de buceo", "diving fins"],
  ["zapatillas de correr", "running shoes"],
  ["zapatos de vestir", "dress shoes"],
  ["casaca de cuero", "leather jacket"],
  ["pantalon corto", "shorts"],
  ["lentes de sol", "sunglasses"],
  ["bloqueador solar", "sunscreen"],
  ["juego de sabanas", "sheet set"],
  ["maquina de coser", "sewing machine"],
  ["aspiradora robot", "robot vacuum"],
  ["cafetera electrica", "coffee maker"],
  /* "para niños" is how a Peruvian shopper says "for children" in
     general, while "niño" on its own is the boys' department. The phrase
     has to win, or a search for toys for the kids comes back boys-only. */
  ["para ninos", "kids"],
  ["para ninas", "girls"],
  ["para bebes", "baby"],
  ["para mujer", "womens"],
  ["para hombre", "mens"],
  /* PERU 2026-09-26: verified Peruvian usage against Falabella/Ripley Perú
     listings. Phrases win over single words (longest first), so these
     must come before their bare components are read. */
  /* "polo piqué" is the collared piqué-knit shirt (what the US calls a
     polo shirt). Hyphenated so the word pass below does not re-read
     "polo" as a plain T-shirt. */
  ["polo pique", "polo-shirt"],
  ["ropa de bano", "swimsuit"],
  ["salida de bano", "beach cover-up"],
  ["zapatillas de futbol", "soccer cleats"],
  ["zapatos de taco", "high heels"],
  ["buzo completo", "tracksuit"],
  ["pantalon de buzo", "sweatpants"],
  ["casaca jean", "denim jacket"],
  ["brillo labial", "lip gloss"],
  ["polvo compacto", "pressed powder"],
  ["balsamo labial", "lip balm"],
  ["protector labial", "lip balm"],
  ["agua micelar", "micellar water"],
  ["mascarilla facial", "face mask"],
  ["gel de ducha", "shower gel"],
  ["lima de unas", "nail file"],
  ["toalla higienica", "sanitary pads"],
  ["funda de celular", "phone case"],
  ["funda de almohada", "pillowcase"],
  ["funda de edredon", "duvet cover"],
  ["mesa de centro", "coffee table"],
  ["mesa de noche", "nightstand"],
  ["silla de oficina", "office chair"],
  ["reloj de pared", "wall clock"],
  ["cortina de bano", "shower curtain"],
  ["tabla de planchar", "ironing board"],
  ["tabla de picar", "cutting board"],
  ["juego de mesa", "board game"],
  ["aire acondicionado", "air conditioner"],
];

/* SINGLE WORDS. Keys are accent-free and singular; the lookup handles
   both. Everything the old SPANISH_SYNONYMS held is here, plus the
   categories a shopper actually types. */
export const ES_EN_WORDS = {
  // electronics — the category the live report came from
  celular: "cell phone",
  movil: "cell phone",
  telefono: "phone",
  computadora: "laptop",
  laptop: "laptop",
  ordenador: "computer",
  tableta: "tablet",
  pantalla: "monitor",
  televisor: "tv",
  television: "tv",
  tele: "tv",
  audifono: "headphones",
  auricular: "headphones",
  parlante: "speaker",
  altavoz: "speaker",
  cargador: "charger",
  bateria: "battery",
  camara: "camera",
  impresora: "printer",
  teclado: "keyboard",
  raton: "computer mouse",
  consola: "game console",
  videojuego: "video game",
  reloj: "watch",
  // apparel
  chompa: "sweater",
  // "remera" is the River Plate word for a tee; "ramera" is the common
  // misspelling of it and is kept only because the old table had it.
  remera: "t-shirt",
  ramera: "t-shirt",
  polera: "t-shirt",
  /* PERU 2026-09-26: "polo" is an ordinary T-shirt, not a collared polo
     shirt. Verified against Peruvian retail (Falabella/Gamarra listings).
     The collared one is "polo piqué" — see the phrase below. */
  polo: "t-shirt",
  camiseta: "t-shirt",
  camisa: "shirt",
  casaca: "jacket",
  chaqueta: "jacket",
  abrigo: "coat",
  buzo: "hoodie",
  pantalon: "pants",
  jean: "jeans",
  short: "shorts",
  falda: "skirt",
  vestido: "dress",
  blusa: "blouse",
  ropa: "clothing",
  media: "socks",
  calcetin: "socks",
  correa: "belt",
  gorra: "cap",
  sombrero: "hat",
  guante: "gloves",
  bufanda: "scarf",
  pijama: "pajamas",
  // footwear and bags
  zapatilla: "sneakers",
  // "tenis" is the everyday Peruvian word for trainers; "zapatilla" was
  // already here and "tenis" was not, so Aria found nothing for the term
  // most of her shoppers actually use.
  tenis: "sneakers",
  zapato: "shoes",
  calzado: "shoes",
  bota: "boots",
  sandalia: "sandals",
  cartera: "handbag",
  bolso: "handbag",
  billetera: "wallet",
  mochila: "backpack",
  maleta: "suitcase",
  // beauty
  labial: "lipstick",
  rimel: "mascara",
  pestanina: "mascara",
  delineador: "eyeliner",
  rubor: "blush",
  corrector: "concealer",
  perfume: "perfume",
  colonia: "cologne",
  fragancia: "fragrance",
  maquillaje: "makeup",
  serum: "serum",
  jabon: "soap",
  champu: "shampoo",
  shampoo: "shampoo",
  acondicionador: "conditioner",
  desodorante: "deodorant",
  // home and kitchen
  licuadora: "blender",
  cafetera: "coffee maker",
  tostadora: "toaster",
  microondas: "microwave",
  refrigeradora: "refrigerator",
  aspiradora: "vacuum cleaner",
  ventilador: "fan",
  lampara: "lamp",
  almohada: "pillow",
  sabana: "bed sheets",
  edredon: "comforter",
  toalla: "towel",
  cortina: "curtains",
  alfombra: "rug",
  colchon: "mattress",
  silla: "chair",
  mesa: "table",
  olla: "cooking pot",
  sarten: "frying pan",
  cuchillo: "knife",
  // kids, sport, misc
  juguete: "toy",
  muneca: "doll",
  pelota: "ball",
  bicicleta: "bicycle",
  patineta: "skateboard",
  mancuerna: "dumbbell",
  /* REPORTED LIVE 2026-09-26: "aletas" is the everyday Peruvian word for
     flippers; the plural falls back to this singular automatically. */
  aleta: "fins",
  vitamina: "vitamins",
  suplemento: "supplement",
  libro: "book",
  cuaderno: "notebook",
  mochilero: "backpack",
  herramienta: "tools",
  taladro: "drill",
  linterna: "flashlight",
  lente: "sunglasses",
  /* WHO IT IS FOR. A US catalogue files almost everything under a
     department, and "chompa mujer" searched literally finds nothing —
     the store has never seen the word. These are the difference between
     a search that returns the right aisle and one that returns none. */
  mujer: "womens",
  dama: "womens",
  hombre: "mens",
  varon: "mens",
  caballero: "mens",
  nino: "boys",
  nina: "girls",
  bebe: "baby",
  infantil: "kids",
  juvenil: "youth",
  // Colours, the other thing a shopper types that a US search cannot read.
  negro: "black",
  blanco: "white",
  rojo: "red",
  azul: "blue",
  verde: "green",
  amarillo: "yellow",
  morado: "purple",
  rosado: "pink",
  gris: "gray",
  dorado: "gold",
  plateado: "silver",
  // Materials, for the same reason.
  algodon: "cotton",
  cuero: "leather",
  lana: "wool",
  seda: "silk",
  acero: "steel",
  madera: "wood",
  /* PERU 2026-09-26: verified Peruvian usage (Falabella/Ripley Perú
     listings, Peru retail vocabulary). Keys are accent-free and singular;
     the lookup handles accents, plurals and the feminine swap.
     Deliberately NOT added: "taco" alone (food), "lima" alone (the city). */
  // apparel
  ojota: "flip flops",
  bividi: "tank top",
  chullo: "beanie",
  chalina: "scarf",
  chaleco: "vest",
  saco: "blazer",
  terno: "suit",
  corbata: "necktie",
  enterizo: "jumpsuit",
  mameluco: "overalls",
  calza: "leggings",
  pantimedia: "pantyhose",
  bermuda: "bermuda shorts",
  pareo: "sarong",
  bata: "bathrobe",
  pantufla: "slippers",
  alpargata: "espadrilles",
  botin: "ankle boots",
  ballerina: "ballet flats",
  balerina: "ballet flats",
  chimpun: "soccer cleats",
  // bags and carry
  canguro: "fanny pack",
  rinonera: "fanny pack",
  bandolera: "crossbody bag",
  morral: "messenger bag",
  neceser: "toiletry bag",
  monedero: "coin purse",
  tarjetero: "card holder",
  // home
  frazada: "blanket",
  manta: "throw blanket",
  colcha: "bedspread",
  velador: "nightstand",
  ropero: "wardrobe",
  comoda: "dresser",
  escritorio: "desk",
  repisa: "wall shelf",
  biblioteca: "bookcase",
  perchero: "coat rack",
  zapatera: "shoe rack",
  tendedero: "drying rack",
  felpudo: "doormat",
  cojin: "throw pillow",
  florero: "vase",
  portaretrato: "picture frame",
  espejo: "mirror",
  foco: "light bulb",
  vela: "candle",
  ambientador: "air freshener",
  difusor: "diffuser",
  humidificador: "humidifier",
  calefactor: "space heater",
  persiana: "blinds",
  canasto: "basket",
  // kitchen and dining
  tomatodo: "water bottle",
  termo: "thermos",
  taza: "mug",
  plato: "plate",
  cuchara: "spoon",
  tenedor: "fork",
  cubierto: "silverware",
  jarra: "pitcher",
  tetera: "teapot",
  hervidor: "electric kettle",
  arrocera: "rice cooker",
  batidora: "mixer",
  exprimidor: "juicer",
  sanguchera: "sandwich maker",
  waflera: "waffle maker",
  taper: "food storage container",
  colador: "colander",
  rallador: "grater",
  pelador: "peeler",
  abrelatas: "can opener",
  sacacorchos: "corkscrew",
  destapador: "bottle opener",
  secaplatos: "dish rack",
  repasador: "dish towel",
  delantal: "apron",
  mantel: "tablecloth",
  servilleta: "napkin",
  lonchera: "lunch box",
  // cleaning
  escoba: "broom",
  recogedor: "dustpan",
  trapeador: "mop",
  balde: "bucket",
  // baby and kids
  coche: "stroller",
  cuna: "crib",
  biberon: "baby bottle",
  chupon: "pacifier",
  panalera: "diaper bag",
  peluche: "stuffed animal",
  rompecabezas: "puzzle",
  triciclo: "tricycle",
  patin: "roller skates",
  cartuchera: "pencil case",
  // sport
  casco: "helmet",
  colchoneta: "exercise mat",
  vincha: "headband",
  // beauty
  esmalte: "nail polish",
  quitaesmalte: "nail polish remover",
  cortauna: "nail clipper",
  tinte: "hair dye",
  cepillo: "hair brush",
  peine: "comb",
  rizador: "curling iron",
  brocha: "makeup brush",
  desmaquillante: "makeup remover",
  bloqueador: "sunscreen",
  // misc
  paraguas: "umbrella",
  llavero: "keychain",
  pila: "battery",
  mica: "screen protector",
};

/* Plural endings, longest first. Spanish pluralises predictably enough
   that one rule saves a second entry for every noun in the table. */
const PLURAL_RULES = [
  [/ces$/, "z"],     // lapices -> lapiz
  [/es$/, ""],       // pantalones -> pantalon
  [/s$/, ""],        // zapatos -> zapato
];

/* Every form of a word worth looking up, most literal first. The
   feminine swap is what makes "zapatillas negras" work: the adjective
   agrees with the noun, so the table would otherwise need "negro" and
   "negra" and "negros" and "negras" as four separate rows. */
function lookupForms(w) {
  const forms = [w];
  for (const [re, replacement] of PLURAL_RULES) {
    if (re.test(w)) forms.push(w.replace(re, replacement));
  }
  for (const form of [...forms]) {
    if (/a$/.test(form)) forms.push(form.replace(/a$/, "o"));
  }
  return forms;
}

/** The English term for one Spanish word, or null. */
export function translateWord(word) {
  const w = normalizeQueryText(word);
  if (!w) return null;
  for (const form of lookupForms(w)) {
    if (ES_EN_WORDS[form]) return ES_EN_WORDS[form];
  }
  return null;
}

/* Words that carry no meaning for a retailer's search engine and only
   dilute it. Dropped ONLY when something else in the query translated —
   an all-English query is never touched. */
const FILLER = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "para", "con", "y"]);

/**
 * A shopper's query, in the language the retailer speaks.
 *
 * Returns { query, translated, changed } — `query` is what to search
 * with, and `translated` is true when anything was actually recognised,
 * so a caller can tell the shopper what we searched for.
 */
export function translateQuery(raw) {
  const original = String(raw || "").trim();
  if (!original) return { query: "", translated: false, changed: false };

  let text = normalizeQueryText(original);
  let hit = false;

  // Phrases first, longest first: the phrase means what its words do not.
  const phrases = [...ES_EN_PHRASES].sort((a, b) => b[0].length - a[0].length);
  for (const [es, en] of phrases) {
    if (text.includes(es)) {
      text = text.split(es).join(` ${en} `);
      hit = true;
    }
  }

  const words = text.split(/\s+/).filter(Boolean).map((w) => {
    const en = translateWord(w);
    if (en) { hit = true; return en; }
    return w;
  });

  /* NOTHING RECOGNISED, NOTHING TOUCHED. A query we do not know goes to
     the retailer exactly as the shopper typed it — same case, same
     accents, same word order. That covers brands, model numbers and
     anyone who already typed English, and it means this can only ever
     improve a search, never damage one. */
  if (!hit) return { query: original, translated: false, changed: false };

  /* Connectives are dropped only now that we know this really was a
     Spanish query: "de" is noise in "plancha de cabello" and a real
     token in "The North Face". Duplicates go the same way — "zapatos
     zapatillas" both resolve to shoes and searching for it twice narrows
     nothing. */
  const cleaned = words.filter((w) => !FILLER.has(w));
  const query = [...new Set(cleaned)].join(" ").trim();

  // A translation that produced nothing usable is not a translation.
  if (!query) return { query: original, translated: false, changed: false };
  return { query, translated: true, changed: query !== normalizeQueryText(original) };
}

/** Just the string, for callers that do not care whether anything changed. */
export function translateSearchQuery(raw) {
  return translateQuery(raw).query;
}
