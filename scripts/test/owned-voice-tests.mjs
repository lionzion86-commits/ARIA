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
     - the gates' scoring: Spanish price numbers, latency percentiles;
     - the memory is ours (#443 rider 3): the thread is sealed in the
       token, only the worker reads or writes it, the last 40 lines come
       back on the next call and she greets a returning shopper with
       them, each finished call is kept whole for review with only the
       spoken words, and a dead store never costs the voice.

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

/* ---------------- the memory, in our systems (#443 rider 3) ---------------- */
function memStore() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
  };
}
const SECRET = "secret-value-xyz";

await check("memory: the worker's token is the store's; a wrong secret, an old token or a page's guess is refused", async () => {
  const S = await import(ROOT + "netlify/functions/_voice-thread.js");
  const W = await import(VA + "src/thread-store.mjs");
  const th = S.newThreadId();
  assert.ok(S.isThreadId(th));
  assert.equal(S.verifyWorkerToken(W.workerToken(SECRET, th), SECRET), th, "the worker's token is refused");
  assert.equal(S.verifyWorkerToken(S.workerToken(SECRET, th), SECRET), th);
  assert.equal(S.verifyWorkerToken(W.workerToken("other", th), SECRET), null, "a wrong secret passed");
  assert.equal(S.verifyWorkerToken(W.workerToken(SECRET, th, 1000), SECRET), null, "an expired token passed");
  assert.equal(S.verifyWorkerToken(W.workerToken(SECRET, th, Math.floor(Date.now() / 1000), 3600), SECRET), null, "an hour-long token passed");
  assert.equal(S.verifyWorkerToken(th, SECRET), null, "the bare thread id opened the thread");
  assert.deepEqual(S.threadFor(th), { thread: th, resumed: true });
  for (const junk of ["", "../../etc", "a".repeat(23), null, 42]) assert.equal(S.threadFor(junk).resumed, false, String(junk));
});

await check("memory: /api/voice-thread keeps the last 40 lines and each finished call whole, and only the spoken words", async () => {
  const S = await import(ROOT + "netlify/functions/_voice-thread.js");
  const { handler } = await import(ROOT + "netlify/functions/voice-thread.js");
  const store = memStore(), env = { LIVEKIT_API_SECRET: SECRET };
  const th = S.newThreadId(), other = S.newThreadId();
  const auth = (t) => ({ authorization: "Bearer " + S.workerToken(SECRET, t) });
  const get = (t, as = t) => handler({ httpMethod: "GET", headers: auth(as), queryStringParameters: { thread: t } }, env, store);
  const post = (body, as = body.thread) => handler({ httpMethod: "POST", headers: auth(as), body: JSON.stringify(body) }, env, store);
  assert.equal((await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { thread: th } }, env, store)).statusCode, 401);
  assert.equal((await get(th, other)).statusCode, 403, "one thread's token read another");
  assert.equal((await post({ thread: th, room: "aria-x", lines: [] }, other)).statusCode, 403);
  assert.equal((await handler({ httpMethod: "GET", headers: auth(th), queryStringParameters: { thread: th } }, {}, store)).statusCode, 503);
  for (let i = 0; i < 25; i++) {
    const r = await post({ thread: th, room: "aria-room1", lines: [{ role: "user", text: "línea " + i }, { role: "assistant", text: "respuesta " + i }, { role: "system", text: "x" }] });
    assert.equal(JSON.parse(r.body).added, 2);
  }
  const mem = JSON.parse((await get(th)).body);
  assert.equal(mem.turns.length, S.MEMORY_TURNS);
  assert.equal(mem.turns.at(-1).text, "respuesta 24");
  assert.equal(mem.turns[0].room, "aria-room1");
  const saved = await post({ thread: th, room: "aria-room1", call: {
    memory: "server", plan: { lane: "quality" }, seconds: 42, usd: null, latency: [{ k: "eou", ms: 300 }],
    tools: [{ name: "search_products", ms: 800, failed: false, output: "never kept" }],
    lines: [{ role: "user", text: "hola" }, { role: "assistant", text: "¡Hola!" }],
    recipient: { name: "X", dni: "12345678" }, email: "x@y.z",
  } });
  assert.equal(saved.statusCode, 200);
  const rec = JSON.parse(store.m.get(`corpus/${th}/aria-room1`));
  assert.equal(rec.review, "pending");
  assert.equal(rec.lines.length, 2);
  assert.deepEqual(rec.tools, [{ name: "search_products", ms: 800, failed: false }]);
  assert.ok(!/12345678|x@y\.z|never kept/.test(JSON.stringify(rec)), "the corpus kept more than the words");
  assert.equal(JSON.parse((await get(th)).body).calls, 1);
  assert.equal((await post({ thread: th, room: "../../x", call: {} })).statusCode, 400);
});

await check("memory: /api/voice-token seals this device's thread and the store's address into the token", async () => {
  const S = await import(ROOT + "netlify/functions/_voice-thread.js");
  const { handler } = await import(ROOT + "netlify/functions/voice-token.js");
  const env = { LIVEKIT_URL: "wss://aria.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: SECRET, DEPLOY_PRIME_URL: "https://deploy-preview-501--ariashopperu.netlify.app" };
  const claims = (tok) => JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString());
  const fresh = JSON.parse((await handler({ httpMethod: "POST", body: "{}" }, env)).body);
  assert.ok(S.isThreadId(fresh.thread));
  const meta = JSON.parse(claims(fresh.token).metadata);
  assert.deepEqual(meta, { thread: fresh.thread, memoryUrl: "https://deploy-preview-501--ariashopperu.netlify.app/api/voice-thread" });
  const again = JSON.parse((await handler({ httpMethod: "POST", body: JSON.stringify({ thread: fresh.thread }) }, env)).body);
  assert.equal(again.thread, fresh.thread, "a returning device got a new thread");
  assert.notEqual(again.room, fresh.room, "a returning device reused a room");
  const forged = JSON.parse((await handler({ httpMethod: "POST", body: JSON.stringify({ thread: "x/../../y" }) }, env)).body);
  assert.notEqual(forged.thread, "x/../../y");
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  assert.match(toml, /from = "\/api\/voice-thread"\s+to = "\/\.netlify\/functions\/voice-thread"/);
  const page = readFileSync(ROOT + "assets/js/aria-voice-owned.js", "utf8");
  assert.match(page, /body: JSON\.stringify\(\{ thread: savedThread\(\) \}\)/);
  assert.match(page, /saveThread\(body\.thread\)/);
});

await check("memory: the worker reads the thread, writes every line, saves the call; a dead store never costs the voice", async () => {
  const S = await import(ROOT + "netlify/functions/_voice-thread.js");
  const W = await import(VA + "src/thread-store.mjs");
  const { handler } = await import(ROOT + "netlify/functions/voice-thread.js");
  const store = memStore(), env = { LIVEKIT_API_SECRET: SECRET };
  const th = S.newThreadId();
  const URL0 = "https://deploy-preview-501--ariashopperu.netlify.app/api/voice-thread";
  const fetchImpl = async (url, o) => {
    const u = new URL(url);
    const r = await handler({ httpMethod: o.method, headers: { authorization: o.headers.Authorization }, body: o.body, queryStringParameters: Object.fromEntries(u.searchParams) }, env, store);
    return { ok: r.statusCode < 300, status: r.statusCode, json: async () => JSON.parse(r.body) };
  };
  assert.equal(W.threadFromMetadata(JSON.stringify({ thread: th, memoryUrl: "https://evil.example/steal" })), null);
  assert.equal(W.threadFromMetadata("not json"), null);
  const meta = W.threadFromMetadata(JSON.stringify({ thread: th, memoryUrl: URL0 }));
  const one = W.threadStore({ meta, secret: SECRET, room: "aria-call1", fetchImpl });
  assert.deepEqual(await one.history(), [], "a first call has a memory");
  one.say("assistant", "¡Hola! Soy Aria.");
  one.say("user", "busco zapatillas Nike talla 42");
  one.say("assistant", "Te muestro tres Nike en talla 42.");
  await one.flush();
  /* she hangs up and taps again before the room closes */
  const two = W.threadStore({ meta, secret: SECRET, room: "aria-call2", fetchImpl });
  const hist = await two.history();
  assert.deepEqual(hist.map((h) => h.role), ["assistant", "user", "assistant"]);
  assert.equal(hist[1].content, "busco zapatillas Nike talla 42");
  await one.finish({ memory: "none", plan: { lane: "quality" }, seconds: 30, usd: null, latency: [], tools: [{ name: "search_products", ms: 900 }] });
  assert.equal(JSON.parse(store.m.get(`corpus/${th}/aria-call1`)).lines.length, 3);
  const logs = [];
  const dead = W.threadStore({ meta, secret: SECRET, room: "aria-call3", fetchImpl: async () => { throw new Error("ECONNREFUSED"); }, log: (e) => logs.push(e) });
  assert.deepEqual(await dead.history(), []);
  dead.say("user", "hola");
  await dead.flush();
  await dead.finish({});
  assert.deepEqual(logs, ["memory-read-failed", "memory-write-failed", "corpus-write-failed"]);
  const off = W.threadStore({ meta: null, secret: SECRET, room: "aria-call4", fetchImpl });
  assert.equal(off.enabled, false);
  assert.deepEqual(await off.history(), []);
});

await check("memory: a returning shopper is greeted with the thread, a new one with the welcome", async () => {
  const A = await import(VA + "src/agent.mjs");
  assert.equal(A.greetingFor([]), A.GREETING_INSTRUCTIONS);
  assert.equal(A.greetingFor([{ role: "user", content: "hola" }]), A.RETURN_GREETING_INSTRUCTIONS);
  assert.match(A.RETURN_GREETING_INSTRUCTIONS, /ni inventes nada que no esté en el historial/);
  const src = readFileSync(VA + "src/agent.mjs", "utf8");
  assert.match(src, /if \(ours\.length\) \{ history = ours; memorySource = "server"; \}/, "our store no longer comes first");
  assert.match(src, /const opening = openingFor\(\{ history, facts \}\);/);
  assert.match(src, /await memory\.finish\(/);
}, { needsWorker: true });

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
  await pg.waitForTimeout(500);
  const before = hits.filter((h) => /token/.test(h));
  hits.length = 0;
  await pg.evaluate(() => startRealtimeVoice());
  assert.deepEqual(before, [], "a token was minted before any tap or open");
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

/* ---------------- ear tests 1 and 2 (#443, 2026-10-26) ---------------- */
async function openClocked(q) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));
  await pg.clock.install();
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await pg.goto(`${BASE}/index.html${q}`, { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => typeof startRealtimeVoice === "function" && window.AriaRealtimeTurn, null, { timeout: 20000 });
  return { pg, errs };
}
const agentState = (pg, s) => pg.evaluate((s) => window.__lk.rooms.at(-1).emit("participantAttributesChanged", { "lk.agent.state": s }, { identity: "agent-1", isAgent: true }), s);
const userState = (pg, s) => pg.evaluate((s) => window.__lk.rooms.at(-1).handlers["aria.user"]({ payload: JSON.stringify({ state: s }) }), s);
const userSays = (pg, t) => pg.evaluate((t) => window.__lk.rooms.at(-1).handlers["aria.turn"]({ payload: JSON.stringify({ role: "user", text: t }) }), t);
const herLine = (pg, t) => pg.evaluate((t) => window.__lk.rooms.at(-1).handlers["aria.turn"]({ payload: JSON.stringify({ role: "assistant", text: t }) }), t);
const byeCues = (pg) => pg.evaluate(() => window.__lk.rpcOut.filter((p) => p.method === "aria.cue" && /cerrar por silencio/.test(p.payload)).length);
const live = (pg) => pg.evaluate(() => !!(ariaRT && ariaRT.owned));

await check("ear test 1: a pause-heavy conversation never ends itself -- long answers, a slow search, a long mid-thought pause; a dead line still signs off", async () => {
  tokenMode = "ok";
  const { pg, errs } = await openClocked("?voz=propia");
  /* the tap answers at once */
  const firstFrame = await pg.evaluate(() => { const p = startRealtimeVoice(); const s = document.getElementById("assistantStatus").textContent; window.__p = p; return s; });
  assert.equal(firstFrame, "Conectando con Aria…", "the tap showed nothing");
  await pg.clock.runFor(200);
  assert.equal(await pg.evaluate(() => window.__p), true);
  /* greeting: she speaks for 4s */
  await agentState(pg, "speaking"); await pg.clock.runFor(4000); await herLine(pg, "¡Hola! Soy Aria, tu shopper personal. ¿Qué estás buscando?"); await agentState(pg, "listening");
  /* he answers after 6s, talks for 12s in one breath with a pause in the middle */
  await pg.clock.runFor(6000);
  await userState(pg, "speaking"); await pg.clock.runFor(7000);
  await userState(pg, "listening"); await pg.clock.runFor(2500);   // a mid-thought pause
  await userState(pg, "speaking"); await pg.clock.runFor(5000);
  await userState(pg, "listening"); await userSays(pg, "busco unas zapatillas para correr, algo cómodo para todos los días");
  /* her first search is slow (cold catalogue): 14s thinking, then a 13s answer */
  await agentState(pg, "thinking"); await pg.clock.runFor(14000);
  await agentState(pg, "speaking"); await pg.clock.runFor(13000);
  await herLine(pg, "Te muestro tres opciones muy cómodas para correr."); await agentState(pg, "listening");
  /* he thinks it over for 8s, then a cough (speech with no words) */
  await pg.clock.runFor(8000);
  assert.equal(await byeCues(pg), 0, "she signed off mid-conversation");
  assert.equal(await live(pg), true, "the call ended mid-conversation");
  /* an abandoned line still ends: ten seconds of nothing from either side */
  await pg.clock.runFor(2500);
  assert.equal(await byeCues(pg), 1, "a silent line never signed off");
  await pg.clock.runFor(4500);
  assert.equal(await live(pg), false, "the line stayed open after the goodbye");
  /* ear test 1 addendum, item 2: the mic is live again and a tap starts a fresh call */
  const again = await pg.evaluate(async () => { const p = toggleAriaVoice(); const s = document.getElementById("assistantStatus").textContent; await p; return { s, live: !!(ariaRT && ariaRT.owned), rooms: window.__lk.rooms.length }; });
  assert.deepEqual(again, { s: "Conectando con Aria…", live: true, rooms: 2 });
  /* and the new call's context carries the conversation so far */
  const ctxOut = JSON.parse(await pg.evaluate(() => window.__lk.rooms.at(-1).handlers["aria.context"]({ payload: "{}" })));
  assert.ok(ctxOut.history.some((m) => /zapatillas para correr/.test(m.content)), "the second call lost the thread");
  await pg.evaluate(() => stopRealtimeVoice());
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("ear test 1: the silence sign-off is refused while she has the floor or he is talking", async () => {
  tokenMode = "ok";
  const { pg } = await openClocked("?voz=propia");
  await pg.evaluate(() => startRealtimeVoice()); await pg.clock.runFor(100);
  await agentState(pg, "speaking");
  await pg.evaluate(() => endRealtimeCallIdle("silencio"));
  assert.equal(await byeCues(pg), 0, "signed off over her own answer");
  await agentState(pg, "listening"); await userState(pg, "speaking");
  await pg.evaluate(() => endRealtimeCallIdle("silencio"));
  assert.equal(await byeCues(pg), 0, "signed off while he was talking");
  assert.equal(await live(pg), true);
  /* his hang-up is still his: the button ends the call at once */
  await pg.evaluate(() => toggleAriaVoice());
  assert.equal(await live(pg), false);
  await pg.close();
});

await check("ear test 2: a product her answer points at gets its card; one already on screen is not duplicated; she never disowns one", async () => {
  tokenMode = "ok";
  const { pg, errs } = await open("?voz=propia");
  await pg.evaluate(() => startRealtimeVoice());
  const out = await pg.evaluate(async () => {
    ariaRTProducts.set("vtest1", { title: "Nike Pegasus 41 Test", retailer: "ccs", price: 120, brand: "Nike" });
    const h = window.__lk.rooms.at(-1).handlers;
    const cards = () => document.querySelectorAll("#assistantMessages button").length;
    const c0 = cards();
    const first = JSON.parse(await h["aria.show"]({ payload: JSON.stringify({ ids: ["vtest1", "nope"] }) }));
    const c1 = cards();
    const second = JSON.parse(await h["aria.show"]({ payload: JSON.stringify({ ids: ["vtest1"] }) }));
    const c2 = cards();
    const disown = await executeRealtimeTool("open_product", { reference: "unas Adidas que nunca mostró" });
    return { first, second, added: c1 - c0, again: c2 - c1, disown };
  });
  assert.deepEqual(out.first, { shown: 1 });
  assert.equal(out.added, 1, "no card for the product she pointed at");
  assert.deepEqual(out.second, { shown: 0 });
  assert.equal(out.again, 0, "the card was put up twice");
  assert.equal(out.disown.not_shown, true);
  assert.match(out.disown.note, /búscalo AHORA con search_products/);
  assert.match(out.disown.note, /NUNCA digas que ya no lo tienes/);
  await pg.evaluate(() => stopRealtimeVoice());
  assert.deepEqual(errs, []);
  await pg.close();
});

await check("ear tests 1-2, the worker: interruptions need words; the opening needs no model turn for a guest; the lookup and the thread ride the wait; the budget is logged", async () => {
  const A = await import(VA + "src/agent.mjs");
  const B = await import(VA + "src/page-bridge.mjs");
  assert.deepEqual({ ...A.INTERRUPTION }, { minDuration: 600, minWords: 2, falseInterruptionTimeout: 1500, resumeFalseInterruption: true });
  assert.deepEqual(A.openingFor({}), { say: A.GUEST_GREETING });
  assert.deepEqual(A.openingFor({ facts: { get_current_user: { logged_in: false } } }), { say: A.GUEST_GREETING });
  const member = A.openingFor({ facts: { get_current_user: { logged_in: true, first_name: "Daniel" } } });
  assert.ok(member.instructions && /no llames ninguna herramienta/.test(member.instructions));
  assert.ok(A.openingFor({ history: [{ role: "user", content: "hola" }] }).instructions.startsWith(A.RETURN_GREETING_INSTRUCTIONS));
  /* the lookup: guest stops at get_current_user; a member also gets orders; a dead page answers null in time */
  const calls = [];
  const fake = (user) => async (method, payload) => { const r = JSON.parse(payload); calls.push(r.name); return JSON.stringify(r.name === "get_current_user" ? user : { orders: [] }); };
  assert.deepEqual(await A.shopperFacts(fake({ logged_in: false })), { get_current_user: { logged_in: false } });
  assert.deepEqual(calls, ["get_current_user"]);
  const m = await A.shopperFacts(fake({ logged_in: true, first_name: "Daniel" }));
  assert.deepEqual(Object.keys(m), ["get_current_user", "get_order_history"]);
  const t0 = Date.now();
  assert.equal(await A.shopperFacts(() => new Promise(() => {}), 200), null);
  assert.ok(Date.now() - t0 < 1000);
  assert.match(A.factsMessage(m), /^DATOS DEL CLIENTE, ya consultados/);
  /* [[SHOW]] ids reach the page; the voice never says them */
  assert.deepEqual(B.showIdsFrom("Te recomiendo estas. [[SHOW: v1, v2]]"), ["v1", "v2"]);
  assert.equal(B.stripCardMarkers("Te recomiendo estas. [[SHOW: v1, v2]]").trim(), "Te recomiendo estas.");
  const src = readFileSync(VA + "src/agent.mjs", "utf8");
  assert.match(src, /turnHandling: \{ interruption: \{ \.\.\.INTERRUPTION \} \}/);
  assert.match(src, /notifyPage\(rpc, RPC\.USER, \{ state: ev\.newState \}\)/);
  assert.match(src, /notifyPage\(rpc, RPC\.SHOW, \{ ids \}\)/);
  assert.match(src, /log\("spinup", \{ room: room\.name, \.\.\.spin \}\)/);
  /* nothing slow before the session starts: our thread and the lookup are awaited only with the speaker */
  const entry = src.slice(src.indexOf("entry: async"));
  assert.ok(entry.indexOf("await session.start(") < entry.indexOf("bounded(ourThread"), "the thread read is back on the critical path");
}, { needsWorker: true });

await browser.close();
server.close();
console.log(`\n  ${passed} passed, ${failures.length} failed${skipped.length ? `, ${skipped.length} skipped (cd voice-agent && npm install): ${skipped.join("; ")}` : ""}\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
