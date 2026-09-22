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

await check("Aria Auto filters on fitment, and never shows a maybe", async () => {
  const { ctx, page, errors } = await openPage({
    "**/.netlify/functions/**": (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  });
  if (errors.length) throw new Error(errors.join(" | "));

  const r = await page.evaluate(() => {
    const vehicle = { year: "2020", make: "Hyundai", model: "Sonata" };
    // Exactly the payload shape the cache holds today: VEHICLE_SPECIFIC
    // and nothing else. This is the live bug.
    const noFitment = [{ title: "Duralast Ceramic Brake Pads D2076", price: 43.99,
      raw: { vehicle_fitment: "VEHICLE_SPECIFIC", specs: { "Pad Type": "Ceramic" } } }];
    // …and the shape the detail scrape returns.
    const withFitment = [
      { title: "Duralast Ceramic Brake Pads D2076", price: 43.99,
        raw: { specs: { Fits: "Hyundai Sonata, Hyundai Tucson, Kia K5 2020-2024" }, location: "Front" } },
      { title: "Wrong Pads For Another Car", price: 21.5,
        raw: { specs: { Fits: "Honda Civic 2016-2021" } } },
    ];
    /* selectedVehicle is a top-level `let`, not a window property, so
       assigning window.selectedVehicle would silently do nothing. Drive
       the page's own selectors instead — which also exercises the real
       path a shopper takes. */
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

    const gap = renderAutoPartBlock("AutoZone", { ok: true, items: noFitment }, "pastillas de freno", "autozone");
    const good = renderAutoPartBlock("AutoZone", { ok: true, items: withFitment }, "pastillas de freno", "autozone");
    return {
      gapIsEmptyState: /No tenemos datos de calce/.test(gap),
      gapShowsProducts: /Duralast/.test(gap),
      goodShowsConfirmed: /Compatible con tu/.test(good),
      goodShowsWrongCar: /Wrong Pads/.test(good),
      anyMaybe: /Verifica el calce|verifícalo antes de pedir/.test(gap + good),
    };
  });
  eq(r.gapIsEmptyState, true, "no fitment data must give the honest empty state");
  eq(r.gapShowsProducts, false, "unfiltered keyword results must never be shown");
  eq(r.goodShowsConfirmed, true, "a confirmed part gets the green badge");
  eq(r.goodShowsWrongCar, false, "a part whose list names another car is excluded");
  eq(r.anyMaybe, false, "the banned middle ground is rendered nowhere");
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
      out[key] = { kg, badge: /Flete alto/.test(card), shown: /0\.68 kg|1\.08 kg/.test(card) };
    }
    return out;
  });
  for (const [key, v] of Object.entries(r)) {
    if (v.kg >= 0.4) throw new Error(`${key} still estimates ${v.kg} kg`);
    eq(v.badge, false, `${key} still wears a manufactured Flete alto`);
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

await browser.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log(`  FAIL  ${f}\n`);
process.exit(failures.length ? 1 : 0);
