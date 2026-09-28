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
//
// STILL HERE, AND ON PURPOSE (2026-09-22). aria-chat-stream.js renders
// the same reply token by token and is what index.html tries first. This
// endpoint is the fallback it drops back to — a Netlify deploy that does
// not flush an event stream, an old cached page, a browser without
// ReadableStream. It is also the only shape that can answer at all from
// a V1 Lambda handler, which is what this is.
//
// The request it sends is built by _aria-chat-model.js, which the
// streaming endpoint also uses, so the two cannot answer differently:
// same model, same temperature, same cap, same system prompt. That
// matters more than the duplication it removes — a shopper getting a
// different Aria depending on whether streaming worked today is the
// failure this shares a module to prevent.
import { chatRequestBody, sanitizeSpokenPunctuation, speechFor, GROQ_CHAT_URL } from "./_aria-chat-model.js";

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

    /* EMPTY-REPLY RETRY (2026-09-27): Groq intermittently answers 200
       with zero content — especially on product-grounded prompts — and a
       second request on a fresh backend almost always answers. One quiet
       retry here; a 429 is never retried (it returns immediately below)
       and the client never sees the hiccup. */
    let chatResponse = null;
    let chatData = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      chatResponse = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chatRequestBody(body)),
      });
      chatData = await chatResponse.json();
      if (!chatResponse.ok || chatData?.choices?.[0]?.message?.content) break;
      console.error("[aria-chat-groq] empty reply, retrying once");
    }
    /* FORWARD THE REAL UPSTREAM FAILURE (2026-09-27): "No reply from
       model" swallowed 429s and made every outage undiagnosable — the
       client now shows the code, so give it the code. */
    if (!chatResponse.ok) {
      const gErr = chatData && chatData.error;
      const gMsg = gErr && (gErr.message || gErr.code || gErr);
      console.error('[aria-chat-groq] Groq error', chatResponse.status, gMsg);
      return { statusCode: 502, headers, body: JSON.stringify({ error: `Groq respondió ${chatResponse.status}` + (gMsg ? ` — ${gMsg}` : '') }) };
    }
    // Dictated punctuation words ("comma", "punto") must never reach the
    // shopper as words — sanitizeSpokenPunctuation turns them into the
    // marks they mean, so the bubble, the voice and the history all agree.
    const reply = sanitizeSpokenPunctuation(chatData?.choices?.[0]?.message?.content);
    if (!reply) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "No reply from model" }) };
    }

    // Grok TTS (still the cheaper voice option). A voice failure must not
    // cost the customer the text reply, so the audio is best-effort — see
    // speechFor(), which is the same call this file used to make inline.
    const audioBase64 = await speechFor(reply);

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
