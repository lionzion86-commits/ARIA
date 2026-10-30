#!/usr/bin/env node
/* ============================================================
   assets/tienda/ — EVERY STOREFRONT, SLICED (Issue #413 Best Buy,
   generalised to every store by #409 track T2).

   WHY. tienda.html drew a store by downloading its whole catalogue --
   SSENSE 39.8MB, Target three files (18MB), Walmart 11MB -- before the
   first card. On the Mountain profile (400 kbps, 2 s RTT) most stores
   never drew a card at all. Now every storefront answers from small
   files and the page never touches a catalogue.

   WHAT. For each store in tienda.html's STORES registry, from its
   committed catalogues:

     assets/tienda/<key>/index.json   the first screen, in one file: the
                                      store's count, its chips, and every
                                      rail's title, total and first
                                      RAIL_HEAD cards
     assets/tienda/_fn/<key>.json     the store's full card list (one row
                                      per product) and each rail's order,
                                      for netlify/functions/tienda.js:
                                      "Ver todo", chips, search, sort --
                                      48 cards at a time. The phone never
                                      downloads it.
   Themed stores (SLICED_STORES: Best Buy, #413) also keep their rail
   pages as static files (assets/tienda/<key>/rails/<rail>-<n>.json).

   ONE SET OF RULES. Nothing is re-implemented for the generic stores:
   the storefront's own rules are lifted out of tienda.html (normItem,
   the department chip words, the type facets, the sale-first sort, the
   product-type rails) and run here over the catalogues, exactly as the
   page used to run them in the shopper's phone (its old loadStore's
   file loop and dedupe included). Merchandising, in order (Danny's law):
     1. Ofertas de <store> -- sale items only (sale-rule.js, the one
        rule), deepest discount first; with no sales, Destacados;
     2. Más vendidos -- the store's own review counts, when its
        catalogue publishes them for at least RAIL_HEAD products;
     3. one rail per product type (tienda.html's PRODUCT_TYPES).
   Best Buy keeps its own (#413): Ofertas (sale depth + demand, premium
   sprinkled, never leading), Más vendidos, then its departments.

   REGENERATE after any catalogue changes:
     node scripts/build-store-slices.mjs
   scripts/test/tienda-thin-tests.mjs and bestbuy-tests.mjs fail when
   the slices are stale.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { liftDeclarations, pageHtml, extractDeclarations } from "./lib/page-lift.mjs";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { FN_DIR, cardOfRow } from "../netlify/functions/_tienda-core.js";
import { conditionOfTitle } from "./lib/condition.js";
import { subRails, subKey, dominantFamily } from "./lib/store-subrails.js";
import { AISLE_ORDER, AISLE_LABELS } from "./lib/brandsmart.js";
import { STORES as CI } from "./lib/calzedonia-intimissimi.js";
import { AISLE_ORDER as SLEEK_ORDER, AISLE_LABELS as SLEEK_LABELS } from "./lib/sleekshop.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const SLICES_DIR = "assets/tienda";
export { FN_DIR };
export const PAGE_SIZE = 48;
export const RAIL_HEAD = 16;
/* The first screen carries the first EAGER_RAILS rails' cards. A store
   whose products now fill their own aisles (#443 re-route audit: Walmart's
   toys, home, beauty...) has more rails than the first screen's 30KB holds,
   so the rest arrive as their page 1 when the shopper scrolls near them. */
export const EAGER_RAILS = 10;
/* THE DEALS-FIRST HERO (#443 c.6470118615, Danny): on these storefronts,
   one big card above the aisles -- the deepest real markdowns, the
   discount loud, the store's own photos. Only an item with a true
   compare-at price (the sale rule's was-price) is a deal; «Hasta X%» is
   the largest discount among the items the card shows. One hero, not an
   ad wall. */
export const DEALS_HERO_STORES = new Set(["walmart"]);
export const DEALS_HERO_ITEMS = 4;
export function dealsHero(rows, saleIdx) {
  const seen = new Set(), picks = [];
  for (const i of saleIdx) {
    const r = rows[i];
    if (!r || !(r[4] > 0) || !(r[3] > r[2]) || !r[5]) continue;
    const k = String(r[0]).toLowerCase().slice(0, 40);
    if (seen.has(k)) continue;
    seen.add(k);
    picks.push(i);
    if (picks.length === DEALS_HERO_ITEMS) break;
  }
  if (picks.length < DEALS_HERO_ITEMS) return null;
  return { pct: Math.max(...picks.map((i) => rows[i][4])), items: picks.map((i) => ({ ...cardOfRow(rows[i]), pct: rows[i][4] })) };
}
function headOrLazy(rail, i, head) {
  return i < EAGER_RAILS ? { ...rail, head: head() } : { ...rail, head: [], lazy: true };
}
/* A product at or above this Best Buy price is "premium": it may appear
   in a rail, never in its first PREMIUM_LEAD_FREE cards, and at most
   once in every PREMIUM_EVERY. */
export const PREMIUM_USD = 1000;
const PREMIUM_LEAD_FREE = 4;
const PREMIUM_EVERY = 4;

export const SLICED_STORES = {
  bestbuy: {
    file: "bestbuy-catalog.json",
    label: "Best Buy",
    /* Danny's order: computación, celulares, gaming, audio... (no TVs in
       the pull: the shippable doctrine dropped them). */
    DEPT_ORDER: ["laptops", "phones", "gaming", "audio", "tablets", "wearables", "cameras", "monitors", "accessories", "small_appliances", "electronics"],
    DEPT_LABELS: {
      laptops: "Computación", phones: "Celulares", gaming: "Gaming", audio: "Audio y audífonos",
      tablets: "Tablets y e-readers", wearables: "Smartwatches", cameras: "Cámaras y drones",
      monitors: "Monitores", accessories: "Accesorios de cómputo", small_appliances: "Electrodomésticos pequeños",
      electronics: "Más electrónica",
    },
  },
  /* DSW (Issue #443). Danny's order: "Ofertas de DSW" first, then the
     category rails. The buckets are the ones scripts/build-dsw-catalog.mjs
     files under (scripts/lib/dsw.js BUCKET_LABELS). Más vendidos reads
     the place each product held in DSW's own best-sellers listing
     (bestSellerRank) when the pull captured it, then review counts.
     While dsw-catalog.json is the empty envelope this writes a count-0
     index, and tienda.html never opens it (STORES.dsw.pendingCatalog). */
  /* CASA ARIA (#443 c.6458486219): Crate & Barrel and Pier 1, light home
     only (scripts/lib/home-pull-normalize.js); Ofertas from the stores' own
     was-prices, then Casa Aria's aisles. */
  crateandbarrel: {
    file: "crateandbarrel-catalog.json",
    label: "Crate & Barrel",
    DEPT_ORDER: ["casa_mesa", "casa_velas", "casa_textiles", "casa_cama_bano", "casa_cocina", "casa_decoracion", "casa_iluminacion", "casa_navidad"],
    DEPT_LABELS: {
      casa_mesa: "Mesa y vajilla", casa_velas: "Velas y aromas", casa_textiles: "Cojines y mantas", casa_cama_bano: "Cama y baño",
      casa_cocina: "Cocina", casa_decoracion: "Decoración", casa_iluminacion: "Lámparas", casa_navidad: "Navidad",
    },
  },
  pier1: {
    file: "pier1-catalog.json",
    label: "Pier 1",
    DEPT_ORDER: ["casa_mesa", "casa_velas", "casa_textiles", "casa_cama_bano", "casa_cocina", "casa_decoracion", "casa_iluminacion", "casa_navidad"],
    DEPT_LABELS: {
      casa_mesa: "Mesa y vajilla", casa_velas: "Velas y aromas", casa_textiles: "Cojines y mantas", casa_cama_bano: "Cama y baño",
      casa_cocina: "Cocina", casa_decoracion: "Decoración", casa_iluminacion: "Lámparas", casa_navidad: "Navidad",
    },
  },
  dsw: {
    file: "dsw-catalog.json",
    label: "DSW",
    DEPT_ORDER: ["women", "men", "kids", "footwear", "purses"],
    DEPT_LABELS: {
      women: "Zapatos de mujer", men: "Zapatos de hombre", kids: "Zapatos de niños",
      footwear: "Más zapatos", purses: "Carteras y bolsos",
    },
  },
  /* SNIPES (#443 c.6450358688, pulled 2026-10-27). Danny's order: Ofertas
     first, then the brand carousels (Nike, Jordan, Adidas, New Balance,
     then the rest), then the category carousels. The pull carries no
     compare-at price, so there is no Ofertas rail until one is captured
     (none is made up). "The rest" are the next brands with at least
     BRAND_MIN products, biggest first. */
  /* BRANDSMART USA (Build Order B, #443, pulled 2026-10-28): Ofertas
     first (real compare-at prices), then the aisles in electronics order.
     The 220 V gate and the holds are scripts/lib/brandsmart.js. */
  /* SLEEKSHOP (#443 c.6475799491, pulled 2026-10-28): the professional
     hair-treatment shelf -- Ofertas first, then Keratina y alisados and
     the treatment aisles. Rules: scripts/lib/sleekshop.js. */
  sleekshop: {
    file: "sleekshop-catalog.json",
    label: "SleekShop",
    DEPT_ORDER: SLEEK_ORDER,
    DEPT_LABELS: SLEEK_LABELS,
  },
  /* MICRO CENTER (#443 electronics wave, pulled 2026-10-28): ship-to-home
     stock only; laptops, PC components, SSDs, keyboards, headphones.
     Rules: scripts/lib/electronics-drops.js. */
  microcenter: {
    file: "microcenter-catalog.json",
    label: "Micro Center",
    DEPT_ORDER: AISLE_ORDER,
    DEPT_LABELS: AISLE_LABELS,
  },
  brandsmart: {
    file: "brandsmart-catalog.json",
    label: "BrandsMart USA",
    DEPT_ORDER: AISLE_ORDER,
    DEPT_LABELS: AISLE_LABELS,
  },
  /* CALZEDONIA + INTIMISSIMI (#443 c.6512405832, Danny c.6512451192): two
     stores, each its own page; aisles from scripts/lib/calzedonia-intimissimi.js.
     No compare-at prices came with the drop (Destacados, no Ofertas). */
  intimissimi: { file: "intimissimi-catalog.json", label: CI.intimissimi.label, DEPT_ORDER: CI.intimissimi.order, DEPT_LABELS: CI.intimissimi.labels },
  calzedonia: { file: "calzedonia-catalog.json", label: CI.calzedonia.label, DEPT_ORDER: CI.calzedonia.order, DEPT_LABELS: CI.calzedonia.labels },
  snipes: {
    file: "snipes-catalog.json",
    label: "SNIPES",
    BRAND_RAILS: ["Nike", "Jordan", "adidas", "New Balance"],
    BRAND_MORE: 6,
    BRAND_MIN: 40,
    DEPT_ORDER: ["calzado", "calzado_ninos", "ropa", "ropa_ninos", "gorras", "accesorios"],
    DEPT_LABELS: {
      calzado: "Calzado", calzado_ninos: "Calzado de niños", ropa: "Ropa streetwear",
      ropa_ninos: "Ropa de niños", gorras: "Gorras", accesorios: "Accesorios",
    },
  },
  /* CAROLINA HERRERA (#443 c.6450670024, pulled 2026-10-27): the house's
     own categories. No sale prices were captured (no Ofertas rail). */
  carolinaherrera: {
    file: "carolinaherrera-catalog.json",
    label: "Carolina Herrera",
    DEPT_ORDER: ["zapatos", "ropa", "accesorios", "fragancias", "maquillaje"],
    DEPT_LABELS: {
      zapatos: "Zapatos", ropa: "Ropa", accesorios: "Joyas y accesorios", fragancias: "Fragancias", maquillaje: "Maquillaje",
    },
  },
};

export function loadSaleRule(root = ROOT) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(root, "sale-rule.js"), "utf8"), sandbox);
  return sandbox.AriaSale;
}

/* The page's own shippable rule (isShippableItem: no TVs, no bulky
   freight, nothing over the parcel weight) -- the storefront lists
   exactly what every other surface keeps when it loads a catalogue. */
const SHIP_NAMES = ["UNSHIPPABLE_TV_RX", "TV_SIZE_BRAND_RX", "TV_PARCEL_OK_RX", "AXE_DEODORANT_RX", "AXE_DEODORANT_TYPE_RX",
  "UNSHIPPABLE_BULKY_RX", "BULKY_SMALL_OK_RX", "UNSHIPPABLE_WEIGHT_KG", "PROJECTOR_RX", "BULKY_PROJECTOR_PACKAGE_RX",
  "PERISHABLE_TITLE_RX", "PERISHABLE_BRAND_RX", "PERISHABLE_DAIRY_RX", "isPerishableFood", "isShippableItem"];
export function loadShippable(root = ROOT) {
  return liftDeclarations(pageHtml(root), SHIP_NAMES).isShippableItem;
}

function realImage(p) {
  const cands = [p.image, p.imageUrl, p.thumbnail, ...(Array.isArray(p.images) ? p.images : [])];
  for (const u of cands) if (typeof u === "string" && /^https?:\/\//.test(u) && u.length > 20) return u;
  return null;
}

/* ---------------- tienda.html's registry and rules ---------------- */
/* The storefronts: the page's registry minus the stores taken off sale
   (/off-sale.js), as the page itself drops them. */
export function tiendaStores(root = ROOT) {
  const all = JSON.parse(/var STORES = (\{.*\});/.exec(readFileSync(join(root, "tienda.html"), "utf8"))[1]);
  return Object.fromEntries(Object.entries(all).filter(([k]) => !isOffSaleRetailer(k)));
}

/* The storefront rules, as tienda.html declares them. */
export const STORE_RULES = ["realImage", "DEPT_CHIP_LABELS", "deptChipLabel", "discountPct", "saleTier", "saleSort",
  "normItem", "PRODUCT_TYPES", "TYPE_RES", "typeKeywordBlocked", "productTypeOf",
  "GENDER_LABELS", "GENDER_ORDER", "FACET_MIN", "facetLabel", "typeFacets", "buildFacets"];
export function loadStoreRules(root = ROOT) {
  const win = {};
  vm.runInNewContext(readFileSync(join(root, "product-type.js"), "utf8"), { window: win });
  win.AriaSale = loadSaleRule(root);
  const ctx = { window: win, console };
  vm.createContext(ctx);
  const src = extractDeclarations(readFileSync(join(root, "tienda.html"), "utf8"), STORE_RULES);
  vm.runInContext("var storeKey = '', allItems = [], deptLabels = {}, facetMode = false, facetGenders = [], facetCats = [], activeGender = '', activeCat = '';\n" +
    src + "\n;globalThis.__R = {" + STORE_RULES.map((n) => n + ": " + n).join(", ") + "};", ctx, { filename: "tienda.html#rules" });
  return { R: ctx.__R, ctx };
}

const catalogueCache = new Map();
function readCatalogue(root, f) {
  const p = join(root, String(f).replace(/^\//, ""));
  if (!catalogueCache.has(p)) {
    try { catalogueCache.set(p, JSON.parse(readFileSync(p, "utf8"))); } catch { catalogueCache.set(p, null); }
  }
  return catalogueCache.get(p);
}
const reviewsOf = (raw) => {
  const n = Number(raw && (raw.reviewCount != null ? raw.reviewCount : raw.reviews));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* What the page's loadStore() built in the phone: every department of
   the store in every file it names, normItem, deduped by name + photo. */
export function genericItems(key, meta, rules, root = ROOT) {
  const { R, ctx } = rules;
  ctx.storeKey = key;
  const items = [], depts = {};
  for (const f of meta.files || []) {
    const bucket = readCatalogue(root, f)?.retailers?.[key];
    if (!bucket) continue;
    for (const [dk, entry] of Object.entries(bucket.departments || {})) {
      let label = dk, arr = null;
      if (entry && typeof entry === "object" && !Array.isArray(entry)) { label = entry.label || dk; arr = entry.items; }
      else if (Array.isArray(entry)) arr = entry;
      if (!Array.isArray(arr)) continue;
      depts[dk] = R.deptChipLabel(dk, label);
      for (const raw of arr) {
        let n = null;
        try { n = R.normItem(raw, dk); } catch { n = null; }
        if (!n) continue;
        n.reviews = reviewsOf(raw);
        n.rating = Number(raw.rating) || 0;
        items.push(n);
      }
    }
  }
  const seen = new Set(), out = [];
  for (const it of items) {
    const k = it.name + "||" + it.image;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  ctx.allItems = out;
  ctx.deptLabels = depts;
  try { R.buildFacets(); } catch { ctx.facetMode = false; }
  return { items: out, depts, facetMode: !!ctx.facetMode, facetGenders: Array.from(ctx.facetGenders || []), facetCats: Array.from(ctx.facetCats || []) };
}

export function genericRails(key, label, items, rules) {
  const { R, ctx } = rules;
  ctx.storeKey = key;
  const rails = [];
  const sales = items.filter((p) => R.saleTier(p) > 0).sort(R.saleSort);
  if (sales.length) rails.push({ key: "ofertas", title: "Ofertas de " + label, items: sales });
  else if (items.length) rails.push({ key: "destacados", title: "Destacados de " + label, items: items.slice().sort((a, b) => b.price - a.price) });
  const reviewed = items.filter((p) => p.reviews > 0);
  if (reviewed.length >= RAIL_HEAD) {
    rails.push({ key: "masvendidos", title: "Más vendidos", items: reviewed.slice().sort((a, b) => (b.reviews - a.reviews) || (b.rating - a.rating)) });
  }
  /* One carousel per PRODUCT TYPE, never per Aria department (Danny,
     2026-10-07: a Gymshark page shows Leggings/Tops/Shorts). */
  const byType = {};
  for (const p of items) { const t = R.productTypeOf(p); (byType[t] = byType[t] || []).push(p); }
  for (const t of R.PRODUCT_TYPES) {
    const list = (byType[t.key] || []).slice().sort(R.saleSort);
    if (list.length) rails.push({ key: "t-" + t.key, title: t.label, items: list });
  }
  return rails;
}

/* ---------------- Best Buy (#413) ---------------- */
/* Every product of the store, once, as the page will draw it. */
export function storeProducts(key, root = ROOT) {
  const cfg = SLICED_STORES[key];
  const sale = loadSaleRule(root);
  const shippable = loadShippable(root);
  const data = JSON.parse(readFileSync(join(root, cfg.file), "utf8"));
  const r = data.retailers[key];
  const out = [];
  const seen = new Set();
  for (const [dept, bucket] of Object.entries(r.departments || {})) {
    for (const p of bucket.items || []) {
      const name = String(p.name || p.title || "").trim();
      const price = Number(p.price);
      const image = realImage(p);
      if (!name || !(price > 0) || !image || !shippable(p)) continue;
      const k = name + "||" + image;
      if (seen.has(k)) continue;
      seen.add(k);
      const pct = sale.discountPct(p);
      out.push({
        name, brand: p.brand || "", price, was: pct > 0 ? sale.originalPrice(p) : 0, pct, image, dept,
        reviews: Number(p.reviewCount) || 0, rating: Number(p.rating) || 0,
        rank: Number(p.bestSellerRank) || 0,
      });
    }
  }
  return out;
}

const cardOf = (p) => {
  const c = { name: p.name, price: p.price, image: p.image };
  if (p.brand) c.brand = p.brand;
  if (p.was) c.was = p.was;
  /* The same condition label the endpoint rows carry (cardOfRow). */
  const cond = conditionOfTitle(p.name);
  if (cond && cond.label) c.k = cond.label;
  return c;
};
const demand = (p) => Math.log10(1 + p.reviews);
/* Sale depth and demand together: 10 points of discount weigh like a
   tenfold difference in reviews. */
const saleScore = (p) => p.pct / 10 + demand(p);

/* Premium never leads, and is sprinkled rather than clustered. */
export function sprinklePremium(list) {
  const regular = list.filter((p) => p.price < PREMIUM_USD);
  const premium = list.filter((p) => p.price >= PREMIUM_USD);
  const out = [];
  let sincePremium = PREMIUM_EVERY;
  while (regular.length || premium.length) {
    const canPremium = out.length >= PREMIUM_LEAD_FREE && sincePremium >= PREMIUM_EVERY - 1;
    if (premium.length && (canPremium || !regular.length)) { out.push(premium.shift()); sincePremium = 0; }
    else { out.push(regular.shift()); sincePremium++; }
  }
  return out;
}

export function storeRails(key, products) {
  const cfg = SLICED_STORES[key];
  const bySale = (a, b) => (saleScore(b) - saleScore(a)) || (b.reviews - a.reviews) || (a.price - b.price);
  const rails = [];
  const sales = products.filter((p) => p.pct > 0).sort(bySale);
  if (sales.length) rails.push({ key: "ofertas", title: "Ofertas de " + cfg.label, items: sprinklePremium(sales) });
  /* A store's own best-sellers listing outranks review counts (DSW). */
  const byRank = (a, b) => (a.rank && b.rank ? a.rank - b.rank : (b.rank ? 1 : 0) - (a.rank ? 1 : 0));
  const best = products.filter((p) => p.reviews > 0 || p.rank > 0)
    .sort((a, b) => byRank(a, b) || (b.reviews - a.reviews) || (b.rating - a.rating));
  if (best.length) rails.push({ key: "masvendidos", title: "Más vendidos", items: sprinklePremium(best) });
  /* Brand carousels (SNIPES): the named brands, then the next biggest. */
  if (cfg.BRAND_RAILS) {
    const norm = (b) => String(b || "").toLowerCase().trim();
    const count = new Map();
    for (const p of products) count.set(norm(p.brand), (count.get(norm(p.brand)) || 0) + 1);
    const named = cfg.BRAND_RAILS.map(norm);
    const more = [...count].filter(([b, n]) => b && !named.includes(b) && n >= (cfg.BRAND_MIN || 1))
      .sort((a, b) => b[1] - a[1]).slice(0, cfg.BRAND_MORE || 0).map(([b]) => b);
    for (const b of named.concat(more)) {
      const list = products.filter((p) => norm(p.brand) === b);
      if (!list.length) continue;
      const label = list[0].brand;
      /* A sneaker store's brand shelf leads with its shoes. */
      const lead = (p) => (p.dept === "calzado" ? 0 : p.dept === "calzado_ninos" ? 1 : 2);
      rails.push({ key: "b-" + b.replace(/[^a-z0-9]+/g, "-"), title: label,
        items: sprinklePremium(list.slice().sort((x, y) => (lead(x) - lead(y)) || ((y.pct || 0) - (x.pct || 0)) || (y.price - x.price))) });
    }
  }
  /* A department window is not a copy of the two lead rails: what their
     first cards already show yields its place to what they do not
     (it stays in the rail, further along). */
  const shown = new Set(rails.flatMap((r) => r.items.slice(0, RAIL_HEAD)));
  const fresh = (arr) => arr.filter((p) => !shown.has(p)).concat(arr.filter((p) => shown.has(p)));
  for (const dept of cfg.DEPT_ORDER) {
    const list = products.filter((p) => p.dept === dept);
    if (!list.length) continue;
    const s = fresh(list.filter((p) => p.pct > 0).sort(bySale));
    const rest = list.filter((p) => !(p.pct > 0)).sort((a, b) => (b.reviews - a.reviews) || (b.price - a.price));
    rails.push({ key: "d-" + dept, dept, title: cfg.DEPT_LABELS[dept] || dept, items: sprinklePremium(s.concat(rest)) });
  }
  return rails;
}

/* The endpoint's copy of a store: rows in the store's own order (the
   search box's "Destacados" order), and each rail as row numbers. */
function fnFile(key, rows, products, rails) {
  const at = new Map(products.map((p, i) => [p, i]));
  const railIdx = {};
  for (const r of rails) railIdx[r.key] = r.items.map((p) => at.get(p));
  return { v: 1, store: key, count: rows.length, rows, rails: railIdx };
}

export function buildStore(key, root = ROOT) {
  const cfg = SLICED_STORES[key];
  const products = storeProducts(key, root);
  const rails = storeRails(key, products);
  const files = {};
  const index = {
    v: 1, store: key, label: cfg.label, count: products.length, pageSize: PAGE_SIZE, railPages: "static",
    onSale: products.filter((p) => p.pct > 0).length,
    depts: cfg.DEPT_ORDER.filter((d) => products.some((p) => p.dept === d))
      .map((d) => ({ key: d, label: cfg.DEPT_LABELS[d] || d, count: products.filter((p) => p.dept === d).length })),
    rails: rails.map((r) => ({ key: r.key, title: r.title, dept: r.dept || null, total: r.items.length,
      pages: Math.ceil(r.items.length / PAGE_SIZE), head: r.items.slice(0, RAIL_HEAD).map(cardOf) })),
  };
  files["index.json"] = index;
  for (const r of rails) {
    for (let n = 1; (n - 1) * PAGE_SIZE < r.items.length; n++) {
      files[`rails/${r.key}-${n}.json`] = { rail: r.key, page: n, pages: Math.ceil(r.items.length / PAGE_SIZE),
        total: r.items.length, items: r.items.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE).map(cardOf) };
    }
  }
  /* The search box ranks in this order: sale depth + demand. */
  const ranked = products.slice().sort((a, b) => (saleScore(b) - saleScore(a)) || (b.reviews - a.reviews));
  const rows = ranked.map((p) => [p.name, p.brand, p.price, p.was || 0, p.pct || 0, p.image, p.dept, "", ""]);
  const fn = fnFile(key, rows, ranked, rails);
  return { files, fn, products, rails };
}

/* ---------------- every other store ---------------- */
export function buildGenericStore(key, meta, rules, root = ROOT) {
  const { items, depts, facetMode, facetGenders, facetCats } = genericItems(key, meta, rules, root);
  const { R } = rules;
  const rails = genericRails(key, meta.label, items, rules);
  const rows = items.map((p) => {
    const pct = R.discountPct(p);
    return [p.name, p.brand || "", p.price, pct > 0 && p.originalPrice ? p.originalPrice : 0, pct > 0 ? pct : 0, p.image, p.dept || "",
      facetMode ? (p.gender || "") : "", facetMode ? (p.cat || "") : ""];
  });
  /* A multi-family rail or department pill opens into labelled
     sub-carousels (scripts/lib/store-subrails.js); their pages are
     endpoint rails like any other. */
  const familyOf = (p) => { try { return R.productTypeOf(p); } catch { return "ropa"; } };
  const withStore = (list) => list.map((p) => ({ p, v: { ...p, retailer: key } }));
  const subsOf = (railKey, list, family) => {
    const wrapped = withStore(list);
    const back = new Map(wrapped.map((w) => [w.v, w.p]));
    const subs = subRails(wrapped.map((w) => w.v), family);
    if (!subs) return null;
    return subs.map((s) => ({ key: subKey(railKey, s), aud: s.audLabel, title: s.title, items: s.items.map((v) => back.get(v)) }));
  };
  const subRailList = [];
  const railSubs = {};
  for (const r of rails) {
    const fam = r.key.startsWith("t-") ? r.key.slice(2) : null;
    const subs = fam && subsOf(r.key, r.items, fam);
    if (subs) { railSubs[r.key] = subs; subRailList.push(...subs); }
  }
  const fn = fnFile(key, rows, items, rails.concat(subRailList));
  const at = new Map(items.map((p, i) => [p, i]));
  const card = (p) => cardOfRow(rows[at.get(p)]);
  const subsMeta = (subs) => subs.map((s) => ({ k: s.key, a: s.aud || "", t: s.title, n: s.items.length }));
  const count = (pred) => { let n = 0; for (const p of items) if (pred(p)) n++; return n; };
  let chips;
  if (facetMode) {
    chips = { mode: "facet",
      genders: facetGenders.map((g) => ({ key: g, label: g, count: count((p) => p.gender === g) })),
      cats: facetCats.map((c) => ({ key: c, label: R.facetLabel(c), count: count((p) => p.cat === c) })) };
  } else {
    const keys = Object.keys(depts).sort((a, b) => String(depts[a]).localeCompare(String(depts[b]), "es"));
    chips = { mode: "dept", depts: keys.map((k) => ({ key: k, label: depts[k], count: count((p) => p.dept === k) })).filter((d) => d.count > 0) };
    /* A pill that is mostly one splittable family (Walmart's Hogar)
       opens into its aisles, in the grid's own order (sale depth). */
    for (const d of chips.depts) {
      const list = items.filter((p) => p.dept === d.key).sort(R.saleSort);
      const fam = dominantFamily(list, familyOf);
      const subs = fam && subsOf("c-" + d.key, list, fam);
      if (!subs) continue;
      d.subs = subsMeta(subs);
      for (const s of subs) fn.rails[s.key] = s.items.map((p) => at.get(p));
    }
  }
  const index = {
    v: 1, store: key, label: meta.label, count: items.length, pageSize: PAGE_SIZE, railPages: "fn",
    onSale: rows.filter((r) => r[4] > 0).length,
    chips,
    rails: rails.map((r, i) => headOrLazy({ key: r.key, title: r.title, total: r.items.length,
      pages: Math.ceil(r.items.length / PAGE_SIZE), ...(railSubs[r.key] ? { subs: subsMeta(railSubs[r.key]) } : {}) },
      i, () => r.items.slice(0, RAIL_HEAD).map(card))),
  };
  if (DEALS_HERO_STORES.has(key) && fn.rails.ofertas) {
    /* Deepest first: the Ofertas rail is in sale-tier order, the hero in discount order. */
    const deepest = fn.rails.ofertas.slice().sort((a, b) => (rows[b][4] - rows[a][4]) || (rows[b][2] - rows[a][2]));
    const hero = dealsHero(rows, deepest);
    if (hero) index.hero = hero;
  }
  return { files: { "index.json": index }, fn, products: items, rails };
}

/* Every store in tienda.html's registry, built. */
export function buildAll(root = ROOT, only = null) {
  const stores = tiendaStores(root);
  const rules = loadStoreRules(root);
  const out = {};
  for (const [key, meta] of Object.entries(stores)) {
    if (only && !only.includes(key)) continue;
    /* Off sale (/off-sale.js): no storefront; its folder is removed below. */
    if (isOffSaleRetailer(key)) continue;
    out[key] = SLICED_STORES[key] ? buildStore(key, root) : buildGenericStore(key, meta, rules, root);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const built = buildAll(ROOT);
  const fnDir = join(ROOT, FN_DIR);
  if (existsSync(fnDir)) rmSync(fnDir, { recursive: true });
  mkdirSync(fnDir, { recursive: true });
  /* A store dropped from the registry loses its folder. */
  for (const d of existsSync(join(ROOT, SLICES_DIR)) ? readdirSync(join(ROOT, SLICES_DIR)) : []) {
    if (d !== "_fn" && d !== "hero" && !built[d]) rmSync(join(ROOT, SLICES_DIR, d), { recursive: true });
  }
  let total = 0, fnBytes = 0;
  for (const [key, { files, fn, products, rails }] of Object.entries(built)) {
    const dir = join(ROOT, SLICES_DIR, key);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    let bytes = 0;
    for (const [name, body] of Object.entries(files)) {
      const text = JSON.stringify(body);
      bytes += text.length;
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    const fnText = JSON.stringify(fn);
    fnBytes += fnText.length;
    writeFileSync(join(fnDir, key + ".json"), fnText);
    total += products.length;
    console.log(`${key}: ${products.length} products, ${rails.length} rails (${rails.map((r) => r.key + " " + r.items.length).join(", ")}), index ${(bytes / 1024).toFixed(0)}KB, fn ${(fnText.length / 1024).toFixed(0)}KB`);
  }
  console.log(`${Object.keys(built).length} stores, ${total} products, endpoint data ${(fnBytes / 1048576).toFixed(1)}MB, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
