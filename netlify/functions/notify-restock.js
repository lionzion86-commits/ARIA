// Avísame cuando vuelva (#443 c.6585537098): a shopper asks to hear when a
// sold-out («Vuelve pronto») product is back, or its page counts an open.
// The rules live in _restock.js; this is the HTTP door. The signed-in
// account is read from the session cookie here, never from the body.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { clientIp } from "./_feedback.js";
import { receiveRestock, RESTOCK_STORE } from "./_restock.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  if (String(event.body || "").length > 4000) return { statusCode: 413, headers, body: JSON.stringify({ error: "Solicitud demasiado grande." }) };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "No pudimos leer tu pedido." }) }; }
  try {
    const accountEmail = body && body.action === "notify" ? await getSessionEmail(event) : null;
    const out = await receiveRestock({ body, ip: clientIp(event.headers || {}), store: getStore(RESTOCK_STORE), accountEmail });
    return { statusCode: out.status, headers, body: JSON.stringify(out.body) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos guardar tu pedido. Inténtalo de nuevo en un momento." }) };
  }
}
