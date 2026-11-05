// ARIA HOME SHIELD -- POST hs-pro-offer. "Request this case".
//   POST { caseId, message /* 10..600 chars */ }   (hs_pro cookie, verified pro, matching case)
//   200 { offer: { id, caseId, status: "pending", message, createdAt } }
//   403 pending_verification   404 not_found (not matching / gone)   409 exists | full | connected
// The homeowner is told (email when a provider is configured, always on
// their status page); they choose. Max 8 requests per case.
// Rate limit: 60 per IP per hour.
import { endpoint, reply, fail, getJSON, str, isId, caseMatchesPro, newId, mail, caseLink, pushEvent } from "./_hs-store.js";
import { readSettings } from "./_hs-partners.js";
import { proFromEvent } from "./_hs-auth.js";

export const MAX_OFFERS_PER_CASE = 8;

function homeownerEmail(c, pro) {
  const es = c.lang === "es";
  const link = caseLink(c);
  const who = `${pro.name}${pro.company ? ", " + pro.company : ""}`;
  return {
    to: c.contact.email,
    subject: es ? "Aria Home Shield: un profesional pidió tu caso" : "Aria Home Shield: a professional requested your case",
    text: es
      ? `${who} (licencia ${pro.licenseState} ${pro.licenseNumber}) pidió ayudarte con tu caso. Tu contacto NO se ha compartido. Tú decides: ${link}`
      : `${who} (license ${pro.licenseState} ${pro.licenseNumber}) asked to help with your case. Your contact has NOT been shared. You decide: ${link}`,
    html: es
      ? `<p><b>${esc(who)}</b> pidió ayudarte con tu caso. Tu contacto <b>no</b> se ha compartido.</p><p><a href="${link}">Revisa y decide</a></p>`
      : `<p><b>${esc(who)}</b> asked to help with your case. Your contact has <b>not</b> been shared.</p><p><a href="${link}">Review and decide</a></p>`,
  };
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export const handler = endpoint({ methods: ["POST"], rate: { bucket: "pro-offer", limit: 60, windowSec: 3600 } }, async ({ event, S, body, now }) => {
  const pro = await proFromEvent(event, S);
  if (!pro) return fail(401, "signin", "Sign in");
  if (!pro.verified) return fail(403, "pending_verification", "Your license is pending verification");
  if (pro.desk && (await readSettings(S)).perLeadEnabled[pro.desk]) return fail(409, "use_desk", "Your desk claims leads from the partner dashboard");
  if (!isId("case", body.caseId)) return fail(404, "not_found", "Case not found");
  const message = str(body.message, 600);
  if (message.length < 10) return fail(400, "short_message", "Write a short message (at least 10 characters)");
  const c = await getJSON(S.cases, body.caseId);
  if (!c || !caseMatchesPro(c, pro)) return fail(404, "not_found", "This case is no longer available");
  if ((c.offers || []).length >= MAX_OFFERS_PER_CASE) return fail(409, "full", "This case already has the maximum number of requests");
  for (const oid of c.offers || []) {
    const o = await getJSON(S.offers, oid);
    if (o && o.proId === pro.id) return fail(409, "exists", "You already requested this case");
  }
  const iso = new Date(now).toISOString();
  const offer = { id: newId("o"), caseId: c.id, proId: pro.id, message, createdAt: iso, status: "pending" };
  await S.offers.setJSON(offer.id, offer);
  await S.offers.setJSON(`byPro/${pro.id}/${offer.id}`, { offerId: offer.id, caseId: c.id });
  c.offers = [...(c.offers || []), offer.id];
  if (c.status === "open") c.status = "offered";
  c.updatedAt = iso;
  await S.cases.setJSON(c.id, c);
  await pushEvent(S, `homeowner/${c.id}/${iso}-${offer.id}`, { type: "offer", caseId: c.id, offerId: offer.id, at: iso });
  if (c.contact && c.contact.email) { try { await mail(homeownerEmail(c, pro), { idempotencyKey: `hs-offer/${offer.id}` }); } catch { /* status page shows it */ } }
  return reply(200, { offer: { id: offer.id, caseId: c.id, status: offer.status, message, createdAt: iso } });
});
