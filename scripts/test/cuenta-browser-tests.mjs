/* ==================================================================
   MI CUENTA IN A PHONE BROWSER (#443, member-account-area brief).

   cuenta.html at 390 px against a local static server. The account
   endpoint answers through the REAL rules (_account.js accountOverview)
   over in-memory stores; sign-in, documents and uploads are stubbed.
   Every person, order and photo here is a TEST FIXTURE.

   Checks:
     - signed out: the sign-in form and the guest documents rule;
     - signing in shows the orders newest-first, a single order opens
       with Aria's message, the progress line and the tracking spot;
     - the wallet renders at S/ 0.00 with its rules (never hidden);
     - with a balance, the ledger lists amount, reason and date;
     - documents: view loads the member's own photo only on tap,
       delete removes the pack, replace uploads both sides compressed;
     - the saved cart resumes into the checkout;
     - the homepage bundle links "Mi cuenta" for a signed-in visitor.
   Phone screenshots go to reports/screens/cuenta-*.png.

   RUN: node scripts/test/cuenta-browser-tests.mjs
   Port: CUENTA_BROWSER_PORT (default 8995).
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import jpegjs from "jpeg-js";
import { accountOverview } from "../../netlify/functions/_account.js";
import { validateUpload, newDocId } from "../../netlify/functions/_dni-docs.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n").slice(0, 14).join("\n         ")); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
if (!chromium) { console.log("  (skipped: no Playwright)"); process.exit(0); }

const SHOTS = join(ROOT, "reports/screens");
mkdirSync(SHOTS, { recursive: true });

/* TEST FIXTURE photos: random pixels, not a document. */
function pixels(w, h, seed = 1) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = (x * 7 + y * 3 * seed) % 256; data[i + 1] = (x * y + seed) % 251; data[i + 2] = (x ^ y) % 241; data[i + 3] = 255;
  }
  return jpegjs.encode({ data, width: w, height: h }, 90).data;
}
const FIXTURE = join(ROOT, "scripts/test/.dni-fixture.jpg");
writeFileSync(FIXTURE, pixels(2400, 1600));
const DOC_PHOTO = pixels(320, 200, 3);

function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async () => ({ blobs: [...m.keys()].map((key) => ({ key })) }),
  };
}

/* TEST FIXTURES: one member, two orders (one in transit, one delivered), a cart, a saved document. */
const ME = "socia@correo.test";
const IMG = "/__img/";
function fixtureStores({ balance = 0 } = {}) {
  const order = (id, createdAt, items, over = {}) => ({
    orderId: id, createdAt, status: "confirmed", paymentStatus: "paid", buyerEmail: ME,
    customer: { name: "Socia Prueba", email: ME }, shipping: { addrLine: "Calle Prueba 123", addrDistrict: "Miraflores", destCity: "Lima" },
    items, orderTotalPen: 412.8, pricePenCharged: 412.8, walletAppliedPen: 0, ...over,
  });
  return {
    orders: memStore({
      "ARIA-20261020-B7F0X1": order("ARIA-20261020-B7F0X1", "2026-10-20T16:10:00Z", [
        { title: "Fixture Doll with Dress", brand: "Fixture", priceUsd: 24.99, qty: 1, image: `${IMG}a.jpg` },
        { title: "Fixture Dreamhouse Pool Party", brand: "Fixture", priceUsd: 49.99, qty: 1, image: `${IMG}b.jpg` },
      ], { recipient: { name: "Recibe Prueba", idNumber: "45678912", relationship: "Hermana" } }),
      "ARIA-20261002-AA11BB": order("ARIA-20261002-AA11BB", "2026-10-02T12:00:00Z", [
        { title: "Fixture Running Shoe", brand: "Fixture", priceUsd: 89.99, qty: 1, selectedSize: "8", image: `${IMG}c.jpg` },
      ], { orderTotalPen: 389.5, pricePenCharged: 369.5, walletAppliedPen: 20 }),
    }),
    shipments: memStore({
      "ARIA-SHIP-261021-AB12": { shipmentId: "ARIA-SHIP-261021-AB12", createdAt: "2026-10-21T00:00:00Z", status: "miami_received", orderIds: ["ARIA-20261020-B7F0X1"], trackingNumber: "AVI-77001",
        statusHistory: [{ status: "purchased_usa", at: "2026-10-20T20:00:00Z" }, { status: "retailer_shipped", at: "2026-10-21T15:00:00Z" }, { status: "miami_received", at: "2026-10-22T18:00:00Z" }] },
      "ARIA-SHIP-261003-CD34": { shipmentId: "ARIA-SHIP-261003-CD34", createdAt: "2026-10-03T00:00:00Z", status: "delivered", orderIds: ["ARIA-20261002-AA11BB"], deliveredAt: "2026-10-14T19:00:00Z",
        statusHistory: [{ status: "purchased_usa", at: "2026-10-02T20:00:00Z" }, { status: "in_transit", at: "2026-10-08T00:00:00Z" }, { status: "in_customs", at: "2026-10-10T00:00:00Z" }, { status: "delivered", at: "2026-10-14T19:00:00Z" }] },
    }),
    wallet: memStore(balance ? { [ME]: { balancePen: balance, txns: [
      { ts: "2026-10-15T00:00:00Z", kind: "credit", amountPen: 18.2, reason: "Tu paquete pesó 1.4 kg menos de lo estimado", orderId: "ARIA-20261002-AA11BB", balanceAfterPen: 38.2 },
      { ts: "2026-10-02T12:00:00Z", kind: "debit", amountPen: 20, reason: "Usado en tu pedido", orderId: "ARIA-20261002-AA11BB", balanceAfterPen: 20 },
      { ts: "2026-09-30T00:00:00Z", kind: "credit", amountPen: 40, reason: "Bienvenida Key Club", orderId: null, balanceAfterPen: 40 },
    ] } } : {}),
    carts: memStore({ [ME]: { cart: [{ title: "Fixture Graphic Tee", priceUsd: 24, dutiableUsd: 22.43, weightKg: 0.25, qty: 1, selectedSize: "M", image: `${IMG}d.jpg` }] } }),
    users: memStore({ [ME]: { email: ME, name: "Socia Prueba", phone: "999000111", founderStatus: "fundador", createdAt: "2026-10-01T00:00:00Z", passwordHash: "x:y" } }),
    packs: memStore({ [ME]: { recipients: [{ docNumber: "45678912", name: "Recibe Prueba", front: newDocId(), back: newDocId(), updatedAt: "2026-10-20T16:00:00Z" }] } }),
  };
}

const state = { signedIn: false, stores: fixtureStores(), calls: [] };
async function fn(name, req, body, u) {
  state.calls.push({ name, method: req.method, q: u.search, body });
  if (name === "exchange-rate") return [200, { compra: 3.72, venta: 3.75 }];
  if (name === "auth-me") return [200, { email: state.signedIn ? ME : null, name: "Socia Prueba", founderStatus: "fundador" }];
  if (name === "auth-login") { const b = JSON.parse(body || "{}"); if (b.password !== "fixture-pass") return [401, { error: "Correo o contraseña incorrectos" }]; state.signedIn = true; return [200, { email: ME }]; }
  if (name === "auth-logout") { state.signedIn = false; return [200, { ok: true }]; }
  if (name === "account") return [200, await accountOverview(state.stores, state.signedIn ? ME : null)];
  if (name === "cart-get") { const c = await state.stores.carts.get(ME, { type: "json" }); return [200, { cart: state.signedIn ? c.cart : [] }]; }
  if (name === "dni-upload") {
    const b = JSON.parse(body || "{}");
    const v = validateUpload(b);
    return v.ok ? [200, { token: newDocId(), side: b.side, bytes: v.bytes }] : [400, { error: v.error }];
  }
  if (name === "dni-pack") {
    if (req.method === "DELETE") { await state.stores.packs.delete(ME); return [200, { removed: 1 }]; }
    if (req.method === "POST") { const b = JSON.parse(body || "{}"); return b.front && b.back ? [200, { ok: true }] : [400, { error: "Faltan fotos" }]; }
    if (u.searchParams.get("side")) return ["raw", DOC_PHOTO];
    return [200, { signedIn: true, recipients: [] }];
  }
  if (["wallet-get", "founders-status", "cart-save"].includes(name)) return [200, {}];
  return [404, { error: "no function " + name }];
}

const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PORT = Number(process.env.CUENTA_BROWSER_PORT || 8995);
const SHADES = { a: [244, 196, 99], b: [36, 86, 160], c: [10, 31, 68], d: [228, 233, 242] };
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", async () => {
    try {
      const u = new URL(req.url, "http://x");
      const img = /^\/__img\/([a-z])\.jpg$/.exec(u.pathname);
      if (img) {
        /* Flat-colour placeholders: no product photo is invented for a screenshot. */
        const [r, g, b] = SHADES[img[1]] || [200, 200, 200];
        const data = Buffer.alloc(64 * 64 * 4); for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
        res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(jpegjs.encode({ data, width: 64, height: 64 }, 80).data);
      }
      const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
      if (m) {
        const [code, json] = await fn(m[1], req, body, u);
        if (code === "raw") { res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" }); return res.end(json); }
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

async function open(path = "/cuenta.html") {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.route("**/*", (route) => (new URL(route.request().url()).host === `127.0.0.1:${PORT}` ? route.continue() : route.abort()));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  return { context, page, errors };
}
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `cuenta-${name}.png`), fullPage: true });
const noEmoji = (t) => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t);

await check("signed out: sign-in form and the guest documents rule; a wrong password says so", async () => {
  state.signedIn = false;
  const { context, page, errors } = await open();
  await page.waitForSelector("#signedOut:not([hidden])");
  const text = await page.textContent("#signedOut");
  assert(/30 días después de que tu pedido se entrega/.test(text), "guest rule missing");
  await page.fill("#loginEmail", ME); await page.fill("#loginPass", "wrong");
  await page.click("#loginForm button[type=submit]");
  await page.waitForSelector("#loginErr:not([hidden])");
  assert(/incorrectos/.test(await page.textContent("#loginErr")), "no error shown");
  await shot(page, "signed-out");
  assert(!errors.length, errors.join("; "));
  await context.close();
});

await check("signing in shows the orders newest first; an order opens with Aria's message, the progress line and the guía", async () => {
  state.signedIn = false; state.stores = fixtureStores();
  const { context, page, errors } = await open();
  await page.waitForSelector("#loginForm");
  await page.fill("#loginEmail", ME); await page.fill("#loginPass", "fixture-pass");
  await page.click("#loginForm button[type=submit]");
  await page.waitForSelector("#signedIn:not([hidden])");
  const ids = await page.$$eval("#ordersList .oid", (els) => els.map((e) => e.textContent));
  assert(ids.join() === "ARIA-20261020-B7F0X1,ARIA-20261002-AA11BB", ids.join());
  const pills = await page.$$eval("#ordersList .pill", (els) => els.map((e) => e.textContent));
  assert(pills.join() === "Comprado,Entregado", pills.join());
  await page.click("#ordersList .order >> nth=0 >> button");
  const detail = await page.textContent("#ordersList .order >> nth=0 >> .detail");
  assert(/Tu pedido ya está con nosotros en Miami/.test(detail), "message missing");
  assert(/ARIA-SHIP-261021-AB12/.test(detail), "guía missing");
  assert(!/AVI/.test(await page.content()), "courier number reached the page");
  assert(/Recibe: Recibe Prueba \(Hermana\)/.test(detail), "recipient missing");
  const states = await page.$$eval("#ordersList .order >> nth=0 >> .tl li", (els) => els.map((e) => e.className));
  assert(states.join() === "done,current,ahead,ahead,ahead,ahead", states.join());
  assert(noEmoji(await page.textContent("body")), "emoji on the page");
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(w <= 390, `horizontal scroll: ${w}px`);
  await shot(page, "orders");
  assert(!errors.length, errors.join("; "));
  await context.close();
});

await check("the wallet renders at S/ 0.00 with its rules; with a balance the ledger shows amount, reason and date", async () => {
  state.signedIn = true; state.stores = fixtureStores({ balance: 0 });
  let { context, page } = await open();
  await page.waitForSelector("#walletBox .bal");
  assert((await page.textContent("#walletBox .bal")).trim() === "S/ 0.00", await page.textContent("#walletBox .bal"));
  assert(/\$5 por cada \$100 en productos/.test(await page.textContent("#walletBox")), "rule missing");
  await page.locator("#keyclub").screenshot({ path: join(SHOTS, "cuenta-wallet-zero.png") });
  await context.close();
  state.stores = fixtureStores({ balance: 38.2 });
  ({ context, page } = await open());
  await page.waitForSelector("#walletBox .ledger");
  assert((await page.textContent("#walletBox .bal")).trim() === "S/ 38.20");
  const rows = await page.$$eval("#walletBox .ledger > div", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
  assert(rows.length === 3 && /pesó 1\.4 kg menos.*15 oct 2026.*\+S\/ 18\.20/.test(rows[0]) && /-S\/ 20\.00/.test(rows[1]), rows.join(" | "));
  await page.locator("#keyclub").screenshot({ path: join(SHOTS, "cuenta-wallet.png") });
  await context.close();
});

await check("documents: the photo loads only on tap; replace uploads both sides compressed; delete removes the pack", async () => {
  state.signedIn = true; state.stores = fixtureStores(); state.calls = [];
  const { context, page, errors } = await open();
  await page.waitForSelector("#docsBox [data-doc]");
  assert(/Terminado en 912/.test(await page.textContent("#docsBox")), "masked number missing");
  assert(!(await page.content()).includes("45678912"), "whole document number printed");
  assert(!state.calls.some((c) => c.name === "dni-pack" && /side=/.test(c.q)), "photo fetched before tap");
  await page.click("#docsBox [data-act=view]");
  await page.waitForFunction(() => [...document.querySelectorAll("#docsBox .doc-photos img")].every((i) => i.complete && i.naturalWidth > 0));
  await page.click("#docsBox [data-act=replace]");
  for (const side of ["front", "back"]) {
    await page.setInputFiles(`#docsBox .slot[data-side=${side}] input:not([capture])`, FIXTURE);
    await page.waitForFunction((s) => /Foto lista/.test(document.querySelector(`#docsBox .slot[data-side=${s}] .st`).textContent), side);
  }
  const ups = state.calls.filter((c) => c.name === "dni-upload").map((c) => Buffer.from(JSON.parse(c.body).data, "base64").length);
  assert(ups.length === 2 && ups.every((b) => b < 700000), `upload sizes ${ups}`);
  await shot(page, "documents-replace");
  await page.click("#docsBox .replace button.btn:last-child");
  await page.waitForFunction(() => !document.querySelector("#docsBox .replace:not([hidden])"));
  const post = state.calls.find((c) => c.name === "dni-pack" && c.method === "POST");
  assert(post && JSON.parse(post.body).docNumber === "45678912", "replace not sent");
  page.once("dialog", (d) => d.accept());
  await page.click("#docsBox [data-act=delete]");
  await page.waitForFunction(() => /No tienes documentos guardados/.test(document.getElementById("docsBox").textContent));
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `uploads ${ups.map((b) => Math.round(b / 1024) + " KB").join(", ")}`;
});

await check("the saved cart shows in soles and 'Retomar mi compra' opens the checkout with it", async () => {
  state.signedIn = true; state.stores = fixtureStores();
  const { context, page } = await open();
  await page.waitForSelector("#resumeBtn");
  await page.waitForFunction(() => /S\/ 90\.00/.test(document.getElementById("cartBox").textContent));
  await page.locator("#carrito").screenshot({ path: join(SHOTS, "cuenta-cart.png") });
  await page.evaluate(() => localStorage.removeItem("aria_cart_v1"));
  await Promise.all([page.waitForURL(/checkout\.html/), page.click("#resumeBtn")]);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
  assert(cart.length === 1 && cart[0].title === "Fixture Graphic Tee" && cart[0].dutiableUsd === 22.43, JSON.stringify(cart));
  await context.close();
});

await check("the homepage bundle links Mi cuenta for a signed-in visitor (desktop and mobile menus)", async () => {
  const idx = readFileSync(join(ROOT, "index.html"), "utf8");
  const ref = /build\/app-([0-9a-f]{16})\.js/.exec(idx);
  assert(ref, "no bundle reference");
  const src = readFileSync(join(ROOT, `build/app-${ref[1]}.js`), "utf8");
  assert((src.match(/href="\/cuenta\.html"/g) || []).length === 2, "Mi cuenta link count");
  assert(readdirSync(join(ROOT, "build/min")).includes(`app-${ref[1]}.js`), "min copy missing");
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
