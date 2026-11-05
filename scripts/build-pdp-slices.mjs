#!/usr/bin/env node
/* ============================================================
   assets/pdp/ — THE PRODUCT PAGE'S DATA, ONE PRODUCT AT A TIME.

   WHY (2026-10-19, #409 track T1). To show ONE product, producto.html
   downloaded its store's whole catalogue -- 39.8MB for SSENSE, three
   files for Target -- and on a miss every catalogue on the site (210MB).
   Its related rails were then picked from that same pool plus the
   Ofertas head (750KB). On the Mountain profile (400 kbps, 2 s RTT) a
   Target or SSENSE product never finished loading.

   HOW. Nothing is re-implemented. This lifts the page's own code out of
   producto.html (STORE_FILES, CATALOG_FILES, extractItems, normalizeItem,
   truthfulSizes, norm, the rail lane/gender rules and the shard hash) and
   runs it over the committed catalogues, at build time, exactly as the
   page used to run it in the shopper's phone. It writes:

     assets/pdp/p/<hhh>.json        product records, sharded by a hash of
                                    the normalised title (the page knows
                                    the title from ?producto=). Each title
                                    lists every record that carries it,
                                    with the catalogue file and position it
                                    came from, so the page picks the same
                                    one the old download-and-scan did:
                                    the ?tienda= files first, in order,
                                    then every catalogue in CATALOG_FILES
                                    order.
     assets/pdp/auto-pn/<hh>.json   AutoZone parts by part number, and
     assets/pdp/auto-t/<hh>.json    by title -- small auto-cache.json-shaped
                                    files, each holding the record the old
                                    full-cache scan returned (huntAuto is
                                    unchanged).
     assets/pdp/rails/<k>/<lane>-<dept>.json  the sale items one
                                    retailer's rails can ever pick for a
                                    product in that lane and department
                                    (see storeRails): relPick's top 12
                                    over the file is its top 12 over the
                                    whole catalogue.
     assets/pdp/rails/lane-<k>.json   the Ofertas head's sale rows in one
                                    lane (the cross rail's other pool).
     assets/pdp/g/<hhh>.json        COLOURWAYS (#443 variant order, Phase 1):
                                    one model's colourways at one store
                                    (scripts/lib/variants.mjs), keyed by
                                    the group id each member record
                                    carries as `g`. Each variant: its id
                                    `v`, the store's colour `c`, its own
                                    title, photos, price and sizes -- what
                                    the picker swaps in. A store whose
                                    source carries its variants (Walmart
                                    shade families, Macy's colours:
                                    scripts/data/variant-families/,
                                    scripts/lib/variant-families.mjs)
                                    groups by that structure instead;
                                    its shades with no real price or
                                    photo yet sit under "<g>~p" (labels
                                    only, never offered).
     assets/pdp/index.json          counts and sizes, for the tests.

   REGENERATE after any catalogue, auto-cache or Ofertas refresh:
     node scripts/build-pdp-slices.mjs
   scripts/test/pdp-thin-tests.mjs fails when a catalogue item no longer
   opens through the shards, or a shard grows past the phone budget.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { liftDeclarations } from "./lib/page-lift.mjs";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { variantIdOf, groupColourways, beautyShade, shadeListing, listingShade, HAIR_COLOUR } from "./lib/variants.mjs";
import { kindOf as shadeKindOf } from "./lib/shade-gate.js";
import { loadFamilies, applyFamilies, loadSizeRuns, sizeRunFor } from "./lib/variant-families.mjs";
import { isShoeForDept } from "./lib/footwear.js";
import { sizesPendingKey } from "./lib/sizes-pending.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PDP_DIR = "assets/pdp";
/* A shard must stay a quick fetch on 400 kbps. */
export const MAX_SHARD_GZ = 30 * 1024;

export const LIFTED = ["PDP_SHARDS", "AUTO_SHARDS", "pdpHash", "pdpShard", "autoShard", "STORE_FILES", "CATALOG_FILES",
  "NAMED_ENTITIES", "decodeEntities", "galleryPhotoKey", "galleryIsChart", "tidyGallery", "normalizeItem", "extractItems", "norm", "SIZE_ALPHA_ORDER", "SIZE_NUMERIC",
  "SIZE_ALPHA_ALIAS", "alphaRank", "sizeKey", "sortSizes", "truthfulSizes", "REL_MAX", "REL_LANES", "relLane",
  "relGender", "relKey", "pickRecord", "deptSlug", "railPath", "G_SHARDS", "groupShard"];

/* The page's own code, with the sale rule and the classifier it loads. */
export function liftPage(root = ROOT) {
  const extra = "var window = {};\n" + readFileSync(root + "sale-rule.js", "utf8") + "\n" + readFileSync(root + "product-type.js", "utf8") + "\n";
  return liftDeclarations(readFileSync(root + "producto.html", "utf8"), LIFTED, { extra });
}

/* Every file the page could ever have scanned: the fallback list, then
   any store-only file. */
export function sourceFiles(P) {
  return [...new Set([...P.CATALOG_FILES, ...Object.values(P.STORE_FILES).flat()])];
}

/* THE GALLERY, COMPACT (2026-10-19, #434 / #440). normalizeItem gives
   every record its full gallery (card photo first, real photos only,
   one copy each, at most 12). In the shard each URL is written against
   the one before it (the first against the record's own `image`): a
   shared beginning becomes its length, so a Shopify gallery of eight
   "https://cdn.shopify.com/s/files/1/0123/4567/files/..." costs one
   prefix, not eight -- "57|IMG_2.jpg?v=1". A URL that shares under 12
   characters is written whole (it starts with "http", never a digit).
   A gallery that is only the card photo is left out: the page falls
   back to [image]. unpackImages in producto.html reverses this, and
   pdp-thin-tests round-trips every record. */
export function packImages(images, image) {
  if (!Array.isArray(images) || !images.length) return null;
  if (images.length === 1 && images[0] === image) return null;
  if (process.env.PDP_PLAIN_IMAGES) return images.slice();
  const out = [];
  let prev = String(image || "");
  for (const u of images) {
    let n = 0;
    while (n < u.length && n < prev.length && u[n] === prev[n]) n++;
    out.push(n >= 12 ? n + "|" + u.slice(n) : u);
    prev = u;
  }
  return out;
}

/* What the page renders, and nothing else. Empty fields are left out.
   `url` is the one exception: the retailer's product page rides to the
   cart line as data for the buyer's dispatch packet, absolute http(s)
   only (a relative path is no URL). The page never renders it and never
   links out. */
/* v / g / c (#443 variants): the listing's own id, its colourway group and
   the store's colour for it. v rides only where it tells two listings
   apart (a title more than one listing carries) or names a colourway. */
/* ax: the picker's word when it is not "Color" ("Tono" for a shade
   family); so: the store lists this variant as out of stock. */
/* sizesOut: the rest of the store's own size run, sold out there
   (SNIPES' disabled size buttons, #443): the picker shows them marked
   agotada and never sells them (producto.html soldOutSizes). */
/* sk: the product is sold in shades ("makeup" / "hair", /shade-gate.js),
   decided at build time with the store's own aisle ("type": Ulta's
   "Labios", "Ojos", "Rostro"), which the record does not otherwise carry. */
const RECORD_FIELDS = ["name", "brand", "price", "wasPrice", "salePct", "image", "images", "description", "sizes", "sizesOut", "sizesTier", "sizesSource", "sizesPending", "dept", "retailer", "weightKg", "weightPub", "specWeightKg", "weightBySize", "url", "v", "g", "c", "ax", "so", "sk"];
const absoluteUrl = (u) => (typeof u === "string" && /^https?:\/\/[^\s\/?#]+/i.test(u.trim()) ? u.trim() : "");
function recordOf(it) {
  const out = {};
  for (const k of RECORD_FIELDS) {
    const v = k === "images" ? packImages(it.images, it.image) : k === "url" ? absoluteUrl(it.url || it.link) : it[k];
    if (v === undefined || v === null || v === "" || v === 0 || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = Array.isArray(v) ? Array.from(v) : v;
  }
  return out;
}
const RAIL_FIELDS = ["name", "retailer", "image", "price", "wasPrice", "salePct", "dept"];
function railOf(it) {
  const out = {};
  for (const k of RAIL_FIELDS) if (it[k] !== undefined && it[k] !== null && it[k] !== "" && it[k] !== 0) out[k] = it[k];
  return out;
}

function stableJson(obj) {
  return JSON.stringify(obj);
}

/* ---------- product records ---------- */
/* What the colour picker swaps: one variant of a group. Its own store
   URL rides along (data for the cart line's dispatch packet, never a
   link): the shade picked is the listing bought. */
/* sp: a shade sold on the same listing's page (a YesStyle pid, a Victoria's
   Secret catalog id; scripts/lib/variant-families.mjs applyPageFamily):
   its photo is the page's, not a swatch of that shade. */
const VARIANT_FIELDS = ["v", "c", "name", "price", "wasPrice", "salePct", "image", "images", "sizes", "sizesOut", "sizesTier", "sizesSource", "sizesPending", "url", "so", "sp"];
export function variantOf(it) {
  const out = {};
  for (const k of VARIANT_FIELDS) {
    const v = k === "images" ? packImages(it.images, it.image) : k === "url" ? absoluteUrl(it.url || it.link) : it[k];
    if (v === undefined || v === null || v === "" || v === 0 || v === false || (Array.isArray(v) && !v.length)) continue;
    out[k] = Array.isArray(v) ? Array.from(v) : v;
  }
  return out;
}
/* The store's own aisle per listing (the raw record's "type"), by title
   and URL: the page's normalised record drops it. */
function storeTypes(raw) {
  const out = new Map();
  const st = [raw];
  while (st.length) {
    const n = st.pop();
    if (Array.isArray(n)) { for (const x of n) if (x && typeof x === "object") st.push(x); continue; }
    if (!n || typeof n !== "object") continue;
    if (typeof n.name === "string" && typeof n.type === "string" && n.type) {
      out.set(n.name + "|" + String(n.url || n.link || ""), n.type);
      if (!out.has(n.name)) out.set(n.name, n.type);
    }
    for (const k in n) { const v = n[k]; if (v && typeof v === "object") st.push(v); }
  }
  return out;
}
/* families / sourceFilesOverride: tests build a page's data from
   fixtures ({ "/file.json": envelope }) through this same code. */
export function buildRecords(P, root = ROOT, families = null, sourceFilesOverride = null, sizeRuns = null) {
  const byKey = new Map();          // norm(title) -> [{ rec, json, src: [[file, pos]] }]
  const byRetailer = new Map();     // retailer -> [normalised items], file order
  const shoes = new Map();          // retailer::name -> { retailer, name, brand, sized }
  const files = sourceFiles(P);
  let items = 0;
  /* Pass 1: every listing, with its own id. */
  const all = [];
  for (const f of sourceFilesOverride ? Object.keys(sourceFilesOverride) : files) {
    const p = root + f.slice(1);
    if (!sourceFilesOverride && !existsSync(p)) continue;
    const raw = sourceFilesOverride ? sourceFilesOverride[f] : JSON.parse(readFileSync(p, "utf8"));
    const types = storeTypes(raw);
    const list = P.extractItems(raw);
    list.forEach((it, pos) => {
      it.__v = variantIdOf(it.url, it.retailer + "|" + it.name + "|" + it.image);
      it.__type = types.get(String(it.name || "") + "|" + String(it.url || "")) || types.get(String(it.name || "")) || "";
      all.push({ f, pos, it });
    });
  }
  /* Each listing's own store run (applyStoreSizeRun, below) before the
     families read the listings' sizes. */
  const runs = sizeRuns || (sourceFilesOverride ? new Map() : loadSizeRuns(root));
  for (const { it } of all) applyStoreSizeRun(P, it, runs);
  /* Colourway groups, one listing per id (the same listing can sit in two
     files), in file order. */
  const firstByV = new Map();
  for (const { it } of all) if (!firstByV.has(it.__v)) firstByV.set(it.__v, it);
  /* The store's own variant structure first (variant families): its
     members leave the title grouping, and members the catalogue lacks
     (a shade with its own real price and photo from the pull) become
     listings of their own, after every catalogue file. */
  const fams = applyFamilies([...firstByV.values()].map((it) => ({ ...it, v: it.__v })), families || loadFamilies(root),
    all.map(({ it }) => ({ ...it, v: it.__v })));
  fams.extra.forEach((x, pos) => {
    const it = P.normalizeItem({ ...x, __family: undefined, v: undefined }, x.retailer);
    if (!it) return;
    it.__v = x.v;
    if (x.dept) it.dept = x.dept;
    if (x.sizesPending) it.sizesPending = true;
    if (x.sp) it.sp = 1;
    if (!firstByV.has(it.__v)) { firstByV.set(it.__v, it); all.push({ f: "/" + x.__family, pos, it }); }
  });
  /* NO SHOE SOLD WITHOUT ITS SIZE (#443 c.6635781472). Danny opened the
     first cleat in Dick's Zapatos rail: no size anywhere, «Agregar al
     carrito» live -- the #411 rule sells a record with no size list
     plainly, and a shoe whose store never gave us its sizes is exactly
     that record. A shoe (the Zapatos door, scripts/lib/footwear.js
     isShoeForDept, on the store's own type) with no size list and no
     sold-out run is sizes-pending: shown, «Tallas por confirmar», not
     sold (scripts/lib/sizes-pending.js; the order door refuses it too).
     Never a guessed size. Decided here, where every record the product
     pages read is built, so no store can ship sizeless shoes again: when
     a size pass lands, the record has sizes and the flag stays off. */
  /* THE STORE'S OWN RUN FIRST (#443 c.6644778221): a shoe whose own
     product feed lists its sizes (scripts/data/variant-families/<store>.json
     sizeRuns, scripts/lib/variant-families.mjs shopifySizeRuns) takes that
     run before the rule below looks for one. Fixtures pass their own. */
  for (const { it } of all) applyStoreSizeRun(P, it, runs);
  for (const it of firstByV.values()) markShoeSizesPending(P, it);
  for (const { it } of all) markShoeSizesPending(P, it);
  const titleGrouping = groupColourways([...firstByV.values()].filter((it) => !fams.assign.has(it.__v))
    .map((it) => ({ v: it.__v, retailer: it.retailer, name: it.name, brand: it.brand, url: it.url, image: it.image, dept: it.dept })));
  const grouping = new Map([...titleGrouping, ...fams.assign]);
  const vsByTitle = new Map();
  for (const { it } of all) {
    const key = P.norm(it.name);
    if (!vsByTitle.has(key)) vsByTitle.set(key, new Set());
    vsByTitle.get(key).add(it.__v);
  }
  const groups = new Map();         // g -> [variant], file order
  for (const [v, it] of firstByV) {
    const m = grouping.get(v);
    if (!m) continue;
    if (!groups.has(m.g)) groups.set(m.g, []);
    groups.get(m.g).push(variantOf({ ...it, v, c: m.c, so: m.so, sp: m.sp || it.sp }));
  }
  /* Pass 2: the records, as before, now naming their listing. */
  for (const { f, pos, it } of all) {
    items++;
    const key = P.norm(it.name);
    const m = grouping.get(it.__v);
    if (m || vsByTitle.get(key).size > 1) it.v = it.__v;
    /* A title that names its own shade on a page several titles share
       (applyFamilies `ownByName`): that shade, whatever the page's id holds. */
    const byName = fams.ownByName && fams.ownByName.get(it.__v + "|" + it.name);
    if (byName) { it.c = byName.c; it.ax = byName.ax; }
    else if (m) { it.g = m.g; it.c = m.c; if (m.ax) it.ax = m.ax; if (m.so) it.so = 1; }
    /* A gated beauty listing whose store's shade list names its one
       shade (scripts/lib/variant-families.mjs applyFamilies `own`): that
       shade is its tono -- named on the page, carried by the line. */
    else if (fams.own && fams.own.has(it.__v)) {
      const o = fams.own.get(it.__v);
      it.c = o.c; it.ax = o.ax;
      if (o.so) it.so = 1;
    }
    /* A hair dye sold in one shade here still names it (#443 c.6568752464):
       the store's own shade from its title rides as the record's tono --
       the page writes it as text and the cart line carries it. No group,
       no picker. */
    else if (HAIR_COLOUR.test(it.name || "") && shadeListing(it)) {
      const sh = beautyShade(it.name);
      if (sh) { it.c = sh.shade; it.ax = "Tono"; }
    }
    /* ANY SHADE PRODUCT SOLD HERE IN ONE SHADE (Danny after #583: "nobody
       buys makeup they can't pick a color for"): a Walmart lipstick, liner
       or foundation no family holds still names its own shade in its
       title (scripts/lib/variants.mjs listingShade). That is its tono:
       the page shows it and the cart line carries it. No shade in the
       title: the record stays as it is and the shade gate (/shade-gate.js)
       keeps it out of the cart. */
    const sk = shadeKindOf({ ...it, type: it.__type });
    if (sk) it.sk = sk;
    delete it.__type;
    if (!it.c && shadeListing(it) && shadeKindOf(it)) {
      const shade = listingShade(it.name, it.retailer);
      if (shade) { it.c = shade; it.ax = "Tono"; }
    }
    delete it.__v;
    if (it.__shoe) {
      const sk = it.retailer + "::" + it.name;
      if (!shoes.has(sk)) shoes.set(sk, { retailer: it.retailer, name: it.name, brand: it.brand || "", sized: it.__shoe === true, feed: it.__run === true });
      else if (it.__shoe === true) { shoes.get(sk).sized = true; if (it.__run === true) shoes.get(sk).feed = true; }
    }
    delete it.__shoe;
    delete it.__run;
    const rec = recordOf(it);
    const json = stableJson(rec);
    let cands = byKey.get(key);
    if (!cands) byKey.set(key, (cands = []));
    let c = cands.find((x) => x.json === json);
    if (!c) cands.push((c = { rec, json, src: [] }));
    c.src.push([f, pos]);
    if (!byRetailer.has(it.retailer)) byRetailer.set(it.retailer, []);
    byRetailer.get(it.retailer).push(it);
  }
  return { byKey, byRetailer, items, files, groups, pending: fams.pending, familyStats: fams.stats, shoes };
}
/* The shoe rule above, one listing at a time. `__shoe` marks every shoe
   for the report (true: sized; "pending": no size data). */
/* What the Zapatos door lets through that is not worn on a foot (its
   store filed it with the shoes, or a shoe word is a perfume's or a
   shade's name): sold as it always was, never "Tallas por confirmar". */
export const NOT_A_SHOE_RX = /\b(eau de (parfum|toilette)|perfumes?|lip tint|lipstick|gun boot|boottector|brackets?|boot mount|snubber|duff(el|le)|gym bags?|travel bag|weekender)\b/i;
/* ...and words that name a shoe's accessory, unless the title still ends
   on a shoe ("Pouch Kitten Bootie", "Patch Girls ... Slippers"). */
const ACCESSORY_RX = /\b(pouch|sprays?|shine|refresh|diffuser|cleaning kit|clean kit|care kit|cleaner|conditioner|patch|puck set|mitts|backpack|carry on|daypack|pants)\b|^right pack$/i;
const ENDS_ON_SHOE_RX = /\b(shoes?|sneakers?|boots?|booties?|bootie|sandals?|slides?|flip[- ]?flops?|cleats?|loafers?|heels?|clogs?|slippers?|mules?|flats|pumps?|trainers?)\s*(\([^)]*\)|-[^-]*)?\s*$/i;
const notAShoe = (name) => NOT_A_SHOE_RX.test(name) || (ACCESSORY_RX.test(name) && !ENDS_ON_SHOE_RX.test(name));
/* A shoe with no size list of its own takes the run its store's product
   feed lists for that very product (by handle; by ?variant= for a colour
   of a multi-colour product). Only a shoe, only an unsized listing, and
   only the store's own values: in stock as `sizes`, the sold-out rest as
   `sizesOut`. */
export function applyStoreSizeRun(P, it, runs) {
  if (!it || !runs || !runs.size || it.__run !== undefined) return;
  it.__run = false;
  if (P.truthfulSizes(it.sizes).length || (Array.isArray(it.sizesOut) && it.sizesOut.length)) return;
  if (notAShoe(String(it.name || "")) || !isShoeForDept({ name: it.name, type: it.__type || it.type || "" }, it.retailer)) return;
  const run = sizeRunFor(runs, it.retailer, it.url);
  if (!run) return;
  const sizes = P.truthfulSizes(run.sizes);
  if (!sizes.length) return;
  it.sizes = sizes;
  const out = Array.isArray(run.sizesOut) ? run.sizesOut.filter((z) => typeof z === "string" && z.trim() && !sizes.includes(z)) : [];
  if (out.length) it.sizesOut = out;
  it.sizesTier = "scrape";
  it.sizesSource = run.source;
  it.sizesPending = false;
  it.__run = true;
}
export function markShoeSizesPending(P, it) {
  if (!it || it.__shoe !== undefined) return;
  if (notAShoe(String(it.name || "")) || !isShoeForDept({ name: it.name, type: it.__type || it.type || "" }, it.retailer)) { it.__shoe = false; return; }
  const sized = P.truthfulSizes(it.sizes).length > 0 || (Array.isArray(it.sizesOut) && it.sizesOut.length > 0);
  it.__shoe = sized ? true : "pending";
  if (!sized) it.sizesPending = true;
}

function writeJson(rel, obj) {
  const text = JSON.stringify(obj);
  writeFileSync(join(ROOT, rel), text);
  return { bytes: Buffer.byteLength(text), gz: gzipSync(text).length };
}
function resetDir(rel) {
  const dir = join(ROOT, rel);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
}

/* ---------- AutoZone parts (auto-cache.json, 22MB) ---------- */
const AUTO_FIELDS = ["productTitle", "title", "brand", "price", "thumbnail", "part_number"];
export function autoRecOf(rec) {
  const out = {};
  for (const k of AUTO_FIELDS) if (rec[k] !== undefined && rec[k] !== null && rec[k] !== "") out[k] = rec[k];
  /* The whole gallery, as huntAuto hands it to normalizeItem (which keeps
     real photos, one copy each, at most 12). It kept only images[0]
     until the gallery coverage report (#443): no cached part has a
     second photo yet, so no shard changed, but a refresh that brings
     galleries back must not lose them here. */
  if (Array.isArray(rec.images)) {
    const imgs = rec.images.filter((u) => u && (typeof u === "string" || typeof u === "object")).slice(0, 12);
    if (imgs.length) out.images = imgs;
  }
  return out;
}
/* The record huntAuto's full-cache scan returns, for every part number
   and every title it can be asked for. */
export function autoAnswers(P, cache) {
  const ps = (cache && cache.partSearches) || {};
  const keys = Object.keys(ps);
  const byPn = new Map(), byTitle = new Map(), firstPn = new Map();
  for (const k of keys) for (const src in ps[k] || {}) for (const rec of Array.isArray(ps[k][src]) ? ps[k][src] : []) {
    const t = P.norm(rec.productTitle || rec.title || "");
    if (!byTitle.has(t)) byTitle.set(t, { rec, src });
    const pn = String(rec.part_number || "").toUpperCase();
    if (pn && !firstPn.has(pn)) firstPn.set(pn, { rec, src });
  }
  const idx = cache.partNumberIndex || {};
  for (const pn of firstPn.keys()) {
    let best = null;
    for (const e of idx[pn] || []) {
      const bySrc = ps[e[0]] || {};
      for (const src in bySrc) {
        const rec = (Array.isArray(bySrc[src]) ? bySrc[src] : []).find((r) => String(r.part_number || "").toUpperCase() === pn);
        if (rec) { best = { rec, src }; break; }
      }
      if (best) break;
    }
    byPn.set(pn, best || firstPn.get(pn));
  }
  return { byPn, byTitle };
}

/* ---------- rails ---------- */
const GROUP_KEEP = 13;   // REL_MAX + the product itself, which relPick sets aside
function eligible(P, list) {
  const seen = new Set(), out = [];
  for (const it of list) {
    if (!it || !it.image || !(it.salePct > 0)) continue;
    /* Same title, same department: the same candidate to relPick. A copy
       in another department is kept -- relPick may drop one copy for its
       gender and take the other. */
    const k = P.relKey(it) + "|" + (it.dept || "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
/* Per group, the top `keep` by discount (ties in source order); the
   result keeps source order, which relPick's stable sort relies on. */
function topPerGroup(list, groupOf, keepUntil) {
  const groups = new Map();
  list.forEach((it, i) => {
    const g = groupOf(it);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ it, i });
  });
  const keep = new Set();
  for (const arr of groups.values()) {
    const sorted = arr.slice().sort((a, b) => (b.it.salePct - a.it.salePct) || (a.i - b.i));
    /* Copies of one title count once: relPick takes only the first. */
    const kept = [], titles = new Set();
    for (const x of sorted) {
      const t = (x.it.retailer || "") + "|" + x.it.name;
      if (!titles.has(t) && keepUntil(kept)) break;
      keep.add(x.i);
      if (!titles.has(t)) { titles.add(t); kept.push(x); }
    }
  }
  return list.filter((_, i) => keep.has(i));
}
/* One store's rail files, one per (lane, department) an anchor can
   have. relPick scores a candidate only by whether it shares the
   anchor's lane (4), department (2) and gender (1), drops the other
   gender, and breaks ties by discount. So for an anchor in lane L and
   department D, the items are grouped by (in lane L?, in department
   D?, gender) and each group keeps its deepest discounts: 13 (REL_MAX +
   the anchor itself, which relPick sets aside), or 25 for lane-L groups
   -- the cross rail ranks the store's own lane items too, after setting
   aside the 12 the store rail took. relPick's top 12 over the file is
   its top 12 over the whole store. Items that can never score for this
   anchor (no shared lane or department, no gender) are left out. */
const keep13 = (kept) => kept.length >= GROUP_KEEP;
/* masked: titles the Ofertas head also carries. The cross rail meets
   the head's (department-less) copy first and skips the store's, so
   those do not count toward the cross rail's 25. */
export function storeRails(P, items, masked = new Set()) {
  const keep25 = (kept) => kept.length >= GROUP_KEEP && kept.filter((x) => !masked.has(x.it.__x.key)).length >= 2 * GROUP_KEEP - 1;
  const laneOf = (it) => (P.relLane(it) || {}).key || "";
  const el = eligible(P, items).map((it) => ({ it, key: P.relKey(it), lane: laneOf(it), dept: it.dept || "", g: P.relGender(it) }));
  const copiesOf = new Map();
  for (const x of el) { if (!copiesOf.has(x.key)) copiesOf.set(x.key, []); copiesOf.get(x.key).push(x); }
  const depts = new Set([""]);
  for (const it of items) depts.add(it.dept || "");
  const lanes = ["", ...P.REL_LANES.map((l) => l.key)];
  const top = (list, groupOf, until) => topPerGroup(list.map((x) => ({ ...x.it, __x: x })), (it) => groupOf(it.__x), until).map((it) => it.__x);
  const out = new Map();
  for (const L of lanes) {
    for (const D of depts) {
      const inL = (x) => !!L && x.lane === L, inD = (x) => !!D && x.dept === D;
      const group = (x) => inD(x) + "|" + x.g;
      const A = top(el.filter(inL), group, keep25);
      const B = top(el.filter((x) => !inL(x) && (inD(x) || x.g)), group, keep13);
      const keep = new Set([...A, ...B]);
      /* relPick takes the FIRST copy of a title it meets (source order)
         and ignores the rest, so every earlier copy of a kept title
         rides along: the page then meets the same first copy. */
      for (const x of [...keep]) for (const y of copiesOf.get(x.key)) { if (y === x) break; keep.add(y); }
      out.set((L || "none") + "-" + P.deptSlug(D), el.filter((x) => keep.has(x)).map((x) => x.it));
    }
  }
  return out;
}
export function laneRails(P, rows) {
  const out = {};
  const el = eligible(P, rows);
  for (const lane of P.REL_LANES) {
    const inLane = el.filter((it) => { const l = P.relLane(it); return l && l.key === lane.key; });
    /* All of them: the head is 800 rows, a lane is a few KB, and a
       store's own row (dept-less) must stay ahead of its catalogue copy. */
    out[lane.key] = inLane;
  }
  return out;
}
export function ofertasRows(P, root = ROOT) {
  const feed = JSON.parse(readFileSync(root + "ofertas-feed-lite.json", "utf8"));
  return (feed && feed.items || []).filter((row) => !isOffSaleRetailer(row && row.retailer))
    .map((row) => P.normalizeItem(row, row.retailer)).filter(Boolean);
}

/* ---------- shoes with no size data (#443 c.6635781472) ----------
   scripts/lib/sizes-pending-shoes-data.js: the order door's list of them
   (scripts/lib/sizes-pending.js reads it beside the pulls' list), and
   reports/shoes-sizes-pending-2026-11-04.json: per store, its shoes sized
   and sizes-pending, and the cannot-restore list -- the stores whose
   size data was never captured in any source we hold, with examples. A
   name some listing of that store sells in sizes is not on the list
   (the order line carries the size it was bought in). */
export const SHOES_REPORT = "reports/shoes-sizes-pending-2026-11-04.json";
/* What each store's pull lacks, measured 2026-11-04 (#443 c.6644778221,
   the per-store size accounting): every catalogue file, data/ pull wave,
   reports/ file and every git branch's copy was searched for a size,
   variant, option or attribute field and for size text. */
export const SIZE_GAPS = {
  ssense: "catalogue rows carry no size field; data/gallery-repull-2026-10-30/ssense.json is photos only; variant-truth (data/variant-truth-2026-10-18) has no run for these titles",
  kohls: "data/colorways-2026-11-01/dataset-kohls.json 'variations' names the axis only (\"SizeAndColor\", \"Size\"), never a size value; gallery repull photos only; sizes-wave-urls holds URL lists that were never pulled",
  walmart: "catalogue and department cache carry no size field; gallery repull photos only; variant-truth: product pages bot-walled (\"Robot or human?\")",
  dicks: "no size field in any of the six versions of dicks-catalog.json in git (232 and 572 rows); variant-truth: pages bot-walled (HTTP 403); sizes-wave-urls/dicks-live-urls.txt is 211 URLs never pulled",
  zumiez: "data/colorways-2026-11-01/dataset-zumiez.json (Magento listing) has sku, name, price and categories, no configurable options",
  tenniswarehouse: "the 2026-11-01 sweep's availableSizes holds the label only (\"US Women's Shoe Size:\") or nothing; 45 rows carry one spec value (\"us women's shoe size: 6.0\"), not a run",
  dsw: "the 2026-11-01 delivery (apify/e-commerce-scraping-tool) has sizeSource \"none\" and an empty availableSizes on all 171 rows, no variants, no size text; the 2026-11-03 re-pull was stopped by DataDome (data/pull-wave-2026-11-03/dsw/REPORT.md)",
  jwpei: "catalogue rows carry no size field; no raw pull held",
  revolve: "catalogue rows carry no size field; no raw pull held",
  academy: "catalogue rows carry no size field; gallery repull photos only; variant-truth: pages bot-walled",
  farfetch: "catalogue rows carry no size field; no raw pull held",
  tennisexpress: "variant-truth: product pages gone (HTTP 404) or one-size",
  carolinaherrera: "the 2026-10-27 pull's JSON-LD carries no size run; gallery repull photos only",
  pacsun: "variant units (SKU, URL, stock) without their size labels (data/pull-wave-2026-11-03/pacsun/REPORT.md)",
  surfstation: "the store feed lists these with every size sold out, or with no size axis (\"Default Title\")",
  farmrio: "the store feed lists these with every size sold out, or does not hold their handle",
  johannaortiz: "the store feed lists these with every size sold out, or does not hold their handle",
  vix: "the store feed lists it with every size sold out",
  crocs: "variant-truth: page fetched, no size variation data",
  miumiu: "catalogue rows carry no size field; gallery repull photos only",
  islandwatersports: "the store feed lists no size axis (\"Default Title\")",
  prosoccer: "catalogue rows carry no size field; variant-truth: one-size or not checked",
  xtremesoccer: "catalogue rows carry no size field; no raw pull held",
  hottopic: "catalogue rows carry no size field; gallery repull photos only",
  macys: "catalogue rows carry no size field; no colourway run for these listings",
  bananarepublic: "catalogue rows carry no size field; no raw pull held",
  hollister: "catalogue row carries no size field; gallery repull photos only",
  newbalance: "catalogue row carries no size field; no raw pull held",
  revzilla: "catalogue row carries no size field; no raw pull held",
  snipes: "the 2026-10-27 pull's JSON-LD carries no size run",
};
/* Every shoe's "<retailer>::<title>" as an FNV-1a hex, per store: which
   card on a store page is a shoe, for scripts/test/shoe-first-click-tests.mjs. */
export function shoeHash(retailer, name) {
  const s = String(retailer) + "::" + String(name);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function writeShoesSizesPending(shoes) {
  const byStore = {}, keys = new Set(), cannot = {}, hashes = {};
  for (const s of [...shoes.values()].sort((a, b) => a.retailer.localeCompare(b.retailer) || a.name.localeCompare(b.name))) {
    const b = byStore[s.retailer] || (byStore[s.retailer] = { shoes: 0, sized: 0, sizesPending: 0, offSale: isOffSaleRetailer(s.retailer) || undefined });
    b.shoes++;
    (hashes[s.retailer] || (hashes[s.retailer] = [])).push(shoeHash(s.retailer, s.name));
    if (s.sized) { b.sized++; if (s.feed) b.fromStoreFeed = (b.fromStoreFeed || 0) + 1; continue; }
    b.sizesPending++;
    keys.add(sizesPendingKey(s.retailer, s.name));
    const c = cannot[s.retailer] || (cannot[s.retailer] = { count: 0, titles: [] });
    c.count++; c.titles.push(s.name);
  }
  for (const [k, c] of Object.entries(cannot)) c.examples = c.titles.slice(0, 5);
  writeFileSync(join(ROOT, "scripts/lib/sizes-pending-shoes-data.js"),
    "/* GENERATED by scripts/build-pdp-slices.mjs -- shoes with no size data from their store, shown but not sold\n" +
    "   until their sizes are captured (scripts/lib/sizes-pending.js; #443 c.6635781472). Do not edit by hand. */\n" +
    "export const SHOES_SIZES_PENDING = " + JSON.stringify([...keys].sort()) + ";\n");
  const order = Object.keys(cannot).sort((a, b) => cannot[b].count - cannot[a].count || a.localeCompare(b));
  writeFileSync(join(ROOT, SHOES_REPORT), JSON.stringify({
    note: "Shoes whose store's size data was never captured in any source we hold (catalogue pulls, data/ pull waves, reports/, git history). Shown with «Tallas por confirmar», never sold sizeless, never given invented sizes. fromStoreFeed: shoes whose run comes from the store's own product feed (scripts/data/variant-families/<store>.json sizeRuns). pullLacked: what the pull we hold is missing. Built by scripts/build-pdp-slices.mjs.",
    totals: { shoes: shoes.size, sized: [...shoes.values()].filter((s) => s.sized).length, sizesPending: keys.size },
    footwearByStore: Object.fromEntries(Object.keys(byStore).sort().map((k) => [k, byStore[k]])),
    cannotRestore: Object.fromEntries(order.map((k) => [k, { offSale: isOffSaleRetailer(k) || undefined, count: cannot[k].count, pullLacked: SIZE_GAPS[k] || undefined, examples: cannot[k].examples, titles: cannot[k].titles }])),
    shoeHashes: Object.fromEntries(Object.keys(hashes).sort().map((k) => [k, hashes[k].sort().join(" ")])),
  }, null, 1) + "\n");
}

/* ---------- main ---------- */
function main() {
  const t0 = Date.now();
  const P = liftPage();
  const { byKey, byRetailer, items, files, groups, pending, familyStats, shoes } = buildRecords(P);
  const stats = { items, titles: byKey.size, files: files.length, shards: P.PDP_SHARDS, autoShards: P.AUTO_SHARDS };
  writeShoesSizesPending(shoes);

  resetDir(PDP_DIR + "/p");
  const shards = new Map();
  for (const [key, cands] of byKey) {
    const s = P.pdpShard(key);
    if (!shards.has(s)) shards.set(s, {});
    /* One record for a title is the answer whatever the store: no positions. */
    shards.get(s)[key] = cands.length === 1 ? [cands[0].rec] : cands.map((c) => ({ ...c.rec, src: c.src }));
  }
  let maxGz = 0, sumGz = 0, sumBytes = 0, maxName = "";
  for (const s of [...shards.keys()].sort()) {
    const obj = shards.get(s);
    const sorted = Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
    const w = writeJson(`${PDP_DIR}/p/${s}.json`, sorted);
    sumGz += w.gz; sumBytes += w.bytes;
    if (w.gz > maxGz) { maxGz = w.gz; maxName = s; }
  }
  Object.assign(stats, { productShardsWritten: shards.size, productBytes: sumBytes, productGz: sumGz, maxShardGz: maxGz, maxShard: maxName });
  if (maxGz > MAX_SHARD_GZ) throw new Error(`shard ${maxName} is ${maxGz} bytes gzipped (> ${MAX_SHARD_GZ}): raise PDP_SHARDS in producto.html`);

  /* Colourway groups (#443 variants). */
  resetDir(PDP_DIR + "/g");
  const gShards = new Map();
  let variantsN = 0;
  for (const [g, variants] of groups) {
    const s = P.groupShard(g);
    if (!gShards.has(s)) gShards.set(s, {});
    gShards.get(s)[g] = variants;
    variantsN += variants.length;
    /* Shades the store lists that we hold no real price or photo for:
       their names only, beside the group, never offered. */
    if (pending.has(g)) gShards.get(s)[g + "~p"] = pending.get(g);
  }
  let gMaxGz = 0, gSumGz = 0, gSumBytes = 0, gMaxName = "";
  for (const s of [...gShards.keys()].sort()) {
    const obj = gShards.get(s);
    const w = writeJson(`${PDP_DIR}/g/${s}.json`, Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]])));
    gSumGz += w.gz; gSumBytes += w.bytes;
    if (w.gz > gMaxGz) { gMaxGz = w.gz; gMaxName = s; }
  }
  Object.assign(stats, { variantFamilies: familyStats, groups: groups.size, groupedVariants: variantsN, groupShardsWritten: gShards.size, groupBytes: gSumBytes, groupGz: gSumGz, maxGroupShardGz: gMaxGz, maxGroupShard: gMaxName });
  if (gMaxGz > MAX_SHARD_GZ) throw new Error(`group shard ${gMaxName} is ${gMaxGz} bytes gzipped (> ${MAX_SHARD_GZ}): raise G_SHARDS in producto.html`);

  /* AutoZone parts. */
  resetDir(PDP_DIR + "/auto-pn");
  resetDir(PDP_DIR + "/auto-t");
  const cache = JSON.parse(readFileSync(join(ROOT, "auto-cache.json"), "utf8"));
  const { byPn, byTitle } = autoAnswers(P, cache);
  const pnShards = new Map(), tShards = new Map();
  for (const [pn, a] of [...byPn].sort()) {
    const s = P.autoShard(pn);
    if (!pnShards.has(s)) pnShards.set(s, { partSearches: {}, partNumberIndex: {} });
    const sh = pnShards.get(s);
    sh.partSearches["pn:" + pn] = { [a.src]: [autoRecOf(a.rec)] };
    sh.partNumberIndex[pn] = [["pn:" + pn, a.src, 1]];
  }
  for (const [t, a] of [...byTitle].sort()) {
    const s = P.autoShard(t);
    if (!tShards.has(s)) tShards.set(s, { partSearches: {} });
    tShards.get(s).partSearches["t:" + t] = { [a.src]: [autoRecOf(a.rec)] };
  }
  let autoMaxGz = 0;
  for (const [s, obj] of pnShards) autoMaxGz = Math.max(autoMaxGz, writeJson(`${PDP_DIR}/auto-pn/${s}.json`, obj).gz);
  for (const [s, obj] of tShards) autoMaxGz = Math.max(autoMaxGz, writeJson(`${PDP_DIR}/auto-t/${s}.json`, obj).gz);
  Object.assign(stats, { autoParts: byPn.size, autoTitles: byTitle.size, autoMaxShardGz: autoMaxGz });
  if (autoMaxGz > MAX_SHARD_GZ) throw new Error(`an auto shard is ${autoMaxGz} bytes gzipped: raise AUTO_SHARDS in producto.html`);

  /* Rails. */
  resetDir(PDP_DIR + "/rails");
  let railMaxGz = 0, railMaxName = "";
  let railFiles = 0;
  const rows = ofertasRows(P);
  const masked = new Set(rows.map((it) => P.relKey(it)));
  for (const [retailer, list] of [...byRetailer].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!/^[a-z0-9_-]+$/i.test(retailer)) continue;
    /* An off-sale store (/off-sale.js) keeps its records in the shards
       (the product page says it is no longer available) but no rail. */
    if (isOffSaleRetailer(retailer)) continue;
    const dir = `${PDP_DIR}/rails/${retailer.toLowerCase()}`;
    mkdirSync(join(ROOT, dir), { recursive: true });
    for (const [name, slice] of storeRails(P, list, masked)) {
      const w = writeJson(`${dir}/${name}.json`, { retailer, items: slice.map(railOf) });
      railFiles++;
      if (w.gz > railMaxGz) { railMaxGz = w.gz; railMaxName = `${retailer}/${name}`; }
    }
  }
  const lanes = laneRails(P, rows);
  for (const [key, list] of Object.entries(lanes)) {
    const w = writeJson(`${PDP_DIR}/rails/lane-${key}.json`, { lane: key, items: list.map(railOf) });
    if (w.gz > railMaxGz) { railMaxGz = w.gz; railMaxName = "lane-" + key; }
  }
  Object.assign(stats, { railFiles: railFiles + Object.keys(lanes).length, railMaxGz, railMax: railMaxName });
  if (railMaxGz > MAX_SHARD_GZ) throw new Error(`rail slice ${railMaxName} is ${railMaxGz} bytes gzipped`);

  writeJson(`${PDP_DIR}/index.json`, stats);
  console.log(JSON.stringify(stats, null, 2));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
