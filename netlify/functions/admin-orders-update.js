// Saves the operator's 5 real-world actuals onto an existing order
// record — precio real pagado, peso real facturado, costo real del
// courier, días puerta a puerta, notas. Everything else on the order
// (precio scrapeado, precio cobrado, tipo de cambio, peso estimado,
// flete cobrado) was already captured at order-creation time
// (orders-create.js) — this never overwrites those fields.
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

  const { orderId, actuals } = body;
  if (!orderId || typeof actuals !== "object") {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan datos" }) };
  }

  try {
    const ordersStore = getStore("orders");
    const order = await ordersStore.get(orderId, { type: "json" });
    if (!order) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Pedido no encontrado" }) };
    }

    order.actuals = {
      precioRealPagadoUsd: Number(actuals.precioRealPagadoUsd) || null,
      pesoRealKg: Number(actuals.pesoRealKg) || null,
      costoRealCourierUsd: Number(actuals.costoRealCourierUsd) || null,
      diasPuertaAPuerta: Number(actuals.diasPuertaAPuerta) || null,
      notas: typeof actuals.notas === "string" ? actuals.notas.slice(0, 2000) : "",
      updatedAt: new Date().toISOString(),
      updatedBy: email,
    };

    await ordersStore.setJSON(orderId, order);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
