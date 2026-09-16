// Populates auto-cache.json (served as a static file, free to read) with
// vehicle selector data and pre-computed part-search results for a curated
// "popular" set of years/makes/models/parts.
//
// Run manually every few days: `node scripts/refresh-auto-cache.js`
// Calls the site's own already-deployed, already-tested functions rather
// than parse.bot/Apify directly, so it reuses the same auth and response
// handling. Costs real money each run (parse.bot credits + Apify usage) —
// see the printed cost estimate before it runs.
//
// A first run hung indefinitely on a stalled fetch() with no timeout, and
// lost all in-memory progress since the cache was only written at the very
// end. Fixed here: every fetch has a timeout, and the cache is saved to
// disk after each unit of work completes.

import fs from "node:fs/promises";

const SITE = "https://ariashop.pe";
const OUT_FILE = new URL("../auto-cache.json", import.meta.url);
// O'Reilly calls that hit site-protection blocking include their own
// internal retry cycle ("attempts":3) before returning an error — a 25s
// timeout was likely cutting that off before it could finish and report
// what actually happened, showing up as a generic "operation was aborted"
// instead of the real error.
const FETCH_TIMEOUT_MS = 60000;

const CURRENT_YEAR = new Date().getFullYear();
// Reduced scope for anything that depends on O'Reilly's own vehicle data,
// since their site protection has been intermittently blocking parse.bot's
// proxies ("site protection blocking all proxies") — kept small to limit
// cost-at-risk while that's unresolved.
const SELECTOR_YEARS = Array.from({ length: 3 }, (_, i) => String(CURRENT_YEAR - i)); // last 3 years
const POPULAR_MAKES = ["Toyota"];
const POPULAR_MODELS = { Toyota: ["Camry"] };
const PART_SEARCH_YEARS = [SELECTOR_YEARS[0]]; // must be one of SELECTOR_YEARS so model data exists to match against
const POPULAR_PARTS = ["pastillas de freno", "bujías", "filtro de aceite"];

// AutoZone doesn't need O'Reilly's numeric make/model IDs at all — its
// search just takes a free-text query, so this is decoupled from O'Reilly
// entirely and can run at full scope regardless of O'Reilly's blocking.
// Keeps the two years from the first seed (so that data stays valid) and
// adds a third, older year for broader coverage.
// Full 2009-2026 range — 18 years x 26 vehicles x 4 parts = 1,872 combos.
const AUTOZONE_YEARS = Array.from({ length: 2026 - 2009 + 1 }, (_, i) => String(2009 + i));
const AUTOZONE_VEHICLES = [
  { make: "Toyota", model: "Camry" }, { make: "Toyota", model: "Corolla" },
  { make: "Honda", model: "Accord" }, { make: "Honda", model: "Civic" },
  { make: "Ford", model: "F-150" }, { make: "Ford", model: "Escape" },
  { make: "Kia", model: "Optima" }, { make: "Kia", model: "Sportage" },
  { make: "Hyundai", model: "Elantra" }, { make: "Hyundai", model: "Tucson" },
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

let cache = { generatedAt: new Date().toISOString(), years: [], makes: {}, models: {}, partSearches: {} };

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
      years: existing.years || [],
      makes: existing.makes || {},
      models: existing.models || {},
      partSearches: existing.partSearches || {},
    };
    console.log(`Loaded existing cache: ${Object.keys(cache.makes).length} make-years, ${Object.keys(cache.models).length} model combos, ${Object.keys(cache.partSearches).length} part searches`);
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

// A first real run hit "usage_exceeded" on every call after the second —
// this account's parse.bot tier appears to cap out around 5 req/min, so
// pacing at well under that (one call per 13s) plus a retry-with-backoff
// on rate-limit errors, instead of just recording a failure and moving on.
const OREILLY_DELAY_MS = 13000;

async function callOreilly(action, params = {}, attempt = 1) {
  const res = await fetchWithTimeout(`${SITE}/.netlify/functions/oreilly-parts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = errorText(data.error, `oreilly ${action} failed`);
    if (/usage_exceeded|rate/i.test(message) && attempt < 4) {
      const backoff = OREILLY_DELAY_MS * attempt;
      console.error(`  rate limited on ${action} (attempt ${attempt}), waiting ${backoff / 1000}s...`);
      await wait(backoff);
      return callOreilly(action, params, attempt + 1);
    }
    throw new Error(message);
  }
  return data?.data?.items || [];
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

async function main() {
  await loadExistingCache();

  const modelsPerMake = POPULAR_MAKES.reduce((sum, m) => sum + (POPULAR_MODELS[m]?.length || 0), 0);
  const oreillyPartSearchCombos = PART_SEARCH_YEARS.length * modelsPerMake * POPULAR_PARTS.length;
  const estimatedOreillyCredits = 2 + SELECTOR_YEARS.length * 2 + SELECTOR_YEARS.length * POPULAR_MAKES.length * 1
    + oreillyPartSearchCombos * 5;
  const autozoneComboCount = AUTOZONE_YEARS.length * AUTOZONE_VEHICLES.length * AUTOZONE_PARTS.length;
  console.log(`Estimated parse.bot cost: ~${estimatedOreillyCredits} credits (~$${(estimatedOreillyCredits * 0.01).toFixed(2)}-$${(estimatedOreillyCredits * 0.03).toFixed(2)})`);
  console.log(`Plus ~${autozoneComboCount} AutoZone Apify runs (~$0.01-0.03 each, decoupled from O'Reilly).\n`);

  console.log("Fetching vehicle years...");
  try {
    cache.years = await callOreilly("get_vehicle_years");
    await saveCache();
  } catch (err) {
    console.error(`  years failed: ${err.message}`);
  }
  await wait(OREILLY_DELAY_MS);

  console.log(`Fetching makes for ${SELECTOR_YEARS.length} years...`);
  for (const year of SELECTOR_YEARS) {
    if (!cache.makes[year]) {
      try {
        cache.makes[year] = await callOreilly("get_vehicle_makes", { year });
        await saveCache();
      } catch (err) {
        console.error(`  makes(${year}) failed: ${err.message}`);
      }
      await wait(OREILLY_DELAY_MS);
    }
  }

  console.log(`Fetching models for ${SELECTOR_YEARS.length} years x ${POPULAR_MAKES.length} popular makes...`);
  const modelLookup = {}; // year -> make -> {makeId, models}, used below for part-search combos
  for (const year of SELECTOR_YEARS) {
    modelLookup[year] = {};
    for (const makeName of POPULAR_MAKES) {
      const make = (cache.makes[year] || []).find((m) => m.name === makeName);
      if (!make) continue;
      const modelKey = `${year}:${make.id}`;
      if (!cache.models[modelKey]) {
        try {
          const models = await callOreilly("get_vehicle_models", { year, make_id: make.id });
          cache.models[modelKey] = models;
          await saveCache();
        } catch (err) {
          console.error(`  models(${year}, ${makeName}) failed: ${err.message}`);
        }
        await wait(OREILLY_DELAY_MS);
      }
      if (cache.models[modelKey]) {
        modelLookup[year][makeName] = { makeId: make.id, models: cache.models[modelKey] };
      }
    }
  }

  console.log(`Fetching part searches for ${PART_SEARCH_YEARS.length} years x popular models x ${POPULAR_PARTS.length} parts...`);
  const combos = [];
  for (const year of PART_SEARCH_YEARS) {
    for (const makeName of POPULAR_MAKES) {
      const lookup = modelLookup[year]?.[makeName];
      if (!lookup) continue;
      for (const modelName of POPULAR_MODELS[makeName] || []) {
        const model = lookup.models.find((m) => m.name === modelName);
        if (!model) continue;
        for (const part of POPULAR_PARTS) {
          combos.push({ year, make: makeName, model: modelName, part });
        }
      }
    }
  }
  console.log(`  ${combos.length} combos to fetch (O'Reilly sequential w/ delay, AutoZone concurrency 4)`);

  for (const combo of combos) {
    const key = `${combo.year}|${combo.make}|${combo.model}|${combo.part}`.toLowerCase();
    if (cache.partSearches[key]?.oreilly) continue;
    const query = `${combo.year} ${combo.make} ${combo.model} ${combo.part}`;
    try {
      const items = await callOreilly("search_products", { query });
      cache.partSearches[key] = cache.partSearches[key] || {};
      cache.partSearches[key].oreilly = items.slice(0, 5);
      await saveCache();
    } catch (err) {
      console.error(`  oreilly search(${key}) failed: ${err.message}`);
    }
    await wait(OREILLY_DELAY_MS);
  }

  // Decoupled from the O'Reilly-dependent combos above — pure name-based
  // queries, no O'Reilly model IDs needed, so this runs at full scope
  // regardless of whether O'Reilly's API is currently being blocked.
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
  console.log(`years: ${cache.years.length}, makes: ${Object.keys(cache.makes).length} years, models: ${Object.keys(cache.models).length} combos, partSearches: ${Object.keys(cache.partSearches).length} combos`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
