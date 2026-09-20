/* Secure middleman between ariashop.pe and the courier's quote API.
 *
 * RENAMED from avi-courier-quote.js (2026-09-20). The endpoint a shopper's
 * browser calls must not name a courier: it shows up in devtools, it
 * would have to be renamed the day a second courier existed, and the
 * customer's freight price does not depend on who carries the box
 * anyway. Which courier actually ships is decided later, in ops, through
 * the ShippingProvider registry (netlify/functions/_shipping/) — not
 * here, and never at checkout.
 *
 * WHAT THIS DOES NOT DO, deliberately: rate shopping. The customer pays
 * the flat published CHARGE_PER_KG whatever our cost turns out to be. A
 * freight price that moves with our supplier negotiations is not a price
 * anyone can plan around, and the whole Precio Honesto argument rests on
 * the number being the same for everybody.
 *
 * KNOWN LIMIT, for whoever adds courier #2: the rescale below derives the
 * customer's freight from THIS courier's cost via CHARGE_PER_KG/COST_PER_KG.
 * That is correct while one courier's economics are the only ones in
 * play. With a second courier on different rates it must become a flat
 * CHARGE_PER_KG x weight calculation that never consults a courier at
 * all. Left as-is today because changing the checkout quote was
 * explicitly out of scope for Phase 1.
 */
import { CHARGE_PER_KG } from "../../weight-data.js";
// Internal cost lives server-side only — see _courier-economics.js.
import { COST_PER_KG } from "./_courier-economics.js";

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

    const quoteResponse = await fetch("https://avi-courier.avicourier.workers.dev/api/v1/cotizar", {
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

    const rawBody = await quoteResponse.text();
    let quoteData;
    try {
      quoteData = JSON.parse(rawBody);
    } catch {
      // AVI Courier returned something that isn't JSON (e.g. a proxy/WAF
      // block page) — surface the real status and a body snippet instead
      // of a generic "not valid JSON" error, so this is actually debuggable.
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: `AVI Courier returned a non-JSON response (HTTP ${quoteResponse.status})`,
          bodySnippet: rawBody.slice(0, 300),
        }),
      };
    }

    if (!quoteResponse.ok) {
      return {
        statusCode: quoteResponse.status,
        headers,
        body: JSON.stringify({ error: quoteData?.error || "AVI Courier quote request failed" }),
      };
    }

    const { total_usd, total_pen, flete_usd } = quoteData;

    // BUG FOUND VIA LIVE TESTING (2026-09-16): AVI's own quote API prices
    // freight at their real internal cost (COST_PER_KG, $9/kg) — it has no
    // concept of our customer-facing markup. Passing flete_usd/total_usd
    // straight through, as this function did before, silently charged
    // every live-quoted customer AVI's raw cost rate instead of
    // CHARGE_PER_KG ($13/kg), violating the pricing rule in weight-data.js.
    // Fixed by rescaling just the freight component to the customer rate,
    // then rebuilding total_usd/total_pen around that — everything else
    // AVI added beyond value+freight (e.g. Peru customs/duties, which
    // scale with declared value, not weight) is preserved unchanged since
    // that's a real cost, not something this markup should touch.
    const markupRatio = CHARGE_PER_KG / COST_PER_KG;
    const customerFleteUsd = Math.round(flete_usd * markupRatio * 100) / 100;
    const extraUsd = total_usd - valorUsd - flete_usd; // taxes/duties AVI already included beyond value+freight
    const customerTotalUsd = Math.round((valorUsd + customerFleteUsd + extraUsd) * 100) / 100;
    const fxRate = total_pen != null && total_usd > 0 ? total_pen / total_usd : null;
    const customerTotalPen = fxRate != null ? Math.round(customerTotalUsd * fxRate * 100) / 100 : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ total_usd: customerTotalUsd, total_pen: customerTotalPen, flete_usd: customerFleteUsd }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
