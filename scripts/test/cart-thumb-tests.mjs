/* ==================================================================
   #443 LEGACY CART LINES RECOVER THEIR PRODUCT PHOTO. Regression battery.

   Danny's rehearsal: a checkout holding three lines saved in earlier
   sessions (an AEO boxer brief, a Brixton x Coors tee, an AE
   sweatshirt) plus the Dreamhouse added that night. The Dreamhouse
   showed its photo; the three older lines showed the empty box. A line
   with no stored image, or one whose stored photo is dead (the resized
   copy and the original both fail), must show the product's current
   photo from its catalogue record -- the PDP shard producto.html and
   the size gate read (assets/pdp/p/<FNV-1a of the normalised title>.json),
   the line's retailer picking among the title's records.

   Real records, driven in headless Chromium:
     checkout.html  legacy lines (no image) show the record's photo and
                    keep it; a line whose stored photo 404s recovers;
                    a normal cart (every line with a live photo) is
                    left exactly as it was.
     index.html     the app bundle's cart view does the same.

   RUN: node scripts/test/cart-thumb-tests.mjs
   It starts its own static server (port CART_THUMB_PORT, default 8981)
   with the functions checkout needs; the exchange rate and the courier
   quote are stubbed (no outbound network). Retailer photos are answered
   with a 1x1 stand-in, except the dead URLs below, which answer 404.
   ARIA_BASE_URL=<url> runs against a deploy instead.
   PLAYWRIGHT_CHROMIUM=<path> picks the browser binary.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e.message).split("\n")[0]); }
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
  if (name === "resolve-weight") {
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
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        if (!cache.has(p)) cache.set(p, readFileSync(p));
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        res.end(cache.get(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  return new Promise((ok, bad) => { srv.once("error", bad); srv.listen(port, "127.0.0.1", () => ok(srv)); });
}

const PORT = Number(process.env.CART_THUMB_PORT || 8981);
const server = process.env.ARIA_BASE_URL ? null : await startServer(PORT);
const BASE = (process.env.ARIA_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const OWN = new URL(BASE).host;

/* ---------------- the real records ---------------- */
/* The shard the page reads, read here the same way, so the battery's
   expected photo is the record's own -- and each one is checked to be
   in its store's catalogue file as well. */
const norm = (t) => String(t).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
function shardOf(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ("00" + ((h >>> 0) % 4096).toString(16)).slice(-3);
}
function recordImage(retailer, title) {
  const key = norm(title);
  const d = JSON.parse(readFileSync(join(ROOT, "assets/pdp/p", shardOf(key) + ".json"), "utf8"));
  const own = (d[key] || []).filter((c) => c.retailer === retailer);
  const pos = (c) => Math.min(Infinity, ...(c.src || []).map((s) => s[1]));
  own.sort((a, b) => (pos(a) - pos(b)) || 0);
  if (!own.length || !own[0].image) throw new Error(`${title} (${retailer}) is gone from the PDP shards`);
  return own[0].image;
}
function inCatalog(file, url) { return readFileSync(join(ROOT, file), "utf8").includes(JSON.stringify(url)); }

const LEGACY = [
  { retailer: "americaneagle", title: "AEO Men's 6\" Flex Boxer Brief", file: "ae-catalog.json", selectedSize: "M", priceUsd: 14.95, weightKg: 0.1 },
  { retailer: "ccs", title: "Brixton x Coors Light Silver Speed T-Shirt - Black", file: "ccs-catalog.json", selectedSize: "L", priceUsd: 32, weightKg: 0.25 },
  { retailer: "americaneagle", title: "AE Campus Short-Sleeve Sweatshirt", file: "ae-catalog.json", selectedSize: "M", priceUsd: 44.95, weightKg: 0.5 },
];
const DEAD = { retailer: "americaneagle", title: "AE Laidback Luxe Quarter-Zip Sweatshirt", file: "ae-catalog.json", selectedSize: "L", priceUsd: 59.95, weightKg: 0.6,
  image: "https://s7d2.scene7.com/is/image/aeo/battery_dead_photo_of" };
const HOUSE = { retailer: "target", title: "Barbie Dreamhouse Pool Party Doll House with 75+ pc, 3 Story Slide: Adult Assembly, Fits 12 Inch Dolls", file: "juguetes-catalog.json", priceUsd: 150, weightKg: 8 };
for (const x of [...LEGACY, DEAD, HOUSE]) {
  x.want = recordImage(x.retailer, x.title);
  assert(inCatalog(x.file, x.want), `${x.title}: shard photo not in ${x.file}`);
}
HOUSE.image = HOUSE.want;
assert(DEAD.want !== DEAD.image, "the dead stand-in is the record's photo");

const line = (x, extra = {}) => ({ retailer: x.retailer, title: x.title, priceUsd: x.priceUsd, dutiableUsd: x.priceUsd, weightKg: x.weightKg,
  weightEstimated: true, selectedSize: x.selectedSize || "", qty: 1, ...extra });
/* The shape of Danny's cart: three lines from older sessions with no image, the Dreamhouse with one. */
const LEGACY_CART = [...LEGACY.map((x) => line(x)), line(HOUSE, { image: HOUSE.image })];

/* ---------------- the browser ---------------- */
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const photos = [];
  await context.route("**/*", (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host === OWN) return route.continue();
    if (req.resourceType() === "image") {
      photos.push(req.url());
      if (u.pathname.includes("battery_dead_photo")) return route.fulfill({ status: 404, contentType: "text/plain", body: "gone" });
      return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => { page.__errors.push(String(e.message)); });
  return { context, page, photos };
}
const cartOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
async function seed(page, url, cart) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate((c) => localStorage.setItem("aria_cart_v1", JSON.stringify(c)), cart);
  await page.reload({ waitUntil: "domcontentloaded" });
}
/* Every line's thumbnail, in cart order: what it points at and whether it loaded. */
function thumbs(page, wrap) {
  return page.$$eval(`${wrap} [data-remove-line], ${wrap} [aria-label^="Quitar: "]`, (btns) => btns.map((b) => {
    const row = b.closest(".flex.items-center.gap-3");
    const img = row && row.querySelector("img.w-16");
    return img ? { orig: img.getAttribute("data-img-orig") || img.currentSrc || img.src, src: img.currentSrc || img.src, ok: img.complete && img.naturalWidth > 0 } : null;
  }));
}
/* The photo a thumbnail shows is the record's URL, maybe with the
   site's resize parameter (sizedImageUrl) on it. */
const same = (shown, want) => !!shown && (shown === want || shown.split("?")[0] === want.split("?")[0]);
async function waitThumbs(page, wrap, wants) {
  let got = [];
  for (let i = 0; i < 100; i++) {
    got = await thumbs(page, wrap);
    if (got.length === wants.length && got.every((t, k) => t && t.ok && same(t.src, wants[k]))) return got;
    await page.waitForTimeout(100);
  }
  throw new Error("thumbnails: " + JSON.stringify(got.map((t) => t && { src: t.src.slice(-48), ok: t.ok })));
}

/* 1. Checkout, Danny's cart. */
await check("checkout: legacy lines with no image show the record's photo, the Dreamhouse keeps its own", async () => {
  const { context, page } = await newPage();
  try {
    await seed(page, `${BASE}/checkout.html`, LEGACY_CART);
    await page.waitForSelector("#checkoutItemsWrap [data-remove-line]", { timeout: 30000 });
    await waitThumbs(page, "#checkoutItemsWrap", [...LEGACY.map((x) => x.want), HOUSE.image]);
    const saved = await cartOf(page);
    LEGACY.forEach((x, i) => assert(saved[i].image === x.want, `${x.title}: saved image ${saved[i].image}`));
    assert(saved[3].image === HOUSE.image, "the Dreamhouse's photo changed");
    assert(!page.__errors.length, "page errors: " + page.__errors.join(" | "));
    return LEGACY.map((x) => x.want.split("/").pop().slice(0, 24)).join(", ");
  } finally { await context.close(); }
});

await check("checkout: a line whose stored photo 404s recovers to the record's photo", async () => {
  const { context, page, photos } = await newPage();
  try {
    await seed(page, `${BASE}/checkout.html`, [line(DEAD, { image: DEAD.image }), line(HOUSE, { image: HOUSE.image })]);
    await page.waitForSelector("#checkoutItemsWrap [data-remove-line]", { timeout: 30000 });
    await waitThumbs(page, "#checkoutItemsWrap", [DEAD.want, HOUSE.image]);
    assert(photos.some((u) => u.includes("battery_dead_photo")), "the dead photo was never asked for");
    const saved = await cartOf(page);
    assert(saved[0].image === DEAD.want, "saved image " + saved[0].image);
    return "dead -> " + DEAD.want.split("/").pop();
  } finally { await context.close(); }
});

await check("checkout: a normal cart is left as it was (every line keeps its stored photo)", async () => {
  const { context, page } = await newPage();
  const cart = [line(LEGACY[0], { image: LEGACY[0].want }), line(LEGACY[1], { image: LEGACY[1].want }), line(HOUSE, { image: HOUSE.image })];
  try {
    await seed(page, `${BASE}/checkout.html`, cart);
    await page.waitForSelector("#checkoutItemsWrap [data-remove-line]", { timeout: 30000 });
    await waitThumbs(page, "#checkoutItemsWrap", cart.map((l) => l.image));
    await page.waitForTimeout(800);
    const saved = await cartOf(page);
    assert(JSON.stringify(saved.map((l) => l.image)) === JSON.stringify(cart.map((l) => l.image)), "images changed: " + JSON.stringify(saved.map((l) => l.image)));
    assert(!page.__errors.length, "page errors: " + page.__errors.join(" | "));
  } finally { await context.close(); }
});

await check("checkout: a line whose product is not in the catalogue keeps the empty box, nothing invented", async () => {
  const { context, page } = await newPage();
  try {
    await seed(page, `${BASE}/checkout.html`, [line({ retailer: "americaneagle", title: "Battery Product That Does Not Exist", priceUsd: 10, weightKg: 0.2 })]);
    await page.waitForSelector("#checkoutItemsWrap [data-remove-line]", { timeout: 30000 });
    await page.waitForTimeout(1200);
    assert(!(await page.$("#checkoutItemsWrap img.w-16")), "a photo was shown for a product with no record");
    assert(!(await cartOf(page))[0].image, "an image was saved");
  } finally { await context.close(); }
});

/* 2. The app bundle's cart view. */
async function openCartView(page, cart) {
  await seed(page, `${BASE}/index.html`, cart);
  await page.waitForFunction(() => typeof openCart === "function" && typeof healCartLineImages === "function"
    && typeof cart !== "undefined" && cart.length > 0, null, { timeout: 30000 });
  await page.evaluate(() => openCart());
  await page.waitForSelector('#cartItemsWrap [aria-label^="Quitar: "]', { timeout: 30000 });
}
await check("cart (app bundle): legacy lines and a dead photo show the record's photo", async () => {
  const { context, page } = await newPage();
  const cart = [...LEGACY_CART.slice(0, 3), line(DEAD, { image: DEAD.image }), LEGACY_CART[3]];
  try {
    await openCartView(page, cart);
    await waitThumbs(page, "#cartItemsWrap", [...LEGACY.map((x) => x.want), DEAD.want, HOUSE.image]);
    const saved = await cartOf(page);
    assert(saved.every((l, i) => l.image === [...LEGACY.map((x) => x.want), DEAD.want, HOUSE.image][i]), "saved: " + JSON.stringify(saved.map((l) => l.image)));
    return `${saved.length} lines`;
  } finally { await context.close(); }
});

await check("cart (app bundle): a normal cart is left as it was", async () => {
  const { context, page } = await newPage();
  const cart = [line(LEGACY[2], { image: LEGACY[2].want }), line(HOUSE, { image: HOUSE.image })];
  try {
    await openCartView(page, cart);
    await waitThumbs(page, "#cartItemsWrap", cart.map((l) => l.image));
    await page.waitForTimeout(800);
    const saved = await cartOf(page);
    assert(JSON.stringify(saved.map((l) => l.image)) === JSON.stringify(cart.map((l) => l.image)), "images changed");
  } finally { await context.close(); }
});

await browser.close();
if (server) server.close();
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
