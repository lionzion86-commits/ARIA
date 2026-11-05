// ARIA HOME SHIELD -- POST hs-pro-logout. Deletes the session and clears the cookie.
//   POST {} -> 200 { ok: true }
import { endpoint, reply } from "./_hs-store.js";
import { destroyProSession, clearProCookieHeader } from "./_hs-auth.js";

export default endpoint({ methods: ["POST"] }, async ({ event, S }) => {
  await destroyProSession(event, S);
  return reply(200, { ok: true }, { "Set-Cookie": clearProCookieHeader() });
});
