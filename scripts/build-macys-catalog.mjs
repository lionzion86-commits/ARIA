// Builds macys-catalog.json from a raw Apify Macy's export.
//
//   node scripts/build-macys-catalog.mjs <raw-export.json>
//   node scripts/build-macys-catalog.mjs <raw-export.json> --dry-run
//
// WHY THIS IS A SCRIPT AND NOT A ONE-OFF PASTE
// The raw export is 2 MB of Macy's internal product shape and the served
// file is a few hundred KB of the six fields a card needs. Doing that by
// hand once means nobody can redo it when a fuller export arrives, and
// the first export WAS short (see TRUNCATION below). Run this again with
// the complete file and the storefront updates with no code change.
//
// ------------------------------------------------------------------
// TRUNCATION IS EXPECTED AND HANDLED
// The first export arrived at exactly 2,097,152 bytes — 2 MiB, to the
// byte — and ended mid-string inside a product. That is an upload size
// cap, not corrupt data: everything before the cut is valid.
//
// So this does not JSON.parse the whole file. It walks the products array
// one object at a time and keeps every COMPLETE one, stopping at the
// first that will not decode. A short file yields a smaller catalogue
// rather than an error, and the report says how many were recovered
// against the count the file itself declares.
// ------------------------------------------------------------------
//
// WHAT IS DELIBERATELY DROPPED
//   * products Macy's marks inactive or unavailable — we do not list
//     what cannot be bought
//   * every field a card does not render: colour swatches, UPC tables,
//     promo badge copy, size traits. The served file is what the browser
//     downloads, so it carries the minimum.
//
// PRICES STAY IN RAW USD. The 7% sales tax and the 24% Aria margin are
// applied by normalizeLiveItem() in index.html, the same as for every
// other retailer, so the Macy's cards and the Walmart cards cannot drift
// apart. Putting a marked-up number in this file would be the drift.
import fs from "node:fs";
import path from "node:path";
import { normalizeType, groupBySubcategory, unmappedTypes } from "./lib/subcategories.js";

const OUT = new URL("../macys-catalog.json", import.meta.url);

/* ------------------------------------------------------------------
   THE IMAGE BASE — THE ONE THING HERE THAT IS NOT VERIFIED

   The export gives Scene7 path fragments ("2/optimized/37875082_fpx.tif")
   and no host. Macy's serves those from its Scene7 instance, and this is
   the documented public base for it.

   IT COULD NOT BE CHECKED FROM THE BUILD ENVIRONMENT: that container's
   egress proxy refuses every host outside a small allowlist, so a HEAD
   request here proves nothing either way. Verify it once on the deploy
   preview — one product card with a visible photo is proof for all of
   them, because every URL is built by this one function.

   If it is wrong, fix these two lines and re-run. Nothing else changes,
   and the storefront degrades to its placeholder rather than to broken
   images in the meantime (see cardPhotoHTML's onerror).
   ------------------------------------------------------------------ */
const IMAGE_BASE = "https://slimages.macysassets.com/is/image/MCY/products/";
const IMAGE_PARAMS = "?wid=600&qlt=85&fmt=jpeg";

function imageUrl(filePath) {
  const p = String(filePath || "").replace(/^\/+/, "");
  if (!p) return null;
  return IMAGE_BASE + p + IMAGE_PARAMS;
}

/* Complete products only, out of a file that may stop mid-object. */
function recoverProducts(raw) {
  const marker = '"products": [';
  const at = raw.indexOf(marker);
  if (at < 0) throw new Error("no products array in the export");
  let pos = at + marker.length;
  const out = [];
  // JSON.parse cannot resume, so bracket-match one object at a time.
  while (pos < raw.length) {
    while (pos < raw.length && /[\s,]/.test(raw[pos])) pos += 1;
    if (raw[pos] !== "{") break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = pos; i < raw.length; i += 1) {
      const c = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth += 1;
      else if (c === "}") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) break;                       // truncated mid-object: stop
    try { out.push(JSON.parse(raw.slice(pos, end))); } catch { break; }
    pos = end;
  }
  return out;
}

/* ------------------------------------------------------------------
   THE PRICE, OUT OF A TIERED RANGE

   Macy's does not publish "the price". It publishes tiers:

     [PRICE]            the list price — and often SEVERAL, because one
                        product id covers sizes or colours that cost
                        different amounts
     Sale [PRICE]       \
     Now [PRICE]         >  the currently effective price, same shape
     Your Choice [PRICE]/

   So: the effective price is the cheapest value in a discount tier when
   there is one, else the cheapest list value. The original is the
   cheapest list value, and is only carried when it is genuinely higher
   than the effective one — normalizeLiveItem decides from that whether
   a discount badge is earned.

   A RANGE IS REPORTED, NOT LABELLED. 106 of the first 556 products have
   more than one list price. They show their lowest, which is what a
   range means to a shopper, but the card has no "desde" treatment and
   inventing one was not in scope — so `priceFrom` is written on the item
   for whoever adds it, and the build prints the count.
   ------------------------------------------------------------------ */
const LIST_LABEL = "[PRICE]";

function priceOf(product) {
  const tiers = product?.pricing?.price?.tieredPrice;
  if (!Array.isArray(tiers)) return null;
  const numbers = (tier) => (tier?.values || [])
    .map((v) => v?.value)
    .filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0);

  const listTiers = tiers.filter((t) => t?.label === LIST_LABEL);
  const dealTiers = tiers.filter((t) => t?.label && t.label !== LIST_LABEL);
  const list = listTiers.flatMap(numbers);
  const deal = dealTiers.flatMap(numbers);

  const effective = deal.length ? Math.min(...deal) : (list.length ? Math.min(...list) : null);
  if (effective == null) return null;
  const original = list.length ? Math.min(...list) : null;
  return {
    price: effective,
    originalPrice: original != null && original > effective ? original : null,
    priceFrom: new Set(list).size > 1,
  };
}

function slim(product) {
  const detail = product?.detail || {};
  const name = String(detail.name || "").trim();
  if (!name) return null;

  const av = product?.availability || {};
  if (!(av.active && av.available)) return null;      // not buyable, not listed

  const p = priceOf(product);
  if (!p) return null;

  const imagery = product?.imagery || {};
  const paths = [
    imagery?.primaryImage?.filePath,
    ...(imagery?.additionalImageSource || []).map((s) => s?.filePath),
  ];
  const images = [...new Set(paths.map(imageUrl).filter(Boolean))].slice(0, 6);

  const agg = detail?.reviewStatistics?.aggregate || {};
  const rating = typeof agg.rating === "number" && agg.rating > 0 ? Math.round(agg.rating * 10) / 10 : null;
  const reviewCount = typeof agg.count === "number" && agg.count > 0 ? agg.count : null;

  const item = {
    // The field names normalizeLiveItem() already reads, so Macy's items
    // go through the identical pricing, weight and freight path as every
    // other retailer's.
    name,
    /* WHAT THE THING IS, which is what lets a department split into
       aisles (see scripts/lib/subcategories.js). Macy's reports it on
       100% of products and it was being thrown away here, which is why
       "Women" shipped as one flat bucket of 754 items led by underwear.
       Normalised on the way in so the aisle map is written once rather
       than once per retailer's punctuation. */
    type: normalizeType(detail.typeName),
    brand: String(detail.brand || "").trim() || null,
    price: p.price,
    image: images[0] || null,
    images,
    rating,
    reviewCount,
    onSale: p.originalPrice != null,
    url: typeof product?.url === "string" ? product.url : null,
  };
  if (p.originalPrice != null) item.originalPrice = p.originalPrice;
  if (p.priceFrom) item.priceFrom = true;
  return item;
}

function main() {
  const [srcArg, ...flags] = process.argv.slice(2);
  if (!srcArg) {
    console.error("usage: node scripts/build-macys-catalog.mjs <raw-export.json> [--dry-run]");
    process.exit(1);
  }
  const dryRun = flags.includes("--dry-run");
  const raw = fs.readFileSync(path.resolve(srcArg), "utf8");

  // The header is readable even when the body is cut off.
  const declared = Number(/"productCount":\s*(\d+)/.exec(raw)?.[1]) || null;
  const category = /"category":\s*"([^"]*)"/.exec(raw)?.[1] || "Women's Clothing";
  const truncated = raw.trimEnd().endsWith("}") === false;

  const products = recoverProducts(raw);
  const items = products.map(slim).filter(Boolean);
  const dropped = products.length - items.length;
  const ranges = items.filter((i) => i.priceFrom).length;
  const noImage = items.filter((i) => !i.image).length;

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: "Macy's US storefront (Apify export)",
    sourceCategory: category,
    // Honest provenance, so nothing downstream has to guess: how many the
    // export claimed, how many survived it, and whether it was cut short.
    declaredProductCount: declared,
    recoveredProductCount: products.length,
    truncatedExport: truncated,
    retailers: {
      macys: {
        label: "Macy's",
        departments: {
          women: { label: "Moda Mujer", items, fetchedAt: new Date().toISOString() },
        },
        brands: {},
      },
    },
  };

  console.log(`export declared:      ${declared ?? "unknown"} products`);
  console.log(`complete products:    ${products.length}${truncated ? "  (export was truncated mid-object)" : ""}`);
  console.log(`published items:      ${items.length}`);
  console.log(`dropped:              ${dropped}  (unavailable, unnamed, or no usable price)`);
  console.log(`multi-price ("desde"):${String(ranges).padStart(4)}  — shown at their lowest list price`);
  console.log(`no image:             ${noImage}`);
  console.log(`brands:               ${new Set(items.map((i) => i.brand).filter(Boolean)).size}`);

  /* THE AISLES, PRINTED. A department that cannot be split is a
     department a shopper has to scroll, so this is worth seeing on every
     run rather than discovering on a phone. */
  const grouped = groupBySubcategory(items);
  console.log(`\nsubcategories (${grouped.typed}/${grouped.total} items placed):`);
  for (const r of grouped.rows) console.log(`  ${String(r.count).padStart(4)}  ${r.label}`);
  const orphans = unmappedTypes(items);
  if (orphans.length) {
    /* Not a failure: an unmapped type is reachable in "Ver todo". It is
       printed so a new type is noticed on the run that introduces it,
       instead of the quarter somebody happens to look. */
    console.log(`\nunmapped types (reachable only via "Ver todo") — add them to SUBCATEGORY_SPEC:`);
    for (const o of orphans) console.log(`  ${String(o.count).padStart(4)}  ${o.type}`);
  }
  if (!items.length) {
    console.error("refusing to write an empty catalogue");
    process.exit(1);
  }
  if (dryRun) { console.log("\n--dry-run: nothing written"); return; }
  fs.writeFileSync(OUT, JSON.stringify(catalog));
  console.log(`\nwrote ${path.relative(process.cwd(), OUT.pathname)}  (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main();
