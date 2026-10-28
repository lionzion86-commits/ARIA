/* ==================================================================
   QA MIS-ROUTING SWEEP (#443 c.6458236993): toys in Ropa, plush in
   Sombreros, a toddler toy in Accesorios, a model kit in Zapatos.

   Held here: the name classifier's new nouns and cuts (product-type.js,
   lifted from the bundle), the store-bucket fallback for a name and type
   that say nothing (Walmart's "toys", "beauty", "small_home"), and the
   built storefronts carrying none of the cases this sweep found.

     node scripts/test/qa-misrouting-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
const win = {};
vm.runInNewContext(readFileSync(ROOT + "product-type.js", "utf8"), { window: win });
const PT = win.AriaProductType;
const cls = (name, bucket = "", retailer = "walmart") => PT.classify({ name, retailer, bucket });
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("the name names it: home, beauty, fitness, toys and film nouns the table lacked", () => {
  const cases = [
    ["Lux Decor Collection Full Fitted Sheet - Deep Pocket", "hogar"],
    ["Crock-Pot Manual 7-Quart Slow Cooker, Mussel Grey", "hogar"],
    ["14-Piece Vegetable Chopper & Mandoline Slicer", "hogar"],
    ["L'Oreal Paris Excellence Creme Permanent Hair Color", "belleza"],
    ["TRESemme Ultra Fine Hairspray For 24-Hour Frizz Control", "belleza"],
    ["MODVEL Knee Brace, Black, XXX-Large", "deportes"],
    ["Gaiam 10mm Fitness Mat", "deportes"],
    ["Best Choice Products 1/24 RC Lamborghini Veneno Sport Racing Car", "juguetes"],
    ["Lionel HO Scale The Polar Express Model Train Set", "juguetes"],
    ["Troy Limited Edition (4K Ultra HD) Region Free", "electronica"],
  ];
  for (const [n, want] of cases) assert.equal(cls(n), want, n);
});

check("a doll wearing an outfit is a doll; a Beanie Boo is a plush; a toddler toy watch is a toy; MOC is not a moccasin", () => {
  assert.equal(cls("Barbie Fashionistas Doll #228 Blind Barbie Doll Wearing Pastel Outfit with Cane"), "juguetes");
  assert.equal(cls("TY Beanie Boos - Paw Patrol ZUMA the Labrador 6\" Plush Stuffed Animal Toy"), "juguetes");
  assert.equal(cls("VTech Bluey Wackadoo Watch - Bluey Baby and Toddler Toys"), "juguetes");
  assert.equal(cls("V12 Engine Model Kit that Runs - Visible MOC Physical Science Car Engine Project, STEM Building Engineering Toy Set"), "juguetes");
  assert.equal(cls("Slouchy Knit Beanie - Black"), "sombreros");
  assert.equal(cls("Minnetonka Women's Kilty Moc"), "zapatos");
  assert.equal(cls("Minnetonka Moc Toe Boot"), "zapatos");
});

check("a silent name takes the store's aisle, never Ropa by default; garments stay garments", () => {
  assert.equal(cls("SOA TWISTER", "toys"), "juguetes");
  assert.equal(cls("Bowser Jr con pincel de pintura", "toys"), "juguetes");
  assert.equal(cls("Masque Bar Mistle Toe Gift Set", "beauty"), "belleza");
  assert.equal(cls("Bala 5mm Play Mat", "sporting_goods"), "deportes");
  assert.equal(cls("Classic Tank", "beauty"), "ropa", "a garment noun outranks the aisle");
  assert.equal(cls("adidas LAFC 2023/24 Match Away", "sporting_goods"), "ropa", "a match shirt is clothing");
  assert.equal(cls("Juniors' Sportswear Dri-FIT Tracksuit", "sporting_goods"), "ropa");
  assert.equal(cls("Girls' One Dri-FIT Training Tight", "sporting_goods"), "ropa");
  assert.equal(cls("Inez Washable Silk Eye Mask", "sleep", "eberjey"), "accesorios", "a sleep mask is not skincare");
  assert.equal(cls("Wolf Tee", "fashion"), "ropa");
});

check("the storefronts: none of the sweep's cases in Ropa, Sombreros, Accesorios or Zapatos", () => {
  const fn = JSON.parse(readFileSync(ROOT + "assets/tienda/_fn/walmart.json", "utf8"));
  const names = (k) => (fn.rails[k] || []).map((i) => fn.rows[i][0]);
  const bad = [
    ["t-ropa", /\b(rc|remote control|radio control+ed)\b.*\b(car|truck|vehicle)s?\b|\btrain set\b|\blorcana\b|\bhair colou?r\b|\bslow cooker\b|\bfitted sheet\b/i],
    ["t-sombreros", /\bbeanie (boos?|babies)\b/i],
    ["t-accesorios", /\btoddler toys\b|\bminifigure\b/i],
    ["t-zapatos", /\bengine model kit\b/i],
  ];
  for (const [rail, rx] of bad) {
    const hits = names(rail).filter((n) => rx.test(n));
    assert.deepEqual(hits, [], `${rail}: ${hits.slice(0, 3).join(" / ")}`);
  }
  const ropa = names("t-ropa").length;
  assert.ok(ropa < 1100, `Walmart Ropa still holds ${ropa}`);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
