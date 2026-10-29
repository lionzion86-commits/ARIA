/* ============================================================
   ORDER CONFIRMATION EMAIL (2026-10-18, #367 finding #10, Danny).

   "The confirmation email is part of the payment itself." Danny's paid
   test order (#ARIA-20261018-5CEECF) produced no email at all: nothing
   in this repo sent mail. The confirmation screen said "te
   contactaremos" and the customer was left with a card charge and no
   proof.

   WHEN IT FIRES: from stripe-webhook.js, the first time an order turns
   paid -- the only moment money is known to have arrived. Once per
   order: the order records confirmationEmailSentAt, and the provider is
   given an idempotency key on the order id, so a retried Stripe event
   cannot send it twice.

   WHAT IT SAYS: order number, every line (size and quantity), the total
   paid in soles, the delivery estimate and the next steps, and how to
   reach Aria. Nothing else -- in particular no declared value, cost
   basis or itemised margin (release gate, invariant 1).

   HOW IT SENDS -- whichever is configured, SMTP first:
     SMTP (Aria's own Zoho mailbox, 2026-10-18: the first paid proof run
     sent nothing because no provider was configured, and Aria's mail
     already lives on Zoho -- no new account, no DNS change):
       SMTP_HOST   smtp.zoho.com
       SMTP_PORT   465 (TLS; 587 uses STARTTLS)
       SMTP_USER   the mailbox, e.g. pedidos@ariashop.pe
       SMTP_PASS   its password (a Zoho app password when 2FA is on)
     Resend's HTTP API, when no SMTP is set:
       RESEND_API_KEY, with the sending domain verified in Resend.
     ARIA_EMAIL_FROM overrides the sender. Default: "Aria <SMTP_USER>"
     over SMTP (Zoho only sends as the signed-in mailbox or its aliases),
     "Aria <pedidos@ariashop.pe>" over Resend.
   Without either, nothing is sent and the order records why. A failed
   send never fails the webhook: the payment is recorded either way, and
   the order carries confirmationEmailError for ops.
   ============================================================ */
import { lastMileEtaEs } from "../../couriers.js";

export const DEFAULT_FROM = "Aria <pedidos@ariashop.pe>";
export const REPLY_TO = "contacto@ariashop.pe";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const soles = (n) => "S/ " + (Math.round(Number(n) * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* PRODUCT PHOTOS PER LINE (2026-10-21, #443, Ale on the first real
   order, Danny's ruling). Each line shows the catalog photo the PDP and
   cart showed: the hosted URL stored on the order line (item.image),
   referenced by link -- never attached, so the email stays light for
   phones on mountain data. A line with no usable image renders with no
   <img> at all, never a broken-image box. The URL came from a browser,
   so it is checked twice (stored by orders-create.js, rendered here):
   http(s) only, no credentials, no whitespace or markup characters,
   and it is HTML-escaped where it lands. A protocol-relative or
   root-relative URL is made absolute; nothing is ever fetched. */
export const SITE_ORIGIN = "https://ariashop.pe";
export const EMAIL_THUMB_PX = 72;

/** A line image safe to reference from an email, absolute; else null. */
export function emailImageUrl(raw) {
  if (typeof raw !== "string") return null;
  let u = raw.trim();
  if (!u || u.length > 2048) return null;
  if (/[\s"'<>`\\\u0000-\u001f\u007f]/.test(u)) return null;
  if (u.startsWith("//")) u = "https:" + u;
  else if (u.startsWith("/")) u = SITE_ORIGIN + u;
  if (!/^https?:\/\//i.test(u)) return null;
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  return url.href;
}

/** Who gets it: the address typed at checkout, else the signed-in one. */
export function confirmationRecipient(order) {
  const typed = String(order?.customer?.email || "").trim();
  const ok = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  if (ok(typed)) return typed;
  const account = String(order?.buyerEmail || "").trim();
  return ok(account) ? account : null;
}

/** The total the card actually paid, in soles. */
export function paidPen(order) {
  const captured = Number(order?.amountCapturedPen);
  if (Number.isFinite(captured) && captured > 0) return captured;
  const billed = Number(order?.pricePenCharged);
  return Number.isFinite(billed) ? billed : null;
}

/** The message itself. Pure, so the content is tested without a network. */
export function orderConfirmationEmail(order) {
  const to = confirmationRecipient(order);
  const id = String(order?.orderId || "");
  const name = String(order?.customer?.name || "").trim().split(/\s+/)[0] || "";
  const items = (Array.isArray(order?.items) ? order.items : []).filter((it) => it && it.lineType !== "bundle-discount");
  const total = paidPen(order);
  const city = String(order?.shipping?.destCity || "").trim();
  const courier = order?.shipping?.courier?.name || "";
  const eta = lastMileEtaEs(city, courier);
  const wallet = Number(order?.walletAppliedPen) > 0 ? Number(order.walletAppliedPen) : 0;

  const lineText = (it) => {
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    const size = String(it.selectedSize || "").trim();
    /* The condition the order stored (#443, Reacondicionados). */
    const cond = String(it.condition || "").trim();
    return `${it.title}${cond ? ` [${cond}]` : ""}${size ? ` (talla ${size})` : ""} x${qty}`;
  };
  /* The line's own price in soles: its card price at the rate this
     order was charged at -- the soles figure the product card showed.
     Omitted when the order does not carry both. */
  const fx = Number(order?.fxRateUsed);
  const linePen = (it) => {
    const usd = Number(it.priceUsd);
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    return Number.isFinite(usd) && usd > 0 && Number.isFinite(fx) && fx > 0 ? Math.round(usd * qty * fx * 100) / 100 : null;
  };
  const thumbCol = EMAIL_THUMB_PX + 12;
  const anyImage = items.some((it) => emailImageUrl(it.image));
  const cell = "padding:8px 0;border-bottom:1px solid #EEF1F7;vertical-align:middle";
  const lineHtml = (it) => {
    const img = emailImageUrl(it.image);
    const pen = linePen(it);
    return `<tr>`
      + (anyImage ? `<td width="${thumbCol}" style="${cell};width:${thumbCol}px">`
        + (img ? `<img src="${esc(img)}" width="${EMAIL_THUMB_PX}" height="${EMAIL_THUMB_PX}" alt="${esc(it.title)}" style="display:block;width:${EMAIL_THUMB_PX}px;height:${EMAIL_THUMB_PX}px;object-fit:contain;border:0;border-radius:8px;background:#F4F6FB">` : "")
        + `</td>` : "")
      + `<td style="${cell}">${esc(lineText(it))}</td>`
      + `<td align="right" style="${cell};text-align:right;white-space:nowrap;padding-left:8px">${pen != null ? esc(soles(pen)) : ""}</td>`
      + `</tr>`;
  };
  const subject = `Confirmamos tu pedido ${id}`;
  const steps = [
    "Compramos tus productos en las tiendas de Estados Unidos y los recibimos en nuestro almacén de Miami.",
    "Desde Miami viajan a Lima.",
    eta,
  ];
  const text = [
    `Hola${name ? " " + name : ""},`,
    "",
    `Recibimos tu pago. Tu pedido ${id} está confirmado.`,
    "",
    "Tu pedido:",
    ...items.map((it) => "  - " + lineText(it)),
    "",
    total != null ? `Total pagado: ${soles(total)}` : "",
    wallet ? `Saldo Aria aplicado: ${soles(wallet)}` : "",
    "",
    "Qué sigue:",
    ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    `¿Preguntas? Responde a este correo o escríbenos a ${REPLY_TO} con tu número de pedido.`,
    "",
    "Aria",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F4F6FB;font-family:Arial,Helvetica,sans-serif;color:#0A1F44">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #E3E8F2">
    <p style="font-size:15px;margin:0 0 12px">Hola${name ? " " + esc(name) : ""},</p>
    <p style="font-size:15px;margin:0 0 16px">Recibimos tu pago. Tu pedido <b>${esc(id)}</b> está confirmado.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px">
      ${items.map(lineHtml).join("")}
    </table>
    ${total != null ? `<p style="font-size:16px;font-weight:bold;margin:16px 0 4px">Total pagado: ${esc(soles(total))}</p>` : ""}
    ${wallet ? `<p style="font-size:13px;margin:0 0 4px;color:#5B6478">Saldo Aria aplicado: ${esc(soles(wallet))}</p>` : ""}
    <p style="font-size:14px;font-weight:bold;margin:20px 0 8px">Qué sigue</p>
    <ol style="font-size:14px;margin:0;padding-left:20px;line-height:1.5">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <p style="font-size:13px;margin:20px 0 0;color:#5B6478">¿Preguntas? Responde a este correo o escríbenos a <a href="mailto:${REPLY_TO}" style="color:#1F5BD8">${REPLY_TO}</a> con tu número de pedido.</p>
  </div>
  <p style="font-size:12px;color:#8A93A8;text-align:center;margin:16px 0 0">Aria · ariashop.pe</p>
</div></body></html>`;

  return { to, subject, text, html };
}

/* THE SOLD-OUT MESSAGE (Danny, #443 c.6488288883). A refurbished, used
   or open-box listing can be a single unit; under confirm-first checkout
   the store buy is the stock check. When it fails because the item is
   gone, Aria tells the customer at once, in Aria's voice, and refunds the
   whole line: to the card or as saldo Aria, the customer's choice. The
   only thing asked of them is that choice. Pure, like the confirmation:
   the admin flow that sends it passes the order and the line. */
export function soldOutEmail(order, line) {
  const to = confirmationRecipient(order);
  const id = String(order?.orderId || "");
  const name = String(order?.customer?.name || "").trim().split(/\s+/)[0] || "";
  const title = String(line?.title || "").trim();
  const qty = Math.max(1, Math.floor(Number(line?.qty) || 1));
  const fx = Number(order?.fxRateUsed), usd = Number(line?.priceUsd);
  const pen = Number.isFinite(usd) && usd > 0 && Number.isFinite(fx) && fx > 0 ? Math.round(usd * qty * fx * 100) / 100 : null;
  const subject = `Tu producto se agotó en la tienda: te devolvemos el total (${id})`;
  const ask = "Responde a este correo con «tarjeta» o «saldo Aria» y lo hacemos de inmediato.";
  const text = [
    `Hola${name ? " " + name : ""},`,
    "",
    `Lo sentimos: ${title} se agotó en la tienda antes de que pudiéramos comprarlo para tu pedido ${id}.`,
    "",
    `Te devolvemos el total${pen != null ? " (" + soles(pen) + ")" : ""}: a tu tarjeta o en saldo Aria, tú eliges.`,
    ask,
    "",
    `¿Preguntas? Escríbenos a ${REPLY_TO} con tu número de pedido.`,
    "",
    "Aria",
  ].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F4F6FB;font-family:Arial,Helvetica,sans-serif;color:#0A1F44">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #E3E8F2">
    <p style="font-size:15px;margin:0 0 12px">Hola${name ? " " + esc(name) : ""},</p>
    <p style="font-size:15px;margin:0 0 12px">Lo sentimos: <b>${esc(title)}</b> se agotó en la tienda antes de que pudiéramos comprarlo para tu pedido <b>${esc(id)}</b>.</p>
    <p style="font-size:15px;margin:0 0 12px">Te devolvemos el total${pen != null ? ` (<b>${esc(soles(pen))}</b>)` : ""}: a tu tarjeta o en saldo Aria, tú eliges.</p>
    <p style="font-size:14px;margin:0 0 16px">${esc(ask)}</p>
    <p style="font-size:13px;margin:0;color:#5B6478">¿Preguntas? Escríbenos a <a href="mailto:${REPLY_TO}" style="color:#1F5BD8">${REPLY_TO}</a> con tu número de pedido.</p>
  </div>
  <p style="font-size:12px;color:#8A93A8;text-align:center;margin:16px 0 0">Aria · ariashop.pe</p>
</div></body></html>`;
  return { to, subject, text, html };
}

/* NODEMAILER STAYS ON 9.x, PLAIN COMMONJS (2026-10-18, round 4).
   10.x ships an ES-module build; Netlify's function bundler converted it
   into "import_smtp_transport.default is not a constructor" before any
   connection was attempted. 9.1.1 is CommonJS. The factory is looked up
   on both module shapes so a bundler that hands back the namespace or
   the default works either way. */
export async function nodemailerCreateTransport() {
  const mod = await import("nodemailer");
  const make = mod.createTransport || (mod.default && mod.default.createTransport);
  if (typeof make !== "function") throw new Error("nodemailer no expone createTransport en este bundle");
  return make;
}

/** Which provider this environment can send with: "smtp", "resend" or null. */
export function emailProvider(env = process.env) {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return "smtp";
  if (env.RESEND_API_KEY) return "resend";
  return null;
}

/**
 * Send it. Returns { sent: true, id } or { sent: false, error } -- never
 * throws, because the caller is the payment webhook.
 */
export async function sendOrderConfirmation(order, { env = process.env, fetchImpl = fetch, createTransport = null } = {}) {
  const msg = orderConfirmationEmail(order);
  if (!msg.to) return { sent: false, error: "el pedido no tiene un correo válido" };
  const provider = emailProvider(env);
  if (!provider) return { sent: false, error: "no hay proveedor de correo configurado (SMTP_HOST/SMTP_USER/SMTP_PASS o RESEND_API_KEY)" };
  if (provider === "smtp") {
    try {
      const make = createTransport || await nodemailerCreateTransport();
      const port = Number(env.SMTP_PORT) || 465;
      const transport = make({
        host: env.SMTP_HOST, port, secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
      const info = await transport.sendMail({
        from: env.ARIA_EMAIL_FROM || `Aria <${env.SMTP_USER}>`,
        to: msg.to,
        replyTo: REPLY_TO,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      return { sent: true, id: (info && info.messageId) || null };
    } catch (e) {
      return { sent: false, error: String(e && e.message || e) };
    }
  }
  const key = env.RESEND_API_KEY;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `order-confirmation/${order.orderId}`,
      },
      body: JSON.stringify({
        from: env.ARIA_EMAIL_FROM || DEFAULT_FROM,
        to: [msg.to],
        reply_to: REPLY_TO,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { sent: false, error: (data && (data.message || data.error)) || `Resend respondió ${res.status}` };
    return { sent: true, id: data && data.id };
  } catch (e) {
    return { sent: false, error: String(e && e.message || e) };
  }
}
