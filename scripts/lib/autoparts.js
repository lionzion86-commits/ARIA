/* ============================================================
   IS THIS AN AUTO PART?

   Repuestos is the second department that is not a scraped CATEGORY,
   after Zapatos: no retailer declares a parts bucket, because a parts
   catalogue IS the whole store. Advance Auto Parts files everything
   under one auto_parts bucket, and the department answers per item.

   TWO SIGNALS, MOST TRUSTWORTHY FIRST.

   1. A PARTS RETAILER. Advance Auto Parts sells nothing but parts, so
      the store is the signal — the same way Foot Locker's catalogue is
      all footwear. (Checked: 120/120 items in advanceauto-catalog.json
      are braking parts.)

   2. A PUBLISHED TYPE. Our Advance Auto normalizer ships a Spanish
      part-type on every item ("Pastillas de freno", "Discos de freno"),
      and the retailer's own classification beats anything inferred.

   Deliberately NO title-keyword fallback: a generalist's "brake" would
   catch brake cleaner, brake fluid and kids' bike brake pads, and a
   keyword list that has to learn refusals is a liability the two
   signals above do not need. A future general retailer that carries
   parts gets its own entry in AUTOPART_RETAILERS after its catalogue
   is measured.

   MIRROR: index.html carries a verbatim copy inside the
   DEPARTMENT_CHAIN slice (the page is a plain <script> and cannot
   import). Change one, change the other; a parity test compares them
   over the real catalogues.
   ============================================================ */

export const AUTOPART_RETAILERS = new Set(["advanceauto", "autozone"]);

const AUTOPART_TYPE =
  /\b(PASTILLAS DE FRENO|DISCOS DE FRENO|CALIPERS? DE FRENO|FRENOS|REPUESTOS?|AUTOPARTES?|BRAKE|OIL FILTERS?|AIR FILTERS?|SPARK PLUGS?|SHOCKS?|STRUTS?|ALTERNATORS?|BATTERIES|BATTERY)\b/;

export function isAutoPartType(type) {
  const t = String(type ?? "").toUpperCase();
  return t ? AUTOPART_TYPE.test(t) : false;
}

export function isAutoPart(item, retailer) {
  if (!item || typeof item !== "object") return false;
  if (item.type) return isAutoPartType(item.type);
  if (retailer && AUTOPART_RETAILERS.has(String(retailer).toLowerCase())) return true;
  return false;
}
