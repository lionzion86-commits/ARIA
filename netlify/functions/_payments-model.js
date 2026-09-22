/* ============================================================
   THE PAYMENT MODEL — what a gateway event MEANS. PURE.

   No Blobs, no HTTP, no Stripe SDK: a function from (what we knew, what
   just happened) to (what we know now). Split out of _payments.js for
   the same reason _shipping/provider.js is split from store.js and
   admin-shipping.js — the rules that decide whether money arrived are
   the part most worth testing, and they should be testable without a
   deploy, a network or a storage stub. scripts/test/run-tests.mjs
   imports this file directly.

   ------------------------------------------------------------
   THE RULE THIS FILE ENCODES
   An order reads "paid" only because a gateway event said so. The
   webhook's job is to prove the event is genuine (see _stripe-verify.js);
   this file's job is to decide what a genuine event means. Neither job
   can be done from a browser.

   WHY TWO FIELDS ON AN ORDER, NOT ONE
     status         where the order is in FULFILMENT. Aria's own word.
     paymentStatus  whether MONEY ARRIVED.
   Before this existed, orders-create.js wrote status "confirmed" on
   every order the checkout form posted, and nothing had charged anyone —
   there was no gateway, no card form and no webhook anywhere in the
   repo. Collapsing the two is what produced a record that claimed a
   payment nobody made, on the one field ops would reconcile a bank
   statement against.
   ------------------------------------------------------------ */

/** Minor units to major, in the currency the gateway actually charged. */
export const fromMinor = (minor) => Math.round(Number(minor || 0)) / 100;

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* How far a captured amount may sit from the order's own total before ops
   is told about it. One cent of FX rounding is noise; a sol is not.
   A mismatch is never auto-corrected — it is surfaced, because the two
   plausible causes (a tampered amount, and a price that moved between
   the quote and the charge) need a human to tell apart. */
export const AMOUNT_TOLERANCE_PEN = 0.5;

/**
 * The order id a gateway event claims, or null.
 *
 * Stripe metadata is free-form and set by whatever creates the intent, so
 * both the camelCase and snake_case spellings are read. An event with no
 * order id is not an error — it is an unmatched payment, which is exactly
 * the thing the dashboard exists to flag.
 */
export function orderIdFromMetadata(metadata) {
  const m = metadata || {};
  const raw = m.orderId ?? m.order_id ?? m.ariaOrderId ?? null;
  const id = String(raw ?? "").trim();
  return id || null;
}

/**
 * Fold one gateway event into a payment record.
 *
 * Pure, and exported separately from the webhook, so the state machine
 * can be tested without HTTP, without Blobs and without Stripe. The
 * webhook's job is to prove the event is genuine; this function's job is
 * to decide what it means.
 *
 * `events` is append-only. A payment's history is the only way to answer
 * "when did this become disputed", and Stripe will not keep answering
 * that for us forever.
 */
export function applyPaymentEvent(existing, ev) {
  const prior = existing || {
    paymentId: ev.paymentId,
    provider: "stripe",
    status: "unknown",
    currency: ev.currency || null,
    amount: 0,
    amountRefunded: 0,
    orderId: null,
    customerEmail: null,
    chargeId: null,
    livemode: Boolean(ev.livemode),
    createdAt: ev.occurredAt,
    events: [],
  };

  const next = {
    ...prior,
    paymentId: ev.paymentId,
    currency: ev.currency || prior.currency,
    livemode: ev.livemode === undefined ? prior.livemode : Boolean(ev.livemode),
    // An order id, once seen, is never unset by a later event that omits
    // it: a refund event carrying no metadata must not orphan a payment
    // that was matched when it succeeded.
    orderId: ev.orderId || prior.orderId,
    customerEmail: ev.customerEmail || prior.customerEmail,
    chargeId: ev.chargeId || prior.chargeId,
    receivedAt: new Date().toISOString(),
    lastEventId: ev.eventId || prior.lastEventId || null,
    lastEventType: ev.type,
    events: [
      ...(prior.events || []),
      {
        id: ev.eventId || null, type: ev.type, at: ev.occurredAt,
        amount: ev.amount ?? null, amountRefunded: ev.amountRefunded ?? null,
        failureMessage: ev.failureMessage || null,
      },
    ].slice(-40),
  };

  if (ev.amount != null) next.amount = round2(ev.amount);
  if (ev.amountRefunded != null) next.amountRefunded = round2(ev.amountRefunded);

  switch (ev.type) {
    case "payment_intent.succeeded":
    case "checkout.session.completed":
      next.status = "succeeded";
      next.paidAt = ev.occurredAt;
      break;
    case "payment_intent.payment_failed":
      next.status = "failed";
      next.failureMessage = ev.failureMessage || null;
      break;
    case "payment_intent.canceled":
      next.status = "canceled";
      break;
    case "charge.refunded":
      /* Partially refunded is NOT refunded. Ops reconciling a SUNAT
         over-estimate against a full refund would otherwise read a S/ 20
         goodwill refund as the whole order coming back. */
      next.status = next.amountRefunded > 0 && next.amountRefunded >= next.amount
        ? "refunded"
        : "partially_refunded";
      break;
    case "charge.dispute.created":
      next.status = "disputed";
      break;
    case "charge.dispute.closed":
      next.status = ev.disputeWon ? "succeeded" : "lost_dispute";
      break;
    default:
      // An event type we do not model still gets recorded in `events`
      // above — it just does not move the status. Silence would be worse:
      // the history is how anyone finds out we are missing a case.
      break;
  }

  return next;
}

/**
 * What a payment means for its order, as fields to merge onto the order
 * record. Returns null when there is nothing to write.
 *
 * THIS IS THE ONLY PLACE paymentStatus BECOMES "paid", and it takes a
 * payment record that a verified webhook produced. There is no code path
 * from a browser to this function.
 */
export function orderPatchForPayment(order, payment) {
  if (!order || !payment) return null;

  const paid = payment.status === "succeeded" || payment.status === "partially_refunded";
  const patch = {
    paymentId: payment.paymentId,
    paymentProvider: payment.provider,
    paymentStatus: paymentStatusFor(payment),
    paymentCurrency: payment.currency || null,
    paidAt: paid ? payment.paidAt || payment.receivedAt : null,
    /* What the gateway actually captured, beside what we asked for. Kept
       as its own field rather than overwriting pricePenCharged, because
       "what we billed" and "what cleared" are different facts and the
       gap between them is the first thing ops needs to see. */
    amountCapturedPen: payment.currency === "pen" ? round2(payment.amount) : null,
    amountRefundedPen: payment.currency === "pen" ? round2(payment.amountRefunded || 0) : null,
  };

  /* The mismatch flag. Only computable when the gateway charged soles and
     the order knows what it billed; otherwise null, never 0 — a zero here
     would read as "checked, and they agree". */
  const billed = Number(order.pricePenCharged);
  if (patch.amountCapturedPen != null && Number.isFinite(billed) && paid) {
    const delta = round2(patch.amountCapturedPen - billed);
    patch.amountMismatchPen = Math.abs(delta) > AMOUNT_TOLERANCE_PEN ? delta : 0;
  } else {
    patch.amountMismatchPen = null;
  }

  /* FULFILMENT FOLLOWS PAYMENT, NOT THE OTHER WAY ROUND. An order sits at
     pending_payment until money arrives; it never walks backwards out of
     a status ops set by hand (shipped, delivered, cancelled). */
  if (paid && (!order.status || order.status === "pending_payment")) {
    patch.status = "confirmed";
  }
  return patch;
}

/** The order-side word for a payment's state. One mapping, one place. */
export function paymentStatusFor(payment) {
  switch (payment?.status) {
    case "succeeded": return "paid";
    case "partially_refunded": return "partially_refunded";
    case "refunded": return "refunded";
    case "disputed": return "disputed";
    case "lost_dispute": return "lost_dispute";
    case "failed": return "failed";
    case "canceled": return "canceled";
    default: return "unknown";
  }
}

/** True when a payment needs a human: no order, or the wrong amount. */
export function needsAttention(payment, order) {
  if (!payment) return null;
  if (!payment.orderId) return "sin pedido asociado";
  if (!order) return `el pedido ${payment.orderId} no existe`;
  if (payment.currency && payment.currency !== "pen") return `cobrado en ${payment.currency.toUpperCase()}`;
  const billed = Number(order.pricePenCharged);
  if (Number.isFinite(billed) && Math.abs(round2(payment.amount - billed)) > AMOUNT_TOLERANCE_PEN) {
    return `monto distinto al facturado (S/ ${round2(payment.amount)} vs S/ ${round2(billed)})`;
  }
  return null;
}
