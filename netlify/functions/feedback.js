// Danos tu feedback (#443 c.6447438497): a guest or a member sends a
// recommendation, advice, an opinion or the US store they want to see.
// The rules live in _feedback.js; this is the HTTP door.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { receiveFeedback, clientIp, FEEDBACK_STORE } from "./_feedback.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "No pudimos leer tu mensaje." }) }; }
  try {
    const out = await receiveFeedback({ body, ip: clientIp(event.headers || {}), store: getStore(FEEDBACK_STORE) });
    return { statusCode: out.status, headers, body: JSON.stringify(out.body) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos guardar tu mensaje. Inténtalo de nuevo en un momento." }) };
  }
}
