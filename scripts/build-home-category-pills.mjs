#!/usr/bin/env node
/* ============================================================
   assets/home/category-pills/ — «TODAS LAS TIENDAS»: STORE PILLS ON TOP
   OF THE HOMEPAGE'S CATEGORY CAROUSELS (Danny, #443, 2026-11-01:
   "Todas las Tiendas -- then the category -- then the tiendas on top").

   WHAT. The homepage keeps its category carousels exactly as they are
   (#586's rebuild was reverted). Each one gets a row of STORE pills on
   top: «Todas» (the carousel as it was) and one pill per store that
   truly sells that category. A pill re-scopes that carousel in place to
   the store's products of that category only; its rail ends on «Ver más
   en <Tienda>» (tienda.html?tienda=<key>). Four carousels are new and
   are painted from here too: Bikinis y Ropas de Baño, Hogar y
   Especialidades, Tenis and Billeteras (Mujer / Hombre / Unisex pills,
   no store pills). Every carousel also carries an «Ofertas» pill where
   its view holds 8+ sale items (Danny's audit, #443 c.6567197812). Auto and Motos are NOT in this row (Danny, #443
   c.6565694526: they have their own pages, aria-auto.html and motos.html).

   CATEGORY TRUTH (the Nov 1 audit). A store's membership in a category
   is never read from a brand or a word in a title. It is the category
   data the site already publishes:
     - a DEPARTMENT's own membership (assets/sections/departamento/_fn/
       <dept>.json, build-department-slices.mjs -- product type first),
       for every carousel that opens a department page (Gym Rat, Fútbol,
       Aria Fight Club, Beauty, Surf & Skate, Juguetes, Zapatos, Lentes,
       Tallas Plus, Electrónica, Joyas, Hogar = home_goods + home_decor),
       narrowed for the non-apparel ones by the one classifier
       (/product-type.js) to the carousel's own family;
     - the Ropa Interior department's own feeds for Lencería (women's,
       underwear only) and Ropa Interior Hombre;
     - the STORE PAGE's own aisles (assets/tienda/_fn/<key>.json,
       build-store-slices.mjs) for Bikinis y Ropas de Baño (t-trajes_bano
       and the ~swim garment class).
   A training shop's product (its catalogue files it gym_rat or
   combat_sports) is kit, never Lencería or swimwear: a sports bra
   is not lingerie and a rash guard is not a bikini.

   A PILL IS A REAL STOREFRONT. tienda.html's STORES registry row, an
   assets/tienda/<key>/index.json with products, not off sale -- so the
   «Ver más en» door always opens a live store.

   NO PADDING. A store gets a pill only with MIN_CARDS photographed,
   distinct products of that category; thinner aisles are reported.

   THE MOUNTAIN TEST. index.json is labels only (stores and counts);
   <carousel>-<store>.json is one pill's rail (RAIL_CARDS cards); the
   new carousels' default rail is <carousel>-todas.json. Nothing is
   fetched with the page: assets/js/home-category-pills.js asks for the
   index when a category carousel nears the screen and for a rail only
   when its pill is tapped. Card prices are the catalogue's raw US
   prices, as on the store pages; the page prices them with the bundle's
   own normalizeLiveItem before the shared railCardHTML draws them.

   RUN after the store and department slices:
     node scripts/build-home-category-pills.mjs
   scripts/test/home-category-pills-tests.mjs fails when the files are
   stale or a rail holds a product outside its category.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { stampHomePhotos } from "./stamp-home-photos.mjs";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PILLS_DIR = "assets/home/category-pills";
/* A pill needs a full rail of its category; fewer is a thin aisle. */
export const MIN_CARDS = 16;
export const RAIL_CARDS = 16;
/* The new carousels' «Todas» rail: every pill's store, interleaved. */
export const TODAS_CARDS = 20;

/* Store slice rows (build-store-slices ROW) and department rows (fnRow). */
const S = { name: 0, brand: 1, price: 2, was: 3, image: 5, dept: 6, type: 8 };
const D = { name: 0, brand: 1, store: 2, price: 3, was: 4, image: 6, type: 7 };

/* A training shop's own stock: kit, never lingerie or swimwear. */
const KIT_DEPTS = new Set(["gym_rat", "combat_sports"]);
/* Departments that are their own category (Mamás): not Lencería. */
const OWN_CATEGORY_DEPTS = new Set(["moms"]);

/* FIGHT GEAR FIRST (#443, Danny 2026-11-01: "Aria Fight Club must lead
   with real fight gear"). The fight department's own product types --
   gloves, gis, belts, shin guards, fight shorts, rash guards -- in the
   order a pill rail shows them. A type, never a word in a title. */
export const FIGHT_GEAR_CLASSES = [
  ["guantes", ["BOXING_GLOVES", "boxing_gloves", "MMA_GLOVES", "UNDERGLOVES", "FOCUS_MITTS", "KICK_PADS", "hand_wraps", "BOXING_HAND_WRAPS", "BOXING_KITS", "BOXING_TRAINING"]],
  ["gi", ["BJJ_GI", "BJJ_KIMONOS", "FLOW-TECH_BJJ_GIS", "BELT"]],
  ["proteccion", ["SHIN_PADS", "SHIN_GUARDS", "PROTECTIVE_GEAR", "ANKLE_GUARD", "KNEE_PADS", "ELBOW_PADS", "GEAR", "BOXING_SHOES"]],
  ["rashguard", ["RASH_GUARD", "SPATS"]],
  ["shorts", ["fight_shorts", "MMA_SHORTS", "MUAY_THAI_SHORTS", "BOXING_SHORTS"]],
];
export const FIGHT_GEAR_TYPES = new Set(FIGHT_GEAR_CLASSES.flatMap(([, t]) => t));

/* THE CAROUSELS, in page order. `host` is how the page finds the
   carousel: an existing rail row (data-category-rail-row="<row>"), the
   Electrónica pill shelf, the Joyas rail, or a NEW carousel this build
   paints. `door` is the category's own page (never a store page): the
   «Todas» rail of a new carousel ends on it.

   DANNY'S AUDIT (#443 c.6567120876, c.6567135924, c.6567197812):
     lead      stores that open the pill row and the «Todas» rail, in order
               (Lencería: Victoria's Secret; Tallas Plus: Lane Bryant;
               Bikinis: Montce; Aria Fight Club: Venum, then Tatami);
     leadCards how many of the first lead store's cards open «Todas»
               (leadPrefer: which of them first -- a Victoria's Secret bra,
               a Lane Bryant top before its panties);
     fightLead the Fight Club opening: Venum gloves, then Tatami gis;
     leadPhoto the catalogue photo (images[n]) the «Todas» first card
               wears (Bikinis: Montce's third photo, Danny's pick live);
     tail      stores that stay live but ride at the back of the pill row
               and the mix (Gym Rat: Gymshark and Alphalete);
     worn      a carousel of clothes: socks and accessories never lead a
               rail (they move to its back; nothing is removed for it);
     exclude   what is not this category at all (socks are not Lencería,
               a strap is not sunglasses, belts, toys and wallets are not
               Joyas) -- out of every rail of the carousel;
     ofertas   false: the carousel already has its own Ofertas pill
               (Electrónica's type row). */
export const CAROUSELS = [
  { k: "lenceria", title: "Lencería", host: "row", row: "ropa_interior_mujer", src: { feed: "ropa-interior-women-feed.json", underwearOnly: true }, lead: ["victoriassecret", "skims"], leadCards: 3, leadPrefer: (cd) => cd._type === "bra", worn: true, exclude: (cd) => isSock(cd) },
  { k: "interior-hombre", title: "Ropa Interior Hombre", host: "row", row: "ropa_interior", src: { feed: "ropa-interior-feed.json" }, worn: true },
  { k: "tallas-plus", title: "Tallas Plus", host: "row", row: "curvy", src: { depts: ["curvy"] }, lead: ["lanebryant"], leadCards: 3, leadPrefer: (cd) => !/^(panties|bras|lingerie|shapewear)$/i.test(String(cd._type || "")), worn: true },
  { k: "bano", title: "Bikinis y Ropas de Baño", host: "new", src: { swim: true }, door: "", lead: ["montce"], leadCards: 1, leadPhoto: 2, worn: true },
  { k: "electronica", title: "Electrónica", host: "tech", src: { depts: ["electronics"] }, ofertas: false },
  { k: "gym-rat", title: "Gym Rat", host: "row", row: "gym_rat", src: { depts: ["gym_rat"] }, tail: ["gymshark", "alphalete"], worn: true },
  { k: "futbol", title: "Fútbol", host: "row", row: "soccer", src: { depts: ["soccer"] }, worn: true },
  { k: "tenis", title: "Tenis", host: "new", src: { depts: ["tennis"], notFamilies: ["juguetes", "hogar", "libros", "belleza", "perfumes", "electronica", "dulces"] }, door: "/departamento.html?dept=tennis", worn: true },
  { k: "fight-club", title: "Aria Fight Club", host: "row", row: "combat_sports", src: { depts: ["combat_sports"], gearFirst: true }, lead: ["venum", "tatami"], fightLead: [["venum", "guantes", 2], ["tatami", "gi", 2]] },
  { k: "beauty", title: "Aria Beauty", host: "row", row: "beauty", src: { depts: ["beauty"], families: ["belleza", "perfumes"] } },
  { k: "surf-skate", title: "Surf & Skate", host: "row", row: "surf_skate", src: { depts: ["surf_skate"] }, worn: true },
  { k: "juguetes", title: "Juguetes", host: "row", row: "toys", src: { depts: ["toys"], families: ["juguetes"] }, exclude: (cd) => isPartyTableware(cd) },
  { k: "zapatos", title: "Zapatos", host: "row", row: "shoes", src: { depts: ["shoes"] }, worn: true },
  { k: "lentes", title: "Lentes de Sol", host: "row", row: "sunglasses", src: { depts: ["sunglasses"], families: ["accesorios"] }, exclude: (cd) => isEyewearAccessory(cd) },
  { k: "joyas", title: "Joyas y accesorios", host: "joyas", src: { depts: ["joyas_accesorios"], families: ["joyas", "accesorios"] }, lead: ["baublebar"], leadCards: 1, exclude: (cd) => isBelt(cd) || isToyPiece(cd) || isWallet(cd) },
  { k: "hogar", title: "Hogar y Especialidades", host: "new", src: { depts: ["home_goods", "home_decor"], families: ["hogar", "libros"] }, door: "/departamento.html?dept=home_goods" },
  /* BILLETERAS (Danny, #443 c.6567232584): ONE carousel, no store pills
     ("overkill"): «Todas · Mujer · Hombre · Unisex». The audience is the
     data's own -- the store page's aisle gender (t-accesorios~men~...),
     else the Moda Mujer / Moda Hombre department that carries it; a
     wallet with no audience tag is Unisex (its own pill, not hidden). */
  { k: "billeteras", title: "Billeteras", host: "new", src: { wallets: true }, door: "/departamento.html?dept=purses",
    audiences: [["mujer", "Mujer", "/departamento.html?dept=women", "Moda Mujer"], ["hombre", "Hombre", "/departamento.html?dept=men", "Moda Hombre"], ["unisex", "Unisex", "/departamento.html?dept=purses", "Bolsos"]] },
];

/* ---------- what a product IS, for the audit's rules ----------
   Membership stays the category data above. These narrow rules only
   say what a category's rows are NOT (or what may not lead): the
   product's own type first; the title only where the store's type is a
   catch-all ("", "Ropa", "General", "For Him") or files a whole aisle
   under one word. Each list is short and named. */
/* "Accesorios de fútbol" is a whole store's catalogue at Xtreme Soccer
   (cleats, slides, hats): a type that names only "accessories" says
   nothing, so the title decides. */
const CATCHALL_TYPE = /^(|ropa|ropa deportiva|clothing|apparel|general|todo|otros?|other|misc\.?|for him|for her|women|men|unisex|accesorios?( de .*)?|accessor(y|ies)|apparel[_ ]accessories|bolsos?|joyer[ií]a|gear)$/i;
const catchall = (t) => CATCHALL_TYPE.test(String(t || "").trim());

/* Socks and hosiery: the feed's own class (ty "socks") or a sock type. */
const SOCK_TYPE = /\b(socks?|calcetines?|medias|hosiery|tights)\b|accessories_socks|socks_/i;
const SOCK_TITLE = /\b(socks?|calcetines?|no[- ]show|crew socks?|ankle socks?)\b/i;
export function isSock(cd) {
  if (cd._ty === "socks") return true;
  if (SOCK_TYPE.test(String(cd._type || "").replace(/_/g, " ")) || /SOCKS/i.test(String(cd._type || ""))) return true;
  return catchall(cd._type) && SOCK_TITLE.test(String(cd.title || ""));
}
/* An accessory worn by no model: bags, hats, bottles, straps, belts,
   stickers... by type, or by title under a catch-all type. */
const ACCESSORY_TYPE = /\b(hats?|caps?|gorras?|gorros?|beanies?|bags?|bolsos?|mochilas?|backpacks?|bottles?|shakers?|straps?|belts?|cinturones?|keychains?|llaveros?|stickers?|headbands?|wristbands?|towels?|toallas?|wallets?|billeteras?|equipment|lifting|pelotas?|balls?)\b/i;
const ACCESSORY_TITLE = /\b(hats?|caps?|beanies?|visors?|bags?|backpacks?|duffle?s?|totes?|bottles?|shakers?|straps?|belts?|keychains?|stickers?|headbands?|wristbands?|wrist wraps?|lifting grips?|towels?|wallets?|gloves?|chalk|jump ropes?|resistance bands?|sunglasses)\b/i;
const NOT_ACCESSORY_TITLE = /\bcap[- ]sleeve|\bbag(gy|gie)/i;
/* Intimates' hardware is an accessory whatever aisle files it (Lane
   Bryant files its bra band extenders under "Bras"). */
const INTIMATE_ACCESSORY = /\b(band extenders?|bra extenders?|strap holders?|strap converters?|bra straps?|nipple covers?|breast petals?|adhesive bra|bra inserts?|laundry bags?)\b/i;
/* Parts, care and gadgets are accessories in any aisle (a store's
   skate hardware, a shoe-care spray, a phone case filed with shoes). */
const GEAR_ACCESSORY = /\b(hardware|bearings|riser pads?|repair kits?|surf ?wax|board ?wax|leash(es)?|grip ?tape|tools?|bolts|keyrings?|key ?chains?|tethers?|board ?socks?|surfboard socks?|board ?bags?|fin ?keys?|fins?|adapters?|skate rails?|slimline rails?|rail devil|magnets?|magnet sets?|books?|vhs|dvds?|posters?|helmets?|stickers?|phone cases?|sneaker mitts|foam spray|shoe (cleaner|care|wipes|deodorizer)|cleaning kits?|insoles?|shoe ?laces?|laces)\b/i;
export function isAccessory(cd) {
  if (INTIMATE_ACCESSORY.test(String(cd.title || "")) || GEAR_ACCESSORY.test(String(cd.title || ""))) return true;
  const ty = String(cd._type || "").replace(/_/g, " ");
  if (!catchall(cd._type) && ACCESSORY_TYPE.test(ty)) return true;
  const t = String(cd.title || "");
  return catchall(cd._type) && ACCESSORY_TITLE.test(t) && !NOT_ACCESSORY_TITLE.test(t);
}
/* Sunglasses accessories (Danny: Island Water Sports' rail led with a
   strap and a case): retainers, straps, cords, cases, cleaning kits,
   replacement lenses. A pair of sunglasses sold "with" a case or a cord
   is still sunglasses. */
const EYEWEAR_ACCESSORY = /\b(straps?|retainers?|croakies|cords?|lanyards?|leash(es)?|chains?|cases?|pouch(es)?|cleaning|cleaners?|cloths?|wipes|replacement lens(es)?|reader lenses|sticktite|floats?|floaties)\b/i;
const SUNGLASS_NOUN = /\b(sunglass\w*|sunglesses|sunglasess|shades|eyewear|glasses|polarized)\b/i;
export function isEyewearAccessory(cd) {
  const t = String(cd.title || "");
  if (/\bsunglass\w* (straps?|cases?|cords?|retainers?|chains?|holders?)\b/i.test(t)) return true;
  if (!EYEWEAR_ACCESSORY.test(t)) return false;
  if (/\bwith (a )?(hard |soft |carrying |protective )?(case|cord|pouch|strap)\b/i.test(t)) return false;
  return !SUNGLASS_NOUN.test(t.replace(EYEWEAR_ACCESSORY, ""));
}
/* Belts are not jewelry (SSENSE's men's belts, BELTS & SUSPENDERS);
   a belt bag is a bag. */
export function isBelt(cd) {
  const ty = String(cd._type || ""), t = String(cd.title || "");
  if (/\bbelts?\b|cintur[oó]n|cinturones|weight_lifting_belts/i.test(ty)) return true;
  return /\bbelts?\b/i.test(t) && !/\bbelt[- ]?bags?\b|\bbelt chains?\b|\bbelly\b|\bbelted\b/i.test(t);
}
/* A toy is not jewelry, on a keyring or not (Danny: BoxLunch's rail
   opened with a Funko Pocket Pop): the store's own "collectible figure"
   type, or a vinyl figure line. Plain keychains stay. */
export function isToyPiece(cd) {
  if (/figura coleccionable|collectible|figures?\b|toys?\b|juguet/i.test(String(cd._type || ""))) return true;
  return /\b(funko|pocket pop!?|pop! |vinyl figure|plush|action figure|blind bag)\b/i.test(String(cd.title || ""));
}
/* WALLETS (Danny: out of Joyas, into Billeteras). The classifier has no
   wallet family (a wallet files under "accesorios" with keychains and
   belts), so this is the narrow, documented rule: a wallet or card
   holder type (SSENSE's WALLETS / CARD HOLDERS, "Billetera"), else the
   product's own name says wallet, card holder, card case, coin purse or
   money clip -- and it is not a bag that comes with one ("backpack with
   coin purse", "tote and wallet set"), a wallet-on-chain bag, a wallet
   chain or a phone case. */
const WALLET_TYPE = /\b(wallets?|card ?holders?|card ?cases?|billeteras?|tarjeteros?|small[_ ]leather)\b/i;
const WALLET_TITLE = /\b(wallets?|card ?holders?|cardholders?|card ?cases?|coin purses?|money clips?|billeteras?|tarjeteros?|billfolds?|bifolds?|trifolds?)\b/i;
const NOT_WALLET = /\bwallet[- ]on[- ](a[- ])?chain\b|\bwallet chains?\b|\bphone (case|wallet)\b|\bwoc\b|\b(backpacks?|bags?|totes?|crossbody|satchels?|handbags?|duffels?|luggage|sets?|keychains?|charms?|lanyards?)\b/i;
export function isWallet(cd) {
  const t = String(cd.title || "");
  if (NOT_WALLET.test(t)) return false;
  return WALLET_TYPE.test(String(cd._type || "").replace(/_/g, " ")) || WALLET_TITLE.test(t);
}

/* PARTY TABLEWARE IS NOT A TOY. A licensed character (Barbie, Hot
   Wheels, PAW Patrol) on a cup, plate or napkin makes the classifier
   call it a toy by brand; Juguetes keeps toys, not the party table
   (Party City's favor cups and dessert plates led its pill). */
const TABLEWARE = /\b(cups?|plates?|napkins?|table ?(cloths?|covers?)|cutlery|forks?|spoons?|straws?|tumblers?|bowls?|platos?|vasos?|servilletas?)\b/i;
export function isPartyTableware(cd) { return TABLEWARE.test(String(cd.title || "")); }

const readJSON = (root, f) => JSON.parse(readFileSync(join(root, f), "utf8"));

/* THE ONE CLASSIFIER (/product-type.js, the same file every page and
   builder reads). A non-apparel carousel (Juguetes, Aria Beauty, Lentes,
   Joyas, Hogar) keeps only what it files in that carousel's own family:
   a department bucket can hold a store's catch-all (Costco's "toys" pull
   carried tortillas, cocoa and hot tubs, #443 c.6565694526), and Aria
   sells no food. */
const classifiers = new Map();
export function classifierOf(root = ROOT) {
  if (!classifiers.has(root)) {
    const win = {};
    vm.runInNewContext(readFileSync(join(root, "product-type.js"), "utf8"), { window: win });
    classifiers.set(root, win.AriaProductType);
  }
  return classifiers.get(root);
}

/** tienda.html's STORES registry (the storefronts). */
export function storeRegistry(root = ROOT) {
  const html = readFileSync(join(root, "tienda.html"), "utf8");
  const m = /^var STORES = (\{.*\});\s*$/m.exec(html);
  return m ? JSON.parse(m[1]) : {};
}

/** key -> label for every live storefront (registry row + products + on sale). */
export function liveStorefronts(root = ROOT) {
  const reg = storeRegistry(root), out = {};
  for (const k of Object.keys(reg)) {
    if (isOffSaleRetailer(k) || reg[k].pendingCatalog) continue;
    const idx = join(root, `assets/tienda/${k}/index.json`), fn = join(root, `assets/tienda/_fn/${k}.json`);
    if (!existsSync(idx) || !existsSync(fn)) continue;
    if (!(readJSON(root, `assets/tienda/${k}/index.json`).count > 0)) continue;
    out[k] = reg[k].label || k;
  }
  return out;
}

const card = (title, brand, price, was, image, store) => {
  const c = { title, price, image, retailer: store };
  if (brand) c.brand = brand;
  if (was > price) c.originalPrice = was;
  return c;
};
const pctOf = (c) => (c.originalPrice > c.price ? 1 - c.price / c.originalPrice : 0);

/* Each store slice once: rows, top aisle and garment sub-aisles. */
const sliceCache = new Map();
export function storeSlice(root, store) {
  const key = root + "::" + store;
  if (sliceCache.has(key)) return sliceCache.get(key);
  const f = `assets/tienda/_fn/${store}.json`;
  let out = null;
  if (existsSync(join(root, f))) {
    const fn = readJSON(root, f);
    const top = new Map(), subs = new Map(), byTitle = new Map();
    for (const [rk, list] of Object.entries(fn.rails || {})) {
      if (rk.includes("~")) {
        const [a, g, s] = rk.split("~");
        for (const i of list) { if (!subs.has(i)) subs.set(i, []); subs.get(i).push({ a, g, s }); }
        continue;
      }
      if (!/^[td]-/.test(rk) || rk === "t-mas" || rk === "d-mas") continue;
      for (const i of list) if (!top.has(i)) top.set(i, rk);
    }
    fn.rows.forEach((r, i) => { if (r && !byTitle.has(String(r[S.name]))) byTitle.set(String(r[S.name]), i); });
    out = { rows: fn.rows, top, subs, byTitle };
  }
  sliceCache.set(key, out);
  return out;
}
/** The catalogue bucket a store files one of its products under. */
function deptOfProduct(root, store, title) {
  const s = storeSlice(root, store);
  if (!s) return "";
  const i = s.byTitle.get(String(title));
  return i === undefined ? "" : String(s.rows[i][S.dept] || "");
}

/** The store-page aisle category of one store row: "bano" | "motos" | null. */
export function sliceCategory(slice, i) {
  const row = slice.rows[i];
  const dept = String(row[S.dept] || "");
  if (dept === "motos") return "motos";
  if (KIT_DEPTS.has(dept)) return null;                 /* a fight shop's rash guard is kit */
  const a = slice.top.get(i) || "";
  if (a === "t-trajes_bano") return "bano";
  if (/^t-ropa/.test(a) && (slice.subs.get(i) || []).some((x) => x.a === "t-ropa" && x.s === "swim")) return "bano";
  return null;
}

/* Every candidate card of one carousel, grouped by store, in source order.
   Each card carries its source's product type (_type) and the feed's
   class (_ty) for the audit's rules; clean() drops them. */
function candidates(c, stores, root) {
  const by = {};
  const C = classifierOf(root);
  const push = (store, cd) => {
    if (!stores[store]) return;
    if (c.exclude && c.exclude(cd)) return;
    (by[store] = by[store] || []).push(cd);
  };
  if (c.src.feed) {
    for (const f of readJSON(root, c.src.feed).items || []) {
      if (c.src.underwearOnly && f.ty !== "underwear") continue;
      if (c.src.underwearOnly) {
        const d = deptOfProduct(root, f.r, f.t);
        if (KIT_DEPTS.has(d) || OWN_CATEGORY_DEPTS.has(d)) continue;   /* sports bras, nursing bras */
      }
      const cd = card(f.t, f.b, Number(f.p), Number(f.o) || 0, f.img, f.r);
      cd._ty = f.ty;
      cd._type = f.sub || "";
      push(f.r, cd);
    }
  }
  if (c.src.depts) {
    for (const d of c.src.depts) {
      for (const r of readJSON(root, `assets/sections/departamento/_fn/${d}.json`).rows || []) {
        const fam = (c.src.families || c.src.notFamilies) ? C.classify({ name: r[D.name], type: r[D.type], retailer: r[D.store], brand: r[D.brand] }) : null;
        if (c.src.families && !c.src.families.includes(fam)) continue;
        if (c.src.notFamilies && c.src.notFamilies.includes(fam)) continue;
        const cd = card(r[D.name], r[D.brand], Number(r[D.price]), Number(r[D.was]) || 0, r[D.image], r[D.store]);
        cd._type = r[D.type] || "";
        if (c.src.gearFirst) cd._gear = FIGHT_GEAR_TYPES.has(r[D.type]) ? FIGHT_GEAR_CLASSES.findIndex(([, t]) => t.includes(r[D.type])) : 99;
        push(r[D.store], cd);
      }
    }
  }
  if (c.src.swim) {
    const want = "bano";
    for (const store of Object.keys(stores)) {
      const s = storeSlice(root, store);
      if (!s) continue;
      s.rows.forEach((r, i) => {
        if (r && sliceCategory(s, i) === want) { const cd = card(r[S.name], r[S.brand], Number(r[S.price]), Number(r[S.was]) || 0, r[S.image], store); cd._type = r[S.type] || ""; push(store, cd); }
      });
    }
  }
  /* Billeteras: every live store's own rows (the store pages' data),
     narrowed to wallets and card holders (isWallet) within the
     classifier's accessory families -- a wallet is never a toy, a book
     or a garment. */
  if (c.src.wallets) {
    const inDept = (d) => new Set((readJSON(root, `assets/sections/departamento/_fn/${d}.json`).rows || []).map((r) => r[D.store] + "::" + r[D.name]));
    const women = inDept("women"), men = inDept("men");
    for (const store of Object.keys(stores)) {
      const s = storeSlice(root, store);
      if (!s) continue;
      s.rows.forEach((r, i) => {
        if (!r) return;
        const cd = card(r[S.name], r[S.brand], Number(r[S.price]), Number(r[S.was]) || 0, r[S.image], store);
        cd._type = r[S.type] || "";
        const g = new Set((s.subs.get(i) || []).map((x) => x.g)), key = store + "::" + r[S.name];
        cd._aud = g.has("women") && !g.has("men") ? "mujer" : g.has("men") && !g.has("women") ? "hombre"
          : women.has(key) && !men.has(key) ? "mujer" : men.has(key) && !women.has(key) ? "hombre" : "unisex";
        if (!isWallet(cd)) return;
        if (!["accesorios", "carteras", "joyas"].includes(C.classify({ name: r[S.name], type: r[S.type], retailer: store, brand: r[S.brand] }))) return;
        push(store, cd);
      });
    }
  }
  return by;
}

/* A rail's order: fight gear first (by gear class), then -- in a carousel
   of clothes -- what a model wears before socks and accessories, then the
   deepest sale, then the source's own order. Photographed, priced,
   distinct. */
function railOf(list, c = {}) {
  const seen = new Set(), out = [];
  list.forEach((cd, i) => {
    if (!cd.image || !/^https?:\/\//.test(cd.image) || !(cd.price > 0) || !String(cd.title || "").trim()) return;
    const t = String(cd.title).trim().toLowerCase();
    if (seen.has(t)) return;
    seen.add(t);
    if (c.worn) cd._low = isSock(cd) || isAccessory(cd) ? 1 : 0;
    out.push({ cd, i });
  });
  out.sort((a, b) => ((a.cd._gear ?? 0) - (b.cd._gear ?? 0)) || ((a.cd._low ?? 0) - (b.cd._low ?? 0)) || (pctOf(b.cd) > 0) - (pctOf(a.cd) > 0) || (pctOf(b.cd) - pctOf(a.cd)) || (a.i - b.i));
  return out.map((x) => x.cd);
}
const clean = (cd) => { const o = {}; for (const [k, v] of Object.entries(cd)) if (k[0] !== "_") o[k] = v; return o; };

/* THE ONE SALE RULE (/sale-rule.js, the -NN% badge on every card): a
   5-70% markdown on the store's own was-price. Nothing invented. */
const sales = new Map();
export function saleRuleOf(root = ROOT) {
  if (!sales.has(root)) {
    const win = {};
    vm.runInNewContext(readFileSync(join(root, "sale-rule.js"), "utf8"), { window: win });
    sales.set(root, win.AriaSale);
  }
  return sales.get(root);
}
export const OFERTAS_MIN = 8;
export const WORN_LEAD = 4;
export const OFERTAS_CARDS = 16;

/* The pill row's order: the lead stores (in their order), then by depth,
   the tail stores last (live, never removed). */
function pillOrder(c, members) {
  const lead = c.lead || [], tail = c.tail || [];
  const rank = (m) => (lead.includes(m.k) ? lead.indexOf(m.k) - 100 : tail.includes(m.k) ? 100 + tail.indexOf(m.k) : 0);
  return members.slice().sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.label.localeCompare(b.label));
}

/* EVERY «TODAS» IS A MIX (Danny's standing rule): the carousel's opening
   (the lead store's first cards; Fight Club: Venum gloves, then Tatami
   gis), then one card per store in pill order, round after round, so no
   single store owns the window. */
function mixOf(c, members, max, pick = (m) => m.rail) {
  const lists = members.map((m) => ({ k: m.k, l: pick(m).slice() }));
  const out = [];
  const take = (k, test, n) => {
    const e = lists.find((x) => x.k === k);
    if (!e) return;
    for (let i = 0; i < e.l.length && n > 0; ) { if (test(e.l[i])) { out.push(e.l.splice(i, 1)[0]); n--; } else i++; }
  };
  if (c.fightLead) for (const [k, cls, n] of c.fightLead) take(k, (cd) => FIGHT_GEAR_CLASSES[cd._gear] && FIGHT_GEAR_CLASSES[cd._gear][0] === cls, n);
  else if (c.leadCards && c.lead) {
    const k = c.lead.find((s) => lists.some((x) => x.k === s));
    if (c.leadPrefer) take(k, (cd) => !cd._low && c.leadPrefer(cd), c.leadCards);
    take(k, () => true, c.leadCards - out.length);
  }
  while (out.length < max && lists.some((x) => x.l.length)) {
    for (const x of lists) if (x.l.length && out.length < max) out.push(x.l.shift());
  }
  return out;
}
/* Fight Club's «Todas» is fight gear only (the category truth). */
const todasPool = (c) => (m) => (c.src.gearFirst ? m.rail.filter((cd) => cd._gear < 99) : m.rail);

/* The lead card's photo (Bikinis: Montce's third photo, a model): the
   catalogue's own images[] for that product, read from the committed
   catalogues; absent, the card keeps its own photo. */
export function catalogueImages(root, store, title) {
  for (const f of readdirSync(root).filter((f) => /-catalog\.json$/.test(f))) {
    let j;
    try { j = readJSON(root, f); } catch { continue; }
    const r = j && j.retailers && j.retailers[store];
    if (!r) continue;
    let hit = null;
    const walk = (v) => {
      if (hit || !v || typeof v !== "object") return;
      if (Array.isArray(v)) { for (const x of v) walk(x); return; }
      if ((v.name === title || v.title === title) && Array.isArray(v.images)) { hit = v.images; return; }
      for (const x of Object.values(v)) walk(x);
    };
    walk(r);
    if (hit) return hit;
  }
  return [];
}

/* The carousels' default («Todas») rails as long candidate lists: the
   new carousels' file, and -- through scripts/build-home-shelves.mjs,
   which prices them with the page's own code -- the existing carousels'
   saved rails (category.json, joyas.json). */
export const DEFAULT_CANDIDATES = 250;

/** { carousels: [{ k, title, host, row, door, stores: [{ k, label, n, rail, sale }], todas, defaults, ofertas }], thin } */
export function buildCategoryPills(root = ROOT) {
  const stores = liveStorefronts(root);
  const sale = saleRuleOf(root);
  const isSale = (cd) => sale.isOnSale({ price: cd.price, originalPrice: cd.originalPrice });
  const thin = [];
  const carousels = CAROUSELS.map((c) => {
    const by = candidates(c, stores, root);
    if (c.audiences) return audienceCarousel(c, by, stores, isSale);
    let members = [];
    for (const [store, list] of Object.entries(by)) {
      let rail = railOf(list, c);
      if (rail.length < MIN_CARDS) { if (rail.length) thin.push(`${c.title}: ${stores[store]} (${rail.length})`); continue; }
      /* A carousel of clothes never opens a pill on socks or accessories:
         a store with fewer than WORN_LEAD worn pieces there gets no pill. */
      if (c.worn && rail.filter((cd) => !cd._low).length < WORN_LEAD) { thin.push(`${c.title}: ${stores[store]} (${rail.length}, solo medias/accesorios)`); continue; }
      /* The lead store's own pill opens like «Todas» does (leadPrefer). */
      if (c.leadPrefer && c.lead && c.lead[0] === store) rail = [...rail.filter((cd) => !cd._low && c.leadPrefer(cd)), ...rail.filter((cd) => cd._low || !c.leadPrefer(cd))];
      members.push({ k: store, label: stores[store], n: rail.length, rail, sale: c.ofertas === false ? [] : rail.filter(isSale) });
    }
    members = pillOrder(c, members);
    let todas = c.host === "new" ? mixOf(c, members, TODAS_CARDS, todasPool(c)) : null;
    if (todas && todas.length && c.leadPhoto != null) {
      const imgs = catalogueImages(root, todas[0].retailer, todas[0].title);
      if (imgs[c.leadPhoto] && /^https?:\/\//.test(imgs[c.leadPhoto])) todas[0] = { ...todas[0], image: imgs[c.leadPhoto], _photo: c.leadPhoto };
    }
    const defaults = c.host === "row" || c.host === "joyas" ? mixOf(c, members, DEFAULT_CANDIDATES, todasPool(c)) : null;
    const ofertas = c.ofertas === false ? [] : mixOf({ ...c, leadCards: 0, fightLead: null }, members, OFERTAS_CARDS, (m) => todasPool(c)({ rail: m.sale }));
    const ofertasN = members.reduce((n, m) => n + todasPool(c)({ rail: m.sale }).length, 0);
    return { ...c, stores: members, todas, defaults, ofertas, ofertasN };
  });
  return { carousels, thin, stores };
}

/* An audience carousel (Billeteras): «Todas» mixes every store; each
   audience pill is its own mix across the stores, sale items first in
   each store's turn. A pill needs MIN_CARDS. */
function audienceCarousel(c, by, stores, isSale) {
  const storeMembers = Object.entries(by).map(([k, list]) => ({ k, label: stores[k], rail: railOf(list, c) })).filter((m) => m.rail.length)
    .map((m) => ({ ...m, n: m.rail.length, sale: m.rail.filter(isSale) })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const members = [];
  for (const [a, label, door, doorTitle] of c.audiences) {
    const rail = mixOf({}, storeMembers, 1e6, (m) => m.rail.filter((cd) => cd._aud === a));
    if (rail.length < MIN_CARDS) continue;
    members.push({ k: a, label, n: rail.length, rail, sale: mixOf({}, storeMembers, 1e6, (m) => m.sale.filter((cd) => cd._aud === a)), aud: true, door, doorTitle });
  }
  const todas = mixOf(c, storeMembers, TODAS_CARDS);
  const ofertas = mixOf({}, storeMembers, OFERTAS_CARDS, (m) => m.sale);
  const ofertasN = storeMembers.reduce((n, m) => n + m.sale.length, 0);
  return { ...c, stores: members, storeMembers, todas, defaults: null, ofertas, ofertasN };
}

/* The department bucket the page's pricer reads for a weight estimate. */
const deptHint = (c) => (c.src.depts ? c.src.depts[0] : c.src.feed ? "underwear" : c.src.wallets ? "accessories" : "clothing");

/** The saved default rails the page paints for the existing carousels:
    { <category rail key | "joyas">: { dept, feed, gear, cards } }. */
export function defaultRails(built) {
  const out = {};
  for (const c of built.carousels) {
    if (!c.defaults || !c.defaults.length) continue;
    out[c.host === "joyas" ? "joyas" : c.row] = { k: c.k, dept: deptHint(c), feed: Boolean(c.src.feed), pageTest: c.row === "curvy", cards: c.defaults.map(clean) };
  }
  return out;
}

export function pillFiles(built) {
  const files = {};
  const labels = {};
  const index = { v: 2, min: MIN_CARDS, omin: OFERTAS_MIN, c: {} };
  for (const c of built.carousels) {
    if (!c.stores.length) continue;
    const entry = { t: c.title, s: c.stores.map((s) => [s.k, s.n, s.sale.length >= OFERTAS_MIN ? s.sale.length : 0]) };
    if (c.host === "new") entry.door = c.door || "";
    if (c.audiences) entry.a = 1;
    if (c.ofertas.length >= OFERTAS_MIN) entry.o = c.ofertasN;
    index.c[c.k] = entry;
    for (const s of c.stores) {
      labels[s.k] = s.label;
      const base = s.aud ? { v: 1, c: c.k, d: deptHint(c), aud: s.k, label: s.label, title: s.doorTitle, n: s.n, door: s.door }
        : { v: 1, c: c.k, d: deptHint(c), store: s.k, label: s.label, n: s.n, door: `/tienda.html?tienda=${s.k}` };
      files[`${c.k}-${s.k}.json`] = { ...base, cards: s.rail.slice(0, RAIL_CARDS).map(clean) };
      if (s.sale.length >= OFERTAS_MIN) files[`${c.k}-${s.k}-ofertas.json`] = { ...base, sale: 1, cards: s.sale.slice(0, OFERTAS_CARDS).map(clean) };
    }
    if (c.todas) files[`${c.k}-todas.json`] = { v: 1, c: c.k, d: deptHint(c), title: c.title, door: c.door || "", cards: c.todas.map(clean) };
    if (c.ofertas.length >= OFERTAS_MIN) files[`${c.k}-ofertas.json`] = { v: 1, c: c.k, d: deptHint(c), title: c.title, door: c.door || "", sale: 1, cards: c.ofertas.map(clean) };
  }
  index.labels = labels;
  files["index.json"] = index;
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = buildCategoryPills();
  const files = pillFiles(built);
  const dir = join(ROOT, PILLS_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(body));
  stampHomePhotos(ROOT, [PILLS_DIR]);
  for (const c of built.carousels) {
    if (c.storeMembers) console.log(`${"".padEnd(24)}    tiendas: ${c.storeMembers.map((s) => `${s.label} ${s.n}`).join(" | ")}`);
    console.log(`${c.title.padEnd(24)} ${String(c.stores.length).padStart(2)} tiendas: ${c.stores.map((s) => `${s.label} ${s.n}${s.sale.length >= OFERTAS_MIN ? "/" + s.sale.length : ""}`).join(" | ")}`);
    const first = (c.todas || c.defaults || [])[0];
    if (first) console.log(`${"".padEnd(24)}    «Todas» abre con: ${first.retailer} | ${first.title}${first._photo != null ? ` (foto images[${first._photo}])` : ""}; ofertas ${c.ofertas.length >= OFERTAS_MIN ? c.ofertasN : "no"}`);
  }
  if (built.thin.length) console.log("\nthin (no pill): " + built.thin.join(", "));
  const sizes = readdirSync(dir).map((f) => statSync(join(dir, f)).size);
  console.log(`\n${PILLS_DIR}: ${sizes.length} files, largest ${Math.max(...sizes)} B, index ${statSync(join(dir, "index.json")).size} B`);
}
