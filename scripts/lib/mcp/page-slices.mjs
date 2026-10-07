/* ============================================================
   THE SITE'S OWN CODE, RUN SERVER-SIDE.

   WHY THIS EXISTS. The Muse connector has to answer with the same
   products, at the same prices, as ariashop.pe. The obvious way to do
   that is to re-implement search and pricing in a server module — and
   that is exactly how the two would drift. This repo has watched it
   happen: every duplicated table here carries a comment about the day
   it disagreed with its twin.

   So nothing is re-implemented. index.html's search and pricing
   functions are LIFTED OUT OF THE PAGE and run in a VM context with no
   DOM, which is the trick scripts/test/_page-script.mjs has used for
   months to test them. The connector calls the same `rankCatalogMatches`
   the search bar calls and the same `normalizeLiveItem` the cards are
   priced by. When the site's search changes, this changes with it, and
   there is no second copy to forget.

   WHY A RESOLVER AND NOT FIXED MARKERS. _page-script.mjs pins each slice
   between two literal strings, and those markers rot: the catalog-search
   loader there still looks for `const CATALOG_SEARCH_LIMIT = 48;` while
   the page says 200, so that loader throws today. A slice here names the
   functions it WANTS; anything they reference that the region does not
   define is pulled in from its own definition site, by name, until the
   slice both compiles and survives a probe call.

   THE PROBE IS THE POINT. A slice that merely COMPILES proves nothing:
   `normalizeLiveItem` only touches `upgradeImageUrl` when it is called,
   so a load-time check resolves nothing and every later call throws. The
   first version of this did exactly that, every call failed, and the
   build cheerfully reported "0 products" as though the catalogue were
   empty. Each slice therefore carries a probe that CALLS its functions
   on real input and asserts a real answer, and the resolver loops until
   the probe passes.
   ============================================================ */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { repoFile } from "./paths.mjs";

/** The page source, read once. Path resolves lazily so the bundled
    layout (Netlify Functions) is probed at call time, not import time. */
let pageSrc = null;
function page() {
  if (pageSrc === null) pageSrc = readFileSync(repoFile("index.html"), "utf8");
  return pageSrc;
}

/* A top-level definition, by name, from its own place in the page.
   Ends at the next top-level definition or banner comment — the page
   writes one per line at column 0, which is what makes this tractable. */
function definitionOf(html, name) {
  const starts = [
    new RegExp(`^function ${name}\\(`, "m"),
    new RegExp(`^async function ${name}\\(`, "m"),
    new RegExp(`^const ${name}\\s*=`, "m"),
    new RegExp(`^let ${name}\\s*=`, "m"),
    new RegExp(`^var ${name}\\s*=`, "m"),
  ];
  for (const re of starts) {
    const m = re.exec(html);
    if (!m) continue;
    const rest = html.slice(m.index + 1);
    const next = /\n(?=(?:function |async function |const |let |var |\/\* ====))/.exec(rest);
    return html.slice(m.index, next ? m.index + 1 + next.index : html.length);
  }
  return null;
}

/* A browser-shaped shell with nothing real behind it. The sliced code is
   pure by construction — these exist so that a stray reference fails
   loudly as a wrong ANSWER in the probe rather than as a crash in the
   middle of a 140,000-item build. */
function freshSandbox() {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    window: {},
    document: { createElement: () => ({ style: {} }), querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { userAgent: "aria-mcp" },
    location: { href: "https://ariashop.pe/", search: "" },
    fetch: async () => { throw new Error("the sliced page code must not reach the network"); },
    setTimeout, clearTimeout, URL, TextEncoder, TextDecoder,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return sandbox;
}

const MAX_RESOLUTIONS = 80;

/**
 * Run one region of index.html and hand back the functions it defines.
 *
 * @param {object} spec
 * @param {string} spec.name     what this slice is, for error messages
 * @param {string} spec.from     literal the region starts at
 * @param {string} spec.to       literal the region ends at
 * @param {string[]} spec.wants  names to export
 * @param {(api:object)=>void} spec.probe  MUST call the functions and throw if the answer is wrong
 */
export function sliceOfPage(spec) {
  const html = page();
  const from = html.indexOf(spec.from);
  const to = html.indexOf(spec.to);
  if (from < 0 || to < 0 || to <= from) {
    throw new Error(
      `index.html markers for the "${spec.name}" slice moved — ` +
      `could not find ${from < 0 ? JSON.stringify(spec.from) : JSON.stringify(spec.to)}. ` +
      `Update scripts/lib/mcp/page-slices.mjs.`,
    );
  }
  const region = html.slice(from, to);
  const exportExpr = `{${spec.wants.join(",")}}`;
  let prelude = "";
  const pulled = [];

  for (let attempt = 0; attempt <= MAX_RESOLUTIONS; attempt++) {
    const sandbox = freshSandbox();
    vm.createContext(sandbox);
    try {
      vm.runInContext(
        `${prelude}\n${region}\n;globalThis.__ariaSlice = ${exportExpr};`,
        sandbox,
        { filename: `index.html#${spec.name}` },
      );
      /* The probe calls the functions. Anything they reach only at call
         time surfaces here, which is the whole reason it exists. */
      spec.probe(sandbox.__ariaSlice);
      /* The resolved source too: search-engine.js is this exact text,
         so the standalone search page runs the page's own search. */
      return { api: sandbox.__ariaSlice, pulledIn: pulled, source: `${prelude}\n${region}` };
    } catch (err) {
      const missing = /^(\w+) is not defined$/.exec(err.message);
      if (!missing) {
        throw new Error(`the "${spec.name}" slice failed: ${err.message}`);
      }
      const def = definitionOf(html, missing[1]);
      if (!def) {
        throw new Error(
          `the "${spec.name}" slice needs ${missing[1]}, which index.html does not define at the top level`,
        );
      }
      prelude += `\n${def}`;
      pulled.push(missing[1]);
    }
  }
  throw new Error(`the "${spec.name}" slice did not settle after ${MAX_RESOLUTIONS} resolutions`);
}

/* ------------------------------------------------------------------
   THE THREE SLICES THE CONNECTOR NEEDS.
   ------------------------------------------------------------------ */

/** Whole-catalogue search: tokens, ranking, synonyms, typo tolerance. */
export function searchSlice() {
  return sliceOfPage({
    name: "catalog-search",
    from: "const CATALOG_SEARCH_LIMIT = 200;",
    to: "/* END OF THE PURE SLICE",
    wants: [
      "searchTokens", "catalogWordsOf", "catalogItemCategory", "rankCatalogMatches",
      "detectBrandIntent", "expandBrandAliases", "synonymGroupOf", "synonymsOf",
      "canonicalizeTokens", "fuzzyFormsForToken", "fuzzyVocabBuckets",
      "CATALOG_SEARCH_LIMIT",
    ],
    probe(api) {
      const words = api.catalogWordsOf({ title: "Nike Club Fleece Hoodie", brand: "Nike" });
      if (!words || !words.has || !words.has("hoodie")) {
        throw new Error("catalogWordsOf did not tokenise a hoodie title");
      }
      if (!api.searchTokens("zapatillas").length) throw new Error("searchTokens returned nothing");
    },
  });
}

/** Shippability and the quarantine rule — the same gate browsing uses. */
export function shippabilitySlice() {
  return sliceOfPage({
    name: "shippability",
    from: "const RESTRICTED_DEPARTMENTS",
    to: "function retailerItemsFor(",
    wants: ["isShippableItem", "notQuarantined", "RESTRICTED_DEPARTMENTS"],
    probe(api) {
      if (api.isShippableItem({ name: 'Samsung 65" QLED 4K Smart TV' })) {
        throw new Error("a television passed the shippability gate");
      }
      if (!api.isShippableItem({ name: "Nike Club Fleece Hoodie" })) {
        throw new Error("a hoodie failed the shippability gate");
      }
      if (api.notQuarantined({ imageReview: "quarantined" })) {
        throw new Error("a quarantined image passed");
      }
    },
  });
}

/** Pricing: the tiered margin, the per-retailer sales tax, the dutiable
    base, the weight estimate and the $13/kg freight rate. */
export function pricingSlice() {
  return sliceOfPage({
    name: "pricing",
    from: "function safeUrl(u){",
    to: "function liveRetailerSkeleton(retailer){",
    wants: [
      "normalizeLiveItem", "tieredMarginUsd", "salesTaxRateFor", "freightUsd",
      "CHARGE_PER_KG_USD", "SALES_TAX_RATE", "round2",
    ],
    probe(api) {
      /* The documented worked examples from the page's own comment:
         $100 -> $24, $1,000 -> $210, $6,000 -> $830. If the brackets are
         ever re-cut, this is where it is noticed. */
      if (api.tieredMarginUsd(100) !== 24) throw new Error("tiered margin: $100 did not yield $24");
      if (api.tieredMarginUsd(1000) !== 210) throw new Error("tiered margin: $1,000 did not yield $210");
      if (api.tieredMarginUsd(6000) !== 830) throw new Error("tiered margin: $6,000 did not yield $830");
      /* A real normalisation, which is what drags in the call-time
         dependencies (upgradeImageUrl, normalizeType, the Macy's image
         widths) that a load-only check never sees.

         THE IMAGE URL IS A REAL MACY'S ONE ON PURPOSE. upgradeImageUrl
         branches per CDN, so a placeholder host exercises none of those
         branches: an earlier probe used example.com, the Macy's branch
         stayed unresolved, and 754 Macy's products threw at build time
         — counted, but still missing from the catalogue. */
      const priced = api.normalizeLiveItem(
        {
          title: "Nike Club Fleece Hoodie",
          price: 60,
          image: "https://slimages.macysassets.com/is/image/MCY/products/2/optimized/37875082_fpx.tif?wid=600&qlt=85&fmt=jpeg",
        },
        { retailer: "macys", department: "clothing" },
      );
      if (!priced.image || !/macysassets/.test(priced.image)) {
        throw new Error("the Macy's image path did not survive normalisation");
      }
      if (!priced || !(priced.price > 0)) throw new Error("normalizeLiveItem produced no price");
      /* macys is 'taxable', so the Miami 7% applies on top of the margin. */
      const want = api.round2((60 + api.tieredMarginUsd(60)) * api.SALES_TAX_RATE);
      if (priced.price !== want) {
        throw new Error(`normalizeLiveItem priced a taxable retailer at ${priced.price}, expected ${want}`);
      }
      if (api.freightUsd(2) !== 26) throw new Error("freight is no longer 2kg -> $26 at $13/kg");
    },
  });
}

/** All three, built once. */
export function loadPageEngine() {
  const search = searchSlice();
  const ship = shippabilitySlice();
  const pricing = pricingSlice();
  return {
    search: search.api,
    ship: ship.api,
    pricing: pricing.api,
    pulledIn: {
      search: search.pulledIn,
      shippability: ship.pulledIn,
      pricing: pricing.pulledIn,
    },
  };
}
