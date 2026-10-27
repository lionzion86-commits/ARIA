#!/usr/bin/env node
/* ============================================================
   ARIA AUTO'S FRONT DOOR, PRECOMPUTED (#443 c.6427505203, Danny
   2026-10-26; amended c.6428323317: "make it its own thing").

   Auto-industry reviewers (the Turn 14 / Keystone class) are sent to
   auto.ariashop.pe (and ariaauto.pe). The first screen must read as an
   auto and moto store with its own identity, and prove it with the real
   catalogue: the moto census (RevZilla + Dennis Kirk) and the auto
   parts (Advance Auto Parts), in the standing Motos order --

     Ofertas, Cascos, Llantas, Accesorios, Repuestos, Equipaje, Equipo,
     Ropa (last)

   -- with the auto parts as their own rail. This is a front door, not a
   rebuild: every tile and card routes into the existing sections
   (motos.html, auto.html, producto.html).

   RULES
     - No image, no card (#443 c.6406145536): a product without a photo,
       or with a store's placeholder art (RevZilla's missing_480x480.png),
       is never a card or a tile picture.
     - Prices are raw store prices; the page prices them exactly as
       motos.html does (scripts/test/price-parity-tests.mjs pins both).
     - The data is written INTO aria-auto.html (between the markers), so
       the first screen draws its cards with no catalogue request -- the
       Mountain Test.

     node scripts/build-aria-auto-front.mjs
   scripts/test/aria-auto-front-tests.mjs fails when the page drifts.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadItems as loadMotoItems } from "./build-motos-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PAGE = "aria-auto.html";
export const RAIL_CARDS = 12;
const START = "<!--ARIA-AUTO-DATA-->";
const END = "<!--/ARIA-AUTO-DATA-->";

/* A store's "no photo" art is not a photo. */
const PLACEHOLDER_ART = /missing_\d+x\d+|no[-_]?image|placeholder|coming[-_]?soon/i;
export function realPhoto(url) {
  const u = String(url || "");
  return /^https:\/\//.test(u) && !PLACEHOLDER_ART.test(u) ? u : "";
}

/* The front door's classes, in the standing Motos order. The moto
   subtypes (netlify/functions/_motos-core.js) give Cascos, Llantas and
   Repuestos; Equipaje, Equipo and Ropa are split out by title. */
const EQUIPAJE = /\b(saddle ?bags?|tank ?bags?|tail ?bags?|luggage|top ?case|topcase|panniers?|backpacks?|duffel|dry ?bags?|sissy ?bar bags?|bags?|maletas?|alforjas?)\b/i;
const EQUIPO = /\b(gloves?|boots?|armou?r|protectors?|knee|elbow|chest|goggles?|braces?|guantes?|botas?)\b/i;
/* Hardware that borrows a gear word: a boot MOUNT, a glove BOX, a bag
   HINGE cover, a luggage RACK, an exhaust's end CAPS. */
const HARDWARE = /\b(mounts?|covers?|cubby|hinges?|racks?|exhausts?|brackets?|holders?|gun|radiator|fork|disc|seals?|skid|frame|engine)\b|glove box|end caps/i;
const ROPA = /\b(jackets?|pants?|jeans?|vests?|suits?|rain|shirts?|tees?|t-shirts?|hoodies?|sweatshirts?|jerseys?|hats?|caps?|beanies?|socks?|chaquetas?)\b/i;
export function frontClass(p) {
  if (p.subtype === "cascos") return "cascos";
  if (p.subtype === "llantas") return "llantas";
  if (p.subtype === "repuestos") return "repuestos";
  const t = p.title;
  if (HARDWARE.test(t)) return "accesorios";
  if (EQUIPAJE.test(t)) return "equipaje";
  if (EQUIPO.test(t)) return "equipo";
  if (ROPA.test(t)) return "ropa";
  return "accesorios";
}

export const CLASSES = [
  { key: "ofertas", label: "Ofertas", href: "motos.html" },
  { key: "cascos", label: "Cascos", href: "motos.html?t=cascos" },
  { key: "llantas", label: "Llantas", href: "motos.html?t=llantas" },
  { key: "accesorios", label: "Accesorios", href: "motos.html?t=accesorios" },
  { key: "repuestos", label: "Repuestos de moto", href: "motos.html?t=repuestos" },
  { key: "autopartes", label: "Repuestos de auto", href: "auto.html" },
  { key: "equipaje", label: "Equipaje", href: "motos.html?t=accesorios&q=bag" },
  { key: "equipo", label: "Equipo de protección", href: "motos.html?t=ropa_equipo" },
  { key: "ropa", label: "Ropa", href: "motos.html?t=ropa_equipo" },
];

/* t title, r store, p raw price, b brand, s percent off, o raw was-price, i photo (motos.html's card). */
function card(p) {
  const c = { t: p.title, r: p.retailer, p: p.rawPrice };
  if (p.brand) c.b = p.brand;
  if (p.salePct > 0) { c.s = p.salePct; if (p.wasPrice > p.rawPrice) c.o = p.wasPrice; }
  c.i = p.image;
  return c;
}

/* A rail that proves range: sales first, then the fuller-priced pieces,
   one store then the other so neither crowds the row. */
export function pickRail(list, n = RAIL_CARDS) {
  const ranked = list.slice().sort((a, b) => (b.salePct > 0) - (a.salePct > 0) || b.salePct - a.salePct || b.rawPrice - a.rawPrice);
  const byStore = new Map();
  for (const p of ranked) { if (!byStore.has(p.retailer)) byStore.set(p.retailer, []); byStore.get(p.retailer).push(p); }
  const lanes = [...byStore.values()];
  const out = [], seen = new Set(), kinds = new Map();
  for (let i = 0; out.length < n && lanes.some((l) => i < l.length); i++) {
    for (const l of lanes) {
      const p = l[i];
      if (!p || out.length >= n) continue;
      const k = p.title.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "");   // one size of a product, not five
      /* and range, not twelve clutch kits: two of a kind at most */
      const kind = k.replace(/[^a-z ]+/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
      if (seen.has(k) || (kinds.get(kind) || 0) >= 2) continue;
      seen.add(k);
      kinds.set(kind, (kinds.get(kind) || 0) + 1);
      out.push(p);
    }
  }
  return out;
}

export function loadAutoParts(root = ROOT) {
  const win = {};
  new Function("window", readFileSync(join(root, "sale-rule.js"), "utf8"))(win);
  const data = JSON.parse(readFileSync(join(root, "advanceauto-catalog.json"), "utf8"));
  const items = (((data.retailers.advanceauto || {}).departments || {}).auto_parts || {}).items || [];
  const out = [];
  for (const it of items) {
    const title = it.name || it.title || "";
    const rawPrice = Number(it.price);
    if (!title || !(rawPrice > 0)) continue;
    const salePct = win.AriaSale.discountPct(it);
    out.push({
      title: String(title), brand: it.brand || "", retailer: "advanceauto", rawPrice, salePct,
      wasPrice: salePct > 0 ? Number(win.AriaSale.originalPrice(it)) || 0 : 0,
      image: it.thumbnail || it.image || (it.images && it.images[0]) || "",
    });
  }
  return out;
}

export function buildFront(root = ROOT) {
  const motos = loadMotoItems(root);
  const autos = loadAutoParts(root);
  const census = { motos: motos.length, revzilla: motos.filter((p) => p.retailer === "revzilla").length, denniskirk: motos.filter((p) => p.retailer === "denniskirk").length, autoParts: autos.length };
  const shown = (list) => list.filter((p) => (p.image = realPhoto(p.image)));
  const motoShown = shown(motos), autoShown = shown(autos);
  const byClass = { autopartes: autoShown };
  for (const p of motoShown) (byClass[frontClass(p)] = byClass[frontClass(p)] || []).push(p);
  const countAll = { ofertas: motos.filter((p) => p.salePct > 0).length, autopartes: autos.length };
  for (const p of motos) countAll[frontClass(p)] = (countAll[frontClass(p)] || 0) + 1;
  /* Ofertas shows the range: the best sale of each class in turn. */
  const saleLanes = CLASSES.filter((c) => c.key !== "ofertas").map((c) => pickRail((byClass[c.key] || []).filter((p) => p.salePct > 0)));
  const ofertas = [];
  for (let i = 0; ofertas.length < RAIL_CARDS && saleLanes.some((l) => i < l.length); i++) for (const l of saleLanes) if (l[i] && ofertas.length < RAIL_CARDS) ofertas.push(l[i]);
  byClass.ofertas = ofertas;
  countAll.ofertas += autos.filter((p) => p.salePct > 0).length;
  const rails = [];
  for (const c of CLASSES) {
    const list = byClass[c.key] || [];
    if (!list.length) continue;
    const picked = c.key === "ofertas" ? list : pickRail(list);
    rails.push({ key: c.key, label: c.label, href: c.href, count: countAll[c.key] || 0, img: picked[0].image, cards: picked.map(card) });
  }
  return { v: 1, census, rails };
}

export function writePage(root = ROOT) {
  const front = buildFront(root);
  const file = join(root, PAGE);
  const html = readFileSync(file, "utf8");
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${PAGE}: data markers missing`);
  /* </ in a title can never close the script. */
  const json = JSON.stringify(front).replace(/</g, "\\u003c");
  const block = `${START}<script type="application/json" id="ariaAutoData">${json}</script>`;
  writeFileSync(file, html.slice(0, a) + block + html.slice(b));
  return front;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = writePage();
  console.log(`census ${JSON.stringify(f.census)}; rails ${f.rails.map((r) => r.key + ":" + r.cards.length + "/" + r.count).join(" ")}`);
}
