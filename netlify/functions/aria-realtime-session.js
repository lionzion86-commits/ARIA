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
    console.info("[aria-realtime] no API key configured — the page will use the speech-to-text loop");
    /* NOT AN ERROR THE SHOPPER SHOULD SEE AS A FAILURE. The page falls
       back to the speech-to-text loop, which is what every shopper has
       today, so this answers 503 with a reason the client can log and
       move on from quietly. */
    return {
      statusCode: 503,
      headers,
      /* The reason is logged, not returned: this is a public
         endpoint and naming internal environment variables in a
         response tells a stranger how the server is wired. */
      body: JSON.stringify({ error: "realtime_unconfigured" }),
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
  try {
    /* TWO SPELLINGS OF THE SAME CALL. /client_secrets is the current
       one; /sessions is the older one the brief was written against,
       and some keys still answer only that. Rather than guess which
       this account has — untestable from here, egress to OpenAI is
       blocked — try the current one and fall back on a 404/405, which
       is what a wrong path returns and nothing else does. The two
       differ in shape too, which is why the token is read defensively
       below. */
    let res = await fetch(`${REALTIME_API_BASE}/client_secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session }),
      signal: ac.signal,
    });
    if (res.status === 404 || res.status === 405) {
      console.info("[aria-realtime] /client_secrets not available, trying /sessions");
      res = await fetch(`${REALTIME_API_BASE}/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        /* The legacy endpoint takes the session fields at the top
           level rather than nested under `session`. */
        body: JSON.stringify(session),
        signal: ac.signal,
      });
    }
    const text = await res.text();
    if (!res.ok) {
      /* The upstream body is logged for us, never returned verbatim:
         an API error can echo request detail, and this is a public
         endpoint. */
      console.error("[aria-realtime] mint failed", res.status, text.slice(0, 400));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "realtime_mint_failed", status: res.status }),
      };
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
