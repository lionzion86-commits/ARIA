/* ==================================================================
   ARIA HOME SHIELD: HER VOICE (#443 c.6660278927, the ONE VOICE LAW).

   POST { text, lang } -> audio/mpeg (base64 body), or JSON { error, code }.

   Every speech path on the Home Shield pages (chat replies, her greeting,
   every Listen button) comes through here, and here there is exactly one
   voice: the voice id, model and settings below. There is no other voice
   and no device fallback anywhere; when synthesis fails the page shows
   this function's error and keeps the text on screen.

   The key is server-side only: ELEVENLABS_API_KEY. Missing -> 503
   "voice not configured", which the page shows as is.
   ================================================================== */
export const VOICE_ID = "9BWtsMINqrJLrRacOk9x";
export const VOICE_MODEL = "eleven_v3";
export const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75 };
export const OUTPUT_FORMAT = "mp3_44100_64";
export const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${OUTPUT_FORMAT}`;
export const MAX_TEXT = 900;
const TIMEOUT_MS = 20000;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (statusCode, obj) => ({ statusCode, headers: JSON_HEADERS, body: JSON.stringify(obj) });

const RATE = { windowMs: 60_000, max: 90 };
const hits = new Map();
function rateLimited(ip, now = Date.now()) {
  const key = ip || "unknown";
  const arr = (hits.get(key) || []).filter((t) => now - t < RATE.windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE.max;
}

export function ttsRequestBody(text) {
  return { text, model_id: VOICE_MODEL, voice_settings: { ...VOICE_SETTINGS } };
}

export async function handler(event, context) {
  const fetchImpl = (context && context.fetchImpl) || fetch;
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: JSON_HEADERS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "")).split(",")[0].trim();
  if (rateLimited(ip)) return json(429, { error: "Too many voice requests. Please wait a minute.", code: "rate_limited" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid JSON", code: "bad_request" });
  }
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return json(400, { error: "text is required", code: "bad_request" });
  if (text.length > MAX_TEXT) return json(413, { error: `text longer than ${MAX_TEXT} characters`, code: "too_long" });

  if (!process.env.ELEVENLABS_API_KEY) {
    return json(503, { error: "voice not configured", code: "voice_not_configured", detail: "ELEVENLABS_API_KEY is not set for this deploy." });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(TTS_URL, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(ttsRequestBody(text)),
      signal: ac.signal,
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 300); } catch { /* none */ }
      console.error("[hs-tts] voice error", res.status, detail);
      return json(502, { error: `voice service responded ${res.status}`, code: "voice_upstream", detail });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return json(502, { error: "voice service returned no audio", code: "voice_empty" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return json(aborted ? 504 : 500, { error: aborted ? "voice timed out" : String((error && error.message) || error), code: aborted ? "voice_timeout" : "voice_error" });
  } finally {
    clearTimeout(timer);
  }
}
