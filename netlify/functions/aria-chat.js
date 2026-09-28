// Secure middleman between ariashop.pe and OpenAI. Used for the opening
// greeting when the chat panel is first opened; aria-chat-stream.js (and
// aria-chat-groq.js as its fallback) handle the actual conversation.
//
// The greeting is held to the same brain as every other turn: the turn
// is built by the shared _aria-chat-model.js (same model, same cap,
// same system prompt), and the voice is Lily via ElevenLabs (see
// speechFor). No xAI anywhere on this path anymore.
import { chatRequestBody, sanitizeSpokenPunctuation, speechFor, OPENAI_CHAT_URL } from "./_aria-chat-model.js";

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: "OPENAI_API_KEY no está configurado" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Step 1: the greeting text, from the shared turn builder.
    const chatResponse = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatRequestBody(body)),
    });
    if (!chatResponse.ok) {
      let detail = null;
      try { const ej = await chatResponse.json(); const ge = ej && ej.error; detail = ge && (ge.message || ge.code || ge); } catch { /* not JSON */ }
      console.error("[aria-chat] OpenAI error", chatResponse.status, detail);
      return { statusCode: 502, headers, body: JSON.stringify({ error: `OpenAI respondió ${chatResponse.status}` + (detail ? ` — ${detail}` : "") }) };
    }

    const chatData = await chatResponse.json();
    // Dictated punctuation words ("comma", "punto") must never reach the
    // shopper as words — the bubble, the voice and the history all agree.
    const replyText = sanitizeSpokenPunctuation(chatData?.choices?.[0]?.message?.content) || "";
    if (!replyText) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "OpenAI devolvió una respuesta vacía" }) };
    }

    // Step 2: Lily's voice, best effort — the greeting is spoken like
    // any other reply, and a voice failure never costs the text.
    const audioBase64 = await speechFor(replyText);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply: replyText,
        audio: audioBase64,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
