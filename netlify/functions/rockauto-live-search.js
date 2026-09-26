/* ============================================================
   rockauto-live-search — Netlify function (2026-09-26)

   Zero-Apify-spend RockAuto fallback for Aria Auto. Triggered by
   the browser ONLY on an Aria Auto cache miss (searchAutoSource
   in index.html routes the RockAuto source here instead of
   scrapeRetailer).

   POST { year, make, model, query }   (query = the raw Spanish
   query the shopper typed; the glossary translation happens here,
   server-side, so the browser never sees raw RockAuto HTML.)

   All RockAuto fetching + parsing happens in
   scripts/lib/rockauto-direct.js. This function adds:
     - input validation
     - per-user concurrency lease (same 2-per-user cap as the
       Apify on-demand flow — no scrape storms)
     - Blobs cache keyed {year}|{make}|{model}|{spanish-query},
       7-day TTL. A cache hit performs ZERO RockAuto requests.
     - raw USD prices in the response — the client's
       normalizeLiveItem() applies Miami-Dade tax + the 24% Aria
       margin, exactly like every other source.
     - RockAuto image paths rewritten to the Aria image proxy
       (/.netlify/functions/rockauto-image); RockAuto images are
       never hotlinked (their robots rules disallow /info/).

   Graceful by contract: every miss — unknown vehicle, unknown
   category, no listings, timeout, fetch failure — returns
   HTTP 200 with { ok:true, items:[], miss } and the shopper gets
   the friendly "Estamos ampliando nuestro catálogo de
   repuestos" empty state. No RockAuto diagnostics ever reach the
   browser.
   ============================================================ */
import { getStore } from "@netlify/blobs";
// JSON is inlined into the bundle by the Netlify bundler — no
// filesystem lookup, so this survives CJS/ESM bundling.
import GLOSSARY_JSON from "../../scripts/lib/es-en-parts-glossary.json" with { type: "json" };
import {
  ROCKAUTO_UA,
  ROCKAUTO_CHARSET,
  ROCKAUTO_LIVE_TTL_MS,
  ROCKAUTO_MAX_LISTINGS,
  rockautoCacheKey,
  runRockautoLiveChain,
  rockautoAbsoluteImage,
  glossaryToPairs,
} from "../../scripts/lib/rockauto-direct.js";
import {
  ondemandUserKey,
  acquireOndemandLease,
  releaseOndemandLease,
} from "./_ondemand.js";

const STORE = "rockauto-live";
const PER_REQUEST_TIMEOUT_MS = 12000;

const GLOSSARY_PAIRS = glossaryToPairs(GLOSSARY_JSON);

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

/* Miss -> shopper-safe payload. The browser turns ANY of these
   into the friendly pending block; the miss code is for logs. */
const gracefulMiss = (miss, extra = {}) =>
  json(200, { ok: true, items: [], miss, cached: false, ...extra });

function cleanStr(v, max) {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return s.length > max ? "" : s;
}

async function readCache(key) {
  try {
    const store = getStore(STORE);
    const hit = await store.get(key, { type: "json" });
    if (!hit || !Array.isArray(hit.items)) return null;
    const age = Date.now() - Date.parse(hit.generatedAt || 0);
    if (!Number.isFinite(age) || age > ROCKAUTO_LIVE_TTL_MS) return null;
    return hit;
  } catch {
    return null; // unreadable cache = miss, never an error
  }
}

async function writeCache(key, payload) {
  try {
    const store = getStore(STORE);
    await store.setJSON(key, { ...payload, items: payload.items.slice(0, ROCKAUTO_MAX_LISTINGS) });
  } catch {
    // Failing to cache is not failing the search.
  }
}

async function fetchRockautoHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": ROCKAUTO_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return new TextDecoder(ROCKAUTO_CHARSET).decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { ok: false });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return gracefulMiss("bad-request");
  }

  const year = cleanStr(body.year, 4);
  const make = cleanStr(body.make, 40);
  const model = cleanStr(body.model, 40);
  const query = cleanStr(body.query, 80);
  if (!/^\d{4}$/.test(year) || !make || !model || !query) {
    return gracefulMiss("bad-request");
  }

  const key = rockautoCacheKey(year, make, model, query);

  /* ---- cache hit: zero RockAuto requests ---- */
  const hit = await readCache(key);
  if (hit) {
    return json(200, {
      ok: true,
      items: hit.items,
      cached: true,
      engine: hit.engine,
      category: hit.category,
      partType: hit.partType,
      translatedQuery: hit.translatedQuery,
      generatedAt: hit.generatedAt,
    });
  }

  /* ---- concurrency lease: 2 live scrapes per user, like on-demand ---- */
  const userKey = await ondemandUserKey(event).catch(() => "a:unknown");
  const runId = `rockauto-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const lease = await acquireOndemandLease(userKey, runId).catch(() => ({ ok: false }));
  if (!lease || !lease.ok) {
    return json(429, {
      ok: false,
      rateLimited: true,
      error: "Demasiadas búsquedas a la vez — inténtalo de nuevo en un momento.",
    });
  }

  try {
    const chain = await runRockautoLiveChain({
      year,
      make,
      model,
      query,
      entries: GLOSSARY_PAIRS,
      fetchHtml: fetchRockautoHtml,
    });

    if (!chain.ok) return gracefulMiss(chain.miss);

    const host = event.headers?.["x-forwarded-host"] || event.headers?.host || "ariashop.pe";
    const items = chain.items.map((it) => ({
      // RAW USD — normalizeLiveItem() in the browser applies the
      // Miami-Dade sales tax and the 24% Aria margin.
      title: `${it.brand} ${it.partType} ${it.partNumber}`.trim(),
      price: it.priceUsd,
      brand: it.brand,
      // Top-level on purpose: the card's partNumberOf() reads
      // raw.partNumber (and raw.brand as the line code), and the
      // "Similares de otras marcas" rail reads raw.partType.
      partNumber: it.partNumber,
      partType: it.partType,
      engine: it.engine,
      category: it.category,
      image: `https://${host}/.netlify/functions/rockauto-image?u=${encodeURIComponent(
        rockautoAbsoluteImage(it.imagePath).replace("https://www.rockauto.com", ""),
      )}`,
      retailer: "rockauto",
      raw: { partNumber: it.partNumber, brand: it.brand, partType: it.partType },
    }));

    const payload = {
      key,
      items,
      engine: chain.engine,
      category: chain.category,
      partType: chain.partType,
      translatedQuery: chain.translatedQuery,
      query,
      vehicle: { year, make, model },
      generatedAt: new Date().toISOString(),
    };
    await writeCache(key, payload);

    return json(200, { ok: true, cached: false, ...payload });
  } finally {
    await releaseOndemandLease(userKey, runId).catch(() => {});
  }
}
