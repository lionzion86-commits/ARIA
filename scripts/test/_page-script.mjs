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

/* The import-tax block, from much higher up the page. freightSharePct()
   divides by displayPriceUsd(), so the badge cannot be tested without
   it, and stubbing it here would test the stub rather than the rule the
   shopper's card is drawn from. */
const PRELUDE_START = "const IMPORT_TAX_THRESHOLD_USD = 200;";
const PRELUDE_END = '/** The "incl. impuestos" line under a price, only when it is true. */';

export function loadPageWeightSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(START);
  const to = html.indexOf(END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html weight slice markers moved — update scripts/test/_page-script.mjs");
  }
  const pFrom = html.indexOf(PRELUDE_START);
  const pTo = html.indexOf(PRELUDE_END);
  if (pFrom < 0 || pTo < 0 || pTo <= pFrom) {
    throw new Error("index.html pricing prelude markers moved — update scripts/test/_page-script.mjs");
  }
  const src = html.slice(pFrom, pTo) + "\n" + html.slice(from, to);
  const sandbox = {
    // weightLabelHTML() is inside the slice and references these; nothing
    // in these tests calls it, but the declarations must resolve.
    escapeHtml: (x) => String(x),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;globalThis.__exports = { estimateRetailWeightKg, estimateRetailWeightDetail, footwearWeightKg, ballWeightKg, bulkyWeightKg, weightSanity, bandFor, titleWeight, beautyWeightDetail, isFragrance, fragranceLimitState, RETAIL_WEIGHT_ESTIMATES_KG, BEAUTY_FALLBACK_KG, MAX_FRAGRANCES_PER_SHIPMENT, FREIGHT_FEATURE_CEILING, FOOTWEAR_TIERS, freightQuotable, GENERIC_FALLBACK_KG, supplementWeightDetail, supplementWeightKg, beautyBandKg, BOOK_TIERS, BOOK_DEFAULT, bookTierFor, bookWeightKg, bookBandKg, displayPriceUsd, freightUsd, freightSharePct, doorToDoorUsd, CHARGE_PER_KG_USD };", sandbox, { filename: "index.html#weights" });
  return sandbox.__exports;
}

/* 2026-09-22: the scored-selection block this used to load is gone —
   category covers are curated art now, not a lucky dip over scraped
   photos (see the note above CATEGORY_COVERS in index.html). What is
   left to load is the curated-cover resolver, which is pure. */
const TILE_START = "const CATEGORY_COVERS = {";
/* Anchored on the declaration, not on prose: the first version of this
   marker matched a sentence in a comment, and rewording that comment
   broke the loader. */
const TILE_END = "function designedCoverHTML(";

/** The curated-cover resolver, on its own. */
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
    html.slice(from, to) + "\n;globalThis.__exports = { CATEGORY_COVERS, assertCuratedCover, categoryCoverFor, coverSeed };",
    sandbox,
    { filename: "index.html#tiles" },
  );
  return sandbox.__exports;
}

/* The subcategory mirror. index.html is a plain <script> and cannot
   import scripts/lib/subcategories.js, so the table is duplicated there
   and this slice is what lets a test prove the two agree. Anchored on
   declarations, never on prose. */
const SUB_START = "function normalizeType(raw){";
const SUB_END = "/* The grid every listing surface uses";

/** The aisle table and its helpers, on their own. */
export function loadPageSubcategorySlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(SUB_START);
  const to = html.indexOf(SUB_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html subcategory slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) +
      "\n;globalThis.__exports = { SUBCATEGORY_SPEC, normalizeType, subcategoryForType, subcategoryLabel, subcategoryOfItem, groupBySubcategory, shouldSplit, itemsInSubcategory, SPLIT_MIN_ITEMS, SPLIT_MIN_TYPED_SHARE, SPLIT_MIN_AISLES };",
    sandbox,
    { filename: "index.html#subcategories" },
  );
  return sandbox.__exports;
}

const QUERY_START = "/** Lowercase, strip accents, collapse whitespace. */";
const QUERY_END = "function searchFor(q){";

/** The Spanish→English query table and its lookup, on their own. */
export function loadPageQuerySlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(QUERY_START);
  const to = html.indexOf(QUERY_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html query-translate slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) +
      "\n;globalThis.__exports = { normalizeQueryText, translateWord, translateQuery, translateSearchQuery, ES_EN_WORDS, ES_EN_PHRASES };",
    sandbox,
    { filename: "index.html#query-translate" },
  );
  return sandbox.__exports;
}

const SHIPPING_START = "/* The happy path, in order.";
const SHIPPING_END = "let adminShippingState";

/** The normalized shipping-status mirror, on its own. */
export function loadPageShippingSlice() {
  return runSlice(SHIPPING_START, SHIPPING_END, "index.html#shipping-status",
    "{ SHIPPING_FLOW, SHIPPING_STATUSES, SHIPPING_STATUS_ES, statusLabelEs, statusNoteEs, canTransition, isTerminalStatus, flowIndex }");
}

const SUPPORT_START = "const SUPPORT_EMAIL = 'daniel.leon@ariashop.pe';";
const SUPPORT_END = "function toggleMobileMenu(){";

/** The support-address mirror, on its own. */
export function loadPageSupportSlice() {
  return runSlice(SUPPORT_START, SUPPORT_END, "index.html#support",
    "{ SUPPORT_EMAIL, GENERAL_CONTACT_EMAIL, SUPPORT_SUBJECT_RETURNS, SUPPORT_SUBJECT_ORDER, supportMailto, SUPPORT_LINKS }");
}

/* Both mirrors end with a DOMContentLoaded registration, so the sandbox
   needs just enough browser to let the slice finish evaluating. */
function runSlice(startMarker, endMarker, filename, exportsExpr) {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(startMarker);
  const to = html.indexOf(endMarker, from);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error(`index.html slice markers moved (${filename}) — update scripts/test/_page-script.mjs`);
  }
  const sandbox = {
    console,
    window: { addEventListener() {} },
    document: { querySelectorAll: () => [] },
  };
  vm.createContext(sandbox);
  vm.runInContext(html.slice(from, to) + `\n;globalThis.__exports = ${exportsExpr};`, sandbox, { filename });
  return sandbox.__exports;
}

const FEE_START = "const SMALL_ORDER_THRESHOLD_PEN = 50;";
const FEE_END = "/* CONSERVATIVE BIAS (2026-09-18)";

/** The small-order fee mirror, on its own. */
export function loadPageFeeSlice() {
  return runSlice(FEE_START, FEE_END, "index.html#small-order-fee",
    "{ SMALL_ORDER_THRESHOLD_PEN, SMALL_ORDER_FEE_PEN, SMALL_ORDER_FEE_LABEL, SMALL_ORDER_FEE_NOTE, smallOrderFeePen }");
}

const FITMENT_START = "const VEHICLE_MAKES = [";
const FITMENT_END = "// Cache key must exactly match scripts/refresh-auto-cache.js's format.";

/** The fitment matcher mirror, on its own. */
export function loadPageFitmentSlice() {
  return runSlice(FITMENT_START, FITMENT_END, "index.html#fitment",
    "{ parseFitmentText, matchesVehicle, fitmentVerdict, extractFitment, splitMakeModel, canonicalMake, canonicalModel, VEHICLE_MAKES }");
}

const AUTOSRC_START = "const AUTO_SOURCES = {";
const AUTOSRC_END = "/* ONE SEARCH PATH FOR EVERY SOURCE.";

/** The Aria Auto parts-source registry mirror, on its own. */
export function loadPageAutoSourcesSlice() {
  return runSlice(AUTOSRC_START, AUTOSRC_END, "index.html#auto-sources",
    "{ AUTO_SOURCES, searchableAutoSources, visibleAutoSources, autoSourceFor, autoSourceLabel, partNumberOf, partNumberLabel }");
}
