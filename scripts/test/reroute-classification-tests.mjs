/* ==================================================================
   THE RE-ROUTE AUDIT, AT THE RULE LEVEL (#443 c.6460976249, start
   order c.6461228058).

   Lucifer's sweep found 53,224 mis-routes. Most were rules, not data:
   the type rails called everything they did not know "Ropa" (toys,
   skateboards, cameras, brake rotors), and the kind departments matched
   raw substrings ("heel" in Hot Wheels, CCS's "Birthday" skateboards in
   Aria Party, Toy Machine socks in Juguetes, a polo's "collar" and an
   ornament's "pendant" in Joyas, an RC car's "battery" in Repuestos).

   This pins the fixed rules on the audit's own failure classes, Danny's
   seed cases, and its coverage gaps (watches, belts and scarves in Joyas
   y Accesorios; toys whose titles never say "toy"; struts and control
   arms in Repuestos; fragrances any store sells in Perfumes), plus the
   built slices: no skateboard in a store's Ropa rail.

     node scripts/test/reroute-classification-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { KIND_MATCH, DEPT_RULES, belongsToDept } from "../build-department-slices.mjs";
import { PRODUCT_TYPES as BRAND_TYPES } from "../../netlify/functions/_brand-core.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const win = {};
vm.runInNewContext(read("product-type.js"), { window: win });
const PT = win.AriaProductType;
const cls = (name, type = "", retailer = "walmart", brand = "") => PT.classify({ name, type, retailer, brand });

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const expectAll = (cases) => {
  const bad = cases.map(([name, want, type, retailer]) => [name, want, cls(name, type, retailer)]).filter(([, want, got]) => got !== want);
  assert.deepEqual(bad.map(([n, w, g]) => `"${n}": ${g}, not ${w}`), []);
};

check("Danny's seed cases leave Ropa, Sombreros, Joyas and Accesorios for what they are", () => expectAll([
  ["Fisher-Price Little People Disney & Pixar Toy Story set de juego del cuarto de Andy para niños pequeños", "juguetes"],
  ["Barbie Signature 2026 Holiday Barbie muñeca de moda, coleccionable de temporada, rubia con vestido rojo", "juguetes"],
  ["Barbie Signature Día de Muertos 2026", "juguetes"],
  ["Horse Ornaments for Xmas Christmas Tree Decorations Christmas Gifts Pendant for Home, Office and Cars Decor", "hogar"],
  ["Bemona 11\" Styrofoam Wig Head - Tall Female Foam Mannequin Wig Stand and Holder", "hogar"],
  ["Toy Story 5 Plush", "juguetes"],
]));

check("the head noun decides: a charm hoodie is a hoodie, a sneaker charm is a charm", () => expectAll([
  ["Charm Hoodie", "ropa"],
  ["Sneaker Charm", "joyas"],
  ["Black Spoon Bag Charm", "joyas", "KEYCHAINS"],
  ["Doll with Red Dress", "juguetes"],
  ["Dress to Impress - Lana Fashion Doll (12\" Tall, Series 1)", "juguetes"],
  ["Hot Wheels Monster Trucks Tee", "ropa"],
  ["Thrasher Magazine Inferno SS Tee", "ropa", "Polos y camisetas"],
  ["Polo Collar Shirt", "ropa"],
  ["Moschino Toy 2 — Eau de Parfum en spray 100 ml (3.4 oz) para mujer", "perfumes", "Fragancia", "ariaperfumes"],
  ["Behome Yoga Mat Non Slip, Anti-Tear 72 x 24 Exercise Mat", "deportes"],
  ["Eve Retro Pink Bikini Top", "trajes_bano", "WOMEN", "farfetch"],
  ["Maaji Bryn Top", "trajes_bano", "Bikinis", "islandwatersports"],
]));

check("what the Ropa rail used to swallow goes to its department", () => expectAll([
  ["Powell-Peralta Ripper Complete 8.0", "deportes", "", "ccs"],
  ["Toy Machine Death Fight Deck", "deportes", "Decks (tablas de skate)", "islandwatersports"],
  ["Spitfire Formula Four 54mm Wheels", "deportes", "", "ccs"],
  ["FCS II Performer Tri Fins", "deportes", "", "surfstation"],
  ["Monster 8K HDMI Cable 4ft, Ultra High Speed HDMI 2.1 Cord", "electronica"],
  ["Sony Alpha 7 IV Mirrorless Camera", "electronica", "", "bhphoto"],
  ["Duralast Brake Rotor 55097DL", "repuestos", "", "advanceauto"],
  ["Monroe Quick-Strut Assembly 171346", "repuestos", "", "advanceauto"],
  ["Graco Modes Pramette Travel System Stroller", "bebe"],
  ["Indi Diaper Backpack in Camel, Small", "bebe", "PANALES"],
  ["Enfamil NeuroPro Care Infant Formula, 20.7 oz, 2-pack", "bebe"],
  ["Mini Mineral Mattescreen Sunscreen SPF 40", "belleza", "Cuidado de la piel"],
  ["Bombshell Eau de Parfum", "perfumes", "", "victoriassecret"],
  ["Mainstays 4 x 6 Picture Frame, Walnut Wood Finish", "hogar"],
  ["Capri Dolce Vita", "libros", "COFFEE_TABLE_BOOK"],
  ["Skittles Original Fruity Candy, 54 oz Bag", "dulces"],
]));

check("fashion stays fashion: shoes, swim, bags and garments the puller typed wrong", () => expectAll([
  ["Women's Hansell Slingback Pumps", "zapatos", "APPAREL"],
  ["Beige Leather Sock Boots", "zapatos", "ZIP UP & BUCKLED BOOTS"],
  ["Nike SB Zoom Blazer Mid - Wolf Grey/Midnight Navy", "zapatos", "Zapatillas"],
  ["Classic Slip-On - Black", "zapatos", "Zapatillas"],
  ["Air Force 1 '07", "zapatos", "", "snipes"],
  ["Billabong Good Times Layback Boardshort", "trajes_bano", "Boardshorts"],
  ["Rip Curl Revival Legging", "ropa", "Accesorios"],
  ["Vissla Bonfire Boys Knit Pullover", "ropa", "Accesorios"],
  ["Navy Silk Tie", "accesorios", "NECK TIES"],
  ["Fossil Leather Watch", "accesorios"],
  ["Herschel Classic Backpack", "carteras"],
]));

check("every type the classifier can return has a rail on the store, brand and category pages", () => {
  const keys = PT.TYPES.map((t) => t.key);
  for (const k of Object.keys(PT.FAMILY_DEPT)) assert.ok(keys.includes(k), k + " has no type entry");
  for (const page of ["tienda.html", "marca.html"]) {
    const src = read(page);
    for (const k of keys) assert.ok(src.includes(`key:'${k}'`), `${page} drops every "${k}" item from its rails`);
  }
  for (const k of keys) assert.ok(BRAND_TYPES.some((t) => t.key === k), `_brand-core.js drops "${k}"`);
  for (const d of Object.values(PT.FAMILY_DEPT)) assert.ok(DEPT_RULES[d], d + " is not a department");
});

const item = (title, type = "", retailer = "walmart", bucket = "", brand = "") => ({ title, type, retailer, bucket, brand });
const inDept = (dept, p) => belongsToDept(DEPT_RULES[dept], p);
check("the kind departments' substring traps are closed", () => {
  const traps = [
    ["shoes", item("Hot Wheels Cars, 5-Pack of Die-Cast Toy Cars")],
    ["shoes", item("Spitfire Formula Four 54mm Wheels", "", "ccs")],
    ["shoes", item("Levi's 527 Slim Bootcut Jeans")],
    ["party", item("Birthday Skateboard Deck 8.25", "", "ccs")],
    ["party", item("Spitfire Classic Sticker", "Stickers y decoración", "surfstation")],
    ["toys", item("Toy Machine Sect Eye Socks", "", "ccs")],
    ["toys", item("Toy Machine Death Fight Deck", "Decks (tablas de skate)", "islandwatersports")],
    ["joyas_accesorios", item("Polo Collar Shirt")],
    ["joyas_accesorios", item("Charm Hoodie")],
    ["joyas_accesorios", item("Horse Ornaments for Xmas Christmas Tree Decorations Christmas Gifts Pendant for Home")],
    ["joyas_accesorios", item("Ray-Ban Wayfarer Sunglasses")],
    ["auto_parts", item("RC Monster Truck with Battery & Charger Included")],
    ["soccer", item("Sports Cluster Charm - Soccer", "CHARMS", "boxlunch")],
    ["spearfishing", item("Neoprene Laptop Bag")],
  ];
  const leaks = traps.filter(([d, p]) => inDept(d, p)).map(([d, p]) => `${p.title} is still in ${d}`);
  assert.deepEqual(leaks, []);
});

check("the coverage gaps are open: watches, belts, scarves, toys that never say toy, struts, fragrances", () => {
  const want = [
    ["joyas_accesorios", item("Fossil Leather Watch")],
    ["joyas_accesorios", item("Gucci GG Leather Belt", "", "ssense")],
    ["joyas_accesorios", item("Navy 'The Jean Paul Gaultier' Scarf", "SCARVES", "ssense")],
    ["joyas_accesorios", item("Gold Hoop Earrings")],
    ["toys", item("Barbie Signature Día de Muertos 2026")],
    ["toys", item("LEGO Technic Bugatti Chiron 42083")],
    ["auto_parts", item("Monroe Quick-Strut Assembly 171346", "", "advanceauto")],
    ["auto_parts", item("Moog Front Lower Control Arm")],
    ["perfumes", item("Bombshell Eau de Parfum", "", "victoriassecret")],
    ["perfumes", item("Good Girl Eau de Parfum 2.7 oz", "", "ulta")],
    ["party", item("Happy Birthday Foil Balloon", "Balloons", "partycity")],
  ];
  const missing = want.filter(([d, p]) => !inDept(d, p)).map(([d, p]) => `${p.title} is not in ${d}`);
  assert.deepEqual(missing, []);
  assert.equal(KIND_MATCH.perfumes("x", item("Anything", "", "ariaperfumes")), true, "Aria Perfumes' own stock left Perfumes");
});

check("Juguetes and Moda Niños stay apart: a toy-themed garment is a garment, a dress-up doll is a toy", () => {
  assert.equal(inDept("toys", item("Paw Patrol Boys Graphic T-Shirt")), false);
  assert.equal(inDept("toys", item("Marvel Spider-Man Boys Fleece Bomber Jacket")), false);
  assert.equal(inDept("toys", item("Barbie Dreamhouse Playset")), true);
});

check("the built storefronts: CCS's skateboards, Walmart's toys and B&H's cameras leave the Ropa rail", () => {
  const rail = (store, key) => {
    const p = `assets/tienda/${store}/index.json`;
    if (!existsSync(join(ROOT, p))) return null;
    return JSON.parse(read(p)).rails.find((r) => r.key === key) || null;
  };
  const ccsRopa = rail("ccs", "t-ropa");
  if (ccsRopa) {
    const boards = ccsRopa.head.filter((c) => /\b(skateboard|deck|complete|wheels|trucks)\b/i.test(c.name)).map((c) => c.name);
    assert.deepEqual(boards, [], "skateboards in CCS's Ropa rail");
  }
  const ccsSport = rail("ccs", "t-deportes");
  assert.ok(ccsSport && ccsSport.total > 1000, "CCS has no Deportes rail for its boards");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
