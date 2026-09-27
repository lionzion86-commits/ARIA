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

   2b. A SKATE HELMET BY NAME. Dick's files dual "Bike and Skate"
      helmets under type BikeHelmets, so neither the type vocabulary
      nor the board keywords catch them — but a helmet marketed for
      skate is skate protection (Danny 2026-09-26: skate helmets live
      only in Surf & Skate). Pure bike helmets (no "skate" in the
      title) are untouched and stay in Deportes.

   2c. A SURF ROPE BY NAME. Island Water Sports types its wake-surf
      rope "Boyas y flotadores", which is too generic to claim by
      type — but a rope with the surf word is genuine surf gear
      (Danny 2026-09-26: all genuine surf merchandise belongs in Surf
      & Skate). Requires the surf word; a plain tow/mooring rope never
      matches, and snorkeling gear stays in Deportes.

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

   TOY-GRADE BOARDS ARE NOT SURF/SKATE GEAR (2026-09-26, Danny):
   isToyGradeSkate (scripts/lib/toys.js) answers first, so a
   character-licensed toy board never counts as surf/skate no matter
   what its type or title says. It belongs in Juguetes.
   ============================================================ */

import { isToyGradeSkate } from "./toys.js";

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

/* A helmet marketed for skate, in either word order and either
   language: "Bike and Skate Helmet", "Yepa Skate Helmet",
   "casco de skate". Requires the skate word — a pure bike helmet
   never matches. */
const SURFSKATE_HELMET =
  /\bskate\b.{0,30}\bhelmets?\b|\bhelmets?\b.{0,30}\bskate\b|\bskate\b.{0,30}\bcascos?\b|\bcascos?\b.{0,30}\bskate\b/i;

/* A surf rope is surf gear: "Liquid Force Surf 8in Floating Rope"
   types as "Boyas y flotadores" (too generic to claim by type), but
   a rope with the surf word is wake-surf gear (Danny 2026-09-26: all
   genuine surf merchandise belongs in Surf & Skate). Requires the
   surf word — a plain tow/mooring rope never matches, and snorkeling
   gear stays in Deportes. */
const SURFSKATE_ROPE =
  /\bsurf\b.{0,40}\bropes?\b|\bropes?\b.{0,40}\bsurf\b|\bsurf\b.{0,40}\bcuerdas?\b|\bcuerdas?\b.{0,40}\bsurf\b/i;

/** True when this catalogue item is surf or skate GEAR (not apparel,
    and never a toy-aisle character board — those belong in Juguetes). */
export function isSurfSkate(item) {
  if (!item) return false;
  if (isToyGradeSkate(item)) return false;
  if (SURFSKATE_TYPES.has(item.type)) return true;
  const name = `${item.name || ""} ${item.type || ""}`;
  if (NOT_SURFSKATE.test(name)) return false;
  return SURFSKATE_TITLE.test(name) || SURFSKATE_HELMET.test(name) || SURFSKATE_ROPE.test(name);
}
