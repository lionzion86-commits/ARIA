// ARIA HOME SHIELD -- GET hs-admin-cases. Every case, newest first. Admin only.
//   200 { cases: [anonymizedCase & { status, updatedAt, connectedProId, docCount, contactOnFile,
//                  offers: [{ id, status, proId, proName, createdAt }] }] }
// The admin list is anonymized too: the advocate rule is that contact goes
// only to the pro the homeowner chose.
import { endpoint, reply, fail, loadAll, anonymizeCase } from "./_hs-store.js";
import { adminFromEvent } from "./_hs-auth.js";

export default endpoint({ methods: ["GET"] }, async ({ event, S }) => {
  if (!(await adminFromEvent(event, S))) return fail(403, "admin_only", "Admins only");
  const cases = await loadAll(S.cases, "c_");
  const offers = await loadAll(S.offers, "o_");
  const pros = new Map((await loadAll(S.pros, "p_")).map((p) => [p.id, p]));
  const rows = cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => ({
    ...anonymizeCase(c), status: c.status, updatedAt: c.updatedAt, connectedProId: c.connectedProId || null,
    docCount: (c.docs || []).length, contactOnFile: !!(c.contact && (c.contact.phone || c.contact.email)),
    offers: offers.filter((o) => o.caseId === c.id).map((o) => ({ id: o.id, status: o.status, proId: o.proId, proName: (pros.get(o.proId) || {}).name || null, createdAt: o.createdAt })),
  }));
  return reply(200, { cases: rows });
});
