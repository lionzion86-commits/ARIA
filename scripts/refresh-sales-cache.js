// Keeps the Ofertas deals cache warm, on a schedule, with no browser
// involved.
//
//   node scripts/refresh-sales-cache.js
//   node scripts/refresh-sales-cache.js --dry-run   # scan + report, no write
//
// Env:
//   SITE                  defaults to https://ariashop.pe
//   SALES_REFRESH_TOKEN   bearer token the site checks (required to write)
//
// WHY THIS EXISTS
// The deals cache used to be filled by whichever visitor happened to hit a
// cold cache: their browser ran the scan and POSTed the result back. That
// made POST /sales-cache a public write to shared state. Locking it to
// admins closed the hole but left the cache cold almost all the time,
// because admins rarely browse Ofertas — so every visitor paid for a live
// scan again. This script is the way out: a trusted, scheduled writer, and
// no client write path at all.
//
// WHY IT IS A SCRIPT AND NOT A NETLIFY SCHEDULED FUNCTION
// A scan is 12 Apify actor runs, each polled until it finishes — the
// browser path allows up to 2 minutes PER SOURCE (LIVE_POLL_MAX_MS in
// index.html). That does not fit a request-scoped function's execution
// budget, which is exactly why the work was pushed to the client in the
// first place. A scheduled CI job has no such limit, so the scan runs
// here and only the finished result is handed to the site.
//
// It calls the site's own already-deployed scrape functions rather than
// Apify directly, so it reuses the same actor config, the same input
// shapes and the same API key handling as the live site. There is one
// definition of how a scrape is started, and it is not duplicated here.
import {
  SALES_SOURCES,
  normalizeDeal,
  collapseVariants,
} from "./lib/sales-sources.js";
import { FREIGHT_FEATURE_CEILING } from "./lib/item-weight.js";
import { spendDecision, budgetFromEnv, tierFor } from "./lib/refresh-tiers.js";

const SITE = (process.env.SITE || "https://ariashop.pe").replace(/\/$/, "");
const TOKEN = (process.env.SALES_REFRESH_TOKEN || "").trim();
const DRY_RUN = process.argv.includes("--dry-run");

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_MS = 180000;   // a little more headroom than the browser had
const FETCH_TIMEOUT_MS = 30000;
const MAX_ITEMS_PER_SOURCE = 20;
const CONCURRENCY = 4;        // be gentle on Apify and on the functions

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Same start/poll dance the browser does, against the same endpoints.
async function scrapeSource({ retailer, department }) {
  const start = await fetchJson(`${SITE}/.netlify/functions/apify-scrape-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retailer, query: "", maxItems: MAX_ITEMS_PER_SOURCE, department }),
  });
  if (!start?.runId) throw new Error("no runId returned");

  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    const status = await fetchJson(`${SITE}/.netlify/functions/apify-scrape-status?runId=${encodeURIComponent(start.runId)}`);
    if (status?.status === "SUCCEEDED") return status.items || [];
    if (status?.error) throw new Error(status.error);
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(`timed out after ${POLL_MAX_MS / 1000}s`);
}

async function mapWithConcurrency(list, limit, fn) {
  const results = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return results;
}


/* ============================================================
   THE SPEND GUARD (2026-09-20).

   Before this cycle starts a single actor run it projects what the run
   is about to cost and compares it with the per-cycle budget. Over
   budget, a non-essential tier SKIPS and says so at the top of the log
   in a line nobody can miss. Silence is how $88 happens: the incident
   that put this here was 1,000+ runs that nothing ever announced.

   Tier definitions, run counts and the budget live in
   scripts/lib/refresh-tiers.js.
   ============================================================ */
function guardSpend(tierKey) {
  const { costPerRun, budgetUsd } = budgetFromEnv();
  const decision = spendDecision(tierKey, { costPerRun, budgetUsd });
  const tier = tierFor(tierKey);
  console.log(
    `\n  presupuesto: ~${tier?.runs ?? "?"} runs x $${costPerRun} = $${decision.projectedUsd} ` +
      `(tope por ciclo $${decision.budgetUsd})`,
  );
  if (decision.reason) {
    console.log("\n  ====================================================");
    console.log(`  ${decision.reason}`);
    console.log("  ====================================================\n");
  }
  if (!decision.allowed) {
    console.log("  No se ejecutó ningún run de Apify en este ciclo.\n");
    return false;
  }
  return true;
}

async function main() {
  if (!guardSpend("sale")) return;

  console.log(`Refreshing Ofertas cache from ${SITE}`);
  console.log(`${SALES_SOURCES.length} sources, concurrency ${CONCURRENCY}${DRY_RUN ? " (dry run)" : ""}\n`);

  const perSource = await mapWithConcurrency(SALES_SOURCES, CONCURRENCY, async (source) => {
    const label = `${source.retailer}/${source.department}`;
    try {
      const raw = await scrapeSource(source);
      const deals = raw.map((it) => normalizeDeal(it, source.retailer)).filter(Boolean);
      console.log(`  ok    ${label.padEnd(26)} ${String(raw.length).padStart(3)} items -> ${String(deals.length).padStart(3)} deals`);
      return deals;
    } catch (err) {
      // One source failing must not sink the refresh — the cache is still
      // better off updated with what did come back.
      console.error(`  FAIL  ${label.padEnd(26)} ${err.message}`);
      return [];
    }
  });

  const failed = perSource.filter((d) => d.length === 0).length;
  const deals = collapseVariants(perSource.flat());

  console.log(`\n${deals.length} deals after variant collapse (${perSource.flat().length} before)`);

  /* WEIGHT SANITY (2026-09-19). A weight that slips through the category
     tables becomes freight we have quoted and must honour, so nothing
     implausible is allowed to publish quietly. estimateWeightDetail()
     already applied the category floor; this prints what it had to
     correct, so the fix is a real table row rather than a floor. */
  /* Nothing with a doubtful weight reaches this list any more: an
     out-of-band estimate and a title with no category row are both
     dropped before a deal is built (see dealFrom). So what is left to
     report is what IS here — the beauty rows still waiting to be checked
     against a real parcel — and how many were dropped on the way. */
  const beautyEstimated = deals.filter((d) => d.weightSource === "beauty");
  console.log(`  weights: every published deal is inside its category band`);
  console.log(`  freight: nothing over ${Math.round(FREIGHT_FEATURE_CEILING * 100)}% of price is featured (still listed everywhere else)`);
  /* The freight-share DISTRIBUTION, not a pass/fail. There is no badge
     to count any more; this is here so a future absolute-freight
     indicator can be calibrated against real deals rather than guessed. */
  const shares = deals.map((d) => d.freightShare).filter((s) => Number.isFinite(s)).sort((a, b) => a - b);
  if (shares.length) {
    const at = (q) => shares[Math.min(shares.length - 1, Math.floor(q * shares.length))];
    console.log(`  freight share of price — median ${Math.round(at(0.5) * 100)}%, p90 ${Math.round(at(0.9) * 100)}%, max ${Math.round(shares[shares.length - 1] * 100)}%`);
  }
  if (beautyEstimated.length) {
    console.log(`\n  ${beautyEstimated.length} beauty deal(s) on estimated weights — calibrate against the first real order:`);
    for (const d of beautyEstimated.slice(0, 20)) console.log(`    ${d.weightKg}kg  ${d.title.slice(0, 66)}`);
    if (beautyEstimated.length > 20) console.log(`    … and ${beautyEstimated.length - 20} more`);
  }

  // Never replace a good cache with nothing. An empty result is
  // indistinguishable from "every source failed", and publishing it would
  // blank the page for six hours.
  if (!deals.length) {
    console.error("\nRefusing to publish an empty result — leaving the existing cache alone.");
    process.exit(1);
  }
  // Same reasoning, softer case: if most sources failed, the result is
  // real but badly thinned, and overwriting a full cache with it is worse
  // than leaving the old one to age out.
  if (failed > SALES_SOURCES.length / 2) {
    console.error(`\nRefusing to publish: ${failed}/${SALES_SOURCES.length} sources failed.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\nDry run — not publishing.");
    console.log(deals.slice(0, 5).map((d) => `  ${d.retailer}: ${d.title.slice(0, 44)} ${d.originalPrice} -> ${d.price}`).join("\n"));
    return;
  }

  if (!TOKEN) {
    console.error("\nSALES_REFRESH_TOKEN is not set — cannot authenticate the write.");
    process.exit(1);
  }

  const res = await fetchJson(`${SITE}/.netlify/functions/sales-cache`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ items: deals }),
  });
  if (res?.skipped === "fresh") {
    // The staleness gate refused because the cache is still fresh. Not an
    // error: it means something else refreshed it recently.
    console.log(`\nCache was still fresh (built ${res.generatedAt}) — nothing to do.`);
    return;
  }
  console.log(`\nPublished ${res?.stored ?? deals.length} deals at ${res?.generatedAt}`);
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
