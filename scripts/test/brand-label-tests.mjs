/* ==================================================================
   THE BRAND PAGE WEARS THE BRAND SEARCHED (#443 c.6585655315 P1).

   Danny found "disney" landing on a page called BaubleBar (first rail
   «Ofertas de BaubleBar», 2,232 products), "marvel" on FUNKO, "xbox" on
   Avolusion, "swim" on Skims, "studio" on Nike: 56 brand landings
   named after another brand, because a key of 4+ letters took every
   product with that word in its title and the page was named after the
   commonest brand field among them. Accented brands lost a letter in
   their slug (maisonkitsun, chlo, lancme, alaa).

   For EVERY brand search can land on (assets/search/destinations.json
   brands): the page's name is the brand searched, and every product on
   it is that brand's.

   RUNNING IT
     node scripts/test/brand-label-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { FN_FILE, brandKeyOf, plainKey, rowItem, filterByBrand } from "../../netlify/functions/_brand-core.js";
import { handler } from "../../netlify/functions/brand.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const readJSON = (rel) => JSON.parse(readFileSync(ROOT + rel, "utf8"));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const call = async (qs) => JSON.parse((await handler({ httpMethod: "GET", queryStringParameters: qs })).body);

const DEST = readJSON("assets/search/destinations.json");
const FN = readJSON(FN_FILE);
const ITEMS = FN.rows.map(rowItem);

await check("every brand destination's page is named after the brand searched", () => {
  const bad = [];
  for (const [key, [label]] of Object.entries(DEST.brands)) {
    const head = readJSON(`assets/sections/marca/${key}.json`);
    if (plainKey(label) !== key || head.label !== label || head.key !== key) bad.push(`${key} -> «${head.label}»`);
  }
  assert.deepEqual(bad, [], `${bad.length} brand pages wear another name: ${bad.slice(0, 20).join(", ")}`);
});

await check("every product on every brand page is that brand's (every rail's cards, and the full list)", () => {
  const bad = [];
  for (const key of Object.keys(DEST.brands)) {
    const head = readJSON(`assets/sections/marca/${key}.json`);
    for (const r of head.rails) for (const c of r.cards) if (brandKeyOf(c.b || "") !== key) bad.push(`${key}: «${c.t}» (${c.b || "sin marca"})`);
    const all = filterByBrand(ITEMS, key);
    assert.equal(all.length, head.count, `${key}: the head counts ${head.count}, the brand has ${all.length}`);
    for (const p of all) if (brandKeyOf(p.brand) !== key) bad.push(`${key}: «${p.name}» (${p.brand})`);
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} products on a brand page are another brand's`);
});

await check("Danny's examples: Disney is Disney, Marvel is Marvel, Xbox is Xbox, Swim is Swim, Studio is Studio", () => {
  for (const [key, label] of [["disney", "Disney"], ["marvel", "Marvel"], ["xbox", "XBOX"], ["swim", "Swim"], ["studio", "Studio"]]) {
    const head = readJSON(`assets/sections/marca/${key}.json`);
    assert.equal(head.label, label, `${key} is labelled «${head.label}»`);
    assert.ok(head.rails[0].title === "Ofertas de " + label || head.rails[0].title.startsWith(label + " en "), `${key}'s first rail is «${head.rails[0].title}»`);
  }
  const disney = readJSON("assets/sections/marca/disney.json");
  assert.ok(!disney.rails.some((r) => /^Ofertas de (?!Disney$)/.test(r.title)), "a Disney rail sells another brand's Ofertas");
  assert.ok(disney.count < 2232, "Disney still carries the BaubleBar wall");
});

await check("accents keep their letter: maisonkitsune, chloe, lancome, alaia, loreal (and the old slug still answers)", async () => {
  for (const [key, label] of [["maisonkitsune", "Maison Kitsuné"], ["chloe", "Chloé"], ["lancome", "Lancôme"], ["alaia", "ALAÏA"]]) {
    assert.ok(existsSync(`${ROOT}assets/sections/marca/${key}.json`), `${key}.json missing`);
    assert.equal(readJSON(`assets/sections/marca/${key}.json`).label, label);
  }
  for (const key of ["maisonkitsun", "chlo", "lancme", "alaa"]) assert.ok(!existsSync(`${ROOT}assets/sections/marca/${key}.json`), `${key}.json is still written`);
  const old = await call({ marca: "maisonkitsun" });
  assert.equal(old.key, "maisonkitsune", "the old slug does not answer as Maison Kitsuné");
  assert.equal(old.label, "Maison Kitsuné");
  assert.equal((await call({ marca: "Maison Kitsuné" })).key, "maisonkitsune");
});

await check("a company or board-shop suffix is the same brand (Vuori, Inc. / Herschel Supply / Spitfire Skateboard Wheels)", async () => {
  for (const [label, key] of [["Vuori, Inc.", "vuori"], ["Herschel Supply", "herschel"], ["Spitfire Skateboard Wheels", "spitfire"], ["Energizer Holdings. Inc", "energizer"], ["Baker Skateboards", "baker"], ["Independent Truck Co", "independent"], ["Style & Co", "styleco"], ["Style&Co.", "styleco"]]) {
    assert.equal(brandKeyOf(label), key);
  }
  assert.equal(brandKeyOf("Boards"), "boards", "a brand that is only the suffix keeps its name");
  assert.equal((await call({ marca: "herschelsupply" })).key, "herschel");
});

await check("marca.html makes the same key as the endpoint", () => {
  const page = readFileSync(ROOT + "marca.html", "utf8");
  const src = /function brandKeyOf\(label\)\{[\s\S]*?\n\}/.exec(page)[0];
  const pageKey = new Function(src + "; return brandKeyOf;")();
  for (const l of ["Maison Kitsuné", "L'Oréal Paris", "ALAÏA", "Vuori, Inc.", "Comme des Garçons PLAY", "Hot Wheels", "Play-Doh", "LEGO", "Herschel Supply Co.", "Style & Co", "Independent Truck Co"]) assert.equal(pageKey(l), brandKeyOf(l), l);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL  " + f + "\n");
process.exit(failures.length ? 1 : 0);
