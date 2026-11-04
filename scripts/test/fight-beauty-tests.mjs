#!/usr/bin/env node
/* FORMAT PLAN §7-§8 (#443 c.6504037778), re-applied fresh on main
   2026-11-04 (c.6623383286 item 4): Aria Fight Club leads with fight
   gear; Aria Beauty opens with Ofertas, then «Perfumes y brumas» led by
   Victoria's Secret's sprays; no snorkel, goggle, wetsuit or cloth face
   mask; «Accesorios» only for jewellery.
     node scripts/test/fight-beauty-tests.mjs */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FIGHT_GEAR_CLASSES, fightGearRank, BEAUTY_SCENT_DOOR, BEAUTY_SCENT_TITLE, rowItem } from "../../netlify/functions/_department-core.js";
import * as Pills from "../build-home-category-pills.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "assets/sections/departamento");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
const read = (f) => JSON.parse(readFileSync(join(DIR, f), "utf8"));
/* Every rail of a department, head and batches, with its cards. */
function rails(dept) {
  const out = [...read(`${dept}/head.json`).rails];
  for (const f of readdirSync(join(DIR, dept)).filter((x) => /^rails-\d+\.json$/.test(x))) out.push(...read(`${dept}/${f}`).rails);
  return out;
}
const fnRows = (dept) => read(`_fn/${dept}.json`).rows.map(rowItem);
const GEAR = FIGHT_GEAR_CLASSES.length;

await check("Fight Club: one list of fight gear for the department and the homepage carousel", () => {
  assert.equal(Pills.FIGHT_GEAR_CLASSES, FIGHT_GEAR_CLASSES);
  assert.deepEqual(FIGHT_GEAR_CLASSES.map(([k]) => k), ["guantes", "gi", "proteccion", "rashguard", "shorts"]);
});

await check("Fight Club: Ofertas and every brand rail lead with fight gear; workout apparel never ahead of it (§7)", () => {
  const rows = fnRows("combat_sports");
  const typeOf = new Map(rows.map((p) => [p.title + "|" + p.image, p.type]));
  const head = read("combat_sports/head.json");
  assert.equal(head.rails[0].k, "ofertas");
  const rank = (c) => fightGearRank({ type: typeOf.get(c.t + "|" + c.i) });
  /* The first Ofertas cards are gloves (Danny, c.6567120876 item 8: gloves, then gis). */
  assert.ok(head.rails[0].cards.slice(0, 6).every((c) => rank(c) === 0), head.rails[0].cards.slice(0, 6).map((c) => c.t).join(" | "));
  for (const r of rails("combat_sports")) {
    const ranks = (r.cards || []).map(rank);
    for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] >= ranks[i - 1], `${r.title}: «${r.cards[i].t}» (class ${ranks[i]}) after class ${ranks[i - 1]}`);
  }
  const venum = head.rails.find((r) => r.k === "marca:venum");
  assert.ok(venum && rank(venum.cards[0]) < GEAR, "Venum leads with gear");
  /* Nothing dropped: the room holds what it held. */
  assert.equal(head.count, rows.length);
});

await check("Beauty: Ofertas, then «Perfumes y brumas» led by Victoria's Secret's sprays (§8)", () => {
  const head = read("beauty/head.json");
  assert.deepEqual(head.rails.slice(0, 2).map((r) => r.title), ["Ofertas", BEAUTY_SCENT_TITLE]);
  const scent = head.rails[1];
  assert.ok(scent.cards.slice(0, 6).every((c) => c.r === "victoriassecret" && /\b(mists?|sprays?|spritz)\b/i.test(c.t)), scent.cards.slice(0, 6).map((c) => c.t).join(" | "));
  assert.ok(head.stores.some((s) => s.k === "victoriassecret" && s.n > 200), "Victoria's Secret reaches Beauty");
  const rows = fnRows("beauty");
  const scents = rows.filter((p) => p.a === BEAUTY_SCENT_DOOR);
  assert.equal(scents.length, scent.count);
  /* Women's: never a cologne, a «VS HIM», a lotion or a wash. */
  for (const p of scents) assert.doesNotMatch(p.title, /\b(him|homme|men'?s|cologne|lotions?|creams?|wash)\b/i, p.title);
  /* A scent rides only in its own rail. */
  for (const r of head.rails.slice(2)) for (const c of r.cards || []) assert.ok(!scents.some((p) => p.title === c.t && p.retailer === c.r), `${r.title}: «${c.t}» is a scent`);
});

await check("Beauty: no snorkel, dive mask, goggles, wetsuit or cloth face mask; «Accesorios» is jewellery only (§8)", () => {
  const rows = fnRows("beauty");
  for (const p of rows) {
    assert.doesNotMatch(String(p.type || ""), /snorkel|neopreno|wetsuit|f[uú]tbol/i, `${p.title} (${p.type})`);
    assert.doesNotMatch(p.title, /\b(snorkels?|goggles?|wetsuits?|dive masks?|neoprene)\b/i, p.title);
  }
  for (const n of ["Real Madrid Face Mask", "Connetic Face Mask", "Billionaire Boys Club BB Iconography Face Mask"]) assert.ok(!rows.some((p) => p.title === n), n);
  const titles = rails("beauty").map((r) => r.title);
  for (const t of ["Máscaras Y Snorkels", "Trajes De Neopreno"]) assert.ok(!titles.includes(t), t);
  const acc = rows.filter((p) => /^(accesorios|accessories)$/i.test(String(p.type || "").trim()));
  for (const p of acc) assert.match(p.title, /\b(bracelets?|necklaces?|earrings?|rings?|pendants?|anklets?|charms?|jewel\w*|chains?)\b/i, `«${p.title}» in Accesorios`);
  /* The surf shops' sunscreens and lip balms take their aisle. */
  const sun = rows.find((p) => /Sun Bum Signature SPF 30 Sunscreen Lip Balm/.test(p.title));
  assert.ok(sun && sun.type === "Protector solar", sun && sun.type);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
