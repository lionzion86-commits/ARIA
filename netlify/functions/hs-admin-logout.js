// ARIA HOME SHIELD -- POST hs-admin-logout. Ends the hs_admin session (the shop session is untouched).
import { endpoint, reply } from "./_hs-store.js";
import { destroyAdminSession, clearAdminCookieHeader } from "./_hs-auth.js";

export default endpoint({ methods: ["POST"] }, async ({ event, S }) => {
  await destroyAdminSession(event, S);
  return reply(200, { ok: true }, { "Set-Cookie": clearAdminCookieHeader() });
});
