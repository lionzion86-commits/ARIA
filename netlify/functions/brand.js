/* ============================================================
   GET /.netlify/functions/brand?marca=<key>[&rail=<i>&page=<n>]
   (2026-10-19, #409 track T5)

   marca.html's first screen is a static head
   (assets/sections/marca/<key>.json) for every brand with 12+
   products. This endpoint answers the rest -- smaller brands, keys
   that only match title words, and "Ver todo" / "Mostrar más" (48
   cards at a time) -- on the server, so the phone never downloads a
   catalogue. See _brand-core.js for the carousels.

   Answers are the same for everybody: cached at Netlify's edge for an
   hour (a deploy replaces the edge cache), in the browser for five
   minutes.
   ============================================================ */
import { answer } from "./_brand-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? {
          "Cache-Control": "public, max-age=300",
          "Netlify-CDN-Cache-Control": cache,
          "Netlify-Vary": "query=marca|rail|page",
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
    console.error("[brand]", e);
    return json(500, { error: "No pudimos cargar la marca." }, null);
  }
}
