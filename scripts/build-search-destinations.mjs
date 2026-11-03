#!/usr/bin/env node
/* ============================================================
   SEARCH DESTINATIONS -> assets/search/destinations.json
   (#443 c.6569512697, c.6569515583, c.6569529913 -- Danny: every search
   lands on a STORE page, a BRAND page or a CATEGORY page; nothing else.)

   The search function's router (netlify/functions/_search-destinations.js)
   may only send a shopper to a surface that is really built. This file
   is that list, computed from the surfaces themselves:

     stores  the storefront set search.html already opens
             (scripts/build-store-doors.mjs: tienda.html's registry with
             products, minus off-sale stores), with each store's label;
     brands  every brand with a static marca.html head
             (assets/sections/marca/<key>.json): its label and count;
             brandAliases: its other spellings' keys -> its key;
     depts   departamento.html's DEPTS (name; aliases left out), each with
             its type lenses (assets/sections/departamento/<k>/lens-tipo-*):
             slug -> label, the t= values the department endpoint answers;
     types   each department's TYPE rails (head.json: Celulares, Shorts,
             Keratina y alisados...) -- rail key -> [title, count], the
             ver= values departamento.html opens as a type page. Only a
             rail with products is listed: a search can never land on an
             empty type (#443 c.6579541628).

     node scripts/build-search-destinations.mjs           write it
     node scripts/build-search-destinations.mjs --check   exit 1 if stale

   Run it after store, brand or department slices are rebuilt.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { storeDoors } from "./build-store-doors.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = "assets/search/destinations.json";
/* A department rail that is a product type (not Ofertas, a store or a brand). */
export const TYPE_RAIL_RX = /^((tipo|pasillo|aisle|casa):.+|chromebooks|consolas|reacondicionados|estudio)$/;

export function buildDestinations(root = ROOT) {
  const tienda = readFileSync(join(root, "tienda.html"), "utf8");
  const registry = JSON.parse(/\nvar STORES = (\{.*\});\r?\n/.exec(tienda)[1]);
  const { keys } = storeDoors(root);
  const stores = {};
  for (const k of keys) stores[k] = (registry[k] && registry[k].label) || k;

  const brands = {};
  const mdir = join(root, "assets/sections/marca");
  for (const f of readdirSync(mdir).filter((n) => n.endsWith(".json")).sort()) {
    try {
      const j = JSON.parse(readFileSync(join(mdir, f), "utf8"));
      const key = f.slice(0, -5);
      if (!j || !j.label || !(Number(j.count) > 0)) continue;
      brands[key] = [String(j.label), Number(j.count)];
    } catch { /* not a head */ }
  }

  /* A brand's other spellings ("Herschel Supply", "Vuori, Inc.") name
     the same page (assets/sections/marca/_fn/items.json spellings). */
  const brandAliases = {};
  try {
    const sp = JSON.parse(readFileSync(join(mdir, "_fn/items.json"), "utf8")).spellings || {};
    for (const a of Object.keys(sp).sort()) if (brands[sp[a]] && !brands[a]) brandAliases[a] = sp[a];
  } catch { /* no spellings */ }

  const dhtml = readFileSync(join(root, "departamento.html"), "utf8");
  const block = /var DEPTS = \{([\s\S]*?)\n  \};/.exec(dhtml)[1];
  const depts = {};
  const rx = /^\s*([a-z_]+):\s*\{name:'([^']+)'([^\n]*)\}/gm;
  let m;
  while ((m = rx.exec(block))) {
    if (/alias:true/.test(m[3])) continue;
    const key = m[1], lenses = {};
    const ddir = join(root, "assets/sections/departamento", key);
    if (existsSync(ddir)) {
      for (const f of readdirSync(ddir).filter((n) => /^lens-tipo-.+\.json$/.test(n)).sort()) {
        try { lenses[f.slice(10, -5)] = JSON.parse(readFileSync(join(ddir, f), "utf8")).label; } catch { /* skip */ }
      }
    }
    depts[key] = Object.keys(lenses).length ? [m[2], lenses] : [m[2]];
  }
  /* The type rails a search may open (departamento.html?dept=X&ver=<key>):
     product types only -- never Ofertas, a store, a brand or «Más productos». */
  const types = {};
  for (const key of Object.keys(depts)) {
    const hf = join(root, "assets/sections/departamento", key, "head.json");
    if (!existsSync(hf)) continue;
    let head;
    try { head = JSON.parse(readFileSync(hf, "utf8")); } catch { continue; }
    const out = {};
    for (const r of head.rails || []) {
      const k = String(r.k || "");
      if (!TYPE_RAIL_RX.test(k) || /:(otros|mas)$/.test(k) || !(Number(r.count) > 0)) continue;
      out[k] = [String(r.title), Number(r.count)];
    }
    if (Object.keys(out).length) types[key] = out;
  }
  return { v: 1, stores, brands, brandAliases, depts, types };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = JSON.stringify(buildDestinations()) + "\n";
  const file = join(ROOT, OUT);
  const old = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (out !== old) { console.error(OUT + " is stale: run node scripts/build-search-destinations.mjs"); process.exit(1); }
    console.log(OUT + " current");
  } else {
    writeFileSync(file, out);
    const d = JSON.parse(out);
    console.log(`${OUT}: ${Object.keys(d.stores).length} stores, ${Object.keys(d.brands).length} brands, ${Object.keys(d.depts).length} departments`);
  }
}
