// ARIA HOME SHIELD -- GET hs-case-status?c=<caseId>&t=<token>. The homeowner's view.
//
//   200 { case: { id, status, issue, trades, zip, state, area, urgency, summary, policyFlags,
//                 insurer, claimNumber, policyNumber, address, contact, docs:[{id,name,type,size,url}],
//                 createdAt, updatedAt, connectedProId },
//         offers: [{ id, status, message, createdAt, respondedAt,
//                    pro: { id, name, company, trades, licenseType, licenseNumber, licenseState, verified,
//                           phone?, email? } }],          // phone/email only once the homeowner shared contact
//       }
//   404 for a wrong token or unknown case (same answer for both).
import { endpoint, reply, fail, caseForToken, getJSON, docsFor, docView, proForHomeowner, areaOf } from "./_hs-store.js";

export async function homeownerView(S, c) {
  const docs = await docsFor(S, c);
  const offers = [];
  for (const oid of c.offers || []) {
    const o = await getJSON(S.offers, oid);
    if (!o) continue;
    const p = await getJSON(S.pros, o.proId);
    offers.push({ id: o.id, status: o.status, message: o.message, createdAt: o.createdAt, respondedAt: o.respondedAt || null,
      pro: proForHomeowner(p, { shared: o.status === "accepted" }) });
  }
  const { token, consent, offers: _o, docs: _d, ...rest } = c;
  return {
    case: { ...rest, area: areaOf(c.zip), docs: docs.map((m) => docView(m)) },
    offers: offers.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export const handler = endpoint({ methods: ["GET"], rate: { bucket: "case-status", limit: 240, windowSec: 3600, methods: ["GET"] } }, async ({ S, query }) => {
  const c = await caseForToken(S, query.c, query.t);
  if (!c) return fail(404, "not_found", "We could not find that case. Check the link.");
  return reply(200, await homeownerView(S, c));
});
