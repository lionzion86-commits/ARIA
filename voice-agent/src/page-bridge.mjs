/* ============================================================
   THE WORKER'S LINE TO THE SHOPPER'S PAGE.

   Aria's hands live in the page: the catalogue she searches is the one
   the page already holds in memory, and her two server tools (the
   delivered-price formula, the order book) are called from the page
   too. The Realtime session runs every tool through the page's
   executeRealtimeTool, and so does this one -- over LiveKit RPC, so
   the owned voice searches, prices and opens products exactly as the
   Realtime one does, with no second copy of any of it.

   The methods, all JSON both ways:

     page -> worker   aria.ready    the page's speaker is playing; she
                                    may greet (the clipped-greeting
                                    fix, #443 c.6416056033 item 3)
     page -> worker   aria.cue      a doctrine line the page decided
                                    on (opening nudge, silence
                                    sign-off), said by the same brain
     page -> worker   aria.text     a line the shopper typed during the
                                    call; she answers it out loud
     worker -> page   aria.context  the page's memory of the
                                    conversation, read once per session
     worker -> page   aria.tool     run one tool, return its output
     worker -> page   aria.turn     one line of the conversation, for
                                    the page's transcript and memory;
                                    for the shopper's lines the page
                                    answers whether it was speech or
                                    noise (its filter, the same one
                                    the Realtime session uses)
   ============================================================ */

export const RPC = Object.freeze({
  READY: "aria.ready",
  CUE: "aria.cue",
  TEXT: "aria.text",
  CONTEXT: "aria.context",
  TOOL: "aria.tool",
  TURN: "aria.turn",
});

/* The first catalogue-backed search on a cold page loads the related
   pool (about thirteen seconds, measured in the Realtime era); a tool
   that times out before that is a silence the shopper hears twice. */
export const TOOL_TIMEOUT_MS = 15000;
export const TURN_TIMEOUT_MS = 3000;
export const CONTEXT_TIMEOUT_MS = 3000;

/* What she says when the page could not run a tool: the page's own
   words for the same failure (runRealtimeTool). */
export const TOOL_FAILED = Object.freeze({ unavailable: "esa consulta se me trabó, déjame intentar de nuevo" });

/* The page's memory comes back as chat turns; anything else is dropped
   rather than trusted. Twelve turns is the chat assistant's window. */
export const HISTORY_TURNS = 12;
export function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }));
}

/** The page context, or an empty one: a page that cannot answer still gets a voice. */
export async function readContext(rpc) {
  try {
    const out = JSON.parse(await rpc(RPC.CONTEXT, "{}", CONTEXT_TIMEOUT_MS));
    return { history: cleanHistory(out && out.history), recipient: out && typeof out.recipient === "object" ? out.recipient : null };
  } catch {
    return { history: [], recipient: null };
  }
}

/**
 * Run one tool in the page. Returns the tool's output object (the
 * framework serializes it once for the model -- a string here would
 * reach her JSON-encoded twice); a failure is TOOL_FAILED, never an
 * exception, because an exception here is a turn she never finishes.
 */
export async function runPageTool(rpc, name, args) {
  try {
    const out = JSON.parse(await rpc(RPC.TOOL, JSON.stringify({ name, arguments: JSON.stringify(args || {}) }), TOOL_TIMEOUT_MS));
    return out && typeof out === "object" ? out : TOOL_FAILED;
  } catch {
    return TOOL_FAILED;
  }
}

/**
 * Tell the page one line of the conversation. For the shopper's lines
 * the page answers { speech: false } when its filter reads noise (a
 * cough, her own voice coming back, a subtitle hallucination); any
 * failure to ask counts as speech, so a slow page never mutes her.
 */
export async function sendTurn(rpc, role, text) {
  try {
    const out = JSON.parse(await rpc(RPC.TURN, JSON.stringify({ role, text }), TURN_TIMEOUT_MS));
    return { speech: !(out && out.speech === false) };
  } catch {
    return { speech: true };
  }
}

/**
 * The tool table for the model: the Realtime tool specs, unchanged,
 * each executed in the page. `makeTool` is the framework's llm.tool,
 * passed in so this stays testable without a LiveKit runtime.
 */
export function pageTools(specs, makeTool, rpc, onCall = () => {}) {
  const out = {};
  for (const spec of specs) {
    /* Keyed by name: the framework takes the key as the tool's name. */
    out[spec.name] = makeTool({
      description: spec.description,
      parameters: spec.parameters,
      execute: async (args) => {
        const t0 = Date.now();
        const out = await runPageTool(rpc, spec.name, args);
        onCall({ name: spec.name, ms: Date.now() - t0, failed: out === TOOL_FAILED });
        return out;
      },
    });
  }
  return out;
}

/* [[SHOW: ...]] and [[SLOTS: ...]] lines belong to the chat's cards;
   the voice rules forbid them, and if one slips through it must never
   be read aloud. Applied to the text on its way to the voice. */
export function stripCardMarkers(text) {
  return String(text || "").replace(/\[\[[A-Z]+:[^\]]*\]\]/g, "").replace(/[ \t]{2,}/g, " ");
}
