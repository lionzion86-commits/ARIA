/* ============================================================
   SEARCH, ON THE SERVER (2026-10-19, #409 fire order).

   "The phone asks a server a question; it never downloads the store."
   The first real customer searched "dolls" on an iPhone over Peruvian
   mobile data. search.html downloaded the whole catalogue index (33MB)
   to the phone before it could show anything, Safari reloaded the page
   about ten times, and the 396 cards it finally drew collapsed into
   lines and froze. She left.

   Now the index is loaded here, once per warm container, and each
   request gets one page of ranked cards:

     loadSearch()           the index + the site's engine + the pipeline
     searchPage(ctx, q, n)  page n (48 cards), the total, and what the
                            page should say (corrected spelling, a brand
                            we do not carry, "¿Quisiste decir?")

   Nothing about ranking is new. It is the same index.html engine
   (search-engine.js, generated) and the same Spanish pipeline
   (search-pipeline.js + assets/search/synonyms-es.json) the page ran,
   only no longer on the phone. The test suites call this module, so
   they test exactly what the endpoint answers.

   Files: shipped beside netlify/functions/search.js by netlify.toml
   included_files, found by probing (the bundled layout differs from the
   repo), like _price-index.js. No import.meta: Netlify's bundler
   compiles functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { cartLineFor, doorPrice, SMALL_ORDER_THRESHOLD_PEN, SMALL_ORDER_FEE_PEN } from "./_door-price.js";
import { deliveryFor, miamiRangeEs } from "../../scripts/lib/retailer-delivery.js";
import { isConsole } from "../../scripts/lib/tech-aisle.js";
import { conditionOfTitle } from "../../scripts/lib/condition.js";
import { cartShipping } from "../../scripts/lib/store-shipping.js";

export const PAGE_SIZE = 48;
/* How many ranked results a search keeps. The pipeline's own default
   is 500, which is why every big query used to report exactly 500. */
export const RESULT_LIMIT = 2000;
export const INDEX_FILE = "assets/search/catalog-index.json";
export const DICT_FILE = "assets/search/synonyms-es.json";
/* The auto-parts glossary Aria Auto and the assistant share (#416:
   "frenos" was answering with swimsuits). Its multi-word part names
   join the dictionary's phrases; see withPartsGlossary. */
export const GLOSSARY_FILE = "scripts/lib/es-en-parts-glossary.json";
const ENGINE_FILES = ["search-engine.js", "search-pipeline.js"];

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);

export function readRepoFile(rel) {
  for (const dir of CANDIDATES) {
    const p = join(dir, rel);
    try { if (existsSync(p)) return readFileSync(p, "utf8"); } catch { /* try the next */ }
  }
  throw new Error(`${rel} no está junto a la función de búsqueda`);
}

/* ---------- price math: the same as every page's cards ---------- */
/* Tiered marginal margin (2026-10-02) and per-retailer Miami sales tax
   (2026-10-09): (raw + tieredMarginUsd(raw)) x taxRate. These were
   search.html's own; price-parity-tests.mjs pins them to the SPA. */
function tieredMarginUsd(rawUsd){
  var r = Number(rawUsd);
  if (!(r > 0)) return 0;
  return Math.min(r,500)*0.24
       + Math.min(Math.max(r-500,0),1500)*0.18
       + Math.min(Math.max(r-2000,0),3000)*0.12
       + Math.max(r-5000,0)*0.08;
}
var TAX_EXEMPT = {"walmart": 1};
/* PRE-PRICED STORES (#443 item 32): the catalogue price is already Aria's
   price -- no margin, no Miami tax on top; the value is the factor that
   takes it back to the goods' true value (the import-tax base). One list,
   mirrored from weight-data.js PRE_PRICED (scripts/test/price-parity-tests.mjs). */
var PRE_PRICED = {"ariaperfumes": 1.18};
function salesTaxRate(retailer){ return TAX_EXEMPT[String(retailer || "").toLowerCase()] ? 1 : 1.07; }
function finalUsd(raw, retailer){ if (PRE_PRICED[String(retailer || "").toLowerCase()]) return Math.round(Number(raw) * 100) / 100; return Math.round((Number(raw) + tieredMarginUsd(raw)) * salesTaxRate(retailer) * 100) / 100; }
export { tieredMarginUsd, salesTaxRate, finalUsd, TAX_EXEMPT };

/* ---------- the engine, in its own realm ---------- */
export function loadEngine(read = readRepoFile) {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ENGINE_FILES) vm.runInContext(read(f), sandbox, { filename: f });
  const S = sandbox.window.AriaSearch, P = sandbox.window.AriaSearchPage;
  if (!S || typeof S.rankCatalogMatches !== "function") throw new Error("search-engine.js no cargó");
  if (!P || typeof P.run !== "function") throw new Error("search-pipeline.js no cargó");
  return { S, P };
}

/* Index rows -> the product objects the engine ranks. */
export function productsFromIndex(index) {
  const at = {};
  index.fields.forEach((n, i) => { at[n] = i; });
  const rows = index.rows, out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    out[i] = {
      id: r[at.id], name: r[at.title], title: r[at.title], brand: r[at.brand] || "",
      price: r[at.price], originalPrice: r[at.originalPrice] || null,
      onSale: r[at.onSale] === 1, departments: r[at.department] ? [r[at.department]] : [],
      finalPrice: r[at.finalPrice] === 1, image: r[at.image], url: "",
      retailer: r[at.retailer] || "", _cat: r[at.cat] || null,
      reviews: r[at.reviews] || 0, rating: r[at.rating] || 0,
      ph: at.ph != null ? (r[at.ph] || 0) : 0,
    };
  }
  return out;
}

/* "FRENOS" WAS ANSWERING WITH SWIMSUITS (2026-10-19, #416 battery).
   The dictionary did not know "frenos", so the pipeline's typo fixer
   moved it one letter to "ternos" (suits) and the engine found
   swimwear; "pastillas de freno" and "discos de freno" did the same.
   The site already keeps the canonical Spanish names of car parts in
   one place, the Aria Auto glossary. Every MULTI-WORD name in it
   ("pastillas de freno", "filtro de aceite", "bujías de encendido")
   becomes a dictionary phrase here -- unambiguous, so it can never
   take over a shopping word. Single words stay in the dictionary's own
   "auto" section, chosen by hand: the glossary's single words include
   "clutch" (a handbag too) and "batería" (a phone's too). A phrase the
   dictionary already defines keeps its own meaning. */
export function withPartsGlossary(dict, glossary) {
  const entries = (glossary && Array.isArray(glossary.entries)) ? glossary.entries : [];
  if (!entries.length) return dict;
  const phrases = { ...((dict && dict.phrases) || {}) };
  const have = new Set(Object.keys(phrases).map((k) => brandKey(k)));
  for (const e of entries) {
    const en = (Array.isArray(e.en) ? e.en : [e.en]).filter(Boolean).map(String);
    if (!en.length) continue;
    for (const es of [e.es, ...(e.synonyms_es || [])]) {
      const k = brandKey(es);
      if (!k || k.indexOf(" ") < 0 || have.has(k)) continue;
      have.add(k);
      phrases[k] = en.length === 1 ? en[0] : en;
    }
  }
  return { ...dict, phrases };
}

/* Everything a search needs, built once. `index` and `dict` may be
   passed in (tests); otherwise they are read from beside the function. */
export function buildSearchContext({ index, dict, glossary, read = readRepoFile, labels = {} } = {}) {
  const { S, P } = loadEngine(read);
  index = index || JSON.parse(read(INDEX_FILE));
  dict = dict || JSON.parse(read(DICT_FILE));
  if (glossary === undefined) {
    try { glossary = JSON.parse(read(GLOSSARY_FILE)); } catch { glossary = null; }
  }
  dict = withPartsGlossary(dict, glossary);
  const products = productsFromIndex(index);
  S.buildSearchWordIndex(products);
  const stores = [...new Set(products.map((p) => p.retailer).filter(Boolean))];
  /* Store names and logos (the index's `stores` table); the label map
     search.js passes wins for the name. */
  const storeInfo = index.stores || {};
  return {
    S, P, products, labels, storeInfo,
    retailers: stores.map((k) => ({ key: k, label: k })),
    dict: P.prepare(dict, S, products),
    resultLimit: RESULT_LIMIT,
    generatedAt: index.generatedAt || null,
    cache: new Map(),
  };
}

let shared = null;
/** The warm container's context; built on the first request. */
export function loadSearch(opts) {
  if (!shared) shared = buildSearchContext(opts);
  return shared;
}

/* Spelling kept for the cache key only: case, spaces. */
const cacheKey = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").trim();
const CACHE_MAX = 200;

/** The whole ranked answer for one query (cached per container). */
export function runQuery(ctx, q) {
  const key = cacheKey(q);
  const hit = ctx.cache.get(key);
  if (hit) { ctx.cache.delete(key); ctx.cache.set(key, hit); return hit; }
  let r;
  try {
    r = ctx.P.run({ S: ctx.S, products: ctx.products, retailers: ctx.retailers, dict: ctx.dict, resultLimit: ctx.resultLimit }, q);
    if (r && r.state === "results") {
      r.hits = deviceLead(q, toysLead(r.hits));
      r._device = isDeviceQuery(q);
      /* The category the query names (#443 c.6544117193): the lanes show
         only it, as the grid's lead does. A strict category with none of
         its kind in stock says so rather than showing lookalikes. */
      const cat = categoryOf(q);
      if (cat) r._pure = cat.test;
      if (!r.hits.length) r = { ...r, state: "none", hits: [] };
    }
  } catch (e) {
    r = { state: "error", hits: [], error: String(e && e.message || e) };
  }
  ctx.cache.set(key, r);
  if (ctx.cache.size > CACHE_MAX) ctx.cache.delete(ctx.cache.keys().next().value);
  return r;
}

/* THE DEVICE LEADS A DEVICE SEARCH (#443 search audit F6). «celular»
   opened on twelve phone cases: a case names the phone it fits, so it
   ranked with the phone. For a device word the device itself -- its name
   says what it is and it is not what fits one -- comes first; the cases,
   chargers and mounts follow, each part in the engine's order. */
const DEVICE_QUERIES = [
  /* Phones and laptops are named in the title's head: a gaming headset
     "for PC, PS5, Smartphone", a "Smartphone VR Headset", a "Learning
     Phone" toy, a "Laptop Desk Tray" only mention one. */
  [/^(celular(es)?|telefonos?( celular(es)?)?|smartphones?|moviles?|phones?|cell ?phones?)$/, /\b(iphone \d+\w*|iphone se|galaxy [sza]\d+|galaxy z|pixel \d+\w*|moto ?(g|edge|razr)|razr|smartphone|cell ?phone|unlocked)\b/i, (p) => headDevice(p, /\b(iphone \d+\w*|iphone se|galaxy [sza]\d+|galaxy z|pixel \d+\w*|moto ?(g|edge|razr)|razr|smartphones?|(cell ?|smart ?|android |rugged |flip )phones?|unlocked)\b/i)],
  [/^(laptops?|computadoras?( portatil(es)?)?|notebooks?|portatil(es)?|chromebooks?)$/, /\b(laptops?|notebooks?|chromebooks?|macbook|vivobook|zenbook|ideapad|thinkpad)\b/i, (p) => headDevice(p, /\b(laptops?|notebooks?|chromebooks?|macbook|vivobook|zenbook|ideapad|thinkpad)\b/i)],
  /* A console query leads with the console itself: the title OPENS on
     the console ("Nintendo Switch 2 System", "Meta Quest 3 512GB"); a
     game or a headset only names the console it plays on (#443
     c.6544117193: "Riders Republic Xbox Series X|S" and an Xbox headset
     sat among the consoles). */
  [/^(consolas?( de videojuegos?)?|videoconsolas?|consoles?)$/, null, (p) => isConsoleTitle(p.title)],
  /* A camera search is cameras: a camera drone flies, it is not one. */
  [/^(camaras?( de fotos?)?|camaras? fotograficas?|cameras?)$/, /\b(cameras?|mirrorless|dslr|gopro|instax|camcorders?|osmo)\b/i, (p) => /\b(cameras?|mirrorless|dslr|gopro|instax|camcorders?|osmo)\b/i.test(p.title || "") && !isAccessoryName(p.title) && !DRONE_RX.test(p.title || "")],
  [/^(tablets?|tabletas?|ipads?)$/, /\b(tablets?|ipad( air| pro| mini)?|galaxy tab|fire (hd|max)|kindle)\b/i],
  [/^(audifonos|auriculares|headphones|earbuds)$/, /\b(headphones?|earbuds?|airpods|headsets?|earphones?)\b/i],
  [/^(relojes? inteligentes?|smart ?watch(es)?|smartwatch(es)?)$/, /\b(smart ?watch(es)?|apple watch|galaxy watch|pixel watch|fitbit|garmin)\b/i],
  /* CATEGORY PURITY (#443 c.6544117193). A query that names a kind of
     product is that kind only: these three keep nothing else -- no
     lookalike that merely mentions the word ("Pajama Pants - Dumbbell
     Print", a "Dumbbell" baby rattle, a body keratin spray, a snorkel
     mask). Fourth field: strict. */
  [/^(pesas?|pesas rusas|mancuernas?|dumbbells?|kettlebells?|barbells?|discos de pesas?)$/, null, (p) => isWeight(p), true],
  [/^(keratinas?|keratin|tratamientos? de keratina|keratina (capilar|brasilena))$/, null, (p) => isHairKeratin(p), true],
  [/^(mascarillas?( (capilar(es)?|facial(es)?|para (el )?(cabello|pelo|cara|rostro)))?|hair masks?|face masks?|sheet masks?)$/, null, (p) => isBeautyMask(p), true],
];
/* What fits a device, by the title's head noun -- the words before "with",
   "for" or a dash ("Death Lens Impact Phone Case - iPhone 16" is a case). */
const ACCESSORY_HEAD_RX = /\b(cases?|covers?|folio|screen protectors?|tempered glass|chargers?|charging (cable|cord|pad|stand|dock)|cables?|cords?|adapters?|power banks?|batter(y|ies)|mounts?|stands?|holders?|grips?|gimbals?|straps?|bands?|skins?|sleeves?|bags?|backpacks?|stylus|hubs?|docks?|docking station|keyboards?|mouse|mice|controllers?|gamepads?|lens(es)?|tripods?|memory cards?|sd cards?)\b/i;
/* ...or an accessory noun the title closes on, or that names what it
   fits ("... Clear Phone Case For iPhone 17", "... Smartphone Pouch"). */
const ACCESSORY_TAIL_RX = /\b(cases?|covers?|folio|screen protectors?|chargers?|holders?|mounts?|grips?|gimbals?|pouch(es)?|skins?|sleeves?|stands?|cables?)\b(?=\s+(?:for|compatible|fits|with)\b|\s*[-\u2013|,(]|\s*$)/i;
const titleHead = (t) => String(t || "").split(/\s+(?:with|for|compatible|fits)\s+|\s+[-\u2013|,(]\s*/i)[0];
function isAccessoryName(name) {
  const t = String(name || "");
  return ACCESSORY_HEAD_RX.test(titleHead(t)) || ACCESSORY_TAIL_RX.test(t);
}
/* Not the device, though its head names it. */
const NOT_THE_DEVICE_RX = /\b(wallets?|purses?|no cell phones|headsets?|headphones?|earbuds?|vr|glasses|speakers?|learning|pretend|toys?|trays?|desks?|tables?|bags?|backpacks?)\b/i;
function headDevice(p, rx) {
  const t = String(p.title || "");
  return rx.test(titleHead(t)) && !isAccessoryName(t) && !NOT_THE_DEVICE_RX.test(t) && !NOT_A_DEVICE_RX.test(t) && !isToyDept(p);
}
const DRONE_RX = /\b(drones?|quadcopters?|fpv)\b/i;
/* The console names itself first; a "Choose Your Game Bundle" is still
   the console, a "Game" otherwise is software. */
const CONSOLE_START_RX = /^(?:(?:new|sony|microsoft|valve|meta|nintendo|asus|lenovo|msi)\s+)*(?:playstation\s*(?:5|portal|vr\s*2)|ps5|xbox series [xs]|nintendo switch|switch 2|steam deck|rog ally|legion go|(?:meta\s+)?quest\s*\d)/i;
const NOT_CONSOLE_RX = /\b(games?|edition|controllers?|joy-?cons?|amiibo|cases?|screen protectors?|protectors?|chargers?|charging|docks?|grips?|skins?|stands?|cards?|wheels?|subscription|membership|gift|headsets? for)\b|\((?:nintendo|xbox|ps5|playstation)[^)]*\)/i;
export function isConsoleTitle(title) {
  const t = String(title || "").replace(/[\u2122\u00ae]/g, "").replace(/\bchoose your game bundle\b/i, "bundle");
  /* "Nintendo Switch Sports - Nintendo Switch [Physical]": the platform
     after the dash, or a [Physical] / [Digital] tag, is a game's. */
  if (/\s[-\u2013]\s*(nintendo|switch|xbox|ps5|playstation)\b|\[(physical|digital)\]/i.test(t)) return false;
  return CONSOLE_START_RX.test(t) && !NOT_CONSOLE_RX.test(titleHead(t)) && !NOT_A_DEVICE_RX.test(t);
}
/* Pesas: the weight itself, by the thing the title names (its head). */
const WEIGHT_RX = /\b(dumbbells?|kettle ?bells?|barbells?|weight plates?|bumper plates?|ankle weights?|wrist weights?|hand weights?|free weights?|weight sets?|weighted vests?)\b/i;
const NOT_WEIGHT_RX = /\b(rattles?|baby|toys?|prints?|pajamas?|tees?|t-?shirts?|shirts?|hoodies?|gloves?|racks?|stands?|holders?|socks?|keychains?|necklaces?|pendants?|charms?|decals?|stickers?|mugs?)\b/i;
export function isWeight(p) {
  const t = String(p.title || "");
  return WEIGHT_RX.test(titleHead(t)) && !NOT_WEIGHT_RX.test(t) && !isToyDept(p);
}
/* Keratina: the hair product -- not a body or skin spray, not the comb
   or the apron a keratin brand also sells. */
const NOT_HAIR_KERATIN_RX = /\b(body|skin|nails?|lash(es)?|brows?|aprons?|combs?|brush(es)?|capes?|gloves?|clips?|bowls?|applicators?|flat irons?|irons?|dryers?|towels?|bags?)\b/i;
export function isHairKeratin(p) {
  const t = String(p.title || "");
  return /\bkeratin\b/i.test(t) && !NOT_HAIR_KERATIN_RX.test(t);
}
/* Mascarilla: a hair or face treatment mask. Not a sleep or cooling eye
   mask, a cloth or neoprene face cover, a snorkel, goggle or helmet
   mask, a costume, or a garment printed with one. */
const MASK_RX = /\b(masks?|masques?|mascarillas?)\b/i;
const NOT_BEAUTY_MASK_RX = /\b(eye masks?|sleep(ing)? masks? for|snorkel(ing)?|scuba|diving|dive|goggles?|helmet|neoprene|ski|balaclava|costume|halloween|ghost ?face|funko|cardstock|printed face masks|pajamas?|hoodies?|tees?|shirts?|pants|respirator|n95|kn95|disposable|surgical|cloth|gaiter|welding|paintball|hockey|catcher)\b/i;
const BEAUTY_DEPT_RX = /^(beauty|cab_|belleza|skincare|haircare)/i;
export function isBeautyMask(p) {
  const t = String(p.title || "");
  if (!MASK_RX.test(t) || NOT_BEAUTY_MASK_RX.test(t)) return false;
  const d = (p.departments && p.departments[0]) || "";
  return BEAUTY_DEPT_RX.test(d) || /\b(hair|sheet|facial|skin|hydrat\w*|serum|clay|peel|treatment|overnight|hyaluronic|collagen|retinol)\b/i.test(t);
}
/* What names a device without being one: a console's repair kit, a skin. */
const NOT_A_DEVICE_RX = /\b(repair|kits?|tools?|skins?|stands?|replacement|covers?|decals?|stickers?|parts?)\b/i;
const deaccent = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
export function isDeviceQuery(q) { const k = deaccent(q); return DEVICE_QUERIES.some(([qx]) => qx.test(k)); }
/* Asking for the accessory ("funda celular", "cargador iphone"): what fits
   the device leads, the device itself follows. */
const ACCESSORY_QUERY_RX = /\b(fundas?|forros?|estuches?|cases?|covers?|cargador(es)?|chargers?|micas?|protector(es)?|cables?|soportes?|holders?)\b/;
/* The device the shopper named, and how a title names it. */
const ACCESSORY_DEVICES = [
  [/\b(celular(es)?|telefonos?|movil(es)?|iphone|samsung|galaxy|pixel|motorola|smartphones?|phones?)\b/, /\b(phones?|iphone|galaxy|pixel|smartphones?|magsafe|motorola|moto g)\b/i],
  [/\b(laptops?|computadoras?|portatil(es)?|macbook|notebooks?|chromebooks?)\b/, /\b(laptops?|macbook|notebooks?|chromebooks?)\b/i],
  [/\b(tablets?|tabletas?|ipads?)\b/, /\b(tablets?|ipad|galaxy tab)\b/i],
  [/\b(consolas?|switch|ps5|playstation|xbox)\b/, /\b(switch|ps5|playstation|xbox|quest)\b/i],
  [/\b(audifonos|auriculares|airpods|earbuds)\b/, /\b(airpods|earbuds|headphones)\b/i],
];
export function accessoryLead(q, hits) {
  const k = deaccent(q);
  const dev = ACCESSORY_QUERY_RX.test(k) && ACCESSORY_DEVICES.find(([qx]) => qx.test(k));
  if (!dev || !Array.isArray(hits) || hits.length < 2) return hits;
  const acc = [], fits = [], rest = [];
  for (const p of hits) {
    const t = p.title || "";
    (dev[1].test(t) ? (isAccessoryName(t) ? acc : fits) : rest).push(p);
  }
  return acc.concat(fits, rest);
}
/** The category a query names, if it names one: { test(p), strict }. */
export function categoryOf(q) {
  const k = deaccent(q);
  const hit = DEVICE_QUERIES.find(([qx]) => qx.test(k));
  if (!hit) return null;
  const [, rx, pred, strict] = hit;
  return { test: pred || ((p) => rx.test(p.title || "") && !isAccessoryName(p.title)), strict: !!strict };
}
export function deviceLead(q, hits) {
  const cat = categoryOf(q);
  if (!cat || !Array.isArray(hits) || !hits.length) return accessoryLead(q, hits);
  /* A strict category keeps only its own kind. */
  if (cat.strict) return hits.filter(cat.test);
  if (hits.length < 2) return hits;
  const dev = [], rest = [], last = [];
  for (const p of hits) {
    const t = p.title || "";
    if (NOT_A_DEVICE_RX.test(t)) last.push(p);
    else (cat.test(p) ? dev : rest).push(p);
  }
  return dev.concat(rest, last);
}

/* ==================================================================
   THE PRODUCT LEADS, ITS ACCESSORIES FOLLOW (#443 c.6619999990,
   c.6620006778 -- Danny's live repro: «iPhone» opened on Zagg cases,
   VR headsets "for iPhone & Android" and generic smartwatches, with
   not one iPhone in front, though the catalogue sells them). A case
   names the phone it fits, so word matching ranked every "Case for
   iPhone 16" with the phone, and the phones -- a dozen against a
   hundred accessories -- never led.

   A query that names a CORE PRODUCT of one maker (iPhone, iPad,
   MacBook, AirPods, iMac: Apple's) is that maker's world, structured
   like a brand search:
     1. the product itself (the maker's own devices that the title names
        as the product, not what fits it), the model typed first -- the
        comparison charts group them per model;
     2. the accessories made for it, one carousel per kind (cases,
        screen protectors, chargers and cables, mounts), always after the
        product; a universal one ("for iPhone & Android") is not its own;
     3. one rail per store that sells the maker's real inventory: the
        maker's brand only, never a namesake's jeans (Apple Bottoms) and
        never a stray title word.
   Nothing else: the answer is exactly these products. Asking for the
   accessory («funda iphone», «cargador iphone») is not this: the
   accessory leads (accessoryLead). The router sends these queries to
   the maker's page focused on the product (_search-destinations.js),
   whose Comparador and rails are this answer.
   ================================================================== */
const WORLD_FILLER = new Set("de del para el la los las con y en un una unos unas mi por al the for and with of a an nuevo nueva nuevos nuevas new original originales barato baratos barata baratas".split(" "));
/* The words for the product's kind, which add nothing beside its name
   («celular iphone», «iphone smartphone»). */
const WORLD_KIND_RX = /^(celular(es)?|telefonos?|smartphones?|moviles?|phones?|cell|cellphones?|tablets?|tabletas?|laptops?|computadoras?|portatil(es)?|notebooks?|audifonos|auriculares|earbuds|headphones|apple)$/;
const WORLD_ACCESSORY_KINDS = [
  { k: "fundas", title: "Fundas", rx: /\b(cases?|covers?|folio|bumpers?|snap|skins?|sleeves?|fundas?)\b/i },
  { k: "protectores", title: "Protectores de pantalla", rx: /\b(screen protectors?|tempered glass|glass elite|privacy glass|lens protectors?|protector)\b/i },
  { k: "cargadores", title: "Cargadores y cables", rx: /\b(chargers?|charging|power banks?|battery packs?|cables?|cords?|adapters?)\b/i },
  { k: "soportes", title: "Soportes", rx: /\b(mounts?|holders?|stands?|grips?|kickstands?|docks?|ring holders?)\b/i },
];
/* A universal accessory names other makers' devices too. */
const UNIVERSAL_RX = /\b(android|samsung|galaxy|pixel|motorola|xiaomi|huawei|windows|chromebook|universal)\b/i;
/* Products in their own right that only say they work with it. */
const NOT_AN_ACCESSORY_RX = /\b(speakers?|headphones?|earbuds?|earphones?|headsets?|vr|smart ?watch(es)?|fitness trackers?|hard drives?|ssd|flash drives?|projectors?|grip tape)\b/i;
const TECH_DEPT_RX = /^(tech_|electronic)/i;
const FASHION_DEPT_RX = /^(moda|clothing|ropa|women|men|mens|kids|shoes|footwear|calzado|jewel|joyas|beauty|belleza|perfum|fragan)/i;
export const CORE_WORLDS = [
  { id: "iphone", word: "iphone", label: "iPhone", maker: "Apple", brands: ["apple", "iphone"],
    device: /\biphone\s*(\d{1,2}e?|se|xr|xs|x|air)\b/i, fits: /\biphone\b/i, techFits: /\b(magsafe|lightning)\b/i },
  { id: "ipad", word: "ipad", label: "iPad", maker: "Apple", brands: ["apple"], device: /\bipad\b/i, fits: /\bipad\b/i },
  { id: "macbook", word: "macbook", label: "MacBook", maker: "Apple", brands: ["apple"], device: /\bmacbook\b/i, fits: /\bmacbook\b/i },
  { id: "airpods", word: "airpods", label: "AirPods", maker: "Apple", brands: ["apple"], device: /\bairpods\b/i, fits: /\bairpods\b/i },
  { id: "imac", word: "imac", label: "iMac", maker: "Apple", brands: ["apple"], device: /\bimac\b/i, fits: /\bimac\b/i },
];
/** The core product a query names, or null: { world, model, shown, words }
    -- model is the product's name and what follows it ("iphone 16 pro"),
    shown the same as the page writes it ("iPhone 16 pro"). */
export function coreWorldOf(q) {
  const k = deaccent(q).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!k || ACCESSORY_QUERY_RX.test(k)) return null;
  /* "i phone", "i-pad", "air pods", "mac book"; plurals. */
  const joined = k.replace(/\b(iphone|ipad|imac)(\d)/g, "$1 $2").replace(/\bi (phone|pad|mac)\b/g, "i$1").replace(/\bair pods?\b/g, "airpods").replace(/\bmac book\b/g, "macbook")
    .replace(/\b(iphone|ipad|macbook|imac)s\b/g, "$1").replace(/\bairpod\b/g, "airpods");
  const words = joined.split(" ").filter((w) => w && !WORLD_FILLER.has(w));
  let i = 0;
  while (i < words.length && WORLD_KIND_RX.test(words[i])) i++;
  const world = CORE_WORLDS.find((w) => w.word === words[i]);
  if (!world) return null;
  /* What follows the name is the model: numbers and model words -- a
     kind word there adds nothing («iphone celular»). */
  const model = words.slice(i + 1).filter((w) => !WORLD_KIND_RX.test(w));
  if (model.length > 4) return null;
  return { world, model: [world.word, ...model].join(" "), shown: [world.label, ...model].join(" "), words: model };
}
const modelRx = (words) => words.map((w) => new RegExp("\\b" + w.replace(/[^a-z0-9]/g, "") + "\\b", "i"));
function worldSets(ctx, world) {
  const memo = ctx._worlds || (ctx._worlds = new Map());
  if (memo.has(world.id)) return memo.get(world.id);
  const ours = (p) => world.brands.includes(brandKey(p.brand)) && !FASHION_DEPT_RX.test((p.departments && p.departments[0]) || "");
  const devices = [], accessories = [], maker = [];
  for (const p of ctx.products) {
    if (!p.image) continue;
    const t = String(p.title || "");
    const mine = ours(p);
    if (mine) maker.push(p);
    /* The maker's own product: its title's head names no accessory (an
       "AirPods Pro 2 ... with Charging Case" is the earbuds). */
    if (mine && world.device.test(t) && !ACCESSORY_HEAD_RX.test(titleHead(t)) && !NOT_A_DEVICE_RX.test(t) && !/\b(for|compatible with|fits)\s+(apple\s+)?(iphone|ipad|macbook|airpods|imac)\b/i.test(t)) devices.push(p);
    else if ((world.fits.test(t) || (world.techFits && world.techFits.test(t) && TECH_DEPT_RX.test((p.departments && p.departments[0]) || "")))
      && !UNIVERSAL_RX.test(t) && !NOT_AN_ACCESSORY_RX.test(t) && !isToyDept(p)) {
      const kind = WORLD_ACCESSORY_KINDS.find((x) => x.rx.test(t));
      if (kind && (isAccessoryName(t) || kind.k === "fundas" || kind.k === "protectores")) accessories.push({ p, kind: kind.k });
    }
  }
  const out = { devices, accessories, maker };
  memo.set(world.id, out);
  return out;
}
/* The model typed first, then the dearest (the current line) first. */
function modelFirst(list, words, priceOf = (p) => Number(p.price) || 0) {
  const rxs = modelRx(words);
  const score = (p) => rxs.filter((rx) => rx.test(p.title || "")).length;
  return list.map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => (b.s - a.s) || (priceOf(b.p) - priceOf(a.p)) || (a.i - b.i)).map((x) => x.p);
}
/** The world's answer: { devices, accessories: [{ k, title, items }], stores: [[store, items]], hits }. */
export function worldAnswer(ctx, cw) {
  const { world, words } = cw;
  const S = worldSets(ctx, world);
  const devices = modelFirst(S.devices, words);
  const isDev = new Set(devices);
  const accessories = [];
  for (const kind of WORLD_ACCESSORY_KINDS) {
    const items = modelFirst(S.accessories.filter((a) => a.kind === kind.k).map((a) => a.p), words, () => 0);
    if (items.length) accessories.push({ k: kind.k, title: kind.title + " para " + world.label, items });
  }
  const isAcc = new Set(accessories.flatMap((a) => a.items));
  /* Each store's real inventory of the maker: the product first, then
     what the maker makes for it, then the rest of the maker's line. */
  const byStore = new Map();
  for (const p of S.maker) { if (!byStore.has(p.retailer)) byStore.set(p.retailer, []); byStore.get(p.retailer).push(p); }
  const stores = [...byStore.entries()].map(([store, l]) => {
    const dev = devices.filter((p) => p.retailer === store);
    const acc = l.filter((p) => isAcc.has(p) && !isDev.has(p));
    const rest = l.filter((p) => !isDev.has(p) && !isAcc.has(p))
      .map((p, i) => ({ p, i, d: onSaleOf(p) ? discountOf(p) : -1 })).sort((a, b) => (b.d - a.d) || (a.i - b.i)).map((x) => x.p);
    return { store, dev: dev.length, items: dev.concat(acc, rest) };
  }).sort((a, b) => (b.dev - a.dev) || (b.items.length - a.items.length) || (a.store < b.store ? -1 : 1));
  const seen = new Set(), hits = [];
  for (const p of [...devices, ...accessories.flatMap((a) => a.items), ...stores.flatMap((s) => s.items)]) if (!seen.has(p)) { seen.add(p); hits.push(p); }
  return { world, devices, accessories, stores, hits };
}

/* TOYS LEAD A TOY SEARCH (2026-10-19, #416 battery). "barbie" and
   "lego" opened with Barbie- and LEGO-branded girls' dresses and a
   toddler sweatshirt ahead of the dolls and the sets: the engine ranks
   a title that starts with the brand the same whether it is a doll or a
   T-shirt. Whether a search is a toy search is read from its own
   answer, not from a list of names: when most of what it found sits in
   the stores' toy departments (Barbie 282 of 293, LEGO 668 of 669, Hot
   Wheels 36 of 45, Pokémon 452 of 567), the toys lead and everything
   else -- the branded apparel, the pajamas -- follows, each part in the
   engine's order. "disney" (half toys, half jewellery and tees) is not
   a toy search and is left alone. */
const TOY_DEPT = /toy|juguete/i;
const TOY_SHARE = 0.5, TOY_MIN = 10;
export function isToyDept(p) { return TOY_DEPT.test((p.departments && p.departments[0]) || ""); }
export function toysLead(hits) {
  if (!Array.isArray(hits) || !hits.length) return hits;
  let toys = 0;
  for (const p of hits) if (isToyDept(p)) toys++;
  if (toys < TOY_MIN || toys / hits.length < TOY_SHARE || toys === hits.length) return hits;
  const lead = [], rest = [];
  for (const p of hits) (isToyDept(p) ? lead : rest).push(p);
  return lead.concat(rest);
}

/* ¿QUISISTE DECIR? (2026-10-19, #416). "shor" flooded 2,000 prefix
   matches with no word about it; "shore" showed Cape Shore magnets to a
   shopper who almost certainly meant shorts. When a word of the query is
   rare in the catalogue (or not a word in it at all) and a far more common
   catalogue word completes it ("shor" -> short...) or is one or two typos
   away ("shore" -> short), the page offers it as a tappable chip. The
   results stay: the chip is an offer, never a redirect. Plurals win when
   the catalogue uses them ("shorts", not "short"). Numbers and words the
   engine already corrected out loud are left alone. */
const DYM_RARE = 50;          // a word in fewer products than this is suspect
const DYM_COMMON = 200;       // a suggestion must be in at least this many
const DYM_RATIO = 20;         // ...and this many times more than the typed word
export function didYouMean(ctx, q, r) {
  if (!r || r.state !== "results" || r.shown) return null;
  const S = ctx.S, windex = ctx.products && ctx.products._windex;
  if (!windex || typeof S.searchTokens !== "function" || typeof S.fuzzyEditDist !== "function") return null;
  const toks = S.searchTokens(q);
  if (!toks.length || toks.length > 3) return null;
  const freq = (w) => { const l = windex.get(w); return l ? l.length : 0; };
  /* A whole brand name is a name, not a typo ("levis" is Levi's). A
     word that is only part of one ("shore" in Cape Shore) is still
     open to the question. */
  if (!ctx.brandWords) {
    ctx.brandWords = new Set();
    for (const p of ctx.products) if (p.brand) ctx.brandWords.add(S.searchTokens(p.brand).join(""));
  }
  let changed = false;
  const out = toks.map((t) => {
    if (t.length < 3 || /\d/.test(t) || ctx.brandWords.has(t)) return t;
    const own = freq(t);
    if (own >= DYM_RARE) return t;
    /* Two typos only in long words: "lizzie" is not "sizes". */
    const maxD = t.length >= 7 ? 2 : 1;
    let best = null;
    for (const [w, list] of windex) {
      const n = list.length;
      if (w === t || n < Math.max(DYM_COMMON, own * DYM_RATIO) || /\d/.test(w)) continue;
      let d;
      if (own === 0 && w.length > t.length && w.startsWith(t)) d = 0;
      else if (Math.abs(w.length - t.length) <= maxD) d = S.fuzzyEditDist(t, w, maxD);
      else continue;
      if (d > maxD) continue;
      if (!best || d < best.d || (d === best.d && n > best.n)) best = { w, d, n };
    }
    if (!best) return t;
    const plural = best.w + "s";
    const word = !best.w.endsWith("s") && freq(plural) >= best.n * 0.2 ? plural : best.w;
    if (word === t) return t;
    changed = true;
    return word;
  });
  return changed ? out.join(" ") : null;
}

/* TAMBIÉN PRUEBA (#443 c.6567346916, Danny's live search audit). The
   same name written two ways -- "all star" / "allstar", "air force" /
   "airforce" -- can find different stock, and a shopper who typed the
   thinner form thinks that is all Aria has. Each other spelling of the
   query the index itself knows (two of its words joined, or one word
   split into two words the index carries) is run; a form that finds
   materially more is offered, one tap away. Same set: no suggestion. */
const ALSO_TRY_MIN_FREQ = 3;     // a word the index carries at least this often
const ALSO_TRY_MIN_GAIN = 5;     // and the other form finds at least this many more
const ALSO_TRY_RATIO = 1.2;      // ...and at least 20% more
const ALSO_TRY_SPLIT_RARE = 20;  // only a word the index rarely carries is split
const ALSO_TRY_PART = 3;         // and only into parts of 3+ letters
/** The other spellings of a query that the index itself carries: two
    neighbouring words joined ("all star" -> "allstar"), or one rarely
    carried word split into two 3+ letter words it carries ("allstar" ->
    "all star"). A hyphen is already a space to the tokenizer, so
    "all-star" is "all star". */
export function spellingForms(ctx, q) {
  const S = ctx.S, windex = ctx.products && ctx.products._windex;
  if (!windex || typeof S.searchTokens !== "function") return [];
  const toks = S.searchTokens(q);
  if (!toks.length || toks.length > 4) return [];
  const freq = (w) => { const l = windex.get(w); return l ? l.length : 0; };
  const forms = new Map();
  for (let i = 0; i + 1 < toks.length; i++) {
    const j = toks[i] + toks[i + 1];
    /* Any joined word the index carries: "new balance" must find what
       "newbalance" finds, or the two spellings are not one search. */
    if (toks[i].length < 2 || toks[i + 1].length < 2 || /\d/.test(toks[i] + toks[i + 1])) continue;
    if (freq(j) >= 1) forms.set([...toks.slice(0, i), j, ...toks.slice(i + 2)].join(" "), { joined: j, pair: toks[i] + " " + toks[i + 1] });
  }
  toks.forEach((t, i) => {
    if (t.length < 2 * ALSO_TRY_PART || /\d/.test(t) || freq(t) >= ALSO_TRY_SPLIT_RARE) return;
    let best = null;
    for (let k = ALSO_TRY_PART; k <= t.length - ALSO_TRY_PART; k++) {
      const a = t.slice(0, k), b = t.slice(k), m = Math.min(freq(a), freq(b));
      if (m >= ALSO_TRY_MIN_FREQ && (!best || m > best.m)) best = { a, b, m };
    }
    if (best) forms.set([...toks.slice(0, i), best.a, best.b, ...toks.slice(i + 1)].join(" "), { joined: t, pair: best.a + " " + best.b });
  });
  const own = toks.join(" ");
  return [...forms].filter(([f]) => f !== own).map(([q, m]) => ({ q, ...m }));
}

export function alsoTry(ctx, q, total) {
  const out = [];
  for (const { q: f } of spellingForms(ctx, q)) {
    const r = runQuery(ctx, f);
    const n = r && r.state === "results" ? r.hits.length : 0;
    if (n >= total + ALSO_TRY_MIN_GAIN && n >= total * ALSO_TRY_RATIO) out.push({ q: f, total: n });
  }
  return out.sort((a, b) => b.total - a.total).slice(0, 2);
}

/* ONE NAME, ONE SEARCH (#443 c.6568521651, c.6568529141, c.6568542763;
   Danny on «Converse All Star»): a name written joined, separated or
   hyphenated is the same search. The query and each spelling the index
   carries are run, and their results are one set -- the fullest form
   leads, the others' products follow -- so every spelling gets the same
   results and the same comparison charts. Cached per typed query. */
const EQ_NAMED_SHARE = 0.3;
export function equivalentQuery(ctx, q) {
  const key = "~eq:" + cacheKey(q);
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const own = runQuery(ctx, q);
  /* The same name, not a lookalike: a product carries the name when its
     title holds the joined word ("allstar") or the two words side by side
     ("all star"); "dumb ... bells" on a skate deck is not "dumbbells". */
  const S = ctx.S;
  const titleKey = (p) => " " + S.searchTokens(String(p.title || "") + " " + String(p.brand || "")).join(" ") + " ";
  const forms = spellingForms(ctx, q);
  const needles = [...new Set(forms.flatMap((f) => [" " + f.joined + " ", " " + f.pair + " "]))];
  /* The rest of the query must be there too: "nike air max 90" is the
     Air Max 90, not every Air Max. */
  const nameWords = new Set(forms.flatMap((f) => [f.joined, ...f.pair.split(" ")]));
  const rest = S.searchTokens(q).filter((t) => !nameWords.has(t));
  const named = (p) => { const k = titleKey(p); return needles.some((n) => k.includes(n)) && rest.every((t) => k.includes(" " + t + " ")); };
  /* A result set that is really about the name (a third of its first
     hundred results carry it, in either spelling) joins whole and leads
     -- its charts included; one the engine had to loosen (it fell back to
     the brand alone) gives only the products that carry the name, after. */
  const about = (hits) => { const top = hits.slice(0, 100); return top.filter(named).length / top.length >= EQ_NAMED_SHARE; };
  const whole = [], partial = [];
  let formShape = null;
  const add = (r, isOwn) => {
    if (!r || r.state !== "results" || !r.hits.length) return;
    if (!forms.length || about(r.hits)) whole.push(r.hits);
    else { const h = r.hits.filter(named); if (h.length) partial.push(h); else if (!isOwn) return; }
    if (!isOwn) formShape = formShape || r;
  };
  add(own, true);
  for (const f of forms) add(runQuery(ctx, f.q), false);
  whole.sort((x, y) => y.length - x.length);
  partial.sort((x, y) => y.length - x.length);
  const runs = [...whole, ...partial];
  const base = own && own.state === "results" ? own : null;
  let out = own;
  /* A brand we do not sell keeps its honest no. */
  if (!base && own && own.missingBrand) runs.length = 0;
  const ownOnly = base && runs.length === 1 && runs[0] === own.hits;
  if (runs.length && !ownOnly) {
    const seen = new Set(runs[0]), hits = runs[0].slice();
    for (const r of runs.slice(1)) for (const p of r) if (!seen.has(p)) { seen.add(p); hits.push(p); }
    /* A strict category ("kettlebell") stays strict: a «Kettle Bell» tee
       found under the other spelling is not a weight. */
    const cat = categoryOf(q);
    const pure = (own && own._pure) || (cat && cat.test);
    if (pure) for (let i = hits.length - 1; i >= 0; i--) if (!pure(hits[i])) hits.splice(i, 1);
    if (hits.length) {
      const shape = base || formShape;
      out = { ...shape, state: "results", hits: hits.slice(0, ctx.resultLimit || hits.length) };
      if (pure) out._pure = pure;
      /* Its memos (grid, charts, lanes, bands) belong to the lead's own
         hits; the merged set computes its own. The query flags stay. */
      for (const k of Object.keys(out)) if (k.startsWith("_") && k !== "_device" && k !== "_pure") delete out[k];
    }
  }
  /* A core product's world is exactly its own products (worldAnswer). */
  const cw = coreWorldOf(q);
  if (cw && (!out || out.state !== "error")) {
    const W = worldAnswer(ctx, cw);
    if (W.hits.length) out = { state: "results", query: (out && out.query) || q, kinds: ["brand"], hits: W.hits, _world: W };
  }
  ctx.cache.set(key, out);
  return out;
}

/* ONE QUERY, ONE FORM (#443 c.6585818498, c.6585840723 -- Danny: "There
   are so many variations... a lot."). Every spelling of the same name is
   one search, by rule and not by an alias list: «air force one»,
   «airforce1», «Air-Force-1» and «AIR FORCE ONE» are all "air force 1".
   The rules, applied to any query, in order:
     1. case, accents, diacritics, punctuation, repeated spaces (the
        engine's own tokenizer: «Ñike» is "nike", «café» "cafe");
     2. letters and digits apart ("airforce1" -> "airforce 1",
        "iphone15" -> "iphone 15"); a digit ordinal is its number
        ("1st", "2do", "3ra" -> 1, 2, 3);
     3. a number word after a model word is its numeral, English and
        Spanish ("jordan one", "playstation five", "iphone quince"); a
        number word that opens the query, follows a filler word or names
        a construction ("one piece", "two tone") stays a word -- and a
        quantity ("1 kg", "2 pack") is never touched: digits are already
        the canonical form;
     4. joined, separated or hyphenated: each word, and each pair of
        neighbouring words, takes the form the catalogue itself writes
        -- the joined word's product count against the number of titles
        that carry the parts side by side, one beating the other by
        FORM_MARGIN ("air force" 149 vs "airforce" 0: two words; "s 24"
        0 vs "s24" 3: one word; a joined string parts into up to four
        words, "classicslipon" -> "classic slip on"). Where the two are
        close the catalogue writes both for different things ("max 90"
        16, "max90" 33 -- a tee line), and the typed form stands.
        A word of the search dictionary (Spanish) is never split.
   The engine (searchPage, lanePage) runs the result; the destination
   router (_search-destinations.js routeKey) starts from it and adds
   what only a destination needs (brand initials, spelling against the
   known names, singular/plural, word order). Cached per container. */
const NUM_UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const NUM_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, treinta: 30, cuarenta: 40, cincuenta: 50 };
/* After these a number word is a quantity or an article, not a model. */
const NUM_AFTER = new Set("de del para el la los las con y en un una unos unas por al a an the for and of with to by in on at x pack set".split(" "));
/* Before these a number word is part of a construction ("one piece"). */
const NUM_BEFORE = new Set("piece pieces pieza piezas shoulder size sizes strap straps tone toned way button buttons line lines step steps tier layer layers".split(" "));
const ORDINAL_RX = /^(\d{1,3})(st|nd|rd|th|ro|ra|er|era|do|da|to|ta|mo|ma|vo|va|no|na)$/;
const SPLIT_MIN = 2;           // a split must be seen side by side in at least this many titles
const ADJ_SCAN_MAX = 20000;    // titles read to count a pair side by side

function windexOf(ctx) { return (ctx.products && ctx.products._windex) || new Map(); }
const wfreq = (ctx, w) => { const l = windexOf(ctx).get(w); return l ? l.length : 0; };
/* The search dictionary's own words (Spanish): never split. */
export function dictWords(ctx) {
  if (ctx._dictWords) return ctx._dictWords;
  const out = new Set();
  let raw = null;
  try { raw = JSON.parse(readRepoFile(DICT_FILE)); } catch { raw = null; }
  for (const sec of Object.values(raw || {})) {
    if (!sec || typeof sec !== "object" || Array.isArray(sec)) continue;
    for (const k of Object.keys(sec)) for (const w of ctx.S.searchTokens(k)) out.add(w);
  }
  return (ctx._dictWords = out);
}
/* Titles that carry the words `seq` side by side, in that order. */
export function pairCount(ctx, ...seq) {
  const key = seq.join(" ");
  const memo = ctx._pairs || (ctx._pairs = new Map());
  if (memo.has(key)) return memo.get(key);
  const W = windexOf(ctx);
  let small = null;
  for (const w of seq) { const l = W.get(w); if (!l) { small = null; break; } if (!small || l.length < small.length) small = l; }
  let n = 0;
  if (small) {
    const end = Math.min(small.length, ADJ_SCAN_MAX);
    for (let i = 0; i < end; i++) {
      const p = small[i], t = ctx.S.searchTokens(String(p.title || "") + " " + String(p.brand || ""));
      for (let k = 0; k + seq.length <= t.length; k++) if (seq.every((w, m) => t[k + m] === w)) { n++; break; }
    }
  }
  memo.set(key, n);
  if (memo.size > 50000) memo.delete(memo.keys().next().value);
  return n;
}
/* A string may part as `a` + `b`: each part letters or digits, and a
   one-letter part only before a number ("s 24") or as "t shirt". */
function canPart(a, b) {
  const da = /^\d+$/.test(a), db = /^\d+$/.test(b);
  if (!/^([a-z]+|\d+)$/.test(a)) return false;
  if (a.length < 2 && !da && !/^\d/.test(b) && a !== "t") return false;
  if (b.length < 2 && !da && !db) return false;
  return true;
}
/* The best way to write one string of letters/digits as two to
   FORM_PARTS words, by the titles that carry those words in that order:
   { score, parts } or null. */
const FORM_PARTS = 4, FORM_MARGIN = 3;
function bestParts(ctx, j, depth = 1) {
  const memo = ctx._forms || (ctx._forms = new Map());
  const mk = depth + ":" + j;
  if (memo.has(mk)) return memo.get(mk);
  let best = null;
  if (!dictWords(ctx).has(j) && depth < FORM_PARTS) {
    const whole = wfreq(ctx, j);
    for (let k = 1; k < j.length; k++) {
      const a = j.slice(0, k), b = j.slice(k);
      if (!canPart(a, b)) continue;
      const fa = wfreq(ctx, a), floor = Math.max(SPLIT_MIN, best ? best.score + 1 : 0);
      if (fa < floor) continue;
      const sub = bestParts(ctx, b, depth + 1);
      const rest = sub && sub.score > FORM_MARGIN * wfreq(ctx, b) ? sub.parts : [b];
      const parts = [a, ...rest];
      if (Math.min(...parts.map((w) => wfreq(ctx, w))) < floor) continue;
      const sc = pairCount(ctx, ...parts);
      if (sc >= floor && sc > FORM_MARGIN * whole) best = { score: sc, parts };
    }
  }
  memo.set(mk, best);
  if (memo.size > 20000) memo.delete(memo.keys().next().value);
  return best;
}
/* One typed word: apart when the titles write it apart by far. */
function formOf(ctx, t) {
  const b = bestParts(ctx, t);
  return b ? b.parts : [t];
}
/* Two typed words: one word when the titles write them joined by far. */
function joins(ctx, a, b) {
  if (!canPart(a, b) || (/^\d+$/.test(a) && /^\d+$/.test(b))) return false;
  const j = a + b;
  if (dictWords(ctx).has(j)) return true;
  const whole = wfreq(ctx, j);
  if (!whole) return false;
  const bp = bestParts(ctx, j);
  return whole > FORM_MARGIN * Math.max(pairCount(ctx, a, b), bp ? bp.score : 0);
}
const isNum = (t) => /^\d+$/.test(t);
const isAlpha = (t) => /^[a-z]+$/.test(t);
/** The tokens of a query in their one canonical form (see above). */
export function canonicalTokens(ctx, q) {
  let toks = ctx.S.searchTokens(String(q == null ? "" : q).slice(0, 120));
  /* 2. letters and digits apart; digit ordinals are numbers. */
  toks = toks.flatMap((t) => {
    const o = ORDINAL_RX.exec(t);
    if (o) return [o[1]];
    return /\d/.test(t) && /[a-z]/.test(t) ? t.match(/\d+|[a-z]+/g) : [t];
  });
  /* 3. number words after a model word. */
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], prev = out[out.length - 1], next = toks[i + 1];
    const modelSide = prev && isAlpha(prev) && !NUM_AFTER.has(prev) && !(prev in NUM_UNITS) && !(prev in NUM_TENS) && !NUM_BEFORE.has(next);
    if (modelSide && t in NUM_TENS) {
      const u = next in NUM_UNITS && NUM_UNITS[next] < 10 && NUM_UNITS[next] > 0 ? NUM_UNITS[next] : 0;
      out.push(String(NUM_TENS[t] + u)); if (u) i++;
      continue;
    }
    if (modelSide && t in NUM_UNITS) { out.push(String(NUM_UNITS[t])); continue; }
    out.push(t);
  }
  /* A core product's every form is its one name and model («i phone»,
     «iPhones», «celular iphone», «iphone quince» -> "iphone", "iphone
     15"): never a concept's typo («iphones» is not "phones"). */
  const core = coreWorldOf(out.join(" "));
  if (core) return core.model.split(" ");
  /* 4. joined or apart: the catalogue's form (a concept word as typed
     first: «necktie» is "tie", not "neck tie"). */
  const res = [], cw = conceptTokens(ctx, out);
  for (let i = 0; i < cw.length; i++) {
    const a = cw[i], b = cw[i + 1];
    if (b !== undefined && joins(ctx, a, b)) { res.push(a + b); i++; continue; }
    res.push(...formOf(ctx, a));
  }
  /* 5. every word for one idea, English or Spanish: its concept's word
     (again: a word step 4 joined or parted). */
  return conceptTokens(ctx, res);
}
/** The query in its canonical form: the typed text itself when it is
    already canonical (the engine reads it exactly as before). */
export function canonicalQuery(ctx, q) {
  const typed = String(q == null ? "" : q).trim().slice(0, 120);
  if (!ctx || !ctx.S || typeof ctx.S.searchTokens !== "function") return typed;
  const memo = ctx._canon || (ctx._canon = new Map());
  const key = cacheKey(typed);
  if (memo.has(key)) return memo.get(key) === null ? typed : memo.get(key);
  const c = canonicalTokens(ctx, typed).join(" ");
  const same = c === ctx.S.searchTokens(typed).join(" ");
  memo.set(key, same ? null : c);
  if (memo.size > 5000) memo.delete(memo.keys().next().value);
  return same ? typed : c;
}

/* ONE IDEA, ONE WORD (#443, Danny: "extraterrestrial, which means
   extraterrestre, which means alien, which means marciano... They should
   all land on alien."). Rule 5 of the canonical form: every English and
   Spanish word for one idea is that concept's ONE canonical word, read
   from data (CONCEPT_FILE: one line per concept, edited without code).
   Search and the destination router both read it, so «extraterrestre»,
   «marciano», «ovni» and «alien» are one search and one landing. By rule:
     - a phrase before its words, longest first («lentes de sol»);
     - a word's plural by rule (-s, -es), accents and case by the
       tokenizer (rule 1);
     - a one-letter typo (two from ten letters) of a concept word of 5+
       letters or its plural, when the typed word is one the
       catalogue does not carry (under CONCEPT_TYPO_RARE titles, nor its
       singular or plural), nor the dictionary, nor a name, nor close to
       a name -- and only when every close word is the same concept;
     - never inside a store's or brand's name of two or more words
       («polo ralph lauren», «alien workshop»): the name stays whole, as
       the router's exact-name rule (#619) has it;
     - never a word the query's own brand writes as its line name: a word
       CONCEPT_LINE_MIN+ titles carry right after that brand, in at least
       CONCEPT_LINE_SHARE of the titles that carry the word at all
       («guess marciano» is the perfume line, not an alien). */
export const CONCEPT_FILE = "assets/search/concepts.json";
const CONCEPT_TYPO_MIN = 5, CONCEPT_TYPO_RARE = 3, CONCEPT_LINE_MIN = 2, CONCEPT_LINE_SHARE = 0.5, CONCEPT_NAME_MIN = 3, CONCEPT_NAME_WORDS = 6;
/* Edits from a to b (a swap of neighbours is one), or max + 1. */
function editsWithin(a, b, max) {
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
/** The concept table: phrase -> canonical tokens, the words a typo may
    reach, and the names (stores, brands) a concept never rewrites. */
export function conceptTable(ctx) {
  if (ctx._concepts) return ctx._concepts;
  let raw = null;
  try { raw = JSON.parse(readRepoFile(CONCEPT_FILE)); } catch { raw = null; }
  const tok = (s) => ctx.S.searchTokens(String(s || ""));
  const map = new Map(), concepts = [];
  let longest = 1;
  const put = (form, canon) => {
    const k = form.join(" ");
    if (!k || map.has(k)) return;
    map.set(k, canon); longest = Math.max(longest, form.length);
  };
  for (const c of (raw && Array.isArray(raw.concepts) ? raw.concepts : [])) {
    const canon = tok(c.canonical);
    if (!canon.length) continue;
    concepts.push({ canonical: canon.join(" "), words: (c.words || []).map((w) => tok(w).join(" ")).filter(Boolean) });
  }
  /* The canonical words first (they stay themselves), then the words as
     written, then their plurals: what is written wins a collision. */
  for (const c of concepts) put(c.canonical.split(" "), c.canonical.split(" "));
  for (const c of concepts) for (const w of c.words) put(w.split(" "), c.canonical.split(" "));
  for (const c of concepts) for (const w of c.words) {
    const f = w.split(" "), last = f[f.length - 1];
    if (/^[a-z]{3,}$/.test(last) && !last.endsWith("s")) for (const suf of ["s", "es"]) put([...f.slice(0, -1), last + suf], c.canonical.split(" "));
  }
  const typo = [];
  for (const [k, canon] of map) if (/^[a-z]+$/.test(k) && k.length >= CONCEPT_TYPO_MIN) typo.push([k, canon.join(" ")]);
  /* Names: every store, and every brand the catalogue carries in
     CONCEPT_NAME_MIN+ products. */
  const names = new Set(storeNames(ctx).keys()), count = new Map();
  for (const p of ctx.products) { const b = brandKey(p.brand); if (b) count.set(b, (count.get(b) || 0) + 1); }
  for (const [b, n] of count) if (n >= CONCEPT_NAME_MIN) names.add(b);
  const nameWords = new Set();
  for (const n of names) if (!n.includes(" ")) nameWords.add(n);
  return (ctx._concepts = { map, longest, typo, names, nameWords, count: concepts.length });
}
/* Is toks[i] the line name the query's own brand writes it as? */
function conceptIsLine(ctx, T, toks, i) {
  const w = toks[i], f = wfreq(ctx, w);
  if (f < CONCEPT_LINE_MIN) return false;
  for (let a = 0; a < toks.length; a++) for (let b = a + 1; b <= Math.min(toks.length, a + 4); b++) {
    if (i >= a && i < b) break;
    if (!T.names.has(toks.slice(a, b).join(" "))) continue;
    if (pairCount(ctx, ...toks.slice(a, b), w) >= Math.max(CONCEPT_LINE_MIN, f * CONCEPT_LINE_SHARE)) return true;
  }
  return false;
}
/* A typed word the catalogue does not carry: the one concept within one
   edit of it (two from ten letters), or null. */
function conceptTypo(ctx, T, w) {
  if (w.length < CONCEPT_TYPO_MIN || !/^[a-z]+$/.test(w) || dictWords(ctx).has(w) || T.names.has(w)) return null;
  /* A word the catalogue carries, in this form or as its singular or
     plural («omnis» is Saucony's Omni), is no typo. */
  for (const f of [w, w + "s", w.replace(/s$/, ""), w.replace(/es$/, "")]) if (wfreq(ctx, f) >= CONCEPT_TYPO_RARE) return null;
  const max = w.length >= 10 ? 2 : 1;
  let hit = null;
  for (const [k, canon] of T.typo) {
    if (Math.abs(k.length - w.length) > max || editsWithin(w, k, max) > max) continue;
    if (hit !== null && hit !== canon) return null;
    hit = canon;
  }
  /* A store's or brand's name as close is not this concept. */
  if (hit !== null) for (const n of T.nameWords) if (Math.abs(n.length - w.length) <= max && n.length >= CONCEPT_TYPO_MIN && editsWithin(w, n, max) <= max) return null;
  return hit === null ? null : hit.split(" ");
}
/** The tokens with every concept word in its concept's canonical word. */
export function conceptTokens(ctx, toks) {
  const T = conceptTable(ctx);
  if (!T.map.size || !toks.length) return toks;
  /* Words inside a name of two or more words stay. */
  const named = new Set();
  for (let i = 0; i < toks.length; i++) {
    for (let j = Math.min(toks.length, i + CONCEPT_NAME_WORDS); j > i + 1; j--) {
      if (T.names.has(toks.slice(i, j).join(" "))) { for (let m = i; m < j; m++) named.add(m); i = j - 1; break; }
    }
  }
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (named.has(i)) { out.push(toks[i]); continue; }
    let done = false;
    for (let n = Math.min(T.longest, toks.length - i); n >= 1 && !done; n--) {
      let free = true;
      for (let m = i; m < i + n; m++) if (named.has(m)) { free = false; break; }
      if (!free) continue;
      const canon = T.map.get(toks.slice(i, i + n).join(" "));
      if (!canon) continue;
      if (n === 1 && canon.join(" ") !== toks[i] && conceptIsLine(ctx, T, toks, i)) { out.push(toks[i]); done = true; break; }
      out.push(...canon); i += n - 1; done = true;
    }
    if (done) continue;
    const t = conceptTypo(ctx, T, toks[i]);
    out.push(...(t || [toks[i]]));
  }
  return out;
}

/* ============================================================
   THE MALL, NOT A WALL (2026-10-19, #416: Danny on "dolls").

   "We cannot lead with an $80 doll -- Peruvians are going to run
   away." "Don't put me a Cabbage Patch Kid for $90 as one of the
   first options in any area." A browse query ("dolls", "muñecas",
   "vestidos") opens the mall: a carousel of sales first, then the
   best-sellers, then everything. A specific query ("adidas samba",
   "barbie", "airpods") leads with what was asked for, and the
   carousels follow.

   The lead slots of every lane -- its first LEAD_SLOTS cards, and the
   first cards of a browse query's grid -- are reserved for products
   a shopper in Peru will take: a RECOGNIZED brand or a sale, at an
   ACCESSIBLE price for this search. Nothing from an obscure brand at
   a premium price ever leads; premium is sprinkled further along.

   Every judgement is relative to the search's own results, so a
   "cheap" vestido and a "cheap" laptop are each cheap for their
   aisle:
     accessible  final price at or under the demand-weighted median of the
                 aisle's mass-market prices (see bandsOf);
     premium     above its 80th percentile;
     recognized  a brand the whole catalogue carries in depth
                 (BRAND_MIN_PRODUCTS products at 2+ stores, or
                 BRAND_MIN_REVIEWS reviews), read from the brand
                 field or, when a store left it empty, from the
                 start of the title ("Barbie Royal Fashion Doll");
     demand      the store's review count and rating, where it
                 published them.
   ============================================================ */
export const LEAD_SLOTS = 6;
export const LANE_SIZE = 16;
const BRAND_MIN_PRODUCTS = 25;
const BRAND_MIN_REVIEWS = 5000;
const LANE_MIN = 4;              // a lane with fewer cards is not drawn
const BESTSELLER_MIN = 6;        // reviewed products needed to say "Más vendidos"
const GENERIC_MIN_HITS = 60;     // a one-word browse query finds an aisle, not a model

const brandKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* The catalogue's well-known brands, computed once per container. */
function brandTable(ctx) {
  if (ctx._brands) return ctx._brands;
  const stats = new Map();
  for (const p of ctx.products) {
    const k = brandKey(p.brand);
    if (!k) continue;
    let s = stats.get(k);
    if (!s) stats.set(k, s = { n: 0, stores: new Set(), reviews: 0 });
    s.n++; s.stores.add(p.retailer); s.reviews += p.reviews || 0;
  }
  const known = new Set(), marquee = new Set();
  let longest = 1;
  for (const [k, s] of stats) {
    if ((s.n >= BRAND_MIN_PRODUCTS && s.stores.size >= 2) || s.reviews >= BRAND_MIN_REVIEWS) {
      known.add(k);
      longest = Math.max(longest, k.split(" ").length);
    }
    /* MARQUEE: a name sold everywhere (Nike at 16 stores, Barbie and
       Skechers at 3, LEGO's 669 products at 2), not a store's own
       label that is recognized only through its store's reviews
       (Athletic Works, Time and Tru: Walmart only). */
    if (s.stores.size >= 3 || (s.stores.size >= 2 && s.n >= 200) || s.n >= 500) marquee.add(k);
  }
  return (ctx._brands = { known, marquee, longest });
}

/** Is this recognized brand a marquee one? */
export function isMarquee(ctx, brand) {
  return !!brand && brandTable(ctx).marquee.has(brand);
}

/* The product's brand if it is a recognized one, else "". */
export function recognizedBrand(ctx, p) {
  const T = brandTable(ctx);
  const own = brandKey(p.brand);
  if (own) return T.known.has(own) ? own : "";
  const words = brandKey(p.title).split(" ");
  for (let n = Math.min(T.longest, words.length); n >= 1; n--) {
    const k = words.slice(0, n).join(" ");
    if (T.known.has(k)) return k;
  }
  return "";
}

const usdOf = (p) => (p.finalPrice ? Number(p.price) : finalUsd(p.price, p.retailer));
const onSaleOf = (p) => Number(p.originalPrice) > Number(p.price);
const discountOf = (p) => (onSaleOf(p) ? 1 - Number(p.price) / Number(p.originalPrice) : 0);
const demandOf = (p) => Math.log10(1 + (p.reviews || 0)) * (p.rating ? p.rating / 5 : 0.8);

/** Is this a browse query (an aisle) rather than a specific product? */
export function isGenericQuery(ctx, r) {
  const kinds = (r && r.kinds) || [];
  if (!kinds.length || kinds.includes("brand")) return false;
  if (/\d/.test(String(r.query || ""))) return false;
  if (kinds.every((k) => k === "word")) return true;
  /* "dolls" and "sneakers" are not dictionary words (the dictionary is
     Spanish -> English), so a word the dictionary does not know is an
     aisle when it finds many products and no named brand holds half
     of them ("samba" is almost all adidas; "airpods" all Apple). */
  const hits = r.hits || [];
  if (hits.length < GENERIC_MIN_HITS) return false;
  /* Accessories name the product they fit ("Case for AirPods 4",
     "Charger with ... AirPods"): they are not the product, so they do
     not vote. A store that leaves the brand blank ("Apple AirPods 4")
     names it first in the title. (#413: Best Buy's cases and chargers
     had turned "airpods" into an aisle.) */
  const qw = String(r.query || "").toLowerCase().trim().split(/\s+/)[0] || "";
  const fits = (t) => {
    const i = t.indexOf(qw);
    return i > 0 && /\b(for|with|compatible|fits|para|con)\b/.test(t.slice(0, i));
  };
  const by = new Map();
  let named = 0;
  for (const p of hits) {
    if (qw && fits(String(p.title || "").toLowerCase())) continue;
    const k = recognizedBrand(ctx, p) || brandKey(p.brand) || brandKey(String(p.title || "").split(/\s+/)[0]);
    if (!k) continue;
    named++;
    by.set(k, (by.get(k) || 0) + 1);
  }
  const top = Math.max(0, ...by.values());
  return named === 0 || top / named < 0.5;
}

/* THE AISLE. The engine matches words, so "dolls" also finds a men's
   T-shirt from a brand called Former Doll, and "vestidos" finds bags
   named after dresses. A lane is a shelf of the aisle the search is
   about: the departments holding a real share of the results (10% of
   all of them, or 1% of them and 10% of the top 100 -- Walmart's
   dresses are 2% of "vestidos" but a third of its best matches). Catch-all
   departments (clearance, general) belong to every aisle. */
const NEUTRAL_DEPTS = new Set(["", "clearance", "general", "sale", "sales", "ofertas", "deals"]);
function aisleOf(hits) {
  const all = new Map(), top = new Map();
  hits.forEach((p, i) => {
    const d = (p.departments && p.departments[0]) || "";
    all.set(d, (all.get(d) || 0) + 1);
    if (i < 100) top.set(d, (top.get(d) || 0) + 1);
  });
  const n = hits.length, t = Math.min(100, n), keep = new Set(NEUTRAL_DEPTS);
  for (const [d, c] of all) {
    if (c / n >= 0.1 || (c / n >= 0.01 && (top.get(d) || 0) / t >= 0.1)) keep.add(d);
  }
  return (p) => keep.has((p.departments && p.departments[0]) || "");
}

/* Quantiles of the aisle's mass-market prices, weighted by demand
   (see bandsOf). Measured on the battery: at the median, "vestidos"
   called a S/ 400 dress accessible. */
const ACCESSIBLE_Q = 0.5, PREMIUM_Q = 0.8;

/* Price bands of this search's own aisle, read from its MASS-MARKET
   part (recognized brands, or products a store published reviews for)
   when there is enough of it: "vestidos" also finds 1,000 designer
   dresses, and their prices must not make a S/ 375 dress look
   ordinary. */
function bandsOf(hits, ctx) {
  const mass = hits.filter((p) => p.reviews > 0 || recognizedBrand(ctx, p));
  const base = mass.length >= 30 ? mass : hits;
  /* Weighted by what sells: each price counts sqrt(reviews) times (a
     recognized brand without published reviews counts once). A plain
     percentile let 300 department-store dresses with a dozen reviews
     each outvote a S/ 26 dress with 4,000, and put the "accessible"
     line at S/ 318. */
  const pts = base.map((p) => [usdOf(p), Math.sqrt(p.reviews || 1)]).filter((x) => x[0] > 0).sort((a, b) => a[0] - b[0]);
  const total = pts.reduce((s, x) => s + x[1], 0);
  const at = (q) => {
    let acc = 0;
    for (const [usd, w] of pts) { acc += w; if (acc >= total * q) return usd; }
    return pts.length ? pts[pts.length - 1][0] : Infinity;
  };
  const accessible = at(ACCESSIBLE_Q);
  return { accessible, premium: Math.max(accessible * 1.25, at(PREMIUM_Q)) };
}

/* Annotated once per query (cached with the answer). */
function annotate(ctx, r) {
  if (r._ann) return r._ann;
  const inAisle = aisleOf(r.hits);
  const bands = bandsOf(r.hits.filter(inAisle), ctx);
  const ann = new Map();
  for (const p of r.hits) {
    const usd = usdOf(p), brand = recognizedBrand(ctx, p), sale = onSaleOf(p), aisle = inAisle(p);
    const marquee = isMarquee(ctx, brand);
    ann.set(p, {
      usd, brand, sale, aisle, marquee,
      /* Lead slots: a marquee name up to the premium line; any other
         recognized brand, or a sale, at an accessible price. */
      lead: aisle && ((marquee && usd <= bands.premium) || (usd <= bands.accessible && (!!brand || sale))),
      obscurePremium: !brand && usd > bands.premium,
      premium: usd > bands.premium,
    });
  }
  return (r._ann = { bands, of: (p) => ann.get(p) });
}

/* A lane's order: its first `slots` from the lead-eligible products
   (in the lane's own order); then the rest with premium products
   SPRINKLED -- one in every PREMIUM_EVERY cards, never two together;
   obscure premium products last. */
const PREMIUM_EVERY = 4;
function leadFirst(list, A, slots = LEAD_SLOTS) {
  const lead = [], plain = [], premium = [], late = [];
  for (const p of list) {
    const a = A.of(p);
    if (lead.length < slots && a.lead) lead.push(p);
    else if (a.obscurePremium) late.push(p);
    else if (a.premium) premium.push(p);
    else plain.push(p);
  }
  /* Too few eligible products to fill the lead: the next best are
     accessible-priced ones, then other plain (non-premium) ones --
     never premium. */
  while (lead.length < slots && plain.length) {
    const i = plain.findIndex((p) => A.of(p).usd <= A.bands.accessible);
    lead.push(plain.splice(i < 0 ? 0 : i, 1)[0]);
  }
  const out = lead.slice();
  while (plain.length || premium.length) {
    for (let k = 0; k < PREMIUM_EVERY - 1 && plain.length; k++) out.push(plain.shift());
    if (premium.length) out.push(premium.shift());
    if (!plain.length) { out.push(...premium); premium.length = 0; }
  }
  return out.concat(late);
}

/* The same product listed twice (colourways, a store's re-listing)
   is one card in a lane. */
function distinct(list, max) {
  const seen = new Set(), out = [];
  for (const p of list) {
    /* Colourways differ at the end of the title ("..., Blonde" /
       "..., Brunette"); the first 30 letters name the product. */
    const k = brandKey(p.title).slice(0, 30);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/* The query names one brand when it IS that brand's name and the brand
   holds most of the answer ("venum", "carolina herrera"); then the
   answer's products of that brand, grouped by store, biggest first. */
const BRAND_SHARE = 0.6;
function brandStoreLanes(ctx, q, r) {
  const bk = brandKey(q);
  if (!bk || r.hits.length < LANE_MIN) return null;
  const all = r.hits.filter((p) => brandKey(p.brand) === bk);
  if (all.length < LANE_MIN || all.length < r.hits.length * BRAND_SHARE) return null;
  const m = new Map();
  for (const p of all) { if (!m.has(p.retailer)) m.set(p.retailer, []); m.get(p.retailer).push(p); }
  const stores = [...m.entries()].filter(([, l]) => l.length >= 1).sort((a, b) => b[1].length - a[1].length);
  return { all, stores };
}

/* ==================================================================
   THE SEARCH DOCTRINE (#443 c.6547231776, c.6547453746, c.6547518074,
   c.6547946175): ONE system for every search -- brand, model or
   category term.
     1. A query that names a store Aria carries goes to that store's
        page (storeFor); no results grid. A store whose name is also a
        brand other stores sell (Crocs) is searched as the brand.
     2. Otherwise: the comparison charts for the exact product, then
        Ofertas for the term, then ONE rail per store that carries the
        term or its brand -- never the side-by-side grid.
     3. Inside a store's rail: the exact item first (every model and
        colourway it has), then the same brand from that store, then
        similar items from that store (the answer's category). A store
        with none of the exact item still gets its rail: brand items.
     Every rail holding more than it shows pages on (lanePage).
   ================================================================== */
const STORE_ALIASES = {
  vs: "victoriassecret", victoria: "victoriassecret", victorias: "victoriassecret", "victoria secret": "victoriassecret",
  "victorias secret": "victoriassecret", "victoria s": "victoriassecret", dick: "dicks", dicks: "dicks", "dick s": "dicks",
  "dicks sporting goods": "dicks", "dick s sporting": "dicks", bbw: "bathandbodyworks", "bath and body works": "bathandbodyworks",
  "bath body works": "bathandbodyworks", "b h": "bhphoto", "b h photo": "bhphoto", bh: "bhphoto", "a f": "abercrombie", af: "abercrombie",
  "abercrombie fitch": "abercrombie", "american eagle": "americaneagle", ae: "americaneagle", "foot locker": "footlocker",
  "finish line": "finishline", "hot topic": "hottopic", "box lunch": "boxlunch", "crate barrel": "crateandbarrel",
  "crate and barrel": "crateandbarrel", "pier 1": "pier1", "pier one": "pier1", "micro center": "microcenter",
  "brands mart": "brandsmart", "brandsmart usa": "brandsmart", "lane bryant": "lanebryant",
};
function storeNames(ctx) {
  if (ctx._storeNames) return ctx._storeNames;
  const m = new Map();
  const put = (name, key) => { const n = brandKey(name); if (n.length >= 2 && !m.has(n)) m.set(n, key); };
  for (const [key, label] of Object.entries(ctx.labels || {})) {
    put(label, key); put(key, key);
    /* "Victoria's Secret" is typed "victorias secret" as often as "victoria s secret". */
    put(brandKey(label).replace(/\b(\w+) s\b/g, "$1s"), key);
  }
  for (const [a, key] of Object.entries(STORE_ALIASES)) if (ctx.labels && ctx.labels[key]) m.set(brandKey(a), key);
  return (ctx._storeNames = m);
}
/* Brand -> the stores selling it, over the whole index (once). */
function brandStores(ctx) {
  if (ctx._brandStores) return ctx._brandStores;
  const m = new Map();
  for (const p of ctx.products) {
    const b = brandKey(p.brand);
    if (!b) continue;
    if (!m.has(b)) m.set(b, new Set());
    m.get(b).add(p.retailer);
  }
  return (ctx._brandStores = m);
}
export function storeFor(ctx, q) {
  const k = brandKey(q);
  if (k.length < 2) return null;
  const names = storeNames(ctx);
  let key = names.get(k) || names.get(k.replace(/\b(\w+) s\b/g, "$1s")) || null;
  if (!key && k.length >= 5) {
    /* Most of a store's name, from its start ("brandsmart", "victoria s secr"). */
    const cands = new Set();
    for (const [n, kk] of names) if (n.startsWith(k) && k.length >= n.length * 0.6) cands.add(kk);
    if (cands.size === 1) key = [...cands][0];
  }
  /* A store's name always opens that store (Danny, 2026-11-01), even
     when other stores also sell its brand (Crocs, New Balance, Miu Miu). */
  return key || null;
}

/* Indexes the rails read: brand -> store -> products; store|category -> products. */
function railIndex(ctx) {
  if (ctx._railIndex) return ctx._railIndex;
  const byBrand = new Map(), byCat = new Map(), byStore = new Map();
  for (const p of ctx.products) {
    if (!p.image) continue;
    if (!byStore.has(p.retailer)) byStore.set(p.retailer, []);
    byStore.get(p.retailer).push(p);
    const b = brandKey(p.brand);
    if (b) {
      if (!byBrand.has(b)) byBrand.set(b, new Map());
      const ms = byBrand.get(b);
      if (!ms.has(p.retailer)) ms.set(p.retailer, []);
      ms.get(p.retailer).push(p);
    }
    if (p._cat) {
      const ck = p.retailer + "|" + p._cat;
      if (!byCat.has(ck)) byCat.set(ck, []);
      byCat.get(ck).push(p);
    }
  }
  return (ctx._railIndex = { byBrand, byCat, byStore });
}
const saleFirst = (list) => list.map((p, i) => ({ p, i, d: onSaleOf(p) ? discountOf(p) : -1 })).sort((a, b) => (b.d - a.d) || (a.i - b.i)).map((x) => x.p);
/* The one thing the answer is about: its brand, its category (each only
   when it holds half the top of the answer, or the query names it). */
function answerFocus(ctx, q, r) {
  const top = r.hits.slice(0, 40);
  const most = (keyOf) => {
    const n = new Map();
    for (const p of top) { const k = keyOf(p); if (k) n.set(k, (n.get(k) || 0) + 1); }
    let best = null, bn = 0;
    for (const [k, c] of n) if (c > bn) { best = k; bn = c; }
    return bn >= top.length * 0.5 ? best : null;
  };
  const qb = brandKey(q), bs = brandStores(ctx);
  let brand = most((p) => brandKey(p.brand));
  if (!brand) { for (const [b] of bs) if (b.length >= 3 && (qb === b || qb.startsWith(b + " "))) { brand = b; break; } }
  /* The query's own product words, the brand set aside ("levis jeans" ->
     "jeans"): a store's similar items are the ones its titles name so. */
  const brandWords = new Set(String(brand || "").split(" "));
  const words = qb.split(" ").filter((w) => w.length >= 3 && !brandWords.has(w) && !/^levis?$/.test(w));
  return { brand, cat: most((p) => p._cat), words };
}
const stemRx = (w) => new RegExp("\\b" + w.replace(/[^a-z0-9]/g, "").replace(/(es|s)$/, "") + "(?:s|es)?\\b", "i");
export const SALE_FLOOR = 0.05;
export const RAIL_CAP = 2000, SIMILAR_CAP = 96, STORE_LANES_MAX = 40;
/* Every lane of the answer, each with its WHOLE ordered list (deduped,
   capped): lanesFor shows the first LANE_SIZE, lanePage the rest. */
function doctrineLanes(ctx, q, r) {
  if (r._doctrine) return r._doctrine;
  if (r._world) return (r._doctrine = worldLanes(ctx, r));
  const inBlock = new Set(compareGroup(ctx, r) || []);
  const { brand, cat, words } = answerFocus(ctx, q, r);
  /* The rails show what the old lanes trusted: a product in the answer's
     own aisle (annotate) and, for a category query, of that category
     only (r._pure, #443 c.6544117193) -- or the brand the query names. */
  const A = annotate(ctx, r);
  const hits = r.hits.filter((p) => (!r._pure || r._pure(p)) && (A.of(p).aisle || (brand && brandKey(p.brand) === brand)));
  const wordRx = words.map(stemRx);
  const idx = railIndex(ctx);
  const lanes = [];
  /* A real markdown only: the site's sale floor (/sale-rule.js MIN_PCT, 5%). */
  const sales = saleFirst(hits.filter((p) => discountOf(p) >= SALE_FLOOR && !inBlock.has(p)));
  if (sales.length >= LANE_MIN) lanes.push({ key: "ofertas", title: "Ofertas", all: distinct(sales, RAIL_CAP) });
  const exactBy = new Map();
  for (const p of hits) { if (!exactBy.has(p.retailer)) exactBy.set(p.retailer, []); exactBy.get(p.retailer).push(p); }
  const brandBy = brand ? (idx.byBrand.get(brand) || new Map()) : new Map();
  const stores = new Set([...exactBy.keys(), ...brandBy.keys()]);
  const storeLanes = [];
  /* The exact item: a product naming every word of the query leads its
     store's rail; looser matches follow. */
  const allRx = brandKey(q).split(" ").filter((w) => w.length >= 2).map(stemRx);
  const full = (p) => allRx.every((rx) => rx.test(brandKey(p.brand) + " " + brandKey(p.title)));
  for (const store of stores) {
    const ex0 = exactBy.get(store) || [];
    const exact = ex0.filter(full).concat(ex0.filter((p) => !full(p)));
    const seen = new Set(exact);
    const more = saleFirst((brandBy.get(store) || []).filter((p) => !seen.has(p)));
    more.forEach((p) => seen.add(p));
    /* Similar: the store's items named by the query's product words (its
       other jeans); without such words, the answer's category. */
    /* Similar: the store's items named by the query's product words (its
       other jeans) and of the answer's category; without such words, the
       answer's category. A store with none of the exact item shows the
       brand only (the doctrine, item 5). */
    const pure = (p) => (!r._pure || r._pure(p)) && (!cat || p._cat === cat);
    const similar = !exact.length && brand ? [] : (wordRx.length
      ? saleFirst((idx.byStore.get(store) || []).filter((p) => !seen.has(p) && pure(p) && wordRx.every((rx) => rx.test(p.title))))
      : cat ? saleFirst((idx.byCat.get(store + "|" + cat) || []).filter((p) => !seen.has(p) && (!r._pure || r._pure(p)))) : []).slice(0, SIMILAR_CAP);
    const all = distinct(exact.concat(more, similar), RAIL_CAP);
    if (!all.length) continue;
    storeLanes.push({ key: "tienda:" + store, store, title: ctx.labels[store] || store, exact: exact.length, all });
  }
  storeLanes.sort((a, b) => (b.exact - a.exact) || (b.all.length - a.all.length) || (a.title < b.title ? -1 : 1));
  for (const l of storeLanes.slice(0, STORE_LANES_MAX)) lanes.push(l);
  return (r._doctrine = { brand, cat, lanes });
}
/* A core product's lanes (worldAnswer): the product, its accessories by
   kind, then one rail per store of the maker's own inventory -- no
   Ofertas rail ahead of the product, nothing from outside the world. */
function worldLanes(ctx, r) {
  const W = r._world, inBlock = new Set(compareGroup(ctx, r) || []);
  const lanes = [];
  const devices = W.devices.filter((p) => !inBlock.has(p));
  if (devices.length) lanes.push({ key: "producto:" + W.world.id, title: W.world.label, all: distinct(devices, RAIL_CAP) });
  for (const a of W.accessories) lanes.push({ key: "accesorios:" + a.k, title: a.title, all: distinct(a.items, RAIL_CAP) });
  for (const s of W.stores.slice(0, STORE_LANES_MAX)) lanes.push({ key: "tienda:" + s.store, store: s.store, title: ctx.labels[s.store] || s.store, exact: s.dev, doorQ: W.world.maker, all: distinct(s.items, RAIL_CAP) });
  return { brand: W.world.brands[0], cat: null, lanes };
}
/* One more page of one lane ("Ver más" re-rails it). */
export function lanePage(ctx, q, laneKey, offset = 0, { fx = null } = {}) {
  const query = canonicalQuery(ctx, String(q == null ? "" : q).trim().slice(0, 120));
  const r = equivalentQuery(ctx, query);
  if (r.state !== "results") return null;
  const l = doctrineLanes(ctx, query, r).lanes.find((x) => x.key === laneKey);
  if (!l) return null;
  const off = Math.max(0, Math.floor(Number(offset)) || 0);
  return { q: query, lane: laneKey, offset: off, n: l.all.length, items: l.all.slice(off, off + LANE_SIZE).map((p) => cardOf(p, fx, ctx.labels)) };
}

/** The lanes of one answer (page 1 only). */
export function lanesFor(ctx, q, r, fx) {
  if (!r || r.state !== "results" || !r.hits.length) return { mode: "specific", lanes: [] };
  /* The doctrine: Ofertas, then one rail per store (doctrineLanes). */
  const d = doctrineLanes(ctx, q, r);
  return { mode: "doctrine", lanes: d.lanes.map((l) => ({ key: l.key, title: l.title, ...(l.store ? { store: l.store } : {}), n: l.all.length,
    ...(l.exact != null ? { exact: l.exact } : {}), ...(l.doorQ ? { doorQ: l.doorQ } : {}), items: l.all.slice(0, LANE_SIZE).map((p) => cardOf(p, fx, ctx.labels)) })) };
}
/* (The earlier lane builder, kept for its callers' tests: generic /
   brand / specific lanes. The page now reads lanesFor.) */
export function legacyLanesFor(ctx, q, r, fx) {
  if (!r || r.state !== "results" || !r.hits.length) return { mode: "specific", lanes: [] };
  if (r._lanes) return { mode: r._mode, lanes: r._lanes.map((l) => ({ ...l, items: l.items.map((p) => cardOf(p, fx, ctx.labels)) })) };
  const A = annotate(ctx, r);
  const generic = isGenericQuery(ctx, r);
  const lanes = [];
  const used = new Set();
  /* A BRAND QUERY FOLLOWS THE FORMAT (#443 c.6532666653): its Ofertas
     first, then one rail per store carrying it, true totals, biggest
     first; a store's rail opens everything of that brand there. */
  const byStore = brandStoreLanes(ctx, q, r);
  if (byStore) {
    const sales = byStore.all.filter(onSaleOf).map((p, i) => ({ p, i, d: discountOf(p) })).sort((a, b) => (b.d - a.d) || (a.i - b.i)).map((x) => x.p);
    if (sales.length >= LANE_MIN) lanes.push({ key: "ofertas", title: "Ofertas", n: sales.length, items: distinct(sales, LANE_SIZE) });
    for (const [store, l] of byStore.stores) lanes.push({ key: "tienda:" + store, store, title: ctx.labels[store] || store, n: l.length, items: distinct(l, LANE_SIZE) });
    r._mode = "brand";
    r._lanes = lanes;
    return legacyLanesFor(ctx, q, r, fx);
  }

  /* Relevance still counts in a lane: a sale far down the ranking
     ("Former Doll" T-shirts under "dolls") is a weaker match than a
     doll on sale, so the ranking position weighs as much as the
     discount does. */
  const rank = new Map(r.hits.map((p, i) => [p, i / r.hits.length]));
  /* Price accessibility (Danny: "sale depth + best-seller demand +
     price accessibility first"): +1 for a free product, 0 at the
     premium line, below 0 above it. */
  const acc = (p) => Math.max(-1, 1 - A.of(p).usd / A.bands.premium);

  /* 1. Sales: deep discounts on relevant, recognized products first. */
  /* (Products the comparison block shows are not repeated here.) */
  const inBlock = new Set(compareGroup(ctx, r) || []);
  /* A category query's lanes are that category only (#443 c.6544117193:
     a hub under «laptop», a toy phone under «celular», hoodies under
     «mascarilla» in the En oferta row). */
  const shelf = r.hits.filter((p) => A.of(p).aisle && !inBlock.has(p) && (!r._pure || r._pure(p)));
  const sales = shelf.filter(onSaleOf)
    .map((p) => ({ p, s: Math.min(discountOf(p), 0.6) * 2 + demandOf(p) * 0.4 + (A.of(p).marquee ? 1 : A.of(p).brand ? 0.4 : 0) + acc(p) * 2 - rank.get(p) * 1.5 }))
    .sort((a, b) => b.s - a.s).map((x) => x.p);
  if (sales.length >= LANE_MIN) {
    const items = distinct(leadFirst(sales, A), LANE_SIZE);
    items.forEach((p) => used.add(p));
    lanes.push({ key: "ofertas", title: "En oferta", items });
  }

  /* 2. Best-sellers: the stores' own demand. Without enough reviewed
     products the lane says what it is -- the brands everybody knows --
     rather than claiming sales numbers it does not have. */
  const reviewed = shelf.filter((p) => p.reviews > 0 && !used.has(p))
    .map((p) => ({ p, s: demandOf(p) + (A.of(p).marquee ? 0.6 : 0) + acc(p) * 2 - rank.get(p) })).sort((a, b) => b.s - a.s).map((x) => x.p);
  if (reviewed.length >= BESTSELLER_MIN) {
    const items = distinct(leadFirst(reviewed, A), LANE_SIZE);
    items.forEach((p) => used.add(p));
    lanes.push({ key: "vendidos", title: "Más vendidos", items });
  } else if (generic) {
    /* (A specific query's results are already one brand or model; a
       brand-mix lane would only repeat them.) */
    const fav = shelf.filter((p) => !used.has(p) && A.of(p).brand && !A.of(p).premium);
    /* One brand must not fill the lane: round-robin across brands, in
       relevance order within each. */
    const byBrand = new Map();
    for (const p of fav) { const b = A.of(p).brand; if (!byBrand.has(b)) byBrand.set(b, []); byBrand.get(b).push(p); }
    const queues = [...byBrand.values()], mixed = [];
    for (let i = 0; mixed.length < LANE_SIZE * 2 && queues.some((qq) => qq.length); i = (i + 1) % queues.length) {
      if (queues[i].length) mixed.push(queues[i].shift());
    }
    if (mixed.length >= LANE_MIN) {
      const items = distinct(leadFirst(mixed, A), LANE_SIZE);
      items.forEach((p) => used.add(p));
      lanes.push({ key: "marcas", title: "Marcas favoritas", items });
    }
  }
  r._mode = generic ? "generic" : "specific";
  r._lanes = lanes;
  return legacyLanesFor(ctx, q, r, fx);
}

/* ============================================================
   ONE PRODUCT, EVERY STORE: THE COMPARISON BLOCK (2026-10-19, #416).

   "Never 30 ungrouped duplicate cards again." When a specific search
   finds the SAME product at two or more stores, the page opens with
   one block: each store's logo, its total door price in soles (the
   checkout's own math, _door-price.js), "Mejor precio" on the cheapest
   door price and "Entrega más rápida" on the store that is genuinely
   faster to Miami (scripts/lib/retailer-delivery.js), each row linking
   to that store's product page on Aria.

   "The same product" is decided conservatively, from the title, since
   the stores share no product code in the index:
     - the same brand (the brand field, or a recognized brand at the
       start of the title when a store left the field empty);
     - the same wearer (men's, women's, kids', toddler) when a title
       says so -- a title that says nothing only matches another that
       says nothing;
     - exactly the same remaining words, in any order, after removing
       the brand, the wearer and a few words that only describe the
       kind of thing ("shoes", "skate shoes", "wireless earbuds"). So
       "Samba ADV Shoes - Dark Brown/Core Black/Gum" and "Samba ADV Dark
       Brown, Black & Gum Skate Shoes" are one shoe ("core black" is
       adidas's name for black), while "Samba ADV Grey/Cream White/Grey"
       and "Samba ADV Grey & White" are not: "cream" may be a colour.
     - a store that lists two products under the same words (colourways
       its titles do not name) takes no part: we cannot tell which one
       the other store sells;
     - a beauty product must state its size in the title (a travel and
       a full-size mascara share a name), and list prices more than
       2x apart are not trusted to be the same item.
   ============================================================ */
const normWords = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[®™©]/g, " ").replace(/['’`´]/g, "").replace(/[^a-z0-9.]+/g, " ").replace(/(^|\s)\.+|\.+(?=\s|$)/g, " ").trim();
/* Store title dressing that never names a different product (#443
   c.6544792632): a season tag "(SU25)", roman numerals ("GX II" is
   "GX 2"), grey/gray. */
const SEASON_TAG = /\((?:sp|su|fa|ho)\d{2}\)/gi;
const ROMAN = { ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8" };
const dressing = (t) => t.replace(/\b(ii|iii|iv|vi|vii|viii)\b/g, (m) => ROMAN[m]).replace(/\bgrey\b/g, "gray");

/* THE MAKER'S STYLE CODE (#443 c.6544792632). Where a store's data
   carries the manufacturer's code -- most often in its photo's file name
   (Finish Line "FN3787_497", Xtreme Soccer "...-hj2147-400.jpg", Tennis
   Express "JY1882_1", Parrot "VN0A5FJ8_1M7") -- the code IS the product:
   a match groups whatever the titles say, a conflict never groups.
   Codes are per colourway (Nike style-colour, adidas article, Vans
   style + colour), so a colourway never joins another. */
const CODE_RULES = [
  [/\b(nike|jordan)\b/, /(?:^|[^a-z0-9])([a-z]{2}\d{4})[-_](\d{3})(?=[^0-9]|$)/i, (m) => m[1] + "-" + m[2]],
  [/\badidas\b/, /(?:^|[^a-z0-9])([a-z]{2}\d{4})(?=[^a-z0-9]|$)/i, (m) => m[1]],
  [/\bvans\b/, /(?:^|[^a-z0-9])(vn0a[0-9a-z]{4})[-_]([0-9a-z]{3})(?=[^a-z0-9]|$)/i, (m) => m[1] + "-" + m[2]],
];
export function styleCodeOf(p) {
  if (p._sc !== undefined) return p._sc;
  const brand = String(p.brand || "").toLowerCase() + " " + String(p.title || "").toLowerCase().slice(0, 24);
  const file = String(p.image || "").split("?")[0].split("/").pop() || "";
  let sc = null;
  for (const [brx, crx, fmt] of CODE_RULES) {
    if (!brx.test(brand)) continue;
    const m = crx.exec(file) || crx.exec(String(p.title || ""));
    if (m) { sc = (brx.source.includes("adidas") ? "adidas" : brx.source.includes("vans") ? "vans" : "nike") + ":" + fmt(m).toUpperCase(); break; }
  }
  try { Object.defineProperty(p, "_sc", { value: sc, enumerable: false, writable: true }); } catch { /* frozen */ }
  return sc;
}
const WEARER = [
  ["t", /\b(?:toddlers?|infants?|baby|babies|td)\b/],
  /* Preschool (little kids) is its own size run, between toddler and grade school. */
  ["p", /\b(?:preschool|pre school|little kids?|ps)\b/],
  ["k", /\b(?:boys?|girls?|kids?|youth|grade school|gs|big kids?|juniors?)\b/],
  ["w", /\b(?:womens?|ladies|mujer)\b/],
  ["m", /\b(?:mens?|hombre)\b/],
];
const WEARER_WORDS = /\b(?:toddlers?|infants?|baby|babies|preschool|little|big|kids?|boys?|girls?|youth|grade|school|gs|td|ps|juniors?|womens?|ladies|mujer|mens?|hombre|unisex)\b/g;
const KIND_PHRASES = /\b(?:skate shoes?|wireless earbuds|wireless headphones|basketball shoes?|running shoes?)\b/g;
const KIND_WORDS = new Set("shoes shoe sneakers sneaker the and with for of in originals earbuds headphones jeans fit lifestyle casual athletic trainers trainer adult".split(" "));
const MAKER_COLOURS = /\b(?:core|ftwr|footwear|cloud)\s+(black|white)\b/g;
const BEAUTY_WORDS = /\b(?:mascara|serum|moisturi[sz]er|cream|cleanser|lotion|perfume|parfum|eau de|cologne|fragrance|lipstick|lip gloss|foundation|concealer|shampoo|conditioner|sunscreen|spf|toner|balm|primer|powder|blush|bronzer|palette|body mist|body spray)\b/;
const SIZE_WORDS = /\b\d+(?:\.\d+)?\s?(?:oz|ml|fl|g|ct|count|pack|pk)\b/;
const MAX_LIST_RATIO = 2;
export const COMPARE_MAX_STORES = 6;
/* Shoes and clothing come in colourways that a title may not name:
   without a style code, a short model name must state the colour, or no
   group -- a false "Mejor precio" is worse than a missing card. */
const WEARABLE_RX = /\b(shoes?|sneakers?|boots?|sandals?|slides?|cleats?|slip-?ons?|mules?|clogs?|loafers?|t-?shirts?|tees?|shirts?|hoodies?|sweatshirts?|jackets?|pants|shorts|jerseys?|dress(es)?|leggings|tops?|tanks?|crew ?necks?|joggers?|sweaters?)\b/;
const COLOUR_RX = /\b(black|white|red|blue|green|gray|pink|purple|yellow|orange|brown|beige|tan|navy|cream|gold|silver|gum|khaki|olive|maroon|burgundy|teal|sail|bone|ivory|sand|multi|multicolor|camo|charcoal|smoke|slate|mint|lilac|lavender|coral|rose|onix|aurora|wonder|chalk|natural|indigo|denim|wine|plum|rust|copper|bronze|metallic|neon|volt|cardinal|royal|sky|aqua|turquoise|lime|leopard|checker(board)?|checkered|heather|oatmeal|stone|olive|sage|mocha|espresso|peach|blush|fuchsia|magenta|scarlet|crimson|ash|cement|sesame|wheat|desert|dune|sequoia|saffron|army|forest|hunter)\b/;

/** The product's identity key, or null when the title cannot carry one. */
export function sameProductKey(ctx, p) {
  const brand = normWords(recognizedBrand(ctx, p) || p.brand);
  if (!brand) return null;
  let t = dressing(normWords(String(p.title || "").replace(SEASON_TAG, " ")));
  if (BEAUTY_WORDS.test(t) && !SIZE_WORDS.test(t)) return null;
  const colourless = WEARABLE_RX.test(t) && !COLOUR_RX.test(t);
  let wearer = "";
  for (const [k, re] of WEARER) if (re.test(t)) { wearer = k; break; }
  t = t.replace(MAKER_COLOURS, "$1").replace(KIND_PHRASES, " ").replace(WEARER_WORDS, " ");
  const bw = new Set(brand.split(" "));
  const words = [...new Set(t.split(" ").filter((w) => w && !bw.has(w) && !KIND_WORDS.has(w)))];
  if (words.length < 2) return null;
  /* A short model name ("Old Skool", "Samba OG") comes in many
     colourways: without the colour, no key. A designer's three-word
     style ("Espinela Gema Maxi") names its print already. */
  if (colourless && words.length < 3) return null;
  return brand + "|" + wearer + "|" + words.sort().join(" ");
}

const listUsd = (p) => Math.max(Number(p.price) || 0, Number(p.originalPrice) || 0);

/* ONE CHART PER MODEL (#443 c.6544967818, Danny's Air Force 1 ruling;
   Lucifer's audit c.6544992777). The comparison groups a MODEL: the
   same brand, the same wearer and the same model words once the
   colourway is set aside -- the part after a dash, colour words, a
   quoted nickname ("'Neon'", "Hatch Chile"). Very similar listings of
   one model group; different models ("Air Force 1 '07" and "Air Force 1
   Low") never merge -- a search that finds both shows two charts. The
   maker's style code confirms: one style family (Nike "HV0959", Vans
   "VN0A5FJ8") joins listings whatever their titles say, and two
   families never join. */
const COLOURWAY_WORDS = new Set(("black white red blue green gray pink purple yellow orange brown beige tan navy cream gold silver gum khaki olive maroon burgundy " +
  "teal sail bone ivory sand multi multicolor camo charcoal smoke slate mint lilac lavender coral rose onix aurora wonder chalk natural indigo denim wine plum " +
  "rust copper bronze metallic neon volt cardinal royal sky aqua turquoise lime leopard checkerboard checkered heather oatmeal stone sage mocha espresso peach " +
  "blush fuchsia magenta scarlet crimson ash cement sesame wheat desert dune sequoia saffron army forest hunter dark light core ftwr cloud off triple " +
  "solar bright pale deep washed vintage true team university varsity midnight obsidian phantom anthracite").split(" "));
export function modelKey(ctx, p) {
  const brand = normWords(recognizedBrand(ctx, p) || p.brand);
  if (!brand) return null;
  let raw = String(p.title || "").replace(SEASON_TAG, " ").replace(/["“”][^"“”]{1,40}["“”]|(^|\s)['‘][^'’]{1,30}['’](?=\s|$)/g, " ");
  /* "Samba ADV Shoes - Dark Brown/Core Black/Gum": the dash starts the colourway. */
  const seg = raw.split(/\s+[-–|]\s+|\s*\(/)[0];
  if (normWords(seg).split(" ").filter(Boolean).length >= 2) raw = seg;
  let t = dressing(normWords(raw));
  if (BEAUTY_WORDS.test(t) && !SIZE_WORDS.test(t)) return null;
  /* The wearer is read from the WHOLE title ("Old Skool - Women's").
     Women's, kids', preschool and toddler sizes never meet; a men's
     listing and an unlabelled one are both the adult shoe (stores sell
     unisex sneakers in men's sizes). */
  const full = normWords(p.title);
  let wearer = "a";
  for (const [k, re] of WEARER) if (re.test(full)) { wearer = k === "m" ? "a" : k; break; }
  t = t.replace(MAKER_COLOURS, "$1").replace(KIND_PHRASES, " ").replace(WEARER_WORDS, " ");
  const bw = new Set(brand.split(" "));
  const words = [...new Set(t.split(" ").filter((w) => w && !bw.has(w) && !KIND_WORDS.has(w) && !COLOURWAY_WORDS.has(w)))];
  if (!words.length) return null;
  return brand + "|" + wearer + "|" + words.sort().join(" ");
}
/* The style family: the code without its colour. */
export function styleFamilyOf(p) {
  const sc = styleCodeOf(p);
  if (!sc || sc.startsWith("adidas:")) return null;
  return sc.replace(/-[0-9A-Z]{3}$/, "");
}

/* Listings of one model, from a list of products: union of the same
   style family and the same model key where the two families do not
   conflict; a set left holding two families keeps the larger one. */
export function productGroups(ctx, list) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const byKey = new Map(), byFam = new Map();
  list.forEach((p, i) => {
    const f = styleFamilyOf(p);
    if (f) { if (byFam.has(f)) join(byFam.get(f), i); else byFam.set(f, i); }
    const k = modelKey(ctx, p);
    if (!k) return;
    const at = byKey.get(k) || [];
    for (const j of at) { const o = styleFamilyOf(list[j]); if (!(f && o && o !== f)) join(j, i); }
    at.push(i);
    byKey.set(k, at);
  });
  const comps = new Map();
  list.forEach((p, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); });
  const out = [];
  for (const idx of comps.values()) {
    if (idx.length < 2) continue;
    const fams = new Map();
    for (const i of idx) { const f = styleFamilyOf(list[i]); if (f) fams.set(f, (fams.get(f) || 0) + 1); }
    let keep = idx;
    if (fams.size > 1) {
      const top = [...fams].sort((a, b) => b[1] - a[1])[0][0];
      keep = idx.filter((i) => { const f = styleFamilyOf(list[i]); return !f || f === top; });
    }
    out.push(keep.map((i) => list[i]));
  }
  return out;
}
/* A model's chart rows: one listing per store -- its cheapest priced
   listing of the model -- with a real price; list prices within
   MAX_LIST_RATIO. Fewer than two stores is no chart. */
export function comparableMembers(group) {
  const byStore = new Map();
  for (const p of group) {
    if (!(Number(p.price) > 0)) continue;
    const cur = byStore.get(p.retailer);
    if (!cur || Number(p.price) < Number(cur.price)) byStore.set(p.retailer, p);
  }
  const members = [...byStore.values()];
  if (members.length < 2) return null;
  const lists = members.map(listUsd).filter((x) => x > 0);
  if (lists.length && Math.max(...lists) > MAX_LIST_RATIO * Math.min(...lists)) return null;
  return members;
}

/* The charts of this answer (cached): every model at 2+ stores with a
   listing on the first page, strongest first (its best-ranked listing),
   at most COMPARE_MAX_CHARTS. */
export const COMPARE_MAX_CHARTS = 4;
function compareCharts(ctx, r) {
  if (r._cmps !== undefined) return r._cmps;
  r._cmps = [];
  if (!r || r.state !== "results" || (!r._world && isGenericQuery(ctx, r))) return r._cmps;
  const rank = new Map(r.hits.map((p, i) => [p, i]));
  const charts = [];
  /* A core product's charts compare the product itself, model by model. */
  for (const g of productGroups(ctx, r._world ? r._world.devices : r.hits)) {
    const members = comparableMembers(g);
    if (!members) continue;
    const first = Math.min(...g.map((p) => rank.get(p)));
    if (first >= PAGE_SIZE) continue;
    members.sort((a, b) => rank.get(a) - rank.get(b));
    charts.push({ first, members: members.slice(0, COMPARE_MAX_STORES) });
  }
  charts.sort((a, b) => (a.first - b.first) || (b.members.length - a.members.length));
  return (r._cmps = charts.slice(0, COMPARE_MAX_CHARTS).map((c) => c.members));
}
/* Every listing the charts show (the grid leaves them out). */
function compareGroup(ctx, r) {
  const all = compareCharts(ctx, r).flat();
  return all.length ? all : null;
}

/* "Entrega más rápida" only when one store is genuinely faster: every
   store in the block has researched transit days, and this one's
   slowest case beats every other store's slowest case without starting
   later. No data for a store, or a tie, is no badge. */
export function fastestStore(stores) {
  const rows = stores.map((s) => ({ s, d: deliveryFor(s) }));
  if (rows.length < 2 || rows.some((x) => !x.d)) return null;
  const maxOf = (d) => (d.plus ? Infinity : d.miamiMax);
  const minOf = (d) => (d.miamiMin == null ? d.miamiMax : d.miamiMin);
  const sorted = rows.slice().sort((a, b) => maxOf(a.d) - maxOf(b.d));
  const win = sorted[0], next = sorted[1];
  if (!(maxOf(win.d) < maxOf(next.d))) return null;
  if (rows.some((x) => x !== win && minOf(x.d) < minOf(win.d))) return null;
  return win.s;
}

/* WHAT THE COMPARISON COMPARES (#443 c.6544862981, Danny's Amendment 2,
   superseding the total and freight of c.6544802256). On a browse
   surface nobody has an order yet -- the cart can change everything --
   and the freight is the same at every store, so the chart shows only
   what differs BY STORE:
     Producto            the headline, the product page's own number;
     Envío de la tienda  the fee, GRATIS, or "lo calcula la tienda al
                         pagar" -- never a silent $0 -- with the store's
                         free-shipping line ("gratis desde $75").
   Badges: Mejor precio (the product), Envío más barato (the store
   shipping), Mejor costo hasta Miami (product + store shipping, the true
   store-vs-store cost to Aria's Miami warehouse; never while a store
   whose shipping is unknown could still come in under it). Ties hold no
   badge; one store can hold several. No door total, no freight line. */
export function shippingOf(line) {
  const st = (cartShipping([line]).stores || [])[0] || null;
  if (!st || !st.rule) return { state: "unknown", usd: null, freeOverUsd: null };
  const freeOverUsd = st.rule.freeOverUsd > 0 ? st.rule.freeOverUsd : null;
  if (st.pending) return { state: "calc", usd: null, freeOverUsd };
  if (st.feeUsd > 0) return { state: "fee", usd: st.feeUsd, freeOverUsd };
  return { state: "free", usd: 0, freeOverUsd: null };
}
/* The rows at the minimum of `val` (rows without a value never win);
   nobody when every candidate ties. */
function winners(rows, val) {
  const c = rows.filter((x) => val(x) != null);
  if (c.length < 2) return [];
  const m = Math.min(...c.map(val));
  const w = c.filter((x) => val(x) === m);
  return w.length === c.length ? [] : w;
}
const known = (r) => r.ship && (r.ship.state === "fee" || r.ship.state === "free");
export function costToMiami(r) { return known(r) ? Math.round((Number(r.usd) + Number(r.ship.usd)) * 100) / 100 : null; }
export function badgeRows(rows) {
  for (const x of rows) { x.best = false; x.cheapShip = false; x.bestCost = false; }
  for (const x of winners(rows, (r) => (r.usd > 0 ? r.usd : null))) x.best = true;
  for (const x of winners(rows, (r) => (known(r) ? r.ship.usd : null))) x.cheapShip = true;
  /* An unknown shipping leaves that store's cost at its product price or more. */
  const costed = rows.filter((x) => costToMiami(x) != null);
  if (costed.length) {
    const m = Math.min(...costed.map(costToMiami));
    const atMin = costed.filter((x) => costToMiami(x) === m);
    const others = rows.filter((x) => !atMin.includes(x));
    if (atMin.length === 1 && others.length && others.every((x) => (known(x) ? costToMiami(x) : Number(x.usd)) > m)) atMin[0].bestCost = true;
  }
  return rows;
}

function chartFor(ctx, members, fx) {
  const info = ctx.storeInfo || {};
  const rows = members.map((p) => {
    const card = cardOf(p, fx, ctx.labels);
    const ship = shippingOf(cartLineFor({
      retailer: p.retailer, title: p.title, brand: p.brand, cardUsd: card.usd,
      rawUsd: p.finalPrice ? null : p.price, taxRate: salesTaxRate(p.retailer),
    }));
    const d = deliveryFor(p.retailer);
    return {
      id: card.id, store: card.store,
      storeLabel: (info[p.retailer] && info[p.retailer].label) || card.storeLabel,
      logo: (info[p.retailer] && info[p.retailer].logo) || "",
      title: card.title, image: card.image,
      usd: card.usd, pen: card.pen, wasUsd: card.wasUsd, wasPen: card.wasPen,
      ship,
      delivery: d ? { min: d.miamiMin, max: d.miamiMax, plus: !!d.plus, text: miamiRangeEs(d) } : null,
      best: false, cheapShip: false, bestCost: false, fastest: false,
    };
  /* STANDING RULE (Danny 2026-11-02): every comparison chart has
     pictures, always. A store row shows its own photo -- which model,
     which colourway -- so a row without one never renders, and a chart
     needs two pictured rows or it is not shown at all. */
  }).filter((x) => x.usd > 0 && x.image);
  if (rows.length < 2) return null;
  /* Cheapest cost to Miami first; an unknown shipping by its product price. */
  rows.sort((a, b) => ((costToMiami(a) ?? a.usd) - (costToMiami(b) ?? b.usd)) || (a.usd - b.usd));
  badgeRows(rows);
  const fast = fastestStore(rows.map((x) => x.store));
  if (fast) rows.find((x) => x.store === fast).fastest = true;
  const lead = members[0];
  return { title: lead.title, brand: lead.brand || "", image: lead.image || rows[0].image, stores: rows, fx: Number(fx) > 0 ? Number(fx) : null };
}

/** The comparison charts of one answer (page 1): one per model, strongest first. */
export function comparesFor(ctx, r, fx) {
  return compareCharts(ctx, r).map((m) => chartFor(ctx, m, fx)).filter(Boolean);
}
/** The first chart (kept for callers that read one block). */
export function compareFor(ctx, r, fx) {
  return comparesFor(ctx, r, fx)[0] || null;
}

/* A browse query's grid follows the same rule as a lane: its first
   cards are lead-eligible, obscure premium products go to the back.
   The order is computed once per query, so pages never overlap. A
   specific query's grid leaves out the products its comparison block
   already shows. */
function gridOrder(ctx, r) {
  if (r._grid) return r._grid;
  if (r._world || !isGenericQuery(ctx, r)) {
    const shown = compareGroup(ctx, r);
    return (r._grid = shown ? r.hits.filter((p) => !shown.includes(p)) : r.hits);
  }
  /* A device search keeps deviceLead's order: the price-band lead would
     put the cheap cases back in front of the phones. */
  if (r._device) return (r._grid = r.hits);
  const A = annotate(ctx, r);
  return (r._grid = leadFirst(r.hits, A, LEAD_SLOTS + 2));
}

/* One card's worth of a product -- what the page draws, nothing more. */
export function cardOf(p, fx, labels = {}) {
  const usd = p.finalPrice ? Number(p.price) : finalUsd(p.price, p.retailer);
  const was = Number(p.originalPrice) > Number(p.price)
    ? (p.finalPrice ? Number(p.originalPrice) : finalUsd(p.originalPrice, p.retailer)) : null;
  return {
    id: p.id,
    title: p.title,
    brand: p.brand || "",
    store: p.retailer || "",
    storeLabel: labels[p.retailer] || p.retailer || "",
    usd,
    pen: fx ? Math.round(usd * fx * 100) / 100 : null,
    wasPen: fx && was ? Math.round(was * fx * 100) / 100 : null,
    wasUsd: was,
    image: p.image,
    /* ph: the photo count when 2+: the card's photo arrows (#443). */
    ...(p.ph > 1 ? { ph: p.ph } : {}),
    category: p._cat || "",
    /* The condition label (/condition.js, c.6526570723), when the title states one. */
    ...(((c) => (c && c.label ? { condition: c.label } : {}))(conditionOfTitle(p.title))),
  };
}

/**
 * Page `page` (1-based) of the answer to `q`.
 * state: "results" | "none" | "short" | "empty" | "error"
 */
export function searchPage(ctx, q, page = 1, { fx = null, pageSize = PAGE_SIZE } = {}) {
  const typed = String(q == null ? "" : q).trim().slice(0, 120);
  /* Every variant of a name is one search (canonicalQuery). */
  const query = canonicalQuery(ctx, typed);
  const r = equivalentQuery(ctx, query);
  const hits = r.state === "results" ? gridOrder(ctx, r) : r.hits;
  /* The total counts every product found: the grid's and the
     comparison block's. Pages are the grid's. */
  const grouped = r.state === "results" ? (compareGroup(ctx, r) || []).length : 0;
  const total = hits.length + grouped;
  const pages = Math.max(1, Math.ceil(hits.length / pageSize));
  const n = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  const slice = hits.slice((n - 1) * pageSize, n * pageSize);
  const lanes = n === 1 ? lanesFor(ctx, query, r, fx) : null;
  const compares = n === 1 && grouped ? comparesFor(ctx, r, fx) : [];
  const compare = compares[0] || null;
  /* A store's name: its page (the doctrine, item 1). */
  const store = n === 1 ? storeFor(ctx, query) : null;
  return {
    q: typed,
    ...(query !== typed ? { canonical: query } : {}),
    state: r.state,
    store: store || null,
    page: n,
    pageSize,
    pages,
    total,
    /* The ranker stopped at RESULT_LIMIT: "más de 2000", not "2000". */
    capped: total >= ctx.resultLimit,
    shown: r.shown || null,
    missingBrand: r.missingBrand || null,
    sense: r.sense || null,
    suggestion: r.suggestion || null,
    didYouMean: n === 1 ? didYouMean(ctx, query, r) : null,
    /* Other spellings of the query that find more (page 1 only). */
    alsoTry: n === 1 && r.state !== "error" ? alsoTry(ctx, query, r.state === "results" ? r.hits.length : 0) : [],
    /* "generic": the lanes lead; "specific": the results lead, the
       lanes follow (#416). Page 1 only. */
    mode: lanes ? lanes.mode : null,
    lanes: lanes ? lanes.lanes : null,
    /* One product at 2+ stores, door prices side by side (#416).
       Page 1 only; its products are not repeated in the grid. */
    compare,
    /* One chart per model (#443 c.6544967818); compare is the first. */
    compares,
    fx: fx || null,
    items: slice.map((p) => cardOf(p, fx, ctx.labels)),
  };
}
