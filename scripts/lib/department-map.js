// Category-driven department mapping.
//
// THE BUG THIS REPLACES
// A retailer appeared in a department only if department-cache.json held a
// bucket literally keyed by that department's name. That is tag-based, and
// the tags were incomplete: Walmart and Target had no bucket called
// "women", so Moda Mujer listed only Foot Locker and Old Navy even though
// both generalists sell women's clothes. Every new department needed every
// retailer re-tagged by hand, and anything missed silently disappeared
// from that page.
//
// THE MODEL NOW
// A department is defined by the PRODUCT CATEGORY it contains (and, for
// fashion, a gender). A scraped bucket declares which category it holds.
// A retailer therefore appears in a department when its inventory actually
// contains items of that category — derived, never tagged. Adding a new
// department requires no per-retailer work at all: whoever carries the
// category shows up.
//
// Gendered departments are the interesting case. An item's gender comes
// from whichever is more trustworthy:
//   * the bucket, when the scrape itself was gendered (Old Navy's "women"
//     bucket is a real gender facet, so trust it even for titles like
//     "EveryWear Crew-Neck T-Shirt" that name no gender)
//   * otherwise the title's own marker ("Men's Relaxed Fit Jeans")
// An item from a non-gendered bucket with no marker in its title is NOT
// assigned a gender — it stays in Ropa rather than being guessed into all
// three gendered pages at once.

// A department = one product category, optionally narrowed to a gender.
export const DEPARTMENT_SPEC = {
  electronics:     { category: "electronics" },
  clothing:        { category: "apparel" },
  men:             { category: "apparel", gender: "men" },
  women:           { category: "apparel", gender: "women" },
  kids:            { category: "apparel", gender: "kids" },
  candy_chocolate: { category: "grocery" },
  sporting_goods:  { category: "sporting" },
  home_goods:      { category: "home" },
  /* NO PHARMACY. Vitamins and supplements need a DIGEMID import permit
     that we do not hold, so the department is off the site entirely --
     see RESTRICTED_DEPARTMENTS in index.html, which drops the bucket at
     the load boundary even if one reaches a cache again. Nothing routes
     a scrape at it from here either (scripts/lib/catalog-quotas.js). */
  /* BEAUTY (2026-09-20). No retailer supplies a beauty bucket yet —
     Sephora and Victoria's Secret are real stores whose scrapers are
     still being wired up (see scripts/lib/retailers.js). A department no
     retailer carries gets no tile at all, so this costs nothing today and
     means the tile appears by itself the moment the first beauty bucket
     lands, with no second change. */
  beauty:          { category: "beauty" },
  // Not a category — a state any item can be in. This is why Walmart and
  // Target belong in Ofertas despite having no bucket named "sale".
  sale:            { anyCategory: true, onSaleOnly: true },
};

// What category each scraped bucket holds, and whether the scrape itself
// was gender-specific. Keys are bucket names in department-cache.json.
export const BUCKET_SPEC = {
  clothing:        { category: "apparel" },
  men:             { category: "apparel", gender: "men" },
  women:           { category: "apparel", gender: "women" },
  kids:            { category: "apparel", gender: "kids" },
  sale:            { category: "apparel" },
  electronics:     { category: "electronics" },
  candy_chocolate: { category: "grocery" },
  sporting_goods:  { category: "sporting" },
  home_goods:      { category: "home" },
  // Both spellings a beauty scrape is likely to use, one category.
  beauty:          { category: "beauty" },
  fragrance:       { category: "beauty" },
};

// Positive gender markers retailers really put in titles. \b matters:
// "Women's" contains the letters "men's" but with no word boundary before
// them, so /\bmen'?s\b/ correctly does not match inside it.
/* "JUNIORS" IS NOT CHILDRENSWEAR (2026-09-22). It was in this list and it
   put 19 Macy's items -- sequined corset gowns, strapless ball gowns,
   wide-leg jeans -- into Moda Ninos. In US retail "Juniors" is a young
   WOMEN'S size range, sized 0-15 and sold beside womenswear; it is not a
   children's department, and those garments under a kids label is not a
   mistake anyone wants to ship.

   Removing it does not leave those items homeless: a title with no gender
   marker falls back to the gender of the BUCKET it was scraped from
   (genderOfItem below), which for all 19 is women. */
const KID_MARKER = /\b(kids?|boys?|girls?|toddlers?|infants?|babys?|baby|ni[ñn][oa]s?)\b/i;
const MEN_MARKER = /\b(men'?s|mens|hombre)\b/i;
const WOMEN_MARKER = /\b(women'?s|womens|mujer)\b/i;

export function titleOf(item) {
  return item?.title || item?.name || item?.productTitle || item?.productName || "";
}

// Gender a title positively states, or null. Kids wins over men/women: a
// "Boys' Men's-Style Shirt" is kidswear.
export function genderFromTitle(title) {
  const t = String(title || "");
  if (KID_MARKER.test(t)) return "kids";
  if (WOMEN_MARKER.test(t)) return "women";
  if (MEN_MARKER.test(t)) return "men";
  return null;
}

// A title that positively names a DIFFERENT gender overrides the bucket —
// this is what keeps boys' items out of Moda Hombre when a retailer's
// gender facet leaks (Old Navy's does).
export function genderOfItem(item, bucketName) {
  const fromTitle = genderFromTitle(titleOf(item));
  const bucketGender = BUCKET_SPEC[bucketName]?.gender || null;
  if (fromTitle) return fromTitle;
  return bucketGender;
}

function isOnSale(item) {
  const flag = item?.onSale === true || item?.isOnSale === true
    || (typeof item?.savingsAmount === "number" && item.savingsAmount > 0)
    || (typeof item?.savingsPercent === "number" && item.savingsPercent > 0)
    || (typeof item?.percentageOff === "number" && item.percentageOff > 0)
    || (typeof item?.percentOff === "number" && item.percentOff > 0);
  if (!flag) return false;
  const price = Number(item.price ?? item.effectivePrice ?? item.currentPrice ?? item.salePrice);
  const original = Number(item.regularPrice ?? item.wasPrice ?? item.was_price ?? item.originalPrice);
  if (!Number.isFinite(price) || !Number.isFinite(original) || original <= price) return false;
  return Math.round((1 - price / original) * 100) >= 5; // same floor the rest of the site uses
}

// Does this item, found in this bucket, belong in this department?
export function itemBelongsToDepartment(item, bucketName, deptKey) {
  const dept = DEPARTMENT_SPEC[deptKey];
  if (!dept) return false;
  if (dept.onSaleOnly) return isOnSale(item);

  const bucket = BUCKET_SPEC[bucketName];
  if (!bucket || bucket.category !== dept.category) return false;
  if (!dept.gender) return true;
  return genderOfItem(item, bucketName) === dept.gender;
}

/**
 * Every item a retailer can show in a department, gathered across ALL its
 * buckets of the matching category — not just a bucket that happens to
 * share the department's name.
 *
 * Deduped by title+price: Old Navy's synthetic "clothing" bucket is a
 * merge of its men/women/kids buckets, so the same item is reachable twice.
 */
export function departmentItems(retailerBucket, deptKey) {
  const out = [];
  const seen = new Set();
  for (const [bucketName, bucket] of Object.entries(retailerBucket?.departments || {})) {
    for (const item of bucket?.items || []) {
      if (!itemBelongsToDepartment(item, bucketName, deptKey)) continue;
      const key = titleOf(item) + "::" + (item.price ?? item.effectivePrice ?? "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Retailers with something real to show in this department. */
export function retailersForDepartment(cache, deptKey, candidates) {
  const retailers = candidates || Object.keys(cache?.retailers || {});
  return retailers.filter((r) => departmentItems(cache?.retailers?.[r], deptKey).length > 0);
}
