// ARIA HOME SHIELD -- GET hs-pros-for-case?c=<caseId>&t=<token>&trade=<trade>. "Your options" for one trade.
//   200 { trade, pros: [card], picked: proId|null }
//   card: { proId, displayName, firmName, kind, trade, yearsInBusiness, aboutShort, mainPhoto, photoCount,
//           licenseVerified, licenseType, specialties, location: "licensed_in_area" }
// Only verified pros with complete profiles whose coverage includes the case. NO distance, city,
// base ZIP or range in the answer, and the order is best fit (never nearest-first).
import { endpoint, reply, fail, caseForToken, loadAll, TRADES } from "./_hs-store.js";
import { eligibleForCase, orderPros, customerCard, historyCounts } from "./_hs-profiles.js";

export default endpoint({ methods: ["GET"], rate: { bucket: "pros-for-case", limit: 240, windowSec: 3600, methods: ["GET"] } }, async ({ S, query }) => {
  const c = await caseForToken(S, query.c, query.t);
  if (!c) return fail(404, "not_found", "We could not find that case");
  const trade = TRADES.includes(query.trade) ? query.trade : null;
  if (!trade) return fail(400, "bad_trade", "Choose a trade");
  const pros = eligibleForCase(await loadAll(S.pros, "p_"), c, trade);
  const ordered = orderPros(pros, c, trade, await historyCounts(S));
  return reply(200, { trade, pros: ordered.slice(0, 24).map(customerCard), picked: (c.picks && c.picks[trade]) || null });
});
