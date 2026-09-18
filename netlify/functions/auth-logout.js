// Deletes the session server-side (not just clearing the cookie) so a
// stolen/old cookie can't still be used after logout.
import { getStore, connectLambda } from "@netlify/blobs";
import { parseCookies, SESSION_COOKIE_NAME, clearSessionCookieHeader, corsHeaders } from "./_auth-helpers.js";

export async function handler(event) {
  connectLambda(event); // wires up the Blobs environment context for this classic-style function
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const cookies = parseCookies(event.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (sessionId) {
    try {
      await getStore("sessions").delete(sessionId);
    } catch {
      // Best-effort — clearing the cookie below still logs the browser out
      // even if the Blob delete fails.
    }
  }

  return {
    statusCode: 200,
    headers: { ...headers, "Set-Cookie": clearSessionCookieHeader() },
    body: JSON.stringify({ ok: true }),
  };
}
