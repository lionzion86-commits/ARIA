#!/usr/bin/env node
/* ==================================================================
   THE MOMS FEEDING RAIL HOLDS FEEDING GEAR (#443, Danny's ruling: a
   shopper saw «Alimentación» (4) holding a Munchkin «Peek-A-Boo Penguin
   Bath Toy» and a Dr. Brown's bath toy; the type carried descaler,
   HEPA filters, detergent tablets and a cookbook too).

     - the type reads «Biberones y alimentación del bebé» wherever it
       renders (department rails, store pills, the app's aisle), and the
       bare «Alimentación» label is gone;
     - every record typed as feeding gear names feeding gear by its own
       title noun -- no toy, bath, filter, descaler, detergent, tablet,
       cookbook, replacement or part;
     - the catalogue is what scripts/lib/moms-truth.js says each product
       is (a re-pull that brings the coarse types back fails here until
       scripts/apply-moms-truth.mjs runs again);
     - the non-products (/not-sold.js, baby stores only) are off every
       catalogue and every generated output, and are kept in
       data/purges/moms-truth-2026-11-03.json;
     - the bath toys sit in «Baño del bebé»;
     - 390px: the moms page shows the renamed rail and no bare
       «Alimentación».

     node scripts/test/moms-feeding-truth-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/moms-feeding-truth-tests.mjs   (also saves the 390px screenshots)
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
await import("../../not-sold.js");
const NS = globalThis.AriaNotSold;
const T = await import("../lib/moms-truth.js");
const { momsRecords } = await import("../apply-moms-truth.mjs");
const dept = await import("../../netlify/functions/_department-core.js");
const purge = await import("../purge-not-sold.mjs");

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const MOMS = json("moms-catalog.json");
const RECORDS = momsRecords(MOMS);
const REPORT_FILE = "data/purges/moms-truth-2026-11-03.json";
const NEW = T.FEEDING_LABEL;
const OLD = "Alimentación";

/* The product a title is named for: a bundle's first product, the name
   before "with", "for", "+", "&", "and", a comma or a dash. */
function headClause(title) {
  let t = String(title || "");
  const m = /\b(?:bundle|kit)\s*[:：]\s*(.+)$/i.exec(t);
  if (m) t = m[1];
  return t.split(/\s+(?:with|for|and|ft\.)\s+|\s+[+&|]\s+|,|\s+[-–—]\s+/i)[0];
}

await check(`the label: the feeding type reads «${NEW}» in the department dictionary, the store pills and the app; nowhere «${OLD}»`, () => {
  assert.equal(NEW, "Biberones y alimentación del bebé");
  assert.equal(dept.typeLabel("ALIMENTACION"), NEW);
  assert.equal(dept.typeKeyOf({ type: "ALIMENTACION" }).label, NEW);
  const tienda = readFileSync(join(ROOT, "tienda.html"), "utf8");
  const m = /var MOMS_TYPE_LABELS = (\{[\s\S]*?\});/.exec(tienda);
  assert.ok(m, "tienda.html MOMS_TYPE_LABELS moved");
  const labels = new Function("return " + m[1])();
  assert.deepEqual(labels, T.MOMS_TYPE_LABELS, "tienda.html's moms labels differ from scripts/lib/moms-truth.js");
  for (const [code, label] of Object.entries(T.MOMS_TYPE_LABELS)) {
    if (code === "SILLA_DE_COMER") continue; /* the department titles it «Silla De Comer», as it always has */
    assert.equal(dept.typeKeyOf({ type: code }).label, label, code);
  }
  const index = readFileSync(join(ROOT, "index.html"), "utf8");
  const bundle = /build\/app-([0-9a-f]{16})\.js/.exec(index)[1];
  const src = readFileSync(join(ROOT, "build", "app-" + bundle + ".js"), "utf8");
  assert.match(src, /\{ key: 'feeding',\s+label: 'Biberones y alimentación del bebé',/);
  assert.ok(!/label: 'Alimentación'/.test(src), "the app still labels an aisle «Alimentación»");
});

await check("every record typed as feeding gear names feeding gear: no toy, bath, filter, descaler, detergent, tablet, cookbook, replacement or part in its title's noun", () => {
  const bad = [];
  let n = 0;
  for (const { retailer, item } of RECORDS) {
    if (item.type !== T.FEEDING_TYPE) continue;
    n++;
    const head = headClause(item.name);
    const hit = T.NOT_FEEDING_NOUN_RX.exec(head);
    if (hit) bad.push(`${retailer}: ${item.name} («${hit[0]}»)`);
    if (T.momsTypeOf(item) !== T.FEEDING_TYPE) bad.push(`${retailer}: ${item.name} (the rule reads ${T.momsTypeOf(item)})`);
  }
  assert.ok(n > 300, "feeding records: " + n);
  assert.deepEqual([...new Set(bad)], []);
});

await check("the catalogue is what the rule says each product is (a re-pull's coarse types fail here until scripts/apply-moms-truth.mjs runs)", () => {
  const off = [];
  for (const { retailer, item } of RECORDS) {
    const t = T.momsTypeOf(item);
    if (t !== item.type) off.push(`${retailer}: ${item.name} is ${item.type}, the rule says ${t}`);
    if (!Object.prototype.hasOwnProperty.call(T.MOMS_TYPE_LABELS, item.type)) off.push(`${retailer}: ${item.name} has no moms type (${item.type})`);
  }
  assert.deepEqual([...new Set(off)], []);
});

await check("the shopper's finds: both bath toys, and Munchkin's and Dr. Brown's other bath toys, are «Baño del bebé»", () => {
  const typeOf = (r, t) => RECORDS.filter((x) => x.retailer === r && x.item.name === t).map((x) => x.item.type);
  const munchkin = MOMS.retailers.munchkin.departments.moms.items;
  assert.ok(munchkin.some((i) => i.name === "Peek-A-Boo Penguin Bath Toy"), "the penguin is gone from the catalogue");
  for (const [r, t] of [["munchkin", "Peek-A-Boo Penguin Bath Toy"], ["drbrowns", "Dr. Brown’s™ CleanUp™ Pour & Roar Watering Can Bath Toy"],
    ["munchkin", "Fishin’™ Bath Toy"], ["munchkin", "Bath Beats™ Musical Bath Toy Gift Set"], ["munchkin", "Ocean™ Bath Squirts, 8pk"]]) {
    const ts = typeOf(r, t);
    assert.ok(ts.length, t + " missing");
    assert.deepEqual([...new Set(ts)], ["BANO_BEBE"], t);
  }
  assert.equal(T.MOMS_TYPE_LABELS.BANO_BEBE, "Baño del bebé");
});

await check("the non-products are named by /not-sold.js at the baby stores only: a filter, a descaler or a charger elsewhere is a product", () => {
  const yes = {
    "Replacement HEPA Filter For The Bottle Washer Pro®": "repuesto",
    "Safe & Effective Descaler Liquid": "limpieza",
    "Universal Detergent Tablets for Bottle Washer Pro and ALL BRANDS OF Bottle Washers, 120 Tablets per pack": "limpieza",
    "One Step™ Baby Brezza Baby Food Recipes Cookbook": "publicacion",
    "Elvie Stride Valves (3 pack)": "repuesto",
    "Owlet360™ Annual Plan": "servicio",
    "SOONTRANS Gaming Chair, Blue Gamer Chair with Footrest, Ergonomic Office Chair for Adult, Reclining Computer Chair with Massage Lumbar, Adjustable Game Chair": "ajeno",
  };
  for (const [t, k] of Object.entries(yes)) {
    assert.equal(NS.notSoldKind(t, "babybrezza"), k, t);
    assert.equal(NS.notSoldKind(t), "", t + " (no store)");
    assert.equal(NS.isNotSold({ title: t, retailer: "bestbuy" }), false, t + " at Best Buy");
  }
  /* A part or a consumable named after its product stays with it. */
  for (const t of ["Bundle: Bottle Washer Pro + Universal Detergent Tablets Pack", "Bundle: Sterilizer Dryer Advanced + Extra HEPA Filter",
    "Jeep Stroller Jogger with Car Seat Adapter, Charcoal Galaxy", "Momcozy Smart Wearable Baby Thermometer & Signal Booster Set",
    "One Step™ Baby Bottle Sterilizer and Dryer Advanced - Electric steam sterilizer with HEPA Filter", "Reusable Baby Food Pouches, 10 Pack",
    "Elvie Pump and Extra Set of Washable Parts", "Diaper Pail Bundle: Diaper Pail + 45 Trash Bags + 4 Deodorizer Packs"])
    assert.equal(NS.isNotSold({ title: t, retailer: "momcozy" }), false, t);
  /* Food is food at every store. */
  for (const t of ["Milkmakers® Lactation Crisps, Cheddar, 6ct", "Sweetie Pie Nausea Candies – Ginger Peach", "Hydration Drink Mix", "Dr. Brown's™ Electrolyte Solution – Orange"])
    assert.ok(NS.isNotSold({ title: t, retailer: "walmart" }), t);
});

/* Every product the ruling took off, from its report. */
const REPORT = existsSync(join(ROOT, REPORT_FILE)) ? json(REPORT_FILE) : null;
const BABY = new Set(NS.BABY_STORES);
const REMOVED = REPORT ? REPORT.products.filter((p) => BABY.has(p.retailer)) : [];

await check("the purge report keeps each removed product whole, with its reason; nothing in the moms catalogue is still off sale", () => {
  assert.ok(REPORT, REPORT_FILE + " missing");
  assert.ok(REMOVED.length >= 150, "removed: " + REMOVED.length);
  for (const p of REMOVED) {
    assert.ok(p.kind && NS.NOT_SOLD[p.kind], p.title + ": no reason");
    assert.ok(p.record && p.record.name === p.title, p.title + ": record not kept");
  }
  for (const k of ["repuesto", "limpieza", "publicacion", "servicio", "ajeno", "alimento", "farmacia"]) assert.ok(REMOVED.some((p) => p.kind === k), "no " + k);
  const still = RECORDS.filter(({ retailer, item }) => NS.isNotSold({ title: item.name, retailer })).map((x) => x.retailer + ": " + x.item.name);
  assert.deepEqual(still, []);
  const raw = readFileSync(join(ROOT, "moms-catalog.json"), "utf8");
  assert.equal(purge.purgeText(raw, "moms-catalog.json").cut.length, 0);
});

/* The generated outputs: every surface the builders write. */
const OUT_DIRS = ["assets/sections", "assets/tienda", "assets/search", "assets/home", "assets/ofertas", "assets/pdp", "assets/stores", "assets/brands", "assets/category", "assets/data"];
const OUT_FILES = ["ofertas-feed.json", "ofertas-feed-lite.json", "price-index.json", "moms-catalog.json"];
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.json$/.test(e.name)) yield p;
  }
}
await check("the removed products are absent from every generated output (departments, stores, search, home, Ofertas, product pages, price index, photo search)", () => {
  assert.ok(REMOVED.length, "no report");
  /* A title as a JSON file spells it: raw, or with its non-ASCII escaped. */
  const forms = (t) => { const s = JSON.stringify(t).slice(1, -1); return [s, s.replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))]; };
  const needles = REMOVED.map((p) => ({ p, f: forms(p.title).map((s) => '"' + s + '"') }));
  const files = [...OUT_DIRS.filter((d) => existsSync(join(ROOT, d))).flatMap((d) => [...walk(join(ROOT, d))]), ...OUT_FILES.map((f) => join(ROOT, f))];
  if (existsSync(join(ROOT, "visual-index"))) for (const f of readdirSync(join(ROOT, "visual-index"))) if (/\.json$/.test(f)) files.push(join(ROOT, "visual-index", f));
  assert.ok(files.length > 1000, "outputs: " + files.length);
  const hits = [];
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    for (const { p, f: fs } of needles) if (fs.some((x) => s.includes(x))) hits.push(`${f.slice(ROOT.length + 1)}: ${p.retailer} ${p.title}`);
  }
  assert.deepEqual(hits.slice(0, 20), []);
});

await check(`the generated rails: the moms department titles its feeding rail «${NEW}», carries «Baño del bebé», and no surface titles a rail, a pill or a destination «${OLD}»`, () => {
  const head = json("assets/sections/departamento/moms/head.json");
  const titles = head.rails.map((r) => r.title);
  assert.ok(titles.includes(NEW), titles.join(", "));
  assert.ok(titles.includes("Baño del bebé"), titles.join(", "));
  const bad = [];
  for (const f of [...walk(join(ROOT, "assets/sections/departamento"))].filter((f) => /head\.json$/.test(f))) {
    const h = JSON.parse(readFileSync(f, "utf8"));
    for (const r of h.rails || []) if (r.title === OLD) bad.push(f.slice(ROOT.length + 1));
  }
  const dest = readFileSync(join(ROOT, "assets/search/destinations.json"), "utf8");
  if (dest.includes(`["${OLD}",`)) bad.push("assets/search/destinations.json");
  for (const f of [...walk(join(ROOT, "assets/tienda"))].filter((f) => /index\.json$/.test(f))) {
    const s = readFileSync(f, "utf8");
    if (/"label": ?"(?:Alimentación|ALIMENTACIONs)"/.test(s)) bad.push(f.slice(ROOT.length + 1));
  }
  assert.deepEqual(bad, []);
  const mk = json("assets/tienda/munchkin/index.json");
  const cats = (mk.chips.cats || []).map((c) => c.label);
  assert.ok(cats.includes(NEW), "Munchkin's pills: " + cats.join(", "));
});

let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page check", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const handlers = {
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
    if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(""); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#dfe6f2"/></svg>';
  const SHOT = process.env.SHOT_DIR || "";
  try {
    await check(`browser 390px: departamento.html?dept=moms shows the «${NEW}» rail and «Baño del bebé», no bare «${OLD}»; Juguetes' «Baño del bebé» holds the penguin bath toy`, async () => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
      const page = await c.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${BASE}/departamento.html?dept=moms`);
      const feed = page.locator(`main#rails section.rail-sec[data-ri][aria-label="${NEW}"]`);
      await page.waitForSelector("section.rail-sec[data-ri]", { timeout: 60000 });
      /* The lower rails arrive as the page scrolls. */
      for (let i = 0; i < 40 && !(await feed.count()); i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(300); }
      await feed.waitFor({ timeout: 60000 });
      assert.equal(await feed.locator(".rail-head h2").textContent(), NEW);
      await feed.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
      if (SHOT) await page.screenshot({ path: join(SHOT, "moms-feeding-rail.png") });
      /* The lower rails arrive as the page scrolls. */
      const bath = page.locator('main#rails section.rail-sec[data-ri][aria-label="Baño del bebé"]');
      for (let i = 0; i < 40 && !(await bath.count()); i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(300); }
      await bath.waitFor({ timeout: 60000 });
      const heads = await page.$$eval("section.rail-sec .rail-head h2", (hs) => hs.map((h) => h.textContent.trim()));
      assert.ok(!heads.includes(OLD), `a rail still reads «${OLD}»: ` + heads.join(", "));
      const all = await page.evaluate(() => document.body.innerText);
      assert.ok(!new RegExp("(^|\\n)\\s*" + "Alimentación" + "\\s*(\\n|$)").test(all), `a bare «${OLD}» still renders`);
      /* A bath TOY is a toy: the product's own name puts it in Juguetes
         (the department the shopper saw it in, under «Alimentación» (4)),
         where its rail now reads «Baño del bebé». */
      await page.goto(`${BASE}/departamento.html?dept=toys`);
      await page.waitForSelector("section.rail-sec[data-ri]", { timeout: 60000 });
      const toyBath = page.locator('main#rails section.rail-sec[data-ri][aria-label="Baño del bebé"]');
      for (let i = 0; i < 60 && !(await toyBath.count()); i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(300); }
      await toyBath.waitFor({ timeout: 60000 });
      const toyHeads = await page.$$eval("main#rails section.rail-sec .rail-head h2", (hs) => hs.map((h) => h.textContent.trim()));
      assert.ok(!toyHeads.includes(OLD), `Juguetes still has a rail «${OLD}»`);
      const penguin = toyBath.locator(".card", { hasText: "Peek-A-Boo Penguin Bath Toy" });
      assert.ok(await penguin.count(), "the penguin bath toy is not in Juguetes' «Baño del bebé»");
      assert.ok(await toyBath.locator(".card", { hasText: "Pour & Roar Watering Can Bath Toy" }).count(), "Dr. Brown's bath toy is not in «Baño del bebé»");
      await toyBath.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
      await page.waitForTimeout(300);
      if (SHOT) await page.screenshot({ path: join(SHOT, "moms-bath-toy-rail.png") });
      assert.deepEqual(errors, []);
      await c.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
