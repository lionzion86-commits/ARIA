// Saves the operator's 5 real-world actuals onto an existing order
// record — precio real pagado, peso real facturado, costo real del
// courier, días puerta a puerta, notas. Everything else on the order
// (precio scrapeado, precio cobrado, tipo de cambio, peso estimado,
// flete cobrado) was already captured at order-creation time
// (orders-create.js) — this never overwrites those fields.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = await getSessionEmail(event);
  if (!isAdmin(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const { orderId, actuals, tax, express } = body;
  // Any one block alone is a valid call: recording the SUNAT figure,
  // the real courier actuals, or the express ("red sticker") flag are
  // separate errands — often different weeks, sometimes different
  // operators.
  if (!orderId || (typeof actuals !== "object" && typeof tax !== "object" && typeof express !== "object")) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan datos" }) };
  }

  try {
    const ordersStore = getStore("orders");
    const order = await ordersStore.get(orderId, { type: "json" });
    if (!order) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Pedido no encontrado" }) };
    }

    /* `finite` rather than `Number(x) || null`, which was the bug here:
       `|| null` turns a legitimate zero into "unknown". A courier that
       waived its fee costs 0, and a parcel that arrived the same day is
       0 days — both were being recorded as though nobody had measured
       them, which is the one thing this whole record is for. */
    const finite = (v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    if (typeof actuals === "object" && actuals) {
      order.actuals = {
        precioRealPagadoUsd: finite(actuals.precioRealPagadoUsd),
        pesoRealKg: finite(actuals.pesoRealKg),
        costoRealCourierUsd: finite(actuals.costoRealCourierUsd),
        diasPuertaAPuerta: finite(actuals.diasPuertaAPuerta),
        notas: typeof actuals.notas === "string" ? actuals.notas.slice(0, 2000) : "",
        updatedAt: new Date().toISOString(),
        updatedBy: email,
      };
    }

    /* ---- SUNAT RECONCILIATION ------------------------------------
       The order has carried taxActualUsd, taxActualPen, sunatDocRef and
       taxReconciledAt since the first order was written (see
       orders-create.js), precisely so no order would be unresolvable for
       want of a field. This is the write path for them.

       It RECORDS, it does not refund. The policy is fixed — an
       over-estimate comes back as saldo Aria, an under-estimate Aria
       absorbs — but issuing the credit stays a deliberate, named act
       through admin-wallet-credit.js. The difference is returned here so
       the dashboard can say exactly what is owed and to whom; money
       moving on its own out of a data-entry endpoint is not a thing this
       codebase does.

       A null actual CLEARS the reconciliation rather than being ignored:
       a mistyped figure has to be retractable. */
    let taxOwed = null;
    if (typeof tax === "object" && tax) {
      const actualUsd = finite(tax.taxActualUsd);
      const fx = Number(order.fxRateUsed) || null;
      const actualPen = finite(tax.taxActualPen) ?? (actualUsd != null && fx ? Math.round(actualUsd * fx * 100) / 100 : null);
      order.taxActualUsd = actualUsd;
      order.taxActualPen = actualPen;
      order.sunatDocRef = typeof tax.sunatDocRef === "string" ? tax.sunatDocRef.trim().slice(0, 120) : null;
      order.taxReconciledAt = actualPen == null ? null : new Date().toISOString();
      order.taxReconciledBy = actualPen == null ? null : email;

      const estimated = Number(order.taxEstimatedPen) || 0;
      if (actualPen != null) {
        const delta = Math.round((estimated - actualPen) * 100) / 100;
        taxOwed = {
          // Positive: we over-collected and owe it back as saldo Aria.
          // Negative: Aria absorbs it. Never billed to the customer.
          differencePen: delta,
          creditDuePen: delta > 0 ? delta : 0,
          absorbedPen: delta < 0 ? Math.abs(delta) : 0,
          buyerEmail: order.buyerEmail || null,
        };
      }
    }

    /* ---- EXPRESS FLAG ("red sticker") ------------------------------
       CHECKOUT CONTRACT (orders-create.js, future): when the checkout
       toggle ships, orders-create.js must accept and store this same
       shape at purchase time —
         order.express = { selected, feeUsd: 8, updatedAt, updatedBy: "checkout" }
       `selected` is the shopper's choice: "Recibir todo junto" (free,
       default) vs "Recibir cada paquete ni bien llegue" (+$8).
       This endpoint is the admin override path: flip the flag or fix the
       fee after purchase, e.g. a waiver or a mis-tap at checkout.
       Neither path overwrites the other's fields; creation-time fields
       stay sacred. */
    // Strict but forgiving on the fee: selected=true with a missing or
    // out-of-range fee falls back to the $8 standard and says so in the
    // response (`feeDefaulted: true`), rather than 400ing an operator's
    // deliberate act. selected=false carries feeUsd 0 — express not taken
    // means nothing owed — whatever number arrived with it is discarded.
    let feeDefaulted = false;
    if (typeof express === "object" && express) {
      const selected = Boolean(express.selected);
      const rawFee = finite(express.feeUsd);
      let feeUsd;
      if (!selected) {
        feeUsd = 0;
      } else if (rawFee == null || rawFee < 0 || rawFee > 100) {
        feeUsd = 8;
        feeDefaulted = true;
      } else {
        feeUsd = Math.round(rawFee * 100) / 100;
      }
      order.express = {
        selected,
        feeUsd,
        updatedAt: new Date().toISOString(),
        updatedBy: email,
      };
    }

    await ordersStore.setJSON(orderId, order);
    const response = { ok: true, taxOwed, express: order.express ?? null };
    if (feeDefaulted) response.feeDefaulted = true;
    return { statusCode: 200, headers, body: JSON.stringify(response) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
