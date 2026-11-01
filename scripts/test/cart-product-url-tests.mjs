/* ==================================================================
   CART AND ORDER LINES CARRY THE PRODUCT'S OWN PAGE (buyer dispatch).

   Every cart line, and every saved order line, keeps `url`: the retailer
   product page of the catalogue record the card or product page was
   built from, so the purchasing agent's buy packet can deep-link the
   buyer. Absolute http(s) only: a record with no URL, or only a
   relative path (some Victoria's Secret beauty records), stores none.
   Never invented, never built from a title.

   And the storefront still never links out: the URL is data only. It is
   never an href (or any text) in the cart, the checkout, the order email
   or Mi cuenta.

   Checks:
     unit     orders-create keeps an absolute `url` on each saved line and
              drops anything else; repricing keeps it; the email and the
              Mi cuenta view never carry it; the PDP shards hold each
              record's absolute URL and never a relative one;
     browser  (headless Chromium, local static server, functions stubbed)
              homepage card -> product view -> Agregar al carrito stores
              the record's URL; a record with none or a relative one
              stores none; producto.html does the same; checkout sends
              `url` in the orders-create request; the cart, checkout,
              product page and Mi cuenta never show it as a link.

   RUN: node scripts/test/cart-product-url-tests.mjs
   Port: CART_URL_PORT (default 8961).
   PLAYWRIGHT_CHROMIUM=<path> picks the browser binary.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n").slice(0, 8).join("\n         ")); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

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

/* ---- TEST FIXTURES: real catalogue records ---- */
const absolute = (u) => typeof u === "string" && /^https?:\/\/[^\s/?#]+/i.test(u.trim());
function itemsOf(file, retailer) {
  const d = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
  const out = [];
  for (const b of Object.values(d.retailers[retailer].departments)) for (const it of (Array.isArray(b) ? b : b.items || [])) out.push(it);
  return out;
}
/* A Zumiez record that sells plainly (no size list) and has its own page. */
const ZUMIEZ = itemsOf("zumiez-catalog.json", "zumiez").find((it) =>
  !(Array.isArray(it.sizes) && it.sizes.length) && !it.sizesPending && Number(it.price) > 10 && Number(it.price) < 60 && absolute(it.url));
const ZTITLE = ZUMIEZ && (ZUMIEZ.title || ZUMIEZ.name);
const VS = itemsOf("beauty-catalog.json", "victoriassecret");
const VS_REL = VS.filter((it) => typeof it.url === "string" && it.url.startsWith("/"));

/* ==================================================================
   UNIT
   ================================================================== */
console.log("unit: orders-create, email, Mi cuenta, PDP shards");
const OC = await import(join(ROOT, "netlify/functions/orders-create.js"));
const M = await import(join(ROOT, "netlify/functions/_checkout-model.js"));
const { orderConfirmationEmail } = await import(join(ROOT, "netlify/functions/_order-email.js"));
const { accountOverview } = await import(join(ROOT, "netlify/functions/_account.js"));

await check("the fixture records exist (a sellable Zumiez record with its URL; VS beauty records with relative paths)", () => {
  assert(ZUMIEZ, "no sizeless Zumiez record with an absolute URL");
  assert(VS_REL.length > 0, "no relative VS beauty URL left -- the relative-path case needs a new fixture");
  return `${ZTITLE} | ${VS_REL.length} relative VS beauty URLs`;
});

await check("productPageUrl keeps an absolute http(s) URL and nothing else", () => {
  const f = OC.productPageUrl;
  assert(f(ZUMIEZ.url) === new URL(ZUMIEZ.url).href, "absolute URL changed");
  assert(f("  " + ZUMIEZ.url + " ") === new URL(ZUMIEZ.url).href, "whitespace not trimmed");
  for (const bad of ["/us/vs/beauty-catalog/1127421900", "//www.zumiez.com/x.html", "javascript:alert(1)", "ftp://x.com/a", "https://u:p@x.com/a", "https://x.com/a b", "", null, 42, {}])
    assert(f(bad) === null, "kept " + JSON.stringify(bad));
});

const FX = 3.75;
globalThis.fetch = async (url) => {
  if (String(url).endsWith("/.netlify/functions/exchange-rate")) return new Response(JSON.stringify({ venta: FX, compra: 3.7 }));
  throw new Error("unexpected fetch " + url);
};
await check("orders-create saves `url` on each line: absolute kept, relative or missing dropped, never on a discount line", async () => {
  delete process.env.STRIPE_SECRET_KEY;   // production without a key: the record is written, nothing is charged
  const lines = [
    { retailer: "zumiez", title: ZTITLE, priceUsd: 25, dutiableUsd: 21, weightKg: 0.3, qty: 1, url: ZUMIEZ.url },
    { retailer: "zumiez", title: "Fixture Relative Tee", priceUsd: 20, dutiableUsd: 18, weightKg: 0.3, qty: 1, url: "/us/vs/beauty-catalog/1127421900" },
    { retailer: "zumiez", title: "Fixture No URL Tee", priceUsd: 20, dutiableUsd: 18, weightKg: 0.3, qty: 1 },
    { retailer: "zumiez", title: "Fixture Script Tee", priceUsd: 20, dutiableUsd: 18, weightKg: 0.3, qty: 1, url: "javascript:alert(1)" },
    { lineType: "bundle-discount", title: "Descuento combo", priceUsd: -2, qty: 1, url: ZUMIEZ.url },
  ];
  const res = await OC.handler({ httpMethod: "POST", headers: { host: "ariashop.pe" }, body: JSON.stringify({
    customer: { name: "Ana Prueba", email: "ana@correo.test", idNumber: "45678912" }, shipping: { destCity: "Lima" },
    items: lines, quote: { total_usd: 120, flete_usd: 26, source: "avi" }, shippingMode: "consolidated",
  }) });
  assert(res.statusCode === 200, res.statusCode + " " + res.body);
  const orders = globalThis.__blobs.get("orders");
  const saved = [...orders.values()].map((v) => JSON.parse(v)).find((o) => Array.isArray(o.items) && o.items.some((i) => i.title === ZTITLE));
  assert(saved, "no order saved");
  const by = Object.fromEntries(saved.items.map((i) => [i.title, i]));
  assert(by[ZTITLE].url === new URL(ZUMIEZ.url).href, "absolute url lost: " + by[ZTITLE].url);
  assert(!("url" in by["Fixture Relative Tee"]), "relative url kept");
  assert(!("url" in by["Fixture No URL Tee"]), "url invented");
  assert(!("url" in by["Fixture Script Tee"]), "javascript: url kept");
  assert(!("url" in by["Descuento combo"]), "url on a discount line");
  return saved.orderId;
});

await check("repricing (the charged path) keeps the line's url", () => {
  const r = M.repriceCart([{ retailer: "zumiez", title: ZTITLE, priceUsd: 25, qty: 1, url: ZUMIEZ.url }], {});
  assert(r.lines[0].url === ZUMIEZ.url, "repriceCart dropped url");
});

const ORDER = {
  orderId: "ARIA-20261101-URL001", createdAt: "2026-11-01T12:00:00Z", status: "confirmed", paymentStatus: "paid", buyerEmail: "socia@correo.test",
  customer: { name: "Socia Prueba", email: "socia@correo.test" }, shipping: { destCity: "Lima", addrLine: "Calle 1" },
  items: [{ retailer: "zumiez", title: ZTITLE, brand: "Fixture", priceUsd: 25, qty: 1, url: ZUMIEZ.url, image: "https://example.test/a.jpg" }],
  orderTotalPen: 200, pricePenCharged: 200, walletAppliedPen: 0, fxRateUsed: FX,
};
await check("the order confirmation email never carries the line's url", () => {
  const m = orderConfirmationEmail(ORDER);
  const all = JSON.stringify(m);
  assert(!all.includes(ZUMIEZ.url), "url in the email");
  assert(!/zumiez\.com/i.test(all), "a retailer link in the email");
});

function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async () => ({ blobs: [...m.keys()].map((key) => ({ key })) }),
  };
}
const ME = "socia@correo.test";
const accountStores = () => ({
  orders: memStore({ [ORDER.orderId]: ORDER }),
  shipments: memStore({}),
  wallet: memStore({}),
  carts: memStore({ [ME]: { cart: [{ retailer: "zumiez", title: ZTITLE, priceUsd: 25, qty: 1, url: ZUMIEZ.url }] } }),
  users: memStore({ [ME]: { email: ME, name: "Socia Prueba", createdAt: "2026-10-01T00:00:00Z", passwordHash: "x:y" } }),
  packs: memStore({}),
});
await check("Mi cuenta's account view (orders and saved cart) never carries the url", async () => {
  const v = await accountOverview(accountStores(), ME);
  assert(v.orders.length === 1 && v.orders[0].items.length === 1 && v.cart.length === 1, "fixture order/cart missing: " + JSON.stringify(v).slice(0, 200));
  assert(!JSON.stringify(v).includes(ZUMIEZ.url), "url reached the account view");
});

const { liftPage } = await import(join(ROOT, "scripts/build-pdp-slices.mjs"));
const P = liftPage(ROOT);
const shardRecs = (title) => {
  const key = P.norm(title);
  const f = join(ROOT, "assets/pdp/p/" + P.pdpShard(key) + ".json");
  return (JSON.parse(readFileSync(f, "utf8"))[key]) || [];
};
await check("the PDP shard keeps each record's absolute URL, and never a relative one", () => {
  const z = shardRecs(ZUMIEZ.name || ZUMIEZ.title).filter((r) => r.retailer === "zumiez");
  assert(z.some((r) => r.url === ZUMIEZ.url), "shard record has no url (rebuild: node scripts/build-pdp-slices.mjs)");
  let rel = 0;
  for (const it of VS_REL.slice(0, 40)) for (const r of shardRecs(it.name || it.title)) if (r.url && !absolute(r.url)) rel++;
  assert(rel === 0, rel + " relative urls in shards");
});

/* ==================================================================
   BROWSER
   ================================================================== */
let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
if (!chromium) { console.log("  (browser half skipped: no Playwright)"); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }

const state = { orders: [], account: accountStores(), signedIn: false, shardPatch: null };
async function fn(name, req, body) {
  if (name === "exchange-rate") return [200, { compra: 3.72, venta: 3.75, fecha: "2026-11-01" }];
  if (["wallet-get", "cart-save", "cart-get"].includes(name)) return state.signedIn && name === "cart-get" ? [200, { cart: [] }] : [401, { error: "No autenticado" }];
  if (name === "founders-status") return [200, {}];
  if (name === "auth-me") return [200, state.signedIn ? { email: ME, name: "Socia Prueba" } : {}];
  if (name === "account") return [200, await accountOverview(state.account, state.signedIn ? ME : null)];
  if (name === "dni-pack") return [200, { signedIn: true, recipients: [{ docNumber: "45678912", name: "Ana Prueba", updatedAt: "2026-10-22T00:00:00Z" }] }];
  if (name === "orders-create") { state.orders.push(JSON.parse(body)); return [400, { error: "Prueba: pedido capturado, no se cobró nada." }]; }
  if (name === "shipping-quote") {
    const b = JSON.parse(body || "{}");
    const flete = Math.round(Math.max(1, Number(b.peso_kg) || 1) * 9 * 100) / 100;
    const total = Math.round(((Number(b.valor_usd) || 0) + flete) * 100) / 100;
    return [200, { total_usd: total, total_pen: Math.round(total * 3.75 * 100) / 100, flete_usd: flete, source: "avi" }];
  }
  if (name === "resolve-weight") {
    const { handler } = await import(join(ROOT, "netlify/functions/resolve-weight.js"));
    const r = await handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: {} }, {});
    return [r.statusCode, JSON.parse(r.body)];
  }
  return [404, { error: "no function " + name }];
}
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PORT = Number(process.env.CART_URL_PORT || 8961);
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", async () => {
    try {
      const u = new URL(req.url, "http://x");
      const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
      if (m) {
        const [code, json] = await fn(m[1], req, body);
        res.writeHead(code, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(json));
      }
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
      /* A product page fixture: the shard as built, with one record's url rewritten. */
      if (state.shardPatch && u.pathname.startsWith("/assets/pdp/p/")) {
        const d = JSON.parse(readFileSync(p, "utf8"));
        state.shardPatch(d);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(d));
      }
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

async function newPage(localCart = null) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.host === `127.0.0.1:${PORT}`) return route.continue();
    if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
    return route.abort();
  });
  if (localCart) await context.addInitScript((c) => { try { if (!sessionStorage.getItem("__seeded")) { localStorage.setItem("aria_cart_v1", JSON.stringify(c)); sessionStorage.setItem("__seeded", "1"); } } catch {} }, localCart);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message)));
  return { context, page, errors };
}
/* No link out: no href (or any attribute or text) anywhere on the page holds the URL. */
async function assertNoLinkOut(page, url, where) {
  const r = await page.evaluate((u) => ({
    hrefs: [...document.querySelectorAll("[href]")].map((a) => a.getAttribute("href")).filter((h) => h && (h === u || h.includes(new URL(u).host))),
    inHtml: document.documentElement.outerHTML.includes(u),
  }), url);
  assert(!r.hrefs.length, `${where}: retailer href(s) ${r.hrefs.join(", ")}`);
  assert(!r.inHtml, `${where}: the url is in the page`);
}
const storedCart = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));

console.log("browser: homepage card -> Agregar al carrito");
/* A catalogue record through the homepage's own normaliser, onto a real
   card. A tapped card opens producto.html (index.html's showProduct
   override), whose button adds the line. */
async function openHome() {
  const s = await newPage();
  await s.page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await s.page.waitForFunction(() => typeof cartLoaded !== "undefined" && cartLoaded === true && typeof normalizeLiveItem === "function", null, { timeout: 30000 });
  return s;
}
/* The in-page doors (the assistant's "agrégalo", the cart's cross-sell,
   combos) build their line from a record the page normalised. */
async function addFromAssistant(page, raw) {
  return page.evaluate((raw) => {
    const it = { ...normalizeLiveItem(raw, { retailer: "zumiez" }), retailer: "zumiez" };
    chatAddShownToCart({ retailer: "zumiez", item: it }, "");
    return JSON.parse(JSON.stringify(cart)).find((l) => l.title === it.title) || null;
  }, raw);
}
try {
  await check("homepage card -> product page -> Agregar al carrito: the line stores the record's absolute url; card, page and cart never show it", async () => {
    const { context, page, errors } = await openHome();
    try {
      const cardHtml = await page.evaluate((raw) => {
        const it = { ...normalizeLiveItem(raw, { retailer: "zumiez" }), retailer: "zumiez" };
        const host = document.createElement("div");
        host.id = "__fixtureCard";
        host.innerHTML = listingCardHTML(it, "zumiez");
        document.body.appendChild(host);
        return host.innerHTML;
      }, ZUMIEZ);
      assert(!cardHtml.includes(ZUMIEZ.url), "the url is in the card markup");
      await Promise.all([page.waitForURL(/\/producto\.html\?/, { timeout: 30000 }), page.click("#__fixtureCard [onclick]")]);
      await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
      await page.click("#add-cart-btn");
      await page.waitForSelector("#cart-confirm:not([hidden])", { timeout: 10000 });
      const line = (await storedCart(page)).find((l) => l.title === ZTITLE);
      assert(line, "nothing added; errors: " + errors.join(" | "));
      assert(line.url === ZUMIEZ.url, "line url: " + line.url);
      await assertNoLinkOut(page, ZUMIEZ.url, "product page");
      /* Back on the homepage, the cart view as the shopper opens it. */
      await page.goto(BASE + "/?carrito=1", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof cartLoaded !== "undefined" && cartLoaded === true, null, { timeout: 30000 });
      await page.waitForFunction((t) => (document.getElementById("cartItemsWrap") || {}).innerText?.includes(t), ZTITLE, { timeout: 15000 });
      await assertNoLinkOut(page, ZUMIEZ.url, "homepage cart");
      return ZUMIEZ.url;
    } finally { await context.close(); }
  });
  await check("homepage's in-page doors (assistant, cross-sell, combos): absolute url stored; none or relative stores none", async () => {
    const { context, page, errors } = await openHome();
    try {
      const abs = await addFromAssistant(page, { ...ZUMIEZ, name: "Fixture Url Test Tank Absolute", title: undefined });
      const none = await addFromAssistant(page, { ...ZUMIEZ, url: undefined, name: "Fixture Url Test Tank No Link", title: undefined });
      const rel = await addFromAssistant(page, { ...ZUMIEZ, url: "/us/vs/beauty-catalog/1127421900", name: "Fixture Url Test Tank Relative", title: undefined });
      assert(abs && none && rel, "lines not added; errors: " + errors.join(" | "));
      assert(abs.url === ZUMIEZ.url, "absolute url not stored: " + abs.url);
      assert(!("url" in none), "url invented: " + none.url);
      assert(!("url" in rel), "relative url stored: " + rel.url);
      /* A door that hands addToCart a url of its own: only an absolute one stays. */
      const sent = await page.evaluate(() => { addToCart({ retailer: "zumiez", title: "Fixture Url Test Sent Relative", priceUsd: 12, weightKg: 0.2, url: "/x/y" }); return JSON.parse(JSON.stringify(cart)).find((l) => l.title === "Fixture Url Test Sent Relative"); });
      assert(sent && !("url" in sent), "a relative url passed the funnel");
      /* Two records, one retailer + title, two different pages: ambiguous, none kept. */
      const amb = await page.evaluate((raw) => {
        normalizeLiveItem({ ...raw, name: "Fixture Url Test Twin", url: "https://www.zumiez.com/twin-a.html" }, { retailer: "zumiez" });
        const it = { ...normalizeLiveItem({ ...raw, name: "Fixture Url Test Twin", url: "https://www.zumiez.com/twin-b.html" }, { retailer: "zumiez" }), retailer: "zumiez" };
        chatAddShownToCart({ retailer: "zumiez", item: it }, "");
        return JSON.parse(JSON.stringify(cart)).find((l) => l.title === "Fixture Url Test Twin");
      }, ZUMIEZ);
      assert(amb && !("url" in amb), "an ambiguous url was guessed: " + (amb && amb.url));
      await page.evaluate(() => { showPage("cartView"); renderCartView(); });
      await assertNoLinkOut(page, ZUMIEZ.url, "homepage cart");
    } finally { await context.close(); }
  });

  console.log("browser: producto.html -> Agregar al carrito");
  async function addFromPdp(title, patch) {
    state.shardPatch = patch || null;
    const { context, page, errors } = await newPage();
    try {
      await page.goto(`${BASE}/producto.html?producto=${encodeURIComponent(title)}&tienda=zumiez`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
      await page.click("#add-cart-btn");
      await page.waitForSelector("#cart-confirm:not([hidden])", { timeout: 10000 });
      const line = (await storedCart(page)).find((l) => l.title === title) || null;
      return { context, page, line, errors };
    } catch (e) { await context.close(); throw e; }
    finally { state.shardPatch = null; }
  }
  const zname = ZUMIEZ.name || ZUMIEZ.title;
  const setUrl = (url) => (d) => { for (const r of d[P.norm(zname)] || []) if (r.retailer === "zumiez") { if (url === undefined) delete r.url; else r.url = url; } };
  await check("producto.html: the cart line stores the record's absolute url, and the page never shows it", async () => {
    const { context, page, line, errors } = await addFromPdp(zname);
    try {
      assert(line, "nothing added; errors: " + errors.join(" | "));
      assert(line.url === ZUMIEZ.url, "line url: " + line.url);
      await assertNoLinkOut(page, ZUMIEZ.url, "producto.html");
    } finally { await context.close(); }
  });
  await check("producto.html: a record with no url, or only a relative one, stores none", async () => {
    for (const [label, url] of [["none", undefined], ["relative", "/us/vs/beauty-catalog/1127421900"]]) {
      const { context, line, errors } = await addFromPdp(zname, setUrl(url));
      try {
        assert(line, label + ": nothing added; errors: " + errors.join(" | "));
        assert(!("url" in line), label + ": stored " + line.url);
      } finally { await context.close(); }
    }
  });

  console.log("browser: checkout -> orders-create");
  await check("checkout sends each line's url to orders-create, and never shows it", async () => {
    state.orders.length = 0;
    const CART = [{ retailer: "zumiez", title: ZTITLE, priceUsd: 25, dutiableUsd: 21.4, weightKg: 0.3, weightEstimated: true, qty: 1, image: "", url: ZUMIEZ.url },
      { retailer: "zumiez", title: "Fixture Url Test Plain Tee", priceUsd: 20, dutiableUsd: 18, weightKg: 0.25, weightEstimated: true, qty: 1, image: "" }];
    const { context, page } = await newPage(CART);
    try {
      await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#checkoutForm", { timeout: 30000 });
      await page.waitForFunction((t) => (document.getElementById("checkoutItemsWrap") || {}).innerText?.includes(t), ZTITLE, { timeout: 30000 });
      await assertNoLinkOut(page, ZUMIEZ.url, "checkout");
      await page.fill("#custName", "Ana Prueba");
      await page.fill("#custEmail", "ana@correo.test");
      await page.fill("#custPhone", "+51 900 000 000");
      await page.fill("#custDoc", "45678912");
      await page.fill("#addrLine", "Av. Prueba 123");
      await page.fill("#addrDistrict", "Surco");
      await page.selectOption("#addrRegion", "Lima");
      await page.selectOption("#destCity", "Lima");
      await page.waitForFunction(() => document.querySelectorAll("#courierSelect option:not([disabled])").length > 0, null, { timeout: 10000 }).catch(() => {});
      const opt = await page.$$eval("#courierSelect option", (os) => (os.find((o) => !o.disabled && o.value) || {}).value);
      if (opt) await page.selectOption("#courierSelect", opt);
      await page.waitForFunction(() => !document.getElementById("payBtnEnd").disabled, null, { timeout: 30000 });
      await page.click("#payBtnEnd");
      for (let i = 0; i < 50 && !state.orders.length; i++) await page.waitForTimeout(200);
      assert(state.orders.length === 1, "Pagar did not post the order; toast: " + (await page.textContent("#toast").catch(() => "")));
      const items = state.orders[0].items;
      const a = items.find((l) => l.title === ZTITLE), b = items.find((l) => l.title === "Fixture Url Test Plain Tee");
      assert(a && a.url === ZUMIEZ.url, "url not sent: " + JSON.stringify(a));
      assert(b && !("url" in b), "url invented for a line without one");
      await assertNoLinkOut(page, ZUMIEZ.url, "checkout after Pagar");
    } finally { await context.close(); }
  });

  console.log("browser: Mi cuenta");
  await check("Mi cuenta never shows the url (orders and saved cart), as text or as a link", async () => {
    state.signedIn = true; state.account = accountStores();
    const { context, page } = await newPage();
    try {
      await page.goto(`${BASE}/cuenta.html`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((t) => document.body.innerText.includes(t), ZTITLE, { timeout: 30000 });
      await assertNoLinkOut(page, ZUMIEZ.url, "Mi cuenta");
    } finally { await context.close(); state.signedIn = false; }
  });
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
