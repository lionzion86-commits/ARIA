// The Key Club verification code, sent (#443, Danny 2026-11-02,
// c.6570940933 .. c.6570984289). The rules live in _keyclub-verify.js.
//
//   GET                               -> the step's state for the signed-in
//                                        account (masked phone and email,
//                                        needsVerification, phoneVerified).
//   POST { channel, purpose? }        -> a 6-digit code to "whatsapp" | "sms"
//                                        | "email". purpose "phone" is an
//                                        active member verifying her cell
//                                        later (WhatsApp or SMS only).
//
// Session-scoped: auth-confirm.js opens the session when the email link
// is used, so the step runs signed in. A channel that is not live answers
// { sent: false, code: "channel_unavailable", message, offer: "email" }:
// the page says so in Spanish and offers the email. Never a false "sent".
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { KEYCLUB_STORE } from "./_keyclub.js";
import { sendCode, verifyStatus } from "./_keyclub-verify.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, POST, OPTIONS"), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  try {
    const email = await getSessionEmail(event);
    const stores = { users: getStore("users"), keyclub: getStore(KEYCLUB_STORE) };
    if (event.httpMethod === "GET") {
      if (!email) return { statusCode: 200, headers, body: JSON.stringify({ signedIn: false }) };
      const user = await stores.users.get(email, { type: "json" });
      if (!user) return { statusCode: 200, headers, body: JSON.stringify({ signedIn: false }) };
      return { statusCode: 200, headers, body: JSON.stringify(verifyStatus(user)) };
    }
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
    const [code, out] = await sendCode(stores, email, body || {});
    // The channel and the outcome only: never the address, the number or the code.
    console.info("[auth-verify-send]", JSON.stringify({ channel: body && body.channel, sent: !!out.sent, code: out.code || null }));
    return { statusCode: code, headers, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[auth-verify-send] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ sent: false, error: "No pudimos enviar tu código. Intenta de nuevo en un momento." }) };
  }
}
