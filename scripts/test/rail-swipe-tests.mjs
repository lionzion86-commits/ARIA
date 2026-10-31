/* ==================================================================
   THE RAIL OWNS THE SWIPE (#443 c.6544144050, c.6544165764, Danny's
   iPhone QA, Oct 31): a sideways finger drag that starts on a card's
   PHOTO scrolls the rail, on every rail; the photo changes only by its
   arrows; a tap opens the product.

   It broke because assets/js/card-photos.js gave every multi-photo
   card's image touch-action:pan-y and a swipe-to-step handler: the
   photo kept the drag, so rails of gallery cards (Mama's Fashion, Moda
   Mujer, the store rails...) stuck under the thumb while single-photo
   cards still let it through.

     node scripts/test/rail-swipe-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import http from "node:http";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { const r = await fn(); if (r === "skip") { console.log("    skip " + name); return; } passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}

await check("nothing on a card claims the horizontal touch", () => {
  /* The code, not its comments (which tell what broke). */
  const js = read("assets/js/card-photos.js").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(js, /touch-action\s*:\s*pan-y/);
  assert.doesNotMatch(js, /addEventListener\(\s*["']touch(start|move|end)/);
  /* The arrows still step the photo. */
  assert.match(js, /closest\("\.cp-nav"\)/);
  for (const f of ["index.html", "tienda.html", "departamento.html", "ofertas.html", "search.html", "card-grow.js"].map((x) => (x.endsWith(".js") ? "assets/js/" + x : x))) {
    if (!existsSync(ROOT + f)) continue;
    assert.doesNotMatch(read(f), /img\[data-g\]\s*\{[^}]*touch-action/, f);
  }
});

await check("headless: a finger swipe on a gallery card's photo scrolls the rail; the arrow steps the photo", async () => {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { return "skip"; }
  const PHOTO = readFileSync(ROOT + "assets/sections/tiendas-mall-row.jpg");
  const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
  const { handler } = await import(ROOT + "netlify/functions/tienda.js");
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.includes("exchange-rate")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75}'); return; }
    if (u.pathname === "/.netlify/functions/tienda") { const r = await handler({ httpMethod: "GET", queryStringParameters: Object.fromEntries(u.searchParams) }); res.writeHead(r.statusCode, { "Content-Type": "application/json" }); res.end(r.body); return; }
    let p = join(ROOT, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const url of ["/departamento.html?dept=women", "/tienda.html?tienda=victoriassecret"]) {
      const page = await ctx.newPage();
      await page.route((u) => u.host !== new URL(base).host, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/jpeg", body: PHOTO }) : r.abort());
      await page.goto(base + url, { waitUntil: "load" });
      await page.waitForTimeout(4000);
      const pos = await page.evaluate(() => {
        const r = [...document.querySelectorAll(".ariaRail, div.rail, .track")].find((x) => x.scrollWidth > x.clientWidth + 20 && [...x.children].some((c) => c.querySelector(".cp-nav")));
        if (!r) return null;
        r.setAttribute("data-t", "1"); r.scrollIntoView({ block: "center" }); r.scrollLeft = 0;
        const img = [...r.children].find((c) => c.querySelector(".cp-nav")).querySelector("img");
        const bb = img.getBoundingClientRect(); return { x: Math.min(bb.left + bb.width / 2, 300), y: bb.top + bb.height / 2 };
      });
      assert.ok(pos, `${url}: no gallery rail`);
      await page.waitForTimeout(400);
      const cdp = await ctx.newCDPSession(page);
      const pt = (x) => [{ x, y: pos.y, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(pos.x) });
      for (let k = 1; k <= 10; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(pos.x - k * 22) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(800);
      const left = await page.evaluate(() => document.querySelector("[data-t]").scrollLeft);
      assert.ok(left > 40, `${url}: the rail did not move (${left})`);
      const stepped = await page.evaluate(async () => {
        const card = [...document.querySelector("[data-t]").children].find((c) => c.querySelector(".cp-next"));
        card.querySelector(".cp-next").click(); await new Promise((z) => setTimeout(z, 1200));
        return [...card.querySelectorAll(".cp-dots i")].findIndex((d) => d.classList.contains("on")) === 1;
      });
      assert.ok(stepped, `${url}: the arrow did not step the photo`);
      await page.close();
    }
  } finally { await b.close(); srv.close(); }
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
