// ARIA HOME SHIELD -- POST hs-admin-setup. Set the Shield admin password, then sign in.
//   { token, password }  -> the emailed one-time token (burned on use; 30 minutes)
//   { password }         -> only for someone already signed in to the SHOP as an admin: sets the
//                           password for that admin's own email
//   200 { admin: { email } } + Set-Cookie hs_admin    400 weak_password    401 { code: "link_expired" | "no_session" }
// Rate limit: 10 per IP per hour.
import { endpoint, reply, fail } from "./_hs-store.js";
import { takeSetupToken, setAdminPassword, createAdminSession, adminCookieHeader, adminState, isShieldAdmin, readAdmins } from "./_hs-auth.js";

export default endpoint({ methods: ["POST"], rate: { bucket: "admin-setup", limit: 10, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const password = typeof body.password === "string" ? body.password : "";
  let email = null;
  if (body.token != null) {
    if (password.length < 10 || password.length > 200) return fail(400, "weak_password", "Use a password of at least 10 characters");
    email = await takeSetupToken(S, body.token, now);
    if (!email || !(await isShieldAdmin(S, email))) return fail(401, "link_expired", "Link expired. Request a new one.");
  } else {
    const st = await adminState(event, S, now);
    if (st.via !== "shop") return fail(401, st.code || "no_session", "Sign in to the shop as an admin, or use the emailed link");
    if (password.length < 10 || password.length > 200) return fail(400, "weak_password", "Use a password of at least 10 characters");
    email = st.email;
    const rec = await readAdmins(S);
    if (!rec.emails.includes(email)) { rec.emails.push(email); await S.settings.setJSON("admins", rec); }
  }
  await setAdminPassword(S, email, password, now);
  const sid = await createAdminSession(S, email, now);
  return reply(200, { admin: { email } }, { "Set-Cookie": adminCookieHeader(sid) });
});
