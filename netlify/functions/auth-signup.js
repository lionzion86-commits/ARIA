// Minimal real email/password signup. See _auth-helpers.js for the
// storage/hashing/session approach. Deliberately out of scope for this
// pass: email verification, password reset, rate limiting — "minimal"
// per the brief; full member perks come later.
import { getStore, connectLambda } from "@netlify/blobs";
import { hashPassword, normalizeEmail, sessionCookieHeader, corsHeaders, isAdmin } from "./_auth-helpers.js";
import { randomBytes } from "node:crypto";

export async function handler(event) {
  // Classic (event/context-style) Netlify Functions need this to wire up
  // the ambient Blobs environment context — without it getStore() throws
  // "environment has not been configured" even on a real deploy.
  connectLambda(event);
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

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Correo electrónico inválido" }) };
  }
  if (password.length < 8) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "La contraseña debe tener al menos 8 caracteres" }) };
  }

  try {
    const users = getStore("users");
    const existing = await users.get(email, { type: "json" });
    if (existing) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: "Ya existe una cuenta con este correo" }) };
    }

    const passwordHash = await hashPassword(password);
    await users.setJSON(email, { email, passwordHash, createdAt: new Date().toISOString() });

    const sessionId = randomBytes(32).toString("hex");
    const sessions = getStore("sessions");
    await sessions.setJSON(sessionId, { email, createdAt: new Date().toISOString() });

    return {
      statusCode: 200,
      headers: { ...headers, "Set-Cookie": sessionCookieHeader(sessionId) },
      body: JSON.stringify({ email, isAdmin: isAdmin(email) }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
