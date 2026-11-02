#!/usr/bin/env node
/* ==================================================================
   ONE QUERY, ONE FORM -- THE VARIATION SWEEP (#443 c.6585818498,
   c.6585840723; Danny: "There are so many variations... a lot.").

   Every variant of the same model, brand or product word lands on the
   same destination -- by rule (_search-core.js canonicalTokens and
   _search-destinations.js routeKey), not by an alias list. The sample is
   drawn from the real index: the models carried by the most stores (one
   product group per model, at most two per brand), the biggest brands,
   and the product words (#608). Each one's variants are GENERATED:
   case, accents, punctuation and spaces, hyphenated, joined, numerals as
   English and Spanish words, singular/plural, the brand moved to the
   end, and a one-edit typo in a word of 5+ letters. Every variant must
   route to the canonical query's destination -- same url, same
   «También puede ser» chips. Any family that still splits is printed.

     node scripts/test/search-variants-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/search-variants-tests.mjs   (also saves the 390px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const core = await import("../../netlify/functions/_search-core.js");
const dst = await import("../../netlify/functions/_search-destinations.js");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
async function route(q) {
  const r = await search.handler({ httpMethod: "GET", queryStringParameters: { q, route: "1" } }, { fetchImpl });
  assert.equal(r.statusCode, 200, q);
  return JSON.parse(r.body);
}
const ctx = core.loadSearch();
const D = dst.destinations(ctx);
const S = ctx.S;

/* ---------- the variant generators (mechanical, any query) ---------- */
const EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const ES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
  "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte"];
const ACCENT = { a: "á", e: "é", i: "í", o: "ó", u: "ú", n: "ñ" };
const words = (q) => S.searchTokens(q);
function variants(q, { brandWords = 0 } = {}) {
  const w = words(q), out = new Map();
  const add = (kind, v) => { if (v && v !== q && !out.has(v)) out.set(v, kind); };
  add("mayúsculas", q.toUpperCase());
  add("título", w.map((x) => x[0].toUpperCase() + x.slice(1)).join(" "));
  const longest = w.reduce((a, b) => (b.length > a.length && /^[a-z]+$/.test(b) ? b : a), "");
  if (longest) { const i = longest.search(/[aeioun]/); if (i >= 0) add("acentos", w.map((x) => (x === longest ? x.slice(0, i) + ACCENT[x[i]] + x.slice(i + 1) : x)).join(" ")); }
  add("puntuación", "  " + w.join("   ") + ".");
  if (w.length >= 2) add("guiones", w.join("-"));
  const model = w.slice(brandWords);
  if (model.length >= 2 && model.length <= 3) add("junto", [...w.slice(0, brandWords), model.join("")].join(" "));
  if (!brandWords && w.length >= 2 && w.length <= 3) add("junto", w.join(""));
  w.forEach((x, i) => {
    const n = Number(x);
    if (/^\d+$/.test(x) && i > 0 && /^[a-z]+$/.test(w[i - 1]) && n >= 1 && n <= 20) {
      add("número en inglés", [...w.slice(0, i), EN[n], ...w.slice(i + 1)].join(" "));
      add("número en español", [...w.slice(0, i), ES[n], ...w.slice(i + 1)].join(" "));
    }
  });
  const li = w.map((x) => /^[a-z]{3,}$/.test(x)).lastIndexOf(true);
  if (li >= brandWords && li >= 0 && w[li].length >= 4) add("plural/singular", [...w.slice(0, li), w[li].endsWith("s") ? w[li].replace(/s$/, "") : w[li] + "s", ...w.slice(li + 1)].join(" "));
  /* (A brand name under three letters reads as a word: "on", "ck".) */
  if (brandWords && w.length > brandWords && w.length <= 4 && w.slice(0, brandWords).join("").length >= 3) add("orden", [...w.slice(brandWords), ...w.slice(0, brandWords)].join(" "));
  const typoAt = w.map((x, i) => [x, i]).filter(([x]) => /^[a-z]{5,}$/.test(x)).sort((a, b) => b[0].length - a[0].length)[0];
  if (typoAt) {
    const [x, i] = typoAt;
    for (let k = Math.floor(x.length / 2); k < x.length - 1; k++) {
      if (x[k] === x[k + 1]) continue;
      add("errata", [...w.slice(0, i), x.slice(0, k) + x[k + 1] + x[k] + x.slice(k + 2), ...w.slice(i + 1)].join(" "));
      break;
    }
  }
  return out;
}

/* ---------- the sample, drawn from the index ---------- */
const STOP = new Set("shoes shoe sneakers sneaker the and with for of in women womens men mens kids unisex adult size big little boys girls black white red blue new grade school casual low high top mid".split(" "));
function topModels(max) {
  const groups = core.productGroups(ctx, ctx.products.filter((p) => p.image));
  const ranked = groups.map((g) => ({ g, stores: new Set(g.map((p) => p.retailer)).size })).sort((a, b) => (b.stores - a.stores) || (b.g.length - a.g.length));
  const out = [], perBrand = new Map();
  for (const { g } of ranked) {
    if (out.length >= max) break;
    const brand = core.recognizedBrand(ctx, g[0]) || g[0].brand;
    const bk = brand && D.brandNames.get(dst.nameKey(brand));
    if (!bk || (perBrand.get(bk) || 0) >= 2) continue;
    const label = D.brands[bk][0], bw = new Set(words(label));
    const counts = new Map();
    for (const p of g) {
      const t = words(p.title).filter((x) => !bw.has(x)), seen = new Set();
      for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= t.length; i++) {
        const ph = t.slice(i, i + n);
        if (ph.some((x) => STOP.has(x)) || !ph.some((x) => /^[a-z]{3,}$/.test(x)) || ph[ph.length - 1].length < 2) continue;
        const k = ph.join(" ");
        if (!seen.has(k)) { seen.add(k); counts.set(k, (counts.get(k) || 0) + 1); }
      }
    }
    const best = [...counts].filter(([, c]) => c >= g.length * 0.8).sort((a, b) => (b[0].split(" ").length - a[0].split(" ").length) || (b[1] - a[1]))[0];
    if (!best) continue;
    const q = (label + " " + best[0]).toLowerCase();
    if (out.some((f) => f.q === q)) continue;
    out.push({ q, kind: "modelo", brandWords: words(label).length });
    perBrand.set(bk, (perBrand.get(bk) || 0) + 1);
  }
  return out;
}
const MODELS = topModels(24);
const BRANDS = Object.entries(D.brands).sort((a, b) => b[1][1] - a[1][1]).slice(0, 10).map(([, [label]]) => ({ q: label.toLowerCase(), kind: "marca", brandWords: 0 }));
const WORDS = Object.entries(dst.PRODUCT_WORDS).filter(([id]) => D.types[dst.PRODUCT_TYPES[id].dept] && D.types[dst.PRODUCT_TYPES[id].dept][dst.PRODUCT_TYPES[id].ver])
  .map(([, list]) => ({ q: list.split("|")[0], kind: "producto", brandWords: 0 }));
/* The acceptance's named families (#443 c.6585818498): each list is one family. */
const NAMED = [
  ["air force 1", "air force one", "airforce1", "Air Force 1", "air-force-1", "AIR FORCE ONE"],
  ["jordan 1", "Jordan One", "jordan1"],
  ["samba og", "Samba OG", "samba-og"],
  ["iphone 15", "iPhone 15", "iphone fifteen", "iphone15"],
  ["ps5", "PS5", "playstation 5", "playstation five", "PlayStation 5"],
  ["new balance 550", "newbalance 550", "nb 550"],
  ["galaxy s24", "galaxy s 24", "Galaxy S24"],
];

const FAMILIES = [...MODELS, ...BRANDS, ...WORDS];
const SPLITS = [];
const sig = (a) => a.destination.href || a.destination.url;
await check(`the sample is drawn from the index: ${MODELS.length} models (most stores), ${BRANDS.length} brands, ${WORDS.length} product words -- 40 or more`, () => {
  assert.ok(MODELS.length >= 15, "models: " + MODELS.length);
  assert.ok(FAMILIES.length >= 40, "families: " + FAMILIES.length);
});
let nVariants = 0;
await check("every generated variant (case, accents, punctuation, hyphens, joined, numerals EN/ES, plural, word order, a one-edit typo) lands on its canonical query's destination", async () => {
  for (const f of FAMILIES) {
    const want = await route(f.q);
    for (const [v, kind] of variants(f.q, f)) {
      nVariants++;
      const got = await route(v);
      if (sig(got) !== sig(want)) SPLITS.push({ family: f.q, kind, variant: v, want: want.destination.url, got: got.destination.url, chipsOnly: got.destination.url === want.destination.url });
    }
  }
  if (SPLITS.length) {
    console.log("\n      family                         variant                          kind                  canonical -> variant");
    for (const s of SPLITS) console.log(`      ${s.family.padEnd(30)} ${JSON.stringify(s.variant).padEnd(32)} ${s.kind.padEnd(21)} ${s.want} -> ${s.chipsOnly ? "(same page, other chips)" : s.got}`);
    console.log("");
  }
  assert.ok(nVariants >= 200, "variants: " + nVariants);
  assert.deepEqual(SPLITS.map((s) => s.family + " / " + s.variant), []);
});
await check("the acceptance families: every spelling lands on the identical destination (url and chips)", async () => {
  const bad = [];
  for (const fam of NAMED) {
    const as = await Promise.all(fam.map(route));
    const urls = new Set(as.map(sig));
    if (urls.size !== 1) bad.push(fam.map((q, i) => q + " -> " + as[i].destination.url).join(" | "));
  }
  assert.deepEqual(bad, []);
});
await check("«air force one» is the Nike page focused on Air Force 1 (its Comparador charts and store rails are served for that focus)", async () => {
  const a = await route("air force one");
  assert.equal(a.destination.kind, "brand");
  assert.equal(a.destination.key, "nike");
  assert.match(a.destination.url, /^marca\.html\?marca=nike&q=air%20force%201$/);
  const page = JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q: "Nike air force 1", page: "1" } }, { fetchImpl })).body);
  assert.ok((page.compares || []).length >= 1, "no Comparador chart for Nike Air Force 1");
  assert.ok((page.lanes || []).some((l) => /^tienda:/.test(l.key)), "no store rail for Nike Air Force 1");
});
await check("the engine reads the canonical form too: «air force one», «airforce1» and «Air Force 1» give the same results and the same charts", () => {
  const one = core.searchPage(ctx, "Air Force 1"), ids = (r) => r.items.map((c) => c.id || c.url || c.title).join("|");
  for (const q of ["air force one", "airforce1", "AIR FORCE ONE", "air-force-1"]) {
    const r = core.searchPage(ctx, q);
    assert.equal(r.total, one.total, q);
    assert.equal(ids(r), ids(one), q);
    assert.deepEqual((r.compares || []).map((c) => c.title), (one.compares || []).map((c) => c.title), q);
    assert.equal(r.q, q, "the page shows what was typed");
  }
});
await check("numerals stay quantities where they are quantities: «1 kg», «2 pack», «one piece», «pack of two» are not model numbers", () => {
  const c = (q) => core.canonicalTokens(ctx, q).join(" ");
  assert.equal(c("bikini one piece"), "bikini one piece");
  assert.equal(c("pack of two"), "pack of two");
  assert.match(c("pesas 1 kg"), /\b1 ?kg\b/);
  assert.equal(c("one piece swimsuit"), "one piece swimsuit");
  assert.equal(c("jordan one"), "jordan 1");
  assert.equal(c("iphone quince"), "iphone 15");
  assert.equal(c("galaxy s twenty four"), c("galaxy s24"));
  assert.equal(c("nike 1st"), "nike 1");
});
await check("short words are not respelled into something else; unknown words never dead-end", async () => {
  for (const q of ["taza", "zapatix", "unicornio"]) assert.equal((await route(q)).destination.kind, "chooser", q);
  const a = await route("samba blorptastic");
  assert.equal(a.destination.kind, "brand", "samba blorptastic: " + a.destination.url);
  assert.equal(a.destination.key, "adidas");
  assert.doesNotMatch(a.destination.url, /blorptastic/);
  for (const q of ["qwrtplk", "blorptastic"]) assert.equal((await route(q)).chooser.reason, "doors", q);
});
await check("no hand-made alias list: the router's rules hold no product or model name", () => {
  const src = readFileSync(join(ROOT, "netlify/functions/_search-destinations.js"), "utf8");
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
  const csrc = readFileSync(join(ROOT, "netlify/functions/_search-core.js"), "utf8");
  const blocks = [code(src.slice(src.lastIndexOf("/*", src.indexOf("one query, one destination")), src.indexOf("---------- the router ----------"))),
    code(csrc.slice(csrc.lastIndexOf("/*", csrc.indexOf("ONE QUERY, ONE FORM")), csrc.indexOf("THE MALL, NOT A WALL")))];
  for (const b of blocks) for (const name of ["air force", "jordan", "samba", "iphone", "playstation", "galaxy", "new balance", "nike", "adidas"]) assert.ok(!b.includes(name), name);
});

/* ---------- one idea, one word: English and Spanish (#443, Danny: "They should all land on alien") ----------
   Every concept of assets/search/concepts.json is one family: its
   canonical word, every English and Spanish word for it, and for each a
   plural, an accent and (5+ letters) a typo. All of them land on ONE
   identical destination, and search reads one canonical word for them. */
const CONCEPTS = JSON.parse(readFileSync(join(ROOT, "assets/search/concepts.json"), "utf8")).concepts;
function conceptForms(c) {
  const out = new Map();
  const add = (kind, v) => { if (v && !out.has(v)) out.set(v, kind); };
  add("canónica", c.canonical);
  for (const w of c.words) {
    add("palabra", w);
    const ws = w.split(" "), last = ws[ws.length - 1];
    if (/^[a-z]{3,}$/.test(last) && !last.endsWith("s")) add("plural", [...ws.slice(0, -1), last + (/[aeiou]$/.test(last) ? "s" : "es")].join(" "));
    const i = w.search(/[aeioun]/);
    if (i >= 0) add("acentos", w.slice(0, i) + ACCENT[w[i]] + w.slice(i + 1));
    add("mayúsculas", w.toUpperCase());
  }
  /* A typo in the family's longest one-word Spanish/English form of 6+ letters. */
  const long = [...c.words].filter((w) => /^[a-z]{6,}$/.test(w)).sort((a, b) => b.length - a.length)[0];
  if (long) { const k = Math.floor(long.length / 2); if (long[k] !== long[k + 1]) add("errata", long.slice(0, k) + long[k + 1] + long[k] + long.slice(k + 2)); }
  return out;
}
let nConceptForms = 0;
const CONCEPT_SPLITS = [];
await check(`every concept (${CONCEPTS.length}) -- each English and Spanish word, plural, accent and typo -- lands on its canonical word's identical destination`, async () => {
  for (const c of CONCEPTS) {
    const want = await route(c.canonical);
    for (const [v, kind] of conceptForms(c)) {
      nConceptForms++;
      const got = await route(v);
      if (sig(got) !== sig(want)) CONCEPT_SPLITS.push(`${c.canonical} / ${JSON.stringify(v)} (${kind}): ${want.destination.url} -> ${got.destination.url}`);
    }
  }
  for (const s of CONCEPT_SPLITS) console.log("      " + s);
  assert.ok(nConceptForms >= 500, "concept forms: " + nConceptForms);
  assert.deepEqual(CONCEPT_SPLITS, []);
});
await check("the concept file: every word belongs to one concept only, and no canonical word is another concept's word", () => {
  const seen = new Map();
  for (const c of CONCEPTS) for (const w of [c.canonical, ...c.words]) {
    const k = words(w).join(" ");
    assert.ok(!seen.has(k) || seen.get(k) === c.canonical, `${w}: ${seen.get(k)} and ${c.canonical}`);
    seen.set(k, c.canonical);
  }
});
const ALIEN = ["alien", "aliens", "Alien", "ALIENS", "extraterrestre", "extraterrestres", "Extraterrestre", "extraterrestrial", "extraterrestrials",
  "extraterestre", "extraterrestial", "marciano", "marcianos", "Marciano", "marcianas", "ovni", "ovnis", "OVNI", "ufo", "ufos", "UFO", "martian", "martians"];
await check("the alien family (Danny, #443): every English and Spanish word lands on the identical page «alien» lands on -- the Alien Workshop brand page", async () => {
  const want = await route("alien");
  assert.equal(want.destination.kind, "brand");
  assert.equal(want.destination.url, "marca.html?marca=alienworkshop");
  const bad = [];
  for (const q of ALIEN) { const a = await route(q); if (sig(a) !== sig(want)) bad.push(q + " -> " + a.destination.url); }
  assert.deepEqual(bad, []);
});
await check("search reads the alien family as one word: «extraterrestre», «marciano», «ovni» and «ufo» give «alien»'s results", () => {
  const ids = (r) => r.items.map((c) => c.id || c.url || c.title).join("|");
  const one = core.searchPage(ctx, "alien");
  assert.ok(one.total >= 100, "alien: " + one.total);
  for (const q of ["extraterrestre", "Extraterrestres", "extraterrestrial", "marciano", "ovni", "UFO"]) {
    const r = core.searchPage(ctx, q);
    assert.equal(r.total, one.total, q);
    assert.equal(ids(r), ids(one), q);
    assert.equal(r.q, q, "the page shows what was typed");
  }
});
await check("a concept word never rewrites a name: «alien workshop», «polo ralph lauren», «guess marciano» keep their words", async () => {
  const c = (q) => core.canonicalTokens(ctx, q).join(" ");
  assert.equal(c("alien workshop"), "alien workshop");
  assert.equal(c("polo ralph lauren"), "polo ralph lauren");
  assert.equal(c("guess marciano"), "guess marciano");
  assert.equal(c("extraterrestre"), "alien");
  assert.equal(c("polo nike"), "t shirt nike");
  assert.equal(c("lentes de sol"), "sunglasses");
  assert.equal(c("lentes de contacto"), "lentes de contacto");
  assert.equal((await route("alien workshop")).destination.url, "marca.html?marca=alienworkshop");
  assert.equal((await route("polo ralph lauren")).destination.url, "marca.html?marca=poloralphlauren");
  const g = (await route("guess marciano")).destination;
  assert.equal(g.kind, "brand"); assert.equal(g.key, "guess");
});
await check("unknown words beside a concept word drop; nothing known is the chooser, never a dead end", async () => {
  const a = (await route("extraterrestre blorptastic")).destination;
  assert.equal(a.url, "marca.html?marca=alienworkshop");
  for (const q of ["qwrtplk", "blorptastic zorbleflunk"]) assert.equal((await route(q)).destination.kind, "chooser", q);
});

/* ---------- every store's and brand's own name, exactly ----------
   (#616 regression: the route key folded words INSIDE names --
   «Arai Helmets» -> "arai helmet", «Island Water Sports» -> a brand
   with q=islands.) A whole name matches before any folding. */
const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
await check("every storefront lands on its own store page by its exact name, lower-case and accent-free (destinations.json, search.html STORE_PAGES / STORE_FULL_NAMES)", () => {
  const PAGE = readFileSync(join(ROOT, "search.html"), "utf8");
  const pages = /var STORE_PAGES = "([^"]*)"/.exec(PAGE)[1].trim().split(/\s+/);
  const full = JSON.parse(/var STORE_FULL_NAMES = (\{[^;]*\});/.exec(PAGE)[1]);
  const asks = [];
  for (const [k, label] of Object.entries(D.stores)) for (const q of [label, label.toLowerCase(), fold(label)]) asks.push([q, k]);
  for (const k of pages) if (D.stores[k]) asks.push([k, k]);
  for (const [n, k] of Object.entries(full)) if (D.stores[k]) asks.push([n, k]);
  const bad = [];
  for (const [q, k] of asks) {
    const d = dst.destinationFor(ctx, q).destination;
    if (d.kind !== "store" || d.key !== k) bad.push(`${JSON.stringify(q)} -> ${d.url} (want tienda=${k})`);
  }
  assert.ok(asks.length >= 300, "asks: " + asks.length);
  assert.deepEqual(bad, []);
});
await check("every brand with a landing lands on its own brand page by its exact name, lower-case and accent-free -- the two standing rulings aside (a product word opens its type page; a category word that is a small brand's one-word name stays the category)", () => {
  const bad = [], ruled = new Set();
  let n = 0;
  for (const [k, [label, count]] of Object.entries(D.brands)) {
    for (const q of new Set([label, label.toLowerCase(), fold(label)])) {
      const cat = dst.categoryOfQuery(D, q);
      if (dst.productTypeOf(D, q) || (cat && !cat.rest.length && count < 300 && words(q).length === 1)) { ruled.add(label); continue; }
      n++;
      const d = dst.destinationFor(ctx, q).destination;
      /* The same name twice in the brand table is one name: either key. A
         store of that name is the store. */
      const ok = (d.kind === "brand" && (d.key === k || dst.nameKey(D.brands[d.key][0]) === dst.nameKey(label))) ||
        (d.kind === "store" && D.storeNames.get(dst.nameKey(q)) === d.key);
      if (!ok) bad.push(`${label} (${k}): ${JSON.stringify(q)} -> ${d.url}`);
    }
  }
  console.log("      (" + n + " brand names routed; standing rulings: " + [...ruled].join(", ") + ")");
  assert.ok(n >= 2000, "brand names: " + n);
  /* Every brand the rulings take is named here, so a rebuild that adds one
     fails until someone decides it. With the real brand labels (#618) the
     rulings take: Chocolate -> Dulces, DJI -> Drones, Foundation -> Belleza,
     Ring -> Joyas, XBOX -> Consolas; Snack still opens its own brand page. */
  const RULED = new Set(["Chocolate", "DJI", "Foundation", "Ring", "Snack", "XBOX"]);
  assert.deepEqual([...ruled].filter((l) => !RULED.has(l)), [], "new rulings: decide them");
  assert.deepEqual(bad, []);
});
await check("a name inside a longer query keeps every word: «arai helmets full face», «island water sports wetsuit»", () => {
  assert.match(dst.routeKey(ctx, D, "arai helmets full face"), /^arai helmets /);
  const a = dst.destinationFor(ctx, "island water sports wetsuit").destination;
  assert.equal(a.kind, "store"); assert.equal(a.key, "islandwatersports");
});

/* ---------- 390px: the header search, two spellings, one page ---------- */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const handlers = {
    search: search.handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
  };
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
    if (fn) {
      if (fn[1] === "exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"venta":3.75,"compra":3.74}'); }
      const h = handlers[fn[1]];
      if (!h) { res.writeHead(404); return res.end("{}"); }
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams) }, { fetchImpl });
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body || "");
    }
    const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(ROOT) || !existsSync(f) || f.endsWith("/")) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  try {
    const landed = [];
    for (const [typed, shot] of [["air force one", "var-af1-a.png"], ["airforce1", "var-af1-b.png"]]) {
      await check(`browser 390px: «${typed}» typed in the header search lands on Nike, focused on Air Force 1 -- Comparador and store rails`, async () => {
        const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
        const page = await c.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${BASE}/departamento.html?dept=toys`, { waitUntil: "load" });
        await page.tap(".hs-pill");
        await page.fill(".hs-in", typed);
        await page.press(".hs-in", "Enter");
        await page.waitForURL(/marca\.html\?marca=nike&q=air%20force%201(&|$)/, { timeout: 60000 });
        await page.waitForSelector("#brandFocus .fc-chart", { timeout: 60000 });
        await page.waitForSelector("#brandFocus .fc-lane", { timeout: 60000 });
        landed.push({ url: page.url().replace(BASE, ""), head: (await page.textContent("#brandFocus .fc-h")).trim() });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
        if (SHOT) { await page.waitForTimeout(600); await page.screenshot({ path: join(SHOT, shot) }); }
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
    await check("browser: both spellings landed on the identical page (url, chips and focus)", () => {
      assert.equal(landed.length, 2);
      assert.equal(landed[0].url, landed[1].url);
      assert.equal(landed[0].head, landed[1].head);
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${FAMILIES.length} families, ${nVariants} variants; ${SPLITS.length} split; ${CONCEPTS.length} concepts, ${nConceptForms} concept forms; ${CONCEPT_SPLITS.length} split`);
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL " + f + "\n");
process.exit(failures.length ? 1 : 0);
