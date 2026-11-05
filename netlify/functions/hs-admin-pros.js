// ARIA HOME SHIELD -- GET hs-admin-pros. Every enrolled pro, pending first. Admin only
// (the shop session on ADMIN_EMAILS, same gate as admin.html).
//   200 { pros: [{ ...pro without password hash, offers: n, connected: n }], pending: n, verified: n }
import { endpoint, reply, fail, loadAll, proSelf } from "./_hs-store.js";
import { adminFromEvent } from "./_hs-auth.js";

export const handler = endpoint({ methods: ["GET"] }, async ({ event, S }) => {
  if (!(await adminFromEvent(event, S))) return fail(403, "admin_only", "Admins only");
  const pros = await loadAll(S.pros, "p_");
  const offers = await loadAll(S.offers, "o_");
  const rows = pros.map((p) => ({ ...proSelf(p), offers: offers.filter((o) => o.proId === p.id).length,
    connected: offers.filter((o) => o.proId === p.id && o.status === "accepted").length }))
    .sort((a, b) => (a.verified === b.verified ? b.createdAt.localeCompare(a.createdAt) : a.verified ? 1 : -1));
  return reply(200, { pros: rows, pending: rows.filter((p) => !p.verified).length, verified: rows.filter((p) => p.verified).length });
});
