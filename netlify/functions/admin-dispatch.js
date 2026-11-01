// /.netlify/functions/admin-dispatch -- Danny's live dispatch board (#443).
// SAME LOGIN AS /admin.html (auth rule c.6550830674): the store's session
// cookie, email on ADMIN_EMAILS. No second password. Buyers and shoppers
// 403, signed out 401.
//
//   GET                                    -> the board: every order by state (FUNDS-HOLD with its shortfall,
//                                             sin asignar counted), escalations, float, presence, passes,
//                                             payout queue, pot, batches, last reconciliation
//   GET ?batch=<id>                        -> that batch's DRAFT payment file (text/csv download)
//   POST { action: "config", ...}          -> Danny's numbers (pay per checkout, ring, fee, minimum, Yape cap,
//                                             pot balance and refill alert, timers, draft-file flag)
//   POST { action: "accounts", list }      -> store accounts and their daily caps
//   POST { action: "float", availableUsd } -> the SANDBOX fake float (refused when Lithic is connected)
//   POST { action: "rering", orderId }     -> ring a sin-asignar order again
//   POST { action: "link", orderId, checkoutId, index, url } -> paste a missing product link
//   POST { action: "batch" }               -> "generar lote": one DRAFT file for all pending cash-outs
//   POST { action: "batchStatus", id, to } -> enviado / confirmado
//   POST { action: "reconcile" }           -> run the 3-way reconciliation now
//   POST { action: "watchdog" }            -> run the watchdog now
//   POST { action: "simulate", stores }    -> SANDBOX HOSTS ONLY: a test order from the sample products,
//                                             straight into the sandbox namespace (never the orders store)
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, hostOf } from "./_agent-auth.js";
import { dispatchEngine } from "./_dispatch.js";
import { strongStore } from "./agent-dispatch.js";
import { SAMPLE_BATCH } from "../../assets/agent/sample-batch.js";

/**
 * A SANDBOX test order: real catalogue products from the sample batch
 * (several per store), a fictional "Prueba" customer, paid "now". Only
 * ever fed to a sandbox-namespace engine.
 */
export const SANDBOX_PLAN = Object.freeze({ 1: [1], 2: [2, 1], 3: [4, 2, 1] });
export function sandboxOrder(stores = 3, seq = Date.now()) {
  const byStore = new Map();
  for (const o of SAMPLE_BATCH.orders) (byStore.get(o.store) || byStore.set(o.store, []).get(o.store)).push(o);
  /* Multi-item per store, like a real cart: 3 stores -> 4 / 2 / 1 products. */
  const plan = SANDBOX_PLAN[Math.max(1, Math.min(3, Number(stores) || 1))];
  const groups = [...byStore.values()].filter((g) => g.length >= 1).sort((a, b) => b.length - a.length);
  const names = [...new Set(SAMPLE_BATCH.orders.map((o) => o.customerName))];
  const id = "SBX-" + String(seq).slice(-8);
  const items = plan.flatMap((n, i) => groups[i].slice(0, n).map((o) => ({
    retailer: o.storeLabel, title: o.title, priceUsd: o.priceUsd, dutiableUsd: o.priceUsd, qty: 1,
    image: o.image, url: o.url, selectedSize: o.selectedSize, color: o.color,
  })));
  return {
    orderId: id, paymentStatus: "paid", paidAt: new Date().toISOString(), paymentId: null, sandbox: true,
    customer: { name: names[Number(String(seq).slice(-3)) % names.length] },
    shipping: {},
    items,
  };
}

export async function dispatchAdminResponse(ctx, method, body, engine, query = {}) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role !== "admin") return { status: 403, body: { error: "No autorizado" } };
  try {
    if (method === "GET") {
      if (query.batch) {
        const b = await engine.batchFile(String(query.batch));
        return { status: 200, csv: b.csv, filename: `${b.id}-BORRADOR.csv` };
      }
      return { status: 200, body: await engine.board() };
    }
    switch (body.action) {
      case "config": { const { action, ...rest } = body; return { status: 200, body: { config: await engine.setConfig(rest) } }; } // eslint-disable-line no-unused-vars
      case "accounts": return { status: 200, body: { accounts: await engine.setAccounts(body.list) } };
      case "float": return { status: 200, body: { availableUsd: await engine.setFakeFloat(body.availableUsd, ctx.email) } };
      case "rering": return { status: 200, body: { order: await engine.reRingOrder(String(body.orderId || "")) } };
      case "link": return { status: 200, body: { ok: Boolean(await engine.setItemLink(String(body.orderId), String(body.checkoutId), body.index, body.url)) } };
      case "batch": { const { csv, ...b } = await engine.generateBatch(ctx.email); return { status: 200, body: { batch: b } }; } // eslint-disable-line no-unused-vars
      case "batchStatus":
        if (body.to !== "enviado" && body.to !== "confirmado") return { status: 400, body: { error: "Estado inválido" } };
        return { status: 200, body: await engine.markBatch(String(body.id), body.to) };
      case "reconcile": return { status: 200, body: await engine.reconcile() };
      case "watchdog": return { status: 200, body: await engine.watchdog() };
      case "simulate":
        if (!engine.sandbox) return { status: 403, body: { error: "El pedido de prueba existe solo en vista previa" } };
        return { status: 200, body: await engine.intake(sandboxOrder(body.stores), { eventId: null }) };
      default: return { status: 400, body: { error: "Acción desconocida" } };
    }
  } catch (e) {
    const status = Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
    return { status, body: { error: e.message } };
  }
}

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, POST, OPTIONS"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    let body = {};
    if (event.httpMethod === "POST") {
      try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    }
    const ctx = await callerRole(event, { users: getStore("users") });
    const engine = dispatchEngine({ getStore: strongStore, host: hostOf(event) });
    const r = await dispatchAdminResponse(ctx, event.httpMethod, body, engine, event.queryStringParameters || {});
    if (r.csv != null) return { statusCode: 200, headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${r.filename}"` }, body: r.csv };
    return { statusCode: r.status, headers, body: JSON.stringify(r.body) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
