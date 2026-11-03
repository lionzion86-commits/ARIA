/* ==================================================================
   ¿CÓMO PODEMOS MEJORAR? -- Danny's copy order (#443 c.6614714225).

   Pins:
     1. the exact headline and subline on both doors: the homepage
        section above the footer and /opinion.html;
     2. the footer label on every page that links /opinion.html, and the
        old label nowhere;
     3. where a submission lands: the form posts to the feedback
        function, the function stores the message and hands it to the
        email sender (SMTP -- Aria's Zoho mailbox -- or Resend), and the
        email goes to contacto@ariashop.pe. The sender is mocked: nothing
        leaves the machine.

     node scripts/test/feedback-copy-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { receiveFeedback, sendFeedbackCopy, FEEDBACK_TO } from "../../netlify/functions/_feedback.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (f) => readFileSync(ROOT + f, "utf8");
const HEADLINE = "¿Cómo podemos mejorar?";
const SUBLINE = "Siempre estamos dispuestos a mejorar y hacerlo mejor para ustedes, los compradores. Sin ustedes, Aria Shop no existiría. Déjanos tu comentario: recomendaciones, quejas o comentarios bonitos — todo nos ayuda.";
const OLD = /Danos tu feedback|Recomendaciones, consejos y opiniones: cuéntanos/;
const words = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

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
  };
}
const msgs = (store) => [...store.m.keys()].filter((k) => k.startsWith("msg/")).map((k) => JSON.parse(store.m.get(k)));

await check("homepage section: the exact headline and subline, above the footer, form still compact and lazy", () => {
  const home = read("index.html");
  const a = home.indexOf('<section id="feedbackSection"');
  assert.ok(a > 0, "the section is gone");
  const sec = home.slice(a, home.indexOf("</section>", a));
  const h2 = sec.match(/<h2 id="feedbackTitle"[^>]*>([\s\S]*?)<\/h2>/);
  assert.ok(h2, "no headline");
  assert.equal(words(h2[1]), HEADLINE);
  const p = sec.match(/<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(p, "no subline right under the headline");
  assert.equal(words(p[1]), SUBLINE);
  assert.ok(!OLD.test(sec), "the old copy is still in the section");
  assert.ok(sec.includes('data-feedback-form data-compact="1"'), "the compact form");
  assert.ok(!/<script[^>]+feedback-form\.js/.test(home), "the form loads eagerly");
  assert.ok(home.includes("new IntersectionObserver") && home.includes("s.src = '/feedback-form.js'"), "the lazy loader");
  assert.ok(home.indexOf("<footer") > a, "the section is not above the footer");
});

await check("/opinion.html: the exact headline (h1 and title) and subline", () => {
  const page = read("opinion.html");
  const h1 = page.match(/<h1>([\s\S]*?)<\/h1>/);
  assert.equal(words(h1[1]), HEADLINE);
  assert.equal(words(page.match(/<\/h1>\s*<p class="lead">([\s\S]*?)<\/p>/)[1]), SUBLINE);
  assert.equal(page.match(/<title>([^<]*)<\/title>/)[1], `${HEADLINE} — Aria Shop`);
  assert.ok(!OLD.test(page), "the old copy is still on the page");
  assert.ok(page.includes("<div data-feedback-form></div>"), "the full form");
});

await check("still not the Libro de Reclamaciones: neither door calls itself one", () => {
  const home = read("index.html");
  const a = home.indexOf('<section id="feedbackSection"');
  const sec = home.slice(a, home.indexOf("</section>", a));
  const page = read("opinion.html");
  for (const t of [words(sec), words(page.slice(page.indexOf("<main>"), page.indexOf("</main>")))]) {
    assert.ok(!/reclamaci[oó]n|libro de reclamaciones/i.test(t), "a door calls itself a complaints book");
  }
});

await check("footer label: every link to /opinion.html reads «¿Cómo podemos mejorar?»; the old label is nowhere", () => {
  const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
  const bundles = readdirSync(ROOT + "build").filter((f) => /^app-.*\.js$/.test(f)).map((f) => "build/" + f);
  let links = 0;
  for (const f of [...pages, ...bundles, "feedback-form.js"]) {
    const s = read(f);
    assert.ok(!/Danos tu feedback/.test(s), f + " still says «Danos tu feedback»");
    if (!f.endsWith(".html")) continue;
    const foot = s.slice(s.lastIndexOf("<footer"));
    for (const m of foot.matchAll(/<a\b[^>]*href="\/?opinion\.html"[^>]*>([\s\S]*?)<\/a>/g)) { links++; assert.equal(words(m[1]), HEADLINE, f); }
  }
  assert.ok(links >= 2, "the homepage and /opinion.html footers link the page: " + links);
});

await check("the form posts to the feedback function; no Netlify Forms, no mailto as the send path", () => {
  const form = read("feedback-form.js");
  assert.ok(form.includes("var ENDPOINT = '/.netlify/functions/feedback';"));
  assert.ok(/fetch\(ENDPOINT, \{ method: 'POST'/.test(form));
  for (const f of ["index.html", "opinion.html", "feedback-form.js"]) assert.ok(!/data-netlify|netlify-honeypot/.test(read(f)), f + " uses Netlify Forms");
  /* the HTTP door uses receiveFeedback's default sender (sendFeedbackCopy) */
  const door = read("netlify/functions/feedback.js");
  assert.ok(/receiveFeedback\(\{ body, ip: clientIp\(event\.headers \|\| \{\}\), store: getStore\(FEEDBACK_STORE\) \}\)/.test(door), "the door no longer calls receiveFeedback with its default sender");
  assert.ok(/send = sendFeedbackCopy/.test(read("netlify/functions/_feedback.js")));
});

await check("a submission reaches the email: SMTP (Zoho) to contacto@, stored first, marked emailed", async () => {
  assert.equal(FEEDBACK_TO, "contacto@ariashop.pe");
  const store = memStore();
  const mails = [];
  const env = { SMTP_HOST: "smtp.correo.test", SMTP_PORT: "465", SMTP_USER: "pedidos@correo.test", SMTP_PASS: "x" };
  const createTransport = (opts) => ({ async sendMail(m) { mails.push({ opts, m }); return { messageId: "<m1@correo.test>" }; } });
  const out = await receiveFeedback({
    body: { tipo: "opinion", mensaje: "Me gustó mucho, pero el envío tardó", contacto: "ana@correo.test", page: "inicio" },
    ip: "203.0.113.9", store, send: (rec) => sendFeedbackCopy(rec, { env, createTransport }),
  });
  assert.deepEqual(out, { status: 200, body: { ok: true } });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].opts.host, "smtp.correo.test");
  assert.deepEqual(mails[0].opts.auth, { user: "pedidos@correo.test", pass: "x" });
  assert.equal(mails[0].m.to, "contacto@ariashop.pe");
  assert.equal(mails[0].m.from, "Aria <pedidos@correo.test>");
  assert.equal(mails[0].m.replyTo, "ana@correo.test");
  assert.match(mails[0].m.text, /Me gustó mucho, pero el envío tardó/);
  assert.match(mails[0].m.html, /¿Cómo podemos mejorar\?/);
  const [rec] = msgs(store);
  assert.equal(rec.emailed, true);
  assert.equal(rec.mensaje, "Me gustó mucho, pero el envío tardó");
});

await check("without SMTP, the same submission goes over Resend to contacto@", async () => {
  const store = memStore();
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ id: "re_1" }) }; };
  await receiveFeedback({
    body: { tipo: "recomendacion", mensaje: "Traigan más tallas", page: "opinion" },
    ip: "203.0.113.10", store, send: (rec) => sendFeedbackCopy(rec, { env: { RESEND_API_KEY: "re_test" }, fetchImpl }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ["contacto@ariashop.pe"]);
  assert.equal(msgs(store)[0].emailed, true);
});

await check("no provider configured: the message is still kept and says why it was not emailed (admin Más > Feedback shows it)", async () => {
  const store = memStore();
  await receiveFeedback({ body: { tipo: "consejo", mensaje: "Pongan filtros por talla" }, ip: "203.0.113.11", store, send: (rec) => sendFeedbackCopy(rec, { env: {} }) });
  const [rec] = msgs(store);
  assert.equal(rec.emailed, false);
  assert.match(rec.emailError, /no hay proveedor de correo/);
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
