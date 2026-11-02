/* ==================================================================
   ARIA KEY CLUB -- THE DOOR, THE CONFIRMATION, THE DASHBOARD (#443,
   Danny 2026-11-01/02, c.6569401037 .. c.6569684988; the FINAL credit
   rules, c.6569722842 .. c.6569863826).

   Plain node. Every person, email and order here is a TEST FIXTURE; no
   network, no real email (the mail provider is a stub, or absent).

   Unit level (real rules, in-memory stores):
     - no signup pop-up/modal remains anywhere; every entry routes to
       /keyclub.html; only the door calls auth-signup;
     - the door says exactly the four earning lines, 1 crédito = US$1,
       the Founders line, «gratis durante el lanzamiento», no day count;
     - the killed "5% de vuelta / créditos con cada compra" copy is in
       no served file (pages, bundle, scripts, emails);
     - signup -> confirmation email requested -> unconfirmed login
       refused -> confirm token -> member active, lands in the dashboard;
       with no provider the email is reported "not sent";
     - the token is random, stored hashed, single-use, expiring, and a
       resend supersedes the old link;
     - theme preference saved on the account;
     - wallet renders at 0; Fundador rule; member numbers unique;
     - early access hides an item publicly before unlockAt and shows it
       to members (server rule and the browser helper agree);
     - the FINAL credit rules: birthday US$5; the spend perk per order
       (US$5 flat for a US$100+ merchandise subtotal, every such order in
       the first 60 days, then the first of each Lima month); referral
       US$5; overweight offered to members only; a non-member gets no
       credit of any kind (grantCredit refuses);
     - banned credit copy is absent from every page and the bundle;
     - the guest alert in checkout renders non-blocking for a guest and
       not for a member.
   Browser (390 px, Playwright, real rules behind a local server):
     door, form, «Te enviamos un correo — confírmalo para entrar», the
     confirmation link landing in the dashboard, both themes with an
     identical DOM, the theme persisting on the account, no horizontal
     overflow. Screenshots: KEYCLUB_SHOTS (default: the scratchpad dir
     given by the brief, else reports/screens).

   RUN: node scripts/test/key-club-tests.mjs
   Port: KEY_CLUB_PORT (default 8977).
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import vm from "node:vm";
import { register } from "node:module";
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0, failed = 0;
async function check(name, fn) {
  try { const note = await fn(); passed++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n         " + String(e && e.stack || e).split("\n").slice(0, 6).join("\n         ")); }
}

/* ---- @netlify/blobs in memory, so the real function modules load ---- */
globalThis.__blobs = new Map();
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === "@netlify/blobs") return { url: "data:text/javascript," + encodeURIComponent(
      "const S = globalThis.__blobs;" +
      "export const connectLambda = () => {};" +
      "export function getStore(name){ if(!S.has(name)) S.set(name,new Map()); const m=S.get(name);" +
      " return { get: async (k)=> m.has(k)? JSON.parse(m.get(k)) : null," +
      " setJSON: async (k,v,o)=>{ if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; }," +
      " delete: async (k)=>{ m.delete(k); }, list: async ()=>({ blobs: [...m.keys()].map(key=>({key})) }) }; }"
    ), shortCircuit: true };
    return next(spec, ctx);
  }
`), import.meta.url);

const K = await import(ROOT + "netlify/functions/_keyclub.js");
const A = await import(ROOT + "netlify/functions/_account.js");
const SU = await import(ROOT + "netlify/functions/auth-signup.js");
const LI = await import(ROOT + "netlify/functions/auth-login.js");
const CF = await import(ROOT + "netlify/functions/auth-confirm.js");
const PR = await import(ROOT + "netlify/functions/keyclub-prefs.js");
const E = await import(ROOT + "netlify/functions/_order-email.js");
const D = await import(ROOT + "netlify/functions/_dni-docs.js");
const V = await import(ROOT + "netlify/functions/_keyclub-verify.js");

/* An in-memory store with the create-only write the real one has. */
function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    setJSON: async (k, v, o) => { if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, JSON.stringify(v)); return { modified: true }; },
    delete: async (k) => { m.delete(k); },
    list: async (o) => ({ blobs: [...m.keys()].filter((k) => !(o && o.prefix) || k.startsWith(o.prefix)).map((key) => ({ key })) }),
  };
}
function freshStores() {
  return { users: memStore(), sessions: memStore(), keyclub: memStore(), docs: memStore(), packs: memStore(),
    orders: memStore(), shipments: memStore(), wallet: memStore(), carts: memStore() };
}
/* The mail provider, stubbed: records what would have been sent. */
function stubMailer() {
  const sent = [];
  const fn = async (msg, opts) => { sent.push({ msg, opts }); return { sent: true, id: "stub-" + sent.length }; };
  fn.sent = sent;
  return fn;
}
/* The code step by email (the channel live today): send, read, check. */
async function verifyByEmail(S, email) {
  let code = null;
  const [sc, so] = await V.sendCode(S, email, { channel: "email" }, { env: {}, senders: { email: async (u, c) => { code = c; return { sent: true }; } } });
  assert.equal(sc, 200, JSON.stringify(so));
  const [cc, co] = await V.checkCode(S, email, { code });
  assert.equal(cc, 200, JSON.stringify(co));
  return co;
}
const tokenFrom = (msg) => decodeURIComponent(/confirmar=([^\s"&<]+)/.exec(msg.text)[1]);
/* A wallet poster, stubbed like _wallet.postTransaction. */
function stubWallet() {
  const w = new Map();
  const post = async ({ email, kind, amountPen, reason, credits, fxRate, orderId }) => {
    const cur = w.get(email) || { balancePen: 0, txns: [] };
    cur.balancePen = Math.round((cur.balancePen + (kind === "credit" ? amountPen : -amountPen)) * 100) / 100;
    cur.txns.unshift({ kind, amountPen, reason, credits, fxRate, orderId });
    w.set(email, cur);
    return { balancePen: cur.balancePen };
  };
  return { w, post };
}

const SERVED_HTML = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
const bundleName = /<script src="\/(build\/app-[0-9a-f]{16}\.js)"><\/script>/.exec(indexHtml)[1];
const bundle = readFileSync(join(ROOT, bundleName), "utf8");
const door = readFileSync(join(ROOT, "keyclub.html"), "utf8");
const cuenta = readFileSync(join(ROOT, "cuenta.html"), "utf8");
const checkout = readFileSync(join(ROOT, "checkout.html"), "utf8");
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const textOf = (html) => stripComments(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

console.log("\n  One entry flow, no pop-up");

await check("no signup modal remains: no auth modal markup, the bundle's openAuthModal only navigates, nothing but the door posts to auth-signup", () => {
  for (const id of ["authModalBackdrop", "authForm", "authNameWrap", "authPhoneWrap", "authSubmitBtn"]) {
    assert.ok(!indexHtml.includes(`id="${id}"`), `index.html still has #${id}`);
  }
  const fnSrc = /function openAuthModal\(mode\)\{([\s\S]*?)\n\}/.exec(bundle);
  assert.ok(fnSrc, "openAuthModal missing from the bundle");
  assert.match(fnSrc[1], /location\.href = mode === 'signup' \? '\/keyclub\.html#unirme' : '\/cuenta\.html'/);
  assert.ok(!/authModalBackdrop|submitAuth|switchAuthMode/.test(bundle), "modal code is still in the bundle");
  assert.match(bundle, /if \(id === 'keyclubView'\) \{ location\.href = '\/keyclub\.html'; return; \}/, "keyclubView does not route to the door");
  const callers = [];
  const files = [...SERVED_HTML, bundleName, ...readdirSync(join(ROOT, "assets/js")).map((f) => "assets/js/" + f)];
  for (const f of files) if (/auth-signup/.test(stripComments(readFileSync(join(ROOT, f), "utf8")))) callers.push(f);
  assert.deepEqual(callers, ["keyclub.html"], "only the door may create an account");
  assert.ok(!/kcPass|kcInviteGo/.test(checkout), "checkout still carries an inline signup");
  assert.match(checkout, /id="kcInviteYes" href="\/keyclub\.html[^"]*"/, "the checkout card does not route to the door");
  assert.match(indexHtml, /<a href="\/keyclub\.html" data-keyclub-door[^>]*>Unirme al Aria Key Club<\/a>/, "the homepage block does not route to the door");
  assert.match(bundle, /<a href="\/keyclub\.html" data-keyclub-door[^>]*>Unirme gratis<\/a>/, "the cart banner does not route to the door");
  assert.ok(!/openAuthModal\('signup'\)/.test(checkout + cuenta + door), "a page still opens a signup modal");
});

console.log("\n  The door's copy");

await check("exactly the four earning lines (word for word), 1 crédito = US$1, the DNI and returns facts, the Founders line, no launch day count", () => {
  const earn = [...door.matchAll(/<li data-earn>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
  assert.deepEqual(earn, K.EARN_WAYS);
  assert.equal(K.EARN_WAYS.length, 4);
  assert.match(K.EARN_WAYS[0], /sobrepeso[\s\S]*diferencia exacta del flete[\s\S]*\$13 por kilo/);
  assert.match(K.EARN_WAYS[1], /^\$5 por compra de \$100 o más: durante tus primeros 60 días[\s\S]*en la primera de cada mes[\s\S]*sin impuestos ni flete/);
  assert.match(K.EARN_WAYS[2], /^\$5 \(5 créditos\) cuando tu amiga invitada se une al Key Club y hace su primera compra/);
  assert.equal(K.EARN_WAYS[3], "$5 en tu cumpleaños.");
  assert.match(textOf(door), /Con tu fecha te llegan \$5 en créditos cada cumpleaños/);
  const t = textOf(door);
  assert.match(t, /Cómo se ganan/);
  assert.match(t, /1 crédito = US\$1/);
  assert.match(t, /Tu DNI queda registrado una sola vez y no lo vuelves a subir\./);
  assert.match(t, /devoluciones vuelven como crédito al instante/);
  assert.match(t, /Los primeros 1,000 miembros entran gratis por un año y quedan como Fundadores para siempre\./);
  assert.match(t, /Gratis durante el lanzamiento/i);
  assert.match(t, /Aria es la llave/);
  assert.ok(!/\b\d+\s*d[ií]as\b/i.test(t.replace(/48 horas/, "").replace(/primeros 60 días/g, "")), "a launch day count is printed on the door");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(door), "emoji on the door");
  assert.ok(!/href="https?:\/\/(?!ariashop\.pe)/.test(door), "the door links off the site");
});

await check("the form asks nombre, correo, WhatsApp, cumpleaños (optional), contraseña and DNI now-or-later, with one clear CTA", () => {
  for (const id of ["fName", "fEmail", "fPhone", "fBirthday", "fPass"]) assert.match(door, new RegExp(`id="${id}"`));
  assert.match(door, /<label for="fPhone">WhatsApp<\/label>/);
  assert.match(door, /type="date" id="fBirthday"/);
  assert.match(door, /value="later" checked> Después/);
  assert.match(door, /value="now"> Subirlo ahora/);
  const joinForm = /<form class="card" id="joinForm"[\s\S]*?<\/form>/.exec(door)[0];
  assert.equal((joinForm.match(/type="submit"/g) || []).length, 1, "the form must have exactly one CTA");
  assert.match(joinForm, /<button class="cta form-cta" type="submit" id="joinBtn">Crear mi llave<\/button>/);
});

console.log("\n  The killed 5% rule");

const KILLED = [/5\s?%\s*(de\s+)?(cashback|de vuelta)/i, /cashback/i, /\$5 (de vuelta )?por cada \$100/i, /por cada \$100/i, /cr[eé]ditos? con cada compra/i, /cada compra te devuelv/i, /cada compra suma/i, /keyClubCreditPen|KEY_CLUB_RATE/,
  /* the FINAL rules (#443 c.6569722842 ..): the old numbers and the banned lines */
  /US\$10 en tu cumplea/i, /\$10 en cr[eé]ditos cada cumplea/i, /primeros US\$100 en compras/i, /solo la primera vez\)/i,
  /cr[eé]ditos? (dobles|al doble)|doble(s)? cr[eé]ditos?/i, /(cr[eé]ditos?|saldo)[^.<]{0,30}(no vencen|nunca vencen|no expiran|never expire)/i];
await check("no served file carries the killed or banned copy (every html page, the bundle source and min, scripts, emails, the account rules)", () => {
  const files = [...SERVED_HTML, bundleName, bundleName.replace("build/", "build/min/"),
    ...readdirSync(join(ROOT, "assets/js")).map((f) => "assets/js/" + f),
    "netlify/functions/_order-email.js", "netlify/functions/_account.js", "netlify/functions/_keyclub.js"];
  const hits = [];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const re of KILLED) if (re.test(src)) hits.push(`${f}: ${re}`);
  }
  assert.deepEqual(hits, []);
  /* Key Club surfaces: no "5%" and no "cada compra" at all. */
  const kcText = [textOf(door), textOf(cuenta), A.WALLET_RULES.join(" "), K.EARN_WAYS.join(" ")].join(" ");
  assert.ok(!/5\s?%/.test(kcText) && !/cada compra/i.test(kcText), "5% / cada compra on a Key Club surface");
  const club = /<section aria-label="Aria Key Club"[\s\S]*?<\/section>/.exec(indexHtml)[0];
  assert.ok(!/5\s?%|cada compra|de vuelta/i.test(textOf(club)), "the homepage Key Club block still makes the claim");
  const conf = E.keyClubConfirmationEmail({ to: "a@b.test", name: "Ana", link: "https://ariashop.pe/keyclub.html?confirmar=x" });
  const order = E.orderConfirmationEmail({ orderId: "ARIA-T", customer: { email: "a@b.test", name: "Ana" }, items: [{ title: "x", priceUsd: 1, qty: 1 }], pricePenCharged: 4 });
  for (const m of [conf, order]) assert.ok(!/5\s?%|cashback|cada compra/i.test(m.text + m.html), "an email carries the killed copy");
});

console.log("\n  Signup, confirmation, login");

const ANA = "ana.prueba@correo.test";
await check("signup stores an UNCONFIRMED account, requests the confirmation email, opens no session; unconfirmed login is refused", async () => {
  const S = freshStores(); const mail = stubMailer();
  const [code, out] = await SU.signup(S, { name: "Ana Prueba", email: ANA, phone: "+51 900 000 000", birthday: "1994-03-12", password: "clave-de-prueba" }, { mailer: mail, env: { URL: "https://ariashop.pe" } });
  assert.equal(code, 200);
  assert.deepEqual(out, { pendingConfirmation: true, email: ANA, emailSent: true });
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].msg.to, ANA);
  assert.match(mail.sent[0].msg.text, /https:\/\/ariashop\.pe\/keyclub\.html\?confirmar=/);
  const u = await S.users.get(ANA, { type: "json" });
  assert.equal(u.confirmRequired, true); assert.equal(u.emailConfirmedAt, null); assert.equal(u.birthday, "1994-03-12");
  assert.equal(S.sessions.m.size, 0, "a session was opened before confirmation");
  const [lc, lo, sid] = await LI.login(S, { email: ANA, password: "clave-de-prueba" });
  assert.equal(lc, 403); assert.equal(lo.needsConfirmation, true); assert.equal(sid, null);
  const [bad] = await LI.login(S, { email: ANA, password: "otra-clave" });
  assert.equal(bad, 401, "a wrong password must not learn the account is unconfirmed");
});

await check("the link confirms (number, invite code, session) and lands on the CODE STEP, not the dashboard; after the code she is active and later logins land in the dashboard", async () => {
  const S = freshStores(); const mail = stubMailer();
  await SU.signup(S, { name: "Ana Prueba", email: ANA, phone: "+51 900 000 000", password: "clave-de-prueba" }, { mailer: mail });
  const [code, out, sid] = await CF.confirm(S, tokenFrom(mail.sent[0].msg));
  assert.equal(code, 200);
  assert.equal(out.redirect, "/keyclub.html?verificar=1");
  assert.equal(out.needsVerification, true);
  assert.ok(sid && (await S.sessions.get(sid, { type: "json" })).email === ANA);
  const u = await S.users.get(ANA, { type: "json" });
  assert.ok(u.emailConfirmedAt && u.memberNumber === 1 && /^[A-Z0-9]{7}$/.test(u.referralCode));
  assert.equal(u.verifyRequired, true); assert.equal(u.phoneVerified, false);
  const pre = await A.accountOverview(S, ANA);
  assert.deepEqual(pre, { signedIn: true, needsVerification: true, redirect: "/keyclub.html?verificar=1" }, "the dashboard opened before the code step");
  await verifyByEmail(S, ANA);
  const ov = await A.accountOverview(S, ANA);
  assert.equal(ov.profile.club.active, true);
  assert.equal(ov.profile.club.memberNumberLabel, "0001");
  assert.equal(ov.profile.club.founder, true);
  const [lc, lo, lsid] = await LI.login(S, { email: ANA, password: "clave-de-prueba" });
  assert.equal(lc, 200); assert.equal(lo.redirect, "/cuenta.html"); assert.ok(lsid);
});

await check("with no mail provider configured, the email is reported NOT sent (and the door is told so)", async () => {
  const r = await E.sendMail({ to: ANA, subject: "s", text: "t", html: "h" }, { env: {} });
  assert.equal(r.sent, false); assert.match(r.error, /no hay proveedor/);
  const S = freshStores();
  const [code, out] = await SU.signup(S, { name: "Ana", email: ANA, phone: "+51 900 000 000", password: "clave-de-prueba" }, { env: {} });
  assert.equal(code, 200); assert.equal(out.emailSent, false);
  assert.match((await S.users.get(ANA, { type: "json" })).confirmEmailError, /no hay proveedor/);
});

await check("the confirmation goes through the existing provider path (Resend stub) with the existing env config", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers }); return { ok: true, json: async () => ({ id: "re_1" }) }; };
  const msg = E.keyClubConfirmationEmail({ to: ANA, name: "Ana", link: "https://ariashop.pe/keyclub.html?confirmar=abc" });
  const r = await E.sendMail(msg, { env: { RESEND_API_KEY: "re_test_x" }, fetchImpl, idempotencyKey: "k1" });
  assert.equal(r.sent, true);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].body.to[0], ANA); assert.equal(calls[0].headers["Idempotency-Key"], "k1");
  assert.match(calls[0].body.subject, /Confirma tu correo/);
});

await check("«DNI ahora»: the door's two photo tokens become her pack when she confirms", async () => {
  const S = freshStores(); const mail = stubMailer();
  const b64 = Buffer.alloc(10000, 7).toString("base64");
  const front = await D.saveUpload(S.docs, { side: "front", contentType: "image/jpeg", bytes: 10000, base64: b64 });
  const back = await D.saveUpload(S.docs, { side: "back", contentType: "image/jpeg", bytes: 10000, base64: b64 });
  const [code] = await SU.signup(S, { name: "Ana Prueba", email: ANA, phone: "+51 900 000 000", password: "clave-de-prueba", dni: { docNumber: "45678912", front, back } }, { mailer: mail });
  assert.equal(code, 200);
  await CF.confirm(S, tokenFrom(mail.sent[0].msg));
  const pack = await D.packFor(S.packs, ANA, "45678912");
  assert.ok(pack && pack.front === front && pack.back === back);
  assert.equal((await S.docs.get(`meta:${front}`, { type: "json" })).retention, "member");
});

console.log("\n  The token");

await check("random, stored only as a hash, single use", async () => {
  const S = freshStores(); const mail = stubMailer();
  await SU.signup(S, { name: "Ana", email: ANA, phone: "+51 900 000 000", password: "clave-de-prueba" }, { mailer: mail });
  const token = tokenFrom(mail.sent[0].msg);
  assert.ok(token.length >= 40, "token too short");
  const everything = JSON.stringify([...S.keyclub.m.entries(), ...S.users.m.entries()]);
  assert.ok(!everything.includes(token), "the raw token is stored");
  assert.ok(everything.includes(K.hashToken(token)), "the hash is not stored");
  const [c1] = await CF.confirm(S, token);
  const [c2, o2] = await CF.confirm(S, token);
  assert.equal(c1, 200); assert.equal(c2, 400); assert.equal(o2.code, "invalid");
});

await check("expires after 48 hours; a resend supersedes the older link; resend never reveals whether an account exists", async () => {
  const S = freshStores(); const mail = stubMailer();
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  await SU.signup(S, { name: "Ana", email: ANA, phone: "+51 900 000 000", password: "clave-de-prueba" }, { mailer: mail, now: t0 });
  const old = tokenFrom(mail.sent[0].msg);
  const r1 = await K.consumeConfirmation(S, old, t0 + 49 * 3600 * 1000);
  assert.equal(r1.code, "expired");
  const [rc, ro] = await CF.resend(S, ANA, { mailer: mail, now: t0 + 50 * 3600 * 1000 });
  assert.equal(rc, 200); assert.equal(mail.sent.length, 2); assert.equal(ro.emailSent, true);
  /* a third link, then the second is no longer the latest */
  const second = tokenFrom(mail.sent[1].msg);
  await CF.resend(S, ANA, { mailer: mail, now: t0 + 52 * 3600 * 1000 });
  const third = tokenFrom(mail.sent[2].msg);
  const r2 = await K.consumeConfirmation(S, second, t0 + 52 * 3600 * 1000 + 1);
  assert.equal(r2.code, "superseded");
  const r3 = await K.consumeConfirmation(S, third, t0 + 52 * 3600 * 1000 + 2);
  assert.equal(r3.ok, true);
  const [nc, no] = await CF.resend(S, "nadie@correo.test", { mailer: mail });
  assert.equal(nc, 200); assert.equal(no.emailSent, undefined); assert.equal(mail.sent.length, 3);
  /* throttled: a second resend within a minute sends nothing */
  const S2 = freshStores(); const m2 = stubMailer();
  await SU.signup(S2, { name: "Bea", email: "bea@correo.test", phone: "+51 900 000 000", password: "clave-de-prueba" }, { mailer: m2 });
  await CF.resend(S2, "bea@correo.test", { mailer: m2 });
  assert.equal(m2.sent.length, 1, "resend inside a minute sent again");
});

await check("old accounts (no confirmation flag) still sign in and get their member number on first dashboard load", async () => {
  const S = freshStores();
  const hash = await (await import(ROOT + "netlify/functions/_auth-helpers.js")).hashPassword("clave-antigua");
  await S.users.setJSON("antigua@correo.test", { email: "antigua@correo.test", passwordHash: hash, name: "Antigua", createdAt: "2026-10-01T00:00:00Z" });
  const [lc] = await LI.login(S, { email: "antigua@correo.test", password: "clave-antigua" });
  assert.equal(lc, 200);
  const u = await K.ensureMembership(S, "antigua@correo.test");
  assert.equal(u.memberNumber, 1); assert.ok(u.referralCode);
});

console.log("\n  Dashboard rules");

await check("the theme is saved on her account (server-side), validated, session-only", async () => {
  const S = freshStores();
  await S.users.setJSON(ANA, { email: ANA, name: "Ana" });
  assert.deepEqual(await PR.savePrefs(S.users, ANA, { theme: "amanecer" }), [200, { ok: true, theme: "amanecer" }]);
  assert.equal((await S.users.get(ANA, { type: "json" })).theme, "amanecer");
  assert.equal(K.keyClubView(await S.users.get(ANA, { type: "json" })).theme, "amanecer");
  assert.equal((await PR.savePrefs(S.users, ANA, { theme: "neon" }))[0], 400);
  assert.equal((await PR.savePrefs(S.users, null, { theme: "lounge" }))[0], 401);
  assert.equal(K.keyClubView({}).theme, "lounge", "default theme");
});

await check("the wallet renders at S/ 0.00 with the four lines and nothing about 5%", async () => {
  const w = A.walletView(null);
  assert.equal(w.balancePen, 0); assert.deepEqual(w.ledger, []);
  assert.deepEqual(w.earnWays, K.EARN_WAYS); assert.equal(w.creditUnit, "1 crédito = US$1");
});

await check("Fundador: members 1..1000 are Fundadores for ever, 1001 is not; numbers are unique even when confirmed at once", async () => {
  assert.equal(K.isFounder(1), true); assert.equal(K.isFounder(1000), true);
  assert.equal(K.isFounder(1001), false); assert.equal(K.isFounder(0), false); assert.equal(K.isFounder(null), false);
  const store = memStore();
  const nums = await Promise.all(Array.from({ length: 12 }, (_, i) => K.assignMemberNumber(store, `m${i}@correo.test`)));
  assert.equal(new Set(nums).size, 12, "two members share a number: " + nums.join(","));
  await store.setJSON("counter", { last: 999 });
  const n1000 = await K.assignMemberNumber(store, "mil@correo.test");
  const n1001 = await K.assignMemberNumber(store, "miluno@correo.test");
  assert.deepEqual([n1000, K.isFounder(n1000), n1001, K.isFounder(n1001)], [1000, true, 1001, false]);
});

console.log("\n  The code step: email confirmed AND a 6-digit code (#443, Danny c.6570940933 .. c.6570984289)");

/* An account through signup + the email link, still owing the code. */
async function confirmedUnverified(email = ANA, phone = "+51 900 000 000") {
  const S = freshStores(); const mail = stubMailer();
  const [c] = await SU.signup(S, { name: "Ana Prueba", email, phone, password: "clave-de-prueba" }, { mailer: mail });
  assert.equal(c, 200);
  const [cc] = await CF.confirm(S, tokenFrom(mail.sent[0].msg));
  assert.equal(cc, 200);
  return S;
}
const capture = () => { const got = []; const fn = async (u, c) => { got.push(c); return { sent: true }; }; fn.got = got; return fn; };

await check("signup: the WhatsApp number is required and must be a real cell; the door says why in one line", async () => {
  const S = freshStores(); const mail = stubMailer();
  const [c1, o1] = await SU.signup(S, { name: "Ana", email: ANA, password: "clave-de-prueba" }, { mailer: mail });
  assert.equal(c1, 400); assert.match(o1.error, /WhatsApp/);
  const [c2] = await SU.signup(S, { name: "Ana", email: ANA, phone: "12", password: "clave-de-prueba" }, { mailer: mail });
  assert.equal(c2, 400);
  assert.equal(mail.sent.length, 0, "an email went out for an invalid signup");
  assert.equal(V.normalizePhone("987 654 321"), "+51987654321");
  assert.equal(V.normalizePhone("+51 987-654-321"), "+51987654321");
  assert.equal(V.normalizePhone("abc"), null);
  assert.match(door, /<input type="tel" id="fPhone"[^>]* required>/);
  assert.equal(/<p class="hint" id="phoneWhy">([^<]*)<\/p>/.exec(door)[1], "Tus alertas de ofertas te llegan por WhatsApp.");
});

await check("the code: 6 digits, stored only as a salted hash with a 10-minute expiry, never in plain text", async () => {
  const S = await confirmedUnverified(); const send = capture();
  const t0 = Date.parse("2026-11-02T15:00:00Z");
  const [c, o] = await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send }, now: t0 });
  assert.equal(c, 200); assert.equal(o.sent, true); assert.equal(o.channel, "email"); assert.equal(o.to, "an•••@correo.test");
  const code = send.got[0];
  assert.match(code, /^\d{6}$/);
  const rec = await S.keyclub.get("verify:" + ANA, { type: "json" });
  assert.ok(rec.salt && /^[0-9a-f]{64}$/.test(rec.codeHash));
  assert.equal(rec.codeHash, V.hashCode(code, rec.salt));
  assert.equal(Date.parse(rec.expiresAt) - t0, 10 * 60 * 1000);
  for (const [k, v] of [...S.keyclub.m, ...S.users.m]) assert.ok(!v.includes(`"${code}"`) && !v.includes(`:${code}"`), "the plain code is stored at " + k);
  assert.ok(!JSON.stringify(o).includes(code), "the code went back to the browser");
  const codes = new Set(Array.from({ length: 200 }, () => V.newCode()));
  assert.ok(codes.size > 150 && [...codes].every((x) => /^\d{6}$/.test(x)), "codes are not random 6-digit strings");
});

await check("the code expires after 10 minutes: refused and gone", async () => {
  const S = await confirmedUnverified(); const send = capture();
  const t0 = Date.parse("2026-11-02T15:00:00Z");
  await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send }, now: t0 });
  const [c, o] = await V.checkCode(S, ANA, { code: send.got[0] }, { now: t0 + 10 * 60 * 1000 + 1 });
  assert.equal(c, 410); assert.equal(o.code, "expired");
  assert.equal(await S.keyclub.get("verify:" + ANA, { type: "json" }), null);
  assert.equal((await S.users.get(ANA, { type: "json" })).verifiedAt, null);
});

await check("5 wrong tries and the code is gone -- even the right one no longer works", async () => {
  const S = await confirmedUnverified(); const send = capture();
  await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send } });
  const right = send.got[0], wrong = right === "000000" ? "111111" : "000000";
  for (let i = 1; i <= 4; i++) {
    const [c, o] = await V.checkCode(S, ANA, { code: wrong });
    assert.equal(c, 400); assert.equal(o.code, "wrong"); assert.equal(o.attemptsLeft, 5 - i);
  }
  const [c5, o5] = await V.checkCode(S, ANA, { code: wrong });
  assert.equal(c5, 429); assert.equal(o5.code, "locked");
  const [c6, o6] = await V.checkCode(S, ANA, { code: right });
  assert.equal(c6, 400); assert.equal(o6.code, "no_code");
  assert.ok(!(await S.users.get(ANA, { type: "json" })).verifiedAt);
});

await check("single use: the right code works once; a second use finds nothing", async () => {
  const S = await confirmedUnverified(); const send = capture();
  await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send } });
  const [c1, o1] = await V.checkCode(S, ANA, { code: send.got[0] });
  assert.equal(c1, 200); assert.equal(o1.redirect, "/cuenta.html?bienvenida=1");
  const [c2, o2] = await V.checkCode(S, ANA, { code: send.got[0] });
  assert.equal(c2, 400); assert.equal(o2.code, "no_code");
});

await check("resends: one a minute, whatever the channel; a new code replaces the old one", async () => {
  const S = await confirmedUnverified(); const send = capture();
  const t0 = Date.parse("2026-11-02T15:00:00Z");
  await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send }, now: t0 });
  const [c2, o2] = await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send }, now: t0 + 30000 });
  assert.equal(c2, 429); assert.equal(o2.code, "too_soon"); assert.equal(o2.retryIn, 30); assert.equal(o2.sent, false);
  assert.equal(send.got.length, 1, "a second code went out inside the minute");
  const [c3] = await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email: send }, now: t0 + 61000 });
  assert.equal(c3, 200); assert.equal(send.got.length, 2);
  if (send.got[0] !== send.got[1]) {
    const [cOld] = await V.checkCode(S, ANA, { code: send.got[0] }, { now: t0 + 62000 });
    assert.equal(cOld, 400, "the replaced code still works");
  }
  const [cNew] = await V.checkCode(S, ANA, { code: send.got[1] }, { now: t0 + 63000 });
  assert.equal(cNew, 200);
});

await check("WhatsApp and SMS without their env: an honest Spanish message, the email offered, no code created, nothing sent, never «sent»", async () => {
  const S = await confirmedUnverified();
  let fetched = 0; const fetchImpl = async () => { fetched++; return { ok: true }; };
  const email = capture();
  for (const [ch, name] of [["whatsapp", "WhatsApp"], ["sms", "SMS"]]) {
    const [c, o] = await V.sendCode(S, ANA, { channel: ch }, { env: {}, senders: { email, whatsapp: (to, x) => V.sendWhatsAppCode(to, x, { env: {}, fetchImpl }), sms: (to, x) => V.sendSmsCode(to, x, { env: {}, fetchImpl }) } });
    assert.equal(c, 200); assert.equal(o.sent, false); assert.equal(o.code, "channel_unavailable"); assert.equal(o.offer, "email");
    assert.equal(o.message, `Los códigos por ${name} todavía no están activos. Puedes recibir tu código por correo.`);
    assert.equal(await S.keyclub.get("verify:" + ANA, { type: "json" }), null, "a code was stored for " + ch);
  }
  assert.equal(fetched, 0); assert.equal(email.got.length, 0, "the email went out without her choosing it");
  /* Half-configured is not configured. */
  assert.equal(V.channelLive("whatsapp", { WHATSAPP_TOKEN: "x" }), false);
  assert.equal(V.channelLive("sms", { TWILIO_ACCOUNT_SID: "x", TWILIO_AUTH_TOKEN: "y" }), false);
  /* She takes the email: it goes. */
  const [ce, oe] = await V.sendCode(S, ANA, { channel: "email" }, { env: {}, senders: { email } });
  assert.equal(ce, 200); assert.equal(oe.sent, true); assert.equal(email.got.length, 1);
  /* No mail provider at all: «not sent», and no code kept. */
  const S2 = await confirmedUnverified();
  const [cn, on] = await V.sendCode(S2, ANA, { channel: "email" }, { env: {} });
  assert.equal(cn, 502); assert.equal(on.sent, false); assert.equal(on.code, "send_failed");
  assert.equal(await S2.keyclub.get("verify:" + ANA, { type: "json" }), null);
});

await check("a live WhatsApp or SMS that fails says so, drops the code, and offers the email", async () => {
  const S = await confirmedUnverified();
  const env = { WHATSAPP_TOKEN: "test-token", WHATSAPP_PHONE_ID: "123" };
  const [c, o] = await V.sendCode(S, ANA, { channel: "whatsapp" }, { env, senders: { whatsapp: (to, x) => V.sendWhatsAppCode(to, x, { env, fetchImpl: async () => ({ ok: false, status: 500 }) }) } });
  assert.equal(c, 502); assert.equal(o.sent, false); assert.equal(o.offer, "email"); assert.match(o.message, /no salió/);
  assert.equal(await S.keyclub.get("verify:" + ANA, { type: "json" }), null);
});

await check("phoneVerified ONLY through the phone: WhatsApp (Cloud API) and SMS (Twilio) set it; email leaves it false", async () => {
  /* WhatsApp, live through env, the request checked. */
  const S1 = await confirmedUnverified();
  const envW = { WHATSAPP_TOKEN: "test-token", WHATSAPP_PHONE_ID: "123" };
  const calls = [];
  const fetchW = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
  const [c1, o1] = await V.sendCode(S1, ANA, { channel: "whatsapp" }, { env: envW, senders: { whatsapp: (to, x) => V.sendWhatsAppCode(to, x, { env: envW, fetchImpl: fetchW }) } });
  assert.equal(c1, 200); assert.equal(o1.sent, true); assert.equal(o1.to, "+51 ••• ••• 000");
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/123/messages");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  const wBody = JSON.parse(calls[0].init.body);
  assert.equal(wBody.to, "51900000000");
  const code1 = /(\d{6})/.exec(wBody.text.body)[1];
  const [k1, r1] = await V.checkCode(S1, ANA, { code: code1 });
  assert.equal(k1, 200); assert.equal(r1.phoneVerified, true); assert.equal(r1.verifiedVia, "whatsapp");
  const u1 = await S1.users.get(ANA, { type: "json" });
  assert.equal(u1.phoneVerified, true); assert.equal(u1.verifiedVia, "whatsapp"); assert.ok(u1.verifiedAt); assert.equal(u1.phoneVerifiedNumber, "+51900000000");
  /* SMS, live through env. */
  const S2 = await confirmedUnverified();
  const envS = { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550000000" };
  const sms = [];
  const fetchS = async (url, init) => { sms.push({ url, init }); return { ok: true }; };
  await V.sendCode(S2, ANA, { channel: "sms" }, { env: envS, senders: { sms: (to, x) => V.sendSmsCode(to, x, { env: envS, fetchImpl: fetchS }) } });
  assert.equal(sms[0].url, "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json");
  const form = new URLSearchParams(sms[0].init.body);
  assert.equal(form.get("To"), "+51900000000"); assert.equal(form.get("From"), "+15550000000");
  const [k2, r2] = await V.checkCode(S2, ANA, { code: /(\d{6})/.exec(form.get("Body"))[1] });
  assert.equal(k2, 200); assert.equal(r2.phoneVerified, true); assert.equal(r2.verifiedVia, "sms");
  /* Email: active, phone NOT verified. */
  const S3 = await confirmedUnverified();
  const r3 = await verifyByEmail(S3, ANA);
  assert.equal(r3.phoneVerified, false); assert.equal(r3.verifiedVia, "email");
  const u3 = await S3.users.get(ANA, { type: "json" });
  assert.equal(u3.phoneVerified, false); assert.equal(u3.verifiedVia, "email"); assert.ok(u3.verifiedAt);
  assert.equal(K.isMember(u3), true, "verified by email but not an active member");
  const ov = await A.accountOverview(S3, ANA);
  assert.equal(ov.profile.club.active, true); assert.equal(ov.profile.club.phoneVerified, false); assert.equal(ov.profile.club.verifiedVia, "email");
  /* Later, «Verificar mi celular»: phone channels only; email is refused there. */
  const [cE] = await V.sendCode(S3, ANA, { channel: "email", purpose: "phone" }, { env: {} });
  assert.equal(cE, 400);
  const [cU, oU] = await V.sendCode(S3, ANA, { channel: "whatsapp", purpose: "phone" }, { env: {} });
  assert.equal(cU, 200); assert.equal(oU.sent, false); assert.equal(oU.offer, null, "the email was offered for a PHONE verification");
  const calls3 = [];
  await V.sendCode(S3, ANA, { channel: "whatsapp", purpose: "phone" }, { env: envW, senders: { whatsapp: (to, x) => V.sendWhatsAppCode(to, x, { env: envW, fetchImpl: async (url, init) => { calls3.push(init); return { ok: true }; } }) } });
  const [k3, r3b] = await V.checkCode(S3, ANA, { code: /(\d{6})/.exec(JSON.parse(calls3[0].body).text.body)[1] });
  assert.equal(k3, 200); assert.equal(r3b.phoneVerified, true); assert.equal(r3b.redirect, "/cuenta.html#datos");
});

await check("confirmed but unverified: login and the account route her to the code step; she is not a member yet (no credits); unconfirmed cannot even ask for a code", async () => {
  const S = await confirmedUnverified();
  const u = await S.users.get(ANA, { type: "json" });
  assert.equal(K.needsVerification(u), true); assert.equal(K.isMember(u), false);
  const [lc, lo, sid] = await LI.login(S, { email: ANA, password: "clave-de-prueba" });
  assert.equal(lc, 200); assert.equal(lo.needsVerification, true); assert.equal(lo.redirect, "/keyclub.html?verificar=1"); assert.ok(sid);
  assert.deepEqual(await A.accountOverview(S, ANA), { signedIn: true, needsVerification: true, redirect: "/keyclub.html?verificar=1" });
  const { post } = stubWallet();
  const g = await K.grantCredit({ claims: memStore(), post, users: S.users }, { email: ANA, usd: 5, fx: 3.75, key: "t:1", reason: "prueba" });
  assert.equal(g.granted, false);
  const st = V.verifyStatus(u);
  assert.equal(st.needsVerification, true); assert.equal(st.phoneMasked, "+51 ••• ••• 000"); assert.ok(!JSON.stringify(st).includes("900000000"));
  /* The pages honour it. */
  assert.match(cuenta, /r\.body\.needsVerification\) \{ location\.replace\(r\.body\.redirect/);
  assert.match(cuenta, /if \(body\.needsVerification\) \{ location\.href = body\.redirect/);
  const me = readFileSync(join(ROOT, "netlify/functions/auth-me.js"), "utf8");
  assert.match(me, /needsVerification: verify, phoneVerified/);
  /* Not confirmed yet: no code. */
  const S2 = freshStores(); const mail = stubMailer();
  await SU.signup(S2, { name: "Bea", email: "bea@correo.test", phone: "+51 900 000 001", password: "clave-de-prueba" }, { mailer: mail });
  const [cu] = await V.sendCode(S2, "bea@correo.test", { channel: "email" }, { env: {}, senders: { email: capture() } });
  assert.equal(cu, 403);
  /* After the code: login lands in the dashboard. */
  await verifyByEmail(S, ANA);
  const [, lo2] = await LI.login(S, { email: ANA, password: "clave-de-prueba" });
  assert.equal(lo2.redirect, "/cuenta.html"); assert.ok(!lo2.needsVerification);
  /* Accounts from before this step (no verifyRequired) are not asked for it. */
  assert.equal(K.needsVerification({ confirmRequired: true, emailConfirmedAt: "2026-11-01T00:00:00Z" }), false);
});

await check("the greeting, word for word, on the door's arrival and the dashboard (both skins share it); no «Bienvenido al Key Club», no «su llave», no «Este es», no old headline", () => {
  const H = "Bienvenido al área Key Club", G = "Esto es tu espacio. Sin tu llave, nadie más entra aquí.";
  assert.match(cuenta, new RegExp(`<h1 class="serif" id="welcome">${H}</h1>`));
  assert.match(cuenta, new RegExp(`<p class="greet" id="greet">${G.replace(/\./g, "\\.")}</p>`));
  assert.ok(cuenta.includes(`$('welcome').textContent = '${H}';`) && cuenta.includes(`$('greet').textContent = '${G}';`), "the script does not set the exact greeting");
  assert.match(door, new RegExp(`<h2 class="serif verified-h" id="arrivedTitle">${H}</h2>`));
  assert.match(door, new RegExp(`<p id="arrivedGreet">${G.replace(/\./g, "\\.")}</p>`));
  const served = [...SERVED_HTML.map((f) => readFileSync(join(ROOT, f), "utf8")), bundle,
    ...readdirSync(join(ROOT, "netlify/functions")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(ROOT, "netlify/functions", f), "utf8")),
    ...readdirSync(join(ROOT, "assets/js")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(ROOT, "assets/js", f), "utf8"))].join("\n");
  const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
  for (const [bad, re] of [["Bienvenido al Key Club", /Bienvenid[oa] al Key Club/], ["su llave", /\bsu llave\b/i], ["Este es tu espacio", /Este es tu espacio/], ["Ya eres Key Club", /Ya eres Key Club/], ["Próximas " + "ventas", new RegExp("Pr[oó]ximas " + "ventas", "i")]]) {
    assert.ok(!re.test(served), `«${bad}» is still served`);
  }
  /* The old section name is gone from the tests too. */
  assert.ok(!new RegExp("Pr[oó]ximas " + "ventas", "i").test(self), "the old section name is still in the tests");
});

await check("«Próximas ofertas de temporada»: the heading, the honest empty state, no invented sale or date", () => {
  assert.match(cuenta, /<section class="block" id="anticipadas"><h2>Próximas ofertas de temporada<\/h2>/);
  assert.ok(cuenta.includes("Por ahora no hay ofertas de temporada confirmadas. Cuando una tienda confirme una, la verás aquí 24 horas antes que todos."));
  const cfg = JSON.parse(readFileSync(join(ROOT, "assets/keyclub/early-access.json"), "utf8"));
  assert.deepEqual(cfg.sales, []);
  /* Danny's honesty rule: no WhatsApp alert is promised on the dashboard. */
  assert.ok(!/alertas?[^<]{0,60}WhatsApp/i.test(textOf(cuenta)), "the dashboard promises WhatsApp alerts");
});

await check("the code email: the real template, the code, 10 minutes, Spanish, no emoji", () => {
  const m = E.keyClubCodeEmail({ to: ANA, name: "Ana Prueba", code: "123456" });
  assert.equal(m.to, ANA); assert.match(m.subject, /123456/); assert.match(m.text, /Hola Ana,/); assert.match(m.text, /123456/); assert.match(m.text, /10 minutos/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(m.text + m.html + m.subject));
});

console.log("\n  Próximas ofertas de temporada");

const EA = { sales: [{ id: "venta-prueba", title: "Venta de prueba", unlockAt: "2026-11-10T05:00:00Z", items: [{ id: "abc123", title: "Fixture Bag", store: "fixture", usd: 10, image: "https://img.test/a.jpg" }] }] };
const BEFORE = Date.parse("2026-11-05T00:00:00Z"), AFTER = Date.parse("2026-11-11T00:00:00Z");
const ITEMS = [{ id: "abc123", title: "Fixture Bag" }, { id: "zzz", title: "Otro" }];
await check("before unlockAt a flagged item is hidden publicly and live for members; after it, public too", () => {
  assert.deepEqual(K.visibleItems(ITEMS, EA, { now: BEFORE }).map((i) => i.id), ["zzz"]);
  assert.deepEqual(K.visibleItems(ITEMS, EA, { member: true, now: BEFORE }).map((i) => i.id), ["abc123", "zzz"]);
  assert.deepEqual(K.visibleItems(ITEMS, EA, { now: AFTER }).map((i) => i.id), ["abc123", "zzz"]);
  assert.equal(K.activeEarlySales(EA, BEFORE).length, 1); assert.equal(K.activeEarlySales(EA, AFTER).length, 0);
});

await check("the browser helper (assets/js/early-access.js) applies the same rule; ofertas cards consult it; the shipped config invents no sale", () => {
  const ctx = { window: {}, document: { querySelectorAll: () => [] }, fetch: () => Promise.resolve({ ok: false }), Date };
  ctx.window.__ariaEarlyAccessNoAuto = true;
  vm.runInNewContext(readFileSync(join(ROOT, "assets/js/early-access.js"), "utf8"), ctx);
  const api = ctx.window.ariaEarlyAccess;
  assert.deepEqual(Object.keys(api.lockedIds(EA, BEFORE)), [...K.lockedIds(EA, BEFORE)]);
  assert.deepEqual(Object.keys(api.lockedIds(EA, AFTER)), []);
  assert.match(readFileSync(join(ROOT, "ofertas.html"), "utf8"), /if \(window\.ariaEarlyAccess && window\.ariaEarlyAccess\.isLocked\(c\.id\)\) return '';/);
  const shipped = JSON.parse(readFileSync(join(ROOT, "assets/keyclub/early-access.json"), "utf8"));
  assert.deepEqual(shipped.sales, [], "an early-access sale was invented");
});

console.log("\n  Credits (the FINAL rules)");

const BUYER = "compradora@correo.test", FRIEND = "amiga@correo.test", GUEST = "invitada@correo.test";
const JOINED = Date.parse("2026-11-01T00:00:00Z");
const DAY = 864e5;
function creditFixture() {
  const users = memStore({
    [BUYER]: { email: BUYER, name: "Compradora", confirmRequired: true, emailConfirmedAt: "2026-11-01T00:00:00Z", referredBy: FRIEND, memberNumber: 2 },
    [FRIEND]: { email: FRIEND, name: "Amiga", confirmRequired: true, emailConfirmedAt: "2026-10-30T00:00:00Z", memberNumber: 1 },
  });
  return { users, claims: memStore(), ...stubWallet() };
}
/* `usd` is merchandise; tax and freight ride on the order (and on lines that are not products) and never count. */
const order = (id, usd, extra = {}) => ({ orderId: id, buyerEmail: BUYER, paymentStatus: "paid", fxRateUsed: 3.75,
  items: [{ title: "x", priceUsd: usd, qty: 1 }], taxUsd: 40, freightUsd: 30, totalUsd: usd + 70, ...extra });
const perks = (F, email = BUYER) => ((F.w.get(email) || { txns: [] }).txns).filter((t) => /^Key Club: compra de \$100\+/.test(t.reason));

await check("birthday: US$5 once a year on her day in Lima (29 Feb counts on 28 Feb), only confirmed members, none without a rate", async () => {
  assert.equal(K.BIRTHDAY_CREDIT_USD, 5);
  const F = { users: memStore({
    [BUYER]: { email: BUYER, birthday: "1994-11-02", confirmRequired: true, emailConfirmedAt: "2026-01-01T00:00:00Z" },
    [FRIEND]: { email: FRIEND, birthday: "--11-02", confirmRequired: true, emailConfirmedAt: null },
    "bisiesta@correo.test": { email: "bisiesta@correo.test", birthday: "2000-02-29" },
  }), claims: memStore(), ...stubWallet() };
  const nov2Lima = Date.parse("2026-11-02T20:00:00Z");
  let t = await K.runBirthdayCredits(F, { now: nov2Lima, fx: 3.75 });
  assert.equal(t.credited, 1);
  assert.equal(F.w.get(BUYER).txns[0].credits, 5); assert.equal(F.w.get(BUYER).txns[0].amountPen, 18.75);
  t = await K.runBirthdayCredits(F, { now: nov2Lima + 3600e3, fx: 3.75 });
  assert.equal(t.credited, 0, "paid twice in a day");
  assert.equal(F.w.get(FRIEND), undefined, "an unconfirmed account got a birthday credit");
  assert.equal(K.limaDate(Date.parse("2026-11-03T03:00:00Z")), "2026-11-02", "Lima's date");
  t = await K.runBirthdayCredits(F, { now: Date.parse("2027-02-28T15:00:00Z"), fx: 3.75 });
  assert.equal(t.credited, 1, "29 February not honoured on 28 February");
  const N = { users: memStore({ [BUYER]: { email: BUYER, birthday: "1994-11-02" } }), claims: memStore(), ...stubWallet() };
  assert.equal((await K.runBirthdayCredits(N, { now: nov2Lima, fx: null })).credited, 0);
  assert.equal(K.normalizeBirthday("2030-01-01", nov2Lima), null, "a future birthday was accepted");
  assert.equal(K.normalizeBirthday("1990-02-30"), null);
});

await check("spend perk, first 60 days: EVERY paid order of US$100+ merchandise earns a flat US$5 (two orders -> two; US$200 -> US$5; US$99.99 -> nothing; tax and freight never count); a retried webhook pays nothing twice", async () => {
  const F = creditFixture();
  const at = (d) => ({ now: JOINED + d * DAY });
  let r = await K.onOrderPaid(F, order("ARIA-1", 100), at(3));
  assert.equal(r.perk.granted, true); assert.equal(r.perk.phase, "intro");
  await K.onOrderPaid(F, order("ARIA-2", 120), at(4));
  assert.equal(perks(F).length, 2, "two US$100+ orders in the first 60 days must earn two");
  await K.onOrderPaid(F, order("ARIA-3", 200), at(5));
  const p3 = perks(F).filter((t) => t.orderId === "ARIA-3");
  assert.equal(p3.length, 1); assert.equal(p3[0].credits, 5, "a US$200 order is US$5, not US$10"); assert.equal(p3[0].amountPen, 18.75); assert.equal(p3[0].fxRate, 3.75);
  assert.equal(p3[0].reason, "Key Club: compra de $100+ — primeros 60 días");
  r = await K.onOrderPaid(F, order("ARIA-4", 99.99), at(6));
  assert.equal(r.perk, null, "US$99.99 earned a perk");
  r = await K.onOrderPaid(F, order("ARIA-5", 90, { taxUsd: 25, freightUsd: 40, totalUsd: 155 }), at(7));
  assert.equal(r.perk, null, "tax and freight were counted toward US$100");
  await K.onOrderPaid(F, order("ARIA-6", 60, { items: [{ title: "a", priceUsd: 30, qty: 2 }, { title: "b", priceUsd: 40, qty: 1 }] }), at(8));
  assert.equal(perks(F).filter((t) => t.orderId === "ARIA-6").length, 1, "the subtotal is price x qty over every product line");
  await K.onOrderPaid(F, order("ARIA-3", 200), at(5)); // retried webhook
  assert.equal(perks(F).length, 4);
  r = await K.onOrderPaid(F, order("ARIA-7", 150), at(59.9));
  assert.equal(r.perk.phase, "intro", "day 59 is still the first 60 days");
  assert.equal(perks(F).length, 5, "no frequency cap in the first 60 days");
  assert.ok(!(await K.onOrderPaid(F, order("ARIA-8", 150), at(2))).firstHundred, "the one-time first-US$100 credit is gone");
  assert.equal(K.FIRST_HUNDRED_CREDIT_USD, undefined);
});

await check("spend perk, after day 60: only the FIRST US$100+ order of each Lima calendar month earns US$5; a second one that month earns nothing; the next month earns again", async () => {
  const F = creditFixture();
  const day61 = JOINED + 61 * DAY; // 2027-01-01 (Lima's 31 Dec 2026)
  const jan5 = Date.parse("2027-01-05T15:00:00Z"), jan20 = Date.parse("2027-01-20T15:00:00Z"), feb2 = Date.parse("2027-02-02T15:00:00Z");
  let r = await K.onOrderPaid(F, order("ARIA-10", 80), { now: jan5 });
  assert.equal(r.perk, null, "an order under US$100 used up the month");
  r = await K.onOrderPaid(F, order("ARIA-11", 130), { now: jan5 });
  assert.equal(r.perk.granted, true); assert.equal(r.perk.phase, "monthly");
  assert.equal(perks(F)[0].reason, "Key Club: compra de $100+ — beneficio mensual");
  r = await K.onOrderPaid(F, order("ARIA-12", 300), { now: jan20 });
  assert.equal(r.perk.granted, false, "a second US$100+ order in the same month earned");
  r = await K.onOrderPaid(F, order("ARIA-13", 100), { now: feb2 });
  assert.equal(r.perk.granted, true, "the next month did not earn");
  assert.equal(perks(F).length, 2);
  /* The month is Lima's: 01:00 UTC on 1 Jan is still 31 Dec in Lima. */
  const G = creditFixture();
  await K.onOrderPaid(G, order("ARIA-20", 100), { now: Date.parse("2027-01-01T01:00:00Z") });
  await K.onOrderPaid(G, order("ARIA-21", 100), { now: Date.parse("2027-01-01T06:00:00Z") });
  assert.equal(perks(G).length, 2, "the calendar month is not Lima's");
  assert.equal(K.spendPerkFor({ email: BUYER, emailConfirmedAt: "2026-11-01T00:00:00Z" }, order("X", 100), day61).key, `perk:${BUYER}:2026-12`);
  assert.equal(K.spendPerkFor({ email: BUYER, emailConfirmedAt: "2026-11-01T00:00:00Z" }, order("X", 100), JOINED + DAY).key, `perk:${BUYER}:X`);
});

await check("referral: US$5 (5 créditos) to the friend on the invitee's FIRST paid purchase, once; not for a guest order, an unconfirmed invitee, or a friend who is not a member", async () => {
  const F = creditFixture();
  await K.onOrderPaid(F, order("ARIA-1", 20));
  const ref = F.w.get(FRIEND).txns.filter((t) => /amiga invitada/.test(t.reason));
  assert.equal(ref.length, 1); assert.equal(ref[0].credits, 5);
  await K.onOrderPaid(F, order("ARIA-1", 20));
  await K.onOrderPaid(F, order("ARIA-9", 20));
  assert.equal(F.w.get(FRIEND).txns.filter((t) => /amiga invitada/.test(t.reason)).length, 1);
  const G = creditFixture();
  await K.onOrderPaid(G, { ...order("ARIA-1", 20), buyerEmail: null, customer: { email: BUYER } });
  assert.equal(G.w.get(FRIEND), undefined, "a guest order paid the referral");
  const H = creditFixture();
  await H.users.setJSON(BUYER, { ...(await H.users.get(BUYER, { type: "json" })), emailConfirmedAt: null });
  await K.onOrderPaid(H, order("ARIA-1", 20));
  assert.equal(H.w.get(FRIEND), undefined, "an unconfirmed invitee paid the referral");
  const J = creditFixture();
  await J.users.setJSON(FRIEND, { ...(await J.users.get(FRIEND, { type: "json" })), emailConfirmedAt: null });
  const rj = await K.onOrderPaid(J, order("ARIA-1", 20));
  assert.equal(J.w.get(FRIEND), undefined, "a referrer who is not a confirmed member was credited");
  assert.equal(rj.referral.why, "no es miembro");
  assert.equal(await K.resolveReferrer(memStore({ "ref:ABCDEFG": { email: FRIEND } }), "abcdefg", FRIEND), null, "a member can invite herself");
});

await check("members only: a non-member gets NO credit of any kind -- grantCredit refuses guests, unconfirmed and unknown accounts, and a caller without the account store; guest orders and unconfirmed buyers earn no perk", async () => {
  const F = creditFixture();
  await F.users.setJSON(GUEST, { email: GUEST, confirmRequired: true, emailConfirmedAt: null, birthday: "1990-11-02" });
  for (const email of [GUEST, "nadie@correo.test"]) {
    const r = await K.grantCredit(F, { email, usd: 5, fx: 3.75, reason: "prueba", key: "t:" + email });
    assert.deepEqual(r, { granted: false, why: "no es miembro" }, email);
  }
  assert.deepEqual(await K.grantCredit({ claims: F.claims, post: F.post }, { email: BUYER, usd: 5, fx: 3.75, reason: "prueba", key: "t:nousers" }), { granted: false, why: "no es miembro" });
  assert.equal(F.claims.m.size, 0, "a refused grant left a claim behind");
  /* a guest order (no session) of US$300 */
  let r = await K.onOrderPaid(F, { ...order("ARIA-G1", 300), buyerEmail: null, customer: { email: GUEST } }, { now: JOINED + DAY });
  assert.deepEqual(r, { perk: null, referral: null });
  /* an unconfirmed account's order */
  r = await K.onOrderPaid(F, { ...order("ARIA-G2", 300), buyerEmail: GUEST }, { now: JOINED + DAY });
  assert.deepEqual(r, { perk: null, referral: null });
  /* birthday for an unconfirmed account */
  assert.equal((await K.runBirthdayCredits(F, { now: Date.parse("2026-11-02T20:00:00Z"), fx: 3.75 })).credited, 0);
  assert.equal(F.w.get(GUEST), undefined, "a non-member got a credit");
  /* overweight: offered for a member's order only */
  const o = { orderId: "ARIA-W", buyerEmail: BUYER, weightEstimatedKg: 3.4, actuals: { pesoRealKg: 2 }, fxRateUsed: 3.75 };
  const due = K.weightCreditDueFor(o, await F.users.get(BUYER, { type: "json" }));
  assert.equal(due.creditUsd, 18.2); assert.equal(due.creditPen, 68.25); assert.equal(due.buyerEmail, BUYER);
  assert.equal(K.weightCreditDueFor({ ...o, buyerEmail: null, customer: { email: GUEST } }, null), null, "a guest order was offered the overweight credit");
  assert.equal(K.weightCreditDueFor({ ...o, buyerEmail: GUEST }, await F.users.get(GUEST, { type: "json" })), null, "an unconfirmed buyer was offered the overweight credit");
  assert.match(readFileSync(join(ROOT, "netlify/functions/admin-orders-update.js"), "utf8"), /weightCreditDueFor\(order, buyer\)/);
});

await check("overweight: the exact difference, kilos under the estimate x US$13 (100 g = US$1.30, medio kilo = US$6.50), never negative; the copy states the mechanism, never a fixed amount", async () => {
  assert.equal(K.overweightCreditUsd(3.4, 2), 18.2);
  assert.equal(K.overweightCreditUsd(2.1, 2), 1.3);
  assert.equal(K.overweightCreditUsd(2.5, 2), 6.5);
  assert.equal(K.overweightCreditUsd(2, 2.5), 0);
  assert.equal(K.overweightCreditUsd(0, 1), 0);
  const line = K.EARN_WAYS[0].replace(/\$13 por kilo/, "").replace(/100 g = \$1\.30/, "");
  assert.ok(!/\$\s?\d/.test(line), "a flat amount on the overweight rule: " + K.EARN_WAYS[0]);
});

await check("copy: «$5 por compra de $100 o más», never «por cada $100»; 5 créditos and $5 agree; no page implies a guest earns credits", () => {
  const all = [...SERVED_HTML.map((f) => textOf(readFileSync(join(ROOT, f), "utf8"))), K.EARN_WAYS.join(" "), stripComments(cuenta)].join(" ");
  assert.ok(!/por cada \$\s?100/i.test(all));
  assert.match(K.EARN_WAYS[1], /\$5 por compra de \$100 o más/);
  assert.match(cuenta, /te llegan \$5 \(5 créditos\)/);
  assert.ok(!/invitad[oa]s? (también )?(gana|suma|recibe)n? cr[eé]ditos/i.test(all), "copy implies guests earn credits");
  const alert = /<div id="kcGuestAlert"[\s\S]*?<\/div>/.exec(checkout)[0];
  assert.match(textOf(alert), /Podrías estar ganando créditos Aria/);
  assert.match(textOf(alert), /El peso casi siempre se sobreestima al cotizar — y los miembros Aria Key Club reciben esa diferencia de vuelta en créditos\. Únete ahora y llévate eso, más \$5 en pedidos de \$100 o más durante tus primeros 60 días, y más beneficios\./);
  assert.match(alert, /<a id="kcGuestAlertCta" href="\/keyclub\.html"[^>]*>Unirme al Key Club<\/a>/);
  assert.ok(!/retroactiv|pedidos anteriores|este pedido también/i.test(textOf(alert)), "the alert promises retroactive credit");
});

/* ================== the browser at 390 px ================== */
let chromium = null;
try { ({ chromium } = await import("playwright")); }
catch { try { ({ chromium } = await import("/opt/node-tools/node_modules/playwright/index.mjs")); } catch { chromium = null; } }
if (!chromium) {
  console.log("  (browser checks skipped: no Playwright)");
} else {
  const jpegjs = (await import("jpeg-js")).default;
  const SHOTS = process.env.KEYCLUB_SHOTS || (existsSync("/tmp/claude-0/-home-user-ARIA/f11e2a7f-35c2-5343-8058-84e047a51b05/scratchpad") ? "/tmp/claude-0/-home-user-ARIA/f11e2a7f-35c2-5343-8058-84e047a51b05/scratchpad" : join(ROOT, "reports/screens"));
  mkdirSync(SHOTS, { recursive: true });
  const S = freshStores();
  const mail = stubMailer();
  /* The code by email, stubbed: the real template, captured here. */
  const codes = [];
  const codeMail = async (u, c) => { codes.push({ msg: E.keyClubCodeEmail({ to: u.email, name: u.name, code: c }), code: c }); return { sent: true }; };
  /* Real rules behind every endpoint; only the mail provider is a stub.
     WhatsApp and SMS have no env here: exactly as in production today. */
  const cookieOf = (req) => (/aria_session=([0-9a-f]+)/.exec(req.headers.cookie || "") || [])[1];
  async function emailOf(req) { const sid = cookieOf(req); const s = sid && await S.sessions.get(sid, { type: "json" }); return s ? s.email : null; }
  const setCookie = (sid) => `aria_session=${sid}; Path=/; HttpOnly; SameSite=Lax`;
  async function fn(name, req, body) {
    const b = body ? JSON.parse(body) : {};
    if (name === "exchange-rate") return [200, { compra: 3.72, venta: 3.75 }];
    if (name === "auth-signup") { const [c, o] = await SU.signup(S, b, { mailer: mail, env: { URL: BASE } }); return [c, o]; }
    if (name === "auth-confirm") {
      if (b.resend) return await CF.resend(S, b.email, { mailer: mail, env: { URL: BASE } });
      const [c, o, sid] = await CF.confirm(S, b.token); return [c, o, sid];
    }
    if (name === "auth-login") { const [c, o, sid] = await LI.login(S, b); return [c, o, sid]; }
    if (name === "auth-verify-send") {
      const e = await emailOf(req);
      if (req.method === "GET") { const u = e && await S.users.get(e, { type: "json" }); return [200, u ? V.verifyStatus(u) : { signedIn: false }]; }
      return await V.sendCode(S, e, b, { env: {}, senders: { email: codeMail } });
    }
    if (name === "auth-verify-check") return await V.checkCode(S, await emailOf(req), b);
    if (name === "auth-logout") return [200, { ok: true }];
    if (name === "auth-me") { const e = await emailOf(req); return [200, { email: e }]; }
    if (name === "account") {
      const e = await emailOf(req);
      if (e) await K.ensureMembership(S, e);
      return [200, await A.accountOverview(S, e)];
    }
    if (name === "keyclub-prefs") return await PR.savePrefs(S.users, await emailOf(req), b);
    if (name === "dni-upload") return [200, { token: D.newDocId() }];
    return [200, {}];
  }
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
  const PORT = Number(process.env.KEY_CLUB_PORT || 8977);
  const BASE = `http://127.0.0.1:${PORT}`;
  let earlyConfig = null;
  let TW_CSS = "";
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      try {
        const u = new URL(req.url, BASE);
        const m = /^\/\.netlify\/functions\/([a-z-]+)/.exec(u.pathname);
        if (m) {
          const [code, json, sid] = await fn(m[1], req, body);
          res.writeHead(code, { "Content-Type": "application/json", ...(sid ? { "Set-Cookie": setCookie(sid) } : {}) });
          return res.end(JSON.stringify(json));
        }
        if (u.pathname === "/__tw.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(TW_CSS); }
        if (u.pathname === "/assets/keyclub/early-access.json" && earlyConfig) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(earlyConfig)); }
        let p = join(ROOT, decodeURIComponent(u.pathname.replace(/^\/build\/(?!min\/)/, "/build/min/")));
        if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
        if (!existsSync(p)) { res.writeHead(404); return res.end("nf"); }
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        res.end(readFileSync(p));
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)); }
    });
  });
  await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));
  const EXE = process.env.PLAYWRIGHT_CHROMIUM || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
  /* Remote catalogue photos are stubbed: a flat warm tile, nothing fetched. */
  const tile = (() => { const d = Buffer.alloc(32 * 32 * 4); for (let i = 0; i < d.length; i += 4) { d[i] = 214; d[i + 1] = 200; d[i + 2] = 186; d[i + 3] = 255; } return jpegjs.encode({ data: d, width: 32, height: 32 }, 80).data; })();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  /* checkout.html loads Tailwind from its CDN, unreachable here: the same
     classes are compiled with the repo's own tailwindcss and served instead. */
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const twDir = mkdtempSync(join(tmpdir(), "kc-tw-"));
  writeFileSync(join(twDir, "in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  writeFileSync(join(twDir, "tw.config.cjs"), `module.exports = { content: [${JSON.stringify(join(ROOT, "checkout.html"))}] };`);
  const twRun = spawnSync(join(ROOT, "node_modules/.bin/tailwindcss"), ["-c", join(twDir, "tw.config.cjs"), "-i", join(twDir, "in.css"), "-o", join(twDir, "out.css")], { encoding: "utf8" });
  TW_CSS = twRun.status === 0 ? readFileSync(join(twDir, "out.css"), "utf8") : "";
  const routeAll = (route) => {
    const r = route.request(), url = new URL(r.url());
    if (url.host === `127.0.0.1:${PORT}`) return route.continue();
    if (url.host === "cdn.tailwindcss.com") return route.fulfill({ status: 200, contentType: "application/javascript", body: `document.write('<link rel="stylesheet" href="${BASE}/__tw.css">');` });
    if (r.resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/jpeg", body: tile });
    return route.abort();
  };
  await context.route("**/*", routeAll);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  /* Nothing pokes past 390 px, except inside a deliberate side-scroller. */
  const overflow = () => page.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll") return true; } return false; };
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
      if ((r.right > W + 1 || r.left < -1) && !scroller(el) && !el.closest("svg")) bad.push(`${el.tagName.toLowerCase()}.${el.className && el.className.baseVal === undefined ? el.className : ""} ${Math.round(r.left)}..${Math.round(r.right)}`);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.children.length === 0 && el.clientWidth > 0 && !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(el.tagName)) bad.push(`squeezed ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}"`);
    }
    return { scrollW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 8) };
  });
  const noOverflow = async (where) => { const o = await overflow(); assert.ok(o.scrollW <= 390 && !o.bad.length, `${where}: scrollWidth ${o.scrollW}; ${o.bad.join(" | ")}`); };

  await check("390 px: the door is one full screen, the key is the brand, no horizontal overflow", async () => {
    await page.goto(BASE + "/keyclub.html", { waitUntil: "domcontentloaded" });
    const hero = await page.$eval(".hero", (el) => el.getBoundingClientRect().height);
    assert.ok(hero >= 840, `hero is ${hero}px, not a full screen`);
    assert.match(await page.textContent(".hero h1"), /Aria es la llave/);
    await noOverflow("door");
    await page.screenshot({ path: join(SHOTS, "keyclub-door.png") });
  });

  await check("390 px: the form fills in, posts to auth-signup, and the screen says «Te enviamos un correo — confírmalo para entrar»", async () => {
    await page.click("#toForm");
    await page.fill("#fName", "Ana Prueba");
    await page.fill("#fEmail", ANA);
    await page.fill("#fPhone", "+51 900 000 000");
    await page.fill("#fBirthday", "1994-03-12");
    await page.fill("#fPass", "clave-de-prueba");
    await page.locator("#unirme").scrollIntoViewIfNeeded();
    await noOverflow("form");
    await page.locator("#unirme").screenshot({ path: join(SHOTS, "keyclub-form.png") });
    await page.click("#joinBtn");
    await page.waitForSelector("#sent:not([hidden])");
    assert.equal((await page.textContent("#sentTitle")).trim(), "Te enviamos un correo — confírmalo para entrar");
    assert.match(await page.textContent("#sentEmail"), /ana\.prueba@correo\.test/);
    assert.equal(mail.sent.length, 1, "no confirmation email was requested");
    assert.equal((await S.users.get(ANA, { type: "json" })).emailConfirmedAt, null);
    await noOverflow("sent");
    await page.screenshot({ path: join(SHOTS, "keyclub-sent.png") });
  });

  await check("unconfirmed, the login page refuses her and offers to resend the email", async () => {
    await page.goto(BASE + "/cuenta.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#signedOut:not([hidden])");
    await page.fill("#loginEmail", ANA); await page.fill("#loginPass", "clave-de-prueba");
    await page.click("#loginForm button[type=submit]");
    await page.waitForSelector("#loginErr:not([hidden])");
    assert.match(await page.textContent("#loginErr"), /Confirma tu correo/);
    assert.ok(await page.isVisible("#resendConfirm"), "no resend button");
    assert.ok(await page.isHidden("#signedIn"), "the dashboard opened without confirmation");
  });

  let domLounge = null;
  await check("390 px: the email link confirms her and lands on the CODE STEP: three channels the same size, WhatsApp highlighted, her phone and email masked", async () => {
    earlyConfig = null;
    const link = /https?:\/\/[^\s]+/.exec(mail.sent[0].msg.text)[0];
    await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" });
    await page.waitForURL(/keyclub\.html\?verificar=1/, { timeout: 15000 });
    await page.waitForSelector("#verify:not([hidden]) .ch[data-channel=whatsapp]:not([disabled])");
    const chs = await page.$$eval("#vChannels .ch", (els) => els.map((b) => { const r = b.getBoundingClientRect(); return { ch: b.dataset.channel, label: b.querySelector("b").textContent, sub: b.querySelector("span").textContent, pref: b.classList.contains("pref"), w: Math.round(r.width), h: Math.round(r.height), visible: r.height > 0, border: getComputedStyle(b).borderTopColor }; }));
    assert.deepEqual(chs.map((c) => [c.ch, c.label]), [["whatsapp", "WhatsApp"], ["sms", "SMS (texto)"], ["email", "Correo"]]);
    assert.ok(chs.every((c) => c.visible), "a channel is hidden");
    assert.deepEqual(chs.map((c) => c.pref), [true, false, false], "WhatsApp is not the highlighted default (or another is)");
    assert.ok(new Set(chs.map((c) => c.w)).size === 1 && new Set(chs.map((c) => c.h)).size === 1, "the three choices are not the same size: " + JSON.stringify(chs));
    assert.notEqual(chs[0].border, chs[1].border, "WhatsApp is not visibly highlighted");
    assert.equal(chs[1].border, chs[2].border, "SMS and correo are not equal");
    assert.equal(chs[0].sub, "+51 ••• ••• 000"); assert.equal(chs[2].sub, "an•••@correo.test");
    const u = await S.users.get(ANA, { type: "json" });
    assert.ok(u.emailConfirmedAt && u.memberNumber === 1 && !u.verifiedAt, "confirmed but not yet verified on the server");
    await noOverflow("verify chooser");
    await page.screenshot({ path: join(SHOTS, "kv-verify-chooser.png") });
  });

  await check("confirmed but unverified: the dashboard address sends her back to the code step, never the dashboard", async () => {
    await page.goto(BASE + "/cuenta.html", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/keyclub\.html\?verificar=1/, { timeout: 15000 });
    await page.waitForSelector("#verify:not([hidden]) .ch[data-channel=whatsapp]:not([disabled])");
  });

  await check("390 px: WhatsApp (not live) says so honestly and offers the email -- nothing sent, no code stored; SMS the same", async () => {
    const before = codes.length;
    await page.click(".ch[data-channel=whatsapp]");
    await page.waitForSelector("#vMsg:not([hidden])");
    assert.equal((await page.textContent("#vMsg")).trim(), "Los códigos por WhatsApp todavía no están activos. Puedes recibir tu código por correo.");
    assert.ok(await page.isVisible("#vOfferEmail"), "the email is not offered");
    assert.equal((await page.textContent("#vOfferEmail")).trim(), "Enviármelo por correo");
    assert.ok(await page.isHidden("#vForm"), "the code form opened as if a code had been sent");
    assert.ok(!/enviamos el código/i.test(await page.textContent("#verify")), "the page says a code was sent");
    assert.equal(codes.length, before); assert.equal(await S.keyclub.get("verify:" + ANA, { type: "json" }), null, "a code was stored for a channel that is not live");
    await noOverflow("verify fallback");
    await page.screenshot({ path: join(SHOTS, "kv-verify-whatsapp-not-live.png") });
    await page.click(".ch[data-channel=sms]");
    await page.waitForFunction(() => /Los códigos por SMS todavía no están activos/.test(document.getElementById("vMsg").textContent));
    assert.equal(codes.length, before);
  });

  await check("390 px: by email the code arrives, a wrong one is refused, the right one opens «Bienvenido al área Key Club» -- verified via email, phone NOT verified", async () => {
    await page.click("#vOfferEmail");
    await page.waitForSelector("#vForm:not([hidden])");
    assert.equal(codes.length, 1);
    assert.match(await page.textContent("#vMsg"), /Te enviamos el código a tu correo \(an•••@correo\.test\)\. Vence en 10 minutos\./);
    assert.ok(await page.isDisabled("#vResend"), "resend is not held for 60 s");
    await page.screenshot({ path: join(SHOTS, "kv-verify-code.png") });
    const right = codes[0].code, wrong = right === "000000" ? "111111" : "000000";
    await page.fill("#vCode", wrong); await page.click("#vBtn");
    await page.waitForSelector("#vErr:not([hidden])");
    assert.match(await page.textContent("#vErr"), /Ese código no es\. Te quedan 4 intentos\./);
    await page.fill("#vCode", right); await page.click("#vBtn");
    await page.waitForSelector("#arrived:not([hidden])");
    assert.equal((await page.textContent("#arrivedTitle")).trim(), "Bienvenido al área Key Club");
    assert.equal((await page.textContent("#arrivedGreet")).trim(), "Esto es tu espacio. Sin tu llave, nadie más entra aquí.");
    const u = await S.users.get(ANA, { type: "json" });
    assert.ok(u.verifiedAt); assert.equal(u.verifiedVia, "email"); assert.equal(u.phoneVerified, false);
    await noOverflow("arrived");
    await page.screenshot({ path: join(SHOTS, "kv-arrived.png") });
  });

  await check("the arrival opens her dashboard: «Bienvenido al área Key Club», the greeting, her card (Fundador), the wallet at S/ 0.00 with the four lines, next steps, member since", async () => {
    await page.click("#arrivedGo");
    await page.waitForURL(/cuenta\.html/, { timeout: 15000 });
    await page.waitForSelector("#signedIn:not([hidden]) #cardBox .mcard");
    assert.equal(new URL(page.url()).search, "", "the bienvenida flag stayed in the address");
    assert.equal((await page.textContent("#welcome")).trim(), "Bienvenido al área Key Club");
    assert.equal((await page.textContent("#greet")).trim(), "Esto es tu espacio. Sin tu llave, nadie más entra aquí.");
    const datos = await page.textContent("#profileBox");
    assert.match(datos, /sin verificar/); assert.match(datos, /Verificar mi celular/);
    assert.equal(await page.getAttribute("#verifyCel a", "href"), "/keyclub.html?verificar=celular");
    const card = await page.textContent("#cardBox");
    assert.match(card, /Ana Prueba/); assert.match(card, /0001/); assert.match(card, /Fundador/); assert.match(card, /Miembro desde/);
    assert.equal((await page.textContent("#walletBox .bal")).trim(), "S/ 0.00");
    const earn = await page.$$eval("#walletBox ol.earn li", (els) => els.map((e) => e.textContent));
    assert.deepEqual(earn, K.EARN_WAYS);
    assert.match(await page.textContent("#siguiente"), /Empezar a comprar[\s\S]*Ir a mi cuenta/);
    assert.ok(/su |Su /.test(await page.textContent("#greet")) === false, "usted form in the greeting");
    const u = await S.users.get(ANA, { type: "json" });
    assert.ok(u.emailConfirmedAt && u.memberNumber === 1, "not activated on the server");
  });

  await check("«Selección de hoy para ti»: a starter rail of real ON-SALE catalogue items (no history yet), each with «Ver más» into that product's store inside Aria (tienda.html?tienda=<key>); «Próximas ofertas de temporada» lists nothing unconfirmed", async () => {
    await page.waitForSelector("#picksBox .pick");
    const picks = await page.$$eval("#picksBox .pick", (els) => els.map((a) => ({ href: a.getAttribute("href"), id: a.dataset.id, more: (a.querySelector(".more") || {}).textContent })));
    assert.ok(picks.length >= 3 && picks.length <= 6, `${picks.length} picks`);
    const rails = JSON.parse(readFileSync(join(ROOT, "assets/ofertas/rails.json"), "utf8"));
    const byId = new Map([...rails.lead, ...(rails.more || [])].map((c) => [c.id, c]));
    for (const p of picks) {
      const c = byId.get(p.id);
      assert.ok(c, "a pick is not from the catalogue: " + p.id);
      assert.ok(c.wasUsd > c.usd, "a pick is not on sale: " + p.id);
      assert.equal(p.href, "/tienda.html?tienda=" + encodeURIComponent(c.store.toLowerCase()), "a pick does not open its store inside Aria");
      assert.equal(p.more, "Ver más");
    }
    assert.match(await page.textContent("#picksBox .quiet"), /Para empezar, una pieza en oferta/);
    assert.equal((await page.textContent("#anticipadas h2")).trim(), "Próximas ofertas de temporada");
    await page.waitForFunction(() => document.getElementById("earlyBox").textContent.trim() === "Por ahora no hay ofertas de temporada confirmadas. Cuando una tienda confirme una, la verás aquí 24 horas antes que todos.");
    assert.ok(!/anticipad/i.test(await page.textContent("#signedIn")), "«Ventas anticipadas» is still on the dashboard");
  });

  await check("both themes: «01 · El Lounge» and «02 · Amanecer» change only the palette (identical DOM), the choice persists on her account, 390 px clean in both", async () => {
    await page.waitForFunction(() => /US\$0\.00 en créditos/.test(document.getElementById("walletUsd").textContent));
    await page.waitForTimeout(300);
    const snap = () => page.evaluate(() => document.getElementById("signedIn").outerHTML.replace(/ aria-checked="(true|false)"/g, "").replace(/ style=""/g, ""));
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.match(await page.evaluate(() => document.documentElement.className), /theme-lounge/);
    domLounge = await snap();
    const bgLounge = await bg();
    await noOverflow("dashboard lounge");
    await page.screenshot({ path: join(SHOTS, "keyclub-dash-lounge.png"), fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal((await page.textContent("#welcome")).trim(), "Bienvenido al área Key Club");
    await page.screenshot({ path: join(SHOTS, "kv-dash-greeting-lounge.png") });
    await page.click('.themes [data-theme="amanecer"]');
    await page.waitForFunction(() => document.documentElement.className === "theme-amanecer");
    await page.waitForTimeout(450); // the background eases over .25s
    for (let i = 0; i < 20 && (await S.users.get(ANA, { type: "json" })).theme !== "amanecer"; i++) await page.waitForTimeout(100);
    assert.equal((await S.users.get(ANA, { type: "json" })).theme, "amanecer", "the theme was not saved on the account");
    const domAmanecer = await snap();
    if (domAmanecer !== domLounge) {
      let i = 0; while (i < domLounge.length && domLounge[i] === domAmanecer[i]) i++;
      assert.fail(`the DOM differs between themes at ${i}: «${domLounge.slice(i - 80, i + 120)}» vs «${domAmanecer.slice(i - 80, i + 120)}»`);
    }
    assert.notEqual(await bg(), bgLounge, "the palette did not change");
    await noOverflow("dashboard amanecer");
    await page.screenshot({ path: join(SHOTS, "keyclub-dash-amanecer.png"), fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal((await page.textContent("#welcome")).trim(), "Bienvenido al área Key Club");
    assert.equal((await page.textContent("#greet")).trim(), "Esto es tu espacio. Sin tu llave, nadie más entra aquí.");
    await page.screenshot({ path: join(SHOTS, "kv-dash-greeting-amanecer.png") });
    /* A new phone: no cache, the account decides. */
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#signedIn:not([hidden]) #cardBox .mcard");
    assert.equal(await page.evaluate(() => document.documentElement.className), "theme-amanecer", "the account's theme did not come back");
    await page.click('.themes [data-theme="lounge"]');
  });

  await check("early access, in the dashboard: a flagged item before its unlock time is live inside for members", async () => {
    earlyConfig = { sales: [{ id: "prueba", title: "Venta de prueba", unlockAt: new Date(Date.now() + 5 * 864e5).toISOString(), items: [{ id: "ea-fixture-1", title: "Fixture Weekender Bag", brand: "Fixture", store: "fixture", usd: 30, wasUsd: 60, image: "https://img.test/x.jpg" }] }] };
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('#earlyBox .pick[data-id="ea-fixture-1"]');
    assert.match(await page.textContent("#earlyBox"), /Solo para miembros hasta el/);
    /* ...and a public page hides it: the helper sweeps the card away. */
    const pub = await context.newPage();
    await pub.goto(BASE + "/keyclub.html", { waitUntil: "domcontentloaded" });
    await pub.evaluate(() => { const a = document.createElement("a"); a.className = "card"; a.dataset.id = "ea-fixture-1"; a.textContent = "x"; document.body.appendChild(a); const b = document.createElement("a"); b.dataset.id = "otro"; document.body.appendChild(b); });
    await pub.addScriptTag({ url: BASE + "/assets/js/early-access.js" });
    await pub.waitForFunction(() => window.ariaEarlyAccess && window.ariaEarlyAccess.ready);
    assert.equal(await pub.$('[data-id="ea-fixture-1"]'), null, "the flagged card is still on the public page");
    assert.ok(await pub.$('[data-id="otro"]'), "an unflagged card was removed");
    await pub.close();
    earlyConfig = null;
  });

  await check("guest alert in checkout: a guest sees «Podrías estar ganando créditos Aria» as an informational card (no form, no overlay, Pagar untouched, the door opens in another tab); a signed-in member never sees it", async () => {
    const CART = [{ retailer: "zumiez", title: "Fixture Graphic Tee", priceUsd: 24, dutiableUsd: 22.43, weightKg: 0.25, weightEstimated: true, qty: 1, image: "" }];
    const open = async (ctx) => {
      const pg = await ctx.newPage();
      await pg.goto(BASE + "/terminos.html", { waitUntil: "domcontentloaded" });
      await pg.evaluate((c) => localStorage.setItem("aria_cart_v1", JSON.stringify(c)), CART);
      await pg.goto(BASE + "/checkout.html", { waitUntil: "domcontentloaded" });
      await pg.waitForFunction(() => document.getElementById("payBtn"));
      return pg;
    };
    /* A guest: a fresh phone, no session. */
    const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await guestCtx.route("**/*", routeAll);
    const g = await open(guestCtx);
    const guestErrors = [];
    g.on("pageerror", (e) => guestErrors.push(String(e.message)));
    await g.waitForSelector("#kcGuestAlert:not([hidden])", { timeout: 10000 });
    const a = await g.evaluate(() => {
      const el = document.getElementById("kcGuestAlert"), cs = getComputedStyle(el);
      const cta = document.getElementById("kcGuestAlertCta");
      return { pos: cs.position, controls: el.querySelectorAll("input,button,select,textarea,form").length, inAside: Boolean(el.closest("aside.gridSummary")),
        target: cta.getAttribute("target"), href: cta.getAttribute("href"), text: el.textContent.replace(/\s+/g, " ").trim(),
        payVisible: Boolean(document.getElementById("payBtnEnd").offsetParent), formVisible: Boolean(document.getElementById("checkoutForm") && document.getElementById("checkoutForm").offsetParent),
        dialogs: document.querySelectorAll('[role="dialog"]:not([hidden]),dialog[open]').length };
    });
    assert.equal(a.pos, "static", "the alert floats over the page");
    assert.equal(a.controls, 0, "the alert asks for something");
    assert.ok(a.inAside, "the alert is not in the order summary");
    assert.equal(a.href, "/keyclub.html"); assert.equal(a.target, "_blank", "the CTA takes her out of her checkout");
    assert.ok(a.payVisible && a.formVisible, "the alert hides the checkout: " + JSON.stringify(a));
    assert.equal(a.dialogs, 0, "a dialog opened");
    assert.match(a.text, /^Podrías estar ganando créditos Aria El peso casi siempre se sobreestima al cotizar/);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(a.text), "emoji in the alert");
    await g.locator("#kcGuestAlert").scrollIntoViewIfNeeded();
    await g.waitForTimeout(200);
    await g.screenshot({ path: join(SHOTS, "keyclub-checkout-guest-alert.png") });
    await g.locator("aside.gridSummary").screenshot({ path: join(SHOTS, "keyclub-checkout-guest-alert-summary.png") });
    await guestCtx.close();
    /* A member: Ana is signed in on this phone. */
    const m = await open(context);
    await m.waitForTimeout(800);
    assert.equal(await m.$eval("#kcGuestAlert", (el) => el.hidden), true, "a signed-in member sees the guest alert");
    await m.close();
  });

  await check("no page errors on the way", () => { assert.deepEqual(errors, []); });
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
