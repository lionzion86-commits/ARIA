// Per-item shipping weight for a cart, resolved server side.
//
// checkout.html calls this before quoting: the page must never decide a
// package weight from whatever the cart happened to carry (that is how
// "Peso del paquete: 0.00 kg" shipped). Pure computation — it reads
// nothing, writes nothing, and has no side effects, so it needs no auth;
// it is bounded instead, so it cannot be used as a CPU sink.
import { resolveCartWeights } from "./_weight-resolve.js";

const MAX_ITEMS = 50;
const MAX_TITLE = 300;

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { items } = JSON.parse(event.body || "{}");
    if (!Array.isArray(items) || !items.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "items must be a non-empty array" }) };
    }
    if (items.length > MAX_ITEMS) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `too many items (max ${MAX_ITEMS})` }) };
    }

    const trimmed = items.map((it) => ({
      ...it,
      title: String(it?.title ?? it?.name ?? "").slice(0, MAX_TITLE),
    }));

    return { statusCode: 200, headers, body: JSON.stringify(resolveCartWeights(trimmed)) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
