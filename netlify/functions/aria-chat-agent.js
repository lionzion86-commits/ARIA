/* ============================================================
   ARIA AGENT TURN (2026-10-01, Danny: "true agentic behaviors").

   STATELESS AGENT LOOP, split across the wire: the model lives here
   (OpenAI primary, Groq fallback -- same as the classic endpoints),
   but her HANDS live in the browser, because the catalog lives in
   the browser. So one "turn" is actually a short dance:

     client -> POST { messages } -> this function
     this function -> { tool_calls: [...] }   (she wants searches)
     client runs search_products locally, appends tool results
     client -> POST { messages } -> this function
     ...
     this function -> { reply, show: [ids], audio }   (final answer)

   The client caps the dance at 4 rounds; a model that never stops
   searching is a bug, not thoroughness. If the providers fail, the
   client falls back to the classic pipeline -- this endpoint never
   degrades into a worse Aria, it just declines.
   ============================================================ */
import {
  buildAgentSystemPrompt,
  AGENT_TOOLS,
  sanitizeAgentHistory,
  extractShowIds,
} from "./_aria-agent-prompt.js";
import {
  sanitizeSpokenPunctuation,
  sanitizeEmojiNarration,
  speechFor,
  OPENAI_CHAT_URL,
  OPENAI_MODEL,
  OPENAI_REASONING_EFFORT,
  GROQ_CHAT_URL,
  GROQ_MODEL,
  TEMPERATURE,
  REASONING_EFFORT,
  EMPTY_REPLY_FALLBACK_ES,
} from "./_aria-chat-model.js";

const AGENT_MAX_TOKENS = 900;

function agentBody(messages, provider) {
  if (provider === "groq") {
    return {
      model: GROQ_MODEL,
      messages,
      temperature: TEMPERATURE,
      max_tokens: AGENT_MAX_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
    };
  }
  return {
    model: OPENAI_MODEL,
    messages,
    reasoning_effort: OPENAI_REASONING_EFFORT,
    max_completion_tokens: AGENT_MAX_TOKENS,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
  };
}

async function callProvider(url, key, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const body = JSON.parse(event.body || "{}");
    const history = sanitizeAgentHistory(body.history);
    const message = typeof body.message === "string" ? body.message : "";
    const recipient = body?.recipient && typeof body.recipient === "object" ? body.recipient : null;
    // Tool results arrive inside `history` on later rounds; the new user
    // message only exists on round one.
    const messages = [
      { role: "system", content: buildAgentSystemPrompt(recipient) },
      ...history,
      ...(message ? [{ role: "user", content: message }] : []),
    ];

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const GROQ_KEY = process.env.GROQ_API_KEY;

    let toolCalls = null;
    let reply = null;

    // PRIMARY: OpenAI. FALLBACK: Groq. Same turn, same tools.
    const attempts = [];
    if (OPENAI_KEY) attempts.push(["openai", OPENAI_CHAT_URL, OPENAI_KEY]);
    if (GROQ_KEY) attempts.push(["groq", GROQ_CHAT_URL, GROQ_KEY]);

    let lastError = null;
    for (const [provider, url, key] of attempts) {
      // One quiet retry for the empty-reply flake (see aria-chat-groq.js).
      for (let a = 0; a < 2; a++) {
        const { ok, status, data } = await callProvider(url, key, agentBody(messages, provider));
        if (!ok) {
          lastError = `${provider} ${status}`;
          // 429: try the next provider immediately, don't burn the retry.
          if (status === 429) break;
          continue;
        }
        const msg = data?.choices?.[0]?.message;
        if (msg?.tool_calls?.length) {
          toolCalls = msg.tool_calls
            .filter((tc) => tc?.type === "function" && tc?.function?.name === "search_products")
            .map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments || "{}" }))
            .slice(0, 3);
          if (toolCalls.length) break;
        }
        const content = typeof msg?.content === "string" ? msg.content.trim() : "";
        if (content) {
          reply = content;
          break;
        }
        lastError = `${provider} empty reply`;
      }
      if (toolCalls || reply) break;
    }

    if (toolCalls) {
      return { statusCode: 200, headers, body: JSON.stringify({ tool_calls: toolCalls }) };
    }
    if (reply) {
      const clean0 = sanitizeEmojiNarration(sanitizeSpokenPunctuation(reply));
      const { clean, ids } = extractShowIds(clean0);
      const audio = await speechFor(clean);
      return { statusCode: 200, headers, body: JSON.stringify({ reply: clean, show: ids, audio }) };
    }

    console.error("[aria-chat-agent] no provider answered:", lastError);
    return { statusCode: 502, headers, body: JSON.stringify({ error: lastError || "no provider answered", fallback: true }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, fallback: true }) };
  }
}
