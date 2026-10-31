/* ============================================================
   SURFBOARD FREIGHT WEIGHT, PER SIZE (#443 c.6539551122, estimator
   table c.6539602786 -- Lucifer's research, Danny's ruling).

   A surfboard's weight is per variant: a 5'6" fish and a 9'6" longboard
   are different freight. The stores' own figures are mostly
   placeholders (Island Water Sports 0.22 kg on a 6' softboard, a flat
   1.0 kg x582, Surf Station's 9.98 kg shipping default, our own 3.3 kg
   blanket), so a published weight is kept only when it is plausible for
   the board's size and is not a known flat default. Otherwise the
   table below decides, by (size, construction), board + ~0.8 kg
   packaging, and the weight is marked estimated.

   Unknown construction takes the heaviest column for the size (never
   under-quote); unknown size is 6.5 kg. The confirm-first freight
   refund covers an overestimate.
   ============================================================ */

/* [max length in feet, soft top, epoxy / EPS, fiberglass / PU] kg */
export const SURFBOARD_KG = [
  [5.5, 4.0, 3.5, 3.5],
  [6.0, 4.5, 4.0, 3.5],
  [6.5, 5.0, 4.5, 4.0],
  [7.0, 5.5, 5.0, 4.5],
  [7.5, 6.0, 5.5, 5.0],
  [8.0, 6.5, 6.0, 5.5],
  [9.0, 7.5, 7.0, 7.5],
  [9.5, 8.0, 7.5, 8.5],
  [Infinity, 8.5, 8.0, 9.5],
];
export const UNKNOWN_SIZE_KG = 6.5;
/* Flat defaults seen across the surf stores' feeds: never a real board weight. */
export const FLAT_DEFAULTS_KG = [1.0, 9.98, 3.3, 1.5, 0.5];

const COLUMN = { soft: 1, epoxy: 2, pu: 3 };
const SOFT_RX = /\b(soft\s*(top|board|surfboard)?|softboard|softtop|foam(ie)?|wavestorm|catch\s*surf|softech|odysea|beater|south bay|liquid shredder|storm blade|nsp\s*(e\+|elements)?\s*soft)\b/i;
const EPOXY_RX = /\b(epoxy|eps|futureflex|helium|volcanic|thunderbolt|firewire|torq|nsp|tuflite|tuf\s*lite|carbon|tec\b|lft|x-?lite|ibolic|varial)\b/i;
const PU_RX = /\b(pu|polyurethane|fiberglass|fibreglass|glassed|poly)\b/i;

/** What a surfboard is made of: "soft", "epoxy", "pu", or "" (unknown). */
export function boardConstruction(title, brand = "", description = "") {
  const t = `${title} ${brand}`;
  if (SOFT_RX.test(t)) return "soft";
  if (EPOXY_RX.test(t)) return "epoxy";
  if (PU_RX.test(t)) return "pu";
  const d = String(description || "");
  if (SOFT_RX.test(d)) return "soft";
  if (EPOXY_RX.test(d)) return "epoxy";
  if (PU_RX.test(d)) return "pu";
  return "";
}

/** A board length in feet from a size label: 5ft6in, 6'0", 6' 0, 9'6, 5'10" -> feet; 7.6 (feet.inches) too. */
export function boardFeet(label) {
  const s = String(label || "").replace(/[’′]/g, "'").replace(/[”″“]/g, '"').trim();
  let m = /(\d{1,2})\s*(?:ft|')\s*(\d{1,2})?\s*(?:in|"|'')?/i.exec(s);
  if (m) {
    const ft = +m[1], inch = m[2] ? +m[2] : 0;
    if (ft >= 3 && ft <= 12 && inch < 12) return ft + inch / 12;
  }
  m = /^\s*(\d{1,2})\.(\d{1,2})\s*$/.exec(s);
  if (m && +m[1] >= 3 && +m[1] <= 12 && +m[2] < 12) return +m[1] + +m[2] / 12;
  return null;
}

/** The table weight for one size and construction (unknown construction: the heaviest column). */
export function tableKg(feet, construction) {
  if (!(feet > 0)) return UNKNOWN_SIZE_KG;
  /* 5'10" is a 6'0" row: a size falls to the next row up, never down. */
  const row = SURFBOARD_KG.find((r) => feet <= r[0] + 1e-6) || SURFBOARD_KG[SURFBOARD_KG.length - 1];
  return construction && COLUMN[construction] ? row[COLUMN[construction]] : Math.max(row[1], row[2], row[3]);
}

/** A store-published weight is believable for this board (not a flat default, not under 1 kg, near the table). */
export function plausibleKg(kg, feet, construction) {
  const n = Number(kg);
  if (!(n >= 1)) return false;
  if (FLAT_DEFAULTS_KG.some((d) => Math.abs(n - d) < 0.005)) return false;
  const t = tableKg(feet, construction);
  return n >= t * 0.6 && n <= t * 1.8;
}

const BOARD_TYPE_RX = /^tablas? de surf$/i;
const BOARD_NAME_RX = /\b(surf\s*boards?|soft\s*top\s*(surf\s*)?boards?|softboards?)\b/i;
const NOT_BOARD_RX = /\b(leash|fins?|wax|traction|pad|bag|sock|cover|rack|strap|leg\s*rope|plug|key|tee|shirt|hat|cap|sticker|decal|repair|ding|stand|wall|mount|book|poster|keychain|skate|skateboard|bodyboard|skim|sup\b|paddle\s*board|wetsuit|modem|router|docsis|doll|barbie|toy|figure|lego|playset|ornament)\b/i;

/** A real surfboard (not a leash, fin, sock, skateboard or SUP). */
export function isSurfboard(item) {
  const title = String(item.name || item.title || "");
  if (NOT_BOARD_RX.test(title)) return false;
  /* The store's own type decides when it has one; the name only when it has none. */
  const type = String(item.type || "").trim();
  if (type) return BOARD_TYPE_RX.test(type);
  return BOARD_NAME_RX.test(title);
}

/** The board's sizes in feet, from its size list or, failing that, its title. */
export function boardSizes(item) {
  const out = new Map();
  for (const s of Array.isArray(item.availableSizes) ? item.availableSizes : Array.isArray(item.sizes) ? item.sizes : []) {
    const f = boardFeet(s);
    if (f) out.set(String(s), f);
  }
  if (!out.size) {
    const m = /(\d{1,2})\s*(?:ft|')\s*(\d{1,2})?\s*(?:in|"|'')?/i.exec(String(item.name || item.title || ""));
    if (m) { const f = boardFeet(m[0]); if (f) out.set("", f); }
  }
  return out;
}

/**
 * The weight a surfboard ships at.
 *   { weightKg, weightBySize?, estimated, kept, construction }
 * weightKg is the heaviest size (a line with no size chosen never
 * under-quotes); weightBySize names each size's own weight.
 */
export function surfboardWeight(item) {
  const construction = boardConstruction(item.name || item.title, item.brand, item.description_en || "");
  const sizes = boardSizes(item);
  const feetList = [...sizes.values()];
  const longest = feetList.length ? Math.max(...feetList) : null;
  /* A published figure that fits the longest size stays (a single-size board, or the store weighed the big one). */
  if (item.weightEstimated === false && sizes.size <= 1 && plausibleKg(item.weightKg, longest, construction)) {
    return { weightKg: Number(item.weightKg), estimated: false, kept: true, construction };
  }
  const bySize = {};
  for (const [label, feet] of sizes) if (label) bySize[label] = tableKg(feet, construction);
  const weightKg = longest ? tableKg(longest, construction) : UNKNOWN_SIZE_KG;
  return { weightKg, ...(Object.keys(bySize).length > 1 ? { weightBySize: bySize } : {}), estimated: true, kept: false, construction };
}

/**
 * The resolver's branch (#443): a cart or PDP line that is a surfboard
 * weighs its chosen size from the table, whatever weight the line carries.
 * Returns null for anything that is not a board.
 */
export function surfboardLineKg(item) {
  if (!item || typeof item !== "object") return null;
  const title = String(item.title ?? item.name ?? "");
  const hinted = item.kind === "surfboard";
  if (!hinted && !(isSurfboard({ name: title, type: item.type }))) return null;
  const construction = boardConstruction(title, item.brand || "");
  const size = item.selectedSize ?? item.size ?? "";
  const feet = boardFeet(size) || boardFeet((/(\d{1,2})\s*(?:ft|')\s*(\d{1,2})?\s*(?:in|"|'')?/i.exec(title) || [""])[0]);
  /* No size known: the longest the line lists, else the unknown-size row. */
  let kg = feet ? tableKg(feet, construction) : null;
  if (!kg && Array.isArray(item.sizeOptions) && item.sizeOptions.length) {
    const f = item.sizeOptions.map(boardFeet).filter(Boolean);
    if (f.length) kg = tableKg(Math.max(...f), construction);
  }
  return { kg: kg || UNKNOWN_SIZE_KG, construction, size: feet ? size : "" };
}
