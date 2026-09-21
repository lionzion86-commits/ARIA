// The one place "payment" actually finalizes (still simulated — no real
// payment gateway exists or is in scope here). Enforces the daily order
// cap / kill switch ("launch cash control") and, when the order goes
// through, persists a real order record that both orders-remaining.js's
// counter and the admin margin-test view (admin-orders-*.js) read from.
//
// NOT atomic: the counter is a plain read-modify-write against Blobs, not
// a compare-and-swap. Acceptable for a low-volume launch-phase cap (a
// couple of near-simultaneous orders at the exact cap boundary could both
// slip through) — a real atomic counter would need a different storage
// primitive than Blobs offers; flagged here rather than silently assumed
// perfect.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { readWallet, postTransaction, applicableCreditPen } from "./_wallet.js";
import { peruDateKey, normalizeBatchHour, DEFAULT_BATCH_HOUR } from "./_peru-time.js";
import { randomBytes } from "node:crypto";
import { smallOrderFeePen, importTaxEstimateUsd, TAX_ESTIMATE_RATE } from "../../weight-data.js";

const DEFAULT_SETTINGS = { paused: false, dailyCap: 40, batchHour: DEFAULT_BATCH_HOUR };
const HELD_MESSAGE = "Estamos en lanzamiento y queremos que tu pedido llegue perfecto: procesamos un número limitado de pedidos por día. Si el cupo de hoy se completa, tu carrito se guarda automáticamente y tu pedido entra primero mañana. Gracias por ser parte del inicio de Aria.";

// Real Culqi/Niubiz-class card-gateway fee is not something I can verify
// from here — this is a disclosed estimate (common Peru gateway rate),
// not a confirmed real number. The admin view (Phase 5) shows it labeled
// as an estimate, never as a real reconciled fee.
const GATEWAY_FEE_RATE_ESTIMATE = 0.0399;
const GATEWAY_FEE_FIXED_PEN_ESTIMATE = 0.5;

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * The person who will actually take the parcel, or null for the buyer.
 *
 * THE DOCUMENT IS MANDATORY and it is enforced here, not only in the
 * form: aduanas and the courier check ID at handoff, and a recipient
 * whose document is missing from the manifest can be refused the box.
 * A recipient with no name or no document is therefore not a
 * half-filled recipient — it is no recipient, and recording it as one
 * would put a name on the manifest that the courier cannot verify.
 */
function normalizeRecipient(raw) {
  if (!raw || typeof raw !== "object") return null;
  const recipient = {
    name: clean(raw.name, 120),
    idNumber: clean(raw.idNumber ?? raw.doc, 40),
    relationship: clean(raw.relationship, 80),
    deliveryInstructions: clean(raw.deliveryInstructions, 400),
  };
  if (!recipient.name || !recipient.idNumber) return null;
  return recipient;
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const quote = body.quote || {};
  if (!items.length || typeof quote.total_usd !== "number") {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Pedido inválido" }) };
  }

  try {
    const settingsStore = getStore("settings");
    const ordersStore = getStore("orders");
    const settings = (await settingsStore.get("global", { type: "json" })) || DEFAULT_SETTINGS;

    const batchHour = normalizeBatchHour(settings.batchHour);

    if (settings.paused) {
      return { statusCode: 200, headers, body: JSON.stringify({ held: true, message: HELD_MESSAGE, batchHour }) };
    }

    // Peru-day key, not UTC: this counter is what "pedidos por día" means
    // to the customer, and the batch runs on Peru mornings. See
    // _peru-time.js for why the UTC date was wrong.
    const dateKey = peruDateKey();
    const counterKey = `count:${dateKey}`;
    const counter = (await ordersStore.get(counterKey, { type: "json" })) || { count: 0 };

    if (counter.count >= settings.dailyCap) {
      return { statusCode: 200, headers, body: JSON.stringify({ held: true, message: HELD_MESSAGE, batchHour }) };
    }

    /* THE RECIPIENT IS VALIDATED BEFORE ANYTHING IS CHARGED. The form
       marks the fields required, but a form can be bypassed, and a box
       that reaches Lima addressed to a name with no document is a failed
       delivery we have already paid the freight on. */
    const recipientAsked = body.recipient && typeof body.recipient === "object";
    const recipient = normalizeRecipient(body.recipient);
    if (recipientAsked && !recipient) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Falta el nombre o el documento de quien recibe el paquete. El courier necesita ambos para entregarlo.",
        }),
      };
    }

    const priceUsdTotal = items.reduce((sum, it) => sum + (Number(it.priceUsd) || 0) * (Number(it.qty) || 1), 0);
    const weightKgTotal = items.reduce((sum, it) => sum + (Number(it.weightKg) || 0) * (Number(it.qty) || 1), 0);
    const fxRateVenta = typeof body.fxRateVenta === "number" ? body.fxRateVenta : null;
    /* SMALL-ORDER FEE. The browser sends what it showed, but the server
       decides what is charged: the fee is recomputed here, so a tampered
       request cannot zero it and a stale page cannot charge one that no
       longer applies. The rule and both numbers live in weight-data.js —
       never inlined.

       BASE: PRODUCTS + INTERNATIONAL FREIGHT (2026-09-20). Measuring the
       threshold against products alone charged a "pedido pequeño" fee on
       a S/ 54.76 order whose own label promised no charge from S/ 50.
       The freight component comes off the same quote the customer was
       shown; duty is deliberately excluded (see weight-data.js). */
    const productsPen = fxRateVenta ? Math.round(priceUsdTotal * fxRateVenta * 100) / 100 : null;
    const freightUsdQuoted = typeof quote.flete_usd === "number" ? quote.flete_usd : 0;
    const orderBasePen = productsPen == null
      ? null
      : Math.round((priceUsdTotal + freightUsdQuoted) * fxRateVenta * 100) / 100;
    const smallOrderFeePenCharged = orderBasePen != null ? smallOrderFeePen(orderBasePen) : 0;

    /* IMPORT TAX — RECOMPUTED, NOT ACCEPTED (2026-09-21).

       The browser sends what it showed so the record can prove the two
       agreed, but the charge is decided here, from the same shared
       helper, for the same reason the small-order fee is: a tampered
       request must not be able to zero it, and a stale page must not be
       able to charge an old rate.

       THE BASE IS THE ORDER'S OWN NUMBERS: goods from the items, freight
       from the quote the customer was shown. The threshold is on the
       goods (FOB), the rate is on goods + freight (CIF) — see
       importTaxEstimateUsd().

       AND IT IS WHAT THE CUSTOMER PAYS, not what the courier bills. The
       quote's total_usd still carries AVI's own duty and is recorded
       below for the margin view, but the customer's total is built from
       goods + freight + THIS number. When AVI bills more, Aria absorbs
       it; when the real SUNAT figure comes in lower, the difference is
       credited back as saldo. taxActual and sunatDocRef are where that
       reconciliation lands. */
    const taxEstimatedUsd = importTaxEstimateUsd(priceUsdTotal, freightUsdQuoted);
    const customerTotalUsd = Math.round((priceUsdTotal + freightUsdQuoted + taxEstimatedUsd) * 100) / 100;
    const taxEstimatedPen = fxRateVenta ? Math.round(taxEstimatedUsd * fxRateVenta * 100) / 100 : null;
    const totalPen = fxRateVenta
      ? Math.round((customerTotalUsd * fxRateVenta + smallOrderFeePenCharged) * 100) / 100
      : null;
    /* SALDO ARIA. The browser asks for an amount; the server decides it.
       The balance is re-read here and capped against both the real
       balance and the order total, so a tampered request can only ever
       spend money the customer actually has (see applicableCreditPen).
       Only a signed-in customer has a wallet at all. */
    const buyerEmail = await getSessionEmail(event);
    let walletAppliedPen = 0;
    let walletBalanceBeforePen = null;
    if (buyerEmail && totalPen != null && Number(body.applyWalletPen) > 0) {
      const wallet = await readWallet(buyerEmail);
      walletBalanceBeforePen = wallet.balancePen;
      walletAppliedPen = applicableCreditPen(wallet.balancePen, totalPen, Number(body.applyWalletPen));
    }
    const chargedPen = totalPen != null ? Math.round((totalPen - walletAppliedPen) * 100) / 100 : null;

    // The gateway fee is charged on what the card actually pays, which is
    // the total after any saldo — crediting a wallet does not make us pay
    // a processor fee on money that never moved.
    const gatewayFeeEstimatePen = chargedPen != null
      ? Math.round((chargedPen * GATEWAY_FEE_RATE_ESTIMATE + GATEWAY_FEE_FIXED_PEN_ESTIMATE) * 100) / 100
      : null;

    // Order IDs carry the same Peru date the counter is keyed on, so an
    // ID always matches the batch day it was counted against.
    const orderId = "ARIA-" + dateKey.replace(/-/g, "") + "-" + randomBytes(3).toString("hex").toUpperCase();
    const order = {
      orderId,
      createdAt: new Date().toISOString(),
      status: "confirmed",
      customer: body.customer || {},
      shipping: body.shipping || {},
      items,
      weightEstimatedKg: Math.round(weightKgTotal * 100) / 100,
      priceScrapedUsdTotal: null, // admin view derives this from priceUsdTotal / (SALES_TAX_RATE*LIVE_PRICE_MARKUP) — same known constants as index.html, not re-sent over the wire
      pricePenCharged: chargedPen,      // after saldo Aria — what the card pays
      orderTotalPen: totalPen,          // before saldo, for the margin view
      walletAppliedPen,
      walletBalanceBeforePen,
      buyerEmail: buyerEmail || null,
      fxRateUsed: fxRateVenta,
      freteChargedUsd: typeof quote.flete_usd === "number" ? quote.flete_usd : null,
      // Itemised on the record, not folded into the total, so the margin
      // view can tell handling revenue apart from freight and product.
      smallOrderFeePen: smallOrderFeePenCharged,
      totalUsd: customerTotalUsd,          // what the customer is charged, in USD
      courierTotalUsd: quote.total_usd,    // what AVI quoted, duty and all — margin view only
      gatewayFeeEstimatePen,
      quoteSource: quote.source || null,

      /* ---- IMPORT TAX, AND ITS RECONCILIATION ----------------------
         taxEstimated* is charged today. taxActual and sunatDocRef are
         written later, when the real assessment arrives, and they exist
         from the first order rather than being bolted on afterwards —
         an order placed before the reconciliation UI ships still has
         somewhere for its real figure to go, so no order is unresolvable
         later for want of a field.

         THE RULE WHEN THEY DIFFER, so the UI cannot invent its own:
           taxActual < taxEstimated  -> credit the difference as saldo Aria.
           taxActual > taxEstimated  -> Aria absorbs it. The customer is
                                        never billed a second time.
         taxReconciledAt stays null until someone has actually done it;
         a null here means "not yet", never "nothing owed". */
      taxEstimatedUsd,
      taxEstimatedPen,
      taxRateUsed: taxEstimatedUsd > 0 ? TAX_ESTIMATE_RATE : null,
      taxActualUsd: null,
      taxActualPen: null,
      sunatDocRef: null,
      taxReconciledAt: null,

      /* Null when the buyer receives it themselves. Carried onto the
         courier manifest — see manifestRow() in _shipping/service.js. */
      recipient,
    };

    await ordersStore.setJSON(orderId, order);
    await ordersStore.setJSON(counterKey, { count: counter.count + 1 });

    /* Debited AFTER the order exists, and never before: a held order (cap
       reached / paused) returns above without touching the wallet, so a
       customer cannot lose saldo on an order that was not placed. If the
       debit itself fails the order still stands and the balance is
       untouched — the customer keeps their money and ops reconciles, which
       is the right way round to fail. */
    let walletBalanceAfterPen = walletBalanceBeforePen;
    if (walletAppliedPen > 0) {
      try {
        const { balancePen } = await postTransaction({
          email: buyerEmail, kind: "debit", amountPen: walletAppliedPen,
          reason: `Aplicado al pedido ${orderId}`, by: "order", orderId,
        });
        walletBalanceAfterPen = balancePen;
      } catch {
        walletAppliedPen = 0;
        await ordersStore.setJSON(orderId, { ...order, walletAppliedPen: 0, pricePenCharged: totalPen });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true, orderId, totalUsd: quote.total_usd, totalPen,
        walletAppliedPen, chargedPen, walletBalancePen: walletBalanceAfterPen,
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
