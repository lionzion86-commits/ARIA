// The Key Club verification code, checked (#443, Danny 2026-11-02,
// c.6570940933 .. c.6570984289). The rules live in _keyclub-verify.js:
// single use, 10 minutes, 5 wrong tries, stored only as a salted hash.
//
//   POST { code } -> { ok, phoneVerified, verifiedVia, redirect }
//
// Right: the account records verifiedAt / verifiedVia, and phoneVerified
// only when the code went to her phone (WhatsApp or SMS).
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { KEYCLUB_STORE } from "./_keyclub.js";
import { checkCode } from "./_keyclub-verify.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("POST, OPTIONS"), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
  try {
    const stores = { users: getStore("users"), keyclub: getStore(KEYCLUB_STORE) };
    const [code, out] = await checkCode(stores, await getSessionEmail(event), body || {});
    console.info("[auth-verify-check]", JSON.stringify({ ok: !!out.ok, code: out.code || null }));
    return { statusCode: code, headers, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[auth-verify-check] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: "No pudimos revisar tu código. Intenta de nuevo en un momento." }) };
  }
}
