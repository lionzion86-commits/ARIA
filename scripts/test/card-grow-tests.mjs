/* ==================================================================
   EVERY CAROUSEL'S CARDS GROW (#443 interaction standard, Danny
   2026-10-25: "It must be UNIVERSAL: every carousel/shelf on the page").

   Serves the repo with the department function answering in-process and
   opens each page that has carousels:

     phone (390px, touch)  scroll a row: every card stays flat at rest
                           (Danny's #522 review: magnification is
                           hover-only, never a resting state);
     desktop (pointer)     hovering a card grows it to 1.12 and lifts it;
                           no phone focus on a pointer;
     reduced motion        nothing grows;
     mountain              on a 4x-throttled phone, a row swiped back and
                           forth (three times each way) costs no more long
                           tasks with the focus script than without it.

     node scripts/test/card-grow-tests.mjs
     PAGES="ofertas.html" node scripts/test/card-grow-tests.mjs

   Off-site requests (photos) are aborted.
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { answer } from "../../netlify/functions/_department-core.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/.netlify/functions/department") {
    try { const o = answer(Object.fromEntries(u.searchParams)); res.writeHead(o.status, { "Content-Type": "application/json" }); res.end(JSON.stringify(o.body)); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
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

/* Danny's spot checks are an Ofertas shelf and a store rail; the rest are
   the other kinds of carousel the file has to cover. */
const PAGES = (process.env.PAGES || "ofertas.html,tienda.html?tienda=abercrombie,index.html,departamento.html?dept=perfumes,departamento.html?dept=beauty,ropa-interior.html").split(",");
const ROW = ".ariaRail:not(#liveRefineChips), div.rail, .track, .rel-row";

const scaleOf = (t) => { const m = /matrix\(([^,]+),\s*([^,]+)/.exec(t || ""); return m ? Math.hypot(+m[1], +m[2]) : 1; };

async function open(ctx, path, { blockGrow = false } = {}) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  if (blockGrow) await pg.route(/card-grow\.js/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await pg.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(2500);
  for (let y = 0; y < 12; y++) { await pg.mouse.wheel(0, 900); await pg.waitForTimeout(150); }
  await pg.waitForTimeout(1200);
  /* the first row with three real cards, brought to the middle of the screen */
  const found = await pg.evaluate((ROW) => {
    const rows = [...document.querySelectorAll(ROW)].filter((r) => r.offsetParent && [...r.children].filter((c) => /^(A|BUTTON)$/.test(c.tagName) && !c.classList.contains("sk")).length >= 3);
    if (!rows.length) return false;
    rows[0].setAttribute("data-grow-probe", "");
    rows[0].scrollIntoView({ block: "center" });
    return true;
  }, ROW);
  await pg.waitForTimeout(400);
  return { pg, errs, found };
}

const rows = [];
const check = (page, what, pass, note = "") => rows.push({ page, what, pass, note });

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const still = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

for (const path of PAGES) {
  /* phone */
  {
    const { pg, errs, found } = await open(phone, path);
    check(path, "phone: a carousel with cards", found);
    if (found) {
      await pg.evaluate(() => { const r = document.querySelector("[data-grow-probe]"); r.style.scrollSnapType = "none"; r.scrollLeft += 260; });
      await pg.waitForTimeout(800);
      const r = await pg.evaluate(() => {
        const row = document.querySelector("[data-grow-probe]");
        const cards = [...row.children].filter((c) => /^(A|BUTTON)$/.test(c.tagName) && !c.classList.contains("sk"));
        const grown = cards.filter((c) => { const t = getComputedStyle(c).transform; return t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)"; });
        return { n: cards.length, grown: grown.length, focus: document.querySelectorAll(".is-focus").length };
      });
      check(path, "phone: every card flat at rest after a scroll (no magnified card)", r.n > 0 && r.grown === 0 && r.focus === 0, `${r.grown} of ${r.n} transformed, is-focus ${r.focus}`);
      /* a grown card, or the row's room around it, never covers a link or
         button outside the row ("Ver todo" in the heading above) */
      const covered = await pg.evaluate(async (ROW) => {
        const out = [];
        for (const row of [...document.querySelectorAll(ROW)].filter((x) => x.offsetParent)) {
          const rb = row.getBoundingClientRect();
          for (const e of document.querySelectorAll("a, button")) {
            if (row.contains(e) || !e.offsetParent) continue;
            const b = e.getBoundingClientRect();
            if (!b.width || b.bottom <= rb.top - 40 || b.top >= rb.bottom + 40 || b.right <= rb.left || b.left >= rb.right) continue;
            if (b.top < 0 || b.bottom > innerHeight) { e.scrollIntoView({ block: "center" }); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60))); }
            const bb = e.getBoundingClientRect(), hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
            if (hit && hit !== e && !e.contains(hit) && hit.closest(ROW)) out.push((e.textContent || "").trim().slice(0, 24));
          }
        }
        return out;
      }, ROW);
      check(path, "phone: nothing in a row covers a link next to it", !covered.length, covered.slice(0, 4).join(", "));
    }
    check(path, "phone: no page errors", !errs.length, errs.slice(0, 2).join("; "));
    await pg.close();
  }
  /* desktop */
  {
    const { pg, found } = await open(desk, path);
    if (found) {
      const card = pg.locator("[data-grow-probe] > :is(a, button):not(.sk)").nth(1);
      await card.hover();
      await pg.waitForTimeout(800);
      const r = await card.evaluate((c) => ({ t: getComputedStyle(c).transform, sh: getComputedStyle(c).boxShadow, focus: document.querySelectorAll(".is-focus").length }));
      check(path, "desktop: hover scale 1.12 with a shadow", Math.abs(scaleOf(r.t) - 1.12) < 0.005 && r.sh !== "none", r.t);
      check(path, "desktop: no phone focus on a pointer", r.focus === 0, `is-focus ${r.focus}`);
    } else check(path, "desktop: a carousel with cards", false);
    await pg.close();
  }
  /* reduced motion */
  {
    const { pg, found } = await open(still, path);
    if (found) {
      await pg.evaluate(() => { document.querySelector("[data-grow-probe]").scrollLeft += 260; });
      await pg.waitForTimeout(600);
      const r = await pg.evaluate(() => ({ focus: document.querySelectorAll(".is-focus").length,
        grown: [...document.querySelectorAll("[data-grow-probe] > *")].filter((c) => getComputedStyle(c).transform !== "none").length }));
      check(path, "reduced motion: nothing grows", r.focus === 0 && r.grown === 0, `is-focus ${r.focus}, transformed ${r.grown}`);
    }
    await pg.close();
  }
}

/* mountain: long tasks while a row is swiped, with and without the script */
const MOUNTAIN = process.env.MOUNTAIN_PAGE || "index.html";
async function longTasks(blockGrow) {
  const { pg, found } = await open(phone, MOUNTAIN, { blockGrow });
  if (!found) { await pg.close(); return null; }
  const cdp = await phone.newCDPSession(pg);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const out = await pg.evaluate(() => new Promise((done) => {
    const row = document.querySelector("[data-grow-probe]");
    row.style.scrollSnapType = "none";
    let long = 0, worst = 0;
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => { long++; worst = Math.max(worst, e.duration); }));
    po.observe({ entryTypes: ["longtask"] });
    const t0 = performance.now();
    (function step() {
      const t = performance.now() - t0;
      row.scrollLeft = 600 * (0.5 - 0.5 * Math.cos(t / 400));
      if (t < 3000) requestAnimationFrame(step);
      else setTimeout(() => { po.disconnect(); done({ long, worst: Math.round(worst) }); }, 300);
    })();
  }));
  await pg.close();
  return out;
}
/* three swipes each way: the page's own work throws a stray long task now
   and then, with or without the script */
const sum = (a) => a.every(Boolean) ? { long: a.reduce((n, r) => n + r.long, 0), worst: Math.max(...a.map((r) => r.worst)) } : null;
const runs = [];
for (let i = 0; i < 3; i++) runs.push([await longTasks(true), await longTasks(false)]);
const without = sum(runs.map((r) => r[0])), withGrow = sum(runs.map((r) => r[1]));
check(MOUNTAIN, "mountain: swiping a row costs no extra long tasks", !!(without && withGrow) && withGrow.long <= without.long + 2,
  without && withGrow ? `long tasks over 3 swipes ${without.long} without / ${withGrow.long} with; worst ${without.worst}ms / ${withGrow.worst}ms` : "no row");

await browser.close();
server.close();

const failed = rows.filter((r) => !r.pass);
for (const r of rows) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.page} | ${r.what}${r.note ? " | " + r.note : ""}`);
console.log(`\n  ${rows.length - failed.length} passed, ${failed.length} failed\n`);
if (failed.length) process.exit(1);
