/* ============================================================
   DEPARTMENT CORE (2026-10-19, #409 track T5) — the carousels of
   departamento.html, shared by the build (scripts/build-department-
   slices.mjs writes the static slices with it) and the endpoint
   (netlify/functions/department.js answers filters and "Ver todo"
   with it), so the two can never disagree about what a department
   shows.

   Files: assets/sections/departamento/_fn/<dept>.json, shipped beside
   the function by netlify.toml included_files and found by probing,
   like _search-core.js. No import.meta: Netlify's bundler compiles
   functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { conditionOfTitle as conditionOfAnyTitle, CONDITION_LABELS } from "../../scripts/lib/condition.js";
import { techAisle, isTechProduct, isAccessoryName, TECH_AISLE_LABELS, TECH_AISLE_ORDER, CONSOLE_RX, isConsole } from "../../scripts/lib/tech-aisle.js";

export const PAGE_SIZE = 48;     // cards per "Ver todo" / "Mostrar más" slice
export const RAIL_CARDS = 12;    // cards drawn in one carousel
export const HEAD_RAILS = 3;     // carousels whose cards ride in head.json
export const RAIL_BATCH = 6;     // carousels per rails-<b>.json after those
export const FN_DIR = "assets/sections/departamento/_fn";
export const DEPT_KEY_RX = /^[a-z_]{2,40}$/;

/* Aria's own footwear classes (scripts/lib/footwear.js SHOE_CLASSES) are
   titles already: "Botas y botines", not "Botas Y Botines". */
const SHOE_CLASS_LABELS = new Map(["Zapatillas", "Sandalias", "Botas y botines", "Tacones", "Chimpunes", "Mocasines y pantuflas", "Zapatos"].map((l) => [l.toLowerCase(), l]));
/* A rail title is Spanish (#443: English is never shown as Spanish copy).
   The store's own type is read through the garment and gear vocabularies,
   then this dictionary; a store's SKU code is no title at all. */
const TYPE_ES = new Map(Object.entries({
  "apparel": "Ropa", "clothing": "Ropa", "sportswear": "Ropa deportiva", "intimates": "Ropa interior", "underwear": "Ropa interior",
  "mens underwear": "Ropa interior", "briefs": "Ropa interior", "boxers": "Ropa interior", "thongs": "Lencería", "panties": "Lencería",
  "panty": "Lencería", "panty pack": "Lencería", "panty packs": "Lencería", "bras": "Lencería", "bra": "Lencería", "bralette": "Lencería",
  "bralettes": "Lencería", "bralette pack": "Lencería", "shapewear top": "Fajas y shapewear", "shapewear slips": "Fajas y shapewear",
  "shapewear bottoms": "Fajas y shapewear", "shapewear bottom": "Fajas y shapewear", "shapewear bodysuits": "Fajas y shapewear",
  "shapewear bodysuit": "Fajas y shapewear", "bodysuits": "Bodies", "bodysuit": "Bodies", "corsets & bodysuits": "Bodies",
  "sleepwear": "Pijamas", "pyjamas & loungewear": "Pijamas", "robes": "Batas", "lounge pants": "Pijamas", "socks": "Medias",
  "mens socks": "Medias", "leggings": "Leggings", "jumpsuits": "Enterizos", "rompers": "Enterizos", "one piece": "Enterizos",
  "suits": "Ternos", "blazers": "Blazers", "neck ties": "Corbatas", "scarves": "Bufandas", "belts & suspenders": "Correas",
  "beanies": "Gorros", "caps": "Gorras", "structured hats": "Gorras", "beach hats": "Sombreros", "sets": "Conjuntos", "set": "Conjuntos",
  "bundle": "Conjuntos", "wallets": "Billeteras", "wallet": "Billeteras", "card holders": "Billeteras", "coin pouches": "Billeteras",
  "passport holders": "Billeteras", "pouches": "Neceseres", "pouches & document holders": "Neceseres", "keychains": "Llaveros",
  "watches": "Relojes", "eyewear": "Lentes", "glasses": "Lentes", "sunglasses": "Lentes de sol", "jewelry": "Joyas",
  "home": "Hogar", "decor": "Decoración", "decorations": "Decoración", "decorative objects": "Decoración", "led decor": "Decoración",
  "decorative sculptures & figurines": "Decoración", "tabletop decorations": "Decoración", "wall decor": "Cuadros y decoración de pared",
  "framed wall art": "Cuadros y decoración de pared", "canvas wall art": "Cuadros y decoración de pared", "picture frames": "Portarretratos",
  "frames": "Portarretratos", "mirrors": "Espejos", "wall mirrors": "Espejos", "vases": "Floreros", "planters & pots": "Maceteros",
  "potted plants": "Plantas y flores", "stems & sprays": "Plantas y flores", "floral stems & branches": "Plantas y flores",
  "floral arrangements": "Plantas y flores", "floral & botanical arrangements": "Plantas y flores", "throws": "Mantas",
  "square pillows": "Cojines", "lumbar pillows": "Cojines", "door mats": "Tapetes", "baskets": "Canastas y organizadores",
  "baskets & storage bins": "Canastas y organizadores", "decorative storage": "Canastas y organizadores", "storage container": "Canastas y organizadores",
  "wastebaskets": "Canastas y organizadores", "candle holders": "Velas y candelabros", "candlesticks": "Velas y candelabros",
  "pillar candles": "Velas y candelabros", "pillar stands": "Velas y candelabros", "taper & pillar candles": "Velas y candelabros",
  "led pillar candles": "Velas y candelabros", "monochrome candles": "Velas y candelabros", "jar & filled candles": "Velas y candelabros",
  "votive & tealight holders": "Velas y candelabros", "hurricanes": "Velas y candelabros", "lanterns": "Faroles",
  "scented candles & diffusers": "Velas y aromas", "reed diffusers": "Velas y aromas", "reed diffuser refill oil": "Velas y aromas",
  "room sprays": "Velas y aromas", "fragrance oil": "Velas y aromas", "soaps, lotion & scents": "Jabones y cremas",
  "dinnerware": "Vajilla", "plates": "Vajilla", "silicone tableware": "Vajilla", "drinkware": "Vasos y tazas", "wine glasses": "Vasos y tazas",
  "mugs & tea cups": "Vasos y tazas", "coffee mugs & tea cups": "Vasos y tazas", "tablecloths": "Manteles y servilletas",
  "table runners": "Manteles y servilletas", "placemats": "Manteles y servilletas", "napkins": "Manteles y servilletas",
  "napkin rings": "Manteles y servilletas", "tablecovers": "Manteles y servilletas", "christmas ornaments": "Navidad",
  "specialty ornaments": "Navidad", "neutral ornaments": "Navidad", "christmas decor": "Navidad", "tree accessories": "Navidad",
  "wreaths": "Navidad", "wreaths & garland": "Navidad", "garlands": "Navidad", "yard decorations & signs": "Decoración de jardín",
  "keepsakes & gifts": "Regalos", "coffee table book": "Libros de mesa", "balloons": "Globos", "favors": "Recuerdos de fiesta",
  "favor bags & containers": "Recuerdos de fiesta", "confetti & streamers": "Decoración de fiesta", "banners & signs": "Decoración de fiesta",
  "decorating kits": "Decoración de fiesta", "costume accessories": "Disfraces", "games": "Juegos", "hair care": "Cuidado del cabello",
  "beauty": "Belleza", "fragrance bundles": "Perfumes", "lunch boxes totes": "Loncheras", "gear": "Equipo", "gear bag": "Maletines deportivos",
  "exercisemats": "Colchonetas", "bikehelmets": "Cascos", "snorkelinggearequipment": "Snorkel", "skateboardslongboards": "Skateboards",
  "skateboards completos": "Skateboards", "cruisers": "Skateboards", "longboards": "Skateboards", "wetsuits": "Trajes de neopreno",
  "swim": "Ropa de baño", "womensswimsuits": "Ropa de baño", "mensswimsuits": "Ropa de baño", "boysswimsuits": "Ropa de baño",
  "boxingmmakickboxinggloves": "Guantes", "accessories": "Accesorios", "art prints": "Cuadros y decoración de pared",
  "backdrops & scene setters": "Decoración de fiesta", "bags kids lunch boxes": "Loncheras", "belt bag": "Carteras", "handbags": "Carteras",
  "crossbody": "Carteras", "shoulder": "Carteras", "shoulder bag": "Carteras", "shoulder bags": "Carteras", "top handle": "Carteras",
  "briefcases": "Mochilas y bolsos", "duffle bags": "Mochilas y bolsos", "outerwear": "Casacas y abrigos", "bombers": "Casacas y abrigos",
  "peacoats": "Casacas y abrigos", "down": "Casacas y abrigos", "fur & shearling": "Casacas y abrigos", "denim": "Pantalones y jeans",
  "bottoms": "Pantalones y faldas", "bottom": "Pantalones y faldas", "henleys": "Polos", "v necks": "Chompas y polerones",
  "turtlenecks": "Chompas y polerones", "sweaters knits": "Chompas y polerones", "silks & cashmeres": "Chompas y polerones",
  "monkstraps": "Zapatos", "panty packs": "Lencería", "workoutgloveswraps": "Guantes", "handwraps": "Vendas", "shoes": "Zapatos",

  /* The department header's Tipo filter (#443 c.6545712892) lists every
     type a department holds: every English store type with 10+ products
     has its Spanish name here. */
  "tech accesorios": "Accesorios tecnológicos",
  "video games": "Videojuegos",
  "laptop computers": "Laptops",
  "laptop": "Laptops",
  "laptops/notebooks": "Laptops",
  "tablet computers": "Tablets",
  "apparel accessories": "Accesorios",
  "smart watches": "Relojes inteligentes",
  "fragrance": "Fragancia",
  "tech audifonos": "Audífonos",
  "headphones & earbuds": "Audífonos",
  "headphones": "Audífonos",
  "headsets": "Audífonos con micrófono",
  "gaming headsets": "Audífonos con micrófono",
  "table lamps": "Lámparas de mesa",
  "hair accessories": "Accesorios para el pelo",
  "motherboards": "Placas madre",
  "cell phones": "Celulares",
  "tech celulares": "Celulares",
  "throw pillows": "Cojines",
  "novelty pillows": "Cojines",
  "decorative bed pillows": "Cojines",
  "outdoor square pillows": "Cojines de exterior",
  "outdoor lumbar pillows": "Cojines de exterior",
  "tech computadoras": "Computadoras",
  "desktop computers": "Computadoras",
  "tech casa inteligente": "Casa inteligente",
  "vr headsets": "Lentes de realidad virtual",
  "ssd (solid state drives)": "Discos SSD",
  "hard drives": "Discos duros",
  "sheet sets": "Juegos de sábanas",
  "computer monitors": "Monitores",
  "flatware sets": "Cubiertos",
  "open stock flatware": "Cubiertos",
  "gaming keyboards": "Teclados",
  "computer keyboards": "Teclados",
  "keyboards": "Teclados",
  "mac keyboards": "Teclados",
  "cropped tanks": "Tops sin mangas",
  "tanks": "Tops sin mangas",
  "drop arm tanks": "Tops sin mangas",
  "full length tanks": "Tops sin mangas",
  "crop tanks": "Tops sin mangas",
  "instant cameras": "Cámaras instantáneas",
  "surveillance cameras": "Cámaras de seguridad",
  "digital cameras": "Cámaras digitales",
  "video cameras": "Videocámaras",
  "tech camaras": "Cámaras",
  "car dash cameras": "Cámaras para auto",
  "underwater cameras": "Cámaras acuáticas",
  "drinking glasses": "Vasos",
  "outdoor drinking glasses": "Vasos",
  "cocktail & bar glasses": "Vasos de cóctel",
  "outdoor cocktail & bar glasses": "Vasos de cóctel",
  "cocktail & whiskey glasses": "Vasos de cóctel",
  "outdoor wine glasses": "Copas",
  "champagne glasses": "Copas",
  "outdoor champagne glasses": "Copas",
  "champagne flutes": "Copas",
  "portable speakers": "Parlantes portátiles",
  "sound bars": "Barras de sonido",
  "aerial drones": "Drones",
  "throw blankets": "Mantas",
  "blankets": "Mantas",
  "network cables": "Cables de red",
  "belt": "Correas",
  "computer mice": "Mouse",
  "wide leg bottoms": "Pantalones",
  "straight leg pant": "Pantalones",
  "slim leg pant": "Pantalones",
  "outdoor bottoms": "Pantalones",
  "tactical bottoms": "Pantalones",
  "pant": "Pantalones",
  "bath towels": "Toallas",
  "bath towel bundles": "Toallas",
  "dinner plates": "Platos",
  "outdoor dinner plates": "Platos",
  "salad plates": "Platos",
  "outdoor salad plates": "Platos",
  "bakeware sets": "Moldes para hornear",
  "baking dishes": "Fuentes para hornear",
  "baking sheets": "Bandejas para hornear",
  "serving platters & trays": "Fuentes y bandejas",
  "outdoor serving platters & trays": "Fuentes y bandejas",
  "long sleeves": "Polos manga larga",
  "tech gaming": "Gaming",
  "kitchen dish towels": "Secadores de cocina",
  "bath accessories": "Accesorios de baño",
  "chargers": "Cargadores",
  "video game controllers": "Mandos de videojuego",
  "video game accessories": "Accesorios de videojuegos",
  "video game consoles": "Consolas",
  "network routers": "Routers",
  "comforter sets": "Edredones",
  "duvet cover sets": "Fundas de edredón",
  "pillow shams": "Fundas de almohada",
  "quilt sets": "Cubrecamas",
  "cooking utensils": "Utensilios de cocina",
  "serving utensils": "Utensilios para servir",
  "pasta & cereal bowls": "Tazones",
  "outdoor bowls": "Tazones",
  "bowls": "Tazones",
  "serving bowls & baskets": "Fuentes para servir",
  "serving bowls": "Fuentes para servir",
  "keychain": "Llaveros",
  "weight lifting belts": "Cinturones de levantamiento",
  "appetizer serveware": "Piqueos",
  "usb hubs": "Hubs USB",
  "unitards": "Enterizos",
  "jumpers": "Enterizos",
  "cheese boards & cutting boards": "Tablas de quesos y de picar",
  "tech auto": "Auto",
  "cleaning supplies & soaps": "Limpieza",
  "network switches": "Switches de red",
  "frying pans & skillets": "Sartenes",
  "lifting accessories": "Accesorios de levantamiento",
  "karaoke machines": "Karaoke",
  "mma training": "Entrenamiento MMA",
  "portable radios": "Radios",
  "usb wi fi adapters": "Adaptadores wifi",
  "wireless access points": "Puntos de acceso wifi",
  "network adapters": "Adaptadores de red",
  "tech componentes": "Componentes",
  "outdoor pitchers": "Jarras",
  "panales": "Pañales", "alimentacion": "Alimentación", "habitacion bebe": "Habitación del bebé",
  "pitchers": "Jarras",
  "tech relojes": "Relojes",
}));
/* Store types that arrive in Spanish, or as the loanword Peru's shops use
   (Skateboards, Bodyboards): shown as the store wrote them. Any other
   unmapped type joins "Más productos" in the header's axes and filter. */
const SPANISH_RAW_TYPES = new Set(["skateboards", "decks (tablas de skate)", "tablas de surf", "trucks, ruedas y partes", "accesorios de fútbol",
  "charms", "figura coleccionable", "accesorios de skate", "accesorios de surf", "repuestos y accesorios de pesca submarina", "stickers y decoración",
  "cascos y protecciones", "coche", "trajes de neopreno", "trípode", "cuidado corporal", "flash de estudio", "tarjeta de memoria", "máscaras y snorkels",
  "bodyboards", "skimboards", "bolso", "habitacion bebe", "dron", "arpones", "arpones de vara", "panales", "toallas y ponchos", "keratina y alisados",
  "pesas y cinturones", "quillas de surf", "pastillas de freno", "cuero cabelludo", "accesorios de tenis", "reparación", "champú y acondicionador",
  "autoasiento", "aceites y sérums", "sin enjuague", "silla de comer", "aletas de buceo", "equipo", "accesorio", "peluche", "raquetas",
  "cámara sin espejo", "portabebe", "más tratamientos", "snorkel", "boyas y flotadores", "cuchillos de buceo", "billetera", "sup / paddle surf",
  "hogar", "colchonetas", "faroles", "canilleras", "vendas", "pantalón", "objetivo", "ternos", "cascos", "manta", "disfraces", "alimentacion",
  "linternas de buceo", "accesorios de pesca submarina", "lactancia", "maternidad", "repuestos", "mallas de compresión", "gis y kimonos",
  "polos de licra", "camisetas de equipo", "balones y pelotas", "arcos y porterías", "reguladores", "cuerdas", "juegos", "calzado", "bolsos",
  "audífonos", "joyería", "cámaras", "mascarillas", "belleza", "perfumes", "regalos", "chaqueta", "pijama", "disfraz", "sombreros"]);
const SKU_TYPE = /^(?=[a-z]{0,6}\d)[a-z0-9]+$|^(?:general|retail|sample|wholesale|accessory|for (?:him|her))$/i;
export function typeLabel(t) {
  /* Store types arrive as "shapewear-bottoms", "Mens_Tops", "T Shirts". */
  const low = String(t).toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (SHOE_CLASS_LABELS.has(low)) return SHOE_CLASS_LABELS.get(low);
  if (TYPE_ES.has(low)) return TYPE_ES.get(low);
  if (SKU_TYPE.test(low)) return "Más productos";
  if (/^(?:mens|men's|men) (?:tops?|shirts?|t ?shirts?)$/.test(low)) return "Polos";
  if (/^(?:mens|men's|men) bottoms?$/.test(low)) return "Pantalones";
  if (/^kids tops?$/.test(low)) return "Polos";
  const kind = gearType({ title: low }) || modaType({ type: low });
  if (kind) {
    const g = GEAR_TYPES.find((x) => x[0] === kind) || brandTypeLabels().find((x) => x[0] === kind);
    if (g) return g[1];
  }
  return String(t).split(/[\s_\-]+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

/* The page's carousels, from a (possibly filtered) list in page order:
   Ofertas (biggest discount first) or, with no sales, Destacados; then
   one per product type with 3+ items, biggest first; then the rest. */
/* REACONDICIONADOS (#443): the rule is /condition.js, shared with the
   product page and the order line. Here only a SELLABLE condition counts
   -- one with a label; a held plain used listing (c.6526570723) is off
   sale and never enters a rail. Exported for the builder. */
export function conditionOfTitle(title) {
  const c = conditionOfAnyTitle(title);
  return c && c.label ? c : null;
}

/* ---------- PERFUMES (#443 item 32, Aria Perfumes) ----------
   The department that is all Aria Perfumes gets its own rails, in
   Danny's order: the great houses (the classics, sales between them),
   then the sales, then each class on its own rail (testers, minis,
   gift sets -- never merged with the boxed bottle), then the houses --
   the designer houses first -- body care last. The class is
   read from the title scripts/build-perfumes-catalog.mjs writes, so the
   static slices and the endpoint (fn rows: title, brand, type) agree. */
export const PERFUME_STORE = "ariaperfumes";
export const PERFUME_CLASSICS = [
  /* [house, fragrance, side]: Creed Aventus is the men's bottle -- the
     women's Aventus is a different scent. */
  ["Christian Dior", "Sauvage"], ["Creed", "Aventus", "para hombre"], ["Paco Rabanne", "1 Million"],
  ["Carolina Herrera", "Good Girl"], ["Yves Saint Laurent", "Black Opium"], ["Calvin Klein", "Ck One"],
];
export function perfumeClassOf(p) {
  const t = String((p && p.title) || "");
  if (/\(([^)]*\b)?Tester\b/.test(t)) return "testers";
  if (/— Set de regalo\b/.test(t)) return "sets";
  if (/\(([^)]*\b)?Mini\)/.test(t)) return "minis";
  if (String((p && p.type) || "") === "Cuidado corporal" || /— (Body mist|Body spray|After shave|Perfume para el cabello|Desodorante|Gel de ducha|Loción corporal|Jabón|Crema|Talco|Aroma para el hogar|Labial|Afeitado|Baño|Gel de baño|Aceite corporal|Manteca corporal|Vela)\b/.test(t)) return "cuidado";
  return "frasco";
}
/* The houses a shopper in Peru knows by name (the catalogue's own brand
   strings). They lead: their rail comes first and their house rails
   come before the long tail (#443 item 39 D -- recognition stops the
   scroll, then the price is the shock). */
export const PERFUME_DESIGNER_HOUSES = new Set([
  "christian dior", "creed", "paco rabanne", "carolina herrera", "yves saint laurent", "giorgio armani", "versace",
  "gucci", "prada", "burberry", "calvin klein", "tom ford", "valentino", "hugo boss", "dolce & gabbana",
  "jean paul gaultier", "chanel", "givenchy", "lancome", "ralph lauren", "azzaro", "montblanc", "mont blanc",
  "tommy hilfiger", "lacoste", "bvlgari", "hermes", "marc jacobs", "viktor & rolf", "thierry mugler", "mugler",
  "issey miyake", "kenzo", "jimmy choo", "michael kors", "coach", "estee lauder", "narciso rodriguez", "kilian",
  "maison francis kurkdjian", "xerjoff", "parfums de marly",
]);
/* The names a shopper in Peru recognizes on a sale (Danny: "the brands that
   are mainstream"): the designer houses plus the household names. */
export const PERFUME_MAINSTREAM = new Set([...PERFUME_DESIGNER_HOUSES, "guess", "davidoff", "elizabeth arden", "clinique", "moschino",
  "salvatore ferragamo", "ferragamo", "cartier", "chloe", "dkny", "donna karan", "juicy couture", "victoria's secret", "nautica",
  "antonio banderas", "perry ellis", "kenneth cole", "police", "jo malone", "lalique", "nina ricci", "paris hilton", "ariana grande",
  "britney spears", "abercrombie & fitch", "hollister", "adidas", "nike", "tous", "karl lagerfeld", "john varvatos", "bath & body works"]);
export function isDesignerHouse(p) { return PERFUME_DESIGNER_HOUSES.has(String((p && p.brand) || "").trim().toLowerCase()); }
const perfumeName = (p) => String((p && p.title) || "").split(" — ")[0].toLowerCase();
/* ---------- THE PERFUMES ROOM, THE UNIVERSAL FORMAT (Danny, #443
   c.6532584474 / c.6532666653, Oct 30) ----------
   Ofertas first, then one rail per KNOWN brand, biggest first by the true
   count, then one shared rail for the long tail ("Más marcas"). Inside one
   brand (a brand pill), the same format one level down: its Ofertas, then
   a rail per type (Mujer, Hombre, Unisex, Testers, Minis, Sets...).
   A brand is known when it carries PERFUME_KNOWN_MIN products, or is a
   designer house with PERFUME_HOUSE_MIN. The doors (Mujer / Hombre /
   Unisex / Minis / Sets / Testers) are the catalogue's own departments,
   carried on each row as `a`. */
export const PERFUME_KNOWN_MIN = 20, PERFUME_HOUSE_MIN = 5;
export const PERFUME_DOORS = [["mujer", "Mujer"], ["hombre", "Hombre"], ["unisex", "Unisex"], ["minis", "Minis"], ["sets", "Sets de regalo"], ["testers", "Testers"]];
const PERFUME_TYPE_RAILS = [["mujer", "Para mujer"], ["hombre", "Para hombre"], ["unisex", "Unisex"], ["mas", "Más perfumes"], ["testers", "Testers"], ["minis", "Minis y de viaje"], ["sets", "Sets de regalo"], ["cuidado", "Cuerpo y cuidado"], ["repuestos", "Repuestos"]];
const brandKey = (p) => String((p && p.brand) || "").trim().toLowerCase();
/* The brand groups of a list: [{ key, label, items }], biggest first; the
   label is the spelling most of its products carry ("Juliette Has A Gun"). */
export function perfumeBrands(list) {
  const by = new Map();
  for (const p of list) {
    const k = brandKey(p);
    if (!k) continue;
    if (!by.has(k)) by.set(k, { key: k, items: [], spell: new Map() });
    const g = by.get(k);
    g.items.push(p);
    const b = String(p.brand).trim();
    g.spell.set(b, (g.spell.get(b) || 0) + 1);
  }
  return [...by.values()].map((g) => ({ key: g.key, label: [...g.spell.entries()].sort((a, b) => b[1] - a[1])[0][0], items: g.items }))
    .sort((a, b) => (b.items.length - a.items.length) || a.label.localeCompare(b.label));
}
export const isKnownPerfumeBrand = (g) => g.items.length >= PERFUME_KNOWN_MIN || (g.items.length >= PERFUME_HOUSE_MIN && PERFUME_DESIGNER_HOUSES.has(g.key));
/* Danny: the mainstream houses' sales lead; a lesser name leads only when
   it is really cheap (under US$30); then everything else on sale. */
const PERFUME_CHEAP = 30;
function perfumeSalesOrder(sales, mainstream) {
  /* The designer houses lead, then the household names, then a really
     cheap lesser name (cheapest first), then the rest -- each part by its
     discount; the boxed bottle before its tester or mini. */
  const rank = (p) => (PERFUME_DESIGNER_HOUSES.has(brandKey(p)) ? 0 : mainstream.has(brandKey(p)) ? 1 : p.rawPrice < PERFUME_CHEAP ? 2 : 3);
  const bottle = (p) => (perfumeClassOf(p) === "frasco" ? 0 : 1);
  return sales.map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => (a.r - b.r) || (bottle(a.p) - bottle(b.p)) || (a.r === 2 ? a.p.rawPrice - b.p.rawPrice : 0) || (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
}
/* Inside a rail: the boxed bottle before its variants, on sale first, then cheapest first. */
function perfumeRailOrder(items) {
  return items.map((p, i) => ({ p, i })).sort((a, b) => ((perfumeClassOf(a.p) === "frasco" ? 0 : 1) - (perfumeClassOf(b.p) === "frasco" ? 0 : 1))
    || ((b.p.salePct > 0) - (a.p.salePct > 0)) || (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i)).map((x) => x.p);
}
/* A product's type rail: its class, else its door (the catalogue department). */
function perfumeTypeOf(p) {
  const c = perfumeClassOf(p);
  if (c !== "frasco") return c;
  if (["mujer", "hombre", "unisex"].includes(p.a)) return p.a;
  const t = String(p.title || "");
  /* A bottle from another store says who it is for in its own words, or is "más". */
  return /\bpara hombre$|\b(for men|men's|pour homme|homme)\b/i.test(t) ? "hombre" : /\bpara mujer$|\b(for women|women's|pour femme|femme)\b/i.test(t) ? "mujer" : /\bunisex\b/i.test(t) ? "unisex" : "mas";
}
export function buildPerfumeSections(list) {
  const sections = [];
  const brands = perfumeBrands(list);
  const mainstream = PERFUME_MAINSTREAM;
  const sales = list.filter((p) => p.salePct > 0);
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: perfumeSalesOrder(sales, mainstream) });
  /* One brand (a brand pill): its rails are its types. */
  if (brands.length === 1) {
    for (const [k, title] of PERFUME_TYPE_RAILS) {
      const l = list.filter((p) => perfumeTypeOf(p) === k);
      if (l.length) sections.push({ key: "tipo:" + k, title, items: perfumeRailOrder(l) });
    }
    return sections;
  }
  const known = brands.filter(isKnownPerfumeBrand);
  for (const g of known) sections.push({ key: "marca:" + g.key, title: g.label, items: perfumeRailOrder(g.items) });
  const knownKeys = new Set(known.map((g) => g.key));
  const tail = list.filter((p) => !knownKeys.has(brandKey(p)));
  if (tail.length) sections.push({ key: "marca:mas", title: "Más marcas", items: perfumeRailOrder(tail) });
  return sections;
}
/* ---------- CATEGORY ROOMS: RAILS BY BRAND (the universal format, #443
   c.6532666653: "a CATEGORY page rails by BRAND; a brand inside a category
   by TYPE") ----------
   Fight Club, Gym Rat, Surf & Skate, Fútbol, Tenis, Pesca submarina, Lentes
   de sol, Joyas, Lujo: Ofertas first, one rail per brand with
   BRAND_ROOM_MIN products (biggest first, true counts), the rest on one
   «Más marcas» rail. A brand pill opens that brand alone, its rails by type
   (Venum: shorts, gloves, gis, headgear...). */
export const BRAND_ROOMS = new Set(["combat_sports", "gym_rat", "surf_skate", "spearfishing", "soccer", "tennis", "sunglasses", "joyas_accesorios", "luxury"]);
export const BRAND_ROOM_MIN = 8;
/* A mall floor, not an endless scroll: at most this many brand rails (and
   pills); the brands after them share «Más marcas». */
export const BRAND_ROOM_MAX = 60;
/* A store's own vendor code or an empty string is not a brand a shopper knows. */
const NOT_A_BRAND_RX = /^(?:[A-Z]{2,6}\/|\d+$|n\/?a$|unknown$|generic$|unbranded$|for (?:him|her)$|men$|women$|kids$)/i;
/* RAILS LEAD WITH CLOTHES (#443 c.6544911957, Danny on AYBL's sock wall).
   Socks and their kin -- headbands, wristbands, scrunchies, bottles,
   towels, underwear -- never take a rail's lead and never dominate it:
   the first HERO_LEAD cards are clothing, then one small piece in every
   SPRINKLE_EVERY cards, each tier keeping the rail's own order (sales
   first). A rail of nothing but small pieces keeps them. */
export const SMALL_PIECE_RX = /\b(socks?|sock packs?|no[- ]show|caps?|snapbacks?|trucker hats?|5 panels?|five panels?|hats?|beanies?|visors?|bags?|backpacks?|duffels?|totes?|belts?|gloves?|headbands?|sweat ?bands?|wrist ?bands?|scrunchies?|hair ties?|shakers?|bottles?|towels?|keychains?|key ?rings?|stickers?|decals?|boxer briefs?|briefs?|boxers?|thongs?|underwear|trunks? 3 ?pack)\b/i;
export const HERO_LEAD = 12, SPRINKLE_EVERY = 4;
/* The rooms whose rails are clothing rails. Not Fight Club (gloves are
   its hero), Fútbol (goalkeeper gloves, match socks), Joyas or Lujo (bags
   and belts are the product). */
export const APPAREL_ROOMS = new Set(["gym_rat"]);
export function clothesFirst(items) {
  const hero = [], small = [];
  for (const p of items) (SMALL_PIECE_RX.test(String(p.title || p.name || "")) ? small : hero).push(p);
  if (!hero.length || !small.length) return items;
  const out = hero.splice(0, HERO_LEAD);
  while (hero.length || small.length) {
    for (let k = 0; k < SPRINKLE_EVERY - 1 && hero.length; k++) out.push(hero.shift());
    if (small.length) out.push(small.shift());
    if (!hero.length) { out.push(...small); small.length = 0; }
  }
  return out;
}
function buildBrandRoomSections(list, apparel = false) {
  const lead = apparel ? clothesFirst : (l) => l;
  const groups = perfumeBrands(list.filter((p) => !NOT_A_BRAND_RX.test(String(p.brand || "").trim())));
  /* One brand: the format one level down -- its Ofertas, then its types. */
  if (groups.length === 1 && groups[0].items.length === list.length) return brandTypeSections(list, apparel);
  const sections = [];
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i })).sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: lead(sales) });
  const known = groups.filter((g) => g.items.length >= BRAND_ROOM_MIN).slice(0, BRAND_ROOM_MAX);
  const order = (l) => lead(l.map((p, i) => ({ p, i })).sort((a, b) => ((b.p.salePct > 0) - (a.p.salePct > 0)) || (a.i - b.i)).map((x) => x.p));
  for (const g of known) sections.push({ key: "marca:" + g.key, title: g.label, items: order(g.items) });
  const knownKeys = new Set(known.map((g) => g.key));
  const tail = list.filter((p) => !knownKeys.has(String(p.brand || "").trim().toLowerCase()));
  if (tail.length) sections.push({ key: "marca:mas", title: "Más marcas", items: order(tail) });
  return sections;
}
/* A brand's rails by type: Moda's Spanish clothing types when the brand is
   mostly clothing and shoes (Venum: shorts, polos, casacas...), else the
   store's own types; Ofertas first either way. */
let BRAND_TYPE_LABELS = null;
function brandTypeLabels() {
  if (BRAND_TYPE_LABELS) return BRAND_TYPE_LABELS;
  const seen = new Set(), out = [];
  for (const l of [...MODA_LABELS.women, ...MODA_LABELS.men]) if (!seen.has(l[0])) { seen.add(l[0]); out.push(l); }
  return (BRAND_TYPE_LABELS = out);
}
/* Sports gear, read before the clothing type (a rash guard in Fight Club
   is a «polo de licra», not swimwear; Danny's Venum example: shorts,
   shirts, gis, headgear, gloves, shin guards). */
const GEAR_TYPES = [
  /* Jewelry first: a «ball stud» earring is an earring. */
  ["aretes", "Aretes", /\bearrings?\b|\baretes?\b|\bstuds?\b|\bhoops?\b|\bhuggies?\b|\bear (?:cuffs?|climbers?|crawlers?)\b/i],
  ["collares", "Collares y dijes", /\bnecklaces?\b|\bcollares?\b|\bpendants?\b|\bchokers?\b|\blockets?\b/i],
  ["pulseras", "Pulseras y tobilleras", /\bbracelets?\b|\bbangles?\b|\bcuffs?\b|\banklets?\b|\bpulseras?\b/i],
  ["anillos", "Anillos", /\brings?\b|\banillos?\b/i],
  ["charms", "Charms", /\bcharms?\b/i],
  ["broches", "Broches y pines", /\bbrooch(?:es)?\b|\bpins?\b|\bbroches?\b/i],
  ["pelo", "Accesorios para el pelo", /\bhair ?(?:clips?|claws?|pins?|ties?|bows?)\b|\bclaw clips?\b|\bheadbands?\b|\bscrunchies?\b|\bbarrettes?\b/i],
  ["licras", "Polos de licra", /\brash ?guards?\b|\blicras?\b/i],
  ["mallas", "Mallas de compresión", /\bspats\b|\bcompression (?:tights|pants|leggings)\b/i],
  ["gis", "Gis y kimonos", /\b(?:bjj|jiu.?jitsu|judo|karate)?\s*gis?\b(?!\w)|\bkimonos?\b/i],
  ["guantes", "Guantes", /\bgloves?\b|\bguantes?\b|\bmitts?\b/i],
  ["canilleras", "Canilleras", /\bshin ?(?:guards?|pads?|instep)\b|\bcanilleras?\b/i],
  ["cabezales", "Cabezales y protectores", /\bhead ?(?:gear|guards?)\b|\bcabezal(?:es)?\b|\bcups?\b.*\bprotect|\bgroin\b|\bchest (?:guard|protector)\b/i],
  ["vendas", "Vendas", /\bhand ?wraps?\b|\bvendas?\b/i],
  ["bucales", "Bucales", /\bmouth ?guards?\b|\bbucal(?:es)?\b/i],
  ["sacos", "Sacos y equipo de gimnasio", /\b(?:punching|heavy|speed|double.?end|muay thai) bags?\b|\bfocus mitts?\b|\bthai pads?\b|\bkick shields?\b/i],
  ["chimpunes", "Chimpunes", /\bcleats?\b|\bfirm ground\b|\b(?:fg|ag|tf|mg)(?:\/(?:fg|ag|tf|mg))?\b|\bturf\b|\bchimpun\w*/i],
  ["camisetas", "Camisetas de equipo", /\bjerseys?\b|\b(?:home|away|third) (?:kit|shirt)\b|\bcamisetas? de (?:equipo|f[uú]tbol)\b/i],
  ["balones", "Balones y pelotas", /\b(?:soccer|foot|basket|volley|tennis|pickle|golf|base|soft|training|match|futsal) ?balls?\b|\bbal[oó]n(?:es)?\b|\bpelotas?\b/i],
];
const gearType = (p) => { const t = String((p && p.title) || "") + " " + String((p && p.type) || ""); for (const [k, , rx] of GEAR_TYPES) if (rx.test(t)) return k; return ""; };
function brandTypeSections(list, apparel = false) {
  const kind = (p) => gearType(p) || modaType(p);
  if (list.filter(kind).length < list.length * 0.6) return buildSectionsRaw(list, {});
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i })).sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  const secs = [];
  const labels = [...GEAR_TYPES.map(([k, label]) => [k, label]), ...brandTypeLabels()];
  for (const [k, label] of labels) {
    const l = list.filter((p) => kind(p) === k);
    if (l.length) secs.push({ key: "tipo:" + k, title: label, items: l });
  }
  secs.sort((a, b) => b.items.length - a.items.length);
  const rest = list.filter((p) => !kind(p));
  if (rest.length) secs.push({ key: "tipo:otros", title: "Más productos", items: rest });
  return (sales.length ? [{ key: "ofertas", title: "Ofertas", items: apparel ? clothesFirst(sales) : sales }] : []).concat(secs).map((x) => ({ ...x, items: photosFirst(x.items) }));
}
export function typeViewSections(list) {
  const known = perfumeBrands(list.filter((p) => !NOT_A_BRAND_RX.test(String(p.brand || "").trim()))).filter((g) => g.items.length >= BRAND_ROOM_MIN);
  if (known.length >= 2) return buildBrandRoomSections(list).map((x) => ({ ...x, items: photosFirst(x.items) }));
  const sales = list.filter((p) => p.salePct > 0);
  const by = new Map();
  for (const p of list) { if (!by.has(p.retailer)) by.set(p.retailer, []); by.get(p.retailer).push(p); }
  const secs = sales.length ? [{ key: "ofertas", title: "Ofertas", items: sales }] : [];
  for (const [r, l] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) secs.push({ key: "tienda:" + r, title: r, items: l });
  return secs.map((x) => ({ ...x, items: photosFirst(x.items) }));
}
export function brandRoomPills(list) {
  const groups = perfumeBrands(list.filter((p) => !NOT_A_BRAND_RX.test(String(p.brand || "").trim()))).filter((g) => g.items.length >= BRAND_ROOM_MIN).slice(0, BRAND_ROOM_MAX);
  /* The pill's key is its label (the page sends it back as b=). */
  return groups.length >= 2 ? { brands: groups.map((g) => ({ label: g.label, n: g.items.length })) } : {};
}

/* The pills above the room: the doors with their counts, and one pill per
   known brand, biggest first (the head carries them; a pill re-scopes the
   page through the endpoint's a= / b= filters). */
export function perfumePills(list) {
  const doors = PERFUME_DOORS.map(([k, label]) => ({ k, label, n: list.filter((p) => p.a === k).length })).filter((d) => d.n > 0);
  const brands = perfumeBrands(list).filter(isKnownPerfumeBrand).map((g) => ({ k: g.label, label: g.label, n: g.items.length }));
  return { doors, brands };
}

/* The shoe departments (#443 c.6405702652): their types are Aria's own
   footwear classes, and the front of a mixed rail is interleaved so one
   cheap class cannot take it (the Shoes rail's first 24 cards were all
   sandals). */
export const SHOE_DEPTS = new Set(["shoes", "shoes_women", "shoes_men"]);
export function sectionOpts(key) {
  if (key === CASA_DEPT) return { casa: true };
  if (key === TECH_DEPT) return { tech: true };
  if (key === CABELLO_DEPT) return { cabello: true };
  if (key === "perfumes") return { perfume: true };
  if (BRAND_ROOMS.has(key)) return { brandRoom: true, apparel: APPAREL_ROOMS.has(key) };
  if (key === PLUS_DEPT) return { plus: true };
  if (key === REFURB_DEPT) return { refurb: true };
  return SHOE_DEPTS.has(key) ? { interleave: true, genderAisles: key === "shoes" } : {};
}

/* ---------- CASA ARIA (#443 c.6458486219) ----------
   Hogar is Aria's home wing. It opens with Libros de mesa (Assouline and
   Chronicle, the halo), then the two home stores -- they stay named, the
   store a piece comes from is the point -- then Navidad while it is the
   season (October to December), then Ofertas under the standing rule,
   then the aisles of a home store, then everything else by type. A row's
   `a` is its place: "libros" or a Casa Aria aisle. */
export const CASA_DEPT = "home_goods";
export const CASA_STORES = [["crateandbarrel", "Crate & Barrel"], ["pier1", "Pier 1"]];
export const CASA_AISLES = [["casa_velas", "Velas y aromas"], ["casa_textiles", "Cojines y mantas"], ["casa_cama_bano", "Cama y baño"],
  ["casa_mesa", "Mesa y vajilla"], ["casa_cocina", "Cocina"], ["casa_iluminacion", "Lámparas"], ["casa_decoracion", "Decoración"]];
export const isNavidadSeason = (d = new Date()) => d.getUTCMonth() >= 9;
function buildCasaSections(list) {
  const sections = [];
  const libros = list.filter((p) => p.a === "libros");
  const home = list.filter((p) => p.a !== "libros");
  if (libros.length) sections.push({ key: "casa:libros", title: "Libros de mesa", items: libros });
  for (const [r, title] of CASA_STORES) {
    const l = home.filter((p) => p.retailer === r && p.a !== "casa_navidad");
    if (l.length) sections.push({ key: "tienda:" + r, title, items: l });
  }
  const navidad = home.filter((p) => p.a === "casa_navidad");
  if (navidad.length && isNavidadSeason()) sections.push({ key: "casa:navidad", title: "Navidad", items: navidad });
  const sales = home.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  for (const [k, title] of CASA_AISLES) {
    const l = home.filter((p) => p.a === k);
    if (l.length) sections.push({ key: "casa:" + k, title, items: l });
  }
  if (navidad.length && !isNavidadSeason()) sections.push({ key: "casa:navidad", title: "Navidad", items: navidad });
  const rest = home.filter((p) => !p.a);
  for (const s of buildSectionsRaw(rest, {})) if (s.key !== "ofertas" && s.key !== "destacados") sections.push({ ...s, title: s.key === "tipo:otros" ? "Más para tu casa" : s.title });
  return sections;
}
/* ---------- ELECTRÓNICA (Order C, #443) ----------
   The cross-store Ofertas, then B&H's destacados (the camera house leads
   the stores), then Reacondicionados with its disclosure, then «Laptops
   para estudiar», then each electronics store on its own rail, then the
   named aisles of scripts/lib/tech-aisle.js -- one rule for every store,
   so the store's own English categories ("Laptop Computers", "Laptop",
   "Laptops/Notebooks") never split one aisle three ways. A row whose
   type is already an aisle (tech_*) keeps it; any other is filed by its
   own name, the store's type only a hint. */
export const TECH_DEPT = "electronics";
export const TECH_LEAD_STORE = ["bhphoto", "B&H Photo"];
export const TECH_STORES = [["brandsmart", "BrandsMart USA"], ["microcenter", "Micro Center"], ["walmart", "Walmart"], ["costco", "Costco"]];
export const REFURB_NOTE = "No son productos nuevos: cada tarjeta dice si es de caja abierta, reacondicionado o usado certificado, tal como lo declara la tienda.";
/* THE STUDY-LAPTOP LINE (c.6470946695): a laptop or Chromebook whose
   PRODUCT price is under the $200 import line pays no import tax. The
   test is the store's own price, nothing added; a tablet is not one. */
export const STUDY_LAPTOP_MAX = 200;
export const STUDY_NOTE = "Laptops para la escuela y la universidad, sin impuesto de importación.";
const LAPTOP_RX = /\b(laptops?|notebooks?|chromebooks?|macbook)\b/i;
/* ...and the computer itself, by a spec only a computer states: a laptop
   tray, a toy "laptop" or a laptop bag names none. */
const LAPTOP_SPEC_RX = /\b(\d+\s?gb|ssd|emmc|celeron|pentium|intel|amd|ryzen|athlon|mediatek|core i\d|chrome ?os|windows \d+)\b/i;
const NOT_LAPTOP_RX = /\b(tablets?|ipad|cases?|sleeves?|bags?|backpacks?|stands?|trays?|desks?|drones?|toys?|kids|learning|cooler|cooling pad|skins?|chargers?|adapters?|keyboards?|mouse|docks?|docking|locks?|screen protectors?|batter(y|ies)|replacement|lcd screen|hinges?|fans?)\b/i;
export const techAisleOf = (p) => (/^tech_/.test(String(p.type || "")) ? String(p.type) : techAisle(p.title, p.type));
export function isStudyLaptop(p) {
  const t = String(p.title || "");
  return p.rawPrice > 0 && p.rawPrice < STUDY_LAPTOP_MAX && techAisleOf(p) === "tech_computadoras" &&
    LAPTOP_RX.test(t) && LAPTOP_SPEC_RX.test(t) && !NOT_LAPTOP_RX.test(t);
}
const STORE_RAIL_MIN = 6;
/* THE SEPARATION RULING (Danny, #443 c.6488544902): every Electrónica
   shelf -- Ofertas, the stores, the aisles, Laptops para estudiar,
   Chromebooks, Consolas -- shows NEW units only; refurbished, used and
   open-box stock lives only in Reacondicionados (its disclosure above it,
   the refurbished Chromebooks first, c.6488281596). Computadoras,
   Chromebooks and Laptops para estudiar carry a door to it, never mixed
   stock. Ofertas leads with a good Walmart camera, small accessories last
   (c.6487219343). */
export const REFURB_DOOR_TEXT = "¿Buscas una opción más barata? Ver Reacondicionados";
export function techOfertasOrder(sales) {
  const small = (p) => isAccessoryName(p.title) || p.rawPrice < 25;
  const heroes = sales.filter((p) => !small(p)).map((p, i) => ({ p, i, s: homeStrength(p, "") }))
    .sort((a, b) => (b.s - a.s) || (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  const cams = heroes.filter((p) => p.retailer === "walmart" && techAisleOf(p) === "tech_camaras" && OFERTAS_LEAD_CAMERA_RX.test(p.title) && p.salePct >= 30
    && !/\b(security|surveillance|dash|doorbell|webcam|baby|kids?|children|toy|trail|spy|hidden|nanny|cctv|ip cam|body|drones?|quadcopter|thumb|wearable)\b/i.test(p.title) && !isAccessoryName(p.title) && p.rawPrice >= 50)
    .sort((a, b) => (b.rawPrice - a.rawPrice) || (b.salePct - a.salePct));
  const lead = cams[0] ? [cams[0]] : [];
  return lead.concat(heroes.filter((p) => p !== cams[0]), sales.filter(small).sort((a, b) => b.salePct - a.salePct));
}
export function refurbOrder(refurb) {
  const books = refurb.filter((p) => isChromebook(p)).sort((a, b) => a.rawPrice - b.rawPrice);
  return books.concat(refurb.filter((p) => !books.includes(p)));
}
function buildTechSections(all) {
  const sections = [];
  const refurb = all.filter((p) => conditionOfTitle(p.title));
  const list = all.filter((p) => !conditionOfTitle(p.title));
  const door = refurb.length >= 3 ? REFURB_DOOR_TEXT : "";
  const sales = list.filter((p) => p.salePct > 0);
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: techOfertasOrder(sales) });
  const stores = new Set(all.map((p) => p.retailer));
  /* One store chosen (the store chip): its own rail would be the whole list. */
  const many = stores.size > 1;
  const lead = list.filter((p) => p.retailer === TECH_LEAD_STORE[0]);
  if (many && lead.length >= STORE_RAIL_MIN) sections.push({ key: "tienda:" + TECH_LEAD_STORE[0], title: "Destacados de " + TECH_LEAD_STORE[1], items: lead });
  if (refurb.length >= 3) sections.push({ key: "reacondicionados", title: "Reacondicionados", note: REFURB_NOTE, items: refurbOrder(refurb) });
  /* Renders only when the under-$200 set fills a rail (the Aisle Test). */
  const study = list.filter(isStudyLaptop).sort((a, b) => a.rawPrice - b.rawPrice);
  if (study.length >= STORE_RAIL_MIN) sections.push({ key: "estudio", title: "Laptops para estudiar", note: STUDY_NOTE, door, items: study });
  const books = list.filter(isChromebook);
  if (books.length >= STORE_RAIL_MIN) sections.push({ key: "chromebooks", title: "Chromebooks", door, items: books.sort((a, b) => ((b.salePct > 0) - (a.salePct > 0)) || (a.rawPrice - b.rawPrice)) });
  const consoles = list.filter(isConsole);
  if (consoles.length >= STORE_RAIL_MIN) sections.push({ key: "consolas", title: "Consolas", items: consoles });
  if (many) for (const [r, title] of TECH_STORES) {
    const l = list.filter((p) => p.retailer === r);
    if (l.length >= STORE_RAIL_MIN) sections.push({ key: "tienda:" + r, title, items: l });
  }
  const byAisle = {};
  for (const p of list) (byAisle[techAisleOf(p)] ||= []).push(p);
  for (const k of TECH_AISLE_ORDER) {
    const l = byAisle[k];
    if (l && l.length) sections.push({ key: "pasillo:" + k, title: TECH_AISLE_LABELS[k], items: k === "tech_celulares" ? celularesOrder(l) : l, ...(k === "tech_computadoras" ? { door } : {}) });
  }
  return sections;
}

/* THE HOMEPAGE ELECTRÓNICA CAROUSEL (Danny, #443 c.6485409220): one
   carousel, one pill row above it, the pills in-place lenses. «Ofertas»
   is the default (the strongest sales across the department, devices
   first), then the types Danny named -- Celulares, Computadoras,
   Videojuegos, Audífonos -- then every other aisle the data fills. A
   pill renders only with HOME_PILL_MIN real cards (the Aisle Test);
   inside each, devices lead what fits them. */
export const HOME_PILL_MIN = 8, HOME_PILL_CARDS = 24;
export const HOME_TECH_PILLS = [["tech_celulares", "Celulares"], ["tech_computadoras", "Computadoras"], ["tech_gaming", "Videojuegos"],
  ["tech_audifonos", "Audífonos"], ["tech_camaras", "Cámaras"], ["tech_relojes", "Relojes"], ["tech_audio", "Parlantes"],
  ["tech_casa_inteligente", "Casa inteligente"], ["tech_componentes", "Componentes"], ["tech_auto", "Auto"], ["tech_accesorios", "Accesorios"]];
const HOME_DEVICE_RX = {
  tech_celulares: /\b(iphone|galaxy|pixel|moto|razr|smartphone|unlocked)\b/i,
  tech_computadoras: /\b(laptops?|notebooks?|chromebooks?|macbook|ipad|tablets?|desktop|all-in-one|vivobook|zenbook|ideapad|thinkpad|copilot\+ pc)\b/i,
  tech_gaming: /\b(consoles?|steam deck|meta quest \d|rog ally|legion go|dualsense|(xbox|ps5|playstation 5)[^,]*controller|nintendo switch (2|oled|lite)(?![^,]*-))\b/i,
  tech_audifonos: /\b(airpods|earbuds|headphones|headset)\b/i,
  tech_camaras: /\b(mirrorless|dslr|gopro|insta360|dji|instax|camera body|digital camera|action camera|vlog)\b/i,
  tech_relojes: /\b(apple watch|galaxy watch|smart ?watch|garmin|fitbit|amazfit)\b/i,
  tech_audio: /\b(speakers?|soundbars?|sound bars?|turntables?|subwoofers?)\b/i,
  tech_casa_inteligente: /\b(doorbells?|security cam(era)?s?|echo|nest|smart (plugs?|displays?|locks?))\b/i,
  tech_componentes: /\b(ssd|nvme|ddr[45]|motherboards?|graphics cards?|rtx|radeon|processors?)\b/i,
  tech_auto: /\b(dash ?cams?|car stereo|carplay|android auto|car speakers?)\b/i,
  tech_accesorios: /\b(chargers?|power banks?|keyboards?|mouse|monitors?)\b/i,
};
/* ---------- CELULARES: THE PERU-PRESENCE ORDER ----------
   (#443 c.6487219343, Danny's Celulares lead rule; the three open
   questions answered in c.6490718675.)

   Peru buys Samsung and the carrier brands at home, at prices Aria
   cannot beat: a Galaxy S25 FE is S/ 2,399 at Falabella against our
   ~$1,108 all-in. So a phone Peru already sells never leads the lens.
   Aria wins on the phone that has a following and no local store, so
   Celulares leads with those -- Google Pixel first, OnePlus second.
   iPhone takes the third slot although Peru does sell it, on the
   Garantía Aria story alone: ours lands ~S/ 2,900 against Entel's
   ~S/ 5,190 new, insured trip and returns included. That is ranking
   rationale only -- no card, no copy and no phone changes. Then the
   rest of the can't-get-it-here class, then the brands nobody placed,
   and the saturated brands last: still listed, still sellable, never
   the lead.

   These are brand lists, not logic. A brand moves tier by moving a
   row, and BrandsMart drops the maker from its titles ("6.1\" 7a 5G"),
   so each lead brand reads the title OR the brand field. */
export const PHONE_LEAD_BRANDS = [
  ["Google Pixel", /\bpixel\b/i, /^google$/i],
  ["OnePlus", /\bone ?plus\b/i, /^one ?plus$/i],
  ["iPhone", /\biphone\b/i, /^apple$/i],
];
/* Not sold officially in Peru: Danny named Sony Xperia's class here. */
const PHONE_ABSENT_RX = /\b(xperia|nothing phone|zenfone|rog phone|fairphone|hmd\b)\b/i;
/* Sold officially in Peru at local prices we do not beat: the back. */
const PHONE_SOLD_IN_PERU_RX = /\b(samsung|galaxy|motorola|moto ?[gez]\b|razr|xiaomi|redmi|poco\b|huawei|honor|oppo|vivo|realme|infinix|tecno|zte|tcl|alcatel|nokia)\b/i;
export const PHONE_RANKS = PHONE_LEAD_BRANDS.length + 3;   // 0..5

/** Where one handset sits in the Celulares lens: 0 Pixel, 1 OnePlus,
    2 iPhone, 3 the can't-get-it-here class, 4 unplaced, 5 saturated. */
export function phoneBrandRank(p) {
  const title = String((p && p.title) || ""), brand = String((p && p.brand) || "").trim();
  for (let i = 0; i < PHONE_LEAD_BRANDS.length; i++) {
    const [, titleRx, brandRx] = PHONE_LEAD_BRANDS[i];
    if (titleRx.test(title) || brandRx.test(brand)) return i;
  }
  const t = title + " " + brand;
  if (PHONE_ABSENT_RX.test(t)) return PHONE_LEAD_BRANDS.length;
  if (PHONE_SOLD_IN_PERU_RX.test(t)) return PHONE_RANKS - 1;
  return PHONE_LEAD_BRANDS.length + 1;
}
/* Inside a brand's tier the sealed phone goes first: the lens is the
   trust anchor, and a tier led by a "- Reacondicionado" title reads as
   a used-phone shop. The refurbished units stay where they are -- their
   own pill is the separation ruling (c.6488544902), not this sort. */
const phoneIsRefurb = (p) => (conditionOfTitle(String((p && p.title) || "")) ? 1 : 0);

/* SELLABLE FIRST (Danny, #443 c.6531245142, c.6535121937 -- supersedes the
   Peru-presence order above for display). What a Peruvian wallet buys
   leads Celulares: phones at or under the US$200 import-tax line, cheapest
   first (BLU, moto, Galaxy A...). Then THE iPhone Aria promotes, the
   iPhone 18 line (its landed price beats Lima's). Then the mid range.
   The other new Apple / Samsung flagships go last -- still listed, still
   sellable, found by search. A refurbished phone is exempt from the
   flagship tier: it keeps its price position. */
export const PHONE_SELL_LINE_USD = 200;
const PHONE_PROMOTED_RX = /\biphone\s*18\b/i;
const PHONE_FLAGSHIP_RX = /\b(iphone|galaxy\s*(s\d+|z|note)|ultra|fold|flip|pixel\s*\d+\s*pro)\b/i;
const phonePrice = (p) => Number((p && (p.rawPrice ?? p.price ?? p.p)) || 0);
/** 0 at or under the line, 1 the iPhone 18 line, 2 the mid range, 3 the other new flagships. */
export function phoneSellRank(p) {
  const t = String((p && (p.title || p.t)) || "") + " " + String((p && (p.brand || p.b)) || "");
  const refurb = phoneIsRefurb({ title: (p && (p.title || p.t)) || "" });
  if (PHONE_PROMOTED_RX.test(t) && !refurb) return 1;
  const price = phonePrice(p);
  if (price > 0 && price <= PHONE_SELL_LINE_USD) return 0;
  if (!refurb && PHONE_FLAGSHIP_RX.test(t)) return 3;
  return 2;
}

/** The Celulares rail of a department page: sellable first (above),
    cheapest first inside each tier, the sealed phone before the
    refurbished one at the same tier. */
export const celularesOrder = (l) => promoteIphone18(l.map((p, i) => ({ p, i, b: phoneSellRank(p), n: phoneIsRefurb(p), c: phonePrice(p) }))
  .sort((x, y) => (x.b - y.b) || (x.c - y.c) || (x.n - y.n) || (x.i - y.i)).map((x) => x.p));
/* "The 18 is the one we promote" (c.6535121937): one card per iPhone 18
   model (Pro, Pro Max) is pinned right after the first accessible phones,
   so the promotion shows on the first screen without leading the rail. */
export const PHONE_PROMOTED_SLOT = 3;
export function promoteIphone18(list) {
  const seen = new Set(), pinned = [];
  for (const p of list) {
    const t = String((p && (p.title || p.t)) || "");
    if (!PHONE_PROMOTED_RX.test(t) || phoneIsRefurb({ title: t })) continue;
    const model = /pro\s*max/i.test(t) ? "pro max" : /\bpro\b/i.test(t) ? "pro" : /plus/i.test(t) ? "plus" : "base";
    if (seen.has(model)) continue;
    seen.add(model); pinned.push(p);
  }
  if (!pinned.length) return list;
  const rest = list.filter((p) => !pinned.includes(p));
  return rest.slice(0, PHONE_PROMOTED_SLOT).concat(pinned, rest.slice(PHONE_PROMOTED_SLOT));
}

const HOME_BRAND_RX = /\b(apple|samsung|google|sony|bose|jbl|beats|microsoft|nintendo|playstation|xbox|meta|dji|gopro|canon|nikon|fujifilm|garmin|fitbit|lenovo|hp|dell|asus|acer|msi|logitech|anker|sonos|marshall|ring|blink|arlo|skullcandy|sennheiser|razer|corsair|hyperx|kingston|crucial|western digital|sandisk|motorola|tcl|lg)\b/i;
const HOME_SPEC_RX = /\b(\d+\s?gb|\d+\s?tb|intel|amd|ryzen|celeron|core (i|ultra)|m\d chip|snapdragon)\b/i;
export function homeStrength(p, k) {
  const t = String(p.title || "") + " " + String(p.brand || "");
  const rx = HOME_DEVICE_RX[k || techAisleOf(p)];
  let s = 0;
  if (!isAccessoryName(p.title)) s += 1;
  if (rx && rx.test(p.title || "")) s += 2;
  if (k === "tech_computadoras" && !HOME_SPEC_RX.test(p.title || "")) s -= 2;
  if (HOME_BRAND_RX.test(t)) s += 1;
  if (p.salePct > 0) s += 1;
  /* A few-dollar trinket never fronts the department. */
  if (p.rawPrice < 15) s -= 2;
  return s;
}
/* THE PILL ROW (Danny, #443 c.6487219343, c.6488256694, c.6488281596,
   c.6488481308, c.6488544902, c.6488547834):
     Ofertas -- the lead: heroes first (a good Walmart camera on sale opens
       it), small accessories close it, never lead it;
     Reacondicionados -- pill #2: ALL refurbished, used and open-box stock,
       and only there; the refurbished Chromebooks (under the $200 line,
       zero import tax) at the front, each card badged with its own
       condition;
     then the types, NEW units only (the separation ruling): Celulares in
     the Peru-presence order, Computadoras, Chromebooks, Consolas (the
     console itself: Switch, PlayStation, Xbox, Meta Quest -- not "gaming"),
     Videojuegos, and every other aisle the data fills. Computadoras and
     Chromebooks end on a door to Reacondicionados, never mixed stock. */
/* CONSOLE_RX and isConsole live in scripts/lib/tech-aisle.js: search
   ranks «consola» by the same rule. */
export { CONSOLE_RX, isConsole };
const CHROMEBOOK_RX = /\bchromebooks?\b/i;
export const isChromebook = (p) => CHROMEBOOK_RX.test(p.title || "") && !isAccessoryName(p.title) && !/\b(for|compatible|fits|charger|adapter|case|sleeve|mouse|keyboard)\b/i.test(p.title || "");
const HOME_TECH_ORDER = [["tech_celulares", "Celulares"], ["tech_computadoras", "Computadoras"], ["chromebooks", "Chromebooks"], ["consolas", "Consolas"],
  ["tech_gaming", "Videojuegos"], ["tech_audifonos", "Audífonos"], ["tech_camaras", "Cámaras"], ["tech_relojes", "Relojes"], ["tech_audio", "Parlantes"],
  ["tech_casa_inteligente", "Casa inteligente"], ["tech_componentes", "Componentes"], ["tech_auto", "Auto"], ["tech_accesorios", "Accesorios"]];
const REFURB_DOOR = ["tech_computadoras", "chromebooks"];
export const OFERTAS_LEAD_CAMERA_RX = /\b(digital cameras?|mirrorless|dslr|camcorders?|vlog\w* cameras?|compact cameras?|optical zoom)\b/i;
export function homeTechPills(list) {
  /* One card per title: a colour run of the same speaker is one product here. */
  const seen = new Set();
  const all = list.filter((p) => { const t = String(p.title || "").replace(/\s+-\s+[^-]+$/, "").toLowerCase(); if (!p.image || seen.has(t)) return false; seen.add(t); return true; });
  const used = (p) => Boolean(conditionOfTitle(p.title));
  const shown = all.filter((p) => !used(p));
  /* The front page shows a type's strongest products first: what the
     type IS (a handset, a console, a laptop with a spec) before what fits
     it, a brand people search for, then the deeper sale. Celulares leads
     by brand tier before strength (the Peru-presence order above). */
  const devicesFirst = (l, k) => l.map((p, i) => ({ p, i, s: homeStrength(p, k), b: 0, n: 0 }))
    /* (a phone whose name also reads like an accessory -- "OTG", "TF" -- follows the clear handsets of its tier) */
    .map((x) => (k === "tech_celulares" ? { ...x, b: phoneSellRank(x.p), n: phoneIsRefurb(x.p), c: phonePrice(x.p), a: isAccessoryName(x.p.title) ? 1 : 0 } : { ...x, c: 0, a: 0 }))
    .sort((x, y) => (x.b - y.b) || (x.a - y.a) || (x.c - y.c) || (x.n - y.n) || (y.s - x.s) || ((y.p.salePct || 0) - (x.p.salePct || 0)) || (x.i - y.i)).map((x) => x.p);
  const pills = [];
  /* OFERTAS: a good Walmart camera on sale opens it; the heroes follow;
     a small accessory (a cable, a car charger, a case) closes it. */
  const sales = shown.filter((p) => p.salePct > 0);
  if (sales.length >= HOME_PILL_MIN) {
    const small = (p) => isAccessoryName(p.title) || p.rawPrice < 25;
    const heroes = devicesFirst(sales.filter((p) => !small(p)), "");
    /* A photo camera: the Cámaras aisle, never a security, dash or web cam. */
    /* A photo camera -- digital, mirrorless, DSLR, camcorder -- at a real
       discount (30%+), the better camera first: never a body cam, a kids'
       camera, a drone or a security cam. */
    const cams = heroes.filter((p) => p.retailer === "walmart" && techAisleOf(p) === "tech_camaras" && OFERTAS_LEAD_CAMERA_RX.test(p.title) && p.salePct >= 30
      && !/\b(security|surveillance|dash|doorbell|webcam|baby|kids?|children|toy|trail|spy|hidden|nanny|cctv|ip cam|body|drones?|quadcopter|thumb|wearable)\b/i.test(p.title) && !isAccessoryName(p.title) && p.rawPrice >= 50)
      .sort((a, b) => (b.rawPrice - a.rawPrice) || (b.salePct - a.salePct));
    const lead = cams[0] ? [cams[0]] : [];
    const ordered = lead.concat(heroes.filter((p) => p !== cams[0]), devicesFirst(sales.filter(small), ""));
    pills.push({ k: "ofertas", label: "Ofertas", cards: ordered.slice(0, HOME_PILL_CARDS).map(cardOf) });
  }
  /* REACONDICIONADOS: pill #2; refurbished Chromebooks first, cheapest
     first (all under the $200 line), then the rest of the refurbished
     stock by strength. Only a known condition enters (conditionOfTitle). */
  const refurb = all.filter(used);
  if (refurb.length >= HOME_PILL_MIN) {
    /* The $200 line is the rule, not a property of the data: a dearer
       refurbished Chromebook follows with the rest. */
    const books = refurb.filter((p) => isChromebook(p) && p.rawPrice < 200).sort((a, b) => a.rawPrice - b.rawPrice);
    const rest = devicesFirst(refurb.filter((p) => !books.includes(p) && !isAccessoryName(p.title)), "");
    const tail = refurb.filter((p) => !books.includes(p) && isAccessoryName(p.title));
    pills.push({ k: "reacondicionados", label: "Reacondicionados", note: REFURB_NOTE, cards: books.concat(rest, tail).slice(0, HOME_PILL_CARDS).map(cardOf) });
  }
  for (const [k, label] of HOME_TECH_ORDER) {
    const l = k === "chromebooks" ? shown.filter(isChromebook)
      : k === "consolas" ? shown.filter(isConsole)
      : k === "tech_gaming" ? shown.filter((p) => techAisleOf(p) === k && !isConsole(p))
      : shown.filter((p) => techAisleOf(p) === k);
    if (l.length < HOME_PILL_MIN) continue;
    const ordered = k === "chromebooks" ? l.slice().sort((a, b) => ((b.salePct || 0) - (a.salePct || 0)) || (a.rawPrice - b.rawPrice))
      : k === "tech_celulares" ? promoteIphone18(devicesFirst(l, k)) : devicesFirst(l, k);
    pills.push({ k, label, cards: ordered.slice(0, HOME_PILL_CARDS).map(cardOf), ...(REFURB_DOOR.includes(k) && refurb.length ? { door: "reacondicionados" } : {}) });
  }
  return { v: 1, pills };
}

/* ---------- SECTION PILL HUBS (Build Order D, #443 c.6471948104) ----------
   A hub department opens with a pill row: «Todas», then the stores or
   brands inside it, strongest first. A pill is a LENS, not a filter
   (c.6477721206): it opens that store's or brand's own carousels at the
   top -- its ofertas first, then its aisles -- and every carousel of the
   department stays below, in its place. Each lens is one pre-built file
   (<dept>/lens-<slug>.json), so the swap is instant and light (the
   Mountain Test). A pill whose slice cannot fill a real carousel does not
   render (the Aisle Test).
     by "brand": one pill per brand (Lujo's designer houses)
     by "store": one pill per store (Electrónica)
     pills:      a fixed list, "r:<store>" or "a:<aisle>" (Casa Aria),
                 "c:<condition>" (Reacondicionados)
     all:        the first pill's word when it is not «Todas» */
export const PILL_HUBS = {
  /* Lujo is a brand room now (BRAND_ROOMS): its brand pills re-scope the room. */
  /* Moda: the type pills, then the four strongest stores. */
  women: { moda: "women", by: "store", max: 4 },
  men: { moda: "men", by: "store", max: 4 },
  kids: { moda: "kids", by: "store", max: 4 },
  home_goods: { pills: [["r:crateandbarrel", "Crate & Barrel"], ["r:pier1", "Pier 1"], ["a:libros", "Libros de mesa"]] },
  electronics: { by: "store", max: 8 },
  /* Danny's treatment pills (c.6473412574), at least 8 real products each;
     «Keratina y alisados» lit by the SleekShop drop (c.6475799491). */
  cabello: { min: 8, pills: [["t:Champú y acondicionador", "Champú y acondicionador"], ["t:Mascarillas", "Mascarillas"],
    ["t:Aceites y sérums", "Aceites y argán"], ["t:Cuero cabelludo", "Cuero cabelludo"], ["t:Sin enjuague", "Sin enjuague"],
    ["t:Reparación", "Reparación"], ["t:Keratina y alisados", "Keratina y alisados"]] },
  /* Belleza: the Cabello aisle is its first pill; its lens opens the aisle. */
  beauty: { pills: [["d:cabello", "Cabello"]], by: "store", max: 2 },
  /* Danny's condition pills (c.6526570723): «Todos», then one per
     condition, in /condition.js's order; a condition the data cannot
     fill with a real carousel does not render. */
  reacondicionados: { all: "Todos", pills: Object.entries(CONDITION_LABELS).map(([c, label]) => ["c:" + c, label]) },
};
export const LENS_MIN = 12, LENS_RAIL_MIN = 4, LENS_RAILS = 5;
/* MODA PILLS (Danny, c.6476025440): Moda Mujer, Hombre and Niños open with
   the shopper's next question -- the clothing TYPE -- then the strongest
   stores. The type is read from the product's own name and the store's
   type, in this order (a boardshort is swimwear before it is a short, a
   t-shirt is a top before it is a shirt). */
const MODA_RULES = [
  ["lenceria", /\b(bras?|bralettes?|panty|panties|thongs?|briefs?|boxers?|lingerie|lencer\w*|underwear|ropa interior|bodysuits?|shapewear)\b/],
  ["bano", /\b(bikinis?|swim\w*|trajes? de ba[ñn]o|boardshorts?|rash ?guards?|one[- ]pieces?)\b/],
  ["zapatillas", /\b(sneakers?|zapatillas|trainers?|running shoes?)\b/],
  ["zapatos", /\b(sandals?|sandalias|heels?|boots?|botas?|botines|loafers?|slippers?|oxfords?|lace ups|mules?|pumps|flats|slides?|clogs?|espadrilles|shoes?|zapatos?)\b/],
  ["carteras", /\b(bags?|totes?|carteras?|backpacks?|mochilas?|clutch(es)?|wallets?|purses?|satchels?|card holders?|pouch(es)?)\b/],
  ["joyas", /\b(earrings?|necklaces?|bracelets?|rings?|aretes|collares?|pulseras?|anillos?|pendants?|jewel\w*|joyas?)\b/],
  ["lentes", /\b(sunglasses|lentes de sol|gafas|eyewear)\b/],
  ["gorras", /\b(caps?|hats?|beanies?|gorras?|gorros?|buckets? hats?)\b/],
  ["vestidos", /\b(dress(es)?|vestidos?|gowns?|jumpsuits?|rompers?|monos?)\b/],
  ["faldas", /\b(skirts?|faldas?)\b/],
  ["chaquetas", /\b(jackets?|coats?|blazers?|parkas?|vests?|casacas?|abrigos?|puffers?|windbreakers?|chalecos?)\b/],
  ["polerones", /\b(hoodies?|zip-?ups?|sweatshirts?|crewnecks?|sweaters?|cardigans?|knit\w*|polerones?|chompas?|pullovers?)\b/],
  ["shorts", /\b(shorts?)\b/],
  ["pantalones", /\b(jeans|trousers|pants|pantalones?|sweatpants|leggings|joggers?|chinos?)\b/],
  ["tops", /\b(t-?shirts?|tees?|polos?|camisetas?|tank( tops?)?|tops?|blouses?|blusas?|camisoles?|bodies)\b/],
  ["camisas", /\b(shirts?|camisas?|button-?downs?|overshirts?)\b/],
];
export function modaType(p) {
  const t = (String((p && p.type) || "") + " | " + String((p && p.title) || "")).toLowerCase();
  for (const [k, rx] of MODA_RULES) if (rx.test(t)) return k;
  return "";
}
const MODA_LABELS = {
  women: [["vestidos", "Vestidos"], ["tops", "Blusas y tops"], ["pantalones", "Pantalones y jeans"], ["faldas", "Faldas"], ["shorts", "Shorts"],
    ["chaquetas", "Casacas y abrigos"], ["polerones", "Chompas y polerones"], ["lenceria", "Lencería"], ["bano", "Ropa de baño"],
    ["zapatos", "Zapatos"], ["zapatillas", "Zapatillas"], ["carteras", "Carteras"], ["joyas", "Joyas"], ["lentes", "Lentes de sol"]],
  men: [["tops", "Polos"], ["camisas", "Camisas"], ["pantalones", "Pantalones y jeans"], ["shorts", "Shorts"], ["polerones", "Polerones"],
    ["chaquetas", "Casacas"], ["bano", "Ropa de baño"], ["zapatillas", "Zapatillas"], ["zapatos", "Zapatos"], ["carteras", "Mochilas y bolsos"],
    ["gorras", "Gorras"], ["lentes", "Lentes de sol"], ["joyas", "Joyas"], ["lenceria", "Ropa interior"]],
  kids: [["tops", "Polos"], ["chaquetas", "Casacas y chompas"], ["polerones", "Polerones"], ["pantalones", "Pantalones"], ["shorts", "Shorts"],
    ["vestidos", "Vestidos"], ["faldas", "Faldas"], ["bano", "Ropa de baño"], ["zapatillas", "Zapatillas"], ["zapatos", "Zapatos"], ["gorras", "Gorras"]],
};
export const lensSlug = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
/* The pills of one hub: [{ k, label, items, link }], strongest first. */
export function hubPills(key, list, labels = {}, listOf = null) {
  const hub = PILL_HUBS[key];
  if (!hub) return [];
  let pills = [];
  if (hub.moda) {
    const by = new Map();
    for (const p of list) { const m = modaType(p); if (m) { if (!by.has(m)) by.set(m, []); by.get(m).push(p); } }
    pills = MODA_LABELS[hub.moda].map(([m, label]) => ({ k: "tipo-" + m, label, items: by.get(m) || [], link: "", byStore: labels }))
      .filter((p) => p.items.length >= LENS_MIN);
  }
  if (hub.pills) {
    pills = hub.pills.map(([sel, label]) => {
      const i = sel.indexOf(":"), kind = sel.slice(0, i), v = sel.slice(i + 1);
      const items = list.filter((p) => (kind === "r" ? p.retailer === v && p.a !== "libros"
        : kind === "t" ? p.type === v
        : kind === "c" ? (conditionOfTitle(p.title) || {}).condition === v
        : p.a === v));
      if (kind === "d") return { k: lensSlug(label), label, items: listOf ? listOf(v) : [], opts: sectionOpts(v), link: "departamento.html?dept=" + v };
      return { k: lensSlug(label), label, items,
        link: kind === "r" ? "tienda.html?tienda=" + v : kind === "d" ? "departamento.html?dept=" + v : "" };
    });
  }
  if (hub.by) {
    const groups = new Map();
    for (const p of list) {
      const g = hub.by === "brand" ? String(p.brand || "").trim() : p.retailer;
      if (!g) continue;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    pills = pills.concat([...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([g, items]) => ({
      k: lensSlug(g), label: hub.by === "brand" ? g : (labels[g] || g), items,
      link: hub.by === "store" ? "tienda.html?tienda=" + g : "departamento.html?dept=" + key + "&q=" + encodeURIComponent(g),
      ...(hub.moda ? { byType: MODA_LABELS[hub.moda] } : {}),
    })));
  }
  const fixed = pills.filter((p) => p.items.length >= (hub.min || LENS_MIN));
  const lead = hub.pills ? hub.pills.length : hub.moda ? fixed.filter((p) => /^tipo-/.test(p.k)).length : 0;
  return fixed.slice(0, lead + (hub.max || 99));
}
/* The hub's lenses and the head.json fields that announce them. */
export function hubLenses(key, list, labels = {}, listOf = null) {
  const lenses = hubPills(key, list, labels, listOf).map((p) => lensOf(key, p)).filter((l) => l.rails.length);
  const all = PILL_HUBS[key] && PILL_HUBS[key].all;
  return { lenses, extra: lenses.length ? { pills: lenses.map((l) => ({ k: l.k, label: l.label, n: l.count })), ...(all ? { pillAll: all } : {}) } : {} };
}
/* One lens: the pill's own carousels, ofertas first, then its aisles. */
/* A type pill's lens (Moda): its sales, then each store's own carousel of
   that type, biggest first -- never a store's English sub-type. */
/* A store pill's lens in Moda: its sales, then its clothing by Aria's own
   Spanish types (the same rule as the type pills). */
function typeSections(items, typeLabels) {
  const secs = [];
  const sales = items.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  if (sales.length) secs.push({ key: "ofertas", title: "Ofertas", items: sales });
  for (const [m, label] of typeLabels) {
    const l = items.filter((p) => modaType(p) === m);
    if (l.length) secs.push({ key: "tipo:" + m, title: label, items: l });
  }
  return secs.sort((a, b) => (a.key === "ofertas" ? -1 : b.key === "ofertas" ? 1 : b.items.length - a.items.length))
    .map((x) => ({ ...x, items: photosFirst(x.items) }));
}
function storeSections(items, labels, title) {
  const secs = [];
  const sales = items.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  if (sales.length) secs.push({ key: "ofertas", title: "Ofertas", items: sales });
  const by = new Map();
  for (const p of items) { if (!by.has(p.retailer)) by.set(p.retailer, []); by.get(p.retailer).push(p); }
  for (const [r, l] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) secs.push({ key: "tienda:" + r, title: title + " de " + (labels[r] || r), items: l });
  return secs.map((x) => ({ ...x, items: photosFirst(x.items) }));
}
export function lensOf(key, pill) {
  const secs = (pill.byStore ? storeSections(pill.items, pill.byStore, pill.label)
    : pill.byType ? typeSections(pill.items, pill.byType)
    : buildSections(pill.items, pill.opts || sectionOpts(key)))
    .filter((s) => !(/^tienda:/.test(s.key) && !pill.byStore) && s.key !== "estudio" && s.items.length >= LENS_RAIL_MIN)
    .slice(0, LENS_RAILS);
  return { v: 1, k: pill.k, label: pill.label, link: pill.link, count: pill.items.length,
    rails: secs.map((s) => ({ title: s.title, count: s.items.length, cards: s.items.slice(0, RAIL_CARDS).map(cardOf) })) };
}

/* ---------- TALLAS PLUS (#443 c.6526833313) ----------
   Ofertas, then her clothing by Moda Mujer's Spanish types, then his
   (Moda Hombre's), never a store's English type ("T Shirts", "Bralette").
   The list arrives women first, each product's wearer in g
   (build-department-slices plusGender), which the endpoint rows carry. */
export const PLUS_DEPT = "curvy";
const PLUS_NOT_CLOTHING = new Set(["zapatos", "zapatillas", "carteras", "joyas", "lentes", "gorras"]);
function buildPlusSections(list) {
  const sales = list.filter((p) => p.salePct > 0);
  const sections = sales.length ? [{ key: "ofertas", title: "Ofertas", items: sales }] : [];
  const men = list.filter((p) => p.g === "men");
  const women = list.filter((p) => !men.includes(p));
  for (const [who, l, labels] of [["mujer", women, MODA_LABELS.women], ["hombre", men, MODA_LABELS.men]]) {
    const by = new Map();
    /* Every product here is clothing (the membership rule); a word like
       "ring" or "pouch" in its name does not make it a jewellery rail. */
    for (const p of l) { let m = modaType(p) || "otros"; if (PLUS_NOT_CLOTHING.has(m)) m = "otros"; if (!by.has(m)) by.set(m, []); by.get(m).push(p); }
    for (const [m, label] of labels) if (by.has(m)) sections.push({ key: "tipo:" + who + "-" + m, title: who === "hombre" ? label + " para hombre" : label, items: by.get(m) });
    if (by.has("otros")) sections.push({ key: "tipo:" + who + "-otros", title: who === "hombre" ? "Más ropa para hombre" : "Más ropa", items: by.get("otros") });
  }
  return sections;
}

/* ---------- REACONDICIONADOS (#443, pills c.6526570723) ----------
   Ofertas, then the electronics by Electrónica's own Spanish aisles
   (the stores' English types -- "Tablet Computers", "Cell Phones" --
   never title a rail), then everything else -- the open-box toys --
   under «Juguetes y más», never an English store type. */
export const REFURB_DEPT = "reacondicionados";
function buildRefurbSections(list) {
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  const sections = sales.length ? [{ key: "ofertas", title: "Ofertas", items: sales }] : [];
  /* techAisle files anything it does not know under accessories: a toy is not electronics. */
  const tech = list.filter((p) => /^tech_/.test(String(p.type || "")) || isTechProduct(p.title, p.type));
  for (const k of TECH_AISLE_ORDER) {
    const l = tech.filter((p) => techAisleOf(p) === k);
    if (l.length) sections.push({ key: "aisle:" + k, title: TECH_AISLE_LABELS[k], items: k === "tech_computadoras" ? refurbOrder(l) : l });
  }
  const rest = list.filter((p) => !tech.includes(p));
  if (rest.length) sections.push({ key: "tipo:otros", title: "Juguetes y más", items: rest });
  return sections;
}

/* ---------- CABELLO (#443 c.6473257128, pills c.6473412574) ----------
   Ofertas, then the treatment aisles in SleekShop's order; a product's
   aisle is its type (build-department-slices writes it), so the static
   slices and the endpoint agree. */
export const CABELLO_DEPT = "cabello";
export const CABELLO_AISLES = ["Keratina y alisados", "Mascarillas", "Reparación", "Aceites y sérums", "Cuero cabelludo", "Sin enjuague", "Champú y acondicionador", "Más tratamientos"];
function buildCabelloSections(list) {
  const sections = [];
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  for (const t of CABELLO_AISLES) {
    const l = list.filter((p) => p.type === t);
    if (l.length) sections.push({ key: "tipo:" + t.toLowerCase(), title: t, items: l });
  }
  return sections;
}

/* ---------- THE HOMEPAGE AUDIENCE CAROUSELS (Danny, c.6483623203) ----------
   Three carousels stacked on the homepage -- Mujer, Hombre, Niños -- each
   with its OWN type pills above it, scoped to that audience. Fashion and
   beauty only: Electrónica has its own carousel. Each pill is a slice of
   a department the site already has, so a pill and its department agree.
     [pill key, label, department, filter]  (filter: null = the whole list,
     a moda type, or a test on the product) */
const WOMEN_RX = /\b(women'?s?|womens|woman|mujer|mujeres|ladies|lady|femme|female|for her|girls?)\b/i;
const MEN_RX = /\b(men'?s?|mens|man|hombre|hombres|homme|male|for him|boys?)\b/i;
const KIDS_RX = /\b(kids?|youth|boys?|girls?|ni[ñn]os?|ni[ñn]as?|junior|jr\.?|toddlers?|infant|baby)\b/i;
const MAKEUP_RX = /\b(lipsticks?|lip ?gloss|lip (liner|stain|oil|balm)|mascaras?|foundations?|concealers?|eye ?shadows?|blush(er)?|bronzers?|eye ?liners?|primers?|highlighters?|makeup|make-up|maquillaje|brows?|setting (spray|powder)|palettes?|cushion)\b/i;
const WATCH_RX = /\b(watch(es)?|relojes?|chronograph)\b/i;
/* Which of the three footwear pills a shoe belongs to, by its own name. */
const SANDAL_RX = /\b(sandals?|slides?|slippers?|flip-?flops?|chanclas?|pantuflas?|sandalias?|clogs?|crocs|slingbacks? sandals?)\b/i;
const ATHLETIC_RX = /\b(running|runners?|go run|trainers?|training|gym|cross-?train\w*|ultraboost|pegasus|vomero|gel-\w+|fresh foam|1080|880|metcon|hoka|brooks|cloudmonster|cloudsurfer|walking shoes?)\b/i;
const NOT_A_SHOE_RX = /\b(bags?|duffels?|totes?|backpacks?|socks?|insoles?|laces|shoe ?horns?|shoe ?trees?|cleaners?|protectors?)\b/i;
/* A cleat whose title was stripped to the model ("PUMA Jr. TACTO II")
   still says so in its photo's file name, and the soccer stores sell
   little else (Lucifer, #443 c.6512244834). */
const CLEAT_IMG_RX = /soccer-(cleats|shoes)|firm-?(multi-?|artificial-?)?ground|artificial-grass|turf-(soccer|shoes)|indoor-soccer|futsal/i;
const SOCCER_STORES = new Set(["xtremesoccer", "prosoccer"]);
export function isSportShoe(p) {
  return SPORT_SHOE_RX.test(String(p.title || "")) || CLEAT_IMG_RX.test(String(p.image || ""));
}
/* "" for what is not a shoe. Cleats and other sport shoes are
   Zapatillas (Danny's rule), behind the everyday ones: they never lead
   a pill (sportLast). A "Slide" sneaker is a shoe. */
export function footClass(p) {
  const t = String(p.title || "");
  if (NOT_A_SHOE_RX.test(t)) return "";
  if (isSportShoe(p)) return "zapatillas";
  if (SANDAL_RX.test(t) && !/\b(sneakers?|trainers?)\b/i.test(t)) return "sandalias";
  if (SOCCER_STORES.has(p.retailer) || ATHLETIC_RX.test(t)) return "zapatillas";
  return "zapatos";
}
const sportLast = (p) => !isSportShoe(p) && !SOCCER_STORES.has(p.retailer);
const farfetchLast = (p) => p.retailer === "farfetch";
const BOOT_RX = /\b(boots?|booties|bootie|botas?|botines?|chelsea)\b/i;
const SNEAKER_RX = /\b(sneakers?|running|runners?|trainers?|zapatillas?|air max|air force|ultraboost|gel-|samba|gazelle|campus|550|574|9060|990|new balance|chuck taylor|old skool|platform sneakers?)\b/i;
/* A tee or a hoodie filed with the toys is clothing, not a toy. */
const NOT_A_TOY_RX = /\b(t-?shirts?|tees?|shirts?|hoodies?|sweatshirts?|sweaters?|pants|joggers|shorts|dress(es)?|skirts?|jackets?|pajamas?|socks?)\b/i;
/* Sport-specific shoes are not the face of women's Zapatos (Danny,
   c.6497530895): cleats, court and golf shoes live in Deportes. */
const SPORT_SHOE_RX = /\b(cleats?|soccer|f[uú]tbol|chimpun\w*|guayos?|fg\/ag|firm ground|turf|indoor soccer|futsal|pickleball|tennis shoes?|court shoes?|golf|bowling|spikes?|track|baseball|softball|football|lacrosse|volleyball|wrestling|cycling|f50|predator|mercurial|phantom|tiempo|goletto|speedportal|crazyfast|monarcida|morelia|copa (pure|mundial|gloro)|future (ultimate|match|play|pro)|ultra (ultimate|match|play|pro)|(fg|tf|ag|mg)(\/(fg|tf|ag|mg))?)\b/i;
export const AUDIENCE_SHELVES = {
  /* Women's Zapatos leads with marketable sneakers and running shoes
     (Danny, c.6507161516); the rest follows in the usual mix. */
  /* FOOTWEAR, THREE PILLS PER AUDIENCE (Danny, c.6504037778 §3): Zapatos
     (everyday shoes, high-tops and Vans, boots), Zapatillas (running and
     gym) and Sandalias (sandals, slides, slippers). No soccer cleats in
     women's footwear. */
  /* ...and boots ride in it, one card in three after the sneaker lead
     (Lucifer, c.6512244834: Mujer Zapatos had no botas). */
  /* ...and Farfetch rides at the END of the three Mujer shoe pills, never
     the lead (Danny, #443 c.6547326285): the front goes to the good sales
     of the regular stores (CCS and peers); the Farfetch cards stay in the
     pill for variety, demoted, not removed. */
  mujer: [["zapatos", "Zapatos", "shoes_women", (p) => footClass(p) === "zapatos", (p) => SNEAKER_RX.test(p.title), (p) => BOOT_RX.test(p.title), farfetchLast],
    ["zapatillas", "Zapatillas", "shoes_women", (p) => footClass(p) === "zapatillas", sportLast, null, farfetchLast],
    ["sandalias", "Sandalias", "shoes_women", (p) => footClass(p) === "sandalias", null, null, farfetchLast], ["gym", "Ropa de gimnasio", "gym_rat", (p) => WOMEN_RX.test(p.title) && !MEN_RX.test(p.title.replace(/\bwomen'?s?\b/gi, ""))],
    ["perfumes", "Perfumes", "perfumes", (p) => perfumeClassOf(p) === "frasco" && (WOMEN_RX.test(p.title) || /\b(pour femme|for her)\b/i.test(p.title))], ["maquillaje", "Maquillaje", "beauty", (p) => MAKEUP_RX.test(p.title)],
    ["cabello", "Cabello", "cabello", null], ["vestidos", "Vestidos", "women", "vestidos"], ["tops", "Blusas y tops", "women", "tops"],
    ["lenceria", "Lencería", "women", "lenceria"], ["bano", "Ropa de baño", "women", "bano"], ["carteras", "Carteras", "women", "carteras"],
    ["joyas", "Joyas", "women", "joyas"], ["lentes", "Lentes de sol", "women", "lentes"]],
  hombre: [["ropa", "Ropa", "men", (p) => ["tops", "camisas", "pantalones", "shorts", "polerones", "chaquetas"].includes(modaType(p))],
    ["zapatos", "Zapatos", "shoes_men", (p) => footClass(p) === "zapatos"], ["zapatillas", "Zapatillas", "shoes_men", (p) => footClass(p) === "zapatillas", sportLast],
    ["sandalias", "Sandalias", "shoes_men", (p) => footClass(p) === "sandalias"],
    ["relojes", "Relojes", "men", (p) => WATCH_RX.test(p.title) && !/\b(bands?|straps?|bracelets?|smart ?watch|t-?shirts?|tees?|shirts?|hoodies?|hats?|caps?|bags?|cases?|boxes?)\b/i.test(p.title)],
    ["perfumes", "Perfumes", "perfumes", (p) => perfumeClassOf(p) === "frasco" && (MEN_RX.test(p.title.replace(/\bwomen'?s?\b/gi, "")) || /\b(pour homme|for him)\b/i.test(p.title))],
    ["gym", "Ropa de gimnasio", "gym_rat", (p) => MEN_RX.test(p.title.replace(/\bwomen'?s?\b/gi, ""))],
    ["bano", "Ropa de baño", "men", "bano"], ["gorras", "Gorras", "men", "gorras"], ["lentes", "Lentes de sol", "men", "lentes"],
    ["mochilas", "Mochilas y bolsos", "men", "carteras"]],
  /* Niños opens on Juguetes, always (Danny, c.6497530895). */
  ninos: [["juguetes", "Juguetes", "toys", (p) => !NOT_A_TOY_RX.test(p.title)], ["deportes", "Deportes", "sporting_goods", (p) => KIDS_RX.test(p.title)],
    ["ropa", "Ropa", "kids", (p) => ["tops", "camisas", "pantalones", "shorts", "polerones", "chaquetas", "vestidos", "faldas"].includes(modaType(p))],
    ["zapatos", "Zapatos", "shoes", (p) => KIDS_RX.test(p.title) && footClass(p) === "zapatos"],
    ["zapatillas", "Zapatillas", "shoes", (p) => KIDS_RX.test(p.title) && footClass(p) === "zapatillas", sportLast],
    ["sandalias", "Sandalias", "shoes", (p) => KIDS_RX.test(p.title) && footClass(p) === "sandalias"], ["bano", "Ropa de baño", "kids", "bano"], ["gorras", "Gorras", "kids", "gorras"]],
};
export const AUDIENCE_MIN = 8, AUDIENCE_CARDS = 24;
/* One audience's pills: { v, pills:[{k,label,dept,cards}] }, each pill's
   strongest cards first (the deeper sale, then the department's order),
   one card per title, photographed only. A pill under AUDIENCE_MIN does
   not render (the Aisle Test). */
export function audiencePills(aud, listOf) {
  const pills = [];
  for (const [k, label, dept, f, lead, mix, tail] of AUDIENCE_SHELVES[aud]) {
    const seen = new Set();
    const l = listOf(dept).filter((p) => p.image && (!f || (typeof f === "string" ? modaType(p) === f : f(p))))
      .filter((p) => { const t = p.retailer + "::" + String(p.title).toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; });
    let ranked = l.map((p, i) => ({ p, i })).sort((a, b) => ((b.p.salePct || 0) - (a.p.salePct || 0)) || (a.i - b.i)).map((x) => x.p);
    /* A mixed pill (Ropa, Zapatos) opens on a mix: at most 2 of one kind in front. */
    ranked = interleaveFront(ranked.map((p) => ({ ...p, type: modaType(p) || p.type })), AUDIENCE_CARDS, 2);
    /* A pill with a lead rule opens on it: those cards first, each group in the order above. */
    if (lead) ranked = [...ranked.filter(lead), ...ranked.filter((p) => !lead(p))];
    /* A pill with a mix rule keeps that kind on screen: after the first
       MIX_LEAD cards, one card in MIX_EVERY is of it. */
    const led = ranked;
    if (mix) ranked = mixIn(ranked, mix);
    let cards = ranked.slice(0, AUDIENCE_CARDS);
    /* A pill with a tail rule keeps the same cards but pins those to the
       end (Farfetch in the Mujer shoe pills); the others open the pill
       under its lead and mix rules, as above. */
    if (tail) {
      const kept = new Set(cards);
      let front = led.filter((p) => kept.has(p) && !tail(p));
      if (mix) front = mixIn(front, mix);
      cards = front.concat(cards.filter(tail));
    }
    if (ranked.length >= AUDIENCE_MIN) pills.push({ k, label, dept, cards: cards.map(cardOf) });
  }
  return { v: 1, pills };
}

const MIX_LEAD = 4, MIX_EVERY = 3;
function mixIn(ranked, mix) {
  const head = ranked.slice(0, MIX_LEAD), rest = ranked.slice(MIX_LEAD);
  const m = rest.filter(mix), o = rest.filter((p) => !mix(p));
  const out = head.slice();
  while (m.length || o.length) {
    if (m.length && ((out.length - MIX_LEAD) % MIX_EVERY === MIX_EVERY - 1 || !o.length)) out.push(m.shift());
    else out.push(o.shift());
  }
  return out;
}

export const FRONT = 24, FRONT_CAP = 6;

/* The first FRONT cards of a mixed rail hold at most FRONT_CAP of any one
   type, taken round-robin in rail order; the rest follow unchanged. */
export function interleaveFront(items, front = FRONT, cap = FRONT_CAP) {
  const types = new Set(items.slice(0, front * 4).map((p) => p.type || ""));
  if (types.size < 2) return items;
  const head = [], used = new Map(), rest = [];
  for (const p of items) {
    const t = p.type || "", n = used.get(t) || 0;
    if (head.length < front && n < cap) { head.push(p); used.set(t, n + 1); }
    else rest.push(p);
  }
  return head.concat(rest);
}

/* A card without a photo never leads a rail (the Sandalias lead was the
   rail's only imageless item): photographed items keep their order and
   come first. */
export function photosFirst(items) {
  const a = [], b = [];
  for (const p of items) (p.image ? a : b).push(p);
  return b.length ? a.concat(b) : items;
}

/* THE GENDER AXIS (#443 c.6412658814, c.6412683747): in Zapatos every
   class is two aisles, Mujer and Hombre, then the Niños aisles after all
   the adult ones. p.g is scripts/lib/footwear.js shoeGender; a "unisex"
   shoe (the data names no gender, or both) is on BOTH adult shelves of
   its class. The lead rail stays the mixed sale showcase. */
const AISLE_GENDERS = [["women", "Mujer"], ["men", "Hombre"]];
export function genderAisles(list) {
  const byClass = new Map(), small = [], smallSeen = new Set();
  for (const p of list) {
    const c = String(p.type || "").trim().toLowerCase();
    if (!c) { small.push(p); smallSeen.add(p); continue; }
    if (!byClass.has(c)) byClass.set(c, { c, n: 0, women: [], men: [], kids: [] });
    const a = byClass.get(c);
    a.n++;
    const g = p.g || "unisex";
    if (g === "unisex") { a.women.push(p); a.men.push(p); } else a[g].push(p);
  }
  const classes = [...byClass.values()].sort((x, y) => y.n - x.n);
  const adult = [], kids = [];
  const keep = (l, key, title, into) => {
    if (l.length >= 3) into.push({ key, title, items: l });
    else for (const p of l) if (!smallSeen.has(p)) { smallSeen.add(p); small.push(p); }
  };
  for (const a of classes) for (const [g, label] of AISLE_GENDERS) keep(a[g], `tipo:${a.c}:${g}`, `${typeLabel(a.c)} ${label}`, adult);
  for (const a of [...classes].sort((x, y) => y.kids.length - x.kids.length)) keep(a.kids, `tipo:${a.c}:kids`, `${typeLabel(a.c)} Niños`, kids);
  const out = adult.concat(kids);
  if (small.length) out.push({ key: "tipo:otros", title: "Más productos", items: small });
  return out;
}

export function buildSections(list, opts = {}) {
  const secs = buildSectionsRaw(list, opts);
  for (const s of secs) {
    s.items = photosFirst(s.items);
    if (opts.interleave && (s.key === "ofertas" || s.key === "destacados")) s.items = interleaveFront(s.items);
  }
  return secs;
}
function buildSectionsRaw(list, opts = {}) {
  if (opts.casa) return buildCasaSections(list);
  if (opts.tech) return buildTechSections(list);
  if (opts.cabello) return buildCabelloSections(list);
  /* The Perfumes room is always the room, whatever store a bottle comes from. */
  if (opts.perfume) return buildPerfumeSections(list);
  if (opts.brandRoom) return buildBrandRoomSections(list, opts.apparel);
  if (opts.plus) return buildPlusSections(list);
  if (opts.refurb) return buildRefurbSections(list);
  /* The Perfumes room is Aria Perfumes' stock; since the #443 re-route
     audit it also admits the true fragrances other stores sell, which
     join its brand rails -- the room keeps its layout. */
  if (list.length && list.filter((p) => p.retailer === PERFUME_STORE).length >= list.length * 0.9) return buildPerfumeSections(list);
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  const sections = [];
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  else if (list.length) sections.push({ key: "destacados", title: "Destacados", items: list });
  /* Reacondicionados: second in every department with 3+ such products
     (not in the department made of nothing else). */
  const refurb = list.filter((p) => conditionOfTitle(p.title));
  if (refurb.length >= 3 && refurb.length < list.length) sections.push({ key: "reacondicionados", title: "Reacondicionados", note: REFURB_NOTE, items: refurb });
  if (opts.genderAisles) return sections.concat(genderAisles(list));
  const byType = {}, order = [];
  /* One rail per Spanish title: "Dresses" and "Vestidos" are one rail. */
  for (const p of list) {
    const raw = String(p.type || "").trim().toLowerCase();
    const lab = raw ? typeLabel(raw) : "";
    const t = raw && lab !== "Más productos" ? lensSlug(lab) : "__otros__";
    if (!byType[t]) { byType[t] = []; order.push(t); byType[t].label = lab; }
    byType[t].push(p);
  }
  const groups = []; let small = [];
  order.forEach((t, idx) => {
    const l = byType[t];
    if (t !== "__otros__" && l.length >= 3) groups.push({ t, l, idx });
    else small = small.concat(l);
  });
  groups.sort((a, b) => (b.l.length - a.l.length) || (a.idx - b.idx));
  for (const g of groups) sections.push({ key: "tipo:" + g.t, title: byType[g.t].label, items: g.l });
  if (small.length) sections.push({ key: "tipo:otros", title: "Más productos", items: small });
  return sections;
}

/* A card: what the tile and the tap need, nothing else.
   t title, b brand, r store, p store price (USD, before Aria's margin
   and tax -- the page prices it with its own finalUsd), o the was-price
   on the same basis (sales only), s percent off, i photo, k condition. */
export function cardOf(p) {
  const c = { t: p.title, r: p.retailer, p: p.rawPrice };
  if (p.brand) c.b = p.brand;
  if (p.salePct > 0) { c.s = p.salePct; if (p.wasPrice > p.rawPrice) c.o = p.wasPrice; }
  if (p.image) c.i = p.image;
  /* ph: 2+ photos behind this card (scripts/lib/photo-counts.js). */
  if (p.ph > 1) c.ph = p.ph;
  /* k: the condition label (/condition.js) when the store's title says
     refurbished, used or open-box. */
  const cond = conditionOfTitle(p.title);
  if (cond && cond.label) c.k = cond.label;
  return c;
}

export function storeChips(list) {
  const n = {};
  for (const p of list) n[p.retailer] = (n[p.retailer] || 0) + 1;
  return Object.keys(n).sort().map((k) => ({ k, n: n[k] }));
}
export function labelsOf(list, allLabels) {
  const out = {};
  for (const p of list) if (allLabels[p.retailer]) out[p.retailer] = allLabels[p.retailer];
  return out;
}

/* head.json's shape -- also what the endpoint answers for a filter. */
export function headOf(key, list, sections, allLabels, extra = {}) {
  return {
    v: 1,
    dept: key,
    count: list.length,
    stores: storeChips(list),
    labels: labelsOf(list, allLabels),
    pageSize: PAGE_SIZE,
    railCards: RAIL_CARDS,
    headRails: HEAD_RAILS,
    railBatch: RAIL_BATCH,
    rails: sections.map((s, i) => {
      const r = { i, title: s.title, count: s.items.length, pages: Math.ceil(s.items.length / PAGE_SIZE) };
      /* k: the rail's group (marca:<brand>, tipo:<type>, tienda:<store>) --
         a rail too big for one grid opens as its own railed view. */
      if (s.key) r.k = s.key;
      /* d: the line under the rail title (the Reacondicionados disclosure). */
      if (s.note) r.d = s.note;
      /* door: the link to Reacondicionados under a new-only shelf. */
      if (s.door) r.door = s.door;
      if (i < HEAD_RAILS) r.cards = s.items.slice(0, RAIL_CARDS).map(cardOf);
      return r;
    }),
    ...extra,
  };
}
export function batchCount(sections) { return Math.max(0, Math.ceil((sections.length - HEAD_RAILS) / RAIL_BATCH)); }
/* Batch b: the first cards of carousels HEAD_RAILS + b*RAIL_BATCH onward. */
export function batchOf(sections, b) {
  const from = HEAD_RAILS + b * RAIL_BATCH;
  if (!(b >= 0) || from >= sections.length) return null;
  return { b, rails: sections.slice(from, from + RAIL_BATCH).map((s, k) => ({ i: from + k, cards: s.items.slice(0, RAIL_CARDS).map(cardOf) })) };
}
export function pageOf(sections, rail, page) {
  const s = sections[rail];
  if (!s || !(page >= 0)) return null;
  const cards = s.items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf);
  return { rail, title: s.title, page, pages: Math.ceil(s.items.length / PAGE_SIZE), count: s.items.length, cards };
}

/* Every product of the department once, in the order its carousels show
   them; anything no carousel holds comes last, in the list's order. */
export function allInRailOrder(sections, list) {
  const seen = new Set(), out = [];
  const add = (p) => { const k = p.retailer + "::" + p.title; if (!seen.has(k)) { seen.add(k); out.push(p); } };
  for (const s of sections) for (const p of s.items) add(p);
  for (const p of list) add(p);
  return out;
}

/* The endpoint's copy of a department: one row per card plus its type,
   and its gender where the department has a gender axis (Zapatos). */
export function fnRow(p) {
  const r = [p.title, p.brand || "", p.retailer, p.rawPrice, p.wasPrice || 0, p.salePct || 0, p.image || "", p.type || ""];
  /* Optional trailing fields, in order: g (shoe gender), a (door), ph
     (photo count), u (who it is for: women/men/kids/unisex, #443 header). */
  const extra = [p.g || "", p.a || "", p.ph || 0, p.u || ""];
  while (extra.length && !extra[extra.length - 1]) extra.pop();
  return r.concat(extra);
}
export function rowItem(r) {
  const p = { title: r[0], brand: r[1], retailer: r[2], rawPrice: r[3], wasPrice: r[4], salePct: r[5], image: r[6], type: r[7] };
  if (r[8]) p.g = r[8];
  if (r[9]) p.a = r[9];
  if (r[10]) p.ph = r[10];
  if (r[11]) p.u = r[11];
  return p;
}

/* ---------- THE ROPA INTERIOR HEADER ON EVERY DEPARTMENT (#443 c.6545712892) ----------
   Who a product is for (u) comes from its own words, then its store when
   that store sells to one adult audience (scripts/lib/offer-category.js,
   the rule Ofertas' Ropa Mujer / Hombre / Niños uses). Nothing is
   guessed: a department gets the audience switch only when the data
   says who most of it is for. */
export const AUD = [["women", "Mujer"], ["men", "Hombre"], ["kids", "Niños"]];
export const AUD_KNOWN_SHARE = 0.6, AUD_MIN = 48;
export function inAudience(p, u) {
  if (!u) return true;
  if (u === "kids") return p.u === "kids";
  return p.u === u || p.u === "unisex";
}
/* The switch: [{k,label,n}] for a department whose audience is known for
   60%+ of its products and where 2+ audiences hold AUD_MIN+ each; else null. */
export function audienceSwitch(list) {
  if (!list.length) return null;
  const known = list.filter((p) => p.u).length;
  if (known / list.length < AUD_KNOWN_SHARE) return null;
  const opts = AUD.map(([k, label]) => ({ k, label, n: list.filter((p) => inAudience(p, k)).length })).filter((o) => o.n >= AUD_MIN);
  return opts.length >= 2 ? opts : null;
}
/* The hero's chips: products, stores, on sale. */
export function deptStats(list) {
  const stores = new Set();
  let sale = 0;
  for (const p of list) { stores.add(p.retailer); if (p.salePct > 0) sale++; }
  return { n: list.length, stores: stores.size, sale };
}
/* A product's type key and label, one per Spanish title ("Dresses" and
   "Vestidos" are one); "otros" for a product whose type names nothing. */
let SPANISH_LABELS = null;
/* Every Spanish name the site gives a type: the dictionary, the shoe
   classes, the gear and garment vocabularies. */
function spanishLabels() {
  if (!SPANISH_LABELS) SPANISH_LABELS = new Set([...TYPE_ES.values(), ...SHOE_CLASS_LABELS.values(), ...GEAR_TYPES.map((x) => x[1]), ...brandTypeLabels().map((x) => x[1])]);
  return SPANISH_LABELS;
}
export function typeKeyOf(p) {
  const raw = String(p.type || "").trim().toLowerCase();
  const lab = raw ? typeLabel(raw) : "";
  /* A label is shown only when it is Spanish: a mapped name (it differs
     from the store's own words) or a store type vetted as Spanish. */
  const vetted = lab && lab !== "Más productos" && (spanishLabels().has(lab) || SPANISH_RAW_TYPES.has(raw.replace(/[_\-]+/g, " ").replace(/\s+/g, " ")));
  return vetted ? { k: lensSlug(lab), label: lab } : { k: "otros", label: "Más productos" };
}
/* Sales first (the deeper first), then photographed, then the list's order. */
function axisOrder(items) {
  return photosFirst(items.map((p, i) => ({ p, i })).sort((a, b) => ((b.p.salePct || 0) - (a.p.salePct || 0)) || (a.i - b.i)).map((x) => x.p));
}
export const AXIS_RAILS = 12, AXIS_MIN = 3;
/* Por tipo / Por marca / Por tienda: one rail per type, brand or store
   with AXIS_MIN+ products, biggest first, at most AXIS_RAILS rails. Each
   rail's f is the Explorar todo filter that opens all of it. */
export function axisRails(list, axis, labels = {}) {
  const groups = new Map();
  for (const p of list) {
    let k, title;
    if (axis === "tipo") { const t = typeKeyOf(p); if (t.k === "otros") continue; k = t.k; title = t.label; }
    else if (axis === "marca") { k = brandKey(p); title = String(p.brand || "").trim(); if (!k) continue; }
    else if (axis === "tienda") { k = p.retailer; title = labels[p.retailer] || p.retailer; }
    else return [];
    if (!groups.has(k)) groups.set(k, { k, title, items: [] });
    groups.get(k).items.push(p);
  }
  const f = axis === "tipo" ? "t" : axis === "marca" ? "b" : "r";
  return [...groups.values()].filter((g) => g.items.length >= AXIS_MIN)
    .sort((a, b) => (b.items.length - a.items.length) || (a.title < b.title ? -1 : 1))
    .slice(0, AXIS_RAILS)
    .map((g) => ({ k: g.k, f, title: g.title, count: g.items.length, cards: axisOrder(g.items).slice(0, RAIL_CARDS).map(cardOf) }));
}
/* Explorar todo: one page of the department under every filter at once,
   and each filter's options under all the OTHER filters (cross-
   dependent: a brand narrows the types and stores to its own). */
export const EXPLORE_SORTS = ["deal", "low", "high"];
export function exploreMatch(p, { u = "", t = "", b = "", r = "", q = "" } = {}, skip = "") {
  if (u && !inAudience(p, u)) return false;
  if (skip !== "t" && t && typeKeyOf(p).k !== t) return false;
  if (skip !== "b" && b && brandKey(p) !== b) return false;
  if (skip !== "r" && r && p.retailer !== r) return false;
  if (q) {
    const hay = (p.title + " " + (p.brand || "")).toLowerCase();
    for (const w of q.toLowerCase().split(/\s+/).filter(Boolean)) if (hay.indexOf(w) === -1) return false;
  }
  return true;
}
export function explore(list, f, sort = "deal", page = 0, labels = {}) {
  const facet = (skip, keyOf) => {
    const n = new Map();
    for (const p of list) {
      if (!exploreMatch(p, f, skip)) continue;
      const [k, label] = keyOf(p);
      if (!k) continue;
      const o = n.get(k) || { k, label, n: 0 };
      o.n++; n.set(k, o);
    }
    return [...n.values()].sort((a, b) => (b.n - a.n) || (a.label < b.label ? -1 : 1)).map((o) => [o.k, o.label, o.n]);
  };
  const facets = {
    t: facet("t", (p) => { const t = typeKeyOf(p); return [t.k, t.label]; }),
    b: facet("b", (p) => [brandKey(p), String(p.brand || "").trim()]),
    r: facet("r", (p) => [p.retailer, labels[p.retailer] || p.retailer]),
  };
  let hits = list.filter((p) => exploreMatch(p, f));
  if (sort === "low") hits = hits.map((p, i) => ({ p, i })).sort((a, b) => (a.p.rawPrice - b.p.rawPrice) || (a.i - b.i)).map((x) => x.p);
  else if (sort === "high") hits = hits.map((p, i) => ({ p, i })).sort((a, b) => (b.p.rawPrice - a.p.rawPrice) || (a.i - b.i)).map((x) => x.p);
  else hits = axisOrder(hits);
  const pages = Math.ceil(hits.length / PAGE_SIZE);
  return { count: hits.length, page, pages, cards: hits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(cardOf), facets, stats: deptStats(hits) };
}

/* The page's filters, unchanged: one store, and every word of the
   department search box in the title or brand. */
export function filterList(list, { r = "", q = "", b = "", a = "", t = "", u = "" } = {}) {
  const words = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  /* b: one brand (a brand pill), a: one door (Perfumes' Mujer / Hombre ...). */
  const bk = String(b || "").trim().toLowerCase();
  return list.filter((p) => {
    if (r && r !== "all" && p.retailer !== r) return false;
    if (bk && String(p.brand || "").trim().toLowerCase() !== bk) return false;
    if (a && p.a !== a) return false;
    /* u: one audience (the header's switch). */
    if (u && !inAudience(p, u)) return false;
    /* t: the rail's type key -- the feed's own type, or the gear/garment kind a brand room rails by. */
    if (t && String(p.type || "").trim().toLowerCase() !== t && (gearType(p) || modaType(p)) !== t && lensSlug(typeLabel(String(p.type || "").trim().toLowerCase())) !== t) return false;
    if (words.length) {
      const hay = (p.title + " " + (p.brand || "")).toLowerCase();
      for (const w of words) if (hay.indexOf(w) === -1) return false;
    }
    return true;
  });
}

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);
const deptCache = new Map();
/* A department's full list, in page order, or null for an unknown key. */
export function loadDept(key, roots = CANDIDATES) {
  if (!DEPT_KEY_RX.test(String(key || ""))) return null;
  if (deptCache.has(key)) return deptCache.get(key);
  for (const dir of roots) {
    const p = join(dir, FN_DIR, key + ".json");
    try {
      if (!existsSync(p)) continue;
      const f = JSON.parse(readFileSync(p, "utf8"));
      const d = { key, labels: f.labels || {}, list: (f.rows || []).map(rowItem) };
      deptCache.set(key, d);
      return d;
    } catch { /* try the next */ }
  }
  return null;
}

/* One answer: a head (no rail/batch), a carousel batch, or a page of a
   carousel -- each optionally filtered by store (r) and words (q). */
export function answer(qs, roots) {
  const d = loadDept(String(qs.dept || ""), roots);
  if (!d) return { status: 404, body: { error: "Departamento no encontrado." } };
  const r = String(qs.r || "").slice(0, 40), q = String(qs.q || "").slice(0, 80);
  const b = String(qs.b || "").slice(0, 80), a = String(qs.a || "").slice(0, 40), t = String(qs.t || "").trim().toLowerCase().slice(0, 80);
  const u = AUD.some(([k]) => k === qs.u) ? qs.u : "";
  /* Explorar todo and the Por tipo / marca / tienda axes (#443 header). */
  if (qs.explore !== undefined && qs.explore !== "") {
    const f = { u, t, b: b.trim().toLowerCase(), r: r && r !== "all" ? r : "", q: q.trim() };
    const sort = EXPLORE_SORTS.includes(qs.sort) ? qs.sort : "deal";
    return { status: 200, body: { dept: d.key, ...f, sort, ...explore(d.list, f, sort, Math.max(0, Number(qs.page) || 0), d.labels) } };
  }
  if (qs.axis !== undefined && qs.axis !== "") {
    if (!["tipo", "marca", "tienda"].includes(qs.axis)) return { status: 404, body: { error: "Sin ese eje." } };
    const base = u ? d.list.filter((p) => inAudience(p, u)) : d.list;
    return { status: 200, body: { dept: d.key, axis: qs.axis, u, rails: axisRails(base, qs.axis, d.labels) } };
  }
  const list = (r && r !== "all") || q.trim() || b || a || t || u ? filterList(d.list, { r, q, b, a, t, u }) : d.list;
  /* One type opened from its rail (the recursive «Ver todo»): the next
     grouping is the brand -- or the store, where brands are thin. */
  let sections = t && !b ? typeViewSections(list) : buildSections(list, sectionOpts(d.key));
  /* One audience's view keeps only its own gender aisles (Zapatos: a
     unisex shoe sits in both, so "Zapatillas Hombre" would follow Mujer). */
  if (u) sections = sections.filter((s) => { const m = /^tipo:[^:]+:(women|men|kids)$/.exec(s.key || ""); return !m || m[1] === u; });
  if (qs.rail !== undefined && qs.rail !== "") {
    /* rail=all: the whole department, page by page, in its carousels'
       order (the lead rail first, each product once) -- the Perfumes
       end-of-carousel card opens it (#443 c.6405624575). */
    const out = qs.rail === "all"
      ? pageOf([{ title: "Todo", items: allInRailOrder(sections, list) }], 0, Number(qs.page) || 0)
      : pageOf(sections, Number(qs.rail), Number(qs.page) || 0);
    return out ? { status: 200, body: out } : { status: 404, body: { error: "Sin más productos." } };
  }
  if (qs.batch !== undefined && qs.batch !== "") {
    const out = batchOf(sections, Number(qs.batch));
    return out ? { status: 200, body: out } : { status: 404, body: { error: "Sin más carruseles." } };
  }
  /* Perfumes: a door's view keeps its brand pills (the brands inside that door). */
  const extra = d.key === "perfumes" ? { ...perfumePills(list), b, a } : BRAND_ROOMS.has(d.key) || t ? { ...brandRoomPills(list), b } : {};
  return { status: 200, body: headOf(d.key, list, sections, d.labels, { r: r || "all", q, ...extra, ...(t ? { t } : {}), ...(u ? { u } : {}), stats: deptStats(list) }) };
}
