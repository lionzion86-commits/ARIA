// Shared helpers for the email/password auth functions (auth-signup,
// auth-login, auth-logout, auth-me). Underscore prefix means Netlify does
// NOT deploy this file as its own function endpoint — it's imported by
// the real endpoints below.
//
// Storage: Netlify Blobs (getStore()) — the only persistence option that
// needs zero new credentials/services on top of what's already deployed
// here (this site has no database). Two stores: "users" (email -> {
// email, passwordHash, createdAt }) and "sessions" (sessionId -> { email,
// createdAt }).
//
// Passwords: Node's built-in crypto.scrypt with a random per-user salt —
// avoids adding a bcrypt/argon2 dependency (native-binary compile risk on
// a serverless build) while still being a real, slow, salted KDF, not a
// bare hash. Sessions: a random opaque token in an httpOnly cookie,
// looked up server-side in the "sessions" store — never a JWT, so a
// session can be invalidated (logout) by simply deleting its Blob entry.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE_NAME = "aria_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hashHex] = String(stored || "").split(":");
  if (!salt || !hashHex) return false;
  const derived = await scryptAsync(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function sessionCookieHeader(sessionId) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

// Same-origin only (the frontend calls these from ariashop.pe itself), so
// no Access-Control-Allow-Credentials is needed for the httpOnly cookie to
// flow — that header is both unnecessary and invalid to pair with a
// wildcard origin anyway. Kept "*" only for consistency with every other
// function in this codebase's OPTIONS-preflight handling.
export function corsHeaders(methods) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": methods,
  };
}
