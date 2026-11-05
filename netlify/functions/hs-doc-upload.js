// ARIA HOME SHIELD -- POST hs-doc-upload. A homeowner adds a policy, photo or letter.
//
// Base64 JSON (Netlify caps a function request at 6 MB, so files over
// ~4 MB go in chunks; send 3 MB raw per chunk):
//   POST { caseId, token, file: { name, type, data /* base64 */ }, kind?: "policy"|"photo"|"letter"|"document" }
//     -> 200 { docId, name, type, size, kind }
//   Chunked:
//   POST { caseId, token, kind?, file: { name, type, size, data /* this chunk, base64 */,
//          chunk: { index, total, uploadId? /* from the first chunk's answer */ } } }
//     -> 200 { uploadId, received, total }        (every chunk but the last)
//     -> 200 { docId, name, type, size, kind }    (the last chunk)
//
// PDF / JPG / PNG / HEIC only, checked by the file's own bytes, not just
// its declared type. 10 MB per file, 20 files per case. Stored in the
// PRIVATE hs-docs store; nothing here ever has a public URL -- hs-doc-get
// serves a file only after checking the token or the connected pro.
// Rate limit: 80 requests per IP per hour.
import { endpoint, reply, fail, caseForToken, str, newId, isId, getJSON } from "./_hs-store.js";

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_DOCS_PER_CASE = 20;
const KINDS = ["policy", "photo", "letter", "document"];
const TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heic" };

/** What the bytes really are: "pdf" | "jpg" | "png" | "heic" | null. */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|heif)$/.test(buf.slice(8, 12).toString("latin1"))) return "heic";
  return null;
}
export const MIME = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", heic: "image/heic" };

const toAB = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const b64 = (s) => (typeof s === "string" && /^[A-Za-z0-9+/=\s]*$/.test(s.slice(0, 200)) ? Buffer.from(s.replace(/^data:[^,]*,/, ""), "base64") : null);
const safeName = (n, ext) => (str(n, 120).replace(/[^\p{L}\p{N} ._()-]/gu, "_").replace(/^\.+/, "") || `document.${ext}`);

async function finish(S, c, bytes, file, kind, now) {
  const kindOf = sniff(bytes);
  if (!kindOf) return fail(415, "bad_type", "Only PDF, JPG, PNG or HEIC files");
  const declared = TYPES[String(file.type || "").toLowerCase()];
  if (declared && declared !== kindOf) return fail(415, "type_mismatch", "The file does not match its type");
  if (bytes.length > MAX_DOC_BYTES) return fail(413, "too_large", "Files can be up to 10 MB");
  const fresh = await getJSON(S.cases, c.id);
  if (!fresh) return fail(404, "not_found", "Case not found");
  if ((fresh.docs || []).length >= MAX_DOCS_PER_CASE) return fail(409, "too_many", "This case already has 20 files");
  const id = newId("d");
  const meta = { id, caseId: c.id, name: safeName(file.name, kindOf), type: MIME[kindOf], size: bytes.length,
    kind: KINDS.includes(kind) ? kind : (kindOf === "pdf" ? "document" : "photo"), createdAt: new Date(now).toISOString() };
  await S.docs.set(`bin/${id}`, toAB(bytes));
  await S.docs.setJSON(`meta/${id}`, meta);
  fresh.docs = [...(fresh.docs || []), id];
  fresh.updatedAt = meta.createdAt;
  await S.cases.setJSON(c.id, fresh);
  return reply(200, { docId: id, name: meta.name, type: meta.type, size: meta.size, kind: meta.kind });
}

export const handler = endpoint({ methods: ["POST"], maxBody: 6 * 1024 * 1024, rate: { bucket: "doc-upload", limit: 80, windowSec: 3600 } }, async ({ S, body, now }) => {
  const c = await caseForToken(S, body.caseId, body.token);
  if (!c) return fail(404, "not_found", "We could not find that case");
  const file = body.file && typeof body.file === "object" ? body.file : null;
  if (!file || typeof file.data !== "string" || !file.data) return fail(400, "no_file", "Attach a file");
  const bytes = b64(file.data);
  if (!bytes || !bytes.length) return fail(400, "bad_data", "The file data is not valid base64");
  const ch = file.chunk;
  if (!ch) return finish(S, c, bytes, file, body.kind, now);

  /* Chunked upload. */
  const total = Number(ch.total), index = Number(ch.index);
  if (!Number.isInteger(total) || total < 1 || total > 8 || !Number.isInteger(index) || index < 0 || index >= total) return fail(400, "bad_chunk", "Invalid chunk");
  const size = Number(file.size);
  if (!Number.isInteger(size) || size < 1 || size > MAX_DOC_BYTES) return fail(413, "too_large", "Files can be up to 10 MB");
  let uploadId = ch.uploadId;
  if (index === 0) uploadId = newId("u");
  if (!isId("upload", uploadId)) return fail(400, "bad_chunk", "Missing uploadId");
  const up = index === 0 ? { id: uploadId, caseId: c.id, total, size, name: str(file.name, 120), type: str(file.type, 40), createdAt: new Date(now).toISOString() }
    : await getJSON(S.docs, `upload/${uploadId}`);
  if (!up || up.caseId !== c.id || up.total !== total || up.size !== size) return fail(400, "bad_chunk", "Unknown upload");
  if (index === 0) await S.docs.setJSON(`upload/${uploadId}`, up);
  await S.docs.set(`part/${uploadId}/${index}`, toAB(bytes));
  if (index < total - 1) return reply(200, { uploadId, received: index + 1, total });
  const parts = [];
  for (let k = 0; k < total; k++) {
    const p = await S.docs.get(`part/${uploadId}/${k}`, { type: "arrayBuffer" });
    if (!p) return fail(400, "missing_chunk", `Chunk ${k + 1} of ${total} did not arrive. Upload again.`);
    parts.push(Buffer.from(p));
  }
  for (let k = 0; k < total; k++) await S.docs.delete(`part/${uploadId}/${k}`);
  await S.docs.delete(`upload/${uploadId}`);
  const whole = Buffer.concat(parts);
  if (whole.length !== size) return fail(400, "size_mismatch", "The file arrived incomplete. Upload again.");
  return finish(S, c, whole, { name: up.name, type: up.type }, body.kind, now);
});
