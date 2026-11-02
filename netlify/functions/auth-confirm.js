// The Key Club confirmation link, spent (#443, Danny 2026-11-02).
//
//   POST { token }            -> confirms the email (single use, 48 h,
//                                only the latest link), activates the
//                                membership (member number, invite code,
//                                the DNI pack she uploaded at the door),
//                                signs her in and answers
//                                { ok, redirect: "/cuenta.html?bienvenida=1" }.
//   POST { resend, email }    -> a fresh link for an unconfirmed account.
//                                Always the same answer, whether or not
//                                the account exists (no address probing).
//
// The email links to keyclub.html?confirmar=..., and that page POSTs
// here: a GET would let a mail scanner pre-fetching links spend the
// token before she ever taps it.
import { getStore, connectLambda } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { normalizeEmail, sessionCookieHeader, corsHeaders } from "./_auth-helpers.js";
import { KEYCLUB_STORE, consumeConfirmation, isConfirmed } from "./_keyclub.js";
import { DNI_DOCS_STORE, DNI_PACKS_STORE, registerPack } from "./_dni-docs.js";
import { sendConfirmation } from "./auth-signup.js";
import { sendMail } from "./_order-email.js";

export const DASHBOARD = "/cuenta.html?bienvenida=1";

/** Confirm + activate + open a session. Returns [status, body, sessionId|null]. */
export async function confirm(stores, token, { now = Date.now() } = {}) {
  const r = await consumeConfirmation(stores, token, now);
  if (!r.ok) return [r.code === "expired" || r.code === "superseded" ? 410 : 400, { error: r.error, code: r.code, canResend: r.code !== "invalid" }, null];
  let user = r.user;
  /* «DNI pack ahora»: the photos she uploaded at the door become her pack. */
  if (user.pendingDni && stores.docs && stores.packs) {
    try {
      await registerPack({ docs: stores.docs, packs: stores.packs }, r.email, { ...user.pendingDni, name: user.name, now });
    } catch (e) { console.error("[auth-confirm] dni pack not registered", e && e.message); }
    user = { ...user, pendingDni: null };
    await stores.users.setJSON(r.email, user);
  }
  const sessionId = randomBytes(32).toString("hex");
  await stores.sessions.setJSON(sessionId, { email: r.email, createdAt: new Date(now).toISOString() });
  return [200, { ok: true, email: r.email, name: user.name || null, memberNumber: user.memberNumber, redirect: DASHBOARD }, sessionId];
}

export async function resend(stores, rawEmail, opts = {}) {
  const email = normalizeEmail(rawEmail);
  const answer = [200, { ok: true, message: "Si tu cuenta espera confirmación, te enviamos un correo nuevo." }];
  if (!email) return answer;
  const user = await stores.users.get(email, { type: "json" });
  if (!user || isConfirmed(user)) return answer;
  /* One email a minute at most: the button cannot be used to flood her inbox. */
  const last = Date.parse(user.confirmEmailSentAt || "");
  if (Number.isFinite(last) && (opts.now || Date.now()) - last < 60 * 1000) return answer;
  const r = await sendConfirmation(stores, email, opts);
  return [200, { ...answer[1], emailSent: r.sent }];
}

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("POST, OPTIONS"), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
  const stores = {
    users: getStore("users"), sessions: getStore("sessions"), keyclub: getStore(KEYCLUB_STORE),
    docs: getStore(DNI_DOCS_STORE), packs: getStore(DNI_PACKS_STORE),
  };
  try {
    if (body && body.resend) {
      const [code, out] = await resend(stores, body.email, { mailer: sendMail });
      return { statusCode: code, headers, body: JSON.stringify(out) };
    }
    const [code, out, sessionId] = await confirm(stores, body && body.token);
    return {
      statusCode: code,
      headers: sessionId ? { ...headers, "Set-Cookie": sessionCookieHeader(sessionId) } : headers,
      body: JSON.stringify(out),
    };
  } catch (error) {
    console.error("[auth-confirm] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos confirmar tu correo. Intenta de nuevo en un momento." }) };
  }
}
