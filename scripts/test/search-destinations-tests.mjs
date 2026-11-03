#!/usr/bin/env node
/* ==================================================================
   THE SEARCH DESTINATION GUARDRAIL (#443 c.6569512697, c.6569515583,
   c.6569529913 -- Danny, "100%").

   Every search lands on a STORE page, a BRAND page or a CATEGORY page --
   or, when the matcher cannot decide, on search.html's CHOOSER (at most
   three rails, each a door to one of those surfaces). Never a pooled
   grid, never a results wall. A resolved landing carries the other close
   matches as «También puede ser…» chips.

     node scripts/test/search-destinations-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/search-destinations-tests.mjs   (also saves the 390px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const search = await import("../../netlify/functions/search.js");
const dept = await import("../../netlify/functions/_department-core.js");
const dst = await import("../../netlify/functions/_search-destinations.js");
const PAGE = readFileSync(join(ROOT, "search.html"), "utf8");
const DEST = JSON.parse(readFileSync(join(ROOT, dst.DEST_FILE), "utf8"));

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
const param = (url, k) => new URLSearchParams(url.split("?")[1] || "").get(k);

/* The battery: query -> the kind it must land on. */
const BATTERY = [
  ["sephora", "store"], ["sepho", "store"], ["Victoria's Secret", "store"], ["walmart", "store"], ["foot locker", "store"],
  ["kohls", "store"], ["calzed", "store"], ["tienda sephora", "store"], ["gap hoodie", "store"], ["crocs", "store"],
  ["new balance", "store"], ["sephorra", "store"],
  ["nike", "brand"], ["adidas", "brand"], ["converse", "brand"], ["skechers", "brand"], ["under armour", "brand"],
  ["disney", "brand"], ["adiddas", "brand"], ["nikee", "brand"],
  ["nike air force 1", "brand"], ["air force 1", "brand"], ["converse all star", "brand"], ["adidas samba", "brand"],
  ["samba", "brand"], ["airpods", "brand"], ["zapatillas nike", "brand"], ["levis jeans", "brand"], ["jordan 1", "brand"],
  ["vestidos", "category"], ["dresses", "category"], ["zapatillas", "category"], ["sneakers", "category"], ["laptops", "category"],
  ["juguetes", "category"], ["toys", "category"], ["pesas", "category"], ["dumbbells", "category"], ["perfumes", "category"],
  ["perfume mujer", "category"], ["lentes de sol", "category"], ["sunglasses", "category"], ["polos hombre", "category"],
  ["cartera cuero", "category"], ["zapatillas mujer", "category"], ["lego", "brand"], ["barbie", "brand"],
  ["maybelline", "brand"], ["hot wheels", "brand"], ["play doh", "brand"], ["nerf", "brand"], ["fisher price", "brand"],
  ["pokemon", "brand"], ["maison kitsune", "brand"], ["loreal", "brand"], ["alaia", "brand"], ["disney", "brand"], ["marvel", "brand"], ["juguetez", "category"], ["lapto", "category"], ["vestido rojo", "category"], ["libros", "category"],
  ["pesca submarina", "category"], ["boxeo", "category"],
  ["iphone 15 case", "chooser"], ["unicornio", "chooser"], ["taza", "chooser"], ["zapatix", "chooser"],
  ["blorptastic", "chooser"], ["qwrtplk", "chooser"], ["a", "chooser"],
];
/* Verified to name no store, no brand and no category (the acceptance's miss-words). */
const MISS_WORDS = ["blorptastic", "qwrtplk"];

const ANSWERS = new Map();
await check(`the battery (${BATTERY.length} queries): every one lands on a store, a brand, a category or the chooser -- the kind it should`, async () => {
  const bad = [];
  for (const [q, want] of BATTERY) {
    const a = await route(q);
    ANSWERS.set(q, a);
    const d = a.destination;
    if (!["store", "brand", "category", "chooser"].includes(d.kind)) bad.push(`${q}: ${d.kind}`);
    else if (d.kind !== want) bad.push(`${q}: ${d.kind}:${d.key} (want ${want})`);
  }
  assert.deepEqual(bad, []);
  assert.ok(BATTERY.length >= 40);
});

await check("every landing is a built surface: a storefront, a brand head, a department (with a type lens it has); the url says only that", async () => {
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    if (d.kind === "chooser") continue;
    assert.match(d.url, dst.SURFACE_RX, q);
    assert.ok(d.href.startsWith(d.url), q);
    if (d.kind === "store") { assert.ok(DEST.stores[d.key], q); assert.ok(JSON.parse(readFileSync(join(ROOT, "assets/tienda", d.key, "index.json"), "utf8")).count > 0, q); }
    if (d.kind === "brand") assert.ok(existsSync(join(ROOT, "assets/sections/marca", d.key + ".json")), q);
    if (d.kind === "category") {
      assert.ok(DEST.depts[d.key], q);
      const t = param(d.url, "t");
      if (t) assert.ok(DEST.depts[d.key][1] && DEST.depts[d.key][1][t], `${q}: ${d.key} has no lens ${t}`);
    }
  }
});

await check("a category landing's narrowing (t, a, q) still finds products on that department page", async () => {
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    if (d.kind !== "category") continue;
    const qs = { dept: d.key };
    for (const k of ["t", "a", "q"]) if (param(d.url, k)) qs[k] = param(d.url, k);
    const r = dept.answer(qs);
    if (r.status === 404 && /ropa_interior/.test(d.key)) continue; // departamento.html sends these to ropa-interior.html
    assert.equal(r.status, 200, q);
    assert.ok(r.body.count > 0, `${q}: ${d.url} shows nothing`);
  }
});

await check("a brand + model lands on the brand page focused on the model, and the focus finds it at the stores (Comparador / rails)", async () => {
  for (const q of ["nike air force 1", "air force 1", "converse all star", "adidas samba"]) {
    const d = ANSWERS.get(q).destination;
    assert.ok(d.q, `${q}: no model on ${d.url}`);
    const label = DEST.brands[d.key][0];
    const r = JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q: label + " " + d.q, page: "1" } }, { fetchImpl })).body);
    assert.ok((r.lanes || []).some((l) => l.store), `${q}: the focus has no store rail`);
  }
  assert.equal(ANSWERS.get("air force 1").destination.key, "nike");
  assert.equal(ANSWERS.get("converse all star").destination.url, "marca.html?marca=converse&q=all%20star");
});

await check("«También puede ser…» rides on a resolved landing: other close matches, each a door to a surface, on the url as &tp=", async () => {
  let carried = 0;
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    if (d.kind === "chooser") { assert.deepEqual(a.alternatives, [], q); continue; }
    assert.ok(a.alternatives.length <= dst.ALT_MAX, q);
    for (const x of a.alternatives) {
      assert.match(x.url, dst.SURFACE_RX, `${q}: ${x.url}`);
      /* A type page's chips may name its own department (another page). */
      if (d.type) assert.notEqual(x.url, d.url, `${q}: the landing offered as its own alternative`);
      else assert.ok(!(x.kind === d.kind && x.key === d.key), `${q}: the landing offered as its own alternative`);
    }
    if (a.alternatives.length) {
      carried++;
      const tp = JSON.parse(param(d.href, "tp"));
      assert.deepEqual(tp, a.alternatives.map((x) => [x.kind, x.label, x.url]), q);
    }
  }
  assert.ok(carried >= 30, `only ${carried} landings carry alternatives`);
  const crocs = ANSWERS.get("crocs");
  assert.ok(crocs.alternatives.some((x) => x.kind === "brand" && x.key === "crocs"), "Crocs the store offers Crocs the brand");
});

await check("the chooser: at most three rails -- store, brand, category, one each -- each with a door to its own page; a miss gets entry doors", async () => {
  for (const [q, a] of ANSWERS) {
    if (a.destination.kind !== "chooser") continue;
    const rails = a.chooser.rails;
    assert.ok(rails.length >= 1 && rails.length <= 3, `${q}: ${rails.length} rails`);
    if (rails[0].kind === "entry") {
      assert.deepEqual(rails.map((r) => r.url), ["ofertas.html", "tiendas.html", "categorias.html"], q);
      continue;
    }
    const kinds = rails.map((r) => r.kind);
    assert.equal(new Set(kinds).size, kinds.length, `${q}: two rails of one kind`);
    for (const r of rails) {
      assert.ok(["store", "brand", "category"].includes(r.kind), q);
      assert.match(r.url, dst.SURFACE_RX, `${q}: ${r.url}`);
      assert.match(r.door, /^Ver todo en /, q);
      assert.ok(r.items.length > 0 && r.items.length <= dst.RAIL_ITEMS, `${q}: ${r.kind} rail has ${r.items.length} cards`);
    }
  }
});

await check(`the miss-words (${MISS_WORDS.join(", ")}): no store, no brand, no category, nothing found -- the chooser's entry doors`, async () => {
  for (const w of MISS_WORDS) {
    const a = ANSWERS.get(w) || await route(w);
    assert.equal(a.destination.kind, "chooser", w);
    assert.equal(a.chooser.reason, "doors", w);
    const D = dst.destinations({ _dest: null, ...{} }, undefined);
    assert.equal(dst.storeOf(D, w), null, w);
    assert.ok(!D.brandNames.has(dst.nameKey(w)), w);
    assert.equal(dst.categoryOfQuery(D, w), null, w);
    const r = JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q: w, page: "1" } }, { fetchImpl })).body);
    assert.equal(r.state, "none", `${w}: the engine finds ${r.total}`);
  }
});

/* ------------------------- THE PRODUCT WORD -> ITS TYPE PAGE -------------------------
   (#443 c.6579541628, Danny's final ruling; c.6579064382; c.6579505156.)
   A word that names a product type opens THAT type's page -- the full
   type listing departamento.html draws for one rail (?ver=<rail key>,
   the "Celulares 87" page) -- never the department home, never a
   generic Ofertas rail; and its «También puede ser…» chips are sibling
   types and the department, never a brand or store guess. */
const CEL = ["electronics", "pasillo:tech_celulares"], PCS = ["electronics", "pasillo:tech_computadoras"], CON = ["electronics", "consolas"];
const AUD = ["electronics", "pasillo:tech_audifonos"], CAM = ["electronics", "pasillo:tech_camaras"], MON = ["electronics", "pasillo:tech_accesorios", "monitor"];
const CHAMPU = ["cabello", "tipo:champú y acondicionador"], KERA = ["cabello", "tipo:keratina y alisados"], MASK = ["cabello", "tipo:mascarillas"];
const PESAS = ["sporting_goods", "tipo:pesas-y-cinturones"], VAJ = ["home_goods", "casa:casa_mesa"], LAB = ["beauty", "tipo:labios"];
const POL = ["men", "tipo:chompas-y-polerones"], SHO = ["clothing", "tipo:shorts"];
const WATCH = [
  ["celular", CEL], ["celulares", CEL], ["teléfono", CEL], ["telefono", CEL], ["fono", CEL], ["cell", CEL], ["cell phone", CEL], ["smartphone", CEL],
  ["un celular barato", CEL],
  ["consola", CON], ["consolas", CON], ["playstation", CON], ["xbox", CON],
  ["laptop", PCS], ["laptops", PCS], ["computadora", PCS], ["notebook", PCS],
  ["audífonos", AUD], ["audifonos", AUD], ["headphones", AUD], ["cámara", CAM], ["monitor", MON],
  ["champú", CHAMPU], ["shampoo", CHAMPU], ["keratina", KERA], ["alisado", KERA], ["plancha", KERA], ["mascarilla", MASK],
  ["pesas", PESAS], ["mancuernas", PESAS], ["dumbbells", PESAS], ["vajilla", VAJ], ["labial", LAB],
  ["polera", POL], ["poleras", POL], ["hoodie", POL], ["hudi", POL], ["hodie", POL], ["sudadera con capucha", POL], ["poleron", POL],
  ["sweatshirt", POL], ["swetshert", POL],
  ["short", SHO], ["shorts", SHO], ["chort", SHO], ["shor", SHO],
];
/* The type page as departamento.html draws it: the (narrowed) head, the
   rail whose key is ver=, and that rail's first page from the endpoint. */
function typePage(url) {
  const qs = { dept: param(url, "dept") };
  if (param(url, "q")) qs.q = param(url, "q");
  const head = dept.answer(qs);
  if (head.status !== 200) return { head: null };
  const rail = head.body.rails.find((r) => r.k === param(url, "ver"));
  if (!rail) return { head: head.body, rail: null };
  const page = dept.answer({ ...qs, rail: String(rail.i), page: "0" });
  return { head: head.body, rail, page: page.status === 200 ? page.body : null };
}
const WATCH_ANSWERS = new Map();
await check(`the watch set (${WATCH.length} product words): each lands on its TYPE page -- a real rail with products, never the department home, never an Ofertas rail`, async () => {
  const bad = [];
  for (const [q, [dk, ver, nq]] of WATCH) {
    const a = await route(q);
    WATCH_ANSWERS.set(q, a);
    const d = a.destination;
    const got = `${d.kind}:${d.key} ver=${param(d.url || "", "ver")} q=${param(d.url || "", "q") || ""}`;
    if (d.kind !== "category" || d.key !== dk || param(d.url, "ver") !== ver || (param(d.url, "q") || "") !== (nq || "")) { bad.push(`${q}: ${got} (want ${dk} ${ver} ${nq || ""})`); continue; }
    assert.match(d.url, dst.SURFACE_RX, q);
    assert.ok(DEST.types[dk] && DEST.types[dk][ver] && DEST.types[dk][ver][1] > 0, `${q}: ${dk} ${ver} is not a listed type`);
    const { rail, page } = typePage(d.url);
    if (!rail) { bad.push(`${q}: ${d.url} -- the page has no rail ${ver}`); continue; }
    if (/^Ofertas\b/.test(rail.title) || rail.k === "ofertas") bad.push(`${q}: lands on an Ofertas rail`);
    if (!page || !(page.count > 0) || !page.cards.length) bad.push(`${q}: ${d.url} -- the type page shows nothing`);
    for (const x of a.alternatives) if (x.kind !== "category") bad.push(`${q}: a ${x.kind} chip (${x.label}) against the product word`);
  }
  assert.deepEqual(bad, []);
  assert.ok(WATCH.length >= 26);
});

await check("every product-word mapping names a type that exists with products, and every type page's chips are real type pages or the department", () => {
  for (const [id, t] of Object.entries(dst.PRODUCT_TYPES)) {
    assert.ok(DEST.types[t.dept] && DEST.types[t.dept][t.ver], `${id}: ${t.dept} has no type ${t.ver}`);
    const { rail, page } = typePage(dst.deptUrl(t.dept, { ver: t.ver, q: t.q || "" }));
    assert.ok(rail && page && page.count > 0, `${id}: ${t.dept} ${t.ver} shows nothing`);
    for (const [sd, sv, sq] of t.sib) {
      assert.ok(DEST.types[sd] && DEST.types[sd][sv], `${id}: sibling ${sd} ${sv} is not a type`);
      const s = typePage(dst.deptUrl(sd, { ver: sv, q: sq || "" }));
      assert.ok(s.rail && s.page && s.page.count > 0, `${id}: sibling ${sd} ${sv} shows nothing`);
    }
    assert.ok(dst.PRODUCT_WORDS[id], `${id}: no words`);
  }
  for (const [q, a] of WATCH_ANSWERS) {
    for (const x of a.alternatives) {
      const ver = param(x.url, "ver");
      assert.ok(ver, `${q}: chip ${x.url} has no ver`);
      if (ver !== dst.VER_TYPES) assert.ok(DEST.types[x.key] && DEST.types[x.key][ver], `${q}: chip ${x.url}`);
    }
  }
});

await check("no search lands on a department page led by its generic Ofertas rail: every category landing, chip and chooser door says what leads (ver=)", () => {
  const all = [...ANSWERS.values(), ...WATCH_ANSWERS.values()];
  let n = 0;
  for (const a of all) {
    const urls = [a.destination, ...a.alternatives, ...((a.chooser && a.chooser.rails) || [])].filter((x) => x && x.kind === "category").map((x) => x.url);
    for (const u of urls) {
      n++;
      const ver = param(u, "ver");
      assert.ok(ver, `${a.q}: ${u} carries no ver`);
      assert.notEqual(ver, "ofertas", `${a.q}: ${u}`);
      if (ver !== dst.VER_TYPES) assert.ok(DEST.types[param(u, "dept")] && DEST.types[param(u, "dept")][ver], `${a.q}: ${u} names no type`);
    }
  }
  assert.ok(n > 40, `only ${n} category urls`);
  /* The page side: ?ver= never lifts or draws the Ofertas rail. */
  const DP = readFileSync(join(ROOT, "departamento.html"), "utf8");
  assert.match(DP, /function liftSales\(first\)\{\n    liftedRi = -1;\n    if \(VER\)\{/);
  assert.match(DP, /if \(VER && isOfertasRail\(r\)/);
});

await check("an ambiguous or unknown word still gets the chooser; brand + model still the brand («celular samsung», «xbox series x»)", async () => {
  for (const w of MISS_WORDS) assert.equal((ANSWERS.get(w) || await route(w)).destination.kind, "chooser", w);
  assert.equal((await route("celular samsung")).destination.kind, "brand");
  assert.equal((await route("xbox series x")).destination.key, "xbox");
  assert.equal((await route("iphone 15 case")).destination.kind, "chooser");
});

await check("Celulares leads with the phones people ask for by name (iPhone, Galaxy, Pixel, Motorola) ahead of the no-name budget Androids", () => {
  const { page, rail } = typePage(dst.deptUrl("electronics", { ver: "pasillo:tech_celulares" }));
  /* The whole listing, page by page, as the type page's «Mostrar más» reads it. */
  const all = page.cards.slice();
  for (let n = 1; n < page.pages; n++) all.push(...dept.answer({ dept: "electronics", rail: String(rail.i), page: String(n) }).body.cards);
  assert.equal(all.length, rail.count);
  const ranks = all.map((c) => dept.phoneKnownRank({ title: c.t, brand: c.b }));
  assert.ok(/iphone/i.test(page.cards[0].t), "the first card is not an iPhone: " + page.cards[0].t);
  assert.deepEqual(ranks.slice(0, 4), [0, 1, 2, 3], "the first four: iPhone, Galaxy, Pixel, Motorola -- " + page.cards.slice(0, 4).map((c) => c.t.slice(0, 24)).join(" | "));
  const firstNoName = ranks.indexOf(-1);
  assert.ok(firstNoName > 0 && ranks.slice(firstNoName).every((r) => r === -1), "a no-name phone before a known brand");
  for (const c of page.cards.slice(0, 8)) assert.doesNotMatch(c.t, /FYTPOV|MIRO|NANNEE|Oukitel/i, c.t);
});

/* THE GRID IS BANNED AS A LANDING FOR ANY STORE OR BRAND SEARCH (#443
   c.6585655315, Danny: "one pattern always"). Every storefront's name
   lands on that storefront; every brand with 20+ products, typed by its
   name, lands on a brand page or a storefront -- never the chooser, never
   a grid. A brand page it lands on is named after the brand typed. */
await check("no store or brand search lands on the grid: every storefront's name opens it, every 20+ brand's name opens a brand page", async () => {
  const bad = [];
  for (const [k, label] of Object.entries(DEST.stores)) {
    const d = (await route(label)).destination;
    if (d.kind !== "store" || d.key !== k) bad.push(`store «${label}»: ${d.kind}:${d.key || ""}`);
  }
  for (const [k, [label, count]] of Object.entries(DEST.brands)) {
    if (count < 20) continue;
    const d = (await route(label)).destination;
    if (d.kind === "chooser" || !["store", "brand", "category"].includes(d.kind)) bad.push(`brand «${label}»: ${d.kind}`);
    else if (d.kind === "brand" && d.label !== DEST.brands[d.key][0]) bad.push(`brand «${label}»: page «${d.label}»`);
  }
  assert.deepEqual(bad.slice(0, 30), [], `${bad.length} store/brand names land on the grid`);
});

await check("the surfaces list is current (node scripts/build-search-destinations.mjs) and ships with the search function", () => {
  execFileSync(process.execPath, [join(ROOT, "scripts/build-search-destinations.mjs"), "--check"], { stdio: "pipe" });
  assert.match(readFileSync(join(ROOT, "netlify.toml"), "utf8"), /\[functions\."search"\]\s*\n\s*included_files = \[[^\]]*"assets\/search\/destinations\.json"/);
});

await check("search.html asks the router before anything else and draws no results wall: ?resultados=1 is the only way to the old answer, and no page links to it", () => {
  const fn = PAGE.slice(PAGE.indexOf("async function doSearch()"), PAGE.indexOf("function renderAnswer("));
  const routeAt = fn.indexOf("routeFor(query"), fetchAt = fn.indexOf("fetchPage(query, 1)");
  assert.ok(routeAt > 0 && fetchAt > routeAt, "doSearch does not route first");
  assert.match(fn, /if \(!keepPlainSearch\(\)\)\{[\s\S]*?return;\n  \}/, "the routed branch does not end the search");
  assert.match(fn, /location\.replace\(d\.href \|\| d\.url\)/);
  assert.match(fn, /renderChooser\(query, route\)/);
  for (const f of readdirSync(ROOT).filter((n) => n.endsWith(".html") && n !== "search.html")) {
    assert.ok(!/resultados=1/.test(readFileSync(join(ROOT, f), "utf8")), `${f} links to the plain results`);
  }
  for (const f of ["assets/js/tambien.js", "assets/js/marca-focus.js"]) assert.ok(!/resultados=1/.test(readFileSync(join(ROOT, f), "utf8")), f);
  for (const f of ["tienda.html", "marca.html", "departamento.html"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /<script src="\/assets\/js\/tambien\.js" defer><\/script>/, f);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(PAGE + readFileSync(join(ROOT, "assets/js/tambien.js"), "utf8") + readFileSync(join(ROOT, "assets/js/marca-focus.js"), "utf8")), "an emoji");
});

/* ------------------------- in the browser ------------------------- */
/* STANDING RULE (Danny 2026-11-02): every comparison chart has pictures,
   always -- the chart's photo and each store row's own photo. */
await check("standing rule: every comparison chart the search serves has the product photo and a photo on every store row", async () => {
  let seen = 0;
  for (const q of ["adidas samba", "nike air force 1", "converse all star", "nike dunk low", "crocs classic clog", "new balance 550", "airpods", "stanley quencher"]) {
    const d = JSON.parse((await search.handler({ httpMethod: "GET", queryStringParameters: { q, page: "1" } }, { fetchImpl })).body);
    for (const c of (d.compares || (d.compare ? [d.compare] : []))) {
      seen++;
      assert.ok(c.image, `${q}: «${c.title}» chart without a photo`);
      for (const s of c.stores) assert.ok(s.image, `${q}: «${c.title}» row ${s.store} without a photo`);
    }
  }
  assert.ok(seen > 0, "no comparison charts served at all");
});
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
  const phone = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { c, page, errors };
  };
  const SHOT = process.env.SHOT_DIR || "";
  try {
    await check(`browser: a miss-word (search.html?q=${MISS_WORDS[0]}) shows the chooser -- three entry doors, no grid, no cards`, async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${MISS_WORDS[0]}`);
      await page.waitForSelector(".ch-head", { timeout: 60000 });
      const doors = await page.$$eval(".ch-door", (a) => a.map((x) => x.getAttribute("href")));
      assert.deepEqual(doors, ["ofertas.html", "tiendas.html", "categorias.html"]);
      assert.equal(await page.$$eval("#results .card", (x) => x.length), 0);
      assert.match(await page.textContent(".ch-head h2"), /No encontramos/);
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-chooser.png"), fullPage: true });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser: a low-confidence query (search.html?q=iphone 15 case) shows at most three rails, each with its door", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${encodeURIComponent("iphone 15 case")}`);
      await page.waitForSelector(".ch-lane", { timeout: 60000 });
      const lanes = await page.$$eval(".ch-lane", (ls) => ls.map((l) => ({ kind: l.getAttribute("data-kind"), door: l.querySelector(".lane-door").getAttribute("href"), cards: l.querySelectorAll(".card").length })));
      assert.ok(lanes.length >= 1 && lanes.length <= 3);
      for (const l of lanes) { assert.match(l.door, dst.SURFACE_RX); assert.ok(l.cards > 0); }
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-chooser-low.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
    await check("browser: «nike air force 1» lands on marca.html (Nike), focused on the model -- Comparador + store rails -- with «También puede ser…»", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${encodeURIComponent("nike air force 1")}`);
      await page.waitForURL(/marca\.html\?marca=nike&q=air%20force%201&tp=/, { timeout: 60000 });
      await page.waitForSelector("#tpRow a", { timeout: 30000 });
      await page.waitForSelector("#brandFocus .fc-lane", { timeout: 60000 });
      const chips = await page.$$eval("#tpRow a", (a) => a.map((x) => x.getAttribute("href")));
      assert.ok(chips.length >= 1);
      for (const h of chips) assert.match(h, dst.SURFACE_RX);
      assert.match(await page.textContent("#tpRow"), /También puede ser/);
      assert.ok(await page.$("#brandFocus .fc-chart"), "no Comparador for Air Force 1");
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-tambien.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
    /* Danny 2026-11-02: "no pictures come up on the comparison chart, just
       numbers". Every chart carries the product photo, and every store row
       its own photo and title (which model, which colourway). */
    await check("browser: «adidas samba» Comparador shows the product photo and, on every store row, that store's photo and model title", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=${encodeURIComponent("adidas samba")}`);
      await page.waitForURL(/marca\.html\?marca=adidas&q=samba/, { timeout: 60000 });
      await page.waitForSelector("#brandFocus .fc-chart", { timeout: 60000 });
      const charts = await page.$$eval("#brandFocus .fc-chart", (cs) => cs.map((ch) => ({
        head: !!ch.querySelector(".fc-photo img"),
        rows: [...ch.querySelectorAll(".fc-row")].map((r) => ({ img: !!r.querySelector(".fc-thumb img"), model: (r.querySelector(".fc-model") || {}).textContent || "" })),
      })));
      assert.ok(charts.length >= 1, "no Comparador for Samba");
      for (const ch of charts) {
        assert.ok(ch.head, "a chart without the product photo");
        for (const r of ch.rows) { assert.ok(r.img, "a store row without its photo"); assert.ok(r.model.trim(), "a store row without its model title"); }
      }
      await page.locator("#brandFocus .fc-chart").first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => { const ch = document.querySelector("#brandFocus .fc-chart"); return [...ch.querySelectorAll("img")].every((i) => i.getAttribute("src")); }, null, { timeout: 20000 });
      if (SHOT) await page.screenshot({ path: join(SHOT, "cmp-samba-marca.png") });
      await page.goto(`${BASE}/search.html?resultados=1&q=${encodeURIComponent("adidas samba")}`);
      await page.waitForSelector(".cmp .cmp-row", { timeout: 60000 });
      const rows = await page.$$eval(".cmp .cmp-row", (rs) => rs.map((r) => ({ img: !!r.querySelector(".cmp-mthumb img"), model: (r.querySelector(".cmp-mtitle") || {}).textContent || "" })));
      for (const r of rows) { assert.ok(r.img, "a results-page store row without its photo"); assert.ok(r.model.trim()); }
      assert.deepEqual(errors, []);
      await c.close();
    });
    /* Danny's screenshot: «celular» opens the Celulares type page, phones first. */
    for (const [word, rx, title, shot] of [["celular", /departamento\.html\?dept=electronics&ver=pasillo%3Atech_celulares/, "Celulares", "pw-celular.png"],
      ["laptop", /departamento\.html\?dept=electronics&ver=pasillo%3Atech_computadoras/, "Computadoras y tablets", "pw-laptop.png"],
      ["champú", /departamento\.html\?dept=cabello&ver=tipo%3Achamp%C3%BA%20y%20acondicionador/, "Champú y acondicionador", "pw-champu.png"]]) {
      await check(`browser 390px: «${word}» typed in the header search lands on the ${title} type page -- its listing leads, no Ofertas rail on top`, async () => {
        const { c, page, errors } = await phone();
        await page.goto(`${BASE}/departamento.html?dept=toys`, { waitUntil: "load" });
        await page.tap(".hs-pill");
        await page.fill(".hs-in", word);
        await page.press(".hs-in", "Enter");
        await page.waitForURL(rx, { timeout: 60000 });
        await page.waitForSelector("#typeLead #tlGrid .card:not(.sk)", { timeout: 60000 });
        assert.equal(await page.textContent("#typeLead .tl-head h2"), title);
        assert.equal(await page.textContent("#heroTitle"), title);
        assert.ok(await page.evaluate(() => document.getElementById("salesTop").hidden), "the Ofertas rail is lifted on top");
        assert.equal(await page.$$eval("#rails .rail-sec h2", (hs) => hs.filter((h) => /^Ofertas\b/.test(h.textContent)).length), 0, "an Ofertas rail is drawn");
        /* The type leads: nothing with products sits between the hero and it. */
        const above = await page.evaluate(() => {
          const lead = document.getElementById("typeLead"), out = [];
          for (let el = document.getElementById("deptHero").nextElementSibling; el && el !== lead; el = el.nextElementSibling) if (!el.hidden && el.querySelector(".card")) out.push(el.id);
          return out;
        });
        assert.deepEqual(above, []);
        const cards = await page.$$eval("#tlGrid .card:not(.sk)", (cs) => cs.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
        assert.ok(cards.length >= 4);
        if (word === "celular") {
          assert.match(cards[0], /iphone/i, "no iPhone in the first card: " + cards[0]);
          for (const t of cards.slice(0, 4)) assert.doesNotMatch(t, /FYTPOV|MIRO|NANNEE/i, t);
        }
        const chips = await page.$$eval("#tpRow a", (a) => a.map((x) => x.getAttribute("data-kind")));
        assert.ok(chips.length >= 1 && chips.every((k) => k === "category"), "a brand or store chip against the product word: " + chips);
        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        assert.ok(noOverflow, "horizontal overflow");
        if (SHOT) {
          await page.waitForTimeout(600);
          await page.screenshot({ path: join(SHOT, shot) });
        }
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
    await check("browser: «vestidos» lands on Moda Mujer · Vestidos (departamento.html, t=vestidos) with the chips under the hero; «sephora» on its store", async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/search.html?q=vestidos`);
      await page.waitForURL(/departamento\.html\?dept=women&t=vestidos&ver=tipos&tp=/, { timeout: 60000 });
      await page.waitForSelector("#tpRow a", { timeout: 30000 });
      assert.ok(await page.evaluate(() => document.getElementById("deptHero").nextElementSibling.id === "tpRow"), "the chips are not under the hero");
      if (SHOT) await page.screenshot({ path: join(SHOT, "dest-tambien-dept.png") });
      await page.goto(`${BASE}/search.html?q=sephora`);
      await page.waitForURL(/tienda\.html\?tienda=sephora/, { timeout: 60000 });
      await page.waitForSelector("#tpRow a", { timeout: 30000 });
      assert.deepEqual(errors, []);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (process.env.TABLE) {
  for (const [q, a] of ANSWERS) {
    const d = a.destination;
    const where = d.kind === "chooser" ? a.chooser.rails.map((r) => r.kind + ":" + r.key).join(" + ") : d.url;
    console.log(`| ${q} | ${d.kind} | ${d.kind === "chooser" ? d.key : d.key} | ${where} | ${a.alternatives.map((x) => x.kind + ":" + x.key).join(", ")} |`);
  }
}
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
