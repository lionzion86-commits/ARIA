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
     {"done":true,"reply":"..."}      the finished reply -- text first,
                                      always, even if voice fails
     {"audio":"<base64>"}             Ara's voice, when available; a
                                      trailing event that may arrive after
                                      done, or never -- the client speaks
                                      whenever it lands
     {"error":"..."}                  give up and fall back

   The full reply is repeated in the `done` event on purpose. The client
   needs one authoritative string for the chat history it sends back to
   the model next turn, and re-assembling it from deltas means trusting
   that no event was dropped between here and a phone on mobile data.

   NOTHING ABOUT THE ANSWER CHANGES. The model, the temperature, the
   reply-length cap and the system prompt come from _aria-chat-model.js,
   which aria-chat-groq.js also uses, so the two endpoints cannot answer
   differently. The only line this one alters is `stream: true`.

   EMPTY-REPLY RETRY (2026-09-28). gpt-oss-120b can answer HTTP 200 with
   zero content deltas when it spends its token budget reasoning (see
   REASONING_EFFORT in _aria-chat-model.js) — deterministic per prompt,
   not a flake. One internal retry on a fresh connection covers the
   hiccup; a second empty answer becomes an error event so the client
   falls through to the buffered endpoint, whose own last line is a
   graceful spoken fallback. The client NEVER sees "No reply from model".
   ============================================================ */
import { chatRequestBody, deltaFromLine, isDoneLine, sseErrorFromLine, sanitizeSpokenPunctuation, speechFor, GROQ_CHAT_URL } from "./_aria-chat-model.js";

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

async function fetchGroq(body) {
  return fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...chatRequestBody(body), stream: true }),
  });
}

/* The client-facing message for a Groq SSE error event. A 429 here wears
   HTTP 200 — it keeps the shape the client already 429-handles, with
   Groq's own retry hint intact. */
function sseGroqErrorMessage(sseErr) {
  const code = sseErr.code === 429 || /rate limit/i.test(sseErr.message) ? 429 : (sseErr.code || "error");
  return `Groq respondió ${code}` + (sseErr.message ? ` — ${sseErr.message}` : "");
}

/* Reads one Groq SSE stream to completion. onDelta fires per content
   delta (already forwarded to the shopper). Returns the full reply text
   — possibly "" when Groq spent the whole budget reasoning. Throws
   { sseGroqError: true, message } on an SSE error event; anything else
   thrown is a transport failure. */
async function readGroqReply(upstream, onDelta) {
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
        const sseErr = sseErrorFromLine(line);
        if (sseErr) throw { sseGroqError: true, message: sseGroqErrorMessage(sseErr) };
        const delta = deltaFromLine(line);
        if (delta === null) continue;
        reply += delta;
        onDelta(delta);
      }
    }
    buffered += decoder.decode();
    const tailErr = sseErrorFromLine(buffered);
    if (tailErr) throw { sseGroqError: true, message: sseGroqErrorMessage(tailErr) };
    const tail = deltaFromLine(buffered);
    if (tail) { reply += tail; onDelta(tail); }
    return reply;
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
}

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
    upstream = await fetchGroq(body);
  } catch (error) {
    return json(502, { error: error.message });
  }

  /* A MODEL ERROR IS NOT A STREAM. Failing before the first byte means
     the client gets a normal status code and falls back cleanly, rather
     than opening an event stream that immediately says "sorry". */
  if (!upstream.ok || !upstream.body) {
    /* Forward the real upstream failure incl. Groq's own retry hint
       ("try again in 2.775s") — the client parses it for the smart 429
       retry instead of guessing. */
    let gDetail = null;
    try { const ej = await upstream.json(); const ge = ej && ej.error; gDetail = ge && (ge.message || ge.code || ge); } catch (e2) { /* not JSON */ }
    console.error('[aria-chat-stream] Groq error', upstream.status, gDetail);
    return json(502, { error: `Groq respondió ${upstream.status}` + (gDetail ? ` — ${gDetail}` : '') });
  }

  const encoder = new TextEncoder();
  const send = (controller, obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      const fail = (msg) => { send(controller, { error: msg }); controller.close(); };
      let reply = "";
      try {
        reply = await readGroqReply(upstream, (d) => send(controller, { t: d }));
      } catch (error) {
        /* An SSE error event (incl. a 429 wearing HTTP 200) is reported
           exactly once, in the shape the client already handles. */
        if (error && error.sseGroqError) {
          console.error("[aria-chat-stream] Groq SSE error", error.message);
          fail(error.message);
          return;
        }
        /* MID-STREAM TRANSPORT FAILURE KEEPS WHAT IT HAS. Whatever Aria
           had already said stays on screen and is returned as the reply,
           so a dropped connection leaves a short answer rather than
           deleting a paragraph the shopper was reading. */
        if (reply) send(controller, { done: true, reply: sanitizeSpokenPunctuation(reply), truncated: true });
        else fail(error && error.message ? error.message : "error de conexión");
        controller.close();
        return;
      }

      if (!reply) {
        /* EMPTY PARSE, ONE INTERNAL RETRY (2026-09-28). Groq answered
           200 with zero content deltas — almost always the reasoning
           budget being spent before the first word (see
           REASONING_EFFORT). A fresh connection gets a fresh roll; the
           first attempt sent no deltas, so nothing is rendered twice. */
        console.error("[aria-chat-stream] empty reply, one internal retry");
        let retryUpstream = null;
        try {
          retryUpstream = await fetchGroq(body);
        } catch (error) {
          fail(error && error.message ? error.message : "error de conexión");
          return;
        }
        if (!retryUpstream.ok || !retryUpstream.body) {
          let gDetail = null;
          try { const ej = await retryUpstream.json(); const ge = ej && ej.error; gDetail = ge && (ge.message || ge.code || ge); } catch (e2) { /* not JSON */ }
          const msg = `Groq respondió ${retryUpstream.status}` + (gDetail ? ` — ${gDetail}` : '');
          console.error('[aria-chat-stream] Groq error (retry)', retryUpstream.status, gDetail);
          fail(msg);
          return;
        }
        try {
          reply = await readGroqReply(retryUpstream, (d) => send(controller, { t: d }));
        } catch (error) {
          if (error && error.sseGroqError) {
            console.error("[aria-chat-stream] Groq SSE error (retry)", error.message);
            fail(error.message);
            return;
          }
          if (reply) send(controller, { done: true, reply: sanitizeSpokenPunctuation(reply), truncated: true });
          else fail(error && error.message ? error.message : "error de conexión");
          controller.close();
          return;
        }
      }

      if (!reply) {
        /* Still nothing after a fresh retry: this is not a 429 and not
           a transport failure, so it becomes the error event the client
           already falls through to the buffered endpoint on. The
           buffered endpoint's own last line is a graceful spoken
           fallback — the shopper never sees "No reply from model". */
        console.error("[aria-chat-stream] empty reply twice, falling through to buffered endpoint");
        fail("Groq devolvió una respuesta vacía tras reintento");
        return;
      }

      /* VOICE IS DECOUPLED FROM TEXT (2026-09-27). Done used to wait for
         Grok's TTS round trip, so the words sat on screen in silence while
         the audio rendered. Now done carries the text immediately and the
         audio follows as its own trailing event; the client speaks whenever
         it lands, and a TTS failure never delays or blocks the reply. Best
         effort, as it has always been: no audio event means the browser's
         own voice takes over client-side. The reply is sanitized (see
         sanitizeSpokenPunctuation) so dictated punctuation words never
         reach the shopper as words, in the bubble or the voice. */
      send(controller, { done: true, reply: sanitizeSpokenPunctuation(reply) });
      const audio = await speechFor(reply);
      if (audio) send(controller, { audio });
      controller.close();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
