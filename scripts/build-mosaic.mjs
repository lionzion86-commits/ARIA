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
export const PAGES = ["index.html", "ofertas.html"];
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

export function mosaicCss() {
  const sizes = LAYERS.map((l) => `${l.n * CELL}px ${l.n * CELL}px`).join(",");
  return `/* aria-mosaic:start -- written by scripts/build-mosaic.mjs; do not edit by hand */\n` +
    `:root{--aria-mosaic:${mosaicDataUris().map((u) => `url("${u}")`).join(",")}}\n` +
    `.ariaMosaic{background-color:${GROUT} !important;background-image:var(--aria-mosaic) !important;background-repeat:repeat !important;background-size:${sizes} !important;background-position:0 0 !important}\n` +
    `/* aria-mosaic:end */`;
}

const RE = /\/\* aria-mosaic:start[\s\S]*?\/\* aria-mosaic:end \*\//;
export function applyTo(text) {
  const crlf = text.includes("\r\n");
  const block = crlf ? mosaicCss().replace(/\n/g, "\r\n") : mosaicCss();
  if (!RE.test(text)) throw new Error("aria-mosaic markers missing");
  return text.replace(RE, () => block);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const p of PAGES) {
    const f = join(ROOT, p), before = readFileSync(f, "latin1"), after = applyTo(before);
    if (before !== after) { stale++; if (!check) writeFileSync(f, after, "latin1"); }
    console.log(`${p}: ${before === after ? "up to date" : check ? "STALE" : "written"}`);
  }
  const u = mosaicDataUris(), v = mosaicSvgs();
  console.log(`mosaic: ${u.reduce((a, x) => a + x.length, 0)} bytes as data URIs (${v.reduce((a, x) => a + x.length, 0)} bytes of SVG; layers ${LAYERS.map((l, i) => l.name + " " + u[i].length).join(", ")})`);
  if (check && stale) process.exit(1);
}
