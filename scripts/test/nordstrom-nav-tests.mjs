#!/usr/bin/env node
/* ==================================================================
   THE NORDSTROM NAVIGATION PATTERN (#443 c.6616347095, c.6616389410,
   c.6616425433) UNDER «THE HEADER CREATES NOTHING» (#443 c.6621544530,
   c.6621722209).

   Pins:
     - the menu data, the complete lists, the inventory and every page's
       tab row are what scripts/build-nav-menu.mjs computes today;
     - every menu URL is canonical: no nav=1, a page of the section
       registry, only that page's own parameters; every department leaf
       finds exactly its count with the department's own filter;
     - a nav=1 URL (and the bar's other parameters) goes to the canonical
       page: departamento.html's first script, and netlify.toml's 301s;
     - Zapatos' brand list is the department's real brand set; Zapatos +
       Jordan is Jordan shoes (a type check on every card), with the
       audience switch working on the real Zapatos page;
     - Perfumes lands on the real Aria Perfumes department;
     - the bar is kept only where the page has no filters of its own
       (store, brand, search) and renders nowhere else;
     - 1366 and 390: the flyout opens over the page, a click off closes it
       on the same URL, no catalogue is requested, carousels only;
     - NO DEAD ENDS (#443 c.6623258189): no tab without columns opens a
       sheet (it navigates); no column is a single leaf or only repeats
       its tab; the Ofertas flyout lists ofertas.html's own categories
       (N >= 8), each on its real view with a count > 0; Key Club is not
       a tab, its door is the utility bar -- audited on every tab, every
       column and the phone drill-down at 1366 and 390.

     SHOT_DIR also saves hdrfix-*.png (the tab row, Ofertas at 1366 and 390).

     node scripts/test/nordstrom-nav-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/nordstrom-nav-tests.mjs   (also saves canon-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMenu, syncPages, MENU_FILE, INVENTORY_FILE, inventoryMarkdown, NM_PAGES, BRANDS_DIR, BLOCKED, deptRegistry, noDeadEnds, nmMarkup, TABS, isBrandCol } from "../build-nav-menu.mjs";
import { readdirSync } from "node:fs";
import { loadStore } from "../../netlify/functions/_tienda-core.js";
import { loadItems as loadBrandItems, filterByBrand, brandKeyOf } from "../../netlify/functions/_brand-core.js";
import { navFilter, normSize, readFilters, answerNav } from "../../netlify/functions/_nav-filter-core.js";
import { loadDept, filterList, answer as deptAnswer } from "../../netlify/functions/_department-core.js";
import { SHOE_CLASSES, isGarmentTail } from "../lib/footwear.js";
import { storeTypeFamily, foreignFamily, slipType, FASHION_DEPT_EXTRA } from "../lib/type-family.js";
import { misfiledFamily, audienceTrue, trueType, nameFamily } from "../build-department-slices.mjs";
import { typeKeyOf } from "../../netlify/functions/_department-core.js";
import { isAdultInKids, kidProof } from "../lib/kids-truth.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const read = (f) => readFileSync(join(ROOT, f), "utf8");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message.split("\n")[0]); }
}

const B = buildMenu(ROOT);
await check("the menu JSON, the inventory and every page's tab row are current (node scripts/build-nav-menu.mjs)", () => {
  assert.equal(read(MENU_FILE), JSON.stringify(B.menu) + "\n", MENU_FILE + " is stale");
  assert.equal(read(INVENTORY_FILE), inventoryMarkdown(B), INVENTORY_FILE + " is stale");
  for (const [f, l] of Object.entries(B.files)) assert.equal(read(BRANDS_DIR + "/" + f + ".json"), JSON.stringify(l) + "\n", f + " is stale");
  assert.deepEqual(syncPages(B.menu, { write: false, root: ROOT }), []);
  for (const f of NM_PAGES) if (existsSync(join(ROOT, f))) {
    const s = read(f);
    assert.match(s, /<nav class="nm[^"]*" data-nm/, f + " has no tab row");
    assert.match(s, /<script src="\/assets\/js\/nav-menu\.js" defer><\/script>/, f + " does not load the menu");
  }
});
await check("index.html stays CRLF with the tab row in it", () => {
  const s = readFileSync(join(ROOT, "index.html"));
  const lf = s.filter((c, i) => c === 10 && s[i - 1] !== 13).length;
  assert.equal(lf, 0, `${lf} bare LF line endings in index.html`);
});
await check("the menu is small and lazy: under 64KB, fetched by the script, never inlined", () => {
  assert.ok(read(MENU_FILE).length < 64 * 1024, "nav-menu.json is " + read(MENU_FILE).length + " bytes");
  assert.ok(!read("index.html").includes('"tabs":['), "index.html inlines the menu");
  assert.match(read("assets/js/nav-menu.js"), /fetch\('\/assets\/data\/nav-menu\.json'\)/);
});
await check("every section Danny named is a tab or a section in one", () => {
  const all = JSON.stringify(B.menu);
  for (const name of ["Deportes", "Diseñadores Latinos", "Tallas Plus", "Aria Perfumes",
    "Mujer", "Hombre", "Niños", "Belleza", "Zapatos", "Zapatillas", "Accesorios", "Diseñador", "Joyas", "Hogar", "Electrónica", "Juguetes", "Lencería", "Ropa Interior Hombre", "Lentes de Sol", "Aria Auto", "Motos", "Ofertas"])
    assert.ok(all.includes('"' + name), name + " is missing from the menu");
  /* The sections the old «Secciones» block listed keep their own door
     outside the menu: the homepage's category pills or Categorías. */
  const reg = deptRegistry(ROOT), cats = read("categorias.html");
  const bundle = readdirSync(join(ROOT, "build")).filter((f) => /^app-[0-9a-f]{16}\.js$/.test(f)).map((f) => read("build/" + f)).join("");
  const pills = (/const CATEGORY_TAB_ORDER = \[([^\]]*)\]/.exec(bundle) || ["", ""])[1];
  for (const k of ["gym_rat", "soccer", "tennis", "combat_sports", "surf_skate", "spearfishing", "party", "moms", "toys", "books", "candy_chocolate", "mens_grooming", "reacondicionados", "shoes_women", "shoes_men"]) {
    if (!reg[k]) continue;
    assert.ok(cats.includes("dept=" + k + '"') || pills.includes("'" + k + "'"), reg[k].name + " (" + k + ") has no door of its own outside the menu");
  }
  assert.deepEqual(B.unplaced, [], "registry departments with products under no tab");
});
/* ---------- no dead ends (#443 c.6623258189) ---------- */
const RX = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RAILS = JSON.parse(read("assets/ofertas/rails.json"));
const OFERTAS_CATS = (RAILS.cats || []).filter((c) => c && c.key && c.n > 0);
await check("no dead ends: a tab without columns is a plain link (no sheet); no column is a single leaf; no column or section only repeats its tab", () => {
  const row = read("index.html");
  for (const t of B.menu.tabs) {
    const tag = new RegExp('<a class="nm-tab" href="' + RX(t.href) + '" data-nm-tab="' + RX(t.k) + '"([^>]*)>').exec(row);
    assert.ok(tag, t.k + ": no tab in index.html's row");
    if (!t.cols.length) { assert.match(tag[1], /data-nm-direct/, t.k); assert.doesNotMatch(tag[1], /aria-haspopup/, t.k); }
    else assert.match(tag[1], /aria-haspopup="true"/, t.k);
    for (const c of t.cols) {
      assert.notEqual(c.links.length, 1, `${t.label} > ${c.h}: a column of one leaf (a one-item drill)`);
      if (!c.links.length) assert.ok(c.href && c.href !== t.href, `${t.label} > ${c.h}: an empty column, or one that is the tab itself`);
    }
  }
  /* The rule itself, and the markup of a tab without columns. */
  const out = noDeadEnds("X", "/x", [{ h: "A", href: "/a", links: [["Solo", "/x", 3]] }, { h: "B", links: [["Uno", "/b", 2]] }, { h: "C", links: [["1", "/c1", 1], ["2", "/c2", 1]] }]);
  assert.deepEqual(out.map((c) => [c.h, c.href || "", c.links.length]), [["Uno", "/b", 0], ["C", "", 2]]);
  assert.match(nmMarkup({ tabs: [{ k: "z", label: "Z", href: "/z", cols: [] }] }), /<a class="nm-tab" href="\/z" data-nm-tab="z" data-nm-direct>Z<\/a>/);
  /* The client: no placeholder sheet, a direct tab navigates. */
  const js = read("assets/js/nav-menu.js");
  assert.ok(!/para ver todo/.test(js), "nav-menu.js still paints the placeholder sheet");
  assert.match(js, /data-nm-direct/);
});
/* ---------- CATEGORY TRUTH (#443 c.6634907518, Danny's mom on a Mac) ---------- */
const ALL_COLS = () => B.menu.tabs.flatMap((t) => t.cols.map((c) => [t, c]));
const deptOf = (href) => (/[?&]dept=([a-z_]+)/.exec(href || "") || [])[1] || "";
const fullList = (c) => (c.more ? JSON.parse(read(c.more.slice(1))) : c.links);
await check("CARTERAS shows no PAÑALES: JuJuBe's PAÑALES bags are Mama's Fashion's, no baby, sport or tech type is a Carteras leaf", () => {
  const acc = B.menu.tabs.find((t) => t.k === "accesorios");
  const col = acc.cols.find((c) => c.h === "Carteras");
  assert.ok(col, "Accesorios has no Carteras column");
  for (const l of fullList(col)) assert.equal(storeTypeFamily(l[0]), "", `Carteras lists «${l[0]}» (${storeTypeFamily(l[0])})`);
  const purses = loadDept("purses", [ROOT]).list;
  assert.equal(purses.filter((p) => /pa[ñn]al/i.test(p.type || "") || /pa[ñn]ales/.test(typeKeyOf(p).k)).length, 0, "a PAÑALES row is still in Carteras");
  const moms = loadDept("moms", [ROOT]).list;
  assert.ok(moms.some((p) => p.retailer === "jujube" && /tokidoki Be Quick Clutch/.test(p.title)), "JuJuBe's diaper clutch did not reach Mama's Fashion");
});
await check("the sweep: no fashion department (Mujer, Hombre, Niños, Tallas Plus, Ropa, Diseñador, Carteras, Joyas, Lentes de Sol) or Aria Beauty holds a product its store's type files elsewhere", () => {
  const bad = [];
  for (const k of [...Object.keys(FASHION_DEPT_EXTRA), "beauty"]) for (const p of loadDept(k, [ROOT]).list) { const f = misfiledFamily(k, p); if (f) bad.push(`${k}: ${p.title} (${p.type} → ${f})`); }
  assert.deepEqual(bad.slice(0, 8), [], bad.length + " mis-filed");
  assert.deepEqual(B.misfiled, [], "the generator's backstop dropped leaves: " + B.misfiled.join(", "));
  for (const [t, c] of ALL_COLS()) for (const l of fullList(c)) {
    const d = deptOf(l[1]);
    if (!/[?&]t=/.test(l[1]) || !d) continue;
    assert.equal(foreignFamily(d, { type: l[0] }), "", `${t.label} > ${c.h} > ${l[0]}: a ${storeTypeFamily(l[0])} type in ${d}`);
  }
});
await check("the classifier's rules: a store's type names the family; a name that names a thing of its own wins; a container name does not", () => {
  assert.equal(storeTypeFamily("PANALES"), "bebe");
  assert.equal(storeTypeFamily("Baño del bebé"), "bebe");
  assert.equal(storeTypeFamily("Tablas de surf"), "deportes");
  assert.equal(storeTypeFamily("Trípode"), "electronica");
  assert.equal(storeTypeFamily("Ropa de bebé"), "", "baby clothing is clothing");
  assert.equal(storeTypeFamily("Accesorios"), "", "a catch-all names nothing");
  assert.equal(foreignFamily("purses", { type: "PANALES" }, "carteras"), "bebe", "a diaper clutch is baby");
  assert.equal(foreignFamily("joyas_accesorios", { type: "Belleza" }, "joyas"), "", "Hoop Earrings typed Belleza are earrings");
  assert.equal(foreignFamily("joyas_accesorios", { type: "Manta" }, "accesorios"), "", "cufflinks typed «Manta» are cufflinks");
  assert.equal(foreignFamily("joyas_accesorios", { type: "CHUPETES" }, "accesorios"), "bebe", "a pacifier clip is baby");
  assert.equal(foreignFamily("luxury", { type: "COFFEE_TABLE_BOOK" }, ""), "libros", "a Chanel book is not Diseñador's");
  assert.equal(foreignFamily("luxury", { type: "Fragancia" }, ""), "", "a designer fragrance is Diseñador's");
  assert.equal(foreignFamily("sporting_goods", { type: "PANALES" }, ""), "", "only fashion departments and Aria Beauty are swept");
  assert.equal(misfiledFamily("kids", { title: "BLW Readiness Bundle", type: "RETAIL", retailer: "ezpz" }), "bebe", "a baby store's catch-all is baby");
  assert.equal(slipType("beauty", "Ropa", "APPAREL"), "Belleza", "Macy's APPAREL gift set in Aria Beauty");
  assert.equal(slipType("toys", "Bolso", "Bolso"), "Juguetes", "a Funko blind bag in Juguetes");
  assert.equal(slipType("toys", "Figura Coleccionable", "Figura coleccionable"), "");
  assert.equal(trueType({ title: "Men's Apt. 9® Premier Flex Slim-Fit Dress Shirt", type: "Vestido", retailer: "kohls" }), "Camisas");
  assert.equal(trueType({ title: "Floral Midi Dress", type: "Vestido", retailer: "kohls" }), "Vestido");
  assert.equal(nameFamily({ title: "tokidoki Be Quick Clutch - Cosmic Desert" }), "carteras");
});
await check("HOMBRE is audience-true: no Aretes, Tacones, Vestidos or Lencería leaf for him unless every product behind it says it is his", () => {
  const HERS = /^(Aretes|Tacones|Vestidos|Faldas|Lencería|Sostenes)$/;
  for (const [t, c] of ALL_COLS()) for (const l of fullList(c)) {
    if (!/[?&]para=men\b/.test(l[1]) || !HERS.test(l[0])) continue;
    const q = Object.fromEntries(new URL(l[1], "http://x").searchParams);
    const items = filterList(loadDept(q.dept, [ROOT]).list.filter((p) => p.image), { t: q.t, u: "men", dept: q.dept });
    const notHis = items.filter((p) => !/\b(men|mens|men's|man|male|hombres?|him|homme|uomo|unisex|boys?)\b/i.test(p.title));
    assert.deepEqual(notHis.slice(0, 5).map((p) => p.title), [], `${t.label} > ${c.h} > ${l[0]} (${l[2]}): ${notHis.length} products that do not say they are his`);
  }
  assert.equal(audienceTrue({ title: "Daria Earrings", type: "EARRINGS" }, "men"), "", "SSENSE's men's aisle does not make earrings his");
  assert.equal(audienceTrue({ title: "Man. Marinetta Single Stud Earring", type: "EARRINGS" }, "men"), "men", "Vivienne Westwood's Man line is his");
  assert.equal(audienceTrue({ title: "Nine West Fallah Pump", type: "Tacones" }, "unisex"), "women", "a pump that names nobody is hers");
  assert.equal(audienceTrue({ title: "Men's Slim Dress Shirt", type: "Camisas" }, "men"), "men");
  /* The page's filter: a sneaker is never earrings, a doll's dress is no Vestidos. */
  const studs = { title: "Chuck Taylor All Star Bows And Studs", type: "SNEAKERS", image: "x", u: "unisex" };
  assert.equal(filterList([studs], { t: "aretes" }).length, 0, "Converse «Studs» sneakers counted as Aretes");
  const doll = { title: "Barbie Fashionistas Doll #246 in Pink Leopard Print Strapless Dress", type: "", image: "x" };
  assert.equal(filterList([doll], { t: "vestidos", dept: "toys" }).length, 0, "a Barbie counted as Vestidos in Juguetes");
  const shirt = { title: "Men's Regular Fit Performance Dress Shirt", type: "Camisas", image: "x" };
  assert.equal(filterList([shirt], { t: "vestidos" }).length, 0, "a dress shirt counted as Vestidos");
});
await check("CABELLO is never empty: Belleza's Cabello column lists the Cabello department's real aisles; no column anywhere renders a heading with nothing under it", () => {
  const bel = B.menu.tabs.find((t) => t.k === "belleza");
  const cab = bel.cols.find((c) => c.h === "Cabello");
  assert.ok(cab && cab.links.length >= 4, "Belleza > Cabello has " + (cab ? cab.links.length : 0) + " leaves");
  const list = loadDept("cabello", [ROOT]).list.filter((p) => p.image);
  for (const l of cab.links) assert.match(l[1], /^\/departamento\.html\?dept=cabello&t=/, l[0]);
  assert.ok(cab.links.some((l) => /Keratina/i.test(l[0])), "no Keratina leaf");
  assert.equal(cab.links.reduce((s, l) => s + l[2], 0) <= list.length, true);
  for (const [t, c] of ALL_COLS()) assert.ok(c.links.length > 0, `${t.label} > ${c.h}: an empty column`);
  const ele = B.menu.tabs.find((t) => t.k === "electronica").cols.find((c) => c.h === "Reacondicionados");
  assert.ok(ele && ele.links.length >= 2 && !fullList(ele).some((l) => storeTypeFamily(l[0]) === "bebe"), "Reacondicionados is not a column of electronics types");
});
await check("NIÑOS IS ONLY FOR KIDS, both ways (#443 c.6635747308): no adult piece in the kids department or under any para=kids; every child's piece stays", () => {
  /* One way: nothing in Niños is an adult's. */
  const bad = [];
  for (const f of readdirSync(join(ROOT, "assets/sections/departamento/_fn")).filter((f) => /^[a-z_]+\.json$/.test(f))) {
    const k = f.slice(0, -5), d = loadDept(k, [ROOT]);
    if (d) for (const p of d.list) if ((k === "kids" || p.u === "kids") && isAdultInKids(p)) bad.push(`${k}: ${p.retailer} ${p.title}`);
  }
  assert.deepEqual(bad.slice(0, 8), [], bad.length + " adult pieces in Niños");
  const kids = loadDept("kids", [ROOT]).list, women = loadDept("women", [ROOT]).list;
  for (const t of ["AE Wisconsin Badgers Graphic Cropped Baby Tee", "AE Oklahoma Sooners Graphic Cropped Baby Tee"]) {
    assert.ok(!kids.some((p) => p.title === t), t + " is in Niños");
    assert.ok(women.some((p) => p.title === t && p.u === "women"), t + " is not Mujer's");
  }
  /* The other way: a child's piece the product itself proves stays. */
  assert.ok(kids.length > 1500, "Niños kept " + kids.length);
  assert.ok(kids.some((p) => /^Girls 7-20 /.test(p.title)), "Kohl's «Girls 7-20» re-files left Niños");
  for (const t of ["Girls 7-20 SO® Oversized Boxy Graphic Tee in Regular & Plus Size", "Toddler Boys' Jumping Beans® Graphic Tee", "Island Water Sports Script DFB Baby Onesie",
    "Nike Junior Superfly 10 Club Turf Soccer Shoes", "JBL Junior 470NC, Wireless over-ear noise cancelling kids headphones", "Kids' Classic Clog", "Baby Girls 0-3 Months Bodysuit", "Mommy and Me Women's & Girls' Matching Dress"])
    assert.equal(isAdultInKids({ title: t }), false, "a child's piece read as adult: " + t);
  for (const t of ["AE Wisconsin Badgers Graphic Cropped Baby Tee", "Juniors' SO® Slim Fit Baby Tee", "Floral Sling Mini Dress - Baby Blue", "Lace Babydoll Chemise", "Taupe Baby Alpaca Cardigan Women's",
    "Women's Bad Girl Wool Blend Moto Coat", "STRETCH LACE DIPPED THONG | BABY PINK Women's", "Men's Delray D Width Tennis Shoes Apollo Gold and Boysenberry"])
    assert.equal(isAdultInKids({ title: t }), true, "an adult piece read as a child's: " + t);
  /* A style word never proves a child; the audit's re-file needs proof. */
  assert.equal(kidProof("Cotton Baby Tee"), false);
  assert.equal(kidProof("Spice Girls Graphic Tee"), false);
  assert.equal(kidProof("Girls 6-20 SO® Squareneck Tank Top"), true);
  assert.equal(audienceTrue({ title: "AE Oklahoma Sooners Graphic Cropped Baby Tee", type: "TSHIRT" }, "kids"), "women");
  assert.equal(audienceTrue({ title: "Men's Child's Play Chucky Graphic Tee", type: "TSHIRT" }, "kids"), "men");
  assert.equal(audienceTrue({ title: "Toddler Boys' Graphic Tee", type: "TSHIRT" }, "kids"), "kids");
});
await check("Ofertas lists every category of ofertas.html's own Por categoría view (N >= 8), each on ofertas.html?vista=categoria&cat=<k> with its count > 0, then «Ver todas las ofertas»", () => {
  const t = B.menu.tabs.find((x) => x.k === "ofertas");
  assert.equal(t.cols.length, 1, "Ofertas has " + t.cols.map((c) => c.h).join(" · "));
  const col = t.cols[0], leaves = col.links.slice(0, -1);
  assert.ok(OFERTAS_CATS.length >= 8, OFERTAS_CATS.length + " categories in rails.json");
  assert.deepEqual(leaves, OFERTAS_CATS.map((c) => [c.label, "/ofertas.html?vista=categoria&cat=" + c.key, c.n]));
  for (const l of leaves) assert.ok(l[2] > 0, l[0] + ": no count");
  assert.deepEqual(col.links[col.links.length - 1], ["Ver todas las ofertas", "/ofertas.html", t.n]);
  assert.ok(!col.more, "a «Ver todos» step in front of the categories");
  /* ofertas.html opens that view from the URL and draws its pills from rails.json. */
  const o = read("ofertas.html");
  assert.match(o, /searchParams\.get\('vista'\) === 'categoria'/);
  assert.match(o, /rails: BASE \+ '\/assets\/ofertas\/rails\.json'/);
});
await check("Key Club is not a tab (the menu, every page's tab row); its door is the utility bar's gold «Aria Key Club»", () => {
  assert.ok(!B.menu.tabs.some((t) => /key/i.test(t.k) || /Key Club/i.test(t.label) || /keyclub/.test(t.href)), "a Key Club tab");
  for (const f of NM_PAGES) if (existsSync(join(ROOT, f))) {
    const blk = /<!-- nm:start -->([\s\S]*?)<!-- nm:end -->/.exec(read(f));
    assert.ok(blk && !/keyclub|Key Club/i.test(blk[1]), f + ": Key Club in the tab row");
  }
  const s = read("index.html"), ub = s.slice(s.indexOf('<div id="utilityBar"'), s.indexOf("<header", s.indexOf('<div id="utilityBar"')));
  assert.match(ub, /data-key-club/);
  assert.match(ub, /color:#F4C463">Aria Key Club</);
});
await check("Zapatos opens Mujer / Hombre / Niños columns of real types and a Marcas column, on the real Zapatos department", () => {
  const z = B.menu.tabs.find((t) => t.k === "zapatos");
  assert.equal(z.href, "/departamento.html?dept=shoes");
  assert.deepEqual(z.cols.slice(0, 4).map((c) => c.h), ["Mujer", "Hombre", "Niños", "Marcas"]);
  const botas = z.cols[0].links.find((l) => /^Botas/.test(l[0]));
  assert.ok(botas && botas[2] > 0, JSON.stringify(botas));
  assert.equal(botas[1], "/departamento.html?dept=shoes&t=botas-y-botines&para=women");
});

/* ---------- every URL the header carries is canonical ---------- */
const REG = deptRegistry(ROOT);
const PAGE_PARAMS = {
  "/departamento.html": ["dept", "a", "b", "t", "para"],
  "/ropa-interior.html": ["ver"], "/disenadores.html": ["d", "t"], "/motos.html": ["t"],
  "/aria-auto.html": [], "/ofertas.html": ["vista", "cat"], "/keyclub.html": [],
};
const allLinks = () => {
  const out = [];
  for (const t of B.menu.tabs) {
    out.push([t.label, t.href, t.n]);
    for (const c of t.cols) {
      if (c.href) out.push([t.label + " > " + c.h, c.href, c.n]);
      for (const l of c.links) out.push([t.label + " > " + c.h + " > " + l[0], l[1], l[2]]);
      if (c.more) for (const l of JSON.parse(read(c.more.slice(1)))) out.push([t.label + " > " + c.h + " (todas) > " + l[0], l[1], l[2]]);
    }
  }
  return out;
};
await check("every menu link is canonical: no nav=1, a page of the section registry, only that page's own parameters", () => {
  const links = allLinks();
  assert.ok(links.length > 2000, "only " + links.length + " links (the complete lists are missing)");
  for (const [where, href] of links) {
    const u = new URL(href, "http://x");
    assert.ok(!u.searchParams.has("nav") && !/nav=1/.test(href), where + ": " + href);
    assert.ok(Object.prototype.hasOwnProperty.call(PAGE_PARAMS, u.pathname), where + ": " + href + " is not a section page");
    assert.ok(existsSync(join(ROOT, u.pathname)), where + ": " + u.pathname + " does not exist");
    for (const k of u.searchParams.keys()) assert.ok(PAGE_PARAMS[u.pathname].includes(k), where + ": " + href + " carries «" + k + "», not a parameter of that page");
    if (u.pathname === "/departamento.html") {
      const d = u.searchParams.get("dept");
      assert.ok(REG[d] && !REG[d].door, where + ": " + href + " -- «" + d + "» is not a department of the registry with its own grid");
      const para = u.searchParams.get("para");
      if (para) assert.ok(["women", "men", "kids"].includes(para), where + ": " + href);
    }
    if (u.pathname === "/ropa-interior.html") assert.match(href, /^\/ropa-interior\.html(\?ver=(type|brand):[a-z0-9_]+)?#(mujer|hombre)$/, where);
  }
});
await check("every department leaf finds exactly its count with the department's own filter (its type view, brand pills, Para quién)", () => {
  const cache = new Map();
  const listOf = (k) => { if (!cache.has(k)) cache.set(k, loadDept(k, [ROOT]).list.filter((p) => p.image)); return cache.get(k); };
  let n = 0;
  for (const [where, href, count] of allLinks()) {
    const u = new URL(href, "http://x");
    if (u.pathname !== "/departamento.html") continue;
    const q = Object.fromEntries(u.searchParams);
    if (!q.b && !q.t && !q.a) continue;
    const got = filterList(listOf(q.dept), { b: q.b || "", t: q.t || "", a: q.a || "", u: q.para || "", dept: q.dept }).length;
    assert.equal(got, count, `${where}: the menu says ${count}, the page finds ${got} (${href})`);
    n++;
  }
  assert.ok(n > 1500, n + " leaves checked");
});
await check("a type that has its own section is not a fashion department's leaf (shoes, bags, sunglasses, jewellery, fragrance, lingerie)", () => {
  for (const k of ["mujer", "hombre", "ninos"]) {
    const t = B.menu.tabs.find((x) => x.k === k);
    const ropa = t.cols.find((c) => c.h === "Ropa");
    for (const [l, h] of ropa.links) assert.ok(!/[?&]t=(zapatos|zapatillas|sandalias|tacones|botas-y-botines|carteras|lentes-de-sol|joyas|aretes|anillos|fragancia|lenceria|fajas-y-shapewear|ropa-interior)(&|$)/.test(h), `${t.label} > Ropa > ${l}: ${h}`);
  }
  /* Each owning section is still in the menu: a tab or a column of its own. */
  const doors = B.menu.tabs.flatMap((t) => [t.href, ...t.cols.map((c) => c.href)]);
  for (const h of ["/ropa-interior.html#mujer", "/departamento.html?dept=perfumes", "/departamento.html?dept=purses", "/departamento.html?dept=sunglasses", "/departamento.html?dept=shoes", "/departamento.html?dept=joyas_accesorios"]) assert.ok(doors.includes(h), "no tab or column opens " + h);
});
await check("Perfumes in the menu is the real Aria Perfumes department: the homepage's own address and its own doors", () => {
  const home = read("index.html");
  assert.ok(home.includes('href="/departamento.html?dept=perfumes" class="ariaHouseCta'), "the homepage's «Entrar a Aria Perfumes» moved");
  /* (Casa Aria's «Perfumes» are room sprays and diffusers: home, not Aria Perfumes.) */
  const per = allLinks().filter(([w, h]) => /dept=perfumes/.test(h) || (/(^|> )(Aria )?Perfumes$/.test(w) && !/^Hogar/.test(w)));
  assert.ok(per.length >= 4, per.length + " Perfumes links");
  for (const [w, h] of per) assert.match(h, /^\/departamento\.html\?dept=perfumes(&a=(mujer|hombre|unisex|minis|sets|testers))?$/, w);
  const col = B.menu.tabs.find((x) => x.k === "belleza").cols.find((c) => c.h === "Aria Perfumes");
  assert.equal(col.href, "/departamento.html?dept=perfumes");
  assert.ok(!JSON.stringify(B.menu).includes("t=fragancia"), "a Fragancia type link");
});
await check("Zapatos' brand list is the department's real brand set, complete (the flyout's «Ver todas las marcas»)", () => {
  const col = B.menu.tabs.find((x) => x.k === "zapatos").cols.find((c) => c.h === "Marcas");
  const full = JSON.parse(read(col.more.slice(1)));
  const real = new Map();
  for (const p of loadDept("shoes", [ROOT]).list) { if (!p.image) continue; const k = String(p.brand || "").trim().toLowerCase(); if (k) real.set(k, (real.get(k) || 0) + 1); }
  const got = new Map(full.map(([, h, n]) => [new URL(h, "http://x").searchParams.get("b").toLowerCase(), n]));
  assert.equal(col.all, real.size);
  assert.deepEqual([...got.keys()].sort(), [...real.keys()].sort(), "not the department's brand set");
  for (const [k, n] of real) assert.equal(got.get(k), n, k);
  for (const k of ["jordan", "nike", "vans", "crocs", "skechers"]) assert.ok(got.has(k), k + " is missing");
  assert.ok(col.links.length < full.length && col.links.every((l, i) => l[1] === full[i][1]), "the flyout's first brands are not the list's first");
});
await check("Zapatos + Jordan is Jordan shoes: every card of the department's own Jordan view is a shoe (its type), none a garment", () => {
  const more = B.menu.tabs.find((x) => x.k === "zapatos").cols.find((c) => c.h === "Marcas").more;
  const jordan = JSON.parse(read(more.slice(1))).find((l) => l[0].toLowerCase() === "jordan");
  assert.equal(jordan[1], "/departamento.html?dept=shoes&b=Jordan");
  const list = loadDept("shoes", [ROOT]).list.filter((p) => String(p.brand || "").trim().toLowerCase() === "jordan");
  assert.ok(list.length > 50);
  const typeOf = new Map(list.map((p) => [p.title + "|" + p.retailer, p.type]));
  const head = deptAnswer({ dept: "shoes", b: "Jordan" }, [ROOT]).body;
  let cards = 0;
  for (let r = 0; r < head.rails.length; r++) {
    for (let pg = 0; ; pg++) {
      const out = deptAnswer({ dept: "shoes", b: "Jordan", rail: String(r), page: String(pg) }, [ROOT]);
      if (out.status !== 200) break;
      for (const c of out.body.cards || []) {
        cards++;
        assert.equal(String(c.b).toLowerCase(), "jordan", c.t);
        assert.ok(SHOE_CLASSES.includes(typeOf.get(c.t + "|" + c.r)), c.t + ": type " + typeOf.get(c.t + "|" + c.r));
        assert.ok(!isGarmentTail(c.t), c.t + " is a garment");
      }
      if (pg + 1 >= (out.body.pages || 1)) break;
    }
  }
  assert.ok(cards >= list.length, cards + " cards for " + list.length + " products");
  for (const u of ["women", "men", "kids"]) {
    const sub = filterList(list, { u });
    assert.ok(sub.length > 0 && sub.length < list.length, u + ": " + sub.length);
  }
});
await check("the views the header used to invent are blocked: netlify.toml 301s every nav=1 set the menus carried to the canonical page", () => {
  const toml = read("netlify.toml");
  const rules = [...toml.matchAll(/\[\[redirects\]\]\s*\n\s*from = "([^"]+)"\s*\n\s*to = "([^"]+)"\s*\n\s*status = (\d+)\s*\n\s*force = true\s*\n\s*query = \{([^}]*)\}/g)]
    .map((m) => ({ from: m[1], to: m[2], status: +m[3], q: Object.fromEntries([...m[4].matchAll(/([a-z]+) = ":([a-z]+)"/g)].map((x) => [x[1], x[2]])) }));
  /* Netlify: a rule with query parameters matches the request's exact set. */
  const sim = (path, qs) => {
    const keys = Object.keys(qs).sort().join(",");
    const r = rules.find((x) => x.from === path && Object.keys(x.q).sort().join(",") === keys);
    return r && r.to.replace(/:([a-z]+)/g, (_, k) => qs[Object.keys(r.q).find((q) => r.q[q] === k)]);
  };
  const cases = [
    [{ dept: "shoes", nav: "1", u: "women", t: "botas-y-botines" }, "/departamento.html?dept=shoes&t=botas-y-botines&para=women"],
    [{ dept: "shoes", nav: "1", u: "men", b: "jordan" }, "/departamento.html?dept=shoes&b=jordan&para=men"],
    [{ dept: "shoes", nav: "1", b: "jordan" }, "/departamento.html?dept=shoes&b=jordan"],
    [{ dept: "perfumes", nav: "1", t: "fragancia" }, "/departamento.html?dept=perfumes&t=fragancia"],
    [{ dept: "women", nav: "1", t: "vestidos", o: "1" }, "/departamento.html?dept=women&t=vestidos&ver=ofertas"],
    [{ dept: "women", nav: "1", o: "1" }, "/departamento.html?dept=women&ver=ofertas"],
    [{ dept: "kids", nav: "1", u: "kids" }, "/departamento.html?dept=kids&para=kids"],
    [{ dept: "luxury", nav: "1" }, "/departamento.html?dept=luxury"],
  ];
  for (const path of ["/departamento.html", "/departamento"]) for (const [qs, to] of cases) assert.equal(sim(path, qs), to, path + " " + JSON.stringify(qs));
  assert.ok(rules.length >= 16 && rules.every((r) => r.status === 301 && !/nav/.test(r.to)));
  assert.ok(BLOCKED.some(([a]) => /nav=1/.test(a)));
  assert.match(read(INVENTORY_FILE), /## URLs bloqueadas o redirigidas/);
});
await check("departamento.html's first script sends a nav=1 URL to the canonical page before anything renders; the bar is gone from every section page", () => {
  const s = read("departamento.html");
  const first = s.indexOf("<script"), redirect = s.indexOf("window.__ariaCanon = 1");
  assert.ok(redirect > first && redirect < s.indexOf("</script>", first), "the redirect is not the first script");
  assert.ok(redirect < s.indexOf("<title>"), "the redirect is not at the top of <head>");
  for (const f of ["departamento.html", "ropa-interior.html"]) assert.ok(!/nav-filter\.js|nfBoot|AriaNFHost/.test(read(f)), f + " still loads the filter bar");
  /* Ofertas mounts the bar only inside one of its own categories (#443
     c.6629871333: "Ofertas zapatos mujer / hombre / niños"), never on
     its store view: no static script tag, only nfSync's category source. */
  assert.doesNotMatch(read("ofertas.html"), /<script[^>]*src="\/assets\/js\/nav-filter\.js"/);
  assert.match(read("ofertas.html"), /'ofertas=1&cat=' \+ encodeURIComponent\(S\.cat\)/);
  assert.ok(!/AriaDept|nav=1|'nav'/.test(read("assets/js/nav-filter.js")), "nav-filter.js still builds the department's filtered view");
});
await check("sizes are the store's own labels, read not invented", () => {
  assert.deepEqual(normSize("9.5M"), [{ z: "US 9.5", side: "" }]);
  assert.deepEqual(normSize("9 | US"), [{ z: "US 9", side: "" }]);
  assert.deepEqual(normSize("IT 41"), [{ z: "IT 41", side: "" }]);
  assert.deepEqual(normSize("M 10 / W 11.5"), [{ z: "US 10", side: "m" }, { z: "US 11.5", side: "w" }]);
  assert.deepEqual(normSize("10.0"), [{ z: "US 10", side: "" }]);
});
await check("facets stack (Niños x Botas x a brand x a size) and every offered option returns products", () => {
  const base = { u: "women", t: "botas-y-botines", s: "", b: [], z: [], p: [], o: "", fx: 3.75 };
  const r0 = navFilter("shoes", base, "deal", 0, [ROOT]);
  assert.ok(r0.count > 0 && r0.facets.b.length && r0.facets.z.length && r0.facets.s.length);
  const b = r0.facets.b[0][0];
  const r1 = navFilter("shoes", { ...base, b: [b] }, "deal", 0, [ROOT]);
  assert.equal(r1.count, r0.facets.b[0][2], "the brand count is the brand's result");
  const z = r1.facets.z[0];
  const r2 = navFilter("shoes", { ...base, b: [b], z: [z[0]] }, "deal", 0, [ROOT]);
  assert.equal(r2.count, z[2], "the size count is the stacked result");
  assert.ok(r2.count <= r1.count && r1.count <= r0.count);
  for (const k of ["u", "t", "s", "b", "z", "p", "o"]) for (const x of r2.facets[k]) assert.ok(x[2] > 0, `${k} ${x[0]} offered at 0`);
  const p = r2.facets.p[0];
  if (p) assert.equal(navFilter("shoes", { ...base, b: [b], z: [z[0]], p: [p[0]] }, "deal", 0, [ROOT]).count, p[2]);
  const kids = navFilter("shoes", { ...base, u: "kids", b: ["ugg"] }, "deal", 0, [ROOT]);
  for (const c of kids.cards) assert.equal(String(c.b).toLowerCase(), "ugg");
});
await check("every listing: two brands give exactly the union of the two (within the listing), and every card is one of them", async () => {
  for (const src of [{ tienda: "macys" }, { marca: "nike" }]) {
    const all = (await answerNav({ ...src, fx: "3.75" }, [ROOT])).body;
    const two = all.facets.b.slice(0, 2);
    if (two.length < 2) { assert.ok(src.marca, JSON.stringify(src) + " has fewer than two brands"); continue; }
    const r = (await answerNav({ ...src, fx: "3.75", b: two.map((x) => x[0]).join("|") }, [ROOT])).body;
    assert.equal(r.count, two[0][2] + two[1][2], JSON.stringify(src) + ": not the union");
    assert.ok(r.count < all.count, JSON.stringify(src) + ": not narrowed");
    for (let pg = 0; pg < Math.min(r.pages, 4); pg++) {
      const cards = pg ? (await answerNav({ ...src, fx: "3.75", b: two.map((x) => x[0]).join("|"), page: String(pg) }, [ROOT])).body.cards : r.cards;
      for (const c of cards) assert.ok(two.some((x) => x[0] === String(c.b || c.brand || "").trim().toLowerCase()), JSON.stringify(src) + ": a card of " + (c.b || c.brand));
    }
  }
});
await check("no filter UI renders a checkbox (the bar, the menu, the department page)", () => {
  for (const f of ["assets/js/nav-filter.js", "assets/js/nav-menu.js", "assets/js/dept-header.js", "departamento.html", "search.html", "marca.html", "tienda.html", "ofertas.html", "ropa-interior.html"])
    assert.ok(!/type=["']?checkbox/.test(read(f)), f + " renders a checkbox");
});

await check("the homepage's Categorías store rail is chips, not a checkbox sidebar (the checkboxes are hidden state)", () => {
  const s = read("index.html");
  const i = s.indexOf('id="categoriesStoreFilters"');
  const aside = s.lastIndexOf("<aside", i);
  assert.match(s.slice(aside, aside + 40), /<aside hidden aria-hidden="true">/);
  assert.match(s, /<div id="categoriesStoreChips" class="flex gap-2/);
});
await check("the menu and the bar lay nothing out on a grid (carousels only)", () => {
  for (const f of ["assets/js/nav-filter.js", "assets/js/nav-menu.js"]) assert.ok(!/display\s*:\s*grid/.test(read(f)), f);
  assert.match(read("assets/js/nav-filter.js"), /class="rail nf-rail" id="nfRail"/);
});

/* ---------- no «Secciones» (#443 c.6635728704, c.6635797675, c.6635799980) ---------- */
await check("no «Secciones» anywhere: no tab's column (every tab), the menu file, the complete lists, the inventory, every page's tab row and markup, the scripts", () => {
  for (const t of B.menu.tabs) for (const c of t.cols) assert.ok(!/Secciones/i.test(c.h), `${t.label} > ${c.h}`);
  for (const k of ["mujer", "hombre", "ninos", "zapatos", "belleza", "accesorios", "disenador", "hogar", "ofertas"]) assert.ok(B.menu.tabs.some((t) => t.k === k), k + " tab is missing");
  assert.ok(!/Secciones/i.test(read(MENU_FILE)), MENU_FILE);
  for (const f of readdirSync(join(ROOT, BRANDS_DIR))) assert.ok(!/Secciones/i.test(read(BRANDS_DIR + "/" + f)), f);
  assert.ok(!/«Secciones»|### Secciones|· Secciones/.test(read(INVENTORY_FILE).replace(/No hay bloque «Secciones»/, "")), INVENTORY_FILE);
  for (const f of NM_PAGES) if (existsSync(join(ROOT, f))) assert.ok(!/Secciones/.test(read(f)), f + " says «Secciones»");
  for (const f of ["assets/js/nav-menu.js", "assets/js/dept-header.js", "assets/js/header-search.js", "scripts/header-search.mjs"]) assert.ok(!/Secciones/.test(read(f)), f);
  for (const f of readdirSync(join(ROOT, "build")).filter((x) => /^app-[0-9a-f]{16}\.js$/.test(x))) assert.ok(!/Secciones/.test(read("build/" + f)), f);
});

/* ---------- nav count truth (#443 c.6635540929, c.6635573276) ---------- */
const listCache = new Map();
const deptList = (k) => { if (!listCache.has(k)) { const d = loadDept(k, [ROOT]); listCache.set(k, d ? d.list.filter((p) => p.image) : null); } return listCache.get(k); };
const behind = (href) => {
  const u = new URL(href, "http://x");
  if (u.pathname !== "/departamento.html") return null;
  const l = deptList(u.searchParams.get("dept"));
  const q = (k) => u.searchParams.get(k) || "";
  return l ? filterList(l, { b: q("b"), t: q("t"), a: q("a"), u: q("para") }) : null;
};
const brandsOf = (list) => new Set(list.map((p) => String(p.brand || "").trim().toLowerCase()).filter(Boolean));
await check("Marcas counts distinct brands in every scope: the list plus its «Ver todas» remainder, and an independent count of the brands its page renders", () => {
  let n = 0;
  for (const t of B.menu.tabs) for (const c of t.cols) {
    if (!isBrandCol(c.h)) continue;
    const full = c.more ? JSON.parse(read(c.more.slice(1))) : c.links;
    assert.equal(c.n, full.length, `${t.label} > ${c.h}: shows ${c.n}, its list has ${full.length} brands`);
    assert.equal(c.n, c.all || c.links.length, `${t.label} > ${c.h}: ${c.n} vs «Ver todas» ${c.all}`);
    assert.notEqual(c.n, t.n, `${t.label} > ${c.h}: the brand number is the product total`);
    const set = c.href && behind(c.href);
    if (set) assert.equal(c.n, brandsOf(set).size, `${t.label} > ${c.h}: ${c.n} shown, ${brandsOf(set).size} distinct brands behind ${c.href}`);
    n++;
  }
  assert.ok(n >= 12, n + " brand columns");
  /* The client labels the number as brands. */
  assert.match(read("assets/js/nav-menu.js"), /' marcas'/);
});
await check("a store and a brand page: the Marca panel's brands are the distinct brands of the products the page draws", async () => {
  for (const qs of [{ tienda: "macys" }, { marca: "nike" }]) {
    const r = await answerNav(qs, [ROOT]);
    assert.equal(r.status, 200, JSON.stringify(qs));
    let rows;
    if (qs.tienda) rows = (loadStore(qs.tienda, [ROOT]).rows || []).filter((x) => x[5]).map((x) => x[1]);
    else rows = filterByBrand(loadBrandItems([ROOT]).items, brandKeyOf(qs.marca)).filter((p) => p.image).map((p) => p.brand);
    const real = new Set(rows.map((b) => String(b || "").trim().toLowerCase()).filter(Boolean));
    assert.equal(r.body.facets.b.length, real.size, JSON.stringify(qs));
  }
});
await check("buckets reconcile: a column shows a product number only when it is what its link renders and the columns partition the tab's total; otherwise none", () => {
  let shown = 0;
  for (const t of B.menu.tabs) {
    const parts = t.cols.filter((c) => !isBrandCol(c.h) && c.n);
    if (!parts.length) continue;
    shown++;
    const whole = behind(t.href);
    assert.ok(whole, t.label + ": numbered columns under a tab whose total is not a department view");
    assert.equal(parts.length, t.cols.filter((c) => !isBrandCol(c.h)).length, t.label + ": only some columns are numbered");
    const seen = new Set(), keyOf = (p) => p.retailer + "\u0001" + p.title;
    for (const c of parts) {
      const set = behind(c.href);
      assert.ok(set, `${t.label} > ${c.h}: a number with no department view behind it`);
      assert.equal(c.n, set.length, `${t.label} > ${c.h}: shows ${c.n}, its page renders ${set.length}`);
      for (const p of set) { assert.ok(!seen.has(keyOf(p)), `${t.label} > ${c.h}: a product counted twice`); seen.add(keyOf(p)); }
    }
    assert.equal(parts.reduce((s, c) => s + c.n, 0), t.n, t.label + ": the columns do not sum to the total");
  }
  /* Mujer's Ropa / Zapatos / Accesorios overlap (24,680 against 17,417 before): they carry no product number. */
  for (const k of ["mujer", "hombre", "ninos", "zapatos"]) for (const c of B.menu.tabs.find((x) => x.k === k).cols) if (!isBrandCol(c.h)) assert.equal(c.n, undefined, k + " > " + c.h);
  void shown;
});

let pw = null;
try { pw = await import("playwright"); } catch { /* reported */ }
await check("browser: playwright is available", () => assert.ok(pw));
if (pw) {
  const { createServer } = await import("node:http");
  const handlers = {
    "nav-filter": (await import("../../netlify/functions/nav-filter.js")).handler,
    department: (await import("../../netlify/functions/department.js")).handler,
    tienda: (await import("../../netlify/functions/tienda.js")).handler,
    brand: (await import("../../netlify/functions/brand.js")).handler,
    ofertas: (await import("../../netlify/functions/ofertas.js")).handler,
    search: (await import("../../netlify/functions/search.js")).handler,
  };
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
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
    if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
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
  const ctx = async (desktop) => {
    const c = await browser.newContext(desktop ? { viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await c.newPage();
    const reqs = [];
    page.on("request", (r) => reqs.push(r.url()));
    return { c, page, reqs };
  };
  /* The flyout is open with its columns. Polled from here: the homepage's
     own timers make an in-page waitForFunction miss its ticks. */
  const flyoutOpen = async (page, col = "Mujer") => {
    for (let t = Date.now(); Date.now() - t < 15000; await page.waitForTimeout(100)) {
      const ok = await page.evaluate((c) => {
        const f = document.getElementById("nmFlyout");
        if (!f || f.hidden) return false;
        /* Desktop: the column; phone: the drill-down's row for it. */
        const a = [...f.querySelectorAll('[data-nm-col="' + c + '"] a, .nmf-go')].find((x) => x.getBoundingClientRect().height > 0 && (x.closest("[data-nm-col]") || x.textContent.startsWith(c)));
        return !!a;
      }, col);
      if (ok) return;
    }
    throw new Error("the flyout did not open with its " + col + " column");
  };
  const CATALOG_RX = /-catalog\.json|department-cache|auto-cache\.json|ofertas-feed\.json|catalog-index\.json|\/_fn\//;
  try {
    await check("browser desktop 1366: hover Zapatos opens the flyout over the homepage; outside click closes it on the same URL; no catalogue requested", async () => {
      const { c, page, reqs } = await ctx(true);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-nm-tab="zapatos"]');
      await page.waitForFunction(() => document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(200);
      const url0 = page.url();
      const before = reqs.length;
      await page.hover('[data-nm-tab="zapatos"]');
      await flyoutOpen(page);
      const y0 = await page.evaluate(() => window.scrollY);
      const cols = await page.$$eval("#nmFlyout .nmf-col h3", (h) => h.map((x) => x.textContent));
      assert.deepEqual(cols.slice(0, 4), ["Mujer", "Hombre", "Niños", "Marcas"]);
      assert.ok(await page.isVisible('#nmFlyout [data-nm-col="Marcas"] a'));
      if (SHOT) await page.screenshot({ path: join(SHOT, "nav-desktop-zapatos-flyout.png") });
      const during = reqs.slice(before);
      assert.deepEqual(during.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested with the menu open");
      assert.ok(during.some((u) => /nav-menu\.json/.test(u)) || reqs.some((u) => /nav-menu\.json/.test(u)));
      await page.mouse.move(683, 700);
      await page.mouse.click(683, 700);
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(page.url(), url0, "clicking off navigated");
      assert.equal(await page.evaluate(() => window.scrollY), y0, "the scroll moved");
      /* Click opens it too, Esc closes it. */
      await page.click('[data-nm-tab="deportes"]');
      await page.waitForSelector('#nmFlyout:not([hidden]) .nmf-col');
      await page.keyboard.press("Escape");
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(page.url(), url0);
      /* Keyboard: ArrowDown into the first column, ArrowRight to the next,
         ArrowDown down it, Esc back to the tab -- nothing navigates. */
      await page.focus('[data-nm-tab="zapatos"]');
      await page.keyboard.press("ArrowDown");
      await flyoutOpen(page);
      await page.waitForFunction(() => document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-nm-col="Mujer"]'));
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => document.activeElement.closest("[data-nm-col]").getAttribute("data-nm-col")), "Hombre");
      await page.keyboard.press("ArrowDown");
      assert.match(await page.evaluate(() => document.activeElement.textContent), /\d/);
      await page.keyboard.press("Escape");
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-nm-tab")), "zapatos");
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute("data-nm-tab")), "belleza");
      assert.equal(page.url(), url0);
      await c.close();
    });
    /* ---------- the header lands on the canonical pages ---------- */
    const JORDAN = new Map(loadDept("shoes", [ROOT]).list.filter((p) => String(p.brand || "").trim().toLowerCase() === "jordan").map((p) => [p.title, p]));
    const cardsOf = (page) => page.$$eval("#rails a.card[href*='producto=']", (as) => as.map((a) => { const u = new URL(a.href); return { t: u.searchParams.get("producto"), r: u.searchParams.get("tienda"), u: a.getBoundingClientRect().top }; }));
    const shoeCheck = (cards, where) => {
      assert.ok(cards.length > 0, where + ": no cards");
      for (const c of cards) {
        const p = JORDAN.get(c.t);
        assert.ok(p, where + ": «" + c.t + "» is not a Jordan product of Zapatos");
        assert.ok(SHOE_CLASSES.includes(p.type) && !isGarmentTail(c.t), where + ": «" + c.t + "» is a " + p.type);
      }
    };
    await check("browser desktop 1366: Zapatos > Mujer > Botas lands on the real Zapatos department's own type view (no nav=1, no second rendering)", async () => {
      const { c, page, reqs } = await ctx(true);
      await page.goto(BASE + "/departamento.html?dept=shoes", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.hover('[data-nm-tab="zapatos"]');
      const leaf = '#nmFlyout [data-nm-col="Mujer"] a[href*="t=botas-y-botines"]';
      await page.waitForSelector(leaf, { timeout: 10000 });
      await Promise.all([page.waitForURL(/t=botas-y-botines/), page.click(leaf)]);
      assert.equal(page.url(), BASE + "/departamento.html?dept=shoes&t=botas-y-botines&para=women");
      await page.waitForSelector("#rails .rail-sec .card:not(.sk)", { timeout: 60000 });
      assert.match(await page.textContent("#scopeBar"), /Botas/);
      assert.equal(await page.$("#nf"), null, "the filter bar rendered a second view");
      await page.waitForSelector('#dhAud:not([hidden]) button[data-u="women"][aria-pressed="true"]', { timeout: 30000 });
      assert.equal(reqs.filter((u) => CATALOG_RX.test(u)).length, 0, "a catalogue file was requested");
      await c.close();
    });
    await check("browser desktop 1366: Zapatos' «Ver todas las marcas» opens the department's complete brand list in the flyout; Jordan opens the real Zapatos page", async () => {
      const { c, page, reqs } = await ctx(true);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      const url0 = page.url();
      await page.hover('[data-nm-tab="zapatos"]');
      await flyoutOpen(page);
      const col = B.menu.tabs.find((x) => x.k === "zapatos").cols.find((x) => x.h === "Marcas");
      const before = reqs.length;
      await page.click('#nmFlyout [data-nm-col="Marcas"] [data-nm-more]');
      await page.waitForFunction((n) => document.querySelectorAll('#nmFlyout [data-nm-col="Marcas"] li a').length === n, col.all, { timeout: 10000 });
      assert.equal(page.url(), url0, "«Ver todas» navigated");
      const got = reqs.slice(before);
      assert.ok(got.some((u) => u.includes(col.more)), "the list was not fetched");
      assert.deepEqual(got.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested");
      if (SHOT) await page.screenshot({ path: join(SHOT, "canon-zapatos-brands-1366.png") });
      const j = '#nmFlyout [data-nm-col="Marcas"] a[href="/departamento.html?dept=shoes&b=Jordan"]';
      await page.$eval(j, (a) => a.scrollIntoView({ block: "center" }));
      await Promise.all([page.waitForURL(/b=Jordan/), page.click(j)]);
      assert.equal(page.url(), BASE + "/departamento.html?dept=shoes&b=Jordan");
      await page.waitForSelector("#rails .rail-sec .card:not(.sk)", { timeout: 60000 });
      shoeCheck(await cardsOf(page), "1366 Zapatos + Jordan");
      await c.close();
    });
    await check("browser phone 390: a tap opens the sheet; Zapatos > Marcas > «Ver todas las marcas» lists every brand of the department; a tap outside closes it on the same page", async () => {
      const { c, page, reqs } = await ctx(false);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      const url0 = page.url();
      await page.tap('[data-nm-tab="zapatos"]');
      await flyoutOpen(page);
      const box = await page.$eval("#nmFlyout", (e) => { const r = e.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
      assert.equal(box.bottom, 844, "the sheet sits on the bottom edge");
      assert.equal(box.h > 600, true, "the phone menu is not full height: " + box.h);
      /* The drill-down: Mujer, its leaves, back -- nothing navigates. */
      await page.tap('#nmFlyout [data-nm-go="0"]');
      await page.waitForSelector('#nmFlyout [data-nm-lvl="0"]:not([hidden]) a[href*="t=botas-y-botines"]');
      assert.equal(await page.isVisible("#nmFlyout [data-nm-l0]"), false);
      await page.tap('#nmFlyout [data-nm-lvl="0"] [data-nm-back]');
      await page.waitForSelector("#nmFlyout [data-nm-l0]:not([hidden])");
      /* Marcas: the first ones, then all of them. */
      const tab = B.menu.tabs.find((x) => x.k === "zapatos"), mi = tab.cols.findIndex((x) => x.h === "Marcas");
      await page.tap(`#nmFlyout [data-nm-go="${mi}"]`);
      await page.waitForSelector(`#nmFlyout [data-nm-lvl="${mi}"]:not([hidden]) [data-nm-more]`);
      await page.tap(`#nmFlyout [data-nm-lvl="${mi}"] [data-nm-more]`);
      await page.waitForFunction(([i, n]) => document.querySelectorAll('#nmFlyout [data-nm-lvl="' + i + '"] li a').length === n, [mi, tab.cols[mi].all], { timeout: 10000 });
      assert.equal(page.url(), url0);
      if (SHOT) {
        await page.$eval("#nmFlyout", (f) => { f.scrollTop = 0; });
        await page.screenshot({ path: join(SHOT, "canon-zapatos-brands.png") });
        await page.$eval("#nmFlyout", (f) => { f.scrollTop = f.scrollHeight; });
        await page.screenshot({ path: join(SHOT, "canon-zapatos-brands-end.png") });
      }
      assert.deepEqual(reqs.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested");
      await page.tap("[data-nm-backdrop]", { position: { x: 195, y: 40 } }).catch(() => {});
      await page.keyboard.press("Escape");
      await page.waitForSelector("#nmFlyout", { state: "hidden" });
      assert.equal(page.url(), url0);
      await c.close();
    });
    await check("browser phone 390: Zapatos + Jordan from the header is Jordan shoes only (a type check on every card), and Niños narrows it on the same page", async () => {
      const { c, page, reqs } = await ctx(false);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.tap('[data-nm-tab="zapatos"]');
      await flyoutOpen(page);
      const tab = B.menu.tabs.find((x) => x.k === "zapatos"), mi = tab.cols.findIndex((x) => x.h === "Marcas");
      await page.tap(`#nmFlyout [data-nm-go="${mi}"]`);
      await page.tap(`#nmFlyout [data-nm-lvl="${mi}"] [data-nm-more]`);
      const j = `#nmFlyout [data-nm-lvl="${mi}"] a[href="/departamento.html?dept=shoes&b=Jordan"]`;
      await page.waitForSelector(j);
      await page.$eval(j, (a) => a.scrollIntoView({ block: "center" }));
      await Promise.all([page.waitForURL(/b=Jordan/), page.tap(j)]);
      assert.equal(page.url(), BASE + "/departamento.html?dept=shoes&b=Jordan");
      await page.waitForSelector("#rails .rail-sec .card:not(.sk)", { timeout: 60000 });
      assert.equal(await page.$("#nf"), null, "a second rendering");
      assert.match(await page.textContent("#scopeBar"), /Jordan/i);
      shoeCheck(await cardsOf(page), "390 Zapatos + Jordan");
      if (SHOT) {
        await page.evaluate(() => { const h = document.getElementById("scopeBar"); window.scrollTo(0, Math.max(0, h.getBoundingClientRect().top + window.scrollY - 230)); });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(SHOT, "canon-zapatos-jordan.png") });
        await page.evaluate(() => { const r = document.querySelector("#rails .rail-sec"); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.scrollY - 140)); });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(SHOT, "canon-zapatos-jordan-rails.png") });
      }
      /* The audience layer works as normal: Niños, on the same page. */
      await page.waitForSelector('#dhAud:not([hidden]) button[data-u="kids"]', { timeout: 30000 });
      const kids = await page.$('#dhAud button[data-u="kids"]');
      assert.ok(kids, "no Niños in the audience switch");
      await kids.tap();
      await page.waitForFunction(() => /para=kids/.test(location.search), null, { timeout: 30000 });
      await page.waitForSelector("#rails .rail-sec .card:not(.sk)", { timeout: 60000 });
      await page.waitForTimeout(300);
      const kc = await cardsOf(page);
      shoeCheck(kc, "390 Zapatos + Jordan + Niños");
      for (const x of kc) assert.equal(JORDAN.get(x.t).u, "kids", x.t);
      assert.match(page.url(), /dept=shoes&b=Jordan/);
      assert.deepEqual(reqs.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested");
      await c.close();
    });
    await check("browser phone 390: Perfumes from the header lands on the real Aria Perfumes department (its doors and houses), never a Fragancia grid", async () => {
      const { c, page, reqs } = await ctx(false);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.tap('[data-nm-tab="belleza"]');
      await flyoutOpen(page, "Aria Perfumes");
      const tab = B.menu.tabs.find((x) => x.k === "belleza"), pi = tab.cols.findIndex((x) => x.h === "Aria Perfumes");
      await page.tap(`#nmFlyout [data-nm-go="${pi}"]`);
      const all = `#nmFlyout [data-nm-lvl="${pi}"] a.nmf-colall`;
      await page.waitForSelector(all);
      await Promise.all([page.waitForURL(/dept=perfumes/), page.tap(all)]);
      assert.equal(page.url(), BASE + "/departamento.html?dept=perfumes");
      await page.waitForSelector("#pDoors:not([hidden]) .hub-pill", { timeout: 60000 });
      await page.waitForSelector("#rails .rail-sec .card:not(.sk)", { timeout: 60000 });
      assert.equal(await page.$("#nf"), null, "a second rendering");
      assert.ok(!/Fragancia/.test(await page.textContent("#heroTitle")), "a Fragancia view");
      assert.equal(await page.$eval("#scopeBar", (e) => e.hidden || !e.textContent.trim()), true, "opened narrowed");
      if (SHOT) await page.screenshot({ path: join(SHOT, "canon-perfumes.png") });
      assert.deepEqual(reqs.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested");
      await c.close();
    });
    await check("browser phone 390: a nav=1 URL (and the bar's own parameters) redirects to the canonical page before rendering", async () => {
      const { c, page } = await ctx(false);
      const cases = [
        ["/departamento.html?dept=shoes&nav=1&u=women&t=botas-y-botines", "/departamento.html?dept=shoes&t=botas-y-botines&para=women"],
        ["/departamento.html?dept=perfumes&nav=1&t=fragancia", "/departamento.html?dept=perfumes"],
        ["/departamento.html?dept=perfumes&nav=1&t=cuidado-corporal", "/departamento.html?dept=perfumes&a=cuidado"],
        ["/departamento.html?dept=shoes&nav=1&b=jordan%7Cnike&z=US%209&sort=low", "/departamento.html?dept=shoes&b=jordan"],
        ["/departamento.html?dept=women&nav=1&o=1", "/departamento.html?dept=women&ver=ofertas"],
        ["/departamento.html?dept=shoes&u=men&s=chelsea", "/departamento.html?dept=shoes&para=men"],
      ];
      for (const [from, to] of cases) {
        await page.goto(BASE + from, { waitUntil: "domcontentloaded" });
        await page.waitForURL((u) => !/[?&](nav|u|s|z|sort|o)=/.test(u.search), { timeout: 15000 });
        assert.equal(page.url(), BASE + to, from);
      }
      await page.waitForSelector("#rails .rail-sec .card:not(.sk)", { timeout: 60000 });
      assert.equal(await page.$("#nf"), null);
      await c.close();
    });
    await check("browser phone 390: Ofertas keeps its own category pills and filters inside the chosen category (Mujer / Hombre / Niños, the bar on that category only); Ropa Interior keeps its own filters (no second rendering); ?ver=type:bra opens Lencería's own Explorar todo", async () => {
      const { c, page } = await ctx(false);
      const errors = []; page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(BASE + "/ofertas.html?vista=categoria&cat=zapatos", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#cats button[data-cat="zapatos"][aria-pressed="true"]', { timeout: 60000 });
      await page.waitForSelector("#nfAud .nf-pill", { timeout: 60000 });
      assert.equal(await page.evaluate(() => window.AriaNFHost.src), "ofertas=1&cat=zapatos");
      assert.equal(await page.$$eval("#cats", (x) => x.length), 1, "a second rendering of the category pills");
      await page.goto(BASE + "/ropa-interior.html?ver=type:bra#mujer", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const s = document.getElementById("w-fType"); return s && s.value === "type:bra" && document.querySelectorAll("#w-grid .card, #w-grid a").length > 0; }, null, { timeout: 60000 });
      assert.equal(await page.$("#nf"), null);
      assert.deepEqual(errors, []);
      await c.close();
    });
    /* ---------- the bar, where a page has no filters of its own ---------- */
    const LISTINGS = [
      ["tienda", "/tienda.html?tienda=macys"],
      ["marca", "/marca.html?marca=nike"],
      ["search", "/search.html?q=" + encodeURIComponent("mochila") + "&resultados=1"],
    ];
    for (const [name, path] of LISTINGS) {
      await check(`browser phone 390: ${name} has the type pills and the dropdown bar; two values of one facet stack as two chips; results are one carousel; no zero option; no checkbox; no catalogue`, async () => {
        const { c, page, reqs } = await ctx(false);
        const errors = []; page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelectorAll("#nfPills .nf-pill").length > 1, null, { timeout: 60000 });
        const btns = await page.$$eval("#nfBar .nf-dd:not([hidden]) .nf-btn span", (x) => x.map((e) => e.textContent));
        assert.ok(btns.includes("Filtrar") && btns.includes("Ordenar") && btns.includes("Talla") || btns.includes("Precio"), btns.join(" | "));
        /* Two values of the multi facet the page offers: Marca, else Talla, else Precio. */
        /* The unfiltered total: the «Todo» pill with nothing selected. */
        const total = await page.evaluate(() => window.AriaNF.data().tAll);
        assert.ok(total > 0, "no unfiltered total");
        const k = await page.evaluate(() => ["b", "z", "p"].find((k) => { const d = document.querySelector('[data-dd="' + k + '"]'); return d && !d.hidden; }));
        assert.ok(k, "no multi-value facet offered");
        await page.tap(`[data-nf-btn="${k}"]`);
        await page.waitForSelector(`.nf-pan [data-nf-${k}]`);
        assert.equal(await page.$$eval(".nf-pan button small", (s) => s.filter((x) => /^0$/.test(x.textContent.trim())).length), 0, "an option at zero");
        await page.tap(`.nf-pan [data-nf-${k}]`);
        await page.waitForFunction((k) => document.querySelectorAll('[data-nf-x="' + k + '"]').length === 1 && !/Cargando/.test(document.getElementById("nfCount").textContent), k, { timeout: 60000 });
        const second = await page.$(`.nf-pan [data-nf-${k}][aria-pressed="false"]`);
        if (second) {
          await second.tap();
          await page.waitForFunction((k) => document.querySelectorAll('[data-nf-x="' + k + '"]').length === 2 && !/Cargando/.test(document.getElementById("nfCount").textContent), k, { timeout: 60000 });
        }
        await page.tap(".nf-pan [data-nf-done]");
        await page.waitForSelector("#nfRail .card", { timeout: 60000 });
        /* The filtered set is the true intersection, shown as such:
           fewer than the unfiltered total, the server's own count on the
           count line and the rail header, and every card in it carries a
           chosen value (a brand facet: the card's brand). */
        const shown = await page.evaluate(async () => {
          const d = window.AriaNF.data(), st = window.AriaNF.state();
          const server = await fetch(window.AriaNF.url()).then((r) => r.json());
          const digits = (t) => Number(String(t || "").replace(/[^0-9]/g, ""));
          const brands = (server.cards || []).map((c) => String(c.b || c.brand || "").trim().toLowerCase());
          return { count: d.count, server: server.count, line: digits(document.getElementById("nfCount").textContent),
            head: digits(document.getElementById("nfN").textContent), title: document.getElementById("nfTitle").textContent,
            cards: document.querySelectorAll("#nfRail .card").length, page: (server.cards || []).length, chosen: st.b, brands };
        });
        assert.ok(shown.count > 0 && shown.count < total, `${name}: filtered ${shown.count} is not under the unfiltered ${total}`);
        assert.equal(shown.count, shown.server, "the page's count is not the server's");
        assert.equal(shown.line, shown.count, "the count line does not show the filtered count");
        assert.equal(shown.head, shown.count, "the rail header does not show the filtered count");
        assert.equal(shown.cards, shown.page, "the carousel does not hold the filtered page");
        if (k === "b") {
          for (const b of shown.brands) assert.ok(shown.chosen.includes(b), `${name}: a card of ${b} under ${shown.chosen.join(" + ")}`);
        }
        const rows = await page.$$eval("#nfRail .card", (cs) => new Set(cs.map((x) => Math.round(x.getBoundingClientRect().top))).size);
        assert.equal(rows, 1, "cards in more than one row");
        assert.match(page.url(), new RegExp("[?&]f?" + k + "="));
        assert.equal(await page.$$eval('input[type="checkbox"]', (x) => x.filter((e) => e.offsetParent).length), 0, "a visible checkbox");
        if (SHOT) await page.screenshot({ path: join(SHOT, "nav2-" + name + ".png") });
        /* Clearing it all brings the page's own landing back. */
        const clear = await page.$("[data-nf-clear]");
        if (clear) await clear.tap(); else await page.tap('[data-nf-x]');
        await page.waitForFunction(() => !document.documentElement.classList.contains("nf-on"), null, { timeout: 60000 });
        assert.deepEqual(reqs.filter((u) => /-catalog\.json|department-cache|auto-cache\.json|catalog-index\.json|\/_fn\//.test(u)), [], "a catalogue file was requested");
        assert.deepEqual(errors, []);
        await c.close();
      });
    }
    /* ---------- no dead ends, in the browser (#443 c.6623258189) ---------- */
    const keyClubOut = async (page, where) => {
      const tabs = await page.$$eval("[data-nm] .nm-tab", (as) => as.map((a) => a.textContent.trim()));
      assert.ok(tabs.length >= 10 && !tabs.some((x) => /Key Club/i.test(x)), where + ": tab row " + tabs.join(" · "));
      assert.ok(await page.isVisible("#utilityBar [data-key-club]"), where + ": the utility bar's «Aria Key Club» is not visible");
      assert.match(await page.textContent("#utilityBar [data-key-club]"), /Aria Key Club/);
    };
    const landsOnCategory = async (page, k) => {
      await page.waitForURL(new RegExp("/ofertas\\.html\\?vista=categoria&cat=" + k + "$"));
      await page.waitForSelector('#cats button[data-cat="' + k + '"][aria-pressed="true"]', { timeout: 30000 });
    };
    await check("browser desktop 1366: Key Club is out of the tab row and in the utility bar; hover Ofertas lists its categories with counts (no Secciones, no lone pool); a category opens its real Ofertas view", async () => {
      const { c, page, reqs } = await ctx(true);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.waitForLoadState("load");
      await keyClubOut(page, "1366");
      if (SHOT) await page.screenshot({ path: join(SHOT, "hdrfix-tabrow-1366.png"), clip: { x: 0, y: 0, width: 1366, height: 200 } });
      await page.hover('[data-nm-tab="ofertas"]');
      await flyoutOpen(page, "Ofertas por categoría");
      const cols = await page.$$eval("#nmFlyout .nmf-col h3", (h) => h.map((x) => x.textContent));
      assert.deepEqual(cols, ["Ofertas por categoría"]);
      const leaves = await page.$$eval('#nmFlyout [data-nm-col="Ofertas por categoría"] li a', (as) => as.map((a) => [a.firstChild.textContent, a.getAttribute("href"), Number(((a.querySelector("small") || {}).textContent || "0").replace(/\D/g, ""))]));
      assert.ok(leaves.length - 1 >= 8, leaves.length + " leaves");
      for (const [l, h, n] of leaves.slice(0, -1)) { assert.match(h, /^\/ofertas\.html\?vista=categoria&cat=[a-z_]+$/, l); assert.ok(n > 0, l + ": no count"); }
      assert.deepEqual(leaves[leaves.length - 1].slice(0, 2), ["Ver todas las ofertas", "/ofertas.html"]);
      if (SHOT) await page.screenshot({ path: join(SHOT, "hdrfix-ofertas-1366.png") });
      const k = OFERTAS_CATS[1].key;
      await Promise.all([landsOnCategory(page, k), page.click('#nmFlyout [data-nm-col="Ofertas por categoría"] a[href$="cat=' + k + '"]')]);
      assert.deepEqual(reqs.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested");
      await c.close();
    });
    await check("browser desktop 1366: audit every tab -- each opens columns of 2+ leaves or a direct link, never a placeholder", async () => {
      const { c, page } = await ctx(true);
      await page.goto(BASE + "/departamento.html?dept=shoes", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      for (const t of B.menu.tabs) {
        await page.click('[data-nm-tab="' + t.k + '"]');
        await page.waitForSelector("#nmFlyout:not([hidden]) .nmf-col");
        const got = await page.$$eval("#nmFlyout .nmf-col", (cs) => cs.map((x) => ({ h: x.getAttribute("data-nm-col"), leaves: x.querySelectorAll("li a").length, head: !!x.querySelector("h3 a") })));
        assert.equal(await page.$("#nmFlyout .nmf-msg"), null, t.label + ": a placeholder");
        assert.equal(got.length, t.cols.length, t.label);
        for (const col of got) assert.ok(col.leaves >= 2 || (col.leaves === 0 && col.head), `${t.label} > ${col.h}: ${col.leaves} leaves`);
        assert.ok(!/Secciones/.test(await page.textContent("#nmFlyout")), t.label + " 1366: «Secciones» in the flyout");
        if (SHOT && ["mujer", "hombre", "ninos"].includes(t.k)) await page.screenshot({ path: join(SHOT, "nosecc-" + t.k + "-1366.png") });
        await page.keyboard.press("Escape");
        await page.waitForSelector("#nmFlyout", { state: "hidden" });
      }
      await c.close();
    });
    await check("browser phone 390: Key Club is out of the tab row and in the utility bar; a tap on Ofertas opens straight on its categories (no drill, no Secciones); a category opens its real Ofertas view", async () => {
      const { c, page, reqs } = await ctx(false);
      await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      await page.waitForLoadState("load");
      await keyClubOut(page, "390");
      if (SHOT) {
        await page.screenshot({ path: join(SHOT, "hdrfix-tabrow-390.png"), clip: { x: 0, y: 0, width: 390, height: 220 } });
        await page.$eval("[data-nm] .nm-in", (r) => { r.scrollLeft = r.scrollWidth; });
        await page.screenshot({ path: join(SHOT, "hdrfix-tabrow-390-end.png"), clip: { x: 0, y: 0, width: 390, height: 220 } });
      }
      await page.$eval('[data-nm-tab="ofertas"]', (a) => a.scrollIntoView({ inline: "center", block: "nearest" }));
      await page.tap('[data-nm-tab="ofertas"]');
      const lvl = '#nmFlyout [data-nm-lvl="0"]:not([hidden])';
      await page.waitForSelector(lvl + ' li a[href*="vista=categoria&cat="]', { timeout: 15000 });
      assert.equal(await page.$("#nmFlyout [data-nm-l0]"), null, "a drill screen in front of the categories");
      assert.equal(await page.$("#nmFlyout [data-nm-back]"), null, "a back button with nowhere to go back to");
      const rows = await page.$$eval(lvl + " li a", (as) => as.filter((a) => a.getBoundingClientRect().height > 0).map((a) => [a.firstChild.textContent, a.getAttribute("href"), Number(((a.querySelector("small") || {}).textContent || "0").replace(/\D/g, ""))]));
      assert.equal(rows.length, OFERTAS_CATS.length + 1);
      for (const [l, h, n] of rows.slice(0, -1)) { assert.match(h, /cat=[a-z_]+$/, l); assert.ok(n > 0, l); }
      if (SHOT) await page.screenshot({ path: join(SHOT, "hdrfix-ofertas-390.png") });
      const k = OFERTAS_CATS[0].key, a = lvl + ' a[href$="cat=' + k + '"]';
      await Promise.all([landsOnCategory(page, k), page.tap(a)]);
      if (SHOT) await page.screenshot({ path: join(SHOT, "hdrfix-ofertas-390-landed.png") });
      assert.deepEqual(reqs.filter((u) => CATALOG_RX.test(u)), [], "a catalogue file was requested");
      await c.close();
    });
    await check("browser phone 390: audit the drill-down of every tab -- each row drills into 2+ leaves or is a link; never a placeholder or a one-row screen", async () => {
      const { c, page } = await ctx(false);
      await page.goto(BASE + "/departamento.html?dept=shoes", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
      const url0 = page.url();
      for (const t of B.menu.tabs) {
        await page.$eval('[data-nm-tab="' + t.k + '"]', (a) => a.scrollIntoView({ inline: "center", block: "nearest" }));
        await page.tap('[data-nm-tab="' + t.k + '"]');
        await page.waitForSelector("#nmFlyout:not([hidden]) .nmf-drill > *");
        assert.equal(await page.$("#nmFlyout .nmf-msg"), null, t.label + ": a placeholder");
        const leavesIn = (sel) => page.$$eval(sel + " li a", (as) => as.filter((a) => a.getBoundingClientRect().height > 0).length);
        if (!(await page.$("#nmFlyout [data-nm-l0]"))) {
          assert.ok(await leavesIn('#nmFlyout [data-nm-lvl="0"]') >= 2, t.label + ": its one list");
          assert.ok(!/Secciones/.test(await page.textContent("#nmFlyout")), t.label + " 390: «Secciones» in the sheet");
        } else {
          const rows = await page.$$eval("#nmFlyout [data-nm-l0] > li > .nmf-go", (xs) => xs.map((x) => ({ tag: x.tagName, go: x.getAttribute("data-nm-go"), href: x.getAttribute("href"), text: x.textContent })));
          assert.equal(rows.length, t.cols.length, t.label);
          assert.ok(!rows.some((r) => /Secciones/.test(r.text)), t.label + " 390: a «Secciones» row");
          for (const [i, c] of t.cols.entries()) {
            const small = rows[i].text.slice(c.h.length);
            if (isBrandCol(c.h)) assert.equal(small, c.n.toLocaleString("es-PE") + " marcas", t.label + " 390: the Marcas row");
            else if (!c.n) assert.equal(small, "", `${t.label} 390 > ${c.h}: a product number on an overlapping column`);
          }
          if (SHOT && ["mujer", "hombre", "ninos"].includes(t.k)) await page.screenshot({ path: join(SHOT, "nosecc-" + t.k + "-390.png") });
          for (const r of rows) {
            if (r.tag === "A") { assert.ok(r.href && r.href !== t.href, t.label + ": a row that is the tab"); continue; }
            await page.tap('#nmFlyout [data-nm-go="' + r.go + '"]');
            const lv = '#nmFlyout [data-nm-lvl="' + r.go + '"]:not([hidden])';
            await page.waitForSelector(lv);
            assert.ok(await leavesIn(lv) >= 2, `${t.label} > ${t.cols[r.go].h}: a one-row screen`);
            await page.tap(lv + " [data-nm-back]");
            await page.waitForSelector("#nmFlyout [data-nm-l0]:not([hidden])");
          }
        }
        await page.keyboard.press("Escape");
        await page.waitForSelector("#nmFlyout", { state: "hidden" });
      }
      assert.equal(page.url(), url0, "the audit navigated");
      await c.close();
    });
    await check("browser phone 390 + desktop 1366: a tab whose menu has no columns navigates to its page and opens no sheet", async () => {
      for (const desktop of [false, true]) {
        const { c, page } = await ctx(desktop);
        const m = JSON.parse(read(MENU_FILE));
        m.tabs.find((t) => t.k === "tallas-plus").cols = [];
        await page.route(/\/assets\/data\/nav-menu\.json$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(m) }));
        await page.goto(BASE + "/departamento.html?dept=shoes", { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelector("[data-nm]") && document.querySelector("[data-nm]").getAttribute("data-nm-on") === "1");
        /* The menu is in hand (the first focus fetches it), as after any hover. */
        await Promise.all([page.waitForResponse(/nav-menu\.json$/), page.evaluate(() => document.querySelector("[data-nm]").dispatchEvent(new Event("focusin")))]);
        const sheets = [];
        await page.exposeFunction("__nmSheet", () => sheets.push(1));
        await page.evaluate(() => new MutationObserver(() => { const f = document.getElementById("nmFlyout"); if (f && !f.hidden && f.textContent.trim()) window.__nmSheet(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] }));
        const sel = '[data-nm-tab="tallas-plus"]';
        await page.$eval(sel, (a) => a.scrollIntoView({ inline: "center", block: "nearest" }));
        await Promise.all([page.waitForURL(/dept=curvy$/), desktop ? page.click(sel) : page.tap(sel)]);
        assert.equal(sheets.length, 0, (desktop ? "1366" : "390") + ": a sheet opened");
        await c.close();
      }
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
