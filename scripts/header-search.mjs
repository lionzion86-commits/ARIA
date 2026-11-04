#!/usr/bin/env node
/* ==================================================================
   THE HEADER SEARCH, ONE SOURCE FOR EVERY PAGE (Danny, 2026-11-02).

   "Put a search bar up there in the header, by the little cart. If I
   scroll down I'll still always have a search bar available."

   Every page with the site header carries the same block:
     - HS_CSS, inlined as <style id="hs-css"> so the pill's space is
       reserved at first paint (no layout shift, no request);
     - hsMarkup(), the pill + form, between the wordmark and the cart (or
       the header's right-hand group on pages without one);
     - assets/js/header-search.js (defer), the behaviour. index.html
       inlines the same file as <script id="hs-js"> in its <head>, so the
       box works before the app bundle arrives (#417).
   Phone: a pill (magnifier + «Buscar», icon only where the row is
   tight) opens a full-width field over the header row. 768px and up: a
   real field in the row (index.html keeps the pill from 1024px, where
   its desktop nav fills the row).

   After changing HS_CSS or header-search.js:
     node scripts/header-search.mjs          rewrites every page's copy
                                             (the search AND the cart below)
     node scripts/header-search.mjs --check  exits 1 if any copy is stale
   scripts/test/header-search-tests.mjs runs the --check.
   ================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const HS_PLACEHOLDER = "Buscar productos, marcas o tiendas";

export const HS_PAGES = [
  "index.html", "tienda.html", "marca.html", "departamento.html", "search.html", "producto.html",
  "ofertas.html", "tiendas.html", "categorias.html", "cuenta.html", "keyclub.html", "checkout.html",
  "disenadores.html", "motos.html", "ropa-interior.html", "como-funciona.html", "nosotros.html",
  "devoluciones.html", "opinion.html", "restricciones.html",
];

export const HS_CSS = [
  ".hs{--hs-fg:#0A1F44;--hs-mute:#5B6475;--hs-bg:#F3F5F9;--hs-line:#D9E0EB;--hs-go:#0A1F44;--hs-gofg:#fff;--hs-sheet:#fff;--hs-ring:rgba(36,86,160,.22);display:flex;align-items:center;flex:1 1 0;min-width:40px;max-width:440px;margin:0 0 0 auto;font-family:inherit}",
  ".hs-dark{--hs-fg:#F4F6FB;--hs-mute:rgba(236,241,250,.8);--hs-bg:rgba(255,255,255,.1);--hs-line:rgba(255,255,255,.26);--hs-go:#F4C463;--hs-gofg:#0A1F44;--hs-sheet:#0A1F44;--hs-ring:rgba(244,196,99,.35)}",
  ".hs-row{position:relative}",
  ".hs-row > .nav-links{flex:0 0 auto}",
  ".hs-stick{position:sticky;top:0;z-index:30}",
  ".hs-stick-u{top:-30px}",
  ".hs-util{height:30px;padding-top:0;padding-bottom:0;align-items:center;flex-wrap:nowrap;white-space:nowrap;overflow-x:auto;scrollbar-width:none;box-sizing:border-box}",
  ".hs-util::-webkit-scrollbar{display:none}",
  "@media (max-width:479.98px){.hs-util{justify-content:flex-start;gap:14px;padding-left:14px;padding-right:14px;font-size:11.5px}}",
  "html{scroll-padding-top:76px}",
  ".hs-pill{flex:1 1 auto;min-width:40px;max-width:100%;height:40px;margin:0;padding:0 10px;border:1px solid var(--hs-line);border-radius:999px;background:var(--hs-bg);color:var(--hs-mute);font-family:inherit;font-size:14px;font-weight:600;line-height:1;cursor:pointer;overflow:hidden;container-type:inline-size;box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
  ".hs-pi{display:flex;align-items:center;gap:7px;height:100%;white-space:nowrap}",
  ".hs svg{flex:0 0 auto;display:block}",
  "@container (max-width:84px){.hs-pi{justify-content:center}.hs-lbl{display:none}}",
  ".hs-form{display:none;align-items:center;gap:6px;margin:0;min-width:0;box-sizing:border-box}",
  ".hs-box{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;height:40px;padding:0 3px 0 12px;border:1px solid var(--hs-line);border-radius:999px;background:var(--hs-bg);color:var(--hs-mute);box-sizing:border-box}",
  ".hs-box:focus-within{border-color:var(--hs-go);box-shadow:0 0 0 3px var(--hs-ring)}",
  ".hs-in{flex:1 1 auto;min-width:0;width:100%;height:100%;margin:0;padding:0;border:0;outline:0;background:transparent;color:var(--hs-fg);font-family:inherit;font-size:16px;font-weight:500;line-height:1.2;box-shadow:none;-webkit-appearance:none;appearance:none}",
  ".hs-in::placeholder{color:var(--hs-mute);opacity:1}",
  ".hs-in::-webkit-search-cancel-button,.hs-in::-webkit-search-decoration{-webkit-appearance:none;display:none}",
  ".hs-go,.hs-x{flex:0 0 auto;display:grid;place-items:center;margin:0;padding:0;border:0;border-radius:999px;cursor:pointer;-webkit-tap-highlight-color:transparent}",
  ".hs-go{width:34px;height:34px;background:var(--hs-go);color:var(--hs-gofg)}",
  ".hs-x{width:40px;height:40px;background:transparent;color:var(--hs-fg)}",
  ".hs-pill:focus-visible,.hs-go:focus-visible,.hs-x:focus-visible{outline:2px solid var(--hs-go);outline-offset:2px}",
  ".hs-open .hs-form{display:flex;position:absolute;inset:0;z-index:6;padding:0 4px 0 12px;background:var(--hs-sheet)}",
  ".hs-open .hs-box{height:44px}",
  "@media (min-width:768px){.hs:not(.hs-lgpill){flex-basis:260px}.hs:not(.hs-lgpill) .hs-pill,.hs:not(.hs-lgpill) .hs-x{display:none}.hs:not(.hs-lgpill) .hs-form{display:flex;flex:1 1 auto;position:static;padding:0;background:none}}",
  "@media (min-width:768px) and (max-width:1023.98px){.hs-lgpill{flex-basis:220px}.hs-lgpill .hs-pill,.hs-lgpill .hs-x{display:none}.hs-lgpill .hs-form{display:flex;flex:1 1 auto;position:static;padding:0;background:none}}",
  "@media (min-width:1024px){.hs-lgpill{flex:0 0 40px;margin-left:0}}",
].join("\n");

const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
const GO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
const X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* mods: extra classes on .hs (hs-dark, hs-lgpill); sheet: the open
   field's backdrop where the header is not plain white or navy. */
export function hsMarkup({ mods = "", sheet = "" } = {}) {
  const cls = "hs" + (mods ? " " + mods : "");
  const style = sheet ? ` style="--hs-sheet:${sheet}"` : "";
  return `<div class="${cls}" data-hs${style}>`
    + `<button type="button" class="hs-pill" aria-label="${HS_PLACEHOLDER}" aria-expanded="false" aria-controls="hsForm"><span class="hs-pi">${ICON}<span class="hs-lbl">Buscar</span></span></button>`
    + `<form class="hs-form" id="hsForm" role="search" action="/search.html" method="get">`
    + `<span class="hs-box">${ICON}<input class="hs-in" id="hsInput" type="search" name="q" placeholder="${HS_PLACEHOLDER}" aria-label="${HS_PLACEHOLDER}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" maxlength="120">`
    + `<button type="submit" class="hs-go" aria-label="Buscar">${GO}</button></span>`
    + `<button type="button" class="hs-x" aria-label="Cerrar búsqueda">${X}</button>`
    + `</form></div>`;
}

export const HS_JS = () => readFileSync(join(ROOT, "assets/js/header-search.js"), "utf8");

/* ==================================================================
   THE HEADER CART, ONE SOURCE FOR EVERY PAGE (#443 c.6619105467 and
   c.6619111897, Danny's live check: the cart showed in the header on
   the homepage only). The standalone pages (#327/#328, 2026-10-05) were
   built without one, so the moment a shopper left the homepage the cart
   was gone. Every page in HC_PAGES now carries, from this file:
     - HC_CSS, inlined as <style id="hc-css"> right after the search's;
     - hcMarkup(), the cart link, as the LAST item of the header row
       (.hs-row), so it sits top-right, between <!-- hc:start/end -->;
     - assets/js/header-cart.js (defer), which paints the live count
       from localStorage 'aria_cart_v1' (no network, no catalogue).
   The link opens the homepage's cart view, /?carrito=1, the one real
   cart (carrito.html redirects there too). index.html keeps its own
   cart button, which the app bundle drives (openCart, #cartCountBadge).
   A page without the markers gets them at the end of its header row on
   the next run; --check fails while any page lacks them.
   ================================================================== */
export const HC_HREF = "/?carrito=1";
export const HC_PAGES = HS_PAGES.filter((f) => f !== "index.html");
export const HC_SCRIPT = '<script src="/assets/js/header-cart.js" defer></script>';

export const HC_CSS = [
  ".hc{--hc-fg:#0A1F44;--hc-dot:#2456A0;--hc-dotfg:#fff;position:relative;flex:0 0 auto;display:grid;place-items:center;width:40px;height:40px;margin:0;padding:0;border-radius:10px;color:var(--hc-fg);text-decoration:none;box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
  ".hc-dark{--hc-fg:#F4F6FB;--hc-dot:#F4C463;--hc-dotfg:#0A1F44}",
  ".hc:hover{text-decoration:none}",
  ".hc svg{display:block;flex:0 0 auto}",
  ".hc-n{position:absolute;top:1px;right:-1px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:var(--hc-dot);color:var(--hc-dotfg);font-family:inherit;font-size:10.5px;font-weight:800;line-height:17px;text-align:center;box-sizing:border-box}",
  ".hc-n[hidden]{display:none}",
  ".hc:focus-visible{outline:2px solid var(--hc-fg);outline-offset:1px}",
].join("\n");

const CART = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

export function hcMarkup({ dark = false } = {}) {
  return `<a class="hc${dark ? " hc-dark" : ""}" href="${HC_HREF}" aria-label="Carrito" data-hc>${CART}<span class="hc-n" hidden>0</span></a>`;
}

/* Index just past the closing tag of the element that opens at `at`. */
function closeOf(src, at) {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;
  re.lastIndex = at;
  let depth = 0;
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
  for (let m; (m = re.exec(src));) {
    if (!m[2]) continue;   // a comment
    if (m[2].toLowerCase() === "svg" && !m[1]) { const e = src.indexOf("</svg>", m.index); re.lastIndex = e + 6; if (depth === 0) return e + 6; continue; }
    if (VOID.test(m[2]) || m[3]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index;   // start of the closing tag
  }
  return -1;
}

function syncCart(src, eol) {
  const dark = /<div class="hs[^"]*\bhs-dark\b/.test(src);
  const block = `<!-- hc:start -->${hcMarkup({ dark })}<!-- hc:end -->`;
  let out;
  if (src.includes("<!-- hc:start -->")) {
    out = src.replace(/<!-- hc:start -->[\s\S]*?<!-- hc:end -->/, () => block);
  } else {
    const row = src.search(/<[a-z]+ class="[^"]*\bhs-row\b[^"]*"[^>]*>/);
    if (row < 0) throw new Error("no .hs-row header row");
    const end = closeOf(src, row);
    if (end < 0) throw new Error("the header row does not close");
    const lineStart = src.lastIndexOf("\n", end) + 1, before = src.slice(lineStart, end);
    const indent = before.match(/^[ \t]*/)[0];
    out = /^[ \t]*$/.test(before)
      ? src.slice(0, end) + "  " + block + eol + indent + src.slice(end)
      : src.slice(0, end) + eol + indent + "  " + block + eol + indent + src.slice(end);
  }
  const css = `<style id="hc-css">${eol}${HC_CSS.split("\n").join(eol)}${eol}</style>`;
  if (/<style id="hc-css">[\s\S]*?<\/style>/.test(out)) out = out.replace(/<style id="hc-css">[\s\S]*?<\/style>/, () => css);
  else out = out.replace(/(<style id="hs-css">[\s\S]*?<\/style>)/, (m) => m + eol + css);
  if (!out.includes(HC_SCRIPT)) out = out.replace('<script src="/assets/js/header-search.js" defer></script>', (m) => m + eol + HC_SCRIPT);
  return out;
}

/* Rewrites (or checks) the inline copies; returns the stale pages. */
export function syncPages({ write = false } = {}) {
  const stale = [];
  for (const f of HS_PAGES) {
    const p = join(ROOT, f);
    const src = readFileSync(p, "utf8");
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    let out = src.replace(/<style id="hs-css">[\s\S]*?<\/style>/, () => `<style id="hs-css">${eol}${HS_CSS.split("\n").join(eol)}${eol}</style>`);
    if (f === "index.html") {
      out = out.replace(/<script id="hs-js">[\s\S]*?<\/script>/, () => `<script id="hs-js">${eol}${HS_JS().trim().split(/\r?\n/).join(eol)}${eol}</script>`);
    }
    if (HC_PAGES.includes(f)) {
      try { out = syncCart(out, eol); } catch (e) { throw new Error(f + ": " + e.message); }
    }
    if (out !== src) { stale.push(f); if (write) writeFileSync(p, out); }
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const stale = syncPages({ write: !check });
  if (check && stale.length) { console.error("stale header search or cart in: " + stale.join(", ") + " -- run: node scripts/header-search.mjs"); process.exit(1); }
  console.log(check ? "header search: every page is current" : (stale.length ? "rewrote: " + stale.join(", ") : "nothing to rewrite"));
}
