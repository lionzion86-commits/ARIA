// ARIA HOME SHIELD -- POST hs-case-create. The homeowner opens a case.
//
//   POST { caseDraft: { issue, trades?, zip, urgency?, summary, insurer?, claimNumber?,
//                       policyNumber?, address?, policyFlags?, lang? },
//          contact: { name, phone?, email?, preferred? }, consent: true }
//   200  { caseId, token, statusUrl, matchingPros }
//
// The token (32 random bytes, hex) is the homeowner's only key to the case
// (caso.html?c=&t=); it is returned once and never shown to a pro. The
// summary is scrubbed of PII before it is stored. A new-case event goes to
// hs-events so matching pros' dashboards ping on their next poll.
// Rate limit: 6 cases per IP per hour.
//
// DRAFT FIRST (#443 c.6665786195): a homeowner can upload a photo of their
// policy before giving any contact. POST { draft: true, lang?, caseDraft?: { issue? } }
// creates a PRIVATE draft (status "draft": no contact, no consent, no ZIP,
// never matched, never rung, never shown to a pro) -> { caseId, token, draft: true }.
// Later the same POST with { caseId, token, caseDraft, contact, consent: true }
// turns that draft into an open case, keeping its id, token and documents.
import {
  endpoint, reply, fail, str, normEmail, normPhone, normZip, pickList, scrubText, knownPrivate,
  ISSUES, TRADES, URGENCY, PREFERRED, DEFAULT_TRADES, CONSENT_TEXT, newId, newToken, loadAll, caseMatchesPro, pushEvent, caseLink, caseForToken,
} from "./_hs-store.js";
import { zip3Info } from "./_hs-zip3.js";

/** Validate the draft + contact into a stored case, or { error }. */
export function buildCase(body, now = Date.now()) {
  const d = body.caseDraft && typeof body.caseDraft === "object" ? body.caseDraft : {};
  const ct = body.contact && typeof body.contact === "object" ? body.contact : {};
  if (body.consent !== true) return { error: ["consent_required", `Consent is required: "${CONSENT_TEXT}"`] };
  const issue = ISSUES.includes(d.issue) ? d.issue : null;
  if (!issue) return { error: ["bad_issue", "Choose what the problem is"] };
  const zip = normZip(d.zip);
  if (!zip) return { error: ["bad_zip", "Enter a valid 5-digit US ZIP code"] };
  const name = str(ct.name, 80);
  if (name.length < 2) return { error: ["bad_name", "Tell us your name"] };
  const phone = ct.phone ? normPhone(ct.phone) : null;
  if (ct.phone && !phone) return { error: ["bad_phone", "Check your phone number"] };
  const email = ct.email ? normEmail(ct.email) : null;
  if (ct.email && !email) return { error: ["bad_email", "Check your email address"] };
  if (!phone && !email) return { error: ["contact_required", "Give us a phone number or an email"] };
  let trades = pickList(d.trades, TRADES);
  if (!trades.length) trades = DEFAULT_TRADES[issue];
  const iso = new Date(now).toISOString();
  const c = {
    id: newId("c"), createdAt: iso, updatedAt: iso, status: "open",
    issue, trades, zip, state: zip3Info(zip).state,
    urgency: URGENCY.includes(d.urgency) ? d.urgency : "soon",
    summary: "",
    insurer: str(d.insurer, 80) || null,
    claimNumber: str(d.claimNumber, 60) || null,
    policyNumber: str(d.policyNumber, 60) || null,
    address: str(d.address || ct.address, 200) || null,
    contact: { name, phone, email, preferred: PREFERRED.includes(ct.preferred) ? ct.preferred : (phone ? "phone" : "email") },
    docs: [], policyFlags: [], offers: [], connectedProId: null,
    /* "Do you already have a public adjuster or attorney on this claim?" -- yes = never billable to a desk. */
    represented: d.represented === true || body.represented === true,
    lang: body.lang === "es" || d.lang === "es" ? "es" : "en",
    consent: { text: CONSENT_TEXT, at: iso },
    token: newToken(),
  };
  const known = knownPrivate(c);
  c.summary = scrubText(str(d.summary, 2000), known);
  c.policyFlags = (Array.isArray(d.policyFlags) ? d.policyFlags : []).slice(0, 16).map((f) => scrubText(str(String(f), 200), known)).filter(Boolean);
  return { case: c };
}

/** A private draft: nothing personal, nothing a pro can ever see. */
export function buildDraft(body, now = Date.now()) {
  const d = body.caseDraft && typeof body.caseDraft === "object" ? body.caseDraft : {};
  const iso = new Date(now).toISOString();
  return {
    id: newId("c"), createdAt: iso, updatedAt: iso, status: "draft",
    issue: ISSUES.includes(d.issue) ? d.issue : "policy_review", trades: [], zip: "", state: null, urgency: "planning",
    summary: "", insurer: null, claimNumber: null, policyNumber: null, address: null, contact: null,
    docs: [], policyFlags: [], offers: [], connectedProId: null,
    lang: body.lang === "es" ? "es" : "en", consent: null, token: newToken(),
  };
}

export default endpoint({ methods: ["POST"], rate: { bucket: "case-create", limit: 6, windowSec: 3600 } }, async ({ S, body, now }) => {
  if (body.draft === true && !body.caseId) {
    const dft = buildDraft(body, now);
    await S.cases.setJSON(dft.id, dft);
    return reply(200, { caseId: dft.id, token: dft.token, draft: true });
  }
  let existing = null;
  if (body.caseId) {
    existing = await caseForToken(S, body.caseId, body.token);
    if (!existing) return fail(404, "not_found", "We could not find that case");
    if (existing.status !== "draft") return fail(409, "already_open", "This case was already sent");
  }
  const r = buildCase(body, now);
  if (r.error) return fail(400, r.error[0], r.error[1]);
  const c = r.case;
  if (existing) {
    /* The draft becomes the case: same id, token and documents. */
    c.id = existing.id; c.token = existing.token; c.createdAt = existing.createdAt;
    c.docs = existing.docs || [];
    c.policyFlags = [...new Set([...(existing.policyFlags || []), ...c.policyFlags])].slice(0, 16);
  }
  await S.cases.setJSON(c.id, c);
  const pros = (await loadAll(S.pros, "p_")).filter((p) => caseMatchesPro(c, p));
  await pushEvent(S, `case/${c.createdAt}-${c.id}`, { type: "new_case", caseId: c.id, at: c.createdAt, trades: c.trades, zip3: c.zip.slice(0, 3), state: c.state });
  return reply(200, { caseId: c.id, token: c.token, statusUrl: caseLink(c).replace(/^https?:\/\/[^/]+/, ""), matchingPros: pros.length });
});
