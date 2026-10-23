/* ==================================================================
   #411 P0 SIZE GATE — THE RECORD DECIDES. Regression battery.

   Danny's rule: a product whose record carries the store's size list
   shows that list and cannot reach the cart (or be paid) without a size
   from it; a product with no list sells plainly -- no picker, no
   "Tallas por confirmar". Never a title keyword: "9060" is a shoe with
   no shoe word in it, and a doll's dress is not a woman's.

   Real records from the catalogues, driven in headless Chromium (live
   lanes since #443; the first run used New Balance and Target):
     sized    Zumiez: Cali 1850 shorts, adidas Adistar Control 5 (a shoe
              with no shoe word), Vans Super Lowpro, New Balance XRCT
              -- producto.html shows the store's own
              sizes, Agregar is refused until one is chosen, then the
              size reaches the cart line and checkout's "Talla X";
     unsized  Walmart: Barbie Petal Pop ... Pink Tulip Dress, Barbie Royal
              Doll ... Butterfly-Print Skirt, Barbie Dreamhouse Pool Party
              ... Puppy Elevator -- no picker, Agregar works,
              checkout reaches the payment step (Pagar enabled).
     The Dreamhouse goes product page -> cart -> checkout -> Pagar, and the
     Pagar POST is caught before orders-create/Stripe (no keys here).
   Plus: the home page's product view (the app bundle) on a sized and a
   doll record, a card with no list that the shard lookup must size,
   checkout holding a sized line that has no size (legacy cart) and
   letting the shopper pick it on the line, and orders-create refusing it.

   RUN: node scripts/test/size-gate-tests.mjs
   It starts its own static server (port SIZE_GATE_PORT, default 8931)
   with the functions checkout needs; the exchange rate and the courier
   quote are stubbed (no outbound network). Retailer photos are answered
   with a 1x1 stand-in. ARIA_BASE_URL=<url> runs against a deploy instead.
   PLAYWRIGHT_CHROMIUM=<path> picks the browser binary.
   ================================================================== */
import { randomBytes } from "node:crypto";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

let passed = 0, failed = 0;
const results = [];
async function check(name, fn) {
  try { const note = await fn(); passed++; results.push([name, "ok", note || ""]); console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; results.push([name, "FAIL", e.message]); console.log("  FAIL  " + name + "\n         " + String(e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

/* ---------------- the local server ---------------- */
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const FX = { compra: 3.72, venta: 3.75, fecha: "2026-10-19" };
async function fnHandler(name, req, body) {
  if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify(FX) };
  if (name === "wallet-get" || name === "cart-save" || name === "cart-get") return { statusCode: 401, body: JSON.stringify({ error: "No autenticado" }) };
  if (name === "founders-status") return { statusCode: 200, body: JSON.stringify({}) };
  if (name === "shipping-quote") {
    /* The courier's API is outside the sandbox: the real handler runs with
       a stand-in courier answer, so the markup rules are still its own. */
    const { handler } = await import(join(ROOT, "netlify/functions/shipping-quote.js"));
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const b = JSON.parse(init.body);
      const flete = Math.round(Math.max(1, b.peso_kg) * 9 * 100) / 100;
      const total = Math.round((b.valor_usd + flete) * 100) / 100;
      return new Response(JSON.stringify({ total_usd: total, total_pen: Math.round(total * 3.75 * 100) / 100, flete_usd: flete }), { status: 200 });
    };
    try { return await handler({ httpMethod: req.method, headers: req.headers, body }); }
    finally { globalThis.fetch = realFetch; }
  }
  if (name === "resolve-weight" || name === "orders-create" || name === "search") {
    const { handler } = await import(join(ROOT, "netlify/functions/" + name + ".js"));
    const u = new URL(req.url, "http://x");
    return handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
  }
  return { statusCode: 404, body: JSON.stringify({ error: "no function " + name }) };
}
function startServer(port) {
  const cache = new Map();
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, "http://x");
        const fm = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (fm) {
          const r = await fnHandler(fm[1], req, body);
          res.writeHead(r.statusCode, { "Content-Type": "application/json" });
          return res.end(r.body);
        }
        if (u.pathname === "/__photo") { res.writeHead(200, { "Content-Type": "image/gif" }); return res.end(PIXEL); }
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        if (!cache.has(p)) cache.set(p, readFileSync(p));
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        res.end(cache.get(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  return new Promise((ok) => srv.listen(port, "127.0.0.1", () => ok(srv)));
}

const PORT = Number(process.env.SIZE_GATE_PORT || 8931);
const server = process.env.ARIA_BASE_URL ? null : await startServer(PORT);
const BASE = (process.env.ARIA_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const OWN = new URL(BASE).host;

/* ---------------- the real records ---------------- */
function findRecord(file, title) {
  const d = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  const st = [d];
  while (st.length) {
    const n = st.pop();
    if (Array.isArray(n)) { st.push(...n); continue; }
    if (!n || typeof n !== "object") continue;
    if ((n.title || n.name || n.productName) === title && n.price != null) return n;
    for (const v of Object.values(n)) if (v && typeof v === "object") st.push(v);
  }
  throw new Error(`${title} is gone from ${file}`);
}
/* LIVE LANES (#443). The battery first ran on New Balance and Target
   records; both stores are off sale now (/off-sale.js), so it runs on
   the same shapes from stores that still sell: Zumiez sized records
   (the Adistar is a shoe with no shoe word in its title, the "9060"
   case) and Walmart's dolls and Dreamhouse (garment words, no list). */
const SIZED = [
  { title: "Cali 1850 Leopard Low Rise Micro Shorts", store: "zumiez", file: "zumiez-catalog.json" },
  { title: "adidas Adistar Control 5 Grey Two, Cream White & Wonder Sage", store: "zumiez", file: "zumiez-catalog.json" },
  { title: "Vans Super Lowpro Emerald Green Shoes", store: "zumiez", file: "zumiez-catalog.json" },
  { title: "New Balance Lifestyle XRCT Outer Space & Energy Lime Shoes", store: "zumiez", file: "zumiez-catalog.json" },
];
const DOLLS = [
  { title: "Barbie Petal Pop Scented Fashion Doll with Pink Tulip Dress, Reveal Accessories like Bunny & More", store: "walmart", file: "juguetes-catalog.json" },
  { title: "Barbie Royal Doll with Pink and Blonde Hair, Butterfly-Print Skirt and Accessories", store: "walmart", file: "juguetes-catalog.json" },
  { title: "Barbie Dreamhouse Pool Party Doll House and Playset with 75+ Pieces, 45 in, Slide & Puppy Elevator", store: "walmart", file: "juguetes-catalog.json" },
];
for (const x of [...SIZED, ...DOLLS]) {
  x.rec = findRecord(x.file, x.title);
  x.sizes = (x.rec.sizes || x.rec.availableSizes || []).map(String);
}

/* ---------------- the browser ---------------- */
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.host === OWN) return route.continue();
    if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => { page.__errors = (page.__errors || []).concat(String(e.message)); });
  return { context, page };
}
const cartOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
const pdpUrl = (x) => `${BASE}/producto.html?producto=${encodeURIComponent(x.title)}&tienda=${x.store}`;

async function openPdp(page, x) {
  await page.goto(pdpUrl(x), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
}
async function waitPayStep(page) {
  /* The payment step: the quote is in, the summary is settled and Pagar is live. */
  await page.waitForFunction(() => {
    const b = document.getElementById("payBtn");
    return b && !b.disabled && /Pagar/i.test(b.textContent);
  }, null, { timeout: 30000 });
  return page.$eval("#payBtn", (b) => b.textContent.trim().replace(/\s+/g, " "));
}

/* 1. Sized shoes on producto.html. */
for (const x of SIZED) {
  await check(`sized: ${x.title} -- the store's sizes, refused until chosen, the size reaches the cart and checkout`, async () => {
    assert(x.sizes.length > 0, "the record lost its size list");
    const { context, page } = await newPage();
    try {
      await openPdp(page, x);
      const opts = await page.$$eval("#size-select option", (os) => os.map((o) => o.value).filter(Boolean));
      assert(opts.length === new Set(x.sizes).size, `picker shows ${opts.length} sizes, record has ${x.sizes.length}`);
      for (const o of opts) assert(x.sizes.includes(o), `picker invented size ${o}`);
      assert(!(await page.$("text=Tallas por confirmar")), "Tallas por confirmar is shown");
      await page.click("#add-cart-btn");
      await page.waitForTimeout(150);
      assert((await cartOf(page)).length === 0, "added to the cart without a size");
      const toast = await page.$eval("#toast", (t) => t.textContent);
      assert(/Selecciona una talla/.test(toast), "no 'Selecciona una talla' message: " + toast);
      const pick = opts[Math.floor(opts.length / 2)];
      await page.selectOption("#size-select", pick);
      await page.click("#add-cart-btn");
      const cart = await cartOf(page);
      assert(cart.length === 1 && cart[0].selectedSize === pick, "cart line size: " + JSON.stringify(cart.map((l) => l.selectedSize)));
      assert(Array.isArray(cart[0].sizeOptions) && cart[0].sizeOptions.length === opts.length, "the store's list did not ride on the line");
      await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#checkoutItemsWrap img, #checkoutItemsWrap [data-remove-line]");
      const line = await page.$eval("#checkoutItemsWrap", (w) => w.textContent);
      assert(line.includes("Talla " + pick), "checkout line does not say Talla " + pick);
      const pay = await waitPayStep(page);
      return `${opts.length} sizes (${opts[0]}..${opts[opts.length - 1]}), chose ${pick}, checkout "${pay}"`;
    } finally { await context.close(); }
  });
}

/* 2. The dolls on producto.html: no picker, Agregar works, checkout pays. */
for (const x of DOLLS) {
  await check(`unsized: ${x.title.slice(0, 48)} -- no picker, Agregar works, checkout reaches Pagar`, async () => {
    assert(x.sizes.length === 0, "the record has a size list now -- the battery's premise changed");
    const { context, page } = await newPage();
    try {
      await openPdp(page, x);
      assert(!(await page.$("#size-select")), "a size picker is shown");
      assert(!(await page.$("text=Tallas por confirmar")), "Tallas por confirmar is shown");
      assert(await page.$eval("#add-cart-btn", (b) => !b.disabled), "Agregar is disabled");
      await page.click("#add-cart-btn");
      const cart = await cartOf(page);
      assert(cart.length === 1 && cart[0].title === x.title && !cart[0].selectedSize, "cart: " + JSON.stringify(cart.map((l) => l.title)));
      await page.click("#cart-confirm a.btn-checkout");
      await page.waitForURL(/checkout\.html/);
      const pay = await waitPayStep(page);
      assert(!(await page.$("[data-size-missing]")), "checkout asks a doll for a size");
      return `checkout "${pay}"`;
    } finally { await context.close(); }
  });
}

/* 3. THE BAR: the Dreamhouse, product page -> cart -> checkout -> Pagar pressed. */
await check("the Dreamhouse can be bought: product page -> cart -> checkout -> Pagar posts the order (caught before Stripe)", async () => {
  const x = DOLLS[2];
  const { context, page } = await newPage();
  let posted = null;
  await context.route("**/.netlify/functions/orders-create", (route) => {
    posted = JSON.parse(route.request().postData() || "{}");
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Batería: detenido antes de Stripe." }) });
  });
  try {
    await openPdp(page, x);
    await page.click("#add-cart-btn");
    await page.click("#cart-confirm a.btn-checkout");
    await page.waitForURL(/checkout\.html/);
    await waitPayStep(page);
    await page.fill("#custName", "Ale Prueba");
    await page.fill("#custEmail", "ale@example.com");
    await page.fill("#custPhone", "987654321");
    await page.fill("#custDoc", "45678912");
    await page.fill("#addrLine", "Av. Arequipa 123");
    await page.fill("#addrDistrict", "Miraflores");
    await page.selectOption("#addrRegion", "Lima");
    await page.selectOption("#destCity", { index: 1 });
    await page.waitForTimeout(300);
    const courierOpts = await page.$$eval("#courierSelect option", (os) => os.filter((o) => o.value && !o.disabled).map((o) => o.value));
    if (courierOpts.length) await page.selectOption("#courierSelect", courierOpts[0]);
    /* The recipient's DNI photos (#443): two TEST photos of random pixels,
       taken through the section's own inputs; the upload is answered here. */
    await context.route("**/.netlify/functions/dni-upload", (route) => route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ token: randomBytes(16).toString("hex") }) }));
    const { default: jpegjs } = await import("jpeg-js");
    const px = Buffer.alloc(320 * 220 * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 7919) % 251;
    const photo = { name: "dni.jpg", mimeType: "image/jpeg", buffer: jpegjs.encode({ data: px, width: 320, height: 220 }, 90).data };
    for (const side of ["front", "back"]) {
      await page.setInputFiles(`.dniSlot[data-side="${side}"] input[data-pick="camera"]`, photo);
      await page.waitForFunction((s) => document.querySelector(`.dniSlot[data-side="${s}"] .dniStatusText`).textContent.includes("Foto lista"), side, { timeout: 20000 });
    }
    const pay = await waitPayStep(page);
    /* The phone's closing pay bar sits over the button; a tap on either submits the form. */
    await page.evaluate(() => document.getElementById("payBtn").click());
    for (let i = 0; i < 50 && !posted; i++) await page.waitForTimeout(100);
    assert(posted, "Pagar did not post the order");
    assert(posted.items.length === 1 && posted.items[0].title === x.title, "posted items: " + JSON.stringify(posted.items));
    assert(posted.dniDocs && posted.dniDocs.front && posted.dniDocs.back, "Pagar sent no DNI photo tokens");
    return `Pagar "${pay}" -> orders-create POST with 1 line, S/ ${posted.shownTotalPen}`;
  } finally { await context.close(); }
});

/* 4. The home page (the app bundle). Every card tap there goes through
   window.showProduct, which index.html sends to producto.html -- so the
   page battery above is the home page's product page too. The bundle's
   own doors into the cart (chat, cross-sell, combos) all pass addToCart's
   funnel, which the record's list now decides. */
async function openHome(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof addToCart === "function" && typeof recordSizeList === "function" && typeof showProduct === "function", null, { timeout: 30000 });
}
await check("home: tapping the Adistar card (a shoe with no shoe word) lands on its product page, with the store's sizes", async () => {
  const x = SIZED[1];
  const { context, page } = await newPage();
  try {
    await openHome(page);
    await Promise.all([page.waitForURL(/producto\.html/, { timeout: 30000 }), page.evaluate((x) => showProduct(x.store, x.title), { store: x.store, title: x.title })]);
    await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
    const n = await page.$$eval("#size-select option", (os) => os.filter((o) => o.value).length);
    assert(n === new Set(x.sizes).size, `${n} sizes on the page`);
    return `${n} sizes`;
  } finally { await context.close(); }
});
await check("bundle funnel: a sized line without a size is refused, with one it is added; the Dreamhouse is added plainly", async () => {
  const [shoe, house] = [SIZED[1], DOLLS[2]];
  const { context, page } = await newPage();
  try {
    await openHome(page);
    const pick = shoe.sizes[Math.floor(shoe.sizes.length / 2)];
    const r = await page.evaluate(({ shoe, house, pick }) => {
      const base = { retailer: shoe.store, title: shoe.title, priceUsd: 200, weightKg: 1 };
      return {
        noSize: addToCart({ ...base, sizes: shoe.sizes, selectedSize: "" }),
        badSize: addToCart({ ...base, sizes: shoe.sizes, selectedSize: "99" }),
        withSize: addToCart({ ...base, sizes: shoe.sizes, selectedSize: pick }),
        house: addToCart({ retailer: house.store, title: house.title, priceUsd: 150, weightKg: 8 }),
        cart: JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"),
      };
    }, { shoe: { title: shoe.title, sizes: shoe.sizes, store: shoe.store }, house: { title: house.title, store: house.store }, pick });
    assert(r.noSize === false && r.badSize === false, "a sized line got in without a store size: " + JSON.stringify(r));
    assert(r.withSize === true && r.house === true, "a valid line was refused: " + JSON.stringify(r));
    const shoeLine = r.cart.find((l) => l.title === shoe.title);
    assert(shoeLine && shoeLine.selectedSize === pick && shoeLine.sizeOptions.length === new Set(shoe.sizes).size && !("sizes" in shoeLine), "shoe line: " + JSON.stringify(shoeLine));
  } finally { await context.close(); }
});
await check("bundle: a card that carried no list is sized from its record (recordSizeList reads the PDP shard)", async () => {
  const { context, page } = await newPage();
  try {
    await openHome(page);
    const r = await page.evaluate(async ({ a, b }) => ({ shoe: await recordSizeList(a.store, a.title), house: await recordSizeList(b.store, b.title) }),
      { a: { store: SIZED[1].store, title: SIZED[1].title }, b: { store: DOLLS[2].store, title: DOLLS[2].title } });
    assert(r.shoe.length === new Set(SIZED[1].sizes).size, "Adistar lookup: " + JSON.stringify(r.shoe));
    assert(r.house.length === 0, "the Dreamhouse got sizes: " + JSON.stringify(r.house));
    return `Adistar -> ${r.shoe.length} sizes, Dreamhouse -> none`;
  } finally { await context.close(); }
});

/* 5. Checkout holds a sized line with no size (an older cart) and lets the shopper fix it. */
await check("checkout: a sized line with no size blocks Pagar, names the line, and the store's sizes fix it there", async () => {
  const x = SIZED[0];
  const { context, page } = await newPage();
  try {
    await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((x) => {
      localStorage.setItem("aria_cart_v1", JSON.stringify([
        { retailer: x.store, title: x.title, priceUsd: 80, dutiableUsd: 58, weightKg: 0.6, weightEstimated: true, selectedSize: null, qty: 1 },
      ]));
    }, { store: x.store, title: x.title });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-size-missing]", { timeout: 30000 });
    /* Once the quote and the shard lookup have settled, Pagar must still be closed, and say why. */
    await page.waitForFunction(() => {
      const b = document.getElementById("payBtn");
      return b && !/Calculando|Revisando|Completa/i.test(b.textContent);
    }, null, { timeout: 30000 });
    const btn = await page.$eval("#payBtn", (b) => ({ d: b.disabled, t: b.textContent.trim() }));
    assert(btn.d && /talla/i.test(btn.t), "Pagar is " + JSON.stringify(btn));
    const msg = await page.$eval("[data-size-missing]", (b) => b.textContent);
    assert(/Falta elegir la talla/.test(msg), "message: " + msg);
    const opts = await page.$$eval("[data-line-size] option", (os) => os.map((o) => o.value).filter(Boolean));
    for (const o of opts) assert(x.sizes.includes(o), "checkout invented size " + o);
    await page.selectOption("[data-line-size]", opts[1]);
    const pay = await waitPayStep(page);
    const cart = await cartOf(page);
    assert(cart[0].selectedSize === opts[1], "the chosen size was not saved");
    return `blocked as "${btn.t}", then "${pay}"`;
  } finally { await context.close(); }
});

/* 6. orders-create refuses a sized line without its size, before anything is written. */
await check("orders-create refuses a sized line with no size (400, nothing charged); a plain line is not refused for size", async () => {
  const { missingSizeLines } = await import(join(ROOT, "netlify/functions/_checkout-model.js"));
  assert(missingSizeLines([{ title: "9060", sizeOptions: ["9", "10"], selectedSize: "" }]).length === 1, "sized, no size: passed");
  assert(missingSizeLines([{ title: "9060", sizeOptions: ["9", "10"], selectedSize: "10" }]).length === 0, "sized with size: refused");
  assert(missingSizeLines([{ title: DOLLS[2].title }]).length === 0, "the Dreamhouse: refused");
  const { handler } = await import(join(ROOT, "netlify/functions/orders-create.js"));
  const r = await handler({ httpMethod: "POST", headers: { host: "deploy-preview-1--ariashopperu.netlify.app" },
    blobs: Buffer.from(JSON.stringify({ url: "http://127.0.0.1:9", token: "battery" })).toString("base64"),
    body: JSON.stringify({ items: [{ retailer: "zumiez", title: "9060", priceUsd: 200, qty: 1, sizeOptions: ["9", "10"], selectedSize: "" }], quote: { total_usd: 1 } }) });
  const b = JSON.parse(r.body);
  assert(r.statusCode === 400 && /Falta elegir la talla de “9060”/.test(b.error), r.statusCode + " " + r.body);
});

await browser.close();
if (server) server.close();
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
