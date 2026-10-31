#!/usr/bin/env node
/* ============================================================
   assets/sections/disenadores/ — DISEÑADORES LATINOS, PRECOMPUTED.

   WHY (2026-10-19, #409 track T5). disenadores.html downloaded
   latino-designers-dtc-catalog.json -- 16MB raw, 2.6MB gzipped, for
   1,448 products (the file carries full descriptions and variant
   tables the gallery never shows) -- before it drew a single room.
   The Mountain Test: nothing catalogue-sized on any path a shopper
   takes.

   WHAT THIS WRITES. The page has two filters with a handful of values
   each (designer chip x type tile), so every answer is precomputed and
   static -- no function:
     index.json              counts for the chips, the tiles and the
                             hero line, and for every type filter the
                             rooms and their carousels (titles, counts)
     room-<d>-<t>.json       one room's carousels, first 12 cards each
                             (t = all or a product type)
     rail-<d>-<t>-<r>-<n>.json
                             one carousel, 48 cards at a time ("Ver todo")
     all-<d>-<t>-<n>.json    the whole room, 48 at a time ("Ver los N
                             productos")

   The rules are the page's own, moved here unchanged: the designer
   match (exact brand), the word-boundary product types, the sale rule
   (sale-rule.js), the price (tiered margin + 7% Miami tax), the order
   of carousels (Ofertas or Destacados, then one per type).

   REGENERATE after any catalogue change:
     node scripts/build-designer-slices.mjs
   scripts/test/disenadores-thin-tests.mjs fails when they drift.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { photoCount } from "./lib/photo-counts.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const OUT_DIR = "assets/sections/disenadores";
export const CATALOG = "latino-designers-dtc-catalog.json";
export const RAIL_CARDS = 12;
export const PAGE_SIZE = 48;

/* key -> exact lowercase brand, the page's DESIGNERS[].match */
export const DESIGNER_MATCH = {
  farmrio: "farm rio", aguabendita: "agua bendita", patbo: "patbo", johannaortiz: "johanna ortiz",
  silviatcherassi: "silvia tcherassi", capittana: "capittana", ancora: "ancora swimwear", eberjey: "eberjey",
  vix: "vix", montce: "montce", tns: "tns", osklen: "osklen", lennyniemeyer: "lenny niemeyer",
  adrianadegreas: "adriana degreas", andresotalora: "andres otalora", dondeesteban: "donde esteban",
  amirslama: "amir slama", alexandrebirman: "alexandre birman", sarahchofakian: "sarah chofakian",
  aguabyaguabendita: "agua by agua bendita",
};
export const PRODUCT_TYPES = [
  { key: "trajes_bano", label: "Trajes de Baño", keywords: ["bikini", "swimsuit", "swim", "one-piece", "two-piece", "beach", "swimwear", "rash guard"] },
  { key: "carteras", label: "Carteras", keywords: ["bag", "handbag", "purse", "tote", "clutch", "backpack", "crossbody", "satchel"] },
  { key: "joyas", label: "Joyas", keywords: ["jewelry", "earring", "necklace", "bracelet", "ring", "pendant", "charm"] },
  { key: "zapatos", label: "Zapatos", keywords: ["shoe", "sandal", "heel", "sneaker", "flat", "mule", "boot", "loafer", "espadrille"] },
  { key: "sombreros", label: "Sombreros", keywords: ["hat", "cap", "beanie", "fedora", "visor"] },
  { key: "accesorios", label: "Accesorios", keywords: ["scarf", "belt", "sunglasses", "wallet", "glove", "shawl", "pareo", "sarong"] },
  { key: "ropa", label: "Ropa", keywords: [] },
];
const TYPE_RES = PRODUCT_TYPES.map((t) => ({ key: t.key, res: t.keywords.map((kw) => new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&") + "(?:es|s)?\\b")) }));
export function productTypeOf(item) {
  const n = String((item && item.name) || "").toLowerCase();
  for (const t of TYPE_RES) for (const re of t.res) if (re.test(n)) return t.key;
  return "ropa";
}
export function designerKeyFor(item) {
  const b = String((item && item.brand) || "").toLowerCase().trim();
  if (!b) return null;
  for (const [k, m] of Object.entries(DESIGNER_MATCH)) if (b === m) return k;
  return null;
}
function tieredMarginUsd(r) {
  return Math.min(r, 500) * 0.24 + Math.min(Math.max(r - 500, 0), 1500) * 0.18 + Math.min(Math.max(r - 2000, 0), 3000) * 0.12 + Math.max(r - 5000, 0) * 0.08;
}
/* The page's ariaPrice: raw + tiered margin, x 1.07 Miami sales tax. */
export function ariaPrice(raw) {
  const r = Number(raw);
  if (!(r > 0)) return null;
  return Math.round((r + tieredMarginUsd(r)) * 1.07 * 100) / 100;
}

export function loadItems(root = ROOT) {
  const win = {};
  new Function("window", readFileSync(join(root, "sale-rule.js"), "utf8"))(win);
  const AriaSale = win.AriaSale;
  const data = JSON.parse(readFileSync(join(root, CATALOG), "utf8"));
  const out = [];
  for (const rk of Object.keys(data.retailers || {})) {
    const bucket = data.retailers[rk] && data.retailers[rk].departments && data.retailers[rk].departments.latino_designers;
    for (const it of (bucket && bucket.items) || []) {
      const price = ariaPrice(it.price);
      const onSale = !!AriaSale.isOnSale(it);
      const oRawUsd = onSale ? Number(AriaSale.originalPrice(it)) : null;
      const oFinal = onSale ? ariaPrice(oRawUsd) : null;
      const sale = oFinal != null && price != null && oFinal > price;
      out.push({
        name: it.name || "Producto sin título",
        brand: it.brand || "",
        dkey: designerKeyFor(it),
        raw: Number(it.price) > 0 ? Number(it.price) : 0,
        rawWas: sale ? oRawUsd : 0,
        price, originalPrice: sale ? oFinal : null, onSale,
        image: typeof it.image === "string" && /^https?:\/\//i.test(it.image) ? it.image : "",
        ptype: productTypeOf(it),
        ph: photoCount(root, it.name || "", rk),
      });
    }
  }
  return out;
}

function discount(it) {
  if (!it.onSale || !it.originalPrice || !(it.originalPrice > it.price)) return 0;
  return 1 - it.price / it.originalPrice;
}
const stable = (arr, cmp) => arr.map((p, i) => ({ p, i })).sort((a, b) => cmp(a.p, b.p) || (a.i - b.i)).map((x) => x.p);
/* A room's carousels, as the page built them. */
export function roomRails(label, items) {
  const rails = [];
  const sales = items.filter((it) => discount(it) > 0);
  if (sales.length) rails.push({ k: "ofertas", title: "Ofertas de " + label, items: stable(sales, (a, b) => discount(b) - discount(a)) });
  else if (items.length) rails.push({ k: "destacados", title: "Destacados de " + label, items: stable(items, (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0)) });
  const byType = {};
  for (const it of items) (byType[it.ptype || "ropa"] = byType[it.ptype || "ropa"] || []).push(it);
  for (const t of PRODUCT_TYPES) if ((byType[t.key] || []).length) rails.push({ k: t.key, title: t.label, items: byType[t.key] });
  return rails;
}
/* t title, b brand, p store price (USD, raw: the page prices it), o
   raw was-price (sales only), s percent off, i photo. */
export function cardOf(it) {
  const c = { t: it.name, p: it.raw };
  if (it.brand) c.b = it.brand;
  if (it.originalPrice != null && it.price != null) {
    const pct = Math.round((1 - it.price / it.originalPrice) * 100);
    if (pct > 0) c.s = pct;
    c.o = it.rawWas;
  }
  if (it.image) c.i = it.image;
  /* ph: the photo count when 2+ (#443 c.6546035414): the card's photo
     arrows, as every department card has them. */
  if (it.ph > 1) c.ph = it.ph;
  return c;
}

export function build(root = ROOT, labels) {
  const items = loadItems(root);
  const out = join(root, OUT_DIR);
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(out, { recursive: true });
  const write = (name, obj) => writeFileSync(join(out, name), JSON.stringify(obj));
  const byD = {};
  const typeCounts = {};
  for (const it of items) {
    if (it.dkey) (byD[it.dkey] = byD[it.dkey] || []).push(it);
    typeCounts[it.ptype] = (typeCounts[it.ptype] || 0) + 1;
  }
  const index = { v: 1, total: items.length, designers: {}, types: typeCounts, railCards: RAIL_CARDS, pageSize: PAGE_SIZE, views: {} };
  for (const k of Object.keys(byD)) index.designers[k] = byD[k].length;
  let files = 1;
  for (const t of ["all"].concat(PRODUCT_TYPES.map((x) => x.key))) {
    const view = {};
    for (const d of Object.keys(DESIGNER_MATCH)) {
      const list = (byD[d] || []).filter((it) => t === "all" || it.ptype === t);
      if (!list.length) continue;
      const label = (labels && labels[d]) || d;
      const rails = roomRails(label, list);
      view[d] = { count: list.length, pages: Math.ceil(list.length / PAGE_SIZE), rails: rails.map((r) => ({ k: r.k, title: r.title, count: r.items.length, pages: Math.ceil(r.items.length / PAGE_SIZE) })) };
      write(`room-${d}-${t}.json`, { d, t, rails: rails.map((r) => ({ k: r.k, cards: r.items.slice(0, RAIL_CARDS).map(cardOf) })) }); files++;
      for (const r of rails) for (let n = 0; n * PAGE_SIZE < r.items.length; n++) { write(`rail-${d}-${t}-${r.k}-${n}.json`, { page: n, pages: Math.ceil(r.items.length / PAGE_SIZE), count: r.items.length, cards: r.items.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE).map(cardOf) }); files++; }
      for (let n = 0; n * PAGE_SIZE < list.length; n++) { write(`all-${d}-${t}-${n}.json`, { page: n, pages: Math.ceil(list.length / PAGE_SIZE), count: list.length, cards: list.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE).map(cardOf) }); files++; }
    }
    index.views[t] = view;
  }
  write("index.json", index);
  return { items: items.length, designers: Object.keys(byD).length, files };
}

/* The page's room labels ("Ofertas de Farm Rio"), read from its DESIGNERS. */
export function pageLabels(root = ROOT) {
  const src = readFileSync(join(root, "disenadores.html"), "utf8");
  const out = {};
  for (const m of src.matchAll(/\{ key:'([a-z]+)',[^}]*?label:'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = build(ROOT, pageLabels());
  console.log(`${s.items} products, ${s.designers} designers, ${s.files} files -> ${OUT_DIR}/`);
}
