/* ============================================================
   VOZ EN VIVO, TESTED.

   RUN:  node scripts/test/realtime-voice-tests.mjs

   WHAT CAN AND CANNOT BE TESTED HERE, stated plainly because the
   difference matters for how much this PR should be trusted:

   TESTED — the session the server mints (semantic VAD,
   interrupt_response, the tool list, no key in it), the turn state
   machine that decides when Aria must stop talking, tool-argument
   parsing, the landed-cost maths, and the capability check that
   chooses live voice or the old loop.

   NOT TESTED, AND NOT TESTABLE FROM THIS CONTAINER — whether the audio
   actually cuts inside a frame, how semantic VAD behaves against a
   real Peruvian accent with a television on, and the end-to-end
   latency. There is no microphone here, no speakers, and
   api.openai.com answers 000 through the build proxy. Those are
   Danny's to judge on the preview; the PR body lists exactly what to
   listen for.

   Separate file because run-tests.mjs still cannot be imported on
   main — netlify/functions/_combo-validate.js has been missing since
   2026-09-28.
   ============================================================ */
import { strict as assert } from "node:assert";
import {
  buildRealtimeSession, buildRealtimeInstructions, TURN_DETECTION, buildTurnDetection,
  REALTIME_TOOLS, REALTIME_TOOL_NAMES, REALTIME_MODEL_DEFAULT,
} from "../lib/realtime-voice.js";
import {
  createVoiceTurnState, voiceTurnReducer, parseToolArguments, realtimeSupported,
  VOICE_IDLE, VOICE_LISTENING, VOICE_THINKING, VOICE_SPEAKING,
} from "../lib/realtime-turn.js";
import { deliveredTotal } from "../../netlify/functions/aria-realtime-tool.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0; const failures = [];
const group = (n) => console.log(`\n  ${n}`);
const check = (n, fn) => { try { fn(); passed++; console.log(`    ok   ${n}`); }
  catch (e){ failures.push(`${n}\n         ${e.message}`); console.log(`    FAIL ${n}\n         ${e.message}`); } };

/* ============================================================ */
group("the session the server mints");

check("turn detection is semantic VAD that can be interrupted", () => {
  /* These four are the brief's §4 verbatim, and each one is load-bearing:
     without interrupt_response the server keeps generating after the
     shopper starts talking, so the page can mute the sound but the
     words keep coming — and get billed. */
  assert.equal(TURN_DETECTION.type, "semantic_vad");
  /* `auto` means medium, which waits up to four seconds before
     deciding the shopper finished. That wait is what Danny felt as
     walkie-talkie. `high` caps it at two. */
  assert.equal(TURN_DETECTION.eagerness, "high");
  assert.equal(TURN_DETECTION.create_response, true);
  assert.equal(TURN_DETECTION.interrupt_response, true);
  const s = buildRealtimeSession();
  assert.deepEqual({ ...s.audio.input.turn_detection }, { ...TURN_DETECTION });
});

check("the session carries the tools and never a credential", () => {
  const s = buildRealtimeSession();
  assert.equal(s.type, "realtime");
  assert.equal(s.model, REALTIME_MODEL_DEFAULT);
  assert.equal(s.tool_choice, "auto");
  assert.equal(s.tools.length, REALTIME_TOOLS.length);
  const blob = JSON.stringify(s);
  for (const leak of ["OPENAI_API_KEY", "sk-", "Bearer", "ELEVENLABS", "xi-api-key"]){
    assert.ok(!blob.includes(leak), `the session payload contains ${leak}`);
  }
});

check("instructions tell her to yield the moment she is interrupted", () => {
  /* The behaviour the whole brief is about has to be IN the prompt,
     not only in the transport — the model decides whether to keep
     talking after a truncation. */
  const i = buildRealtimeInstructions();
  assert.match(i, /CÁLLATE de inmediato/u, "nothing tells her to stop when interrupted");
  assert.match(i, /Nunca sigas una frase solo porque ya la\s*empezaste/u);
  assert.match(i, /una a tres frases/iu, "no default response length");
  assert.match(i, /Nunca lo inventes/u, "nothing forbids inventing a price");
  /* …and it is the SAME Aria as the text assistant, not a second
     personality with different shipping rules. */
  assert.match(i, /Aria/);
  assert.ok(i.length > 1500, "the shared system prompt did not make it in");
});

check("only tools with a real backend are offered", () => {
  /* A tool with nothing behind it is worse than no tool: the model
     narrates its empty output as fact, which §12 forbids outright. */
  assert.deepEqual([...REALTIME_TOOL_NAMES].sort(),
    ["calculate_total_delivered_price", "get_order_status", "get_product_details", "search_products"]);
  /* Taking money is not something a mis-heard sentence should do. */
  assert.ok(!REALTIME_TOOL_NAMES.includes("create_order"), "a voice can place an order");
  for (const t of REALTIME_TOOLS){
    assert.equal(t.type, "function");
    assert.ok(t.description && t.description.length > 20, `${t.name} has no usable description`);
    assert.equal(t.parameters.additionalProperties, false, `${t.name} accepts arbitrary keys`);
    assert.ok(Array.isArray(t.parameters.required), `${t.name} declares no required args`);
  }
});

/* ============================================================ */
group("barge-in: she stops the moment the shopper speaks");

/** Drive a sequence of events and return the state + every action. */
function play(events, start){
  let st = start || createVoiceTurnState();
  const all = [];
  for (const e of events){
    const { state, actions } = voiceTurnReducer(st, e);
    st = state; all.push(...actions);
  }
  return { state: st, actions: all };
}

check("speaking over her stops the audio and cancels the response", () => {
  /* The brief's own example: she is mid-sentence on Nike and the
     shopper says "wait, actually, make that Adidas". */
  const { state, actions } = play([
    { type: "response.created", response: { id: "resp_1" } },
    { type: "response.output_audio.delta" },
    { type: "input_audio_buffer.speech_started" },
  ]);
  assert.ok(actions.includes("stopPlayback"), "the audio was not stopped");
  assert.ok(actions.includes("clearAudioQueue"), "buffered audio was left to play out");
  assert.ok(actions.includes("cancelResponse"), "the server was not told to stop generating");
  assert.equal(state.phase, VOICE_LISTENING, "she is not listening after being interrupted");
  assert.equal(state.interruptions, 1);
});

check("audio that arrives after the interruption is dropped, not played", () => {
  /* The packet already in flight when the shopper spoke. Playing it
     is the "buffered audio continued" failure §6 names. */
  const { actions } = play([
    { type: "response.created", response: { id: "r" } },
    { type: "response.output_audio.delta" },
    { type: "input_audio_buffer.speech_started" },
    { type: "response.output_audio.delta" },
  ]);
  const after = actions.slice(actions.indexOf("stopPlayback"));
  assert.ok(after.includes("dropAudio"), "late audio was not dropped");
  assert.ok(!after.includes("playAudio"), "late audio was played after the interruption");
});

check("what she had already said is kept, so she does not repeat it", () => {
  const { state } = play([
    { type: "response.created", response: { id: "r" } },
    { type: "response.output_audio_transcript.delta", delta: "Encontré varias opciones" },
    { type: "input_audio_buffer.speech_started" },
  ]);
  assert.equal(state.spokenSoFar, "Encontré varias opciones", "the cancelled turn was forgotten");
});

check("interrupting before any audio still cancels the response", () => {
  /* She is thinking, not yet speaking. Letting that response land and
     start talking over the shopper is the same bug one beat later. */
  const { actions, state } = play([
    { type: "response.created", response: { id: "r" } },
    { type: "input_audio_buffer.speech_started" },
  ]);
  assert.ok(actions.includes("cancelResponse"));
  assert.equal(state.phase, VOICE_LISTENING);
});

check("a pause mid-thought is not an interruption", () => {
  /* Nobody is speaking: a speech_started while idle is just the
     shopper beginning a turn, and must not emit a cancel for a
     response that does not exist — the server errors on that. */
  const { actions, state } = play([{ type: "input_audio_buffer.speech_started" }]);
  assert.deepEqual(actions, [], `a fresh turn emitted ${actions.join(",")}`);
  assert.equal(state.phase, VOICE_LISTENING);
  assert.equal(state.interruptions, 0);
});

check("the normal turn runs without ever cutting her off", () => {
  const { state, actions } = play([
    { type: "input_audio_buffer.speech_started" },
    { type: "input_audio_buffer.speech_stopped" },
    { type: "response.created", response: { id: "r" } },
    { type: "response.output_audio.delta" },
    { type: "response.output_audio.delta" },
    { type: "response.done" },
  ]);
  assert.ok(!actions.includes("stopPlayback"), "an uninterrupted turn was cut off");
  assert.equal(actions.filter(a => a === "playAudio").length, 2);
  assert.equal(state.phase, VOICE_IDLE, "she never went back to idle");
  assert.equal(state.lastResponseId, null, "a finished response is still cancellable");
});

check("the mic stays open across turns — there is no closed state", () => {
  /* The old loop's defining bug was that the microphone closed for the
     whole think phase. No phase here means "not listening": every
     phase can receive speech_started and act on it. */
  for (const phase of [VOICE_IDLE, VOICE_LISTENING, VOICE_THINKING, VOICE_SPEAKING]){
    const { state } = voiceTurnReducer({ ...createVoiceTurnState(), phase, lastResponseId: "r" },
      { type: "input_audio_buffer.speech_started" });
    assert.equal(state.phase, VOICE_LISTENING, `speech while ${phase} did not start a turn`);
  }
});

check("an error unsticks the UI instead of leaving her 'speaking'", () => {
  const { state, actions } = play([
    { type: "response.created", response: { id: "r" } },
    { type: "response.output_audio.delta" },
    { type: "error", error: { message: "boom" } },
  ]);
  assert.equal(state.phase, VOICE_IDLE);
  assert.ok(actions.includes("stopPlayback"));
});

/* ============================================================ */
group("tool arguments, from a model in a hurry");

check("malformed arguments become a sentence, never an exception", () => {
  for (const bad of ["{not json", "", "null", "[1,2]"]){
    const r = parseToolArguments("search_products", bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} was accepted`);
    assert.ok(r.error && !/\n\s+at /.test(r.error), "a stack trace reached the voice");
  }
  assert.equal(parseToolArguments("borrar_todo", "{}").ok, false, "an unknown tool was allowed");
});

check("a missing required argument is refused by name", () => {
  /* TWO DIFFERENT FAULTS, two different sentences — and they are
     checked separately because a single /query/ match let a mutation
     deleting the first guard pass on the second one's message.
       absent or blank -> "Falta"      (she should ask for it)
       present but junk -> "no es válido" (she should rephrase) */
  for (const args of [{ brand: "Nike" }, { query: "" }, { query: "   " }]){
    const r = parseToolArguments("search_products", JSON.stringify(args));
    assert.equal(r.ok, false, `${JSON.stringify(args)} was accepted`);
    assert.match(r.error, /Falta "query"/, `wrong message for ${JSON.stringify(args)}`);
  }
  const wrongType = parseToolArguments("search_products", JSON.stringify({ query: 123 }));
  assert.equal(wrongType.ok, false, "a numeric query was accepted");
  assert.match(wrongType.error, /"query" no es válido/);
});

check("numbers arrive as strings and are coerced; junk is dropped", () => {
  const r = parseToolArguments("search_products", JSON.stringify({ query: "zapatillas", max_price_usd: "120", limit: "4", colour: "rojo" }));
  assert.equal(r.ok, true);
  assert.equal(r.args.max_price_usd, 120);
  assert.equal(r.args.limit, 4);
  assert.equal(r.args.colour, undefined, "an undeclared argument was passed through");
  const neg = parseToolArguments("search_products", JSON.stringify({ query: "x", max_price_usd: -5 }));
  assert.equal(neg.args.max_price_usd, undefined, "a negative budget was accepted");
});

/* ============================================================ */
group("the money numbers come from one place");

check("the delivered total is product + freight + tax, and nothing invented", () => {
  /* 2 kg at $13 = $26 freight. FOB $300 is over the $200 threshold, so
     25% of CIF ($300 + $26 = $326) = $81.50. */
  const t = deliveredTotal({ priceUsd: 372, dutiableUsd: 300, weightKg: 2, quantity: 1 });
  assert.equal(t.product_usd, 372);
  assert.equal(t.freight_usd, 26);
  assert.equal(t.import_tax_usd, 81.5);
  assert.equal(t.total_usd, 479.5);
  assert.match(t.import_tax_note, /pasa los \$200/);
});

check("under the threshold there is no tax, and she can say why", () => {
  const t = deliveredTotal({ priceUsd: 60, dutiableUsd: 48, weightKg: 0.5 });
  assert.equal(t.import_tax_usd, 0);
  assert.equal(t.freight_usd, 6.5);
  assert.equal(t.total_usd, 66.5);
  assert.match(t.import_tax_note, /no aplica/);
});

check("a missing weight or base says so instead of guessing", () => {
  /* Freight is charged by weight; a guessed weight is a guessed price,
     and §12 forbids it outright. */
  assert.match(deliveredTotal({ priceUsd: 50, dutiableUsd: 40, weightKg: 0 }).unavailable, /peso/);
  assert.match(deliveredTotal({ priceUsd: 50, dutiableUsd: null, weightKg: 1 }).unavailable, /impuestos/);
  assert.match(deliveredTotal({ priceUsd: 0, dutiableUsd: 40, weightKg: 1 }).unavailable, /precio/);
});

check("quantity scales every line and is bounded", () => {
  const t = deliveredTotal({ priceUsd: 10, dutiableUsd: 8, weightKg: 1, quantity: 3 });
  assert.equal(t.product_usd, 30);
  assert.equal(t.freight_usd, 39);
  assert.equal(deliveredTotal({ priceUsd: 10, dutiableUsd: 8, weightKg: 1, quantity: 9999 }).quantity, 20);
  assert.equal(deliveredTotal({ priceUsd: 10, dutiableUsd: 8, weightKg: 1, quantity: 0 }).quantity, 1);
});

check("the freight rate here is the one the shopper is quoted", () => {
  /* $13/kg is the customer-facing rate in index.html. Our internal
     courier cost must never reach a customer surface, and the two
     numbers drifting apart is how that happens. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const m = /const CHARGE_PER_KG_USD = (\d+)/.exec(page);
  assert.ok(m, "CHARGE_PER_KG_USD vanished from index.html");
  const fn = readFileSync(ROOT + "netlify/functions/aria-realtime-tool.js", "utf8");
  const m2 = /const CHARGE_PER_KG_USD = (\d+)/.exec(fn);
  assert.equal(m2[1], m[1], `the voice quotes $${m2[1]}/kg while the site quotes $${m[1]}/kg`);
});

/* ============================================================ */
group("it fails closed, back to the loop that works");

check("a browser without WebRTC, a mic, or HTTPS uses the old loop", () => {
  const full = { RTCPeerConnection: function(){}, mediaDevices: { getUserMedia(){} }, isSecureContext: true };
  assert.equal(realtimeSupported(full).ok, true);
  for (const [missing, env] of [
    ["WebRTC", { ...full, RTCPeerConnection: undefined }],
    ["getUserMedia", { ...full, mediaDevices: {} }],
    ["mediaDevices", { ...full, mediaDevices: undefined }],
    ["HTTPS", { ...full, isSecureContext: false }],
  ]){
    const r = realtimeSupported(env);
    assert.equal(r.ok, false, `${missing} missing was treated as supported`);
    assert.ok(r.reason, `${missing} gave no reason`);
  }
  assert.equal(realtimeSupported(undefined).ok, false, "an empty environment was treated as supported");
});

check("the page falls back rather than throwing when the module is absent", () => {
  /* combo-deals.js taught this repo that a module import which 404s
     kills its whole <script type="module"> silently. The realtime
     bridge is therefore its OWN block, and the classic script checks
     for the object instead of assuming it. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.match(page, /import \* as AriaRealtimeTurn from '\.\/scripts\/lib\/realtime-turn\.js'/,
    "the turn module is not bridged into the page");
  assert.match(page, /const T = window\.AriaRealtimeTurn;\s*\n\s*if \(!T/,
    "the page assumes the bridge loaded");
  /* The mic button must still work when live voice cannot start. */
  assert.match(page, /if \(await startRealtimeVoice\(\)\) return;[\s\S]{0,1600}toggleContinuousMode\(\);/,
    "a failed realtime start does not fall back to the old loop");
});

check("live voice is the default, and ?voz=clasica is a real kill switch", () => {
  /* RUN, NOT GREPPED. The first version of this checked that the
     function existed and was called — and a mutation replacing its
     whole body with `return true` passed it. The function is lifted
     out of the page and executed against a stubbed location and
     localStorage instead.

     The default flipped on 2026-10-06 (Danny approved full
     gpt-realtime), so the thing worth protecting is now the opposite:
     that the kill switch still works and still sticks. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const from = page.indexOf("function realtimeEnabled(){");
  assert.ok(from > 0, "realtimeEnabled is gone from index.html");
  const src = page.slice(from, page.indexOf("\n}", from) + 2);
  const flagM = /const ARIA_RT_FLAG = '([^']+)'/.exec(page);
  assert.ok(flagM, "ARIA_RT_FLAG is gone from index.html");
  const make = (search, stored, hostile) => {
    const store = new Map(stored !== undefined ? [[flagM[1], stored]] : []);
    /* ARIA_RT_FLAG is declared outside the function; without it the
       body throws into its own catch, which once looked exactly like
       a passing test. */
    const fn = new Function("location", "localStorage", "URLSearchParams", "ARIA_RT_FLAG",
      src + "; return realtimeEnabled();");
    const ls = hostile
      ? { getItem(){ throw new Error("denied"); }, setItem(){ throw new Error("denied"); },
          removeItem(){ throw new Error("denied"); } }
      : { getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v)),
          removeItem: (k) => store.delete(k) };
    return { on: fn({ search }, ls, URLSearchParams, flagM[1]), store };
  };
  assert.equal(make("").on, true, "live voice is not the default");
  assert.equal(make("?utm_source=fb").on, true, "an unrelated query string turned it off");
  assert.equal(make("?voz=clasica").on, false, "?voz=clasica did not turn it off");
  assert.equal(make("", "0").on, false, "the stored kill switch was not remembered");
  assert.equal(make("?voz=vivo", "0").on, true, "?voz=vivo did not undo the kill switch");
  /* …and the kill switch persists, or it is useless the next reload. */
  assert.equal(make("?voz=clasica").store.get(flagM[1]), "0", "the kill switch was not stored");
  /* A browser that refuses localStorage outright must not lose the voice. */
  assert.equal(make("", undefined, true).on, true, "a locked-down browser lost live voice");
});

check("the mute button actually stops transmitting", () => {
  /* REGRESSION. Until 2026-10-06 this function read the track's
     enabled flag into a variable named `nowMuted` and then assigned
     that same value back — two taps, no change, a mute button that
     muted nothing. Nothing caught it because no UI called it yet.
     Lifted and run, both directions. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const from = page.indexOf("function toggleRealtimeMute(){");
  assert.ok(from > 0, "toggleRealtimeMute is gone from index.html");
  const src = page.slice(from, page.indexOf("\n}", from) + 2);
  const tracks = [{ enabled: true }, { enabled: true }];
  let lastUi = null;
  const fn = new Function("ariaRT", "setRealtimeUi",
    src + "; return toggleRealtimeMute;");
  const toggle = fn({ mic: { getAudioTracks: () => tracks } }, (live, muted) => { lastUi = muted; });

  assert.equal(toggle(), true, "the first tap did not report muting");
  assert.ok(tracks.every(t => t.enabled === false), "the tracks still transmit while muted");
  assert.equal(lastUi, true, "the UI was not told it is muted");

  assert.equal(toggle(), false, "the second tap did not report unmuting");
  assert.ok(tracks.every(t => t.enabled === true), "the tracks did not come back");
  assert.equal(lastUi, false, "the UI was not told it is live again");

  /* Disabling the TRACK is the point: a disabled track transmits
     silence, so nothing reaches OpenAI and nothing is billed. Muting
     the audio element would only stop us hearing ourselves. */
  assert.ok(!/\.muted\s*=/.test(src), "mute works on the element, not the microphone track");
});

check("the call controls exist and only while a call does", () => {
  const page = readFileSync(ROOT + "index.html", "utf8");
  /* The brief requires a visible mute and a visible way out. */
  assert.match(page, /id="assistantMuteBtn"[^>]*onclick="toggleRealtimeMute\(\)"/,
    "there is no mute button wired to the mute function");
  assert.match(page, /onclick="stopRealtimeVoice\(\)"[^>]*>\s*Terminar/,
    "there is no end-call button wired to stopRealtimeVoice");
  /* Hidden in the markup: a mute button that mutes nothing, shown to a
     shopper who is not on a call, is worse than no button. */
  assert.match(page, /id="assistantCallBar" hidden/, "the call bar is visible before any call");
  /* NO SEND BUTTON ON AN OPEN LINE. There is nothing to send, and a
     send button is the strongest cue that this is a form, not a call. */
  assert.match(page, /if \(sendBtn\) sendBtn\.hidden = live;/,
    "the send button does not disappear during a call");
  assert.match(page, /if \(input\) input\.hidden = live;/,
    "the text box does not disappear during a call");
  const ui = page.slice(page.indexOf("function setRealtimeUi("));
  assert.match(ui.slice(0, ui.indexOf("\n}")), /bar\.hidden = !live/,
    "the call bar is not tied to whether a call is open");
  /* …and the state is said in words, both ways. Greppping for the
     strings alone passed a mutation that stopped CALLING the setter,
     so the wiring is what is asserted: the branch that opens the
     audio must be the branch that says she is speaking. */
  assert.match(page, /Aria te escucha/, "there is no listening state");
  assert.match(page, /Aria está hablando/, "there is no speaking state");
  assert.match(page, /action === 'playAudio'\)\{ sink\.open\(\); setRealtimeState\('speaking'\); \}/,
    "playing her audio does not put the bar into the speaking state");
  /* The cut itself, asserted as its real condition — `if (false)`
     silently disarmed barge-in and still passed an earlier version. */
  assert.match(page, /if \(action === 'stopPlayback' \|\| action === 'clearAudioQueue' \|\| action === 'dropAudio'\)\{/,
    "barge-in no longer cuts the audio it is supposed to cut");
  assert.match(page, /case 'input_audio_buffer\.speech_started':[\s\S]{0,160}setRealtimeState\('listening'\);/,
    "the shopper speaking does not put the bar into the listening state");
});

check("she cannot be made to monologue, and the model is the one Danny picked", () => {
  const session = buildRealtimeSession();
  assert.equal(session.model, "gpt-realtime", "the model is not full gpt-realtime");
  assert.ok(!/mini/.test(session.model), "a mini model slipped in");
  /* Output audio is the expensive half and a prompt is only a
     preference. 500 tokens is generous for three sentences and
     impossible to filibuster from. */
  assert.equal(session.max_response_output_tokens, 500, "there is no ceiling on response length");
  assert.equal(session.audio.output.voice, "marin", "the voice changed without a decision");
  /* The transcript is a separate ASR from what she hears, so this
     only drives the text on screen — but an empty model name turns
     the subtitles off entirely, which reads as her not listening. */
  const tr = session.audio.input.transcription;
  assert.ok(tr && tr.model, "there is no transcription model, so no transcript appears");
  assert.equal(tr.model, "whisper-1", "the transcription model changed without a decision");
  /* The language hint is the half of Danny's fix 2 that is real: it
     stops the ASR guessing at Spanish with brand names in English. */
  assert.equal(tr.language, "es", "the Spanish hint is gone, so the ASR will guess");
  /* Barge-in is not optional: without interrupt_response the server
     keeps generating after the shopper starts talking, and the audio
     the page cancels locally still arrives and is still billed. */
  assert.equal(session.audio.input.turn_detection.interrupt_response, true, "barge-in is off");
  assert.equal(session.audio.input.turn_detection.type, "semantic_vad", "not semantic VAD");
});

check("the spoken rules say the things that cost money or trust", () => {
  const i = buildRealtimeInstructions(null);
  /* Zero emojis, per the brief, with no exception. */
  assert.match(i, /CERO EMOJIS/, "the no-emoji rule is gone");
  /* The prompt tells her prices already include the service margin.
     That is exactly the knowledge that tempts a model to do the
     arithmetic out loud and get it wrong, so the ban on calculating
     has to travel with it. */
  assert.match(i, /NO haces nunca es sacar la cuenta/, "she is allowed to compute prices herself");
  assert.match(i, /soles/, "the checkout currency is not mentioned");
  /* Gift scenarios: questions first, products second. */
  assert.match(i, /preguntas buenas ANTES de mostrar/, "the gift-first-ask rule is gone");
  /* Direction, not a pin: dolls must not become Nerf guns. */
  assert.match(i, /Nerf/, "the semantic-direction example is gone");
  assert.match(i, /Seis a doce opciones/, "the curated-count rule is gone");
  /* Accented speech, brand names in English, and a shopper in a car. */
  assert.match(i, /CÓMO ESCUCHAS/, "the listening instruction is gone");
  assert.match(i, /nunca le hagas repetir la frase entera/,
    "nothing stops her making the shopper repeat themselves");
  /* No hard catalogue counts: they go stale and she states them as
     fact. retailers.js had 92 entries the day the brief said 77. */
  assert.ok(!/\b77\b|\b31 departamentos\b|\b5000\b/.test(i),
    "a catalogue count is baked into the prompt and will go stale");
  assert.match(i, /NO CITES INVENTARIOS NI TOTALES/, "nothing stops her quoting a stale count");
});

check("the token mint survives either spelling of the endpoint", () => {
  const mint = readFileSync(ROOT + "netlify/functions/aria-realtime-session.js", "utf8");
  /* Matched as fetch URLs, not as bare words: both names appear in
     the comment above them, which is how a mutation pointing the
     fallback back at /client_secrets went unnoticed. */
  assert.match(mint, /fetch\(`\$\{REALTIME_API_BASE\}\/client_secrets`/,
    "the current endpoint is gone");
  assert.match(mint, /fetch\(`\$\{REALTIME_API_BASE\}\/sessions`/,
    "there is no fallback to the endpoint the brief names");
  /* Only a wrong path answers 404/405; falling back on anything else
     would retry a real failure against a second endpoint and double
     the latency of every outage. */
  assert.match(mint, /res\.status === 404 \|\| res\.status === 405/,
    "the fallback triggers on the wrong condition");
  /* The two endpoints disagree about shape, both ways. */
  assert.match(mint, /body: JSON\.stringify\(\{ session \}\)/, "the modern call lost its wrapper");
  assert.match(mint, /body: JSON\.stringify\(session\)/, "the legacy call is wrapped and will 400");
  assert.match(mint, /data\?\.value \|\| data\?\.client_secret\?\.value/,
    "only one response shape is understood");
});

check("the two VAD modes never borrow each other's parameters", () => {
  /* THE BUG THIS PREVENTS. semantic_vad takes `eagerness` and nothing
     else; threshold / prefix_padding_ms / silence_duration_ms belong
     to server_vad. A session carrying the wrong ones is malformed, the
     mint fails, and the page falls back to the speech-to-text loop
     with nobody told why — which is how a whole round of iPhone
     feedback ended up describing the wrong engine. */
  const sem = buildTurnDetection({ mode: "semantic_vad" });
  assert.equal(sem.type, "semantic_vad");
  assert.equal(sem.eagerness, "high");
  for (const k of ["threshold", "prefix_padding_ms", "silence_duration_ms"]){
    assert.ok(!(k in sem), `semantic_vad is carrying ${k}, which it does not accept`);
  }
  /* …and it stays clean even when asked for them directly. */
  const dirty = buildTurnDetection({ mode: "semantic_vad", silence_duration_ms: 400, threshold: 0.5 });
  assert.ok(!("silence_duration_ms" in dirty), "a server_vad parameter leaked into semantic_vad");

  const srv = buildTurnDetection({ mode: "server_vad" });
  assert.equal(srv.type, "server_vad");
  assert.ok(!("eagerness" in srv), "server_vad is carrying eagerness, which it does not accept");
  /* The brief's numbers. silence_duration_ms is the one that matters:
     the API default is 500ms. */
  assert.equal(srv.silence_duration_ms, 400);
  assert.equal(srv.prefix_padding_ms, 300);
  assert.equal(srv.threshold, 0.5);

  /* Both modes must still answer on their own and still yield. */
  for (const td of [sem, srv]){
    assert.equal(td.create_response, true, "she will not answer without a send button");
    assert.equal(td.interrupt_response, true, "barge-in is off");
  }
  /* Only the two real modes exist; a typo must not invent a third. */
  assert.equal(buildTurnDetection({ mode: "nonsense" }).type, "semantic_vad");
});

check("the page does not keep its own copy of the VAD settings", () => {
  /* Two copies of a config whose shape differs per mode is two
     chances to send a malformed session. The mint hands the settings
     back with the token and the page echoes them. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const mint = readFileSync(ROOT + "netlify/functions/aria-realtime-session.js", "utf8");
  assert.match(mint, /turn_detection: session\.audio\.input\.turn_detection/,
    "the mint does not return the turn detection it configured");
  assert.match(page, /turn_detection: mint\.turn_detection/,
    "the page does not echo the server's turn detection back");
  /* No literal VAD config left anywhere in the page. */
  assert.ok(!/eagerness:\s*['"]/.test(page), "index.html still hardcodes an eagerness");
  assert.ok(!/silence_duration_ms/.test(page), "index.html still hardcodes a VAD timing");
});

check("a fallback is never silent again", () => {
  /* 2026-10-06: Danny's feedback described the speech-to-text loop
     because that is what he was talking to, and nothing on screen or
     in the console said so. Every bail-out now names itself. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const start = page.indexOf("async function startRealtimeVoice()");
  const end = page.indexOf("/** End the session", start);
  const body = page.slice(start, end);
  assert.ok(start > 0 && end > start, "startRealtimeVoice moved");
  /* Every `return false` inside the start path must carry a reason. */
  const bare = body.split(/\n/).filter(l => /^\s*return false;/.test(l));
  assert.equal(bare.length, 0, `${bare.length} silent bail-out(s) left in startRealtimeVoice`);
  assert.ok((body.match(/noteRealtimeFailure\(/g) || []).length >= 5,
    "not every failure path records a reason");
  /* The no-key case is the likeliest one and must say so by name. */
  assert.match(body, /no tiene la llave de OpenAI/, "a missing API key is not named");
  /* The shopper is told which engine they got — and it must be
     rendered by the function that owns the line, not set alongside it.
     The first version set the text in the fallback path, where
     setAssistantMicState overwrote it a moment later and the browser
     check caught what the grep could not. */
  assert.match(page, /ariaRTFellBack = true;/, "the fallback does not record itself");
  const pill = page.slice(page.indexOf("THE LISTENING PILL"));
  assert.match(pill.slice(0, 1400), /ariaRTFellBack\)[\s\S]{0,120}modo clásico/,
    "the listening pill does not say which engine is running");
  /* And one call answers it from a phone console. */
  assert.match(page, /window\.ariaVoiceDiag = ariaVoiceDiag/, "there is no diagnostic to call");
});

check("echo cancellation stays pinned on", () => {
  /* Without it her own voice re-enters the microphone, the server's
     VAD calls that "the shopper is talking", and she interrupts
     herself. The car flags must never be able to switch it off. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const i = page.indexOf("mic = await navigator.mediaDevices.getUserMedia(");
  const block = page.slice(i, i + 900);
  assert.match(block, /echoCancellation: true/, "echo cancellation is not pinned on");
  assert.ok(!/echoCancellation: !/.test(block), "echo cancellation was made conditional");
  /* …while the two that fight the server's own processing can go. */
  assert.match(block, /noiseSuppression: !realtimeRawAudio\(\)/, "noise suppression is not tunable");
  assert.match(block, /autoGainControl: !realtimeRawAudio\(\)/, "automatic gain is not tunable");
});

check("the old pipeline cannot run during a live call", () => {
  /* THE BUG THIS PREVENTS (2026-10-06). runAssistantBrain is the
     speech-to-text pipeline: it closes the microphone for its think
     phase, waits on a silence timer, answers through a second audio
     element and then calls recognition.start() again — which is the
     click Danny heard on iOS. All three of its callers could reach it
     mid-call, so one tap on a quick-reply chip put two engines on the
     line at once. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const brain = page.slice(page.indexOf("async function runAssistantBrain(text){"));
  const head = brain.slice(0, brain.indexOf("if (assistantThinking) return;"));
  assert.match(head, /if \(ariaRT\)\{ speakIntoRealtime\(text\); return; \}/,
    "the classic brain can still run while a realtime session is open");
  /* …and it must come BEFORE anything that touches the microphone. */
  assert.ok(!/intentionalStop/.test(head), "the mic is closed before the live-call guard runs");

  /* The speech-to-text microphone must never open during a call: two
     getUserMedia consumers fight, and start() is what clicks. */
  const i = page.indexOf("try { recognition.start();");
  const before = page.slice(Math.max(0, i - 700), i);
  assert.match(before, /if \(ariaRT\) return;/,
    "recognition.start() is reachable during a live call");

  /* Typed text goes down the open line instead of opening a new one. */
  assert.match(page, /function speakIntoRealtime\(text\)/, "there is no way to speak text into the session");
  const speak = page.slice(page.indexOf("function speakIntoRealtime(text){"));
  const speakBody = speak.slice(0, speak.indexOf("\n}"));
  assert.match(speakBody, /type: 'conversation\.item\.create'[\s\S]{0,200}input_text/,
    "typed text is not sent as a conversation item of text");
  assert.match(speakBody, /ariaChatHistory\.push\(\{ role: 'user', content: text \}\)/,
    "typed text never reaches the conversation history");
  assert.match(speakBody, /type: 'response\.create'/, "she is never asked to answer the typed text");
});

check("nothing in the live path records, chunks, or auto-sends", () => {
  const page = readFileSync(ROOT + "index.html", "utf8");
  /* A voice-message architecture would need one of these. None exist. */
  assert.ok(!/MediaRecorder/.test(page), "a MediaRecorder appeared — that is chunking");
  const start = page.indexOf("async function startRealtimeVoice()");
  const end = page.indexOf("/* END OF THE REALTIME CLIENT SLICE */");
  const slice = page.slice(start, end);
  assert.ok(!/MediaRecorder|ondataavailable/.test(slice), "the live path records instead of streaming");
  assert.ok(!/setTimeout\([^)]*silen/i.test(slice), "the live path has a silence timer");
  assert.ok(!/SILENCE_TIMEOUT/.test(slice), "the live path uses the old auto-send timeout");

  /* ONE getUserMedia, ONE peer connection, the track added once. */
  assert.equal((slice.match(/getUserMedia\(/g) || []).length, 1, "the mic is opened more than once");
  assert.equal((slice.match(/new RTCPeerConnection\(/g) || []).length, 1, "more than one peer connection");
  assert.equal((slice.match(/pc\.addTrack\(/g) || []).length, 1, "the track is added more than once");

  /* THE INVARIANT THAT MATTERS: the mic is never touched between
     turns. Two stops exist and both are legitimate — cleaning up a
     call that failed to connect, and ending one — so the assertion is
     about WHERE, not how many: nothing in the per-event path may stop
     or disable it. */
  /* The two handlers that run on every event of every turn, and
     nothing else: the data-channel reducer loop and the transcript /
     tool handler. Connecting and ending the call legitimately touch
     the microphone; these must not. */
  const reducerLoop = page.slice(page.indexOf("  dc.onmessage = (ev) => {"),
                                 page.indexOf("  dc.onopen = () => {"));
  const eventHandler = page.slice(page.indexOf("async function onRealtimeEvent(event, turn, send){"),
                                  page.indexOf("async function runRealtimeTool"));
  assert.ok(reducerLoop.length > 200 && eventHandler.length > 200, "the per-event path moved");
  for (const [name, path] of [["reducer loop", reducerLoop], ["event handler", eventHandler]]){
    assert.ok(!/\.stop\(\)/.test(path), `the ${name} stops the microphone between turns`);
    assert.ok(!/enabled\s*=/.test(path), `the ${name} disables the microphone between turns`);
    assert.ok(!/getUserMedia/.test(path), `the ${name} reopens the microphone per turn`);
    assert.ok(!/recognition\./.test(path), `the ${name} touches speech recognition`);
  }

  /* Stopping belongs to ending the call and to a failed connect. */
  const stopFn = page.slice(page.indexOf("function stopRealtimeVoice()"));
  assert.match(stopFn.slice(0, 400), /mic\.getTracks\(\)\.forEach\(t => t\.stop\(\)\)/,
    "ending the call no longer releases the microphone");
  /* Disabling belongs to mute, and to nothing else. */
  const mute = page.slice(page.indexOf("function toggleRealtimeMute()"));
  assert.match(mute.slice(0, 700), /t\.enabled = !muted/, "mute no longer owns the enabled flag");
});

check("strict mode refuses to substitute the old loop", () => {
  /* So an acceptance test can never again be about the wrong engine. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const from = page.indexOf("function realtimeStrict(){");
  assert.ok(from > 0, "there is no strict mode");
  const src = page.slice(from, page.indexOf("\n}", from) + 2);
  const make = (search, stored) => {
    const store = new Map(stored !== undefined ? [["ariaVoiceStrict", stored]] : []);
    const fn = new Function("location", "localStorage", "URLSearchParams", src + "; return realtimeStrict();");
    return fn({ search }, { getItem: k => (store.has(k) ? store.get(k) : null),
                            setItem: (k,v) => store.set(k,String(v)),
                            removeItem: k => store.delete(k) }, URLSearchParams);
  };
  assert.equal(make(""), false, "strict mode is on for ordinary shoppers");
  assert.equal(make("?voz=estricto"), true, "?voz=estricto does not turn it on");
  assert.equal(make("", "1"), true, "strict mode is not remembered");
  assert.equal(make("?voz=vivo", "1"), false, "?voz=vivo does not clear strict mode");
  /* And the refusal path must return before the classic loop runs. */
  const toggle = page.slice(page.indexOf("async function toggleAriaVoice()"));
  const body = toggle.slice(0, toggle.indexOf("\n}\n"));
  /* Asserted as the actual branch: an earlier version checked only
     that the string appeared before toggleContinuousMode, which a
     mutation to `if (false)` passed by deleting the string. */
  assert.match(body, /if \(realtimeStrict\(\)\)\{/, "the refusal is not guarded by strict mode");
  assert.match(body, /Voz en vivo no disponible: /, "strict mode does not say why");
  /* …and it must return before the old loop is reached. Brace-matched
     rather than compared against the first "}", which belonged to the
     `{ speak: false }` object literal inside the block. */
  const at = body.indexOf("if (realtimeStrict()){");
  let depth = 0, close = -1;
  for (let k = body.indexOf("{", at); k < body.length; k++){
    if (body[k] === "{") depth++;
    else if (body[k] === "}" && --depth === 0){ close = k; break; }
  }
  assert.ok(close > at, "the strict-mode block is unbalanced");
  const refusal = body.slice(at, close);
  assert.match(refusal, /\breturn;/, "strict mode falls through into the old loop anyway");
  assert.ok(body.indexOf("if (realtimeStrict()){") < body.indexOf("toggleContinuousMode();"),
    "strict mode is checked after the old loop has already started");
});

check("the browser never receives the standing API key", () => {
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.ok(!page.includes("OPENAI_API_KEY"), "index.html references OPENAI_API_KEY");
  assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(page), "index.html contains something key-shaped");
  const mint = readFileSync(ROOT + "netlify/functions/aria-realtime-session.js", "utf8");
  assert.match(mint, /process\.env\.OPENAI_API_KEY/, "the minting endpoint does not read the key");
  /* …and it hands back only the ephemeral secret. */
  assert.match(mint, /token,/, "the endpoint does not return an ephemeral token");
  assert.ok(!/body: JSON\.stringify\(\{[^}]*OPENAI_API_KEY/.test(mint), "the key is echoed to the client");
  assert.match(mint, /Cache-Control": "no-store/, "a credential response is cacheable");
});

/* ============================================================ */
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length){ for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
