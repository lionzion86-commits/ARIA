/* ============================================================
   /.netlify/functions/voice-diag -- THE CALL'S TRANSPORT REPORT
   (#443 c.6400516868, Danny's iPhone on #493: she never heard him and
   her first words were clipped; "diagnose at the capture/playback
   layer before any re-test").

   POST: the page sends one report when a live call ends (sendBeacon):
   timings of the mic grant, his track's mute/unmute events, the line's
   connection states, when her audio element started playing, and
   per-second byte and audio-level counters each way. Event names,
   timings and counters only -- no transcript, no audio. Kept as the
   last 50 in the "voice-diag" blob store and printed to the function
   log.

   GET (admin session only): the stored reports, newest first, so a
   failed run on a phone can be read without a laptop on the cable.
   ============================================================ */
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";

const KEEP = 50;
const MAX_BYTES = 32000;

/* Only the report's own shape survives: numbers, short strings, flat
   objects. Anything else a caller sends is dropped. */
function clean(r) {
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : undefined);
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const flat = (o) => {
    if (!o || typeof o !== "object") return o == null ? undefined : (typeof o === "string" ? o.slice(0, 80) : num(o) ?? (typeof o === "boolean" ? o : undefined));
    const out = {};
    for (const [k, v] of Object.entries(o).slice(0, 16)) {
      if (typeof v === "number") out[k.slice(0, 16)] = num(v);
      else if (typeof v === "boolean") out[k.slice(0, 16)] = v;
      else if (typeof v === "string") out[k.slice(0, 16)] = v.slice(0, 60);
    }
    return out;
  };
  return {
    v: num(r.v), ua: str(r.ua, 160), t0: num(r.t0),
    marks: (Array.isArray(r.marks) ? r.marks : []).slice(0, 120).map((m) => ({ t: num(m && m.t), n: str(m && m.n, 40), x: flat(m && m.x) })),
    stats: (Array.isArray(r.stats) ? r.stats : []).slice(0, 80).map((s) => flat(s)),
    tape: (Array.isArray(r.tape) ? r.tape : []).slice(-40).map((l) => str(l, 160)).filter(Boolean),
  };
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  const store = getStore("voice-diag");

  if (event.httpMethod === "POST") {
    const raw = String(event.body || "");
    if (raw.length > MAX_BYTES) return { statusCode: 413, headers, body: "" };
    let report;
    try { report = clean(JSON.parse(event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw)); }
    catch { return { statusCode: 400, headers, body: "" }; }
    const at = new Date().toISOString();
    console.log("[voice-diag]", JSON.stringify({ at, ...report }));
    try {
      const list = (await store.get("recent", { type: "json" })) || [];
      list.unshift({ at, ...report });
      await store.setJSON("recent", list.slice(0, KEEP));
    } catch (e) { console.error("[voice-diag] store failed:", e.message); }
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod === "GET") {
    const email = await getSessionEmail(event);
    if (!isAdmin(email)) return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
    const list = (await store.get("recent", { type: "json" })) || [];
    return { statusCode: 200, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(list) };
  }

  return { statusCode: 405, headers, body: "" };
}
