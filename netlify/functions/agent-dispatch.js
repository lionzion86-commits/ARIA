// /.netlify/functions/agent-dispatch -- the buyer's phone during live
// dispatch (#443 c.6551091244). SAME LOGIN as agent-queue.js: the buyer's
// own Aria session with the `agent` role Danny granted; Danny himself (on
// ADMIN_EMAILS) is on the launch roster too. Anyone else: 401 / 403.
//
// There is no websocket: agente.html polls this every few seconds while
// clocked in (DISPATCH_DEFAULTS.pollSeconds). Each poll is also her
// presence -- clocked in, on a break, in focus mode -- which is what
// decides whether she is pinged.
//
//   POST { action: "poll", clockedIn, onBreak, focus, watching }  -> { ping, watch, mine, ledger, config }
//   POST { action: "claim", orderId }        -> ACEPTAR. 200 with her packet, or 409 { taken: true }
//   POST { action: "pass", orderId }         -> Pasar (recorded in her history)
//   POST { action: "events", events }        -> the outbox: checkout_comprado / checkout_excepcion
//   POST { action: "register", yape, cci }   -> her Yape/Plin number and CCI account
//   POST { action: "cashout", amountPen }    -> a cash-out request (fee and net shown before)
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, hostOf } from "./_agent-auth.js";
import { dispatchEngine } from "./_dispatch.js";

export const strongStore = (name) => getStore({ name, consistency: "strong" });

export async function dispatchAgentResponse(ctx, body, engine) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role !== "agent" && ctx.role !== "admin") return { status: 403, body: { error: "Esta cuenta no es de comprador" } };
  const me = ctx.email;
  try {
    switch (body.action) {
      case "poll": return { status: 200, body: await engine.poll(me, { ...body, name: (ctx.user && ctx.user.name) || null }) };
      case "claim": return { status: 200, body: { ok: true, order: await engine.claimOrder(me, String(body.orderId || "")) } };
      case "pass": return { status: 200, body: await engine.passOrder(me, String(body.orderId || "")) };
      case "events": return { status: 200, body: await engine.applyEvents(me, body.events) };
      case "register": return { status: 200, body: { ok: true, ledger: await engine.register(me, body) } };
      case "cashout": return { status: 200, body: { ok: true, ...(await engine.cashout(me, Number(body.amountPen))) } };
      default: return { status: 400, body: { error: "Acción desconocida" } };
    }
  } catch (e) {
    const status = Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
    return { status, body: { error: e.message, ...(e.taken ? { taken: true, state: e.state } : {}), ...(e.errors ? { errors: e.errors } : {}) } };
  }
}

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("POST, OPTIONS"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    const users = getStore("users");
    const ctx = await callerRole(event, { users });
    const engine = dispatchEngine({ getStore: strongStore, host: hostOf(event) });
    const r = await dispatchAgentResponse(ctx, body, engine);
    return { statusCode: r.status, headers, body: JSON.stringify(r.body) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
