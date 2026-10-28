#!/usr/bin/env node
/* ============================================================
   scripts/data/reroute-refiles.json -- THE BUCKET RE-FILES (#443 re-route
   audit, layer B: c.6460976249, start order c.6461228058).

   The pullers file whole stores under one bucket (JW PEI's dresses under
   "purses", the surf shops' necklaces, sunglasses and fins under
   "clothing"), and a bucket department lists whatever is filed in it.
   Lucifer's map names each such item and the department it belongs in.

   A re-file is applied only when the site's own classifier (product-type.js,
   by the item's name) agrees with the audit about what the item IS, and
   the destination department then admits it -- re-route, never remove.
   Everything else is held and listed; uncertain.json is never read.

   The re-files live here, not in the catalogues, so a re-pull does not
   undo them; build-department-slices.mjs applies them (retailer + name +
   the bucket it was filed in).

     node scripts/build-reroute-refiles.mjs --map <reroute-map.json>
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEPT_RULES, belongsToDept, productClass } from "./build-department-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const MAP = arg("--map");
if (!MAP) { console.error("usage: node scripts/build-reroute-refiles.mjs --map <reroute-map.json>"); process.exit(2); }

/* What the audit calls the item, as the classifier's families. */
const TRUTH = {
  sports: ["deportes"], toy: ["juguetes"], accessory: ["accesorios", "joyas"], jewelry: ["joyas", "accesorios"],
  footwear: ["zapatos"], apparel: ["ropa", "trajes_bano"], apparel_kids: ["ropa", "trajes_bano"], beauty: ["belleza", "perfumes"],
  fragrance: ["perfumes"], electronics: ["electronica"], home: ["hogar"], moms: ["bebe"], auto: ["repuestos"],
  bag: ["carteras"], sunglasses: ["accesorios"], book: ["libros"], hat: ["sombreros"], grocery: ["dulces"],
};
const flags = JSON.parse(readFileSync(MAP, "utf8")).filter((f) => f.layer === "department");
const refiles = {}, held = {};
let applied = 0;
const tally = {};
for (const f of flags) {
  const p = { title: f.name, brand: f.brand || "", type: f.type || "", retailer: f.retailer, bucket: f.bucket };
  const k = `${f.currentDept} -> ${f.toDept}`;
  const t = tally[k] = tally[k] || { flags: 0, applied: 0, held: 0 };
  t.flags++;
  const cls = productClass(p);
  const agrees = (TRUTH[f.truthKind] || []).includes(cls);
  const moved = { ...p, bucket: f.toDept };
  const lands = DEPT_RULES[f.toDept] && belongsToDept(DEPT_RULES[f.toDept], moved);
  if (agrees && lands) {
    ((refiles[f.retailer] = refiles[f.retailer] || {}))[f.name] = [f.bucket, f.toDept];
    applied++; t.applied++;
  } else {
    t.held++;
    (held[k] = held[k] || []).push({ retailer: f.retailer, name: f.name, type: f.type || "", audit: f.truthKind, site: cls, lands: !!lands });
  }
}
mkdirSync(join(ROOT, "scripts/data"), { recursive: true });
writeFileSync(join(ROOT, "scripts/data/reroute-refiles.json"), JSON.stringify(refiles));
mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/reroute-refiles-held.json"), JSON.stringify(held, null, 1));
console.log(`department flags ${flags.length}: ${applied} re-filed, ${flags.length - applied} held`);
for (const [k, t] of Object.entries(tally).sort((a, b) => b[1].flags - a[1].flags)) console.log(k.padEnd(40), t.flags, "applied", t.applied, "held", t.held);
