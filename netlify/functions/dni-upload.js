// One side of the recipient's DNI, uploaded from checkout (#443, embarque
// brief). The phone compresses the photo first (checkout.html), so the
// body is a JSON { side, data } with a few hundred KB of base64 JPEG.
//
// The answer is an opaque token -- the only handle on the photo. The page
// keeps it until Pagar, and orders-create ties it to the order. Nothing
// here ever sends a photo back: viewing is the member's own account page
// (dni-pack.js), never checkout.
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { DNI_DOCS_STORE, validateUpload, saveUpload } from "./_dni-docs.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "La foto llegó dañada. Vuelve a intentarlo." }) }; }

  const check = validateUpload(body || {});
  if (!check.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: check.error }) };

  try {
    // A member's photo belongs to the account; a guest's to nobody.
    const owner = await getSessionEmail(event);
    const token = await saveUpload(getStore(DNI_DOCS_STORE), { side: body.side, ...check }, { owner });
    return { statusCode: 200, headers, body: JSON.stringify({ token, side: body.side }) };
  } catch (error) {
    console.error("[dni-upload] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos guardar la foto. Vuelve a intentarlo; el resto de tu pedido sigue aquí." }) };
  }
}
