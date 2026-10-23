/* ============================================================
   THE WALMART DENSITY PROGRAM (#443, Danny's floor walk, 2026-10-22).

   "Walmart becomes the everything store": every department, best
   sellers and ALL sales, clearance LEADING every department (c.6349059353),
   toys and kids/baby first (c.6348590605 / c.6348917075), inside the
   pull-quality doctrine (c.6348482947) and one program-wide $200
   envelope (c.6349459813).

   TWO STAGES, because the listing actor cannot carry the doctrine:
     1. LISTING  devcake/walmart-product-scraper -- the actor the site
        already runs, real-test confirmed (apify-scrape-start.js):
        input { targets: [keyword | /browse/ URL], maxResults }. Its rows
        carry ONE image and almost never a weight, GTIN or description
        (department-cache-walmart.json: 0 of 4,323 with a second photo).
     2. DETAIL   e-commerce/walmart-product-detail-scraper -- the one
        tool proven to return full Walmart galleries (Lucifer's trial
        aoxcQRQvSKHx5XEOF: 7.6 distinct photos per product, UPC on some
        rows, full priceInfo; ~$2.90 per 1,000 incl. compute).
   The detail row wins for every field it fills; the listing row keeps
   what the detail row leaves empty (its sale flags, its slot).

   ASSUMPTIONS (stated so the paid TRIAL confirms or fixes them before
   any full run -- the trial prints a field report naming every raw key
   seen when a field is missing in more than half the rows):
     D1  The detail actor takes the product URLs as startUrls: [{url}].
         --detail-input-key renames it (productUrls / urls take plain
         strings).
     D2  Detail row fields, read tolerantly by detailToRow():
           images   allImages | images | imageUrls | imageInfo.allImages[].url
           price    priceInfo.currentPrice.price | priceInfo.price ("$9.97") | currentPrice | price
           was      priceInfo.wasPrice.price | wasPrice | listPrice
           gtin     upc | gtin | gtin13 | ean
           text     shortDescription | longDescription | description
           specs    specifications | specs | attributes
   Nothing here invents a product fact: a field none of these names
   carries stays empty and shows as a hole in the INGEST REPORT.

   THE WEIGHT GATE (c.6348501230 / c.6348533230): promotion needs a
   VERIFIED weight <= 5 kg. Items with no published weight, or over 5 kg,
   may live in catalogue depth but are flagged blastHold and never
   promoted. The second half of the gate (a US-vs-Peru price gap that
   survives freight) needs Peru prices this pull does not have: it is
   left to merchandising and the report says so.
   ============================================================ */
import { ingestRow as dswIngestRow, moneyOf, validGtin } from "./dsw.js";
import {
  COMPRESSED_GAS_RX, CAMP_CONTEXT_RX, ROOFTOP_TENT_RX, stripApplianceCare, TOOL_GUN_RX,
  LETHAL_BAIT_RX, PEST_DEVICE_RX, NON_CHEMICAL_RX, REPELLENT_RX, supplementVerdict, heavyByTitle,
  decodeVariantSizes, routeBucket, merchFlags, voltageVerdict, conditionOf, lockedPhone,
} from "./walmart-write.js";

export const WALMART_KEY = "walmart";
export const WALMART_LABEL = "Walmart";
export const OUT_FILE = "walmart-density-catalog.json";
export const WAVE_CAP_USD = 200;
export const LISTING_ACTOR = "devcake/walmart-product-scraper";
export const DETAIL_ACTOR = "e-commerce/walmart-product-detail-scraper";
export const DETAIL_INPUT_KEY = "startUrls";
export const DETAIL_URLS_PER_RUN = 500;
/* Listing actor: no measured rate in this repo -- the repo's default
   until the trial measures it (APIFY_COST_PER_1000_RESULTS_USD). Detail
   actor: Lucifer's trial actual, incl. compute. */
export const LISTING_USD_PER_1000 = 5.7;
export const DETAIL_USD_PER_1000 = 2.9;
export const USD_PER_RUN = 0.06;
export const BLAST_MAX_KG = 5;
export const PRICE_BAND_USD = { min: 2, max: 1500 };

/* ---------------- the plan ---------------- */
/* Departments in Danny's priority order. Within each, clearance and
   rollback terms come FIRST (the clearance-lead doctrine), then best
   sellers, then the named depth. `bucket` is the site's existing Walmart
   department key where one exists (department-cache-walmart.json);
   kids_baby, outdoors and hardware are new and need storefront wiring
   when their catalogue lands. `perTerm` is the listing cap per term. */
export const DENSITY_PLAN = [
  { dept: "toys", bucket: "toys_games", priority: 1, perTerm: 120, terms: [
    "toys clearance", "toys rollback", "best selling toys",
    "bluey toys", "barbie", "hot wheels", "fisher-price little people", "little tikes", "lego",
    "board games", "monopoly", "pokemon cards", "plush toys", "lol surprise", "hello kitty toys",
    "funko pop", "dragon ball figure", "marvel action figures", "star wars figures", "baby toys"] },
  { dept: "kids_baby", bucket: "kids_baby", priority: 1, perTerm: 120, terms: [
    "kids clothing clearance", "baby clothing clearance", "kids shoes clearance",
    "kids shoes", "toddler shoes", "baby clothes", "kids character pajamas", "girls dresses",
    "boys clothing", "kids character slippers", "baby car seat", "infant car seat", "stroller accessories"] },
  { dept: "jewelry", bucket: "jewelry_accessories", priority: 2, perTerm: 120, terms: [
    "fashion jewelry clearance", "fashion jewelry", "earrings", "necklaces", "bracelets", "rings", "watches women", "watches men"] },
  { dept: "electronics", bucket: "electronics", priority: 2, perTerm: 120, terms: [
    "electronics clearance", "electronics rollback", "laptops", "headphones", "gaming headset", "earbuds",
    "bluetooth speaker", "playstation 5 games", "nintendo switch games", "xbox controller",
    "keyboard and mouse", "usb cables", "computer accessories", "printers", "ink cartridges"] },
  { dept: "sporting", bucket: "fitness", priority: 2, perTerm: 100, terms: [
    "sporting goods clearance", "resistance bands", "yoga mat", "foam roller", "kettlebell", "massage gun",
    "owala water bottle", "insulated tumbler", "soccer ball", "bike pump", "boxing gloves", "pool float lounge"] },
  { dept: "outdoors", bucket: "outdoors", priority: 3, perTerm: 100, terms: [
    "camping clearance", "tent", "sleeping bag", "camping cookware", "igloo cooler", "lantern",
    "flashlight", "backpack", "fishing rod and reel combo", "fishing tackle", "camping chair"] },
  { dept: "hardware", bucket: "hardware", priority: 3, perTerm: 100, terms: [
    "tools clearance", "cordless drill", "drill bits", "screwdriver set", "socket set", "wrench set",
    "mechanic tool set", "work gloves", "tool set"] },
  { dept: "basics", bucket: "mens", priority: 3, perTerm: 100, terms: [
    "underwear clearance", "socks multipack", "and1 socks", "hanes underwear multipack", "fruit of the loom underwear", "hanes t-shirts pack"] },
  { dept: "apparel", bucket: "fashion", priority: 3, perTerm: 120, terms: [
    "clothing clearance", "graphic tees", "band t-shirts", "womens jeans", "mens jeans", "jean jacket",
    "womens shorts", "mens shorts", "womens tops", "dresses"] },
  { dept: "shoes", bucket: "shoes", priority: 3, perTerm: 120, terms: [
    "shoes clearance", "womens sneakers", "mens sneakers", "sandals", "slippers"] },
  { dept: "home", bucket: "home_decor", priority: 4, perTerm: 100, terms: [
    "home clearance", "pillows", "comforter set", "sheet set", "towels", "cookware set", "storage bins",
    "diamond painting kit", "craft kits", "art supplies", "faux flowers", "glue traps", "mouse traps", "fly ribbon"] },
  { dept: "seasonal", bucket: "home_decor", priority: 4, perTerm: 100, terms: [
    "christmas clearance", "halloween clearance", "christmas decorations", "christmas lights", "christmas ornaments"] },
  { dept: "instruments", bucket: "electronics", priority: 4, perTerm: 60, terms: [
    "musical instruments clearance", "acoustic guitar", "electric keyboard piano", "ukulele", "guitar accessories"] },
  { dept: "personal_care", bucket: "beauty", priority: 4, perTerm: 80, terms: [
    "beauty clearance", "shampoo", "toothpaste", "face cream", "body lotion"] },
];

/** The listing runs, in the order they run: priority, then plan order. */
export function listingPlan({ only = null, perTermMax = null } = {}) {
  const runs = [];
  for (const d of DENSITY_PLAN) {
    if (only && !only.includes(d.dept)) continue;
    d.terms.forEach((term, i) => runs.push({
      dept: d.dept, bucket: d.bucket, priority: d.priority, term,
      clearance: /clearance|rollback/i.test(term), order: runs.length + i,
      maxItems: Math.max(1, Math.min(Number(perTermMax) || d.perTerm, d.perTerm)),
    }));
  }
  return runs.sort((a, b) => a.priority - b.priority || a.order - b.order);
}

/** The listing actor's input (the site's own, real-test confirmed shape). */
export function listingInput(run) {
  return { targets: [run.target || run.term], maxResults: run.maxItems };
}

/** The detail actor's input (assumption D1). */
export function detailInput(urls, key = DETAIL_INPUT_KEY) {
  return { [key]: key === "startUrls" ? urls.map((url) => ({ url })) : urls.slice() };
}

/* ---------------- the estimate ---------------- */
const cents = (x) => Math.round(x * 100) / 100;

export function ratesFromEnv(env = process.env) {
  const n = (v, d) => (v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    perRun: n(env.APIFY_COST_PER_RUN_USD, USD_PER_RUN),
    listingPer1000: n(env.WALMART_LISTING_COST_PER_1000_USD, LISTING_USD_PER_1000),
    detailPer1000: n(env.WALMART_DETAIL_COST_PER_1000_USD, DETAIL_USD_PER_1000),
  };
}

/**
 * The quote for a plan. Listing rows are paid per row returned (capped);
 * every listed product then gets one detail row. A product listed under
 * two terms is paid twice in the listing and once in the detail (the
 * detail pass de-duplicates by URL first) -- `dupShare` is the expected
 * share of repeats, 0.15 by default until the trial measures it.
 */
export function estimateProgram(plan, rates, { capUsd = WAVE_CAP_USD, spentBeforeUsd = 0, dupShare = 0.15 } = {}) {
  const listedMax = plan.reduce((s, r) => s + r.maxItems, 0);
  const detailRows = Math.round(listedMax * (1 - dupShare));
  const detailRuns = Math.ceil(detailRows / DETAIL_URLS_PER_RUN);
  const listingUsd = cents(plan.length * rates.perRun + (listedMax * rates.listingPer1000) / 1000);
  const detailUsd = cents(detailRuns * rates.perRun + (detailRows * rates.detailPer1000) / 1000);
  const byDept = {};
  for (const r of plan) {
    const d = byDept[r.dept] = byDept[r.dept] || { dept: r.dept, priority: r.priority, runs: 0, listedMax: 0, usd: 0 };
    d.runs++; d.listedMax += r.maxItems;
    d.usd = cents(d.usd + rates.perRun + (r.maxItems * rates.listingPer1000) / 1000 + (r.maxItems * (1 - dupShare) * rates.detailPer1000) / 1000);
  }
  const estimateUsd = cents(listingUsd + detailUsd);
  const capRemainingUsd = cents(Math.max(0, capUsd - (Number(spentBeforeUsd) || 0)));
  return { listingRuns: plan.length, listedMax, detailRows, detailRuns, listingUsd, detailUsd, estimateUsd,
    capUsd, spentBeforeUsd: cents(Number(spentBeforeUsd) || 0), capRemainingUsd, overCap: estimateUsd > capRemainingUsd,
    depts: Object.values(byDept), rates, dupShare };
}

export function formatProgramEstimate(est) {
  const out = [];
  const $ = (x) => `$${x.toFixed(2)}`;
  out.push("");
  out.push("  ====================================================");
  out.push("  ESTIMATED COST — Walmart density program (Apify usage only)");
  out.push("  ====================================================");
  for (const d of est.depts) out.push(`    p${d.priority}  ${d.dept.padEnd(14)} ${String(d.runs).padStart(3)} listing runs, up to ${String(d.listedMax).padStart(5)} products  ~${$(d.usd)}`);
  out.push(`  listing: ${est.listingRuns} runs, up to ${est.listedMax.toLocaleString("en-US")} rows  ~${$(est.listingUsd)}  (${LISTING_ACTOR}, $${est.rates.listingPer1000.toFixed(2)}/1,000)`);
  out.push(`  detail:  ${est.detailRuns} runs, ~${est.detailRows.toLocaleString("en-US")} products  ~${$(est.detailUsd)}  (${DETAIL_ACTOR}, $${est.rates.detailPer1000.toFixed(2)}/1,000; ${Math.round(est.dupShare * 100)}% repeats assumed)`);
  out.push(`  ESTIMATED COST: ~${$(est.estimateUsd)}`);
  out.push(`  program envelope: ${$(est.capUsd)}, already spent ${$(est.spentBeforeUsd)} (--spent-usd), left ${$(est.capRemainingUsd)}`);
  if (est.overCap) out.push("  OVER THE ENVELOPE: narrow with --only <depts> or --per-term-max before --confirm-spend.");
  out.push("  ====================================================");
  return out.join("\n");
}

/* ---------------- what never enters ---------------- */
/* Standing exclusions plus Danny's walk rulings. The site's own
   isShippableItem (TVs, bulky freight, > 15 kg) runs after these. */
export const EXCLUSIONS = [
  ["furniture", /\b(sofa|couch|sectional|loveseat|recliner|dresser|chest of drawers|bookcase|dining table|bed frame|mattress|wardrobe|armoire|futon)\b/i],
  ["large-appliance", /\b(refrigerator|mini fridge|chest freezer|upright freezer|washing machine|clothes dryer|dishwasher|electric range|gas range|wall oven|window air conditioner|portable air conditioner)\b/i],
  ["supplement", /\b(vitamins?|supplements?|protein powder|pre-?workout|creatine|probiotics?|melatonin|multivitamin)\b/i],
  /* Aerosols are UN1950 dangerous goods for air freight (Danny's pest
     ruling, c.6348546985); pesticides also need DIGESA registration. */
  ["dangerous-goods", /\b(insecticide|pesticide|herbicide|aerosol|raid|termite|bug spray|fogger|roach killer|ant killer|propane|butane|fuel canister|lighter fluid|kerosene|camp fuel)\b/i],
  ["firearm", /\b(firearms?|rifles?|shotguns?|pistols?|handguns?|ammo|ammunition|riflescopes?|rifle scopes?|air rifles?|bb guns?|pellet guns?)\b/i],
  ["food-import", /\b(freeze[- ]dried (meals?|food)|mre|emergency food)\b/i],
];
/** null when the row may enter, else "excluded-<kind>". The guards are the
    write-stage findings (#443 items 2-27); each says which item it is. */
export function exclusionOf(name, crumbs = "") {
  const hay = `${name} ${crumbs}`;
  /* Item 17 + Danny's ruling: lethal chemical pest control is out. */
  if (LETHAL_BAIT_RX.test(name)) return "excluded-dangerous-goods";
  /* Item 2: compressed-gas dusters are aerosols. */
  if (COMPRESSED_GAS_RX.test(name)) return "excluded-dangerous-goods";
  /* Item 3: a fitness weight the title states above the parcel line. */
  if (heavyByTitle(name)) return "excluded-heavy-by-title";
  for (const [kind, rx] of EXCLUSIONS) {
    /* A toy blaster is a toy; tool vocabulary is a tool (item 9). */
    if (kind === "firearm" && (/\b(nerf|toy|water gun|squirt)\b/i.test(hay) || TOOL_GUN_RX.test(name))) continue;
    /* Items 17/20: a device phrase outranks a brand token; repellents and
       "insecticide-free" goods are not the chemical class. */
    if (kind === "dangerous-goods") {
      if ((PEST_DEVICE_RX.test(name) || NON_CHEMICAL_RX.test(name) || REPELLENT_RX.test(name)) && !/\b(aerosol|spray can)\b/i.test(name)) continue;
    }
    /* Item 6: camp chairs, cots and airbeds are parcel goods. */
    if (kind === "furniture" && CAMP_CONTEXT_RX.test(hay) && !ROOFTOP_TENT_RX.test(name)) continue;
    /* Items 7/18: "dishwasher safe", fridge organizers, toy dryers. */
    if (kind === "large-appliance") { if (rx.test(stripApplianceCare(hay))) return `excluded-${kind}`; continue; }
    /* Item 27: a supplement needs ingestible form; topicals stay. */
    if (kind === "supplement") { if (supplementVerdict(name)) return `excluded-${kind}`; continue; }
    if (rx.test(hay)) return `excluded-${kind}`;
  }
  if (ROOFTOP_TENT_RX.test(name)) return "excluded-furniture";
  return null;
}

/* The listing actor names the product link productUrl, never url (trial
   c.6354958458: 0/20 rows had url). Every join and detail input reads it here. */
export function listingUrl(l) {
  return (l && (l.url || l.productUrl)) || null;
}

/* ---------------- reading the detail row (assumption D2) ---------------- */
const first = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
};
const at = (o, path) => path.split(".").reduce((x, k) => (x == null ? null : x[k]), o);

/** Every image URL the detail row lists, in its own order. */
export function detailImages(raw) {
  const pool = [];
  for (const k of ["allImages", "images", "imageUrls", "imageInfo.allImages", "imageInfo.thumbnailUrls", "image", "imageUrl", "thumbnailUrl"]) {
    const v = at(raw, k);
    if (Array.isArray(v)) pool.push(...v.map((x) => (x && typeof x === "object" ? first(x.url, x.src, x.large, x.main) : x)));
    else if (v) pool.push(v);
  }
  return pool.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
}

/**
 * One detail row (and its listing row, when there was one) in, a raw row
 * in the shape the shared ingest reads out. Only fills what a row states.
 */
export function detailToRow(detail, listing = null) {
  const d = detail || {};
  const l = listing || {};
  const row = {};
  row.name = first(d.name, d.title, d.productName, l.name, l.title);
  row.brand = first(typeof d.brand === "object" && d.brand ? d.brand.name : d.brand, l.brand);
  /* The trial (c.6354958458) showed priceInfo.price as a string ("$9.97")
     and wasPrice.price as a number; moneyOf reads both. */
  const price = moneyOf(first(at(d, "priceInfo.currentPrice.price"), at(d, "priceInfo.currentPrice"), at(d, "priceInfo.price"), d.currentPrice, d.price, l.price));
  if (price) row.price = price;
  const was = moneyOf(first(at(d, "priceInfo.wasPrice.price"), at(d, "priceInfo.wasPrice"), at(d, "wasPrice.price"), d.wasPrice, d.listPrice, l.originalPrice, l.regularPrice));
  if (was && price && was > price) row.originalPrice = was;
  /* Walmart.com prices are US dollars; the row's own currency wins when stated. */
  row.currency = String(first(at(d, "priceInfo.currentPrice.currencyUnit"), d.currency, "USD")).toUpperCase();
  const imgs = detailImages(d);
  row.images = imgs.length ? imgs : [l.image].filter(Boolean);
  const gtin = String(first(d.upc, d.gtin, d.gtin13, d.gtin12, d.ean) || "").replace(/\D/g, "");
  if (validGtin(gtin)) row.gtin = gtin;
  row.description = first(d.shortDescription, d.longDescription, d.description);
  const specs = first(d.specifications, d.specs, d.attributes);
  if (specs) row.specifications = specs;
  /* Items 12/15/21/22: the PDP's variantList carries the size run; the
     department decides which token families are sizes (ingestRow). */
  if (Array.isArray(d.variantList)) row.variantList = d.variantList;
  if (d.gender) row.pdpGender = String(d.gender);
  if (d.variants) row.variants = d.variants;
  else if (d.sizes || l.sizes) row.availableSizes = first(d.sizes, l.sizes);
  row.breadcrumbs = first(d.breadcrumbs, d.categoryPath, d.category, l.category);
  row.url = first(d.url, d.productUrl, d.canonicalUrl, listingUrl(l));
  row.productId = first(d.usItemId, d.itemId, d.productId, d.id, l.usItemId, l.id);
  const stock = first(d.availabilityStatus, d.availability, d.inStock);
  if (typeof stock === "boolean") row.inStock = stock; else if (stock != null) row.availability = String(stock);
  const seller = first(d.sellerName, at(d, "seller.name"), d.soldBy);
  if (seller) row.seller = String(seller);
  for (const k of Object.keys(row)) if (row[k] == null || row[k] === "") delete row[k];
  return row;
}

/* ---------------- ingest ---------------- */

/** The weight gate: may this item be promoted? */
export function blastVerdict(item) {
  if (!(item.weightEstimated === false && item.weightKg > 0)) return { blastEligible: false, blastHold: "no-published-weight" };
  if (item.weightKg > BLAST_MAX_KG) return { blastEligible: false, blastHold: "over-5kg" };
  return { blastEligible: true };
}

/**
 * One merged row in, one verdict out: the shared ingest (USD per row,
 * the band, shippable-only, gallery dedupe with size charts last, real
 * weight, checksum GTIN, sizes as published, the PDP's own sentences),
 * then the program's exclusions and the weight gate.
 */
export function ingestRow(raw, run, ctx = {}) {
  if (!raw || typeof raw !== "object") return { drop: "not-an-object" };
  const name = String(raw.name || "");
  const dept = (run && run.dept) || "";
  const crumbs = Array.isArray(raw.breadcrumbs) ? raw.breadcrumbs.join(" ") : String(raw.breadcrumbs || "");
  const ex = exclusionOf(name, crumbs);
  if (ex) return { drop: ex };
  /* Item 28: used clothing/footwear and used auto parts never enter. */
  const cond = conditionOf(name, dept);
  if (cond && cond.excluded) return { drop: cond.excluded };
  if (cond && lockedPhone(name)) return { drop: "excluded-locked-phone" };
  /* Items 25/26: the voltage gate. Held is not published -- never on a guess. */
  const volt = voltageVerdict(name, raw.description);
  if (volt === "excluded-110v") return { drop: "excluded-110v-only" };
  if (volt === "held-unstated" || volt === "held-contradicting") return { quarantine: `voltage-${volt.slice(5)}`, row: { name, url: raw.url || null } };
  /* Items 12/15/21/22: sizes the PDP lists in stock, verbatim. */
  if (raw.variantList && !(Array.isArray(raw.availableSizes) && raw.availableSizes.length) && !raw.variants) {
    const dec = decodeVariantSizes(raw.variantList, dept);
    if (dec.sizes.length) raw = { ...raw, availableSizes: dec.sizes };
    if (dec.widths.length) raw = { ...raw, widths: dec.widths };
    if (dec.review.length) raw = { ...raw, sizeReview: dec.review };
  }
  const v = dswIngestRow(raw, run, { ...ctx, band: ctx.band || PRICE_BAND_USD });
  if (!v.item) return v;
  const item = v.item;
  item.retailer = WALMART_KEY;
  if (item.description) item.descriptionSource = "walmart-pdp";
  if (raw.seller) item.seller = raw.seller;
  if (run && run.clearance) item.clearanceListing = true;
  if (volt === "verified") item.voltage = "dual-220";
  if (cond) { item.condition = cond.condition; item.conditionLabel = cond.label; }
  if (raw.widths) item.widths = raw.widths;
  if (raw.sizeReview) item.sizeReview = raw.sizeReview;
  if (raw.pdpGender) item.gender = raw.pdpGender;
  const flags = merchFlags(name);
  if (flags.length) item.merchReview = flags;
  Object.assign(item, blastVerdict(item));
  /* Safety gear: car seats are sold new and sealed; any manufacture or
     expiry date the PDP publishes is kept on the record (Danny). */
  if (/\bcar seat\b/i.test(item.name)) {
    item.safetyGear = true;
    const dates = (item.specifications || []).filter((s) => /manufactur|expir|date/i.test(s.name));
    if (dates.length) item.safetyDates = dates;
  }
  /* Items 11/13/15: age first, then the PDP's own gender. */
  return { item, id: v.id, bucket: routeBucket(run, name, raw.pdpGender) };
}

/**
 * The whole pull in ([{ run, rows }] in plan order: clearance first, so a
 * clearance copy wins the de-duplication), the catalogue envelope out,
 * with per-department expected-vs-actual coverage for the report.
 */
export function ingestProgram(pulled, ctx = {}) {
  const departments = {};
  const seen = new Set();
  const quarantined = [];
  const stats = { rows: 0, published: 0, quarantined: {}, dropped: {}, perDept: {}, gallery: 0, realWeight: 0, gtin: 0, described: 0, blastEligible: 0, blastHold: {} };
  for (const { run, rows } of pulled) {
    const pd = stats.perDept[run.dept] = stats.perDept[run.dept] || { expected: 0, listed: 0, published: 0, clearance: 0 };
    pd.expected += run.maxItems;
    for (const raw of rows || []) {
      stats.rows++; pd.listed++;
      const v = ingestRow(raw, run, ctx);
      if (v.quarantine) { stats.quarantined[v.quarantine] = (stats.quarantined[v.quarantine] || 0) + 1; quarantined.push({ reason: v.quarantine, dept: run.dept, row: v.row }); continue; }
      if (v.drop) { stats.dropped[v.drop] = (stats.dropped[v.drop] || 0) + 1; continue; }
      const key = v.id || v.item.url || v.item.name;
      if (seen.has(key)) { stats.dropped.duplicate = (stats.dropped.duplicate || 0) + 1; continue; }
      seen.add(key);
      (departments[v.bucket] = departments[v.bucket] || { label: v.bucket, items: [] }).items.push(v.item);
      pd.published++;
      if (v.item.clearanceListing) pd.clearance++;
      stats.published++;
      if (v.item.images.length > 1) stats.gallery++;
      if (v.item.weightEstimated === false) stats.realWeight++;
      if (v.item.gtin || v.item.variantGtins) stats.gtin++;
      if (v.item.description) stats.described++;
      if (v.item.blastEligible) stats.blastEligible++;
      else stats.blastHold[v.item.blastHold] = (stats.blastHold[v.item.blastHold] || 0) + 1;
    }
  }
  return {
    catalog: {
      generatedAt: ctx.generatedAt || new Date().toISOString(),
      source: "walmart.com (Apify: listing + detail) -- ingested by scripts/build-walmart-catalog.mjs",
      declaredProductCount: stats.published,
      retailers: { [WALMART_KEY]: { label: WALMART_LABEL, departments } },
    },
    quarantined,
    stats,
  };
}

export function productCount(catalog) {
  const r = catalog && catalog.retailers && catalog.retailers[WALMART_KEY];
  if (!r || !r.departments) return 0;
  return Object.values(r.departments).reduce((n, d) => n + ((d && Array.isArray(d.items)) ? d.items.length : 0), 0);
}

/* ---------------- the trial report ---------------- */

/**
 * What the paid trial proves before a full run: distinct photos per
 * product (render presets of one asset collapse, via the site's own
 * photoKey), GTIN, weight and description coverage, and -- for any of
 * those under half -- every raw key the detail rows carried.
 */
export function trialReport(details, { photoKey } = {}) {
  const n = details.length;
  const distinct = details.map((d) => new Set(detailImages(d).map((u) => (photoKey ? photoKey(u) : u)).filter(Boolean)).size);
  const has = (pred) => details.filter(pred).length;
  const cov = {
    rows: n,
    avgDistinctPhotos: n ? Math.round((distinct.reduce((a, b) => a + b, 0) / n) * 10) / 10 : 0,
    multiPhotoShare: n ? distinct.filter((k) => k > 1).length / n : 0,
    gtinShare: n ? has((d) => Boolean(detailToRow(d).gtin)) / n : 0,
    descriptionShare: n ? has((d) => Boolean(detailToRow(d).description)) / n : 0,
    specsShare: n ? has((d) => Boolean(detailToRow(d).specifications)) / n : 0,
    priceShare: n ? has((d) => Boolean(detailToRow(d).price)) / n : 0,
  };
  const keys = new Map();
  for (const d of details) for (const k of Object.keys(d || {})) keys.set(k, (keys.get(k) || 0) + 1);
  cov.rawKeys = [...keys.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}(${c})`);
  cov.pass = n > 0 && cov.multiPhotoShare >= 0.8 && cov.priceShare >= 0.95;
  return cov;
}

export function formatTrialReport(t) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const out = [];
  out.push("");
  out.push("  ====================================================");
  out.push("  TRIAL — gallery yield and field coverage (detail actor)");
  out.push("  ====================================================");
  out.push(`  rows: ${t.rows}`);
  out.push(`  distinct photos per product (presets collapsed): ${t.avgDistinctPhotos}   with 2+: ${pct(t.multiPhotoShare)}`);
  out.push(`  price ${pct(t.priceShare)}   GTIN ${pct(t.gtinShare)}   description ${pct(t.descriptionShare)}   spec table ${pct(t.specsShare)}`);
  if ([t.gtinShare, t.descriptionShare, t.specsShare, t.priceShare].some((x) => x < 0.5)) out.push(`  raw keys seen (fix detailToRow if a field is under 50%): ${t.rawKeys.slice(0, 40).join(", ")}`);
  out.push(`  VERDICT: ${t.pass ? "PASS -- the full run may be quoted" : "FAIL -- do not run the full pull on this actor/mapping"}`);
  out.push("  ====================================================");
  return out.join("\n");
}
