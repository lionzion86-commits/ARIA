/* ============================================================
   ARIA KEY CLUB -- THE VERIFICATION CODE (#443, Danny 2026-11-02,
   c.6570940933, c.6570980858, c.6570984289). SERVER ONLY, AND PURE.

   Activation needs BOTH the email link (auth-confirm.js) AND this step.
   At the step she picks where a 6-digit code goes, with one tap:
   WhatsApp (the highlighted default), SMS (texto) or correo -- the
   other two are fully equal choices.

   THE CODE. 6 digits from the crypto RNG. Only a salted sha256 of it is
   kept (keyclub store, `verify:<email>`), with:
     - expiry:      CODE_TTL_MS (10 minutes);
     - attempts:    MAX_ATTEMPTS (5) wrong tries, then it is gone;
     - single use:  deleted the moment it matches;
     - resends:     one per RESEND_GAP_MS (60 s), whatever the channel.

   THE CHANNELS. Email works today (_order-email.js sendMail). WhatsApp
   and SMS are NOT live yet: the WhatsApp Business channel is onboarded at
   the first sales. Their senders are here, behind env checks, and no
   secret is ever in the repo:
     WhatsApp Cloud API   WHATSAPP_TOKEN + WHATSAPP_PHONE_ID
                          (optional WHATSAPP_TEMPLATE, an approved
                          authentication template, + WHATSAPP_TEMPLATE_LANG;
                          WHATSAPP_API_VERSION, default v21.0)
     SMS (Twilio)         TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
   A channel that is not live says so in Spanish and offers the email --
   no code is created, nothing pretends to have been sent. A provider
   that fails says so too, and the code it could not deliver is dropped.

   THE RECORD on the account (users store):
     verifiedAt / verifiedVia   the first completed code step;
     phoneVerified              true ONLY via WhatsApp or SMS;
     phoneVerifiedAt / phoneVerifiedVia / phoneVerifiedNumber.
   ============================================================ */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { isConfirmed, needsVerification } from "./_keyclub.js";
import { sendMail, keyClubCodeEmail } from "./_order-email.js";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_GAP_MS = 60 * 1000;
export const CHANNELS = ["whatsapp", "sms", "email"];
export const PHONE_CHANNELS = ["whatsapp", "sms"];
export const CHANNEL_NAME = { whatsapp: "WhatsApp", sms: "SMS", email: "correo" };
export const DASHBOARD_WELCOME = "/cuenta.html?bienvenida=1";

const key = (email) => `verify:${email}`;

/* ---------------- the code ---------------- */

export function newCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export function hashCode(code, salt) {
  return createHash("sha256").update(`${salt}:${String(code || "")}`).digest("hex");
}

function sameHash(a, b) {
  const x = Buffer.from(String(a || ""), "hex"), y = Buffer.from(String(b || ""), "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/* ---------------- phone + masks ---------------- */

/**
 * E.164 or null. A Peruvian cell typed bare (9 digits starting with 9)
 * gets +51; anything with a leading + keeps its country code.
 */
export function normalizePhone(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (s.startsWith("+") || s.startsWith("00")) {
    const d = s.startsWith("00") ? digits.slice(2) : digits;
    return d.length >= 8 && d.length <= 15 ? "+" + d : null;
  }
  if (digits.length === 9 && digits[0] === "9") return "+51" + digits;
  if (digits.length === 11 && digits.startsWith("519")) return "+" + digits;
  return null;
}

export function maskPhone(e164) {
  const d = String(e164 || "").replace(/\D/g, "");
  if (d.length < 6) return "";
  return (d.length === 11 && d.startsWith("51") ? "+51 " : "") + "••• ••• " + d.slice(-3);
}

export function maskEmail(email) {
  const m = /^([^@]+)@(.+)$/.exec(String(email || ""));
  if (!m) return "";
  return m[1].slice(0, 2) + "•••@" + m[2];
}

/* ---------------- which channels are live ---------------- */

export function channelLive(channel, env = process.env) {
  if (channel === "email") return true;
  if (channel === "whatsapp") return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);
  if (channel === "sms") return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
  return false;
}

export function codeText(code) {
  return `Tu código Aria Key Club es ${code}. Vence en 10 minutos. No lo compartas con nadie.`;
}

/* ---------------- the senders (behind the env checks) ---------------- */

export async function sendWhatsAppCode(to, code, { env = process.env, fetchImpl = fetch } = {}) {
  if (!channelLive("whatsapp", env)) return { sent: false, error: "WhatsApp no está configurado" };
  const version = env.WHATSAPP_API_VERSION || "v21.0";
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(env.WHATSAPP_PHONE_ID)}/messages`;
  const body = env.WHATSAPP_TEMPLATE
    ? {
      messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE, language: { code: env.WHATSAPP_TEMPLATE_LANG || "es" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    }
    : { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: codeText(code) } };
  try {
    const r = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return { sent: false, error: `WhatsApp respondió ${r.status}` };
    return { sent: true };
  } catch (e) { return { sent: false, error: String(e && e.message || e).slice(0, 200) }; }
}

export async function sendSmsCode(to, code, { env = process.env, fetchImpl = fetch } = {}) {
  if (!channelLive("sms", env)) return { sent: false, error: "SMS no está configurado" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  try {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: codeText(code) }).toString(),
    });
    if (!r.ok) return { sent: false, error: `SMS respondió ${r.status}` };
    return { sent: true };
  } catch (e) { return { sent: false, error: String(e && e.message || e).slice(0, 200) }; }
}

/* ---------------- the step's state ---------------- */

/** What the verification screen may show about her (masked, never raw). */
export function verifyStatus(user) {
  const u = user || {};
  const phone = normalizePhone(u.phone);
  return {
    signedIn: true,
    emailConfirmed: isConfirmed(u),
    needsVerification: needsVerification(u),
    phoneVerified: u.phoneVerified === true,
    verifiedVia: u.verifiedVia || null,
    phoneMasked: phone ? maskPhone(phone) : null,
    emailMasked: maskEmail(u.email),
  };
}

function unavailable(channel, purpose) {
  const name = CHANNEL_NAME[channel];
  return {
    sent: false, code: "channel_unavailable", channel,
    message: purpose === "phone"
      ? `Los códigos por ${name} todavía no están activos. Por ahora no podemos verificar tu celular; vuelve a intentarlo más adelante.`
      : `Los códigos por ${name} todavía no están activos. Puedes recibir tu código por correo.`,
    offer: purpose === "phone" ? null : "email",
  };
}

/**
 * Send a code. stores: { users, keyclub }. purpose: "activate" (the entry
 * step, all three channels) or "phone" (an active member verifying her
 * cell later: WhatsApp or SMS only). Returns [status, body].
 * `senders` is injectable: { email(user, code), whatsapp(to, code), sms(to, code) }.
 */
export async function sendCode(stores, email, body, { env = process.env, senders = {}, now = Date.now() } = {}) {
  if (!email) return [401, { sent: false, error: "Inicia sesión en tu cuenta Key Club." }];
  const user = await stores.users.get(email, { type: "json" });
  if (!user) return [401, { sent: false, error: "Inicia sesión en tu cuenta Key Club." }];
  if (!isConfirmed(user)) return [403, { sent: false, code: "unconfirmed", error: "Primero confirma tu correo con el enlace que te enviamos." }];
  const purpose = body && body.purpose === "phone" ? "phone" : "activate";
  const channel = String((body && body.channel) || "");
  if (!CHANNELS.includes(channel) || (purpose === "phone" && channel === "email")) return [400, { sent: false, code: "bad_channel", error: "Elige WhatsApp, SMS o correo." }];
  if (purpose === "activate" && !needsVerification(user)) return [200, { sent: false, code: "already", already: true, redirect: DASHBOARD_WELCOME }];
  if (purpose === "phone" && user.phoneVerified === true) return [200, { sent: false, code: "already", already: true, redirect: "/cuenta.html#datos" }];

  const phone = normalizePhone(user.phone);
  if (PHONE_CHANNELS.includes(channel)) {
    if (!channelLive(channel, env)) return [200, unavailable(channel, purpose)];
    if (!phone) return [400, { sent: false, code: "no_phone", channel, message: "No tenemos un número de celular válido en tu cuenta.", offer: purpose === "phone" ? null : "email" }];
  }

  const prev = await stores.keyclub.get(key(email), { type: "json" }).catch(() => null);
  const last = Date.parse((prev && prev.sentAt) || "");
  if (Number.isFinite(last) && now - last < RESEND_GAP_MS) {
    const retryIn = Math.ceil((RESEND_GAP_MS - (now - last)) / 1000);
    return [429, { sent: false, code: "too_soon", retryIn, message: `Espera ${retryIn} segundos para pedir otro código.` }];
  }

  const code = newCode();
  const salt = randomBytes(16).toString("hex");
  const rec = {
    salt, codeHash: hashCode(code, salt), channel, purpose,
    phone: PHONE_CHANNELS.includes(channel) ? phone : null,
    sentAt: new Date(now).toISOString(), expiresAt: new Date(now + CODE_TTL_MS).toISOString(), attempts: 0,
  };
  /* Stored before sending, so a resend gap holds even when the provider is slow. */
  await stores.keyclub.setJSON(key(email), rec);
  let r;
  try {
    if (channel === "email") r = await (senders.email || ((u, c) => sendMail(keyClubCodeEmail({ to: email, name: u.name, code: c }), { env })))(user, code);
    else if (channel === "whatsapp") r = await (senders.whatsapp || ((to, c) => sendWhatsAppCode(to, c, { env })))(phone, code);
    else r = await (senders.sms || ((to, c) => sendSmsCode(to, c, { env })))(phone, code);
  } catch (e) { r = { sent: false, error: String(e && e.message || e) }; }
  if (!r || !r.sent) {
    /* Never a code she cannot have received: it is dropped, and the gap with it. */
    await stores.keyclub.delete(key(email));
    return [502, {
      sent: false, code: "send_failed", channel,
      message: channel === "email"
        ? "El correo con tu código no salió. Inténtalo de nuevo en unos minutos."
        : `El código por ${CHANNEL_NAME[channel]} no salió.${purpose === "phone" ? " Inténtalo de nuevo en unos minutos." : " Puedes recibirlo por correo."}`,
      offer: channel === "email" || purpose === "phone" ? null : "email",
    }];
  }
  return [200, {
    sent: true, channel,
    to: channel === "email" ? maskEmail(email) : maskPhone(phone),
    expiresInMin: CODE_TTL_MS / 60000, resendIn: RESEND_GAP_MS / 1000,
  }];
}

/** Check a code. Single use, expiring, at most MAX_ATTEMPTS wrong tries. Returns [status, body]. */
export async function checkCode(stores, email, body, { now = Date.now() } = {}) {
  if (!email) return [401, { ok: false, error: "Inicia sesión en tu cuenta Key Club." }];
  const user = await stores.users.get(email, { type: "json" });
  if (!user) return [401, { ok: false, error: "Inicia sesión en tu cuenta Key Club." }];
  const typed = String((body && body.code) || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(typed)) return [400, { ok: false, code: "format", error: "El código tiene 6 dígitos." }];
  const rec = await stores.keyclub.get(key(email), { type: "json" }).catch(() => null);
  if (!rec || !rec.codeHash) return [400, { ok: false, code: "no_code", error: "No hay un código activo. Pide uno nuevo." }];
  if (Date.parse(rec.expiresAt) < now) {
    await stores.keyclub.delete(key(email));
    return [410, { ok: false, code: "expired", error: "Tu código venció. Pide uno nuevo." }];
  }
  if ((rec.attempts || 0) >= MAX_ATTEMPTS) {
    await stores.keyclub.delete(key(email));
    return [429, { ok: false, code: "locked", error: "Demasiados intentos. Pide un código nuevo." }];
  }
  if (!sameHash(hashCode(typed, rec.salt), rec.codeHash)) {
    const attempts = (rec.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await stores.keyclub.delete(key(email));
      return [429, { ok: false, code: "locked", error: "Demasiados intentos. Pide un código nuevo." }];
    }
    await stores.keyclub.setJSON(key(email), { ...rec, attempts });
    const left = MAX_ATTEMPTS - attempts;
    return [400, { ok: false, code: "wrong", attemptsLeft: left, error: `Ese código no es. Te ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`}.` }];
  }
  /* Right: spent now, a second use finds nothing. */
  await stores.keyclub.delete(key(email));
  const at = new Date(now).toISOString();
  const viaPhone = PHONE_CHANNELS.includes(rec.channel) && Boolean(rec.phone);
  const fresh = await stores.users.get(email, { type: "json" });
  const next = { ...fresh, verifiedAt: fresh.verifiedAt || at, verifiedVia: fresh.verifiedAt ? (viaPhone ? rec.channel : fresh.verifiedVia) : rec.channel };
  if (viaPhone) Object.assign(next, { phoneVerified: true, phoneVerifiedAt: at, phoneVerifiedVia: rec.channel, phoneVerifiedNumber: rec.phone });
  else next.phoneVerified = fresh.phoneVerified === true;
  await stores.users.setJSON(email, next);
  return [200, {
    ok: true, phoneVerified: next.phoneVerified, verifiedVia: next.verifiedVia,
    redirect: rec.purpose === "phone" ? "/cuenta.html#datos" : DASHBOARD_WELCOME,
  }];
}
