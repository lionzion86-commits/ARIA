// Secure middleman between ariashop.pe and OpenAI. Used for the opening
// greeting when the chat panel is first opened; aria-chat-stream.js (and
// aria-chat-groq.js as its fallback) handle the actual conversation.
//
// The greeting is held to the same brain as every other turn: the turn
// is built by the shared _aria-chat-model.js (same model, same cap,
// same system prompt). Text only; the voice is the realtime session's (see
// the live realtime session). No xAI anywhere on this path anymore.
import { chatRequestBody, sanitizeSpokenPunctuation, sanitizeEmojiNarration, resolveCatalogContradiction, OPENAI_CHAT_URL } from "./_aria-chat-model.js";

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
    const raw = sanitizeEmojiNarration(sanitizeSpokenPunctuation(chatData?.choices?.[0]?.message?.content)) || "";
    /* Never name a product and then retract it: the cards decide which
       half is true (see resolveCatalogContradiction). */
    const replyText = raw && resolveCatalogContradiction(raw, Array.isArray(body?.products) && body.products.length > 0);
    if (!replyText) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "OpenAI devolvió una respuesta vacía" }) };
    }

    /* TEXT ONLY. This used to render the reply to speech and hand the
       audio back; the page discarded it, because the live call is the
       voice and speakAssistantReply() returns while one is up. */
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply: replyText }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
