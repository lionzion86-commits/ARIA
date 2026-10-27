/* ==================================================================
   THE BRAND STRIP: ONE BOX FOR EVERY BRAND (#443 c.6448683605).

   Danny on iPhone: the Golden Goose tile in the Aria Luxury strip
   ballooned above and below its neighbours and its count wrapped
   ("726 / productos"). The cause: brandStripTileHTML wrote
   `{logo && logo.navy ? ...}` without its `$`, so the literal text joined
   the class -- every tile was "brandTile{logo", the .brandTile box never
   applied, and each logo drew at its file's own size. These pin the
   template and the box, then measure the strip at phone width.

     node scripts/test/brand-strip-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HTML = readFileSync(ROOT + "index.html", "utf8");
const BUNDLE = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

await check("the tile template interpolates both plaque classes (no bare {logo ...} in the class)", () => {
  const fn = BUNDLE.slice(BUNDLE.indexOf("function brandStripTileHTML("), BUNDLE.indexOf("function brandStripTileHTML(") + 900);
  assert.ok(fn.includes("${logo && logo.navy ? ' brandTile--navy' : ''}"), "the navy plaque is not interpolated");
  assert.ok(!/[^$]\{logo &&/.test(fn), "a class expression is missing its $");
});

await check("one box: fixed width and height, the logo contained, name and count on one line", () => {
  const rule = (sel) => (HTML.match(new RegExp("\\n\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}")) || [])[1] || "";
  assert.match(rule(".brandTile"), /width:152px/);
  assert.match(rule(".brandTile"), /height:108px/);
  assert.match(rule(".brandTile-logo img"), /max-width:100%/);
  assert.match(rule(".brandTile-logo img"), /max-height:38px/);
  assert.match(rule(".brandTile-logo img"), /object-fit:contain/);
  assert.match(rule(".brandTile-count"), /white-space:nowrap/);
  assert.match(rule(".brandTile-name"), /white-space:nowrap/);
});

await check("phone width: every luxury tile is the same box, Golden Goose's wide wordmark included, counts on one line", async () => {
  const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".jpg": "image/jpeg", ".webp": "image/webp" };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/.netlify/") || u.pathname.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return; }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.route((url) => url.host !== new URL(base).host, (r) => r.abort());
    await pg.goto(base + "/", { waitUntil: "load" });
    await pg.waitForFunction(() => typeof brandStripTileHTML === "function", null, { timeout: 60000 });
    /* the luxury brands as the strip draws them; Golden Goose's file is a 132mm-wide wordmark */
    const tiles = await pg.evaluate(() => {
      const el = document.getElementById("mBrandStrip");
      el.innerHTML = [["miumiu", "Miu Miu", 8], ["goldengoose", "Golden Goose", 726], ["dolcegabbana", "Dolce & Gabbana", 983], ["gucci", "Gucci", 88], ["venum", "Venum", 1240]]
        .map(([key, label, count]) => brandStripTileHTML({ key, label, count })).join("");
      return [...el.children].map((t) => ({ cls: t.className, k: t.dataset.brandStripItem }));
    });
    assert.ok(tiles.every((t) => t.cls.split(/\s+/).includes("brandTile")), "a tile lost its brandTile class: " + tiles.map((t) => t.cls.split(" ")[0]).join(", "));
    assert.ok(tiles.find((t) => t.k === "venum").cls.includes("brandTile--navy"), "Venum lost its navy plaque");
    await pg.waitForFunction(() => [...document.querySelectorAll("#mBrandStrip img")].every((i) => i.complete), null, { timeout: 10000 });
    const m = await pg.$$eval("#mBrandStrip .brandTile", (els) => els.map((e) => {
      const r = e.getBoundingClientRect(), img = e.querySelector("img"), c = e.querySelector(".brandTile-count");
      const ir = img && img.getBoundingClientRect();
      return { k: e.dataset.brandStripItem, w: Math.round(r.width), h: Math.round(r.height), countLines: Math.round(c.getBoundingClientRect().height / parseFloat(getComputedStyle(c).lineHeight || "17")), img: ir && { w: ir.width, h: ir.height, inside: ir.left >= r.left - 0.5 && ir.right <= r.right + 0.5 && ir.top >= r.top - 0.5 && ir.bottom <= r.bottom + 0.5 } };
    }));
    for (const t of m) {
      assert.deepEqual([t.w, t.h], [152, 108], t.k + " is " + t.w + "x" + t.h);
      assert.ok(t.countLines <= 1, t.k + "'s count wraps");
      if (t.img) assert.ok(t.img.inside && t.img.h <= 38.5, t.k + "'s logo spills out of its box: " + JSON.stringify(t.img));
    }
    await ctx.close();
  } finally {
    await browser.close();
    server.close();
  }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
