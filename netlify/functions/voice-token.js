/* ============================================================
   /api/voice-token — THE OWNED VOICE'S DOOR (#443 c.6416074857).

   The page asks here first when the owned voice is switched on for it
   (?voz=propia); anything but a token sends it straight back to the
   Realtime voice, which stays live until the owned build passes its
   gates. So this endpoint can never leave the shop without a voice:
   off, unconfigured or broken, it answers `fallback: "realtime"`.

   What it returns is a LiveKit token for one fresh room with Aria's
   agent dispatched into it (_livekit-token.js). The instructions, the
   tools and the voice are the worker's; the page cannot choose them.

   ENVIRONMENT (names only): LIVEKIT_URL, LIVEKIT_API_KEY,
   LIVEKIT_API_SECRET; ARIA_VOICE_AGENT_NAME (default "aria");
   ARIA_VOICE_OWNED=off is the kill switch.
   ============================================================ */
import { shopperToken } from "./_livekit-token.js";
import { threadFor } from "./_voice-thread.js";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  /* A credential, however short-lived, is never cached. */
  "Cache-Control": "no-store",
};
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

export async function handler(event, env = process.env) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  if (String(env.ARIA_VOICE_OWNED || "").toLowerCase() === "off") {
    return reply(503, { error: "owned voice is switched off (ARIA_VOICE_OWNED=off)", fallback: "realtime" });
  }
  /* Named, never swallowed (the realtime-token lesson of 2026-10-06):
     a missing variable's NAME tells the person fixing it what to set. */
  const missing = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].filter((k) => !env[k]);
  if (missing.length) {
    console.error("[voice-token] not configured:", missing.join(", "));
    return reply(503, { error: `${missing.join(", ")} not configured`, fallback: "realtime" });
  }

  /* RETURN WITH MEMORY (#443 c.6420805882 rider 3): the page brings
     back the thread id it was given last time; the worker reads that
     thread from our store (/api/voice-thread) at the address sealed
     here. The address is this deploy's own, so a preview's calls stay
     in the preview's store. */
  let asked = null;
  try { asked = JSON.parse(event.body || "{}").thread; } catch { /* a fresh thread */ }
  const { thread, resumed } = threadFor(asked);
  const site = String(env.DEPLOY_PRIME_URL || env.URL || "").replace(/\/+$/, "");
  const t = shopperToken({
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    agentName: env.ARIA_VOICE_AGENT_NAME || "aria",
    metadata: { thread, memoryUrl: site ? site + "/api/voice-thread" : null },
  });
  /* The served variant, logged per mint (#443 c.6416056033 item 2):
     there is only one, and the log says so. */
  console.log(`[voice-token] minted room=${t.room} engine=owned-cascade thread=${resumed ? "resumed" : "new"}`);
  return reply(200, { engine: "owned", url: env.LIVEKIT_URL, token: t.token, room: t.room, identity: t.identity, expires_at: t.expires_at, thread });
}
