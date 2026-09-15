// Secure middleman between ariashop.pe and Apify's retailer scraper Actors.
// Each Actor has its own input schema, so `buildInput` maps our generic
// { retailer, query } request to whatever that specific Actor expects.
//
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
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "US" },
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
    actorId: "scrapers_lat/target-scraper",
    buildInput: (query, maxItems) => ({
      searchQuery: query,
      maxResults: maxItems,
    }),
  },
  nordstrom: {
    actorId: "moving_beacon-owner1/nordstrom-search-scraper",
    buildInput: (query) => ({
      searchUrls: [`https://www.nordstrom.com/sr?keyword=${encodeURIComponent(query)}`],
      maxPagesPerUrl: 1,
    }),
  },
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

    const runResponse = await fetch(
      `https://api.apify.com/v2/actors/${actorPath}/run-sync-get-dataset-items?timeout=90`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.APIFY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(actorInput),
      }
    );

    const items = await runResponse.json();

    if (!runResponse.ok) {
      return {
        statusCode: runResponse.status,
        headers,
        body: JSON.stringify({ error: items?.error?.message || "Apify Actor run failed" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ retailer, items }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
