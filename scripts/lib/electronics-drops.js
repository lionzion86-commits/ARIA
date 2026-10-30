/* ============================================================
   THE 2026-10-28 ELECTRONICS DROPS INTO ELECTRÓNICA (Order C, #443):
   Walmart electronics (f4687507, 5,407), Costco electronics (0dfc1029,
   454), Micro Center (04d111eb, 696).

   One set of rules for all three, the BrandsMart ones:
   - in stock only; real photos; a was-price only above the price;
   - the aisle by what the product is (scripts/lib/tech-aisle.js), and
     what is no electronics at all stays out of Electrónica;
   - THE 220 V GATE (scripts/lib/brandsmart.js voltageGate): a mains
     device sells only with 220 V stated; battery/USB devices sell; the
     drop's own 110 V-only flag excludes;
   - phones: a carrier-locked or prepaid handset never works in Peru --
     held, new or used;
   - condition (Walmart's Restored / Pre-Owned / Open Box): disclosed on
     every page from the title (/condition.js); a title that does not
     say it gets the store's condition appended, so the disclosure shows;
   - Spanish copy only where it is translated copy: Walmart's is English,
     Costco's "description_es" is English feature text, Micro Center's is
     a half-English spec template -- none is shown (English never is);
   - weights: the drop's own where it has one, else the house table at
     build time (apply-weight-estimates.py, flagged estimated);
   - Walmart: sold by Walmart leads its aisles, marketplace sellers after.
   Every hold is counted by reason in reports/electronics-drops-2026-10-28.json.
   ============================================================ */
import { voltageGate } from "./brandsmart.js";
import { conditionOf, lockedPhone } from "./walmart-write.js";
import { techAisle, isTechProduct, TECH_AISLE_LABELS, TECH_AISLE_ORDER } from "./tech-aisle.js";

const realPhoto = (u) => typeof u === "string" && /^https:\/\//.test(u);
const LOCKED_RX = /\b(prepaid|straight talk|tracfone|total wireless|total by verizon|cricket|metro ?(by t-?mobile|pcs)|boost mobile|visible|verizon|at&t|t-?mobile|carrier[- ]locked|locked to|simple mobile|walmart family mobile|consumer cellular|lte prepaid)\b/i;
const UNLOCKED_RX = /\bunlocked\b/i;
/* Scraped titles carry HTML entities ("X2&nbsp;1.1GHz", "360&deg;", "DE &lt;"),
   some cut short ("ChromeOS,&nbsp"): a page would print them raw. */
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "®", trade: "™", copy: "©", deg: "°",
  eacute: "é", ntilde: "ñ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
export function decodeTitle(s) {
  return String(s || "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
      if (e[0] === "#") { const cp = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; }
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, e.toLowerCase()) ? NAMED_ENTITIES[e.toLowerCase()] : m;
    })
    .replace(/\s+/g, " ").trim();
}
const DAMAGED_RX = /\b(fractured|cracked|broken (screen|glass)|for parts|not working)\b/i;
/* "pre-owned" names a plain used listing: walmart-write conditionOf holds it (c.6526570723). */
const CONDITION_LABEL = { restored: "Reacondicionado", "pre-owned": "Usado", "open box": "Caja abierta" };

/** "sell" or the hold reason, after the type and the voltage gate. */
function gate({ name, description = "", hint = "", flag110 = false, rated = null }) {
  if (!isTechProduct(name, hint)) return "not electronics (re-route)";
  const aisle = techAisle(name, hint);
  /* A prepaid handset (or cellular tablet) is a carrier's, whatever
     else its title says ("[unlocked works Straight Talk]"). */
  if ((aisle === "tech_celulares" || aisle === "tech_computadoras") && (/\bprepaid\b/i.test(name) || (LOCKED_RX.test(name) && !UNLOCKED_RX.test(name)))) return "carrier-locked phone";
  const v = voltageGate({ name, descriptionEn: description, subcategory: aisle === "tech_auto" ? "car-audio" : "", flag110vOnly: flag110 });
  /* A console BUNDLE is the console plus a game in one box: when the same
     console's own listing in this drop states a rating that covers 220 V,
     the bundle carries the same adapter (Danny's Consolas pill, #443
     c.6487219343). Nothing is inferred across models: a line with no
     rated listing of its own stays held. */
  if (v === "held-voltage-unstated" && rated && /\bbundle\b/i.test(name)) {
    const line = consoleLine(name);
    if (line && rated.has(line)) return aisle;
  }
  return v === "sell" ? aisle : v;
}
/* The console lines a bundle can inherit a rating from. */
const CONSOLE_LINES = [["switch2", /\bnintendo switch\s*(™)?\s*2\b|\bswitch 2\b/i], ["switcholed", /\bswitch\s*(™)?\s*oled\b/i],
  ["ps5", /\b(playstation\s*5|ps5)\b/i], ["xboxx", /\bxbox series x\b/i], ["xboxs", /\bxbox series s\b/i], ["quest3", /\bmeta quest 3\b|\bquest 3\b/i]];
export function consoleLine(name) { const n = String(name || ""); const hit = CONSOLE_LINES.find(([, rx]) => rx.test(n)); return hit ? hit[0] : ""; }
/* The lines whose own console listing (not a bundle) passes the gate in this drop. */
function ratedConsoleLines(rows, describe) {
  const out = new Set();
  for (const r of rows) {
    const name = decodeTitle(r && (r.name || r.title));
    const line = consoleLine(name);
    /* The console itself: not a bundle, not a drive or case "for" it. */
    if (!line || /\bbundle\b/i.test(name) || !/\b(system|console)\b/i.test(name) || /\b(for|compatible|fits|drives?|ssd|cases?)\b/i.test(name)) continue;
    const a = gate({ ...describe(r), name });
    if (/^tech_/.test(a)) out.add(line);
  }
  return out;
}

function images(list, first) {
  const raw = Array.isArray(list) ? list : typeof list === "string" ? (list.match(/https:\/\/[^'"\s,\]]+/g) || []) : [];
  const flat = raw.flatMap((x) => typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x) : []).filter(realPhoto);
  const all = [first, ...flat].filter(realPhoto);
  return [...new Set(all)];
}

function push(departments, aisle, it) {
  (departments[aisle] ||= { label: TECH_AISLE_LABELS[aisle], items: [] }).items.push(it);
}
function ordered(departments) {
  const out = {};
  for (const k of TECH_AISLE_ORDER) if (departments[k]) out[k] = departments[k];
  return out;
}

export function normalizeWalmartElectronics(rows, { isShippableItem } = {}) {
  const held = {}, departments = {}, seen = new Set();
  const rated = ratedConsoleLines(rows.filter((r) => r && r.inStock === true),
    (r) => ({ description: r.description, hint: r.subcategory, flag110: r.voltageFlag110Only === true }));
  const hold = (w) => { held[w] = (held[w] || 0) + 1; };
  for (const r of rows) {
    if (!r || r.inStock !== true) { hold("out of stock"); continue; }
    const key = String(r.usItemId || r.productId || r.url);
    if (seen.has(key)) { hold("duplicate"); continue; }
    seen.add(key);
    const price = Number(r.price);
    if (!(price > 0)) { hold("no price"); continue; }
    const imgs = images(r.images, r.image);
    if (!imgs.length) { hold("no photo"); continue; }
    let name = decodeTitle(r.name);
    const cond = String(r.condition || "New").toLowerCase();
    const condKey = Object.keys(CONDITION_LABEL).find((k) => cond.startsWith(k));
    if (condKey && !conditionOf(name)) name = `${name} - ${CONDITION_LABEL[condKey]}`;
    const c = conditionOf(name, "electronics");
    if (c && c.excluded) { hold(c.excluded); continue; }
    if (c && lockedPhone(name)) { hold("carrier-locked phone"); continue; }
    /* A damaged unit ("92% Fractured Glass") is not a refurbished one. */
    if (c && DAMAGED_RX.test(name)) { hold("damaged unit"); continue; }
    const aisle = gate({ name, description: r.description, hint: r.subcategory, flag110: r.voltageFlag110Only === true, rated });
    if (!aisle.startsWith("tech_")) { hold(aisle); continue; }
    const it = { name, brand: String(r.brand || "").trim(), price, currency: "USD", image: imgs[0], images: imgs,
      url: r.url || "", sku: String(r.usItemId || r.sku || ""), description: "", description_en: String(r.description || "").trim(),
      retailer: "walmart", type: (r.type || r.subcategory || "").toString(), department: "electronics",
      sellerType: r.sellerType || null, rating: Number(r.rating) || undefined, reviews: Number(r.reviewCount) || undefined };
    if (r.upc || r.gtin) it.upc = String(r.upc || r.gtin);
    const was = Number(r.listPrice);
    if (r.onSale === true && was > price) { it.originalPrice = was; it.onSale = true; }
    if (Number(r.weightKg) > 0) it.weightKg = Number(r.weightKg);
    for (const k of Object.keys(it)) if (it[k] === undefined) delete it[k];
    if (isShippableItem && !isShippableItem(it)) { hold("site-unshippable (bulk / weight)"); continue; }
    push(departments, aisle, it);
  }
  /* Sold by Walmart leads, the marketplace after (the drop's note). */
  const rank = (it) => (it.sellerType === "INTERNAL" ? 0 : 1);
  for (const d of Object.values(departments)) d.items.sort((a, b) => rank(a) - rank(b));
  return { departments: ordered(departments), held };
}

export function normalizeCostcoElectronics(rows, { isShippableItem } = {}) {
  const held = {}, departments = {}, seen = new Set();
  const hold = (w) => { held[w] = (held[w] || 0) + 1; };
  for (const r of rows) {
    if (!r || r.inStock === false) { hold("out of stock"); continue; }
    if (seen.has(r.itemNumber)) { hold("duplicate"); continue; }
    seen.add(r.itemNumber);
    const price = Number(r.price);
    if (!(price > 0)) { hold("no price"); continue; }
    const imgs = images(r.images, r.image);
    if (!imgs.length) { hold("no photo"); continue; }
    const name = decodeTitle(r.name);
    const aisle = gate({ name, description: r.description_en, hint: r.subcategory, flag110: r.voltage110OnlySuspect === true });
    if (!aisle.startsWith("tech_")) { hold(aisle); continue; }
    const brand = Array.isArray(r.brand) ? String(r.brand[0] || "") : String(r.brand || "");
    const it = { name, brand: brand.trim(), price, currency: "USD", image: imgs[0], images: imgs, url: r.url || "",
      sku: String(r.itemNumber), description: "", description_en: String(r.description_en || "").trim(),
      retailer: "costco", type: String(r.subcategory || ""), department: "electronics" };
    if (r.gtin) it.upc = String(r.gtin);
    const was = Number(r.compareAtPrice);
    if (r.onSale === true && was > price) { it.originalPrice = was; it.onSale = true; }
    if (isShippableItem && !isShippableItem(it)) { hold("site-unshippable (bulk / weight)"); continue; }
    push(departments, aisle, it);
  }
  return { departments: ordered(departments), held };
}

export function normalizeMicroCenter(rows, { isShippableItem } = {}) {
  const held = {}, departments = {}, seen = new Set();
  const hold = (w) => { held[w] = (held[w] || 0) + 1; };
  for (const r of rows) {
    if (!r || !(Number(r.shippable_quantity) > 0)) { hold("not shippable to home"); continue; }
    if (seen.has(r.product_id)) { hold("duplicate"); continue; }
    seen.add(r.product_id);
    const price = Number(r.price);
    if (!(price > 0)) { hold("no price"); continue; }
    if (!realPhoto(r.image)) { hold("no photo"); continue; }
    const name = decodeTitle(r.title);
    const aisle = gate({ name, description: typeof r.specs === "string" ? r.specs : JSON.stringify(r.specs || {}), hint: r.category, flag110: r.voltage_110v_only_flag === true });
    if (!aisle.startsWith("tech_")) { hold(aisle); continue; }
    const it = { name, brand: String(r.brand || "").trim(), price, currency: "USD", image: r.image, images: [r.image], url: r.url || "",
      sku: String(r.sku || r.product_id), description: "", retailer: "microcenter", type: String(r.category || ""), department: "electronics" };
    if (r.upc) it.upc = String(r.upc);
    const was = Number(r.compare_at_price);
    if (r.on_sale === true && was > price) { it.originalPrice = was; it.onSale = true; }
    if (Number(r.weight_kg) > 0) it.weightKg = Number(r.weight_kg);
    if (isShippableItem && !isShippableItem(it)) { hold("site-unshippable (bulk / weight)"); continue; }
    push(departments, aisle, it);
  }
  return { departments: ordered(departments), held };
}
