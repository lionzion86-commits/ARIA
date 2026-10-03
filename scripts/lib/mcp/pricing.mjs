/* ============================================================
   THE TWO NUMBERS THE PAGE COMPUTES AT RENDER TIME, NOT AT INGEST.

   Everything else about a price — the tiered margin, the per-retailer
   Miami sales tax, the dutiable base — is settled inside index.html's
   normalizeLiveItem and reaches the connector already stamped on the
   item (see page-slices.mjs). Two things are not, because the page does
   them later: the soles figure, which needs today's rate, and the
   freight line, which needs the item's weight.

   NEITHER IS REINVENTED HERE. freightForWeight calls the page's own
   freightUsd, so the $13/kg rate has exactly one definition that the
   connector can see. Only the soles conversion is local, and only
   because the page does it in a render helper tangled up with DOM
   formatting.

   THE RATE IS THE VENTA RATE, which is what dollars actually cost a
   shopper buying them — the same rate checkout charges in. SUNAT via
   api.apis.net.pe, the same source netlify/functions/exchange-rate.js
   uses. If it cannot be reached, price_pen is null. It is never a
   guess: a made-up exchange rate on a storefront whose whole argument
   is "the price you see is the price you pay" is the worst possible
   thing to invent.
   ============================================================ */

/* TWO SOURCES, THE SITE'S OWN ONE FIRST.

   netlify/functions/exchange-rate.js already fetches SUNAT, validates
   compra/venta and caches the answer for 24h at the CDN. Asking it is
   therefore cheaper and better-behaved than hitting apis.net.pe
   directly — that upstream 429s on repeated calls, which the site's own
   comment records discovering the hard way — and it guarantees the
   connector quotes the same rate the shopper is charged at checkout
   rather than one fetched seconds apart.

   SUNAT direct is the fallback, for running this server somewhere the
   site is not reachable. ARIA_FX_URL overrides both, which is how the
   preview points at its own deploy. */
export const FX_SOURCES = [
  process.env.ARIA_FX_URL,
  "https://ariashop.pe/.netlify/functions/exchange-rate",
  "https://api.apis.net.pe/v1/tipo-cambio-sunat",
].filter(Boolean);
/** @deprecated kept so a caller naming the upstream still resolves. */
export const FX_SOURCE = FX_SOURCES[FX_SOURCES.length - 1];
const FX_TTL_MS = 12 * 60 * 60 * 1000;
const FX_TIMEOUT_MS = 4000;

/** Soles, at the venta rate, or null when no real rate is in hand. */
export function pricePen(usd, fx) {
  const rate = fx && Number.isFinite(fx.venta) ? fx.venta : null;
  if (rate === null) return null;
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * rate * 100) / 100;
}

/** Freight to Peru, from the page's own $13/kg rate. */
export function freightForWeight(weightKg, engine) {
  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return engine.pricing.freightUsd(kg);
}

/** A whole-percent markdown, or null when there is no real original. */
export function discountPct(price, originalPrice) {
  const p = Number(price), o = Number(originalPrice);
  if (!Number.isFinite(p) || !Number.isFinite(o) || o <= p || p <= 0) return null;
  return Math.round(((o - p) / o) * 100);
}

/**
 * The venta rate, cached, never invented.
 * Returns { venta, compra, fetchedAt } or { venta: null, error }.
 */
export function createFxCache({ fetchImpl = fetch, now = () => Date.now(), sources = FX_SOURCES } = {}) {
  let cached = null;
  let inflight = null;

  async function fromSource(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FX_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: ac.signal });
      if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
      const data = await res.json();
      if (typeof data?.venta !== "number" || typeof data?.compra !== "number") {
        throw new Error(`${url} did not return numeric compra/venta`);
      }
      /* A rate that is not a plausible soles figure is a broken source
         answering 200, which is worse than a source that is down. */
      if (!(data.venta > 1 && data.venta < 20)) {
        throw new Error(`${url} returned an implausible venta rate (${data.venta})`);
      }
      return { venta: data.venta, compra: data.compra, fetchedAt: now(), error: null, source: url };
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh() {
    const tried = [];
    for (const url of sources) {
      try {
        cached = await fromSource(url);
        return cached;
      } catch (e) { tried.push(e.message); }
    }
    const why = tried.join("; ") || "no exchange rate source configured";
    /* A STALE REAL RATE BEATS NO RATE. Only if we have never had one
       does price_pen go null. */
    if (cached && cached.venta !== null) { cached = { ...cached, error: why }; return cached; }
    cached = { venta: null, compra: null, fetchedAt: now(), error: why };
    return cached;
  }

  return {
    /** Current rate, refreshing in the background when stale. */
    get() {
      const fresh = cached && cached.venta !== null && (now() - cached.fetchedAt) < FX_TTL_MS;
      if (!fresh && !inflight) {
        inflight = refresh().finally(() => { inflight = null; });
      }
      return cached || { venta: null, compra: null, error: "exchange rate not fetched yet" };
    },
    /** Await a rate — used once at boot so the first caller is not short-changed. */
    async warm() {
      if (!inflight) inflight = refresh().finally(() => { inflight = null; });
      await inflight;
      return cached;
    },
    _set(v) { cached = v; },
  };
}
