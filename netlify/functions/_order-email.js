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

   HOW IT SENDS: Resend's HTTP API, one fetch, no dependency.
     RESEND_API_KEY   the API key (required; without it nothing is sent
                      and the order records why)
     ARIA_EMAIL_FROM  sender, default "Aria <pedidos@ariashop.pe>"; the
                      domain must be verified in Resend
   A failed send never fails the webhook: the payment is recorded either
   way, and the order carries confirmationEmailError for ops.
   ============================================================ */
import { lastMileEtaEs } from "../../couriers.js";

export const DEFAULT_FROM = "Aria <pedidos@ariashop.pe>";
export const REPLY_TO = "contacto@ariashop.pe";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const soles = (n) => "S/ " + (Math.round(Number(n) * 100) / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    return `${it.title}${size ? ` (talla ${size})` : ""} x${qty}`;
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
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
      ${items.map((it) => `<tr><td style="padding:8px 0;border-bottom:1px solid #EEF1F7">${esc(lineText(it))}</td></tr>`).join("")}
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

/**
 * Send it. Returns { sent: true, id } or { sent: false, error } -- never
 * throws, because the caller is the payment webhook.
 */
export async function sendOrderConfirmation(order, { env = process.env, fetchImpl = fetch } = {}) {
  const msg = orderConfirmationEmail(order);
  if (!msg.to) return { sent: false, error: "el pedido no tiene un correo válido" };
  const key = env.RESEND_API_KEY || "";
  if (!key) return { sent: false, error: "RESEND_API_KEY no está configurado" };
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
