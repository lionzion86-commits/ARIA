// ARIA HOME SHIELD -- GET hs-pro-profile?p=<proId>&c=<caseId>&t=<token>. The full profile sheet.
//   200 { profile: card + { about, philosophy, gallery: [{ id, w, h, main, card, full }] } }
// Only a pro eligible for this case (verified, complete, covering it). No location beyond
// "licensed in your area"; no contact before the customer shares.
import { endpoint, reply, fail, caseForToken, getJSON, isId } from "./_hs-store.js";
import { listable, coverageCovers, customerProfile } from "./_hs-profiles.js";

export default endpoint({ methods: ["GET"], rate: { bucket: "pro-profile", limit: 600, windowSec: 3600, methods: ["GET"] } }, async ({ S, query }) => {
  const c = await caseForToken(S, query.c, query.t);
  if (!c) return fail(404, "not_found", "We could not find that case");
  const pro = isId("pro", query.p) ? await getJSON(S.pros, query.p) : null;
  if (!pro || !listable(pro) || !coverageCovers(pro, c.zip, c.state)) return fail(404, "not_found", "Not available");
  return reply(200, { profile: customerProfile(pro) });
});
