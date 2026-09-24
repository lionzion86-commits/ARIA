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
  polo: "polo shirt",
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
