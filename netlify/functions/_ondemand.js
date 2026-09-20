/* ============================================================
   ON-DEMAND STORE SEARCH — the shared cache and the spend guard.

   WHAT THIS IS FOR
   A shopper searches for something we do not have cached, gets three
   results or none, and the honest answer is "we can go and look right
   now". That is a live Apify run, it takes 30-90 seconds, and it COSTS
   MONEY — roughly 1-3 cents a run. Unguarded, a hundred shoppers typing
   "jeans" is a hundred runs for one answer, and one bored person with a
   keyboard is an unbounded bill. This module is the two guards that make
   the feature safe to ship: a shared result cache, and a per-user cap on
   how many runs can be in flight at once.

   WHY THE CACHE IS WRITTEN SERVER SIDE, FROM APIFY'S OWN RESPONSE
   The obvious design — let the browser POST what it scraped — is a cache
   poisoning hole: anyone could write any title and any price under any
   query, and the next shopper would see it priced and buyable. So
   nothing a client says ever enters this cache. Instead:

     apify-scrape-start   records runId -> { retailer, query } at the
                          moment it builds the actor input, because that
                          is the one place the server knows both for
                          certain.
     apify-scrape-status  on SUCCEEDED, looks that mapping up and writes
                          the items IT fetched from Apify under that key.

   The client picks neither the key nor the contents. The worst a hostile
   caller can do is spend their own two concurrent runs.

   NOT ATOMIC, AND KNOWN. Netlify Blobs gives read-modify-write, not
   compare-and-swap, so two runs started in the same instant can both see
   a free slot. Same tradeoff the daily order counter already documents:
   the cap is a spend guard, not a security boundary, and being off by one
   under a race costs cents. A real limiter needs a different primitive
   than Blobs offers; flagged here rather than silently assumed perfect.
   ============================================================ */
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { getSessionEmail } from "./_auth-helpers.js";
/* The numbers and the rules live in scripts/lib/ondemand-policy.js, which
   imports nothing — so `npm test` can cover the cap, the TTLs and the
   cache key without @netlify/blobs installed. This file is the storage
   that enforces them, and nothing else. */
import {
  ondemandCacheKey, ondemandCacheIsFresh, liveLeases, canStartAnotherRun,
  MAX_CONCURRENT_PER_USER, ONDEMAND_TTL_MS, LEASE_TTL_MS,
} from "../../scripts/lib/ondemand-policy.js";

export { ondemandCacheKey, MAX_CONCURRENT_PER_USER, ONDEMAND_TTL_MS, LEASE_TTL_MS };

export const ONDEMAND_RESULTS_STORE = "ondemand-search";
export const ONDEMAND_RUNS_STORE = "ondemand-runs";
export const ONDEMAND_LEASES_STORE = "ondemand-leases";

/**
 * Who to count runs against.
 *
 * A signed-in shopper is counted by their account. Everyone else is
 * counted by their connection IP, HASHED — the cap needs to tell two
 * visitors apart, which a hash does; it does not need to know where
 * anybody lives, so we do not keep that. No raw IP is ever stored.
 */
export async function ondemandUserKey(event) {
  const email = await getSessionEmail(event).catch(() => null);
  if (email) return "u:" + createHash("sha256").update(email).digest("hex").slice(0, 24);
  const ip = event?.headers?.["x-nf-client-connection-ip"]
    || event?.headers?.["client-ip"]
    || (event?.headers?.["x-forwarded-for"] || "").split(",")[0].trim()
    || "unknown";
  return "a:" + createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

/** A cached result set for this retailer+query, or null when there is none worth serving. */
export async function readOndemandCache(retailer, query) {
  try {
    const store = getStore(ONDEMAND_RESULTS_STORE);
    const hit = await store.get(ondemandCacheKey(retailer, query), { type: "json" });
    if (!hit || !Array.isArray(hit.items)) return null;
    if (!ondemandCacheIsFresh(hit.generatedAt)) return null;
    return { items: hit.items, generatedAt: hit.generatedAt };
  } catch {
    // A cache that cannot be read is a cache miss, never an error the
    // shopper sees: the run still works, it just costs a run.
    return null;
  }
}

/**
 * Write a finished run's items under the key the START call recorded.
 *
 * `items` here are the ones apify-scrape-status fetched from Apify
 * itself. Nothing a browser sent reaches this function.
 */
export async function writeOndemandCache(retailer, query, items) {
  try {
    const store = getStore(ONDEMAND_RESULTS_STORE);
    await store.setJSON(ondemandCacheKey(retailer, query), {
      retailer,
      query,
      items: Array.isArray(items) ? items.slice(0, 50) : [],
      generatedAt: new Date().toISOString(),
    });
  } catch {
    // Failing to cache is not failing the search — the shopper already
    // has their results in hand. It only costs the next shopper a run.
  }
}

/* ------------------------------------------------------------
   RUN BOOKKEEPING — what lets the cache be written safely.
   ------------------------------------------------------------ */

export async function recordOndemandRun(runId, meta) {
  try {
    await getStore(ONDEMAND_RUNS_STORE).setJSON(String(runId), { ...meta, startedAt: Date.now() });
  } catch { /* the run still works; it just will not be cached */ }
}

export async function readOndemandRun(runId) {
  try {
    return await getStore(ONDEMAND_RUNS_STORE).get(String(runId), { type: "json" });
  } catch { return null; }
}

export async function forgetOndemandRun(runId) {
  try { await getStore(ONDEMAND_RUNS_STORE).delete(String(runId)); } catch { /* best effort */ }
}

/* ------------------------------------------------------------
   THE CONCURRENCY LEASE.
   ------------------------------------------------------------ */

/** How many on-demand runs this user has in flight right now. */
export async function ondemandInFlight(userKey) {
  try {
    const record = await getStore(ONDEMAND_LEASES_STORE).get(userKey, { type: "json" });
    return Object.keys(liveLeases(record)).length;
  } catch { return 0; }
}

/**
 * Claim a slot. Returns { ok } or { ok: false, inFlight, limit }.
 *
 * Expired leases are dropped on the way past, so the record cannot grow
 * without bound and a closed browser never locks anyone out.
 */
export async function acquireOndemandLease(userKey, runId) {
  try {
    const store = getStore(ONDEMAND_LEASES_STORE);
    const alive = liveLeases(await store.get(userKey, { type: "json" }));
    const inFlight = Object.keys(alive).length;
    if (!canStartAnotherRun(inFlight)) {
      return { ok: false, inFlight, limit: MAX_CONCURRENT_PER_USER };
    }
    alive[String(runId)] = Date.now();
    await store.setJSON(userKey, { runs: alive });
    return { ok: true, inFlight: inFlight + 1, limit: MAX_CONCURRENT_PER_USER };
  } catch {
    // A lease store that is unreachable must not take the feature down
    // with it. Failing open costs at most a few cents of Apify; failing
    // closed would break search for everyone on a storage blip.
    return { ok: true, inFlight: 0, limit: MAX_CONCURRENT_PER_USER, degraded: true };
  }
}

export async function releaseOndemandLease(userKey, runId) {
  if (!userKey) return;
  try {
    const store = getStore(ONDEMAND_LEASES_STORE);
    const alive = liveLeases(await store.get(userKey, { type: "json" }));
    delete alive[String(runId)];
    await store.setJSON(userKey, { runs: alive });
  } catch { /* the lease expires on its own within LEASE_TTL_MS */ }
}
