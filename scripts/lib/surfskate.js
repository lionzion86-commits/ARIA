/* ============================================================
   IS THIS SURF OR SKATE GEAR?

   Surf & Skate (2026-09-26, Danny) is the second department that is
   not a scraped CATEGORY, the Zapatos way: it is a KIND OF ITEM,
   answered per item. Nine surf / skate / spearfishing shops file
   their gear under their own buckets, and the same word means
   different things at different shops — so the signals are ordered
   most trustworthy first, measured against the real catalogues:

   1. A PUBLISHED TYPE. The normalizer assigns every item a Spanish
      `type` from a fixed vocabulary (see normalize.py in the
      spear-surf batch). The surf/skate gear types are enumerated in
      SURFSKATE_TYPES below — the retailer's own classification path,
      and what keeps the bikinis, tees and sandals OUT of the
      department even though they come from surf shops.

   2. A TITLE KEYWORD. The last resort for gear whose type came out
      generic ("Accesorios"): surfboard, skateboard, longboard,
      bodyboard, wetsuit, neopreno, skate deck, trucks...

   WHAT THE KEYWORDS HAD TO LEARN NOT TO MATCH:
     * "fish" is not a surfboard (Nautilus sells spearfishing gear;
       the normalizer already routes spearguns before surf).
     * "wheels" alone would catch auto parts — the keyword requires a
       skate context (skate, deck, longboard nearby) or the type hit.
     * Spearfishing gear (arpones, aletas de buceo, máscaras) is NOT
       surf/skate: it stays in Pesca Submarina, out of this
       department, even though Nautilus is a water-sports shop.

   MIRROR: index.html carries a verbatim copy inside the
   DEPARTMENT_CHAIN slice (the page is a plain <script> and cannot
   import). Change one, change the other; a parity test compares them
   over the real catalogues.
   ============================================================ */

/* The normalizer's Spanish type vocabulary for surf/skate gear. These
   are the real values in *-catalog.json, not a guess. */
export const SURFSKATE_TYPES = new Set([
  "Tablas de surf",
  "Bodyboards",
  "Skimboards",
  "SUP / Paddle surf",
  "Trajes de neopreno",
  "Rash guards",
  "Accesorios de surf",
  "Quillas de surf",
  "Skateboards completos",
  "Longboards",
  "Cruisers",
  "Decks (tablas de skate)",
  "Trucks, ruedas y partes",
  "Cascos y protecciones",
  "Accesorios de skate",
]);

/* Spanish and English, because the shopper is Peruvian and the
   catalogue is American. */
const SURFSKATE_TITLE =
  /\b(surfboards?|tablas? de surf|bodyboards?|skimboards?|paddle\s?boards?|\bsup\b|wetsuits?|trajes? de neopreno|neoprenos?|rash\s?guards?|skateboards?|patinetas?|longboards?|cruisers?|skate\s?decks?|trucks? de skate|quillas?|leash(es)?|correas? de surf)\b/i;

/* Every one of these was a real false-positive risk, not hypothetical. */
const NOT_SURFSKATE =
  /\b(speargun|arp[oó]n|polespear|freediv|apnea|pesca submarina|máscara de buceo)\b/i;

/** True when this catalogue item is surf or skate GEAR (not apparel). */
export function isSurfSkate(item) {
  if (!item) return false;
  if (SURFSKATE_TYPES.has(item.type)) return true;
  const name = `${item.name || ""} ${item.type || ""}`;
  if (NOT_SURFSKATE.test(name)) return false;
  return SURFSKATE_TITLE.test(name);
}
