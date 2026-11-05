// ARIA HOME SHIELD -- storm data for partner desks (#443 c.6662387520). Underscore: not an endpoint.
//
// Free public sources only, no key:
//   NWS active alerts   https://api.weather.gov/alerts/active?area=<STATE>  (GeoJSON)
//   SPC storm reports   https://www.spc.noaa.gov/climo/reports/{today,yesterday}_filtered.csv
// Cached in the hs-storm Blobs store for 15 minutes (alerts per state, SPC per day file).
// When an upstream fails, the last good copy is served with stale:true and its time; with
// no good copy the list is empty and `error` says so. Nothing is ever invented.
import { getJSON } from "./_hs-store.js";
import { zip3Info, findArea } from "./_hs-zip3.js";

export const UA = "AriaHomeShield (contact via site)";
export const TTL_MS = 15 * 60 * 1000;
export const NWS_URL = (st) => `https://api.weather.gov/alerts/active?area=${encodeURIComponent(st)}`;
export const NWS_POINT_URL = (lat, lon) => `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
export const CENSUS_URL = (q) => `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
export const GEO_TTL_MS = 30 * 24 * 3600 * 1000;
export const SPC_URL = (day) => `https://www.spc.noaa.gov/climo/reports/${day}_filtered.csv`;
export const EVENTS = /^(Hurricane|Tropical Storm|Severe Thunderstorm|Tornado|High Wind|Extreme Wind|Flood|Flash Flood|Coastal Flood|Storm Surge|Hail)\b/i;

let fetchImpl = (...a) => fetch(...a);
export function __setFetch(f) { fetchImpl = f || ((...a) => fetch(...a)); }

const DIRS = "north|northeast|east|southeast|south|southwest|west|northwest|north-northeast|east-northeast|east-southeast|south-southeast|south-southwest|west-southwest|west-northwest|north-northwest";
const MOVE_RX = new RegExp(`\\bmoving\\s+(?:toward\\s+the\\s+)?(${DIRS.split("|").sort((a, b) => b.length - a.length).join("|")})(?:\\s+at\\s+(\\d{1,3})\\s*mph)?`, "i");

/** NWS GeoJSON -> the alerts a desk cares about. */
export function parseAlerts(json) {
  const feats = (json && Array.isArray(json.features)) ? json.features : [];
  return feats.map((f) => f && f.properties || {}).filter((p) => EVENTS.test(String(p.event || ""))).map((p) => {
    const m = MOVE_RX.exec(`${p.description || ""} ${p.headline || ""}`);
    return { id: String(p.id || ""), event: String(p.event), areas: String(p.areaDesc || "").slice(0, 400), severity: p.severity || null,
      urgency: p.urgency || null, sent: p.sent || null, expires: p.ends || p.expires || null, headline: String(p.headline || "").slice(0, 300),
      moving: m ? { toward: m[1].toLowerCase(), mph: m[2] ? Number(m[2]) : null } : null };
  });
}

/** SPC filtered CSV (three header blocks: tornado F_Scale, wind Speed, hail Size) -> reports. */
export function parseSpc(csv, day = "today") {
  const out = [];
  let type = null;
  for (const raw of String(csv || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^Time,/i.test(line)) { const c = line.split(",")[1].toLowerCase(); type = c.startsWith("f_scale") ? "tornado" : c.startsWith("speed") ? "wind" : c.startsWith("size") ? "hail" : null; continue; }
    if (!type) continue;
    const cols = line.split(",");
    if (cols.length < 7) continue;
    const lat = Number(cols[5]), lon = Number(cols[6]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const mag = cols[1] === "UNK" ? null : cols[1];
    out.push({ type, day, time: cols[0], magnitude: type === "hail" && mag ? `${(Number(mag) / 100).toFixed(2)} in` : type === "wind" && mag ? `${mag} mph` : mag,
      location: cols[2], county: cols[3], state: cols[4], lat, lon, comments: cols.slice(7).join(",").slice(0, 300) });
  }
  return out;
}

export function milesBetween(a, b) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function cached(S, key, now, load, ttl = TTL_MS) {
  const prev = await getJSON(S.storm, key);
  if (prev && now - Date.parse(prev.fetchedAt) < ttl) return { ...prev, stale: false };
  try {
    const data = await load();
    const rec = { fetchedAt: new Date(now).toISOString(), data };
    await S.storm.setJSON(key, rec);
    return { ...rec, stale: false };
  } catch (e) {
    if (prev) return { ...prev, stale: true, error: String(e.message || e).slice(0, 200) };
    return { fetchedAt: null, data: [], stale: true, error: String(e.message || e).slice(0, 200) };
  }
}
async function get(url, type) {
  const r = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: type }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return type.includes("json") ? r.json() : r.text();
}

/** The storm picture for a state and a center (lat/lon) within radiusMiles. */
export async function stormFor(S, { state, center, radiusMiles }, now = Date.now(), { skipStateAlerts = false } = {}) {
  const a = skipStateAlerts ? { data: [], fetchedAt: null, stale: false } : await cached(S, `alerts/${state}`, now, async () => parseAlerts(await get(NWS_URL(state), "application/geo+json")));
  const t = await cached(S, "spc/today", now, async () => parseSpc(await get(SPC_URL("today"), "text/csv"), "today"));
  const y = await cached(S, "spc/yesterday", now, async () => parseSpc(await get(SPC_URL("yesterday"), "text/csv"), "yesterday"));
  const reports = [...t.data, ...y.data].map((r) => ({ ...r, miles: center ? Math.round(milesBetween(center, r)) : null }))
    .filter((r) => center && r.miles <= radiusMiles)
    .sort((p, q) => (p.day === q.day ? q.time.localeCompare(p.time) : p.day === "today" ? -1 : 1));
  const counts = { wind: 0, hail: 0, tornado: 0 };
  for (const r of reports) counts[r.type]++;
  const fetched = [a.fetchedAt, t.fetchedAt, y.fetchedAt].filter(Boolean).sort();
  return { state, center, radiusMiles, alerts: a.data, reports: reports.slice(0, 200), counts,
    stale: a.stale || t.stale || y.stale, fetchedAt: fetched[0] || null,
    errors: [a.error, t.error, y.error].filter(Boolean), source: "NOAA / NWS / SPC" };
}

/* ---------------------------------------------------------------- geocoding (free, no key) */
const norm = (q) => String(q || "").replace(/[\u0000-\u001F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

/**
 * A ZIP, city or street address -> { lat, lon, label, approximate, source } or null.
 * The US Census geocoder first (exact for street addresses); a ZIP or a city it cannot place
 * falls back to the committed ZIP3 table and is marked approximate. Cached 30 days per query.
 */
export async function geocode(S, raw, now = Date.now()) {
  const q = norm(raw);
  if (q.length < 3) return null;
  const r = await cached(S, `geo/${q.toLowerCase()}`, now, async () => {
    let hit = null;
    try {
      const j = await get(CENSUS_URL(q), "application/json");
      const m = j && j.result && Array.isArray(j.result.addressMatches) ? j.result.addressMatches[0] : null;
      if (m && m.coordinates && Number.isFinite(m.coordinates.y) && Number.isFinite(m.coordinates.x)) {
        hit = { lat: m.coordinates.y, lon: m.coordinates.x, label: m.matchedAddress || q, approximate: false, source: "census",
          state: (m.addressComponents && m.addressComponents.state) || null };
      }
    } catch { /* fall back below */ }
    if (!hit) {
      const zip = (q.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1];
      const z = zip && zip3Info(zip);
      if (z) hit = { lat: z.lat, lon: z.lon, label: `${zip} (${z.area})`, approximate: true, source: "zip3", state: z.state };
      else {
        const a = findArea(q);
        if (a) hit = { lat: a.lat, lon: a.lon, label: a.label + (a.state ? `, ${a.state}` : ""), approximate: true, source: "zip3", state: a.state };
      }
    }
    if (!hit) throw new Error("no match");
    return hit;
  }, GEO_TTL_MS);
  return r.data && r.data.lat != null ? r.data : null;
}

/** Points to ask NWS about: the center, plus N/S/E/W on the radius edge when the radius is over 25 miles. */
export function probePoints(center, radiusMiles) {
  const pts = [center];
  if (radiusMiles > 25) {
    const dLat = radiusMiles / 69.17, dLon = radiusMiles / (69.17 * Math.cos((center.lat * Math.PI) / 180));
    pts.push({ lat: center.lat + dLat, lon: center.lon }, { lat: center.lat - dLat, lon: center.lon }, { lat: center.lat, lon: center.lon + dLon }, { lat: center.lat, lon: center.lon - dLon });
  }
  return pts.map((p) => ({ lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100 }));
}

/**
 * The storm picture for a POINT: NWS alerts whose zones/polygons cover the center (and the
 * radius edge), de-duplicated by id; SPC reports within radiusMiles. When every point query
 * fails with nothing cached, it falls back to the whole state (scope "state") -- labelled.
 */
export async function stormAt(S, { lat, lon, radiusMiles, label = null, approximate = false, state = null }, now = Date.now()) {
  const center = { lat, lon };
  const res = [];
  for (const p of probePoints(center, radiusMiles)) {
    res.push(await cached(S, `alerts/pt/${p.lat.toFixed(2)},${p.lon.toFixed(2)}`, now, async () => parseAlerts(await get(NWS_POINT_URL(p.lat, p.lon), "application/geo+json"))));
  }
  const ok = res.filter((r) => r.fetchedAt);
  let alerts, scope = "area", alertErrors = res.map((r) => r.error).filter(Boolean), alertStale = res.some((r) => r.stale), alertTimes = ok.map((r) => r.fetchedAt);
  if (ok.length) {
    const seen = new Map();
    for (const r of ok) for (const a of r.data) if (!seen.has(a.id)) seen.set(a.id, a);
    alerts = [...seen.values()];
  } else if (state) {
    const st = await cached(S, `alerts/${state}`, now, async () => parseAlerts(await get(NWS_URL(state), "application/geo+json")));
    alerts = st.data; scope = "state"; alertStale = alertStale || st.stale; if (st.fetchedAt) alertTimes = [st.fetchedAt]; if (st.error) alertErrors.push(st.error);
  } else alerts = [];
  const base = await stormFor(S, { state: state || "", center, radiusMiles }, now, { skipStateAlerts: true });
  const fetched = [...alertTimes, base.fetchedAt].filter(Boolean).sort();
  return { ...base, alerts, scope, location: { label, approximate, lat, lon }, stale: base.stale || alertStale,
    fetchedAt: fetched[0] || null, errors: [...alertErrors, ...base.errors] };
}
