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
import { snipesKind, snipesDept, RELEASE_RX, normalizeSnipes, normalizeCarolinaHerrera, chDept, applySnipesPass } from "../lib/store-pull-normalize.js";
import { isSizesPending, sizesPendingLines, sizesPendingKey } from "../lib/sizes-pending.js";
import { SIZES_PENDING } from "../lib/sizes-pending-data.js";
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

/* ONE-SIZE SHOES (#443, Danny's QA on #648: "we're showing shoes that
   only have one size"). The SNIPES pass reads every size button on the
   product page; the disabled ones are sold out there. Only the in-stock
   ones are `sizes` (sold); the rest of the store's run rides as
   `sizesOut` (shown, marked agotada, never sold). */
await check("the SNIPES pass: in-stock sizes are sold, the rest of the store's run is kept as sold out, nothing invented", () => {
  const run = ["M7.5/W9", "M8/W9.5", "M8.5/W10", "M9/W10.5", "M9.5/W11"];
  const deps = { calzado: { items: [
    { sku: "1", name: "Air DT Max '96", price: 89.99 },
    { sku: "2", name: "Dunk Low", price: 100 },
    { sku: "3", name: "Sold Out Runner", price: 100 },
    { sku: "4", name: "Crep Protect", price: 18 },
  ] } };
  const pass = [
    { sku: "1", salesPrice: 89.99, compareAtPrice: 180, sizes: run, availableSizes: ["M9/W10.5"] },
    { sku: "2", salesPrice: 100, sizes: run, availableSizes: run },
    { sku: "3", salesPrice: 100, sizes: run, availableSizes: [] },
    { sku: "4", salesPrice: 18, sizes: [], availableSizes: [] },
  ];
  const report = applySnipesPass(deps, pass);
  const [dt, dunk, crep] = deps.calzado.items;
  assert.deepEqual(dt.sizes, ["M9/W10.5"]);
  assert.deepEqual(dt.sizesOut, ["M7.5/W9", "M8/W9.5", "M8.5/W10", "M9.5/W11"]);
  assert.deepEqual(dunk.sizes, run);
  assert.equal(dunk.sizesOut, undefined, "a full run in stock has nothing sold out");
  assert.ok(!deps.calzado.items.some((i) => i.name === "Sold Out Runner"), "every size sold out: not listed");
  assert.equal(crep.sizes, undefined);
  assert.equal(crep.sizesOut, undefined);
  assert.equal(report.soldOutSizes, 1);
  assert.equal(report.left["every size out of stock"], 1);
});

const cat = (k) => Object.values(JSON.parse(read(k + "-catalog.json")).retailers[k].departments).flatMap((d) => d.items);
await check("the committed SNIPES catalogue: the Air DT Max '96 sells its one in-stock size and shows the other 12 sold out (the store's own run)", () => {
  const items = cat("snipes");
  /* SNIPES' page, 2026-10-28: 13 size buttons, only M9/W10.5 enabled
     (data-drops/snipes-pass-2026-10-28, sku 1000124007). */
  const dt = items.find((i) => i.sku === "1000124007");
  assert.ok(dt, "the Air DT Max '96 left the catalogue");
  assert.deepEqual(dt.sizes, ["M9/W10.5"]);
  assert.equal(dt.sizesOut.length, 12);
  assert.ok(dt.sizesOut.includes("M7.5/W9") && dt.sizesOut.includes("M15/W16.5"));
  for (const it of items) {
    if (!it.sizesOut) continue;
    assert.ok(Array.isArray(it.sizes) && it.sizes.length, it.name + ": sold-out sizes with nothing in stock");
    assert.ok(it.sizesOut.every((x) => typeof x === "string" && x.trim() && !it.sizes.includes(x)), it.name + ": a size both in stock and sold out");
  }
  assert.ok(items.filter((i) => i.sizesOut).length > 2000, "the sold-out runs went missing");
});
await check("the committed catalogues: real photos, prices, estimated weights, Spanish only, sizes never invented", () => {
  for (const k of ["snipes", "carolinaherrera"]) {
    const items = cat(k);
    assert.ok(items.length > (k === "snipes" ? 4500 : 200), k + " lost its products");
    for (const it of items) {
      assert.match(it.image, /^https:\/\//, it.name);
      assert.ok(it.price > 0, it.name);
      assert.ok(it.weightKg > 0 && it.weightEstimated === true, it.name + " weight");
      assert.ok(!it.description || it.description_en, it.name + " shows English");
      /* Sizes only from the SNIPES product-page pass (2026-10-28): the
         in-stock buttons, never a guessed run; a sized item is sold. */
      if (k === "snipes" && it.sizes) {
        assert.equal(it.sizeSource, "snipes-pdp", it.name);
        assert.ok(it.sizes.length && it.sizes.every((x) => typeof x === "string" && x.trim()), it.name);
        assert.equal(it.sizesPending, undefined, it.name + " is sized but still pending");
      } else assert.ok(!it.sizes && !it.availableSizes, it.name + " carries a size list nobody pulled");
      /* A was-price only where the page struck one through, above the price. */
      if (it.originalPrice != null) assert.ok(k === "snipes" && it.originalPrice > it.price && it.onSale === true, it.name);
      assert.equal(it.retailer, k);
    }
  }
  const snipes = cat("snipes");
  assert.ok(snipes.filter((i) => i.sizes).length > 4500, "the SNIPES size pass");
  assert.ok(snipes.filter((i) => i.originalPrice).length > 2000, "the SNIPES was-prices");
  assert.ok(snipes.filter((i) => i.sizesPending).length < 20, "SNIPES still waits for sizes");
  assert.ok(!snipes.some((i) => RELEASE_RX.test(i.name) && i.sizesPending && /retro (high|low) og/i.test(i.name)), "a release SKU is listed");
});

await check("shown, not sold: the order endpoint refuses an item whose sizes are pending, and sells a cap", () => {
  const shoe = cat("snipes").find((i) => i.sizesPending);
  const cap = cat("snipes").find((i) => !i.sizesPending);
  assert.ok(isSizesPending("snipes", shoe.name));
  assert.ok(isSizesPending("SNIPES", "  " + shoe.name.toUpperCase() + " "), "the key is case- and space-blind");
  assert.ok(!isSizesPending("snipes", cap.name));
  assert.equal(sizesPendingLines([{ retailer: "snipes", title: shoe.name }, { retailer: "snipes", title: cap.name }]).length, 1);
  /* One name, two colourways (one sized by the pass): a line with a chosen size sells. */
  assert.equal(sizesPendingLines([{ retailer: "snipes", title: shoe.name, selectedSize: "10" }]).length, 0);
  /* Every store whose catalogue marks items shown-not-sold: the page's
     list (assets/data/sizes-pending.json) and the order door's
     (scripts/lib/sizes-pending-data.js) are the same list, and hold
     exactly those items. */
  const stores = ["snipes", "carolinaherrera", "calzedonia", "intimissimi", "dsw", "tenniswarehouse", "pacsun"].filter((k) => existsSync(ROOT + k + "-catalog.json"));
  const pending = stores.flatMap((k) => cat(k)).filter((i) => i.sizesPending).map((i) => sizesPendingKey(i.retailer, i.name));
  assert.deepEqual(JSON.parse(read("assets/data/sizes-pending.json")).sort(), [...new Set(pending)].sort(), "the page's list and the catalogues disagree");
  assert.deepEqual(JSON.parse(read("assets/data/sizes-pending.json")).sort(), [...SIZES_PENDING].sort(), "the page's list and the order door's disagree");
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

await check("the storefronts: SNIPES opens on its real Ofertas, then Nike, Jordan, adidas, New Balance, then its aisles; Carolina Herrera opens on Zapatos", () => {
  const s = JSON.parse(read("assets/tienda/snipes/index.json"));
  const keys = s.rails.map((r) => r.key);
  /* Danny's order (c.6450358688): Ofertas first -- real now, from the pass's struck-through prices. */
  assert.deepEqual(keys.slice(0, 5), ["ofertas", "b-nike", "b-jordan", "b-adidas", "b-new-balance"]);
  assert.equal(s.rails[0].title, "Ofertas de SNIPES");
  assert.ok(s.rails[0].total > 2000 && s.rails[0].head.every((c) => c.was > c.price), "an Ofertas card without a real was-price");
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
  const cap = cat("snipes").find((i) => !i.sizesPending && !i.sizes);
  const c = await pdp(cap);
  assert.equal(await c.pg.evaluate(() => document.querySelector("#add-cart-btn").disabled), false);
  await c.ctx.close();
});

await check("the product page: a sized SNIPES sneaker offers its in-stock sizes and the cart", async () => {
  const shoe = cat("snipes").find((i) => i.sizes && i.sizes.length > 3 && /air jordan 1 mid/i.test(i.name)) || cat("snipes").find((i) => i.sizes && i.sizes.length > 3);
  const { pg, ctx } = await pdp(shoe);
  const s = await pg.evaluate(() => ({ opts: [...document.querySelectorAll("#size-select option")].map((o) => o.value).filter(Boolean),
    btn: document.querySelector("#add-cart-btn").textContent, disabled: document.querySelector("#add-cart-btn").disabled }));
  assert.equal(s.btn, "Agregar al carrito");
  assert.equal(s.disabled, false);
  assert.deepEqual([...s.opts].sort(), [...new Set(shoe.sizes)].sort());
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + "-pdp-sized.png" });
  await ctx.close();
});

await check("the product page: a SNIPES shoe with one size in stock lists the store's whole run, sells only that size", async () => {
  const dt = cat("snipes").find((i) => i.sku === "1000124007");
  const { pg, ctx } = await pdp(dt);
  await pg.waitForSelector("#size-select");
  const s = await pg.evaluate(() => ({
    all: [...document.querySelectorAll("#size-select option")].slice(1).map((o) => ({ t: o.textContent, v: o.value, off: o.disabled })),
    note: (document.querySelector("#size-out-note") || {}).textContent || "" }));
  assert.equal(s.all.length, 13, "the store's 13 sizes");
  assert.deepEqual(s.all.filter((o) => !o.off).map((o) => o.v), ["M9/W10.5"]);
  assert.ok(s.all.filter((o) => o.off).every((o) => o.v === "" && / \(agotada\)$/.test(o.t)), "a sold-out size is selectable");
  assert.equal(s.note, "1 de 13 tallas disponible en la tienda; las demás están agotadas.");
  /* A sold-out size cannot be chosen; the in-stock one reaches the cart. */
  await pg.selectOption("#size-select", "M9/W10.5");
  await pg.click("#add-cart-btn");
  await pg.waitForSelector("#cart-confirm:not([hidden])", { timeout: 10000 });
  const cart = await pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
  assert.equal(cart.length, 1);
  assert.equal(cart[0].selectedSize || cart[0].size, "M9/W10.5");
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + "-pdp-sold-out-run.png", fullPage: false });
  await ctx.close();
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
