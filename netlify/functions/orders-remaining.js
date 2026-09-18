// Public, no auth — the "quedan X cupos hoy" counter needs to be visible
// to every shopper, logged in or not. Reads the same settings/orders Blob
// stores orders-create.js writes to.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { peruDateKey, normalizeBatchHour, DEFAULT_BATCH_HOUR } from "./_peru-time.js";

const DEFAULT_SETTINGS = { paused: false, dailyCap: 40, batchHour: DEFAULT_BATCH_HOUR };

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const settings = (await getStore("settings").get("global", { type: "json" })) || DEFAULT_SETTINGS;
    // Peru-day key, not UTC — see _peru-time.js.
    const counter = (await getStore("orders").get(`count:${peruDateKey()}`, { type: "json" })) || { count: 0 };
    const remaining = Math.max(0, settings.dailyCap - counter.count);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        remaining,
        cap: settings.dailyCap,
        paused: Boolean(settings.paused),
        batchHour: normalizeBatchHour(settings.batchHour),
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
