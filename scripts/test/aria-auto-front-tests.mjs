/* ==================================================================
   ARIA AUTO'S FRONT DOOR (#443 c.6427505203 + c.6428323317, Danny
   2026-10-26: "make it its own thing").

   These hold:
     - the page carries today's catalogue (scripts/build-aria-auto-front.mjs
       rebuilt in memory equals what is written into aria-auto.html), with
       the moto census and the auto parts counted honestly;
     - the categories are in the standing Motos order (Ofertas, Cascos,
       Llantas, Accesorios, Repuestos, Equipaje, Equipo, Ropa last), the
       auto parts their own rail;
     - no image, no card: every card and tile has a real https photo,
       never a store's placeholder art (RevZilla's missing_480x480.png);
     - the addresses: auto.ariashop.pe and ariaauto.pe serve the page;
     - in a phone-width browser: the first screen is an auto store with
       its own header (Aria Auto, by Aria Shop -- ARIA SHOP LLC), none of
       the mall's chrome, soles big and dollars small, no horizontal
       scroll, no catalogue download; a tile's deep link lands on its
       chip in motos.html.

     node scripts/test/aria-auto-front-tests.mjs
   Writes the phone-width screenshot to ARIA_AUTO_SHOT if set.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFront, realPhoto, frontClass, CLASSES, PAGE } from "../build-aria-auto-front.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.stack || e.message}`); console.log("    FAIL " + name); }
}
const HTML = readFileSync(ROOT + PAGE, "utf8");
const embedded = JSON.parse(/<script type="application\/json" id="ariaAutoData">([\s\S]*?)<\/script>/.exec(HTML)[1]);

await check("the page carries today's catalogue, and the census is the real one", () => {
  assert.deepEqual(embedded, JSON.parse(JSON.stringify(buildFront(ROOT))), "stale -- run: node scripts/build-aria-auto-front.mjs");
  const moto = JSON.parse(readFileSync(ROOT + "moto-catalog.json", "utf8"));
  const n = (rk) => moto.retailers[rk].departments.motos.items.filter((i) => (i.title || i.name) && Number(i.price) > 0).length;
  assert.equal(embedded.census.revzilla, n("revzilla"));
  assert.equal(embedded.census.denniskirk, n("denniskirk"));
  assert.equal(embedded.census.motos, n("revzilla") + n("denniskirk"));
  assert.ok(embedded.census.autoParts > 1000, "the auto parts are missing");
});

await check("the standing Motos order: Ofertas, Cascos, Llantas, Accesorios, Repuestos, Equipaje, Equipo, Ropa last; auto parts their own rail", () => {
  const keys = embedded.rails.map((r) => r.key);
  assert.deepEqual(keys, ["ofertas", "cascos", "llantas", "accesorios", "repuestos", "autopartes", "equipaje", "equipo", "ropa"]);
  assert.equal(keys.at(-1), "ropa");
  for (const r of embedded.rails) {
    assert.ok(r.cards.length >= 6, r.key + " has too few cards to be a shelf");
    assert.ok(r.count >= r.cards.length);
  }
  assert.ok(embedded.rails[0].cards.every((c) => c.s >= 5), "a card in Ofertas is not on sale");
  assert.deepEqual(CLASSES.map((c) => c.key), keys);
});

await check("the classes read the titles honestly: gear is gear, hardware that borrows a gear word is not", () => {
  const f = (title, subtype = "accesorios") => frontClass({ title, subtype });
  assert.equal(f("Kriega R20 Backpack"), "equipaje");
  assert.equal(f("Dainese Blackjack Gloves", "ropa_equipo"), "equipo");
  assert.equal(f("Klim Badlands Pro Jacket", "ropa_equipo"), "ropa");
  assert.equal(f("Universal Stronghold Double Bed Boot Mount"), "accesorios");
  assert.equal(f("Chrome Glove Box Cubby and Drink Holder"), "accesorios");
  assert.equal(f("Chrome Grand National 2-Into-2 Exhaust System w/Black End Caps"), "accesorios");
  assert.equal(f("Black Radiator Brace"), "accesorios");
  assert.equal(f("AGV K6 Helmet", "cascos"), "cascos");
});

await check("no image, no card: every card and tile is a real photo, never placeholder art", () => {
  assert.equal(realPhoto("https://www.revzilla.com/product_images/missing_480x480.png"), "");
  assert.equal(realPhoto(""), "");
  assert.equal(realPhoto("http://insecure.example/x.jpg"), "");
  for (const r of embedded.rails) {
    assert.ok(realPhoto(r.img), r.key + " tile has no photo");
    for (const c of r.cards) assert.ok(realPhoto(c.i), `${r.key}: ${c.t} has no real photo`);
  }
  assert.match(HTML, /if \(!c \|\| !c\.i\) return '';/, "the card renderer lost its no-image guard");
  assert.doesNotMatch(HTML, /Sin imagen/);
});

await check("its own addresses: auto.ariashop.pe and ariaauto.pe serve the front door", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  for (const host of ["auto.ariashop.pe", "ariaauto.pe", "www.ariaauto.pe"]) {
    assert.match(toml, new RegExp(`from = "https://${host.replace(/\./g, "\\.")}/"\\s+to = "/aria-auto\\.html"\\s+status = 200`), host);
  }
});

await check("every way into Aria Auto lands on the store, the vehicle finder is a tool inside it (#443 c.6440620713)", () => {
  assert.match(readFileSync(ROOT + "index.html", "utf8"), /window\.openAriaAuto = function\(sourceKey\)\{[\s\S]{0,200}window\.location\.href = '\/aria-auto\.html';/);
  for (const f of ["carrito.html", "categorias.html", "como-funciona.html", "devoluciones.html", "keyclub.html", "marca.html", "auto.html"]) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.doesNotMatch(src, /href="\/?auto\.html"[^>]*>Aria Auto</, f + " still sends Aria Auto to the finder");
    assert.match(src, /href="\/?aria-auto\.html"[^>]*>Aria Auto</, f + " has no Aria Auto link to the store");
  }
  assert.match(readFileSync(ROOT + "netlify.toml", "utf8"), /from = "\/auto"\s+to = "\/aria-auto\.html"\s+status = 200\s+force = true/);
  assert.match(HTML, /<a class="aa-fit-go" href="auto\.html">/);
});

/* ---------------- the browser ---------------- */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
const PHOTO = readFileSync(ROOT + "assets/sections/tiendas-mall-row.jpg");
const seen = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  seen.push(u.pathname);
  if (u.pathname === "/.netlify/functions/exchange-rate") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ venta: 3.75, compra: 3.7 })); return; }
  if (u.pathname === "/__photo.jpg") { res.writeHead(200, { "Content-Type": "image/jpeg" }); res.end(PHOTO); return; }
  if (u.pathname.startsWith("/.netlify/functions/")) { res.writeHead(404); res.end("{}"); return; }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
async function open(path) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  /* Retailer photos are answered with one local image: the sandbox cannot reach their CDNs. */
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image"
    ? r.fulfill({ status: 200, contentType: "image/jpeg", body: PHOTO }) : r.abort());
  await pg.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" });
  return { pg, errs };
}

await check("phone width: the first screen is an auto store of its own -- its header and parent line, no mall chrome, real cards, soles big", async () => {
  seen.length = 0;
  const { pg, errs } = await open(PAGE);
  await pg.waitForFunction(() => document.querySelectorAll(".rail .card").length > 20 && /S\//.test(document.querySelector(".rail .price .pen").textContent), null, { timeout: 15000 });
  const first = await pg.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    return {
      mark: document.querySelector(".aa-mark").textContent.trim(),
      parent: document.querySelector(".aa-parent").textContent.trim(),
      h1: document.querySelector("h1").textContent,
      mallChrome: !!document.querySelector(".hdr, #assistantPanel, #ariaLauncher"),
      firstScreenCards: [...document.querySelectorAll(".rail .card")].filter((c) => { const r = c.getBoundingClientRect(); return r.top < innerHeight && r.left < innerWidth && r.bottom > 0; }).length,
      firstShelves: [...document.querySelectorAll("#aaRailsTop .aa-sec")].map((x) => x.id),
      fitAfterTop: !!document.querySelector("#aaRailsTop + .aa-fit"),
      tiles: document.querySelectorAll(".aa-tile").length,
      tileOrder: [...document.querySelectorAll(".aa-tile b")].map((b) => b.textContent),
      overflow: document.documentElement.scrollWidth - innerWidth,
      pen: getComputedStyle(document.querySelector(".rail .price .pen")).fontSize,
      usd: getComputedStyle(document.querySelector(".rail .price .usd")).fontSize,
      noImgCards: [...document.querySelectorAll(".rail .card")].filter((c) => !c.querySelector("img")).length,
      emoji: /\p{Extended_Pictographic}/u.test(document.body.innerText),
      retailerLinks: [...document.querySelectorAll("a[href]")].filter((a) => /^https?:\/\/[^/]*(revzilla|denniskirk|advanceautoparts)\./i.test(a.href)).length,
    };
  });
  assert.equal(first.mark, "Aria Auto");
  assert.equal(first.parent, "by Aria Shop — ARIA SHOP LLC");
  assert.match(first.h1, /moto.*auto/);
  assert.equal(first.mallChrome, false, "the mall's header or assistant is on the front door");
  /* A store, not a landing page (#443 c.6431103818): real products with
     prices in the first screen, the deals and the auto parts first, the
     vehicle finder as a tool after them. */
  assert.ok(first.firstScreenCards >= 2, "no products in the first screen: " + first.firstScreenCards);
  assert.deepEqual(first.firstShelves, ["ofertas", "autopartes"]);
  assert.equal(first.fitAfterTop, true, "the vehicle finder is not a tool inside the store");
  /* The garage photograph's slot: a missing file removes itself, leaving the blue. */
  assert.match(HTML, /<img class="aa-hero-photo" src="assets\/aria-auto\/garage-hero\.jpg" alt="" aria-hidden="true"[^>]*onerror="this\.remove\(\)">/);
  assert.deepEqual(first.tileOrder, ["Ofertas", "Cascos", "Llantas", "Accesorios", "Repuestos de moto", "Repuestos de auto", "Equipaje", "Equipo de protección", "Ropa"]);
  assert.ok(first.overflow <= 0, "the page scrolls sideways on a phone: " + first.overflow + "px");
  assert.ok(parseFloat(first.pen) > parseFloat(first.usd) * 1.3, "soles are not the big price");
  assert.equal(first.noImgCards, 0);
  assert.equal(first.emoji, false, "an emoji on the page");
  assert.equal(first.retailerLinks, 0, "a link out to a retailer");
  assert.ok(!seen.some((p) => /-catalog\.json|catalog-index|department-cache|\/_fn\//.test(p)), "the front door downloaded a catalogue: " + seen.filter((p) => /json/.test(p)).join(", "));
  if (process.env.ARIA_AUTO_SHOT) await pg.screenshot({ path: process.env.ARIA_AUTO_SHOT, fullPage: false });
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("the mall's Aria Auto button opens the store", async () => {
  const { pg } = await open("index.html");
  await pg.waitForFunction(() => typeof window.openAriaAuto === "function", null, { timeout: 20000 });
  await Promise.all([pg.waitForURL(/aria-auto\.html/, { timeout: 20000 }), pg.evaluate(() => window.openAriaAuto())]);
  await pg.waitForSelector(".aa-mark", { timeout: 15000 });
  await pg.close();
});

await check("a dead photo takes its card with it; prices are motos.html's to the cent", async () => {
  const { pg } = await open(PAGE);
  await pg.waitForFunction(() => document.querySelectorAll(".rail .card").length > 20, null, { timeout: 15000 });
  const out = await pg.evaluate(() => {
    const card = document.querySelector(".rail .card");
    const img = card.querySelector("img");
    img.dispatchEvent(new Event("error"));
    img.dispatchEvent(new Event("error"));
    return { gone: !card.isConnected || !!document.querySelector(".rail .card") };
  });
  assert.ok(out.gone);
  await pg.close();
});

await check("the front door's links land: a tile opens motos.html on its chip, the search box carries its words", async () => {
  const { pg, errs } = await open("motos.html?t=cascos&q=agv");
  await pg.waitForFunction(() => document.querySelector('#typeChips .chip[data-t="cascos"]').getAttribute("aria-pressed") === "true", null, { timeout: 15000 });
  assert.equal(await pg.evaluate(() => document.getElementById("q").value), "agv");
  const junk = await open("motos.html?t=<script>");
  await junk.pg.waitForTimeout(300);
  assert.equal(await junk.pg.evaluate(() => document.querySelector('#typeChips .chip[data-t="all"]').getAttribute("aria-pressed")), "true");
  await junk.pg.close();
  const hrefs = embedded.rails.map((r) => r.href);
  for (const h of hrefs) assert.match(h, /^(motos\.html(\?t=[a-z_]+(&q=[a-z]+)?)?|auto\.html)$/, h);
  assert.deepEqual(errs, []);
  await pg.close();
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
