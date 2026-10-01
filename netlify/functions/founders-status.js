// Los Elegidos — public status endpoint (2026-10-01).
//
// One call tells the storefront everything it needs:
//   - who the caller is (anonymous vs member) and their founder status
//   - how many founders have been picked (the curated count — selection
//     is hand-picked by Danny, never first-come-first-served)
//   - how many spots remain of the 1,000
//   - which foundersMode the campaign is in:
//       'off'  — pre-launch: signups open, checkout normal for everyone
//       'gate' — Oct 20 → Nov 10: only picked founders can check out
//       'open' — Nov 10+: gates open, everyone checks out
//
// pickedCount lives in a dedicated "founders-meta" blob maintained by
// founders-pick.js, so the homepage counter costs 3 small blob reads
// (user record, meta, settings) instead of a full user-table scan.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, corsHeaders } from "./_auth-helpers.js";

export const FOUNDERS_TARGET = 1000;
const VALID_MODES = new Set(["off", "gate", "open"]);

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = await getSessionEmail(event);
  let me = null;
  if (email) {
    try {
      const users = getStore("users");
      const u = await users.get(email, { type: "json" });
      if (u) {
        me = {
          email: u.email,
          name: u.name || null,
          founderStatus: u.founderStatus || "pending",
        };
      }
    } catch { /* treat as anonymous rather than failing the page */ }
  }

  let pickedCount = 0;
  let memberCount = 0;
  let foundersMode = "off";
  try {
    const meta = getStore("founders-meta");
    const m = await meta.get("counts", { type: "json" });
    if (m && Number.isFinite(Number(m.pickedCount))) pickedCount = Math.max(0, Math.floor(Number(m.pickedCount)));
  } catch { /* meta missing before first pick — 0 is correct */ }
  try {
    const users = getStore("users");
    const { blobs } = await users.list();
    memberCount = blobs.length;
  } catch { /* non-fatal */ }
  try {
    const settings = getStore("settings");
    const s = await settings.get("global", { type: "json" });
    if (s && VALID_MODES.has(s.foundersMode)) foundersMode = s.foundersMode;
  } catch { /* non-fatal */ }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      email: me ? me.email : null,
      name: me ? me.name : null,
      founderStatus: me ? me.founderStatus : null,
      pickedCount,
      memberCount,
      target: FOUNDERS_TARGET,
      spotsRemaining: Math.max(0, FOUNDERS_TARGET - pickedCount),
      foundersMode,
    }),
  };
}
