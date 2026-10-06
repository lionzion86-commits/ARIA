/* ============================================================
   WHAT ARIA KNOWS ABOUT THE STORES.

   Aria could already search products. She could not answer "where
   should I even look?" — and that is the question a shopper actually
   opens with. "A mi nieto le gusta el skate" is not a product query;
   it is someone who needs a guide through a mall they have never
   walked. This file is that knowledge: what each store is, who it
   suits, and — just as important — who it does not.

   EVERY FIELD HERE IS MEASURED, NOT IMAGINED. The counts, the
   departments and the price bands were taken from the committed
   catalogues (the 59 files in CATALOGUE_FILES plus the four
   department caches) on 2026-10-06. The brief's own example entry
   put PacSun at "2,500 productos"; PacSun has eighteen. Zumiez has
   2,494 and CCS 13,736. Guessing at a catalogue is how Aria ends up
   sending a grandmother to a store with nothing in it, so nothing
   here is guessed.

   THE PRICE BAND IS COMPUTED, NOT ASSERTED. `price_range` comes from
   the store's median catalogue price against PRICE_BANDS below, and
   `median_usd` is kept beside it so the claim can be re-checked
   against the catalogue at any time. A median, not a mean: one
   $4,250 Miu Miu bag should not move a store's band.

   WHY A STORE CAN BE ABSENT. A store is in here when a committed
   catalogue actually carries its products. Twenty rows of the page's
   own RETAILERS registry — Best Buy, Nordstrom, Dyson, Sunglass Hut
   and the K-beauty brands among them — have a registry entry, a logo
   and a tagline, and zero products. They are listed in NOT_STOCKED
   so that Aria naming one is impossible rather than merely
   discouraged: section 4 of the brief is absolute, every store she
   mentions must have a live catalogue.

   NOTHING HERE INVENTS A SPECIALTY either. Where a store's Peruvian
   angle is real it is written down; where it would be filler,
   `peru_note` is null. An empty field is worth more than a sentence
   Aria would say out loud and be wrong about.
   ============================================================ */

/* Bands over the median catalogue price, in USD. The boundaries are
   the ones a shopper feels: under $30 is pocket money, $80 is where
   "that's a real purchase" starts, past $250 nobody calls it
   anything but lujo. */
export const PRICE_BANDS = [
  { band: "economico", maxMedianUsd: 30 },
  { band: "medio", maxMedianUsd: 80 },
  { band: "premium", maxMedianUsd: 250 },
  { band: "lujo", maxMedianUsd: Infinity },
];

export function priceBandFor(medianUsd){
  if (typeof medianUsd !== "number" || !(medianUsd > 0)) return null;
  for (const b of PRICE_BANDS) if (medianUsd < b.maxMedianUsd) return b.band;
  return "lujo";
}

/* A STORE TOO THIN TO SEND ANYONE TO. Eighteen products is a rail
   that looks broken, so a store under this floor can be asked about
   by name but is never offered as a recommendation. The floor is not
   a judgement on the store — it is a judgement on the experience of
   arriving there. */
export const MIN_RECOMMEND_DEPTH = 50;

/* Registry rows with no catalogue behind them. Aria is told these
   exist so she can answer honestly when a shopper names one, and she
   is never allowed to recommend them. */
export const NOT_STOCKED = {
  bestbuy: "Best Buy", nordstrom: "Nordstrom", dyson: "Dyson",
  sunglasshut: "Sunglass Hut", rockauto: "RockAuto", autozone: "AutoZone",
  bathandbodyworks: "Bath & Body Works", morphe: "Morphe",
  fendi: "Fendi", goldengoose: "Golden Goose", townley: "Townley",
  cosrx: "COSRX", anua: "Anua", laneige: "Laneige", medicube: "medicube",
  skin1004: "SKIN1004", beautyofjoseon: "Beauty of Joseon",
  mediheal: "Mediheal", everymanjack: "Every Man Jack", brickell: "Brickell",
  tenniswarehouse: "Tennis Warehouse",
};

/* ============================================================
   THE STORES.

   `specialties` are the words a shopper uses, in Spanish, because
   they are matched against what the shopper said. `not_for` is the
   field that earns its keep: it is what stops Aria sending someone
   to PacSun for a skateboard.
   ============================================================ */
export const STORE_KNOWLEDGE = {

  /* ---------- DE TODO / DEPARTAMENTALES ---------- */
  walmart: {
    name: "Walmart",
    vibe: "de todo y barato, lo esencial sin vueltas",
    specialties: ["juguetes", "hogar", "decoración", "dulces", "ropa básica", "esenciales"],
    price_range: "economico", median_usd: 23.99, product_count: 7562,
    catalog_depth: "7,562 productos",
    top_categories: ["juguetes", "decoración", "dulces y chocolates", "ropa"],
    best_for: "compras grandes, esenciales de casa, juguetes para niños sin gastar mucho",
    not_for: "marcas de moda o diseñador — para eso Macy's, SSENSE o Farfetch",
    peru_note: "Es la tienda que todo el mundo ya conoce de nombre, así que no hay que explicar qué es.",
  },
  target: {
    name: "Target",
    vibe: "como Walmart pero más bonito — mejor diseño por casi el mismo precio",
    specialties: ["juguetes", "hogar", "ropa de niños", "ropa casual", "decoración"],
    price_range: "medio", median_usd: 30.99, product_count: 15773,
    catalog_depth: "15,773 productos",
    top_categories: ["juguetes", "ropa de niños", "hogar", "ropa"],
    best_for: "juguetes, cosas de casa y ropa de niños con mejor diseño que Walmart",
    not_for: "equipo deportivo serio o marcas de lujo",
    peru_note: "LEGO, Barbie y Disney son el fuerte — las marcas que un papá peruano reconoce al instante.",
  },
  costco: {
    name: "Costco",
    vibe: "cantidad y marcas grandes, formato mayorista",
    specialties: ["hogar", "belleza", "dulces", "bebé", "muebles"],
    price_range: "medio", median_usd: 69.99, product_count: 1468,
    catalog_depth: "1,468 productos",
    top_categories: ["belleza", "hogar", "dulces y chocolates", "bebé"],
    best_for: "compras de volumen y marcas conocidas, Kirkland Signature",
    not_for: "una sola cosa pequeña — el formato es grande por diseño",
    peru_note: null,
  },
  samsclub: {
    name: "Sam's Club",
    vibe: "mayorista de fiesta y desechables",
    specialties: ["platos", "servilletas", "desechables", "fiesta"],
    price_range: "economico", median_usd: 19.73, product_count: 120,
    catalog_depth: "120 productos",
    top_categories: ["platos de papel", "servilletas", "decoración"],
    best_for: "cantidades grandes de desechables para un evento",
    not_for: "casi todo lo demás — el catálogo es solo de fiesta y desechables",
    peru_note: null,
  },
  macys: {
    name: "Macy's",
    vibe: "departamental clásico, marcas conocidas de vestir",
    specialties: ["ropa de mujer", "vestidos", "lencería", "ropa formal"],
    price_range: "medio", median_usd: 70.0, product_count: 754,
    catalog_depth: "754 productos",
    top_categories: ["moda mujer"],
    best_for: "un vestido o algo formal de marca conocida — Adrianna Papell, Donna Karan, Wacoal",
    not_for: "ropa de hombre o niños: el catálogo es casi todo mujer",
    peru_note: "Es la tienda departamental que suena a Estados Unidos sin sonar a lujo inalcanzable.",
  },
  kohls: {
    name: "Kohl's",
    vibe: "descuentos agresivos, familiar, sin pretensiones",
    specialties: ["ropa de hombre", "ropa de mujer", "hogar", "ropa familiar"],
    price_range: "economico", median_usd: 27.99, product_count: 1898,
    catalog_depth: "1,898 productos",
    top_categories: ["hombre", "moda mujer", "hogar", "ropa"],
    best_for: "vestir a toda la familia barato — marcas propias como Sonoma y Croft & Barrow",
    not_for: "marcas de diseñador o lo último de moda",
    peru_note: null,
  },
  oldnavy: {
    name: "Old Navy",
    vibe: "básicos de familia, colores y simpleza",
    specialties: ["ropa básica", "ropa de niños", "jeans"],
    price_range: null, median_usd: null, product_count: 168,
    catalog_depth: "168 productos",
    top_categories: ["ropa", "hombre", "mujer", "niños"],
    best_for: "básicos de todos los días para toda la familia",
    not_for: "nada que necesite precio exacto todavía — el catálogo entró sin precios",
    peru_note: null,
  },
  americaneagle: {
    name: "American Eagle",
    vibe: "jeans y casual juvenil americano",
    specialties: ["jeans", "ropa juvenil", "ropa casual"],
    price_range: "economico", median_usd: 24.99, product_count: 243,
    catalog_depth: "243 productos, todos en oferta",
    top_categories: ["mujer", "hombre"],
    best_for: "jeans y básicos juveniles — el catálogo completo está marcado en oferta",
    not_for: "ropa formal o de vestir",
    peru_note: null,
  },
  lanebryant: {
    name: "Lane Bryant",
    vibe: "moda de mujer en tallas grandes, hecha para quedar bien",
    specialties: ["tallas grandes", "curvy", "ropa de mujer", "lencería"],
    price_range: "medio", median_usd: 39.95, product_count: 169,
    catalog_depth: "169 productos",
    top_categories: ["mujer"],
    best_for: "tallas grandes de verdad, con corte pensado para la talla y no estirado",
    not_for: "tallas pequeñas o ropa de hombre",
    peru_note: "Las tallas americanas grandes son difíciles de encontrar en Lima — esta es la respuesta.",
  },

  /* ---------- SKATE Y SURF ----------
     Danny's own example lives here, and the catalogue backs the
     shape of it while correcting the cast. For real boards: CCS has
     6,207 hardware items, Surf Station 510, Zumiez 239. For the look
     without the board: Zumiez, 2,494 items and 1,904 of them on
     sale. PacSun — the brief's pick for skate fashion — has
     eighteen products, so it is below MIN_RECOMMEND_DEPTH and Aria
     cannot offer it. */
  ccs: {
    name: "CCS",
    vibe: "skate de verdad, la tienda de siempre de los skaters",
    specialties: ["patinetas", "tablas", "skate", "trucks", "ruedas", "griptape", "zapatillas de skate"],
    price_range: "medio", median_usd: 59.95, product_count: 13736,
    catalog_depth: "13,736 productos, 6,207 de skate",
    top_categories: ["deportes", "ropa", "moda niños", "moda mujer"],
    best_for: "una tabla completa o armarla por partes — decks desde $62, completas desde $125. Powell-Peralta, Santa Cruz, DGK, Vans",
    not_for: "nada: para patinar de verdad esta es la primera y la más honda",
    peru_note: "Una tabla completa de marca no se encuentra fácil en Lima, y menos a este precio.",
  },
  zumiez: {
    name: "Zumiez",
    vibe: "skate y streetwear juvenil, la tienda del mall donde van los chibolos",
    specialties: ["ropa skate", "streetwear", "jeans skate", "patinetas", "tablas", "zapatillas", "accesorios"],
    price_range: "medio", median_usd: 39.99, product_count: 2494,
    catalog_depth: "2,494 productos, 1,904 en oferta",
    top_categories: ["moda mujer", "accesorios", "calzado", "moda hombre"],
    best_for: "el look skate completo — jeans Empyre, Ed Hardy, True Religion, Nike. Tres de cada cuatro productos están en oferta",
    not_for: "armar una tabla por partes con mucha variedad — tiene 239 artículos de skate contra los 6,207 de CCS",
    peru_note: "El estilo skate es enorme en la costa — Miraflores, Barranco, Punta Hermosa.",
  },
  pacsun: {
    name: "PacSun",
    vibe: "surf y skate californiano, relajado",
    specialties: ["ropa surf", "ropa skate", "streetwear juvenil"],
    price_range: "medio", median_usd: 60.6, product_count: 18,
    catalog_depth: "18 productos — catálogo mínimo por ahora",
    top_categories: ["deportes"],
    best_for: "nada todavía: con 18 productos no alcanza para mandar a nadie",
    not_for: "todo, por ahora. Para el look skate, Zumiez; para tablas, CCS",
    peru_note: null,
  },
  surfstation: {
    name: "Surf Station",
    vibe: "surf shop de playa de verdad, con taller",
    specialties: ["tablas de surf", "wetsuits", "neopreno", "quillas", "surf", "patinetas"],
    price_range: "medio", median_usd: 63.6, product_count: 6173,
    catalog_depth: "6,173 productos, 2,144 de surf",
    top_categories: ["deportes", "moda hombre", "moda mujer", "ropa"],
    best_for: "equipo de surf serio: tablas, wetsuits, quillas, leashes. También 510 artículos de skate",
    not_for: "moda de ciudad",
    peru_note: "El agua en la costa peruana es fría todo el año — el wetsuit no es lujo, es necesario.",
  },
  islandwatersports: {
    name: "Island Water Sports",
    vibe: "surf shop completo, familiar",
    specialties: ["tablas de surf", "wetsuits", "surf", "ropa de playa", "patinetas"],
    price_range: "medio", median_usd: 45.0, product_count: 8891,
    catalog_depth: "8,891 productos, 497 de surf",
    top_categories: ["ropa", "deportes", "moda niños", "moda mujer"],
    best_for: "surf y playa para toda la familia, el catálogo más ancho de ropa de los surf shops",
    not_for: "la mayor variedad de tablas — para eso Surf Station",
    peru_note: "Punta Hermosa, Punta Rocas, Máncora: el equipo de playa se usa todo el año.",
  },
  parrot: {
    name: "Parrot Surf & Skate",
    vibe: "surf y skate en la misma tienda, de barrio",
    specialties: ["surf", "patinetas", "ropa de playa", "tablas"],
    price_range: "medio", median_usd: 54.95, product_count: 4019,
    catalog_depth: "4,019 productos",
    top_categories: ["ropa", "deportes", "moda niños", "moda mujer"],
    best_for: "surf y skate juntos sin decidirse por uno",
    not_for: "la variedad de una tienda especializada en solo uno de los dos",
    peru_note: null,
  },
  valsurf: {
    name: "Val Surf",
    vibe: "surf shop clásico del valle, desde 1962",
    specialties: ["surf", "snow", "ropa de playa"],
    price_range: "medio", median_usd: 68.99, product_count: 3207,
    catalog_depth: "3,207 productos",
    top_categories: ["ropa", "deportes", "moda mujer", "moda niños"],
    best_for: "surf, skate y snow en una sola tienda",
    not_for: "patinetas — tiene un solo artículo de skate. Para tablas, CCS",
    peru_note: null,
  },
  mainland: {
    name: "Mainland Skate & Surf",
    vibe: "skate y surf, selección curada",
    specialties: ["patinetas", "ropa skate"],
    price_range: "medio", median_usd: 48.99, product_count: 2238,
    catalog_depth: "2,238 productos",
    top_categories: ["ropa", "deportes", "moda niños", "moda mujer"],
    best_for: "ropa de skate y surf con buena selección",
    not_for: "armar una tabla — 32 artículos de hardware",
    peru_note: null,
  },
  quietstorm: {
    name: "Quiet Storm Surf Shop",
    vibe: "surf shop de Florida, relajado y barato",
    specialties: ["ropa de playa", "bikinis"],
    price_range: "medio", median_usd: 38.74, product_count: 456,
    catalog_depth: "456 productos",
    top_categories: ["ropa", "moda niños", "moda mujer", "deportes"],
    best_for: "ropa de playa sencilla y económica",
    not_for: "equipo de surf — casi no tiene",
    peru_note: null,
  },
  surfworld: {
    name: "Surf World",
    vibe: "surf shop",
    specialties: ["surf"],
    price_range: "medio", median_usd: 55.95, product_count: 3,
    catalog_depth: "3 productos — prácticamente vacío",
    top_categories: ["deportes"],
    best_for: "nada: tres productos no son una tienda",
    not_for: "todo. Para surf, Surf Station o Island Water Sports",
    peru_note: null,
  },
  nautilus: {
    name: "Nautilus Spearfishing",
    vibe: "pesca submarina y apnea, especialista puro",
    specialties: ["pesca submarina", "arpón", "apnea", "buceo", "wetsuits"],
    price_range: "medio", median_usd: 59.95, product_count: 501,
    catalog_depth: "501 productos",
    top_categories: ["deportes", "ropa"],
    best_for: "pesca submarina en serio: arpones, trajes, aletas",
    not_for: "surf o natación recreativa",
    peru_note: "La pesca submarina tiene seguidores fieles en la costa peruana y el equipo casi no se consigue local.",
  },

  /* ---------- BELLEZA ----------
     Verification #2 of the brief wants the three told apart, and the
     catalogue tells them apart cleanly: Sephora 2,003 products with
     prestige houses, Ulta 690 leaning salon and drugstore, Target
     basics inside a general store, YesStyle 1,225 K-beauty at a
     median of $17.50. */
  sephora: {
    name: "Sephora",
    vibe: "belleza premium, las marcas que salen en todos lados",
    specialties: ["maquillaje", "skincare", "perfumes", "belleza"],
    price_range: "medio", median_usd: 32.0, product_count: 2003,
    catalog_depth: "2,003 productos",
    top_categories: ["belleza"],
    best_for: "las marcas de prestigio: NARS, Dior, Lancôme, Rare Beauty, tarte",
    not_for: "productos de peluquería profesional — para eso Ulta",
    peru_note: "Sephora sí existe en Lima, pero el catálogo de allá es más corto y más caro que el de acá.",
  },
  ulta: {
    name: "Ulta Beauty",
    vibe: "belleza accesible, de farmacia a salón en la misma tienda",
    specialties: ["maquillaje", "skincare", "cuidado del cabello", "belleza"],
    price_range: "economico", median_usd: 25.0, product_count: 690,
    catalog_depth: "690 productos",
    top_categories: ["belleza"],
    best_for: "mezclar marcas de farmacia con salón: NYX, Clinique, Redken, Sol de Janeiro",
    not_for: "la variedad de marcas de prestigio que tiene Sephora",
    peru_note: null,
  },
  yesstyle: {
    name: "YesStyle",
    vibe: "K-beauty y belleza asiática, barato de verdad",
    specialties: ["skincare", "k-beauty", "belleza coreana", "maquillaje"],
    price_range: "economico", median_usd: 17.5, product_count: 1225,
    catalog_depth: "1,225 productos",
    top_categories: ["belleza"],
    best_for: "rutina coreana completa sin gastar: COSRX, Anua, SKIN1004, medicube, Beauty of Joseon",
    not_for: "marcas occidentales de prestigio",
    peru_note: "El skincare coreano se volvió enorme en Lima y acá sale a una fracción del precio local.",
  },
  victoriassecret: {
    name: "Victoria's Secret",
    vibe: "lencería, pijamas y perfumes — la marca que todos reconocen",
    specialties: ["lencería", "pijamas", "perfumes", "ropa interior", "belleza"],
    price_range: "medio", median_usd: 34.95, product_count: 1649,
    catalog_depth: "1,649 productos",
    top_categories: ["mujer", "belleza"],
    best_for: "lencería, pijamas y los sprays de PINK — un regalo que se entiende solo",
    not_for: "ropa de calle o de vestir",
    peru_note: "En Perú se lee como lujo aunque en Estados Unidos sea de mall.",
  },

  /* ---------- POP CULTURE Y ALTERNATIVO ----------
     Both files carry a single "Todo" department, so the brands are
     what characterise them: Funko and Loungefly in both, Hot Topic
     cheaper and darker, BoxLunch the same fandoms aimed softer. */
  hottopic: {
    name: "Hot Topic",
    vibe: "alternativo, punk, anime y rock — la tienda del mall que tus papás no entienden",
    specialties: ["anime", "otaku", "punk", "rock", "pop culture", "figuras", "polos de bandas"],
    price_range: "economico", median_usd: 24.9, product_count: 2544,
    catalog_depth: "2,544 productos, 585 en oferta",
    top_categories: ["todo"],
    best_for: "anime, bandas y fandom: Funko, Loungefly, Monogram, Social Collision",
    not_for: "ropa formal o clásica",
    peru_note: "El anime y el K-pop mueven muchísimo entre adolescentes peruanos y esto no se consigue local.",
  },
  boxlunch: {
    name: "BoxLunch",
    vibe: "fandom en versión tierna y coleccionable",
    specialties: ["pop culture", "anime", "figuras", "coleccionables", "regalos geek"],
    price_range: "medio", median_usd: 39.9, product_count: 2519,
    catalog_depth: "2,519 productos, 493 en oferta",
    top_categories: ["todo"],
    best_for: "regalos de fandom: Funko, Loungefly, Disney, Sanrio",
    not_for: "lo oscuro y punk — para eso Hot Topic",
    peru_note: null,
  },

  /* ---------- ZAPATILLAS ---------- */
  footlocker: {
    name: "Foot Locker",
    vibe: "cultura sneaker, lo que sale primero",
    specialties: ["zapatillas", "sneakers", "zapatillas de basket", "ropa deportiva"],
    price_range: "premium", median_usd: 110.99, product_count: 296,
    catalog_depth: "296 productos",
    top_categories: ["ropa", "hombre", "mujer", "niños"],
    best_for: "Jordan, Nike, adidas, ASICS, On — el par que se busca por nombre",
    not_for: "mucha variedad: el catálogo es corto. Finish Line tiene 1,099",
    peru_note: null,
  },
  finishline: {
    name: "Finish Line",
    vibe: "zapatillas y ropa deportiva, catálogo ancho",
    specialties: ["zapatillas", "sneakers", "ropa deportiva", "polos", "hoodies"],
    price_range: "medio", median_usd: 40.0, product_count: 1099,
    catalog_depth: "1,099 productos",
    top_categories: ["ropa", "hombre", "mujer", "niños"],
    best_for: "la mayor variedad de zapatillas y ropa deportiva — Nike, adidas, Jordan, The North Face",
    not_for: "los lanzamientos más exclusivos — eso es Foot Locker",
    peru_note: null,
  },
  newbalance: {
    name: "New Balance",
    vibe: "la marca directa, cómoda y sin ruido",
    specialties: ["zapatillas", "zapatillas para correr", "ropa deportiva"],
    price_range: "medio", median_usd: 74.99, product_count: 1269,
    catalog_depth: "1,269 productos",
    top_categories: ["gym rat", "ropa", "moda hombre", "moda niños"],
    best_for: "New Balance de la fuente, para correr o de diario",
    not_for: "otras marcas — es tienda de una sola marca",
    peru_note: null,
  },
  crocs: {
    name: "Crocs",
    vibe: "cómodo, colorido y sin disculpas",
    specialties: ["crocs", "sandalias", "calzado cómodo", "calzado de niños"],
    price_range: "medio", median_usd: 49.99, product_count: 564,
    catalog_depth: "564 productos",
    top_categories: ["calzado"],
    best_for: "Crocs de toda talla, incluidos niños, con los Jibbitz",
    not_for: "calzado formal o deportivo de rendimiento",
    peru_note: null,
  },

  /* ---------- DEPORTES ---------- */
  dicks: {
    name: "Dick's Sporting Goods",
    vibe: "la tienda de deportes grande, de todo un poco",
    specialties: ["deportes", "ropa deportiva", "equipo deportivo", "camping"],
    price_range: "medio", median_usd: 43.97, product_count: 572,
    catalog_depth: "572 productos, 418 en oferta",
    top_categories: ["deportes"],
    best_for: "equipo deportivo general: adidas, Nike, Quiksilver, Hurley, PUMA",
    not_for: "patinetas de verdad — solo tiene tablas de juguete de 31 pulgadas",
    peru_note: null,
  },
  prosoccer: {
    name: "ProSoccer",
    vibe: "fútbol y nada más, todo en oferta",
    specialties: ["fútbol", "chimpunes", "camisetas de fútbol", "guantes de arquero"],
    price_range: "medio", median_usd: 45.0, product_count: 2067,
    catalog_depth: "2,067 productos, todos en oferta",
    top_categories: ["deportes"],
    best_for: "chimpunes y equipo de fútbol — el catálogo entero está marcado en oferta",
    not_for: "cualquier otro deporte",
    peru_note: "El fútbol es el deporte del país; los chimpunes buenos cuestan el doble en Lima.",
  },
  xtremesoccer: {
    name: "Xtreme Soccer",
    vibe: "fútbol especializado",
    specialties: ["fútbol", "chimpunes", "camisetas de fútbol"],
    price_range: "medio", median_usd: 67.5, product_count: 460,
    catalog_depth: "460 productos, todos en oferta",
    top_categories: ["deportes"],
    best_for: "chimpunes y camisetas, catálogo completo en oferta",
    not_for: "otros deportes",
    peru_note: null,
  },
  academy: {
    name: "Academy Sports",
    vibe: "deportes y aire libre",
    specialties: ["fútbol", "deportes", "aire libre"],
    price_range: "medio", median_usd: 59.99, product_count: 33,
    catalog_depth: "33 productos",
    best_for: "nada todavía: 33 productos no alcanzan",
    top_categories: ["deportes"],
    not_for: "todo por ahora. Para fútbol, ProSoccer",
    peru_note: null,
  },
  tennisexpress: {
    name: "Tennis Express",
    vibe: "tenis especializado, todo en oferta",
    specialties: ["tenis", "raquetas", "zapatillas de tenis", "pelotas"],
    price_range: "medio", median_usd: 60.0, product_count: 814,
    catalog_depth: "814 productos, todos en oferta",
    top_categories: ["deportes"],
    best_for: "raquetas, zapatillas y ropa de tenis — catálogo entero en oferta",
    not_for: "otros deportes",
    peru_note: "El tenis es grande en Lima y una raqueta buena acá cuesta bastante menos.",
  },

  /* ---------- GYM RAT ---------- */
  gymshark: {
    name: "Gymshark",
    vibe: "gym como identidad, corte ajustado",
    specialties: ["ropa de gym", "leggings", "ropa deportiva", "gym"],
    price_range: "medio", median_usd: 40.0, product_count: 861,
    catalog_depth: "861 productos",
    top_categories: ["gym rat"],
    best_for: "la marca de gym que reconocen en el gym",
    not_for: "equipo o pesas — es solo ropa",
    peru_note: null,
  },
  alphalete: {
    name: "Alphalete",
    vibe: "gym premium, siluetas marcadas",
    specialties: ["ropa de gym", "leggings", "gym"],
    price_range: "medio", median_usd: 46.0, product_count: 999,
    catalog_depth: "999 productos, 326 en oferta",
    top_categories: ["gym rat"],
    best_for: "ropa de gym con corte más trabajado que Gymshark",
    not_for: "equipo de gimnasio",
    peru_note: null,
  },
  youngla: {
    name: "YoungLA",
    vibe: "gym con estilo de calle, gráficos grandes",
    specialties: ["ropa de gym", "gym", "polos oversize"],
    price_range: "medio", median_usd: 42.0, product_count: 800,
    catalog_depth: "800 productos",
    top_categories: ["gym rat"],
    best_for: "el look de gym más streetwear",
    not_for: "equipo de gimnasio",
    peru_note: null,
  },
  skims: {
    name: "Skims",
    vibe: "moldeador y básicos, tono piel",
    specialties: ["moldeadores", "ropa interior", "básicos", "lencería"],
    price_range: "medio", median_usd: 47.0, product_count: 2162,
    catalog_depth: "2,162 productos, 815 en oferta",
    top_categories: ["mujer", "hombre"],
    best_for: "moldeadores y básicos en toda la gama de tonos de piel",
    not_for: "ropa de calle",
    peru_note: null,
  },

  /* ---------- LUJO Y DISEÑADOR ---------- */
  ssense: {
    name: "SSENSE",
    vibe: "diseñador y vanguardia, sin concesiones",
    specialties: ["diseñador", "lujo", "moda de hombre", "moda de mujer"],
    price_range: "lujo", median_usd: 490.0, product_count: 18000,
    catalog_depth: "18,000 productos — el catálogo más grande del sitio",
    top_categories: ["hombre", "mujer"],
    best_for: "diseñador de verdad, hombre y mujer, con la selección más honda que tenemos",
    not_for: "un presupuesto normal — la mitad del catálogo pasa los $490",
    peru_note: null,
  },
  farfetch: {
    name: "Farfetch",
    vibe: "lujo de boutiques del mundo en un solo sitio",
    specialties: ["diseñador", "lujo", "bolsos", "moda de mujer"],
    price_range: "lujo", median_usd: 291.0, product_count: 1448,
    catalog_depth: "1,448 productos, 410 en oferta",
    top_categories: ["diseñadores latinos"],
    best_for: "piezas de diseñador con 410 en oferta ahora mismo",
    not_for: "básicos del día a día",
    peru_note: null,
  },
  miumiu: {
    name: "Miu Miu",
    vibe: "lujo italiano, juguetón y carísimo",
    specialties: ["lujo", "bolsos", "diseñador", "moda de mujer"],
    price_range: "lujo", median_usd: 1390.0, product_count: 2468,
    catalog_depth: "2,468 productos",
    top_categories: ["mujer"],
    best_for: "la pieza de lujo que se compra una vez",
    not_for: "cualquier presupuesto que no sea de lujo — la mediana es $1,390",
    peru_note: null,
  },
  revolve: {
    name: "Revolve",
    vibe: "moda contemporánea de salir, lista para la foto",
    specialties: ["vestidos", "ropa de fiesta", "moda de mujer", "contemporáneo"],
    price_range: "premium", median_usd: 148.0, product_count: 1755,
    catalog_depth: "1,755 productos",
    top_categories: ["mujer"],
    best_for: "un vestido para un evento, moda contemporánea de marca",
    not_for: "básicos económicos",
    peru_note: null,
  },
  assouline: {
    name: "Assouline",
    vibe: "libros de mesa de centro, objeto de diseño",
    specialties: ["libros", "libros de arte", "decoración", "regalos"],
    price_range: "premium", median_usd: 120.0, product_count: 270,
    catalog_depth: "270 productos",
    top_categories: ["libros"],
    best_for: "el libro grande de moda o viajes que se deja a la vista",
    not_for: "lectura normal — para eso Chronicle",
    peru_note: null,
  },
  chronicle: {
    name: "Chronicle Books",
    vibe: "libros bonitos y bien hechos, de regalo",
    specialties: ["libros", "libros de niños", "regalos", "cocina"],
    price_range: "medio", median_usd: 35.0, product_count: 211,
    catalog_depth: "211 productos",
    top_categories: ["libros"],
    best_for: "libros de regalo y libros infantiles bien editados",
    not_for: "libros de texto o técnicos",
    peru_note: null,
  },

  /* ---------- DISEÑADORES LATINOS ----------
     Eleven labels in one department. They share a shelf, so each
     entry has to say what makes it different or Aria cannot do what
     the brief asks and explain the difference. */
  vix: {
    name: "ViX Paula Hermanny", vibe: "resort brasileño, playa elegante",
    specialties: ["bikinis", "ropa de playa", "resort", "diseñador latino"],
    price_range: "premium", median_usd: 156.0, product_count: 1611,
    catalog_depth: "1,611 productos, 878 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "bikinis y resort de marca brasileña, con más de la mitad en oferta",
    not_for: "ropa de ciudad", peru_note: "Verano peruano y playa: el resort brasileño se entiende solo.",
  },
  montce: {
    name: "Montce", vibe: "bikinis de Miami, cortes mínimos",
    specialties: ["bikinis", "ropa de playa", "diseñador latino"],
    price_range: "premium", median_usd: 88.99, product_count: 1566,
    catalog_depth: "1,566 productos, 747 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "bikinis de corte brasileño, mitad del catálogo en oferta",
    not_for: "trajes de baño deportivos o de natación", peru_note: null,
  },
  tns: {
    name: "TNS", vibe: "playa latina accesible",
    specialties: ["bikinis", "ropa de playa", "diseñador latino"],
    price_range: "medio", median_usd: 55.0, product_count: 1535,
    catalog_depth: "1,535 productos, 633 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "la entrada más económica a los diseñadores latinos de playa",
    not_for: "nada en particular", peru_note: null,
  },
  farmrio: {
    name: "Farm Rio", vibe: "estampados brasileños, color por todos lados",
    specialties: ["vestidos", "estampados", "diseñador latino", "ropa de mujer"],
    price_range: "premium", median_usd: 180.0, product_count: 1228,
    catalog_depth: "1,228 productos, 708 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "vestidos y estampados que no se parecen a nada más",
    not_for: "ropa sobria o de oficina", peru_note: null,
  },
  eberjey: {
    name: "Eberjey", vibe: "pijamas y lencería suave",
    specialties: ["pijamas", "lencería", "diseñador latino"],
    price_range: "premium", median_usd: 148.0, product_count: 734,
    catalog_depth: "734 productos, 211 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "pijamas de buena tela, de regalo",
    not_for: "lencería de marca reconocible — para eso Victoria's Secret", peru_note: null,
  },
  capittana: {
    name: "Capittana", vibe: "playa peruana",
    specialties: ["bikinis", "ropa de playa", "diseñador latino"],
    price_range: "premium", median_usd: 140.0, product_count: 516,
    catalog_depth: "516 productos", top_categories: ["diseñadores latinos"],
    best_for: "trajes de baño de una marca peruana",
    not_for: "nada en particular", peru_note: "Es peruana — eso pesa cuando alguien quiere apoyar lo de acá.",
  },
  ancora: {
    name: "Ancora", vibe: "playa latina, precio sensato",
    specialties: ["bikinis", "ropa de playa", "diseñador latino"],
    price_range: "medio", median_usd: 63.0, product_count: 525,
    catalog_depth: "525 productos, 403 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "playa de diseñador con casi todo en oferta",
    not_for: "nada en particular", peru_note: null,
  },
  aguabendita: {
    name: "Agua Bendita", vibe: "bikinis colombianos bordados a mano",
    specialties: ["bikinis", "ropa de playa", "diseñador latino"],
    price_range: "lujo", median_usd: 294.0, product_count: 421,
    catalog_depth: "421 productos, 303 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "el bikini bordado que es una pieza, no una prenda",
    not_for: "un traje de baño para nadar", peru_note: null,
  },
  patbo: {
    name: "PatBo", vibe: "noche brasileña, bordados y transparencias",
    specialties: ["vestidos", "ropa de fiesta", "diseñador latino"],
    price_range: "lujo", median_usd: 578.5, product_count: 558,
    catalog_depth: "558 productos, 202 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "un vestido de noche que se nota", not_for: "el día a día", peru_note: null,
  },
  johannaortiz: {
    name: "Johanna Ortiz", vibe: "lujo colombiano, volumen y volantes",
    specialties: ["vestidos", "diseñador latino", "lujo"],
    price_range: "lujo", median_usd: 775.0, product_count: 646,
    catalog_depth: "646 productos, 183 en oferta", top_categories: ["diseñadores latinos"],
    best_for: "lujo latinoamericano de autor", not_for: "cualquier presupuesto normal", peru_note: null,
  },
  silviatcherassi: {
    name: "Silvia Tcherassi", vibe: "lujo colombiano, resort y alfombra roja",
    specialties: ["vestidos", "diseñador latino", "lujo"],
    price_range: "lujo", median_usd: 1100.0, product_count: 713,
    catalog_depth: "713 productos", top_categories: ["diseñadores latinos"],
    best_for: "vestidos de evento de diseñadora colombiana", not_for: "el día a día", peru_note: null,
  },

  /* ---------- BOLSOS Y JOYAS ---------- */
  baublebar: {
    name: "BaubleBar",
    vibe: "joyería divertida y personalizable",
    specialties: ["joyas", "aretes", "collares", "personalizado", "regalos"],
    price_range: "medio", median_usd: 44.0, product_count: 7012,
    catalog_depth: "7,012 productos, 566 en oferta",
    top_categories: ["joyas", "personalizado", "fan shop", "elegante"],
    best_for: "joyería de moda y piezas con inicial o nombre — buen regalo",
    not_for: "joyería fina de oro o piedras",
    peru_note: null,
  },
  jwpei: {
    name: "JW PEI",
    vibe: "bolsos veganos de diseño limpio",
    specialties: ["bolsos", "carteras", "bolsos veganos"],
    price_range: "premium", median_usd: 139.0, product_count: 2351,
    catalog_depth: "2,351 productos",
    top_categories: ["carteras"],
    best_for: "un bolso de diseño sin cuero y sin precio de lujo",
    not_for: "cuero genuino",
    peru_note: null,
  },
  meliebianco: {
    name: "Melie Bianco",
    vibe: "bolsos veganos, estilo clásico",
    specialties: ["bolsos", "carteras", "bolsos veganos", "joyas"],
    price_range: "premium", median_usd: 85.9, product_count: 310,
    catalog_depth: "310 productos",
    top_categories: ["carteras", "joyas"],
    best_for: "bolsos veganos más clásicos que JW PEI y algo más baratos",
    not_for: "variedad — JW PEI tiene 2,351 contra 310",
    peru_note: null,
  },
  statebags: {
    name: "State Bags",
    vibe: "mochilas de niño, resistentes y con color",
    specialties: ["mochilas", "mochilas de niños", "loncheras"],
    price_range: "premium", median_usd: 88.0, product_count: 61,
    catalog_depth: "61 productos",
    top_categories: ["niños"],
    best_for: "una mochila de colegio que aguante el año",
    not_for: "mochilas de adulto o de viaje",
    peru_note: null,
  },
  dagnedover: {
    name: "Dagne Dover",
    vibe: "bolsos funcionales, pensados por dentro",
    specialties: ["bolsos", "mochilas", "pañaleras"],
    price_range: "premium", median_usd: 237.5, product_count: 30,
    catalog_depth: "30 productos",
    top_categories: ["mamás"],
    best_for: "una pañalera o mochila con organización de verdad",
    not_for: "variedad — son 30 productos",
    peru_note: null,
  },
  smartbuyglasses: {
    name: "SmartBuyGlasses",
    vibe: "lentes de marca a precio de internet",
    specialties: ["lentes de sol", "lentes", "monturas"],
    price_range: "premium", median_usd: 214.0, product_count: 545,
    catalog_depth: "545 productos, 149 en oferta",
    top_categories: ["lentes de sol"],
    best_for: "lentes de sol de marca sin pagar precio de óptica",
    not_for: "lentes con medida graduada lista para usar",
    peru_note: null,
  },

  /* ---------- ELECTRÓNICA Y AUTO ---------- */
  bhphoto: {
    name: "B&H Photo",
    vibe: "la tienda de fotógrafos y creadores, en serio",
    specialties: ["cámaras", "electrónica", "fotografía", "audio", "drones", "lentes"],
    price_range: "lujo", median_usd: 697.99, product_count: 1706,
    catalog_depth: "1,706 productos",
    top_categories: ["electrónica"],
    best_for: "cámaras, lentes, luces y drones: Sony, Canon, Godox, DJI, Apple",
    not_for: "electrodomésticos o celulares de gama baja",
    peru_note: "Equipo de foto y video es carísimo en Perú — acá es donde la diferencia se nota más.",
  },
  advanceauto: {
    name: "Advance Auto Parts",
    vibe: "repuestos, sin adornos",
    specialties: ["repuestos", "autopartes", "frenos", "filtros"],
    price_range: "medio", median_usd: 67.99, product_count: 1365,
    catalog_depth: "1,365 productos",
    top_categories: ["repuestos"],
    best_for: "frenos y repuestos cuando se sabe el número de parte",
    not_for: "confirmar si una parte entra en tu carro — el catálogo no trae datos de compatibilidad, el número de parte es la verificación",
    peru_note: null,
  },
  revzilla: {
    name: "RevZilla",
    vibe: "moto, de cascos a llantas",
    specialties: ["moto", "cascos", "chaquetas de moto", "guantes", "botas"],
    price_range: "premium", median_usd: 215.96, product_count: 1153,
    catalog_depth: "1,153 productos, 512 en oferta",
    top_categories: ["motos"],
    best_for: "equipo de protección de moto: cascos, chaquetas, botas",
    not_for: "repuestos mecánicos — para eso Dennis Kirk",
    peru_note: "La moto es transporte diario en muchas ciudades del Perú y un casco bueno no se consigue fácil.",
  },
  denniskirk: {
    name: "Dennis Kirk",
    vibe: "repuestos de moto y cuatrimoto",
    specialties: ["moto", "repuestos de moto", "cuatrimoto", "llantas"],
    price_range: "medio", median_usd: 54.59, product_count: 1342,
    catalog_depth: "1,342 productos, 406 en oferta",
    top_categories: ["motos"],
    best_for: "repuestos y partes de moto a mejor precio que RevZilla",
    not_for: "la mejor selección de cascos — eso es RevZilla",
    peru_note: null,
  },

  /* ---------- ARTES MARCIALES ---------- */
  venum: {
    name: "Venum", vibe: "MMA con diseño agresivo, la marca que se ve en la jaula",
    specialties: ["mma", "artes marciales", "guantes de box", "box", "muay thai", "rashguards"],
    price_range: "medio", median_usd: 30.0, product_count: 1116,
    catalog_depth: "1,116 productos, 1,100 en oferta", top_categories: ["artes marciales"],
    best_for: "guantes, shorts y rashguards — casi todo el catálogo en oferta",
    not_for: "gis de jiu-jitsu con variedad — para eso Tatami o FUJI", peru_note: null,
  },
  tatami: {
    name: "Tatami Fightwear", vibe: "jiu-jitsu, gis y diseño con humor",
    specialties: ["jiu jitsu", "bjj", "gi", "kimono", "rashguards", "artes marciales"],
    price_range: "economico", median_usd: 15.0, product_count: 336,
    catalog_depth: "336 productos, todos en oferta", top_categories: ["artes marciales"],
    best_for: "jiu-jitsu: gis, rashguards y spats, catálogo entero en oferta",
    not_for: "equipo de box", peru_note: null,
  },
  everlast: {
    name: "Everlast", vibe: "box clásico, el nombre de siempre",
    specialties: ["box", "guantes de box", "sacos", "vendas", "artes marciales"],
    price_range: "economico", median_usd: 24.99, product_count: 226,
    catalog_depth: "226 productos, 222 en oferta", top_categories: ["artes marciales"],
    best_for: "empezar box sin gastar: guantes, vendas, sacos",
    not_for: "equipo de competencia de alto nivel", peru_note: null,
  },
  mmawarehouse: {
    name: "MMAWarehouse", vibe: "todo de artes marciales en un sitio",
    specialties: ["mma", "artes marciales", "jiu jitsu", "box"],
    price_range: "premium", median_usd: 139.99, product_count: 98,
    catalog_depth: "98 productos", top_categories: ["artes marciales"],
    best_for: "piezas específicas de MMA", not_for: "variedad — son 98 productos", peru_note: null,
  },
  combatcorner: {
    name: "Combat Corner", vibe: "equipo de gimnasio de combate",
    specialties: ["mma", "box", "artes marciales", "protecciones"],
    price_range: "medio", median_usd: 45.0, product_count: 42,
    catalog_depth: "42 productos, todos en oferta", top_categories: ["artes marciales"],
    best_for: "nada todavía: 42 productos", not_for: "todo por ahora. Para MMA, Venum", peru_note: null,
  },
  gameness: {
    name: "Gameness", vibe: "jiu-jitsu sin adornos",
    specialties: ["jiu jitsu", "bjj", "gi", "artes marciales"],
    price_range: "medio", median_usd: 31.07, product_count: 100,
    catalog_depth: "100 productos, todos en oferta", top_categories: ["artes marciales"],
    best_for: "un gi sencillo y barato", not_for: "variedad de diseños — para eso Tatami", peru_note: null,
  },
  elite: {
    name: "Elite Sports", vibe: "artes marciales a precio de entrada",
    specialties: ["mma", "jiu jitsu", "box", "artes marciales"],
    price_range: "economico", median_usd: 15.99, product_count: 95,
    catalog_depth: "95 productos, todos en oferta", top_categories: ["artes marciales"],
    best_for: "lo más barato para empezar", not_for: "equipo de competencia", peru_note: null,
  },
  fuji: {
    name: "FUJI Sports", vibe: "judo y jiu-jitsu tradicional",
    specialties: ["judo", "jiu jitsu", "gi", "artes marciales"],
    price_range: "medio", median_usd: 74.95, product_count: 8,
    catalog_depth: "8 productos — casi vacío", top_categories: ["artes marciales"],
    best_for: "nada: ocho productos", not_for: "todo. Para jiu-jitsu, Tatami", peru_note: null,
  },

  /* ---------- MAMÁS Y BEBÉS ---------- */
  kindredbravely: {
    name: "Kindred Bravely", vibe: "ropa de embarazo y lactancia, cómoda de verdad",
    specialties: ["embarazo", "lactancia", "maternidad", "pijamas", "brasieres"],
    price_range: "medio", median_usd: 34.9, product_count: 919,
    catalog_depth: "919 productos, 451 en oferta", top_categories: ["mamás"],
    best_for: "ropa de embarazo y lactancia con el catálogo más ancho que tenemos",
    not_for: "equipo de bebé", peru_note: null,
  },
  hatch: {
    name: "Hatch", vibe: "maternidad con estilo, no disfraz de embarazada",
    specialties: ["embarazo", "maternidad", "vestidos", "ropa de mujer"],
    price_range: "premium", median_usd: 125.0, product_count: 468,
    catalog_depth: "468 productos, 229 en oferta", top_categories: ["mamás"],
    best_for: "ropa de embarazo que se sigue usando después",
    not_for: "presupuesto apretado — Kindred Bravely es la mitad de precio", peru_note: null,
  },
  walmartbaby: {
    name: "Walmart Bebé", vibe: "equipo de bebé a precio de Walmart",
    specialties: ["bebé", "coches", "sillas de carro", "cunas"],
    price_range: "premium", median_usd: 139.99, product_count: 458,
    catalog_depth: "458 productos", top_categories: ["mamás"],
    best_for: "coches, cunas y sillas de carro sin pagar marca boutique",
    not_for: "ropa de embarazo", peru_note: null,
  },
  momcozy: {
    name: "Momcozy", vibe: "lactancia práctica y barata",
    specialties: ["lactancia", "extractores", "brasieres", "bebé"],
    price_range: "medio", median_usd: 59.99, product_count: 240,
    catalog_depth: "240 productos, 79 en oferta", top_categories: ["mamás"],
    best_for: "extractores de leche y brasieres de lactancia a buen precio",
    not_for: "equipo médico de precisión — para eso Spectra o Elvie", peru_note: null,
  },
  elvie: {
    name: "Elvie", vibe: "tecnología de lactancia, silenciosa y discreta",
    specialties: ["lactancia", "extractores", "bebé"],
    price_range: "medio", median_usd: 34.99, product_count: 63,
    catalog_depth: "63 productos", top_categories: ["mamás"],
    best_for: "extractor silencioso que se usa debajo de la ropa",
    not_for: "presupuesto bajo", peru_note: null,
  },
  spectra: {
    name: "Spectra", vibe: "extractores de grado hospitalario",
    specialties: ["lactancia", "extractores", "bebé"],
    price_range: "economico", median_usd: 29.99, product_count: 46,
    catalog_depth: "46 productos", top_categories: ["mamás"],
    best_for: "un extractor potente, el que recomiendan las asesoras de lactancia",
    not_for: "discreción para usar fuera de casa — para eso Elvie", peru_note: null,
  },
  drbrowns: {
    name: "Dr. Brown's", vibe: "biberones y lo básico de bebé",
    specialties: ["biberones", "bebé", "chupones", "lactancia"],
    price_range: "economico", median_usd: 7.99, product_count: 347,
    catalog_depth: "347 productos", top_categories: ["mamás"],
    best_for: "biberones anticólico y repuestos, baratísimo",
    not_for: "equipo grande de bebé", peru_note: null,
  },
  munchkin: {
    name: "Munchkin", vibe: "accesorios de bebé prácticos",
    specialties: ["bebé", "baño de bebé", "alimentación", "accesorios"],
    price_range: "economico", median_usd: 18.49, product_count: 128,
    catalog_depth: "128 productos", top_categories: ["mamás"],
    best_for: "los accesorios chicos que se usan todos los días",
    not_for: "coches o sillas de carro", peru_note: null,
  },
  nanit: {
    name: "Nanit", vibe: "monitor de bebé con cámara inteligente",
    specialties: ["monitor de bebé", "cámara", "bebé"],
    price_range: "medio", median_usd: 42.0, product_count: 36,
    catalog_depth: "36 productos", top_categories: ["mamás"],
    best_for: "monitor con cámara y seguimiento de sueño",
    not_for: "otra cosa — es un solo producto y sus accesorios", peru_note: null,
  },
  owlet: {
    name: "Owlet", vibe: "monitor de signos vitales de bebé",
    specialties: ["monitor de bebé", "bebé"],
    price_range: "medio", median_usd: 36.25, product_count: 26,
    catalog_depth: "26 productos", top_categories: ["mamás"],
    best_for: "monitoreo de oxígeno y pulso en el pie del bebé",
    not_for: "video — para eso Nanit", peru_note: null,
  },
  babybrezza: {
    name: "Baby Brezza", vibe: "aparatos que preparan la leche",
    specialties: ["bebé", "preparador de formula", "esterilizador"],
    price_range: "medio", median_usd: 59.99, product_count: 31,
    catalog_depth: "31 productos", top_categories: ["mamás"],
    best_for: "preparar biberones automáticamente de madrugada",
    not_for: "variedad", peru_note: null,
  },
  mockingbird: {
    name: "Mockingbird", vibe: "coches de bebé bien hechos, directo de fábrica",
    specialties: ["coches", "bebé", "coche doble"],
    price_range: "medio", median_usd: 45.0, product_count: 50,
    catalog_depth: "50 productos", top_categories: ["mamás"],
    best_for: "un coche que se convierte en doble cuando llega el segundo",
    not_for: "variedad de marcas", peru_note: null,
  },
  lillebaby: {
    name: "LÍLLÉbaby", vibe: "canguros ergonómicos",
    specialties: ["canguro", "portabebé", "bebé"],
    price_range: "premium", median_usd: 89.99, product_count: 29,
    catalog_depth: "29 productos, todos en oferta", top_categories: ["mamás"],
    best_for: "cargar al bebé sin romperse la espalda",
    not_for: "otra cosa", peru_note: null,
  },
  jujube: {
    name: "JuJuBe", vibe: "pañaleras con estampado y estructura",
    specialties: ["pañaleras", "bolsos", "bebé"],
    price_range: "medio", median_usd: 75.0, product_count: 86,
    catalog_depth: "86 productos", top_categories: ["mamás"],
    best_for: "una pañalera con estampado que no parece pañalera",
    not_for: "sobriedad — para eso Dagne Dover", peru_note: null,
  },
  bellybandit: {
    name: "Belly Bandit", vibe: "fajas y recuperación posparto",
    specialties: ["posparto", "fajas", "maternidad"],
    price_range: "medio", median_usd: 49.95, product_count: 27,
    catalog_depth: "27 productos", top_categories: ["mamás"],
    best_for: "fajas de recuperación después del parto",
    not_for: "ropa de embarazo", peru_note: null,
  },
  freshlypicked: {
    name: "Freshly Picked", vibe: "mocasines de cuero para bebé",
    specialties: ["zapatos de bebé", "mocasines", "bebé"],
    price_range: "premium", median_usd: 89.5, product_count: 42,
    catalog_depth: "42 productos, 40 en oferta", top_categories: ["mamás"],
    best_for: "el primer par de zapatitos de cuero",
    not_for: "zapatos de niño más grande", peru_note: null,
  },

  /* ---------- NIÑOS ---------- */
  bentgo: {
    name: "Bentgo", vibe: "loncheras con compartimentos",
    specialties: ["loncheras", "niños", "colegio", "tapers"],
    price_range: "economico", median_usd: 29.99, product_count: 156,
    catalog_depth: "156 productos, 40 en oferta", top_categories: ["niños"],
    best_for: "la lonchera de compartimentos que no se chorrea en la mochila",
    not_for: "mochilas — para eso State Bags", peru_note: null,
  },
  ezpz: {
    name: "ezpz", vibe: "platos que se pegan a la mesa",
    specialties: ["platos de bebé", "alimentación", "niños"],
    price_range: "economico", median_usd: 25.0, product_count: 107,
    catalog_depth: "107 productos", top_categories: ["niños"],
    best_for: "platos de silicona que el bebé no puede tirar al piso",
    not_for: "otra cosa", peru_note: null,
  },
  mushie: {
    name: "Mushie", vibe: "accesorios de bebé en colores suaves",
    specialties: ["mordedores", "platos de bebé", "niños", "accesorios"],
    price_range: "economico", median_usd: 14.99, product_count: 33,
    catalog_depth: "33 productos", top_categories: ["niños"],
    best_for: "mordedores y vajilla de bebé bonita y barata",
    not_for: "variedad", peru_note: null,
  },

  /* ---------- FIESTAS ---------- */
  partycity: {
    name: "Party City", vibe: "todo para una fiesta, barato y por cantidad",
    specialties: ["fiesta", "globos", "piñatas", "decoración", "cumpleaños", "disfraces"],
    price_range: "economico", median_usd: 5.0, product_count: 518,
    catalog_depth: "518 productos",
    top_categories: ["globos", "sorpresas", "platos", "servilletas"],
    best_for: "un cumpleaños completo: globos, platos, decoración temática de Marvel y Disney",
    not_for: "regalos — es decoración y desechables",
    peru_note: "La decoración temática de personajes es difícil de encontrar en Lima y acá sale regalada.",
  },
};

/* ============================================================
   NAMING A STORE OUT LOUD.

   A shopper says "Victoria's", "foot locker", "dicks", "la de
   belleza premium". None of those is a catalogue key, and a voice
   transcript will not hand over punctuation reliably either, so
   resolution is forgiving by design.
   ============================================================ */
const STORE_ALIASES = {
  "victorias secret": "victoriassecret", "victoria secret": "victoriassecret",
  "victorias": "victoriassecret", "vs": "victoriassecret", "pink": "victoriassecret",
  "foot locker": "footlocker", "finish line": "finishline",
  "new balance": "newbalance", "pac sun": "pacsun", "pacific sunwear": "pacsun",
  "dicks": "dicks", "dick's": "dicks", "dicks sporting goods": "dicks",
  "hot topic": "hottopic", "box lunch": "boxlunch",
  "b&h": "bhphoto", "bh photo": "bhphoto", "b and h": "bhphoto",
  "advance auto": "advanceauto", "advance auto parts": "advanceauto",
  "sams club": "samsclub", "sam's club": "samsclub",
  "old navy": "oldnavy", "american eagle": "americaneagle", "ae": "americaneagle",
  "lane bryant": "lanebryant", "island water sports": "islandwatersports",
  "surf station": "surfstation", "val surf": "valsurf", "quiet storm": "quietstorm",
  "mainland skate": "mainland", "parrot surf": "parrot",
  "pro soccer": "prosoccer", "xtreme soccer": "xtremesoccer",
  "tennis express": "tennisexpress", "academy sports": "academy",
  "jw pei": "jwpei", "melie bianco": "meliebianco", "state bags": "statebags",
  "dagne dover": "dagnedover", "baublebar": "baublebar", "bauble bar": "baublebar",
  "smart buy glasses": "smartbuyglasses", "dennis kirk": "denniskirk",
  "rev zilla": "revzilla", "miu miu": "miumiu", "farm rio": "farmrio",
  "agua bendita": "aguabendita", "johanna ortiz": "johannaortiz",
  "silvia tcherassi": "silviatcherassi", "pat bo": "patbo",
  "kindred bravely": "kindredbravely", "walmart baby": "walmartbaby",
  "walmart bebe": "walmartbaby", "dr browns": "drbrowns", "dr. brown's": "drbrowns",
  "baby brezza": "babybrezza", "belly bandit": "bellybandit",
  "freshly picked": "freshlypicked", "lillebaby": "lillebaby",
  "jujube": "jujube", "ju ju be": "jujube", "elite sports": "elite",
  "mma warehouse": "mmawarehouse", "combat corner": "combatcorner",
  "tatami fightwear": "tatami", "fuji sports": "fuji",
  "party city": "partycity", "chronicle books": "chronicle",
  "ulta beauty": "ulta", "yes style": "yesstyle", "nautilus spearfishing": "nautilus",
  "macy's": "macys", "kohl's": "kohls", "ssense": "ssense", "sense": "ssense",
};

const fold = (s) => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")   /* café -> cafe */
  .replace(/[^a-z0-9ñ ]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/**
 * The knowledge entry for a store the shopper named.
 *
 * A store with a registry row but no catalogue answers `not_stocked`
 * rather than `unknown`: Aria can then say "esa no la tenemos
 * todavía" instead of pretending she misheard.
 */
export function getStoreInfo(storeName){
  const q = fold(storeName);
  if (!q) return { unavailable: "dime el nombre de la tienda y te cuento qué tiene" };
  const direct = q.replace(/ /g, "");
  const key = STORE_ALIASES[q] || (STORE_KNOWLEDGE[direct] ? direct : null)
    || (STORE_KNOWLEDGE[q] ? q : null)
    || Object.keys(STORE_KNOWLEDGE).find(k => fold(STORE_KNOWLEDGE[k].name) === q)
    || null;
  if (key && STORE_KNOWLEDGE[key]) {
    return { store: key, ...STORE_KNOWLEDGE[key],
             recommendable: STORE_KNOWLEDGE[key].product_count >= MIN_RECOMMEND_DEPTH };
  }
  const dead = Object.keys(NOT_STOCKED).find(k => k === direct || fold(NOT_STOCKED[k]) === q);
  if (dead) {
    return { store: dead, name: NOT_STOCKED[dead], not_stocked: true,
             note: "No tenemos catálogo de esa tienda todavía. No ofrezcas sus productos ni " +
                   "prometas buscarlos — dilo y ofrece una tienda que sí tenga lo que busca." };
  }
  return { unavailable: "no conozco esa tienda. Pregúntame por el tipo de producto y te digo dónde buscarlo" };
}

/* ============================================================
   THE CLARIFYING QUESTION, AS DATA.

   Danny's example is the whole brief in one line: "a mi nieto le
   gusta el skate" must produce "¿patinetas de verdad, o ropa estilo
   skate?" and not a product search. Leaving that to the model's
   judgement means it happens most of the time; putting it here means
   it happens every time, with the two branches already resolved to
   stores that have the stock to back them.

   An interest is ambiguous when the two readings lead to DIFFERENT
   STORES. "Skate" does: CCS for boards, Zumiez for the look. "Jeans"
   does not, so it is not in here — asking about something that
   routes the same way either way is the twenty-questions the
   addendum forbids.
   ============================================================ */
export const AMBIGUOUS_INTERESTS = {
  skate: {
    ask: "¿Quiere patinetas para patinar de verdad, o ropa estilo skate?",
    branches: {
      "patinetas de verdad": ["ccs", "surfstation", "zumiez"],
      "ropa estilo skate": ["zumiez", "mainland", "islandwatersports"],
    },
  },
  surf: {
    ask: "¿Es para entrar al agua, o ropa de playa?",
    branches: {
      "equipo de agua": ["surfstation", "islandwatersports", "parrot"],
      "ropa de playa": ["islandwatersports", "quietstorm", "vix"],
    },
  },
  belleza: {
    ask: "¿Maquillaje, skincare, o perfumes?",
    branches: {
      maquillaje: ["sephora", "ulta", "target"],
      skincare: ["yesstyle", "sephora", "ulta"],
      perfumes: ["sephora", "victoriassecret"],
    },
  },
  "artes marciales": {
    ask: "¿Jiu-jitsu, box, o MMA?",
    branches: {
      "jiu jitsu": ["tatami", "gameness", "elite"],
      box: ["everlast", "venum", "elite"],
      mma: ["venum", "elite", "mmawarehouse"],
    },
  },
  moto: {
    ask: "¿Equipo para el piloto — casco, chaqueta — o repuestos para la moto?",
    branches: {
      "equipo del piloto": ["revzilla", "denniskirk"],
      repuestos: ["denniskirk", "revzilla"],
    },
  },
  bebe: {
    ask: "¿Para la mamá, o para el bebé?",
    branches: {
      "para la mama": ["kindredbravely", "hatch", "momcozy"],
      "para el bebe": ["walmartbaby", "drbrowns", "munchkin"],
    },
  },
};

/* What the shopper says, mapped to the words the entries use. The
   left side is transcript language — how someone actually talks to a
   phone — and it is folded before matching, so accents and
   punctuation do not matter. */
const INTEREST_ALIASES = {
  patineta: "patinetas", patinetas: "patinetas", tabla: "patinetas",
  tablas: "patinetas", skateboard: "patinetas", skating: "skate",
  patinar: "skate", patinaje: "skate",
  maquillaje: "maquillaje", makeup: "maquillaje", cosmeticos: "maquillaje",
  skincare: "skincare", "cuidado de la piel": "skincare", crema: "skincare",
  perfume: "perfumes", perfumes: "perfumes", colonia: "perfumes",
  juguete: "juguetes", juguetes: "juguetes", lego: "juguetes",
  muneca: "juguetes", munecas: "juguetes", barbie: "juguetes",
  zapatilla: "zapatillas", zapatillas: "zapatillas", sneakers: "zapatillas",
  tenis: "tenis", zapatos: "zapatillas", championes: "zapatillas",
  correr: "zapatillas para correr", running: "zapatillas para correr",
  futbol: "futbol", chimpunes: "chimpunes", pelota: "futbol",
  gym: "gym", gimnasio: "gym", pesas: "gym", leggings: "leggings",
  bikini: "bikinis", bikinis: "bikinis", "traje de bano": "bikinis",
  vestido: "vestidos", vestidos: "vestidos",
  lenceria: "lenceria", pijama: "pijamas", pijamas: "pijamas",
  camara: "camaras", camaras: "camaras", foto: "fotografia",
  fotografia: "fotografia", dron: "drones", drones: "drones",
  repuesto: "repuestos", repuestos: "repuestos", autoparte: "autopartes",
  freno: "frenos", frenos: "frenos",
  casco: "cascos", cascos: "cascos",
  anime: "anime", otaku: "otaku", funko: "figuras", figura: "figuras",
  joya: "joyas", joyas: "joyas", arete: "aretes", collar: "collares",
  bolso: "bolsos", cartera: "carteras", carteras: "carteras",
  mochila: "mochilas", mochilas: "mochilas", lonchera: "loncheras",
  fiesta: "fiesta", globos: "globos", cumpleanos: "cumpleanos",
  pinata: "pinatas", disfraz: "disfraces",
  embarazo: "embarazo", embarazada: "embarazo", lactancia: "lactancia",
  extractor: "extractores", biberon: "biberones", coche: "coches",
  jiujitsu: "jiu jitsu", "jiu jitsu": "jiu jitsu", bjj: "bjj", judo: "judo",
  box: "box", boxeo: "box", mma: "mma", "muay thai": "muay thai",
  libro: "libros", libros: "libros",
  lentes: "lentes de sol", "lentes de sol": "lentes de sol", gafas: "lentes de sol",
  hogar: "hogar", casa: "hogar", decoracion: "decoracion",
  "tallas grandes": "tallas grandes", curvy: "curvy", "plus size": "tallas grandes",
  surfear: "surf", "tabla de surf": "tablas de surf", wetsuit: "wetsuits",
  neopreno: "neopreno", buceo: "buceo", "pesca submarina": "pesca submarina",
  streetwear: "streetwear", "ropa de calle": "streetwear",
  disenador: "disenador", lujo: "lujo", "marca de lujo": "lujo",
  electronica: "electronica", audio: "audio",
};

/* "regalo para mi nieto de 8 años" is not a category. These map the
   shape of the request onto something searchable, which is what lets
   Aria answer a grandmother instead of interrogating her. */
const GIFT_HINTS = [
  { match: /\b(nieto|nieta|sobrino|sobrina|hijo|hija|nino|nina|chico|chica)\b/, interest: "juguetes" },
  { match: /\b(bebe|recien nacido|baby shower)\b/, interest: "bebe" },
  { match: /\b(esposa|novia|mama|madre)\b/, interest: "belleza" },
  { match: /\b(esposo|novio|papa|padre)\b/, interest: "gym" },
];

/* All the words a store answers to, built once from its own entry so
   the index can never drift from the knowledge. */
const SPECIALTY_INDEX = (() => {
  const idx = new Map();
  for (const [key, s] of Object.entries(STORE_KNOWLEDGE)){
    for (const term of s.specialties || []){
      const t = fold(term);
      if (!t) continue;
      let lst = idx.get(t);
      if (!lst) idx.set(t, lst = []);
      lst.push(key);
    }
  }
  return idx;
})();

/* MEASURED SUB-COUNTS, where a store's catalogue size says nothing
   about its depth in the thing being asked for. Counted off the
   committed catalogues on 2026-10-06 by matching product titles:
   skateboard decks/completes/trucks/wheels/griptape for `patinetas`,
   surfboards/wetsuits/fins/leashes for `tablas de surf`. Where a
   store has no entry here, its total product count is used. */
const SPECIALTY_DEPTH = {
  ccs:               { patinetas: 6207, skate: 6207, surf: 5, "tablas de surf": 5, wetsuits: 5 },
  surfstation:       { patinetas: 510, skate: 510, surf: 2144, "tablas de surf": 2144, wetsuits: 2144 },
  zumiez:            { patinetas: 239, skate: 239, surf: 0, "tablas de surf": 0 },
  parrot:            { patinetas: 143, skate: 143, surf: 108, "tablas de surf": 108, wetsuits: 108 },
  islandwatersports: { patinetas: 100, skate: 100, surf: 497, "tablas de surf": 497, wetsuits: 497 },
  mainland:          { patinetas: 32, skate: 32, surf: 0, "tablas de surf": 0 },
  valsurf:           { patinetas: 1, skate: 1, surf: 67, "tablas de surf": 67, wetsuits: 67 },
  dicks:             { patinetas: 14, skate: 14, surf: 20, "tablas de surf": 20 },
  nautilus:          { surf: 29, "tablas de surf": 29, wetsuits: 29 },
  quietstorm:        { surf: 6, "tablas de surf": 6, wetsuits: 6 },
  pacsun:            { patinetas: 0, skate: 0, surf: 0 },
  surfworld:         { patinetas: 0, skate: 0, surf: 0 },
};

/* A STORE CAN CLAIM A SPECIALTY AND STILL BE THE WRONG ANSWER. Val
   Surf is called Val Surf and sells skate brands, and has exactly one
   piece of skate hardware; CCS is the deepest skate shop we have and
   has five surf items. Both would have been offered on the strength of
   the word alone. Where the depth in the asked-for thing is measured
   and comes in under this floor, the store is dropped from the
   recommendation — it can still be asked about by name.

   MEASURED, AND IT CHANGES NO ANSWER TODAY. Run across all 187
   specialty terms in this file, removing this floor altered zero
   recommendations: ranking by relevance depth already sinks a store
   with five surf items below four better ones, and the list is cut to
   four. So this is a guard for the term with two matches rather than
   eight — the shape that arrives the moment a thin store is added or
   a narrow specialty is claimed — and not something that fires now.
   Kept deliberately, and asserted through stocksEnoughFor() rather
   than through a recommendation, because a guard whose removal
   changes no output is exactly the kind that rots unnoticed. */
const MIN_SPECIALTY_DEPTH = 25;

/**
 * Does this store hold enough of the asked-for thing to be offered?
 *
 * Exported because the guard is otherwise invisible: for the terms we
 * stock deeply, ranking by relevance depth already buries a store
 * with five of something before the list is trimmed to four, so
 * removing the floor changes no answer. The floor is there for the
 * term with two matches rather than eight — and a guard that only
 * matters in the uncommon case is exactly the kind that rots
 * unnoticed, so it is asserted directly.
 */
export function stocksEnoughFor(key, term){
  const sub = SPECIALTY_DEPTH[key] && SPECIALTY_DEPTH[key][fold(term)];
  return typeof sub !== "number" || sub >= MIN_SPECIALTY_DEPTH;
}

export { MIN_SPECIALTY_DEPTH, SPECIALTY_DEPTH };

function depthFor(key, term){
  const s = STORE_KNOWLEDGE[key];
  if (!s) return 0;
  const sub = SPECIALTY_DEPTH[key] && SPECIALTY_DEPTH[key][term];
  return typeof sub === "number" ? sub : s.product_count;
}

/* Two stores that sell the same thing need a reason to pick one, and
   "ambos son buenos" is not a reason. Price band first, because it
   is what a shopper feels; then depth, when one catalogue is at
   least twice the other. Both come from measured fields, so the
   difference is never invented. */
function differenceBetween(a, b){
  const A = STORE_KNOWLEDGE[a], B = STORE_KNOWLEDGE[b];
  if (!A || !B) return null;
  if (A.price_range && B.price_range && A.price_range !== B.price_range){
    return `${A.name} es ${A.price_range}, ${B.name} es ${B.price_range}`;
  }
  const hi = Math.max(A.product_count, B.product_count);
  const lo = Math.min(A.product_count, B.product_count);
  if (lo > 0 && hi / lo >= 2){
    const deeper = A.product_count > B.product_count ? A : B;
    const thinner = A.product_count > B.product_count ? B : A;
    return `${deeper.name} tiene mucho más para escoger (${deeper.product_count.toLocaleString("es-PE")} ` +
           `contra ${thinner.product_count.toLocaleString("es-PE")})`;
  }
  return null;
}

/**
 * The three or four stores to send someone to for an interest.
 *
 * Ambiguous interests come back as a question instead of a list —
 * see AMBIGUOUS_INTERESTS. Everything under MIN_RECOMMEND_DEPTH is
 * dropped, so a store with eighteen products can never be the answer
 * even when its specialties match perfectly.
 */
export function recommendStoresFor(interest, opts = {}){
  const raw = fold(interest);
  if (!raw) return { unavailable: "dime qué le interesa y te digo dónde buscar" };

  /* THE INTEREST WINS OVER WHO IT IS FOR. "A mi nieto le gusta el
     skate" names both a child and a sport, and the sport is the
     answer — an earlier cut of this read "nieto" first and sent
     Danny's own example to the toy aisle. The gift hint is a
     FALLBACK, for "un regalo para mi nieto" where nothing else in
     the sentence says what to buy. */
  let mapped = INTEREST_ALIASES[raw] || null;
  if (!mapped){
    for (const tok of raw.split(" ")){
      if (INTEREST_ALIASES[tok]) { mapped = INTEREST_ALIASES[tok]; break; }
    }
  }
  /* A phrase that is already a specialty needs no alias: "pesca
     submarina" and "tallas grandes" are the catalogue's own words. */
  /* A phrase that is already a specialty needs no alias: "pesca
     submarina" and "tallas grandes" are the catalogue's own words. */
  if (!mapped && SPECIALTY_INDEX.has(raw)) mapped = raw;
  /* And a single word that the entries already answer to counts as
     the interest — "skate" is a specialty and an ambiguous topic, so
     "a mi nieto le gusta el skate" must resolve on it rather than on
     the word "nieto". */
  if (!mapped){
    for (const tok of raw.split(" ")){
      if (AMBIGUOUS_INTERESTS[tok] || SPECIALTY_INDEX.has(tok)) { mapped = tok; break; }
    }
  }
  if (!mapped){
    for (const g of GIFT_HINTS){
      if (g.match.test(raw)) { mapped = g.interest; break; }
    }
  }
  const topic = mapped || raw;
  const term = fold(mapped || raw);

  /* AMBIGUOUS: ask, do not guess. Checked on the mapped term so
     "patinar" and "skating" both reach the skate question. */
  const amb = AMBIGUOUS_INTERESTS[term]
    || (AMBIGUOUS_INTERESTS[topic] ? topic : null) && AMBIGUOUS_INTERESTS[topic];
  if (amb && !opts.resolved){
    const branches = {};
    for (const [label, keys] of Object.entries(amb.branches)){
      branches[label] = keys
        .filter(k => STORE_KNOWLEDGE[k] && STORE_KNOWLEDGE[k].product_count >= MIN_RECOMMEND_DEPTH)
        .map(k => ({ store: k, name: STORE_KNOWLEDGE[k].name }));
    }
    return { interest: term, clarify: amb.ask, branches,
             note: "Haz la pregunta tal cual antes de buscar productos. No listes todas las " +
                   "tiendas todavía — con la respuesta mandas a la correcta." };
  }

  /* Exact specialty hits, then stores whose specialty contains the
     term (so "zapatillas" also reaches "zapatillas de skate"). */
  const scored = new Map();
  const add = (key, pts) => scored.set(key, (scored.get(key) || 0) + pts);
  for (const k of SPECIALTY_INDEX.get(term) || []) add(k, 10);
  for (const [spec, keys] of SPECIALTY_INDEX){
    if (spec === term) continue;
    if (spec.includes(term) || term.includes(spec)) for (const k of keys) add(k, 4);
  }

  const picks = [...scored.entries()]
    .filter(([k]) => STORE_KNOWLEDGE[k].product_count >= MIN_RECOMMEND_DEPTH)
    .filter(([k]) => stocksEnoughFor(k, term))
    /* Score first, then depth IN THIS SPECIALTY — not total catalogue
       size. Island Water Sports has 8,891 products and 100 of them
       are skate; Zumiez has 2,494 and 239 are skate. Sorting on the
       total put the surf shop ahead of the skate shop for someone
       asking about skateboards, which is exactly the dead
       recommendation this file exists to prevent. */
    .sort((a, b) => (b[1] - a[1]) || (depthFor(b[0], term) - depthFor(a[0], term)))
    .slice(0, 4)
    .map(([k]) => k);

  if (!picks.length){
    return { interest: term, stores: [],
             note: "No tenemos tiendas para eso. Dilo así, no inventes una tienda ni " +
                   "prometas buscarlo — ofrece lo que sí tenemos." };
  }

  const stores = picks.map(k => {
    const s = STORE_KNOWLEDGE[k];
    return {
      store: k, name: s.name, why: s.best_for, not_for: s.not_for,
      price_range: s.price_range, catalog_depth: s.catalog_depth,
      vibe: s.vibe, peru_note: s.peru_note || null,
    };
  });
  const difference = picks.length > 1 ? differenceBetween(picks[0], picks[1]) : null;
  return { interest: term, stores, difference,
           note: "Nombra dos o tres, no las cuatro, y di en qué se diferencian." };
}

/* How many stores Aria actually knows, for the places that want to
   say it without counting the object twice. */
export const STORE_COUNT = Object.keys(STORE_KNOWLEDGE).length;
