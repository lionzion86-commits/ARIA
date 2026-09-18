// Minimal real email/password login — see _auth-helpers.js. Always
// returns the same generic error on a bad email or bad password (never
// reveals which one was wrong) — standard practice, still simple.
import { getStore, connectLambda } from "@netlify/blobs";
import { verifyPassword, normalizeEmail, sessionCookieHeader, corsHeaders } from "./_auth-helpers.js";
import { randomBytes } from "node:crypto";

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

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const genericError = { statusCode: 401, headers, body: JSON.stringify({ error: "Correo o contraseña incorrectos" }) };

  if (!email || !password) return genericError;

  try {
    const users = getStore("users");
    const user = await users.get(email, { type: "json" });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return genericError;
    }

    const sessionId = randomBytes(32).toString("hex");
    const sessions = getStore("sessions");
    await sessions.setJSON(sessionId, { email, createdAt: new Date().toISOString() });

    return {
      statusCode: 200,
      headers: { ...headers, "Set-Cookie": sessionCookieHeader(sessionId) },
      body: JSON.stringify({ email }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
