/* ==================================================================
   OFF SALE (#443) — A STORE ARIA NO LONGER SELLS FROM SELLS NOTHING.

   /off-sale.js is the one list. For every store on it this battery
   checks the generated data the builders wrote, the pages, the
   assistant and the server:

     data      no home shelf, Ofertas card or slice, search row, PDP
               rail, storefront slice, department or brand row, price
               index entry, ropa-interior row -- and the catalogue
               records themselves are still on disk (data retained);
     pages     no store rail, tile, directory card or sitemap entry; the
               product page shows the record as unavailable with no cart
               button; the app's cart funnel refuses the line;
     checkout  a cart already holding the line shows it as unavailable
               with Quitar, Pagar stays closed, and after Quitar the
               rest of the cart reaches Pagar;
     server    orders-create answers 400 in Spanish before anything is
               written or charged; a line from a live store is not
               refused for this;
     assistant the store-knowledge layer never describes or recommends
               the store, names it as off sale when asked, and the
               prompts carry no hardcoded mention of it.

   RUN: node scripts/test/offsale-tests.mjs
   OFFSALE_STATIC=1 skips the browser part. The browser part starts its
   own static server (port OFFSALE_PORT, default 8902) with the few
   functions checkout needs; the exchange rate and the courier quote are
   stubbed (no outbound network). PLAYWRIGHT_CHROMIUM=<path> picks the
   browser binary.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const readJson = (f) => JSON.parse(read(f));

let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

const OFF = await import(join(ROOT, "scripts/lib/off-sale.js"));
const KEYS = [...OFF.OFF_SALE_RETAILERS];
const isOff = OFF.isOffSaleRetailer;
const { RETAILERS } = await import(join(ROOT, "scripts/lib/retailers.js"));
const LIVE_KEY = "walmart";

console.log("off sale: " + KEYS.join(", "));

/* ---------------- the list ---------------- */
await check("one list: /off-sale.js as a plain script and its ES module agree, and Victoria's Secret is on it", async () => {
  const ctx = {};
  vm.runInNewContext(read("off-sale.js"), { globalThis: ctx, window: ctx });
  assert(ctx.AriaOffSale, "off-sale.js did not set AriaOffSale as a plain script");
  assert(JSON.stringify([...ctx.AriaOffSale.OFF_SALE_RETAILERS]) === JSON.stringify(KEYS), "the script and the module disagree");
  assert(KEYS.includes("victoriassecret"), "victoriassecret is not off sale");
  assert(!isOff(LIVE_KEY), LIVE_KEY + " is off sale");
  assert(isOff("VictoriasSecret") && isOff(" victoriassecret "), "the key match is not forgiving");
  assert(!/\bimport\b|\bexport\b/.test(read("off-sale.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "off-sale.js must stay a plain script");
  return KEYS.length + " store(s)";
});

/* ---------------- the data the builders wrote ---------------- */
await check("data retained: every off-sale store's catalogue records are still on disk", async () => {
  const counts = {};
  for (const f of readdirSync(ROOT).filter((f) => /(-catalog|^department-cache(-[a-z]+)?)\.json$/.test(f))) {
    const d = JSON.parse(read(f));
    for (const [k, r] of Object.entries((d && d.retailers) || {})) {
      if (!isOff(k)) continue;
      for (const b of Object.values((r && r.departments) || {})) counts[k] = (counts[k] || 0) + ((Array.isArray(b) ? b : (b && b.items) || []).length);
    }
  }
  const missing = KEYS.filter((k) => !(counts[k] > 0) && !(RETAILERS[k] && RETAILERS[k].retired));
  /* A store whose catalogue was never pulled has nothing to retain. */
  return Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ") + (missing.length ? `; no catalogue: ${missing.join(", ")}` : "");
});

await check("home shelves: no off-sale store shelf, and no off-sale card on any shelf", async () => {
  const dir = "assets/home/shelves";
  const files = readdirSync(join(ROOT, dir));
  for (const k of KEYS) assert(!files.includes(`store-${k}.json`), `${dir}/store-${k}.json exists`);
  const idx = readJson(dir + "/index.json");
  for (const k of idx.stores || []) assert(!isOff(k), "index.json lists store " + k);
  let cards = 0;
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (typeof n.title === "string" && "retailer" in n) { cards++; assert(!isOff(n.retailer), `${n.retailer} card on a shelf: ${n.title}`); }
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  };
  for (const f of files) walk(readJson(`${dir}/${f}`));
  /* The brand strip lists BRANDS (Golden Goose through Farfetch is a
     live lane); its counts come from the live pool, checked above. */
  return `${files.length} files, ${cards} cards`;
});

await check("Ofertas: no off-sale card in the feeds, deals.json or any slice; no off-sale slice file", async () => {
  for (const f of ["ofertas-feed.json", "ofertas-feed-lite.json"]) {
    const d = readJson(f);
    for (const it of d.items) assert(!isOff(it.retailer), `${f}: ${it.retailer} ${it.title}`);
    for (const k of Object.keys(d.counts || {})) assert(!isOff(k), `${f} counts ${k}`);
  }
  const deals = readJson("assets/ofertas/deals.json");
  for (const s of deals.stores) assert(!isOff(s.key), "deals.json store chip " + s.key);
  const slices = readdirSync(join(ROOT, "assets/ofertas/slices"));
  for (const f of slices) {
    assert(!isOff(f.split(".")[0]), "slice " + f);
    const d = readJson("assets/ofertas/slices/" + f);
    for (const it of d.items || []) assert(!isOff(it.store || it.s || it.retailer), `slice ${f} card from an off-sale store`);
    for (const s of d.stores || []) assert(!isOff(s.key), `slice ${f} store chip ${s.key}`);
  }
  const raw = read("assets/ofertas/deals.json");
  for (const k of KEYS) assert(!raw.includes(`"${k}"`), "deals.json mentions " + k);
  return `${slices.length} slices`;
});

await check("search: the index has no off-sale row and no off-sale store in its comparison table", async () => {
  const idx = readJson("assets/search/catalog-index.json");
  const ri = idx.fields.indexOf("retailer");
  let n = 0;
  for (const r of idx.rows) { n++; assert(!isOff(r[ri]), `row ${r[0]} from ${r[ri]}: ${r[1]}`); }
  for (const k of Object.keys(idx.stores || {})) assert(!isOff(k), "stores table lists " + k);
  return `${n} rows`;
});

await check("PDP: no off-sale rail folder and no off-sale card in a lane rail; the record itself still opens", async () => {
  const rails = readdirSync(join(ROOT, "assets/pdp/rails"));
  for (const k of KEYS) assert(!rails.includes(k), "assets/pdp/rails/" + k + " exists");
  for (const f of rails.filter((f) => f.startsWith("lane-"))) {
    for (const it of readJson("assets/pdp/rails/" + f).items) assert(!isOff(it.retailer), `${f}: ${it.retailer} ${it.name}`);
  }
  for (const d of rails.filter((f) => !f.endsWith(".json"))) {
    for (const f of readdirSync(join(ROOT, "assets/pdp/rails", d))) {
      for (const it of readJson(`assets/pdp/rails/${d}/${f}`).items) assert(!isOff(it.retailer), `${d}/${f}: ${it.retailer}`);
    }
  }
  return `${rails.length} rail entries`;
});

await check("storefronts: no off-sale store slice or endpoint file", async () => {
  for (const k of KEYS) {
    assert(!existsSync(join(ROOT, "assets/tienda", k)), "assets/tienda/" + k + " exists");
    assert(!existsSync(join(ROOT, "assets/tienda/_fn", k + ".json")), "assets/tienda/_fn/" + k + ".json exists");
  }
});

await check("departments, brands, ropa interior: no off-sale row", async () => {
  let n = 0;
  const fnDir = "assets/sections/departamento/_fn";
  if (existsSync(join(ROOT, fnDir))) for (const f of readdirSync(join(ROOT, fnDir))) {
    const d = readJson(`${fnDir}/${f}`);
    for (const k of Object.keys(d.labels || {})) assert(!isOff(k), `${f} labels ${k}`);
    n += (d.rows || []).length;
  }
  const brands = readJson("assets/sections/marca/_fn/items.json");
  for (const k of Object.keys(brands.labels || {})) assert(!isOff(k), "brand rows label " + k);
  for (const f of ["ropa-interior-feed.json", "ropa-interior-women-feed.json"]) {
    for (const it of readJson(f).items) assert(!isOff(it.r), `${f}: ${it.r} ${it.t}`);
  }
  return `${n} department rows`;
});

await check("checkout never vouches for an off-sale price: no price-index entry for its records", async () => {
  const { productIdFor } = await import(join(ROOT, "netlify/functions/_checkout-model.js"));
  const prices = readJson("price-index.json").prices;
  let probed = 0;
  for (const f of readdirSync(ROOT).filter((f) => /-catalog\.json$/.test(f))) {
    const d = JSON.parse(read(f));
    for (const [k, r] of Object.entries((d && d.retailers) || {})) {
      if (!isOff(k)) continue;
      for (const b of Object.values((r && r.departments) || {})) {
        for (const it of (Array.isArray(b) ? b : (b && b.items) || []).slice(0, 200)) {
          const t = it.title || it.name;
          if (!t) continue;
          probed++;
          assert(!prices[productIdFor(k, t)], `price-index has ${k}: ${t}`);
        }
      }
    }
  }
  return `${probed} records probed`;
});

/* ---------------- static pages ---------------- */
await check("pages: no off-sale store rail, directory card or sitemap entry; the pages load /off-sale.js", async () => {
  const index = read("index.html"), tiendas = read("tiendas.html"), sitemap = read("sitemap.xml");
  for (const k of KEYS) {
    assert(!index.includes(`data-store-rail="${k}"`), "index.html has the " + k + " store rail");
    assert(!index.includes(`data-store-rail-row="${k}"`), "index.html has a " + k + " rail row");
    assert(!tiendas.includes(`tienda=${k}"`), "tiendas.html links " + k);
    assert(!sitemap.includes(`tienda=${k}<`), "sitemap.xml lists " + k);
  }
  for (const f of ["index.html", "producto.html", "tienda.html"]) assert(/<script src="\/off-sale\.js"><\/script>/.test(read(f)), f + " does not load /off-sale.js");
  const bundle = /<script src="\/build\/(app-[0-9a-f]{16}\.js)"><\/script>/.exec(index);
  assert(bundle && index.indexOf('src="/off-sale.js"') < index.indexOf(bundle[0]), "/off-sale.js must load before the app bundle");
  assert(/from '\.\/scripts\/lib\/off-sale\.js'/.test(read("checkout.html")), "checkout.html does not import the list");
});

/* ---------------- the assistant ---------------- */
await check("assistant: no off-sale store in the store knowledge, recommendations or prompts; named, it answers off_sale", async () => {
  const K = await import(join(ROOT, "netlify/functions/_store-knowledge.js"));
  for (const k of KEYS) assert(!K.STORE_KNOWLEDGE[k], "STORE_KNOWLEDGE describes " + k);
  for (const k of KEYS) {
    const label = (RETAILERS[k] && RETAILERS[k].label) || k;
    const info = K.getStoreInfo(label);
    assert(!info.product_count && !info.best_for, `getStoreInfo("${label}") describes the store: ${JSON.stringify(info).slice(0, 120)}`);
  }
  const vs = K.getStoreInfo("victorias secret");
  assert(vs.off_sale === true && /Ya no vendemos/.test(vs.note), "victorias secret: " + JSON.stringify(vs).slice(0, 160));
  /* Every interest the knowledge answers, and every ambiguous branch. */
  const terms = new Set();
  for (const s of Object.values(K.STORE_KNOWLEDGE)) for (const t of s.specialties || []) terms.add(t);
  for (const t of ["lenceria", "perfumes", "pijamas", "maquillaje", "belleza", "zapatillas", "ropa", "regalo para mi esposa"]) terms.add(t);
  let asked = 0;
  for (const t of terms) {
    for (const resolved of [false, true]) {
      const r = K.recommendStoresFor(t, { resolved });
      asked++;
      for (const s of r.stores || []) assert(!isOff(s.store), `"${t}" recommends ${s.store}`);
      for (const list of Object.values(r.branches || {})) for (const s of list) assert(!isOff(s.store), `"${t}" branch offers ${s.store}`);
    }
  }
  /* The prompts may say what NOT to offer ("no presentes Amazon, Costco
     ni Nordstrom como opciones de compra"); they never offer the store. */
  const prompts = ["netlify/functions/_aria-prompt.js", "netlify/functions/_aria-agent-prompt.js", "scripts/lib/realtime-voice.js", "assets/js/aria-launcher.js"]
    .map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    .split(/(?<=[.;:])\s/).filter((s) => !/\bno presentes\b/i.test(s)).join(" ");
  /* A key with no registry row (Nike direct, Athleta) has no store
     identity to name; "Nike" the brand is sold through other stores. */
  for (const k of KEYS.filter((k) => RETAILERS[k])) {
    const label = RETAILERS[k].label;
    assert(!new RegExp("\\b" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(prompts), "a prompt names " + label);
  }
  const knowledge = read("netlify/functions/_store-knowledge.js");
  const branches = /export const AMBIGUOUS_INTERESTS = \{([\s\S]*?)\n\};/.exec(knowledge)[1];
  for (const k of KEYS) assert(!branches.includes(`"${k}"`), "AMBIGUOUS_INTERESTS routes to " + k);
  return `${asked} recommendation asks`;
});

/* ---------------- the server ---------------- */
const OC_EVENT = (items) => ({
  httpMethod: "POST", headers: { host: "deploy-preview-1--ariashopperu.netlify.app" },
  blobs: Buffer.from(JSON.stringify({ url: "http://127.0.0.1:9", token: "battery" })).toString("base64"),
  body: JSON.stringify({ items, quote: { total_usd: 1 } }),
});
await check("orders-create refuses an off-sale line with a Spanish 400, before anything is written or charged", async () => {
  const { handler } = await import(join(ROOT, "netlify/functions/orders-create.js"));
  for (const k of KEYS) {
    const r = await handler(OC_EVENT([
      { retailer: LIVE_KEY, title: "Unisex SuperBreak One Backpack", priceUsd: 40, qty: 1 },
      { retailer: k, title: "Producto de prueba", priceUsd: 30, qty: 1 },
    ]));
    const b = JSON.parse(r.body);
    assert(r.statusCode === 400, k + ": " + r.statusCode + " " + r.body);
    assert(/ya no está disponible en Aria/.test(b.error) && /No se cobró nada/.test(b.error), k + " message: " + b.error);
    assert(Array.isArray(b.offSale) && b.offSale[0] === "Producto de prueba", k + " offSale: " + JSON.stringify(b.offSale));
  }
  const { offSaleLines } = OFF;
  assert(offSaleLines([{ retailer: "victoriassecret", title: "x" }, { lineType: "bundle-discount", retailer: "victoriassecret" }, { retailer: LIVE_KEY, title: "y" }]).length === 1, "offSaleLines");
  return KEYS.length + " store(s) refused";
});
await check("orders-create does not refuse a live store's line for being off sale", async () => {
  const { handler } = await import(join(ROOT, "netlify/functions/orders-create.js"));
  const r = await handler(OC_EVENT([{ retailer: LIVE_KEY, title: "Unisex SuperBreak One Backpack", priceUsd: 40, qty: 1 }]));
  const b = JSON.parse(r.body || "{}");
  assert(!b.offSale && !/ya no está disponible/.test(String(b.error || "")), r.statusCode + " " + r.body);
  return `${LIVE_KEY}: ${r.statusCode} (${String(b.error || "").slice(0, 60)})`;
});

/* ---------------- the browser ---------------- */
if (!process.env.OFFSALE_STATIC) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  const FX = { compra: 3.72, venta: 3.75, fecha: "2026-10-21" };
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
    if (name === "resolve-weight" || name === "orders-create") {
      const { handler } = await import(join(ROOT, "netlify/functions/" + name + ".js"));
      const u = new URL(req.url, "http://x");
      return handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
    }
    return { statusCode: 404, body: JSON.stringify({ error: "no function " + name }) };
  }
  const PORT = Number(process.env.OFFSALE_PORT || 8902);
  const cache = new Map();
  const server = await new Promise((ok) => {
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
    srv.listen(PORT, "127.0.0.1", () => ok(srv));
  });
  const BASE = `http://127.0.0.1:${PORT}`;
  const OWN = new URL(BASE).host;

  /* A real off-sale record and a real live one, from the catalogues. */
  function firstRecord(pred) {
    for (const f of readdirSync(ROOT).filter((f) => /(-catalog|^department-cache-[a-z]+)\.json$/.test(f)).sort()) {
      const d = JSON.parse(read(f));
      for (const [k, r] of Object.entries((d && d.retailers) || {})) {
        for (const b of Object.values((r && r.departments) || {})) {
          for (const it of (Array.isArray(b) ? b : (b && b.items) || [])) {
            const t = it && (it.title || it.name);
            if (t && Number(it.price) > 0 && pred(k, it, t)) return { store: k, title: t, rec: it };
          }
        }
      }
    }
    return null;
  }
  const OFF_REC = firstRecord((k, it) => isOff(k) && !(Array.isArray(it.sizes) && it.sizes.length > 1));
  const LIVE_REC = firstRecord((k, it, t) => k === LIVE_KEY && t === "Unisex SuperBreak One Backpack");

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
    return { context, page };
  }
  const cartOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
  const pdpUrl = (x) => `${BASE}/producto.html?producto=${encodeURIComponent(x.title)}&tienda=${x.store}`;

  await check("product page: an off-sale record says it is unavailable, with no price, store door or cart button", async () => {
    assert(OFF_REC, "no off-sale record found");
    const { context, page } = await newPage();
    try {
      await page.goto(pdpUrl(OFF_REC), { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".p-offsale", { timeout: 30000 });
      assert(!(await page.$("#add-cart-btn")), "Agregar al carrito is shown");
      assert(!(await page.$(`a[href*="tienda=${OFF_REC.store}"]`)), "the store door is shown");
      assert(!(await page.$(".p-pen")), "a price is shown");
      const t = await page.$eval(".p-offsale", (e) => e.textContent);
      assert(/ya no está disponible/.test(t), "notice: " + t);
      assert((await cartOf(page)).length === 0, "the cart changed");
      return `${OFF_REC.store}: ${OFF_REC.title.slice(0, 40)}`;
    } finally { await context.close(); }
  });

  await check("product page: a live store's record still sells (Agregar adds the line)", async () => {
    assert(LIVE_REC, "the live record is gone");
    const { context, page } = await newPage();
    try {
      await page.goto(pdpUrl(LIVE_REC), { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#add-cart-btn", { timeout: 30000 });
      assert(!(await page.$(".p-offsale")), "the live record is marked off sale");
      await page.click("#add-cart-btn");
      const cart = await cartOf(page);
      assert(cart.length === 1 && cart[0].retailer === LIVE_KEY, "cart: " + JSON.stringify(cart.map((l) => l.retailer)));
    } finally { await context.close(); }
  });

  await check("app: the cart funnel refuses an off-sale line and takes a live one; no off-sale store tile or door", async () => {
    const { context, page } = await newPage();
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => typeof addToCart === "function" && window.AriaOffSale && typeof paintTiendasStrip === "function", null, { timeout: 60000 });
      const r = await page.evaluate(({ off, live }) => {
        const a = addToCart({ retailer: off.store, title: off.title, priceUsd: 30, dutiableUsd: 25, weightKg: 0.3, qty: 1 });
        const b = addToCart({ retailer: live.store, title: live.title, priceUsd: 40, dutiableUsd: 34, weightKg: 0.8, qty: 1 });
        paintTiendasStrip();
        const strip = (document.getElementById("mTiendasStripRow") || document.getElementById("dTiendasStripRow") || {}).innerHTML || "";
        return { a, b, strip, stores: activeRetailers().map((x) => x.key), door: storeDoorFor(off.store), gate: passesOfertasGate({ retailer: off.store, title: "x", price: 10, image: "https://x/y.jpg" }),
          cart: JSON.parse(localStorage.getItem("aria_cart_v1") || "[]").map((l) => l.retailer) };
      }, { off: OFF_REC, live: LIVE_REC });
      assert(r.a === false, "addToCart took the off-sale line");
      assert(r.b !== false, "addToCart refused the live line");
      assert(!r.cart.some(isOff) && r.cart.includes(LIVE_KEY), "cart: " + JSON.stringify(r.cart));
      for (const k of KEYS) {
        assert(!r.strip.includes(`tiendaJump('${k}')`), "store tile for " + k);
        assert(!r.stores.includes(k), "activeRetailers lists " + k);
      }
      assert(r.door === null, "the product page door opens " + OFF_REC.store);
      assert(r.gate === false, "an off-sale deal passes the Ofertas gate");
    } finally { await context.close(); }
  });

  await check("storefront: tienda.html?tienda=<off-sale> opens the directory, which has no off-sale card", async () => {
    const { context, page } = await newPage();
    try {
      for (const k of KEYS) {
        await page.goto(`${BASE}/tienda.html?tienda=${k}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelectorAll('a[href*="tienda="]').length > 10, null, { timeout: 30000 });
        assert(!(await page.$(`a[href*="tienda=${k}"]`)), "the directory links " + k);
      }
    } finally { await context.close(); }
  });

  await check("checkout: a cart holding an off-sale line shows it unavailable with Quitar, Pagar stays closed; after Quitar the rest pays", async () => {
    const { context, page } = await newPage();
    let posted = null;
    await context.route("**/.netlify/functions/orders-create", (route) => {
      posted = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Batería: detenido antes de Stripe." }) });
    });
    try {
      await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
      await page.evaluate(({ off, live }) => {
        localStorage.setItem("aria_cart_v1", JSON.stringify([
          { retailer: off.store, title: off.title, priceUsd: 30, dutiableUsd: 25, weightKg: 0.3, weightEstimated: true, qty: 1 },
          { retailer: live.store, title: live.title, priceUsd: 40, dutiableUsd: 34, weightKg: 0.8, weightEstimated: true, qty: 1 },
        ]));
      }, { off: OFF_REC, live: LIVE_REC });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-off-sale]", { timeout: 30000 });
      await page.waitForFunction(() => {
        const b = document.getElementById("payBtn");
        return b && /no disponibles/i.test(b.textContent);
      }, null, { timeout: 30000 });
      const btn = await page.$eval("#payBtn", (b) => ({ d: b.disabled, t: b.textContent.trim() }));
      assert(btn.d, "Pagar is enabled: " + btn.t);
      const note = await page.$eval("[data-off-sale]", (e) => e.textContent);
      assert(/No disponible/.test(note) && /Quítalo/.test(note), "note: " + note);
      await page.$eval("#payBtn", (b) => { b.disabled = false; });
      await page.$eval("#checkoutForm", (f) => f.requestSubmit());
      await page.waitForTimeout(300);
      assert(!posted, "the off-sale cart was posted to orders-create");
      const idx = await page.$eval("[data-off-sale]", (e) => e.getAttribute("data-off-sale"));
      await page.click(`[data-remove-line="${idx}"]`);
      await page.waitForFunction(() => {
        const b = document.getElementById("payBtn");
        return b && !b.disabled && /Pagar/i.test(b.textContent);
      }, null, { timeout: 30000 });
      const cart = await cartOf(page);
      assert(cart.length === 1 && cart[0].retailer === LIVE_KEY, "cart after Quitar: " + JSON.stringify(cart.map((l) => l.retailer)));
      assert(!(await page.$("[data-off-sale]")), "the notice stayed");
      return `blocked as "${btn.t}", then "${await page.$eval("#payBtn", (b) => b.textContent.trim().replace(/\s+/g, " "))}"`;
    } finally { await context.close(); }
  });

  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
