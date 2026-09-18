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
// AUTHENTICATION (2026-09-18)
// POST used to be a PUBLIC, UNAUTHENTICATED write to shared state that
// every visitor sees. Strict validation limited what could be stored, but
// it did not stop an anonymous attacker publishing valid-shaped but
// fabricated deals during any stale window. That write path is gone:
// POST now requires a valid session, and the session's email is recorded
// on the stored entry so any bad write is attributable.
//
// GET stays public on purpose — deals are public catalog data, and the
// storefront has to render them for logged-out shoppers.
//
// CONSEQUENCE, worth knowing: the cache is populated by a client donating
// its completed scan, so it now only refills when a LOGGED-IN visitor
// opens Ofertas. Anonymous visitors still read whatever is cached; on a
// cold cache they fall back to a live scan, which is the behaviour that
// existed before the cache was added — slower and more Apify usage, never
// wrong. Tighten to admin-only by swapping getSessionEmail for isAdmin if
// you want the write surface smaller still; the real fix remains a
// scheduled server-side refresh with no client write path at all.
//
// The validation below is retained regardless: authentication says who
// may write, not that what they wrote is sane.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";

// Mirrors GENERAL_RETAILERS in index.html (LIVE_RETAILERS minus autozone,
// which is the auto-parts lane and never appears in Ofertas).
const ALLOWED_RETAILERS = new Set(["walmart", "target", "oldnavy", "footlocker"]);

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — deals move, but not minute to minute
// Mirrors MIN_DISCOUNT_PCT in index.html. Enforced here too so a trivial
// markdown can never re-enter through the cache even if a client posts
// one: Foot Locker really did return a $200 -> $199.99 "deal", which
// rendered as a -0% badge.
const MIN_DISCOUNT_PCT = 5;
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
  // original price above the current one is not a deal, and neither is a
  // markdown too small to be worth a badge. Rounded before comparing so
  // this matches exactly what the card would render.
  if (!title || price == null || originalPrice == null || originalPrice <= price) return null;
  if (Math.round((1 - price / originalPrice) * 100) < MIN_DISCOUNT_PCT) return null;

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
    // No anonymous writes. Checked before the body is even parsed, so an
    // unauthenticated caller learns nothing about the payload contract.
    const email = await getSessionEmail(event);
    if (!email) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Autenticación requerida" }) };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
    }

    // Same variant collapse the client does, applied again here: the cache
    // is shared, so one client posting colour variants of a product must
    // not show every visitor the same shirt three times at three prices.
    // Cheapest wins, matching the client.
    const deduped = new Map();
    for (const raw of (Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [])) {
      const item = sanitizeItem(raw);
      if (!item) continue;
      // Must stay in step with productDedupeKey() in index.html.
      const key = item.retailer + "::" + item.title.toLowerCase()
        .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      const existing = deduped.get(key);
      if (!existing || item.price < existing.price) deduped.set(key, item);
    }
    const items = Array.from(deduped.values());
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
      // writtenBy makes a bad write traceable to an account.
      await store.setJSON("deals", { generatedAt, items, writtenBy: email });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, generatedAt, stored: items.length }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
}
