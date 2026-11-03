/* ==================================================================
   NO CLAIM WITHOUT A CHOICE, ON EVERY SURFACE (#443 c.6568696054,
   Danny's rule 2: "sweep every makeup surface for that pattern and fix
   or strip the claim").

   A YesStyle title like "Non-Stick Cup Mirror Glare Lip Gloss - 16
   Colors" promises a choice no page can offer (no shade data in any
   pull). These checks hold:

   - ONE rule: /display-name.js. No page or bundle carries its own copy
     of the claim pattern; every surface calls AriaDisplayName (through a
     one-line shownTitle / displayName delegate) and loads the script;
   - the rule: plural "- N Colors / Shades / Types" goes; a palette's
     "12 Colors" (its contents), "Color-Correcting" and a singular "Hair
     Color" stay;
   - in a browser (390px), the same YesStyle "- 16 Colors" product run
     through every renderer a shopper sees -- the app bundle's rail card,
     carousel card, product card, product sheet and cart line; search.html
     cards and comparator; tienda.html, departamento.html, marca.html and
     ofertas.html cards (the home pill rails draw with the bundle's rail
     card); the product page; checkout's line list -- shows no claim;
   - display only: every link, data key and stored title keeps the
     store's words, and the title-keyed lookups still resolve (the PDP
     shard, the price index, the cart line's title and key).

   RUNNING IT
     node scripts/test/display-name-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { liftPage } from "../build-pdp-slices.mjs";
import { serve, openPage } from "./lib/variant-browser.mjs";
import { loadDisplayName } from "./lib/display-name.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("  FAIL  " + name); }
}
const D = loadDisplayName(ROOT);
const TITLE = "Non-Stick Cup Mirror Glare Lip Gloss - 16 Colors";
const SHOWN = "Non-Stick Cup Mirror Glare Lip Gloss";
const CLAIM = /\b16 Colors\b/;
const bundleFile = /<script src="\/(build\/app-[0-9a-f]{16}\.js)"[^>]*><\/script>/.exec(readFileSync(ROOT + "index.html", "utf8"))[1];

await check("the rule: a plural claim goes; a palette's contents, Color-Correcting and a singular Hair Color stay", () => {
  assert.equal(D.displayName(TITLE), SHOWN);
  assert.equal(D.displayName("Salmon Darkcircle Concealer Cream - 3 Colors"), "Salmon Darkcircle Concealer Cream");
  assert.equal(D.displayName("Kill Lash Superproof Mascara - 4 Types"), "Kill Lash Superproof Mascara");
  assert.equal(D.displayName("Non-Stick Cup Mirror Glare Lip Gloss - 16 Colors 10pcs Bundle Set"), "Non-Stick Cup Mirror Glare Lip Gloss 10pcs Bundle Set");
  assert.equal(D.displayName("2 IN 1 Highlighter Contour Palette - 4 Colors"), "2 IN 1 Highlighter Contour Palette - 4 Colors");
  assert.equal(D.displayName("L'Oreal Paris Magic Root Rescue 10 Minute Root Hair Color, 4 Dark Brown, 1 kit"), "L'Oreal Paris Magic Root Rescue 10 Minute Root Hair Color, 4 Dark Brown, 1 kit");
  assert.equal(D.displayName("e.l.f. Camo CC Cream, SPF 30 Color-Correcting Medium-To-Full Coverage Face Foundation"), "e.l.f. Camo CC Cream, SPF 30 Color-Correcting Medium-To-Full Coverage Face Foundation");
  assert.equal(D.displayName(""), "");
  assert.equal(D.displayName(null), "");
});

await check("one rule: no surface carries its own copy of the claim pattern; every surface loads /display-name.js", () => {
  const surfaces = ["producto.html", "search.html", "tienda.html", "departamento.html", "marca.html", "ofertas.html", "checkout.html", "index.html"];
  const files = [...surfaces, bundleFile, ...readdirSync(ROOT + "assets/js").map((f) => "assets/js/" + f)];
  for (const f of files) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.doesNotMatch(src, /colou\?rs\|shades/, f + " carries its own copy of the claim pattern");
  }
  for (const f of surfaces) assert.match(readFileSync(ROOT + f, "utf8"), /<script src="\/display-name\.js"><\/script>/, f + " does not load /display-name.js");
  const html = readFileSync(ROOT + "index.html", "utf8");
  assert.ok(html.indexOf("/display-name.js") < html.indexOf(bundleFile), "index.html loads /display-name.js after the bundle");
});

await check("title-keyed lookups keep the store's title: the PDP shard and the price index resolve the full title", () => {
  const P = liftPage(ROOT);
  const key = P.norm(TITLE);
  const recs = JSON.parse(readFileSync(ROOT + "assets/pdp/p/" + P.pdpShard(key) + ".json", "utf8"))[key];
  assert.ok(Array.isArray(recs) && recs.length && recs[0].name === TITLE, "the record keeps the store's words");
  const idx = JSON.parse(readFileSync(ROOT + "price-index.json", "utf8"));
  const id = createHash("sha1").update(`yesstyle::${TITLE}`).digest("base64url").slice(0, 16);
  assert.ok(idx.prices[id], "price-index.json has no entry for the full title");
  assert.equal(idx.prices[productIdOfShown()], undefined, "nothing is keyed by the shown title");
  function productIdOfShown() { return createHash("sha1").update(`yesstyle::${SHOWN}`).digest("base64url").slice(0, 16); }
});

/* ---------- in a browser, every renderer ---------- */
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require("playwright")); } catch (e) { /* no browser here */ }
const IMG = "https://d1flfk77wl2xk4.cloudfront.net/Assets/05/667/M_p0222766705.jpg";
const visible = (html) => String(html).replace(/<[^>]*>/g, " ");
/* No claim in what a shopper reads (text and alt/aria-label), the store's
   title kept where it is data (href, data-*). */
function judge(name, html, { keepsData = true } = {}) {
  assert.ok(html && html.length > 40, name + " rendered nothing");
  assert.doesNotMatch(visible(html), CLAIM, name + " shows the claim");
  for (const m of String(html).matchAll(/\b(?:alt|aria-label|title)="([^"]*)"/g)) assert.doesNotMatch(m[1], CLAIM, name + " reads the claim aloud: " + m[1]);
  assert.match(visible(html), new RegExp(SHOWN), name + " lost the product's name");
  if (keepsData) assert.ok(/16%20Colors|16 Colors/.test(html.replace(/&amp;/g, "&")), name + " no longer carries the store's title as data");
}
if (!chromium) {
  failures.push("browser checks\n         playwright is not installed here (never run playwright install; symlink node_modules)");
} else {
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const open = async (path) => {
    const pg = await openPage(browser, base);
    await pg.goto(base + path, { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.AriaDisplayName, null, { timeout: 15000 });
    return pg;
  };
  try {
    await check("the app bundle (index.html): rail card, carousel card, product card, cart line (the product sheet opens the product page); the home pill rails draw with its rail card", async () => {
      const pg = await open("/");
      await pg.waitForFunction(() => typeof railCardHTML === "function" && typeof productCardHTML === "function", null, { timeout: 20000 });
      const out = await pg.evaluate(({ TITLE, IMG }) => {
        const p = { title: TITLE, name: TITLE, brand: "Pudaier", retailer: "yesstyle", price: 4.8, image: IMG, images: [IMG] };
        const r = {};
        r.rail = railCardHTML(p, "void 0", 'data-pdp="/producto.html?producto=' + encodeURIComponent(TITLE) + '&tienda=yesstyle"');
        r.carousel = carouselCardHTML(p, "yesstyle");
        r.product = productCardHTML(p, { open: "void 0" });
        r.cart = cartLineItemHTML({ retailer: "yesstyle", title: TITLE, priceUsd: 6.37, qty: 1, image: IMG, brand: "Pudaier" });
        return r;
      }, { TITLE, IMG });
      judge("railCardHTML", out.rail);
      judge("carouselCardHTML", out.carousel);
      judge("productCardHTML", out.product, { keepsData: false });
      judge("cartLineItemHTML", out.cart);
      /* The product sheet (showProduct) now opens the product page itself,
         checked below; its own title line uses the same rule. */
      assert.match(readFileSync(ROOT + bundleFile, "utf8"), /productViewTitle'\)\.textContent = shownTitle\(name\)/);
      /* The home pill rails and store-rail pills call this same railCardHTML. */
      for (const f of ["assets/js/home-category-pills.js", "assets/js/store-rail-pills.js"]) assert.match(readFileSync(ROOT + f, "utf8"), /railCardHTML\(p,/, f);
      assert.deepEqual(pg.errors.filter((e) => /shownTitle|AriaDisplayName/.test(e)), []);
      await pg.context().close();
    });
    await check("search.html: the card and the comparator", async () => {
      const pg = await open("/search.html");
      const out = await pg.evaluate(({ TITLE, IMG }) => ({
        card: cardHTML({ title: TITLE, brand: "Pudaier", store: "yesstyle", storeLabel: "YesStyle", price: 4.8, image: IMG, id: "x" }),
        cmp: compareHTML({ title: TITLE, brand: "Pudaier", image: IMG, fx: 3.75, stores: [
          /* Every row has its picture (#603: no photo, no row). */
          { title: TITLE, store: "yesstyle", usd: 6.37, price: 4.8, id: "a", image: IMG }, { title: TITLE, store: "ulta", usd: 7.5, price: 5.8, id: "b", image: IMG }] }),
      }), { TITLE, IMG });
      judge("search cardHTML", out.card);
      judge("search compareHTML", out.cmp);
      await pg.context().close();
    });
    await check("marca.html: the brand card", async () => {
      const pg = await open("/marca.html?marca=pudaier");
      const html = await pg.evaluate(({ TITLE, IMG }) => cardHTML({ t: TITLE, b: "Pudaier", r: "yesstyle", p: 4.8, i: IMG }), { TITLE, IMG });
      judge("marca cardHTML", html);
      await pg.context().close();
    });
    /* Pages whose renderers live in a closure: the page's own data, with
       the YesStyle product in it, drawn the way a shopper gets it. */
    const drawn = (pg) => pg.evaluate(() => [...document.querySelectorAll("a.card")].map((a) => ({
      text: a.innerText, href: a.getAttribute("href") || "", labels: [...a.querySelectorAll("[alt],[aria-label]")].map((x) => x.getAttribute("alt") || x.getAttribute("aria-label")).join(" | ") + " " + (a.getAttribute("aria-label") || ""),
    })));
    const judgeDrawn = (name, cards) => {
      const mine = cards.filter((c) => /Mirror Glare Lip Gloss/.test(c.text));
      assert.ok(mine.length >= 1, name + ": the YesStyle card was not drawn (" + cards.length + " cards)");
      for (const c of mine) {
        assert.doesNotMatch(c.text, CLAIM, name + " shows the claim");
        assert.doesNotMatch(c.labels, CLAIM, name + " reads the claim aloud");
        assert.match(decodeURIComponent(c.href.replace(/\+/g, " ")), CLAIM, name + ": the link must keep the store's title (the product page looks it up)");
      }
      assert.deepEqual(cards.filter((c) => /\b\d+ (?:Colors|Colours|Shades)\b/.test(c.text) && !/palette/i.test(c.text)).map((c) => c.text.slice(0, 80)), [], name + ": a card shows a claim");
    };
    await check("tienda.html: the YesStyle store page draws the PUDAIER gloss with no claim; no card on it shows one", async () => {
      const pg = await open("/tienda.html?tienda=yesstyle");
      await pg.waitForFunction(() => document.querySelectorAll("a.card").length > 20, null, { timeout: 20000 });
      judgeDrawn("tienda", await drawn(pg));
      await pg.context().close();
    });
    await check("departamento.html (Belleza) and ofertas.html: the card shows no claim; the link keeps the store's title", async () => {
      const card = { t: TITLE, r: "yesstyle", p: 4.8, b: "Pudaier", i: IMG };
      let pg = await openPage(browser, base);
      await pg.route(/\/assets\/sections\/departamento\/beauty\/head\.json$/, (r) => {
        const d = JSON.parse(readFileSync(ROOT + "assets/sections/departamento/beauty/head.json", "utf8"));
        d.rails[0].cards.unshift(card);
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
      });
      await pg.goto(base + "/departamento.html?dept=beauty", { waitUntil: "load" });
      await pg.waitForFunction(() => /Mirror Glare Lip Gloss/.test(document.body.innerText), null, { timeout: 20000 });
      judgeDrawn("departamento", await drawn(pg));
      await pg.context().close();
      pg = await openPage(browser, base);
      await pg.route(/\/assets\/ofertas\/rails\.json$/, (r) => {
        const d = JSON.parse(readFileSync(ROOT + "assets/ofertas/rails.json", "utf8"));
        d.lead.unshift({ id: "fx16colors", title: TITLE, brand: "Pudaier", store: "yesstyle", usd: 4.8, wasUsd: 6, pct: 20, image: IMG, ph: 1, k: "belleza" });
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
      });
      await pg.goto(base + "/ofertas.html", { waitUntil: "load" });
      await pg.waitForFunction(() => /Mirror Glare Lip Gloss/.test(document.body.innerText), null, { timeout: 20000 });
      judgeDrawn("ofertas", await drawn(pg));
      await pg.context().close();
    });
    await check("producto.html and checkout.html: the page shows no claim; the cart line keeps the store's title as its key", async () => {
      const pg = await open("/producto.html?producto=" + encodeURIComponent(TITLE) + "&tienda=yesstyle");
      await pg.waitForSelector("#add-cart-btn", { timeout: 20000 });
      assert.equal(await pg.evaluate(() => document.querySelector("#p-body h1").textContent), SHOWN);
      /* A lip gloss with no shade list is not sold (the shade gate,
         /shade-gate.js): the page offers «Tonos en camino», and the line
         here is one a cart saved before the gate -- checkout still names it
         without the claim, and keeps it out of the payment. */
      assert.match(await pg.evaluate(() => (document.getElementById("shade-gate-note") || {}).textContent || ""), /^Tonos en camino/);
      await pg.evaluate((t) => localStorage.setItem("aria_cart_v1", JSON.stringify([{ retailer: "yesstyle", title: t, priceUsd: 6.37, dutiableUsd: 4.8, weightKg: 0.05, qty: 1, brand: "Pudaier" }])), TITLE);
      const cart = await pg.evaluate(() => JSON.parse(localStorage.getItem("aria_cart_v1") || "[]"));
      assert.equal(cart.length, 1);
      assert.equal(cart[0].title, TITLE, "the stored title is the store's");
      await pg.goto(base + "/checkout.html", { waitUntil: "load" });
      await pg.waitForFunction(() => document.querySelector("[data-remove-line]"), null, { timeout: 20000 });
      const co = await pg.evaluate(() => ({
        text: document.body.innerText,
        aria: [...document.querySelectorAll("[data-remove-line]")].map((b) => b.getAttribute("aria-label")),
        key: (document.querySelector("[data-line-key]") || {}).getAttribute ? document.querySelector("[data-line-key]").getAttribute("data-line-key") : "",
      }));
      assert.doesNotMatch(co.text, CLAIM, "checkout shows the claim");
      assert.match(co.text, new RegExp(SHOWN));
      assert.doesNotMatch(co.aria.join(" "), CLAIM);
      assert.match(co.key, CLAIM, "the line key must keep the store's title");
      await pg.context().close();
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.log("  FAIL  " + f + "\n");
process.exit(failures.length ? 1 : 0);
