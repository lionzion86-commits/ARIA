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

/* TALLAS PLUS (Danny, #443 c.6526833313): "large and up", on the size
   run the store actually offers -- women's XL / 1X+ or numeric 14+,
   men's XL+ or waist 40+. Never a word in a title or a fit name. */
export const EXTENDED_SIZES = new Set([
  "xl", "xxl", "2xl", "xxxl", "3xl", "xxxxl", "4xl", "xxxxxl", "5xl", "6xl",
  "0x", "1x", "2x", "3x", "4x", "5x", "6x",
  "plus size",
]);
/* A letter size with its cut ("XL Tall", "1X Petite", "2XL-T"). */
const SIZE_CUT_RX = /[\s-]*(tall|petite|plus|regular|short|long|big|t|p)$/;
/* A numeric size: women's 14, 16W, 18 Petite, 22/24; men's 40, 40x32, W42. */
const NUMERIC_SIZE_RX = /^w?(\d{1,2})(?:\.5)?\s*(?:w|wp|wt|t|p|petite|plus|tall)?(?:\s*[x\/-]\s*l?\d{1,2}(?:\.\d)?)?$/;

/** Is one size, as the store wrote it, extended for this wearer ("women" | "men")?
    dressRun: the run it came from is a dress run (see extendedSizesOf). */
export function isExtendedSize(size, gender = "women", dressRun = true) {
  const t = String(size || "").trim().toLowerCase();
  if (!t) return false;
  if (EXTENDED_SIZES.has(t) || EXTENDED_SIZES.has(t.replace(SIZE_CUT_RX, ""))) return true;
  const m = t.match(NUMERIC_SIZE_RX);
  if (!m) return false;
  const n = Number(m[1]);
  return gender === "men" ? n >= 40 && n <= 60 : n >= 14 && n <= 40 && (dressRun || /\d\s*(w|wp|plus)\b/.test(t));
}
/* A women's number is a dress size only in a dress run -- 0 to 12 sold
   alongside it, or a W / Plus cut: a jeans waist (24-34) or a bra band
   (30-46) is not a plus size. */
function isDressRun(run) {
  return run.some((s) => { const m = String(s).trim().toLowerCase().match(NUMERIC_SIZE_RX); return m && Number(m[1]) <= 12; });
}

/* The retailer's own list, or empty. Never derived from anything else. */
export function retailerSizesOf(item) {
  const raw = item?.availableSizes;
  return Array.isArray(raw) ? raw.filter((s) => typeof s === "string" && s.trim()) : [];
}

export function extendedSizesOf(item, gender = "women") {
  const run = retailerSizesOf(item), dress = isDressRun(run);
  return run.filter((s) => isExtendedSize(s, gender, dress));
}

export function hasExtendedSizes(item, gender = "women") {
  return extendedSizesOf(item, gender).length > 0;
}
