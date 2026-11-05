// ARIA HOME SHIELD -- POST hs-offer-respond. THE HOMEOWNER DECIDES.
//
//   POST { caseId, token, offerId, action }
//     action "accept"        -> share my contact now: offer "accepted", case "connected",
//                               contacts revealed both ways, the pro is pinged
//     action "talk_first"    -> offer "accepted_talk_first": a private message thread opens
//                               (hs-case-messages); the pro still sees NO contact
//     action "share_contact" -> from talk-first: the explicit "share my contact" tap,
//                               same result as "accept"
//     action "decline"       -> offer "declined"
//   200 { offer: { id, status }, case: { id, status, connectedProId },
//         pro?: { name, company, phone, email, ... } }   // pro contact only once shared
//
// One connected pro per case: once a pro is connected, the remaining
// pending / talk-first offers are closed as declined (reason
// "homeowner_chose_another"). Rate limit: 40 per IP per hour.
import { settleClaim, reopenRing } from "./_hs-partners.js";
import { endpoint, reply, fail, caseForToken, getJSON, isId, pushEvent, proForHomeowner, mail, siteOrigin } from "./_hs-store.js";

const ACTIONS = ["accept", "talk_first", "share_contact", "decline"];

function proConnectedEmail(pro, c) {
  const link = `${siteOrigin()}/home-shield/pro`;
  return {
    to: pro.email,
    subject: "Aria Home Shield: a homeowner shared their contact with you",
    text: `A homeowner approved your request on an Aria Home Shield case (${c.issue.replace(/_/g, " ")}, ${c.zip.slice(0, 3)}xx). Their contact details are in your dashboard under Connected: ${link}\n\nPlease reach out the way they prefer. Aria Home Shield`,
    html: `<p>A homeowner approved your request on an Aria Home Shield case.</p><p>Their contact details are in your dashboard under <b>Connected</b>: <a href="${link}">${link}</a></p><p>Aria Home Shield</p>`,
  };
}

export default endpoint({ methods: ["POST"], rate: { bucket: "offer-respond", limit: 40, windowSec: 3600 } }, async ({ S, body, now }) => {
  const c = await caseForToken(S, body.caseId, body.token);
  if (!c) return fail(404, "not_found", "We could not find that case");
  if (!ACTIONS.includes(body.action)) return fail(400, "bad_action", "Unknown action");
  if (!isId("offer", body.offerId) || !(c.offers || []).includes(body.offerId)) return fail(404, "not_found", "That offer is not on this case");
  const o = await getJSON(S.offers, body.offerId);
  if (!o || o.caseId !== c.id) return fail(404, "not_found", "That offer is not on this case");
  const iso = new Date(now).toISOString();
  const action = body.action;

  if (action === "decline") {
    if (o.status === "accepted") return fail(409, "already_connected", "You already shared your contact with this professional");
    o.status = "declined"; o.respondedAt = iso;
    await S.offers.setJSON(o.id, o);
    await reopenRing(S, c, o);
    if (c.status === "offered" && !(await anyOpenOffer(S, c, o.id))) { c.status = "open"; c.updatedAt = iso; await S.cases.setJSON(c.id, c); }
    await pushEvent(S, `pro/${o.proId}/${iso}-${o.id}`, { type: "declined", caseId: c.id, offerId: o.id, at: iso });
    return reply(200, { offer: { id: o.id, status: o.status }, case: { id: c.id, status: c.status, connectedProId: c.connectedProId || null } });
  }

  if (o.status === "declined") return fail(409, "declined", "This offer was declined");
  if (c.status === "connected" && c.connectedProId !== o.proId) return fail(409, "connected_other", "You are already connected with another professional on this case");

  if (action === "talk_first") {
    if (o.status === "accepted") return fail(409, "already_connected", "You already shared your contact with this professional");
    o.status = "accepted_talk_first"; o.respondedAt = iso; o.talkFirstAt = iso;
    await S.offers.setJSON(o.id, o);
    await pushEvent(S, `pro/${o.proId}/${iso}-${o.id}`, { type: "talk_first", caseId: c.id, offerId: o.id, at: iso });
    const p = await getJSON(S.pros, o.proId);
    return reply(200, { offer: { id: o.id, status: o.status }, case: { id: c.id, status: c.status, connectedProId: c.connectedProId || null }, pro: proForHomeowner(p) });
  }

  /* accept / share_contact: the explicit release of contact, both ways. */
  if (action === "share_contact" && o.status !== "accepted_talk_first" && o.status !== "accepted") return fail(409, "talk_first_needed", "Choose accept to share your contact");
  /* A desk's ring offer: the verified claim is paid FIRST; no payment, no contact. */
  const settled = await settleClaim(S, c, o, { by: "homeowner", now });
  if (settled.error) return fail(settled.error[0], settled.error[1], settled.error[2]);
  o.status = "accepted"; o.respondedAt = iso; o.sharedAt = iso;
  await S.offers.setJSON(o.id, o);
  c.status = "connected"; c.connectedProId = o.proId; c.connectedOfferId = o.id; c.connectedAt = iso; c.updatedAt = iso;
  await S.cases.setJSON(c.id, c);
  for (const oid of c.offers || []) {
    if (oid === o.id) continue;
    const other = await getJSON(S.offers, oid);
    if (other && (other.status === "pending" || other.status === "accepted_talk_first")) {
      other.status = "declined"; other.respondedAt = iso; other.reason = "homeowner_chose_another";
      await S.offers.setJSON(other.id, other);
      await pushEvent(S, `pro/${other.proId}/${iso}-${other.id}`, { type: "declined", caseId: c.id, offerId: other.id, at: iso });
    }
  }
  await pushEvent(S, `pro/${o.proId}/${iso}-${o.id}`, { type: "connected", caseId: c.id, offerId: o.id, at: iso });
  const p = await getJSON(S.pros, o.proId);
  if (p && p.email) { try { await mail(proConnectedEmail(p, c), { idempotencyKey: `hs-connected/${o.id}` }); } catch { /* the dashboard shows it anyway */ } }
  return reply(200, { offer: { id: o.id, status: o.status }, case: { id: c.id, status: c.status, connectedProId: c.connectedProId }, pro: proForHomeowner(p, { shared: true }) });
});

async function anyOpenOffer(S, c, exceptId) {
  for (const oid of c.offers || []) {
    if (oid === exceptId) continue;
    const x = await getJSON(S.offers, oid);
    if (x && (x.status === "pending" || x.status === "accepted_talk_first")) return true;
  }
  return false;
}
