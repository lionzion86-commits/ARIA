/* ==================================================================
   ENTREGA EN LIMA: THE ZONE FEE, AND FREE FROM THE ZONE'S THRESHOLD
   (#443 c.6709315389 item 7: thresholds $49 / $52 / $59, fees
   S/ 12 / 16 / 22.50, label "entrega en Lima gratis").

   - scripts/lib/lima-delivery.js: each zone's fee and threshold, the
     boundary (at the threshold it is free), district matching (accents,
     case, "Surco" / "Santiago de Surco"), an unknown Lima district
     charged as zona 3, nothing outside Lima;
   - orders-create.js charges the same figure from the same module and
     adds it to the soles total; checkout.html sends and sums it;
   - checkout.html at 390 px: a small Lima order shows the zone's fee, an
     order over the threshold shows GRATIS and "Entrega en Lima gratis".
     SHOT_DIR keeps screenshots.

     node scripts/test/lima-delivery-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  LIMA_DELIVERY_ZONES, limaDelivery, limaDeliveryFeePen, limaZoneOf, limaDeliveryNote, LIMA_DELIVERY_FREE_LABEL,
} from "../lib/lima-delivery.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log(`  ok   ${name}${note ? ` -- ${note}` : ""}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")}`); }
}

console.log("\n  The rule (scripts/lib/lima-delivery.js)");
await check("three zones, exactly the ordered pairs: $49 -> S/ 12, $52 -> S/ 16, $59 -> S/ 22.50", () => {
  assert.deepEqual(LIMA_DELIVERY_ZONES.map((z) => [z.freeFromUsd, z.feePen]), [[49, 12], [52, 16], [59, 22.5]]);
});
for (const [district, zone, fee, from] of [["Miraflores", "lima-1", 12, 49], ["San Juan de Lurigancho", "lima-2", 16, 52], ["Punta Hermosa", "lima-3", 22.5, 59]]) {
  await check(`${district}: S/ ${fee.toFixed(2)} under US$ ${from}, free at US$ ${from} and over`, () => {
    assert.equal(limaZoneOf(district).zone.id, zone);
    assert.equal(limaDeliveryFeePen("Lima", district, from - 0.01), fee);
    assert.equal(limaDeliveryFeePen("Lima", district, from), 0, "at the threshold it is free");
    assert.equal(limaDeliveryFeePen("Lima", district, from + 40), 0);
    const d = limaDelivery("Lima", district, from - 10);
    assert.equal(d.missingUsd, 10);
    assert.equal(d.free, false);
  });
}
await check("district matching ignores accents, case, spacing and «distrito de»", () => {
  for (const s of ["surco", "Santiago de Surco", "  SAN  BORJA ", "Jesus Maria", "jesús maría", "Distrito de Lince", "Rimac"]) {
    assert.equal(limaZoneOf(s).known, true, s);
    assert.equal(limaZoneOf(s).zone.id, "lima-1", s);
  }
  assert.equal(limaZoneOf("callao").zone.id, "lima-2");
  assert.equal(limaZoneOf("san bartolo").zone.id, "lima-3");
});
await check("an unknown Lima district is charged as zona 3 (never under the real fee) and says so", () => {
  const d = limaDelivery("Lima", "Urb. Las Flores 123", 20);
  assert.equal(d.known, false);
  assert.equal(d.feePen, 22.5);
  assert.match(limaDeliveryNote(d, 3.5), /no reconocemos el distrito/);
});
await check("outside Lima there is no Lima line (the provincia leg applies instead)", () => {
  assert.equal(limaDelivery("Arequipa", "Miraflores", 10), null);
  assert.equal(limaDeliveryFeePen("Cusco", "Surco", 10), 0);
  assert.equal(limaDeliveryFeePen("", "Surco", 10), 0);
});
await check("the notes: «Entrega en Lima gratis» when free; what is missing, soles first, when not", () => {
  assert.equal(LIMA_DELIVERY_FREE_LABEL, "Entrega en Lima gratis");
  assert.match(limaDeliveryNote(limaDelivery("Lima", "Surco", 80), 3.5), /^Entrega en Lima gratis/);
  const n = limaDeliveryNote(limaDelivery("Lima", "Surco", 40), 3.5);
  assert.match(n, /te faltan S\/ 31\.50 \(US\$ 9\.00\) en productos para entrega en Lima gratis/);
  assert.doesNotMatch(n, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

console.log("\n  The server and the page use the same module");
await check("orders-create.js recomputes the fee from destCity, the district and the verified products, and adds it to the soles total", () => {
  const src = readFileSync(ROOT + "netlify/functions/orders-create.js", "utf8");
  assert.match(src, /import \{ limaDelivery \} from "\.\.\/\.\.\/scripts\/lib\/lima-delivery\.js";/);
  assert.match(src, /limaDelivery\(destCity, body\.shipping && body\.shipping\.addrDistrict, priceUsdTotal\)/);
  assert.match(src, /\+ buyerFeePenCharged \+ limaDeliveryFeePenCharged\) \* 100\) \/ 100/);
  assert.doesNotMatch(src, /body\.limaDeliveryFeePen/, "the server must not trust the page's figure");
});
await check("checkout.html sums the fee into every total it shows and sends", () => {
  const src = readFileSync(ROOT + "checkout.html", "utf8");
  assert.match(src, /from '\.\/scripts\/lib\/lima-delivery\.js'/);
  const sums = src.match(/expressFee \+ ariaFee(?: \+ limaFee)?/g);
  assert.ok(sums.length >= 5 && sums.every((s) => s.endsWith("+ limaFee")), "a total leaves the Lima fee out");
  assert.equal((src.match(/currentAriaDeliveryFeePen\(\) \+ currentLimaDeliveryFeePen\(\)/g) || []).length, 2);
});

/* ---------------- the browser, 390 px ---------------- */
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { console.log("\n  browser: playwright is not installed -- skipped"); }
if (chromium) {
  console.log("\n  checkout.html at 390 px");
  const VENTA = 3.5;
  const twDir = mkdtempSync(join(tmpdir(), "lima-tw-"));
  writeFileSync(join(twDir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(join(twDir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
  const tw = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(twDir, "tw.config.cjs"), "-i", join(twDir, "in.css"), "-o", join(twDir, "out.css")], { encoding: "utf8" });
  const TW_CSS = tw.status === 0 ? readFileSync(join(twDir, "out.css"), "utf8") : "";
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const u = new URL(req.url, "http://x");
      if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
      if (u.pathname.startsWith("/.netlify/functions/")) {
        const fn = u.pathname.split("/").pop();
        const json = (o, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
        if (fn === "exchange-rate") return json({ venta: VENTA, compra: VENTA - 0.02, origen: "test" });
        if (fn === "shipping-quote") { const b = JSON.parse(body || "{}"); const f = Math.round(Number(b.peso_kg) * 13 * 100) / 100; return json({ total_usd: Number(b.valor_usd) + f, flete_usd: f }); }
        return json({ error: "stubbed" }, 404);
      }
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(p));
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const SHOTS = process.env.SHOT_DIR || "";
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const line = (title, priceUsd) => ({ title, name: title, retailer: "revolve", brand: "Prueba", priceUsd, dutiableUsd: Math.round(priceUsd / 1.24 * 100) / 100, qty: 1, weightKg: 0.3, image: "", selectedSize: "M" });
  async function open(cart, district) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript((c) => {
      try {
        localStorage.setItem("aria_fx_rate_v1", JSON.stringify({ venta: 3.5, compra: 3.48, fetchedAt: Date.now(), origen: "test" }));
        localStorage.setItem("aria_cart_v1", JSON.stringify(c));
      } catch (e) {}
    }, cart);
    await ctx.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host === new URL(BASE).host) return route.continue();
      if (u.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" });
      return route.abort();
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#addrDistrict", { timeout: 30000 });
    await page.fill("#addrDistrict", district);
    await page.selectOption("#addrRegion", "Lima");
    await page.selectOption("#destCity", "Lima");
    await page.waitForSelector("#sumLimaDeliveryRow:not([hidden])", { timeout: 30000 });
    return { ctx, page };
  }
  const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim());
  try {
    await check("Lima, Surco, US$ 30 of products: «Entrega en Lima» S/ 12.00, what is missing to make it free", async () => {
      const { ctx, page } = await open([line("Top de prueba", 30)], "Surco");
      try {
        assert.equal(await text(page, "#sumLimaDeliveryLabel"), "Entrega en Lima");
        assert.equal(await text(page, "#sumLimaDelivery"), "S/ 12.00");
        assert.match(await text(page, "#sumLimaDeliveryNote"), /Zona 1 · te faltan S\/ 66\.50 \(US\$ 19\.00\) en productos para entrega en Lima gratis/);
        if (SHOTS) { await page.$eval("#sumLimaDeliveryRow", (el) => el.scrollIntoView({ block: "center" })); await page.screenshot({ path: join(SHOTS, "lima-delivery-fee-390.png") }); }
        return await text(page, "#sumLimaDeliveryRow");
      } finally { await ctx.close(); }
    });
    await check("Lima, Surco, US$ 60 of products: GRATIS, «Entrega en Lima gratis»", async () => {
      const { ctx, page } = await open([line("Vestido de prueba", 60)], "Surco");
      try {
        assert.equal(await text(page, "#sumLimaDelivery"), "GRATIS");
        assert.match(await text(page, "#sumLimaDeliveryNote"), /^Entrega en Lima gratis · Zona 1$/);
        if (SHOTS) { await page.$eval("#sumLimaDeliveryRow", (el) => el.scrollIntoView({ block: "center" })); await page.screenshot({ path: join(SHOTS, "lima-delivery-free-390.png") }); }
        return await text(page, "#sumLimaDeliveryRow");
      } finally { await ctx.close(); }
    });
    await check("Lima, Punta Hermosa, US$ 55: zona 3 is still S/ 22.50 (its threshold is US$ 59); Arequipa hides the row", async () => {
      const { ctx, page } = await open([line("Casaca de prueba", 55)], "Punta Hermosa");
      try {
        assert.equal(await text(page, "#sumLimaDelivery"), "S/ 22.50");
        await page.selectOption("#destCity", "Arequipa");
        await page.waitForSelector("#sumLimaDeliveryRow[hidden]", { state: "attached", timeout: 10000 });
      } finally { await ctx.close(); }
    });
  } finally { await browser.close(); server.close(); }
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
