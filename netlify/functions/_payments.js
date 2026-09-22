/* ============================================================
   PAYMENTS STORAGE — Blobs, and nothing that makes a decision.

   The rules live in _payments-model.js (pure, and unit-tested). This
   file only reads and writes. Same split as _shipping/store.js against
   _shipping/provider.js, for the same reason.

   ------------------------------------------------------------
   STORE LAYOUT ("payments")

     <paymentId>        the payment record (Stripe payment_intent id)
     evt:<eventId>      an idempotency marker: this Stripe event was
                        already applied. Stripe retries deliveries, and a
                        retry must not double-count a refund.

   The evt: prefix is filtered out of every listing, the same way
   orders-create.js's "count:" keys are filtered out of the orders store
   and _shipping/store.js's "track:" pointers are filtered out of
   shipments. One store, two kinds of key, one convention.
   ------------------------------------------------------------ */

import { getStore } from "@netlify/blobs";

export const PAYMENTS_STORE = "payments";
export const EVENT_PREFIX = "evt:";

/* Re-exported so a caller needs one import, not two. */
export {
  fromMinor, AMOUNT_TOLERANCE_PEN, orderIdFromMetadata, applyPaymentEvent,
  orderPatchForPayment, paymentStatusFor, needsAttention,
} from "./_payments-model.js";

export async function readPayment(paymentId) {
  if (!paymentId) return null;
  const store = getStore(PAYMENTS_STORE);
  return (await store.get(String(paymentId), { type: "json" })) || null;
}

export async function writePayment(payment) {
  const store = getStore(PAYMENTS_STORE);
  await store.setJSON(payment.paymentId, payment);
  return payment;
}

/** Payment keys only — never the evt: idempotency markers. */
export async function listPaymentKeys() {
  const store = getStore(PAYMENTS_STORE);
  const { blobs } = await store.list();
  return blobs.map((b) => b.key).filter((k) => !k.startsWith(EVENT_PREFIX));
}

/**
 * Payments, newest first.
 *
 * `limit` is not a nicety: Blobs has no batch read, so every record is a
 * separate GET and an unbounded list is a function timeout waiting to
 * happen (admin-orders-list.js has exactly that bug — see the audit note
 * in admin-dashboard.js). Keys are listed first, which is one call, and
 * only the page is fetched.
 */
export async function listPayments({ limit = 100 } = {}) {
  const store = getStore(PAYMENTS_STORE);
  const keys = await listPaymentKeys();
  const rows = (await Promise.all(keys.map((k) => store.get(k, { type: "json" }).catch(() => null))))
    .filter(Boolean)
    .sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")));
  return { payments: rows.slice(0, limit), total: rows.length };
}

/** True once this gateway event has been applied. Stripe retries. */
export async function eventAlreadyApplied(eventId) {
  if (!eventId) return false;
  const store = getStore(PAYMENTS_STORE);
  return Boolean(await store.get(EVENT_PREFIX + eventId, { type: "json" }));
}

export async function markEventApplied(eventId, paymentId) {
  if (!eventId) return;
  const store = getStore(PAYMENTS_STORE);
  await store.setJSON(EVENT_PREFIX + eventId, { paymentId: paymentId || null, at: new Date().toISOString() });
}
