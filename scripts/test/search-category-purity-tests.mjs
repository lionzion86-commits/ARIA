/* ==================================================================
   SEARCH: CATEGORY PURITY (#443 c.6544117193).

   A query that names a kind of product leads with that kind -- in the
   grid AND in the lanes (En oferta, Más vendidos) -- with no accessory
   and no lookalike among the first twelve:

     consola    consoles first; no game or headset among them
     celular    phones; no headset, toy phone or wallet
     laptop     laptops; no hub, mouse, speaker or desk tray
     mascarilla hair / face treatment masks; no eye mask, cloth or
                snorkel mask, no garment printed with one
     keratina   hair keratin; no body spray, comb or apron
     camara     cameras; no drone
     pesas      weights only -- never a printed pajama or a rattle

     node scripts/test/search-category-purity-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { searchPage, loadSearch, isConsoleTitle, isWeight, isHairKeratin, isBeautyMask, categoryOf, deviceLead } from "../../netlify/functions/_search-core.js";
import { RETAILERS } from "../lib/retailers.js";

const ctx = loadSearch({ labels: Object.fromEntries(Object.entries(RETAILERS).map(([k, r]) => [k, r.label])) });
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const page = (q) => searchPage(ctx, q, 1, { fx: 3.75 });
/* Every card the shopper sees first: the grid's first n and every lane. */
function shown(q, n = 12) {
  const r = page(q);
  const lanes = (r.lanes || []).filter((l) => !String(l.key).startsWith("tienda:"));
  return { r, grid: (r.items || []).slice(0, n).map((i) => i.title), lanes: lanes.flatMap((l) => l.items.map((i) => i.title)) };
}

check("the rules, by the product's own name", () => {
  for (const t of ["Nintendo Switch™ 2 System", "PlayStation Portal Remote Player - Midnight Black", "Meta Quest 3S 128GB VR Headset — Level Up", "Valve Steam Deck 512GB with Exclusive Carrying Case, Black", "Nintendo Switch™ 2: Choose Your Game Bundle", "PlayStation 5 Slim Console"])
    assert.ok(isConsoleTitle(t), t);
  for (const t of ["Riders Republic Xbox Series X|S, Xbox One Standard Edition", "Xbox Wired Gaming Stereo Headset For Xbox Series X|S/Xbox One - Black", "Nintendo Switch Sports - Nintendo Switch [Physical]", "NINTENDO SWITCH BAYONETTA 3 VIDEO GAME", "(3 Pack) amFilm Tempered Glass Screen Protector for PlayStation Portal", "Game Console Repair Kit Tools"])
    assert.ok(!isConsoleTitle(t), t);
  for (const t of ["CAP Barbell, 5 lb Vinyl Kettlebell Body Trainer, Black", "Amazon Basics Neoprene Dumbbell Hand Weights, Set of 2"]) assert.ok(isWeight({ title: t }), t);
  for (const t of ["Pajama Pants Set - Dumbbell Print", "Half Finger Workout Gloves with Wrist Support, Non-Slip Weight Lifting Gloves for Dumbbell", "Fisher-Price Laugh & Learn Countin’ Reps Dumbbell Musical Baby Rattle"]) assert.ok(!isWeight({ title: t }), t);
  assert.ok(isHairKeratin({ title: "Keratin Complex KCMAX Maximum Keratin Treatment Spray" }));
  for (const t of ["Dr Melaxin Body Keratin Kojic Acid Tumeric Spray Peel Shot", "Keratin Complex Apron", "Keratin Complex Heat Resistant Metal Tail Comb"]) assert.ok(!isHairKeratin({ title: t }), t);
  assert.ok(isBeautyMask({ title: "Honey Gloss Ceramide Therapy Hydrating Hair Mask", departments: ["beauty"] }));
  assert.ok(isBeautyMask({ title: "Hydrating Hyaluronic Acid Face Masks", departments: ["beauty"] }));
  for (const t of ["Cooling Eye Mask for Puffy Eyes", "Real Madrid Face Mask", "Billionaire Boys Club BB Starfield Face Mask", "Guardian Scuba Omni Integrated Full Face Snorkeling Mask Combo", "Ghost Face Mask Pajama Pants", "Ghost Face Masks Blood Hoodie"])
    assert.ok(!isBeautyMask({ title: t, departments: ["sporting_goods"] }), t);
});

check("a strict category keeps nothing else; a device category puts the rest after", () => {
  const rows = ["Pajama Pants Set - Dumbbell Print", "CAP Barbell, 5 lb Vinyl Kettlebell Body Trainer, Black"].map((title) => ({ title }));
  assert.deepEqual(deviceLead("pesas", rows).map((p) => p.title), ["CAP Barbell, 5 lb Vinyl Kettlebell Body Trainer, Black"]);
  assert.ok(categoryOf("mancuernas").strict && categoryOf("keratina").strict && categoryOf("mascarilla").strict);
  assert.ok(!categoryOf("celular").strict && categoryOf("cámaras"));
  assert.equal(categoryOf("funda celular"), null, "asking for the accessory is not the device's category");
});

check("consola: the consoles lead the grid and fill the lanes; no game or headset among them", () => {
  const { grid, lanes } = shown("consola");
  const n = (page("consola").items || []).filter((i) => isConsoleTitle(i.title)).length;
  assert.ok(n >= 4, `${n} consoles stocked`);
  grid.slice(0, Math.min(n, 12)).forEach((t) => assert.ok(isConsoleTitle(t), "grid: " + t));
  lanes.forEach((t) => assert.ok(isConsoleTitle(t), "lane: " + t));
});

check("celular: phones only in the first 12 and in the lanes", () => {
  const { grid, lanes } = shown("celular");
  for (const t of grid.concat(lanes)) assert.doesNotMatch(t, /\b(headset|vr|case|cover|charger|holder|wallet|learning|toy)\b/i, t);
});

check("laptop: laptops only; no hub, mouse, speaker or tray", () => {
  const { grid, lanes } = shown("laptop");
  for (const t of grid.concat(lanes)) {
    assert.match(t, /laptop|notebook|chromebook|macbook|vivobook|zenbook|ideapad|thinkpad/i, t);
    /* (A laptop sold "with Mouse and Mouse Pad" is a laptop.) */
    assert.doesNotMatch(t.split(/\s+with\s+/i)[0], /\b(hub|mouse|speakers?|tray|desk|bag|sleeve|stand)\b/i, t);
  }
});

check("mascarilla: treatment masks only, in the grid and in the En oferta row", () => {
  const { grid, lanes } = shown("mascarilla", 24);
  for (const t of grid.concat(lanes)) {
    assert.match(t, /\b(masks?|masques?)\b/i, t);
    assert.doesNotMatch(t, /\b(eye mask|hoodie|pajama|pants|snorkel|goggles?|helmet|real madrid|billionaire)\b/i, t);
  }
});

check("keratina: hair keratin only; no body spray, comb or apron", () => {
  const r = page("keratina");
  const all = (r.items || []).map((i) => i.title).concat((r.lanes || []).flatMap((l) => l.items.map((i) => i.title)));
  assert.ok(all.length >= 12);
  for (const t of all) { assert.match(t, /keratin/i, t); assert.doesNotMatch(t, /\b(body|apron|comb)\b/i, t); }
});

check("camara: cameras; no drone anywhere in the first 12 or the lanes", () => {
  const { grid, lanes } = shown("camara");
  for (const t of grid.concat(lanes)) { assert.match(t, /camera|mirrorless|dslr|gopro|instax|camcorder|osmo/i, t); assert.doesNotMatch(t, /\b(drones?|quadcopter)\b/i, t); }
});

check("pesas: weights or nothing -- never a printed pajama, a glove or a rattle", () => {
  for (const q of ["pesas", "mancuernas", "dumbbells", "kettlebell"]) {
    const r = page(q);
    for (const i of (r.items || [])) assert.ok(isWeight({ title: i.title }), `${q}: ${i.title}`);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
