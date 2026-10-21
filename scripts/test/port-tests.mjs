/* ==================================================================
   PORT (#443, sourcing audit step 2) -- AN OFF-SALE PRODUCT PORTS TO A
   LIVE LANE ONLY WHEN IT IS PROVABLY THE SAME PRODUCT.

   scripts/port-offsale-to-live.mjs matches products from the off-sale
   stores (/off-sale.js) to live-lane records already in the repo, and
   enriches the live record. This battery pins the rules:

     gtin       a product sharing a GTIN with a live record matches,
                and is sold under the live lane at the LIVE price (the
                dead store's price, url and retailer are never carried);
     model code a real match (LEGO set 75424, Best Buy -> Walmart) is
                searchable, priced and on its product page under Walmart
                at Walmart's price, with the ported photos;
     name only  the Barbie Royal pair (c.6299236303) and an identical
                title with no identifier do NOT match; a code shared by
                several products (a model line in many colourways)
                matches nothing;
     off sale   an unmatched off-sale product stays off sale: retained
                on disk, never searchable, never priced;
     data       every ported record names only allowed fields, keeps its
                own price/url/retailer/sizes, and the script is
                idempotent (a dry re-run writes exactly what is on disk).

   RUN: node scripts/test/port-tests.mjs   (no network, no browser)
   ================================================================== */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const readJson = (f) => JSON.parse(read(f));

let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const PORT = await import(join(ROOT, "scripts/port-offsale-to-live.mjs"));
const { isOffSaleRetailer } = await import(join(ROOT, "scripts/lib/off-sale.js"));
const { productIdFor } = await import(join(ROOT, "scripts/lib/mcp/catalog.mjs"));
const { liftPage } = await import(join(ROOT, "scripts/build-pdp-slices.mjs"));
const { toRecord, matchAll, enrichmentFor, validGtin, loadRecords } = PORT;

const recs = loadRecords();
const findRec = (retailer, title) => recs.find((r) => r.retailer === retailer && r.name === title);
const index = readJson("assets/search/catalog-index.json");
const F = index.fields;
const rows = index.rows.map((r) => Object.fromEntries(F.map((k, i) => [k, r[i]])));
const priceIndex = readJson("price-index.json").prices;
const report = readJson("reports/port-remove-stores.json");
const P = liftPage();
function pdpRecords(title) {
  const k = P.norm(title);
  return readJson(`assets/pdp/p/${P.pdpShard(k)}.json`)[k] || [];
}

/* ---------------- GTIN ---------------- */
await check("GTIN: a product sharing a valid GTIN with a live record matches, under the live lane at the live price", async () => {
  const upc = "619659169930";
  assert(validGtin(upc), "fixture UPC must carry a valid check digit");
  assert(!validGtin("619659169931"), "a wrong check digit must not count as a GTIN");
  const dead = toRecord({ name: "Fixture Doll Deluxe", brand: "Fixture", price: 15.99, upc, url: "https://dead.example/p/1",
    image: "https://img.example/dead/1.jpg", images: ["https://img.example/dead/1.jpg", "https://img.example/dead/2.jpg", "https://img.example/dead/3.jpg"],
    description: "Una muñeca de colección con su vestido y sus accesorios, lista para jugar y para regalar a los niños." }, "target", "fixture.json", "target|departments|toys|0");
  /* The live record names its photo after the barcode (a Shopify store does). */
  const live = toRecord({ name: "Fixture Doll Deluxe Edition", brand: "Fixture", price: 10.97, url: "https://live.example/ip/9",
    image: `https://cdn.example/files/${upc}-1.jpg` }, "walmart", "fixture.json", "walmart|departments|toys|0");
  const res = matchAll([dead, live]);
  assert(res.matches.length === 1, "expected one match, got " + res.matches.length);
  const m = res.matches[0];
  assert(m.method === "gtin", "method " + m.method);
  assert(m.lives.length === 1 && m.lives[0].retailer === "walmart", "the retailer of record must be the live lane");
  assert(Number(m.lives[0].it.price) === 10.97, "the live price must stand");
  const ch = enrichmentFor(dead.it, live.it, live);
  for (const k of ["price", "url", "retailer", "originalPrice", "sizes", "availableSizes", "name", "title", "image"]) assert(!(k in ch), "never ported: " + k);
  assert(Array.isArray(ch.images) && ch.images[0] === live.it.image && ch.images.length === 4, "gallery: live photo first, dead photos after");
  assert(ch.description && ch.descriptionSource === "ported", "the Spanish description ports");
  return "walmart at $10.97, the dead $15.99 never carried";
});

/* ---------------- a real model-code match ---------------- */
const AT_ST_LIVE = "LEGO Star Wars SMART Play: AT-ST Attack on Endor Toy Building Set for Kids - Compatible Set with 2 SMART Tags and 3 LEGO Minifigures - Gift for Boys, Girls and Fans Ages 8+ - 75424";
const AT_ST_DEAD = "LEGO - Star Wars SMART Play: AT-ST Attack on Endor 75424";
await check("model code: LEGO 75424 (Best Buy, off sale) is on sale under Walmart at Walmart's price, with the ported photos", async () => {
  const dead = findRec("bestbuy", AT_ST_DEAD), live = findRec("walmart", AT_ST_LIVE);
  assert(dead && live, "fixture records missing from the catalogues");
  const m = report.matches.find((x) => x.dead.retailer === "bestbuy" && x.dead.title === AT_ST_DEAD);
  assert(m && m.method === "model-code" && m.key === "75424", "the report must carry the 75424 match");
  assert(m.live.some((l) => l.retailer === "walmart" && l.title === AT_ST_LIVE), "matched to the Walmart listing");
  const livePrice = Number(live.it.price);
  assert(livePrice !== Number(dead.it.price), "fixture: the two stores' prices differ");
  /* Search: the Walmart row, at Walmart's price; no Best Buy row. */
  const row = rows.find((r) => r.retailer === "walmart" && r.title === AT_ST_LIVE);
  assert(row && row.price === livePrice, "search row under walmart at the live price");
  assert(!rows.some((r) => r.retailer === "bestbuy"), "no Best Buy row in search");
  /* Checkout: priced under Walmart, never under Best Buy. */
  assert(priceIndex[productIdFor("walmart", AT_ST_LIVE)], "walmart price-index entry");
  assert(!priceIndex[productIdFor("bestbuy", AT_ST_DEAD)], "no Best Buy price-index entry");
  /* Product page: the Walmart record, Walmart's price, the gallery grew. */
  const pdp = pdpRecords(AT_ST_LIVE).filter((r) => r.retailer === "walmart");
  assert(pdp.length && pdp.every((r) => r.price === livePrice), "PDP record under walmart at the live price");
  assert(pdp.some((r) => Array.isArray(r.images) && r.images.length > 2), "PDP gallery carries the ported photos");
  assert(live.it.portedFrom && live.it.portedFrom.fields.includes("images"), "the live record names what was ported");
  return `walmart $${livePrice}, Best Buy's $${dead.it.price} not carried`;
});

/* ---------------- name only never matches ---------------- */
const BARBIE_DEAD = "Barbie Royal Doll with Brightly Highlighted Hair, Butterfly-Print Skirt and Accessories";
const BARBIE_LIVE = "Barbie Royal Fashion Doll with Blonde Hair, Removable Skirt & Accessories [Walmart Exclusive]";
await check("name only: the Barbie Royal pair (c.6299236303) does NOT match", async () => {
  const dead = findRec("target", BARBIE_DEAD), live = findRec("walmart", BARBIE_LIVE);
  assert(dead && live, "both Barbie records must be in the catalogues");
  assert(matchAll([dead, live]).matches.length === 0, "the pair matched");
  assert(!report.matches.some((m) => m.dead.title === BARBIE_DEAD || m.live.some((l) => l.title === BARBIE_LIVE)), "the report carries a Barbie Royal match");
  assert(!live.it.portedFrom, "the Walmart doll must keep its own data");
  return "Target $" + dead.it.price + " doll vs Walmart $" + live.it.price + " doll: no match";
});
await check("name only: an identical title with no GTIN and no code does NOT match", async () => {
  const it = { name: "Sparkle Pony Plush Friend", brand: "Toyco", price: 12 };
  const res = matchAll([toRecord({ ...it, url: "https://dead.example/a" }, "target"), toRecord({ ...it, url: "https://live.example/a" }, "walmart")]);
  assert(res.matches.length === 0, "an identical title matched without an identifier");
});
await check("model line: a code several dead products share (colourways) matches nothing", async () => {
  const live = toRecord({ name: "Asics Gel-1130 Sneaker", brand: "Asics", price: 110, url: "https://live.example/g" }, "revolve");
  const d1 = toRecord({ name: "ASICS GEL-1130 - Men's", brand: "ASICS", price: 110, url: "https://dead.example/g1" }, "footlocker");
  const d2 = toRecord({ name: "ASICS GEL-1130 - Men's", brand: "ASICS", price: 110, url: "https://dead.example/g2" }, "footlocker");
  const res = matchAll([live, d1, d2]);
  assert(res.matches.length === 0, "a model line matched");
  assert(res.rejects.some((r) => r.reason === "code-shared-by-several-dead-products"), "rejected for the shared code");
});
await check("variants: the same code with a conflicting capacity does NOT match", async () => {
  const dead = toRecord({ name: "SanDisk Ultra Flash Drive SDCZ48 128GB", brand: "SanDisk", price: 20, url: "https://dead.example/s" }, "bestbuy");
  const live = toRecord({ name: "SanDisk Ultra Flash Drive SDCZ48 256GB", brand: "SanDisk", price: 25, url: "https://live.example/s" }, "walmart");
  const res = matchAll([dead, live]);
  assert(res.matches.length === 0, "128GB matched 256GB");
  assert(res.rejects.some((r) => r.reason === "variant-quantity"), "rejected as a variant conflict");
});

/* ---------------- unmatched stays off sale ---------------- */
await check("unmatched: the Target Barbie Royal Doll stays off sale, data retained", async () => {
  const dead = findRec("target", BARBIE_DEAD);
  assert(dead && isOffSaleRetailer(dead.retailer), "retained on disk under its off-sale store");
  assert(!rows.some((r) => r.retailer === "target"), "no Target row in search");
  assert(!priceIndex[productIdFor("target", BARBIE_DEAD)], "no Target price");
  const s = report.stores.target;
  assert(s.offSale + s.resourced === s.catalogueProducts, "every Target product is either off sale or re-sourced");
  return `target: ${s.offSale} off sale, ${s.resourced} re-sourced of ${s.catalogueProducts}`;
});

/* ---------------- the ported data ---------------- */
const ALLOWED = new Set(["images", "weightKg", "weightEstimated", "description", "descriptionSource", "description_en", "variantAttributes"]);
await check("ported records: only allowed fields, only on live records, never price/url/retailer/sizes", async () => {
  let n = 0;
  for (const r of recs) {
    const pf = r.it.portedFrom;
    if (!pf) continue;
    n++;
    assert(!isOffSaleRetailer(r.retailer), "a port landed on an off-sale record: " + r.name);
    assert(isOffSaleRetailer(pf.from), "a port came from a live store: " + pf.from);
    assert(pf.method === "gtin" || pf.method === "model-code", "unknown method " + pf.method);
    for (const f of pf.fields) assert(ALLOWED.has(f), "field not allowed to port: " + f);
    assert(!("url" in pf) && !("price" in pf), "the dead store's url/price must not be carried");
  }
  assert(n > 0, "no ported record on disk");
  return n + " ported listings";
});
await check("idempotent: a dry re-run writes exactly the ports already on disk", async () => {
  const onDisk = recs.filter((r) => r.it.portedFrom).length;
  const { report: rep } = PORT.run({ dry: true, log: () => {} });
  assert(rep.json.recordsWritten === onDisk, `dry run would write ${rep.json.recordsWritten}, disk has ${onDisk}`);
  assert(rep.json.matches.length === report.matches.length, "the committed report is stale: re-run the script");
});
await check("surgical: a revert restores a ported listing's prior bytes", async () => {
  const it = { title: "LEGO X 12345", price: 9.5, description: "1 2 3", url: "u" };
  const style = { py: false, ascii: false };
  const before = JSON.stringify({ retailers: { walmart: { departments: { toys: { items: [it] } } } } });
  const spans = PORT.itemSpans(before);
  const [s, e] = spans.get("walmart|departments|toys|0");
  const obj = before.slice(s, e);
  const ported = before.slice(0, s) + PORT.editObjectText(obj, { description: "Una descripción larga en español para el juguete de construcción.", descriptionSource: "ported",
    portedFrom: { from: "target", id: "x", method: "model-code", fields: ["description", "descriptionSource"], prior: { description: "1 2 3" } } }, style) + before.slice(e);
  assert(JSON.parse(ported).retailers.walmart.departments.toys.items[0].price === 9.5, "price untouched");
  const back = PORT.revertText(ported, style, PORT.itemSpans(ported)).text;
  assert(back === before, "revert did not restore the original bytes");
});

console.log(`\nport: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
