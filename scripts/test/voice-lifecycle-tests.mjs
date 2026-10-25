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
  assert.match(ab, /releaseRealtimeAudio\(mic\)/);
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
  assert.match(fnSrc("stopRealtimeVoice"), /releaseRealtimeAudio\(ariaRT\.mic\)/);
  /* run it: tracks stopped, stream dropped, session back to auto */
  const stopped = [];
  const el = { srcObject: {}, pause() { this.paused = true; } };
  const session = { type: "play-and-record" };
  new Function("ariaLiveAudioEl", "ariaSetAudioSession", fnSrc("releaseRealtimeAudio") + "\nreturn releaseRealtimeAudio;")(
    el, (t) => { session.type = t; })({ getTracks: () => [{ stop: () => stopped.push(1) }, { stop: () => stopped.push(2) }] });
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
  const hello = [{ role: "assistant", content: "¡Hola! Soy Aria, tu shopper personal. ¿Qué buscas hoy?" }];
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

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
