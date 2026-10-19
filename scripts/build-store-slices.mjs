#!/usr/bin/env node
/* ============================================================
   assets/tienda/<store>/ — A STOREFRONT, SLICED (Issue #413, #409 format).

   WHY. tienda.html draws a store by downloading its whole catalogue --
   for Best Buy that would be 9.9MB (2.5MB gzipped) before the first
   card, 50 seconds on the Mountain profile (400 kbps). A store launched
   in the thin format answers from small files instead, and the page
   never touches the catalogue.

   WHAT. For each store in SLICED_STORES, from its committed catalogue:

     index.json             what the first screen needs, in one file: the
                            store's count, its department chips, and every
                            rail's title, total and first RAIL_HEAD cards
     rails/<rail>-<n>.json  page n (PAGE_SIZE cards) of one rail, for
                            "Ver todo" and "Mostrar más"
     find.json              title + brand + card fields of every product,
                            packed; fetched only when the shopper types in
                            the store's search box

   Cards carry only what a card draws: name, brand, Best Buy's price, the
   was-price when sale-rule.js calls it a sale, the photo. The customer
   price (tiered margin + 7%) and the soles are computed on the page by
   the same finalUsd every storefront uses.

   MERCHANDISING (Danny, #413 storefront-feel addendum). Rails in order:
     1. Ofertas de <store> -- sale items only (the one sale rule), sale
        depth + demand lead, premium sprinkled, never leading;
     2. Más vendidos -- demand: the store's own review counts (the same
        signal the search "Más vendidos" lane ranks by, #416);
     3. one rail per department the data supports, in DEPT_ORDER.

   REGENERATE after the catalogue changes:
     node scripts/build-store-slices.mjs
   scripts/test/bestbuy-tests.mjs fails when the slices are stale.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { liftDeclarations, pageHtml } from "./lib/page-lift.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const SLICES_DIR = "assets/tienda";
export const PAGE_SIZE = 48;
export const RAIL_HEAD = 16;
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
  "UNSHIPPABLE_BULKY_RX", "BULKY_SMALL_OK_RX", "UNSHIPPABLE_WEIGHT_KG", "PROJECTOR_RX", "BULKY_PROJECTOR_PACKAGE_RX", "isShippableItem"];
export function loadShippable(root = ROOT) {
  return liftDeclarations(pageHtml(root), SHIP_NAMES).isShippableItem;
}

function realImage(p) {
  const cands = [p.image, p.imageUrl, p.thumbnail, ...(Array.isArray(p.images) ? p.images : [])];
  for (const u of cands) if (typeof u === "string" && /^https?:\/\//.test(u) && u.length > 20) return u;
  return null;
}

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
      });
    }
  }
  return out;
}

const cardOf = (p) => {
  const c = { name: p.name, price: p.price, image: p.image };
  if (p.brand) c.brand = p.brand;
  if (p.was) c.was = p.was;
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
  const best = products.filter((p) => p.reviews > 0).sort((a, b) => (b.reviews - a.reviews) || (b.rating - a.rating));
  if (best.length) rails.push({ key: "masvendidos", title: "Más vendidos", items: sprinklePremium(best) });
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

/* The search box's file: one row per product, the shared photo prefix
   stripped once. [name, brand, price, was, imageTail, deptIndex] */
export function findFile(key, products) {
  const cfg = SLICED_STORES[key];
  const imgs = products.map((p) => p.image);
  let prefix = imgs[0] || "";
  for (const u of imgs) { while (prefix && !u.startsWith(prefix)) prefix = prefix.slice(0, -1); }
  const ranked = products.slice().sort((a, b) => (saleScore(b) - saleScore(a)) || (b.reviews - a.reviews));
  return {
    v: 1, store: key, prefix, depts: cfg.DEPT_ORDER,
    rows: ranked.map((p) => [p.name, p.brand, p.price, p.was || 0, p.image.slice(prefix.length), cfg.DEPT_ORDER.indexOf(p.dept)]),
  };
}

export function buildStore(key, root = ROOT) {
  const cfg = SLICED_STORES[key];
  const products = storeProducts(key, root);
  const rails = storeRails(key, products);
  const files = {};
  const index = {
    v: 1, store: key, label: cfg.label, count: products.length, pageSize: PAGE_SIZE,
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
  files["find.json"] = findFile(key, products);
  return { files, products, rails };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const key of Object.keys(SLICED_STORES)) {
    const { files, products, rails } = buildStore(key);
    const dir = join(ROOT, SLICES_DIR, key);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(join(dir, "rails"), { recursive: true });
    let bytes = 0;
    for (const [name, body] of Object.entries(files)) {
      const text = JSON.stringify(body);
      bytes += text.length;
      writeFileSync(join(dir, name), text);
    }
    console.log(`${SLICES_DIR}/${key}: ${products.length} products, ${rails.length} rails, ${Object.keys(files).length} files, ${(bytes / 1024).toFixed(0)}KB raw`);
    console.log(rails.map((r) => `${r.title}: ${r.items.length}`).join(" | "));
  }
}
