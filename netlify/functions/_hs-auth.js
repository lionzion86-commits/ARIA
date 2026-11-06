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

/* ================================================================
   HOME SHIELD ADMIN: ITS OWN DOOR (#443 c.6672170980). The admin page signs in
   with email + password against an allowlist in the hs-settings store (key
   "admins": { emails: [...], users: { email: { passHash, setAt } } }), seeded at
   runtime from ADMIN_EMAILS (never an email in the repo). A first password is
   set through a one-time, 30-minute setup link (sha256 stored, single use) or,
   for someone already signed in to the shop as an admin, directly. The session
   is the httpOnly hs_admin cookie (12 h), hashed in hs-sessions like the pro
   sessions. The shop session (aria_session on ADMIN_EMAILS) still works as a
   fallback, so every hs-admin-* endpoint accepts either.
   ================================================================ */
export const ADMIN_COOKIE = "hs_admin";
export const ADMIN_TTL_SECONDS = 60 * 60 * 12;
export const SETUP_TTL_MS = 30 * 60 * 1000;
export const adminCookieHeader = (sid) => `${ADMIN_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ADMIN_TTL_SECONDS}`;
export const clearAdminCookieHeader = () => `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

const envAdmins = (env = process.env) => String(env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

/** The allowlist record, seeded (and kept in step) with ADMIN_EMAILS. */
export async function readAdmins(S, env = process.env) {
  const cur = (await getJSON(S.settings, "admins")) || { emails: [], users: {} };
  const emails = [...new Set([...(cur.emails || []), ...envAdmins(env)])];
  const rec = { emails, users: cur.users || {} };
  if (emails.length !== (cur.emails || []).length) await S.settings.setJSON("admins", rec);
  return rec;
}
export async function isShieldAdmin(S, email) {
  if (!email) return false;
  return (await readAdmins(S)).emails.includes(String(email).toLowerCase());
}
export async function setAdminPassword(S, email, password, now = Date.now()) {
  const rec = await readAdmins(S);
  rec.users = { ...rec.users, [email]: { passHash: await hashPassword(password), setAt: new Date(now).toISOString() } };
  await S.settings.setJSON("admins", rec);
}
export async function createAdminSession(S, email, now = Date.now()) {
  const sid = randomBytes(32).toString("hex");
  await S.sessions.setJSON(`admin/${sha256(sid)}`, { email, createdAt: new Date(now).toISOString() });
  return sid;
}
function adminSid(event) {
  const cookies = parseCookies((event.headers || {}).cookie || (event.headers || {}).Cookie);
  const sid = cookies[ADMIN_COOKIE];
  return typeof sid === "string" && /^[0-9a-f]{64}$/.test(sid) ? sid : null;
}
export async function destroyAdminSession(event, S) {
  const sid = adminSid(event);
  if (sid) { try { await S.sessions.delete(`admin/${sha256(sid)}`); } catch { /* gone */ } }
}

/** One-time setup token: 32 random bytes; only its sha256 is stored, 30 minutes, single use. */
export async function issueSetupToken(S, email, now = Date.now()) {
  const token = randomBytes(32).toString("hex");
  await S.sessions.setJSON(`adminsetup/${sha256(token)}`, { email, exp: now + SETUP_TTL_MS });
  return token;
}
/** The email for a live token (and burns it), or null. */
export async function takeSetupToken(S, token, now = Date.now()) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return null;
  const key = `adminsetup/${sha256(token)}`;
  const rec = await getJSON(S.sessions, key);
  if (!rec) return null;
  await S.sessions.delete(key);
  if (now > rec.exp) return null;
  return rec.email;
}

/** The shop session's email (any account), or null. */
async function shopEmail(event, S, now) {
  const cookies = parseCookies((event.headers || {}).cookie || (event.headers || {}).Cookie);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (!sid) return null;
  const sess = await getJSON(S.shopSessions, sid);
  if (!sess || !sess.email) return null;
  if ((now - new Date(sess.createdAt).getTime()) / 1000 > SESSION_TTL_SECONDS) return null;
  return sess.email;
}

/** { email, via: "shield" | "shop" } or { code: "no_session" | "not_admin" }. */
export async function adminState(event, S, now = Date.now()) {
  let sawSession = false;
  const sid = adminSid(event);
  if (sid) {
    const sess = await getJSON(S.sessions, `admin/${sha256(sid)}`);
    if (sess && (now - Date.parse(sess.createdAt)) / 1000 <= ADMIN_TTL_SECONDS) {
      sawSession = true;
      if (await isShieldAdmin(S, sess.email)) return { email: sess.email, via: "shield" };
    }
  }
  const shop = await shopEmail(event, S, now);
  if (shop) {
    sawSession = true;
    if (isAdmin(shop) || (await isShieldAdmin(S, shop))) return { email: shop.toLowerCase(), via: "shop" };
  }
  return { code: sawSession ? "not_admin" : "no_session" };
}

/** The admin's email (hs_admin first, then the shop session on the allowlist); else null. */
export async function adminFromEvent(event, S, now = Date.now()) {
  const st = await adminState(event, S, now);
  return st.email || null;
}
