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

   REGENERATE after a catalogue or feed change:
     node scripts/build-price-index.mjs
   scripts/test/checkout-tests.mjs fails when it has fallen behind.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCatalog, productIdFor } from "./lib/mcp/catalog.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const PRICE_INDEX_FILE = "price-index.json";

const r2 = (n) => Math.round(Number(n) * 100) / 100;

export function buildPriceIndex() {
  const { items } = buildCatalog();
  const prices = {};
  for (const it of items) prices[productIdFor(it.retailer, it.title)] = [r2(it.price), r2(it.dutiableUsd)];
  let sale = 0;
  for (const it of JSON.parse(readFileSync(ROOT + "ofertas-feed.json", "utf8")).items || []) {
    const title = it && (it.title || it.name);
    const price = Number(it && it.price);
    if (!title || !(price > 0) || !it.retailer) continue;
    const id = productIdFor(it.retailer, title);
    const had = prices[id];
    if (!had) prices[id] = [r2(price), r2(it.dutiableUsd ?? price)];
    else if (Math.abs(had[0] - price) > 0.005) { had[2] = r2(price); had[3] = r2(it.dutiableUsd ?? price); }
    sale++;
  }
  return { v: 1, generatedAt: null, count: Object.keys(prices).length, saleFeedItems: sale, prices };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = buildPriceIndex();
  index.generatedAt = new Date().toISOString();
  const out = JSON.stringify(index);
  writeFileSync(ROOT + PRICE_INDEX_FILE, out);
  console.log(`${PRICE_INDEX_FILE}: ${index.count} products, ${(out.length / 1e6).toFixed(1)}MB`);
}
