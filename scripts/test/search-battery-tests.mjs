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
   (alisado was 0 until the SleekShop shelf was wired; now it is the shelf).

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
  /* Vajilla is what the meal is served on: dinnerware sets, plates, bowls (#443 c.6632585468). */
  ["vajilla", /dinnerware|vajilla|plates?\b|bowls?\b|place setting/i],
  ["sabanas", /sheet|s[aá]bana/i],
  ["mascarilla", /mask|mascarilla/i],
  /* SleekShop wired (#443 c.6475799491): the alisado shelf exists now. */
  ["alisado", /straighten|smooth|blowout|alisad/i],
];
for (const [q, rx] of BATTERY) {
  const r = searchPage(ctx, q, 1, { pageSize: 12 });
  const foreign = r.items.filter((it) => !rx.test(String(it.title || it.name || "")));
  const ok = r.items.length > 0 && foreign.length === 0;
  if (ok) passed++; else failures.push(`«${q}»: ${r.items.length} shown, foreign: ${foreign.map((i) => i.title || i.name).slice(0, 3).join(" | ")}`);
  console.log(`    ${ok ? "ok  " : "FAIL"} «${q}» page 1 is all its own kind (${r.total} found)`);
}
/* Honest states: nothing true wired, nothing shown. */
for (const [q, bad] of [["alisado", /palisade|alisa\b|blouse|sunglass|skirt/i], ["pesas", /kosas|foundation|mascara|peptide/i]]) {
  const r = searchPage(ctx, q, 1, { pageSize: 12 });
  const junk = r.items.filter((it) => bad.test(String(it.title || it.name || "")));
  const ok = junk.length === 0;
  if (ok) passed++; else failures.push(`«${q}»: lookalikes ${junk.map((i) => i.title || i.name).slice(0, 3).join(" | ")}`);
  console.log(`    ${ok ? "ok  " : "FAIL"} «${q}» shows no lookalike (${r.total} found)`);
}

/* ---------- REACH (#443 c.6693598650 §3, c.6709315389, c.6687338498) ----------
   Each word of the Nov 6 audit, the way a shopper's search runs: the
   router (/api/search?route=1) and the landing's own endpoint, in process
   (scripts/search-reach-audit.mjs). The floor is the share of the shelf
   the audit measured that the landing reaches; every card of the
   landing's first rails is the word's own kind (no contamination). */
const { measure, TERMS } = await import("../search-reach-audit.mjs");
const KIND = Object.fromEntries(TERMS.map(([t, , k]) => [t, k]));
const reach = async (q) => measure(q, KIND[q] || null);
const check = (name, ok, why) => { if (ok) passed++; else failures.push(`${name}: ${why}`); console.log(`    ${ok ? "ok  " : "FAIL"} ${name}`); };
/* term, landing url must match, floor (products reached), the shelf the audit counted */
const REACH = [
  ["perfumes", /dept=perfumes/, 10500, 11217],
  ["carteras", /dept=purses&ver=tipos&pt=carteras/, 3000, 3805],
  ["poleras", /pt=polerones/, 3000, 2136],
  ["polera", /pt=polerones/, 3000, 2136],
  ["champú", /dept=cabello.*pt=champu/, 350, 383],
  ["keratina", /pt=keratina/, 75, 81],
  ["zapatos", /dept=shoes&ver=tipos$/, 10500, 11903],
  ["botas", /dept=shoes&ver=tipos&pt=botas/, 900, 949],
  ["chort", /pt=shorts/, 4000, 7267],
  ["shor", /pt=shorts/, 4000, 7267],
  ["swetshert", /pt=polerones/, 3000, 2136],
  ["hudi", /pt=polerones/, 3000, 3884],
  /* the real shelves: 6 consoles in Electrónica (the catalogue's 7th is a
     Costco bundle outside it) -- the audit's 632 counted the word, Costco's
     console tables and the Xbox headsets among it; 87 phones (the aisle's
     113 less the carrier-locked ones the store rules drop) -- its 734
     counted cases and chargers */
  ["consola", /pt=consolas/, 6, 7],
  ["celular", /pasillo%3Atech_celulares/, 85, 113],
];
for (const [q, url, floor, shelf] of REACH) {
  const r = await reach(q);
  check(`«${q}» lands on its whole shelf: ${r.count} (floor ${floor}, ${Math.round(100 * Math.min(r.count || 0, shelf) / shelf)}% of the audit's ${shelf})`,
    r.landing === "category" && url.test(r.url) && r.count >= floor, `${r.landing} ${r.url} count ${r.count}`);
  check(`«${q}» landing holds only its own kind`, r.sampled > 0 && r.foreign.length === 0, `${r.foreign.length}/${r.sampled} foreign: ${r.foreign.slice(0, 3).join(" | ")}`);
}
{
  const r = await reach("lencería");
  check(`«lencería» opens Ropa Interior Mujer (${r.count}; ${r.underwear} lingerie, bras and panties first)`, r.page === "ropa-interior.html#mujer" && r.underwear >= 2500, `${r.url} ${r.count}`);
  check("«lencería» landing holds only its own kind", r.sampled > 0 && r.foreign.length === 0, r.foreign.slice(0, 3).join(" | "));
}
/* The watch-list typos and the filler word reach their shelf. */
{
  const y = await reach("youg la");
  check(`«youg la» opens YoungLA (${y.count})`, y.landing === "store" && /tienda=youngla/.test(y.url) && y.count >= 700, `${y.landing} ${y.url}`);
  const v = await reach("victoria secret sales");
  check(`«victoria secret sales» opens Victoria's Secret's sales, «sales» is not a title word (${v.count})`, v.landing === "store" && /tienda=victoriassecret&q=sale$/.test(v.url) && v.count >= 500, `${v.landing} ${v.url} ${v.count}`);
}
/* Targeted typo fixes: the exact words keep their own answer. */
{
  const { destinationFor } = await import("../../netlify/functions/_search-destinations.js");
  const { LABELS } = await import("../../netlify/functions/search.js");
  const dctx = loadSearch({ labels: LABELS });
  const url = (q) => destinationFor(dctx, q, {}).destination.url || "";
  check("«shorts», «chort» and «shor» land on one page", url("shorts") === url("chort") && url("chort") === url("shor"), [url("shorts"), url("chort"), url("shor")].join(" / "));
  check("«hoodie», «sweatshirt», «hudi», «swetshert» land on one page", new Set(["hoodie", "sweatshirt", "hudi", "swetshert"].map(url)).size === 1, ["hoodie", "hudi"].map(url).join(" / "));
  check("«short sleeve shirt» is not the Shorts type", !/pt=shorts/.test(url("short sleeve shirt")), url("short sleeve shirt"));
  check("«bootcut jeans» is not the Botas type", !/pt=botas/.test(url("bootcut jeans")), url("bootcut jeans"));
  check("«botas mujer» opens the Botas type for women, not every women's shoe", /pt=botas&para=women/.test(url("botas mujer")), url("botas mujer"));
}
/* HONEST EMPTY: a shelf the catalogue does not have is said plainly; the
   rails below it are real shelves, each named for what it is. */
for (const [q, title, railRx, bad] of [
  ["zapatillas de voley", /^No tenemos zapatillas de vóley/, /\b(tennis|padel|pádel|pickleball|court)\b.*\b(shoes?|sneakers?)\b|\b(shoes?|sneakers?)\b.*\b(tennis|padel|pickleball)\b/i, /swim|trunks?|shorts?|charm|bracelet|volley/i],
  ["zapatillas de volley", /^No tenemos zapatillas de vóley/, null, /swim|trunks?|shorts?|charm|volley/i],
  ["volleyball shoes", /^No tenemos zapatillas de vóley/, null, /swim|trunks?|shorts?|charm|volley/i],
  ["pesas", /^No tenemos pesas ni mancuernas/, /glove|belt|strap|wrap|grip|weight/i, /kosas|foundation|mascara|tee|t-shirt|hoodie|sweatpants|rattle|pajama/i],
  ["mancuernas", /^No tenemos pesas ni mancuernas/, null, /kosas|tee|t-shirt|hoodie|sweatpants|rattle|pajama/i],
]) {
  const r = await reach(q);
  const c = r.chooser || {};
  const items = (c.rails || []).flatMap((x) => x.items);
  check(`«${q}» says plainly there are none («${c.title}»)`, r.landing === "chooser" && c.reason === "honest" && title.test(c.title || ""), `${r.landing} ${r.url}`);
  check(`«${q}» shows nothing dressed up as it (${items.length} cards, each a real neighbour)`, (c.rails || []).length > 0 && items.every((t) => !bad.test(t)) && (!railRx || items.every((t) => railRx.test(t))),
    items.filter((t) => bad.test(t) || (railRx && !railRx.test(t))).slice(0, 3).join(" | "));
  check(`«${q}» rails are labelled for what they are, each a door to its own type page`, (c.rails || []).every((x) => !/v[oó]ley|volley|mancuerna|^pesas$/i.test(x.label) && /^departamento\.html\?dept=[a-z_]+&ver=tipos&pt=[a-z-]+$/.test(x.url)), (c.rails || []).map((x) => x.label + " " + x.url).join(" | "));
  check(`«${q}» results page answers honestly too (state none, «Por ahora no tenemos …»)`, r.results.state === "none" && !!r.results.sense, JSON.stringify(r.results));
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
