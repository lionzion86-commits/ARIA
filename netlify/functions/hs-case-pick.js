// ARIA HOME SHIELD -- POST hs-case-pick { caseId, token, proId, trade }. THE CUSTOMER CHOOSES.
//   200 { offer: { id, status: "accepted_talk_first", origin: "customer_pick", trade }, pro: card }
//   403 not_eligible   409 already_picked (one pick per trade per case) | represented
// The pick opens the talk-first thread with that pro (hs-case-messages) and pings them. Nothing is
// shared: contact still moves only when the customer taps "share my contact" (hs-offer-respond).
// A pick of a paid desk (per-lead on) is billed only on that verified share, like a ring claim; a
// represented homeowner can never pick a billable desk.
import { endpoint, reply, fail, caseForToken, getJSON, isId, TRADES, newId, pushEvent } from "./_hs-store.js";
import { listable, coverageCovers, proTrade, customerCard } from "./_hs-profiles.js";
import { readSettings, DESKS, DESK_KIND } from "./_hs-partners.js";

export default endpoint({ methods: ["POST"], rate: { bucket: "case-pick", limit: 30, windowSec: 3600 } }, async ({ S, body, now }) => {
  const c = await caseForToken(S, body.caseId, body.token);
  if (!c) return fail(404, "not_found", "We could not find that case");
  if (c.status === "connected" || c.status === "closed") return fail(409, "closed", "This case is already connected");
  const pro = isId("pro", body.proId) ? await getJSON(S.pros, body.proId) : null;
  const trade = TRADES.includes(body.trade) ? body.trade : (pro && proTrade(pro));
  if (!pro || !listable(pro) || !coverageCovers(pro, c.zip, c.state) || !((pro.trades || []).concat(proTrade(pro) || [])).includes(trade)) return fail(403, "not_eligible", "This professional is not available for your case");
  c.picks = c.picks || {};
  if (c.picks[trade]) return fail(409, "already_picked", "You already chose a professional for this");
  const settings = await readSettings(S);
  const billable = DESKS.includes(pro.desk) && settings.perLeadEnabled[pro.desk];
  if (billable && c.represented) return fail(409, "represented", "You told us you already have representation on this claim");
  const iso = new Date(now).toISOString();
  let o = null;
  for (const oid of c.offers || []) { const x = await getJSON(S.offers, oid); if (x && x.proId === pro.id) o = x; }
  if (o && o.status === "declined") return fail(409, "declined", "You declined this professional earlier");
  if (!o) {
    o = { id: newId("o"), caseId: c.id, proId: pro.id, createdAt: iso, message: "" };
    c.offers = [...(c.offers || []), o.id];
    await S.offers.setJSON(`byPro/${pro.id}/${o.id}`, { offerId: o.id, caseId: c.id });
  }
  Object.assign(o, { status: "accepted_talk_first", origin: "customer_pick", trade, respondedAt: iso, talkFirstAt: iso,
    ...(billable && !o.ring ? { ring: { desk: pro.desk, kind: DESK_KIND[pro.desk], sample: false, answeredAt: iso, pick: true }, paid: false } : {}) });
  await S.offers.setJSON(o.id, o);
  c.picks[trade] = pro.id;
  if (c.status === "open") c.status = "offered";
  c.updatedAt = iso;
  await S.cases.setJSON(c.id, c);
  await pushEvent(S, `pro/${pro.id}/${iso}-${o.id}`, { type: "picked", caseId: c.id, offerId: o.id, at: iso });
  return reply(200, { offer: { id: o.id, status: o.status, origin: o.origin, trade }, pro: customerCard(pro) });
});
