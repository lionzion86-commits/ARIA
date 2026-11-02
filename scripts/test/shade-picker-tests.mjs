/* ==================================================================
   SHADES YOU CAN PICK, OR NOTHING SOLD (Danny, live production after
   #583: "There aren't shades or colors ... Why is there not a dropdown
   with the numbers?" -- nobody buys makeup they can't pick a colour for).

   Driven at 390px in headless Chromium, through the real entry route: the
   store page (tienda.html), its own search box, a tap on the card -- never
   a hand-built product id.
     Walmart  Maybelline Super Stay Lumi-Matte foundation (picked by its
              number), Maybelline Instant Age Rewind concealer, NYX Slim
              Lip Pencil liner, NYX Lip Lingerie XXL: the «Tono» dropdown
              lists every shade, number and name, sorted by number; picking
              one swaps the listing (its own id, title, price, photo); the
              cart line carries «Tono: ...» and checkout shows it.
     Walmart  a listing no family holds (Maybelline Lifter Liner, Big
              Lift) sells in the one shade its title names, and the
              line carries it.
     Ulta     Slim Lip Pencil Lip Liner, Shape Tape Concealer: no shade list
              at the source -- «Tonos en camino», the cart button is off.
     Ulta     skincare and fragrance stay purchasable.
   Plus: checkout holding a shade product with no shade (a cart saved
   before the gate) keeps Pagar closed and says why; orders-create refuses
   it with a 400; /shade-gate.js's classifier on real titles.

   RUN: node scripts/test/shade-picker-tests.mjs
   SHADE_SHOTS=<dir> also writes the screenshots (shade-*.png) and a video
   of the Super Stay flow there. Its own static server, outside requests
   stubbed (a 1x1 photo for every retailer image), no network.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); }
const EXE = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const SHOTS = process.env.SHADE_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message || e).split("\n")[0]); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

/* ---------------- the local server ---------------- */
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
async function fn(name, req, body) {
  if (name === "exchange-rate") return { statusCode: 200, body: JSON.stringify({ compra: 3.72, venta: 3.75, fecha: "2026-11-02" }) };
  if (name === "tienda" || name === "search") {
    const { handler } = await import(join(ROOT, "netlify/functions/" + name + ".js"));
    const u = new URL(req.url, "http://x");
    return handler({ httpMethod: req.method, headers: req.headers, body, rawUrl: "http://127.0.0.1" + req.url, path: u.pathname, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
  }
  return { statusCode: 401, body: JSON.stringify({ error: "No autenticado" }) };
}
function startServer() {
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, "http://x");
        const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (m) { const r = await fn(m[1], req, body); res.writeHead(r.statusCode, { "Content-Type": "application/json" }); return res.end(r.body); }
        if (u.pathname.startsWith("/api/")) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
        let p = join(ROOT, decodeURIComponent(u.pathname));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}
await import(join(ROOT, "shade-gate.js"));
const G0 = globalThis.AriaShadeGate;
const server = await startServer();
const BASE = "http://127.0.0.1:" + server.address().port;

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
async function phone(video) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ...(video && SHOTS ? { recordVideo: { dir: SHOTS, size: { width: 390, height: 844 } } } : {}) });
  await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.request().resourceType() === "image"
    ? r.fulfill({ status: 200, contentType: "image/png", body: PNG }) : r.abort());
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on("pageerror", (e) => pg.errors.push(String(e).slice(0, 200)));
  return { ctx, pg };
}
const shot = async (pg, name, sel) => {
  if (!SHOTS) return;
  if (sel) { const h = await pg.$(sel); if (h) await h.scrollIntoViewIfNeeded(); await pg.waitForTimeout(150); }
  await pg.screenshot({ path: join(SHOTS, "shade-" + name + ".png") });
};

/* THE REAL ROUTE: the store page, its search box, a tap on the card. */
async function openFromStore(pg, store, query, titlePart) {
  await pg.goto(BASE + "/tienda.html?tienda=" + store, { waitUntil: "domcontentloaded" });
  await pg.waitForSelector("#q", { state: "visible", timeout: 20000 });
  await pg.fill("#q", query);
  const card = pg.locator('a[href*="producto.html"]').filter({ hasText: titlePart }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  await Promise.all([pg.waitForURL(/producto\.html/, { timeout: 20000 }), card.click()]);
  await pg.waitForFunction(() => { const b = document.getElementById("buy-box"); return b && b.children.length; }, null, { timeout: 20000 });
}
const state = (pg) => pg.evaluate(() => {
  const sel = document.getElementById("shade-select");
  return {
    title: (document.querySelector("h1") || {}).textContent || "",
    current: (document.getElementById("v-current") || {}).textContent || "",
    options: sel ? Array.from(sel.options).map((o) => ({ v: o.value, t: o.textContent, on: o.selected })) : [],
    v: new URL(location.href).searchParams.get("v") || "",
    price: (document.querySelector(".p-pen") || {}).textContent || "",
    photo: (document.querySelector(".p-photo img") || {}).getAttribute ? document.querySelector(".p-photo img").getAttribute("data-img-orig") : "",
    buyOn: !!document.getElementById("add-cart-btn") && !document.getElementById("add-cart-btn").disabled,
    gate: (document.getElementById("shade-gate-note") || {}).textContent || "",
  };
});
const cartLines = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));

/* Pick a shade from the dropdown, add it, and see it on the cart line. */
async function pickAddAndCheckout(pg, name, pick) {
  const before = await state(pg);
  assert(before.options.length >= 2, `${name}: no «Tono» dropdown (${before.options.length} options)`);
  const nums = before.options.map((o) => parseFloat(o.t)).filter((n) => !isNaN(n));
  for (let i = 1; i < nums.length; i++) assert(nums[i] >= nums[i - 1], `${name}: shades not in number order (${nums.slice(0, 8).join(", ")})`);
  await shot(pg, name + "-dropdown", "#variant-box");
  const target = before.options.find((o) => !o.on && pick(o.t) && !/agotado/.test(o.t));
  assert(target, `${name}: no shade to pick among ${before.options.map((o) => o.t).slice(0, 10).join(" | ")}`);
  await pg.selectOption("#shade-select", target.v);
  await pg.waitForFunction((v) => new URL(location.href).searchParams.get("v") === v, target.v, { timeout: 5000 });
  const after = await state(pg);
  assert(after.current.trim() === target.t.replace(/ \(agotado\)$/, "").trim(), `${name}: label says "${after.current}" after picking "${target.t}"`);
  assert(after.v === target.v && after.v !== before.v, `${name}: the listing did not change (v ${before.v} -> ${after.v})`);
  assert(after.options.find((o) => o.on).v === target.v, `${name}: the dropdown did not keep the pick`);
  await shot(pg, name + "-picked", "#variant-box");
  assert(after.buyOn, `${name}: Agregar is off after picking ${target.t}`);
  await pg.click("#add-cart-btn");
  const lines = await cartLines(pg);
  const line = lines.find((l) => l.variantId === target.v);
  assert(line, `${name}: no cart line for the picked listing`);
  assert(line.variantAxis === "Tono" && line.colorway === after.current.trim(), `${name}: line carries ${line.variantAxis}: ${line.colorway}`);
  assert(line.title === (await pg.evaluate(() => CURRENT_PRODUCT.name)), `${name}: the line's title is not the picked listing's`);
  await pg.goto(BASE + "/checkout.html", { waitUntil: "domcontentloaded" });
  const tono = pg.locator("[data-colorway]").filter({ hasText: line.colorway }).first();
  await tono.waitFor({ state: "visible", timeout: 15000 });
  const text = await tono.textContent();
  assert(/^Tono: /.test(text.trim()), `${name}: checkout line reads "${text}"`);
  await tono.scrollIntoViewIfNeeded();
  await shot(pg, name + "-cart-line");
  return `${before.options.length} tonos; "${before.current}" -> "${line.colorway}" (${line.variantId}); checkout "${text.trim()}"`;
}

const WALMART = [
  { name: "superstay", q: "Super Stay Lumi-Matte", t: "Super Stay Lumi-Matte Foundation", pick: (t) => /^\d/.test(t), video: true },
  { name: "concealer", q: "Instant Age Rewind Eraser", t: "Instant Age Rewind Eraser Multi-Use Concealer", pick: (t) => /\d/.test(t) },
  { name: "lipliner", q: "Slim Lip Pencil", t: "Slim Lip Pencil", pick: (t) => /^\d/.test(t) },
  { name: "lip-lingerie-xxl", q: "Lip Lingerie XXL", t: "Lip Lingerie XXL", pick: () => true },
];
for (const c of WALMART) {
  await check(`Walmart ${c.name}: store page -> card -> «Tono» dropdown -> pick -> cart line «Tono»`, async () => {
    const { ctx, pg } = await phone(c.video);
    try {
      await openFromStore(pg, "walmart", c.q, c.t);
      const note = await pickAddAndCheckout(pg, c.name, c.pick);
      assert(!pg.errors.length, "page errors: " + pg.errors.join(" | "));
      return note;
    } finally {
      const vid = pg.video && pg.video();
      await ctx.close();
      if (vid && SHOTS) { try { renameSync(await vid.path(), join(SHOTS, "shade-" + c.name + ".webm")); } catch {} }
    }
  });
}

await check("Walmart, one shade: a listing no family holds sells in the shade its title names, and the line carries it", async () => {
  const { ctx, pg } = await phone();
  try {
    await openFromStore(pg, "walmart", "Lifter Liner", "Lifter Liner Lip Liner");
    const s = await state(pg);
    assert(!s.options.length, "a dropdown for a single listing");
    const one = await pg.textContent("#shade-one");
    assert(/Tono: Big Lift/.test(one), "shade line: " + one);
    assert(s.buyOn, "Agregar is off");
    await shot(pg, "single-shade", "#shade-one");
    await pg.click("#add-cart-btn");
    const line = (await cartLines(pg)).find((l) => /Lifter Liner/.test(l.title));
    assert(line && line.colorway === "Big Lift" && line.variantAxis === "Tono", "line: " + JSON.stringify(line && { c: line.colorway, a: line.variantAxis }));
    return "Tono: " + line.colorway;
  } finally { await ctx.close(); }
});

const ULTA_GATED = [
  { name: "ulta-lipliner", q: "Slim Lip Pencil", t: "Slim Lip Pencil Lip Liner" },
  { name: "ulta-concealer", q: "Shape Tape", t: "Shape Tape Concealer" },
];
for (const c of ULTA_GATED) {
  await check(`Ulta ${c.name}: no shade list at the source -> «Tonos en camino», no cart`, async () => {
    const { ctx, pg } = await phone();
    try {
      await openFromStore(pg, "ulta", c.q, c.t);
      const s = await state(pg);
      assert(!s.options.length, "a shade dropdown with no shade data");
      assert(/^Tonos en camino: todavía no tenemos la lista de tonos/.test(s.gate), "note: " + s.gate);
      assert(!s.buyOn, "Agregar al carrito is on");
      const btn = await pg.textContent("#add-cart-btn");
      assert(btn.trim() === "Tonos en camino", "button: " + btn);
      await pg.evaluate(() => addCurrentToCart(CURRENT_PRODUCT, []));
      assert(!(await cartLines(pg)).length, "the page's own add path put it in the cart");
      await shot(pg, c.name + "-gate", "#buy-box");
      return btn.trim();
    } finally { await ctx.close(); }
  });
}

await check("Ulta: skincare and fragrance stay purchasable (not sold in shades)", async () => {
  const { ctx, pg } = await phone();
  try {
    const out = [];
    const cat = JSON.parse(readFileSync(join(ROOT, "ulta-catalog.json"), "utf8"));
    const all = Object.values(cat.retailers.ulta.departments).flatMap((d) => Array.isArray(d) ? d : d.items || []);
    for (const rx of [/Primer\b/, /Moisturizer\b/, /Eau de Parfum/]) {
      const rec = all.find((x) => rx.test(x.name) && !G0.isShadeDependent(x));
      if (!rec) continue;
      await pg.goto(BASE + "/producto.html?producto=" + encodeURIComponent(rec.name) + "&tienda=ulta", { waitUntil: "domcontentloaded" });
      await pg.waitForFunction(() => { const b = document.getElementById("buy-box"); return b && b.children.length; }, null, { timeout: 20000 });
      const s = await state(pg);
      assert(!s.gate && s.buyOn, rec.name + " is not purchasable");
      out.push(rec.name);
    }
    assert(out.length, "no Ulta non-shade record found");
    return out.join(" | ");
  } finally { await ctx.close(); }
});

await check("checkout: a saved shade product with no shade keeps Pagar closed and says why", async () => {
  const { ctx, pg } = await phone();
  try {
    await pg.goto(BASE + "/checkout.html", { waitUntil: "domcontentloaded" });
    await pg.evaluate(() => localStorage.setItem("aria_cart_v1", JSON.stringify([
      { retailer: "ulta", title: "Slim Lip Pencil Lip Liner", priceUsd: 6, dutiableUsd: 5.5, weightKg: 0.05, qty: 1, image: "https://media.ulta.com/x.jpg" },
    ])));
    await pg.reload({ waitUntil: "domcontentloaded" });
    const box = pg.locator("[data-shade-missing]").first();
    await box.waitFor({ state: "visible", timeout: 15000 });
    const text = await box.textContent();
    assert(/Tonos en camino/.test(text) && /Quítalo de tu carrito/.test(text), text);
    await pg.waitForFunction(() => { const b = document.getElementById("payBtn") || document.querySelector("button[type=submit]"); return b && b.disabled; }, null, { timeout: 15000 });
    await box.scrollIntoViewIfNeeded();
    await shot(pg, "checkout-refused");
    return text.trim().slice(0, 60) + "…";
  } finally { await ctx.close(); }
});

await check("orders-create refuses a shade product with no shade (400, nothing written)", async () => {
  const { handler } = await import(join(ROOT, "netlify/functions/orders-create.js"));
  const blobs = Buffer.from(JSON.stringify({ url: "http://127.0.0.1:9", token: "shade" })).toString("base64");
  const r = await handler({ httpMethod: "POST", blobs, headers: { "content-type": "application/json", host: "deploy-preview-1--ariashopperu.netlify.app" }, body: JSON.stringify({
    items: [{ retailer: "ulta", title: "Slim Lip Pencil Lip Liner", priceUsd: 6, qty: 1 }], quote: { total_usd: 20 } }) }, {});
  assert(r.statusCode === 400, "status " + r.statusCode + " " + String(r.body).slice(0, 120));
  const b = JSON.parse(r.body);
  assert(Array.isArray(b.shadeMissing) && b.shadeMissing[0] === "Slim Lip Pencil Lip Liner", r.body);
  const ok = await handler({ httpMethod: "POST", blobs, headers: { "content-type": "application/json", host: "deploy-preview-1--ariashopperu.netlify.app" }, body: JSON.stringify({
    items: [{ retailer: "walmart", dept: "beauty", shadeKind: "makeup", title: "NYX Professional Makeup Slim Lip Pencil, Long-Lasting Creamy Lip Liner, 820 Espresso, 0.035 fl oz", colorway: "820 Espresso", variantAxis: "Tono", priceUsd: 6, qty: 1 }], quote: { total_usd: 20 } }) }, {});
  assert(!/shadeMissing/.test(String(ok.body)), "a line with its shade was refused for it: " + String(ok.body).slice(0, 160));
  return b.error.slice(0, 70) + "…";
});

await check("/shade-gate.js: the product's own type decides, conservatively", async () => {
  await import(join(ROOT, "shade-gate.js"));
  const G = globalThis.AriaShadeGate;
  const yes = [["ulta", "", "Slim Lip Pencil Lip Liner"], ["ulta", "", "Shape Tape Concealer"], ["ulta", "", "M·A·Cximal Silky Matte Lipstick"],
    ["ulta", "", "Stay All Day Smudge & Set Waterproof Gel Eye Liner"], ["sephora", "", "Studio Radiance Serum Powered Foundation"],
    ["yesstyle", "beauty", "Dear Darling Water Tint - 9 Colors"], ["walmart", "beauty", "L'Oreal Paris Excellence Creme Permanent Hair Color, 5 Medium Brown, 1 Kit"],
    ["victoriassecret", "beauty", "Very Sexy Scarlet Scarlet Red Nail Lacquer"]];
  const no = [["ulta", "", "Eyeshadow Palette"], ["ulta", "", "Foundation Brush"], ["ulta", "", "Infallible 3-Second Setting Mist Spray"],
    ["ulta", "", "Firming Peptide Eye Cream"], ["ulta", "", "Smushy Matte Lip Balm"], ["ulta", "", "Silicone CoverUps, Self-Adhesive Nipple Concealers"],
    ["ulta", "", "Color Last Shampoo for Color-Treated Hair"], ["ulta", "", "Good Girl Blush Eau de Parfum with Floral Vanilla"],
    ["macys", "women", "Women's Future Foundation Push-Up Strapless Bra 954381"], ["partycity", "", "Blush Birthday Foil Balloon Bouquet, 5pc"],
    ["walmart", "beauty", "CeraVe Sunscreen Tinted Hydrating 100% Mineral Broad-Spectrum Lotion SPF 30 for Face with Sheer Tint"],
    ["macys", "beauty", "Laura's Essentials Eclectic & Elegant 12 Multi-Finish Eyeshadows, 1 Highlighter, 1 Blush"],
    ["yesstyle", "beauty", "2 IN 1 Highlighter Contour Palette - 4 Colors"]];
  for (const [r, d, n] of yes) assert(G.isShadeDependent({ retailer: r, dept: d, name: n }), "not gated: " + n);
  for (const [r, d, n] of no) assert(!G.isShadeDependent({ retailer: r, dept: d, name: n }), "gated: " + n);
  assert(!G.lineNeedsShade({ retailer: "ulta", title: "Slim Lip Pencil Lip Liner", colorway: "Espresso" }), "a line with its shade");
  return `${yes.length} shade products, ${no.length} not`;
});

await browser.close();
server.close();
if (SHOTS) for (const f of readdirSync(SHOTS)) if (/^[0-9a-f]{32}\.webm$/.test(f)) { try { (await import("node:fs")).unlinkSync(join(SHOTS, f)); } catch {} }
console.log(`\nshade-picker: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
