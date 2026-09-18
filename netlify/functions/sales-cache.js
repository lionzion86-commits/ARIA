// Server-side cache for the Ofertas (deals) page, per spec §6: "Cache deal
// results server-side; serve cached results instantly with an honest
// 'Actualizado hace X' timestamp. Revalidate quietly in the background."
//
// WHY THE CLIENT WRITES THIS CACHE
// The deal scan itself cannot run inside this function. Scraping goes
// through apify-scrape-start.js, which kicks off a real Apify actor run
// per retailer/query and then polls apify-scrape-status.js until it
// finishes — that takes far longer than a Netlify function's execution
// budget. So the scan stays where it already works (the browser), and the
// first visitor to hit a cold/stale cache donates their completed scan
// back here for everyone else. Every later visitor gets it instantly.
//
// TRUST BOUNDARY — READ THIS BEFORE CHANGING IT
// That makes POST a public, unauthenticated write to shared state, which
// is a real abuse vector: a determined attacker can publish deal entries
// that every visitor then sees. It is NOT secured by obscurity, and the
// validation below is a mitigation, not a fix. What it does enforce:
//   - retailer must be one of the known live retailers
//   - every field is type/range checked; unknown fields are dropped, so
//     nothing an attacker adds survives into the stored object
//   - image must be an https:// URL (no data:/javascript: payloads)
//   - hard cap on item count and on string lengths
//   - writes are only accepted when the cache is actually stale, so this
//     cannot be hammered to churn the stored value
// What it does NOT prevent: a valid-shaped but fabricated deal (wrong
// price, misleading title) from a hostile client, within the stale window.
// The real fix is a scheduled server-side refresh with no public write
// path at all — worth doing before this page carries real traffic.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders } from "./_auth-helpers.js";

// Mirrors GENERAL_RETAILERS in index.html (LIVE_RETAILERS minus autozone,
// which is the auto-parts lane and never appears in Ofertas).
const ALLOWED_RETAILERS = new Set(["walmart", "target", "oldnavy", "footlocker"]);

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — deals move, but not minute to minute
const MAX_ITEMS = 120;
const MAX_TITLE = 300;
const MAX_URL = 1000;
const MAX_PRICE_USD = 50000;

function cleanString(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function cleanHttpsUrl(value) {
  const s = cleanString(value, MAX_URL);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

function cleanPrice(value) {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PRICE_USD) return null;
  return Math.round(n * 100) / 100;
}

// Rebuilds each item field by field. Anything not explicitly listed here
// is discarded, so the stored shape is always exactly what the Ofertas
// grid expects regardless of what was posted.
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const retailer = cleanString(raw.retailer, 40);
  if (!retailer || !ALLOWED_RETAILERS.has(retailer)) return null;

  const title = cleanString(raw.title, MAX_TITLE);
  const price = cleanPrice(raw.price);
  const originalPrice = cleanPrice(raw.originalPrice);
  // Ofertas only ever shows genuine markdowns — an item with no real
  // original price above the current one is not a deal.
  if (!title || price == null || originalPrice == null || originalPrice <= price) return null;

  const ratingNum = Number(raw.rating);
  const rating = Number.isFinite(ratingNum) && ratingNum >= 0 && ratingNum <= 5
    ? Math.round(ratingNum * 10) / 10
    : null;

  const weightNum = Number(raw.weightKg);
  const weightKg = Number.isFinite(weightNum) && weightNum > 0 && weightNum < 1000
    ? Math.round(weightNum * 1000) / 1000
    : null;

  const sizes = Array.isArray(raw.sizes)
    ? raw.sizes.map((s) => cleanString(s, 40)).filter(Boolean).slice(0, 40)
    : [];

  const images = Array.isArray(raw.images)
    ? raw.images.map(cleanHttpsUrl).filter(Boolean).slice(0, 8)
    : [];

  return {
    retailer,
    title,
    price,
    originalPrice,
    rating,
    weightKg,
    sizes,
    image: cleanHttpsUrl(raw.image),
    images,
    onSale: true,
  };
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const store = getStore("sales");

  if (event.httpMethod === "GET") {
    try {
      const cached = await store.get("deals", { type: "json" });
      if (!cached || !Array.isArray(cached.items)) {
        // Cold cache — the client shows the full skeleton/status-line
        // loading state and runs a live scan.
        return { statusCode: 200, headers, body: JSON.stringify({ items: [], generatedAt: null, stale: true }) };
      }
      const ageMs = Date.now() - new Date(cached.generatedAt).getTime();
      const stale = !Number.isFinite(ageMs) || ageMs > TTL_MS;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ items: cached.items, generatedAt: cached.generatedAt, stale }),
      };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
    }

    const items = Array.isArray(body.items)
      ? body.items.slice(0, MAX_ITEMS).map(sanitizeItem).filter(Boolean)
      : [];
    // An empty scan result is never worth replacing a good cache with —
    // it's indistinguishable from "every retailer failed".
    if (!items.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Sin ofertas válidas" }) };
    }

    try {
      const existing = await store.get("deals", { type: "json" });
      if (existing?.generatedAt) {
        const ageMs = Date.now() - new Date(existing.generatedAt).getTime();
        // Staleness gate: a fresh cache is never overwritten, so this
        // endpoint can't be used to churn what visitors see.
        if (Number.isFinite(ageMs) && ageMs <= TTL_MS) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, skipped: "fresh", generatedAt: existing.generatedAt }),
          };
        }
      }
      const generatedAt = new Date().toISOString();
      await store.setJSON("deals", { generatedAt, items });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, generatedAt, stored: items.length }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
}
