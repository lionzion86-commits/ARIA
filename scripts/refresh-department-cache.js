// Populates department-cache.json (served as a static file, free to read)
// with pre-fetched product grids for every real-test-confirmed department
// and brand across the four department-store retailers (Walmart, Target,
// Old Navy, Foot Locker) — see netlify/functions/apify-scrape-start.js's
// DEPARTMENT_CONFIG/BRAND_CONFIG for the underlying per-retailer config
// this imports directly, so the two files can't drift out of sync.
//
// Run manually every few days: `node scripts/refresh-department-cache.js`
// Calls the site's own already-deployed, already-tested functions rather
// than Apify directly, so it reuses the same auth and response handling.
// Costs real money each run (Apify usage) — see the printed cost estimate
// before it runs. Unlike scripts/refresh-auto-cache.js (which builds up a
// huge combinatorial cache over many runs and skips anything already
// cached), the department/brand combo count here is small (~22 total)
// and cheap, so every run does a full refresh of every entry rather than
// only filling gaps — that's the point, staleness matters more than cost
// here (prices/stock/sale status change).

import fs from "node:fs/promises";
import { DEPARTMENT_CONFIG, BRAND_CONFIG } from "../netlify/functions/apify-scrape-start.js";

const SITE = "https://ariashop.pe";
const OUT_FILE = new URL("../department-cache.json", import.meta.url);
const FETCH_TIMEOUT_MS = 60000;
const ITEMS_PER_DEPARTMENT = 24;
const ITEMS_PER_BRAND = 24;
const RUN_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 3000;
const CONCURRENCY = 3;

// Only these four — the retailers real-test confirmed in DEPARTMENT_CONFIG
// as of 2026-09-17. Add a retailer here once its config gets the same
// real-Apify-run confirmation (see the dated comments in
// apify-scrape-start.js), not before.
const RETAILERS = ["walmart", "target", "oldnavy", "footlocker"];

const RETAILER_LABELS = {
  walmart: "Walmart",
  target: "Target",
  oldnavy: "Old Navy",
  footlocker: "Foot Locker",
};

// Human-readable labels for department/brand keys. Adding a new
// department or brand to DEPARTMENT_CONFIG/BRAND_CONFIG in
// apify-scrape-start.js without adding a label here just falls back to
// the raw key (title-cased) — the frontend never needs its own copy of
// this map, it just reads `.label` off whatever this script writes.
const LABELS = {
  electronics: "Electronics",
  clothing: "Clothing",
  candy_chocolate: "Candy & Chocolate",
  sporting_goods: "Sporting Goods",
  home_goods: "Home Goods",
  pharmacy: "Pharmacy & Health",
  men: "Men",
  women: "Women",
  kids: "Kids",
  sale: "Sale",
  nike: "Nike",
};

// Raw Apify dataset items carry a lot of scraper-internal metadata
// (scrapedAt, proxyCountry, full image-URL arrays, etc.) the frontend's
// normalizeLiveItem() never reads — keeping only the fields it and the
// rest of index.html's rendering actually use cuts the cache file size
// drastically (was ~1.2MB unslimmed for ~500 items) with no loss of real
// data. Field list must stay in sync with normalizeLiveItem() in
// index.html.
const KEEP_FIELDS = [
  "title", "name", "productTitle", "productName",
  "price", "currentPrice", "salePrice", "effectivePrice",
  "image", "imageUrl", "thumbnail",
  "rating", "stars", "reviewScore", "averageRating",
  "availableSizes",
  "onSale", "isOnSale", "savingsAmount", "savingsPercent", "percentageOff", "percentOff",
  "regularPrice", "wasPrice", "was_price", "originalPrice",
];
function slimItem(item) {
  const slim = {};
  for (const k of KEEP_FIELDS) {
    if (item[k] !== undefined) slim[k] = item[k];
  }
  if (item.priceInfo && (item.priceInfo.price !== undefined || item.priceInfo.currentPrice !== undefined)) {
    slim.priceInfo = { price: item.priceInfo.price, currentPrice: item.priceInfo.currentPrice };
  }
  if (Array.isArray(item.images) && item.images.length) slim.images = [item.images[0]];
  return slim;
}

function labelFor(key) {
  return LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

let cache = { generatedAt: new Date().toISOString(), retailers: {} };

async function loadExistingCache() {
  try {
    const raw = await fs.readFile(OUT_FILE, "utf8");
    const existing = JSON.parse(raw);
    cache = { generatedAt: existing.generatedAt || cache.generatedAt, retailers: existing.retailers || {} };
    console.log(`Loaded existing cache from ${existing.generatedAt || "unknown time"}.`);
  } catch {
    console.log("No existing cache file found, starting fresh.");
  }
}

// Serialized through a promise chain, same as refresh-auto-cache.js —
// with CONCURRENCY workers each writing on completion, overlapping
// writes to the same file could otherwise interleave/corrupt it.
let saveQueue = Promise.resolve();
function saveCache() {
  saveQueue = saveQueue.then(async () => {
    cache.generatedAt = new Date().toISOString();
    await fs.writeFile(OUT_FILE, JSON.stringify(cache, null, 2));
  });
  return saveQueue;
}

function retailerBucket(retailer) {
  if (!cache.retailers[retailer]) {
    cache.retailers[retailer] = { label: RETAILER_LABELS[retailer], departments: {}, brands: {} };
  }
  return cache.retailers[retailer];
}

async function startRun(retailer, params, maxItems) {
  const res = await fetchWithTimeout(`${SITE}/.netlify/functions/apify-scrape-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retailer, maxItems, ...params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(errorText(data.error, `${retailer} start failed`));
  return data.runId;
}

async function pollRun(runId) {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetchWithTimeout(`${SITE}/.netlify/functions/apify-scrape-status?runId=${encodeURIComponent(runId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(errorText(data.error, "status check failed"));
    if (data.status === "SUCCEEDED") return data.items || [];
    if (data.error) throw new Error(errorText(data.error, "run failed"));
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error("run timed out");
}

async function fetchDepartment(retailer, department, maxItems = ITEMS_PER_DEPARTMENT) {
  const runId = await startRun(retailer, { department }, maxItems);
  return pollRun(runId);
}

async function fetchBrand(retailer, brand, maxItems = ITEMS_PER_BRAND) {
  const runId = await startRun(retailer, { brand }, maxItems);
  return pollRun(runId);
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

function buildTasks() {
  const tasks = [];
  for (const retailer of RETAILERS) {
    const depts = DEPARTMENT_CONFIG[retailer] || {};
    for (const [key, cfg] of Object.entries(depts)) {
      // oldnavy.kids_girls is fetched and merged into "kids" below, not
      // stored as its own department — see the dedicated block after
      // this loop.
      if (cfg.internal) continue;
      tasks.push({ type: "department", retailer, key });
    }
    const brands = BRAND_CONFIG[retailer] || {};
    for (const key of Object.keys(brands)) {
      tasks.push({ type: "brand", retailer, key });
    }
  }
  return tasks;
}

async function main() {
  await loadExistingCache();

  const tasks = buildTasks();
  const hasOldNavyKids = Boolean(DEPARTMENT_CONFIG.oldnavy?.kids && DEPARTMENT_CONFIG.oldnavy?.kids_girls);
  const totalRuns = tasks.length + (hasOldNavyKids ? 1 : 0); // +1 for the extra Girls run merged into "kids"
  console.log(`Refreshing ${tasks.length} department/brand combos across ${RETAILERS.length} retailers (${totalRuns} total Apify runs, concurrency ${CONCURRENCY}).`);
  console.log(`Estimated cost: ~$${(totalRuns * 0.015).toFixed(2)}-$${(totalRuns * 0.03).toFixed(2)} (Apify usage only).\n`);

  let done = 0;
  await mapWithConcurrency(tasks, CONCURRENCY, async (task) => {
    const bucket = retailerBucket(task.retailer);
    try {
      const items = task.type === "department"
        ? await fetchDepartment(task.retailer, task.key)
        : await fetchBrand(task.retailer, task.key);
      const target = task.type === "department" ? bucket.departments : bucket.brands;
      target[task.key] = { label: labelFor(task.key), items: items.map(slimItem), fetchedAt: new Date().toISOString() };
      await saveCache();
    } catch (err) {
      console.error(`  ${task.retailer}/${task.type}/${task.key} failed: ${err.message}`);
    }
    done++;
    console.log(`  [${done}/${tasks.length}] ${task.retailer} ${task.type} "${task.key}"`);
  });

  // Old Navy's "kids" department is presented as one tile on the site,
  // but the actor only has separate Boys/Girls facets (no combined
  // "kids" value in its own schema) — fetch Girls too and merge it into
  // the "kids" bucket populated above, rather than showing shoppers a
  // department that's silently boys-only.
  if (hasOldNavyKids) {
    try {
      const [boys, girls] = await Promise.all([
        fetchDepartment("oldnavy", "kids", Math.ceil(ITEMS_PER_DEPARTMENT / 2)),
        fetchDepartment("oldnavy", "kids_girls", Math.floor(ITEMS_PER_DEPARTMENT / 2)),
      ]);
      const merged = [];
      const max = Math.max(boys.length, girls.length);
      for (let i = 0; i < max; i++) {
        if (boys[i]) merged.push(boys[i]);
        if (girls[i]) merged.push(girls[i]);
      }
      const bucket = retailerBucket("oldnavy");
      bucket.departments.kids = { label: labelFor("kids"), items: merged.map(slimItem), fetchedAt: new Date().toISOString() };
      await saveCache();
      console.log(`  [merge] oldnavy kids: ${boys.length} boys + ${girls.length} girls = ${merged.length} items`);
    } catch (err) {
      console.error(`  oldnavy kids merge failed: ${err.message}`);
    }
  }

  console.log(`\nWrote ${OUT_FILE.pathname}`);
  for (const [retailer, bucket] of Object.entries(cache.retailers)) {
    console.log(`  ${retailer}: ${Object.keys(bucket.departments).length} departments, ${Object.keys(bucket.brands).length} brands`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
