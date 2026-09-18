// Lists real orders (from orders-create.js) for the admin margin-test
// view. Auth-gated: a real logged-in session (getSessionEmail) whose
// email is on ADMIN_EMAILS (isAdmin) — never trust a client-claimed
// email. "count:*" keys are orders-create.js's daily counters, not real
// orders — filtered out here.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";

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
  if (!isAdmin(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  try {
    const ordersStore = getStore("orders");
    const { blobs } = await ordersStore.list();
    const orderKeys = blobs.map((b) => b.key).filter((k) => !k.startsWith("count:"));
    const orders = await Promise.all(orderKeys.map((k) => ordersStore.get(k, { type: "json" })));
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { statusCode: 200, headers, body: JSON.stringify({ orders }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
