/* ==================================================================
   ARIA HOME SHIELD -- the admin's own door (#443 c.6672170980).

     node scripts/test/home-shield-admin-tests.mjs [screenshotDir]

   Backend in-process against in-memory Blobs: allowlist only (seeded from
   ADMIN_EMAILS), the same 401 for an unknown email and a wrong password,
   one-time setup tokens (single use, 30-minute expiry), setup signs you in,
   hs_admin opens hs-admin-pros / -cases / -verify and the partners admin,
   the shop session still works, logout, rate limit. Static: no storefront
   link on the admin pages, EN/ES parity. Browser at 390 px, EN + ES: the
   gate says why, sign-in works, the setup link screen, the shop panel, and
   the focus re-check.
   ================================================================ */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FN = join(ROOT, "netlify/functions");
const OUT = process.argv[2] || join(tmpdir(), "hs-admin-shots");
mkdirSync(OUT, { recursive: true });
let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.message).slice(0, 500)} ${String(e.stack).split("\n").find((l) => l.includes("admin-tests")) || ""}`); console.log("    FAIL " + name); }
}
function memStore() {
  const m = new Map();
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}
const store = await import(join(FN, "_hs-store.js"));
const STORES = {};
store.__setStoreFactory((n) => (STORES[n] ||= memStore()));
const MAIL = [];
store.__setMailer(async (msg) => { MAIL.push(msg); return { sent: true }; });
/* TEST FIXTURE addresses (correo.test). */
const BOSS = "boss@correo.test", OTHER = "other@correo.test";
process.env.ADMIN_EMAILS = ` ${BOSS.toUpperCase()} , `;
process.env.URL = "https://ariashop.pe";
STORES.sessions = memStore();
await STORES.sessions.setJSON("shop-boss", { email: BOSS, createdAt: new Date().toISOString() });
await STORES.sessions.setJSON("shop-other", { email: OTHER, createdAt: new Date().toISOString() });
const fnOf = (m) => m.default || m.handler;
const H = {};
for (const n of ["hs-admin-login", "hs-admin-logout", "hs-admin-me", "hs-admin-setup-request", "hs-admin-setup", "hs-admin-pros", "hs-admin-cases", "hs-admin-verify", "hs-partner-admin", "hs-pro-signup"]) H[n] = fnOf(await import(join(FN, n + ".js")));
let ip = 0;
async function call(n, { method = "POST", body, query, cookie, ipAddr } = {}) {
  const r = await H[n]({ httpMethod: method, headers: { "x-nf-client-connection-ip": ipAddr || `10.6.${ip >> 8 & 255}.${ip++ & 255}`, cookie: cookie || "" }, queryStringParameters: query || {}, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers && r.headers["Set-Cookie"];
  return { status: r.statusCode, body: JSON.parse(r.body || "{}"), setCookie: sc || null, cookie: sc ? sc.split(";")[0] : null };
}
const tokenFrom = (msg) => (msg.text.match(/setup=([0-9a-f]{64})/) || [])[1];

console.log("  Home Shield admin door");
const A = {};

await test("allowlist is seeded from ADMIN_EMAILS at runtime (lower-cased), and no admin email is in the repo", async () => {
  const S = store.openStores({});
  const auth = await import(join(FN, "_hs-auth.js"));
  const rec = await auth.readAdmins(S);
  assert.deepEqual(rec.emails, [BOSS]);
  assert.deepEqual(JSON.parse(STORES["hs-settings"].m.get("admins")).emails, [BOSS], "persisted in hs-settings");
  for (const f of ["_hs-auth.js", "hs-admin-login.js", "hs-admin-setup.js", "hs-admin-setup-request.js", "hs-admin-me.js"]) {
    assert.ok(!/@ariashop\.pe|danielleon/i.test(readFileSync(join(FN, f), "utf8")), f + " hardcodes an email");
  }
});

await test("setup request: allowlist only, the same answer for everyone, one email with a 32-byte token, sha256 stored", async () => {
  const a = await call("hs-admin-setup-request", { body: { email: BOSS } });
  const b = await call("hs-admin-setup-request", { body: { email: OTHER } });
  const c = await call("hs-admin-setup-request", { body: { email: "not-an-email" } });
  assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.deepEqual(a.body, c.body);
  assert.equal(MAIL.length, 1); assert.equal(MAIL[0].to, BOSS);
  assert.match(MAIL[0].text, /https:\/\/ariashop\.pe\/home-shield\/admin\?setup=[0-9a-f]{64}/);
  const tok = tokenFrom(MAIL[0]);
  assert.ok(![...STORES["hs-sessions"].m.keys()].some((k) => k.includes(tok)), "raw token never stored");
  A.tok = tok;
});

await test("login before a password exists, unknown email, non-admin, wrong password: the same 401", async () => {
  const r = [
    await call("hs-admin-login", { body: { email: BOSS, password: "whatever-123" } }),
    await call("hs-admin-login", { body: { email: "ghost@correo.test", password: "whatever-123" } }),
    await call("hs-admin-login", { body: { email: OTHER, password: "whatever-123" } }),
  ];
  for (const x of r) { assert.equal(x.status, 401); assert.deepEqual(x.body, r[0].body); assert.equal(x.setCookie, null); }
  assert.equal(r[0].body.code, "bad_credentials");
});

await test("setup token: weak password refused, then sets the password and signs in; single use; expiry", async () => {
  assert.equal((await call("hs-admin-setup", { body: { token: A.tok, password: "short" } })).body.code, "weak_password");
  const ok = await call("hs-admin-setup", { body: { token: A.tok, password: "gold and black 2026" } });
  assert.equal(ok.status, 200); assert.equal(ok.body.admin.email, BOSS);
  assert.match(ok.setCookie, /^hs_admin=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200$/);
  A.cookie = ok.cookie;
  assert.equal((await call("hs-admin-setup", { body: { token: A.tok, password: "another password 1" } })).body.code, "link_expired", "single use");
  /* Expiry: a token used after 30 minutes is refused (and burned). */
  const S = store.openStores({});
  const auth = await import(join(FN, "_hs-auth.js"));
  const t2 = await auth.issueSetupToken(S, BOSS, Date.now() - 31 * 60 * 1000);
  assert.equal((await call("hs-admin-setup", { body: { token: t2, password: "gold and black 2027" } })).body.code, "link_expired");
  assert.equal((await call("hs-admin-setup", { body: { token: "f".repeat(64), password: "gold and black 2027" } })).body.code, "link_expired");
  const sessions = [...STORES["hs-sessions"].m.keys()];
  assert.ok(sessions.some((k) => k.startsWith("admin/")) && !sessions.some((k) => k.includes(A.cookie.split("=")[1])), "session stored hashed");
});

await test("hs_admin opens hs-admin-pros / -cases / -verify and the partners admin; hs-admin-me says via shield", async () => {
  const me = await call("hs-admin-me", { method: "GET", cookie: A.cookie });
  assert.deepEqual([me.status, me.body.admin.email, me.body.via, me.body.hasShieldPassword], [200, BOSS, "shield", true]);
  assert.equal((await call("hs-admin-pros", { method: "GET", cookie: A.cookie })).status, 200);
  assert.equal((await call("hs-admin-cases", { method: "GET", cookie: A.cookie })).status, 200);
  assert.equal((await call("hs-partner-admin", { method: "GET", cookie: A.cookie })).status, 200);
  const p = await call("hs-pro-signup", { body: { email: "pro@correo.test", password: "correct horse battery", name: "Pro One", phone: "7865550100", trades: ["roofer"], licenseType: "roofing_contractor", licenseNumber: "CCC1", licenseState: "FL", attest: true, serviceArea: { centerZip: "33130", radiusMiles: 50 } } });
  const v = await call("hs-admin-verify", { cookie: A.cookie, body: { proId: p.body.pro.id, verified: true } });
  assert.equal(v.status, 200); assert.equal(v.body.pro.verifiedBy, BOSS);
  assert.equal((await call("hs-admin-login", { body: { email: BOSS, password: "gold and black 2026" } })).status, 200, "the password now signs in");
});

await test("the shop session still works; a non-admin shop session is not_admin; no session is no_session", async () => {
  assert.equal((await call("hs-admin-pros", { method: "GET", cookie: "aria_session=shop-boss" })).status, 200);
  const m = await call("hs-admin-me", { method: "GET", cookie: "aria_session=shop-boss" });
  assert.equal(m.body.via, "shop");
  const n = await call("hs-admin-me", { method: "GET", cookie: "aria_session=shop-other" });
  assert.deepEqual([n.status, n.body.code], [401, "not_admin"]);
  assert.equal((await call("hs-admin-pros", { method: "GET", cookie: "aria_session=shop-other" })).status, 403);
  const z = await call("hs-admin-me", { method: "GET" });
  assert.deepEqual([z.status, z.body.code], [401, "no_session"]);
  assert.equal((await call("hs-admin-me", { method: "GET", cookie: "hs_admin=" + "a".repeat(64) })).body.code, "no_session");
});

await test("shop-admin fallback: with no token, sets the password for that admin's own email only", async () => {
  assert.equal((await call("hs-admin-setup", { body: { password: "a long password 1" } })).status, 401);
  assert.equal((await call("hs-admin-setup", { cookie: "aria_session=shop-other", body: { password: "a long password 1" } })).status, 401);
  const r = await call("hs-admin-setup", { cookie: "aria_session=shop-boss", body: { password: "new gold password 1" } });
  assert.equal(r.status, 200); assert.equal(r.body.admin.email, BOSS); assert.ok(r.cookie);
  assert.equal((await call("hs-admin-login", { body: { email: BOSS, password: "new gold password 1" } })).status, 200);
});

await test("logout ends the hs_admin session (cookie cleared, server session gone)", async () => {
  const out = await call("hs-admin-logout", { cookie: A.cookie });
  assert.match(out.setCookie, /^hs_admin=; .*Max-Age=0/);
  assert.equal((await call("hs-admin-me", { method: "GET", cookie: A.cookie })).body.code, "no_session");
  assert.equal((await call("hs-admin-pros", { method: "GET", cookie: A.cookie })).status, 403);
});

await test("rate limit: per IP and per email on login; per email on setup requests (still the same answer)", async () => {
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call("hs-admin-login", { ipAddr: "203.0.113.50", body: { email: "x" + i + "@correo.test", password: "nope nope nope" } })).status);
  assert.equal(codes[10], 429);
  const per = [];
  for (let i = 0; i < 11; i++) per.push((await call("hs-admin-login", { body: { email: BOSS, password: "wrong guess " + i } })).status);
  assert.equal(per[10], 429, "per-email across IPs");
  const before = MAIL.length;
  for (let i = 0; i < 5; i++) await call("hs-admin-setup-request", { body: { email: BOSS } });
  assert.ok(MAIL.length - before <= 2, "at most 3 links per email per hour (one sent earlier)");
});

await test("static: no storefront link on the admin pages; the gate script is EN/ES complete and emoji-free", async () => {
  for (const f of ["home-shield/admin.html", "home-shield/partners/admin.html", "home-shield/admin-gate.js"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.ok(!/href\s*=\s*["']\/["'#?]|href\s*=\s*["']\/(?!home-shield|\.netlify)[a-z]/i.test(src), f + " links outside Home Shield");
    assert.ok(!/location(\.href)?\s*=\s*["']\/["']/.test(src), f + " navigates to the storefront");
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), f + " emoji");
  }
  const g = readFileSync(join(ROOT, "home-shield/admin-gate.js"), "utf8");
  const I = vm.runInNewContext("(" + g.match(/var I18N = (\{[\s\S]*?\n  \});/)[1] + ")");
  assert.deepEqual(Object.keys(I.en).sort(), Object.keys(I.es).sort());
  for (const k of [...g.matchAll(/\bt\("([a-zA-Z0-9_]+)"\)/g)].map((x) => x[1])) assert.ok(k in I.en, k);
  for (const code of ["no_session", "not_admin", "bad_credentials", "link_expired"]) assert.ok(I.en["r_" + code] && I.es["r_" + code], code);
});

/* ---------------------------------------------------------------- browser, 390 px */
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript" };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/.netlify/functions/")) {
    const name = u.pathname.split("/").pop();
    if (!/^hs-[a-z-]+$/.test(name) || !existsSync(join(FN, name + ".js"))) { res.writeHead(404); return res.end(); }
    let body = ""; for await (const ch of req) body += ch;
    const h = H[name] || (H[name] = fnOf(await import(join(FN, name + ".js"))));
    const r = await h({ httpMethod: req.method, headers: { ...req.headers, "x-nf-client-connection-ip": "127.0.0." + (ip++ % 250) }, queryStringParameters: Object.fromEntries(u.searchParams), body });
    res.writeHead(r.statusCode, r.headers || {}); return res.end(r.isBase64Encoded ? Buffer.from(r.body, "base64") : r.body);
  }
  let p = u.pathname;
  if (p === "/home-shield/admin") p = "/home-shield/admin.html";
  if (p === "/home-shield/partners/admin") p = "/home-shield/partners/admin.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(""); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;
STORES["hs-rate"].m.clear(); // the rate-limit test above spent the budget
const browser = await chromium.launch();
const shotPath = (n) => join(OUT, `hs-admin-${n}.png`);
try {
  for (const L of ["en", "es"]) {
    await test(`browser 390 (${L}): the gate says why; wrong password says so; sign in opens the admin; sign out`, async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await ctx.addInitScript((l) => { try { localStorage.setItem("hs_lang", l); } catch (e) { /* none */ } }, L);
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(e.message));
      await page.goto(`${BASE}/home-shield/admin?lang=${L}`);
      await page.waitForSelector("#hsGate");
      assert.match(await page.textContent("#hsWhy"), L === "en" ? /No admin session\. Sign in below\./ : /No hay una sesión de administrador/);
      assert.equal(await page.locator('a[href="/"]').count(), 0);
      await page.screenshot({ path: shotPath(`1-gate-${L}`) });
      await page.fill("#hsLogin [name=email]", BOSS); await page.fill("#hsLogin [name=password]", "definitely wrong 1");
      await page.click("#hsSignin");
      await page.waitForFunction((l) => (l === "en" ? /Wrong email or password/ : /Correo o contraseña incorrectos/).test(document.querySelector("#hsWhy").textContent), L);
      await page.fill("#hsLogin [name=password]", "new gold password 1");
      await page.click("#hsSignin");
      await page.waitForSelector("[data-tab]");
      assert.equal(await page.isVisible("#hsSignout"), true);
      await page.screenshot({ path: shotPath(`2-in-${L}`) });
      await page.click("#hsSignout");
      await page.waitForSelector("#hsGate");
      assert.deepEqual(errs, []);
      await ctx.close();
    });
  }
  await test("browser 390: the setup link screen sets the password and signs in; an expired link says so", async () => {
    const S = store.openStores({});
    const auth = await import(join(FN, "_hs-auth.js"));
    const tok = await auth.issueSetupToken(S, BOSS);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => errs.push("console: " + m.text()));
    await page.goto(`${BASE}/home-shield/admin?setup=${tok}&lang=en`);
    await page.waitForSelector("#hsSetup", { timeout: 8000 }).catch(async (e) => { throw new Error(errs.join(" | ") + " :: " + (await page.textContent("body")).slice(0, 300)); });
    await page.screenshot({ path: shotPath("3-setup-en") });
    await page.fill("#hsSetup [name=password]", "browser set password 1");
    await page.click("#hsSetup [type=submit]");
    await page.waitForSelector("[data-tab]");
    assert.ok(!page.url().includes("setup="), "the token leaves the address bar");
    await ctx.clearCookies(); // a signed-in admin never sees the setup screen; a fresh visitor reuses the spent link
    await page.goto(`${BASE}/home-shield/admin?setup=${tok}&lang=es`);
    await page.waitForSelector("#hsSetup");
    await page.fill("#hsSetup [name=password]", "browser set password 2");
    await page.click("#hsSetup [type=submit]");
    await page.waitForFunction(() => /El enlace venció/.test(document.querySelector("#hsGate").textContent));
    await page.screenshot({ path: shotPath("3b-expired-es") });
    await ctx.close();
  });
  await test("browser 390: shop-signed-in admin sees «Set a Shield password»; not-admin shop session gets the reason; focus re-check lets you in", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    await ctx.addCookies([{ name: "aria_session", value: "shop-boss", url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/home-shield/admin?lang=en`);
    await page.waitForSelector("#hsShopPw");
    await page.screenshot({ path: shotPath("4-shop-panel-en") });
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "aria_session", value: "shop-other", url: BASE }]);
    await page.goto(`${BASE}/home-shield/partners/admin?lang=es`);
    await page.waitForSelector("#hsGate");
    assert.match(await page.textContent("#hsWhy"), /Esta cuenta no es administradora de Home Shield/);
    await page.screenshot({ path: shotPath("5-not-admin-es") });
    /* Sign in elsewhere (another tab), come back: the page re-checks on focus without a tap. */
    await ctx.addCookies([{ name: "aria_session", value: "shop-boss", url: BASE }]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector("#sf", { timeout: 8000 });
    await ctx.close();
  });
} finally { await browser.close(); server.close(); }

console.log(`\n  ${passed} passed, ${failures.length} failed`);
console.log("  screenshots: " + OUT);
if (failures.length) { console.log("\n" + failures.map((f) => "  FAIL " + f).join("\n")); process.exit(1); }
