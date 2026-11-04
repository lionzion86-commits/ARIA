#!/usr/bin/env node
/* ============================================================
   BLUE MOSAIC SECTION BACKDROP (#443 c.6632505766, c.6633619772;
   Danny, live call 2026-11-04). PREVIEW.

   Every blue (non-navy) section band gets an icy-blue mosaic instead of
   the flat blue: small rounded tiles (radius 15% of the tile) on a
   #CEDAE8 grout, eight icy blues varied per tile, about 1 in 20 tiles in
   Aria champagne gold. Product cards are not touched; navy stays navy.

   Three small inline SVG layers on one 10px grid (9px tiles, 1px grout) repeated with
   background-repeat: no image request, no layout shift. The rule lives
   between the aria-mosaic markers in each page that has a blue band
   (index.html, ofertas.html), written from here so every copy is the
   same bytes:
     node scripts/build-mosaic.mjs           (write)
     node scripts/build-mosaic.mjs --check   (exit 1 when a page is stale)
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
/* MOSAIC EVERYWHERE (#443 c.6636742648, scope pin c.6636752661): the
   mosaic is the site-wide backdrop. Every listing page also gets the tile
   as its page field (FIELD, below) plus its own ink rules (PAGE_INK), so
   the text that sat on the old white reads navy on the mosaic. Product
   cards, photo heroes, navy bands and themed pages (flagship stores, the
   perfume room) keep their own backgrounds: the field rule carries no
   !important and is weaker than any class-scoped background. */
export const PAGES = ["index.html", "ofertas.html", "tienda.html", "departamento.html", "categorias.html", "tiendas.html", "search.html", "marca.html", "motos.html", "auto.html"];
const FIELD_SEL = "html body";
/* Danny named the perfume room too: its cream field (body.lux-perfumes)
   takes the mosaic; its dark photo hero stays. */
const FIELD_EXTRA = { "departamento.html": ",html body.lux-perfumes" };
/* Navy ink for what now sits on the mosaic (the #659/#662 treatment):
   muted grey turns slate navy, small blue links turn a deeper blue, the
   gold word in a page title turns dark champagne. Scoped "html body ..."
   so it outranks the runtime header styles (dept-header.js, nav-filter.js)
   but not a themed page's own class rules (html.store-flagship ...,
   body.lux-perfumes ..., .nf-dark ...). Product cards are never named. */
const MUTE = "#3A4A6B", LINK = "#1E3FAE", GOLD_INK = "#7A5A12";
const on = (sels) => sels.split(",").map((x) => "html body " + x.trim()).join(",");
const DEPT_LIKE = `${on(".count,.dh-sec>h2,.dh-sec .dh-note,.dh-count,.dh-empty,.re-more,.state p,.nf-count,.nf-msg,.tp-row .tp-lead,footer")}{color:${MUTE}}
${on("footer a,.rail-head .ver-todo,.lens-head a")}{color:${LINK}}`;
const DIRECTORY = `${on("main")}{--muted:${MUTE};--gold:${GOLD_INK}}
${on(".store-card")}{background:#fff}`;
const LISTING = `${on("#status,#meta-line,.search-hero p,.fc-sub,.lane-n,.ch-head p,.empty,.re-more,.nf-count,.nf-msg,.tp-row .tp-lead")}{color:${MUTE}}
${on("#status .ok")}{color:#0F6B34}`;
export const PAGE_INK = {
  "ofertas.html": "",
  "tienda.html": `${on(".count-line,.nf-count,.nf-msg,.tp-row .tp-lead,.footer-inner")}{color:${MUTE}}
${on(".site-footer")}{background:transparent}
${on(".rail-ver,.site-footer a")}{color:${LINK}}`,
  "departamento.html": DEPT_LIKE,
  "motos.html": DEPT_LIKE,
  "categorias.html": DIRECTORY,
  "tiendas.html": DIRECTORY,
  "search.html": LISTING,
  "marca.html": LISTING,
  "auto.html": `${on(".note")}{color:${MUTE}}`,
};
export const GROUT = "#CEDAE8";
export const TILES = ["#C4D4E6", "#D2E0F0", "#B2C6E0", "#DEE9F6", "#BCCEE8", "#A8BEDC", "#E9F0F8", "#C8D6EA"];
export const GOLD = "#D8C08A";
const N = 10, CELL = 10, TILE = 9, OFF = 0, RX = +(TILE * 0.15).toFixed(2);

/* Deterministic (seeded) so the bytes only change when this file does. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const tor = (n) => (a, b) => Math.min(Math.abs(a - b), n - Math.abs(a - b));

/* THREE LAYERS, ONE GRID. Every tile sits on the same 10px grid, so the
   layers stack cleanly; their repeats differ (100, 170, 130px), so the
   pattern only comes back every 22100px and never reads as stripes or a
   lattice:
     base   10x10 tiles, every cell an icy blue, on the grout;
     vary   17x17 cells, ~1 in 9 re-coloured with another icy blue;
     gold   13x13 cells, 8 champagne tiles (about 1 in 20 overall), each
            in its own row and column, never two close together. */
export const LAYERS = [
  { name: "gold", n: 13 },
  { name: "vary", n: 17 },
  { name: "base", n: N },
];

export function layerGrid(name) {
  if (name === "base") {
    const r = rng(443), g = Array.from({ length: N }, () => Array(N).fill(null));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const left = g[y][(x + N - 1) % N], up = g[(y + N - 1) % N][x];
      let c; do { c = TILES[Math.floor(r() * TILES.length)]; } while (c === left || c === up);
      g[y][x] = c;
    }
    return g;
  }
  const n = name === "gold" ? 13 : 17, r = rng(name === "gold" ? 8020 : 1104), t = tor(n);
  const g = Array.from({ length: n }, () => Array(n).fill(null));
  if (name === "gold") {
    const pts = [];
    for (let tries = 0; pts.length < 8 && tries < 20000; tries++) {
      const x = Math.floor(r() * n), y = Math.floor(r() * n);
      if (pts.some(([px, py]) => px === x || py === y || (t(px, x) <= 2 && t(py, y) <= 2))) continue;
      pts.push([x, y]); g[y][x] = GOLD;
    }
  } else {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (r() < 1 / 9) g[y][x] = TILES[Math.floor(r() * TILES.length)];
  }
  return g;
}

function svgOf(g, withGrout) {
  const n = g.length, by = new Map(), S = n * CELL;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = g[y][x]; if (!c) continue; if (!by.has(c)) by.set(c, []);
    by.get(c).push(`<use href='#t' x='${x * CELL + OFF}' y='${y * CELL + OFF}'/>`);
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}'><defs><rect id='t' width='${TILE}' height='${TILE}' rx='${RX}'/></defs>` +
    (withGrout ? `<rect width='${S}' height='${S}' fill='${GROUT}'/>` : "") +
    [...by].map(([c, u]) => `<g fill='${c}'>${u.join("")}</g>`).join("") + `</svg>`;
}
export const mosaicSvgs = () => LAYERS.map((l) => svgOf(layerGrid(l.name), l.name === "base"));
const uri = (svg) => "data:image/svg+xml," + svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23");
export const mosaicDataUris = () => mosaicSvgs().map(uri);

export function mosaicCss(page) {
  const sizes = LAYERS.map((l) => `${l.n * CELL}px ${l.n * CELL}px`).join(",");
  const ink = page && PAGE_INK[page];
  return `/* aria-mosaic:start -- written by scripts/build-mosaic.mjs; do not edit by hand */\n` +
    `:root{--aria-mosaic:${mosaicDataUris().map((u) => `url("${u}")`).join(",")}}\n` +
    `.ariaMosaic{background-color:${GROUT} !important;background-image:var(--aria-mosaic) !important;background-repeat:repeat !important;background-size:${sizes} !important;background-position:0 0 !important}\n` +
    (ink != null ? `${FIELD_SEL}${FIELD_EXTRA[page] || ""}{background-color:${GROUT};background-image:var(--aria-mosaic);background-repeat:repeat;background-size:${sizes};background-position:0 0}\n` + (ink ? ink.trim() + "\n" : "") : "") +
    `/* aria-mosaic:end */`;
}

const RE = /\/\* aria-mosaic:start[\s\S]*?\/\* aria-mosaic:end \*\//;
export function applyTo(text, page) {
  const crlf = text.includes("\r\n");
  const block = crlf ? mosaicCss(page).replace(/\n/g, "\r\n") : mosaicCss(page);
  if (!RE.test(text)) {
    /* A listing page gets its own <style id="aria-mosaic-css"> just before
       </head>, outside the header generators' style blocks. */
    if (!page || PAGE_INK[page] == null || !text.includes("</head>")) throw new Error("aria-mosaic markers missing");
    const eol = crlf ? "\r\n" : "\n";
    return text.replace("</head>", () => `<style id="aria-mosaic-css">${eol}${block}${eol}</style>${eol}</head>`);
  }
  return text.replace(RE, () => block);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const p of PAGES) {
    const f = join(ROOT, p), before = readFileSync(f, "latin1"), after = applyTo(before, p);
    if (before !== after) { stale++; if (!check) writeFileSync(f, after, "latin1"); }
    console.log(`${p}: ${before === after ? "up to date" : check ? "STALE" : "written"}`);
  }
  const u = mosaicDataUris(), v = mosaicSvgs();
  console.log(`mosaic: ${u.reduce((a, x) => a + x.length, 0)} bytes as data URIs (${v.reduce((a, x) => a + x.length, 0)} bytes of SVG; layers ${LAYERS.map((l, i) => l.name + " " + u[i].length).join(", ")})`);
  if (check && stale) process.exit(1);
}
