/* ============================================================
   IS THIS PREVIEW WIRED TO THE RIGHT STRIPE ACCOUNT? (2026-10-17, #367)

   Before the testers start, Lucifer asked for three confirmations:
     1. the installed key belongs to the new account (acct_1URJry…, not
        the sandbox acct_1URJsA…), and the webhook is registered in that
        same account and mode;
     2. the preview URL for the test order;
     3. the charge is in PEN and equals the card's soles price to the
        céntimo.
   None of that can be read from the code, so this endpoint asks Stripe
   with the installed key and answers in one JSON:

     GET /.netlify/functions/stripe-check?expect=acct_1URJryD00oB1thiK
     GET /.netlify/functions/stripe-check?order=<id>&session=<cs_…>

   It never returns a key or a signing secret -- only account ids,
   yes/no flags and amounts -- and it does not exist on production.
   Read-only: nothing here writes to Stripe or to the order book.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { retrieveCheckoutSession } from "./_stripe-api.js";
import { toMinor } from "./_checkout-model.js";

const PRODUCTION_HOSTS = new Set(["ariashop.pe", "www.ariashop.pe"]);
const WEBHOOK_PATH = "/.netlify/functions/stripe-webhook";
/* The events the #367 setup asks for (the PR body's list). */
export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed", "checkout.session.expired",
  "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "payment_intent.succeeded", "payment_intent.payment_failed",
  "charge.refunded", "charge.dispute.created", "charge.dispute.closed",
];

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body, null, 2),
});

/**
 * The report, from what Stripe and the order book said. Pure, so the
 * rules are tested without a network.
 */
export function stripeCheckReport({ host, keyMode, webhookSecretSet, account, endpoints, expect, session, order }) {
  const wantUrl = `https://${host}${WEBHOOK_PATH}`;
  const hook = (endpoints || []).find((e) => e && e.url === wantUrl) || null;
  const events = hook ? hook.enabled_events || [] : [];
  const missingEvents = hook && !events.includes("*") ? REQUIRED_WEBHOOK_EVENTS.filter((e) => !events.includes(e)) : (hook ? [] : REQUIRED_WEBHOOK_EVENTS.slice());
  const report = {
    previewUrl: `https://${host}/`,
    key: { mode: keyMode, account: account ? account.id : null },
    accountMatchesExpected: expect ? Boolean(account && account.id === expect) : null,
    webhook: {
      url: wantUrl,
      registeredInThisAccount: Boolean(hook),
      enabled: hook ? hook.status === "enabled" : false,
      livemode: hook ? Boolean(hook.livemode) : null,
      missingEvents,
      signingSecretInstalled: Boolean(webhookSecretSet),
    },
  };
  if (session) {
    const expected = order ? toMinor(order.pricePenCharged) : null;
    report.charge = {
      sessionId: session.id,
      currency: session.currency || null,
      amountTotalCentimos: session.amount_total ?? null,
      orderChargedPen: order ? order.pricePenCharged : null,
      paymentStatus: session.payment_status || null,
      penAndExact: Boolean(order) && session.currency === "pen" && session.amount_total === expected,
    };
  }
  report.ready = keyMode === "test"
    && (report.accountMatchesExpected !== false)
    && report.webhook.registeredInThisAccount && report.webhook.enabled
    && report.webhook.livemode === false
    && report.webhook.missingEvents.length === 0
    && report.webhook.signingSecretInstalled;
  return report;
}

async function stripeGet(path, key) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error((data && data.error && data.error.message) || `Stripe respondió ${res.status}`);
  return data;
}

export async function handler(event) {
  const host = String(event.headers?.host || event.headers?.Host || "").toLowerCase();
  if (PRODUCTION_HOSTS.has(host)) return json(404, { error: "Not found" });
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const q = event.queryStringParameters || {};
  const key = process.env.STRIPE_SECRET_KEY || "";
  const keyMode = /^(sk|rk)_test_/.test(key) ? "test" : /^(sk|rk)_live_/.test(key) ? "live" : null;
  if (!keyMode) return json(200, { ready: false, reason: "STRIPE_SECRET_KEY no está configurado en este entorno" });

  let account = null, endpoints = [];
  try { account = await stripeGet("account", key); }
  catch (e) { return json(200, { ready: false, reason: "Stripe rechazó la clave: " + e.message }); }
  try { endpoints = (await stripeGet("webhook_endpoints?limit=100", key)).data || []; }
  catch (e) { return json(200, { ready: false, reason: "No se pudo listar los webhooks: " + e.message }); }

  let session = null, order = null;
  const sessionId = String(q.session || "").trim();
  const orderId = String(q.order || "").trim();
  if (sessionId && orderId) {
    connectLambda(event);
    order = await getStore("orders").get(orderId, { type: "json" });
    /* Only the order's own session: an order id alone reveals nothing. */
    if (!order || order.stripeSessionId !== sessionId) return json(404, { error: "Pedido no encontrado" });
    try { session = await retrieveCheckoutSession(sessionId, key); }
    catch (e) { return json(200, { ready: false, reason: "No se pudo leer la sesión: " + e.message }); }
  }

  return json(200, stripeCheckReport({
    host, keyMode, webhookSecretSet: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    account, endpoints, expect: String(q.expect || "").trim() || null, session, order,
  }));
}
