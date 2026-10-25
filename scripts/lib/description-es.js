/* ============================================================
   SPANISH DESCRIPTIONS, STORED WITH THE DATA (#443 c.6402691998).

   Danny, on a live product page: the whole page was Spanish except the
   part that sells the product -- the Descripción was the feed's raw
   English. "This store is for Peruvians": every description is Spanish,
   translated once at the data layer and stored, never translated in the
   shopper's phone (the Mountain Test).

   The memory: scripts/data/descriptions-es/<store>.json, one entry per
   distinct English text, keyed by descKey(english):

     { "<key>": "<Spanish text>", ... }

   Keyed by the English text, not the SKU, so the translation survives a
   feed refresh: a SKU whose copy did not change keeps its Spanish, and a
   rewritten description shows up as untranslated (the tests count it)
   instead of keeping a stale translation. The catalogue builders look
   each description up here and write the Spanish into `description`; the
   English stays as `description_en` for the record, and is never shown.
   ============================================================ */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const MEMORY_DIR = "scripts/data/descriptions-es";

export function normDesc(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function descKey(english) {
  return createHash("sha1").update(normDesc(english)).digest("hex").slice(0, 16);
}

const cache = new Map();
export function loadMemory(store) {
  if (!cache.has(store)) {
    const p = ROOT + MEMORY_DIR + "/" + store + ".json";
    cache.set(store, existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {});
  }
  return cache.get(store);
}

/* The stored Spanish for this English text, or null when it has not been
   translated yet. */
export function spanishFor(store, english) {
  const en = normDesc(english);
  if (!en) return null;
  const es = loadMemory(store)[descKey(en)];
  return es ? normDesc(es) : null;
}
