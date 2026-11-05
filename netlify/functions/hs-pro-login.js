// ARIA HOME SHIELD -- POST hs-pro-login.
//   POST { email, password } -> 200 { pro, pending } + Set-Cookie hs_pro (httpOnly, Secure, SameSite=Lax)
//   401 { code: "bad_credentials" } -- the same answer for an unknown email and a wrong password.
// Rate limit: 20 per IP per 15 minutes, and 10 per email per 15 minutes.
import { endpoint, reply, fail, normEmail, getJSON, proSelf, rateOk } from "./_hs-store.js";
import { verifyPassword, burnPasswordCheck, createProSession, proCookieHeader } from "./_hs-auth.js";

export default endpoint({ methods: ["POST"], rate: { bucket: "pro-login", limit: 20, windowSec: 900 } }, async ({ S, body, now }) => {
  const email = normEmail(body.email);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  const bad = () => fail(401, "bad_credentials", "Email or password is incorrect");
  if (!email || !password) return bad();
  if (!(await rateOk(S, "pro-login-email", email, 10, 900, now))) return fail(429, "rate_limited", "Too many attempts. Wait 15 minutes and try again.");
  const idx = await getJSON(S.pros, `email/${email}`);
  const pro = idx && await getJSON(S.pros, idx.proId);
  if (!pro) { await burnPasswordCheck(password); return bad(); }
  if (!(await verifyPassword(password, pro.passHash))) return bad();
  if (pro.disabled) return fail(403, "disabled", "This account is disabled. Contact Aria Home Shield.");
  const sid = await createProSession(S, pro.id, now);
  return reply(200, { pro: proSelf(pro), pending: !pro.verified }, { "Set-Cookie": proCookieHeader(sid) });
});
