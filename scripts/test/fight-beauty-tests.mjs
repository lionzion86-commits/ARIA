/* ==================================================================
   DANNY'S FORMAT PLAN §7 AND §8 (#443 c.6504037778), and the standing
   rule they ran into: English is never shown as Spanish copy.

     §7 Aria Fight Club leads with fight equipment; workout apparel
        cross-sells below, never leads.
     §8 Aria Beauty opens with Ofertas, then the women's perfumes and body
        sprays, Victoria's Secret's first; «Accesorios» is jewelry only;
        no snorkels, dive masks or wetsuits.
     Every department rail's title is Spanish -- never the store's own
     English type name, never a store code ("2T68").

     node scripts/test/fight-beauty-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { typeLabel } from "../../netlify/functions/_department-core.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const DIR = ROOT + "assets/sections/departamento/";
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(f, "utf8"));
const GEAR_RX = /\b(gloves?|gis?|kimonos?|shin ?(guards?|pads?)|head ?gear|mouth ?guards?|wraps?|mitts?|pads?|bags?|protectors?|rash ?guards?|spats)\b/i;
const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");

check("§7 Fight Club: the department's Ofertas and the homepage rail open on fight gear; gear aisles first", () => {
  const head = json(DIR + "combat_sports/head.json");
  const [ofertas, ...rails] = head.rails;
  assert.equal(ofertas.title, "Ofertas");
  for (const c of ofertas.cards.slice(0, 8)) assert.match(c.t, GEAR_RX, "Ofertas opens on: " + c.t);
  assert.match(rails[0].title, /guantes|gis|polos de licra|canilleras|mallas de compresi[oó]n|equipo|protecciones|paos/i, "the first aisle: " + rails[0].title);
  const home = json(ROOT + "assets/home/shelves/category.json").rails.combat_sports;
  for (const p of home.slice(0, 6)) assert.match(p.title, GEAR_RX, "homepage Fight Club opens on: " + p.title);
  assert.match(bundle, /gearFirst: true, \/\* DANNY 2026-10-29/);
});

check("§8 Aria Beauty: Ofertas, then perfumes and body sprays led by Victoria's Secret; no snorkels or wetsuits; Accesorios is jewelry", () => {
  const head = json(DIR + "beauty/head.json");
  assert.deepEqual(head.rails.slice(0, 2).map((r) => r.title), ["Ofertas", "Perfumes y brumas"]);
  for (const c of head.rails[1].cards.slice(0, 6)) assert.equal(c.r, "victoriassecret", c.t);
  for (const r of head.rails) assert.doesNotMatch(r.title, /snorkel|neopreno|máscaras y/i, r.title);
  const acc = head.rails.find((r) => r.title === "Accesorios");
  if (acc) for (const c of acc.cards || []) assert.match(c.t, /\b(bracelets?|necklaces?|earrings?|rings?|anklets?|charms?|pendants?|chains?)\b/i, c.t);
  for (const r of head.rails) for (const c of r.cards || []) assert.doesNotMatch(c.t, /\b(snorkel|wetsuit|neoprene|dive mask|goggles)\b/i, c.t);
});

check("every department rail speaks Spanish: no English type name, no store code", () => {
  const ENGLISH = /\b(t ?shirts?|shirts?|pants|jackets?|dress(es)?|sweatshirts?|hoodies?|sneakers|sandals|boots|heels|bags?|wallets?|belts?|gloves|socks|caps|hats|necklaces?|bracelets?|earrings|rings|jewelry|accessor(y|ies)|hair care|for (him|her)|women|men|kids|panties|bras|underwear|skirts?|coats?|trousers|cardigans?|crewnecks?|sweaters?|swimsuits?|decor|candles?|pillows?|mirrors?|vases|frames|ornaments?|computers?|monitors?|keyboards?|rash ?guards?|spats)\b/i;
  const CODE = /^(?=.*\d)[A-Za-z0-9]+$/;
  const bad = [];
  for (const d of readdirSync(DIR)) {
    if (d === "perfumes" || !existsSync(DIR + d + "/head.json")) continue;   /* the perfume houses' own names */
    for (const r of json(DIR + d + "/head.json").rails || [])
      if (CODE.test(r.title) || (ENGLISH.test(r.title) && !/[áéíóúñ]|\b(de|y|para|con)\b/i.test(r.title))) bad.push(`${d}: ${r.title}`);
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} English or code titles`);
  assert.equal(typeLabel("HOODIES & ZIPUPS"), "Polerones y casacas con cierre");
  assert.equal(typeLabel("T Shirts"), "Polos");
  assert.equal(typeLabel("For Him"), "Para él");
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
