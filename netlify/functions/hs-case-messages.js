// ARIA HOME SHIELD -- hs-case-messages. "Talk first through Aria Home Shield".
//
// One private thread per (case, pro). Open once the homeowner chose
// talk_first (offer "accepted_talk_first") and kept after contact is shared
// ("accepted"). The pro never sees contact through it: while contact is not
// shared, the homeowner's own messages are scrubbed of phones, emails,
// addresses and id numbers (the answer says scrubbed: true), so the only
// way contact travels is the explicit "share my contact" tap.
//
//   Homeowner: GET  ?c=<caseId>&t=<token>&p=<proId>          -> { messages, offer }
//              POST { caseId, token, proId, text }            -> { message, scrubbed }
//   Pro:       GET  ?c=<caseId>                (hs_pro cookie) -> { messages, offer }
//              POST { caseId, text }           (hs_pro cookie) -> { message }
//   messages: [{ id, from: "homeowner"|"pro", text, at }], oldest first (last 200)
// Text: 1..2000 characters. Rate limit: 120 POSTs per IP per hour.
import { endpoint, reply, fail, caseForToken, getJSON, isId, str, scrubText, knownPrivate, newId, loadAll, pushEvent } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";

const OPEN = ["accepted_talk_first", "accepted"];

async function offerFor(S, c, proId) {
  for (const oid of c.offers || []) {
    const o = await getJSON(S.offers, oid);
    if (o && o.proId === proId) return o;
  }
  return null;
}

async function resolve(event, S, src) {
  const caseId = src.c || src.caseId;
  if (!isId("case", caseId)) return { error: fail(404, "not_found", "Not found") };
  const token = src.t || src.token;
  if (token) {
    const c = await caseForToken(S, caseId, token);
    const proId = src.p || src.proId;
    if (!c || !isId("pro", proId)) return { error: fail(404, "not_found", "Not found") };
    const o = await offerFor(S, c, proId);
    if (!o || !OPEN.includes(o.status)) return { error: fail(403, "not_open", "Choose talk first on this professional's offer to message them") };
    return { c, o, side: "homeowner", proId };
  }
  const pro = await proFromEvent(event, S);
  if (!pro) return { error: fail(401, "signin", "Sign in") };
  if (!pro.verified) return { error: fail(403, "pending_verification", "Your license is pending verification") };
  const c = await getJSON(S.cases, caseId);
  if (!c) return { error: fail(404, "not_found", "Not found") };
  const o = await offerFor(S, c, pro.id);
  if (!o || !OPEN.includes(o.status)) return { error: fail(403, "not_open", "The homeowner has not opened a conversation with you") };
  return { c, o, side: "pro", proId: pro.id };
}

export const handler = endpoint({ methods: ["GET", "POST"], rate: { bucket: "case-messages", limit: 120, windowSec: 3600 } }, async ({ event, S, body, query, now }) => {
  const r = await resolve(event, S, event.httpMethod === "GET" ? query : body);
  if (r.error) return r.error;
  const { c, o, side, proId } = r;
  const prefix = `${c.id}/${proId}/`;
  if (event.httpMethod === "GET") {
    const msgs = (await loadAll(S.messages, prefix)).sort((a, b) => a.at.localeCompare(b.at)).slice(-200)
      .map((m) => ({ id: m.id, from: m.from, text: m.text, at: m.at }));
    return reply(200, { messages: msgs, offer: { id: o.id, status: o.status } });
  }
  const raw = str(body.text, 2000);
  if (!raw) return fail(400, "empty", "Write a message");
  let text = raw, scrubbed = false;
  if (side === "homeowner" && o.status !== "accepted") {
    text = scrubText(raw, knownPrivate(c));
    scrubbed = text !== raw;
  }
  const iso = new Date(now).toISOString();
  const m = { id: newId("m"), caseId: c.id, proId, from: side, text, at: iso };
  await S.messages.setJSON(`${prefix}${iso}-${m.id}`, m);
  if (side === "homeowner") await pushEvent(S, `pro/${proId}/${iso}-${m.id}`, { type: "message", caseId: c.id, offerId: o.id, at: iso });
  return reply(200, { message: { id: m.id, from: m.from, text: m.text, at: m.at }, scrubbed });
});
