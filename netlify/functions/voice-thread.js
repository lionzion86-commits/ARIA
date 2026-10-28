/* ============================================================
   /api/voice-thread -- the worker's door to the voice memory
   (_voice-thread.js). Never the page's: every request carries a
   worker token signed with LIVEKIT_API_SECRET, scoped to one thread.

     GET  ?thread=<id>                       the live memory
     POST { thread, room, lines: [...] }     append spoken lines
     POST { thread, room, call: {...} }      a finished call, for review

   ENVIRONMENT (names only): LIVEKIT_API_SECRET.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { VOICE_THREAD_STORE, verifyWorkerToken, readThread, appendLines, saveCall } from "./_voice-thread.js";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

export async function handler(event, env = process.env, store = null) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });
  if (!env.LIVEKIT_API_SECRET) return reply(503, { error: "LIVEKIT_API_SECRET not configured" });
  const auth = String((event.headers && (event.headers.authorization || event.headers.Authorization)) || "");
  const thread = verifyWorkerToken(auth.replace(/^Bearer\s+/i, ""), env.LIVEKIT_API_SECRET);
  if (!thread) return reply(401, { error: "unauthorized" });

  if (!store) {
    connectLambda(event);
    store = getStore({ name: VOICE_THREAD_STORE, consistency: "strong" });
  }
  try {
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.thread !== thread) return reply(403, { error: "wrong thread" });
      const rec = await readThread(store, thread);
      return reply(200, { thread, turns: rec.turns, calls: rec.calls || 0 });
    }
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "bad json" }); }
    if (body.thread !== thread) return reply(403, { error: "wrong thread" });
    if (body.room != null && !/^aria-[A-Za-z0-9_-]{1,40}$/.test(String(body.room))) return reply(400, { error: "bad room" });
    if (body.call) return reply(200, await saveCall(store, thread, body.room, body.call));
    if (Array.isArray(body.lines)) return reply(200, await appendLines(store, thread, body.lines.slice(0, 20), body.room));
    return reply(400, { error: "nothing to do" });
  } catch (e) {
    console.error("[voice-thread]", e.message);
    return reply(500, { error: "store failed" });
  }
}
