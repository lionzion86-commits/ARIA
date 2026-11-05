// ARIA HOME SHIELD -- GET hs-pro-feed?since=<ISO>. The live board (polled every 10 s).
//
//   200 { now,                                  // pass back as ?since= next poll
//         newCaseIds: [caseId],                 // matching cases created after `since` (ping + toast)
//         cases: [anonymizedCase & { myOffer: { id, status } | null }],   // open matching cases, newest first
//         offers: [{ id, caseId, status, message, createdAt, respondedAt, case: anonymizedCase }],
//         connected: [connectedCase & { offerId }],   // ONLY cases the homeowner shared contact with this pro
//         notices: [{ type: "connected"|"talk_first"|"declined"|"message", caseId, offerId, at }] }
//   401 signin   403 { code: "pending_verification", pro }
//
// Cases are ALWAYS anonymized (_hs-store.js anonymizeCase) except the
// connected ones. A case connected to another pro disappears from the feed.
import { contactAllowed } from "./_hs-partners.js";
import { endpoint, reply, fail, loadAll, getJSON, listKeys, anonymizeCase, connectedView, caseMatchesPro, docsFor, proSelf } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";

export async function feedFor(S, pro, since) {
  const sinceIso = since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : null;
  const cases = await loadAll(S.cases, "c_");
  const byId = new Map(cases.map((c) => [c.id, c]));
  const myOffers = [];
  for (const k of await listKeys(S.offers, `byPro/${pro.id}/`)) {
    const o = await getJSON(S.offers, k.split("/").pop());
    if (o && o.proId === pro.id && byId.has(o.caseId)) myOffers.push(o);
  }
  const offerByCase = new Map(myOffers.map((o) => [o.caseId, o]));
  const feed = cases.filter((c) => caseMatchesPro(c, pro) || (offerByCase.has(c.id) && c.status !== "connected"))
    .filter((c) => !(c.status === "connected" && c.connectedProId !== pro.id))
    .filter((c) => c.status !== "connected")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map((c) => { const o = offerByCase.get(c.id); return { ...anonymizeCase(c), myOffer: o ? { id: o.id, status: o.status } : null }; });
  const newCaseIds = sinceIso ? feed.filter((c) => c.createdAt > sinceIso && !c.myOffer).map((c) => c.id) : [];
  const offers = myOffers.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => {
    const c = byId.get(o.caseId);
    return { id: o.id, caseId: o.caseId, status: o.status, message: o.message, createdAt: o.createdAt, respondedAt: o.respondedAt || null,
      reason: o.reason || null, case: anonymizeCase(c) };
  });
  const connected = [];
  for (const c of cases) {
    if (pro.verified && await contactAllowed(S, c, pro.id)) {
      connected.push({ ...connectedView(c, await docsFor(S, c)), offerId: c.connectedOfferId || null });
    }
  }
  const notices = [];
  if (sinceIso) {
    for (const k of await listKeys(S.events, `pro/${pro.id}/`)) {
      if (k.slice(`pro/${pro.id}/`.length) <= sinceIso) continue;
      const e = await getJSON(S.events, k);
      if (e) notices.push({ type: e.type, caseId: e.caseId, offerId: e.offerId || null, at: e.at });
    }
  }
  return { now: new Date().toISOString(), newCaseIds, cases: feed, offers, connected, notices };
}

export default endpoint({ methods: ["GET"] }, async ({ event, S, query }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  if (!pro.verified) return fail(403, "pending_verification", "Your license is pending verification", { pro: proSelf(pro) });
  return reply(200, await feedFor(S, pro, query.since));
});
