/* Loads the WEIGHT ESTIMATION SLICE of index.html's inline <script> into a
   plain JS sandbox, so the page's mirrored copies can be compared against
   the real modules instead of being trusted.

   index.html is a plain <script>: it cannot import, so the weight tables
   exist twice (see the mirror comments in both files). The whole script
   touches the DOM at load, so this deliberately evaluates only the slice
   between the two markers below — pure functions and data, nothing that
   needs a browser. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const INDEX = fileURLToPath(new URL("../../index.html", import.meta.url));

const START = "const SALES_TAX_RATE = 1.07;";
const END = "// Deliberately does NOT expose a clickthrough URL to the retailer's site";

export function loadPageWeightSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html weight slice markers moved — update scripts/test/_page-script.mjs");
  }
  const src = html.slice(from, to);
  const sandbox = {
    // weightLabelHTML() is inside the slice and references these; nothing
    // in these tests calls it, but the declarations must resolve.
    escapeHtml: (x) => String(x),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;globalThis.__exports = { estimateRetailWeightKg, estimateRetailWeightDetail, footwearWeightKg, ballWeightKg, bulkyWeightKg, weightSanity, bandFor, titleWeight, beautyWeightDetail, isFragrance, fragranceLimitState, RETAIL_WEIGHT_ESTIMATES_KG, BEAUTY_FALLBACK_KG, MAX_FRAGRANCES_PER_SHIPMENT, FREIGHT_BADGE_SHARE, FREIGHT_FEATURE_CEILING, FOOTWEAR_TIERS };", sandbox, { filename: "index.html#weights" });
  return sandbox.__exports;
}

const TILE_START = "const DEPARTMENT_THUMB_EXCLUDE = {";
const TILE_END = "// One tile per unique department/brand key found anywhere in the cache";

/** The category-tile image selection block, on its own. */
export function loadPageTileSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(TILE_START);
  const to = html.indexOf(TILE_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html tile slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { scoreTileCandidate, pickTileImage, CATEGORY_IMAGE_PIN, TILE_IMAGE_HERO };",
    sandbox,
    { filename: "index.html#tiles" },
  );
  return sandbox.__exports;
}
