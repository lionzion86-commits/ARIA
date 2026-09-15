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
  bestbuy: {
    actorId: "mrdoe/bestbuy-product-scraper",
    buildInput: (query, maxItems) => ({
      operation: "search",
      query,
      maxItems,
      // Was apifyProxyGroups: ["RESIDENTIAL"] — that proxy bandwidth, billed
      // separately from the Actor's own ~$1/1,000-results fee, was the real
      // driver behind this costing ~40c/run vs 1-2c for Walmart/Target.
      // Testing DATACENTER since the Actor's docs warn non-US proxies can
      // get geo-redirected (i.e. this may need reverting if results go empty).
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["DATACENTER"], apifyProxyCountry: "US" },
    }),
  },
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
    const { retailer, query, maxItems } = JSON.parse(event.body || "{}");

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
    const actorInput = config.buildInput(query.trim(), cappedMaxItems);
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
