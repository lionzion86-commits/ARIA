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
import { smallOrderFeePen } from "../../weight-data.js";

const DEFAULT_SETTINGS = { paused: false, dailyCap: 40, batchHour: DEFAULT_BATCH_HOUR };
const HELD_MESSAGE = "Estamos en lanzamiento y queremos que tu pedido llegue perfecto: procesamos un número limitado de pedidos por día. Si el cupo de hoy se completa, tu carrito se guarda automáticamente y tu pedido entra primero mañana. Gracias por ser parte del inicio de Aria.";

// Real Culqi/Niubiz-class card-gateway fee is not something I can verify
// from here — this is a disclosed estimate (common Peru gateway rate),
// not a confirmed real number. The admin view (Phase 5) shows it labeled
// as an estimate, never as a real reconciled fee.
const GATEWAY_FEE_RATE_ESTIMATE = 0.0399;
const GATEWAY_FEE_FIXED_PEN_ESTIMATE = 0.5;

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
    const totalPen = fxRateVenta
      ? Math.round((quote.total_usd * fxRateVenta + smallOrderFeePenCharged) * 100) / 100
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
      totalUsd: quote.total_usd,
      gatewayFeeEstimatePen,
      quoteSource: quote.source || null,
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
