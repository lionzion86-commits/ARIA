// ARIA HOME SHIELD -- PRO PROFILES, COVERAGE and the CUSTOMER PICK (#443 c.6664612623,
// c.6664632032, c.6666616147, c.6668346697, c.6668371372, c.6668377117, c.6668413152).
// Underscore: not an endpoint.
//
// COVERAGE BEATS PROXIMITY. A pro sets two layers on the desk: licenseStates (the
// ceiling: where licensed) and a range ({ mode: "statewide" } or { mode: "radius",
// baseZip, miles 10..500 }). A case is eligible iff its state is in licenseStates
// AND (statewide OR ZIP3 distance from baseZip <= miles). Older records with
// serviceArea {centerZip, radiusMiles} migrate to a radius range on read.
//
// CUSTOMERS NEVER SEE DISTANCE. The customer card / full profile carry no city, no
// base ZIP, no range, no miles, no phone/email/address; location language is only
// "Licensed in your area". Order is best fit, never nearest-first: trade fit,
// profile richness, years, connected history, then a stable per-case shuffle.
// Distance is not an input to order (it is only the yes/no of eligibility).
import { createHash } from "node:crypto";
import { str, pickList, TRADES, US_STATES, normZip, getJSON, isId } from "./_hs-store.js";
import { distanceMiles, zip3Info } from "./_hs-zip3.js";

export const MAX_PHOTOS = 12;
export const ABOUT_MIN = 80;

/* ---------------------------------------------------------------- coverage */
export function coverageOf(pro) {
  const ls = Array.isArray(pro.licenseStates) && pro.licenseStates.length ? pro.licenseStates : (pro.licenseState ? [pro.licenseState] : []);
  let range = pro.range || null;
  if (!range) {
    if (pro.serviceArea && pro.serviceArea.centerZip) range = { mode: "radius", baseZip: pro.serviceArea.centerZip, miles: Number(pro.serviceArea.radiusMiles) || 50 };
    else if (Array.isArray(pro.serviceZips) && pro.serviceZips.length) range = { mode: "zips", zips: pro.serviceZips };
    else range = { mode: "statewide" };
  }
  return { licenseStates: ls, range };
}

/** Validated coverage from the desk, or { error }. */
export function validateCoverage(input) {
  const c = input || {};
  const licenseStates = [...new Set((Array.isArray(c.licenseStates) ? c.licenseStates : []).map((s) => String(s).toUpperCase()))].filter((s) => US_STATES.includes(s)).slice(0, 51);
  if (!licenseStates.length) return { error: "Choose at least one state where you are licensed" };
  const r = c.range || {};
  if (r.mode === "statewide") return { coverage: { licenseStates, range: { mode: "statewide" } } };
  if (r.mode === "radius") {
    const baseZip = normZip(r.baseZip);
    const miles = Math.round(Number(r.miles));
    if (!baseZip) return { error: "Enter the ZIP you work from" };
    if (!(miles >= 10 && miles <= 500)) return { error: "Range must be 10 to 500 miles" };
    return { coverage: { licenseStates, range: { mode: "radius", baseZip, miles } } };
  }
  return { error: "Choose statewide or a radius" };
}

/** Is a case at (zip, state) inside this pro's coverage? */
export function coverageCovers(pro, zip, state) {
  const { licenseStates, range } = coverageOf(pro);
  const st = state || (zip3Info(zip) || {}).state;
  if (!st || !licenseStates.includes(st)) return false;
  if (range.mode === "statewide") return true;
  if (range.mode === "radius") return distanceMiles(range.baseZip, zip) <= range.miles;
  if (range.mode === "zips") return range.zips.some((z) => z === zip || (z.length === 3 && String(zip).startsWith(z)));
  return false;
}

/* ---------------------------------------------------------------- profile */
const KINDS = ["individual", "firm"];
export function proTrade(pro) {
  const p = pro.profile || {};
  return TRADES.includes(p.trade) ? p.trade : (pro.desk && TRADES.includes(pro.desk) ? pro.desk : (pro.trades || [])[0] || null);
}

export function validateProfile(input, prev = {}) {
  const b = input || {};
  const kind = KINDS.includes(b.kind) ? b.kind : (prev.kind || "individual");
  const displayName = str(b.displayName, 80);
  const firmName = str(b.firmName, 100) || null;
  const trade = TRADES.includes(b.trade) ? b.trade : null;
  const y = b.yearsInBusiness === "" || b.yearsInBusiness == null ? null : Number(b.yearsInBusiness);
  if (y !== null && !(Number.isInteger(y) && y >= 0 && y <= 80)) return { error: "Years in business must be 0 to 80" };
  if (b.about != null && typeof b.about === "string" && b.about.length > 1500) return { error: "About is up to 1,500 characters" };
  if (b.philosophy != null && typeof b.philosophy === "string" && b.philosophy.length > 600) return { error: "Philosophy is up to 600 characters" };
  const specialties = (Array.isArray(b.specialties) ? b.specialties : []).map((s) => str(String(s), 40)).filter(Boolean).slice(0, 8);
  return { profile: { ...prev, kind, displayName, firmName, trade, yearsInBusiness: y, about: str(b.about, 1500), philosophy: str(b.philosophy, 600) || null,
    specialties, photos: Array.isArray(prev.photos) ? prev.photos : [] } };
}

/** { complete, missing[] } */
export function completeness(profile) {
  const p = profile || {};
  const missing = [];
  if (!(p.photos || []).some((x) => x.main)) missing.push("mainPhoto");
  if (!p.displayName) missing.push("displayName");
  if (!p.trade) missing.push("trade");
  if (!Number.isInteger(p.yearsInBusiness)) missing.push("yearsInBusiness");
  if (!p.about || p.about.length < ABOUT_MIN) missing.push("about");
  return { complete: missing.length === 0, missing };
}

export function withComplete(profile, now = Date.now()) {
  const c = completeness(profile);
  return { ...profile, complete: c.complete, updatedAt: new Date(now).toISOString() };
}

/** Exactly one main photo when any; order preserved. */
export function normalizePhotos(photos) {
  const list = (photos || []).slice(0, MAX_PHOTOS);
  if (!list.length) return [];
  const mainIdx = Math.max(0, list.findIndex((p) => p.main));
  return list.map((p, i) => ({ id: p.id, w: p.w, h: p.h, main: i === mainIdx }));
}

export const listable = (pro) => !!(pro && pro.verified && !pro.disabled && pro.profile && pro.profile.complete && completeness(pro.profile).complete);

/* ---------------------------------------------------------------- customer views (NO location) */
export const photoUrl = (proId, photoId, size) => `/.netlify/functions/hs-profile-photo?p=${encodeURIComponent(proId)}&i=${encodeURIComponent(photoId)}&s=${size}`;

export function customerCard(pro) {
  const p = pro.profile || {};
  const main = (p.photos || []).find((x) => x.main);
  const about = p.about || "";
  return {
    proId: pro.id, displayName: p.displayName, firmName: p.firmName || null, kind: p.kind || "individual", trade: proTrade(pro),
    yearsInBusiness: p.yearsInBusiness, aboutShort: about.length > 160 ? about.slice(0, 157).replace(/\s+\S*$/, "") + "..." : about,
    mainPhoto: main ? photoUrl(pro.id, main.id, "card") : null, photoCount: (p.photos || []).length,
    licenseVerified: !!pro.verified, licenseType: pro.licenseType || null, specialties: p.specialties || [], location: "licensed_in_area",
  };
}
export function customerProfile(pro) {
  const p = pro.profile || {};
  return { ...customerCard(pro), about: p.about || "", philosophy: p.philosophy || null,
    gallery: (p.photos || []).map((x) => ({ id: x.id, w: x.w, h: x.h, main: !!x.main, card: photoUrl(pro.id, x.id, "card"), full: photoUrl(pro.id, x.id, "full") })) };
}

/* ---------------------------------------------------------------- order: best fit, never nearest */
function richness(p) {
  let r = 0;
  if ((p.photos || []).length >= 3) r++;
  if (p.philosophy) r++;
  if ((p.specialties || []).length >= 2) r++;
  if ((p.about || "").length >= 400) r++;
  return r;
}
const shuffleKey = (caseId, proId) => createHash("sha256").update(`${caseId}:${proId}`).digest("hex");

/** Order pros for a case + trade. history: Map proId -> connected count. */
export function orderPros(pros, c, trade, history = new Map()) {
  return pros.map((pro) => {
    const p = pro.profile || {};
    return { pro, k: [
      proTrade(pro) === trade ? 1 : 0,
      richness(p),
      Math.min(4, Math.floor((p.yearsInBusiness || 0) / 5)),
      Math.min(3, history.get(pro.id) || 0),
    ], h: shuffleKey(c.id, pro.id) };
  }).sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return b.k[i] - a.k[i];
    return a.h.localeCompare(b.h);
  }).map((x) => x.pro);
}

/** Pros a customer may pick for this case + trade (verified, complete, covering the case). */
export function eligibleForCase(pros, c, trade) {
  return pros.filter((p) => listable(p) && (p.trades || []).concat(proTrade(p) || []).includes(trade) && coverageCovers(p, c.zip, c.state));
}

export async function historyCounts(S) {
  const m = new Map();
  try {
    const { blobs } = await S.offers.list({ prefix: "o_" });
    for (const b of blobs) { const o = await getJSON(S.offers, b.key); if (o && o.status === "accepted") m.set(o.proId, (m.get(o.proId) || 0) + 1); }
  } catch { /* no history is fine */ }
  return m;
}

/* ---------------------------------------------------------------- photos: magic + EXIF GPS */
export function photoType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.slice(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)$/.test(buf.slice(8, 12).toString("latin1"))) return "heic";
  return null;
}
export const PHOTO_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

/** True when a JPEG still carries an APP1 Exif block with a GPS IFD pointer (tag 0x8825). */
export function jpegHasGps(buf) {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return false;
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) return false;
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) return false; // start of scan / end: no more metadata
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.slice(i + 4, i + 10).toString("latin1") === "Exif\0\0") {
      const seg = buf.subarray(i + 10, i + 2 + len);
      const le = seg.slice(0, 2).toString("latin1") === "II";
      for (let j = 0; j + 1 < seg.length; j++) {
        if (le ? (seg[j] === 0x25 && seg[j + 1] === 0x88) : (seg[j] === 0x88 && seg[j + 1] === 0x25)) return true;
      }
    }
    i += 2 + len;
  }
  return false;
}

export async function proForCustomer(S, proId) {
  if (!isId("pro", proId)) return null;
  const p = await getJSON(S.pros, proId);
  return listable(p) ? p : null;
}
