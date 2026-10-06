/* ============================================================
   THE EPHEMERAL KEY FOR A LIVE VOICE SESSION.

   WHY THIS ENDPOINT EXISTS AT ALL. A realtime session is a direct
   WebRTC connection from the shopper's browser to OpenAI — the audio
   never passes through us, which is the whole point, because a relay
   would add the latency the brief is written to remove. But a browser
   that connects directly needs a credential, and OPENAI_API_KEY must
   never be one of them: it is readable from view-source and spendable
   by anyone.

   So the standing key stays here and mints a SHORT-LIVED client secret
   (about a minute, single session). That secret is what the page gets.
   Worst case for a leaked one is a single voice session, not the
   account.

   THE SESSION IS BUILT HERE TOO, not in the page. The instructions and
   the tool list are what keep Aria from inventing a price; in the
   browser they would be editable from the console. Minting them with
   the token means the shopper cannot hand themselves a different Aria.
   ============================================================ */
import { buildRealtimeSession, REALTIME_API_BASE } from "../../scripts/lib/realtime-voice.js";

const MINT_TIMEOUT_MS = 8000;

/**
 * OpenAI's own words for what was wrong, without echoing the request.
 *
 * An error body carries { error: { message, code, param } }. The
 * message names the offending field, which is the single most useful
 * sentence in this whole endpoint; the rest of the body can contain
 * fragments of what we sent, so only these three are passed on.
 */
function upstreamMessage(text) {
  try {
    const e = JSON.parse(text).error || {};
    const parts = [e.message, e.param ? `(param: ${e.param})` : null, e.code ? `[${e.code}]` : null];
    const joined = parts.filter(Boolean).join(" ");
    if (joined) return joined.slice(0, 300);
  } catch { /* not JSON */ }
  return String(text || "").slice(0, 300);
}

export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    /* A credential, however short-lived, is never cached. */
    "Cache-Control": "no-store",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("FATAL: OPENAI_API_KEY not set in environment");
    /* LOUD, BY INSTRUCTION (2026-10-06). This used to answer 503 with
       a bare code on the reasoning that naming an environment
       variable on a public endpoint is information disclosure. That
       reasoning cost four rounds of testing: the page fell back, the
       shopper saw the old loop, and nothing anywhere said why. The
       variable's NAME tells an attacker nothing its absence doesn't
       already imply, and it tells us exactly what to fix. */
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "OPENAI_API_KEY not configured",
        detail: "Set OPENAI_API_KEY in the Netlify environment for this deploy context.",
      }),
    };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* defaults */ }
  /* The recipient is the only thing the client may influence, and only
     to personalise the prompt — it cannot add tools or rewrite rules. */
  const recipient = body && typeof body.recipient === "object" ? body.recipient : null;

  const session = buildRealtimeSession({
    recipient,
    model: process.env.ARIA_REALTIME_MODEL || undefined,
    voice: process.env.ARIA_REALTIME_VOICE || undefined,
  });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MINT_TIMEOUT_MS);
  /* Every attempt, in order, with what came back. Returned on failure
     and logged on success, because the one question this endpoint has
     had to answer four times is "which part did OpenAI not like". */
  const attempts = [];

  const post = async (url, payload) => {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    return { res: r, text: await r.text() };
  };

  try {
    let out = null;

    /* ------------------------------------------------------------
       PROGRESSIVE DEGRADATION.

       A 400 means this account's API version rejected a FIELD, not
       the request. Rather than fail the whole call over an optional
       audio tweak, drop the optional parts one layer at a time and
       report which layer worked. The parts that carry meaning —
       model, instructions, voice, turn detection, tools — are in
       every variant; only tuning is shed.

       Order matters: the first variant is the one we want, and we
       stop at the first that is accepted.
       ------------------------------------------------------------ */
    const variants = [
      ["completa", (x) => x],
      ["sin ajustes de audio", (x) => {
        const v = structuredClone(x);
        delete v.audio.input.noise_reduction;
        if (v.audio.output) delete v.audio.output.speed;
        return v;
      }],
      ["sin transcripción", (x) => {
        const v = structuredClone(x);
        delete v.audio.input.noise_reduction;
        if (v.audio.output) delete v.audio.output.speed;
        delete v.audio.input.transcription;
        return v;
      }],
      ["mínima", (x) => ({
        type: x.type,
        model: x.model,
        instructions: x.instructions,
        audio: { input: { turn_detection: x.audio.input.turn_detection },
                 output: { voice: x.audio.output.voice } },
        tools: x.tools,
        tool_choice: x.tool_choice,
      })],
    ];

    for (const [name, shape] of variants) {
      const payload = shape(session);
      let { res, text } = await post(`${REALTIME_API_BASE}/client_secrets`, { session: payload });
      let endpoint = "client_secrets";

      /* TWO SPELLINGS OF THE SAME CALL. /client_secrets is current;
         /sessions is the older one, which some keys still answer. A
         wrong path returns 404/405 and nothing else does. The legacy
         endpoint takes the fields at the top level rather than nested
         under `session`. */
      if (res.status === 404 || res.status === 405) {
        ({ res, text } = await post(`${REALTIME_API_BASE}/sessions`, payload));
        endpoint = "sessions";
      }

      attempts.push({ variant: name, endpoint, status: res.status, error: res.ok ? null : upstreamMessage(text) });
      if (res.ok) { out = { res, text, name, endpoint }; break; }

      /* Only a 400 is worth retrying smaller. A 401 is a bad key and
         a 403 is an account without access; neither improves by
         sending less, and hammering them four times is rude. */
      if (res.status !== 400) break;
    }

    if (!out) {
      const last = attempts[attempts.length - 1] || {};
      console.error("[aria-realtime] mint failed:", JSON.stringify(attempts));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "OpenAI Realtime API rejected the request",
          status: last.status || 0,
          /* 401 and 403 are the two worth naming outright: a key that
             is set but wrong, and a key without Realtime access.
             From the outside they look like every other failure. */
          detail: last.status === 401 ? "API key invalid — replace OPENAI_API_KEY in Netlify"
                : last.status === 403 ? "This API key has no access to the Realtime API or to this model"
                : last.error || "sin detalle",
          /* The whole ladder, so one curl says which field was the
             problem instead of another round of guessing. */
          attempts,
        }),
      };
    }

    const { text, name, endpoint } = out;
    if (name !== "completa") {
      console.warn(`[aria-realtime] accepted only the "${name}" session on /${endpoint}:`, JSON.stringify(attempts));
    }
    let data;
    try { data = JSON.parse(text); } catch {
      console.error("[aria-realtime] non-JSON from upstream", text.slice(0, 200));
      return { statusCode: 502, headers, body: JSON.stringify({ error: "realtime_bad_upstream" }) };
    }
    /* Shapes have moved between API versions; accept either and fail
       loudly rather than handing the page an undefined token it will
       only discover is missing during the SDP exchange. */
    const token = data?.value || data?.client_secret?.value;
    if (!token) {
      console.error("[aria-realtime] no client secret in response", Object.keys(data || {}).join(","));
      return { statusCode: 502, headers, body: JSON.stringify({ error: "realtime_no_token" }) };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        token,
        expires_at: data?.expires_at || null,
        model: session.model,
        /* Echoed back so the page can re-assert turn detection after a
           reconnect without keeping a second copy of it that will
           drift from this one. */
        turn_detection: session.audio.input.turn_detection,
        /* The page needs the URL to POST its SDP offer to; keeping it
           server-chosen means an API move is a deploy, not a rebuild
           of the client. */
        call_url: `${REALTIME_API_BASE}/calls`,
      }),
    };
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    console.error("[aria-realtime] mint error", aborted ? "timeout" : err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: aborted ? "realtime_timeout" : "realtime_unreachable" }),
    };
  } finally {
    clearTimeout(timer);
  }
}
