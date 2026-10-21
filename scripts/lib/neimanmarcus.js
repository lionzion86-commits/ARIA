/* ============================================================
   NEIMAN MARCUS — THE PULL PLAN, THE COST ESTIMATE AND THE INGEST
   RULES. Modeled on scripts/lib/dsw.js, and reusing every DSW rule that
   is not DSW-specific: the cost model (estimatePull, spendCheck, the
   +25% stop), the per-row USD assertion, the sanity band, shippable-
   only, real weights through the checkout's own reader, checksum-valid
   GTINs, galleries, sizes AS SCRAPED and the PDP's own first sentences.

   Pure functions only: no network, no files. scripts/build-neimanmarcus-
   catalog.mjs is the command; scripts/test/neimanmarcus-pull-tests.mjs
   pins these rules offline.

   WHAT DANNY ORDERED, AND WHERE EACH POINT LIVES
     full shippable assortment, freight out    dsw.shippingVerdict() +
                                               the site's isShippableItem
     best sellers + ALL sale/clearance first   pullPlan() (phase 1 first)
     real weights / dims where published       dsw.weightOf/dimensionsOf
     GTIN captured when present                dsw.gtinOf (checksum-valid);
                                               the report counts it
     full multi-photo galleries                dsw.imagesOf (cap 12 here)
     size runs exactly as scraped              dsw.sizesOf; feed variants
                                               grouped in feed order
     Spanish 1-2 sentences, faithful to PDP    dsw.pdpSentences, then
                                               translate-catalog-
                                               descriptions.mjs
     seller == Neiman Marcus itself            sellerVerdict()
     currency USD asserted at capture          dsw.currencyOf via ingestRow
     projected cost BEFORE running             estimatePull() (DSW's)

   ACCESS NOTE (read before any spend). The repo's own recon
   (scripts/luxury-feed/README.md, 2026-09-28) found neimanmarcus.com
   behind DataDome bot protection, and records the standing decision that
   we do not defeat bot protection; the legitimate channel it names is
   Neiman Marcus's affiliate product feed (Sovrn Commerce / AWIN). So this
   builder ingests that feed with --src (no Apify spend), and its Apify
   path is generic: it starts whatever actor NM_ACTOR_ID names and nothing
   else. No actor is verified or proposed for neimanmarcus.com here.

   NOTHING HERE INVENTS A PRODUCT FACT. Every field comes from the row.
   ============================================================ */
import {
  ingestRow as dswIngestRow, breadcrumbOf, imagesOf, moneyOf, validGtin,
  estimatePull, spendCheck, quotaCostUsd, costRatesFromEnv, dswActorInput, MATERIAL_OVERRUN,
  DEFAULT_COST_PER_1000_RESULTS_USD,
} from "./dsw.js";

export { estimatePull, spendCheck, quotaCostUsd, costRatesFromEnv, MATERIAL_OVERRUN, DEFAULT_COST_PER_1000_RESULTS_USD };

export const NM_KEY = "neimanmarcus";
export const NM_LABEL = "Neiman Marcus";
export const OUT_FILE = "neimanmarcus-catalog.json";

/* Ceiling for a `target: "all"` quota (sale, clearance). "ALL sale" is
   the order; this only keeps a runaway listing from becoming a runaway
   bill. Raise with --sale-max when the posted quote allows. */
export const NM_SALE_MAX = 3000;

/* THE SANITY BAND. Neiman Marcus is a luxury shelf, so DSW's $5-$400
   would quarantine most of it. Outside this band a row is held for a
   person (quarantine), never published, never silently dropped.
   Override per run with --min-usd / --max-usd. An assumption, stated. */
export const PRICE_BAND_USD = { min: 10, max: 5000 };

/* The gallery cap: luxury PDPs carry more angles than DSW's. */
export const GALLERY_CAP = 12;

/* THE PLAN — and the ASSUMPTIONS the estimate is built on. These
   targets are ASSUMED counts per department (one actor run per quota,
   one category listing URL per quota), not counts read from
   neimanmarcus.com, which this build environment cannot reach. The real
   listing URL for each quota is passed with --urls (a JSON map
   {category: url}) by someone who has copied it from a browser;
   without it the run falls back to the keyword. */
export const NM_QUOTAS = [
  { category: "sale",          phase: 1, saleOnly: true, query: "neiman marcus sale",            target: "all" },
  { category: "clearance",     phase: 1, saleOnly: true, query: "neiman marcus clearance",       target: "all" },
  { category: "bestsellers",   phase: 1,                 query: "neiman marcus best sellers",    target: 300 },
  { category: "women_apparel", phase: 2, query: "womens clothing",         target: 600, gender: "women" },
  { category: "men_apparel",   phase: 2, query: "mens clothing",           target: 400, gender: "men" },
  { category: "women_shoes",   phase: 2, query: "womens shoes",            target: 400, gender: "women" },
  { category: "men_shoes",     phase: 2, query: "mens shoes",              target: 250, gender: "men" },
  { category: "handbags",      phase: 2, query: "handbags",                target: 300, bucket: "purses" },
  { category: "accessories",   phase: 2, query: "jewelry accessories",     target: 300 },
  { category: "beauty",        phase: 2, query: "beauty fragrance",        target: 500, bucket: "beauty" },
  { category: "kids",          phase: 2, query: "kids clothing",           target: 200, gender: "kids" },
  { category: "home_small",    phase: 2, query: "home decor tabletop",     target: 200, bucket: "home_decor" },
];

export function pullPlan({ saleMax = NM_SALE_MAX, urls = null } = {}) {
  return NM_QUOTAS
    .map((q, i) => ({
      ...q,
      maxItems: q.target === "all" ? saleMax : Number(q.target) || 0,
      url: urls && typeof urls[q.category] === "string" ? urls[q.category] : null,
      order: i,
    }))
    .sort((a, b) => (a.phase - b.phase) || (a.order - b.order));
}

/* The actor input: DSW's (startUrls of {url} or a keyword list), the
   one place to change once a chosen actor's schema is known. */
export const nmActorInput = dswActorInput;

export function formatEstimate(est) {
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push("  ESTIMATED COST — Neiman Marcus catalogue pull (Apify usage only)");
  out.push("  ====================================================");
  for (const l of est.lines) {
    out.push(`    phase ${l.phase}  ${l.category.padEnd(14)} up to ${String(l.maxItems).padStart(5)} items  ~$${l.usd.toFixed(2)}`);
  }
  out.push(`  runs: ${est.runs}   items requested (max): ${est.items.toLocaleString("en-US")}`);
  out.push(`  rates: $${est.rates.costPerRun.toFixed(2)} per run (APIFY_COST_PER_RUN_USD), $${est.rates.costPer1000.toFixed(2)} per 1,000 results (APIFY_COST_PER_1000_RESULTS_USD)`);
  out.push("  inputs: the per-department item counts above are ASSUMPTIONS (NM_QUOTAS in scripts/lib/neimanmarcus.js),");
  out.push("          one listing URL (one actor run) per department; the per-result rate is the repo's one recorded");
  out.push("          detail-mode price, not a Neiman Marcus actor's price (none is chosen). A proxy-heavy actor costs more.");
  out.push(`  ESTIMATED COST: ~$${est.estimateUsd.toFixed(2)}`);
  out.push(`  quote: $${est.quoteUsd.toFixed(2)}   the pull stops if it projects above $${est.stopAboveUsd.toFixed(2)} (+${Math.round(MATERIAL_OVERRUN * 100)}%)`);
  out.push("  ====================================================");
  return out.join("\n");
}

/* ---------------- seller ---------------- */
const first = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
};

/** The seller the row states, or null when it states none. */
export function sellerOf(raw) {
  const o = raw && raw.offers ? (Array.isArray(raw.offers) ? raw.offers[0] : raw.offers) : null;
  const s = first(raw.seller, raw.sellerName, raw.soldBy, raw.merchant, raw.merchantName, raw.retailerName,
    o && o.seller && typeof o.seller === "object" ? o.seller.name : o && o.seller);
  if (s == null) return null;
  return String(typeof s === "object" ? first(s.name, s.title) || "" : s).replace(/\s+/g, " ").trim() || null;
}

/**
 * SELLER == NEIMAN MARCUS. A row that names another seller (a
 * marketplace or partner listing) is held for a person, never published.
 * A row that names none came from Neiman Marcus's own listing or its own
 * affiliate feed, and the item records that the seller came from the
 * source, not the row.
 */
export function sellerVerdict(raw) {
  const s = sellerOf(raw);
  if (s == null) return { ok: true, source: "source" };
  if (/neiman\s*marcus/i.test(s)) return { ok: true, source: "row" };
  return { ok: false, seller: s };
}

/* ---------------- bucket ---------------- */
const BAG_RX = /\b(handbags?|bags?|purses?|totes?|crossbody|backpacks?|wallets?|clutch(es)?|satchels?|hobo)\b/i;
const BEAUTY_RX = /\b(beauty|fragrances?|perfume|eau de (parfum|toilette)|cologne|makeup|lipstick|mascara|foundation|skin\s*care|skincare|serum|moisturi[sz]er|cleanser)\b/i;
const JEWELRY_RX = /\b(jewelry|jewellery|necklaces?|bracelets?|earrings?|rings?|pendants?|watches)\b/i;
const HOME_RX = /\b(home|tabletop|candles?|frames?|vases?|decor|throws?|pillows?|barware|serveware)\b/i;
const KIDS_RX = /\b(kids?|girls?|boys?|toddlers?|baby|infants?|youth)\b/i;

/**
 * The site's existing bucket names only (scripts/lib/department-map.js):
 * women / men / kids / purses / beauty / jewelry / home_decor / footwear
 * / clothing. No new taxonomy.
 */
export function bucketOf(raw, quota, crumbs = breadcrumbOf(raw)) {
  if (quota && quota.bucket) return quota.bucket;
  const crumbText = crumbs.join(" ");
  const name = String(raw.name || raw.title || "");
  const hay = [crumbText, name, raw.gender || "", raw.productType || ""].join(" ");
  if (BEAUTY_RX.test(crumbText) || (BEAUTY_RX.test(name) && !/\b(shoes?|dress|shirt)\b/i.test(name))) return "beauty";
  if (BAG_RX.test(crumbText) || (BAG_RX.test(name) && !/\bshoes?\b/i.test(hay))) return "purses";
  if (JEWELRY_RX.test(crumbText) || JEWELRY_RX.test(name)) return "jewelry";
  if (/\bhome\b/i.test(crumbText) || (quota && quota.category === "home_small" && HOME_RX.test(hay))) return "home_decor";
  if (KIDS_RX.test(hay)) return "kids";
  if (/\b(women'?s?|womens|ladies)\b/i.test(hay)) return "women";
  if (/\b(men'?s?|mens)\b/i.test(hay)) return "men";
  if (quota && quota.gender) return quota.gender;
  return /\b(shoes?|sneakers?|boots?|sandals?|pumps?|loafers?|heels?)\b/i.test(hay) ? "footwear" : "clothing";
}

export const BUCKET_LABELS = {
  women: "Moda mujer",
  men: "Moda hombre",
  kids: "Niños",
  purses: "Carteras y bolsos",
  beauty: "Belleza",
  jewelry: "Joyería y accesorios",
  home_decor: "Hogar",
  footwear: "Zapatos",
  clothing: "Ropa",
};

/* ---------------- ingest ---------------- */

/**
 * One scraped row in, one verdict out — DSW's rules (USD per row, the
 * band, shippable-only, image required, real weight, GTIN, sizes as
 * scraped, PDP sentences), plus the seller check and Neiman Marcus's own
 * key, bucket and gallery cap.
 */
export function ingestRow(raw, quota, ctx = {}) {
  if (!raw || typeof raw !== "object") return { drop: "not-an-object" };
  const sv = sellerVerdict(raw);
  if (!sv.ok) return { quarantine: "seller-not-neiman-marcus", row: raw };
  const v = dswIngestRow(raw, quota, { ...ctx, band: ctx.band || PRICE_BAND_USD });
  if (!v.item) return v;
  const item = v.item;
  item.retailer = NM_KEY;
  item.seller = NM_LABEL;
  item.sellerSource = sv.source;
  const gallery = imagesOf(raw, GALLERY_CAP);
  if (gallery.length) { item.images = gallery; item.image = gallery[0]; }
  if (item.description) item.descriptionSource = "neimanmarcus-pdp";
  /* GTIN per size, when the row's variants carry them (a feed publishes
     one GTIN per size, not one per product). Checksum-valid only. */
  if (Array.isArray(raw.variants)) {
    const vg = {};
    for (const x of raw.variants) {
      const code = x && String(first(x.gtin, x.upc, x.ean) || "").replace(/\s|-/g, "");
      const size = x && first(x.size, x.sizeLabel, x.name);
      if (size != null && validGtin(code)) vg[String(size).replace(/\s+/g, " ").trim()] = code;
    }
    if (Object.keys(vg).length) item.variantGtins = vg;
  }
  return { item, id: v.id, bucket: bucketOf(raw, quota) };
}

/**
 * The whole pull in, the catalogue envelope out — the same envelope and
 * row shape scripts/lib/dsw.js's ingestPull writes, under
 * retailers.neimanmarcus. A product seen twice keeps its first
 * (sale/clearance) copy; its place in the best-sellers listing becomes
 * bestSellerRank.
 */
export function ingestPull(pulled, ctx = {}) {
  const departments = {};
  const seen = new Map();
  const quarantined = [];
  const stats = { rows: 0, published: 0, quarantined: {}, dropped: {}, perBucket: {}, onSale: 0, realWeight: 0, dimensions: 0, gtin: 0, withSizes: 0, gallery: 0, described: 0, currencyAssumed: 0, sellerFromRow: 0 };
  for (const { quota, items } of pulled) {
    (items || []).forEach((raw, idx) => {
      stats.rows++;
      const v = ingestRow(raw, quota, ctx);
      if (v.quarantine) {
        stats.quarantined[v.quarantine] = (stats.quarantined[v.quarantine] || 0) + 1;
        quarantined.push({ reason: v.quarantine, quota: quota.category, row: v.row });
        return;
      }
      if (v.drop) { stats.dropped[v.drop] = (stats.dropped[v.drop] || 0) + 1; return; }
      const key = v.id || (v.item.brand || "") + "::" + v.item.name;
      if (seen.has(key)) {
        const prev = seen.get(key);
        if (quota.category === "bestsellers" && !prev.bestSellerRank) prev.bestSellerRank = idx + 1;
        stats.dropped.duplicate = (stats.dropped.duplicate || 0) + 1;
        return;
      }
      if (quota.category === "bestsellers") v.item.bestSellerRank = idx + 1;
      seen.set(key, v.item);
      (departments[v.bucket] = departments[v.bucket] || { label: BUCKET_LABELS[v.bucket] || v.bucket, items: [] }).items.push(v.item);
    });
  }
  for (const [b, d] of Object.entries(departments)) {
    stats.perBucket[b] = d.items.length;
    for (const it of d.items) {
      stats.published++;
      if (it.onSale) stats.onSale++;
      if (it.weightEstimated === false) stats.realWeight++;
      if (it.dimensions) stats.dimensions++;
      if (it.gtin || it.variantGtins) stats.gtin++;
      if (it.availableSizes.length) stats.withSizes++;
      if (it.images.length > 1) stats.gallery++;
      if (it.description) stats.described++;
      if (it.currencyAssumed) stats.currencyAssumed++;
      if (it.sellerSource === "row") stats.sellerFromRow++;
    }
  }
  return {
    catalog: {
      generatedAt: ctx.generatedAt || new Date().toISOString(),
      source: ctx.source || "neimanmarcus.com -- ingested by scripts/build-neimanmarcus-catalog.mjs",
      declaredProductCount: stats.published,
      retailers: { [NM_KEY]: { label: NM_LABEL, departments } },
    },
    quarantined,
    stats,
  };
}

export function emptyCatalog() {
  return {
    generatedAt: null,
    source: "neimanmarcus.com -- catalogue pull pending; scripts/build-neimanmarcus-catalog.mjs writes this file",
    declaredProductCount: 0,
    retailers: { [NM_KEY]: { label: NM_LABEL, departments: {} } },
  };
}

export function productCount(catalog) {
  const r = catalog && catalog.retailers && catalog.retailers[NM_KEY];
  if (!r || !r.departments) return 0;
  return Object.values(r.departments).reduce((n, d) => n + ((d && Array.isArray(d.items)) ? d.items.length : 0), 0);
}

/* ---------------- the affiliate feed (--src <feed.csv|.tsv|.txt>) ----------------
   Neiman Marcus's affiliate product export (Sovrn / AWIN) is a Google-
   Shopping-style table: one row PER VARIANT (size), grouped by
   item_group_id. feedToRows() turns it into the raw-row shape ingestRow
   reads, without inventing anything: sizes are the group's own variant
   sizes in feed order (in-stock ones flagged so sizesOf keeps those),
   the gallery is image_link + additional_image_link, weight and
   dimensions are the feed's own shipping_weight / product_* columns
   when present. Column names are the Google-Shopping set; the
   scripts/luxury-feed/mappings/*.json files say verify the header row
   against the real export. */

/** RFC-4180-ish delimited parse: quotes, doubled quotes, CRLF. */
export function parseDelimited(text, delimiter) {
  const src = String(text || "").replace(/^﻿/, "");
  const d = delimiter || (src.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const CURRENCY_TAIL = /\b([A-Z]{3})\s*$/;
const inStockFeed = (s) => !/out\s*of\s*stock|sold\s*out|discontinued|preorder|backorder/i.test(String(s || ""));

/**
 * Feed records -> raw rows (one per product group). The price column
 * carries its ISO code ("495.00 USD") in the Google-Shopping format; that
 * code is the row's stated currency. A feed whose prices carry no code
 * leaves currency unstated, and the row is quarantined unless the
 * operator passes --assume-usd.
 */
export function feedToRows(records) {
  const groups = new Map();
  for (const r of records) {
    const gid = first(r.item_group_id, r.parent_id, r.id, r.aw_product_id);
    if (!gid) continue;
    (groups.has(gid) ? groups.get(gid) : groups.set(gid, []).get(gid)).push(r);
  }
  const out = [];
  for (const [gid, vs] of groups) {
    const r = vs[0];
    const priceCol = first(r.price, r.search_price);
    const saleCol = first(r.sale_price);
    const cur = first(r.currency, (CURRENCY_TAIL.exec(String(priceCol || "")) || [])[1]);
    const sale = moneyOf(saleCol);
    const reg = moneyOf(priceCol);
    const images = [r.image_link, r.merchant_image_url, ...String(r.additional_image_link || "").split(/[,|]\s*/)].filter(Boolean);
    const sized = vs.filter((v) => v.size);
    const specs = [];
    if (r.shipping_weight) specs.push({ name: "Shipping Weight", value: r.shipping_weight });
    if (r.product_weight) specs.push({ name: "Product Weight", value: r.product_weight });
    const dims = [r.product_length, r.product_width, r.product_height].filter(Boolean);
    if (dims.length === 3) specs.push({ name: "Product Dimensions", value: dims.join(" x ") });
    if (r.material) specs.push({ name: "Material", value: r.material });
    const anyInStock = vs.some((v) => inStockFeed(first(v.availability, v.in_stock)));
    const row = {
      productId: String(gid),
      name: first(r.title, r.product_name),
      brand: first(r.brand, r.brand_name),
      description: r.description || null,
      url: first(r.link, r.aw_deep_link) || null,
      images,
      ...(sale && reg && sale < reg ? { price: sale, originalPrice: reg } : { price: reg || sale }),
      ...(cur ? { currency: cur } : {}),
      /* One GTIN per product only when the group is one variant; a sized
         group carries its GTINs per size (variantGtins after ingest). */
      ...(vs.length === 1 && first(r.gtin, r.upc, r.ean) ? { gtin: first(r.gtin, r.upc, r.ean) } : {}),
      color: first(r.color, r.colour),
      breadcrumbs: first(r.product_type, r.merchant_category, r.google_product_category),
      ...(first(r.seller, r.merchant_name) ? { seller: first(r.seller, r.merchant_name) } : {}),
      ...(specs.length ? { specifications: specs } : {}),
      ...(sized.length ? { variants: sized.map((v) => ({ size: v.size, inStock: inStockFeed(first(v.availability, v.in_stock)), ...(first(v.gtin, v.upc, v.ean) ? { gtin: first(v.gtin, v.upc, v.ean) } : {}) })) } : {}),
      ...(anyInStock ? {} : { inStock: false }),
    };
    out.push(row);
  }
  return out;
}
