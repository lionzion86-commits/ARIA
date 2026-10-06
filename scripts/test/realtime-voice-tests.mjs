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
import { STORE_KNOWLEDGE as K_STORES } from "../../netlify/functions/_store-knowledge.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
let passed = 0; const failures = [];
const group = (n) => console.log(`\n  ${n}`);
const check = (n, fn) => { try { fn(); passed++; console.log(`    ok   ${n}`); }
  catch (e){ failures.push(`${n}\n         ${e.message}`); console.log(`    FAIL ${n}\n         ${e.message}`); } };
/* The mint tests drive the real handler against a stubbed fetch, so
   they have to be awaited. Same bookkeeping, async. */
const checkAsync = async (n, fn) => { try { await fn(); passed++; console.log(`    ok   ${n}`); }
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
    ["calculate_total_delivered_price", "get_cart_items", "get_cart_total",
     "get_order_status", "get_product_details", "get_sale_scoop", "get_store_info",
     "get_top_sales", "recommend_stores_for", "search_products"]);

  /* AND THE BACKEND IS CHECKED, not just the list. The list above
     says which tools we meant to ship; this says each one actually
     resolves somewhere — in the page's executor or in the function's
     switch. A tool declared with nothing behind it answers `undefined`
     and the model narrates that as fact. */
  const pageSrc = readFileSync(ROOT + "index.html", "utf8");
  const fnSrc = readFileSync(ROOT + "netlify/functions/aria-realtime-tool.js", "utf8");
  for (const name of REALTIME_TOOL_NAMES){
    const inPage = pageSrc.includes(`name === '${name}'`);
    const inFn = fnSrc.includes(`case "${name}":`);
    assert.ok(inPage || inFn, `${name} is offered to the model and handled nowhere`);
  }
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
  /* THE FALLBACK THIS ONCE ASSERTED IS GONE (2026-10-06, Danny: "No
     fallback. No kill switch. No way to revert."). It used to require
     that a failed start reached toggleContinuousMode(); requiring
     that now would be requiring the bug he reported — he tested the
     preview, got the old Lily voice, and the fallback was what hid
     the real failure. A failed start must stop at the error. */
  assert.match(page, /if \(await startRealtimeVoice\(\)\) return;[\s\S]{0,1600}showRealtimeError\(\);/,
    "a failed realtime start does not stop at the visible error");
  /* BRACE-MATCHED. "\n}\n" never matches in a CRLF file, so the slice
     ran past the end of the function and into the old loop's own
     definition — which of course mentions it. */
  const tAt = page.indexOf("async function toggleAriaVoice()");
  let td = 0, tEnd = -1;
  for (let k = page.indexOf("{", tAt); k < page.length; k++){
    if (page[k] === "{") td++;
    else if (page[k] === "}" && --td === 0){ tEnd = k; break; }
  }
  assert.ok(tEnd > tAt, "toggleAriaVoice is unbalanced");
  assert.ok(!/toggleContinuousMode\(\)/.test(page.slice(tAt, tEnd)),
    "the old loop is still reachable from the mic button");
});

check("there is no switch, no flag and no way back to the old voice", () => {
  /* THIS TEST USED TO RUN realtimeEnabled() AGAINST A STUBBED
     location AND localStorage, because a mutation replacing its body
     with `return true` had passed a grep-based version.

     The function is gone (2026-10-06, Danny: "DELETE the
     realtimeEnabled() function entirely... No fallback. No kill
     switch. No way to revert."), so there is nothing left to run. An
     earlier pass had reduced it to `return true`, which is worse than
     either: a switch that lies, with every call site still reading as
     though a choice existed.

     What the test asserts now is the absence itself — and absence is
     exactly what rots quietly, so it is checked by name. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.ok(!/function realtimeEnabled\s*\(/.test(page),
    "realtimeEnabled() is back in index.html");
  /* COMMENTS STRIPPED FIRST. The rule is that nothing CALLS it, not
     that nobody may name it: the tombstone comment explaining why it
     went deserves to say which function it is talking about. */
  const noComments = page
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  assert.ok(!/realtimeEnabled\(\)/.test(noComments),
    "something still calls realtimeEnabled()");
  assert.ok(!/const ARIA_RT_FLAG\s*=/.test(page),
    "the localStorage kill-switch flag is back");
  assert.ok(!/localStorage[^\n]*ariaLiveVoice/.test(page),
    "something still reads the old kill-switch value out of localStorage");

  /* The two ?voz flags that remain are about AUDIO PROCESSING, not
     about which engine runs — ?voz=crudo hands the raw microphone to
     OpenAI, ?voz=limpio puts the browser's own filter back. Those stay
     useful. What must not come back is a flag that selects an engine. */
  const engineFlags = page.match(/voz'\)\s*===\s*'(vivo|clasica)'/g) || [];
  assert.equal(engineFlags.length, 0,
    `an engine-selecting ?voz flag is back: ${engineFlags.join(", ")}`);

  /* And the one remaining classic-voice predicate must be false
     always, or the old speak paths wake up again. */
  const at = page.indexOf("function ariaClassicVoiceOnly(){");
  assert.ok(at > 0, "ariaClassicVoiceOnly is gone — check its five call sites");
  const body = page.slice(at, page.indexOf("}", at) + 1);
  const fn = new Function(body + "; return ariaClassicVoiceOnly();");
  assert.equal(fn(), false, "the classic voice can still own a turn");
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
  assert.match(page, /action === 'playAudio'\)\{[\s\S]{0,80}sink\.open\(\);[\s\S]{0,60}setRealtimeState\('speaking'\);/,
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
  /* coral, not marin (2026-10-06): marin is the most polished voice
     and polished was the complaint — it read as a composed
     professional rather than the warm Peruvian friend Lily was.
     Pinned so it cannot drift back silently; ARIA_REALTIME_VOICE
     changes it without a deploy. */
  assert.equal(session.audio.output.voice, "coral", "the voice changed without a decision");
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
  assert.match(mint, /post\(`\$\{REALTIME_API_BASE\}\/client_secrets`/,
    "the current endpoint is gone");
  assert.match(mint, /post\(`\$\{REALTIME_API_BASE\}\/sessions`/,
    "there is no fallback to the endpoint the brief names");
  /* Only a wrong path answers 404/405; falling back on anything else
     would retry a real failure against a second endpoint and double
     the latency of every outage. */
  assert.match(mint, /res\.status === 404 \|\| res\.status === 405/,
    "the fallback triggers on the wrong condition");
  /* The two endpoints disagree about shape, both ways. */
  /* Shapes differ per endpoint; the behaviour is covered by the
     stubbed-mint tests below, so this only pins the two call sites. */
  assert.match(mint, /\{ session: payload \}/, "the modern call lost its wrapper");
  assert.match(mint, /\/sessions`, payload\)/, "the legacy call is wrapped and will 400");
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
  /* Every `return false` inside the start path must carry a reason —
     excluding the send() helper, whose false IS its report ("this
     event did not go out") rather than a bail-out. */
  const sendAt = body.indexOf("const send = (obj) => {");
  let sd = 0, sendEnd = sendAt;
  for (let k = body.indexOf("{", sendAt); k < body.length; k++){
    if (body[k] === "{") sd++;
    else if (body[k] === "}" && --sd === 0){ sendEnd = k; break; }
  }
  const withoutSend = body.slice(0, sendAt) + body.slice(sendEnd);
  const bare = withoutSend.split(/\n/).filter(l => /^\s*return false;/.test(l));
  assert.equal(bare.length, 0, `${bare.length} silent bail-out(s) left in startRealtimeVoice`);
  assert.ok((body.match(/noteRealtimeFailure\(/g) || []).length >= 5,
    "not every failure path records a reason");
  /* The endpoint names the missing variable and the page passes that
     text straight through rather than flattening it to a vaguer
     sentence of its own. */
  const mintSrc = readFileSync(ROOT + "netlify/functions/aria-realtime-session.js", "utf8");
  assert.match(mintSrc, /error: "OPENAI_API_KEY not configured"/, "a missing API key is not named");
  assert.match(mintSrc, /statusCode: 500/, "a missing API key does not fail loudly");
  /* Asserted as the assignment, not just the fallback expression:
     `const said = null` left the `said || (...)` line intact and
     passed an earlier version of this. */
  assert.match(body, /const said = body && \(body\.detail \|\| body\.error\);/,
    "the page does not read the server's own message");
  assert.match(body, /said \|\| \('el servidor respondió ' \+ res\.status\)/,
    "the page invents its own message instead of showing the server's");
  /* The shopper is told which engine they got — and it must be
     rendered by the function that owns the line, not set alongside it.
     The first version set the text in the fallback path, where
     setAssistantMicState overwrote it a moment later and the browser
     check caught what the grep could not. */
  /* NOTHING SELECTS THE OLD LOOP ANY MORE, so there is no longer a
     labelled fallback to assert. ariaRTFellBack and the pill text it
     drives stay in place: the flag is now only ever false, and the
     label is the thing that would have to be right if a fallback ever
     came back. Asserting that the flag is never SET is the live rule. */
  const setsFellBack = (page.match(/ariaRTFellBack = true/g) || []);
  assert.equal(setsFellBack.length, 0,
    "something falls back to the old loop and labels it — there is no fallback now");
  const pill = page.slice(page.indexOf("THE LISTENING PILL"));
  assert.match(pill.slice(0, 1400), /ariaRTFellBack\)[\s\S]{0,120}modo clásico/,
    "the listening pill does not say which engine is running");
  /* And one call answers it from a phone console. */
  assert.match(page, /window\.ariaVoiceDiag = ariaVoiceDiag/, "there is no diagnostic to call");
  /* …and it must distinguish "the old loop is running" from "nothing
     is running", which are different answers to the only question
     this diagnostic exists for. */
  const diag = page.slice(page.indexOf("function ariaVoiceDiag(){"));
  const diagBody = diag.slice(0, diag.indexOf("\n}"));
  assert.match(diagBody, /ariaRTFellBack \? 'clásico \(voz a texto\)'/,
    "the diagnostic cannot tell the old loop from no engine at all");
  assert.match(diagBody, /ariaRTFailure \? 'ninguno/, "a failed start is reported as a working engine");
});

check("echo cancellation stays pinned on", () => {
  /* Without it her own voice re-enters the microphone, the server's
     VAD calls that "the shopper is talking", and she interrupts
     herself. The car flags must never be able to switch it off. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const i = page.indexOf("mic = await navigator.mediaDevices.getUserMedia(");
  /* Wide enough for the whole constraints object plus its comments;
     a 900-char window silently cut the last line off. */
  const block = page.slice(i, i + 1600);
  assert.match(block, /echoCancellation: true/, "echo cancellation is not pinned on");
  assert.ok(!/echoCancellation: !/.test(block), "echo cancellation was made conditional");
  /* …while the two that fight the server's own processing can go. */
  /* Off by default now: stacked on the server's own reduction it
     clips the quiet end of a sentence, and these shoppers talk from
     cars. ?voz=limpio puts it back for a comparison. */
  assert.match(block, /noiseSuppression: realtimeRawAudio\(\) \? false : !!realtimeCleanAudio\(\)/,
    "noise suppression is not off by default and tunable");
  assert.match(block, /sampleRate: 24000/, "the native sample rate is not requested");
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
  const stopFn = page.slice(page.indexOf("function stopRealtimeVoice("));
  assert.match(stopFn.slice(0, 400), /mic\.getTracks\(\)\.forEach\(t => t\.stop\(\)\)/,
    "ending the call no longer releases the microphone");
  /* Disabling belongs to mute, and to nothing else. */
  const mute = page.slice(page.indexOf("function toggleRealtimeMute()"));
  assert.match(mute.slice(0, 700), /t\.enabled = !muted/, "mute no longer owns the enabled flag");
});

check("there is no automatic fallback to the old loop, at all", () => {
  /* STRONGER THAN THE OLD STRICT MODE, WHICH THIS REPLACES. A broken
     live path and a working old one are indistinguishable when the
     second one just starts; four rounds of iPhone testing reported
     "the same thing as before" for exactly that reason. The old loop
     is still there and still works — only a person can choose it. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  /* BRACE-MATCHED: "\n}\n" never matches in a CRLF file. */
  const tAt2 = page.indexOf("async function toggleAriaVoice()");
  let td2 = 0, tEnd2 = -1;
  for (let k = page.indexOf("{", tAt2); k < page.length; k++){
    if (page[k] === "{") td2++;
    else if (page[k] === "}" && --td2 === 0){ tEnd2 = k; break; }
  }
  assert.ok(tEnd2 > tAt2, "toggleAriaVoice is unbalanced");
  const body = page.slice(tAt2, tEnd2 + 1);

  /* Failing to start must END at the visible error. It used to need a
     `return;` after it because code followed; the fallback that
     followed is gone, so the error is now the last thing in the
     function — which is the stronger shape, not a weaker one. */
  assert.match(body, /showRealtimeError\(\);[\s\r\n]*\}$/,
    "a failed live start does not end at the visible error");
  /* THERE IS NO BRANCH LEFT TO SLICE. This used to find
     `if (realtimeEnabled()){`, check that nothing inside it reached
     the old loop, and then check that the old loop WAS still
     reachable after it for someone who asked by URL. Both halves are
     obsolete: the switch is deleted and the deliberate route with it.

     The whole function is the live path now, so the whole function is
     what must not mention the old loop. */
  assert.ok(!/toggleContinuousMode\(\)/.test(body),
    "the old loop is still reachable from the mic button");

  /* The error is visible, says why, and offers a retry. */
  assert.match(page, /function showRealtimeError\(\)/, "there is no visible error");
  assert.match(page, /Voz en vivo no disponible: ' \+ why/, "the error does not say what failed");
  assert.match(page, /id="assistantRetryBtn"[^>]*onclick="retryRealtimeVoice\(\)"/,
    "there is no way to try again");
  assert.match(page, /Intentar de nuevo/, "the retry button has no label");
  /* …and the error state must actually reveal it. Checking the markup
     alone passed a mutation that left it hidden forever. */
  const err = page.slice(page.indexOf("function showRealtimeError(){"));
  const errBody = err.slice(0, err.indexOf("\n}"));
  assert.match(errBody, /if \(retry\) retry\.hidden = false;/, "the retry button is never shown");
  assert.match(errBody, /if \(mute\) mute\.hidden = true;/,
    "a mute button is offered for a call that is not open");
  assert.match(errBody, /if \(bar\) bar\.hidden = false;/, "the error bar is never shown");
  /* A retry that fails must land back on the error, not in silence. */
  const retry = page.slice(page.indexOf("async function retryRealtimeVoice()"));
  assert.match(retry.slice(0, 400), /if \(!ok\) showRealtimeError\(\);/,
    "a failed retry goes quiet");
});

check("one endpoint, under the name the spec curls", () => {
  /* Four rounds were spent on "does the endpoint exist?", and the
     answer depended on which URL you asked: the function was healthy
     under its .netlify name while /api/realtime-token 404'd. Same
     handler, both names, nothing to drift. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const toml = readFileSync(ROOT + "netlify.toml", "utf8");
  const alias = readFileSync(ROOT + "netlify/functions/realtime-token.js", "utf8");
  assert.match(page, /const REALTIME_TOKEN_URL = '\/api\/realtime-token'/,
    "the page does not call the path the spec curls");
  assert.match(page, /fetch\(REALTIME_TOKEN_URL, \{/, "the page still hardcodes its own endpoint");
  assert.match(toml, /from = "\/api\/realtime-token"/, "nothing serves /api/realtime-token");
  assert.match(toml, /to = "\/\.netlify\/functions\/realtime-token"/, "the redirect points nowhere");
  /* An alias, not a second implementation. */
  assert.match(alias, /export \{ handler \} from "\.\/aria-realtime-session\.js"/,
    "the alias is a second implementation that can drift");
});

/* ------------------------------------------------------------------
   THE MINT, DRIVEN AGAINST A STUBBED OPENAI.

   Everything above tests the shape of what we send. These run the real
   handler against each way OpenAI can say no, because a 502 that does
   not say WHY is how four rounds of testing got spent on guesses.
   ------------------------------------------------------------------ */
async function mintAgainst(responder){
  const realFetch = globalThis.fetch;
  const realKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), payload: JSON.parse(opts.body) });
    return responder(calls.length, JSON.parse(opts.body), String(url));
  };
  /* The handler logs every failed ladder, which is right in
     production and unreadable in a test run. */
  const quiet = { error: console.error, warn: console.warn, info: console.info };
  console.error = console.warn = console.info = () => {};
  try {
    /* Fresh import each time: the handler reads the key at call time,
       but the cache busting keeps one test's stub out of the next. */
    const mod = await import(ROOT + "netlify/functions/aria-realtime-session.js?t=" + Math.random());
    const res = await mod.handler({ httpMethod: "POST", body: "{}" });
    return { res, body: JSON.parse(res.body), calls };
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(console, quiet);
    if (realKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = realKey;
  }
}
const jsonRes = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

await checkAsync("a bad key is named, and not retried four times", async () => {
  const { res, body, calls } = await mintAgainst(() =>
    jsonRes(401, { error: { message: "Incorrect API key provided", code: "invalid_api_key" } }));
  assert.equal(res.statusCode, 502);
  assert.match(body.detail, /API key invalid/, "a 401 is not named as a bad key");
  /* Sending less cannot fix a bad key; hammering OpenAI four times is
     both useless and rude. */
  assert.equal(calls.length, 1, `a 401 was retried ${calls.length} times`);
});

await checkAsync("an account without Realtime access is named", async () => {
  const { res, body, calls } = await mintAgainst(() =>
    jsonRes(403, { error: { message: "Project does not have access to model gpt-realtime" } }));
  assert.equal(res.statusCode, 502);
  assert.match(body.detail, /no access to the Realtime API/, "a 403 is not named");
  assert.equal(calls.length, 1, "a 403 was retried");
});

await checkAsync("one rejected field does not lose the whole call", async () => {
  /* The failure mode this is built for: an account whose API version
     does not know one optional tuning field. Shedding it beats
     failing, and the log says which one went. */
  const { res, body, calls } = await mintAgainst((n, payload) => {
    if (payload.session?.audio?.input?.noise_reduction) {
      return jsonRes(400, { error: { message: "Unknown parameter", param: "session.audio.input.noise_reduction" } });
    }
    return jsonRes(200, { value: "ek_ok", expires_at: 1 });
  });
  assert.equal(res.statusCode, 200, "an optional field took the whole session down");
  assert.equal(body.token, "ek_ok");
  assert.equal(calls.length, 2, "the ladder did not stop at the first variant that worked");
  /* The parts that carry meaning survive every rung. */
  const last = calls[calls.length - 1].payload.session;
  assert.ok(last.instructions && last.instructions.length > 100, "the instructions were shed");
  /* AGAINST THE REAL LIST, not a literal. This read `=== 7` and
     broke the day a tool was added, which says nothing about whether
     the ladder sheds tools — the thing it is here to catch. */
  assert.ok(Array.isArray(last.tools) && last.tools.length === REALTIME_TOOLS.length,
    "the tools were shed");
  assert.equal(last.audio.input.turn_detection.type, "semantic_vad", "turn detection was shed");
  assert.equal(last.audio.output.voice, "coral", "the voice was shed");
});

await checkAsync("even the smallest session keeps what makes her Aria", async () => {
  /* Drives the ladder to its last rung by refusing everything until
     the minimal variant arrives. Shedding tuning is the point;
     shedding her instructions, her tools or her turn detection would
     hand back a generic voice bot that cannot search or be
     interrupted — worse than an honest failure. */
  let minimal = null;
  const { res, body, calls } = await mintAgainst((n, payload) => {
    const sess = payload.session;
    /* Refuses every optional field in turn, including the response
       cap, which is the one that separates the third rung from the
       fourth. */
    const optional = sess.audio?.input?.noise_reduction || sess.audio?.output?.speed
      || sess.audio?.input?.transcription || sess.max_response_output_tokens;
    if (optional) return jsonRes(400, { error: { message: "Unknown parameter" } });
    minimal = sess;
    return jsonRes(200, { value: "ek_min", expires_at: 9 });
  });
  assert.equal(res.statusCode, 200, "the ladder never reached a session OpenAI would take");
  assert.equal(body.token, "ek_min");
  assert.equal(calls.length, 4, `the ladder took ${calls.length} rungs, expected 4`);
  assert.ok(minimal, "the minimal variant was never sent");
  assert.ok(minimal.instructions && minimal.instructions.length > 1000,
    "the minimal session dropped her instructions");
  assert.equal(minimal.model, "gpt-realtime", "the minimal session dropped the model");
  assert.ok(Array.isArray(minimal.tools) && minimal.tools.length === REALTIME_TOOLS.length,
    "the minimal session dropped her tools — she could not search");
  assert.equal(minimal.tool_choice, "auto", "the minimal session dropped tool_choice");
  assert.equal(minimal.audio.input.turn_detection.type, "semantic_vad",
    "the minimal session dropped turn detection — no barge-in, no answering");
  assert.equal(minimal.audio.input.turn_detection.interrupt_response, true,
    "the minimal session cannot be interrupted");
  assert.equal(minimal.audio.output.voice, "coral", "the minimal session dropped the voice");
});

await checkAsync("a 502 says which field OpenAI refused", async () => {
  const { res, body } = await mintAgainst(() =>
    jsonRes(400, { error: { message: "Invalid value: 'gpt-realtime'", param: "session.model", code: "invalid_value" } }));
  assert.equal(res.statusCode, 502);
  /* OpenAI's own sentence, with the offending parameter, is the whole
     point: one curl instead of another round of guessing. */
  assert.match(body.detail, /Invalid value/, "the upstream message is not passed on");
  assert.match(body.detail, /session\.model/, "the offending parameter is not named");
  assert.ok(Array.isArray(body.attempts) && body.attempts.length === 4,
    "the ladder of attempts is not reported");
  for (const a of body.attempts){
    assert.ok(a.variant && a.endpoint && a.status, "an attempt is missing its detail");
  }
});

await checkAsync("the legacy endpoint is tried, and its answer accepted", async () => {
  const { res, body, calls } = await mintAgainst((n, payload, url) =>
    url.includes("client_secrets")
      ? jsonRes(404, { error: { message: "Unknown request URL" } })
      : jsonRes(200, { client_secret: { value: "ek_legacy", expires_at: 2 } }));
  assert.equal(res.statusCode, 200, "the legacy endpoint's token was not accepted");
  assert.equal(body.token, "ek_legacy", "the legacy response shape is not understood");
  /* The legacy endpoint takes the fields at the top level. */
  assert.ok(!calls[1].payload.session, "the legacy call is wrapped and will 400");
  assert.equal(calls[1].payload.model, "gpt-realtime", "the legacy call lost its model");
});

await checkAsync("a healthy mint costs exactly one call", async () => {
  const { res, body, calls } = await mintAgainst(() => jsonRes(200, { value: "ek_live", expires_at: 3 }));
  assert.equal(res.statusCode, 200);
  assert.equal(body.token, "ek_live");
  assert.equal(calls.length, 1, "a working session still made extra calls");
  assert.equal(body.model, "gpt-realtime");
  assert.ok(body.turn_detection, "the page is not told the turn detection to re-assert");
});

check("no old voice function can make a sound during a live call", () => {
  /* LIFTED AND RUN, not grepped. Each of these is pulled out of the
     page and executed twice — once with a live call and once without
     — against stubs that record every sound. Grepping for the guard
     would pass a guard placed after the audio starts. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const bodyOf = (name) => {
    const at = page.indexOf("function " + name + "(");
    assert.ok(at > 0, `${name} is gone from index.html`);
    let d = 0, end = -1;
    for (let k = page.indexOf("{", at); k < page.length; k++){
      if (page[k] === "{") d++;
      else if (page[k] === "}" && --d === 0){ end = k; break; }
    }
    return page.slice(at, end + 1);
  };

  const guard = bodyOf("ariaLiveCallActive");

  /* Every function that can reach an audio API, with the arguments it
     takes and what "settled" means for it. */
  const cases = [
    { fn: "speakText",                      args: ["hola"] },
    /* Delegates rather than speaking itself, so its delegates count
       as sound: if the guard fails it hands the job straight on. */
    { fn: "speakAssistantReply",            args: ["hola", "QUJD"], delegates: ["speakWithAria", "speakText"] },
    { fn: "speakWithAria",                  args: ["QUJD", "hola"] },
    { fn: "playTtsAudio",                   args: ["QUJD", "__done"], settles: true },
    { fn: "playMicOffCueAudio",             args: ["QUJD", "__done"] },
    { fn: "speakPipelinedSentenceFallback", args: ["__st", "hola"] },
  ];

  for (const c of cases){
    for (const live of [true, false]){
      const sounds = [];
      const env = {
        ariaRT: live ? { pc: {} } : null,
        /* Every way the page can emit sound, recording instead. */
        window: {
          speechSynthesis: { cancel(){}, speak(){ sounds.push("speechSynthesis"); } },
          SpeechSynthesisUtterance: function(){ return {}; },
        },
        ariaAudioPlayer: { set src(v){ this._s = v; }, get src(){ return this._s; },
                           play(){ sounds.push("audioElement"); return { catch(){} } }, pause(){} },
        SpeechSynthesisUtterance: function(){ return {}; },
      };
      let settled = false;
      const delegates = c.delegates || [];
      const names = [...delegates, "ariaRT","window","ariaAudioPlayer","SpeechSynthesisUtterance",
        "cleanSpokenText","closeMicForSpeak","setOrbState","afterAriaVoiceEnds","ariaVoiceTurnId",
        "micOffCueId","ariaReplyVoiceStarted","currentAriaSpeech","orbState","continuousMode",
        "reopenMicForRetry","pumpTtsAudio","ariaVoiceActive","setAssistantMicTapToTalk","__done","__st"];
      const vals = [...delegates.map(() => () => { sounds.push("delegated"); }),
        env.ariaRT, env.window, env.ariaAudioPlayer, env.SpeechSynthesisUtterance,
        (t) => t, () => {}, () => {}, () => {}, 0,
        0, false, "", "idle", false,
        () => {}, () => {}, false, () => {}, () => { settled = true; }, { playerBusy: false, settled: false }];

      const fn = new Function(...names,
        guard + "\n" + bodyOf(c.fn) + "\n return " + c.fn + ";");
      const callable = fn(...vals);
      const args = c.args.map(a => a === "__done" ? (() => { settled = true; })
                                 : a === "__st" ? vals[names.indexOf("__st")] : a);
      try { callable(...args); } catch (e) { assert.fail(`${c.fn} threw (live=${live}): ${e.message}`); }

      if (live){
        assert.equal(sounds.length, 0,
          `${c.fn} made a sound during a live call: ${sounds.join(", ")}`);
        if (c.settles) assert.ok(settled, `${c.fn} guarded but left its turn hanging`);
      } else {
        assert.ok(sounds.length > 0,
          `${c.fn} makes no sound even without a live call — the guard is too wide`);
      }
    }
  }
});

check("the mic-off cue is gone, and so is the request it used to make", () => {
  /* WHAT THIS USED TO TEST. The cue — "aprieta el micrófono" — was
     advice about a button that is about to become a hang-up, and it
     fired on chat open, before any call. The rule widened twice: not
     during a call, then not when live voice is the mode. It is now
     moot, because live voice is the ONLY mode.

     So the cue's body was unreachable: its first line returned every
     time. It was ALSO still making an HTTP request on the way out —
     the TTS endpoint had been switched off by renaming it to
     aria-tts-DISABLED-BY-DANNY, which switched it off by breaking it,
     so a dead path still cost a round trip and a 404 in the console.

     What survives is the one effect that mattered: releasing the
     speak interlock, so nothing downstream waits on a cue that is
     never coming. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("function speakMicOffCue(){");
  assert.ok(at > 0, "speakMicOffCue is gone entirely — check its callers");
  let d = 0, end = -1;
  for (let k = page.indexOf("{", at); k < page.length; k++){
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0){ end = k; break; }
  }
  const body = page.slice(at, end + 1);

  /* It must still clear the interlock, and do nothing else. */
  const run = new Function("ariaVoiceActive", "fetch", "speechSynthesis",
    "const __seen = []; " + body.replace("ariaVoiceActive = false", "__seen.push('released')") +
    "; speakMicOffCue(); return __seen;");
  const seen = run(true, () => { throw new Error("the cue made a request"); }, undefined);
  assert.deepEqual(seen, ["released"], "the cue no longer releases the speak interlock");

  /* No request, no speech, from anywhere in the body. */
  assert.ok(!/fetch\s*\(/.test(body), "the cue still makes an HTTP request");
  assert.ok(!/SpeechSynthesisUtterance/.test(body), "the cue can still speak");
  assert.ok(!/aria-tts/.test(body), "the cue still references the old TTS endpoint");

  /* AND NOTHING IN THE PAGE CALLS THE OLD ENDPOINT ANY MORE, by any
     name. Renaming it to a 404 left five callers firing requests that
     could only fail. */
  const noComments = page
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
  const ttsCalls = noComments.match(/fetch\(\s*["'][^"']*aria-tts[^"']*["']/g) || [];
  assert.equal(ttsCalls.length, 0,
    `the old TTS endpoint is still called ${ttsCalls.length} time(s): ${ttsCalls.join(", ")}`);
  assert.ok(!/DISABLED-BY-DANNY/.test(noComments),
    "an endpoint is still disabled by renaming it rather than by not calling it");
});

check("the chat opens quiet when live voice is the mode", () => {
  /* Danny, 2026-10-06: "She introduces herself, the mic is already on
     mute and she says if you need anything hit the mic button. I don't
     need her to do that." Two separate things, both from the old loop:
     the spoken greeting, and the cue it arms on its way out. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("async function greetAssistantStreaming(){");
  assert.ok(at > 0, "greetAssistantStreaming is gone");
  let d = 0, end = -1;
  for (let k = page.indexOf("{", at); k < page.length; k++){
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0){ end = k; break; }
  }
  const body = page.slice(at, end + 1);

  /* SHE SPEAKS ON OPEN AGAIN (2026-10-06). An earlier round read
     Danny's complaint about the muted mic and the "press the
     microphone" nag as a complaint about the greeting itself. It was
     not: he wants to hear her, then tap. The greeting is Lily's and
     not the live voice's on purpose — a greeting every shopper hears
     would be realtime minutes burnt before a word is said. */
  assert.match(body, /speakWithLily\(ARIA_GREETING_FALLBACK\);/,
    "she no longer greets out loud when the chat opens");
  assert.ok(!/if \(ariaClassicVoiceOnly\(\)\)\{\s*\r?\n\s*speakWithLily/.test(body),
    "the spoken greeting is gated to the classic path again");
  assert.match(body, /addAssistantMessage\('bot', ARIA_GREETING_FALLBACK, null, \{ speak: false \}\)/,
    "the written greeting was removed too — the chat would open empty");
  /* The flag that arms the cue is classic-only. */
  assert.match(body, /if \(ariaClassicVoiceOnly\(\)\) assistantReplyHasTappables = true;/,
    "the greeting still arms the mic-off cue in live-voice mode");
  /* …and the button invites a call, not dictation. */
  assert.match(body, /setAssistantMicCallReady\(\)/, "the mic button is not put into a call-ready state");
  const ready = page.slice(page.indexOf("function setAssistantMicCallReady()"));
  assert.match(ready.slice(0, 800), /aria-label', 'Llamar a Aria'/, "the call button does not say it calls");
  assert.ok(!/Toca el micrófono para hablar/.test(ready.slice(0, 800)),
    "the call-ready state reuses the old dictation wording");
});

check("there is always an audible path out of the browser", () => {
  /* THE ACTUAL CAUSE OF "she's just silent now" (2026-10-06). The sink
     built an AudioContext, routed the remote track through a
     GainNode, and muted the <audio> element so the graph was the only
     audible path. iOS hands you a SUSPENDED context and only honours
     resume() while a gesture is on the stack — and buildAudioSink runs
     after the token fetch has been awaited, so the context was both
     created outside the gesture and never resumed. Nothing was
     audible. Not the greeting: the whole call.

     Lifted and run against a context that behaves like iOS. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const srcOf = (name) => {
    const at = page.indexOf("function " + name + "(");
    assert.ok(at > 0, `${name} is gone`);
    let d = 0, end = -1;
    for (let k = page.indexOf("{", at); k < page.length; k++){
      if (page[k] === "{") d++;
      else if (page[k] === "}" && --d === 0){ end = k; break; }
    }
    return page.slice(at, end + 1);
  };

  const build = ({ canResume }) => {
    let resumes = 0;
    const ctx = {
      state: "suspended", currentTime: 0, destination: {},
      createGain(){ return { gain: { value: 1, setTargetAtTime(){} }, connect(){} }; },
      createMediaStreamSource(){ return { connect(){} }; },
      resume(){ resumes++; if (canResume) ctx.state = "running"; return Promise.resolve(); },
    };
    const el = { muted: false, autoplay: false, playsInline: false, srcObject: null,
                 play(){ return { catch(){} }; } };
    const fn = new Function("window", "Audio", "console", "ariaUnlockAudioContext",
      srcOf("buildAudioSink") + "\n return buildAudioSink;");
    const sink = fn({ AudioContext: function(){ return ctx; } }, function(){ return el; },
      { warn(){}, info(){} }, () => { ctx.resume(); return ctx; })();
    return { sink, ctx, el, resumes: () => resumes };
  };

  /* The context resumes: the graph is audible, the element steps back. */
  {
    const { sink, ctx, el, resumes } = build({ canResume: true });
    sink.attach({ id: "remote" });
    assert.ok(resumes() >= 1, "the context was never resumed");
    assert.equal(ctx.state, "running", "the context is still suspended after attach");
    assert.equal(el.muted, true, "the element duplicates the graph while the graph is running");
    assert.equal(sink.state().graphRunning, true, "the graph is not reported as running");
  }

  /* The context REFUSES to resume: the element must carry the audio,
     or the call is silent exactly as Danny found it. */
  {
    const { sink, el, ctx } = build({ canResume: false });
    const ctxOf = () => ctx;
    sink.attach({ id: "remote" });
    assert.equal(el.muted, false,
      "the context would not resume and the element stayed muted — the call is silent");
    assert.equal(sink.state().graphRunning, false, "a suspended graph is reported as running");
    /* Safari moves a context to "interrupted" on a phone call or Siri
       and back afterwards. The audible path has to follow it, not be
       decided once at setup. */
    assert.equal(typeof ctxOf().onstatechange, "function",
      "nothing re-checks the audible path when the context changes state");
    /* …and opening after a barge-in must not re-mute it. */
    sink.open();
    assert.equal(el.muted, false, "resuming the call re-muted the only audible path");
  }

  /* A barge-in silences BOTH paths — either could be the audible one. */
  {
    const { sink, el } = build({ canResume: false });
    sink.attach({ id: "remote" });
    sink.cut();
    assert.equal(el.muted, true, "the element keeps playing through a barge-in");
  }

  /* Attaching must never be able to skip the resume. */
  {
    const { sink, el, resumes } = build({ canResume: true });
    Object.defineProperty(el, "srcObject", { set(){ throw new Error("not a MediaStream"); }, get(){ return null; } });
    sink.attach({ id: "remote" });
    assert.ok(resumes() >= 1, "a failed srcObject assignment skipped the resume");
  }
});

check("the audio context is opened inside the tap, not after the fetch", () => {
  /* iOS only honours resume() while a user gesture is on the stack.
     buildAudioSink runs after `await fetch(token)`, so the context has
     to be opened earlier — from the button's own onclick. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.match(page, /onclick="unlockAudioForMobile\(\);toggleAriaVoice\(\)"/,
    "the mic button no longer unlocks audio in its own gesture");
  const unlock = page.slice(page.indexOf("function unlockAudioForMobile(){"));
  const body = unlock.slice(0, unlock.indexOf("\n}"));
  assert.match(body, /ariaUnlockAudioContext\(\);/, "the tap does not open the audio context");
  /* …and it must run before the one-shot element unlock returns early,
     because Safari re-suspends the context after an interruption. */
  assert.ok(body.indexOf("ariaUnlockAudioContext()") < body.indexOf("if (audioUnlocked) return;"),
    "the context is only unlocked on the very first tap");
  /* The sink reuses it rather than constructing its own. */
  /* Brace-matched. Searching for "\n}\n" never matches in a CRLF
     file, so an earlier version sliced 37,000 characters past the
     function and found ariaUnlockAudioContext's own `new AC()`. */
  const sinkAt = page.indexOf("function buildAudioSink(){");
  let sd = 0, sinkEnd = -1;
  for (let k = page.indexOf("{", sinkAt); k < page.length; k++){
    if (page[k] === "{") sd++;
    else if (page[k] === "}" && --sd === 0){ sinkEnd = k; break; }
  }
  const sinkBody = page.slice(sinkAt, sinkEnd + 1);
  assert.match(sinkBody, /ctx = AC \? ariaUnlockAudioContext\(\) : null/,
    "the sink builds its own context, outside the gesture");
  assert.ok(!/new AC\(\)/.test(sinkBody), "the sink still constructs an AudioContext");
});

check("a dropped call says so, but a tunnel does not end it", () => {
  /* Until now a failed peer connection left the UI showing a live call
     with an open microphone and no audio — indistinguishable from Aria
     not talking. Two things the obvious version gets wrong, both
     asserted here:
       - "disconnected" is what a tunnel or a lift looks like and
         WebRTC recovers from it, so it must NOT kill the call outright
       - "closed" after our own hang-up is not an error */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  pc.onconnectionstatechange = () => {");
  assert.ok(at > 0, "there is no connection-state monitoring");
  const body = page.slice(at, page.indexOf("\n  pc.oniceconnectionstatechange", at));

  assert.match(body, /st === 'failed'\)\{ callDropped/, "a failed connection is not reported");
  assert.match(body, /st === 'closed'\)\{ callDropped/, "a closed connection is not reported");
  /* Disconnected gets a grace period, not a death sentence. */
  assert.match(body, /st === 'disconnected' && !dropTimer/, "a transient drop kills the call");
  assert.match(body, /setTimeout\([\s\S]{0,200}CALL_DROP_GRACE_MS\)/,
    "the grace period is not a timer");
  assert.match(body, /if \(pc\.connectionState !== 'connected'\) callDropped/,
    "the call is failed even if the connection came back");
  assert.match(body, /st === 'connected'\)\{ clearDropTimer\(\); return; \}/,
    "recovering does not cancel the pending failure");

  /* The teardown order matters: release the hardware, then show the
     error, or the microphone stays hot behind a dead session. */
  const dropped = page.slice(page.indexOf("  const callDropped = (why) => {"));
  const dropBody = dropped.slice(0, dropped.indexOf("\n  };"));
  assert.match(dropBody, /if \(ariaRTClosing\) return;/,
    "ending a call pops an error panel on the way out");
  assert.ok(dropBody.indexOf("stopRealtimeVoice({ silent: true })") < dropBody.indexOf("showRealtimeError()"),
    "the error is shown before the microphone is released");
  assert.match(dropBody, /noteRealtimeFailure\('la llamada se cortó'/,
    "a dropped call does not record a reason");

  /* And hanging up has to set the flag the handler reads. */
  const stop = page.slice(page.indexOf("function stopRealtimeVoice("));
  assert.match(stop.slice(0, 400), /ariaRTClosing = true;/,
    "hanging up is indistinguishable from a dropped call");
  assert.match(stop.slice(0, 1400), /ariaRTClosing = false;/, "the closing flag is never cleared");
  /* A silent teardown must not repaint the UI the error panel owns. */
  assert.match(stop.slice(0, 1400), /if \(!opts \|\| !opts\.silent\) setRealtimeUi\(false\);/,
    "a dropped call's teardown overwrites its own error panel");
});

check("a track without a stream wrapper is still attached", () => {
  /* Some stacks deliver the track alone. Dropping that event means her
     voice arrives and is never attached to anything — silence on a
     perfectly healthy connection. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  pc.ontrack = (ev) => {");
  assert.ok(at > 0, "pc.ontrack is gone");
  /* Includes the closing brace — slicing up to it left an
     unterminated function that would not parse. */
  const body = page.slice(at, page.indexOf("\n  };", at) + 5);
  assert.match(body, /ev\.streams && ev\.streams\[0\]/, "the normal stream path is gone");
  assert.match(body, /new MediaStream\(\[ev\.track\]\)/, "a track without a stream is dropped");
  assert.match(body, /console\.warn\('\[aria\] ontrack fired with neither/,
    "an unusable ontrack event is silent");

  /* Run it both ways. */
  const attached = [];
  const fn = new Function("pc", "sink", "console", "MediaStream",
    body.replace("  pc.ontrack = (ev) => {", "  const handler = (ev) => {") + "\n return handler;");
  const handler = fn({}, { attach: (s) => attached.push(s) }, { info(){}, warn(){} },
    function(tracks){ this.tracks = tracks; return { fromTrack: true }; });
  handler({ streams: [{ id: "normal" }] });
  handler({ track: { id: "bare" } });
  handler({});
  assert.equal(attached.length, 2, "one of the two usable shapes was dropped");
  assert.equal(attached[0].id, "normal", "the stream path broke");
  assert.ok(attached[1].fromTrack, "the bare track was not wrapped into a stream");
});

check("the audio context is resumed on the retry path too", () => {
  /* The "Intentar de nuevo" button calls startRealtimeVoice() directly
     and never goes through unlockAudioForMobile(), so the gesture-time
     unlock does not happen there. A suspended context is silence. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  const sink = buildAudioSink();");
  const after = page.slice(at, at + 800);
  assert.match(after, /sink\.ctx\.state === 'suspended'\) await sink\.ctx\.resume\(\)/,
    "the context is not resumed inside startRealtimeVoice");
  assert.match(after, /console\.info\('\[aria\] AudioContext state:'/,
    "the context state is not logged, so silence cannot be diagnosed");
});

check("the greeting is locked to audio, sent once, and retried if dropped", () => {
  /* WHY IT WAS SILENT (2026-10-06). Three separate faults, each
     enough on its own:
       - no output_modalities: the model may answer in TEXT only
       - no input: []: not the documented no-context greeting shape
       - the flag was set before the send, so a greeting dropped by a
         channel that had not finished opening could never be retried
     Lifted and run, so the request is inspected as the object that
     actually goes down the wire. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("function sendRealtimeGreeting(send, left){");
  assert.ok(at > 0, "sendRealtimeGreeting is gone or changed shape");
  let d = 0, end = -1;
  for (let k = page.indexOf("{", at); k < page.length; k++){
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0){ end = k; break; }
  }
  const src = page.slice(at, end + 1)
    .replace(/if \(ariaRTGreeted\) return false;/, "if (__state.greeted) return false;")
    .replace(/ariaRTGreeted = true;/, "__state.greeted = true;")
    .replace(/if \(!ariaRTGreetRetrying\)\{/, "if (!__state.retrying){")
    .replace(/ariaRTGreetRetrying = true;/, "__state.retrying = true;")
    .replace(/ariaRTGreetRetrying = false;/, "__state.retrying = false;")
    /* Routed through __state like the greeting flag, because the
       nudge's own callback has to read whether he spoke AFTER the
       timer was armed — a captured parameter would freeze it at the
       moment of arming and the test could never flip it. */
    .replace(/ariaRTSpoke/g, "__state.spoke");

  const harness = (send) => {
    const state = { greeted: false, retrying: false, spoke: false, sent: [], scheduled: [], cues: [] };
    const fn = new Function("__state", "REALTIME_GREETING_BRIEF", "console",
      "GREETING_ATTEMPTS", "GREETING_RETRY_MS", "setTimeout", "clearTimeout",
      "ariaRT", "ariaRTOpeningTimer", "cueRealtime", "CUE_OPENING_SILENCE",
      "CALL_OPENING_SILENCE_MS",
      src + "\n return sendRealtimeGreeting;");
    const greet = fn(state, "saluda corto", { info(){}, warn(){} }, 3, 500,
      (f) => { state.scheduled.push(f); return { t: state.scheduled.length }; },
      () => {}, {}, null,
      (cue) => { state.cues.push(cue); return true; }, "[callado diez segundos]", 10000);
    return { greet: (...a) => greet((o) => { state.sent.push(o); return send(o); }, ...a), state };
  };

  /* THE HAPPY PATH, AND THE FIX ITSELF: the request carries NO
     per-response fields. Everything else on the call worked —
     conversation flowed, audio played — and the one thing that did
     not was the single response we construct ourselves. Each of
     instructions / output_modalities / input was a chance for this API
     version to reject the whole request, and a rejected
     response.create is a silent greeting inside a healthy call. What
     she says on opening is a rule in the session instructions now. */
  {
    const { greet, state } = harness(() => true);
    assert.equal(greet(), true, "the greeting was not sent");
    assert.equal(state.sent.length, 1, "the greeting was not requested exactly once");
    const req = state.sent[0];
    assert.equal(req.type, "response.create", "the greeting is not a response.create");
    assert.deepEqual(Object.keys(req), ["type"],
      `the greeting carries per-response fields again: ${Object.keys(req).join(", ")}`);
    /* …and never twice. */
    assert.equal(greet(), false, "the greeting can be requested twice");
    assert.equal(state.sent.length, 1, "a second request went out");
  }

  /* Dropped by a channel that is not open yet: retried, not lost. */
  {
    const { greet, state } = harness(() => false);
    assert.equal(greet(), false, "a dropped greeting reported success");
    assert.equal(state.greeted, false,
      "marked sent although it never left — it could never be retried");
    assert.equal(state.scheduled.length, 1, "no retry was scheduled for a dropped greeting");
    assert.equal(state.retrying, true, "the retry chain was not armed");
    assert.equal(state.sent.length, 1, "more than one attempt went out at once");
  }

  /* TWO CALLERS, ONE CHAIN. session.updated and the backstop timer
     both land here; without the guard each would start its own retry
     ladder and she would greet twice over herself. */
  {
    const { greet, state } = harness(() => false);
    greet();                       /* session.updated lands first */
    greet();                       /* the backstop timer arrives too */
    /* The flag stays set until the scheduled retry runs, which is the
       whole point — an earlier version of this test cleared it by hand
       and so defeated the guard it was checking. */
    assert.equal(state.scheduled.length, 1,
      `${state.scheduled.length} retry chains armed — she would greet over herself`);
  }

  /* Dropped, then the channel opens: the retry gets through. */
  {
    let open = false;
    const { greet, state } = harness(() => open);
    greet();
    open = true;
    state.retrying = false;
    state.scheduled[0]();             /* fire the scheduled retry */
    assert.equal(state.greeted, true, "the retry never delivered the greeting");
    assert.equal(state.sent.length, 2, "the retry did not re-send");
  }

  /* And it gives up loudly rather than retrying forever. */
  {
    const { greet, state } = harness(() => false);
    greet(0);
    assert.equal(state.scheduled.length, 0, "the last attempt still scheduled a retry");
  }
});

check("she is told to sound Peruvian and to open the call herself", () => {
  /* Danny: "I'd like for it to be Peruvian" and "more jollier".
     OpenAI Realtime has no custom voices, so Lily cannot be plugged
     in — warmth has to come from the voice choice plus instructions. */
  const i = buildRealtimeInstructions(null);
  assert.match(i, /CÓMO HABLAS/, "there is no instruction about how she sounds");
  assert.match(i, /acento peruano limeño/, "the Peruvian accent is not asked for");
  assert.match(i, /cálido y alegre/, "warmth is not asked for");
  assert.match(i, /nunca plano ni neutro/, "nothing rules out the flat neutral read");

  /* The greeting lives here now, not in a per-response field — which
     is the whole point of this round. */
  /* The call opens with a short line, NOT a second introduction —
     Lily already said hello in the chat before he tapped. */
  assert.match(i, /CÓMO ABRES LA LLAMADA/, "nothing tells her how to open the call");
  assert.match(i, /NO te vuelvas a presentar/, "she introduces herself twice");
  assert.match(i, /UNA frase corta y en voz alta/, "the opener is not one spoken line");
  assert.match(i, /Nunca "Hola, soy Aria" otra vez/, "she may repeat the written greeting aloud");
  assert.match(i, /nunca explicar el micrófono, nunca\s*\r?\n?pedirle que apriete nada/,
    "nothing stops her explaining the microphone again");
  /* …and a silence hang-up is not an apology. */
  assert.match(i, /CUANDO SE CIERRA POR SILENCIO/, "she is not told how to treat an idle hang-up");

  /* And the dead per-response constant is gone from the page. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.ok(!/const REALTIME_GREETING_BRIEF =/.test(page),
    "the per-response greeting brief is still defined — two sources of truth");
});

check("a rejected event is loud, and first audio is logged", () => {
  /* HOW THIS ROUND HAPPENED. A malformed response.create comes back as
     an `error` event or a response.done with status failed, and both
     were logged at info level next to catalogue chatter. The greeting
     was silent and nothing said why. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const handler = page.slice(page.indexOf("async function onRealtimeEvent(event, turn, send){"));
  const body = handler.slice(0, handler.indexOf("\n/* The four tools"));

  assert.match(body, /case 'error':[\s\S]{0,400}console\.error\('\[aria\] realtime error:'/,
    "a rejected event is still logged at info level");
  assert.match(body, /if \(st === 'failed'\)\{/, "a failed response is not noticed");
  assert.match(body, /console\.error\('\[aria\] the response FAILED:'/,
    "a failed response is not reported loudly");
  assert.match(body, /case 'response\.created':/, "response.created is not traced");
  assert.match(body, /case 'response\.done':/, "response.done is not traced");
  assert.match(body, /console\.info\('\[aria\] session\.updated received'\)/,
    "session.updated is not traced");
  assert.match(page, /console\.info\('\[aria\] onopen fired'\)/, "dc.onopen is not traced");

  /* And the one log that distinguishes "silent" from "never spoke". */
  assert.match(page, /ariaRTHeardAudio = true;[\s\S]{0,120}greeting audio started/,
    "nothing logs that audio actually started");
  const start = page.slice(page.indexOf("async function startRealtimeVoice()"));
  assert.match(start.slice(0, 2500), /ariaRTHeardAudio = false;/,
    "the first-audio flag is not reset per call");
});

check("the greeting is requested after the server confirms, with a backstop", () => {
  /* It used to go out in the same tick as session.update, racing the
     server's handling of it. Now session.updated triggers it, and a
     timer covers API versions that never emit that event. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const onopen = page.slice(page.indexOf("  dc.onopen = () => {"));
  const body = onopen.slice(0, onopen.indexOf("\n  };"));
  assert.ok(!/response\.create/.test(body), "the greeting still races session.update in onopen");
  assert.match(body, /setTimeout\(\(\) => sendRealtimeGreeting\(send\), \d+\);/,
    "there is no backstop if session.updated never arrives");
  /* …and the confirmation path exists. */
  const handler = page.slice(page.indexOf("async function onRealtimeEvent(event, turn, send){"));
  assert.match(handler.slice(0, 700), /case 'session\.updated':[\s\S]{0,160}sendRealtimeGreeting\(send\)/,
    "session.updated does not trigger the greeting");
  /* Reset per call, or the second call of a page load is silent.
     Asserted INSIDE startRealtimeVoice: matching the string anywhere
     also matched its own `let ariaRTGreeted = false;` declaration, so
     deleting the per-call reset passed an earlier version of this. */
  const startAt = page.indexOf("async function startRealtimeVoice()");
  const upToSession = page.slice(startAt, page.indexOf("  pc = new RTCPeerConnection()", startAt));
  assert.match(upToSession, /ariaRTGreeted = false;/,
    "the greeting flag is never reset for a new call — the second call is silent");
});

check("a dropped event is reported, not swallowed", () => {
  /* send() used to return undefined and swallow a closed channel, so a
     greeting that never left looked exactly like a model that chose
     not to speak. That is the whole reason this round happened. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  const send = (obj) => {");
  const body = page.slice(at, page.indexOf("\n  };", at));
  assert.match(body, /readyState !== 'open'/, "send no longer checks the channel is open");
  assert.match(body, /console\.warn\('\[aria\] data channel not open/, "a dropped event is silent");
  assert.match(body, /return false;/, "send does not report failure");
  assert.match(body, /return true;/, "send does not report success");
});

check("the guard covers the window while the call is still connecting", () => {
  /* FOUND BY THE BROWSER HARNESS, NOT BY READING. ariaRT is assigned
     only after the SDP handshake, but the data channel and the
     microphone exist before it — so for the length of a real
     handshake the old pipeline was still unguarded. The harness
     walked into it: closeMicForSpeak() set intentionalStop while the
     call was coming up.

     Left set after a failure this flag would mute the classic voice
     for good, so both outcomes must clear it. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.match(page, /return !!ariaRT \|\| ariaRTOpening === true;/,
    "the guard does not cover the connecting window");

  const start = page.slice(page.indexOf("async function startRealtimeVoice()"));
  const startBody = start.slice(0, start.indexOf("\n/** End the session"));
  /* Set before anything can go wrong… */
  const setAt = startBody.indexOf("ariaRTOpening = true;");
  assert.ok(setAt > 0 && setAt < startBody.indexOf("getUserMedia("),
    "the flag is set after the microphone is already being acquired");
  /* …and cleared the moment the session is real. */
  assert.match(startBody, /ariaRT = \{ pc, dc, mic, sink, send[^]{0,120}ariaRTOpening = false;/,
    "the flag is not cleared when the call goes live");

  /* Every failure path goes through noteRealtimeFailure, so that is
     where the release has to live. */
  const note = page.slice(page.indexOf("function noteRealtimeFailure("));
  assert.match(note.slice(0, 500), /ariaRTOpening = false;/,
    "a failed call leaves the classic voice muted forever");
  /* …and hanging up clears it too. */
  const stop = page.slice(page.indexOf("function stopRealtimeVoice("));
  assert.match(stop.slice(0, 1200), /ariaRTOpening = false;/, "hanging up leaves the flag set");

  /* The flag must not be reachable as a way to mute the classic voice
     when no call was ever attempted. */
  const decl = /let ariaRTOpening = false;/.test(page);
  assert.ok(decl, "ariaRTOpening is not initialised to false");
});

check("the live mic button is a hang-up, not a tap-to-talk", () => {
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("function setRealtimeUi(");
  const body = page.slice(at, page.indexOf("\n}", at));
  /* The old loop can leave the struck-through icon and a "toca para
     hablar" title on this button; a call repaints it outright. */
  assert.match(body, /if \(live\) micBtn\.innerHTML = MIC_ICON_SVG;/,
    "a live call can inherit the muted microphone icon");
  assert.match(body, /aria-label[^]{0,60}Terminar la llamada/,
    "the live button does not announce itself as a hang-up");
  assert.match(body, /'title', live \? 'Terminar la llamada con Aria'/,
    "the live button keeps a stale title");
  /* The status line never says tap-to-talk while live. */
  assert.ok(!/live[^\n]*Toca el micrófono/.test(body), "a live call shows a tap-to-talk prompt");
});

check("the stale audio handlers are detached when a call starts", () => {
  /* onended from the reply that was playing a moment ago is still
     attached to the shared element. The guards would catch it, but an
     unsubscribed handler cannot fire at all. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  /* SLICED TO THE END OF THE FUNCTION, not to a fixed 2,000
     characters. The byte-count version broke the day a block was
     added above the detach — which says nothing about whether the
     handlers are detached, the thing it is here to check. */
  const at = page.indexOf("ariaRT = { pc, dc, mic, sink, send");
  assert.ok(at > 0, "the call object is no longer built here");
  const close = page.indexOf("\n  setRealtimeUi(true);", at);
  assert.ok(close > at, "the end of the call setup moved");
  const after = page.slice(at, close);
  for (const h of ["onended", "onerror", "onplaying", "onpause"]){
    assert.ok(new RegExp(`ariaAudioPlayer\\.${h} = null`).test(after),
      `ariaAudioPlayer.${h} survives into the call`);
  }
});

check("the $200 tip is measured on the dutiable base, not the shelf price", () => {
  /* THE CORRECTION THAT MATTERS. Peru's de minimis is tested against
     what the GOODS cost — the dutiable base — and the total the
     shopper sees carries our service margin on top. Measured against
     the real pricing functions, tax starts at a cart of about $248.50,
     not $200:

        cart $199 -> dutiable $160.48   tax-free, ~$49 of room left
        cart $230 -> dutiable $185.48   STILL tax-free
        cart $250 -> dutiable $201.61   taxed

     A script written around "$120 to $199, tell him to reach $200"
     would understate his room by about fifty dollars, go silent at
     $230 exactly when the tip is worth most, and say nothing at $250
     when he is already paying. So Aria never computes it: the tool
     hands her the answer. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  if (name === 'get_cart_total'){");
  assert.ok(at > 0, "the cart tool has no implementation");
  const body = page.slice(at, page.indexOf("\n  if (name === 'get_order_status')", at));

  /* It must read the dutiable sum, never the shelf total. */
  assert.match(body, /const t = cartTotals\(\);/, "the cart tool does not use the canonical totals");
  assert.match(body, /t\.dutiableUsd/, "the threshold is not read off the dutiable base");
  assert.match(body, /dutiable > IMPORT_TAX_THRESHOLD_USD/,
    "the threshold is tested against the wrong number");
  assert.ok(!/t\.priceUsd > IMPORT_TAX_THRESHOLD_USD/.test(body),
    "the threshold is tested against the shelf price — that is the bug this exists to avoid");

  /* Run it, against the real numbers. The flag lives outside the
     snippet so a caller can ask twice with the same state — the only
     way to catch the flag never being SET. */
  const session = (alreadyTold, alreadySplitTold) => {
    let told = !!alreadyTold;
    let splitTold = !!alreadySplitTold;
    return (lines) => {
    const fn = new Function("cartTotals", "cart", "IMPORT_TAX_THRESHOLD_USD", "SALES_TAX_RATE",
      "__told", "__setTold", "__splitTold", "__setSplitTold", "name",
      body.replace(/ariaRTThresholdTold = true;/, "__setTold();")
          .replace(/!ariaRTThresholdTold/, "!__told()")
          .replace(/ariaRTSplitTold = true;/, "__setSplitTold();")
          .replace(/!ariaRTSplitTold/, "!__splitTold()")
      + "\n return null;");
    const dutiable = lines.reduce((a, l) => a + l.dutiable * (l.qty || 1), 0);
    const price = lines.reduce((a, l) => a + l.price * (l.qty || 1), 0);
      return fn(() => ({ priceUsd: price, dutiableUsd: dutiable, weightKg: 1 }),
        lines, 200, 1.07, () => told, () => { told = true; },
        () => splitTold, () => { splitTold = true; }, "get_cart_total");
    };
  };
  const run = (lines, alreadyTold) => session(alreadyTold)(lines);

  /* $199 on the shelf is $160 dutiable: tax-free, with real room. */
  const mid = run([{ price: 199, dutiable: 160.48, qty: 1 }], false);
  assert.equal(mid.import_tax_applies, false, "a $199 cart was reported as taxed");
  assert.ok(mid.tax_free_headroom_usd >= 40 && mid.tax_free_headroom_usd <= 49,
    `headroom at a $199 cart came out ${mid.tax_free_headroom_usd}, expected about 45`);
  assert.ok(mid.threshold_hint, "the tip was withheld when it was worth giving");
  assert.match(mid.threshold_hint, /UNA vez/, "the tip does not say to say it once");

  /* $230 on the shelf is $185 dutiable: STILL tax-free. The brief's
     script would have gone quiet here. */
  const high = run([{ price: 230, dutiable: 185.48, qty: 1 }], false);
  assert.equal(high.import_tax_applies, false, "a $230 cart was wrongly reported as taxed");
  assert.ok(high.threshold_hint, "the tip was withheld at $230, where it is worth most");

  /* $250 on the shelf is $201 dutiable: taxed, and silence is right. */
  const over = run([{ price: 250, dutiable: 201.61, qty: 1 }], false);
  assert.equal(over.import_tax_applies, true, "a taxed cart was reported as tax-free");
  assert.equal(over.tax_free_headroom_usd, 0, "a taxed cart was offered headroom");
  assert.equal(over.threshold_hint, null, "she was told to pitch the threshold after it passed");
  assert.match(over.explanation, /Ya le aplican/, "a taxed cart is not explained");

  /* ONCE PER CALL, ENFORCED BY THE TOOL. "Only mention this once" is
     not a promise a model keeps over a ten-minute call. */
  /* Asked twice against ONE session, so the flag must be set by the
     first call — passing a pre-set flag only proves it is read. */
  const ask = session(false);
  const first = ask([{ price: 199, dutiable: 160.48, qty: 1 }]);
  assert.ok(first.threshold_hint, "the first ask got no tip");
  const second = ask([{ price: 199, dutiable: 160.48, qty: 1 }]);
  assert.equal(second.threshold_hint, null, "the tip is handed over twice in one call");
  assert.equal(second.import_tax_applies, false, "the facts stopped being reported too");

  /* …and the flag is cleared for the next call, or only the first
     call of a page load ever pitches. */
  const startAt = page.indexOf("async function startRealtimeVoice()");
  assert.match(page.slice(startAt, startAt + 2600), /ariaRTThresholdTold = false;/,
    "the tip flag is never reset, so only the first call of a page load pitches");

  /* An empty cart has nothing to pitch. */
  const empty = run([], false);
  assert.equal(empty.threshold_hint, null, "she pitches the threshold at an empty cart");
  /* …and neither does a cart with almost no room left. */
  const sliver = run([{ price: 245, dutiable: 198, qty: 1 }], false);
  assert.equal(sliver.threshold_hint, null, "she pitches $2 of headroom");

  /* The margin is never in the payload. */
  for (const r of [mid, high, over]){
    const json = JSON.stringify(r);
    assert.ok(!/margin|markup|0\.24|dutiable_usd/.test(json),
      `the cart payload leaks our cost structure: ${json}`);
  }
});

check("the sales rules forbid the three things that would cost trust", () => {
  const i = buildRealtimeInstructions(null);
  /* Never her own arithmetic — the whole reason get_cart_total exists. */
  assert.match(i, /get_cart_total/, "she is not told to ask for the cart");
  assert.match(i, /NUNCA lo\s*\r?\n?calcules tú/, "she may work the threshold out herself");
  assert.match(i, /se mide sobre lo que cuesta la mercadería, no/,
    "nothing tells her the threshold is not the on-screen total");
  /* One suggestion, dropped when declined. */
  assert.match(i, /Uno por producto, nunca una lista/, "complements may become a list");
  assert.match(i, /dice que no, cambias de tema y no vuelves/, "she may keep pushing");
  /* Suggestions must be real. */
  assert.match(i, /búscalo con search_products/, "complements are not required to come from the catalogue");
  assert.match(i, /no lo menciones: no existe para nosotros/,
    "she may suggest something not in the catalogue");
  /* And the margin stays ours. */
  assert.match(i, /NUNCA hables del margen/, "she may discuss the markup with a shopper");
  /* The instruction wording, not just the tool payload: both say once. */
  assert.match(i, /dilo UNA vez/, "the instructions no longer bound the tip to once");
  assert.match(i, /Si no te lo pasa, no saques el tema/,
    "she may raise the threshold without the tool offering it");
  assert.match(i, /Si ya le aplican, no saques el tema por tu cuenta/,
    "she may announce that tax now applies off her own bat");
  /* THE SPLIT, AND THE ONE WORD IT MUST NEVER USE. The threshold
     exists and using it is legal; coaching "evade taxes" is a
     different thing entirely, and it is Danny's name on the business. */
  /* The over-threshold line must carry the FIX in the same breath as
     the bad news — Danny: never hand him the problem on its own. */
  assert.match(i, /PASÓ EL UMBRAL/, "the over-threshold case has no instructions");
  assert.match(i, /pasaste los \$200, así que los impuestos/,
    "the bad news is not stated plainly");
  assert.match(i, /¿Quieres que lo dividamos/, "the fix is not offered alongside it");
  assert.match(i, /Nunca sueltes\s*\r?\n?el problema sin la salida al lado/,
    "nothing stops her delivering the bad news on its own");
  /* And the guided flow, which must read the division rather than
     invent one. */
  assert.match(i, /SI ACEPTA DIVIDIR/, "there is no guided split flow");
  assert.match(i, /Pide get_cart_items/, "the flow does not use the tool");
  assert.match(i, /NUNCA la calcules tú/, "she may work the division out herself");
  assert.match(i, /Nombra SIEMPRE los productos/, "she may say \"algunas cosas\"");
  assert.match(i, /"splittable": false/, "there is no honest answer when it cannot be split");
  assert.match(i, /NUNCA lo llames evadir impuestos/,
    "she may frame the split as evading taxes");
  assert.match(i, /ni le des asesoría\s*\r?\n?tributaria/, "she may give tax advice");
  assert.match(i, /Si no te pasó "split_hint", no ofrezcas dividir nada/,
    "she may offer a split the tool did not sanction");
});

check("a call nobody is on does not stay open", () => {
  /* THE MOST EXPENSIVE THING ON THIS BRANCH. Realtime audio bills by
     the minute in both directions, so a session left open while a
     shopper browses for half an hour is real money for nothing — and
     that is the COMMON case, because the whole point of the call is
     that she finds something and he goes to look at it.

     (Danny: "I'm scared of the minutes going on forever... if it stays
     on and they could be browsing for 30 minutes, now I got to pay a
     shit ton of money.") */
  const page = readFileSync(ROOT + "index.html", "utf8");

  /* Four independent exits, because any one can be the one that fires. */
  assert.match(page, /const CALL_IDLE_MS = \d+;/, "there is no silence timeout");
  assert.match(page, /const CALL_HIDDEN_MS = \d+;/, "a backgrounded page keeps the call open");
  assert.match(page, /const CALL_MAX_MS = /, "there is no hard cap on call length");
  assert.match(page, /function endRealtimeCallIfPanelClosed\(\)/, "closing the chat keeps the call open");

  /* The silence timer must be re-armed by speech from EITHER side, or
     it hangs up on a shopper who is listening to a long answer. */
  /* SLICED TO THE CASE'S OWN `break`, not to a fixed 300 characters.
     The window version broke the moment a comment was added inside
     the case — which says nothing about whether speech re-arms the
     timer, the thing it is here to check. */
  const speechAt = page.indexOf("case 'input_audio_buffer.speech_started':");
  assert.ok(speechAt > 0, "there is no speech_started handler");
  const speech = page.slice(speechAt, page.indexOf("break;", speechAt));
  assert.match(speech, /noteRealtimeActivity\(\);/,
    "his speech does not keep the call alive");
  /* …and the same event cancels the opening nudge, so a shopper who
     speaks is never asked about the sales as though he had not. */
  assert.match(speech, /ariaRTSpoke = true;/,
    "speaking does not mark him as having spoken");
  assert.match(speech, /clearTimeout\(ariaRTOpeningTimer\)/,
    "the opening-silence nudge survives him speaking");
  const play = page.slice(page.indexOf("else if (action === 'playAudio')"));
  assert.match(play.slice(0, 300), /noteRealtimeActivity\(\);/,
    "her own audio does not keep the call alive — it would hang up mid-answer");

  /* Closing the chat is the case that matters most, and it is wired
     into the one function that closes the panel. */
  const hide = page.slice(page.indexOf("function hideAssistant(){"));
  assert.match(hide.slice(0, 700), /endRealtimeCallIfPanelClosed\(\)/,
    "closing the chat panel leaves the call running");
  /* …and the exit itself has to fire. Checking it is CALLED passed a
     mutation that disarmed its body. */
  {
    const pa = page.indexOf("function endRealtimeCallIfPanelClosed(){");
    let pd = 0, pe = -1;
    for (let k = page.indexOf("{", pa); k < page.length; k++){
      if (page[k] === "{") pd++;
      else if (page[k] === "}" && --pd === 0){ pe = k; break; }
    }
    const src = page.slice(pa, pe + 1);
    const calls = [];
    const mk = (rt, open) => new Function("ariaRT", "assistantOpen", "endRealtimeCallIdle",
      src + "\n return endRealtimeCallIfPanelClosed;")(rt, open, (w) => calls.push(w));
    mk({ pc: {} }, false)();                 /* on a call, panel closed */
    assert.equal(calls.length, 1, "closing the panel does not end the call");
    mk({ pc: {} }, true)();                  /* on a call, panel open */
    mk(null, false)();                       /* no call */
    assert.equal(calls.length, 1, "the panel exit fires when it should not");
  }

  /* Run the exit. It must release the hardware AND tell him how to
     come back — Danny's "before she shuts herself off, she can remind
     them to hit the mike". */
  const at = page.indexOf("function endRealtimeCallIdle(why){");
  assert.ok(at > 0, "there is no idle exit");
  let d = 0, end = -1;
  for (let k = page.indexOf("{", at); k < page.length; k++){
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0){ end = k; break; }
  }
  const body = page.slice(at, end + 1);
  const seen = [];
  const mkExit = (opts) => new Function("ariaRT", "ariaRTStartedAt", "console", "stopRealtimeVoice",
    "addAssistantMessage", "speakWithLily", "CALL_BYE_LINE", "ariaRTSignedOff",
    "ariaRTHeardSignOff", "clearRealtimeIdleTimers", "cueRealtime", "ariaRTExitTimer",
    "CALL_EXIT_GRACE_MS", "setTimeout", "CUE_BYE",
    body + "\n return endRealtimeCallIdle;")(
      opts.rt, opts.started, { info(){} },
      () => seen.push("stopped"),
      (role, text) => seen.push("wrote:" + text),
      (text) => seen.push("spoke:" + text),
      "Bueno, aquí estoy — si me necesitas, toca el micrófono y seguimos. ¡Suerte con tu compra!",
      opts.signedOff, opts.heard, () => {}, () => opts.cueOk, null, 4000,
      (f) => seen.push("scheduled"), "[cue]");
  /* Reached a second time — after she has been asked to sign off —
     this is the one that actually closes the line. */
  mkExit({ rt: { pc: {} }, started: Date.now() - 60000, signedOff: true, heard: false, cueOk: true })("silencio");
  assert.ok(seen.includes("stopped"), "the idle exit does not actually end the call");
  assert.ok(seen.some(x => x.startsWith("wrote:") && /toca el micrófono/.test(x)),
    "the goodbye is not written where he can read it");
  assert.ok(seen.some(x => x.startsWith("spoke:") && /toca el micrófono/.test(x)),
    "she does not say how to get her back when the live voice stayed quiet");

  /* …and NOT twice. If the live voice already said goodbye, Lily must
     stay out of it — otherwise he hears the same line in two voices. */
  const heardIt = [];
  new Function("ariaRT", "ariaRTStartedAt", "console", "stopRealtimeVoice",
    "addAssistantMessage", "speakWithLily", "CALL_BYE_LINE", "ariaRTSignedOff",
    "ariaRTHeardSignOff", "clearRealtimeIdleTimers", "cueRealtime", "ariaRTExitTimer",
    "CALL_EXIT_GRACE_MS", "setTimeout", "CUE_BYE",
    body + "\n return endRealtimeCallIdle;")(
      { pc: {} }, Date.now(), { info(){} }, () => {}, () => {},
      () => heardIt.push("spoke"), "bye", true, true, () => {}, () => true, null, 4000,
      () => {}, "[cue]")("silencio");
  assert.equal(heardIt.length, 0,
    "Lily repeats the goodbye the live voice already said — he hears it twice");
  /* The goodbye rides the OLD voice path on purpose: the session is
     already closed, so it costs no realtime minutes. */
  assert.ok(body.indexOf("stopRealtimeVoice()") < body.indexOf("speakWithLily"),
    "the goodbye is spoken on the live session, which bills for it");

  /* A call that already ended must not end twice. */
  const before = seen.length;
  mkExit({ rt: null, started: 0, signedOff: true, heard: false, cueOk: true })("silencio");
  assert.equal(seen.length, before, "the idle exit fires on a call that is already over");

  /* THE SIGN-OFF STEP. On the first pass she is ASKED to say goodbye
     and the line is held open briefly; the timer, never her, is what
     guarantees it closes — a model that stays quiet must not keep the
     meter running. */
  const signOff = [];
  const mkFirst = (cueOk) => new Function("ariaRT", "ariaRTStartedAt", "console", "stopRealtimeVoice",
    "addAssistantMessage", "speakWithLily", "CALL_BYE_LINE", "ariaRTSignedOff",
    "ariaRTHeardSignOff", "clearRealtimeIdleTimers", "cueRealtime", "ariaRTExitTimer",
    "CALL_EXIT_GRACE_MS", "setTimeout", "CUE_BYE",
    body + "\n return endRealtimeCallIdle;")(
      { pc: {} }, Date.now() - 40000, { info(){} },
      () => signOff.push("stopped"), () => {}, () => {}, "bye",
      false, false, () => {}, () => { signOff.push("cued"); return cueOk; }, null, 4000,
      () => signOff.push("scheduled"), "[cue]");
  mkFirst(true)("silencio");
  assert.ok(signOff.includes("cued"), "she is never asked to say goodbye");
  assert.ok(signOff.includes("scheduled"), "nothing guarantees the line closes after the goodbye");
  assert.ok(!signOff.includes("stopped"), "the line closed before she could say goodbye");

  /* …and if the cue could not even be sent, it hangs up at once
     rather than waiting on a goodbye that will never come. */
  signOff.length = 0;
  mkFirst(false)("silencio");
  assert.ok(signOff.includes("stopped"), "a failed goodbye cue leaves the call running");

  /* And every timer is cleared when the call ends, or a stale one
     fires into the next call. */
  const stop = page.slice(page.indexOf("function stopRealtimeVoice("));
  assert.match(stop.slice(0, 500), /clearRealtimeIdleTimers\(\);/,
    "the timers outlive the call and will fire into the next one");
});

check("the split tip fires only where splitting actually works", () => {
  /* The saving is real: on a $250 cart about $57, on a $400 cart about
     $94, and nothing offsets it — freight is per kilo so it does not
     double, and the small-order fee only bites under S/50, which half
     of a $200+ cart never is.

     Above about $400 it STOPS working, because both halves land back
     over $200: at a $500 cart each half is $201 dutiable and the tax
     returns in full. Danny's ceiling is arithmetic, not caution. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  if (name === 'get_cart_total'){");
  const body = page.slice(at, page.indexOf("\n  if (name === 'get_order_status')", at));
  assert.match(body, /applies && !ariaRTSplitTold && cartUsd >= 200 && cartUsd <= 400/,
    "the split tip is not bounded to the range where it saves money");

  const session = () => {
    let told = false, splitTold = false;
    const fn = new Function("cartTotals", "cart", "IMPORT_TAX_THRESHOLD_USD", "SALES_TAX_RATE",
      "__told", "__setTold", "__splitTold", "__setSplitTold", "name",
      body.replace(/ariaRTThresholdTold = true;/, "__setTold();")
          .replace(/!ariaRTThresholdTold/, "!__told()")
          .replace(/ariaRTSplitTold = true;/, "__setSplitTold();")
          .replace(/!ariaRTSplitTold/, "!__splitTold()")
      + "\n return null;");
    return (price, dutiable) => fn(
      () => ({ priceUsd: price, dutiableUsd: dutiable, weightKg: 2 }),
      [{ title: "zapatillas", priceUsd: price, dutiableUsd: dutiable, qty: 1 }],
      200, 1.07, () => told, () => { told = true; },
      () => splitTold, () => { splitTold = true; }, "get_cart_total");
  };

  /* Under the threshold: nothing to split. */
  assert.equal(session()(199, 160.48).split_hint, null, "offered a split on a tax-free cart");
  /* In range: the tip, once. */
  const ask = session();
  const first = ask(250, 201.61);
  assert.ok(first.split_hint, "no split tip on a $250 cart, where it saves about $57");
  assert.match(first.split_hint, /UNA vez/, "the tip does not say to say it once");
  assert.match(first.split_hint, /Nunca lo llames evadir impuestos/,
    "the tip does not rule out framing it as evasion");
  assert.equal(ask(250, 201.61).split_hint, null, "the split tip is handed over twice in one call");
  /* At the ceiling: still in. */
  assert.ok(session()(400, 322.58).split_hint, "no split tip at the $400 ceiling");
  /* Past it: splitting no longer helps, so she stays quiet. */
  assert.equal(session()(500, 403.23).split_hint, null,
    "offered a split above $400, where both halves are still taxed");

  /* Reset per call, or only the first call of a page load ever offers
     it. Asserted inside startRealtimeVoice, since the declaration
     matches the same string. */
  const startAt = page.indexOf("async function startRealtimeVoice()");
  assert.match(page.slice(startAt, startAt + 2800), /ariaRTSplitTold = false;/,
    "the split flag is never reset, so only the first call offers it");

  /* She gets the lines she needs to propose a division — titles and
     prices only, never our cost. */
  const r = session()(250, 201.61);
  assert.ok(Array.isArray(r.lines) && r.lines.length === 1, "she cannot see what to divide");
  assert.deepEqual(Object.keys(r.lines[0]).sort(), ["price_usd", "qty", "title"]);
  assert.ok(!/dutiable|margin|markup/.test(JSON.stringify(r)),
    "the split payload leaks our cost structure");
});

check("the split is worked out in code, and an impossible one is admitted", () => {
  /* She is forbidden from doing arithmetic, so the division cannot be
     hers. Greedy largest-first into two groups, each tested on the
     DUTIABLE base — and greedy is the right algorithm here, not a
     shortcut: the shopper has to physically remove and re-add these
     items, so a division he can follow beats an optimal one he
     cannot. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  if (name === 'get_cart_items'){");
  assert.ok(at > 0, "get_cart_items has no implementation");
  const body = page.slice(at, page.indexOf("\n  if (name === 'get_order_status')", at));

  const run = (items) => {
    const fn = new Function("cart", "IMPORT_TAX_THRESHOLD_USD", "dutiableBaseUsd", "name",
      body + "\n return null;");
    return fn(items, 200, (price) => price / 1.24, "get_cart_items");
  };

  /* Five items, $250 on the shelf: two groups, both under. */
  const five = run([
    { title: "Zapatillas Nike Pegasus", priceUsd: 90, qty: 1 },
    { title: "Medias deportivas", priceUsd: 15, qty: 1 },
    { title: "Short Adidas", priceUsd: 45, qty: 1 },
    { title: "Polo Under Armour", priceUsd: 55, qty: 1 },
    { title: "Gorra New Era", priceUsd: 45, qty: 1 },
  ]);
  assert.equal(five.splittable, true, "a $250 five-item cart was called unsplittable");
  assert.equal(five.group_a.length + five.group_b.length, 5, "items went missing from the split");
  assert.ok(five.group_a.length > 0 && five.group_b.length > 0, "one group came out empty");
  /* Both groups must clear the threshold on the DUTIABLE base. */
  const dutOf = (g) => g.reduce((a, l) => a + (l.price_usd / 1.24) * l.qty, 0);
  assert.ok(dutOf(five.group_a) <= 200, `group A is over the threshold: ${dutOf(five.group_a)}`);
  assert.ok(dutOf(five.group_b) <= 200, `group B is over the threshold: ${dutOf(five.group_b)}`);
  /* She must be able to NAME them — Danny: never "algunas cosas". */
  for (const l of [...five.group_a, ...five.group_b]){
    assert.ok(l.title && l.title.length > 2, "a group member has no name to read out");
    assert.equal(typeof l.price_usd, "number", "a group member has no price");
  }
  assert.equal(five.why_not, null, "a workable split carried a refusal");
  /* …and the totals she reads are the shelf prices, the ones he sees. */
  assert.equal(five.group_a_usd + five.group_b_usd, five.cart_usd,
    "the two group totals do not add up to the cart");

  /* ONE ITEM THAT ALONE PASSES THE THRESHOLD: splitting cannot help,
     and saying so with the product named beats a bare "no". */
  const single = run([{ title: "Laptop Dell XPS", priceUsd: 310, qty: 1 }]);
  assert.equal(single.splittable, false, "a single over-threshold item was called splittable");
  assert.deepEqual(single.group_a, [], "an impossible split still proposed a group");
  assert.match(single.why_not, /Laptop Dell XPS/, "the refusal does not name the offending product");
  assert.match(single.why_not, /ya pasa el umbral/, "the refusal does not say why");

  /* THREE BIG ITEMS, NONE ON ITS OWN OVER THE LINE. No single item
     trips the "too big" check, yet no two-way split works either:
     greedy lands two in one group and that group clears the
     threshold. Refusing here is the honest answer, and checking only
     the single-item case would call it splittable. */
  const three = run([
    { title: "Laptop A", priceUsd: 235.6, qty: 1 },
    { title: "Laptop B", priceUsd: 235.6, qty: 1 },
    { title: "Laptop C", priceUsd: 235.6, qty: 1 },
  ]);
  assert.equal(three.splittable, false,
    "three items that cannot fit into two under-threshold groups were called splittable");
  assert.ok(three.why_not, "the refusal gave no reason");
  assert.deepEqual(three.group_a, [], "an impossible split still proposed a group");

  /* A cart that is already under the threshold splits trivially — the
     tool is still honest about it rather than refusing. */
  const small = run([{ title: "Medias", priceUsd: 15, qty: 1 }]);
  assert.equal(small.splittable, true, "a tiny cart was called unsplittable");

  /* Bundle-discount lines are savings, not goods, and must not be
     handed to him as something to move between orders. */
  const withDiscount = run([
    { title: "Zapatillas", priceUsd: 150, qty: 1 },
    { title: "Descuento combo", priceUsd: -20, qty: 1, lineType: 'bundle-discount' },
  ]);
  assert.equal(withDiscount.items.length, 1, "a discount line was offered as a product to move");

  /* And nothing in the payload exposes what the goods cost us. */
  assert.ok(!/dutiable/.test(JSON.stringify(five)), "the split payload leaks the dutiable base");
});

check("a check-in comes before the hang-up, once", () => {
  /* Danny's flow: 20s -> "¿Sigues ahí?", 35s -> she signs off and the
     line closes. The check-in is a check-in, not a warning: two
     words, no countdown, no UI. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.match(page, /const CALL_CHECKIN_MS = 20000;/, "there is no check-in step");
  assert.match(page, /const CALL_IDLE_MS = 35000;/, "the hang-up is not at 35 seconds");
  assert.ok(page.indexOf("CALL_CHECKIN_MS") > 0 &&
    /CALL_CHECKIN_MS[\s\S]{0,40}\n?.*CALL_IDLE_MS = 35000/.test(page),
    "the check-in is not before the hang-up");

  const at = page.indexOf("function noteRealtimeActivity(){");
  const body = page.slice(at, page.indexOf("\n}", page.indexOf("ariaRTIdleTimer = setTimeout", at)));
  /* Both timers reset together, or the check-in fires after the
     hang-up has already been scheduled from an older silence. */
  assert.match(body, /ariaRTCheckedIn = false;/, "activity does not re-arm the check-in");
  assert.match(body, /clearTimeout\(ariaRTCheckinTimer\)/, "the old check-in timer is left running");
  assert.match(body, /clearTimeout\(ariaRTIdleTimer\)/, "the old hang-up timer is left running");
  assert.match(body, /if \(!ariaRT \|\| ariaRTCheckedIn\) return;/,
    "the check-in can fire twice in one silence");
  assert.match(body, /cueRealtime\(CUE_CHECKIN\)/, "the check-in is never spoken");

  /* The cue rides proven shapes: a conversation item plus a BARE
     response.create. A per-response instructions field is what
     silenced the greeting for a day. */
  const cue = page.slice(page.indexOf("function cueRealtime(cue){"));
  const cueBody = cue.slice(0, cue.indexOf("\n}"));
  assert.match(cueBody, /type: 'conversation\.item\.create'/, "the cue is not a conversation item");
  assert.match(cueBody, /ariaRT\.send\(\{ type: 'response\.create' \}\)/,
    "the cue carries per-response fields again");
  assert.match(cueBody, /return a && b;/, "the cue does not report whether it went out");

  /* Browsing counts as activity — Danny: only when BOTH go quiet. */
  assert.match(page, /addEventListener\('click', \(\) => \{ if \(ariaRT\) noteRealtimeActivity\(\); \}/,
    "tapping a product does not keep the call alive");
  assert.match(page, /addEventListener\('scroll'/, "scrolling does not keep the call alive");
  assert.match(page, /now - ariaRTScrollAt < 2000/, "the scroll listener is not throttled");
});

await checkAsync("the scoop is relevant by construction, and never invented", async () => {
  /* RELEVANCE IS THE DESIGN, not a rule bolted on. The query is built
     from what he just said, so there is no path by which an unrelated
     sale comes back — she cannot pitch jackets to someone buying
     cleats because this never returns them.

     Lifted and run against a stub catalogue. Under checkAsync, not
     check: returning a promise from the SYNCHRONOUS harness turned
     every failed assertion into an unhandled rejection that killed
     the process before the summary printed — so twelve real catches
     reported as zero failures. Same trap as a crashed suite, new
     shape. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  if (name === 'get_sale_scoop'){");
  assert.ok(at > 0, "get_sale_scoop has no implementation");
  const body = page.slice(at, page.indexOf("\n  if (name === 'get_cart_total')", at));

  /* The harness injects SCOOP_TIMEOUT_MS, so the cap the lifted slice
     honours is the harness's, not the page's. Assert the page's own
     number here: the brief asks for an answer inside 1.5s, and a cap
     at or above that is no cap at all. */
  const capAt = page.match(/const SCOOP_TIMEOUT_MS = (\d+);/);
  assert.ok(capAt, "SCOOP_TIMEOUT_MS is gone from the page");
  assert.ok(Number(capAt[1]) <= 1500,
    `the page caps the scoop at ${capAt && capAt[1]}ms — past the 1.5s the brief asks for`);

  const item = (title, store, was, now) => ({ title, retailer: store, originalPrice: was, price: now });
  const run = async (args, pool, scooped, warm) => {
    const fn = new Function("args", "catalogSearch", "itemSaleTier", "discountPct",
      "addAssistantProductCard", "ariaRTScooped", "SCOOP_TIMEOUT_MS", "setTimeout", "Promise",
      "relatedPoolCache", "name",
      "return (async () => {" + body + "\n return null; })();");
    return fn(args,
      typeof pool === "function" ? pool : async () => ({ items: pool }),
      /* The two sale checks are DISTINCT in the real page — a tier of
         zero (not flagged, discount under the carousel threshold) is
         not the same thing as having no markdown at all. A stub that
         conflated them made both filters look redundant, so removing
         either one survived. `tier0` marks the first case. */
      (it) => (it.tier0 ? 0 : it.flagged ? 1 : (it.originalPrice > it.price ? 2 : 0)),
      (it) => Math.round((1 - it.price / it.originalPrice) * 100),
      () => {}, scooped || new Set(), 1400, setTimeout, Promise,
      warm === undefined ? [1] : warm, "get_sale_scoop");
  };

  /* ONE DEAL PER STORE, deepest first — the whole point of the
     sentence is "Macy's has 30% but Kohl's has 80%", which you cannot
     say from five Kohl's rows. */
  {
    /* Deliberately NOT in discount order: the shallowest store comes
       first, so a missing sort shows up instead of being masked by
       insertion order. */
    const pool = [
      item("Chaqueta Calvin Klein gris", "macys", 150, 105),    /* 30% */
      item("Polo Calvin Klein", "macys", 60, 48),               /* 20% */
      item("Chaqueta Calvin Klein azul", "kohls", 200, 40),      /* 80% */
      item("Chaqueta Calvin Klein negra", "kohls", 180, 54),     /* 70% */
      item("Camisa sin descuento", "target", 50, 50),            /* no markdown at all */
      /* Marked down, but not enough to count as a sale — tier 0.
         Without the tier filter this leaks out as a "deal". */
      { ...item("Gorra Calvin Klein", "walmart", 20, 19.5), tier0: true },
      /* FLAGGED AS A SALE BY THE FEED, WITH NO NUMBERS BEHIND IT —
         itemIsOnSaleFlagged gives it a tier without any markdown. The
         tier filter lets it through, so only the markdown check stops
         it, and without that she announces a "0% off" deal. */
      { ...item("Short Calvin Klein", "dickssportinggoods", 40, 40), flagged: true },
    ];
    const r = await run({ brand: "Calvin Klein", category: "chaquetas" }, pool);
    assert.equal(r.topic, "Calvin Klein chaquetas", "the topic is not what he said");
    const stores = r.deals.map(d => d.store);
    assert.deepEqual([...new Set(stores)], stores, "two deals came from the same store");
    assert.equal(r.deals[0].store, "kohls", "the deepest discount is not first");
    assert.equal(r.deals[0].discount_pct, 80, "the discount percentage is wrong");
    assert.equal(r.deals[1].store, "macys", "the second store is missing");
    /* Both prices AND the percentage, so she never computes a discount. */
    for (const d of r.deals){
      assert.ok(d.was_usd > d.now_usd, "a deal has no real markdown");
      assert.equal(typeof d.discount_pct, "number", "a deal has no percentage to read out");
      assert.ok(d.title && d.store, "a deal cannot be named");
    }
    /* Neither full-price stock nor a markdown too small to count. */
    assert.ok(!r.deals.some(d => d.store === "target"),
      "an item with no markdown at all was offered as a sale");
    assert.ok(!r.deals.some(d => d.store === "walmart"),
      "a markdown too small to count as a sale was offered as one");
    assert.ok(!r.deals.some(d => d.store === "dickssportinggoods"),
      "an item flagged as on sale with no actual markdown was offered as a deal — " +
      "she would announce a 0% discount");

    /* NO SALES MEANS SAY NOTHING. This is where an invented 80% would
       come from, so the tool says so in words. */
    const none = await run({ brand: "Nike" }, [item("Zapatilla Nike", "nike", 100, 100)]);
    assert.equal(none.deals.length, 0, "a full-price catalogue produced deals");
    assert.match(none.note, /no inventes/i, "nothing tells her not to invent one");

    /* ONCE PER TOPIC PER CALL, enforced by the tool. A friend tells
       you once; an advert tells you every time. */
    const seen = new Set();
    const first = await run({ brand: "Calvin Klein" }, pool, seen);
    assert.ok(first.deals.length > 0, "the first ask got nothing");
    const second = await run({ brand: "Calvin Klein" }, pool, seen);
    assert.equal(second.already_told, true, "the same scoop can be given twice");
    assert.equal(second.deals.length, 0, "the repeat still carried deals");
    /* …but a DIFFERENT topic is still allowed. */
    const other = await run({ category: "chimpunes" }, pool, seen);
    assert.ok(!other.already_told, "one topic blocked every other topic");

    /* Nothing to search on is a question, not a guess. */
    const empty = await run({}, pool);
    assert.match(empty.unavailable, /dime la marca o el tipo/, "an empty topic guesses");

    /* A SLOW CATALOGUE MUST NOT BE DEAD AIR. Measured on the real
       page: the FIRST catalogue-backed call takes about thirteen
       seconds, because relatedPool() loads sixty catalogues on
       demand; every call after it is under 200ms. Thirteen seconds of
       silence mid-conversation is unusable, so the call warms the
       pool at start AND this caps the wait. */
    {
      const slow = new Set();
      /* THE REAL CASE: the pool has not loaded yet. Asked, not raced
         — a Promise.race cannot interrupt the catalogue load, because
         parsing sixty files is synchronous work on the same thread
         and the timer cannot fire until it finishes. Measured at
         3.2s before this check existed; 1ms after. */
      const cold = await run({ brand: "Nike" }, [], slow, null);
      assert.match(cold.unavailable, /momentito|cargando/,
        "a cold catalogue leaves the line silent instead of saying so");
      assert.equal(slow.has("nike"), false,
        "a cold-start answer burned the topic for the rest of the call");

      /* …and the race stays as a backstop for a slow search on a warm
         pool. */
      const t0 = Date.now();
      const r2 = await run({ brand: "Nike" }, () => new Promise(res => setTimeout(res, 5000)), slow);
      const waited = Date.now() - t0;
      assert.match(r2.unavailable, /momentito|cargando/,
        "a slow search on a warm pool leaves the line silent");
      /* The CAP is the point, not just the wording: a timeout set long
         enough still answers eventually, and the answer arrives after
         the caller has given up on her. Five seconds of dead air in a
         phone call is the bug. */
      assert.ok(waited < 2000,
        `she sat silent for ${waited}ms — the wait is not capped`);
      /* …and the topic must stay un-told, so she can try again once
         the catalogue is warm. Marking it told would mean one slow
         moment costs the scoop for the whole call. */
      assert.equal(slow.has("nike"), false,
        "a timed-out scoop burned the topic for the rest of the call");
    }

    /* The call warms the catalogue so the thirteen seconds happens
       behind the greeting rather than mid-sentence. */
    assert.match(page, /relatedPool\(\)\.catch\(\(\) => \{\}\)/,
      "the catalogue is not warmed when the call starts");
    const warmAt = page.indexOf("relatedPool().catch(() => {})");
    const armAt = page.indexOf("armRealtimeIdleTimers();", page.indexOf("ariaRTStartedAt = Date.now();"));
    assert.ok(warmAt > armAt, "the warm-up blocks the call setup");

    /* Reset per call, or only the first call of a page load scoops. */
    const startAt = page.indexOf("async function startRealtimeVoice()");
    assert.match(page.slice(startAt, startAt + 6000), /ariaRTScooped = new Set\(\);/,
      "the scooped-topics set is never reset for a new call");
  }
});

check("the scoop rules keep her a friend and not an advert", () => {
  const i = buildRealtimeInstructions(null);
  assert.match(i, /ERES LA AMIGA QUE SABE DÓNDE ESTÁN LAS OFERTAS/, "the scoop has no instructions");
  assert.match(i, /pide get_sale_scoop/, "she is not told to ask the tool");
  /* Relevance, stated as the rule Danny cares most about. */
  assert.match(i, /SOLO de lo que está buscando AHORA/, "relevance is not required");
  assert.match(i, /Nunca cambias de tema para meter\s*\r?\n?una oferta/,
    "she may change the subject to fit a sale in");
  assert.match(i, /DOS frases como máximo/, "the scoop is not bounded to two sentences");
  assert.match(i, /no mencionas ninguna\. No\s*\r?\n?inventes/, "she may invent a discount");
  assert.match(i, /No los calcules ni los redondees/, "she may compute a discount herself");
  assert.match(i, /already_told/, "nothing stops her repeating the same scoop");
  assert.match(i, /Informas, no\s*\r?\n?presionas/, "she may pressure him");
  /* A BARE "WHAT'S ON SALE?" USED TO BE ANSWERED WITH A QUESTION,
     and this asserted that. The addendum reverses it: a shopper with
     no topic is the vague shopper, and asking him to narrow it down
     is the interrogation it forbids. So the rule now routes him to
     get_top_sales, and what must never happen is her inventing a
     topic to be relevant to. */
  assert.match(i, /NO le preguntes de qué/,
    "a bare \"what's on sale?\" still interrogates the vague shopper");
  assert.match(i, /get_top_sales/, "the vague shopper has no route to the sales");
});

check("the browser never receives the standing API key", () => {
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.ok(!page.includes("OPENAI_API_KEY"), "index.html references OPENAI_API_KEY");
  assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(page), "index.html contains something key-shaped");
  const mint = readFileSync(ROOT + "netlify/functions/aria-realtime-session.js", "utf8");
  assert.match(mint, /process\.env\.OPENAI_API_KEY/, "the minting endpoint does not read the key");
  /* …and it hands back only the ephemeral secret. */
  assert.match(mint, /token,/, "the endpoint does not return an ephemeral token");
  /* THE VALUE, NOT THE NAME. An earlier version of this matched the
     string "OPENAI_API_KEY" anywhere in a response body and so failed
     the moment an error message named the variable it wanted set —
     a false positive that would have pushed us back to silent errors.
     What matters is that process.env.OPENAI_API_KEY is only ever read
     into an Authorization header. */
  const uses = mint.split(/\r?\n/).filter(l => /process\.env\.OPENAI_API_KEY/.test(l));
  assert.ok(uses.length > 0, "the minting endpoint does not read the key");
  for (const line of uses){
    const ok = /Authorization: `Bearer \$\{process\.env\.OPENAI_API_KEY\}`/.test(line)
            || /if \(!process\.env\.OPENAI_API_KEY\)/.test(line);
    assert.ok(ok, `the key's value is used somewhere other than an Authorization header: ${line.trim()}`);
  }
  assert.ok(!/JSON\.stringify\([^)]*process\.env\.OPENAI_API_KEY/.test(mint),
    "the key's value reaches a response body");
  assert.match(mint, /Cache-Control": "no-store/, "a credential response is cacheable");
});


/* ============================================================
   THE STORE KNOWLEDGE BASE.

   The point of these is that the knowledge can be WRONG in a way no
   syntax check would catch: a product count copied from the brief
   instead of the catalogue, a store recommended after its catalogue
   was emptied, a specialty nobody stocks. Every one of those reads
   as a confident sentence in Aria's voice and sends a real shopper to
   an empty shelf.
   ============================================================ */

/* Counted the same way the knowledge base was built, so the test is
   a re-measurement and not a copy of the same assumption. */
function catalogueCounts(){
  const counts = new Map();
  const files = readdirSync(ROOT).filter(f =>
    f.endsWith("-catalog.json") || /^department-cache-.*\.json$/.test(f));
  for (const f of files){
    let d;
    try { d = JSON.parse(readFileSync(ROOT + f, "utf8")); } catch { continue; }
    for (const [key, r] of Object.entries((d && d.retailers) || {})){
      const depts = r && r.departments;
      if (!depts || typeof depts !== "object") continue;
      for (const dv of Object.values(depts)){
        const items = Array.isArray(dv) ? dv : (dv && dv.items);
        if (!Array.isArray(items)) continue;
        counts.set(key, (counts.get(key) || 0) + items.length);
      }
    }
  }
  return counts;
}

await checkAsync("every store Aria knows about has the catalogue she says it has", async () => {
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");
  const real = catalogueCounts();

  /* NO GHOSTS. A store with an entry and no products is the dead
     recommendation section 4 of the brief forbids. */
  for (const [key, s] of Object.entries(K.STORE_KNOWLEDGE)){
    const n = real.get(key) || 0;
    assert.ok(n > 0, `${key} has a knowledge entry and no products in any catalogue`);
    assert.equal(s.product_count, n,
      `${key} claims ${s.product_count} products, the catalogues hold ${n}`);
  }

  /* NO GAPS EITHER: a store with products and no entry is a store
     Aria cannot guide anyone to. */
  for (const [key, n] of real){
    if (n <= 0) continue;
    assert.ok(K.STORE_KNOWLEDGE[key], `${key} has ${n} products and no knowledge entry`);
  }

  /* The price band is derived, not asserted, so it must still agree
     with its own median. */
  for (const [key, s] of Object.entries(K.STORE_KNOWLEDGE)){
    assert.equal(s.price_range, K.priceBandFor(s.median_usd),
      `${key}'s band (${s.price_range}) disagrees with its median ($${s.median_usd})`);
  }

  /* And a store listed as unstocked must really have nothing: this is
     the list that stops her naming Best Buy. */
  for (const key of Object.keys(K.NOT_STOCKED)){
    assert.ok(!(real.get(key) > 0),
      `${key} is listed as not stocked but has ${real.get(key)} products`);
    assert.ok(!K.STORE_KNOWLEDGE[key], `${key} is both known and not stocked`);
  }
});

await checkAsync("a store too thin to visit is never recommended", async () => {
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");
  /* PacSun is the case the brief itself got wrong: its example entry
     put PacSun at 2,500 products as the pick for skate clothing. It
     has eighteen, so it must never be offered — and must still answer
     honestly when a shopper names it. */
  const pac = K.getStoreInfo("PacSun");
  assert.equal(pac.product_count, 18, "PacSun's count moved; re-check the recommendation floor");
  assert.equal(pac.recommendable, false, "an 18-product store is offered as a recommendation");

  const thin = Object.entries(K.STORE_KNOWLEDGE)
    .filter(([, s]) => s.product_count < K.MIN_RECOMMEND_DEPTH)
    .map(([k]) => k);
  assert.ok(thin.length > 0, "the thin-store floor is not exercised by any store");

  /* Nothing under the floor may come back from any interest, however
     well its specialties match. */
  const asks = ["ropa skate", "patinetas", "artes marciales", "jiu jitsu", "surf",
                "futbol", "maquillaje", "juguetes", "bikinis", "libros"];
  for (const ask of asks){
    const r = K.recommendStoresFor(ask, { resolved: true });
    for (const s of r.stores || []){
      assert.ok(!thin.includes(s.store),
        `"${ask}" recommended ${s.store}, which has ${K.STORE_KNOWLEDGE[s.store].product_count} products`);
    }
  }
});

await checkAsync("an interest with two answers is asked about, not guessed", async () => {
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");

  /* DANNY'S OWN EXAMPLE, verbatim. The sentence names a grandson AND
     a sport, and an earlier cut read the grandson first and answered
     with the toy aisle — Target and Walmart for a kid who skates. The
     interest has to win. */
  const r = K.recommendStoresFor("mi nieto le gusta el skate");
  assert.match(r.clarify || "", /patinetas|patinar/i,
    "the skate question was not asked — she guessed instead");
  assert.ok(!r.stores, "she listed stores before asking which kind of skate");
  const branches = Object.keys(r.branches || {});
  assert.equal(branches.length, 2, "the skate question has no two branches to resolve to");
  const names = JSON.stringify(r.branches);
  assert.match(names, /CCS/, "the real-boards branch does not reach CCS");

  /* Every branch of every ambiguous interest must resolve to stores
     that exist and are deep enough to send someone to — a question
     whose answer is an empty store is worse than no question. */
  for (const [topic, def] of Object.entries(K.AMBIGUOUS_INTERESTS)){
    assert.ok(def.ask && def.ask.includes("?"), `${topic} has no question to ask`);
    for (const [label, list] of Object.entries(def.branches)){
      const live = list.filter(k => K.STORE_KNOWLEDGE[k]
        && K.STORE_KNOWLEDGE[k].product_count >= K.MIN_RECOMMEND_DEPTH);
      assert.ok(live.length > 0, `${topic} / ${label} resolves to no stocked store`);
    }
  }

  /* A gift with no interest in it still has to go somewhere. */
  const gift = K.recommendStoresFor("un regalo para mi nieto");
  assert.ok((gift.stores || []).length > 0, "a gift for a child resolves to nothing");
});

await checkAsync("she is never sent to a store that does not stock the thing asked for", async () => {
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");

  /* THE TRAP THIS CLOSES. Val Surf is called Val Surf, sells skate
     brands, and holds exactly one piece of skate hardware. CCS is the
     deepest skate shop we have and holds five surf items. Both
     matched on the word alone, and both would have been offered. */
  const boards = K.recommendStoresFor("patinetas", { resolved: true });
  const boardStores = (boards.stores || []).map(s => s.store);
  assert.ok(boardStores.includes("ccs"), "the deepest skate shop is not offered for skateboards");
  assert.ok(!boardStores.includes("valsurf"),
    "Val Surf, with one skate item, is offered for skateboards");

  const surf = K.recommendStoresFor("tabla de surf", { resolved: true });
  const surfStores = (surf.stores || []).map(s => s.store);
  assert.ok(surfStores.includes("surfstation"), "the deepest surf shop is not offered for surfboards");
  assert.ok(!surfStores.includes("ccs"), "CCS, with five surf items, is offered for surfboards");

  /* Depth in the thing asked for decides the order, not total
     catalogue size and not the order the entries happen to sit in.

     SURF STATION vs ZUMIEZ is the witness, deliberately: Surf Station
     has 510 skate items to Zumiez's 239 and so must rank higher, and
     it is written LOWER in the file. An earlier version compared
     Zumiez with Island Water Sports, which the file order already put
     in the right order — so deleting the sort entirely still passed. */
  const ss = boardStores.indexOf("surfstation");
  const zum = boardStores.indexOf("zumiez");
  assert.ok(ss !== -1 && zum !== -1, "the skate ranking witnesses are not both offered");
  assert.ok(ss < zum,
    "a shop with 510 skate items ranks below one with 239 — the ranking ignores relevance depth");

  /* AND THE FLOOR ITSELF, asserted directly. For the terms we stock
     deeply the ranking already buries a store with five of something
     before the list is cut to four, so the floor changes no answer
     here and a test that only reads answers cannot see it at all. */
  assert.ok(K.MIN_SPECIALTY_DEPTH >= 10,
    `the relevance floor is ${K.MIN_SPECIALTY_DEPTH} — effectively off`);
  assert.equal(K.stocksEnoughFor("ccs", "surf"), false,
    "CCS, with five surf items, counts as stocking surf");
  assert.equal(K.stocksEnoughFor("valsurf", "patinetas"), false,
    "Val Surf, with one skate item, counts as stocking skateboards");
  assert.equal(K.stocksEnoughFor("ccs", "patinetas"), true,
    "the deepest skate shop does not count as stocking skateboards");
  assert.equal(K.stocksEnoughFor("macys", "vestidos"), true,
    "a store with no measured sub-count is treated as not stocking anything");
});

await checkAsync("naming a store gets the truth, including when we do not carry it", async () => {
  const K = await import(ROOT + "netlify/functions/_store-knowledge.js");

  /* A VOICE TRANSCRIPT HAS NO PUNCTUATION and no accents to spare. */
  for (const said of ["Victoria's Secret", "victoria secret", "VICTORIAS SECRET", "vs"]){
    assert.equal(K.getStoreInfo(said).store, "victoriassecret", `"${said}" did not resolve`);
  }
  for (const said of ["foot locker", "Foot Locker", "footlocker"]){
    assert.equal(K.getStoreInfo(said).store, "footlocker", `"${said}" did not resolve`);
  }

  /* THE REGISTRY LISTS STORES WE DO NOT STOCK. Best Buy, Nordstrom
     and Dyson all have a row, a logo and a tagline in the page's own
     RETAILERS registry, and zero products. Read off the registry they
     look live, and Aria would offer them. */
  for (const dead of ["Best Buy", "Nordstrom", "Dyson", "Sunglass Hut"]){
    const r = K.getStoreInfo(dead);
    assert.equal(r.not_stocked, true, `${dead} does not answer as unstocked`);
    assert.match(r.note, /no inventes|No tenemos|no ofrezcas/i,
      `${dead} is reported unstocked with nothing telling her what to say`);
    assert.ok(!r.specialties, `${dead} came back with specialties we cannot fill`);
  }

  /* Not knowing is an answer. Silence and invention are not. */
  const nope = K.getStoreInfo("Tienda que no existe");
  assert.ok(nope.unavailable, "an unknown store produced no sayable answer");
  assert.ok(!nope.name, "an unknown store came back with a name");
  assert.ok(K.getStoreInfo("").unavailable, "an empty store name produced no answer");

  /* Two stores selling the same thing need a stated difference, which
     is the brief's rule: explain, do not list. */
  const makeup = K.recommendStoresFor("maquillaje", { resolved: true });
  assert.ok((makeup.stores || []).length >= 2, "makeup resolves to fewer than two stores");
  assert.ok(makeup.difference, "two makeup stores came back with no difference between them");
  for (const s of makeup.stores) assert.ok(s.not_for, `${s.store} has nothing it is not for`);

  /* Nothing to offer is said out loud, not papered over. */
  const none = K.recommendStoresFor("refrigeradora");
  assert.equal((none.stores || []).length, 0, "a thing we do not sell produced store recommendations");
  assert.match(none.note, /no inventes/i, "nothing tells her not to invent a store");
});


await checkAsync("a shopper who taps the mic and says nothing is offered the sales", async () => {
  /* THE ADDENDUM'S THIRD CASE: "silence for 10 seconds after greeting
     — Aria says '¿Te muestro lo que está en oferta ahorita?'"

     This is NOT the twenty-second check-in. That one asks "¿sigues
     ahí?", which is the right question for a conversation that
     stalled and a useless one for a shopper who never started: he is
     there, he just does not know what to say. The addendum counts
     that silence as vagueness, and vagueness goes to the sales. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  assert.match(page, /const CALL_OPENING_SILENCE_MS = (\d+);/,
    "there is no opening-silence nudge at all");
  const ms = Number(/const CALL_OPENING_SILENCE_MS = (\d+);/.exec(page)[1]);
  assert.ok(ms <= 12000, `the nudge waits ${ms}ms — past the ten seconds the addendum asks for`);
  /* And it must be SHORTER than the check-in, or the check-in fires
     first and he gets "¿sigues ahí?" instead of an offer. */
  const checkin = Number(/const CALL_CHECKIN_MS = (\d+);/.exec(page)[1]);
  assert.ok(ms < checkin,
    `the nudge (${ms}ms) fires no sooner than the check-in (${checkin}ms) — he gets "¿sigues ahí?" instead`);

  /* The cue has to send her to the tool, and has to stop her asking
     the question that does not apply. */
  const cue = /const CUE_OPENING_SILENCE = ([\s\S]*?);\r?\n/.exec(page)[1];
  assert.match(cue, /get_top_sales/, "the nudge does not reach the sales tool");
  assert.match(cue, /No preguntes si sigue ahí/, "the nudge asks if he is still there");

  /* ARMED ON THE GREETING, not on connect: the ten seconds are his
     silence, not hers. Driven through the real function. */
  const at = page.indexOf("function sendRealtimeGreeting(send, left){");
  let d = 0, end = -1;
  for (let k = page.indexOf("{", at); k < page.length; k++){
    if (page[k] === "{") d++;
    else if (page[k] === "}" && --d === 0){ end = k; break; }
  }
  const src = page.slice(at, end + 1)
    .replace(/if \(ariaRTGreeted\) return false;/, "if (__state.greeted) return false;")
    .replace(/ariaRTGreeted = true;/, "__state.greeted = true;")
    .replace(/ariaRTGreetRetrying/g, "__state.retrying")
    .replace(/ariaRTSpoke/g, "__state.spoke");

  const drive = (sendOk) => {
    const state = { greeted: false, retrying: false, spoke: false, cues: [], timers: [] };
    const fn = new Function("__state", "console", "GREETING_ATTEMPTS", "GREETING_RETRY_MS",
      "setTimeout", "clearTimeout", "ariaRT", "ariaRTOpeningTimer", "cueRealtime",
      "CUE_OPENING_SILENCE", "CALL_OPENING_SILENCE_MS", "REALTIME_GREETING_BRIEF",
      src + "\n return sendRealtimeGreeting;");
    const greet = fn(state, { info(){}, warn(){} }, 3, 500,
      (f, delay) => { state.timers.push({ f, delay }); return { id: state.timers.length }; },
      () => {}, {}, null,
      (c) => { state.cues.push(c); return true; }, "[nudge]", 10000, "saluda");
    greet(() => sendOk);
    return state;
  };

  const ok = drive(true);
  assert.equal(ok.greeted, true, "the greeting did not go out");
  const nudge = ok.timers.find(t => t.delay === 10000);
  assert.ok(nudge, "a successful greeting armed no opening-silence nudge");

  /* He stayed quiet: she offers. */
  nudge.f();
  assert.deepEqual(ok.cues, ["[nudge]"], "ten seconds of silence produced no offer");

  /* He spoke first: she must NOT offer, or a shopper who said "busco
     zapatillas Nike" gets pitched the general sales anyway. */
  const spoke = drive(true);
  spoke.spoke = true;
  spoke.timers.find(t => t.delay === 10000).f();
  assert.deepEqual(spoke.cues, [], "she pitched the sales at a shopper who had already spoken");

  /* A greeting that never went out arms nothing — otherwise the first
     thing he hears is an offer with no hello in front of it. */
  const failed = drive(false);
  assert.equal(failed.greeted, false, "a failed send was recorded as greeted");
  assert.ok(!failed.timers.some(t => t.delay === 10000),
    "a greeting that never went out still armed the nudge");
});

await checkAsync("the vague shopper gets real deals, grouped so she can offer a choice", async () => {
  /* get_top_sales, lifted and run against a stub catalogue. The
     grouping is the point: "ropa hasta 80% en Zumiez y zapatillas 60%
     en Finish Line" is a sentence with a choice in it. A flat top-five
     would come from one store and give him nothing to pick between. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  if (name === 'get_top_sales'){");
  assert.ok(at > 0, "get_top_sales has no implementation");
  const body = page.slice(at, page.indexOf("\n  if (name === 'get_store_info'", at));

  const item = (title, store, dept, was, now) =>
    ({ title, retailer: store, departments: [dept], originalPrice: was, price: now });

  const run = async (args, pool, warm, search) => {
    const fn = new Function("args", "catalogSearch", "relatedPool", "itemSaleTier", "discountPct",
      "realtimeSaleCategory", "addAssistantProductCard", "SCOOP_TIMEOUT_MS", "setTimeout",
      "Promise", "relatedPoolCache", "name",
      "return (async () => {" + body + "\n return null; })();");
    return fn(args,
      /* The SEARCH stub is separate from the pool and returns nothing
         by default, so any answer to a rubro must have come from the
         department match rather than from a text search. */
      search || (async () => ({ items: [] })),
      async () => pool,
      (it) => (it.tier0 ? 0 : it.flagged ? 1 : (it.originalPrice > it.price ? 2 : 0)),
      (it) => Math.round((1 - it.price / it.originalPrice) * 100),
      /* `null ?? key` returns the key, which handed the nameless
         category its own name back and made the drop look broken.
         A null here means "no sayable name", so it must survive. */
      (it) => {
        const m = { clothing: "ropa", shoes: "zapatos", sale: null };
        const k = it.departments[0];
        return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : (k || null);
      },
      () => {}, 1400, setTimeout, Promise,
      warm === undefined ? [1] : warm, "get_top_sales");
  };

  /* ORDERED AGAINST THE SORT ON PURPOSE: the shallower category
     (zapatos, 60%) is listed FIRST, so insertion order and discount
     order disagree. With them in agreement, deleting the sort left
     every assertion passing. */
  const pool = [
    item("Zapatilla Nike", "finishline", "shoes", 100, 40),      /* 60% — best in zapatos */
    item("Zapatilla adidas", "footlocker", "shoes", 100, 70),    /* 30% */
    item("Polo barato", "kohls", "clothing", 20, 18),            /* 10% */
    item("Jean Empyre", "zumiez", "clothing", 100, 20),          /* 80% — best in ropa */
    item("Cosa sin rubro", "macys", "sale", 100, 10),            /* 90%, but no sayable category */
    { ...item("Gorra", "walmart", "clothing", 20, 19.5), tier0: true },
    { ...item("Short", "dicks", "clothing", 40, 40), flagged: true },
    /* A WHOLE CATEGORY OF NOTHING. Every item in `hogar` is either
       full price or flagged with no markdown behind it, so the
       category must not appear at all. Mixed into an otherwise
       healthy category these two were invisible: the real deal
       outranked them and the filters looked redundant. */
    item("Olla a precio normal", "target", "hogar", 50, 50),
    { ...item("Sartén marcada sin rebaja", "target", "hogar", 60, 60), flagged: true },
    { ...item("Taza casi igual", "target", "hogar", 20, 19.6), tier0: true },
  ];

  const r = await run({}, pool);
  assert.equal(r.categories.length, 2, "the deals did not collapse to one per category");
  assert.ok(!r.categories.some(c => c.category === "hogar"),
    "a category with nothing but full-price and falsely-flagged stock was offered as a sale");
  assert.deepEqual(r.categories.map(c => c.category), ["ropa", "zapatos"],
    "the categories are not ordered by how deep the discount is");
  assert.equal(r.categories[0].best_discount_pct, 80, "the deepest discount in a category is wrong");
  assert.equal(r.categories[0].store, "zumiez", "the store behind the best deal is wrong");
  /* Both prices AND the percentage, so she never computes one aloud. */
  for (const c of r.categories){
    assert.ok(c.was_usd > c.now_usd, "a category's deal has no real markdown");
    assert.equal(typeof c.best_discount_pct, "number", "there is no percentage to read out");
    assert.ok(c.example, "there is nothing to name as an example");
  }
  /* A department with no sayable name is dropped, not read out: "la
     categoría sale" and "Aria Beauty" are names of places on the
     site, not words a person says. */
  assert.ok(!r.categories.some(c => !c.category), "a nameless category reached her mouth");
  assert.ok(!JSON.stringify(r.categories).includes("Cosa sin rubro"),
    "an item with no sayable category was offered anyway");
  /* Neither full-price stock nor a flag with no markdown behind it. */
  assert.ok(!JSON.stringify(r.categories).includes("Gorra"),
    "a markdown too small to count as a sale was offered as one");
  assert.ok(!JSON.stringify(r.categories).includes("Short"),
    "an item flagged on sale with no markdown was offered — a 0% deal");

  /* A RUBRO IS A DEPARTMENT, NOT A SEARCH TERM. Routing "ropa"
     through catalogSearch asked for products with "ropa" in the
     title, and nothing is titled that: measured in the browser, a
     shopper who said "ropa" got "no hay ofertas fuertes" while the
     general call was finding 80% off in the same catalogue. The
     search stub here returns NOTHING, so an answer can only come
     from the department match. */
  const byDept = await run({ category: "ropa" }, pool);
  assert.equal((byDept.categories || []).length, 1,
    "asking for a rubro did not match the department it names");
  assert.equal(byDept.categories[0].category, "ropa", "the wrong department answered");
  assert.equal(byDept.categories[0].best_discount_pct, 80, "the rubro's best discount is wrong");

  /* …and a word that is NOT a rubro still works, by falling back to
     the search — she may well pass a brand. */
  const brand = await run({ category: "Nike" }, pool, undefined,
    async () => ({ items: [item("Zapatilla Nike", "finishline", "shoes", 100, 25)] }));
  assert.equal((brand.categories || []).length, 1, "a brand as a category found nothing");
  assert.equal(brand.categories[0].best_discount_pct, 75,
    "the fallback search result was not used");

  /* NOTHING ON SALE IS SAID, NOT INVENTED. */
  const none = await run({}, [item("Nada", "kohls", "clothing", 50, 50)]);
  assert.equal(none.categories.length, 0, "a full-price catalogue produced deals");
  assert.match(none.note, /no inventes/i, "nothing tells her not to invent a discount");

  /* THE COLD CATALOGUE. This tool fires in the first seconds of a
     call — exactly when the pool is least likely to be warm — so the
     same O(1) readiness check applies. A silent opening is the one
     thing worse than a vague shopper. */
  const cold = await run({}, [], null);
  assert.match(cold.unavailable, /segundito|cargando/i,
    "a cold catalogue leaves the opening silent");
  assert.ok(!cold.categories, "a cold answer carried categories anyway");
});

await checkAsync("she guides to a store before she searches, and never to an empty one", async () => {
  const i = buildRealtimeInstructions();

  /* THE MALL GUIDE. Danny: "She's a mall guide, not just a product
     search." The order is the rule — understand, ask, recommend,
     THEN search — because searching first is what makes her a search
     box with a voice. */
  assert.match(i, /CONOCES CADA TIENDA/, "she has no store knowledge at all");
  assert.match(i, /no busques productos todavía/, "she searches before she understands");
  assert.match(i, /recommend_stores_for/, "she has no route to the store recommendations");
  assert.match(i, /haz ESA pregunta tal cual/, "the clarifying question is optional");
  assert.match(i, /Explica la diferencia, no solo los nombres/,
    "she may list two stores without saying how they differ");
  assert.match(i, /NUNCA recomiendes una tienda que la herramienta no te dio/,
    "she may invent a store");
  assert.match(i, /not_stocked/, "nothing tells her what an unstocked store means");
  assert.match(i, /nunca\s*\r?\n*\s*prometas buscar ahí/,
    "she may promise to look in a store we do not carry");
  /* The grandmother case, which is the one the brief opens with. */
  assert.match(i, /abuela/, "the patient case is not described");
  assert.match(i, /sin jerga/, "she may speak jargon to someone who does not know the words");

  /* THE VAGUE SHOPPER GOES TO THE SALES. Danny: "Sales should always
     be the number one thing." */
  assert.match(i, /SI NO SABE QUÉ QUIERE/, "the vague shopper has no rule");
  assert.match(i, /get_top_sales/, "the vague shopper is never sent to the sales");
  assert.match(i, /no\s*\r?\n*\s*necesita veinte preguntas/,
    "the vague shopper gets interrogated");
  assert.match(i, /DOS o TRES categorías/, "the offer is unbounded — it becomes a catalogue");
  assert.match(i, /no inventes un 80%/, "she may invent a discount for a vague shopper");
  assert.match(i, /UNA sola pregunta/, "the follow-up is not limited to one question");
  assert.match(i, /NUNCA dejes a un comprador vago sin dirección/,
    "a vague shopper may be left with nothing");
  /* …AND THE SPECIFIC SHOPPER IS NOT REROUTED. Verification #2 of the
     addendum: "busco zapatillas Nike Air Max" must be a product
     search, not a pivot to the general sales. */
  assert.match(i, /eso NO es vago/, "a specific request may be rerouted to the general sales");
  assert.match(i, /no\s*\r?\n*\s*lo mandes a las ofertas generales/,
    "nothing stops her pitching general sales to someone who named a product");
});

check("the rubro she says out loud is a word, not a tile name", () => {
  /* The site's department labels are written for tiles: "Aria
     Beauty", "Aria Fight Club", "Seccion Hombre". Read aloud in a
     sentence about discounts they sound like she is reciting
     navigation. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("const SPOKEN_DEPARTMENT = {");
  assert.ok(at > 0, "there is no spoken-category map");
  const map = page.slice(at, page.indexOf("};", at));
  for (const [key, bad] of [["beauty", "Aria Beauty"], ["combat_sports", "Aria Fight Club"],
                            ["party", "Aria Party"], ["mens_grooming", "Seccion Hombre"]]){
    assert.match(map, new RegExp(key + ":"), `${key} still reads out as "${bad}"`);
  }
  /* Two departments have no sayable name at all and must drop out
     rather than be read: "Ofertas" inside a sales pitch says nothing,
     and Hot Topic and BoxLunch file everything under "Todo". */
  assert.match(map, /sale: null/, '"Ofertas" is offered as a category inside a sales pitch');
  assert.match(map, /general: null/, '"Todo" is offered as a category');

  const fn = page.slice(page.indexOf("function realtimeSaleCategory(it){"));
  const src = fn.slice(0, fn.indexOf("\n}") + 2);
  const run = new Function("DEPARTMENT_META",
    page.slice(at, page.indexOf("};", at) + 2) + src + "\n return realtimeSaleCategory;")(
      { clothing: { label: "Ropa" }, beauty: { label: "Aria Beauty" } });
  assert.equal(run({ departments: ["beauty"] }), "belleza", "beauty is not spoken as belleza");
  assert.equal(run({ departments: ["clothing"] }), "ropa", "a plain label is not reused");
  assert.equal(run({ departments: ["sale"] }), null, "Ofertas is spoken as a category");
  assert.equal(run({ departments: [] }), null, "an item with no department produced a category");
  /* A department nobody has mapped yet still gets a usable name from
     the site's own label, so adding one does not need this map. */
  assert.equal(run({ departments: ["unmapped_thing"] }), null,
    "an unknown department with no label invented a name");
});


check("every store Aria can recommend is reachable in the page", () => {
  /* THE BUG THIS PINS, found while building the knowledge base.
     SOURCE_RETAILERS is a map from catalogue URL to the retailers it
     carries, and four entries had collapsed into one:

       "/finishline-catalog.json": ["finishline", "/zumiez-catalog.json",
         "zumiez", "/hottopic-catalog.json", "hottopic", ... ]

     The `],"` separators had become `, "`, so Zumiez, Hot Topic and
     BoxLunch — 7,557 products between them — had no key of their own.
     ensureRetailers(['zumiez']) matched the array that CONTAINS
     "zumiez" and fetched Finish Line's catalogue instead. The full
     page load covers them, so search still worked and nothing looked
     broken; the targeted path did not, and that is the one a store
     rail uses.

     It matters more now than it did: Aria recommends Zumiez for skate
     clothing and Hot Topic for anime, so a shopper following her
     advice lands exactly there. Two further catalogues — the jewelry
     file and the eleven Latino designers — were never addressable
     either, and she recommends those for bikinis. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  /* Bracket-matched rather than regex-matched: these literals run to
     thousands of characters and a lazy quantifier stops at the first
     "]" inside them. */
  const grab = (name) => {
    const at = page.indexOf("const " + name + " = ");
    assert.ok(at > 0, `${name} is gone from the page`);
    const open = page.indexOf("=", at) + 2;
    const shut = page[open] === "[" ? "]" : "}";
    let depth = 0, end = -1;
    for (let k = open; k < page.length; k++){
      if (page[k] === page[open]) depth++;
      else if (page[k] === shut && --depth === 0){ end = k; break; }
    }
    assert.ok(end > open, `${name} is not a closed literal`);
    return JSON.parse(page.slice(open, end + 1).replace(/'/g, '"'));
  };
  const sources = grab("SOURCE_RETAILERS");
  const files = grab("CATALOGUE_FILES");
  const parts = grab("DEPT_CACHE_PARTS");

  /* A VALUE THAT LOOKS LIKE A PATH is the signature of the collapse,
     and it is invisible to every syntax check: the object still
     parses, it just means something else. */
  for (const [url, keys] of Object.entries(sources)){
    for (const k of keys){
      assert.ok(!String(k).startsWith("/"),
        `${url} lists "${k}" as a retailer — two map entries have collapsed into one`);
    }
  }

  /* Both directions: a catalogue nothing can address, and a key
     nothing ever loads. */
  const loaded = new Set([...files, ...parts]);
  for (const f of files){
    assert.ok(sources[f], `${f} is loaded but no retailer key reaches it`);
  }
  for (const url of Object.keys(sources)){
    assert.ok(loaded.has(url), `${url} is addressable but never loaded`);
  }

  /* And the thing that actually matters: every store Aria is allowed
     to recommend can be fetched on its own. */
  const reachable = new Set(Object.values(sources).flat());
  for (const [key, store] of Object.entries(K_STORES)){
    if (store.product_count < 50) continue;
    assert.ok(reachable.has(key),
      `${store.name} is recommendable and no catalogue URL carries it — its rail would come up empty`);
  }
});


await checkAsync("the same store question is not asked twice over the wire", async () => {
  /* WHY THIS IS WORTH A TEST. The store tools are the one pair that
     leaves the page, and measured in a browser the round trip cost
     anywhere from 30ms to 2.8 seconds depending on what the catalogue
     loader happened to be doing at the time — the page's sixty
     catalogue fetches and this request queue on the same connection.
     The knowledge is static data, so the answer cannot change inside
     a call, and in a real conversation the same store comes up again
     and again. */
  const page = readFileSync(ROOT + "index.html", "utf8");
  const at = page.indexOf("  if (name === 'get_store_info' || name === 'recommend_stores_for'){");
  assert.ok(at > 0, "the store tools are not routed anywhere");
  const body = page.slice(at, page.indexOf("\n  if (name === 'get_cart_total')", at));

  let wire = 0;
  const cache = new Map();
  const run = (name, args) => {
    const fn = new Function("name", "args", "ariaRTStoreCache", "fetch", "JSON",
      "return (async () => {" + body + "\n return null; })();");
    return fn(name, args, cache, async () => {
      wire++;
      return { ok: true, json: async () => ({ store: "zumiez", name: "Zumiez" }) };
    }, JSON);
  };

  const a = await run("get_store_info", { store_name: "Zumiez" });
  assert.equal(a.name, "Zumiez", "the first ask did not come back");
  assert.equal(wire, 1, "the first ask did not go over the wire");

  const b = await run("get_store_info", { store_name: "Zumiez" });
  assert.deepEqual(b, a, "the cached answer differs from the first one");
  assert.equal(wire, 1, "the same question was asked over the wire twice");

  /* A DIFFERENT question still goes out — a cache that answers
     everything with the first reply is worse than no cache. */
  await run("get_store_info", { store_name: "CCS" });
  assert.equal(wire, 2, "a different store was answered from the first store's cache");
  await run("recommend_stores_for", { interest: "skate" });
  assert.equal(wire, 3, "a different tool was answered from the other tool's cache");

  /* AND IT IS PER CALL. Static within a conversation is not static
     across a deploy, and a cache that outlived the call would serve
     yesterday's catalogue depth. */
  assert.match(page, /ariaRTStoreCache = new Map\(\);[\s\S]{0,400}ariaRTSpoke = false;/,
    "the store cache is not cleared when a new call starts");

  /* A failed request must not be remembered as an answer. */
  let failing = 0;
  const bad = new Map();
  const runBad = () => new Function("name", "args", "ariaRTStoreCache", "fetch", "JSON",
    "return (async () => {" + body + "\n return null; })();")(
      "get_store_info", { store_name: "Zumiez" }, bad,
      async () => { failing++; return { ok: false }; }, JSON);
  const f1 = await runBad();
  assert.ok(f1.unavailable, "a failed lookup produced no sayable answer");
  await runBad();
  assert.equal(failing, 2, "a failure was cached as though it were an answer");
});

/* ============================================================ */
/* A FLOOR ON THE TEST COUNT.

   Twice now this suite has reported success while running less of
   itself than it should: once when an async test under the
   synchronous harness turned assertion rejections into unhandled
   rejections that killed the process before the summary, and once
   when an edit to one test TRUNCATED the file — taking thirty tests
   and the summary printer with it. The second one exited 0, printed
   no failures, and printed no summary either, which reads as a pass
   to anything skimming the output.

   The floor is the cheapest possible detector: a suite that shrinks
   has to say so. Raise it when tests are added; it is not meant to
   track the count exactly, only to catch a collapse. */
const MIN_CHECKS = 75;
if (passed + failures.length < MIN_CHECKS){
  console.log(`\n  SUITE INCOMPLETE: ${passed + failures.length} checks ran, expected at least ${MIN_CHECKS}.`);
  console.log("  The file is probably truncated, or a check threw outside its harness.\n");
  process.exit(1);
}
console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length){ for (const f of failures) console.log("  FAIL  " + f); process.exit(1); }
