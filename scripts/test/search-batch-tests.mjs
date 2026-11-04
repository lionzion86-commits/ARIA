#!/usr/bin/env node
/* ==================================================================
   THE SEARCH FIX BATCH (#443 c.6621646383) -- one pin per class, on the
   local search function's own answer (the first lane, as the audit
   judged it). The whole audit re-runs with scripts/search-audit-rerun.mjs.

     node scripts/test/search-batch-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const core = await import("../../netlify/functions/_search-core.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
const ask = async (q) => JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q } }, { fetchImpl })).body);
const lead = (a, n = 5) => ((a.lanes && a.lanes[0] && a.lanes[0].items) || []).slice(0, n);
const share = (cards, rx) => cards.filter((c) => rx.test(c.brand + " " + c.title)).length;

await check("class 1, the type layer: «llantas», «neumáticos», «llantas de moto» lead with tires; «llantas aro 15» narrows to 15-inch", async () => {
  for (const q of ["llantas", "neumáticos", "llantas de moto"]) {
    const c = lead(await ask(q));
    assert.ok(c.length >= 4 && share(c, /\btires?\b/i) === c.length, `${q}: ${c.map((x) => x.title).join(" / ")}`);
  }
  const a = await ask("llantas aro 15");
  assert.ok(a.total >= 1 && a.items.every((c) => /\b15\b|-15|R15/i.test(c.title)), a.items.map((c) => c.title).join(" / "));
});
await check("class 1: «termo» is a thermos (never «terno»), «lonchera» a lunch box, «licuadora» a kitchen blender (never Blenders eyewear), «crema para la cara» a face cream (never the colour)", async () => {
  const cases = [["termo", /\b(insulated|thermos|bottle|tumbler|flask|vacuum)\b/i], ["lonchera", /\blunch|bento\b/i],
    ["licuadora", /\bblender\b/i], ["crema para la cara", /\b(moisturi[sz]er|cream|creme)\b/i]];
  for (const [q, rx] of cases) {
    const a = await ask(q), c = lead(a);
    assert.ok(c.length >= 3 && share(c, rx) === c.length, `${q}: ${c.map((x) => x.title).join(" / ")}`);
    assert.equal(a.canonical || null, null, `${q} rewritten to ${a.canonical}`);
  }
  assert.equal(share(lead(await ask("licuadora"), 20), /sunglasses|polarized/i), 0);
  assert.equal(share(lead(await ask("crema para la cara"), 20), /dress|short|bikini|top\b/i), 0);
});
await check("class 1: a type the catalogue does not carry answers honestly -- «caminadora», «televisores», «bicicleta»: no lookalikes (no Funko, no helmets, no dirt-bike parts)", async () => {
  for (const q of ["caminadora", "televisores", "smart tv", "bicicleta", "bicicleta de montaña"]) {
    const a = await ask(q);
    assert.ok(a.state === "none" || share(lead(a, 20), /funko|helmet|seat cover|dirt bike|figure/i) === 0, `${q}: ${a.state} ${lead(a).map((x) => x.title).join(" / ")}`);
  }
});
await check("class 1: a word beside a type that is not its qualifier is not the type («bike shorts», «tv stand» stay the engine's)", () => {
  assert.equal(core.typeWorldOf("bike shorts"), null);
  assert.equal(core.typeWorldOf("tv stand"), null);
  assert.equal(core.typeWorldOf("llanta de bicicleta"), null);
  assert.equal(core.typeWorldOf("ropa para hombre").type.id, "ropa");
});
await check("class 2, one form: «sambas» -> samba, «gazelles» -> gazelle, «superstars» -> superstar, «airmax» -> air max (Nike, not Hairmax), «af1» -> air force 1, «galaxys24» -> galaxy s24, «carters» -> Carter's (never carteras)", async () => {
  const ctx = core.loadSearch({ labels: search.LABELS });
  const want = { sambas: "samba", gazelles: "gazelle", superstars: "superstar", airmax: "air max", af1: "air force 1", "nike af1": "nike air force 1", galaxys24: "galaxy s24", carters: "carter" };
  for (const [q, w] of Object.entries(want)) assert.equal(core.canonicalQuery(ctx, q), w, q);
  for (const q of ["jeans", "boots", "leggings", "shorts", "carteras", "zapatillas"]) assert.ok(!/^(jean|boot|legging|short)$/.test(core.canonicalQuery(ctx, q)), q);
  assert.equal(share(lead(await ask("airmax")), /hairmax/i), 0);
  assert.ok(share(lead(await ask("airmax")), /\bnike\b/i) >= 4);
  assert.ok(share(lead(await ask("carters")), /carter/i) >= 4);
});
await check("class 3, the core product leads: every drone spelling (dron, drons, drone, drones) opens on DJI", async () => {
  for (const q of ["dron", "drons", "drone", "drones"]) {
    const a = await ask(q);
    const first = a.items.slice(0, 3);
    assert.ok(first.every((c) => /^dji$/i.test(c.brand)), `${q}: ${first.map((c) => c.brand + " " + c.title).join(" / ")}`);
    assert.equal(share(lead(a, 20), /murder|tee|t-shirt|hoodie/i), 0, q);
  }
});
await check("class 4, a store one edit away is the store: costcco, ultaa, dickssporting; bare «ulta» answers Ulta", async () => {
  for (const [q, key] of [["costcco", "costco"], ["ultaa", "ulta"], ["dickssporting", "dicks"], ["ulta", "ulta"], ["zumies", "zumiez"]]) {
    const a = await ask(q);
    assert.equal(a.store, key, q);
    assert.ok(lead(a).length >= 4 && lead(a).every((c) => c.store === key), `${q}: first lane not ${key}'s`);
  }
});
await check("class 5, no lying store key: spacing never decides (best-buy, foot-locker, dicks sporting goods), a keyed store's first lane is its own, a store with nothing in the catalogue is not keyed", async () => {
  for (const [q, key] of [["foot-locker", "footlocker"], ["foot locker", "footlocker"], ["dicks sporting goods", "dicks"], ["victoria secret sales", "victoriassecret"]]) {
    const a = await ask(q);
    assert.equal(a.store, key, q);
    assert.ok(lead(a).every((c) => c.store === key), `${q}: ${lead(a).map((c) => c.store).join(",")}`);
  }
  for (const q of ["best-buy", "bestbuy", "best buy", "nordstromm", "autozonee"]) assert.equal((await ask(q)).store, null, q);
});
await check("named regression: «victoria secret sales» keys Victoria's Secret and answers its markdowns -- not the same set as «victoria secret»", async () => {
  const a = await ask("victoria secret sales"), b = await ask("victoria secret");
  assert.equal(a.store, "victoriassecret");
  assert.ok(a.items.every((c) => Number(c.wasUsd) > Number(c.usd)), "a full-price item in the sale answer");
  assert.notEqual(a.total, b.total);
});
await check("class 6, did-you-mean guardrails: no «pants» for llantas, «panties» for patines, «farm» for faro, «sale» for sales", async () => {
  for (const q of ["llantas aro 15", "llanta", "patines linea", "faro", "victoria secret sales", "dronn"]) {
    const d = (await ask(q)).didYouMean;
    assert.ok(!d || !/\b(pants|panties|farm|santa|iron|sale)\b/.test(d), `${q}: ${d}`);
  }
});
await check("class 7, qualifiers kept: «ropa para hombre», «ropa de mujer», «ropa de bebé» each answer that audience's clothes", async () => {
  for (const [q, rx] of [["ropa para hombre", /\b(men'?s|man|boys?)\b/i], ["ropa de mujer", /\b(women'?s|ladies|woman|girls?)\b|^(?!.*\bmen'?s\b)/i], ["ropa de bebe", /\b(baby|infant|newborn|toddler)\b/i]]) {
    const c = lead(await ask(q));
    assert.ok(c.length >= 4 && share(c, rx) >= 4, `${q}: ${c.map((x) => x.title).join(" / ")}`);
  }
  const m = new Set((await ask("ropa para hombre")).items.map((c) => c.id)), w = new Set((await ask("ropa de mujer")).items.map((c) => c.id));
  assert.ok([...m].filter((x) => w.has(x)).length < 10, "class 9: the men's and women's answers are the same set");
});
await check("class 8, Ofertas keeps the type: «blusa» Ofertas are blouses, «blazer» Ofertas are blazers", async () => {
  for (const [q, rx] of [["blusa", /blouse/i], ["blazer", /blazer/i]]) {
    const a = await ask(q);
    assert.equal(a.lanes[0].key, "ofertas");
    assert.equal(share(lead(a), rx), 5, `${q}: ${lead(a).map((c) => c.title).join(" / ")}`);
  }
});
await check("standing rule: «lencería» leads with Victoria's Secret, and no sports bra in its Ofertas", async () => {
  const a = await ask("lenceria");
  assert.ok(lead(a).every((c) => c.store === "victoriassecret"), lead(a).map((c) => c.store).join(","));
  assert.equal(share(a.lanes[0].items, /sports? bra/i), 0);
  assert.equal(a.items[0].store, "victoriassecret");
});
await check("class 10, «repuestos» is auto and moto parts: no perfume refill «(Repuesto)», moto narrows to moto parts", async () => {
  for (const q of ["repuestos", "repuestos de carro", "repuestos auto", "repuestos moto"]) {
    const a = await ask(q);
    assert.equal(share(a.items, /eau de|perfume|parfum|toilette/i), 0, q);
    assert.ok(a.total >= 50, q);
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL " + f + "\n");
process.exit(failures.length ? 1 : 0);
