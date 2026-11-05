/* ==================================================================
   ARIA HOME SHIELD -- partner desks (#443 c.6661955878).

     node scripts/test/home-shield-partners-tests.mjs

   In-process against in-memory Blobs. Pins the qualification escrow law:
   no debit on ring / answer / pass, exactly one debit on a verified
   claim; represented homeowners never billable; membership + per-trade
   gates; no contact before a paid claim; round-robin re-ring; Stripe
   webhook credit (signed with the shop's own scheme); EN/ES parity.
   ================================================================== */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// hs endpoints are v2 functions (default export, #443 c.6666325601); the webhook is still Lambda-shaped.
const fnOf = (m) => m.default || m.handler;

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).slice(0, 600)} ${String(e.stack).split("\n").find((l) => l.includes("partners-tests")) || ""}`); console.log("    FAIL " + name); }
}
function memStore() {
  const m = new Map();
  const toBuf = (v) => (typeof v === "string" ? Buffer.from(v) : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v));
  return {
    m,
    get: async (k, o) => { if (!m.has(k)) return null; const v = m.get(k); if (o && o.type === "json") return JSON.parse(toBuf(v).toString()); if (o && o.type === "arrayBuffer") { const b = toBuf(v); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } return toBuf(v).toString(); },
    set: async (k, v) => { m.set(k, typeof v === "string" ? v : toBuf(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
const FN = "../../netlify/functions/";
const store = await import(FN + "_hs-store.js");
const P = await import(FN + "_hs-partners.js");
const STORES = {};
store.__setStoreFactory((n) => (STORES[n] ||= memStore()));
store.__setMailer(async () => ({ sent: false }));
process.env.ADMIN_EMAILS = "danny@correo.test";
STORES.sessions = memStore();
await STORES.sessions.setJSON("adm", { email: "danny@correo.test", createdAt: new Date().toISOString() });
const ADMIN = "aria_session=adm";
const H = {};
for (const n of ["hs-storm", "hs-pro-signup", "hs-partner", "hs-partner-admin", "hs-case-create", "hs-case-status", "hs-offer-respond", "hs-pro-feed", "hs-pro-case", "hs-pro-offer", "hs-stripe-webhook", "hs-admin-verify"]) H[n] = fnOf(await import(FN + n + ".js"));
let ip = 0;
async function call(n, { method = "POST", body, query, cookie, headers = {}, raw } = {}) {
  const r = await H[n]({ httpMethod: method, headers: { "x-nf-client-connection-ip": `10.9.${ip >> 8 & 255}.${ip++ & 255}`, cookie: cookie || "", ...headers }, queryStringParameters: query || {}, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const sc = r.headers && r.headers["Set-Cookie"];
  return { status: r.statusCode, body: r.isBase64Encoded ? null : JSON.parse(r.body || "{}"), raw: r.body, cookie: sc ? sc.split(";")[0] : null };
}
const desk = async (email, d, zip = "33130") => {
  const r = await call("hs-pro-signup", { body: { email, password: "correct horse battery", name: "Desk " + email.split("@")[0], phone: "7865550100", desk: d,
    licenseType: d === "attorney" ? "attorney" : d === "roofer" ? "roofing_contractor" : "public_adjuster", licenseNumber: "LIC" + email.length + d.length, licenseState: "FL", attest: true,
    serviceArea: { centerZip: zip, radiusMiles: 50 } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pro.desk, d);
  await call("hs-admin-verify", { cookie: ADMIN, body: { proId: r.body.pro.id, verified: true } });
  await call("hs-partner", { cookie: r.cookie, body: { action: "setonline", online: true } });
  return { id: r.body.pro.id, cookie: r.cookie };
};
const admin = (body) => call("hs-partner-admin", { cookie: ADMIN, body });
const state = (d) => call("hs-partner", { method: "GET", cookie: d.cookie });
const PII = { name: "Rosa Delgado", phone: "(305) 555-0177", email: "rosa.d@correo.test", claim: "CLM-77-123456", addr: "88 SW 8th Street" };
const newCase = async (over = {}) => (await call("hs-case-create", { body: { consent: true,
  caseDraft: { issue: "roof", trades: ["roofer"], zip: "33135", urgency: "soon", summary: "Roof leak after the storm.", claimNumber: PII.claim, address: PII.addr, ...over },
  contact: { name: PII.name, phone: PII.phone, email: PII.email } } })).body;
const ledgerOf = (id) => [...STORES["hs-ledger"]?.m.entries() || []].filter(([k]) => k.startsWith(id + "/")).map(([, v]) => JSON.parse(v));
/** Make `caseId` ring at desk d: the other roofer desks pass it. */
async function ringAt(d, caseId) {
  for (let i = 0; i < 4; i++) {
    const s = await state(d);
    if (s.body.rings.some((r) => r.caseId === caseId)) return true;
    for (const x of [R.a, R.b]) if (x !== d && (await state(x)).body.rings.some((r) => r.caseId === caseId)) await call("hs-partner", { cookie: x.cookie, body: { action: "passlead", caseId } });
  }
  return false;
}
const noPII = (s, where) => { for (const n of ["Rosa", "Delgado", "555-0177", "5550177", "rosa.d", PII.claim, "88 SW"]) assert.ok(!s.includes(n), `${where} leaked ${n}`); };

console.log("  Home Shield partner desks");
const R = {};

await test("settings defaults: free enrollment, payments off, roofer on, PA + attorney pending legal review", async () => {
  const s = await P.readSettings(store.openStores({}));
  assert.deepEqual([s.membershipRequired, s.membershipMonthlyUsd, s.paymentsLive, s.ringSeconds], [false, null, false, 90]);
  assert.deepEqual(s.perLeadEnabled, { roofer: true, public_adjuster: false, attorney: false, insurance_agent: false });
  assert.equal((await call("hs-partner-admin", { method: "GET" })).status, 403);
  assert.equal((await admin({ action: "settings", patch: { membershipMonthlyUsd: "99" } })).status, 400);
});

await test("desks sign up; round-robin ring: one desk at a time, pass re-rings the next, never debits", async () => {
  R.a = await desk("roofa@correo.test", "roofer");
  R.b = await desk("roofb@correo.test", "roofer");
  R.c = await desk("roofc@correo.test", "roofer", "32801"); // Orlando: out of area
  R.case1 = await newCase();
  const sa = await state(R.a), sb = await state(R.b), sc = await state(R.c);
  const ringing = [sa, sb].filter((s) => s.body.rings.some((r) => r.caseId === R.case1.caseId));
  assert.equal(ringing.length, 1, "exactly one desk rings");
  assert.equal(sc.body.ring, null, "out-of-area desk never rings");
  assert.equal(sa.body.balance.sampleAvailable, true);
  noPII(JSON.stringify(sa.body) + JSON.stringify(sb.body), "ringing state");
  const first = ringing[0] === sa ? R.a : R.b, second = first === R.a ? R.b : R.a;
  assert.equal((await call("hs-partner", { cookie: second.cookie, body: { action: "answerlead", caseId: R.case1.caseId } })).body.code, "not_yours");
  const p = await call("hs-partner", { cookie: first.cookie, body: { action: "passlead", caseId: R.case1.caseId } });
  assert.equal(p.body.passed, true);
  assert.ok((await state(second)).body.rings.some((r) => r.caseId === R.case1.caseId), "re-rung to the next desk");
  assert.ok(!(await state(first)).body.rings.some((r) => r.caseId === R.case1.caseId));
  assert.deepEqual(ledgerOf(R.a.id).concat(ledgerOf(R.b.id)), [], "no ledger entries from ringing or passing");
  R.secondDesk = second; R.firstDesk = first;
});

await test("timeout re-rings (counts as a pass); round-robin rotates who rings first", async () => {
  const S = store.openStores({});
  const c2 = await newCase({ zip: "33139" });
  await P.tickRings(S, Date.now());
  const c = JSON.parse(STORES["hs-cases"].m.get(c2.caseId));
  const firstId = c.rings.roofer.proId;
  await P.tickRings(S, Date.now() + 91000);
  /* the ring moved on (both a and b stay "online" only within the heartbeat window, so refresh it) */
  for (const d of [R.a, R.b]) await call("hs-partner", { cookie: d.cookie, body: { action: "setonline", online: true } });
  await P.tickRings(S, Date.now() + 91000);
  const after = JSON.parse(STORES["hs-cases"].m.get(c2.caseId)).rings.roofer;
  assert.ok(after.passed.includes(firstId));
  assert.notEqual(after.proId, firstId);
  R.case2 = c2;
});

await test("answer holds, the sample call is free, contact only after the homeowner shares AND the claim is paid", async () => {
  const d = R.secondDesk;
  const a = await call("hs-partner", { cookie: d.cookie, body: { action: "answerlead", caseId: R.case1.caseId } });
  assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(a.body.offer.sample, true);
  assert.deepEqual(ledgerOf(d.id), [], "answering does not debit");
  let s = await state(d);
  assert.equal(s.body.claims[0].contactShared, false); noPII(JSON.stringify(s.body), "claimed, not shared");
  noPII((await call("hs-pro-case", { method: "GET", cookie: d.cookie, query: { c: R.case1.caseId } })).raw, "pro-case before share");
  /* The homeowner talks first: still no contact, still no debit. */
  await call("hs-offer-respond", { body: { caseId: R.case1.caseId, token: R.case1.token, offerId: a.body.offer.id, action: "talk_first" } });
  noPII(JSON.stringify((await state(d)).body), "talk first"); assert.deepEqual(ledgerOf(d.id), []);
  const sh = await call("hs-offer-respond", { body: { caseId: R.case1.caseId, token: R.case1.token, offerId: a.body.offer.id, action: "share_contact" } });
  assert.equal(sh.status, 200);
  const L = ledgerOf(d.id);
  assert.equal(L.length, 1); assert.equal(L[0].type, "claim_debit"); assert.equal(L[0].credits, 0); assert.equal(L[0].sample, true);
  s = await state(d);
  assert.equal(s.body.claims[0].paid, true); assert.equal(s.body.claims[0].case.contact.email, PII.email);
  assert.equal(s.body.balance.sampleAvailable, false);
  /* Sample spent, no credits: blocked from new leads, not rung. */
  assert.equal(s.body.block, "no_credits");
  R.paidOffer = a.body.offer.id;
});

await test("ledger: grant, then exactly one debit per verified claim (idempotent), none on pass", async () => {
  const d = R.secondDesk;
  assert.equal((await admin({ action: "grant", proId: d.id, credits: 2, note: "test" })).status, 200);
  const c3 = await newCase({ zip: "33145" });
  for (const x of [R.a, R.b]) await call("hs-partner", { cookie: x.cookie, body: { action: "setonline", online: true } });
  assert.ok(await ringAt(d, c3.caseId), "rings at the funded desk");
  const a = await call("hs-partner", { cookie: d.cookie, body: { action: "answerlead", caseId: c3.caseId } });
  assert.equal(a.body.offer.sample, false);
  assert.deepEqual((await state(d)).body.balance, { credits: 2, held: 1, available: 1, sampleAvailable: false });
  await call("hs-offer-respond", { body: { caseId: c3.caseId, token: c3.token, offerId: a.body.offer.id, action: "accept" } });
  /* Admin verifying the same claim again does not double-debit. */
  await admin({ action: "verifyclaim", caseId: c3.caseId, offerId: a.body.offer.id });
  const debits = ledgerOf(d.id).filter((e) => e.type === "claim_debit" && !e.sample);
  assert.equal(debits.length, 1); assert.equal(debits[0].credits, -1); assert.equal(debits[0].usd, 750);
  assert.deepEqual((await state(d)).body.balance, { credits: 1, held: 0, available: 1, sampleAvailable: false });
});

await test("a declined claim releases the hold and re-rings; admin verify debits without releasing contact", async () => {
  const d = R.secondDesk;
  const c4 = await newCase({ zip: "33125" });
  assert.ok(await ringAt(d, c4.caseId));
  {
    const a = await call("hs-partner", { cookie: d.cookie, body: { action: "answerlead", caseId: c4.caseId } });
    assert.equal((await state(d)).body.balance.held, 1);
    await admin({ action: "verifyclaim", caseId: c4.caseId, offerId: a.body.offer.id });
    const st = await state(d);
    assert.equal(st.body.balance.credits, 0);
    const cl = st.body.claims.find((x) => x.caseId === c4.caseId);
    assert.equal(cl.paid, true); assert.equal(cl.contactShared, false, "paid but homeowner has not shared: no contact");
    noPII(JSON.stringify(cl), "admin-verified, not shared");
  }
  const c5 = await newCase({ zip: "33133" });
  await admin({ action: "grant", proId: R.firstDesk.id, credits: 1 });
  for (const x of [R.a, R.b]) await call("hs-partner", { cookie: x.cookie, body: { action: "setonline", online: true } });
  const who = R.firstDesk;
  assert.ok(await ringAt(who, c5.caseId));
  {
    const a = await call("hs-partner", { cookie: who.cookie, body: { action: "answerlead", caseId: c5.caseId } });
    await call("hs-offer-respond", { body: { caseId: c5.caseId, token: c5.token, offerId: a.body.offer.id, action: "decline" } });
    assert.equal((await state(who)).body.balance.held, 0, "hold released");
    const r = JSON.parse(STORES["hs-cases"].m.get(c5.caseId)).rings.roofer;
    assert.ok(r.passed.includes(who.id)); assert.notEqual(r.status, "answered");
  }
});

await test("represented homeowner: never rings, never billable, no override", async () => {
  const S = store.openStores({});
  await admin({ action: "grant", proId: R.a.id, credits: 3 });
  const rep = await newCase({ zip: "33134", represented: true });
  await P.tickRings(S);
  const c = JSON.parse(STORES["hs-cases"].m.get(rep.caseId));
  assert.equal(c.represented, true); assert.ok(!c.rings || !Object.keys(c.rings).length);
  for (const d of [R.a, R.b]) assert.notEqual((await call("hs-partner", { cookie: d.cookie, body: { action: "answerlead", caseId: rep.caseId } })).status, 200);
  /* Even a forged ring offer cannot be settled. */
  const o = { id: store.newId("o"), caseId: rep.caseId, proId: R.a.id, ring: { desk: "roofer", kind: "call", sample: false }, paid: false, status: "pending" };
  const r = await P.settleClaim(S, c, o);
  assert.equal(r.error[1], "represented");
  assert.equal((await admin({ action: "verifyclaim", caseId: rep.caseId, offerId: o.id })).status, 404);
  assert.ok(!ledgerOf(R.a.id).some((e) => e.caseId === rep.caseId));
});

await test("membership gate and per-trade switches", async () => {
  const pa = await desk("pa1@correo.test", "public_adjuster");
  const att = await desk("law1@correo.test", "attorney");
  let s = await state(pa);
  assert.equal(s.body.block, "legal_review");
  assert.equal((await call("hs-partner", { cookie: pa.cookie, body: { action: "buypack", packId: "calls10" } })).body.code, "legal_review");
  assert.equal((await call("hs-partner", { cookie: att.cookie, body: { action: "buypack", packId: "packets5" } })).body.code, "legal_review");
  assert.deepEqual((await state(att)).body.packs.map((p) => [p.id, p.credits, p.usd]), [["packets5", 5, 5000], ["packets10", 10, 10000]]);
  assert.deepEqual(s.body.packs.map((p) => [p.id, p.credits, p.usd]), [["calls10", 10, 7500]]);
  const pc = await newCase({ issue: "denied_claim", trades: ["public_adjuster"], zip: "33135" });
  await state(pa);
  assert.ok(!JSON.parse(STORES["hs-cases"].m.get(pc.caseId)).rings?.public_adjuster, "PA off: no ring");
  await admin({ action: "settings", patch: { perLeadEnabled: { public_adjuster: true } } });
  await admin({ action: "grant", proId: pa.id, credits: 1 });
  s = await state(pa);
  assert.ok(s.body.rings.some((r) => r.caseId === pc.caseId), "PA on: rings");
  assert.equal((await call("hs-pro-offer", { cookie: pa.cookie, body: { caseId: pc.caseId, message: "Free request bypass attempt" } })).body.code, "use_desk", "a paid desk cannot take the free path");
  /* Membership on: inactive desks cannot buy or claim. */
  await admin({ action: "settings", patch: { membershipRequired: true, membershipMonthlyUsd: 0 } });
  assert.equal((await call("hs-partner", { cookie: pa.cookie, body: { action: "answerlead", caseId: pc.caseId } })).body.code, "membership_inactive");
  assert.equal((await call("hs-partner", { cookie: pa.cookie, body: { action: "buypack", packId: "calls10" } })).body.code, "membership_inactive");
  await admin({ action: "membership", proId: pa.id, active: true });
  assert.equal((await call("hs-partner", { cookie: pa.cookie, body: { action: "buypack", packId: "calls10" } })).body.code, "payments_off");
  await admin({ action: "settings", patch: { paymentsLive: true } });
  delete process.env.STRIPE_SECRET_KEY;
  assert.equal((await call("hs-partner", { cookie: pa.cookie, body: { action: "buypack", packId: "calls10" } })).body.code, "stripe_not_configured");
  await admin({ action: "settings", patch: { membershipRequired: false, paymentsLive: false, perLeadEnabled: { public_adjuster: false } } });
  R.pa = pa;
});

await test("Stripe webhook: signed with the shop's scheme, credits once, rejects bad signatures and mismatched amounts", async () => {
  process.env.HS_STRIPE_WEBHOOK_SECRET = "whsec_test_partner";
  const ev = (id, amount = 750000) => ({ id: "evt_" + id, type: "checkout.session.completed", livemode: false,
    data: { object: { id: "cs_test_" + id, payment_status: "paid", amount_total: amount, currency: "usd", metadata: { hs: "pack", proId: R.pa.id, packId: "calls10" } } } });
  const send = (e, secret = process.env.HS_STRIPE_WEBHOOK_SECRET) => {
    const raw = JSON.stringify(e), t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", secret).update(`${t}.${raw}`, "utf8").digest("hex");
    return call("hs-stripe-webhook", { raw, headers: { "stripe-signature": `t=${t},v1=${sig}` } });
  };
  const before = ledgerOf(R.pa.id).reduce((n, e) => n + e.credits, 0);
  assert.equal((await send(ev("a"), "whsec_wrong")).status, 400);
  const ok = await send(ev("a"));
  assert.equal(ok.status, 200); assert.equal(ok.body.credited, true);
  assert.equal((await send(ev("a"))).body.credited, false, "replay of the same session does not credit twice");
  assert.equal((await send(ev("b", 100))).body.ignored, "amount_mismatch");
  const after = ledgerOf(R.pa.id);
  assert.equal(after.reduce((n, e) => n + e.credits, 0), before + 10);
  assert.equal(after.filter((e) => e.type === "purchase").length, 1);
  delete process.env.HS_STRIPE_WEBHOOK_SECRET;
  assert.equal((await send(ev("c"), "x")).status, 503);
});

await test("teams: create, invite by code, join, chat, radar; desk uploads stay private", async () => {
  const t = await call("hs-partner", { cookie: R.a.cookie, body: { action: "createteam", name: "Coastline Roofing" } });
  assert.equal(t.status, 200);
  const inv = await call("hs-partner", { cookie: R.a.cookie, body: { action: "addteammember", email: "roofb@correo.test", role: "insurance_agent" } });
  assert.equal((await call("hs-partner", { cookie: R.c.cookie, body: { action: "jointeam", code: inv.body.code } })).body.code, "bad_code", "code is bound to the invited email");
  const j = await call("hs-partner", { cookie: R.b.cookie, body: { action: "jointeam", code: inv.body.code } });
  assert.equal(j.body.team.members.length, 2);
  await call("hs-partner", { cookie: R.b.cookie, body: { action: "postteammessage", text: "On my way to the Miami roof." } });
  const st = await state(R.a);
  assert.equal(st.body.team.messages[0].text, "On my way to the Miami roof.");
  assert.ok(st.body.team.members.every((m) => typeof m.online === "boolean"));
  await call("hs-partner", { cookie: R.b.cookie, body: { action: "setonline", online: false } });
  assert.equal((await state(R.a)).body.team.members.find((m) => m.proId === R.b.id).online, false);
  const pdf = Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64");
  assert.equal((await call("hs-partner", { cookie: R.a.cookie, body: { action: "submitupload", kind: "license", file: { name: "lic.pdf", data: Buffer.from("nope, text").toString("base64") } } })).status, 415);
  const up = await call("hs-partner", { cookie: R.a.cookie, body: { action: "submitupload", kind: "license", file: { name: "lic.pdf", data: pdf } } });
  assert.equal(up.status, 200);
  assert.equal((await call("hs-partner-admin", { method: "GET", query: { doc: up.body.docId } })).status, 403);
  assert.equal((await call("hs-partner-admin", { method: "GET", cookie: ADMIN, query: { doc: up.body.docId } })).status, 200);
});

await test("admin view: partners with balances, ledger is append-only (no edit/delete action)", async () => {
  const g = await call("hs-partner-admin", { method: "GET", cookie: ADMIN });
  assert.ok(g.body.partners.length >= 5 && g.body.partners.every((p) => !("passHash" in p) && "balance" in p));
  assert.ok(g.body.ledger.length >= 4);
  assert.equal((await admin({ action: "delete", id: g.body.ledger[0].id })).body.code, "bad_action");
  noPII(JSON.stringify(g.body.partners), "admin partners");
});

/* FIXTURE router for the storm sources (the sandbox cannot reach NOAA or the Census). */
let pointDown = false;
function stormFixture(url) {
  const fx = (f) => readFileSync(new URL("./fixtures/hs-storm/" + f, import.meta.url), "utf8");
  if (url.includes("geocoding.geo.census.gov")) return /Main%20St/i.test(url) ? fx("census-address-miami.json") : fx("census-nomatch.json");
  const pt = url.match(/alerts\/active\?point=([-\d.]+),([-\d.]+)/);
  if (pt) { if (pointDown) return null; return Number(pt[1]) < 27 ? fx("nws-point-miami.json") : fx("nws-point-tampa.json"); }
  if (url.includes("alerts/active?area=FL")) return fx("nws-alerts-FL.json");
  if (url.includes("today_filtered")) return fx("spc-today.csv");
  if (url.includes("yesterday_filtered")) return fx("spc-yesterday.csv");
  return null;
}

await test("storm data (FIXTURES): NWS alerts filtered to damage events, SPC reports by radius, 15-min cache, stale fallback", async () => {
  const W = await import(FN + "_hs-storm.js");
  const fx = (f) => readFileSync(new URL("./fixtures/hs-storm/" + f, import.meta.url), "utf8");
  const seen = [];
  let down = false;
  W.__setFetch(async (url, o) => {
    seen.push([url, o.headers["User-Agent"]]);
    if (down) throw new Error("network unreachable");
    const body = stormFixture(url);
    return body == null ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
  });
  const r = await call("hs-storm", { method: "GET", cookie: R.a.cookie });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.state, "FL"); assert.equal(r.body.source, "NOAA / NWS / SPC"); assert.equal(r.body.stale, false);
  /* The desk's own area by point (center + N/S/E/W edge for a 50 mi radius), de-duplicated: no Tampa watch for Miami. */
  assert.equal(r.body.scope, "area");
  assert.deepEqual(r.body.alerts.map((a) => a.event), ["Hurricane Warning", "Flash Flood Warning"], "Miami desk: no Tampa Tornado Watch, no duplicates");
  assert.deepEqual(r.body.alerts[0].moving, { toward: "northwest", mph: 12 });
  assert.equal(seen.filter(([u]) => u.includes("alerts/active?point=")).length, 5, "center + 4 edge points");
  assert.ok(JSON.parse(STORES["hs-pros"].m.get(R.a.id)).centerGeo.zip === "33130", "center geocoded once, kept on the pro");
  /* The state-wide parser still filters to damage events. */
  const all = W.parseAlerts(JSON.parse(fx("nws-alerts-FL.json")));
  assert.deepEqual(all.map((a) => a.event), ["Hurricane Warning", "Flash Flood Warning", "Tornado Watch"], "rip current filtered out");
  assert.deepEqual(all[2].moving, { toward: "northeast", mph: 30 });
  assert.equal(r.body.alerts[1].moving, null);
  assert.deepEqual(r.body.counts, { wind: 3, hail: 1, tornado: 1 });
  const locs = r.body.reports.map((x) => x.location);
  for (const far of ["2 S CLEARWATER", "4 E VALDOSTA", "ORLANDO"]) assert.ok(!locs.includes(far), "outside radius: " + far);
  assert.ok(r.body.reports.every((x) => x.miles <= 50));
  assert.equal(r.body.reports[0].day, "today"); assert.equal(r.body.reports.at(-1).location, "FORT LAUDERDALE", "yesterday last");
  assert.equal(r.body.reports.find((x) => x.type === "hail").magnitude, "1.75 in");
  assert.ok(seen.every(([, ua]) => ua === "AriaHomeShield (contact via site)"));
  /* Cached for 15 minutes: no new upstream calls. */
  const n = seen.length;
  await call("hs-storm", { method: "GET", cookie: R.a.cookie });
  assert.equal(seen.length, n);
  /* Upstream down after the TTL: last good copy, stale:true, its time. */
  down = true;
  const S = store.openStores({});
  const st = await W.stormFor(S, { state: "FL", center: { lat: 25.77, lon: -80.21 }, radiusMiles: 50 }, Date.now() + 16 * 60000);
  assert.equal(st.stale, true); assert.ok(st.fetchedAt); assert.deepEqual(st.counts, { wind: 3, hail: 1, tornado: 1 }); assert.ok(st.errors.length);
  /* No good copy ever: empty, stale, honest error -- nothing invented. */
  const none = await W.stormFor(S, { state: "GA", center: { lat: 33.75, lon: -84.39 }, radiusMiles: 50 }, Date.now() + 16 * 60000);
  assert.deepEqual(none.alerts, []); assert.equal(none.stale, true); assert.ok(none.errors[0].includes("unreachable"));
  assert.equal((await call("hs-storm", { method: "GET" })).status, 401);
  W.__setFetch(null);
});

await test("storm search (FIXTURES): address, ZIP and city geocode; point alerts; state fallback labelled", async () => {
  const W = await import(FN + "_hs-storm.js");
  W.__setFetch(async (url) => { const b = stormFixture(url); return b == null ? { ok: false, status: 503 } : { ok: true, status: 200, json: async () => JSON.parse(b), text: async () => b }; });
  const S = store.openStores({});
  const a = await W.geocode(S, "123 Main St, Miami FL");
  assert.deepEqual([a.label, a.approximate, a.source, a.lat], ["123 MAIN ST, MIAMI, FL, 33130", false, "census", 25.7743]);
  const z = await W.geocode(S, "33139");
  assert.deepEqual([z.approximate, z.source, z.state], [true, "zip3", "FL"]); assert.match(z.label, /33139 \(Miami area\)/);
  const c = await W.geocode(S, "Tampa, FL");
  assert.deepEqual([c.label, c.approximate], ["Tampa area, FL", true]);
  assert.equal(await W.geocode(S, "zzzz qqqq"), null);
  const t = await call("hs-storm", { method: "GET", cookie: R.a.cookie, query: { q: "Tampa, FL" } });
  assert.equal(t.status, 200);
  assert.equal(t.body.location.label, "Tampa area, FL"); assert.equal(t.body.location.approximate, true); assert.equal(t.body.query, "Tampa, FL");
  assert.deepEqual(t.body.alerts.map((x) => x.event), ["Tornado Watch"]);
  assert.ok(t.body.reports.some((x) => x.location === "2 S CLEARWATER") && !t.body.reports.some((x) => x.location === "KENDALL"), "reports around the searched point");
  const m = await call("hs-storm", { method: "GET", cookie: R.a.cookie, query: { q: "123 Main St, Miami FL" } });
  assert.equal(m.body.location.label, "123 MAIN ST, MIAMI, FL, 33130"); assert.equal(m.body.location.approximate, false);
  assert.ok(!m.body.alerts.some((x) => x.event === "Tornado Watch"));
  assert.equal((await call("hs-storm", { method: "GET", cookie: R.a.cookie, query: { q: "zzzz qqqq" } })).status, 404);
  /* Point queries down with nothing cached: whole state, scope "state". */
  pointDown = true;
  const f = await W.stormAt(S, { lat: 30.44, lon: -84.28, radiusMiles: 20, state: "FL", label: "Tallahassee" });
  assert.equal(f.scope, "state"); assert.equal(f.alerts.length, 3);
  pointDown = false;
  W.__setFetch(null);
});

await test("insurance agent desk: pending review by default, pricing coming soon until admin sets it, weak policies reach it", async () => {
  const S = store.openStores({});
  assert.equal((await P.readSettings(S)).perLeadEnabled.insurance_agent, false);
  assert.equal((await P.readSettings(S)).packPrices.agent10, null);
  const ag = await desk("agent1@correo.test", "insurance_agent");
  let st = await state(ag);
  assert.equal(st.body.block, "legal_review");
  assert.deepEqual(st.body.packs.map((k) => [k.id, k.credits, k.usd]), [["agent10", 10, null]]);
  assert.equal(st.body.balance.sampleAvailable, false, "no free sample on the agent desk");
  await admin({ action: "settings", patch: { perLeadEnabled: { insurance_agent: true } } });
  assert.equal((await call("hs-partner", { cookie: ag.cookie, body: { action: "buypack", packId: "agent10" } })).body.code, "pricing_soon");
  assert.equal((await admin({ action: "settings", patch: { packPrices: { agent10: -5 } } })).status, 400);
  assert.equal((await admin({ action: "settings", patch: { packPrices: { agent10: 2500 } } })).status, 200);
  assert.equal((await state(ag)).body.packs[0].usd, 2500);
  assert.equal((await call("hs-partner", { cookie: ag.cookie, body: { action: "buypack", packId: "agent10" } })).body.code, "payments_off");
  /* A case with the agent trade rings the agent desk; claim + homeowner share = one debit at pack price / 10. */
  await admin({ action: "grant", proId: ag.id, credits: 1 });
  const c = await newCase({ issue: "policy_review", trades: ["insurance_agent"], zip: "33131" });
  st = await state(ag);
  assert.ok(st.body.rings.some((r) => r.caseId === c.caseId && r.kind === "lead"));
  const a = await call("hs-partner", { cookie: ag.cookie, body: { action: "answerlead", caseId: c.caseId } });
  await call("hs-offer-respond", { body: { caseId: c.caseId, token: c.token, offerId: a.body.offer.id, action: "accept" } });
  const d = ledgerOf(ag.id).filter((e) => e.type === "claim_debit");
  assert.equal(d.length, 1); assert.equal(d[0].credits, -1); assert.equal(d[0].usd, 250);
  /* hs-policy-review marks a weak policy and adds the agent trade (source check; the PDF path is covered in home-shield-tests). */
  assert.match(readFileSync(new URL("../../netlify/functions/hs-policy-review.js", import.meta.url), "utf8"), /policyWeak = true[\s\S]*"insurance_agent"/);
  await admin({ action: "settings", patch: { perLeadEnabled: { insurance_agent: false }, packPrices: { agent10: null } } });
});

await test("wording: displayed text never says roofer / techero / techador / contratista de techos", async () => {
  const FORBID = /\broofers?\b|techero|techador|contratista de techos/i;
  for (const f of ["home-shield/partners/partners.js", "home-shield/partners/admin.html", "home-shield/partners/index.html", "home-shield/pro/pro.js", "home-shield/pro/index.html", "home-shield/admin.html"]) {
    const src = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const strings = [...src.matchAll(/"((?:[^"\\\n]|\\.){3,})"/g)].map((m) => m[1]).filter((x) => /\s/.test(x) || /^[A-ZÁÉÍÓÚ]/.test(x));
    const html = !f.endsWith(".html") ? "" : src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
    for (const x of [...strings, html]) assert.ok(!FORBID.test(x), `${f}: "${String(x).match(FORBID)}" in "${String(x).slice(0, 80)}"`);
  }
  /* Backend-generated copy (emails, area labels) too. */
  for (const f of ["hs-offer-respond.js", "hs-pro-offer.js", "_hs-zip3.js", "_hs-policy.js", "hs-partner.js"]) {
    const src = readFileSync(new URL("../../netlify/functions/" + f, import.meta.url), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    const strings = [...src.matchAll(/["`]((?:[^"`\\\n]|\\.){6,})["`]/g)].map((m) => m[1]).filter((x) => /\s/.test(x));
    for (const x of strings) assert.ok(!FORBID.test(x), `${f}: "${x.slice(0, 80)}"`);
  }
});

await test("EN/ES parity: every dashboard string exists in both languages", async () => {
  for (const f of ["home-shield/partners/partners.js", "home-shield/partners/admin.html"]) {
    const src = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const m = src.match(/var I18N = (\{[\s\S]*?\n  \});/);
    assert.ok(m, f + " has an I18N object");
    const I = vm.runInNewContext("(" + m[1] + ")");
    assert.deepEqual(Object.keys(I.en).sort(), Object.keys(I.es).sort(), f);
    for (const k of Object.keys(I.en)) assert.ok(String(I.es[k]).length && typeof I.es[k] === typeof I.en[k], f + " " + k);
    const used = [...src.matchAll(/\bt\("([a-zA-Z0-9_]+)"\)/g)].map((x) => x[1]);
    for (const k of used) assert.ok(k in I.en, `${f}: t("${k}") missing`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), f + " has no emoji");
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
