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

await check("Categorías renders big cards, two across, nothing cropped", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => openCategories());
  await page.waitForTimeout(700);

  /* Tailwind's CDN is blocked from this environment, so the page here is
     unstyled and a computed grid-template-columns would be meaningless.
     What IS meaningful in a real browser: the grid rendered real tiles,
     each tile is a card built from the shared chassis, and the photo
     field is the 4:5 contain-fit one rather than a fixed-height square.
     The class names themselves are asserted in the node suite. */
  const r = await page.evaluate(() => {
    const grid = document.getElementById("categoriesGrid");
    const card = grid.firstElementChild;
    const frame = card?.querySelector('[style*="aspect-ratio"]');
    return {
      count: grid.children.length,
      gridClass: grid.className,
      cardClass: card ? card.className : "",
      frameStyle: frame ? frame.getAttribute("style") : null,
      squares: grid.querySelectorAll('[class*="h-[124px]"], [class*="h-[146px]"]').length,
    };
  });
  if (!r.count) throw new Error("Categorías rendered no tiles");
  if (!/grid-cols-1 md:grid-cols-2/.test(r.gridClass)) throw new Error(`grid is ${r.gridClass}`);
  if (/grid-cols-[34]/.test(r.gridClass)) throw new Error("the four-across square grid is back");
  if (!/rounded-2xl/.test(r.cardClass)) throw new Error(`a tile is not a card: ${r.cardClass}`);
  if (!/aspect-ratio:4\/5/.test(r.frameStyle || "")) throw new Error(`photo field is ${r.frameStyle}`);
  eq(r.squares, 0, "fixed-height square tiles left in the grid");
  await ctx.close();
});

await check("the category card and the Ofertas card are the same object", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  const same = await page.evaluate(() => {
    const tile = deptTileHTML({ key: "women", label: "Moda Mujer", count: 82, thumb: "x.jpg", icon: "\u{1F455}" }, "department");
    const card = productCardHTML({ title: "T", price: 20, weightKg: 0.2, retailer: "walmart", image: "x.jpg" }, { open: "" });
    const shell = (h) => (h.match(/class="([^"]*rounded-2xl[^"]*)"/) || [])[1] || "";
    const frame = (h) => (h.match(/style="aspect-ratio:[^"]*"/) || [])[0] || "";
    return {
      tileShell: shell(tile), cardShell: shell(card),
      tileFrame: frame(tile), cardFrame: frame(card),
      tileHasSquare: /h-\[124px\]|h-\[146px\]/.test(tile),
    };
  });
  if (!same.tileShell.includes("rounded-2xl")) throw new Error("the tile lost the card shell");
  // The tile adds what a <button> needs (text-left, focus-ring, w-full);
  // everything the Ofertas card's shell says, it says first and verbatim.
  if (!same.tileShell.startsWith(same.cardShell)) {
    throw new Error(`the tile shell diverged:\n  tile: ${same.tileShell}\n  card: ${same.cardShell}`);
  }
  eq(same.tileFrame, same.cardFrame, "photo field");
  eq(same.tileHasSquare, false, "the old fixed-height square is gone");
  await ctx.close();
});

await check("Contactar soporte opens mail, not the chatbot", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => showPage("returnsView"));
  await page.waitForTimeout(300);

  const r = await page.evaluate(() => {
    const el = [...document.querySelectorAll("#returnsView a, #returnsView button")]
      .find((n) => /contactar soporte/i.test(n.textContent || ""));
    if (!el) return { found: false };
    const panelHidden = () => document.getElementById("assistantPanel")?.classList.contains("hidden");
    const before = panelHidden();
    el.click();
    return {
      found: true, tag: el.tagName, href: el.getAttribute("href"),
      onclick: el.getAttribute("onclick"),
      chatOpenedBefore: before === false,
      chatOpenedAfter: panelHidden() === false,
    };
  });
  if (!r.found) throw new Error("the Contactar soporte CTA is gone");
  eq(r.tag, "A", "it is a link");
  eq(r.onclick, null, "it carries no JS handler");
  if (!/^mailto:/.test(r.href || "")) throw new Error(`href is ${r.href}`);
  if (!/subject=/.test(r.href)) throw new Error("no pre-filled subject");
  if (!r.chatOpenedBefore && r.chatOpenedAfter) throw new Error("clicking it still opens the chatbot");
  // The constant drives the href at load, so this is the live value.
  if (!r.href.includes("daniel.leon@ariashop.pe")) throw new Error(`wrong address: ${r.href}`);
  await ctx.close();
});

await check("the admin Envíos panel is present and courier-agnostic", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => ({
    hasPanel: Boolean(document.getElementById("shippingProviders")),
    hasQueue: Boolean(document.getElementById("shipmentsList")),
    hasRollup: Boolean(document.getElementById("shippingRollup")),
    hasBlocked: Boolean(document.getElementById("shippingBlocked")),
    // The page ships no courier list of its own — it renders whatever the
    // registry returns, which is what makes courier #2 a server change.
    namesACourier: /AVI|DHL|FedEx|Serpost/.test(document.getElementById("shippingProviders").outerHTML),
    statuses: SHIPPING_STATUSES.join(","),
  }));
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith("has") && !v) throw new Error(`${k} is missing from the admin panel`);
  }
  eq(r.namesACourier, false, "a courier name is hardcoded in the page");
  eq(r.statuses, "created,in_transit,in_customs,out_for_delivery,delivered,exception,cancelled");
  await ctx.close();
});

await check("no courier name is rendered anywhere a shopper browses", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  const views = await page.evaluate(() => Array.from(document.querySelectorAll(".view")).map((v) => v.id));
  for (const id of views) {
    if (id === "adminView") continue;   // ops, behind a login, and allowed
    await page.evaluate((v) => showPage(v), id);
    await page.waitForTimeout(80);
    const hit = await page.evaluate((v) => {
      const text = document.getElementById(v)?.innerText || "";
      return /AVI\b|AVI Courier/i.test(text) ? text.slice(0, 160) : null;
    }, id);
    if (hit) throw new Error(`${id} names a courier: ${hit}`);
  }
  await ctx.close();
});

await browser.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);
