// Secure middleman for a real USD/PEN exchange rate — replaces the old
// hardcoded 3.8 rate that used to sit in checkout.html. Source: SUNAT
// (Peru's own tax authority), via the free public api.apis.net.pe proxy —
// no API key required, no secret to configure. Returns real compra
// (buy) and venta (sell) rates; checkout.html uses venta to compute the
// actual soles amount charged, and shows both with plain-language labels
// so the customer understands which one applies to them.
//
// SOLES ON EVERY CARD (#443 c.6629812301, Danny: "we only show soles").
// Danny's Diseñador screenshots read «US$ 119.41» and «+ US$ 156.84 IMP»:
// every card page falls back to dollars when this endpoint gives no rate,
// and two things made that happen far more than SUNAT is ever down:
//   1. a failed answer carried the success headers, "public,
//      max-age=86400" -- one 429 from the proxy (it rate-limits rapid
//      repeat calls) was then kept by the browser and the CDN for a day,
//      and every page on that phone read dollars until it expired;
//   2. there was no second source: search.js already keeps SUNAT's last
//      good venta in Netlify Blobs (#416) and prices in soles with it,
//      but this endpoint, which every other page asks, did not.
// Now: SUNAT (4 s) -> its last good answer, kept in the same "fx" store
// for up to a week and returned with `stale: true` and its own fecha ->
// an error that is never cached. orders-create still refuses to charge
// without a venta; a stored one is a real SUNAT rate, labelled with its
// date (checkout shows the origen).
import { getStore, connectLambda } from "@netlify/blobs";

const SUNAT_URL = "https://api.apis.net.pe/v1/tipo-cambio-sunat";
const SUNAT_TIMEOUT_MS = 4000;
const BLOB_TIMEOUT_MS = 1500;
export const STORED_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/* search.js's key holds { venta, at }; this one the whole answer. */
const FULL_KEY = "sunat-tc";
const VENTA_KEY = "sunat-venta";

const within = (p, ms) => new Promise((done) => {
  const t = setTimeout(() => done(null), ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); done(v); }, () => { clearTimeout(t); done(null); });
});
function defaultStore() {
  try { return getStore("fx"); } catch { return null; }
}

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
/* Client also caches a fresh answer for 24h (localStorage) — this header
   lets any intermediate cache (browser/CDN) do the same without a repeat
   round trip, and keeps us well clear of apis.net.pe's own rate limit
   (confirmed via a real test call: it 429s on rapid repeated hits). A
   stored answer is held ten minutes, so today's rate replaces it soon;
   an error is never held at all. */
export const CACHE_FRESH = "public, max-age=86400";
export const CACHE_STORED = "public, max-age=600";
export const CACHE_ERROR = "no-store";
const reply = (statusCode, body, cache) => ({
  statusCode,
  headers: { ...BASE_HEADERS, "Content-Type": "application/json", "Cache-Control": cache },
  body: JSON.stringify(body),
});

async function storedAnswer(store) {
  if (!store) return null;
  const full = await within(store.get(FULL_KEY, { type: "json" }), BLOB_TIMEOUT_MS);
  if (full && full.venta > 0 && Date.now() - full.at < STORED_MAX_MS) {
    return { compra: typeof full.compra === "number" ? full.compra : null, venta: full.venta, fecha: full.fecha || null, origen: full.origen || "SUNAT", stale: true };
  }
  const v = await within(store.get(VENTA_KEY, { type: "json" }), BLOB_TIMEOUT_MS);
  if (v && v.venta > 0 && Date.now() - v.at < STORED_MAX_MS) {
    return { compra: null, venta: v.venta, fecha: new Date(v.at).toISOString().slice(0, 10), origen: "SUNAT", stale: true };
  }
  return null;
}

export async function handler(event, context = {}) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { ...BASE_HEADERS, "Cache-Control": CACHE_FRESH }, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return reply(405, { error: "Method not allowed" }, CACHE_ERROR);
  }

  try { connectLambda(event); } catch { /* not on Netlify (tests): no store */ }
  const fetchImpl = context.fetchImpl || fetch;
  const store = context.fxStore !== undefined ? context.fxStore : defaultStore();

  let problem;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SUNAT_TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(SUNAT_URL, { headers: { Accept: "application/json" }, signal: ctl.signal });
    } finally { clearTimeout(timer); }

    const rawBody = await res.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = null;
      problem = { status: 502, error: `Exchange rate source returned a non-JSON response (HTTP ${res.status})`, bodySnippet: rawBody.slice(0, 300) };
    }

    if (data && res.ok && typeof data.compra === "number" && typeof data.venta === "number" && data.venta > 0) {
      const body = { compra: data.compra, venta: data.venta, fecha: data.fecha || null, origen: data.origen || "SUNAT" };
      /* Best effort, never waited on past its deadline. */
      if (store) {
        const at = Date.now();
        await within(Promise.all([
          store.setJSON(FULL_KEY, { ...body, at }),
          store.setJSON(VENTA_KEY, { venta: body.venta, at }),
        ]), BLOB_TIMEOUT_MS);
      }
      return reply(200, body, CACHE_FRESH);
    }
    if (!problem) problem = { status: res.ok ? 502 : res.status, error: "Exchange rate source did not return valid compra/venta rates" };
  } catch (error) {
    problem = { status: 500, error: error.message };
  }

  /* SUNAT is slow or down: its last good answer, labelled as such. */
  try {
    const stored = await storedAnswer(store);
    if (stored) return reply(200, stored, CACHE_STORED);
  } catch { /* no store */ }

  const { status, ...body } = problem;
  return reply(status, body, CACHE_ERROR);
}
