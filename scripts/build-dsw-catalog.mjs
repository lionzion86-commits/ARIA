#!/usr/bin/env node
/* ============================================================
   dsw-catalog.json — THE DSW PULL AND INGEST (Issue #443,
   c.6323171170 as amended by c.6323202929: gate lifted).

   ONE COMMAND, THREE STEPS, AND NOTHING IS SPENT UNTIL YOU SAY SO.

     node scripts/build-dsw-catalog.mjs
         Prints the ESTIMATED COST of the pull and stops. Spends nothing.
         Exit code 2: "not confirmed".

     node scripts/build-dsw-catalog.mjs --confirm-spend [--quote <usd>]
         Runs the pull: best sellers + ALL sale/clearance first (phase 1),
         then the category depth (phase 2), one actor run per quota
         (CATALOG_QUOTAS.dsw in scripts/lib/catalog-quotas.js). After
         every run it re-projects the total from what Apify reports the
         run cost; if the projection is materially above the quote (+25%)
         it STOPS, saves what it has, and says so — post that on the issue
         before going on. Then it ingests (below).

     node scripts/build-dsw-catalog.mjs --src <raw.json>
         Ingest only, from a raw pull saved earlier (or an export of the
         same shape made by hand in the Apify console). Spends nothing.

   WHERE THE RUNS GO
     --via site   (default) through the site's own deployed functions,
                  like scripts/refresh-department-cache.js: POST
                  <site>/.netlify/functions/apify-scrape-start with
                  { retailer: "dsw", department }. Needs RETAILER_CONFIG.dsw
                  live on that deploy (DSW_ACTOR_ID + APIFY_API_KEY set in
                  its environment). --site <url> picks the deploy
                  (default https://ariashop.pe, or ARIA_SITE). The function
                  caps a config-driven browse at 200 items per run, so
                  "all sale" is capped at 200 per quota on this path and
                  the estimate says so.
     --via apify  straight to the Apify API from this machine, with
                  APIFY_API_KEY and DSW_ACTOR_ID in the environment (never
                  in the repo). No deploy needed; no 200 cap.

   INGEST (scripts/lib/dsw.js holds every rule; dsw-store-tests pin them)
     - per-row currency must be USD (stated by the row; --assume-usd only
       for an actor whose own docs state US dollars, and every such row
       is flagged currencyAssumed);
     - price inside the sanity band ($5-$400, --min-usd/--max-usd), and
       no absurd was-price: outside it the row is QUARANTINED to
       data/dsw/quarantine-<stamp>.json for a person, not published;
     - shippable only: out of stock, store-only, oversize/freight and the
       site's own isShippableItem all drop;
     - real weight (via the checkout's specWeightKg), dimensions, spec
       table, checksum-valid GTIN/UPC, gallery (up to 8), sizes exactly
       as scraped, the PDP's own first 1-2 sentences.
   Then the site's weight estimator fills the weights the PDP did not
   publish (apply-weight-estimates.py, flagged weightEstimated), exactly
   as for Best Buy.

   AFTER IT WRITES dsw-catalog.json — the launch, in order:
     GROQ_API_KEY=... node scripts/translate-catalog-descriptions.mjs dsw-catalog.json
     (flip `pendingCatalog` off: scripts/lib/retailers.js, the app
      bundle's RETAILERS mirror (rehash), tienda.html STORES.dsw)
     node scripts/build-store-slices.mjs
     node scripts/build-ofertas-feed.mjs && node scripts/build-ofertas-slices.mjs
     node scripts/build-search-index.mjs && node scripts/build-price-index.mjs
     node scripts/build-pdp-slices.mjs && node scripts/build-department-slices.mjs
     node scripts/build-brand-index.mjs && node scripts/build-home-shelves.mjs
     node scripts/test/dsw-store-tests.mjs
   dsw-store-tests fails while the catalogue has products and the flag is
   still on (or the reverse), or while any description is still English.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DSW_KEY, OUT_FILE, DSW_SALE_MAX, PRICE_BAND_USD, pullPlan, dswActorInput, costRatesFromEnv,
  estimatePull, formatEstimate, spendCheck, ingestPull, productCount,
} from "./lib/dsw.js";
import { DEFAULT_COST_PER_RUN_USD } from "./lib/refresh-tiers.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SITE_CAP = 200;              // apify-scrape-start's ceiling for a config-driven browse
const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 60000;
/* Raw pulls and quarantined rows: never served, never committed to main
   (data/dsw/ is gitignored). DSW_DATA_DIR moves them (the tests use it). */
const DATA_DIR = process.env.DSW_DATA_DIR ? resolve(process.env.DSW_DATA_DIR) : join(ROOT, "data/dsw");

function parseArgs(argv) {
  const a = { via: "site", site: process.env.ARIA_SITE || "https://ariashop.pe" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--confirm-spend") a.confirm = true;
    else if (k === "--estimate-only") a.estimateOnly = true;
    else if (k === "--via") a.via = next();
    else if (k === "--site") a.site = next();
    else if (k === "--quote") a.quote = Number(next());
    else if (k === "--sale-max") a.saleMax = Number(next());
    else if (k === "--urls") a.urls = next();
    else if (k === "--only") a.only = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--src") a.src = next();
    else if (k === "--out") a.out = next();
    else if (k === "--assume-usd") a.assumeUsd = true;
    else if (k === "--min-usd") a.minUsd = Number(next());
    else if (k === "--max-usd") a.maxUsd = Number(next());
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--ingest-partial") a.ingestPartial = true;
    else if (k === "--no-weight-estimates") a.noWeightEstimates = true;
    else throw new Error(`unknown option ${k}`);
  }
  if (!["site", "apify"].includes(a.via)) throw new Error(`--via must be site or apify, not ${a.via}`);
  return a;
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJson(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: c.signal });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, body };
  } finally { clearTimeout(t); }
}

/* ---------------- the two run paths ---------------- */
const viaSite = (site) => ({
  async start(quota) {
    const r = await fetchJson(`${site}/.netlify/functions/apify-scrape-start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retailer: DSW_KEY, department: quota.department, maxItems: quota.maxItems }),
    });
    if (!r.ok) {
      const e = r.body || {};
      throw new Error(e.pendingIntegration
        ? `the deployed function at ${site} has no DSW actor configured (RETAILER_CONFIG.dsw is null there: set DSW_ACTOR_ID and deploy this branch's apify-scrape-start.js)`
        : `start failed (${r.status}): ${typeof e.error === "string" ? e.error : JSON.stringify(e.error)}`);
    }
    return r.body.runId;
  },
  async poll(runId) {
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const r = await fetchJson(`${site}/.netlify/functions/apify-scrape-status?runId=${encodeURIComponent(runId)}`);
      if (!r.ok) throw new Error(`status failed (${r.status})`);
      if (r.body.status === "SUCCEEDED") return { items: r.body.items || [], usageUsd: r.body.usageUsd };
      if (r.body.error) throw new Error(String(r.body.error));
      await wait(POLL_MS);
    }
    throw new Error("run timed out");
  },
});

const viaApify = (token, actorId) => {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async start(quota) {
      const r = await fetchJson(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(dswActorInput(quota, quota.maxItems)),
      });
      if (!r.ok) throw new Error(`start failed (${r.status}): ${r.body?.error?.message || JSON.stringify(r.body).slice(0, 200)}`);
      return r.body.data.id;
    },
    async poll(runId) {
      const deadline = Date.now() + RUN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const r = await fetchJson(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, { headers: auth });
        if (!r.ok) throw new Error(`status failed (${r.status})`);
        const run = r.body.data;
        if (run.status === "SUCCEEDED") {
          const items = await fetchJson(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true`, { headers: auth }, 5 * 60 * 1000);
          if (!items.ok) throw new Error("dataset fetch failed");
          return { items: Array.isArray(items.body) ? items.body : [], usageUsd: Number(run.usageTotalUsd) };
        }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) throw new Error(`run ended ${run.status}`);
        await wait(POLL_MS);
      }
      throw new Error("run timed out");
    },
  };
};

/* ---------------- ingest ---------------- */
async function ingestContext(args) {
  const { loadShippable } = await import("./build-store-slices.mjs");
  const { specWeightKg } = await import("../netlify/functions/_weight-resolve.js");
  return {
    assumeUsd: Boolean(args.assumeUsd),
    band: { min: Number.isFinite(args.minUsd) ? args.minUsd : PRICE_BAND_USD.min, max: Number.isFinite(args.maxUsd) ? args.maxUsd : PRICE_BAND_USD.max },
    isShippableItem: loadShippable(ROOT),
    specWeightKg: (x) => specWeightKg(x),
  };
}

function printIngestReport(stats, quarantinePath) {
  console.log(`\n  DSW ingest: ${stats.published} published of ${stats.rows} rows`);
  console.log(`    per bucket:     ${JSON.stringify(stats.perBucket)}`);
  console.log(`    on sale:        ${stats.onSale}`);
  console.log(`    real weight:    ${stats.realWeight}  (published by DSW; the rest get the site's estimate, flagged)`);
  console.log(`    GTIN/UPC:       ${stats.gtin}`);
  console.log(`    size runs:      ${stats.withSizes}  (as scraped; none invented)`);
  console.log(`    galleries (2+): ${stats.gallery}`);
  console.log(`    PDP sentences:  ${stats.described}  (English until translate-catalog-descriptions.mjs runs)`);
  if (stats.currencyAssumed) console.log(`    currency ASSUMED USD (--assume-usd): ${stats.currencyAssumed}`);
  console.log(`    dropped:        ${JSON.stringify(stats.dropped)}`);
  const q = Object.values(stats.quarantined).reduce((a, b) => a + b, 0);
  console.log(`    QUARANTINED:    ${q} ${JSON.stringify(stats.quarantined)}${q ? `  -> ${quarantinePath}` : ""}`);
}

async function ingestAndWrite(pulled, args, meta = {}) {
  const ctx = await ingestContext(args);
  const { catalog, quarantined, stats } = ingestPull(pulled, ctx);
  const s = meta.stamp || stamp();
  const qPath = join(DATA_DIR, `quarantine-${s}.json`);
  printIngestReport(stats, qPath);
  if (args.dryRun) { console.log("\n  --dry-run: nothing written"); return { catalog, stats }; }
  if (!productCount(catalog)) {
    console.error("\n  refusing to write an empty catalogue: the zero state is the committed one");
    process.exitCode = 1;
    return { catalog, stats };
  }
  if (quarantined.length) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(qPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows: quarantined }, null, 1));
  }
  const out = args.out ? resolve(args.out) : join(ROOT, OUT_FILE);
  writeFileSync(out, JSON.stringify(catalog));
  if (!args.noWeightEstimates) {
    execFileSync("python3", ["apply-weight-estimates.py", "weight-estimates.json", out, "--in-place"], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  }
  console.log(`\n  wrote ${out}  (${productCount(catalog)} products)`);
  console.log("  NEXT: translate the descriptions, flip pendingCatalog, rebuild the derived data —");
  console.log("  the launch list is at the top of scripts/build-dsw-catalog.mjs.");
  return { catalog, stats };
}

/* ---------------- main ---------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.src) {
    const raw = JSON.parse(readFileSync(resolve(args.src), "utf8"));
    const pulled = Array.isArray(raw.pulled) ? raw.pulled : [{ quota: { category: "export", phase: 1 }, items: Array.isArray(raw) ? raw : raw.items || [] }];
    await ingestAndWrite(pulled, args);
    return;
  }

  let urls = null;
  if (args.urls) urls = JSON.parse(readFileSync(resolve(args.urls), "utf8"));
  let plan = pullPlan({ saleMax: Number(args.saleMax) > 0 ? Number(args.saleMax) : DSW_SALE_MAX, urls });
  if (args.only) plan = plan.filter((q) => args.only.includes(q.category));
  const capped = [];
  if (args.via === "site") {
    plan = plan.map((q) => {
      if (q.maxItems > SITE_CAP) { capped.push(q.category); return { ...q, maxItems: SITE_CAP }; }
      return q;
    });
  }
  const rates = costRatesFromEnv(process.env, { costPerRun: DEFAULT_COST_PER_RUN_USD });
  const est = estimatePull(plan, rates, { quoteUsd: args.quote });

  console.log(`\n  DSW catalogue pull — via ${args.via === "site" ? args.site + " (deployed functions)" : "the Apify API (DSW_ACTOR_ID)"}`);
  console.log("  Actor: UNVERIFIED for dsw.com (see RETAILER_CONFIG.dsw in netlify/functions/apify-scrape-start.js).");
  if (!urls) console.log("  Listings: keyword fallbacks (no --urls file). Pass --urls with real dsw.com listing URLs per quota for exact listings.");
  if (capped.length) console.log(`  NOTE: the deployed function caps a run at ${SITE_CAP} items, so ${capped.join(", ")} cannot pull ALL on this path; use --via apify for the full sale listing.`);
  console.log(formatEstimate(est));

  if (args.estimateOnly || !args.confirm) {
    console.log("\n  Nothing was spent. Post the estimate on Issue #443, then re-run with --confirm-spend");
    console.log("  (and --quote <usd> to hold the run to the figure you posted).\n");
    process.exitCode = args.estimateOnly ? 0 : 2;
    return;
  }

  let runner;
  if (args.via === "apify") {
    const token = process.env.APIFY_API_KEY, actor = process.env.DSW_ACTOR_ID;
    if (!token || !actor) throw new Error("--via apify needs APIFY_API_KEY and DSW_ACTOR_ID in the environment");
    runner = viaApify(token, actor);
  } else {
    runner = viaSite(args.site.replace(/\/+$/, ""));
  }

  const s = stamp();
  const rawPath = join(DATA_DIR, `raw-${s}.json`);
  mkdirSync(DATA_DIR, { recursive: true });
  const pulled = [];
  const done = [];
  let stopped = null;
  const save = () => writeFileSync(rawPath, JSON.stringify({ pulledAt: new Date().toISOString(), via: args.via, estimate: est, stopped, pulled }));

  for (let i = 0; i < plan.length; i++) {
    const quota = plan[i];
    process.stdout.write(`  [${i + 1}/${plan.length}] ${quota.category} (up to ${quota.maxItems}) ... `);
    try {
      const runId = await runner.start(quota);
      const { items, usageUsd } = await runner.poll(runId);
      const usd = Number.isFinite(usageUsd) ? usageUsd : null;
      pulled.push({ quota, runId, usageUsd: usd, items });
      done.push({ quota, usd: usd != null ? usd : est.lines.find((l) => l.category === quota.category).usd });
      console.log(`${items.length} rows${usd != null ? `, $${usd.toFixed(2)}` : " (no usage reported; estimate used)"}`);
      if (items.length >= quota.maxItems && quota.target === "all") console.log(`      ${quota.category}: hit the ${quota.maxItems} ceiling — the listing may be larger (raise --sale-max if the quote allows)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      pulled.push({ quota, error: err.message, items: [] });
      if (i === 0) { stopped = `first run failed: ${err.message}`; save(); console.error(`\n  ${stopped}\n  Nothing more was started.`); process.exitCode = 1; return; }
    }
    save();
    const check = spendCheck(done, plan.slice(i + 1), est);
    console.log(`      spent so far $${check.spentUsd.toFixed(2)}, projected total $${check.projectedUsd.toFixed(2)} (quote $${est.quoteUsd.toFixed(2)})`);
    if (check.stop && i < plan.length - 1) {
      stopped = check.reason;
      save();
      console.log("\n  ====================================================");
      console.log(`  ${check.reason}`);
      console.log("  ====================================================");
      console.log(`  Raw rows saved: ${rawPath}`);
      console.log(`  Ingest what was pulled with: node scripts/build-dsw-catalog.mjs --src ${rawPath}`);
      process.exitCode = 3;
      if (!args.ingestPartial) return;
      break;
    }
  }
  const spent = done.reduce((a, d) => a + (Number(d.usd) || 0), 0);
  console.log(`\n  pull complete: ${pulled.reduce((n, p) => n + p.items.length, 0)} rows, ~$${spent.toFixed(2)} spent. Raw: ${rawPath}`);
  await ingestAndWrite(pulled.filter((p) => !p.error), args, { stamp: s });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
}

export { parseArgs };
