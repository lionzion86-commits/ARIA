/* ==================================================================
   THE DNI SECTION AT CHECKOUT, IN A PHONE BROWSER (#443).

   checkout.html at 390 px against a local static server. The function
   endpoints are stubbed here; dni-upload answers through the real
   validation rules (_dni-docs.js validateUpload). Every photo is a TEST
   FIXTURE of random pixels, not a document.

   Checks:
     - the section renders: two slots, camera + library, guidance line;
     - a camera-size photo is compressed ON the phone before upload
       (the request carries a few hundred KB, not the original);
     - preview, "Foto lista", progress bar; a failed upload keeps the
       photo and "Reintentar" resends just it;
     - Pagar refuses without both photos, and sends both tokens with;
     - choosing "someone else receives" restarts the slots and relabels;
     - a Key Club member with a saved document sees it instead of slots
       and Pagar sends dniDocs: null.
   Phone screenshots go to reports/screens/dni-checkout-*.png.

   RUN: node scripts/test/dni-checkout-browser-tests.mjs
   Port: DNI_BROWSER_PORT (default 8994).
   ================================================================== */
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import jpegjs from "jpeg-js";
import { validateUpload, newDocId } from "../../netlify/functions/_dni-docs.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.message).split("\n").slice(0, 14).join("\n         ")); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
if (!chromium) { console.log("  (skipped: no Playwright)"); process.exit(0); }

/* TEST FIXTURE: a camera-sized JPEG of random pixels (~3000 x 2000). */
const SHOTS = join(ROOT, "reports/screens");
mkdirSync(SHOTS, { recursive: true });
const FIXTURE = join(SHOTS, "..", "..", "scripts/test/.dni-fixture.jpg");
function bigPhoto(w = 2400, h = 1600) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = (x * 7 + y * 3) % 256; data[i + 1] = (x * y) % 251; data[i + 2] = (x ^ y) % 241; data[i + 3] = 255;
  }
  return jpegjs.encode({ data, width: w, height: h }, 92).data;
}
const fixtureBytes = bigPhoto();
writeFileSync(FIXTURE, fixtureBytes);

const state = { uploads: [], failNext: 0, orders: [], member: null };
async function fn(name, req, body) {
  if (name === "exchange-rate") return [200, { compra: 3.72, venta: 3.75, fecha: "2026-10-22" }];
  if (["wallet-get", "cart-save", "cart-get"].includes(name)) return [401, { error: "No autenticado" }];
  if (name === "founders-status") return [200, {}];
  if (name === "auth-me") return [200, { email: state.member ? "socia@correo.test" : null }];
  if (name === "dni-pack") return [200, state.member ? { signedIn: true, recipients: state.member } : { signedIn: false, recipients: [] }];
  if (name === "dni-upload") {
    const b = JSON.parse(body || "{}");
    state.uploads.push({ side: b.side, bytes: Buffer.from(String(b.data || ""), "base64").length });
    if (state.failNext > 0) { state.failNext--; return [500, { error: "No pudimos guardar la foto. Vuelve a intentarlo; el resto de tu pedido sigue aquí." }]; }
    const v = validateUpload(b);
    return v.ok ? [200, { token: newDocId(), side: b.side }] : [400, { error: v.error }];
  }
  if (name === "orders-create") { state.orders.push(JSON.parse(body)); return [400, { error: "Prueba: pedido capturado, no se cobró nada." }]; }
  if (name === "shipping-quote") {
    const b = JSON.parse(body || "{}");
    const flete = Math.round(Math.max(1, Number(b.peso_kg) || 1) * 9 * 100) / 100;
    const total = Math.round(((Number(b.valor_usd) || 0) + flete) * 100) / 100;
    return [200, { total_usd: total, total_pen: Math.round(total * 3.75 * 100) / 100, flete_usd: flete, source: "avi" }];
  }
  if (name === "resolve-weight") {
    const { handler } = await import(join(ROOT, "netlify/functions/resolve-weight.js"));
    const r = await handler({ httpMethod: req.method, headers: req.headers, body, queryStringParameters: {} }, {});
    return [r.statusCode, JSON.parse(r.body)];
  }
  return [404, { error: "no function " + name }];
}

/* The page loads Tailwind from cdn.tailwindcss.com, which this sandbox
   cannot reach. The same classes are compiled here with the repo's own
   tailwindcss and served in its place, so the screenshots are styled as
   the phone sees them. */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
function checkoutTailwind() {
  const dir = mkdtempSync(join(tmpdir(), "dni-tw-"));
  writeFileSync(join(dir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(join(dir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
  const r = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(dir, "tw.config.cjs"), "-i", join(dir, "in.css"), "-o", join(dir, "out.css")], { encoding: "utf8" });
  return r.status === 0 ? readFileSync(join(dir, "out.css"), "utf8") : "";
}
const TW_CSS = checkoutTailwind();
const TYPES = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PORT = Number(process.env.DNI_BROWSER_PORT || 8994);
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", async () => {
    try {
      const u = new URL(req.url, "http://x");
      if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
      const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
      if (m) {
        const [code, json] = await fn(m[1], req, body);
        res.writeHead(code, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(json));
      }
      let p = join(ROOT, decodeURIComponent(u.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
      if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(readFileSync(p));
    } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
  });
});
await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${PORT}`;
const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

/* A cart line (a real catalogue title is not needed for this section). */
const CART = [{ retailer: "zumiez", title: "Fixture Graphic Tee", priceUsd: 24, dutiableUsd: 22.43, weightKg: 0.25, weightEstimated: true, qty: 1, image: "" }];
async function openCheckout() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.host === `127.0.0.1:${PORT}`) return route.continue();
    if (u.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
    if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/terminos.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate((c) => localStorage.setItem("aria_cart_v1", JSON.stringify(c)), CART);
  await page.goto(`${BASE}/checkout.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#dniSection", { state: "visible", timeout: 30000 });
  return { context, page };
}
async function fillForm(page) {
  await page.fill("#custName", "Ana Prueba");
  await page.fill("#custEmail", "ana@correo.test");
  await page.fill("#custPhone", "+51 900 000 000");
  await page.fill("#custDoc", "45678912");
  await page.fill("#addrLine", "Av. Prueba 123");
  await page.fill("#addrDistrict", "Surco");
  await page.selectOption("#addrRegion", "Lima");
  await page.selectOption("#destCity", "Lima");
  /* Lima's own reparto still asks for a last-mile choice: take the first real one. */
  await page.waitForFunction(() => document.querySelectorAll("#courierSelect option:not([disabled])").length > 0, null, { timeout: 10000 }).catch(() => {});
  const opt = await page.$$eval("#courierSelect option", (os) => (os.find((o) => !o.disabled && o.value) || {}).value);
  if (opt) await page.selectOption("#courierSelect", opt);
}
const shot = (page, name) => page.locator("#dniSection").screenshot({ path: join(SHOTS, `dni-checkout-${name}.png`) });
const slotText = (page, side) => page.$eval(`.dniSlot[data-side="${side}"] .dniStatusText`, (e) => e.textContent.trim());

await check("the section renders under the address: two slots, camera + library, guidance, Spanish labels", async () => {
  const { context, page } = await openCheckout();
  try {
    const titles = await page.$$eval(".dniSlotTitle", (els) => els.map((e) => e.textContent.trim()));
    assert(titles.join("|") === "Foto de tu DNI — frente|Foto de tu DNI — reverso", "titles: " + titles);
    assert((await page.$$('.dniSlot input[type=file][capture="environment"]')).length === 2, "no camera input per slot");
    assert((await page.$$('.dniSlot input[type=file][data-pick="library"]')).length === 2, "no library input per slot");
    assert(/cuatro esquinas/.test(await slotText(page, "front")), "no guidance line");
    assert(/30 días después de la entrega/.test(await page.textContent("#dniKeepNote")), "guest retention note missing");
    await shot(page, "empty");
  } finally { await context.close(); }
});

await check("a camera-size photo is shrunk on the phone; preview, progress and 'Foto lista'; a failed upload retries just that photo", async () => {
  state.uploads.length = 0;
  state.failNext = 1;
  const { context, page } = await openCheckout();
  try {
    await page.setInputFiles('.dniSlot[data-side="front"] input[data-pick="camera"]', FIXTURE);
    await page.waitForSelector('.dniSlot[data-side="front"] .dniRetry', { state: "visible", timeout: 30000 });
    assert(await page.isVisible('.dniSlot[data-side="front"] .dniRetry'), "no retry button after a failed upload");
    assert(await page.isVisible('.dniSlot[data-side="front"] .dniPreview img'), "the preview vanished on failure");
    await shot(page, "retry");
    await page.click('.dniSlot[data-side="front"] .dniRetry');
    await page.waitForFunction(() => document.querySelector('.dniSlot[data-side="front"] .dniStatusText').textContent.includes("Foto lista"), null, { timeout: 30000 });
    await page.setInputFiles('.dniSlot[data-side="back"] input[data-pick="library"]', FIXTURE);
    await page.waitForFunction(() => document.querySelector('.dniSlot[data-side="back"] .dniStatusText').textContent.includes("Foto lista"), null, { timeout: 30000 });
    assert(state.uploads.length === 3, `${state.uploads.length} uploads (want: fail, retry, back)`);
    const biggest = Math.max(...state.uploads.map((u) => u.bytes));
    assert(biggest <= 600 * 1024 && biggest < fixtureBytes.length / 2, `uploaded ${biggest} bytes of a ${fixtureBytes.length}-byte original`);
    await shot(page, "ready");
    return `original ${(fixtureBytes.length / 1024).toFixed(0)} KB -> sent ${(biggest / 1024).toFixed(0)} KB`;
  } finally { await context.close(); }
});

await check("Pagar (the phone's bottom button) refuses without both photos, then sends both tokens", async () => {
  state.orders.length = 0; state.failNext = 0;
  const { context, page } = await openCheckout();
  try {
    await fillForm(page);
    await page.setInputFiles('.dniSlot[data-side="front"] input[data-pick="camera"]', FIXTURE);
    await page.waitForFunction(() => document.querySelector('.dniSlot[data-side="front"] .dniStatusText').textContent.includes("Foto lista"), null, { timeout: 30000 });
    await page.evaluate(() => document.getElementById("checkoutForm").requestSubmit());
    await page.waitForTimeout(400);
    assert(state.orders.length === 0, "an order was posted with one photo");
    assert(/Falta la foto del DNI/.test(await page.textContent("body")), "no message for the missing photo");
    await page.setInputFiles('.dniSlot[data-side="back"] input[data-pick="camera"]', FIXTURE);
    await page.waitForFunction(() => document.querySelector('.dniSlot[data-side="back"] .dniStatusText').textContent.includes("Foto lista"), null, { timeout: 30000 });
    await page.waitForFunction(() => !document.getElementById("payBtnEnd").disabled, null, { timeout: 30000 });
    await page.click("#payBtnEnd");
    await page.waitForFunction(() => true, null, { timeout: 1000 });
    for (let i = 0; i < 50 && !state.orders.length; i++) await page.waitForTimeout(200);
    assert(state.orders.length === 1, "Pagar did not post the order; toast: " + (await page.textContent("#toast")) + " | invalid: " + (await page.evaluate(() => [...document.querySelectorAll("#checkoutForm :invalid")].map((e) => e.id || e.name).join(","))));
    const d = state.orders[0].dniDocs;
    assert(d && /^[a-f0-9]{32}$/.test(d.front) && /^[a-f0-9]{32}$/.test(d.back) && d.front !== d.back, "tokens not sent: " + JSON.stringify(d));
  } finally { await context.close(); }
});

await check("someone else receives: the slots restart and relabel for the recipient", async () => {
  const { context, page } = await openCheckout();
  try {
    await page.setInputFiles('.dniSlot[data-side="front"] input[data-pick="camera"]', FIXTURE);
    await page.waitForFunction(() => document.querySelector('.dniSlot[data-side="front"] .dniStatusText').textContent.includes("Foto lista"), null, { timeout: 30000 });
    await page.check("#altRecipientToggle");
    assert((await page.textContent("#dniHeading")).trim() === "Foto del DNI de quien recibe", "heading not relabelled");
    assert(!(await page.isVisible('.dniSlot[data-side="front"] .dniPreview img')), "the buyer's photo stayed for the recipient");
  } finally { await context.close(); }
});

await check("a Key Club member with the document saved sees it instead of the slots; Pagar sends dniDocs: null", async () => {
  state.orders.length = 0;
  state.member = [{ docNumber: "45678912", name: "Ana Prueba", updatedAt: "2026-10-22T00:00:00Z" }];
  const { context, page } = await openCheckout();
  try {
    await fillForm(page);
    await page.waitForSelector("#dniSaved", { state: "visible", timeout: 10000 });
    assert(!(await page.isVisible("#dniSlots")), "the upload slots still show for a saved document");
    assert(/terminado en 912/.test(await page.textContent("#dniSavedLabel")), "saved label");
    assert(/no te lo volveremos a pedir/.test(await page.textContent("#dniKeepNote")), "member note missing");
    await shot(page, "keyclub-saved");
    await page.waitForFunction(() => !document.getElementById("payBtnEnd").disabled, null, { timeout: 30000 });
    await page.click("#payBtnEnd");
    for (let i = 0; i < 50 && !state.orders.length; i++) await page.waitForTimeout(200);
    assert(state.orders.length === 1 && state.orders[0].dniDocs === null, "saved pack: " + JSON.stringify(state.orders[0] && state.orders[0].dniDocs));
    await page.fill("#custDoc", "11112222");
    assert(await page.isVisible("#dniSlots"), "another document number must ask for photos");
  } finally { await context.close(); state.member = null; }
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
