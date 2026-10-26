/* ==================================================================
   ZAPATOS IS SHOES, AND EACH AISLE IS ONE KIND (#443 c.6405702652).

   The audit: 1,579 of 8,994 Zapatos items (17.6%) were not footwear --
   skate trucks ("heel" inside "wHEELs"), bootcut jeans, a prenatal drink
   ("bota" inside "Botanical"), sock packs ("shoe" inside "Horseshoe"),
   slipper socks, a bralette -- because the department builder matched
   raw substrings and never called scripts/lib/footwear.js. Sandals filled
   Zapatillas and the front of the Shoes rail, split five ways, and an
   imageless card led Sandalias.

   These hold the fix: the audit's failure classes as fixtures, then the
   audit's acceptance re-run on the rebuilt slices.

     node scripts/test/zapatos-classification-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isShoeForDept, footwearClass, SHOE_CLASSES } from "../lib/footwear.js";
import { KIND_MATCH } from "../build-department-slices.mjs";
import { interleaveFront, photosFirst, FRONT, FRONT_CAP } from "../../netlify/functions/_department-core.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const admit = (title, type = "", retailer = "walmart") => KIND_MATCH.shoes((title + " " + type).toLowerCase(), { title, type, retailer });

check("the audit's failure classes stay out of Zapatos", () => {
  const out = [
    ["No Boundaries Juniors Bootcut Jeans"],                         // 'boot' in bootcut
    ["Vans Wheeling Sunglasses", "SUNGLASSES"],                       // 'heel' in wheeling
    ["Spitfire Formula Four Classic Wheels 54mm", "Trucks, ruedas y partes", "ccs"],
    ["Independent Stage 11 Trucks", "Trucks, ruedas y partes", "ccs"],
    ["Botanical Prenatal Drink Mix"],                                 // 'bota' in botanical
    ["Horseshoe Crew Socks 6 Pack"],                                  // 'shoe' in horseshoe
    ["Hot Topic Black Cat Slipper Socks", "", "hottopic"],            // slipper socks
    ["Lace Trim Bralette", "", "hottopic"],
    ["Remind Insoles Cush", "Zapatillas", "ccs"],                     // CCS types insoles as Zapatillas
    ["Vans Laces 54 inch", "Zapatillas", "ccs"],
    ["Touchscreen Glove Liner, Gray", "Botas, guantes y capuchas", "valsurf"],
    ["Barbie muñeca de fútbol con zapatillas"],
    ["Loungefly Disney Princess Boot Bouquet Enamel Pin", "Calzado", "hottopic"],
    ["Slide Diamond 32\" Surfskate Skateboard", "Sandalias", "surfstation"],
    ["CCS Logo Tee", "Polos y camisetas", "ccs"],
  ];
  for (const [t, ty, r] of out) assert.equal(admit(t, ty, r), false, t);
});

check("real shoes still get in, whatever the store calls them", () => {
  const inn = [
    ["Vans La Costa Slide-On Sandals", "Zapatillas", "ccs"],
    ["adidas Kids' F50 Club Messi FxG Soccer Cleats", "Chimpunes", "dicks"],
    ["adidas Kids Copa Pure III Club Turf Soccer Shoes", "Accesorios de fútbol", "prosoccer"],
    ["Nike Men's Offcourt Slide Sandals", "APPAREL", "zumiez"],
    ["Venum x Top Rank Original Boxing Shoes", "BOXING_SHOES", "venum"],
    ["Women's Kaiso Sneakers", "FOOTWEAR", "everlast"],
    ["Koi Black Halcyon Heel Boots", "Calzado", "hottopic"],
    ["suede mules", "WOMEN", "farfetch"],
    ["Men's Flip-Flops", "", "walmart"],
    ["New Balance 9060", "", "footlocker"],
  ];
  for (const [t, ty, r] of inn) assert.equal(admit(t, ty, r), true, t);
});

check("each shoe gets one Aria class: the title decides, sandals are never Zapatillas", () => {
  const cls = (title, type = "") => footwearClass({ title, type });
  assert.equal(cls("Vans La Costa Slide-On Sandals", "Zapatillas"), "Sandalias");
  assert.equal(cls("Black Heeled Sandals", "HEELED SANDALS"), "Sandalias");
  assert.equal(cls("adidas Predator Club FG/MG Soccer Cleats"), "Chimpunes");
  assert.equal(cls("Brown Leather Chelsea Boots"), "Botas y botines");
  assert.equal(cls("Black Bing 65 Heels"), "Tacones");
  assert.equal(cls("Ball Star sneakers with leather heel tab"), "Zapatillas", "a heel tab made a sneaker a heel");
  assert.equal(cls("UGG Women's Tazz Slippers"), "Mocasines y pantuflas");
  assert.equal(cls("Black Leather Oxfords", "SHOES"), "Zapatos");
  for (const c of [cls("anything", "SHOE"), cls("Nike Air Max 90")]) assert.ok(SHOE_CLASSES.includes(c));
});

check("the front of a mixed rail holds at most a quarter of any one class; photos lead", () => {
  /* 40 cheap sandals first, then three other classes: the front mixes */
  const items = [...Array(40)].map((_, i) => ({ type: "Sandalias", t: i }))
    .concat(...["Zapatillas", "Botas y botines", "Chimpunes"].map((ty, j) => [...Array(10)].map((_, i) => ({ type: ty, t: 100 * (j + 1) + i }))));
  const f = interleaveFront(items);
  assert.equal(f.length, items.length, "the interleave lost or duplicated cards");
  for (const ty of ["Sandalias", "Zapatillas", "Botas y botines", "Chimpunes"]) assert.ok(f.slice(0, FRONT).filter((p) => p.type === ty).length <= FRONT_CAP, ty + " takes the front");
  assert.deepEqual(photosFirst([{ image: "" }, { image: "a" }]).map((p) => p.image), ["a", ""]);
});

const rowsOf = (k) => JSON.parse(readFileSync(ROOT + `assets/sections/departamento/_fn/${k}.json`, "utf8")).rows.map((r) => ({ title: r[0], retailer: r[2], image: r[6], type: r[7] }));
const headOf = (k) => JSON.parse(readFileSync(ROOT + `assets/sections/departamento/${k}/head.json`, "utf8"));
const NOT_SHOE = /\b(wheels?|trucks?|decks?|bearings?|skateboards?|longboards?|surfskates?|jeans?|trousers?|shirts?|t-shirts?|tees?|hoodies?|polos?|bralettes?|bras?|jackets?|socks?|laces?|insoles?|sunglasses|beanies?|backpacks?|wax|leash|strollers?|gloves?|liners?|bracelets?|necklaces?|leggings?|boxers?|drink|toys?|dolls?|puzzles?)\b/i;
const SHOE_WORD = /shoe|sneaker|boot|sandal|slide|flip|cleat|loafer|heel|slipper|mule|clog|zapat|bota|chimp|tac[oó]n|pantufla|moccasin|espadrille|derby|oxford|pump|trainer|runner|flats/i;

check("acceptance: no non-footwear in Zapatos, no sandals in Zapatillas, one rail per class", () => {
  for (const k of ["shoes", "shoes_women", "shoes_men"]) {
    const rows = rowsOf(k);
    const bad = rows.filter((r) => NOT_SHOE.test(r.title) && !SHOE_WORD.test(r.title));
    assert.equal(bad.length, 0, `${k}: ${bad.length} non-footwear, e.g. ${bad.slice(0, 3).map((r) => r.title).join(" | ")}`);
    const sandalsInSneakers = rows.filter((r) => r.type === "Zapatillas" && /\b(sandals?|slides?|flip[- ]?flops?|sandalias?)\b/i.test(r.title));
    assert.equal(sandalsInSneakers.length, 0, `${k}: sandals in Zapatillas`);
    const titles = headOf(k).rails.map((r) => r.title);
    for (const t of titles.slice(1)) assert.ok(SHOE_CLASSES.includes(t) || t === "Más productos", `${k}: rail "${t}" is not an Aria class`);
    assert.ok(rows.length > 500, k + " lost its shoes");
  }
});

check("acceptance: the men's department leads with men's shoes; no imageless card leads a rail", () => {
  const men = headOf("shoes_men");
  assert.ok(!men.rails[0].cards.slice(0, 12).some((c) => /\bwomen'?s?\b/i.test(c.t)), "a women's shoe leads the men's department");
  for (const k of ["shoes", "shoes_women", "shoes_men"]) for (const r of headOf(k).rails) if (r.cards && r.cards.length) assert.ok(r.cards[0].i, `${k}: "${r.title}" leads with no photo`);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
