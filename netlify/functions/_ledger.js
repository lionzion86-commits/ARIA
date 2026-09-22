/* ============================================================
   THE LEDGER — one row per order, for an accountant. SERVER ONLY.

   Columns, and where each number comes from, because an accountant will
   ask and "the dashboard said so" is not an answer:

     Producto           the items' USD, at the order's own FX rate
     Flete cobrado      the freight the customer paid
     Cargo pedido pequeño   the Peru-side handling fee, as charged
     Impuesto estimado  what was charged at checkout (25% of CIF)
     Impuesto real      what SUNAT actually assessed
     Diferencia         estimado - real, which is what is owed back
     Facturado          the order total before saldo Aria
     Saldo aplicado     saldo spent on this order
     Cobrado a tarjeta  what the card was asked for
     Cobrado real       what the gateway actually captured
     Reembolsado        refunds against that payment
     Saldo emitido      credit issued TO the buyer against this order
     Comisión pasarela  gateway fee (estimated, and labelled so)
     Costo producto     what we really paid the retailer (ops entry)
     Costo courier      what the courier really billed (ops entry)
     Margen Aria        revenue minus real costs

   ------------------------------------------------------------
   THE RULE THAT SHAPES EVERY COLUMN: A BLANK IS NOT A ZERO.

   Margen Aria is blank unless somebody entered the real product cost and
   the real courier cost for that order. Not zero — blank. A zero would
   sum, and a column of zeros summing to zero looks like a business that
   broke even rather than one nobody has reconciled yet. The same goes for
   Impuesto real, Cobrado real and both cost columns.

   This is the same principle the rest of the codebase already follows for
   estimates versus measurements, applied to the one artifact that leaves
   the building.
   ------------------------------------------------------------

   CSV DETAILS THAT ARE NOT DECORATION
     * A UTF-8 BOM, because Excel on Windows reads a BOM-less UTF-8 file
       as Latin-1 and renders "Impuesto" as "ImpuestoÂ". Every Spanish
       column heading here would be mangled without it. The manifest CSV
       in _shipping/service.js does the same thing for the same reason.
     * Every field quoted, and embedded quotes doubled, so a customer
       called O"Brien or an address with a comma cannot shift a column.
     * A formula guard: a value starting =, +, - or @ is prefixed with a
       tab, because a cell reading "=2+5" is executed by Excel. Order
       notes are operator-typed free text, which is exactly where that
       gets in.
   ============================================================ */

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * A number, or null. Never 0 as a stand-in for "unknown".
 *
 * THE NULL TRAP, WHICH THIS FILE FELL INTO ONCE. `Number(null)` is 0 and
 * `Number("")` is 0 — both finite — so the obvious
 *
 *     const n = Number(v); return Number.isFinite(n) ? n : null;
 *
 * turns every deliberately-null field into a zero, which is the precise
 * thing THE RULE at the top of this file forbids. orders-create.js writes
 * explicit nulls (taxActualPen: null, amountCapturedPen: null), so every
 * unpaid order was reporting "cobrado real S/ 0.00" and every
 * unreconciled one "impuesto real SUNAT S/ 0.00" — a blank read as a
 * measurement. `undefined` happened to work, which is why it survived a
 * test written against a hand-built record.
 *
 * So null, undefined and "" are all unknown, explicitly, before Number()
 * is allowed anywhere near them.
 */
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** USD to PEN at the rate the order itself recorded, or null. */
function pen(usd, fx) {
  const u = num(usd);
  const rate = num(fx);
  if (u == null || rate == null || rate <= 0) return null;
  return round2(u * rate);
}

/** Saldo issued to this buyer and attributed to this order. */
function creditIssuedPen(order, wallet) {
  if (!wallet || !Array.isArray(wallet.txns)) return null;
  const mine = wallet.txns.filter((t) => t.kind === "credit" && t.orderId === order.orderId);
  if (!mine.length) return null;
  return round2(mine.reduce((sum, t) => sum + (Number(t.amountPen) || 0), 0));
}

/**
 * One order, as ledger facts.
 *
 * `payment` is the matched gateway record or null; `wallet` is the
 * buyer's wallet or null. Both optional: an order with neither still
 * produces a complete row, with blanks where the truth is not known yet.
 */
export function ledgerRow(order, payment, wallet) {
  const fx = num(order.fxRateUsed);
  const productsUsd = (order.items || [])
    .reduce((sum, it) => sum + (num(it.priceUsd) || 0) * (num(it.qty) || 1), 0);

  const taxEstimated = num(order.taxEstimatedPen);
  const taxActual = num(order.taxActualPen);
  /* Blank until the real figure exists. The sign is the one thing an
     accountant reads first, so it is stated the way the policy is:
     positive means we over-collected and owe it back as saldo. */
  const taxDelta = taxEstimated != null && taxActual != null
    ? round2(taxEstimated - taxActual)
    : null;

  const actuals = order.actuals || {};
  const realProductPen = pen(actuals.precioRealPagadoUsd, fx);
  const realCourierPen = pen(actuals.costoRealCourierUsd, fx);

  /* MARGIN. Revenue is what we actually kept: the card capture when we
     have it, the billed figure otherwise — plus saldo applied, which is
     revenue we recognised earlier — minus refunds. Costs are only the
     real ones. If either real cost is missing the margin is null, and
     the CSV prints nothing.

     The gateway fee is included as a cost even though it is an estimate,
     because excluding it overstates margin, and the column beside it says
     "estimada" so nobody mistakes which part is measured. */
  const capturedPen = num(order.amountCapturedPen);
  const billedPen = num(order.pricePenCharged);
  const refundedPen = num(order.amountRefundedPen) || 0;
  const walletAppliedPen = num(order.walletAppliedPen) || 0;
  const gatewayFeePen = num(order.gatewayFeeEstimatePen) || 0;

  const revenuePen = capturedPen != null
    ? round2(capturedPen + walletAppliedPen - refundedPen)
    : (billedPen != null ? round2(billedPen + walletAppliedPen - refundedPen) : null);

  /* SALDO ISSUED IS A COST, and leaving it out was overstating margin by
     exactly the amount of every tax refund.

     Follow one order through: we collect S/ 250.23 of estimated tax, pay
     SUNAT S/ 197.60, and hand the S/ 52.63 difference back as saldo. The
     right answer is that tax nets to zero for us. Revenue carries the
     full 250.23 (it was captured), the tax paid comes off as a cost, and
     the 52.63 has to come off too or we book it as profit we gave away.

     A CAVEAT THE ACCOUNTANT DECIDES, NOT THIS FILE: saldo is expensed
     here in the period it was ISSUED, and added back to revenue in the
     period it is APPLIED to an order. Within one order that nets out.
     Across a month boundary — issued in September, spent in October — it
     does not, and whether that is right depends on cash versus accrual.
     Both numbers are in their own columns so the choice is theirs. */
  const creditIssued = creditIssuedPen(order, wallet) || 0;

  const marginPen = (revenuePen != null && realProductPen != null && realCourierPen != null)
    ? round2(revenuePen - realProductPen - realCourierPen - gatewayFeePen
             - (taxActual ?? taxEstimated ?? 0) - creditIssued)
    : null;

  return {
    orderId: order.orderId,
    createdAt: order.createdAt || null,
    customer: order.customer?.name || order.customer?.nombre || "",
    email: order.buyerEmail || order.customer?.email || "",
    city: order.shipping?.destCity || order.shipping?.ciudad || "",
    itemCount: (order.items || []).length,
    fxRateUsed: fx,

    productsPen: pen(productsUsd, fx),
    freightPen: pen(order.freteChargedUsd, fx),
    smallOrderFeePen: num(order.smallOrderFeePen),

    taxEstimatedPen: taxEstimated,
    taxActualPen: taxActual,
    taxDeltaPen: taxDelta,
    sunatDocRef: order.sunatDocRef || "",
    taxReconciledAt: order.taxReconciledAt || null,

    orderTotalPen: num(order.orderTotalPen),
    walletAppliedPen: num(order.walletAppliedPen),
    billedPen,
    capturedPen,
    refundedPen: num(order.amountRefundedPen),
    creditIssuedPen: creditIssuedPen(order, wallet),   // null when none — a blank, not a zero
    gatewayFeeEstimatePen: num(order.gatewayFeeEstimatePen),

    realProductPen,
    realCourierPen,
    marginPen,
    marginPct: (marginPen != null && revenuePen) ? round2((marginPen / revenuePen) * 100) : null,

    paymentStatus: order.paymentStatus || "unpaid",
    paymentId: payment?.paymentId || order.paymentId || "",
    orderStatus: order.status || "",
    notes: actuals.notas || "",
  };
}

/** Same rule as admin-dashboard's walletEmailFor: a guest order's saldo
    is still owed to the address they typed at checkout. */
export function walletEmailFor(order) {
  return order?.buyerEmail || order?.customer?.email || null;
}

export function ledgerRows(orders, payments = [], wallets = new Map()) {
  const byOrder = new Map(
    (payments || []).filter((p) => p.orderId).map((p) => [p.orderId, p]),
  );
  return (orders || []).map((o) =>
    ledgerRow(o, byOrder.get(o.orderId) || null, wallets.get?.(walletEmailFor(o)) || null));
}

/* Heading -> field. One list, so the header row and the body can never
   drift apart — a CSV whose columns are off by one is worse than no CSV,
   and it is the classic way a hand-maintained header does that. */
export const LEDGER_COLUMNS = [
  ["Pedido", "orderId"],
  ["Fecha (UTC)", "createdAt"],
  ["Cliente", "customer"],
  ["Email", "email"],
  ["Ciudad", "city"],
  ["Ítems", "itemCount"],
  ["Tipo de cambio", "fxRateUsed"],
  ["Producto (PEN)", "productsPen"],
  ["Flete cobrado (PEN)", "freightPen"],
  ["Cargo pedido pequeño (PEN)", "smallOrderFeePen"],
  ["Impuesto estimado (PEN)", "taxEstimatedPen"],
  ["Impuesto real SUNAT (PEN)", "taxActualPen"],
  ["Diferencia impuesto (PEN)", "taxDeltaPen"],
  ["Doc. SUNAT", "sunatDocRef"],
  ["Impuesto conciliado", "taxReconciledAt"],
  ["Total facturado (PEN)", "orderTotalPen"],
  ["Saldo Aria aplicado (PEN)", "walletAppliedPen"],
  ["Cobrado a tarjeta (PEN)", "billedPen"],
  ["Cobrado real pasarela (PEN)", "capturedPen"],
  ["Reembolsado (PEN)", "refundedPen"],
  ["Saldo Aria emitido (PEN)", "creditIssuedPen"],
  ["Comisión pasarela estimada (PEN)", "gatewayFeeEstimatePen"],
  ["Costo producto real (PEN)", "realProductPen"],
  ["Costo courier real (PEN)", "realCourierPen"],
  ["Margen Aria (PEN)", "marginPen"],
  ["Margen %", "marginPct"],
  ["Estado de pago", "paymentStatus"],
  ["ID de pago", "paymentId"],
  ["Estado del pedido", "orderStatus"],
  ["Notas de ops", "notes"],
];

/**
 * One CSV cell.
 *
 * null and undefined become an EMPTY field, never "0" and never "null" —
 * see THE RULE at the top of this file. A blank cell is how the file says
 * "nobody has established this yet", and it is the difference between an
 * accountant asking a question and an accountant filing a wrong number.
 */
export function csvCell(value) {
  if (value == null) return '""';
  let s = String(value);
  // Excel executes a cell that starts with one of these. Order notes are
  // free text typed by an operator, so this is a real path, not theory.
  if (/^[=+\-@\t\r]/.test(s)) s = "\t" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function ledgerCsv(rows) {
  const header = LEDGER_COLUMNS.map(([label]) => csvCell(label)).join(",");
  const body = (rows || []).map((row) =>
    LEDGER_COLUMNS.map(([, field]) => csvCell(row[field])).join(",")).join("\r\n");
  // BOM: Excel on Windows reads BOM-less UTF-8 as Latin-1 and mangles
  // every accented heading in the list above.
  return "﻿" + header + (body ? "\r\n" + body : "") + "\r\n";
}
