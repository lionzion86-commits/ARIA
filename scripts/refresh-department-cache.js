// Populates department-cache.json (served as a static file, free to read)
// with pre-fetched product grids for every real-test-confirmed department
// and brand across the four department-store retailers (Walmart, Target,
// Old Navy, Foot Locker) — see netlify/functions/apify-scrape-start.js's
// DEPARTMENT_CONFIG/BRAND_CONFIG for the underlying per-retailer config
// this file imports directly, so the two files can't drift out of sync.
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
import { estimateWeightDetail } from "./lib/sales-sources.js";
import { DEPARTMENT_CONFIG, BRAND_CONFIG } from "../netlify/functions/apify-scrape-start.js";
import { spendDecision, budgetFromEnv, tierFor } from "./lib/refresh-tiers.js";
import { quotasFor, targetDepth, plannedRuns, ITEMS_PER_QUOTA, MIN_HONEST_STOREFRONT, isHonestStorefront } from "./lib/catalog-quotas.js";
import { retailerFor } from "./lib/retailers.js";
import { specWeightKg } from "../netlify/functions/_weight-resolve.js";

const SITE = "https://ariashop.pe";
const OUT_FILE = new URL("../department-cache.json", import.meta.url);
const FETCH_TIMEOUT_MS = 60000;
/* CATALOG DEPTH (2026-09-20). ITEMS_PER_DEPARTMENT was 24: one scrape
   per department, capped at 24 rows, whatever mix the actor happened to
   return. That is how Old Navy women's rendered three to eight T-shirts
   and presented it as the store.

   Depth is declared per category now — see scripts/lib/catalog-quotas.js
   — and this is the per-run ceiling those quotas fill to. More rows per
   run is the cheapest depth there is: one run returning 60 costs the
   same as one returning 24. */
const ITEMS_PER_DEPARTMENT = ITEMS_PER_QUOTA;
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
/* THE WEIGHT FIELDS WERE MISSING FROM THIS LIST (2026-09-20).

   AUDITED, not guessed: every one of the 144 products in
   department-cache.json carries exactly eight fields — title, price,
   imageUrl, rating, isOnSale, savingsAmount, savingsPercent,
   regularPrice — and not one weight-shaped key among them. The
   allowlist below is why. netlify/functions/_weight-resolve.js has read
   shippingWeight, itemWeight, weightLb and the `specifications` array
   since it was written, and this function was deleting all of them one
   step earlier. Layer 1 of the weight pipeline — the retailer's own
   published weight, the only figure in the chain that is a measurement
   rather than an estimate — was being thrown away at ingestion.

   So the names here are kept deliberately in step with WEIGHT_FIELDS in
   _weight-resolve.js; a test asserts they still are. Costs a few bytes
   per item and removes the estimate entirely for every product whose
   retailer publishes a weight.

   NOTE FOR THE NEXT SCRAPE: keeping the fields is necessary and may not
   be sufficient. Listing-level actor output often omits weights that the
   product DETAIL page carries, so if a refresh still writes no weights,
   the next thing to check is the actor's scrape mode — not this list. */
const WEIGHT_FIELDS_FROM_RETAILER = [
  "weightKg", "weight_kg", "shippingWeightKg",
  "weight", "itemWeight", "item_weight", "shippingWeight", "shipping_weight",
  "weightLb", "weight_lb", "weightPounds",
  "specifications",
];

const KEEP_FIELDS = [
  "title", "name", "productTitle", "productName",
  "price", "currentPrice", "salePrice", "effectivePrice",
  "image", "imageUrl", "thumbnail",
  "rating", "stars", "reviewScore", "averageRating",
  "availableSizes",
  "onSale", "isOnSale", "savingsAmount", "savingsPercent", "percentageOff", "percentOff",
  "regularPrice", "wasPrice", "was_price", "originalPrice",
  ...WEIGHT_FIELDS_FROM_RETAILER,
];
// IMAGE-QUALITY RULE (2026-09-18): product images must not have a price
// rendered into them. The image shows the US sticker price while ours adds
// ~24% for shipping, duties and IGV, so a priced image always understates
// what the customer pays and reads as bait-and-switch.
//
// The check is OCR-based and too slow to run inline inside this scrape
// (it is seconds per image, against hundreds of images, while Apify runs
// are already in flight). So this script marks everything it writes as
// unscreened, and scripts/image-price-scan.js does the screening in a
// second pass. Run them together:
//
//   node scripts/refresh-department-cache.js && node scripts/image-price-scan.js
//
// `imageReview: "pending"` is what makes that safe: the storefront renders
// NO IMAGE for a pending item, so a fresh scrape can never put an
// unscreened, possibly-priced image in front of a customer just because
// the second pass has not run yet. The product itself stays listed and
// buyable — only a confirmed "quarantined" verdict withholds the product,
// because hiding every item after every refresh would empty the store.
function slimItem(item) {
  const slim = {};
  for (const k of KEEP_FIELDS) {
    if (item[k] !== undefined) slim[k] = item[k];
  }
  if (item.priceInfo && (item.priceInfo.price !== undefined || item.priceInfo.currentPrice !== undefined)) {
    slim.priceInfo = { price: item.priceInfo.price, currentPrice: item.priceInfo.currentPrice };
  }
  // Keep the whole gallery (capped to match normalizeLiveItem's own cap),
  // not just images[0]. The product page's thumbnail strip renders from
  // this list, so truncating it here meant cached items could never show
  // one however many photos the retailer actually returned.
  if (Array.isArray(item.images) && item.images.length) slim.images = item.images.slice(0, 8);
  // Unscreened until image-price-scan.js says otherwise.
  if (slim.image || slim.imageUrl || slim.thumbnail || slim.images) slim.imageReview = "pending";
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
  if (!guardSpend("catalog")) return;

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

  // Old Navy and Foot Locker use gendered department keys (men/women/kids)
  // instead of a flat "clothing" key like Walmart/Target — so neither ever
  // appeared under the site's "Ropa" (clothing) tile despite both being
  // clothing retailers. No re-fetch needed: this merges the men/women/kids
  // items already fetched above into a synthetic "clothing" bucket,
  // interleaved the same way the oldnavy kids boys+girls merge above
  // combines two real facets into one tile.
  const CLOTHING_MERGE_RETAILERS = ["oldnavy", "footlocker"];
  for (const retailer of CLOTHING_MERGE_RETAILERS) {
    const bucket = retailerBucket(retailer);
    const groups = ["men", "women", "kids"].map((k) => bucket.departments[k]?.items || []);
    const merged = [];
    const max = Math.max(0, ...groups.map((g) => g.length));
    for (let i = 0; i < max; i++) {
      for (const g of groups) if (g[i]) merged.push(g[i]);
    }
    if (merged.length) {
      bucket.departments.clothing = { label: labelFor("clothing"), items: merged, fetchedAt: new Date().toISOString() };
      console.log(`  [merge] ${retailer} clothing: men=${groups[0].length} women=${groups[1].length} kids=${groups[2].length} -> ${merged.length} items`);
    }
  }
  await saveCache();

  /* Same sanity pass as the Ofertas refresh. The department cache stores
     raw scrapes and the page estimates weight at render time, so nothing
     is rewritten here — but an implausible weight must never reach the
     storefront unannounced, and this is where a human is watching. */
  /* TWO QUEUES, NOT ONE (2026-09-20). A flagged weight used to mean one
     thing — "this has no category row, write one". Beauty weights are
     flagged too, but for the opposite reason: they DO have a row, and the
     row is a conservative estimate waiting to be checked against a real
     parcel on a real scale. Printing them under "add a category row"
     would bury the genuine gaps under a list of things that are working
     as designed, so they get their own heading and their own count. */
  const outOfBand = [];
  const gaps = [];
  const beautyEstimates = [];
  /* LAYER 1 COVERAGE. The retailer's own published weight is the only
     figure in the whole pipeline that is a measurement; everything below
     it is an estimate we are choosing to stand behind. So every run
     reports how many items arrived carrying one, per store. If this
     reads 0% after a refresh, the allowlist above is not the remaining
     problem — the actor's scrape mode is. */
  const specCoverage = {};
  for (const [retailerKey, bucket] of Object.entries(out.retailers || {})) {
    for (const group of [bucket.departments || {}, bucket.brands || {}]) {
      for (const dept of Object.values(group)) {
        for (const item of dept.items || []) {
          const title = item.name || item.title || "";
          const cov = (specCoverage[retailerKey] ||= { total: 0, withSpec: 0 });
          cov.total += 1;
          if (specWeightKg({ ...item, weightEstimated: false })) cov.withSpec += 1;
          const w = estimateWeightDetail(title);
          const line = `${w.kg}kg  ${title.slice(0, 66)} — ${w.reason}`;
          if (w.reviewKind === "out-of-band") outOfBand.push(line);
          else if (w.reviewKind === "gap") gaps.push(line);
          else if (w.reviewKind === "calibration") beautyEstimates.push(line);
        }
      }
    }
  }

  console.log("\n  peso publicado por la tienda (capa 1 — un dato, no un estimado):");
  for (const [retailerKey, cov] of Object.entries(specCoverage)) {
    const pct = cov.total ? Math.round((cov.withSpec / cov.total) * 100) : 0;
    console.log(`    ${retailerKey.padEnd(12)} ${String(cov.withSpec).padStart(4)}/${String(cov.total).padEnd(4)}  ${pct}%`);
  }
  if (Object.values(specCoverage).every((c) => c.withSpec === 0)) {
    console.log("    NINGUNA tienda devolvió un peso publicado. Revisa el scrapeMode del actor");
    console.log("    en netlify/functions/apify-scrape-start.js — el listado suele omitir el peso");
    console.log("    que sí trae la ficha del producto. La lista KEEP_FIELDS ya los conserva.");
  }
  /* Loudest first: an out-of-band weight is not quotable at all — the
     storefront refuses to price those items until a human fixes them. */
  if (outOfBand.length) {
    console.log(`\n  ${outOfBand.length} item(s) OUT OF BAND — not quotable until fixed:`);
    for (const line of [...new Set(outOfBand)]) console.log(`    ${line}`);
  }
  if (gaps.length) {
    console.log(`\n  ${gaps.length} item(s) with no category row — add one (they quote on the generic estimate and stay out of Ofertas):`);
    for (const line of [...new Set(gaps)]) console.log(`    ${line}`);
  }
  if (!outOfBand.length && !gaps.length) {
    console.log("\n  weights: every item is inside its category band");
  }
  const beautyUnique = [...new Set(beautyEstimates)];
  if (beautyUnique.length) {
    console.log(`\n  ${beautyUnique.length} beauty item(s) on estimated weights — calibrate against the first real order:`);
    for (const line of beautyUnique.slice(0, 20)) console.log(`    ${line}`);
    if (beautyUnique.length > 20) console.log(`    … and ${beautyUnique.length - 20} more`);
  }

  console.log(`\nWrote ${OUT_FILE.pathname}`);
  console.log("\n  NEXT: run `node scripts/image-price-scan.js` — every item just written is");
  console.log("  marked imageReview:\"pending\" and its image stays hidden on the storefront");
  console.log("  until that scan clears it.\n");
  for (const [retailer, bucket] of Object.entries(cache.retailers)) {
    console.log(`  ${retailer}: ${Object.keys(bucket.departments).length} departments, ${Object.keys(bucket.brands).length} brands`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
