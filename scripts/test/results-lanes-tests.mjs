/* ==================================================================
   THE RESULTS PAGE IS A MALL, AND IT SPEAKS SOLES (#416, 2026-10-19).

   Danny on the #417 preview's "dolls": the first screen carried two
   US$ 82.25 Our Generation sets, the header read "precios en USD (tipo
   de cambio no disponible)", and every card led with bold dollars.
   "We cannot lead with an $80 doll." "Don't put me a Cabbage Patch
   Kid for $90 as one of the first options in any area." These checks
   hold his rules:

   - a browse query ("dolls", "muñecas", "vestidos") opens with lanes:
     sales first, then best-sellers (or, without enough reviewed
     products, the well-known brands), then everything;
   - a specific query ("adidas samba", "nike air force 1", "barbie")
     leads with what was asked for; its lanes follow;
   - the first cards of every lane and of a browse query's grid are
     lead-eligible -- a recognized brand or a sale at an accessible
     price, or a marquee name under the premium line -- and nothing
     premium ever sits in them;
   - the endpoint survives SUNAT being down (stored rate, then the
     page's own), and search.html leads every card with soles.

   RUNNING IT
     node scripts/test/results-lanes-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url).pathname;
process.chdir(ROOT);
const core = await import("../../netlify/functions/_search-core.js");
const { handler } = await import("../../netlify/functions/search.js");
const { LEAD_SLOTS, LANE_SIZE } = core;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}
const ctx = core.loadSearch();
const FX = 3.75;
function page(q) {
  const out = core.searchPage(ctx, q, 1, { fx: FX });
  const r = core.runQuery(ctx, q);
  return { out, r, A: r._ann };
}
/* The annotation of a card, found by id. */
function annOf(r, A, card) {
  const p = r.hits.find((h) => h.id === card.id);
  assert.ok(p, `card ${card.id} is not among the results`);
  return A.of(p);
}

const GENERIC = ["dolls", "muñecas", "vestidos", "juguetes", "zapatillas", "maquillaje", "dresses"];
const SPECIFIC = ["adidas samba", "nike air force 1", "barbie", "levi's 501", "airpods", "lego"];

for (const q of GENERIC) {
  await check(`"${q}" is a browse query: lanes lead, sales first`, () => {
    const { out } = page(q);
    assert.equal(out.mode, "generic");
    assert.ok(out.lanes.length >= 2, `${out.lanes.length} lanes`);
    assert.equal(out.lanes[0].key, "ofertas");
    /* Then one row per store (Danny, #443 c.6504037778 §1). */
    assert.ok(/^tienda:|^tiendas:otras$/.test(out.lanes[1].key), out.lanes[1].key);
    for (const l of out.lanes) assert.ok(l.items.length >= 4 && l.items.length <= LANE_SIZE, `${l.key}: ${l.items.length}`);
  });
  await check(`"${q}": the Ofertas lane's lead and the grid's first row are lead-eligible, never premium`, () => {
    const { out, r, A } = page(q);
    const areas = out.lanes.filter((l) => l.key === "ofertas").map((l) => [l.key, l.items.slice(0, LEAD_SLOTS)]).concat([["grid", out.items.slice(0, LEAD_SLOTS)]]);
    for (const [name, cards] of areas) {
      for (const c of cards) {
        const a = annOf(r, A, c);
        assert.ok(!a.premium, `${name}: premium "${c.title}" US$ ${c.usd} in the lead (premium line US$ ${A.bands.premium.toFixed(2)})`);
        assert.ok(!a.obscurePremium, `${name}: obscure premium "${c.title}"`);
      }
      /* Danny's reservation: recognized brands, sale items, the
         accessible price band. Every lead card is one of them. */
      for (const c of cards) {
        const a = annOf(r, A, c);
        assert.ok(a.lead || a.usd <= A.bands.accessible || (a.sale && !a.premium), `${name}: "${c.title}" US$ ${c.usd} is neither a recognized brand, a sale nor accessible (US$ ${A.bands.accessible.toFixed(2)})`);
      }
    }
  });
  await check(`"${q}": no obscure premium product in the first 8 of the Ofertas lane or the grid`, () => {
    const { out, r, A } = page(q);
    for (const cards of out.lanes.filter((l) => l.key === "ofertas").map((l) => l.items).concat([out.items])) {
      for (const c of cards.slice(0, 8)) assert.ok(!annOf(r, A, c).obscurePremium, `"${c.title}" US$ ${c.usd}`);
    }
  });
  /* A STORE ROW (Danny's true-totals ruling, #443 c.6512540192): every
     store with a real total has one, premium stores too; inside it, what
     may lead leads whenever the store has any. */
  await check(`"${q}": a store row opens on a lead-eligible product whenever the store has one`, () => {
    const { out } = page(q);
    const full = core.fullHits(ctx, q), A2 = core.annotateHits(ctx, full), byId = new Map(full.map((p) => [p.id, p]));
    for (const l of out.lanes.filter((x) => x.kind === "store")) {
      const mine = full.filter((p) => p.retailer === l.store);
      const anyLead = mine.some((p) => A2.of(p).lead);
      if (anyLead) assert.ok(A2.of(byId.get(l.items[0].id)).lead, `${l.title}: opens on "${l.items[0].title}" US$ ${l.items[0].usd}`);
    }
  });
}

await check('"dolls": the US$ 82 Our Generation sets and every premium doll stay out of the first screen', () => {
  const { out } = page("dolls");
  /* A store whose every doll is premium keeps its row (true totals, c.6512540192). */
  const full = core.fullHits(ctx, "dolls");
  const hasCheap = (st) => full.some((p) => p.retailer === st && Number(p.price) <= 40);
  const first = out.lanes.filter((l) => l.kind !== "store" || hasCheap(l.store)).flatMap((l) => l.items.slice(0, LEAD_SLOTS)).concat(out.items.slice(0, LEAD_SLOTS));
  const bad = first.filter((c) => c.usd > 60 || /our generation|cabbage patch/i.test(c.brand + " " + c.title));
  assert.deepEqual(bad.map((c) => `${c.title} US$ ${c.usd}`), []);
});

await check('"dolls" lanes are dolls: the aisle keeps out "Former Doll" T-shirts', () => {
  const { out } = page("dolls");
  const off = out.lanes.flatMap((l) => l.items).filter((c) => /t-shirt|tee\b|shirt/i.test(c.title));
  assert.deepEqual(off.map((c) => c.title), []);
});

await check('"dolls": Barbie, a recognized brand, anchors the lead', () => {
  const { out } = page("dolls");
  const lead = out.lanes[0].items.slice(0, LEAD_SLOTS);
  assert.ok(lead.filter((c) => /barbie/i.test(c.brand + " " + c.title)).length >= 3, lead.map((c) => c.title).join(" | "));
});

await check("the sales lane holds sales only, each with its was-price in soles", () => {
  for (const q of GENERIC) {
    const l = page(q).out.lanes.find((x) => x.key === "ofertas");
    for (const c of l.items) {
      assert.ok(c.wasUsd > c.usd, `${q}: "${c.title}" is not on sale`);
      assert.ok(c.wasPen > c.pen && c.pen > 0, `${q}: "${c.title}" has no soles was-price`);
    }
  }
});

await check("a lane never shows the same product twice", () => {
  for (const q of GENERIC) {
    for (const l of page(q).out.lanes) {
      const keys = l.items.map((c) => c.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 30));
      assert.equal(new Set(keys).size, keys.length, `${q} ${l.key}: ${keys.join(" | ")}`);
    }
  }
});

for (const q of SPECIFIC) {
  await check(`"${q}" is specific: what was asked for leads, the lanes follow`, () => {
    const { out } = page(q);
    assert.equal(out.mode, "specific");
    assert.ok(!out.lanes.some((l) => l.key === "marcas"), "a brand-mix lane would only repeat the results");
  });
}
await check('"adidas samba" and "nike air force 1" still lead with the model', () => {
  assert.match(page("adidas samba").out.items[0].title, /samba/i);
  assert.match(page("nike air force 1").out.items[0].title, /air force 1/i);
});

await check("lanes ride on page 1 only, and the grid's pages never overlap", () => {
  const p1 = core.searchPage(ctx, "dolls", 1, { fx: FX }), p2 = core.searchPage(ctx, "dolls", 2, { fx: FX });
  assert.ok(p1.lanes && p1.lanes.length);
  assert.equal(p2.lanes, null);
  const ids = new Set(p1.items.map((c) => c.id));
  assert.equal(p2.items.filter((c) => ids.has(c.id)).length, 0);
});

await check("Hombre / Mujer / Niños: a pill's grid is its true total, and pills only where the audience exists", () => {
  const all = core.searchPage(ctx, "zapatillas", 1, { fx: FX });
  const ninos = all.audiences.find((a) => a.k === "ninos");
  assert.ok(ninos && ninos.n > 100, JSON.stringify(all.audiences));
  /* The grid behind the pill pages through every one, not the few that
     fell inside the ranker's first 2,000. */
  const g = core.searchPage(ctx, "zapatillas", 1, { fx: FX, aud: "ninos", grid: true });
  assert.equal(g.total, ninos.n);
  for (const q of ["vestidos", "lencería"]) {
    const ks = core.searchPage(ctx, q, 1, { fx: FX }).audiences.map((a) => a.k);
    if (q === "vestidos") assert.ok(!ks.includes("hombre"), q + ": " + ks);
    else assert.ok(!ks.includes("ninos"), q + ": " + ks);
  }
  /* A colour, a print or an artist is not a child. */
  for (const title of ["STRETCH LACE UNLINED DEMI BRA | BABY PINK", "PSD Cow Girl Sports Bra", "PSD x SAD BOYZ by Junior H Sports Bra"])
    assert.notEqual(core.audienceOf({ title }), "ninos", title);
  assert.equal(core.audienceOf({ title: "Toddler Little and Big Boys Sneakers" }), "ninos");
});

await check("page 1 with its lanes stays small (< 30KB gzipped)", async () => {
  for (const q of ["dolls", "vestidos", "zapatillas"]) {
    const r = await handler({ httpMethod: "GET", queryStringParameters: { q, page: "1" } }, { fetchImpl: async () => ({ ok: true, json: async () => ({ venta: FX }) }) });
    /* On the wire (gzip): the store rows of every store and the cards'
       photos (Danny's #534 rulings) cost raw JSON, not transfer. */
    const gz = (await import("node:zlib")).gzipSync(r.body).length;
    assert.ok(gz < 30 * 1024, `${q}: ${gz} bytes gzipped (${Buffer.byteLength(r.body)} raw)`);
  }
});

/* ------------------------------------------------------------------
   SOLES, ALWAYS.
   ------------------------------------------------------------------ */
await check("SUNAT down: the endpoint still answers (the page converts), and it is not edge-cached for long", async () => {
  const mod = await import("../../netlify/functions/search.js?down=" + Date.now());
  const r = await mod.handler({ httpMethod: "GET", queryStringParameters: { q: "dolls", page: "1" } }, { fetchImpl: async () => { throw new Error("timeout"); } });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.fx, null);
  assert.match(r.headers["Netlify-CDN-Cache-Control"], /max-age=60\b/);
});

await check("the endpoint waits for SUNAT up to 4s and keeps the last good rate", () => {
  const src = readFileSync(ROOT + "netlify/functions/search.js", "utf8");
  assert.match(src, /setTimeout\(\(\) => ctl\.abort\(\), 4000\)/);
  assert.match(src, /setJSON\(FX_KEY, \{ venta: data\.venta, at: Date\.now\(\) \}\)/);
  assert.match(src, /const stored = await storedRate\(\);/);
});

const page_ = readFileSync(ROOT + "search.html", "utf8");
await check("search.html never says 'precios en USD' and never leads a card with dollars", () => {
  assert.ok(!/tipo de cambio no disponible/.test(page_), "the USD fallback line is back");
  assert.ok(!/aprox\./.test(page_), "soles demoted to 'aprox.' again");
  const start = page_.indexOf("function priceHTML(p){"), end = page_.indexOf("\nfunction offBadge");
  const box = { esc: (s) => String(s), fmtUsd: (n) => "US$ " + Number(n).toFixed(2), fmtPen: (n) => "S/ " + Number(n).toFixed(2) };
  vm.runInNewContext(page_.slice(start, end) + "\nthis.f = priceHTML;", box);
  const h = box.f({ usd: 7.4, pen: 27.75, wasUsd: 9.36, wasPen: 35.1 });
  assert.ok(h.indexOf("S/ 27.75") < h.indexOf("US$ 7.40"), h);
  assert.match(h, /<div class="pen">S\/ 27\.75<span class="was">S\/ 35\.10<\/span><\/div>/);
});

await check("search.html converts an answer without soles with the site's own rate", () => {
  assert.match(page_, /var FX_CACHE_KEY = "aria_fx_rate_v1"/);
  assert.match(page_, /\/\.netlify\/functions\/exchange-rate/);
  assert.match(page_, /var data = await withSoles\(await fetchPage\(query, 1\)\);/);
  assert.match(page_, /var data = await withSoles\(await fetchPage\(STATE\.q, STATE\.page \+ 1\)\);/);
});

await check("search.html: a browse query draws its lanes first, a specific one after its first rows", () => {
  const start = page_.indexOf("function laneHTML("), end = page_.indexOf("/* ---------- search ---------- */");
  const box = { esc: (s) => String(s), cardHTML: (c) => `[${c.id}]` };
  vm.runInNewContext(page_.slice(start, end) + "\nthis.f = answerHTML;", box);
  const lanes = [{ key: "ofertas", title: "En oferta", items: [{ id: "s1" }, { id: "s2" }] }];
  const items = Array.from({ length: 12 }, (_, i) => ({ id: "g" + i }));
  const g = box.f({ mode: "generic", lanes, items });
  assert.ok(g.indexOf("En oferta") < g.indexOf("Todos los resultados") && g.indexOf("Todos los resultados") < g.indexOf("[g0]"), g);
  const s = box.f({ mode: "specific", lanes, items });
  assert.ok(s.indexOf("[g7]") < s.indexOf("En oferta") && s.indexOf("En oferta") < s.indexOf("[g8]"), s);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
