/* ============================================================
   CATALOG DEPTH — QUOTAS, NOT ONE UNDIFFERENTIATED SCRAPE

   THE PROBLEM. Old Navy women's rendered three to eight T-shirts and
   called it the store. The cause was one number:
   ITEMS_PER_DEPARTMENT = 24 in scripts/refresh-department-cache.js. One
   scrape per department, capped at 24 rows, and whatever mix the actor
   happened to return — so "Moda Mujer" could be 24 dresses and no tops,
   and a shopper looking for a T-shirt concluded we do not sell them.

   An eight-product storefront is not a thin cache, it is a claim: this
   is what the retailer carries. It is a false one, and it is the worst
   thing a store page can say.

   THE MODEL. A store is a list of QUOTAS: a category, the query that
   fetches it, and how many items that category should hold. Depth is
   declared per category rather than emerging from one lucky scrape, so
   "~60 T-shirts and ~60 pants" is a number in a table that someone can
   read and change, not an accident.

   WHAT THIS COSTS, AND WHY THE NUMBERS ARE HONEST. Each quota is one
   actor run. Depth multiplies runs, which is exactly the thing that
   burned $88, so `plannedRuns()` below is what the tiered refresh
   projects its budget from — and the catalog tier runs every three days,
   not daily, precisely because this is the expensive one.

   ADDING A STORE. Add a `quotas` array here and a row in
   scripts/lib/retailers.js. Nothing else: the refresh script iterates
   whatever is in this file.
   ============================================================ */

/* The floor a storefront has to clear before it is honest to present it
   as a store rather than as a sample. Below this the page says so. */
export const MIN_HONEST_STOREFRONT = 120;

/* Per-run ceiling. The actor input caps at this, and more rows per run is
   the cheapest depth there is — one run returning 60 costs the same as
   one returning 24. Raised from 24 with the quota model. */
export const ITEMS_PER_QUOTA = 60;

/* Per-retailer depth overrides for the department/brand refresh.
   Foot Locker runs deep (2026-09-25: Danny wants 500–1,000 shoe models
   on the storefront) — every other retailer stays at the standard quota.
   The refresh script reads these; the function's maxItems cap was raised
   for config-driven browses to match. */
const DEPARTMENT_ITEMS_BY_RETAILER = { footlocker: 150 };
const BRAND_ITEMS_BY_RETAILER = { footlocker: 70 };

/** Items per department-browse run for one retailer. */
export function departmentItemsFor(retailer) {
  return DEPARTMENT_ITEMS_BY_RETAILER[String(retailer || "").toLowerCase()] || ITEMS_PER_QUOTA;
}

/** Items per brand-browse run for one retailer. */
export function brandItemsFor(retailer) {
  return BRAND_ITEMS_BY_RETAILER[String(retailer || "").toLowerCase()] || 24;
}

/**
 * quotas: [{ category, query, department?, target }]
 *
 * `department` routes the run through DEPARTMENT_CONFIG's real category
 * facet where the actor has one (Walmart, Target, Old Navy, Foot Locker).
 * `query` is the keyword fallback, and the only mechanism for a store
 * whose actor has no category browse at all.
 */
export const CATALOG_QUOTAS = {
  oldnavy: [
    { category: "women_tops", department: "women", query: "womens t-shirts", target: 60 },
    { category: "women_bottoms", department: "women", query: "womens jeans", target: 60 },
    { category: "women_dresses", department: "women", query: "womens dresses", target: 60 },
    { category: "men_tops", department: "men", query: "mens t-shirts", target: 60 },
    { category: "men_bottoms", department: "men", query: "mens jeans", target: 60 },
    { category: "kids", department: "kids", query: "kids clothing", target: 60 },
  ],
  walmart: [
    { category: "electronics", department: "electronics", query: "electronics", target: 60 },
    { category: "men_clothing", department: "men", query: "mens clothing", target: 60 },
    { category: "women_clothing", department: "women", query: "womens clothing", target: 60 },
    { category: "home_goods", department: "home_goods", query: "home goods", target: 60 },
    { category: "candy", department: "candy_chocolate", query: "candy", target: 60 },
  ],
  target: [
    { category: "electronics", department: "electronics", query: "electronics", target: 60 },
    { category: "men_clothing", department: "men", query: "mens clothing", target: 60 },
    { category: "women_clothing", department: "women", query: "womens clothing", target: 60 },
    { category: "home_goods", department: "home_goods", query: "home decor", target: 60 },
    { category: "candy", department: "candy_chocolate", query: "candy", target: 60 },
  ],
  footlocker: [
    { category: "men_shoes", department: "men", query: "mens shoes", target: 60 },
    { category: "women_shoes", department: "women", query: "womens shoes", target: 60 },
    { category: "kids_shoes", department: "kids", query: "kids shoes", target: 60 },
  ],
  /* THE THREE BEAUTY STORES. Quotas are written and ready; none of them
     has a verified Apify actor yet (see the TO FINISH THE INTEGRATION
     note in netlify/functions/apify-scrape-start.js), so the refresh
     script skips any store whose scraper is not wired up rather than
     starting runs against a guess. The day an actor ID lands, the depth
     is already specified. */
  victoriassecret: [
    { category: "lingerie", query: "bras", target: 60 },
    { category: "sleepwear", query: "pajamas", target: 60 },
    { category: "body_care", query: "body mist", target: 60 },
    { category: "fragrance", query: "perfume", target: 60 },
  ],
  bathandbodyworks: [
    { category: "body_care", query: "body lotion", target: 60 },
    { category: "fragrance", query: "fine fragrance mist", target: 60 },
    { category: "candles", query: "3-wick candle", target: 60 },
    { category: "hand_soap", query: "hand soap", target: 60 },
  ],
  /* DSW (Issue #443, c.6323171170 + c.6323202929). A one-time catalogue
     PULL, not a refresh-tier store: scripts/build-dsw-catalog.mjs reads
     these, prints the estimated cost, and spends nothing without
     --confirm-spend. Danny's order: best sellers plus ALL sale and
     clearance first, then the category depth.

     `phase: 1` runs first and is never skipped by the spend stop; a
     `target: "all"` quota asks for the whole listing up to the pull's
     sale ceiling (DSW_SALE_MAX in scripts/lib/dsw.js), because "all
     sale" is the order and a fixed 60 would silently cut it.

     ACTOR AND LISTINGS VERIFIED (Lucifer, #443, 2026-10-22):
     apify/e-commerce-scraping-tool, and the six listing URLs below were
     opened live on dsw.com with their result counts (`listed`). There
     is no separate sale listing: /category/sale is a 404 and
     /category/clearance IS DSW's sale surface. Bags live under
     /category/accessories (non-bag accessories there are dropped at
     ingest, see `scope`). The keyword `query` is kept only for the
     site path's fallback. Targets are depth caps per run; products seen
     in two listings are paid twice and kept once (ingest dedupe). */
  dsw: [
    { category: "clearance", phase: 1, saleOnly: true, department: "clearance", url: "https://www.dsw.com/category/clearance", listed: 5812, query: "clearance shoes", target: "all" },
    { category: "bestsellers", phase: 1, department: "bestsellers", url: "https://www.dsw.com/category/womens/top-rated", listed: 4035, query: "best sellers shoes", target: 4100 },
    { category: "women", phase: 2, department: "women", url: "https://www.dsw.com/category/womens", query: "womens shoes", target: 3000, gender: "women" },
    { category: "men", phase: 2, department: "men", url: "https://www.dsw.com/category/mens", query: "mens shoes", target: 2000, gender: "men" },
    { category: "kids", phase: 2, department: "kids", url: "https://www.dsw.com/category/kids", query: "kids shoes", target: 1500, gender: "kids" },
    { category: "bags", phase: 2, department: "bags", url: "https://www.dsw.com/category/accessories", listed: 2389, query: "handbags", target: 2400, scope: "bags" },
  ],
};

/** The quotas for one store, or an empty list. */
export function quotasFor(retailer) {
  return CATALOG_QUOTAS[String(retailer || "").toLowerCase()] || [];
}

/** What a store's catalogue should hold once every quota is filled. */
export function targetDepth(retailer) {
  return quotasFor(retailer).reduce((n, q) => n + (Number(q.target) || 0), 0);
}

/**
 * How many actor runs a refresh of these stores costs.
 *
 * This is what the budget guard projects from, so it must count the runs
 * that will really be started — quotas belonging to stores with no
 * scraper wired up are not among them.
 */
export function plannedRuns(retailers) {
  return (Array.isArray(retailers) ? retailers : []).reduce((n, r) => n + quotasFor(r).length, 0);
}

/** True when a store has enough cached stock to present as a storefront. */
export function isHonestStorefront(count) {
  return Number(count) >= MIN_HONEST_STOREFRONT;
}
