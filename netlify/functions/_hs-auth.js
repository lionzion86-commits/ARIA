// ARIA HOME SHIELD -- pro sessions and the admin gate. Underscore: not an endpoint.
//
// PASSWORDS: the shop's own scrypt helpers (_auth-helpers.js hashPassword /
// verifyPassword: random salt, 64-byte scrypt, constant-time compare).
// SESSIONS: a random 32-byte id in the httpOnly; Secure; SameSite=Lax
// cookie `hs_pro`; the hs-sessions store keeps only its sha256, so a leaked
// store listing cannot be replayed as a cookie. Logout deletes the entry.
// Every request re-reads the pro record, so admin un-verification or a
// disabled account takes effect on the next poll.
//
// ADMIN: the same gate as admin.html -- the shop's own session cookie
// (aria_session, "sessions" store) whose email is on ADMIN_EMAILS. No
// second password.
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword, parseCookies, isAdmin, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./_auth-helpers.js";
import { getJSON, sha256 } from "./_hs-store.js";

export { hashPassword, verifyPassword };
export const PRO_COOKIE = "hs_pro";
export const PRO_TTL_SECONDS = 60 * 60 * 24 * 14;

export const proCookieHeader = (sid) => `${PRO_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${PRO_TTL_SECONDS}`;
export const clearProCookieHeader = () => `${PRO_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* A fixed scrypt hash so a login for an unknown email costs the same as a wrong password. */
let dummyHash = null;
export async function burnPasswordCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword("not-a-real-password-" + randomBytes(8).toString("hex"));
  await verifyPassword(password, dummyHash);
}

export async function createProSession(S, proId, now = Date.now()) {
  const sid = randomBytes(32).toString("hex");
  await S.sessions.setJSON(`pro/${sha256(sid)}`, { proId, createdAt: new Date(now).toISOString() });
  return sid;
}

function proSid(event) {
  const cookies = parseCookies((event.headers || {}).cookie || (event.headers || {}).Cookie);
  const sid = cookies[PRO_COOKIE];
  return typeof sid === "string" && /^[0-9a-f]{64}$/.test(sid) ? sid : null;
}

/** The signed-in pro record (fresh from hs-pros), or null. */
export async function proFromEvent(event, S, now = Date.now()) {
  const sid = proSid(event);
  if (!sid) return null;
  const sess = await getJSON(S.sessions, `pro/${sha256(sid)}`);
  if (!sess || !sess.proId) return null;
  if ((now - Date.parse(sess.createdAt)) / 1000 > PRO_TTL_SECONDS) return null;
  const pro = await getJSON(S.pros, sess.proId);
  if (!pro || pro.disabled) return null;
  return pro;
}

export async function destroyProSession(event, S) {
  const sid = proSid(event);
  if (sid) { try { await S.sessions.delete(`pro/${sha256(sid)}`); } catch { /* already gone */ } }
}

/** The admin's email when the shop session is on ADMIN_EMAILS; else null. */
export async function adminFromEvent(event, S, now = Date.now()) {
  const cookies = parseCookies((event.headers || {}).cookie || (event.headers || {}).Cookie);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (!sid) return null;
  const sess = await getJSON(S.shopSessions, sid);
  if (!sess || !sess.email) return null;
  if ((now - new Date(sess.createdAt).getTime()) / 1000 > SESSION_TTL_SECONDS) return null;
  return isAdmin(sess.email) ? sess.email : null;
}
