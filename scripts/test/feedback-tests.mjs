/* ==================================================================
   DANOS TU FEEDBACK (#443 c.6447438497): the improvement inbox.

   The rules (netlify/functions/_feedback.js): a tipo and words are
   required, the store when the tipo asks for one; the honeypot keeps
   nothing; RATE_PER_HOUR per sender; the message is stored before the
   copy is emailed, and a failed copy is recorded, never lost. Then the
   two doors at phone width: /opinion.html and the homepage section
   (which loads its form only when it comes near the screen).

     node scripts/test/feedback-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFeedback, receiveFeedback, feedbackEmail, sendFeedbackCopy, listFeedback, rateKey, clientIp,
  RATE_PER_HOUR, FEEDBACK_TO, TIPOS,
} from "../../netlify/functions/_feedback.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.stack || e.message}`); console.log("    FAIL " + name); }
}
function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
const msgs = (store) => [...store.m.keys()].filter((k) => k.startsWith("msg/")).map((k) => JSON.parse(store.m.get(k)));
/* pictographs, but not the © ® ™ every footer carries */
const EMOJI = /(?![\u00a9\u00ae\u2122])\p{Extended_Pictographic}/u;

await check("the rules: a tipo and words are required, the store when the tipo is Tienda que quiero", () => {
  assert.deepEqual(Object.values(TIPOS), ["Recomendación", "Consejo", "Tienda que quiero", "Mi opinión"]);
  assert.ok(parseFeedback({ mensaje: "hola que tal" }).error);
  assert.ok(parseFeedback({ tipo: "reclamo", mensaje: "hola que tal" }).error, "an unknown tipo");
  assert.ok(parseFeedback({ tipo: "consejo", mensaje: " " }).error);
  assert.ok(parseFeedback({ tipo: "tienda", mensaje: "porfa" }).error, "Tienda que quiero without a store");
  const ok = parseFeedback({ tipo: "tienda", mensaje: "Traigan Target", tienda: " Target ", nombre: "", contacto: "999 888 777", page: "inicio" }).msg;
  assert.deepEqual(ok, { tipo: "tienda", mensaje: "Traigan Target", tienda: "Target", contacto: "999 888 777", page: "inicio" });
  /* the store only rides with its tipo; long words are clipped; control characters go */
  const o = parseFeedback({ tipo: "opinion", mensaje: "x".repeat(5000) + "\u0007", tienda: "Target" }).msg;
  assert.equal(o.mensaje.length, 2000);
  assert.equal(o.tienda, undefined);
  assert.deepEqual(parseFeedback({ tipo: "consejo", mensaje: "hola", website: "http://spam" }), { spam: true });
});

await check("a message is stored, then copied to contacto@; the honeypot keeps nothing", async () => {
  const store = memStore();
  const sent = [];
  const out = await receiveFeedback({ body: { tipo: "recomendacion", mensaje: "Pongan más tallas grandes" }, ip: "1.2.3.4", store, send: async (r) => { sent.push(r); return { sent: true, id: "x" }; } });
  assert.deepEqual(out, { status: 200, body: { ok: true } });
  const [m] = msgs(store);
  assert.equal(m.mensaje, "Pongan más tallas grandes");
  assert.equal(m.status, "nuevo");
  assert.equal(m.emailed, true);
  assert.equal(sent.length, 1);
  const spam = memStore();
  assert.deepEqual(await receiveFeedback({ body: { tipo: "consejo", mensaje: "buy now", website: "x" }, ip: "1.2.3.4", store: spam, send: async () => { throw new Error("no"); } }), { status: 200, body: { ok: true } });
  assert.equal(spam.m.size, 0, "a filled honeypot stored something");
});

await check("a failed email copy never loses the message: it is stored and marked", async () => {
  const store = memStore();
  const out = await receiveFeedback({ body: { tipo: "opinion", mensaje: "Me encanta" }, ip: "5.6.7.8", store, send: async () => ({ sent: false, error: "no hay proveedor de correo configurado" }) });
  assert.equal(out.status, 200);
  const [m] = msgs(store);
  assert.equal(m.emailed, false);
  assert.match(m.emailError, /proveedor/);
});

await check(`spam: ${RATE_PER_HOUR} messages per sender per hour, then a calm 429; the address itself is never stored`, async () => {
  const store = memStore();
  const now = new Date("2026-10-27T17:10:00Z");
  const send = async () => ({ sent: true });
  for (let i = 0; i < RATE_PER_HOUR; i++) assert.equal((await receiveFeedback({ body: { tipo: "consejo", mensaje: "mensaje " + i }, ip: "9.9.9.9", store, now, send })).status, 200);
  const sixth = await receiveFeedback({ body: { tipo: "consejo", mensaje: "otro" }, ip: "9.9.9.9", store, now, send });
  assert.equal(sixth.status, 429);
  assert.match(sixth.body.error, /un rato/);
  assert.equal((await receiveFeedback({ body: { tipo: "consejo", mensaje: "otra persona" }, ip: "8.8.8.8", store, now, send })).status, 200);
  assert.equal((await receiveFeedback({ body: { tipo: "consejo", mensaje: "una hora después" }, ip: "9.9.9.9", store, now: new Date("2026-10-27T18:10:00Z"), send })).status, 200);
  assert.ok(![...store.m.keys(), ...store.m.values()].some((v) => v.includes("9.9.9.9")), "the address is in the store");
  assert.notEqual(rateKey("9.9.9.9", now), rateKey("9.9.9.8", now));
  assert.equal(clientIp({ "x-nf-client-connection-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }), "1.1.1.1");
  assert.equal(clientIp({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }), "2.2.2.2");
});

await check("the email copy: to contacto@, every field escaped, reply goes to the shopper when they left an email", async () => {
  const rec = { id: "abc", at: "2026-10-27T17:00:00.000Z", tipo: "tienda", tienda: "Target <b>", mensaje: "<script>x</script>", contacto: "ana@example.com" };
  const m = feedbackEmail(rec);
  assert.equal(m.to, FEEDBACK_TO);
  assert.equal(m.to, "contacto@ariashop.pe");
  assert.match(m.subject, /piden Target/);
  assert.ok(!m.html.includes("<script>") && m.html.includes("&lt;script&gt;"));
  assert.equal(m.replyTo, "ana@example.com");
  assert.equal(feedbackEmail({ ...rec, contacto: "999 888 777" }).replyTo, "contacto@ariashop.pe");
  assert.ok(!EMOJI.test(m.html + m.text));
  /* over Resend, and over SMTP; with neither, it says so instead of throwing */
  let call;
  const r = await sendFeedbackCopy(rec, { env: { RESEND_API_KEY: "test" }, fetchImpl: async (u, o) => { call = { u, o }; return { ok: true, json: async () => ({ id: "re_1" }) }; } });
  assert.deepEqual(r, { sent: true, id: "re_1" });
  assert.equal(JSON.parse(call.o.body).to[0], "contacto@ariashop.pe");
  assert.equal(call.o.headers["Idempotency-Key"], "feedback/abc");
  let mail;
  const s = await sendFeedbackCopy(rec, { env: { SMTP_HOST: "h", SMTP_USER: "u@ariashop.pe", SMTP_PASS: "p" }, createTransport: () => ({ sendMail: async (x) => { mail = x; return { messageId: "m1" }; } }) });
  assert.deepEqual(s, { sent: true, id: "m1" });
  assert.equal(mail.to, "contacto@ariashop.pe");
  assert.equal((await sendFeedbackCopy(rec, { env: {} })).sent, false);
});

await check("the admin's view: newest first, and the stores shoppers ask for, most asked first", async () => {
  const store = memStore();
  const send = async () => ({ sent: true });
  const at = (m) => new Date(`2026-10-27T1${m}:00:00Z`);
  await receiveFeedback({ body: { tipo: "tienda", mensaje: "porfa", tienda: "Target" }, ip: "a", store, now: at(1), send });
  await receiveFeedback({ body: { tipo: "tienda", mensaje: "porfa", tienda: "Costco" }, ip: "b", store, now: at(2), send });
  await receiveFeedback({ body: { tipo: "tienda", mensaje: "porfa", tienda: "target " }, ip: "c", store, now: at(3), send });
  await receiveFeedback({ body: { tipo: "opinion", mensaje: "bien" }, ip: "d", store, now: at(4), send });
  const v = await listFeedback(store);
  assert.equal(v.total, 4);
  assert.equal(v.items[0].tipo, "opinion");
  assert.deepEqual(v.tiendas.map((t) => [t.tienda.toLowerCase().trim(), t.n]), [["target", 2], ["costco", 1]]);
  const fn = readFileSync(ROOT + "netlify/functions/admin-feedback.js", "utf8");
  assert.match(fn, /if \(!isAdmin\(email\)\) return \{ statusCode: 403/, "the admin list is not gated");
  const admin = readFileSync(ROOT + "admin.html", "utf8");
  assert.ok(admin.includes('item("feedback"') && admin.includes("function renderFeedback()") && admin.includes("/.netlify/functions/admin-feedback"));
});

await check("the copy is Danny's, in Aria's voice, no emojis, never called a complaints book", () => {
  const form = readFileSync(ROOT + "feedback-form.js", "utf8");
  const page = readFileSync(ROOT + "opinion.html", "utf8");
  const home = readFileSync(ROOT + "index.html", "utf8");
  const sec = home.slice(home.indexOf('<section id="feedbackSection"'), home.indexOf("</section>", home.indexOf('<section id="feedbackSection"')));
  for (const t of ["¿Qué tienda de Estados Unidos te gustaría ver en Aria?", "Enviar", "¡Gracias! Leemos cada mensaje, y las tiendas que más nos piden son las que buscamos primero.", "Solo si quieres que te respondamos.", "Recomendación", "Consejo", "Tienda que quiero", "Mi opinión"]) assert.ok(form.includes(t), t);
  for (const t of ["Danos tu feedback", "Recomendaciones, consejos y opiniones: cuéntanos cómo hacer Aria mejor para ti."]) { assert.ok(page.includes(t), "opinion.html: " + t); assert.ok(sec.includes(t), "home section: " + t); }
  for (const [n, t] of [["form", form], ["page", page], ["section", sec]]) {
    assert.ok(!EMOJI.test(t), n + " has an emoji");
    assert.ok(!/reclamaci[oó]n|libro de reclamaciones/i.test(t.replace(/Libro de Reclamaciones: a complaint|not the Libro de Reclamaciones|Not the Libro de Reclamaciones|It is\s+not the Libro de Reclamaciones|no es el Libro de Reclamaciones/g, "")), n + " calls itself a complaints book");
  }
  assert.ok(home.includes('<a href="/opinion.html"') && page.includes('<a href="opinion.html">Danos tu feedback</a>'), "the footers link the page");
  /* the section is the home view's last thing (the view after it is Results), above the footer */
  const homeView = home.indexOf('<div id="homeView"'), next = home.indexOf("<!-- ============ RESULTS VIEW");
  const at = home.indexOf('<section id="feedbackSection"');
  assert.ok(homeView < at && at < next, "the section is not in the home view");
  assert.ok(!/<div[^>]*class="[^"]*\bview\b/.test(home.slice(homeView + 10, at)), "another view opens before the section");
  assert.ok(!/<script[^>]+feedback-form\.js/.test(home), "the homepage loads the form eagerly");
});

/* ---- the two doors, at phone width ---- */
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
const posted = [];
let reply = { status: 200, body: { ok: true } };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/.netlify/functions/feedback") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { posted.push(JSON.parse(b)); res.writeHead(reply.status, { "Content-Type": "application/json" }); res.end(JSON.stringify(reply.body)); });
    return;
  }
  if (u.pathname.startsWith("/.netlify/functions/") || u.pathname.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return; }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
async function phone(path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route((url) => url.host !== new URL(BASE).host, (r) => r.abort());
  const errs = [], scripts = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  pg.on("request", (r) => { if (/feedback-form\.js/.test(r.url())) scripts.push(r.url()); });
  await pg.goto(BASE + path, { waitUntil: "load" });
  return { pg, ctx, errs, scripts };
}

await check("/opinion.html at phone width: the chips, the store question on Tienda que quiero, a send, the thank-you that is not a dead end", async () => {
  const { pg, ctx, errs } = await phone("/opinion.html");
  await pg.waitForSelector(".afb-chip");
  const w = await pg.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 390, "the page scrolls sideways: " + w);
  assert.equal(await pg.isVisible('[data-afb="tienda"]'), false);
  await pg.tap('.afb-chip[data-tipo="tienda"]');
  assert.equal(await pg.isVisible('[data-afb="tienda"]'), true);
  await pg.tap(".afb-send");
  assert.match(await pg.textContent(".afb-err"), /qué tienda/);
  await pg.fill('[name="tienda"]', "Target");
  await pg.fill('[name="mensaje"]', "Me encantaría comprar en Target desde Lima");
  await pg.fill('[name="contacto"]', "999 888 777");
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + "-opinion.png", fullPage: true });
  posted.length = 0;
  await pg.tap(".afb-send");
  await pg.waitForSelector(".afb-done");
  assert.match(await pg.textContent(".afb-done"), /Leemos cada mensaje/);
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + "-thanks.png" });
  assert.deepEqual(posted[0], { tipo: "tienda", mensaje: "Me encantaría comprar en Target desde Lima", tienda: "Target", nombre: "", contacto: "999 888 777", website: "", page: "opinion" });
  assert.equal(await pg.getAttribute('.afb-done a', "href"), "/");
  await pg.tap(".afb-done button");
  await pg.waitForSelector(".afb-send");
  /* the server's calm 429 reaches the shopper */
  reply = { status: 429, body: { error: "Ya recibimos varios mensajes tuyos. Escríbenos de nuevo en un rato." } };
  await pg.fill('[name="mensaje"]', "otro mensaje");
  await pg.tap(".afb-send");
  await pg.waitForFunction(() => !document.querySelector(".afb-err").hidden);
  assert.match(await pg.textContent(".afb-err"), /un rato/);
  reply = { status: 200, body: { ok: true } };
  assert.deepEqual(errs, []);
  await ctx.close();
});

await check("the homepage section: last above the footer, the form loads only near the screen, then sends", async () => {
  const { pg, ctx, scripts } = await phone("/");
  await pg.waitForTimeout(1500);
  assert.equal(scripts.length, 0, "the form loaded with the first screen");
  await pg.evaluate(() => document.getElementById("feedbackSection").scrollIntoView());
  await pg.waitForSelector("#feedbackSection .afb-chip", { timeout: 10000 });
  assert.equal(scripts.length, 1);
  assert.equal(await pg.$$eval("#feedbackSection [name=contacto]", (e) => e.length), 0, "the compact form asks for contact details");
  assert.equal(await pg.getAttribute("#feedbackSection .afb-more", "href"), "/opinion.html");
  await pg.fill('#feedbackSection [name="mensaje"]', "Que lleguen más rápido los pedidos");
  posted.length = 0;
  await pg.tap("#feedbackSection .afb-send");
  await pg.waitForSelector("#feedbackSection .afb-done");
  assert.equal(posted[0].page, "inicio");
  assert.equal(posted[0].tipo, "recomendacion");
  if (process.env.SHOT) {
    await pg.tap("#feedbackSection .afb-done button");
    await pg.evaluate(() => { const s = document.getElementById("feedbackSection"); scrollTo(0, s.getBoundingClientRect().top + scrollY - 70); });
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: process.env.SHOT + "-home.png" });
  }
  await ctx.close();
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
