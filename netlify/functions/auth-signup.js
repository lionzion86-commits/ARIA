// Email/password signup -- the Key Club door (keyclub.html) is the only
// place that calls it. See _auth-helpers.js for storage/hashing/sessions
// and _keyclub.js for the membership rules.
//
// EMAIL CONFIRMATION IS REQUIRED (#443, Danny 2026-11-02). Creating the
// account does NOT sign her in: it stores the account as unconfirmed,
// sends the confirmation email (through the same provider and env config
// as the order confirmation, _order-email.js sendMail) and answers
// { pendingConfirmation: true, emailSent }. No confirmed email, no member
// access: auth-login.js refuses an unconfirmed account, and the session
// is only created by auth-confirm.js when the link is used.
//
// With no mail provider configured (tests, a sandbox), emailSent is false
// and the door says the email did not go out -- never that it did.
//
// THE CELL IS REQUIRED and the account is created with verifyRequired
// (#443, Danny c.6570940933 .. c.6570984289): after the email link she
// lands on the code step (keyclub.html?verificar=1, _keyclub-verify.js),
// and only then is her membership active.
import { getStore, connectLambda } from "@netlify/blobs";
import { hashPassword, normalizeEmail, corsHeaders } from "./_auth-helpers.js";
import { sendMail, keyClubConfirmationEmail } from "./_order-email.js";
import { KEYCLUB_STORE, issueConfirmation, normalizeBirthday, resolveReferrer, isConfirmed } from "./_keyclub.js";
import { DNI_DOCS_STORE, isDocId, normalizeDocNumber } from "./_dni-docs.js";
import { normalizePhone } from "./_keyclub-verify.js";

/** Where the confirmation link points: this deploy's own origin. */
export function siteOrigin(env = process.env) {
  const o = String(env.ARIA_SITE_ORIGIN || env.URL || "https://ariashop.pe").replace(/\/+$/, "");
  return /^https?:\/\//.test(o) ? o : "https://ariashop.pe";
}

export function confirmLink(token, env = process.env) {
  return `${siteOrigin(env)}/keyclub.html?confirmar=${encodeURIComponent(token)}`;
}

/** Send (or re-send) the confirmation. Returns { sent, error? }. */
export async function sendConfirmation(stores, email, { env = process.env, mailer = sendMail, now = Date.now() } = {}) {
  const t = await issueConfirmation(stores, email, now);
  const user = await stores.users.get(email, { type: "json" });
  const msg = keyClubConfirmationEmail({ to: email, name: user && user.name, link: confirmLink(t.token, env) });
  const r = await mailer(msg, { env, idempotencyKey: `keyclub-confirm/${t.hash.slice(0, 32)}` });
  await stores.users.setJSON(email, { ...(await stores.users.get(email, { type: "json" })), confirmEmailSentAt: r.sent ? new Date(now).toISOString() : null, confirmEmailError: r.sent ? null : String(r.error || "").slice(0, 200) });
  return r.sent ? { sent: true } : { sent: false, error: r.error };
}

/** The whole signup, store-injected so the tests drive it with stubs. */
export async function signup(stores, body, { env = process.env, mailer = sendMail, now = Date.now() } = {}) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  // WhatsApp (the door's label); stored where the account always kept the phone.
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 25) : "";
  const birthdayRaw = typeof body.birthday === "string" ? body.birthday.trim() : "";
  const birthday = normalizeBirthday(birthdayRaw, now);

  if (!name) return [400, { error: "Cuéntanos tu nombre" }];
  if (!email) return [400, { error: "Correo electrónico inválido" }];
  if (!phone) return [400, { error: "Escribe tu número de WhatsApp" }];
  if (!normalizePhone(phone)) return [400, { error: "Revisa tu número de WhatsApp (por ejemplo +51 987 654 321)" }];
  if (password.length < 8) return [400, { error: "La contraseña debe tener al menos 8 caracteres" }];
  if (birthdayRaw && !birthday) return [400, { error: "Revisa la fecha de tu cumpleaños" }];

  /* DNI ahora (optional): the two photo tokens from dni-upload and the
     number. Kept on the account as pending and registered as her pack
     when she confirms (auth-confirm.js); an upload nobody confirms
     expires under the 48-hour rule of the daily purge. */
  let pendingDni = null;
  if (body.dni && (body.dni.front || body.dni.back || body.dni.docNumber)) {
    const doc = normalizeDocNumber(body.dni.docNumber);
    if (!doc) return [400, { error: "Revisa el número de tu DNI" }];
    if (!isDocId(body.dni.front) || !isDocId(body.dni.back)) return [400, { error: "Sube las dos fotos de tu DNI, o elige subirlo después" }];
    if (stores.docs) {
      for (const side of ["front", "back"]) {
        const meta = await stores.docs.get(`meta:${body.dni[side]}`, { type: "json" });
        if (!meta || meta.side !== side) return [400, { error: "Una foto de tu DNI no llegó. Súbela de nuevo." }];
      }
    }
    pendingDni = { docNumber: doc, front: body.dni.front, back: body.dni.back };
  }

  const existing = await stores.users.get(email, { type: "json" });
  if (existing) {
    if (!isConfirmed(existing)) return [409, { error: "Ya creaste tu cuenta con este correo. Confírmala desde el correo que te enviamos.", needsConfirmation: true }];
    return [409, { error: "Ya existe una cuenta con este correo. Entra con tu contraseña." }];
  }

  const referredBy = body.ref ? await resolveReferrer(stores.keyclub, body.ref, email) : null;
  const passwordHash = await hashPassword(password);
  await stores.users.setJSON(email, {
    email, passwordHash, name, phone,
    birthday,
    founderStatus: "pending", // the founders review (founders-pick.js) is unchanged
    confirmRequired: true,
    emailConfirmedAt: null,
    verifyRequired: true,
    verifiedAt: null,
    verifiedVia: null,
    phoneVerified: false,
    referredBy,
    pendingDni,
    theme: null,
    createdAt: new Date(now).toISOString(),
  });
  const mail = await sendConfirmation(stores, email, { env, mailer, now });
  return [200, { pendingConfirmation: true, email, emailSent: mail.sent, ...(mail.sent ? {} : { emailError: "no enviado" }) }];
}

export async function handler(event) {
  // Classic (event/context-style) Netlify Functions need this to wire up
  // the ambient Blobs environment context.
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }

  try {
    const stores = { users: getStore("users"), keyclub: getStore(KEYCLUB_STORE), docs: getStore(DNI_DOCS_STORE) };
    const [code, out] = await signup(stores, body || {});
    if (code === 200) console.info("[auth-signup]", JSON.stringify({ emailSent: out.emailSent })); // never the address
    return { statusCode: code, headers, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[auth-signup] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos crear tu cuenta. Intenta de nuevo en un momento." }) };
  }
}
