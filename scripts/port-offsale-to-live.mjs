#!/usr/bin/env node
/* ============================================================
   PORT OFF-SALE PRODUCTS TO LIVE LANES (sourcing audit step 2, #443).

   WHY (2026-10-20, c.6301033619 points 3-5 and c.6303274201 Part A).
   The REMOVE stores are off sale (/off-sale.js, PR #457), but their
   product DATA is not theirs: photos, weights, Spanish descriptions and
   variant data for a product that ALSO exists in a live lane's
   catalogue port to that live record. The product stays on sale under
   the live store: the retailer of record and the PRICE are the live
   lane's own. The dead store's price, URL and name are never carried.
   A product with no live match stays off sale, its data retained.

   WHAT COUNTS AS THE SAME PRODUCT (c.6299236303, the Barbie Royal
   trap: "Barbie Royal Doll" and "Barbie Royal Fashion Doll" are
   DIFFERENT dolls). Name similarity alone NEVER matches. A pair is
   matched only by:
     1. GTIN: the same valid GTIN/UPC/EAN (check digit verified) on
        both records -- from a gtin/upc/ean field, or the 12-14 digit
        barcode a store names its photo after.
     2. MODEL CODE: the same model/style/set code (modelNumber, or a
        code token in the title such as "SV410XW-0905", "U1906RMD" or a
        LEGO set number) AND the same brand AND a strong title match
        AND a compatible variant set (no conflicting colour, capacity,
        pack size or size run) AND a sane price ratio. The code must
        name ONE product on each side: a code that several products
        share (a model line in many colourways, "GEL-1130") matches
        nothing.
   With no GTIN and no shared code there is no match. A false match is
   worse than no match.

   WHAT PORTS, and only where the live record lacks it:
     - photos: the gallery, when the live record has fewer than two
       photos (the live card photo stays first);
     - weight: a MEASURED weight (weightEstimated === false), when the
       live record has none or only our own estimate;
     - description: a Spanish description when the live record has none
       (or only a generated one); an English one only as description_en;
     - variant data: Best Buy's variantAttributes, only when every value
       is consistent with the live title. Sizes are NEVER ported: the
       live retailer's sizes win, and a size list cannot be invented for
       a store that did not publish one.
   Price, url, retailer, sizes and availability are never touched.

   HOW. The live catalogue files are the source every reader uses (the
   app bundle at runtime, the builders, the functions), so the
   enrichment is written INTO the live records, surgically: the record's
   own text is kept byte for byte and only the ported keys are added or
   replaced, in the file's own JSON style. Each enriched record carries
   `portedFrom` = { from, id, method, fields, prior } so a re-run first
   restores the prior values exactly, then re-applies -- the script is
   idempotent and `--revert` undoes it.

   RUN, then rebuild with the repo's builders:
     node scripts/port-offsale-to-live.mjs            # write
     node scripts/port-offsale-to-live.mjs --dry      # report only
     node scripts/port-offsale-to-live.mjs --revert   # undo
   Writes reports/port-remove-stores.json (the map) and .md (counts).
   No network: only catalogues already in the repo.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATALOG_FILES, productId, decodeEntities } from "./build-search-index.mjs";
import { isOffSaleRetailer, OFF_SALE_RETAILERS } from "./lib/off-sale.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const REPORT_JSON = "reports/port-remove-stores.json";
export const REPORT_MD = "reports/port-remove-stores.md";
const PORT_KEY = "portedFrom";

/* ---------- files ---------- */
export function catalogueFiles(root = ROOT) {
  const files = [...CATALOG_FILES];
  try {
    const m = /var STORE_FILES\s*=\s*(\{.*\});/.exec(readFileSync(root + "producto.html", "utf8"));
    if (m) for (const list of Object.values(JSON.parse(m[1]))) for (const f of list) files.push(String(f).replace(/^\//, ""));
  } catch { /* CATALOG_FILES alone */ }
  return [...new Set(files)].filter((f) => existsSync(root + f));
}

/* ---------- a JSON span scanner (positions only; values via JSON.parse) ---------- */
function ws(t, i) { while (i < t.length && (t.charCodeAt(i) <= 32)) i++; return i; }
function skipString(t, i) {
  i++;
  while (i < t.length) {
    const c = t[i];
    if (c === "\\") { i += 2; continue; }
    if (c === '"') return i + 1;
    i++;
  }
  throw new Error("unterminated string");
}
function skipValue(t, i) {
  i = ws(t, i);
  const c = t[i];
  if (c === '"') return skipString(t, i);
  if (c === "{" || c === "[") {
    let depth = 0;
    while (i < t.length) {
      const d = t[i];
      if (d === '"') { i = skipString(t, i); continue; }
      if (d === "{" || d === "[") depth++;
      else if (d === "}" || d === "]") { depth--; if (depth === 0) return i + 1; }
      i++;
    }
    throw new Error("unterminated container");
  }
  while (i < t.length && !/[,}\]\s]/.test(t[i])) i++;
  return i;
}
/* An object's members: [{ key, kStart, vStart, vEnd }], plus where it ends. */
export function members(t, start) {
  let i = ws(t, start);
  if (t[i] !== "{") throw new Error("not an object at " + i);
  const out = [];
  i = ws(t, i + 1);
  if (t[i] === "}") return { members: out, end: i + 1, close: i };
  for (;;) {
    i = ws(t, i);
    const kStart = i;
    const kEnd = skipString(t, i);
    const key = JSON.parse(t.slice(kStart, kEnd));
    i = ws(t, kEnd);
    if (t[i] !== ":") throw new Error("expected : at " + i);
    const vStart = ws(t, i + 1);
    const vEnd = skipValue(t, vStart);
    out.push({ key, kStart, vStart, vEnd });
    i = ws(t, vEnd);
    if (t[i] === ",") { i++; continue; }
    if (t[i] === "}") return { members: out, end: i + 1, close: i };
    throw new Error("expected , or } at " + i);
  }
}
function elements(t, start) {
  let i = ws(t, start);
  if (t[i] !== "[") return [];
  const out = [];
  i = ws(t, i + 1);
  if (t[i] === "]") return out;
  for (;;) {
    const s = ws(t, i);
    const e = skipValue(t, s);
    out.push([s, e]);
    i = ws(t, e);
    if (t[i] === ",") { i++; continue; }
    if (t[i] === "]") return out;
    throw new Error("expected , or ] at " + i);
  }
}
/* Every catalogue item's span: key "rk|section|bucket|index" -> [start, end]. */
export function itemSpans(t) {
  const spans = new Map();
  const root = members(t, 0).members.find((m) => m.key === "retailers");
  if (!root) return spans;
  for (const r of members(t, root.vStart).members) {
    if (t[r.vStart] !== "{") continue;
    for (const sec of members(t, r.vStart).members) {
      if ((sec.key !== "departments" && sec.key !== "brands") || t[sec.vStart] !== "{") continue;
      for (const b of members(t, sec.vStart).members) {
        let arrStart = b.vStart;
        if (t[b.vStart] === "{") {
          const items = members(t, b.vStart).members.find((m) => m.key === "items");
          if (!items) continue;
          arrStart = items.vStart;
        }
        elements(t, arrStart).forEach(([s, e], idx) => spans.set(`${r.key}|${sec.key}|${b.key}|${idx}`, [s, e]));
      }
    }
  }
  return spans;
}

/* The file's own JSON style: Python's json.dump (", " / ": ", maybe
   \u-escaped) or JavaScript's compact JSON.stringify. */
export function fileStyle(t) {
  const py = /"\s*:\s"/.test(t.slice(0, 4000)) || /", "/.test(t.slice(0, 4000));
  const ascii = !/[^\x00-\x7f]/.test(t) && /\\u00[0-9a-f]{2}/i.test(t);
  return { py, ascii };
}
export function dump(v, style) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") {
    let s = JSON.stringify(v);
    if (style.ascii) s = s.replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    return s;
  }
  if (typeof v !== "object") return JSON.stringify(v);
  const sep = style.py ? ", " : ",", col = style.py ? ": " : ":";
  if (Array.isArray(v)) return "[" + v.map((x) => dump(x, style)).join(sep) + "]";
  return "{" + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => dump(k, style) + col + dump(x, style)).join(sep) + "}";
}
/* Apply { key: value | undefined(delete) } to the object text at
   [start, end), keeping every other byte. Returns the new object text. */
export function editObjectText(objText, changes, style) {
  const { members: ms, close } = members(objText, 0);
  const sep = style.py ? ", " : ",", col = style.py ? ": " : ":";
  const edits = [];  // [from, to, text]
  const present = new Set();
  ms.forEach((m, idx) => {
    if (!(m.key in changes)) return;
    present.add(m.key);
    const v = changes[m.key];
    if (v === undefined) {
      /* Delete the member with the separator before it (or after it, for the first). */
      if (idx > 0) edits.push([ms[idx - 1].vEnd, m.vEnd, ""]);
      else if (ms.length > 1) edits.push([m.kStart, ms[1].kStart, ""]);
      else edits.push([m.kStart, m.vEnd, ""]);
    } else edits.push([m.vStart, m.vEnd, dump(v, style)]);
  });
  const added = Object.entries(changes).filter(([k, v]) => !present.has(k) && v !== undefined);
  if (added.length) {
    const lead = ms.length ? sep : "";
    const at = ms.length ? ms[ms.length - 1].vEnd : close;
    edits.push([at, at, lead + added.map(([k, v]) => dump(k, style) + col + dump(v, style)).join(sep)]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  let out = objText;
  for (const [from, to, text] of edits) out = out.slice(0, from) + text + out.slice(to);
  return out;
}

/* ---------- records ---------- */
/* One catalogue item as the matcher sees it. */
export function toRecord(it, rk, file = "", path = "") {
  if (!it || typeof it !== "object") return null;
  const retailer = String(it.retailer || rk).toLowerCase();
  const name = decodeEntities(it.name || it.title || it.productName || "").trim();
  if (!name) return null;
  const url = String(it.url || it.link || it.productUrl || "");
  return { file, path, retailer, it, name, nameEn: decodeEntities(it.title_en || "").trim(),
    brand: decodeEntities(it.brand || "").trim(), url, key: retailer + "|" + (url || name).toLowerCase() };
}
export function loadRecords(root = ROOT, texts = new Map()) {
  const recs = [];
  for (const f of catalogueFiles(root)) {
    let d;
    try { d = JSON.parse(texts.has(f) ? texts.get(f) : readFileSync(root + f, "utf8")); } catch { continue; }
    for (const [rk, r] of Object.entries((d && d.retailers) || {})) {
      for (const sec of ["departments", "brands"]) {
        for (const [sk, bucket] of Object.entries((r && r[sec]) || {})) {
          const arr = Array.isArray(bucket) ? bucket : (bucket && bucket.items) || [];
          arr.forEach((it, idx) => {
            const r = toRecord(it, rk, f, `${rk}|${sec}|${sk}|${idx}`);
            if (r) recs.push(r);
          });
        }
      }
    }
  }
  return recs;
}

/* ---------- identifiers ---------- */
export function validGtin(code) {
  const s = String(code || "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(s.length) || /^0+$/.test(s)) return "";
  let sum = 0;
  for (let i = s.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(s[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(s[s.length - 1]) ? s.padStart(14, "0") : "";
}
export function gtinsOf(it) {
  const out = new Set();
  for (const k of ["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "upc", "ean", "barcode"]) {
    const g = validGtin(it[k]);
    if (g) out.add(g);
  }
  /* A store that names its photo after the barcode ("696859950834-1.jpg"). */
  const imgs = [it.image, it.thumbnail, it.imageUrl, ...(Array.isArray(it.images) ? it.images.slice(0, 1) : [])];
  for (const u of imgs) {
    if (typeof u !== "string") continue;
    const file = u.split("?")[0].split("/").pop() || "";
    const m = /^(\d{12,14})(?:[-_.]|$)/.exec(file);
    if (m) { const g = validGtin(m[1]); if (g) out.add(g); }
  }
  return out;
}

const UNIT_WORDS = "GB|TB|MB|MAH|W|WH|V|VOLT|HZ|KHZ|IN|INCH|INCHES|FT|FEET|OZ|FLOZ|ML|L|LB|LBS|PK|PACK|PC|PCS|PIECE|PIECES|CT|COUNT|MM|CM|M|K|P|X|QT|GAL|G|KG|MG|CC|AH|A|MP|FPS|MS|NITS|RPM|TH|ST|ND|RD|S|D|SET|DAY|DAYS|YR|YRS|YEAR|YEARS|MO|MOS|MONTH|MONTHS|PLY|SERIES|GEN|BIT|CORE|CUP|CUPS|QUART|LITER|LITRE|SHEETS|ROLLS|SQFT|DPI|LM|LUMENS|PAIR|PAIRS|SIZE|HOUR|HOURS|HR|HRS|MIN|MINS|MINUTE|MINUTES|SPF|PERCENT|DEGREE|DEGREES|SPEED|SPEEDS|SHOT|SHOTS|PLAYER|PLAYERS|PERSON|PEOPLE|SEATER|STEP|STEPS|LAYER|LAYERS|TIER|TIERS|WAY|IN1";
const UNIT_RE = new RegExp(`^\\d+(?:\\.\\d+)?(?:${UNIT_WORDS})$`);
const PREFIX_UNIT_RE = /^(?:SPF|UPF|PA|IP|IPX|HDMI|USB|USBC|PS|DDR|LPDDR|GDDR|WIFI|BT|RTX|GTX|CAT|AA|AAA|UV|PH|NO|VOL|SIZE|AGE|AGES|TYPE|GEN|SERIES|MODEL|PART|STYLE|ITEM|PACK|SET)\d+[A-Z]?$/;
const DIM_RE = /^\d+(?:\.\d+)?X\d+(?:\.\d+)?(?:X\d+(?:\.\d+)?)?(?:[A-Z]{0,4})$/;
/* Code tokens: a model/style/set code, never a unit, a size or a year. */
export function codesOf(text) {
  const out = new Set();
  for (const raw of String(text || "").split(/[\s,()\[\]{}\/|"'“”‘’:;!?*+&]+/)) {
    const tok = raw.replace(/^[-.#]+|[-.#]+$/g, "").toUpperCase();
    if (tok.length < 5) continue;
    if (UNIT_RE.test(tok) || DIM_RE.test(tok) || PREFIX_UNIT_RE.test(tok)) continue;
    const c = tok.replace(/[-.]/g, "");
    if (c.length < 5 || c.length > 20 || !/^[A-Z0-9]+$/.test(c)) continue;
    const digits = (c.match(/\d/g) || []).length, letters = c.length - digits;
    if (!digits) continue;
    if (/^(19|20)\d\d$/.test(c)) continue;
    if (letters === 0 && (digits < 5 || digits > 8)) continue;   // a set number, not a barcode or a price
    if (letters > 0 && digits < 2) continue;
    if (UNIT_RE.test(c) || DIM_RE.test(c) || PREFIX_UNIT_RE.test(c)) continue;
    out.add(c);
  }
  return out;
}
function recordCodes(r) {
  const s = codesOf(r.name + " " + r.nameEn);
  for (const k of ["modelNumber", "model", "mpn", "styleCode", "manufacturerPartNumber"]) {
    const v = String(r.it[k] || "").toUpperCase().replace(/[-.\s\/]/g, "");
    if (v.length >= 5 && /\d/.test(v) && /^[A-Z0-9]+$/.test(v)) s.add(v);
  }
  return s;
}

/* ---------- words, brands, variants ---------- */
const fold = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[®™©]/g, "").toLowerCase();
export function normBrand(b) { return fold(b).replace(/&/g, "and").replace(/[^a-z0-9]/g, ""); }
const STOP = new Set(("a an and the of for with in on to by from at or & - x " +
  "men mens women womens woman man kids kid boys boy girls girl unisex adult adults youth toddler toddlers baby babies infant " +
  "grade school preschool big little new size sizes pack piece pieces set exclusive only online walmart target " +
  "de la el los las y para con en del al un una por sin").split(/\s+/));
export function words(text, drop = []) {
  const d = new Set(drop);
  return new Set(fold(text).replace(/'s\b/g, "").split(/[^a-z0-9]+/).filter((w) => w && w.length > 1 && !STOP.has(w) && !d.has(w)));
}
export function brandMatch(dead, live) {
  const db = normBrand(dead.brand), lb = normBrand(live.brand);
  if (db && lb) return db === lb || (Math.min(db.length, lb.length) >= 4 && (db.startsWith(lb) || lb.startsWith(db)));
  /* A live record with no brand field: its title must START with the brand. */
  if (db && !lb) return normBrand(live.name).startsWith(db) || normBrand(live.nameEn).startsWith(db);
  if (!db && lb) return normBrand(dead.name).startsWith(lb) || normBrand(dead.nameEn).startsWith(lb);
  return false;
}
const COLORS = ["black", "white", "red", "blue", "green", "yellow", "pink", "purple", "orange", "brown", "gray", "grey", "silver", "gold",
  "beige", "navy", "tan", "ivory", "cream", "teal", "turquoise", "burgundy", "maroon", "olive", "khaki", "charcoal", "lavender", "mint",
  "coral", "rose", "bronze", "copper", "camo", "multi", "clear",
  "negro", "blanco", "rojo", "azul", "verde", "amarillo", "rosa", "morado", "naranja", "marron", "gris", "plateado", "dorado"];
const COLOR_ALIAS = { grey: "gray", negro: "black", blanco: "white", rojo: "red", azul: "blue", verde: "green", amarillo: "yellow", rosa: "pink",
  morado: "purple", naranja: "orange", marron: "brown", gris: "gray", plateado: "silver", dorado: "gold" };
function colorsOf(text, attrs) {
  const out = new Set();
  const w = fold(text + " " + (attrs && attrs.Color ? attrs.Color : "")).split(/[^a-z]+/);
  for (const x of w) if (COLORS.includes(x)) out.add(COLOR_ALIAS[x] || x);
  return out;
}
function quantitiesOf(text) {
  /* Capacity, pack count and net size: a different one is a different product. */
  const out = new Set();
  const re = /(\d+(?:\.\d+)?)\s*-?\s*(tb|gb|oz|fl\s?oz|ml|lb|lbs|ct|count|pack|pk|pc|pcs|piece|pieces|qt|gal|l|kg|g|inch|in|")(?![a-z])/gi;
  let m;
  const t = fold(text);
  while ((m = re.exec(t))) {
    let u = m[2].replace(/\s/g, "");
    u = { lbs: "lb", count: "ct", pk: "pack", pcs: "pc", piece: "pc", pieces: "pc", inch: "in", '"': "in", floz: "oz" }[u] || u;
    out.add(Number(m[1]) + u);
  }
  return out;
}
function unitsOf(set) { return new Set([...set].map((q) => q.replace(/^[\d.]+/, ""))); }
function sizeList(it) {
  const raw = Array.isArray(it.sizes) && it.sizes.length ? it.sizes : it.availableSizes;
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => (s && typeof s === "object" ? s.size || s.label || s.value || "" : s))
    .map((s) => fold(s).replace(/[^a-z0-9.]/g, "").replace(/^0+(\d)/, "$1")).filter(Boolean);
}

/* Variant compatibility: a conflicting colour, capacity/pack/net size
   or size run is a different product. Returns a reason or "". */
export function variantConflict(dead, live) {
  const dc = colorsOf(dead.name + " " + dead.nameEn, dead.it.variantAttributes);
  const lc = colorsOf(live.name + " " + live.nameEn, live.it.variantAttributes);
  if (dc.size && lc.size && ![...dc].some((c) => lc.has(c))) return "colour";
  const dq = quantitiesOf(dead.name + " " + dead.nameEn), lq = quantitiesOf(live.name + " " + live.nameEn);
  /* Same unit on both sides but no shared value: 128GB vs 256GB, 12 oz vs 24 oz. */
  for (const u of unitsOf(dq)) {
    if (!unitsOf(lq).has(u)) continue;
    const dv = [...dq].filter((q) => q.endsWith(u) && q.replace(/^[\d.]+/, "") === u);
    const lv = new Set([...lq].filter((q) => q.replace(/^[\d.]+/, "") === u));
    if (!dv.some((q) => lv.has(q))) return "quantity";
  }
  const ds = sizeList(dead.it), ls = sizeList(live.it);
  if (ds.length && ls.length && !ds.some((s) => ls.includes(s))) return "sizes";
  return "";
}
export function titleScore(dead, live, code) {
  const drop = [...words(dead.brand), ...words(live.brand), String(code || "").toLowerCase()];
  const a = words(dead.name + " " + dead.nameEn, drop), b = words(live.name + " " + live.nameEn, drop);
  /* The code itself, however it is spelled ("SV410XW-0905"), is not a title word. */
  for (const s of [a, b]) for (const w of [...s]) if (codesOf(w).size && w.toUpperCase().replace(/[-.]/g, "") === code) s.delete(w);
  if (!a.size || !b.size) return { jac: 0, cover: 0, shared: 0 };
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return { jac: inter / (a.size + b.size - inter), cover: inter / Math.min(a.size, b.size), shared: inter };
}
/* A strong title match: nearly every word of the shorter title is in the
   longer one (a store's marketing tail -- "Gift for Kids Ages 9+" --
   does not count against it), or a solid overlap both ways. */
const MIN_JACCARD = 0.3, MIN_COVER = 0.5, STRONG_COVER = 0.8, STRONG_SHARED = 3;
export function strongTitle(sc) {
  return (sc.cover >= STRONG_COVER && sc.shared >= STRONG_SHARED) || (sc.jac >= MIN_JACCARD && sc.cover >= MIN_COVER && sc.shared >= 2);
}
const PRICE_RATIO = [0.5, 2.0];
function priceOk(dead, live) {
  const d = Number(dead.it.price), l = Number(live.it.price);
  if (!(d > 0) || !(l > 0)) return true;
  const r = l / d;
  return r >= PRICE_RATIO[0] && r <= PRICE_RATIO[1];
}

/* ---------- matching ---------- */
export function matchAll(recs) {
  const live = recs.filter((r) => !isOffSaleRetailer(r.retailer));
  const dead = recs.filter((r) => isOffSaleRetailer(r.retailer));
  /* One product per key on each side (a product listed in two buckets is one product). */
  const byKey = (list) => {
    const m = new Map();
    for (const r of list) { if (!m.has(r.key)) m.set(r.key, { rep: r, all: [] }); m.get(r.key).all.push(r); }
    return m;
  };
  const liveP = byKey(live), deadP = byKey(dead);
  const gIdx = new Map(), cIdx = new Map();
  for (const [k, p] of liveP) {
    p.gtins = gtinsOf(p.rep.it);
    p.codes = recordCodes(p.rep);
    for (const g of p.gtins) (gIdx.get(g) || gIdx.set(g, new Set()).get(g)).add(k);
    for (const c of p.codes) (cIdx.get(c) || cIdx.set(c, new Set()).get(c)).add(k);
  }
  /* A code several products of ONE dead store share is a model line, not a product. */
  const deadCodeCount = new Map();
  for (const [, p] of deadP) {
    p.gtins = gtinsOf(p.rep.it);
    p.codes = recordCodes(p.rep);
    for (const c of p.codes) {
      const k = p.rep.retailer + "|" + c;
      deadCodeCount.set(k, (deadCodeCount.get(k) || new Set()).add(p.rep.key));
    }
  }
  const matches = [], rejects = [];
  for (const [dk, p] of deadP) {
    const d = p.rep;
    let found = null;
    /* 1. GTIN */
    for (const g of p.gtins) {
      const ks = [...(gIdx.get(g) || [])];
      if (!ks.length) continue;
      const cands = ks.map((k) => liveP.get(k).rep).filter((l) => !(normBrand(d.brand) && normBrand(l.brand) && !brandMatch(d, l)));
      if (cands.length) { found = { method: "gtin", key: g, lives: cands }; break; }
      rejects.push({ dead: d, reason: "gtin-brand-conflict", key: g });
    }
    /* 2. Model code + brand + title + variants */
    if (!found) {
      for (const c of p.codes) {
        const ks = [...(cIdx.get(c) || [])];
        if (!ks.length) continue;
        if ((deadCodeCount.get(d.retailer + "|" + c) || new Set()).size > 1) { rejects.push({ dead: d, reason: "code-shared-by-several-dead-products", key: c }); continue; }
        const byLane = new Map();
        for (const k of ks) {
          const l = liveP.get(k).rep;
          if (!brandMatch(d, l)) continue;
          (byLane.get(l.retailer) || byLane.set(l.retailer, []).get(l.retailer)).push(l);
        }
        const ok = [];
        for (const [lane, ls] of byLane) {
          /* The code must name ONE product in the lane. */
          const distinct = new Set(ls.map((l) => l.key));
          if (distinct.size > 1) { rejects.push({ dead: d, live: ls[0], reason: "code-shared-by-several-live-products", key: c }); continue; }
          const l = ls[0];
          const sc = titleScore(d, l, c);
          if (!strongTitle(sc)) { rejects.push({ dead: d, live: l, reason: "title", key: c, score: sc }); continue; }
          const vc = variantConflict(d, l);
          if (vc) { rejects.push({ dead: d, live: l, reason: "variant-" + vc, key: c }); continue; }
          if (!priceOk(d, l)) { rejects.push({ dead: d, live: l, reason: "price-ratio", key: c }); continue; }
          ok.push(l);
        }
        if (ok.length) { found = { method: "model-code", key: c, lives: ok }; break; }
      }
    }
    if (found) matches.push({ deadKey: dk, dead: d, ...found });
  }
  return { live, dead, liveP, deadP, matches, rejects };
}

/* ---------- enrichment ---------- */
const WEIGHT_KEYS = ["weightKg", "weight_kg", "specWeightKg", "shippingWeightKg", "weight"];
function measuredWeight(it) {
  if (it.weightEstimated !== false) return 0;
  for (const k of WEIGHT_KEYS) { const v = Number(it[k]); if (v > 0) return Math.round(v * 1000) / 1000; }
  return 0;
}
function hasWeight(it) {
  if (measuredWeight(it) > 0) return true;
  /* Walmart's weight_kg + weight_note is our estimate table, not a measurement. */
  return false;
}
function gallery(it) {
  const out = [], seen = new Set();
  const first = it.thumbnail || it.image || it.imageUrl || "";
  for (let u of [first, ...(Array.isArray(it.images) ? it.images : [])]) {
    if (u && typeof u === "object") u = u.src || u.url || "";
    u = String(u || "").trim();
    if (u.startsWith("//")) u = "https:" + u;
    const m = /^https?:\/\/([^\/?#\s]+)([^?#\s]*)/i.exec(u);
    if (!m || /\.svg$|placeholder|no[-_]?image|spacer\.gif/i.test(m[2])) continue;
    const k = m[1].toLowerCase() + m[2];
    if (seen.has(k)) continue;
    seen.add(k); out.push(u);
  }
  return out;
}
const ES = /\b(de|para|con|y|el|la|los|las|del|tu|su|que|una|es)\b/g, EN = /\b(the|and|with|for|your|this|that|is|of|to)\b/g;
export function isSpanish(s) {
  const t = fold(s);
  const es = (t.match(ES) || []).length, en = (t.match(EN) || []).length;
  return es >= 3 && es > en * 1.5;
}
const GENERATED = new Set(["generated", "name", "fromname", "title"]);
function liveDescriptionWeak(it) {
  const d = String(it.description || "").trim();
  if (d.length < 40) return true;  // empty, or a stub such as "1 2 3"
  if (GENERATED.has(String(it.descriptionSource || "").toLowerCase()) || it.descriptionFromName) return true;
  return false;
}
/* What ports from dead record `d` onto live record `l` (raw items). */
export function enrichmentFor(d, l, liveRec) {
  const ch = {};
  const lg = gallery(l), dg = gallery(d);
  if (lg.length < 2 && dg.length >= 2) {
    const merged = [...lg];
    const seen = new Set(lg.map((u) => u.split("?")[0]));
    for (const u of dg) { if (merged.length >= 12) break; if (!seen.has(u.split("?")[0])) { seen.add(u.split("?")[0]); merged.push(u); } }
    if (merged.length > lg.length) ch.images = merged;
  }
  const w = measuredWeight(d);
  if (w > 0 && !hasWeight(l)) { ch.weightKg = w; ch.weightEstimated = false; }
  const dd = String(d.description || "").trim();
  if (dd.length >= 40 && isSpanish(dd) && liveDescriptionWeak(l) && !isSpanish(String(l.description || ""))) {
    ch.description = dd; ch.descriptionSource = "ported";
  } else if (dd.length >= 40 && !isSpanish(dd) && !String(l.description || "").trim() && !String(l.description_en || "").trim()) {
    ch.description_en = dd;
  }
  const den = String(d.description_en || "").trim();
  if (ch.description && den && !String(l.description_en || "").trim()) ch.description_en = den;
  /* Variant attributes: only values the live title already states. */
  const va = d.variantAttributes;
  if (va && typeof va === "object" && !l.variantAttributes) {
    const lt = fold(liveRec.name + " " + liveRec.nameEn);
    const ok = {};
    for (const [k, v] of Object.entries(va)) {
      const toks = fold(v).split(/[^a-z0-9]+/).filter((x) => x.length > 1 && !["gigabytes", "terabytes", "inches", "inch"].includes(x));
      const num = fold(v).match(/^(\d+(?:\.\d+)?)\s*(gigabytes|terabytes|inches)/);
      const consistent = num
        ? new RegExp(`\\b${num[1].replace(".", "\\.")}\\s*(${num[2] === "gigabytes" ? "gb" : num[2] === "terabytes" ? "tb" : "in|inch|\"|-inch"})`).test(lt)
        : toks.length && toks.every((x) => lt.includes(x));
      if (consistent) ok[k] = v;
    }
    if (Object.keys(ok).length) ch.variantAttributes = ok;
  }
  return ch;
}

/* ---------- write ---------- */
export function revertText(t, style, spans) {
  /* Restore every record that carries portedFrom to its prior values. */
  const edits = [];
  for (const [, [s, e]] of spans) {
    const objText = t.slice(s, e);
    if (!objText.includes('"' + PORT_KEY + '"')) continue;
    const obj = JSON.parse(objText);
    const pf = obj[PORT_KEY];
    if (!pf || typeof pf !== "object") continue;
    const changes = { [PORT_KEY]: undefined };
    for (const f of pf.fields || []) changes[f] = pf.prior && Object.prototype.hasOwnProperty.call(pf.prior, f) ? pf.prior[f] : undefined;
    edits.push([s, e, editObjectText(objText, changes, style)]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  for (const [s, e, text] of edits) t = t.slice(0, s) + text + t.slice(e);
  return { text: t, count: edits.length };
}

export function run({ dry = false, revert = false, root = ROOT, log = console.log } = {}) {
  /* 1. Revert the previous port so matching sees the catalogues as scraped. */
  let reverted = 0;
  const texts = new Map();  // file -> its text with the previous port undone
  for (const f of catalogueFiles(root)) {
    const t = readFileSync(root + f, "utf8");
    if (!t.includes('"' + PORT_KEY + '"')) continue;
    const r = revertText(t, fileStyle(t), itemSpans(t));
    reverted += r.count;
    texts.set(f, r.text);
  }
  if (revert) {
    if (!dry) for (const [f, t] of texts) writeFileSync(root + f, t);
    log(`reverted ${reverted} ported records${dry ? " (dry)" : ""}`);
    return { reverted };
  }

  const recs = loadRecords(root, texts);
  const res = matchAll(recs);
  /* 2. Which dead products port to which live product. */
  const plan = new Map();  // live key -> { live, deads: [match], from, methods, fields, changes }
  for (const m of res.matches) {
    for (const l of m.lives) {
      const p = plan.get(l.key) || { live: l, deads: [], from: [], methods: new Set(), fields: new Set(), changes: {} };
      p.deads.push(m);
      p.from.push({ retailer: m.dead.retailer, id: productId(m.dead.retailer, m.dead.url, m.dead.name), method: m.method, key: m.key });
      p.methods.add(m.method);
      plan.set(l.key, p);
    }
  }
  /* 3. Enrich every listing of the live product (all buckets/files), each
     judged on ITS OWN fields: one listing may already have what another
     lacks. Several dead products may port to one; the first wins a field. */
  const byFile = new Map();
  for (const [lk, p] of plan) {
    for (const r of res.liveP.get(lk).all) {
      const changes = {};
      let src = null;
      for (const m of p.deads) {
        const ch = enrichmentFor(m.dead.it, { ...r.it, ...changes }, r);
        for (const [k, v] of Object.entries(ch)) if (!(k in changes)) { changes[k] = v; src = src || m; }
      }
      if (!src) continue;
      for (const k of Object.keys(changes)) { p.fields.add(k); if (!(k in p.changes)) p.changes[k] = changes[k]; }
      (byFile.get(r.file) || byFile.set(r.file, []).get(r.file)).push({ r, changes, src });
    }
  }
  let written = 0;
  for (const [f, list] of byFile) {
    let t = texts.has(f) ? texts.get(f) : readFileSync(root + f, "utf8");
    const style = fileStyle(t), spans = itemSpans(t);
    const edits = [];
    for (const { r, changes, src } of list) {
      const span = spans.get(r.path);
      if (!span) continue;
      const objText = t.slice(span[0], span[1]);
      const obj = JSON.parse(objText);
      const prior = {};
      for (const k of Object.keys(changes)) if (Object.prototype.hasOwnProperty.call(obj, k)) prior[k] = obj[k];
      const pf = { from: src.dead.retailer, id: productId(src.dead.retailer, src.dead.url, src.dead.name), method: src.method, fields: Object.keys(changes) };
      if (Object.keys(prior).length) pf.prior = prior;
      edits.push([span[0], span[1], editObjectText(objText, { ...changes, [PORT_KEY]: pf }, style)]);
    }
    edits.sort((a, b) => b[0] - a[0]);
    for (const [s, e, text] of edits) t = t.slice(0, s) + text + t.slice(e);
    JSON.parse(t);  // never write a broken catalogue
    written += edits.length;
    if (!dry) writeFileSync(root + f, t);
  }
  if (!dry) for (const [f, t] of texts) if (!byFile.has(f)) writeFileSync(root + f, t);
  const report = summarize(res, plan);
  report.json.recordsWritten = written;
  if (!dry) {
    mkdirSync(root + "reports", { recursive: true });
    writeFileSync(root + REPORT_JSON, JSON.stringify(report.json, null, 1) + "\n");
    writeFileSync(root + REPORT_MD, reportMarkdown(report.json, existsSync(root + REPORT_MD) ? readFileSync(root + REPORT_MD, "utf8") : ""));
  }
  log(`dead products ${res.deadP.size}, matched ${res.matches.length} (gtin ${report.json.methods.gtin}, model-code ${report.json.methods["model-code"]}), live records enriched ${report.json.liveEnriched}, listings written ${written}${dry ? " (dry)" : ""}`);
  return { res, plan, report };
}

/* ---------- report ---------- */
function summarize(res, plan) {
  const stores = {};
  for (const k of OFF_SALE_RETAILERS) stores[k] = { catalogueProducts: 0, catalogueRecords: 0, resourced: 0, byLane: {}, offSale: 0, gtin: 0, modelCode: 0 };
  for (const r of res.dead) { (stores[r.retailer] ||= { catalogueProducts: 0, catalogueRecords: 0, resourced: 0, byLane: {}, offSale: 0, gtin: 0, modelCode: 0 }).catalogueRecords++; }
  for (const [, p] of res.deadP) stores[p.rep.retailer].catalogueProducts++;
  const matchedKeys = new Set();
  for (const m of res.matches) {
    const s = stores[m.dead.retailer];
    matchedKeys.add(m.deadKey);
    s.resourced++;
    if (m.method === "gtin") s.gtin++; else s.modelCode++;
    /* The lane of record: the cheapest live lane that carries it (its own price). */
    const lane = [...m.lives].sort((a, b) => Number(a.it.price) - Number(b.it.price))[0].retailer;
    s.byLane[lane] = (s.byLane[lane] || 0) + 1;
  }
  /* Exact same title (and a compatible brand) in a live lane, but no GTIN
     and no code: NOT matched (name alone never matches), only counted so
     a human can look. */
  const liveTitles = new Map();
  for (const [, p] of res.liveP) for (const t of [p.rep.name, p.rep.nameEn]) if (t) {
    const k = fold(t).replace(/[^a-z0-9]+/g, " ").trim();
    (liveTitles.get(k) || liveTitles.set(k, []).get(k)).push(p.rep);
  }
  for (const [k, p] of res.deadP) {
    if (matchedKeys.has(k)) continue;
    const s = stores[p.rep.retailer];
    s.offSale++;
    const tk = fold(p.rep.name).replace(/[^a-z0-9]+/g, " ").trim();
    if ((liveTitles.get(tk) || []).some((l) => brandMatch(p.rep, l) || (!normBrand(p.rep.brand) && !normBrand(l.brand)))) s.nameOnlyHeldBack = (s.nameOnlyHeldBack || 0) + 1;
  }
  const ported = { images: 0, weightKg: 0, description: 0, description_en: 0, variantAttributes: 0 };
  let liveEnriched = 0;
  for (const [, p] of plan) {
    if (Object.keys(p.changes).length) liveEnriched++;
    for (const f of p.fields) if (f in ported) ported[f]++;
  }
  const rejectReasons = {};
  for (const r of res.rejects) rejectReasons[r.reason] = (rejectReasons[r.reason] || 0) + 1;
  const methods = { gtin: res.matches.filter((m) => m.method === "gtin").length, "model-code": res.matches.filter((m) => m.method === "model-code").length };
  const matches = res.matches.map((m) => ({
    dead: { retailer: m.dead.retailer, id: productId(m.dead.retailer, m.dead.url, m.dead.name), title: m.dead.name, brand: m.dead.brand },
    method: m.method, key: m.key,
    live: m.lives.map((l) => ({ retailer: l.retailer, id: productId(l.retailer, l.url, l.name), title: l.name, price: Number(l.it.price), ported: plan.get(l.key) ? [...plan.get(l.key).fields] : [] })),
  }));
  return { json: { generatedBy: "scripts/port-offsale-to-live.mjs", stores, methods, ported, liveEnriched, rejectReasons, matches } };
}

/* The human report. Everything above KEEP_MARK is regenerated; notes
   written below it survive a re-run. */
const KEEP_MARK = "<!-- Notes below this line are kept when the script re-runs. -->";
const LABELS = { victoriassecret: "Victoria's Secret", target: "Target", bestbuy: "Best Buy", costco: "Costco (costco.com)", nike: "Nike direct",
  footlocker: "Foot Locker", kohls: "Kohl's", macys: "Macy's", gap: "Gap", oldnavy: "Old Navy", bananarepublic: "Banana Republic", athleta: "Athleta",
  ulta: "Ulta Beauty", ssense: "SSENSE", yesstyle: "YesStyle", newbalance: "New Balance direct", gymshark: "Gymshark direct",
  alphalete: "Alphalete direct", miumiu: "Miu Miu", fendi: "Fendi", goldengoose: "Golden Goose direct", pacsun: "PacSun" };
const fmt = (n) => Number(n).toLocaleString("en-US");
export function reportMarkdown(j, previous = "") {
  const L = [];
  L.push("# Sourcing audit step 2: REMOVE-store products ported to live lanes (#443)", "");
  L.push("Generated by `node scripts/port-offsale-to-live.mjs` from the catalogues in this repo. No network, no scraping.", "");
  L.push("## Rules applied", "");
  L.push("- A product from an off-sale store ports only when the SAME product is already in a live lane's catalogue here.");
  L.push("- The live record stays the retailer of record, at the live lane's own price. The dead store's price, URL and name are never carried.");
  L.push("- Same product means a shared GTIN, or a shared model/style/set code plus the same brand, a strong title match, a compatible variant set (colour, capacity, pack size, size run) and a sane price ratio. The code must name one product on each side. Name similarity alone never matches.");
  L.push("- Only fields the live record lacks are filled: photos, a measured weight, a Spanish description (an English one only as `description_en`), and variant attributes the live title already states. Sizes are never ported: the live retailer's sizes win.");
  L.push("- Products with no match stay off sale, data retained.", "");
  L.push("## Per store", "");
  L.push("(a) = dead-store-only products left off sale. (b) = products re-sourced to a live lane. (c) = the dead store's catalogue total: unique products, with rows on disk in brackets (a product listed in two buckets is one product).", "");
  L.push("| Store | key | (a) off sale | (b) re-sourced | (b) by live lane | (c) catalogue total | GTIN | model code | same title, no identifier (held back) |");
  L.push("|---|---|---:|---:|---|---:|---:|---:|---:|");
  const tot = { a: 0, b: 0, c: 0, rows: 0, g: 0, m: 0, h: 0 };
  for (const [k, s] of Object.entries(j.stores)) {
    const lanes = Object.entries(s.byLane).sort((x, y) => y[1] - x[1]).map(([l, n]) => `${l} ${fmt(n)}`).join(", ") || "-";
    L.push(`| ${LABELS[k] || k} | \`${k}\` | ${fmt(s.offSale)} | ${fmt(s.resourced)} | ${lanes} | ${fmt(s.catalogueProducts)} (${fmt(s.catalogueRecords)}) | ${fmt(s.gtin)} | ${fmt(s.modelCode)} | ${fmt(s.nameOnlyHeldBack || 0)} |`);
    tot.h += s.nameOnlyHeldBack || 0;
    tot.a += s.offSale; tot.b += s.resourced; tot.c += s.catalogueProducts; tot.rows += s.catalogueRecords; tot.g += s.gtin; tot.m += s.modelCode;
  }
  L.push(`| **Total** | | **${fmt(tot.a)}** | **${fmt(tot.b)}** | | **${fmt(tot.c)} (${fmt(tot.rows)})** | **${fmt(tot.g)}** | **${fmt(tot.m)}** | **${fmt(tot.h)}** |`, "");
  L.push("\"Held back\" counts products left off sale (they are in (a)) whose exact title is also in a live lane, but with no GTIN or model code to prove it is the same product. They are not matched, because a title is not proof (the Barbie Royal trap). They are the list to check by hand if a barcode source appears.", "");
  L.push("## Match method", "");
  L.push(`- GTIN: ${fmt(j.methods.gtin)}. No live-lane record in this repo carries a GTIN/UPC/EAN (only Best Buy, itself off sale, publishes UPCs), so nothing could match on one. The GTIN path is built and tested, and it will match as soon as a live lane's data carries barcodes.`);
  L.push(`- Model code: ${fmt(j.methods["model-code"])}.`);
  L.push("- Candidates rejected by the guards:");
  for (const [r, n] of Object.entries(j.rejectReasons).sort((a, b) => b[1] - a[1])) L.push(`  - ${r}: ${fmt(n)}`);
  L.push("");
  L.push("## What was ported", "");
  L.push(`Live products enriched: ${fmt(j.liveEnriched)}. Catalogue listings written: ${fmt(j.recordsWritten || 0)} (a product listed in several buckets or files is enriched in each).`, "");
  L.push("| Field | Live products |", "|---|---:|");
  L.push(`| Photos (gallery) | ${fmt(j.ported.images)} |`);
  L.push(`| Weight (measured) | ${fmt(j.ported.weightKg)} |`);
  L.push(`| Spanish description | ${fmt(j.ported.description)} |`);
  L.push(`| English description (description_en) | ${fmt(j.ported.description_en)} |`);
  L.push(`| Variant attributes | ${fmt(j.ported.variantAttributes)} |`);
  L.push(`| Sizes | 0 (never ported; the live retailer's sizes win) |`, "");
  L.push("Most matched live records already had their own photos and description, so most matches port nothing: the product simply stays on sale under the live lane. The off-sale stores' weights in this repo are our own estimates (weightEstimated), not measurements, so no weight ported.", "");
  L.push("## Sample of 20 matches, for eyeballing", "");
  L.push("| # | Dead store | Dead title | Live lane | Live title | Live price (USD) | Method / key | Ported |", "|---:|---|---|---|---|---:|---|---|");
  /* Every non-LEGO match first, then LEGO spread evenly, so the sample is not all one brand. */
  const nonLego = j.matches.filter((m) => !/lego/i.test(m.dead.brand));
  const lego = j.matches.filter((m) => /lego/i.test(m.dead.brand)).sort((a, b) => a.dead.title.localeCompare(b.dead.title));
  const sample = nonLego.slice(0, 20);
  const need = 20 - sample.length;
  for (let i = 0; i < need && lego.length; i++) sample.push(lego[Math.floor(i * lego.length / need)]);
  const esc = (t) => String(t).replace(/\|/g, "/");
  sample.forEach((m, i) => {
    const l = m.live[0];
    L.push(`| ${i + 1} | ${m.dead.retailer} | ${esc(m.dead.title)} | ${l.retailer} | ${esc(l.title)} | ${l.price} | ${m.method} \`${m.key}\` | ${l.ported.join(", ") || "-"} |`);
  });
  L.push("", "The full list of matches is in `reports/port-remove-stores.json`.", "");
  L.push("## The Barbie Royal trap (c.6299236303)", "");
  L.push("Target's \"Barbie Royal Doll with Brightly Highlighted Hair, Butterfly-Print Skirt and Accessories\" and Walmart's \"Barbie Royal Fashion Doll with Blonde Hair, Removable Skirt & Accessories [Walmart Exclusive]\" are different dolls. Neither carries a GTIN or a model code, so they do not match. The Target doll stays off sale, and the Walmart doll keeps its own price and data. `scripts/test/port-tests.mjs` pins this.", "");
  L.push(KEEP_MARK);
  const i = previous.indexOf(KEEP_MARK);
  const kept = i >= 0 ? previous.slice(i + KEEP_MARK.length) : "\n";
  return L.join("\n") + kept;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  run({ dry: args.has("--dry"), revert: args.has("--revert") });
}
