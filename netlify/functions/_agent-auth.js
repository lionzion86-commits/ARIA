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
// PHASE 1: on a deploy preview or localhost the queue is the SAMPLE batch
// (assets/agent/sample-batch.js), split by the same morningSplit the
// dashboard runs. On the production domain (any host demoAllowed refuses)
// there is NO sample: the queue is empty until Phase 2 fills it from
// yesterday's orders in the "orders" store.
import { getSessionEmail, isAdmin, normalizeEmail } from "./_auth-helpers.js";
import { roleOf, ROLES, buildDay, scopeForRole, boardRows, accountRows, demoAllowed } from "../../assets/agent/agent-core.js";
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

/** The request's host, as the browser addressed it. */
export function hostOf(event) {
  const h = (event && event.headers) || {};
  return String(h.host || h.Host || "").toLowerCase();
}

/** Danny's pay per purchase, null until he sets it. */
export async function readPay(settings) {
  if (!settings) return null;
  try {
    const v = await settings.get("pay", { type: "json" });
    return v && typeof v.payPerPurchasePen === "number" ? v.payPerPurchasePen : null;
  } catch { return null; }
}
export async function writePay(settings, value, by, now = new Date().toISOString()) {
  if (value !== null && !(typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1000)) {
    return { status: 400, body: { error: "La tarifa tiene que ser un número en soles, o vacía (por definir)" } };
  }
  await settings.setJSON("pay", { payPerPurchasePen: value, setBy: by, setAt: now });
  return { status: 200, body: { payPerPurchasePen: value } };
}

/** The day: the sample batch where demo data may exist, an empty day everywhere else. */
export function sampleDay(host = "localhost", pay = null) {
  if (demoAllowed(host)) {
    const d = buildDay(SAMPLE_BATCH);
    d.settings.payPerPurchasePen = pay;
    return { ...d, sample: true };
  }
  return { date: new Date().toISOString().slice(0, 10), sample: false, agents: [], accounts: [], orders: [], history: [],
    shifts: {}, exceptions: [], chat: [], storeNotes: [], storeFlags: [], cards: {}, ledger: [], log: [], outbox: [],
    settings: { payPerPurchasePen: pay }, seq: 0 };
}

/**
 * GET agent-queue: an agent gets ONLY her queue and history; an admin
 * gets the whole day; anyone else is refused.
 */
export async function queueResponse(ctx, { users, settings = null, host = "localhost" }) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  const pay = await readPay(settings);
  const day = sampleDay(host, pay);
  if (ctx.role === ROLES.ADMIN) return { status: 200, body: { role: ROLES.ADMIN, sample: day.sample, day } };
  if (ctx.role !== ROLES.AGENT) return { status: 403, body: { error: "Esta cuenta no es de comprador" } };
  const me = { id: ctx.email, name: (ctx.user && ctx.user.name) || ctx.email.split("@")[0], demo: false };
  if (!day.sample) {
    /* Production, Phase 1: her login works, her list is empty until Phase 2. */
    return { status: 200, body: { role: ROLES.AGENT, sample: false, agentId: me.id, date: day.date, agent: me, accounts: [], orders: [], history: [], chat: [], settings: { payPerPurchasePen: pay } } };
  }
  const active = (await listAgents(users)).filter((a) => a.active);
  const idx = Math.max(0, active.findIndex((a) => a.email === ctx.email));
  const slot = day.agents[idx % day.agents.length];
  const scoped = scopeForRole(day, ROLES.AGENT, slot.id);
  if (scoped.agent) scoped.agent = { ...scoped.agent, name: me.name, demo: false };
  return { status: 200, body: { role: ROLES.AGENT, sample: true, agentId: slot.id, ...scoped } };
}

/* POST agent-queue { events }: the phone's outbox. Each event is kept
   once under its own id (a resend after a dropped signal overwrites
   itself, never duplicates). Agent role only; she can only send her own. */
const EVENT_TYPES = new Set(["comprada", "excepcion", "salida"]);
export async function acceptEvents(ctx, body, { events: store }, now = new Date().toISOString()) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role !== ROLES.AGENT) return { status: 403, body: { error: "Esta cuenta no es de comprador" } };
  const list = Array.isArray(body && body.events) ? body.events.slice(0, 200) : null;
  if (!list) return { status: 400, body: { error: "Faltan los eventos" } };
  const accepted = [], rejected = [];
  for (const e of list) {
    const ok = e && typeof e.id === "string" && e.id.length <= 120 && EVENT_TYPES.has(e.type) && !Number.isNaN(Date.parse(e.at))
      && (e.orderId == null || (typeof e.orderId === "string" && e.orderId.length <= 60));
    if (!ok) { rejected.push(e && e.id); continue; }
    const rec = { id: e.id, type: e.type, orderId: e.orderId || null, at: e.at, agentEmail: ctx.email, receivedAt: now,
      data: JSON.parse(JSON.stringify(e.data || {}).slice(0, 2000) || "{}") };
    await store.setJSON(`${String(e.at).slice(0, 10)}/${ctx.email}/${e.id}`, rec);
    accepted.push(e.id);
  }
  return { status: 200, body: { accepted, rejected } };
}

/** GET admin-agents: the board, the accounts and the invited logins. Admin only. */
export async function boardResponse(ctx, { users, settings = null, host = "localhost" }, now = new Date().toISOString()) {
  if (!ctx.email) return { status: 401, body: { error: "Inicia sesión" } };
  if (ctx.role !== ROLES.ADMIN) return { status: 403, body: { error: "No autorizado" } };
  const pay = await readPay(settings);
  const day = sampleDay(host, pay);
  return { status: 200, body: { sample: day.sample, payPerPurchasePen: pay, logins: await listAgents(users), board: boardRows(day, now), accounts: accountRows(day), exceptions: day.exceptions } };
}
