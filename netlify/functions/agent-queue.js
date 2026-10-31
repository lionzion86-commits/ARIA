// GET /.netlify/functions/agent-queue -- a comprador's queue for the day
// (#443 agent dashboard). Gated on a real session: an invited, active
// `agent` sees only her own queue and history; an admin sees the day;
// anyone else gets 401/403. Phase 1 serves the SAMPLE batch (see
// _agent-auth.js); nothing here reads or writes real orders yet.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, queueResponse } from "./_agent-auth.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, OPTIONS"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const users = getStore("users");
    const ctx = await callerRole(event, { users });
    const { status, body } = await queueResponse(ctx, { users });
    return { statusCode: status, headers, body: JSON.stringify(body) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
