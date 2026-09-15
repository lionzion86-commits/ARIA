// Polled by the client after apify-scrape-start.js kicks off a run.
// Checks the run's status, and once it has finished successfully, fetches
// and returns its dataset items in the same response (one extra fast call,
// still well within Netlify's function timeout).
const TERMINAL_FAILURE_STATUSES = ["FAILED", "ABORTED", "TIMED-OUT"];

export async function handler(event) {
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

      return { statusCode: 200, headers, body: JSON.stringify({ status, items }) };
    }

    if (TERMINAL_FAILURE_STATUSES.includes(status)) {
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
