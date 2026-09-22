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

  const { orderId, actuals, tax } = body;
  // Either block alone is a valid call: recording the SUNAT figure is a
  // separate errand from recording the real courier cost, and often a
  // different week.
  if (!orderId || (typeof actuals !== "object" && typeof tax !== "object")) {
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

    await ordersStore.setJSON(orderId, order);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, taxOwed }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
