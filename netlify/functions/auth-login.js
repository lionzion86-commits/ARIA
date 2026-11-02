// Minimal real email/password login — see _auth-helpers.js. Always
// returns the same generic error on a bad email or bad password (never
// reveals which one was wrong) — standard practice, still simple.
//
// A Key Club account that has not confirmed its email is refused (403,
// needsConfirmation; #443, Danny 2026-11-02) -- see _keyclub.js
// isConfirmed. Said only after the password matched, so it tells a
// stranger nothing. A signed-in member lands in her dashboard
// (redirect: /cuenta.html).
import { getStore, connectLambda } from "@netlify/blobs";
import { verifyPassword, normalizeEmail, sessionCookieHeader, corsHeaders, isAdmin } from "./_auth-helpers.js";
import { randomBytes } from "node:crypto";
import { isConfirmed } from "./_keyclub.js";

const GENERIC = "Correo o contraseña incorrectos";

/** The rules, store-injected. Returns [status, body, sessionId|null]. */
export async function login(stores, body, { now = Date.now() } = {}) {
  const email = normalizeEmail(body && body.email);
  const password = typeof (body && body.password) === "string" ? body.password : "";
  if (!email || !password) return [401, { error: GENERIC }, null];
  const user = await stores.users.get(email, { type: "json" });
  if (!user || !(await verifyPassword(password, user.passwordHash))) return [401, { error: GENERIC }, null];
  if (!isConfirmed(user)) {
    return [403, { error: "Confirma tu correo para entrar. Te enviamos un enlace cuando creaste tu cuenta.", needsConfirmation: true }, null];
  }
  const sessionId = randomBytes(32).toString("hex");
  await stores.sessions.setJSON(sessionId, { email, createdAt: new Date(now).toISOString() });
  return [200, { email, isAdmin: isAdmin(email), redirect: "/cuenta.html" }, sessionId];
}

export async function handler(event) {
  connectLambda(event); // wires up the Blobs environment context for this classic-style function
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  try {
    const [code, out, sessionId] = await login({ users: getStore("users"), sessions: getStore("sessions") }, body);
    return {
      statusCode: code,
      headers: sessionId ? { ...headers, "Set-Cookie": sessionCookieHeader(sessionId) } : headers,
      body: JSON.stringify(out),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
