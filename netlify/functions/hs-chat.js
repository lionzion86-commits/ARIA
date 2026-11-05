/* ==================================================================
   ARIA HOME SHIELD: ONE TURN OF THE CONVERSATION, STREAMED.

   POST { messages: [{role:"user"|"assistant", content}], lang: "en"|"es",
          caseDraft?, voice?, policy? }
     -> text/event-stream:
          data: {"t":"<reply text delta>"}         (repeated, as it generates)
          data: {"done":true,"reply","caseDraft","ready"}
          data: {"error":"..."}                    (on a failure mid-stream)
        or JSON { error } with a 4xx/5xx before the stream opens.

   Same client pattern as aria-chat-stream.js: a streaming function
   (default export, web Request/Response), the repo's OpenAI key, and the
   model id + URL exported by _aria-chat-model.js. The model writes the
   reply as plain text, then CASE_MARK and the case draft as JSON; the
   draft never reaches the reply stream (replyStreamSplitter holds it
   back) and arrives validated and scrubbed in the done event. The page
   speaks the first sentence while the rest is still generating.
   ================================================================== */
import { OPENAI_CHAT_URL, OPENAI_MODEL, OPENAI_REASONING_EFFORT, deltaFromLine, isDoneLine, sseErrorFromLine } from "./_aria-chat-model.js";
import { buildHsSystemPrompt, parseModelReply, validateCaseDraft, isDraftReady, scrubPII, looksLikePII, replyStreamSplitter } from "./_hs-prompt.js";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
const SSE_HEADERS = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" };
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const MAX_MESSAGES = 40;
const MAX_CHARS = 2000;
const MAX_COMPLETION_TOKENS = 900;
const TIMEOUT_MS = 30000;

/* Per-instance rate limit by IP: a warm function keeps the map. */
const RATE = { windowMs: 60_000, max: 30 };
const hits = new Map();
export function rateLimited(ip, now = Date.now(), rate = RATE, map = hits) {
  const key = ip || "unknown";
  const arr = (map.get(key) || []).filter((t) => now - t < rate.windowMs);
  arr.push(now);
  map.set(key, arr);
  if (map.size > 5000) map.clear();
  return arr.length > rate.max;
}

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

export function sanitizeMessages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

export function buildRequest({ messages, lang, caseDraft, voice, policy }) {
  return {
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: buildHsSystemPrompt({ lang, caseDraft, voice, policy }) }, ...messages],
    reasoning_effort: OPENAI_REASONING_EFFORT,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    stream: true,
  };
}

export default async function handler(req, context) {
  const fetchImpl = (context && context.fetchImpl) || fetch;
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: JSON_HEADERS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const ip = String(req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (rateLimited(ip)) return json(429, { error: "Too many messages. Please wait a minute and try again.", code: "rate_limited" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  const lang = body.lang === "es" ? "es" : "en";
  const voice = body.voice === true;
  const messages = sanitizeMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json(400, { error: "messages must end with the homeowner's message" });
  }
  const prevDraft = validateCaseDraft(body.caseDraft || {}, null);
  if (!process.env.OPENAI_API_KEY) return json(503, { error: "OPENAI_API_KEY not configured" });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  if (req.signal) req.signal.addEventListener("abort", () => ac.abort(), { once: true });
  let upstream;
  try {
    upstream = await fetchImpl(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest({ messages, lang, caseDraft: prevDraft, voice, policy: body.policy || null })),
      signal: ac.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return json(error && error.name === "AbortError" ? 504 : 502, { error: "Could not reach the model: " + String((error && error.message) || error) });
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    let detail = null;
    try { const ej = await upstream.json(); detail = ej && ej.error && (ej.error.message || ej.error.code); } catch { /* not JSON */ }
    console.error("[hs-chat] model error", upstream.status, detail);
    return json(502, { error: `Model responded ${upstream.status}` + (detail ? ` — ${detail}` : "") });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ } };
      const split = replyStreamSplitter();
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          for (const line of lines) {
            if (isDoneLine(line)) continue;
            const err = sseErrorFromLine(line);
            if (err) throw new Error(err.message || "model stream error");
            const delta = deltaFromLine(line);
            if (delta === null) continue;
            const safe = split.push(delta).replace(EMOJI, "");
            if (safe) send({ t: safe });
          }
        }
        const { reply, caseDraft } = parseModelReply(split.full(), prevDraft);
        if (looksLikePII(caseDraft.summary)) caseDraft.summary = scrubPII(caseDraft.summary, caseDraft).replace(/\d{3,}/g, "[number]");
        if (!reply) send({ error: "Empty reply from the model" });
        else send({ done: true, reply, caseDraft, ready: isDraftReady(caseDraft) });
      } catch (error) {
        send({ error: error && error.name === "AbortError" ? "The model took too long to answer" : String((error && error.message) || error) });
      } finally {
        clearTimeout(timer);
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() { ac.abort(); },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

