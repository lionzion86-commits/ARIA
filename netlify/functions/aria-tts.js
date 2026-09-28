// Sentence-level TTS for the pipelined voice path (2026-09-28).
//
// The client accumulates streamed text and, each time a sentence
// completes, POSTs it here instead of waiting for the whole reply.
// One sentence in, one MP3 out — base64 in JSON, the same audio shape
// the chat endpoints use. The voice is fixed server-side (Lily); the
// client never names a voice.
//
// BEST EFFORT, like every voice path here: a 4xx/5xx just skips the
// sentence — the text on screen is the source of truth, and the
// browser's speech synthesis covers a total voice outage client-side.
import { speechFor } from "./_aria-chat-model.js";

/* A sentence is at most a few hundred characters; 1000 is a rail
   against abuse, not a target. ElevenLabs bills per character, so an
   unbounded input is an unbounded charge. */
const MAX_CHARS = 1000;

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    let text = "";
    try {
      const body = JSON.parse(event.body || "{}");
      if (typeof body.text === "string") text = body.text.trim();
    } catch {
      /* not JSON — text stays empty, rejected below */
    }
    if (!text) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "empty text" }) };
    }
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

    // speechFor is ElevenLabs/Lily and never throws: null means the
    // voice is unavailable (no key, provider error), not a bug here.
    const audio = await speechFor(text);
    if (!audio) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "TTS unavailable" }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ audio }) };
  } catch (error) {
    console.error("[aria-tts]", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "tts failed" }) };
  }
}
