/* ==================================================================
   EVERY "VER TODO" OPENS FULL CARDS (#443 c.6398965809, Danny,
   2026-10-25: "every section with a Ver mas / Ver todo expand gets
   OPENED and VERIFIED -- every single one, no sampling").

   Serves the repo with the department function answering in-process
   (the same answer() Netlify runs), opens each department page at
   phone width, scrolls every carousel in, presses every "Ver todo" and
   checks the overlay: as many cards as the count promises (first page,
   48 at most), every card with a name and a price, and no card cut to
   a sliver (under 200px tall).

     node scripts/test/expand-view-audit.mjs                 # every department
     DEPTS=perfumes,beauty node scripts/test/expand-view-audit.mjs
     EXTRA="perfumes&q=Prada" node scripts/test/expand-view-audit.mjs

   Off-site requests (photos) are aborted: a card is checked for its
   photo URL, not for the photo loading.
   ================================================================== */
import http from "node:http";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
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

const all = readdirSync(join(ROOT, "assets/sections/departamento")).filter((d) => !d.startsWith("_"));
const depts = (process.env.DEPTS ? process.env.DEPTS.split(",") : all).filter(Boolean);
const pages = [...depts, ...(process.env.EXTRA ? process.env.EXTRA.split(",") : [])].map((d) => `departamento.html?dept=${d}`);

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const rows = [];
for (const path of pages) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await pg.goto(`${BASE}/${path}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3000);
  /* THE IPHONE'S SQUEEZE, FORCED (#443 c.6398974665). On Danny's phone the
     overlay's rows were fitted to the screen instead of to the cards:
     33 cards became label-only pills, 49 became blank outlines. Chromium
     sizes them correctly on its own, so the audit forces that behaviour
     and the overlay must still draw full cards under it. */
  await pg.addStyleTag({ content: ".re-grid{grid-auto-rows:minmax(0,1fr) !important}" });
  for (let y = 0; y < 25; y++) { await pg.mouse.wheel(0, 2000); await pg.waitForTimeout(200); }
  await pg.waitForTimeout(1500);
  const doors = () => [...document.querySelectorAll(".rail-sec")].filter((s) => s.offsetParent && [...s.querySelectorAll("button,a")].some((e) => /Ver todo/.test(e.textContent)));
  const n = await pg.evaluate(`(${doors})().length`);
  for (let i = 0; i < n; i++) {
    const rail = await pg.evaluate(`(() => { const s = (${doors})()[${i}]; [...s.querySelectorAll("button,a")].find((e) => /Ver todo/.test(e.textContent)).click(); return ((s.querySelector("h2") || {}).textContent || "").trim(); })()`);
    await pg.waitForFunction(() => { const g = document.getElementById("reGrid"); return g && !g.querySelector(".card.sk"); }, null, { timeout: 30000 }).catch(() => {});
    const r = await pg.evaluate(() => {
      const g = document.getElementById("reGrid");
      const cards = [...g.querySelectorAll(".card:not(.sk)")];
      return {
        count: document.getElementById("reCount").textContent,
        cards: cards.length,
        noName: cards.filter((c) => !((c.querySelector(".card-title") || {}).textContent || "").trim()).length,
        noPrice: cards.filter((c) => !/\d/.test((c.querySelector(".price") || {}).textContent || "")).length,
        noPhoto: cards.filter((c) => !c.querySelector("img")).length,
        /* a card cut to a sliver (the iPhone failure, c.6398974665) */
        squeezed: cards.filter((c) => c.getBoundingClientRect().height < 200).length,
        failed: !!g.querySelector("#reMoreWrap p"),
      };
    });
    const promised = Math.min(48, parseInt(String(r.count).replace(/\D/g, ""), 10) || 0);
    rows.push({ page: path, rail, ...r, pass: !r.failed && r.cards === promised && !r.noName && !r.noPrice && !r.squeezed });
    await pg.evaluate(() => closeRailExpand());
  }
  if (errs.length) rows.push({ page: path, rail: "(page errors)", errors: errs.slice(0, 3), pass: false });
  await pg.close();
}
await browser.close();
server.close();

const failed = rows.filter((r) => !r.pass);
for (const r of rows) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.page.replace("departamento.html?dept=", "")} | ${r.rail} | ${r.count || ""} | cards ${r.cards ?? "-"}${r.noName ? " no-name " + r.noName : ""}${r.noPrice ? " no-price " + r.noPrice : ""}${r.noPhoto ? " no-photo " + r.noPhoto : ""}${r.squeezed ? " squeezed " + r.squeezed : ""}${r.errors ? " " + r.errors.join("; ") : ""}`);
console.log(`\n  ${rows.length - failed.length} passed, ${failed.length} failed (${pages.length} pages)\n`);
if (failed.length) process.exit(1);
