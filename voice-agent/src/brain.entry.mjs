/* ============================================================
   ARIA'S BRAIN, AS THE OWNED VOICE CARRIES IT (#443 c.6416074857).

   The cascade swaps the ears and the voice, never the brain. What she
   knows, what she may say, which tools she has and how a tool's
   arguments are checked are the SAME modules the Realtime session and
   the chat assistant are built from:

     instructions   scripts/lib/realtime-voice.js  buildRealtimeInstructions
                    (= the chat agent's system prompt + the voice rules)
     tools          scripts/lib/realtime-turn.js   REALTIME_TOOLS
     arguments      scripts/lib/realtime-turn.js   parseToolArguments
     model          netlify/functions/_aria-chat-model.js  (the chat
                    assistant's model, primary and fallback)
     punctuation    netlify/functions/_aria-chat-model.js  sanitizers

   This file only names them. voice-agent/scripts/build-brain.mjs
   bundles it into src/brain.generated.mjs so the worker image carries
   no copy of the repo, and scripts/test/owned-voice-tests.mjs fails
   when the generated file is older than its sources.
   ============================================================ */
export {
  buildRealtimeInstructions,
  REALTIME_TOOLS,
  REALTIME_TOOL_NAMES,
  parseToolArguments,
} from "../../scripts/lib/realtime-voice.js";
export {
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
  GROQ_MODEL,
  REASONING_EFFORT,
  TEMPERATURE,
  sanitizeSpokenPunctuation,
  sanitizeEmojiNarration,
} from "../../netlify/functions/_aria-chat-model.js";
