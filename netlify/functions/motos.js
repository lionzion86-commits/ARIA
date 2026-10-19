/* ============================================================
   GET /.netlify/functions/motos?q=<words>[&t=<type>][&r=<store>][&page=<n>]
   (2026-10-19, #409 track T5)

   Aria Motos' grid comes from static pages
   (assets/sections/motos/<type>-<store>-<n>.json, 48 cards each) for
   every type chip x store chip. This endpoint answers the search box,
   48 cards at a time, so the phone never downloads the catalogue. See
   _motos-core.js.

   Cached at Netlify's edge for an hour (a deploy replaces it), in the
   browser for five minutes.
   ============================================================ */
import { answer } from "./_motos-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? {
          "Cache-Control": "public, max-age=300",
          "Netlify-CDN-Cache-Control": cache,
          "Netlify-Vary": "query=q|t|r|page",
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
    console.error("[motos]", e);
    return json(500, { error: "No pudimos cargar Aria Motos." }, null);
  }
}
