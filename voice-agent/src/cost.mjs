/* ============================================================
   WHAT ONE SESSION USED, AND WHAT IT COST (#443 c.6399852356 (3):
   "per-session cost is measured ... at every load step, and the lane
   does not pass if cost/order breaks at $30 baskets").

   The framework reports usage per model (LLM tokens, TTS characters
   and seconds, STT seconds). This folds a session's reports into one
   meter and prices it with rates from the environment. No rate is
   written here: a price in the code would be a number nobody checked
   against the invoice. Without a rate the session's cost reads null
   and the raw usage is still logged; the dashboards are the truth.

     ARIA_VOICE_RATE_STT_PER_MIN        USD per minute of shopper audio
     ARIA_VOICE_RATE_TTS_PER_1K_CHARS   USD per 1,000 characters spoken
     ARIA_VOICE_RATE_LLM_IN_PER_1M      USD per 1M input tokens
     ARIA_VOICE_RATE_LLM_OUT_PER_1M     USD per 1M output tokens
     ARIA_VOICE_RATE_SESSION_PER_MIN    USD per minute of agent session
   ============================================================ */

export function emptyUsage() {
  return { sttSeconds: 0, ttsChars: 0, ttsSeconds: 0, llmIn: 0, llmOut: 0, sessionSeconds: 0 };
}

/**
 * The session's usage from the framework's model usage list (the
 * session_usage_updated event carries the running totals, so the
 * latest list replaces, never adds to, the previous one).
 */
export function usageFrom(modelUsage = []) {
  const u = emptyUsage();
  for (const m of modelUsage) {
    if (!m || !m.type) continue;
    if (m.type === "stt_usage") u.sttSeconds += (m.audioDurationMs || 0) / 1000;
    else if (m.type === "tts_usage") { u.ttsChars += m.charactersCount || 0; u.ttsSeconds += (m.audioDurationMs || 0) / 1000; }
    else if (m.type === "llm_usage") { u.llmIn += m.inputTokens || 0; u.llmOut += m.outputTokens || 0; }
  }
  return u;
}

export function ratesFromEnv(env = process.env) {
  const r = (k) => { const n = Number(env[k]); return Number.isFinite(n) && n >= 0 && env[k] !== "" && env[k] != null ? n : null; };
  return {
    sttPerMin: r("ARIA_VOICE_RATE_STT_PER_MIN"),
    ttsPer1kChars: r("ARIA_VOICE_RATE_TTS_PER_1K_CHARS"),
    llmInPer1M: r("ARIA_VOICE_RATE_LLM_IN_PER_1M"),
    llmOutPer1M: r("ARIA_VOICE_RATE_LLM_OUT_PER_1M"),
    sessionPerMin: r("ARIA_VOICE_RATE_SESSION_PER_MIN"),
  };
}

/**
 * USD for a session, or null when any rate is missing: a partial sum
 * would read as a cheap session when it is an unpriced one.
 */
export function priceUsage(u, rates) {
  if (Object.values(rates).some((v) => v == null)) return null;
  const usd = (u.sttSeconds / 60) * rates.sttPerMin
    + (u.ttsChars / 1000) * rates.ttsPer1kChars
    + (u.llmIn / 1e6) * rates.llmInPer1M
    + (u.llmOut / 1e6) * rates.llmOutPer1M
    + (u.sessionSeconds / 60) * rates.sessionPerMin;
  return Math.round(usd * 1e5) / 1e5;
}
