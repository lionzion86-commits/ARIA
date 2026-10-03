/* ============================================================
   THE CATALOGUE, ASSEMBLED THE WAY THE SITE ASSEMBLES IT.

   Same files, same order of operations, same functions: the catalogue
   JSONs and the split department-cache parts are read, the restricted
   departments are dropped, unshippable items are dropped, quarantined
   images are dropped, and every survivor is priced by index.html's own
   normalizeLiveItem. Nothing here decides what a product costs; it only
   decides which files to open.

   ONE ITEM MUST NEVER COST THE CATALOGUE. A malformed record is skipped
   — but skipping is COUNTED and the counts are returned, because the
   first version of this swallowed its failures and reported an empty
   catalogue as though 140,000 products simply were not shippable. If
   more than a floor's worth of items fail to price, the build refuses
   rather than shipping a quietly half-empty connector.
   ============================================================ */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadPageEngine } from "./page-slices.mjs";
import { repoFile } from "./paths.mjs";

/* The site's own list, read out of index.html so a catalogue added to
   the site reaches the connector without anyone remembering to add it
   here twice. */
export function catalogueFilesFromPage() {
  const html = readFileSync(repoFile("index.html"), "utf8");
  const m = /const CATALOGUE_FILES = \[([^\]]*)\]/.exec(html);
  if (!m) throw new Error("CATALOGUE_FILES moved in index.html — scripts/lib/mcp/catalog.mjs cannot find the catalogue list");
  const files = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].replace(/^\//, ""));
  const parts = /const DEPT_CACHE_PARTS = \[([^\]]*)\]/.exec(html);
  const deptParts = parts ? [...parts[1].matchAll(/'([^']+)'/g)].map((x) => x[1].replace(/^\//, "")) : [];
  /* department-cache.json is the unsplit fallback the page keeps for the
     four scraped retailers; the split parts carry the same stock. Prefer
     the parts when they exist so a retailer is not counted twice. */
  const chosen = deptParts.length ? deptParts : ["department-cache.json"];
  return [...new Set([...chosen, ...files])];
}

/** A stable public id for a product. */
export function productIdFor(retailer, title) {
  return createHash("sha1").update(`${retailer}::${title}`).digest("base64url").slice(0, 16);
}

/* A product that fails to price is a bug, not a data fact. Below this
   share of successfully priced items the build stops. */
const MIN_PRICED_SHARE = 0.9;

/**
 * Build the in-memory product pool.
 * @param {{engine?:object, files?:string[], onProgress?:Function}} [opts]
 */
export function buildCatalog(opts = {}) {
  const engine = opts.engine || loadPageEngine();
  const { search, ship, pricing } = engine;
  const files = opts.files || catalogueFilesFromPage();

  const items = [];
  const byId = new Map();
  const stats = { files: 0, missing: [], scanned: 0, restricted: 0, unshippable: 0, quarantined: 0, threw: 0, unpriced: 0, duplicate: 0, kept: 0 };
  const errors = new Map();

  for (const rel of files) {
    const path = repoFile(rel);
    if (!existsSync(path)) { stats.missing.push(rel); continue; }
    let env;
    try { env = JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { stats.missing.push(`${rel} (unparseable: ${e.message})`); continue; }
    stats.files++;

    for (const [retailer, bucket] of Object.entries(env?.retailers || {})) {
      for (const [department, entry] of Object.entries(bucket?.departments || {})) {
        if (ship.RESTRICTED_DEPARTMENTS.has(String(department).toLowerCase())) { stats.restricted++; continue; }
        const raws = Array.isArray(entry) ? entry : (entry?.items || []);
        for (const raw of raws) {
          stats.scanned++;
          if (!raw || typeof raw !== "object") { stats.threw++; continue; }
          /* aliasEnvelopeTitles, inline: some feeds carry `name`. */
          const title = raw.title || raw.name || raw.productName || raw.productTitle;
          if (!title) { stats.unpriced++; continue; }
          if (!ship.notQuarantined(raw)) { stats.quarantined++; continue; }
          if (!ship.isShippableItem(raw)) { stats.unshippable++; continue; }

          let n;
          try { n = pricing.normalizeLiveItem({ ...raw, title }, { retailer, department }); }
          catch (e) { stats.threw++; errors.set(e.message, (errors.get(e.message) || 0) + 1); continue; }
          if (!n || !n.title) { stats.unpriced++; continue; }
          /* A null price is the absurdity quarantine doing its job — the
             site shows "Precio no disponible" rather than a fat-finger.
             An agent has no such state, so the product is simply absent. */
          if (!(n.price > 0)) { stats.unpriced++; continue; }

          const id = productIdFor(retailer, n.title);
          const had = byId.get(id);
          if (had) {
            if (!had.departments.includes(department)) had.departments.push(department);
            stats.duplicate++;
            continue;
          }
          const item = {
            id,
            title: n.title,
            brand: n.brand || null,
            retailer,
            departments: [department],
            price: n.price,
            dutiableUsd: n.dutiableUsd,
            originalPrice: n.originalPrice || null,
            onSale: !!n.onSale,
            weightKg: n.weightKg,
            weightEstimated: n.weightEstimated !== false,
            image: n.image || null,
            images: Array.isArray(n.images) ? n.images : [],
            description: n.description || null,
            sizes: Array.isArray(n.sizes) ? n.sizes : [],
          };
          /* The three fields the page precomputes at ingest so ranking
             never re-tokenises: same names, same functions. */
          item._wordSet = search.catalogWordsOf(item);
          item._brandWordSet = new Set(search.searchTokens(item.brand || ""));
          item._cat = search.catalogItemCategory(item);
          byId.set(id, item);
          items.push(item);
          stats.kept++;
        }
      }
    }
  }

  /* The inverted index rankCatalogMatches looks for on the pool. */
  const windex = new Map();
  for (const it of items) {
    for (const w of it._wordSet) {
      let list = windex.get(w);
      if (!list) windex.set(w, list = []);
      list.push(it);
    }
  }
  items._windex = windex;

  const considered = stats.kept + stats.threw + stats.unpriced;
  const share = considered ? stats.kept / considered : 0;
  if (considered > 0 && share < MIN_PRICED_SHARE) {
    const top = [...errors].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([m, c]) => `${c}x ${m}`).join("; ");
    throw new Error(
      `only ${(share * 100).toFixed(1)}% of catalogue items priced (${stats.kept} of ${considered}) — ` +
      `refusing to serve a half-empty catalogue. Top failures: ${top || "none recorded"}`,
    );
  }

  return { items, byId, windex, stats, errors, engine };
}
