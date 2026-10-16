/* Dump the visual-search pool: the same normalized, deduped, priced,
   shippable product pool the MCP/assistant layer uses (buildCatalog),
   slimmed to the fields the visual index needs.
   Run from the repo root:  node scripts/visual/dump-pool.mjs
   Writes: visual-pool.json (gitignored build artifact). */
import { buildCatalog } from "../lib/mcp/catalog.mjs";
import { writeFileSync } from "node:fs";

const { items, stats } = buildCatalog({});
const slim = items.map((it) => ({
  id: it.id,
  title: it.title,
  brand: it.brand,
  retailer: it.retailer,
  departments: it.departments,
  price: it.price,
  dutiableUsd: it.dutiableUsd,
  originalPrice: it.originalPrice,
  onSale: it.onSale,
  weightKg: it.weightKg,
  image: it.image,
  sizes: it.sizes,
}));
writeFileSync(
  new URL("../../visual-pool.json", import.meta.url),
  JSON.stringify(slim)
);
console.log(`pool: ${slim.length} items (${stats.files} files scanned)`);
