/* ==================================================================
   LIGHTER FILES, THE SAME PICTURE (#443 c.6587429371, Danny's image
   weight order: "the site must look EXACTLY the same ... only the file
   behind the picture gets lighter").

   What changed, and what this holds in place:

   - logos/h240/<name>.webp (scripts/build-logo-derivatives.py): every
     PNG store mark scaled to 240px tall (80 CSS px at 3x -- the largest
     use is the Tiendas grid's 78px), stored LOSSLESS. The app bundle
     draws every mark through logoAt()/logoSrcAttrs(); the homepage rail
     plaques name the derivative directly. The master rides along as
     data-logo-orig and comes back on any load error.
   - assets/aria-orb-pixar-320.webp (+ blink): the orb's lossless twin,
     the PNG its onerror fallback.
   - sizedImageUrl() (the bundle and all ten page copies): Shopify's
     storefront path (/cdn/shop/, Pier 1), Salesforce Commerce Cloud's
     sw (Calzedonia, Intimissimi) and Best Buy's ;maxWidth -- floored at
     the 800 step for cards, so a card that loads the full original
     today never lands below what its slot draws.

   STATIC
     every copy of sizedImageUrl/imageSrcset answers the same; the new
     rules never ask for less than 800 on a card, never touch the
     product page's 1000 request, never upscale; srcset labels are the
     width each URL asks for; every PNG master has a derivative of the
     right shape (and no derivative outlives its master); every logo
     emitter carries the master and the undo.
   BROWSER (390px, 3x, reduced motion: the geometry is static)
     homepage, a store page and a product page:
     - GEOMETRY: the same page with the masters behind every mark and
       1x1 product photos, then as built with 800x800 photos -- every
       rail card and every loaded image has the same box (0.25px);
     - SHARP: every card photo with a srcset offers a candidate at least
       its drawn width x 3, and no card photo on a host with a resize
       rule goes without one (the product page's related rail asks for
       360 by design -- reported, held at no worse);
     - LEAD: the page's hero and the first card photo on screen are
       not lazy and load with the page;
     - FALLBACK: a sized photo that fails comes back as the original; a
       derivative mark that fails comes back as the master, never a
       text pill; the orb falls back to its PNG.

     node scripts/test/image-weight-tests.mjs
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { liftDeclarations, pageHtml } from "../lib/page-lift.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

/* ---------------------------------------------------------------- static */
const NAMES = ["CARD_IMG_WIDTHS", "declaredImageWidth", "sizedImageUrl", "imageSrcset"];
const PAGES = ["aria-auto", "checkout", "departamento", "disenadores", "marca", "motos", "ofertas", "producto", "search", "tienda"];
const copies = { bundle: liftDeclarations(pageHtml(ROOT), NAMES) };
/* some pages keep these inside an IIFE, two spaces in */
const dedent = (h) => h.replace(new RegExp("^ +(?=(?:var|const|let|function) (?:" + NAMES.join("|") + ")\\b)", "gm"), "");
for (const p of PAGES) copies[p] = liftDeclarations(dedent(readFileSync(ROOT + p + ".html", "utf8")), NAMES);
const B = copies.bundle;

const BATTERY = [
  "https://cdn.shopify.com/s/files/1/0267/5746/4148/files/a.jpg?v=1784196864",
  "https://www.pier1.com/cdn/shop/files/86686.jpg?v=1692377491",
  "https://www.pier1.com/cdn/shop/products/86686.jpg?v=1&width=600",
  "https://www.intimissimi.com/dw/image/v2/BHHR_PRD/on/demandware.static/-/Sites-INT_EC_COM/default/dw4721ddda/images/RBD97D019-F.jpg?sw=1200&sfrm=jpeg",
  "https://www.calzedonia.com/dw/image/v2/BJHW_PRD/on/demandware.static/-/x/images/M.jpg?sw=1200&sh=1800&sfrm=jpeg",
  "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6380/6380827_sd.jpg",
  "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6380/6380827_sd.jpg;maxHeight=640;maxWidth=550",
  "https://i5.walmartimages.com/seo/x.jpeg", "https://i5.walmartimages.com/seo/x.jpeg?odnHeight=180&odnWidth=180&odnBg=FFFFFF",
  "https://res.cloudinary.com/ssenseweb/image/upload/c_scale,f_auto,q_auto,w_1128/262085M196004_1.jpg",
  "https://cdn-images.farfetch-contents.com/33/03/25/67/33032567_68486042_1000.jpg",
  "https://media.kohlsimg.com/is/image/kohls/3354493_Black?wid=342&hei=342&op_sharpen=1",
  "https://static.bhphoto.com/images/fb/sony.jpg", "https://www.sephora.com/productimages/sku/s1-main-zoom.jpg?imwidth=600",
  "https://content.gapinc.com/b/0060/730/464/cn60730464.png?width=1500", "https://is4.revolveassets.com/images/p4/n/z/HLSA-WO64_V1.jpg",
];
const WIDTHS = [180, 200, 320, 360, 560, 800, 1000];

await check("every page's copy of the photo sizer answers exactly like the app bundle's", () => {
  for (const [name, R] of Object.entries(copies)) for (const u of BATTERY) {
    for (const w of WIDTHS) assert(R.sizedImageUrl(u, w) === B.sizedImageUrl(u, w), `${name}: sizedImageUrl(${u}, ${w}) = ${R.sizedImageUrl(u, w)}, bundle ${B.sizedImageUrl(u, w)}`);
    assert(R.imageSrcset(u) === B.imageSrcset(u), `${name}: imageSrcset(${u}) differs from the bundle's`);
  }
});

await check("the new hosts: 800 for any card request, the asked width for a thumbnail, the original above 800", () => {
  const cases = [
    [BATTERY[1], 360, "&width=800"], [BATTERY[1], 560, "&width=800"], [BATTERY[1], 180, "&width=180"], [BATTERY[1], 1000, null],
    [BATTERY[3], 360, "?sw=800&"], [BATTERY[3], 800, "?sw=800&"], [BATTERY[3], 200, "?sw=200&"], [BATTERY[3], 1000, null],
    [BATTERY[5], 560, ";maxHeight=800;maxWidth=800"], [BATTERY[5], 180, ";maxHeight=180;maxWidth=180"], [BATTERY[5], 1000, null],
  ];
  for (const [u, w, want] of cases) {
    const got = B.sizedImageUrl(u, w);
    if (want === null) assert(got === u, `${u} at ${w} should keep the original, got ${got}`);
    else assert(got.includes(want), `${u} at ${w} should ask ${want}, got ${got}`);
  }
  /* never upscale, never fight a fixed height, never stack a second size */
  assert(B.sizedImageUrl(BATTERY[2], 560) === BATTERY[2], "a /cdn/shop/ URL already at 600 was asked for 800");
  assert(B.sizedImageUrl(BATTERY[4], 560) === BATTERY[4], "an SFCC URL with sh= was rewritten");
  assert(B.sizedImageUrl(BATTERY[6], 560) === BATTERY[6], "a Best Buy URL that already fits a box was rewritten");
});

await check("hosts the change does not name ask for exactly what they asked for before", () => {
  /* the steps the base commit asked for, per host (unchanged rules) */
  const want = {
    [BATTERY[0]]: ["width=180", "width=360", "width=560", "width=800", "width=1000"],
    [BATTERY[7]]: ["odnWidth=180", "odnWidth=360", "odnWidth=560", "odnWidth=800", "odnWidth=1000"],
  };
  for (const [u, parts] of Object.entries(want)) [180, 360, 560, 800, 1000].forEach((w, i) => assert(B.sizedImageUrl(u, w).includes(parts[i]), `${u} at ${w}: ${B.sizedImageUrl(u, w)}`));
  for (const u of [BATTERY[8], BATTERY[15]]) for (const w of WIDTHS) assert(B.sizedImageUrl(u, w) === u, `${u} was rewritten at ${w}`);
});

await check("every srcset candidate is labelled with the width its URL really asks for", () => {
  for (const u of BATTERY) {
    const ss = B.imageSrcset(u);
    if (!ss) continue;
    for (const part of ss.split(", ")) {
      const [url, label] = part.split(" ");
      const declared = B.declaredImageWidth(url);
      if (declared) assert(declared === parseInt(label, 10), `${url} labelled ${label}`);
    }
  }
});

/* PNG / WebP headers, enough to read a size */
function pngSize(p) { const b = readFileSync(p); return b.toString("binary", 1, 4) === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }
function webpSize(p) {
  const b = readFileSync(p);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1, "lossless"]; }
  if (kind === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1, "vp8x"];
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff, "lossy"];
}
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
}

await check("every PNG mark has its lossless 240px twin, the master's shape, and no twin outlives its master", () => {
  const masters = walk(ROOT + "logos").filter((p) => p.endsWith(".png") && !relative(ROOT + "logos", p).startsWith("h240"));
  assert(masters.length > 50, `only ${masters.length} PNG marks found`);
  for (const m of masters) {
    const d = ROOT + "logos/h240/" + relative(ROOT + "logos", m).replace(/\.png$/, ".webp");
    assert(existsSync(d), `${relative(ROOT, m)} has no derivative (run python3 scripts/build-logo-derivatives.py)`);
    const [w, h] = pngSize(m), [dw, dh, kind] = webpSize(d);
    assert(kind === "lossless", `${relative(ROOT, d)} is not lossless`);
    if (h <= 240) assert(dw === w && dh === h, `${relative(ROOT, d)} is ${dw}x${dh}, the master ${w}x${h} (a mark this small is never scaled)`);
    else {
      assert(dh >= 234 && dh <= 240, `${relative(ROOT, d)} is ${dh}px tall: below 234 a 78px mark at 3x would be soft (stale derivative?)`);
      assert(Math.abs(dw / dh - w / h) / (w / h) < 0.004, `${relative(ROOT, d)} changed the mark's aspect (${dw}x${dh} vs ${w}x${h})`);
    }
  }
  for (const d of walk(ROOT + "logos/h240")) {
    const m = ROOT + "logos/" + relative(ROOT + "logos/h240", d).replace(/\.webp$/, ".png");
    assert(d.endsWith(".webp") && existsSync(m), `${relative(ROOT, d)} has no master`);
  }
  for (const o of ["aria-orb-pixar-320", "aria-orb-pixar-blink-320"]) {
    const [w, h] = pngSize(ROOT + "assets/" + o + ".png"), [dw, dh, kind] = webpSize(ROOT + "assets/" + o + ".webp");
    assert(kind === "lossless" && dw === w && dh === h, `assets/${o}.webp is not the PNG's lossless twin`);
  }
});

await check("every mark the app draws carries its master and the undo", () => {
  const src = pageHtml(ROOT);
  const L = liftDeclarations(src, ["LOGO_SMALL_MAX_CSS", "logoAt"]);
  assert(L.logoAt("logos/macys.png", 26) === "logos/h240/macys.webp", "a 26px mark is not drawn from its derivative");
  assert(L.logoAt("logos/brands/venum.png", 78) === "logos/h240/brands/venum.webp", "a 78px mark is not drawn from its derivative");
  assert(L.logoAt("logos/macys.png", 120) === "logos/macys.png", "a mark drawn above 80px lost its master");
  assert(L.logoAt("logos/walmart.svg", 26) === "logos/walmart.svg", "an SVG was rewritten");
  const raw = src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert(!/<img src="\$\{(?:r\.logo|logoFile)\}"|<img src=\\"" \+ s\.logo/.test(raw), "a logo <img> still names its master directly");
  assert((raw.match(/logoSrcAttrs\(/g) || []).length >= 6, "a logo emitter lost logoSrcAttrs");
  const html = readFileSync(ROOT + "index.html", "utf8");
  const plaques = [...html.matchAll(/<img src="logos\/h240\/[^"]+"[^>]*>/g)].map((m) => m[0]);
  assert(plaques.length >= 30, `only ${plaques.length} rail plaques draw the derivative`);
  for (const p of plaques) assert(/data-logo-orig="logos\/[^"]+\.png"/.test(p) && p.includes("this.src=o;return;"), "a rail plaque has no way back to its master: " + p.slice(0, 120));
  assert(/id="ariaOrbImg" src="assets\/aria-orb-pixar-320\.webp" onerror="[^"]*aria-orb-pixar-320\.png/.test(html), "the orb lost its PNG fallback");
  assert(/id="ariaOrbBlink" data-src="assets\/aria-orb-pixar-blink-320\.webp" onerror="[^"]*blink-320\.png/.test(html), "the blink frame lost its PNG fallback");
  for (const p of ["tienda", "producto", "search", "ofertas", "departamento", "marca"]) {
    assert(/function imgOrigRetry\(el\)\{[\s\S]{0,200}el\.src = el\.dataset\.imgOrig/.test(readFileSync(ROOT + p + ".html", "utf8")), `${p}.html lost imgOrigRetry`);
  }
});

/* --------------------------------------------------------------- browser */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const fns = {};
async function fn(name) {
  if (!(name in fns)) { const p = join(ROOT, "netlify/functions", name + ".js"); fns[name] = existsSync(p) ? (await import(p)).handler : null; }
  return fns[name];
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const m = /^\/(?:\.netlify\/functions|api)\/([a-z0-9-]+)/.exec(u.pathname);
  if (m) {
    const h = await fn(m[1]);
    if (!h) { res.writeHead(404); res.end(); return; }
    try {
      const o = await h({ httpMethod: req.method, path: u.pathname, rawUrl: "http://127.0.0.1" + req.url, queryStringParameters: Object.fromEntries(u.searchParams), headers: req.headers, body: null });
      res.writeHead(o.statusCode || 200, o.headers || { "Content-Type": "application/json" }); res.end(o.body || "");
    } catch (e) { res.writeHead(500); res.end(String(e)); }
    return;
  }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

/* A white square PNG of any size (stdlib only). */
function png(n) {
  const crc = (buf) => { let c, k, t = []; for (let i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } let x = ~0; for (const b of buf) x = t[(x ^ b) & 255] ^ (x >>> 8); return (~x) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + n * 3, 255); row[0] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(n).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}
const PX1 = png(1), PX800 = png(800);

const PDP = "producto.html?producto=Fisher-Price%20Little%20People%20Disney%20%26%20Pixar%20Toy%20Story%20Pizza%20Planet%20Truck%20%26%20Buzz%20Lightyear%20Toy&tienda=walmart";
const SCREENS = [["homepage", "index.html"], ["store page", "tienda.html?tienda=walmart"], ["product page", PDP]];
const ROW = ".ariaRail:not(#liveRefineChips), div.rail, .track, .rel-row";
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});

/* masters: every derivative answered with its master's bytes (the page as
   it was drawn before), photos 1x1. As built: photos 800x800. */
async function open(path, { masters = false, photo = PX1, fail = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/^https?:\/\//, async (r) => {
    const url = r.request().url();
    if (fail && fail.test(url)) return r.fulfill({ status: 404, body: "" });
    if (url.startsWith(BASE)) {
      const p = new URL(url).pathname;
      if (masters && /^\/logos\/h240\/.+\.webp$/.test(p)) {
        const m = ROOT + p.replace("/h240/", "/").replace(/\.webp$/, ".png").slice(1);
        return existsSync(m) ? r.fulfill({ status: 200, contentType: "image/png", body: readFileSync(m) }) : r.fulfill({ status: 404, body: "" });
      }
      if (masters && /^\/assets\/aria-orb-pixar(-blink)?-320\.webp$/.test(p)) return r.fulfill({ status: 200, contentType: "image/png", body: readFileSync(ROOT + p.slice(1).replace(/\.webp$/, ".png")) });
      return r.continue();
    }
    return r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/png", body: photo }) : r.abort();
  });
  await pg.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => Promise.race([Promise.all([...document.images].filter((i) => i.getAttribute("src") && !i.complete).map((i) => new Promise((r) => { i.addEventListener("load", r); i.addEventListener("error", r); }))), new Promise((r) => setTimeout(r, 5000))]));
  await pg.waitForTimeout(300);
  return { ctx, pg, errs };
}
const boxesOf = (pg) => pg.evaluate((ROW) => {
  const r = (e) => { const b = e.getBoundingClientRect(); return [b.x, b.y + scrollY, b.width, b.height].map((v) => Math.round(v * 100) / 100); };
  return {
    cards: [...document.querySelectorAll(`:is(${ROW}) > *`)].map((e) => r(e)),
    imgs: [...document.images].map((i, k) => ({ k, src: i.getAttribute("data-logo-orig") || i.getAttribute("data-img-orig") || i.getAttribute("src") || i.getAttribute("data-src") || "", done: i.complete && i.naturalWidth > 0, box: r(i) })),
  };
}, ROW);

for (const [label, path] of SCREENS) {
  await check(`${label}: every rail card and every loaded image keeps its box (masters + 1x1 photos vs as built + 800x800 photos)`, async () => {
    const a = await open(path, { masters: true, photo: PX1 }), b = await open(path, { photo: PX800 });
    const A = await boxesOf(a.pg), Bx = await boxesOf(b.pg);
    await a.ctx.close(); await b.ctx.close();
    assert(A.cards.length > 3 && A.cards.length === Bx.cards.length, `${A.cards.length} cards vs ${Bx.cards.length}`);
    const off = (p, q) => p.some((v, i) => Math.abs(v - q[i]) > 0.25);
    const moved = A.cards.map((p, i) => off(p, Bx.cards[i]) ? `card ${i}: ${p} -> ${Bx.cards[i]}` : null).filter(Boolean);
    assert(!moved.length, moved.slice(0, 5).join("; "));
    assert(A.imgs.length === Bx.imgs.length, `${A.imgs.length} images vs ${Bx.imgs.length}`);
    const both = A.imgs.filter((x, i) => x.done && Bx.imgs[i].done && x.src === Bx.imgs[i].src);
    assert(both.length > 3, `only ${both.length} images loaded in both`);
    const imoved = both.map((x) => off(x.box, Bx.imgs[x.k].box) ? `${x.src.slice(-50)}: ${x.box} -> ${Bx.imgs[x.k].box}` : null).filter(Boolean);
    assert(!imoved.length, imoved.slice(0, 5).join("; "));
  });
}

/* The card photos on the three screens, with their drawn width. */
const cardPhotos = (pg) => pg.evaluate(() => [...document.querySelectorAll("img")].filter((i) => {
  const s = i.getAttribute("data-img-orig") || i.getAttribute("data-img-fallback") || i.getAttribute("src") || i.getAttribute("data-src") || "";
  return /^https?:/.test(s) && !/\/logos\//.test(s) && i.getBoundingClientRect().width >= 100 && !i.closest(".p-gallery");
}).map((i) => ({
  orig: i.getAttribute("data-img-orig") || i.getAttribute("data-img-fallback") || i.getAttribute("src") || i.getAttribute("data-src"),
  srcset: i.getAttribute("srcset") || i.getAttribute("data-srcset") || "",
  w: i.getBoundingClientRect().width, rel: !!i.closest(".rel-row"),
})));

await check("every card photo with a resize rule offers a candidate at least its drawn width x 3", async () => {
  const notes = [];
  for (const [label, path] of SCREENS) {
    const { ctx, pg } = await open(path, { photo: PX800 });
    const ph = await cardPhotos(pg);
    await ctx.close();
    assert(ph.length > 3, `${label}: only ${ph.length} card photos`);
    for (const p of ph) {
      const resizable = B.sizedImageUrl(p.orig, 800) !== p.orig;
      if (!p.srcset) {
        /* The product page's related rail asks for 360 for a ~154px slot (base
           behaviour, below the 3x bar: reported to Danny); the new rules floor
           it at 800 for the hosts they add, so it is never worse than today. */
        if (p.rel) { notes.push(p.orig); continue; }
        assert(!resizable, `${label}: a ${p.w}px card photo on a resizable host has no srcset: ${p.orig}`);
        continue;
      }
      const max = Math.max(...p.srcset.split(",").map((c) => parseInt(c.trim().split(/\s+/)[1], 10) || 0));
      assert(max >= Math.floor(p.w * 3), `${label}: a ${p.w}px card offers at most ${max}w (needs ${Math.ceil(p.w * 3)}): ${p.orig}`);
    }
  }
  console.log(`         (product page related rail: ${notes.length} photos at the base's 360 request, reported)`);
});

await check("the lead images are not lazy and load with the page", async () => {
  for (const [label, path, heroSel] of [["homepage", "index.html", "img.ariaHeroPhoto"], ["store page", "tienda.html?tienda=walmart", "img.hero-bg"], ["product page", PDP, null]]) {
    const { ctx, pg } = await open(path, { photo: PX800 });
    const r = await pg.evaluate(({ heroSel, ROW }) => {
      const out = [];
      if (heroSel) { const h = document.querySelector(heroSel); out.push(h ? { what: "hero", lazy: h.loading === "lazy", done: h.complete && h.naturalWidth > 0 } : { what: "hero", missing: true }); }
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 50 && b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0; };
      const first = [...document.querySelectorAll(`:is(${ROW}) > * img, .p-gallery img, img`)].find((i) => vis(i) && /^https?:/.test(i.currentSrc || i.src) && !/\/logos\//.test(i.src) && !/aria-orb|hero/.test(i.src + i.className));
      out.push(first ? { what: "first photo on screen", lazy: first.loading === "lazy", done: first.complete && first.naturalWidth > 0, src: (first.currentSrc || "").slice(-60) } : { what: "first photo on screen", missing: true });
      return out;
    }, { heroSel, ROW });
    await ctx.close();
    for (const x of r) {
      assert(!x.missing, `${label}: no ${x.what}`);
      assert(!x.lazy, `${label}: the ${x.what} is lazy`);
      assert(x.done, `${label}: the ${x.what} had not loaded 3s after the page`);
    }
  }
});

await check("a sized photo that fails comes back as the original", async () => {
  const { ctx, pg } = await open("tienda.html?tienda=walmart", { photo: PX800, fail: /walmartimages\.com.*odnWidth=(360|560|800)&odnHeight/ });
  const r = await pg.evaluate(() => [...document.images].filter((i) => /walmartimages/.test(i.src)).map((i) => ({ src: i.src, ok: i.complete && i.naturalWidth > 0 })));
  await ctx.close();
  const back = r.filter((x) => x.ok && !/odnWidth=(360|560|800)&odnHeight/.test(x.src));
  assert(back.length >= 3, `only ${back.length} photos came back as their original (of ${r.length})`);
});

await check("a derivative mark that fails comes back as its master, never a text pill; the orb falls back to its PNG", async () => {
  /* the marks that fall back to a pill on the masters alone (a missing or
     broken master: not this change's) */
  const base = await open("index.html", { masters: true, photo: PX800 });
  const basePills = new Set(await base.pg.evaluate(() => [...document.querySelectorAll(".store-logo-fallback")].map((s) => s.textContent)));
  await base.ctx.close();
  const { ctx, pg } = await open("index.html", { photo: PX800, fail: /\/logos\/h240\/|aria-orb-pixar-320\.webp/ });
  const r = await pg.evaluate(() => ({
    derivatives: [...document.images].filter((i) => /\/logos\/h240\//.test(i.src) && i.complete).length,
    masters: [...document.images].filter((i) => /\/logos\/(?!h240)[^?]+\.png$/.test(i.src) && i.complete && i.naturalWidth > 0).length,
    pills: [...document.querySelectorAll(".store-logo-fallback")].map((s) => s.textContent),
    orb: document.getElementById("ariaOrbImg") && document.getElementById("ariaOrbImg").src,
  }));
  await ctx.close();
  assert(r.masters >= 10, `only ${r.masters} marks came back as their master`);
  assert(r.derivatives === 0, `${r.derivatives} marks still show a failed derivative`);
  const extra = r.pills.filter((t) => !basePills.has(t));
  assert(!extra.length, `text pills where a master exists: ${extra.join(", ")}`);
  assert(/aria-orb-pixar-320\.png$/.test(r.orb || ""), `the orb is ${r.orb}`);
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log("\n" + failures.map((f) => "  x " + f).join("\n")); process.exit(1); }
