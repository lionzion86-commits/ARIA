/* ==================================================================
   ARIA HOME SHIELD -- pro dashboard in a real browser (390 px).

     node scripts/test/home-shield-pro-browser.mjs [outDir]

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
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const PII = ["Maribel", "Quintero", "305", "0142", "maribel.q@correo.test", "1234 NW", "CLM-2024-88812", "HO3-4471920"];
const caseBody = (over = {}) => ({
  consent: true,
  caseDraft: { issue: "denied_claim", trades: ["public_adjuster"], zip: "33135", urgency: "soon",
    summary: "My name is Maribel Quintero. After Hurricane Milton shingles lifted and water stained the bedroom ceiling. The insurer denied the claim as wear and tear and long-term seepage. Call me at 305-555-0142. 1234 NW 5th Street.",
    claimNumber: "CLM-2024-88812", policyNumber: "HO3-4471920", address: "1234 NW 5th Street, Apt 4B", insurer: "Citizens",
    policyFlags: ["Hurricane deductible: 2% of the dwelling limit", "Roof losses are paid at actual cash value (depreciated), not full replacement cost", "Water / mold damage sublimit: $10,000"], ...over },
  contact: { name: "Maribel Quintero", phone: "(305) 555-0142", email: "maribel.q@correo.test", preferred: "text" },
});
const older = await call("hs-case-create", "POST", caseBody({ issue: "underpaid_claim", zip: "33145", urgency: "planning", policyFlags: [],
  summary: "Kitchen pipe burst in August. The carrier paid for drywall only, not cabinets or flooring. Mitigation invoice was cut by half." }));
assert.equal(older.status, 200);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  window.__osc = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return o.call(this); }; }
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => { await page.waitForTimeout(600); const p = join(OUT, `hs-pro-${name}.png`); await page.screenshot({ path: p, fullPage: false }); console.log("    shot " + p); };
let passed = 0;
const ok = (m) => { passed++; console.log("    ok   " + m); };

try {
  /* 1. Sign in screen, then enroll. */
  await page.goto(`${BASE}/home-shield/pro`);
  await page.waitForSelector("#authForm");
  await shot("1-signin");
  await page.goto(`${BASE}/home-shield/pro?signup=1`);
  await page.waitForSelector("#authForm [name=licenseNumber]");
  ok("?signup=1 opens enrollment");
  await page.fill("[name=name]", "Ana Ruiz");
  await page.fill("[name=company]", "Coastline Public Adjusters");
  await page.fill("[name=email]", "ana@correo.test");
  await page.fill("[name=phone]", "(786) 555-0100");
  await page.fill("[name=password]", "correct horse battery");
  await page.locator("label.chip-in", { hasText: "Public adjuster" }).click();
  await page.selectOption("[name=licenseType]", "public_adjuster");
  await page.fill("[name=licenseNumber]", "W123456");
  await page.fill("[name=centerZip]", "33130");
  await page.selectOption("[name=radiusMiles]", "25");
  await page.check("[name=attest]");
  await shot("2-enroll");
  await page.click("#authForm [type=submit]");
  await page.waitForSelector("#recheck");
  assert.match(await page.textContent("#app"), /verifying your license/);
  ok("enrollment lands on pending verification");
  await shot("3-pending");

  /* 2. Admin approves; the pro checks again and lands on the live board. */
  const pros = await call("hs-admin-pros", "GET", null, "aria_session=adm1n");
  const proId = pros.body.pros.find((p) => p.email === "ana@correo.test").id;
  assert.equal((await call("hs-admin-verify", "POST", { proId, verified: true }, "aria_session=adm1n")).status, 200);
  await page.click("#recheck");
  await page.waitForSelector(".tabs");
  await page.waitForSelector(".case");
  const body1 = await page.textContent("#app");
  for (const n of PII) assert.ok(!body1.includes(n), "board leaked " + n);
  for (const lang of ["es", "en"]) { await page.click(`[data-lang="${lang}"]`); assert.ok(!(/\broofers?\b|techero|techador|contratista de techos/i).test(await page.evaluate(() => document.body.innerText)), "pro board wording " + lang); }
  ok("board shows the anonymized case, no PII");

  /* 3. A new case arrives: ping + toast on the next 10 s poll. */
  await page.evaluate(() => window.scrollTo(0, 0));
  const fresh = await call("hs-case-create", "POST", caseBody());
  await page.waitForSelector(".toast", { timeout: 15000 });
  await page.waitForSelector(".case.fresh");
  assert.ok((await page.evaluate(() => window.__osc)) >= 2, "WebAudio ping played");
  const body2 = await page.textContent("#app");
  for (const n of PII) assert.ok(!body2.includes(n), "feed leaked " + n);
  ok("new case: toast, ping, highlighted card, still no PII");
  await shot("4-feed-new-case");
  await page.screenshot({ path: join(OUT, "hs-pro-4b-feed-full.png"), fullPage: true });

  /* 4. Request it. */
  await page.click(`#case-${fresh.body.caseId} [data-request]`);
  await page.fill(`form[data-offer] textarea`, "Licensed public adjuster in Miami-Dade. I review denied roof claims every week and can start with your denial letter.");
  await page.click("form[data-offer] [type=submit]");
  await page.waitForSelector(`#case-${fresh.body.caseId} .tag.ok`);
  ok("request sent");

  /* 5. Homeowner talks first, then shares contact; the pro sees Connected. */
  const st = await call("hs-case-status", "GET", null, "", { c: fresh.body.caseId, t: fresh.body.token });
  const offerId = st.body.offers[0].id;
  await call("hs-offer-respond", "POST", { caseId: fresh.body.caseId, token: fresh.body.token, offerId, action: "talk_first" });
  await call("hs-case-messages", "POST", { caseId: fresh.body.caseId, token: fresh.body.token, proId, text: "Thanks. Do you charge anything up front?" });
  await page.waitForSelector(".toast >> text=talk first", { timeout: 15000 });
  await page.click('[data-tab="requests"]');
  await page.waitForSelector(".msg");
  const body3 = await page.textContent("#app");
  for (const n of PII) assert.ok(!body3.includes(n), "talk-first leaked " + n);
  ok("talk first: thread visible, contact still hidden");
  await shot("5-talk-first");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
  await call("hs-doc-upload", "POST", { caseId: fresh.body.caseId, token: fresh.body.token, kind: "letter", file: { name: "Denial letter.pdf", type: "application/pdf", data: pdf.toString("base64") } });
  await call("hs-offer-respond", "POST", { caseId: fresh.body.caseId, token: fresh.body.token, offerId, action: "share_contact" });
  await page.waitForSelector(".toast >> text=shared their contact", { timeout: 15000 });
  await page.click('[data-tab="connected"]');
  await page.waitForSelector(".contact");
  const body4 = await page.textContent("#app");
  assert.ok(body4.includes("Maribel Quintero") && body4.includes("(305) 555-0142") && body4.includes("CLM-2024-88812"));
  ok("connected: full contact after the homeowner shares");
  await page.waitForSelector(".docs li");
  await page.evaluate(() => { document.querySelectorAll(".toast").forEach((t) => t.remove()); const el = document.querySelector(".contact"); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 130); });
  await shot("6-connected");

  /* 6. Espanol toggle. */
  await page.click('[data-lang="es"]');
  assert.match(await page.textContent(".tabs"), /Casos nuevos/);
  ok("Espanol toggle");
  await page.click('[data-lang="en"]');

  /* 7. Admin page. */
  const ap = await ctx.newPage();
  await ctx.addCookies([{ name: "aria_session", value: "adm1n", url: BASE }]);
  await ap.goto(`${BASE}/home-shield/admin`);
  await ap.waitForSelector("[data-verify]");
  await ap.screenshot({ path: join(OUT, "hs-pro-7-admin.png") });
  console.log("    shot " + join(OUT, "hs-pro-7-admin.png"));
  assert.ok(!(/\broofers?\b|techero|techador|contratista de techos/i).test(await ap.evaluate(() => document.body.innerText)), "admin wording");
  ok("admin lists pros");

  /* No horizontal scroll at 390. */
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= 390, "horizontal overflow " + sw);
  assert.deepEqual(errors, []);
  ok("no horizontal scroll, no page errors");
} finally {
  await browser.close();
  server.close();
}
console.log(`\n  ${passed} passed`);
