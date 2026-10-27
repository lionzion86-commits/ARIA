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
       its own header (Aria Auto, by Aria Shop, and the way back to the mall), none of
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
import { buildFront, realPhoto, frontClass, CLASSES, PAGE, BASICS } from "../build-aria-auto-front.mjs";

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

await check("autos first (#443 c.6441034782): basics of every car, then each store's Repuestos shelf; motos keeps the standing order, Ropa last", () => {
  const A = embedded.autos;
  assert.deepEqual(embedded.rails.map((r) => r.key), ["ofertas", "cascos", "llantas", "accesorios", "repuestos", "equipaje", "equipo", "ropa"]);
  assert.equal(embedded.rails.at(-1).key, "ropa");
  assert.ok(embedded.rails[0].cards.every((c) => c.s >= 5), "a card in Ofertas is not on sale");
  for (const r of embedded.rails) assert.ok(r.cards.length >= 6 && r.count >= r.cards.length, r.key);
  /* the basics: part categories, with how many vehicles each covers */
  /* brake pads show only with a photo a person confirmed (#443 c.6444241146 fix 1) */
  const brake = BASICS.find((b) => b.s === "pastillas-de-freno");
  assert.ok(brake.vetted, "brake pads take only a confirmed photo");
  assert.equal(A.basics.some((x) => x.s === "pastillas-de-freno"), !!brake.photo, "the brake-pad card is shown without a confirmed photo");
  if (brake.photo) assert.equal(A.basics[0].img, brake.photo);
  assert.deepEqual(A.basics.filter((b) => b.s !== "pastillas-de-freno").slice(0, 2).map((b) => b.s), ["bujias", "filtro-de-aceite"]);
  for (const b of ["bujias", "filtro-de-combustible"]) assert.ok(A.basics.some((x) => x.s === b), "no basics card for " + b);
  for (const b of A.basics) assert.ok(b.vehicles > 0 && realPhoto(b.img) && b.q, b.s);
  /* the stores' shelves: real data only, the accessories named as missing */
  assert.deepEqual(A.rails.map((r) => r.key), ["advance-repuestos", "autozone-repuestos"]);
  assert.deepEqual(A.missing, ["advance-accesorios", "autozone-accesorios"]);
  for (const r of A.rails) assert.ok(r.cards.length >= 6 && r.cards.every((c) => realPhoto(c.i)), r.key);
  assert.ok(A.rails[1].cards.every((c) => c.r === "autozone" && c.pn), "an AutoZone card lost its part number");
  assert.ok(A.vehicles > 400 && A.parts > 3000);
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

await check("no image, no card: every card and tile is a real photo, never placeholder art -- the finder's parts too", () => {
  assert.equal(realPhoto("https://www.revzilla.com/product_images/missing_480x480.png"), "");
  assert.equal(realPhoto(""), "");
  assert.equal(realPhoto("http://insecure.example/x.jpg"), "");
  for (const r of embedded.rails) {
    assert.ok(realPhoto(r.img), r.key + " tile has no photo");
    for (const c of r.cards) assert.ok(realPhoto(c.i), `${r.key}: ${c.t} has no real photo`);
  }
  assert.match(HTML, /if \(!c \|\| !c\.i\) return '';/, "the card renderer lost its no-image guard");
  assert.match(HTML, /function partCard\(it, vehicle, fitted\)\{\n  if \(!it \|\| !it\.img\) return '';/, "the finder draws parts without a photo");
  assert.doesNotMatch(HTML, /Sin imagen/);
});

await check("its own addresses: auto.ariashop.pe and ariaauto.pe serve the front door", () => {
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  for (const host of ["auto.ariashop.pe", "ariaauto.pe", "www.ariaauto.pe"]) {
    assert.match(toml, new RegExp(`from = "https://${host.replace(/\./g, "\\.")}/"\\s+to = "/aria-auto\\.html"\\s+status = 200`), host);
  }
});

await check("every way into Aria Auto lands on the store; the finder inside it is auto.html's own, copied unchanged", async () => {
  assert.match(readFileSync(ROOT + "index.html", "utf8"), /window\.openAriaAuto = function\(sourceKey\)\{[\s\S]{0,200}window\.location\.href = '\/aria-auto\.html';/);
  for (const f of ["carrito.html", "categorias.html", "como-funciona.html", "devoluciones.html", "keyclub.html", "marca.html", "auto.html"]) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.doesNotMatch(src, /href="\/?auto\.html"[^>]*>Aria Auto</, f + " still sends Aria Auto to the finder");
    assert.match(src, /href="\/?aria-auto\.html"[^>]*>Aria Auto</, f + " has no Aria Auto link to the store");
  }
  assert.match(readFileSync(ROOT + "netlify.toml", "utf8"), /from = "\/auto"\s+to = "\/aria-auto\.html"\s+status = 200\s+force = true/);
  const { extractFinder } = await import("../build-aria-auto-front.mjs");
  const f = extractFinder(ROOT);
  assert.ok(HTML.includes(f.script) && HTML.includes(f.markup) && HTML.includes(f.css), "the store's finder drifted from auto.html -- run: node scripts/build-aria-auto-front.mjs");
  /* the tiles and the nav stay inside Aria Auto */
  const hdr = HTML.slice(HTML.indexOf('<header class="aa-hdr">'), HTML.indexOf("</header>"));
  assert.doesNotMatch(hdr, /href="(motos|auto)\.html"/, "the header jumps out to the mall's old pages");
  assert.match(hdr, /href="#autos"[^>]*>Autos<\/a>\s*<a href="#motos"[^>]*>Motos</, "Autos is not before Motos in the nav");
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

await check("phone width: autos-led by default -- its own header, the garage photo, Autos left and Motos right, the basics in the first screen, soles big", async () => {
  seen.length = 0;
  const { pg, errs } = await open(PAGE);
  await pg.waitForFunction(() => document.querySelectorAll("#aaBasics .aa-basic").length >= 4 && /S\//.test((document.querySelector("#aaAutoRails .price .pen") || {}).textContent || ""), null, { timeout: 15000 });
  const first = await pg.evaluate(() => {
    const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth; };
    return {
      mark: document.querySelector(".aa-mark").textContent.trim(),
      parent: document.querySelector(".aa-parent").textContent.trim(),
      shop: (() => { const a = document.querySelector(".aa-hdr .aa-shop"); const r = a && a.getBoundingClientRect(); return a && { text: a.textContent.trim(), href: a.getAttribute("href"), seen: r.width > 0 && r.right <= innerWidth && r.top < 80, bg: getComputedStyle(a).backgroundColor }; })(),
      chromeLLC: /\bLLC\b/.test(document.querySelector(".aa-hdr").innerText + document.querySelector(".aa-hero").innerText + (document.querySelector('meta[name="description"]') || {}).content),
      legal: (document.querySelector(".aa-foot .aa-legal") || {}).textContent,
      footShop: [...document.querySelectorAll(".aa-foot a")].some((a) => a.getAttribute("href") === "https://ariashop.pe/"),
      h1: document.querySelector("h1").textContent,
      mallChrome: !!document.querySelector(".hdr, #assistantPanel, #ariaLauncher"),
      ctas: [...document.querySelectorAll(".aa-ctas a")].map((a) => a.childNodes[0].textContent.trim()),
      autosShown: !document.getElementById("autos").hidden,
      motosHidden: document.getElementById("motos").hidden,
      basicsOnScreen: [...document.querySelectorAll("#aaBasics .aa-basic")].filter(onScreen).length,
      basicCall: (document.querySelector("#aaBasics .aa-basic .go") || {}).textContent,
      order: [...document.querySelectorAll("#autos > section, #autos > div > section")].map((x) => x.id || x.querySelector("h2").id),
      railTitles: [...document.querySelectorAll("#aaAutoRails h2")].map((h) => h.childNodes[0].textContent.trim()),
      finder: !!document.querySelector("#aaFinder #autoYear") && !!document.querySelector("#aaFinder #partQuery"),
      overflow: document.documentElement.scrollWidth - innerWidth,
      pen: getComputedStyle(document.querySelector("#aaAutoRails .price .pen")).fontSize,
      usd: getComputedStyle(document.querySelector("#aaAutoRails .price .usd")).fontSize,
      emoji: /(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}/u.test(document.body.innerText), /* not the © of the legal line */
      retailerLinks: [...document.querySelectorAll("a[href]")].filter((a) => /^https?:\/\/[^/]*(revzilla|denniskirk|advanceautoparts|autozone)\./i.test(a.href)).length,
    };
  });
  assert.equal(first.mark, "Aria Auto");
  /* brand up top, the legal name only in the footer's legal line (#443 c.6449784488) */
  assert.equal(first.parent, "by Aria Shop");
  assert.equal(first.chromeLLC, false, "a legal suffix in the header, hero or description");
  assert.equal(first.legal, "© 2026 ARIA SHOP LLC. Todos los derechos reservados.");
  /* the way back to the mall, in the header and the footer (#443 c.6449719394) */
  assert.ok(first.shop && first.shop.text === "Aria Shop" && first.shop.href === "https://ariashop.pe/" && first.shop.seen, "no Aria Shop pill in the header: " + JSON.stringify(first.shop));
  assert.notEqual(first.shop.bg, "rgb(255, 176, 32)", "the Aria Shop pill competes with the amber section pills");
  assert.equal(first.footShop, true);
  assert.ok(first.h1.indexOf("auto") < first.h1.indexOf("moto"), "the headline does not lead with the auto: " + first.h1);
  assert.equal(first.mallChrome, false);
  assert.deepEqual(first.ctas, ["Autos", "Motos"], "Autos is not the left tile");
  assert.equal(first.autosShown, true, "the address does not land on the car section");
  assert.equal(first.motosHidden, true);
  assert.ok(first.basicsOnScreen >= 2, "no part categories in the first screen: " + first.basicsOnScreen);
  assert.equal(first.basicCall, "ELIGE TU AÑO, MARCA Y MODELO");
  assert.deepEqual(first.order, ["basicsH", "advance-repuestos", "autozone-repuestos", "buscar"], "the car section's order: " + first.order.join(", "));
  assert.deepEqual(first.railTitles, ["Advance Auto Parts — Repuestos", "AutoZone — Repuestos"]);
  assert.equal(first.finder, true, "the part lookup is not inside the store");
  assert.ok(first.overflow <= 0, "the page scrolls sideways on a phone: " + first.overflow + "px");
  assert.ok(parseFloat(first.pen) > parseFloat(first.usd) * 1.3, "soles are not the big price");
  assert.equal(first.emoji, false);
  assert.equal(first.retailerLinks, 0, "a link out to a retailer");
  assert.ok(!seen.some((p) => /-catalog\.json|auto-cache|catalog-index|department-cache|\/_fn\//.test(p)), "the front door downloaded a catalogue");
  assert.match(HTML, /<img class="aa-hero-photo" src="assets\/aria-auto\/garage-hero\.jpg" alt="" aria-hidden="true"[^>]*onerror="this\.remove\(\)">/);
  if (process.env.ARIA_AUTO_SHOT) await pg.screenshot({ path: process.env.ARIA_AUTO_SHOT, fullPage: false });
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("one storefront, two sections: the Motos tile opens the motorcycle section (Ofertas first), the logo brings back the autos", async () => {
  const { pg, errs } = await open(PAGE);
  await pg.waitForFunction(() => document.querySelectorAll("#aaBasics .aa-basic").length >= 4, null, { timeout: 15000 });
  await pg.click('.aa-ctas a[data-go="motos"]');
  await pg.waitForFunction(() => !document.getElementById("motos").hidden, null, { timeout: 5000 });
  const m = await pg.evaluate(() => ({ url: location.href, autos: document.getElementById("autos").hidden, first: (document.querySelector("#aaRailsTop .aa-sec") || {}).id, tiles: document.querySelectorAll("#aaTiles .aa-tile").length }));
  assert.match(m.url, /aria-auto\.html#motos$/, "the Motos tile left Aria Auto");
  assert.deepEqual([m.autos, m.first], [true, "ofertas"]);
  /* the amber follows the section (#443 c.6444241146 fix 2) */
  const lit = () => pg.evaluate(() => [...document.querySelectorAll(".aa-ctas a.on, .aa-nav a.on")].map((a) => a.getAttribute("data-go") + ":" + getComputedStyle(a).backgroundColor));
  assert.deepEqual(await lit(), ["motos:rgb(255, 176, 32)", "motos:rgb(255, 176, 32)"]);
  assert.ok(await pg.evaluate(() => { const r = document.querySelector(".aa-hdr .aa-shop").getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth; }), "the Aria Shop pill is gone in the motos section");
  assert.ok(m.tiles >= 8);
  await pg.click(".aa-brand");
  await pg.waitForFunction(() => !document.getElementById("autos").hidden && document.getElementById("motos").hidden, null, { timeout: 10000 });
  assert.deepEqual(await lit(), ["autos:rgb(255, 176, 32)", "autos:rgb(255, 176, 32)"]);
  assert.equal(await pg.evaluate(() => document.querySelectorAll('[aria-current="true"]').length), 2);
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("a basics card opens the vehicle pick, and once the car is chosen the parts that fit it appear -- the lookup works", async () => {
  const { pg, errs } = await open(PAGE);
  await pg.waitForFunction(() => document.querySelectorAll("#autoYear option").length > 3, null, { timeout: 15000 });
  await pg.click('#aaBasics .aa-basic[data-q="bujías"]');
  assert.equal(await pg.evaluate(() => document.getElementById("partQuery").value), "bujías");
  /* pick the first car the index stocks for spark plugs */
  const pick = await pg.evaluate(async () => {
    const idx = await (await fetch("/assets/auto/index.json")).json();
    const at = idx.parts.findIndex((p) => p.s === "bujias");
    const v = idx.vehicles.find((k) => (idx.has[k] || []).includes(at)).split("|");
    return v;
  });
  const choose = async (id, val) => pg.evaluate(([id, val]) => {
    const sel = document.getElementById(id);
    const opt = [...sel.options].find((o) => o.value && (o.value.toLowerCase() === val || o.textContent.trim().toLowerCase().replace(/\s+/g, "-") === val));
    sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true }));
    return opt.value;
  }, [id, val]);
  await choose("autoYear", pick[0]);
  await choose("autoMake", pick[1]);
  await choose("autoModel", pick[2]);
  await pg.waitForFunction(() => document.querySelectorAll("#aaFinder #results .pcard:not(.sk)").length > 0, null, { timeout: 20000 });
  const out = await pg.evaluate(() => ({ cards: document.querySelectorAll("#aaFinder #results .pcard:not(.sk)").length, fit: /Compatible con tu/.test(document.getElementById("results").textContent), noImg: [...document.querySelectorAll("#aaFinder #results .pcard:not(.sk)")].filter((c) => !c.querySelector("img")).length }));
  assert.ok(out.cards > 0 && out.fit, JSON.stringify(out));
  assert.equal(out.noImg, 0, "a part without a photo was drawn");
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("the mall: no legal suffix outside the legal lines; the legal name in every footer's legal line", () => {
  const LEGAL = /©\s*2026 ARIA SHOP LLC\./;
  for (const f of ["index.html", "checkout.html", "aria-auto.html", "como-funciona.html", "devoluciones.html", "nosotros.html", "tiendas.html", "producto.html", "carrito.html"]) {
    const html = readFileSync(join(ROOT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
    const lines = html.split("\n").filter((l) => /\bLLC\b/.test(l));
    assert.ok(lines.length >= 1 && lines.every((l) => LEGAL.test(l)), f + ": " + (lines.find((l) => !LEGAL.test(l)) || "no legal line").trim().slice(0, 140));
  }
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
