#!/usr/bin/env node
/* canary-rockauto.mjs — LIVE-NETWORK canary for the RockAuto direct
   fallback (2026-09-26).

   Runs the real 4-request chain against rockauto.com for the
   acceptance case (2010 Honda Civic + "filtro de aire") and fails
   loudly — non-zero exit — unless at least one listing comes back
   with brand, part number, price AND image.

   This is the markup-change detector: if RockAuto renames
   span.listing-final-manufacturer / span.listing-final-partnumber /
   span#dprice[N][v] / img#inlineimg[N], the unit tests still pass
   (they use fixtures) and THIS script screams.

   NOT part of `npm test` — it hits the live network. Run it by
   hand, or from a scheduled prober:
     node scripts/canary-rockauto.mjs
*/
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ROCKAUTO_UA,
  ROCKAUTO_CHARSET,
  rockautoCacheKey,
  runRockautoLiveChain,
  glossaryToPairs,
} from "./lib/rockauto-direct.js";

const here = dirname(fileURLToPath(import.meta.url));
const GLOSSARY = JSON.parse(
  readFileSync(join(here, "lib", "es-en-parts-glossary.json"), "utf8"),
);

const PER_REQUEST_TIMEOUT_MS = 15000;

async function fetchRockautoHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": ROCKAUTO_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} on ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return new TextDecoder(ROCKAUTO_CHARSET).decode(buf);
  } catch (err) {
    console.error(`  fetch failed on ${url}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastAt = 0;
async function politeFetch(url) {
  const wait = Math.max(0, 400 - (Date.now() - lastAt));
  if (wait) await sleep(wait);
  lastAt = Date.now();
  return fetchRockautoHtml(url);
}

console.log("rockauto canary: 2010 Honda Civic + 'filtro de aire'");
console.log(`  cache key: ${rockautoCacheKey("2010", "Honda", "Civic", "filtro de aire")}`);

const r = await runRockautoLiveChain({
  year: "2010",
  make: "Honda",
  model: "Civic",
  query: "filtro de aire",
  entries: glossaryToPairs(GLOSSARY),
  fetchHtml: politeFetch,
  courtesyDelayMs: 0, // politeness handled by politeFetch
});

if (!r.ok) {
  console.error(`CANARY FAIL: chain miss (${r.miss})`);
  process.exit(1);
}

const bad = r.items.filter(
  (it) => !it.brand || !it.partNumber || !(it.priceUsd > 0) || !it.imagePath,
);
console.log(`  translated: ${r.translatedQuery}`);
console.log(`  engine: ${r.engine} | category: ${r.category} | part type: ${r.partType}`);
console.log(`  listings: ${r.items.length} (${bad.length} incomplete)`);
for (const it of r.items.slice(0, 3)) {
  console.log(`  - ${it.brand} ${it.partNumber} $${it.priceUsd.toFixed(2)} ${it.imagePath}`);
}

if (!r.items.length || bad.length) {
  console.error("CANARY FAIL: no complete listing (brand + part number + price + image)");
  process.exit(1);
}
console.log("CANARY OK");
