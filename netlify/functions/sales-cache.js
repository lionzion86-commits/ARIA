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
// every visitor sees. It is now ADMIN ONLY. Strict validation limited what could be stored, but
// it did not stop an anonymous attacker publishing valid-shaped but
// fabricated deals during any stale window. That write path is gone:
// POST now requires a valid session, and the session's email is recorded
// on the stored entry so any bad write is attributable.
//
// GET stays public on purpose — deals are public catalog data, and the
// storefront has to render them for logged-out shoppers.
//
// CONSEQUENCE, AND IT IS SIGNIFICANT: the cache is populated by a client
// donating its completed scan, so with admin-only writes it refills ONLY
// when an admin opens Ofertas. In normal operation that is rare, so expect
// the cache to be cold most of the time and most visitors to fall back to
// a live scan — the behaviour that existed before the cache was added.
// Slower and more Apify usage per visitor, never wrong: a cold cache
// degrades to a correct live result, it does not break the page. When an
// admin does open Ofertas, everyone benefits for the next 6 hours.
//
// If that trade is not what you want, the fix is not to reopen this
// endpoint — it is a scheduled server-side refresh with no client write
// path at all, which keeps the cache warm AND keeps the write surface
// closed.
//
// The validation below is retained regardless: authentication says who
// may write, not that what they wrote is sane.
import { getStore, connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail, isAdmin } from "./_auth-helpers.js";
import { timingSafeEqual } from "node:crypto";

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

// Constant-time bearer comparison. A plain === leaks the token prefix
// through response timing; the length guard is fine to leak since the
// token length is not the secret.
function tokenMatches(presented, expected) {
  if (!presented || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorizeWriter(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const expected = (process.env.SALES_REFRESH_TOKEN || "").trim();

  if (bearer) {
    // A presented token that does not match is a hard 403 — never fall
    // through to the session check, so a bad token cannot be probed
    // against a logged-in browser session.
    return tokenMatches(bearer, expected)
      ? { ok: true, who: "scheduled-refresh" }
      : { ok: false, status: 403, error: "No autorizado" };
  }

  const email = await getSessionEmail(event);
  if (!email) return { ok: false, status: 401, error: "Autenticación requerida" };
  if (!isAdmin(email)) return { ok: false, status: 403, error: "No autorizado" };
  return { ok: true, who: email };
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
    // TWO TRUSTED WRITERS, NO OTHERS. Checked before the body is even
    // parsed, so a caller without rights learns nothing about the payload
    // contract.
    //
    //   1. the scheduled refresher (scripts/refresh-sales-cache.js), which
    //      presents SALES_REFRESH_TOKEN as a bearer token. This is the
    //      normal path — it is what keeps the cache warm.
    //   2. an admin session, for the "Actualizar ofertas" button, which is
    //      a manual override when an operator wants it refreshed now.
    //
    // Ordinary visitors never write. 401 vs 403 is deliberate: 401 means
    // "no credentials at all", 403 means "credentials, but not allowed" —
    // the split exists so an operator reading logs can tell a logged-out
    // client from a real privilege problem.
    const writer = await authorizeWriter(event);
    if (!writer.ok) {
      return { statusCode: writer.status, headers, body: JSON.stringify({ error: writer.error }) };
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
      // The staleness gate that used to live here is GONE, deliberately.
      // It refused to overwrite a cache younger than TTL_MS, and its only
      // purpose was stopping an anonymous attacker churning what visitors
      // see. There are no anonymous writers any more — only the scheduled
      // refresher and an admin pressing "Actualizar ofertas", and both of
      // those exist precisely to overwrite.
      //
      // Keeping it would have broken the whole feature silently: the cron
      // runs more often than TTL_MS (every 4h against a 6h TTL, so the
      // cache is replaced before it can go stale), so EVERY scheduled run
      // would have been answered "skipped: fresh" and the cache would have
      // aged out anyway.
      const generatedAt = new Date().toISOString();
      // writtenBy makes any write traceable to the refresher or an account.
      await store.setJSON("deals", { generatedAt, items, writtenBy: writer.who });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, generatedAt, stored: items.length }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
}
