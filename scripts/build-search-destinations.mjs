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
     depts   departamento.html's DEPTS (name; aliases left out), each with
             its type lenses (assets/sections/departamento/<k>/lens-tipo-*):
             slug -> label, the t= values the department endpoint answers.

     node scripts/build-search-destinations.mjs           write it
     node scripts/build-search-destinations.mjs --check   exit 1 if stale

   Run it after store, brand or department slices are rebuilt.
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { storeDoors } from "./build-store-doors.mjs";
import { loadDept, typeKeyOf } from "../netlify/functions/_department-core.js";

/* Type pages a department answers with t= (its Por tipo axis) that the
   router may land on, beside the lens-tipo files: Electrónica's Drones
   (#443 c.6579603095). Listed only while the department has them. */
export const TYPE_PAGES = { electronics: ["drones"] };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = "assets/search/destinations.json";

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
    for (const t of TYPE_PAGES[key] || []) {
      const d = loadDept(key, [root]);
      const hit = d && d.list.map(typeKeyOf).find((x) => x.k === t);
      if (hit) lenses[t] = hit.label;
    }
    depts[key] = Object.keys(lenses).length ? [m[2], lenses] : [m[2]];
  }
  return { v: 1, stores, brands, depts };
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
