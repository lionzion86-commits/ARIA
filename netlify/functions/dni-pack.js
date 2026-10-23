// A Key Club member's registered document pack (#443, embarque brief:
// "upload once, never again"). Session-scoped like the wallet: a pack is
// only ever returned to the account it belongs to, never by email in a
// query string.
//
//   GET                      -> { signedIn, recipients: [{ docNumber, name, updatedAt }] }
//   GET ?doc=<n>&side=front  -> the member's own photo (private, no-store)
//   DELETE ?doc=<n>          -> delete that recipient's pack (no doc: all)
//   POST { docNumber, name, front, back } -> replace that pack with new
//                               photos (tokens from dni-upload, Mi cuenta)
//
// Checkout uses the plain GET to offer "use my saved document"; the
// photo itself is served only to its owner, for the account page.
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { DNI_DOCS_STORE, DNI_PACKS_STORE, SIDES, listPack, packFor, deletePack, readImage, normalizeDocNumber, replacePack } from "./_dni-docs.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, POST, DELETE, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const email = await getSessionEmail(event);
  const q = event.queryStringParameters || {};
  const stores = { docs: getStore(DNI_DOCS_STORE), packs: getStore(DNI_PACKS_STORE) };

  try {
    if (event.httpMethod === "GET" && !q.doc) {
      if (!email) return { statusCode: 200, headers, body: JSON.stringify({ signedIn: false, recipients: [] }) };
      return { statusCode: 200, headers, body: JSON.stringify({ signedIn: true, recipients: await listPack(stores.packs, email) }) };
    }
    if (!email) return { statusCode: 401, headers, body: JSON.stringify({ error: "Inicia sesión en tu cuenta Key Club." }) };

    if (event.httpMethod === "GET") {
      const doc = normalizeDocNumber(q.doc);
      if (!doc || !SIDES.includes(q.side)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Documento o lado no válido." }) };
      const pack = await packFor(stores.packs, email, doc);
      const img = pack ? await readImage(stores.docs, pack[q.side]) : null;
      if (!img) return { statusCode: 404, headers, body: JSON.stringify({ error: "No tienes esa foto guardada." }) };
      return {
        statusCode: 200,
        // No CORS header: the photo is for the member's own page only.
        headers: { "Content-Type": img.meta.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
        body: img.base64,
        isBase64Encoded: true,
      };
    }

    if (event.httpMethod === "DELETE") {
      const doc = q.doc ? normalizeDocNumber(q.doc) : null;
      if (q.doc && !doc) return { statusCode: 400, headers, body: JSON.stringify({ error: "Documento no válido." }) };
      const removed = await deletePack(stores, email, doc);
      return { statusCode: 200, headers, body: JSON.stringify({ removed }) };
    }

    if (event.httpMethod === "POST") {
      let body;
      try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
      const r = await replacePack(stores, email, { docNumber: body.docNumber, name: body.name, front: body.front, back: body.back });
      return { statusCode: r.ok ? 200 : 400, headers, body: JSON.stringify(r.ok ? { ok: true } : { error: r.error }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (error) {
    console.error("[dni-pack] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos leer tus documentos guardados. Intenta de nuevo." }) };
  }
}
