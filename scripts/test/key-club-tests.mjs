/* ==================================================================
   ARIA KEY CLUB -- THE DOOR, THE CONFIRMATION, THE DASHBOARD (#443,
   Danny 2026-11-01/02, c.6569401037 .. c.6569684988).

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
     - first-US$100, referral and birthday credits, each paid once.
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
  assert.match(K.EARN_WAYS[0], /sobrepeso[\s\S]*US\$13 por kg/);
  assert.match(K.EARN_WAYS[1], /US\$5 al llegar a tus primeros US\$100 en compras \(solo la primera vez\)/);
  assert.match(K.EARN_WAYS[2], /5 créditos cuando tu amiga invitada se hace miembro y hace su primera compra/);
  assert.match(K.EARN_WAYS[3], /US\$10 en tu cumpleaños/);
  const t = textOf(door);
  assert.match(t, /Cómo se ganan/);
  assert.match(t, /1 crédito = US\$1/);
  assert.match(t, /Tu DNI queda registrado una sola vez y no lo vuelves a subir\./);
  assert.match(t, /devoluciones vuelven como crédito al instante/);
  assert.match(t, /Los primeros 1,000 miembros entran gratis por un año y quedan como Fundadores para siempre\./);
  assert.match(t, /Gratis durante el lanzamiento/i);
  assert.match(t, /Aria es la llave/);
  assert.ok(!/\b\d+\s*d[ií]as\b/i.test(t.replace(/48 horas/, "")), "a day count is printed on the door");
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

const KILLED = [/5\s?%\s*(de\s+)?(cashback|de vuelta)/i, /cashback/i, /\$5 (de vuelta )?por cada \$100/i, /cr[eé]ditos? con cada compra/i, /cada compra te devuelv/i, /cada compra suma/i, /keyClubCreditPen|KEY_CLUB_RATE/];
await check("no served file carries the killed copy: pages, bundle (source and min), scripts, emails, the account rules", () => {
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

await check("the link confirms: member active (number, invite code), session opened, lands in the dashboard; later logins land there too", async () => {
  const S = freshStores(); const mail = stubMailer();
  await SU.signup(S, { name: "Ana Prueba", email: ANA, password: "clave-de-prueba" }, { mailer: mail });
  const [code, out, sid] = await CF.confirm(S, tokenFrom(mail.sent[0].msg));
  assert.equal(code, 200);
  assert.equal(out.redirect, "/cuenta.html?bienvenida=1");
  assert.ok(sid && (await S.sessions.get(sid, { type: "json" })).email === ANA);
  const u = await S.users.get(ANA, { type: "json" });
  assert.ok(u.emailConfirmedAt && u.memberNumber === 1 && /^[A-Z0-9]{7}$/.test(u.referralCode));
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
  const [code, out] = await SU.signup(S, { name: "Ana", email: ANA, password: "clave-de-prueba" }, { env: {} });
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
  const [code] = await SU.signup(S, { name: "Ana Prueba", email: ANA, password: "clave-de-prueba", dni: { docNumber: "45678912", front, back } }, { mailer: mail });
  assert.equal(code, 200);
  await CF.confirm(S, tokenFrom(mail.sent[0].msg));
  const pack = await D.packFor(S.packs, ANA, "45678912");
  assert.ok(pack && pack.front === front && pack.back === back);
  assert.equal((await S.docs.get(`meta:${front}`, { type: "json" })).retention, "member");
});

console.log("\n  The token");

await check("random, stored only as a hash, single use", async () => {
  const S = freshStores(); const mail = stubMailer();
  await SU.signup(S, { name: "Ana", email: ANA, password: "clave-de-prueba" }, { mailer: mail });
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
  await SU.signup(S, { name: "Ana", email: ANA, password: "clave-de-prueba" }, { mailer: mail, now: t0 });
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
  await SU.signup(S2, { name: "Bea", email: "bea@correo.test", password: "clave-de-prueba" }, { mailer: m2 });
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

console.log("\n  Ventas anticipadas");

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

console.log("\n  Credits");

const BUYER = "compradora@correo.test", FRIEND = "amiga@correo.test";
function creditFixture() {
  const users = memStore({
    [BUYER]: { email: BUYER, name: "Compradora", confirmRequired: true, emailConfirmedAt: "2026-11-01T00:00:00Z", referredBy: FRIEND, memberNumber: 2 },
    [FRIEND]: { email: FRIEND, name: "Amiga", confirmRequired: true, emailConfirmedAt: "2026-10-30T00:00:00Z", memberNumber: 1 },
  });
  return { users, claims: memStore(), ...stubWallet() };
}
const order = (id, usd) => ({ orderId: id, buyerEmail: BUYER, paymentStatus: "paid", fxRateUsed: 3.75, items: [{ title: "x", priceUsd: usd, qty: 1 }] });

await check("first US$100: US$5 once, when her purchases first reach US$100 (posted in soles at the order's rate), never again", async () => {
  const F = creditFixture();
  let r = await K.onOrderPaid(F, order("ARIA-1", 60));
  assert.equal(r.firstHundred, null);
  r = await K.onOrderPaid(F, order("ARIA-2", 45));
  assert.equal(r.firstHundred.granted, true);
  const tx = F.w.get(BUYER).txns.find((t) => /primeros US\$100/.test(t.reason));
  assert.equal(tx.credits, 5); assert.equal(tx.amountPen, 18.75); assert.equal(tx.fxRate, 3.75);
  await K.onOrderPaid(F, order("ARIA-2", 45)); // a retried webhook
  await K.onOrderPaid(F, order("ARIA-3", 200));
  assert.equal(F.w.get(BUYER).txns.filter((t) => /primeros US\$100/.test(t.reason)).length, 1);
  assert.equal((await F.users.get(BUYER, { type: "json" })).keyClub.spentUsd, 305, "a retried order was counted twice");
});

await check("referral: 5 créditos to the friend on the invitee's FIRST paid purchase, once; not for a guest order or an unconfirmed invitee", async () => {
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
  assert.equal(await K.resolveReferrer(memStore({ "ref:ABCDEFG": { email: FRIEND } }), "abcdefg", FRIEND), null, "a member can invite herself");
});

await check("birthday: US$10 once a year on her day in Lima (29 Feb counts on 28 Feb), only confirmed members, none without a rate", async () => {
  const F = { users: memStore({
    [BUYER]: { email: BUYER, birthday: "1994-11-02", confirmRequired: true, emailConfirmedAt: "2026-01-01T00:00:00Z" },
    [FRIEND]: { email: FRIEND, birthday: "--11-02", confirmRequired: true, emailConfirmedAt: null },
    "bisiesta@correo.test": { email: "bisiesta@correo.test", birthday: "2000-02-29" },
  }), claims: memStore(), ...stubWallet() };
  const nov2Lima = Date.parse("2026-11-02T20:00:00Z");
  let t = await K.runBirthdayCredits(F, { now: nov2Lima, fx: 3.75 });
  assert.equal(t.credited, 1);
  assert.equal(F.w.get(BUYER).txns[0].credits, 10); assert.equal(F.w.get(BUYER).txns[0].amountPen, 37.5);
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

await check("overweight: kilos under the estimate x US$13, never negative (recorded for the admin; issuing stays the named admin act)", async () => {
  assert.equal(K.overweightCreditUsd(3.4, 2), 18.2);
  assert.equal(K.overweightCreditUsd(2, 2.5), 0);
  assert.equal(K.overweightCreditUsd(0, 1), 0);
  assert.match(readFileSync(join(ROOT, "netlify/functions/admin-orders-update.js"), "utf8"), /weightCreditDue/);
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
  /* Real rules behind every endpoint; only the mail provider is a stub. */
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
  await context.route("**/*", (route) => {
    const r = route.request(), url = new URL(r.url());
    if (url.host === `127.0.0.1:${PORT}`) return route.continue();
    if (r.resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/jpeg", body: tile });
    return route.abort();
  });
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
  await check("the email link confirms her and lands her INTO the dashboard: «Ya eres Key Club», the greeting, her card (Fundador), the wallet at S/ 0.00 with the four lines, next steps, member since", async () => {
    earlyConfig = null;
    const link = /https?:\/\/[^\s]+/.exec(mail.sent[0].msg.text)[0];
    await page.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" });
    await page.waitForURL(/cuenta\.html/, { timeout: 15000 });
    await page.waitForSelector("#signedIn:not([hidden]) #cardBox .mcard");
    assert.equal(new URL(page.url()).search, "", "the bienvenida flag stayed in the address");
    assert.match(await page.textContent("#welcome"), /^Ya eres Key Club, Ana$/);
    assert.equal((await page.textContent("#greet")).trim(), "Este es tu espacio. Sin tu llave, nadie más entra aquí.");
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

  await check("«Selección de hoy para ti»: a quiet starter rail of real catalogue sale items linking to Aria's own product page; «Ventas anticipadas» says nothing is in early access", async () => {
    await page.waitForSelector("#picksBox .pick");
    const picks = await page.$$eval("#picksBox .pick", (els) => els.map((a) => a.getAttribute("href")));
    assert.ok(picks.length >= 3 && picks.length <= 6, `${picks.length} picks`);
    assert.ok(picks.every((h) => /^\/producto\.html\?producto=/.test(h)), "a pick links off the site: " + picks.join(" "));
    const rails = JSON.parse(readFileSync(join(ROOT, "assets/ofertas/rails.json"), "utf8"));
    const ids = new Set([...rails.lead, ...(rails.more || [])].map((c) => c.id));
    const shown = await page.$$eval("#picksBox .pick", (els) => els.map((a) => a.dataset.id));
    assert.ok(shown.every((id) => ids.has(id)), "a pick is not from the catalogue");
    await page.waitForFunction(() => /no hay ventas anticipadas/.test(document.getElementById("earlyBox").textContent));
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
    /* A new phone: no cache, the account decides. */
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#signedIn:not([hidden]) #cardBox .mcard");
    assert.equal(await page.evaluate(() => document.documentElement.className), "theme-amanecer", "the account's theme did not come back");
    await page.click('.themes [data-theme="lounge"]');
  });

  await check("early access, in the dashboard: a flagged item before its unlock time is live inside for members", async () => {
    earlyConfig = { sales: [{ id: "prueba", title: "Venta anticipada de prueba", unlockAt: new Date(Date.now() + 5 * 864e5).toISOString(), items: [{ id: "ea-fixture-1", title: "Fixture Weekender Bag", brand: "Fixture", store: "fixture", usd: 30, wasUsd: 60, image: "https://img.test/x.jpg" }] }] };
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

  await check("no page errors on the way", () => { assert.deepEqual(errors, []); });
  await browser.close();
  server.close();
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
