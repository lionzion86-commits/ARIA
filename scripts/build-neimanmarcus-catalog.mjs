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

     node scripts/build-neimanmarcus-catalog.mjs --src <feed> --target 30000 --dry-run
         THE PRE-RUN REPORT. Reads the feed, prints the candidate pool
         (shippable, in scope, de-duplicated), what was left out and why,
         and the selection to reach the target: sale/clearance ALL first,
         then best sellers (the feed's own label), then department quotas
         proportional to the pool. A pool under the target is taken whole
         and the true ceiling is stated. Writes nothing.

     node scripts/build-neimanmarcus-catalog.mjs --src <file> [--target 30000]
         Ingest only. Spends nothing on Apify. <file> is either
           - a raw pull saved by a run above (data/neimanmarcus/raw-*.json),
           - a JSON array of product rows (an Apify dataset export), or
           - Neiman Marcus's affiliate product feed (.csv / .tsv / .txt,
             Google-Shopping columns: the AWIN export; Sovrn Commerce has
             no feed file -- use --via sovrn below)
           - a saved Sovrn harvest directory (data/neimanmarcus/sovrn-raw-<stamp>/).

   ACCESS NOTE. scripts/luxury-feed/README.md (recon 2026-09-28) records
   neimanmarcus.com behind DataDome and the repo's decision not to defeat
   bot protection; the channel it names is the affiliate feed. That is
   the --src path. The --confirm-spend path starts whatever actor
   NM_ACTOR_ID names; no actor is verified for neimanmarcus.com.

     node scripts/build-neimanmarcus-catalog.mjs --via sovrn --dry-run [--target 30000]
         THE SOVRN API HARVEST (Sovrn Commerce has NO feed file; product
         data is API-only). Needs SOVRN_API_KEY and the Neiman Marcus
         group ID (NM_SOVRN_GROUP_ID or --merchant-group; without it the
         script prints how to get it and stops, exit 5). Sweeps the
         Product Recommendation API by keyword (50 products per request;
         scripts/neimanmarcus/sovrn-sweep-plan.json, extendable), de-
         duplicates, stops at the target, at --max-requests (default
         3000) or when a department's new-product yield falls below
         --min-yield per request over --yield-window requests; throttled
         to --throttle-share (default 10%) of Sovrn's 30k / 5 min limit.
         Every raw answer is saved under data/neimanmarcus/sovrn-raw-
         <stamp>/ (gitignored; the key is never written). --dry-run
         prints the sweep, the field-mapping report, the 30k selection
         and the coverage report, and writes no catalogue; without it the
         SAME ingest as the feed runs and writes the catalogue.
     node scripts/build-neimanmarcus-catalog.mjs --banner bergdorfgoodman|horchow --via sovrn --dry-run
         THE OTHER NEIMAN MARCUS GROUP BANNERS (#443, Danny 2026-10-22),
         through the same harvest and ingest (scripts/lib/nmg-banners.js):
         Bergdorf Goodman (Sovrn merchant 6756, BG_SOVRN_GROUP_ID,
         bergdorfgoodman-catalog.json) and Horchow (merchant 666,
         HORCHOW_SOVRN_GROUP_ID, horchow-catalog.json; PARCEL-ONLY:
         bedding, bath, tabletop, small decor and kitchen, never
         furniture). Each has its own sweep plan under
         scripts/neimanmarcus/ and its raw answers under
         data/neimanmarcus/<banner>/. Only --via sovrn and --src serve
         them. The first --approved-merchants-url call logs whether the
         banner's group id equals its merchant id.
     node scripts/build-neimanmarcus-catalog.mjs --src data/neimanmarcus/sovrn-raw-<stamp> [--dry-run]
         Re-ingest saved Sovrn answers through the current mapper (after
         fixing scripts/lib/sovrn.js SOVRN_FIELD_KEYS). No requests.

   No --via site path: the store is not wired into the deployed
   functions (RETAILER_CONFIG has no neimanmarcus entry), on purpose,
   and neimanmarcus.com is never scraped (DataDome).

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

   THEN, AS PART OF THE BUILD: translate-catalog-descriptions.mjs makes
   the descriptions Spanish when GROQ_API_KEY is set (without it: loud,
   and DO NOT SHIP), and the INGEST REPORT prints every coverage line
   with its minimum and SHIP / DO NOT SHIP (exit 4 on DO NOT SHIP);
   --explain <metric>="<reason>" records a hole the feed cannot fill.
   Wiring the store into the site (registry row, tienda.html, slices) is
   a separate build step, done once this file has products.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  NM_SALE_MAX, PRICE_BAND_USD, pullPlan, nmActorInput, costRatesFromEnv,
  estimatePull, formatEstimate, spendCheck, ingestPull, productCount, parseDelimited, feedToRows,
  formatSelection,
} from "./lib/neimanmarcus.js";
import {
  SOVRN_PRODUCTS_URL, SOVRN_MAX_REQUESTS, SOVRN_MIN_YIELD, SOVRN_YIELD_WINDOW, SOVRN_THROTTLE_SHARE, SOVRN_ENV,
  checkSweepPlan, buildRequest, throttleIntervalMs, makeThrottle, runSweep, replayResponses, sweepToPulled,
  fieldReport, formatFieldReport, formatSweep, groupIdGuidance, bannerEntries,
} from "./lib/sovrn.js";
import { bannerOf } from "./lib/nmg-banners.js";
import { parseExplain } from "./lib/pull-quality.js";
import { runTranslation, reportCatalog, readCatalog, DO_NOT_SHIP_EXIT } from "./lib/pull-finish.mjs";
import { DEFAULT_COST_PER_RUN_USD } from "./lib/refresh-tiers.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 60000;
/* Raw pulls and quarantined rows: never served, never committed
   (data/neimanmarcus/ is gitignored). NM_DATA_DIR moves them. */
const DATA_ROOT = process.env.NM_DATA_DIR ? resolve(process.env.NM_DATA_DIR) : join(ROOT, "data/neimanmarcus");
/* Bergdorf Goodman / Horchow keep theirs in a sub-folder (same ignore rule). */
const dataDir = (banner) => (bannerOf(banner).key === "neimanmarcus" ? DATA_ROOT : join(DATA_ROOT, bannerOf(banner).key));

export function parseArgs(argv) {
  const a = { explain: [], banner: bannerOf() };
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
    else if (k === "--target") a.target = Number(next());
    else if (k === "--explain") a.explain.push(next());
    else if (k === "--via") a.via = next();
    else if (k === "--banner") a.banner = bannerOf(next());
    else if (k === "--merchant-group") a.merchantGroup = next();
    else if (k === "--approved-merchants-url") a.approvedMerchantsUrl = next();
    else if (k === "--sweep-plan") a.sweepPlan = next();
    else if (k === "--max-requests") a.maxRequests = Number(next());
    else if (k === "--min-yield") a.minYield = Number(next());
    else if (k === "--yield-window") a.yieldWindow = Number(next());
    else if (k === "--throttle-share") a.throttleShare = Number(next());
    else throw new Error(`unknown option ${k}`);
  }
  if (a.target != null && !(a.target > 0)) throw new Error("--target must be a positive number of products");
  if (a.via != null && a.via !== "sovrn") throw new Error(`--via ${a.via}: the only harvest mode is --via sovrn (Neiman Marcus is behind DataDome; it is never scraped)`);
  if (a.banner.key !== "neimanmarcus" && a.via !== "sovrn" && !a.src) throw new Error(`--banner ${a.banner.key}: the only routes are --via sovrn and --src (no Apify actor is verified for ${a.banner.host})`);
  if (a.maxRequests != null && !(a.maxRequests > 0)) throw new Error("--max-requests must be a positive number");
  if (a.minYield != null && !(a.minYield >= 0)) throw new Error("--min-yield must be >= 0");
  if (a.yieldWindow != null && !(a.yieldWindow >= 1)) throw new Error("--yield-window must be >= 1");
  if (a.throttleShare != null && !(a.throttleShare > 0 && a.throttleShare <= 0.5)) throw new Error("--throttle-share must be in (0, 0.5]: the harvest stays well under Sovrn's limit");
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
    banner: args.banner,
    specWeightKg: (x) => specWeightKg(x),
  };
}

function printIngestReport(stats, quarantinePath, banner = bannerOf()) {
  console.log(`\n  ${banner.label} ingest: ${stats.published} published of ${stats.rows} rows${stats.selection ? ` (pool ${stats.pool}, target ${stats.selection.target})` : ""}`);
  console.log(`    per bucket:     ${JSON.stringify(stats.perBucket)}`);
  console.log(`    on sale:        ${stats.onSale}`);
  console.log(`    real weight:    ${stats.realWeight}  (published by the source; the rest get the site's estimate, flagged)`);
  console.log(`    dimensions:     ${stats.dimensions}`);
  console.log(`    GTIN captured:  ${stats.gtin}`);
  console.log(`    size runs:      ${stats.withSizes}  (as scraped; none invented)`);
  console.log(`    galleries (2+): ${stats.gallery}`);
  console.log(`    PDP sentences:  ${stats.described}  (English until translate-catalog-descriptions.mjs runs)`);
  console.log(`    seller stated:  ${stats.sellerFromRow}  (${banner.label} named by the row; the rest by the source)`);
  if (stats.currencyAssumed) console.log(`    currency ASSUMED USD (--assume-usd): ${stats.currencyAssumed}`);
  console.log(`    dropped:        ${JSON.stringify(stats.dropped)}`);
  const q = Object.values(stats.quarantined).reduce((a, b) => a + b, 0);
  console.log(`    QUARANTINED:    ${q} ${JSON.stringify(stats.quarantined)}${q ? `  -> ${quarantinePath}` : ""}`);
}

async function ingestAndWrite(pulled, args, meta = {}) {
  const ctx = await ingestContext(args);
  if (meta.source) ctx.source = meta.source;
  if (args.target > 0) ctx.target = args.target;
  const { catalog, quarantined, stats } = ingestPull(pulled, ctx);
  const s = meta.stamp || stamp();
  const banner = args.banner;
  const DATA_DIR = dataDir(banner);
  const qPath = join(DATA_DIR, `quarantine-${s}.json`);
  if (stats.selection) {
    const left = { ...stats.dropped, ...Object.fromEntries(Object.entries(stats.quarantined).map(([k, v]) => [`quarantined:${k}`, v])) };
    console.log(formatSelection(stats.selection, left));
  }
  printIngestReport(stats, qPath, banner);
  if (args.dryRun) {
    reportCatalog({ label: `${banner.label} (dry run, nothing written)`, key: banner.key, catalog, rows: stats.rows, explain: args.explainMap, stage: "dry-run", weightEstimates: !args.noWeightEstimates });
    console.log("\n  --dry-run: nothing written");
    return { catalog, stats };
  }
  if (!productCount(catalog, banner)) {
    console.error("\n  refusing to write an empty catalogue");
    process.exitCode = 1;
    return { catalog, stats };
  }
  if (quarantined.length) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(qPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows: quarantined }, null, 1));
  }
  const out = args.out ? resolve(args.out) : join(ROOT, banner.outFile);
  writeFileSync(out, JSON.stringify(catalog));
  if (!args.noWeightEstimates) {
    execFileSync("python3", ["apply-weight-estimates.py", "weight-estimates.json", out, "--in-place"], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  }
  console.log(`\n  wrote ${out}  (${productCount(catalog, banner)} products)`);
  const translation = runTranslation(out, { root: ROOT });
  const { verdict } = reportCatalog({ label: banner.label, key: banner.key, catalog: readCatalog(out), rows: stats.rows, explain: args.explainMap, stage: "written", translation });
  if (!verdict.ship) {
    console.log(`\n  DO NOT SHIP: ${out} stays local. Do not commit it or wire the store.`);
    process.exitCode = DO_NOT_SHIP_EXIT;
  }
  return { catalog, stats };
}

/** --src: a saved raw pull, a JSON row array, or the affiliate feed. */
export function loadSrc(path, banner = bannerOf()) {
  if (statSync(resolve(path)).isDirectory()) return loadSovrnRaw(path, banner);
  const text = readFileSync(resolve(path), "utf8");
  const ext = extname(path).toLowerCase();
  if ([".csv", ".tsv", ".txt"].includes(ext)) {
    const rows = feedToRows(parseDelimited(text, ext === ".tsv" ? "\t" : null));
    return { pulled: [{ quota: { category: "feed", phase: 1 }, items: rows }], source: `${bannerOf(banner).label} affiliate product feed -- ingested by scripts/build-neimanmarcus-catalog.mjs` };
  }
  const raw = JSON.parse(text);
  if (Array.isArray(raw.pulled)) return { pulled: raw.pulled.filter((p) => !p.error) };
  return { pulled: [{ quota: { category: "export", phase: 1 }, items: Array.isArray(raw) ? raw : raw.items || [] }] };
}

/* ---------------- --via sovrn: the Sovrn Commerce API harvest ----------------
   Sovrn has no product feed file; scripts/lib/sovrn.js holds the API
   facts, the assumptions, the mapper and the sweep. Every raw answer is
   saved under data/neimanmarcus/sovrn-raw-<stamp>/ (gitignored, key
   never written), then the products go through the SAME ingest as the
   feed (ingestRow, the 30k selection, the INGEST REPORT, the Spanish
   step). */
const sovrnSource = (banner) => `${bannerOf(banner).label} via the Sovrn Commerce Product Recommendation API (keyword sweep) -- ingested by scripts/build-neimanmarcus-catalog.mjs --via sovrn${bannerOf(banner).key === "neimanmarcus" ? "" : ` --banner ${bannerOf(banner).key}`}`;

/* Each banner's own plan (scripts/lib/nmg-banners.js sweepPlan); --sweep-plan overrides. */
function readPlan(path, banner = bannerOf()) {
  return checkSweepPlan(JSON.parse(readFileSync(resolve(path || join(ROOT, bannerOf(banner).sweepPlan)), "utf8")));
}

/** --src <sovrn-raw dir>: replay saved answers through the current mapper. */
export function loadSovrnRaw(dir, banner = bannerOf()) {
  const d = resolve(dir);
  const index = JSON.parse(readFileSync(join(d, "index.json"), "utf8"));
  if (index.via !== "sovrn") throw new Error(`${d}/index.json is not a Sovrn harvest (via: ${index.via})`);
  /* A harvest records its banner; replaying it as another one is refused. */
  const b = bannerOf(banner);
  if ((index.banner || "neimanmarcus") !== b.key) throw new Error(`${d} is a ${index.banner || "neimanmarcus"} harvest; re-run with --banner ${index.banner || "neimanmarcus"}`);
  const responses = readdirSync(d).filter((f) => /^req-\d+\.json$/.test(f)).sort()
    .map((f) => JSON.parse(readFileSync(join(d, f), "utf8")));
  const merchantIds = [b.merchantId, index.groupId].filter(Boolean);
  const sweep = replayResponses(responses, { merchantIds, banner: b });
  const plan = { departments: (index.departments || []).map((x) => (typeof x === "string" ? { category: x, terms: ["-"] } : x)) };
  for (const r of responses) if (!plan.departments.some((x) => x.category === r.department)) plan.departments.push({ category: r.department, terms: ["-"] });
  return { pulled: sweepToPulled(sweep.found, plan), source: sovrnSource(b), sweep };
}

async function fetchSovrn(req, timeoutMs = FETCH_TIMEOUT_MS) {
  const options = { method: req.method, headers: { Accept: "application/json" } };
  if (req.body != null && req.method !== "GET") { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(req.body); }
  try { return await fetchJson(req.url, options, timeoutMs); }
  catch (err) { return { ok: false, status: 0, body: { error: String(err && err.message || err) } }; }
}

async function lookUpGroupId(url, apiKey, dataDir, banner = bannerOf()) {
  const u = new URL(url);
  if (!u.searchParams.has("apiKey")) u.searchParams.set("apiKey", apiKey);
  const r = await fetchSovrn({ method: "GET", url: u.toString(), body: null });
  mkdirSync(dataDir, { recursive: true });
  const p = join(dataDir, `sovrn-approved-merchants-${stamp()}.json`);
  writeFileSync(p, JSON.stringify({ fetchedAt: new Date().toISOString(), url, status: r.status, body: r.body }, null, 1));
  console.log(`\n  Approved Merchants answer: HTTP ${r.status}, saved to ${p}`);
  const hits = r.ok ? bannerEntries(r.body, banner) : [];
  if (!hits.length) console.log(`  No entry naming ${banner.label} or merchant ${banner.merchantId} was found in it. Read the saved answer.`);
  for (const h of hits) console.log("  " + JSON.stringify(h));
  /* Merchant id and group id may differ: say which this answer shows, for the #443 log. */
  const sameId = hits.some((h) => Object.entries(h).some(([k, v]) => /group/i.test(k) && String(v) === banner.merchantId));
  if (hits.length) console.log(`  ${banner.label}: merchant ${banner.merchantId}; ${sameId ? "a group field in the answer EQUALS the merchant id" : "no group field in the answer equals the merchant id -- read the group ID above"}.`);
  console.log(`  Set ${banner.groupEnv}=<the ${banner.label} group ID from above> (or --merchant-group) and re-run.`);
}

async function runSovrn(args) {
  const env = process.env;
  const apiKey = String(env[SOVRN_ENV.apiKey] || "").trim();
  const banner = args.banner;
  const DATA_DIR = dataDir(banner);
  const groupId = String(args.merchantGroup || env[banner.groupEnv] || "").trim();
  const approvedUrl = args.approvedMerchantsUrl || env[SOVRN_ENV.approvedMerchantsUrl] || null;
  const plan = readPlan(args.sweepPlan, banner);
  if (!apiKey) {
    console.error(`\n  --via sovrn needs ${SOVRN_ENV.apiKey} (the Sovrn site API key) in the environment. Nothing was requested.`);
    process.exitCode = 1;
    return;
  }
  if (!groupId) {
    console.log(groupIdGuidance({ approvedMerchantsUrl: approvedUrl, banner }));
    if (approvedUrl) await lookUpGroupId(approvedUrl, apiKey, DATA_DIR, banner);
    process.exitCode = 5;
    return;
  }
  const target = args.target > 0 ? args.target : banner.target;
  const endpoint = env[SOVRN_ENV.productsUrl] || SOVRN_PRODUCTS_URL;
  const intervalMs = throttleIntervalMs({ share: args.throttleShare || SOVRN_THROTTLE_SHARE });
  const maxRequests = args.maxRequests || SOVRN_MAX_REQUESTS;
  const s = stamp();
  const rawDir = join(DATA_DIR, `sovrn-raw-${s}`);
  mkdirSync(rawDir, { recursive: true });
  const index = { via: "sovrn", banner: banner.key, merchantId: banner.merchantId, startedAt: new Date().toISOString(), endpoint, groupId, target, maxRequests, intervalMs,
    departments: plan.departments.map((d) => ({ category: d.category, phase: d.phase || 2, ...(d.gender ? { gender: d.gender } : {}), ...(d.bucket ? { bucket: d.bucket } : {}), terms: ["-"] })),
    requestTemplate: plan.request || null, note: "Raw Sovrn answers, one file per request. The API key is never written here." };
  writeFileSync(join(rawDir, "index.json"), JSON.stringify(index, null, 1));

  console.log(`\n  ${banner.label} via Sovrn Commerce -- Product Recommendation API keyword sweep`);
  console.log(`  merchant ${banner.merchantId}, group ID ${groupId}${groupId === banner.merchantId ? " (equals the merchant id)" : " (differs from the merchant id)"}, up to 50 products per request, target ${target.toLocaleString("en-US")}, at most ${maxRequests.toLocaleString("en-US")} requests, one every ${intervalMs} ms`);
  const sweep = await runSweep({
    plan, target, maxRequests,
    minYield: args.minYield != null ? args.minYield : SOVRN_MIN_YIELD,
    yieldWindow: args.yieldWindow || SOVRN_YIELD_WINDOW,
    merchantIds: [banner.merchantId, groupId],
    banner,
    throttle: makeThrottle({ intervalMs }),
    log: (m) => console.log(m),
    request: (term) => fetchSovrn(buildRequest(plan, { term, apiKey, groupId, endpoint })),
    onResponse: (seq, dept, term, res) => {
      const logged = buildRequest(plan, { term, apiKey: "", groupId, endpoint }).logged;
      writeFileSync(join(rawDir, `req-${String(seq).padStart(5, "0")}.json`),
        JSON.stringify({ seq, department: dept.category, term, request: logged, status: res ? res.status : 0, body: res ? res.body : null }));
      if (seq % 50 === 0) console.log(`    ${seq} requests ...`);
    },
  });
  index.finishedAt = new Date().toISOString();
  index.requests = sweep.requests;
  index.stopped = sweep.stopped;
  index.unique = sweep.unique;
  writeFileSync(join(rawDir, "index.json"), JSON.stringify(index, null, 1));
  console.log(formatSweep(sweep, { target, intervalMs, rawDir, banner }));
  console.log(formatFieldReport(fieldReport(sweep.found)));
  if (!sweep.unique) {
    console.error(`\n  No products came back (${sweep.stopped}). Read the raw answers in ${rawDir} and fix the request template in the sweep plan.`);
    process.exitCode = 1;
    return;
  }
  console.log(`  re-ingest these raw answers later (no new requests): node scripts/build-neimanmarcus-catalog.mjs${banner.key === "neimanmarcus" ? "" : ` --banner ${banner.key}`} --src ${rawDir} --target ${target} --dry-run`);
  await ingestAndWrite(sweepToPulled(sweep.found, plan), { ...args, target }, { source: sovrnSource(banner), stamp: s });
}

/* ---------------- main ---------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.via === "sovrn" && !args.src) {
    await runSovrn(args);
    return;
  }

  if (args.src) {
    const { pulled, source, sweep } = loadSrc(args.src, args.banner);
    if (sweep) {
      console.log(formatSweep(sweep, { target: args.target || args.banner.target, rawDir: resolve(args.src), banner: args.banner }));
      console.log(formatFieldReport(fieldReport(sweep.found)));
    }
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
  const rawPath = join(DATA_ROOT, `raw-${s}.json`);
  mkdirSync(DATA_ROOT, { recursive: true });
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
