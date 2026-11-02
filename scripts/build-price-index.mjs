#!/usr/bin/env node
/* ============================================================
   price-index.json — WHAT EACH PRODUCT COSTS, FOR THE SERVER THAT CHARGES.

   WHY (2026-10-08, Stripe checkout). A cart line's priceUsd is written
   by the browser. Until money moved that was bookkeeping; once
   orders-create.js opens a Stripe session it is the amount charged, and
   a price the browser wrote is a price anyone can rewrite. So the
   server needs the card price itself.

   The prices are index.html's own: the connector's buildCatalog runs the
   page's normalizeLiveItem (tiered margin, per-retailer Miami sales tax,
   dutiable base) over the committed catalogues -- the exact numbers the
   cards render. That costs ~11s, too slow for a checkout request, so it
   runs here once and the function reads the result.

   Key: productIdFor(retailer, title) (the connector's public id).
   Value: [cardPriceUsd, dutiableUsd, salePriceUsd?, saleDutiableUsd?]
   -- the sale feed (ofertas-feed.json, prices already final) can show a
   product at a second, lower price; both are prices the site really
   showed, each with its own dutiable base.

   COLOURWAYS (#443 variants): a title several listings carry (Snipes'
   eleven "Samba OG", $49.99 to $130) also gets one entry per listing
   whose price differs, keyed productIdFor(retailer, title + "::v:" + v)
   with v the listing's id (scripts/lib/variants.mjs variantIdOf, the
   id the product page links with and the cart line carries).
   REGENERATE after a catalogue or feed change:
     node scripts/build-price-index.mjs
   scripts/test/checkout-tests.mjs fails when it has fallen behind.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCatalog, productIdFor } from "./lib/mcp/catalog.mjs";
import { isOffSaleRetailer } from "./lib/off-sale.js";
import { variantIdOf } from "./lib/variants.mjs";
import { loadFamilies, applyFamilies } from "./lib/variant-families.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PRICE_INDEX_FILE = "price-index.json";

const r2 = (n) => Math.round(Number(n) * 100) / 100;

/* VARIANT FAMILIES (#443 universal variant truth): a shade or colour the
   store's own variant data lists, with its own real price, that no
   catalogue file carries (scripts/lib/variant-families.mjs; the product
   page offers it from assets/pdp/). Checkout must vouch for its price
   too, so it is priced here like a catalogue listing. */
export function familyEnvelope(listings, families) {
  const { extra } = applyFamilies(listings.map((l) => ({ v: variantIdOf(l.url), retailer: l.retailer, name: l.title, url: l.url, price: l.price })), families);
  const retailers = {};
  for (const x of extra) {
    const r = (retailers[x.retailer] = retailers[x.retailer] || { departments: {} });
    const d = (r.departments[x.dept || "variantes"] = r.departments[x.dept || "variantes"] || { items: [] });
    const it = { name: x.name, brand: x.brand, price: x.price, image: x.image, url: x.url };
    if (x.wasPrice) it.wasPrice = x.wasPrice;
    d.items.push(it);
  }
  return { retailers };
}

export function buildPriceIndex() {
  const base = buildCatalog({ listings: true });
  const families = loadFamilies(ROOT);
  const env = families.length ? familyEnvelope(base.listings, families) : null;
  const { items, listings } = env && Object.keys(env.retailers).length ? buildCatalog({ listings: true, extraEnvelopes: [env] }) : base;
  const prices = {};
  for (const it of items) prices[productIdFor(it.retailer, it.title)] = [r2(it.price), r2(it.dutiableUsd)];
  const urlsByTitle = new Map();
  for (const l of listings) {
    if (!l.url) continue;
    const k = productIdFor(l.retailer, l.title);
    if (!urlsByTitle.has(k)) urlsByTitle.set(k, new Set());
    urlsByTitle.get(k).add(l.url);
  }
  let variantPrices = 0;
  for (const l of listings) {
    const k = productIdFor(l.retailer, l.title);
    if (!l.url || !(urlsByTitle.get(k).size > 1) || isOffSaleRetailer(l.retailer)) continue;
    const vk = productIdFor(l.retailer, `${l.title}::v:${variantIdOf(l.url)}`);
    if (prices[vk] || Math.abs(prices[k][0] - r2(l.price)) < 0.005) continue;
    prices[vk] = [r2(l.price), r2(l.dutiableUsd)];
    variantPrices++;
  }
  let sale = 0;
  for (const it of JSON.parse(readFileSync(ROOT + "ofertas-feed.json", "utf8")).items || []) {
    const title = it && (it.title || it.name);
    const price = Number(it && it.price);
    /* Off sale (/off-sale.js): checkout never vouches for its price. */
    if (!title || !(price > 0) || !it.retailer || isOffSaleRetailer(it.retailer)) continue;
    const id = productIdFor(it.retailer, title);
    const had = prices[id];
    if (!had) prices[id] = [r2(price), r2(it.dutiableUsd ?? price)];
    else if (Math.abs(had[0] - price) > 0.005) { had[2] = r2(price); had[3] = r2(it.dutiableUsd ?? price); }
    sale++;
  }
  return { v: 1, generatedAt: null, count: Object.keys(prices).length, saleFeedItems: sale, variantPrices, prices };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = buildPriceIndex();
  index.generatedAt = new Date().toISOString();
  const out = JSON.stringify(index);
  writeFileSync(ROOT + PRICE_INDEX_FILE, out);
  console.log(`${PRICE_INDEX_FILE}: ${index.count} products, ${(out.length / 1e6).toFixed(1)}MB`);
}
