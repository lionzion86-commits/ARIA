// ARIA HOME SHIELD -- POST hs-admin-verify. Approve (or revoke) a pro's license. Admin only.
//   POST { proId, verified: true|false, note? }  ->  200 { pro }
// Revoking takes effect on the pro's next request (every request re-reads the record).
import { endpoint, reply, fail, getJSON, isId, str, proSelf } from "./_hs-store.js";
import { adminFromEvent } from "./_hs-auth.js";

export const handler = endpoint({ methods: ["POST"] }, async ({ event, S, body, now }) => {
  const admin = await adminFromEvent(event, S);
  if (!admin) return fail(403, "admin_only", "Admins only");
  if (!isId("pro", body.proId) || typeof body.verified !== "boolean") return fail(400, "bad_request", "Send proId and verified: true|false");
  const p = await getJSON(S.pros, body.proId);
  if (!p) return fail(404, "not_found", "No such pro");
  const iso = new Date(now).toISOString();
  p.verified = body.verified;
  p.verifiedAt = body.verified ? iso : null;
  p.verifiedBy = body.verified ? admin : null;
  p.verificationNote = str(body.note, 300) || p.verificationNote || null;
  p.updatedAt = iso;
  await S.pros.setJSON(p.id, p);
  return reply(200, { pro: proSelf(p) });
});
