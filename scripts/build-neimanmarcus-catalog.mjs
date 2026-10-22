#!/usr/bin/env node
/* ============================================================
   neimanmarcus-catalog.json — THE NEIMAN MARCUS PULL AND INGEST.
   Modeled on scripts/build-dsw-catalog.mjs: the same estimate-first
   flow, the same spend stop, the same envelope and row shape.

   NOTHING IS SPENT UNTIL YOU SAY SO.

     node scripts/build-neimanmarcus-catalog.mjs
         Prints the PROJECTED COST of the pull and stops. Spends nothing.
         Exit code 2: "not confirmed". (--estimate-only: same, exit 0.)

     node scripts/build-neimanmarcus-catalog.mjs --confirm-spend --quote <usd>
         Runs the pull straight against the Apify API from this machine
         (APIFY_API_KEY and NM_ACTOR_ID in the environment, never in the
         repo): sale + clearance + best sellers first (phase 1), then the
         department depth (phase 2), one actor run per quota (NM_QUOTAS in
         scripts/lib/neimanmarcus.js). After every run it re-projects the
         total from what Apify reports the run cost; above the quote +25%
         it STOPS, saves what it has, and says so. Then it ingests.

     node scripts/build-neimanmarcus-catalog.mjs --src <file>
         Ingest only. Spends nothing on Apify. <file> is either
           - a raw pull saved by a run above (data/neimanmarcus/raw-*.json),
           - a JSON array of product rows (an Apify dataset export), or
           - Neiman Marcus's affiliate product feed (.csv / .tsv / .txt,
             Google-Shopping columns: Sovrn / AWIN export).

   ACCESS NOTE. scripts/luxury-feed/README.md (recon 2026-09-28) records
   neimanmarcus.com behind DataDome and the repo's decision not to defeat
   bot protection; the channel it names is the affiliate feed. That is
   the --src path. The --confirm-spend path starts whatever actor
   NM_ACTOR_ID names; no actor is verified for neimanmarcus.com.

   No --via site path: the store is not wired into the deployed
   functions (RETAILER_CONFIG has no neimanmarcus entry), on purpose.

   INGEST (scripts/lib/neimanmarcus.js; DSW's rules from scripts/lib/dsw.js)
     - seller must be Neiman Marcus (a row naming another seller is
       quarantined);
     - per-row currency USD (stated by the row; --assume-usd only for a
       source whose own docs state US dollars; such rows are flagged);
     - sanity band $10-$5,000 (--min-usd/--max-usd) and no absurd
       was-price, else quarantined to data/neimanmarcus/quarantine-*.json;
     - shippable only: out of stock, store-only, oversize/freight and the
       site's own isShippableItem all drop;
     - real weight / dimensions where published, checksum-valid GTIN (per
       size when the source lists them per size), gallery up to 12, sizes
       exactly as scraped, the PDP's own first 1-2 sentences (English
       until translate-catalog-descriptions.mjs runs).
   Then apply-weight-estimates.py fills unpublished weights, flagged
   weightEstimated, exactly as for DSW.

   AFTER IT WRITES neimanmarcus-catalog.json:
     GROQ_API_KEY=... node scripts/translate-catalog-descriptions.mjs neimanmarcus-catalog.json
   Wiring the store into the site (registry row, tienda.html, slices) is
   a separate build step, done once this file has products.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  OUT_FILE, NM_SALE_MAX, PRICE_BAND_USD, pullPlan, nmActorInput, costRatesFromEnv,
  estimatePull, formatEstimate, spendCheck, ingestPull, productCount, parseDelimited, feedToRows,
} from "./lib/neimanmarcus.js";
import { DEFAULT_COST_PER_RUN_USD } from "./lib/refresh-tiers.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 60000;
/* Raw pulls and quarantined rows: never served, never committed
   (data/neimanmarcus/ is gitignored). NM_DATA_DIR moves them. */
const DATA_DIR = process.env.NM_DATA_DIR ? resolve(process.env.NM_DATA_DIR) : join(ROOT, "data/neimanmarcus");

export function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--confirm-spend") a.confirm = true;
    else if (k === "--estimate-only") a.estimateOnly = true;
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

const viaApify = (token, actorId) => {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async start(quota) {
      const r = await fetchJson(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(nmActorInput(quota, quota.maxItems)),
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
  console.log(`\n  Neiman Marcus ingest: ${stats.published} published of ${stats.rows} rows`);
  console.log(`    per bucket:     ${JSON.stringify(stats.perBucket)}`);
  console.log(`    on sale:        ${stats.onSale}`);
  console.log(`    real weight:    ${stats.realWeight}  (published by the source; the rest get the site's estimate, flagged)`);
  console.log(`    dimensions:     ${stats.dimensions}`);
  console.log(`    GTIN captured:  ${stats.gtin}`);
  console.log(`    size runs:      ${stats.withSizes}  (as scraped; none invented)`);
  console.log(`    galleries (2+): ${stats.gallery}`);
  console.log(`    PDP sentences:  ${stats.described}  (English until translate-catalog-descriptions.mjs runs)`);
  console.log(`    seller stated:  ${stats.sellerFromRow}  (Neiman Marcus named by the row; the rest by the source)`);
  if (stats.currencyAssumed) console.log(`    currency ASSUMED USD (--assume-usd): ${stats.currencyAssumed}`);
  console.log(`    dropped:        ${JSON.stringify(stats.dropped)}`);
  const q = Object.values(stats.quarantined).reduce((a, b) => a + b, 0);
  console.log(`    QUARANTINED:    ${q} ${JSON.stringify(stats.quarantined)}${q ? `  -> ${quarantinePath}` : ""}`);
}

async function ingestAndWrite(pulled, args, meta = {}) {
  const ctx = await ingestContext(args);
  if (meta.source) ctx.source = meta.source;
  const { catalog, quarantined, stats } = ingestPull(pulled, ctx);
  const s = meta.stamp || stamp();
  const qPath = join(DATA_DIR, `quarantine-${s}.json`);
  printIngestReport(stats, qPath);
  if (args.dryRun) { console.log("\n  --dry-run: nothing written"); return { catalog, stats }; }
  if (!productCount(catalog)) {
    console.error("\n  refusing to write an empty catalogue");
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
  console.log("  NEXT: GROQ_API_KEY=... node scripts/translate-catalog-descriptions.mjs neimanmarcus-catalog.json");
  return { catalog, stats };
}

/** --src: a saved raw pull, a JSON row array, or the affiliate feed. */
export function loadSrc(path) {
  const text = readFileSync(resolve(path), "utf8");
  const ext = extname(path).toLowerCase();
  if ([".csv", ".tsv", ".txt"].includes(ext)) {
    const rows = feedToRows(parseDelimited(text, ext === ".tsv" ? "\t" : null));
    return { pulled: [{ quota: { category: "feed", phase: 1 }, items: rows }], source: "Neiman Marcus affiliate product feed -- ingested by scripts/build-neimanmarcus-catalog.mjs" };
  }
  const raw = JSON.parse(text);
  if (Array.isArray(raw.pulled)) return { pulled: raw.pulled.filter((p) => !p.error) };
  return { pulled: [{ quota: { category: "export", phase: 1 }, items: Array.isArray(raw) ? raw : raw.items || [] }] };
}

/* ---------------- main ---------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.src) {
    const { pulled, source } = loadSrc(args.src);
    await ingestAndWrite(pulled, args, { source });
    return;
  }

  let urls = null;
  if (args.urls) urls = JSON.parse(readFileSync(resolve(args.urls), "utf8"));
  let plan = pullPlan({ saleMax: Number(args.saleMax) > 0 ? Number(args.saleMax) : NM_SALE_MAX, urls });
  if (args.only) plan = plan.filter((q) => args.only.includes(q.category));
  const rates = costRatesFromEnv(process.env, { costPerRun: DEFAULT_COST_PER_RUN_USD });
  const est = estimatePull(plan, rates, { quoteUsd: args.quote });

  console.log("\n  Neiman Marcus catalogue pull — via the Apify API (NM_ACTOR_ID)");
  console.log("  Actor: NONE VERIFIED for neimanmarcus.com. See the ACCESS NOTE in scripts/lib/neimanmarcus.js");
  console.log("  (DataDome; the repo's channel is the affiliate feed, ingested with --src at no Apify cost).");
  if (!urls) console.log("  Listings: keyword fallbacks (no --urls file). Pass --urls with real listing URLs per quota.");
  console.log(formatEstimate(est));

  if (args.estimateOnly || !args.confirm) {
    console.log("\n  Nothing was spent. Post this estimate first; then, only if approved, re-run with");
    console.log("  --confirm-spend --quote <usd> to hold the run to the figure you posted.\n");
    process.exitCode = args.estimateOnly ? 0 : 2;
    return;
  }

  const token = process.env.APIFY_API_KEY, actor = process.env.NM_ACTOR_ID;
  if (!token || !actor) throw new Error("--confirm-spend needs APIFY_API_KEY and NM_ACTOR_ID in the environment");
  const runner = viaApify(token, actor);

  const s = stamp();
  const rawPath = join(DATA_DIR, `raw-${s}.json`);
  mkdirSync(DATA_DIR, { recursive: true });
  const pulled = [];
  const done = [];
  let stopped = null;
  const save = () => writeFileSync(rawPath, JSON.stringify({ pulledAt: new Date().toISOString(), via: "apify", estimate: est, stopped, pulled }));

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
      console.log(`  Ingest what was pulled with: node scripts/build-neimanmarcus-catalog.mjs --src ${rawPath}`);
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
