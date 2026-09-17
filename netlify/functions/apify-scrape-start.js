// Starts an Apify Actor run for a retailer scrape and returns immediately
// with the run ID. Netlify Functions have a hard execution/gateway timeout
// well under how long a real scrape can take (20-90s+), so this deliberately
// does NOT wait for the run to finish — see apify-scrape-status.js, which
// the client polls until the run is done.
//
// Each Actor has its own input schema, so `buildInput` maps our generic
// { retailer, query } request to whatever that specific Actor expects.
// Actor IDs and input fields verified against each Actor's own API docs
// on apify.com as of writing — re-check there if a retailer starts
// returning empty results, since Actors and their schemas can change.
// Department/category browsing (Phase 0/1 of the department-store
// restructuring). PHASE 0 STATUS (2026-09-17): all four retailers below
// (walmart, target, oldnavy, footlocker) are now REAL-TEST CONFIRMED —
// actual Apify runs through this exact buildInput, verified to return
// real, non-empty product data (see the dated comment on each section).
// Still open: BRAND_CONFIG.target.nike (unconfirmed, prior 404), plus
// refresh-department-cache.js and the frontend UI to actually call any
// of this haven't been built yet. An entry that fails real testing
// should be set to null (falls back to plain keyword search for that
// department, per the plan's explicit fallback rule) rather than left
// pointing at a URL that silently returns nothing useful.
const DEPARTMENT_CONFIG = {
  // All 6 Walmart URLs and all 6 Target URLs below are REAL-TEST CONFIRMED
  // (2026-09-17) — actual Apify runs against this exact actor+URL,
  // verified to return real, non-empty product data. Not guesses.
  //
  // Walmart-specific finding: the actor's own docs say `targets` accepts
  // either a keyword or a category URL, but real testing showed this only
  // works with Walmart's `/browse/<slug>/<id>_<id>...` URL format — every
  // `/cp/<slug>/<id>` URL (the "clean"/marketing-friendly category URL
  // format, e.g. walmart.com/cp/electronics/3944) failed on all 6
  // departments tested, uniformly. `/browse/` URLs are the real
  // catalog-grid page format; `/cp/` pages are landing/hub pages even
  // when they look like a specific category.
  walmart: {
    electronics:      { categoryUrl: "https://www.walmart.com/browse/electronics/tv-video/3944_1060825" },
    clothing:         { categoryUrl: "https://www.walmart.com/browse/clothing/mens-clothing/5438_133197_7185501" },
    candy_chocolate:  { categoryUrl: "https://www.walmart.com/browse/food/candy/976759_1096070" },
    sporting_goods:   { categoryUrl: "https://www.walmart.com/browse/sports/4125_4161" },
    home_goods:       { categoryUrl: "https://www.walmart.com/browse/home/kitchen-towels-dish-towels/4044_623679_8055732_5591719_7723882" },
    pharmacy:         { categoryUrl: "https://www.walmart.com/browse/health/vitamins/976760_1005863" },
  },
  target: {
    electronics:      { startUrl: "https://www.target.com/c/electronics/-/N-5xtg6" },
    clothing:         { startUrl: "https://www.target.com/c/men/-/N-18y1l" },
    candy_chocolate:  { startUrl: "https://www.target.com/c/chocolate-candy-grocery/candy-bars/-/N-5xt0bZh20t5" },
    sporting_goods:   { startUrl: "https://www.target.com/c/sports-equipment-outdoors/-/N-5xt52" },
    home_goods:       { startUrl: "https://www.target.com/c/bedding-home-decor/-/N-5xtv4" },
    pharmacy:         { startUrl: "https://www.target.com/c/vitamins-supplements-health/-/N-5xu07" },
  },
  oldnavy: {
    // All 4 entries REAL-TEST CONFIRMED (2026-09-17) — actual Apify runs
    // returned real, non-empty product data for each. onSaleOnly
    // specifically confirmed: returned items all had onSale: true with
    // effectivePrice < regularPrice and a real percentageOff, not just
    // the unfiltered category ignoring the flag.
    //
    // No real category-URL mechanism on this actor (confirmed via its
    // own input schema) — only a `department` facet layered on a
    // required keyword. Real, confirmed enum values from the schema:
    // Women / Men / Girls / Boys / Toddler Girls / Toddler Boys /
    // Baby Girls / Baby Boys / Gender Neutral / Maternity. "kids" here
    // covers both Girls and Boys — see refresh-department-cache.js
    // (not yet written), which should run both and merge results,
    // rather than picking one.
    men:   { searchQuery: "shirts", department: "Men" },
    women: { searchQuery: "shirts", department: "Women" },
    kids:  { searchQuery: "shirts", department: "Boys" },   // paired with a second "Girls" run in the refresh script
    sale:  { searchQuery: "clothing", onSaleOnly: true },
  },
  footlocker: {
    // All 4 entries REAL-TEST CONFIRMED (2026-09-17) — actual Apify runs
    // returned real, non-empty product data for each. onSaleOnly
    // specifically confirmed: returned items all had onSale: true with
    // price < originalPrice and a real percentOff, not just the
    // unfiltered category ignoring the flag.
    //
    // Real, confirmed enum (actor's own OpenAPI schema) — gender+type
    // based, NOT sport-based. There is no "running"/"basketball" category
    // to browse; onSaleOnly is a real filter combinable with any category.
    men:   { category: "mens-shoes" },
    women: { category: "womens-shoes" },
    kids:  { category: "kids-shoes" },
    sale:  { category: "mens-shoes", onSaleOnly: true }, // one representative category + the sale filter, not a dedicated sale category (none exists)
  },
};

// Cross-retailer brand search (Phase 4) — same "real candidate, not yet
// test-confirmed" status as DEPARTMENT_CONFIG above.
const BRAND_CONFIG = {
  target: {
    nike: { startUrl: "https://www.target.com/c/shoes/nike/-/N-55b0tZ5r231" }, // UNCONFIRMED — a prior check on this exact URL 404'd; needs a fresh real lookup before relying on it
  },
  footlocker: {
    nike: { brand: "Nike" },
  },
  // walmart: no dedicated brand-mode confirmed on this actor — brand
  // search there stays a plain keyword search using the brand name itself.
};

const RETAILER_CONFIG = {
  // Removed: mrdoe/bestbuy-product-scraper required RESIDENTIAL proxy to
  // return results reliably (dropping it made runs hang instead of
  // completing), and that proxy bandwidth cost ~40c/run vs 1-2c for
  // Walmart/Target. Target and Walmart already cover electronics, so
  // dropped rather than eating that cost. Last known-good shape:
  //   actorId: "mrdoe/bestbuy-product-scraper",
  //   buildInput: (query, maxItems) => ({
  //     operation: "search", query, maxItems,
  //     proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
  //   }),
  bestbuy: null,
  walmart: {
    actorId: "devcake/walmart-product-scraper",
    // The actor's `targets` field accepts a keyword OR a real Walmart
    // product/search/browse/category URL — a department/brand entry just
    // substitutes a category URL in for the keyword. Per the actor's own
    // docs, a category URL must be an actual product-grid page, not a
    // "shop by category" landing hub, or it errors with CATEGORY_LANDING_PAGE.
    buildInput: (query, maxItems, department, brand) => {
      const dept = department && DEPARTMENT_CONFIG.walmart[department];
      const target = dept ? dept.categoryUrl : query;
      return { targets: [target], maxResults: maxItems };
    },
  },
  target: {
    // Switched from scrapers_lat/target-scraper: real test runs against it
    // came back with 0 items even for common search terms (e.g. "phone
    // charger") regardless of zip. This one defaults to Target's online
    // catalog store rather than requiring a specific local store to match.
    actorId: "rigelbytes/target-scraper",
    buildInput: (query, maxItems, department, brand) => {
      const dept = department && DEPARTMENT_CONFIG.target[department];
      const brandCfg = brand && BRAND_CONFIG.target?.[brand];
      // BUG FIX (found via real test call): startUrls needs an array of
      // {url} objects, not bare strings — confirmed via the actor's own
      // input schema example after a real call failed with "do not
      // contain valid URLs".
      if (dept) return { startUrls: [{ url: dept.startUrl }], maxItems };
      if (brandCfg) return { startUrls: [{ url: brandCfg.startUrl }], maxItems };
      return { searchQueries: [query], maxItems };
    },
  },
  oldnavy: {
    // Covers Gap, Gap Factory, Old Navy, and Banana Republic/Athleta via
    // the `brand` field — "on" targets Old Navy specifically. No proxy
    // required per the Actor's docs (public search API, datacenter IPs).
    // No true category-browse mechanism on this actor (confirmed via its
    // schema) — `department` is only a facet filter layered on a required
    // keyword, so a "department" here is always an approximation, not
    // real category browsing like Walmart/Target/Foot Locker get.
    actorId: "crawlerbros/gap-inc-scraper",
    buildInput: (query, maxItems, department, brand) => {
      const dept = department && DEPARTMENT_CONFIG.oldnavy[department];
      return {
        brand: "on",
        searchQuery: dept ? dept.searchQuery : query,
        maxItems,
        ...(dept?.department ? { department: dept.department } : {}),
        ...(dept?.onSaleOnly ? { onSaleOnly: true } : {}),
      };
    },
  },
  footlocker: {
    // No proxy mandatory per the Actor's docs. Real category browsing
    // (mode: "browseByCategory") and real brand browsing (mode:
    // "browseByBrand") both confirmed via the actor's own OpenAPI schema.
    actorId: "crawlerbros/footlocker-product-scraper",
    buildInput: (query, maxItems, department, brand) => {
      const dept = department && DEPARTMENT_CONFIG.footlocker[department];
      const brandCfg = brand && BRAND_CONFIG.footlocker?.[brand];
      if (dept) return { mode: "browseByCategory", category: dept.category, maxItems, ...(dept.onSaleOnly ? { onSaleOnly: true } : {}) };
      if (brandCfg) return { mode: "browseByBrand", brand: brandCfg.brand, maxItems };
      return { mode: "search", searchQuery: query, maxItems };
    },
  },
  // Skipped: moving_beacon-owner1/advance-auto-parts-scraper only accepts
  // a specific product URL (no keyword search — can't do "type a part
  // name, get results" at all), and even then a real test run came back
  // with price: null despite title/brand/rating/image all working. Not
  // usable as-is regardless of the (otherwise fine, no-proxy-needed) cost.
  advanceautoparts: null,
  autozone: {
    // No proxy required per docs. Real test run: ~$5.70/1,000 overview
    // results, and this specific test even landed in the Actor's free
    // tier ("userTier": "FREE"). Real prices, titles, images, part
    // numbers all came back correctly.
    actorId: "sian.agency/autozone-product-scraper",
    buildInput: (query, maxItems) => ({
      keywords: [query],
      scrapeMode: "overview",
      maxResults: maxItems,
    }),
  },
  // Paused: two real test runs against moving_beacon-owner1/nordstrom-search-scraper
  // (with both %20 and + keyword encoding) completed "successfully" after ~55s
  // but returned 0 items each time — looks like Nordstrom's PerimeterX bot
  // protection is blocking the scrape rather than an input formatting issue.
  // Revisit with Apify run logs before re-enabling. Last known-good shape:
  //   actorId: "moving_beacon-owner1/nordstrom-search-scraper",
  //   buildInput: (query) => ({
  //     searchUrls: [`https://www.nordstrom.com/sr?keyword=${encodeURIComponent(query).replace(/%20/g, "+")}`],
  //     maxPagesPerUrl: 1,
  //   }),
  nordstrom: null,
  // No vetted Apify Actor found for Victoria's Secret at the time this was written.
  // Pick one from https://apify.com/store, then add its actorId + buildInput here
  // the same way as the retailers above.
  victoriassecret: null,
};

const DEFAULT_MAX_ITEMS = 20;

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { retailer, query, maxItems, department, brand } = JSON.parse(event.body || "{}");

    const config = RETAILER_CONFIG[retailer];
    if (!config) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Unsupported or unconfigured retailer: "${retailer}". Supported: ${Object.keys(RETAILER_CONFIG)
            .filter((k) => RETAILER_CONFIG[k])
            .join(", ")}`,
        }),
      };
    }

    // A real department/brand browse needs no keyword at all — only
    // require `query` when neither resolves to a real config entry for
    // this retailer. Walmart has no dedicated brand mode (confirmed), so
    // brand search there is just a normal keyword query (the brand name
    // itself) — no special case needed here for it.
    const hasDepartment = Boolean(department && DEPARTMENT_CONFIG[retailer]?.[department]);
    const hasBrand = Boolean(brand && BRAND_CONFIG[retailer]?.[brand]);
    if (!hasDepartment && !hasBrand && (typeof query !== "string" || !query.trim())) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "query is required" }),
      };
    }

    const cappedMaxItems = Math.min(Math.max(Number(maxItems) || DEFAULT_MAX_ITEMS, 1), 50);
    const actorInput = config.buildInput((query || "").trim(), cappedMaxItems, department, brand);
    const actorPath = config.actorId.replace("/", "~");

    const runResponse = await fetch(`https://api.apify.com/v2/actors/${actorPath}/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(actorInput),
    });

    const runData = await runResponse.json();

    if (!runResponse.ok) {
      return {
        statusCode: runResponse.status,
        headers,
        body: JSON.stringify({ error: runData?.error?.message || "Failed to start Apify Actor run" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ retailer, runId: runData.data.id }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
