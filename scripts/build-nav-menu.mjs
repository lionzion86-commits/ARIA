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
   Interior, Diseñadores Latinos, Aria Auto, Motos, Ofertas). Key Club is not a tab: its door is the utility bar.
   The columns are computed: a department's real product types
   (typeKeyOf, the department page's own) per audience where the data
   says who it is for, its brands, by count. Nothing with zero products
   is linked; every registry department with products must sit under a
   tab, or this script fails.

     node scripts/build-nav-menu.mjs           rebuild + rewrite pages
     node scripts/build-nav-menu.mjs --check   exit 1 when anything is stale
   Run after scripts/build-department-slices.mjs.

   THE HEADER CREATES NOTHING (#443 c.6621544530, c.6621722209). Every
   tab, column and leaf is the ONE canonical, already-built section page
   for its category, opened with that page's OWN parameters:
     a department     departamento.html?dept=<k>[&b=<marca>][&t=<tipo>][&para=<para quién>]
                      (its own brand pills, its own type view, its own
                      audience switch -- never &nav=1);
     Aria Perfumes    departamento.html?dept=perfumes[&a=<puerta>] (its doors);
     Lencería         ropa-interior.html?ver=type:<rail>|brand:<marca>#mujer|#hombre
                      (its own Explorar todo, opened on that rail);
     Diseñadores      disenadores.html?d=<diseñador>|t=<tipo> (its rooms);
     Motos            motos.html?t=<tipo>;  Aria Auto  aria-auto.html;
     Ofertas          ofertas.html?vista=categoria&cat=<cat> (its own categories).
   A type a fashion department carries that has its own section (shoes,
   bags, sunglasses, jewellery, fragrance, lingerie) is not a leaf of that
   department: the tab lists the section that owns it. Brand and type
   columns are COMPLETE: the menu shows the first leaves and «Ver todas»
   loads the rest from assets/data/nav-brands/<file>.json (the
   department's real inventory), only when tapped.
   ================================================================== */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import "../sale-rule.js";
import { loadDept, typeKeyOf, inAudience, AUD, PERFUME_DOORS, filterList } from "../netlify/functions/_department-core.js";
import { factKey, FACTS_FILE, U_CODES } from "../netlify/functions/_nav-filter-core.js";
import { CAROUSELS } from "./build-home-category-pills.mjs";
import { storeTypeFamily, deptSells } from "./lib/type-family.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MENU_FILE = "assets/data/nav-menu.json";
export const INVENTORY_FILE = "data/nav-menu-inventory.md";
export const NM_PAGES = [
  "index.html", "tienda.html", "marca.html", "departamento.html", "search.html", "producto.html",
  "ofertas.html", "tiendas.html", "categorias.html", "cuenta.html", "keyclub.html",
  "disenadores.html", "motos.html", "ropa-interior.html", "como-funciona.html", "nosotros.html",
  "devoluciones.html", "opinion.html", "restricciones.html", "aria-auto.html", "auto.html", "carrito.html", "terminos.html", "privacidad.html",
];

/* Leaves per column before «Ver todas»; the complete list is a small file
   the flyout fetches on that tap (and the inventory lists every one). */
const MAX_TYPES = 12, MAX_BRANDS = 12;
export const BRANDS_DIR = "assets/data/nav-brands";
/* ONE CANONICAL PAGE PER CATEGORY: the types a fashion department carries
   that are another section's own (type key -> section). */
const OWNED = {
  shoes: ["zapatos", "zapatillas", "sandalias", "tacones", "botas-y-botines", "mocasines-y-pantuflas", "chimpunes", "calzado"],
  purses: ["carteras", "bolso", "bolsos"],
  /* «Lentes» is eyewear, never «Ropa» (it sat in Mujer's and Hombre's
     Ropa columns), and a fashion department's «Accesorios» is the
     accessories section's, not a garment (#443 c.6634907518). */
  sunglasses: ["lentes-de-sol", "lentes"],
  joyas_accesorios: ["joyas", "joyeria", "aretes", "collares-y-dijes", "anillos", "pulseras-y-tobilleras", "charms", "accesorios",
    "billeteras", "correas", "guantes", "bufandas", "corbatas", "llaveros", "relojes", "accesorios-para-el-pelo", "broches-y-pines"],
  perfumes: ["fragancia", "perfumes"],
  lenceria: ["lenceria", "fajas-y-shapewear", "ropa-interior"],
};
const OWNER_OF = new Map(Object.entries(OWNED).flatMap(([o, ks]) => ks.map((k) => [k, o])));
const OWNED_IN = new Set(["women", "men", "kids", "beauty"]);
const ownerOf = (dept, tk, u) => {
  /* A fragrance is Aria Perfumes' wherever it is sold (Diseñador too). */
  if (tk === "fragancia" && dept !== "perfumes") return "perfumes";
  /* His underwear in Tallas Plus is Ropa Interior Hombre's, never «Lencería». */
  if (dept === "curvy" && u === "men" && (tk === "lenceria" || tk === "ropa-interior")) return "interior_hombre";
  if (!OWNED_IN.has(dept)) return "";
  const o = OWNER_OF.get(tk) || "";
  return o === "lenceria" && (u === "men" || dept === "men") ? "interior_hombre" : o;
};
/* An audience earns its own column with this many products. */
const AUD_COL_MIN = 24, AUD_KNOWN_SHARE = 0.6;
const AUD_LABEL = Object.fromEntries(AUD);
/* A brand column (Marcas, Marcas de lencería): its number counts brands, not products. */
export const isBrandCol = (h) => h === "Marcas" || /^Marcas /.test(String(h || ""));

/* ---------- the registry ---------- */
export function deptRegistry(root) {
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
  for (const m of html.matchAll(/\{ key:'([a-z_]+)',\s+label:'([^']+)',\s*keywords/g)) typeNames[m[1]] = m[2];
  return { names, typeNames };
}
/* Pages that are their own section: label, address, product count. */
function pageSections(root) {
  const motos = (t) => countOf(root, `assets/sections/motos/${t}-all-0.json`);
  const women = countOf(root, "ropa-interior-women-feed.json"), men = countOf(root, "ropa-interior-feed.json");
  let latinos = 0, designers = {}, latinoTypes = {};
  try { const j = JSON.parse(readFileSync(join(root, "assets/sections/disenadores/index.json"), "utf8")); latinos = j.total; designers = j.designers || {}; latinoTypes = j.types || {}; } catch { /* none */ }
  const ap = loadDept("auto_parts", [root]), autoN = ap ? ap.list.filter((p) => p.image).length : 0;
  let cats = [], ofertasN = countOf(root, "ofertas-feed-lite.json", "deptTotal");
  try { cats = (JSON.parse(readFileSync(join(root, "assets/ofertas/rails.json"), "utf8")).cats || []).filter((c) => c && c.key && c.n > 0).map((c) => [c.label, "/ofertas.html?vista=categoria&cat=" + c.key, c.n]); } catch { /* none */ }
  return {
    /* Aria Auto has no type parameter of its own: its leaves are its own sections. */
    aria_auto: { name: "Aria Auto", href: "/aria-auto.html", n: autoN, doors: [["Buscar por vehículo", "/aria-auto.html#buscar", autoN], ["Repuestos y accesorios", "/aria-auto.html#autos", autoN]] },
    lenceria: { name: "Lencería", href: "/ropa-interior.html#mujer", n: women },
    interior_hombre: { name: "Ropa Interior Hombre", href: "/ropa-interior.html#hombre", n: men },
    latinos: { name: "Diseñadores Latinos", href: "/disenadores.html", n: latinos, designers, types: latinoTypes, ...latinoNames(root) },
    motos: { name: "Motos", href: "/motos.html", n: motos("all"), types: [["cascos", "Cascos"], ["llantas", "Llantas"], ["repuestos", "Repuestos"], ["ropa_equipo", "Ropa y equipo"], ["accesorios", "Accesorios"]].map(([k, l]) => [l, "/motos.html?t=" + k, motos(k)]) },
    ofertas: { name: "Ofertas", href: "/ofertas.html", n: ofertasN, cats },
  };
}

/* ---------- the tabs: which registry sections each one groups ----------
   cols: "aud" = one column per audience of `dept` (types), else
   "types"; "brands" = the dept's brands; "shoes:<u>" etc. = another
   department's types for one audience; sections = registry keys or
   page sections, in order. A tab's own name is the section Danny named. */
export const TABS = [
  { k: "mujer", label: "Mujer", dept: "women", cols: [["types", "women", "Ropa"], ["types", "shoes", "Zapatos", "women"], ["types", "joyas_accesorios", "Accesorios", "women"], ["brands", "women"]], sections: ["lenceria", "curvy", "latinos", "luxury", "beauty", "perfumes", "purses", "sunglasses", "joyas_accesorios", "clothing"] },
  { k: "hombre", label: "Hombre", dept: "men", cols: [["types", "men", "Ropa"], ["types", "shoes", "Zapatos", "men"], ["types", "joyas_accesorios", "Accesorios", "men"], ["brands", "men"]], sections: ["interior_hombre", "shoes_men", "mens_grooming", "perfumes", "sunglasses", "purses", "joyas_accesorios", "luxury", "gym_rat"] },
  { k: "ninos", label: "Niños", dept: "kids", cols: [["types", "kids", "Ropa"], ["types", "shoes", "Zapatos", "kids"], ["brands", "kids"]], sections: ["toys", "moms", "party"] },
  { k: "zapatos", label: "Zapatos", dept: "shoes", cols: [["aud", "shoes"], ["brands", "shoes"]], sections: ["shoes_women", "shoes_men", "soccer"] },
  { k: "belleza", label: "Belleza", dept: "beauty", cols: [["aud", "beauty"], ["doors", "perfumes", "Aria Perfumes"], ["types", "cabello", "Cabello"], ["brands", "beauty"]], sections: ["beauty", "perfumes", "cabello", "mens_grooming"] },
  { k: "accesorios", label: "Accesorios", dept: "joyas_accesorios", cols: [["aud", "joyas_accesorios"], ["types", "purses", "Carteras"], ["types", "sunglasses", "Lentes de Sol"], ["brands", "joyas_accesorios"]], sections: ["joyas_accesorios", "purses", "sunglasses"] },
  { k: "disenador", label: "Diseñador", dept: "luxury", cols: [["aud", "luxury"], ["latinos", "designers"], ["latinos", "types"], ["brands", "luxury"]], sections: ["luxury", "latinos", "perfumes", "joyas_accesorios"] },
  { k: "deportes", label: "Deportes", dept: "sporting_goods", cols: [["aud", "sporting_goods"], ["brands", "sporting_goods"]], sections: ["gym_rat", "soccer", "tennis", "combat_sports", "surf_skate", "spearfishing", "sporting_goods"] },
  { k: "tallas-plus", label: "Tallas Plus", dept: "curvy", cols: [["aud", "curvy"], ["brands", "curvy"]], sections: ["curvy"] },
  { k: "lenceria", label: "Lencería", page: "lenceria", cols: [["ri", "mujer", "Lencería"], ["ri", "hombre", "Ropa Interior Hombre"], ["ri-brands", "mujer", "Marcas de lencería"]], sections: ["lenceria", "interior_hombre"] },
  { k: "hogar", label: "Hogar", dept: "home_goods", cols: [["types", "home_goods", "Casa Aria"], ["types", "home_decor", "Decoración"], ["brands", "home_goods"]], sections: ["home_goods", "home_decor", "books", "party", "candy_chocolate"] },
  { k: "electronica", label: "Electrónica", dept: "electronics", cols: [["types", "electronics", "Tipos"], ["types", "reacondicionados", "Reacondicionados"], ["brands", "electronics"]], sections: ["electronics", "reacondicionados"] },
  { k: "juguetes", label: "Juguetes", dept: "toys", cols: [["aud", "toys"], ["brands", "toys"]], sections: ["toys", "party", "moms"] },
  { k: "auto-motos", label: "Auto y Motos", page: "motos", cols: [["page", "aria_auto"], ["page", "motos"]], sections: ["auto_parts", "motos"] },
  { k: "ofertas", label: "Ofertas", page: "ofertas", cols: [["sale", "cats", "Ofertas por categoría"]], sections: [] },
];
/* KEY CLUB IS NOT A TAB (#443 c.6623258189): it is the membership, not a
   shopping category. Its door is the gold «Aria Key Club» link in the
   utility bar above the header; the tab row lists categories only. */
/* Where a section with its own page lives (the tab's «Ver todo»). */
const DOOR_OVERRIDE = { auto_parts: "/aria-auto.html" };

const deptHref = (key, q = {}) => "/departamento.html?dept=" + key + Object.entries(q).filter(([, v]) => v).map(([k, v]) => "&" + k + "=" + encodeURIComponent(v)).join("");

/* ---------- Ropa Interior's own rails (ropa-interior.html) ----------
   The page's Mujer and Hombre sections: their type rails (key, title,
   subs) and brand names, read from the page; the counts are what its
   Explorar todo lists for that rail (browsing shows the markdowns). */
function riBrandKey(b) {
  const k = String(b || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (/^psd/.test(k)) return "psd";
  if (/^victoria/.test(k)) return "victoriassecret";
  if (/^warner/.test(k)) return "warners";
  return k;
}
function riPage(root, who) {
  const html = readFileSync(join(root, "ropa-interior.html"), "utf8");
  const name = who === "hombre" ? "HOMBRE" : "MUJER";
  const i = html.indexOf("var " + name + " = new Section(");
  const sec = html.slice(i, html.indexOf("\n  });", i));
  const rails = [...(/TYPE_RAILS: \[([\s\S]*?)\n    \],/.exec(sec) || ["", ""])[1].matchAll(/\{ key:'([a-z_]+)',\s*title:'([^']+)',\s*ty:'[a-z]+',\s*subs:\[([^\]]*)\]/g)]
    .map((m) => ({ key: m[1], title: m[2], subs: m[3].split(",").map((x) => x.trim().replace(/'/g, "")).filter(Boolean) }));
  const labels = Object.fromEntries([...((/BRAND_LABEL: \{([^}]*)\}/.exec(sec) || ["", ""])[1]).matchAll(/([a-z0-9]+):\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[2] || m[3]]));
  let items = [];
  try { items = (JSON.parse(readFileSync(join(root, who === "hombre" ? "ropa-interior-feed.json" : "ropa-interior-women-feed.json"), "utf8")).items || []).filter((p) => p && p.t && p.p > 0); } catch { /* none */ }
  const onSale = (p) => globalThis.AriaSale.discountPct({ price: p.p, originalPrice: p.o }) > 0;
  const hash = who === "hombre" ? "#hombre" : "#mujer";
  const types = rails.map((r) => [r.title, "/ropa-interior.html?ver=type:" + r.key + hash, items.filter((p) => onSale(p) && r.subs.includes(p.sub)).length]);
  const all = new Map();
  for (const p of items) { const k = riBrandKey(p.b); if (!k) continue; const o = all.get(k) || { k, label: labels[k] || String(p.b).trim(), n: 0, sale: 0 }; o.n++; if (onSale(p)) o.sale++; all.set(k, o); }
  /* The page's own Marca list: a maker with 3+ products. */
  const brands = [...all.values()].filter((o) => o.n >= 3).sort((a, b) => (b.sale - a.sale) || (a.k < b.k ? -1 : 1))
    .map((o) => [o.label, "/ropa-interior.html?ver=brand:" + o.k + hash, o.sale]);
  return { types, brands, n: items.filter(onSale).length };
}

/* NO DEAD ENDS (#443 c.6623258189): a column whose one leaf is the tab
   itself is dropped (the flyout's «Ver todo» is that door); a column of
   one other leaf collapses into a plain link (links: [], href = the leaf),
   so the phone never drills into a screen of one row. A tab left with no
   columns is a plain link: its tab navigates, no sheet opens. */
export function noDeadEnds(label, href, cols, notes = []) {
  const out = [];
  for (const c of cols) {
    if (c.links.length !== 1 || c.more) { out.push(c); continue; }
    const [l, h, n] = c.links[0];
    if (h === href) { notes.push(`${label} → ${c.h}: su único enlace es la pestaña misma, columna omitida`); continue; }
    notes.push(`${label} → ${c.h}: un solo enlace (${l}), se muestra como enlace directo`);
    out.push({ h: l, href: h, n, links: [] });
  }
  return out;
}

export function buildMenu(root = ROOT) {
  const reg = deptRegistry(root);
  const pages = pageSections(root);
  const cache = new Map();
  /* Only products with a photo are cards (no image, no card): the counts are what the page shows. */
  const dept = (k) => { if (!cache.has(k)) { const d = loadDept(k, [root]); cache.set(k, d ? { ...d, list: d.list.filter((p) => p.image) } : null); } return cache.get(k); };
  const size = (k) => (dept(k) ? dept(k).list.length : 0);
  const notes = [];
  const misfiled = [];
  const riCache = {};
  /* The products a department link renders (its own filter), as keys; null for any other page. */
  const setOf = (h) => {
    const u = new URL(h || "/", "http://x");
    if (u.pathname !== "/departamento.html") return null;
    const d = dept(u.searchParams.get("dept") || "");
    if (!d) return null;
    const q = (k) => u.searchParams.get(k) || "";
    return new Set(filterList(d.list, { b: q("b"), t: q("t"), a: q("a"), u: q("para") }).map((p) => factKey(p.retailer, p.title)));
  };
  const partitions = (whole, hrefs) => {
    const all = setOf(whole);
    if (!all || !hrefs.length) return false;
    const seen = new Set();
    for (const h of hrefs) {
      const s = setOf(h);
      if (!s) return false;
      for (const k of s) { if (seen.has(k) || !all.has(k)) return false; seen.add(k); }
    }
    return seen.size === all.size;
  };
  const sectionName = (s) => (pages[s] && pages[s].name) || (reg[s] && reg[s].name) || s;

  /* moved: the types another section owns, [label, section, n]. */
  const typeLinks = (k, u, moved = null) => {
    const d = dept(k);
    if (!d) return [];
    const n = new Map(), away = new Map();
    for (const p of d.list) {
      if (u && !inAudience(p, u)) continue;
      const t = typeKeyOf(p);
      if (t.k === "otros") continue;
      /* A type the department does not sell is never its leaf (the
         classifier keeps such products out; this is the backstop). */
      const fam = storeTypeFamily(t.label);
      if (fam && !deptSells(k, fam)) { misfiled.push(`${k} → ${t.label}`); continue; }
      const own = ownerOf(k, t.k, u);
      if (own) { const o = away.get(t.k) || [t.label, own, 0]; o[2]++; away.set(t.k, o); continue; }
      const o = n.get(t.k) || [t.label, deptHref(k, { t: t.k, para: u }), 0];
      o[2]++; n.set(t.k, o);
    }
    if (moved) moved.push(...[...away.values()].sort((a, b) => b[2] - a[2]));
    /* The count is what the page's own type view finds (its filter also
       reads the garment kind a store's type leaves out). */
    for (const [tk, o] of n) o[2] = filterList(d.list, { t: tk, u, dept: k }).length;
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
      .map((o) => { const label = [...o.spell.entries()].sort((a, b) => b[1] - a[1])[0][0]; return [label, deptHref(k, { b: label, para: u }), o.n]; });
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
  const files = {};
  for (const spec of TABS) {
    const cols = [], inv = [];
    /* file: the complete list's name, when the column is longer than the flyout shows. */
    const push = (h, href, links, n, file = "", moved = null, all = false) => {
      inv.push({ h, n, links, moved: (moved || []).map(([l, o, c]) => { const r = sectionRef(o); return [l, r ? r.name + " · `" + r.href + "`" : o, c]; }) });
      if (moved && moved.length) notes.push(`${spec.label} → ${h}: ${moved.map(([l, o, c]) => l + " (" + num(c) + ") en " + sectionName(o)).join(", ")}: cada uno vive en su propia sección`);
      const kept = links.filter((l) => l[2] > 0);
      if (!kept.length) { notes.push(`${spec.label} → ${h}: sin productos, columna omitida`); return; }
      const cap = all ? Infinity : isBrandCol(h) ? MAX_BRANDS : MAX_TYPES;
      /* A Marcas column's number is its distinct brands: the list plus its «Ver todas» remainder. */
      const col = { h, href, n: isBrandCol(h) ? kept.length : n, links: kept.slice(0, cap) };
      if (kept.length > cap && file) { col.all = kept.length; col.more = "/" + BRANDS_DIR + "/" + file + ".json"; files[file] = kept; }
      cols.push(col);
    };
    for (const c of spec.cols) {
      const [kind, k] = c;
      if (kind === "aud") {
        const auds = audiences(k);
        if (auds.length) for (const [u, n] of auds) { const mv = []; push(AUD_LABEL[u], deptHref(k, { para: u }), typeLinks(k, u, mv), n, k + "-tipos-" + u, mv); }
        else { const mv = []; push("Tipos", deptHref(k), typeLinks(k, "", mv), size(k), k + "-tipos", mv); }
      } else if (kind === "types") {
        const u = c[3] || "";
        const mv = [];
        /* CABELLO IS NEVER EMPTY (#443 c.6634907518, Danny's mom): Belleza's
           Cabello and Electrónica's Reacondicionados are columns of their
           own department's real types (Keratina y alisados, Mascarillas ...).
           Another department's column lists only what the tab sells: a
           refurbished stroller («Coche») is not an Electrónica leaf. */
        const tabFams = spec.dept && spec.dept !== k ? new Set(["", ...typeLinks(spec.dept, "").map((l) => storeTypeFamily(l[0]))]) : null;
        const links = typeLinks(k, u, mv).filter((l) => !tabFams || tabFams.has(storeTypeFamily(l[0])));
        push(c[2] || reg[k].name, deptHref(k, { para: u }), links, links.reduce((s, l) => s + l[2], 0) || size(k), k + "-tipos" + (u ? "-" + u : ""), mv);
      } else if (kind === "brands") {
        push("Marcas", deptHref(k), brandLinks(k, c[2] || ""), size(k), k + "-marcas");
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
        /* Ropa Interior's own rails and makers: its Explorar todo opens on them. */
        const r = riCache[k] || (riCache[k] = riPage(root, k));
        push(c[2], "/ropa-interior.html#" + k, kind === "ri" ? r.types : r.brands, r.n, "ropa-interior-" + (kind === "ri" ? "tipos-" : "marcas-") + k);
      } else if (kind === "page") {
        const p = pages[k];
        if (k === "motos") push(p.name, p.href, p.types, p.n);
        else if (k === "aria_auto") push(p.name, p.href, p.doors, p.n);
        else push(p.name, p.href, [["Ver todo", p.href, p.n]], p.n);
      } else if (kind === "sale") {
        /* Ofertas' own categories (its «Por categoría» view, the 12 of
           assets/ofertas/rails.json), each on ofertas.html?vista=categoria&cat=<k>,
           then the whole page as one more entry -- never a lone pool. */
        const p = pages.ofertas;
        push(c[2], "/ofertas.html?vista=categoria", p.cats.concat(p.cats.length ? [["Ver todas las ofertas", p.href, p.n]] : []), p.n, "", null, true);
      }
    }
    let href = "", n = 0;
    if (spec.dept) { href = DOOR_OVERRIDE[spec.dept] || deptHref(spec.dept); n = size(spec.dept); }
    else { href = pages[spec.page].href; n = pages[spec.page].n; }
    /* NO «SECCIONES» BLOCK (#443 c.6635728704, c.6635797675, c.6635799980):
       a tab lists its own columns only (Ropa / Zapatos / Accesorios /
       Marcas ...) and nothing replaces the old end block. spec.sections
       still names the registry departments a tab groups (the placement
       check below); each of them keeps its own door outside the menu. */
    for (const s of spec.sections) {
      const r = sectionRef(s);
      if (!r) notes.push(`${spec.label}: sección desconocida «${s}»`);
    }
    const shown = noDeadEnds(spec.label, href, cols, notes);
    /* NAV COUNT TRUTH (#443 c.6635540929, c.6635573276). A Marcas row
       counts brands (set in push). Every other column shows a number only
       when the columns are parts of the tab's total: each column's number
       is the product set its own link renders, and those sets partition
       the set «Ver todo» renders (each product in exactly one). When they
       overlap (a unisex product is Mujer and Hombre; Zapatos para Mujer is
       another department than Mujer), no column shows a product number. */
    const parts = partitions(href, shown.filter((c) => !isBrandCol(c.h)).map((c) => c.href || ""));
    if (!parts) for (const c of shown) if (!isBrandCol(c.h)) delete c.n;
    if (!parts && shown.some((c) => !isBrandCol(c.h))) notes.push(`${spec.label}: sus columnas se superponen (no suman ${num(n)}), no muestran número de productos`);
    for (const e of inv) { const c = shown.find((x) => x.h === e.h); e.n = c ? c.n : undefined; e.brands = isBrandCol(e.h); }
    tabs.push({ k: spec.k, label: spec.label, href, n, cols: shown });
    full.push({ spec, href, n, inv });
  }

  /* Every registry department with products sits under a tab. */
  const placed = new Set(TABS.flatMap((t) => [t.dept, ...t.sections, ...t.cols.map((c) => c[1])]).filter(Boolean));
  const unplaced = Object.keys(reg).filter((k) => !reg[k].door && size(k) > 0 && !placed.has(k));
  const homeCarousels = CAROUSELS.map((c) => c.title);
  return { menu: { v: 1, tabs }, full, notes, unplaced, homeCarousels, reg, files, misfiled: [...new Set(misfiled)] };
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

/* (A brand leaf carries the brand's own spelling, &b=Jordan: the page's
   brand filter reads it case-blind and its scope bar shows it as is.) */

/* ---------- the views the header used to invent, and where they go now ----------
   departamento.html's first script (before anything renders) and
   netlify.toml redirect them; nordstrom-nav-tests.mjs pins both. */
export const BLOCKED = [
  ["departamento.html?dept=<k>&nav=1", "departamento.html?dept=<k> (el departamento, tal cual)"],
  ["…&nav=1&u=<women|men|kids>", "…&para=<women|men|kids> (su selector Para quién)"],
  ["…&nav=1&t=<tipo>", "…&t=<tipo> (su propia vista de tipo)"],
  ["…&nav=1&b=<marca>[|<marca>…]", "…&b=<la primera marca> (sus píldoras de marca)"],
  ["…&nav=1&o=1", "…&ver=ofertas (su propio carrusel de Ofertas)"],
  ["…&nav=1&r=<tienda>", "…&tienda=<tienda> (sus chips de tienda)"],
  ["…&nav=1&w=<palabras>", "…&q=<palabras> (su buscador)"],
  ["…&s= · &z= · &p= · &sort= (estilo, talla, precio y orden de la barra)", "se quitan: el departamento no tiene esas vistas"],
  ["departamento.html?dept=perfumes&t=fragancia", "departamento.html?dept=perfumes (Aria Perfumes entera: todo es fragancia)"],
  ["departamento.html?dept=perfumes&t=cuidado-corporal", "departamento.html?dept=perfumes&a=cuidado (su puerta de cuidado)"],
  ["ropa-interior.html?ft=…&fb=… · ofertas.html?fb=… (la barra de filtros)", "ya no existen: la página abre en su portada; el menú usa ropa-interior.html?ver=type:…|brand:… y ofertas.html?vista=categoria&cat=…"],
];

/* ---------- the inventory, for Danny ---------- */
const num = (n) => Number(n || 0).toLocaleString("es-PE");
export function inventoryMarkdown(b) {
  const L = [];
  L.push("# Menú del encabezado: inventario completo");
  L.push("");
  L.push("Generado por `node scripts/build-nav-menu.mjs` desde el registro de secciones del sitio (DEPTS de departamento.html y el bloque de categorías del inicio). Cada número es la cantidad real de productos con ese tipo o marca; nada con 0 productos tiene enlace. El menú muestra hasta " + MAX_TYPES + " tipos y " + MAX_BRANDS + " marcas por columna y «Ver todas» abre la lista completa (`" + BRANDS_DIR + "/`); aquí está todo.");
  L.push("");
  L.push("## La regla: el encabezado no crea nada (#443 c.6621544530, c.6621722209)");
  L.push("");
  L.push("Cada pestaña, columna y enlace abre la página canónica ya construida de esa categoría, con los parámetros propios de esa página. Ninguna URL del menú lleva `nav=1`.");
  L.push("");
  L.push("| Entrada del menú | Página canónica a la que llega |");
  L.push("|---|---|");
  L.push("| Pestaña o «Ver todo» de un departamento | `departamento.html?dept=<k>` (o su página propia: Aria Auto, Lencería, Motos, Ofertas) |");
  L.push("| Columna por audiencia (Mujer / Hombre / Niños) | `departamento.html?dept=<k>&para=<audiencia>` (su selector Para quién) |");
  L.push("| Tipo | `departamento.html?dept=<k>&t=<tipo>[&para=<audiencia>]` (su vista de tipo) |");
  L.push("| Marca | `departamento.html?dept=<k>&b=<marca>[&para=<audiencia>]` (sus píldoras de marca: solo los productos de esa marca en ese departamento) |");
  L.push("| Aria Perfumes y sus puertas | `departamento.html?dept=perfumes[&a=<puerta>]` |");
  L.push("| Lencería / Ropa Interior Hombre | `ropa-interior.html?ver=type:<riel>#mujer` · `?ver=brand:<marca>#hombre` (su Explorar todo) |");
  L.push("| Diseñadores Latinos | `disenadores.html?d=<diseñador>` · `?t=<tipo>` |");
  L.push("| Motos | `motos.html?t=<tipo>` |");
  L.push("| Aria Auto | `aria-auto.html` · `#buscar` · `#autos` (no tiene parámetro de tipo) |");
  L.push("| Ofertas | `ofertas.html?vista=categoria&cat=<categoría>` (su vista Por categoría: cada categoría de la página, con su número de ofertas) y «Ver todas las ofertas» `ofertas.html` |");
  L.push("| Key Club | no es una pestaña (no es una categoría de compra): su puerta es el enlace dorado «Aria Key Club» de la barra superior |");
  L.push("| Un tipo que tiene su propia sección (zapatos, carteras, lentes de sol, joyas, fragancias, lencería) dentro de Mujer / Hombre / Niños / Belleza | no es un enlace del departamento: vive en su propia sección (Mujer y Hombre la abren desde su columna Zapatos o Accesorios) |");
  L.push("");
  L.push("## Sin callejones sin salida (#443 c.6623258189)");
  L.push("");
  L.push("- Una pestaña sin columnas es un enlace: abre su página, no una hoja vacía.");
  L.push("- Una columna cuyo único enlace es la pestaña misma no se muestra (el «Ver todo» del menú ya es esa puerta); una columna de un solo enlace es ese enlace, sin pantalla intermedia.");
  L.push("- No hay bloque «Secciones» en ninguna pestaña (#443 c.6635728704): cada pestaña lista solo sus columnas.");
  L.push("");
  L.push("## Los números (#443 c.6635540929)");
  L.push("");
  L.push("- «Marcas» cuenta marcas distintas de esa pestaña (las de la lista más las de «Ver todas las marcas»), no productos.");
  L.push("- Cada número es lo que muestra la página de su enlace. Una columna muestra su número de productos solo si las columnas de la pestaña se reparten su total (cada producto en una sola); si se superponen, no lo muestran.");
  L.push("- En el teléfono, una pestaña de una sola columna abre directamente su lista (Ofertas: sus categorías).");
  L.push("");
  L.push("## URLs bloqueadas o redirigidas");
  L.push("");
  L.push("El primer script de departamento.html (antes de pintar nada) y netlify.toml (301) las llevan a la página canónica:");
  L.push("");
  for (const [a, b2] of BLOCKED) L.push(`- \`${a}\` → ${b2}`);
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
      L.push(`### ${c.h}${c.n ? " (" + num(c.n) + (c.brands ? " marcas" : "") + ")" : ""}`);
      L.push("");
      if (!c.links.length) L.push("- (sin productos)");
      for (const [l, h, n] of c.links) L.push(`- ${l}: ${num(n)} · \`${h}\``);
      if (c.moved && c.moved.length) { L.push(""); L.push("Viven en su propia sección (no son enlaces de esta columna):"); for (const [l, o, n] of c.moved) L.push(`- ${l}: ${num(n)} → ${o}`); }
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
  /* A tab with no columns is a plain link (data-nm-direct): no sheet. */
  return `<nav class="nm${dark ? " nm-dark" : ""}" data-nm aria-label="Categorías"><div class="nm-in">`
    + menu.tabs.map((t) => t.cols.length ? `<a class="nm-tab" href="${t.href}" data-nm-tab="${t.k}" aria-expanded="false" aria-haspopup="true">${t.label}</a>` : `<a class="nm-tab" href="${t.href}" data-nm-tab="${t.k}" data-nm-direct>${t.label}</a>`).join("")
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
  const lists = Object.entries(b.files).map(([f, l]) => [BRANDS_DIR + "/" + f + ".json", JSON.stringify(l) + "\n"]);
  const listDir = join(ROOT, BRANDS_DIR);
  const extra = existsSync(listDir) ? readdirSync(listDir).map((f) => BRANDS_DIR + "/" + f).filter((f) => !lists.some(([g]) => g === f)) : [];
  const staleData = [[MENU_FILE, json], [INVENTORY_FILE, md], [FACTS_FILE, facts], ...lists].filter(([f, s]) => old(f) !== s).map(([f]) => f).concat(extra);
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
    mkdirSync(listDir, { recursive: true });
    for (const f of extra) rmSync(join(ROOT, f));
    for (const [f, s] of lists) writeFileSync(join(ROOT, f), s);
    console.log(`${MENU_FILE}: ${json.length} bytes, ${b.menu.tabs.length} tabs; pages rewritten: ${stalePages.length}`);
    for (const n of b.notes) console.log("  note: " + n);
  }
}
