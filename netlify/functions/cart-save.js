// Overwrites the logged-in user's server-stored cart with whatever the
// client currently has (the client is the source of truth for cart
// contents — this is just the sync target, not a merge point; merging
// only happens once, client-side at login, see mergeCarts() in
// index.html).
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, corsHeaders } from "./_auth-helpers.js";

const MAX_CART_ITEMS = 100; // sanity cap — never trust an unbounded client payload

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = await getSessionEmail(event);
  if (!email) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "No autenticado" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const cart = Array.isArray(body.cart) ? body.cart.slice(0, MAX_CART_ITEMS) : [];

  try {
    const carts = getStore("carts");
    await carts.setJSON(email, { cart, updatedAt: new Date().toISOString() });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
