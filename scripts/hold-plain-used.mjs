#!/usr/bin/env node
/* ============================================================
   HOLD THE PLAIN USED LISTINGS OFF SALE (#443, Danny c.6526570723).

   WHY. The condition labels are final: Caja abierta, Reacondicionado,
   Usado certificado -- plain "usado" is banned. A plain used listing
   ("Pre-Owned LEGO Technic ...", "iPhone 13 ... (Preowned)") has no label
   it may honestly carry: calling it "Usado certificado" claims a
   certification the store never made, and showing it with no label sells
   a used phone as new (INDECOPI, Ley 29571 art. 11). So it is held.

   WHAT. Every row whose title /condition.js marks { held: true } is moved
   out of its catalogue (and out of the Ofertas feed) into held-used.json,
   with the file and the place it came from -- never deleted, restorable
   by hand the day a store certifies it. The write stages hold the same
   rows on the next pull (scripts/lib/walmart-write.js conditionOf).
   Idempotent: re-run after any catalogue or feed rebuild, then rebuild
   the slices and the search index.

   RUN: node scripts/hold-plain-used.mjs
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { conditionOfTitle } from "./lib/condition.js";
import { ofertasDeptTotal } from "./lib/ofertas-dept-total.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const HELD_FILE = "held-used.json";
const FEED_FILE = "ofertas-feed.json";

export const isHeld = (it) => {
  const c = conditionOfTitle(it && (it.name || it.title || it.productName));
  return Boolean(c && c.held);
};

/* The catalogues: every root JSON file shaped { retailers: { <key>: { departments } } }. */
export function catalogueFiles(root = ROOT) {
  return readdirSync(root).filter((f) => /\.json$/.test(f) && f !== HELD_FILE && f !== FEED_FILE).filter((f) => {
    try { const d = JSON.parse(readFileSync(root + f, "utf8")); return d && typeof d.retailers === "object" && !Array.isArray(d.retailers); }
    catch { return false; }
  });
}

/** Moves the held rows of one catalogue envelope; returns [{ file, retailer, dept, item }]. */
export function holdCatalogue(env, file) {
  const out = [];
  for (const [rkey, r] of Object.entries(env.retailers || {})) {
    for (const section of ["departments", "brands"]) {
      for (const [dkey, bucket] of Object.entries((r && r[section]) || {})) {
        const arr = Array.isArray(bucket) ? bucket : bucket && bucket.items;
        if (!Array.isArray(arr)) continue;
        const keep = [];
        for (const it of arr) (isHeld(it) ? out.push({ file, retailer: rkey, section, dept: dkey, item: it }) : keep.push(it));
        if (keep.length === arr.length) continue;
        if (Array.isArray(bucket)) r[section][dkey] = keep;
        else { bucket.items = keep; if (typeof bucket.count === "number") bucket.count = keep.length; }
      }
    }
  }
  /* A catalogue that declares its own count keeps it true. */
  if (out.length && typeof env.declaredProductCount === "number") env.declaredProductCount -= out.length;
  return out;
}

export function holdFeed(feed, root = ROOT) {
  const out = [], keep = [];
  for (const it of feed.items || []) (isHeld(it) ? out.push({ file: FEED_FILE, retailer: it.retailer, item: it }) : keep.push(it));
  if (!out.length) return out;
  feed.items = keep;
  feed.count = keep.length;
  if (feed.counts && typeof feed.counts === "object") {
    for (const h of out) if (feed.counts[h.retailer] > 0) feed.counts[h.retailer]--;
  }
  feed.deptTotal = ofertasDeptTotal(keep, root);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prior = existsSync(ROOT + HELD_FILE) ? JSON.parse(readFileSync(ROOT + HELD_FILE, "utf8")).items || [] : [];
  const held = [];
  for (const f of catalogueFiles()) {
    const env = JSON.parse(readFileSync(ROOT + f, "utf8"));
    const moved = holdCatalogue(env, f);
    if (!moved.length) continue;
    writeFileSync(ROOT + f, JSON.stringify(env));
    held.push(...moved);
  }
  const feed = JSON.parse(readFileSync(ROOT + FEED_FILE, "utf8"));
  const fromFeed = holdFeed(feed);
  if (fromFeed.length) { writeFileSync(ROOT + FEED_FILE, JSON.stringify(feed)); held.push(...fromFeed); }
  /* A row held on an earlier run stays on the list (its catalogue no longer has it). */
  const key = (h) => [h.file, h.retailer, h.item.name || h.item.title || "", h.item.url || ""].join("|");
  const all = new Map(prior.map((h) => [key(h), h]));
  for (const h of held) all.set(key(h), h);
  writeFileSync(ROOT + HELD_FILE, JSON.stringify({
    rule: "Plain used listings are held off sale: no honest condition label (#443 c.6526570723). Restore a row by moving it back to its file.",
    count: all.size, items: [...all.values()],
  }));
  const by = {};
  for (const h of held) by[h.file] = (by[h.file] || 0) + 1;
  console.log(`held ${held.length} this run (${all.size} in ${HELD_FILE})`, by);
}
