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
  vm.runInContext(src + "\n;globalThis.__exports = { estimateRetailWeightKg, estimateRetailWeightDetail, footwearWeightKg, ballWeightKg, bulkyWeightKg, candleWeightKg, weightSanity, bandFor, titleWeight, beautyWeightDetail, isFragrance, fragranceLimitState, RETAIL_WEIGHT_ESTIMATES_KG, BEAUTY_FALLBACK_KG, MAX_FRAGRANCES_PER_SHIPMENT, FREIGHT_FEATURE_CEILING, FOOTWEAR_TIERS, freightQuotable, GENERIC_FALLBACK_KG, supplementWeightDetail, supplementWeightKg, beautyBandKg, BOOK_TIERS, BOOK_DEFAULT, bookTierFor, bookWeightKg, bookBandKg, displayPriceUsd, freightUsd, freightSharePct, doorToDoorUsd, CHARGE_PER_KG_USD };", sandbox, { filename: "index.html#weights" });
  return sandbox.__exports;
}

const AUTO_GLOSSARY_START = "/* ==== GLOSSARY-BLOCK-START";
const AUTO_GLOSSARY_END = "\n/* ============================================================\n   ARIA AUTO'S PARTS SOURCES";

/* The shared ES->EN parts glossary (generated from
   scripts/lib/es-en-parts-glossary.json) and its lookup, on their own.
   The JSON is the canonical module — the future Aria AI assistant imports
   it directly; this slice proves the browser's inline copy matches it. */
export function loadPageAutoGlossarySlice() {
  const html = readFileSync(INDEX, "utf8").replace(/\r\n/g, "\n");
  const from = html.indexOf(AUTO_GLOSSARY_START);
  const to = html.indexOf(AUTO_GLOSSARY_END, from);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html auto-glossary slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) +
      "\n;globalThis.__exports = { AUTO_PART_TERMS_ES_EN, translatePartQuery };",
    sandbox,
    { filename: "index.html#auto-glossary" },
  );
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

/* The tier mirror. Grouping only — a tier decides a heading on Tiendas
   and never a capability, so this slice holds the table and nothing
   that could filter a store out of search or Ofertas. */
const TIER_START = "const TIERS = [";
const TIER_END = "function retailersByTier(){";

export function loadPageTierSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(TIER_START);
  const to = html.indexOf(TIER_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html tier slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { TIERS, DEFAULT_TIER, tierOf };",
    sandbox,
    { filename: "index.html#tiers" },
  );
  return sandbox.__exports;
}

/* The budget bands. Pure arithmetic over a door-to-door total, so the
   band table and its lookup load without the page's pricing chain. */
const BUDGET_START = "const BUDGET_BANDS = [";
const BUDGET_END = "/** An item's door-to-door total in soles";

export function loadPageBudgetSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(BUDGET_START);
  const to = html.indexOf(BUDGET_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html budget slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { BUDGET_BANDS, budgetBandFor };",
    sandbox,
    { filename: "index.html#budget" },
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
const QUERY_END = "function searchFor(q, which){";

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

/* ============================================================
   THE CATALOGUE ENVELOPE ADAPTER.

   beauty-catalog.json arrived with departments.<key> as a BARE ARRAY
   rather than { items: [...] }, which every reader on the page walks.
   Nothing would have thrown — `bucket?.items || []` on an array is
   undefined — so all 197 products would simply have been invisible.
   normalizeCatalogueEnvelope() reshapes at the load boundary, and this
   slice is what lets a test feed it the real file. Anchored on the
   declaration and on the function that follows it. */
const ENVELOPE_START = "function normalizeCatalogueEnvelope(file){";
const ENVELOPE_END = "function loadDepartmentCache(){";

export function loadPageEnvelopeSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(ENVELOPE_START);
  const to = html.indexOf(ENVELOPE_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html envelope slice markers moved — update scripts/test/_page-script.mjs");
  }
  /* normalizeCatalogueEnvelope leans on aliasEnvelopeTitles, defined just
     above the slice start -- pulled in by name so the slice keeps working
     without dragging the whole catalogue section along. */
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    extractNamedFunction(html, "aliasEnvelopeTitles") + "\n" +
    html.slice(from, to) + "\n;globalThis.__exports = { normalizeCatalogueEnvelope };",
    sandbox,
    { filename: "index.html#envelope" },
  );
  return sandbox.__exports;
}

/* The image-URL upgrader. Retailer CDNs size by query parameter or by
   filename prefix, and getting either wrong is a broken photo on every
   card — so the rules are pinned against real URLs from the committed
   catalogues rather than against examples someone typed. */
const IMGURL_START = "const MACYS_IMAGE_WIDTH =";
const IMGURL_END = "function photoPlaceholderHTML(";

export function loadPageImageUrlSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(IMGURL_START);
  const to = html.indexOf(IMGURL_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html image-url slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { upgradeImageUrl, imageRetryUrl, MACYS_IMAGE_WIDTH };",
    sandbox,
    { filename: "index.html#image-url" },
  );
  return sandbox.__exports;
}

/* The A-Z brand index. Pure list work — fold, letter, sort, group,
   match — so it loads without the DOM the panel around it needs.
   brandLabelFor() is deliberately OUTSIDE the slice: it reads
   departmentCacheData, which is page state, not a rule. */
const BRAND_START = "function foldBrand(raw){";
const BRAND_END = "function brandLabelFor(";

export function loadPageBrandSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(BRAND_START);
  const to = html.indexOf(BRAND_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html brand slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { foldBrand, brandLetter, brandMatches, brandRows, brandGroups, brandKeyOf, brandBucketsFromItems };",
    sandbox,
    { filename: "index.html#brands" },
  );
  return sandbox.__exports;
}

/* ============================================================
   THE CHAT'S ROUTING TABLES.

   Three literals decide where a quick-reply chip's text goes:
   ARIA_QUICK_REPLIES (what the chips say, which IS what they send),
   SALE_KEYWORDS (the local shortcut straight to the Ofertas feed) and
   CHAT_NON_SHOPPING_RE (what keeps a question out of a live
   multi-retailer PRODUCT search that runs for half a minute).

   Loaded rather than string-matched so the tests can RUN them: a chip
   that would drop a shopper into a thirty-second search for the words
   "Rastrear mi pedido" is not something a grep for the chip's label
   would ever notice.
   ============================================================ */
const CHAT_ROUTE_START = "const ARIA_QUICK_REPLIES = [";
const CHAT_ROUTE_END = "async function runAssistantBrain(";

export function loadPageChatRoutingSlice() {
  const html = readFileSync(INDEX, "utf8");
  const qFrom = html.indexOf(CHAT_ROUTE_START);
  const kFrom = html.indexOf("const SALE_KEYWORDS = [");
  const kTo = html.indexOf(CHAT_ROUTE_END);
  const nFrom = html.indexOf("const CHAT_NON_SHOPPING_RE = ");
  if (qFrom < 0 || kFrom < 0 || kTo < 0 || nFrom < 0 || kTo <= kFrom) {
    throw new Error("index.html chat-routing markers moved — update scripts/test/_page-script.mjs");
  }
  const src = [
    html.slice(qFrom, html.indexOf("];", qFrom) + 2),
    html.slice(kFrom, kTo),
    html.slice(nFrom, html.indexOf("\n", nFrom)),
  ].join("\n");
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    src + "\n;globalThis.__exports = { ARIA_QUICK_REPLIES, SALE_KEYWORDS, CHAT_NON_SHOPPING_RE };",
    sandbox, { filename: "index.html#chat-routing" });
  return sandbox.__exports;
}
/* The footwear detector. Pure string work over an item, so it loads
   without the cache the department read needs around it. */
const SHOE_START = "const FOOTWEAR_TYPE =";
const SHOE_END = "function rawTitleOf(item){";

export function loadPageFootwearSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(SHOE_START);
  const to = html.indexOf(SHOE_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html footwear slice markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { isFootwear, isFootwearType, isFootwearTitle, FOOTWEAR_RETAILERS };",
    sandbox,
    { filename: "index.html#footwear" },
  );
  return sandbox.__exports;
}

/* The Ofertas rail's store spread, on its own. Pure list work, so it is
   run rather than pattern-matched: "one card per store in the first
   five" is a claim about what comes out, not about what the source
   looks like. */
export function loadPageDealSpreadSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const MOBILE_RAIL_LEAD = 5;");
  const to = html.indexOf("function renderMobileDealsRail(");
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html deal-spread markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  /* OFERTAS LEAD (2026-09-26, Danny): the lead-brand sort ships in the
     same slice as the spread, so its behaviour is tested, not just its
     source text. */
  /* ofertasLeadSort leans on the page's own discountPct -- the slice
     carries that one-liner along so the sort runs for real. */
  const dpctStart = html.indexOf("function discountPct(p){");
  const dpctEnd = html.indexOf("\n", dpctStart);
  if (dpctStart < 0 || dpctEnd < 0) {
    throw new Error("index.html discountPct moved — update scripts/test/_page-script.mjs");
  }
  vm.runInContext(html.slice(from, to) + "\n" + html.slice(dpctStart, dpctEnd)
    + "\n;globalThis.__exports = { spreadDealsByStore, MOBILE_RAIL_LEAD, ofertasLeadSort, ofertasLeadRank, OFERTAS_LEAD_BRANDS, OFERTAS_LEAD_N };",
    sandbox, { filename: "index.html#deal-spread" });
  return sandbox.__exports;
}

/* The product page's "También te puede interesar" selection, on its own.
   Pure list work over an anchor and a pool, so the rules the brief
   states -- same department, ±50%, backfill from the same store, ten at
   most, never a priceless one -- are RUN against made-up catalogues
   rather than grepped for. A rule you can only see in the source is a
   rule nobody has checked. */
const RELATED_START = "const RELATED_RAIL_MIN = 8;";
const RELATED_END = "/* Every catalogue item once, with every department it appears in.";

export function loadPageRelatedSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf(RELATED_START);
  const to = html.indexOf(RELATED_END);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html related-rail markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(html.slice(from, to) +
    "\n;globalThis.__exports = { relatedProducts, relatedKeyOf, RELATED_RAIL_MIN, RELATED_RAIL_MAX, RELATED_PRICE_BAND };",
    sandbox, { filename: "index.html#related" });
  return sandbox.__exports;
}

/* The whole-catalogue search, on its own. Ranking is arithmetic over a
   pool, so it is RUN against made-up catalogues rather than grepped
   for: "instantly, every time, with or without Apify credit" is a claim
   about what comes out of a function, and the two bugs this slice
   caught -- a bra outranking Nike trainers because "air" is inside
   "Fair", and a pluralising translator missing "Vitamin D3" -- were
   both invisible in the source and obvious in the output. */
export function loadPageCatalogSearchSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const CATALOG_SEARCH_LIMIT = 48;");
  const to = html.indexOf("/* END OF THE PURE SLICE");
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html catalog-search markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) +
      "\n;globalThis.__exports = { searchTokens, catalogWordsOf, catalogTokenHits, scoreCatalogItem, rankCatalogMatches, catalogResultsAreThin, catalogTokenWeights, queryCategoryIntent, catalogItemCategory, CATEGORY_IMPLIED_WORDS, CATALOG_SEARCH_LIMIT, CATALOG_THIN_EXACT, SEARCH_SYNONYM_GROUPS, synonymGroupOf, synonymsOf, canonicalizeToken, canonicalizeTokens, expandBrandAliases, retailerIntentFor, retailerNameTokens, BRAND_ALIASES };",
    sandbox,
    { filename: "index.html#catalog-search" },
  );
  return sandbox.__exports;
}

/* The size-selection rule, on its own. It is a pair of regexes and two
   small functions, and the question it answers -- "does this thing have
   a size?" -- is one you settle by running it over titles, not by
   reading the pattern. */
export function loadPageSizeSlice() {
  const html = readFileSync(INDEX, "utf8");
  /* TWO REGIONS, because the words and the rules that read them are
     deliberately no longer neighbours: the single keyword list was
     lifted above its first use (see the comment on it), and
     needsSizeSelection lives with the retailer rules further down. */
  const wordsFrom = html.indexOf("const SHOE_KEYWORDS = /sneaker");
  const wordsTo = html.indexOf("const APPAREL_KEYWORDS = new RegExp(");
  const from = html.indexOf("const APPAREL_ONLY_RETAILERS = new Set(");
  const to = html.indexOf("let liveScrapeQuery = '';");
  if (wordsFrom < 0 || wordsTo < 0 || from < 0 || to < 0 || to <= from) {
    throw new Error("index.html size-selection markers moved — update scripts/test/_page-script.mjs");
  }
  const words = html.slice(wordsFrom, html.indexOf("\n", wordsTo) + 1);
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    words + html.slice(from, to) +
      "\n;globalThis.__exports = { needsSizeSelection, sizeCategoryFor, APPAREL_ONLY_RETAILERS, SHOE_KEYWORDS, CLOTHING_KEYWORDS, APPAREL_KEYWORDS };",
    sandbox,
    { filename: "index.html#sizes" },
  );
  return sandbox.__exports;
}

/* Curvy's size rule, on its own. It is a Set and four small pure
   functions, and the question it answers -- "will this store actually
   ship a 3X?" -- is one you settle by running it over real size lists,
   not by reading the pattern. */
export function loadPageCurvySlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const EXTENDED_SIZES = new Set([");
  const to = html.indexOf("const CURVY_BLURB =");
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html curvy markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) +
      "\n;globalThis.__exports = { EXTENDED_SIZES, retailerSizesOf, extendedSizesOf, hasExtendedSizes, sizeRunLabels };",
    sandbox,
    { filename: "index.html#curvy" },
  );
  return sandbox.__exports;
}

/* Curvy's women-first band, on its own. curvyBandOf() reads genderOfItem(),
   which reads the gender markers, the brand rule and BUCKET_SPEC -- all
   scattered across the page -- so this assembles the dependency chain
   piece by piece rather than trusting one marker span. Each piece is
   captured by declaration: a `const X = /.../;` runs to its semicolon, a
   braced body runs to its matching close brace (none of these bodies
   carries a brace inside a string, so a plain counter is exact). */
export function loadPageCurvyBandSlice() {
  const html = readFileSync(INDEX, "utf8");
  function grab(name) {
    const m = new RegExp(`(?:const|function)\\s+${name}\\b`).exec(html);
    if (!m) throw new Error(`index.html: ${name} not found — update scripts/test/_page-script.mjs`);
    const i = m.index;
    const eq = html.indexOf("=", i);
    const brace = html.indexOf("{", i);
    if (/^const\s/.test(html.slice(i, i + 6)) && eq > 0 && (brace < 0 || eq < brace)) {
      let j = eq + 1;
      while (/\s/.test(html[j])) j++;
      if (html[j] === "{") { /* object const: fall through to brace matching */ }
      else {
        const semi = html.indexOf(";", j);
        if (semi < 0) throw new Error(`index.html: ${name} unterminated`);
        return html.slice(i, semi + 1);
      }
    }
    let depth = 0, instr = null, k = brace;
    for (; k < html.length; k++) {
      const c = html[k];
      if (instr) {
        if (c === instr && html[k - 1] !== "\\") instr = null;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") { instr = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) throw new Error(`index.html: ${name} braces unbalanced`);
    let end = k + 1;
    while (end < html.length && /\s/.test(html[end])) end++;
    if (html[end] === ";") end++;
    return html.slice(i, end);
  }
  const parts = [
    "BUCKET_SPEC", "KID_MARKER", "WOMEN_MARKER", "MEN_MARKER",
    "rawTitleOf", "genderFromTitle", "brandOf", "PINK_BRAND",
    "genderOfItem", "curvyBandOf",
  ].map(grab);
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    parts.join("\n") +
      "\n;globalThis.__exports = { curvyBandOf, genderOfItem };",
    sandbox,
    { filename: "index.html#curvy-band" },
  );
  return sandbox.__exports;
}


/* The carousel selection mirror: the pure pick/mix functions index.html
   carries line-for-line from scripts/lib/carousel.js. Pure — no DOM. */
export function loadPageCarouselSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const CAROUSEL_MAX = 16;");
  const to = html.indexOf("/* END OF THE CAROUSEL SELECTION MIRROR */");
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html carousel markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) +
      "\n;globalThis.__exports = { CAROUSEL_MAX, CAROUSEL_MIN_ITEMS, carouselItemKey, carouselHasPhoto, carouselPickItems, carouselMixItems };",
    sandbox,
    { filename: "index.html#carousel" },
  );
  return sandbox.__exports;
}

/* THE HOME ROW'S RUNNING ORDER, on its own. A plain array of keys, so
   this loads the declaration and nothing else -- homeRowTiles() needs
   the department cache and belongs to the browser suite. What the node
   suite can settle from the text is the part that goes wrong silently:
   a key here that no longer names a department renders nothing, and the
   card just quietly stops appearing. */
export function loadPageHomeRowSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const HOME_ROW_DEPARTMENTS = [");
  const to = html.indexOf("function homeRowTiles(");
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html home-row markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { HOME_ROW_DEPARTMENTS };",
    sandbox,
    { filename: "index.html#homeRow" },
  );
  return sandbox.__exports;
}

/* THE STORE RAILS' CURATION, on its own. storeRailPicks is written
   self-contained (no page functions) precisely so this slice can run
   it in a vm: sale-first, Ofertas-deprioritised, featured fill. */
export function loadPageStoreRailSlice() {
  const html = readFileSync(INDEX, "utf8");
  const marker = html.indexOf("STORE_RAIL_PICKS:SLICE-START");
  /* The marker lives inside its opening /* comment -- the slice must
     start at the opener or the vm parses prose as code. */
  const from = html.lastIndexOf("/*", marker);
  /* And the slice must run past the END marker's own closing comment,
     or the vm gets an unterminated /* and nothing parses. */
  const endMarker = html.indexOf("STORE_RAIL_PICKS:SLICE-END");
  const to = html.indexOf("*/", endMarker) + 2;
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html store-rail markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { STORE_RAIL_SALE, STORE_RAIL_TOTAL, storeRailPicks, COSTCO_CAROUSEL_MAX, costcoCuratedItems, costcoBucketOf, costcoTreasureRank };",
    sandbox,
    { filename: "index.html#storeRail" },
  );
  return sandbox.__exports;
}

/* CURVY'S STORE CARDS, on their own. curvyStoreCards is written
   self-contained (pure: byRetailer in, ordered list out) precisely so
   this slice can run it in a vm. */
export function loadPageCurvyStoreCardsSlice() {
  const html = readFileSync(INDEX, "utf8");
  const marker = html.indexOf("CURVY_STORE_CARDS:SLICE-START");
  /* The marker lives inside its opening /* comment -- the slice must
     start at the opener or the vm parses prose as code. */
  const from = html.lastIndexOf("/*", marker);
  /* And the slice must run past the END marker's own closing comment,
     or the vm gets an unterminated /* and nothing parses. */
  const endMarker = html.indexOf("CURVY_STORE_CARDS:SLICE-END");
  const to = html.indexOf("*/", endMarker) + 2;
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html curvy-store-cards markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { CURVY_STORE_LEAD_ORDER, curvyStoreCards };",
    sandbox,
    { filename: "index.html#curvyStoreCards" },
  );
  return sandbox.__exports;
}

/* The Fiestas vertical's pure wiring: shelf config + the raw-item
   selector. fiestasItemsFor leans on two tiny pure helpers defined
   elsewhere in the page (notQuarantined, rawTitleOf); they are pulled in
   by name so the slice stays a faithful copy of the page's logic.
   fiestasRailPicks is NOT in the slice -- it needs normalizeLiveItem's
   weight closure, which is not vm-friendly. */
function extractNamedFunction(html, name) {
  const start = html.indexOf("function " + name + "(");
  if (start < 0) throw new Error("index.html lost function " + name + " -- update scripts/test/_page-script.mjs");
  const rest = html.slice(start);
  const m = rest.match(/\n(?=function |const |let |var )/);
  return m ? rest.slice(0, m.index + 1) : rest;
}

export function loadPageFiestasSlice() {
  const html = readFileSync(INDEX, "utf8");
  const marker = html.indexOf("FIESTAS_PICK:SLICE-START");
  /* The marker lives inside its opening /* comment -- the slice must
     start at the opener or the vm parses prose as code. */
  const from = html.lastIndexOf("/*", marker);
  /* And the slice must run past the END marker's own closing comment,
     or the vm gets an unterminated /* and nothing parses. */
  const endMarker = html.indexOf("FIESTAS_PICK:SLICE-END");
  const to = html.indexOf("*/", endMarker) + 2;
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html fiestas-pick markers moved -- update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    extractNamedFunction(html, "notQuarantined") + "\n" +
    extractNamedFunction(html, "rawTitleOf") + "\n" +
    html.slice(from, to) +
    "\n;globalThis.__exports = { FIESTAS_RETAILER_LABEL, FIESTAS_TABLEWARE_RX, FIESTAS_VARIETY_RX, FIESTAS_RAIL_TOTAL, FIESTAS_RAILS, fiestasItemsFor };",
    sandbox,
    { filename: "index.html#fiestasPick" },
  );
  return sandbox.__exports;
}
/* THE CART MERGE, on its own. mergeCarts + cartItemKey are pure functions;
   the slice runs them so the idempotence rule ("reload must never change
   quantities") is settled by execution, not by reading the code. */
export function loadPageSizeGuideSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const SIZE_GUIDE_GENERAL = {");
  const to = html.indexOf("let pendingProduct = null;");
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html size-guide markers moved — update scripts/test/_page-script.mjs");
  }
  /* The resolver leans on the two gender keyword regexes declared just
     above standardSizeOptions; pull those single lines in so the slice
     stays self-contained without dragging the whole size region. */
  const kidsAt = html.indexOf("const PRODUCT_KIDS_KEYWORDS =");
  const mensAt = html.indexOf("const PRODUCT_MENS_KEYWORDS =");
  const kidsLine = html.slice(kidsAt, html.indexOf("\n", kidsAt) + 1);
  const mensLine = html.slice(mensAt, html.indexOf("\n", mensAt) + 1);
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    kidsLine + mensLine + html.slice(from, to) +
      "\n;globalThis.__exports = { SIZE_GUIDE_GENERAL, SIZE_GUIDE_BRANDS, resolveSizeGuide, sizeGuideBrandEntry };",
    sandbox,
    { filename: "index.html#size-guide" },
  );
  return sandbox.__exports;
}

export function loadPageCartSlice() {
  const html = readFileSync(INDEX, "utf8");
  const from = html.indexOf("const CART_STORAGE_KEY = 'aria_cart_v1';");
  const endMarker = html.indexOf("CART WEIGHT REPAIR");
  const to = html.lastIndexOf("/*", endMarker);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error("index.html cart markers moved — update scripts/test/_page-script.mjs");
  }
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(
    html.slice(from, to) + "\n;globalThis.__exports = { cartItemKey, mergeCarts, repairDoubledQuantities };",
    sandbox,
    { filename: "index.html#cart" },
  );
  return sandbox.__exports;
}
