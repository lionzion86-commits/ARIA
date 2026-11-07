/* ==================================================================
   THE IMPORT-LIMIT BAR SAYS WHERE THE ORDER STANDS, NEVER A FIGURE
   (#443 c.6709315389 item 4, Danny, 2026-11-07).

   The bar (cart: renderTaxZoneBar / renderCustomsDisclosure in the
   bundle; checkout: renderTaxTracker; the product view and producto.html
   tax-line notes; the honest-pricing banner; the search-results banner)
   shows only that the order is under, approaching or past "el límite de
   importación": no dollar amount and no percentage. From "approaching"
   on it carries the tip to split the purchase into separate orders.
   All Spanish; the price shown stays final.

   The browser half drives the real cart and checkout at 390 px; set
   SHOT_DIR to keep the screenshots.

   RUNNING IT
     node scripts/test/tax-bar-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pageHtml, liftDeclarations } from "../lib/page-lift.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log(`  ok   ${name}${note ? ` -- ${note}` : ""}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")}`); }
}

/* A figure is a dollar amount ("$200", "US$ 200", "200 dólares") or a
   percentage ("25%", "23 por ciento"). Soles amounts are not the limit. */
const FIGURE = /(US)?\$\s?\d|\d\s?%|\bpor ciento\b|\d+\s*d[oó]lares/i;
const LIMIT_WORDS = /l[ií]mite de importaci[oó]n/;
const TIP = /divide tu compra en pedidos separados/;
const ENGLISH = /\b(the|your|order|import|limit|tax|split)\b/i;

const html = pageHtml(ROOT);
const bundleSrc = readFileSync(ROOT + readFileSync(ROOT + "index.html", "utf8").match(/build\/app-[0-9a-f]+\.js/)[0], "utf8").replace(/\r\n/g, "\n");

function fakeDocument() {
  const nodes = {};
  return {
    nodes,
    getElementById(id) { return (nodes[id] = nodes[id] || { innerHTML: "", id }); },
  };
}
/* The lifted code runs in its own context; its `document` is this
   stable proxy (handed over on the shared console object), pointed at a
   fresh fake for every run. */
let currentDoc = null;
console.__ariaDoc = { getElementById: (id) => currentDoc.getElementById(id) };
const strip = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

console.log("\n  The cart bar (bundle)");
const L = liftDeclarations(html, [
  "IMPORT_TAX_THRESHOLD_USD", "IMPORT_TAX_RATE", "IMPORT_LIMIT_TIP", "IMPORT_LIMIT_UNDER_NOTE",
  "TAX_ZONE_THRESHOLD_USD", "TAX_ZONE_RATE", "TAX_ZONE_AMBER_START_USD", "CUSTOMS_CLOSING_LINE",
  "renderTaxZoneBar", "renderCustomsDisclosure", "HONEST_PRICING_BANNER_HTML",
], { extra: "var document = console.__ariaDoc; var fxRate = 0; function escapeHtml(s){ return String(s).replace(/[&<>\"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]; }); }" });
for (const [label, usd, want] of [
  ["well under", 60, { words: /bajo el l[ií]mite de importaci[oó]n/, tip: false }],
  ["approaching", 170, { words: /se acerca al l[ií]mite de importaci[oó]n/, tip: true }],
  ["right at the limit", 200, { words: /se acerca al l[ií]mite de importaci[oó]n/, tip: true }],
  ["past it", 260, { words: /pas[oó] el l[ií]mite de importaci[oó]n/, tip: true }],
]) {
  await check(`cart bar, ${label}: words only, no $ amount and no %${want.tip ? ", with the split tip" : ""}`, () => {
    const out = runBar(usd);
    assert.match(out.bar, want.words, "the bar does not say where the order stands: " + out.bar);
    assert.doesNotMatch(out.bar, FIGURE, "the bar prints a figure: " + out.bar);
    assert.doesNotMatch(out.disclosure, FIGURE, "the disclosure prints a figure: " + out.disclosure);
    assert.doesNotMatch(out.bar + " " + out.disclosure, /\b200\b/, "the limit figure is printed");
    assert.equal(TIP.test(out.bar), want.tip, "split tip " + (want.tip ? "missing" : "shown too early") + ": " + out.bar);
    assert.doesNotMatch(out.bar + out.disclosure, ENGLISH, "English copy on the bar");
    return out.bar;
  });
}
function runBar(usd) {
  const doc = (currentDoc = fakeDocument());
  L.renderTaxZoneBar(usd);
  L.renderCustomsDisclosure(usd);
  return { bar: strip(doc.nodes.taxZoneBarWrap.innerHTML), disclosure: strip(doc.nodes.customsDisclosureWrap.innerHTML), html: doc.nodes.taxZoneBarWrap.innerHTML };
}

await check("cart bar width moves in 10% steps (an exact width is the declared value in disguise)", () => {
  const w = (usd) => Number(/width:(\d+)%/.exec(runBar(usd).html)[1]);
  assert.equal(w(173), 80);
  assert.equal(w(19), 0);
  assert.equal(w(999), 100);
});

await check("the honest-pricing banner names no $ amount and no %, says the price is final", () => {
  const t = strip(L.HONEST_PRICING_BANNER_HTML);
  assert.doesNotMatch(t, FIGURE, t);
  assert.match(t, /precio que ves es el final/);
  assert.match(t, LIMIT_WORDS);
  assert.match(t, TIP);
});

await check("product view tax line: the under-limit note has no figure", () => {
  const P = liftDeclarations(html, ["IMPORT_LIMIT_UNDER_NOTE"]);
  assert.doesNotMatch(P.IMPORT_LIMIT_UNDER_NOTE, FIGURE);
  assert.match(bundleSrc, /\n    : IMPORT_LIMIT_UNDER_NOTE;\n  return `<div data-tax-line/, "productTaxLineHTML no longer uses the note");
});

console.log("\n  The pages");
await check("checkout.html: tracker, tip, policy note and tax-row note print no $ amount and no %", () => {
  const src = readFileSync(ROOT + "checkout.html", "utf8");
  const fn = /function renderTaxTracker\(\)\{[\s\S]*?\n  \}\n/.exec(src)[0].replace(/\/\*[\s\S]*?\*\//g, "");
  const said = (fn.match(/textContent = [^;]+;/g) || []).join(" ");
  assert.ok(said, "the tracker sets no text");
  assert.doesNotMatch(said, /\$\{|\$ ?\d|%/, "the tracker prints a figure: " + said);
  assert.match(fn, /se acerca al límite de importación/);
  const policy = /getElementById\('taxPolicyNote'\)\.textContent =([\s\S]*?);\n/.exec(src)[1];
  assert.doesNotMatch(policy, /\$\{|\$ ?\d|%/, "policy note prints a figure");
  assert.match(policy, /precio que ves es el final/);
  assert.doesNotMatch(/function renderTaxRow[\s\S]*?\n  \}\n/.exec(src)[0], /US\$ \$\{|\$\$\{/, "the tax-row note prints the limit");
});
await check("producto.html and the search banner print no limit figure", () => {
  const pdp = readFileSync(ROOT + "producto.html", "utf8");
  const note = /function taxLineHtml\(p\)\{[\s\S]*?\n\}/.exec(pdp)[0];
  assert.doesNotMatch(note, /US\$ ' \+ TAX_ESTIMATE_THRESHOLD_USD/);
  assert.match(note, /no pase el límite de importación/);
  const idx = readFileSync(ROOT + "index.html", "utf8");
  assert.doesNotMatch(idx, /200 dólares|23 por ciento/);
});

/* ---------------- the browser, 390 px ---------------- */
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { console.log("\n  browser: playwright is not installed -- skipped"); }
if (chromium) {
  console.log("\n  The real cart and checkout at 390 px");
  const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  /* checkout.html loads Tailwind from its CDN (blocked here): serve the
     same classes compiled locally, as checkout-buyer-fee-tests does. */
  const twDir = mkdtempSync(join(tmpdir(), "taxbar-tw-"));
  writeFileSync(join(twDir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(join(twDir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
  const tw = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(twDir, "tw.config.cjs"), "-i", join(twDir, "in.css"), "-o", join(twDir, "out.css")], { encoding: "utf8" });
  const TW_CSS = tw.status === 0 ? readFileSync(join(twDir, "out.css"), "utf8") : "";
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
    if (u.pathname.startsWith("/.netlify/functions/")) {
      const fn = u.pathname.split("/").pop();
      res.writeHead(fn === "exchange-rate" ? 200 : 404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(fn === "exchange-rate" ? { venta: 3.5, compra: 3.48, origen: "test" } : { error: "stubbed" }));
    }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  const SHOTS = process.env.SHOT_DIR || "";
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  /* $150 shelf at a 1.07 store: dutiable 160.50 -- approaching. */
  const LINE = { title: "Vestido midi de prueba", name: "Vestido midi de prueba", retailer: "revolve", brand: "Prueba", priceUsd: 199.02, dutiableUsd: 160.5, qty: 1, weightKg: 0.4, image: "", selectedSize: "M" };
  async function open(path, cartLines) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript((c) => {
      try {
        localStorage.setItem("aria_fx_rate_v1", JSON.stringify({ venta: 3.5, compra: 3.48, fetchedAt: Date.now(), origen: "test" }));
        localStorage.setItem("aria_cart_v1", JSON.stringify(c));
      } catch (e) {}
    }, cartLines);
    await ctx.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.host === new URL(BASE).host) return route.continue();
      if (u.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" });
      return route.abort();
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    return { ctx, page, errors };
  }
  try {
    await check("cart at 390 px, approaching: the bar reads the words and the tip, no $ amount, no %", async () => {
      const { ctx, page } = await open("/?carrito=1", [LINE]);
      try {
        await page.waitForSelector("#taxZoneBarWrap [data-import-limit-bar]", { timeout: 30000 });
        const t = (await page.textContent("#taxZoneBarWrap")).replace(/\s+/g, " ").trim();
        const d = (await page.textContent("#customsDisclosureWrap")).replace(/\s+/g, " ").trim();
        assert.match(t, /se acerca al límite de importación/);
        assert.match(t, TIP);
        assert.doesNotMatch(t + " " + d, FIGURE, t + " | " + d);
        if (SHOTS) {
          await page.$eval("#taxZoneBarWrap", (el) => el.scrollIntoView({ block: "center" }));
          await page.screenshot({ path: join(SHOTS, "tax-bar-cart-390.png") });
        }
        return t;
      } finally { await ctx.close(); }
    });
    await check("checkout at 390 px, approaching and past: tracker words, tip, policy note -- no $ amount, no %", async () => {
      for (const [name, lines, want] of [["approaching", [LINE], /se acerca al límite de importación/], ["past", [LINE, { ...LINE, title: "Vestido largo de prueba", name: "Vestido largo de prueba" }], /pasó el límite de importación/]]) {
        const { ctx, page } = await open("/checkout.html", lines);
        try {
          await page.waitForFunction(() => (document.getElementById("taxTrackerLine")?.textContent || "").length > 0, null, { timeout: 30000 });
          const tracker = (await page.textContent("#taxTrackerLine")).trim();
          const tip = await page.$eval("#taxTrackerTip", (el) => el.hidden ? "" : el.textContent.trim());
          const policy = (await page.textContent("#taxPolicyNote")).trim();
          assert.match(tracker, want, name + ": " + tracker);
          assert.match(tip, TIP, name + ": the tip is missing");
          assert.doesNotMatch(tracker + " " + tip + " " + policy, FIGURE, name + ": " + tracker + " | " + policy);
          if (SHOTS) {
            await page.$eval("#taxTrackerLine", (el) => el.scrollIntoView({ block: "center" }));
            await page.screenshot({ path: join(SHOTS, `tax-bar-checkout-${name}-390.png`) });
          }
        } finally { await ctx.close(); }
      }
    });
  } finally { await browser.close(); server.close(); }
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
