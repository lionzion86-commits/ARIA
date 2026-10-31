/* ============================================================
   GET /.netlify/functions/ofertas?store=&cat=&sort=&q=&page=   (#409)

   One page (48 cards) of ofertas.html's deals. The first page of every
   store/sort pair is a static file (assets/ofertas/slices/); this
   answers "Mostrar más" (page 2 on) and the page's search box, from
   assets/ofertas/deals.json (built by scripts/build-ofertas-slices.mjs),
   so the phone never downloads the 19MB ofertas-feed.json. Same order
   as the static slices: both come from _ofertas-core.js.

   Prices are the feed's (final, in dollars); ofertas.html converts to
   soles with the site's rate, as it always has.
   ============================================================ */
import { loadDeals, selectDeals, pageOf, normSort, normStore, normCat, normQ } from "./_ofertas-core.js";

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? {
          "Cache-Control": "public, max-age=300",
          "Netlify-CDN-Cache-Control": cache,
          "Netlify-Vary": "query=store|cat|sort|q|page",
        }
      : { "Cache-Control": "no-store" }),
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  if (event.httpMethod && event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, null);
  const qs = event.queryStringParameters || {};
  try {
    const deals = loadDeals();
    const store = normStore(qs.store, deals.stores);
    const sort = normSort(qs.sort);
    const q = normQ(qs.q);
    /* Por categoría (#443 c.6544455377): one category's deals, every store. */
    const cat = normCat(qs.cat, deals.cats);
    const out = pageOf(selectDeals(deals.cards, { store, sort, q, cat }), qs.page);
    return json(200, { generatedAt: deals.generatedAt, store, cat, sort, q, ...out },
      "public, durable, max-age=3600, stale-while-revalidate=86400");
  } catch (e) {
    console.error("[ofertas]", e);
    return json(500, { error: "Las ofertas no están disponibles en este momento.", items: [] }, null);
  }
}
