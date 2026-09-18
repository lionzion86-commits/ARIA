// Scans product images for rendered price text and quarantines the ones
// that have it.
//
//   node scripts/image-price-scan.js              # scan, write results
//   node scripts/image-price-scan.js --dry-run    # report only, touch nothing
//   node scripts/image-price-scan.js --limit 50   # first N products (smoke test)
//   node scripts/image-price-scan.js --recheck    # re-scan URLs already decided
//
// Requires (not committed — install before running):
//   npm install --no-save tesseract.js @tesseract.js-data/eng sharp
//
// WHY
// The image comes from the US retailer and shows the US sticker price. Our
// price adds roughly 24% for shipping, duties and IGV, so an image with a
// price on it always understates what the customer pays. Next to our
// higher number it reads as bait-and-switch.
//
// WHAT IT DOES
//   * checks each product's images in order
//   * keeps the first one with no price text
//   * drops images that have price text from the served cache
//   * marks a product `imageReview: "quarantined"` when NO clean image
//     remains, which hides it from the storefront until a human looks
//
// Every decision, including the OCR text behind it, is written to
// image-quarantine.json so a person can audit and reverse it. The cache
// itself only carries the minimum the frontend needs.
//
// HONEST LIMITS — read before trusting a clean result
//   * OCR recall is good but not total. Measured: "$129.99", "S/ 459.90"
//     and "SALE 49.99" badges are caught; a BARE number on a saturated
//     badge ("129.99" white-on-red, no symbol or price word) is not read
//     by Tesseract in some layouts. See scripts/lib/ocr.js for the
//     evidence. "No price text found" therefore means "none detected",
//     not "guaranteed none present".
//   * An image OCR cannot read at all is never promoted to clean — it
//     counts as unreadable and sends the product to manual review.
import fs from "node:fs/promises";
import { containsPriceText, pickCleanImage } from "./lib/price-text-detector.js";
import { createOcr } from "./lib/ocr.js";

// Overridable so the integration test can point the real script at a
// fixture cache instead of the live one.
const CACHE_FILE = process.env.ARIA_CACHE_FILE
  ? new URL(`file://${process.env.ARIA_CACHE_FILE}`)
  : new URL("../department-cache.json", import.meta.url);
const REPORT_FILE = process.env.ARIA_REPORT_FILE
  ? new URL(`file://${process.env.ARIA_REPORT_FILE}`)
  : new URL("../image-quarantine.json", import.meta.url);
const FETCH_TIMEOUT_MS = 20000;
const MAX_BYTES = 8 * 1024 * 1024;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RECHECK = args.includes("--recheck");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) || Infinity : Infinity;
})();

function imageUrlsOf(item) {
  const list = Array.isArray(item.images) ? item.images : [];
  const singles = [item.image, item.imageUrl, item.thumbnail].filter(Boolean);
  return [...new Set([...singles, ...list])].filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
}

function titleOf(item) {
  return item.title || item.name || item.productTitle || item.productName || "(sin título)";
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "aria-image-audit/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`too large (${buf.length} bytes)`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const cache = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));

  // Previous verdicts, so a re-run only pays for URLs it has not seen.
  let prior = { verdicts: {} };
  try {
    prior = JSON.parse(await fs.readFile(REPORT_FILE, "utf8"));
  } catch { /* first run */ }
  const verdicts = RECHECK ? {} : prior.verdicts || {};

  const { scanImageForPriceText, close } = await createOcr();

  // One verdict per URL, memoised — the same image appears under several
  // products and departments (461 unique URLs across 613 references).
  async function checkUrl(url) {
    if (verdicts[url]) return verdicts[url];
    let verdict;
    try {
      const buf = await fetchImage(url);
      const res = await scanImageForPriceText(buf, containsPriceText);
      verdict = res.ok
        ? { ok: true, hasPrice: res.hasPrice, matches: res.matches, where: res.where || null,
            text: (res.text || "").replace(/\s+/g, " ").trim().slice(0, 300) }
        : { ok: false, hasPrice: false, matches: [], error: res.error || "unreadable" };
    } catch (err) {
      verdict = { ok: false, hasPrice: false, matches: [], error: err.message };
    }
    verdicts[url] = verdict;
    return verdict;
  }

  const products = [];
  for (const [retailer, bucket] of Object.entries(cache.retailers || {})) {
    for (const [deptKey, dept] of Object.entries(bucket.departments || {})) {
      for (const item of dept.items || []) products.push({ retailer, deptKey, item });
    }
    for (const [brandKey, brand] of Object.entries(bucket.brands || {})) {
      for (const item of brand.items || []) products.push({ retailer, deptKey: `brand:${brandKey}`, item });
    }
  }

  const scanned = products.slice(0, LIMIT);
  console.log(`Scanning ${scanned.length} product entries (${products.length} total, ${new Set(scanned.flatMap((p) => imageUrlsOf(p.item))).size} unique images)...\n`);

  const quarantinedProducts = [];
  const droppedImages = [];
  let cleanCount = 0, changedCount = 0, done = 0;

  for (const { retailer, deptKey, item } of scanned) {
    const urls = imageUrlsOf(item);
    if (!urls.length) { done++; continue; }

    const { clean, quarantined, unreadable } = await pickCleanImage(urls, checkUrl);

    for (const q of quarantined) {
      droppedImages.push({ retailer, department: deptKey, title: titleOf(item), url: q.url, matches: q.matches });
    }

    if (clean) {
      cleanCount++;
      // Keep only images verified clean, clean one first. Anything after
      // the chosen image was never checked, so it is dropped rather than
      // silently shipped unverified.
      if (!DRY_RUN && (quarantined.length || item.image !== clean)) {
        item.image = clean;
        if (item.imageUrl) item.imageUrl = clean;
        if (item.thumbnail) item.thumbnail = clean;
        item.images = [clean, ...(Array.isArray(item.images) ? item.images : []).filter(
          (u) => u !== clean && !quarantined.some((q) => q.url === u) && !unreadable.includes(u) && verdicts[u]?.ok && !verdicts[u]?.hasPrice)];
        delete item.imageReview;
        changedCount++;
      }
    } else {
      quarantinedProducts.push({
        retailer, department: deptKey, title: titleOf(item),
        reason: quarantined.length ? "price-text-in-every-image" : "no-readable-image",
        images: quarantined.map((q) => ({ url: q.url, matches: q.matches })),
        unreadable,
      });
      if (!DRY_RUN) {
        // Withheld from the storefront until a human clears it. The
        // original URLs stay in place so the review has something to look
        // at — the frontend keys off imageReview, not the image fields.
        item.imageReview = "quarantined";
        changedCount++;
      }
    }

    if (++done % 25 === 0) console.log(`  ...${done}/${scanned.length}`);
  }

  await close();

  const report = {
    generatedAt: new Date().toISOString(),
    scannedProducts: scanned.length,
    uniqueImages: Object.keys(verdicts).length,
    productsWithCleanImage: cleanCount,
    quarantinedProducts,
    droppedImages,
    verdicts,
  };
  if (!DRY_RUN) {
    await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  }

  const unreadableCount = Object.values(verdicts).filter((v) => !v.ok).length;
  console.log(`\n${"=".repeat(58)}`);
  console.log(`products scanned          ${scanned.length}`);
  console.log(`products with clean image ${cleanCount}`);
  console.log(`products QUARANTINED      ${quarantinedProducts.length}`);
  console.log(`images dropped            ${droppedImages.length}`);
  console.log(`images unreadable         ${unreadableCount}`);
  console.log(`cache entries changed     ${changedCount}${DRY_RUN ? " (dry run — nothing written)" : ""}`);
  console.log("=".repeat(58));
  if (quarantinedProducts.length) {
    console.log("\nQuarantined (need a human):");
    for (const q of quarantinedProducts.slice(0, 20)) {
      console.log(`  [${q.retailer}/${q.department}] ${q.title.slice(0, 54)} — ${q.reason}`);
    }
    if (quarantinedProducts.length > 20) console.log(`  ...and ${quarantinedProducts.length - 20} more`);
  }
  if (!DRY_RUN) console.log(`\nFull report: image-quarantine.json`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
