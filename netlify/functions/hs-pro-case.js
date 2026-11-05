// ARIA HOME SHIELD -- GET hs-pro-case?c=<caseId>. One case, as this pro may see it.
//   connected to this pro -> 200 { view: "connected", case: { ...full contact, address, claim/policy numbers, docs:[{id,name,type,size,url}] }, offer }
//   offered / matching    -> 200 { view: "anonymized", case: anonymizedCase, offer|null }
//   otherwise             -> 404.  Unverified -> 403 pending_verification.
import { endpoint, reply, fail, getJSON, isId, anonymizeCase, connectedView, caseMatchesPro, docsFor } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";

export const handler = endpoint({ methods: ["GET"] }, async ({ event, S, query }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  if (!pro.verified) return fail(403, "pending_verification", "Your license is pending verification");
  if (!isId("case", query.c)) return fail(404, "not_found", "Not found");
  const c = await getJSON(S.cases, query.c);
  if (!c) return fail(404, "not_found", "Not found");
  let offer = null;
  for (const oid of c.offers || []) { const o = await getJSON(S.offers, oid); if (o && o.proId === pro.id) offer = { id: o.id, status: o.status, message: o.message, createdAt: o.createdAt }; }
  if (c.status === "connected" && c.connectedProId === pro.id) {
    return reply(200, { view: "connected", case: connectedView(c, await docsFor(S, c)), offer });
  }
  if (c.status === "connected") return fail(404, "not_found", "This case is no longer available");
  if (!offer && !caseMatchesPro(c, pro)) return fail(404, "not_found", "Not found");
  return reply(200, { view: "anonymized", case: anonymizeCase(c), offer });
});
