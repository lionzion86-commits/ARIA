#!/usr/bin/env node
/* ============================================================
   assets/home/tiendas/ — «TODAS LAS TIENDAS»: CATEGORY CAROUSELS OF
   STORES (#443, Danny's rulings 2026-11-01).

   WHAT. The homepage's store block is no longer one rail per store. It
   is a short run of category carousels (Ropa y Moda, Moda Exclusiva,
   Lencería, Ropa de Baño, ...). Each carousel carries its STORES as
   pills; a pill shows that store's rail inside the carousel, and the
   rail ends on a door ("Ver más en <tienda>") into the store's own page.

   THE RULES THIS FILE ENFORCES.
     1. STORES, NEVER BRANDS. A pill exists only for a retailer with a
        live storefront: tienda.html's STORES registry row, an
        assets/tienda/<key>/index.json with products, not off sale.
     2. CATEGORY TRUTH. Every product of every store is filed under one
        category (or none) from the store page's own data -- its aisle
        (t-ropa, t-zapatos, t-trajes_bano, the d-* aisles of the themed
        stores), its sub-aisle (~swim, ~lingerie) and the department
        bucket its catalogue filed it under (gym_rat, moms, motos...).
        A store gets a pill in EVERY carousel where it holds at least
        MIN_CARDS photographed products of that category, no cap, and
        its rail there shows ONLY those products. The whole store is
        behind the door.
     3. TRUE TOTALS. A pill's n is the store's full count for that
        category (every product with a photo), never a page sample.
     4. THE MOUNTAIN TEST. index.json is labels only; one rail is one
        small file (RAIL_CARDS cards), fetched only when its carousel
        nears the screen (the first pill) or a pill is tapped.

   ONE SOURCE OF TRUTH. Everything here is read from the store slices
   (assets/tienda/_fn/<key>.json, built by build-store-slices.mjs), so a
   pill can never claim what its store page does not hold.

   RUN after the store slices:
     node scripts/build-tiendas-carousels.mjs
   scripts/test/tiendas-carousels-tests.mjs fails when the files are stale.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { stampHomePhotos } from "./stamp-home-photos.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const TIENDAS_DIR = "assets/home/tiendas";
/* A pill needs a full rail of its category: at least this many
   photographed products. Fewer is a thin aisle, reported, never padded. */
export const MIN_CARDS = 16;
export const RAIL_CARDS = 16;
const R = { name: 0, brand: 1, price: 2, was: 3, image: 5, dept: 6, type: 8 };

/* The carousels, in Danny's order (#443, 2026-11-01). `cats` are the
   product categories a store's rail in that carousel may show. */
export const CAROUSELS = [
  { k: "ropa", title: "Ropa y Moda", sub: "Ropa del día a día, de las tiendas favoritas", cats: ["ropa"], tier: "mid" },
  { k: "exclusiva", title: "Moda Exclusiva", sub: "Diseñador y lujo, comprado en Estados Unidos", cats: ["ropa"], tier: "high" },
  { k: "lenceria", title: "Lencería", sub: "Brasieres, calzones, medias y pijamas", cats: ["lenceria"] },
  { k: "bano", title: "Ropa de Baño", sub: "Bikinis, enterizos y shorts de baño para el verano", cats: ["bano"] },
  { k: "deporte", title: "Deporte y Gym", sub: "Ropa para entrenar y equipo deportivo", cats: ["deporte"] },
  { k: "zapatos", title: "Zapatos", sub: "Zapatillas, sandalias, botas y chimpunes", cats: ["zapatos"] },
  { k: "surf", title: "Surf y Skate", sub: "Tablas, skate, neopreno y repuestos", cats: ["surf"] },
  { k: "belleza", title: "Belleza", sub: "Cuidado de la piel, cabello y maquillaje", cats: ["belleza"] },
  { k: "electronica", title: "Electrónica", sub: "Audio, gaming, cómputo y accesorios", cats: ["electronica"] },
  { k: "mamas", title: "Mamás y Bebés", sub: "Maternidad, lactancia y todo para el bebé", cats: ["mamas"] },
  { k: "hogar", title: "Hogar y Especialidades", sub: "Casa, libros y joyería", cats: ["hogar", "libros", "joyas"] },
  { k: "autofiesta", title: "Auto y Fiesta", sub: "Repuestos para tu auto y todo para la fiesta", cats: ["auto", "fiesta"] },
];

/* The surf and skate shops: their sporting goods are boards, decks,
   wheels and wetsuits. The bundle's SURFSKATE_RAIL_STORES, without the
   sporting-goods chains (Dick's, Nautilus spearfishing), plus Zumiez,
   whose own catalogue files its hardware under skate_snow. */
export const SURF_SKATE_SHOPS = new Set(["ccs", "zumiez", "surfstation", "valsurf", "islandwatersports", "mainland", "quietstorm", "parrot"]);
/* Department buckets that make a garment sportswear, not fashion. */
const SPORT_DEPTS = new Set(["gym_rat", "combat_sports", "fitness", "sporting_goods"]);
/* Buckets that are never a garment, whatever aisle they landed in. */
const NOT_APPAREL_DEPT = /^(tech_|electronics$|toys|home_|small_home$|beauty$|sunglasses$|motos$|candy|jewelry)/;
/* Moda Exclusiva: a store whose clothing its catalogue files as
   designer (latino_designers, luxury_brands), or whose clothing's median
   price is at least EXCLUSIVE_MEDIAN_USD. */
const DESIGNER_DEPTS = new Set(["latino_designers", "luxury_brands"]);
export const EXCLUSIVE_MEDIAN_USD = 120;
/* Party City's buckets are party types (balloons, favors, plates...). */
const PARTY_STORES = new Set(["partycity"]);
/* A specialty shop (books, jewellery) joins Hogar y Especialidades when
   that category is most of what it sells. */
const SPECIALTY_SHARE = 0.5;

/* CLASSIFIED BY WHAT IT IS, NEVER BY A WORD IN ITS NAME (Danny,
   #443 c.6559879470). Every category below comes from the repo's own
   classifier layer, never from a keyword this file reads in a title:
     - the store page's aisle (t-ropa, t-zapatos, t-trajes_bano...) is
       tienda.html's productTypeOf -- /product-type.js's classify, which
       reads the store's published type and department before any name
       (footwear.js's rules among them) -- run by build-store-slices.mjs;
     - the garment class and wearer (t-ropa~women~swim, ~lingerie,
       ~tops...) are scripts/lib/store-subrails.js;
     - the department bucket (gym_rat, combat_sports, moms, motos...) is
       the one the store's catalogue filed the product under;
   A product the classifiers do not place (a "clothing" row with no
   garment class) is no carousel's: the store's door still has it. */
/* Lencería: a ~lingerie garment of a women's (or all-women's) shop;
   a unisex or men's shop's "Ropa interior" (socks, boxers) is not. */
const UNISEX_DEPTS = new Set(["clothing", "men", "mens", "kids", "general", "moda_hombre", "moda_ninos", "fashion"]);

/** tienda.html's STORES registry (the storefronts). */
export function storeRegistry(root = ROOT) {
  const html = readFileSync(join(root, "tienda.html"), "utf8");
  const m = /^var STORES = (\{.*\});\s*$/m.exec(html);
  return m ? JSON.parse(m[1]) : {};
}

/** The live storefronts: registry row + slices with products + on sale. */
export function liveStorefronts(root = ROOT) {
  const reg = storeRegistry(root);
  const out = [];
  for (const k of Object.keys(reg)) {
    if (isOffSaleRetailer(k) || reg[k].pendingCatalog) continue;
    const idx = join(root, `assets/tienda/${k}/index.json`), fn = join(root, `assets/tienda/_fn/${k}.json`);
    if (!existsSync(idx) || !existsSync(fn)) continue;
    const j = JSON.parse(readFileSync(idx, "utf8"));
    if (!(j.count > 0)) continue;
    out.push({ k, label: reg[k].label });
  }
  return out;
}

/* The top aisle each row sits in, and its sub-aisle tokens. */
function aislesOf(fn) {
  const top = new Map(), subs = new Map();
  for (const [key, list] of Object.entries(fn.rails || {})) {
    if (/^(ofertas|masvendidos|destacados|t-mas|d-mas)$/.test(key) || /^b-/.test(key)) continue;
    if (key.includes("~")) {
      if (!/^t-/.test(key)) continue;
      const [a, g, s] = key.split("~");
      for (const i of list) { if (!subs.has(i)) subs.set(i, []); subs.get(i).push({ a, g, s }); }
      continue;
    }
    if (!/^[td]-/.test(key) || /^c-/.test(key)) continue;
    for (const i of list) if (!top.has(i)) top.set(i, key);
  }
  return { top, subs };
}

/* A themed store's own departments (d-<key>, build-store-slices
   SLICED_STORES) are classified by their key, else by the label the
   store page shows for that aisle -- the aisle's name, never a product's.
   This is what lets a storefront that lands later (Best Buy's laptops,
   DSW's "Zapatos de mujer") pill with no code change. */
const D_AISLE_KEY = [
  [/^d-(calzado|calzado_ninos|zapatos)$/, "zapatos"],
  [/^d-(brasieres|calzones|bodies|babydolls|medias_panty|medias_altas)$/, "lenceria"],
  [/^d-(ropa|ropa_ninos|leggings)$/, "ropa"],
  [/^d-(cab_|maquillaje$)/, "belleza"],
  [/^d-(tech_|laptops$|phones$|gaming$|audio$|tablets$|wearables$|cameras$|monitors$|small_appliances$|electronics$)/, "electronica"],
  [/^d-casa_/, "hogar"],
];
const D_AISLE_LABEL = [
  [/^(zapatos|calzado)\b/i, "zapatos"],
  [/^(lencer[ií]a|brasieres|calzones|medias)\b/i, "lenceria"],
  [/^(ropa de ba[ñn]o|trajes de ba[ñn]o)\b/i, "bano"],
  [/^(belleza|maquillaje|cuidado de la piel|cabello)\b/i, "belleza"],
  [/^(computaci[óo]n|celulares|gaming|audio|tablets|smartwatches|c[áa]maras|monitores|electr[óo]nica)\b/i, "electronica"],
  [/^(mesa y vajilla|velas|cojines|cama y ba[ñn]o|cocina|decoraci[óo]n|l[áa]mparas)\b/i, "hogar"],
];
export function dAisleCategory(key, label) {
  for (const [rx, c] of D_AISLE_KEY) if (rx.test(key)) return c;
  for (const [rx, c] of D_AISLE_LABEL) if (rx.test(String(label || ""))) return c;
  return null;
}

/** The category of one product of one store, or null (door only). */
export function categoryOf(store, row, aisle, subs, aisleLabel) {
  const dept = String(row[R.dept] || "");
  if (dept === "motos") return null;                       /* Aria Motos' stores, not these carousels */
  if (PARTY_STORES.has(store)) return "fiesta";
  if (dept === "moms") return "mamas";
  const a = aisle || "";
  const sub = (subs || []).find((x) => x.a === "t-ropa");
  const kit = SPORT_DEPTS.has(dept) && dept !== "sporting_goods";   /* a gym or fight shop's own stock */
  if (/^d-/.test(a)) return dAisleCategory(a, aisleLabel);
  if (a === "t-zapatos") return "zapatos";
  if (a === "t-trajes_bano") return kit ? "deporte" : "bano";   /* a fight shop's rash guards are training kit */
  if (a === "t-bebe") return "mamas";
  if (a === "t-belleza") return "belleza";
  if (a === "t-electronica") return "electronica";
  if (a === "t-hogar") return "hogar";
  if (a === "t-libros") return "libros";
  if (a === "t-joyas") return "joyas";
  if (a === "t-repuestos") return "auto";
  if (a === "t-deportes") return SURF_SKATE_SHOPS.has(store) ? "surf" : "deporte";
  if (a === "t-ropa") {
    if (NOT_APPAREL_DEPT.test(dept)) return null;
    if (SPORT_DEPTS.has(dept)) return SURF_SKATE_SHOPS.has(store) ? "surf" : "deporte";
    if (!sub) return null;                                 /* no garment class: not placed */
    if (sub.s === "swim") return "bano";
    if (sub.s === "lingerie") return sub.g === "women" || (sub.g === "all" && !UNISEX_DEPTS.has(dept)) ? "lenceria" : null;
    return "ropa";
  }
  /* Accessories and caps of a gym or fight shop are its kit. */
  if (/^t-(accesorios|sombreros)$/.test(a) && kit && !SURF_SKATE_SHOPS.has(store)) return "deporte";
  /* A gym or fight shop's uncategorised stock (Combat Corner) is its kit. */
  if (!a && kit) return "deporte";
  return null;
}

/** { k, label, cats: { cat: [row…] }, tier } for one store. */
export function storeCategories(store, label, root = ROOT) {
  const fn = JSON.parse(readFileSync(join(root, `assets/tienda/_fn/${store}.json`), "utf8"));
  const { top, subs } = aislesOf(fn);
  const idx = JSON.parse(readFileSync(join(root, `assets/tienda/${store}/index.json`), "utf8"));
  const labels = Object.fromEntries((idx.rails || []).map((r) => [r.key, r.title]));
  /* The store page's own order: each aisle's list as the page sorts it
     (sales first), aisles in the page's order. */
  const order = [];
  const seenIdx = new Set();
  for (const [key, list] of Object.entries(fn.rails || {})) {
    if (key.includes("~") || /^(ofertas|masvendidos|destacados)$/.test(key) || /^[bc]-/.test(key)) continue;
    for (const i of list) if (!seenIdx.has(i)) { seenIdx.add(i); order.push(i); }
  }
  fn.rows.forEach((_, i) => { if (!seenIdx.has(i)) { seenIdx.add(i); order.push(i); } });
  const cats = {}, counts = {}, seenTitle = {};
  for (const i of order) {
    const row = fn.rows[i];
    if (!row || !row[R.image] || !(row[R.price] > 0) || !String(row[R.name] || "").trim()) continue;
    const c = categoryOf(store, row, top.get(i), subs.get(i), labels[top.get(i)]);
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
    const t = String(row[R.name]).trim().toLowerCase();
    seenTitle[c] = seenTitle[c] || new Set();
    if (seenTitle[c].has(t)) continue;
    seenTitle[c].add(t);
    (cats[c] = cats[c] || []).push(row);
  }
  const clothes = cats.ropa || [];
  const prices = clothes.map((r) => r[R.price]).sort((x, y) => x - y);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const designer = clothes.filter((r) => DESIGNER_DEPTS.has(String(r[R.dept]))).length > clothes.length / 2;
  return { k: store, label, cats, counts, total: fn.rows.length, tier: designer || median >= EXCLUSIVE_MEDIAN_USD ? "high" : "mid", median };
}

const cardOf = (r, store) => {
  const c = { title: r[R.name], price: r[R.price], image: r[R.image], retailer: store };
  if (r[R.brand]) c.brand = r[R.brand];
  if (r[R.was] > r[R.price]) c.originalPrice = r[R.was];
  return c;
};

/** The whole block: { carousels: [{ k, title, sub, stores: [{ k, label, n, cat, rows }] }], thin }. */
export function buildCarousels(root = ROOT) {
  const stores = liveStorefronts(root).map((s) => storeCategories(s.k, s.label, root));
  const thin = [];
  const carousels = CAROUSELS.map((c) => {
    const members = [];
    for (const s of stores) {
      if (c.tier && s.tier !== c.tier) continue;
      /* The store's biggest qualifying category in this carousel. */
      let best = null;
      for (const cat of c.cats) {
        const rows = s.cats[cat] || [], n = s.counts[cat] || 0;
        if (!rows.length) continue;
        if ((cat === "libros" || cat === "joyas") && n < s.total * SPECIALTY_SHARE) continue;
        if (rows.length < MIN_CARDS) { thin.push(`${c.title}: ${s.label} (${rows.length})`); continue; }
        if (!best || n > best.n) best = { cat, rows, n };
      }
      if (best) members.push({ k: s.k, label: s.label, n: best.n, cat: best.cat, rows: best.rows });
    }
    members.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    return { k: c.k, title: c.title, sub: c.sub, stores: members };
  }).filter((c) => c.stores.length);
  return { carousels, thin, stores };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { carousels, thin } = buildCarousels();
  const dir = join(ROOT, TIENDAS_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const c of carousels) for (const s of c.stores) {
    writeFileSync(join(dir, `${c.k}-${s.k}.json`), JSON.stringify({ v: 1, c: c.k, store: s.k, label: s.label, cat: s.cat, n: s.n,
      door: `/tienda.html?tienda=${s.k}`, cards: s.rows.slice(0, RAIL_CARDS).map((r) => cardOf(r, s.k)) }));
  }
  writeFileSync(join(dir, "index.json"), JSON.stringify({ v: 1, all: "/tiendas.html",
    carousels: carousels.map((c) => ({ k: c.k, title: c.title, sub: c.sub, stores: c.stores.map(({ k, label, n, cat }) => ({ k, label, n, cat })) })) }));
  stampHomePhotos(ROOT, [TIENDAS_DIR]);
  for (const c of carousels) console.log(`${c.title.padEnd(24)} ${c.stores.length} tiendas: ${c.stores.map((s) => `${s.label} ${s.n}`).join(" | ")}`);
  if (thin.length) console.log("\nthin (no pill): " + thin.join(", "));
  const n = readdirSync(dir).length;
  console.log(`\n${TIENDAS_DIR}: ${n} files`);
}
