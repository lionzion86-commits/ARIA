/* ============================================================
   THE CUSTOMER'S TRACKING ENDPOINT

   Public, read-only, and deliberately thin. It looks a shipment up by
   ARIA'S OWN reference — never by the courier's tracking number, which
   the customer is never given — and answers with publicTrackingView(),
   an allowlist.

   WHAT THIS ENDPOINT CANNOT RETURN, structurally rather than by
   remembering to strip it: the courier's name, the courier's tracking
   number, our internal cost, the operator who recorded an update, and any
   raw provider status string. publicTrackingView() copies named fields
   out of the record; nothing else can ride along, including fields added
   to the shipment record later. test-shipping asserts that on a record
   deliberately stuffed with every secret we have.

   No auth: a shipment id is the capability, the same way a parcel
   tracking link works everywhere. It is a random id, it exposes no
   personal data beyond the order ids the holder already has, and it
   cannot be enumerated usefully.
   ============================================================ */

import { connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";
import { readShipment } from "./_shipping/store.js";
import { publicTrackingView } from "./_shipping/service.js";

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const shipmentId = String(event.queryStringParameters?.shipmentId || "").trim();
  if (!shipmentId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Falta el código de envío." }) };
  }

  try {
    const shipment = await readShipment(shipmentId);
    if (!shipment) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "No encontramos ese envío. Revisa el código." }),
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ tracking: publicTrackingView(shipment) }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
