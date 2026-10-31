/* ==================================================================
   GYM RAT: THE 12-BRAND INGEST, APPAREL ONLY (#443 c.6542443890,
   c.6542490625, header c.6542477414).

     - gym-apparel.js: clothing is Gym Rat's; gloves, wraps, belts,
       straps, sleeves, gis and fight shorts are Fight Club's; bottles,
       bags, decals and shoes are neither;
     - the catalogue: 12 brands, their clothing in gym_rat, their gear in
       combat_sports, nothing else;
     - the department: every product in Gym Rat is clothing, from the gym
       brands and from Venum / Everlast / Tatami; no gear from anyone;
       Gymshark and Alphalete (off sale) are not there;
     - every brand is a store: registry, product page, search.

     node scripts/test/gym-ingest-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gymKind, isGymApparel } from "../lib/gym-apparel.js";
import { GYM_BRANDS } from "../build-gym-pulls.mjs";
import { isOffSaleRetailer } from "../lib/off-sale.js";
import { DEPT_RULES, belongsToDept, loadAllItems } from "../build-department-slices.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
const ALL_KEYS = GYM_BRANDS.map((b) => b.key);
/* Athleta is in the pull but off sale (the sourcing audit took the Gap Inc
   family off, off-sale.js): its data is kept, it shows nowhere. */
const KEYS = ALL_KEYS.filter((k) => !isOffSaleRetailer(k));
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

check("the rule: clothing in, gear to Fight Club, objects out -- by the product, not its colour", () => {
  const k = (name, subcategory = "") => gymKind({ name, subcategory });
  for (const [n, c] of [["Ballet Wrap - Baked Blue", "tops"], ["Range Shirt Flag (Black)", "Tactical Tops"], ["Halo Halter Tank - Ring Pop", "tank-tops"],
    ["FLEX Stretchy Boot Cut Jean (Black)", "Jeans"], ["Pilates Grip Socks 1 Pack | Black", "accessories"], ["Pursuit Pullover - Chalk", ""],
    ["Ballet Wrap Top - Black", "straps_&_wraps"], ["W4280 - Studio Cami New", "For Her"], ["The Bestie", "For Her"], ["Men's Poly T-Shirt", "combat_sports"], ["Venum Urban Gi Hoodie - Black", "SWEATSHIRTS"], ["4123 - Yu-Gi-Oh!® Tees", "For Him"]])
    assert.equal(k(n, c), "apparel", n);
  for (const [n, c] of [["Wrap Lifting Gloves - Black", "accessories"], ["Leather Lifting Belt - Black", "accessories"], ["Wrist Straps - Black", "equipment"],
    ["Kill Crew Shorts", "fight_shorts"], ["Venum No Gi Rashguards - Black", "COMPRESSION_T-SHIRTS"], ["Venum No Gi Spats", "COMPRESSION_PANTS"], ["Piru Muay Thai Shorts - Black", "clothing"], ["Knee Sleeves", "For Him"], ["Boxing Gloves", ""], ["Superlite Gi", ""]])
    assert.equal(k(n, c), "fight", n);
  for (const [n, c] of [["Denali Belt Bag - Pink", "accessories"], ["Gym Towel - Black", "accessories"], ["Shaker Compact", "shaker_bottles"],
    ["Pasco Slides", "accessories"], ["8MM ICED CUBAN BRACELET - SILVER", "For Him"], ["Metal Gym Keychain", "For Him"], ["Duncan Backpack", "sport_bags"]])
    assert.equal(k(n, c), "other", n);
});

const cat = JSON.parse(read("gym-brands-catalog.json"));
check("the catalogue: 12 brands; only clothing in gym_rat, only gear in combat_sports", () => {
  for (const key of ALL_KEYS) {
    const r = cat.retailers[key];
    assert.ok(r, key);
    const gym = (r.departments.gym_rat || { items: [] }).items, fight = (r.departments.combat_sports || { items: [] }).items;
    assert.ok(gym.length > 0, `${key}: no clothing`);
    for (const it of gym) assert.equal(gymKind({ name: it.name, subcategory: it.type }), "apparel", `${key}: ${it.name}`);
    for (const it of fight) assert.equal(gymKind({ name: it.name, subcategory: it.type }), "fight", `${key}: ${it.name}`);
    assert.deepEqual(Object.keys(r.departments).filter((d) => d !== "gym_rat" && d !== "combat_sports"), []);
    for (const it of gym.concat(fight)) {
      assert.ok(it.price > 0 && /^https:\/\//.test(it.image), `${key}: ${it.name}`);
      /* Spanish or nothing: the English stays as description_en. */
      if (it.description) {
        const es = (it.description.match(/\b(el|la|los|las|de|del|con|para|y|en|que|su|sus|una|un|por|es)\b/gi) || []).length;
        const en = (it.description.match(/\b(the|and|with|for|your|this|that|is|are|of|to|in|it)\b/gi) || []).length;
        /* Too few function words to tell (a bullet list): not judged. */
        if (es + en >= 4) assert.ok(es > en, `${key}: a description that is not Spanish on ${it.name}`);
      }
    }
  }
});

check("the Gym Rat department is clothing only, from the gym brands and the fight brands' clothing; no Gymshark, no Alphalete", () => {
  const all = loadAllItems(ROOT);
  const inGym = all.filter((p) => belongsToDept(DEPT_RULES.gym_rat, p));
  const gear = inGym.filter((p) => !isGymApparel(p));
  assert.deepEqual(gear.map((p) => p.title).slice(0, 5), []);
  const stores = new Set(inGym.map((p) => p.retailer));
  for (const key of KEYS) assert.ok(stores.has(key), key);
  for (const key of ["youngla", "venum", "everlast", "tatami"]) assert.ok(stores.has(key), key);
  /* No glove, wrap or gi from the fight brands. */
  const gearName = /\b(gloves?|hand ?wraps?|shin guards?|headgear|rash ?guards?|spats|bjj|no ?gi)\b/i;
  assert.deepEqual(inGym.filter((p) => gearName.test(p.title)).map((p) => p.title).slice(0, 5), [], "gear in Gym Rat");
  const head = JSON.parse(read("assets/sections/departamento/gym_rat/head.json"));
  const ks = head.stores.map((s) => s.k);
  assert.ok(!ks.includes("gymshark") && !ks.includes("alphalete"), ks.join(","));
  assert.ok(KEYS.every((k) => ks.includes(k)), ks.join(","));
});

check("Athleta stays off sale: in the data, on no shelf", () => {
  assert.ok(isOffSaleRetailer("athleta"));
  const head = JSON.parse(read("assets/sections/departamento/gym_rat/head.json"));
  assert.ok(!head.stores.some((s) => s.k === "athleta"));
});

check("every brand is a store: the registry, the product page, search", () => {
  const stores = JSON.parse(/var STORES = (\{.*\});/.exec(read("tienda.html"))[1]);
  const files = JSON.parse(/var STORE_FILES\s*=\s*(\{.*?\});/.exec(read("producto.html"))[1]);
  const pages = /var STORE_PAGES = "([^"]*)"/.exec(read("search.html"))[1].split(" ");
  const retailers = read("scripts/lib/retailers.js");
  for (const key of KEYS) {
    assert.deepEqual(stores[key] && stores[key].files, ["/gym-brands-catalog.json"], key);
    assert.deepEqual(files[key], ["/gym-brands-catalog.json"], key);
    assert.ok(pages.includes(key), key);
    assert.match(retailers, new RegExp(`\\b${key}: \\{ key: "${key}"`));
    const idx = JSON.parse(read(`assets/tienda/${key}/index.json`));
    assert.ok(idx.count > 0, key);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
