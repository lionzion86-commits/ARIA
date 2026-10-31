/* ============================================================
   GET /.netlify/functions/department?dept=<key>[&r=<store>][&q=<words>]
                                      [&rail=<i>&page=<n> | &batch=<b>]
   (2026-10-19, #409 track T5)

   departamento.html's first screen comes from static slices
   (assets/sections/departamento/<dept>/head.json and rails-<b>.json).
   This endpoint answers what depends on the shopper: "Ver todo" /
   "Mostrar más" (48 cards at a time), the store chips and the
   department search box -- against the department's full list, on the
   server, so the phone never downloads a catalogue. See
   _department-core.js for the carousels.

   Answers are the same for everybody, so they are cached at Netlify's
   edge for an hour (a deploy replaces the edge cache) and in the
   browser for five minutes.
   ============================================================ */
import { answer } from "./_department-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? {
          "Cache-Control": "public, max-age=300",
          "Netlify-CDN-Cache-Control": cache,
          "Netlify-Vary": "query=dept|r|q|b|a|t|u|rail|page|batch|axis|explore|sort",
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
    console.error("[department]", e);
    return json(500, { error: "No pudimos cargar el departamento." }, null);
  }
}
