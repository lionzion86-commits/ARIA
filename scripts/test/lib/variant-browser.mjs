/* The product-page browser helpers the variant suites share (#443): a
   static server for the repo and a phone-sized page whose outside
   requests are stubbed (a photo per URL, never the store's). */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };
/* A photo per URL, never the store's (hosts are blocked here): its own
   colour and file name, so a swap is visible. */
export function stubPhoto(url) {
  let h = 0; for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const name = decodeURIComponent(url.replace(/[?#].*$/, "").split("/").pop() || "").replace(/[<&>"]/g, "").slice(0, 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="hsl(${h % 360},55%,62%)"/><text x="300" y="300" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#0A1F44">${name}</text><text x="300" y="345" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#0A1F44">foto de prueba</text></svg>`;
}
export function serve(root) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.includes("exchange-rate")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"venta":3.75,"rate":3.75}'); return; }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(404, { "Content-Type": "application/json" }); res.end("{}"); return; }
    let p = join(root, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}
export async function openPage(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on("pageerror", (e) => pg.errors.push(String(e).slice(0, 200)));
  await pg.route((u) => u.host !== new URL(base).host, (r) => r.request().resourceType() === "image"
    ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: stubPhoto(r.request().url()) }) : r.abort());
  return pg;
}
