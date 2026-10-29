/* ==================================================================
   DANNY'S FORMAT PLAN (#443 c.6504037778), item by item as it lands.

     §4 Hombre: men's fragrance is «Colonias»; «Perfumes» is women's.
     §5 Billeteras: wallets only, split out of «Mochilas y bolsos»,
        which keeps backpacks, fanny packs and bags -- never a hat.
     §6 Search pills: Nike Air Force One and Toallas stay; MacBook Air
        gives way to Lencería.

     node scripts/test/format-plan-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (f) => JSON.parse(readFileSync(ROOT + f, "utf8"));
const PILLS = "assets/home/pills/";
const pillCards = (aud, k) => {
  const head = json(PILLS + aud + ".json");
  return head.pills[0].k === k ? head.cards : json(PILLS + `${aud}-${k}.json`).cards;
};
const WALLET_RX = /\b(wallets?|billfolds?|blllfold|card ?holders?|card ?cases?|money clips?|coin (pouch|purse)|bi-?fold|tri-?fold)\b/i;
const HAT_RX = /\b(hats?|caps?|beanies?|snapbacks?|visors?)\b/i;

check("§4 Hombre: «Colonias», never «Perfumes»; Mujer keeps «Perfumes»", () => {
  const men = json(PILLS + "hombre.json").pills.map((p) => p.label);
  assert.ok(men.includes("Colonias"), men.join(", "));
  assert.ok(!men.includes("Perfumes"), men.join(", "));
  assert.ok(json(PILLS + "mujer.json").pills.some((p) => p.label === "Perfumes"));
});

check("§5 Billeteras: wallets only; Mochilas y bolsos holds no wallet and no hat", () => {
  const head = json(PILLS + "hombre.json");
  const b = head.pills.find((p) => p.label === "Billeteras");
  assert.ok(b, "no Billeteras pill");
  const wallets = pillCards("hombre", b.k);
  assert.ok(wallets.length >= 8, `${wallets.length} wallets`);
  for (const c of wallets) assert.match(c.t, WALLET_RX, c.t);
  const m = head.pills.find((p) => p.label === "Mochilas y bolsos");
  assert.ok(m, "no Mochilas y bolsos pill");
  for (const c of pillCards("hombre", m.k)) { assert.doesNotMatch(c.t, WALLET_RX, c.t); assert.doesNotMatch(c.t, HAT_RX, c.t); }
});

check("§6 search pills: Nike Air Force One and Toallas stay, Lencería replaces MacBook Air", () => {
  const html = readFileSync(ROOT + "index.html", "utf8");
  for (const dir of ["", ",'d'"]) {
    assert.ok(html.includes(`searchFor('Lencería'${dir})`), "Lencería " + (dir || "phone"));
    assert.ok(!html.includes(`searchFor('MacBook Air'${dir})`), "MacBook Air " + (dir || "phone"));
    assert.ok(html.includes(`searchFor('Toallas'${dir})`), "Toallas " + (dir || "phone"));
  }
  assert.match(html, /searchFor\('Nike Air Force/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
