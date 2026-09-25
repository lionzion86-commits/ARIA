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
// Exported (alongside BRAND_CONFIG below) so refresh-department-cache.js
// can import the exact same department/brand keys rather than
// hand-duplicating this list and risking drift.
import { connectLambda } from "@netlify/blobs";
import { retailerFor } from "../../scripts/lib/retailers.js";
import {
  readOndemandCache, recordOndemandRun, acquireOndemandLease, ondemandInFlight,
  ondemandUserKey, MAX_CONCURRENT_PER_USER,
} from "./_ondemand.js";

export const DEPARTMENT_CONFIG = {
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

    // Walmart and Target are universal retailers, so they belong in Moda
    // Hombre / Mujer / Niños alongside Old Navy and Foot Locker — not
    // just in the generic "clothing" tile.
    //
    // `men` REUSES the already REAL-TEST CONFIRMED mens-clothing browse
    // URL above (the "clothing" entry is in fact men's-only — a latent
    // mislabel, kept as-is so the existing tile does not change).
    //
    // NOT TEST CONFIRMED: `women` and `kids` use the actor's keyword
    // mechanism rather than a browse URL. Walmart's /browse/ URLs need
    // exact numeric category IDs, and inventing one yields either zero
    // results or a CATEGORY_LANDING_PAGE error — so a real ID has to come
    // from a real run, not from guesswork. A keyword needs no ID and
    // degrades to "fewer results", never to a hard error. Swap in a
    // confirmed categoryUrl once one has been verified by a real run.
    men:              { categoryUrl: "https://www.walmart.com/browse/clothing/mens-clothing/5438_133197_7185501" },
    women:            { searchQuery: "womens clothing" },
    kids:             { searchQuery: "kids clothing" },
  },
  target: {
    electronics:      { startUrl: "https://www.target.com/c/electronics/-/N-5xtg6" },
    clothing:         { startUrl: "https://www.target.com/c/men/-/N-18y1l" },
    candy_chocolate:  { startUrl: "https://www.target.com/c/chocolate-candy-grocery/candy-bars/-/N-5xt0bZh20t5" },
    sporting_goods:   { startUrl: "https://www.target.com/c/sports-equipment-outdoors/-/N-5xt52" },
    home_goods:       { startUrl: "https://www.target.com/c/bedding-home-decor/-/N-5xtv4" },

    // Same reasoning as Walmart above. `men` reuses the REAL-TEST
    // CONFIRMED /c/men/ start URL (which "clothing" also points at).
    // NOT TEST CONFIRMED: `women` and `kids` go through the keyword
    // mechanism — Target's /c/<slug>/-/N-<code> URLs need the exact
    // N-code, and a wrong one returns nothing at all.
    men:              { startUrl: "https://www.target.com/c/men/-/N-18y1l" },
    women:            { searchQuery: "womens clothing" },
    kids:             { searchQuery: "kids clothing" },
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
    kids:  { searchQuery: "shirts", department: "Boys" },   // paired with kids_girls below in the refresh script
    // Not a real standalone department — `internal: true` means
    // refresh-department-cache.js fetches it and merges it into the
    // "kids" cache bucket alongside Boys, but no frontend nav tile
    // points at "kids_girls" directly.
    kids_girls: { searchQuery: "shirts", department: "Girls", internal: true },
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
export const BRAND_CONFIG = {
  target: {
    // REAL-TEST CONFIRMED NULL (2026-09-17): Target does not carry Nike.
    // The old startUrl (a stale category facet ID) doesn't 404 — worse,
    // it silently resolves to a generic shoes page (Reebok/Universal
    // Thread/etc, zero Nike items). Three separate real keyword searches
    // ("nike shoes", "nike", "jordan") against this exact actor also
    // returned zero Nike-branded items. Matches Nike's real-world 2005
    // split from Target's wholesale channel — not a scraper bug. Left
    // unset so brand="nike" falls back to a plain keyword search per the
    // plan's fallback rule, same as Walmart's no-brand-mode case.
  },
  footlocker: {
    // browseByBrand mode is actor-confirmed; "Nike" real-test confirmed
    // 2026-09-17. The rest use the same mode — counts are verified
    // empirically per run (empty result = wrong brand string, not a
    // broken mode).
    nike: { brand: "Nike" },
    jordan: { brand: "Jordan" },
    adidas: { brand: "Adidas" },
    puma: { brand: "Puma" },
    newbalance: { brand: "New Balance" },
    reebok: { brand: "Reebok" },
  },
  // walmart: no dedicated brand-mode confirmed on this actor — brand
  // search there stays a plain keyword search using the brand name itself.
};

/* ============================================================
   REUSABLE ACTOR INPUT SHAPES (2026-09-20)

   Every retailer below used to need a hand-written buildInput, which made
   "add a store" a code change even when the actor wanted nothing more
   exotic than a keyword and a limit. Most Apify scrapers take exactly
   that, in one of a handful of field spellings — so those spellings are
   named here and a new retailer can say `inputShape: "searchQuery"` and
   be done. Bespoke buildInput is still there for the four stores that do
   real category/brand browsing, which genuinely needs code.

   The shape receives (query, maxItems) and returns the actor's input
   object. Add a spelling here rather than a new buildInput whenever a new
   actor turns out to want one.
   ============================================================ */
export const INPUT_SHAPES = {
  searchQuery: (query, maxItems) => ({ searchQuery: query, maxItems }),
  searchQueries: (query, maxItems) => ({ searchQueries: [query], maxItems }),
  query: (query, maxItems) => ({ query, maxItems }),
  keywords: (query, maxItems) => ({ keywords: [query], maxResults: maxItems }),
  targets: (query, maxItems) => ({ targets: [query], maxResults: maxItems }),
  searchTerm: (query, maxItems) => ({ searchTerm: query, maxItems }),
};

/* The scrape mode auto-parts sources run in. "detail" is what returns a
   product's compatibility list; "overview" is what the cache was built
   with and carries none. See the note on autozone below. */
const AUTO_SCRAPE_MODE = process.env.AUTO_SCRAPE_MODE || "detail";

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
      // A department entry carries either a real browse URL or, where no
      // confirmed category ID exists yet, a keyword. `targets` accepts
      // both, so either kind resolves to a real run.
      const target = dept ? (dept.categoryUrl || dept.searchQuery) : query;
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
      // startUrl where a confirmed category URL exists; otherwise the
      // department falls back to its keyword (see DEPARTMENT_CONFIG).
      if (dept?.startUrl) return { startUrls: [{ url: dept.startUrl }], maxItems };
      if (dept?.searchQuery) return { searchQueries: [dept.searchQuery], maxItems };
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
    /* SCRAPE MODE DECIDES WHETHER ARIA AUTO WORKS AT ALL (2026-09-20).

       Aria Auto's whole contract is "confirmed fit or an honest empty
       state" (see scripts/lib/fitment.js), and a confirmed fit needs the
       product's compatibility list — "fits Hyundai Sonata, Hyundai
       Tucson, Kia K5, Kia Sportage 2020-2024". An audit of all 9,285
       cached items found ZERO of those: every one was scraped in
       "overview" mode, which returns description: null, features: [] and
       a two-key specs object. The lists live on the product detail page.

       So auto searches ask for the detail mode. AUTO_SCRAPE_MODE is the
       one place to change it, because the mode name is the only thing
       here that is unverified — apify.com is unreachable from the build
       environment, so it could not be confirmed against the actor's
       schema. If a refresh comes back with no compatibility lists, this
       string is the first thing to check, and the honest empty state is
       what shoppers see meanwhile rather than a wrong answer. */
    buildInput: (query, maxItems) => ({
      keywords: [query],
      scrapeMode: AUTO_SCRAPE_MODE,
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
  /* SEPHORA AND VICTORIA'S SECRET (2026-09-20).

     Both are mandatory retailers and both are already real rows in
     scripts/lib/retailers.js — they show on Tiendas, they carry their own
     brand treatment, and the beauty weight estimator was written for
     their catalogues. What is missing is the one fact that can only come
     from outside: a verified Apify actor ID. apify.com is not reachable
     from this build environment, and a guessed actor ID does not fail
     loudly — it completes with zero items, which reads to everyone
     downstream as "this store has no products".

     So they are left null, deliberately, and the handler below turns that
     into an explicit, named error instead of a silent empty result.

     TO FINISH THE INTEGRATION — no new code, two edits:
       1. Pick an actor from https://apify.com/store (search "sephora" /
          "victoria's secret"), run it once by hand to confirm it returns
          real titles and prices, then replace the null with:
             { actorId: "<owner>/<actor>", inputShape: "searchQuery" }
          picking whichever INPUT_SHAPES spelling that actor's schema uses
          (its docs name the field). If it wants something not listed
          there, add the spelling to INPUT_SHAPES rather than writing a
          bespoke buildInput.
       2. Flip `search: true` on the store's row in
          scripts/lib/retailers.js (and its index.html mirror).
     Add a DEPARTMENT_CONFIG block only if the actor supports real
     category browsing; without one, the store answers keyword searches,
     which is enough to launch on. */
  sephora: null,
  victoriassecret: null,
};

const DEFAULT_MAX_ITEMS = 20;

export async function handler(event) {
  connectLambda(event);
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
    const { retailer, query, maxItems, department, brand, onDemand } = JSON.parse(event.body || "{}");

    const config = RETAILER_CONFIG[retailer];
    if (!config) {
      /* Tell the two cases apart. A store we know but have not wired a
         scraper for yet is a pending integration, not a typo, and saying
         so is the difference between an operator fixing it in two lines
         and an operator hunting for a bug that is not there. */
      const known = retailerFor(retailer);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: known
            ? `Retailer "${retailer}" (${known.label}) has no Apify actor configured yet — see the TO FINISH THE INTEGRATION note in apify-scrape-start.js.`
            : `Unsupported or unconfigured retailer: "${retailer}". Supported: ${Object.keys(RETAILER_CONFIG)
                .filter((k) => RETAILER_CONFIG[k])
                .join(", ")}`,
          pendingIntegration: Boolean(known),
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

    /* The per-run ceiling. Raised from 50 to 60 with the catalog quota
       model (scripts/lib/catalog-quotas.js): rows per run are the
       cheapest depth there is — one run returning 60 costs the same as
       one returning 24 — and 24 is what made an eight-product
       storefront. Still a hard cap: an unbounded maxItems is an
       unbounded bill.
       2026-09-25: two ceilings. On-demand shopper searches keep 60 (the
       abuse guard — a visitor can trigger these). Config-driven catalog
       browses (a real department/brand entry) get 200, because the
       refresh scripts declare their own per-retailer depth and the
       function was silently truncating it. */
    const isOnDemandCall = onDemand === true && !hasDepartment && !hasBrand;
    const maxItemsCap = isOnDemandCall ? 60 : 200;
    const cappedMaxItems = Math.min(Math.max(Number(maxItems) || DEFAULT_MAX_ITEMS, 1), maxItemsCap);

    /* ON-DEMAND STORE SEARCH (2026-09-20).

       A shopper asked us to go and look in one store, right now, for one
       query. That is a real Apify run and it costs real money, so two
       things happen before one is started — and both happen HERE rather
       than in the browser, because a guard the client can skip is not a
       guard.

       1. THE SHARED CACHE. A query another shopper already paid for
          comes straight back, no run, no lease, no spend. The cache is
          written by apify-scrape-status from Apify's own response, under
          the key recorded below, so nothing a browser says can enter it.

       2. THE SPEND CAP. Two runs in flight per user. The lease is
          released when the run finishes (or expires on its own if the
          browser is closed mid-poll — see LEASE_TTL_MS). */
    const isOnDemand = isOnDemandCall;
    let userKey = null;
    if (isOnDemand) {
      const cached = await readOndemandCache(retailer, query);
      if (cached) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            retailer, cached: true, items: cached.items,
            generatedAt: cached.generatedAt,
          }),
        };
      }

      /* CHECKED BEFORE THE RUN, CLAIMED AFTER IT. The check has to come
         first or the money is already spent by the time we refuse; the
         claim has to come second because a lease is keyed on the runId,
         which does not exist yet. The gap between them is the race the
         module header documents — worth cents, not worth a second
         storage primitive. */
      userKey = await ondemandUserKey(event);
      const inFlight = await ondemandInFlight(userKey);
      if (inFlight >= MAX_CONCURRENT_PER_USER) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({
            error: `Ya tienes ${inFlight} búsqueda${inFlight === 1 ? "" : "s"} en curso. Espera a que termine antes de pedir otra.`,
            limit: MAX_CONCURRENT_PER_USER,
            inFlight,
            rateLimited: true,
          }),
        };
      }
    }

    /* A config gives EITHER a bespoke buildInput (the stores that do real
       category/brand browsing) OR the name of a shared input shape. The
       second path is what makes adding a store data entry rather than
       code — see INPUT_SHAPES above. */
    const shape = !config.buildInput && config.inputShape ? INPUT_SHAPES[config.inputShape] : null;
    if (!config.buildInput && !shape) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Retailer "${retailer}" declares inputShape "${config.inputShape}", which is not one of: ${Object.keys(INPUT_SHAPES).join(", ")}`,
        }),
      };
    }
    const actorInput = config.buildInput
      ? config.buildInput((query || "").trim(), cappedMaxItems, department, brand)
      : shape((query || "").trim(), cappedMaxItems);
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

    const runId = runData.data.id;

    /* Record what this run IS, at the one point in the system that knows
       for certain: the server just built the actor input from these
       values. apify-scrape-status reads this back to decide where the
       results belong, which is what keeps the cache un-poisonable. The
       lease is re-keyed onto the real runId so the status call can
       release exactly this run's slot. */
    if (isOnDemand) {
      await recordOndemandRun(runId, { retailer, query: (query || "").trim(), userKey });
      await acquireOndemandLease(userKey, runId);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ retailer, runId }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
