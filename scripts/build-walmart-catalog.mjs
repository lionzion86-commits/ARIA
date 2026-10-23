#!/usr/bin/env node
/* ============================================================
   walmart-density-catalog.json — THE WALMART DENSITY PROGRAM (#443).
   The plan, the rules and the assumptions are in
   scripts/lib/walmart-density.js. Same flow as every pull here:

   NOTHING IS SPENT UNTIL YOU SAY SO.

     node scripts/build-walmart-catalog.mjs [--only toys,kids_baby] [--per-term-max 60] [--spent-usd X]
         The estimate, per department, against the $200 program
         envelope. Spends nothing (exit 2; --estimate-only exits 0).

     node scripts/build-walmart-catalog.mjs --trial 20 --confirm-spend
         THE TRIAL (trial-first rule, #443): one listing run (the first
         toys clearance term, 20 rows) and one detail run over those 20
         product pages. Prints the gallery yield (distinct photos, render
         presets collapsed), price / GTIN / description / spec coverage,
         every raw key the detail rows carried, and PASS or FAIL. A few
         cents. Raw answers saved under data/walmart/.

     node scripts/build-walmart-catalog.mjs --confirm-spend --quote <usd> [--only ...]
         The pull: every listing run in priority order (clearance first in
         every department), then the detail pass over the de-duplicated
         product pages, 500 per run. Before each run the envelope guard
         checks the spend so far plus that run against what is left of
         $200 (and passes Apify its own per-run charge limit); a run that
         would cross it does not start. Then the ingest, the weight-gate
         tags, the INGEST REPORT (SHIP / DO NOT SHIP) and the Spanish step.

     node scripts/build-walmart-catalog.mjs --src data/walmart/raw-<stamp>.json [--dry-run]
         Re-ingest a saved pull through the current mapping (no new spend).

   ENV (names only): APIFY_API_KEY; optional APIFY_COST_PER_RUN_USD,
   WALMART_LISTING_COST_PER_1000_USD, WALMART_DETAIL_COST_PER_1000_USD,
   GROQ_API_KEY (the Spanish step).
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  WALMART_KEY, WALMART_LABEL, OUT_FILE, WAVE_CAP_USD, LISTING_ACTOR, DETAIL_ACTOR, DETAIL_URLS_PER_RUN, PRICE_BAND_USD,
  listingPlan, listingInput, detailInput, ratesFromEnv, estimateProgram, formatProgramEstimate,
  detailToRow, ingestProgram, productCount, trialReport, formatTrialReport, listingUrl,
} from "./lib/walmart-density.js";
import { parseExplain } from "./lib/pull-quality.js";
import { runTranslation, reportCatalog, readCatalog, DO_NOT_SHIP_EXIT } from "./lib/pull-finish.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA_DIR = process.env.WALMART_DATA_DIR ? resolve(process.env.WALMART_DATA_DIR) : join(ROOT, "data/walmart");
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 5000;
const PAGE = 1000;

export function parseArgs(argv) {
  const a = { explain: [], maxSpendUsd: WAVE_CAP_USD, spentUsd: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--confirm-spend") a.confirm = true;
    else if (k === "--estimate-only") a.estimateOnly = true;
    else if (k === "--quote") a.quote = Number(next());
    else if (k === "--only") a.only = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--per-term-max") a.perTermMax = Number(next());
    else if (k === "--spent-usd") a.spentUsd = Number(next());
    else if (k === "--max-spend-usd") a.maxSpendUsd = Number(next());
    else if (k === "--trial") a.trial = Number(next());
    else if (k === "--detail-input-key") a.detailInputKey = next();
    else if (k === "--src") a.src = next();
    else if (k === "--out") a.out = next();
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--no-weight-estimates") a.noWeightEstimates = true;
    else if (k === "--explain") a.explain.push(next());
    else throw new Error(`unknown option ${k}`);
  }
  if (a.maxSpendUsd > WAVE_CAP_USD) throw new Error(`--max-spend-usd above the $${WAVE_CAP_USD} program envelope`);
  if (a.trial != null && !(a.trial > 0 && a.trial <= 100)) throw new Error("--trial takes 1..100 products");
  a.explainMap = parseExplain(a.explain);
  return a;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bareUrl = (u) => String(u || "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();

async function fetchJson(url, options = {}, timeoutMs = 60000) {
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

/* Any actor, any input; chargeLimitUsd is Apify's own per-run ceiling. */
const apifyActor = (token, actorId) => {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    async run(input, { chargeLimitUsd = null } = {}) {
      const qs = chargeLimitUsd != null ? `?maxTotalChargeUsd=${Math.max(0, chargeLimitUsd).toFixed(2)}` : "";
      const r = await fetchJson(`https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/runs${qs}`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error(`start failed (${r.status}): ${r.body?.error?.message || JSON.stringify(r.body).slice(0, 200)}`);
      const runId = r.body.data.id;
      const deadline = Date.now() + RUN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const s = await fetchJson(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, { headers: auth });
        if (!s.ok) throw new Error(`status failed (${s.status})`);
        const run = s.body.data;
        if (run.status === "SUCCEEDED") {
          const items = [];
          for (let offset = 0; ; offset += PAGE) {
            const page = await fetchJson(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&offset=${offset}&limit=${PAGE}`, { headers: auth }, 5 * 60 * 1000);
            if (!page.ok) throw new Error(`dataset fetch failed (run ${runId})`);
            const rows = Array.isArray(page.body) ? page.body : [];
            items.push(...rows);
            if (rows.length < PAGE) break;
          }
          return { runId, items, usageUsd: Number(run.usageTotalUsd) };
        }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) throw new Error(`run ${runId} ended ${run.status}`);
        await wait(POLL_MS);
      }
      throw new Error(`run ${runId} still running after the timeout`);
    },
  };
};

/** Merge listing rows with their detail rows (by product URL): [{ run, rows }]. */
export function mergePull(listings, details) {
  const byUrl = new Map();
  for (const d of details || []) { const u = bareUrl(d && (d.url || d.productUrl || d.canonicalUrl)); if (u) byUrl.set(u, d); }
  return listings.map(({ run, items }) => ({
    run,
    rows: (items || []).map((l) => detailToRow(byUrl.get(bareUrl(listingUrl(l))) || null, l)),
  }));
}

async function ingestContext() {
  const { loadShippable } = await import("./build-store-slices.mjs");
  const { specWeightKg } = await import("../netlify/functions/_weight-resolve.js");
  return { band: PRICE_BAND_USD, isShippableItem: loadShippable(ROOT), specWeightKg: (x) => specWeightKg(x) };
}

function printCounts(stats, spentUsd) {
  const pct = (x) => (stats.published ? `${Math.round((100 * x) / stats.published)}%` : "-");
  console.log(`\n  Walmart ingest: ${stats.published} published of ${stats.rows} rows`);
  console.log("  per department (expected max / listed / published / from clearance):");
  for (const [d, p] of Object.entries(stats.perDept)) console.log(`    ${d.padEnd(14)} ${String(p.expected).padStart(5)} / ${String(p.listed).padStart(5)} / ${String(p.published).padStart(5)} / ${String(p.clearance).padStart(5)}`);
  console.log(`  galleries (2+ photos) ${pct(stats.gallery)}   real weight ${pct(stats.realWeight)}   GTIN ${pct(stats.gtin)}   PDP text ${pct(stats.described)}`);
  console.log(`  WEIGHT GATE: ${stats.blastEligible} promotable (verified <= 5 kg); held ${JSON.stringify(stats.blastHold)}. The price-gap half of the gate needs Peru prices: merchandising's call.`);
  console.log(`  dropped ${JSON.stringify(stats.dropped)}   quarantined ${JSON.stringify(stats.quarantined)}`);
  if (spentUsd != null) console.log(`  program envelope: $${spentUsd.toFixed(2)} drawn of $${WAVE_CAP_USD.toFixed(2)}`);
}

async function ingestAndWrite(pulled, args, { spentUsd = null } = {}) {
  const ctx = await ingestContext();
  const { catalog, stats } = ingestProgram(pulled, ctx);
  printCounts(stats, spentUsd);
  if (args.dryRun) {
    reportCatalog({ label: `${WALMART_LABEL} density (dry run, nothing written)`, key: WALMART_KEY, catalog, rows: stats.rows, explain: args.explainMap, stage: "dry-run", weightEstimates: !args.noWeightEstimates });
    console.log("\n  --dry-run: nothing written");
    return;
  }
  if (!productCount(catalog)) { console.error("\n  refusing to write an empty catalogue"); process.exitCode = 1; return; }
  const out = args.out ? resolve(args.out) : join(ROOT, OUT_FILE);
  writeFileSync(out, JSON.stringify(catalog));
  if (!args.noWeightEstimates) execFileSync("python3", ["apply-weight-estimates.py", "weight-estimates.json", out, "--in-place"], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  console.log(`\n  wrote ${out}  (${productCount(catalog)} products)`);
  const translation = runTranslation(out, { root: ROOT });
  const { verdict } = reportCatalog({ label: `${WALMART_LABEL} density`, key: WALMART_KEY, catalog: readCatalog(out), rows: stats.rows, explain: args.explainMap, stage: "written", translation });
  if (!verdict.ship) { console.log(`\n  DO NOT SHIP: ${out} stays local.`); process.exitCode = DO_NOT_SHIP_EXIT; }
}

async function photoKeyFn() {
  const { liftDeclarations } = await import("./lib/page-lift.mjs");
  const html = readFileSync(join(ROOT, "producto.html"), "utf8").replace(/<script\b[^>]*>/g, "\n").replace(/<\/script>/g, "\n");
  return liftDeclarations(html, ["galleryPhotoKey"]).galleryPhotoKey;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.src) {
    const saved = JSON.parse(readFileSync(resolve(args.src), "utf8"));
    await ingestAndWrite(mergePull(saved.listings || [], saved.details || []), args, { spentUsd: saved.spentUsd ?? null });
    return;
  }

  const rates = ratesFromEnv(process.env);
  const plan = listingPlan({ only: args.only, perTermMax: args.perTermMax });
  const est = estimateProgram(plan, rates, { capUsd: args.maxSpendUsd, spentBeforeUsd: args.spentUsd });

  if (args.trial) {
    if (!args.confirm) { console.log(`\n  The trial spends a few cents (${args.trial} listing rows + ${args.trial} detail rows). Re-run with --confirm-spend.`); process.exitCode = 2; return; }
    const token = process.env.APIFY_API_KEY;
    if (!token) throw new Error("--trial needs APIFY_API_KEY in the environment");
    const run = { ...plan[0], maxItems: args.trial };
    console.log(`\n  TRIAL: "${run.term}" (${run.dept}), ${args.trial} rows, then the detail pass over them`);
    const listing = await apifyActor(token, LISTING_ACTOR).run(listingInput(run), { chargeLimitUsd: 1 });
    const urls = [...new Set(listing.items.map(listingUrl).filter(Boolean))].slice(0, args.trial);
    const detail = urls.length ? await apifyActor(token, DETAIL_ACTOR).run(detailInput(urls, args.detailInputKey), { chargeLimitUsd: 1 }) : { items: [], usageUsd: 0 };
    mkdirSync(DATA_DIR, { recursive: true });
    const p = join(DATA_DIR, `trial-${stamp()}.json`);
    const spentUsd = (listing.usageUsd || 0) + (detail.usageUsd || 0);
    writeFileSync(p, JSON.stringify({ listings: [{ run, items: listing.items }], details: detail.items, spentUsd, runs: [listing.runId, detail.runId] }, null, 1));
    console.log(`  listing ${listing.items.length} rows (${listing.runId}), detail ${detail.items.length} rows (${detail.runId}); spent $${spentUsd.toFixed(3)}; raw: ${p}`);
    console.log(formatTrialReport(trialReport(detail.items, { photoKey: await photoKeyFn() })));
    await ingestAndWrite(mergePull([{ run, items: listing.items }], detail.items), { ...args, dryRun: true }, { spentUsd });
    return;
  }

  console.log(formatProgramEstimate(est));
  if (args.estimateOnly || !args.confirm) {
    console.log("\n  Nothing was spent. Post this estimate, run the --trial first, then --confirm-spend --quote <usd>.\n");
    process.exitCode = args.estimateOnly ? 0 : 2;
    return;
  }
  if (est.overCap) { console.error("\n  The estimate is over what is left of the envelope; nothing was started."); process.exitCode = 1; return; }
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error("--confirm-spend needs APIFY_API_KEY in the environment");

  const stopAbove = Math.min(est.capRemainingUsd, (Number(args.quote) > 0 ? Number(args.quote) : est.estimateUsd) * 1.25);
  let spent = 0;
  const s = stamp();
  const rawPath = join(DATA_DIR, `raw-${s}.json`);
  mkdirSync(DATA_DIR, { recursive: true });
  const listings = [];
  const save = (details = []) => writeFileSync(rawPath, JSON.stringify({ listings, details, spentUsd: spent, plan: plan.length }));
  const guard = (nextUsd) => spent + nextUsd <= stopAbove;
  for (const [i, run] of plan.entries()) {
    const nextUsd = rates.perRun + (run.maxItems * rates.listingPer1000) / 1000;
    if (!guard(nextUsd)) { console.log(`  ENVELOPE GUARD: $${spent.toFixed(2)} + ~$${nextUsd.toFixed(2)} > $${stopAbove.toFixed(2)}; listing stops at run ${i + 1}/${plan.length}.`); break; }
    process.stdout.write(`  [${i + 1}/${plan.length}] ${run.dept}: "${run.term}" (up to ${run.maxItems}) ... `);
    try {
      const r = await apifyActor(token, LISTING_ACTOR).run(listingInput(run), { chargeLimitUsd: stopAbove - spent });
      spent += Number.isFinite(r.usageUsd) ? r.usageUsd : nextUsd;
      listings.push({ run, items: r.items });
      console.log(`${r.items.length} rows, total $${spent.toFixed(2)}`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      if (!listings.length) { save(); process.exitCode = 1; return; }
    }
    save();
  }
  const urls = [...new Set(listings.flatMap((l) => l.items.map(listingUrl)).filter(Boolean).map((u) => u.split("?")[0]))];
  const details = [];
  for (let i = 0; i < urls.length; i += DETAIL_URLS_PER_RUN) {
    const chunk = urls.slice(i, i + DETAIL_URLS_PER_RUN);
    const nextUsd = rates.perRun + (chunk.length * rates.detailPer1000) / 1000;
    if (!guard(nextUsd)) { console.log(`  ENVELOPE GUARD: detail pass stops at ${i}/${urls.length} pages.`); break; }
    process.stdout.write(`  detail ${i + 1}-${i + chunk.length} of ${urls.length} ... `);
    try {
      const r = await apifyActor(token, DETAIL_ACTOR).run(detailInput(chunk, args.detailInputKey), { chargeLimitUsd: stopAbove - spent });
      spent += Number.isFinite(r.usageUsd) ? r.usageUsd : nextUsd;
      details.push(...r.items);
      console.log(`${r.items.length} rows, total $${spent.toFixed(2)}`);
    } catch (err) { console.log(`FAILED: ${err.message}`); }
    save(details);
  }
  console.log(`\n  pull complete: $${spent.toFixed(2)} spent this run (+ $${args.spentUsd.toFixed(2)} before). Raw: ${rawPath}`);
  await ingestAndWrite(mergePull(listings, details), args, { spentUsd: spent + args.spentUsd });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
}
