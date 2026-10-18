/* ============================================================
   CAN THIS DEPLOY SEND THE CONFIRMATION EMAIL? (2026-10-18, #367 #10)

   Two paid proof orders produced no email, and nobody could see why from
   outside: the builder cannot read Netlify's logs or environment. This
   endpoint answers the questions directly, on the preview only:

     GET /.netlify/functions/email-check
       which provider this deploy would use, which mail variables are
       present (names only, never values), whether the SMTP server
       accepts the login, and whether the claim store takes the
       create-only write the webhook relies on.

     GET /.netlify/functions/email-check?to=<you>@ariashop.pe&send=1
       sends a real confirmation email for a made-up order
       (ARIA-PRUEBA-...) and returns what the provider answered.
       Only @ariashop.pe addresses, so the preview cannot be used to
       mail anyone else.

     GET /.netlify/functions/email-check?order=<ARIA-...>
       what the order record says about its email: paymentStatus,
       confirmationEmailSentAt, confirmationEmailError.

   It never returns a secret, and it does not exist on production.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { emailProvider, sendOrderConfirmation } from "./_order-email.js";

const PRODUCTION_HOSTS = new Set(["ariashop.pe", "www.ariashop.pe"]);
const MAIL_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "RESEND_API_KEY", "ARIA_EMAIL_FROM"];

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body, null, 2),
});

/** Names of the mail variables this deploy can see. Never their values. */
export function mailEnvReport(env = process.env) {
  const present = Object.fromEntries(MAIL_VARS.map((k) => [k, Boolean(env[k])]));
  return {
    provider: emailProvider(env),
    present,
    smtpUser: env.SMTP_USER ? String(env.SMTP_USER).replace(/^(.).*(@.*)$/, "$1***$2") : null,
    smtpHost: env.SMTP_HOST || null,
  };
}

/** A made-up paid order for the test send. */
export function testOrder(to) {
  return {
    orderId: "ARIA-PRUEBA-" + new Date().toISOString().replace(/\D/g, "").slice(0, 12),
    paymentStatus: "paid",
    pricePenCharged: 1.0,
    customer: { name: "Prueba", email: to },
    shipping: { destCity: "Arequipa", courier: { id: "olva", name: "Olva Courier" } },
    items: [{ title: "Producto de prueba (no es un pedido real)", qty: 1 }],
  };
}

export async function handler(event, { env = process.env, createTransport = null } = {}) {
  const host = String(event.headers?.host || event.headers?.Host || "").toLowerCase();
  if (PRODUCTION_HOSTS.has(host)) return json(404, { error: "Not found" });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  connectLambda(event);
  const q = event.queryStringParameters || {};
  const report = { deploy: host, mail: mailEnvReport(env) };

  if (q.order) {
    const order = await getStore("orders").get(String(q.order), { type: "json" });
    report.order = order
      ? { orderId: order.orderId, paymentStatus: order.paymentStatus || null, status: order.status || null,
          confirmationEmailSentAt: order.confirmationEmailSentAt || null, confirmationEmailError: order.confirmationEmailError || null }
      : { error: "pedido no encontrado" };
    return json(200, report);
  }

  /* The login itself, without sending anything. */
  if (report.mail.provider === "smtp") {
    try {
      const make = createTransport || (await import("nodemailer")).default.createTransport;
      const port = Number(env.SMTP_PORT) || 465;
      const transport = make({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
      await transport.verify();
      report.smtpLogin = "ok";
    } catch (e) {
      report.smtpLogin = "FAILED: " + String(e && e.message || e);
    }
  }

  /* The create-only write the webhook uses to send exactly once. */
  try {
    const claims = getStore("order-email-claims");
    const key = "email-check-" + Date.now();
    const first = await claims.setJSON(key, { at: new Date().toISOString() }, { onlyIfNew: true });
    const second = await claims.setJSON(key, { at: new Date().toISOString() }, { onlyIfNew: true });
    await claims.delete(key);
    report.claimStore = first && first.modified && second && !second.modified ? "ok" : `unexpected: ${JSON.stringify({ first, second })}`;
  } catch (e) {
    report.claimStore = "FAILED: " + String(e && e.message || e);
  }

  if (q.send) {
    const to = String(q.to || "").trim().toLowerCase();
    if (!/^[^\s@]+@ariashop\.pe$/.test(to)) return json(400, { ...report, error: "solo direcciones @ariashop.pe" });
    const order = testOrder(to);
    report.testSend = { orderId: order.orderId, to, ...(await sendOrderConfirmation(order, { env, createTransport: createTransport || null })) };
  }
  return json(200, report);
}
