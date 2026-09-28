// Lily-voice TTS for short deterministic assistant lines.
//
// The Ofertas shortcut in index.html answers locally and never reaches the
// chat endpoints, so it used to speak through the browser's speechSynthesis
// (the robot voice, silent on iPhones where it misfires). This endpoint
// renders the same shared speechFor() the greeting and the chat use, so the
// voice can never drift from Lily. Best effort, like speechFor itself: a
// failure returns { audio: null } and the client falls back to the browser
// voice rather than leaving the shopper in silence.
import { speechFor } from "./_aria-chat-model.js";

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const text = typeof body.text === "string" ? body.text.slice(0, 500) : "";
    const audio = await speechFor(text);
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ audio }),
    };
  } catch {
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ audio: null }),
    };
  }
}
