// ARIA HOME SHIELD -- GET hs-storm. Today's storm picture for the signed-in desk: NWS active
// alerts in its license state (wind / tropical / severe / tornado / flood / surge / hail) and SPC
// wind, hail and tornado reports (today + yesterday) within its service radius.
//   200 { state, center: { zip, lat, lon }, radiusMiles, alerts: [{ event, areas, severity, expires, headline,
//         moving: { toward, mph } | null }], reports: [{ type, day, time, magnitude, location, county, state, lat, lon,
//         miles }], counts: { wind, hail, tornado }, stale, fetchedAt, errors, source: "NOAA / NWS / SPC" }
//   ?state=XX&zip=NNNNN&radius=N lets an admin view any area (admin session only).
import { endpoint, reply, fail, normZip } from "./_hs-store.js";
import { proFromEvent, adminFromEvent } from "./_hs-auth.js";
import { zip3Info } from "./_hs-zip3.js";
import { stormFor } from "./_hs-storm.js";

export const handler = endpoint({ methods: ["GET"] }, async ({ event, S, query, now }) => {
  let state, zip, radius;
  const pro = await proFromEvent(event, S);
  if (query.state && (await adminFromEvent(event, S))) {
    state = String(query.state).toUpperCase().slice(0, 2); zip = normZip(query.zip); radius = Math.min(250, Math.max(5, Number(query.radius) || 50));
  } else if (pro && pro.verified) {
    state = pro.licenseState; zip = (pro.serviceArea && pro.serviceArea.centerZip) || null; radius = (pro.serviceArea && pro.serviceArea.radiusMiles) || 50;
  } else return fail(pro ? 403 : 401, pro ? "pending_verification" : "signin", "Sign in with a verified desk");
  if (!/^[A-Z]{2}$/.test(state || "")) return fail(400, "bad_state", "No state");
  const z = zip && zip3Info(zip);
  const center = z ? { zip, lat: z.lat, lon: z.lon } : null;
  return reply(200, await stormFor(S, { state, center, radiusMiles: radius }, now));
});
