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

/* ---------------- THE AUTOS SECTION (#443 c.6441034782, c.6441108929,
   c.6441157548: Danny's autos-first ruling) ----------------

   BASICS: the everyday parts every car needs, one card per part
   CATEGORY (never one SKU): a real AutoZone photo of that kind of part,
   how many vehicles the store carries it for, and the call
   "ELIGE TU AÑO, MARCA Y MODELO", which opens the vehicle pick and
   only then shows what fits that car. Batteries are not in the data,
   so they have no card. */
export const BASICS = [
  { s: "pastillas-de-freno", label: "Pastillas de freno", type: "Brake Pads" },
  { s: "bujias", label: "Bujías", type: "Spark Plugs" },
  { s: "filtro-de-aceite", label: "Filtros de aceite", type: "Oil Filter" },
  { s: "filtro-de-aire", label: "Filtros de aire", type: "Air Filter" },
  { s: "filtro-de-combustible", label: "Filtros de combustible", type: "Fuel Filter" },
  { s: "limpiaparabrisas", label: "Plumillas limpiaparabrisas", type: "Windshield Wiper Blade" },
  { s: "filtro-de-aire-de-cabina", label: "Filtros de aire de cabina", type: "Cabin Air Filter" },
  { s: "bobina-de-encendido", label: "Bobinas de encendido", type: "Ignition Coil" },
];

/** AutoZone's priced, photographed parts from the auto cache, one per part number. */
export function loadAutoZone(root = ROOT) {
  const c = JSON.parse(readFileSync(join(root, "auto-cache.json"), "utf8"));
  const seen = new Set(), out = [];
  for (const v of Object.values(c.partSearches || {})) {
    for (const it of (v && v.autozone) || []) {
      const pn = it.part_number || "";
      const title = it.productTitle || "";
      const price = Number(it.discounted_price || it.price);
      const img = realPhoto(it.thumbnail || (it.images && it.images[0]));
      if (!title || !(price > 0) || !img) continue;
      const key = pn || title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ title, brand: it.brand || "", retailer: "autozone", rawPrice: price, salePct: 0, wasPrice: 0, image: img, type: it.part_type || "", pn });
    }
  }
  return out;
}

export function buildAutos(root = ROOT) {
  const idx = JSON.parse(readFileSync(join(root, "assets/auto/index.json"), "utf8"));
  const az = loadAutoZone(root);
  const adv = loadAutoParts(root).filter((p) => (p.image = realPhoto(p.image)));
  const basics = [];
  for (const b of BASICS) {
    const at = idx.parts.findIndex((x) => x.s === b.s);
    if (at < 0) continue;
    const vehicles = Object.values(idx.has).filter((l) => l.includes(at)).length;
    const pick = az.filter((p) => p.type === b.type).sort((a, z) => z.rawPrice - a.rawPrice)[0];
    if (!vehicles || !pick) continue;   // no data, no card
    basics.push({ s: b.s, label: b.label, q: idx.parts[at].es, vehicles, img: pick.image });
  }
  /* A card for an AutoZone part carries its part number, which is how
     the product page and the finder confirm the fit. */
  const azCard = (p) => ({ ...card(p), pn: p.pn });
  const rails = [
    { key: "advance-repuestos", store: "Advance Auto Parts", label: "Repuestos", href: "#buscar", count: adv.length, cards: pickRail(adv).map(card) },
    { key: "autozone-repuestos", store: "AutoZone", label: "Repuestos", href: "#buscar", count: az.length, cards: pickRail(az).map(azCard) },
  ].filter((r) => r.cards.length);
  return {
    basics,
    rails,
    vehicles: idx.vehicles.length,
    makes: idx.makes.length,
    /* No accessories in either store's data yet: those rails ship when
       the data is real (c.6441034782 item 3), never with filler. */
    missing: ["advance-accesorios", "autozone-accesorios"],
    parts: az.length + adv.length,
  };
}

/* ---------------- THE FINDER, FROM auto.html ----------------
   The car section's part lookup is auto.html's own finder (year, make,
   model, then a part name or number against the auto catalogue): its
   markup and script are copied in here, so there is one finder, and
   its stylesheet is scoped under #aaFinder so it cannot touch the
   store's own cards. aria-auto-front-tests fails if the copy drifts. */
const SKIP_CSS = /^(:root|\*|html|body|a|\.wrap|\.topbar.*|\.mainnav.*|\.brand.*|\.navlinks.*|\.hero.*|\.kicker|footer.*)$/;
function scopeCss(css) {
  const out = [];
  let i = 0;
  const block = (from) => { let d = 0, j = css.indexOf("{", from); for (; j < css.length; j++) { if (css[j] === "{") d++; else if (css[j] === "}" && --d === 0) break; } return j; };
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const close = block(open);
    const body = css.slice(open + 1, close);
    i = close + 1;
    if (head.startsWith("@keyframes")) { out.push(head.replace(/@keyframes\s+(\S+)/, "@keyframes aaf-$1") + "{" + body + "}"); continue; }
    if (head.startsWith("@media")) { const inner = scopeCss(body); if (inner) out.push(head + "{" + inner + "}"); continue; }
    if (head === ":root") { out.push("#aaFinder{" + body.trim() + "}"); continue; }
    const sels = head.split(",").map((x) => x.trim()).filter((x) => x && !SKIP_CSS.test(x));
    if (!sels.length) continue;
    out.push(sels.map((x) => "#aaFinder " + x.replace(/^\.card\b/, ".fcard")).join(",") + "{" + body.trim().replace(/animation:\s*(spin|sh)\b/g, "animation:aaf-$1") + "}");
  }
  return out.join("\n");
}
export function extractFinder(root = ROOT) {
  const page = readFileSync(join(root, "auto.html"), "utf8").replace(/\r\n/g, "\n");
  const css = page.slice(page.indexOf("<style>") + 7, page.indexOf("</style>"));
  const banner = page.slice(page.indexOf('<div id="fatalBanner"'), page.indexOf("</div>\n</div>", page.indexOf('<div id="fatalBanner"')) + 13);
  const m0 = page.indexOf("<!-- STEP 1: vehicle -->");
  const m1 = page.indexOf('<div id="results"', m0);
  const markup = page.slice(m0, page.indexOf("</div>", m1) + 6).replace(/class="card(\s|")/g, 'class="fcard$1');
  const toast = '<div id="toast" role="status" aria-live="polite"></div>';
  const s0 = page.indexOf('<script>\n"use strict";');
  const script = page.slice(s0 + 8, page.indexOf("</script>", s0));
  if (m0 < 0 || m1 < 0 || s0 < 0 || !banner.includes("fatalMsg")) throw new Error("auto.html: the finder moved -- update build-aria-auto-front.mjs");
  return { css: scopeCss(css), markup: banner + "\n" + markup + "\n" + toast, script };
}

export function buildFront(root = ROOT) {
  const motos = loadMotoItems(root);
  const autos = loadAutoParts(root);
  const census = { motos: motos.length, revzilla: motos.filter((p) => p.retailer === "revzilla").length, denniskirk: motos.filter((p) => p.retailer === "denniskirk").length, autoParts: autos.length };
  const shown = (list) => list.filter((p) => (p.image = realPhoto(p.image)));
  const motoShown = shown(motos), autoShown = shown(autos);
  const byClass = {};
  for (const p of motoShown) (byClass[frontClass(p)] = byClass[frontClass(p)] || []).push(p);
  const countAll = { ofertas: motos.filter((p) => p.salePct > 0).length };
  for (const p of motos) countAll[frontClass(p)] = (countAll[frontClass(p)] || 0) + 1;
  /* Ofertas shows the range: the best sale of each class in turn. */
  const saleLanes = CLASSES.filter((c) => c.key !== "ofertas").map((c) => pickRail((byClass[c.key] || []).filter((p) => p.salePct > 0)));
  const ofertas = [];
  for (let i = 0; ofertas.length < RAIL_CARDS && saleLanes.some((l) => i < l.length); i++) for (const l of saleLanes) if (l[i] && ofertas.length < RAIL_CARDS) ofertas.push(l[i]);
  byClass.ofertas = ofertas;
  const rails = [];
  for (const c of CLASSES) {
    const list = byClass[c.key] || [];
    if (!list.length) continue;
    const picked = c.key === "ofertas" ? list : pickRail(list);
    rails.push({ key: c.key, label: c.label, href: c.href, count: countAll[c.key] || 0, img: picked[0].image, cards: picked.map(card) });
  }
  return { v: 1, census, rails, autos: buildAutos(root) };
}

function between(html, start, end, inner) {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error(`${PAGE}: ${start} markers missing`);
  return html.slice(0, a) + start + inner + html.slice(b);
}
export function writePage(root = ROOT) {
  const front = buildFront(root);
  const finder = extractFinder(root);
  const file = join(root, PAGE);
  let html = readFileSync(file, "utf8");
  /* </ in a title can never close the script. */
  const json = JSON.stringify(front).replace(/</g, "\\u003c");
  html = between(html, START, END, `<script type="application/json" id="ariaAutoData">${json}</script>`);
  html = between(html, "/*ARIA-AUTO-FINDER-CSS*/", "/*/ARIA-AUTO-FINDER-CSS*/", "\n" + finder.css + "\n");
  html = between(html, "<!--ARIA-AUTO-FINDER-->", "<!--/ARIA-AUTO-FINDER-->", "\n" + finder.markup + "\n");
  html = between(html, "<!--ARIA-AUTO-FINDER-JS-->", "<!--/ARIA-AUTO-FINDER-JS-->", "<script>\n" + finder.script + "</script>");
  writeFileSync(file, html);
  return front;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = writePage();
  console.log(`census ${JSON.stringify(f.census)}; rails ${f.rails.map((r) => r.key + ":" + r.cards.length + "/" + r.count).join(" ")}; autos basics ${f.autos.basics.map((b) => b.s + ":" + b.vehicles).join(" ")} rails ${f.autos.rails.map((r) => r.key + ":" + r.cards.length + "/" + r.count).join(" ")}`);
}
