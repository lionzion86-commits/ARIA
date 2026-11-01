/* ============================================================
   WHAT THE WORKER RUNS ON, READ FROM ITS ENVIRONMENT, ONCE.

   One plan per worker process, and the same plan for every session it
   serves. The Realtime mint shed fields one layer at a time and served
   whichever variant the API accepted -- the per-session lottery that
   dealt Danny a deaf session on 2026-10-26 08:31 (#443 c.6416056033).
   This worker has no ladder: the plan below either holds in full or
   the worker refuses to start (FAIL CLOSED), and every session logs the
   plan it ran on.

   ENVIRONMENT (names only; the values live in LiveKit Cloud's secret
   store for the deployed agent, never in the repo):

     LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
                          the LiveKit Cloud project ("Aria Shop")
     ARIA_VOICE_ID        ElevenLabs voice id of the cast voice
                          (Grecia, Peruvian Spanish; #443
                          c.6501133163). Required.
     ELEVENLABS_API_KEY   ElevenLabs, direct. Required: Grecia is a
                          voice in Aria's own ElevenLabs account, which
                          LiveKit Inference cannot reach, so there is
                          no keyless fallback for the voice.
     DEEPGRAM_API_KEY     optional: Deepgram direct. Without it the
                          STT goes through LiveKit Inference.
     OPENAI_API_KEY       the brain (primary), as for the chat assistant
     GROQ_API_KEY         the brain's fallback, as for the chat assistant
     ARIA_VOICE_LANE      "quality" (default) or "lean"; the lean lane
                          auditions separately (#443 c.6399852356)
     ARIA_VOICE_AGENT_NAME  dispatch name; default "aria"
     ARIA_VOICE_MAX_SECONDS hard cap on one session; default 300
     ARIA_VOICE_READY_WAIT_MS  how long the greeting waits for the
                          page to say its speaker is playing; 3000
   ============================================================ */

export const AGENT_NAME_DEFAULT = "aria";
export const MAX_SECONDS_DEFAULT = 300;
export const READY_WAIT_MS_DEFAULT = 3000;

/* The two lanes. Both Spanish, both nova-3 ears: prices are numbers
   and the first gate is number accuracy (#443 c.6399639486). The lane
   changes only the voice model, the expensive half: ElevenLabs Turbo
   v2.5 for quality, Flash v2.5 (lowest latency, lower price) for lean;
   both speak Spanish and both stream. */
export const LANES = Object.freeze({
  quality: Object.freeze({ stt: "nova-3", tts: "eleven_turbo_v2_5" }),
  lean: Object.freeze({ stt: "nova-3", tts: "eleven_flash_v2_5" }),
});

/* Words a Peruvian shopper says that a general model mishears; nova-3
   weighs them up (keyterm prompting). Store and money words only --
   product names come and go, these do not. */
export const STT_KEYTERMS = Object.freeze([
  "Aria", "soles", "lucas", "dólares", "envío", "ofertas", "zapatillas", "chimpunes",
  "Nike", "Adidas", "Puma", "New Balance", "Walmart", "Costco", "Lego", "perfume",
]);

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/**
 * The worker's plan from its environment. Returns { ok, plan } or
 * { ok:false, missing:[names] } -- the caller refuses to start on the
 * second; nothing here substitutes a different voice or ear.
 */
export function planFromEnv(env = process.env) {
  const missing = [];
  for (const k of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "ARIA_VOICE_ID", "ELEVENLABS_API_KEY"]) if (!env[k]) missing.push(k);
  if (!env.OPENAI_API_KEY && !env.GROQ_API_KEY) missing.push("OPENAI_API_KEY");
  if (missing.length) return { ok: false, missing };
  const laneName = env.ARIA_VOICE_LANE === "lean" ? "lean" : "quality";
  const lane = LANES[laneName];
  return {
    ok: true,
    plan: Object.freeze({
      lane: laneName,
      agentName: env.ARIA_VOICE_AGENT_NAME || AGENT_NAME_DEFAULT,
      stt: { vendor: "deepgram", model: lane.stt, language: "es", direct: !!env.DEEPGRAM_API_KEY },
      tts: { vendor: "elevenlabs", model: lane.tts, language: "es", voice: env.ARIA_VOICE_ID, direct: true },
      llm: { primary: env.OPENAI_API_KEY ? "openai" : null, fallback: env.GROQ_API_KEY ? "groq" : null },
      maxSeconds: num(env.ARIA_VOICE_MAX_SECONDS, MAX_SECONDS_DEFAULT),
      readyWaitMs: num(env.ARIA_VOICE_READY_WAIT_MS, READY_WAIT_MS_DEFAULT),
    }),
  };
}

/* ONE SESSION, ONE VOICE (#443 c.6549932007: Danny heard her flip
   between Grecia and another accent). The worker announces the voice it
   speaks with as a participant attribute before the shopper hears
   anything; the page takes only an agent that announces Grecia's
   engine, and never plays any other participant's audio. A stale
   worker from an older build announces nothing and is never heard. */
export const VOICE_ATTR = "aria.voice";
export const voiceTag = (plan) => `${plan.tts.vendor}/${plan.tts.model}`;

/** The one line a session logs about what it ran on: no keys, no ids. */
export function planSummary(plan) {
  return {
    engine: "owned-cascade",
    lane: plan.lane,
    stt: `${plan.stt.vendor}/${plan.stt.model}:${plan.stt.language}${plan.stt.direct ? "" : " (livekit-inference)"}`,
    tts: `${plan.tts.vendor}/${plan.tts.model}:${plan.tts.language}${plan.tts.direct ? "" : " (livekit-inference)"}`,
    llm: [plan.llm.primary, plan.llm.fallback].filter(Boolean).join(" -> "),
    transcribes: true,
  };
}
