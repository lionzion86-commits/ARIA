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

await check("a card discloses its freight and never labels it", async () => {
  /* The reported t-shirt: S/ 25.29 with S/ 10.07 of freight. It wore a
     "Flete alto" badge because the rule thresholded freight as a share
     of PRICE, so it fired on a cheap item rather than a heavy one. The
     badge is gone; the itemised line that made it redundant is not.

     The 80% case is the one that matters for the regression: an item
     genuinely deep in the old badge band must ALSO come back clean, or
     the badge has only been re-tuned rather than removed. */
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => {
    const title = "Hello Kitty and Friends Girls T-Shirt";
    const kg = estimateRetailWeightDetail(title).kg;
    const freight = freightUsd(kg);
    const card = (price) => productCardHTML({ title, price, weightKg: kg, retailer: "walmart" }, { open: "" });
    const reported = card(freight * (25.29 / 10.07));   // the reported 40%
    return {
      kg,
      share: freightSharePct(kg, freight * (25.29 / 10.07)),
      badgeAt40: /Flete alto/.test(reported),
      badgeAt80: /Flete alto/.test(card(freight / 0.8)),
      badgeAt300: /Flete alto/.test(card(freight / 3)),
      rate: /\$13\/kg/.test(reported),
      freightLine: /de flete/.test(reported),
      weightShown: reported.includes(`${kg} kg`),
      // The discount badge is a fact about the US price and still shows,
      // even on an item the old rule would have overwritten it on.
      discount: /-\d+%/.test(productCardHTML(
        { title, price: freight / 0.8, originalPrice: freight / 0.4, weightKg: kg, retailer: "walmart" }, { open: "" })),
    };
  });
  if (Math.abs(r.share - 10.07 / 25.29) > 0.002) throw new Error(`share drifted: ${r.share}`);
  eq(r.badgeAt40, false, "the reported 40% card still carries a label");
  eq(r.badgeAt80, false, "80% still carries a label — the badge was re-tuned, not removed");
  eq(r.badgeAt300, false, "freight at 3x the price still carries a label");
  eq(r.rate, true, "the card stopped showing the $13/kg rate");
  eq(r.freightLine, true, "the card stopped itemising freight");
  eq(r.weightShown, true, "the card stopped printing the weight");
  eq(r.discount, true, "a heavy item lost its discount badge");
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

await check("Categorías renders one full-width shopfront per row, nothing cropped", async () => {
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
    const window_ = card?.querySelector('[class*="h-["]');
    const photo = card?.querySelector("img, [class*='place-items-center']");
    return {
      count: grid.children.length,
      gridClass: grid.className,
      cardClass: card ? card.className : "",
      windowClass: window_ ? window_.className : null,
      cropped: card ? /object-fit:\s*cover/.test(card.innerHTML) : false,
      // The sign: the category name on the brand navy, not navy-on-white.
      signed: card ? /0A1F44/.test(card.innerHTML) : false,
      squares: grid.querySelectorAll('[class*="h-[124px]"], [class*="h-[146px]"]').length,
    };
  });
  if (!r.count) throw new Error("Categorías rendered no tiles");
  if (!/grid-cols-1/.test(r.gridClass)) throw new Error(`grid has no single-column base: ${r.gridClass}`);
  if (/(?:sm|md|lg|xl):grid-cols-\d/.test(r.gridClass)) {
    throw new Error(`Categorías splits into columns again: ${r.gridClass}`);
  }
  if (!/rounded-2xl/.test(r.cardClass)) throw new Error(`a tile is not a card: ${r.cardClass}`);
  if (!/h-\[\d+px\]/.test(r.windowClass || "")) throw new Error(`the window is not pinned: ${r.windowClass}`);
  eq(r.cropped, false, "a category photo is being cropped");
  eq(r.signed, true, "the category name is not on a navy sign");
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
    return {
      tileShell: shell(tile), cardShell: shell(card),
      // 2026-09-21: the two no longer share a photo FIELD. A category is
      // a shopfront on a pinned-height window; a product is a product on
      // the 4:5 field. They still share the shell and the contain-fit.
      tileWindow: /h-\[\d+px\]/.test(tile),
      cardField: /aspect-ratio:4\/5/.test(card),
      tileCrops: /object-fit:\s*cover/.test(tile),
      cardCrops: /object-fit:\s*cover/.test(card),
      tileHasSquare: /h-\[124px\]|h-\[146px\]/.test(tile),
      tileHasSign: /Moda Mujer/.test(tile) && /0A1F44/.test(tile),
    };
  });
  if (!same.tileShell.includes("rounded-2xl")) throw new Error("the tile lost the card shell");
  // The tile adds what a <button> needs (text-left, focus-ring, w-full);
  // everything the Ofertas card's shell says, it says first and verbatim.
  if (!same.tileShell.startsWith(same.cardShell)) {
    throw new Error(`the tile shell diverged:\n  tile: ${same.tileShell}\n  card: ${same.cardShell}`);
  }
  eq(same.tileWindow, true, "the category window is not pinned to a height");
  eq(same.cardField, true, "the product card lost its 4:5 field");
  eq(same.tileCrops, false, "the category window crops its photo");
  eq(same.cardCrops, false, "the product card crops its photo");
  eq(same.tileHasSquare, false, "the old fixed-height square is gone");
  eq(same.tileHasSign, true, "the category name is not on a navy sign");
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

await check("Aria Auto confirms what it can and shows the rest with a part number", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));

  const r = await page.evaluate(() => {
    const vehicle = { year: "2020", make: "Hyundai", model: "Sonata" };
    /* selectedVehicle is a top-level `let`, not a window property, so
       drive the page's own selectors — the real path a shopper takes. */
    const setSel = (id, value) => {
      const el = document.getElementById(id);
      el.innerHTML = `<option value="${value}">${value}</option>`;
      el.value = value;
      el.disabled = false;
    };
    setSel("autoYearSelect", vehicle.year);
    setSel("autoMakeSelect", vehicle.make);
    setSel("autoModelSelect", vehicle.model);
    maybeRevealPartSearch();

    // Exactly the payload shape the cache holds today: no compatibility
    // list anywhere, but a real part number.
    const noFitment = [{ title: "Duralast Ceramic Brake Pads D2076", price: 43.99,
      raw: { vehicle_fitment: "VEHICLE_SPECIFIC", part_number: "D2076", line_code: "EPA",
             specs: { "Pad Type": "Ceramic" } } }];
    // …and the shape the detail scrape returns.
    const withFitment = [
      { title: "Duralast Ceramic Brake Pads D2076", price: 43.99,
        raw: { specs: { Fits: "Hyundai Sonata, Hyundai Tucson, Kia K5 2020-2024" },
               part_number: "D2076", location: "Front" } },
      { title: "Wrong Pads For Another Car", price: 21.5,
        raw: { specs: { Fits: "Honda Civic 2016-2021" }, part_number: "X9" } },
    ];

    const unconfirmed = renderAutoPartBlock("AutoZone", { ok: true, items: noFitment }, "pastillas de freno", "autozone");
    const confirmed = renderAutoPartBlock("AutoZone", { ok: true, items: withFitment }, "pastillas de freno", "autozone");
    const empty = renderAutoPartBlock("AutoZone", { ok: true, items: [] }, "pastillas de freno", "autozone");

    return {
      // Branch 2: shown, not hidden.
      unconfirmedShowsProduct: /Duralast/.test(unconfirmed),
      unconfirmedShowsPartNumber: /D2076/.test(unconfirmed) && /N\.° de parte/.test(unconfirmed),
      unconfirmedHasGreenBadge: /Compatible con tu/.test(unconfirmed),
      unconfirmedIsHonest: /no podemos confirmarlo nosotros/.test(unconfirmed),
      unconfirmedIsEmptyState: /No tenemos datos de calce/.test(unconfirmed),
      // Branch 1: confirmed only.
      confirmedHasBadge: /Compatible con tu/.test(confirmed),
      confirmedShowsWrongCar: /Wrong Pads/.test(confirmed),
      confirmedShowsPartNumber: /D2076/.test(confirmed),
      // Branch 3: nothing at all.
      emptyIsEmptyState: /No tenemos datos de calce/.test(empty),
      emptyClaimsUsMarket: /Ese modelo no se vendió en Estados Unidos/.test(empty),
      // The banned badge, nowhere.
      anyBannedBadge: /Verifica el calce|verifícalo antes de pedir/.test(unconfirmed + confirmed + empty),
    };
  });

  // Branch 2 — the correction: these are the Sonata-fitting pads Danny
  // verified, and hiding them killed the section.
  eq(r.unconfirmedShowsProduct, true, "unconfirmed parts must still be shown");
  eq(r.unconfirmedShowsPartNumber, true, "the part number is the buyer's own check");
  eq(r.unconfirmedHasGreenBadge, false, "an unconfirmed part must not claim confirmation");
  eq(r.unconfirmedIsHonest, true, "it must say we could not confirm it");
  eq(r.unconfirmedIsEmptyState, false, "no-fitment-data is not the empty state");
  // Branch 1
  eq(r.confirmedHasBadge, true, "a confirmed part gets the green badge");
  eq(r.confirmedShowsWrongCar, false, "a part listing another car is excluded");
  eq(r.confirmedShowsPartNumber, true, "confirmed parts show their number too");
  // Branch 3
  eq(r.emptyIsEmptyState, true, "nothing back means the honest empty state");
  eq(r.emptyClaimsUsMarket, false, "the empty state must not assert a cause");
  eq(r.anyBannedBadge, false, "the banned disclaimer appears nowhere");
  await ctx.close();
});

await check("Aria Auto lists its sources without touching the Tiendas grid", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => ({
    sources: AUTO_PARTS_SOURCES.map((s) => `${s.id}:${s.pending ? "pending" : "live"}`),
    pendingBlock: autoPendingBlockHTML({ id: "rockauto", label: "RockAuto", pendingNote: "Conectando el catálogo" },
      { year: "2020", make: "Hyundai", model: "Sonata" }, "pastillas de freno"),
    tiendas: Object.values(RETAILERS).filter((r) => !r.retired).length,
  }));
  eq(r.sources.join(","), "autozone:live,rockauto:pending", "the source list comes from the registry");
  if (!/RockAuto/.test(r.pendingBlock)) throw new Error("the pending source has no block of its own");
  if (!/Conectando el catálogo/.test(r.pendingBlock)) throw new Error("the pending block is not honest about why");
  eq(r.tiendas, 8, "the Tiendas grid is still eight");
  await ctx.close();
});

await check("the reported vitamin bottles price sanely on a real card", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => {
    const out = {};
    for (const [key, title, priceUsd] of [
      ["d3", "Nature Made Vitamin D3 2000 IU, 180 Softgels", 12],
      ["gummies", "Nature's Way Sambucus Elderberry Gummies, 60 Count", 13],
      ["serum", "Soapbox Vitamin Booster Hair Serum, 5 fl oz", 13],
    ]) {
      const kg = estimateRetailWeightDetail(title).kg;
      const card = productCardHTML({ title, price: priceUsd, weightKg: kg, retailer: "walmart" }, { open: "" });
      out[key] = { kg, badge: /Flete alto/.test(card), shown: /0\.68 kg|1\.08 kg/.test(card) };  // badge: must stay false — it is gone site-wide
    }
    return out;
  });
  for (const [key, v] of Object.entries(r)) {
    if (v.kg >= 0.4) throw new Error(`${key} still estimates ${v.kg} kg`);
    eq(v.badge, false, `${key} wears a Flete alto badge — it was removed site-wide`);
    eq(v.shown, false, `${key} still prints a banned constant`);
  }
  await ctx.close();
});

await check("the small-order fee follows the order, not the products", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  const r = await page.evaluate(() => ({
    reported: smallOrderFeePen(44.69 + 10.07),   // the live cart: S/ 54.76
    productsOnly: smallOrderFeePen(44.69),
    small: smallOrderFeePen(35),
    atLine: smallOrderFeePen(50),
    note: SMALL_ORDER_FEE_NOTE,
  }));
  eq(r.reported, 0, "the reported S/ 54.76 cart must pay no fee");
  eq(r.productsOnly, 10, "products alone would still have charged it");
  eq(r.small, 10, "a genuinely small order still pays");
  eq(r.atLine, 0, "exactly S/ 50 is not small");
  if (!/productos \+ flete/i.test(r.note)) throw new Error(`the note hides its basis: ${r.note}`);
  await ctx.close();
});

await check("the three beauty stores render their real logo, unfiltered", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => showPage("storesView"));
  await page.waitForTimeout(400);

  const r = await page.evaluate(async () => {
    // Wait for decode: a tag with the right src but a broken file would
    // pass every other assertion here and show nothing to a shopper.
    const all = [...document.querySelectorAll("#storesGrid img")];
    await Promise.all(all.map((i) => (i.complete ? null : new Promise((res) => { i.onload = res; i.onerror = res; }))));
    const out = {};
    for (const key of ["sephora", "victoriassecret", "bathandbodyworks"]) {
      const card = [...document.querySelectorAll("#storesGrid > *")]
        .find((el) => (el.outerHTML || "").includes(`logos/${key}.`));
      if (!card) { out[key] = { found: false }; continue; }
      const img = card.querySelector("img");
      const plate = img ? img.closest("div") : null;
      out[key] = {
        found: true,
        isImage: Boolean(img),
        src: img ? img.getAttribute("src") : null,
        // A brand's mark is never ours to recolour — the pending
        // treatment used to grey the whole tile, logo included.
        plateFilter: plate ? getComputedStyle(plate).filter : null,
        imgFilter: img ? getComputedStyle(img).filter : null,
        objectFit: img ? getComputedStyle(img).objectFit : null,
        naturalWidth: img ? img.naturalWidth : 0,
        // Still honest about the catalogue not being connected.
        stillPending: /Conectando el catálogo/.test(card.textContent || ""),
        // …and no text-pill fallback left behind.
        hasWordmarkPill: Boolean(card.querySelector(".store-logo-fallback")),
      };
    }
    return out;
  });

  for (const [key, v] of Object.entries(r)) {
    if (!v.found) throw new Error(`${key} has no card on Tiendas`);
    eq(v.isImage, true, `${key} is still a text pill, not an image`);
    if (!v.src.endsWith(`logos/${key}.png`)) throw new Error(`${key} src is ${v.src}`);
    for (const [what, f] of [["plate", v.plateFilter], ["img", v.imgFilter]]) {
      if (f && f !== "none") throw new Error(`${key} ${what} carries a CSS filter (${f}) — a brand's mark is not ours to recolour`);
    }
    if (v.objectFit && v.objectFit !== "contain") throw new Error(`${key} is ${v.objectFit}, not contain`);
    if (!(v.naturalWidth > 0)) throw new Error(`${key} has the right src but the image did not decode`);
    eq(v.stillPending, true, `${key} stopped saying its catalogue is being connected`);
    eq(v.hasWordmarkPill, false, `${key} still renders the wordmark fallback`);
  }
  // And the grid is still the symmetric eight.
  const count = await page.evaluate(() => document.querySelectorAll("#storesGrid > *").length);
  eq(count, 8, "Tiendas store count");
  await ctx.close();
});

await check("no store logo is dwarfed by the wordmarks beside it", async () => {
  /* THE BUG: reported live on the Tiendas grid — "Sephora is a tiny
     sliver, Victoria's Secret and Bath & Body Works are small thumbnails,
     while Walmart/Target/Old Navy fill their cards". The files were fine.
     The zone was 130x34, which is a wordmark's shape, so Walmart drew
     130px across and anything square drew 34x34. Sephora's artwork is
     portrait, so it drew 24px wide.

     Checking the CSS string is not enough — the numbers only mean
     something once each file's own proportions are applied to them. So
     this measures what actually gets drawn. */
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => showPage("storesView"));
  await page.waitForTimeout(400);

  const marks = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("#storesGrid img")];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((res) => { i.onload = res; i.onerror = res; }))));

    /* Tailwind's CDN is blocked in this harness, so the card and its
       plate come out unstyled and shrink-to-fit around their contents —
       which would cap the zone at each file's own intrinsic width and
       measure the harness rather than the page. Widen them to what the
       real grid gives a card, so every mark gets the whole zone. */
    for (const img of imgs) {
      for (let el = img.parentElement, n = 0; el && n < 2; el = el.parentElement, n++) {
        el.style.display = "block";
        el.style.width = "240px";
      }
    }

    return imgs.map((img) => {
      const box = img.getBoundingClientRect();
      const nw = img.naturalWidth, nh = img.naturalHeight;
      // What object-fit:contain actually paints inside that box.
      const scale = Math.min(box.width / nw, box.height / nh);
      return {
        key: img.getAttribute("data-retailer"),
        drawnW: nw * scale,
        drawnH: nh * scale,
        zoneW: box.width,
        zoneH: box.height,
      };
    });
  });

  eq(marks.length, 8, "store marks measured");

  /* Every mark reaches an edge of the zone. A mark that touches neither
     is one max-* rule short of filling anything — which is what happens
     the moment someone drops the width:100% that makes the caps a zone. */
  for (const m of marks) {
    const fillsWidth = Math.abs(m.drawnW - m.zoneW) < 1.5;
    const fillsHeight = Math.abs(m.drawnH - m.zoneH) < 1.5;
    if (!fillsWidth && !fillsHeight) {
      throw new Error(
        `${m.key} draws ${m.drawnW.toFixed(1)}x${m.drawnH.toFixed(1)} inside a ` +
        `${m.zoneW.toFixed(0)}x${m.zoneH.toFixed(0)} zone — it fills neither dimension`,
      );
    }
  }

  const by = Object.fromEntries(marks.map((m) => [m.key, m]));
  const area = (m) => m.drawnW * m.drawnH;
  const walmart = by.walmart;
  if (!walmart) throw new Error("Walmart has no mark to compare against");

  /* Walmart is the reference because it is the one Danny named as
     rendering correctly, and it is the widest real wordmark (5.26:1), so
     it is the hardest case for a square mark to match. Anything under
     60% of its area reads as "a thumbnail next to a logo". Before the
     fix Sephora sat at 25%. */
  for (const key of ["sephora", "victoriassecret", "bathandbodyworks", "target"]) {
    const m = by[key];
    if (!m) throw new Error(`${key} has no mark on the grid`);
    const ratio = area(m) / area(walmart);
    if (ratio < 0.6) {
      throw new Error(
        `${key} draws ${m.drawnW.toFixed(0)}x${m.drawnH.toFixed(0)} — ${(ratio * 100).toFixed(0)}% of ` +
        `Walmart's area (${walmart.drawnW.toFixed(0)}x${walmart.drawnH.toFixed(0)}). It reads as a thumbnail.`,
      );
    }
  }

  await ctx.close();
});

await check("the orb never reads a covered product image as empty space", async () => {
  /* REPORTED LIVE: "the chat orb launcher is overlapping the product
     image". The rule is that the orb does not drift over content, and
     the machinery for it existed — it just could not see the image.

     orbCoversContent() used elementFromPoint, which returns only the
     TOPMOST element at a point. The product image carries a "Toca para
     ampliar" pill in its own bottom-right corner, which is exactly where
     a docked orb parks, and a <span> is on no content list — nor is any
     of its plain-<div> ancestry, so closest() walked all the way up and
     reported clear while the orb sat on the photo.

     This parks an orb-sized box on that corner and asserts the probe
     sees it. Anything painted on top of content can mask it the same
     way, so the fix reads the whole stack rather than the top of it. */
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() =>
    showProduct("walmart", "Wrangler Men's Relaxed Fit Jeans with Flex", 39.9, 0.6, "", [], false, "", 4.4, []));
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const wrap = document.getElementById("productViewImgWrap");
    /* Tailwind's CDN is blocked here, so the image wrap comes out far
       taller than it renders in production and its corner can sit below
       the fold. The probe correctly ignores off-screen points, so aim at
       a part of the image that is genuinely visible. */
    wrap.scrollIntoView({ block: "center" });
    const w = wrap.getBoundingClientRect();
    const cx = Math.round(Math.min(Math.max(w.left + w.width / 2, 40), window.innerWidth - 40));
    const cy = Math.round(Math.min(Math.max(w.top + w.height / 2, 40), window.innerHeight - 40));
    const box = { x: cx - 32, y: cy - 32, size: 64 };
    if (document.elementsFromPoint(cx, cy).length === 0) throw new Error("probe point is off screen");
    // What the OLD topmost-only probe saw at the same point, for contrast.
    const btn = document.getElementById("assistantBtn");
    const prev = btn.style.pointerEvents;
    btn.style.pointerEvents = "none";
    const top = document.elementFromPoint(box.x + 32, box.y + 32);
    const oldWouldSee = Boolean(top && top.closest(
      "p,h1,h2,h3,h4,h5,h6,blockquote,li,figcaption,label,button,a,input,select,textarea,article,img"));
    btn.style.pointerEvents = prev;
    return {
      onImage: orbCoversContent(box.x, box.y, box.size),
      oldWouldSee,
      // Well clear of every view: far off to the side, nothing under it.
      offPage: orbCoversContent(-500, -500, 64),
    };
  });
  eq(r.onImage, true, "the orb still reads the product image as empty space");
  eq(r.oldWouldSee, false, "the masking case no longer reproduces — this test has stopped testing anything");
  eq(r.offPage, false, "the orb now thinks empty space is content and will never settle");
  await ctx.close();
});

await browser.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);
