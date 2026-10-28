/* ==================================================================
   THE CALL ENDS WHEN IT SHOULD, AND HEARS HIM WHEN IT STARTS
   (#443 c.6393367532 and c.6393462271, Danny's iPhone, 2026-10-25).

   Four failures on a live phone, each with the cause this holds shut:

     1. Terminar did not release the microphone. A tap during the
        connect looked at ariaRT, which is null until the handshake
        ends, so it stopped nothing and the call came up anyway; and a
        call that did end left iOS in play-and-record with the remote
        stream still on the audio element.
     2. The silence shutoff never fired for a silent shopper: the
        opening nudge re-armed after every line of hers and the
        hang-up deferred to it every time.
     3. She did not hear him at open: his first words arrived while the
        greeting response was still open and were refused by the
        one-at-a-time gate; and a short reply to her hello ("Hola Aria,
        ¿qué tal?") matched her greeting's words and was dropped as her
        own echo.
     4. The greeting written twice: the same line twice in a row is one
        line on screen, and the tape keeps the second for diagnosis.

     node scripts/test/voice-lifecycle-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const bundle = readFileSync(ROOT + "build/" + readdirSync(ROOT + "build").find((f) => /^app-[0-9a-f]{16}\.js$/.test(f)), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${e.message}`); console.log("    FAIL " + name); }
}
/* The source of one top-level function, by brace matching. */
function fnSrc(name) {
  const at = bundle.indexOf("function " + name + "(");
  assert.ok(at >= 0, name + " is gone");
  let d = 0;
  for (let k = bundle.indexOf("{", at); k < bundle.length; k++) {
    if (bundle[k] === "{") d++;
    else if (bundle[k] === "}" && --d === 0) return bundle.slice(at, k + 1);
  }
  throw new Error(name + " has no end");
}

check("Terminar during the connect stops the call: the mic button acts while it is opening", () => {
  assert.match(fnSrc("toggleAriaVoice"), /^function toggleAriaVoice\(\)\{\n  if \(ariaRT \|\| ariaRTOpening\)\{ stopRealtimeVoice\(\); return; \}/);
  assert.match(fnSrc("stopRealtimeVoice"), /if \(!ariaRT\)\{[\s\S]{0,200}if \(ariaRTOpening\)\{ ariaRTAbort = true;/);
});

check("every step of the opening checks for a hang-up, and the last check is before the call goes live", () => {
  const open = fnSrc("startRealtimeVoiceOnce");
  for (const step of ["await ariaWarmRealtimeToken()", "await navigator.mediaDevices.getUserMedia(", "await pc.setRemoteDescription("]) {
    const at = open.indexOf(step);
    assert.ok(at > 0, step + " moved");
    assert.ok(/if \(ariaRTAbort\) return abortRealtimeOpening\(/.test(open.slice(at, at + 1400)), "no hang-up check after " + step);
  }
  assert.match(open, /if \(ariaRTAbort\) return abortRealtimeOpening\(mic, pc, [^)]*\);\n  ariaRT = \{/, "the call can go live after a hang-up");
  assert.match(open, /ariaRTOpening = true;\n  ariaRTAbort = false;/, "a new call starts with the last call's hang-up");
});

check("an aborted opening releases what it holds and shows no error", () => {
  const ab = fnSrc("abortRealtimeOpening");
  assert.match(ab, /pc\.close\(\)/);
  assert.match(ab, /releaseRealtimeAudio\(mic, why\)/);
  assert.match(ab, /ariaRTOpening = false;/);
  assert.match(ab, /ariaRTFailure = null;/);
  assert.ok(!/showRealtimeError/.test(ab), "a hang-up is reported as a failure");
  assert.match(fnSrc("toggleAriaVoice"), /if \(!ariaRTWanted\) return;\n[\s\S]{0,40}\/\* NO FALLBACK/, "a hang-up during the connect shows the error panel");
});

check("ending a call gives iOS its microphone back: tracks, the audio element's stream, the audio session", () => {
  const rel = fnSrc("releaseRealtimeAudio");
  assert.match(rel, /t\.stop\(\)/);
  assert.match(rel, /ariaLiveAudioEl\.srcObject = null/);
  assert.match(rel, /ariaSetAudioSession\('auto'\)/);
  assert.match(fnSrc("stopRealtimeVoice"), /releaseRealtimeAudio\(ariaRT\.mic, /);
  /* run it: tracks stopped, stream dropped, session back to auto */
  const stopped = [];
  const el = { srcObject: {}, pause() { this.paused = true; } };
  const session = { type: "play-and-record" };
  new Function("ariaLiveAudioEl", "ariaSetAudioSession", "diagSend", fnSrc("releaseRealtimeAudio") + "\nreturn releaseRealtimeAudio;")(
    el, (t) => { session.type = t; }, () => {})({ getTracks: () => [{ stop: () => stopped.push(1) }, { stop: () => stopped.push(2) }] });
  assert.equal(stopped.length, 2);
  assert.equal(el.srcObject, null);
  assert.equal(session.type, "auto");
});

check("his words are answered even when a response was still running: refused turns wait for response.done", () => {
  const cases = bundle.slice(bundle.indexOf("case 'conversation.item.input_audio_transcription.completed':"));
  const done = cases.slice(0, cases.indexOf("case 'conversation.item.input_audio_transcription.failed':"));
  assert.match(done, /if \(!askRealtimeResponse\(send, 'his turn'\)\)\{ ariaRTPendingTurn = true;/);
  const rd = bundle.slice(bundle.indexOf("case 'response.done': {"));
  assert.match(rd.slice(0, 700), /if \(ariaRTPendingTurn\)\{\n\s+ariaRTPendingTurn = false;\n\s+if \(!askRealtimeResponse\(send, 'his turn \(queued\)'\)\) ariaRTPendingTurn = true;/);
  assert.match(fnSrc("startRealtimeVoiceOnce"), /ariaRTPendingTurn = false;/, "a queued turn survives into the next call");
});

check("a short reply to her hello is his, not her echo; a sentence of hers coming back still is", () => {
  const normBrandText = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const echo = (said, history) => new Function("normBrandText", "ariaChatHistory", fnSrc("realtimeEchoOfHer") + "\nreturn realtimeEchoOfHer;")(normBrandText, history)(said);
  const hello = [{ role: "assistant", content: "¡Hola! Soy Aria, tu shopper personal. ¿Qué estás buscando?" }];
  assert.equal(echo("Hola Aria, ¿qué tal?", hello), false, "'Hola Aria, ¿qué tal?' was dropped as her echo");
  assert.equal(echo("hola aria que buscas", hello), false);
  assert.equal(echo("Hola, soy Aria, tu shopper personal, qué buscas hoy", hello), true, "her own greeting coming back is not caught");
});

check("the opening nudge is offered once per call, so a silent call reaches the hang-up", () => {
  const arm = fnSrc("armOpeningNudge");
  assert.match(arm, /if \(!ariaRT \|\| ariaRTSpoke \|\| ariaRTNudged\) return;/);
  assert.match(arm, /ariaRTNudged = true;\n\s+cueRealtime\(CUE_OPENING_SILENCE\);/);
  assert.match(fnSrc("startRealtimeVoiceOnce"), /ariaRTNudged = false;/, "the next call never nudges");
});

check("the same line of hers twice in a row is written once, and the tape keeps the second", () => {
  const td = bundle.slice(bundle.indexOf("case 'response.output_audio_transcript.done': {"));
  assert.match(td.slice(0, 1600), /if \(said && lastHer && lastHer\.content === said\)\{\n\s+tape\('!!', 'duplicate line not written: '/);
});


check("her greeting waits until her audio is actually playing, never more than 2.5s (#443 c.6400516868: first words clipped)", () => {
  const g = fnSrc("sendRealtimeGreeting");
  assert.match(g, /if \(!ariaRTOutputReady\)\{/);
  assert.match(g, /setTimeout\(\(\) => \{ if \(ariaRTGreetHeld === go\)\{[^}]*go\(\); \} \}, 2500\)/);
  const open = fnSrc("startRealtimeVoiceOnce");
  assert.match(open, /addEventListener\('playing'[\s\S]{0,300}setTimeout\(markRealtimeOutputReady, 300\)/, "nothing marks her audio as playing");
  assert.match(open, /ariaRTOutputReady = false;\n\s+ariaRTGreetHeld = null;/, "the last call's ready state leaks into the next");
  /* run it: held, then released by the element's 'playing' */
  const sent = [];
  const env = new Function("askRealtimeResponse", "diagMark", "setTimeout", "console",
    "let ariaRTGreeted = false, ariaRTGreetRetrying = false, GREETING_ATTEMPTS = 3, GREETING_RETRY_MS = 500;\n" +
    fnSrc("markRealtimeOutputReady").replace(/^function/, "var ariaRTOutputReady = false, ariaRTGreetHeld = null;\nfunction") + "\n" + g +
    "\nreturn { greet: sendRealtimeGreeting, ready: markRealtimeOutputReady, greeted: () => ariaRTGreeted };")(
    (send, why) => { sent.push(why); return true; }, () => {}, () => 0, { info() {}, warn() {} });
  assert.equal(env.greet(() => true), false, "the greeting went out before her audio could be heard");
  assert.deepEqual(sent, []);
  env.ready();
  assert.deepEqual(sent, ["greeting"], "the held greeting was not sent once her audio was playing");
  assert.equal(env.greeted(), true);
});

check("every call sends one transport report when it ends; the report carries timings and counters, never what he said", async () => {
  const rel = fnSrc("releaseRealtimeAudio");
  assert.match(rel, /^function releaseRealtimeAudio\(mic, why\)\{\n  diagSend\(why\);/);
  const send = fnSrc("diagSend");
  assert.match(send, /navigator\.sendBeacon\('\/\.netlify\/functions\/voice-diag'/);
  const open = fnSrc("startRealtimeVoiceOnce");
  for (const m of ["diagMark('tap')", "diagMark('token'", "diagMark('mic'", "diagMark('pc', st)", "diagMark('remote-track')", "diagMark('el-playing')", "diagMark('live')", "diagStartStats(pc)"]) assert.ok(open.includes(m), "the opening does not record " + m);
  assert.match(fnSrc("diagSample"), /outbound-rtp[\s\S]*bytesSent[\s\S]*inbound-rtp[\s\S]*bytesReceived[\s\S]*media-source[\s\S]*audioLevel/);
});


check("dead air ends the call whatever the noise does: 25s with no real words from him and no voice from her (#443 c.6401078614)", () => {
  const arm = fnSrc("armRealtimeIdleTimers");
  assert.match(arm, /noteRealtimeWords\(\);/);
  assert.match(arm, /Date\.now\(\) - ariaRTWordsAt >= CALL_DEAD_AIR_MS[\s\S]{0,200}endRealtimeCallIdle\('silencio'\)/);
  assert.match(bundle, /const CALL_DEAD_AIR_MS = 25000;/);
  const cases = bundle.slice(bundle.indexOf("case 'conversation.item.input_audio_transcription.completed':"));
  assert.match(cases.slice(0, 1600), /ariaRTSpoke = true;\n\s+noteRealtimeActivity\(\);\n\s+noteRealtimeWords\(\);/, "his real words do not count");
  const td = bundle.slice(bundle.indexOf("case 'response.output_audio_transcript.done': {"));
  assert.match(td.slice(0, 2000), /noteRealtimeWords\(\);/, "her finished line does not count");
  /* speech_started (which noise also opens) is not words */
  const ss = bundle.slice(bundle.indexOf("case 'input_audio_buffer.speech_started':"));
  assert.ok(!/noteRealtimeWords/.test(ss.slice(0, ss.indexOf("break;"))), "a VAD start counts as words");
  assert.match(fnSrc("clearRealtimeIdleTimers"), /clearInterval\(ariaRTDeadAirTimer\)/, "the backstop outlives the call");
});

check("browsing never keeps the metered line open (#443 c.6398393590)", () => {
  assert.ok(!/addEventListener\('(click|touchmove|wheel)', (\(\) => \{ if \(ariaRT\) noteRealtimeActivity|noteRealtimeScroll)/.test(bundle));
});

/* THE 17:51Z CALL (#443 c.6401531233): four of his turns committed, no
   transcript ever came back, and she never answered -- her answer
   waits on a transcript (item 31). */
check("a committed turn with no transcript is answered from his audio after 3.5s, once", () => {
  const c = bundle.slice(bundle.indexOf("case 'input_audio_buffer.committed':"));
  const blk = c.slice(0, c.indexOf("case 'conversation.item.input_audio_transcription.completed':"));
  assert.match(blk, /if \(ariaRTTranscribes\)\{[\s\S]*setTimeout\([\s\S]*ariaRTAnsweredFromAudio = true;\n\s+if \(!askRealtimeResponse\(send, 'his turn \(no transcript\)'\)\) ariaRTPendingTurn = true;[\s\S]*TRANSCRIPT_WAIT_MS\)/);
  assert.match(bundle, /const TRANSCRIPT_WAIT_MS = 3500;/);
  /* a delta, a transcript or a failure each stop the wait */
  for (const ev of ["delta", "completed", "failed"]) {
    const at = bundle.indexOf("case 'conversation.item.input_audio_transcription." + ev + "':");
    assert.ok(at > 0, ev + " is not handled");
    assert.match(bundle.slice(at, at + 300), /clearTimeout\(ariaRTTranscriptTimer\)/, ev + " leaves the wait running");
  }
  /* the late transcript of a turn already answered is written, not answered again */
  const done = bundle.slice(bundle.indexOf("case 'conversation.item.input_audio_transcription.completed': {"));
  assert.match(done.slice(0, 2600), /const fromAudio = ariaRTAnsweredFromAudio;\n\s+ariaRTAnsweredFromAudio = false;[\s\S]*if \(fromAudio\) tape\([\s\S]*else if \(!askRealtimeResponse\(send, 'his turn'\)\)/);
  assert.match(fnSrc("clearRealtimeIdleTimers"), /clearTimeout\(ariaRTTranscriptTimer\)[\s\S]*ariaRTAnsweredFromAudio = false;/, "the wait outlives the call");
});

check("one transcribing config, fail closed: a session without transcription is refused, the server never answers on its own", async () => {
  const open = fnSrc("startRealtimeVoiceOnce");
  assert.match(open, /ariaRTTranscribes = mint\.transcribes === true;/);
  assert.match(open, /diagMark\('session', \{ variant: String\(mint\.variant \|\| '\?'\), transcribes: ariaRTTranscribes \}\)/);
  assert.match(open, /if \(!ariaRTTranscribes\)\{\n\s+tape\([^\n]+\n\s+return noteRealtimeFailure\('la sesión de voz no transcribe'/);
  /* refused BEFORE the microphone opens */
  assert.ok(open.indexOf("return noteRealtimeFailure('la sesión de voz no transcribe'") < open.indexOf("getUserMedia("), "the refusal comes after the mic opened");
  assert.match(open, /if \(mint\.transcription\) input\.transcription = mint\.transcription;/);
  assert.doesNotMatch(bundle, /create_response: true/, "the page can still switch the server to answering turns itself");
});

check("the session is the current API's schema: max_output_tokens, never the rejected max_response_output_tokens (#443 c.6440605798)", async () => {
  const { buildRealtimeSession } = await import("../lib/realtime-voice.js");
  const sess = buildRealtimeSession();
  assert.equal(sess.max_output_tokens, 500);
  assert.ok(!("max_response_output_tokens" in sess), "the session still sends the field the API rejects");
  assert.ok(sess.audio.input.transcription, "the session does not transcribe");
  assert.doesNotMatch(bundle, /max_response_output_tokens/);
});

check("a failure never prints the API's words to the shopper; one greeting text everywhere", async () => {
  const err = fnSrc("showRealtimeError");
  assert.match(err, /text\.textContent = REALTIME_UNAVAILABLE_LINE;/);
  assert.doesNotMatch(err, /textContent = [^;]*(why|detail)/, "the reason reaches the screen");
  assert.match(bundle, /const REALTIME_UNAVAILABLE_LINE = 'La voz no está disponible ahorita\. Escríbeme aquí y te ayudo igual\.';/);
  assert.match(err, /console\.error\('REALTIME VOICE FAILED:', why, detail \|\| ''\);/, "the reason is no longer logged");
  const spoken = /CÓMO ABRES LA LLAMADA[\s\S]*?"(¡Hola! Soy Aria[^"]+)"/.exec(readFileSync(ROOT + "scripts/lib/realtime-voice.js", "utf8"))[1];
  assert.match(bundle, new RegExp("const ARIA_GREETING_FALLBACK = '" + spoken.replace(/[?¿!¡.]/g, (c) => "\\" + c) + "';"), "the written greeting differs from the spoken one");
});

/* The mint itself: an API that rejects transcription is reported, not hidden. */
{
  const realFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key-not-real";
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const p = JSON.parse(init.body);
    const s = p.session || p;
    seen.push(!!(s.audio && s.audio.input && s.audio.input.transcription));
    const ok = !(s.audio && s.audio.input && s.audio.input.transcription);
    return { ok, status: ok ? 200 : 400, text: async () => ok ? JSON.stringify({ value: "ek_test", expires_at: 9999999999 }) : JSON.stringify({ error: { message: "Unknown parameter: 'session.audio.input.transcription'." } }) };
  };
  const { handler } = await import("../../netlify/functions/aria-realtime-session.js");
  const outRes = await handler({ httpMethod: "POST", body: "{}" });
  const out = JSON.parse(outRes.body);
  globalThis.fetch = async (url, init) => ({ ok: true, status: 200, text: async () => JSON.stringify({ value: "ek_test" }) });
  const full = JSON.parse((await handler({ httpMethod: "POST", body: "{}" })).body);
  globalThis.fetch = realFetch;
  check("the mint never sheds transcription: an API that rejects it fails by name, every served session transcribes", () => {
    assert.equal(out.token, undefined, "a session without transcription was minted");
    assert.equal(out.status, 400);
    assert.match(out.detail, /transcription/);
    assert.deepEqual(out.attempts.map((a) => a.variant), ["completa", "sin ajustes de audio"]);
    assert.deepEqual(seen, [true, true], "a variant without transcription was tried");
    assert.equal(full.variant, "completa");
    assert.equal(full.transcribes, true);
    assert.equal(full.transcription.language, "es");
  });
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
