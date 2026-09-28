/* TEMPORARY DEBUG HARNESS (2026-09-28). Not for merge.
   Captures the RAW Groq SSE bytes for a chat payload so we can see WHY
   some prompts produce zero content deltas. Returns JSON with redacted
   raw bytes (first 6000 chars of the SSE stream), chunk statistics, and
   finish_reason / usage. NEVER logs or returns the API key.
   POST body: { message, history?, products?, recipient?, maxTokens?, reasoningEffort? }
   DELETE after diagnosis. */
import { chatRequestBody, GROQ_CHAT_URL } from "./_aria-chat-model.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, "Content-Type": "application/json" },
});

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!process.env.GROQ_API_KEY) return json(503, { error: "no key" });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "bad json" }); }

  const groqBody = { ...chatRequestBody(body), stream: true };
  if (Number.isFinite(body.maxTokens)) groqBody.max_tokens = body.maxTokens;
  if (typeof body.reasoningEffort === "string") groqBody.reasoning_effort = body.reasoningEffort;

  let upstream;
  try {
    upstream = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(groqBody),
    });
  } catch (e) { return json(502, { error: "fetch failed: " + e.message }); }

  const httpStatus = upstream.status;
  const rawBytes = await upstream.arrayBuffer();
  const raw = Buffer.from(rawBytes).toString("utf-8");

  // Stats over the SSE lines.
  let chunks = 0, withContent = 0, withReasoning = 0, withToolCalls = 0;
  let finishReason = null, usage = null, sseError = null;
  let contentChars = 0, reasoningChars = 0;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const p = t.slice(5).trim();
    if (!p || p === "[DONE]") continue;
    let o;
    try { o = JSON.parse(p); } catch { continue; }
    if (o.error) { sseError = JSON.stringify(o.error).slice(0, 500); continue; }
    if (o.usage) { usage = o.usage; continue; }
    const d = o.choices && o.choices[0] && o.choices[0].delta;
    if (o.choices && o.choices[0] && o.choices[0].finish_reason) finishReason = o.choices[0].finish_reason;
    if (!d) continue;
    chunks++;
    if (typeof d.content === "string" && d.content) { withContent++; contentChars += d.content.length; }
    const rc = d.reasoning_content || d.reasoning;
    if (typeof rc === "string" && rc) { withReasoning++; reasoningChars += rc.length; }
    if (d.tool_calls) withToolCalls++;
  }

  return json(200, {
    httpStatus,
    groqParams: { max_tokens: groqBody.max_tokens, reasoning_effort: groqBody.reasoning_effort || "(default)" },
    stats: { chunks, withContent, withReasoning, withToolCalls, contentChars, reasoningChars, finishReason, sseError, usage },
    rawHead: raw.slice(0, 6000),
  });
}
