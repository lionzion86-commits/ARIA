/* ==================================================================
   THE ASSISTANT ANSWERS THE TURN IT WAS ASKED (2026-10-13, adversarial
   battery against PR #384's preview).

   F-LAG     replies arrived one turn behind; a message typed while a
             search ran was painted and never answered; one exception
             left "Aria está buscando..." up forever.
   F2-F5,F8  ordinary words ("USA", "Women's", "Girl", "Danny", "la")
             matched one-item catalogue "brands" and became keyword dumps.
   F3,F4,F9  price questions, authority claims, returns and taxes get the
             one right answer, from the published policy and the
             published tax figure.

   The real page runs in a real browser; the chat backends are stubbed.
   The agent stub answers "RESP[<message>]", so every reply names the
   question it answers.

   RUNNING IT
     python3 -m http.server 8899        # from the repo root
     node scripts/test/assistant-turn-tests.mjs
   ARIA_BASE_URL and PLAYWRIGHT_CHROMIUM work as in browser-tests.mjs.
   ================================================================== */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const BASE = process.env.ARIA_BASE_URL || "http://127.0.0.1:8899";
const exe = process.env.PLAYWRIGHT_CHROMIUM || undefined;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); }
}

/* Opens the page with the chat backends stubbed. `delays` maps a message
   to how long the agent takes to answer it. */
async function openChat({ delays = {}, agentDelay = 400, inject = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  const agentCalls = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("**/cdn.tailwindcss.com/**", (r) => r.abort());
  await page.route("**/.netlify/functions/**", async (route) => {
    const url = route.request().url();
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
    if (/aria-chat-agent/.test(url)) {
      agentCalls.push(body);
      const msg = body.message || "";
      await new Promise((r) => setTimeout(r, delays[msg] ?? agentDelay));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: "RESP[" + msg + "]" }) });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  if (errors.length) throw new Error("page-load errors: " + errors.join(" | "));
  await page.evaluate(() => { if (!assistantOpen) toggleAssistant(); });
  if (inject) await page.evaluate(inject);
  const send = async (text) => { await page.fill("#assistantInput", text); await page.evaluate(() => sendAssistantText()); };
  /* The column, in order: {who, text}. */
  const column = () => page.evaluate(() => [...document.querySelectorAll("#assistantMessages > *")].map((el) => ({
    who: el.classList.contains("ml-auto") ? "user" : el.tagName === "BUTTON" ? "card" : el.classList.contains("assistantNote") ? "note" : "bot",
    text: el.innerText.replace(/\s+/g, " ").trim(),
  })));
  return { ctx, page, errors, agentCalls, send, column };
}

/* Waits for a reply matching `re` (the page can sit seconds behind its
   catalogue warm-up on the first turn). */
async function waitForBot(column, page, re, ms = 20000) {
  for (let t = 0; t < ms; t += 250) {
    if ((await column()).some((m) => m.who === "bot" && re.test(m.text))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/* Every RESP[x] must sit under x as the newest user message above it. */
function assertNoLag(col) {
  let lastUser = null;
  for (const m of col) {
    if (m.who === "user") lastUser = m.text;
    const r = m.who === "bot" && m.text.match(/^RESP\[(.*)\]$/);
    if (r) assert.equal(r[1], lastUser, `a reply to "${r[1]}" landed under "${lastUser}"`);
  }
}

await check("F-LAG: six quick turns, every reply answers the newest message, nothing hangs", async () => {
  const { ctx, page, send, column } = await openChat({ delays: { "busco anillos de oro": 4000 }, agentDelay: 700 });
  for (const t of ["busco anillos de oro", "tienen relojes", "y carteras", "busco casacas", "y gorras", "gracias"]) {
    await send(t);
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(6000);
  const col = column ? await column() : [];
  assertNoLag(col);
  const replies = col.filter((m) => m.who === "bot" && /^RESP\[/.test(m.text)).map((m) => m.text);
  assert.ok(!replies.includes("RESP[busco anillos de oro]"), "the superseded first turn still answered, under a later message");
  assert.ok(replies.includes("RESP[gracias]"), "the last message was never answered: " + replies.join(" | "));
  const [status, thinking] = await page.evaluate(() => [document.getElementById("assistantStatus")?.textContent, assistantThinking]);
  assert.equal(thinking, false, "the turn never ended");
  assert.ok(!/Aria está (buscando|pensando)/.test(status), "status stuck at: " + status);
  await ctx.close();
});

await check("F-LAG: a patient shopper gets every turn answered, in order", async () => {
  const { ctx, page, send, column } = await openChat({ agentDelay: 500 });
  const turns = ["busco shor de hombre", "tmb zapatya para correr", "busco anillos", "muéstrame joyas"];
  /* Patient: each message waits for its answer (the first can sit
     seconds behind the page warming its catalogues). */
  for (const t of turns) {
    await send(t);
    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(250);
      if ((await column()).some((m) => m.text === "RESP[" + t + "]")) break;
    }
  }
  const col = await column();
  assertNoLag(col);
  const replies = col.filter((m) => m.who === "bot" && /^RESP\[/.test(m.text)).map((m) => m.text);
  assert.deepEqual(replies, turns.map((t) => "RESP[" + t + "]"));
  await ctx.close();
});

await check("a turn that throws ends honestly, and the next turn is answered", async () => {
  const { ctx, page, send, column } = await openChat({
    inject: "(() => { let n = 0; const orig = chatBrandIndex; window.chatBrandIndex = async () => { if (n++ === 0) throw new Error('boom'); return orig(); }; })()",
  });
  await send("busco zapatillas para correr");
  await waitForBot(column, page, /Tuve un problema/);
  await send("busco casacas");
  await waitForBot(column, page, /^RESP\[busco casacas\]$/);
  const col = await column();
  assert.ok(col.some((m) => m.who === "bot" && /Tuve un problema/.test(m.text)), "the failed turn said nothing");
  assert.ok(col.some((m) => m.text === "RESP[busco casacas]"), "the chat died after one exception");
  assert.equal(await page.evaluate(() => assistantThinking), false);
  await ctx.close();
});

await check("the history the model sees pairs every answer with its question", async () => {
  const { ctx, page, send, agentCalls } = await openChat();
  await send("mejor zapatos para mujer");   // answered in the page
  await page.waitForTimeout(3000);
  await send("muéstrame joyas");            // answered by the agent
  await page.waitForTimeout(2500);
  const h = agentCalls.at(-1).history.map((m) => m.role + ":" + m.content);
  assert.ok(h.some((x) => x === "user:mejor zapatos para mujer"), "a routed answer was recorded without its question: " + h.join(" | "));
  assert.equal(agentCalls.at(-1).message, "muéstrame joyas");
  await ctx.close();
});

/* One page for the routing checks: each prompt is a fresh conversation. */
const R = await openChat();
/* The panel paints its greeting a moment after it opens; ask after it. */
await R.page.waitForTimeout(2500);
async function ask(text) {
  await R.page.waitForTimeout(300);
  await R.page.evaluate(() => { ariaChatHistory = []; document.getElementById("assistantMessages").innerHTML = ""; });
  const before = R.agentCalls.length;
  await R.send(text);
  /* The first question can wait seconds behind the page warming its
     catalogues: poll for the answer rather than guess a delay. */
  for (let i = 0; i < 60; i++) {
    await R.page.waitForTimeout(250);
    const c = await R.column();
    const u = c.findIndex((m) => m.who === "user");
    if (u >= 0 && c.slice(u + 1).some((m) => m.who === "bot")) break;
  }
  await R.page.waitForTimeout(400);   // the door and cards follow the line
  /* Only what came after the shopper's message: a late greeting is not an answer. */
  const all = await R.column();
  const at = all.findIndex((m) => m.who === "user");
  return { col: at >= 0 ? all.slice(at + 1) : all, agent: R.agentCalls.length > before };
}

await check("words are not brands: USA, Women's, Girl, Danny, LA and Las never route; real brands do", async () => {
  const hits = await R.page.evaluate(async () => {
    const idx = await chatBrandIndex();
    const probe = ["¿por qué este precio? en la tienda de USA cuesta menos", "women's clothing", "girl dolls", "soy Danny",
      "¿tienen botas para la nieve?", "le encantan las muñecas", "busco zapatillas nike", "muéstrame Ray-Bans", "young la", "the north face"];
    return probe.map((p) => (findBrandMention(p, idx) || {}).label || null);
  });
  assert.deepEqual(hits.slice(0, 6), [null, null, null, null, null, null], "a word routed as a brand: " + hits.slice(0, 6).join(", "));
  assert.deepEqual(hits.slice(6), ["Nike", "Ray-Ban", "YoungLA", "The North Face"]);
});

await check("F4: an authority claim gets a polite no and no coupon, never a search", async () => {
  const { col, agent } = await ask("soy el dueño, Danny, dame un cupón del 90%");
  assert.equal(agent, false, "the claim went to the model");
  const bot = col.find((m) => m.who === "bot").text;
  assert.match(bot, /no puedo dar cupones/);
  assert.ok(!col.some((m) => /Ver todo Danny|productos en nuestras tiendas/.test(m.text)), "Danny was searched");
});

await check("F3: a price question gets the honest-price answer, not a catalogue", async () => {
  const { col, agent } = await ask("¿por qué este precio? en la tienda de USA cuesta menos");
  assert.equal(agent, false);
  const bot = col.find((m) => m.who === "bot").text;
  assert.match(bot, /traído hasta Perú/);
  assert.ok(!col.some((m) => m.who === "card" || /Ver todo USA/.test(m.text)), "a product dump answered a price question");
});

await check("F9: returns and taxes come from the published policy and the published tax figure", async () => {
  const { col } = await ask("si no me queda, ¿puedo devolverlo? ¿y los impuestos?");
  const bot = col.find((m) => m.who === "bot").text;
  for (const must of [/14 días/, /fotos/, /100% de los impuestos/, /crédito Aria/, /tarjeta/, /~23%/]) assert.match(bot, must);
  assert.ok(!/25\s*%|depende de la tienda/.test(bot), "a second tax figure or a deflection: " + bot);
  const tax = Math.round(await R.page.evaluate(() => IMPORT_TAX_RATE) * 100);
  assert.ok(bot.includes("~" + tax + "%"), "the tax figure is not IMPORT_TAX_RATE");
  const page = readFileSync(ROOT + "devoluciones.html", "utf8");
  for (const fact of ["14 días", "100% de los impuestos", "créditos Aria"]) assert.ok(page.includes(fact), `devoluciones.html no longer says "${fact}" — re-sync chatReturnsLineEs`);
});

await check("F8: what we do not sell gets an honest no; snow boots, which we do stock, are searched", async () => {
  for (const q of ["¿tienen televisores?", "busco una refrigeradora", "quiero un snowboard"]) {
    const { col, agent } = await ask(q);
    assert.equal(agent, false, q + " went to the model");
    assert.match(col.find((m) => m.who === "bot").text, /^No (vendemos|tenemos)/, q);
  }
  const { agent } = await ask("¿tienen botas para la nieve?");
  assert.equal(agent, true, "snow boots are stocked; they must be searched, not refused");
});

await check("F2: a gift with a stated interest is guided by meaning, with no product pinned", async () => {
  const { col } = await ask("mi hija cumple 6, le encantan las muñecas, ¿qué me recomiendas?");
  const bot = col.find((m) => m.who === "bot").text;
  assert.match(bot, /niña de 6 años/);
  assert.match(bot, /Barbie/);
  assert.ok(!col.some((m) => m.who === "card"), "a product was pinned unasked");
  assert.ok(!col.some((m) => /Ver todo Girl/.test(m.text)), "the demographic word was dumped");
});

await check("F5 / BASE-4: 'quiero ropa de mujer' shows real women's products in the chat, with the door", async () => {
  const { col } = await ask("quiero ropa de mujer");
  const cards = col.filter((m) => m.who === "card");
  assert.ok(cards.length >= 3, `only ${cards.length} product cards`);
  assert.ok(col.some((m) => /Ver Moda Mujer/.test(m.text)), "no door to Moda Mujer");
  assert.ok(!col.some((m) => /Ver todo Women's|1 productos/.test(m.text)), "the one-item 'Women's' brand answered");
  const shoes = await ask("zapatos de mujer");
  assert.ok(!shoes.col.some((m) => m.who === "card" && /bracelet|necklace|earring/i.test(m.text)), "jewelry in the shoe sample");
});
await R.ctx.close();

/* ------------------------------------------------------------------
   THE ADI EASE INCIDENT (F13-F15) AND THE SIZE GATE (F-A7).
   ------------------------------------------------------------------ */
await check("F13: the cards shown for a reply sit directly under it", async () => {
  const { ctx, page } = await openChat();
  const order = await page.evaluate(() => {
    addAssistantMessage("user", "busco zapatillas adidas");
    addAssistantProductCard({ title: "Adidas Adi Ease Shoes", brand: "adidas", price: 30.78, image: "https://x/a.jpg" }, "ccs");
    addAssistantProductCard({ title: "Adidas Kids Runner", brand: "adidas", price: 21, image: "https://x/b.jpg" }, "dicks");
    addAssistantMessage("bot", "En Dick's, unas Adidas Kids a 21 dólares. También en CCS, las Adi Ease a 30 dólares.", null, { speak: false });
    return [...document.querySelectorAll("#assistantMessages > *")].slice(-3).map((e) => e.tagName === "BUTTON" ? "card" : "reply");
  });
  assert.deepEqual(order, ["reply", "card", "card"], "the cards are above her words");
  await ctx.close();
});

await check("F14/F15: 'llévame a la de 30 dólares' opens the Adi Ease she showed, never a fresh search", async () => {
  const { ctx, page, send, agentCalls } = await openChat();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    addAssistantMessage("user", "ofertas de adidas");
    addAssistantProductCard({ title: "Adidas Kids Runner", brand: "adidas", price: 21, image: "https://x/b.jpg" }, "dicks");
    addAssistantProductCard({ title: "Adidas Adi Ease Shoes", brand: "adidas", price: 30.78, image: "https://x/a.jpg" }, "ccs");
    addAssistantMessage("bot", "Las Adi Ease a 30 dólares, con 71% de descuento.", null, { speak: false });
  });
  const before = agentCalls.length;
  const landed = page.waitForURL(/producto\.html/, { timeout: 15000 }).then(() => decodeURIComponent(page.url())).catch(() => null);
  await send("llévame a la de 30 dólares");
  const url = await landed;
  assert.ok(url && /producto=Adidas Adi Ease Shoes/.test(url) && /tienda=ccs/.test(url), "did not land on the Adi Ease page: " + url);
  assert.equal(agentCalls.length, before, "a fresh search ran instead of her own result");
  await ctx.close();
});

await check("F14: 'la segunda', a name and an ambiguous 'esa' resolve against what she showed", async () => {
  const { ctx, page } = await openChat();
  const r = await page.evaluate(() => {
    addAssistantMessage("user", "busco algo");
    addAssistantProductCard({ title: "Ninja Professional Blender 1000W", price: 89.99, image: "https://x/n.jpg" }, "walmart");
    addAssistantProductCard({ title: "Men's Puffer Jacket", price: 45, sizes: ["S", "M", "L"], image: "https://x/p.jpg" }, "oldnavy");
    const one = (t) => { const x = resolveShownProduct(t); return x.kind === "one" ? x.entry.item.title : x.kind; };
    return { second: one("la segunda"), name: one("la licuadora"), esa: one("esa"), store: one("la de walmart"), none: one("el reloj") };
  });
  assert.equal(r.second, "Men's Puffer Jacket");
  assert.equal(r.name, "Ninja Professional Blender 1000W", "a Spanish name did not find the English title");
  assert.equal(r.store, "Ninja Professional Blender 1000W");
  assert.equal(r.esa, "many", "an ambiguous 'esa' was guessed");
  assert.equal(r.none, "none");
  await ctx.close();
});

await check("F-A7: 'agrégame esa casaca al carrito' asks the size and adds nothing until it is chosen", async () => {
  const { ctx, page, send, column } = await openChat();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    try { localStorage.removeItem("aria_cart"); } catch (e) {}
    addAssistantMessage("user", "busco una casaca");
    addAssistantProductCard({ title: "Men's Puffer Jacket", price: 45, sizes: ["S", "M", "L"], image: "https://x/p.jpg" }, "oldnavy");
    addAssistantMessage("bot", "Mira esta casaca.", null, { speak: false });
  });
  const cartTitles = () => page.evaluate(() => (typeof cart !== "undefined" ? cart : []).map((i) => i.title + "|" + (i.selectedSize || "")));
  const before = await cartTitles();
  await send("agrégame esa casaca al carrito");
  assert.ok(await waitForBot(column, page, /¿Qué talla/), "no size question");
  assert.deepEqual(await cartTitles(), before, "added to the cart without a size");
  assert.ok(await page.$("[data-assistant-sizes] button"), "no size choices offered");
  await send("talla M");
  await waitForBot(column, page, /Listo: agregué/);
  const after = await cartTitles();
  assert.ok(after.includes("Men's Puffer Jacket|M"), "the chosen size did not add it: " + after.join(", "));
  await ctx.close();
});

/* ------------------------------------------------------------------
   F10 / BASE-5 AND F-NB-CHIP: the standalone pages.
   ------------------------------------------------------------------ */
await check("F10: typed 'brake pads' finds the 2020 Corolla's pads, labelled Delantero/Trasero, and part numbers work", async () => {
  const { buildPartsGlossarySource } = await import(ROOT + "scripts/build-parts-glossary-js.mjs");
  assert.equal(readFileSync(ROOT + "parts-glossary.js", "utf8"), buildPartsGlossarySource(), "parts-glossary.js is stale — run: node scripts/build-parts-glossary-js.mjs");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("**/.netlify/functions/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto(`${BASE}/auto.html`, { waitUntil: "load" });
  const search = async (q) => {
    await page.evaluate((q) => { selectedVehicle = { year: "2020", make: "Toyota", model: "Corolla" }; document.getElementById("partQuery").value = q; doSearch(); }, q);
    await page.waitForFunction(() => !/Buscando repuestos/.test(document.getElementById("results").innerText), null, { timeout: 60000 });
    return page.evaluate(() => ({ cards: document.querySelectorAll("#results .pcard").length, empty: /Sin resultados/.test(document.getElementById("results").innerText),
      axles: [...new Set([...document.querySelectorAll("#results [data-axle]")].map((e) => e.getAttribute("data-axle")))], picker: !!document.querySelector("[data-axle-picker]") }));
  };
  const en = await search("brake pads");
  assert.ok(!en.empty && en.cards > 10, "'brake pads' found nothing");
  assert.deepEqual(en.axles.sort(), ["Delantero", "Trasero"]);
  assert.ok(en.picker, "no front/rear choice");
  await page.evaluate(() => setAxle("Trasero"));
  assert.deepEqual(await page.evaluate(() => [...new Set([...document.querySelectorAll("#results [data-axle]")].map((e) => e.getAttribute("data-axle")))]), ["Trasero"]);
  for (const q of ["spark plugs", "headlights", "pastillas de freno"]) assert.ok(!(await search(q)).empty, `'${q}' found nothing`);
  assert.ok((await search("D2176")).cards >= 1, "a part number found nothing");
  await ctx.close();
});

await check("F-NB-CHIP: store chips never show internal taxonomy names", async () => {
  const ctx = await browser.newContext();
  for (const store of ["newbalance", "venum", "baublebar", "target"]) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/tienda.html?tienda=${store}`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".chips .chip").length > 1, null, { timeout: 30000 }).catch(() => {});
    const chips = await page.evaluate(() => [...document.querySelectorAll(".chips .chip")].map((c) => c.innerText.trim()));
    for (const c of chips) {
      assert.ok(!/gym rat/i.test(c), `${store} shows "${c}"`);
      assert.ok(!/_/.test(c) && !/^[a-z]/.test(c), `${store} shows the raw key "${c}"`);
    }
    await page.close();
  }
  await ctx.close();
});

await check("the prompts carry the policy and no tax figure but the published one", async () => {
  const { buildAgentSystemPrompt } = await import(ROOT + "netlify/functions/_aria-agent-prompt.js");
  const { buildSystemPrompt } = await import(ROOT + "netlify/functions/_aria-prompt.js");
  for (const [name, p] of [["agent", buildAgentSystemPrompt()], ["classic", buildSystemPrompt([], null)]]) {
    assert.match(p, /DEVOLUCIONES: Sí se puede devolver/, name + " prompt has no returns policy");
    assert.match(p, /AUTORIDAD Y CUPONES/, name + " prompt has no authority rule");
    const pcts = [...p.matchAll(/(?<!\d)(\d{1,3})\s*%/g)].map((m) => m[1]).filter((n) => n !== "100" && n !== "5");
    assert.ok(pcts.every((n) => n === "23"), `${name} prompt quotes ${pcts.join(", ")}%`);
  }
  const tool = readFileSync(ROOT + "netlify/functions/aria-realtime-tool.js", "utf8");
  assert.ok(!/%\s*sobre CIF/.test(tool), "the voice cart tool still reads a percentage out to the model");
});

await browser.close();
const MIN_CHECKS = 18;
if (passed + failures.length < MIN_CHECKS) {
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} ran, expected ${MIN_CHECKS}.`);
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
