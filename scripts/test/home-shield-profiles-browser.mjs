/* ==================================================================
   ARIA HOME SHIELD -- pro profiles + the customer pick carousel in a real browser (390 px).

     node scripts/test/home-shield-profiles-browser.mjs [outDir]

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
  const f = url.includes("alerts/active?area=FL") ? "nws-alerts-FL.json" : url.includes("today_filtered") ? "spc-today.csv" : url.includes("yesterday_filtered") ? "spc-yesterday.csv" : null;
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
/* Aria's brain and voice are stubbed (no model / voice key here): hs-chat streams a fixed reply. */
const STUB = {};
const TTS = [];
let chatReply = null;
STUB["hs-chat"] = async (req, res) => {
  const r = chatReply;
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const w of r.reply.match(/\S+\s*/g)) res.write(`data: ${JSON.stringify({ t: w })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true, ...r })}\n\n`);
  res.end();
};
STUB["hs-tts"] = async (req, res, body) => {
  try { TTS.push(JSON.parse(body).text); } catch { /* ignore */ }
  /* 0.2 s of silence, WAV. */
  const n = 3200, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  res.writeHead(200, { "Content-Type": "audio/wav" }); res.end(b);
};
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/.netlify/functions/")) {
    const name = u.pathname.split("/").pop();
    if (!/^hs-[a-z-]+$/.test(name) || !existsSync(join(FN, name + ".js"))) { res.writeHead(404); return res.end(); }
    let body = "";
    for await (const ch of req) body += ch;
    if (STUB[name]) return STUB[name](req, res, body);
    const r = await (await fn(name))({ httpMethod: req.method, headers: { ...req.headers, "x-nf-client-connection-ip": "127.0.0.1" }, queryStringParameters: Object.fromEntries(u.searchParams), body });
    res.writeHead(r.statusCode, r.headers || {});
    return res.end(r.isBase64Encoded ? Buffer.from(r.body, "base64") : r.body);
  }
  let p = u.pathname;
  if (p === "/home-shield/") p = "/home-shield/index.html";
  if (p === "/home-shield/pro" || p === "/home-shield/pro/") p = "/home-shield/pro/index.html";
  if (p === "/home-shield/admin") p = "/home-shield/admin.html";
  if (p === "/home-shield/partners" || p === "/home-shield/partners/") p = "/home-shield/partners/index.html";
  if (p === "/home-shield/partners/admin") p = "/home-shield/partners/admin.html";
  if (p === "/home-shield/caso") p = "/home-shield/caso.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;



/* TEST FIXTURE images: abstract gold/charcoal gradients (no people, no places). */
const jpegjs = require("jpeg-js");
function img(w, h, seed) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, t = (x / w + y / h) / 2;
    data[i] = 30 + Math.round(180 * t * (seed % 3 === 0 ? 1 : 0.7)); data[i + 1] = 24 + Math.round(140 * t); data[i + 2] = 18 + Math.round(60 * (1 - t) * (seed % 2)); data[i + 3] = 255;
  }
  return jpegjs.encode({ data, width: w, height: h }, 80).data.toString("base64");
}
const photo = (seed) => ({ card: { data: img(480, 360, seed), w: 480, h: 360 }, full: { data: img(960, 720, seed), w: 960, h: 720 } });
const ABOUT = "Family-run roofing crew. We photograph every inch of the damage before we talk money, and we write the scope in plain language so your claim is easy to follow.";
async function proWith(email, name, years, n, extra = {}) {
  const r = await call("hs-pro-signup", "POST", { email, password: "correct horse battery", name, phone: "7865550100", desk: "roofer", licenseType: "roofing_contractor",
    licenseNumber: "CCC" + email.length + "0001", licenseState: "FL", attest: true, serviceArea: { centerZip: "33130", radiusMiles: 50 } });
  const id = r.body.pro.id;
  await call("hs-admin-verify", "POST", { proId: id, verified: true }, "aria_session=adm1n");
  const login = await (await fn("hs-pro-login"))({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "127.0.0.1" }, body: JSON.stringify({ email, password: "correct horse battery" }) });
  const cookie = login.headers["Set-Cookie"].split(";")[0];
  for (let i = 0; i < n; i++) await call("hs-pro-photo-upload", "POST", photo(i + email.length), cookie);
  await call("hs-pro-profile-self", "POST", { profile: { kind: extra.kind || "individual", displayName: name, firmName: extra.firmName || null, trade: "roofer", yearsInBusiness: years, about: ABOUT,
    philosophy: extra.philosophy || null, specialties: extra.specialties || [] }, coverage: { licenseStates: ["FL"], range: { mode: "statewide" } } }, cookie);
  return { id, cookie };
}
const josh = await proWith("josh@correo.test", "Coastline Roofing", 18, 4, { kind: "firm", firmName: "Coastline Roofing LLC", philosophy: "Photos first. Then the claim. Then the roof.", specialties: ["Tile roofs", "Wind claims", "Leak tracing"] });
await proWith("ana@correo.test", "Ana Ruiz Roofing", 7, 2, { specialties: ["Shingle roofs"] });
const kase = await call("hs-case-create", "POST", { consent: true, caseDraft: { issue: "roof", trades: ["roofer", "public_adjuster"], zip: "32801", urgency: "soon", summary: "Shingles lifted after the storm; a stain is spreading on the hallway ceiling." },
  contact: { name: "Rosa Delgado", phone: "(305) 555-0177", email: "rosa.d@correo.test" } });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name, full = false) => { await page.waitForTimeout(400); const p = join(OUT, `hs-profiles-${name}.png`); await page.screenshot({ path: p, fullPage: full }); console.log("    shot " + p); };
let passed = 0;
const ok = (m) => { passed++; console.log("    ok   " + m); };
const BAN = /\b(miles?|millas?|distance|distancia|km)\b|Miami|Orlando|33130|32801/i;
try {
  /* Desk: My profile (partners desk). */
  await ctx.addCookies([{ name: josh.cookie.split("=")[0], value: josh.cookie.split("=")[1], url: BASE }]);
  await page.goto(`${BASE}/home-shield/partners`);
  await page.waitForSelector("#myProfile");
  await page.click("#myProfile");
  await page.waitForSelector("#peForm");
  assert.match(await page.textContent(".pe"), /Profile complete: 100%/);
  assert.match(await page.textContent("#peCov"), /If a customer inside your range picks you, you take the job/);
  assert.equal(await page.locator(".pe-prev .hsp-card img").count(), 1, "live preview is the customer card");
  ok("desk profile editor: meter, coverage deal, live preview card");
  await shot("1-desk-editor-en");
  await page.evaluate(() => document.querySelector("#peCov").scrollIntoView());
  await shot("1b-desk-coverage-en");
  await page.click('[data-lang="es"]');
  await page.waitForFunction(() => /Perfil completo/.test(document.querySelector(".pe").textContent));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("1c-desk-editor-es");
  await page.click('[data-lang="en"]');
  ok("desk profile editor in Spanish");

  /* Customer: caso.html carousel. */
  const cp = await ctx.newPage();
  cp.on("pageerror", (e) => errors.push(e.message));
  await cp.goto(`${BASE}/home-shield/caso?c=${kase.body.caseId}&t=${kase.body.token}&lang=en`);
  await cp.waitForSelector("#hsPros .hsp-card");
  assert.equal(await cp.locator('[data-trade="roofer"] .hsp-card').count(), 2);
  assert.match(await cp.textContent('[data-trade="roofer"] .hsp-card'), /Coastline Roofing/, "best fit first (richer, longer)");
  const txt = await cp.textContent("#hsPros");
  assert.ok(!BAN.test(txt), "no distance or place on the customer side: " + (txt.match(BAN) || [])[0]);
  assert.equal(await cp.locator("#hsPros select, #hsPros input").count(), 0, "no sort or filter control");
  assert.match(txt, /Licensed in your area/);
  const sl = await cp.evaluate(() => { const r = document.querySelector('[data-trade="roofer"] .hsp-rail'); r.scrollLeft = 400; return r.scrollLeft; });
  assert.ok(sl > 0, "the carousel swipes");
  await cp.evaluate(() => document.querySelector('[data-trade="roofer"] .hsp-rail').scrollLeft = 0);
  ok("carousel: cards, best fit first, swipe, no distance / sort / place");
  await cp.evaluate(() => { const el = document.querySelector("#hsPros"); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); });
  await cp.waitForTimeout(300);
  const p1 = join(OUT, "hs-profiles-2-carousel-en.png"); await cp.screenshot({ path: p1 }); console.log("    shot " + p1);
  /* Empty state for the trade with no listed pro. */
  const empty = await cp.textContent('[data-trade="public_adjuster"]');
  assert.match(empty, /Aria is still lining up options here/); assert.match(empty, /Talk to Aria/);
  await cp.evaluate(() => document.querySelector('[data-trade="public_adjuster"]').scrollIntoView({ block: "center" }));
  const p2 = join(OUT, "hs-profiles-4-empty-en.png"); await cp.screenshot({ path: p2 }); console.log("    shot " + p2);
  ok("empty state shows Aria's invite");
  /* Card -> full profile -> choose -> confirm. */
  await cp.click('[data-trade="roofer"] .hsp-card');
  await cp.waitForSelector(".hsp-sheet [data-choose]");
  assert.equal(await cp.locator(".hsp-sheet .hsp-gal img").count(), 4);
  assert.ok(!BAN.test(await cp.textContent(".hsp-sheet")));
  const p3 = join(OUT, "hs-profiles-3-profile-en.png"); await cp.screenshot({ path: p3 }); console.log("    shot " + p3);
  await cp.click(".hsp-sheet [data-choose]");
  await cp.waitForSelector(".hsp-sheet [data-yes]");
  await cp.click(".hsp-sheet [data-yes]");
  await cp.waitForFunction(() => /You picked Coastline Roofing/.test(document.querySelector("#hsPros").textContent));
  ok("card -> profile -> choose -> confirm -> picked");
  const pick = await call("hs-pros-for-case", "GET", null, "", { c: kase.body.caseId, t: kase.body.token, trade: "roofer" });
  assert.equal(pick.body.picked, josh.id);

  /* Spanish, a fresh case. */
  const k2 = await call("hs-case-create", "POST", { consent: true, lang: "es", caseDraft: { issue: "roof", trades: ["roofer", "attorney"], zip: "33135", urgency: "soon", summary: "Se levantaron tejas con la tormenta." },
    contact: { name: "Rosa Delgado", phone: "(305) 555-0177", email: "rosa.d@correo.test" } });
  await cp.goto(`${BASE}/home-shield/caso?c=${k2.body.caseId}&t=${k2.body.token}&lang=es`);
  await cp.waitForSelector("#hsPros .hsp-card");
  const es = await cp.textContent("#hsPros");
  assert.match(es, /Tus opciones/); assert.match(es, /Con licencia en tu zona/); assert.match(es, /Hablar con Aria/);
  assert.ok(!BAN.test(es));
  await cp.evaluate(() => { const el = document.querySelector("#hsPros"); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90); });
  await cp.waitForTimeout(300);
  const p4 = join(OUT, "hs-profiles-2b-carousel-es.png"); await cp.screenshot({ path: p4 }); console.log("    shot " + p4);
  await cp.evaluate(() => document.querySelector('[data-trade="attorney"]').scrollIntoView({ block: "center" }));
  const p5 = join(OUT, "hs-profiles-4b-empty-es.png"); await cp.screenshot({ path: p5 }); console.log("    shot " + p5);
  await cp.click('[data-trade="roofer"] .hsp-card');
  await cp.waitForSelector(".hsp-sheet [data-choose]");
  assert.match(await cp.textContent(".hsp-sheet"), /Elegir/);
  const p6 = join(OUT, "hs-profiles-3b-profile-es.png"); await cp.screenshot({ path: p6 }); console.log("    shot " + p6);
  ok("Spanish carousel, profile and empty state");
  /* ---- In Aria's chat: ready -> contact + consent first -> the carousel -> choose -> talk-first. ---- */
  for (const L of ["en", "es"]) {
    const ch = await ctx.newPage();
    ch.on("pageerror", (e) => errors.push(e.message));
    const trades = L === "en" ? ["roofer"] : ["attorney"]; // es: a trade with nobody listed -> Aria's invite
    chatReply = { reply: L === "en" ? "I have what I need. Let me find who covers your area." : "Ya tengo lo que necesito. Busco quién atiende tu zona.",
      caseDraft: { issue: L === "en" ? "roof" : "denied_claim", trades, zip: "32801", state: "FL", urgency: "soon", summary: "Shingles lifted after the storm." }, ready: true };
    await ch.goto(`${BASE}/home-shield/?lang=${L}`);
    await ch.locator('[data-action="talk"]').first().click();
    await ch.waitForSelector("#hsSheet:not([hidden])");
    await ch.fill("#hsInput", L === "en" ? "My roof lost shingles in Orlando." : "Me negaron el reclamo.");
    await ch.press("#hsInput", "Enter");
    await ch.waitForSelector("#hsCaseCard");
    /* Not open yet: no options, no pro list asked for. */
    assert.equal(await ch.locator("#hsOptions").count(), 0, "no carousel before contact + consent");
    const ask = await ch.evaluate(() => performance.getEntriesByType("resource").filter((e) => /hs-pros-for-case/.test(e.name)).length);
    assert.equal(ask, 0);
    const card = ch.locator("#hsCaseCard");
    await card.locator("input[name=cname]").fill("Ana Prueba");
    await card.locator("input[name=phone]").fill("(305) 555-0142");
    await card.locator("#hsConsent").check();
    await ch.locator("#hsSendCase").click();
    await ch.waitForSelector("#hsOptions .hsp-sec", { timeout: 10000 });
    const optTxt = await ch.textContent("#hsOptions");
    assert.ok(!BAN.test(optTxt), "no distance or place in the chat carousel");
    const msgsTxt = await ch.textContent("#hsMsgs");
    if (L === "en") {
      assert.match(msgsTxt, /Here are licensed pros who cover your area/);
      await ch.waitForFunction(() => true);
      assert.ok(TTS.some((x) => /Here are licensed pros who cover your area/.test(x)), "Aria says it in her voice");
      assert.equal(await ch.locator("#hsOptions .hsp-card").count() >= 1, true);
      await ch.evaluate(() => { const m = document.getElementById("hsMsgs"), o = document.getElementById("hsOptions"); m.scrollTop = o.offsetTop - m.offsetTop - 70; });
      await ch.waitForTimeout(300);
      const s1 = join(OUT, "hs-profiles-5-chat-carousel-en.png"); await ch.screenshot({ path: s1 }); console.log("    shot " + s1);
      await ch.click("#hsOptions .hsp-card");
      await ch.waitForSelector(".hsp-sheet [data-choose]");
      await ch.click(".hsp-sheet [data-choose]");
      await ch.click(".hsp-sheet [data-yes]");
      await ch.waitForFunction(() => /You picked/.test(document.querySelector("#hsOptions").textContent));
      const caseId = new URL(await ch.locator("#hsCaseLink").innerText()).searchParams.get("c");
      const offers = [...STORES["hs-offers"].m.entries()].filter(([k]) => k.startsWith("o_")).map(([, v]) => JSON.parse(v)).filter((o) => o.caseId === caseId);
      assert.equal(offers.length, 1); assert.equal(offers[0].status, "accepted_talk_first"); assert.equal(offers[0].origin, "customer_pick");
      ok("chat (en): ready -> contact + consent first -> carousel in the chat, Aria's line spoken -> choose -> talk-first record");
      /* A draft case (no contact, no consent) never shows options. */
      const d = await call("hs-case-create", "POST", { draft: true, lang: "en", caseDraft: { issue: "roof" } });
      const r = await ch.evaluate(async ([c, t]) => { const el = document.createElement("div"); document.body.appendChild(el); const x = await window.HSPros.mountOptions(el, c, t, { inChat: true }); return { x, html: el.innerHTML }; }, [d.body.caseId, d.body.token]);
      assert.equal(r.x.shown, false); assert.equal(r.html, "", "a draft is never shown to a pro or listed");
      ok("draft case: no options until the contact + consent step");
    } else {
      assert.match(msgsTxt, /Todavía no hay un profesional listo para esto en tu zona/);
      assert.match(optTxt, /Aria todavía está reuniendo opciones aquí/);
      assert.equal(await ch.locator("#hsOptions a").count(), 0, "the invite stays inline in the chat");
      assert.match(optTxt, /Tus opciones/);
      await ch.evaluate(() => { const m = document.getElementById("hsMsgs"), o = document.getElementById("hsOptions"); m.scrollTop = o.offsetTop - m.offsetTop - 120; });
      await ch.waitForTimeout(300);
      const s2 = join(OUT, "hs-profiles-6-chat-empty-es.png"); await ch.screenshot({ path: s2 }); console.log("    shot " + s2);
      ok("chat (es): empty -> Aria's invite inline, in Spanish");
    }
    await ch.close();
  }
  /* The Spanish carousel in the chat, with pros. */
  {
    const ch = await ctx.newPage();
    chatReply = { reply: "Ya tengo lo que necesito.", caseDraft: { issue: "roof", trades: ["roofer"], zip: "32801", state: "FL", urgency: "soon", summary: "Tejas levantadas." }, ready: true };
    await ch.goto(`${BASE}/home-shield/?lang=es`);
    await ch.locator('[data-action="talk"]').first().click();
    await ch.waitForSelector("#hsSheet:not([hidden])");
    await ch.fill("#hsInput", "Se me dañó el techo.");
    await ch.press("#hsInput", "Enter");
    await ch.waitForSelector("#hsCaseCard");
    const card = ch.locator("#hsCaseCard");
    await card.locator("input[name=cname]").fill("Ana Prueba");
    await card.locator("input[name=phone]").fill("(305) 555-0142");
    await card.locator("#hsConsent").check();
    await ch.locator("#hsSendCase").click();
    await ch.waitForSelector("#hsOptions .hsp-card", { timeout: 10000 });
    assert.match(await ch.textContent("#hsMsgs"), /Aquí tienes profesionales con licencia que atienden tu zona/);
    await ch.evaluate(() => { const m = document.getElementById("hsMsgs"), o = document.getElementById("hsOptions"); m.scrollTop = o.offsetTop - m.offsetTop - 70; });
    await ch.waitForTimeout(300);
    const s3 = join(OUT, "hs-profiles-5b-chat-carousel-es.png"); await ch.screenshot({ path: s3 }); console.log("    shot " + s3);
    ok("chat (es): the carousel in Spanish");
    await ch.close();
  }
  assert.ok(await cp.evaluate(() => document.documentElement.scrollWidth) <= 390, "no horizontal page scroll");
  assert.deepEqual(errors, []);
  ok("no page errors, no horizontal scroll");
} finally { await browser.close(); server.close(); }
console.log(`\n  ${passed} passed`);
