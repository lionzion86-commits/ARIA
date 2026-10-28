/* ==================================================================
   SPANISH SEARCH BATTERY: NO LOOKALIKE FILLERS (#443 c.6477677381,
   Danny's live find; c.6478195227, Lucifer's 139-query audit).

   «keratina» showed Serafina dish cloths and wine glasses beside the
   hair products, «alisado» a page of Palisade blouses and sunglasses,
   «plancha» white T-shirts (corrected to «blanca»), «pesas» Kosas
   makeup, «vajilla» VANILLA perfumes. The fuzzy layers now take the
   nearest spelling only, two edits only from eight letters, never on
   the first letter; the dictionary knows the Spanish words.

   Each term's first page (12) must hold its own kind of product and
   nothing else; a term with nothing true in stock answers honestly
   (alisado: 0 until the SleekShop shelf is wired, then re-run).

     node scripts/test/search-battery-tests.mjs
   ================================================================== */
import { searchPage, loadSearch } from "../../netlify/functions/_search-core.js";

process.chdir(new URL("../../", import.meta.url).pathname);
const ctx = loadSearch();
let passed = 0;
const failures = [];
const BATTERY = [
  ["keratina", /kerat/i],
  ["plancha", /flat iron|straighten/i],
  ["champu", /shampoo|champ/i],
  ["labial", /lip|labial/i],
  ["mochila", /backpack|mochila|daypack|bag/i],
  ["zapatillas", /sneaker|shoe|trainer|runner|zapatilla|slip-on|clog|sandal|boot/i],
  ["vajilla", /dinnerware|vajilla/i],
  ["sabanas", /sheet|s[aá]bana/i],
  ["mascarilla", /mask|mascarilla/i],
];
for (const [q, rx] of BATTERY) {
  const r = searchPage(ctx, q, 1, { pageSize: 12 });
  const foreign = r.items.filter((it) => !rx.test(String(it.title || it.name || "")));
  const ok = r.items.length > 0 && foreign.length === 0;
  if (ok) passed++; else failures.push(`«${q}»: ${r.items.length} shown, foreign: ${foreign.map((i) => i.title || i.name).slice(0, 3).join(" | ")}`);
  console.log(`    ${ok ? "ok  " : "FAIL"} «${q}» page 1 is all its own kind (${r.total} found)`);
}
/* Honest states: nothing true wired, nothing shown. */
for (const [q, bad] of [["alisado", /palisade|alisa|blouse|sunglass|skirt/i], ["pesas", /kosas|foundation|mascara|peptide/i]]) {
  const r = searchPage(ctx, q, 1, { pageSize: 12 });
  const junk = r.items.filter((it) => bad.test(String(it.title || it.name || "")));
  const ok = junk.length === 0;
  if (ok) passed++; else failures.push(`«${q}»: lookalikes ${junk.map((i) => i.title || i.name).slice(0, 3).join(" | ")}`);
  console.log(`    ${ok ? "ok  " : "FAIL"} «${q}» shows no lookalike (${r.total} found)`);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
