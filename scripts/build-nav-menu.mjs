#!/usr/bin/env node
/* ==================================================================
   THE HEADER MEGA-MENU, ONE SOURCE FOR EVERY PAGE (#443 c.6616347095,
   refinement c.6616389410, amendment c.6616425433 -- Danny: copy
   Nordstrom's navigation PATTERN, not its look).

   A row of tabs under every page's header. A tab opens a flyout OVER
   the page (hover with a small delay, or a click / tap); clicking off
   it or Esc closes it, nothing navigates. Only a leaf -- a type, a
   brand, a section -- opens a page.

   WHAT THIS WRITES
     assets/data/nav-menu.json      every tab's columns and leaves, with
                                    counts; fetched by assets/js/nav-menu.js
                                    on the first hover / tap, never with
                                    the page
     data/nav-menu-inventory.md     the full inventory, for Danny to read
                                    what is in and what is missing
     <every page>                   the tab row (between <!-- nm:start -->
                                    and <!-- nm:end -->, before </header>),
                                    <style id="nm-css"> and the script tag

   WHERE THE DATA COMES FROM. The tabs group the site's own section
   registry -- departamento.html's DEPTS (every department) and the
   homepage category block (scripts/build-home-category-pills.mjs
   CAROUSELS) -- plus the pages that are their own sections (Ropa
   Interior, Diseñadores Latinos, Aria Auto, Motos, Ofertas, Key Club).
   The columns are computed: a department's real product types
   (typeKeyOf, the department page's own) per audience where the data
   says who it is for, its brands, by count. Nothing with zero products
   is linked; every registry department with products must sit under a
   tab, or this script fails.

     node scripts/build-nav-menu.mjs           rebuild + rewrite pages
     node scripts/build-nav-menu.mjs --check   exit 1 when anything is stale
   Run after scripts/build-department-slices.mjs.
   ================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { loadDept, typeKeyOf, inAudience, AUD, PERFUME_DOORS } from "../netlify/functions/_department-core.js";
import { riRows, factKey, FACTS_FILE, U_CODES } from "../netlify/functions/_nav-filter-core.js";
import { CAROUSELS } from "./build-home-category-pills.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MENU_FILE = "assets/data/nav-menu.json";
export const INVENTORY_FILE = "data/nav-menu-inventory.md";
export const NM_PAGES = [
  "index.html", "tienda.html", "marca.html", "departamento.html", "search.html", "producto.html",
  "ofertas.html", "tiendas.html", "categorias.html", "cuenta.html", "keyclub.html",
  "disenadores.html", "motos.html", "ropa-interior.html", "como-funciona.html", "nosotros.html",
  "devoluciones.html", "opinion.html", "restricciones.html", "aria-auto.html", "auto.html", "carrito.html", "terminos.html", "privacidad.html",
];

/* Leaves per column, before «Ver todo». The inventory lists every one. */
const MAX_TYPES = 12, MAX_BRANDS = 12;
/* An audience earns its own column with this many products. */
const AUD_COL_MIN = 24, AUD_KNOWN_SHARE = 0.6;
const AUD_LABEL = Object.fromEntries(AUD);

/* ---------- the registry ---------- */
function deptRegistry(root) {
  const html = readFileSync(join(root, "departamento.html"), "utf8");
  const block = /var DEPTS = \{([\s\S]*?)\n  \};/.exec(html)[1];
  const out = {};
  for (const m of block.matchAll(/^\s*([a-z_]+):\s*\{name:(?:'([^']+)'|"([^"]+)")([^\n]*)\}/gm)) {
    if (/alias:true/.test(m[4])) continue;
    const href = /href:'([^']+)'/.exec(m[4]);
    out[m[1]] = { name: m[2] || m[3], door: href ? "/" + href[1] : "" };
  }
  return out;
}
const countOf = (root, rel, field = "count") => { try { return Number(JSON.parse(readFileSync(join(root, rel), "utf8"))[field]) || 0; } catch { return 0; } };

/* disenadores.html's own names for its designers and types. */
function latinoNames(root) {
  const html = readFileSync(join(root, "disenadores.html"), "utf8");
  const names = {}, typeNames = {};
  for (const m of html.matchAll(/\{ key:'([a-z]+)',[^\n]*?label:'([^']+)'/g)) names[m[1]] = m[2];
  for (const m of html.matchAll(/\{ key:'([a-z_]+)',\s+label:'([^']+)', keywords/g)) typeNames[m[1]] = m[2];
  return { names, typeNames };
}
/* Pages that are their own section: label, address, product count. */
function pageSections(root) {
  const motos = (t) => countOf(root, `assets/sections/motos/${t}-all-0.json`);
  const women = countOf(root, "ropa-interior-women-feed.json"), men = countOf(root, "ropa-interior-feed.json");
  let latinos = 0, designers = {}, latinoTypes = {};
  try { const j = JSON.parse(readFileSync(join(root, "assets/sections/disenadores/index.json"), "utf8")); latinos = j.total; designers = j.designers || {}; latinoTypes = j.types || {}; } catch { /* none */ }
  return {
    lenceria: { name: "Lencería", href: "/ropa-interior.html#mujer", n: women },
    interior_hombre: { name: "Ropa Interior Hombre", href: "/ropa-interior.html#hombre", n: men },
    latinos: { name: "Diseñadores Latinos", href: "/disenadores.html", n: latinos, designers, types: latinoTypes, ...latinoNames(root) },
    motos: { name: "Motos", href: "/motos.html", n: motos("all"), types: [["cascos", "Cascos"], ["llantas", "Llantas"], ["repuestos", "Repuestos"], ["ropa_equipo", "Ropa y equipo"], ["accesorios", "Accesorios"]].map(([k, l]) => [l, "/motos.html?t=" + k, motos(k)]) },
    ofertas: { name: "Ofertas", href: "/ofertas.html", n: countOf(root, "ofertas-feed-lite.json", "deptTotal") },
  };
}

/* ---------- the tabs: which registry sections each one groups ----------
   cols: "aud" = one column per audience of `dept` (types), else
   "types"; "brands" = the dept's brands; "shoes:<u>" etc. = another
   department's types for one audience; sections = registry keys or
   page sections, in order. A tab's own name is the section Danny named. */
export const TABS = [
  { k: "mujer", label: "Mujer", dept: "women", cols: [["types", "women", "Ropa"], ["types", "shoes", "Zapatos", "women"], ["types", "joyas_accesorios", "Accesorios", "women"], ["brands", "women"]], sections: ["lenceria", "curvy", "latinos", "luxury", "beauty", "perfumes", "clothing"] },
  { k: "hombre", label: "Hombre", dept: "men", cols: [["types", "men", "Ropa"], ["types", "shoes", "Zapatos", "men"], ["types", "joyas_accesorios", "Accesorios", "men"], ["brands", "men"]], sections: ["interior_hombre", "shoes_men", "mens_grooming", "luxury", "gym_rat"] },
  { k: "ninos", label: "Niños", dept: "kids", cols: [["types", "kids", "Ropa"], ["types", "shoes", "Zapatos", "kids"], ["brands", "kids"]], sections: ["toys", "moms", "party"] },
  { k: "zapatos", label: "Zapatos", dept: "shoes", cols: [["aud", "shoes"], ["brands", "shoes"]], sections: ["shoes_women", "shoes_men", "soccer"] },
  { k: "belleza", label: "Belleza", dept: "beauty", cols: [["aud", "beauty"], ["doors", "perfumes", "Aria Perfumes"], ["brands", "beauty"]], sections: ["beauty", "perfumes", "cabello", "mens_grooming"] },
  { k: "accesorios", label: "Accesorios", dept: "joyas_accesorios", cols: [["aud", "joyas_accesorios"], ["types", "purses", "Carteras"], ["types", "sunglasses", "Lentes de Sol"], ["brands", "joyas_accesorios"]], sections: ["joyas_accesorios", "purses", "sunglasses"] },
  { k: "disenador", label: "Diseñador", dept: "luxury", cols: [["aud", "luxury"], ["latinos", "designers"], ["latinos", "types"], ["brands", "luxury"]], sections: ["luxury", "latinos", "joyas_accesorios"] },
  { k: "deportes", label: "Deportes", dept: "sporting_goods", cols: [["aud", "sporting_goods"], ["brands", "sporting_goods"]], sections: ["gym_rat", "soccer", "tennis", "combat_sports", "surf_skate", "spearfishing", "sporting_goods"] },
  { k: "tallas-plus", label: "Tallas Plus", dept: "curvy", cols: [["aud", "curvy"], ["brands", "curvy"]], sections: ["curvy"] },
  { k: "lenceria", label: "Lencería", page: "lenceria", cols: [["ri", "mujer", "Lencería"], ["ri", "hombre", "Ropa Interior Hombre"], ["ri-brands", "mujer", "Marcas de lencería"]], sections: ["lenceria", "interior_hombre"] },
  { k: "hogar", label: "Hogar", dept: "home_goods", cols: [["types", "home_goods", "Casa Aria"], ["types", "home_decor", "Decoración"], ["brands", "home_goods"]], sections: ["home_goods", "home_decor", "books", "party", "candy_chocolate"] },
  { k: "electronica", label: "Electrónica", dept: "electronics", cols: [["types", "electronics", "Tipos"], ["brands", "electronics"]], sections: ["electronics", "reacondicionados"] },
  { k: "juguetes", label: "Juguetes", dept: "toys", cols: [["aud", "toys"], ["brands", "toys"]], sections: ["toys", "party", "moms"] },
  { k: "auto-motos", label: "Auto y Motos", page: "motos", cols: [["types", "auto_parts", "Aria Auto"], ["page", "motos"]], sections: ["auto_parts", "motos"] },
  { k: "ofertas", label: "Ofertas", page: "ofertas", cols: [["sale", "women", "Mujer"], ["sale", "men", "Hombre"], ["sale", "kids", "Niños"], ["sale", "shoes", "Zapatos"], ["sale", "beauty", "Belleza"], ["sale", "electronics", "Electrónica"]], sections: ["ofertas"] },
  { k: "key-club", label: "Key Club", page: "keyclub", cols: [], sections: [] },
];
/* Where a section with its own page lives (the tab's «Ver todo»). */
const DOOR_OVERRIDE = { auto_parts: "/aria-auto.html" };

const deptHref = (key, q = {}) => "/departamento.html?dept=" + key + Object.entries(q).filter(([, v]) => v).map(([k, v]) => "&" + k + "=" + encodeURIComponent(v)).join("");
const navHref = (key, q = {}) => deptHref(key, { nav: "1", ...q });

export function buildMenu(root = ROOT) {
  const reg = deptRegistry(root);
  const pages = pageSections(root);
  const cache = new Map();
  /* Only products with a photo are cards (no image, no card): the counts are what the page shows. */
  const dept = (k) => { if (!cache.has(k)) { const d = loadDept(k, [root]); cache.set(k, d ? { ...d, list: d.list.filter((p) => p.image) } : null); } return cache.get(k); };
  const size = (k) => (dept(k) ? dept(k).list.length : 0);
  const notes = [];
  const riCache = {};

  const typeLinks = (k, u) => {
    const d = dept(k);
    if (!d) return [];
    const n = new Map();
    for (const p of d.list) {
      if (u && !inAudience(p, u)) continue;
      const t = typeKeyOf(p);
      if (t.k === "otros") continue;
      const o = n.get(t.k) || [t.label, navHref(k, { u, t: t.k }), 0];
      o[2]++; n.set(t.k, o);
    }
    return [...n.values()].sort((a, b) => (b[2] - a[2]) || (a[0] < b[0] ? -1 : 1));
  };
  const brandLinks = (k, u) => {
    const d = dept(k);
    if (!d) return [];
    const n = new Map();
    for (const p of d.list) {
      if (u && !inAudience(p, u)) continue;
      const label = String(p.brand || "").trim(), key = label.toLowerCase();
      if (!key) continue;
      const o = n.get(key) || { key, spell: new Map(), n: 0 };
      o.n++; o.spell.set(label, (o.spell.get(label) || 0) + 1); n.set(key, o);
    }
    return [...n.values()].sort((a, b) => (b.n - a.n) || (a.key < b.key ? -1 : 1))
      .map((o) => [[...o.spell.entries()].sort((a, b) => b[1] - a[1])[0][0], navHref(k, { u, b: o.key }), o.n]);
  };
  const audiences = (k) => {
    const d = dept(k);
    if (!d || !d.list.length) return [];
    const known = d.list.filter((p) => p.u).length / d.list.length;
    if (known < AUD_KNOWN_SHARE) return [];
    return AUD.map(([u]) => [u, d.list.filter((p) => inAudience(p, u)).length]).filter(([, n]) => n >= AUD_COL_MIN);
  };
  const sectionRef = (s) => {
    if (pages[s]) return { name: pages[s].name, href: pages[s].href, n: pages[s].n };
    if (reg[s]) {
      const n = reg[s].door ? (s === "ropa_interior" ? pages.interior_hombre.n : s === "ropa_interior_mujer" ? pages.lenceria.n : 0) : size(s);
      return { name: reg[s].name, href: DOOR_OVERRIDE[s] || reg[s].door || deptHref(s), n };
    }
    return null;
  };

  const tabs = [];
  const full = [];
  for (const spec of TABS) {
    const cols = [], inv = [];
    const push = (h, href, links, n) => {
      inv.push({ h, n, links });
      const kept = links.filter((l) => l[2] > 0);
      if (!kept.length) { notes.push(`${spec.label} → ${h}: sin productos, columna omitida`); return; }
      cols.push({ h, href, n, links: kept.slice(0, h === "Marcas" ? MAX_BRANDS : MAX_TYPES) });
    };
    for (const c of spec.cols) {
      const [kind, k] = c;
      if (kind === "aud") {
        const auds = audiences(k);
        if (auds.length) for (const [u, n] of auds) push(AUD_LABEL[u], navHref(k, { u }), typeLinks(k, u), n);
        else push("Tipos", navHref(k), typeLinks(k, ""), size(k));
      } else if (kind === "types") {
        const u = c[3] || "";
        const links = typeLinks(k, u);
        push(c[2] || reg[k].name, navHref(k, { u }), links, links.reduce((s, l) => s + l[2], 0) || size(k));
      } else if (kind === "brands") {
        push("Marcas", navHref(k), brandLinks(k, c[2] || ""), size(k));
      } else if (kind === "doors") {
        /* Aria Perfumes' own doors (the catalogue's departments, row field a). */
        const d = dept(k);
        const links = PERFUME_DOORS.map(([a, label]) => [label, deptHref(k, { a }), d ? d.list.filter((p) => p.a === a).length : 0]);
        push(c[2], deptHref(k), links, size(k));
      } else if (kind === "latinos") {
        const p = pages.latinos;
        if (k === "designers") push("Diseñadores Latinos", p.href, Object.entries(p.designers).sort((a, b) => b[1] - a[1]).map(([d, n]) => [p.names[d] || d, "/disenadores.html?d=" + d, n]), p.n);
        else push("Latinos por tipo", p.href, Object.entries(p.types).sort((a, b) => b[1] - a[1]).map(([t, n]) => [p.typeNames[t] || t, "/disenadores.html?t=" + t, n]), p.n);
      } else if (kind === "ri" || kind === "ri-brands") {
        /* Ropa Interior's own kinds and brands; the page's bar opens on them. */
        const rows = riCache[k] || (riCache[k] = riRows(k, [root]));
        const n = new Map();
        for (const r of rows) {
          const key = kind === "ri" ? r.t.k : String(r.brand || "").trim().toLowerCase();
          if (!key || key === "otros") continue;
          const label = kind === "ri" ? r.t.label : String(r.brand || "").trim();
          const o = n.get(key) || [label, "/ropa-interior.html?" + (kind === "ri" ? "ft=" : "fb=") + encodeURIComponent(key) + "#" + k, 0];
          o[2]++; n.set(key, o);
        }
        push(c[2], "/ropa-interior.html#" + k, [...n.values()].sort((a, b) => b[2] - a[2]), rows.length);
      } else if (kind === "page") {
        const p = pages[k];
        if (k === "motos") push(p.name, p.href, p.types, p.n);
        else push(p.name, p.href, [["Ver todo", p.href, p.n]], p.n);
      } else if (kind === "sale") {
        const d = dept(k);
        const n = d ? d.list.filter((p) => p.salePct > 0).length : 0;
        const links = d ? typeLinks(k, "").map(([l, , ]) => l) : [];
        const byType = new Map();
        if (d) for (const p of d.list) { if (!(p.salePct > 0)) continue; const t = typeKeyOf(p); if (t.k === "otros") continue; const o = byType.get(t.k) || [t.label, navHref(k, { t: t.k, o: "1" }), 0]; o[2]++; byType.set(t.k, o); }
        push(c[2], navHref(k, { o: "1" }), [...byType.values()].sort((a, b) => b[2] - a[2]), n);
        void links;
      }
    }
    const secs = [];
    for (const s of spec.sections) {
      const r = sectionRef(s);
      if (!r) { notes.push(`${spec.label}: sección desconocida «${s}»`); continue; }
      if (!(r.n > 0)) { notes.push(`${spec.label} → ${r.name}: 0 productos, sin enlace`); continue; }
      secs.push([r.name, r.href, r.n]);
    }
    if (secs.length) { cols.push({ h: "Secciones", links: secs }); inv.push({ h: "Secciones", links: secs }); }
    let href = "", n = 0;
    if (spec.dept) { href = DOOR_OVERRIDE[spec.dept] || deptHref(spec.dept); n = size(spec.dept); }
    else if (spec.page === "keyclub") { href = "/keyclub.html"; n = 0; }
    else { href = pages[spec.page].href; n = pages[spec.page].n; }
    if (spec.page === "keyclub") notes.push("Key Club → es la página de membresía (beneficios), no un listado de productos: la pestaña abre su página; sin columnas de productos");
    tabs.push({ k: spec.k, label: spec.label, href, n, cols });
    full.push({ spec, href, n, inv });
  }

  /* Every registry department with products sits under a tab. */
  const placed = new Set(TABS.flatMap((t) => [t.dept, ...t.sections, ...t.cols.map((c) => c[1])]).filter(Boolean));
  const unplaced = Object.keys(reg).filter((k) => !reg[k].door && size(k) > 0 && !placed.has(k));
  const homeCarousels = CAROUSELS.map((c) => c.title);
  return { menu: { v: 1, tabs }, full, notes, unplaced, homeCarousels, reg };
}

/* ---------- the facts of every department product, for the other listings ----------
   A store page, a brand page, Ofertas and a search draw products the
   departments already classify. facts.json carries, per store + title
   (a short hash, factKey), the department's type, audience and the
   store's size run -- so the filter bar reads the same facts on every
   page. Server-side only (netlify/functions/_nav-filter-core.js). */
export function buildFacts(root = ROOT, keys = null) {
  const reg = keys || Object.keys(deptRegistry(root)).filter((k) => !deptRegistry(root)[k].door);
  const types = [], tAt = new Map(), runs = [[]], rAt = new Map([["", 0]]), out = {};
  for (const k of reg) {
    const d = loadDept(k, [root]);
    if (!d) continue;
    let sz = null;
    try { sz = JSON.parse(readFileSync(join(root, "assets/sections/departamento/_fn", k + ".sizes.json"), "utf8")); } catch { /* none */ }
    d.list.forEach((p, i) => {
      const key = factKey(p.retailer, p.title);
      const t = typeKeyOf(p);
      const run = sz ? (sz.runs[sz.rows[i]] || []) : [];
      const had = out[key];
      if (had && (had[0] >= 0 || t.k === "otros") && (had[2] || !run.length) && (had[1] || !p.u)) return;
      let ti = -1;
      if (t.k !== "otros") { if (!tAt.has(t.k)) { tAt.set(t.k, types.length); types.push([t.k, t.label]); } ti = tAt.get(t.k); }
      const rk = run.join("\u0001");
      if (!rAt.has(rk)) { rAt.set(rk, runs.length); runs.push(run); }
      const u = Math.max(0, U_CODES.indexOf(p.u || ""));
      out[key] = had ? [had[0] >= 0 ? had[0] : ti, had[1] || u, had[2] || rAt.get(rk)] : [ti, u, rAt.get(rk)];
    });
  }
  return { v: 1, types, runs, keys: out };
}

/* ---------- the inventory, for Danny ---------- */
const num = (n) => Number(n || 0).toLocaleString("es-PE");
export function inventoryMarkdown(b) {
  const L = [];
  L.push("# Menú del encabezado: inventario completo");
  L.push("");
  L.push("Generado por `node scripts/build-nav-menu.mjs` desde el registro de secciones del sitio (DEPTS de departamento.html y el bloque de categorías del inicio). Cada número es la cantidad real de productos con ese tipo o marca; nada con 0 productos tiene enlace. El menú muestra hasta " + MAX_TYPES + " tipos y " + MAX_BRANDS + " marcas por columna; aquí está todo.");
  L.push("");
  L.push("| Pestaña | Columnas | Productos |");
  L.push("|---|---|---|");
  for (const f of b.full) L.push(`| ${f.spec.label} | ${f.inv.map((c) => c.h).join(" · ") || "(sin columnas)"} | ${num(f.n)} |`);
  L.push("");
  for (const f of b.full) {
    L.push(`## ${f.spec.label}`);
    L.push("");
    L.push(`Abre: \`${f.href}\` (${num(f.n)} productos)`);
    L.push("");
    for (const c of f.inv) {
      L.push(`### ${c.h}${c.n ? " (" + num(c.n) + ")" : ""}`);
      L.push("");
      if (!c.links.length) L.push("- (sin productos)");
      for (const [l, h, n] of c.links) L.push(`- ${l}: ${num(n)} · \`${h}\``);
      L.push("");
    }
  }
  L.push("## Qué falta o no se pudo llenar");
  L.push("");
  if (!b.notes.length && !b.unplaced.length) L.push("- Nada.");
  for (const n of b.notes) L.push("- " + n);
  for (const k of b.unplaced) L.push(`- ${b.reg[k].name} (\`${k}\`) tiene productos y no está en ninguna pestaña`);
  L.push("");
  L.push("## Carruseles del inicio y dónde quedan");
  L.push("");
  L.push(b.homeCarousels.map((t) => "- " + t).join("\n"));
  L.push("");
  return L.join("\n");
}

/* ---------- the page block ---------- */
export const NM_CSS = [
  ".nm{--nm-fg:#0A1F44;--nm-mute:#5B6475;--nm-line:#E4E6EC;--nm-bg:#fff;--nm-hi:#B8860B;position:relative;background:var(--nm-bg);border-top:1px solid var(--nm-line);font-family:inherit}",
  ".nm-dark{--nm-fg:#F4F6FB;--nm-mute:rgba(236,241,250,.8);--nm-line:rgba(255,255,255,.16);--nm-bg:#0A1F44;--nm-hi:#F4C463}",
  ".nm-in{max-width:1240px;margin:0 auto;padding:0 12px;display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}",
  ".nm-in::-webkit-scrollbar{display:none}",
  ".nm-tab{flex:0 0 auto;display:inline-flex;align-items:center;height:40px;padding:0 10px;color:var(--nm-fg);font-size:13.5px;font-weight:700;line-height:1;text-decoration:none;white-space:nowrap;border-bottom:2px solid transparent;-webkit-tap-highlight-color:transparent}",
  ".nm-tab[aria-expanded=\"true\"]{border-bottom-color:var(--nm-hi)}",
  ".nm-tab:focus-visible{outline:2px solid var(--nm-hi);outline-offset:-2px}",
  "@media (min-width:1024px){.nm-in{justify-content:center}.nm-tab{padding:0 9px;font-size:13px}}",
].join("\n");

export function nmMarkup(menu, { dark = false } = {}) {
  return `<nav class="nm${dark ? " nm-dark" : ""}" data-nm aria-label="Categorías"><div class="nm-in">`
    + menu.tabs.map((t) => `<a class="nm-tab" href="${t.href}" data-nm-tab="${t.k}" aria-expanded="false" aria-haspopup="true">${t.label}</a>`).join("")
    + `</div></nav>`;
}

export function syncPages(menu, { write = false, root = ROOT } = {}) {
  const stale = [];
  for (const f of NM_PAGES) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    let out = src;
    const head = out.slice(0, out.indexOf("</header>"));
    const hdr = head.slice(head.lastIndexOf("<header"));
    /* A navy header (its search pill is .hs-dark) gets the navy tab row. */
    const dark = /class="hs [^"]*\bhs-dark\b/.test(hdr);
    const block = `<!-- nm:start -->${eol}${nmMarkup(menu, { dark })}${eol}<!-- nm:end -->`;
    if (/<!-- nm:start -->[\s\S]*?<!-- nm:end -->/.test(out)) out = out.replace(/<!-- nm:start -->[\s\S]*?<!-- nm:end -->/, () => block);
    else out = out.replace("</header>", () => block + eol + "</header>");
    const css = `<style id="nm-css">${eol}${NM_CSS.split("\n").join(eol)}${eol}</style>`;
    const tag = `<script src="/assets/js/nav-menu.js" defer></script>`;
    if (/<style id="nm-css">[\s\S]*?<\/style>/.test(out)) out = out.replace(/<style id="nm-css">[\s\S]*?<\/style>/, () => css);
    else out = out.replace("</head>", () => css + eol + tag + eol + "</head>");
    if (out !== src) { stale.push(f); if (write) writeFileSync(p, out); }
  }
  return stale;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const b = buildMenu();
  if (b.unplaced.length) { console.error("sections with products under no tab: " + b.unplaced.join(", ")); process.exit(1); }
  const json = JSON.stringify(b.menu) + "\n", md = inventoryMarkdown(b);
  const old = (f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : "");
  const facts = JSON.stringify(buildFacts()) + "\n";
  const staleData = [[MENU_FILE, json], [INVENTORY_FILE, md], [FACTS_FILE, facts]].filter(([f, s]) => old(f) !== s).map(([f]) => f);
  const stalePages = syncPages(b.menu, { write: !check });
  if (check) {
    const all = staleData.concat(stalePages);
    if (all.length) { console.error("stale nav menu in: " + all.join(", ") + " -- run: node scripts/build-nav-menu.mjs"); process.exit(1); }
    console.log("nav menu: current");
  } else {
    writeFileSync(join(ROOT, MENU_FILE), json);
    writeFileSync(join(ROOT, INVENTORY_FILE), md);
    mkdirSync(join(ROOT, "assets/sections/nav/_fn"), { recursive: true });
    writeFileSync(join(ROOT, FACTS_FILE), facts);
    console.log(`${MENU_FILE}: ${json.length} bytes, ${b.menu.tabs.length} tabs; pages rewritten: ${stalePages.length}`);
    for (const n of b.notes) console.log("  note: " + n);
  }
}
