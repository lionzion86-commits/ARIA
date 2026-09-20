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
    { category: "pharmacy", department: "pharmacy", query: "vitamins", target: 60 },
  ],
  target: [
    { category: "electronics", department: "electronics", query: "electronics", target: 60 },
    { category: "men_clothing", department: "men", query: "mens clothing", target: 60 },
    { category: "women_clothing", department: "women", query: "womens clothing", target: 60 },
    { category: "home_goods", department: "home_goods", query: "home decor", target: 60 },
    { category: "candy", department: "candy_chocolate", query: "candy", target: 60 },
    { category: "pharmacy", department: "pharmacy", query: "vitamins", target: 60 },
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
  sephora: [
    { category: "makeup_face", query: "foundation", target: 60 },
    { category: "makeup_lips", query: "lipstick", target: 60 },
    { category: "makeup_eyes", query: "mascara eyeshadow", target: 60 },
    { category: "skincare", query: "serum moisturizer", target: 60 },
    { category: "fragrance", query: "perfume", target: 60 },
  ],
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
