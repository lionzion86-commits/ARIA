// Danny's Familia list (#443 c.6364959264): who buys at cost. Admin-gated
// like every admin-* function (a real session AND an ADMIN_EMAILS email).
//
//   GET                              -> { familia: [email, ...] }
//   POST { email, familia: true }    -> add
//   POST { email, familia: false }   -> remove
//
// The flag only goes on an account that exists: the price is the
// account's, so there has to be an account to carry it.
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail, isAdmin, normalizeEmail } from "./_auth-helpers.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const caller = await getSessionEmail(event);
  if (!caller) return { statusCode: 401, headers, body: JSON.stringify({ error: "Autenticación requerida" }) };
  if (!isAdmin(caller)) return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };

  const users = getStore("users");
  try {
    if (event.httpMethod === "GET") {
      const { blobs } = await users.list();
      const recs = await Promise.all(blobs.map((b) => users.get(b.key, { type: "json" }).catch(() => null)));
      const familia = recs.filter((u) => u && u.familia === true).map((u) => u.email).sort();
      return { statusCode: 200, headers, body: JSON.stringify({ familia }) };
    }
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    const email = normalizeEmail(body.email);
    if (!email || typeof body.familia !== "boolean") return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan el correo o familia: true/false" }) };
    const u = await users.get(email, { type: "json" });
    if (!u) return { statusCode: 404, headers, body: JSON.stringify({ error: "No hay una cuenta con ese correo. Primero tiene que crearla." }) };
    const next = { ...u, familia: body.familia, familiaAt: new Date().toISOString(), familiaBy: caller };
    if (!body.familia) delete next.familia;
    await users.setJSON(email, next);
    return { statusCode: 200, headers, body: JSON.stringify({ email, familia: body.familia }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
