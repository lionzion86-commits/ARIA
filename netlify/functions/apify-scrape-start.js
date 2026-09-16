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
    buildInput: (query, maxItems) => ({
      targets: [query],
      maxResults: maxItems,
    }),
  },
  target: {
    // Switched from scrapers_lat/target-scraper: real test runs against it
    // came back with 0 items even for common search terms (e.g. "phone
    // charger") regardless of zip. This one defaults to Target's online
    // catalog store rather than requiring a specific local store to match.
    actorId: "rigelbytes/target-scraper",
    buildInput: (query, maxItems) => ({
      searchQueries: [query],
      maxItems,
    }),
  },
  oldnavy: {
    // Covers Gap, Gap Factory, Old Navy, and Banana Republic/Athleta via
    // the `brand` field — "on" targets Old Navy specifically. No proxy
    // required per the Actor's docs (public search API, datacenter IPs).
    actorId: "crawlerbros/gap-inc-scraper",
    buildInput: (query, maxItems) => ({
      brand: "on",
      searchQuery: query,
      maxItems,
    }),
  },
  footlocker: {
    // No proxy mandatory per the Actor's docs.
    actorId: "crawlerbros/footlocker-product-scraper",
    buildInput: (query, maxItems) => ({
      mode: "search",
      searchQuery: query,
      maxItems,
    }),
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
    buildInput: (query, maxItems, extra) => ({
      keywords: [query],
      scrapeMode: extra?.scrapeMode || "overview",
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
    const { retailer, query, maxItems, _testExtra } = JSON.parse(event.body || "{}");

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

    if (typeof query !== "string" || !query.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "query is required" }),
      };
    }

    const cappedMaxItems = Math.min(Math.max(Number(maxItems) || DEFAULT_MAX_ITEMS, 1), 50);
    const actorInput = config.buildInput(query.trim(), cappedMaxItems, _testExtra);
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
