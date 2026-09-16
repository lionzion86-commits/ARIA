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
const FETCH_TIMEOUT_MS = 25000;

const CURRENT_YEAR = new Date().getFullYear();
const SELECTOR_YEARS = Array.from({ length: 10 }, (_, i) => String(CURRENT_YEAR - i)); // last 10 years
const POPULAR_MAKES = ["Toyota", "Honda", "Ford"];
const POPULAR_MODELS = { Toyota: ["Camry", "Corolla"], Honda: ["Accord", "Civic"], Ford: ["F-150", "Escape"] };
const PART_SEARCH_YEARS = [String(CURRENT_YEAR - 3), String(CURRENT_YEAR - 8)]; // 2 representative years
const POPULAR_PARTS = ["pastillas de freno", "bujías", "filtro de aceite"];

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

async function saveCache() {
  cache.generatedAt = new Date().toISOString();
  await fs.writeFile(OUT_FILE, JSON.stringify(cache, null, 2));
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
  const estimatedOreillyCredits = 2 + SELECTOR_YEARS.length * 2 + SELECTOR_YEARS.length * POPULAR_MAKES.length * 1
    + PART_SEARCH_YEARS.length * POPULAR_MAKES.length * 2 * POPULAR_PARTS.length * 5;
  console.log(`Estimated parse.bot cost: ~${estimatedOreillyCredits} credits (~$${(estimatedOreillyCredits * 0.01).toFixed(2)}-$${(estimatedOreillyCredits * 0.03).toFixed(2)})`);
  console.log(`Plus ~${PART_SEARCH_YEARS.length * POPULAR_MAKES.length * 2 * POPULAR_PARTS.length} AutoZone Apify runs (~$0.01-0.03 each).\n`);

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

  console.log(`Fetching AutoZone results for the same ${combos.length} combos (concurrency 4)...`);
  const autozoneResults = await mapWithConcurrency(combos, 4, async (combo) => {
    const query = `${combo.year} ${combo.make} ${combo.model} ${combo.part}`;
    return callAutoZone(query, 5);
  });
  combos.forEach((combo, i) => {
    const key = `${combo.year}|${combo.make}|${combo.model}|${combo.part}`.toLowerCase();
    cache.partSearches[key] = cache.partSearches[key] || {};
    const result = autozoneResults[i];
    if (result.ok) {
      cache.partSearches[key].autozone = result.value.slice(0, 5);
    } else {
      console.error(`  autozone search(${key}) failed: ${result.error}`);
    }
  });
  await saveCache();

  console.log(`\nWrote ${OUT_FILE.pathname}`);
  console.log(`years: ${cache.years.length}, makes: ${Object.keys(cache.makes).length} years, models: ${Object.keys(cache.models).length} combos, partSearches: ${Object.keys(cache.partSearches).length} combos`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
