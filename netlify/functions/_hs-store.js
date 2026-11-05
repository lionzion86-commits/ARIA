// ARIA HOME SHIELD -- shared store, validation and THE ANONYMIZER.
// Underscore: not an endpoint; every hs-* function imports it.
//
// PRIVACY IS THE FIRST RULE. A pro sees a case only through
// anonymizeCase(): an ALLOWLIST (issue, trades, ZIP3 + area name, state,
// urgency, scrubbed summary, scrubbed policy flags, dates, offer count).
// Name, phone, email, street address, insurer, claim number, policy
// number, docs and the homeowner token are never copied, and the free
// text that does go out (summary, flags) is scrubbed twice: once at write
// time and again at read time, against both generic PII patterns (phones,
// emails, links, street addresses, long id numbers, full ZIPs) and the
// case's own known private values. Only connectedView() -- called for the
// one pro the homeowner explicitly shared contact with -- carries contact.
//
// Stores (Netlify Blobs, strong consistency): hs-cases, hs-pros,
// hs-offers, hs-docs (private: never a public URL; served only by
// hs-doc-get after an auth check), hs-events (the ping feed), hs-sessions,
// hs-messages (talk-first threads) and hs-rate (per-IP counters).
//
// Tests swap the store factory (__setStoreFactory) for an in-memory one,
// and the mailer (__setMailer) for a recorder.
import { getStore, connectLambda } from "@netlify/blobs";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { zip3Info, distanceMiles } from "./_hs-zip3.js";
import { sendMail } from "./_order-email.js";

export const STORE_NAMES = {
  cases: "hs-cases", pros: "hs-pros", offers: "hs-offers", docs: "hs-docs", events: "hs-events",
  sessions: "hs-sessions", messages: "hs-messages", rate: "hs-rate",
  shopSessions: "sessions", // the shop's own login (admin gate, same as admin.html)
};

let storeFactory = null;
let mailer = null;
export function __setStoreFactory(f) { storeFactory = f; }
export function __setMailer(f) { mailer = f; }
export function mail(msg, opts) { return (mailer || sendMail)(msg, opts); }

/** Every store this product uses, for one request. */
export function openStores(event) {
  if (!storeFactory) { try { connectLambda(event); } catch { /* local / already wired */ } }
  const make = storeFactory || ((name) => getStore({ name, consistency: "strong" }));
  const out = {};
  for (const [k, name] of Object.entries(STORE_NAMES)) out[k] = make(name);
  return out;
}

/* ---------------------------------------------------------------- vocab */
export const ISSUES = ["denied_claim", "underpaid_claim", "roof", "leak_water", "policy_review", "inspection", "other"];
export const TRADES = ["public_adjuster", "attorney", "roofer", "insurance_agent", "inspector"];
export const URGENCY = ["emergency", "soon", "planning"];
export const PREFERRED = ["phone", "email", "text"];
export const LICENSE_TYPES = ["public_adjuster", "attorney", "roofing_contractor", "general_contractor", "insurance_agent", "home_inspector", "other"];
export const OFFER_STATUSES = ["pending", "accepted_talk_first", "accepted", "declined"];
export const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
export const DEFAULT_TRADES = {
  denied_claim: ["public_adjuster", "attorney"], underpaid_claim: ["public_adjuster", "attorney"],
  roof: ["roofer", "public_adjuster"], leak_water: ["public_adjuster", "inspector"],
  policy_review: ["insurance_agent", "public_adjuster"], inspection: ["inspector", "roofer"], other: ["public_adjuster"],
};
export const CONSENT_TEXT = "I agree to be contacted ONLY by professionals I approve";

/* ---------------------------------------------------------------- ids + tokens */
export const newId = (prefix) => `${prefix}_${randomBytes(12).toString("hex")}`;
export const newToken = () => randomBytes(32).toString("hex");
export const ID_RX = { case: /^c_[0-9a-f]{24}$/, pro: /^p_[0-9a-f]{24}$/, offer: /^o_[0-9a-f]{24}$/, doc: /^d_[0-9a-f]{24}$/, upload: /^u_[0-9a-f]{24}$/ };
export const isId = (kind, v) => typeof v === "string" && ID_RX[kind].test(v);
export const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Constant-time comparison of the homeowner token. */
export function tokenMatches(expected, given) {
  if (typeof expected !== "string" || typeof given !== "string") return false;
  if (!/^[0-9a-f]{64}$/.test(given) || expected.length !== 64) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
}

/* ---------------------------------------------------------------- http */
export function baseHeaders(methods = "GET, POST, OPTIONS") {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": methods,
  };
}
export function reply(status, body, extra = {}) {
  return { statusCode: status, headers: { ...baseHeaders(), ...extra }, body: JSON.stringify(body) };
}
export const fail = (status, code, error, extra = {}) => reply(status, { error, code, ...extra });

export function clientIp(event) {
  const h = (event && event.headers) || {};
  const raw = h["x-nf-client-connection-ip"] || h["client-ip"] || String(h["x-forwarded-for"] || "").split(",")[0] || "unknown";
  return String(raw).trim().slice(0, 64) || "unknown";
}

/** JSON body with a byte cap. Returns { body } or { error: response }. */
export function readJson(event, maxBytes = 32 * 1024) {
  let raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (Buffer.byteLength(raw) > maxBytes) return { error: fail(413, "too_large", "Request too large") };
  if (!raw) return { body: {} };
  try {
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object" || Array.isArray(b)) return { error: fail(400, "bad_json", "Invalid JSON body") };
    return { body: b };
  } catch { return { error: fail(400, "bad_json", "Invalid JSON body") }; }
}

/**
 * Per-IP counter in hs-rate (fixed window). Returns true when allowed.
 * The IP is stored hashed. Blobs has no atomic increment, so a burst can
 * slip a request or two over the line -- fine for abuse damping.
 */
export async function rateOk(S, bucket, key, limit, windowSec, now = Date.now()) {
  const win = Math.floor(now / 1000 / windowSec);
  const k = `${bucket}/${sha256(key).slice(0, 32)}/${win}`;
  let n = 0;
  try { const v = await S.rate.get(k, { type: "json" }); n = (v && v.n) || 0; } catch { n = 0; }
  if (n >= limit) return false;
  await S.rate.setJSON(k, { n: n + 1, exp: (win + 1) * windowSec * 1000 });
  return true;
}

/**
 * The endpoint wrapper every hs-* function uses: OPTIONS, method guard,
 * the per-IP rate limit on the methods listed in `rate.methods` (POST by
 * default), JSON parsing with a size cap, and a 500 that never leaks a
 * stack trace.
 */
export function endpoint({ methods, rate = null, maxBody = 32 * 1024 }, fn) {
  const allow = methods.join(", ") + ", OPTIONS";
  return async function handler(event) {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: baseHeaders(allow), body: "" };
    if (!methods.includes(event.httpMethod)) return fail(405, "method", "Method not allowed", { allow });
    const S = openStores(event);
    const ip = clientIp(event);
    const now = Date.now();
    try {
      if (rate && (rate.methods || ["POST"]).includes(event.httpMethod)) {
        if (!(await rateOk(S, rate.bucket, ip, rate.limit, rate.windowSec, now))) {
          return fail(429, "rate_limited", "Too many requests. Please wait a few minutes and try again.");
        }
      }
      let body = {};
      if (event.httpMethod === "POST") {
        const r = readJson(event, maxBody);
        if (r.error) return r.error;
        body = r.body;
      }
      const query = event.queryStringParameters || {};
      return await fn({ event, S, body, query, ip, now });
    } catch (e) {
      console.error("[home-shield]", e && e.stack || e);
      return fail(500, "server", "Something went wrong on our side. Please try again.");
    }
  };
}

/* ---------------------------------------------------------------- validation */
export function str(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export function normEmail(v) {
  const e = str(v, 254).toLowerCase();
  return EMAIL_RX.test(e) ? e : null;
}
export function normPhone(v) {
  const s = str(v, 30);
  if (!s) return null;
  if (!/^[+()\d\s.-]+$/.test(s)) return null;
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === "1") return `+${d}`;
  if (d.length >= 11 && d.length <= 15 && s.trim().startsWith("+")) return `+${d}`;
  return null;
}
export function normZip(v) {
  const z = String(v ?? "").trim().slice(0, 10).replace(/-\d{4}$/, "");
  return /^\d{5}$/.test(z) && zip3Info(z) ? z : null;
}
export function pickList(v, allowed, max = allowed.length) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => allowed.includes(x)))].slice(0, max);
}

/* ---------------------------------------------------------------- THE SCRUBBER */
const STREET_SUFFIX = "street|st|avenue|ave|av|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|circle|cir|way|place|pl|terrace|ter|trail|trl|parkway|pkwy|highway|hwy|causeway|cswy|loop|path|pike|plaza|crossing|xing|cove|cv|landing|isle|bend|ridge|commons";
const STREET_RX = new RegExp(
  String.raw`\b\d{1,6}[A-Za-z]?\s+(?:(?:[NSEW]|NE|NW|SE|SW|North|South|East|West)\.?\s+)?(?:[A-Za-z0-9][A-Za-z0-9.'-]*\s+){0,4}(?:${STREET_SUFFIX})\b\.?(?:\s*,?\s*(?:apt|apartment|unit|suite|ste|#)\s*\.?\s*[A-Za-z0-9-]+)?`,
  "gi");
const CALLE_RX = /\b(?:calle|avenida|av\.|carrera|camino)\s+[A-Za-z0-9 .'-]{1,40}?\s*#?\s*\d{1,6}\b|\b\d{1,6}\s+(?:calle|avenida|camino)\s+[A-Za-zÁÉÍÓÚáéíóúñÑ0-9.'-]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ0-9.'-]+){0,3}/gi;
const UNIT_RX = /\b(?:apt|apartment|unit|suite|ste|apto|apartamento)\.?\s*#?\s*[A-Za-z0-9-]{1,8}\b/gi;
const PO_BOX_RX = /\bp\.?\s*o\.?\s*box\s*\d+\b/gi;
const EMAIL_FIND_RX = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?:\.|\s*\(dot\)\s*|\s*\[dot\]\s*)[A-Za-z]{2,}\b/gi;
const URL_RX = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|gov|edu|info|biz|app)(?:\/[^\s<>"']*)?/gi;
const PHONE_RX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{4}\b/g;
const LABELLED_ID_RX = /\b(policy|p[oó]liza|claim|reclamo|reclamaci[oó]n|pol|clm|account|acct|cuenta|file|loan|member|certificate|cert|ref(?:erence)?)(\s*(?:number|num|no\.?|n[uú]mero|#|id)?\s*[:#.]?\s*)(?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{3,}/gi;
const MIXED_ID_RX = /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d{3})[A-Za-z0-9]{2,}(?:-[A-Za-z0-9]+)+\b|\b(?=[A-Za-z]*\d)(?=\d*[A-Za-z])[A-Za-z0-9]{8,}\b/g;
const LONG_NUM_RX = /(?<![$\d,.])\b\d{6,}\b/g;
const ZIP5_RX = /(?<![$\d,.#])\b(\d{3})\d{2}(?:-\d{4})?\b(?!\s*(?:sq|square|ft|feet|%|dollars))/gi;
const NAME_INTRO_RX = /\b(my name is|name is|mi nombre es|me llamo|this is|soy|i am|i'm)\s+((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+)(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+){0,3})/g;
const HONORIFIC_RX = /\b(Mr|Mrs|Ms|Miss|Dr|Sr|Sra|Srta|Don|Doña)\.?\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+)?/g;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every private value the case holds, for the exact-match pass. */
export function knownPrivate(c) {
  if (!c) return [];
  const ct = c.contact || {};
  const vals = [ct.name, ct.email, ct.phone, c.address, c.claimNumber, c.policyNumber];
  const out = [];
  for (const v of vals) if (typeof v === "string" && v.trim()) out.push(v.trim());
  /* Each part of the name on its own ("Maria" alone still identifies). */
  if (typeof ct.name === "string") for (const p of ct.name.split(/\s+/)) if (p.replace(/\W/g, "").length >= 2) out.push(p.replace(/[^\p{L}'’-]/gu, ""));
  if (typeof c.address === "string") {
    const num = c.address.match(/^\s*(\d{1,6})\s+(.+?)(?:,|$)/);
    if (num) out.push(num[2].trim());
  }
  return out.filter((v) => v && v.length >= 2);
}

/**
 * Remove PII from free text. `known` is the case's own private values
 * (names, the phone, the email, the address, claim/policy numbers),
 * removed wherever they appear; then the generic patterns.
 */
export function scrubText(text, known = []) {
  let s = typeof text === "string" ? text : "";
  if (!s) return "";
  s = s.replace(EMAIL_FIND_RX, "[email removed]");
  s = s.replace(URL_RX, "[link removed]");
  for (const k of known) {
    if (typeof k !== "string" || k.length < 2) continue;
    const digits = k.replace(/\D/g, "");
    if (/^\+?[\d\s().-]+$/.test(k) && digits.length >= 7) {
      /* A phone, in any formatting: match the last 10 (or all) digits with separators allowed. */
      const tail = digits.length > 10 ? digits.slice(-10) : digits;
      s = s.replace(new RegExp(tail.split("").map(reEsc).join("[\\s().+-]*"), "g"), "[removed]");
      continue;
    }
    s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(k)}(?![\\p{L}\\p{N}])`, "giu"), "[removed]");
  }
  s = s.replace(LABELLED_ID_RX, (m, label, sep) => `${label}${sep.replace(/[:#.\s]+$/, "")} [number removed]`);
  s = s.replace(STREET_RX, "[address removed]");
  s = s.replace(CALLE_RX, "[address removed]");
  s = s.replace(PO_BOX_RX, "[address removed]");
  s = s.replace(UNIT_RX, "[address removed]");
  s = s.replace(PHONE_RX, "[phone removed]");
  s = s.replace(MIXED_ID_RX, "[number removed]");
  s = s.replace(LONG_NUM_RX, "[number removed]");
  s = s.replace(ZIP5_RX, "$1xx");
  s = s.replace(NAME_INTRO_RX, (m, intro) => `${intro} [name removed]`);
  s = s.replace(HONORIFIC_RX, "[name removed]");
  return s.replace(/(\[(?:removed|name removed|address removed)\][\s,]*){2,}/g, "[removed] ").replace(/[ \t]{2,}/g, " ").trim();
}

/* ---------------------------------------------------------------- views */
export function areaOf(zip) {
  const i = zip3Info(zip);
  return i ? { zip3: i.zip3, label: i.area, state: i.state } : { zip3: null, label: null, state: null };
}

/**
 * THE ANONYMIZED CASE: what a verified, matching pro sees before the
 * homeowner shares contact. An allowlist -- nothing is spread from the
 * stored object, so a field added to the case later never leaks here.
 */
export function anonymizeCase(c) {
  const known = knownPrivate(c);
  const area = areaOf(c.zip);
  return {
    id: c.id,
    createdAt: c.createdAt,
    status: c.status === "connected" ? "connected" : (c.status === "closed" ? "closed" : "open"),
    issue: ISSUES.includes(c.issue) ? c.issue : "other",
    trades: pickList(c.trades, TRADES),
    area: { zip3: area.zip3, label: area.label, state: c.state || area.state },
    urgency: URGENCY.includes(c.urgency) ? c.urgency : "soon",
    summary: scrubText(c.summary, known).slice(0, 2000),
    policyFlags: (Array.isArray(c.policyFlags) ? c.policyFlags : []).slice(0, 16).map((f) => scrubText(String(f), known).slice(0, 200)),
    hasDocs: Array.isArray(c.docs) && c.docs.length > 0,
    offerCount: Array.isArray(c.offers) ? c.offers.length : 0,
    lang: c.lang === "es" ? "es" : "en",
  };
}

/** Doc metadata a viewer may see (no storage keys; the URL is an authed function). */
export function docView(meta, base = "/.netlify/functions/hs-doc-get") {
  return { id: meta.id, name: meta.name, type: meta.type, size: meta.size, createdAt: meta.createdAt, kind: meta.kind || "document",
    url: `${base}?d=${encodeURIComponent(meta.id)}&c=${encodeURIComponent(meta.caseId)}` };
}

/** Full case for the ONE connected pro (contact shared by the homeowner). */
export function connectedView(c, docsMeta = []) {
  return {
    ...anonymizeCase(c),
    zip: c.zip,
    address: c.address || null,
    insurer: c.insurer || null,
    claimNumber: c.claimNumber || null,
    policyNumber: c.policyNumber || null,
    summaryFull: typeof c.summary === "string" ? c.summary : "",
    contact: { name: c.contact.name, phone: c.contact.phone || null, email: c.contact.email || null, preferred: c.contact.preferred || null },
    docs: docsMeta.map((m) => docView(m)),
    connectedAt: c.connectedAt || null,
  };
}

/** A pro as the homeowner sees them on an offer (no contact until shared). */
export function proForHomeowner(p, { shared = false } = {}) {
  if (!p) return null;
  const out = { id: p.id, name: p.name, company: p.company || null, trades: p.trades || [], licenseType: p.licenseType,
    licenseNumber: p.licenseNumber, licenseState: p.licenseState, verified: !!p.verified, bio: p.bio || null };
  if (shared) { out.phone = p.phone || null; out.email = p.email; }
  return out;
}

/** A pro as the pro (and admin) sees their own record. */
export function proSelf(p) {
  if (!p) return null;
  const { passHash, ...rest } = p;
  return rest;
}

/* ---------------------------------------------------------------- matching */
export function proServesZip(p, zip) {
  if (!p || !zip) return false;
  if (Array.isArray(p.serviceZips) && p.serviceZips.length) {
    return p.serviceZips.some((z) => z === zip || (z.length === 3 && zip.startsWith(z)));
  }
  const area = p.serviceArea || {};
  if (!area.centerZip) return false;
  return distanceMiles(area.centerZip, zip) <= (Number(area.radiusMiles) || 0);
}

/** A verified pro sees a case when a trade overlaps, the case is in their license state and inside their area. */
export function caseMatchesPro(c, p) {
  if (!c || !p || !p.verified || p.disabled) return false;
  if (!["open", "offered"].includes(c.status)) return false;
  if (!(c.trades || []).some((t) => (p.trades || []).includes(t))) return false;
  if (p.licenseState && c.state && p.licenseState !== c.state) return false;
  return proServesZip(p, c.zip);
}

/* ---------------------------------------------------------------- loading */
export async function getJSON(store, key) {
  try { return await store.get(key, { type: "json" }); } catch { return null; }
}
export async function listKeys(store, prefix = "") {
  const out = [];
  let r;
  try { r = await store.list(prefix ? { prefix } : {}); } catch { return out; }
  for (const b of (r && r.blobs) || []) out.push(b.key);
  return out;
}
export async function loadAll(store, prefix = "") {
  const keys = await listKeys(store, prefix);
  const vals = await Promise.all(keys.map((k) => getJSON(store, k)));
  return vals.filter(Boolean);
}

/** The case, when the token is right; else null (same answer for "no such case"). */
export async function caseForToken(S, caseId, token) {
  if (!isId("case", caseId)) return null;
  const c = await getJSON(S.cases, caseId);
  if (!c || !tokenMatches(c.token, token)) return null;
  return c;
}

export async function docsFor(S, c) {
  const metas = await Promise.all((c.docs || []).map((id) => getJSON(S.docs, `meta/${id}`)));
  return metas.filter(Boolean);
}

export async function pushEvent(S, key, ev) {
  try { await S.events.setJSON(key, ev); } catch { /* the feed also reads cases directly */ }
}

export function siteOrigin(env = process.env) {
  const o = String(env.HS_SITE_ORIGIN || env.URL || "https://ariashop.pe").replace(/\/+$/, "");
  return /^https?:\/\//.test(o) ? o : "https://ariashop.pe";
}
export const caseLink = (c, env = process.env) => `${siteOrigin(env)}/home-shield/caso?c=${encodeURIComponent(c.id)}&t=${encodeURIComponent(c.token)}`;
