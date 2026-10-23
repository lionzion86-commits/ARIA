/* ==================================================================
   THE RECIPIENT'S DNI PHOTOS -- storage, reuse and retention (#443,
   embarque brief + Danny's storage & retention rules, 2026-10-22).

   No network, no real photo: every image here is a TEST FIXTURE of
   random pixels. The stores are in-memory stand-ins for Netlify Blobs.

     node scripts/test/dni-docs-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import jpegjs from "jpeg-js";
import * as D from "../../netlify/functions/_dni-docs.js";
import { runPurge, deliveredAtFor } from "../../netlify/functions/dni-purge.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}

function memStore() {
  const m = new Map();
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
const stores = () => ({ docs: memStore(), packs: memStore() });
/* TEST FIXTURE: random pixels, not a document. */
function photo(w = 160, h = 110) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 7919 + (i >> 5) * 104729) % 251;
  return jpegjs.encode({ data, width: w, height: h }, 90).data.toString("base64");
}
async function upload(S, side, owner = null, now = Date.now()) {
  const v = D.validateUpload({ side, data: photo() });
  assert.ok(v.ok, v.error);
  return D.saveUpload(S.docs, { side, ...v }, { owner, now });
}
const DAY = 864e5;

console.log("\n  DNI photos -- upload checks");

await check("a phone JPEG passes; a non-image, a tiny capture, an oversize file and a missing side do not", () => {
  const ok = D.validateUpload({ side: "front", data: "data:image/jpeg;base64," + photo() });
  assert.equal(ok.ok, true);
  assert.equal(ok.contentType, "image/jpeg");
  assert.match(D.validateUpload({ side: "front", data: Buffer.from("<html>" + "x".repeat(20000)).toString("base64") }).error, /no es una foto/);
  assert.match(D.validateUpload({ side: "front", data: photo(8, 8) }).error, /vacía|pequeña/);
  assert.match(D.validateUpload({ side: "front", data: Buffer.alloc(D.MAX_UPLOAD_BYTES + 10, 1).toString("base64") }).error, /pesada/);
  assert.match(D.validateUpload({ side: "middle", data: photo() }).error, /frente o del reverso/);
  assert.match(D.validateUpload({ side: "back", data: "not base64 !!" }).error, /dañada/);
});

await check("ids are 128 random bits; document numbers normalise to the courier's form", () => {
  const a = D.newDocId(), b = D.newDocId();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.notEqual(a, b);
  assert.equal(D.normalizeDocNumber(" 4567 8912 "), "45678912");
  assert.equal(D.normalizeDocNumber("ce-001234567"), "CE001234567");
  assert.equal(D.normalizeDocNumber("123"), null);
});

console.log("\n  DNI photos -- attaching to an order");

await check("a guest's fresh front + back attach to the order; a swapped side, a stale upload or a missing one is refused", async () => {
  const S = stores(), now = Date.now();
  const front = await upload(S, "front"), back = await upload(S, "back");
  const r = await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "45678912", now });
  assert.deepEqual([r.ok, r.source, r.docNumber], [true, "upload", "45678912"]);
  assert.match((await D.resolveOrderDocs(S, { upload: { front: back, back: front }, docNumber: "45678912", now })).error, /frente/);
  assert.match((await D.resolveOrderDocs(S, { upload: { front, back: null }, docNumber: "45678912", now })).error, /reverso/);
  assert.match((await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "45678912", now: now + 3 * DAY })).error, /venció/);
  assert.match((await D.resolveOrderDocs(S, { upload: null, docNumber: "45678912", now })).error, /Sube las fotos/);
  assert.match((await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "", now })).error, /número de documento/);
});

await check("a member's photo is only that member's", async () => {
  const S = stores();
  const front = await upload(S, "front", "ana@correo.test"), back = await upload(S, "back", "ana@correo.test");
  assert.equal((await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "45678912", owner: "ana@correo.test" })).ok, true);
  assert.match((await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "45678912", owner: "otro@correo.test" })).error, /no es de esta cuenta/);
  assert.match((await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "45678912", owner: null })).error, /no es de esta cuenta/);
});

console.log("\n  Key Club -- register once");

await check("a member's first order registers the pack; the next order reuses it with no upload", async () => {
  const S = stores(), email = "ana@correo.test";
  const front = await upload(S, "front", email), back = await upload(S, "back", email);
  await D.attachToOrder(S, { front, back, orderId: "ARIA-1", docNumber: "45678912", name: "Ana Torres", owner: email, source: "upload" });
  assert.deepEqual((await D.listPack(S.packs, email)).map((r) => [r.docNumber, r.name]), [["45678912", "Ana Torres"]]);
  const again = await D.resolveOrderDocs(S, { upload: null, docNumber: "4567 8912", owner: email });
  assert.deepEqual([again.ok, again.source, again.front, again.back], [true, "keyclub", front, back]);
  assert.equal((await D.resolveOrderDocs(S, { upload: null, docNumber: "45678912", owner: "otro@correo.test" })).ok, false, "another account reused the pack");
  const listed = JSON.stringify(await D.listPack(S.packs, email));
  assert.ok(!listed.includes(front) && !listed.includes(back), "the account list exposes photo ids");
});

await check("an alternate recipient is a second pack; replacing a pack deletes the old photos", async () => {
  const S = stores(), email = "ana@correo.test";
  const f1 = await upload(S, "front", email), b1 = await upload(S, "back", email);
  await D.registerPack(S, email, { docNumber: "45678912", name: "Ana", front: f1, back: b1 });
  const f2 = await upload(S, "front", email), b2 = await upload(S, "back", email);
  await D.registerPack(S, email, { docNumber: "11112222", name: "Mamá", front: f2, back: b2 });
  assert.equal((await D.listPack(S.packs, email)).length, 2);
  const f3 = await upload(S, "front", email), b3 = await upload(S, "back", email);
  await D.registerPack(S, email, { docNumber: "45678912", name: "Ana (renovado)", front: f3, back: b3 });
  assert.equal(await S.docs.get(`img:${f1}`), null, "the replaced front photo was kept");
  assert.equal(await S.docs.get(`img:${b1}`), null, "the replaced back photo was kept");
  assert.equal((await D.packFor(S.packs, email, "45678912")).front, f3);
});

await check("deleting a pack deletes its photos, except those an undelivered order still needs (they fall to the guest rule)", async () => {
  const S = stores(), email = "ana@correo.test";
  const f = await upload(S, "front", email), b = await upload(S, "back", email);
  await D.attachToOrder(S, { front: f, back: b, orderId: "ARIA-9", docNumber: "45678912", name: "Ana", owner: email, source: "upload" });
  const f2 = await upload(S, "front", email), b2 = await upload(S, "back", email);
  await D.registerPack(S, email, { docNumber: "11112222", name: "Mamá", front: f2, back: b2 });
  assert.equal(await D.deletePack(S, email, null), 2);
  assert.deepEqual(await D.listPack(S.packs, email), []);
  assert.equal(await S.docs.get(`img:${f2}`), null, "an unused pack photo survived deletion");
  assert.equal((await S.docs.get(`meta:${f}`, { type: "json" })).retention, "order", "an order's photo lost its retention");
});

console.log("\n  Retention -- the daily purge");

await check("purgeDecision: 48 h for an abandoned upload, 30 days after delivery, 7 days for an unpaid order, members while the account lives", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  const iso = (d) => new Date(now - d * DAY).toISOString();
  const guest = (extra) => ({ id: "x", retention: "order", uploadedAt: iso(40), orderIds: ["A"], ...extra });
  assert.equal(D.purgeDecision({ retention: "order", uploadedAt: iso(1), orderIds: [] }, { now }).action, "keep");
  assert.equal(D.purgeDecision({ retention: "order", uploadedAt: iso(3), orderIds: [] }, { now }).action, "delete");
  assert.equal(D.purgeDecision(guest(), { now, orders: { A: { status: "paid", createdAt: iso(40), deliveredAt: iso(29) } } }).action, "keep");
  assert.equal(D.purgeDecision(guest(), { now, orders: { A: { status: "paid", createdAt: iso(60), deliveredAt: iso(31) } } }).action, "delete");
  assert.equal(D.purgeDecision(guest(), { now, orders: { A: { status: "paid", createdAt: iso(90), deliveredAt: null } } }).action, "keep", "an undelivered order lost its photos");
  assert.equal(D.purgeDecision(guest(), { now, orders: { A: { status: "pending_payment", createdAt: iso(8), deliveredAt: null } } }).action, "delete");
  assert.equal(D.purgeDecision(guest({ orderIds: ["A", "B"] }), { now, orders: { A: { status: "paid", createdAt: iso(60), deliveredAt: iso(40) }, B: { status: "paid", createdAt: iso(5), deliveredAt: null } } }).action, "keep", "one order done, another still needs it");
  assert.equal(D.purgeDecision({ retention: "member", owner: "a@b.test", uploadedAt: iso(400), orderIds: [] }, { now, memberExists: true }).action, "keep");
  assert.equal(D.purgeDecision({ retention: "member", owner: "a@b.test", uploadedAt: iso(400), orderIds: [] }, { now, memberExists: false }).action, "delete");
});

await check("runPurge over the store: reads delivery from the shipments, deletes image and metadata together, logs no personal data", async () => {
  const S = stores(), now = Date.parse("2026-12-01T00:00:00Z");
  const oldGuest = await upload(S, "front", null, now - 60 * DAY);
  const recentGuest = await upload(S, "back", null, now - 60 * DAY);
  const abandoned = await upload(S, "front", null, now - 3 * DAY);
  const member = await upload(S, "front", "ana@correo.test", now - 90 * DAY);
  const gone = await upload(S, "back", "ex@correo.test", now - 90 * DAY);
  for (const [id, orderId] of [[oldGuest, "ARIA-OLD"], [recentGuest, "ARIA-NEW"]]) {
    const meta = await S.docs.get(`meta:${id}`, { type: "json" });
    await S.docs.setJSON(`meta:${id}`, { ...meta, orderIds: [orderId] });
  }
  const orders = memStore(), users = memStore();
  await orders.setJSON("ARIA-OLD", { status: "paid", createdAt: new Date(now - 60 * DAY).toISOString() });
  await orders.setJSON("ARIA-NEW", { status: "paid", createdAt: new Date(now - 60 * DAY).toISOString() });
  await users.setJSON("ana@correo.test", { email: "ana@correo.test" });
  const shipments = [
    { orderIds: ["ARIA-OLD"], statusHistory: [{ status: "delivered", at: new Date(now - 45 * DAY).toISOString() }] },
    { orderIds: ["ARIA-NEW"], deliveredAt: new Date(now - 10 * DAY).toISOString() },
  ];
  assert.equal(deliveredAtFor("ARIA-NEW", shipments), shipments[1].deliveredAt);
  const tally = await runPurge({ docs: S.docs, orders, users, shipments, now });
  assert.deepEqual([tally.deleted, tally.kept], [3, 2]);
  for (const id of [oldGuest, abandoned, gone]) {
    assert.equal(await S.docs.get(`img:${id}`), null, "a photo past its retention was kept");
    assert.equal(await S.docs.get(`meta:${id}`), null);
  }
  for (const id of [recentGuest, member]) assert.ok(await S.docs.get(`img:${id}`), "a photo still within its retention was deleted");
  assert.ok(!/@|ARIA-|[a-f0-9]{32}/.test(JSON.stringify(tally)), "the purge tally carries personal data or ids");
});

console.log("\n  Wiring");

await check("photos are never served from the site: own store, no public path, hidden-docs blocked", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /from = "\/hidden-docs\/\*"\s+to = "\/404"\s+status = 404\s+force = true/);
  const pack = readFileSync(ROOT + "netlify/functions/dni-pack.js", "utf8");
  assert.match(pack, /"Cache-Control": "private, no-store"/);
  assert.match(pack, /getSessionEmail\(event\)/, "the photo endpoint is not session-scoped");
  const purge = readFileSync(ROOT + "netlify/functions/dni-purge.js", "utf8");
  assert.match(purge, /export const config = \{ schedule: "@daily" \}/);
});

await check("Key Club invite: photos uploaded as a guest, then an account created before Pagar, become the account's pack and are never purged under the guest rule", async () => {
  const S = stores();
  const t0 = Date.now();
  const front = await upload(S, "front", null, t0), back = await upload(S, "back", null, t0);
  const r = await D.resolveOrderDocs(S, { upload: { front, back }, docNumber: "45678912", owner: "nueva@correo.test", now: t0 });
  assert.ok(r.ok, r.error);
  await D.attachToOrder(S, { front, back, orderId: "ARIA-1", docNumber: "45678912", name: "Nueva", owner: "nueva@correo.test", source: r.source, now: t0 });
  assert.ok(await D.packFor(S.packs, "nueva@correo.test", "45678912"), "pack not registered");
  const meta = JSON.parse(S.docs.m.get(`meta:${front}`));
  assert.equal(meta.owner, "nueva@correo.test");
  assert.equal(meta.retention, "member");
  const later = D.purgeDecision(meta, { now: t0 + 90 * DAY, orders: { "ARIA-1": { status: "confirmed", createdAt: new Date(t0).toISOString(), deliveredAt: new Date(t0 + 10 * DAY).toISOString() } } });
  assert.equal(later.action, "keep", later.reason);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
