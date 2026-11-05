/* ==================================================================
   ARIA HOME SHIELD: HEARING THE HOMEOWNER.

   POST { audio: <base64>, mime: "audio/webm"|"audio/mp4"|..., lang } -> { text }

   The page records one utterance (MediaRecorder, ended by ~900 ms of
   silence or a tap) and sends it here. Transcribed with the repo's
   existing OPENAI_API_KEY and the transcription model the realtime
   voice already uses (scripts/lib/realtime-voice.js keeps that id).
   ================================================================== */
import { TRANSCRIPTION_MODEL } from "../../scripts/lib/realtime-voice.js";

export const STT_URL = "https://api.openai.com/v1/audio/transcriptions";
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const ALLOWED = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a", "audio/aac": "m4a" };

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (statusCode, obj) => ({ statusCode, headers: HEADERS, body: JSON.stringify(obj) });

const RATE = { windowMs: 60_000, max: 40 };
const hits = new Map();
function rateLimited(ip, now = Date.now()) {
  const key = ip || "unknown";
  const arr = (hits.get(key) || []).filter((t) => now - t < RATE.windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE.max;
}

export async function handler(event, context) {
  const fetchImpl = (context && context.fetchImpl) || fetch;
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "")).split(",")[0].trim();
  if (rateLimited(ip)) return json(429, { error: "Too many requests. Please wait a minute." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  const mime = String(body.mime || "audio/webm").split(";")[0].trim().toLowerCase();
  const ext = ALLOWED[mime];
  if (!ext) return json(415, { error: "unsupported audio type" });
  if (typeof body.audio !== "string" || !body.audio) return json(400, { error: "audio is required" });
  const buf = Buffer.from(body.audio, "base64");
  if (buf.length < 200) return json(200, { text: "" });
  if (buf.length > MAX_AUDIO_BYTES) return json(413, { error: "recording too long" });

  if (!process.env.OPENAI_API_KEY) return json(503, { error: "OPENAI_API_KEY not configured" });

  const form = new FormData();
  form.append("file", new Blob([buf], { type: mime }), "speech." + ext);
  form.append("model", TRANSCRIPTION_MODEL);
  if (body.lang === "es" || body.lang === "en") form.append("language", body.lang);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: ac.signal,
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 300); } catch { /* none */ }
      console.error("[hs-stt] transcription error", res.status, detail);
      return json(502, { error: `transcription responded ${res.status}` });
    }
    const data = await res.json();
    const text = typeof data.text === "string" ? data.text.trim().slice(0, 2000) : "";
    return json(200, { text });
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return json(aborted ? 504 : 500, { error: aborted ? "transcription timed out" : String((error && error.message) || error) });
  } finally {
    clearTimeout(timer);
  }
}
