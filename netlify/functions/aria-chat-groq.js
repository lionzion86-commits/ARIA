// Aria's chat brain: Groq/Llama for text, Grok for TTS.
//
// GROUNDING (2026-09-18)
// This used to take only { message } and answer from the model's own
// knowledge, while index.html ran a live product search AFTERWARDS and
// appended the cards. The model therefore wrote its reply without ever
// seeing what the search found, which produced the two worst failure
// modes reported from real use:
//
//   * "No vendemos iPhone" in the prose, with three real iPhone cards
//     rendered directly underneath it.
//   * Prose crediting a product to the wrong store ("New Balance 1906R en
//     Foot Locker") when the card next to it said Walmart, because the
//     chat search only ever queries Walmart.
//
// The caller now searches first and passes the real results in as
// `products`. Everything the reply may assert about availability, price
// and retailer comes from that list.
import { buildSystemPrompt, sanitizeHistory } from "./_aria-prompt.js";

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
    const message = typeof body.message === "string" ? body.message : "";
    // History was already being sent by the caller and silently dropped
    // here, so every turn was answered with no memory of the last one.
    const history = sanitizeHistory(body.history);
    const products = Array.isArray(body.products) ? body.products.slice(0, 6) : [];

    const chatResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: buildSystemPrompt(products) },
          ...history,
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 250,
      }),
    });

    const chatData = await chatResponse.json();
    const reply = chatData?.choices?.[0]?.message?.content;
    if (!reply) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "No reply from model" }) };
    }

    // Grok TTS (still the cheaper voice option). A voice failure must not
    // cost the customer the text reply, so the audio is best-effort.
    let audioBase64 = null;
    try {
      const ttsResponse = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ voice_id: "ara", text: reply, language: "es" }),
      });
      if (ttsResponse.ok) {
        audioBase64 = Buffer.from(await ttsResponse.arrayBuffer()).toString("base64");
      }
    } catch {
      audioBase64 = null; // browser voice fallback handles this client-side
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply, audio: audioBase64 }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
