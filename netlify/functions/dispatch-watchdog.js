// THE DISPATCH WATCHDOG (#443 c.6551091244), every five minutes.
// Every state has a timer: an order past it is stamped with an escalation
// that says what is stuck and for how long, and Danny's board shows it.
// Also runs the clock (rings that ran out go to sin asignar, the float
// gate re-checks FUNDS-HOLD), archives finished records after 48 h, and
// on the configured weekday sweeps balances not cashed out to CCI.
// A board order (sin asignar) is never archived and never goes quiet: it
// re-escalates each time its wait doubles past the window.
// Both namespaces: production ("dispatch") and the preview sandbox.
import { strongStore, connectIfLambda } from "./_blobs-store.js";
import { dispatchEngine, dispatchGate } from "./_dispatch.js";

export const config = { schedule: "*/5 * * * *" };

export async function runWatchdog(getStoreFn) {
  const out = {};
  for (const host of ["ariashop.pe", "localhost"]) {
    const gate = dispatchGate(host);
    if (!gate.on) { out.dispatch = { off: gate.reason }; continue; } // production stays inert until switched on
    const engine = dispatchEngine({ getStore: getStoreFn, host });
    const w = await engine.watchdog();
    const s = await engine.sweep();
    out[engine.ns] = { escalations: w.escalations.length, sweep: s };
  }
  return out;
}

/* Functions v2 scheduled function (default export + config.schedule, unchanged), so the Blobs
   context carries uncachedEdgeURL and strong consistency is real (#443 c.6668071617). */
export default async function watchdog(event) {
  connectIfLambda(event);
  try {
    const out = await runWatchdog(strongStore);
    console.log("[dispatch-watchdog]", JSON.stringify(out));
    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[dispatch-watchdog]", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
