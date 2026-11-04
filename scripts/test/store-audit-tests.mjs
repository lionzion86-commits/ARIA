#!/usr/bin/env node
/* THE FULL STORE AUDIT, AS A GATE (#443 c.6635296341 + c.6635303627).
   scripts/store-audit.mjs walks every store of the Tiendas carousel --
   front page, every rail, sub-carousel, chip, «Ver todo», filter-bar
   type and audience, and the homepage surfaces that carry the store's
   products. This fails on any defect of a class the audit fixed.
     node scripts/test/store-audit-tests.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAll, CLASSES } from "../store-audit.mjs";
import { isShoeItem, garmentFamily, sectionKind } from "../lib/store-truth.js";
import { isShoeForDept } from "../lib/footwear.js";
import { groupsOf, loadStore } from "../../netlify/functions/_tienda-core.js";
import { answerNav } from "../../netlify/functions/_nav-filter-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + String(e.message).split("\n")[0]); }
}
const idx = (k) => JSON.parse(readFileSync(join(ROOT, "assets/tienda", k, "index.json"), "utf8"));

/* The audit's own known misreads (the title rules, not the store): a
   product the rules cannot place from its name. Each is named; a new one
   fails the gate. */
const KNOWN = new Set([
  "revolve|NONSHOE_IN_SHOES|Bianka Sling",            /* a slingback, named «Sling» */
  "revolve|SHOE_IN_OTHER|Wedgie Boot",                 /* Levi's «Wedgie Boot» is a jean */
  "combatcorner|SHOE_IN_OTHER|Combat Trainers - Shorts | Lines",  /* shorts named «Combat Trainers» */
  /* Data, not a rule: the re-route map (scripts/data/reroute-refiles.json,
     layer B) files Mainland's shoe-care kits into the Zapatos department;
     they leave it when the map is re-run (build-reroute-refiles --map). */
  "mainland|INBOUND_NONSHOE_IN_SHOES|Jason Markk Quick Shoe Clean Kit",
  "mainland|INBOUND_NONSHOE_IN_SHOES|Jason Markk Essential Shoe Cleaning Kit",
  "mainland|INBOUND_NONSHOE_IN_SHOES|Jason Markk Travel Shoe Cleaning Kit",
  "boxlunch|GARMENT_IN_ACCESORIOS|Disney The Hunchback of Notre Dame Characters Patchwork Women's Overalls - BoxLunch Exclusive",
  "boxlunch|GARMENT_IN_ACCESORIOS|Disney The Hunchback of Notre Dame Characters Patchwork Women's Plus Size Overalls - BoxLunch Exclusive",
]);

await check("the product truth: model-line shoes, never their tees, bags or boards", () => {
  const shoe = (name, brand, type) => isShoeItem({ name, brand, type });
  assert.ok(shoe("CLEARANCE Kyle Walker B9M", "Vans", "Accesorios"));
  assert.ok(shoe("Skate Old Skool Y28 kids", "Vans", "Accesorios de skate"));
  assert.ok(shoe("Old Skool BIY kids", "Vans Girls", "Accesorios"));
  assert.ok(shoe("Cambridge kids KS123", "Lakai", "Accesorios"));
  assert.ok(shoe("Nike SB Zoom Janoski OG+ 002", "NIKE", "Accesorios"));
  assert.ok(shoe("Hi-Standard OG - Black/White", "Vans", "Accesorios"));
  assert.ok(shoe("Cushion Court Twist", "Reef", "Accesorios"));
  assert.ok(shoe("Heat Round Toe 3mm Boot - Black", "O'Neill Wet Suits", "Trajes de neopreno"));
  assert.ok(shoe("Ultrarange VR3 - Dress Blues / Multi", "Vans", ""));
  assert.ok(!shoe("Old Skool Check Backpack - Checkerboard - O/S", "Vans", ""));
  assert.ok(!shoe('Blazer 26" Cruiser', "Globe", "Cruisers"));
  assert.ok(!shoe("Nike SB Ishod Cargo Pants - Grey Heather", "Nike SB", ""));
  assert.ok(!shoe("Authentic Stretch Short", "Vans", "Accesorios"));
  assert.ok(!shoe("Men's Touch N Go Liner, True Black", "Burton", "Guantes y botines"));
  assert.ok(!shoe("Jason Markk Essential Shoe Cleaning Kit", "Jason Markk", ""));
  assert.equal(garmentFamily("2% Hijinx Hoody"), "ropa");
  assert.equal(garmentFamily("Be My Frond Skimpy Bottom"), "trajes_bano");
  assert.equal(garmentFamily("Parrot Koozie"), null);
  assert.equal(garmentFamily("Top Sandal - Black"), null);
  assert.equal(sectionKind("Accesorios de Skate"), "accesorios");
  assert.equal(sectionKind("Zapatillas Mujer"), "shoe");
});

await check("the department's shoe door reads the model lines too (Zapatos department)", () => {
  assert.ok(isShoeForDept({ title: "Skate Era 84E", brand: "Vans", type: "Accesorios" }));
  assert.ok(!isShoeForDept({ title: "Nike SB Janoski+ Slip 002", brand: "NIKE", type: "Polos y camisetas" }), "a published shoe-free type still keeps a model out of the department");
});

await check("Parrot: its shoes are in Zapatos at their true count; no Accesorios view holds a shoe", () => {
  const ix = idx("parrot");
  const z = ix.rails.find((r) => r.key === "t-zapatos");
  assert.ok(z && z.total >= 250, "Zapatos " + (z && z.total));
  const s = loadStore("parrot", [ROOT]);
  const vans = (s.rails["b-vans"] || []).map((i) => s.rows[i]);
  const groups = groupsOf(s, vans, [ROOT]);
  assert.ok(!groups.some((g) => /^Accesorios/.test(g.t) && g.rows.some((r) => isShoeItem({ name: r[0], brand: r[1] }))), groups.map((g) => g.t + " " + g.rows.length).join(", "));
  assert.ok(groups.some((g) => g.t === "Zapatos" && g.rows.length >= 80), groups.map((g) => g.t + " " + g.rows.length).join(", "));
});

await check("Parrot: the Hombre pill and filter never collapse the store (was 16 of 138 / 3,835)", async () => {
  const men = idx("parrot").chips.depts.find((d) => d.label === "Hombre");
  assert.ok(men && men.count >= 1000, "Hombre " + (men && men.count));
  const a = await answerNav({ tienda: "parrot", b: "vans", u: "men" }, [ROOT]);
  assert.ok(a.body.count >= 80, "Vans × Hombre " + a.body.count);
});

await check("Val Surf: Zapatos holds its shoes, Accesorios no shoe, the filter's Accesorios no shoe", async () => {
  const z = idx("valsurf").rails.find((r) => r.key === "t-zapatos");
  assert.ok(z && z.total >= 390, "Zapatos " + (z && z.total));
  const a = await answerNav({ tienda: "valsurf" }, [ROOT]);
  const shoeTypes = a.body.facets.t.filter((x) => /^(zapat|sandalias|botas|chimpunes|pantuflas|mocasines|tacones)/i.test(x[1])).reduce((n, x) => n + x[2], 0);
  assert.ok(shoeTypes >= z.total * 0.9, `filter shoe types ${shoeTypes} vs Zapatos ${z.total}`);
  const acc = (a.body.facets.t.find((x) => x[0] === "accesorios") || [0, 0, 0])[2];
  assert.ok(acc < 685, "filter Accesorios " + acc);
});

const { stores, rollup } = await auditAll(ROOT);
await check(`the audit: every Tiendas-carousel store is clean (${rollup.clean}/${rollup.stores}, ${rollup.sections} sections)`, () => {
  const bad = [];
  for (const r of stores) for (const d of r.defects) {
    const items = (d.items || []).filter((n) => !KNOWN.has(`${r.store}|${d.cls}|${n}`));
    if (!CLASSES.includes(d.cls) || !items.length) continue;
    bad.push(`${r.store} ${d.cls} ${d.where}: ${items.slice(0, 3).join(" ; ")}`);
  }
  assert.equal(bad.length, 0, bad.slice(0, 5).join(" | "));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
