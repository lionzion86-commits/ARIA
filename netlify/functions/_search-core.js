/* ============================================================
   SEARCH, ON THE SERVER (2026-10-19, #409 fire order).

   "The phone asks a server a question; it never downloads the store."
   The first real customer searched "dolls" on an iPhone over Peruvian
   mobile data. search.html downloaded the whole catalogue index (33MB)
   to the phone before it could show anything, Safari reloaded the page
   about ten times, and the 396 cards it finally drew collapsed into
   lines and froze. She left.

   Now the index is loaded here, once per warm container, and each
   request gets one page of ranked cards:

     loadSearch()           the index + the site's engine + the pipeline
     searchPage(ctx, q, n)  page n (48 cards), the total, and what the
                            page should say (corrected spelling, a brand
                            we do not carry, "¿Quisiste decir?")

   Nothing about ranking is new. It is the same index.html engine
   (search-engine.js, generated) and the same Spanish pipeline
   (search-pipeline.js + assets/search/synonyms-es.json) the page ran,
   only no longer on the phone. The test suites call this module, so
   they test exactly what the endpoint answers.

   Files: shipped beside netlify/functions/search.js by netlify.toml
   included_files, found by probing (the bundled layout differs from the
   repo), like _price-index.js. No import.meta: Netlify's bundler
   compiles functions to CommonJS.
   ============================================================ */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";

export const PAGE_SIZE = 48;
/* How many ranked results a search keeps. The pipeline's own default
   is 500, which is why every big query used to report exactly 500. */
export const RESULT_LIMIT = 2000;
export const INDEX_FILE = "assets/search/catalog-index.json";
export const DICT_FILE = "assets/search/synonyms-es.json";
const ENGINE_FILES = ["search-engine.js", "search-pipeline.js"];

const CANDIDATES = [
  process.env.LAMBDA_TASK_ROOT,
  "/var/task",
  typeof __dirname === "string" ? resolve(__dirname, "..", "..") : null,
  typeof __dirname === "string" ? __dirname : null,
  process.cwd(),
].filter(Boolean);

export function readRepoFile(rel) {
  for (const dir of CANDIDATES) {
    const p = join(dir, rel);
    try { if (existsSync(p)) return readFileSync(p, "utf8"); } catch { /* try the next */ }
  }
  throw new Error(`${rel} no está junto a la función de búsqueda`);
}

/* ---------- price math: the same as every page's cards ---------- */
/* Tiered marginal margin (2026-10-02) and per-retailer Miami sales tax
   (2026-10-09): (raw + tieredMarginUsd(raw)) x taxRate. These were
   search.html's own; price-parity-tests.mjs pins them to the SPA. */
function tieredMarginUsd(rawUsd){
  var r = Number(rawUsd);
  if (!(r > 0)) return 0;
  return Math.min(r,500)*0.24
       + Math.min(Math.max(r-500,0),1500)*0.18
       + Math.min(Math.max(r-2000,0),3000)*0.12
       + Math.max(r-5000,0)*0.08;
}
var TAX_EXEMPT = {"walmart": 1};
function salesTaxRate(retailer){ return TAX_EXEMPT[String(retailer || "").toLowerCase()] ? 1 : 1.07; }
function finalUsd(raw, retailer){ return Math.round((Number(raw) + tieredMarginUsd(raw)) * salesTaxRate(retailer) * 100) / 100; }
export { tieredMarginUsd, salesTaxRate, finalUsd, TAX_EXEMPT };

/* ---------- the engine, in its own realm ---------- */
export function loadEngine(read = readRepoFile) {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ENGINE_FILES) vm.runInContext(read(f), sandbox, { filename: f });
  const S = sandbox.window.AriaSearch, P = sandbox.window.AriaSearchPage;
  if (!S || typeof S.rankCatalogMatches !== "function") throw new Error("search-engine.js no cargó");
  if (!P || typeof P.run !== "function") throw new Error("search-pipeline.js no cargó");
  return { S, P };
}

/* Index rows -> the product objects the engine ranks. */
export function productsFromIndex(index) {
  const at = {};
  index.fields.forEach((n, i) => { at[n] = i; });
  const rows = index.rows, out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    out[i] = {
      id: r[at.id], name: r[at.title], title: r[at.title], brand: r[at.brand] || "",
      price: r[at.price], originalPrice: r[at.originalPrice] || null,
      onSale: r[at.onSale] === 1, departments: r[at.department] ? [r[at.department]] : [],
      finalPrice: r[at.finalPrice] === 1, image: r[at.image], url: "",
      retailer: r[at.retailer] || "", _cat: r[at.cat] || null,
    };
  }
  return out;
}

/* Everything a search needs, built once. `index` and `dict` may be
   passed in (tests); otherwise they are read from beside the function. */
export function buildSearchContext({ index, dict, read = readRepoFile, labels = {} } = {}) {
  const { S, P } = loadEngine(read);
  index = index || JSON.parse(read(INDEX_FILE));
  dict = dict || JSON.parse(read(DICT_FILE));
  const products = productsFromIndex(index);
  S.buildSearchWordIndex(products);
  const stores = [...new Set(products.map((p) => p.retailer).filter(Boolean))];
  return {
    S, P, products, labels,
    retailers: stores.map((k) => ({ key: k, label: k })),
    dict: P.prepare(dict, S, products),
    resultLimit: RESULT_LIMIT,
    generatedAt: index.generatedAt || null,
    cache: new Map(),
  };
}

let shared = null;
/** The warm container's context; built on the first request. */
export function loadSearch(opts) {
  if (!shared) shared = buildSearchContext(opts);
  return shared;
}

/* Spelling kept for the cache key only: case, spaces. */
const cacheKey = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").trim();
const CACHE_MAX = 200;

/** The whole ranked answer for one query (cached per container). */
export function runQuery(ctx, q) {
  const key = cacheKey(q);
  const hit = ctx.cache.get(key);
  if (hit) { ctx.cache.delete(key); ctx.cache.set(key, hit); return hit; }
  let r;
  try {
    r = ctx.P.run({ S: ctx.S, products: ctx.products, retailers: ctx.retailers, dict: ctx.dict, resultLimit: ctx.resultLimit }, q);
  } catch (e) {
    r = { state: "error", hits: [], error: String(e && e.message || e) };
  }
  ctx.cache.set(key, r);
  if (ctx.cache.size > CACHE_MAX) ctx.cache.delete(ctx.cache.keys().next().value);
  return r;
}

/* One card's worth of a product -- what the page draws, nothing more. */
export function cardOf(p, fx, labels = {}) {
  const usd = p.finalPrice ? Number(p.price) : finalUsd(p.price, p.retailer);
  const was = Number(p.originalPrice) > Number(p.price)
    ? (p.finalPrice ? Number(p.originalPrice) : finalUsd(p.originalPrice, p.retailer)) : null;
  return {
    id: p.id,
    title: p.title,
    brand: p.brand || "",
    store: p.retailer || "",
    storeLabel: labels[p.retailer] || p.retailer || "",
    usd,
    pen: fx ? Math.round(usd * fx * 100) / 100 : null,
    wasUsd: was,
    image: p.image,
    category: p._cat || "",
  };
}

/**
 * Page `page` (1-based) of the answer to `q`.
 * state: "results" | "none" | "short" | "empty" | "error"
 */
export function searchPage(ctx, q, page = 1, { fx = null, pageSize = PAGE_SIZE } = {}) {
  const query = String(q == null ? "" : q).trim().slice(0, 120);
  const r = runQuery(ctx, query);
  const total = r.hits.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const n = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  const slice = r.hits.slice((n - 1) * pageSize, n * pageSize);
  return {
    q: query,
    state: r.state,
    page: n,
    pageSize,
    pages,
    total,
    /* The ranker stopped at RESULT_LIMIT: "más de 2000", not "2000". */
    capped: total >= ctx.resultLimit,
    shown: r.shown || null,
    missingBrand: r.missingBrand || null,
    sense: r.sense || null,
    suggestion: r.suggestion || null,
    fx: fx || null,
    items: slice.map((p) => cardOf(p, fx, ctx.labels)),
  };
}
