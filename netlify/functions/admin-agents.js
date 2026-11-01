// Danny's compradores admin (#443 agent dashboard). SAME LOGIN AS
// /admin.html (auth rule c.6550830674): the store's own session cookie
// (getSessionEmail) whose email is on ADMIN_EMAILS (isAdmin), exactly like
// every admin-* function. No second password, no second account. Agents
// and shoppers get 403, signed-out callers 401. The board is the SAMPLE
// day only on deploy previews and localhost; production gets an empty day.
//
//   GET                                  -> { logins, board, accounts, exceptions } (board is the SAMPLE day in Phase 1)
//   POST { email, agent: true }          -> invite: the account becomes a comprador
//        (+ yape, cci)                   -> Phase 2: her Yape/Plin number and CCI account, registered at invite
//   POST { email, active: false }        -> deactivate, effective on her next request
//   POST { email, active: true }         -> reactivate
//   POST { email, agent: false }         -> remove the role
//   POST { payPerPurchasePen: n|null } -> the pay per purchase in soles; null = "por definir" (the default)
//   POST { linkCheck: url }              -> the link-health guard's server hook: classify, then
//                                           follow redirects by hand (404 / homepage / search = "Link caído")
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { callerRole, boardResponse, setAgent, writePay, hostOf } from "./_agent-auth.js";
import { checkLinkHealth, LINK_REASON_LABELS } from "../../assets/agent/agent-core.js";
import { validateRegistration } from "../../assets/agent/dispatch-core.js";
import { dispatchEngine } from "./_dispatch.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, POST, OPTIONS"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  try {
    const users = getStore("users");
    const ctx = await callerRole(event, { users });
    if (event.httpMethod === "GET") {
      const { status, body } = await boardResponse(ctx, { users, settings: getStore("agent-settings"), host: hostOf(event) });
      return { statusCode: status, headers, body: JSON.stringify(body) };
    }
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    if (!ctx.email) return { statusCode: 401, headers, body: JSON.stringify({ error: "Inicia sesión" }) };
    if (ctx.role !== "admin") return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    if ("payPerPurchasePen" in body) {
      const v = body.payPerPurchasePen === "" || body.payPerPurchasePen == null ? null : Number(body.payPerPurchasePen);
      const r = await writePay(getStore("agent-settings"), v, ctx.email);
      return { statusCode: r.status, headers, body: JSON.stringify(r.body) };
    }
    if (typeof body.linkCheck === "string") {
      const r = await checkLinkHealth(body.linkCheck, (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(8000) }));
      return { statusCode: 200, headers, body: JSON.stringify({ ...r, label: r.ok ? null : (LINK_REASON_LABELS[r.reason] || r.reason) }) };
    }
    /* Payout details at invite (c.6551428878). Checked before the role is granted, so a typo refuses the whole invite. */
    const withPayout = body.agent === true && (body.yape || body.cci);
    if (withPayout) {
      const v = validateRegistration({ yape: body.yape, cci: body.cci });
      if (!v.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: v.errors[0], errors: v.errors }) };
    }
    const r = await setAgent(users, body.email, { agent: body.agent, active: body.active }, ctx.email);
    if (withPayout && r.status === 200) {
      const engine = dispatchEngine({ getStore: (name) => getStore({ name, consistency: "strong" }), host: hostOf(event) });
      await engine.register(r.body.email, { yape: body.yape, cci: body.cci });
      r.body.payoutRegistered = true;
    }
    return { statusCode: r.status, headers, body: JSON.stringify(r.body) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
