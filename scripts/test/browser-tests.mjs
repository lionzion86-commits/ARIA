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
import { deflateSync as zlibDeflate } from "node:zlib";
import { createServer } from "node:http";

const BASE = process.env.ARIA_BASE_URL || "http://127.0.0.1:8899";
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}\n      ${e.message}`); }
}
function eq(a, b, what) { if (a !== b) throw new Error(`${what ?? "value"}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }

const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

async function openPage(routes = {}, contextOptions = {}) {
  /* contextOptions exists for ONE reason: the mobile shopfront only
     renders below lg, so its checks need a phone-sized context. Every
     other check keeps the default desktop one. */
  const ctx = await browser.newContext(contextOptions);
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
  /* THE TRIGGER MOVED, THE RULE DID NOT. doSearch() no longer scrapes --
     the catalogue answers first and the live scan is a button now -- so
     this drives the live scan explicitly. What is being pinned is
     unchanged and still the important part: whatever reaches a retailer
     reaches it in English. A test that simply stopped asserting this
     because the trigger moved would have retired the rule. */
  await page.evaluate(() => { document.getElementById("searchInput").value = "celular"; doSearch(); });
  await page.waitForFunction(() => typeof catalogMatch !== "undefined" && catalogMatch !== null, null, { timeout: 15000 });
  eq(sent.length, 0, "the catalogue pass sent a query to a retailer — searching is billable again");
  /* DISPATCHED, NOT AIMED. This harness blocks the CDN, so there is no
     grid and no stacking -- product cards sit on top of the button and
     a real mouse click lands on a card. Where the control sits on a
     styled page is a layout question, pinned in run-tests.mjs; what
     this check is about is what the control DOES. */
  await page.evaluate(() => document.querySelector("[data-live-search]").click());
  await page.waitForFunction(() => liveSearchState !== "running", null, { timeout: 60000 });
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
  // Same as above: the catalogue answers first, the live scan is asked for.
  await page.evaluate(() => { document.getElementById("searchInput").value = "The North Face jacket"; doSearch(); });
  await page.waitForFunction(() => typeof catalogMatch !== "undefined" && catalogMatch !== null, null, { timeout: 15000 });
  /* DISPATCHED, NOT AIMED. This harness blocks the CDN, so there is no
     grid and no stacking -- product cards sit on top of the button and
     a real mouse click lands on a card. Where the control sits on a
     styled page is a layout question, pinned in run-tests.mjs; what
     this check is about is what the control DOES. */
  await page.evaluate(() => document.querySelector("[data-live-search]").click());
  await page.waitForFunction(() => liveSearchState !== "running", null, { timeout: 60000 });
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
  const stores = await page.evaluate(() => document.querySelectorAll("#storesGrid section > div.grid > *, #storesGrid > *:not(section)").length);
  if (stores < 8) throw new Error(`Tiendas shows ${stores} stores, expected 8`);
  await ctx.close();
});

await check("Categorías renders one full-width shopfront per row, departments only", async () => {
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
      letterboxed: card ? /object-fit:\s*contain/.test(card.innerHTML) : false,
      first: (card?.textContent || "").trim().split("\n")[0].trim(),
      // The sign: the category name on the brand navy, not navy-on-white.
      signed: card ? /0A1F44/.test(card.innerHTML) : false,
      squares: grid.querySelectorAll('[class*="h-[124px]"], [class*="h-[146px]"]').length,
      names: [...grid.children].map((c) => (c.textContent || "").trim().split("\n")[0].trim()),
      counter: document.getElementById("categoriesCount").textContent,
    };
  });
  if (!r.count) throw new Error("Categorías rendered no tiles");
  if (!/grid-cols-1/.test(r.gridClass)) throw new Error(`grid has no single-column base: ${r.gridClass}`);
  if (/(?:sm|md|lg|xl):grid-cols-\d/.test(r.gridClass)) {
    throw new Error(`Categorías splits into columns again: ${r.gridClass}`);
  }
  if (!/rounded-2xl/.test(r.cardClass)) throw new Error(`a tile is not a card: ${r.cardClass}`);
  if (!/h-\[\d+px\]/.test(r.windowClass || "")) throw new Error(`the window is not pinned: ${r.windowClass}`);
  /* THIS ASSERTION READ `false` UNTIL TODAY, AND IT WAS NEVER MEASURING
     A CATEGORY PHOTO (2026-09-22). It samples the FIRST tile, and this
     grid is sorted by name, so the first tile used to be SSENSE's
     "032c" — a brand tile, which draws an SVG field and therefore never
     crops. The brand tiles are gone from this grid, so the sample is
     now a real department with a real curated cover, and the rule that
     applies is the one already asserted on the shared card above: a
     cover was COMPOSED for this window and fills it edge to edge; only
     a product photo, shot on white by a retailer who has never seen our
     card, is shown whole. */
  if (!r.first) throw new Error("the first Categorías tile has no name");
  eq(r.cropped, true, `the cover on "${r.first}" no longer fills its window`);
  eq(r.letterboxed, false, `the cover on "${r.first}" is letterboxed instead of filling`);
  eq(r.signed, true, "the category name is not on a navy sign");
  eq(r.squares, 0, "fixed-height square tiles left in the grid");

  /* DEPARTMENTS ONLY, SAME RULE AS THE HOME PAGE (2026-09-22). Pulling
     the 192 brand cards off the home page only moved the wall here:
     this grid carried 11 departments and 193 brands, 204 tiles, on the
     one page whose whole job is to show what we sell. Brands live in
     "Busca por marca" inside each multi-brand store now. */
  /* TEN, not eleven, since 2026-09-24: Salud y Farmacia is gone. It was
     100% vitamins and supplements, which need a DIGEMID import permit we
     do not hold. The number stays asserted exactly rather than loosened
     to "< 50" for the original reason -- a regression that puts the 192
     brands back would sail past a bound -- and now for a second one: if
     this ever reads 11 again, the restricted department is back. */
  /* Eleven again as of 2026-09-24: it went to ten when Salud y Farmacia
     came off the site, and Curvy took that slot. The exact number stays
     asserted -- a regression that puts the 192 brands back would sail
     past a bound, and one that resurrects the pharmacy would read 12. */
  eq(r.count, 11, "Categorías tiles");
  eq(r.counter, "11 categorías", "the counter above the grid");
  eq(r.names.includes("Curvy"), true, `Curvy is not on Categorías: ${r.names.join()}`);
  if (r.names.some((n) => /farmacia|salud/i.test(n))) {
    throw new Error(`the restricted department is back on Categorías: ${r.names.join()}`);
  }
  for (const brand of ["032c", "424", "Rick Owens", "Dries Van Noten", "Acne Studios", "Nike"]) {
    if (r.names.includes(brand)) throw new Error(`the brand wall is back on Categorías: ${brand}`);
  }
  await ctx.close();
});

await check("the category banner and the product card share their photo discipline, not their chrome", async () => {
  /* THIS RULE CHANGED ON PURPOSE (2026-09-23), and the check changed
     with it rather than being deleted.

     It was written for "Categorías tiles use the Ofertas card", when
     the point was that the two were ONE object: same shell, same
     rounding, same contain-fit. The Farfetch brief splits them, and
     names the split: a category is full-bleed lifestyle imagery with
     text over it, a product is a bare photograph with quiet text under
     it and NO chrome at all. So the shells are now deliberately
     different and asserting they are identical would be asserting the
     old brief over the new one.

     What still has to hold -- and what this now checks -- is everything
     that was never about chrome: the pinned window against the 4:5
     field, the cover filling its window against the product photo being
     shown whole, and the navy sign band that carries the brand at page
     level. Plus the new rule: the product card has no shell to share. */
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
      cardShellClass: CARD_SHELL_CLASS,
      // 2026-09-21: the two no longer share a photo FIELD. A category is
      // a shopfront on a pinned-height window; a product is a product on
      // the 4:5 field. They still share the shell and the contain-fit.
      tileWindow: /h-\[\d+px\]/.test(tile),
      cardField: /aspect-ratio:4\/5/.test(card),
      tileCrops: /object-fit:\s*cover/.test(tile),
      cardCrops: /object-fit:\s*cover/.test(card),
      tileContains: /object-fit:\s*contain/.test(tile),
      tileHasSquare: /h-\[124px\]|h-\[146px\]/.test(tile),
      tileHasSign: /Moda Mujer/.test(tile) && /0A1F44/.test(tile),
    };
  });
  /* THE BANNER KEEPS ITS BOX. Its photograph and its navy sign band are
     held together as one object by a rounded, clipping shell. */
  if (!same.tileShell.includes("rounded-2xl")) throw new Error("the category banner lost its rounded shell");
  if (!same.tileShell.includes("overflow-hidden")) throw new Error("the category banner stopped clipping its photograph");
  if (!same.tileShell.includes("bg-white")) throw new Error("the category banner lost its plate");
  /* AND THE PRODUCT CARD HAS NO BOX AT ALL -- no border, no shadow, no
     plate. The only rounded thing left in it is the photo field itself,
     which is why `cardShell` reads as the frame and not as a shell. */
  eq(same.cardShellClass, "group h-full flex flex-col", "the product card grew a shell again");
  if (/border|shadow|bg-white/.test(same.cardShellClass)) throw new Error("the product card is chrome again");
  eq(same.tileWindow, true, "the category window is not pinned to a height");
  eq(same.cardField, true, "the product card lost its 4:5 field");
  /* THE TWO FIELDS CROP DIFFERENTLY, AND THAT IS THE POINT (2026-09-22).
     This used to assert that NEITHER cropped, which was true only while
     the cover map was empty and every category drew an SVG. Ten curated
     photographs later the rule is the one assets/category/README.md
     always stated: a cover was COMPOSED for this window, so it fills it
     edge to edge and the crop is part of the composition; a product
     photo was shot on white by a retailer who has never seen our card,
     so it is shown whole and letterboxing is the honest answer.
     Distortion is never the answer for either. */
  eq(same.tileCrops, true, "the category cover no longer fills its window");
  eq(same.tileContains, false, "the category cover is letterboxed instead of filling");
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
    /* The rule is "a parts source is never a storefront tile", not "the
       grid is eight". Counting was a proxy for it, and the proxy broke
       the day a real ninth STORE arrived (Macy's, 2026-09-22). AutoZone
       predates the split and is Aria Auto's own source, so it is the one
       key legitimately in both lists. */
    leaked: AUTO_PARTS_SOURCES
      .map((s) => s.id)
      .filter((id) => id !== "autozone")
      .filter((id) => Object.keys(RETAILERS).includes(id) && !RETAILERS[id].retired),
    tiendaTiles: document.querySelectorAll("#storesGrid section > div.grid > *, #storesGrid > *:not(section)").length,
    listedStores: Object.values(RETAILERS).filter((x) => !x.retired).length,
  }));
  eq(r.sources.join(","), "autozone:live,rockauto:pending", "the source list comes from the registry");
  if (!/RockAuto/.test(r.pendingBlock)) throw new Error("the pending source has no block of its own");
  if (!/Conectando el catálogo/.test(r.pendingBlock)) throw new Error("the pending block is not honest about why");
  if (r.leaked.length) throw new Error(`${r.leaked.join(", ")} leaked into the Tiendas grid`);
  eq(r.tiendaTiles, r.listedStores, "the Tiendas grid is the registry, not a hand-written list");
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
      const card = [...document.querySelectorAll("#storesGrid section > div.grid > *, #storesGrid > *:not(section)")]
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
    /* THE PENDING BADGE IS PER STORE, NOT PER CATEGORY (2026-09-22).
       Sephora's 80 products landed in beauty-catalog.json, so its card
       must NOT say "conectando" any more; Victoria's Secret and Bath &
       Body Works are not in that file and still must. The three stopped
       being interchangeable, and that is the badge telling the truth
       rather than a regression. */
    eq(v.stillPending, key !== "sephora",
      key === "sephora" ? "Sephora has a catalogue and must not read as pending"
                        : `${key} stopped saying its catalogue is being connected`);
    eq(v.hasWordmarkPill, false, `${key} still renders the wordmark fallback`);
  }
  /* And the grid is the registry, not a hand-written list. It was "the
     symmetric eight" until Macy's became the ninth store on 2026-09-22;
     pinning a number would have blocked every store the shop signs. */
  const grid = await page.evaluate(() => ({
    rendered: document.querySelectorAll("#storesGrid section > div.grid > *, #storesGrid > *:not(section)").length,
    listed: Object.values(RETAILERS).filter((x) => !x.retired).length,
  }));
  eq(grid.rendered, grid.listed, "every listed store gets a tile");
  if (grid.rendered < 8) throw new Error(`Tiendas is down to ${grid.rendered} stores`);
  await ctx.close();
});

await check("a big department opens as aisles, and no aisle is the default", async () => {
  /* THE BUG (2026-09-22, QA on an iPhone): Macy's "Women" was one bucket
     of 754 products whose first several phone screens were bras and
     panties, so the 228 dresses behind them were unreachable by
     scrolling. Nothing was wrong with the data. */
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));

  await page.evaluate(() => openCatalog("department", "women", { retailerFilter: "macys" }));
  await page.waitForFunction(() => catalogState.byRetailer.size > 0, { timeout: 15000 });

  const landing = await page.evaluate(() => ({
    hasGrid: Boolean(document.getElementById("catalogGrid")),
    aisles: [...document.querySelectorAll("#catalogSections button")]
      .map((b) => (b.textContent || "").replace(/\s+/g, " ").trim())
      .filter((t) => /^(Vestidos|Tops|Chompas|Jeans|Pantalones|Casacas|Conjuntos|Ropa de baño|Zapatos|Bolsos|Accesorios|Ropa interior|Ver todo)/.test(t)),
  }));

  /* NO AISLE IS THE DEFAULT. Landing in the biggest one would bury the
     rest exactly the way underwear buried the dresses, so the landing is
     the LIST and "Ver todo" is a deliberate tap. */
  eq(landing.hasGrid, false, "the landing shows aisles, not a product wall");
  if (landing.aisles.length < 6) throw new Error(`only ${landing.aisles.length} aisles rendered`);
  if (!landing.aisles[0].startsWith("Vestidos")) throw new Error(`the list leads with "${landing.aisles[0]}", not dresses`);
  const lingerie = landing.aisles.findIndex((a) => a.startsWith("Ropa interior"));
  const verTodo = landing.aisles.findIndex((a) => a.startsWith("Ver todo"));
  if (lingerie < 0) throw new Error("lingerie is not listed — it must be present, just not first");
  if (verTodo < 0) throw new Error("Ver todo is gone");
  if (lingerie !== verTodo - 1) throw new Error("lingerie is no longer last of the aisles");

  // Into an aisle: the feed is that aisle, and it says so.
  await page.evaluate(() => setCatalogSub("dresses"));
  await page.waitForSelector("#catalogGrid", { timeout: 10000 });
  const inAisle = await page.evaluate(() => {
    const promised = Number((document.getElementById("catalogSubtitle").textContent.match(/^(\d+)/) || [])[1]);
    const actual = [...catalogState.byRetailer.values()].flat()
      .filter((it) => subcategoryOfItem(it) === "dresses").length;
    return {
      promised, actual,
      subtitle: document.getElementById("catalogSubtitle").textContent.trim(),
      url: location.search,
      // Nothing from the lingerie aisle may appear here.
      leaked: [...document.querySelectorAll("#catalogGrid > *")]
        .filter((c) => /\b(bra|panty|thong)\b/i.test(c.textContent || "")).length,
    };
  });
  eq(inAisle.actual, inAisle.promised, "an aisle delivers exactly what the list promised");
  if (!/Vestidos y faldas/.test(inAisle.subtitle)) throw new Error(`the subtitle does not name the aisle: ${inAisle.subtitle}`);
  eq(inAisle.leaked, 0, "lingerie did not contaminate the dresses");
  if (!/subKey=dresses/.test(inAisle.url)) throw new Error(`the aisle has no URL of its own: ${inAisle.url}`);

  /* The active chip must be ON SCREEN. A horizontally-scrolling row
     whose selection sits past the right edge reads as "no filter
     applied", which is how the store row looked on a 393px phone while
     the subtitle said otherwise. */
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll("#catalogSections .no-scrollbar")].map((row) => {
      const a = row.querySelector('[aria-pressed="true"]');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { label: (a.textContent || "").trim().slice(0, 24), left: r.left, right: r.right, vw: window.innerWidth };
    }).filter(Boolean));
  for (const c of chips) {
    if (c.right <= 0 || c.left >= c.vw) throw new Error(`the active chip "${c.label}" is off-screen (${Math.round(c.left)}..${Math.round(c.right)} of ${c.vw})`);
  }

  // And back to the list, not to the flat feed it replaced.
  await page.evaluate(() => setCatalogSub(null));
  await page.waitForFunction(() => !document.getElementById("catalogGrid"), { timeout: 10000 });
  await ctx.close();
});

await check("a department whose items carry no type does not split", async () => {
  /* The aisles are generic, not a Macy's feature — and the other half of
     that promise is that a store reporting no type loses nothing and
     renders exactly as it always did. */
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => openCatalog("department", "electronics"));
  await page.waitForSelector("#catalogGrid", { timeout: 15000 });
  const flat = await page.evaluate(() => ({
    cards: document.querySelectorAll("#catalogGrid > *").length,
    typed: [...catalogState.byRetailer.values()].flat().filter((it) => subcategoryOfItem(it)).length,
  }));
  if (!(flat.cards > 0)) throw new Error("the untyped department renders nothing");
  eq(flat.typed, 0, "electronics has no apparel types to split on");
  await ctx.close();
});

await check("every category cover renders as abstract art, in the DOM", async () => {
  /* THE NODE TEST READS SOURCE; QA READS A SCREEN. This bug shipped past
     a green source-level test (2026-09-22 round 2): designedCoverHTML
     drew a 64px emoji, so Electronica rendered a cartoon laptop on an
     iPhone. What was wrong was what PAINTED, so this asserts that. */
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));
  await page.evaluate(() => openCategories());
  await page.waitForSelector("#categoriesGrid [data-cover]", { timeout: 15000 });

  /* THE PHOTOS ARE LAZY, AND THIS HARNESS HAS NO TAILWIND (2026-09-22).
     cdn.tailwindcss.com is blocked here on purpose — the page must boot
     without it — so `w-full h-full` and the window's pinned height do
     not apply, and a <img> that has not decoded yet is a 0x0 box. Ten
     curated covers therefore measured "collapsed" the moment they
     landed, which is the harness and not the page. Decoding them first
     makes the collapse check mean what it says again. */
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll("#categoriesGrid [data-cover] img")];
    for (const i of imgs) i.loading = "eager";
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
  });
  await page.waitForTimeout(400);

  const audit = await page.evaluate(() => {
    const GLYPH = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F2FF}]/u;
    const covers = [...document.querySelectorAll("[data-cover]")];
    return {
      total: covers.length,
      glyphs: covers.filter((c) => GLYPH.test(c.textContent || "")).map((c) => c.getAttribute("data-cover-key")),
      texty: covers.filter((c) => (c.textContent || "").trim().length).map((c) => c.getAttribute("data-cover-key")),
      drawn: covers.filter((c) => c.querySelector("svg") || c.querySelector("img")).length,
      ids: covers.flatMap((c) => [...c.querySelectorAll("svg [id]")].map((n) => n.id)),
      /* A cover that paints nothing is worse than an ugly one — but
         measure only the ones on screen. The home rail's covers are in
         the DOM and display:none while Categorias is open, so they
         measure 0x0 and are not a defect. Their ids still count below,
         because a hidden duplicate collides exactly as hard. */
      visible: [...document.querySelectorAll("#categoriesGrid [data-cover]")].length,
      collapsed: [...document.querySelectorAll("#categoriesGrid [data-cover]")].filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width < 40 || r.height < 40;
      }).map((c) => c.getAttribute("data-cover-key")),
      /* A curated cover that 404s falls back to the drawn one, so it
         never shows a broken-image glyph — but it also means the photo
         somebody committed is not being seen. Name it. */
      deadPhotos: [...document.querySelectorAll("#categoriesGrid [data-cover] img")]
        .filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src")),
    };
  });

  if (!(audit.total >= 6)) throw new Error(`only ${audit.total} covers rendered`);
  if (audit.glyphs.length) throw new Error(`emoji rendered in: ${audit.glyphs.join(", ")}`);
  if (audit.texty.length) throw new Error(`type rendered inside the cover of: ${audit.texty.join(", ")}`);
  eq(audit.drawn, audit.total, "every cover paints either drawn art or a curated photo");
  if (!(audit.visible >= 6)) throw new Error(`only ${audit.visible} covers on the Categorias grid`);
  eq(audit.collapsed.join(), "", `covers collapsed to nothing: ${audit.collapsed.join(", ")}`);
  eq(audit.deadPhotos.join(), "", `curated photos that did not load: ${audit.deadPhotos.join(", ")}`);

  /* SVG ids are document-global. The same category renders in BOTH the
     home rail and Categorias, so a key-derived id repeated itself and
     the second copy painted from the first one's <defs> — invisible
     until the first is removed and the second goes transparent. */
  const unique = new Set(audit.ids).size;
  if (unique !== audit.ids.length) {
    throw new Error(`${audit.ids.length} SVG ids but only ${unique} unique — covers will paint from each other's gradients`);
  }
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
        // The plate is pinned to 240px above, so this is the share of the
        // card a mark actually covers — the figure the brief is written in.
        plateW: img.parentElement.getBoundingClientRect().width,
        aspect: nw / nh,
      };
    });
  });

  /* Not a fixed count: the grid is the registry, and Macy's became the
     ninth store on 2026-09-22. What matters is that every store with a
     logo file got measured, not how many there are this week. */
  const withLogos = await page.evaluate(() =>
    Object.values(RETAILERS).filter((r) => !r.retired && r.logo).length);
  eq(marks.length, withLogos, "store marks measured vs stores with a logo file");
  if (marks.length < 8) throw new Error(`only ${marks.length} store marks — the grid lost stores`);

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
  /* ulta and yesstyle joined the list when their marks landed
     (2026-09-22). YesStyle is the one worth watching: its supplied file
     was 7.4% wordmark on a white canvas, and uncropped it would draw a
     sliver here while still decoding, still having a sane aspect ratio,
     and still passing every other check. It measures 71% of Walmart
     cropped — the same band as AutoZone and Foot Locker. */
  /* The 2026-09-22 batch joins the list, minus one. GOLDEN GOOSE IS
     DELIBERATELY ABSENT: its mark is 8.9:1, a hair off Foot Locker's
     9:1, and a contain-fit zone simply cannot give a wordmark that wide
     the same area as a square one without cropping it. It measures 59%
     — which is why Foot Locker is not in this list either. Both are
     "as large as their own proportions allow", and the coverage test in
     run-tests.mjs is what guards them instead. */
  for (const key of ["sephora", "victoriassecret", "bathandbodyworks", "target", "ulta", "yesstyle",
                     "skims", "revolve", "dyson", "sunglasshut", "fendi", "miumiu"]) {
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

  /* HOW MUCH OF THE CARD A MARK COVERS (2026-09-21). Reported on the
     4-across desktop grid: "they currently render microscopic". The zone
     was right in shape but wrong in size, and specifically the width cap
     was a FIXED 130px — a fixed number cannot hold a proportion of a
     fluid card. Measured at the time: 71% of a 182px phone card and 50%
     of a 258px desktop card, from the same CSS. The cap is a percentage
     now, so the proportion holds at every width.

     Asserted on the WIDE marks only: under contain-fit a square mark
     reaches the zone's height long before its width, so it can never
     cover 70% of the card, and demanding that it did would mean cropping
     it. What a square mark owes is equal AREA, which the check above
     enforces. */
  const wide = marks.filter((m) => m.aspect >= 3);
  if (wide.length < 3) throw new Error(`expected several wide wordmarks, found ${wide.length}`);
  for (const m of wide) {
    const fill = m.drawnW / m.plateW;
    if (fill < 0.65) {
      throw new Error(
        `${m.key} covers only ${(fill * 100).toFixed(0)}% of its card width ` +
        `(${m.drawnW.toFixed(0)}px of ${m.plateW.toFixed(0)}px) — the brief asks for about 70%`,
      );
    }
    if (fill > 0.92) {
      throw new Error(`${m.key} covers ${(fill * 100).toFixed(0)}% of its card — it is touching the edges`);
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

await check("on a phone the orb is anchored, barely travels, and never lands on a card", async () => {
  /* REPORTED with a screenshot from a live phone: "el orbe vaga por media
     pantalla" and parks on top of the category cards. Both halves were
     real. The lane runs from ORB_TOP_SAFE to the bottom margin, which on
     a phone is most of the screen height — and whether a handset got a
     lane at all depended on how wide the active view's content column
     happened to measure, so the same device could dock on one page and
     roam on another.

     A phone is corner-anchored now regardless of the measured gutter,
     and the float is bounded to about half a diameter. This samples the
     orb over several seconds of real animation on the category grid,
     which is the exact surface it was reported parking on.

     WHAT KEEPS HER OFF THE CARDS CHANGED ON 2026-09-22, and this test
     did not: it asserts the OUTCOME, not the mechanism. The orb used to
     retreat to a sliver at the edge when it detected content underneath;
     QA on a real phone rejected that sliver, so the retreat is gone and
     the reserved corner (orbReserveSpace) is what holds the space now.
     Same guarantee, different machinery — which is why an outcome
     assertion survived a mechanism being deleted underneath it. */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
  await page.route("**/.netlify/functions/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.evaluate(() => openCategories());
  await page.waitForTimeout(600);
  if (errors.length) throw new Error(errors.join(" | "));

  const r = await page.evaluate(async () => {
    const btn = document.getElementById("assistantBtn");
    const samples = [];
    for (let i = 0; i < 16; i++) {
      await new Promise((res) => setTimeout(res, 200));
      const b = btn.getBoundingClientRect();
      let onCard = false;
      for (const card of document.querySelectorAll("#categoriesGrid > button")) {
        const c = card.getBoundingClientRect();
        const ix = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
        const iy = Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
        if (ix > 2 && iy > 2) { onCard = true; break; }
      }
      /* CLIPPING IS MEASURED FROM THE TRANSFORM, NOT THE RECT.
         Tailwind's CDN is blocked in this harness, so `position: fixed`
         never applies and the button sits at its document position in a
         47,000px-tall unstyled page — getBoundingClientRect() reports it
         45,000px below the fold and every viewport looks "clipped".
         The translate3d values ARE the viewport coordinates once fixed
         positioning applies, which is what production paints by, so the
         check reads those plus the drawn size. */
      const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(btn.style.transform || "");
      const size = orbLane().size;
      let clipped = null;
      if (m) {
        const tx = parseFloat(m[1]), ty = parseFloat(m[2]);
        clipped = tx < 0 ? "left" : ty < 0 ? "top"
          : tx + size > window.innerWidth ? "right"
          : ty + size > window.innerHeight ? "bottom" : null;
      }
      samples.push({ x: b.x, y: b.y, onCard, clipped });
    }
    const xs = samples.map((s) => s.x), ys = samples.map((s) => s.y);
    return {
      mode: orbLane().mode,
      travelX: Math.max(...xs) - Math.min(...xs),
      travelY: Math.max(...ys) - Math.min(...ys),
      onCard: samples.filter((s) => s.onCard).length,
      offFrame: samples.find((s) => s.clipped)?.clipped || null,
      lowest: Math.max(...ys),
      vh: window.innerHeight,
    };
  });

  eq(r.mode, "dock", "a phone got a roaming lane again");
  eq(r.onCard, 0, "the orb is landing on category cards again");
  /* FULLY IN FRAME, ALWAYS (2026-09-22). The tuck-to-a-sliver was
     removed after QA on a real phone read it as a bug — "one eighth of
     the orb coming out the side" — so the bar is now that she is never
     clipped by any edge. Nothing asserted that before, and the retreat
     that used to push her off-frame is exactly what would break it. */
  if (r.offFrame) {
    throw new Error(`the orb is clipped by a viewport edge (${r.offFrame}) — the tuck-to-a-sliver is back`);
  }
  // Bounded to about one diameter of travel, not half a screen.
  const diameter = 64;
  if (r.travelX > diameter || r.travelY > diameter) {
    throw new Error(`the orb roams ${r.travelX.toFixed(0)}x${r.travelY.toFixed(0)}px — more than its own diameter`);
  }
  // Anchored to the BOTTOM, not drifting up the page.
  if (r.lowest < r.vh * 0.6) {
    throw new Error(`the orb settled at y=${r.lowest.toFixed(0)} in a ${r.vh}px viewport — that is not the bottom corner`);
  }
  await ctx.close();
});

/* ============================================================
   THE BRAND WALL, AND THE PANEL THAT REPLACED IT.

   192 SSENSE brand cards used to sit under the eleven department
   covers on the home page. Two things have to hold at once now: the
   wall is really gone from that grid, and not one of those 192 brands
   became unreachable in the process. Both are browser facts — one is a
   rendered grid, the other is a filter and a scroll — so neither can be
   proved by reading the file.
   ============================================================ */
await check("the home page grid is departments only", async () => {
  const { ctx, page, errors } = await openPage();
  if (errors.length) throw new Error("page-load errors: " + errors.join(" | "));
  const grid = await page.evaluate(() => {
    const g = document.getElementById("catGrid");
    return {
      cards: g.children.length,
      names: [...g.children].map((c) => (c.textContent || "").trim().split("\n")[0].trim()),
    };
  });
  /* Eleven departments. It was eleven, went to ten on 2026-09-24 when
     Salud y Farmacia came off the site (a DIGEMID import permit we do
     not hold), and is eleven again because Curvy took that slot. The
     number is asserted, not just "fewer than before": a regression that
     puts brands back would sail past a `< 50` and the wall would be back
     at the next export, and one that resurrects the pharmacy reads 12. */
  eq(grid.cards, 11, "home page tiles");
  eq(grid.names.includes("Curvy"), true, `Curvy is not on the home page: ${grid.names.join()}`);
  if (grid.names.some((n) => /farmacia|salud/i.test(n))) {
    throw new Error(`the restricted department is back on the home page: ${grid.names.join()}`);
  }
  // And none of them is a brand. SSENSE's are the ones that were here.
  for (const brand of ["Rick Owens", "Driesvannoten", "Dries Van Noten", "Acne Studios", "Nike"]) {
    if (grid.names.includes(brand)) throw new Error(`the brand wall is back: ${brand} is on the home page grid`);
  }
  await ctx.close();
});

await check("SSENSE's brand panel lists all 192, searches and jumps", async () => {
  const { ctx, page, errors } = await openPage();
  await page.evaluate(() => openStore("ssense"));
  await page.waitForTimeout(1200);
  if (errors.length) throw new Error("errors after opening the store: " + errors.join(" | "));

  const shape = await page.evaluate(() => {
    const list = document.getElementById("brandPanelList");
    if (!list) return { missing: true };
    const rows = [...list.querySelectorAll("[data-brand-name]")];
    const chips = [...document.querySelectorAll("[data-brand-jump]")];
    return {
      rows: rows.length,
      letters: chips.map((c) => c.textContent.trim()),
      names: rows.map((r) => r.getAttribute("data-brand-name")),
      scrolls: list.scrollHeight > list.clientHeight,
    };
  });
  if (shape.missing) throw new Error("SSENSE has no brand panel");
  eq(shape.rows, 192, "brands listed in the panel");
  // The slugs never reach the shopper.
  if (shape.names.includes("Driesvannoten")) throw new Error("a brand is named by its slug");
  if (!shape.names.includes("Dries Van Noten")) throw new Error("Dries Van Noten is not in the list");
  // A letter with no brands behind it would be a dead tap.
  eq(shape.letters[0], "#", "the numbered brands come first");
  if (shape.letters.includes("Q")) throw new Error("the index offers a letter with nothing behind it");

  /* THE JUMP MOVES THE LIST, NOT THE PAGE. scrollIntoView would drag
     the whole document to meet a panel already on screen. */
  const jump = await page.evaluate(async () => {
    const list = document.getElementById("brandPanelList");
    list.scrollTop = 0;
    const before = window.scrollY;
    document.querySelector('[data-brand-jump="R"]').click();
    /* The scroll is smooth, and with the CDN blocked the list is one
       tall column, so R can be ten thousand pixels down. Wait for the
       scroll to SETTLE rather than for a guessed number of ms. */
    let last = -1;
    for (let i = 0; i < 60 && last !== list.scrollTop; i++) { last = list.scrollTop; await new Promise((r) => setTimeout(r, 100)); }
    const head = list.querySelector('[data-brand-letter="R"]').getBoundingClientRect();
    const atEnd = list.scrollTop >= list.scrollHeight - list.clientHeight - 1;
    return { scrollTop: list.scrollTop, offset: head.top - list.getBoundingClientRect().top, atEnd, pageMoved: window.scrollY - before };
  });
  if (jump.scrollTop <= 0) throw new Error("the letter jump did not move the list");
  /* R sits at the top of the list, unless the list has simply run out
     of scroll under it — a section near the end cannot reach the top
     and it is not the jump's fault. */
  if (!jump.atEnd && Math.abs(jump.offset) > 40) throw new Error(`R landed ${Math.round(jump.offset)}px from the top of the list`);
  if (jump.atEnd && jump.offset < 0) throw new Error("the jump overshot past R");
  eq(jump.pageMoved, 0, "the letter jump scrolled the whole page");

  // Typing filters live, mid-name, and the index follows it.
  const search = await page.evaluate(async () => {
    const box = document.getElementById("brandPanelSearch");
    const list = document.getElementById("brandPanelList");
    const visible = () => [...list.querySelectorAll("[data-brand-name]")].filter((r) => r.offsetParent !== null);
    const type = async (v) => { box.value = v; box.dispatchEvent(new Event("input")); await new Promise((r) => setTimeout(r, 80)); };
    await type("margiela");
    const hits = visible().map((r) => r.getAttribute("data-brand-name"));
    const live = [...document.querySelectorAll("[data-brand-jump]")].filter((c) => !c.disabled).map((c) => c.textContent.trim());
    await type("zzzz");
    const none = visible().length;
    const empty = document.getElementById("brandPanelEmpty");
    const told = empty && empty.offsetParent !== null;
    await type("");
    return { hits, live, none, told, restored: visible().length };
  });
  if (!search.hits.includes("MM6 Maison Margiela")) throw new Error("a mid-name search finds nothing");
  eq(search.live.join(), "M", "the letter index did not follow the search");
  eq(search.none, 0, "a nonsense query still shows brands");
  eq(search.told, true, "an empty result says nothing at all");
  eq(search.restored, 192, "clearing the box did not bring the brands back");
  await ctx.close();
});

await check("every multi-brand storefront carries the same panel", async () => {
  /* "Wire it into every storefront that carries multiple brands." The
     list is asserted store by store rather than as a count, because the
     interesting half is which stores DON'T get it:

       * Foot Locker sells one scraped brand (Nike) — a brand search
         with one setting is not a search, so it keeps its categories.
       * Walmart, Target and Old Navy name no brand on any scraped item.
         There is nothing to list, and guessing one from a product title
         is exactly the mistake the category covers taught us not to
         make. That is a scraper gap, and it is the only thing standing
         between those three and a panel. */
  const { ctx, page, errors } = await openPage();
  const expected = { sephora: 2, ulta: 30, yesstyle: 29, macys: 107, ssense: 192 };
  const bare = ["walmart", "target", "oldnavy", "footlocker"];
  for (const [store, count] of Object.entries(expected)) {
    await page.evaluate((k) => openStore(k), store);
    await page.waitForTimeout(700);
    const seen = await page.evaluate(() => {
      const p = document.querySelector("[data-brand-panel]");
      return p && {
        heading: p.querySelector("h3").textContent,
        rows: p.querySelectorAll("[data-brand-name]").length,
        search: !!document.getElementById("brandPanelSearch"),
        letters: [...p.querySelectorAll("[data-brand-jump]")].length,
        numeric: [...p.querySelectorAll("[data-brand-name]")].filter((x) => /^[0-9]+$/.test(x.getAttribute("data-brand-name"))).length,
      };
    });
    if (!seen) throw new Error(`${store} has no brand panel`);
    // SAME COMPONENT, SAME BEHAVIOUR — Ulta's thirty get what SSENSE's
    // 192 get, down to the search box.
    eq(seen.heading, "Busca por marca", `${store} heading`);
    eq(seen.rows, count, `${store} brand rows`);
    eq(seen.search, true, `${store} lost its search box`);
    if (!seen.letters) throw new Error(`${store} has no letter index`);
    /* The beauty three's `brands` key is a bare array of NAMES, which
       decodes as brands called "0" and "1". Deriving off their stock is
       what keeps those out of a shopper's way. */
    if (store !== "ssense" && seen.numeric) throw new Error(`${store} is listing a brand called by a number`);
  }
  for (const store of bare) {
    await page.evaluate((k) => openStore(k), store);
    await page.waitForTimeout(700);
    const drawn = await page.evaluate(() => !!document.querySelector("[data-brand-panel]"));
    if (drawn) throw new Error(`${store} was offered a brand search it has no brands for`);
  }
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a derived brand routes, and its count is the truth", async () => {
  /* Macy's ships no brands bucket at all — its list is counted off its
     own 754 items. The row says 43 Wacoal and the page it opens has to
     agree, or the number on the row is decoration. */
  const { ctx, page, errors } = await openPage();
  await page.evaluate(() => openStore("macys"));
  await page.waitForTimeout(900);
  const row = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-brand-name]")].find((x) => x.getAttribute("data-brand-name") === "Wacoal");
    return el && { count: Number(el.lastElementChild.textContent), onclick: el.getAttribute("onclick") };
  });
  if (!row) throw new Error("Macy's biggest brand is not in its panel");
  eq(row.onclick, "openCatalog('brand','wacoal')", "a derived brand's route");
  await page.evaluate(() => [...document.querySelectorAll("[data-brand-name]")].find((x) => x.getAttribute("data-brand-name") === "Wacoal").click());
  await page.waitForTimeout(1600);
  const landed = await page.evaluate(() => ({
    title: document.getElementById("catalogTitle").textContent,
    url: location.search,
    subtitle: document.getElementById("catalogSubtitle").textContent,
  }));
  eq(landed.title, "Wacoal", "the derived brand's page title");
  eq(landed.url, "?categoria=wacoal&kind=brand", "the derived brand's URL");
  if (!landed.subtitle.startsWith(`${row.count} productos`)) {
    throw new Error(`the row promised ${row.count} and the page says "${landed.subtitle.slice(0, 40)}"`);
  }
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a brand row opens exactly what its card opened", async () => {
  /* The cards are gone; their route is not. This is the assertion that
     decides whether 192 links survived the deletion. */
  const { ctx, page, errors } = await openPage();
  await page.evaluate(() => openStore("ssense"));
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('[data-brand-name="Dries Van Noten"]').click());
  await page.waitForTimeout(1500);
  const landed = await page.evaluate(() => ({
    view: [...document.querySelectorAll(".view")].filter((v) => getComputedStyle(v).display !== "none").map((v) => v.id).join(),
    title: document.getElementById("catalogTitle").textContent,
    url: location.search,
    products: document.querySelectorAll("#catalogSections button, #catalogSections article").length,
  }));
  eq(landed.view, "catalogView", "a brand row did not open the catalogue");
  eq(landed.title, "Dries Van Noten", "the brand page is titled by its slug");
  eq(landed.url, "?categoria=driesvannoten&kind=brand", "the brand's URL changed");
  if (!landed.products) throw new Error("the brand page opened with nothing in it");
  if (errors.length) throw new Error("errors on the brand page: " + errors.join(" | "));
  await ctx.close();
});

/* ============================================================
   NO PRICE, NO BUY BUTTON.

   Reported from the live site: a Target home_goods record cached with
   price: null rendered "Precio no disponible" with a live blue
   "Agregar al carrito" under it. Tapping it wrote priceUsd: 0 into the
   cart and toasted "Agregado al carrito."

   The money assertion is the third one: the cart must stay empty even
   when the button is bypassed entirely, because a disabled button is a
   courtesy and the funnel is the guarantee.
   ============================================================ */
await check("a priceless product offers no working buy button", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  const r = await page.evaluate(async () => {
    cart.length = 0;
    showProduct("target", "Farmhouse Stripe Bedding Collection", null, 1.2, "", [], false, "", "", [], null);
    await new Promise((res) => setTimeout(res, 300));
    const btn = document.getElementById("addToCartBtn");
    const note = document.getElementById("productNoPriceNote");
    return {
      price: document.getElementById("productViewPrice").textContent.trim(),
      label: btn.textContent.trim(),
      disabled: btn.disabled,
      aria: btn.getAttribute("aria-disabled"),
      noteShown: !note.hidden && (note.textContent || "").length > 20,
    };
  });
  eq(r.price, "Precio no disponible", "the price line");
  eq(r.disabled, true, "the buy button is still live next to a missing price");
  eq(r.aria, "true", "the button is not disabled for assistive tech");
  if (r.label === "Agregar al carrito") throw new Error("the dead button still promises to add to the cart");
  eq(r.noteShown, true, "nothing tells the shopper why they cannot buy");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a $0 line cannot reach the cart, button or no button", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  const r = await page.evaluate(async () => {
    cart.length = 0;
    showProduct("target", "Farmhouse Stripe Bedding Collection", null, 1.2, "", [], false, "", "", [], null);
    await new Promise((res) => setTimeout(res, 250));
    // 1. the handler the button would have called
    addToCartFromProduct();
    const afterHandler = cart.length;
    // 2. the funnel itself, the way a console or a second rail reaches it
    const nullSaid = addToCart({ retailer: "target", title: "priceless", priceUsd: null, weightKg: 1 });
    const zeroSaid = addToCart({ retailer: "target", title: "zero", priceUsd: 0, weightKg: 1 });
    const blankSaid = addToCart({ retailer: "walmart", title: "blank", priceUsd: "", weightKg: 1 });
    return { afterHandler, cart: cart.length, nullSaid, zeroSaid, blankSaid };
  });
  eq(r.afterHandler, 0, "the product page added a priceless line anyway");
  eq(r.cart, 0, "a priceless or $0 line reached the cart through the funnel");
  eq(r.nullSaid, false, "addToCart claimed it accepted a null price");
  eq(r.zeroSaid, false, "addToCart claimed it accepted a $0 price");
  eq(r.blankSaid, false, "addToCart claimed it accepted an empty price");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a priced product still buys exactly as before", async () => {
  /* The other half of failing closed: nothing about a real price may
     have changed. This is the regression the guards could plausibly
     cause, so it is asserted rather than assumed. */
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  const r = await page.evaluate(async () => {
    cart.length = 0;
    showProduct("target", "Something priced", 42.5, 1.2, "", [], false, "", "", [], null);
    await new Promise((res) => setTimeout(res, 250));
    const btn = document.getElementById("addToCartBtn");
    const note = document.getElementById("productNoPriceNote");
    const before = { label: btn.textContent.trim(), disabled: btn.disabled, noteHidden: note.hidden };
    btn.click();
    await new Promise((res) => setTimeout(res, 250));
    return { ...before, cart: cart.length, price: cart[0]?.priceUsd, qty: cart[0]?.qty };
  });
  eq(r.label, "Agregar al carrito", "the live button's label");
  eq(r.disabled, false, "a priced product's buy button is disabled");
  eq(r.noteHidden, true, "the no-price note shows on a priced product");
  eq(r.cart, 1, "a priced product no longer reaches the cart");
  eq(r.price, 42.5, "the price that landed in the cart");
  eq(r.qty, 1, "the quantity that landed in the cart");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

/* ==================================================================
   STREAMING THE CHAT — over a real socket, because a fake one proves
   nothing.

   Playwright's route.fulfill() hands the browser a COMPLETE body. A
   "stream" mocked that way arrives in one piece and every assertion
   below would pass against the buffered code this change replaces. So
   these checks run against a real HTTP server that writes events one at
   a time, with real delays, and proxies everything else to the static
   server the rest of this file uses.

   Four deploys are simulated, because the fallback matters as much as
   the stream: one that streams, one where the function is missing, one
   where something between us and the browser buffers the stream anyway,
   and one where the connection dies mid-reply.
   ================================================================== */
const SSE_REPLY = "Claro, el envío desde Miami tarda entre siete y diez días hábiles una vez que tu pedido sale del almacén.";
const SSE_TOKEN_MS = 18;
const BUFFERED_DELAY_MS = 700;

function startChatMock(mode) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;

    if (path === "/.netlify/functions/aria-chat-stream") {
      if (mode === "missing") { res.writeHead(404).end("not found"); return; }
      if (mode === "buffered") {
        // An intermediary that swallows the stream: same events, one write.
        const body = SSE_REPLY.split(" ").map((w) => `data: ${JSON.stringify({ t: w + " " })}\n\n`).join("")
          + `data: ${JSON.stringify({ done: true, reply: SSE_REPLY, audio: null })}\n\n`;
        await sleep(BUFFERED_DELAY_MS);
        res.writeHead(200, { "Content-Type": "text/event-stream", "Content-Length": Buffer.byteLength(body) }).end(body);
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
      const words = SSE_REPLY.split(" ");
      for (let i = 0; i < words.length; i++) {
        if (mode === "die" && i === 6) { res.destroy(); return; }
        res.write(`data: ${JSON.stringify({ t: words[i] + (i < words.length - 1 ? " " : "") })}\n\n`);
        await sleep(SSE_TOKEN_MS);
      }
      res.write(`data: ${JSON.stringify({ done: true, reply: SSE_REPLY, audio: null })}\n\n`);
      res.end();
      return;
    }
    if (path === "/.netlify/functions/aria-chat-groq") {
      await sleep(BUFFERED_DELAY_MS);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ reply: SSE_REPLY, audio: null }));
      return;
    }
    if (path.startsWith("/.netlify/functions/")) { res.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return; }

    // Everything else is the page itself, from the static server.
    try {
      const upstream = await fetch(BASE + path);
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/octet-stream" }).end(buf);
    } catch { res.writeHead(502).end("upstream"); }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

/** Open the chat on the mock, send one question, watch the bubble fill. */
async function runChatTurn(mode, question = "¿cómo funciona el envío?") {
  const { server, port } = await startChatMock(mode);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.__growth = [];
    const wrap = document.getElementById("assistantMessages");
    new MutationObserver(() => {
      const bots = [...wrap.children].filter((el) => el.style.background === "var(--sky)");
      const last = bots[bots.length - 1];
      const len = last ? (last.textContent || "").length : 0;
      const prev = window.__growth[window.__growth.length - 1];
      if (!prev || prev[1] !== len) window.__growth.push([Math.round(performance.now()), len, bots.length]);
    }).observe(wrap, { childList: true, subtree: true, characterData: true });
    toggleAssistant();
  });
  await page.waitForTimeout(400);
  await page.fill("#assistantInput", question);
  const sentAt = await page.evaluate(() => { const t = performance.now(); sendAssistantText(); return t; });
  /* THE ANCHOR IS READ ONCE THE REPLY HAS STARTED, not before it. The
     acknowledgment note ("Dame un segundo…") is added deliberately
     between the question and the reply, so measuring from before the
     send would count that as a shift. What must not move is everything
     already on screen while the bubble GROWS. */
  await page.waitForFunction(() => {
    const wrap = document.getElementById("assistantMessages");
    const bots = [...wrap.children].filter((el) => el.style.background === "var(--sky)");
    return bots.some((b) => (b.textContent || "").length > 0 && b.hasAttribute("aria-busy"))
      || window.__growth.some((x) => x[1] > 0);
  }, null, { timeout: 20000 }).catch(() => {});
  const notesBefore = await page.evaluate(() =>
    [...document.querySelectorAll("#assistantMessages .assistantNote")].map((n) => Math.round(n.getBoundingClientRect().top)));
  await page.waitForFunction(() => {
    const wrap = document.getElementById("assistantMessages");
    const bots = [...wrap.children].filter((el) => el.style.background === "var(--sky)");
    const last = bots[bots.length - 1];
    return last && (last.textContent || "").length > 0 && !last.hasAttribute("aria-busy");
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const out = await page.evaluate((sentAt) => {
    const wrap = document.getElementById("assistantMessages");
    const bots = [...wrap.children].filter((el) => el.style.background === "var(--sky)");
    const last = bots[bots.length - 1];
    const g = window.__growth.filter((x) => x[1] > 0);
    return {
      firstTokenMs: g.length ? Math.round(g[0][0] - sentAt) : null,
      steps: g.length,
      text: last ? last.textContent : "",
      /* NON-EMPTY ONLY. toggleAssistant() greets through a different
         endpoint, and against this mock that greeting comes back with
         no reply and renders an EMPTY bubble — a real (pre-existing)
         rough edge in the greeting path, and not what these checks are
         about. Counting answers, not boxes. */
      botBubbles: bots.filter((b) => (b.textContent || "").trim().length > 0).length,
      typingLeft: Boolean(document.getElementById("assistantTyping")),
      notesAfter: [...wrap.querySelectorAll(".assistantNote")].map((n) => Math.round(n.getBoundingClientRect().top)),
      history: (typeof ariaChatHistory !== "undefined" ? ariaChatHistory : []).map((h) => h.role),
    };
  }, sentAt);
  await ctx.close();
  server.close();
  return { ...out, errors, notesBefore };
}

await check("the reply arrives word by word, not all at once", async () => {
  const r = await runChatTurn("stream");
  if (r.errors.length) throw new Error(r.errors.join(" | "));
  eq(r.text, SSE_REPLY, "the whole reply landed");
  /* THE ASSERTION THAT MATTERS. A buffered reply reaches its final
     length in ONE step; a streamed one climbs. The old code scored 1
     here by construction. */
  if (r.steps < 8) throw new Error(`the bubble filled in ${r.steps} steps — that is not streaming`);
  // …and the first words are readable long before the reply is done.
  if (!(r.firstTokenMs !== null && r.firstTokenMs < 1000)) {
    throw new Error(`first token at ${r.firstTokenMs}ms — the brief asks for under a second`);
  }
  eq(r.typingLeft, false, "the typing indicator outlived the first token");
  // NO LAYOUT SHIFT: nothing above the reply moved while it grew.
  eq(JSON.stringify(r.notesAfter), JSON.stringify(r.notesBefore), "something above the reply moved");
  eq(r.history.join(), "user,assistant", "the turn was recorded exactly once");
});

await check("a deploy that cannot stream still answers, once", async () => {
  /* THE FALLBACK IS THE POINT. Whether a given Netlify deploy flushes a
     streamed response through its CDN could not be verified from the
     build environment, so the page must behave exactly as it did before
     when it does not — including NOT rendering the answer twice. */
  for (const mode of ["missing", "buffered"]) {
    const r = await runChatTurn(mode);
    if (r.errors.length) throw new Error(`${mode}: ${r.errors.join(" | ")}`);
    eq(r.text, SSE_REPLY, `${mode}: the reply still arrives`);
    eq(r.botBubbles, 1, `${mode}: ${r.botBubbles} bot bubbles — the answer was rendered twice`);
    eq(r.typingLeft, false, `${mode}: the typing indicator was left up`);
    eq(r.history.join(), "user,assistant", `${mode}: the turn was recorded once`);
  }
});

await check("a stream that dies keeps what the shopper is already reading", async () => {
  const r = await runChatTurn("die");
  if (r.errors.length) throw new Error(r.errors.join(" | "));
  /* Deleting a half-read paragraph to replace it with an error is worse
     than a short answer. The words stay, the history records what was
     really said, and a quiet note says it stopped. */
  if (!r.text.length) throw new Error("the partial reply was thrown away");
  if (r.text.length >= SSE_REPLY.length) throw new Error("the reply was not actually truncated");
  if (!SSE_REPLY.startsWith(r.text.trim())) throw new Error(`kept text is not a prefix of the reply: ${r.text}`);
  eq(r.botBubbles, 1, "the dead stream was re-asked and answered twice");
  eq(r.history.join(), "user,assistant", "the truncated turn was recorded once");
  if (r.notesAfter.length <= r.notesBefore.length) throw new Error("nothing told the shopper the reply was cut off");
});


/* ==================================================================
   THE PHONE'S THREE RAILS.

   This harness boots with Tailwind's CDN blocked, so it is looking at an
   UNSTYLED page: it cannot see that a rail scrolls or that the shopfront
   is hidden on a desktop -- run-tests.mjs pins all of that by class.
   What it CAN do is the thing no static read can: load the real page,
   let the real sales scan run, and check that the rail and the feed
   behind it are telling the shopper the same numbers.
   ================================================================== */
const PHONE = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

await check("the phone's rails fill from the page's own data", async () => {
  const { ctx, page, errors } = await openPage({}, PHONE);
  await page.waitForTimeout(4000);
  const rails = await page.evaluate(() => ({
    deals: document.querySelectorAll("#mobileDealsRow [data-mobile-deal]").length,
    tail: document.querySelectorAll("#mobileDealsRow [data-mobile-deal-all]").length,
    stores: document.getElementById("mobileStoresRow").children.length,
    registry: activeRetailers().length,
    cats: document.querySelectorAll("#mobileCatsRow [data-mobile-cat]").length,
    grid: document.getElementById("catGrid").children.length,
    cap: MOBILE_RAIL_DEALS,
  }));
  eq(rails.deals, rails.cap, "the deals rail holds its cap");
  eq(rails.tail, 1, "the deals rail has exactly one 'Ver todo' tail");
  eq(rails.stores, rails.registry, "the stores rail carries every active store");
  /* THE SAME TILES THE GRID DREW. A department added to DEPARTMENT_SPEC
     -- Zapatos, and whatever follows -- has to appear in both or in
     neither; a literal here would go stale the day one lands. */
  eq(rails.cats, rails.grid, "the categories rail and the grid disagree about the departments");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("biggest discount first, and the rail's count is the feed's own", async () => {
  /* THE BUG THIS REPLACES. The superseded banner counted the `sale`
     DEPARTMENT (1,358) and opened a FEED that holds 1,066 -- the feed
     applies passesOfertasGate and the department does not. Reading
     saleItemsCache is what makes the two numbers one number. */
  const { ctx, page, errors } = await openPage({}, PHONE);
  await page.waitForTimeout(4000);

  const pcts = await page.evaluate(() =>
    [...document.querySelectorAll("#mobileDealsRow [data-mobile-deal]")]
      .map((c) => { const m = (c.textContent || "").match(/-(\d+)%/); return m ? Number(m[1]) : null; }));
  if (pcts.includes(null)) throw new Error("a deal card is showing no discount badge");
  if (!pcts.length) throw new Error("the deals rail is empty on a full cache");

  /* SORTED BY DISCOUNT, EXCEPT ACROSS THE OPENING RUN, WHICH IS THE
     POINT OF THE OPENING RUN. The first five cards take one store each
     so the rail cannot lead on three near-identical markdowns from the
     same shop, and that deliberately breaks strict descending order
     inside those five. Everything after them is the untouched queue.

     Both halves are still checked — the tail for its order, the lead
     for one store per card — so "sorted by discount" cannot quietly
     become "unsorted". */
  const { lead, cap, storesWithDeals } = await page.evaluate(() => ({
    lead: mobileDealsRendered.slice(0, MOBILE_RAIL_LEAD).map((p) => p.retailer),
    cap: MOBILE_RAIL_LEAD,
    /* HOW MANY DISTINCT STORES THE FEED CAN ACTUALLY SUPPLY. Today it is
       four, so the fifth card is necessarily a repeat — and demanding
       five would be demanding data that does not exist. What must hold
       is that the run is as varied as the feed allows: a repeat while
       another store still has an unused deal is the regression. */
    storesWithDeals: new Set(saleItemsCache
      .filter((p) => Number(p.price) > 0 && Number(p.originalPrice) > Number(p.price) && p.image)
      .map((p) => p.retailer)).size,
  }));
  eq(new Set(lead).size, Math.min(cap, storesWithDeals),
    `the opening run is less varied than the feed allows: ${lead.join(",")} from ${storesWithDeals} stores`);
  // However thin the feed, the run is still full.
  eq(lead.length, cap, "the opening run came up short");
  for (let i = cap + 1; i < pcts.length; i++) {
    if (pcts[i] > pcts[i - 1]) throw new Error(`the rail is not sorted by discount: ${pcts[i - 1]}% then ${pcts[i]}%`);
  }
  // The deepest markdown in the feed is still the first thing on the rail.
  const best = await page.evaluate(() =>
    Math.max(...saleItemsCache.filter((p) => Number(p.price) > 0 && Number(p.originalPrice) > Number(p.price) && p.image)
      .map((p) => discountPct(p))));
  eq(pcts[0], best, "the rail does not open on the deepest markdown in the feed");

  const promised = await page.evaluate(() =>
    Number((document.querySelector("#mobileDealsRow [data-mobile-deal-all]").textContent.match(/([\d.,]+)\s+ofertas/) || [])[1].replace(/\D/g, "")));
  await page.evaluate(() => document.querySelector("#mobileDealsRow [data-mobile-deal-all]").click());
  await page.waitForTimeout(2500);
  const delivered = await page.evaluate(() => ({
    view: [...document.querySelectorAll(".view")].filter((v) => getComputedStyle(v).display !== "none").map((v) => v.id).join(),
    cards: document.querySelectorAll("#salesGrid > *").length,
  }));
  eq(delivered.view, "salesView", "'Ver todo' did not open Ofertas");
  eq(delivered.cards, promised, "the rail promised a different number of ofertas than the feed holds");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("tapping a rail card opens that exact product", async () => {
  const { ctx, page, errors } = await openPage({}, PHONE);
  await page.waitForTimeout(4000);
  const card = await page.evaluate(() => {
    const el = document.querySelector("#mobileDealsRow [data-mobile-deal]");
    return { title: mobileDealsRendered[0].title, price: mobileDealsRendered[0].price, text: el.textContent.replace(/\s+/g, " ") };
  });
  await page.evaluate(() => document.querySelector("#mobileDealsRow [data-mobile-deal]").click());
  await page.waitForTimeout(1500);
  const landed = await page.evaluate(() => ({
    view: [...document.querySelectorAll(".view")].filter((v) => getComputedStyle(v).display !== "none").map((v) => v.id).join(),
    title: document.getElementById("productViewTitle").textContent.trim(),
    buyable: !document.getElementById("addToCartBtn").disabled,
  }));
  eq(landed.view, "productView", "a rail card did not open a product");
  eq(landed.title, card.title, "the product page opened a different item than the card showed");
  /* Every rail card is a priced, marked-down item by construction, so
     its product page must offer a working buy button -- the no-price /
     no-buy rule cuts the other way here. */
  eq(landed.buyable, true, "a priced deal opened a product that cannot be bought");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("nothing in the shopfront moves on its own", async () => {
  /* The rule stated twice in the brief. Asserted against the running
     page, not the source: a timer set anywhere -- a library, a copied
     snippet, a future edit -- would move a rail, and this is what a
     shopper would feel. */
  const { ctx, page, errors } = await openPage({}, PHONE);
  await page.waitForTimeout(4000);
  const drift = await page.evaluate(async () => {
    const ids = ["mobileDealsRow", "mobileStoresRow", "mobileCatsRow"];
    const before = ids.map((i) => document.getElementById(i).scrollLeft);
    const y = window.scrollY;
    await new Promise((r) => setTimeout(r, 5000));
    const after = ids.map((i) => document.getElementById(i).scrollLeft);
    return { moved: ids.map((_, i) => before[i] !== after[i]).some(Boolean), scrolled: window.scrollY !== y };
  });
  eq(drift.moved, false, "a rail advanced on its own");
  eq(drift.scrolled, false, "the page scrolled itself");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("the desktop home page never builds the rails", async () => {
  /* Not a style question: initMobileShopfront's guard is what stops a
     laptop fetching the sales cache and twenty product photos for three
     sections it will never show. */
  const { ctx, page, errors } = await openPage();
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => ({
    deals: document.getElementById("mobileDealsRow").children.length,
    stores: document.getElementById("mobileStoresRow").children.length,
    started: mobileShopfrontStarted,
  }));
  eq(state.started, false, "the desktop ran the phone's shopfront");
  eq(state.deals, 0, "the desktop built the deals rail");
  eq(state.stores, 0, "the desktop built the stores rail");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});


/* ==================================================================
   THE LIGHTBOX, DRIVEN.

   Sizing and positions are pinned in run-tests.mjs -- this harness
   blocks the CDN and would be measuring an unstyled page. What only a
   running page can answer: does each way out actually work, does the
   page behind come back exactly where it was, and does the back gesture
   close the overlay without carrying the shopper off the product.
   ================================================================== */
const LB_PHONE = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

/* A REAL PHOTOGRAPH, BECAUSE THE LIGHTBOX CORRECTLY REFUSES TO OPEN
   WITHOUT ONE. openImageLightbox() bails when the product image is
   hidden or has no src, and this harness stubs no retailer CDN -- so
   the first run of these checks reported "the lightbox never opened",
   which was the page being right about having no photo in it. A 320x180
   landscape PNG, built here rather than committed: landscape is the
   shape that used to overflow the frame. */
function lbPhotoPNG() {
  const W = 320, H = 180, px = Buffer.alloc(W * H * 3, 242);
  for (let y = 20; y < 160; y++) for (let x = 40; x < 280; x++) { const i = (y * W + x) * 3; px[i] = 90; px[i + 1] = 120; px[i + 2] = 200; }
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const T = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = (b) => { let c = 0xFFFFFFFF; for (const v of b) c = T[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, "ascii"), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibDeflate(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const LB_PNG = lbPhotoPNG();

/* Everything off this machine becomes that photograph; everything on it
   is served as usual, with the functions stubbed the way every other
   check stubs them. */
const LB_ROUTES = {
  "**/*": (route) => {
    const url = route.request().url();
    if (url.includes("127.0.0.1")) return route.continue();
    return route.fulfill({ status: 200, contentType: "image/png", body: LB_PNG });
  },
  "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
};

async function openLightbox(page) {
  return page.evaluate(async () => {
    goSales(); await new Promise((r) => setTimeout(r, 2400));
    openSaleProduct(0); await new Promise((r) => setTimeout(r, 2000));
    window.scrollTo(0, 420); await new Promise((r) => setTimeout(r, 300));
    const before = window.scrollY;
    openImageLightbox(); await new Promise((r) => setTimeout(r, 400));
    return { before, open: !document.getElementById("imageLightbox").classList.contains("hidden") };
  });
}

await check("every way out of the lightbox works, and puts the page back", async () => {
  const { ctx, page, errors } = await openPage(LB_ROUTES, LB_PHONE);
  await page.waitForTimeout(3000);
  const opened = await openLightbox(page);
  eq(opened.open, true, "the lightbox never opened");
  if (!opened.before) throw new Error("the page was not scrolled before opening — the restore proves nothing");

  const ways = await page.evaluate(async (before) => {
    const box = document.getElementById("imageLightbox");
    const closed = () => box.classList.contains("hidden");
    const reopen = async () => { if (closed()) { openImageLightbox(); await new Promise((r) => setTimeout(r, 350)); } };
    /* RESTORED EXACTLY means three things: the overlay gone, the body
       unpinned, and the shopper back on the same pixel they left. */
    const restored = () => closed() && !document.body.style.position && Math.abs(window.scrollY - before) < 3;
    const out = {};
    const swipe = (y0, y1) => {
      const im = document.getElementById("lightboxImg");
      const mk = (t, yy) => new TouchEvent(t, { bubbles: true, cancelable: true,
        touches: t === "touchend" ? [] : [new Touch({ identifier: 1, target: im, clientX: 196, clientY: yy })],
        changedTouches: [new Touch({ identifier: 1, target: im, clientX: 196, clientY: yy })] });
      im.dispatchEvent(mk("touchstart", y0)); im.dispatchEvent(mk("touchmove", (y0 + y1) / 2));
      im.dispatchEvent(mk("touchmove", y1)); im.dispatchEvent(mk("touchend", y1));
    };

    await reopen(); document.querySelector("[data-lightbox-close]").click();
    await new Promise((r) => setTimeout(r, 450)); out.close = restored();
    await reopen(); box.click();
    await new Promise((r) => setTimeout(r, 450)); out.backdrop = restored();
    await reopen(); swipe(200, 520);
    await new Promise((r) => setTimeout(r, 450)); out.swipeDown = restored();
    await reopen(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 450)); out.escape = restored();

    // ...and the two gestures that must NOT dismiss.
    await reopen(); document.getElementById("lightboxImg").click();
    await new Promise((r) => setTimeout(r, 250)); out.tapPhotoKeepsOpen = !closed();
    swipe(520, 200);
    await new Promise((r) => setTimeout(r, 300)); out.swipeUpKeepsOpen = !closed();
    return out;
  }, opened.before);

  for (const way of ["close", "backdrop", "swipeDown", "escape"]) {
    eq(ways[way], true, `${way} did not dismiss and restore the page behind`);
  }
  eq(ways.tapPhotoKeepsOpen, true, "tapping the photograph closed it");
  eq(ways.swipeUpKeepsOpen, true, "swiping up closed it");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("the back gesture closes the lightbox without leaving the product", async () => {
  /* BOTH HALVES OF THE REPORTED BUG. The overlay has to go, and the
     page behind must not be left pinned -- that lock outlived the
     overlay and was the "frozen" in the report. */
  const { ctx, page, errors } = await openPage(LB_ROUTES, LB_PHONE);
  await page.waitForTimeout(3000);
  await openLightbox(page);
  const after = await page.evaluate(async () => {
    const viewOf = () => [...document.querySelectorAll(".view")].filter((v) => getComputedStyle(v).display !== "none").map((v) => v.id).join();
    const before = viewOf();
    history.back();
    await new Promise((r) => setTimeout(r, 900));
    return {
      before, view: viewOf(),
      closed: document.getElementById("imageLightbox").classList.contains("hidden"),
      bodyPos: document.body.style.position,
      bodyOverflow: document.body.style.overflow,
    };
  });
  eq(after.closed, true, "the back gesture left the lightbox open");
  eq(after.view, after.before, `the back gesture carried the shopper off the product: ${after.before} → ${after.view}`);
  eq(after.bodyPos, "", "the page behind is still pinned");
  eq(after.bodyOverflow, "", "the page behind is still locked");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("zoom never takes the way out with it", async () => {
  const { ctx, page, errors } = await openPage(LB_ROUTES, LB_PHONE);
  await page.waitForTimeout(3000);
  const opened = await openLightbox(page);
  const z = await page.evaluate(async (before) => {
    const box = document.getElementById("imageLightbox");
    const dbl = () => {
      const im = document.getElementById("lightboxImg");
      const mk = (t) => new TouchEvent(t, { bubbles: true, cancelable: true,
        touches: t === "touchend" ? [] : [new Touch({ identifier: 1, target: im, clientX: 196, clientY: 300 })],
        changedTouches: [new Touch({ identifier: 1, target: im, clientX: 196, clientY: 300 })] });
      im.dispatchEvent(mk("touchstart")); im.dispatchEvent(mk("touchend"));
    };
    const tapTwice = async () => { dbl(); await new Promise((r) => setTimeout(r, 60)); dbl(); await new Promise((r) => setTimeout(r, 320)); };
    await tapTwice();
    const zoomed = box.getAttribute("data-zoom") === "1";
    /* WHAT "REACHABLE" CAN MEAN WITHOUT A STYLESHEET. This harness
       blocks the CDN, so `fixed top-4 right-4 w-11 h-11` are classes
       that do nothing and the button measures a few pixels wherever the
       flow puts it -- asserting its size or corner here measures the
       missing stylesheet, not the fix. Its size, its `fixed` and its
       z-index are pinned in run-tests.mjs, by the rules that decide
       them.

       What IS real with no CSS: zooming must not detach the button from
       the document or make it unclickable. So that is what is checked
       -- it is still in the tree, still inside the overlay, and the
       click below still lands. */
    const btn = document.querySelector("[data-lightbox-close]");
    const reachable = !!btn && box.contains(btn) && btn.isConnected;
    await tapTwice();
    const reset = box.getAttribute("data-zoom") !== "1";
    await tapTwice();   // zoom again, then leave by the button
    document.querySelector("[data-lightbox-close]").click();
    await new Promise((r) => setTimeout(r, 450));
    return { zoomed, reachable, reset,
      closedWhileZoomed: box.classList.contains("hidden"),
      zoomCleared: box.getAttribute("data-zoom") !== "1",
      restored: !document.body.style.position && Math.abs(window.scrollY - before) < 3 };
  }, opened.before);
  eq(z.zoomed, true, "a double tap did not zoom");
  eq(z.reachable, true, "zooming detached the close button from the overlay");
  eq(z.reset, true, "a second double tap did not reset the zoom");
  eq(z.closedWhileZoomed, true, "the close button did not work while zoomed");
  eq(z.zoomCleared, true, "the zoom survived the close — it would reopen zoomed");
  eq(z.restored, true, "closing from a zoom did not put the page back");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

/* ============================================================
   THE PINCH, WHICH IS A DIFFERENT ZOOM FROM THE ONE ABOVE.

   The check above drives OUR zoom -- a transform we set on the photo.
   This one drives the BROWSER'S, the one a shopper gets by pinching,
   which iOS will not let a page disable. They are not the same
   mechanism and the first fix here only ever handled the first: it
   asserted the close button was `position:fixed` and called that safe.
   Fixed is fixed to the LAYOUT viewport, and a pinch does not move the
   layout viewport -- it shrinks the VISUAL one into a window onto it.
   Measured at 393px before the fix:

     pageScale 1   visual 393x852   button at 333,16   on screen
     pageScale 2   visual 197x426   button at 333,16   OFF SCREEN
     pageScale 3   visual 131x284   button at 333,16   OFF SCREEN

   Emulation.setPageScaleFactor is how Chrome models a pinch, so it
   moves the real visualViewport and fires the real events.

   WHAT THIS CAN ASSERT WITH NO STYLESHEET. The harness blocks the CDN,
   so the button's `absolute top-4 right-4 w-11 h-11` do nothing and its
   measured box is meaningless here -- its geometry is pinned in
   run-tests.mjs by the rules that decide it. What is real without CSS
   is the arithmetic: the chrome layer's transform is computed from
   window.visualViewport, and it must TRACK a scale change on its own,
   through the listeners, with nobody calling sync by hand. That last
   part is the difference between a close button that follows the pinch
   and one that catches up after it.
   ============================================================ */
await check("the close button follows a pinch, not the layout viewport", async () => {
  const { ctx, page, errors } = await openPage(LB_ROUTES, LB_PHONE);
  await page.waitForTimeout(3000);
  const opened = await openLightbox(page);
  eq(opened.open, true, "the lightbox never opened");

  const cdp = await ctx.newCDPSession(page);
  const readings = [];
  for (const scale of [1, 2, 3]) {
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
    await page.waitForTimeout(260);   // deliberately NOT calling sync by hand
    readings.push(await page.evaluate(() => {
      const vv = window.visualViewport;
      const el = document.getElementById("lightboxChrome");
      if (!vv || !el) return { missing: true };
      const s = vv.scale || 1;
      const want = [vv.offsetLeft, vv.offsetTop, 1 / s];
      /* NUMBERS, NOT THE STRING. The browser re-serializes what we set:
         scale(0.3333333333333333) reads back as scale(0.333333), so a
         string compare fails on a third of the zoom levels for a purely
         cosmetic reason. Parse and compare with a tolerance. */
      const nums = (el.style.transform.match(/-?[\d.]+/g) || []).map(Number);
      const near = (a, b) => Math.abs(a - b) < 0.001;
      return {
        scale: +s.toFixed(2),
        tracks: nums.length === 3 && want.every((w, i) => near(nums[i], w)),
        got: el.style.transform,
        want: `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / s})`,
        // The layer carries its own pre-scale units, so the counter-scale
        // lands it exactly on the visual viewport rather than inside it.
        sized: near(parseFloat(el.style.width), vv.width * s) && near(parseFloat(el.style.height), vv.height * s),
      };
    }));
  }
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  for (const r of readings) {
    eq(!!r.missing, false, "there is no chrome layer to park on the visual viewport");
    eq(r.tracks, true, `at page scale ${r.scale} the chrome did not follow the pinch: got "${r.got}", wanted "${r.want}"`);
    eq(r.sized, true, `at page scale ${r.scale} the chrome layer is not sized in its own pre-scale units`);
  }
  // It has to actually change, or "tracks" could be passing on a no-op.
  eq(new Set(readings.map((r) => r.got)).size, readings.length, "the chrome's transform never changed across three zoom levels");

  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a pinch takes our own zoom off, so the two cannot stack", async () => {
  const { ctx, page, errors } = await openPage(LB_ROUTES, LB_PHONE);
  await page.waitForTimeout(3000);
  const opened = await openLightbox(page);
  eq(opened.open, true, "the lightbox never opened");
  const r = await page.evaluate(async () => {
    const box = document.getElementById("imageLightbox");
    setLightboxZoom(true);
    const ourZoomWasOn = box.getAttribute("data-zoom") === "1";
    /* Two fingers land on the overlay. Releasing a pinch returns the
       PAGE to scale 1; if our transform were still on, the photo would
       stay at 2.4 and read as "snapped back to zoomed-in". */
    const im = document.getElementById("lightboxImg");
    const t = (id, x) => new Touch({ identifier: id, target: im, clientX: x, clientY: 300 });
    box.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true,
      touches: [t(1, 150), t(2, 250)], changedTouches: [t(1, 150), t(2, 250)] }));
    await new Promise((r) => setTimeout(r, 120));
    return { ourZoomWasOn, ourZoomNowOff: box.getAttribute("data-zoom") !== "1",
             stillOpen: !box.classList.contains("hidden") };
  });
  eq(r.ourZoomWasOn, true, "our own zoom never turned on, so the check proves nothing");
  eq(r.ourZoomNowOff, true, "pinching on top of our zoom stacks the two — releasing snaps back to zoomed-in");
  eq(r.stillOpen, true, "a pinch closed the lightbox outright");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});


/* ==================================================================
   "TAMBIÉN TE PUEDE INTERESAR", ON THE REAL CATALOGUE.

   The selection rules are run over made-up catalogues in run-tests.mjs,
   where every edge can be constructed. What only the running page can
   answer is whether they hold against the 3,990 records actually in the
   cache, whether the rail is wired to showProduct at all, and whether a
   card opens a page that draws its own.
   ================================================================== */
async function openAProduct(page) {
  await page.evaluate(async () => {
    goSales();
    await new Promise((r) => setTimeout(r, 2500));
    openSaleProduct(0);
    await new Promise((r) => setTimeout(r, 2500));
  });
}

await check("the rail obeys its rules against the real catalogue", async () => {
  const { ctx, page, errors } = await openPage({}, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  await openAProduct(page);
  const o = await page.evaluate(() => {
    const anchor = { retailer: pendingProduct.retailer, title: document.getElementById("productViewTitle").textContent.trim(), price: Number(pendingProduct.totalUsd) };
    const lo = anchor.price * 0.5, hi = anchor.price * 1.5;
    const mine = (relatedPoolCache || []).find((i) => i.retailer === anchor.retailer && i.title === anchor.title);
    return {
      anchor, lo, hi, cap: RELATED_RAIL_MAX,
      cards: document.querySelectorAll("#relatedRailRow [data-related]").length,
      hidden: document.getElementById("relatedRail").hidden,
      picks: relatedRendered.map((p) => ({ r: p.retailer, d: p.departments || [], price: Number(p.price), title: p.title, img: !!p.image })),
      anchorDepts: mine ? mine.departments : [],
    };
  });
  eq(o.hidden, false, "the rail never appeared");
  if (!o.cards) throw new Error("the rail rendered no cards on a full catalogue");
  if (o.cards > o.cap) throw new Error(`the rail drew ${o.cards} cards, over the cap of ${o.cap}`);
  eq(o.cards, o.picks.length, "the cards and the rendered list disagree");

  for (const p of o.picks) {
    if (!(Number.isFinite(p.price) && p.price > 0)) throw new Error(`"${p.title}" reached the rail priced ${p.price}`);
    if (p.price < o.lo || p.price > o.hi) throw new Error(`"${p.title}" at $${p.price} is outside $${o.lo.toFixed(2)}–$${o.hi.toFixed(2)}`);
    if (!p.img) throw new Error(`"${p.title}" reached the rail with no photograph`);
    if (p.r === o.anchor.retailer && p.title === o.anchor.title) throw new Error("the product is recommending itself");
  }
  /* EVERY PICK EARNED ITS PLACE BY ONE OF THE TWO RULES — the same
     department, or, once the department ran short, the same store. */
  for (const p of o.picks) {
    const byDept = p.d.some((d) => o.anchorDepts.includes(d));
    if (!byDept && p.r !== o.anchor.retailer) throw new Error(`"${p.title}" is neither in the department nor from the store`);
  }
  // No product twice, however many buckets of the cache it sits in.
  const keys = o.picks.map((p) => p.r + "::" + p.title);
  eq(new Set(keys).size, keys.length, "the rail offered the same product twice");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("tapping a card opens that product, and it draws its own rail", async () => {
  const { ctx, page, errors } = await openPage({}, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  await openAProduct(page);
  const hop = await page.evaluate(async () => {
    const before = { title: document.getElementById("productViewTitle").textContent.trim(), picks: relatedRendered.map((p) => p.title) };
    const target = relatedRendered[0].title;
    document.querySelector("#relatedRailRow [data-related]").click();
    await new Promise((r) => setTimeout(r, 2600));
    return {
      before, target,
      landedOn: document.getElementById("productViewTitle").textContent.trim(),
      view: [...document.querySelectorAll(".view")].filter((v) => getComputedStyle(v).display !== "none").map((v) => v.id).join(),
      nowHidden: document.getElementById("relatedRail").hidden,
      nowCards: document.querySelectorAll("#relatedRailRow [data-related]").length,
      nowPicks: relatedRendered.map((p) => p.title),
      buyable: !document.getElementById("addToCartBtn").disabled,
    };
  });
  eq(hop.view, "productView", "a card did not open a product page");
  eq(hop.landedOn, hop.target, "the card opened a different product than it showed");
  eq(hop.nowHidden, false, "the product opened from the rail has no rail of its own");
  if (!hop.nowCards) throw new Error("the second product's rail is empty");
  /* A DIFFERENT ANCHOR MEANS A DIFFERENT RAIL. Identical lists would
     mean the rail is not being recomputed from the product in front of
     the shopper. */
  if (JSON.stringify(hop.nowPicks) === JSON.stringify(hop.before.picks)) {
    throw new Error("the second product shows exactly the rail of the first");
  }
  /* And every card on the rail is a priced product by construction, so
     the page it opens must be buyable — the no-price rule cuts the
     other way here. */
  eq(hop.buyable, true, "a rail card opened a product that cannot be bought");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("the rail does not move on its own", async () => {
  const { ctx, page, errors } = await openPage({}, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  await openAProduct(page);
  const drift = await page.evaluate(async () => {
    const row = document.getElementById("relatedRailRow");
    const before = row.scrollLeft, y = window.scrollY;
    await new Promise((r) => setTimeout(r, 5000));
    return { moved: row.scrollLeft !== before, scrolled: window.scrollY !== y };
  });
  eq(drift.moved, false, "the rail advanced on its own");
  eq(drift.scrolled, false, "the page scrolled itself");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

/* ==================================================================
   CATALOG-FIRST SEARCH, ON THE REAL CATALOGUES.

   The bug: every search fanned out to Apify, so when the account hit
   its limit "Nike" and "pantalones" both returned nothing. These drive
   the real search bar against the real committed catalogues with Apify
   answering 402 to everything -- the actual outage -- and assert the
   shopper still gets products.

   THE SCRAPE COUNTER IS THE POINT. A search that starts an Apify run is
   both the cost leak and the outage; zero is the whole fix.
   ================================================================== */
/* SPECIFIC FIRST, CATCH-ALL LAST. openPage registers these in reverse
   and Playwright gives precedence to the last route registered, so a
   catch-all written first here would swallow the 402 and this would
   test an empty response instead of a dead account. */
const DEAD_APIFY = {
  "**/.netlify/functions/apify-scrape-start**": (r) =>
    r.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: "Monthly usage hard limit exceeded" }) }),
  "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
};

await check("every search answers from the catalogue, with Apify dead", async () => {
  const { ctx, page, errors } = await openPage(DEAD_APIFY, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  let scrapes = 0;
  page.on("request", (r) => { if (r.url().includes("apify-scrape-start")) scrapes++; });
  await page.waitForTimeout(3000);   // let the catalogues land

  const out = [];
  /* THE FOURTH QUERY USED TO BE "Vitamina D3", and it had to change when
     vitamins came off the site -- there is no longer a supplement in the
     catalogue for it to find, so the check would have failed for the one
     reason that is not a regression. "toallas" replaces it because it
     tests the same thing: typed PLURAL against a SINGULAR dictionary key
     (`toalla`), translated to English before the catalogue is searched.
     Walmart's home_goods bucket is kitchen and dish towels, so a real
     match exists. */
  for (const q of ["Nike", "Nike Air Force", "pantalones", "toallas"]) {
    await page.evaluate((query) => { document.getElementById("searchInput").value = query; doSearch(); }, q);
    await page.waitForFunction((query) => typeof catalogMatch !== "undefined" && catalogMatch !== null && liveScrapeQuery === query, q, { timeout: 15000 });
    out.push(await page.evaluate(() => ({
      cards: document.querySelectorAll("#liveResultsWrap > div").length,
      exact: catalogMatch.exact,
      offered: !!document.querySelector("[data-live-search]"),
      topTitle: (searchRendered[0] && searchRendered[0].title) || "",
    })));
  }
  const [nike, af, pants, towels] = out;
  // All four return SOMETHING, instantly, which is the brief's acceptance test.
  for (let i = 0; i < out.length; i++) {
    eq(out[i].cards > 0, true, `query ${i} came back with an empty feed even though the catalogue has matches`);
    eq(out[i].offered, true, `query ${i} did not offer the live search`);
  }
  /* AND THIS ASSERTION WAS WRONG BEFORE IT WAS RIGHT. It first read
     `af.exact === 0`, from a throwaway script that walked
     department-cache.json differently from the page and saw 456 of its
     613 products. Foot Locker stocks three actual Air Force 1s, and the
     page finds them. Pin what is true: the exact matches lead, and the
     Nike partials come after rather than the feed stopping at three. */
  eq(af.exact >= 3, true, `the Air Force 1s Foot Locker stocks are not matching in full (exact ${af.exact})`);
  eq(/air force/i.test(af.topTitle), true, `an Air Force is not top of an "Air Force" search: "${af.topTitle}"`);
  eq(af.cards > af.exact, true, "the Nike partials were dropped instead of ranked below the exact matches");
  eq(nike.exact > 0, true, "no full matches for Nike");
  eq(pants.exact > 0, true, "the Spanish query found no pants in the catalogue");
  eq(towels.exact > 0, true, "toallas found no full match — the pluralised translation regressed");
  eq(scrapes, 0, `searching started ${scrapes} Apify runs — that is the cost leak and the outage`);
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("the live offer is refined, and the scan goes out with the refinement", async () => {
  const sent = [];
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/apify-scrape-start**": (r) => {
      sent.push(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: "limit" }) });
    },
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { document.getElementById("searchInput").value = "Nike Air Force"; doSearch(); });
  await page.waitForFunction(() => typeof catalogMatch !== "undefined" && catalogMatch !== null, null, { timeout: 15000 });

  const panel = await page.evaluate(() => {
    const i = document.querySelector("[data-live-refine]");
    return { prefilled: i && i.value, editable: !!i && !i.readOnly && !i.disabled,
             chips: document.querySelectorAll("[data-live-chip]").length };
  });
  eq(panel.prefilled, "Nike Air Force", "the refine box is not prefilled with what the shopper typed");
  eq(panel.editable, true, "the refine box is not editable");
  eq(panel.chips > 0, true, "there are no category chips to refine with");

  // A chip writes into the box, and writes itself back out.
  const chip = await page.evaluate(() => {
    const c = [...document.querySelectorAll("[data-live-chip]")].find((x) => x.dataset.liveChip === "shoes");
    c.click();
    const on = document.querySelector("[data-live-refine]").value;
    c.click();
    return { on, off: document.querySelector("[data-live-refine]").value };
  });
  eq(chip.on, "Nike Air Force shoes", "the chip did not write its term into the box");
  eq(chip.off, "Nike Air Force", "the chip did not take its own term back out");

  // Hand-edit, then run: the stores must be asked for the EDITED words.
  await page.evaluate(() => {
    const i = document.querySelector("[data-live-refine]");
    i.value = "Nike Air Force 1 white";
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => document.querySelector("[data-live-search]").click());
  await page.waitForFunction(() => liveSearchState !== "running", null, { timeout: 60000 });
  eq([...new Set(sent.map((s) => s.query))].join("|"), "Nike Air Force 1 white",
     "the live scan ignored the refined query");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("Aria answers from the catalogue with Apify dead, and offers the live scan", async () => {
  let scrapes = 0;
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/apify-scrape-start**": (r) => {
      scrapes++;
      return r.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: "limit" }) });
    },
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ reply: "Aquí tienes algunas opciones." }) }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { toggleAssistant(); runAssistantBrain("Aria, búscame unos tenis Nike"); });
  await page.waitForFunction(() => document.querySelector("[data-assistant-live]") ||
    document.querySelectorAll("#assistantMessages img").length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => ({
    cards: document.querySelectorAll("#assistantMessages img").length,
    offered: !!document.querySelector("[data-assistant-live]"),
    /* Her own name must not come back in the line that reads the
       request to the shopper. */
    echoesName: [...document.querySelectorAll("#assistantMessages .assistantNote")]
      .some((n) => /\baria\b/i.test(n.textContent || "")),
  }));
  eq(scrapes, 0, `answering a product question started ${scrapes} Apify runs`);
  eq(r.cards > 0, true, "Aria showed no products even though the catalogue has Nike trainers");
  eq(r.echoesName, false, "the status line reads her own name back as part of the request");
  /* THE OFFER IS NOT ASSERTED HERE ANY MORE, and that is the category
     work showing. "tenis Nike" used to find nothing that matched every
     word, so the thin-results gate always opened; now it finds real
     footwear, so withholding the offer is correct. The offer is proved
     below, on a question the catalogue genuinely cannot answer. */

  /* A question the catalogue cannot answer: THIS is when the offer is
     owed, and it is the only time it should appear. */
  await page.evaluate(() => runAssistantBrain("busco un didgeridoo de bambú"));
  await page.waitForFunction(() => document.querySelector("[data-assistant-live]"), null, { timeout: 20000 });
  eq(await page.evaluate(() => !!document.querySelector("[data-assistant-live]")), true,
     "the chat never offers the live search, even with nothing to show");

  // Tapping it is what spends the money, and the cards stay whatever happens.
  const before = r.cards;
  await page.evaluate(() => document.querySelector("[data-assistant-live]").click());
  await page.waitForTimeout(3500);
  eq(scrapes > 0, true, "tapping the offer did not start a live search");
  eq(await page.evaluate(() => document.querySelectorAll("#assistantMessages img").length) >= before, true,
     "the failed live search took the catalogue cards with it");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a shoe query reaches Foot Locker, whose titles never say shoes", async () => {
  /* THE RULE THAT ONLY THE REAL PAGE CAN PROVE. In the pure slice
     sizeCategoryFor does not exist, so the Foot Locker branch of
     catalogItemCategory is unexercised there. Here it is loaded, and
     the catalogues are the committed ones.

     Before: "zapatos" -> "shoes" matched 30 items, every one of them
     Walmart, because no Foot Locker title contains the word -- they
     read "Jordan Retro 4 - Boys' Grade School". */
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);

  const r = await page.evaluate(async () => {
    const pool = await relatedPool();
    const shoes = rankCatalogMatches(pool, "shoes", { limit: 200 });
    const kids = rankCatalogMatches(pool, "shoes boys", { limit: 40 });
    const stores = new Set(shoes.items.map((i) => i.retailer));
    return {
      total: shoes.exact,
      hasFootLocker: stores.has("footlocker"),
      // Nothing outside the category may appear at all.
      strays: kids.items.filter((i) => catalogItemCategory(i) !== "footwear").map((i) => i.title).slice(0, 3),
      kidsTop: (kids.items[0] || {}).title || "",
      // The trouser cuts must not be in here.
      bootcuts: shoes.items.filter((i) => /boot[-\s]?(cut|leg)/i.test(i.title)).map((i) => i.title).slice(0, 3),
    };
  });
  eq(r.hasFootLocker, true, "a shoe query still cannot reach Foot Locker's inventory");
  eq(r.total > 100, true, `a shoe query matched only ${r.total} items`);
  eq(r.strays.length, 0, `cross-category noise came back: ${JSON.stringify(r.strays)}`);
  eq(r.bootcuts.length, 0, `bootcut trousers are being returned as shoes: ${JSON.stringify(r.bootcuts)}`);
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a dead live search keeps the catalogue results on screen", async () => {
  const { ctx, page, errors } = await openPage(DEAD_APIFY, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { document.getElementById("searchInput").value = "Nike Air Force"; doSearch(); });
  await page.waitForFunction(() => typeof catalogMatch !== "undefined" && catalogMatch !== null, null, { timeout: 15000 });
  const before = await page.evaluate(() => document.querySelectorAll("#liveResultsWrap > div").length);
  eq(before > 0, true, "the catalogue pass returned nothing to protect");

  /* DISPATCHED, NOT AIMED. This harness blocks the CDN, so there is no
     grid and no stacking -- product cards sit on top of the button and
     a real mouse click lands on a card. Where the control sits on a
     styled page is a layout question, pinned in run-tests.mjs; what
     this check is about is what the control DOES. */
  await page.evaluate(() => document.querySelector("[data-live-search]").click());
  await page.waitForFunction(() => liveSearchState !== "running", null, { timeout: 60000 });
  const after = await page.evaluate(() => ({
    state: liveSearchState,
    cards: document.querySelectorAll("#liveResultsWrap > div").length,
    text: (document.getElementById("searchLiveWrap").textContent || "").replace(/\s+/g, " ").trim(),
    retry: !!document.querySelector("#searchLiveWrap button"),
  }));
  eq(after.state, "unavailable", "every store refused and the page did not say so");
  eq(after.text.includes("La búsqueda en vivo no está disponible en este momento."), true,
     `the honest message is gone: "${after.text.slice(0, 80)}"`);
  /* THE "NEVER A DEAD-END PAGE" RULE, MEASURED. Not "some results are
     left" -- the SAME number, because the live scan may only ever add. */
  eq(after.cards, before, `the failure took ${before - after.cards} catalogue results down with it`);
  eq(after.retry, true, "there is no way to try the live search again");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("a live search that works adds to the catalogue, never replaces it", async () => {
  let runId = 0;
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/apify-scrape-start**": (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ retailer: "walmart", runId: `run${++runId}` }) }),
    "**/.netlify/functions/apify-scrape-status**": (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        status: "SUCCEEDED",
        items: [{ title: "Live-only Air Force sample", price: 110, image: "", weightKg: 0.9 }],
      }) }),
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { document.getElementById("searchInput").value = "Nike Air Force"; doSearch(); });
  await page.waitForFunction(() => typeof catalogMatch !== "undefined" && catalogMatch !== null, null, { timeout: 15000 });
  const before = await page.evaluate(() => searchResults.length);

  /* DISPATCHED, NOT AIMED. This harness blocks the CDN, so there is no
     grid and no stacking -- product cards sit on top of the button and
     a real mouse click lands on a card. Where the control sits on a
     styled page is a layout question, pinned in run-tests.mjs; what
     this check is about is what the control DOES. */
  await page.evaluate(() => document.querySelector("[data-live-search]").click());
  await page.waitForFunction(() => liveSearchState !== "running", null, { timeout: 60000 });
  const after = await page.evaluate(() => ({
    state: liveSearchState,
    total: searchResults.length,
    hasLive: searchResults.some((p) => /Live-only Air Force sample/i.test(p.title || "")),
  }));
  eq(after.state, "done", "a successful live scan did not settle as done");
  eq(after.hasLive, true, "the live result the stores returned is not in the feed");
  eq(after.total > before, true, `the live scan replaced the catalogue instead of adding to it (${before} -> ${after.total})`);
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

/* ==================================================================
   VITAMINS ARE OFF THE SITE, AND THE GATE IS ON THE DATA.

   run-tests.mjs proves the committed catalogues are clean and the maps
   are empty. That is the state today. THIS proves the rule holds when
   the state is wrong: it serves the page a department-cache.json with a
   pharmacy bucket in it -- a stale CDN copy, a re-run scrape, a file
   someone restores -- and asserts a shopper still cannot reach the
   product from any surface.

   Ofertas is the one that would have leaked. It is
   { anyCategory: true, onSaleOnly: true }, and itemBelongsToDepartment()
   returns on onSaleOnly before it ever looks at BUCKET_SPEC, so the
   discounted multivitamin below would have sat in the deals feed with
   every table row deleted.
   ================================================================== */
await check("a pharmacy bucket in the cache reaches no surface of the site", async () => {
  const POISONED = {
    generatedAt: "2026-09-24T00:00:00.000Z",
    retailers: {
      walmart: {
        label: "Walmart",
        departments: {
          home_goods: { label: "Home Goods", items: [
            { title: "Mainstays Kitchen Towel Set, 4 Pack", price: 9.99, regularPrice: 14.99,
              image: "https://example.invalid/towel.jpg", url: "https://www.walmart.com/ip/1" },
          ] },
          /* On sale, so Ofertas would take it on discount alone. */
          pharmacy: { label: "Pharmacy & Health", items: [
            { title: "Nature Made Extra Strength Vitamin D3 5000 IU Softgels", price: 9.99, regularPrice: 19.99,
              image: "https://example.invalid/d3.jpg", url: "https://www.walmart.com/ip/2" },
            { title: "OLLY Women's Multivitamin Gummies - Berry - 90ct", price: 12.99, regularPrice: 24.99,
              image: "https://example.invalid/olly.jpg", url: "https://www.walmart.com/ip/3" },
          ] },
        },
      },
    },
  };
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    "**/department-cache.json": (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(POISONED) }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);

  const seen = await page.evaluate(async () => {
    const cache = await loadDepartmentCache();
    const walmart = cache.retailers.walmart;
    const titlesIn = (items) => items.map((i) => i.title || i.name || "");
    const pool = await relatedPool();
    return {
      // the bucket itself never survives the load boundary
      buckets: Object.keys(walmart.departments || {}),
      // the towel did, so this is not an empty-cache false pass
      homeGoods: titlesIn(walmart.departments.home_goods?.items || []).length,
      // every surface that walks the buckets directly
      poolTitles: pool.map((i) => i.title),
      everything: titlesIn(retailerItemsFor(walmart)),
      ofertas: titlesIn(departmentItemsFor(walmart, "department", "sale")),
      tiles: collectTiles().map((t) => t.key),
      labels: collectTiles().map((t) => t.label),
    };
  });

  /* THE PROBE NAMES THE TWO PRODUCTS IT INJECTED, and nothing looser.
     A word-match on /vitamin|olly/ caught "H-olly-wood Blouson Jacket"
     and a foundation whose name mentions Vitamin C as an INGREDIENT --
     three false positives out of the real catalogue, which would have
     failed this check for the one reason that is not a leak. What is
     being proved is that these exact two rows never arrive. */
  const POISON = POISONED.retailers.walmart.departments.pharmacy.items.map((i) => i.title);
  const VITAMIN = new RegExp(POISON.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  eq(seen.buckets.includes("pharmacy"), false, `the pharmacy bucket survived the load boundary: ${seen.buckets.join()}`);
  eq(seen.homeGoods, 1, "the rest of the cache did not load — this check would pass on an empty page");
  eq(seen.everything.filter((t) => VITAMIN.test(t)).join(" | "), "", "a supplement is still in the retailer's stock");
  eq(seen.ofertas.filter((t) => VITAMIN.test(t)).join(" | "), "", "a discounted supplement reached the Ofertas feed");
  eq(seen.poolTitles.filter((t) => VITAMIN.test(t)).join(" | "), "", "a supplement is in the pool that feeds search and the related rail");
  eq(seen.tiles.includes("pharmacy"), false, "a pharmacy tile was drawn");
  eq(seen.labels.some((l) => /farmacia|salud/i.test(l)), false, `a Salud y Farmacia tile was drawn: ${seen.labels.join()}`);

  /* And the search bar itself, driven the way a shopper drives it. */
  const searched = await page.evaluate(async () => {
    document.getElementById("searchInput").value = "vitaminas";
    doSearch();
    await new Promise((r) => setTimeout(r, 2500));
    return (typeof searchRendered !== "undefined" ? searchRendered : []).map((i) => i.title);
  });
  eq(searched.filter((t) => VITAMIN.test(t)).join(" | "), "", "searching for vitaminas surfaced one from the cache");

  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

/* ==================================================================
   CURVY, DRIVEN THE WAY A SHOPPER DRIVES IT.

   run-tests.mjs proves the rule in isolation. This proves the page: it
   opens the real section over the real catalogue and asserts that every
   card on it carries a size the store published, that the run is printed
   where she can read it before tapping, and that the thin state is
   honest rather than an empty grid.
   ================================================================== */
await check("Curvy lists only garments with a published extended size, and shows the run", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);

  const r = await page.evaluate(async () => {
    openCatalog("department", "curvy");
    await new Promise((res) => setTimeout(res, 2500));
    const sections = document.getElementById("catalogSections");
    const cache = await loadDepartmentCache();
    const listed = [];
    for (const [retailer, data] of Object.entries(cache.retailers)) {
      for (const it of departmentItemsFor(data, "department", "curvy")) {
        listed.push({ retailer, name: it.name || it.title || it.productName || "", sizes: it.availableSizes || null });
      }
    }
    return {
      title: (document.getElementById("catalogTitle") || {}).textContent,
      notice: (document.getElementById("catalogNotice") || {}).textContent.replace(/\s+/g, " ").trim(),
      listed,
      retailers: [...new Set(listed.map((l) => l.retailer))],
      /* NOT querySelectorAll('[onclick*="showProduct"]') -- a card wires
         that handler three times (photo, title, Comprar), so counting
         them says 54 for 18 products and the comparison below is
         nonsense. The size-run chip is the honest unit. */
      cards: sections.querySelectorAll('[onclick*="showProduct"]').length,
      runsShown: (sections.innerHTML.match(/Tallas:/g) || []).length,
      tileKeys: collectTiles().map((t) => t.key),
      tileLabels: collectTiles().map((t) => t.label),
    };
  });

  eq(r.title, "Curvy", "the destination is not titled Curvy");
  eq(r.tileKeys.includes("curvy"), true, "there is no Curvy tile");
  eq(r.tileKeys.includes("pharmacy"), false, "pharmacy is back in the slot Curvy took");

  /* EVERY listed garment carries a size the retailer published. Not a
     sample -- all of them, because one that does not is the promise this
     section cannot break. */
  const EXT = /^(xxl|2xl|xxxl|3xl|xxxxl|4xl|xxxxxl|5xl|[1-6]x)$/i;
  if (!r.listed.length) throw new Error("Curvy listed nothing at all — the filter is reading the wrong field");
  for (const it of r.listed) {
    if (!Array.isArray(it.sizes) || !it.sizes.length) {
      throw new Error(`"${it.name}" is on Curvy with no published size list at all`);
    }
    if (!it.sizes.some((sz) => EXT.test(String(sz).trim()))) {
      throw new Error(`"${it.name}" is on Curvy with only ${it.sizes.join("/")}`);
    }
  }

  /* The run is printed on every card, because two colourways of the same
     shirt are told apart by nothing else -- one Poplin Shirt stops at
     XXL and another goes to XXXXL. */
  eq(r.runsShown, r.listed.length,
     `${r.listed.length} garments listed but ${r.runsShown} size runs — a card is not saying what it fits`);
  eq(r.cards, r.listed.length * 3, "a card no longer wires its three open handlers — recount the runs");

  /* Thin today, and the page says so in its own voice. */
  if (r.listed.length < 24 && !/Pr[óo]ximamente/.test(r.notice)) {
    throw new Error("the section is thin and does not say so");
  }
  if (!/No estimamos ni completamos tallas/.test(r.notice)) {
    throw new Error("the never-invent rule is not stated on the page");
  }
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await check("the Belleza destination leads with its photograph, then the fragrance limit", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  }, { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    openCatalog("department", "beauty");
    await new Promise((res) => setTimeout(res, 2000));
    const notice = document.getElementById("catalogNotice");
    const banner = notice.querySelector(".ariaBeautyBanner");
    const img = banner && banner.querySelector("img");
    const cs = banner ? getComputedStyle(banner) : null;
    return {
      hasBanner: !!banner,
      src: img && img.getAttribute("src"),
      alt: img && img.getAttribute("alt"),
      lazy: img && img.getAttribute("loading"),
      /* THE CONTAINING BLOCK, not the class. This suite blocks Tailwind
         on purpose; an absolutely-positioned photo whose positioned
         ancestor came from a utility would escape and cover the page. */
      position: cs && cs.position,
      overflow: cs && cs.overflowX,
      bannerFirst: banner && notice.firstElementChild === banner,
      warningStillThere: /M[áa]ximo \d+ perfumes por env[íi]o/.test(notice.textContent),
      /* MEASURED ON THE BANNER, NOT THE PAGE. This suite blocks Tailwind
         on purpose, so the document already runs ~540px wide before this
         element exists -- every unstyled logo renders at its natural
         658px. A document-level assertion here would fail for a reason
         that has nothing to do with the banner. What must be true is
         that the 1920px photograph stays inside the box. */
      bannerPastViewport: banner
        ? Math.round(banner.getBoundingClientRect().right - document.documentElement.clientWidth) : null,
      photoEscaped: banner && img
        ? Math.round(img.getBoundingClientRect().width) > Math.round(banner.getBoundingClientRect().width) + 1 : null,
    };
  });
  eq(r.hasBanner, true, "the Belleza banner is gone");
  eq(r.src, "assets/sections/beauty-banner.jpg", "the banner points somewhere else");
  eq(r.alt, "", "the banner is announced as well as drawn");
  eq(r.lazy, "lazy", "the banner is not lazy-loaded");
  eq(r.position, "relative", "the banner stops establishing a containing block without Tailwind");
  eq(r.overflow, "hidden", "the banner no longer clips its photograph");
  eq(r.bannerFirst, true, "the photograph is no longer the first thing on the page");
  eq(r.warningStillThere, true, "the four-per-shipment warning was pushed out by the photograph");
  eq(r.bannerPastViewport <= 0, true, `the banner runs ${r.bannerPastViewport}px past the viewport`);
  eq(r.photoEscaped, false, "the 1920px photograph is wider than the box that is meant to clip it");
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  await ctx.close();
});

await browser.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);
