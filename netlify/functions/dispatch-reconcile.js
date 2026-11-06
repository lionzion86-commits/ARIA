// THE NIGHTLY 3-WAY RECONCILIATION (#443 c.6551091244, step 9).
// For every BOUGHT store checkout: the Stripe payment (the "payments"
// store stripe-webhook.js writes), the retailer order number the buyer
// logged, and the card program's charge on that checkout's one-order
// card. Every row that does not line up is listed with why. The payout
// ledger per agent (earnings, fees, cash-outs) rides in the same report.
// 05:10 UTC = 00:10 in Lima.
import { strongStore, connectIfLambda } from "./_blobs-store.js";
import { dispatchEngine, dispatchGate } from "./_dispatch.js";

export const config = { schedule: "10 5 * * *" };

/* Functions v2 scheduled function (default export + config.schedule, unchanged), so the Blobs
   context carries uncachedEdgeURL and strong consistency is real (#443 c.6668071617). */
export default async function reconcile(event) {
  connectIfLambda(event);
  try {
    const out = {};
    for (const host of ["ariashop.pe", "localhost"]) {
      const gate = dispatchGate(host);
      if (!gate.on) { out.dispatch = { off: gate.reason }; continue; } // production stays inert until switched on
      const engine = dispatchEngine({ getStore: strongStore, host });
      const r = await engine.reconcile();
      out[engine.ns] = { rows: r.rows.length, ok: r.ok, issues: r.issues };
    }
    console.log("[dispatch-reconcile]", JSON.stringify(out));
    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[dispatch-reconcile]", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
