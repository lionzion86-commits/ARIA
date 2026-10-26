/* ==================================================================
   THE OWNED VOICE, BEHIND ITS FLAG (#443 c.6416074857).

   LiveKit transport, Deepgram ears, Aria's brain, Cartesia voice --
   built beside the Realtime voice, which stays live until the owned
   one passes its gates. These hold the parts that can be held without
   the accounts' keys:

     - the worker carries the SAME brain: the instructions, the tools
       and the model the Realtime voice and the chat assistant use, and
       the bundled copy is never older than its sources;
     - its plan is fixed and fails closed (no variant lottery), and the
       session log names the plan without a secret in it;
     - a tool runs in the page and comes back to the model once, a
       failed tool is a sentence she can say, a noisy turn is not
       answered, card markers are never spoken;
     - the token admits one shopper to one fresh room with the agent
       dispatched (verified with LiveKit's own SDK when installed);
     - the endpoint never strands the page: off or unconfigured, it
       says "fallback: realtime";
     - on the page, ?voz=propia routes the tap to the owned voice, the
       agent's requests reach the page's own tool, transcript and noise
       code, the greeting waits for the speaker, and a tap the owned
       voice cannot take goes to the Realtime voice;
     - the gates' scoring: Spanish price numbers, latency percentiles.

     node scripts/test/owned-voice-tests.mjs
   The worker checks need voice-agent's own packages
   (cd voice-agent && npm install); without them they are reported as
   skipped, by name.
   ================================================================== */
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const VA = ROOT + "voice-agent/";
const HAVE_WORKER_DEPS = existsSync(VA + "node_modules/@livekit/agents/package.json");
let passed = 0;
const failures = [], skipped = [];
async function check(name, fn, { needsWorker = false } = {}) {
  if (needsWorker && !HAVE_WORKER_DEPS) { skipped.push(name); console.log("    skip " + name); return; }
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.stack || e.message}`); console.log("    FAIL " + name); }
}

/* ---------------- the brain ---------------- */
await check("the worker's brain is the Realtime voice's and the chat assistant's, and its bundle is current", async () => {
  const { bundleBrain } = await import(VA + "scripts/build-brain.mjs");
  const committed = readFileSync(VA + "src/brain.generated.mjs", "utf8");
  assert.equal(await bundleBrain(), committed, "src/brain.generated.mjs is stale: run node voice-agent/scripts/build-brain.mjs");
  const b = await import(VA + "src/brain.generated.mjs");
  const rv = await import(ROOT + "scripts/lib/realtime-voice.js");
  const cm = await import(ROOT + "netlify/functions/_aria-chat-model.js");
  assert.equal(b.buildRealtimeInstructions(null), rv.buildRealtimeInstructions(null));
  assert.deepEqual(b.REALTIME_TOOLS.map((t) => t.name), rv.REALTIME_TOOLS.map((t) => t.name));
  assert.equal(b.OPENAI_MODEL, cm.OPENAI_MODEL, "not the chat assistant's model");
  assert.equal(b.GROQ_MODEL, cm.GROQ_MODEL);
});

/* ---------------- the plan ---------------- */
await check("the plan fails closed and names what is missing; the log line carries no secret", async () => {
  const { planFromEnv, planSummary } = await import(VA + "src/config.mjs");
  const none = planFromEnv({});
  assert.equal(none.ok, false);
  assert.deepEqual(none.missing, ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "ARIA_VOICE_ID", "OPENAI_API_KEY"]);
  const env = { LIVEKIT_URL: "wss://x", LIVEKIT_API_KEY: "APIkeyX", LIVEKIT_API_SECRET: "sekrit-value", ARIA_VOICE_ID: "voice-uuid", OPENAI_API_KEY: "sk-openai", GROQ_API_KEY: "gsk-groq" };
  const p = planFromEnv(env);
  assert.ok(p.ok);
  assert.equal(p.plan.lane, "quality");
  assert.equal(p.plan.stt.language, "es");
  assert.equal(p.plan.tts.voice, "voice-uuid");
  assert.equal(p.plan.stt.direct, false, "no Deepgram key: LiveKit Inference");
  assert.equal(planFromEnv({ ...env, ARIA_VOICE_LANE: "lean" }).plan.lane, "lean");
  const line = JSON.stringify(planSummary(p.plan));
  for (const v of ["APIkeyX", "sekrit-value", "sk-openai", "gsk-groq", "voice-uuid"]) assert.ok(!line.includes(v), "the log line leaks " + v);
  assert.match(line, /"transcribes":true/);
  assert.match(line, /deepgram\/nova-3:es/);
});

/* ---------------- the page bridge ---------------- */
await check("a tool runs in the page once and comes back as an object; a failure is a sentence; noise is not answered", async () => {
  const pb = await import(VA + "src/page-bridge.mjs");
  const calls = [];
  const rpc = async (m, payload) => { calls.push([m, JSON.parse(payload)]); if (m === pb.RPC.TOOL) return '{"items":[{"id":"v1"}]}'; if (m === pb.RPC.TURN) return JSON.stringify({ speech: JSON.parse(payload).text !== "mm" }); return "{}"; };
  assert.deepEqual(await pb.runPageTool(rpc, "search_products", { query: "zapatillas" }), { items: [{ id: "v1" }] });
  assert.deepEqual(calls[0], [pb.RPC.TOOL, { name: "search_products", arguments: '{"query":"zapatillas"}' }]);
  assert.equal(await pb.runPageTool(async () => { throw new Error("timeout"); }, "search_products", {}), pb.TOOL_FAILED);
  assert.equal(await pb.runPageTool(async () => "not json", "x", {}), pb.TOOL_FAILED);
  assert.deepEqual(await pb.sendTurn(rpc, "user", "mm"), { speech: false });
  assert.deepEqual(await pb.sendTurn(rpc, "user", "busco zapatillas"), { speech: true });
  assert.deepEqual(await pb.sendTurn(async () => { throw new Error("slow page"); }, "user", "hola"), { speech: true }, "a slow page must not mute her");
  assert.equal(pb.stripCardMarkers("Mira estas. [[SHOW: v1, v2]]").trim(), "Mira estas.");
  assert.deepEqual(pb.cleanHistory([{ role: "system", content: "x" }, { role: "user", content: " hola " }, { role: "assistant", content: "" }, null]), [{ role: "user", content: "hola" }]);
});

await check("the agent: her tools run in the page, the answer follows the result, a noisy turn stops her, markers are never spoken", async () => {
  const { voice, initializeLogger } = await import(VA + "node_modules/@livekit/agents/dist/index.js");
  initializeLogger({ pretty: false, level: "fatal" });
  const { createAriaAgent, markerFilter } = await import(VA + "src/agent.mjs");
  const out = { items: [{ id: "v1", title: "Nike Pegasus 41", price_pen: 389 }] };
  const calls = [];
  const rpc = async (m, payload) => { calls.push([m, JSON.parse(payload)]); if (m === "aria.tool") return JSON.stringify(out); if (m === "aria.turn") return JSON.stringify({ speech: JSON.parse(payload).text !== "mm" }); return "{}"; };
  const fake = new voice.testing.FakeLLM([
    { input: "busco zapatillas nike", toolCalls: [{ name: "search_products", args: { query: "zapatillas nike", gender: "hombre" } }] },
    { input: JSON.stringify(out), content: "Tengo las Nike Pegasus 41 a 389 soles." },
  ]);
  const agent = createAriaAgent({ rpc, history: [{ role: "user", content: "hola" }, { role: "assistant", content: "¡Hola! ¿Qué buscas hoy?" }], llmModel: fake });
  const session = new voice.AgentSession({ llm: fake });
  await session.start({ agent });
  const r = await session.run({ userInput: "busco zapatillas nike" }).wait();
  r.expect.nextEvent().isFunctionCall({ name: "search_products" });
  r.expect.nextEvent().isFunctionCallOutput();
  r.expect.nextEvent().isMessage({ role: "assistant" });
  assert.deepEqual(calls.filter((c) => c[0] === "aria.tool"), [["aria.tool", { name: "search_products", arguments: '{"query":"zapatillas nike","gender":"hombre"}' }]]);
  const msg = r.events.find((e) => e.type === "message");
  assert.match(String(msg.item.textContent), /389 soles/);
  /* the page's memory came in ahead of the turn */
  assert.ok(agent.chatCtx.items.some((i) => i.role === "assistant" && /Qué buscas/.test(i.textContent || "")));
  /* the noise filter in front of every spoken turn */
  await assert.rejects(agent.onUserTurnCompleted(null, { textContent: "mm" }), (e) => e instanceof voice.StopResponse);
  await agent.onUserTurnCompleted(null, { textContent: "quiero un perfume" });
  await session.close();
  /* a marker split across chunks is never spoken */
  const said = [];
  const rs = new ReadableStream({ start(c) { for (const x of ["Mira ", "estas. [[SH", "OW: v1, v2", "]] ¿Te gustan?"]) c.enqueue(x); c.close(); } });
  for await (const x of rs.pipeThrough(markerFilter())) said.push(x);
  assert.equal(said.join("").replace(/\s+/g, " ").trim(), "Mira estas. ¿Te gustan?");
}, { needsWorker: true });

/* ---------------- the token and the door ---------------- */
await check("the token admits one shopper to one fresh room with Aria's agent dispatched", async () => {
  const { shopperToken, ROOM_MAX_PARTICIPANTS } = await import(ROOT + "netlify/functions/_livekit-token.js");
  const secret = "s".repeat(40);
  const t = shopperToken({ apiKey: "APIk", apiSecret: secret, agentName: "aria", now: 1_800_000_000 });
  const [h, b, sig] = t.token.split(".");
  assert.equal(createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url"), sig);
  const c = JSON.parse(Buffer.from(b, "base64url"));
  assert.equal(c.iss, "APIk");
  assert.equal(c.video.room, t.room);
  assert.match(t.room, /^aria-/);
  assert.deepEqual(c.roomConfig.agents, [{ agentName: "aria" }]);
  assert.equal(c.roomConfig.maxParticipants, ROOM_MAX_PARTICIPANTS);
  assert.ok(c.exp - c.nbf <= 620);
  assert.notEqual(shopperToken({ apiKey: "a", apiSecret: secret, agentName: "aria" }).room, t.room, "rooms are reused");
});

await check("LiveKit's own SDK accepts the token and rejects a wrong secret", async () => {
  const sdk = await import(VA + "node_modules/livekit-server-sdk/dist/index.js");
  const { shopperToken } = await import(ROOT + "netlify/functions/_livekit-token.js");
  const secret = "z".repeat(40);
  const t = shopperToken({ apiKey: "APIk", apiSecret: secret, agentName: "aria" });
  const c = await new sdk.TokenVerifier("APIk", secret).verify(t.token);
  assert.equal(c.video.roomJoin, true);
  assert.equal(c.roomConfig.agents[0].agentName, "aria");
  await assert.rejects(new sdk.TokenVerifier("APIk", "y".repeat(40)).verify(t.token));
}, { needsWorker: true });

await check("/api/voice-token: off or unconfigured it sends the page to the Realtime voice, by name; configured it mints", async () => {
  const { handler } = await import(ROOT + "netlify/functions/voice-token.js");
  const post = { httpMethod: "POST", body: "{}" };
  const off = await handler(post, { ARIA_VOICE_OWNED: "off", LIVEKIT_URL: "wss://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" });
  assert.equal(off.statusCode, 503);
  assert.equal(JSON.parse(off.body).fallback, "realtime");
  const bare = await handler(post, {});
  assert.equal(JSON.parse(bare.body).fallback, "realtime");
  assert.match(JSON.parse(bare.body).error, /LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET not configured/);
  const ok = await handler(post, { LIVEKIT_URL: "wss://aria.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "secret-value-xyz" });
  const body = JSON.parse(ok.body);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers["Cache-Control"], "no-store");
  assert.equal(body.engine, "owned");
  assert.equal(body.url, "wss://aria.livekit.cloud");
  assert.ok(!ok.body.includes("secret-value-xyz"), "the secret left the server");
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /from = "\/api\/voice-token"\s+to = "\/\.netlify\/functions\/voice-token"/);
  assert.match(toml, /from = "\/voice-agent\/\*"\s+to = "\/404"\s+status = 404/);
});

/* ---------------- the gates' scoring ---------------- */
await check("gate scoring: Spanish price numbers read both ways; percentiles", async () => {
  const { numbersIn, scorePhrase, PHRASES } = await import(VA + "gates/price-phrases.mjs");
  assert.deepEqual(numbersIn("menos de 500 soles"), [500]);
  assert.deepEqual(numbersIn("1.250 soles"), [1250]);
  assert.deepEqual(numbersIn("1,250"), [1250]);
  assert.deepEqual(numbersIn("89,90"), [89.9]);
  assert.deepEqual(numbersIn("2 mil lucas"), [2000]);
  assert.deepEqual(numbersIn("calzo 9 y medio"), [9.5]);
  assert.equal(scorePhrase("quiero menos de 50 soles", [500]).ok, false, "quinientos heard as cincuenta must fail");
  assert.ok(PHRASES.length >= 20);
  for (const p of PHRASES) assert.ok(p.expect.length && /[a-záéíóúñ]/i.test(p.say));
}, {});
await check("gate scoring: the load ladder's step summary", async () => {
  const { summarizeStep, percentile } = await import(VA + "gates/load-ladder.mjs");
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 95), 5);
  const s = summarizeStep(3, [{ joinMs: 1, greetMs: 2, replyMs: 900 }, { joinMs: 1, greetMs: 2, replyMs: 1100 }, { error: "no reply in 20000ms" }]);
  assert.equal(s.failed, 1);
  assert.equal(s.replyMs.p95, 1100);
}, { needsWorker: true });

/* ---------------- the page ---------------- */
const BUNDLE = readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f));
const SRC = readFileSync(ROOT + "build/" + BUNDLE, "utf8");
await check("the bundle: ?voz=propia routes the tap to the owned voice first; the Realtime voice takes any tap it cannot", async () => {
  assert.match(SRC, /function ariaOwnedVoiceWanted\(\)/);
  assert.match(SRC, /if \(q === 'propia'\)\{ localStorage\.setItem\('ariaVoiceOwned', '1'\); return true; \}/);
  const start = SRC.slice(SRC.indexOf("async function startRealtimeVoiceOnce(){"));
  const owned = start.indexOf("if (ariaOwnedVoiceWanted()){"), token = start.indexOf("await ariaWarmRealtimeToken()");
  assert.ok(owned > 0 && owned < token, "the owned voice is not tried before the Realtime token");
  assert.match(SRC, /if \(ariaRT\.owned\) return ariaRT\.owned\.cue\(cue\);/);
  assert.match(SRC, /if \(ariaRT\.owned\)\{ ariaRT\.owned\.text\(text\); return; \}/);
  /* the owned call resets exactly what the Realtime call resets */
  const resets = (txt) => (txt.match(/^  ariaRT\w+ = [^;]+;$/gm) || []).sort();
  const inline = SRC.slice(SRC.indexOf("async function startRealtimeVoiceOnce(){"));
  const block = inline.slice(inline.indexOf("/* Reset per call"), inline.indexOf("ariaRTTranscribes = mint.transcribes"));
  const fn = SRC.slice(SRC.indexOf("function resetRealtimeCallFlags(){"));
  assert.deepEqual(resets(fn.slice(0, fn.indexOf("\n}"))), resets(block), "the two engines reset different call state");
  assert.match(SRC.slice(SRC.indexOf("async function startOwnedVoice(){")), /^[\s\S]{0,800}resetRealtimeCallFlags\(\);/);
  /* her hands are the Realtime voice's */
  const body = SRC.slice(SRC.indexOf("async function ownedVoiceTool("), SRC.indexOf("function ownedVoiceTurn("));
  assert.match(body, /parseToolArguments\(name, rawArgs\)/);
  assert.match(body, /executeRealtimeTool\(name, parsed\.args\)/);
  assert.match(SRC.slice(SRC.indexOf("function ownedVoiceTurn("), SRC.indexOf("function ownedVoiceState(")), /realtimeTranscriptIsNoise\(said\)/);
});

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const FAKE_LK = `(function(){
  window.__lk = { rooms: [], rpcOut: [], disconnected: 0 };
  function Room(){ var self = this; this.handlers = {}; this.listeners = {}; this.state = 'new'; this.remoteParticipants = new Map();
    this.localParticipant = { publishTrack: async function(t){ self.published = t; return {}; }, performRpc: async function(p){ window.__lk.rpcOut.push(p); return '{}'; } };
    window.__lk.rooms.push(this); }
  Room.prototype.registerRpcMethod = function(m, h){ this.handlers[m] = h; };
  Room.prototype.on = function(ev, fn){ (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; };
  Room.prototype.emit = function(ev){ var a = [].slice.call(arguments, 1); (this.listeners[ev] || []).forEach(function(f){ f.apply(null, a); }); };
  Room.prototype.connect = async function(url, token){ var self = this; this.url = url; this.token = token; this.state = 'connected';
    if (!window.__lkNoAgent) setTimeout(function(){ var a = { identity: 'agent-1', isAgent: true }; self.remoteParticipants.set('agent-1', a); self.emit('participantConnected', a); }, 30); };
  Room.prototype.startAudio = async function(){};
  Room.prototype.disconnect = function(){ this.state = 'disconnected'; window.__lk.disconnected++; this.emit('disconnected', 'CLIENT_INITIATED'); };
  window.LivekitClient = { Room: Room, RoomEvent: { ParticipantConnected: 'participantConnected', TrackSubscribed: 'trackSubscribed', ParticipantAttributesChanged: 'participantAttributesChanged', ParticipantDisconnected: 'participantDisconnected', Disconnected: 'disconnected' }, Track: { Source: { Microphone: 'microphone' } } };
})();`;
let tokenMode = "ok";
const hits = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/.netlify/")) hits.push(u.pathname);
  if (u.pathname === "/api/voice-token") {
    if (tokenMode === "ok") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ engine: "owned", url: "wss://test.invalid", token: "t", room: "aria-test" })); }
    else { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "LIVEKIT_URL not configured", fallback: "realtime" })); }
    return;
  }
  if (u.pathname === "/api/realtime-token") { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "realtime off in this test" })); return; }
  if (u.pathname.startsWith("/.netlify/functions/")) { res.writeHead(404); res.end("{}"); return; }
  if (u.pathname === "/assets/vendor/livekit-client-2.22.4.umd.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); res.end(FAKE_LK); return; }
  let p = join(ROOT, decodeURIComponent(u.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"], ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
async function open(q) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await pg.goto(`${BASE}/index.html${q}`, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => typeof startRealtimeVoice === "function" && window.AriaRealtimeTurn, null, { timeout: 20000 });
  return { pg, errs };
}

await check("page, ?voz=propia: the call comes up owned; the agent's requests reach the page's tool, transcript and noise code; the greeting waits for the speaker", async () => {
  tokenMode = "ok"; hits.length = 0;
  const { pg, errs } = await open("?voz=propia");
  assert.equal(await pg.evaluate(() => startRealtimeVoice()), true, "the owned call did not come up");
  const st = await pg.evaluate(() => ({ owned: !!(ariaRT && ariaRT.owned), motor: ariaVoiceDiag().motor, bar: !document.getElementById("assistantCallBar").hidden, published: !!window.__lk.rooms[0].published }));
  assert.deepEqual(st, { owned: true, motor: "propia (LiveKit + Deepgram + Cartesia)", bar: true, published: true });
  assert.ok(!hits.includes("/api/realtime-token"), "the Realtime voice was minted for an owned call");
  const res = await pg.evaluate(async () => {
    const h = window.__lk.rooms[0].handlers;
    const ctxOut = JSON.parse(await h["aria.context"]({ payload: "{}" }));
    const noise = JSON.parse(await h["aria.turn"]({ payload: JSON.stringify({ role: "user", text: "mm" }) }));
    const speech = JSON.parse(await h["aria.turn"]({ payload: JSON.stringify({ role: "user", text: "busco zapatillas nike para hombre" }) }));
    await h["aria.turn"]({ payload: JSON.stringify({ role: "assistant", text: "Claro, te muestro unas opciones." }) });
    const tool = JSON.parse(await h["aria.tool"]({ payload: JSON.stringify({ name: "get_cart_total", arguments: "{}" }) }));
    const bad = JSON.parse(await h["aria.tool"]({ payload: JSON.stringify({ name: "no_such_tool", arguments: "{}" }) }));
    return { ctxOut, noise, speech, tool, bad, hist: ariaChatHistory.slice(-2), spoke: ariaRTSpoke };
  });
  assert.ok(Array.isArray(res.ctxOut.history));
  assert.deepEqual(res.noise, { speech: false }, "noise was let through");
  assert.deepEqual(res.speech, { speech: true });
  assert.deepEqual(res.hist, [{ role: "user", content: "busco zapatillas nike para hombre" }, { role: "assistant", content: "Claro, te muestro unas opciones." }]);
  assert.equal(res.spoke, true);
  assert.ok(res.tool && typeof res.tool === "object" && !res.tool.error, "get_cart_total did not run in the page: " + JSON.stringify(res.tool));
  assert.match(String(res.bad.error), /No existe la herramienta/);
  /* her state paints the call bar */
  await pg.evaluate(() => window.__lk.rooms[0].emit("participantAttributesChanged", { "lk.agent.state": "speaking" }, { identity: "agent-1", isAgent: true }));
  assert.match(await pg.evaluate(() => document.getElementById("assistantCallText").textContent), /Aria está hablando/);
  /* her audio arrives: the agent is told the speaker is ready only once it plays */
  assert.ok(!(await pg.evaluate(() => window.__lk.rpcOut.some((p) => p.method === "aria.ready"))), "ready before any audio played");
  await pg.evaluate(() => {
    const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start();
    window.__lk.rooms[0].emit("trackSubscribed", { kind: "audio", mediaStreamTrack: d.stream.getAudioTracks()[0] }, {}, { identity: "agent-1", isAgent: true });
  });
  await pg.waitForFunction(() => window.__lk.rpcOut.some((p) => p.method === "aria.ready"), null, { timeout: 5000 });
  /* a doctrine cue and a typed line go to her brain */
  await pg.evaluate(() => { cueRealtime("[cue de prueba]"); speakIntoRealtime("y en rojo?"); });
  const sent = await pg.evaluate(() => window.__lk.rpcOut.map((p) => [p.method, p.payload]));
  assert.ok(sent.some(([m, p]) => m === "aria.cue" && /cue de prueba/.test(p)));
  assert.ok(sent.some(([m, p]) => m === "aria.text" && /y en rojo/.test(p)));
  /* hang up: the room is left, nothing is reported as a drop */
  await pg.evaluate(() => stopRealtimeVoice());
  const end = await pg.evaluate(() => ({ live: !!ariaRT, disc: window.__lk.disconnected, failure: ariaRTFailure, bar: document.getElementById("assistantCallBar").hidden }));
  assert.deepEqual(end, { live: false, disc: 1, failure: null, bar: true });
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("page, ?voz=propia with the owned voice unavailable: the same tap goes to the Realtime voice", async () => {
  tokenMode = "off"; hits.length = 0;
  const { pg, errs } = await open("?voz=propia");
  await pg.evaluate(() => startRealtimeVoice());
  assert.deepEqual(hits.filter((h) => /token/.test(h)), ["/api/voice-token", "/api/realtime-token"], "no fallback to the Realtime voice");
  assert.ok(await pg.evaluate(() => ariaRTTape.some((t) => /voz propia no disponible/.test(t))));
  /* the microphone the owned try opened is released */
  assert.equal(await pg.evaluate(() => !!ariaRT), false);
  assert.deepEqual(errs, []);
  /* and without the flag, the owned voice is never asked */
  hits.length = 0;
  await pg.goto(`${BASE}/index.html?voz=vivo`, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => typeof startRealtimeVoice === "function" && window.AriaRealtimeTurn, null, { timeout: 20000 });
  await pg.evaluate(() => startRealtimeVoice());
  assert.ok(!hits.includes("/api/voice-token"), "?voz=vivo still asked for the owned voice");
  await pg.close();
});

await check("page: an agent that never joins hands the call to the Realtime voice", async () => {
  tokenMode = "ok"; hits.length = 0;
  const { pg } = await open("?voz=propia");
  const t0 = Date.now();
  await pg.evaluate(() => { window.__lkNoAgent = true; return startRealtimeVoice(); });
  assert.ok(Date.now() - t0 >= 7500, "gave up on the agent too early");
  assert.ok(hits.includes("/api/realtime-token"), "no fallback after the agent never joined");
  assert.equal(await pg.evaluate(() => window.__lk.disconnected), 1, "the empty room was not left");
  await pg.close();
});

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed${skipped.length ? `, ${skipped.length} skipped (cd voice-agent && npm install): ${skipped.join("; ")}` : ""}\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
