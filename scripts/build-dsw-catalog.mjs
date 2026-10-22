#!/usr/bin/env node
/* ============================================================
   dsw-catalog.json — THE DSW PULL AND INGEST (Issue #443,
   c.6323171170 as amended by c.6323202929; actor and listings verified
   by Lucifer 2026-10-22).

   ONE COMMAND, AND NOTHING IS SPENT UNTIL YOU SAY SO.

     node scripts/build-dsw-catalog.mjs --via apify
         Prints the ESTIMATED COST of the pull and stops. Spends nothing.
         Exit code 2: "not confirmed".

     node scripts/build-dsw-catalog.mjs --via apify --confirm-spend [--quote <usd>]
         Runs the pull with apify/e-commerce-scraping-tool (DSW_ACTOR_ID),
         one run per listing: clearance (DSW's whole sale surface) and
         best sellers first (phase 1), then women / men / kids / bags
         (phase 2) — CATALOG_QUOTAS.dsw in scripts/lib/catalog-quotas.js
         holds the six verified listing URLs. Input per run:
         { listingUrls: [{url}], maxProductResults }.

         SPEND GUARDS. The wave cap is $200 (--max-spend-usd; Danny's
         pre-approval) minus what was already spent (--spent-usd). The
         stop line is min(quote +25%, cap left):
           - an estimate above the cap left is refused before any run;
           - before each run, a run that would take the wave past the cap
             is not started (and Apify is told the most it may charge
             that run: maxTotalChargeUsd);
           - after each run, the total is re-projected from what Apify
             reports; above the stop line it STOPS, saves the rows, and
             says so (exit 3).
         Then it ingests (below).

     node scripts/build-dsw-catalog.mjs --src <raw.json>
         Ingest only, from a raw pull saved earlier. Spends nothing.

     OPTIONAL SECOND STEP — GTIN ENRICHMENT (--gtin-enrich)
         Only when the listing pass leaves GTIN coverage below 50%:
         pistachio_implementation/product-page-extractor
         (GTIN_ACTOR_ID) reads each product page's JSON-LD at $0.0015
         per row. Estimated on its own; spends only with --confirm-spend,
         from the same wave cap. Works on a fresh pull or on --src.

   WHERE THE RUNS GO
     --via apify  straight to the Apify API from this machine, with
                  APIFY_API_KEY and DSW_ACTOR_ID in the environment (never
                  in the repo). No 200 cap. THE PATH FOR THIS PULL.
     --via site   (default) through the site's deployed functions
                  (apify-scrape-start, retailer "dsw"), capped at 200
                  items per run there.

   INGEST (scripts/lib/dsw.js holds every rule; dsw-store-tests pin them)
     - the actor's rows read tolerantly (normalizeRow: schema.org /
       JSON-LD Product and the common flat spellings);
     - per-row currency USD; sanity band $5-$400 (--min-usd/--max-usd);
       quarantine to data/dsw/quarantine-<stamp>.json for a person;
     - shippable only; in the bags slot, bags only;
     - full gallery (exact duplicates dropped, size charts last), real
       weight / dimensions / spec table / materials, checksum-valid GTIN
       per product and per size, sizes exactly as scraped (sibling
       inference flagged), brand, the PDP's own first 1-2 sentences.
   THEN, AS PART OF THE BUILD
     apply-weight-estimates.py fills unpublished weights (flagged);
     translate-catalog-descriptions.mjs makes the descriptions Spanish
     when GROQ_API_KEY is set (without it: loud, and DO NOT SHIP);
     the INGEST REPORT prints every coverage line, its minimum, and
     SHIP / DO NOT SHIP (exit 4 on DO NOT SHIP). --explain
     <metric>="<reason>" records a hole the source cannot fill.

   AFTER A SHIP VERDICT — the launch, in order:
     (flip `pendingCatalog` off: scripts/lib/retailers.js, the app
      bundle's RETAILERS mirror (rehash), tienda.html STORES.dsw)
     node scripts/build-store-slices.mjs
     node scripts/build-ofertas-feed.mjs && node scripts/build-ofertas-slices.mjs
     node scripts/build-search-index.mjs && node scripts/build-price-index.mjs
     node scripts/build-pdp-slices.mjs && node scripts/build-department-slices.mjs
     node scripts/build-brand-index.mjs && node scripts/build-home-shelves.mjs
     node scripts/test/dsw-store-tests.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DSW_KEY, DSW_LABEL, OUT_FILE, DSW_SALE_MAX, WAVE_CAP_USD, PRICE_BAND_USD, pullPlan, dswActorInput, costRatesFromEnv,
  estimatePull, formatEstimate, spendCheck, capGuard, ingestPull, productCount,
  GTIN_ENRICH_ACTOR, GTIN_ENRICH_BELOW, GTIN_ENRICH_URLS_PER_RUN, gtinEnrichTargets, estimateGtinEnrich, gtinEnrichInput, mergeGtins,
} from "./lib/dsw.js";
import { DEFAULT_COST_PER_RUN_USD } from "./lib/refresh-tiers.js";
import { parseExplain } from "./lib/pull-quality.js";
import { runTranslation, reportCatalog, readCatalog, DO_NOT_SHIP_EXIT } from "./lib/pull-finish.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SITE_CAP = 200;              // apify-scrape-start's ceiling for a config-driven browse
/* A full clearance listing is thousands of product pages: allow hours.
   DSW_RUN_TIMEOUT_MIN moves it. A run that outlives it keeps running on
   Apify; its runId is printed so its dataset can be fetched later. */
const RUN_TIMEOUT_MS = (Number(process.env.DSW_RUN_TIMEOUT_MIN) > 0 ? Number(process.env.DSW_RUN_TIMEOUT_MIN) : 360) * 60 * 1000;
const PAGE = 1000;
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 60000;
/* Raw pulls and quarantined rows: never served, never committed to main
   (data/dsw/ is gitignored). DSW_DATA_DIR moves them (the tests use it). */
const DATA_DIR = process.env.DSW_DATA_DIR ? resolve(process.env.DSW_DATA_DIR) : join(ROOT, "data/dsw");

function parseArgs(argv) {
  const a = { via: "site", site: process.env.ARIA_SITE || "https://ariashop.pe", maxSpendUsd: WAVE_CAP_USD, spentUsd: 0, explain: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--confirm-spend") a.confirm = true;
    else if (k === "--estimate-only") a.estimateOnly = true;
    else if (k === "--via") a.via = next();
    else if (k === "--site") a.site = next();
    else if (k === "--quote") a.quote = Number(next());
    else if (k === "--max-spend-usd") a.maxSpendUsd = Number(next());
    else if (k === "--spent-usd") a.spentUsd = Number(next());
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
    else if (k === "--gtin-enrich") a.gtinEnrich = true;
    else if (k === "--gtin-input-key") a.gtinInputKey = next();
    else if (k === "--explain") a.explain.push(next());
    else throw new Error(`unknown option ${k}`);
  }
  if (!["site", "apify"].includes(a.via)) throw new Error(`--via must be site or apify, not ${a.via}`);
  if (!(a.maxSpendUsd > 0)) throw new Error("--max-spend-usd must be a positive number");
  a.explainMap = parseExplain(a.explain);
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

/* Any actor, any input; `chargeLimitUsd` becomes Apify's own per-run
   ceiling (maxTotalChargeUsd) so one runaway run cannot pass the cap. */
const apifyActor = (token, actorId) => {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async startInput(input, { chargeLimitUsd = null } = {}) {
      const qs = chargeLimitUsd != null ? `?maxTotalChargeUsd=${Math.max(0, chargeLimitUsd).toFixed(2)}` : "";
      const r = await fetchJson(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs${qs}`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error(`start failed (${r.status}): ${r.body?.error?.message || JSON.stringify(r.body).slice(0, 200)}`);
      return r.body.data.id;
    },
    async start(quota, opts) { return this.startInput(dswActorInput(quota, quota.maxItems), opts); },
    async poll(runId) {
      const deadline = Date.now() + RUN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const r = await fetchJson(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, { headers: auth });
        if (!r.ok) throw new Error(`status failed (${r.status})`);
        const run = r.body.data;
        if (run.status === "SUCCEEDED") {
          /* Paged, so a 6,000-row dataset is not one giant response. */
          const items = [];
          for (let offset = 0; ; offset += PAGE) {
            const page = await fetchJson(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&offset=${offset}&limit=${PAGE}`, { headers: auth }, 5 * 60 * 1000);
            if (!page.ok) throw new Error(`dataset fetch failed at offset ${offset} (run ${runId}, dataset ${run.defaultDatasetId})`);
            const rows = Array.isArray(page.body) ? page.body : [];
            items.push(...rows);
            if (rows.length < PAGE) break;
          }
          return { items, usageUsd: Number(run.usageTotalUsd) };
        }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) throw new Error(`run ended ${run.status}`);
        await wait(POLL_MS);
      }
      throw new Error(`run ${runId} still running after the timeout (it keeps running on Apify; fetch its dataset from the console)`);
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

function printIngestCounts(stats, quarantinePath) {
  console.log(`\n  DSW ingest: ${stats.published} published of ${stats.rows} rows`);
  console.log(`    per bucket:     ${JSON.stringify(stats.perBucket)}`);
  console.log(`    on sale:        ${stats.onSale}`);
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
  printIngestCounts(stats, qPath);
  if (args.dryRun) {
    reportCatalog({ label: `${DSW_LABEL} (dry run, nothing written)`, key: DSW_KEY, catalog, rows: stats.rows, explain: args.explainMap, stage: "dry-run", weightEstimates: !args.noWeightEstimates });
    console.log("\n  --dry-run: nothing written");
    return { catalog, stats };
  }
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
  const translation = runTranslation(out, { root: ROOT });
  const { verdict } = reportCatalog({ label: DSW_LABEL, key: DSW_KEY, catalog: readCatalog(out), rows: stats.rows, explain: args.explainMap, stage: "written", translation });
  if (!verdict.ship) {
    console.log(`\n  DO NOT SHIP: ${out} stays local. Do not commit it, do not flip pendingCatalog.`);
    process.exitCode = DO_NOT_SHIP_EXIT;
  } else {
    console.log("  NEXT: flip pendingCatalog and rebuild the derived data — the launch list is at the top of scripts/build-dsw-catalog.mjs.");
  }
  return { catalog, stats };
}

/* ---------------- GTIN enrichment (optional second step) ---------------- */
async function maybeEnrichGtins(pulled, args, { spentSoFarUsd, rates, rawPathBase }) {
  const ctx = await ingestContext(args);
  const { stats } = ingestPull(pulled, ctx);
  const share = stats.published ? stats.gtin / stats.published : 0;
  console.log(`\n  GTIN after the listing pass: ${(100 * share).toFixed(1)}% (${stats.gtin}/${stats.published}); enrichment threshold ${(100 * GTIN_ENRICH_BELOW).toFixed(0)}%`);
  if (share >= GTIN_ENRICH_BELOW) {
    console.log("  GTIN coverage is not low: the enrichment step is not needed and does not run.");
    return { pulled, spentUsd: 0 };
  }
  const urls = gtinEnrichTargets(pulled, ctx);
  const capLeft = Math.max(0, args.maxSpendUsd - spentSoFarUsd);
  const est = estimateGtinEnrich(urls.length, rates, { capRemainingUsd: Math.round(capLeft * 100) / 100 });
  console.log(`  GTIN ENRICHMENT ESTIMATE (${GTIN_ENRICH_ACTOR}): ${est.urls} product pages without a GTIN, ${est.runs} runs, $${est.usdPerRow} per row`);
  console.log(`  ESTIMATED COST: ~$${est.estimateUsd.toFixed(2)}   wave cap left: $${capLeft.toFixed(2)}`);
  if (!args.gtinEnrich) {
    console.log("  Not run (no --gtin-enrich). To run it on this pull:");
    console.log(`    node scripts/build-dsw-catalog.mjs --src ${rawPathBase || "<raw.json>"} --gtin-enrich --confirm-spend`);
    return { pulled, spentUsd: 0 };
  }
  if (!args.confirm) {
    console.log("  Nothing was spent: add --confirm-spend to run the enrichment.");
    process.exitCode = 2;
    return { pulled, spentUsd: 0, notConfirmed: true };
  }
  if (est.overCap) {
    console.log(`  REFUSED: the enrichment estimate is above the $${capLeft.toFixed(2)} left of the wave cap.`);
    return { pulled, spentUsd: 0 };
  }
  const token = process.env.APIFY_API_KEY;
  const actor = process.env.GTIN_ACTOR_ID || GTIN_ENRICH_ACTOR;
  if (!token) throw new Error("--gtin-enrich needs APIFY_API_KEY in the environment");
  const runner = apifyActor(token, actor);
  const rows = [];
  let spent = 0;
  for (let i = 0; i < urls.length; i += GTIN_ENRICH_URLS_PER_RUN) {
    const chunk = urls.slice(i, i + GTIN_ENRICH_URLS_PER_RUN);
    const left = capLeft - spent;
    const next = rates.costPerRun + chunk.length * est.usdPerRow;
    if (next > left) { console.log(`  TOPE DE GASTO: the next enrichment run (~$${next.toFixed(2)}) would pass the $${left.toFixed(2)} left. Stopped.`); break; }
    process.stdout.write(`  enrichment ${i / GTIN_ENRICH_URLS_PER_RUN + 1}/${est.runs} (${chunk.length} pages) ... `);
    try {
      const runId = await runner.startInput(gtinEnrichInput(chunk, args.gtinInputKey || undefined), { chargeLimitUsd: left });
      const { items, usageUsd } = await runner.poll(runId);
      spent += Number.isFinite(usageUsd) ? usageUsd : next;
      rows.push(...items);
      console.log(`${items.length} rows, $${(Number.isFinite(usageUsd) ? usageUsd : next).toFixed(2)}`);
    } catch (err) { console.log(`FAILED: ${err.message}`); break; }
  }
  const merged = mergeGtins(pulled, rows);
  console.log(`  GTIN enrichment: ${merged.filled} products gained a GTIN; ~$${spent.toFixed(2)} spent (wave total ~$${(spentSoFarUsd + spent).toFixed(2)})`);
  return { pulled: merged.pulled, spentUsd: spent, extractorRows: rows };
}

/* ---------------- main ---------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rates = costRatesFromEnv(process.env, { costPerRun: DEFAULT_COST_PER_RUN_USD });

  if (args.src) {
    const raw = JSON.parse(readFileSync(resolve(args.src), "utf8"));
    let pulled = Array.isArray(raw.pulled) ? raw.pulled.filter((p) => !p.error) : [{ quota: { category: "export", phase: 1 }, items: Array.isArray(raw) ? raw : raw.items || [] }];
    /* What this wave already spent: the saved pull's own runs, any
       enrichment already done, and what was spent before that pull. */
    const rawSpent = Array.isArray(raw.pulled)
      ? raw.pulled.reduce((a, p) => a + (Number(p.usageUsd) || 0), 0) + (Number(raw.gtinEnrichUsd) || 0) + (Number(raw.estimate && raw.estimate.spentBeforeUsd) || 0)
      : 0;
    if (args.gtinEnrich) {
      const spentSoFar = Math.max(rawSpent, args.spentUsd || 0);
      const r = await maybeEnrichGtins(pulled, args, { spentSoFarUsd: spentSoFar, rates, rawPathBase: args.src });
      if (r.notConfirmed) return;
      if (r.spentUsd || r.extractorRows) {
        const p = join(DATA_DIR, `raw-${stamp()}-gtin.json`);
        mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(p, JSON.stringify({ ...(Array.isArray(raw) ? {} : raw), pulled: r.pulled, gtinEnrichUsd: (Number(raw.gtinEnrichUsd) || 0) + r.spentUsd }));
        console.log(`  enriched raw saved: ${p}`);
      }
      pulled = r.pulled;
    }
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
  const est = estimatePull(plan, rates, { quoteUsd: args.quote, capUsd: args.maxSpendUsd, spentBeforeUsd: args.spentUsd });

  console.log(`\n  DSW catalogue pull — via ${args.via === "site" ? args.site + " (deployed functions)" : "the Apify API (DSW_ACTOR_ID)"}`);
  console.log("  Actor: apify/e-commerce-scraping-tool (verified by Lucifer, #443, 2026-10-22); input { listingUrls: [{url}], maxProductResults }.");
  const missing = plan.filter((q) => !q.url).map((q) => q.category);
  if (missing.length) console.log(`  WARNING: no listing URL for ${missing.join(", ")} (this actor takes URLs, not keywords).`);
  if (capped.length) console.log(`  NOTE: the deployed function caps a run at ${SITE_CAP} items, so ${capped.join(", ")} cannot pull ALL on this path; use --via apify.`);
  console.log(formatEstimate(est));

  if (args.estimateOnly || !args.confirm) {
    console.log("\n  Nothing was spent. Re-run with --confirm-spend to start the pull (held to the quote +25% and the wave cap).\n");
    process.exitCode = args.estimateOnly ? 0 : 2;
    return;
  }
  if (est.overCap) {
    console.error(`\n  REFUSED: the estimate ($${est.estimateUsd.toFixed(2)}) is above the $${est.capRemainingUsd.toFixed(2)} left of the wave cap. Nothing was started.`);
    process.exitCode = 3;
    return;
  }

  let runner;
  if (args.via === "apify") {
    const token = process.env.APIFY_API_KEY, actor = process.env.DSW_ACTOR_ID;
    if (!token || !actor) throw new Error("--via apify needs APIFY_API_KEY and DSW_ACTOR_ID in the environment");
    runner = apifyActor(token, actor);
  } else {
    runner = viaSite(args.site.replace(/\/+$/, ""));
  }

  const s = stamp();
  const rawPath = join(DATA_DIR, `raw-${s}.json`);
  mkdirSync(DATA_DIR, { recursive: true });
  let pulled = [];
  const done = [];
  let stopped = null;
  let gtinEnrichUsd = 0;
  const save = () => writeFileSync(rawPath, JSON.stringify({ pulledAt: new Date().toISOString(), via: args.via, estimate: est, stopped, pulled, gtinEnrichUsd }));
  const halt = (reason) => {
    stopped = reason;
    save();
    console.log("\n  ====================================================");
    console.log(`  ${reason}`);
    console.log("  ====================================================");
    console.log(`  Raw rows saved: ${rawPath}`);
    console.log(`  Ingest what was pulled with: node scripts/build-dsw-catalog.mjs --src ${rawPath}`);
    process.exitCode = 3;
  };

  for (let i = 0; i < plan.length; i++) {
    const quota = plan[i];
    const guard = capGuard(done, quota, est);
    if (!guard.ok) { halt(guard.reason); if (!args.ingestPartial) return; break; }
    process.stdout.write(`  [${i + 1}/${plan.length}] ${quota.category} (up to ${quota.maxItems}) ... `);
    try {
      const runId = await runner.start(quota, { chargeLimitUsd: guard.chargeLimitUsd });
      const { items, usageUsd } = await runner.poll(runId);
      const usd = Number.isFinite(usageUsd) ? usageUsd : null;
      pulled.push({ quota, runId, usageUsd: usd, items });
      done.push({ quota, usd: usd != null ? usd : est.lines.find((l) => l.category === quota.category).usd });
      console.log(`${items.length} rows${usd != null ? `, $${usd.toFixed(2)}` : " (no usage reported; estimate used)"}`);
      if (items.length >= quota.maxItems && quota.target === "all") console.log(`      ${quota.category}: hit the ${quota.maxItems} ceiling — the listing may be larger (raise --sale-max if the cap allows)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      pulled.push({ quota, error: err.message, items: [] });
      if (i === 0) { stopped = `first run failed: ${err.message}`; save(); console.error(`\n  ${stopped}\n  Nothing more was started.`); process.exitCode = 1; return; }
    }
    save();
    const check = spendCheck(done, plan.slice(i + 1), est);
    console.log(`      spent so far $${check.spentUsd.toFixed(2)}, projected total $${check.projectedUsd.toFixed(2)} (stop line $${est.stopAboveUsd.toFixed(2)})`);
    if (check.stop && i < plan.length - 1) { halt(check.reason); if (!args.ingestPartial) return; break; }
  }
  const spent = done.reduce((a, d) => a + (Number(d.usd) || 0), 0);
  console.log(`\n  pull complete: ${pulled.reduce((n, p) => n + p.items.length, 0)} rows, ~$${spent.toFixed(2)} spent (wave total ~$${(spent + est.spentBeforeUsd).toFixed(2)} of $${est.capUsd.toFixed(2)}). Raw: ${rawPath}`);
  const ok = pulled.filter((p) => !p.error);
  const enriched = await maybeEnrichGtins(ok, { ...args, confirm: true, gtinEnrich: args.gtinEnrich && args.via === "apify" }, { spentSoFarUsd: spent + est.spentBeforeUsd, rates, rawPathBase: rawPath });
  if (enriched.spentUsd) { gtinEnrichUsd = enriched.spentUsd; pulled = enriched.pulled; save(); }
  await ingestAndWrite(enriched.pulled, args, { stamp: s });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
}

export { parseArgs };
