/* ============================================================
   DANOS TU FEEDBACK -- THE IMPROVEMENT INBOX (#443 c.6447438497,
   Danny, 2026-10-27).

   Shoppers' recommendations, advice and opinions are the spec, and the
   stores they ask for are demand data for the catalogue. This is that
   inbox. It is NOT the Libro de Reclamaciones: a complaint has its own
   legal channel and is never filed here.

   One message: a tipo (Recomendación / Consejo / Tienda que quiero / Mi
   opinión), the words (required), the store when the tipo asks for one,
   and -- only if the shopper wants an answer -- a name and a WhatsApp or
   email. No login: guests send too.

   Where it goes:
     Blobs "feedback"   msg/<iso>-<id>   the message, for the admin's
                                         Más -> Feedback view
                        rate/<hash>/<hour>  how many this sender sent
                                         this hour (a hash of the
                                         address, never the address)
     contacto@ariashop.pe   a copy by email, over the order email's
                            provider (SMTP or Resend, _order-email.js).
                            A failed copy never loses the message: it
                            is stored first, and the record says the
                            copy failed.
   Spam: a hidden field people never fill (the honeypot answers "ok" and
   keeps nothing) and RATE_PER_HOUR messages per sender per hour.
   ============================================================ */
import { createHash, randomBytes } from "node:crypto";
import { emailProvider, nodemailerCreateTransport, REPLY_TO } from "./_order-email.js";

export const FEEDBACK_STORE = "feedback";
export const FEEDBACK_TO = "contacto@ariashop.pe";
export const TIPOS = {
  recomendacion: "Recomendación",
  consejo: "Consejo",
  tienda: "Tienda que quiero",
  opinion: "Mi opinión",
};
export const MAX = { mensaje: 2000, tienda: 80, nombre: 80, contacto: 120, page: 60 };
export const RATE_PER_HOUR = 5;
export const HONEYPOT = "website";

const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const isEmail = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(s || ""));

/**
 * The message the page sent, cleaned; or { error } in the shopper's words;
 * or { spam: true } when the honeypot was filled.
 */
export function parseFeedback(body) {
  const b = body && typeof body === "object" ? body : {};
  if (clean(b[HONEYPOT], 200)) return { spam: true };
  const tipo = Object.prototype.hasOwnProperty.call(TIPOS, b.tipo) ? b.tipo : null;
  if (!tipo) return { error: "Elige qué tipo de mensaje es." };
  const mensaje = clean(b.mensaje, MAX.mensaje);
  if (mensaje.length < 3) return { error: "Escríbenos tu mensaje." };
  const tienda = tipo === "tienda" ? clean(b.tienda, MAX.tienda) : "";
  if (tipo === "tienda" && !tienda) return { error: "Cuéntanos qué tienda te gustaría ver en Aria." };
  return {
    msg: {
      tipo,
      mensaje,
      ...(tienda ? { tienda } : {}),
      ...(clean(b.nombre, MAX.nombre) ? { nombre: clean(b.nombre, MAX.nombre) } : {}),
      ...(clean(b.contacto, MAX.contacto) ? { contacto: clean(b.contacto, MAX.contacto) } : {}),
      ...(clean(b.page, MAX.page) ? { page: clean(b.page, MAX.page) } : {}),
    },
  };
}

/** The sender's rate key for this hour: a hash of the address, never the address. */
export function rateKey(ip, now = new Date()) {
  const hour = now.toISOString().slice(0, 13);
  const h = createHash("sha256").update(`aria-feedback|${hour}|${String(ip || "unknown")}`).digest("hex").slice(0, 24);
  return `rate/${h}/${hour}`;
}

/** The address the request came from, as Netlify reports it. */
export function clientIp(headers = {}) {
  const h = (k) => headers[k] || headers[k.toLowerCase()] || "";
  return String(h("x-nf-client-connection-ip") || h("client-ip") || String(h("x-forwarded-for")).split(",")[0] || "").trim();
}

/** The copy for contacto@: plain words, every field escaped. */
export function feedbackEmail(rec) {
  const label = TIPOS[rec.tipo] || rec.tipo;
  const subject = rec.tipo === "tienda"
    ? `Feedback: piden ${rec.tienda}`
    : `Feedback: ${label}`;
  const rows = [
    ["Tipo", label],
    ...(rec.tienda ? [["Tienda", rec.tienda]] : []),
    ["Mensaje", rec.mensaje],
    ["Nombre", rec.nombre || "(no lo dejó)"],
    ["WhatsApp o correo", rec.contacto || "(no quiere respuesta)"],
    ...(rec.page ? [["Enviado desde", rec.page]] : []),
    ["Fecha", rec.at],
    ["Id", rec.id],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nTambién está en el admin: Más > Feedback.";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<h2 style="font-size:18px;margin:0 0 12px">Danos tu feedback</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join("")}</table>
<p style="color:#666;font-size:12px">También está en el admin: Más &gt; Feedback.</p></div>`;
  return { to: FEEDBACK_TO, subject, text, html, replyTo: isEmail(rec.contacto) ? rec.contacto : REPLY_TO };
}

/** Send the copy. { sent, id } or { sent: false, error } -- never throws. */
export async function sendFeedbackCopy(rec, { env = process.env, fetchImpl = fetch, createTransport = null } = {}) {
  const msg = feedbackEmail(rec);
  const provider = emailProvider(env);
  if (!provider) return { sent: false, error: "no hay proveedor de correo configurado" };
  try {
    if (provider === "smtp") {
      const make = createTransport || await nodemailerCreateTransport();
      const port = Number(env.SMTP_PORT) || 465;
      const info = await make({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } })
        .sendMail({ from: env.ARIA_EMAIL_FROM || `Aria <${env.SMTP_USER}>`, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html });
      return { sent: true, id: (info && info.messageId) || null };
    }
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `feedback/${rec.id}` },
      body: JSON.stringify({ from: env.ARIA_EMAIL_FROM || "Aria <pedidos@ariashop.pe>", to: [msg.to], reply_to: msg.replyTo, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { sent: false, error: (data && (data.message || data.error)) || `Resend respondió ${res.status}` };
    return { sent: true, id: data && data.id };
  } catch (e) {
    return { sent: false, error: String((e && e.message) || e) };
  }
}

/**
 * The whole POST, with the store and the mailer injected: rate check,
 * store the message, send the copy, note how the copy went.
 * Returns { status, body }.
 */
export async function receiveFeedback({ body, ip, store, now = new Date(), send = sendFeedbackCopy }) {
  const p = parseFeedback(body);
  if (p.spam) return { status: 200, body: { ok: true } };
  if (p.error) return { status: 400, body: { error: p.error } };
  const rk = rateKey(ip, now);
  const seen = (await store.get(rk, { type: "json" })) || { n: 0 };
  if (seen.n >= RATE_PER_HOUR) return { status: 429, body: { error: "Ya recibimos varios mensajes tuyos. Escríbenos de nuevo en un rato." } };
  await store.setJSON(rk, { n: seen.n + 1 });
  const at = now.toISOString();
  const id = randomBytes(6).toString("hex");
  const rec = { id, at, status: "nuevo", ...p.msg };
  const key = `msg/${at}-${id}`;
  await store.setJSON(key, rec);
  const copy = await send(rec);
  await store.setJSON(key, { ...rec, emailed: !!copy.sent, ...(copy.sent ? {} : { emailError: copy.error }) });
  return { status: 200, body: { ok: true } };
}

/** The admin's view: newest first, and the stores shoppers ask for, most asked first. */
export async function listFeedback(store, limit = 300) {
  const { blobs } = await store.list({ prefix: "msg/" });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const items = (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean);
  const tally = new Map();
  for (const m of items) if (m.tipo === "tienda" && m.tienda) {
    const k = m.tienda.toLowerCase().replace(/\s+/g, " ").trim();
    const t = tally.get(k) || { tienda: m.tienda, n: 0 };
    t.n++;
    tally.set(k, t);
  }
  return { items, total: blobs.length, tiendas: [...tally.values()].sort((a, b) => b.n - a.n) };
}
