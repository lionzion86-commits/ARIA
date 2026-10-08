/* ==================================================================
   THE WEIGHT TABLE — one table, two copies that must agree.

   2026-10-08. Lucifer's keyword table was folded into the site's own
   (Danny: "merge my keywords into the existing table, don't run two
   tables"). The table exists twice because index.html is a plain
   <script> and cannot import: RETAIL_WEIGHT_ESTIMATES_KG prices the
   card, RETAIL_WEIGHT_FALLBACK_KG (scripts/lib/sales-sources.js)
   prices checkout and the sales refresh. They had drifted -- 5,571
   catalogue titles were quoted one weight on the card and another at
   checkout -- and three modules the checkout needs did not even load.

   RUNNING IT
     node scripts/test/weight-table-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadPageWeightSlice } from "./_page-script.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

/* ------------------------------------------------------------------
   EVERY SHARED MODULE LOADS. On 2026-10-08 three of them did not, and
   14 Netlify functions (resolve-weight, shipment-track, the shipping
   adapters, the admin pages) crashed at start-up.
   ------------------------------------------------------------------ */
await check("every scripts/lib module loads", async () => {
  const bad = [];
  for (const f of readdirSync(ROOT + "scripts/lib").filter(f => f.endsWith(".js"))) {
    try { await import(ROOT + "scripts/lib/" + f); } catch (e) { bad.push(`${f}: ${e.message.split("\n")[0]}`); }
  }
  assert.deepEqual(bad, [], bad.join("; "));
});

const S = await import(ROOT + "scripts/lib/sales-sources.js");
const P = loadPageWeightSlice();
const pageSrc = readFileSync(ROOT + "index.html", "utf8").replace(/\r/g, "");
const serverSrc = readFileSync(ROOT + "scripts/lib/sales-sources.js", "utf8");

/* ------------------------------------------------------------------
   ONE TABLE.
   ------------------------------------------------------------------ */
function tableRows(src, name) {
  const a = src.indexOf(`const ${name} = [`);
  let d = 0, i = src.indexOf("[", a);
  for (let j = i; j < src.length; j++) {
    if (src[j] === "[") d++;
    else if (src[j] === "]" && !--d) return src.slice(i, j + 1).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").replace(/\s+/g, " ").replace(/"/g, "'");
  }
  return null;
}
function block(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  return src.slice(a, b).replace(/\s+/g, " ");
}
await check("the card's table and the checkout's table are the same rows", () => {
  assert.equal(tableRows(serverSrc, "RETAIL_WEIGHT_FALLBACK_KG"), tableRows(pageSrc, "RETAIL_WEIGHT_ESTIMATES_KG"),
    "RETAIL_WEIGHT_FALLBACK_KG (sales-sources.js) and RETAIL_WEIGHT_ESTIMATES_KG (index.html) differ");
  const kw = (src) => block(src, "const KEYWORD_WEIGHT_KG = [", "function keywordWeightPattern");
  assert.equal(kw(serverSrc), kw(pageSrc), "the keyword rows differ between sales-sources.js and index.html");
  const matcher = (src) => block(src, "function keywordWeightPattern", "keyword: k }").replace(/RETAIL_WEIGHT_\w+_KG/g, "TABLE");
  assert.equal(matcher(serverSrc), matcher(pageSrc), "the keyword matcher differs");
});

const titles = new Set();
for (const f of readdirSync(ROOT).filter(f => /(?:-catalog|^department-cache-[a-z]+)\.json$/.test(f))) {
  let d; try { d = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
  for (const r of Object.values(d.retailers || {})) for (const s of ["departments", "brands"]) {
    for (const b of Object.values((r && r[s]) || {})) for (const it of (Array.isArray(b) ? b : (b && b.items) || [])) {
      const t = it && (it.title || it.name); if (t) titles.add(String(t));
    }
  }
}
await check("the card and the checkout quote the same weight for every catalogue title", () => {
  assert.ok(titles.size > 100000, `only ${titles.size} titles`);
  const off = [];
  for (const t of titles) {
    const a = P.estimateRetailWeightDetail(t, {}).kg, b = S.estimateWeightDetail(t, {}).kg;
    if (Math.abs(a - b) > 0.001) off.push(`${t.slice(0, 60)}: card ${a}, checkout ${b}`);
  }
  assert.equal(off.length, 0, `${off.length} disagree, e.g. ${off.slice(0, 3).join(" | ")}`);
});

/* ------------------------------------------------------------------
   THE KEYWORDS DO WHAT THEY SAY -- and nothing they should not.
   ------------------------------------------------------------------ */
const kg = (t) => S.estimateWeightDetail(t, {});
await check("Lucifer's keywords price what used to fall to the generic default", () => {
  for (const [t, lo, hi] of [
    ["Andrea Zodiac Necklace - Capricorn", 0.05, 0.2],
    ["7S Superfish 4 Surfboard", 4, 7],
    ["Landyachtz Wolfshark Longboard Deck", 4, 7],
    ["Bridgestone TW9 Trail Wing Front Tires", 8, 14],
    ["DJI Mavic 4 Pro Drone with Fly More Combo", 1, 2],
    ["Huggies Plus Diapers Size 1-2", 1, 2],
    ["Marvel Loki Cufflinks", 0.05, 0.2],
    ["Funko Pop! Disney 101 Dalmatians Cruella De Vil Vinyl Figure", 0.3, 0.6],
    ["Muñeca Barbie Fashionistas", 0.4, 1],
  ]) {
    const w = kg(t);
    assert.ok(w.kg >= lo && w.kg <= hi, `"${t}" -> ${w.kg} kg (${w.source}), expected ${lo}-${hi}`);
    assert.notEqual(w.source, "fallback", `"${t}" still falls to the generic default`);
  }
});
await check("the false hits the catalogue showed are guarded", () => {
  for (const [t, max] of [
    ["OJ Dirt Tires Thunder Juice 78a Skateboard Wheels - Black - 70mm", 1],   // "tire", 8 kg
    ["NCAA University of North Carolina Tar Heels Cufflinks", 0.3],            // "heels"
    ["Beautiful 3.5 Qt Stand Mixer, Black Sesame with Flat Beater, Dough Hook and Balloon Whisk", 99], // not "balloon" 0.2
    ["FCS II Accelerator Performance Core Tri Surfboard Fins - Large/White", 1], // "surfboard", 4 kg
    ["Dano's Downhills Longboard Wheels 70mm - 78a Blue", 1],                  // "longboard", 4 kg
    ["Collectible Pokemon Trading Card Game Classic with 3 Decks", 1],         // "deck"
    ["Picnic Time Dallas Cowboys BBQ Apron & Tote", 2],                        // the 50 kg grill row
    ["LEGO Technic Chevrolet Corvette Stingray Toy Modelo de coche", 3],       // "coche", 8 kg
  ]) assert.ok(kg(t).kg <= max, `"${t}" -> ${kg(t).kg} kg`);
  assert.ok(kg("Beautiful 3.5 Qt Stand Mixer, Black Sesame with Flat Beater, Dough Hook and Balloon Whisk").kg >= 0.6, "a stand mixer must not price as a balloon");
  for (const t of ["200 Women", "Funko Pop! Marvel X-Men '97 Storm Vinyl Bobblehead", "MERCON V Automatic Transmission Fluid, 1 Quart (BRA-126-C)", "TIE ROD END 1 EA DRIVE"])
    assert.ok(kg(t).kg >= 0.45, `"${t}" -> ${kg(t).kg} kg: an audience word or a part number lowered the quote`);
});
await check("keywords never outrank the rows that were already there", () => {
  assert.equal(kg("Leather Jacket").kg, kg("Jacket").kg, "the existing jacket row must still answer");
  assert.ok(kg("Ninja Air Fryer 4 Qt").kg >= 8, "air fryer");
  assert.ok(kg("Safavieh Contemporary Glass Coffee Table").kg >= 40, "coffee table");
});
await check("estimates carry the 1.35x reasoned buffer", () => {
  assert.equal(S.estimateWeightDetail("Andrea Zodiac Necklace", {}).kg, P.estimateRetailWeightDetail("Andrea Zodiac Necklace", {}).kg);
  const row = P.RETAIL_WEIGHT_ESTIMATES_KG.find(r => r.keyword === "surfboard");
  assert.ok(row && row.tier === "reasoned" && row.kg === 4, "surfboard row");
  assert.equal(kg("7S Superfish 4 Surfboard").kg, 5.4);
});

/* ------------------------------------------------------------------
   NO CATALOGUE SHIPS A FLAT PLACEHOLDER WEIGHT. A catalogue weight
   beats the estimator, so one number stamped on every product prices
   coffee tables as T-shirts. Kohl's carried 0.5/0.55 kg on 1,898
   products (stripped by scripts/strip-placeholder-weights.mjs).
   KNOWN_FLAT are the ones already on main when this test was written,
   waiting on Danny's call; anything new fails.
   ------------------------------------------------------------------ */
const KNOWN_FLAT = new Set(["yesstyle-catalog.json", "sunglasses-catalog.json", "jewelry-catalog.json", "newbalance-catalog.json", "revolve-catalog.json"]);
await check("no catalogue carries one flat estimated weight on its products", () => {
  const flat = [];
  for (const f of readdirSync(ROOT).filter(f => /(?:-catalog|^department-cache-[a-z]+)\.json$/.test(f))) {
    if (KNOWN_FLAT.has(f)) continue;
    let d; try { d = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    const counts = new Map(); let est = 0;
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      if (Number(o.weightKg) > 0 && o.weightEstimated !== false) { est++; counts.set(o.weightKg, (counts.get(o.weightKg) || 0) + 1); }
      Object.values(o).forEach(walk);
    })(d);
    const top = Math.max(0, ...counts.values());
    if (est >= 25 && counts.size <= 2 && top / est >= 0.6) flat.push(`${f}: ${[...counts.entries()].map(([k, n]) => `${k} kg x${n}`).join(", ")}`);
  }
  assert.deepEqual(flat, [], `placeholder weights: ${flat.join("; ")} — run scripts/strip-placeholder-weights.mjs`);
});

const MIN_CHECKS = 8;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
