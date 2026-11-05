// ARIA HOME SHIELD -- POST hs-case-delete. Delete-on-request: the case, its docs, offers,
// message threads and feed events, permanently.
//
//   POST { caseId, token }  ->  200 { deleted: true, caseId, docs: n }
// Rate limit: 20 per IP per hour.
import { endpoint, reply, fail, caseForToken, listKeys } from "./_hs-store.js";

export async function deleteCase(S, c) {
  let docs = 0;
  for (const id of c.docs || []) {
    await S.docs.delete(`bin/${id}`); await S.docs.delete(`meta/${id}`); docs++;
  }
  for (const k of await listKeys(S.docs, "upload/")) {
    try { const u = await S.docs.get(k, { type: "json" }); if (u && u.caseId === c.id) await S.docs.delete(k); } catch { /* gone */ }
  }
  for (const oid of c.offers || []) {
    const o = await S.offers.get(oid, { type: "json" }).catch(() => null);
    if (o && o.proId) await S.offers.delete(`byPro/${o.proId}/${oid}`);
    await S.offers.delete(oid);
  }
  for (const k of await listKeys(S.messages, `${c.id}/`)) await S.messages.delete(k);
  for (const k of await listKeys(S.events, `homeowner/${c.id}/`)) await S.events.delete(k);
  for (const k of await listKeys(S.events, "case/")) if (k.endsWith(`-${c.id}`)) await S.events.delete(k);
  for (const k of await listKeys(S.events, "pro/")) {
    try { const e = await S.events.get(k, { type: "json" }); if (e && e.caseId === c.id) await S.events.delete(k); } catch { /* gone */ }
  }
  await S.cases.delete(c.id);
  return docs;
}

export default endpoint({ methods: ["POST"], rate: { bucket: "case-delete", limit: 20, windowSec: 3600 } }, async ({ S, body }) => {
  const c = await caseForToken(S, body.caseId, body.token);
  if (!c) return fail(404, "not_found", "We could not find that case");
  const docs = await deleteCase(S, c);
  return reply(200, { deleted: true, caseId: c.id, docs });
});
