#!/usr/bin/env node
/* ============================================================
   NO IMAGE, NO CARD -- THE BUILD-TIME HALF (#443 c.6547325227).

   WHY. The homepage Diseñadores Latinos rail showed the Ancora
   "Swimming Up Trunk" as the ARIA / "Foto en camino" placeholder: its
   stored lead photo (M164-FRONT.webp) had gone 404 at the source while
   the product itself was still for sale with new photos. A card with a
   placeholder, a price and a buy button is what the rule forbids.

   WHAT. scripts/data/dead-images.json lists photo URLs that a check
   found dead at the source (each with its status, date and where the
   check is recorded). This sweep walks every catalogue
   (*-catalog.json, department-cache*.json) and, for every record:
     - drops every listed URL from images[] / thumbnail;
     - a record whose LEAD photo is listed falls back to its next live
       photo (counted as "fixed");
     - a record left with no photo at all is held: image/images
       cleared, the old lead kept as heldImage, photoHeld:
       "dead-at-source" -- every builder's own no-photo rule then leaves
       it out of every slice, rail and the search index ("suppressed").
   A URL is matched without its query string (?v= cache busters), so a
   dead file is dead at any version. Idempotent: a second run changes
   nothing. Re-run the slice builders after it changes anything.

   The client half lives in the pages: a card whose photo still fails
   in the shopper's browser tries its next photo and, if none loads,
   leaves the rail (cardPhotoFallback in the app bundle,
   ariaPhotoRescue in assets/js/card-photos.js).

   RUN:   node scripts/sweep-dead-images.mjs           (writes)
          node scripts/sweep-dead-images.mjs --check   (exit 1 if any catalogue still needs it)
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const DEAD_LIST = "scripts/data/dead-images.json";

export function deadKey(u) {
  return String(u || "").trim().replace(/[?#].*$/, "").toLowerCase();
}
export function loadDeadSet(root = ROOT) {
  const d = JSON.parse(readFileSync(root + DEAD_LIST, "utf8"));
  return new Set((d.dead || []).map((e) => deadKey(e.url)).filter(Boolean));
}
export function catalogueFiles(root = ROOT) {
  return readdirSync(root).filter((f) => /^(.+-catalog|department-cache.*)\.json$/.test(f)).sort();
}

/* One record. Returns "fixed", "suppressed", "cleaned" or null. */
export function sweepItem(it, dead) {
  if (!it || typeof it !== "object") return null;
  const isDead = (u) => typeof u === "string" && dead.has(deadKey(u));
  const lead = it.image || it.imageUrl || it.thumbnail || (Array.isArray(it.images) ? it.images[0] : null);
  const imgs = Array.isArray(it.images) ? it.images : [];
  const touched = isDead(it.image) || isDead(it.imageUrl) || isDead(it.thumbnail) || imgs.some(isDead);
  if (!touched) return null;
  const live = [];
  for (const u of [it.image, it.imageUrl, ...imgs]) {
    if (typeof u === "string" && u && !isDead(u) && !live.includes(u)) live.push(u);
  }
  if (Array.isArray(it.images)) it.images = it.images.filter((u) => !isDead(u));
  if (isDead(it.thumbnail)) it.thumbnail = live[0] || null;
  if (isDead(it.imageUrl)) it.imageUrl = live[0] || null;
  if (!live.length) {
    it.heldImage = lead;
    it.image = null;
    it.images = [];
    if ("thumbnail" in it) it.thumbnail = null;
    if ("imageUrl" in it) it.imageUrl = null;
    it.photoHeld = "dead-at-source";
    return "suppressed";
  }
  if (isDead(it.image) || !it.image) {
    it.image = live[0];
    if (Array.isArray(it.images) && it.images[0] !== live[0]) it.images = [live[0], ...it.images.filter((u) => u !== live[0])];
    return "fixed";
  }
  return "cleaned";
}

export function sweepCatalogue(env, dead) {
  const counts = { fixed: 0, suppressed: 0, cleaned: 0, rows: [] };
  for (const [key, r] of Object.entries((env && env.retailers) || {})) {
    for (const dept of Object.values((r && r.departments) || {})) {
      const list = Array.isArray(dept) ? dept : (dept && dept.items) || [];
      for (const it of list) {
        const res = sweepItem(it, dead);
        if (res) { counts[res]++; counts.rows.push(`${res}  ${key}  ${it.name || it.title || ""}`); }
      }
    }
  }
  return counts;
}

function main() {
  const check = process.argv.includes("--check");
  const dead = loadDeadSet();
  const total = { fixed: 0, suppressed: 0, cleaned: 0 };
  for (const f of catalogueFiles()) {
    const text = readFileSync(ROOT + f, "utf8");
    let env;
    try { env = JSON.parse(text); } catch (e) { continue; }
    const c = sweepCatalogue(env, dead);
    if (!c.rows.length) continue;
    for (const row of c.rows) console.log(`${f}  ${row}`);
    total.fixed += c.fixed; total.suppressed += c.suppressed; total.cleaned += c.cleaned;
    if (!check) writeFileSync(ROOT + f, /^\{\s*\n/.test(text) ? JSON.stringify(env, null, 2) + (text.endsWith("\n") ? "\n" : "") : JSON.stringify(env));
  }
  console.log(`dead photos listed: ${dead.size}; fixed (fell back to next photo): ${total.fixed}; suppressed (no live photo): ${total.suppressed}; extra photo dropped: ${total.cleaned}`);
  if (check && total.fixed + total.suppressed + total.cleaned) process.exit(1);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
