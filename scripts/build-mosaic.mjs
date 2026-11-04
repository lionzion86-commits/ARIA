#!/usr/bin/env node
/* ============================================================
   BLUE MOSAIC SECTION BACKDROP (#443 c.6632505766, c.6633619772;
   Danny, live call 2026-11-04). PREVIEW.

   Every blue (non-navy) section band gets an icy-blue mosaic instead of
   the flat blue: small rounded tiles (radius 15% of the tile) on a
   #CEDAE8 grout, eight icy blues varied per tile, about 1 in 20 tiles in
   Aria champagne gold. Product cards are not touched; navy stays navy.

   One inline SVG (10x10 tiles of 9px on a 1px grout, 100px square) repeated with
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

export function mosaicGrid() {
  const r = rng(443);
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  /* 5 gold tiles in 100 (1 in 20), each in its own row AND its own
     column, never within two tiles of another (also across the repeat
     edge) -- so the flecks scatter instead of lining up into stripes
     when the tile repeats. */
  const gold = [], tor = (a, b) => Math.min(Math.abs(a - b), N - Math.abs(a - b));
  for (let tries = 0; gold.length < 5 && tries < 5000; tries++) {
    const x = Math.floor(r() * N), y = Math.floor(r() * N);
    if (gold.some(([gx, gy]) => gx === x || gy === y || (tor(gx, x) <= 2 && tor(gy, y) <= 2))) continue;
    gold.push([x, y]); g[y][x] = GOLD;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x]) continue;
    const left = g[y][(x + N - 1) % N], up = g[(y + N - 1) % N][x];
    let c; do { c = TILES[Math.floor(r() * TILES.length)]; } while (c === left || c === up);
    g[y][x] = c;
  }
  return g;
}

export function mosaicSvg() {
  const g = mosaicGrid(), by = new Map();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = g[y][x]; if (!by.has(c)) by.set(c, []);
    by.get(c).push(`<use href='#t' x='${x * CELL + OFF}' y='${y * CELL + OFF}'/>`);
  }
  const S = N * CELL;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}'><defs><rect id='t' width='${TILE}' height='${TILE}' rx='${RX}'/></defs>` +
    `<rect width='${S}' height='${S}' fill='${GROUT}'/>` +
    [...by].map(([c, u]) => `<g fill='${c}'>${u.join("")}</g>`).join("") + `</svg>`;
}

export function mosaicDataUri() {
  return "data:image/svg+xml," + mosaicSvg().replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23");
}

export function mosaicCss() {
  return `/* aria-mosaic:start -- written by scripts/build-mosaic.mjs; do not edit by hand */\n` +
    `:root{--aria-mosaic:url("${mosaicDataUri()}")}\n` +
    `.ariaMosaic{background:${GROUT} var(--aria-mosaic) repeat !important;background-size:${N * CELL}px ${N * CELL}px !important}\n` +
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
  console.log(`mosaic tile: ${mosaicDataUri().length} bytes as a data URI (${mosaicSvg().length} bytes of SVG)`);
  if (check && stale) process.exit(1);
}
