// Secure middleman between ariashop.pe and the O'Reilly Auto Parts API on
// parse.bot. All calls to this function are POST with a JSON
// { action, ...params } body — internally it dispatches to whichever
// HTTP method and param shape that specific parse.bot endpoint actually
// requires (most are GET/query-string, get_product_price_availability is
// POST/JSON body), so the client doesn't need to care about that split.
//
// Canonical scraper ID and endpoint shapes verified against parse.bot's own
// O'Reilly Auto Parts marketplace listing docs as of writing.
const CANONICAL_SCRAPER_ID = "cec18493-73b6-4781-a16c-2d0cfd6e9bd6";

const ENDPOINTS = {
  search_products: { method: "GET", params: ["query", "zip_code"] },
  get_product_details: { method: "GET", params: ["url"] },
  get_vehicle_years: { method: "GET", params: [] },
  get_vehicle_makes: { method: "GET", params: ["year"] },
  get_vehicle_models: { method: "GET", params: ["year", "make_id"] },
  find_stores: { method: "GET", params: ["city", "state"] },
  get_product_price_availability: { method: "POST", params: ["parts", "store_id"] },
};

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
    const { action, ...params } = JSON.parse(event.body || "{}");
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

    let url = `https://api.parse.bot/scraper/${CANONICAL_SCRAPER_ID}/${action}`;
    const fetchOptions = { headers: { "X-API-Key": process.env.PARSE_API_KEY } };

    if (endpoint.method === "GET") {
      const qs = new URLSearchParams();
      for (const p of endpoint.params) {
        if (params[p] != null) qs.set(p, params[p]);
      }
      if ([...qs].length) url += "?" + qs.toString();
    } else {
      fetchOptions.method = "POST";
      fetchOptions.headers["Content-Type"] = "application/json";
      const body = {};
      for (const p of endpoint.params) {
        if (params[p] != null) body[p] = params[p];
      }
      fetchOptions.body = JSON.stringify(body);
    }

    const res = await fetch(url, fetchOptions);
    const rawBody = await res.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: `O'Reilly API returned a non-JSON response (HTTP ${res.status})`,
          bodySnippet: rawBody.slice(0, 300),
        }),
      };
    }

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data?.error || "O'Reilly Auto Parts request failed" }),
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
