/* ============================================================
   ARIA'S OWNED VOICE -- THE CASCADE (#443 c.6416074857, Danny's start
   order 2026-10-26 08:32 EDT; kickoff c.6399639486, scale gate
   c.6399852356).

     shopper's mic -> LiveKit -> Deepgram (ears, Spanish)
                   -> Aria's brain (the chat assistant's model, prompt
                      and tools; her hands run in the page)
                   -> ElevenLabs (voice: the cast voice, Grecia)
                   -> LiveKit -> shopper's speaker

   WHY THIS ENDS THE LOTTERY. On the Realtime session, whether a turn
   was transcribed -- and so whether she answered -- depended on which
   session variant the mint happened to get (#443 c.6416056033). Here
   every word the shopper says goes through our ears, every turn ends
   in our server's decision to answer, and the plan is fixed per worker
   (config.mjs, fail closed). There is no variant to draw.

   STATELESS WORKER. Nothing about a conversation lives in this process
   past its session: the memory is OURS (thread-store.mjs, the
   "voice-threads" store behind /api/voice-thread), read when the call
   opens and written line by line, with the page's memory only as the
   stand-in when the store has nothing; so any worker can serve any
   session and scaling is more workers, never a rebuild.

   The doctrine timers -- the opening nudge, the ten-second silence
   sign-off, the panel-closed and page-hidden hang-ups -- stay in the
   page, where they already run for the Realtime voice; the page asks
   for a doctrine line over aria.cue and this brain says it. The worker
   adds only the backstop a server must own: a hard cap on session
   length, for a page that vanished without hanging up.
   ============================================================ */
import { defineAgent, llm, voice, inference } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import * as brain from "./brain.generated.mjs";
import { planFromEnv, planSummary, STT_KEYTERMS } from "./config.mjs";
import { emptyUsage, usageFrom, ratesFromEnv, priceUsage } from "./cost.mjs";
import { RPC, readContext, sendTurn, pageTools, stripCardMarkers, runPageTool, notifyPage, showIdsFrom, TOOL_FAILED } from "./page-bridge.mjs";
import { threadFromMetadata, threadStore } from "./thread-store.mjs";

/* The Realtime voice's ceiling on one answer (MAX_RESPONSE_OUTPUT_TOKENS):
   one to three spoken sentences, impossible to filibuster from. */
export const MAX_REPLY_TOKENS = 500;

/* How the call opens. The Realtime session opened with an empty
   response and let the instructions decide; a text model needs to be
   told that nobody has spoken yet. What to say stays in the rules. */
export const GREETING_INSTRUCTIONS =
  "La llamada acaba de abrirse y el cliente todavía no ha dicho nada. Salúdalo como dicen tus reglas de saludo, en una sola frase breve.";

/* RETURN WITH MEMORY (#443 c.6420805882 rider 3): a shopper who comes
   back is greeted with the live thread, not as a stranger. */
export const RETURN_GREETING_INSTRUCTIONS =
  "La llamada acaba de abrirse y el cliente todavía no ha dicho nada, pero ya conversaron antes: el historial de arriba es esa conversación. Salúdalo como a alguien que vuelve, en una sola frase breve, retomando lo último que estaban viendo según el historial, y pregúntale si sigue con eso. No repitas la bienvenida de la primera vez ni inventes nada que no esté en el historial.";

/** The opening line's instructions: a returning shopper gets the thread back. */
export const greetingFor = (history) => (history && history.length ? RETURN_GREETING_INSTRUCTIONS : GREETING_INSTRUCTIONS);

/* TEN SECONDS OF DEAD AIR AT THE TAP (#443 ear test 2, Danny: "Did the
   whole page freeze?"). Her rules open every call with get_current_user
   (and get_order_history for a member), so her hello cost two or three
   model round trips before a word. The worker now looks the shopper up
   itself, over the page, WHILE the room comes up, hands her the answers
   as context, and:
     - a guest with no thread hears the rules' own opening line, spoken
       straight to the voice (no model turn at all);
     - a member or a returning shopper gets ONE model turn, told the
       lookup is already done. */
export const GUEST_GREETING = "¡Hola! Soy Aria, tu shopper personal. ¿Qué estás buscando?";
export const FACTS_TIMEOUT_MS = 2000;
export const MEMORY_WAIT_MS = 2500;
const NO_TOOLS_FOR_HELLO = " Ya consultaste sus datos al abrir la llamada (están arriba): no llames ninguna herramienta para saludar.";

/** The shopper, looked up the way her rules ask, before she says hello; null when it could not be. */
export async function shopperFacts(rpc, timeoutMs = FACTS_TIMEOUT_MS) {
  const look = (async () => {
    const user = await runPageTool(rpc, "get_current_user", {});
    if (!user || user === TOOL_FAILED || user.unavailable) return null;
    const facts = { get_current_user: user };
    if (user.logged_in) {
      const orders = await runPageTool(rpc, "get_order_history", {});
      if (orders && orders !== TOOL_FAILED && !orders.unavailable) facts.get_order_history = orders;
    }
    return facts;
  })();
  return Promise.race([look, new Promise((r) => setTimeout(() => r(null), timeoutMs))]);
}

/** The lookup, as a line of context she reads before her first word. */
export function factsMessage(facts) {
  return "DATOS DEL CLIENTE, ya consultados al abrir la llamada (no los vuelvas a pedir; úsalos según tus reglas): " + JSON.stringify(facts);
}

/** How she opens: { say } for a guest with nothing to pick up, else { instructions } for one model turn. */
export function openingFor({ history = [], facts = null } = {}) {
  const guest = !facts || !facts.get_current_user || facts.get_current_user.logged_in === false;
  if (!history.length && guest) return { say: GUEST_GREETING };
  return { instructions: greetingFor(history) + NO_TOOLS_FOR_HELLO };
}

/* SHE NEVER CUTS HERSELF OFF (#443 ear test 1 addendum, item 1). A
   breath, a cough or her own voice leaking back through a laptop
   speaker must not stop her mid-sentence: an interruption needs real
   words (two, transcribed) over 600 ms of speech, and an interruption
   that turns out to be nothing (no words within 1.5 s) resumes her
   sentence instead of dropping it. */
export const INTERRUPTION = Object.freeze({ minDuration: 600, minWords: 2, falseInterruptionTimeout: 1500, resumeFalseInterruption: true });

/* A page that vanished without hanging up still ends: the page's own
   five-minute cap is the rule, this is its server-side backstop. */
export const MAX_GRACE_SECONDS = 20;

const log = (event, data) => console.log(`[aria-voice] ${event} ${JSON.stringify(data)}`);

/** The model: the chat assistant's, primary then fallback. */
export function buildBrainLLM(plan, env = process.env) {
  const llms = [];
  if (plan.llm.primary === "openai") {
    llms.push(new openai.LLM({
      model: brain.OPENAI_MODEL,
      apiKey: env.OPENAI_API_KEY,
      reasoningEffort: brain.OPENAI_REASONING_EFFORT,
      maxCompletionTokens: MAX_REPLY_TOKENS,
      strictToolSchema: false,
    }));
  }
  if (plan.llm.fallback === "groq") {
    llms.push(openai.LLM.withGroq({ model: brain.GROQ_MODEL, apiKey: env.GROQ_API_KEY, temperature: brain.TEMPERATURE }));
  }
  return llms.length > 1 ? new llm.FallbackAdapter({ llms }) : llms[0];
}

/** The ears: Deepgram nova-3 in Spanish, numbers as digits (prices). */
export function buildEars(plan, env = process.env) {
  if (plan.stt.direct) {
    return new deepgram.STT({
      apiKey: env.DEEPGRAM_API_KEY,
      model: plan.stt.model,
      language: plan.stt.language,
      smartFormat: true,
      numerals: true,
      punctuate: true,
      keyterm: [...STT_KEYTERMS],
    });
  }
  return new inference.STT({ model: `deepgram/${plan.stt.model}`, language: plan.stt.language });
}

/** The voice: ElevenLabs, the cast voice (Grecia), Spanish. Always
 *  direct: Grecia lives in Aria's own ElevenLabs account. */
export function buildVoice(plan, env = process.env) {
  return new elevenlabs.TTS({ apiKey: env.ELEVENLABS_API_KEY, voiceId: plan.tts.voice, model: plan.tts.model, language: plan.tts.language });
}

/* A [[SHOW: ...]] marker can arrive split across stream chunks; text
   is held from "[[" until its "]]" so no part of one is ever spoken. */
export function markerFilter() {
  let held = "";
  return new TransformStream({
    transform(chunk, ctl) {
      held += chunk;
      const open = held.lastIndexOf("[[");
      if (open !== -1 && held.indexOf("]]", open) === -1) {
        const safe = stripCardMarkers(held.slice(0, open));
        held = held.slice(open);
        if (safe) ctl.enqueue(safe);
        return;
      }
      const out = stripCardMarkers(held);
      held = "";
      if (out) ctl.enqueue(out);
    },
    flush(ctl) {
      const out = stripCardMarkers(held).replace(/\[\[[^\]]*$/, "");
      if (out) ctl.enqueue(out);
    },
  });
}
export const stripMarkersTransform = (stream) => stream.pipeThrough(markerFilter());

/**
 * Aria, as an agent of this framework: the brain's instructions and
 * tools, her history from the page, and the page's noise filter in
 * front of every answer.
 */
/** Her context: the thread (ours, or the page's), and the shopper lookup when there is one. */
export function buildChatCtx(history = [], facts = null) {
  const chatCtx = llm.ChatContext.empty();
  if (facts) chatCtx.addMessage({ role: "system", content: factsMessage(facts) });
  for (const m of history) chatCtx.addMessage({ role: m.role, content: m.content });
  return chatCtx;
}

export function createAriaAgent({ rpc, history = [], recipient = null, onTool = () => {}, onUserLine = () => {}, llmModel } = {}) {
  const chatCtx = buildChatCtx(history);
  class AriaVoice extends voice.Agent {
    async onUserTurnCompleted(_ctx, newMessage) {
      const text = String((newMessage && newMessage.textContent) || "").trim();
      const { speech } = await sendTurn(rpc, "user", text);
      /* The page read it as noise: no answer, as on the Realtime voice. */
      if (!speech) throw new voice.StopResponse();
      onUserLine(text);
    }
  }
  return new AriaVoice({
    instructions: brain.buildRealtimeInstructions(recipient),
    chatCtx,
    tools: pageTools(brain.REALTIME_TOOLS, llm.tool, rpc, onTool),
    ...(llmModel ? { llm: llmModel } : {}),
  });
}

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx) => {
    const got = planFromEnv();
    if (!got.ok) {
      /* FAIL CLOSED: no session on a partial plan. The page falls back
         to the Realtime voice when no agent answers. */
      log("refused", { missing: got.missing });
      ctx.shutdown("plan incomplete");
      return;
    }
    const plan = got.plan;
    /* The spin-up budget, phase by phase from the job's start (#443 ear
       test 2 asks for it): connected, joined (the shopper is in the
       room), context, sessionStart, memory, facts, ready (his speaker
       plays), greeting, firstAudio. The page's own marks (ariaVoiceDiag)
       cover tap -> token -> room. */
    const t0 = Date.now();
    const spin = {};
    const mark = (k) => { if (spin[k] == null) spin[k] = Date.now() - t0; };
    await ctx.connect();
    mark("connected");
    const shopper = await ctx.waitForParticipant();
    mark("joined");
    const room = ctx.room;
    const rpc = (method, payload, responseTimeout) =>
      room.localParticipant.performRpc({ destinationIdentity: shopper.identity, method, payload, responseTimeout });

    /* The memory: our store's thread first; the page's only when ours
       has nothing (a first call, a store that is down). */
    const memory = threadStore({ meta: threadFromMetadata(shopper.metadata), secret: process.env.LIVEKIT_API_SECRET, room: room.name, log });
    /* Nothing slow stands between the shopper and her voice: the page's
       context is one round trip, and the session starts on it. Our
       thread and the shopper lookup run alongside, and are only
       awaited (bounded) when she is about to say hello. */
    const ourThread = memory.history().then((h) => { mark("memory"); return h; });
    const lookup = shopperFacts(rpc).then((f) => { mark("facts"); return f; });
    const page = await readContext(rpc);
    mark("context");
    const { recipient } = page;
    let history = page.history;
    let memorySource = page.history.length ? "page" : "none";
    const tools = [];
    const agent = createAriaAgent({ rpc, history, recipient, onTool: (t) => tools.push(t), onUserLine: (text) => memory.say("user", text) });

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad,
      stt: buildEars(plan),
      llm: buildBrainLLM(plan),
      tts: buildVoice(plan),
      ttsTextTransforms: ["filter_markdown", "filter_emoji", stripMarkersTransform],
      /* The page owns silence (the ten-second sign-off); this would
         race it. */
      userAwayTimeout: null,
      turnHandling: { interruption: { ...INTERRUPTION } },
    });

    let usage = emptyUsage();
    const latency = [];
    session.on(voice.AgentSessionEventTypes.SessionUsageUpdated, (ev) => {
      usage = usageFrom(ev.usage && ev.usage.modelUsage);
    });
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      const m = ev.metrics || {};
      if (m.type === "eou_metrics") latency.push({ k: "eou", ms: Math.round(m.endOfUtteranceDelayMs) });
      else if (m.type === "llm_metrics") latency.push({ k: "llm_ttft", ms: Math.round(m.ttftMs) });
      else if (m.type === "tts_metrics") latency.push({ k: "tts_ttfb", ms: Math.round(m.ttfbMs) });
    });
    /* His voice, as our VAD hears it, goes to the page: its silence
       clock holds while he talks (#443 ear test 1: she thanked him and
       hung up while he was mid-sentence). */
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      notifyPage(rpc, RPC.USER, { state: ev.newState });
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      if (ev.newState === "speaking" && spin.firstAudio == null) {
        mark("firstAudio");
        log("spinup", { room: room.name, ...spin });
      }
    });
    /* Her lines go to the page's transcript and memory, cleaned exactly
       as the chat assistant's replies are. */
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const item = ev.item;
      if (!item || item.role !== "assistant") return;
      /* A product she pointed at gets its card (ear test 2). */
      const ids = showIdsFrom(item.textContent || "");
      if (ids.length) notifyPage(rpc, RPC.SHOW, { ids });
      const said = brain.sanitizeEmojiNarration(brain.sanitizeSpokenPunctuation(stripCardMarkers(item.textContent || ""))).trim();
      if (!said) return;
      sendTurn(rpc, "assistant", said);
      memory.say("assistant", said);
    });

    let ready;
    const readyNow = new Promise((r) => { ready = r; });
    room.localParticipant.registerRpcMethod(RPC.READY, async () => { ready("page"); return "ok"; });
    room.localParticipant.registerRpcMethod(RPC.CUE, async (data) => {
      let cue = "";
      /* The page's doctrine lines are a sentence or two (CUE_BYE,
         CUE_OPENING_SILENCE); anything longer is not one of them. */
      try { cue = String(JSON.parse(data.payload).cue || "").slice(0, 600); } catch { /* empty */ }
      if (!cue) return JSON.stringify({ ok: false });
      session.generateReply({ instructions: cue });
      return JSON.stringify({ ok: true });
    });
    room.localParticipant.registerRpcMethod(RPC.TEXT, async (data) => {
      let text = "";
      try { text = String(JSON.parse(data.payload).text || "").trim().slice(0, 2000); } catch { /* empty */ }
      if (!text) return JSON.stringify({ ok: false });
      session.generateReply({ userInput: text });
      return JSON.stringify({ ok: true });
    });

    await session.start({ agent, room });
    mark("sessionStart");

    /* THE GREETING WAITS FOR THE SPEAKER (#443 c.6416056033 item 3):
       audio sent before the page is playing is lost, which is how the
       greeting started mid-sentence. The page says when it is ready;
       if it never does, she greets anyway after the wait. Our thread
       and the lookup finish in the same wait (each bounded). */
    const bounded = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
    const [why, ours, facts] = await Promise.all([
      bounded(readyNow, plan.readyWaitMs, "timeout").then((w) => { mark("ready"); return w; }),
      bounded(ourThread, MEMORY_WAIT_MS, []),
      lookup,
    ]);
    if (ours.length) { history = ours; memorySource = "server"; }
    if (ours.length || facts) await agent.updateChatCtx(buildChatCtx(history, facts));
    log("session-start", { room: room.name, ...planSummary(plan), history: history.length, memory: memorySource, thread: memory.enabled, facts: !!facts });
    const opening = openingFor({ history, facts });
    if (opening.say) session.say(opening.say);
    else session.generateReply({ instructions: opening.instructions });
    mark("greeting");
    log("greeting", { room: room.name, after: why, how: opening.say ? "line" : "model", ms: Date.now() - t0 });

    const cap = setTimeout(() => {
      log("max-duration", { room: room.name, seconds: plan.maxSeconds + MAX_GRACE_SECONDS });
      ctx.shutdown("max duration");
    }, (plan.maxSeconds + MAX_GRACE_SECONDS) * 1000);

    ctx.addShutdownCallback(async () => {
      clearTimeout(cap);
      usage.sessionSeconds = Math.round((Date.now() - t0) / 1000);
      const usd = priceUsage(usage, ratesFromEnv());
      log("session-end", {
        room: room.name,
        ...planSummary(plan),
        seconds: usage.sessionSeconds,
        usage,
        usd,
        latency,
        tools,
        lines: memory.lines.length,
        spin,
      });
      /* The whole call, for review (Stage 0 of the own-AI goal: every
         owned-engine conversation becomes corpus). */
      await memory.finish({ memory: memorySource, plan: planSummary(plan), seconds: usage.sessionSeconds, usd, latency, tools });
    });
  },
});
