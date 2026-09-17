// Secure middleman for a real USD/PEN exchange rate — replaces the old
// hardcoded 3.8 rate that used to sit in checkout.html. Source: SUNAT
// (Peru's own tax authority), via the free public api.apis.net.pe proxy —
// no API key required, no secret to configure. Returns real compra
// (buy) and venta (sell) rates; checkout.html uses venta to compute the
// actual soles amount charged, and shows both with plain-language labels
// so the customer understands which one applies to them.
export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    // Client also caches this for 24h (localStorage) — this header lets
    // any intermediate cache (browser/CDN) do the same without a repeat
    // round trip, and keeps us well clear of apis.net.pe's own rate limit
    // (confirmed via a real test call: it 429s on rapid repeated hits).
    "Cache-Control": "public, max-age=86400",
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

  try {
    const res = await fetch("https://api.apis.net.pe/v1/tipo-cambio-sunat", {
      headers: { Accept: "application/json" },
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
          error: `Exchange rate source returned a non-JSON response (HTTP ${res.status})`,
          bodySnippet: rawBody.slice(0, 300),
        }),
      };
    }

    if (!res.ok || typeof data.compra !== "number" || typeof data.venta !== "number") {
      return {
        statusCode: res.ok ? 502 : res.status,
        headers,
        body: JSON.stringify({ error: "Exchange rate source did not return valid compra/venta rates" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        compra: data.compra,
        venta: data.venta,
        fecha: data.fecha || null,
        origen: data.origen || "SUNAT",
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
