// ARIA HOME SHIELD -- hs-pro-profile-self. The pro's own profile + coverage (desk "My profile").
//   GET  -> { profile, coverage: { licenseStates, range }, complete, missing, preview: { card, full } }
//   POST { profile?: { kind, displayName, firmName, trade, yearsInBusiness, about, philosophy, specialties },
//          coverage?: { licenseStates: ["FL"], range: { mode: "statewide" } | { mode: "radius", baseZip, miles 10..500 } } }
//        -> same shape. Saving coverage writes licenseStates + range (migrating serviceArea).
// The preview is exactly what customers see (customerCard / customerProfile).
import { endpoint, reply, fail, proSelf } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";
import { validateProfile, validateCoverage, coverageOf, completeness, withComplete, customerCard, customerProfile } from "./_hs-profiles.js";

export function selfView(pro) {
  const profile = pro.profile || { kind: "individual", photos: [], specialties: [] };
  const c = completeness(profile);
  const shown = { ...pro, profile };
  return { profile, coverage: coverageOf(pro), complete: c.complete, missing: c.missing, verified: !!pro.verified,
    preview: { card: customerCard(shown), full: customerProfile(shown) }, pro: proSelf(pro) };
}

export default endpoint({ methods: ["GET", "POST"], rate: { bucket: "profile-self", limit: 240, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  if (event.httpMethod === "POST") {
    if (body.profile) {
      const v = validateProfile(body.profile, pro.profile || {});
      if (v.error) return fail(400, "bad_profile", v.error);
      pro.profile = withComplete(v.profile, now);
    }
    if (body.coverage) {
      const v = validateCoverage(body.coverage);
      if (v.error) return fail(400, "bad_coverage", v.error);
      pro.licenseStates = v.coverage.licenseStates; pro.range = v.coverage.range;
      if (!pro.licenseStates.includes(pro.licenseState)) pro.licenseState = pro.licenseStates[0];
    }
    pro.updatedAt = new Date(now).toISOString();
    await S.pros.setJSON(pro.id, pro);
  }
  return reply(200, selfView(pro));
});
