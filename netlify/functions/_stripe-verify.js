/* ============================================================
   STRIPE EVENT VERIFICATION AND FLATTENING. PURE.

   node:crypto only: no Blobs, no HTTP, no network, no SDK. Split out of
   stripe-webhook.js so the part that decides whether a request is
   genuinely from Stripe can be tested directly — the one function in
   this codebase where being wrong means accepting a forged payment.
   scripts/test/run-tests.mjs imports this file.

   NO SDK, ON PURPOSE. Verifying a Stripe signature is an HMAC-SHA256
   over "<timestamp>.<raw body>" compared against the v1 scheme in the
   Stripe-Signature header. That is nine lines below. Adding the `stripe`
   package to a serverless build to avoid those nine lines costs a
   dependency, a cold-start penalty and a supply-chain surface on the one
   endpoint that must never be tampered with. The algorithm is Stripe's
   published construct_event.
   ============================================================ */

import { createHmac, timingSafeEqual } from "node:crypto";
import { fromMinor, orderIdFromMetadata } from "./_payments-model.js";

/* Stripe's own default. An attacker replaying a captured request more
   than five minutes later gets rejected even with a valid signature. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** The raw bytes Stripe signed, however Netlify chose to hand them over. */
export function rawBodyOf(event) {
  if (event?.isBase64Encoded && typeof event.body === "string") {
    return Buffer.from(event.body, "base64").toString("utf8");
  }
  return typeof event?.body === "string" ? event.body : "";
}

/**
 * Stripe's v1 signature scheme, verified.
 *
 * Header shape: `t=1699999999,v1=abc...,v1=def...` — more than one v1 is
 * normal while a secret is being rotated, and ANY of them matching is a
 * pass, which is what makes rotation possible without dropped events.
 *
 * @returns {{ok: true, timestamp: number} | {ok: false, reason: string}}
 */
export function verifyStripeSignature({ rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (!header) return { ok: false, reason: "missing Stripe-Signature header" };

  let timestamp = null;
  const signatures = [];
  for (const part of String(header).split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signatures.push(value);
  }

  if (!Number.isFinite(timestamp)) return { ok: false, reason: "no timestamp in signature header" };
  if (!signatures.length) return { ok: false, reason: "no v1 signature in header" };
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "signature timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  for (const candidate of signatures) {
    let given;
    try { given = Buffer.from(candidate, "hex"); } catch { continue; }
    // Length-check first: timingSafeEqual throws on a mismatch rather
    // than returning false, and a wrong length is not a secret anyway.
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ok: true, timestamp };
    }
  }
  return { ok: false, reason: "signature does not match" };
}

/** Types this endpoint acts on. Anything else is recorded, not applied. */
export const HANDLED_EVENTS = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "checkout.session.completed",
]);

/**
 * A Stripe event, flattened into the shape applyPaymentEvent() wants.
 *
 * Stripe puts the same facts in different places depending on the object:
 * a payment_intent carries `amount_received`, a charge carries `amount`
 * and `amount_refunded`, a dispute carries the charge it belongs to and a
 * checkout session carries a `payment_intent` reference. This is the one
 * place that knows the difference.
 *
 * Returns null when the event carries no payment identity at all — there
 * is nothing to key a record on, so there is nothing to record.
 */
export function normalizeStripeEvent(stripeEvent) {
  const type = String(stripeEvent?.type || "");
  const obj = stripeEvent?.data?.object || {};
  const occurredAt = stripeEvent?.created
    ? new Date(stripeEvent.created * 1000).toISOString()
    : new Date().toISOString();

  const base = {
    eventId: stripeEvent?.id || null,
    type,
    occurredAt,
    livemode: Boolean(stripeEvent?.livemode),
  };

  if (type.startsWith("payment_intent.")) {
    if (!obj.id) return null;
    return {
      ...base,
      paymentId: obj.id,
      currency: (obj.currency || "").toLowerCase() || null,
      // amount_received is what actually cleared; amount is what was
      // requested. On a success they agree, and on anything else the
      // received figure is the honest one.
      amount: fromMinor(obj.amount_received ?? obj.amount),
      orderId: orderIdFromMetadata(obj.metadata),
      customerEmail: obj.receipt_email || obj.customer_email || null,
      chargeId: obj.latest_charge || null,
      failureMessage: obj.last_payment_error?.message || null,
    };
  }

  if (type === "checkout.session.completed") {
    const paymentId = obj.payment_intent || obj.id;
    if (!paymentId) return null;
    return {
      ...base,
      paymentId,
      currency: (obj.currency || "").toLowerCase() || null,
      amount: fromMinor(obj.amount_total),
      orderId: orderIdFromMetadata(obj.metadata),
      customerEmail: obj.customer_details?.email || obj.customer_email || null,
      chargeId: null,
    };
  }

  if (type === "charge.refunded") {
    const paymentId = obj.payment_intent;
    if (!paymentId) return null;
    return {
      ...base,
      paymentId,
      currency: (obj.currency || "").toLowerCase() || null,
      amount: fromMinor(obj.amount),
      amountRefunded: fromMinor(obj.amount_refunded),
      orderId: orderIdFromMetadata(obj.metadata),
      customerEmail: obj.billing_details?.email || obj.receipt_email || null,
      chargeId: obj.id || null,
    };
  }

  if (type.startsWith("charge.dispute.")) {
    // A dispute's payment_intent is on the dispute object itself; older
    // API versions only give the charge, which is recorded either way.
    const paymentId = obj.payment_intent;
    if (!paymentId) return null;
    return {
      ...base,
      paymentId,
      currency: (obj.currency || "").toLowerCase() || null,
      orderId: orderIdFromMetadata(obj.metadata),
      chargeId: obj.charge || null,
      disputeWon: obj.status === "won",
    };
  }

  // Something we did not model. If it names a payment intent it is still
  // worth appending to that payment's history.
  const paymentId = obj.payment_intent || (type.startsWith("payment_intent") ? obj.id : null);
  if (!paymentId) return null;
  return { ...base, paymentId, orderId: orderIdFromMetadata(obj.metadata) };
}
