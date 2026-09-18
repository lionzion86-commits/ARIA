// Returns the logged-in user's server-stored cart (Blobs), or an empty
// cart if not logged in / no cart saved yet — never an error for "no
// cart", since that's the normal state for a new account.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, corsHeaders } from "./_auth-helpers.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = await getSessionEmail(event);
  if (!email) {
    return { statusCode: 200, headers, body: JSON.stringify({ cart: [] }) };
  }

  try {
    const carts = getStore("carts");
    const record = await carts.get(email, { type: "json" });
    return { statusCode: 200, headers, body: JSON.stringify({ cart: Array.isArray(record?.cart) ? record.cart : [] }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
