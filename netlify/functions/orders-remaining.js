// Public, no auth — the "quedan X cupos hoy" counter needs to be visible
// to every shopper, logged in or not. Reads the same settings/orders Blob
// stores orders-create.js writes to.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";

const DEFAULT_SETTINGS = { paused: false, dailyCap: 40 };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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
    const counter = (await getStore("orders").get(`count:${todayKey()}`, { type: "json" })) || { count: 0 };
    const remaining = Math.max(0, settings.dailyCap - counter.count);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ remaining, cap: settings.dailyCap, paused: Boolean(settings.paused) }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
