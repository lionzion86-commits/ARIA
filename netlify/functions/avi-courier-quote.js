// Secure middleman between ariashop.pe and AVI Courier's shipping quote API
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
    const { peso_kg, valor_usd, description } = JSON.parse(event.body || "{}");

    const pesoKg = Number(peso_kg);
    const valorUsd = Number(valor_usd);

    if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "peso_kg must be a positive number" }),
      };
    }
    if (!Number.isFinite(valorUsd) || valorUsd <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "valor_usd must be a positive number" }),
      };
    }
    if (typeof description !== "string" || !description.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "description is required" }),
      };
    }

    const quoteResponse = await fetch("https://avicourier.com/api/v1/cotizar", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AVI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        peso_kg: pesoKg,
        valor_usd: valorUsd,
        description: description.trim(),
      }),
    });

    const quoteData = await quoteResponse.json();

    if (!quoteResponse.ok) {
      return {
        statusCode: quoteResponse.status,
        headers,
        body: JSON.stringify({ error: quoteData?.error || "AVI Courier quote request failed" }),
      };
    }

    const { total_usd, total_pen, flete_usd } = quoteData;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ total_usd, total_pen, flete_usd }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
