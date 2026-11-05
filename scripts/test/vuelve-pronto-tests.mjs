/* ==================================================================
   VUELVE PRONTO (#443 c.6585537098, Danny's site-wide rule).

   A product the store lists as sold out (the record's `so`) is
   labelled «Vuelve pronto» wherever a shopper sees it -- never
   "Próximamente" -- stays clickable, and is never addable to the cart.
   Its page asks «Avísame cuando vuelva»: notify-restock.js keeps who
   asked (validated, rate-limited, one per product and contact) and an
   anonymous count of opens; admin-restock.js shows them to the admin
   only. Products unavailable for other reasons keep their own labels.

     node scripts/test/vuelve-pronto-tests.mjs
   Screenshots (390px): VP_SHOTS=<dir> (default: no screenshots).
   ================================================================== */
import { register } from "node:module";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.stack || e).split("\n").slice(0, 6).join("\n         ")); }
}

/* ---- @netlify/blobs in memory, so the real function modules load ---- */
globalThis.__blobs = new Map();
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "const S = globalThis.__blobs;" +
      "export const connectLambda = () => {};" +
      "export function getStore(name){ if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null," +
      " setJSON: async (k,v)=>{ m.set(k, JSON.stringify(v)); }," +
      " delete: async (k)=>{ m.delete(k); }, list: async (o)=>({ blobs: [...m.keys()].filter(k=>!o||!o.prefix||k.startsWith(o.prefix)).map(key=>({key})) }) }; }"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);

const VP = await import(ROOT + "scripts/lib/vuelve-pronto.js");
const { VUELVE_PRONTO } = await import(ROOT + "scripts/lib/vuelve-pronto-data.js");
const { soldOutKeys } = await import(ROOT + "scripts/build-vuelve-pronto.mjs");
const R = await import(ROOT + "netlify/functions/_restock.js");
const NOTIFY = await import(ROOT + "netlify/functions/notify-restock.js");
const ADMIN = await import(ROOT + "netlify/functions/admin-restock.js");
const { isOffSaleItem } = await import(ROOT + "scripts/lib/off-sale.js");
const { kindOf: shadeKindOf } = await import(ROOT + "scripts/lib/shade-gate.js");
const { SIZES_PENDING } = await import(ROOT + "scripts/lib/sizes-pending-data.js");
const api = globalThis.AriaVuelvePronto;

/* A real sold-out card (CCS store page, first rail) and one in stock. */
const SOLD = { store: "ccs", title: "Vans Skate Slip-on Shoes - Navy" };
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}

console.log("vuelve pronto -- the rule");

await check("the list is the shards' own `so` flag, freshly built (scripts/build-vuelve-pronto.mjs)", () => {
  const keys = soldOutKeys();
  assert.deepEqual(VUELVE_PRONTO, keys, "scripts/lib/vuelve-pronto-data.js is stale: run node scripts/build-vuelve-pronto.mjs");
  const pages = JSON.parse(readFileSync(ROOT + "assets/data/vuelve-pronto.json", "utf8"));
  assert.deepEqual(pages.h.split(","), [...new Set(keys.map((k) => api.hashKey(k)))].sort(), "assets/data/vuelve-pronto.json is stale");
  assert.ok(keys.length > 500, "sold-out keys: " + keys.length);
  return `${keys.length} keys, pages' copy ${readFileSync(ROOT + "assets/data/vuelve-pronto.json").length} bytes`;
});

await check("sold out = the store's own flag; an in-stock product, a bundle line and nothing else are not", () => {
  assert.equal(VP.isVuelvePronto({ retailer: SOLD.store, title: SOLD.title }), true);
  assert.equal(VP.isVuelvePronto({ retailer: "CCS", title: "  vans skate slip-on   shoes - NAVY " }), true, "the key is case- and space-blind");
  assert.equal(VP.isVuelvePronto({ retailer: "ccs", title: "Vans Skate Slip-on Shoes - Not A Real Colour" }), false);
  assert.equal(VP.isVuelvePronto({ retailer: "ccs", name: "anything", so: 1 }), true, "a record's own so");
  assert.equal(VP.isVuelvePronto({ retailer: SOLD.store, title: SOLD.title, lineType: "bundle-discount" }), false);
  assert.equal(VP.vuelveProntoLines([{ retailer: SOLD.store, title: SOLD.title }, { retailer: "ccs", title: "x" }]).length, 1);
  assert.match(VP.vuelveProntoOrderError(SOLD.title), /vuelve pronto/i);
});

await check("other reasons keep their own labels: off-sale, pills and food, Tonos en camino, Tallas por confirmar", () => {
  /* nothing off sale (store, held used, not sold) is ever on the list, and isSoldOut says no to it */
  for (const k of VUELVE_PRONTO) {
    const [r, t] = k.split("::");
    if (r !== "*") assert.ok(!isOffSaleItem({ retailer: r, title: t }), "off-sale on the list: " + k);
  }
  assert.equal(VP.isVuelvePronto({ retailer: "target", title: "Anything", so: 1 }), false, "an off-sale store keeps «ya no está disponible»");
  /* sizes pending is its own state: none of those items is labelled sold out */
  const sp = SIZES_PENDING.filter((k) => VUELVE_PRONTO.includes(k));
  assert.equal(sp.length, 0, "sizes-pending items labelled Vuelve pronto: " + sp.slice(0, 3).join(" | "));
  /* a shade-gated product (no shade on its record) is never a sold-out listing */
  assert.ok(shadeKindOf({ name: "Fit Me Matte + Poreless Liquid Foundation", retailer: "walmart", dept: "beauty" }));
  assert.equal(VP.isVuelvePronto({ retailer: "walmart", title: "Fit Me Matte + Poreless Liquid Foundation" }), false);
  const pdp = readFileSync(ROOT + "producto.html", "utf8");
  assert.ok(pdp.includes("SHADE_PENDING_BUTTON") && pdp.includes(">Tallas por confirmar</button>") && pdp.includes("OFF_SALE_PRODUCT_NOTE"), "the other gates' own labels");
});

await check("the words: «Vuelve pronto», Spanish, no «Próximamente», no «agotado» shown, no emoji", () => {
  const src = readFileSync(ROOT + "vuelve-pronto.js", "utf8");
  for (const k of ["LABEL", "CTA", "PRODUCT_NOTE", "LINE_NOTE", "TOAST", "PRIVACY"]) {
    assert.ok(!/pr[oó]ximamente|coming soon/i.test(api[k]), k);
    assert.ok(!EMOJI.test(api[k]), k);
  }
  assert.equal(api.LABEL, "Vuelve pronto");
  assert.equal(api.CTA, "Avísame cuando vuelva");
  assert.equal(api.PRIVACY, "Solo te escribimos para avisarte que volvió.");
  assert.ok(!/pr[oó]ximamente|agotad/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "said to the shopper in /vuelve-pronto.js");
  const pdp = readFileSync(ROOT + "producto.html", "utf8");
  /* A SIZE the store has sold out is named so in its run (#654/#661, Danny's
     order: «(agotada)» on the disabled option, and the run's note); a
     PRODUCT never is -- it is «Vuelve pronto». */
  const sizeRun = (src) => src.replace(/'la otra está agotada\.' : 'las demás están agotadas\.'/, "").replace(/' \(agotada\)<\/option>'/, "").replace(/data-agotada="1"/, "");
  assert.ok(!/agotad/i.test(sizeRun(pdp.replace(/\/\*[\s\S]*?\*\//g, ""))), "a shopper-visible «agotado» left on the product page");
  assert.ok(!/Agotado en la tienda/.test(pdp));
  assert.match(pdp, /<em>Vuelve pronto<\/em>/);
  assert.match(pdp, />Vuelve pronto<\/button>/);
});

await check("every card page, the product page, checkout and the app load /vuelve-pronto.js", () => {
  for (const f of ["index.html", "producto.html", "checkout.html", "tienda.html", "departamento.html", "marca.html", "ofertas.html", "search.html", "disenadores.html", "ropa-interior.html"]) {
    assert.match(readFileSync(ROOT + f, "utf8"), /<script src="\/vuelve-pronto\.js"/, f);
  }
  const idx = readFileSync(ROOT + "index.html", "utf8");
  const bundle = readFileSync(ROOT + "build/" + /\/build\/(app-[0-9a-f]{16}\.js)/.exec(idx)[1], "utf8");
  assert.match(bundle, /window\.AriaVuelvePronto\.isSoldOut\(item\)/, "addToCart refuses it");
  assert.match(bundle, /data-vuelve-pronto-line/, "the cart line says so");
  const oc = readFileSync(ROOT + "netlify/functions/orders-create.js", "utf8");
  assert.match(oc, /vuelveProntoLines\(sentItems\)/, "the order endpoint refuses it");
});

console.log("\nvuelve pronto -- Avísame cuando vuelva (notify-restock)");

await check("validation: action, product, a sold-out product only, a real email or WhatsApp", () => {
  const base = { action: "notify", title: SOLD.title, store: SOLD.store, channel: "email", contact: "ana@correo.test" };
  assert.ok(R.parseRequest({ ...base, action: "buy" }).error);
  assert.ok(R.parseRequest({ ...base, store: "<script>" }).error);
  assert.ok(R.parseRequest({ ...base, title: "" }).error);
  assert.match(R.parseRequest({ ...base, title: "Vans Skate Slip-on Shoes - Not A Real Colour" }).error, /disponible/, "an in-stock product is refused");
  assert.ok(R.parseRequest({ ...base, channel: "" }).error);
  assert.ok(R.parseRequest({ ...base, contact: "ana@" }).error);
  assert.ok(R.parseRequest({ ...base, contact: "no es correo" }).error);
  assert.ok(R.parseRequest({ ...base, channel: "whatsapp", contact: "12345" }).error);
  assert.ok(R.parseRequest({ ...base, channel: "whatsapp", contact: "abc 987 654 321" }).error);
  assert.deepEqual(R.parseRequest({ ...base, website: "http://spam" }), { spam: true });
  const ok = R.parseRequest({ ...base, contact: " Ana@Correo.TEST " });
  assert.equal(ok.contact, "ana@correo.test");
  assert.equal(ok.product.url, "/producto.html?producto=" + encodeURIComponent(SOLD.title) + "&tienda=ccs", "the link is Aria's own page");
  assert.ok(!/^https?:/.test(ok.product.url));
  assert.equal(R.normalizePhone("987 654 321"), "+51987654321", "a Peruvian mobile gets +51");
  assert.equal(R.normalizePhone("+1 (305) 555-0100"), "+13055550100");
  assert.equal(R.normalizePhone("51987654321"), "+51987654321");
  assert.equal(R.normalizePhone("5551234"), null);
  /* signed in, one tap: the session's email, never the body's */
  assert.ok(R.parseRequest({ ...base, contact: "", useAccount: true }).error, "useAccount with no session");
  const acct = R.parseRequest({ ...base, contact: "", useAccount: true, accountEmail: "evil@correo.test" }, { accountEmail: "Luz@Correo.test" });
  assert.equal(acct.contact, "luz@correo.test");
  assert.equal(acct.accountEmail, "luz@correo.test");
});

await check("stored with who wanted it; one per product and contact; rate-limited per address", async () => {
  const store = memStore();
  const now = new Date("2026-11-02T15:00:00Z");
  const body = { action: "notify", title: SOLD.title, store: SOLD.store, channel: "whatsapp", contact: "987 654 321" };
  const a = await R.receiveRestock({ body, ip: "1.2.3.4", store, now, accountEmail: "luz@correo.test" });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { ok: true, contact: "+51987654321" });
  const wants = [...store.m.keys()].filter((k) => k.startsWith("want/"));
  assert.equal(wants.length, 1);
  const rec = JSON.parse(store.m.get(wants[0]));
  assert.deepEqual(Object.keys(rec).sort(), ["accountEmail", "channel", "contact", "createdAt", "productId", "store", "title", "url"]);
  assert.equal(rec.productId, R.productIdOf(SOLD.store, SOLD.title, ""));
  assert.equal(rec.createdAt, now.toISOString());
  /* the same person again (written differently): kept once, first date stands */
  const b = await R.receiveRestock({ body: { ...body, contact: "+51 987-654-321" }, ip: "1.2.3.4", store, now: new Date("2026-11-02T15:10:00Z") });
  assert.equal(b.body.already, true);
  assert.equal([...store.m.keys()].filter((k) => k.startsWith("want/")).length, 1);
  assert.equal(JSON.parse(store.m.get(wants[0])).createdAt, now.toISOString());
  /* the rate key never holds the address */
  assert.ok([...store.m.keys()].every((k) => !k.includes("1.2.3.4")));
  let last;
  for (let i = 0; i < R.RATE_PER_HOUR + 2; i++) last = await R.receiveRestock({ body: { ...body, channel: "email", contact: `p${i}@correo.test` }, ip: "9.9.9.9", store, now });
  assert.equal(last.status, 429);
  /* another address is not held back */
  assert.equal((await R.receiveRestock({ body: { ...body, channel: "email", contact: "otra@correo.test" }, ip: "5.5.5.5", store, now })).status, 200);
  /* the honeypot keeps nothing */
  const before = store.m.size;
  assert.equal((await R.receiveRestock({ body: { ...body, website: "x" }, ip: "7.7.7.7", store, now })).status, 200);
  assert.equal(store.m.size, before);
});

await check("an open of a sold-out page is counted with no personal data", async () => {
  const store = memStore();
  const now = new Date("2026-11-02T15:00:00Z");
  for (const ip of ["1.1.1.1", "2.2.2.2", "2.2.2.2"]) await R.receiveRestock({ body: { action: "view", title: SOLD.title, store: SOLD.store, contact: "ana@correo.test" }, ip, store, now });
  const v = JSON.parse(store.m.get("view/" + R.productIdOf(SOLD.store, SOLD.title, "")));
  assert.equal(v.n, 3);
  assert.ok(!JSON.stringify(v).includes("@") && !JSON.stringify([...store.m.keys()]).match(/\d+\.\d+\.\d+\.\d+/), "no contact, no address");
  assert.equal([...store.m.keys()].filter((k) => k.startsWith("want/")).length, 0, "a view stores no request");
  const bad = await R.receiveRestock({ body: { action: "view", title: "Not sold out at all", store: "ccs" }, ip: "1.1.1.1", store, now });
  assert.equal(bad.status, 400, "no counter for a product that is not sold out");
});

await check("the HTTP door: POST only, the session's account rides along; the admin list is the admin's only", async () => {
  globalThis.__blobs.clear();
  const S = (n) => { if (!globalThis.__blobs.has(n)) globalThis.__blobs.set(n, new Map()); return globalThis.__blobs.get(n); };
  S("sessions").set("sess-luz", JSON.stringify({ email: "luz@correo.test", createdAt: new Date().toISOString() }));
  S("sessions").set("sess-admin", JSON.stringify({ email: "admin@correo.test", createdAt: new Date().toISOString() }));
  process.env.ADMIN_EMAILS = "admin@correo.test";
  const post = (body, cookie) => NOTIFY.handler({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "3.3.3.3", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await NOTIFY.handler({ httpMethod: "GET", headers: {} })).statusCode, 405);
  assert.equal((await NOTIFY.handler({ httpMethod: "POST", headers: {}, body: "{nope" })).statusCode, 400);
  const one = await post({ action: "notify", title: SOLD.title, store: SOLD.store, useAccount: true, channel: "email" }, "aria_session=sess-luz");
  assert.equal(one.statusCode, 200, one.body);
  assert.equal(JSON.parse(one.body).contact, "luz@correo.test");
  const guest = await post({ action: "notify", title: SOLD.title, store: SOLD.store, channel: "email", contact: "ana@correo.test" });
  assert.equal(guest.statusCode, 200);
  assert.ok(!guest.body.includes("luz@"), "the public answer never carries another shopper's contact");
  await post({ action: "view", title: SOLD.title, store: SOLD.store });
  /* the admin's read */
  assert.equal((await ADMIN.handler({ httpMethod: "GET", headers: {} })).statusCode, 403, "no session");
  assert.equal((await ADMIN.handler({ httpMethod: "GET", headers: { cookie: "aria_session=sess-luz" } })).statusCode, 403, "a shopper's session");
  assert.equal((await ADMIN.handler({ httpMethod: "POST", headers: { cookie: "aria_session=sess-admin" } })).statusCode, 405);
  const r = await ADMIN.handler({ httpMethod: "GET", headers: { cookie: "aria_session=sess-admin" } });
  assert.equal(r.statusCode, 200);
  const d = JSON.parse(r.body);
  assert.equal(d.products.length, 1);
  const p = d.products[0];
  assert.equal(p.title, SOLD.title);
  assert.equal(p.store, "ccs");
  assert.equal(p.count, 2);
  assert.equal(p.views, 1);
  assert.deepEqual(p.interested.map((x) => x.contact).sort(), ["ana@correo.test", "luz@correo.test"]);
  assert.equal(p.interested.find((x) => x.contact === "luz@correo.test").accountEmail, "luz@correo.test");
  const adminSrc = readFileSync(ROOT + "netlify/functions/admin-restock.js", "utf8");
  assert.match(adminSrc, /if \(!isAdmin\(email\)\) return \{ statusCode: 403/);
});

/* ---------------- 390px, in the browser ---------------- */
console.log("\nvuelve pronto -- 390px");
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const SHOTS = process.env.VP_SHOTS || "";
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
globalThis.__blobs.clear();
async function fnHandler(name, req, body) {
  if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify({ compra: 3.72, venta: 3.75, fecha: "2026-11-02" }) };
  if (name === "auth-me") return { statusCode: 200, body: JSON.stringify({ email: null }) };
  if (["wallet-get", "cart-save", "cart-get"].includes(name)) return { statusCode: 401, body: JSON.stringify({ error: "No autenticado" }) };
  if (name === "notify-restock" || name === "resolve-weight" || name === "search") {
    const { handler } = await import(join(ROOT, "netlify/functions/" + name + ".js"));
    const u = new URL(req.url, "http://x");
    return handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
  }
  return { statusCode: 404, body: JSON.stringify({ error: "no function " + name }) };
}
const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", async () => {
    try {
      const u = new URL(req.url, "http://x");
      const fm = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
      if (fm) { const r = await fnHandler(fm[1], req, body); res.writeHead(r.statusCode, { "Content-Type": "application/json" }); return res.end(r.body); }
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(p));
    } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
  });
});
const PORT = Number(process.env.VP_PORT || 8947);
await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.host === `127.0.0.1:${PORT}`) return route.continue();
    if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
    if (/cdn\.tailwindcss\.com/.test(u.host)) return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    return route.abort();
  });
  const page = await context.newPage();
  return { context, page };
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pdpUrl = `${BASE}/producto.html?producto=${encodeURIComponent(SOLD.title)}&tienda=${SOLD.store}`;

await check("card: a store page labels the sold-out card «Vuelve pronto», and it still opens its product page", async () => {
  const { context, page } = await newPage();
  try {
    await page.goto(`${BASE}/tienda.html?tienda=${SOLD.store}`, { waitUntil: "domcontentloaded" });
    const sel = `a.card[href*="${encodeURIComponent(SOLD.title).replace(/'/g, "%27")}"]`;
    await page.waitForSelector(sel, { timeout: 20000 });
    await page.waitForSelector(`${sel} [data-vuelve-pronto]`, { timeout: 10000 });
    const card = page.locator(sel).first();
    await card.scrollIntoViewIfNeeded();
    const pill = await card.locator("[data-vuelve-pronto]").first().textContent();
    assert.equal(pill.trim(), "Vuelve pronto");
    const labelled = await page.locator("a.card [data-vuelve-pronto]").count();
    const total = await page.locator("a.card").count();
    assert.ok(labelled < total, "every card labelled: " + labelled + "/" + total);
    assert.ok(!/pr[oó]ximamente/i.test(await page.locator("body").innerText()));
    assert.ok(await noHScroll(page), "page scrolls sideways at 390px");
    await page.waitForTimeout(300);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "vp-card.png") });
    await card.click();
    await page.waitForURL(/producto\.html/, { timeout: 10000 });
    await page.waitForSelector("#add-cart-btn", { timeout: 20000 });
    return `${labelled} of ${total} cards labelled; tap opened ${new URL(page.url()).pathname}`;
  } finally { await context.close(); }
});

await check("product page: «Vuelve pronto», no cart, «Avísame cuando vuelva» with the privacy line; the thanks", async () => {
  const { context, page } = await newPage();
  try {
    await page.goto(pdpUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#vp-box", { timeout: 20000 });
    const s = await page.evaluate(() => ({
      btn: document.getElementById("add-cart-btn").textContent.trim(),
      disabled: document.getElementById("add-cart-btn").disabled,
      pill: (document.getElementById("p-vp") || {}).textContent || "",
      box: document.getElementById("vp-box").innerText,
      body: document.body.innerText,
    }));
    assert.equal(s.btn, "Vuelve pronto");
    assert.equal(s.disabled, true);
    assert.equal(s.pill.trim(), "Vuelve pronto");
    assert.match(s.box, /Avísame cuando vuelva/);
    assert.match(s.box, /Solo te escribimos para avisarte que volvió\./);
    assert.ok(!/Agregar al carrito|agotado|pr[oó]ximamente/i.test(s.body), "the page still offers or says the old words");
    assert.ok(!EMOJI.test(s.body));
    assert.ok(await noHScroll(page));
    /* the cart refuses it even from the console */
    const before = await page.evaluate(() => localStorage.getItem("aria_cart_v1"));
    await page.evaluate(() => { try { document.getElementById("add-cart-btn").click(); } catch (e) {} });
    assert.equal(await page.evaluate(() => localStorage.getItem("aria_cart_v1")), before, "a line was added");
    /* the anonymous open was counted */
    await page.waitForTimeout(400);
    const rs = globalThis.__blobs.get("restock") || new Map();
    assert.ok([...rs.keys()].some((k) => k.startsWith("view/")), "no view counted");
    await page.locator("#vp-box").scrollIntoViewIfNeeded();
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "vp-pdp.png") });
    /* empty, then a bad address, then WhatsApp */
    await page.click("#vp-box .vp-send");
    assert.match(await page.locator("#vp-box .vp-err").innerText(), /Escribe tu correo/);
    await page.fill("#vp-contact", "ana@");
    await page.click("#vp-box .vp-send");
    await page.waitForFunction(() => /Revisa tu correo/.test(document.querySelector("#vp-box .vp-err").textContent));
    await page.click('#vp-box [data-ch="whatsapp"]');
    assert.equal(await page.getAttribute("#vp-contact", "type"), "tel");
    await page.fill("#vp-contact", "987 654 321");
    await page.click("#vp-box .vp-send");
    await page.waitForSelector("#vp-box.vp-done", { timeout: 10000 });
    const done = await page.locator("#vp-box").innerText();
    assert.match(done, /Listo, te avisamos/);
    assert.match(done, /\+51987654321/);
    const wants = [...(globalThis.__blobs.get("restock") || new Map()).entries()].filter(([k]) => k.startsWith("want/"));
    assert.equal(wants.length, 1);
    const rec = JSON.parse(wants[0][1]);
    assert.equal(rec.channel, "whatsapp");
    assert.equal(rec.store, SOLD.store);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "vp-thanks.png") });
    return "stored " + rec.contact + " for " + rec.title;
  } finally { await context.close(); }
});

await check("signed in: one tap with the account's email", async () => {
  const { context, page } = await newPage();
  try {
    await context.route("**/.netlify/functions/auth-me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: "luz@correo.test" }) }));
    await page.goto(pdpUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#vp-box .vp-one", { timeout: 20000 });
    assert.match(await page.locator("#vp-box .vp-one").innerText(), /Avísame a luz@correo\.test/);
    assert.equal(await page.locator("#vp-box .vp-form").isHidden(), true);
    return "the button names the account";
  } finally { await context.close(); }
});

await check("the app: a homepage card is labelled, its «Comprar» reads «Ver detalle», addToCart refuses it", async () => {
  const { context, page } = await newPage();
  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.AriaVuelvePronto && typeof window.addToCart === "function" && typeof window.productCardHTML === "function", null, { timeout: 30000 });
    await page.evaluate(() => window.AriaVuelvePronto.load());
    const r = await page.evaluate((sold) => {
      const p = { title: sold.title, retailer: sold.store, price: 60, image: "https://cdn.example/x.jpg" };
      const wrap = document.createElement("div");
      wrap.id = "vp-test";
      wrap.innerHTML = window.productCardHTML(p, { open: "void 0" }) + window.productCardHTML({ ...p, title: "Vans Skate Slip-on Shoes - Not A Real Colour" }, { open: "void 0" });
      document.body.prepend(wrap);
      const ok = window.addToCart({ retailer: sold.store, title: sold.title, priceUsd: 60, weightKg: 1, qty: 1 });
      return { ok };
    }, SOLD);
    assert.equal(r.ok, false, "addToCart took a sold-out line");
    await page.waitForSelector("#vp-test [data-cp-t] [data-vuelve-pronto]", { timeout: 5000 });
    const s = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#vp-test [data-cp-t]")];
      return cards.map((c) => ({ pill: !!c.querySelector("[data-vuelve-pronto]"), btn: [...c.querySelectorAll("button")].map((b) => b.textContent.trim()).pop() }));
    });
    assert.deepEqual(s, [{ pill: true, btn: "Ver detalle" }, { pill: false, btn: "Comprar" }]);
    return "card and the cart funnel";
  } finally { await context.close(); }
});

await check("checkout: a sold-out line says «Vuelve pronto» and Pagar waits", async () => {
  const { context, page } = await newPage();
  try {
    await page.addInitScript((sold) => {
      localStorage.setItem("aria_cart_v1", JSON.stringify([{ retailer: sold.store, title: sold.title, priceUsd: 60, weightKg: 1, qty: 1, image: "https://cdn.example/x.jpg" }]));
    }, SOLD);
    await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-vuelve-pronto]", { timeout: 20000 });
    assert.match(await page.locator("[data-vuelve-pronto]").first().innerText(), /^Vuelve pronto/);
    await page.waitForFunction(() => { const b = document.getElementById("payBtn") || document.querySelector("button[type=submit]"); return b && b.disabled && /vuelven pronto/.test(b.textContent); }, null, { timeout: 20000 });
    assert.ok(await noHScroll(page));
    return "line labelled, Pagar disabled";
  } finally { await context.close(); }
});

await browser.close();
srv.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
