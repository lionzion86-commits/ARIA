/* ==================================================================
   WHAT A STORE'S TYPE SAYS THE PRODUCT IS (#443 c.6634907518, Danny's
   mom: «every site has a couple of items in the wrong category;
   minimize it so the customer navigates without problems»).

   A store types every product it sells. JuJuBe types its clutches and
   backpacks PAÑALES (they are diaper bags), a surf shop types a board
   bag «Tablas de surf», a dive shop types a fin bag «Aletas de buceo»,
   B&H types a light kit's backpack «Flash de estudio», Bentgo types a
   lunch bag GEAR. A fashion department that takes a store's whole
   «purses» or «women» aisle took those too: Carteras listed «Pañales».

   storeTypeFamily(type) is the family the store's own type names when
   it names one outside fashion -- bebe, deportes, electronica, hogar,
   juguetes, fiesta, belleza, perfumes, libros, dulces, repuestos --
   and "" when it names fashion, a catch-all («Accesorios», «RETAIL»,
   «Ropa») or nothing. The title is never read here: a bag is a bag by
   its name, but WHICH bag it is (a diaper bag, a board bag) is the
   store's type. The departments read it (build-department-slices.mjs
   FASHION_FAMILIES), and the header's type columns are pinned to it
   (nordstrom-nav-tests.mjs).
   ================================================================== */

/* Spanish and English words, whole words, matched on the type with
   _ and - read as spaces. Order matters: a «Ropa de bebé» is baby
   clothing (fashion, kept out of this list); a «Bolso de pañales» is
   baby. */
const FAMILY_RULES = [
  ["bebe", /\b(pa[ñn]al(?:es|eras?)?|diapers?|lactancia|nursing|breast\s*pumps?|biber[oó]n(?:es)?|baby\s+bottles?|alimentaci[oó]n\s+del\s+beb[eé]|coche(?:cito)?s?|strollers?|autoasientos?|car\s*seats?|portabeb[eé]s?|baby\s+carriers?|chupetes?|mordedor(?:es)?|pacifiers?|teethers?|silla\s+de\s+comer|high\s*chairs?|habitaci[oó]n\s+del\s+beb[eé]|nursery|cuidado\s+del\s+beb[eé]|ba[ñn]o\s+del\s+beb[eé]|cunas?|cribs?|baby\s+gear|feeding)(?![a-z0-9ñáéíóú])/i],
  ["electronica", /\b(flash(?:es)?\s+de\s+estudio|tr[ií]podes?|tripods?|drones?|c[aá]maras?|cameras?|laptops?|audio|aud[ií]fonos|headphones?|tarjetas?\s+de\s+memoria|memory\s+cards?|electr[oó]nica|electronics?|videojuegos?|tablets?)(?![a-z0-9ñáéíóú])/i],
  ["deportes", /\b(tablas?\s+de\s+surf|surfboards?|accesorios\s+de\s+(?:surf|skate|f[uú]tbol|tenis|pesca\s+submarina)|repuestos\s+y\s+accesorios|pesca|spearfishing|arpones?|aletas(?:\s+de\s+buceo)?|fins|trajes?\s+de\s+neopreno|wetsuits?|m[aá]scaras?\s+y\s+snorkels?|snorkels?|reguladores?|boyas?|flotadores?|skateboards?|decks?|trucks|ruedas|longboards?|sup|paddle(?:\s*surf)?|balones?|pelotas?|arcos?\s+y\s+porter[ií]as|cascos?\s+y\s+protecciones|pesas|levantamiento|lifting|gear[\s_]bags?|maletines\s+deportivos|sporting\s+goods|gear)(?![a-z0-9ñáéíóú])/i],
  ["juguetes", /\b(juguetes?|toys?|figuras?\s+coleccionables?|juegos?|games?|disfraces|costumes?|peluches?|plush)(?![a-z0-9ñáéíóú])/i],
  ["fiesta", /\b(recuerdos\s+de\s+fiesta|party\s+(?:favors?|supplies)|fiesta)(?![a-z0-9ñáéíóú])/i],
  ["hogar", /\b(hogar|home|vajilla|tableware|mantas?|blankets?|canastas|organizador(?:es)?|storage(?:\s+containers?)?|loncheras?|lunch(?:\s+box(?:es)?)?|toallas|towels?|decoraci[oó]n|decor|stickers|velas?|candles?|cocina|kitchen|manteles|cojines|vasos|tazas|plantas)(?![a-z0-9ñáéíóú])/i],
  ["belleza", /\b(belleza|beauty|cuidado\s+(?:corporal|del\s+cabello|de\s+la\s+piel)|skin\s*care|hair\s*care|maquillaje|makeup|mascarillas|limpieza)(?![a-z0-9ñáéíóú])/i],
  ["perfumes", /\b(fragancias?|fragrances?|perfumes?)(?![a-z0-9ñáéíóú])/i],
  ["libros", /\b(libros?(?:\s+de\s+mesa)?|books?)(?![a-z0-9ñáéíóú])/i],
  ["dulces", /\b(dulces|candy|chocolates?)(?![a-z0-9ñáéíóú])/i],
  ["repuestos", /\b(repuestos|auto\s*parts?)(?![a-z0-9ñáéíóú])/i],
];
/* A type that names a garment first («Ropa de bebé», «Toallas y
   ponchos» -- a surf poncho --, «Maternidad») stays fashion. */
const FASHION_FIRST_RX = /\b(ropa|maternidad|ponchos?|bodies|vestidos?|polos?|shorts?|pantal[oó]n(?:es)?|medias|sombreros?|gorras?|gorros?)(?![a-z0-9ñáéíóú])/i;

/* A fashion type (a garment, a shoe, a bag, a jewel, an accessory). */
const FASHION_TYPE_RX = /\b(ropa|apparel|clothing|prendas?|blusas?|tops?|camisas?|vestidos?|faldas?|pantal[oó]n(?:es)?|jeans|shorts?|chompas?|polerones?|casacas?|abrigos?|polos?|medias|gorras?|gorros?|sombreros?|zapatos?|zapatillas?|sandalias|tacones|botas|calzado|shoes|carteras?|bolsos?|mochilas?|billeteras?|joyer[ií]a|joyas?|aretes|collares|anillos|pulseras|accesorios?|accessor(?:y|ies)|lentes|lencer[ií]a|pijamas?)\b/i;
export const isFashionType = (type) => FASHION_TYPE_RX.test(String(type || "").replace(/[_\-]+/g, " "));
/* Departments of ONE family: what they hold is that family by its own
   name (Juguetes is toys by the name's head noun, Aria Beauty by its
   aisle), so a store type naming anything else is the store's slip --
   Macy's types a Benefit gift set APPAREL, a surf shop types a hula doll
   «Accesorios», BoxLunch a Funko blind bag «Bolso». The product takes the
   department's own type. */
export const ONE_FAMILY_DEPTS = { toys: ["juguetes", "Juguetes"], beauty: ["belleza", "Belleza"] };
export function slipType(dept, label, raw) {
  const own = ONE_FAMILY_DEPTS[dept];
  if (!own) return "";
  const f = storeTypeFamily(label) || storeTypeFamily(raw);
  if (f === own[0] || (dept === "beauty" && f === "perfumes")) return "";
  return f || isFashionType(label) || isFashionType(raw) ? own[1] : "";
}

const memo = new Map();
export function storeTypeFamily(type) {
  const raw = String(type || "").trim();
  if (!raw) return "";
  if (memo.has(raw)) return memo.get(raw);
  const t = raw.replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
  let out = "";
  if (!FASHION_FIRST_RX.test(t)) for (const [f, rx] of FAMILY_RULES) if (rx.test(t)) { out = f; break; }
  memo.set(raw, out);
  return out;
}

/* The families each fashion department sells besides fashion itself
   (nothing, for most). Diseñador y Lujo is a designer house's whole
   range: its fragrance and beauty are designer goods. Aria Beauty sells
   beauty and scent only. */
export const FASHION_DEPT_EXTRA = {
  women: [], men: [], kids: [], curvy: [], clothing: [], purses: [], joyas_accesorios: [], sunglasses: [],
  luxury: ["perfumes", "belleza"],
};
export const BEAUTY_FAMILIES = ["belleza", "perfumes"];
/* Where a baby product a fashion aisle carried belongs: Mama's Fashion,
   the baby department (its own types are these: Pañales, Coche ...). */
export const BABY_DEPT = "moms";

/* A name that names a thing of its own is believed over the store's
   aisle: «Hoop Earrings» typed «Belleza» are earrings, cufflinks typed
   «Manta» are cufflinks, «Hair Oil» typed «Cascos y protecciones» is
   hair care. A name that only names a container or a generic piece --
   a bag, a backpack, a clip, an «accessory» -- does not say which one
   it is: the store's type does (a diaper bag, a board bag, a camera clip). */
const CONTAINER_NAMES = new Set(["", "carteras", "accesorios"]);
const ACCESSORY_LOOSE_TYPES = new Set(["hogar", "belleza", "libros", "dulces", "repuestos"]);
const FASHION = ["ropa", "zapatos", "carteras", "joyas", "accesorios", "sombreros", "trajes_bano"];
export function deptSells(dept, fam) {
  if (dept === "beauty") return BEAUTY_FAMILIES.includes(fam);
  const extra = FASHION_DEPT_EXTRA[dept];
  return !extra || FASHION.includes(fam) || extra.includes(fam);
}
/** "" when `dept` may sell what the product is; else the family its
    store's type names. nameFam: what its own name names (product-type.js). */
export function foreignFamily(dept, p, nameFam = "") {
  if (dept !== "beauty" && !FASHION_DEPT_EXTRA[dept]) return "";
  const g = storeTypeFamily(p && p.storeType) || storeTypeFamily(p && p.type);
  if (!g || deptSells(dept, g)) return "";
  if (!CONTAINER_NAMES.has(nameFam || "") && deptSells(dept, nameFam)) return "";
  /* An accessory by name is a domain's own only where the domain makes
     accessories (a pacifier clip, a tennis headband, a camera clip, a
     party favour); cufflinks a store typed «Manta» or a hair tie typed
     BEAUTY are still accessories. */
  if (nameFam === "accesorios" && dept === "joyas_accesorios" && ACCESSORY_LOOSE_TYPES.has(g)) return "";
  return g;
}
