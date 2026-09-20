// Populates auto-cache.json (served as a static file, free to read) with
// vehicle selector data and pre-computed part-search results for a curated
// "popular" set of years/makes/models/parts.
//
// Run manually every few days: `node scripts/refresh-auto-cache.js`
// Calls the site's own already-deployed, already-tested functions rather
// than Apify directly, so it reuses the same auth and response handling.
// Costs real money each run (Apify usage) — see the printed cost estimate
// before it runs.
//
// A first run hung indefinitely on a stalled fetch() with no timeout, and
// lost all in-memory progress since the cache was only written at the very
// end. Fixed here: every fetch has a timeout, and the cache is saved to
// disk after each unit of work completes.

import fs from "node:fs/promises";
import { spendDecision, budgetFromEnv, tierFor } from "./lib/refresh-tiers.js";
import { extractFitment, matchesVehicle } from "./lib/fitment.js";

const SITE = "https://ariashop.pe";
const OUT_FILE = new URL("../auto-cache.json", import.meta.url);
const FETCH_TIMEOUT_MS = 60000;

// AutoZone's search takes a free-text query — no numeric make/model IDs
// and no vehicle-lookup API needed, so this runs at full scope.
// Keeps the two years from the first seed (so that data stays valid) and
// adds a third, older year for broader coverage.
// Full 2009-2026 range. 18 years x 30 vehicles x 4 parts = 2,160 combos
// (was 26 vehicles / 1,872 before the Sonata, Accent, Rio and Seltos rows
// were added). The script resumes and skips what the cache already holds,
// so a re-run after this change only fetches the new combinations.
const AUTOZONE_YEARS = Array.from({ length: 2026 - 2009 + 1 }, (_, i) => String(2009 + i));
const AUTOZONE_VEHICLES = [
  { make: "Toyota", model: "Camry" }, { make: "Toyota", model: "Corolla" },
  { make: "Honda", model: "Accord" }, { make: "Honda", model: "Civic" },
  { make: "Ford", model: "F-150" }, { make: "Ford", model: "Escape" },
  { make: "Kia", model: "Optima" }, { make: "Kia", model: "Sportage" },
  { make: "Hyundai", model: "Elantra" }, { make: "Hyundai", model: "Tucson" },
  /* SONATA ADDED 2026-09-20, and the reason is worth keeping. The live
     report that drove the whole fitment rework was "2020 Hyundai Sonata
     + pastillas de freno" — and the Sonata was never in this list, so
     that search never hit the cache at all and went out as a live scrape
     every time. Danny's results were real because AutoZone's own search
     was scoped to the vehicle; they were just costing an Apify run per
     shopper and could not be inspected here. A named test case that is
     not in the cache is a test case that cannot pass deterministically. */
  { make: "Hyundai", model: "Sonata" }, { make: "Hyundai", model: "Accent" },
  { make: "Kia", model: "Rio" }, { make: "Kia", model: "Seltos" },
  { make: "Chevrolet", model: "Silverado 1500" }, { make: "Chevrolet", model: "Malibu" },
  { make: "Nissan", model: "Altima" }, { make: "Nissan", model: "Rogue" },
  { make: "Subaru", model: "Outback" }, { make: "Subaru", model: "Forester" },
  { make: "Volvo", model: "XC90" }, { make: "Volvo", model: "S60" },
  { make: "BMW", model: "3 Series" }, { make: "BMW", model: "X5" },
  { make: "Mercedes-Benz", model: "C-Class" }, { make: "Mercedes-Benz", model: "E-Class" },
  { make: "Audi", model: "A4" }, { make: "Audi", model: "Q5" },
  { make: "Jeep", model: "Grand Cherokee" }, { make: "Jeep", model: "Wrangler" },
];
// Battery dropped — too heavy to ship internationally for this business.
const AUTOZONE_PARTS = ["pastillas de freno", "bujías", "filtro de aceite", "limpiaparabrisas"];

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function errorText(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return fallback; }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// years/makes/models are gone along with O'Reilly (2026-09-18): they were
// sourced purely from its vehicle-lookup API, and nothing ever read them —
// index.html's selector is the static STATIC_YEARS/STATIC_VEHICLES list,
// and loadAutoCache() only ever reads partSearches[key].autozone.
let cache = { generatedAt: new Date().toISOString(), partSearches: {} };

// BUG (fixed): the resume-skip checks throughout this file only work if
// the previous run's output is actually loaded first — without this, the
// script always started from this empty object, silently overwriting any
// previously-cached data with the new (possibly incomplete) run's results.
async function loadExistingCache() {
  try {
    const raw = await fs.readFile(OUT_FILE, "utf8");
    const existing = JSON.parse(raw);
    cache = {
      generatedAt: existing.generatedAt || cache.generatedAt,
      partSearches: existing.partSearches || {},
    };
    console.log(`Loaded existing cache: ${Object.keys(cache.partSearches).length} part searches`);
  } catch {
    console.log("No existing cache file found, starting fresh.");
  }
}

// Serialized through a promise chain — with concurrency-4 AutoZone workers
// now each calling this per-combo, overlapping writes to the same file
// could otherwise interleave/corrupt it.
let saveQueue = Promise.resolve();
function saveCache() {
  saveQueue = saveQueue.then(async () => {
    cache.generatedAt = new Date().toISOString();
    await fs.writeFile(OUT_FILE, JSON.stringify(cache, null, 2));
  });
  return saveQueue;
}

async function callAutoZone(query, maxItems = 5) {
  const startRes = await fetchWithTimeout(`${SITE}/.netlify/functions/apify-scrape-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retailer: "autozone", query, maxItems }),
  });
  const startData = await startRes.json();
  if (!startRes.ok) throw new Error(errorText(startData.error, "autozone start failed"));

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const statusRes = await fetchWithTimeout(`${SITE}/.netlify/functions/apify-scrape-status?runId=${encodeURIComponent(startData.runId)}`);
    const statusData = await statusRes.json();
    if (!statusRes.ok) throw new Error(errorText(statusData.error, "autozone status failed"));
    if (statusData.status === "SUCCEEDED") return statusData.items || [];
    if (statusData.error) throw new Error(errorText(statusData.error, "autozone run failed"));
    await wait(3000);
  }
  throw new Error("autozone run timed out");
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err.message };
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
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
  if (!guardSpend("auto")) return;

  await loadExistingCache();

  const autozoneComboCount = AUTOZONE_YEARS.length * AUTOZONE_VEHICLES.length * AUTOZONE_PARTS.length;
  console.log(`~${autozoneComboCount} AutoZone Apify runs (~$0.01-0.03 each).\n`);

  const autozoneCombos = [];
  for (const year of AUTOZONE_YEARS) {
    for (const { make, model } of AUTOZONE_VEHICLES) {
      for (const part of AUTOZONE_PARTS) {
        autozoneCombos.push({ year, make, model, part });
      }
    }
  }
  const pendingAutozone = autozoneCombos.filter((c) => {
    const key = `${c.year}|${c.make}|${c.model}|${c.part}`.toLowerCase();
    return !cache.partSearches[key]?.autozone;
  });
  console.log(`Fetching AutoZone results for ${autozoneCombos.length} combos (${pendingAutozone.length} not yet cached, concurrency 4)...`);
  // Saves after every combo (not just once at the end) — a previous run
  // that crashed/was killed mid-batch would have lost everything gathered
  // so far, since nothing was persisted until the whole batch finished.
  let autozoneDone = 0;
  await mapWithConcurrency(pendingAutozone, 4, async (combo) => {
    const key = `${combo.year}|${combo.make}|${combo.model}|${combo.part}`.toLowerCase();
    const query = `${combo.year} ${combo.make} ${combo.model} ${combo.part}`;
    try {
      const items = await callAutoZone(query, 5);
      cache.partSearches[key] = cache.partSearches[key] || {};
      cache.partSearches[key].autozone = items.slice(0, 5);
      await saveCache();
    } catch (err) {
      console.error(`  autozone search(${key}) failed: ${err.message}`);
    }
    autozoneDone++;
    if (autozoneDone % 50 === 0) console.log(`  ...${autozoneDone}/${pendingAutozone.length} AutoZone combos processed`);
  });

  console.log(`\nWrote ${OUT_FILE.pathname}`);
  console.log(`partSearches: ${Object.keys(cache.partSearches).length} combos`);
  reportFitmentCoverage();
}

/* ============================================================
   DID THIS RUN ACTUALLY BRING BACK FITMENT?

   The whole Aria Auto contract rests on one thing: does a cached part
   carry a compatibility list naming the vehicle it was cached under? An
   audit of the previous cache found ZERO across 9,285 items — every one
   scraped in "overview" mode, which returns description: null,
   features: [] and a two-key specs object. Nothing in this script or in
   apify-scrape-status.js drops those fields (checked, twice): the actor
   simply does not send them in that mode.

   So the mode is the variable, and this is the readout. If it prints 0%
   after a run, AUTO_SCRAPE_MODE in netlify/functions/apify-scrape-start.js
   is the thing to change, not this file. Printing it every run is what
   turns "the badge never went green" from a mystery into a number.
   ============================================================ */
function reportFitmentCoverage() {
  let items = 0;
  let withList = 0;
  let matchingItsOwnKey = 0;
  const sampleSources = new Map();

  for (const [key, entry] of Object.entries(cache.partSearches)) {
    const [year, make, model] = key.split("|");
    for (const raw of entry.autozone || []) {
      items++;
      const fitment = extractFitment(raw);
      if (!fitment) continue;
      withList++;
      sampleSources.set(fitment.from, (sampleSources.get(fitment.from) || 0) + 1);
      // The sharper question: does the list name the very vehicle this
      // result was cached under? A list we cannot match is as good as none.
      if (matchesVehicle(fitment.vehicles, { year, make, model })) matchingItsOwnKey++;
    }
  }

  const pct = (n) => (items ? Math.round((n / items) * 100) : 0);
  console.log("\n  calce (capa 1 de Aria Auto):");
  console.log(`    piezas en caché           ${items}`);
  console.log(`    con lista de compatibilidad ${withList} (${pct(withList)}%)`);
  console.log(`    que nombran su propio vehículo ${matchingItsOwnKey} (${pct(matchingItsOwnKey)}%)`);
  if (sampleSources.size) {
    console.log(`    campos de origen: ${[...sampleSources].map(([k, n]) => `${k}=${n}`).join(", ")}`);
  }
  if (!withList) {
    console.log("    NINGUNA pieza trae lista de compatibilidad. El scrape sigue en modo");
    console.log("    'overview'. Revisa AUTO_SCRAPE_MODE en netlify/functions/apify-scrape-start.js —");
    console.log("    ni este script ni apify-scrape-status.js descartan campos.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
