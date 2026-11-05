/* ==================================================================
   ARIA HOME SHIELD -- partner desk in a real browser (390 px).

     node scripts/test/home-shield-partners-browser.mjs [outDir]

   Serves the worktree with a small node http server that runs the hs-*
   function handlers in-process against in-memory Blobs (the pattern of
   search-destinations-tests.mjs), then drives home-shield/pro: enroll ->
   pending verification -> (admin approves) -> live board -> a new case
   arrives (ping + toast) -> request it -> the homeowner shares contact ->
   Connected. Asserts no homeowner PII is on the page before the share,
   and that the ping's oscillator ran. Screenshots go to outDir.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
// hs endpoints are v2 functions (default export, #443 c.6666325601); the webhook is still Lambda-shaped.
const fnOf = (m) => m.default || m.handler;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.argv[2] || join(tmpdir(), "hs-screens");
mkdirSync(OUT, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

function memStore() {
  const m = new Map();
  const toBuf = (v) => (typeof v === "string" ? Buffer.from(v) : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v));
  return {
    m,
    get: async (k, o) => { if (!m.has(k)) return null; const v = m.get(k); if (o && o.type === "json") return JSON.parse(toBuf(v).toString()); if (o && o.type === "arrayBuffer") { const b = toBuf(v); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } return toBuf(v).toString(); },
    set: async (k, v) => { m.set(k, typeof v === "string" ? v : toBuf(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
const FN = join(ROOT, "netlify/functions");
const store = await import(join(FN, "_hs-store.js"));
const STORES = {};
store.__setStoreFactory((n) => (STORES[n] ||= memStore()));
store.__setMailer(async () => ({ sent: false, error: "test" }));
/* Storm data from the labelled FIXTURES (this sandbox cannot reach NOAA). */
const W = await import(join(FN, "_hs-storm.js"));
const FX = join(ROOT, "scripts/test/fixtures/hs-storm");
W.__setFetch(async (url) => {
  const pt = url.match(/alerts\/active\?point=([-\d.]+),/);
  const f = url.includes("geocoding.geo.census.gov") ? (/Main%20St/i.test(url) ? "census-address-miami.json" : "census-nomatch.json")
    : pt ? (Number(pt[1]) < 27 ? "nws-point-miami.json" : "nws-point-tampa.json")
    : url.includes("alerts/active?area=FL") ? "nws-alerts-FL.json" : url.includes("today_filtered") ? "spc-today.csv" : url.includes("yesterday_filtered") ? "spc-yesterday.csv" : null;
  if (!f) return { ok: false, status: 404 };
  const body = readFileSync(join(FX, f), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
});
process.env.ADMIN_EMAILS = "danny@correo.test";
const handlers = {};
async function fn(name) { return (handlers[name] ||= fnOf(await import(join(FN, name + ".js")))); }
async function call(name, method, body, cookie, query) {
  const r = await (await fn(name))({ httpMethod: method, headers: { cookie: cookie || "", "x-nf-client-connection-ip": "127.0.0.1" }, queryStringParameters: query || {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.statusCode, body: r.isBase64Encoded ? null : JSON.parse(r.body || "{}") };
}
STORES.sessions = memStore();
await STORES.sessions.setJSON("adm1n", { email: "danny@correo.test", createdAt: new Date().toISOString() });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/.netlify/functions/")) {
    const name = u.pathname.split("/").pop();
    if (!/^hs-[a-z-]+$/.test(name) || !existsSync(join(FN, name + ".js"))) { res.writeHead(404); return res.end(); }
    let body = "";
    for await (const ch of req) body += ch;
    const r = await (await fn(name))({ httpMethod: req.method, headers: { ...req.headers, "x-nf-client-connection-ip": "127.0.0.1" }, queryStringParameters: Object.fromEntries(u.searchParams), body });
    res.writeHead(r.statusCode, r.headers || {});
    return res.end(r.isBase64Encoded ? Buffer.from(r.body, "base64") : r.body);
  }
  let p = u.pathname;
  if (p === "/home-shield/pro" || p === "/home-shield/pro/") p = "/home-shield/pro/index.html";
  if (p === "/home-shield/admin") p = "/home-shield/admin.html";
  if (p === "/home-shield/partners" || p === "/home-shield/partners/") p = "/home-shield/partners/index.html";
  if (p === "/home-shield/partners/admin") p = "/home-shield/partners/admin.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;


const PII = ["Rosa", "Delgado", "555-0177", "rosa.d@correo.test"];
const mkCase = (zip) => call("hs-case-create", "POST", { consent: true, caseDraft: { issue: "roof", trades: ["roofer"], zip, urgency: "emergency",
  summary: "Shingles torn off the north slope in last night's storm; water is coming into the hallway ceiling. Policy uploaded; hurricane deductible 2%.",
  policyFlags: ["Hurricane deductible: 2% of the dwelling limit", "Roof losses are paid at actual cash value (depreciated), not full replacement cost"] },
  contact: { name: "Rosa Delgado", phone: "(305) 555-0177", email: "rosa.d@correo.test" } });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { window.__osc = 0; const AC = window.AudioContext; if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return o.call(this); }; } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name, full = false) => { await page.waitForTimeout(500); const p = join(OUT, `hs-partners-${name}.png`); await page.screenshot({ path: p, fullPage: full }); console.log("    shot " + p); };
let passed = 0;
const ok = (m) => { passed++; console.log("    ok   " + m); };
try {
  await page.goto(`${BASE}/home-shield/partners?signup=1`);
  await page.waitForSelector("#af [name=desk]");
  assert.equal(await page.locator("input[name=desk]").count(), 4, "four desks");
  const FORBID = /\broofers?\b|techero|techador|contratista de techos/i;
  assert.match(await page.textContent(".desks"), /Contractor[\s\S]*Public adjuster[\s\S]*Attorney[\s\S]*Insurance agent/);
  assert.ok(!FORBID.test(await page.evaluate(() => document.body.innerText)), "no roofer wording (EN)");
  await page.evaluate(() => document.querySelector(".desks").scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -80));
  await shot("chooser-en");
  await page.click('[data-lang="es"]');
  assert.match(await page.textContent(".desks"), /Contratista[\s\S]*Ajustador público[\s\S]*Abogado[\s\S]*Agente de seguros/);
  assert.ok(!FORBID.test(await page.evaluate(() => document.body.innerText)), "no techero wording (ES)");
  await page.evaluate(() => { document.querySelector(".desks").scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
  await shot("chooser-es");
  await page.click('[data-lang="en"]');
  ok("four-desk chooser, Contractor wording, EN and ES");
  await page.check('input[name=desk][value="roofer"]');
  await page.fill("[name=name]", "Josh Carter"); await page.fill("[name=company]", "Coastline Roofing");
  await page.fill("[name=email]", "josh@correo.test"); await page.fill("[name=phone]", "(786) 555-0100");
  await page.fill("[name=password]", "correct horse battery"); await page.fill("[name=licenseNumber]", "CCC1330000");
  await page.fill("[name=centerZip]", "33130"); await page.check("[name=attest]");
  await shot("1-enroll");
  await page.click("#af [type=submit]");
  await page.waitForSelector("#re");
  ok("desk enrollment -> pending verification");
  const pros = await call("hs-admin-pros", "GET", null, "aria_session=adm1n");
  await call("hs-admin-verify", "POST", { proId: pros.body.pros[0].id, verified: true }, "aria_session=adm1n");
  await page.click("#re");
  await page.waitForSelector("#ol");
  await page.click("#ol");
  await page.waitForSelector(".radar.on");
  ok("desk opens; radar online");
  await page.waitForSelector("#storm svg circle[fill='#E07A6E']");
  assert.equal(await page.evaluate(() => document.querySelector("#app").firstElementChild.id), "storm", "storm panel is first");
  const box = await page.locator("#storm").boundingBox();
  assert.ok(box.y < 140, "storm panel at the top of the screen");
  const stxt = await page.textContent("#storm");
  assert.ok(/Hurricane Warning/.test(stxt) && /Moving northwest 12 mph/.test(stxt) && /NOAA \/ NWS \/ SPC/.test(stxt));
  assert.ok(!/ORLANDO|VALDOSTA|CLEARWATER/.test(stxt), "reports outside the radius are not listed");
  assert.ok(!/Tornado Watch/.test(stxt), "Miami desk: no Tampa watch");
  ok("storm panel renders first: alerts, movement, reports in radius, attribution");
  await page.fill("#stormForm [name=q]", "123 Main St, Miami FL");
  await page.click("#stormForm [type=submit]");
  await page.waitForSelector("#stormMine");
  assert.match(await page.textContent("#storm"), /Results for: 123 MAIN ST, MIAMI, FL, 33130/);
  await page.fill("#stormForm [name=q]", "Tampa, FL");
  await page.click("#stormForm [type=submit]");
  await page.waitForFunction(() => /Tampa area, FL/.test(document.querySelector("#storm").textContent));
  const tt = await page.textContent("#storm");
  assert.ok(/Tornado Watch/.test(tt) && /approximate location/.test(tt) && /CLEARWATER/.test(tt));
  ok("storm search: address and city, point alerts, approximate label");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("0c-storm-search-en");
  await page.click('[data-lang="es"]');
  assert.match(await page.textContent("#storm"), /Resultados para: Tampa area, FL/);
  await shot("0d-storm-search-es");
  await page.click('[data-lang="en"]');
  await page.click("#stormMine");
  await page.waitForFunction(() => !document.querySelector("#stormMine") && /Hurricane Warning/.test(document.querySelector("#storm").textContent));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("0-storm");
  await page.click('[data-lang="es"]');
  assert.match(await page.textContent("#storm"), /Daños por tormenta de hoy/);
  await shot("0b-storm-es");
  await page.click('[data-lang="en"]');
  const c = await mkCase("33135");
  await page.waitForSelector(".case.ring", { timeout: 15000 });
  await page.waitForSelector(".toast");
  assert.ok((await page.evaluate(() => window.__osc)) >= 2, "ring ping played");
  let txt = await page.textContent("#app");
  for (const n of PII) assert.ok(!txt.includes(n), "ring leaked " + n);
  ok("lead rings: countdown, ping, toast, no contact");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("2-ringing");
  await page.click("[data-answer]");
  await page.waitForSelector(".lock");
  txt = await page.textContent("#app");
  for (const n of PII) assert.ok(!txt.includes(n), "answered leaked " + n);
  const st = await call("hs-case-status", "GET", null, "", { c: c.body.caseId, t: c.body.token });
  await call("hs-offer-respond", "POST", { caseId: c.body.caseId, token: c.body.token, offerId: st.body.offers[0].id, action: "accept" });
  await page.waitForSelector(".contact", { timeout: 15000 });
  assert.ok((await page.textContent("#app")).includes("Rosa Delgado"));
  ok("contact only after the homeowner shares and the (free sample) claim is paid");
  await page.evaluate(() => document.querySelector(".contact").scrollIntoView({ block: "center" }));
  await shot("3-claim-contact");
  await page.click('[data-lang="es"]');
  assert.match(await page.textContent("#app"), /Mis reclamos/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("4-es");
  await page.click('[data-lang="en"]');
  ok("Espanol");
  await shot("5-desk-full", true);
  await ctx.addCookies([{ name: "aria_session", value: "adm1n", url: BASE }]);
  const ap = await ctx.newPage();
  await ap.goto(`${BASE}/home-shield/partners/admin`);
  await ap.waitForSelector("#sf");
  await ap.screenshot({ path: join(OUT, "hs-partners-6-admin.png") }); console.log("    shot " + join(OUT, "hs-partners-6-admin.png"));
  assert.ok(!FORBID.test(await ap.evaluate(() => document.body.innerText)), "partners admin wording");
  ok("admin settings + partners");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, "no horizontal scroll");
  assert.deepEqual(errors, []);
  ok("no horizontal scroll, no page errors");
} finally { await browser.close(); server.close(); }
console.log(`\n  ${passed} passed`);
