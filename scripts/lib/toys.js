/* ============================================================
   TOY-GRADE SKATE DETECTOR (2026-09-26, Danny)

   WHAT IT ANSWERS: is this a cheap character-licensed toy-aisle
   skateboard — or real skate gear? Danny's rule: toy-grade boards
   belong in Juguetes, and Surf & Skate carries only real,
   professional-caliber gear. A toy board must never headline Surf &
   Skate, and real gear must never be exiled to the toy department.

   THE REAL ENEMY (measured 2026-09-26 over the committed
   catalogues): Dick's 11 Sakar/Barbie/Hot Wheels/Minecraft/Sonic
   31" completes. Sakar is a toy licensee; Barbie / Hot Wheels /
   Minecraft / Sonic are character licenses. No real skate brand is
   on the list.

   THREE SIGNALS, MOST TRUSTWORTHY FIRST:
   1. A PUBLISHED TYPE of TOYSKATEBOARD. A feed may pre-type what
      this detector flags, so a re-run agrees with itself.
   2. THE BRAND. Exact match on the upper-cased brand field.
   3. CHARACTER-LICENSE TITLE KEYWORDS, last resort for an unbranded
      feed row: barbie, hot wheels, minecraft, monster jam, sonic.

   WHAT IT DELIBERATELY DOES NOT MATCH (all real false positives
   found in the catalogues):
   * "Toy Machine" — a real pro skate brand. There is no bare "toy"
     keyword, on purpose.
   * Birdhouse "Toy Invasion" — a pro graphic series.
   * "Spanky Jr" — a pro skater's nickname; no "jr"/"kid"/"youth"
     keywords, on purpose.
   * CCS kid-sized completes — real skate-shop construction, just
     small. A cheap kids' board staying in Surf & Skate is a lesser
     evil than exiling real gear to Toys.
   * DGK x Bruce Lee "Lenticular" — a pro collab deck. No
     "lenticular" keyword, on purpose; Sakar's lenticular decks are
     already caught by the Sakar brand.
   * Helmets and pad sets — the item must be a skateboard (type
     token or title) before any of this fires, so a "Kids' Bike and
     Skate Helmet" stays protective equipment.

   Conservative on purpose: an unrecognised board stays real skate.
   A false negative keeps a toy board in Surf & Skate; a false
   positive would exile real gear to the toy department.

   MIRROR: index.html carries a verbatim copy inside the
   DEPARTMENT_CHAIN slice (the page is a plain <script> and cannot
   import). Change one, change the other; a parity test compares them
   over the real catalogues.
   ============================================================ */

/* Toy-license brands. Exact match on the upper-cased brand field —
   "Sakar International" would not match, and that is intended. */
export const TOY_SKATE_BRANDS = new Set([
  "SAKAR",
  "BARBIE",
  "HOT WHEELS",
  "MATTEL",
  "MINECRAFT",
  "SONIC",
]);

/* Character licenses, word-bounded. No generic kid words, no bare
   "toy" — see the false-positive list above. */
const TOY_SKATE_TITLE =
  /\b(barbie|hot\s*wheels|minecraft|monster\s*jam|sonic)\b/i;

function skateboardName(item) {
  return String(item?.name || item?.title || "");
}

function isSkateboardItem(item) {
  const type = String(item?.type || "").toUpperCase();
  if (type.includes("SKATE")) return true;
  return /\bskateboards?\b/i.test(skateboardName(item));
}

/** True when this catalogue item is a toy-aisle character skateboard. */
export function isToyGradeSkate(item) {
  if (!item || typeof item !== "object") return false;
  // A feed's own verdict. Settles it either way.
  if (String(item?.type || "").toUpperCase().includes("TOYSKATE")) return true;
  if (!isSkateboardItem(item)) return false;
  if (TOY_SKATE_BRANDS.has(String(item?.brand || "").toUpperCase().trim())) return true;
  return TOY_SKATE_TITLE.test(skateboardName(item));
}

/* ============================================================
   GAME-CONSOLE DETECTOR + JUGUETES LEAD RANK (2026-09-26, Danny)

   WHAT IT ANSWERS: is this item a game console — and where does it
   sort inside Juguetes?

   DANNY'S TWO RULES:
   1. Consoles ARE toys and stay in Juguetes, but they are SECONDARY
      toys: real toys lead the department, consoles follow.
      toyLeadRank(item) is 0 for a real toy, 1 for a console; the
      department sorts by it before price.
   2. Consoles are also electronics: a PlayStation shopper checks
      Electrónica first, so the electronics department claims consoles
      too. Dual presence with Juguetes is intended — departments
      overlap here exactly as Ofertas overlaps everything.

   WHAT COUNTS AS A CONSOLE: a console-platform word (nintendo /
   playstation / xbox / ps5 / ps4) PLUS a hardware word (console /
   consola / switch / ps5 / ps4 / xbox series). A video GAME
   ("LEGO Batman … PlayStation 5") has the platform word but no
   hardware word, so it stays a plain toy — it is not demoted and it
   is not electronics.

   MIRROR: index.html carries a verbatim copy inside the
   DEPARTMENT_CHAIN slice (the page is a plain <script> and cannot
   import). Change one, change the other; a parity test compares them
   over the real catalogues.
   ============================================================ */

/** Title text the console detector reads. */
function consoleName(item) {
  return String(item?.title || item?.name || item?.productName || "");
}

/** True when this catalogue item is a game console (hardware). */
export function isConsole(item) {
  if (!item || typeof item !== "object") return false;
  const t = consoleName(item).toLowerCase();
  if (!/\b(nintendo|playstation|xbox|ps5|ps4)\b/.test(t)) return false;
  return /\b(consol[ae]|switch|ps5|ps4|xbox\s*series)\b/.test(t);
}

/** Juguetes lead rank: real toys (0) sort before consoles (1). */
export function toyLeadRank(item) {
  return isConsole(item) ? 1 : 0;
}
