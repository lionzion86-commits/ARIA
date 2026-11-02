#!/usr/bin/env node
/* ==================================================================
   NO PILLS, NO FOOD; ELECTRÓNICA BY TYPE; DRONES (#443 c.6579517469,
   c.6579542290, c.6579603095 -- Danny's live finds, 2026-11-02).

     - /not-sold.js names medicine, supplements and grocery by the title;
       a cosmetic, a garment or a skate deck that only shares a word is
       not one;
     - no committed catalogue or served surface carries a product the
       rule puts off sale (Costco's TUMS, Pepcid, nuts, formula, candy);
       the cart and the product page refuse one through /off-sale.js;
     - Electrónica's rails and store lenses hold electronics only;
     - Drones is its own type (Por tipo rail, t=drones page, aisle, home
       pill), DJI's pro line first; Cámaras holds no drone;
     - the search router sends dron / drone / drones / dji there.

     node scripts/test/not-sold-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
await import("../../not-sold.js");
const NS = globalThis.AriaNotSold;
const { isOffSaleItem } = await import("../lib/off-sale.js");
const { isDrone, isNotElectronics, techAisle, droneRank } = await import("../lib/tech-aisle.js");
const dept = await import("../../netlify/functions/_department-core.js");
const purge = await import("../purge-not-sold.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const titlesIn = (node, out = []) => {
  if (Array.isArray(node)) { for (const v of node) titlesIn(v, out); return out; }
  if (node && typeof node === "object") {
    const t = node.name || node.title || node.t;
    if (typeof t === "string" && ("price" in node || "p" in node)) out.push({ t, r: String(node.retailer || node.store || node.r || "").toLowerCase() });
    for (const v of Object.values(node)) if (v && typeof v === "object") titlesIn(v, out);
  }
  return out;
};

await check("the rule: medicine, supplements and grocery by the title; a word-alike is not one", () => {
  const yes = {
    "Pepcid Complete Dual Action Acid Reducer + Antacid, 100 Chewable Berry Tablets": "farmacia",
    "TUMS Antacid Chewy Bites Assorted Berries, 108 Chewable Tablets": "farmacia",
    "Kirkland Signature Triple Action Joint Health, 110 Coated Tablets": "farmacia",
    "Advil Liqui-Gels Ibuprofen Dispenser Box, 2 Capsules, 50-count": "farmacia",
    "Children's Tylenol Liquid Pain Relief & Fever Medicine, Dye-Free Cherry Flavor, 12 Fluid Ounces": "farmacia",
    "vitafusion Prenatal Multivitamin Gummy with Folate & DHA, 180 Gummies": "farmacia",
    "Women's 18-44 Clinically Proven Hair Growth Supplement": "farmacia",
    "La Fiesta 4.5\" Corn Tortillas, 60-count": "alimento",
    "Kirkland Signature Trail Mix, 4 lbs": "alimento",
    "Similac 360 Total Care with 5 HMO's, Non-GMO Infant Formula Powder, 40 oz": "alimento",
    "Great Value Naturally Brewed Soy Sauce, 15 fl oz": "alimento",
    "Hank Rub Seasoning": "alimento",
    "Snickers Chocolate Candy Bars, Full Size, 1.86 oz, 48-count": "dulce",
  };
  for (const [t, k] of Object.entries(yes)) assert.equal(NS.notSoldKind(t), k, t);
  for (const t of ["Augustinus Bader The Vitamin C Serum, 1 fl oz", "Allegra Sequin Maxi Dress", "Aleve S/S Tee - Black", "Aleve - 8.25",
    "Icecream Nyquil SS Tee", "RoC Hydrate and Plump Serum Capsules, 70-count", "Apple - AirTag 4 pack (2nd generation) - 2026 - White",
    "Pink Sugar — Gel de ducha 240 ml (8 oz) para mujer", "Play-Doh Kitchen Creations Popcorn Party Play Food Set, 6 Cans (10 oz)",
    "SKIMS STRETCH MENS 5\" BOXER BRIEF 5-PACK | COCOA MULTI", "Samsung Galaxy Tab A11+ 11.0\" Wi-Fi Tablet 128GB - Includes Book Cover",
    "Reusable Baby Food Pouches, 10 Pack", "Murder Drones Uzi Backpack"]) assert.equal(NS.notSoldKind(t), "", t);
  /* Candy is off sale at Costco only: Dulces y Chocolates is Danny's call. */
  assert.equal(NS.isNotSold({ retailer: "costco", title: "Snickers Chocolate Candy Bars, Full Size, 1.86 oz, 48-count" }), true);
  assert.equal(NS.isNotSold({ retailer: "walmart", title: "Snickers Chocolate Candy Bars, Full Size, 1.86 oz, 48-count" }), false);
});

await check("the cart, the order and the product page refuse a pill or a grocery row (/off-sale.js reads /not-sold.js)", () => {
  assert.equal(isOffSaleItem({ retailer: "costco", title: "Pepcid Complete Dual Action Acid Reducer + Antacid, 100 Chewable Berry Tablets" }), true);
  assert.equal(isOffSaleItem({ store: "walmart", name: "Great Value Lasagna Pasta, 16 oz" }), true);
  assert.equal(isOffSaleItem({ retailer: "costco", title: "Apple TV 4K 128GB (Wi-Fi + Ethernet)" }), false);
  const page = readFileSync(join(ROOT, "producto.html"), "utf8");
  assert.ok(page.indexOf('<script src="/not-sold.js"></script>') > 0, "producto.html does not load /not-sold.js");
});

await check("no committed catalogue holds a product the rule puts off sale (purge-not-sold finds nothing)", () => {
  const left = [];
  for (const f of purge.catalogueFiles(ROOT)) {
    let d; try { d = json(f); } catch { continue; }
    for (const r of purge.productRows(d)) if (NS.isNotSold({ title: r.item.name || r.item.title, retailer: r.retailer })) left.push(f + ": " + (r.item.name || r.item.title));
  }
  assert.deepEqual(left, []);
  const rep = json("data/purges/costco-2026-11-02.json");
  assert.ok(rep.counts.byStore.costco.farmacia >= 40 && rep.counts.byStore.costco.alimento >= 80, "the purge report lost Costco's rows");
  assert.ok(rep.products.some((p) => /^Pepcid Complete/.test(p.title) && p.record), "the report keeps no record of Pepcid");
});

await check("no Costco surface serves a pill or food: storefront, departments, search, Ofertas, PDP shards, price index, home pills", () => {
  const bad = [];
  const scan = (file) => { for (const x of titlesIn(json(file))) if (NS.isNotSold({ title: x.t, retailer: x.r || "costco" }) && (x.r === "costco" || !x.r || NS.notSoldKind(x.t) !== "dulce")) bad.push(file + ": " + x.t); };
  scan("assets/tienda/_fn/costco.json"); scan("assets/tienda/costco/index.json");
  for (const f of readdirSync(join(ROOT, "assets/sections/departamento/_fn"))) {
    const d = json("assets/sections/departamento/_fn/" + f);
    for (const r of d.rows || []) if (NS.isNotSold({ title: r[0], retailer: r[2] })) bad.push(f + ": " + r[0]);
  }
  for (const f of readdirSync(join(ROOT, "assets/sections/departamento/electronics"))) scan("assets/sections/departamento/electronics/" + f);
  scan("assets/ofertas/deals.json");
  for (const f of readdirSync(join(ROOT, "assets/ofertas/slices")).filter((n) => /^costco\./.test(n))) scan("assets/ofertas/slices/" + f);
  for (const f of readdirSync(join(ROOT, "assets/pdp/p"))) scan("assets/pdp/p/" + f);
  for (const f of readdirSync(join(ROOT, "assets/home/category-pills")).filter((n) => /costco/.test(n))) scan("assets/home/category-pills/" + f);
  const idx = readFileSync(join(ROOT, "assets/search/catalog-index.json"), "utf8");
  for (const t of ["Pepcid Complete", "TUMS Antacid", "Kirkland Signature Triple Action Joint Health", "La Fiesta 4.5\\\" Corn Tortillas", "Tums Ultra Antacid"]) if (idx.includes(t)) bad.push("catalog-index: " + t);
  const price = readFileSync(join(ROOT, "price-index.json"), "utf8");
  if (/pepcid complete|tums antacid/i.test(price)) bad.push("price-index: TUMS/Pepcid");
  assert.deepEqual(bad.slice(0, 20), []);
});

await check("Electrónica takes its members by type: no store lens, rail or row is a non-electronics product", () => {
  const d = json("assets/sections/departamento/_fn/electronics.json");
  const bad = d.rows.filter((r) => isNotElectronics(r[0]) || NS.notSoldKind(r[0]) === "farmacia" || NS.notSoldKind(r[0]) === "alimento").map((r) => r[2] + ": " + r[0]);
  assert.deepEqual(bad.slice(0, 10), []);
  for (const t of ["Holden 3-in-1 TV Console", "Tresanti Juliette 75” Console with Electric Fireplace", "Meta Quest - Four $25 eGift Cards",
    "HTH 3\" Chlorine Tablets for Pool Sanitization, 40 lbs.", "AppleCare+ for Headphones", "The Avengers Cast Autographed Captain America Shield - Signed and Inscribed by 17 Actors"]) assert.ok(isNotElectronics(t), t);
  for (const t of ["PlayStation 5 Console", "Hisense AX700 5.1.4 Ch Soundbar with Wireless Subwoofer", "Apple TV 4K 64GB (Wi-Fi)"]) assert.ok(!isNotElectronics(t), t);
  const dir = "assets/sections/departamento/electronics/";
  const lenses = readdirSync(join(ROOT, dir)).filter((f) => /^lens-/.test(f));
  assert.ok(lenses.includes("lens-costco.json"));
  for (const f of lenses) for (const x of titlesIn(json(dir + f))) assert.ok(!isNotElectronics(x.t) && !NS.notSoldKind(x.t), `${f}: ${x.t}`);
});

await check("Drones is its own Electrónica type: Por tipo rail, t=drones page (DJI pro line first), aisle, out of Cámaras", () => {
  assert.ok(isDrone("DJI Mini 5 Pro Drone with RC-N3 & Case") && isDrone("DJI - Neo 2 Fly More Combo") && isDrone("Snaptain SP350 Drone with Remote Control"));
  for (const t of ["Murder Drones Uzi Backpack", "Murder Drones N Yellow Portrait T-Shirt", "Shark D-Skwal 3 Drone Helmet (MD and XL)", "DJI Osmo Pocket 3 Creator Combo"]) assert.ok(!isDrone(t), t);
  assert.equal(techAisle("DJI Mini 5 Pro Drone with RC-N3 Fly More Combo"), "tech_drones");
  assert.equal(techAisle("DJI Osmo Pocket 3 Creator Combo"), "tech_camaras");
  assert.ok(droneRank({ title: "DJI Mavic 4 Pro Fly More Combo" }) < droneRank({ title: "Snaptain Kids Mini Drone Toy" }));
  const D = dept.loadDept("electronics");
  const drones = D.list.filter((p) => dept.typeKeyOf(p).k === "drones");
  assert.ok(drones.length >= 150, `only ${drones.length} drones`);
  const stores = new Set(drones.map((p) => p.retailer));
  for (const s of ["bhphoto", "walmart", "brandsmart"]) assert.ok(stores.has(s), "no " + s + " drone");
  const axis = dept.answer({ dept: "electronics", axis: "tipo" }).body.rails;
  const rail = axis.find((r) => r.k === "drones");
  assert.ok(rail && rail.title === "Drones" && rail.count === drones.length, "no Drones rail in Por tipo");
  assert.match(rail.cards[0].t, /\bDJI\b/);
  const cams = axis.filter((r) => /c[aá]mara/i.test(r.title));
  for (const r of cams) for (const c of r.cards) assert.ok(!isDrone(c.t), `${r.title}: ${c.t}`);
  for (const p of D.list) if (dept.techAisleOf(p) === "tech_camaras" || /^c[aá]maras/i.test(dept.typeKeyOf(p).label)) assert.ok(!isDrone(p.title), "a drone in Cámaras: " + p.title);
  const page = dept.answer({ dept: "electronics", t: "drones" });
  assert.equal(page.status, 200);
  assert.equal(page.body.count, drones.length);
  assert.match(page.body.sections ? page.body.sections[0].title : JSON.stringify(page.body).slice(0, 4000), /Drones/);
  const head = json("assets/sections/departamento/electronics/head.json");
  assert.ok(JSON.stringify(head).includes("Drones"), "the department's aisles carry no Drones rail");
});

await check("the search router lands dron / drone / drones / dji on the Drones type page", async () => {
  const search = await import("../../netlify/functions/search.js");
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  for (const q of ["dron", "drone", "drones", "dji"]) {
    const r = await search.handler({ httpMethod: "GET", queryStringParameters: { q, route: "1" } }, { fetchImpl });
    const d = JSON.parse(r.body).destination;
    assert.equal(d.kind, "category", q);
    assert.equal(d.url, "departamento.html?dept=electronics&t=drones", q);
  }
  assert.equal(json("assets/search/destinations.json").depts.electronics[1].drones, "Drones");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
