#!/usr/bin/env node
/* ============================================================
   GALLERY BACKFILL (#443, comms #443 "Zumiez pass", FIX 2).

   WHERE ZUMIEZ CAME FROM. zumiez-catalog.json was committed in one
   piece (01b6506, "2,501 products via GraphQL pull"; its own header
   says source "zumiez-graphql-2026-10-05-direct"): a direct read of
   zumiez.com's storefront GraphQL, run outside this repo. No builder,
   no actor config and no refresh script for Zumiez exists here
   (scripts/lib/retailers.js: search false, browse true -- a catalogue
   file and no live actor). The pull kept ONE photo per product, so all
   2,494 products show one photo (reports/gallery-audit-by-store.md).

   THIS IS THE MINIMAL PULL PATH: it does not re-pull the catalogue. It
   sends the existing records' product URLs to a product-page scraper
   and merges back ONLY the photos (scripts/lib/gallery-backfill.js has
   every rule; scripts/test/gallery-backfill-tests.mjs pins them):
   price, sizes, title, brand, URL and every other field stay as they
   are. Any store's catalogue works (--store, --catalog).

   ONE COMMAND, THREE STEPS, AND NOTHING IS SPENT UNTIL YOU SAY SO.

     node scripts/backfill-gallery.mjs --store zumiez
         Prints the targets and the ESTIMATED COST, and stops. Exit 2.

     APIFY_API_KEY=... node scripts/backfill-gallery.mjs --store zumiez --confirm-spend
         Runs it straight against the Apify API from this machine
         (the site's apify-scrape-start function has no product-URL
         mode and caps a run at 200 items). Before every run the wave
         cap is checked again and Apify's own per-run limit
         (maxTotalChargeUsd) is set to what is left; after every run it
         re-projects from what Apify says the run cost and stops when
         the projection passes min(quote +25%, cap left). The raw rows
         are saved to data/gallery-backfill/ (gitignored) as they come,
         then merged (below).

     node scripts/backfill-gallery.mjs --store zumiez --src <raw.json> [--dry-run]
         Merge only, from a saved raw pull (or a dataset exported from
         the Apify console). Spends nothing. --dry-run prints the
         before/after coverage without writing.

   OPTIONS
     --actor <owner/name>   default apify/e-commerce-scraping-tool
     --input-key <field>    the actor's product-URL input field, default
                            detailsUrls (UNVERIFIED in this repo)
     --per-run <n>          product pages per run (default 500)
     --all                  every product, not only those on 0-1 photo
     --limit <n>            the first n targets only (a cheap trial run)
     --quote <usd>          the figure posted on the issue
     --max-spend-usd <usd>  the wave cap (default 200)
     --spent-usd <usd>      what this wave already spent elsewhere
   Rates: APIFY_COST_PER_RUN_USD, APIFY_COST_PER_1000_RESULTS_USD.

   AFTER A MERGE (the generated data, with the repo's own builders):
     node scripts/build-pdp-slices.mjs
     node scripts/build-store-slices.mjs
     node scripts/build-search-index.mjs
     node scripts/build-department-slices.mjs
     node scripts/build-ofertas-feed.mjs && node scripts/build-ofertas-slices.mjs
     node scripts/build-home-shelves.mjs
     node scripts/report-gallery-coverage.mjs --by-store --json
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ACTOR, DEFAULT_INPUT_KEY, URLS_PER_RUN, WAVE_CAP_USD, costRatesFromEnv, backfillTargets, planRuns,
  estimateBackfill, capGuard, formatEstimate, actorInput, mergeGalleries, serializerFor, runCostUsd,
} from "./lib/gallery-backfill.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA_DIR = process.env.GALLERY_BACKFILL_DATA_DIR ? resolve(process.env.GALLERY_BACKFILL_DATA_DIR) : join(ROOT, "data/gallery-backfill");
const RUN_TIMEOUT_MS = 60 * 60 * 1000;
const POLL_MS = 10000;

export function parseArgs(argv) {
  const a = { store: "zumiez", actor: DEFAULT_ACTOR, inputKey: DEFAULT_INPUT_KEY, perRun: URLS_PER_RUN, cap: WAVE_CAP_USD, spent: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], next = () => argv[++i];
    if (k === "--store") a.store = next();
    else if (k === "--catalog") a.catalog = next();
    else if (k === "--confirm-spend") a.confirm = true;
    else if (k === "--src") a.src = next();
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--actor") a.actor = next();
    else if (k === "--input-key") a.inputKey = next();
    else if (k === "--per-run") a.perRun = Number(next());
    else if (k === "--all") a.all = true;
    else if (k === "--limit") a.limit = Number(next());
    else if (k === "--quote") a.quote = Number(next());
    else if (k === "--max-spend-usd") a.cap = Number(next());
    else if (k === "--spent-usd") a.spent = Number(next());
    else throw new Error(`unknown option ${k}`);
  }
  if (!(a.perRun > 0)) throw new Error("--per-run must be a positive number");
  a.catalog = a.catalog || `${a.store}-catalog.json`;
  return a;
}

/* producto.html's own photo rule (galleryPhotoKey / galleryIsChart). */
async function pageRule() {
  const { liftPage } = await import("./build-pdp-slices.mjs");
  const P = liftPage(ROOT);
  return { photoKey: (u) => P.galleryPhotoKey(u), isChart: (u) => P.galleryIsChart(u) };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(path, token, options = {}) {
  const r = await fetch(`https://api.apify.com/v2${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body && body.data !== undefined ? body.data : body;
}

async function pull(args, targets, est) {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error("APIFY_API_KEY is not set");
  mkdirSync(DATA_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rawPath = join(DATA_DIR, `${args.store}-${stamp}.json`);
  const rows = [];
  let spent = 0, estimatedDone = 0;
  for (const [i, urls] of planRuns(targets, args.perRun).entries()) {
    const ratio = estimatedDone > 0 ? Math.max(1, spent / estimatedDone) : 1;
    const g = capGuard(spent, urls.length, est, ratio);
    if (!g.ok) { console.log("\n  " + g.reason); break; }
    const q = `?maxTotalChargeUsd=${g.chargeLimitUsd.toFixed(2)}`;
    const run = await api(`/acts/${args.actor.replace("/", "~")}/runs${q}`, token, { method: "POST", body: JSON.stringify(actorInput(urls, args.inputKey)) });
    console.log(`  run ${i + 1}: ${urls.length} product pages, run ${run.id} (charge limit $${g.chargeLimitUsd.toFixed(2)})`);
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let done = null;
    while (Date.now() < deadline) {
      const s = await api(`/actor-runs/${encodeURIComponent(run.id)}`, token);
      if (s.status === "SUCCEEDED") { done = s; break; }
      if (["FAILED", "ABORTED", "TIMED-OUT"].includes(s.status)) { done = s; break; }
      await wait(POLL_MS);
    }
    if (!done) throw new Error(`run ${run.id} timed out`);
    const items = done.defaultDatasetId ? await api(`/datasets/${done.defaultDatasetId}/items?clean=true`, token) : [];
    rows.push(...(Array.isArray(items) ? items : []));
    spent += Number(done.usageTotalUsd) || runCostUsd(urls.length, est.rates);
    estimatedDone += runCostUsd(urls.length, est.rates);
    writeFileSync(rawPath, JSON.stringify(rows));
    console.log(`         ${done.status}: ${Array.isArray(items) ? items.length : 0} rows, spent so far $${spent.toFixed(2)}`);
    if (done.status !== "SUCCEEDED") break;
  }
  console.log(`  raw rows: ${rawPath}`);
  return { rows, rawPath };
}

function merge(args, rule, rows, label) {
  const path = join(ROOT, args.catalog);
  const text = readFileSync(path, "utf8");
  const write = serializerFor(text);
  if (!write && !args.dryRun) throw new Error(`${args.catalog}: cannot reproduce its JSON style; refusing to rewrite it`);
  /* The writer's own parse: numbers written as 1.0 stay 1.0. */
  const catalog = write && write.parse ? write.parse(text) : JSON.parse(text);
  const res = mergeGalleries(catalog, rows, { retailerKey: args.store, ...rule, stamp: label });
  const pct = (x, n) => (n ? (100 * x / n).toFixed(1) + "%" : "-");
  const n = res.before.single + res.before.multi;
  console.log(`\n  MERGE (${args.store}): ${res.matchedRows} rows matched ${res.matchedUrls} product pages, ${res.unmatchedRows} rows matched no record`);
  console.log(`  products with 2+ photos: before ${res.before.multi}/${n} (${pct(res.before.multi, n)}), after ${res.after.multi}/${n} (${pct(res.after.multi, n)})`);
  console.log(`  records updated: ${res.updated}, photos added: ${res.photosAdded}. Prices, sizes and every other field untouched.`);
  if (args.dryRun) { console.log("  --dry-run: nothing written."); return res; }
  writeFileSync(path, write(catalog));
  console.log(`  wrote ${args.catalog}. Now rebuild the generated data (see the header of this script).`);
  return res;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const rule = await pageRule();
  if (args.src) {
    const rows = JSON.parse(readFileSync(resolve(args.src), "utf8"));
    merge(args, rule, Array.isArray(rows) ? rows : rows.items || [], `merge ${new Date().toISOString().slice(0, 10)}`);
    process.exit(0);
  }
  if (!existsSync(join(ROOT, args.catalog))) throw new Error(`${args.catalog} not found`);
  const catalog = JSON.parse(readFileSync(join(ROOT, args.catalog), "utf8"));
  const t = backfillTargets(catalog, { retailerKey: args.store, ...rule, onlySingle: !args.all });
  let targets = t.targets;
  if (args.limit > 0) targets = targets.slice(0, args.limit);
  console.log(`  ${args.catalog}: ${t.records} records, ${t.urls} product pages (${t.noUrl} records without an https URL), ${t.alreadyMulti} already on 2+ photos`);
  console.log(`  targets: ${targets.length} product pages${args.all ? "" : " on 0-1 photo"}`);
  const est = estimateBackfill(targets.length, costRatesFromEnv(process.env), { perRun: args.perRun, capUsd: args.cap, spentUsd: args.spent, quoteUsd: args.quote });
  console.log(formatEstimate(est, { store: args.store, actor: args.actor, inputKey: args.inputKey }));
  if (est.overCap) process.exit(3);
  if (!args.confirm) { console.log("\n  Not run. Add --confirm-spend to run it (APIFY_API_KEY in the environment)."); process.exit(2); }
  const { rows } = await pull(args, targets, est);
  merge(args, rule, rows, `${args.actor} ${new Date().toISOString().slice(0, 10)}`);
}
