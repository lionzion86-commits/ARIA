/* ==================================================================
   ENVÍO ARIA -- S/ 1 PER STORE CHECKOUT, INSIDE ARIA'S OWN DELIVERY FEE.
   (#443 c.6560848572, Danny, 2026-11-01)

   Every store checkout in an order carries a flat S/ 1.00, charged to the
   customer, funding the buying agent's pay. It sits in Aria's own
   delivery fee line ("Envío Aria") and nowhere else: never in a store's
   shipping line (exact pass-through), never in the $13/kg freight, never
   in the provincia leg. Browse-time surfaces do not change.

   Checks:
     - the rule: 1 store = S/ 1, 2 stores = S/ 2, a free-shipping store
       still S/ 1, a combo discount is no store;
     - the real orders-create handler charges exactly the old total plus
       S/ 1 per store, with store shipping, freight and provincia
       recorded unchanged, and the fee itemised on the order (aria.*);
     - the ledger shows it;
     - the browse/PDP/cart/comparison surfaces do not carry it;
     - checkout.html at 390 px with 2 stores: the Envío Aria row reads
       S/ 2.00, the store shipping rows read what the stores charge, and
       the total the page posts is the one the real server charges
       (Stripe is asked for the same céntimos).

   RUN: node scripts/test/checkout-buyer-fee-tests.mjs
   Port: BUYER_FEE_PORT (default 8996). Screenshot (optional):
   BUYER_FEE_SHOT=<path.png>.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import jpegjs from "jpeg-js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("    ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failures.push(`${name}\n         ${String(e && e.message).split("\n").slice(0, 6).join("\n         ")}`); }
}

/* ---- @netlify/blobs, in memory (installed only on Netlify) ---- */
globalThis.__blobs = new Map();
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "const S = globalThis.__blobs;" +
      "export const connectLambda = () => {};" +
      "export function getStore(name){ if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null," +
      " setJSON: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; }," +
      " set: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, String(v)); return { modified: true }; }," +
      " delete: async (k)=>{ m.delete(k); }, list: async ()=>({ blobs: [...m.keys()].map(key=>({key})) }) }; }"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);

const BF = await import(ROOT + "scripts/lib/buyer-fee.js");
const SS = await import(ROOT + "scripts/lib/store-shipping.js");
const W = await import(ROOT + "weight-data.js");
const C = await import(ROOT + "couriers.js");
const M = await import(ROOT + "netlify/functions/_checkout-model.js");
const { resolveCartWeights } = await import(ROOT + "netlify/functions/_weight-resolve.js");
const { handler: createOrder } = await import(ROOT + "netlify/functions/orders-create.js");
const { handler: dniUpload } = await import(ROOT + "netlify/functions/dni-upload.js");
const { ledgerRow, LEDGER_COLUMNS } = await import(ROOT + "netlify/functions/_ledger.js");
const { doorPrice, cartLineFor } = await import(ROOT + "netlify/functions/_door-price.js");

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const FX = 3.75;

/* TEST FIXTURES, not catalogue products: two stores with sourced rules.
   Crocs charges $7.99 under $49.99 (this line is $30 in the store's
   prices, so it pays it); Revolve always ships free. */
const CROCS = { retailer: "crocs", title: "Fixture Classic Clog", priceUsd: 34, dutiableUsd: 32.1, weightKg: 0.4, weightEstimated: true, qty: 1, image: "" };
const REVOLVE = { retailer: "revolve", title: "Fixture Linen Shirt", priceUsd: 60, dutiableUsd: 53.5, weightKg: 0.4, weightEstimated: true, qty: 1, image: "" };
const CROCS_2 = { ...CROCS, title: "Fixture Sandal", priceUsd: 20, dutiableUsd: 18.19 };

/* ------------------------------------------------------------------
   THE RULE.
   ------------------------------------------------------------------ */
await check("the fee is a config value: S/ 1 per store checkout", () => {
  assert.equal(BF.BUYER_FEE_PEN_PER_STORE, 1);
  assert.match(readFileSync(ROOT + "scripts/lib/buyer-fee.js", "utf8"), /export const BUYER_FEE_PEN_PER_STORE = 1;/);
});
await check("1 store = S/ 1; two lines from the same store are still one checkout", () => {
  assert.equal(BF.storeCheckoutCount([CROCS]), 1);
  assert.equal(BF.buyerFeePen([CROCS]), 1);
  assert.equal(BF.buyerFeePen([CROCS, CROCS_2]), 1);
  assert.equal(BF.buyerFeePen([{ ...CROCS, retailer: " Crocs " }, CROCS_2]), 1, "store keys group the way store shipping groups them");
});
await check("2 stores = S/ 2", () => {
  assert.equal(BF.storeCheckoutCount([CROCS, REVOLVE]), 2);
  assert.equal(BF.buyerFeePen([CROCS, REVOLVE, CROCS_2]), 2);
});
await check("a free-shipping store still carries its S/ 1", () => {
  const ship = SS.cartShipping([REVOLVE]);
  assert.equal(ship.totalUsd, 0, "Revolve should ship free");
  assert.equal(BF.buyerFeePen([REVOLVE]), 1);
});
await check("a combo discount, a line with no store and an empty cart add nothing", () => {
  assert.equal(BF.buyerFeePen([]), 0);
  assert.equal(BF.buyerFeePen(null), 0);
  assert.equal(BF.buyerFeePen([CROCS, { lineType: "bundle-discount", retailer: "revolve", title: "Descuento combo", priceUsd: -5 }]), 1);
  assert.equal(BF.buyerFeePen([{ title: "sin tienda", priceUsd: 5 }]), 0);
});
await check("the line's words are Spanish and name the per-store service", () => {
  assert.equal(BF.ARIA_DELIVERY_LABEL, "Envío Aria");
  assert.equal(BF.ariaDeliveryNote(2), "Incluye servicio de compra por tienda: S/ 1.00 × 2 tiendas");
  assert.equal(BF.ariaDeliveryNote(1), "Incluye servicio de compra por tienda: S/ 1.00 × 1 tienda");
});

/* ------------------------------------------------------------------
   THE SERVER CHARGES IT, AND ONLY IN ARIA'S LINE.
   ------------------------------------------------------------------ */
let stripeCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.endsWith("/.netlify/functions/exchange-rate")) return new Response(JSON.stringify({ venta: FX, compra: 3.7 }));
  if (u === "https://api.stripe.com/v1/checkout/sessions") {
    stripeCalls.push({ form: Object.fromEntries(new URLSearchParams(opts.body)) });
    return new Response(JSON.stringify({ id: "cs_test_fee", url: "https://checkout.stripe.com/c/pay/cs_test_fee", livemode: false, expires_at: 1 }));
  }
  return realFetch(url, opts);
};
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
const HOST = "deploy-preview-1--ariashopperu.netlify.app";

function fixturePhotoBase64(w = 160, h = 110) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < data.length; i++) data[i] = (i * 7919 + (i >> 5) * 104729) % 251;
  return jpegjs.encode({ data, width: w, height: h }, 90).data.toString("base64");
}
async function photos() {
  const out = {};
  for (const side of ["front", "back"]) {
    const r = await dniUpload({ httpMethod: "POST", headers: {}, body: JSON.stringify({ side, data: fixturePhotoBase64() }) });
    out[side] = JSON.parse(r.body).token;
  }
  return out;
}
async function post(body) {
  const res = await createOrder({ httpMethod: "POST", headers: { host: HOST }, body: JSON.stringify({ dniDocs: await photos(), ...body }) });
  return { status: res.statusCode, data: JSON.parse(res.body) };
}
function orderBody(items, extra = {}) {
  return {
    customer: { name: "Ana Prueba", email: "ana@correo.test", idNumber: "45678912" },
    shipping: { destCity: "Lima" },
    items,
    quote: { total_usd: 100, flete_usd: 26, source: "avi" },
    shippingMode: "consolidated",
    ...extra,
  };
}
/* The order's total by the rules as they stood before the ruling: goods +
   freight + tax + store shipping in dollars, then the soles fees. */
function totalBeforeRulingPen(items, { freight = 26, destCity = "Lima", mode = "consolidated" } = {}) {
  const goods = items.reduce((s, it) => s + it.priceUsd * it.qty, 0);
  const fob = items.reduce((s, it) => s + it.dutiableUsd * it.qty, 0);
  const tax = W.importTaxEstimateUsd(fob, freight);
  const ship = SS.cartShipping(items).totalUsd;
  const usd = r2(goods + freight + tax + ship);
  const base = r2((goods + freight) * FX);
  return r2(usd * FX + W.smallOrderFeePen(base) + C.provinciaFeePen(destCity) + M.expressFeePen(mode, FX));
}
const orderOf = (id) => JSON.parse(globalThis.__blobs.get("orders").get(id));

async function charged(items, opts = {}) {
  const before = totalBeforeRulingPen(items, opts);
  const n = BF.storeCheckoutCount(items);
  /* The old figure is refused: the server's total moved by exactly the fee. */
  const stale = await post(orderBody(items, { shownTotalPen: before, shipping: { destCity: opts.destCity || "Lima" }, shippingMode: opts.mode || "consolidated" }));
  assert.equal(stale.status, 409, "the pre-ruling total was accepted: " + JSON.stringify(stale.data));
  assert.equal(stale.data.totalPen, r2(before + n), "server total is not the old total + S/ 1 per store");
  assert.equal(stale.data.buyerFeePen, n);
  stripeCalls = [];
  const ok = await post(orderBody(items, { shownTotalPen: r2(before + n), shipping: { destCity: opts.destCity || "Lima" }, shippingMode: opts.mode || "consolidated" }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(Number(stripeCalls.at(-1).form["line_items[0][price_data][unit_amount]"]), Math.round(r2(before + n) * 100), "Stripe was asked for another amount");
  return { order: orderOf(ok.data.orderId), before, n };
}

await check("server, 1 store: total = old total + S/ 1, itemised as aria.buyerFeePen", async () => {
  const { order } = await charged([CROCS]);
  assert.deepEqual(order.aria, { deliveryFeePen: 1, buyerFeePen: 1, buyerFeePenPerStore: 1, storeCheckouts: 1 });
});
await check("server, 2 stores (one ships free): + S/ 2; store shipping lines exactly the stores' own", async () => {
  const items = [CROCS, REVOLVE];
  const { order } = await charged(items);
  assert.equal(order.aria.buyerFeePen, 2);
  assert.equal(order.aria.storeCheckouts, 2);
  assert.deepEqual(order.storeShipping, [
    { store: "crocs", subtotalUsd: 30, feeUsd: 7.99 },
    { store: "revolve", subtotalUsd: 50, feeUsd: 0 },
  ], "a store's shipping line moved");
  assert.equal(order.storeShippingUsd, 7.99, "the customer told $7.99 store shipping must pay $7.99");
});
await check("server: the $13/kg freight is recorded unchanged", async () => {
  const items = [CROCS, REVOLVE];
  const { order } = await charged(items);
  assert.equal(order.freteChargedUsd, M.freightFloorUsd(26, resolveCartWeights(items).totalKg, W.CHARGE_PER_KG));
  assert.equal(order.freteChargedUsd, 26);
});
await check("server: a provincia order keeps the exact provincia leg; express keeps its $8", async () => {
  const items = [CROCS, REVOLVE];
  const { order } = await charged(items, { destCity: "Arequipa", mode: "express" });
  assert.equal(order.provinciaFeePen, C.PROVINCIA_FEE_PEN);
  assert.equal(order.provinciaFeePen, 9.9);
  assert.equal(order.expressFeePen, M.expressFeePen("express", FX));
  assert.equal(order.aria.buyerFeePen, 2);
});
await check("server: a request cannot set the fee (it is recounted from the lines)", async () => {
  const items = [CROCS, REVOLVE];
  const before = totalBeforeRulingPen(items);
  const r = await post(orderBody(items, { buyerFeePen: 0, shownTotalPen: before }));
  assert.equal(r.status, 409);
  assert.equal(r.data.totalPen, r2(before + 2));
});
await check("the ledger shows the fee and the store count (blank on an older order)", () => {
  const cols = LEDGER_COLUMNS.map(([, k]) => k);
  assert.ok(cols.includes("buyerFeePen") && cols.includes("storeCheckouts"));
  const row = ledgerRow({ orderId: "ARIA-1", fxRateUsed: FX, items: [], aria: { buyerFeePen: 2, storeCheckouts: 2 } }, null, null);
  assert.equal(row.buyerFeePen, 2);
  assert.equal(row.storeCheckouts, 2);
  const old = ledgerRow({ orderId: "ARIA-0", fxRateUsed: FX, items: [] }, null, null);
  assert.equal(old.buyerFeePen, null);
});

/* ------------------------------------------------------------------
   BROWSE-TIME SURFACES DO NOT CHANGE.
   ------------------------------------------------------------------ */
await check("browse, product page, cart and comparison surfaces do not carry the fee", () => {
  const bundles = readdirSync(ROOT + "build").filter((f) => /^app-.*\.js$/.test(f)).map((f) => "build/" + f);
  const files = ["index.html", ...bundles, "producto.html", "carrito.html", "tienda.html", "search.html", "marca.html",
    "departamento.html", "ofertas.html", "categorias.html", "netlify/functions/_door-price.js", "netlify/functions/_search-core.js",
    "store-shipping.js", "couriers.js", "weight-data.js"];
  for (const f of files) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.doesNotMatch(src, /buyer-fee|BUYER_FEE|buyerFeePen|Envío Aria/, `${f} carries the checkout-only fee`);
  }
});
await check("the comparison door price is unchanged: card + freight + tax + store shipping + small-order fee", () => {
  const line = cartLineFor({ retailer: "crocs", title: "Fixture Classic Clog", cardUsd: 34, rawUsd: 30, taxRate: 1.07 });
  const d = doorPrice(line, FX);
  if (!d.quotable) return "weight not quotable for the fixture; nothing to compare";
  assert.equal(d.pen, r2(d.usd * FX + W.smallOrderFeePen(r2(d.baseUsd * FX))));
});

/* ------------------------------------------------------------------
   CHECKOUT.HTML, 390 PX, TWO STORES, AGAINST THE REAL SERVER.
   ------------------------------------------------------------------ */
let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }

if (!chromium) {
  console.log("    (browser checks skipped: no Playwright)");
} else {
  const CART = [CROCS, REVOLVE];
  const state = { posted: [], answers: [] };
  async function fn(name, req, body) {
    if (name === "exchange-rate") return [200, { compra: 3.7, venta: FX, fecha: "2026-11-01" }];
    if (["wallet-get", "cart-save", "cart-get"].includes(name)) return [401, { error: "No autenticado" }];
    if (name === "founders-status") return [200, {}];
    if (name === "auth-me") return [200, { email: null }];
    if (name === "dni-pack") return [200, { signedIn: false, recipients: [] }];
    if (name === "shipping-quote") {
      /* The live endpoint quotes freight at the published $13/kg. */
      const b = JSON.parse(body || "{}");
      const flete = r2(Math.max(0, Number(b.peso_kg) || 0) * W.CHARGE_PER_KG);
      return [200, { total_usd: r2((Number(b.valor_usd) || 0) + flete), flete_usd: flete, source: "avi" }];
    }
    /* The real functions, on the in-memory store. */
    const real = { "dni-upload": dniUpload, "orders-create": createOrder };
    if (real[name] || name === "resolve-weight") {
      const h = real[name] || (await import(ROOT + "netlify/functions/resolve-weight.js")).handler;
      if (name === "orders-create") state.posted.push(JSON.parse(body));
      const r = await h({ httpMethod: req.method, headers: { ...req.headers, host: HOST }, body, queryStringParameters: {} }, {});
      if (name === "orders-create") state.answers.push({ status: r.statusCode, data: JSON.parse(r.body) });
      return [r.statusCode, JSON.parse(r.body)];
    }
    return [404, { error: "no function " + name }];
  }
  function checkoutTailwind() {
    const dir = mkdtempSync(join(tmpdir(), "fee-tw-"));
    writeFileSync(join(dir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
    writeFileSync(join(dir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
    const r = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(dir, "tw.config.cjs"), "-i", join(dir, "in.css"), "-o", join(dir, "out.css")], { encoding: "utf8" });
    return r.status === 0 ? readFileSync(join(dir, "out.css"), "utf8") : "";
  }
  const TW_CSS = checkoutTailwind();
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const PORT = Number(process.env.BUYER_FEE_PORT || 8996);
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, "http://x");
        if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
        const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (m) {
          const [code, json] = await fn(m[1], req, body);
          res.writeHead(code, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(json));
        }
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        res.end(readFileSync(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));
  const BASE = `http://127.0.0.1:${PORT}`;
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  const FIXTURE = join(mkdtempSync(join(tmpdir(), "fee-photo-")), "fixture.jpg");
  writeFileSync(FIXTURE, Buffer.from(fixturePhotoBase64(1200, 800), "base64"));

  async function openCheckout(cart) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host === `127.0.0.1:${PORT}`) return route.continue();
      if (u.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/terminos.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((c) => localStorage.setItem("aria_cart_v1", JSON.stringify(c)), cart);
    await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#dniSection", { state: "visible", timeout: 30000 });
    return { context, page };
  }
  async function fillForm(page, city = "Lima") {
    await page.fill("#custName", "Ana Prueba");
    await page.fill("#custEmail", "ana@correo.test");
    await page.fill("#custPhone", "+51 900 000 000");
    await page.fill("#custDoc", "45678912");
    await page.fill("#addrLine", "Av. Prueba 123");
    await page.fill("#addrDistrict", "Surco");
    await page.selectOption("#addrRegion", "Lima");
    await page.selectOption("#destCity", city);
    await page.waitForFunction(() => document.querySelectorAll("#courierSelect option:not([disabled])").length > 0, null, { timeout: 10000 }).catch(() => {});
    const opt = await page.$$eval("#courierSelect option", (os) => (os.find((o) => !o.disabled && o.value) || {}).value);
    if (opt) await page.selectOption("#courierSelect", opt);
  }
  const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim());

  try {
    await check("browser, 2 stores: Envío Aria reads S/ 2.00 with its note; store rows read the stores' own fees", async () => {
      const { context, page } = await openCheckout(CART);
      try {
        await page.waitForSelector("#sumAriaDeliveryRow:not([hidden])", { timeout: 30000 });
        assert.equal(await text(page, "#sumAriaDeliveryLabel"), "Envío Aria");
        assert.equal(await text(page, "#sumAriaDelivery"), "S/ 2.00");
        assert.equal(await text(page, "#sumAriaDeliveryNote"), "Incluye servicio de compra por tienda: S/ 1.00 × 2 tiendas");
        assert.match(await text(page, '[data-store-ship="crocs"]'), /US\$ 7\.99/, "Crocs's row is not its own $7.99");
        assert.match(await text(page, '[data-store-ship="revolve"]'), /GRATIS/, "Revolve's row is not free");
        const ship = await text(page, "#sumShip");
        assert.match(ship, new RegExp(`S/\\s?${r2(7.99 * FX).toFixed(2).replace(".", "\\.")}`), "store shipping total moved: " + ship);
        const body = await page.textContent("body");
        assert.doesNotMatch(body, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "emoji on the page");
        return `Envío Aria ${await text(page, "#sumAriaDelivery")}`;
      } finally { await context.close(); }
    });

    await check("browser, 1 store: Envío Aria reads S/ 1.00", async () => {
      const { context, page } = await openCheckout([REVOLVE]);
      try {
        await page.waitForSelector("#sumAriaDeliveryRow:not([hidden])", { timeout: 30000 });
        assert.equal(await text(page, "#sumAriaDelivery"), "S/ 1.00");
        assert.equal(await text(page, "#sumAriaDeliveryNote"), "Incluye servicio de compra por tienda: S/ 1.00 × 1 tienda");
      } finally { await context.close(); }
    });

    await check("browser -> real server: the total the page shows and posts is the one charged, to the céntimo", async () => {
      state.posted.length = 0; state.answers.length = 0; stripeCalls = [];
      const { context, page } = await openCheckout(CART);
      try {
        await fillForm(page);
        for (const side of ["front", "back"]) {
          await page.setInputFiles(`.dniSlot[data-side="${side}"] input[data-pick="camera"]`, FIXTURE);
          await page.waitForFunction((s) => document.querySelector(`.dniSlot[data-side="${s}"] .dniStatusText`).textContent.includes("Foto lista"), side, { timeout: 30000 });
        }
        await page.waitForFunction(() => !document.getElementById("payBtnEnd").disabled, null, { timeout: 30000 });
        const onScreen = await text(page, "#sumTotal");
        if (process.env.BUYER_FEE_SHOT) {
          await page.locator("aside.gridSummary").screenshot({ path: process.env.BUYER_FEE_SHOT });
        }
        await page.click("#payBtnEnd");
        for (let i = 0; i < 75 && !state.answers.length; i++) await page.waitForTimeout(200);
        if (state.posted.length !== 1) assert.fail("Pagar did not post; toast: " + (await page.textContent("#toast")));
        const sent = state.posted[0];
        const ans = state.answers[0];
        assert.equal(ans.status, 200, "server refused the page's total: " + JSON.stringify(ans.data));
        assert.equal(ans.data.totalPen, sent.shownTotalPen, "server total differs from the page's");
        assert.equal(ans.data.buyerFeePen, 2);
        assert.equal(sent.buyerFeePen, 2);
        assert.equal(Number(stripeCalls.at(-1).form["line_items[0][price_data][unit_amount]"]), Math.round(sent.shownTotalPen * 100));
        assert.ok(onScreen.startsWith("S/ " + sent.shownTotalPen.toLocaleString("en-US", { minimumFractionDigits: 2 })) || onScreen.includes(sent.shownTotalPen.toFixed(2)),
          `on screen "${onScreen}" vs posted ${sent.shownTotalPen}`);
        const order = orderOf(ans.data.orderId);
        assert.equal(order.aria.buyerFeePen, 2);
        assert.equal(order.storeShippingUsd, 7.99);
        return `page S/ ${sent.shownTotalPen} = server S/ ${ans.data.totalPen}`;
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
}

const MIN_CHECKS = 17;
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
if (chromium && passed + failures.length < MIN_CHECKS) { console.log(`  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`); process.exit(1); }
process.exit(0);
