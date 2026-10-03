/* ============================================================
   THE TWO PUBLIC READ TOOLS.

   Phase 1: search and detail. No cart, no checkout, no money movement —
   those are later phases and deliberately absent, not stubbed, so there
   is nothing here for an agent to discover and call early.

   VALIDATION IS HAND-WRITTEN AND THAT IS DELIBERATE. The brief says
   "zod or equivalent". This repo ships with one runtime dependency
   (@netlify/blobs) and no build step, and the schemas here are six
   fields wide. A validator in thirty lines keeps that true and, more
   usefully, lets every rejection say what the agent should have sent —
   an agent debugs from the error string, so "limit must be a whole
   number from 1 to 50 (got 500)" is worth more than a zod union dump.
   ============================================================ */
import { freightForWeight, pricePen, discountPct } from "./pricing.mjs";

/* ---------- validation ---------- */

export class InvalidInput extends Error {
  constructor(message) { super(message); this.name = "InvalidInput"; }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function str(args, key, { required = false, max = 200 } = {}) {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new InvalidInput(`"${key}" is required and must be a non-empty string`);
    return null;
  }
  if (typeof v !== "string") throw new InvalidInput(`"${key}" must be a string (got ${typeof v})`);
  const t = v.trim();
  if (!t) {
    if (required) throw new InvalidInput(`"${key}" is required and must be a non-empty string`);
    return null;
  }
  if (t.length > max) throw new InvalidInput(`"${key}" must be ${max} characters or fewer (got ${t.length})`);
  return t;
}

function num(args, key, { min, max } = {}) {
  const v = args[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new InvalidInput(`"${key}" must be a number (got ${JSON.stringify(v)})`);
  }
  if (min !== undefined && v < min) throw new InvalidInput(`"${key}" must be at least ${min} (got ${v})`);
  if (max !== undefined && v > max) throw new InvalidInput(`"${key}" must be at most ${max} (got ${v})`);
  return v;
}

function int(args, key, { min, max, fallback = null } = {}) {
  const v = args[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new InvalidInput(
      `"${key}" must be a whole number${min !== undefined && max !== undefined ? ` from ${min} to ${max}` : ""} (got ${JSON.stringify(v)})`,
    );
  }
  if ((min !== undefined && v < min) || (max !== undefined && v > max)) {
    throw new InvalidInput(`"${key}" must be a whole number from ${min} to ${max} (got ${v})`);
  }
  return v;
}

function bool(args, key) {
  const v = args[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "boolean") throw new InvalidInput(`"${key}" must be true or false (got ${JSON.stringify(v)})`);
  return v;
}

function rejectUnknown(args, allowed, tool) {
  const extra = Object.keys(args).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new InvalidInput(
      `${tool} received unknown argument${extra.length > 1 ? "s" : ""} ${extra.map((e) => `"${e}"`).join(", ")}. ` +
      `Accepted: ${allowed.join(", ")}.`,
    );
  }
}

/* ---------- tool schemas (what tools/list advertises) ---------- */

export const TOOL_DEFINITIONS = [
  {
    name: "search_products",
    description:
      "Search Aria's catalog of US-store products available for delivery to Peru. " +
      "Returns products with USD and PEN prices, discount info, and images.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the shopper is looking for. Spanish or English; misspellings are tolerated." },
        category: { type: "string", description: "Narrow to a department, e.g. \"clothing\", \"shoes\", \"beauty\"." },
        brand: { type: "string", description: "Narrow to a brand, e.g. \"Nike\"." },
        store: { type: "string", description: "Narrow to one US store, e.g. \"walmart\", \"macys\"." },
        max_price_usd: { type: "number", description: "Only products at or below this USD price." },
        on_sale_only: { type: "boolean", description: "Only products currently discounted." },
        limit: { type: "integer", description: "How many products to return (1-50, default 20).", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_product",
    description:
      "Get full details for one Aria product: description, all images, sizes, weight, " +
      "freight estimate to Peru, and import-tax handling.",
    inputSchema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "The id returned by search_products." },
      },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
];

/* ---------- shaping ---------- */

function searchResult(item, fx) {
  return {
    id: item.id,
    title: item.title,
    brand: item.brand,
    store: item.retailer,
    price_usd: item.price,
    price_pen: pricePen(item.price, fx),
    original_price_usd: item.originalPrice || undefined,
    discount_pct: discountPct(item.price, item.originalPrice) || undefined,
    image_url: item.image || undefined,
  };
}

/* ---------- search_products ---------- */

const SEARCH_ARGS = ["query", "category", "brand", "store", "max_price_usd", "on_sale_only", "limit"];

export function searchProducts(args, ctx) {
  if (!isObj(args)) throw new InvalidInput("arguments must be an object");
  rejectUnknown(args, SEARCH_ARGS, "search_products");

  const query = str(args, "query", { required: true });
  const category = str(args, "category");
  const brand = str(args, "brand");
  const store = str(args, "store");
  const maxPrice = num(args, "max_price_usd", { min: 0 });
  const onSaleOnly = bool(args, "on_sale_only");
  const limit = int(args, "limit", { min: 1, max: 50, fallback: 20 });

  const { catalog, fx } = ctx;
  const { search } = catalog.engine;

  /* THE SITE'S OWN RANKER, over the site's own pool.

     RANK WIDE, THEN FILTER. The filters below run after ranking, so the
     ranked list has to be long enough to survive them. An earlier
     version took the top 240 and filtered that, which measured badly:
     `{query:"shoes", store:"walmart"}` saw 6 of the 43 Walmart shoes in
     the catalogue and answered a limit-20 request with 6 products.

     Ranking is nearly free in the width — the cost is scoring the
     candidate set, not carrying the result list — so a narrowed search
     takes the WHOLE match set and cuts afterwards. Measured on this
     catalogue for "shoes": limit 240 -> 54ms, the full 5,991 -> 59ms.

     The whole set, not merely a bigger slice: the 43 Walmart shoes rank
     between positions 5,000 and 5,991, so even a 5,000 over-fetch still
     found only 6 of them. Anything short of "all of it" is a number
     that happens to work on the query someone tested. */
  const narrowed = !!(store || brand || category || maxPrice !== null || onSaleOnly);
  const ranked = search.rankCatalogMatches(catalog.items, query, {
    limit: narrowed ? catalog.items.length : Math.max(limit * 3, 60),
  });
  let items = Array.isArray(ranked) ? ranked : (ranked.items || []);

  if (store) {
    const want = store.toLowerCase().replace(/[^a-z0-9]+/g, "");
    items = items.filter((i) => String(i.retailer).toLowerCase().replace(/[^a-z0-9]+/g, "") === want);
  }
  if (brand) {
    const want = brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
    items = items.filter((i) => String(i.brand || "").toLowerCase().replace(/[^a-z0-9]+/g, "") === want);
  }
  if (category) {
    const want = category.toLowerCase().trim();
    items = items.filter((i) =>
      (i.departments || []).some((d) => String(d).toLowerCase() === want) ||
      String(i._cat || "").toLowerCase() === want);
  }
  if (maxPrice !== null) items = items.filter((i) => i.price <= maxPrice);
  /* "On sale" means a real markdown: the site refuses to badge a
     discount it cannot show an original price for, and so does this. */
  if (onSaleOnly) items = items.filter((i) => i.originalPrice && i.originalPrice > i.price);

  const out = items.slice(0, limit).map((i) => searchResult(i, fx));
  return {
    query,
    count: out.length,
    products: out,
    /* Said plainly rather than left for the agent to infer from a short
       list — Muse will otherwise tell a shopper we have nothing. */
    note: out.length === 0
      ? "No products matched. Try fewer filters or a broader query."
      : undefined,
  };
}

/* ---------- get_product ---------- */

export function getProduct(args, ctx) {
  if (!isObj(args)) throw new InvalidInput("arguments must be an object");
  rejectUnknown(args, ["product_id"], "get_product");
  const id = str(args, "product_id", { required: true, max: 64 });

  const item = ctx.catalog.byId.get(id);
  if (!item) {
    const err = new Error(`No product with id "${id}". Ids come from search_products and change when the catalog is rebuilt.`);
    err.name = "NotFound";
    throw err;
  }
  const { fx } = ctx;
  const freight = freightForWeight(item.weightKg, ctx.catalog.engine);

  return {
    id: item.id,
    title: item.title,
    brand: item.brand,
    store: item.retailer,
    price_usd: item.price,
    price_pen: pricePen(item.price, fx),
    original_price_usd: item.originalPrice || undefined,
    discount_pct: discountPct(item.price, item.originalPrice) || undefined,
    images: item.images && item.images.length ? item.images : (item.image ? [item.image] : []),
    description: item.description || null,
    sizes: item.sizes || [],
    weight_kg: item.weightKg ?? null,
    weight_is_estimated: item.weightEstimated !== false,
    freight_estimate_usd: freight,
    /* THE NUMBER PERU'S CUSTOMS ASSESSES, which is the acquisition cost
       (US shelf price plus whatever Miami sales tax Aria actually pays),
       never the marked-up shelf price the shopper sees. Surfaced so an
       agent quoting landed cost quotes the same base checkout does. */
    dutiable_usd: item.dutiableUsd ?? null,
  };
}

/* ---------- dispatch ---------- */

export const TOOLS = {
  search_products: searchProducts,
  get_product: getProduct,
};
