/* ============================================================
   GET /.netlify/functions/vehicle-fit?vy=&vmk=&vmd=[&t=][&b=][&page=]
   (#443 c.6620267344; one canonical page, c.6621544530)

   Aria Auto's one fitment view (aria-auto.html?vy=&vmk=&vmd=[&t=]#buscar)
   and the «Tu vehículo» cards ask here: one page of cards, each option
   counted under the others, and the parts with no vehicle data apart
   (_fitment-core.js). Same for everybody: cached at the edge.
   ============================================================ */
import { answerFit } from "./_fitment-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? { "Cache-Control": "public, max-age=300", "Netlify-CDN-Cache-Control": cache, "Netlify-Vary": "query=vy|vmk|vmd|t|b|page" }
      : { "Cache-Control": "no-store" }),
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, null);
  try {
    const out = answerFit(event.queryStringParameters || {});
    return json(out.status, out.body, out.status === 200 ? "public, durable, max-age=3600, stale-while-revalidate=86400" : null);
  } catch (e) {
    console.error("[vehicle-fit]", e);
    return json(500, { error: "No pudimos cargar los repuestos para tu vehículo." }, null);
  }
}
