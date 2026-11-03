// Vuelve pronto, for the admin (#443 c.6585537098): every sold-out product
// shoppers asked about -- who asked (email or WhatsApp, the signed-in
// account when there was one) and how many opened its page -- most asked
// first, so Aria can write back when the store restocks it.
// Auth-gated like admin-orders-list.js: a real session on ADMIN_EMAILS.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { listRestock, RESTOCK_STORE } from "./_restock.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  const email = await getSessionEmail(event);
  if (!isAdmin(email)) return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  try {
    return { statusCode: 200, headers, body: JSON.stringify(await listRestock(getStore(RESTOCK_STORE))) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
}
