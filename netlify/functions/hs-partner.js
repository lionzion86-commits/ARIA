// ARIA HOME SHIELD -- hs-partner. The partner desk (roofer / public adjuster / attorney).
// Sign-up and sign-in reuse hs-pro-signup (with `desk`) and hs-pro-login; this is the desk itself.
//
//   GET  -> { pro, desk, kind, settings: { membershipRequired, membershipMonthlyUsd, paymentsLive, perLeadEnabled, ringSeconds },
//             membership: { required, active }, block, balance: { credits, held, available, sampleAvailable },
//             packs: [{ id, kind, credits, usd }], ledger: [...last 50], ring: { caseId, kind, expiresAt, case } | null,
//             queue: [{ caseId, status, since, case }],   // unanswered leads in your area: nothing rots silently
//             claims: [{ offerId, caseId, status, paid, sample, case, contact? }], team, now }
//     (GET is also the radar heartbeat while online, and advances every ring.)
//   POST { action, ... }:
//     buypack { packId }                    -> { url }  Stripe Checkout (paymentsLive only)
//     answerlead | claimpacket { caseId }   -> { offer }   holds one credit; billed only on a verified claim
//     passlead | passpacket { caseId }      -> { passed }  free; re-rings the next desk
//     setonline { online }                  -> { online }
//     createteam { name }                   -> { team }
//     addteammember { email, role? }        -> { code }    invite code for that email
//     jointeam { code }                     -> { team }
//     postteammessage { text }              -> { message }
//     submitupload { kind: "license"|"insurance_certificate", file: { name, type, data } } -> { docId }
// Contact for a claimed case appears in `claims` ONLY when the homeowner shared it AND the claim is paid.
import { endpoint, reply, fail, getJSON, str, newId, isId, proSelf, anonymizeCase, connectedView, docsFor, siteOrigin } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";
import { DESKS, DESK_KIND, PACKS, readSettings, membershipOk, balanceOf, deskBlock, ledgerFor, tickRings, answerRing, passRing, deskBoard,
  contactAllowed, teamOf, teamView, TEAM_ROLES } from "./_hs-partners.js";
import { sniff, MIME } from "./hs-doc-upload.js";
import { createCheckoutSession } from "./_stripe-api.js";

export async function deskState(S, pro, now = Date.now()) {
  await tickRings(S, now);
  const settings = await readSettings(S);
  const L = await ledgerFor(S, pro.id);
  const balance = await balanceOf(S, pro, L);
  const board = await deskBoard(S, pro, now);
  const claims = [];
  for (const k of (await S.offers.list({ prefix: `byPro/${pro.id}/` })).blobs.map((b) => b.key)) {
    const o = await getJSON(S.offers, k.split("/").pop());
    if (!o || !(o.ring || o.origin === "customer_pick")) continue;
    const c = await getJSON(S.cases, o.caseId);
    if (!c) continue;
    const ok = await contactAllowed(S, c, pro.id);
    claims.push({ offerId: o.id, caseId: c.id, status: o.status, paid: !!o.paid, sample: !!(o.ring && o.ring.sample), picked: o.origin === "customer_pick", answeredAt: (o.ring && o.ring.answeredAt) || o.createdAt,
      case: ok ? connectedView(c, await docsFor(S, c)) : anonymizeCase(c), contactShared: ok });
  }
  return {
    pro: proSelf(pro), desk: pro.desk, kind: DESK_KIND[pro.desk] || null,
    settings: { membershipRequired: settings.membershipRequired, membershipMonthlyUsd: settings.membershipMonthlyUsd, paymentsLive: settings.paymentsLive,
      perLeadEnabled: settings.perLeadEnabled, ringSeconds: settings.ringSeconds },
    membership: { required: settings.membershipRequired, active: membershipOk(pro, settings) },
    block: await deskBlock(S, pro, settings, balance), balance,
    packs: Object.values(PACKS).filter((p) => p.desks.includes(pro.desk)).map(({ desks, ...p }) => p),
    ledger: L.slice(-50).reverse().map(({ proId, ref, ...e }) => e),
    ring: board.ring, rings: board.rings, queue: board.queue, claims: claims.sort((a, b) => String(b.answeredAt).localeCompare(String(a.answeredAt))),
    team: await teamView(S, await teamOf(S, pro), now), now: new Date(now).toISOString(),
  };
}

const A = {};
A.buypack = async ({ S, pro, body, env }) => {
  const settings = await readSettings(S);
  const pack = PACKS[body.packId];
  if (!pack || !pack.desks.includes(pro.desk)) return fail(400, "bad_pack", "That pack is not for your desk");
  if (!settings.perLeadEnabled[pro.desk]) return fail(409, "legal_review", "Per-lead pricing for your desk is pending legal review");
  if (!membershipOk(pro, settings)) return fail(403, "membership_inactive", "Your membership is not active");
  if (!settings.paymentsLive) return fail(409, "payments_off", "Payments are not yet enabled");
  const key = env.STRIPE_SECRET_KEY || "";
  if (!/^(sk|rk)_(test|live)_/.test(key)) return fail(503, "stripe_not_configured", "Payments are not configured");
  const origin = siteOrigin(env);
  const form = {
    mode: "payment", "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(pack.usd * 100),
    "line_items[0][price_data][product_data][name]": `Aria Home Shield ${pack.credits} ${pack.kind === "call" ? "qualified calls" : "attorney packets"}`,
    customer_email: pro.email, client_reference_id: pro.id,
    "metadata[hs]": "pack", "metadata[proId]": pro.id, "metadata[packId]": pack.id,
    "payment_intent_data[metadata][hs]": "pack", "payment_intent_data[metadata][proId]": pro.id, "payment_intent_data[metadata][packId]": pack.id,
    success_url: `${origin}/home-shield/partners?paid=1`, cancel_url: `${origin}/home-shield/partners?paid=0`,
  };
  const s = await createCheckoutSession(form, key, { idempotencyKey: `hs-pack/${pro.id}/${pack.id}/${Math.floor(Date.now() / 60000)}` });
  return reply(200, { url: s.url });
};
A.answerlead = A.claimpacket = async ({ S, pro, body, now }) => {
  if (!isId("case", body.caseId)) return fail(404, "not_found", "Not found");
  const r = await answerRing(S, pro, body.caseId, now);
  return r.error ? fail(...r.error) : reply(200, r);
};
A.passlead = A.passpacket = async ({ S, pro, body, now }) => {
  if (!isId("case", body.caseId)) return fail(404, "not_found", "Not found");
  const r = await passRing(S, pro, body.caseId, now);
  return r.error ? fail(...r.error) : reply(200, r);
};
A.setonline = async ({ S, pro, body, now }) => {
  pro.online = body.online === true; pro.onlineAt = new Date(now).toISOString();
  await S.pros.setJSON(pro.id, pro);
  return reply(200, { online: pro.online });
};
A.createteam = async ({ S, pro, body, now }) => {
  if (await teamOf(S, pro)) return fail(409, "has_team", "You are already on a team");
  const name = str(body.name, 80);
  if (name.length < 2) return fail(400, "bad_name", "Name your team");
  const t = { id: newId("t"), name, ownerId: pro.id, members: [{ proId: pro.id, role: pro.desk || "member" }], invites: {}, createdAt: new Date(now).toISOString() };
  await S.teams.setJSON(t.id, t);
  pro.teamId = t.id; await S.pros.setJSON(pro.id, pro);
  return reply(200, { team: await teamView(S, t, now) });
};
A.addteammember = async ({ S, pro, body }) => {
  const t = await teamOf(S, pro);
  if (!t || t.ownerId !== pro.id) return fail(403, "not_owner", "Only the team owner can invite");
  const email = str(body.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "bad_email", "Enter a valid email");
  const role = TEAM_ROLES.includes(body.role) ? body.role : "member";
  const code = newId("inv").slice(4, 16);
  t.invites = { ...(t.invites || {}), [code]: { email, role } };
  await S.teams.setJSON(t.id, t);
  await S.teams.setJSON(`invite/${code}`, { teamId: t.id });
  return reply(200, { code, email, role });
};
A.jointeam = async ({ S, pro, body }) => {
  const code = str(body.code, 24);
  const idx = code && await getJSON(S.teams, `invite/${code}`);
  const t = idx && await getJSON(S.teams, idx.teamId);
  const inv = t && t.invites && t.invites[code];
  if (!inv || inv.email !== pro.email) return fail(404, "bad_code", "That invite code is not for this account");
  t.members = [...t.members.filter((m) => m.proId !== pro.id), { proId: pro.id, role: inv.role }];
  delete t.invites[code];
  await S.teams.setJSON(t.id, t); await S.teams.delete(`invite/${code}`);
  pro.teamId = t.id; await S.pros.setJSON(pro.id, pro);
  return reply(200, { team: await teamView(S, t) });
};
A.postteammessage = async ({ S, pro, body, now }) => {
  const t = await teamOf(S, pro);
  if (!t) return fail(403, "no_team", "Join or create a team first");
  const text = str(body.text, 2000);
  if (!text) return fail(400, "empty", "Write a message");
  const iso = new Date(now).toISOString();
  const m = { id: newId("m"), proId: pro.id, name: pro.name, text, at: iso };
  await S.teams.setJSON(`msg/${t.id}/${iso}-${m.id}`, m);
  return reply(200, { message: m });
};
A.submitupload = async ({ S, pro, body, now }) => {
  const kind = ["license", "insurance_certificate"].includes(body.kind) ? body.kind : null;
  if (!kind) return fail(400, "bad_kind", "Choose license or insurance certificate");
  const f = body.file || {};
  const bytes = typeof f.data === "string" ? Buffer.from(f.data, "base64") : null;
  const t = bytes && sniff(bytes);
  if (!t) return fail(415, "bad_type", "PDF, JPG, PNG or HEIC only");
  if (bytes.length > 4 * 1024 * 1024) return fail(413, "too_large", "Up to 4 MB");
  const id = newId("d");
  await S.docs.set(`deskdoc/bin/${id}`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await S.docs.setJSON(`deskdoc/meta/${id}`, { id, proId: pro.id, kind, name: str(f.name, 120) || `${kind}.${t}`, type: MIME[t], size: bytes.length, createdAt: new Date(now).toISOString() });
  pro.deskDocs = [...(pro.deskDocs || []), { id, kind }]; await S.pros.setJSON(pro.id, pro);
  return reply(200, { docId: id, kind });
};

export default endpoint({ methods: ["GET", "POST"], maxBody: 6 * 1024 * 1024, rate: { bucket: "partner", limit: 600, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  if (!DESKS.includes(pro.desk)) return fail(403, "no_desk", "This account has no partner desk");
  if (!pro.verified) return fail(403, "pending_verification", "Your license is pending verification", { pro: proSelf(pro) });
  if (event.httpMethod === "GET") {
    if (pro.online) { pro.onlineAt = new Date(now).toISOString(); await S.pros.setJSON(pro.id, pro); }
    return reply(200, await deskState(S, pro, now));
  }
  const fn = A[body.action];
  if (!fn) return fail(400, "bad_action", "Unknown action");
  return fn({ S, pro, body, now, env: process.env });
});
