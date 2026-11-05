// ARIA HOME SHIELD -- POST hs-policy-review. Read an uploaded policy PDF.
//
//   POST { caseId, token, docId, lang?: "en"|"es" }
//   200  { textFound: true, flags: [string], findings: [{ key, tone: "strong"|"weak"|"note", label }],
//          strong: [string], weak: [string], improve: [string], plainSummary, excerpt, pages? }
//   200  { textFound: false, flags: [], plainSummary }   // a scan / photo: said honestly
//
// The flags are amounts and policy terms only (no names or numbers) and are
// saved on the case's policyFlags, which matching pros see. The excerpt
// (first 12,000 characters of the text) goes only to the homeowner, so the
// conversation can discuss it; it is not stored.
// Rate limit: 30 per IP per hour.
import { endpoint, reply, fail, caseForToken, getJSON, isId, scrubText, knownPrivate } from "./_hs-store.js";
import { extractPdfText, policyFindings, noTextMessage } from "./_hs-policy.js";
import { readImage } from "./_hs-vision.js";

export const handler = endpoint({ methods: ["POST"], rate: { bucket: "policy-review", limit: 30, windowSec: 3600 } }, async ({ S, body, now }) => {
  const lang = body.lang === "es" ? "es" : "en";
  const c = await caseForToken(S, body.caseId, body.token);
  if (!c) return fail(404, "not_found", "We could not find that case");
  if (!isId("doc", body.docId) || !(c.docs || []).includes(body.docId)) return fail(404, "not_found", "That document is not on this case");
  const meta = await getJSON(S.docs, `meta/${body.docId}`);
  if (!meta) return fail(404, "not_found", "That document is not on this case");
  const bin = await S.docs.get(`bin/${body.docId}`, { type: "arrayBuffer" });
  if (meta.type !== "application/pdf") {
    /* A PHOTO (#443 c.6665786195): the vision read, same review shape. */
    if (!bin) return fail(404, "not_found", "That document is not on this case");
    const v = await readImage({ bytes: Buffer.from(bin), mime: meta.type, lang });
    if (v.textFound) {
      const known = knownPrivate(c);
      v.flags = v.flags.map((f) => scrubText(f, known));
      const fresh = await getJSON(S.cases, c.id);
      if (fresh) {
        fresh.policyFlags = [...new Set([...(fresh.policyFlags || []), ...v.flags])].slice(0, 16);
        fresh.updatedAt = new Date(now).toISOString();
        await S.cases.setJSON(c.id, fresh);
        const kind = v.docType === "denial_letter" ? "letter" : "policy";
        if (meta.kind !== kind) await S.docs.setJSON(`meta/${meta.id}`, { ...meta, kind });
      }
    }
    return reply(200, v);
  }
  const text = bin ? extractPdfText(Buffer.from(bin)) : "";
  if (text.replace(/\W/g, "").length < 40) return reply(200, { textFound: false, flags: [], findings: [], strong: [], weak: [], improve: [], plainSummary: noTextMessage(lang) });
  const r = policyFindings(text, lang);
  const known = knownPrivate(c);
  const flags = r.flags.map((f) => scrubText(f, known));
  const fresh = await getJSON(S.cases, c.id);
  if (fresh) {
    fresh.policyFlags = [...new Set([...(fresh.policyFlags || []), ...flags])].slice(0, 16);
    fresh.updatedAt = new Date(now).toISOString();
    await S.cases.setJSON(c.id, fresh);
    if (meta.kind !== "policy") await S.docs.setJSON(`meta/${meta.id}`, { ...meta, kind: "policy" });
  }
  return reply(200, { textFound: true, ...r, flags, excerpt: text.slice(0, 12000) });
});
