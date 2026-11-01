// /.netlify/functions/agent-queue -- a comprador's day (#443 agent dashboard).
// Gated on the real session: an invited, active `agent` sees only her own
// queue and history; an admin sees the day; anyone else gets 401/403.
//
//   GET                -> the queue. SAMPLE orders on deploy previews and
//                         localhost only; on the production domain an empty
//                         queue until Phase 2 (see _agent-auth.js).
//   POST { events }    -> the phone's outbox (completions, exceptions,
//                         clock-out) once it has signal again; kept once
//                         per event id in the "agent-events" store.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, queueResponse, acceptEvents, hostOf } from "./_agent-auth.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, POST, OPTIONS"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    const users = getStore("users");
    const ctx = await callerRole(event, { users });
    if (event.httpMethod === "GET") {
      const { status, body } = await queueResponse(ctx, { users, settings: getStore("agent-settings"), host: hostOf(event) });
      return { statusCode: status, headers, body: JSON.stringify(body) };
    }
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    const r = await acceptEvents(ctx, body, { events: getStore("agent-events") });
    return { statusCode: r.status, headers, body: JSON.stringify(r.body) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
