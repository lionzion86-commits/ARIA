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
import { deflateSync } from "node:zlib";

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
  "hs-admin-pros", "hs-admin-verify", "hs-admin-cases"]) fns[n] = (await import(FN + n + ".js")).handler;

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

/* ================================================================
   FRONT SECTION (homeowner page + hs-chat) -- added by the front builder.
   ================================================================ */

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
