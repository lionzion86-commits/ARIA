#!/usr/bin/env node
/* ==================================================================
   THE IMPORT TAX UNDER EVERY CARD PRICE (#443 c.6592753099; Danny's
   standing standard of Oct 28: directly under every card price a small
   "+ S/ ___ IMP", so the import tax is never first seen at checkout).

   1. STATIC. Every product-card renderer on the site -- each page's own
      cardHTML, the store page, search and its comparison rows, the brand
      page and its focus (Comparador), Ofertas, the product page's rails,
      the auto pages, the account's picks and the homepage bundle's cards
      -- draws the line through the one helper (/import-tax.js
      AriaImportTax.lineHTML, or the bundle's cardImpLineHTML, which
      hands to it). A renderer is any named function that builds a
      product card (a link to producto.html, a card root) AND a price
      row; a new one without the line fails here. Every page that draws
      such a card loads /import-tax.js.
   2. ONE DEFINITION. weight-data.js (checkout, orders-create, the door
      price) re-exports /import-tax.js; the constants agree with the
      page copies and index.html's exempt list.
   3. CHECKOUT'S NUMBERS. For real catalogue products -- under, at and
      over the $200 line, pre-priced (Aria Perfumes), tax-exempt Walmart
      -- the card's line equals checkout's own "Impuestos de importación"
      row for a cart holding that one product.
   4. THE SURFACES AT 390px: the Drones landing, a store page, a search
      results landing, a brand page with the Comparador, and Ofertas --
      every card over the line shows it, none under it does.

     node scripts/test/card-imp-line-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/card-imp-line-tests.mjs   (also saves imp-*.png)
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(ROOT);
await import("../../import-tax.js");
const T = globalThis.AriaImportTax;
const W = await import("../../weight-data.js");
const { resolveCartWeights } = await import("../../netlify/functions/_weight-resolve.js");
const { pageHtml } = await import("../lib/page-lift.mjs");
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const VENTA = 3.75;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name + "\n         " + e.message); }
}

/* ------------------------------------------------------------------
   1. STATIC: every card renderer calls the helper.
   ------------------------------------------------------------------ */
const bundleRel = "build/" + readdirSync(join(ROOT, "build")).find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
const indexSrc = readFileSync(join(ROOT, "index.html"), "utf8");
assert.ok(indexSrc.includes('src="/' + bundleRel + '"'), "index.html does not load " + bundleRel);
const SOURCES = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".html")),
  ...readdirSync(join(ROOT, "assets/js")).filter((f) => f.endsWith(".js")).map((f) => "assets/js/" + f),
  bundleRel,
];
/* What makes a function a product card, and what makes it draw a price row. */
const CARD_RX = /producto\.html\?producto=|data-card-root|class="card"|class="pcard"|rel-card|class="pick"|cmp-row|fc-row|data-assistant-card|openCrossSellProduct\(|productHref\(/;
const PRICE_RX = /rel-pricebox|\bpriceInner\(|\bslPriceHTML\(|\bpriceHTML\(|\bfmtDisplayPrice\(|\brailLeadPrice\(|\bsolesUnderHTML\(|\bcardSolesHTML\(|\bcardPrice\(|\bamountHTML\(|fmtPEN\(usd \* rateNow\(\)\)/;
const IMP_RX = /AriaImportTax\.lineHTML\(|\bcardImpLineHTML\(|\bimpLineHTML\(|\bimp\(\w+, "(?:div|span)"\)/;
/* Functions that format or repaint a price and build no card of their own. */
const NOT_CARDS = new Set(["priceInner", "priceHTML", "slPriceInner", "paintPrices", "renderSlPrices", "amountHTML", "cardPrice", "solesUnderHTML", "railLeadPrice", "fmtDisplayPrice", "cardSolesHTML", "solesSlot"]);

function functionsOf(src) {
  const out = [];
  const rx = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = rx.exec(src))) {
    /* Braces only: string- and comment-aware scanning trips on regex
       literals and URLs; the site's code keeps braces balanced inside
       its strings, templates and comments. */
    let i = m.index + m[0].length, depth = 1;
    for (; i < src.length && depth > 0; i++) {
      const ch = src.charCodeAt(i);
      if (ch === 123) depth++; else if (ch === 125) depth--;
    }
    out.push({ name: m[1], start: m.index, end: i, body: src.slice(m.index, i) });
  }
  return out;
}
const RENDERERS = [];
await check("static: every product-card renderer on the site draws the IMP line through the one helper", () => {
  const missing = [];
  for (const rel of SOURCES) {
    const src = readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
    const fns = functionsOf(src);
    const covered = new Set(fns.filter((f) => IMP_RX.test(f.body) && !/^(cardImpLineHTML|impLineHTML|imp|lineHTML)$/.test(f.name)).map((f) => f.name));
    for (const f of fns) {
      /* A skeleton is a placeholder: no product, no price. */
      if (NOT_CARDS.has(f.name) || /skel/i.test(f.name) || /^(cardImpLineHTML|impLineHTML|imp|cardImpTaxUsd)$/.test(f.name)) continue;
      if (!(CARD_RX.test(f.body) && PRICE_RX.test(f.body))) continue;
      /* The innermost function owns its price rows: strip nested functions. */
      let own = f.body;
      for (const g of fns) if (g !== f && g.start > f.start && g.end <= f.end) own = own.replace(g.body, "");
      if (!(CARD_RX.test(own) && PRICE_RX.test(own))) continue;
      const calls = [...own.matchAll(/\b([A-Za-z_$][\w$]*)\(/g)].map((x) => x[1]);
      const ok = IMP_RX.test(own) || calls.some((c) => covered.has(c) && c !== f.name);
      RENDERERS.push(`${rel}:${f.name}`);
      if (!ok) missing.push(`${rel}: ${f.name}()`);
    }
  }
  assert.deepEqual(missing, [], "card renderers without the IMP line:\n           " + missing.join("\n           "));
  /* The ones the directive names are among them -- the scan still sees them. */
  for (const want of ["departamento.html:cardHTML", "tienda.html:slCardHTML", "search.html:cardHTML", "search.html:compareRowHTML",
    "marca.html:cardHTML", "assets/js/marca-focus.js:card", "assets/js/marca-focus.js:chart", "ofertas.html:cardHTML",
    "producto.html:relCardHTML", "ropa-interior.html:cardHTML", `${bundleRel}:railCardHTML`, `${bundleRel}:productCardHTML`,
    `${bundleRel}:carouselCardHTML`]) {
    assert.ok(RENDERERS.includes(want), `the scan no longer sees ${want} -- update CARD_RX / PRICE_RX`);
  }
  assert.ok(RENDERERS.length >= 18, `only ${RENDERERS.length} renderers found -- the scan broke`);
});

await check("static: every page that draws such a card loads /import-tax.js before it draws one", () => {
  const pages = new Set(RENDERERS.map((r) => r.split(":")[0]).filter((f) => f.endsWith(".html")));
  pages.add("index.html");                                    // the bundle's cards
  pages.add("marca.html");                                    // marca-focus.js
  pages.add("departamento.html");                             // dept-header.js draws AriaDept.cardHTML
  for (const p of pages) {
    const src = readFileSync(join(ROOT, p), "utf8");
    /* defer or not: a deferred tag still runs before the deferred bundle after it. */
    const at = src.search(/<script src="\/import-tax\.js"[^>]*><\/script>/);
    assert.ok(at > 0, `${p} does not load /import-tax.js`);
  }
  assert.ok(indexSrc.search(/<script src="\/import-tax\.js"[^>]*><\/script>/) < indexSrc.indexOf('src="/' + bundleRel + '"'), "index.html loads the bundle before /import-tax.js");
  const dh = readFileSync(join(ROOT, "assets/js/dept-header.js"), "utf8");
  assert.match(dh, /\.map\(D\.cardHTML\)/, "dept-header.js Explorar todo no longer draws departamento's own card");
});

/* ------------------------------------------------------------------
   2. ONE DEFINITION.
   ------------------------------------------------------------------ */
await check("one definition: weight-data.js (checkout, orders-create, door price) re-exports /import-tax.js", () => {
  assert.equal(W.TAX_ESTIMATE_THRESHOLD_USD, T.THRESHOLD_USD);
  assert.equal(W.TAX_ESTIMATE_RATE, T.RATE);
  assert.equal(W.CHARGE_PER_KG, T.CHARGE_PER_KG);
  assert.equal(W.PRE_PRICED, T.PRE_PRICED);
  for (const fob of [0, 150, 199.99, 200, 200.01, 319.93, 406.6, 999.99, 3000]) for (const f of [0, 2.6, 13, 40]) {
    assert.equal(W.importTaxEstimateUsd(fob, f), T.importTaxEstimateUsd(fob, f), `fob ${fob} freight ${f}`);
  }
  const wd = readFileSync(join(ROOT, "weight-data.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(wd, /import "\.\/import-tax\.js";/);
  assert.doesNotMatch(wd, /\*\s*TAX_ESTIMATE_RATE|<=\s*TAX_ESTIMATE_THRESHOLD_USD/, "weight-data.js does the tax arithmetic itself again");
  for (const rel of ["checkout.html", "netlify/functions/orders-create.js", "netlify/functions/_door-price.js"]) {
    assert.match(readFileSync(join(ROOT, rel), "utf8"), /importTaxEstimateUsd[\s\S]*weight-data\.js|weight-data\.js[\s\S]*importTaxEstimateUsd/, `${rel} stopped importing the estimate from weight-data.js`);
  }
});

await check("one definition: the helper's exempt and pre-priced stores are the site's (index.html TAX_EXEMPT_STATUS, every page copy)", () => {
  const html = pageHtml(ROOT);
  const block = /const TAX_EXEMPT_STATUS = \{([\s\S]*?)\n\};/.exec(html.replace(/\r\n/g, "\n"))[1];
  const exempt = [...block.matchAll(/^\s*([a-z0-9_]+):\s*'exempt'/gm)].map((m) => m[1]).sort();
  assert.deepEqual(Object.keys(T.TAX_EXEMPT).sort(), exempt);
  for (const p of ["departamento.html", "tienda.html", "marca.html", "producto.html"]) {
    const src = readFileSync(join(ROOT, p), "utf8");
    assert.deepEqual(JSON.parse(/var PRE_PRICED = (\{[^}]*\});/.exec(src)[1]), { ...T.PRE_PRICED }, p);
    assert.deepEqual(Object.keys(JSON.parse(/var TAX_EXEMPT = (\{[^}]*\});/.exec(src)[1])).sort(), exempt, p);
  }
});

await check("the dutiable value of a card is the cart line's stamp -- from the raw price, or the exact inversion of the shown price", () => {
  const P = new Function(readFileSync(join(ROOT, "departamento.html"), "utf8").match(/function tieredMarginUsd\(raw\)\{[\s\S]*?\n  \}/)[0]
    + "\nvar TAX_EXEMPT = {walmart:1}; var PRE_PRICED = {ariaperfumes:1.18};"
    + "\nfunction salesTaxRate(r){ return TAX_EXEMPT[String(r||'').toLowerCase()] ? 1 : 1.07; }"
    + "\nfunction finalUsd(raw, retailer){ if (PRE_PRICED[String(retailer||'').toLowerCase()]) return Math.round(Number(raw)*100)/100; var r = Number(raw); return Math.round((r + tieredMarginUsd(r)) * salesTaxRate(retailer) * 100) / 100; }"
    + "\nreturn { finalUsd: finalUsd, salesTaxRate: salesTaxRate };")();
  for (const retailer of ["walmart", "bhphoto", "ssense", "ariaperfumes", "aguabendita"]) {
    for (const raw of [19.99, 150, 186.92, 187, 199.99, 200, 356.49, 499.99, 500, 750, 1158, 2000, 2600, 5000, 7400]) {
      const stamp = retailer === "ariaperfumes" ? r2(raw / 1.18) : r2(raw * P.salesTaxRate(retailer));
      assert.equal(T.dutiableOf({ raw, retailer }), stamp, `${retailer} raw ${raw}`);
      const inv = T.dutiableOf({ usd: P.finalUsd(raw, retailer), retailer });
      assert.ok(Math.abs(inv - stamp) <= 0.011, `${retailer} raw ${raw}: inversion ${inv} vs stamp ${stamp}`);
    }
  }
  assert.equal(T.cardImpUsd({ raw: 186.9, retailer: "bhphoto" }, 1), 0, "199.98 of goods owes nothing on its own");
  assert.equal(T.cardImpUsd({ raw: 200, retailer: "walmart" }, 1), 0, "exactly $200 owes nothing");
  assert.ok(T.cardImpUsd({ raw: 200.01, retailer: "walmart" }, 1) > 0, "a cent over owes");
});

/* ------------------------------------------------------------------
   Real catalogue products for the number checks and the screenshots.
   ------------------------------------------------------------------ */
const CAT = JSON.parse(readFileSync(join(ROOT, "assets/search/catalog-index.json"), "utf8"));
const FI = Object.fromEntries(CAT.fields.map((f, i) => [f, i]));
const row = (pred, why) => {
  const r = CAT.rows.find(pred);
  assert.ok(r, "no catalogue row for " + why);
  return { title: r[FI.title], retailer: r[FI.retailer], raw: r[FI.price] };
};
const d0 = (r) => T.dutiableOf({ raw: r[FI.price], retailer: r[FI.retailer] });
const SAMPLES = {
  under: row((r) => r[FI.retailer] === "bhphoto" && d0(r) > 150 && d0(r) < 190, "an under-$200 B&H product"),
  at: row((r) => d0(r) === 200, "a product at exactly $200 dutiable"),
  over: row((r) => r[FI.retailer] === "bhphoto" && r[FI.title] === "DJI Mini 4K Drone", "the B&H DJI Mini 4K Drone"),
  walmart: row((r) => r[FI.retailer] === "walmart" && r[FI.title] === "DJI Mini 4K Drone with Remote Control - Gray", "the Walmart DJI Mini 4K Drone"),
  walmartBig: row((r) => r[FI.retailer] === "walmart" && r[FI.title] === "DJI Mini 5 Pro Drone Fly More Combo Plus (DJI RC 2)", "the Walmart DJI Mini 5 Pro Fly More Combo"),
  prePriced: row((r) => r[FI.retailer] === "ariaperfumes" && d0(r) > 200, "an over-$200 Aria Perfumes product"),
};

/* ------------------------------------------------------------------
   The browser: the repo served, the functions answering in-process.
   ------------------------------------------------------------------ */
const handlers = {
  department: (await import("../../netlify/functions/department.js")).handler,
  search: (await import("../../netlify/functions/search.js")).handler,
  brand: (await import("../../netlify/functions/brand.js")).handler,
  tienda: (await import("../../netlify/functions/tienda.js")).handler,
  ofertas: existsSync(join(ROOT, "netlify/functions/ofertas.js")) ? (await import("../../netlify/functions/ofertas.js")).handler : null,
  "resolve-weight": (await import("../../netlify/functions/resolve-weight.js")).handler,
};
const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const TEST_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body><div id="out"></div><script src="/import-tax.js"></script>';
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const fn = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
  if (fn) {
    const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };
    if (fn[1] === "exchange-rate") return send(200, { venta: VENTA, compra: VENTA - 0.02, origen: "test" });
    if (fn[1] === "auth-me") return send(200, { email: null });
    let body = "";
    for await (const ch of req) body += ch;
    if (fn[1] === "shipping-quote") {
      const b = JSON.parse(body || "{}");
      const flete = r2(Number(b.peso_kg) * W.CHARGE_PER_KG);
      return send(200, { total_usd: r2(Number(b.valor_usd) + flete), total_pen: null, flete_usd: flete });
    }
    const h = handlers[fn[1]];
    if (!h) return send(404, {});
    try {
      const r = await h({ httpMethod: req.method, queryStringParameters: Object.fromEntries(u.searchParams), body, headers: {} }, { fetchImpl });
      res.writeHead(r.statusCode, r.headers || { "Content-Type": "application/json" });
      return res.end(r.body || "");
    } catch (e) { return send(500, { error: String(e) }); }
  }
  if (u.pathname === "/__imp-test.html") { res.writeHead(200, { "Content-Type": MIME[".html"] }); return res.end(TEST_PAGE); }
  const f = join(ROOT, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#dfe6f2"/></svg>';
async function phone(cart) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await c.addInitScript(({ venta, cart }) => {
    try {
      localStorage.setItem("aria_fx_rate_v1", JSON.stringify({ venta, compra: venta - 0.02, fetchedAt: Date.now(), origen: "test" }));
      if (cart) localStorage.setItem("aria_cart_v1", JSON.stringify(cart));
    } catch (e) {}
  }, { venta: VENTA, cart: cart || null });
  await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { c, page, errors };
}
/* "S/ 1,234.50" -> 1234.5 */
const solesIn = (s) => { const m = /S\/\s?([\d.,]+\d)/.exec(s || ""); return m ? Number(m[1].replace(/,/g, "")) : NaN; };
/* Wait until every line on the page has its resolved weight. */
const settled = (page) => page.waitForFunction(() => {
  const all = document.querySelectorAll("[data-card-imp]");
  return all.length === 0 || document.querySelectorAll("[data-card-imp]:not([data-imp-kg])").length === 0;
}, null, { timeout: 60000 });

const SHOT = process.env.SHOT_DIR || "";
try {
  /* ----------------------------------------------------------------
     3. CHECKOUT'S NUMBERS.
     ---------------------------------------------------------------- */
  for (const [label, s] of Object.entries(SAMPLES)) {
    await check(`checkout parity, ${label}: «${s.title.slice(0, 48)}» (${s.retailer}) -- the card's line is checkout's tax row`, async () => {
      /* The card: the helper on a page, the weight from the resolver. */
      const card = await phone();
      await card.page.goto(`${BASE}/__imp-test.html`);
      await card.page.evaluate((s) => { document.getElementById("out").innerHTML = window.AriaImportTax.lineHTML({ raw: s.raw, retailer: s.retailer, title: s.title }) || "<i>none</i>"; }, s);
      await settled(card.page);
      const line = await card.page.evaluate(() => { const e = document.querySelector("[data-card-imp]"); return e ? { text: e.textContent, kg: Number(e.getAttribute("data-imp-kg")) } : null; });
      await card.c.close();
      /* Checkout, with that one product in the cart, stamped as the cart
         line is (normalizeLiveItem / producto.html). */
      const priceUsd = T.PRE_PRICED[s.retailer] ? r2(s.raw) : r2((s.raw + W.tieredMarginUsd(s.raw)) * T.salesTaxRate(s.retailer));
      const cartLine = { retailer: s.retailer, title: s.title, priceUsd, dutiableUsd: T.dutiableOf({ raw: s.raw, retailer: s.retailer }), weightKg: 0.2, weightEstimated: true, qty: 1, image: "" };
      const co = await phone([cartLine]);
      await co.page.goto(`${BASE}/checkout.html`, { waitUntil: "load" });
      await co.page.waitForFunction(() => /Flete actualizado/.test(document.getElementById("quoteStatus")?.textContent || ""), null, { timeout: 30000 });
      const tax = await co.page.evaluate(() => { const el = document.getElementById("sumTax"); return el ? el.innerText : ""; });
      await co.c.close();
      const coSoles = solesIn(tax);
      const d = T.dutiableOf(s);
      if (d > T.THRESHOLD_USD) {
        assert.ok(line, "an over-$200 card shows no IMP line");
        assert.match(line.text, /^\+ S\/ [\d,]+\.\d{2} IMP$/, line.text);
        assert.equal(solesIn(line.text), coSoles, `card ${line.text} vs checkout ${tax}`);
        const kg = resolveCartWeights([{ title: s.title, retailer: s.retailer, priceUsd, weightKg: 0.2, weightEstimated: true, qty: 1 }]).items[0].weightKg;
        assert.equal(line.kg, kg, "the card's weight is not the resolver's");
      } else {
        assert.equal(line, null, `an item at ${d} dutiable shows a line`);
        assert.ok(!(coSoles > 0), `checkout charges ${tax} on an item the card says owes nothing`);
      }
    });
  }

  /* ----------------------------------------------------------------
     4. THE SURFACES AT 390px.
     ---------------------------------------------------------------- */
  /* Every product card on the page: its store (from its link) and the
     dollar price it shows; over the line <=> it carries the IMP line. */
  const audit = (page, sel) => page.evaluate((sel) => {
    const out = [];
    document.querySelectorAll(sel).forEach((el) => {
      if (el.closest(".sk") || el.classList.contains("sk")) return;
      const href = el.getAttribute("href") || (el.querySelector("a[href]") || {}).getAttribute?.("href") || "";
      const q = new URLSearchParams(href.split("?")[1] || "");
      const store = q.get("tienda") || "";
      /* The card shows soles only (#443 c.6629812301): the dollar price it
         was figured from rides on the price row (data-usd), or on the
         soles slot itself (data-soles-usd). */
      const priceEl = el.querySelector(".cmp-ln.prod dd [data-usd], .fc-price[data-usd], [data-usd], [data-soles-usd]");
      const usd = priceEl ? Number(priceEl.getAttribute("data-usd") || priceEl.getAttribute("data-soles-usd")) : NaN;
      const shown = el.cloneNode(true);
      shown.querySelectorAll("[data-card-imp]").forEach((x) => x.remove());
      const imp = el.querySelector("[data-card-imp]");
      out.push({ store, title: q.get("producto") || "", usd, dollars: /US\$|(?<![A-Za-z/])\$\s?\d/.test(shown.innerText), soles: /S\/\s?\d/.test(shown.innerText), imp: imp ? imp.textContent : "", visible: imp ? imp.getBoundingClientRect().height > 0 : false });
    });
    return out;
  }, sel);
  function judge(cards, where) {
    let over = 0, under = 0;
    const bad = [];
    for (const c of cards) {
      if (!(c.usd > 0) || !c.store) { bad.push(`${where}: a card without a readable store/price (${c.title})`); continue; }
      /* THE CARD STANDARD (#443 c.6629812301): the price in soles, no dollar figure on the card. */
      if (c.dollars || !c.soles) bad.push(`${where}: the card's price is not soles-only -- ${c.store} ${c.title}`);
      const d = T.dutiableOf({ usd: c.usd, retailer: c.store });
      if (Math.abs(d - T.THRESHOLD_USD) < 0.02) continue;      // a cent from the line: the inversion may round either way
      if (d > T.THRESHOLD_USD) { over++; if (!c.imp || !c.visible) bad.push(`${where}: over the line, no IMP -- ${c.store} US$ ${c.usd} ${c.title}`); else if (!/^\+ S\/ [\d,]+\.\d{2} IMP$/.test(c.imp)) bad.push(`${where}: IMP line reads ${JSON.stringify(c.imp)}`); }
      else { under++; if (c.imp) bad.push(`${where}: under the line, but shows ${c.imp} -- ${c.store} US$ ${c.usd} ${c.title}`); }
    }
    assert.deepEqual(bad.slice(0, 12), [], `${bad.length} problems`);
    return { over, under };
  }
  const SURFACES = [
    { name: "Drones landing", url: "departamento.html?dept=electronics&t=tech_drones", ready: ".rail a.card", sel: "a.card", needOver: 3 },
    { name: "store page (B&H Photo)", url: "tienda.html?tienda=bhphoto", ready: ".sl a.card", sel: "a.card", needOver: 1 },
    /* #611's storefronts: Tennis Warehouse sells rackets over the line; DSW
       tops out at US$ 199.99, so its cards must carry none. */
    { name: "store page (Tennis Warehouse)", url: "tienda.html?tienda=tenniswarehouse", ready: ".sl a.card", sel: "a.card", needOver: 1 },
    { name: "store page (DSW)", url: "tienda.html?tienda=dsw", ready: ".sl a.card", sel: "a.card", needOver: 0 },
    { name: "search results landing", url: "search.html?resultados=1&q=" + encodeURIComponent("dji mini"), ready: "a.card", sel: "a.card, a.cmp-row", needOver: 3 },
    { name: "brand page + Comparador (Bose QuietComfort Ultra)", url: "marca.html?marca=bose&q=" + encodeURIComponent("quietcomfort ultra"), ready: "#brandFocus .fc-row", sel: "a.card, a.fc-row", needOver: 3 },
    { name: "Ofertas", url: "ofertas.html", ready: "a.card", sel: "a.card", needOver: 1 },
    /* #443 c.6629785432: the Diseñador department -- every card over $200
       of goods (FOB) carries the line, in soles, under its soles price. */
    { name: "Diseñador department", url: "departamento.html?dept=luxury", ready: ".rail a.card", sel: "a.card", needOver: 20 },
  ];
  for (const S of SURFACES) {
    await check(`390px, ${S.name}: every card over $200 of goods shows «+ S/ … IMP» under its price, none under it does`, async () => {
      const { c, page, errors } = await phone();
      await page.goto(`${BASE}/${S.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(S.ready, { timeout: 90000 });
      await page.waitForTimeout(1500);
      await settled(page);
      const cards = await audit(page, S.sel);
      const n = judge(cards, S.name);
      assert.ok(n.over >= S.needOver, `${S.name}: only ${n.over} cards over the line (of ${cards.length}) -- the sample no longer exercises the rule`);
      /* The line sits under the price, inside the card. */
      const placed = await page.evaluate(() => [...document.querySelectorAll("[data-card-imp]")].slice(0, 20).every((imp) => {
        const card = imp.closest("a, .pcard"); if (!card) return false;
        const pr = card.querySelector(".price, .card-prices, .fc-price, .rel-pricebox, .pprice, .cmp-ln.prod dd");
        return !pr || pr.contains(imp) || (pr.compareDocumentPosition(imp) & Node.DOCUMENT_POSITION_FOLLOWING);
      }));
      assert.ok(placed, "an IMP line sits above its price");
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(wide <= 1, `the page scrolls sideways by ${wide}px`);
      assert.deepEqual(errors, []);
      console.log(`         ${S.name}: ${n.over} over, ${n.under} under`);
      if (SHOT) await page.screenshot({ path: join(SHOT, "imp-surface-" + S.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png") });
      await c.close();
    });
  }

  /* The two products from the directive, as their cards draw on the Drones landing. */
  await check("390px: the Walmart DJI Mini 4K Drone and DJI Mini 5 Pro Fly More Combo cards carry the line (the directive's examples)", async () => {
    const { c, page, errors } = await phone();
    await page.goto(`${BASE}/departamento.html?dept=electronics&t=tech_drones&tienda=walmart`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".rail a.card", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await settled(page);
    for (const [s, file] of [[SAMPLES.walmart, "imp-dji-mini-4k-walmart.png"], [SAMPLES.walmartBig, "imp-dji-mini-5-pro-walmart.png"]]) {
      const href = "producto.html?producto=" + encodeURIComponent(s.title) + "&tienda=walmart";
      let card = page.locator(`a.card[href="${href}"]`).first();
      if (!(await card.count())) {
        /* Not on the first screen of rails: draw it the way the page draws cards. */
        await page.evaluate((s) => {
          const host = document.createElement("div");
          host.id = "imp-proof"; host.className = "rail"; host.style.cssText = "display:flex;padding:12px 16px";
          host.innerHTML = window.AriaDept.cardHTML({ t: s.title, r: "walmart", p: s.raw, b: "DJI", i: "https://i5.walmartimages.com/x.jpg" });
          document.querySelector("main, body").prepend(host);
        }, s);
        await settled(page);
        card = page.locator(`#imp-proof a.card`).first();
      }
      await card.scrollIntoViewIfNeeded();
      const imp = await card.locator("[data-card-imp]").textContent();
      const kg = resolveCartWeights([{ title: s.title, retailer: "walmart", priceUsd: 1, weightKg: 0.2, weightEstimated: true, qty: 1 }]).items[0].weightKg;
      const want = r2(T.cardImpUsd({ raw: s.raw, retailer: "walmart" }, kg) * VENTA);
      assert.equal(solesIn(imp), want, `${s.title}: ${imp}`);
      if (SHOT) await card.screenshot({ path: join(SHOT, file) });
      await page.evaluate(() => { const x = document.getElementById("imp-proof"); if (x) x.remove(); });
    }
    assert.deepEqual(errors, []);
    await c.close();
  });
} finally {
  await browser.close();
  srv.close();
}

const MIN_CHECKS = 5 + Object.keys(SAMPLES).length + 6 + 1;
if (passed + failures.length < MIN_CHECKS) { console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`); process.exit(1); }
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
