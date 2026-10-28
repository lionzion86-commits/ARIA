/* ==================================================================
   SUB-CAROUSELS (#443 c.6458236993 Part 2, c.6458506223).

   Expanding a multi-family set (Zapatos, Ropa, Accesorios, Joyas,
   Carteras, Hogar) opens labelled sub-carousels, audience first, then
   type; a store's department pill that is mostly one such family
   (Walmart's Hogar) opens into its aisles. Held here: the classifiers'
   edge cases, only aisles the data fills (no "Otros" bin, none under
   SUB_MIN), the endpoint serving every sub-carousel, single-topic sets
   staying one grid, and the page drawing it all on a phone.

     node scripts/test/store-subrails-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { subRails, audienceOf, SUB_TAXONOMY, SUB_MIN } from "../lib/store-subrails.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0, skipped = 0;
const failures = [];
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === "skip") { skipped++; console.log("    skip " + name); return; }
    passed++; console.log("    ok   " + name);
  } catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const ix = (k) => JSON.parse(readFileSync(ROOT + `assets/tienda/${k}/index.json`, "utf8"));
const fn = (k) => JSON.parse(readFileSync(ROOT + `assets/tienda/_fn/${k}.json`, "utf8"));
const aisle = (fam, name) => SUB_TAXONOMY[fam].aisle({ name });

await check("the classifiers: the doctrine's shoe aisles, a dress shirt is a top, the head noun names a home piece", () => {
  assert.equal(aisle("zapatos", "Women's Slide Sandals"), "sandalias");
  assert.equal(aisle("zapatos", "Mens Plush Slippers"), "pantuflas");
  assert.equal(aisle("zapatos", "Girls Bow Ballet Dress Shoes"), "vestir");
  assert.equal(aisle("zapatos", "Women's Block Heel Pumps"), "vestir");
  assert.equal(aisle("zapatos", "Men's Chelsea Boots"), "botas");
  assert.equal(aisle("zapatos", "Women's Running Sneakers"), "zapatillas");
  assert.equal(aisle("ropa", "Mens Dress Shirts Long Sleeve Button Down"), "tops");
  assert.equal(aisle("ropa", "Summer Dresses for Women Midi Dress"), "dresses");
  assert.equal(aisle("ropa", "Women's Pajama Set Short Sleeve"), "lingerie");
  assert.equal(aisle("ropa", "Men's Hooded Sweatshirt"), "knitwear");
  assert.equal(aisle("accesorios", "Scrunchie Hair Ties 6 Pack"), "pelo");
  assert.equal(aisle("joyas", "Gold Charm Bracelet"), "pulseras");
  assert.equal(aisle("hogar", "Paper Towel Holder Countertop"), "cocina");
  assert.equal(aisle("hogar", "Bud Vase Set for Flowers, Wedding, Bathroom"), "decoracion");
  assert.equal(aisle("hogar", "Halloween Throw Pillow Cover, Jack-O'-Lantern"), "decoracion");
  assert.equal(aisle("hogar", "Sherpa Throw Blanket"), "cama");
});

await check("audience comes from the data: the title's words, then the facet, then the bucket; never a guess", () => {
  assert.equal(audienceOf({ name: "Summer Dresses for Women" }, "ropa"), "women");
  assert.equal(audienceOf({ name: "Initial Necklace for Women and Girls" }, "joyas"), "women", "an adult piece sold to both");
  assert.equal(audienceOf({ name: "Toddler Girls Dress" }, "ropa"), "kids");
  assert.equal(audienceOf({ name: "Ribbed Tank", gender: "Hombre" }, "ropa"), "men");
  assert.equal(audienceOf({ name: "Ribbed Tank", dept: "womens_tops" }, "ropa"), "women");
  assert.equal(audienceOf({ name: "Classic Tee" }, "ropa"), null);
  assert.equal(audienceOf({ name: "Classic Clog" }, "zapatos"), null);
});

await check("unisex shoes sit in both adult carousels; other silent pieces in neither", () => {
  const mk = (names) => names.map((name) => ({ name }));
  const shoes = mk([...Array(6)].map((_, i) => `Women's Running Sneaker ${i}`).concat(
    [...Array(6)].map((_, i) => `Men's Running Sneaker ${i}`), [...Array(3)].map((_, i) => `Classic Sneaker ${i}`)));
  const s = subRails(shoes, "zapatos");
  assert.deepEqual(s.map((x) => [x.audLabel, x.items.length]), [["Mujer", 9], ["Hombre", 9]]);
  const tees = mk([...Array(6)].map((_, i) => `Women's Tee ${i}`).concat([...Array(6)].map((_, i) => `Men's Tee ${i}`), [...Array(3)].map((_, i) => `Classic Tee ${i}`)));
  assert.deepEqual(subRails(tees, "ropa").map((x) => x.items.length), [6, 6]);
});

await check("only aisles the data fills: no bin, none under SUB_MIN, two carousels or none, single topics stay one grid", () => {
  let subs = 0;
  for (const k of ["walmart", "revolve", "skims", "hollister", "baublebar", "americaneagle"]) {
    const i = ix(k), f = fn(k);
    const sets = i.rails.filter((r) => r.subs).map((r) => [r.key, r.subs]).concat(
      ((i.chips || {}).depts || []).filter((d) => d.subs).map((d) => ["c-" + d.key, d.subs]));
    for (const [key, list] of sets) {
      assert.ok(list.length >= 2, `${k} ${key}: one carousel`);
      for (const s of list) {
        subs++;
        assert.ok(s.n >= SUB_MIN, `${k} ${s.k}: ${s.n}`);
        assert.notEqual(s.t, "Otros", `${k} ${s.k}`);
        assert.ok(s.k.startsWith(key + "~"), s.k);
        assert.equal((f.rails[s.k] || []).length, s.n, `${k} ${s.k}: the endpoint does not serve it`);
      }
      if (f.rails[key]) {
        const parent = new Set(f.rails[key]);
        for (const s of list) assert.ok(f.rails[s.k].every((n) => parent.has(n)), `${k} ${s.k} holds what ${key} does not`);
      }
    }
    for (const r of i.rails) if (!SUB_TAXONOMY[r.key.slice(2)]) assert.ok(!r.subs, `${k} ${r.key} is a single topic`);
  }
  assert.ok(subs > 100, `${subs} sub-carousels`);
});

await check("Walmart: Zapatos opens Mujer / Hombre / Niños; the Hogar pill opens its floor's aisles", () => {
  const w = ix("walmart");
  const shoes = w.rails.find((r) => r.key === "t-zapatos").subs;
  assert.deepEqual([...new Set(shoes.map((s) => s.a))], ["Mujer", "Hombre", "Niños"]);
  assert.equal(shoes[0].t, "Zapatillas");
  const hogar = w.chips.depts.find((d) => d.label === "Hogar").subs.map((s) => s.t);
  for (const t of ["Ropa de cama", "Toallas", "Baño", "Cocina", "Cestas y organización", "Lámparas"]) assert.ok(hogar.includes(t), t + " missing");
  assert.ok(!w.chips.depts.find((d) => d.label === "Juguetes").subs, "Juguetes is one topic");
});

/* ---------------- headless ---------------- */
await check("headless: Ver todo on Zapatos opens labelled carousels, a carousel opens its grid, back returns; the Hogar pill opens its aisles", async () => {
  const exe = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { return "skip"; } }
  const http = await import("node:http");
  const { join, extname } = await import("node:path");
  const { statSync } = await import("node:fs");
  const { handler } = await import(ROOT + "netlify/functions/tienda.js");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css" };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/.netlify/functions/exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75}'); return; }
    if (u.pathname === "/.netlify/functions/tienda") {
      const r = await handler({ httpMethod: "GET", queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(r.statusCode, { "Content-Type": "application/json" }); res.end(r.body); return;
    }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const pg = await ctx.newPage();
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await pg.route(/\.(png|jpe?g|webp|gif|svg)(\?|$)/i, (r) => r.fulfill({ status: 204, body: "" }));
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(`${base}/tienda.html?tienda=walmart`, { waitUntil: "load" });
    await pg.waitForFunction(() => document.querySelectorAll(".rail-sec .card:not(.sk)").length >= 8, null, { timeout: 30000 });
    await pg.click('.rail-ver[data-rail="t-zapatos"]');
    await pg.waitForFunction(() => document.querySelectorAll("#reGrid .sub-wrap .rail-sec .card:not(.sk)").length >= 4, null, { timeout: 30000 });
    const view = await pg.evaluate(() => ({
      auds: [...document.querySelectorAll("#reGrid .sub-aud")].map((h) => h.textContent),
      first: document.querySelector("#reGrid .sub-wrap .rail-title").textContent,
      flatCards: document.querySelectorAll("#reGrid > .card").length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    assert.deepEqual(view.auds, ["Mujer", "Hombre", "Niños"]);
    assert.equal(view.first, "Zapatillas");
    assert.equal(view.flatCards, 0, "an undifferentiated grid under the carousels");
    assert.equal(view.overflow, false, "the page scrolls sideways");
    await pg.click('#reGrid .rail-ver[data-rail="t-zapatos~women~zapatillas"]');
    await pg.waitForFunction(() => document.querySelectorAll("#reGrid > .card:not(.sk)").length > 0, null, { timeout: 30000 });
    assert.equal(await pg.textContent("#reTitle"), "Zapatillas Mujer");
    await pg.click("#reBack");
    await pg.waitForFunction(() => document.querySelectorAll("#reGrid .sub-aud").length === 3, null, { timeout: 10000 });
    await pg.click("#slAllBtn");
    await pg.waitForFunction(() => document.querySelectorAll("#reGrid > .card:not(.sk)").length > 0, null, { timeout: 30000 });
    await pg.click("#reBack");
    await pg.waitForFunction(() => document.querySelectorAll("#reGrid .sub-aud").length === 3, null, { timeout: 10000 });
    await pg.click("#reBack");
    assert.equal(await pg.evaluate(() => document.getElementById("railExpand").hidden), true, "back from the carousels closes Ver todo");
    /* The Hogar pill: its aisles in the page, then the department's grid. */
    await pg.click('.chips .chip[data-d="small_home"]');
    await pg.waitForFunction(() => document.querySelectorAll("#content .sub-wrap .rail-sec .card:not(.sk)").length >= 4, null, { timeout: 30000 });
    const aisles = await pg.evaluate(() => [...document.querySelectorAll("#content .sub-wrap .rail-title")].map((h) => h.textContent));
    assert.ok(aisles.includes("Ropa de cama") && aisles.includes("Cocina"), aisles.join(", "));
    await pg.click("#slPillAll");
    await pg.waitForFunction(() => document.querySelectorAll("#slGrid .card").length > 0, null, { timeout: 30000 });
    assert.deepEqual(errs, []);
    await ctx.close();
  } finally {
    await browser.close();
    srv.close();
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} skipped` : ""}\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
