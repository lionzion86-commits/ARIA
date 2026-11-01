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
//   POST { action: "poll", clockedIn, onBreak, focus, watching }  -> { board, ping, watch, mine, ledger, config }
//   POST { action: "claim", orderId }        -> ACEPTAR. 200 with her packet, or 409 { taken: true }
//   POST { action: "grab", orderId }         -> «Tomar» on the board: same first claim, 409 «Otra compradora lo tomó» / the reason she can't
//   POST { action: "leave" }                -> she signed out / closed the tab: offline now (sendBeacon)
//   POST { action: "pass", orderId }         -> Pasar (recorded in her history)
//   POST { action: "events", events }        -> the outbox: checkout_comprado / checkout_excepcion
//   POST { action: "register", yape, cci }   -> her Yape/Plin number and CCI account
//   POST { action: "cashout", amountPen }    -> a cash-out request (fee and net shown before)
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, hostOf } from "./_agent-auth.js";
import { dispatchEngine } from "./_dispatch.js";

export const strongStore = (name) => getStore({ name, consistency: "strong" });

/* Agents never see configuration or variable names (Danny, c.6560497090).
   The technical reason stays on Danny's board (admin-dispatch board().gate). */
export const AGENT_OFF_TEXT = "El despacho en vivo aún no está activado. Tu turno está abierto; los pedidos en vivo llegan cuando se active.";
const CONFIG_LEAK = /[A-Z][A-Z0-9]*_[A-Z0-9_]+|Despacho apagado|Lithic|webhook|Blobs|etag/i;
export function agentSafeError(e) {
  if (e && e.off) return AGENT_OFF_TEXT;
  const m = String((e && e.message) || "");
  if (e && e.code === 503 && /^Despacho apagado/.test(m)) return AGENT_OFF_TEXT;
  return CONFIG_LEAK.test(m) ? "No se pudo completar. Intenta de nuevo en un momento." : m;
}

export async function dispatchAgentResponse(ctx, body, engine) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role !== "agent" && ctx.role !== "admin") return { status: 403, body: { error: "Esta cuenta no es de comprador" } };
  const me = ctx.email;
  try {
    switch (body.action) {
      case "poll": return { status: 200, body: await engine.poll(me, { ...body, name: (ctx.user && ctx.user.name) || null }) };
      case "claim": return { status: 200, body: { ok: true, order: await engine.claimOrder(me, String(body.orderId || "")) } };
      case "leave": return { status: 200, body: await engine.leave(me) };
      case "grab": return { status: 200, body: { ok: true, order: await engine.grabOrder(me, String(body.orderId || "")) } };
      case "pass": return { status: 200, body: await engine.passOrder(me, String(body.orderId || "")) };
      case "events": return { status: 200, body: await engine.applyEvents(me, body.events) };
      case "register": return { status: 200, body: { ok: true, ledger: await engine.register(me, body) } };
      case "cashout": return { status: 200, body: { ok: true, ...(await engine.cashout(me, Number(body.amountPen))) } };
      default: return { status: 400, body: { error: "Acción desconocida" } };
    }
  } catch (e) {
    const status = Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
    return { status, body: { error: agentSafeError(e), ...(e.off ? { off: true } : {}), ...(e.taken ? { taken: true, state: e.state } : {}), ...(e.ineligible ? { ineligible: e.ineligible } : {}), ...(e.errors ? { errors: e.errors } : {}) } };
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: agentSafeError(error) }) };
  }
}
