/* ============================================================
   GET /.netlify/functions/nav-filter?dept=<key>[&u=][&t=][&s=][&b=]
       [&z=][&p=][&o=1][&fx=][&sort=][&page=]
   (#443 c.6616347095, the Nordstrom pattern)

   The category page's dropdown filter bar: one page of 48 cards under
   every filter at once, and each facet's options counted under all the
   others (_nav-filter-core.js). Same for everybody, so it is cached at
   the edge for an hour and in the browser for five minutes.
   ============================================================ */
import { answerNav } from "./_nav-filter-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? { "Cache-Control": "public, max-age=300", "Netlify-CDN-Cache-Control": cache, "Netlify-Vary": "query=dept|u|t|s|b|z|p|o|fx|sort|page|vy|vmk|vmd" }
      : { "Cache-Control": "no-store" }),
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, null);
  try {
    const out = answerNav(event.queryStringParameters || {});
    return json(out.status, out.body, out.status === 200 ? "public, durable, max-age=3600, stale-while-revalidate=86400" : null);
  } catch (e) {
    console.error("[nav-filter]", e);
    return json(500, { error: "No pudimos cargar los filtros." }, null);
  }
}
