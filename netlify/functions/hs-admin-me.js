// ARIA HOME SHIELD -- GET hs-admin-me. Who is the admin, and how they got in.
//   200 { admin: { email }, via: "shield" | "shop", hasShieldPassword }
//   401 { code: "no_session" }   no admin session at all (sign in below)
//   401 { code: "not_admin" }    a session exists, but that account is not a Home Shield admin
import { endpoint, reply, fail } from "./_hs-store.js";
import { adminState, readAdmins } from "./_hs-auth.js";

export default endpoint({ methods: ["GET"] }, async ({ event, S, now }) => {
  const st = await adminState(event, S, now);
  if (!st.email) return fail(401, st.code, st.code === "not_admin" ? "This account isn't a Home Shield admin" : "No admin session");
  const rec = await readAdmins(S);
  return reply(200, { admin: { email: st.email }, via: st.via, hasShieldPassword: !!(rec.users[st.email] && rec.users[st.email].passHash) });
});
