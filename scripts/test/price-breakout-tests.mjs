/* ==================================================================
   THE PRICE BREAKOUT (#439): PRODUCT PRICE, IMPORT TAX UNDER IT, TOTAL
   UNCHANGED -- AND NOTHING THAT ADDS UP TO ARIA'S MARGIN.

   Danny's ruling (2026-10-19): the product page buy box and checkout
   show the product price as one figure and, directly under it,
   "Impuestos de importación (estimado)" -- the government's part, on its
   own line. Under the $200 franquicia the line reads S/ 0. Cards show
   the product price alone. The margin and the 7% Miami sales tax are
   never labeled, itemized or inferable from the figures shown (finding
   #9).

   These checks drive the real pages in a browser, for an Agua Bendita
   one-piece over the threshold and a bikini top under it:
   - the PDP (producto.html) and the home product view show the tax line,
     with the estimate checkout will charge for that item alone;
   - checkout shows the same line, and its shown lines add up, to the
     céntimo, to the total the server charges (orders-create.js math);
   - no label names margen / comisión / 7% / sales tax / valor declarado;
   - no shown figure is the raw shelf price or the dutiable value, and no
     two shown figures differ by (or divide to) the margin.
   Plus: producto.html's mirrored tax rule is weight-data.js's.

   RUNNING IT
     python3 -m http.server 8899        # from the repo root
     node scripts/test/price-breakout-tests.mjs
   ARIA_BASE_URL and PLAYWRIGHT_CHROMIUM work as in browser-tests.mjs.
   ================================================================== */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importTaxEstimateUsd, TAX_ESTIMATE_THRESHOLD_USD, TAX_ESTIMATE_RATE, CHARGE_PER_KG, smallOrderFeePen } from "../../weight-data.js";
import { resolveCartWeights } from "../../netlify/functions/_weight-resolve.js";
import { liftDeclarations } from "../lib/page-lift.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const BASE = process.env.ARIA_BASE_URL || "http://127.0.0.1:8899";
const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const VENTA = 3.5;
const r2 = (n) => Math.round(Number(n) * 100) / 100;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

/* The two test items, read from the PDP shards' own source of truth. */
const OVER = { name: "Durazno Playa One piece", retailer: "aguabendita", raw: 380 };
const UNDER = { name: "Olmo Petalo Bikini Top", retailer: "aguabendita", raw: 60 };

const pdpSrc = readFileSync(ROOT + "producto.html", "utf8").replace(/\r\n/g, "\n");
const PDP = liftDeclarations(pdpSrc, ["tieredMarginUsd", "TAX_EXEMPT", "salesTaxRate", "finalUsd", "TAX_ESTIMATE_THRESHOLD_USD", "TAX_ESTIMATE_RATE", "importTaxEstimateUsd", "dutiableUsd", "PDP_LINE_KG", "CHARGE_PER_KG"]);

/* What every figure should be, from the shared definitions. */
function expected(item) {
  const P = PDP.finalUsd(item.raw, item.retailer);
  const d = r2(item.raw * PDP.salesTaxRate(item.retailer));
  const line = { title: item.name, retailer: item.retailer, priceUsd: P, weightKg: PDP.PDP_LINE_KG, weightEstimated: true, qty: 1 };
  const kg = resolveCartWeights([line]).totalKg;
  const freight = r2(kg * CHARGE_PER_KG);
  const tax = importTaxEstimateUsd(d, freight);
  return { P, d, kg, freight, tax, line };
}

/* Shown money, as USD numbers: "S/ 1.234,50" / "S/ 1,234.50" / "US$ 12.00" / "$12.00". */
function moneyFigures(text) {
  const out = [];
  for (const m of text.matchAll(/(S\/|US\$|\$)\s?([\d.,]+\d)/g)) {
    let s = m[2];
    if (/,\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, "");
    const n = Number(s);
    if (!Number.isFinite(n)) continue;
    if (n === TAX_ESTIMATE_THRESHOLD_USD && !/[.,]\d{2}$/.test(m[2])) continue;   /* "US$ 200": the franquicia, not a price */
    out.push({ usd: m[1] === "S/" ? n / VENTA : n, raw: m[0], soles: m[1] === "S/" ? n : null });
  }
  return out;
}

const FORBIDDEN_LABEL = /margen|comisi[oó]n|\b7\s?%|sales tax|impuesto (?:a las |de )?ventas?|valor declarado|recargo de servicio|servicio Aria|\+\s?24\s?%/i;

/* No figure on screen is the shelf price or the dutiable value; no two
   figures differ by, or divide to, the margin. Tolerance: one céntimo
   of conversion either way. */
function assertNoMarginTrail(text, e, where) {
  const figs = moneyFigures(text).map((f) => f.usd).filter((n) => n > 0.5);
  const near = (a, b) => Math.abs(a - b) <= 0.011 / VENTA + 0.006;
  const forbiddenSingles = { "the store's shelf price": e.raw, "the dutiable value": e.d };
  for (const [what, v] of Object.entries(forbiddenSingles)) {
    for (const f of figs) assert.ok(!near(f, v), `${where} shows ${what} (${v})`);
  }
  const marginGaps = [e.P - e.d, e.P - e.raw, e.P - e.P / 1.07, e.d - e.raw].filter((g) => g > 0.5);
  const factors = [e.P / e.d, e.P / e.raw, 1.07];
  for (let i = 0; i < figs.length; i++) for (let j = 0; j < figs.length; j++) {
    if (i === j) continue;
    const [a, b] = [figs[i], figs[j]];
    for (const g of marginGaps) assert.ok(!(Math.abs(a - b - g) < 0.02), `${where}: ${a.toFixed(2)} - ${b.toFixed(2)} is the margin gap ${g.toFixed(2)}`);
    for (const k of factors) assert.ok(!(b > 1 && Math.abs(a / b - k) < 0.0005 && !near(a, b)), `${where}: ${a.toFixed(2)} / ${b.toFixed(2)} is the margin factor ${k.toFixed(4)}`);
  }
}

const OVER_E = expected({ ...OVER });
const UNDER_E = expected({ ...UNDER });
OVER_E.raw = OVER.raw; UNDER_E.raw = UNDER.raw;

await check("the test items sit on the two sides of the threshold", () => {
  assert.ok(OVER_E.d > TAX_ESTIMATE_THRESHOLD_USD && OVER_E.tax > 0, "the one-piece is not over $200 dutiable");
  assert.ok(UNDER_E.d <= TAX_ESTIMATE_THRESHOLD_USD && UNDER_E.tax === 0, "the bikini top is not under $200 dutiable");
});

await check("producto.html's tax rule is weight-data.js's, on the same base the cart line stamps", () => {
  assert.equal(PDP.TAX_ESTIMATE_THRESHOLD_USD, TAX_ESTIMATE_THRESHOLD_USD);
  assert.equal(PDP.TAX_ESTIMATE_RATE, TAX_ESTIMATE_RATE);
  assert.equal(PDP.CHARGE_PER_KG, CHARGE_PER_KG);
  for (const fob of [0, 150, 200, 200.01, 406.6, 999.99, 3000]) for (const f of [0, 2.6, 13, 40]) {
    assert.equal(PDP.importTaxEstimateUsd(fob, f), importTaxEstimateUsd(fob, f), `fob ${fob} freight ${f}`);
  }
  /* The tax base is the same dutiableUsd the add-to-cart line carries. */
  assert.match(pdpSrc, /dutiableUsd: Math\.round\(Number\(p\.price\) \* salesTaxRate\(p\.retailer\) \* 100\) \/ 100/);
  assert.equal(PDP.dutiableUsd(380, "aguabendita"), r2(380 * 1.07));
});

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
async function newPage({ cart = null, familia = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(({ venta, cart }) => {
    try {
      localStorage.setItem("aria_fx_rate_v1", JSON.stringify({ venta, compra: venta - 0.02, fetchedAt: Date.now(), origen: "test" }));
      if (cart) localStorage.setItem("aria_cart_v1", JSON.stringify(cart));
    } catch (e) {}
  }, { venta: VENTA, cart });
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
      return /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u.pathname) || route.request().resourceType() === "image"
        ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" })
        : route.abort();
    }
    const fn = u.pathname.match(/^\/\.netlify\/functions\/([\w-]+)/)?.[1];
    if (!fn) return route.continue();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (fn === "exchange-rate") return json({ venta: VENTA, compra: VENTA - 0.02, origen: "test" });
    if (fn === "auth-me") return json(familia ? { email: "familia@correo.test", familia: true } : { email: null });
    if (fn === "resolve-weight") return json(resolveCartWeights(JSON.parse(route.request().postData() || "{}").items || []));
    if (fn === "shipping-quote") {
      const b = JSON.parse(route.request().postData() || "{}");
      const flete = r2(Number(b.peso_kg) * CHARGE_PER_KG);
      return json({ total_usd: r2(Number(b.valor_usd) + flete), total_pen: null, flete_usd: flete });
    }
    return json({ error: "stubbed" }, 404);
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { page.__errors = (page.__errors || []).concat(String(e)); });
  return page;
}

const solesOf = (usd) => r2(usd * VENTA);
const fmtS = (pen) => pen.toFixed(2);
/* The PDP formats usd x rate with toFixed, as its cards always have. */
const pdpSoles = (usd) => (usd * VENTA).toFixed(2);

async function openPdp(item, opts = {}) {
  const page = await newPage(opts);
  await page.goto(`${BASE}/producto.html?producto=${encodeURIComponent(item.name)}&tienda=${item.retailer}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#p-tax", { timeout: 20000 });
  await page.waitForFunction(() => { const a = document.getElementById("p-tax-amt"); return !a || !/calculando/.test(a.textContent); }, null, { timeout: 15000 });
  return page;
}

for (const [label, item, e] of [["over $200", OVER, OVER_E], ["under $200", UNDER, UNDER_E]]) {
  await check(`PDP ${label}: product price, then the import-tax line under it`, async () => {
    const page = await openPdp(item);
    const box = await page.evaluate(() => {
      const pen = document.querySelector(".p-pen")?.textContent || "";
      const tax = document.getElementById("p-tax");
      const after = tax && document.querySelector(".p-pen").compareDocumentPosition(tax) & Node.DOCUMENT_POSITION_FOLLOWING;
      return { pen, tax: tax ? tax.innerText : "", after: Boolean(after), block: document.querySelector("#p-body .grid2 > div:last-child")?.innerText || "" };
    });
    assert.equal(box.pen, "S/ " + pdpSoles(e.P), "the headline is not the product price in soles");
    assert.ok(box.after, "the tax line is not under the price");
    if (e.tax > 0) {
      assert.match(box.tax, /Impuestos de importación \(estimado\)/);
      assert.ok(box.tax.includes("S/ " + pdpSoles(e.tax)), `tax line ${JSON.stringify(box.tax)} is not the estimate S/ ${pdpSoles(e.tax)}`);
    } else {
      assert.match(box.tax, /Impuestos de importación/);
      assert.ok(box.tax.includes("S/ 0.00"), "under the threshold the line does not read S/ 0");
      assert.match(box.tax, /hasta US\$ 200/, "the franquicia is not stated");
    }
    assert.doesNotMatch(box.block, FORBIDDEN_LABEL, "the buy box names the margin / 7% / declared value");
    assertNoMarginTrail(box.block, e, "PDP " + label);
    assert.ok(!page.__errors, "page errors: " + (page.__errors || []).join(" | "));
    await page.context().close();
  });
}

for (const [label, item, e] of [["over $200", OVER, OVER_E], ["under $200", UNDER, UNDER_E]]) {
  await check(`home product view ${label}: same price, same tax line, no "incl. impuestos"`, async () => {
    const bundleSrc = readFileSync(ROOT + readFileSync(ROOT + "index.html", "utf8").match(/build\/app-[0-9a-f]+\.js/)[0], "utf8");
    assert.match(bundleSrc, /\+ productTaxLineHTML\(totalUsd, pendingProduct\.dutiableUsd, weightKg\)/, "showProduct no longer draws the tax line");
    const page = await newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof showProduct === "function" && typeof fxRate !== "undefined" && fxRate > 0, null, { timeout: 20000 });
    /* index.html sends every named product tap to producto.html, so the
       SPA view is drawn here from the same two pieces showProduct uses. */
    const out = await page.evaluate(({ e }) => {
      const div = document.createElement("div");
      div.innerHTML = escapeHtml(fmtPEN(displayPriceUsd(e.P, e.d))) + " " + escapeHtml(fmtUSD(e.P)) + productTaxLineHTML(e.P, e.d, e.kg);
      const card = displayPriceUsd(e.P, e.d);
      return { text: div.textContent.replace(/\s+/g, " ").trim(), card, badge: impuestosBadgeHTML(e.P, e.d), uses: String(showProduct).length };
    }, { e });
    assert.equal(out.card, e.P, "a card still bakes the import tax into the product price");
    assert.equal(out.badge, "", "the 'Impuestos incluidos' badge still renders");
    const penFmt = (n) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n).replace(/\s+/g, " ");
    assert.ok(out.text.startsWith(penFmt(solesOf(e.P))), "the product view does not lead with the soles price: " + JSON.stringify(out.text.slice(0, 40)));
    assert.doesNotMatch(out.text, /incl\. impuestos/);
    const taxSoles = penFmt(solesOf(e.tax));
    assert.ok(out.text.includes(taxSoles), `the product view's tax line is not ${taxSoles}: ${JSON.stringify(out.text)}`);
    assert.match(out.text, e.tax > 0 ? /Impuestos de importación \(estimado\)/ : /hasta US\$ 200/);
    assert.doesNotMatch(out.text, FORBIDDEN_LABEL);
    assertNoMarginTrail(out.text, e, "product view " + label);
    await page.context().close();
  });
}

for (const [label, item, e] of [["over $200", OVER, OVER_E], ["under $200", UNDER, UNDER_E]]) {
  await check(`checkout ${label}: the tax line, and the lines add up to what the server charges`, async () => {
    const line = { ...e.line, dutiableUsd: e.d, image: "", brand: "Agua Bendita", selectedSize: "M" };
    const page = await newPage({ cart: [line] });
    await page.goto(`${BASE}/checkout.html`, { waitUntil: "load" });
    await page.waitForFunction(() => /Flete actualizado/.test(document.getElementById("quoteStatus")?.textContent || ""), null, { timeout: 20000 });
    const s = await page.evaluate(() => {
      const t = (id) => { const el = document.getElementById(id); return el && !el.hidden && !el.closest("[hidden]") ? el.innerText : ""; };
      return {
        products: t("sumProducts"), flete: t("sumFlete"), tax: t("sumTax"), taxLabel: t("sumTaxLabel"), taxNote: t("sumTaxNote"),
        small: t("sumSmallOrder"), prov: t("sumProvincia"), express: t("sumExpress"), total: t("sumTotal"),
        summary: document.getElementById("sumTotal").closest("aside")?.innerText || "",
      };
    });
    const firstSoles = (txt) => { const f = moneyFigures(txt).find((x) => x.soles != null); return f ? f.soles : null; };
    for (const k of ["products", "flete", "tax", "total"]) assert.ok(/^S\/\s?/.test(s[k].trim()), `${k} does not lead with soles: ${JSON.stringify(s[k])}`);
    const lines = ["products", "flete", "tax", "small", "prov", "express"].map((k) => (s[k] ? firstSoles(s[k]) || 0 : 0));
    const sum = r2(lines.reduce((a, b) => a + b, 0));
    const total = firstSoles(s.total);
    /* The server's charge: orders-create.js, same order, same rate. */
    const fees = smallOrderFeePen(r2((e.P + e.freight) * VENTA));
    const serverTotal = r2(r2(e.P + e.freight + e.tax) * VENTA + fees);
    assert.equal(total, serverTotal, `checkout shows ${total}, the server charges ${serverTotal}`);
    assert.equal(sum, total, `the shown lines add to ${sum}, the total reads ${total}`);
    if (e.tax > 0) {
      assert.match(s.taxLabel, /Impuestos de importación \(estimado\)/);
      assert.equal(firstSoles(s.tax), solesOf(e.tax), "checkout's estimate is not the PDP's for the same single item");
    } else {
      assert.match(s.taxLabel, /Impuestos de importación/);
      assert.equal(firstSoles(s.tax), 0, "under the threshold the line does not read S/ 0");
      assert.match(s.taxNote, /hasta US\$ 200/);
    }
    assert.doesNotMatch(s.summary, FORBIDDEN_LABEL, "the checkout summary names the margin / 7% / declared value");
    assert.doesNotMatch(s.summary, new RegExp(`~?${Math.round(TAX_ESTIMATE_RATE * 100)}\\s?%`), "the summary prints the tax rate beside the tax figure");
    assertNoMarginTrail(s.summary, e, "checkout " + label);
    const bar = await page.evaluate(() => document.getElementById("taxTrackerBar").style.width);
    assert.match(bar, /^(\d0|0|100)%$/, "the tracker bar width is exact (" + bar + "), the declared value in disguise");
    assert.ok(!page.__errors, "page errors: " + (page.__errors || []).join(" | "));
    await page.context().close();
  });
}

/* FAMILIA (#443 c.6364959264): a flagged account sees Aria's cost on the
   product page and pays cost + the standard freight and tax at checkout. */
await check("Familia: the product page shows the cost price, the checkout total is cost + standard freight + tax", async () => {
  const e = OVER_E;
  let page = await openPdp(OVER, { familia: true });
  await page.waitForFunction((want) => (document.querySelector(".p-pen") || {}).textContent === want, "S/ " + pdpSoles(e.d), { timeout: 15000 });
  await page.context().close();
  const line = { ...e.line, dutiableUsd: e.d, image: "", brand: "Agua Bendita", selectedSize: "M" };
  page = await newPage({ cart: [line], familia: true });
  await page.goto(`${BASE}/checkout.html`, { waitUntil: "load" });
  const fees = smallOrderFeePen(r2((e.d + e.freight) * VENTA));
  const want = r2(r2(e.d + e.freight + e.tax) * VENTA + fees);
  await page.waitForFunction((w) => { const f = (document.getElementById("sumTotal") || {}).innerText || ""; const m = /S\/\s?([\d,]+\.\d{2})/.exec(f); return Boolean(m) && m[1].replace(/,/g, "") === w.toFixed(2); }, want, { timeout: 20000 })
    .catch(async () => { throw new Error("checkout total " + (await page.textContent("#sumTotal")) + ", want S/ " + want.toFixed(2)); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1"))[0].priceUsd);
  assert.equal(saved, e.line.priceUsd, "the saved cart was rewritten to cost");
  assert.ok(!page.__errors, "page errors: " + (page.__errors || []).join(" | "));
  await page.context().close();
});

await check("the cart's customs box no longer prints the declared value", () => {
  const bundle = readFileSync(ROOT + (readFileSync(ROOT + "index.html", "utf8").match(/build\/app-[0-9a-f]+\.js/) || [])[0], "utf8").replace(/\r\n/g, "\n");
  const at = bundle.indexOf("function renderCustomsDisclosure(");
  const body = bundle.slice(at, bundle.indexOf("\n}\n", at));
  assert.doesNotMatch(body, /Valor declarado|penWithUsd\(usdSubtotal\)/);
  assert.doesNotMatch(bundle.slice(0, bundle.indexOf("function dutiableBaseUsd(")), /ya los incluye/);
  assert.doesNotMatch(bundle, /ya trae los impuestos|ya los trae incluidos/);
});

await browser.close();
console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
