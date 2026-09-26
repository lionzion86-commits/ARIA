/* ============================================================
   rockauto-image — Netlify image proxy (2026-09-26)

   RockAuto's robots rules disallow hotlinking /info/ images, and
   leaking rockauto.com URLs into the page would break the
   no-internal-URLs rule. So listing images are served through
   here: the browser only ever sees
   /.netlify/functions/rockauto-image?u=<path>.

   GET ?u=/info/915/CA10165_Front__ra_m.jpg

   - `u` must be a relative RockAuto image path (/info/... or
     /catalog/... with an image extension). Anything else -> 400.
   - Binary cached in Blobs (store "rockauto-img", 30-day TTL).
   - Upstream fetched with the same stock iPhone Safari UA as the
     listings chain.
   - Failure -> 404; the card falls back to its placeholder.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { ROCKAUTO_BASE, ROCKAUTO_UA } from "../../scripts/lib/rockauto-direct.js";

const STORE = "rockauto-img";
const IMG_TTL_MS = 30 * 24 * 3600 * 1000;
const UPSTREAM_TIMEOUT_MS = 10000;

const ALLOWED = /^\/(info|catalog)\//i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)(\?.*)?$/i;

function keyFor(path) {
  return createHash("sha256").update(path).digest("hex").slice(0, 32);
}

async function readCache(path) {
  try {
    const store = getStore(STORE);
    const hit = await store.get(keyFor(path), { type: "json" });
    if (!hit || !hit.bodyB64 || !hit.contentType) return null;
    const age = Date.now() - Date.parse(hit.generatedAt || 0);
    if (!Number.isFinite(age) || age > IMG_TTL_MS) return null;
    return hit;
  } catch {
    return null;
  }
}

async function writeCache(path, bodyB64, contentType) {
  try {
    const store = getStore(STORE);
    await store.setJSON(keyFor(path), {
      bodyB64,
      contentType,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    // Uncached images still serve; they just cost a refetch.
  }
}

export async function handler(event) {
  // Classic-functions requirement (see _auth-helpers.js): connect the
  // Blobs context before any getStore().
  try { connectLambda(event); } catch { /* image cache degrades gracefully */ }

  const raw = event.queryStringParameters?.u || "";
  let path = "";
  try {
    path = decodeURIComponent(raw);
  } catch {
    path = "";
  }
  if (!path.startsWith("/") || !ALLOWED.test(path) || !IMAGE_EXT.test(path) || path.length > 300) {
    return { statusCode: 400, body: "bad image path" };
  }

  const hit = await readCache(path);
  if (hit) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": hit.contentType,
        "Cache-Control": "public, max-age=2592000, immutable",
      },
      body: hit.bodyB64,
      isBase64Encoded: true,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(ROCKAUTO_BASE + path, {
      headers: { "User-Agent": ROCKAUTO_UA, Accept: "image/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return { statusCode: 404, body: "not found" };
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return { statusCode: 404, body: "not an image" };
    const bodyB64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    await writeCache(path, bodyB64, contentType);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=2592000, immutable",
      },
      body: bodyB64,
      isBase64Encoded: true,
    };
  } catch {
    return { statusCode: 404, body: "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}
