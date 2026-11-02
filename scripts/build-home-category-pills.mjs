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
   en <Tienda>» (tienda.html?tienda=<key>). Two carousels are new and
   are painted from here too: Bikinis y Ropas de Baño and Hogar y
   Especialidades. Auto and Motos are NOT in this row (Danny, #443
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
   «Todas» rail of a new carousel ends on it. */
export const CAROUSELS = [
  { k: "lenceria", title: "Lencería", host: "row", row: "ropa_interior_mujer", src: { feed: "ropa-interior-women-feed.json", underwearOnly: true } },
  { k: "interior-hombre", title: "Ropa Interior Hombre", host: "row", row: "ropa_interior", src: { feed: "ropa-interior-feed.json" } },
  { k: "tallas-plus", title: "Tallas Plus", host: "row", row: "curvy", src: { depts: ["curvy"] } },
  { k: "bano", title: "Bikinis y Ropas de Baño", host: "new", src: { swim: true }, door: "" },
  { k: "electronica", title: "Electrónica", host: "tech", src: { depts: ["electronics"] } },
  { k: "gym-rat", title: "Gym Rat", host: "row", row: "gym_rat", src: { depts: ["gym_rat"] } },
  { k: "futbol", title: "Fútbol", host: "row", row: "soccer", src: { depts: ["soccer"] } },
  { k: "fight-club", title: "Aria Fight Club", host: "row", row: "combat_sports", src: { depts: ["combat_sports"], gearFirst: true } },
  { k: "beauty", title: "Aria Beauty", host: "row", row: "beauty", src: { depts: ["beauty"], families: ["belleza", "perfumes"] } },
  { k: "surf-skate", title: "Surf & Skate", host: "row", row: "surf_skate", src: { depts: ["surf_skate"] } },
  { k: "juguetes", title: "Juguetes", host: "row", row: "toys", src: { depts: ["toys"], families: ["juguetes"] } },
  { k: "zapatos", title: "Zapatos", host: "row", row: "shoes", src: { depts: ["shoes"] } },
  { k: "lentes", title: "Lentes de Sol", host: "row", row: "sunglasses", src: { depts: ["sunglasses"], families: ["accesorios"] } },
  { k: "joyas", title: "Joyas y accesorios", host: "joyas", src: { depts: ["joyas_accesorios"], families: ["joyas", "accesorios"] } },
  { k: "hogar", title: "Hogar y Especialidades", host: "new", src: { depts: ["home_goods", "home_decor"], families: ["hogar", "libros"] }, door: "/departamento.html?dept=home_goods" },
];

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

/* Every candidate card of one carousel, grouped by store, in source order. */
function candidates(c, stores, root) {
  const by = {};
  const push = (store, cd) => { if (stores[store]) (by[store] = by[store] || []).push(cd); };
  if (c.src.feed) {
    for (const f of readJSON(root, c.src.feed).items || []) {
      if (c.src.underwearOnly && f.ty !== "underwear") continue;
      if (c.src.underwearOnly) {
        const d = deptOfProduct(root, f.r, f.t);
        if (KIT_DEPTS.has(d) || OWN_CATEGORY_DEPTS.has(d)) continue;   /* sports bras, nursing bras */
      }
      push(f.r, card(f.t, f.b, Number(f.p), Number(f.o) || 0, f.img, f.r));
    }
  }
  if (c.src.depts) {
    for (const d of c.src.depts) {
      for (const r of readJSON(root, `assets/sections/departamento/_fn/${d}.json`).rows || []) {
        if (c.src.families && !c.src.families.includes(classifierOf(root).classify({ name: r[D.name], type: r[D.type], retailer: r[D.store], brand: r[D.brand] }))) continue;
        const cd = card(r[D.name], r[D.brand], Number(r[D.price]), Number(r[D.was]) || 0, r[D.image], r[D.store]);
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
        if (r && sliceCategory(s, i) === want) push(store, card(r[S.name], r[S.brand], Number(r[S.price]), Number(r[S.was]) || 0, r[S.image], store));
      });
    }
  }
  return by;
}

/* A rail's order: fight gear first (by gear class), then the deepest
   sale, then the source's own order. Photographed, priced, distinct. */
function railOf(list) {
  const seen = new Set(), out = [];
  list.forEach((cd, i) => {
    if (!cd.image || !/^https?:\/\//.test(cd.image) || !(cd.price > 0) || !String(cd.title || "").trim()) return;
    const t = String(cd.title).trim().toLowerCase();
    if (seen.has(t)) return;
    seen.add(t);
    out.push({ cd, i });
  });
  out.sort((a, b) => ((a.cd._gear ?? 0) - (b.cd._gear ?? 0)) || (pctOf(b.cd) > 0) - (pctOf(a.cd) > 0) || (pctOf(b.cd) - pctOf(a.cd)) || (a.i - b.i));
  return out.map((x) => x.cd);
}
const clean = (cd) => { const o = { ...cd }; delete o._gear; return o; };

/* The «Todas» rail of a new carousel: its stores' rails interleaved,
   biggest store first, so no single store owns the window. */
function todasOf(members) {
  const out = [], lists = members.map((m) => m.rail.slice());
  while (out.length < TODAS_CARDS && lists.some((l) => l.length)) {
    for (const l of lists) { if (l.length && out.length < TODAS_CARDS) out.push(l.shift()); }
  }
  return out;
}

/** { carousels: [{ k, title, host, row, door, stores: [{ k, label, n, rail }], todas }], thin } */
export function buildCategoryPills(root = ROOT) {
  const stores = liveStorefronts(root);
  const thin = [];
  const carousels = CAROUSELS.map((c) => {
    const by = candidates(c, stores, root);
    const members = [];
    for (const [store, list] of Object.entries(by)) {
      const rail = railOf(list);
      if (rail.length < MIN_CARDS) { if (rail.length) thin.push(`${c.title}: ${stores[store]} (${rail.length})`); continue; }
      members.push({ k: store, label: stores[store], n: rail.length, rail });
    }
    members.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    return { ...c, stores: members, todas: c.host === "new" ? todasOf(members) : null };
  });
  return { carousels, thin, stores };
}

/* The department bucket the page's pricer reads for a weight estimate. */
const deptHint = (c) => (c.src.depts ? c.src.depts[0] : c.src.feed ? "underwear" : "clothing");

export function pillFiles(built) {
  const files = {};
  const labels = {};
  const index = { v: 1, min: MIN_CARDS, c: {} };
  for (const c of built.carousels) {
    if (!c.stores.length) continue;
    const entry = { t: c.title, s: c.stores.map((s) => [s.k, s.n]) };
    if (c.host === "new") entry.door = c.door || "";
    index.c[c.k] = entry;
    for (const s of c.stores) {
      labels[s.k] = s.label;
      files[`${c.k}-${s.k}.json`] = { v: 1, c: c.k, d: deptHint(c), store: s.k, label: s.label, n: s.n, door: `/tienda.html?tienda=${s.k}`, cards: s.rail.slice(0, RAIL_CARDS).map(clean) };
    }
    if (c.todas) files[`${c.k}-todas.json`] = { v: 1, c: c.k, d: deptHint(c), title: c.title, door: c.door || "", cards: c.todas.map(clean) };
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
  for (const c of built.carousels) console.log(`${c.title.padEnd(24)} ${String(c.stores.length).padStart(2)} tiendas: ${c.stores.map((s) => `${s.label} ${s.n}`).join(" | ")}`);
  if (built.thin.length) console.log("\nthin (no pill): " + built.thin.join(", "));
  const sizes = readdirSync(dir).map((f) => statSync(join(dir, f)).size);
  console.log(`\n${PILLS_DIR}: ${sizes.length} files, largest ${Math.max(...sizes)} B, index ${statSync(join(dir, "index.json")).size} B`);
}
