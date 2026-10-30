/* ==================================================================
   SNIPES + CAROLINA HERRERA, FROM THE 2026-10-27 PULLS (#443
   c.6457579787, orders c.6450358688 and c.6450670024).

   Pins the rules of scripts/lib/store-pull-normalize.js on fixtures
   (what a row is, which aisle, which release SKUs are cut, what is left
   out and why), the committed catalogues (real photos, prices, estimated
   weights, Spanish), the "shown, not sold" gate for the items whose sizes
   the pull did not carry (the order endpoint and the product page), and
   the wiring: registry, mirrors, storefront rails.

     node scripts/test/store-pulls-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { snipesKind, snipesDept, RELEASE_RX, normalizeSnipes, normalizeCarolinaHerrera, chDept } from "../lib/store-pull-normalize.js";
import { isSizesPending, sizesPendingLines, sizesPendingKey } from "../lib/sizes-pending.js";
import { RETAILERS } from "../lib/retailers.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
const row = (o) => ({ type: "product", status: "ok", currency: "USD", inStock: true, availability: "in_stock",
  image: "https://www.snipesusa.com/img/a.jpg", images: ["https://www.snipesusa.com/img/a.jpg"], price: 100, sku: String(Math.random()), url: "https://www.snipesusa.com/x.html", ...o });

await check("SNIPES aisles come from the name: shoe lines, garments that borrow a shoe's name, caps, underwear, accessories", () => {
  const cases = [
    ["Air Force 1 '07", "footwear"], ["Grade School 990v6", "footwear"], ["Shai 001", "footwear"], ["6 Rings", "footwear"],
    ["Air Max 90 \"Denim\"", "footwear"], ["LeBron \"Shoe Bag\" Basketball T-Shirt", "apparel"], ["Adilenium Season 6 Faux Suede Track Top", "apparel"],
    ["59Fifty New York Yankees Fitted Hat", "headwear"], ["Elite 2.0 Cushioned Crew Socks (1 Pair)", "underwear"],
    ["Smiley 5 Pack Jibbitz Charms", "accessories"], ["Borealis Backpack", "bags"], ["Crep Protect Cure Travel Kit", "accessories"],
  ];
  for (const [n, k] of cases) assert.equal(snipesKind(n, "", ""), k, n);
  assert.equal(snipesKind("Kool Aid Half Stripe (L)", "", "Ethika"), "underwear");
  assert.equal(snipesDept("footwear", true), "calzado_ninos");
  assert.equal(snipesDept("apparel", false), "ropa");
});

await check("hyped release SKUs are cut, regular models are not", () => {
  for (const n of ["Air Jordan 1 Retro High OG \"Flight Club\"", "Air Max Goadome Low SP", "Big Kids' Air Jordan 1 Retro Low OG"]) assert.ok(RELEASE_RX.test(n), n);
  for (const n of ["Tokyo", "Air Jordan 1 Low SE", "Air Force 1 '07", "Samba OG"]) assert.ok(!RELEASE_RX.test(n), n);
});

await check("a row is kept only with a name, a real https photo, a price and stock; nothing is marked on sale", () => {
  const { departments, skipped, released } = normalizeSnipes([
    row({ name: "Air Force 1 '07" }),
    row({ name: "No Price", price: null }),
    row({ name: "No Photo", image: "http://x/a.jpg", images: [] }),
    row({ name: "Gone", inStock: false, availability: "out_of_stock" }),
    row({ name: "Air Jordan 1 Retro High OG" }),
    row({ name: "59Fifty Fitted Hat", description: "0" }),
  ]);
  const items = Object.values(departments).flatMap((d) => d.items);
  assert.deepEqual(items.map((i) => i.name).sort(), ["59Fifty Fitted Hat", "Air Force 1 '07"]);
  assert.deepEqual(skipped, { "no price": 1, "no photo": 1, "out of stock": 1 });
  assert.equal(released.length, 1);
  assert.ok(items.every((i) => i.onSale === false && !("originalPrice" in i)), "a was-price was invented");
  assert.equal(items.find((i) => i.name === "Air Force 1 '07").sizesPending, true);
  assert.equal(items.find((i) => i.name.startsWith("59Fifty")).sizesPending, undefined, "a cap waits for sizes");
  assert.equal(items.find((i) => i.name.startsWith("59Fifty")).description, "", "\"0\" kept as a description");
});

await check("Carolina Herrera: the storefront's own category; jewellery and bags out of ready-to-wear, a gown with a belt stays a gown", () => {
  assert.equal(chDept("https://www.carolinaherrera.com/us/en/p-ready-to-wear/x", "V-Neck Gown with Stand Collar and Self Belt"), "ropa");
  assert.equal(chDept("https://www.carolinaherrera.com/us/en/p-ready-to-wear/x", "Calla Lily Earrings"), "accesorios");
  assert.equal(chDept("https://www.carolinaherrera.com/us/en/p-fragrance/x", "Good Girl"), "fragancias");
  assert.equal(chDept("https://www.carolinaherrera.com/us/en/p-ready-to-wear/x", "Floral-Embroidered Slingback Pumps"), "zapatos");
  assert.equal(chDept("https://www.carolinaherrera.com/us/en/p-ready-to-wear/x", "Spazzolato Leather Tall Lace-Up Boots"), "zapatos");
  const { departments } = normalizeCarolinaHerrera([
    row({ name: "Strapless Ball Gown", url: "https://www.carolinaherrera.com/us/en/p-ready-to-wear/a", description: "Carolina Herrera" }),
    row({ name: "Good Girl 2.7 oz", url: "https://www.carolinaherrera.com/us/en/p-fragrance/b" }),
  ]);
  assert.equal(departments.ropa.items[0].sizesPending, true);
  assert.equal(departments.ropa.items[0].description, "", "the brand name passed off as copy");
  assert.equal(departments.fragancias.items[0].sizesPending, undefined);
});

const cat = (k) => Object.values(JSON.parse(read(k + "-catalog.json")).retailers[k].departments).flatMap((d) => d.items);
await check("the committed catalogues: real photos, prices, estimated weights, Spanish only, sizes never invented", () => {
  for (const k of ["snipes", "carolinaherrera"]) {
    const items = cat(k);
    assert.ok(items.length > (k === "snipes" ? 4500 : 200), k + " lost its products");
    for (const it of items) {
      assert.match(it.image, /^https:\/\//, it.name);
      assert.ok(it.price > 0, it.name);
      assert.ok(it.weightKg > 0 && it.weightEstimated === true, it.name + " weight");
      assert.ok(!it.description || it.description_en, it.name + " shows English");
      assert.ok(!it.sizes && !it.availableSizes, it.name + " carries a size list nobody pulled");
      assert.equal(it.retailer, k);
    }
  }
  const snipes = cat("snipes");
  assert.ok(!snipes.some((i) => RELEASE_RX.test(i.name) && i.sizesPending && /retro (high|low) og/i.test(i.name)), "a release SKU is listed");
});

await check("shown, not sold: the order endpoint refuses an item whose sizes are pending, and sells a cap", () => {
  const shoe = cat("snipes").find((i) => i.sizesPending);
  const cap = cat("snipes").find((i) => !i.sizesPending);
  assert.ok(isSizesPending("snipes", shoe.name));
  assert.ok(isSizesPending("SNIPES", "  " + shoe.name.toUpperCase() + " "), "the key is case- and space-blind");
  assert.ok(!isSizesPending("snipes", cap.name));
  assert.equal(sizesPendingLines([{ retailer: "snipes", title: shoe.name }, { retailer: "snipes", title: cap.name }]).length, 1);
  /* Every builder's pending items share the one list (Calzedonia: scripts/build-calzedonia-intimissimi-catalogs.mjs). */
  const pending = cat("snipes").concat(cat("carolinaherrera"), cat("calzedonia"), cat("intimissimi")).filter((i) => i.sizesPending).map((i) => sizesPendingKey(i.retailer, i.name));
  assert.deepEqual(JSON.parse(read("assets/data/sizes-pending.json")).sort(), [...new Set(pending)].sort(), "the page's list and the catalogues disagree");
  const oc = read("netlify/functions/orders-create.js");
  assert.ok(oc.includes("sizesPendingLines(sentItems)") && oc.indexOf("sizesPendingLines(sentItems)") < oc.indexOf("perfumeCapState(sentItems)"), "orders-create does not refuse before it charges");
});

await check("wiring: registry rows, the app's mirror and catalogue lists, the storefronts, the label maps, what Aria knows", async () => {
  assert.equal(RETAILERS.snipes.label, "SNIPES");
  assert.equal(RETAILERS.carolinaherrera.tier, "luxury");
  const bundle = read("build/" + readdirSync(join(ROOT, "build")).find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)));
  for (const k of ["snipes", "carolinaherrera"]) {
    assert.ok(bundle.includes(`${k}: { key: '${k}'`) || bundle.includes(`${k}:          { key: '${k}'`) || new RegExp(k + ":\\s+\\{ key: '" + k + "'").test(bundle), k + " not in the app's registry");
    assert.ok(bundle.includes(`'/${k}-catalog.json'`) && bundle.includes(`"/${k}-catalog.json":["${k}"]`), k + " not in CATALOGUE_FILES/SOURCE_RETAILERS");
    const stores = JSON.parse(/var STORES = (\{.*\});/.exec(read("tienda.html"))[1]);
    assert.ok(stores[k] && stores[k].files[0] === `/${k}-catalog.json`, k + " storefront");
    assert.ok(read("producto.html").includes(`"${k}": ["/${k}-catalog.json"]`), k + " product page");
    assert.ok(read("tiendas.html").includes(`tienda.html?tienda=${k}"`), k + " directory");
  }
  assert.ok(bundle.includes("'carolinaherrera','goldengoose'"), "Carolina Herrera is not in the Aria Luxury strip");
  const K = await import("../../netlify/functions/_store-knowledge.js");
  for (const k of ["snipes", "carolinaherrera"]) assert.equal(K.STORE_KNOWLEDGE[k].product_count, cat(k).length, k + ": Aria quotes the wrong catalogue size");
});

await check("the storefronts: SNIPES opens on Nike, Jordan, adidas, New Balance, then its aisles; no Ofertas rail made up; Carolina Herrera opens on Zapatos", () => {
  const s = JSON.parse(read("assets/tienda/snipes/index.json"));
  const keys = s.rails.map((r) => r.key);
  assert.deepEqual(keys.slice(0, 4), ["b-nike", "b-jordan", "b-adidas", "b-new-balance"]);
  assert.ok(!keys.includes("ofertas"), "an Ofertas rail with no sale data");
  for (const d of ["d-calzado", "d-calzado_ninos", "d-ropa", "d-gorras"]) assert.ok(keys.includes(d), d);
  assert.ok(s.rails[0].head.slice(0, 6).every((c) => c.image && c.price > 0));
  const c = JSON.parse(read("assets/tienda/carolinaherrera/index.json"));
  assert.deepEqual(c.rails.map((r) => r.key), ["d-zapatos", "d-ropa", "d-accesorios", "d-fragancias", "d-maquillaje"], "Zapatos first");
  const chRopa = JSON.parse(read("carolinaherrera-catalog.json")).retailers.carolinaherrera.departments.ropa.items;
  assert.deepEqual(chRopa.filter((i) => /\b(pumps?|flats?|mules?|boots?)\b/i.test(i.name)).map((i) => i.name), [], "shoes in the Ropa aisle");
});

/* ---- the product page, at phone width ---- */
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/.netlify/") || u.pathname.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return; }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
async function pdp(item) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route((url) => url.host !== new URL(BASE).host, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(join(ROOT, "assets/sections/tiendas-mall-row.jpg")) }) : r.abort());
  await pg.goto(`${BASE}/producto.html?tienda=${item.retailer}&producto=${encodeURIComponent(item.name)}`, { waitUntil: "load" });
  await pg.waitForSelector("#buy-box button, #buy-box .sizes-pending-note", { timeout: 30000 });
  return { pg, ctx };
}
await check("the product page: a SNIPES sneaker says «Tallas por confirmar» and offers no cart; a cap sells", async () => {
  const shoe = cat("snipes").find((i) => i.sizesPending && i.description_en);
  const { pg, ctx } = await pdp(shoe);
  const s = await pg.evaluate(() => ({ btn: document.querySelector("#add-cart-btn").textContent, disabled: document.querySelector("#add-cart-btn").disabled,
    note: (document.querySelector(".sizes-pending-note") || {}).textContent || "", desc: document.body.innerText }));
  assert.equal(s.btn, "Tallas por confirmar");
  assert.equal(s.disabled, true);
  assert.match(s.note, /confirmando las tallas/);
  assert.ok(s.desc.includes(shoe.description.slice(0, 30)), "the Spanish description is not shown");
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + "-pdp-shoe.png" });
  await ctx.close();
  const cap = cat("snipes").find((i) => !i.sizesPending);
  const c = await pdp(cap);
  assert.equal(await c.pg.evaluate(() => document.querySelector("#add-cart-btn").disabled), false);
  await c.ctx.close();
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
