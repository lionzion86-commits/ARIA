// Polled by the client after apify-scrape-start.js kicks off a run.
// Checks the run's status, and once it has finished successfully, fetches
// and returns its dataset items in the same response (one extra fast call,
// still well within Netlify's function timeout).
//
// IT IS ALSO WHERE THE ON-DEMAND CACHE IS WRITTEN (2026-09-20), and that
// is deliberate: this is the only place in the system that holds real
// Apify output AND, via the runId the start call recorded, the retailer
// and query it was really run for. Writing the cache here means nothing a
// browser asserts can ever enter it — see netlify/functions/_ondemand.js
// for why that matters. It is also where the run's concurrency lease is
// released, on success and on failure alike.
import { connectLambda } from "@netlify/blobs";
import {
  readOndemandRun, forgetOndemandRun, writeOndemandCache, releaseOndemandLease,
} from "./_ondemand.js";

const TERMINAL_FAILURE_STATUSES = ["FAILED", "ABORTED", "TIMED-OUT"];

/* Bookkeeping must never break a search that actually worked: the
   shopper already has their results, and a storage blip is our problem,
   not theirs. Every call here is best-effort and swallowed. */
async function settleOndemandRun(runId, items) {
  try {
    const meta = await readOndemandRun(runId);
    if (!meta) return;   // not an on-demand run, or already settled
    if (Array.isArray(items) && items.length) {
      await writeOndemandCache(meta.retailer, meta.query, items);
    }
    await releaseOndemandLease(meta.userKey, runId);
    await forgetOndemandRun(runId);
  } catch { /* the lease expires on its own; the next shopper pays a run */ }
}

export async function handler(event) {
  connectLambda(event);
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const runId = event.queryStringParameters?.runId;
  if (!runId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "runId is required" }),
    };
  }

  try {
    const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${process.env.APIFY_API_KEY}` },
    });
    const runJson = await runResponse.json();

    if (!runResponse.ok) {
      return {
        statusCode: runResponse.status,
        headers,
        body: JSON.stringify({ error: runJson?.error?.message || "Failed to check Apify run status" }),
      };
    }

    const status = runJson.data.status;

    if (status === "SUCCEEDED") {
      const datasetId = runJson.data.defaultDatasetId;
      const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true`, {
        headers: { Authorization: `Bearer ${process.env.APIFY_API_KEY}` },
      });
      const items = await itemsResponse.json();

      if (!itemsResponse.ok) {
        return {
          statusCode: itemsResponse.status,
          headers,
          body: JSON.stringify({ error: "Failed to fetch dataset items" }),
        };
      }

      // Cache what Apify actually returned, under the key the start call
      // recorded, and hand this run's slot back.
      await settleOndemandRun(runId, items);

      return { statusCode: 200, headers, body: JSON.stringify({ status, items }) };
    }

    if (TERMINAL_FAILURE_STATUSES.includes(status)) {
      // A failed run caches nothing but must still free the slot, or a
      // shopper whose scrape died would be capped out for three minutes.
      await settleOndemandRun(runId, null);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status, error: `Actor run ended with status ${status}` }),
      };
    }

    // Still READY/RUNNING/TIMING-OUT/ABORTING — client should keep polling.
    return { statusCode: 200, headers, body: JSON.stringify({ status }) };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
