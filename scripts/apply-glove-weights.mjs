#!/usr/bin/env node
/* ============================================================
   COMBAT GLOVES, STAMPED FLAT BY THE PAIR (#443 c.6648881889, corrected
   by c.6648728121 -- Danny's flat billing rule).

   Every boxing glove pair listing in the committed catalogues gets
   weightKg 1.00, every MMA glove pair 0.50, decided by one rule
   (scripts/lib/glove-weights.js). Only the weight fields change:
   weightKg, weightEstimated (true: billed, not a published scale
   reading), weightBasis "gloveFlat", and specWeightKg -- the legacy
   alias of the catalogue weight -- where the record has one. Each catalogue is written back
   in its own JSON style. Running it again changes nothing.

   SHIN GUARDS (#443 c.6649706410): only the 2 records the audit proved
   carry a single guard's weight are doubled -- Gorilla Wear's shin
   guards at 0.33 kg, to 0.66 kg (a pair is both pieces), marked
   weightEstimated and weightBasis "pairDoubled". They are found by
   store, a shin-guard title and that exact figure, and the sweep
   refuses to run if it finds any other number than 2. The shin-guard
   records on the unverified 0.50 stamp are NOT doubled (if 0.50 is
   already the pair, doubling overcharges): they are listed, flagged.

   OUT OF SCOPE, untouched: every other listing -- the null-weight
   products and the estimate-flagged weights are the separate
   inferred-weight-class work.

     node scripts/apply-glove-weights.mjs            write, and report
     node scripts/apply-glove-weights.mjs --dry-run  report only

   Writes reports/glove-weights-2026-11-05.json: every listing (store,
   title, id, class, before and after kg, freight delta at $13/kg),
   counts per store and per class, how many were already at or above the
   flat value, the reconciliation against the audit's counts, the
   excluded near-misses with their reason, and the shin-guard candidates.

   "Before" is two numbers: the catalogue's own figure (often none) and
   the weight the resolver quoted at checkout before this rule
   (resolveItemWeight with the glove rule off). The freight delta is
   against the quoted one: that is what the customer was charged. A
   re-run keeps the first run's "before" for every listing it already
   reported, so the report stays the record of the change.

   REGENERATE AFTER (the generated files carry the weight):
     node scripts/build-pdp-slices.mjs
     node scripts/build-ofertas-feed.mjs && node scripts/build-ofertas-lite.mjs && node scripts/build-ofertas-slices.mjs
     node scripts/build-home-shelves.mjs
   ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { gloveClass, gloveClassOfTitle, GLOVE_FLAT_KG, GLOVE_BASIS, EDGE_CASES } from "./lib/glove-weights.js";
import { serializerFor } from "./lib/gallery-backfill.js";
import { resolveItemWeight } from "../netlify/functions/_weight-resolve.js";
import { CHARGE_PER_KG } from "../weight-data.js";
import { liftPage, sourceFiles } from "./build-pdp-slices.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const REPORT = "reports/glove-weights-2026-11-05.json";
/* The audit's figures (#443 c.6648881889), for the reconciliation. */
export const AUDIT = Object.freeze({ boxing: { listings: 434, under: 413 }, mma: { listings: 45, under: 39 }, stampSet: 452 });
const PDP_LINE_KG = 0.2; // producto.html's line placeholder when the record has no weight

const round2 = (n) => Math.round(n * 100) / 100;
/* A catalogue written in Python's style keeps numbers like 30.0 as their
   own text (gallery-backfill parseKeepingNumbers): read them as numbers. */
const numOf = (v) => (v && typeof v === "object" && "text" in v ? Number(v.text) : v == null ? NaN : Number(v));

/** The shared product-type classifier, loaded the way the build scripts load it. */
export function loadProductType(root = ROOT) {
  const win = {};
  vm.runInNewContext(readFileSync(join(root, "product-type.js"), "utf8"), { window: win });
  return win.AriaProductType;
}

/** Every record of a catalogue, with the store key and the bucket it sits in. */
export function* recordsOf(catalog) {
  for (const [store, r] of Object.entries((catalog && catalog.retailers) || {}))
    for (const section of ["departments", "brands"])
      for (const [bucket, b] of Object.entries((r && r[section]) || {})) {
        const arr = Array.isArray(b) ? b : (b && Array.isArray(b.items) ? b.items : []);
        for (let i = 0; i < arr.length; i++) if (arr[i] && typeof arr[i] === "object") yield { store, path: `${section}.${bucket}[${i}]`, rec: arr[i] };
      }
}

export const catalogFiles = (root = ROOT) => readdirSync(root).filter((f) => /catalog.*\.json$|^department-cache-.*\.json$/.test(f)).sort();
const titleOf = (rec) => String(rec.title ?? rec.name ?? "");
const idOf = (rec) => String(rec.sku ?? rec.id ?? rec.productId ?? rec.url ?? titleOf(rec));
/** One listing = one store's product; the same record filed under a department and a brand is one listing. */
const listingKey = (store, rec) => store + "|" + String(rec.url || idOf(rec) || titleOf(rec)).toLowerCase();

/* What checkout quoted for this listing before the rule: the line the
   product page sends (producto.html weightLineOf), resolved with the glove
   rule switched off. */
function quotedBeforeKg(store, rec) {
  const priceUsd = numOf(rec.price ?? rec.priceUsd) || undefined;
  const kg = numOf(rec.weightKg);
  const line = { title: titleOf(rec), retailer: rec.retailer || store, priceUsd, weightKg: kg > 0 ? kg : PDP_LINE_KG, weightEstimated: kg > 0 ? rec.weightEstimated !== false : true, qty: 1 };
  if (numOf(rec.specWeightKg) > 0) line.specWeightKg = numOf(rec.specWeightKg);
  const r = resolveItemWeight(line, { gloveFlat: false });
  return { kg: r.weightKg, source: r.source, needsReview: !!r.needsReview };
}

/* The audit's proven single-guard records (#443 c.6649706410). */
export const SHIN_DOUBLE = Object.freeze({ store: "gorillawear", fromKg: 0.33, toKg: 0.66, basis: "pairDoubled", count: 2 });
export const SHIN_UNVERIFIED_KG = 0.5;
const SHIN_RX = /\bshin\s*-?\s*(?:guards?|pads?|instep|protectors?)\b|\bshinguards?\b|\bcanilleras?\b|\bespinilleras?\b/i;
const SHIN_TYPE_RX = /shin/i;

export function sweep(root = ROOT, { write = false } = {}) {
  const PT = loadProductType(root);
  const served = new Set(sourceFiles(liftPage(root)).map((f) => f.replace(/^\//, "")));
  const prior = new Map();
  if (existsSync(join(root, REPORT))) {
    const old = JSON.parse(readFileSync(join(root, REPORT), "utf8"));
    for (const l of old.listings || []) prior.set(l.key, l);
    for (const d of (old.shinGuards && old.shinGuards.doubled) || []) prior.set(d.key, d);
  }
  const listings = new Map(), files = [], nearMiss = new Map(), shins = new Map();
  let recordsStamped = 0, recordsMatched = 0;
  const shinDoubled = [];
  for (const f of catalogFiles(root)) {
    const text = readFileSync(join(root, f), "utf8");
    if (!/glove|guante|mitt|shin|canillera|espinillera/i.test(text)) continue;
    const ser = serializerFor(text);
    const catalog = ser && ser.parse ? ser.parse(text) : JSON.parse(text);
    let changed = 0;
    for (const { store, path, rec } of recordsOf(catalog)) {
      const title = titleOf(rec);
      const item = { title, type: rec.type, brand: rec.brand, retailer: rec.retailer || store };
      const g = gloveClass(item, { productType: PT });
      const key = listingKey(store, rec);
      if (!g.cls && store === SHIN_DOUBLE.store && SHIN_RX.test(title)
        && (numOf(rec.weightKg) === SHIN_DOUBLE.fromKg || (rec.weightBasis === SHIN_DOUBLE.basis && numOf(rec.weightKg) === SHIN_DOUBLE.toKg))) {
        const was = numOf(rec.weightKg);
        if (rec.weightBasis !== SHIN_DOUBLE.basis) {
          rec.weightKg = SHIN_DOUBLE.toKg; rec.weightEstimated = true; rec.weightBasis = SHIN_DOUBLE.basis;
          if (rec.specWeightKg != null) rec.specWeightKg = SHIN_DOUBLE.toKg;
          changed++; recordsStamped++;
        }
        const p = prior.get("shin|" + key);
        shinDoubled.push({ key: "shin|" + key, store, title, id: idOf(rec), file: f, path, served: served.has(f),
          beforeKg: p ? p.beforeKg : was === SHIN_DOUBLE.toKg && rec.weightBasis === SHIN_DOUBLE.basis && !p ? SHIN_DOUBLE.fromKg : was,
          afterKg: SHIN_DOUBLE.toKg, freightDeltaUsd: round2((SHIN_DOUBLE.toKg - SHIN_DOUBLE.fromKg) * CHARGE_PER_KG) });
        continue;
      }
      if (!g.cls) {
        /* Near misses: names a glove and a combat word, or the store files it as a combat glove. */
        if (/\b(gloves?|guantes?)\b|\bmitts?\b/i.test(title)
          && /\b(box(?:ing|eo)|muay|kick\s*box|mma|sparring|grappl|fight|hybrid|bag\s*mitt|focus|wraps?)\b/i.test(title + " " + (rec.type || ""))
          && !nearMiss.has(key)) {
          nearMiss.set(key, { store, title, id: idOf(rec), type: rec.type ?? null, file: f, reason: g.reason, vetoedBy: g.vetoedBy, kg: Number.isFinite(numOf(rec.weightKg)) ? numOf(rec.weightKg) : null });
        }
        if ((SHIN_RX.test(title) || SHIN_TYPE_RX.test(String(rec.type || ""))) && shins.has(key)) shins.get(key).records++;
        else if (SHIN_RX.test(title) || SHIN_TYPE_RX.test(String(rec.type || ""))) {
          shins.set(key, { store, title, id: idOf(rec), type: rec.type ?? null, file: f, served: served.has(f), kg: Number.isFinite(numOf(rec.weightKg)) ? numOf(rec.weightKg) : null,
            weightEstimated: rec.weightEstimated ?? null, sizes: (rec.availableSizes || rec.sizes || []).slice(0, 12), records: 1 });
        }
        continue;
      }
      recordsMatched++;
      const flat = GLOVE_FLAT_KG[g.cls];
      /* The catalogue's figure: weightKg, else its legacy alias specWeightKg
         (the field the resolver's catalogue branch reads -- where the
         audit's 0.02 for YOKKAO and Fairtex comes from). */
      const catalogBefore = Number.isFinite(numOf(rec.weightKg)) ? numOf(rec.weightKg)
        : Number.isFinite(numOf(rec.specWeightKg)) && numOf(rec.specWeightKg) > 0 ? numOf(rec.specWeightKg) : null;
      if (!listings.has(key)) {
        const was = prior.get(key);
        const q = was ? { kg: was.quotedBeforeKg, source: was.quotedBeforeSource } : quotedBeforeKg(store, rec);
        const cBefore = was ? was.catalogBeforeKg : catalogBefore;
        listings.set(key, {
          key, store, title, id: idOf(rec), url: rec.url || null, served: false, servedFiles: [], paths: [],
          class: g.cls, storeType: rec.type ?? null,
          catalogBeforeKg: cBefore, catalogBeforeField: was ? was.catalogBeforeField : (Number.isFinite(numOf(rec.weightKg)) ? "weightKg" : cBefore != null ? "specWeightKg" : null),
          quotedBeforeKg: q.kg, quotedBeforeSource: q.source,
          afterKg: flat,
          freightBeforeUsd: round2(q.kg * CHARGE_PER_KG), freightAfterUsd: round2(flat * CHARGE_PER_KG),
          freightDeltaUsd: round2((flat - q.kg) * CHARGE_PER_KG),
          catalogDeltaKg: cBefore == null ? null : round2(flat - cBefore),
          alreadyAtFlat: { quoted: q.kg >= flat, catalog: cBefore != null && cBefore >= flat },
        });
      }
      const L = listings.get(key);
      L.paths.push(f + ":" + path);
      if (served.has(f)) { L.served = true; if (!L.servedFiles.includes(f)) L.servedFiles.push(f); }
      const hasSpec = rec.specWeightKg !== undefined && rec.specWeightKg !== null;
      const before = JSON.stringify([numOf(rec.weightKg), rec.weightEstimated, rec.weightBasis, hasSpec ? numOf(rec.specWeightKg) : null]);
      rec.weightKg = flat;
      rec.weightEstimated = true;
      rec.weightBasis = GLOVE_BASIS;
      /* The legacy alias says the same number, never a contradicting one. */
      if (hasSpec) rec.specWeightKg = flat;
      if (JSON.stringify([rec.weightKg, rec.weightEstimated, rec.weightBasis, hasSpec ? rec.specWeightKg : null]) !== before) { changed++; recordsStamped++; }
    }
    if (changed) {
      files.push({ file: f, recordsChanged: changed });
      if (write) {
        if (!ser) throw new Error(`${f}: cannot reproduce its JSON style; refusing to rewrite it`);
        writeFileSync(join(root, f), ser(catalog));
      }
    }
  }

  if (shinDoubled.length !== SHIN_DOUBLE.count) throw new Error(`shin guards: expected ${SHIN_DOUBLE.count} Gorilla Wear single-guard records, found ${shinDoubled.length}; refusing to guess`);
  for (const d of shinDoubled) prior.set(d.key, d);
  const all = [...listings.values()].sort((a, b) => a.class.localeCompare(b.class) || a.store.localeCompare(b.store) || a.title.localeCompare(b.title));
  const tally = (rows) => {
    const t = { listings: rows.length, records: rows.reduce((s, r) => s + r.paths.length, 0),
      underFlatQuoted: rows.filter((r) => !r.alreadyAtFlat.quoted).length,
      atOrAboveFlatQuoted: rows.filter((r) => r.alreadyAtFlat.quoted).length,
      catalogNull: rows.filter((r) => r.catalogBeforeKg == null).length,
      underFlatCatalog: rows.filter((r) => r.catalogBeforeKg != null && !r.alreadyAtFlat.catalog).length,
      atOrAboveFlatCatalog: rows.filter((r) => r.alreadyAtFlat.catalog).length,
      freightDeltaUsd: round2(rows.reduce((s, r) => s + r.freightDeltaUsd, 0)),
      kgDeltaQuoted: round2(rows.reduce((s, r) => s + (r.afterKg - r.quotedBeforeKg), 0)) };
    return t;
  };
  const byClass = {}, byStore = {};
  for (const cls of ["boxing", "mma"]) byClass[cls] = { flatKg: GLOVE_FLAT_KG[cls], served: tally(all.filter((r) => r.class === cls && r.served)), allFiles: tally(all.filter((r) => r.class === cls)) };
  for (const r of all) ((byStore[r.store] ||= { boxing: [], mma: [] })[r.class]).push(r);
  for (const s of Object.keys(byStore)) byStore[s] = { boxing: tally(byStore[s].boxing), mma: tally(byStore[s].mma), served: byStore[s].boxing.concat(byStore[s].mma).some((r) => r.served) };

  const servedRows = all.filter((r) => r.served);
  const report = {
    generatedBy: "scripts/apply-glove-weights.mjs",
    rule: { source: "#443 c.6648881889, corrected by c.6648728121", boxingKg: GLOVE_FLAT_KG.boxing, mmaKg: GLOVE_FLAT_KG.mma, basis: GLOVE_BASIS, chargePerKgUsd: CHARGE_PER_KG, classifier: "scripts/lib/glove-weights.js" },
    totals: {
      listings: all.length, servedListings: servedRows.length, recordsMatched, recordsStampedThisRun: recordsStamped,
      stampSetServed: servedRows.filter((r) => !r.alreadyAtFlat.quoted).length,
      freightDeltaUsdServed: round2(servedRows.reduce((s, r) => s + r.freightDeltaUsd, 0)),
      kgDeltaServed: round2(servedRows.reduce((s, r) => s + (r.afterKg - r.quotedBeforeKg), 0)),
    },
    byClass, byStore,
    reconciliation: {
      audit: AUDIT,
      repo: { boxing: { listings: byClass.boxing.served.listings, under: byClass.boxing.served.underFlatQuoted },
        mma: { listings: byClass.mma.served.listings, under: byClass.mma.served.underFlatQuoted },
        stampSet: servedRows.filter((r) => !r.alreadyAtFlat.quoted).length,
        rawRecordsAllFiles: { boxing: byClass.boxing.allFiles.records, mma: byClass.mma.allFiles.records } },
      note: "The audit's per-listing tables (weight-audit-2026-11-04.md) are not in the repo, so the set was rebuilt from the committed catalogues by rule. 'listings' counts one per store product (a record filed under both a department and a brand bucket is one listing) in the catalogues the site serves; 'rawRecordsAllFiles' counts every record in every catalogue file, duplicates and the unserved mma-catalog.json included.",
    },
    files,
    listings: all,
    excludedNearMisses: [...nearMiss.values()].sort((a, b) => a.reason.localeCompare(b.reason) || a.store.localeCompare(b.store)),
    edgeCases: EDGE_CASES.map(([title, cls, why]) => ({ title, class: cls, why, ruleAnswer: gloveClassOfTitle(title).cls })),
    shinGuards: {
      rule: "#443 c.6649706410: only the 2 records the audit proved are single-guard weights (Gorilla Wear, 0.33 kg) are doubled to 0.66 kg; the records on the unverified 0.50 stamp are not doubled, they are flagged below.",
      doubled: shinDoubled,
      unverifiedHalfKgStamp: [...shins.values()].filter((x) => x.kg === SHIN_UNVERIFIED_KG),
      unverifiedHalfKgRecords: [...shins.values()].filter((x) => x.kg === SHIN_UNVERIFIED_KG).reduce((n, x) => n + x.records, 0),
      otherShinGuards: [...shins.values()].filter((x) => x.kg !== SHIN_UNVERIFIED_KG).sort((a, b) => (a.kg ?? 99) - (b.kg ?? 99) || a.store.localeCompare(b.store)),
    },
  };
  if (write) {
    mkdirSync(join(root, "reports"), { recursive: true });
    writeFileSync(join(root, REPORT), JSON.stringify(report, null, 1) + "\n");
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes("--dry-run");
  const r = sweep(ROOT, { write: !dryRun });
  const c = r.byClass;
  console.log(`glove pairs: ${r.totals.listings} listings (${r.totals.servedListings} served), ${r.totals.recordsMatched} records; stamped this run ${r.totals.recordsStampedThisRun}`);
  for (const cls of ["boxing", "mma"]) console.log(`  ${cls.padEnd(6)} ${c[cls].flatKg.toFixed(2)} kg  served ${c[cls].served.listings} listings, ${c[cls].served.underFlatQuoted} quoted under, ${c[cls].served.atOrAboveFlatQuoted} already at/above; freight +$${c[cls].served.freightDeltaUsd}`);
  console.log(`  stamp set (served, quoted under the flat value): ${r.totals.stampSetServed}; audit said ${AUDIT.stampSet}`);
  console.log(`  shin guards doubled 0.33 -> 0.66: ${r.shinGuards.doubled.map((d) => d.store + " " + d.title).join("; ")}`);
  console.log(`  shin guards on the unverified 0.50 stamp (flagged, unchanged): ${r.shinGuards.unverifiedHalfKgStamp.length} listings, ${r.shinGuards.unverifiedHalfKgRecords} records; other shin guards: ${r.shinGuards.otherShinGuards.length}`);
  console.log(`  near misses left as they are: ${r.excludedNearMisses.length}`);
  console.log((dryRun ? "would write: " : "wrote: ") + (r.files.map((f) => `${f.file} (${f.recordsChanged})`).join(", ") || "nothing (already stamped)"));
}
