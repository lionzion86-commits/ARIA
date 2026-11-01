// The feedback inbox for the admin (Más -> Feedback): every message,
// newest first, and the stores shoppers ask for, most asked first.
// Auth-gated like admin-orders-list.js: a real session on ADMIN_EMAILS.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { listFeedback, FEEDBACK_STORE } from "./_feedback.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  const email = await getSessionEmail(event);
  if (!isAdmin(email)) return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  try {
    return { statusCode: 200, headers, body: JSON.stringify(await listFeedback(getStore(FEEDBACK_STORE))) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
}
