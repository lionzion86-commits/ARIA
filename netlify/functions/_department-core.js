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
import { conditionOfTitle } from "../../scripts/lib/condition.js";
import { techAisle, isAccessoryName, TECH_AISLE_LABELS, TECH_AISLE_ORDER, CONSOLE_RX, isConsole } from "../../scripts/lib/tech-aisle.js";

export const PAGE_SIZE = 48;     // cards per "Ver todo" / "Mostrar más" slice
export const RAIL_CARDS = 12;    // cards drawn in one carousel
export const HEAD_RAILS = 3;     // carousels whose cards ride in head.json
export const RAIL_BATCH = 6;     // carousels per rails-<b>.json after those
export const FN_DIR = "assets/sections/departamento/_fn";
export const DEPT_KEY_RX = /^[a-z_]{2,40}$/;

/* Aria's own footwear classes (scripts/lib/footwear.js SHOE_CLASSES) are
   titles already: "Botas y botines", not "Botas Y Botines". */
const SHOE_CLASS_LABELS = new Map(["Zapatillas", "Sandalias", "Botas y botines", "Tacones", "Chimpunes", "Mocasines y pantuflas", "Zapatos"].map((l) => [l.toLowerCase(), l]));
/* A rail's title speaks Spanish (Danny's standing rule: English is never
   shown as Spanish copy). The stores' own type names, as they come in
   ("T Shirts", "Rash Guard", "Hair Care", "For Him"), and Aria's word. */
export const TYPE_ES = new Map([
  ["t shirts", "Polos"],
  ["t shirt", "Polos"],
  ["tees", "Polos"],
  ["sweatshirts", "Polerones"],
  ["sweatshirt", "Polerones"],
  ["sweat shirts", "Polerones"],
  ["hoodie/sweatshirt", "Polerones"],
  ["jackets", "Casacas"],
  ["jacket", "Casacas"],
  ["leather jackets", "Casacas de cuero"],
  ["denim jackets", "Casacas de jean"],
  ["jackets & vests", "Casacas y chalecos"],
  ["down jackets", "Casacas de plumas"],
  ["low top sneakers", "Zapatillas bajas"],
  ["high top sneakers", "Zapatillas altas"],
  ["sneakers", "Zapatillas"],
  ["shoes", "Zapatos"],
  ["tops", "Tops"],
  ["top", "Tops"],
  ["tank tops", "Bividís"],
  ["tank top", "Bividís"],
  ["tank tops & camisoles", "Bividís y camisoles"],
  ["mens tops", "Tops de hombre"],
  ["kids tops", "Tops de niños"],
  ["tote bags", "Bolsos tote"],
  ["leather pants", "Pantalones de cuero"],
  ["pants", "Pantalones"],
  ["cargo pants", "Pantalones cargo"],
  ["lounge pants", "Pantalones de casa"],
  ["sweat pants", "Pantalones de buzo"],
  ["jogging pants", "Joggers"],
  ["sunglasses", "Lentes de sol"],
  ["bracelets", "Pulseras"],
  ["necklaces", "Collares"],
  ["necklace", "Collares"],
  ["earrings", "Aretes"],
  ["rings", "Anillos"],
  ["jewelry", "Joyería"],
  ["belts & suspenders", "Correas y tirantes"],
  ["belt", "Correas"],
  ["belts", "Correas"],
  ["wallets", "Billeteras"],
  ["wallet", "Billeteras"],
  ["gloves", "Guantes"],
  ["caps", "Gorras"],
  ["bottoms", "Partes de abajo"],
  ["bottom", "Partes de abajo"],
  ["mens bottoms", "Pantalones de hombre"],
  ["dresses", "Vestidos"],
  ["dress", "Vestidos"],
  ["mid length dresses", "Vestidos midi"],
  ["short dresses", "Vestidos cortos"],
  ["long dresses", "Vestidos largos"],
  ["for her", "Para ella"],
  ["for him", "Para él"],
  ["gear", "Equipo"],
  ["accessories", "Accesorios"],
  ["accessory", "Accesorios"],
  ["women", "Mujer"],
  ["men", "Hombre"],
  ["headbands & hair accessories", "Vinchas y accesorios para el cabello"],
  ["hair accessories", "Accesorios para el cabello"],
  ["bag accessories", "Accesorios para bolsos"],
  ["shirts", "Camisas"],
  ["shirt", "Camisas"],
  ["slippers & loafers", "Pantuflas y mocasines"],
  ["duffle & top handle bags", "Bolsos de viaje y de mano"],
  ["duffle bags", "Bolsos de viaje"],
  ["top handle", "Bolsos de mano"],
  ["socks", "Medias"],
  ["mens socks", "Medias de hombre"],
  ["backpacks", "Mochilas"],
  ["hair care", "Cuidado del cabello"],
  ["decks (tablas de skate)", "Tablas de skate"],
  ["trucks, ruedas y partes", "Ejes, ruedas y partes"],
  ["wetsuits", "Trajes de neopreno"],
  ["shapewear bottom", "Fajas: parte inferior"],
  ["shapewear bottoms", "Fajas: parte inferior"],
  ["shapewear top", "Fajas: parte superior"],
  ["swim bottoms", "Calzones de baño"],
  ["swim tops", "Tops de baño"],
  ["swim one pieces", "Ropa de baño enteriza"],
  ["swim", "Ropa de baño"],
  ["sets", "Conjuntos"],
  ["set", "Conjuntos"],
  ["napkin rings", "Servilleteros"],
  ["napkin rings & place card holders", "Servilleteros y marcasitios"],
  ["beauty", "Belleza"],
  ["makeup", "Maquillaje"],
  ["costume accessories", "Accesorios de disfraz"],
  ["mma gloves", "Guantes de MMA"],
  ["shoulder bags", "Carteras de hombro"],
  ["shoulder bag", "Carteras de hombro"],
  ["messenger bags & satchels", "Bolsos mensajeros"],
  ["bag", "Bolsos"],
  ["heels", "Tacones"],
  ["heeled sandals", "Sandalias de taco"],
  ["ankle boots", "Botines"],
  ["ballerina flats", "Balerinas"],
  ["tall boots", "Botas altas"],
  ["zip up & buckled boots", "Botas con cierre y hebilla"],
  ["lace up boots", "Botas de pasador"],
  ["sandals", "Sandalias"],
  ["flat sandals", "Sandalias planas"],
  ["chelsea boots", "Botas Chelsea"],
  ["mid calf boots", "Botas a media pierna"],
  ["structured hats", "Sombreros"],
  ["beach hats", "Sombreros de playa"],
  ["boat shoes & moccasins", "Náuticos y mocasines"],
  ["biker & combat boots", "Botas biker y militares"],
  ["desert boots", "Botas desert"],
  ["home", "Hogar"],
  ["games", "Juegos"],
  ["video games", "Videojuegos"],
  ["belt bag", "Riñoneras"],
  ["gear bag", "Bolsos de equipo"],
  ["bag charms", "Charms para bolsos"],
  ["bags kids accessories charms", "Charms y accesorios"],
  ["bags kids lunch boxes", "Loncheras"],
  ["smart watches", "Relojes inteligentes"],
  ["christmas decor", "Decoración navideña"],
  ["wall decor", "Decoración de pared"],
  ["led decor", "Decoración LED"],
  ["soaps, lotion & scents", "Jabones, cremas y aromas"],
  ["decor", "Decoración"],
  ["tree accessories", "Adornos para el árbol"],
  ["favor bags & containers", "Bolsitas de sorpresa"],
  ["rash guard", "Rash guards"],
  ["boxing gloves", "Guantes de box"],
  ["mma shorts", "Shorts de MMA"],
  ["compression t shirts", "Polos de compresión"],
  ["compression pants", "Pantalones de compresión"],
  ["compression shorts", "Shorts de compresión"],
  ["dry tech t shirts", "Polos dry-fit"],
  ["sports bra", "Tops deportivos"],
  ["sports bras", "Tops deportivos"],
  ["muay thai shorts", "Shorts de muay thai"],
  ["training shorts", "Shorts de entrenamiento"],
  ["boxing shorts", "Shorts de box"],
  ["cotton shorts", "Shorts de algodón"],
  ["protective gear", "Protecciones"],
  ["shin pads", "Canilleras"],
  ["kick pads", "Paos"],
  ["silla de comer", "Sillas de comer"],
  ["alimentacion", "Alimentación"],
  ["anklets", "Tobilleras"],
  ["apparel", "Ropa"],
  ["autoasiento", "Autoasientos"],
  ["accesorio", "Accesorios"],
  ["art prints", "Láminas de arte"],
  ["beanies", "Gorros"],
  ["bikinis", "Bikinis"],
  ["blazers", "Blazers"],
  ["blouses", "Blusas"],
  ["bodysuits", "Bodies"],
  ["bodysuit", "Bodies"],
  ["bombers", "Casacas bomber"],
  ["boxers", "Bóxers"],
  ["bralettes", "Bralettes"],
  ["bralette", "Bralettes"],
  ["bralette pack", "Packs de bralettes"],
  ["bras", "Brasieres"],
  ["bra", "Brasieres"],
  ["briefcases", "Maletines"],
  ["briefs", "Calzoncillos"],
  ["brooch", "Broches"],
  ["brooches", "Broches"],
  ["backdrops & scene setters", "Fondos y decorados"],
  ["balloons", "Globos"],
  ["banners & signs", "Banderines y letreros"],
  ["baskets", "Canastas"],
  ["baskets & storage bins", "Canastas y organizadores"],
  ["bikehelmets", "Cascos de bicicleta"],
  ["billetera", "Billeteras"],
  ["bolso", "Bolsos"],
  ["boardshorts", "Shorts de baño"],
  ["bodyboards", "Bodyboards"],
  ["boxingmmakickboxinggloves", "Guantes de box, MMA y kickboxing"],
  ["boysswimsuits", "Ropa de baño de niño"],
  ["card holders", "Tarjeteros"],
  ["cardigan", "Cárdigans"],
  ["cardigans", "Cárdigans"],
  ["charm hugger", "Charms"],
  ["charms", "Charms"],
  ["clutch", "Clutches"],
  ["clutches", "Clutches"],
  ["coats", "Abrigos"],
  ["coche", "Coches de bebé"],
  ["coffee table book", "Libros de mesa"],
  ["coin pouches", "Monederos"],
  ["crewneck", "Chompas cuello redondo"],
  ["crewnecks", "Chompas cuello redondo"],
  ["crossbody", "Carteras cruzadas"],
  ["camiseta", "Polos"],
  ["camisetas", "Polos"],
  ["camisa", "Camisas"],
  ["candle holders", "Portavelas"],
  ["candlesticks", "Candelabros"],
  ["canvas wall art", "Cuadros en lienzo"],
  ["cell phones", "Celulares"],
  ["christmas ornaments", "Adornos navideños"],
  ["coffee mugs & tea cups", "Tazas"],
  ["computer keyboards", "Teclados"],
  ["computer monitors", "Monitores"],
  ["confetti & streamers", "Confeti y serpentinas"],
  ["corsets & bodysuits", "Corsés y bodies"],
  ["cruisers", "Cruisers"],
  ["cuidado corporal", "Cuidado corporal"],
  ["dinnerware", "Vajilla"],
  ["down", "Casacas de plumas"],
  ["decorating kits", "Kits de decoración"],
  ["decorations", "Decoración"],
  ["decorative objects", "Objetos decorativos"],
  ["decorative sculptures & figurines", "Esculturas y figuras decorativas"],
  ["decorative storage", "Organizadores decorativos"],
  ["denim", "Jean"],
  ["door mats", "Tapetes de entrada"],
  ["drinkware", "Vasos y copas"],
  ["dron", "Drones"],
  ["ears headbands", "Vinchas con orejas"],
  ["eyewear", "Lentes"],
  ["exercisemats", "Colchonetas"],
  ["fragrance", "Fragancias"],
  ["fur & shearling", "Piel y shearling"],
  ["favors", "Sorpresas"],
  ["figura coleccionable", "Figuras coleccionables"],
  ["floral & botanical arrangements", "Arreglos florales"],
  ["floral arrangements", "Arreglos florales"],
  ["floral stems & branches", "Tallos y ramas"],
  ["fragancia", "Fragancias"],
  ["fragrance bundles", "Sets de fragancias"],
  ["fragrance oil", "Aceites aromáticos"],
  ["framed wall art", "Cuadros enmarcados"],
  ["frames", "Marcos"],
  ["glasses", "Lentes"],
  ["gown", "Vestidos de gala"],
  ["gaming", "Gaming"],
  ["garlands", "Guirnaldas"],
  ["gorra", "Gorras"],
  ["habitacion bebe", "Habitación del bebé"],
  ["handbags", "Carteras"],
  ["headband", "Vinchas"],
  ["henleys", "Polos henley"],
  ["hoodies & zipups", "Polerones y casacas con cierre"],
  ["handwraps", "Vendas"],
  ["headphones", "Audífonos"],
  ["headsets", "Audífonos con micrófono"],
  ["hurricanes", "Faroles de vidrio"],
  ["intimates", "Ropa interior"],
  ["instant cameras", "Cámaras instantáneas"],
  ["jeans", "Jeans"],
  ["jersey", "Camisetas"],
  ["jumpsuits", "Enterizos"],
  ["jar & filled candles", "Velas en frasco"],
  ["keychain", "Llaveros"],
  ["keychains", "Llaveros"],
  ["knits", "Tejidos"],
  ["keepsakes & gifts", "Recuerdos y regalos"],
  ["lace ups & oxfords", "Zapatos de pasador y oxford"],
  ["lactancia", "Lactancia"],
  ["led pillar candles", "Velas LED"],
  ["long skirts", "Faldas largas"],
  ["lunch boxes totes", "Loncheras"],
  ["lanterns", "Faroles"],
  ["laptop computers", "Laptops"],
  ["laptops/notebooks", "Laptops"],
  ["longboards", "Longboards"],
  ["lumbar pillows", "Cojines lumbares"],
  ["maternidad", "Maternidad"],
  ["mens underwear", "Ropa interior de hombre"],
  ["mid length skirts", "Faldas midi"],
  ["monkstraps", "Zapatos monkstrap"],
  ["manta", "Mantas"],
  ["menswimsuits", "Ropa de baño de hombre"],
  ["mensswimsuits", "Ropa de baño de hombre"],
  ["mirrors", "Espejos"],
  ["monochrome candles", "Velas"],
  ["motherboards", "Placas madre"],
  ["mugs & tea cups", "Tazas"],
  ["music", "Música"],
  ["neck ties", "Corbatas"],
  ["napkins", "Servilletas"],
  ["network routers", "Routers"],
  ["neutral ornaments", "Adornos neutros"],
  ["one piece", "Ropa de baño enteriza"],
  ["outerwear", "Abrigos"],
  ["overcoat", "Abrigos"],
  ["panales", "Pañales"],
  ["panties", "Calzones"],
  ["panty packs", "Packs de calzones"],
  ["panty", "Calzones"],
  ["panty pack", "Packs de calzones"],
  ["passport holders", "Porta pasaportes"],
  ["peacoats", "Abrigos"],
  ["pins", "Pines"],
  ["portabebe", "Portabebés"],
  ["pouches", "Neceseres"],
  ["pouches & document holders", "Neceseres y portadocumentos"],
  ["pyjamas & lounge wear", "Pijamas y ropa de casa"],
  ["pyjamas & loungewear", "Pijamas y ropa de casa"],
  ["picture frames", "Portarretratos"],
  ["pillar candles", "Velas pilar"],
  ["pillar stands", "Bases para velas"],
  ["placemats", "Individuales"],
  ["planters & pots", "Maceteros"],
  ["plates", "Platos"],
  ["potted plants", "Plantas en maceta"],
  ["robes", "Batas"],
  ["rompers", "Enterizos cortos"],
  ["reed diffuser refill oil", "Repuestos para difusores"],
  ["reed diffusers", "Difusores"],
  ["room sprays", "Aromatizantes"],
  ["scarves", "Chalinas"],
  ["shapewear bodysuits", "Fajas body"],
  ["shapewear slips", "Fondos moldeadores"],
  ["short skirts", "Faldas cortas"],
  ["shoulder", "Carteras de hombro"],
  ["silicone tableware", "Vajilla de silicona"],
  ["silks & cashmeres", "Seda y cachemira"],
  ["skirt", "Faldas"],
  ["skirts", "Faldas"],
  ["sleepwear", "Pijamas"],
  ["sportswear", "Ropa deportiva"],
  ["storage container", "Contenedores"],
  ["suits", "Ternos"],
  ["sweater", "Chompas"],
  ["sweaters knits", "Chompas"],
  ["sweatpants", "Pantalones de buzo"],
  ["swimsuits", "Ropa de baño"],
  ["scented candles & diffusers", "Velas y difusores"],
  ["shapewear bodysuit", "Fajas body"],
  ["skateboards completos", "Skateboards completos"],
  ["skateboardslongboards", "Skateboards y longboards"],
  ["skimboards", "Skimboards"],
  ["snorkelinggearequipment", "Equipo de snorkel"],
  ["specialty ornaments", "Adornos especiales"],
  ["square pillows", "Cojines"],
  ["stems & sprays", "Tallos y ramilletes"],
  ["tank", "Bividís"],
  ["thongs", "Tangas"],
  ["tote", "Bolsos tote"],
  ["totes", "Bolsos tote"],
  ["trench coats", "Gabardinas"],
  ["trousers", "Pantalones"],
  ["turtlenecks", "Chompas cuello alto"],
  ["table runners", "Caminos de mesa"],
  ["tablecloths", "Manteles"],
  ["tablecovers", "Manteles"],
  ["tablet computers", "Tablets"],
  ["tabletop decorations", "Decoración de mesa"],
  ["taper & pillar candles", "Velas"],
  ["throws", "Mantas"],
  ["underwear", "Ropa interior"],
  ["v necks", "Chompas cuello V"],
  ["vests", "Chalecos"],
  ["vases", "Floreros"],
  ["votive & tealight holders", "Portavelas"],
  ["wall mirrors", "Espejos de pared"],
  ["wastebaskets", "Tachos"],
  ["wine glasses", "Copas de vino"],
  ["womensswimsuits", "Ropa de baño de mujer"],
  ["workoutgloveswraps", "Guantes y vendas de entrenamiento"],
  ["wreaths", "Coronas"],
  ["wreaths & garland", "Coronas y guirnaldas"],
  ["yard decorations & signs", "Decoración de jardín"],
  ["peluche", "Peluches"],
  ["joggers", "Joggers"],
  ["shorts", "Shorts"],
  ["tshirt", "Polos"],
  ["hoodie", "Polerones"],
  ["hoodies", "Polerones"],
  ["leggings", "Leggings"],
  ["bjj kimonos", "Gis de jiu-jitsu"],
  ["mma training", "Entrenamiento de MMA"],
  ["shin guards", "Canilleras"],
  ["footwear", "Calzado"],
  ["focus mitts", "Manoplas"],
  ["spats", "Spats"],
  ["boxing training", "Entrenamiento de box"],
  ["fitness training", "Fitness"],
  ["rashguards", "Rash guards"],
  ["rash guards", "Rash guards"],
  ["kimonos", "Gis de jiu-jitsu"],
  ["gi", "Gis de jiu-jitsu"],
  ["headgear", "Cabezales"],
  ["mouthguards", "Protectores bucales"],
  ["hand wraps", "Vendas"],
  ["board short", "Shorts de baño"],
  ["knee pads", "Rodilleras"],
  ["bjj gi", "Gis de jiu-jitsu"]
]);
const FIGHT_GEAR_RX = /\b(gloves?|guantes?|gis?|kimonos?|shin ?(guards?|pads?)|canilleras?|head ?gear|headguards?|mouth ?guards?|hand ?wraps?|wraps?|focus mitts?|mitts?|kick ?pads?|thai pads?|pads?|punching bags?|heavy bags?|groin|protectors?|rash ?guards?|spats)\b/i;
const FIGHT_GEAR_AISLE_RX = /\b(guantes|gis|canilleras|paos|protecciones|rodilleras|manoplas|vendas|cabezales|protectores|rash guards|spats|equipo|entrenamiento de (mma|box))\b/i;
const SCENT_RX = /\b(mists?|body sprays?|fragrances?|eau de|perfumes?|parfums?|colognes?|body splash|brumas?)\b/i;
/* A store's internal code or placeholder ("2T68", "JH306A03", "SAMPLE",
   "WHOLESALE", "GENERAL") is not a type a shopper reads: its products
   ride in «Más productos». */
const NOT_A_TYPE_RX = /^(?=.*\d)[a-z0-9]+$|^(sample|retail|wholesale|general|bundle|4711)$/i;
export function typeLabel(t) {
  if (SHOE_CLASS_LABELS.has(String(t).toLowerCase())) return SHOE_CLASS_LABELS.get(String(t).toLowerCase());
  const es = TYPE_ES.get(String(t).toLowerCase().replace(/[\s_\-]+/g, " ").trim());
  if (es) return es;
  return String(t).split(/[\s_\-]+/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

/* The page's carousels, from a (possibly filtered) list in page order:
   Ofertas (biggest discount first) or, with no sales, Destacados; then
   one per product type with 3+ items, biggest first; then the rest. */
/* REACONDICIONADOS (#443): the rule is /condition.js, shared with the
   product page and the order line. Re-exported for the builder. */
export { conditionOfTitle };

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
const PERFUME_RAILS = { testers: "Testers", minis: "Minis y de viaje", sets: "Sets de regalo", cuidado: "Cuerpo y cuidado" };
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
export function isDesignerHouse(p) { return PERFUME_DESIGNER_HOUSES.has(String((p && p.brand) || "").trim().toLowerCase()); }
const perfumeName = (p) => String((p && p.title) || "").split(" — ")[0].toLowerCase();
export function buildPerfumeSections(list) {
  const sections = [];
  const sales = list.filter((p) => p.salePct > 0 && perfumeClassOf(p) === "frasco").map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  /* LAS GRANDES CASAS: each classic once (its cheapest boxed bottle),
     with a designer-house sale between them -- sale-led picks
     interleaved, not all of them. */
  const classics = [];
  PERFUME_CLASSICS.forEach(([brand, name, side], rank) => {
    for (const p of list) {
      if (perfumeClassOf(p) !== "frasco" || String(p.brand || "") !== brand) continue;
      /* The bottle people picture: no refill, no unboxed variant. */
      if (/\((?:[^)]*\b)?(?:Repuesto|Sin caja)\b/.test(String(p.title || ""))) continue;
      if (side && !String(p.title || "").endsWith(" " + side)) continue;
      if (String(p.title || "").indexOf(name + " — ") === 0) classics.push({ p, rank });
    }
  });
  classics.sort((a, b) => (a.rank - b.rank) || (a.p.rawPrice - b.p.rawPrice));
  const heroes = [], seenRank = new Set();
  for (const c of classics) if (!seenRank.has(c.rank)) { seenRank.add(c.rank); heroes.push(c.p); }
  const seenName = new Set(heroes.map(perfumeName));
  const houseSales = sales.filter((p) => isDesignerHouse(p) && !seenName.has(perfumeName(p)) && (seenName.add(perfumeName(p)), true)).slice(0, heroes.length);
  const lead = [];
  heroes.forEach((h, i) => { lead.push(h); if (houseSales[i]) lead.push(houseSales[i]); });
  if (lead.length) sections.push({ key: "grandes-casas", title: "Las grandes casas", items: lead });
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  for (const k of ["testers", "minis", "sets"]) {
    const l = list.filter((p) => perfumeClassOf(p) === k);
    if (l.length) sections.push({ key: "clase:" + k, title: PERFUME_RAILS[k], items: l });
  }
  const byBrand = {}, order = [];
  for (const p of list) {
    if (perfumeClassOf(p) !== "frasco") continue;
    const b = String(p.brand || "").trim() || "__otros__";
    if (!byBrand[b]) { byBrand[b] = []; order.push(b); }
    byBrand[b].push(p);
  }
  const groups = []; let small = [];
  order.forEach((b, idx) => { const l = byBrand[b]; if (b !== "__otros__" && l.length >= 3) groups.push({ b, l, idx }); else small = small.concat(l); });
  /* The designer houses first, then the rest; inside each, by how much
     of the house we carry. */
  const classicRank = (g) => { const i = PERFUME_CLASSICS.findIndex((c) => c[0] === g.b); return i === -1 ? PERFUME_CLASSICS.length : i; };
  const known = (g) => (PERFUME_DESIGNER_HOUSES.has(g.b.toLowerCase()) ? 0 : 1);
  groups.sort((a, b) => (classicRank(a) - classicRank(b)) || (known(a) - known(b)) || (b.l.length - a.l.length) || (a.idx - b.idx));
  for (const g of groups) sections.push({ key: "marca:" + g.b.toLowerCase(), title: g.b, items: g.l });
  if (small.length) sections.push({ key: "marca:otras", title: "Más perfumes", items: small });
  const care = list.filter((p) => perfumeClassOf(p) === "cuidado");
  if (care.length) sections.push({ key: "clase:cuidado", title: PERFUME_RAILS.cuidado, items: care });
  return sections;
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
  if (key === "beauty") return { beauty: true };
  if (key === "combat_sports") return { fight: true };
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
export const REFURB_NOTE = "No son productos nuevos: cada tarjeta dice si es reacondicionado, de caja abierta o usado, tal como lo declara la tienda.";
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

/** The Celulares rail of a department page: the same brand order, with
    the department's own sort (on sale first, then cheapest) kept inside
    each tier, so the pill and the aisle never disagree. */
export const celularesOrder = (l) => l.map((p, i) => ({ p, i, b: phoneBrandRank(p), n: phoneIsRefurb(p) }))
  .sort((x, y) => (x.b - y.b) || (x.n - y.n) || (x.i - y.i)).map((x) => x.p);

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
    .map((x) => (k === "tech_celulares" ? { ...x, b: phoneBrandRank(x.p), n: phoneIsRefurb(x.p) } : x))
    .sort((x, y) => (x.b - y.b) || (x.n - y.n) || (y.s - x.s) || ((y.p.salePct || 0) - (x.p.salePct || 0)) || (x.i - y.i)).map((x) => x.p);
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
    const books = refurb.filter((p) => isChromebook(p)).sort((a, b) => a.rawPrice - b.rawPrice);
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
    const ordered = k === "chromebooks" ? l.slice().sort((a, b) => ((b.salePct || 0) - (a.salePct || 0)) || (a.rawPrice - b.rawPrice)) : devicesFirst(l, k);
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
     pills:      a fixed list, "r:<store>" or "a:<aisle>" (Casa Aria) */
export const PILL_HUBS = {
  luxury: { by: "brand", max: 14 },
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
  return { lenses, extra: lenses.length ? { pills: lenses.map((l) => ({ k: l.k, label: l.label, n: l.count })) } : {} };
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
/* A tee or a hoodie filed with the toys is clothing, not a toy. */
const NOT_A_TOY_RX = /\b(t-?shirts?|tees?|shirts?|hoodies?|sweatshirts?|sweaters?|pants|joggers|shorts|dress(es)?|skirts?|jackets?|pajamas?|socks?)\b/i;
/* Sport-specific shoes are not the face of women's Zapatos (Danny,
   c.6497530895): cleats, court and golf shoes live in Deportes. */
const SPORT_SHOE_RX = /\b(cleats?|soccer|f[uú]tbol|chimpun\w*|guayos?|fg\/ag|firm ground|turf|indoor soccer|futsal|pickleball|tennis shoes?|court shoes?|golf|bowling|spikes?|track|baseball|softball|football|lacrosse|volleyball|wrestling|cycling|f50|predator|mercurial|phantom|tiempo|morelia|copa (pure|mundial|gloro)|future (ultimate|match|play|pro)|ultra (ultimate|match|play|pro)|(fg|tf|ag|mg)(\/(fg|tf|ag|mg))?)\b/i;
export const AUDIENCE_SHELVES = {
  mujer: [["zapatos", "Zapatos", "shoes_women", (p) => !SPORT_SHOE_RX.test(p.title)], ["gym", "Ropa de gimnasio", "gym_rat", (p) => WOMEN_RX.test(p.title) && !MEN_RX.test(p.title.replace(/\bwomen'?s?\b/gi, ""))],
    ["perfumes", "Perfumes", "perfumes", (p) => perfumeClassOf(p) === "frasco" && (WOMEN_RX.test(p.title) || /\b(pour femme|for her)\b/i.test(p.title))], ["maquillaje", "Maquillaje", "beauty", (p) => MAKEUP_RX.test(p.title)],
    ["cabello", "Cabello", "cabello", null], ["vestidos", "Vestidos", "women", "vestidos"], ["tops", "Blusas y tops", "women", "tops"],
    ["lenceria", "Lencería", "women", "lenceria"], ["bano", "Ropa de baño", "women", "bano"], ["carteras", "Carteras", "women", "carteras"],
    ["joyas", "Joyas", "women", "joyas"], ["lentes", "Lentes de sol", "women", "lentes"]],
  hombre: [["ropa", "Ropa", "men", (p) => ["tops", "camisas", "pantalones", "shorts", "polerones", "chaquetas"].includes(modaType(p))],
    ["zapatos", "Zapatos", "shoes_men", (p) => modaType(p) !== "zapatillas"], ["zapatillas", "Zapatillas", "shoes_men", (p) => modaType(p) === "zapatillas"],
    ["relojes", "Relojes", "men", (p) => WATCH_RX.test(p.title) && !/\b(bands?|straps?|bracelets?|smart ?watch|t-?shirts?|tees?|shirts?|hoodies?|hats?|caps?|bags?|cases?|boxes?)\b/i.test(p.title)],
    ["perfumes", "Perfumes", "perfumes", (p) => perfumeClassOf(p) === "frasco" && (MEN_RX.test(p.title.replace(/\bwomen'?s?\b/gi, "")) || /\b(pour homme|for him)\b/i.test(p.title))],
    ["gym", "Ropa de gimnasio", "gym_rat", (p) => MEN_RX.test(p.title.replace(/\bwomen'?s?\b/gi, ""))],
    ["bano", "Ropa de baño", "men", "bano"], ["gorras", "Gorras", "men", "gorras"], ["lentes", "Lentes de sol", "men", "lentes"],
    ["mochilas", "Mochilas y bolsos", "men", "carteras"]],
  /* Niños opens on Juguetes, always (Danny, c.6497530895). */
  ninos: [["juguetes", "Juguetes", "toys", (p) => !NOT_A_TOY_RX.test(p.title)], ["deportes", "Deportes", "sporting_goods", (p) => KIDS_RX.test(p.title)],
    ["ropa", "Ropa", "kids", (p) => ["tops", "camisas", "pantalones", "shorts", "polerones", "chaquetas", "vestidos", "faldas"].includes(modaType(p))],
    ["zapatos", "Zapatos", "shoes", (p) => KIDS_RX.test(p.title)], ["bano", "Ropa de baño", "kids", "bano"], ["gorras", "Gorras", "kids", "gorras"]],
};
export const AUDIENCE_MIN = 8, AUDIENCE_CARDS = 24;
/* One audience's pills: { v, pills:[{k,label,dept,cards}] }, each pill's
   strongest cards first (the deeper sale, then the department's order),
   one card per title, photographed only. A pill under AUDIENCE_MIN does
   not render (the Aisle Test). */
export function audiencePills(aud, listOf) {
  const pills = [];
  for (const [k, label, dept, f] of AUDIENCE_SHELVES[aud]) {
    const seen = new Set();
    const l = listOf(dept).filter((p) => p.image && (!f || (typeof f === "string" ? modaType(p) === f : f(p))))
      .filter((p) => { const t = p.retailer + "::" + String(p.title).toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; });
    let ranked = l.map((p, i) => ({ p, i })).sort((a, b) => ((b.p.salePct || 0) - (a.p.salePct || 0)) || (a.i - b.i)).map((x) => x.p);
    /* A mixed pill (Ropa, Zapatos) opens on a mix: at most 2 of one kind in front. */
    ranked = interleaveFront(ranked.map((p) => ({ ...p, type: modaType(p) || p.type })), AUDIENCE_CARDS, 2);
    if (ranked.length >= AUDIENCE_MIN) pills.push({ k, label, dept, cards: ranked.slice(0, AUDIENCE_CARDS).map(cardOf) });
  }
  return { v: 1, pills };
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
  /* The Perfumes room is Aria Perfumes' stock; since the #443 re-route
     audit it also admits the true fragrances other stores sell, which
     join its brand rails -- the room keeps its layout. */
  if (list.length && list.filter((p) => p.retailer === PERFUME_STORE).length >= list.length * 0.9) return buildPerfumeSections(list);
  /* Aria Fight Club leads with fight equipment -- gloves, gis, shin
     guards, pads, gear on sale; workout apparel follows, never leads
     (Danny, #443 c.6504037778 §7). */
  const gearRank = (p) => (opts.fight && !FIGHT_GEAR_RX.test(p.title || "") ? 1 : 0);
  const sales = list.filter((p) => p.salePct > 0).map((p, i) => ({ p, i }))
    .sort((a, b) => (gearRank(a.p) - gearRank(b.p)) || (b.p.salePct - a.p.salePct) || (a.i - b.i)).map((x) => x.p);
  const sections = [];
  if (sales.length) sections.push({ key: "ofertas", title: "Ofertas", items: sales });
  else if (list.length) sections.push({ key: "destacados", title: "Destacados", items: list });
  /* Aria Beauty opens with Ofertas, then the women's perfumes and body
     sprays, Victoria's Secret's first (§8). */
  if (opts.beauty) {
    const vsFirst = (p) => (p.retailer === "victoriassecret" ? 0 : 1);
    const scents = list.filter((p) => SCENT_RX.test(p.title || "")).map((p, i) => ({ p, i }))
      .sort((a, b) => (vsFirst(a.p) - vsFirst(b.p)) || ((b.p.salePct || 0) - (a.p.salePct || 0)) || (a.i - b.i)).map((x) => x.p);
    if (scents.length >= 3) {
      sections.push({ key: "perfumes-brumas", title: "Perfumes y brumas", items: scents });
      const inScents = new Set(scents);
      list = list.filter((p) => !inScents.has(p));
    }
  }
  /* Reacondicionados: second in every department with 3+ such products
     (not in the department made of nothing else). */
  const refurb = list.filter((p) => conditionOfTitle(p.title));
  if (refurb.length >= 3 && refurb.length < list.length) sections.push({ key: "reacondicionados", title: "Reacondicionados", note: REFURB_NOTE, items: refurb });
  if (opts.genderAisles) return sections.concat(genderAisles(list));
  const byType = {}, order = [], titleOf = {};
  for (const p of list) {
    /* Grouped by the title the shopper reads: "T Shirt" and "T Shirts" are one «Polos» rail. */
    const raw = String(p.type || "").trim();
    const t = raw ? typeLabel(raw).toLowerCase() : "__otros__";
    if (!byType[t]) { byType[t] = []; order.push(t); titleOf[t] = raw ? typeLabel(raw) : ""; }
    byType[t].push(p);
  }
  const groups = []; let small = [];
  order.forEach((t, idx) => {
    const l = byType[t];
    if (t !== "__otros__" && l.length >= 3 && !NOT_A_TYPE_RX.test(t)) groups.push({ t, l, idx });
    else small = small.concat(l);
  });
  /* Fight Club: the gear aisles first, the apparel after (§7). */
  const gearAisle = (g) => (opts.fight && !FIGHT_GEAR_AISLE_RX.test(titleOf[g.t] || g.t) ? 1 : 0);
  groups.sort((a, b) => (gearAisle(a) - gearAisle(b)) || (b.l.length - a.l.length) || (a.idx - b.idx));
  for (const g of groups) sections.push({ key: "tipo:" + g.t, title: titleOf[g.t] || typeLabel(g.t), items: g.l });
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
  /* k: the condition label (/condition.js) when the store's title says
     refurbished, used or open-box. */
  const cond = conditionOfTitle(p.title);
  if (cond) c.k = cond.label;
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
  if (p.g || p.a) r.push(p.g || "");
  if (p.a) r.push(p.a);
  return r;
}
export function rowItem(r) {
  const p = { title: r[0], brand: r[1], retailer: r[2], rawPrice: r[3], wasPrice: r[4], salePct: r[5], image: r[6], type: r[7] };
  if (r[8]) p.g = r[8];
  if (r[9]) p.a = r[9];
  return p;
}

/* The page's filters, unchanged: one store, and every word of the
   department search box in the title or brand. */
export function filterList(list, { r = "", q = "" } = {}) {
  const words = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    if (r && r !== "all" && p.retailer !== r) return false;
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
  const list = (r && r !== "all") || q.trim() ? filterList(d.list, { r, q }) : d.list;
  const sections = buildSections(list, sectionOpts(d.key));
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
  return { status: 200, body: headOf(d.key, list, sections, d.labels, { r: r || "all", q }) };
}
