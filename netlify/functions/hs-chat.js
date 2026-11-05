/* ==================================================================
   ARIA HOME SHIELD: ONE TURN OF THE CONVERSATION.

   POST { messages: [{role:"user"|"assistant", content}], lang: "en"|"es",
          caseDraft?, voice? }
     -> { reply, caseDraft, ready }

   Same client pattern as aria-chat.js: the repo's OpenAI key and the
   model id and URL exported by _aria-chat-model.js (one place keeps the
   model id). Buffered, not streamed (aria-chat.js is buffered); the page
   shows a typing row while it waits. The model is asked for one JSON
   object; _hs-prompt.js parses it, validates the case draft against the
   contract and scrubs the anonymized summary.
   ================================================================== */
import { OPENAI_CHAT_URL, OPENAI_MODEL, OPENAI_REASONING_EFFORT } from "./_aria-chat-model.js";
import { buildHsSystemPrompt, parseModelReply, validateCaseDraft, isDraftReady, scrubPII, looksLikePII } from "./_hs-prompt.js";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const MAX_MESSAGES = 40;
const MAX_CHARS = 2000;
const MAX_COMPLETION_TOKENS = 900;
const TIMEOUT_MS = 25000;

/* Per-instance rate limit by IP: a warm function keeps the map; a cold one
   starts fresh. Enough to stop a loop or a script hammering the model. */
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

const json = (statusCode, obj) => ({ statusCode, headers: HEADERS, body: JSON.stringify(obj) });

export function sanitizeMessages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

export function buildRequest({ messages, lang, caseDraft, voice }, withJsonMode = true) {
  const req = {
    model: OPENAI_MODEL,
    messages: [{ role: "system", content: buildHsSystemPrompt({ lang, caseDraft, voice }) }, ...messages],
    reasoning_effort: OPENAI_REASONING_EFFORT,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
  };
  if (withJsonMode) req.response_format = { type: "json_object" };
  return req;
}

export async function handler(event, context) {
  const fetchImpl = (context && context.fetchImpl) || fetch;
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

  const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "")).split(",")[0].trim();
  if (rateLimited(ip)) return json(429, { error: "Too many messages. Please wait a minute and try again." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
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

  const call = async (withJsonMode) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl(OPENAI_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest({ messages, lang, caseDraft: prevDraft, voice }, withJsonMode)),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await call(true);
    if (res.status === 400) {
      // A model that refuses JSON mode still answers; the parser finds the object.
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch { /* not JSON */ }
      if (/response_format|json/i.test(detail)) res = await call(false);
      else return json(502, { error: "The model rejected the request", detail: detail.slice(0, 300) });
    }
    if (!res.ok) {
      let detail = null;
      try { const ej = await res.json(); detail = ej && ej.error && (ej.error.message || ej.error.code); } catch { /* not JSON */ }
      console.error("[hs-chat] model error", res.status, detail);
      return json(502, { error: `Model responded ${res.status}` + (detail ? ` — ${detail}` : "") });
    }
    const data = await res.json();
    const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const { reply, caseDraft } = parseModelReply(raw, prevDraft);
    if (!reply) return json(502, { error: "Empty reply from the model" });
    // Belt and braces: the summary is scrubbed in validateCaseDraft; if
    // anything still looks personal, scrub harder by dropping digits.
    if (looksLikePII(caseDraft.summary)) caseDraft.summary = scrubPII(caseDraft.summary, caseDraft).replace(/\d{3,}/g, "[number]");
    return json(200, { reply, caseDraft, ready: isDraftReady(caseDraft) });
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return json(aborted ? 504 : 500, { error: aborted ? "The model took too long to answer" : String((error && error.message) || error) });
  }
}
