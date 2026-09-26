/* ============================================================
   EXTENDED SIZES — the retailer's own size list, nothing else.

   CURVY (2026-09-24) is a filter over apparel on the size run the
   retailer itself publishes: an item belongs when the retailer's own
   availableSizes names an extended size. A shopper who wears a 2X is
   underserved everywhere in Peru; the way to insult her is to fill a
   page with "Plus Size" in the product name and let her find out at
   checkout. So this reads availableSizes and nothing else — never the
   title, never an invented run.

   KOHL'S (2026-09-26). The pull titles its range "Plus Size" but
   publishes no per-size list; the normalizer carries the retailer's
   own label in availableSizes (never an invented 1X/2X run), and
   'plus size' is in the set below — every XL+ garment renders, per
   Danny's rule.

   MIRROR: index.html carries a verbatim copy inside the
   DEPARTMENT_CHAIN slice (the page is a plain <script> and cannot
   import). Change one, change the other; a parity test compares them
   over the real catalogues.
   ============================================================ */

export const EXTENDED_SIZES = new Set([
  "xxl", "2xl", "xxxl", "3xl", "xxxxl", "4xl", "xxxxxl", "5xl",
  "1x", "2x", "3x", "4x", "5x", "6x",
  "plus size",
]);

/* The retailer's own list, or empty. Never derived from anything else. */
export function retailerSizesOf(item) {
  const raw = item?.availableSizes;
  return Array.isArray(raw) ? raw.filter((s) => typeof s === "string" && s.trim()) : [];
}

export function extendedSizesOf(item) {
  return retailerSizesOf(item).filter((s) => EXTENDED_SIZES.has(s.trim().toLowerCase()));
}

export function hasExtendedSizes(item) {
  return extendedSizesOf(item).length > 0;
}
