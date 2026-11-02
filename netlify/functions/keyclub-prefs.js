// The member's dashboard preferences (#443, Danny 2026-11-02): the theme
// («01 · El Lounge» / «02 · Amanecer») lives on her account, so it follows
// her to any phone; the page keeps a localStorage copy only to paint the
// right mood before this answers. Session-scoped: the account is the
// session's email and nothing else.
//
//   POST { theme: "lounge" | "amanecer" } -> { ok, theme }
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { normalizeTheme } from "./_keyclub.js";

/** Store-injected so the tests drive it. */
export async function savePrefs(users, email, body) {
  if (!email) return [401, { error: "Inicia sesión en tu cuenta Key Club." }];
  const theme = normalizeTheme(body && body.theme);
  if (!theme) return [400, { error: "Tema no válido" }];
  const user = await users.get(email, { type: "json" });
  if (!user) return [404, { error: "Cuenta no encontrada" }];
  await users.setJSON(email, { ...user, theme });
  return [200, { ok: true, theme }];
}

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("POST, OPTIONS"), "Cache-Control": "no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }
  try {
    const [code, out] = await savePrefs(getStore("users"), await getSessionEmail(event), body);
    return { statusCode: code, headers, body: JSON.stringify(out) };
  } catch (error) {
    console.error("[keyclub-prefs] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos guardar tu preferencia." }) };
  }
}
