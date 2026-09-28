// Secure middleman between ariashop.pe and Grok. Used for the opening
// greeting when the chat panel is first opened; aria-chat-groq.js handles
// the actual conversation.
//
// THE TEXT HERE IS STILL GROK'S; ONLY THE VOICE MOVED (2026-09-28). The
// greeting is spoken by ElevenLabs "Lily" like every other Aria
// utterance, but the words are still written by grok-4 through
// GROK_API_KEY. That matters for the xAI subscription: cancelling it
// silences nothing, it empties the greeting — this endpoint would throw
// on the chat call above and the client would fall back to its hardcoded
// "¡Hola! Soy el asistente de Aria". Moving this brain is a separate
// brief; see the PR body.
import { buildSystemPrompt, sanitizeHistory } from "./_aria-prompt.js";
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
    const message = typeof body.message === "string" ? body.message : "";
    const history = sanitizeHistory(body.history);
    const products = Array.isArray(body.products) ? body.products.slice(0, 6) : [];
    // Recipient gender/age the client extracted; see recipientRulesEs.
    const recipient = body.recipient && typeof body.recipient === "object" ? body.recipient : null;

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
          { role: "system", content: buildSystemPrompt(products, recipient) },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });

    const chatData = await chatResponse.json();
    const replyText = chatData.choices[0].message.content;

    /* Step 2: that reply in Aria's voice — ElevenLabs "Lily", through
       the SHARED renderer in _aria-chat-model.js.

       THIS FILE USED TO CARRY ITS OWN COPY of the TTS call, which is
       exactly how the greeting could have kept the old xAI voice while
       the rest of the assistant moved to Lily — the first thing a
       shopper hears, in a different voice from everything after it.
       One call site now, and a test pins that a second one does not
       come back.

       BEST EFFORT, WHICH IS ALSO NEW HERE. The old inline call assumed
       success: a non-OK response was read as an array buffer anyway and
       base64'd into `audio`, so a TTS outage handed the browser an
       error page encoded as sound. speechFor() returns null instead,
       and the client already treats null as "use the browser's voice". */
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
