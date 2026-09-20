/* ============================================================
   THE BROWSER HARNESS — does the page actually RUN?

   WHY THIS FILE EXISTS. run-tests.mjs proves the tables, the bands and
   the mirrors are right, and `node --check` proves index.html's script
   parses. Neither catches the failure that actually happened: a `const`
   referenced by an initializer declared further up the file parses
   perfectly and throws on load, taking every later declaration with it.
   The page was dead and every unit test was green.

   So every check here opens the real page in a real browser and FAILS ON
   ANY PAGE-LOAD EXCEPTION, before it asserts anything else.

   RUNNING IT
     python3 -m http.server 8899        # from the repo root
     npm i --no-save playwright         # not a dependency of the site
     node scripts/test/browser-tests.mjs

   Chromium is resolved from PLAYWRIGHT_CHROMIUM (an explicit binary) or
   from playwright's own download. Tailwind's CDN is blocked outright in
   every check: the page must boot without it.
   ============================================================ */
import { chromium } from "playwright";

const BASE = process.env.ARIA_BASE_URL || "http://127.0.0.1:8899";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}\n      ${e.message}`); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what ?? "value"}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

async function openPage(routes = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // Tailwind's CDN is blocked from this environment; the page must not
  // depend on it to boot.
  await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
  /* Playwright gives precedence to the LAST route registered, so the
     catch-all has to go on first and the specific handlers after it. */
  for (const [glob, handler] of Object.entries(routes).reverse()) await page.route(glob, handler);
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

await check("the page boots with no exceptions", async () => {
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error("page-load errors: " + errors.join(" | "));
  eq(await page.evaluate(() => typeof translateQuery), "function", "translateQuery is live");
  eq(await page.evaluate(() => typeof bookWeightKg), "function", "bookWeightKg is live");
  eq(await page.evaluate(() => typeof catalogSearchSubmit), "function", "catalogSearchSubmit is live");
  await ctx.close();
});

await check("no BETA pill anywhere on the storefront", async () => {
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error(errors.join(" | "));
  const hits = await page.evaluate(() => (document.body.innerText.match(/BETA/g) || []).length);
  eq(hits, 0, "rendered BETA labels");
  await ctx.close();
});

await check("a Spanish query reaches the retailer in English", async () => {
  const sent = [];
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/apify-scrape-start": async (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cached: true, items: [] }) });
    },
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => { document.getElementById("searchInput").value = "celular"; doSearch(); });
  await page.waitForTimeout(2500);
  if (!sent.length) throw new Error("no retailer request was made");
  for (const body of sent) eq(body.query, "cell phone", `query sent to ${body.retailer}`);
  // …and the shopper still sees their own word, plus what we asked for.
  eq(await page.evaluate(() => document.getElementById("prodName").textContent), "celular", "header shows the typed word");
  const note = await page.evaluate(() => document.getElementById("prodSpec").textContent);
  if (!/cell phone/.test(note)) throw new Error(`the translation is not surfaced: ${JSON.stringify(note)}`);
  await ctx.close();
});

await check("an English query is passed through untouched", async () => {
  const sent = [];
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/apify-scrape-start": async (route) => {
      sent.push(JSON.parse(route.request().postData() || "{}"));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ cached: true, items: [] }) });
    },
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => { document.getElementById("searchInput").value = "The North Face jacket"; doSearch(); });
  await page.waitForTimeout(2500);
  if (!sent.length) throw new Error("no retailer request was made");
  for (const body of sent) eq(body.query, "The North Face jacket", "query sent unchanged");
  eq(await page.evaluate(() => document.getElementById("prodSpec").textContent), "", "no translation note");
  await ctx.close();
});

await check("the badge fires on the numbers the card prints", async () => {
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => {
    const kg = estimateRetailWeightDetail("Hello Kitty and Friends Girls T-Shirt").kg;
    const freight = freightUsd(kg);
    const price = freight * (25.29 / 10.07);       // the reported 40%
    const card = productCardHTML({ title: "Hello Kitty and Friends Girls T-Shirt", price, weightKg: kg, retailer: "walmart" }, { open: "" });
    return {
      share: freightSharePct(kg, price),
      badge: /Flete alto/.test(card),
      heavyBadge: /Flete alto/.test(productCardHTML({ title: "Hello Kitty and Friends Girls T-Shirt", price: freight / 0.8, weightKg: kg, retailer: "walmart" }, { open: "" })),
      rate: /\$13\/kg/.test(card),
    };
  });
  if (Math.abs(r.share - 10.07 / 25.29) > 0.002) throw new Error(`share drifted: ${r.share}`);
  eq(r.badge, false, "no 'Flete alto' at 40%");
  eq(r.heavyBadge, true, "the badge still fires at 80%");
  eq(r.rate, true, "the card still shows the $13/kg rate");
  await ctx.close();
});

await check("a colouring book quotes a book's freight, not a kilo's", async () => {
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => {
    const title = "Hello Kitty and Friends Coloring Book, 64 Pages";
    const d = estimateRetailWeightDetail(title);
    return { kg: d.kg, source: d.source, outOfBand: weightSanity(title, 1.08).outOfBand };
  });
  eq(r.source, "category", "the book has a row");
  eq(r.outOfBand, true, "1.08 kg is refused");
  if (!(r.kg <= 0.3)) throw new Error(`a colouring book came out at ${r.kg} kg`);
  await ctx.close();
});

await check("an in-category search matches English titles from Spanish", async () => {
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error(errors.join(" | "));
  const hit = await page.evaluate(() => {
    const tokens = translateSearchQuery("chompa").toLowerCase().split(/\s+/).filter(Boolean);
    const title = "Old Navy Cozy Crew-Neck Sweater for Women".toLowerCase();
    return tokens.every((w) => title.includes(w));
  });
  eq(hit, true, "'chompa' finds a sweater in the cached feed");
  await ctx.close();
});

await check("every view still renders, with nothing thrown on the way", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error("on load: " + errors.join(" | "));
  const views = await page.evaluate(() => Array.from(document.querySelectorAll(".view")).map((v) => v.id));
  if (views.length < 6) throw new Error(`only ${views.length} views found`);
  for (const id of views) {
    await page.evaluate((v) => showPage(v), id);
    await page.waitForTimeout(120);
    if (errors.length) throw new Error(`${id}: ${errors.join(" | ")}`);
  }
  // The two pages rebuilt in this batch must still have their store grids.
  await page.evaluate(() => showPage("storesView"));
  await page.waitForTimeout(250);
  const stores = await page.evaluate(() => document.querySelectorAll("#storesGrid > *").length);
  if (stores < 8) throw new Error(`Tiendas shows ${stores} stores, expected 8`);
  await ctx.close();
});

await browser.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);
