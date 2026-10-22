/* ==================================================================
   FOUR PERFUMES PER ORDER, AND A WAY OUT (#443, Danny, 2026-10-22).

   /fragrance.js is the one fragrance definition (the Perfumes carousel
   reads it too). These checks hold the cap:

     rules     units count (quantity), non-perfume lines never count;
               splitForCap keeps four in this order and moves the rest,
               splitting a line by quantity when it straddles the limit;
     server    orders-create answers 400 in Spanish for five perfume
               units, before anything is written or charged, and lets
               four through; a cart of non-perfume lines is unaffected;
     checkout  a cart of five shows the plain guidance ("Maximo 4
               perfumes por pedido -- el resto puede ir en un segundo
               pedido"), Pagar is closed, one tap moves the extra to the
               next order and Pagar opens; once the order is paid the
               held perfumes become the cart for the second order;
     cart      the home page's cart (?carrito=1) offers the same split
               instead of a dead end.

   RUN: node scripts/test/perfume-cap-tests.mjs
   PERFUME_CAP_STATIC=1 skips the browser part, which serves the repo on
   PERFUME_CAP_PORT (default 8994) with the few functions checkout needs
   (exchange rate and courier quote stubbed; no outbound network).
   PERFUME_SHOTS=<dir> saves the 390x844 screenshots there.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { capState, splitForCap, perfumeUnits, CAP_GUIDANCE, NEXT_ORDER_KEY, MAX_PERFUMES_PER_ORDER } from "../lib/fragrance.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("    ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failures.push(name + "\n         " + (e && e.message)); console.log("    FAIL " + name + "\n         " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

/* Real perfume lines: the Perfumes shelf's own cards (live catalogues). */
const PICKS = JSON.parse(read("assets/home/shelves/perfumes.json")).picks;
const line = (p, qty) => ({ retailer: p.retailer, title: p.title, priceUsd: p.price, dutiableUsd: p.dutiableUsd, weightKg: p.weightKg || 0.35, image: p.image, qty });
const FIVE = [line(PICKS[0], 2), line(PICKS[1], 2), line(PICKS[2], 1)];
const BACKPACK = { retailer: "walmart", title: "Unisex SuperBreak One Backpack", priceUsd: 40, dutiableUsd: 34, weightKg: 0.8, qty: 1 };

/* ---------------- rules ---------------- */
await check("units count by quantity; a non-perfume line never counts", () => {
  assert(MAX_PERFUMES_PER_ORDER === 4, "limit");
  assert(perfumeUnits(FIVE) === 5, "five");
  assert(perfumeUnits([...FIVE, { ...BACKPACK, qty: 9 }]) === 5, "the backpack counted");
  assert(perfumeUnits([{ title: "Kirkland Signature Baby Wipes Fragrance Free, 900-count", qty: 6 }]) === 0, "fragrance-free wipes counted");
  assert(perfumeUnits([{ title: "x Eau de Parfum", qty: 3, lineType: "bundle-discount" }]) === 0, "a discount line counted");
  const s = capState(FIVE);
  assert(s.overLimit && s.extra === 1 && s.count === 5, JSON.stringify(s));
  assert(!capState(FIVE.slice(0, 2)).overLimit, "four is over");
});
await check("splitForCap keeps four here, moves the rest, splits a straddling line, leaves everything else", () => {
  const cart = [BACKPACK, line(PICKS[0], 3), line(PICKS[1], 3)];
  const { keep, next, moved } = splitForCap(cart);
  assert(perfumeUnits(keep) === 4 && moved === 2 && perfumeUnits(next) === 2, JSON.stringify({ keep, next }));
  assert(keep[0] === BACKPACK, "the backpack moved");
  assert(keep[2].title === PICKS[1].title && keep[2].qty === 1 && next[0].qty === 2, "the straddling line was not split by quantity");
  assert(cart[2].qty === 3, "the input was mutated");
  const none = splitForCap([BACKPACK, line(PICKS[0], 4)]);
  assert(none.next.length === 0 && none.keep.length === 2, "split a cart at the limit");
  assert(/^Máximo 4 perfumes por pedido — el resto puede ir en un segundo pedido\.$/.test(CAP_GUIDANCE), CAP_GUIDANCE);
});

/* ---------------- server ---------------- */
const OC_EVENT = (items) => ({
  httpMethod: "POST", headers: { host: "deploy-preview-1--ariashopperu.netlify.app" },
  blobs: Buffer.from(JSON.stringify({ url: "http://127.0.0.1:9", token: "battery" })).toString("base64"),
  body: JSON.stringify({ items, quote: { total_usd: 1 } }),
});
const { handler: ordersCreate } = await import(join(ROOT, "netlify/functions/orders-create.js"));
await check("orders-create refuses five perfume units with a Spanish 400, before anything is written or charged", async () => {
  for (const items of [FIVE, [line(PICKS[0], 5)], [...FIVE, BACKPACK]]) {
    const r = await ordersCreate(OC_EVENT(items));
    const b = JSON.parse(r.body);
    assert(r.statusCode === 400, r.statusCode + " " + r.body);
    assert(/máximo por pedido es 4/.test(b.error) && /segundo pedido/.test(b.error) && /No se cobró nada/.test(b.error), b.error);
    assert(b.perfumeCap && b.perfumeCap.count === 5 && b.perfumeCap.limit === 4, JSON.stringify(b.perfumeCap));
  }
  return "400: " + JSON.parse((await ordersCreate(OC_EVENT(FIVE))).body).error.slice(0, 70) + "...";
});
await check("orders-create lets four perfume units through, and never caps non-perfume lines", async () => {
  for (const items of [[line(PICKS[0], 2), line(PICKS[1], 2)], [{ ...BACKPACK, qty: 9 }], [line(PICKS[0], 4), { ...BACKPACK, qty: 3 }]]) {
    const r = await ordersCreate(OC_EVENT(items));
    const b = JSON.parse(r.body || "{}");
    assert(!b.perfumeCap && !/perfumes/.test(String(b.error || "")), r.statusCode + " " + r.body);
  }
  /* The same classifier the carousel uses, imported once. */
  const src = read("netlify/functions/orders-create.js");
  assert(/from "\.\.\/\.\.\/scripts\/lib\/fragrance\.js"/.test(src), "orders-create does not read scripts/lib/fragrance.js");
  return "four, nine backpacks, four + three backpacks all pass the cap";
});

/* ---------------- browser ---------------- */
if (!process.env.PERFUME_CAP_STATIC) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const SHOTS = process.env.PERFUME_SHOTS || "";
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
  const FX = { compra: 3.72, venta: 3.75, fecha: "2026-10-22" };
  async function fnHandler(name, req, body) {
    if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify(FX) };
    if (name === "wallet-get" || name === "cart-save" || name === "cart-get") return { statusCode: 401, body: JSON.stringify({ error: "No autenticado" }) };
    if (name === "founders-status") return { statusCode: 200, body: JSON.stringify({}) };
    if (name === "order-status") return { statusCode: 200, body: JSON.stringify({ paid: true, chargedPen: 1234.5, email: "prueba@ariashop.pe" }) };
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
      const { handler } = await import(join(ROOT, "netlify/functions/resolve-weight.js"));
      return handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: {} }, {});
    }
    return { statusCode: 404, body: JSON.stringify({ error: "no function " + name }) };
  }
  const PORT = Number(process.env.PERFUME_CAP_PORT || 8994);
  const fileCache = new Map();
  const server = await new Promise((ok, bad) => {
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
          if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end("nf"); }
          if (!fileCache.has(p)) fileCache.set(p, readFileSync(p));
          res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
          res.end(fileCache.get(p));
        } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
      });
    });
    srv.once("error", (e) => bad(e.code === "EADDRINUSE" ? new Error(`port ${PORT} is busy -- set PERFUME_CAP_PORT`) : e));
    srv.listen(PORT, "127.0.0.1", () => ok(srv));
  });
  const BASE = `http://127.0.0.1:${PORT}`;
  const OWN = new URL(BASE).host;
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  /* Screenshots only: checkout loads Tailwind from its CDN, which this
     sandbox cannot reach, so the same classes are compiled locally and
     served in its place. The checks never depend on styling. */
  let CDN_CSS = "";
  if (SHOTS) {
    const { spawnSync } = await import("node:child_process");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "aria-cap-tw-"));
    writeFileSync(join(dir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
    const r = spawnSync(join(ROOT, "node_modules", ".bin", "tailwindcss"), ["--content", join(ROOT, "checkout.html"), "-i", join(dir, "in.css"), "-o", join(dir, "out.css")], { encoding: "utf8" });
    if (r.status === 0) CDN_CSS = readFileSync(join(dir, "out.css"), "utf8");
  }
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  async function newPage() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host === OWN) return route.continue();
      if (CDN_CSS && u.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript",
        body: "(function(){var s=document.createElement('style');s.textContent=" + JSON.stringify(CDN_CSS) + ";document.head.appendChild(s);})();" });
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.abort();
    });
    return { context, page: await context.newPage() };
  }
  const store = (page) => page.evaluate((k) => ({ cart: JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"), next: JSON.parse(localStorage.getItem(k) || "[]") }), NEXT_ORDER_KEY);
  const units = (lines) => lines.reduce((n, l) => n + (Number(l.qty) || 1), 0);

  try {
    await check("checkout: five perfumes show the plain guidance, Pagar is closed, one tap moves the extra and Pagar opens", async () => {
      const { context, page } = await newPage();
      let posted = false;
      await context.route("**/.netlify/functions/orders-create", (route) => { posted = true; return route.fulfill({ status: 503, body: "{}" }); });
      try {
        await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
        await page.evaluate((c) => { localStorage.setItem("aria_cart_v1", JSON.stringify(c)); localStorage.removeItem("aria_cart_next_v1"); }, [...FIVE, BACKPACK]);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-perfume-cap]", { timeout: 30000 });
        const t = await page.$eval("[data-perfume-cap]", (e) => e.textContent.replace(/\s+/g, " ").trim());
        assert(t.includes(CAP_GUIDANCE), "guidance: " + t);
        await page.waitForFunction(() => /perfumes por pedido/i.test((document.getElementById("payBtn") || {}).textContent || ""), null, { timeout: 30000 });
        assert(await page.$eval("#payBtn", (b) => b.disabled), "Pagar is open with five perfumes");
        await page.$eval("#payBtn", (b) => { b.disabled = false; });
        await page.$eval("#checkoutForm", (f) => f.requestSubmit());
        await page.waitForTimeout(300);
        assert(!posted, "five perfumes were posted to orders-create");
        if (SHOTS) {
          await page.$eval("[data-perfume-cap]", (e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 140));
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(SHOTS, "perfume-checkout-cap.png") });
        }
        await page.click("[data-perfume-split]");
        await page.waitForSelector("[data-next-order]", { timeout: 10000 });
        const s = await store(page);
        assert(units(s.cart.filter((l) => l.title !== BACKPACK.title)) === 4, "cart perfumes: " + JSON.stringify(s.cart.map((l) => [l.title.slice(0, 20), l.qty])));
        assert(s.cart.some((l) => l.title === BACKPACK.title), "the backpack left the order");
        assert(units(s.next) === 1, "next order: " + JSON.stringify(s.next));
        assert(!(await page.$("[data-perfume-cap]")), "the guidance stayed");
        await page.waitForFunction(() => { const b = document.getElementById("payBtn"); return b && !b.disabled && /Pagar/i.test(b.textContent); }, null, { timeout: 30000 });
        if (SHOTS) {
          await page.$eval("#checkoutFragranceWrap", (e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 140));
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(SHOTS, "perfume-checkout-split.png") });
        }
        return `then "${await page.$eval("#payBtn", (b) => b.textContent.trim().replace(/\s+/g, " "))}"`;
      } finally { await context.close(); }
    });

    await check("checkout: once this order is paid, the held perfumes become the cart for the second order", async () => {
      const { context, page } = await newPage();
      try {
        await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
        await page.evaluate(({ c, n }) => { localStorage.setItem("aria_cart_v1", JSON.stringify(c)); localStorage.setItem("aria_cart_next_v1", JSON.stringify(n)); },
          { c: [line(PICKS[0], 2), line(PICKS[1], 2)], n: [line(PICKS[2], 1)] });
        await page.goto(`${BASE}/checkout.html?pagado=ORD1&session_id=cs_test_1`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => /Pago recibido/.test((document.getElementById("successTitle") || {}).textContent || ""), null, { timeout: 30000 });
        const s = await store(page);
        assert(s.next.length === 0, "the holding list stayed");
        assert(s.cart.length === 1 && s.cart[0].title === PICKS[2].title && units(s.cart) === 1, "cart after paying: " + JSON.stringify(s.cart));
      } finally { await context.close(); }
    });

    await check("checkout: a cart of non-perfume lines and four perfumes shows no cap", async () => {
      const { context, page } = await newPage();
      try {
        await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
        await page.evaluate((c) => { localStorage.setItem("aria_cart_v1", JSON.stringify(c)); localStorage.removeItem("aria_cart_next_v1"); }, [line(PICKS[0], 4), { ...BACKPACK, qty: 6 }]);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => { const b = document.getElementById("payBtn"); return b && !b.disabled && /Pagar/i.test(b.textContent); }, null, { timeout: 30000 });
        assert(!(await page.$("[data-perfume-cap]")), "the cap shows at four");
      } finally { await context.close(); }
    });

    await check("the home page's cart: five perfumes offer the split instead of a dead end", async () => {
      const { context, page } = await newPage();
      try {
        await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
        await page.evaluate((c) => { localStorage.setItem("aria_cart_v1", JSON.stringify(c)); localStorage.removeItem("aria_cart_next_v1"); }, [...FIVE, BACKPACK]);
        await page.goto(BASE + "/?carrito=1", { waitUntil: "load" });
        await page.waitForSelector("#cartFragranceWrap [data-perfume-split]", { timeout: 60000 });
        const t = await page.$eval("#cartFragranceWrap", (e) => e.textContent.replace(/\s+/g, " ").trim());
        assert(t.includes(CAP_GUIDANCE.replace(/\.$/, "")), "guidance: " + t);
        assert(await page.$eval("#cartCheckoutBtn", (b) => b.disabled), "checkout is open with five perfumes");
        await page.click("#cartFragranceWrap [data-perfume-split]");
        await page.waitForSelector("#cartFragranceWrap [data-next-order]", { timeout: 10000 });
        const s = await store(page);
        assert(units(s.cart.filter((l) => l.title !== BACKPACK.title)) === 4 && units(s.next) === 1, JSON.stringify(s));
        assert(!(await page.$("#cartFragranceWrap [data-perfume-split]")), "the split stayed");
        const blocked = await page.$eval("#cartCheckoutBtn", (b) => b.disabled);
        return "checkout button " + (blocked ? "still blocked (weight review)" : "open");
      } finally { await context.close(); }
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
