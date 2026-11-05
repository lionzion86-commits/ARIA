/* ==================================================================
   ARIA HOME SHIELD -- pro profiles, coverage, the customer pick (#443
   c.6664612623 .. c.6668413152).

     node scripts/test/home-shield-profiles-tests.mjs

   In-process against in-memory Blobs. Coverage math (license ceiling +
   self-set range), customer privacy (no city / base ZIP / miles /
   distance / contact), order never by distance, only verified + complete
   listed, the pick (talk-first, ping, one per trade, ineligible 403,
   represented block), EXIF GPS refused, gallery order/main, feed and
   ringing on coverage, EN/ES parity of the new UI files.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).slice(0, 500)} ${String(e.stack).split("\n").find((l) => l.includes("profiles-tests")) || ""}`); console.log("    FAIL " + name); }
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
const fnOf = (m) => m.default || m.handler;
const FN = "../../netlify/functions/";
const store = await import(FN + "_hs-store.js");
const PR = await import(FN + "_hs-profiles.js");
const PT = await import(FN + "_hs-partners.js");
const STORES = {};
store.__setStoreFactory((n) => (STORES[n] ||= memStore()));
store.__setMailer(async () => ({ sent: false }));
process.env.ADMIN_EMAILS = "danny@correo.test";
STORES.sessions = memStore();
await STORES.sessions.setJSON("adm", { email: "danny@correo.test", createdAt: new Date().toISOString() });
const ADMIN = "aria_session=adm";
const H = {};
for (const n of ["hs-pro-signup", "hs-admin-verify", "hs-case-create", "hs-case-status", "hs-pro-profile-self", "hs-pro-photo-upload", "hs-pro-photo-delete",
  "hs-pro-photo-order", "hs-profile-photo", "hs-pros-for-case", "hs-pro-profile", "hs-case-pick", "hs-pro-feed", "hs-partner", "hs-partner-admin", "hs-case-messages", "hs-offer-respond"]) H[n] = fnOf(await import(FN + n + ".js"));
let ip = 0;
async function call(n, { method = "POST", body, query, cookie } = {}) {
  const r = await H[n]({ httpMethod: method, headers: { "x-nf-client-connection-ip": `10.8.${ip >> 8 & 255}.${ip++ & 255}`, cookie: cookie || "" }, queryStringParameters: query || {}, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers && r.headers["Set-Cookie"];
  return { status: r.statusCode, body: r.isBase64Encoded ? null : JSON.parse(r.body || "{}"), raw: r.body, bin: r.isBase64Encoded ? Buffer.from(r.body, "base64") : null, headers: r.headers || {}, cookie: sc ? sc.split(";")[0] : null };
}
/* TEST FIXTURE images (not photos of anything): a minimal JPEG header and one with an Exif GPS pointer. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02]), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]);
function jpegWithGps(le = false) {
  const tiff = le ? Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0, 0x01, 0x00, 0x25, 0x88, 0x04, 0x00, 1, 0, 0, 0, 0x1a, 0, 0, 0])
    : Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 0x08, 0x00, 0x01, 0x88, 0x25, 0x00, 0x04, 0, 0, 0, 1, 0, 0, 0, 0x1a]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, JPEG.subarray(2)]);
}
const ph = (buf = JPEG) => ({ card: { data: buf.toString("base64"), w: 480, h: 360 }, full: { data: buf.toString("base64"), w: 1600, h: 1200 } });
const ABOUT = "We have repaired storm-damaged roofs across South Florida for two decades, and we walk every homeowner through the claim photos first.";

async function makePro(email, { trade = "roofer", desk = null, zip = "33130", radius = 50, state = "FL", verify = true } = {}) {
  const r = await call("hs-pro-signup", { body: { email, password: "correct horse battery", name: "Pro " + email.split("@")[0], phone: "7865550100", attest: true,
    ...(desk ? { desk } : { trades: [trade] }), licenseType: trade === "attorney" ? "attorney" : trade === "public_adjuster" ? "public_adjuster" : trade === "insurance_agent" ? "insurance_agent" : "roofing_contractor",
    licenseNumber: "LIC" + email.length + "X" + trade.length, licenseState: state, serviceArea: { centerZip: zip, radiusMiles: radius } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  if (verify) await call("hs-admin-verify", { cookie: ADMIN, body: { proId: r.body.pro.id, verified: true } });
  return { id: r.body.pro.id, cookie: r.cookie };
}
async function completeProfile(p, over = {}, photos = 1) {
  for (let i = 0; i < photos; i++) assert.equal((await call("hs-pro-photo-upload", { cookie: p.cookie, body: ph() })).status, 200);
  const r = await call("hs-pro-profile-self", { cookie: p.cookie, body: { profile: { kind: "individual", displayName: "Name " + p.id.slice(-4), trade: "roofer", yearsInBusiness: 12, about: ABOUT, specialties: ["Tile roofs", "Wind claims"], ...over } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
const newCase = async (over = {}, contact = {}) => (await call("hs-case-create", { body: { consent: true,
  caseDraft: { issue: "roof", trades: ["roofer"], zip: "32801", urgency: "soon", summary: "Shingles lifted after the storm.", ...over },
  contact: { name: "Rosa Delgado", phone: "(305) 555-0177", email: "rosa.d@correo.test", ...contact } } })).body;
const FORBID_KEYS = ["city", "baseZip", "miles", "distance", "radiusMiles", "centerZip", "serviceArea", "range", "licenseStates", "phone", "email", "address", "zip"];
function assertCustomerSafe(obj, where) {
  const walk = (o, path) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) { assert.ok(!FORBID_KEYS.includes(k), `${where}: key "${k}" at ${path}`); walk(v, path + "." + k); }
  };
  walk(obj, "$");
  const s = JSON.stringify(obj);
  for (const n of ["33130", "33139", "Miami", "Orlando", "7865550100", "+1786", "correo.test", "mi ", "miles"]) assert.ok(!s.includes(n), `${where} leaked ${n}`);
}

console.log("  Home Shield pro profiles + coverage + pick");
const P = {};

await test("coverage math: statewide FL (base Miami) covers Orlando; 50-mile Miami does not; out-of-state license does not; range never exceeds license states", async () => {
  const josh = { licenseStates: ["FL"], range: { mode: "statewide" } };
  const near = { licenseStates: ["FL"], range: { mode: "radius", baseZip: "33130", miles: 50 } };
  const ga = { licenseStates: ["GA"], range: { mode: "statewide" } };
  const wide = { licenseStates: ["FL"], range: { mode: "radius", baseZip: "33130", miles: 500 } };
  assert.equal(PR.coverageCovers(josh, "32801", "FL"), true);
  assert.equal(PR.coverageCovers(near, "32801", "FL"), false);
  assert.equal(PR.coverageCovers(near, "33139", "FL"), true);
  assert.equal(PR.coverageCovers(ga, "32801", "FL"), false);
  assert.equal(PR.coverageCovers(wide, "30303", "GA"), false, "500 miles reaches Atlanta but the license does not");
  /* Migration: serviceArea -> radius range, licenseState -> licenseStates. */
  assert.deepEqual(PR.coverageOf({ licenseState: "FL", serviceArea: { centerZip: "33130", radiusMiles: 25 } }), { licenseStates: ["FL"], range: { mode: "radius", baseZip: "33130", miles: 25 } });
  assert.ok(PR.validateCoverage({ licenseStates: ["FL"], range: { mode: "radius", baseZip: "33130", miles: 5 } }).error);
  assert.ok(PR.validateCoverage({ licenseStates: [], range: { mode: "statewide" } }).error);
});

await test("desk profile: completeness meter, coverage save migrates the record, preview is the customer card", async () => {
  P.josh = await makePro("josh@correo.test", { desk: "roofer" });
  let s = await call("hs-pro-profile-self", { method: "GET", cookie: P.josh.cookie });
  assert.equal(s.body.complete, false);
  assert.deepEqual(s.body.missing, ["mainPhoto", "displayName", "trade", "yearsInBusiness", "about"]);
  assert.deepEqual(s.body.coverage, { licenseStates: ["FL"], range: { mode: "radius", baseZip: "33130", miles: 50 } }, "migrated on read");
  assert.equal((await call("hs-pro-profile-self", { cookie: P.josh.cookie, body: { profile: { yearsInBusiness: 99 } } })).status, 400);
  s = await call("hs-pro-profile-self", { cookie: P.josh.cookie, body: { profile: { kind: "firm", displayName: "Coastline Roofing", firmName: "Coastline Roofing LLC", trade: "roofer", yearsInBusiness: 18, about: "Too short" } } });
  assert.deepEqual(s.body.missing, ["mainPhoto", "about"]);
  const b = await completeProfile(P.josh, { kind: "firm", displayName: "Coastline Roofing", firmName: "Coastline Roofing LLC", yearsInBusiness: 18, philosophy: "Photos first, then the claim." }, 3);
  assert.equal(b.complete, true); assert.deepEqual(b.missing, []);
  s = await call("hs-pro-profile-self", { cookie: P.josh.cookie, body: { coverage: { licenseStates: ["FL"], range: { mode: "statewide" } } } });
  assert.deepEqual(s.body.coverage, { licenseStates: ["FL"], range: { mode: "statewide" } });
  const rec = JSON.parse(STORES["hs-pros"].m.get(P.josh.id));
  assert.deepEqual(rec.range, { mode: "statewide" }); assert.deepEqual(rec.licenseStates, ["FL"]);
  assert.equal(s.body.preview.card.displayName, "Coastline Roofing");
  assertCustomerSafe(s.body.preview, "desk preview");
});

await test("gallery: upload, reorder, pick main, delete; EXIF GPS refused (both byte orders); bad type refused; 12 max", async () => {
  let s = (await call("hs-pro-profile-self", { method: "GET", cookie: P.josh.cookie })).body;
  const ids = s.profile.photos.map((p) => p.id);
  assert.equal(ids.length, 3); assert.equal(s.profile.photos.filter((p) => p.main).length, 1); assert.equal(s.profile.photos[0].main, true);
  for (const le of [false, true]) {
    const g = await call("hs-pro-photo-upload", { cookie: P.josh.cookie, body: ph(jpegWithGps(le)) });
    assert.equal(g.status, 422); assert.equal(g.body.code, "exif_gps");
  }
  assert.equal(PR.jpegHasGps(JPEG), false);
  assert.equal((await call("hs-pro-photo-upload", { cookie: P.josh.cookie, body: ph(Buffer.from("not an image at all, just text")) })).status, 415);
  const o = await call("hs-pro-photo-order", { cookie: P.josh.cookie, body: { order: [ids[2], ids[0], ids[1]], main: ids[1] } });
  assert.deepEqual(o.body.profile.photos.map((p) => p.id), [ids[2], ids[0], ids[1]]);
  assert.deepEqual(o.body.profile.photos.map((p) => p.main), [false, false, true]);
  assert.equal((await call("hs-pro-photo-order", { cookie: P.josh.cookie, body: { order: [ids[0]] } })).status, 400);
  const d = await call("hs-pro-photo-delete", { cookie: P.josh.cookie, body: { photoId: ids[1] } });
  assert.equal(d.body.profile.photos.length, 2); assert.equal(d.body.profile.photos.filter((p) => p.main).length, 1, "a new main is chosen");
  assert.ok(![...STORES["hs-profile-photos"].m.keys()].some((k) => k.includes(ids[1])), "bytes removed");
  for (let i = 0; i < 10; i++) await call("hs-pro-photo-upload", { cookie: P.josh.cookie, body: ph() });
  assert.equal((await call("hs-pro-photo-upload", { cookie: P.josh.cookie, body: ph() })).body.code, "too_many");
});

await test("customer list: only verified + complete + covering; privacy (no city, base ZIP, miles, distance, contact)", async () => {
  P.near = await makePro("near@correo.test", { desk: "roofer" });            // 50 mi Miami: does NOT cover Orlando
  await completeProfile(P.near, { displayName: "Near Roofing" });
  P.orl = await makePro("orl@correo.test", { desk: "roofer", zip: "32801", radius: 25 });
  await completeProfile(P.orl, { displayName: "Basic Roofing Co", yearsInBusiness: 2 });
  P.incomplete = await makePro("inc@correo.test", { desk: "roofer", zip: "32801" });
  await call("hs-pro-photo-upload", { cookie: P.incomplete.cookie, body: ph() });
  P.unverified = await makePro("unv@correo.test", { desk: "roofer", zip: "32801", verify: false });
  await completeProfile(P.unverified, { displayName: "Unverified Roofing" });
  P.case = await newCase();
  const r = await call("hs-pros-for-case", { method: "GET", query: { c: P.case.caseId, t: P.case.token, trade: "roofer" } });
  assert.equal(r.status, 200);
  const ids = r.body.pros.map((p) => p.proId);
  assert.ok(ids.includes(P.josh.id), "statewide Josh listed for Orlando");
  assert.ok(ids.includes(P.orl.id));
  assert.ok(!ids.includes(P.near.id), "50-mile Miami pro not listed");
  assert.ok(!ids.includes(P.incomplete.id) && !ids.includes(P.unverified.id));
  assertCustomerSafe(r.body, "hs-pros-for-case");
  assert.equal(r.body.pros[0].location, "licensed_in_area");
  const full = await call("hs-pro-profile", { method: "GET", query: { p: P.josh.id, c: P.case.caseId, t: P.case.token } });
  assert.equal(full.status, 200); assert.equal(full.body.profile.about, ABOUT); assert.ok(full.body.profile.gallery.length >= 2);
  assertCustomerSafe(full.body, "hs-pro-profile");
  assert.equal((await call("hs-pro-profile", { method: "GET", query: { p: P.near.id, c: P.case.caseId, t: P.case.token } })).status, 404, "not covering this case");
  assert.equal((await call("hs-pros-for-case", { method: "GET", query: { c: P.case.caseId, t: "0".repeat(64), trade: "roofer" } })).status, 404);
  /* Photo endpoint: listed pro serves; incomplete / unverified 404 publicly, owner and admin may preview. */
  const main = full.body.profile.gallery[0];
  const img = await call("hs-profile-photo", { method: "GET", query: { p: P.josh.id, i: main.id, s: "card" } });
  assert.equal(img.status, 200); assert.ok(img.bin.length > 10); assert.match(img.headers["Cache-Control"], /private, max-age=300/);
  const incPhoto = JSON.parse(STORES["hs-pros"].m.get(P.incomplete.id)).profile.photos[0].id;
  assert.equal((await call("hs-profile-photo", { method: "GET", query: { p: P.incomplete.id, i: incPhoto, s: "card" } })).status, 404);
  assert.equal((await call("hs-profile-photo", { method: "GET", cookie: P.incomplete.cookie, query: { p: P.incomplete.id, i: incPhoto, s: "card" } })).status, 200, "owner preview");
  assert.equal((await call("hs-profile-photo", { method: "GET", cookie: ADMIN, query: { p: P.incomplete.id, i: incPhoto, s: "full" } })).status, 200, "admin");
  const unvPhoto = JSON.parse(STORES["hs-pros"].m.get(P.unverified.id)).profile.photos[0].id;
  assert.equal((await call("hs-profile-photo", { method: "GET", query: { p: P.unverified.id, i: unvPhoto, s: "card" } })).status, 404);
});

await test("order is best fit, never nearest: a nearer weaker pro ranks below a farther stronger one; stable per case, rotates across cases", async () => {
  /* Basic Roofing Co (base Orlando, 2 yrs, 1 photo) is nearer the Orlando case than Josh (Miami, statewide, 18 yrs, rich). */
  const r = await call("hs-pros-for-case", { method: "GET", query: { c: P.case.caseId, t: P.case.token, trade: "roofer" } });
  const ids = r.body.pros.map((p) => p.proId);
  assert.ok(ids.indexOf(P.josh.id) < ids.indexOf(P.orl.id), "stronger farther pro first");
  const again = await call("hs-pros-for-case", { method: "GET", query: { c: P.case.caseId, t: P.case.token, trade: "roofer" } });
  assert.deepEqual(again.body.pros.map((p) => p.proId), ids, "stable for the same case");
  /* Two equal pros: the tie is a per-case shuffle, so across many cases each is sometimes first. */
  const a = { id: "p_" + "a".repeat(24), verified: true, trades: ["roofer"], profile: { trade: "roofer", yearsInBusiness: 5, about: ABOUT, photos: [{ id: "f_1", main: true }] } };
  const b = { ...a, id: "p_" + "b".repeat(24) };
  const firsts = new Set();
  for (let i = 0; i < 20; i++) firsts.add(PR.orderPros([a, b], { id: "c_" + String(i).padStart(24, "0") }, "roofer")[0].id);
  assert.equal(firsts.size, 2);
  assert.ok(!/distance|miles|baseZip/.test(PR.orderPros.toString()), "distance is not an input to order");
});

await test("pick: talk-first record, pro pinged, one per trade (409), ineligible 403, nothing shared until the customer says so", async () => {
  const c = P.case;
  assert.equal((await call("hs-case-pick", { body: { caseId: c.caseId, token: c.token, proId: P.near.id, trade: "roofer" } })).status, 403);
  assert.equal((await call("hs-case-pick", { body: { caseId: c.caseId, token: c.token, proId: P.unverified.id, trade: "roofer" } })).status, 403);
  const k = await call("hs-case-pick", { body: { caseId: c.caseId, token: c.token, proId: P.josh.id, trade: "roofer" } });
  assert.equal(k.status, 200, JSON.stringify(k.body));
  assert.deepEqual([k.body.offer.status, k.body.offer.origin], ["accepted_talk_first", "customer_pick"]);
  assert.equal((await call("hs-case-pick", { body: { caseId: c.caseId, token: c.token, proId: P.orl.id, trade: "roofer" } })).body.code, "already_picked");
  assert.ok([...STORES["hs-events"].m.keys()].some((x) => x.startsWith(`pro/${P.josh.id}/`) && JSON.parse(STORES["hs-events"].m.get(x)).type === "picked"));
  const list = await call("hs-pros-for-case", { method: "GET", query: { c: c.caseId, t: c.token, trade: "roofer" } });
  assert.equal(list.body.picked, P.josh.id);
  /* The pro sees the pick on the desk, with no contact; the talk-first thread is open. */
  const feed = await call("hs-pro-feed", { method: "GET", cookie: P.josh.cookie });
  assert.equal(feed.body.offers.find((o) => o.caseId === c.caseId).status, "accepted_talk_first");
  assert.ok(!feed.raw.includes("Rosa") && !feed.raw.includes("555-0177"));
  const desk = await call("hs-partner", { method: "GET", cookie: P.josh.cookie });
  const cl = desk.body.claims.find((x) => x.caseId === c.caseId);
  assert.equal(cl.picked, true); assert.equal(cl.contactShared, false);
  assert.equal((await call("hs-case-messages", { cookie: P.josh.cookie, body: { caseId: c.caseId, text: "Thanks for choosing us. When can we look at the roof?" } })).status, 200);
  /* Sharing: the roofer desk is billable, so the share is paid from a credit (granted here), then contact flows. */
  await call("hs-partner-admin", { cookie: ADMIN, body: { action: "grant", proId: P.josh.id, credits: 1 } });
  const share = await call("hs-offer-respond", { body: { caseId: c.caseId, token: c.token, offerId: k.body.offer.id, action: "share_contact" } });
  assert.equal(share.status, 200, JSON.stringify(share.body));
  const after = await call("hs-pro-feed", { method: "GET", cookie: P.josh.cookie });
  assert.equal(after.body.connected[0].contact.email, "rosa.d@correo.test");
});

await test("represented homeowner cannot pick a billable desk; feed and ringing use coverage (statewide pro rings for Orlando)", async () => {
  const rep = await newCase({ represented: true, zip: "32803" });
  assert.equal((await call("hs-case-pick", { body: { caseId: rep.caseId, token: rep.token, proId: P.orl.id, trade: "roofer" } })).body.code, "represented");
  /* Feed: the statewide desk sees an Orlando case; the 50-mile Miami desk does not. */
  const oc = await newCase({ zip: "32804" });
  const f1 = await call("hs-pro-feed", { method: "GET", cookie: P.josh.cookie });
  const f2 = await call("hs-pro-feed", { method: "GET", cookie: P.near.cookie });
  assert.ok(f1.body.cases.some((x) => x.id === oc.caseId)); assert.ok(!f2.body.cases.some((x) => x.id === oc.caseId));
  /* Ringing: with only Josh online among covering desks, the Orlando lead rings him. */
  await call("hs-partner-admin", { cookie: ADMIN, body: { action: "grant", proId: P.josh.id, credits: 2 } });
  await call("hs-partner", { cookie: P.josh.cookie, body: { action: "setonline", online: true } });
  await call("hs-partner", { cookie: P.near.cookie, body: { action: "setonline", online: true } });
  const s = await call("hs-partner", { method: "GET", cookie: P.josh.cookie });
  assert.ok(s.body.rings.some((r) => r.caseId === oc.caseId) || (s.body.ring && s.body.ring.caseId === oc.caseId), "statewide desk rings for Orlando");
  const n = await call("hs-partner", { method: "GET", cookie: P.near.cookie });
  assert.ok(!(n.body.rings || [n.body.ring]).some((r) => r && r.caseId === oc.caseId));
});

await test("EN/ES parity and no emoji in the new UI files; no distance control on the customer side", async () => {
  for (const f of ["home-shield/hs-pros.js", "home-shield/pro/profile-editor.js"]) {
    const src = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const m = src.match(/var I18N = (\{[\s\S]*?\n  \});/);
    assert.ok(m, f + " has an I18N object");
    const I = vm.runInNewContext("(" + m[1] + ")");
    assert.deepEqual(Object.keys(I.en).sort(), Object.keys(I.es).sort(), f);
    for (const k of Object.keys(I.en)) assert.ok(String(I.es[k]).length, f + " es." + k);
    const used = [...src.matchAll(/\bt\("([a-zA-Z0-9_]+)"\)/g)].map((x) => x[1]);
    for (const k of used) assert.ok(k in I.en, `${f}: t("${k}") missing`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), f + " emoji");
  }
  const cust = readFileSync(new URL("../../home-shield/hs-pros.js", import.meta.url), "utf8");
  assert.ok(!/distance|miles|millas|nearest|sort|baseZip/i.test(cust.replace(/\/\*[\s\S]*?\*\//g, "")), "no distance / sort on the customer side");
});

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
