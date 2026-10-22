/* ============================================================
   PULL QUALITY — THE INGEST REPORT EVERY CATALOGUE PULL PRINTS, AND
   THE SHIP / DO NOT SHIP LINE (#443, binding on DSW and Neiman Marcus).

   One pass, complete capture: full galleries, Spanish 1-2 sentence
   descriptions at ingest, real weights and dimensions where the source
   has them, checksum-valid GTIN per variant, size runs exactly as
   scraped (sibling inference flagged), brand, materials/specs.

   Pure functions: the builders (scripts/build-dsw-catalog.mjs,
   scripts/build-neimanmarcus-catalog.mjs) pass the catalogue envelope
   and print formatReport(); the tests pin the thresholds and verdict.

   THE THRESHOLDS (share of PUBLISHED products; sizes: of products in a
   sized department). A coverage below its minimum is a HOLE. A hole is
   either EXPLAINED (the operator passes --explain <metric>="<reason>",
   or the builder knows a later step fills it, e.g. the weight estimator
   at write) or it is not, and any unexplained hole makes the verdict
   DO NOT SHIP.
     gallery   >1 real product photo (size charts and duplicates not
               counted)                                   min 80%
     es        Spanish description present                min 95%
     weight    weight known: published, or the site's estimator's
               value flagged weightEstimated              min 100%
               (published-only share printed beside it)
     gtin      checksum-valid GTIN, product or per size   min 50%
     sizeRun   size run as scraped, in sized departments  min 90%
               (sibling-inferred runs printed apart, not counted)
     brand     brand stated                               min 95%
   ============================================================ */
/* The Spanish test translate-catalog-descriptions.mjs --strict uses
   (imported from it, so the report and the translator never disagree):
   positive Spanish evidence, not merely "not caught as English". */
import { looksSpanish } from "../translate-catalog-descriptions.mjs";

export const THRESHOLDS = {
  gallery: 0.8,
  es: 0.95,
  weight: 1.0,
  gtin: 0.5,
  sizeRun: 0.9,
  brand: 0.95,
};

export const METRIC_LABELS = {
  gallery: "gallery (>1 real photo)",
  es: "ES description",
  weight: "weight (published or flagged estimate)",
  gtin: "GTIN (checksum-valid)",
  sizeRun: "size run (as scraped)",
  brand: "brand",
};

/* Departments whose products are sold by size. */
export const SIZED_BUCKETS = new Set(["women", "men", "kids", "footwear", "clothing"]);


export function isSpanishDescription(d) {
  return typeof d === "string" && looksSpanish(d);
}

/** Real product photos in an ingested item's gallery. */
export function realPhotoCount(it) {
  const imgs = Array.isArray(it.images) ? it.images : (it.image ? [it.image] : []);
  return Math.max(0, imgs.length - (Number(it.sizeChartImages) || 0));
}

const pct = (a, b) => (b ? a / b : 0);

/**
 * Coverage over a catalogue envelope (retailers.<key>.departments).
 * Returns { rows, published, counts, shares, sized, ... }.
 */
export function coverageOf(catalog, retailerKey, { rows = null } = {}) {
  const r = catalog && catalog.retailers && catalog.retailers[retailerKey];
  const depts = (r && r.departments) || {};
  const c = { gallery: 0, es: 0, realWeight: 0, weightKnown: 0, gtin: 0, gtinVariant: 0, sized: 0, sizeRun: 0, sizeInferred: 0, brand: 0, dimensions: 0, specs: 0, materials: 0, described: 0, sizeCharts: 0 };
  let published = 0;
  for (const [bucket, d] of Object.entries(depts)) {
    for (const it of (d && d.items) || []) {
      published++;
      if (realPhotoCount(it) > 1) c.gallery++;
      if (it.sizeChartImages) c.sizeCharts++;
      if (it.description) c.described++;
      if (isSpanishDescription(it.description)) c.es++;
      if (it.weightEstimated === false && it.weightKg > 0) c.realWeight++;
      if (it.weightKg > 0) c.weightKnown++;
      if (it.gtin || (it.variantGtins && Object.keys(it.variantGtins).length)) c.gtin++;
      if (it.variantGtins && Object.keys(it.variantGtins).length) c.gtinVariant++;
      if (it.brand) c.brand++;
      if (it.dimensions) c.dimensions++;
      if (Array.isArray(it.specifications) && it.specifications.length) c.specs++;
      if (Array.isArray(it.specifications) && it.specifications.some((s) => /material|fabric|upper|lining|sole/i.test(s.name))) c.materials++;
      if (SIZED_BUCKETS.has(bucket)) {
        c.sized++;
        if (it.sizeInferred) c.sizeInferred++;
        else if (Array.isArray(it.availableSizes) && it.availableSizes.length) c.sizeRun++;
      }
    }
  }
  const shares = {
    gallery: pct(c.gallery, published),
    es: pct(c.es, published),
    weight: pct(c.weightKnown, published),
    realWeight: pct(c.realWeight, published),
    gtin: pct(c.gtin, published),
    sizeRun: c.sized ? pct(c.sizeRun, c.sized) : 1,
    brand: pct(c.brand, published),
    dimensions: pct(c.dimensions, published),
    specs: pct(c.specs, published),
    materials: pct(c.materials, published),
  };
  return { rows: rows == null ? published : rows, published, counts: c, shares };
}

/**
 * The verdict. `explain` is { metric: reason } (operator --explain, or
 * the builder's own "a later step fills this"). SHIP only when every
 * metric is at its minimum or its hole is explained, and something was
 * published at all.
 */
export function verdictOf(cov, { explain = {}, thresholds = THRESHOLDS } = {}) {
  const checks = Object.keys(thresholds).map((m) => {
    const share = cov.shares[m];
    const ok = share + 1e-9 >= thresholds[m];
    const why = !ok && explain[m] ? String(explain[m]) : null;
    return { metric: m, share, min: thresholds[m], ok, explained: why };
  });
  const holes = checks.filter((x) => !x.ok && !x.explained).map((x) => x.metric);
  const empty = !cov.published;
  return { checks, holes, ship: !empty && holes.length === 0, empty };
}

const fmt = (x) => (100 * x).toFixed(1) + "%";

/** The INGEST REPORT block. Plain text; the last line is the verdict. */
export function formatReport(label, cov, verdict, { notes = [] } = {}) {
  const c = cov.counts;
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push(`  INGEST REPORT — ${label}`);
  out.push("  ====================================================");
  out.push(`  rows: ${cov.rows.toLocaleString("en-US")} scraped, ${cov.published.toLocaleString("en-US")} published`);
  for (const ch of verdict.checks) {
    const n = { gallery: c.gallery, es: c.es, weight: c.weightKnown, gtin: c.gtin, sizeRun: c.sizeRun, brand: c.brand }[ch.metric];
    const of = ch.metric === "sizeRun" ? c.sized : cov.published;
    const state = ch.ok ? "ok" : ch.explained ? `HOLE, explained: ${ch.explained}` : "HOLE";
    out.push(`  ${METRIC_LABELS[ch.metric].padEnd(40)} ${fmt(ch.share).padStart(6)}  (${n}/${of}; min ${fmt(ch.min)})  ${state}`);
  }
  out.push(`  weight published by the source           ${fmt(cov.shares.realWeight).padStart(6)}  (${c.realWeight}/${cov.published}; the rest are the site's estimate, flagged weightEstimated)`);
  out.push(`  GTIN per variant (size)                  ${fmt(cov.published ? c.gtinVariant / cov.published : 0).padStart(6)}  (${c.gtinVariant}/${cov.published})`);
  out.push(`  sibling-inferred size runs (flagged)     ${String(c.sizeInferred).padStart(6)}  (not counted as scraped)`);
  out.push(`  dimensions ${fmt(cov.shares.dimensions)}, spec table ${fmt(cov.shares.specs)}, materials ${fmt(cov.shares.materials)}, size charts moved last ${c.sizeCharts}`);
  for (const n of notes) out.push(`  NOTE: ${n}`);
  out.push("  ----------------------------------------------------");
  if (verdict.empty) out.push("  VERDICT: DO NOT SHIP -- nothing was published");
  else if (verdict.ship) out.push("  VERDICT: SHIP -- every coverage line is at its minimum or explained");
  else out.push(`  VERDICT: DO NOT SHIP -- unexplained coverage holes: ${verdict.holes.join(", ")} (fix, or --explain <metric>="<reason>")`);
  out.push("  ====================================================");
  return out.join("\n");
}

/** --explain gtin="DSW listing pages publish no GTIN" -> { gtin: "..." } */
export function parseExplain(list) {
  const out = {};
  for (const s of list || []) {
    const m = /^([a-zA-Z]+)\s*=\s*(.+)$/.exec(String(s));
    if (!m || !(m[1] in THRESHOLDS)) throw new Error(`--explain wants <metric>="<reason>" with metric one of ${Object.keys(THRESHOLDS).join(", ")}`);
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
