// Los Elegidos — pick / reject / unpick a member (2026-10-01).
//
// POST (admin only — real session whose email is on ADMIN_EMAILS):
//   { "email": "ana@correo.com", "status": "fundador" }
//   { "emails": ["a@x.com", "b@x.com"], "status": "fundador" }  (bulk)
//
// status: "fundador" | "rechazado" | "pending"
// Sets founderStatus on the user record and keeps the pickedCount counter
// in the "founders-meta" store exact — only transitions INTO or OUT OF
// "fundador" move the counter, so re-picking an already-picked member
// can never double-count.
//
// Note: member notification (email/WhatsApp "¡Eres uno de los 1000
// Fundadores!") is deliberately out of scope for this pass — the status
// unlocks checkout immediately, notification comes with the comms wiring.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders, normalizeEmail } from "./_auth-helpers.js";

const VALID_STATUS = new Set(["fundador", "rechazado", "pending"]);

async function adjustPickedCount(delta) {
  const meta = getStore("founders-meta");
  let current = 0;
  try {
    const m = await meta.get("counts", { type: "json" });
    if (m && Number.isFinite(Number(m.pickedCount))) current = Math.max(0, Math.floor(Number(m.pickedCount)));
  } catch { /* start at 0 */ }
  const next = Math.max(0, current + delta);
  await meta.setJSON("counts", { pickedCount: next, updatedAt: new Date().toISOString() });
  return next;
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const adminEmail = await getSessionEmail(event);
  if (!isAdmin(adminEmail)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const status = String(body.status || "");
  if (!VALID_STATUS.has(status)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Estado inválido" }) };
  }

  const rawEmails = Array.isArray(body.emails) ? body.emails : (body.email ? [body.email] : []);
  const emails = [...new Set(rawEmails.map((e) => normalizeEmail(e)).filter(Boolean))].slice(0, 200);
  if (!emails.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Sin correos válidos" }) };
  }

  try {
    const users = getStore("users");
    let delta = 0;
    const updated = [];
    const missing = [];
    for (const em of emails) {
      const u = await users.get(em, { type: "json" });
      if (!u) {
        missing.push(em);
        continue;
      }
      const before = u.founderStatus || "pending";
      if (before === status) {
        updated.push(em); // no-op, already there
        continue;
      }
      u.founderStatus = status;
      u.founderStatusAt = new Date().toISOString();
      await users.setJSON(em, u);
      if (status === "fundador" && before !== "fundador") delta += 1;
      if (status !== "fundador" && before === "fundador") delta -= 1;
      updated.push(em);
    }

    const pickedCount = delta !== 0 ? await adjustPickedCount(delta) : await (async () => {
      try {
        const m = await getStore("founders-meta").get("counts", { type: "json" });
        return m && Number.isFinite(Number(m.pickedCount)) ? Math.floor(Number(m.pickedCount)) : 0;
      } catch { return 0; }
    })();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, updated, missing, pickedCount }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
