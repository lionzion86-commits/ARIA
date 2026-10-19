/* ============================================================
   GET /.netlify/functions/tienda?store=<key>&rail=<r>&page=<n>
   GET /.netlify/functions/tienda?store=<key>[&d=][&g=][&c=][&q=][&sort=][&page=]
   (2026-10-19, #409 track T2)

   tienda.html paints every storefront's first screen from a static file
   (assets/tienda/<key>/index.json). This endpoint answers what depends on
   the shopper -- "Ver todo" / "Mostrar más", the department and type
   chips, the store's search box and the sort menu -- against the store's
   full card list, on the server, 48 cards at a time, so the phone never
   downloads a catalogue. See _tienda-core.js.

   Answers are the same for everybody, so they are cached at Netlify's
   edge for an hour (a deploy replaces the edge cache) and in the browser
   for five minutes.
   ============================================================ */
import { answer } from "./_tienda-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? {
          "Cache-Control": "public, max-age=300",
          "Netlify-CDN-Cache-Control": cache,
          "Netlify-Vary": "query=store|rail|page|d|g|c|q|sort",
        }
      : { "Cache-Control": "no-store" }),
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, null);
  try {
    const out = answer(event.queryStringParameters || {});
    return json(out.status, out.body, out.status === 200 ? "public, durable, max-age=3600, stale-while-revalidate=86400" : null);
  } catch (e) {
    console.error("[tienda]", e);
    return json(500, { error: "No pudimos cargar la tienda." }, null);
  }
}
