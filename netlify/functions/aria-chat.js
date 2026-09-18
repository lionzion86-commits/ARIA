// Secure middleman between ariashop.pe and Grok. Used for the opening
// greeting when the chat panel is first opened; aria-chat-groq.js handles
// the actual conversation.
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
    const history = sanitizeHistory(body.history);
    const products = Array.isArray(body.products) ? body.products.slice(0, 6) : [];

    // Step 1: Get Grok's text reply
    const chatResponse = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-4",
        messages: [
          // Same prompt the main chat endpoint uses, from the shared
          // module — this one previously carried its own copy of the
          // retailer list (which had already drifted, naming Best Buy)
          // and no shipping rules at all, so a greeting turn could invent
          // shipping figures the rest of the site never states.
          { role: "system", content: buildSystemPrompt(products) },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });

    const chatData = await chatResponse.json();
    const replyText = chatData.choices[0].message.content;

    // Step 2: Convert that reply to speech using Grok's Ara voice
    const speechResponse = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: replyText,
        voice_id: "ara",
        language: "es",
      }),
    });

    const audioBuffer = await speechResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

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
