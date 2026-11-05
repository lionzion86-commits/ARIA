// ARIA HOME SHIELD -- GET hs-doc-get. The ONLY way a document leaves the private store.
//
//   Homeowner:      GET ?d=<docId>&c=<caseId>&t=<token>
//   Connected pro:  GET ?d=<docId>&c=<caseId>        (hs_pro cookie; the case's connectedProId)
//   Large files:    &part=<n>  (4 MB parts; a whole-file request for a bigger file answers
//                   413 { code:"use_parts", parts, size, type } and the page fetches the parts)
//   -> the bytes (private, no-store, attachment), or 404 / 403.
// A pro who is only offered or talking first gets 403: docs are contact.
import { contactAllowed } from "./_hs-partners.js";
import { endpoint, fail, caseForToken, getJSON, isId, baseHeaders } from "./_hs-store.js";
import { proFromEvent } from "./_hs-auth.js";

export const PART_BYTES = 4 * 1024 * 1024;

export const handler = endpoint({ methods: ["GET"], rate: { bucket: "doc-get", limit: 300, windowSec: 3600, methods: ["GET"] } }, async ({ event, S, query }) => {
  if (!isId("doc", query.d) || !isId("case", query.c)) return fail(404, "not_found", "Not found");
  let c = null;
  if (query.t) c = await caseForToken(S, query.c, query.t);
  else {
    const pro = await proFromEvent(event, S);
    if (!pro) return fail(401, "signin", "Sign in");
    const cand = await getJSON(S.cases, query.c);
    if (!cand || !pro.verified || !(await contactAllowed(S, cand, pro.id))) return fail(403, "forbidden", "Only the professional the homeowner connected with can open documents");
    c = cand;
  }
  if (!c || !(c.docs || []).includes(query.d)) return fail(404, "not_found", "Not found");
  const meta = await getJSON(S.docs, `meta/${query.d}`);
  const bin = await S.docs.get(`bin/${query.d}`, { type: "arrayBuffer" });
  if (!meta || !bin) return fail(404, "not_found", "Not found");
  let buf = Buffer.from(bin);
  const parts = Math.ceil(buf.length / PART_BYTES);
  const headers = { ...baseHeaders("GET, OPTIONS"), "Content-Type": meta.type, "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": `attachment; filename="${meta.name.replace(/["\\]/g, "_")}"`, "X-Parts-Total": String(parts), "X-File-Size": String(buf.length) };
  if (query.part !== undefined) {
    const p = Number(query.part);
    if (!Number.isInteger(p) || p < 0 || p >= parts) return fail(416, "bad_part", "No such part");
    buf = buf.subarray(p * PART_BYTES, (p + 1) * PART_BYTES);
  } else if (parts > 1) {
    return fail(413, "use_parts", "Fetch this file in parts", { parts, size: buf.length, type: meta.type, name: meta.name });
  }
  return { statusCode: 200, headers, body: buf.toString("base64"), isBase64Encoded: true };
});
