/* ============================================================
   GET /api/search?q=<query>&page=<n>   (2026-10-19, #409)

   One page (48 cards) of ranked results, the total, and what the page
   should say about the query. search.html calls this instead of
   downloading the catalogue; see _search-core.js for why.

   Responses are cached at Netlify's edge per (q, page) for an hour and
   in the browser for five minutes. A deploy replaces the edge cache, so
   a refreshed index is never hidden behind it. Prices in soles use
   SUNAT's sell rate (the exchange-rate function's source), fetched at
   most every six hours per container; without it the cards show
   dollars only, as search.html did.
   ============================================================ */
import { loadSearch, searchPage, runQuery } from "./_search-core.js";
import { RETAILERS } from "../../scripts/lib/retailers.js";

const LABELS = Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label || k]));

const FX_TTL_MS = 6 * 60 * 60 * 1000;
let fxCache = { rate: null, at: 0 };
async function sellRate(fetchImpl = fetch) {
  if (fxCache.rate && Date.now() - fxCache.at < FX_TTL_MS) return fxCache.rate;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 1500);
    const res = await fetchImpl("https://api.apis.net.pe/v1/tipo-cambio-sunat", { headers: { Accept: "application/json" }, signal: ctl.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (res.ok && typeof data.venta === "number" && data.venta > 0) fxCache = { rate: data.venta, at: Date.now() };
  } catch { /* dollars only */ }
  return fxCache.rate;
}

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...(cache
      ? {
          "Cache-Control": "public, max-age=300",
          "Netlify-CDN-Cache-Control": cache,
          /* Only q and page decide the answer; anything else in the URL
             must not split the cache. */
          "Netlify-Vary": "query=q|page",
        }
      : { "Cache-Control": "no-store" }),
  },
  body: JSON.stringify(body),
});

export async function handler(event, { fetchImpl } = {}) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, null);
  const qs = event.queryStringParameters || {};
  /* The search boxes' focus ping: load the index, the engine's lazy
     tables (one throwaway query) and the rate; answer nothing. */
  if (qs.warm) {
    try {
      const fxP = sellRate(fetchImpl);
      runQuery(loadSearch({ labels: LABELS }), "zapatillas");
      await fxP;
    } catch (e) { console.error("[search] warm", e); }
    return { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };
  }
  const q = String(qs.q || "").slice(0, 120);
  const page = Number(qs.page) || 1;
  try {
    /* The rate is fetched while the index loads, not after it. */
    const fxP = sellRate(fetchImpl);
    const ctx = loadSearch({ labels: LABELS });
    const fx = await fxP;
    const out = searchPage(ctx, q, page, { fx });
    if (out.state === "error") return json(500, { ...out, items: [] }, null);
    /* Soles are part of the answer: an answer without them is kept
       briefly, so the next request can pick the rate up. */
    const cache = fx
      ? "public, durable, max-age=3600, stale-while-revalidate=86400"
      : "public, max-age=60";
    return json(200, out, cache);
  } catch (e) {
    console.error("[search]", e);
    return json(500, { error: "La búsqueda no está disponible en este momento.", q }, null);
  }
}
