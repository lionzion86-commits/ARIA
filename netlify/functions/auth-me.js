// Checked once on every page load so a session survives a reload — see
// initAuth() in index.html. Returns { email: null } (never an error
// status) for "not logged in", since that's a completely normal state,
// not a failure.
import { getStore, connectLambda } from "@netlify/blobs";
import { parseCookies, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, clearSessionCookieHeader, corsHeaders, isAdmin } from "./_auth-helpers.js";

export async function handler(event) {
  connectLambda(event); // wires up the Blobs environment context for this classic-style function
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const cookies = parseCookies(event.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return { statusCode: 200, headers, body: JSON.stringify({ email: null, isAdmin: false }) };
  }

  try {
    const sessions = getStore("sessions");
    const session = await sessions.get(sessionId, { type: "json" });
    const ageSeconds = session ? (Date.now() - new Date(session.createdAt).getTime()) / 1000 : Infinity;

    if (!session || ageSeconds > SESSION_TTL_SECONDS) {
      if (session) await sessions.delete(sessionId); // expired — clean it up
      return {
        statusCode: 200,
        headers: { ...headers, "Set-Cookie": clearSessionCookieHeader() },
        body: JSON.stringify({ email: null, isAdmin: false }),
      };
    }

    // isAdmin is returned so the client can skip admin-only requests it
    // would only be refused for (see publishSalesCache in index.html).
    // Purely a UI hint — every admin endpoint re-checks server-side and
    // never trusts this value.
    return { statusCode: 200, headers, body: JSON.stringify({ email: session.email, isAdmin: isAdmin(session.email) }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
