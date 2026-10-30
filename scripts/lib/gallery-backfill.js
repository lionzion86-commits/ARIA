/* ============================================================
   GALLERY BACKFILL -- THE PLAN, THE COST AND THE MERGE (#443, comms
   #443 "Zumiez pass", FIX 2).

   Pure functions: no network, no files. scripts/backfill-gallery.mjs
   is the command that uses them; scripts/test/gallery-backfill-tests.mjs
   pins them.

   THE JOB. A catalogue whose pull kept one photo per product (Zumiez:
   2,494 products, every one on a single photo) gets the rest of each
   product's gallery from its own product page, WITHOUT a new catalogue
   pull: the existing records' product URLs go to a product-page scraper,
   and only the photos come back into the records. Price, was-price,
   sizes, title, brand, URL, description, weight -- every other field --
   stay exactly as they are (mergeGalleries refuses to touch them).

   THE ACTOR (an assumption, stated): apify/e-commerce-scraping-tool,
   the actor verified for DSW on branch claude/dsw-nm-pull-quality
   (#443, 2026-10-22, listing mode: { listingUrls: [{url}],
   maxProductResults }). For PRODUCT pages this repo has no verified
   input field. DEFAULT_INPUT_KEY ("detailsUrls") is the actor's
   product-URL field as far as known here, UNVERIFIED in this repo; the
   command takes --input-key to rename it without a code change, and
   --actor to use another actor. Confirm both against the actor's input
   schema on apify.com before the first paid run.

   THE PHOTOS (Danny's gallery policy, #468): every image the product
   page offers, read tolerantly from the row (images | imageUrls |
   gallery | additionalImages | media | photos | image | imageUrl |
   thumbnail | mainImage; strings or {url|src|contentUrl}); real http(s)
   photos only; one copy of each photo whatever its size (producto.html
   galleryPhotoKey, passed in as `photoKey`); size charts after every
   photo (galleryIsChart, passed in as `isChart`); the existing card
   photo stays first. Nothing is invented: a product whose page gives no
   new photo keeps the gallery it had.

   THE COST (the repo's own model, scripts/lib/dsw.js): per run
   APIFY_COST_PER_RUN_USD (default $0.06, scripts/lib/refresh-tiers.js)
   plus per result APIFY_COST_PER_1000_RESULTS_USD (default $5.70 per
   1,000, the one detail-mode actor price on record). THE WAVE CAP: at
   most WAVE_CAP_USD ($200, Danny's pre-approval for a wave, #443) less
   what the wave already spent (--spent-usd); an estimate above what is
   left is refused before any run, and each run is guarded again before
   it starts (capGuard), with Apify's own per-run limit
   (maxTotalChargeUsd) set to what is left. These mirror the cap on
   claude/dsw-nm-pull-quality (scripts/lib/dsw.js WAVE_CAP_USD /
   capGuard) but do not import it: that branch is not on main.
   ============================================================ */

export const WAVE_CAP_USD = 200;
export const DEFAULT_COST_PER_RUN_USD = 0.06;
export const DEFAULT_COST_PER_1000_RESULTS_USD = 5.7;
export const MATERIAL_OVERRUN = 0.25;
export const URLS_PER_RUN = 500;
export const GALLERY_CAP = 40;
export const DEFAULT_ACTOR = "apify/e-commerce-scraping-tool";
export const DEFAULT_INPUT_KEY = "detailsUrls";

const cents = (x) => Math.round(x * 100) / 100;
function num(raw, fallback) {
  const n = Number(raw);
  return raw !== "" && raw != null && Number.isFinite(n) && n >= 0 ? n : fallback;
}
export function costRatesFromEnv(env = {}) {
  return {
    costPerRun: num(env.APIFY_COST_PER_RUN_USD, DEFAULT_COST_PER_RUN_USD),
    costPer1000: num(env.APIFY_COST_PER_1000_RESULTS_USD, DEFAULT_COST_PER_1000_RESULTS_USD),
  };
}

/* ---------------- the records ---------------- */

/** Every record of a catalogue envelope (retailers.<key>.departments / brands). */
export function* recordsOf(catalog, retailerKey = null) {
  for (const [rk, r] of Object.entries((catalog && catalog.retailers) || {})) {
    if (retailerKey && rk !== retailerKey) continue;
    for (const section of ["departments", "brands"]) {
      for (const bucket of Object.values((r && r[section]) || {})) {
        const arr = Array.isArray(bucket) ? bucket : (bucket && Array.isArray(bucket.items) ? bucket.items : []);
        for (const rec of arr) if (rec && typeof rec === "object") yield rec;
      }
    }
  }
}

/** A title as a match key: entities decoded, case, accents and spacing folded. */
export function titleMatchKey(t) {
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(t || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m))
    .trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

/** The page's URL, as a match key: no query, no hash, no trailing slash, lower case. */
export function bareUrl(u) {
  return String(u || "").trim().split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
}

function urlOf(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry.trim();
  if (typeof entry === "object") return String(entry.url || entry.src || entry.contentUrl || entry.href || "").trim();
  return "";
}

/** The real, distinct photos of a list, card photo first, charts last. */
export function tidyPhotos(list, { photoKey, isChart, cap = GALLERY_CAP }) {
  const photos = [], charts = [], seen = new Set();
  list.forEach((entry) => {
    let u = urlOf(entry);
    if (u.startsWith("//")) u = "https:" + u;
    const m = u.match(/^https?:\/\/([^\/?#\s]+)([^?#\s]*)/i);
    if (!m || /\.svg$|placeholder|no[-_]?image|spacer\.gif/i.test(m[2])) return;
    const k = photoKey(u);
    if (!k || seen.has(k)) return;
    seen.add(k);
    (photos.length && isChart(u) ? charts : photos).push(u);
  });
  return photos.concat(charts).slice(0, cap);
}

/** The records' product pages, one per URL, with how many photos each has now. */
export function backfillTargets(catalog, { retailerKey = null, photoKey, isChart, onlySingle = true } = {}) {
  const byUrl = new Map();
  let records = 0, noUrl = 0;
  for (const rec of recordsOf(catalog, retailerKey)) {
    records++;
    const url = String(rec.url || rec.link || "").trim();
    if (!/^https:\/\//i.test(url)) { noUrl++; continue; }
    const have = tidyPhotos([rec.thumbnail || rec.image].concat(Array.isArray(rec.images) ? rec.images : []), { photoKey, isChart }).length;
    const k = bareUrl(url);
    const prev = byUrl.get(k);
    if (!prev || have > prev.have) byUrl.set(k, { url, have });
  }
  const all = [...byUrl.values()];
  const targets = onlySingle ? all.filter((t) => t.have < 2) : all;
  return { records, noUrl, urls: all.length, targets: targets.map((t) => t.url), alreadyMulti: all.length - all.filter((t) => t.have < 2).length };
}

/* ---------------- the estimate and the cap ---------------- */

export function planRuns(urls, perRun = URLS_PER_RUN) {
  const runs = [];
  for (let i = 0; i < urls.length; i += perRun) runs.push(urls.slice(i, i + perRun));
  return runs;
}

export function runCostUsd(urlCount, rates) {
  return cents(rates.costPerRun + (urlCount * rates.costPer1000) / 1000);
}

export function estimateBackfill(urlCount, rates, { perRun = URLS_PER_RUN, capUsd = WAVE_CAP_USD, spentUsd = 0, quoteUsd = null } = {}) {
  const runs = Math.ceil(urlCount / perRun);
  const estimateUsd = cents(runs * rates.costPerRun + (urlCount * rates.costPer1000) / 1000);
  const capRemainingUsd = cents(Math.max(0, capUsd - (Number(spentUsd) || 0)));
  const quote = Number(quoteUsd) > 0 ? cents(Number(quoteUsd)) : estimateUsd;
  return {
    urls: urlCount, runs, perRun, rates, estimateUsd, quoteUsd: quote, capUsd, spentUsd: cents(Number(spentUsd) || 0), capRemainingUsd,
    stopAboveUsd: cents(Math.min(quote * (1 + MATERIAL_OVERRUN), capRemainingUsd)),
    overCap: estimateUsd > capRemainingUsd,
  };
}

/** Before each run: would it (at the observed overrun) pass what is left of the cap? */
export function capGuard(spentThisWaveUsd, nextUrlCount, est, ratio = 1) {
  const nextUsd = cents(runCostUsd(nextUrlCount, est.rates) * Math.max(1, ratio));
  const left = cents(est.capRemainingUsd - spentThisWaveUsd);
  const ok = spentThisWaveUsd + nextUsd <= est.stopAboveUsd;
  return {
    ok, nextUsd, capLeftUsd: left, chargeLimitUsd: Math.max(0, left),
    reason: ok ? null : `TOPE DE GASTO: $${spentThisWaveUsd.toFixed(2)} gastado + ~$${nextUsd.toFixed(2)} de la siguiente corrida > $${est.stopAboveUsd.toFixed(2)} (tope $${est.capUsd.toFixed(2)}, cotización +${Math.round(MATERIAL_OVERRUN * 100)}%). No se inicia la corrida.`,
  };
}

export function formatEstimate(est, { store, actor, inputKey }) {
  const L = [];
  L.push("", "  ====================================================");
  L.push(`  ESTIMATED COST -- ${store} gallery backfill (Apify usage only)`);
  L.push("  ====================================================");
  L.push(`  actor: ${actor}   input: { ${inputKey}: [{url}], maxProductResults }   (UNVERIFIED product-URL field: confirm on apify.com)`);
  L.push(`  product pages: ${est.urls.toLocaleString("en-US")} in ${est.runs} run(s) of up to ${est.perRun}`);
  L.push(`  rates: $${est.rates.costPerRun.toFixed(2)} per run (APIFY_COST_PER_RUN_USD), $${est.rates.costPer1000.toFixed(2)} per 1,000 results (APIFY_COST_PER_1000_RESULTS_USD)`);
  L.push(`  ESTIMATED COST: ~$${est.estimateUsd.toFixed(2)}`);
  L.push(`  wave cap: $${est.capUsd.toFixed(2)}, already spent $${est.spentUsd.toFixed(2)}, left $${est.capRemainingUsd.toFixed(2)}`);
  L.push(`  the backfill stops if it projects above $${est.stopAboveUsd.toFixed(2)} (min of quote +${Math.round(MATERIAL_OVERRUN * 100)}% and the cap left)`);
  if (est.overCap) L.push("  REFUSED: the estimate is above what is left of the wave cap.");
  L.push("  ====================================================");
  return L.join("\n");
}

/** The actor input for one run. */
export function actorInput(urls, inputKey = DEFAULT_INPUT_KEY) {
  return { [inputKey]: urls.map((url) => ({ url })), maxProductResults: urls.length };
}

/* ---------------- the merge ---------------- */

const ROW_URL_KEYS = ["url", "canonicalUrl", "productUrl", "pageUrl", "loadedUrl", "requestUrl", "sourceUrl"];
const ROW_IMAGE_KEYS = ["images", "imageUrls", "gallery", "additionalImages", "imageGallery", "media", "photos", "image", "imageUrl", "thumbnail", "mainImage"];

export function rowUrl(row) {
  for (const k of ROW_URL_KEYS) if (row && typeof row[k] === "string" && /^https?:\/\//i.test(row[k])) return row[k];
  return "";
}
export function rowImages(row) {
  const pool = [];
  for (const k of ROW_IMAGE_KEYS) {
    const v = row && row[k];
    if (Array.isArray(v)) pool.push(...v);
    else if (v) pool.push(v);
  }
  return pool;
}

/**
 * Merge scraped galleries into the catalogue IN PLACE. Only `images`
 * changes (plus `imagesBackfill`, the provenance stamp); a record whose
 * page gave no new photo is left exactly as it was.
 * Returns { matchedRows, unmatchedRows, updated, photosAdded, before, after }.
 */
export function mergeGalleries(catalog, rows, { retailerKey = null, photoKey, isChart, stamp, cap = GALLERY_CAP }) {
  /* A row finds its record by the product URL; a row without one (the
     2026-10-30 re-pull: Victoria's Secret, BoxLunch, AE, most baby
     stores) by its exact title -- and only when that title names ONE
     record of the store, so a gallery is never lent to a lookalike. */
  const byUrlRecs = new Map(), byTitle = new Map();
  for (const rec of recordsOf(catalog, retailerKey)) {
    if (rec.url) { const k = bareUrl(rec.url); if (!byUrlRecs.has(k)) byUrlRecs.set(k, []); byUrlRecs.get(k).push(rec); }
    const t = titleMatchKey(rec.name || rec.title);
    if (t) { if (!byTitle.has(t)) byTitle.set(t, []); byTitle.get(t).push(rec); }
  }
  const scrapedOf = new Map();
  let unmatchedRows = 0;
  for (const row of rows || []) {
    let recs = byUrlRecs.get(bareUrl(rowUrl(row)));
    if (!recs || !rowUrl(row)) {
      const hit = byTitle.get(titleMatchKey(row && (row.title || row.name)));
      /* One product: one record, or the same product listed under its
         department and its brand (same title, same card photo). */
      const one = hit && new Set(hit.map((r) => bareUrl(r.url) + "|" + String(r.thumbnail || r.image || ""))).size === 1;
      recs = one ? hit : null;
    }
    if (!recs) { unmatchedRows++; continue; }
    for (const rec of recs) { if (!scrapedOf.has(rec)) scrapedOf.set(rec, []); scrapedOf.get(rec).push(...rowImages(row)); }
  }
  const byUrl = scrapedOf;
  let updated = 0, photosAdded = 0;
  const before = { single: 0, multi: 0 }, after = { single: 0, multi: 0 };
  for (const rec of recordsOf(catalog, retailerKey)) {
    const card = rec.thumbnail || rec.image || "";
    const had = tidyPhotos([card].concat(Array.isArray(rec.images) ? rec.images : []), { photoKey, isChart, cap });
    (had.length > 1 ? before.multi++ : before.single++);
    const scraped = scrapedOf.get(rec);
    let now = had;
    if (scraped && scraped.length) {
      now = tidyPhotos(had.concat(scraped), { photoKey, isChart, cap });
      if (now.length > had.length) {
        const frozen = JSON.stringify({ ...rec, images: undefined, imagesBackfill: undefined, image: undefined, photoHeld: undefined, photoRestored: undefined });
        rec.images = now;
        if (stamp) rec.imagesBackfill = stamp;
        /* A product held for a dead photo (photoHeld, its constructed URL in
           heldImage) that the store's own page now gives real photos:
           the first becomes its card photo and the hold lifts. */
        if (rec.photoHeld && !rec.image && now.length) {
          rec.image = now[0];
          rec.photoRestored = (stamp || "re-pull") + " (was held: " + rec.photoHeld + ")";
          delete rec.photoHeld;
        }
        if (JSON.stringify({ ...rec, images: undefined, imagesBackfill: undefined, image: undefined, photoHeld: undefined, photoRestored: undefined }) !== frozen) throw new Error("the merge touched a field other than the photos");
        updated++;
        photosAdded += now.length - had.length;
      } else now = had;
    }
    (now.length > 1 ? after.multi++ : after.single++);
  }
  return { matchedRows: (rows || []).length - unmatchedRows, unmatchedRows, matchedUrls: byUrl.size, updated, photosAdded, before, after };
}

/* ---------------- writing the file back in its own style ---------------- */

/** Python json.dumps(ensure_ascii=False) style: ", " and ": " separators, one line. */
export function pyDumps(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(pyDumps).join(", ") + "]";
  return "{" + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => JSON.stringify(k) + ": " + pyDumps(x)).join(", ") + "}";
}
/** The serializer that reproduces `text` from its own parse, or null. */
export function serializerFor(text) {
  const parsed = JSON.parse(text);
  const trail = /\n$/.test(text) ? "\n" : "";
  const styles = [pyDumps, (o) => JSON.stringify(o), (o) => JSON.stringify(o, null, 2), (o) => JSON.stringify(o, null, 1)];
  for (const f of styles) if (f(parsed) + trail === text) return (o) => f(o) + trail;
  return null;
}
