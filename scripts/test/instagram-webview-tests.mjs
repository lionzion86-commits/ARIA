/* ==================================================================
   THE INSTAGRAM PATH: VOICE TO RESULTS, NO PAGE RESET
   (#443 P0 c.6692638975, live tester, Nov 6).

   A shopper in Instagram's in-app browser on an iPhone (4G, battery
   ~20%) asked Aria by voice for "MacBooks rosadas". She asked for a
   budget, heard the answer, asked for it AGAIN, and then the whole page
   reloaded before a single card rendered. Launch traffic (Nov 18) comes
   in through exactly this path.

   The cause: the call's warm-up and every catalogue tool loaded the
   whole catalogue into the page (80 files, ~296 MB of JSON, 169k
   products, ~457 MB of live heap after GC) -- far past what iOS lets a
   WebView keep, and Instagram reloads a killed page. Plus three ways
   the budget answer was lost: a digits-only transcript ("5000.") was
   deleted as noise, a failed exchange-rate fetch was never retried, and
   the tool then told her to ask for the ceiling again.

   This suite opens the home page as that WebView does -- 390 px, an
   Instagram iOS user agent, storage that throws, no microphone, no
   AudioContext -- with the chat, voice and search endpoints stubbed, and
   walks both the voice and the typed conversation to rendered results:
     - the main frame never navigates and a window marker survives;
     - no catalogue file is ever requested;
     - results render in place, inside the chat, under her budget;
     - the budget question is asked once, and the answer is remembered.

   RUNNING IT (a static server on the repo root, as browser-tests.mjs)
     python3 -m http.server 8899 --bind 127.0.0.1 &
     node scripts/test/instagram-webview-tests.mjs
   ARIA_BASE_URL and PLAYWRIGHT_CHROMIUM work as in browser-tests.mjs.
   ================================================================== */
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.ARIA_BASE_URL || "http://127.0.0.1:8899";
const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

/* Instagram's in-app browser on iOS, as it identifies itself. */
const INSTAGRAM_IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.25.104 (iPhone14,5; iOS 17_6; es_PE; es; scale=3.00; 1170x2532; 642389562)";
const BUDGET_PEN = 5000;
const FX = 3.75;
/* What the search server answers for a pink MacBook: one under the
   S/ 5000 ceiling, one over it, and one without a photo (never a card). */
const SEARCH_ITEMS = [
  /* A real Best Buy record (bestbuy-catalog.json), so the tapped card
     resolves on producto.html from its own PDP shard. */
  { id: "m1", title: 'Apple - MacBook Air 15" Laptop - M2 chip Built for Apple Intelligence - 8GB Memory - 256GB SSD - Starlight', brand: "Apple", store: "bestbuy", storeLabel: "Best Buy",
    usd: 1099.99, pen: Math.round(1099.99 * FX * 100) / 100, wasUsd: 1299.99, wasPen: Math.round(1299.99 * FX * 100) / 100,
    image: "/aria-icon-512.png", category: "laptops" },
  { id: "m2", title: "Apple MacBook Pro 16-inch M3 Max - Pink Edition", brand: "Apple", store: "bestbuy", storeLabel: "Best Buy",
    usd: 3499.99, pen: Math.round(3499.99 * FX * 100) / 100, wasUsd: null, wasPen: null,
    image: "/aria-icon-512.png", category: "laptops" },
  { id: "m3", title: "Apple MacBook Air Pink Hard Shell Case", brand: "Apple", store: "bestbuy", storeLabel: "Best Buy",
    usd: 19.99, pen: Math.round(19.99 * FX * 100) / 100, wasUsd: null, wasPen: null, image: "", category: "accesorios" },
];
const BUDGET_Q = "Perfecto, vamos a buscar MacBooks rosadas. Una pregunta rápida: ¿tienes algún presupuesto en soles para guiar la búsqueda?";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

/* The page as Instagram's WebView gives it to us. */
async function openInstagramWebView() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: INSTAGRAM_IOS_UA, locale: "es-PE",
  });
  await ctx.addInitScript(() => {
    /* Storage that throws, as a WebView with blocked site data does. */
    for (const name of ["localStorage", "sessionStorage"]) {
      try {
        Object.defineProperty(window, name, { configurable: true,
          get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
      } catch (e) {}
    }
    /* No microphone: the permission is refused. */
    try {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, get() { return {
        getUserMedia: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
        enumerateDevices: async () => [],
        addEventListener() {}, removeEventListener() {},
      }; } });
    } catch (e) {}
    /* No audio engine either. */
    const NoAudio = function () { throw new DOMException("AudioContext is not available", "NotSupportedError"); };
    try { window.AudioContext = NoAudio; window.webkitAudioContext = NoAudio; } catch (e) {}
  });
  const page = await ctx.newPage();
  const errors = [];
  const navigations = [];
  const catalogueRequests = [];
  const searchQueries = [];
  const agentCalls = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    const u = r.url();
    if (/\/[a-z0-9-]*-catalog\.json(?:\?|$)|\/department-cache[a-z0-9-]*\.json(?:\?|$)|\/ofertas-feed\.json(?:\?|$)/.test(u)) catalogueRequests.push(u);
  });
  await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
  await page.route("**/.netlify/functions/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const fn = url.pathname.replace(/^\/\.netlify\/functions\//, "");
    if (fn === "search") {
      if (url.searchParams.get("warm")) return route.fulfill({ status: 204, body: "" });
      const q = url.searchParams.get("q") || "";
      searchQueries.push(q);
      const items = /mac\s?book|laptop|rosad|pink|apple|oferta/i.test(q) ? SEARCH_ITEMS : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        q, state: items.length ? "results" : "none", page: 1, pageSize: 48, pages: 1, total: items.length, fx: FX, items }) });
    }
    if (fn === "exchange-rate") {
      /* The 4G hiccup: the site's own rate endpoint does not answer. */
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "sin conexión" }) });
    }
    if (fn === "aria-chat-agent") {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch (e) {}
      agentCalls.push(body);
      const msg = String(body.message || "");
      const turns = Array.isArray(body.turns) ? body.turns : [];
      if (/macbook/i.test(msg) && !/\d/.test(msg))
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: BUDGET_Q }) });
      if (/\d/.test(msg) && !turns.length)
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tool_calls: [{ id: "t1", name: "search_products",
          arguments: JSON.stringify({ query: "MacBook rosada", max_price_pen: BUDGET_PEN, limit: 4 }) }] }) });
      if (turns.length) {
        const tool = turns.find((t) => t.role === "tool");
        let ids = [];
        try { ids = (JSON.parse(tool.content).results || []).map((r) => r.id); } catch (e) {}
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
          reply: "Entendido, buscamos bajo S/ " + BUDGET_PEN + ". Esta MacBook rosada entra en tu tope.", show: ids }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "¿Qué estás buscando hoy?" }) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  /* From here on, the main frame must not go anywhere. */
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
  await page.evaluate(() => { window.__ariaNoReset = "marcado-" + Math.random().toString(36).slice(2); });
  const marker = await page.evaluate(() => window.__ariaNoReset);
  const stillSamePage = async () => {
    assert.deepEqual(navigations, [], "the main frame navigated: " + navigations.join(" | "));
    assert.equal(await page.evaluate(() => window.__ariaNoReset), marker, "the page was reloaded: the window marker is gone");
  };
  const column = () => page.evaluate(() => [...document.querySelectorAll("#assistantMessages > *")].map((el) => ({
    who: el.classList.contains("ml-auto") ? "user" : el.tagName === "BUTTON" ? "card" : el.classList.contains("assistantNote") ? "note" : "bot",
    text: el.innerText.replace(/\s+/g, " ").trim(),
  })));
  /* Live JS heap after a GC, in MB, of whatever document the tab holds now. */
  const heapMB = async () => {
    const s = await ctx.newCDPSession(page);
    try { await s.send("HeapProfiler.collectGarbage"); return Math.round((await s.send("Runtime.getHeapUsage")).usedSize / 1e6); }
    finally { await s.detach().catch(() => {}); }
  };
  return { ctx, page, errors, navigations, catalogueRequests, searchQueries, agentCalls, stillSamePage, column, heapMB };
}

const askedBudget = (t) => /presupuesto|tope/i.test(t) && /\?/.test(t);

/* ------------------------------------------------------------------ */

const W = await openInstagramWebView();

await check("the WebView is what we say it is: Instagram UA, 390 px, storage throws, no mic, no AudioContext", async () => {
  const env = await W.page.evaluate(async () => {
    let ls = "ok", ss = "ok", mic = "ok", ac = "ok";
    try { localStorage.getItem("x"); } catch (e) { ls = e.name; }
    try { sessionStorage.getItem("x"); } catch (e) { ss = e.name; }
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { mic = e.name; }
    try { new AudioContext(); } catch (e) { ac = e.name; }
    return { ua: navigator.userAgent, w: innerWidth, ls, ss, mic, ac, low: ariaLowMemoryBrowser() };
  });
  assert.match(env.ua, /Instagram/);
  assert.equal(env.w, 390);
  assert.equal(env.ls, "SecurityError");
  assert.equal(env.ss, "SecurityError");
  assert.equal(env.mic, "NotAllowedError");
  assert.equal(env.ac, "NotSupportedError");
  assert.equal(env.low, true, "the Instagram WebView is not treated as a light browser");
});

await check("the home page boots in that WebView with no script error", async () => {
  assert.deepEqual(W.errors, [], "page errors: " + W.errors.join(" | "));
  await W.stillSamePage();
});

await check("tapping the mic with the microphone refused: an error in place, no reload, no catalogue", async () => {
  await W.page.evaluate(() => { if (!assistantOpen) toggleAssistant(); });
  await W.page.evaluate(() => toggleAriaVoice().catch(() => {}));
  await W.page.waitForTimeout(2500);
  const live = await W.page.evaluate(() => !!ariaRT);
  assert.equal(live, false, "a call went live without a microphone");
  assert.deepEqual(W.errors, [], "page errors: " + W.errors.join(" | "));
  assert.deepEqual(W.catalogueRequests, [], "the mic tap fetched catalogue files: " + W.catalogueRequests.slice(0, 5).join(", "));
  await W.stillSamePage();
});

await check("a call's warm-up on this phone pings the search server and never loads the catalogue", async () => {
  const before = W.catalogueRequests.length;
  const warm = W.page.waitForRequest((r) => /\/\.netlify\/functions\/search\?warm=1/.test(r.url()), { timeout: 5000 });
  warm.catch(() => {}); /* awaited below; never an unhandled rejection if the step before throws */
  await W.page.evaluate(() => ariaWarmVoiceCatalogue());
  await warm;
  await W.page.waitForTimeout(1500);
  assert.equal(W.catalogueRequests.length, before, "the warm-up fetched catalogue files: " + W.catalogueRequests.slice(before, before + 5).join(", "));
  assert.equal(await W.page.evaluate(() => relatedPoolCache === null && progressivePool.length === 0), true, "the full pool was built");
});

/* THE VOICE PATH. The Realtime transport (WebRTC) cannot run headless,
   so the page's own event handler is fed the events the server sends,
   in the order the tester's call produced them; everything after the
   wire -- the noise filter, the history, the tool, the cards -- is the
   page's real code. */
await check("VOICE: «MacBooks rosadas» -> budget asked once -> «5000.» kept -> cards render in place under S/ 5000", async () => {
  await W.page.evaluate(() => {
    window.__sent = [];
    const send = (m) => { window.__sent.push(m); return true; };
    window.__send = send;
    ariaRT = { pc: { close() {} }, dc: { close() {} }, mic: null, sink: null, send, get turn() { return null; } };
    ariaRTResponding = false;
    ariaRTTranscribes = false;
    ariaChatHistory = [];
    document.getElementById("assistantMessages").innerHTML = "";
  });
  const ev = (e) => W.page.evaluate((e) => onRealtimeEvent(e, null, window.__send), e);
  await ev({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Quiero MacBooks rosadas" });
  await ev({ type: "response.done", response: { id: "r1", status: "completed" } });
  await ev({ type: "response.output_audio_transcript.done", response_id: "r1", transcript: BUDGET_Q });
  /* Her answer, as the transcriber writes a spoken number. */
  await ev({ type: "conversation.item.input_audio_transcription.completed", item_id: "u2", transcript: "5000." });
  await ev({ type: "response.done", response: { id: "r2", status: "completed" } });
  const afterAnswer = await W.page.evaluate(() => ({ sent: window.__sent.map((m) => m.type + (m.item_id ? ":" + m.item_id : "")),
    history: ariaChatHistory.map((m) => m.role + ": " + m.content) }));
  assert.ok(!afterAnswer.sent.includes("conversation.item.delete:u2"), "her budget answer was deleted from the conversation as noise");
  assert.ok(afterAnswer.history.includes("user: 5000."), "the budget answer is not in the history: " + afterAnswer.history.join(" | "));
  assert.equal(afterAnswer.sent.filter((t) => t === "response.create").length, 2, "both of his turns must be answered: " + afterAnswer.sent.join(", "));
  /* The model searches with his ceiling. */
  await ev({ type: "response.function_call_arguments.done", call_id: "c1", name: "search_products",
    arguments: JSON.stringify({ query: "MacBook rosada", max_price_pen: BUDGET_PEN, limit: 4 }) });
  const out = await W.page.evaluate(() => {
    const o = window.__sent.find((m) => m.type === "conversation.item.create" && m.item && m.item.type === "function_call_output");
    return o ? JSON.parse(o.item.output) : null;
  });
  assert.ok(out, "the tool never answered the model");
  assert.ok(!out.unavailable, "the tool asked for the budget again / failed: " + JSON.stringify(out));
  assert.equal((out.products || []).length, 1, "the budget filter is wrong: " + JSON.stringify(out.products));
  assert.match(out.products[0].title, /MacBook Air 15" Laptop - M2/);
  assert.equal(out.budget_pen, BUDGET_PEN, "the tool does not say back the ceiling it applied");
  const col = await W.column();
  const cards = col.filter((m) => m.who === "card");
  assert.equal(cards.length, 1, "results did not render in place: " + JSON.stringify(col));
  assert.match(cards[0].text, /MacBook Air/);
  const asks = col.filter((m) => m.who === "bot" && askedBudget(m.text));
  assert.equal(asks.length, 1, "the budget was asked " + asks.length + " times");
  assert.ok(W.searchQueries.some((q) => /macbook/i.test(q)), "the search server was never asked");
  assert.deepEqual(W.catalogueRequests, [], "the voice search fetched catalogue files: " + W.catalogueRequests.slice(0, 5).join(", "));
  assert.deepEqual(W.errors, [], "page errors: " + W.errors.join(" | "));
  await W.stillSamePage();
  /* The fake call ends here: its timers go with it, as a real hang-up does. */
  await W.page.evaluate(() => { try { clearRealtimeIdleTimers(); } catch (e) {} ariaRT = null; ariaRTResponding = false; assistantThinking = false; });
});

await check("TYPED (the mic refused): «MacBooks rosadas» -> budget once -> «5000 soles» -> results in place, history threaded", async () => {
  await W.page.evaluate(() => { ariaChatHistory = []; document.getElementById("assistantMessages").innerHTML = ""; });
  const send = async (text) => { await W.page.fill("#assistantInput", text); await W.page.evaluate(() => sendAssistantText()); };
  const waitFor = async (pred, ms = 15000) => {
    for (let t = 0; t < ms; t += 250) { if (pred(await W.column())) return true; await W.page.waitForTimeout(250); }
    return false;
  };
  await send("MacBooks rosadas");
  assert.ok(await waitFor((c) => c.some((m) => m.who === "bot" && askedBudget(m.text))), "she never asked the budget: " + JSON.stringify(await W.column()));
  await send(BUDGET_PEN + " soles");
  assert.ok(await waitFor((c) => c.some((m) => m.who === "card")), "no results rendered: " + JSON.stringify(await W.column()));
  await W.page.waitForTimeout(500);
  const col = await W.column();
  const asks = col.filter((m) => m.who === "bot" && askedBudget(m.text));
  assert.equal(asks.length, 1, "the budget was asked " + asks.length + " times: " + JSON.stringify(col));
  const cards = col.filter((m) => m.who === "card");
  assert.equal(cards.length, 1, "the over-budget or photo-less product was shown: " + JSON.stringify(cards));
  /* The answer travelled with the conversation: the second turn's request
     carries the first question and her budget question, with storage blocked. */
  const second = W.agentCalls.find((b) => /\d/.test(String(b.message || "")));
  assert.ok(second, "the budget answer never reached her");
  const hist = JSON.stringify(second.history || []);
  assert.match(hist, /MacBooks rosadas/, "the first question was lost between turns");
  assert.match(hist, /presupuesto/, "her budget question was lost between turns");
  const tool = (W.agentCalls.find((b) => (b.turns || []).length) || {}).turns || [];
  const result = JSON.parse((tool.find((t) => t.role === "tool") || {}).content || "{}");
  assert.equal(result.count, 1, "the tool result is wrong: " + JSON.stringify(result));
  assert.ok(!/pídele el tope/.test(result.note || ""), "the tool told her to ask the budget again: " + result.note);
  assert.deepEqual(W.catalogueRequests, [], "the typed search fetched catalogue files: " + W.catalogueRequests.slice(0, 5).join(", "));
  assert.deepEqual(W.errors, [], "page errors: " + W.errors.join(" | "));
  await W.stillSamePage();
});

await check("a spoken number is an answer, not noise; real noise still is", async () => {
  const r = await W.page.evaluate(() => ({
    nums: ["5000.", "S/ 3000", "3,500", "1500 soles", "cinco mil"].map((t) => realtimeTranscriptIsNoise(t)),
    noise: ["", ".", "mmm", "Gracias.", "Subtítulos realizados por la comunidad de Amara.org"].map((t) => realtimeTranscriptIsNoise(t)),
  }));
  assert.deepEqual(r.nums, [false, false, false, false, false], "a budget answer is dropped as noise");
  assert.deepEqual(r.noise, [true, true, true, true, true], "noise now passes as speech");
});

await check("after the whole conversation: still the same page, nothing reloaded, no catalogue in memory", async () => {
  await W.page.waitForTimeout(1500);
  await W.stillSamePage();
  const mem = await W.page.evaluate(() => ({ pool: progressivePool.length, retailers: Object.keys(departmentCacheData.retailers || {}).length }));
  assert.equal(mem.pool, 0, "the page built a product pool of " + mem.pool);
  assert.equal(W.catalogueRequests.length, 0, "catalogue files fetched: " + W.catalogueRequests.length);
});

/* THE PRODUCT VIEW, ON THIS PHONE (#443 P0 follow-up). The in-page
   product view's related rail, combo and route restore each used to call
   relatedPool() -- the same 80 files. Run here directly: none may fetch
   a catalogue file, and the heap stays where it was. */
await check("the in-page product view on this phone: no related rail, no combo, no route lookup touches the catalogue", async () => {
  const before = W.catalogueRequests.length;
  const r = await W.page.evaluate(async () => {
    const anchor = { retailer: "bestbuy", title: 'Apple - MacBook Air 15" Laptop - M2 chip Built for Apple Intelligence - 8GB Memory - 256GB SSD - Starlight', price: 1099.99, image: "/aria-icon-512.png" };
    const t = document.getElementById("productViewTitle");
    if (t) t.textContent = anchor.title;
    await renderRelatedRail(anchor);
    /* A two-product combo anchored on this product: the second product
       can only be priced from the whole catalogue, so on this phone the
       combo must not resolve (and must not go and load it). The page's
       own combo data is used when it has one; otherwise a synthetic one. */
    const data = (typeof comboDeals === "function" ? comboDeals() : []).find((c) => c && Array.isArray(c.items) && c.items.length > 1);
    const combo = data || { id: "prueba", savingUsd: 10, items: [{ retailer: anchor.retailer, title: anchor.title },
      { retailer: "bestbuy", title: "Apple - USB-C Power Adapter 35W" }] };
    const a = data ? { ...combo.items[0], price: 50, image: "/aria-icon-512.png" } : anchor;
    if (t) t.textContent = a.title;
    await renderComboModule(a);
    const comboResolved = await resolveComboDeal(combo, a);
    const found = await findCatalogProductByTitle(anchor.title);
    return { railHidden: document.getElementById("relatedRail") ? document.getElementById("relatedRail").hidden : true,
      comboShown: document.getElementById("comboDealWrap") ? !document.getElementById("comboDealWrap").hidden : false,
      comboResolved, found: found ? found.title : null, pool: progressivePool.length };
  });
  assert.equal(r.railHidden, true, "a related rail was drawn from the catalogue");
  assert.equal(r.comboShown, false, "a combo was drawn");
  assert.equal(r.comboResolved, null, "a combo resolved without its products: " + JSON.stringify(r.comboResolved));
  assert.match(String(r.found), /MacBook Air 15/, "the route lookup did not resolve through the search server");
  assert.equal(r.pool, 0, "a product pool was built");
  assert.equal(W.catalogueRequests.length, before, "the product view fetched catalogue files: " + W.catalogueRequests.slice(before, before + 5).join(", "));
  const heap = await W.heapMB();
  assert.ok(heap < 60, "the heap grew to " + heap + " MB");
});

/* THE TAP. A result card opens the product page the shopper chose:
   one navigation, to producto.html for that product -- never a reload of
   the home page -- and producto.html builds itself from its own small
   files, never from the catalogue. */
await check("tapping a result card: one navigation to that product's page, no reload, zero catalogue requests, heap small", async () => {
  const before = W.catalogueRequests.length;
  const errorsBefore = W.errors.length;
  assert.deepEqual(W.navigations, [], "the page had already navigated: " + W.navigations.join(" | "));
  const card = W.page.locator("#assistantMessages [data-assistant-card]").first();
  assert.equal(await card.count(), 1, "no card to tap");
  await Promise.all([W.page.waitForURL(/\/producto\.html\?/, { timeout: 15000 }), card.tap()]);
  await W.page.waitForLoadState("load");
  await W.page.waitForTimeout(4000);
  assert.equal(W.navigations.length, 1, "expected exactly one navigation, got: " + W.navigations.join(" | "));
  const u = new URL(W.navigations[0]);
  assert.equal(u.pathname, "/producto.html", "the tap went somewhere else: " + W.navigations[0]);
  assert.match(u.searchParams.get("producto") || "", /MacBook Air 15" Laptop - M2/, "the tap opened a different product");
  assert.equal(u.searchParams.get("tienda"), "bestbuy");
  assert.ok(!W.navigations.some((x) => /\/(?:index\.html)?(?:\?|$)/.test(new URL(x).pathname + new URL(x).search) && new URL(x).pathname !== "/producto.html"), "the home page reloaded");
  const title = await W.page.evaluate(() => (document.getElementById("p-title") || {}).textContent || "");
  assert.match(title, /MacBook Air/, "the product page did not render the product: " + title);
  assert.equal(W.catalogueRequests.length, before, "the product page fetched catalogue files: " + W.catalogueRequests.slice(before, before + 5).join(", "));
  const heap = await W.heapMB();
  assert.ok(heap < 60, "the product page heap is " + heap + " MB");
  assert.deepEqual(W.errors.slice(errorsBefore), [], "product page errors: " + W.errors.slice(errorsBefore).join(" | "));
});

await W.ctx.close();

/* The same page on a desktop browser keeps the in-page catalogue path. */
await check("desktop is unchanged: not a light browser, so search stays in the page", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
  await page.route("**/.netlify/functions/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
  assert.equal(await page.evaluate(() => ariaLowMemoryBrowser() || ariaSearchOnServer()), false);
  await ctx.close();
});

await browser.close();

const MIN_CHECKS = 11;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
