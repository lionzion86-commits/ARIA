// Secure middleman between ariashop.pe and the Amayama OEM parts API on
// parse.bot. All Amayama endpoints are simple GET/query-param calls with no
// long-running work, so — unlike the Apify scrapers — this can respond
// synchronously in a single request/response, no start+poll split needed.
//
// Canonical scraper ID and endpoint shapes verified against parse.bot's own
// Amayama marketplace listing docs as of writing.
const CANONICAL_SCRAPER_ID = "292e08e2-9fca-46a2-899c-462f77396869";

// Each entry lists which query-string params are forwarded to parse.bot for
// that endpoint. Add a new endpoint here (e.g. get_frame_catalog,
// list_schema_parts) the same way if a future feature needs it.
const ENDPOINTS = {
  list_brands: { params: [] },
  list_models: { params: ["brand"] },
  list_frames: { params: ["model"] },
  search_parts: { params: ["query", "page"] },
  get_part_detail: { params: ["part_number"] },
  get_part_info: { params: ["part_number"] },
};

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const action = event.queryStringParameters?.action;
  const endpoint = ENDPOINTS[action];
  if (!endpoint) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: `Unsupported action: "${action}". Supported: ${Object.keys(ENDPOINTS).join(", ")}`,
      }),
    };
  }

  try {
    const qs = new URLSearchParams();
    for (const param of endpoint.params) {
      const value = event.queryStringParameters?.[param];
      if (value) qs.set(param, value);
    }

    const url = `https://api.parse.bot/scraper/${CANONICAL_SCRAPER_ID}/${action}${qs.toString() ? "?" + qs.toString() : ""}`;

    const res = await fetch(url, {
      headers: { "X-API-Key": process.env.PARSE_API_KEY },
    });

    const rawBody = await res.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: `Amayama returned a non-JSON response (HTTP ${res.status})`,
          bodySnippet: rawBody.slice(0, 300),
        }),
      };
    }

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data?.error || "Amayama request failed" }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
