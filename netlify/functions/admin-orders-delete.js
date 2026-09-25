// Deletes one order record (test orders, duplicates) from the "orders"
// blob store. Auth-gated: a real logged-in session (getSessionEmail)
// whose email is on ADMIN_EMAILS (isAdmin) — the same boundary as the
// other admin-orders-* functions. The frontend's two-tap confirm is the
// courtesy; this function is the boundary. No bulk delete: one call
// removes exactly one order.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";

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
  if (!isAdmin(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  // The blob key IS the orderId (orders-create.js stores with
  // ordersStore.setJSON(orderId, order)).
  const orderId = String(body.orderId || "").trim();
  if (!orderId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el pedido" }) };
  }

  try {
    const ordersStore = getStore("orders");
    const order = await ordersStore.get(orderId, { type: "json" });
    if (!order) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Pedido no encontrado" }) };
    }
    await ordersStore.delete(orderId);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, orderId }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
