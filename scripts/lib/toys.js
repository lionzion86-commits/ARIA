/* ============================================================
   TOY-GRADE SKATE DETECTOR — MIRROR of the copy in index.html.
   index.html is a plain <script> and cannot import, so isToyGradeSkate
   exists twice and a parity test pins them together. CHANGE ONE,
   CHANGE THE OTHER. This module carries the full note; the short
   version is below.

   WHAT IT ANSWERS (2026-09-25, Danny's QA on live Deportes): is this a
   cheap little-kid character skateboard, the toy-aisle kind — or real
   skate gear? The front of Deportes flooded with Sakar/Barbie/Hot
   Wheels/Minecraft 31" completes. Those are toys: they belong in
   Juguetes, and inside Deportes they live under the kids skate
   sub-filter only, NEVER at the front. The front is premium product.

   THREE SIGNALS, MOST TRUSTWORTHY FIRST.
   1. A PUBLISHED TYPE of TOYSKATEBOARD. The load boundary re-types
      anything this detector flags (see retypeToySkateBoards in
      index.html), so a re-run of the same feed agrees with itself and
      the kids-skate aisle has one token to match.
   2. THE BRAND. Sakar is a toy licensee; Barbie / Hot Wheels /
      Minecraft / Sonic are character licenses. No real skate brand is
      on this list — Retrospec, for one, is deliberately absent, so a
      Retrospec mini cruiser stays premium skate.
   3. TITLE KEYWORDS, last resort: lenticular, kids/youth/jr/toddler,
      toy. Helmets and pad packs are NOT caught: the item must be a
      skateboard (title or type token) before any of this fires, so a
      "Kids' Bike and Skate Helmet" stays protective equipment in
      Deportes, where it belongs.

   Conservative on purpose: an unrecognised board (Tony Hawk Series 4
   under its own brand, no toy keywords) stays premium skate. A false
   negative keeps a toy board in Deportes; a false positive would exile
   real gear to the toy department.
   ============================================================ */

const TOY_SKATE_BRANDS = new Set([
  "SAKAR",
  "BARBIE",
  "HOT WHEELS",
  "MATTEL",
  "MINECRAFT",
  "SONIC",
]);

const TOY_SKATE_TITLE =
  /\b(barbie|hot\s*wheels|minecraft|monster\s*jam|lenticular|sonic\s+(shadow|stepup)|toy\b|kids?['’]?|youth|jr\.?|junior|toddler)\b/i;

function titleOf(item) {
  return String(item?.title || item?.name || item?.productTitle || item?.productName || "");
}

function isSkateboard(item) {
  const type = String(item?.type || "").toUpperCase();
  if (type.includes("SKATE")) return true;
  return /\bskateboard\b/i.test(titleOf(item));
}

export function isToyGradeSkate(item) {
  if (!item || typeof item !== "object") return false;
  const type = String(item?.type || "").toUpperCase();
  // The load boundary's own verdict. Settles it either way.
  if (type.includes("TOYSKATE")) return true;
  if (!isSkateboard(item)) return false;
  const brand = String(item?.brand || "").toUpperCase().trim();
  if (TOY_SKATE_BRANDS.has(brand)) return true;
  return TOY_SKATE_TITLE.test(titleOf(item));
}
