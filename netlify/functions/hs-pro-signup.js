// ARIA HOME SHIELD -- POST hs-pro-signup. Self-serve pro enrollment (open platform).
//
//   POST { email, password /* 10+ chars */, name, company?, phone, bio?,
//          trades: ["public_adjuster"|"attorney"|"roofer"|"insurance_agent"|"inspector"],
//          licenseType: "public_adjuster"|"attorney"|"roofing_contractor"|"general_contractor"|"insurance_agent"|"home_inspector"|"other",
//          licenseNumber, licenseState /* "FL" */,
//          serviceArea: { centerZip, radiusMiles /* 5..250 */ }   // or serviceZips: ["33135", "331", ...]
//          attest: true }   // "My license is active and the information above is accurate"
//   200 { pro: {...no password hash}, pending: true }  + Set-Cookie hs_pro (httpOnly, Secure, SameSite=Lax)
//   409 { code: "exists" }
//
// The account exists at once and is signed in, but it is PENDING: until an
// admin verifies the license (hs-admin-verify) the feed, cases and offers
// all answer 403 pending_verification. Rate limit: 5 per IP per hour.
import { endpoint, reply, fail, str, normEmail, normPhone, normZip, pickList, TRADES, LICENSE_TYPES, US_STATES, newId, getJSON, proSelf } from "./_hs-store.js";
import { hashPassword, createProSession, proCookieHeader } from "./_hs-auth.js";

export function validatePro(b) {
  const email = normEmail(b.email);
  if (!email) return { error: ["bad_email", "Enter a valid email"] };
  const password = typeof b.password === "string" ? b.password : "";
  if (password.length < 10 || password.length > 200) return { error: ["weak_password", "Use a password of at least 10 characters"] };
  const name = str(b.name, 80);
  if (name.length < 2) return { error: ["bad_name", "Enter your full name"] };
  const phone = normPhone(b.phone);
  if (!phone) return { error: ["bad_phone", "Enter a valid phone number"] };
  const trades = pickList(b.trades, TRADES);
  if (!trades.length) return { error: ["bad_trades", "Choose at least one trade"] };
  if (!LICENSE_TYPES.includes(b.licenseType)) return { error: ["bad_license_type", "Choose your license type"] };
  const licenseNumber = str(b.licenseNumber, 40);
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,39}$/.test(licenseNumber)) return { error: ["bad_license_number", "Enter your license number"] };
  const licenseState = str(b.licenseState, 2).toUpperCase();
  if (!US_STATES.includes(licenseState)) return { error: ["bad_license_state", "Choose the state that issued your license"] };
  if (b.attest !== true) return { error: ["attest_required", "Confirm your license is active and accurate"] };
  let serviceArea = null, serviceZips = null;
  if (Array.isArray(b.serviceZips) && b.serviceZips.length) {
    serviceZips = [...new Set(b.serviceZips.slice(0, 60).map((z) => String(z).trim()).filter((z) => /^\d{3}$/.test(z) || normZip(z)))];
    if (!serviceZips.length) return { error: ["bad_area", "Enter valid ZIP codes"] };
  } else {
    const a = b.serviceArea || {};
    const centerZip = normZip(a.centerZip);
    const radiusMiles = Math.round(Number(a.radiusMiles));
    if (!centerZip) return { error: ["bad_area", "Enter the ZIP code you work from"] };
    if (!(radiusMiles >= 5 && radiusMiles <= 250)) return { error: ["bad_radius", "Choose a radius between 5 and 250 miles"] };
    serviceArea = { centerZip, radiusMiles };
  }
  return { pro: { email, password, name, company: str(b.company, 100) || null, phone, bio: str(b.bio, 400) || null, trades,
    licenseType: b.licenseType, licenseNumber: licenseNumber.toUpperCase(), licenseState, serviceArea, serviceZips } };
}

export const handler = endpoint({ methods: ["POST"], rate: { bucket: "pro-signup", limit: 5, windowSec: 3600 } }, async ({ S, body, now }) => {
  const v = validatePro(body);
  if (v.error) return fail(400, v.error[0], v.error[1]);
  const { password, ...p } = v.pro;
  if (await getJSON(S.pros, `email/${p.email}`)) return fail(409, "exists", "An account with this email already exists. Sign in instead.");
  const iso = new Date(now).toISOString();
  const pro = { id: newId("p"), ...p, passHash: await hashPassword(password), verified: false, verifiedAt: null, verifiedBy: null,
    disabled: false, lang: body.lang === "es" ? "es" : "en", attestedAt: iso, createdAt: iso, updatedAt: iso };
  await S.pros.setJSON(pro.id, pro);
  await S.pros.setJSON(`email/${pro.email}`, { proId: pro.id });
  const sid = await createProSession(S, pro.id, now);
  return reply(200, { pro: proSelf(pro), pending: true }, { "Set-Cookie": proCookieHeader(sid) });
});
