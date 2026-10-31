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
import { isShoeForDept, footwearClass, shoeGender, SHOE_CLASSES } from "../lib/footwear.js";
import { KIND_MATCH } from "../build-department-slices.mjs";
import { interleaveFront, photosFirst, genderAisles, buildSections, sectionOpts, rowItem, fnRow, answer, FRONT, FRONT_CAP } from "../../netlify/functions/_department-core.js";

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

check("a heel that is a part of the shoe is not a Tacones class", () => {
  assert.equal(footwearClass({ title: "Women's Slip-Ons Casual Shoes, Flat Heel & Round Toes Red, 8" }), "Zapatos");
  assert.equal(footwearClass({ title: "Black Heel-less Loafers" }), "Mocasines y pantuflas");
  assert.equal(footwearClass({ title: "Stardan black leather star jacket with star and black leather heel sneakers" }), "Zapatillas");
  assert.equal(footwearClass({ title: "DG logo-heel pumps" }), "Tacones");
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

const rowsOf = (k) => JSON.parse(readFileSync(ROOT + `assets/sections/departamento/_fn/${k}.json`, "utf8")).rows.map((r) => ({ title: r[0], retailer: r[2], image: r[6], type: r[7], g: r[8] }));
const headOf = (k) => JSON.parse(readFileSync(ROOT + `assets/sections/departamento/${k}/head.json`, "utf8"));
const NOT_SHOE = /\b(wheels?|trucks?|decks?|bearings?|skateboards?|longboards?|surfskates?|jeans?|trousers?|shirts?|t-shirts?|tees?|hoodies?|polos?|bralettes?|bras?|jackets?|socks?|laces|shoe\s*lace|insoles?|sunglasses|beanies?|backpacks?|wax|leash|strollers?|gloves?|liners?|bracelets?|necklaces?|leggings?|boxers?|drink|toys?|dolls?|puzzles?)\b/i;
const SHOE_WORD = /shoe|sneaker|boot|sandal|slide|flip|cleat|loafer|heel|slipper|mule|clog|zapat|bota|chimp|tac[oó]n|pantufla|moccasin|espadrille|derby|oxford|pump|trainer|runner|flats/i;

check("acceptance: no non-footwear in Zapatos, no sandals in Zapatillas, one rail per class", () => {
  for (const k of ["shoes", "shoes_women", "shoes_men"]) {
    const rows = rowsOf(k);
    const bad = rows.filter((r) => NOT_SHOE.test(r.title) && !SHOE_WORD.test(r.title));
    assert.equal(bad.length, 0, `${k}: ${bad.length} non-footwear, e.g. ${bad.slice(0, 3).map((r) => r.title).join(" | ")}`);
    const sandalsInSneakers = rows.filter((r) => r.type === "Zapatillas" && /\b(sandals?|slides?|flip[- ]?flops?|sandalias?)\b/i.test(r.title));
    assert.equal(sandalsInSneakers.length, 0, `${k}: sandals in Zapatillas`);
    const titles = headOf(k).rails.map((r) => r.title);
    /* Zapatos: GENDER x CLASS ("Zapatillas Mujer"); the gendered departments: the class alone */
    const aisle = (t) => k === "shoes" ? SHOE_CLASSES.some((c) => ["Mujer", "Hombre", "Niños"].some((g) => t === `${c} ${g}`)) : SHOE_CLASSES.includes(t);
    for (const t of titles.slice(1)) assert.ok(aisle(t) || t === "Más productos" || t === "Reacondicionados", `${k}: rail "${t}" is not an Aria aisle`);
    assert.ok(rows.length > 500, k + " lost its shoes");
  }
});

check("acceptance: the men's department leads with men's shoes; no imageless card leads a rail", () => {
  const men = headOf("shoes_men");
  assert.ok(!men.rails[0].cards.slice(0, 12).some((c) => /\bwomen'?s?\b/i.test(c.t)), "a women's shoe leads the men's department");
  for (const k of ["shoes", "shoes_women", "shoes_men"]) for (const r of headOf(k).rails) if (r.cards && r.cards.length) assert.ok(r.cards[0].i, `${k}: "${r.title}" leads with no photo`);
});

/* ---- THE GENDER AXIS (#443 c.6412658814, amended c.6412683747) ---- */
check("gender comes from the catalogue: title, then the store's type, then the bucket", () => {
  const cases = [
    [{ title: "New Balance Women's 796v4 Pickleball Shoes" }, "sporting_goods", "women"],
    [{ title: "Men’s Flip-Flops" }, "shoes", "men"],                                   // curly apostrophe (Walmart)
    [{ title: "Women`s Victori One Slides Black" }, "sporting_goods", "women"],         // backtick (Tennis Express)
    [{ title: "SKIMS ACCESSORIES MENS POOL SLIDE | ONYX" }, "women", "men"],            // the title beats the bucket
    [{ title: "Stardan leather sneakers", type: "MEN" }, "luxury_brands", "men"],       // Farfetch's type
    [{ title: "Super-Star sneakers", type: "WOMEN" }, "latino_designers", "women"],
    [{ title: "Black Yumi Flip-Flops" }, "women", "women"],                             // SSENSE's gendered bucket
    [{ title: "Champion Men's Rally Pro XG Shoes" }, "calzado", "men"],
  ];
  for (const [p, b, want] of cases) assert.equal(shoeGender(p, b), want, p.title);
});

check("unisex -- said, both named, or the data silent -- earns both adult rails", () => {
  const cases = [
    [{ title: "Birkenstock Arizona Suede Leather Unisex Sandals" }, "clothing"],
    [{ title: "Womens Mens Basketball Shoes High Top Fashion Sneakers" }, "shoes"],
    [{ title: "Classic Clog - Black" }, "footwear"],                                    // Crocs: no gender anywhere
    [{ title: "Vans Nexpa Synthetic MTE Sandals - Black" }, "clothing"],
    [{ title: "Bella Donna Sad Girl Black Slide Sandals" }, "calzado"],                // "Girl" here is a name
    [{ title: "Reebok Club C Vintage Chalk & Baby Blue Shoes" }, "clothing"],          // "Baby Blue" is a colour
    [{ title: "Billionaire Boys Club BB Space Walk Slides" }, "clothing"],              // a brand, not boys
  ];
  for (const [p, b] of cases) assert.equal(shoeGender(p, b), "unisex", p.title);
});

check("kids go to the Niños aisles: Kids', Jr., Junior, Youth, Toddler, Girls', Baby sneaker", () => {
  for (const t of ["adidas Kids' F50 Club Messi FxG Soccer Cleats", "PUMA Jr. TACTO II", "Nike Junior Phantom 6 Low Club Firm/Multi Ground Soccer Cleats",
    "Juniors' Coco CG2 Tennis Shoes", "Lakai Youth Cambridge Shoes", "Toddler Classic Clog - Lavender", "Reef Vista Hi Girls Sandal",
    "Youth Mens Basketball High-Top Shoes", "Munchkin by Stride Rite Miller Baby Casual Sneaker", "Little Ahi kids Sandal", "Kids’ Bluey Classic Clog"])
    assert.equal(shoeGender({ title: t }, "men"), "kids", t);
});

check("the aisles: Mujer then Hombre per class, unisex in both, kids after every adult aisle", () => {
  const mk = (title, type, g) => ({ title, type, g, retailer: "x", rawPrice: 10, image: "i" });
  const list = [
    mk("W1", "Zapatillas", "women"), mk("W2", "Zapatillas", "women"), mk("M1", "Zapatillas", "men"),
    mk("U1", "Zapatillas", "unisex"), mk("U2", "Zapatillas", "unisex"),
    mk("S1", "Sandalias", "women"), mk("S2", "Sandalias", "women"), mk("S3", "Sandalias", "women"),
    mk("K1", "Zapatillas", "kids"), mk("K2", "Zapatillas", "kids"), mk("K3", "Zapatillas", "kids"),
  ];
  const a = genderAisles(list);
  assert.deepEqual(a.map((s) => s.title), ["Zapatillas Mujer", "Zapatillas Hombre", "Sandalias Mujer", "Zapatillas Niños"]);
  assert.deepEqual(a[0].items.map((p) => p.title), ["W1", "W2", "U1", "U2"]);
  assert.deepEqual(a[1].items.map((p) => p.title), ["M1", "U1", "U2"]);
  /* the Ofertas lead is not split: it stays the mixed sale showcase */
  const secs = buildSections(list.map((p, i) => i < 4 ? { ...p, salePct: 20 } : p), sectionOpts("shoes"));
  assert.equal(secs[0].title, "Ofertas");
  assert.deepEqual(new Set(secs[0].items.map((p) => p.g)), new Set(["women", "men", "unisex"]));
  /* the gender survives the endpoint's row */
  assert.equal(rowItem(fnRow(list[0])).g, "women");
  assert.equal(rowItem(fnRow({ ...list[0], g: undefined })).g, undefined);
});

check("acceptance: Zapatos is GENDER x CLASS -- no men's shoe in a Mujer aisle, no women's in Hombre, no kids in either", () => {
  const head = headOf("shoes");
  const titles = head.rails.map((r) => r.title);
  for (const t of ["Zapatillas Mujer", "Zapatillas Hombre", "Sandalias Mujer", "Sandalias Hombre", "Botas y botines Mujer", "Botas y botines Hombre", "Zapatos Mujer", "Zapatos Hombre"])
    assert.ok(titles.includes(t), "missing aisle " + t);
  assert.equal(titles[0], "Ofertas");
  const firstKids = titles.findIndex((t) => / Niños$/.test(t));
  assert.ok(firstKids > 0 && titles.slice(firstKids).every((t) => / Niños$/.test(t) || t === "Más productos"), "the Niños aisles come after every adult aisle");
  /* the whole aisles, through the endpoint, not only the cards on the page */
  const rails = head.rails.length;
  for (let i = 1; i < rails; i++) {
    const title = titles[i];
    if (!/ (Mujer|Hombre)$/.test(title)) continue;
    const out = answer({ dept: "shoes", rail: String(i), page: "0" }, [ROOT]);
    const pages = out.body.pages;
    const items = [];
    for (let pg = 0; pg < pages; pg++) items.push(...answer({ dept: "shoes", rail: String(i), page: String(pg) }, [ROOT]).body.cards);
    assert.equal(items.length, head.rails[i].count, title + " count");
    const wrong = items.filter((c) => {
      const g = shoeGender({ title: c.t }, "");
      return g === "kids" || (title.endsWith("Mujer") ? g === "men" : g === "women");
    });
    assert.equal(wrong.length, 0, `${title}: ${wrong.length} misfiled, e.g. ${wrong.slice(0, 3).map((c) => c.t).join(" | ")}`);
  }
  const rows = rowsOf("shoes");
  assert.ok(rows.every((r) => ["women", "men", "kids", "unisex"].includes(r.g)), "every Zapatos row carries its gender");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
