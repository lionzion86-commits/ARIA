/* ============================================================
   BRANDSMART USA -- the 2026-10-28 pull into the catalogue (Build Order B,
   #443; data drop on branch brandsmart-2026-10-28).

   The drop is the house schema already (Spanish `description`, the
   English in `descriptionEn`, real Shopify photos, grams from the feed,
   compare-at prices). What this file decides is what SELLS:

   - the drop's own scope flags (TVs, the large-appliance stray) are cut;
   - the kitchen food-prep bucket (knife blocks, non-electric gadgets) is
     not this store's electronics core and stays out (the drop files it
     separately so the build can leave it);
   - THE 220 V GATE (Order B, non-negotiable): an electrical item sells
     only where its rating covers 220 V. The drop's own reading
     (flag110vOnly, voltageClass) wins; otherwise the Walmart write-stage
     verdict, tightened for an electronics store: every small appliance
     and every wall-powered device class below is mains, so an unstated
     rating is held (display-off), never guessed. Battery and USB-charged
     devices (phones, laptops, tablets, cameras, earbuds, watches) are not
     mains-rated, as in the Walmart doctrine. Car audio is 12 V gear.
   - lithium as cargo: portable power stations and loose lithium cells
     are air-freight dangerous goods; held for a courier ruling. Devices
     with their battery inside are not this class.
   - the site's own shippable rule (no TVs, no bulky freight, nothing over
     the parcel weight) runs last, as on every other surface.
   Nothing is deleted: every held row is counted in the report by reason.
   ============================================================ */
import { voltageVerdict, conditionOf, lockedPhone } from "./walmart-write.js";
import { techAisle, isTechProduct, TECH_AISLE_LABELS, TECH_AISLE_ORDER } from "./tech-aisle.js";

/* The aisles are scripts/lib/tech-aisle.js's, by product TYPE (the
   aisle-truth audit, c.6476569113): one rule for every electronics store.
   Bucket keys are tech_*: unique to Electrónica, so no other store's
   "audio" or "accesorios" rides in with them. */
export const AISLE_LABELS = TECH_AISLE_LABELS;
export const AISLE_ORDER = TECH_AISLE_ORDER;
export const TECH_BUCKETS = AISLE_ORDER;

/* Wall-powered device classes the Walmart verdict reads as not-mains. */
const WALL_DEVICE_RX = /\b(desktops?|all-in-one pc|monitors?|printers?|consoles?|playstation ?5|ps5|xbox series|soundbars?|sound bars?|receivers?|turntables?|record players?|home theater|projectors?|streaming (device|player|stick)|media player|roku|apple tv|fire tv|chromecast|party speakers?|tower speakers?|powered speakers?|bookshelf speakers?|studio monitors?|subwoofers?|surge|power strips?|outlets?|battery backup|ups\b|\d{3,4}\s?va\b|wall chargers?|power adapters?|ac adapters?|charging stations?|smart plugs?|wall plugs?|plug-in|fog machines?|massagers?|routers?|mesh (wifi|wi-fi|system)|modems?)\b/i;
const NOT_MAINS_RX = /\b(battery[- ](operated|powered)|rechargeable|cordless|usb[- ](powered|rechargeable)|solar[- ]powered)\b/i;
/* What a wall-device word names without being one: a controller "for PS5",
   a console headset, a soundbar's bracket, a speaker cable, a passive
   speaker, a blood-pressure "monitor". */
const ACCESSORY_RX = /\b(controllers?|headsets?|headphones|earbuds|brackets?|mounts?|stands?|cables?|selector|passive|blood pressure|heart rate|calculator)\b/i;
/* Battery devices that charge from an adapter: not mains-rated (the
   Walmart doctrine), unless the listing bundles a wall charger. */
const BATTERY_DEVICE_RX = /\b(laptops?|notebooks?|chromebooks?|macbook|omnibook|tablets?|ipad|smartphones?|iphone|galaxy)\b/i;
const DANGEROUS_LITHIUM_RX = /\bportable power station\b|\bpower station\b|\blithium\b.*\bbatter(y|ies)\b|\bbatter(y|ies)\b.*\blithium\b/i;

/** "sell" or the hold reason, for one in-scope row. */
export function voltageGate(r) {
  if (r.flag110vOnly) return "excluded-110v";
  if (r.voltageClass === "covers-220v") return "sell";
  if (r.subcategory === "car-audio" && !/\b(soundbar|home theater)\b/i.test(r.name)) return "sell";
  const text = `${r.descriptionEn || ""} ${r.voltageSpec || ""}`;
  const v = voltageVerdict(r.name, text);
  if (v === "verified") return "sell";
  if (v === "excluded-110v") return "excluded-110v";
  const wall = WALL_DEVICE_RX.test(r.name);
  if (BATTERY_DEVICE_RX.test(r.name) && !wall && r.subcategory !== "small-appliances") return "sell";
  if (v !== "not-mains" && !(ACCESSORY_RX.test(r.name) && r.subcategory !== "small-appliances")) return "held-voltage-unstated";
  /* A small appliance is mains even when "cordless" (a kettle on its
     base, a stick vacuum on its dock): it sells only with 220 V stated. */
  if (r.subcategory === "small-appliances") return "held-voltage-unstated";
  if (wall && !ACCESSORY_RX.test(r.name) && !(NOT_MAINS_RX.test(r.name) && !/\bvacuum\b/i.test(r.name))) return "held-voltage-unstated";
  return "sell";
}

const realPhoto = (u) => typeof u === "string" && /^https:\/\/cdn\.shopify\.com\//.test(u);

/** { departments, held } from the drop's rows. `isShippableItem` is the site's rule. */
export function normalizeBrandsmart(rows, { isShippableItem } = {}) {
  const held = {};
  const hold = (why) => { held[why] = (held[why] || 0) + 1; };
  const seen = new Set();
  const departments = {};
  for (const r of rows) {
    if (!r || r.type !== "product") continue;
    if (r.outOfScope) { hold("out-of-scope (TV / large appliance)"); continue; }
    if (r.subcategory === "kitchen-food-prep") { hold("kitchen food-prep (not the electronics core)"); continue; }
    if (r.subcategory !== "small-appliances" && !isTechProduct(r.name, r.subcategory)) { hold("not electronics (re-route)"); continue; }
    const aisle = r.subcategory === "small-appliances" ? "tech_electro" : techAisle(r.name, r.subcategory);
    if (r.inStock === false || r.availability !== "in_stock") { hold("out of stock"); continue; }
    if (seen.has(r.productId)) { hold("duplicate"); continue; }
    seen.add(r.productId);
    const price = Number(r.price);
    if (!(price > 0) || r.currency !== "USD") { hold("no price"); continue; }
    const images = (Array.isArray(r.images) && r.images.length ? r.images : [r.image]).filter(realPhoto);
    if (!images.length) { hold("no photo"); continue; }
    if (DANGEROUS_LITHIUM_RX.test(r.name)) { hold("lithium cargo (courier ruling)"); continue; }
    /* Condition is disclosed from the title on every page (/condition.js);
       a refurbished or used phone sells unlocked only. */
    const cond = conditionOf(r.name, "electronics");
    if (cond && cond.excluded) { hold(cond.excluded); continue; }
    if (cond && lockedPhone(r.name)) { hold("refurbished phone not unlocked"); continue; }
    const gate = voltageGate(r);
    if (gate !== "sell") { hold(gate); continue; }
    /* English is never shown: a "translation" that came back as the
       English (a bare product name) is a deliberate empty. */
    const es = String(r.description || "").trim(), en = String(r.descriptionEn || "").trim();
    const it = { name: String(r.name).trim(), brand: String(r.brand || "").trim(), price, currency: "USD",
      image: images[0], images, url: r.canonicalUrl || r.url || "", sku: String(r.sku || ""),
      description: es && es !== en ? es : "", description_en: en,
      retailer: "brandsmart", type: aisle };
    if (r.weightKg > 0) it.weightKg = Math.round(r.weightKg * 1000) / 1000;
    if (r.dimensionsIn) it.dimensionsIn = r.dimensionsIn;
    const was = Number(r.compareAtPrice);
    if (r.onSale === true && was > price) { it.originalPrice = was; it.onSale = true; }
    if (isShippableItem && !isShippableItem(it)) { hold("site-unshippable (bulk / weight)"); continue; }
    (departments[aisle] ||= { label: AISLE_LABELS[aisle], items: [] }).items.push(it);
  }
  const ordered = {};
  for (const k of AISLE_ORDER) if (departments[k]) ordered[k] = departments[k];
  return { departments: ordered, held };
}
