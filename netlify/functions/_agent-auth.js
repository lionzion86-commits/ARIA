// COMPRADORES -- the `agent` role on top of the existing auth (#443,
// agent dashboard Phase 1). Underscore: not an endpoint; agent-queue.js
// and admin-agents.js import it.
//
// SAME AUTH, ONE NEW ROLE. A comprador signs in with the ordinary
// account login (auth-login.js, the "sessions" store). What makes her a
// comprador is a flag on her "users" record that only Danny sets
// (admin-agents.js): { role: "agent", agentActive: true }. Invite-only:
// the flag goes on an account that already exists, never by sign-up.
// Deactivation is instant because every request re-reads the record --
// there is no token that outlives the flag.
//
// Admins stay admins through ADMIN_EMAILS (isAdmin), exactly as admin.html.
//
// PHASE 1: the queue is the SAMPLE batch (assets/agent/sample-batch.js),
// split by the same morningSplit the dashboard runs. Phase 2 swaps the
// sample for yesterday's orders from the "orders" store.
import { getSessionEmail, isAdmin, normalizeEmail } from "./_auth-helpers.js";
import { roleOf, ROLES, buildDay, scopeForRole, boardRows, accountRows } from "../../assets/agent/agent-core.js";
import { SAMPLE_BATCH } from "../../assets/agent/sample-batch.js";

/** { email, role, user } for this request; role is "admin", "agent" or null. */
export async function callerRole(event, { users, getEmail = getSessionEmail, admin = isAdmin }) {
  const email = await getEmail(event);
  if (!email) return { email: null, role: null, user: null };
  let user = null;
  try { user = await users.get(email, { type: "json" }); } catch { user = null; }
  return { email, role: roleOf({ email, isAdmin: admin(email), user }), user };
}

/** Active compradores, sorted by email (the order that maps each to a sample slot). */
export async function listAgents(users) {
  const { blobs } = await users.list();
  const recs = await Promise.all(blobs.map((b) => users.get(b.key, { type: "json" }).catch(() => null)));
  return recs
    .filter((u) => u && u.role === ROLES.AGENT)
    .map((u) => ({ email: u.email, name: u.name || null, active: u.agentActive !== false, invitedAt: u.agentInvitedAt || null }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Invite / deactivate / reactivate / remove. Only on an account that exists. */
export async function setAgent(users, rawEmail, { agent, active }, by, now = new Date().toISOString()) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: 400, body: { error: "Falta un correo válido" } };
  const u = await users.get(email, { type: "json" });
  if (!u) return { status: 404, body: { error: "No hay una cuenta con ese correo. Primero tiene que crearla." } };
  const next = { ...u };
  if (agent === false) {
    delete next.role; delete next.agentActive;
  } else if (agent === true) {
    next.role = ROLES.AGENT; next.agentActive = true; next.agentInvitedAt = now; next.agentInvitedBy = by;
  } else if (typeof active === "boolean") {
    if (u.role !== ROLES.AGENT) return { status: 400, body: { error: "Esa cuenta no es de comprador" } };
    next.agentActive = active; next.agentActiveAt = now; next.agentActiveBy = by;
  } else {
    return { status: 400, body: { error: "Falta agent: true/false o active: true/false" } };
  }
  await users.setJSON(email, next);
  return { status: 200, body: { email, role: next.role || null, active: next.role === ROLES.AGENT ? next.agentActive !== false : false } };
}

/** The day built from the sample batch (Phase 1). */
export function sampleDay() {
  return buildDay(SAMPLE_BATCH);
}

/**
 * GET agent-queue: an agent gets ONLY her queue and history; an admin
 * gets the whole day; anyone else is refused.
 */
export async function queueResponse(ctx, { users }) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role === ROLES.ADMIN) return { status: 200, body: { role: ROLES.ADMIN, sample: true, day: sampleDay() } };
  if (ctx.role !== ROLES.AGENT) return { status: 403, body: { error: "Esta cuenta no es de comprador" } };
  const day = sampleDay();
  const active = (await listAgents(users)).filter((a) => a.active);
  const idx = Math.max(0, active.findIndex((a) => a.email === ctx.email));
  const slot = day.agents[idx % day.agents.length];
  const scoped = scopeForRole(day, ROLES.AGENT, slot.id);
  if (scoped.agent) scoped.agent = { ...scoped.agent, name: (ctx.user && ctx.user.name) || scoped.agent.name, demo: false };
  return { status: 200, body: { role: ROLES.AGENT, sample: true, agentId: slot.id, ...scoped } };
}

/** GET admin-agents: the board, the accounts and the invited logins. Admin only. */
export async function boardResponse(ctx, { users }, now = new Date().toISOString()) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role !== ROLES.ADMIN) return { status: 403, body: { error: "No autorizado" } };
  const day = sampleDay();
  return { status: 200, body: { sample: true, logins: await listAgents(users), board: boardRows(day, now), accounts: accountRows(day), exceptions: day.exceptions } };
}
