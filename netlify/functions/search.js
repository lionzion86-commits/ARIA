/* ============================================================
   GET /api/search?q=<query>&page=<n>   (2026-10-19, #409)

   One page (48 cards) of ranked results, the total, and what the page
   should say about the query. search.html calls this instead of
   downloading the catalogue; see _search-core.js for why.

   Responses are cached at Netlify's edge per (q, page) for an hour and
   in the browser for five minutes. A deploy replaces the edge cache, so
   a refreshed index is never hidden behind it. Prices in soles use
   SUNAT's sell rate (the exchange-rate function's source), fetched at
   most every six hours per container.

   SOLES, ALWAYS (2026-10-19, #416). Danny's "dolls" screenshot read
   "precios en USD (tipo de cambio no disponible)" with every card in
   bold dollars: SUNAT's proxy had not answered within 1.5 s on a cold
   container, and the page flipped to dollars. The rate now comes
   from, in order: SUNAT (2 s); the last good rate, kept in Netlify
   Blobs for up to a week; and, if an answer still leaves without one,
   search.html converts with the site's own exchange-rate endpoint.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { loadSearch, searchPage, runQuery } from "./_search-core.js";
import { RETAILERS } from "../../scripts/lib/retailers.js";

const LABELS = Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label || k]));

const FX_TTL_MS = 6 * 60 * 60 * 1000;
/* A stored rate is used for at most a week, and asked about again
   after ten minutes rather than six hours. */
const FX_STORED_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const FX_RETRY_MS = 10 * 60 * 1000;
const FX_KEY = "sunat-venta";
let fxCache = { rate: null, at: 0, ttl: FX_TTL_MS };
/* NO OUTSIDE CALL HOLDS THE ANSWER (#443 P0 c.6469467334, 2026-10-28).
   The rate came from SUNAT (4 s) and then, on a miss, from Netlify Blobs
   with no deadline at all: a stalled store held every search until the
   platform killed the function, and the shopper got a bare 502. Each
   step now has a deadline, and the whole rate lookup gets FX_BUDGET_MS
   beside the index load: past it the answer leaves without soles and
   search.html converts with the site's own exchange-rate endpoint, as it
   already does whenever an answer carries no rate. */
const FX_BUDGET_MS = 2500;
const BLOB_TIMEOUT_MS = 1500;
const within = (p, ms) => new Promise((done) => {
  const t = setTimeout(() => done(null), ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); done(v); }, () => { clearTimeout(t); done(null); });
});
function fxStore() {
  try { return getStore("fx"); } catch { return null; }
}
async function storedRate() {
  try {
    const v = await within(fxStore()?.get(FX_KEY, { type: "json" }), BLOB_TIMEOUT_MS);
    if (v && v.venta > 0 && Date.now() - v.at < FX_STORED_MAX_MS) return v.venta;
  } catch { /* no store here (tests, local) */ }
  return null;
}
async function sellRate(fetchImpl = fetch) {
  if (fxCache.rate && Date.now() - fxCache.at < fxCache.ttl) return fxCache.rate;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2000);
    const res = await fetchImpl("https://api.apis.net.pe/v1/tipo-cambio-sunat", { headers: { Accept: "application/json" }, signal: ctl.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (res.ok && typeof data.venta === "number" && data.venta > 0) {
      fxCache = { rate: data.venta, at: Date.now(), ttl: FX_TTL_MS };
      /* Best effort, and never waited on past the deadline. */
      within(fxStore()?.setJSON(FX_KEY, { venta: data.venta, at: Date.now() }), BLOB_TIMEOUT_MS);
      return fxCache.rate;
    }
  } catch { /* SUNAT's proxy is slow or down: the stored rate */ }
  const stored = await storedRate();
  if (stored) fxCache = { rate: stored, at: Date.now(), ttl: FX_RETRY_MS };
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
  try { connectLambda(event); } catch { /* not on Netlify (tests): no stored rate */ }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Access-Control-Allow-Origin": "*" }, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" }, null);
  const qs = event.queryStringParameters || {};
  /* The search boxes' focus ping: load the index, the engine's lazy
     tables (one throwaway query) and the rate; answer nothing. */
  if (qs.warm) {
    try {
      const fxP = sellRate(fetchImpl);
      runQuery(loadSearch({ labels: LABELS }), "zapatillas");
      await within(fxP, FX_BUDGET_MS);
    } catch (e) { console.error("[search] warm", e); }
    return { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };
  }
  const q = String(qs.q || "").slice(0, 120);
  const page = Number(qs.page) || 1;
  try {
    /* The rate is fetched while the index loads, not after it. */
    const fxP = sellRate(fetchImpl);
    const ctx = loadSearch({ labels: LABELS });
    const fx = await within(fxP, FX_BUDGET_MS);
    const store = String(qs.tienda || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    const aud = String(qs.aud || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 10);
    const out = searchPage(ctx, q, page, { fx, store, aud, grid: qs.grid === "1" });
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
