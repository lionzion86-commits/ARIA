#!/usr/bin/env node
/* ============================================================
   WRITE THE STORED SPANISH INTO THE CATALOGUES (#443 c.6402691998).

   For the stores whose catalogue is a committed file rather than the
   output of a builder (Walmart's toys, Costco, Hot Topic, ...), the
   Spanish from scripts/data/descriptions-es/<store>.json is written
   straight into each item: `description` becomes the Spanish and the
   feed's English moves to `description_en` (kept for the record, never
   shown). Run it as the last step of any pull or refresh of those files,
   then rebuild the product-page shards:

     node scripts/apply-description-memory.mjs            # every catalogue the PDP reads
     node scripts/apply-description-memory.mjs juguetes-catalog.json
     node scripts/build-pdp-slices.mjs

   Idempotent: once an item carries the Spanish, its text is no longer an
   English key in the memory, so a second run changes nothing.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spanishFor } from "./lib/description-es.js";
import { serializerFor } from "./lib/gallery-backfill.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/* The catalogue list the product page reads (producto.html CATALOG_FILES). */
export function catalogFiles(root = ROOT) {
  const page = readFileSync(root + "producto.html", "utf8");
  const m = /var CATALOG_FILES = (\[[^\]]*\]);/.exec(page);
  return m ? JSON.parse(m[1]).map((f) => f.replace(/^\//, "")) : [];
}

/* An item's store is its own `retailer`, else the key it sits under in a
   catalogue keyed by store ({ retailers: { walmart: {...} } }). */
export function applyToCatalog(obj, store = null) {
  let changed = 0;
  (function walk(o, s) {
    if (Array.isArray(o)) { for (const v of o) walk(v, s); return; }
    if (!o || typeof o !== "object") return;
    if (typeof o.retailer === "string") s = o.retailer;
    if (typeof o.description === "string" && s) {
      const es = spanishFor(s, o.description);
      if (es && es !== o.description) {
        if (!o.description_en) o.description_en = o.description;
        o.description = es;
        changed++;
      }
    }
    /* A feed that keeps its English apart (description "" or missing, the
       source in description_en -- Walmart electronics, SSENSE): the stored
       Spanish fills `description` (#443 c.6535043159). */
    const src = o.description_en || o.descriptionEn;
    if (s && typeof src === "string" && src.trim() && !String(o.description || "").trim()) {
      const es = spanishFor(s, src);
      if (es) { o.description = es; changed++; }
    }
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== "object") continue;
      if (k === "retailers" && !Array.isArray(v)) for (const [rk, rv] of Object.entries(v)) walk(rv, rk);
      else walk(v, s);
    }
  })(obj, store);
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : catalogFiles();
  let total = 0;
  for (const f of files) {
    if (!existsSync(ROOT + f)) continue;
    const text = readFileSync(ROOT + f, "utf8");
    /* Written back in the file's own JSON style (indent, float format). */
    const ser = serializerFor(text);
    const data = ser && ser.parse ? ser.parse(text) : JSON.parse(text);
    const n = applyToCatalog(data);
    if (n) { writeFileSync(ROOT + f, ser ? ser(data) : JSON.stringify(data)); console.log(`${f}: ${n} descriptions now Spanish`); }
    total += n;
  }
  console.log(`${total} descriptions written`);
}
