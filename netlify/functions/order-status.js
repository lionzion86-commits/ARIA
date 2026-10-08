/* ============================================================
   "DID MY PAYMENT GO THROUGH?" — for the page Stripe sends the customer
   back to (checkout.html?pagado=ORDER&session_id=cs_...).

   Answers only to someone holding the order's Stripe session id, so an
   order number alone reveals nothing. Read-only: the order turns paid
   in stripe-webhook.js and nowhere else. Because the webhook can land a
   few seconds after the customer does, the session's own payment_status
   is asked of Stripe too, so the page can say "pago recibido" at once
   without this function writing anything.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { retrieveCheckoutSession } from "./_stripe-api.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  connectLambda(event);
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const q = event.queryStringParameters || {};
  const orderId = String(q.order || "").trim();
  const sessionId = String(q.session || "").trim();
  if (!orderId || !sessionId) return json(400, { error: "Falta el pedido o la sesión" });

  const order = await getStore("orders").get(orderId, { type: "json" });
  if (!order || !order.stripeSessionId || order.stripeSessionId !== sessionId) return json(404, { error: "Pedido no encontrado" });

  let stripePaid = null;
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key) {
    try { stripePaid = (await retrieveCheckoutSession(sessionId, key)).payment_status === "paid"; } catch { stripePaid = null; }
  }
  return json(200, {
    orderId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paid: order.paymentStatus === "paid" || stripePaid === true,
    confirmedByWebhook: order.paymentStatus === "paid",
    chargedPen: order.pricePenCharged,
    email: order.customer && order.customer.email ? String(order.customer.email) : null,
  });
}
