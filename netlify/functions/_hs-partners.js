// ARIA HOME SHIELD -- PARTNER DESKS: settings, credits ledger, ringing, claims, teams.
// Underscore: not an endpoint (hs-partner, hs-partner-admin, hs-stripe-webhook,
// hs-offer-respond and hs-pro-feed use it). #443 c.6661955878 / c.6662387520.
//
// MONEY: partners never hold money. A pack is paid to ARIA SHOP LLC
// (Stripe Checkout) and becomes CREDITS in the append-only hs-ledger
// (purchase | grant | claim_debit | refund). A credit is spent ONLY on a
// VERIFIED claim: the homeowner shares contact with that desk's offer, or
// an admin verifies it. Ringing, answering and passing cost nothing.
//
// QUALIFICATION ESCROW LAW (tested):
//   - a ringing lead / packet rings ONE eligible desk at a time for
//     ringSeconds (90); pass or timeout re-rings the next desk,
//     round-robin by who was rung longest ago;
//   - answering creates an ordinary offer (the homeowner still picks,
//     talk-first still works) and HOLDS one credit (available = balance -
//     open holds), so a verified claim can always be paid;
//   - homeowner contact reaches the desk ONLY when the homeowner shared it
//     AND the claim is paid -- both;
//   - a represented homeowner ("already have a PA or attorney") never
//     rings and is never billable. No override exists.
// Ringing is evaluated lazily (tickRings) on every partner / admin poll:
// no scheduler, no telephony.
//
// SETTINGS (hs-settings/config, admin-editable): membershipRequired (false:
// enrollment is free at launch), membershipMonthlyUsd (null until Danny
// sets it), paymentsLive (false: no Checkout; admin grants credits for
// testing), perLeadEnabled {roofer:true, public_adjuster:false,
// attorney:false} (PA + attorney off pending Florida legal review),
// ringSeconds (90).
import { randomBytes } from "node:crypto";
import { getJSON, loadAll, listKeys, caseMatchesPro, anonymizeCase, pushEvent, newId } from "./_hs-store.js";

/* "roofer" is the internal key of the Contractor desk (displayed "Contractor / Contratista"). */
export const DESKS = ["roofer", "public_adjuster", "attorney", "insurance_agent"];
export const DESK_KIND = { roofer: "call", public_adjuster: "call", attorney: "packet", insurance_agent: "lead" };
export const PACKS = {
  calls10: { id: "calls10", kind: "call", desks: ["roofer", "public_adjuster"], credits: 10, usd: 7500 },
  packets5: { id: "packets5", kind: "packet", desks: ["attorney"], credits: 5, usd: 5000 },
  packets10: { id: "packets10", kind: "packet", desks: ["attorney"], credits: 10, usd: 10000 },
  /* Insurance agent desk: Danny has not set a price -> null until admin sets settings.packPrices.agent10. */
  agent10: { id: "agent10", kind: "lead", desks: ["insurance_agent"], credits: 10, usd: null },
};
/** A pack with the admin-set price applied (packPrices overrides; null = pricing coming soon). */
export function packWithPrice(pack, settings) {
  const o = settings && settings.packPrices && Object.prototype.hasOwnProperty.call(settings.packPrices, pack.id) ? settings.packPrices[pack.id] : undefined;
  return { ...pack, usd: o === undefined ? pack.usd : o };
}
export const LEDGER_TYPES = ["purchase", "grant", "claim_debit", "refund"];
export const DEFAULT_SETTINGS = {
  membershipRequired: false, membershipMonthlyUsd: null, paymentsLive: false,
  perLeadEnabled: { roofer: true, public_adjuster: false, attorney: false, insurance_agent: false }, ringSeconds: 90,
  packPrices: { agent10: null },
};

export async function readSettings(S) {
  const v = (await getJSON(S.settings, "config")) || {};
  return { ...DEFAULT_SETTINGS, ...v, perLeadEnabled: { ...DEFAULT_SETTINGS.perLeadEnabled, ...(v.perLeadEnabled || {}) }, packPrices: { ...DEFAULT_SETTINGS.packPrices, ...(v.packPrices || {}) } };
}

/** Validated patch -> saved settings, or { error }. */
export async function writeSettings(S, patch, by, now = Date.now()) {
  const cur = await readSettings(S);
  const next = { ...cur };
  for (const k of ["membershipRequired", "paymentsLive"]) if (k in patch) {
    if (typeof patch[k] !== "boolean") return { error: `${k} must be true or false` };
    next[k] = patch[k];
  }
  if ("membershipMonthlyUsd" in patch) {
    const v = patch.membershipMonthlyUsd;
    if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100000)) return { error: "membershipMonthlyUsd must be a number of dollars or null" };
    next.membershipMonthlyUsd = v;
  }
  if ("ringSeconds" in patch) {
    const v = Number(patch.ringSeconds);
    if (!(Number.isInteger(v) && v >= 30 && v <= 600)) return { error: "ringSeconds must be 30..600" };
    next.ringSeconds = v;
  }
  if (patch.perLeadEnabled && typeof patch.perLeadEnabled === "object") {
    for (const [d, v] of Object.entries(patch.perLeadEnabled)) {
      if (!DESKS.includes(d) || typeof v !== "boolean") return { error: "perLeadEnabled takes a desk key and true|false" };
      next.perLeadEnabled = { ...next.perLeadEnabled, [d]: v };
    }
  }
  if (patch.packPrices && typeof patch.packPrices === "object") {
    for (const [id, v] of Object.entries(patch.packPrices)) {
      if (id !== "agent10" || !(v === null || (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000))) return { error: "packPrices.agent10 must be a dollar amount or null" };
      next.packPrices = { ...next.packPrices, [id]: v };
    }
  }
  next.updatedAt = new Date(now).toISOString(); next.updatedBy = by;
  await S.settings.setJSON("config", next);
  return { settings: next };
}

export function membershipOk(pro, settings) {
  return !settings.membershipRequired || !!(pro.membership && pro.membership.active);
}

/* ---------------------------------------------------------------- ledger (append-only) */
export async function appendLedger(S, entry, now = Date.now()) {
  if (!LEDGER_TYPES.includes(entry.type)) throw new Error("bad ledger type");
  if (entry.ref) {
    const seen = await getJSON(S.ledger, `ref/${entry.ref}`);
    if (seen) return { duplicate: true, entry: seen };
  }
  const iso = new Date(now).toISOString();
  const e = { id: newId("l"), at: iso, usd: 0, note: null, ...entry };
  await S.ledger.setJSON(`${e.proId}/${iso}-${e.id}`, e);
  if (e.ref) await S.ledger.setJSON(`ref/${e.ref}`, e);
  return { entry: e };
}
export async function ledgerFor(S, proId) {
  return (await loadAll(S.ledger, `${proId}/`)).sort((a, b) => a.at.localeCompare(b.at));
}
export async function allLedger(S) {
  const keys = (await listKeys(S.ledger)).filter((k) => !k.startsWith("ref/"));
  return (await Promise.all(keys.map((k) => getJSON(S.ledger, k)))).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
}

/** Open holds: this desk's ring offers that are answered, not yet paid, not declined. */
async function heldClaims(S, proId) {
  const out = [];
  for (const k of await listKeys(S.offers, `byPro/${proId}/`)) {
    const o = await getJSON(S.offers, k.split("/").pop());
    if (o && o.ring && !o.paid && o.status !== "declined") out.push(o);
  }
  return out;
}

/** { credits, held, available, sampleAvailable } */
export async function balanceOf(S, pro, ledger = null) {
  const L = ledger || (await ledgerFor(S, pro.id));
  const credits = L.reduce((n, e) => n + (Number(e.credits) || 0), 0);
  const holds = await heldClaims(S, pro.id);
  const sampleUsed = L.some((e) => e.type === "claim_debit" && e.sample);
  const sampleHeld = holds.some((o) => o.ring && o.ring.sample);
  const sampleAvailable = DESK_KIND[pro.desk] === "call" && !sampleUsed && !sampleHeld;
  const held = holds.filter((o) => !(o.ring && o.ring.sample)).length;
  return { credits, held, available: credits - held, sampleAvailable };
}

/** Why a desk cannot take paid leads right now (null = it can). */
export async function deskBlock(S, pro, settings, bal = null) {
  if (!pro || !DESKS.includes(pro.desk)) return "no_desk";
  if (!pro.verified || pro.disabled) return "pending_verification";
  if (!settings.perLeadEnabled[pro.desk]) return "legal_review";
  if (!membershipOk(pro, settings)) return "membership_inactive";
  const b = bal || (await balanceOf(S, pro));
  if (b.available < 1 && !b.sampleAvailable) return "no_credits";
  return null;
}

/* ---------------------------------------------------------------- ringing */
const ringable = (c) => ["open", "offered"].includes(c.status) && !c.represented && !c.connectedProId;

export const ONLINE_WINDOW_MS = 120000;
async function eligibleDesks(S, c, desk, settings, pros, excl, now) {
  const out = [];
  for (const p of pros) {
    if (p.desk !== desk || !p.online || now - Date.parse(p.onlineAt || 0) > ONLINE_WINDOW_MS || excl.includes(p.id)) continue;
    if (!caseMatchesPro(c, p)) continue;
    if (await deskBlock(S, p, settings)) continue;
    out.push(p);
  }
  return out;
}

/** Advance every ring: start new ones, re-ring expired ones. Returns cases changed. */
export async function tickRings(S, now = Date.now()) {
  const settings = await readSettings(S);
  const cases = (await loadAll(S.cases, "c_")).filter(ringable);
  if (!cases.length) return 0;
  const pros = await loadAll(S.pros, "p_");
  let changed = 0;
  for (const c of cases) {
    let dirty = false;
    c.rings = c.rings || {};
    for (const desk of DESKS) {
      if (!(c.trades || []).includes(desk) || !settings.perLeadEnabled[desk]) continue;
      const r = c.rings[desk] || { desk, status: "open", passed: [] };
      if (r.status === "answered") continue;
      if (r.status === "ringing" && Date.parse(r.expiresAt) > now) continue;
      if (r.status === "ringing") { r.passed = [...new Set([...(r.passed || []), r.proId])]; r.status = "open"; }
      const next = await pickNext(S, c, desk, settings, pros, r.passed || [], now);
      const before = JSON.stringify(c.rings[desk] || null);
      if (next) {
        Object.assign(r, { status: "ringing", proId: next.id, ringId: randomBytes(6).toString("hex"), startedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + settings.ringSeconds * 1000).toISOString() });
        await markRung(S, desk, next.id, now);
        await pushEvent(S, `pro/${next.id}/${new Date(now).toISOString()}-ring-${c.id}`, { type: "ring", caseId: c.id, desk, at: new Date(now).toISOString() });
      } else { r.status = "waiting"; r.proId = null; r.expiresAt = null; }
      c.rings[desk] = r;
      if (JSON.stringify(r) !== before) dirty = true;
    }
    if (dirty) { await S.cases.setJSON(c.id, c); changed++; }
  }
  return changed;
}

async function pickNext(S, c, desk, settings, pros, passed, now) {
  const el = await eligibleDesks(S, c, desk, settings, pros, passed, now);
  if (!el.length) return null;
  const rr = (await getJSON(S.settings, `rr/${desk}`)) || {};
  el.sort((a, b) => String(rr[a.id] || "").localeCompare(String(rr[b.id] || "")) || a.id.localeCompare(b.id));
  return el[0];
}
async function markRung(S, desk, proId, now) {
  const rr = (await getJSON(S.settings, `rr/${desk}`)) || {};
  rr[proId] = new Date(now).toISOString();
  await S.settings.setJSON(`rr/${desk}`, rr);
}

/** Answer (claim) a lead/packet: it must be ringing for me, or waiting with no one ringing and I am eligible. */
export async function answerRing(S, pro, caseId, now = Date.now()) {
  const settings = await readSettings(S);
  const c = await getJSON(S.cases, caseId);
  if (!c || !ringable(c)) return { error: [404, "not_found", "This lead is no longer available"] };
  const desk = pro.desk;
  const r = c.rings && c.rings[desk];
  if (!r) return { error: [404, "not_found", "This lead is not ringing for your desk"] };
  const mine = r.status === "ringing" && r.proId === pro.id && Date.parse(r.expiresAt) > now;
  const open = r.status === "waiting";
  if (!mine && !open) return { error: [409, "not_yours", "This lead is ringing another desk"] };
  const bal = await balanceOf(S, pro);
  const block = await deskBlock(S, pro, settings, bal);
  if (block) return { error: [403, block, "Your desk cannot claim leads right now"] };
  if (!caseMatchesPro(c, pro)) return { error: [404, "not_found", "Not in your area"] };
  for (const oid of c.offers || []) { const o = await getJSON(S.offers, oid); if (o && o.proId === pro.id) return { error: [409, "exists", "You already have this case"] }; }
  const iso = new Date(now).toISOString();
  const sample = bal.available < 1 && bal.sampleAvailable;
  const offer = { id: newId("o"), caseId: c.id, proId: pro.id, createdAt: iso, status: "pending",
    message: pro.desk === "attorney" ? "Our firm claimed your case packet through Aria Home Shield and is ready to review it with you." : "We answered your request through Aria Home Shield and are ready to help.",
    ring: { desk, kind: DESK_KIND[desk], sample, answeredAt: iso } , paid: false };
  await S.offers.setJSON(offer.id, offer);
  await S.offers.setJSON(`byPro/${pro.id}/${offer.id}`, { offerId: offer.id, caseId: c.id });
  c.offers = [...(c.offers || []), offer.id];
  if (c.status === "open") c.status = "offered";
  c.rings[desk] = { ...r, status: "answered", proId: pro.id, offerId: offer.id, answeredAt: iso };
  c.updatedAt = iso;
  await S.cases.setJSON(c.id, c);
  await pushEvent(S, `homeowner/${c.id}/${iso}-${offer.id}`, { type: "offer", caseId: c.id, offerId: offer.id, at: iso });
  return { offer: { id: offer.id, caseId: c.id, status: offer.status, sample } };
}

/** Pass: costs nothing, re-rings the next desk at once. */
export async function passRing(S, pro, caseId, now = Date.now()) {
  const c = await getJSON(S.cases, caseId);
  const r = c && c.rings && c.rings[pro.desk];
  if (!r) return { error: [404, "not_found", "Not ringing"] };
  r.passed = [...new Set([...(r.passed || []), pro.id])];
  if (r.status === "ringing" && r.proId === pro.id) { r.status = "open"; r.proId = null; r.expiresAt = new Date(now - 1).toISOString(); }
  await S.cases.setJSON(c.id, c);
  await tickRings(S, now);
  return { passed: true };
}

/**
 * THE ONLY DEBIT: a verified claim (homeowner shared contact with this
 * ring offer, or admin verify). Idempotent per offer. Represented -> never.
 * Returns { paid, entry? } or { error }.
 */
export async function settleClaim(S, c, o, { by = "homeowner", now = Date.now() } = {}) {
  if (!o || !o.ring) return { paid: true, notRing: true };
  if (o.paid) return { paid: true, already: true };
  if (c.represented) return { error: [409, "represented", "This homeowner is already represented; it cannot be billed"] };
  const pro = await getJSON(S.pros, o.proId);
  if (!pro) return { error: [404, "not_found", "Desk not found"] };
  const L = await ledgerFor(S, pro.id);
  const credits = L.reduce((n, e) => n + (Number(e.credits) || 0), 0);
  const sample = !!o.ring.sample;
  if (!sample && credits < 1) return { error: [402, "no_credits", "The desk has no credit for this claim"] };
  const r = await appendLedger(S, { proId: pro.id, type: "claim_debit", credits: sample ? 0 : -1, sample,
    usd: sample ? 0 : await perClaimUsd(S, o.ring), caseId: c.id, offerId: o.id, by, ref: `claim/${o.id}` }, now);
  o.paid = true; o.paidAt = new Date(now).toISOString(); o.verifiedBy = by;
  await S.offers.setJSON(o.id, o);
  return { paid: true, entry: r.entry };
}

async function perClaimUsd(S, ring) {
  if (ring.kind === "packet") return 1000;
  if (ring.kind === "call") return 750;
  const p = packWithPrice(PACKS.agent10, await readSettings(S));
  return p.usd == null ? null : Math.round((p.usd / p.credits) * 100) / 100;
}

/** A declined ring offer reopens the ring for that desk (that pro counted as passed). */
export async function reopenRing(S, c, o) {
  if (!o || !o.ring || !c.rings || !c.rings[o.ring.desk]) return;
  const r = c.rings[o.ring.desk];
  if (r.offerId !== o.id) return;
  c.rings[o.ring.desk] = { desk: r.desk, status: "open", passed: [...new Set([...(r.passed || []), o.proId])] };
}

/** Contact may reach this pro only when the homeowner shared it AND (for a ring offer) the claim is paid. */
export async function contactAllowed(S, c, proId) {
  if (c.status !== "connected" || c.connectedProId !== proId) return false;
  const o = c.connectedOfferId ? await getJSON(S.offers, c.connectedOfferId) : null;
  return !(o && o.ring && !o.paid);
}

/** What a desk sees ringing / waiting / claimed. */
export async function deskBoard(S, pro, now = Date.now()) {
  const cases = await loadAll(S.cases, "c_");
  const rings = [];
  const queue = [];
  for (const c of cases) {
    const r = c.rings && c.rings[pro.desk];
    if (!r || !ringable(c)) continue;
    if (r.status === "ringing" && r.proId === pro.id && Date.parse(r.expiresAt) > now) {
      rings.push({ caseId: c.id, desk: pro.desk, kind: DESK_KIND[pro.desk], expiresAt: r.expiresAt, case: anonymizeCase(c) });
    } else if ((r.status === "waiting" || r.status === "ringing") && caseMatchesPro(c, pro)) {
      queue.push({ caseId: c.id, status: r.status, since: r.startedAt || c.createdAt, case: anonymizeCase(c) });
    }
  }
  rings.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return { ring: rings[0] || null, rings, queue: queue.sort((a, b) => a.since.localeCompare(b.since)) };
}

/* ---------------------------------------------------------------- teams */
export const TEAM_ROLES = ["member", "roofer", "public_adjuster", "attorney", "insurance_agent", "office"];
export async function teamOf(S, pro) {
  if (!pro.teamId) return null;
  const t = await getJSON(S.teams, pro.teamId);
  if (!t || !t.members.some((m) => m.proId === pro.id)) return null;
  return t;
}
export async function teamView(S, t, now = Date.now()) {
  if (!t) return null;
  const members = [];
  for (const m of t.members) {
    const p = await getJSON(S.pros, m.proId);
    if (p) members.push({ proId: p.id, name: p.name, desk: p.desk || null, role: m.role, online: !!p.online && (now - Date.parse(p.onlineAt || 0)) < ONLINE_WINDOW_MS });
  }
  const msgs = (await loadAll(S.teams, `msg/${t.id}/`)).sort((a, b) => a.at.localeCompare(b.at)).slice(-100);
  return { id: t.id, name: t.name, ownerId: t.ownerId, members, invites: Object.entries(t.invites || {}).map(([code, v]) => ({ code, email: v.email, role: v.role })), messages: msgs };
}
