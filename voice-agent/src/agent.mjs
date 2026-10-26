/* ============================================================
   ARIA'S OWNED VOICE -- THE CASCADE (#443 c.6416074857, Danny's start
   order 2026-10-26 08:32 EDT; kickoff c.6399639486, scale gate
   c.6399852356).

     shopper's mic -> LiveKit -> Deepgram (ears, Spanish)
                   -> Aria's brain (the chat assistant's model, prompt
                      and tools; her hands run in the page)
                   -> Cartesia (voice: the cast voice, Jacqueline)
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
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import * as brain from "./brain.generated.mjs";
import { planFromEnv, planSummary, STT_KEYTERMS } from "./config.mjs";
import { emptyUsage, usageFrom, ratesFromEnv, priceUsage } from "./cost.mjs";
import { RPC, readContext, sendTurn, pageTools, stripCardMarkers } from "./page-bridge.mjs";
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

/** The voice: Cartesia, the cast voice, Spanish. */
export function buildVoice(plan, env = process.env) {
  if (plan.tts.direct) {
    return new cartesia.TTS({ apiKey: env.CARTESIA_API_KEY, model: plan.tts.model, voice: plan.tts.voice, language: plan.tts.language });
  }
  return new inference.TTS({ model: `cartesia/${plan.tts.model}`, voice: plan.tts.voice, language: plan.tts.language });
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
export function createAriaAgent({ rpc, history = [], recipient = null, onTool = () => {}, onUserLine = () => {}, llmModel } = {}) {
  const chatCtx = llm.ChatContext.empty();
  for (const m of history) chatCtx.addMessage({ role: m.role, content: m.content });
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
    await ctx.connect();
    const shopper = await ctx.waitForParticipant();
    const room = ctx.room;
    const t0 = Date.now();
    const rpc = (method, payload, responseTimeout) =>
      room.localParticipant.performRpc({ destinationIdentity: shopper.identity, method, payload, responseTimeout });

    /* The memory: our store's thread first; the page's only when ours
       has nothing (a first call, a store that is down). */
    const memory = threadStore({ meta: threadFromMetadata(shopper.metadata), secret: process.env.LIVEKIT_API_SECRET, room: room.name, log });
    const [page, ours] = await Promise.all([readContext(rpc), memory.history()]);
    const { recipient } = page;
    const history = ours.length ? ours : page.history;
    const memorySource = ours.length ? "server" : page.history.length ? "page" : "none";
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
    /* Her lines go to the page's transcript and memory, cleaned exactly
       as the chat assistant's replies are. */
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const item = ev.item;
      if (!item || item.role !== "assistant") return;
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
    log("session-start", { room: room.name, ...planSummary(plan), history: history.length, memory: memorySource, thread: memory.enabled });

    /* THE GREETING WAITS FOR THE SPEAKER (#443 c.6416056033 item 3):
       audio sent before the page is playing is lost, which is how the
       greeting started mid-sentence. The page says when it is ready;
       if it never does, she greets anyway after the wait. */
    const why = await Promise.race([readyNow, new Promise((r) => setTimeout(() => r("timeout"), plan.readyWaitMs))]);
    log("greeting", { room: room.name, after: why, ms: Date.now() - t0 });
    session.generateReply({ instructions: greetingFor(history) });

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
      });
      /* The whole call, for review (Stage 0 of the own-AI goal: every
         owned-engine conversation becomes corpus). */
      await memory.finish({ memory: memorySource, plan: planSummary(plan), seconds: usage.sessionSeconds, usd, latency, tools });
    });
  },
});
