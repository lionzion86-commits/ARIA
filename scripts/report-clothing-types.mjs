#!/usr/bin/env node
/* ============================================================
   THE CLOTHING-TYPE SWEEP (#443 c.6585323562).

   Danny: "There should not be a ropa in a perfume store." Macy's files
   its Beauty and Home pages APPAREL, so perfume, lip balm and towels
   read as Ropa in every department's type lenses. build-department-
   slices.mjs now gives a product typed as clothing the type of what its
   own name says it is (trueType). This report lists, site-wide:

     retyped   products a store typed as clothing that are not clothing,
               and the type they now carry -- by store and kind
     kept      products still in a clothing type although the classifier
               reads another family: garments whose names it misreads
               ("RC Essential Tank", "Puzzle Dress") and the loosely-read
               families (deportes, bebe, repuestos), for review

     node scripts/report-clothing-types.mjs
   writes reports/clothing-type-sweep-<date>.json and .md
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllItems, productClass, isClothingType, DEPT_RULES, deptItems } from "./build-department-slices.mjs";
import { typeKeyOf } from "../netlify/functions/_department-core.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATE = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
const CLOTHING_FAMILIES = new Set(["ropa", "trajes_bano"]);

const all = loadAllItems(ROOT);
const deptsOf = new Map();
for (const k of Object.keys(DEPT_RULES)) for (const p of deptItems(all, k)) {
  const key = p.retailer + "::" + p.title;
  if (!deptsOf.has(key)) deptsOf.set(key, []);
  deptsOf.get(key).push(k);
}
const group = (rows) => {
  const by = new Map();
  for (const r of rows) {
    const k = r.store + " | " + r.kind;
    if (!by.has(k)) by.set(k, { store: r.store, kind: r.kind, n: 0, from: new Set(), to: new Set(), samples: [] });
    const g = by.get(k);
    g.n++; g.from.add(r.storeTypeLabel); if (r.nowLabel) g.to.add(r.nowLabel);
    if (g.samples.length < 5) g.samples.push(r.title);
  }
  return [...by.values()].sort((a, b) => b.n - a.n).map((g) => ({ ...g, from: [...g.from], to: [...g.to] }));
};
const retyped = [], kept = [];
for (const p of all) {
  if (p.storeType !== undefined) {
    retyped.push({ store: p.retailer, kind: productClass(p), title: p.title, storeTypeLabel: typeKeyOf({ type: p.storeType }).label, nowLabel: typeKeyOf(p).label, depts: deptsOf.get(p.retailer + "::" + p.title) || [] });
    continue;
  }
  if (!isClothingType(p.type)) continue;
  const fam = productClass(p);
  if (CLOTHING_FAMILIES.has(fam)) continue;
  const depts = deptsOf.get(p.retailer + "::" + p.title) || [];
  if (!depts.length) continue;
  kept.push({ store: p.retailer, kind: fam, title: p.title, storeTypeLabel: typeKeyOf(p).label, depts });
}
const byKind = (rows) => Object.fromEntries([...rows.reduce((m, r) => m.set(r.kind, (m.get(r.kind) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
const out = {
  generatedAt: DATE, issue: "#443 c.6585323562",
  retyped: { total: retyped.length, byKind: byKind(retyped), groups: group(retyped) },
  kept: { total: kept.length, byKind: byKind(kept), groups: group(kept) },
};
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, `reports/clothing-type-sweep-${DATE}.json`), JSON.stringify(out, null, 1) + "\n");
const md = [`# Clothing-type sweep, ${DATE} (#443 c.6585323562)`, "",
  "Products a store typed as clothing (APPAREL, Ropa, TOP, Pantalón...) whose own name says they are something else. The department generator (`scripts/build-department-slices.mjs`, `trueType`) now gives them the type of what they are, so no Ropa / Moda / Lencería type lens, filter or rail holds them.", "",
  `## Re-typed: ${retyped.length}`, "", "| Kind | Count |", "|---|---|", ...Object.entries(out.retyped.byKind).map(([k, n]) => `| ${k} | ${n} |`), "",
  "| Store | Kind | Count | Was | Now | Samples |", "|---|---|---|---|---|---|",
  ...out.retyped.groups.map((g) => `| ${g.store} | ${g.kind} | ${g.n} | ${g.from.join(", ")} | ${g.to.join(", ") || "Más productos"} | ${g.samples.slice(0, 3).join("; ").replace(/\|/g, "/")} |`), "",
  `## Kept in a clothing type, for review: ${kept.length}`, "",
  "The classifier reads these as another family, but the name carries a garment noun (they are clothes it misreads), or the family is one the head noun reads loosely (deportes, bebe, repuestos). They keep their clothing type.", "",
  "| Store | Read as | Count | Type | Samples |", "|---|---|---|---|---|",
  ...out.kept.groups.map((g) => `| ${g.store} | ${g.kind} | ${g.n} | ${g.from.join(", ")} | ${g.samples.slice(0, 3).join("; ").replace(/\|/g, "/")} |`), ""];
writeFileSync(join(ROOT, `reports/clothing-type-sweep-${DATE}.md`), md.join("\n"));
console.log(`re-typed ${retyped.length}`, out.retyped.byKind);
console.log(`kept ${kept.length}`, out.kept.byKind);
