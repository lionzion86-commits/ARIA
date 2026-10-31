// Danny's compradores admin (#443 agent dashboard). Admin-gated like every
// admin-* function: a real session AND an ADMIN_EMAILS email. Agents
// never reach it.
//
//   GET                                  -> { logins, board, accounts, exceptions } (board is the SAMPLE day in Phase 1)
//   POST { email, agent: true }          -> invite: the account becomes a comprador
//   POST { email, active: false }        -> deactivate, effective on her next request
//   POST { email, active: true }         -> reactivate
//   POST { email, agent: false }         -> remove the role
//   POST { linkCheck: url }              -> the link-health guard's server hook: classify, then
//                                           follow redirects by hand (404 / homepage / search = "Link caído")
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, boardResponse, setAgent } from "./_agent-auth.js";
import { checkLinkHealth, LINK_REASON_LABELS } from "../../assets/agent/agent-core.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, POST, OPTIONS"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    const users = getStore("users");
    const ctx = await callerRole(event, { users });
    if (event.httpMethod === "GET") {
      const { status, body } = await boardResponse(ctx, { users });
      return { statusCode: status, headers, body: JSON.stringify(body) };
    }
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    if (!ctx.email) return { statusCode: 401, headers, body: JSON.stringify({ error: "Inicia sesión" }) };
    if (ctx.role !== "admin") return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    if (typeof body.linkCheck === "string") {
      const r = await checkLinkHealth(body.linkCheck, (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(8000) }));
      return { statusCode: 200, headers, body: JSON.stringify({ ...r, label: r.ok ? null : (LINK_REASON_LABELS[r.reason] || r.reason) }) };
    }
    const r = await setAgent(users, body.email, { agent: body.agent, active: body.active }, ctx.email);
    return { statusCode: r.status, headers, body: JSON.stringify(r.body) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
