/* ============================================================
   ARIA'S REPLY, AS IT IS WRITTEN.

   THE PROBLEM. aria-chat-groq.js waits for the whole reply, then hands
   it over in one JSON body. The shopper watches a spinner for the full
   model latency and then a paragraph appears at once. Nothing is broken
   and it reads as broken.

   WHY THIS IS A SEPARATE FILE AND NOT A FLAG ON THE OLD ONE.
   aria-chat-groq.js is a Netlify FUNCTIONS V1 handler -- the
   `export async function handler(event)` Lambda shape, which returns a
   complete response object. That shape cannot stream: there is nowhere
   to put a body that is still arriving. Streaming needs the V2 signature
   below (a Request in, a Response out), which can return a live
   ReadableStream. The two styles coexist in this directory, so this is
   an addition and the old endpoint is untouched.

   THE OLD ENDPOINT IS THE FALLBACK, AND THAT IS DELIBERATE. Whether a
   given Netlify deploy really flushes a streamed response through its
   CDN could not be verified from the build environment -- *.netlify.app
   is blocked by the egress proxy here, so nothing was proved against a
   real deploy. index.html therefore tries this endpoint and drops back
   to aria-chat-groq.js on any failure, including a response that
   arrives buffered instead of streamed. The worst case is the site
   behaving exactly as it does today.

   THE WIRE FORMAT (server-sent events, one JSON object per event):
     {"t":"texto"}                    a delta, append it
     {"done":true,"reply":"...",      the finished reply, plus Ara's
      "audio":"<base64>|null"}         voice if it was available
     {"error":"..."}                  give up and fall back

   The full reply is repeated in the `done` event on purpose. The client
   needs one authoritative string for the chat history it sends back to
   the model next turn, and re-assembling it from deltas means trusting
   that no event was dropped between here and a phone on mobile data.

   NOTHING ABOUT THE ANSWER CHANGES. The model, the temperature, the
   reply-length cap and the system prompt come from _aria-chat-model.js,
   which aria-chat-groq.js also uses, so the two endpoints cannot answer
   differently. The only line this one alters is `stream: true`.
   ============================================================ */
import { chatRequestBody, deltaFromLine, isDoneLine, speechFor, GROQ_CHAT_URL } from "./_aria-chat-model.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* `X-Accel-Buffering: no` is the one that matters in practice: an
   intermediary that buffers an event stream turns this back into the
   endpoint it replaces, silently and with worse latency. */
const SSE_HEADERS = {
  ...CORS,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!process.env.GROQ_API_KEY) return json(503, { error: "GROQ_API_KEY no está configurado" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Cuerpo no es JSON" });
  }

  let upstream;
  try {
    upstream = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...chatRequestBody(body), stream: true }),
    });
  } catch (error) {
    return json(502, { error: error.message });
  }

  /* A MODEL ERROR IS NOT A STREAM. Failing before the first byte means
     the client gets a normal status code and falls back cleanly, rather
     than opening an event stream that immediately says "sorry". */
  if (!upstream.ok || !upstream.body) {
    return json(502, { error: `Groq respondió ${upstream.status}` });
  }

  const encoder = new TextEncoder();
  const send = (controller, obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let reply = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          /* `stream: true` on the decoder matters: a multi-byte
             character (and Spanish is full of them) can be split across
             two TCP reads, and decoding each read independently turns
             "envío" into a replacement character. */
          buffered += decoder.decode(value, { stream: true });
          /* SSE events are newline-delimited and a read can end
             mid-line, so only complete lines are judged and the
             remainder stays buffered for the next read. */
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          for (const line of lines) {
            if (isDoneLine(line)) continue;
            const delta = deltaFromLine(line);
            if (delta === null) continue;
            reply += delta;
            send(controller, { t: delta });
          }
        }
        buffered += decoder.decode();
        const tail = deltaFromLine(buffered);
        if (tail) { reply += tail; send(controller, { t: tail }); }

        if (!reply) {
          send(controller, { error: "No reply from model" });
          controller.close();
          return;
        }

        /* ARA'S VOICE STILL ARRIVES, just last instead of first. It
           needs the whole reply, which only exists now, and the text is
           already on screen by the time this resolves — so the round
           trip costs the shopper nothing they can see. Best effort, as
           it has always been: null here means the browser's own voice
           takes over client-side. */
        send(controller, { done: true, reply, audio: await speechFor(reply) });
        controller.close();
      } catch (error) {
        /* MID-STREAM FAILURE KEEPS WHAT IT HAS. Whatever Aria had
           already said stays on screen and is returned as the reply, so
           a dropped connection leaves a short answer rather than
           deleting a paragraph the shopper was reading. */
        if (reply) send(controller, { done: true, reply, audio: null, truncated: true });
        else send(controller, { error: error.message });
        controller.close();
      } finally {
        try { await reader.cancel(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
