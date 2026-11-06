// ARIA HOME SHIELD -- POST hs-admin-login { email, password }. The Shield admin's own door.
//   200 { admin: { email } } + Set-Cookie hs_admin (httpOnly, Secure, SameSite=Lax, 12 h)
//   401 { code: "bad_credentials" } -- the same answer for an unknown email, a non-admin, a wrong or unset password.
// Rate limit: 10 per IP per 15 minutes and 10 per email per 15 minutes.
import { endpoint, reply, fail, normEmail, rateOk } from "./_hs-store.js";
import { readAdmins, verifyPassword, burnPasswordCheck, createAdminSession, adminCookieHeader } from "./_hs-auth.js";

export default endpoint({ methods: ["POST"], rate: { bucket: "admin-login", limit: 10, windowSec: 900 } }, async ({ S, body, now }) => {
  const email = normEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const bad = () => fail(401, "bad_credentials", "Wrong email or password");
  if (!email || !password) return bad();
  if (!(await rateOk(S, "admin-login-email", email, 10, 900, now))) return fail(429, "rate_limited", "Too many attempts. Wait 15 minutes and try again.");
  const rec = await readAdmins(S);
  const user = rec.emails.includes(email) ? rec.users[email] : null;
  if (!user || !user.passHash) { await burnPasswordCheck(password); return bad(); }
  if (!(await verifyPassword(password, user.passHash))) return bad();
  const sid = await createAdminSession(S, email, now);
  return reply(200, { admin: { email } }, { "Set-Cookie": adminCookieHeader(sid) });
});
