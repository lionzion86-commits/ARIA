// ARIA HOME SHIELD -- POST hs-admin-setup-request { email }. "Set / reset my password".
// When the email is on the admin allowlist, a one-time link (<origin>/home-shield/admin?setup=<token>,
// 30 minutes, single use, only its sha256 stored) is emailed through the existing mailer
// (_order-email.js: SMTP_HOST + SMTP_USER + SMTP_PASS, or RESEND_API_KEY). The answer is ALWAYS the
// same 200, so it never reveals who is an admin. Rate limit: 5 per IP per hour, 3 per email per hour.
import { endpoint, reply, normEmail, rateOk, mail, siteOrigin } from "./_hs-store.js";
import { readAdmins, issueSetupToken } from "./_hs-auth.js";

const SAME = { ok: true, message: "If this email is a Home Shield admin, a link to set the password is on its way. It works once, for 30 minutes." };

export default endpoint({ methods: ["POST"], rate: { bucket: "admin-setup-request", limit: 5, windowSec: 3600 } }, async ({ S, body, now }) => {
  const email = normEmail(body.email);
  if (!email || !(await rateOk(S, "admin-setup-email", email, 3, 3600, now))) return reply(200, SAME);
  const rec = await readAdmins(S);
  if (!rec.emails.includes(email)) return reply(200, SAME);
  const token = await issueSetupToken(S, email, now);
  const link = `${siteOrigin()}/home-shield/admin?setup=${token}`;
  try {
    await mail({ to: email, subject: "Aria Home Shield admin: set your password",
      text: `Open this link to set your Home Shield admin password. It works once, for 30 minutes:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
      html: `<p>Open this link to set your Home Shield admin password. It works once, for 30 minutes.</p><p><a href="${link}">Set my password</a></p><p>If you did not ask for this, ignore this email.</p>` },
      { idempotencyKey: `hs-admin-setup/${token.slice(0, 32)}` });
  } catch { /* the answer stays the same */ }
  return reply(200, SAME);
});
