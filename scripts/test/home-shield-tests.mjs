#!/usr/bin/env node
/* ==================================================================
   ARIA HOME SHIELD TESTS (#443, Danny 2026-11-05).

     node scripts/test/home-shield-tests.mjs
     SHOT_DIR=/some/dir node scripts/test/home-shield-tests.mjs   (also saves 390px screenshots)

   Two sections, one per builder. Each is self-contained; on a merge keep
   both. The backend section (hs-case-*, hs-pro-*, admin, privacy of the
   feed) belongs to the backend builder.
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${(e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n         ") : e)}`); console.log("    FAIL " + name); }
}

/* ##################################################################
   FRONT-END SECTION: the homeowner page, Aria's conversation (text and
   voice), the case card with consent, caso.html. Owned by the
   home-shield-front builder.
   ################################################################## */
console.log("\n  Home Shield: front end (homeowner page, Aria, caso)");

const FE = {
  prompt: await import("../../netlify/functions/_hs-prompt.js"),
  chat: await import("../../netlify/functions/hs-chat.js"),
  tts: await import("../../netlify/functions/hs-tts.js"),
  stt: await import("../../netlify/functions/hs-stt.js"),
  model: await import("../../netlify/functions/_aria-chat-model.js"),
  voiceLib: await import("../../scripts/lib/realtime-voice.js"),
  assets: await import("../build-home-shield-assets.mjs"),
};
const PAGE = readFileSync(join(ROOT, "home-shield/index.html"), "utf8");
const CASO = readFileSync(join(ROOT, "home-shield/caso.html"), "utf8");
const JS = readFileSync(join(ROOT, "home-shield/hs.js"), "utf8");
const CSS = readFileSync(join(ROOT, "home-shield/hs.css"), "utf8");
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/* hs.js's i18n object, evaluated without a DOM. */
function loadI18n() {
  const a = JS.indexOf("var I18N = "), b = JS.indexOf("window.HS_I18N");
  return new Function(JS.slice(a, b) + "; return I18N;")();
}
const I18N = loadI18n();

const withEnv = async (vars, fn) => {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
};
const jsonRes = (status, obj) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj), headers: new Map([["content-type", "application/json"]]) });

await check("prompt: carries every disclaimer rule, verbatim", () => {
  const p = FE.prompt.buildHsSystemPrompt({ lang: "en" });
  for (const r of FE.prompt.DISCLAIMER_RULES) assert.ok(p.includes(r), "missing rule: " + r);
  assert.match(p, /not legal advice/);
  assert.match(p, /not a licensed attorney, public adjuster, insurance agent or contractor/);
  assert.match(p, /Never promise an outcome/);
  assert.match(p, /Never encourage inflating a claim/);
  assert.match(p, /Never tell the homeowner to sign anything/);
  assert.match(p, /verify every deadline in their own policy/);
  assert.match(p, /ONE question at a time/);
  assert.match(p, /EMERGENCY FIRST/);
  assert.match(p, /shut off the water/);
  assert.match(p, /Reply in the language the homeowner writes in/);
  assert.match(p, /NO personal information/);
});
await check("prompt: Spanish page asks for Spanish; voice turns stay short", () => {
  assert.match(FE.prompt.buildHsSystemPrompt({ lang: "es" }), /Spanish/);
  assert.match(FE.prompt.buildHsSystemPrompt({ lang: "en", voice: true }), /SPOKEN aloud/);
});
await check("prompt: the uploaded policy's review reaches Aria", () => {
  const p = FE.prompt.buildHsSystemPrompt({ policy: { strong: ["Replacement cost on the roof"], weak: ["2% hurricane deductible"], excerpt: "SECTION I" } });
  assert.match(p, /Replacement cost on the roof/);
  assert.match(p, /2% hurricane deductible/);
  assert.match(p, /SECTION I/);
});
await check("scrub: phone, email, street, policy number, name and insurer never reach the summary", () => {
  const s = FE.prompt.scrubPII("Call (305) 555-1212 or ana@correo.test, 123 Palm Beach Blvd, policy number HO3-998877, my name is Ana Lopez, Citizens denied it.", { insurer: "Citizens" });
  assert.ok(!/555|correo|Palm Beach|998877|Ana|Citizens/.test(s), s);
  assert.ok(!FE.prompt.looksLikePII(s));
});
await check("caseDraft: validated to the contract; unknown values dropped, earlier values kept", () => {
  const prev = FE.prompt.validateCaseDraft({ issue: "roof", zip: "33101", trades: ["roofer"], urgency: "soon", summary: "Roof damage after a storm." });
  const d = FE.prompt.validateCaseDraft({ issue: "nonsense", trades: ["roofer", "plumber"], zip: "331", state: "fl", claimStatus: "denied" }, prev);
  assert.equal(d.issue, "roof"); assert.deepEqual(d.trades, ["roofer"]); assert.equal(d.zip, "33101"); assert.equal(d.state, "FL"); assert.equal(d.claimStatus, "denied");
  assert.deepEqual(Object.keys(d).sort(), ["claimStatus", "insurer", "issue", "state", "summary", "trades", "urgency", "zip"]);
});
await check("parse: bare JSON, fenced JSON and plain prose", () => {
  const a = FE.prompt.parseModelReply('{"reply":"Hi","caseDraft":{"issue":"leak_water"}}', null);
  assert.equal(a.reply, "Hi"); assert.equal(a.caseDraft.issue, "leak_water");
  const b = FE.prompt.parseModelReply('```json\n{"reply":"Hola","caseDraft":{"zip":"33133"}}\n```', null);
  assert.equal(b.reply, "Hola"); assert.equal(b.caseDraft.zip, "33133");
  const c = FE.prompt.parseModelReply("Just text.", { issue: "roof" });
  assert.equal(c.reply, "Just text."); assert.equal(c.caseDraft.issue, "roof");
});

await check("hs-chat: same key and model id as the shop's chat; JSON reply + scrubbed draft", async () => {
  let sent = null;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return jsonRes(200, { choices: [{ message: { content: JSON.stringify({ reply: "I'm sorry that happened. What is the ZIP code of the home?", caseDraft: { issue: "denied_claim", trades: ["public_adjuster", "attorney"], zip: "33101", urgency: "soon", summary: "Wind claim denied last month; call me at 305-555-1212.", insurer: "Acme Mutual", claimStatus: "denied" } }) } }] });
  };
  const r = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.chat.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ lang: "en", messages: [{ role: "user", content: "My claim was denied" }] }) }, { fetchImpl }));
  assert.equal(r.statusCode, 200, r.body);
  const j = JSON.parse(r.body);
  assert.equal(sent.url, FE.model.OPENAI_CHAT_URL);
  assert.equal(sent.body.model, FE.model.OPENAI_MODEL);
  assert.equal(sent.auth, "Bearer sk-test");
  assert.deepEqual(sent.body.response_format, { type: "json_object" });
  assert.equal(sent.body.messages[0].role, "system");
  assert.match(j.reply, /ZIP/);
  assert.equal(j.caseDraft.issue, "denied_claim");
  assert.ok(!/555/.test(j.caseDraft.summary), j.caseDraft.summary);
  assert.equal(j.ready, true);
});
await check("hs-chat: retries without JSON mode when the model refuses it; 503 without a key; 400 on a bad turn", async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    calls++;
    const b = JSON.parse(init.body);
    if (b.response_format) return jsonRes(400, { error: { message: "response_format not supported" } });
    return jsonRes(200, { choices: [{ message: { content: '{"reply":"Okay.","caseDraft":{}}' } }] });
  };
  const r = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.chat.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }, { fetchImpl }));
  assert.equal(r.statusCode, 200); assert.equal(calls, 2);
  const n = await withEnv({ OPENAI_API_KEY: undefined }, () => FE.chat.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }, {}));
  assert.equal(n.statusCode, 503);
  const bad = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.chat.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ messages: [{ role: "assistant", content: "hi" }] }) }, {}));
  assert.equal(bad.statusCode, 400);
});

await check("hs-tts: ONE voice (id, model, stability 0.5, similarity 0.75), key server-side", async () => {
  let sent = null;
  const fetchImpl = async (url, init) => { sent = { url, init, body: JSON.parse(init.body) }; return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }; };
  const r = await withEnv({ ELEVENLABS_API_KEY: "xi-test" }, () => FE.tts.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ text: "Hey, I'm Aria." }) }, { fetchImpl }));
  assert.equal(r.statusCode, 200); assert.equal(r.isBase64Encoded, true); assert.equal(r.headers["Content-Type"], "audio/mpeg");
  assert.ok(sent.url.includes("/text-to-speech/9BWtsMINqrJLrRacOk9x"), sent.url);
  assert.equal(sent.body.model_id, "eleven_v3");
  assert.deepEqual(sent.body.voice_settings, { stability: 0.5, similarity_boost: 0.75 });
  assert.equal(sent.init.headers["xi-api-key"], "xi-test");
});
await check("hs-tts: missing key -> clear 503 \"voice not configured\"", async () => {
  const r = await withEnv({ ELEVENLABS_API_KEY: undefined }, () => FE.tts.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ text: "Hi" }) }, {}));
  assert.equal(r.statusCode, 503);
  const j = JSON.parse(r.body);
  assert.equal(j.error, "voice not configured"); assert.equal(j.code, "voice_not_configured");
});
await check("one voice law: forbidden voice ids appear nowhere in Home Shield; no device TTS anywhere", () => {
  const files = ["home-shield/index.html", "home-shield/caso.html", "home-shield/hs.js", "home-shield/hs.css",
    ...readdirSync(join(ROOT, "netlify/functions")).filter((f) => /^(hs-|_hs-)/.test(f)).map((f) => "netlify/functions/" + f)];
  for (const f of files) {
    const s = readFileSync(join(ROOT, f), "utf8");
    assert.ok(!/LkszHYojkmyv6pbg0ZdY|DLsHlh26Ugcm6ELvS0qi/.test(s), "forbidden voice id in " + f);
    assert.ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(s), "device TTS in " + f);
  }
  assert.ok(!/eleven|9BWtsMINqrJLrRacOk9x/i.test(PAGE + JS), "the page must not name the backend voice");
});
await check("hs-stt: transcribes with the repo's key and its existing transcription model", async () => {
  let form = null;
  const fetchImpl = async (url, init) => { form = init.body; return jsonRes(200, { text: " My roof is leaking. " }); };
  const audio = Buffer.alloc(4000, 1).toString("base64");
  const r = await withEnv({ OPENAI_API_KEY: "sk-test" }, () => FE.stt.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ audio, mime: "audio/webm;codecs=opus", lang: "en" }) }, { fetchImpl }));
  assert.equal(r.statusCode, 200); assert.equal(JSON.parse(r.body).text, "My roof is leaking.");
  assert.equal(form.get("model"), FE.voiceLib.TRANSCRIPTION_MODEL);
  assert.equal(form.get("language"), "en");
  const n = await withEnv({ OPENAI_API_KEY: undefined }, () => FE.stt.handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ audio, mime: "audio/webm" }) }, {}));
  assert.equal(n.statusCode, 503);
});

await check("i18n: English and Spanish carry the same keys; every data-i18n exists", () => {
  const en = Object.keys(I18N.en).sort(), es = Object.keys(I18N.es).sort();
  assert.deepEqual(en.filter((k) => !I18N.es[k]), []); assert.deepEqual(es.filter((k) => !I18N.en[k]), []);
  for (const html of [PAGE, CASO]) for (const m of html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)) assert.ok(I18N.en[m[1]], "missing key " + m[1]);
});
await check("i18n: the HTML ships the English copy (works before hs.js runs)", () => {
  const dec = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  for (const m of PAGE.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(dec(m[2]).trim(), I18N.en[m[1]], m[1]);
});
await check("copy: the exact intro, the disclaimer, no emojis", () => {
  assert.equal(I18N.en["intro.line1"], "Hey, I'm Aria. I'm in your corner and I'm always in your corner. I'm your lawyer, your public adjuster, your roofer, all into one.");
  assert.match(I18N.en["intro.line2"], /^Upload your policy — I can dissect it: strong points, weak points, a better option if one exists, and my best recommendation\.$/);
  assert.equal(I18N.en["footer.disclaimer"], "Aria provides general information, not legal advice. Aria is not a licensed attorney, public adjuster, insurance agent or contractor; she connects you with licensed professionals.");
  assert.match(I18N.en["case.consent"], /^I agree to be contacted only by professionals I approve\. Aria Home Shield never sells my information\.$/);
  for (const [n, s] of [["index.html", PAGE], ["caso.html", CASO], ["hs.js", JS], ["hs.css", CSS]]) assert.ok(!EMOJI.test(s), "emoji in " + n);
});
await check("Mountain Test (static): no shop bundle, no catalogue, deferred script, small files", () => {
  for (const s of [PAGE, CASO]) {
    assert.ok(!/\/build\/app-|catalog|tailwind/i.test(s), "shop bundle or catalogue referenced");
    assert.match(s, /<script defer src="\/home-shield\/hs\.js"><\/script>/);
  }
  assert.ok(!/\/build\/|catalog\.json|-catalog/.test(JS));
  assert.ok(Buffer.byteLength(JS) < 90 * 1024, "hs.js " + Buffer.byteLength(JS));
  assert.ok(gzipSync(JS).length < 26 * 1024, "hs.js gz " + gzipSync(JS).length);
  for (const f of readdirSync(join(ROOT, "home-shield/img"))) assert.ok(readFileSync(join(ROOT, "home-shield/img", f)).length < 20 * 1024, f);
});
await check("slots: photos and the badge render only when the file exists (manifest is current)", () => {
  const m = FE.assets.buildManifest(ROOT);
  const stamped = FE.assets.stamp(PAGE, m);
  assert.equal(stamped, PAGE, "run node scripts/build-home-shield-assets.mjs");
  for (const [slot, p] of Object.entries(m.photos)) assert.ok(existsSync(join(ROOT, p.src.slice(1))), slot);
  if (m.badge) assert.ok(existsSync(join(ROOT, m.badge.slice(1))));
  else assert.ok(!existsSync(join(ROOT, "assets/aria-star/shield-badge.webp")) && !existsSync(join(ROOT, "assets/aria-star/shield-badge.png")));
  for (const slot of Object.keys(FE.assets.SLOTS)) assert.ok(PAGE.includes(`data-photo="${slot}"`), "slot " + slot + " missing in the page");
});

/* ------------------------------------------------------------------
   BROWSER: the page at 390 and 1366, served with the real backend
   handlers on an in-memory store and stubbed model / voice / mic.
   ------------------------------------------------------------------ */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available", () => assert.ok(pw, "playwright is not installed"));

function memStore() {
  const m = new Map();
  return {
    _m: m,
    async get(k, o = {}) { if (!m.has(k)) return null; const v = m.get(k); if (o.type === "json") return JSON.parse(typeof v === "string" ? v : Buffer.from(v).toString()); if (o.type === "arrayBuffer") { const b = Buffer.isBuffer(v) ? v : Buffer.from(typeof v === "string" ? v : new Uint8Array(v)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } return typeof v === "string" ? v : Buffer.from(v).toString(); },
    async set(k, v) { m.set(k, typeof v === "string" ? v : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v)); },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list(o = {}) { return { blobs: [...m.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).map((key) => ({ key })) }; },
  };
}
function wav(seconds, toneFrom = -1, toneTo = -1, rate = 16000) {
  const n = Math.round(seconds * rate), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / rate; const v = t >= toneFrom && t < toneTo ? Math.round(9000 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t))) : 0; buf.writeInt16LE(v, 44 + i * 2); }
  return buf;
}

if (pw) {
  const store = await import("../../netlify/functions/_hs-store.js");
  const stores = new Map();
  store.__setStoreFactory((name) => { if (!stores.has(name)) stores.set(name, memStore()); return stores.get(name); });
  store.__setMailer(async () => ({ ok: true }));
  const real = {};
  for (const f of ["hs-case-create", "hs-case-status", "hs-offer-respond", "hs-case-messages", "hs-case-delete", "hs-doc-upload", "hs-policy-review"]) {
    if (existsSync(join(ROOT, "netlify/functions", f + ".js"))) real[f] = (await import(`../../netlify/functions/${f}.js`)).handler;
  }
  /* Per-test stubs for the model, the voice and the ears. */
  const log = [];
  let stub = {};
  const SPEECH = wav(0.35);
  const { createServer } = await import("node:http");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const fn = /^\/\.netlify\/functions\/([a-z0-9-]+)/.exec(u.pathname);
    if (fn) {
      let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      log.push({ fn: fn[1], method: req.method, body, query: Object.fromEntries(u.searchParams) });
      if (stub[fn[1]]) {
        const r = await stub[fn[1]](body, u);
        if (r && r.audio) { res.writeHead(200, { "Content-Type": "audio/wav" }); return res.end(r.audio); }
        res.writeHead(r.status || 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r.json || {}));
      }
      if (fn[1] === "hs-tts") { res.writeHead(200, { "Content-Type": "audio/wav" }); return res.end(SPEECH); }
      const h = real[fn[1]];
      if (!h) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end('{"error":"no such function"}'); }
      const r = await h({ httpMethod: req.method, headers: { "x-nf-client-connection-ip": "127.0.0.1", "content-type": "application/json" }, body: raw, queryStringParameters: Object.fromEntries(u.searchParams) }, {});
      res.writeHead(r.statusCode, r.headers || {}); return res.end(r.isBase64Encoded ? Buffer.from(r.body, "base64") : r.body || "");
    }
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end(""); }
    const type = MIME[extname(f)] || "application/octet-stream";
    let data = readFileSync(f);
    const hdr = { "Content-Type": type };
    if (/text|javascript|json|svg/.test(type)) { data = gzipSync(data); hdr["Content-Encoding"] = "gzip"; }
    res.writeHead(200, hdr); res.end(data);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const tmp = mkdtempSync(join(tmpdir(), "hs-mic-"));
  const micFile = join(tmp, "mic.wav");
  writeFileSync(micFile, wav(8, 0.6, 2.0));
  const browser = await pw.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${micFile}%noloop`] });
  const SHOT = process.env.SHOT_DIR || null;
  const shot = async (page, name, el) => { if (!SHOT) return; if (el) await page.locator(el).first().screenshot({ path: join(SHOT, `hs-${name}.png`) }); else await page.screenshot({ path: join(SHOT, `hs-${name}.png`) }); };
  const ctx = async (w, extra = {}) => {
    const c = await browser.newContext(w === 390 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: ["microphone"], ...extra } : { viewport: { width: 1366, height: 900 }, permissions: ["microphone"], ...extra });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    return c;
  };
  const errorsOf = (page) => { const e = []; page.on("pageerror", (x) => e.push(String(x))); return e; };
  const ttsTexts = () => log.filter((x) => x.fn === "hs-tts").map((x) => x.body && x.body.text);
  const reset = () => { log.length = 0; stub = {}; };

  for (const W of [390, 1366]) {
    await check(`browser ${W}: renders the hero, the doors in order, the rights, the disclaimer; no emojis, no errors`, async () => {
      reset();
      const c = await ctx(W); const page = await c.newPage(); const errs = errorsOf(page);
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      assert.equal(await page.locator("h1").innerText(), "Your home. Your claim. Someone finally on your side.");
      assert.ok(await page.getByRole("button", { name: "Talk to Aria — free" }).first().isVisible());
      assert.ok(await page.getByRole("button", { name: "Upload my policy for a free review" }).isVisible());
      const doors = await page.locator(".hs-door .hs-h3").allInnerTexts();
      assert.deepEqual(doors.map((s) => s.replace(/^\d\s*/, "").trim()), ["Review my policy", "Claim denied", "Home damage", "Pro enrollment"]);
      assert.equal(await page.locator("#doorPro a").getAttribute("href"), "/home-shield/pro?signup=1");
      const txt = await page.locator("body").innerText();
      assert.ok(!EMOJI.test(txt), "emoji rendered");
      assert.match(txt, /mediation program/); assert.match(txt, /not legal advice/);
      assert.equal(await page.locator("[data-photo]:not([hidden])").count(), 0, "no photo slot without a photo");
      assert.equal(await page.locator("[data-badge]:not([hidden])").count(), 0, "no badge without the art");
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollW <= W, "horizontal scroll " + scrollW);
      if (W === 390) {
        await shot(page, "hero");
        await page.locator("#doors").scrollIntoViewIfNeeded(); await shot(page, "doors", "#doors");
        await shot(page, "how", "#how");
      }
      assert.deepEqual(errs, []);
      await c.close();
    });

    await check(`browser ${W}: Español toggle flips everything and is remembered; ?lang= wins`, async () => {
      reset();
      const c = await ctx(W); const page = await c.newPage();
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      await page.click("#hsLang");
      assert.equal(await page.locator("h1").innerText(), I18N.es["hero.title"]);
      assert.equal(await page.locator("html").getAttribute("lang"), "es");
      assert.equal(await page.locator("#hsLang").innerText(), "English");
      assert.match(await page.locator(".hs-disclaimer").innerText(), /no asesoría legal/);
      assert.ok(page.url().includes("lang=es"));
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      assert.equal(await page.locator("h1").innerText(), I18N.es["hero.title"], "choice remembered");
      if (W === 390) await shot(page, "hero-es");
      await page.goto(BASE + "/home-shield/?lang=en", { waitUntil: "load" });
      assert.equal(await page.locator("h1").innerText(), I18N.en["hero.title"]);
      await c.close();
    });
  }

  await check("browser 390: Listen on the intro speaks the intro through hs-tts; again in Español; one voice at a time", async () => {
    reset();
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click('#intro .hs-listen');
    await page.waitForFunction(() => document.querySelector("#intro .hs-listen").classList.contains("is-on") || !document.getElementById("hsAudio").paused, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    assert.ok(ttsTexts().length >= 1, "hs-tts was not called");
    assert.equal(ttsTexts().join(" "), I18N.en["intro.line1"] + " " + I18N.en["intro.line2"]);
    // A second Listen stops the first: one voice at a time.
    await page.click('#how .hs-listen');
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#intro .hs-listen.is-on").count(), 0);
    await page.click('#how .hs-listen'); // stop
    log.length = 0;
    await page.click("#hsLang");
    await page.click('#intro .hs-listen');
    await page.waitForTimeout(600);
    assert.equal(ttsTexts().join(" "), I18N.es["intro.line1"] + " " + I18N.es["intro.line2"]);
    assert.ok(log.filter((x) => x.fn === "hs-tts").every((x) => x.body.lang === "es"));
    assert.deepEqual(errs, []);
    await c.close();
  });

  await check("browser 390: voice not configured -> the real error is shown and the text stays", async () => {
    reset();
    stub["hs-tts"] = () => ({ status: 503, json: { error: "voice not configured", code: "voice_not_configured" } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click('#intro .hs-listen');
    await page.waitForSelector("#intro .hs-listen-err:not([hidden])", { timeout: 4000 });
    assert.match(await page.locator("#intro .hs-listen-err").innerText(), /voice not configured/);
    assert.match(await page.locator("#intro").innerText(), /I'm in your corner/);
    await c.close();
  });

  await check("browser 390: tap Aria -> spoken two-way conversation (greeting, mic, transcript, reply, her voice, mic again)", async () => {
    reset();
    stub["hs-stt"] = (b) => ({ json: { text: b && b.audio && b.audio.length > 100 ? "My roof is leaking after the storm." : "" } });
    stub["hs-chat"] = (b) => ({ json: { reply: "I'm sorry. Is water coming in right now?", caseDraft: { issue: "roof", trades: ["roofer"], zip: null, urgency: "soon", summary: "Roof leak after a storm." }, ready: false } });
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.click(".hs-star-hero");
    await page.waitForSelector("#hsSheet:not([hidden])");
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-u").length >= 1, null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2, null, { timeout: 8000 });
    const stt = log.filter((x) => x.fn === "hs-stt");
    assert.ok(stt.length >= 1 && stt[0].body.audio.length > 100, "mic audio was not sent");
    assert.equal(stt[0].body.lang, "en");
    assert.equal(await page.locator("#hsMsgs .hs-msg-u").first().innerText(), "My roof is leaking after the storm.");
    const chatCall = log.find((x) => x.fn === "hs-chat");
    assert.equal(chatCall.body.voice, true);
    assert.equal(chatCall.body.messages.at(-1).content, "My roof is leaking after the storm.");
    await page.waitForFunction(() => window.HS_CONVO.state === "listening", null, { timeout: 8000 });
    const said = ttsTexts().join(" ");
    assert.ok(said.includes("I'm in your corner") && said.includes("Is water coming in right now?"), said);
    assert.equal(await page.locator(".hs-star-mini").getAttribute("data-state"), "listening", "steady glow while the mic is live");
    await shot(page, "chat-voice");
    await page.click("#hsMic"); // end the conversation
    assert.equal(await page.evaluate(() => window.HS_CONVO.active), false);
    assert.deepEqual(errs, []);
    await c.close();
  });

  await check("browser 390: Español: tap Aria -> greeting and replies in Spanish, mic sent with lang es", async () => {
    reset();
    stub["hs-stt"] = () => ({ json: { text: "Se me está filtrando el techo." } });
    stub["hs-chat"] = (b) => ({ json: { reply: "Lo siento mucho. ¿Está entrando agua ahora mismo?", caseDraft: { issue: "leak_water" }, ready: false } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(BASE + "/home-shield/?lang=es", { waitUntil: "load" });
    await page.click(".hs-star-hero");
    await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2, null, { timeout: 15000 });
    assert.equal(log.find((x) => x.fn === "hs-stt").body.lang, "es");
    assert.equal(log.find((x) => x.fn === "hs-chat").body.lang, "es");
    await page.waitForTimeout(800);
    const said = ttsTexts().join(" ");
    assert.ok(said.includes("Estoy de tu lado") && said.includes("¿Está entrando agua"), said);
    await c.close();
  });

  for (const W of [390, 1366]) {
    await check(`browser ${W}: typed chat -> "Your case" card; consent blocks sending; case-create carries contact, summary carries no PII; caso link`, async () => {
      reset();
      let turn = 0;
      stub["hs-chat"] = () => {
        turn++;
        if (turn === 1) return { json: { reply: "I'm sorry your claim was denied. What is the ZIP code of the home?", caseDraft: { issue: "denied_claim", trades: ["public_adjuster"], urgency: "soon", summary: "Wind claim denied.", zip: null }, ready: false } };
        return { json: { reply: "Thank you. Here is your case. Check it, and send it when you are ready.", caseDraft: { issue: "denied_claim", trades: ["public_adjuster", "attorney"], zip: "33101", state: "FL", urgency: "soon", summary: "Hurricane wind claim on a roof was denied last month. The homeowner has the denial letter and photos.", insurer: "Acme Mutual", claimStatus: "denied" }, ready: true } };
      };
      const c = await ctx(W); const page = await c.newPage(); const errs = errorsOf(page);
      await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
      await page.locator('[data-action="talk"]').first().click();
      await page.waitForSelector("#hsSheet:not([hidden])");
      await page.fill("#hsInput", "My claim was denied.");
      await page.press("#hsInput", "Enter");
      await page.waitForFunction(() => document.querySelectorAll("#hsMsgs .hs-msg-a").length >= 2);
      if (W === 390) await shot(page, "chat");
      await page.fill("#hsInput", "33101");
      await page.press("#hsInput", "Enter");
      await page.waitForSelector("#hsCaseCard");
      const card = page.locator("#hsCaseCard");
      assert.equal(await card.locator("select[name=issue]").inputValue(), "denied_claim");
      assert.equal(await card.locator("input[name=zip]").inputValue(), "33101");
      assert.equal(await card.locator("input[name=trade][value=attorney]").isChecked(), true);
      const consent = card.locator("#hsConsent");
      assert.equal(await consent.isChecked(), false, "consent starts unchecked");
      assert.match(await card.locator(".hs-consent").innerText(), /I agree to be contacted only by professionals I approve\. Aria Home Shield never sells my information\./);
      await card.locator("input[name=cname]").fill("Ana Prueba");
      await card.locator("input[name=phone]").fill("(305) 555-0142");
      await card.locator("input[name=email]").fill("ana@correo.test");
      // The homeowner types PII into the summary: it must not leave the page.
      await card.locator("textarea[name=summary]").fill("Hurricane wind claim denied by Acme Mutual. Call me at 305-555-0142, I live at 120 Coral Way.");
      assert.equal(await page.locator("#hsSendCase").isDisabled(), true, "send is blocked until consent");
      await page.locator("#hsSendCase").click({ force: true });
      await page.waitForTimeout(200);
      assert.equal(log.filter((x) => x.fn === "hs-case-create").length, 0, "case sent without consent");
      if (W === 390) { await page.evaluate(() => { const m = document.getElementById("hsMsgs"); const c = document.getElementById("hsCaseCard"); m.scrollTop = c.offsetTop - m.offsetTop - 8; }); await shot(page, "case-summary"); await page.locator("#hsSendCase").scrollIntoViewIfNeeded(); await shot(page, "case-consent"); }
      await consent.check();
      assert.equal(await page.locator("#hsSendCase").isDisabled(), false);
      await page.locator("#hsSendCase").click();
      await page.waitForSelector("#hsCaseDone", { timeout: 6000 });
      const sent = log.find((x) => x.fn === "hs-case-create").body;
      assert.equal(sent.consent, true);
      assert.deepEqual(sent.contact, { name: "Ana Prueba", phone: "(305) 555-0142", email: "ana@correo.test", preferred: "phone" });
      assert.ok(!/555|Coral|Acme|Ana|correo/.test(sent.caseDraft.summary), sent.caseDraft.summary);
      assert.equal(sent.caseDraft.zip, "33101");
      const link = await page.locator("#hsCaseLink").innerText();
      assert.match(link, /\/home-shield\/caso(\.html)?\?c=c_[0-9a-f]{24}&t=[0-9a-f]{64}$/);
      assert.match(await page.locator("#hsCaseDone").innerText(), /Save this link/);
      if (W === 390) { await page.locator("#hsCaseDone").scrollIntoViewIfNeeded(); await shot(page, "case-sent"); }
      assert.deepEqual(errs, []);
      await c.close();
    });
  }

  /* caso.html, against the real backend handlers on the in-memory store:
     a verified pro's offer lands, the homeowner talks first, messages,
     then shares contact; a second offer is declined. */
  const seedCase = async () => {
    const r = await real["hs-case-create"]({ httpMethod: "POST", headers: { "x-nf-client-connection-ip": "10.0.0." + Math.floor(Math.random() * 200) }, body: JSON.stringify({ caseDraft: { issue: "roof", trades: ["roofer"], zip: "33101", urgency: "soon", summary: "Roof damage after a storm; homeowner has photos." }, contact: { name: "Ana Prueba", phone: "3055550142", email: "ana@correo.test", preferred: "phone" }, consent: true }) }, {});
    assert.equal(r.statusCode, 200, r.body);
    return JSON.parse(r.body);
  };
  const seedOffer = async (caseId, n, msg) => {
    const S = store.openStores({});
    const hex = (s) => (s.repeat(24)).slice(0, 24);
    const pro = { id: "p_" + hex(String(n)), email: `pro${n}@correo.test`, name: n === 1 ? "Luis Prueba" : "Marta Prueba", company: n === 1 ? "Prueba Roofing LLC" : "Prueba Adjusting", trades: ["roofer"], licenseType: "roofing_contractor", licenseNumber: "CCC" + (1330000 + n), licenseState: "FL", phone: "+1305555010" + n, verified: true, createdAt: new Date().toISOString(), serviceZips: ["33101"] };
    await S.pros.setJSON(pro.id, pro);
    const offer = { id: "o_" + hex(String(n + 4)), caseId, proId: pro.id, message: msg, createdAt: new Date(Date.now() + n).toISOString(), status: "pending" };
    await S.offers.setJSON(offer.id, offer);
    const c = await S.cases.get(caseId, { type: "json" });
    c.offers = [...(c.offers || []), offer.id]; c.status = "offered";
    await S.cases.setJSON(caseId, c);
    return { pro, offer };
  };

  await check("browser 390: caso.html: timeline, offers with license; talk first (contact private), message, share contact -> connected; decline", async () => {
    reset();
    const k = await seedCase();
    const c = await ctx(390); const page = await c.newPage(); const errs = errorsOf(page);
    await page.goto(`${BASE}/home-shield/caso.html?c=${k.caseId}&t=${k.token}`, { waitUntil: "load" });
    await page.waitForSelector("#casoTimeline");
    assert.match(await page.locator("#casoBody").innerText(), /No offers yet/);
    await seedOffer(k.caseId, 1, "I inspect storm roofs every week. I can come Thursday and document everything for your claim.");
    await seedOffer(k.caseId, 2, "Happy to help with your roof claim.");
    await page.evaluate(() => window.HS_CASO_REFRESH());
    await page.waitForSelector(".hs-offer");
    assert.equal(await page.locator(".hs-offer").count(), 2);
    const first = page.locator('.hs-offer:has-text("Luis Prueba")');
    assert.match(await first.innerText(), /License: Roofing contractor CCC1330001 FL/);
    assert.ok(!/3055550101|pro1@/.test(await page.locator("#casoBody").innerText()), "pro contact before sharing");
    assert.equal(await first.locator("button").first().innerText(), "Talk first through Aria Home Shield");
    await page.locator(".hs-offer").first().evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 70, behavior: "instant" }));
    await shot(page, "caso-offer");
    // Decline the second.
    await page.locator('.hs-offer:has-text("Marta Prueba") button[data-act=decline]').click();
    await page.waitForSelector('.hs-offer[data-status=declined]');
    // Talk first.
    await first.locator("button[data-act=talk_first]").click();
    await page.waitForSelector('.hs-offer[data-status=accepted_talk_first] form[data-thread]');
    const S = store.openStores({});
    const offerNow = await S.offers.get("o_" + "5".repeat(24), { type: "json" });
    assert.equal(offerNow.status, "accepted_talk_first");
    const caseNow = await S.cases.get(k.caseId, { type: "json" });
    assert.notEqual(caseNow.status, "connected", "talk first must not share contact");
    await page.fill('[data-thread-input]', "Can you come Thursday morning? My number is 305-555-0142.");
    await page.press('[data-thread-input]', "Enter");
    await page.waitForSelector(".hs-tmsg.is-me");
    assert.ok(!/555-0142/.test(await page.locator(".hs-tmsg.is-me").innerText()), "contact scrubbed while talking first");
    // Share my contact (the explicit, separate tap).
    await page.locator('.hs-offer[data-status=accepted_talk_first] button[data-act=share_contact]').click();
    await page.waitForSelector("#casoConnected");
    const conn = await page.locator("#casoConnected").innerText();
    assert.match(conn, /You're connected/); assert.match(conn, /Luis Prueba/); assert.match(conn, /pro1@correo\.test/);
    assert.equal(await page.locator("#casoTimeline li.is-done").count(), 4);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await shot(page, "caso-connected");
    await page.locator(".hs-thread").first().evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 300, behavior: "instant" }));
    await shot(page, "caso-thread");
    assert.deepEqual(errs, []);
    await c.close();
  });

  await check("browser 390: caso.html: delete my case and documents", async () => {
    reset();
    const k = await seedCase();
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(`${BASE}/home-shield/caso.html?c=${k.caseId}&t=${k.token}`, { waitUntil: "load" });
    await page.waitForSelector("#casoDelete");
    await page.click("#casoDelete");
    await page.click("#casoDeleteYes");
    await page.waitForSelector("text=Your case and documents were deleted.");
    assert.equal(log.find((x) => x.fn === "hs-case-delete").body.caseId, k.caseId);
    await c.close();
  });

  await check("browser 390: caso.html with stubbed endpoints: decline posts the action; Spanish labels", async () => {
    reset();
    stub["hs-case-status"] = () => ({ json: { case: { id: "c_x", status: "offered", issue: "leak_water", trades: ["public_adjuster"], area: { label: "Miami, FL" }, summary: "Water leak." }, offers: [{ id: "o_1", status: "pending", message: "Hola", createdAt: "2026-11-05T00:00:00Z", pro: { id: "p_1", name: "Pro Uno", company: "Uno LLC", trades: ["public_adjuster"], licenseType: "public_adjuster", licenseNumber: "W123", licenseState: "FL", verified: true } }] } });
    stub["hs-offer-respond"] = () => ({ json: { offer: { id: "o_1", status: "declined" } } });
    const c = await ctx(390); const page = await c.newPage();
    await page.goto(`${BASE}/home-shield/caso.html?c=c_x&t=tok&lang=es`, { waitUntil: "load" });
    await page.waitForSelector(".hs-offer");
    assert.match(await page.locator(".hs-offer").innerText(), /Hablar primero por Aria Home Shield/);
    await page.click("button[data-act=decline]");
    await page.waitForTimeout(300);
    const r = log.find((x) => x.fn === "hs-offer-respond").body;
    assert.deepEqual([r.offerId, r.action, r.token], ["o_1", "decline", "tok"]);
    await c.close();
  });

  await check("browser 390: weight: first load under 150 KB (fonts excluded), no long tasks, no shop bundle", async () => {
    reset();
    const c = await ctx(390); const page = await c.newPage();
    const urls = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch (e) { /* none */ } });
    await page.goto(BASE + "/home-shield/", { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const bytes = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      let total = nav ? nav.transferSize || nav.encodedBodySize : 0;
      for (const e of performance.getEntriesByType("resource")) if (!/fonts\.(googleapis|gstatic)/.test(e.name)) total += e.transferSize || e.encodedBodySize || 0;
      return total;
    });
    assert.ok(bytes < 150 * 1024, "first load " + bytes + " bytes");
    const long = await page.evaluate(() => window.__long);
    assert.deepEqual(long, [], "long tasks: " + long.join(","));
    assert.ok(!urls.some((u) => /\/build\/|catalog|tailwind|\/assets\/js\//.test(u)), urls.filter((u) => /build|catalog/.test(u)).join(" "));
    console.log(`         first load ${(bytes / 1024).toFixed(1)} KB, ${urls.length} requests`);
    await c.close();
  });

  await browser.close();
  srv.close();
  rmSync(tmp, { recursive: true, force: true });
}
/* ######################## END FRONT-END SECTION ######################## */

console.log(`\n  ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f); process.exit(1); }
