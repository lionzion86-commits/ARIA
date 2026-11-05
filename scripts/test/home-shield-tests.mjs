/* ==================================================================
   ARIA HOME SHIELD tests (#443, Danny 2026-11-05).

     node scripts/test/home-shield-tests.mjs

   Two sections, one per builder: BACKEND (the hs-* functions, run
   in-process against an in-memory Blobs mock) and FRONT (the homeowner
   page and hs-chat). PRIVACY IS THE FIRST TEST: before the homeowner
   shares contact, nothing a pro can fetch carries the homeowner's name,
   phone, email, street, claim number, policy number or document links;
   after, only the one connected pro gets them.
   ================================================================== */
import assert from "node:assert/strict";
import { deflateSync, gzipSync } from "node:zlib";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
// hs endpoints are v2 functions (default export, #443 c.6666325601); the webhook is still Lambda-shaped.
const fnOf = (m) => m.default || m.handler;

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 3).join(" | ")}`); console.log("    FAIL " + name); }
}

/* ================================================================
   BACKEND SECTION
   ================================================================ */
console.log("  Home Shield backend");

/* In-memory Blobs (the memStore pattern from dni-docs-tests.mjs, plus binary values). */
function memStore() {
  const m = new Map();
  const toBuf = (v) => (typeof v === "string" ? Buffer.from(v) : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v));
  return {
    m,
    get: async (k, o) => {
      if (!m.has(k)) return null;
      const v = m.get(k);
      if (o && o.type === "json") return JSON.parse(toBuf(v).toString("utf8"));
      if (o && o.type === "arrayBuffer") { const b = toBuf(v); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
      return toBuf(v).toString("utf8");
    },
    set: async (k, v) => { m.set(k, typeof v === "string" ? v : toBuf(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}

const FN = "../../netlify/functions/";
const store = await import(FN + "_hs-store.js");
const STORES = {};
store.__setStoreFactory((name) => (STORES[name] ||= memStore()));
const MAIL = [];
store.__setMailer(async (msg) => { MAIL.push(msg); return { sent: false, error: "test" }; });
process.env.ADMIN_EMAILS = "danny@correo.test";
process.env.URL = "https://ariashop.pe";

const fns = {};
for (const n of ["hs-case-create", "hs-case-status", "hs-case-delete", "hs-case-messages", "hs-doc-upload", "hs-doc-get", "hs-policy-review",
  "hs-offer-respond", "hs-pro-signup", "hs-pro-login", "hs-pro-logout", "hs-pro-me", "hs-pro-feed", "hs-pro-offer", "hs-pro-case",
  "hs-admin-pros", "hs-admin-verify", "hs-admin-cases"]) fns[n] = fnOf(await import(FN + n + ".js"));

let ipSeq = 0;
/** Call a function in-process. Returns { status, body, raw, headers, cookie }. */
async function call(name, { method = "POST", body, query, cookie, ip } = {}) {
  const event = { httpMethod: method, headers: { "x-nf-client-connection-ip": ip || `10.0.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}` }, queryStringParameters: query || {} };
  if (cookie) event.headers.cookie = cookie;
  if (body !== undefined) event.body = typeof body === "string" ? body : JSON.stringify(body);
  const r = await fns[name](event);
  let parsed = null;
  try { parsed = r.isBase64Encoded ? null : JSON.parse(r.body); } catch { parsed = null; }
  const sc = r.headers && r.headers["Set-Cookie"];
  return { status: r.statusCode, body: parsed, raw: r.body, headers: r.headers || {}, setCookie: sc || null,
    cookie: sc ? sc.split(";")[0] : null, bytes: r.isBase64Encoded ? Buffer.from(r.body, "base64") : null };
}

/* Admin: the shop session (same gate as admin.html). */
STORES.sessions = memStore();
await STORES.sessions.setJSON("adm1n", { email: "danny@correo.test", createdAt: new Date().toISOString() });
await STORES.sessions.setJSON("shopper", { email: "ana@correo.test", createdAt: new Date().toISOString() });
const ADMIN = "aria_session=adm1n";

const PRO_BASE = {
  password: "correct horse battery", phone: "(786) 555-0100", attest: true, licenseState: "FL",
};
async function signupPro(email, extra) {
  return call("hs-pro-signup", { body: { ...PRO_BASE, email, name: "Pro " + email.split("@")[0], company: "Shield Co", ...extra } });
}
async function verify(proId, verified = true) { return call("hs-admin-verify", { cookie: ADMIN, body: { proId, verified } }); }

/* The homeowner's private values, used in every privacy check below. */
const PII = {
  name: "Maribel Quintero-Santos", phone: "(305) 555-0142", email: "maribel.q@correo.test",
  address: "1234 NW 5th Street, Apt 4B", claimNumber: "CLM-2024-88812", policyNumber: "HO3-4471920",
};
const SUMMARY = `My name is Maribel Quintero-Santos. Roof shingles lifted after Hurricane Milton and water came through the bedroom ceiling. ` +
  `Insurer denied the claim as wear and tear. Call me at 305-555-0142 or write maribel.q@correo.test. The house is at 1234 NW 5th Street, Apt 4B, ` +
  `ZIP 33135. Claim # CLM-2024-88812, policy number HO3-4471920. Photos at https://photos.example.com/maribel.`;
function caseBody(over = {}) {
  return {
    consent: true, lang: "en",
    caseDraft: { issue: "denied_claim", trades: ["public_adjuster", "attorney"], zip: "33135", urgency: "soon", summary: SUMMARY,
      insurer: "Citizens", claimNumber: PII.claimNumber, policyNumber: PII.policyNumber, address: PII.address,
      policyFlags: ["Hurricane deductible: 2%", "Call 305-555-0142"], ...(over.caseDraft || {}) },
    contact: { name: PII.name, phone: PII.phone, email: PII.email, preferred: "text", ...(over.contact || {}) },
  };
}
/** Every way the private values could leak, as needles. */
const NEEDLES = [
  "Maribel", "Quintero", "Santos", "maribel.q", "correo.test", "3055550142", "305-555-0142", "(305) 555-0142", "555-0142", "5550142",
  "1234 NW", "5th Street", "Apt 4B", "CLM-2024-88812", "88812", "HO3-4471920", "4471920", "33135", "photos.example.com", "hs-doc-get",
];
function assertNoPII(obj, where, extra = []) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj);
  for (const n of [...NEEDLES, ...extra]) assert.ok(!s.includes(n), `${where} leaked "${n}"`);
  assert.ok(!/"d_[0-9a-f]{24}"|d=d_/.test(s), `${where} leaked a document id`);
}

/* A tiny real PDF with a text layer (Helvetica, FlateDecode content stream). */
function makePdf(lines) {
  const esc = (t) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT /F1 10 Tf 50 760 Td 14 TL\n";
  lines.forEach((l, i) => { content += (i ? "T* " : "") + `(${esc(l)}) Tj\n`; });
  content += "ET\n";
  const z = deflateSync(Buffer.from(content, "latin1"));
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [];
  let len = parts[0].length;
  objs.forEach((o, i) => { const b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1"); offsets.push(len); parts.push(b); len += b.length; });
  const head = Buffer.from(`5 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, "latin1");
  offsets.push(len);
  parts.push(head, z, Buffer.from("\nendstream\nendobj\n", "latin1"));
  len += head.length + z.length + 18;
  const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}
const POLICY_LINES = [
  "HOMEOWNERS POLICY DECLARATIONS - Named insured: Maribel Quintero-Santos, 1234 NW 5th Street",
  "Policy number HO3-4471920",
  "Coverage A Dwelling $300,000. Settlement: Replacement Cost for the dwelling.",
  "All Other Perils Deductible: $2,500",
  "Hurricane Deductible: 5% of Coverage A",
  "Roof surfacing: losses to the roof are settled at actual cash value.",
  "Water damage and mold are subject to a limit of $10,000 per policy term.",
  "Ordinance or Law coverage: 25% of Coverage A.",
  "Coverage D Loss of Use: $60,000.",
  "We do not insure loss caused by flood, earth movement, wear and tear, or continuous or repeated seepage.",
  "Matching of undamaged materials is not covered beyond the damaged area.",
];

const Pro = {};
const C = {};

await test("pro signup: validates license, area and attestation; creates a pending, signed-in account", async () => {
  let r = await signupPro("ana.pa@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", serviceArea: { centerZip: "33130", radiusMiles: 25 } });
  assert.equal(r.status, 400); assert.equal(r.body.code, "bad_license_number");
  r = await signupPro("ana.pa@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W123456", serviceArea: { centerZip: "33130", radiusMiles: 900 } });
  assert.equal(r.body.code, "bad_radius");
  r = await signupPro("ana.pa@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W123456", attest: false, serviceArea: { centerZip: "33130", radiusMiles: 25 } });
  assert.equal(r.body.code, "attest_required");
  r = await signupPro("ana.pa@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W123456", serviceArea: { centerZip: "33130", radiusMiles: 25 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.pending, true);
  assert.equal(r.body.pro.verified, false);
  assert.ok(!("passHash" in r.body.pro) && !r.raw.includes("correct horse"));
  assert.match(r.setCookie, /^hs_pro=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
  const stored = JSON.parse(STORES["hs-pros"].m.get(r.body.pro.id));
  assert.match(stored.passHash, /^[0-9a-f]{32}:[0-9a-f]{128}$/, "scrypt salt:hash");
  /* The session store keeps only a hash of the cookie. */
  const sid = r.cookie.split("=")[1];
  assert.ok(![...STORES["hs-sessions"].m.keys()].some((k) => k.includes(sid)));
  Pro.pa = { id: r.body.pro.id, cookie: r.cookie };
  r = await signupPro("ana.pa@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W123456", serviceArea: { centerZip: "33130", radiusMiles: 25 } });
  assert.equal(r.status, 409);
});

await test("pro login / me / logout: same answer for unknown email and wrong password", async () => {
  const a = await call("hs-pro-login", { body: { email: "ana.pa@correo.test", password: "wrong password!" } });
  const b = await call("hs-pro-login", { body: { email: "nobody@correo.test", password: "wrong password!" } });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.deepEqual(a.body, b.body);
  const ok = await call("hs-pro-login", { body: { email: "ANA.PA@correo.test", password: PRO_BASE.password } });
  assert.equal(ok.status, 200); assert.equal(ok.body.pending, true);
  assert.match(ok.setCookie, /HttpOnly; Secure; SameSite=Lax/);
  const me = await call("hs-pro-me", { method: "GET", cookie: ok.cookie });
  assert.equal(me.status, 200); assert.equal(me.body.pro.email, "ana.pa@correo.test");
  const out = await call("hs-pro-logout", { cookie: ok.cookie });
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await call("hs-pro-me", { method: "GET", cookie: ok.cookie })).status, 401);
  assert.equal((await call("hs-pro-me", { method: "GET", cookie: "hs_pro=" + "a".repeat(64) })).status, 401);
});

await test("verification gate: an unverified pro sees nothing; only an ADMIN_EMAILS shop session can verify", async () => {
  C.a = await call("hs-case-create", { body: caseBody() });
  assert.equal(C.a.status, 200);
  const f = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie });
  assert.equal(f.status, 403); assert.equal(f.body.code, "pending_verification");
  assert.ok(!f.raw.includes("cases"));
  assert.equal((await call("hs-pro-offer", { cookie: Pro.pa.cookie, body: { caseId: C.a.body.caseId, message: "I can help with this claim." } })).status, 403);
  assert.equal((await call("hs-pro-case", { method: "GET", cookie: Pro.pa.cookie, query: { c: C.a.body.caseId } })).status, 403);
  assert.equal((await call("hs-admin-verify", { body: { proId: Pro.pa.id, verified: true } })).status, 403, "no session");
  assert.equal((await call("hs-admin-verify", { cookie: "aria_session=shopper", body: { proId: Pro.pa.id, verified: true } })).status, 403, "shopper");
  assert.equal((await call("hs-admin-verify", { cookie: Pro.pa.cookie, body: { proId: Pro.pa.id, verified: true } })).status, 403, "pro cookie is not admin");
  assert.equal((await call("hs-admin-pros", { method: "GET", cookie: "aria_session=shopper" })).status, 403);
  const v = await verify(Pro.pa.id);
  assert.equal(v.status, 200); assert.equal(v.body.pro.verified, true); assert.equal(v.body.pro.verifiedBy, "danny@correo.test");
  const ok = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie });
  assert.equal(ok.status, 200);
  /* Revoking is immediate. */
  await verify(Pro.pa.id, false);
  assert.equal((await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie })).status, 403);
  await verify(Pro.pa.id, true);
  const list = await call("hs-admin-pros", { method: "GET", cookie: ADMIN });
  assert.equal(list.status, 200); assert.ok(list.body.pros.every((p) => !("passHash" in p)));
});

await test("case create: consent, ZIP and contact are required; the token is 32 random bytes", async () => {
  assert.equal((await call("hs-case-create", { body: { ...caseBody(), consent: false } })).body.code, "consent_required");
  assert.equal((await call("hs-case-create", { body: caseBody({ caseDraft: { zip: "1234" } }) })).body.code, "bad_zip");
  assert.equal((await call("hs-case-create", { body: caseBody({ contact: { phone: "", email: "" } }) })).body.code, "contact_required");
  assert.equal((await call("hs-case-create", { body: "{not json" })).status, 400);
  assert.equal((await call("hs-case-create", { body: JSON.stringify({ ...caseBody(), pad: "x".repeat(40000) }) })).status, 413);
  assert.match(C.a.body.token, /^[0-9a-f]{64}$/);
  assert.match(C.a.body.caseId, /^c_[0-9a-f]{24}$/);
  const stored = JSON.parse(STORES["hs-cases"].m.get(C.a.body.caseId));
  assert.equal(stored.state, "FL");
  assert.ok(!stored.summary.includes("305-555-0142") && !stored.summary.includes("Maribel"), "summary scrubbed at write time");
  const s = await call("hs-case-status", { method: "GET", query: { c: C.a.body.caseId, t: C.a.body.token } });
  assert.equal(s.status, 200); assert.equal(s.body.case.contact.name, PII.name); assert.ok(!("token" in s.body.case));
  const bad = await call("hs-case-status", { method: "GET", query: { c: C.a.body.caseId, t: "0".repeat(64) } });
  assert.equal(bad.status, 404);
  assert.equal((await call("hs-case-status", { method: "GET", query: { c: C.a.body.caseId, t: C.a.body.token.slice(0, 63) } })).status, 404);
});

await test("feed matching: by trade, by radius and by license state", async () => {
  const mk = async (email, extra) => { const r = await signupPro(email, extra); assert.equal(r.status, 200, JSON.stringify(r.body)); await verify(r.body.pro.id); return { id: r.body.pro.id, cookie: r.cookie }; };
  Pro.roofer = await mk("roof@correo.test", { trades: ["roofer"], licenseType: "roofing_contractor", licenseNumber: "CCC1330000", serviceArea: { centerZip: "33130", radiusMiles: 50 } });
  Pro.tampa = await mk("tampa@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W222222", serviceArea: { centerZip: "33602", radiusMiles: 60 } });
  Pro.ftl = await mk("ftl@correo.test", { trades: ["attorney"], licenseType: "attorney", licenseNumber: "FBN 123456", serviceArea: { centerZip: "33301", radiusMiles: 30 } });
  Pro.ga = await mk("ga@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "GA77777", licenseState: "GA", serviceArea: { centerZip: "33130", radiusMiles: 100 } });
  Pro.zips = await mk("zips@correo.test", { trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W333333", serviceZips: ["331"] });
  const ids = async (p) => (await call("hs-pro-feed", { method: "GET", cookie: p.cookie })).body.cases.map((c) => c.id);
  const id = C.a.body.caseId;
  assert.ok((await ids(Pro.pa)).includes(id), "Miami PA, 25 mi");
  assert.ok(!(await ids(Pro.roofer)).includes(id), "roofer: wrong trade");
  assert.ok(!(await ids(Pro.tampa)).includes(id), "Tampa PA: out of radius");
  assert.ok((await ids(Pro.ftl)).includes(id), "Fort Lauderdale attorney, 30 mi");
  assert.ok(!(await ids(Pro.ga)).includes(id), "GA license: wrong state");
  assert.ok((await ids(Pro.zips)).includes(id), "ZIP3 list");
  const roofCase = await call("hs-case-create", { body: caseBody({ caseDraft: { issue: "roof", trades: ["roofer"], zip: "33139" } }) });
  assert.ok((await ids(Pro.roofer)).includes(roofCase.body.caseId));
  assert.ok(!(await ids(Pro.pa)).includes(roofCase.body.caseId));
});

await test("live feed: a new matching case appears in newCaseIds after `since` (the ping)", async () => {
  const f1 = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie, query: { since: new Date().toISOString() } });
  assert.deepEqual(f1.body.newCaseIds, []);
  await new Promise((r) => setTimeout(r, 5));
  C.b = await call("hs-case-create", { body: caseBody({ caseDraft: { issue: "underpaid_claim", zip: "33145" } }) });
  const f2 = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie, query: { since: f1.body.now } });
  assert.deepEqual(f2.body.newCaseIds, [C.b.body.caseId]);
  const f3 = await call("hs-pro-feed", { method: "GET", cookie: Pro.roofer.cookie, query: { since: f1.body.now } });
  assert.deepEqual(f3.body.newCaseIds, [], "the roofer is not pinged for an adjuster case");
  assert.ok([...STORES["hs-events"].m.keys()].some((k) => k.startsWith("case/") && k.endsWith(C.b.body.caseId)));
});

await test("anonymizer (strict): unit patterns", async () => {
  const s = store.scrubText(SUMMARY, store.knownPrivate({ contact: { name: PII.name, phone: PII.phone, email: PII.email }, address: PII.address, claimNumber: PII.claimNumber, policyNumber: PII.policyNumber }));
  assertNoPII(s, "scrubText");
  assert.match(s, /Hurricane Milton/); assert.match(s, /331xx/);
  const g = store.scrubText("Reach me: +1 954.555.0199, j.doe@correo.test, 742 Evergreen Terrace, 88 Calle Ocho, P.O. Box 1234, policy no: ABC12345, claim 99887766, my name is John Doe, Mrs. Rivera. Deductible $2,500 and 2% hurricane, Coverage A $300,000.");
  for (const n of ["954", "0199", "j.doe", "Evergreen", "Calle Ocho", "Box 1234", "ABC12345", "99887766", "John", "Rivera"]) assert.ok(!g.includes(n), `generic leaked ${n}: ${g}`);
  for (const keep of ["$2,500", "2% hurricane", "$300,000"]) assert.ok(g.includes(keep), `over-scrubbed ${keep}`);
});

await test("anonymizer (strict): before approval, feed and case view withhold every private field", async () => {
  const feed = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie });
  const card = feed.body.cases.find((c) => c.id === C.a.body.caseId);
  assert.ok(card);
  assert.deepEqual(Object.keys(card).sort(), ["area", "createdAt", "hasDocs", "id", "issue", "lang", "myOffer", "offerCount", "policyFlags", "status", "summary", "trades", "urgency"]);
  assert.deepEqual(card.area, { zip3: "331", label: "Miami area", state: "FL" });
  assert.ok(!("contact" in card) && !("token" in card) && !("docs" in card) && !("claimNumber" in card) && !("policyNumber" in card) && !("address" in card));
  assertNoPII(feed.raw, "feed", [C.a.body.token]);
  const one = await call("hs-pro-case", { method: "GET", cookie: Pro.pa.cookie, query: { c: C.a.body.caseId } });
  assert.equal(one.body.view, "anonymized");
  assertNoPII(one.raw, "hs-pro-case", [C.a.body.token]);
  /* A pro who does not match cannot even open it. */
  assert.equal((await call("hs-pro-case", { method: "GET", cookie: Pro.tampa.cookie, query: { c: C.a.body.caseId } })).status, 404);
});

await test("offer -> homeowner sees license, not pro contact; talk first opens a thread with NO contact", async () => {
  const id = C.a.body.caseId, t = C.a.body.token;
  assert.equal((await call("hs-pro-offer", { cookie: Pro.pa.cookie, body: { caseId: id, message: "short" } })).body.code, "short_message");
  const o = await call("hs-pro-offer", { cookie: Pro.pa.cookie, body: { caseId: id, message: "Licensed PA in Miami-Dade, 12 years on denied roof claims." } });
  assert.equal(o.status, 200); C.offerPa = o.body.offer.id;
  assert.equal((await call("hs-pro-offer", { cookie: Pro.pa.cookie, body: { caseId: id, message: "Second try at the same case" } })).body.code, "exists");
  const o2 = await call("hs-pro-offer", { cookie: Pro.ftl.cookie, body: { caseId: id, message: "Florida Bar attorney, insurance litigation." } });
  C.offerFtl = o2.body.offer.id;
  assert.equal((await call("hs-pro-offer", { cookie: Pro.roofer.cookie, body: { caseId: id, message: "Roofer here wants this case" } })).status, 404, "non-matching pro cannot request");
  const mail = MAIL.find((m) => m.to === PII.email);
  assert.ok(mail && mail.text.includes("/home-shield/caso?c=" + id), "homeowner notified with their link");
  const s = await call("hs-case-status", { method: "GET", query: { c: id, t } });
  assert.equal(s.body.case.status, "offered");
  const op = s.body.offers.find((x) => x.id === C.offerPa);
  assert.equal(op.pro.licenseNumber, "W123456"); assert.ok(!("phone" in op.pro) && !("email" in op.pro));

  const tf = await call("hs-offer-respond", { body: { caseId: id, token: t, offerId: C.offerPa, action: "talk_first" } });
  assert.equal(tf.status, 200); assert.equal(tf.body.offer.status, "accepted_talk_first");
  assert.ok(!("phone" in tf.body.pro));
  const feed = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie });
  assert.equal(feed.body.offers.find((x) => x.id === C.offerPa).status, "accepted_talk_first");
  assert.deepEqual(feed.body.connected, []);
  assertNoPII(feed.raw, "feed during talk-first", [t]);
  assertNoPII((await call("hs-pro-case", { method: "GET", cookie: Pro.pa.cookie, query: { c: id } })).raw, "case during talk-first");

  /* The thread. */
  const hm = await call("hs-case-messages", { body: { caseId: id, token: t, proId: Pro.pa.id, text: "Hi, I'm Maribel. What would you need? You can call me at 305-555-0142." } });
  assert.equal(hm.status, 200); assert.equal(hm.body.scrubbed, true);
  const pm = await call("hs-case-messages", { cookie: Pro.pa.cookie, body: { caseId: id, text: "Your denial letter and the policy declarations, please." } });
  assert.equal(pm.status, 200);
  const th = await call("hs-case-messages", { method: "GET", cookie: Pro.pa.cookie, query: { c: id } });
  assert.equal(th.body.messages.length, 2); assert.deepEqual(th.body.messages.map((m) => m.from), ["homeowner", "pro"]);
  assertNoPII(th.raw, "thread seen by pro", [t]);
  const hth = await call("hs-case-messages", { method: "GET", query: { c: id, t, p: Pro.pa.id } });
  assert.equal(hth.body.messages.length, 2);
  /* A pro the homeowner has not opened a conversation with cannot read or write it. */
  assert.equal((await call("hs-case-messages", { method: "GET", cookie: Pro.ftl.cookie, query: { c: id } })).status, 403);
  assert.equal((await call("hs-case-messages", { cookie: Pro.ftl.cookie, body: { caseId: id, text: "hello there" } })).status, 403);
  assert.equal((await call("hs-case-messages", { body: { caseId: id, token: t, proId: Pro.ftl.id, text: "hi" } })).status, 403);
  /* Notices for the pro. */
  const n = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie, query: { since: new Date(Date.now() - 60000).toISOString() } });
  assert.ok(n.body.notices.some((x) => x.type === "talk_first") && n.body.notices.some((x) => x.type === "message"));
});

await test("doc access: private store, token or connected pro only, bytes checked", async () => {
  const id = C.a.body.caseId, t = C.a.body.token;
  const pdf = makePdf(POLICY_LINES);
  assert.equal((await call("hs-doc-upload", { body: { caseId: id, token: "f".repeat(64), file: { name: "p.pdf", type: "application/pdf", data: pdf.toString("base64") } } })).status, 404);
  assert.equal((await call("hs-doc-upload", { body: { caseId: id, token: t, file: { name: "x.pdf", type: "application/pdf", data: Buffer.from("hello world, not a pdf").toString("base64") } } })).status, 415);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  assert.equal((await call("hs-doc-upload", { body: { caseId: id, token: t, file: { name: "x.pdf", type: "application/pdf", data: png.toString("base64") } } })).body.code, "type_mismatch");
  const up = await call("hs-doc-upload", { body: { caseId: id, token: t, kind: "policy", file: { name: "My Policy (2024).pdf", type: "application/pdf", data: pdf.toString("base64") } } });
  assert.equal(up.status, 200, JSON.stringify(up.body)); C.docA = up.body.docId;
  assert.match(C.docA, /^d_[0-9a-f]{24}$/);
  /* Chunked upload of a photo. */
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
  const a = await call("hs-doc-upload", { body: { caseId: id, token: t, file: { name: "roof.jpg", type: "image/jpeg", size: jpg.length, data: jpg.subarray(0, 1500).toString("base64"), chunk: { index: 0, total: 2 } } } });
  assert.equal(a.body.received, 1);
  const b = await call("hs-doc-upload", { body: { caseId: id, token: t, file: { name: "roof.jpg", type: "image/jpeg", size: jpg.length, data: jpg.subarray(1500).toString("base64"), chunk: { index: 1, total: 2, uploadId: a.body.uploadId } } } });
  assert.equal(b.status, 200); assert.equal(b.body.size, jpg.length); C.docJpg = b.body.docId;
  assert.ok(![...STORES["hs-docs"].m.keys()].some((k) => k.startsWith("part/")), "chunks cleaned up");

  /* Owner can fetch with the token. */
  const own = await call("hs-doc-get", { method: "GET", query: { d: C.docA, c: id, t } });
  assert.equal(own.status, 200); assert.ok(own.bytes.equals(pdf));
  assert.match(own.headers["Cache-Control"], /private, no-store/); assert.match(own.headers["Content-Disposition"], /^attachment/);
  assert.equal((await call("hs-doc-get", { method: "GET", query: { d: C.docA, c: id, t: "0".repeat(64) } })).status, 404);
  /* Talking-first and offered pros cannot; neither can a stranger or a signed-out caller. */
  assert.equal((await call("hs-doc-get", { method: "GET", cookie: Pro.pa.cookie, query: { d: C.docA, c: id } })).status, 403);
  assert.equal((await call("hs-doc-get", { method: "GET", cookie: Pro.tampa.cookie, query: { d: C.docA, c: id } })).status, 403);
  assert.equal((await call("hs-doc-get", { method: "GET", query: { d: C.docA, c: id } })).status, 401);
  /* A doc id from another case is refused even with a valid token. */
  assert.equal((await call("hs-doc-get", { method: "GET", query: { d: C.docA, c: C.b.body.caseId, t: C.b.body.token } })).status, 404);
  const feed = await call("hs-pro-feed", { method: "GET", cookie: Pro.ftl.cookie });
  const card = feed.body.cases.find((c) => c.id === id);
  assert.equal(card.hasDocs, true); assertNoPII(feed.raw, "feed with docs", [C.docA, C.docJpg]);
});

await test("policy review: flag extraction from a synthetic PDF text layer; honest when there is no text", async () => {
  const id = C.a.body.caseId, t = C.a.body.token;
  const r = await call("hs-policy-review", { body: { caseId: id, token: t, docId: C.docA } });
  assert.equal(r.status, 200); assert.equal(r.body.textFound, true);
  const keys = r.body.findings.map((f) => f.key);
  for (const k of ["hurricane_deductible", "aop_deductible", "roof_acv", "exclusions", "water_sublimit", "ordinance_law", "matching", "loss_of_use"]) assert.ok(keys.includes(k), `missing ${k}: ${keys}`);
  const by = (k) => r.body.findings.find((f) => f.key === k);
  assert.match(by("hurricane_deductible").label, /5%/); assert.equal(by("hurricane_deductible").tone, "weak");
  assert.match(by("aop_deductible").label, /\$2,500/);
  assert.match(by("water_sublimit").label, /\$10,000/);
  assert.match(by("ordinance_law").label, /25%/); assert.equal(by("ordinance_law").tone, "strong");
  assert.match(by("loss_of_use").label, /\$60,000/);
  assert.match(by("exclusions").label, /flood/); assert.match(by("exclusions").label, /wear and tear/);
  assert.equal(by("matching").tone, "weak");
  assert.ok(r.body.plainSummary.includes("not legal advice"));
  assertNoPII(r.body.flags, "flags");
  const es = await call("hs-policy-review", { body: { caseId: id, token: t, docId: C.docA, lang: "es" } });
  assert.match(es.body.findings.find((f) => f.key === "hurricane_deductible").label, /Deducible de huracán: 5%/);
  /* The flags reach the pro's anonymized card, still clean. */
  const feed = await call("hs-pro-feed", { method: "GET", cookie: Pro.ftl.cookie });
  const card = feed.body.cases.find((c) => c.id === id);
  assert.ok(card.policyFlags.some((f) => /Hurricane deductible: 5%/.test(f)));
  assert.ok(card.policyFlags.some((f) => /\[phone removed\]|\[removed\]/.test(f)), "the draft's phone flag was scrubbed");
  assertNoPII(feed.raw, "feed with flags");
  /* A PDF with no text layer (an image-only scan stand-in) and a photo. */
  const blank = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
  const up = await call("hs-doc-upload", { body: { caseId: id, token: t, file: { name: "scan.pdf", type: "application/pdf", data: blank.toString("base64") } } });
  const none = await call("hs-policy-review", { body: { caseId: id, token: t, docId: up.body.docId } });
  assert.equal(none.body.textFound, false); assert.match(none.body.plainSummary, /no readable text layer/);
  const photo = await call("hs-policy-review", { body: { caseId: id, token: t, docId: C.docJpg } });
  assert.equal(photo.body.textFound, false);
  assert.equal((await call("hs-policy-review", { body: { caseId: C.b.body.caseId, token: C.b.body.token, docId: C.docA } })).status, 404);
});

await test("share my contact -> reveal: only the connected pro gets contact and docs", async () => {
  const id = C.a.body.caseId, t = C.a.body.token;
  assert.equal((await call("hs-offer-respond", { body: { caseId: id, token: t, offerId: C.offerFtl, action: "share_contact" } })).body.code, "talk_first_needed");
  const r = await call("hs-offer-respond", { body: { caseId: id, token: t, offerId: C.offerPa, action: "share_contact" } });
  assert.equal(r.status, 200); assert.equal(r.body.case.status, "connected");
  assert.equal(r.body.pro.phone, "+17865550100"); assert.equal(r.body.pro.email, "ana.pa@correo.test");
  const feed = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie });
  const cc = feed.body.connected.find((c) => c.id === id);
  assert.ok(cc, "connected case present");
  assert.equal(cc.contact.name, PII.name); assert.equal(cc.contact.phone, "+13055550142"); assert.equal(cc.contact.email, PII.email);
  assert.equal(cc.address, PII.address); assert.equal(cc.claimNumber, PII.claimNumber); assert.equal(cc.policyNumber, PII.policyNumber);
  assert.ok(cc.docs.some((d) => d.id === C.docA && d.url.startsWith("/.netlify/functions/hs-doc-get?")));
  const one = await call("hs-pro-case", { method: "GET", cookie: Pro.pa.cookie, query: { c: id } });
  assert.equal(one.body.view, "connected"); assert.equal(one.body.case.contact.email, PII.email);
  const d = await call("hs-doc-get", { method: "GET", cookie: Pro.pa.cookie, query: { d: C.docA, c: id } });
  assert.equal(d.status, 200); assert.equal(d.bytes.slice(0, 5).toString(), "%PDF-");
  /* Everyone else: still nothing. */
  const other = await call("hs-pro-feed", { method: "GET", cookie: Pro.ftl.cookie });
  assert.equal(other.body.offers.find((o) => o.id === C.offerFtl).status, "declined");
  assert.ok(!other.body.cases.some((c) => c.id === id), "gone from the other pro's feed");
  assertNoPII(other.raw, "other pro's feed");
  for (const p of [Pro.ftl, Pro.zips, Pro.tampa]) {
    const x = await call("hs-pro-case", { method: "GET", cookie: p.cookie, query: { c: id } });
    assert.equal(x.status, 404); assertNoPII(x.raw, "other pro's case view");
    assert.equal((await call("hs-doc-get", { method: "GET", cookie: p.cookie, query: { d: C.docA, c: id } })).status, 403);
  }
  assertNoPII((await call("hs-pro-feed", { method: "GET", cookie: Pro.zips.cookie })).raw, "matching pro feed after connect");
  const st = await call("hs-case-status", { method: "GET", query: { c: id, t } });
  assert.equal(st.body.offers.find((o) => o.id === C.offerFtl).pro.phone, undefined, "the declined pro's contact is not shown either");
  const admin = await call("hs-admin-cases", { method: "GET", cookie: ADMIN });
  assert.equal(admin.status, 200); assertNoPII(admin.raw, "admin case list");
});

await test("decline: the offer closes, the case reopens, the pro is told", async () => {
  const id = C.b.body.caseId, t = C.b.body.token;
  const o = await call("hs-pro-offer", { cookie: Pro.pa.cookie, body: { caseId: id, message: "I handle underpaid claims every week." } });
  assert.equal((await call("hs-case-status", { method: "GET", query: { c: id, t } })).body.case.status, "offered");
  const r = await call("hs-offer-respond", { body: { caseId: id, token: t, offerId: o.body.offer.id, action: "decline" } });
  assert.equal(r.body.offer.status, "declined"); assert.equal(r.body.case.status, "open");
  assert.equal((await call("hs-offer-respond", { body: { caseId: id, token: t, offerId: o.body.offer.id, action: "accept" } })).body.code, "declined");
  const f = await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie, query: { since: new Date(Date.now() - 60000).toISOString() } });
  assert.equal(f.body.offers.find((x) => x.id === o.body.offer.id).status, "declined");
  assert.ok(f.body.notices.some((n) => n.type === "declined" && n.caseId === id));
  assert.equal((await call("hs-offer-respond", { body: { caseId: id, token: t, offerId: o.body.offer.id, action: "nope" } })).body.code, "bad_action");
});

await test("rate limit: public POSTs are counted per IP in hs-rate", async () => {
  const ip = "203.0.113.9";
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await call("hs-case-create", { ip, body: caseBody({ caseDraft: { zip: "32801", issue: "inspection", trades: ["inspector"] } }) })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429]);
  assert.equal((await call("hs-case-create", { ip: "203.0.113.10", body: caseBody({ caseDraft: { zip: "32801" } }) })).status, 200);
  assert.ok(![...STORES["hs-rate"].m.keys()].some((k) => k.includes(ip)), "IPs are stored hashed");
  const s = [];
  for (let i = 0; i < 6; i++) s.push((await call("hs-pro-signup", { ip: "198.51.100.7", body: { email: `x${i}@correo.test` } })).status);
  assert.equal(s[5], 429);
  const l = [];
  for (let i = 0; i < 11; i++) l.push((await call("hs-pro-login", { body: { email: "ana.pa@correo.test", password: "guess " + i } })).status);
  assert.equal(l[10], 429, "per-email login limit across IPs");
});

await test("delete: the case, its docs, offers, threads and events are gone", async () => {
  const id = C.a.body.caseId, t = C.a.body.token;
  assert.equal((await call("hs-case-delete", { body: { caseId: id, token: "0".repeat(64) } })).status, 404);
  const r = await call("hs-case-delete", { body: { caseId: id, token: t } });
  assert.equal(r.status, 200); assert.equal(r.body.deleted, true); assert.equal(r.body.docs, 3);
  const all = Object.entries(STORES).flatMap(([n, s]) => [...s.m.entries()].map(([k, v]) => `${n}/${k} ${typeof v === "string" ? v : ""}`)).join("\n");
  assert.ok(!all.includes(id), "no key or value mentions the case: " + all.split("\n").filter((l) => l.includes(id)).join(" ; "));
  assert.ok(!all.includes(C.docA) && !all.includes(C.docJpg));
  assert.ok(!all.includes("Maribel") || !all.includes(id));
  assert.equal((await call("hs-case-status", { method: "GET", query: { c: id, t } })).status, 404);
  assert.equal((await call("hs-doc-get", { method: "GET", query: { d: C.docA, c: id, t } })).status, 404);
  assert.ok(!(await call("hs-pro-feed", { method: "GET", cookie: Pro.pa.cookie })).body.connected.some((c) => c.id === id));
});

await test("methods and ids: wrong method 405, malformed ids 404, OPTIONS 204", async () => {
  assert.equal((await call("hs-case-create", { method: "GET" })).status, 405);
  assert.equal((await call("hs-pro-feed", { method: "POST", body: {} })).status, 405);
  assert.equal((await call("hs-case-status", { method: "GET", query: { c: "../etc", t: "x" } })).status, 404);
  assert.equal((await call("hs-pro-case", { method: "GET", cookie: Pro.pa.cookie, query: { c: "c_../../x" } })).status, 404);
  assert.equal((await call("hs-pro-feed", { method: "OPTIONS" })).status, 204);
});

/* ---------------------------------------------------------------- P0 c.6666325601
   Every rate-limited POST returned 500 in production: the stores were opened
   with consistency "strong", which routes EVERY call (writes too) to the
   context's uncachedEdgeURL -- and Lambda-compat functions never get one. */
await test("P0 c.6666325601: a rate-limit write that throws never 500s (login 401, signup 400, case-create 400)", async () => {
  const boom = () => { const e = new Error("Netlify Blobs has failed to perform a read using strong consistency"); e.name = "BlobsConsistencyError"; throw e; };
  const broken = {};
  store.__setStoreFactory((name) => (broken[name] ||= (name === "hs-rate" ? { ...memStore(), setJSON: async () => boom() } : memStore())));
  const quiet = console.error; const logged = []; console.error = (...a) => logged.push(a.join(" "));
  try {
    const login = await call("hs-pro-login", { body: { email: "nobody@correo.test", password: "wrong-password" } });
    assert.equal(login.status, 401); assert.equal(login.body.code, "bad_credentials");
    const signup = await call("hs-pro-signup", { body: {} });
    assert.equal(signup.status, 400, JSON.stringify(signup.body));
    const cc = await call("hs-case-create", { body: {} });
    assert.equal(cc.status, 400, JSON.stringify(cc.body));
    assert.ok(logged.some((l) => /rate write failed \(allowed\): BlobsConsistencyError/.test(l)), logged.join(" | "));
  } finally { console.error = quiet; store.__setStoreFactory((name) => (STORES[name] ||= memStore())); }
});

await test("P0 c.6666325601: every hs endpoint is a Functions v2 handler (default export, no Lambda `handler`)", async () => {
  const LAMBDA = new Set(["hs-stripe-webhook.js", "hs-stt.js", "hs-tts.js"]); // no strong store / raw-body signature
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../netlify/functions");
  const files = readdirSync(dir).filter((f) => /^hs-.*\.js$/.test(f) && !LAMBDA.has(f));
  assert.ok(files.length >= 22, files.length + " files");
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.ok(/^export default /m.test(src), f + ": no default export");
    assert.ok(!/^export (const|async function|function) handler\b/m.test(src), f + ": a named `handler` export makes Netlify deploy it as Lambda-compat");
  }
  for (const f of LAMBDA) assert.ok(!/openStores\(/.test(readFileSync(join(dir, f), "utf8")) || f === "hs-stripe-webhook.js", f);
});

await test("P0 c.6666325601: the v2 Request path answers like the Lambda path (401 / 400 / 204, cookies kept)", async () => {
  const h = fns["hs-pro-login"];
  const r = await h(new Request("https://ariashop.pe/.netlify/functions/hs-pro-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nobody@correo.test", password: "x-wrong" }) }), { ip: "10.77.0.1" });
  assert.ok(r instanceof Response);
  assert.equal(r.status, 401); assert.equal((await r.json()).code, "bad_credentials");
  const me = await fns["hs-pro-me"](new Request("https://ariashop.pe/.netlify/functions/hs-pro-me"), { ip: "10.77.0.2" });
  assert.equal(me.status, 401);
  const opt = await fns["hs-pro-me"](new Request("https://ariashop.pe/.netlify/functions/hs-pro-me", { method: "OPTIONS" }), {});
  assert.equal(opt.status, 204); assert.equal(await opt.text(), "");
  const cc = await fns["hs-case-create"](new Request("https://ariashop.pe/.netlify/functions/hs-case-create", { method: "POST", body: "{}" }), { ip: "10.77.0.3" });
  assert.equal(cc.status, 400);
  const st = await fns["hs-case-status"](new Request("https://ariashop.pe/.netlify/functions/hs-case-status?c=c_000000000000000000000000&t=" + "0".repeat(64)), { ip: "10.77.0.4" });
  assert.equal(st.status, 404);
  // A real signed-in pro over the v2 path: login sets the cookie, hs-pro-me reads it back.
  const email = "v2.signup@correo.test";
  const su = await fns["hs-pro-signup"](new Request("https://ariashop.pe/.netlify/functions/hs-pro-signup", { method: "POST", body: JSON.stringify({ ...PRO_BASE, email, name: "Pro V2", company: "Shield Co", trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W765432", serviceArea: { centerZip: "33130", radiusMiles: 25 } }) }), { ip: "10.77.0.7" });
  assert.equal(su.status, 200, await su.clone().text());
  const login = await h(new Request("https://ariashop.pe/.netlify/functions/hs-pro-login", { method: "POST", body: JSON.stringify({ email, password: PRO_BASE.password }) }), { ip: "10.77.0.5" });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^hs_pro=/);
  const me2 = await fns["hs-pro-me"](new Request("https://ariashop.pe/.netlify/functions/hs-pro-me", { headers: { cookie } }), { ip: "10.77.0.6" });
  assert.equal(me2.status, 200);
});

await test("P0 c.6666325601: real Blobs client: strong only with uncachedEdgeURL, eventual otherwise; the old pairing throws", async () => {
  const { createServer } = await import("node:http");
  const hits = [];
  const mk = (tag) => new Promise((res) => { const srv = createServer((q, a) => { hits.push(tag + " " + q.method); q.resume(); q.on("end", () => { a.writeHead(200, { etag: '"1"' }); a.end(); }); }); srv.listen(0, "127.0.0.1", () => res(srv)); });
  const edge = await mk("edge"), uncached = await mk("uncached");
  const url = (s) => `http://127.0.0.1:${s.address().port}`;
  const prevEnv = process.env.NETLIFY_BLOBS_CONTEXT;
  const setCtx = (o) => { process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(o)).toString("base64"); };
  const quiet = console.warn; console.warn = () => {};
  store.__setStoreFactory(null);
  try {
    const { getStore } = await import("@netlify/blobs");
    setCtx({ edgeURL: url(edge), siteID: "site", token: "t" });
    await assert.rejects(() => getStore({ name: "hs-rate", consistency: "strong" }).setJSON("k", { n: 1 }), (e) => e.name === "BlobsConsistencyError");
    await store.openStores({ headers: {} }).rate.setJSON("k", { n: 1 });
    setCtx({ edgeURL: url(edge), uncachedEdgeURL: url(uncached), siteID: "site", token: "t" });
    await store.openStores({ headers: {} }).rate.setJSON("k", { n: 2 });
    assert.deepEqual(hits, ["edge PUT", "uncached PUT"]);
  } finally {
    console.warn = quiet;
    if (prevEnv === undefined) delete process.env.NETLIFY_BLOBS_CONTEXT; else process.env.NETLIFY_BLOBS_CONTEXT = prevEnv;
    store.__setStoreFactory((name) => (STORES[name] ||= memStore()));
    edge.close(); uncached.close();
  }
});

/* ================================================================
   FRONT SECTION (homeowner page + hs-chat) -- added by the front builder.
   ================================================================ */
/* ##################################################################
   FRONT-END SECTION: the homeowner page, Aria's conversation (text and
   voice), the case card with consent, caso.html. Owned by the
   home-shield-front builder.
   ################################################################## */
console.log("\n  Home Shield: front end (homeowner page, Aria, caso)");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const check = test;

const FE = {
  prompt: await import("../../netlify/functions/_hs-prompt.js"),
  chat: await import("../../netlify/functions/hs-chat.js"),
  tts: await import("../../netlify/functions/hs-tts.js"),
  stt: await import("../../netlify/functions/hs-stt.js"),
  model: await import("../../netlify/functions/_aria-chat-model.js"),
  voiceLib: await import("../../scripts/lib/realtime-voice.js"),
  assets: await import("../build-home-shield-assets.mjs"),
};
const PAGE = readFileSync(join(ROOT, "home-shield/index.html"), "utf8");
const CASO = readFileSync(join(ROOT, "home-shield/caso.html"), "utf8");
const JS = readFileSync(join(ROOT, "home-shield/hs.js"), "utf8");
const I18N_JS = readFileSync(join(ROOT, "home-shield/hs-i18n.js"), "utf8");
const CSS = readFileSync(join(ROOT, "home-shield/hs.css"), "utf8");
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/* hs.js's i18n object, evaluated without a DOM. */
function loadI18n() {
  const a = I18N_JS.indexOf("var I18N = "), b = I18N_JS.indexOf("window.HS_I18N");
  return new Function(I18N_JS.slice(a, b) + "; return I18N;")();
}
const I18N = loadI18n();

const withEnv = async (vars, fn) => {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
};
const jsonRes = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj), headers: new Map([["content-type", "application/json"]]) });

await check("prompt: Aria is the expert, the pro comes THROUGH her; accuracy rules bind her claims", () => {
  const p = FE.prompt.buildHsSystemPrompt({ lang: "en" });
  for (const r of FE.prompt.ACCURACY_RULES) assert.ok(p.includes(r), "missing rule: " + r);
  for (const m of FE.prompt.MOVES) assert.ok(p.includes(m), "missing move: " + m);
  assert.match(p, /the professional comes THROUGH you, never instead of you/);
  assert.match(p, /they know everything and you know nothing, and that is how people get taken/);
  assert.match(p, /let me look at it — give me what you have/);
  assert.match(p, /if you let me see your actual policy, I can tell you exactly where YOU stand/);
  assert.match(p, /Every reply moves the intake ONE step forward: situation, then the ZIP code, then the policy, then contact/);
  assert.match(p, /Never promise an outcome/); assert.match(p, /Never encourage inflating a claim/); assert.match(p, /Never tell the homeowner to sign anything/);
  assert.match(p, /ONE question at a time/); assert.match(p, /EMERGENCY FIRST/); assert.match(p, /shut off the water/);
  assert.match(p, /Reply in the language the homeowner writes in/); assert.match(p, /NO names, phone numbers/);
});
await check("prompt: the policy upload is invited early; it stops asking once the policy is in", () => {
  const p = FE.prompt.buildHsSystemPrompt({ lang: "en" });
  assert.match(p, /GET THE POLICY: the upload is your standing invitation\. Offer it early and naturally \(by your first or second reply\)/);
  assert.match(p, /They have not uploaded their policy yet: invite it in this reply or the next/);
  assert.ok(!/They have not uploaded/.test(FE.prompt.buildHsSystemPrompt({ policy: { strong: ["x"], excerpt: "SECTION I" } })));
});
await check("prompt: deflection is banned; no spoken disclaimer; nothing in it says 'go elsewhere'", () => {
  const p = FE.prompt.buildHsSystemPrompt({ lang: "en", policy: { strong: ["x"], excerpt: "y" } });
  const ban = p.split("\n").filter((l) => !l.startsWith("NEVER YOUR MAIN MOVE")).join("\n");
  for (const b of FE.prompt.BANNED_PHRASES) assert.ok(!ban.toLowerCase().includes(b.toLowerCase()), "deflection outside the ban list: " + b);
  assert.ok(!/should (confirm|decide|review)|consult (a|an) |not legal advice|not a licensed/i.test(ban), "deflection or disclaimer in the prompt");
  for (const b of ["you should speak with a professional", "a licensed professional should confirm"]) assert.ok(FE.prompt.BANNED_PHRASES.includes(b));
  // The greeting and intro carry no disclaimer.
  for (const k of ["intro.line1", "intro.line2"]) for (const L of ["en", "es"]) assert.ok(!/not legal advice|not a licensed|no es abogada|asesor[ií]a legal|professional should|profesional .* debe/i.test(I18N[L][k]), k + " " + L);
  assert.ok(!/not a licensed|should confirm/i.test(I18N.en["faq.a2"]));
});
await check("prompt: Spanish page asks for Spanish; voice turns stay short", () => {
  assert.match(FE.prompt.buildHsSystemPrompt({ lang: "es" }), /Spanish/);
  assert.match(FE.prompt.buildHsSystemPrompt({ lang: "en", voice: true }), /SPOKEN aloud/);
});
await check("prompt: the uploaded policy's review reaches Aria", () => {
  const p = FE.prompt.buildHsSystemPrompt({ policy: { strong: ["Replacement cost on the roof"], weak: ["2% hurricane deductible"], excerpt: "SECTION I" } });
  assert.match(p, /Replacement cost on the roof/);
  assert.match(p, /2% hurricane deductible/);
  assert.match(p, /SECTION I/);
});
await check("scrub: phone, email, street, policy number, name and insurer never reach the summary", () => {
  const s = FE.prompt.scrubPII("Call (305) 555-1212 or ana@correo.test, 123 Palm Beach Blvd, policy number HO3-998877, my name is Ana Lopez, Citizens denied it.", { insurer: "Citizens" });
  assert.ok(!/555|correo|Palm Beach|998877|Ana|Citizens/.test(s), s);
  assert.ok(!FE.prompt.looksLikePII(s));
});
await check("caseDraft: validated to the contract; unknown values dropped, earlier values kept", () => {
  const prev = FE.prompt.validateCaseDraft({ issue: "roof", zip: "33101", trades: ["roofer"], urgency: "soon", summary: "Roof damage after a storm." });
  const d = FE.prompt.validateCaseDraft({ issue: "nonsense", trades: ["roofer", "plumber"], zip: "331", state: "fl", claimStatus: "denied" }, prev);
  assert.equal(d.issue, "roof"); assert.deepEqual(d.trades, ["roofer"]); assert.equal(d.zip, "33101"); assert.equal(d.state, "FL"); assert.equal(d.claimStatus, "denied");
  assert.deepEqual(Object.keys(d).sort(), ["claimStatus", "insurer", "issue", "state", "summary", "trades", "urgency", "zip"]);
});
await check("parse: bare JSON, fenced JSON and plain prose", () => {
  const a = FE.prompt.parseModelReply('{"reply":"Hi","caseDraft":{"issue":"leak_water"}}', null);
  assert.equal(a.reply, "Hi"); assert.equal(a.caseDraft.issue, "leak_water");
  const b = FE.prompt.parseModelReply('```json\n{"reply":"Hola","caseDraft":{"zip":"33133"}}\n```', null);
  assert.equal(b.reply, "Hola"); assert.equal(b.caseDraft.zip, "33133");
  const c = FE.prompt.parseModelReply("Just text.", { issue: "roof" });
  assert.equal(c.reply, "Just text."); assert.equal(c.caseDraft.issue, "roof");
});

await check("policy review: «How it compares» is built from the policy's own terms, hedged, no prices or carriers", () => {
  const a = JS.indexOf("/*COMPARE:START*/"), b = JS.indexOf("/*COMPARE:END*/");
  const cmp = new Function(JS.slice(a, b) + "; return compareFindings;")();
  const F = [{ key: "hurricane_deductible", tone: "weak", label: "Hurricane deductible: 5% of dwelling" }, { key: "roof_acv", tone: "weak", label: "Roof paid at actual cash value" },
    { key: "water_sublimit", tone: "weak", label: "Water damage limited to $10,000" }, { key: "ordinance_law", tone: "note", label: "Ordinance or law: 10%" }];
  const en = cmp(F, "en"), es = cmp(F, "es");
  assert.match(en.join(" "), /many Florida policies carry 2%.*Yours is 5%, higher than the common 2%/);
  assert.match(en.join(" "), /actual cash value/); assert.match(en.join(" "), /\$10,000/); assert.match(en.join(" "), /included at 10%. Common options are 25% or 50%/);
  assert.match(en.join(" "), /Loss of use: I did not find it/);
  assert.match(en.at(-1), /A licensed local agent on Aria Home Shield can quote comparable coverage/);
  assert.match(es.join(" "), /El tuyo es 5%/); assert.match(es.at(-1), /agente local con licencia/);
  assert.ok(!/premium of|\$\d+ ?(a|per) (year|month)|Citizens|State Farm|Universal|Heritage/i.test(en.join(" ")), "invented price or carrier");
  assert.equal(I18N.en["policy.compare"], "How it compares"); assert.equal(I18N.es["policy.compare"], "Cómo se compara");
});
const sseBody = (chunks) => new ReadableStream({ start(c) { const e = new TextEncoder(); for (const x of chunks) c.enqueue(e.encode(x)); c.close(); } });
const openaiSSE = (text, cut = 7) => { const out = []; for (let i = 0; i < text.length; i += cut) out.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + cut) } }] })}\n\n`); out.push("data: [DONE]\n\n"); return out; };
const readEvents = async (res) => (await res.text()).split("\n\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5)));
const chatReq = (body) => new Request("http://x/.netlify/functions/hs-chat", { method: "POST", headers: { "content-type": "application/json", "x-nf-client-connection-ip": "10.9.9." + Math.floor(Math.random() * 250) }, body: JSON.stringify(body) });

await check("hs-chat: streams the reply (same key and model id as the shop); the case draft arrives last, scrubbed, never in the text", async () => {
  let sent = null;
  const model = "I'm sorry that happened. I'm in your corner. What is the ZIP code of the home?\n<<<CASE>>>\n" + JSON.stringify({ issue: "denied_claim", trades: ["public_adjuster", "attorney"], zip: "33101", urgency: "soon", summary: "Wind claim denied last month; call me at 305-555-1212.", insurer: "Acme Mutual", claimStatus: "denied" });
  const fetchImpl = async (url, init) => { sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization }; return { ok: true, status: 200, body: sseBody(openaiSSE(model)) }; };
  const res = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.chat.default(chatReq({ lang: "en", messages: [{ role: "user", content: "My claim was denied" }] }), { fetchImpl }));
  assert.equal(res.status, 200); assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const ev = await readEvents(res);
  assert.equal(sent.url, FE.model.OPENAI_CHAT_URL); assert.equal(sent.body.model, FE.model.OPENAI_MODEL); assert.equal(sent.body.stream, true); assert.equal(sent.auth, "Bearer sk-test");
  const deltas = ev.filter((e) => e.t);
  assert.ok(deltas.length > 3, "streamed in pieces");
  const text = deltas.map((e) => e.t).join("");
  assert.equal(text.trim(), "I'm sorry that happened. I'm in your corner. What is the ZIP code of the home?");
  assert.ok(!/CASE|\{|issue/.test(text), "case draft leaked into the reply stream");
  const done = ev.at(-1);
  assert.equal(done.done, true); assert.equal(done.caseDraft.issue, "denied_claim"); assert.equal(done.ready, true);
  assert.ok(!/555/.test(done.caseDraft.summary), done.caseDraft.summary);
});
await check("hs-chat: 503 without a key; 400 on a bad turn; upstream error before the stream is JSON", async () => {
  const n = await withEnv({ OPENAI_API_KEY: undefined }, () => FE.chat.default(chatReq({ messages: [{ role: "user", content: "hi" }] }), {}));
  assert.equal(n.status, 503);
  const bad = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.chat.default(chatReq({ messages: [{ role: "assistant", content: "hi" }] }), {}));
  assert.equal(bad.status, 400);
  const up = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.chat.default(chatReq({ messages: [{ role: "user", content: "hi" }] }), { fetchImpl: async () => jsonRes(500, { error: { message: "boom" } }) }));
  assert.equal(up.status, 502); assert.match((await up.json()).error, /boom/);
});

await check("hs-tts: ONE voice (id, model, stability 0.5, similarity 0.75), key server-side", async () => {
  let sent = null;
  const fetchImpl = async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }; };
  const r = await withEnv({ ELEVENLABS_API_KEY: "xi-test" }, () => FE.tts.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ text: "Hey, I'm Aria." }) }, { fetchImpl }));
  assert.equal(r.statusCode, 200); assert.equal(r.isBase64Encoded, true); assert.equal(r.headers["Content-Type"], "audio/mpeg");
  assert.ok(sent.url.includes("/text-to-speech/9BWtsMINqrJLrRacOk9x"), sent.url);
  assert.equal(sent.body.model_id, "eleven_v3");
  assert.deepEqual(sent.body.voice_settings, { stability: 0.5, similarity_boost: 0.75 });
  assert.equal(sent.init.headers["xi-api-key"], "xi-test");
});
await check("hs-tts: missing key -> clear 503 \"voice not configured\"", async () => {
  const r = await withEnv({ ELEVENLABS_API_KEY: undefined }, () => FE.tts.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ text: "Hi" }) }, {}));
  assert.equal(r.statusCode, 503);
  const j = JSON.parse(r.body);
  assert.equal(j.error, "voice not configured"); assert.equal(j.code, "voice_not_configured");
});
await check("one voice law: forbidden voice ids appear nowhere in Home Shield; no device TTS anywhere", () => {
  const files = ["home-shield/index.html", "home-shield/caso.html", "home-shield/hs.js", "home-shield/hs-i18n.js", "home-shield/hs.css",
    ...readdirSync(join(ROOT, "netlify/functions")).filter((f) => /^(hs-|_hs-)/.test(f)).map((f) => "netlify/functions/" + f)];
  for (const f of files) {
    const s = readFileSync(join(ROOT, f), "utf8");
    assert.ok(!/LkszHYojkmyv6pbg0ZdY|DLsHlh26Ugcm6ELvS0qi/.test(s), "forbidden voice id in " + f);
    assert.ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(s), "device TTS in " + f);
  }
  assert.ok(!/eleven|9BWtsMINqrJLrRacOk9x/i.test(PAGE + JS + I18N_JS), "the page must not name the backend voice");
});
await check("hs-stt: transcribes with the repo's key and its existing transcription model", async () => {
  let form = null;
  const fetchImpl = async (url, init) => { form = init.body; return jsonRes(200, { text: " My roof is leaking. " }); };
  const audio = Buffer.alloc(4000, 1).toString("base64");
  const r = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.stt.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ audio, mime: "audio/webm;codecs=opus", lang: "en" }) }, { fetchImpl }));
  assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).text, "My roof is leaking.");
  assert.equal(form.get("model"), FE.voiceLib.TRANSCRIPTION_MODEL);
  assert.equal(form.get("language"), "en");
  const n = await withEnv({ OPENAI_API_KEY: undefined }, () => FE.stt.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ audio, mime: "audio/webm" }) }, {}));
  assert.equal(n.statusCode, 503);
});

await check("i18n: English and Spanish carry the same keys; every data-i18n exists", () => {
  const en = Object.keys(I18N.en).sort(), es = Object.keys(I18N.es).sort();
  assert.deepEqual(en.filter((k) => !I18N.es[k]), []); assert.deepEqual(es.filter((k) => !I18N.en[k]), []);
  for (const html of [PAGE, CASO]) for (const m of html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)) assert.ok(I18N.en[m[1]], "missing key " + m[1]);
});
await check("i18n: the HTML ships the English copy (works before hs.js runs)", () => {
  const dec = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  for (const m of PAGE.matchAll(/data-i18n="([^"]+)"( data-i18n-lang="(es|en)")?[^>]*>([^<]*)</g)) assert.equal(dec(m[4]).trim(), I18N[m[3] || "en"][m[1]], m[1]);
});
await check("copy: the exact intro, the disclaimer, no emojis", () => {
  assert.equal(I18N.en["intro.line1"], "Hey, I'm Aria. I'm in your corner and I'm always in your corner. I'm your lawyer, your public adjuster, your roofer, all into one.");
  assert.match(I18N.en["intro.line2"], /^Upload your policy — I can dissect it: strong points, weak points, a better option if one exists, and my best recommendation\.$/);
  assert.equal(I18N.en["footer.disclaimer"], "Aria provides general information, not legal advice. Aria is not a licensed attorney, public adjuster, insurance agent or contractor; she connects you with licensed professionals.");
  assert.match(I18N.en["case.consent"], /^I agree to be contacted only by professionals I approve\. Aria Home Shield never sells my information\.$/);
  for (const [n, s] of [["index.html", PAGE], ["caso.html", CASO], ["hs.js", JS], ["hs-i18n.js", I18N_JS], ["hs.css", CSS]]) assert.ok(!EMOJI.test(s), "emoji in " + n);
});
await check("launch angle: the hero leads with the language promise; the language-barrier section exists in both languages", () => {
  assert.match(I18N.en["hero.title"], /^Your policy, your claim, your denial letter — explained in your language\.$/);
  assert.match(I18N.es["hero.title"], /^Tu póliza, tu reclamo, tu carta de negación — explicados en tu idioma\.$/);
  assert.match(I18N.en["hero.promise"], /Every line, until you understand what you actually have/);
  assert.match(I18N.es["hero.promise"], /Cada línea, hasta que entiendas lo que de verdad tienes/);
  const h = PAGE.indexOf('<section class="hs-hero"'), b = PAGE.indexOf('id="barrier"'), d = PAGE.indexOf('id="doors"');
  assert.ok(h < b && b < d, "the barrier section comes right after the hero, before the doors");
  const sec = PAGE.slice(b, d);
  assert.ok(/data-say-lang="es"[\s\S]*data-say-lang="en"/.test(sec), "ES primary, EN mirror");
  assert.match(sec, /data-listen="#barrier"/);
  for (const L of ["en", "es"]) for (const k of ["barrier.title", "barrier.p1", "barrier.p2", "barrier.p3"]) assert.ok(I18N[L][k], k + " " + L);
  assert.match(I18N.en["barrier.p1"], /second language, with a 60-page policy full of traps, is harder/);
  assert.match(I18N.es["barrier.p3"], /en tu idioma, línea por línea, hasta que la entiendas/);
});
await check("Mountain Test (static): no shop bundle, no catalogue, deferred script, small files", () => {
  for (const s of [PAGE, CASO]) {
    assert.ok(!/\/build\/app-|catalog|tailwind/i.test(s), "shop bundle or catalogue referenced");
    assert.match(s, /<script defer src="\/home-shield\/hs\.js"><\/script>/);
  }
  assert.ok(!/\/build\/|catalog\.json|-catalog/.test(JS));
  assert.ok(Buffer.byteLength(JS) < 110 * 1024, "hs.js " + Buffer.byteLength(JS));
  assert.ok(gzipSync(JS).length < 32 * 1024, "hs.js gz " + gzipSync(JS).length);
  for (const f of readdirSync(join(ROOT, "home-shield/img"))) assert.ok(readFileSync(join(ROOT, "home-shield/img", f)).length < 20 * 1024, f);
});
await check("slots: photos and the badge render only when the file exists (manifest is current)", () => {
  const m = FE.assets.buildManifest(ROOT);
  const stamped = FE.assets.stamp(PAGE, m);
  assert.equal(stamped, PAGE, "run node scripts/build-home-shield-assets.mjs");
  for (const [slot, p] of Object.entries(m.photos)) assert.ok(existsSync(join(ROOT, p.src.slice(1))), slot);
  if (m.badge) assert.ok(existsSync(join(ROOT, m.badge.slice(1))));
  else assert.ok(!existsSync(join(ROOT, "assets/aria-star/shield-badge.webp")) && !existsSync(join(ROOT, "assets/aria-star/shield-badge.png")));
  for (const slot of Object.keys(FE.assets.SLOTS)) assert.ok(PAGE.includes(`data-photo="${slot}"`), "slot " + slot + " missing in the page");
});

/* ------------------------------------------------------------------
   BROWSER: the page at 390 and 1366, served with the real backend
   handlers on an in-memory store and stubbed model / voice / mic.
   ------------------------------------------------------------------ */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available", () => assert.ok(pw, "playwright is not installed"));

function feMemStore() {
  const m = new Map();
  return {
    _m: m,
    async get(k, o = {}) { if (!m.has(k)) return null; const v = m.get(k); if (o.type === "json") return JSON.parse(typeof v === "string" ? v : Buffer.from(v).toString()); if (o.type === "arrayBuffer") { const b = Buffer.isBuffer(v) ? v : Buffer.from(typeof v === "string" ? v : new Uint8Array(v)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } return typeof v === "string" ? v : Buffer.from(v).toString(); },
    async set(k, v) { m.set(k, typeof v === "string" ? v : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v)); },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list(o = {}) { return { blobs: [...m.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).map((key) => ({ key })) }; },
  };
}
function wav(seconds, toneFrom = -1, toneTo = -1, rate = 16000) {
  const n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate; const v = t >= toneFrom && t < toneTo ? Math.round(9000 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t))) : 0; buf.writeInt16LE(v, 44 + i * 2); }
  return buf;
}

if (pw) {
  const store = await import("../../netlify/functions/_hs-store.js");
  const stores = new Map();
  store.__setStoreFactory((name) => { if (!stores.has(name)) stores.set(name, feMemStore()); return stores.get(name); });
  store.__setMailer(async () => ({ ok: true }));
  const real = {};
  for (const f of ["hs-case-create", "hs-case-status", "hs-offer-respond", "hs-case-messages", "hs-case-delete", "hs-doc-upload", "hs-policy-review"]) {
    if (existsSync(join(ROOT, "netlify/functions", f + ".js"))) real[f] = fnOf(await import(`../../netlify/functions/${f}.js`));
  }
  /* Per-test stubs for the model, the voice and the ears. */
  const log = [];
  let stub = {};
  const SPEECH = wav(0.35);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ttsDelay = 0;
  const { createServer } = await import("node:http");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const fn = /^\/\.netlify\/functions\/([a-z0-9-]+)/.exec(u.pathname);
    if (fn) {
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      log.push({ fn: fn[1], method: req.method, body, query: Object.fromEntries(u.searchParams) });
      if (stub[fn[1]]) {
        const r = await stub[fn[1]](body, u);
        if (r && r.delay) await sleep(r.delay);
        if (fn[1] === "hs-chat" && r && r.json && r.json.reply && !r.status) {
          /* Stream it the way hs-chat does: word deltas, then the done event. */
          res.writeHead(200, { "Content-Type": "text/event-stream" });
          await sleep(r.firstToken || 0);
          for (const w of r.json.reply.match(/\S+\s*/g)) { res.write(`data: ${JSON.stringify({ t: w })}\n\n`); await sleep(r.gap ?? 15); }
          res.write(`data: ${JSON.stringify({ done: true, ...r.json })}\n\n`);
          return res.end();
        }
        if (r && r.audio) { res.writeHead(200, { "Content-Type": "audio/wav" }); return res.end(r.audio); }
        res.writeHead(r.status || 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r.json || {}));
      }
      if (fn[1] === "hs-tts") { await sleep(ttsDelay); res.writeHead(200, { "Content-Type": "audio/wav" }); return res.end(SPEECH); }
      const h = real[fn[1]];
      if (!h) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end('{"error":"no such function"}'); }
      const r = await h({ httpMethod: req.method, headers: { "x-nf-client-connection-ip": "127.0.0.1", "content-type": "application/json" }, body: raw, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
      res.writeHead(r.statusCode, r.headers || {}); return res.end(r.isBase64Encoded ? Buffer.from(r.body, "base64") : r.body || "");
    }
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
    const type = MIME[extname(f)] || "application/octet-stream";
    let data = readFileSync(f);
    const hdr = { "Content-Type": type };
    if (/text|javascript|json|svg/.test(type)) { data = gzipSync(data); hdr["Content-Encoding"] = "gzip"; }
    res.writeHead(200, hdr); res.end(data);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const tmp = mkdtempSync(join(tmpdir(), "hs-mic-"));
  const micFile = join(tmp, "mic.wav");
  writeFileSync(micFile, wav(8, 0.6, 2.0));
  const browser = await pw.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${micFile}%noloop`] });
  const SHOT = process.env.SHOT_DIR || null;
  const shot = async (page, name, el) => { if (!SHOT) return; if (el) await page.locator(el).first().screenshot({ path: join(SHOT, `hs-${name}.png`) }); else await page.screenshot({ path: join(SHOT, `hs-${name}.png`) }); };
  const ctx = async (w, extra = {}) => {
    const c = await browser.newContext(w === 390 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ["microphone"], ...extra } : { viewport: { width: 1366, height: 900 }, permissions: ["microphone"], ...extra });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    return c;
  };
  const errorsOf = (page) => { const e = []; page.on("pageerror", (x) => e.push(String(x))); return e; };
  const ttsTexts = () => log.filter((x) => x.fn === "hs-tts").map((x) => x.body && x.body.text);
  const reset = () => { log.length = 0; stub = {}; };

  for (const W of [390, 1366]) {
    await check(`browser ${W}: renders the hero, the doors in order, the rights, the disclaimer; no emojis, no errors`, async () => {
      reset();
      const c = await ctx(W); const page = await c.newPage(); const errs = errorsOf(page);
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      assert.equal(await page.locator("h1").innerText(), I18N.en["hero.title"]);
      assert.ok(await page.getByRole("button", { name: "Talk to Aria — free" }).first().isVisible());
      assert.ok(await page.getByRole("button", { name: "Upload my policy for a free review" }).isVisible());
      const doors = await page.locator(".hs-door .hs-h3").allInnerTexts();
      assert.deepEqual(doors.map((s) => s.replace(/^\d\s*/, "").trim()), ["Review my policy", "Claim denied", "Home damage", "Pro enrollment"]);
      assert.equal(await page.locator("#doorPro a").getAttribute("href"), "/home-shield/pro?signup=1");
      const txt = await page.locator("body").innerText();
      assert.ok(!EMOJI.test(txt), "emoji rendered");
      assert.match(txt, /mediation program/); assert.match(txt, /not legal advice/);
      assert.equal(await page.locator("[data-photo]:not([hidden])").count(), 0, "no photo slot without a photo");
      assert.equal(await page.locator("[data-badge]:not([hidden])").count(), 0, "no badge without the art");
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollW <= W, "horizontal scroll " + scrollW);
      if (W === 390) {
        await shot(page, "hero");
        await page.locator("#doors").scrollIntoViewIfNeeded(); await shot(page, "doors", "#doors");
        await shot(page, "how", "#how");
      }
      assert.deepEqual(errs, []);
      await c.close();
    });

    await check(`browser ${W}: Español toggle flips everything and is remembered; ?lang= wins`, async () => {
      reset();
      const c = await ctx(W); const page = await c.newPage();
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      await page.click("#hsLang");
      assert.equal(await page.locator("h1").innerText(), I18N.es["hero.title"]);
      assert.equal(await page.locator("html").getAttribute("lang"), "es");
      assert.equal(await page.locator("#hsLang").innerText(), "English");
      assert.match(await page.locator(".hs-disclaimer").innerText(), /no asesoría legal/);
      assert.ok(page.url().includes("lang=es"));
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      assert.equal(await page.locator("h1").innerText(), I18N.es["hero.title"], "choice remembered");
      if (W === 390) await shot(page, "hero-es");
      await page.goto(BASE + "/home-shield/?lang=en", { waitUntil: "load" });
      assert.equal(await page.locator("h1").innerText(), I18N.en["hero.title"]);
      await c.close();
    });
  }

  await check("browser 390: ?lang=es paints Spanish first, with no English hero, even before hs.js runs", async () => {
    reset();
    const c = await ctx(390); const page = await c.newPage();
    await page.route(/\/home-shield\/hs\.js$/, (r) => r.abort());
    await page.goto(BASE + "/home-shield/?lang=es", { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("html").getAttribute("lang"), "es");
    assert.equal(await page.locator("h1").innerText(), I18N.es["hero.title"]);
    assert.equal(await page.locator("html.hs-pending").count(), 0, "page stays hidden");
    const txt = await page.locator("body").innerText();
    for (const en of [I18N.en["hero.title"], I18N.en["hero.cta"], I18N.en["hero.promise"]]) assert.ok(!txt.includes(en), "English on first paint: " + en);
    assert.match(txt, /Habla con Aria — gratis/);
    await c.close();
  });

  await check("browser 390: a Spanish browser (es-US) with no saved choice opens in Spanish; Aria greets in Spanish", async () => {
    reset();
    const c = await ctx(390, { locale: "es-US" }); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    assert.equal(await page.locator("h1").innerText(), I18N.es["hero.title"]);
    await page.locator('[data-action="talk"]').first().click();
    await page.waitForSelector("#hsMsgs .hs-msg-a");
    assert.match(await page.locator("#hsMsgs .hs-msg-a").first().innerText(), /^Hola, soy Aria/);
    await page.waitForTimeout(300);
    assert.ok(ttsTexts().join(" ").startsWith("Hola, soy Aria"), "first spoken words are Spanish");
    await c.close();
  });

  await check("browser 390: the language-barrier section: ES primary + EN mirror; Listen speaks the page language", async () => {
    reset();
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/?lang=es", { waitUntil: "load" });
    const cols = page.locator("#barrier .hs-barrier-col");
    assert.equal(await cols.count(), 2);
    assert.equal(await cols.nth(0).getAttribute("lang"), "es");
    assert.match(await cols.nth(0).innerText(), /En tu idioma\. Cada línea\./);
    assert.match(await cols.nth(1).innerText(), /In your language\. Every line\./);
    await page.click("#barrier .hs-listen");
    await page.waitForTimeout(500);
    const said = ttsTexts().join(" ");
    assert.ok(said.startsWith("En tu idioma. Cada línea.") && !/Every line/.test(said), said);
    await page.locator("#barrier").scrollIntoViewIfNeeded(); await shot(page, "barrier-es", "#barrier");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })); await shot(page, "hero-es");
    await page.click("#barrier .hs-listen"); // stop
    log.length = 0;
    await page.click("#hsLang");
    assert.match(await cols.nth(0).innerText(), /En tu idioma/, "the ES block stays Spanish on the English page");
    await page.click("#barrier .hs-listen");
    await page.waitForTimeout(500);
    assert.ok(ttsTexts().join(" ").startsWith("In your language. Every line."), ttsTexts().join(" "));
    await page.locator("#barrier").scrollIntoViewIfNeeded(); await shot(page, "barrier-en", "#barrier");
    await c.close();
  });

  await check("browser 390: Listen on the intro speaks the intro through hs-tts; again in Español; one voice at a time", async () => {
    reset();
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click('#intro .hs-listen');
    await page.waitForFunction(() => document.querySelector("#intro .hs-listen").classList.contains("is-on") || !document.getElementById("hsAudio").paused, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    assert.ok(ttsTexts().length >= 1, "hs-tts was not called");
    assert.equal(ttsTexts().join(" "), I18N.en["intro.line1"] + " " + I18N.en["intro.line2"]);
    // A second Listen stops the first: one voice at a time.
    await page.click('#how .hs-listen');
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#intro .hs-listen.is-on").count(), 0);
    await page.click('#how .hs-listen'); // stop
    log.length = 0;
    await page.click("#hsLang");
    await page.click('#intro .hs-listen');
    await page.waitForTimeout(600);
    assert.equal(ttsTexts().join(" "), I18N.es["intro.line1"] + " " + I18N.es["intro.line2"]);
    assert.ok(log.filter((x) => x.fn === "hs-tts").every((x) => x.body.lang === "es"));
    assert.deepEqual(errs, []);
    await c.close();
  });

  await check("browser 390: voice not configured -> the real error is shown and the text stays", async () => {
    reset();
    stub["hs-tts"] = () => ({ status: 503, json: { error: "voice not configured", code: "voice_not_configured" } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click('#intro .hs-listen');
    await page.waitForSelector("#intro .hs-listen-err:not([hidden])", { timeout: 4000 });
    assert.match(await page.locator("#intro .hs-listen-err").innerText(), /voice not configured/);
    assert.match(await page.locator("#intro").innerText(), /I'm in your corner/);
    await c.close();
  });

  await check("browser 390: tap Aria -> spoken two-way conversation (greeting, mic, transcript, reply, her voice, mic again)", async () => {
    reset();
    stub["hs-stt"] = (b) => ({ json: { text: b && b.audio && b.audio.length > 100 ? "My roof is leaking after the storm." : "" } });
    stub["hs-chat"] = (b) => ({ json: { reply: "I'm sorry. Is water coming in right now?", caseDraft: { issue: "roof", trades: ["roofer"], zip: null, urgency: "soon", summary: "Roof leak after a storm." }, ready: false } });
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click(".hs-star-hero");
    await page.waitForSelector("#hsSheet:not([hidden])");
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-u").length >= 1, null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2, null, { timeout: 8000 });
    const stt = log.filter((x) => x.fn === "hs-stt");
    assert.ok(stt.length >= 1 && stt[0].body.audio.length > 100, "mic audio was not sent");
    assert.equal(stt[0].body.lang, "en");
    assert.equal(await page.locator("#hsMsgs .hs-msg-u").first().innerText(), "My roof is leaking after the storm.");
    const chatCall = log.find((x) => x.fn === "hs-chat");
    assert.equal(chatCall.body.voice, true);
    assert.equal(chatCall.body.messages.at(-1).content, "My roof is leaking after the storm.");
    await page.waitForFunction(() => window.HS_CONVO.state === "listening", null, { timeout: 8000 });
    const said = ttsTexts().join(" ");
    assert.ok(said.includes("I'm in your corner") && said.includes("Is water coming in right now?"), said);
    assert.equal(await page.locator(".hs-star-mini").getAttribute("data-state"), "listening", "steady glow while the mic is live");
    await shot(page, "chat-voice");
    await page.click("#hsMic"); // end the conversation
    assert.equal(await page.evaluate(() => window.HS_CONVO.active), false);
    assert.deepEqual(errs, []);
    await c.close();
  });

  await check("browser 390: Español: tap Aria -> greeting and replies in Spanish, mic sent with lang es", async () => {
    reset();
    stub["hs-stt"] = () => ({ json: { text: "Se me está filtrando el techo." } });
    stub["hs-chat"] = (b) => ({ json: { reply: "Lo siento mucho. ¿Está entrando agua ahora mismo?", caseDraft: { issue: "leak_water" }, ready: false } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/?lang=es", { waitUntil: "load" });
    await page.click(".hs-star-hero");
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2, null, { timeout: 15000 });
    assert.equal(log.find((x) => x.fn === "hs-stt").body.lang, "es");
    assert.equal(log.find((x) => x.fn === "hs-chat").body.lang, "es");
    await page.waitForTimeout(800);
    const said = ttsTexts().join(" ");
    assert.ok(said.includes("Estoy de tu lado") && said.includes("¿Está entrando agua"), said);
    await c.close();
  });

  await check("browser 390: streaming: her first sentence plays while the rest still generates; latency measured per stage", async () => {
    reset();
    /* Stub timings: STT 300 ms, model first token 350 ms then a word every
       120 ms (a 3-sentence reply takes ~3 s to finish), voice 200 ms. */
    ttsDelay = 200;
    stub["hs-stt"] = () => ({ delay: 300, json: { text: "My roof is leaking after the storm." } });
    const reply = "I'm right here with you. Is water coming in right now, or has it stopped? If it is coming in, shut off the water main first and photograph everything before you move anything.";
    stub["hs-chat"] = () => ({ firstToken: 350, gap: 120, json: { reply, caseDraft: { issue: "roof" }, ready: false } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click(".hs-star-hero");
    await page.waitForFunction(() => window.HS_LAT.length >= 1, null, { timeout: 20000 });
    const L = await page.evaluate(() => window.HS_LAT[0]);
    const rel = (k) => Math.round(L[k] - L.t0);
    const row = { endpointing_silence: 900, stt: rel("sttDone"), firstToken: rel("firstToken"), firstSentence: rel("firstSentence"), ttsFirstByte: rel("ttsFirstByte"), firstAudio: rel("firstAudio"), streamEnd: rel("streamEnd") };
    console.log("         latency (ms after end of speech, stubbed services): " + JSON.stringify(row));
    assert.ok(L.voice, "voice turn");
    for (const k of ["sttDone", "firstToken", "firstSentence", "ttsFirstByte", "firstAudio", "streamEnd"]) assert.ok(L[k], "missing mark " + k);
    assert.ok(L.sttDone < L.firstToken && L.firstToken <= L.firstSentence && L.firstSentence < L.ttsFirstByte && L.ttsFirstByte <= L.firstAudio, JSON.stringify(row));
    assert.ok(L.firstAudio < L.streamEnd, "her first sentence must play before the reply finishes generating " + JSON.stringify(row));
    // Overhead of the page itself on top of the stubbed services must stay small.
    const services = 900 + 300 + 350 + 200;
    assert.ok(row.firstAudio - services < 900, "pipeline overhead " + (row.firstAudio - services) + " ms");
    const said = ttsTexts();
    assert.equal(said.at(-3), "I'm right here with you.", "the first sentence is synthesized on its own: " + JSON.stringify(said));
    ttsDelay = 0;
    await page.click("#hsMic");
    await c.close();
  });

  await check("browser 390: barge-in mid-stream aborts the reply stream and her voice", async () => {
    reset();
    stub["hs-chat"] = () => ({ firstToken: 100, gap: 150, json: { reply: "One. Two is a longer sentence. Three is longer still and keeps going for a while. Four. Five.", caseDraft: {}, ready: false } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.locator('[data-action="talk"]').first().click();
    await page.evaluate(() => { const a = document.getElementById("hsAudio"); a.muted = false; });
    await page.fill("#hsInput", "Hello"); await page.press("#hsInput", "Enter");
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2, null, { timeout: 5000 });
    await page.evaluate(() => window.HS_ABORT_TURN());
    const before = await page.locator("#hsMsgs .hs-msg-a").last().innerText();
    await page.waitForTimeout(900);
    const after = await page.locator("#hsMsgs .hs-msg-a").last().innerText();
    assert.equal(after, before, "the stream kept writing after the abort");
    assert.ok(!/Five/.test(after));
    assert.equal(await page.evaluate(() => window.HS_SPEECH.active), false);
    await c.close();
  });

  for (const W of [390, 1366]) {
    await check(`browser ${W}: typed chat -> "Your case" card; consent blocks sending; case-create carries contact, summary carries no PII; caso link`, async () => {
      reset();
      let turn = 0;
      stub["hs-chat"] = () => {
        turn++;
        if (turn === 1) return { json: { reply: "I'm sorry your claim was denied. What is the ZIP code of the home?", caseDraft: { issue: "denied_claim", trades: ["public_adjuster"], urgency: "soon", summary: "Wind claim denied.", zip: null }, ready: false } };
        return { json: { reply: "Thank you. Here is your case. Check it, and send it when you are ready.", caseDraft: { issue: "denied_claim", trades: ["public_adjuster", "attorney"], zip: "33101", state: "FL", urgency: "soon", summary: "Hurricane wind claim on a roof was denied last month. The homeowner has the denial letter and photos.", insurer: "Acme Mutual", claimStatus: "denied" }, ready: true } };
      };
      const c = await ctx(W); const page = await c.newPage(); const errs = errorsOf(page);
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      await page.locator('[data-action="talk"]').first().click();
      await page.waitForSelector("#hsSheet:not([hidden])");
      await page.fill("#hsInput", "My claim was denied.");
      await page.press("#hsInput", "Enter");
      await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2);
      if (W === 390) await shot(page, "chat");
      await page.fill("#hsInput", "33101");
      await page.press("#hsInput", "Enter");
      await page.waitForSelector("#hsCaseCard");
      const card = page.locator("#hsCaseCard");
      assert.equal(await card.locator("select[name=issue]").inputValue(), "denied_claim");
      assert.equal(await card.locator("input[name=zip]").inputValue(), "33101");
      assert.equal(await card.locator("input[name=trade][value=attorney]").isChecked(), true);
      const consent = card.locator("#hsConsent");
      assert.equal(await consent.isChecked(), false, "consent starts unchecked");
      assert.match(await card.locator(".hs-consent").innerText(), /I agree to be contacted only by professionals I approve\. Aria Home Shield never sells my information\./);
      await card.locator("input[name=cname]").fill("Ana Prueba");
      await card.locator("input[name=phone]").fill("(305) 555-0142");
      await card.locator("input[name=email]").fill("ana@correo.test");
      // The homeowner types PII into the summary: it must not leave the page.
      await card.locator("textarea[name=summary]").fill("Hurricane wind claim denied by Acme Mutual. Call me at 305-555-0142, I live at 120 Coral Way.");
      assert.equal(await page.locator("#hsSendCase").isDisabled(), true, "send is blocked until consent");
      await page.locator("#hsSendCase").click({ force: true });
      await page.waitForTimeout(200);
      assert.equal(log.filter((x) => x.fn === "hs-case-create").length, 0, "case sent without consent");
      if (W === 390) { await page.evaluate(() => { const m = document.getElementById("hsMsgs"); const c = document.getElementById("hsCaseCard"); m.scrollTop = c.offsetTop - m.offsetTop - 8; }); await shot(page, "case-summary"); await page.locator("#hsSendCase").scrollIntoViewIfNeeded(); await shot(page, "case-consent"); }
      await consent.check();
      assert.equal(await page.locator("#hsSendCase").isDisabled(), false);
      await page.locator("#hsSendCase").click();
      await page.waitForSelector("#hsCaseDone", { timeout: 6000 });
      const sent = log.find((x) => x.fn === "hs-case-create").body;
      assert.equal(sent.consent, true);
      assert.deepEqual(sent.contact, { name: "Ana Prueba", phone: "(305) 555-0142", email: "ana@correo.test", preferred: "phone" });
      assert.ok(!/555|Coral|Acme|Ana|correo/.test(sent.caseDraft.summary), sent.caseDraft.summary);
      assert.equal(sent.caseDraft.zip, "33101");
      const link = await page.locator("#hsCaseLink").innerText();
      assert.match(link, /\/home-shield\/caso(\.html)?\?c=c_[0-9a-f]{24}&t=[0-9a-f]{64}$/);
      assert.match(await page.locator("#hsCaseDone").innerText(), /Save this link/);
      if (W === 390) { await page.locator("#hsCaseDone").scrollIntoViewIfNeeded(); await shot(page, "case-sent"); }
      assert.deepEqual(errs, []);
      await c.close();
    });
  }

  await check("browser 390: Door 1 policy review shows and speaks all four parts (strong, weak, improve, how it compares)", async () => {
    reset();
    stub["hs-doc-upload"] = () => ({ json: { docId: "d_" + "a".repeat(24), name: "policy.pdf", type: "application/pdf", size: 900, kind: "policy" } });
    stub["hs-policy-review"] = () => ({ json: { textFound: true, flags: [], findings: [{ key: "hurricane_deductible", tone: "weak", label: "Hurricane deductible: 5%" }, { key: "rcv", tone: "strong", label: "Replacement cost on the dwelling" }],
      strong: ["Replacement cost on the dwelling"], weak: ["Hurricane deductible: 5%"], improve: ["Add ordinance or law coverage"], plainSummary: "Here is my first read of your policy.", excerpt: "SECTION I" } });
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#door1 [data-action=upload]").click();
    await (await chooser).setFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await page.waitForSelector("#hsCaseCard");
    const card = page.locator("#hsCaseCard");
    await card.locator("input[name=zip]").fill("33101");
    await card.locator("input[name=cname]").fill("Ana Prueba");
    await card.locator("input[name=email]").fill("ana@correo.test");
    await card.locator("#hsConsent").check();
    await page.locator("#hsSendCase").click();
    await page.waitForSelector(".hs-review", { timeout: 8000 });
    const heads = await page.locator(".hs-review .hs-review-h").allInnerTexts();
    assert.deepEqual(heads, ["What's strong", "What's weak", "Where it can improve", "How it compares"]);
    assert.match(await page.locator(".hs-review").innerText(), /Yours is 5%/);
    await page.waitForTimeout(600);
    const said = ttsTexts().join(" ");
    for (const h of heads) assert.ok(said.includes(h), "not spoken: " + h);
    assert.equal(log.find((x) => x.fn === "hs-doc-upload").body.kind, "policy");
    await page.locator(".hs-review").scrollIntoViewIfNeeded(); await shot(page, "policy-review");
    assert.deepEqual(errs, []);
    await c.close();
  });

  /* caso.html, against the real backend handlers on the in-memory store:
     a verified pro's offer lands, the homeowner talks first, messages,
     then shares contact; a second offer is declined. */
  const seedCase = async () => {
    const r = await real["hs-case-create"]({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "10.0.0." + Math.floor(Math.random() * 200) }, body: JSON.stringify({ caseDraft: { issue: "roof", trades: ["roofer"], zip: "33101", urgency: "soon", summary: "Roof damage after a storm; homeowner has photos." }, contact: { name: "Ana Prueba", phone: "3055550142", email: "ana@correo.test", preferred: "phone" }, consent: true }) }, {});
    assert.equal(r.statusCode, 200, r.body);
    return JSON.parse(r.body);
  };
  const seedOffer = async (caseId, n, msg) => {
    const S = store.openStores({});
    const hex = (s) => (s.repeat(24)).slice(0, 24);
    const pro = { id: "p_" + hex(String(n)), email: `pro${n}@correo.test`, name: n === 1 ? "Luis Prueba" : "Marta Prueba", company: n === 1 ? "Prueba Roofing LLC" : "Prueba Adjusting", trades: ["roofer"], licenseType: "roofing_contractor", licenseNumber: "CCC" + (1330000 + n), licenseState: "FL", phone: "+1305555010" + n, verified: true, createdAt: new Date().toISOString(), serviceZips: ["33101"] };
    await S.pros.setJSON(pro.id, pro);
    const offer = { id: "o_" + hex(String(n + 4)), caseId, proId: pro.id, message: msg, createdAt: new Date(Date.now() + n).toISOString(), status: "pending" };
    await S.offers.setJSON(offer.id, offer);
    const c = await S.cases.get(caseId, { type: "json" });
    c.offers = [...(c.offers || []), offer.id]; c.status = "offered";
    await S.cases.setJSON(caseId, c);
    return { pro, offer };
  };

  await check("browser 390: caso.html: timeline, offers with license; talk first (contact private), message, share contact -> connected; decline", async () => {
    reset();
    const k = await seedCase();
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(`${BASE}/home-shield/caso.html?c=${k.caseId}&t=${k.token}`, { waitUntil: "load" });
    await page.waitForSelector("#casoTimeline");
    assert.match(await page.locator("#casoBody").innerText(), /No offers yet/);
    await seedOffer(k.caseId, 1, "I inspect storm roofs every week. I can come Thursday and document everything for your claim.");
    await seedOffer(k.caseId, 2, "Happy to help with your roof claim.");
    await page.evaluate(() => window.HS_CASO_REFRESH());
    await page.waitForSelector(".hs-offer");
    assert.equal(await page.locator(".hs-offer").count(), 2);
    const first = page.locator('.hs-offer:has-text("Luis Prueba")');
    assert.match(await first.innerText(), /License: Roofing contractor CCC1330001 FL/);
    assert.ok(!/3055550101|pro1@/.test(await page.locator("#casoBody").innerText()), "pro contact before sharing");
    assert.equal(await first.locator("button").first().innerText(), "Talk first through Aria Home Shield");
    await page.locator(".hs-offer").first().evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
    await shot(page, "caso-offer");
    // Decline the second.
    await page.locator('.hs-offer:has-text("Marta Prueba") button[data-act=decline]').click();
    await page.waitForSelector('.hs-offer[data-status=declined]');
    // Talk first.
    await first.locator("button[data-act=talk_first]").click();
    await page.waitForSelector('.hs-offer[data-status=accepted_talk_first] form[data-thread]');
    const S = store.openStores({});
    const offerNow = await S.offers.get("o_" + "5".repeat(24), { type: "json" });
    assert.equal(offerNow.status, "accepted_talk_first");
    const caseNow = await S.cases.get(k.caseId, { type: "json" });
    assert.notEqual(caseNow.status, "connected", "talk first must not share contact");
    await page.fill('[data-thread-input]', "Can you come Thursday morning? My number is 305-555-0142.");
    await page.press('[data-thread-input]', "Enter");
    await page.waitForSelector(".hs-tmsg.is-me");
    assert.ok(!/555-0142/.test(await page.locator(".hs-tmsg.is-me").innerText()), "contact scrubbed while talking first");
    // Share my contact (the explicit, separate tap).
    await page.locator('.hs-offer[data-status=accepted_talk_first] button[data-act=share_contact]').click();
    await page.waitForSelector("#casoConnected");
    const conn = await page.locator("#casoConnected").innerText();
    assert.match(conn, /You're connected/); assert.match(conn, /Luis Prueba/); assert.match(conn, /pro1@correo\.test/);
    assert.equal(await page.locator("#casoTimeline li.is-done").count(), 4);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await shot(page, "caso-connected");
    await page.locator(".hs-thread").first().evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 300, behavior: "instant" }));
    await shot(page, "caso-thread");
    assert.deepEqual(errs, []);
    await c.close();
  });

  await check("browser 390: caso.html: delete my case and documents", async () => {
    reset();
    const k = await seedCase();
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(`${BASE}/home-shield/caso.html?c=${k.caseId}&t=${k.token}`, { waitUntil: "load" });
    await page.waitForSelector("#casoDelete");
    await page.click("#casoDelete");
    await page.click("#casoDeleteYes");
    await page.waitForSelector("text=Your case and documents were deleted.");
    assert.equal(log.find((x) => x.fn === "hs-case-delete").body.caseId, k.caseId);
    await c.close();
  });

  await check("browser 390: caso.html with stubbed endpoints: decline posts the action; Spanish labels", async () => {
    reset();
    stub["hs-case-status"] = () => ({ json: { case: { id: "c_x", status: "offered", issue: "leak_water", trades: ["public_adjuster"], area: { label: "Miami, FL" }, summary: "Water leak." }, offers: [{ id: "o_1", status: "pending", message: "Hola", createdAt: "2026-11-05T00:00:00Z", pro: { id: "p_1", name: "Pro Uno", company: "Uno LLC", trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W123", licenseState: "FL", verified: true } }] } });
    stub["hs-offer-respond"] = () => ({ json: { offer: { id: "o_1", status: "declined" } } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(`${BASE}/home-shield/caso.html?c=c_x&t=tok&lang=es`, { waitUntil: "load" });
    await page.waitForSelector(".hs-offer");
    assert.match(await page.locator(".hs-offer").innerText(), /Hablar primero por Aria Home Shield/);
    await page.click("button[data-act=decline]");
    await page.waitForTimeout(300);
    const r = log.find((x) => x.fn === "hs-offer-respond").body;
    assert.deepEqual([r.offerId, r.action, r.token], ["o_1", "decline", "tok"]);
    await c.close();
  });

  await check("browser 390: weight: first load under 150 KB (fonts excluded), no long tasks, no shop bundle", async () => {
    reset();
    const c = await ctx(390); const page = await c.newPage();
    const urls = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch (e) { /* none */ } });
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const bytes = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      let total = nav ? nav.transferSize || nav.encodedBodySize : 0;
      for (const e of performance.getEntriesByType("resource")) if (!/fonts\.(googleapis|gstatic)/.test(e.name)) total += e.transferSize || e.encodedBodySize || 0;
      return total;
    });
    assert.ok(bytes < 150 * 1024, "first load " + bytes + " bytes");
    const long = await page.evaluate(() => window.__long);
    assert.deepEqual(long, [], "long tasks: " + long.join(","));
    assert.ok(!urls.some((u) => /\/build\/|catalog|tailwind|\/assets\/js\//.test(u)), urls.filter((u) => /build|catalog/.test(u)).join(" "));
    console.log(`         first load ${(bytes / 1024).toFixed(1)} KB, ${urls.length} requests`);
    await c.close();
  });

  await browser.close();
  srv.close();
  rmSync(tmp, { recursive: true, force: true });
}
/* ######################## END FRONT-END SECTION ######################## */

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
