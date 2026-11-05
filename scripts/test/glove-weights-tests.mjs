#!/usr/bin/env node
/* ==================================================================
   COMBAT GLOVES, FLAT BY THE PAIR (#443 c.6648881889, corrected by
   c.6648728121): a boxing glove pair is billed at 1.00 kg, an MMA pair
   at 0.50 kg -- on the card, on the product page and at checkout.

     - the rule: Kill Crew, YOKKAO Muay Thai and Fairtex gloves are 1.00,
       an MMA glove 0.50; hand wraps, focus mitts, gardening gloves and a
       batting glove are not glove pairs; every listed edge case;
     - the store's type and the shared product-type classifier only veto,
       and over every committed catalogue they never change the title's
       answer (so a cart line, which has only the title, agrees);
     - the catalogues carry the stamp, and only glove pairs carry it;
     - the rule and the sweep are idempotent;
     - the card (the app bundle's mirror) and the product page show the
       new weight; checkout's resolver and the order's freight floor
       charge it.

     node scripts/test/glove-weights-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { gloveClass, gloveClassOfTitle, gloveFlatKg, GLOVE_FLAT_KG, GLOVE_BASIS, EDGE_CASES } from "../lib/glove-weights.js";
import { sweep, catalogFiles, recordsOf, loadProductType, REPORT } from "../apply-glove-weights.mjs";
import { resolveItemWeight, resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import { freightFloorUsd } from "../../netlify/functions/_checkout-model.js";
import { estimateWeightDetail } from "../lib/sales-sources.js";
import { CHARGE_PER_KG } from "../../weight-data.js";
import { loadPageWeightSlice } from "./_page-script.mjs";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

const KILL_CREW = "KILL CREW BOXING GLOVES - BLACK";
const YOKKAO = "YOKKAO 'Matrix' Muay Thai Gloves";
const FAIRTEX = "Fairtex BGV1 Muay Thai Gloves";
const MMA = "Fairtex FGV17 MMA Training Gloves - Split Knuckles";
const NOT_GLOVES = ["KILL CREW HAND WRAPS 180\" - BLACKOUT", "Fairtex FMV9 Contoured Focus Mitts", "Garden Gloves for Women, Thorn Proof", "Franklin Sports CFX Pro Adult Batting Glove"];

/* ---------------- the rule ---------------- */
await check("Kill Crew, YOKKAO Muay Thai and Fairtex gloves are boxing pairs at 1.00 kg; an MMA glove is 0.50 kg", () => {
  for (const t of [KILL_CREW, YOKKAO, FAIRTEX]) {
    assert.equal(gloveClassOfTitle(t).cls, "boxing", t);
    assert.equal(gloveFlatKg({ title: t }), 1.0, t);
  }
  assert.equal(gloveClassOfTitle(MMA).cls, "mma");
  assert.equal(gloveFlatKg({ title: MMA }), 0.5);
  assert.deepEqual({ ...GLOVE_FLAT_KG }, { boxing: 1.0, mma: 0.5 });
});

await check("hand wraps, focus mitts, gardening gloves and a batting glove are not glove pairs", () => {
  for (const t of NOT_GLOVES) assert.equal(gloveFlatKg({ title: t }), null, t);
});

await check(`every listed edge case is decided by the rule (${EDGE_CASES.length})`, () => {
  const bad = EDGE_CASES.filter(([t, want]) => gloveClassOfTitle(t).cls !== want).map(([t, want]) => `${t}: want ${want}, got ${gloveClassOfTitle(t).cls}`);
  assert.deepEqual(bad, []);
});

await check("a glove's ounces are not its weight: \"16 oz\" in the title does not move a pair off the flat value", () => {
  assert.equal(gloveFlatKg({ title: "Venum Challenger 3.0 Boxing Gloves 16 oz" }), 1.0);
  assert.equal(resolveItemWeight({ title: "Venum Challenger 3.0 Boxing Gloves 16 oz", priceUsd: 60 }).weightKg, 1.0);
});

const PT = loadProductType(ROOT);
const corpus = [];
for (const f of catalogFiles(ROOT)) {
  const cat = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
  for (const { store, path, rec } of recordsOf(cat)) corpus.push({ f, store, path, rec, title: String(rec.title ?? rec.name ?? "") });
}

await check(`the store's type and the product-type classifier never change the title's answer, over all ${corpus.length.toLocaleString("en")} catalogue records`, () => {
  const div = [];
  for (const x of corpus) {
    const full = gloveClass({ title: x.title, type: x.rec.type, brand: x.rec.brand, retailer: x.rec.retailer || x.store }, { productType: PT }).cls;
    if (full !== gloveClassOfTitle(x.title).cls) div.push(`${x.f} ${x.store}: ${x.title} (${x.rec.type})`);
  }
  assert.deepEqual(div.slice(0, 10), [], `${div.length} divergences`);
});

/* ---------------- the catalogues ---------------- */
await check("every glove pair in the catalogues carries the flat stamp, and nothing else carries it", () => {
  const bad = [];
  let pairs = 0;
  for (const x of corpus) {
    const cls = gloveClassOfTitle(x.title).cls;
    if (cls) {
      pairs++;
      if (x.rec.weightKg !== GLOVE_FLAT_KG[cls] || x.rec.weightEstimated !== true || x.rec.weightBasis !== GLOVE_BASIS || (x.rec.specWeightKg != null && x.rec.specWeightKg !== GLOVE_FLAT_KG[cls])) bad.push(`unstamped ${x.f} ${x.title}: ${x.rec.weightKg}/${x.rec.weightBasis}`);
    } else if (x.rec.weightBasis === GLOVE_BASIS) bad.push(`stamped but not a pair: ${x.f} ${x.title}`);
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} problems`);
  assert.ok(pairs >= 400, "the stamp set shrank: " + pairs);
});

await check("Kill Crew (0.22 -> 1.00), YOKKAO and Fairtex Muay Thai gloves (0.02 or 0.61 -> 1.00), an MMA glove (0.50); Kill Crew hand wraps unstamped", () => {
  const rec = (store, title) => corpus.find((x) => x.store === store && x.title === title && x.f !== "mma-catalog.json");
  assert.equal(rec("killcrew", KILL_CREW).rec.weightKg, 1.0);
  assert.equal(rec("mmawarehouse", YOKKAO).rec.weightKg, 1.0);
  assert.equal(rec("mmawarehouse", FAIRTEX).rec.weightKg, 1.0);
  assert.equal(rec("mmawarehouse", MMA).rec.weightKg, 0.5);
  const wraps = corpus.filter((x) => x.store === "killcrew" && /HAND WRAPS/.test(x.title));
  assert.ok(wraps.length > 0);
  for (const w of wraps) assert.notEqual(w.rec.weightBasis, GLOVE_BASIS, w.title);
});

await check("the rule and the sweep are idempotent: classifying twice agrees, and a second sweep changes nothing", () => {
  for (const t of [KILL_CREW, YOKKAO, FAIRTEX, MMA, ...NOT_GLOVES]) assert.deepEqual(gloveClassOfTitle(t), gloveClassOfTitle(t));
  const r = sweep(ROOT, { write: false });
  assert.equal(r.totals.recordsStampedThisRun, 0, "the committed catalogues are not fully stamped");
  assert.equal(r.shinGuards.doubled.length, 2, "the two proven single-guard records");
  const committed = JSON.parse(readFileSync(join(ROOT, REPORT), "utf8"));
  assert.equal(committed.totals.listings, r.totals.listings, "the committed report is stale");
  assert.equal(committed.totals.stampSetServed, r.totals.stampSetServed, "the committed report's stamp set is stale");
});

await check("shin guards (#443 c.6649706410): only Gorilla Wear's two single-guard records go 0.33 -> 0.66; the 0.50 stamp is not doubled", () => {
  const shin = /\bshin\s*-?\s*(?:guards?|pads?)\b|\bshinguards?\b|\bcanilleras?\b|\bespinilleras?\b/i;
  const doubled = corpus.filter((x) => x.rec.weightBasis === "pairDoubled");
  assert.deepEqual(doubled.map((x) => x.store + ": " + x.title).sort(), ["gorillawear: Jefferson Shin Guards - Black", "gorillawear: Mosby Shin Guards - Black"]);
  for (const x of doubled) { assert.equal(x.rec.weightKg, 0.66); assert.equal(x.rec.weightEstimated, true); }
  /* Nothing on the 0.50 stamp moved, and no other shin guard carries a rule basis. */
  for (const x of corpus.filter((x) => shin.test(x.title) && x.store !== "gorillawear")) assert.ok(!["pairDoubled", GLOVE_BASIS].includes(x.rec.weightBasis), x.title);
  const r = JSON.parse(readFileSync(join(ROOT, REPORT), "utf8"));
  assert.ok(r.shinGuards.unverifiedHalfKgStamp.every((x) => x.kg === 0.5));
  /* The audit's 52: every estimated 0.50 shin-guard record, the served files and their mma-catalog.json copies. */
  assert.equal(r.shinGuards.unverifiedHalfKgRecords, 52);
  for (const x of corpus.filter((x) => shin.test(x.title) && x.rec.specWeightKg === 0.5)) assert.equal(x.rec.weightBasis, undefined, x.title);
});

/* ---------------- the card (the app bundle's copy) ---------------- */
const page = loadPageWeightSlice();
await check("the card's weight line: the bundle's mirror says 1 kg / 500 g per pair, and agrees with the module on every catalogue title", () => {
  /* The mirror is not in the slice's export list, so read it off the estimate it feeds. */
  const d = page.estimateRetailWeightDetail(KILL_CREW, { retailer: "killcrew", priceUsd: 131.35 });
  assert.equal(d.kg, 1.0); assert.equal(d.source, "gloveFlat"); assert.equal(d.needsReview, false);
  assert.equal(page.estimateRetailWeightDetail(MMA, {}).kg, 0.5);
  /* A stamped catalogue figure is the same number, never "por confirmar". */
  const c = page.catalogWeightDetail({ weightKg: 1, weightEstimated: true, weightBasis: GLOVE_BASIS }, KILL_CREW, { retailer: "killcrew" });
  assert.equal(c.kg, 1.0); assert.equal(c.needsReview, false);
  const drift = [];
  const seen = new Set();
  for (const x of corpus) {
    if (seen.has(x.title)) continue; seen.add(x.title);
    if (!/glove|guante|mitt/i.test(x.title)) continue;
    const mod = gloveClassOfTitle(x.title).cls;
    const pg = page.estimateRetailWeightDetail(x.title, {}).source === "gloveFlat" ? page.estimateRetailWeightDetail(x.title, {}).kg : null;
    if ((mod ? GLOVE_FLAT_KG[mod] : null) !== pg) drift.push(`${x.title}: module ${mod}, page ${pg}`);
  }
  assert.deepEqual(drift.slice(0, 10), [], `${drift.length} titles drift`);
});

await check("the card's weight line reads «1 kg el par» for Kill Crew and «500 g el par» for an MMA pair; hand wraps keep their estimate", () => {
  const bundle = readFileSync(join(ROOT, "build", /<script src="\/build\/(app-[0-9a-f]+\.js)"/.exec(readFileSync(join(ROOT, "index.html"), "utf8"))[1]), "utf8");
  const from = bundle.indexOf("/* ============================================================\r\n   COMBAT GLOVES, FLAT BY THE PAIR");
  const to = bundle.indexOf("function contentLabelFor(");
  const wl = bundle.indexOf("function weightLabelHTML(");
  assert.ok(from > 0 && to > 0 && wl > 0);
  const end = bundle.indexOf("\n}\r\n", wl) + 3;
  const sb = { escapeHtml: String, contentLabelFor: () => null, estimateRetailWeightKg: () => 0.6 };
  vm.createContext(sb);
  vm.runInContext(bundle.slice(from, bundle.indexOf("/* ============================================================\r\n   A WEIGHT THE CATALOGUE SUPPLIED")) + "\n" + bundle.slice(wl, end) + "\n;globalThis.__x = { weightLabelHTML, gloveFlatOfTitle };", sb);
  assert.match(sb.__x.weightLabelHTML(KILL_CREW, "c"), />1 kg el par</);
  assert.match(sb.__x.weightLabelHTML(MMA, "c"), />500 g el par</);
  assert.doesNotMatch(sb.__x.weightLabelHTML(NOT_GLOVES[0], "c"), /el par/);
});

/* ---------------- checkout ---------------- */
await check("checkout's resolver weighs the Kill Crew line (as the product page puts it in the cart) at 1.00 kg, an MMA pair at 0.50; the module's chain agrees", () => {
  const line = { title: KILL_CREW, retailer: "killcrew", priceUsd: 131.35, weightKg: 1, weightEstimated: true, qty: 1 };
  const r = resolveItemWeight(line);
  assert.equal(r.weightKg, 1.0); assert.equal(r.source, "gloveFlat"); assert.equal(r.needsReview, false);
  assert.equal(resolveItemWeight({ ...line, title: MMA, retailer: "mmawarehouse" }).weightKg, 0.5);
  /* An old cart line still carrying the pre-stamp figure is re-resolved to the flat value. */
  assert.equal(resolveItemWeight({ ...line, weightKg: 0.22 }).weightKg, 1.0);
  assert.equal(estimateWeightDetail(KILL_CREW).kg, 1.0);
  /* Without the rule the line was the category's 0.20 kg: the before figure the report uses. */
  assert.equal(resolveItemWeight(line, { gloveFlat: false }).weightKg, 0.2);
  for (const t of NOT_GLOVES) assert.notEqual(resolveItemWeight({ title: t, priceUsd: 20 }).source, "gloveFlat", t);
});

await check("checkout freight: two Kill Crew pairs and one MMA pair resolve to 2.50 kg; the order's freight is never under 2.50 x $13", async () => {
  const cart = [
    { title: KILL_CREW, retailer: "killcrew", priceUsd: 131.35, weightKg: 1, weightEstimated: true, qty: 2 },
    { title: MMA, retailer: "mmawarehouse", priceUsd: 70, weightKg: 0.5, weightEstimated: true, qty: 1 },
  ];
  const w = resolveCartWeights(cart);
  assert.equal(w.totalKg, 2.5);
  assert.equal(w.needsReview, false);
  assert.equal(CHARGE_PER_KG, 13);
  assert.equal(freightFloorUsd(0, w.totalKg, CHARGE_PER_KG), 32.5);
  const { handler } = await import("../../netlify/functions/resolve-weight.js");
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ items: cart }) });
  assert.equal(JSON.parse(res.body).totalKg, 2.5);
});

/* ---------------- the product page ---------------- */
await check("the product page's record for Kill Crew carries 1 kg, and the page shows «1 kg» «peso fijo por par» from the resolver", async () => {
  const shards = (await import("../build-pdp-slices.mjs"));
  const P = shards.liftPage(ROOT);
  const key = P.norm(KILL_CREW);
  const shard = JSON.parse(readFileSync(join(ROOT, "assets/pdp/p", P.pdpShard(key) + ".json"), "utf8"));
  const recs = shard[key] || [];
  assert.ok(recs.some((r) => r.retailer === "killcrew" && r.weightKg === 1), "the shard record: " + JSON.stringify(recs.map((r) => [r.retailer, r.weightKg])));

  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const { handler } = await import("../../netlify/functions/resolve-weight.js");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/resolve-weight") {
      let body = ""; for await (const c of req) body += c;
      const r = await handler({ httpMethod: req.method, body });
      res.writeHead(r.statusCode, { "Content-Type": "application/json" }); return res.end(r.body);
    }
    if (u.pathname.startsWith("/.netlify/functions/exchange-rate")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.47}'); }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(404); return res.end("{}"); }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${srv.address().port}/producto.html?producto=${encodeURIComponent(KILL_CREW)}&tienda=killcrew`);
    await p.waitForFunction(() => { const e = document.getElementById("p-weight-kg"); return e && !/calculando/.test(e.textContent); }, null, { timeout: 20000 });
    const txt = (await p.locator("#p-weight-kg").innerText()).replace(/\s+/g, " ").trim();
    assert.match(txt, /^1 kg\b/, txt);
    assert.match(txt, /peso fijo por par/, txt);
  } finally { await browser.close(); srv.close(); }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
