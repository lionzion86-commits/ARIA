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
import { stormFor, stormAt, geocode } from "./_hs-storm.js";
import { str, rateOk } from "./_hs-store.js";

export default endpoint({ methods: ["GET"] }, async ({ event, S, query, now }) => {
  let state, zip, radius;
  const pro = await proFromEvent(event, S);
  if (query.state && (await adminFromEvent(event, S))) {
    state = String(query.state).toUpperCase().slice(0, 2); zip = normZip(query.zip); radius = Math.min(250, Math.max(5, Number(query.radius) || 50));
  } else if (pro && pro.verified) {
    state = pro.licenseState; zip = (pro.serviceArea && pro.serviceArea.centerZip) || null; radius = (pro.serviceArea && pro.serviceArea.radiusMiles) || 50;
  } else return fail(pro ? 403 : 401, pro ? "pending_verification" : "signin", "Sign in with a verified desk");
  if (!/^[A-Z]{2}$/.test(state || "")) return fail(400, "bad_state", "No state");
  /* Search: a ZIP, city or address typed by the pro. */
  const q = str(query.q, 160);
  if (q) {
    if (!(await rateOk(S, "storm-search", pro ? pro.id : "admin", 120, 3600, now))) return fail(429, "rate_limited", "Too many searches. Wait a few minutes.");
    const g = await geocode(S, q, now);
    if (!g) return fail(404, "not_found", "We could not find that place");
    return reply(200, { ...(await stormAt(S, { ...g, radiusMiles: radius, state: g.state || state }, now)), query: q });
  }
  /* Default: the desk's own area, by point. The center ZIP is geocoded once and kept on the pro record. */
  if (zip) {
    let geo = pro && pro.centerGeo && pro.centerGeo.zip === zip ? pro.centerGeo : null;
    if (!geo) {
      const g = await geocode(S, zip, now);
      if (g) { geo = { zip, lat: g.lat, lon: g.lon, label: g.label, approximate: g.approximate }; if (pro && !query.state) { pro.centerGeo = geo; await S.pros.setJSON(pro.id, pro); } }
    }
    if (geo) return reply(200, { ...(await stormAt(S, { lat: geo.lat, lon: geo.lon, label: geo.label, approximate: geo.approximate, radiusMiles: radius, state }, now)), center: { zip, lat: geo.lat, lon: geo.lon } });
  }
  /* Geocoding failed: the whole state, labelled so. */
  const z = zip && zip3Info(zip);
  const center = z ? { zip, lat: z.lat, lon: z.lon } : null;
  return reply(200, { ...(await stormFor(S, { state, center, radiusMiles: radius }, now)), scope: "state" });
});
