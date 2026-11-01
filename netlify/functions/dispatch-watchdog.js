// THE DISPATCH WATCHDOG (#443 c.6551091244), every five minutes.
// Every state has a timer: an order past it is stamped with an escalation
// that says what is stuck and for how long, and Danny's board shows it.
// Also runs the clock (rings that ran out go to sin asignar, the float
// gate re-checks FUNDS-HOLD), archives finished records after 48 h, and
// on the configured weekday sweeps balances not cashed out to CCI.
// Both namespaces: production ("dispatch") and the preview sandbox.
import { getStore, connectLambda } from "@netlify/blobs";
import { dispatchEngine } from "./_dispatch.js";

export const config = { schedule: "*/5 * * * *" };

export async function runWatchdog(getStoreFn) {
  const out = {};
  for (const host of ["ariashop.pe", "localhost"]) {
    const engine = dispatchEngine({ getStore: getStoreFn, host });
    const w = await engine.watchdog();
    const s = await engine.sweep();
    out[engine.ns] = { escalations: w.escalations.length, sweep: s };
  }
  return out;
}

export async function handler(event) {
  connectLambda(event);
  try {
    const out = await runWatchdog((name) => getStore({ name, consistency: "strong" }));
    console.log("[dispatch-watchdog]", JSON.stringify(out));
    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[dispatch-watchdog]", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
}
