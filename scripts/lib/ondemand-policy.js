/* ============================================================
   ON-DEMAND STORE SEARCH — the policy, with no storage attached.

   The numbers and the rules that decide when we spend money on a live
   Apify run live here, apart from the Netlify Blobs code that enforces
   them (netlify/functions/_ondemand.js). Two reasons for the split:

   1. This file can be imported and tested without @netlify/blobs, so the
      cap, the TTLs and the cache key are covered by `npm test` rather
      than by hoping.
   2. index.html mirrors the cap so its button can refuse instantly, and
      a mirrored number needs one place to be mirrored FROM. A test
      asserts the page's copy matches this one.
   ============================================================ */

/* Under this many results, a feed is thin enough that offering to go and
   look in a real store beats showing another row of filters. */
export const THIN_RESULT_COUNT = 10;

/* Deeper than the five-per-store fan-out that just came back thin — the
   point of asking is that we look properly this time. */
export const ON_DEMAND_MAX_ITEMS = 24;

/* THE SPEND GUARD. Each on-demand search is a real Apify run: 30-90
   seconds and a cent or three. Two in flight per user is enough to
   compare two stores at once and not enough to fan out across the
   catalogue — which is what an unguarded button would let one bored
   person do to the bill. */
export const MAX_CONCURRENT_PER_USER = 2;

/* How long a result stays servable. Six hours matches the Ofertas cache:
   long enough that a popular query is paid for once a morning, short
   enough that a price cannot go badly stale before checkout (where the
   whole cart is re-quoted against live figures anyway). */
export const ONDEMAND_TTL_MS = 6 * 60 * 60 * 1000;

/* A lease older than this is assumed dead. A browser closed mid-poll
   never releases its slot, and without an expiry that shopper would be
   capped out forever. Comfortably longer than the client's own 120s
   polling deadline. */
export const LEASE_TTL_MS = 3 * 60 * 1000;

/**
 * The shared cache key for one store + one query.
 *
 * Normalised hard on purpose: "  Blue   JEANS ", "blue jeans" and
 * "Blue-Jeans" are one question, and paying for three Apify runs to
 * answer it three times is the exact waste this cache exists to stop.
 * Accents are folded too — a shopper typing "camison" and one typing
 * "camisón" want the same thing.
 */
export function ondemandCacheKey(retailer, query) {
  const r = String(retailer || "").toLowerCase().trim();
  const q = String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
  return `${r}::${q}`;
}

/** True when a cache entry written at `generatedAt` is still servable. */
export function ondemandCacheIsFresh(generatedAt, now = Date.now()) {
  const ageMs = now - new Date(generatedAt).getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ONDEMAND_TTL_MS;
}

/**
 * The leases in a stored record that are still alive.
 *
 * Expired ones are dropped on every read, so the record cannot grow
 * without bound and a dead browser frees its slot on its own.
 */
export function liveLeases(record, now = Date.now()) {
  const runs = record && typeof record === "object" && record.runs ? record.runs : {};
  const alive = {};
  for (const [runId, startedAt] of Object.entries(runs)) {
    if (Number.isFinite(startedAt) && now - startedAt < LEASE_TTL_MS) alive[runId] = startedAt;
  }
  return alive;
}

/** Is this user allowed to start another run right now? */
export function canStartAnotherRun(inFlight) {
  return Number(inFlight) < MAX_CONCURRENT_PER_USER;
}
