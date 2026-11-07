/* ============================================================
   THE MUSE CONNECTOR'S TWO TOOLS (#443 c.6578981079, PHASE 1).

   Two public reads for Meta's Muse agent: search_products and
   get_product. No cart, no checkout, no money, no auth -- those are
   later phases and are absent, not stubbed.

   NOTHING HERE IS A SECOND COPY OF THE SITE.
     search     _search-core.js: the index, engine, Spanish pipeline,
                spelling forms and synonyms behind the search bar
                (equivalentQuery), and the cards' own price (finalUsd).
                "hudi" finds hoodies because the search bar's does.
     product    the shard producto.html reads (assets/pdp/p/<hhh>.json,
                scripts/build-pdp-slices.mjs) -- off disk where the files
                are (tests, mcp-server.js), else from the site's own CDN
                exactly as the page fetches it.
     weight     resolveCartWeights() (_weight-resolve.js): the resolver
                the product page asks (resolve-weight) and checkout uses.
     freight    freightFloorUsd() x CHARGE_PER_KG ($13/kg, weight-data.js).
     tax        importTaxEstimateUsd() on the dutiable base, the page's
                own tax line (weight-data.js).
     shipping   shippingOf() (_search-core.js / store-shipping.js): the
                store's own shipping to Miami.
     PEN        the venta rate search.js uses (SUNAT, then the last good
                rate kept in Netlify Blobs) -- never guessed: no rate,
                price_pen is null.
     gates      /off-sale.js (stores Aria no longer sells, held-used
                listings) and /shade-gate.js (makeup sold in shades whose
                shade list has not reached us: shown on the site, never
                sold). search_products LEAVES GATED PRODUCTS OUT;
                get_product answers them with buyable:false and why.
     sold out   /vuelve-pronto.js (#443 c.6585537098, Danny's Q3): a
                product the store lists as sold out STAYS LISTED in
                search_products, marked availability:"vuelve_pronto" and
                buyable:false; get_product says the same, with the reason
                «Vuelve pronto». Sizes-pending products stay listed too.

   NEVER SERVED: the retailer's URL (no link ever leaves Aria) and a
   wholesale cost. For a pre-priced store (weight-data.js PRE_PRICED,
   Aria Perfumes) the catalogue price already IS Aria's price and the
   dutiable base is the supplier cost, so dutiable_usd is null there.
   ============================================================ */
import "../../sale-rule.js";
import { equivalentQuery, didYouMean, finalUsd, salesTaxRate, readRepoFile, shippingOf } from "./_search-core.js";
import { cartLineFor } from "./_door-price.js";
import { resolveCartWeights } from "./_weight-resolve.js";
import { freightFloorUsd } from "./_checkout-model.js";
import { CHARGE_PER_KG, PRE_PRICED, importTaxEstimateUsd, dutiableBaseUsd, TAX_ESTIMATE_THRESHOLD_USD } from "../../weight-data.js";
import { isOffSaleItem, isOffSaleRetailer } from "../../scripts/lib/off-sale.js";
import { kindOf as shadeKindOf } from "../../scripts/lib/shade-gate.js";
import { isVuelvePronto } from "../../scripts/lib/vuelve-pronto.js";
import { titleKey, unpack } from "../../scripts/lib/photo-counts.js";
import { InvalidParams, ToolError } from "./_mcp-protocol.js";

const Sale = globalThis.AriaSale;
const r2 = (n) => Math.round(Number(n) * 100) / 100;
export const SITE = "https://ariashop.pe";
/* The site's word for sold out at the store (/vuelve-pronto.js). */
export const VUELVE_PRONTO = "vuelve_pronto";
export const VUELVE_PRONTO_REASON = "Vuelve pronto: the store has this sold out right now. It stays listed; the shopper can ask on its product page to be told when it is back (Avísame cuando vuelva).";

/* ---------- tool definitions (what tools/list advertises) ---------- */

export const SEARCH_DESCRIPTION =
  "Search Aria's catalog of US-store products available for delivery to Peru. Returns products with USD and PEN prices, discount info, and images.";
export const GET_DESCRIPTION =
  "Get full details for one Aria product: description, all images, sizes, weight, freight estimate to Peru, and import-tax handling.";

const nullable = (type) => ({ type: [type, "null"] });

export const SEARCH_DEFINITION = {
  name: "search_products",
  title: "Search Aria's catalog",
  description: SEARCH_DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 120, description: "What the shopper wants, in Spanish or English. Accents and misspellings are tolerated (\"hudi\" finds hoodies)." },
      category: { type: "string", maxLength: 60, description: "Narrow to a kind of product, in Spanish or English (\"zapatillas\", \"shoes\", \"belleza\", \"jewelry\")." },
      brand: { type: "string", maxLength: 80, description: "Narrow to one brand, e.g. \"Nike\"." },
      store: { type: "string", maxLength: 60, description: "Narrow to one US store, by key or name, e.g. \"walmart\", \"Foot Locker\"." },
      max_price_usd: { type: "number", exclusiveMinimum: 0, description: "Only products whose Aria price (price_usd) is at or below this." },
      on_sale_only: { type: "boolean", description: "Only products with a real markdown (5-70% off, the site's sale rule)." },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20, description: "How many products to return (1-50, default 20)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      count: { type: "integer" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, title: { type: "string" }, brand: { type: "string" },
            store: { type: "string" }, store_name: { type: "string" },
            price_usd: { type: "number" }, price_pen: nullable("number"),
            original_price_usd: { type: "number" }, discount_pct: { type: "integer" },
            image_url: { type: "string" }, product_url: { type: "string" },
            availability: { type: "string", enum: ["vuelve_pronto"], description: "Present when the store has this product sold out right now (Vuelve pronto): still listed, not buyable until it is back." },
            buyable: { type: "boolean", description: "Present (false) only with availability." },
          },
          required: ["id", "title", "brand", "store", "price_usd", "price_pen", "image_url"],
        },
      },
      exchange_rate_pen_per_usd: nullable("number"),
      did_you_mean: { type: "string" },
      note: { type: "string" },
    },
    required: ["query", "count", "products", "exchange_rate_pen_per_usd"],
  },
  annotations: { title: "Search Aria's catalog", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

export const GET_DEFINITION = {
  name: "get_product",
  title: "Get one Aria product",
  description: GET_DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      product_id: { type: "string", minLength: 1, maxLength: 32, description: "A product id returned by search_products." },
    },
    required: ["product_id"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      id: { type: "string" }, title: { type: "string" }, brand: { type: "string" },
      store: { type: "string" }, store_name: { type: "string" },
      price_usd: { type: "number" }, price_pen: nullable("number"),
      original_price_usd: { type: "number" }, discount_pct: { type: "integer" },
      images: { type: "array", items: { type: "string" } },
      description: nullable("string"),
      sizes: { type: "array", items: { type: "string" } },
      weight_kg: nullable("number"),
      freight_estimate_usd: nullable("number"),
      dutiable_usd: nullable("number"),
      import_tax_estimate_usd: nullable("number"),
      import_tax: { type: "string" },
      buyable: { type: "boolean" },
      availability: { type: "string", enum: ["vuelve_pronto"] },
      not_buyable_reason: { type: "string" },
      product_url: { type: "string" },
    },
    required: ["id", "title", "brand", "store", "price_usd", "price_pen", "images", "description", "sizes",
      "weight_kg", "freight_estimate_usd", "dutiable_usd", "buyable"],
  },
  annotations: { title: "Get one Aria product", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

/* ---------- validation (hand-written: zod is not a dependency) ---------- */

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function onlyKeys(args, allowed) {
  if (!isObj(args)) throw new InvalidParams("arguments must be a JSON object.");
  const extra = Object.keys(args).filter((k) => !allowed.includes(k));
  if (extra.length) throw new InvalidParams(`unknown argument${extra.length > 1 ? "s" : ""} ${extra.map((k) => `"${k}"`).join(", ")}. Accepted: ${allowed.join(", ")}.`, { unknown: extra });
}
function str(args, key, { required = false, max = 200 } = {}) {
  const v = args[key];
  if (v === undefined || v === null) {
    if (required) throw new InvalidParams(`"${key}" is required (a non-empty string).`, { field: key });
    return null;
  }
  if (typeof v !== "string") throw new InvalidParams(`"${key}" must be a string (got ${Array.isArray(v) ? "array" : typeof v}).`, { field: key });
  const t = v.trim();
  if (!t) {
    if (required) throw new InvalidParams(`"${key}" is required (a non-empty string).`, { field: key });
    return null;
  }
  if (t.length > max) throw new InvalidParams(`"${key}" must be at most ${max} characters (got ${t.length}).`, { field: key });
  return t;
}
function num(args, key) {
  const v = args[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new InvalidParams(`"${key}" must be a number (got ${JSON.stringify(v)}).`, { field: key });
  if (v <= 0) throw new InvalidParams(`"${key}" must be greater than 0 (got ${v}).`, { field: key });
  return v;
}
function int(args, key, { min, max, fallback }) {
  const v = args[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new InvalidParams(`"${key}" must be a whole number from ${min} to ${max} (got ${JSON.stringify(v)}).`, { field: key });
  }
  return v;
}
function bool(args, key) {
  const v = args[key];
  if (v === undefined || v === null) return false;
  if (typeof v !== "boolean") throw new InvalidParams(`"${key}" must be true or false (got ${JSON.stringify(v)}).`, { field: key });
  return v;
}

/* ---------- shared helpers ---------- */

/* Keys compared without case, accents or punctuation. */
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s) => fold(s).replace(/ /g, "");
const isHttpUrl = (u) => typeof u === "string" && /^https?:\/\/[^\s/?#]+/i.test(u.trim());

/* producto.html pdpHash/pdpShard (FNV-1a of the shard key, 4096 shards). */
const PDP_SHARDS = 4096;
export function pdpShard(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ("00" + ((h >>> 0) % PDP_SHARDS).toString(16)).slice(-3);
}
/* scripts/build-search-index.mjs productId(): a search row's id. A
   record carrying the same store, URL and title is that row's listing. */
export function productId(retailer, url, title) {
  const s = String(retailer || "").toLowerCase() + "|" + String(url || title || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let h2 = 0x9e3779b9;
  for (let i = s.length - 1; i >= 0; i--) { h2 ^= s.charCodeAt(i); h2 = Math.imul(h2, 0x85ebca6b) >>> 0; }
  return h.toString(36) + h2.toString(36).slice(0, 3);
}

/* The product page Aria serves for a product (never the store's). */
export function productUrl(title, store, v) {
  return `${SITE}/producto.html?producto=${encodeURIComponent(title || "")}&tienda=${encodeURIComponent(store || "")}${v ? "&v=" + encodeURIComponent(v) : ""}`;
}

/* The site's one sale rule (/sale-rule.js): 5-70% off a real original. */
function saleOf(rawPrice, rawOriginal) {
  const pct = Sale.discountPct({ price: Number(rawPrice), originalPrice: Number(rawOriginal) });
  return pct > 0 ? pct : 0;
}

/* The card price of a search row (cardOf's rule): a sale-feed row's
   price is already final. */
const usdOfRow = (p) => (p.finalPrice ? r2(p.price) : finalUsd(p.price, p.retailer));

/* producto.html shadeGateApplies(): sold in shades, and no shade on the
   record (no picker shade, no shade of its own). */
export function shadeGated(rec) {
  if (!rec || String(rec.c || "").trim()) return false;
  if (rec.sk === "makeup" || rec.sk === "hair") return true;
  return !!shadeKindOf({ name: rec.name, retailer: rec.retailer, dept: rec.dept });
}
/* Could this search row be a shade product? Only these are checked
   against their record: a store that files it as beauty, or a title
   that would be a shade noun in a beauty aisle. (Measured on the
   2026-11-02 catalogue: every one of the 901 gated records' rows
   passes this; 3.6% of rows do.) */
const BEAUTY_AISLE = /^(?:beauty|belleza|makeup|maquillaje|cosm[eé]ticos?|labios|ojos|rostro|u[nñ]as|cabello|hair ?colou?r|lips?|eyes?|face|nails?)$/i;
export function mayBeShadeGated(p) {
  if (p.retailer === "ulta" || p.retailer === "sephora") return true;
  const dept = (p.departments && p.departments[0]) || "";
  if (BEAUTY_AISLE.test(dept)) return true;
  return !!shadeKindOf({ name: p.title, retailer: p.retailer, dept, beauty: true });
}

/* producto.html truthfulSizes(): the store's list without its "one
   size" placeholders, repeats, or a lone capacity ("3.4 oz" is the
   product, not a size). The store's order is kept (the page also sorts
   a ladder it can place). */
const NO_SIZE = /^(?:no\s*size|one\s*size|o\/?s|n\/?s|n\/a|default(?:\s+title)?|talla\s+[uú]nica|[uú]nica)$/i;
const LONE_MEASURE = /^\d+(?:[.,]\d+)?\s*(?:fl\.?\s*oz|oz|ml|cl|l|g|gr|kg|mg|lb|lbs|ct|count)\.?$/i;
export function truthfulSizes(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const v of list) {
    let s = "";
    if (typeof v === "string") s = v;
    else if (typeof v === "number" && Number.isFinite(v)) s = String(v);
    else if (v && typeof v === "object" && v.available !== false && (typeof v.size === "string" || typeof v.size === "number")) s = String(v.size);
    s = s.trim();
    if (!s || NO_SIZE.test(s) || seen.has(s.toUpperCase())) continue;
    seen.add(s.toUpperCase());
    out.push(s);
  }
  return out.length === 1 && LONE_MEASURE.test(out[0]) ? [] : out;
}

/* The catalogue's Spanish description, cut to its first two sentences. */
export function shortDescription(text, maxChars = 400) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const sentences = t.match(/[^.!?]+(?:[.!?]+|$)/g) || [t];
  let out = sentences.slice(0, 2).join("").trim();
  if (out.length > maxChars) out = out.slice(0, maxChars).replace(/\s+\S*$/, "") + "…";
  return out;
}

/* ---------- the PDP shard reader ---------- */

/**
 * Shards as producto.html reads them: off disk where they are, else from
 * the site's CDN (`origin`). Each shard is cached per instance (LRU).
 */
export function createShardReader({ origin = SITE, fetchImpl = globalThis.fetch, read = readRepoFile, timeoutMs = 4000, max = 512 } = {}) {
  const cache = new Map();
  let localOk = null;
  async function fetchShard(s) {
    if (localOk !== false) {
      try { const d = JSON.parse(read(`assets/pdp/p/${s}.json`)); localOk = true; return d; }
      catch (e) { if (localOk === true) return {}; localOk = false; }
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${origin}/assets/pdp/p/${s}.json`, { headers: { Accept: "application/json" }, signal: ctl.signal });
      if (!res.ok) throw new Error(`shard ${s}: HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  return {
    /** Every record carrying this title (the shard key), or []. */
    async records(title) {
      const key = titleKey(title);
      const s = pdpShard(key);
      let p = cache.get(s);
      if (p) { cache.delete(s); cache.set(s, p); }
      else {
        p = fetchShard(s).catch((e) => { cache.delete(s); throw e; });
        cache.set(s, p);
        if (cache.size > max) cache.delete(cache.keys().next().value);
      }
      const d = await p;
      return (d && Array.isArray(d[key])) ? d[key] : [];
    },
  };
}

/**
 * The record producto.html shows for a search row: the same store's
 * record of that title -- the very listing (same URL, so the same id)
 * when one is, else the one at the row's price, else the store's first.
 */
export async function recordForRow(shards, p) {
  const cands = (await shards.records(p.title)).filter((r) => r && r.retailer === p.retailer);
  if (!cands.length) return null;
  return cands.find((r) => productId(r.retailer, r.url, r.name) === p.id)
    || cands.find((r) => Number(r.price) === Number(p.price))
    || cands[0];
}

/* ---------- search_products ---------- */

const SEARCH_ARGS = ["query", "category", "brand", "store", "max_price_usd", "on_sale_only", "limit"];
/* How far down the ranked list a filtered search looks, and how many
   possible shade products it checks against their records. */
const SCAN_CAP = 2000;
const GATE_BATCH = 24;

/** search_products' arguments, checked; throws InvalidParams. */
export function parseSearchArgs(args) {
  onlyKeys(args, SEARCH_ARGS);
  return {
    query: str(args, "query", { required: true, max: 120 }),
    category: str(args, "category", { max: 60 }),
    brand: str(args, "brand", { max: 80 }),
    store: str(args, "store", { max: 60 }),
    maxPrice: num(args, "max_price_usd"),
    onSaleOnly: bool(args, "on_sale_only"),
    limit: int(args, "limit", { min: 1, max: 50, fallback: 20 }),
  };
}

/**
 * @param {object} args
 * @param {{search:object, shards:object, fx:number|null, labels:object}} env
 */
export async function searchProducts(args, env) {
  const { query, category, brand, store, maxPrice, onSaleOnly, limit } = parseSearchArgs(args);

  const ctx = env.search;
  const labels = env.labels || {};
  const r = equivalentQuery(ctx, query);
  const hits = r.state === "results" ? r.hits : [];

  const wantStore = store ? squash(store) : null;
  const wantBrand = brand ? fold(brand) : null;
  const inCategory = category ? categoryTest(ctx, category) : null;
  const keep = (p) => {
    if (!isHttpUrl(p.image) || isOffSaleItem(p)) return false;
    if (wantStore && squash(p.retailer) !== wantStore && squash(labels[p.retailer] || "") !== wantStore) return false;
    if (wantBrand) { const b = fold(p.brand); if (b !== wantBrand && !b.startsWith(wantBrand + " ")) return false; }
    if (maxPrice !== null && !(usdOfRow(p) <= maxPrice)) return false;
    if (onSaleOnly && !saleOf(p.price, p.originalPrice)) return false;
    if (inCategory && !inCategory(p)) return false;
    return true;
  };

  const out = [];
  let excludedShade = 0;
  let i = 0;
  const scan = hits.slice(0, SCAN_CAP);
  /* Rank order, filtered; possible shade products are checked against
     their records a batch at a time, until the page is full. */
  while (out.length < limit && i < scan.length) {
    const batch = [];
    while (batch.length < GATE_BATCH && i < scan.length && out.length + batch.length < limit + 8) {
      const p = scan[i++];
      if (keep(p)) batch.push(p);
    }
    const gated = await Promise.all(batch.map(async (p) => {
      if (!mayBeShadeGated(p)) return false;
      /* Unknown is not buyable: a shard the CDN cannot give us now keeps
         a possible shade product out rather than offering it blind. */
      try { const rec = await recordForRow(env.shards, p); return rec ? shadeGated(rec) : shadeGated({ name: p.title, retailer: p.retailer, dept: p.departments[0] }); }
      catch { return true; }
    }));
    batch.forEach((p, k) => {
      if (gated[k]) { excludedShade++; return; }
      if (out.length < limit) out.push(p);
    });
  }

  const fx = env.fx > 0 ? env.fx : null;
  const products = out.map((p) => {
    const usd = usdOfRow(p);
    const pct = saleOf(p.price, p.originalPrice);
    return {
      id: p.id,
      title: p.title,
      brand: p.brand || "",
      store: p.retailer,
      store_name: labels[p.retailer] || p.retailer,
      price_usd: usd,
      price_pen: fx ? r2(usd * fx) : null,
      ...(pct ? { original_price_usd: p.finalPrice ? r2(p.originalPrice) : finalUsd(p.originalPrice, p.retailer), discount_pct: pct } : {}),
      image_url: p.image,
      product_url: productUrl(p.title, p.retailer),
      /* Sold out at the store: listed, never hidden (Danny's Q3). */
      ...(isVuelvePronto({ retailer: p.retailer, title: p.title }) ? { availability: VUELVE_PRONTO, buyable: false } : {}),
    };
  });

  const result = { query, count: products.length, products, exchange_rate_pen_per_usd: fx };
  const notes = [];
  if (!products.length) {
    if (store && isOffSaleRetailer(squash(store))) notes.push(`Aria no longer sells from "${store}". Search again without the store filter.`);
    else if (r.missingBrand) notes.push(`Aria does not carry the brand "${r.missingBrand}" yet.`);
    else notes.push("No products matched. Try a broader query or fewer filters.");
    if (typeof r.suggestion === "string" && r.suggestion) result.did_you_mean = r.suggestion;
  }
  if (products.length) { const dym = didYouMean(ctx, query, r); if (dym) result.did_you_mean = dym; }
  if (excludedShade) notes.push(`${excludedShade} makeup product(s) were left out: Aria does not have their shade list yet, so they cannot be bought.`);
  if (!fx) notes.push("price_pen is null: today's SUNAT venta rate could not be fetched. Use price_usd.");
  if (notes.length) result.note = notes.join(" ");
  return result;
}

/* A category, in the shopper's words: the index's own category or
   department when it names one, else whatever the site's search finds
   for that word (its Spanish/English dictionary). */
const CATEGORY_ALIASES = {
  zapatillas: "footwear", calzado: "footwear", zapatos: "footwear", shoes: "footwear", sneakers: "footwear",
  joyas: "jewelry", joyeria: "jewelry", futbol: "soccer",
  belleza: "beauty", maquillaje: "beauty", juguetes: "toys", electronica: "electronics",
};
function categoryTest(ctx, category) {
  const want = fold(category);
  const alias = CATEGORY_ALIASES[squash(category)] || null;
  const named = (p) => {
    const c = fold(p._cat || ""), d = fold((p.departments && p.departments[0]) || "");
    return (c && (c === want || c === alias)) || (d && (d === want || d === alias));
  };
  const r = equivalentQuery(ctx, category);
  const found = new Set(r.state === "results" ? r.hits : []);
  return (p) => named(p) || found.has(p);
}

/* ---------- get_product ---------- */

/** id -> search row, built once per search context. */
const BY_ID = new WeakMap();
function rowById(ctx, id) {
  let m = BY_ID.get(ctx);
  if (!m) { m = new Map(); for (const p of ctx.products) if (!m.has(p.id)) m.set(p.id, p); BY_ID.set(ctx, m); }
  return m.get(id) || null;
}

/* producto.html weightLineOf(): the line the resolver weighs. */
function weightLineOf(rec, priceUsd) {
  const line = { title: rec.name, retailer: rec.retailer, priceUsd, weightKg: 0.2, weightEstimated: true, qty: 1 };
  if (rec.weightKg > 0) { line.weightKg = rec.weightKg; line.weightEstimated = rec.weightPub !== true; }
  if (rec.weightBySize && typeof rec.weightBySize === "object") { line.kind = "surfboard"; line.sizeOptions = Object.keys(rec.weightBySize); }
  if (rec.specWeightKg > 0) line.specWeightKg = rec.specWeightKg;
  return line;
}
/* producto.html weightUnknown(): a weight the page says "Por confirmar" for. */
const weightUnknown = (it) => !it || !!it.needsReview || it.source === "department" || it.source === "fallback";

export function parseGetArgs(args) {
  onlyKeys(args, ["product_id"]);
  const id = str(args, "product_id", { required: true, max: 32 });
  if (!/^[a-z0-9]+$/.test(id)) throw new InvalidParams(`"product_id" must be an id from search_products (lowercase letters and digits; got ${JSON.stringify(id)}).`, { field: "product_id" });
  return id;
}

export async function getProduct(args, env) {
  const id = parseGetArgs(args);

  const ctx = env.search;
  const row = rowById(ctx, id);
  if (!row || isOffSaleItem(row)) {
    throw new ToolError(`No product with id "${id}" is for sale on Aria. Ids come from search_products and can change when the catalogue is refreshed; search again.`);
  }
  let rec = null;
  try { rec = await recordForRow(env.shards, row); }
  catch (e) {
    console.error(JSON.stringify({ svc: "mcp", event: "shard_error", id, error: String(e && e.message || e) }));
    throw new ToolError("This product's details could not be loaded just now. Try again in a moment.");
  }

  const retailer = row.retailer;
  const labels = env.labels || {};
  const fx = env.fx > 0 ? env.fx : null;
  const prePriced = !!PRE_PRICED[String(retailer).toLowerCase()];

  /* The page's numbers: the record when the page has one (a sale-feed
     deal may not), else the search row. */
  const rawPrice = rec ? Number(rec.price) : Number(row.price);
  const priceUsd = rec || !row.finalPrice ? finalUsd(rawPrice, retailer) : r2(row.price);
  let originalUsd = null, pct = 0;
  if (rec) {
    if (rec.salePct > 0 && rec.wasPrice > rec.price) { pct = Math.round(rec.salePct); originalUsd = finalUsd(rec.wasPrice, retailer); }
  } else {
    pct = saleOf(row.price, row.originalPrice);
    if (pct) originalUsd = row.finalPrice ? r2(row.originalPrice) : finalUsd(row.originalPrice, retailer);
  }

  /* The dutiable base (what Peru taxes): the store's price plus the
     Miami sales tax Aria pays there -- never the margin, and never a
     pre-priced store's supplier cost. */
  const dutiable = prePriced ? null
    : rec || !row.finalPrice ? r2(rawPrice * salesTaxRate(retailer))
    : (Number.isFinite(dutiableBaseUsd(priceUsd)) ? dutiableBaseUsd(priceUsd) : null);

  const recLike = rec || { name: row.title, retailer, price: rawPrice, dept: row.departments[0] || "" };
  const w = resolveCartWeights([weightLineOf(recLike, priceUsd)]);
  const it = w.items[0];
  const unknown = weightUnknown(it) || !(w.totalKg > 0);
  const kg = unknown ? null : w.totalKg;
  const freight = unknown ? null : freightFloorUsd(undefined, kg, CHARGE_PER_KG);
  /* The page's import-tax line: the dutiable value decides whether, the
     goods plus freight how much. A pre-priced store's base is not
     served, so neither is a figure it could be worked back from. */
  const fob = prePriced ? rawPrice / PRE_PRICED[String(retailer).toLowerCase()] : dutiable;
  let taxUsd = null;
  if (Number.isFinite(fob) && fob > 0) taxUsd = fob <= TAX_ESTIMATE_THRESHOLD_USD ? 0 : (kg && !prePriced ? importTaxEstimateUsd(fob, freight) : null);

  const ship = shippingOf(cartLineFor({ retailer, title: row.title, brand: row.brand, cardUsd: priceUsd,
    rawUsd: prePriced || (!rec && row.finalPrice) ? null : rawPrice, taxRate: salesTaxRate(retailer) }));

  const images = (rec ? unpack(rec.images, rec.image) : [row.image]).filter(isHttpUrl);
  if (!images.length && isHttpUrl(row.image)) images.push(row.image);
  if (!images.length) throw new ToolError(`Product "${id}" has no photo, so Aria does not offer it.`);

  /* Can it be bought on the site right now (the product page's gates)? */
  const sizes = rec ? truthfulSizes(rec.sizes) : [];
  let notBuyable = null;
  const soldOut = rec ? rec.so === 1 : isVuelvePronto({ retailer, title: row.title });
  if (soldOut) notBuyable = VUELVE_PRONTO_REASON;
  else if (shadeGated(rec || recLike)) notBuyable = "Shade list pending (Tonos en camino): Aria does not sell makeup without a chosen shade, and this product's shades have not reached Aria yet.";
  else if (rec && rec.sizesPending && !sizes.length) notBuyable = "Sizes are being confirmed with the store (Tallas por confirmar).";
  else if (!(priceUsd > 0)) notBuyable = "No confirmed price yet.";

  return {
    id: row.id,
    title: row.title,
    brand: (rec && rec.brand) || row.brand || "",
    store: retailer,
    store_name: labels[retailer] || retailer,
    price_usd: priceUsd,
    price_pen: fx ? r2(priceUsd * fx) : null,
    ...(pct && originalUsd ? { original_price_usd: originalUsd, discount_pct: pct } : {}),
    images,
    description: rec ? shortDescription(rec.description) : null,
    sizes,
    ...(rec && rec.c ? { variant: { label: rec.ax === "Tono" ? "Tono" : "Color", value: String(rec.c) } } : {}),
    weight_kg: kg,
    weight_basis: unknown ? "Weight to be confirmed before freight is charged." : (it.estimated === false ? "published by the store" : "estimated"),
    freight_estimate_usd: freight,
    freight_estimate_pen: fx && freight !== null ? r2(freight * fx) : null,
    freight_rate_usd_per_kg: CHARGE_PER_KG,
    dutiable_usd: dutiable,
    import_tax_estimate_usd: taxUsd,
    import_tax: prePriced
      /* #443 item 4: the limit is named to the shopper, never given as a
         figure or a rate -- say "el límite de importación". */
      ? "Import tax, if any, is estimated at checkout: none while the order's goods stay under Peru's import limit, an estimate on goods + freight once they pass it. Never tell the shopper the limit's dollar figure or a tax percentage: say the order is under / approaching / past «el límite de importación», and from approaching on suggest splitting into separate orders. If the real tax is lower, the difference is credited as saldo Aria; if higher, Aria absorbs it."
      : "Peru's import tax applies only when the order's dutiable value (dutiable_usd: the US store price plus Miami sales tax, before Aria's margin) passes the import limit; import_tax_estimate_usd is Aria's estimate for this item alone, charged at checkout. Never tell the shopper the limit's dollar figure or a tax percentage: say the order is under / approaching / past «el límite de importación», and from approaching on suggest splitting into separate orders. If the real tax is lower, the difference is credited as saldo Aria; if higher, Aria absorbs it.",
    store_shipping_usd: ship.state === "fee" || ship.state === "free" ? ship.usd : null,
    ...(ship.state === "calc" ? { store_shipping_note: "The store calculates its shipping to Aria's Miami warehouse at payment." } : {}),
    buyable: !notBuyable,
    ...(soldOut ? { availability: VUELVE_PRONTO } : {}),
    ...(notBuyable ? { not_buyable_reason: notBuyable } : {}),
    product_url: productUrl(row.title, retailer, rec && rec.v),
    exchange_rate_pen_per_usd: fx,
  };
}

/* ---------- the tool table the transport serves ---------- */

/**
 * @param {() => Promise<{search:object, shards:object, fx:number|null, labels:object}>} getEnv
 */
export function museTools(getEnv) {
  return [
    /* Arguments are checked before the catalogue is touched: a bad call
       costs nothing, even on a cold instance. */
    { definition: SEARCH_DEFINITION, run: async (args) => { parseSearchArgs(args); return searchProducts(args, await getEnv()); } },
    { definition: GET_DEFINITION, run: async (args) => { parseGetArgs(args); return getProduct(args, await getEnv()); } },
  ];
}
