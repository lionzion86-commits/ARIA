/* ============================================================
   STRIPE WEBHOOK — THE ONLY DOOR MONEY COMES THROUGH.

   WHAT WAS HERE BEFORE: nothing. There was no webhook, no Stripe
   dependency, and no STRIPE_* variable read anywhere in this repo.
   orders-create.js wrote status "confirmed" on every order the checkout
   form posted, and no card was ever collected. A search of the whole tree
   for "stripe" returned zero hits. That is the hole this closes.

   ------------------------------------------------------------
   THE RULE THIS FILE ENFORCES
   An order reads "paid" only after a request arrived here carrying a
   signature that verified against STRIPE_WEBHOOK_SECRET. There is no
   other path. A browser cannot reach paymentStatus, orders-create.js
   cannot set it, and an admin cannot type it in.
   ------------------------------------------------------------

   THE SIGNATURE CHECK AND THE EVENT FLATTENING LIVE IN
   _stripe-verify.js — pure, node:crypto only, and unit-tested, because
   deciding whether a request really came from Stripe is the one function
   here where being wrong means accepting a forged payment. This file is
   the HTTP shell around it: verify, then record.

   FAIL CLOSED, LOUDLY
     * no STRIPE_WEBHOOK_SECRET set -> 503. NOT 200. A 200 would make
       Stripe consider every event delivered and stop retrying, so a
       misconfigured deploy would silently drop real payments forever.
       503 keeps them in Stripe's retry queue until someone fixes it.
     * bad or missing signature   -> 400, nothing written.
     * stale timestamp            -> 400 (replay protection).
     * an event we do not model    -> 200 and recorded in the payment's
       history, because Stripe should not retry something we chose not to
       act on, and silence is how a missing case stays missing.

   RAW BODY MATTERS. The signature is over the exact bytes Stripe sent.
   Netlify hands base64 back for some content types, so the body is
   decoded before it is hashed and never re-serialized.

   ------------------------------------------------------------
   TO TURN THIS ON
     1. In Stripe: Developers -> Webhooks -> add endpoint
          https://ariashop.pe/.netlify/functions/stripe-webhook
        Events: payment_intent.succeeded, payment_intent.payment_failed,
        payment_intent.canceled, charge.refunded, charge.dispute.created,
        charge.dispute.closed, checkout.session.completed.
     2. In Netlify: set STRIPE_WEBHOOK_SECRET to that endpoint's signing
        secret (whsec_...).
     3. Whatever creates the PaymentIntent MUST put the Aria order id in
        metadata.orderId. Without it a payment arrives unmatched — the
        dashboard flags it, but nobody can tell whose money it is.
   Until step 2 is done this endpoint answers 503 and the Payments view
   says, in as many words, that Stripe is not connected.
   ------------------------------------------------------------ */

import { getStore, connectLambda } from "@netlify/blobs";
import {
  applyPaymentEvent, eventAlreadyApplied, markEventApplied,
  orderPatchForPayment, readPayment, writePayment,
} from "./_payments.js";
import {
  HANDLED_EVENTS, normalizeStripeEvent, rawBodyOf, verifyStripeSignature,
} from "./_stripe-verify.js";

/* Re-exported: stripe-webhook.js is the name an operator looks for, so
   the constants they may need to reason about resolve from here too. */
export { HANDLED_EVENTS, SIGNATURE_TOLERANCE_SECONDS } from "./_stripe-verify.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function handler(event) {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) {
    /* 503, never 200. See FAIL CLOSED above: a 200 here tells Stripe the
       event was handled and it stops retrying, which would turn a missing
       environment variable into permanently lost payments. */
    return json(503, {
      error: "STRIPE_WEBHOOK_SECRET no está configurado. Este endpoint no puede verificar eventos todavía.",
    });
  }

  const rawBody = rawBodyOf(event);
  const header = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];
  const verified = verifyStripeSignature({ rawBody, header, secret });
  if (!verified.ok) {
    // Deliberately terse to the caller: a detailed rejection reason is an
    // oracle. The reason is returned but not logged with the body.
    return json(400, { error: `Firma inválida: ${verified.reason}` });
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Cuerpo no es JSON" });
  }

  /* Idempotency BEFORE anything is written. Stripe retries on any non-2xx
     and on timeouts, so the same refund can arrive three times; applying
     it three times would triple amountRefunded. */
  if (await eventAlreadyApplied(stripeEvent.id)) {
    return json(200, { ok: true, duplicate: true, eventId: stripeEvent.id });
  }

  const normalized = normalizeStripeEvent(stripeEvent);
  if (!normalized) {
    // Nothing to key a record on. 200 so Stripe stops retrying an event
    // we genuinely have no use for.
    await markEventApplied(stripeEvent.id, null);
    return json(200, { ok: true, ignored: true, reason: "el evento no nombra ningún pago", type: stripeEvent.type });
  }

  try {
    const existing = await readPayment(normalized.paymentId);
    const payment = applyPaymentEvent(existing, normalized);
    await writePayment(payment);

    /* MATCHING. A payment that names no order, or names one that does not
       exist, is written anyway and left flagged — money that arrived is a
       fact whether or not we can explain it, and losing the record would
       be worse than holding an unmatched one. The dashboard's Payments
       view is where it gets chased. */
    let orderUpdated = false;
    let matchError = null;
    if (payment.orderId) {
      const ordersStore = getStore("orders");
      const order = await ordersStore.get(payment.orderId, { type: "json" });
      if (!order) {
        matchError = "order not found";
      } else {
        const patch = orderPatchForPayment(order, payment);
        if (patch) {
          await ordersStore.setJSON(payment.orderId, { ...order, ...patch });
          orderUpdated = true;
        }
      }
    }

    await markEventApplied(stripeEvent.id, payment.paymentId);
    return json(200, {
      ok: true,
      handled: HANDLED_EVENTS.has(normalized.type),
      paymentId: payment.paymentId,
      status: payment.status,
      orderId: payment.orderId,
      orderUpdated,
      matchError,
    });
  } catch (error) {
    /* 500 on purpose: the event is NOT marked applied, so Stripe retries
       it. A swallowed write error would lose a payment record and nobody
       would know until the month's numbers did not add up. */
    return json(500, { error: error.message });
  }
}
