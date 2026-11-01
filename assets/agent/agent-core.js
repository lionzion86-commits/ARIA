/* ==================================================================
   COMPRADORES -- the purchasing-agent dashboard's rules (#443, build
   order c.6548594565, design c.6548851542, deep links c.6548858279).

   ONE MODULE, TWO READERS. agente.html and admin-agentes.html import it
   in the browser; netlify/functions/agent-queue.js and admin-agents.js
   import it on the server; scripts/test/agent-dashboard-tests.mjs holds
   it to the spec. No DOM, no network, no storage here: every function
   takes the day's state and returns what changed, so the same rule runs
   in the demo (state in localStorage) and, in Phase 2, against the
   orders store.

   STAFF ONLY. The storefront rule "never link out to a retailer" does
   not apply here: COMPRAR is a direct anchor to the exact product page,
   by spec. Nothing in this file is shown to a shopper.
   ================================================================== */

/* ---------------- the ship-to, exactly (design delta 2) -------------- */

export const ALMACEN_FIXED_LINES = Object.freeze([
  "AMEX",
  "8010 NW 66th Street, Miami, FL 33166",
  "+1 828 458 8578",
]);

/** The ALMACEN block for one order: four lines, the first carries the customer's full name. */
export function almacenLines(customerFullName) {
  const name = String(customerFullName || "").replace(/\s+/g, " ").trim();
  return [`ARIASHOP ${name}`.trim(), ...ALMACEN_FIXED_LINES];
}
export function almacenBlock(customerFullName) {
  return almacenLines(customerFullName).join("\n");
}

/* ---------------- roles ---------------------------------------------- */

export const ROLES = Object.freeze({ ADMIN: "admin", AGENT: "agent" });

/**
 * Who the caller is to this dashboard. `isAdmin` comes from ADMIN_EMAILS
 * (the existing admin gate); an agent is an account Danny invited
 * (`role: "agent"`) and has not deactivated. Anyone else is nobody here.
 */
export function roleOf({ email, isAdmin = false, user = null } = {}) {
  if (!email) return null;
  if (isAdmin) return ROLES.ADMIN;
  if (user && user.role === ROLES.AGENT && user.agentActive !== false) return ROLES.AGENT;
  return null;
}

/** What a role may see of the day: an agent only her own queue and history. */
export function scopeForRole(state, role, agentId) {
  if (role === ROLES.ADMIN) return state;
  if (role !== ROLES.AGENT || !agentId) throw Object.assign(new Error("No autorizado"), { code: 403 });
  const mine = (o) => o.assignedTo === agentId;
  const orders = (state.orders || []).filter(mine).map(agentView);
  const accIds = new Set(orders.map((o) => o.accountId));
  return {
    date: state.date,
    agent: (state.agents || []).find((a) => a.id === agentId) || null,
    accounts: (state.accounts || []).filter((a) => accIds.has(a.id)),
    orders,
    history: (state.history || []).filter(mine).map(agentView),
    chat: state.chat || [],
    settings: { payPerPurchasePen: payRate(state) },
  };
}

/** The fields an agent's packet carries. The fallback search string is admin/lead only (deep-link spec 3). */
export function agentView(order) {
  const { fallbackSearch, ...rest } = order; // eslint-disable-line no-unused-vars
  return rest;
}

/* ---------------- money and the ceiling ------------------------------ */

/* PHASE 1 SETTING, NOT A FACT. The ceiling is the order's own line
   price times quantity plus this margin (sales tax room), rounded up to
   the cent. Danny sets the real margin per store in Phase 2. */
export const CEILING_MARGIN = 0.10;
export const round2 = (n) => Math.round(Number(n) * 100) / 100;
export function ceilingUsd(priceUsd, qty = 1, margin = CEILING_MARGIN) {
  const base = Number(priceUsd) * (Number(qty) || 1);
  if (!Number.isFinite(base) || base <= 0) return null;
  return Math.ceil(base * (1 + margin) * 100) / 100;
}
export const usd = (n) => "$" + Number(n).toFixed(2);

/* ---------------- soles next to every dollar (improvement pass 3) ------
   The rate is the site's own: SUNAT venta from
   /.netlify/functions/exchange-rate, through the same 24-hour cache key
   ("aria_fx_rate_v1") checkout and the storefront share -- loaded by
   agent-store.js. It is NEVER a number typed here: without a valid rate
   the soles side reads "S/ no disponible", never a guess. The bounds
   are the ones orders-create.js applies to the same endpoint. */
export const FX_CACHE_KEY = "aria_fx_rate_v1";
export const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PEN_UNAVAILABLE = "S/ no disponible";
export function validVenta(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 2 && v < 6 ? v : null;
}
/** The cached rate, if it is fresh and sane; else null. */
export function fxFromCache(raw, now = Date.now()) {
  try {
    const c = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (c && validVenta(c.venta) && typeof c.fetchedAt === "number" && now - c.fetchedAt < FX_CACHE_TTL_MS) return c;
  } catch { /* corrupt cache */ }
  return null;
}
export function penOf(usdAmount, venta) {
  const v = validVenta(venta);
  const u = Number(usdAmount);
  return v && Number.isFinite(u) ? round2(u * v) : null;
}
export const pen = (n) => "S/ " + Number(n).toFixed(2);
/** "$7.69 · S/ 28.84", or "$7.69 · S/ no disponible" with no rate. */
export function dual(usdAmount, venta) {
  const p = penOf(usdAmount, venta);
  return `${usd(usdAmount)} · ${p == null ? PEN_UNAVAILABLE : pen(p)}`;
}
export function ceilingSentence(ceiling, venta = null) {
  const p = penOf(ceiling, venta);
  return `Paga hasta ${usd(ceiling)} (${p == null ? PEN_UNAVAILABLE : pen(p)}) — si cuesta más, no compres, repórtalo`;
}

/* ---------------- where demo mode may run (auth rule c.6550830674) ----
   Sample data and the demo pickers exist ONLY on deploy previews of this
   site and on a developer's own machine. Deny by default: the production
   domain, branch deploys and any other host get the real login only. */
export function demoAllowed(host) {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  return /^deploy-preview-\d+--ariashopperu\.netlify\.app$/.test(h);
}

/* ---------------- morning split (build order + design delta 5) ------- */

/**
 * Assign each order a store account with room under its DAILY CAP, then
 * split the day evenly across agents, keeping each store and each store
 * account together as far as an even split allows.
 *
 *   orders    [{ orderId, store, ... }]
 *   agents    [{ id }]
 *   accounts  [{ id, store, dailyCap }]
 *   usage     { [accountId]: purchases already made today }
 *
 * Returns { assigned: [{ orderId, agentId, accountId }], held: [{ orderId, reason }] }.
 * An order whose store has no account with room is HELD, never assigned:
 * the cap is enforced here, in software, not by an agent's memory.
 */
export function morningSplit(orders, agents, accounts, usage = {}) {
  const used = { ...usage };
  const byStore = new Map();
  for (const a of accounts) {
    if (!byStore.has(a.store)) byStore.set(a.store, []);
    byStore.get(a.store).push(a);
  }
  const held = [];
  const placed = [];
  const sorted = [...orders].sort((x, y) => String(x.store).localeCompare(String(y.store)) || String(x.orderId).localeCompare(String(y.orderId)));
  for (const o of sorted) {
    const acc = pickAccount(byStore.get(o.store) || [], used);
    if (!acc) { held.push({ orderId: o.orderId, reason: "tope_diario", reasonLabel: "Tope diario de la cuenta" }); continue; }
    used[acc.id] = (used[acc.id] || 0) + 1;
    placed.push({ orderId: o.orderId, store: o.store, accountId: acc.id });
  }
  /* Contiguous by store, then account: fill each agent to her even share. */
  placed.sort((x, y) => String(x.store).localeCompare(String(y.store)) || String(x.accountId).localeCompare(String(y.accountId)) || String(x.orderId).localeCompare(String(y.orderId)));
  const n = agents.length;
  const assigned = [];
  if (!n) return { assigned, held: held.concat(placed.map((p) => ({ orderId: p.orderId, reason: "sin_agentes", reasonLabel: "Sin compradores" }))) };
  const base = Math.floor(placed.length / n), extra = placed.length % n;
  let i = 0;
  agents.forEach((ag, k) => {
    const share = base + (k < extra ? 1 : 0);
    for (let j = 0; j < share; j++, i++) assigned.push({ orderId: placed[i].orderId, agentId: ag.id, accountId: placed[i].accountId });
  });
  return { assigned, held };
}

/** The account for one more purchase today: the least used one with room, or null. */
export function pickAccount(storeAccounts, used) {
  let best = null;
  for (const a of storeAccounts) {
    if (a.active === false) continue;
    const u = used[a.id] || 0;
    if (u >= a.dailyCap) continue;
    if (!best || u < (used[best.id] || 0)) best = a;
  }
  return best;
}

export function accountUsage(state) {
  const used = {};
  for (const o of state.orders || []) if (o.status === "comprada" && o.accountId) used[o.accountId] = (used[o.accountId] || 0) + 1;
  return used;
}
export function accountHasRoom(state, accountId) {
  const acc = (state.accounts || []).find((a) => a.id === accountId);
  if (!acc || acc.active === false) return false;
  return (accountUsage(state)[accountId] || 0) < acc.dailyCap;
}

/** Build the day's state from a batch: the split stamped onto each order. */
export function buildDay(batch, { usage = {} } = {}) {
  const orders = batch.orders.map((o) => ({ ...o }));
  const { assigned, held } = morningSplit(orders, batch.agents, batch.accounts, usage);
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  for (const a of assigned) Object.assign(byId.get(a.orderId), { assignedTo: a.agentId, accountId: a.accountId, status: "por_comprar" });
  /* The day's list in queue order: store, then account, as split. */
  const rank = new Map(assigned.map((a, i) => [a.orderId, i]));
  orders.sort((x, y) => (rank.has(x.orderId) ? rank.get(x.orderId) : 1e9) - (rank.has(y.orderId) ? rank.get(y.orderId) : 1e9));
  const exceptions = [];
  for (const h of held) {
    Object.assign(byId.get(h.orderId), { assignedTo: null, accountId: null, status: "retenida", heldReason: h.reasonLabel });
  }
  const day = {
    date: batch.date,
    agents: batch.agents.map((a) => ({ ...a })),
    accounts: batch.accounts.map((a) => ({ ...a })),
    orders,
    history: (batch.history || []).map((o) => ({ ...o })),
    shifts: {},
    exceptions,
    chat: [],
    storeNotes: [],
    storeFlags: [],
    cards: {},
    ledger: [],
    log: [],
    outbox: [],
    settings: { payPerPurchasePen: null, ...(batch.settings || {}) },
    seq: 0,
  };
  linkGuard(day, batch.date + "T08:00:00.000Z");
  return day;
}

/* ---------------- shift: clock-in and breaks -------------------------- */

export const BREAKS = Object.freeze({ bano: "Baño", almuerzo: "Almuerzo" });

export function clockIn(state, agentId, now) {
  const s = state.shifts[agentId] || (state.shifts[agentId] = { clockIn: null, breaks: [], onBreak: null });
  if (!s.clockIn) s.clockIn = now;
  return s;
}
export function startBreak(state, agentId, kind, now) {
  if (!BREAKS[kind]) throw new Error("Pausa desconocida");
  const s = clockIn(state, agentId, now);
  if (s.onBreak) return s;
  s.onBreak = { kind, label: BREAKS[kind], start: now };
  return s;
}
export function endBreak(state, agentId, now) {
  const s = state.shifts[agentId];
  if (!s || !s.onBreak) return s;
  s.breaks.push({ ...s.onBreak, end: now });
  s.onBreak = null;
  return s;
}
/** End of shift: any open break ends, the clock stops. */
export function clockOut(state, agentId, now) {
  const s = state.shifts[agentId];
  if (!s || !s.clockIn) return null;
  if (s.onBreak) endBreak(state, agentId, now);
  if (!s.clockOut) s.clockOut = now;
  queueEvent(state, { type: "salida", orderId: null, agentId, at: s.clockOut, data: {} });
  return s;
}
/** Minutes worked: clock-in to now (or clock-out), less breaks (the paused clock). */
export function workedMinutes(state, agentId, now) {
  const s = state.shifts[agentId];
  if (!s || !s.clockIn) return 0;
  if (s.clockOut) now = s.clockOut;
  let ms = Date.parse(now) - Date.parse(s.clockIn);
  for (const b of s.breaks) ms -= Date.parse(b.end) - Date.parse(b.start);
  if (s.onBreak) ms -= Date.parse(now) - Date.parse(s.onBreak.start);
  return Math.max(0, Math.floor(ms / 60000));
}

/* ---------------- the two lists --------------------------------------- */

export function porComprar(state, agentId) {
  return state.orders.filter((o) => o.assignedTo === agentId && o.status === "por_comprar");
}
export function compradas(state, agentId) {
  return state.orders
    .filter((o) => o.assignedTo === agentId && o.status === "comprada")
    .sort((a, b) => String(b.boughtAt).localeCompare(String(a.boughtAt)));
}
/** Por comprar, grouped BY STORE, stores in the order the queue meets them. */
export function porComprarByStore(state, agentId) {
  const groups = new Map();
  for (const o of porComprar(state, agentId)) {
    if (!groups.has(o.store)) groups.set(o.store, { store: o.store, storeLabel: o.storeLabel, orders: [] });
    groups.get(o.store).orders.push(o);
  }
  return [...groups.values()];
}
export function nextOrder(state, agentId) {
  return porComprar(state, agentId)[0] || null;
}

/* ---------------- completion ----------------------------------------- */

/**
 * Bought. Needs the retailer's order number, the total actually charged
 * and a confirmation screenshot -- all three, or nothing moves. The
 * order goes to Compradas with the clock time, the ledger row is paid,
 * the one-order card is closed, and the account's cap counts it.
 */
export function completeOrder(state, orderId, agentId, input, now) {
  const o = state.orders.find((x) => x.orderId === orderId);
  const errors = [];
  if (!o || o.assignedTo !== agentId) return { ok: false, errors: ["Este pedido no está en tu lista"] };
  if (o.status !== "por_comprar") return { ok: false, errors: ["Este pedido ya no está por comprar"] };
  const num = String((input && input.retailerOrderNumber) || "").trim();
  const total = Number(String((input && input.chargedTotalUsd) ?? "").replace(/[^0-9.]/g, ""));
  const shot = input && input.screenshot;
  if (!num) errors.push("Falta el número de pedido de la tienda");
  if (!(Number.isFinite(total) && total > 0)) errors.push("Falta el total cobrado");
  if (!shot || !shot.name) errors.push("Falta la captura de la confirmación");
  if (Number.isFinite(total) && o.ceilingUsd != null && total > o.ceilingUsd) {
    errors.push(`El total pasa el tope de ${usd(o.ceilingUsd)}. No se marca: usa Problema, «Precio subió».`);
  }
  if (o.accountId && !accountHasRoom(state, o.accountId)) errors.push("La cuenta de la tienda llegó a su tope diario");
  if (errors.length) return { ok: false, errors };
  Object.assign(o, {
    status: "comprada",
    boughtAt: now,
    retailerOrderNumber: num,
    chargedTotalUsd: round2(total),
    screenshot: { name: String(shot.name).slice(0, 120), size: Number(shot.size) || null },
    /* The existing ledger's ops entry (netlify/functions/_ledger.js:
       Costo producto reads actuals.precioRealPagadoUsd). */
    actuals: { ...(o.actuals || {}), precioRealPagadoUsd: round2(total) },
  });
  const card = state.cards[orderId];
  if (card) { card.closedAt = now; card.capturedUsd = round2(total); }
  state.ledger.push({ orderId, status: "paid", amountUsd: round2(total), retailerOrderNumber: num, at: now, agentId });
  log(state, now, agentId, "comprada", orderId);
  queueEvent(state, { type: "comprada", orderId, agentId, at: now, data: { retailerOrderNumber: num, chargedTotalUsd: round2(total), screenshot: o.screenshot.name } });
  return { ok: true, order: o, next: nextOrder(state, agentId), milestone: milestoneFor(state, agentId) };
}

/* ---------------- problems -> the exception queue --------------------- */

export const PROBLEM_PRESETS = Object.freeze([
  { id: "precio_subio", label: "Precio subió" },
  { id: "sin_stock", label: "Sin stock" },
  { id: "tienda_bloqueo", label: "La tienda me bloqueó" },
  { id: "tarjeta_no_paso", label: "La tarjeta no pasó" },
]);
export const LINK_DOWN = Object.freeze({ id: "link_caido", label: "Link caído" });

/** One tap: the order leaves the agent's list for Danny's exception queue, tagged; she keeps moving. */
export function reportProblem(state, orderId, agentId, presetId, now, note = "") {
  const preset = PROBLEM_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ok: false, errors: ["Ese problema no existe"] };
  const o = state.orders.find((x) => x.orderId === orderId);
  if (!o || o.assignedTo !== agentId || o.status !== "por_comprar") return { ok: false, errors: ["Este pedido no está en tu lista"] };
  const ex = openException(state, o, preset, agentId, now, note);
  return { ok: true, exception: ex, next: nextOrder(state, agentId) };
}

function openException(state, o, preset, agentId, now, note) {
  state.seq = (state.seq || 0) + 1;
  const ex = {
    id: "EX-" + String(state.seq).padStart(3, "0"),
    orderId: o.orderId, store: o.store, storeLabel: o.storeLabel,
    reason: preset.id, reasonLabel: preset.label,
    fromAgent: agentId, at: now, note: String(note || "").slice(0, 500),
    status: "abierta", resolvedAt: null, toAgent: null,
  };
  state.exceptions.push(ex);
  Object.assign(o, { status: "excepcion", exceptionId: ex.id, previousAgent: agentId || o.assignedTo, assignedTo: null });
  const card = state.cards[o.orderId];
  if (card && !card.closedAt) card.closedAt = now;
  log(state, now, agentId, "excepcion:" + preset.id, o.orderId);
  if (agentId) queueEvent(state, { type: "excepcion", orderId: o.orderId, agentId, at: now, data: { reason: preset.id, note: ex.note } });
  return ex;
}

/** REASIGNAR: Danny hands the order to an agent (it lands at the top of her queue). */
export function reassignException(state, exceptionId, toAgentId, now) {
  const ex = state.exceptions.find((e) => e.id === exceptionId);
  if (!ex || ex.status !== "abierta" && ex.status !== "retenida") return { ok: false, errors: ["Esa excepción ya se resolvió"] };
  if (!state.agents.some((a) => a.id === toAgentId)) return { ok: false, errors: ["Ese comprador no existe"] };
  const o = state.orders.find((x) => x.orderId === ex.orderId);
  Object.assign(ex, { status: "reasignada", toAgent: toAgentId, resolvedAt: now });
  Object.assign(o, { status: "por_comprar", assignedTo: toAgentId, exceptionId: null });
  /* Top of her queue. */
  state.orders.splice(state.orders.indexOf(o), 1);
  const firstOfHers = state.orders.findIndex((x) => x.assignedTo === toAgentId && x.status === "por_comprar");
  state.orders.splice(firstOfHers < 0 ? state.orders.length : firstOfHers, 0, o);
  delete state.cards[o.orderId]; // a fresh one-order card for the new attempt
  log(state, now, "admin", "reasignada:" + toAgentId, o.orderId);
  return { ok: true, exception: ex, order: o };
}
/** Hold: it stays out of every queue until Danny decides. */
export function holdException(state, exceptionId, now) {
  const ex = state.exceptions.find((e) => e.id === exceptionId);
  if (!ex || ex.status !== "abierta") return { ok: false, errors: ["Esa excepción ya se resolvió"] };
  Object.assign(ex, { status: "retenida", resolvedAt: now });
  const o = state.orders.find((x) => x.orderId === ex.orderId);
  o.status = "retenida";
  o.heldReason = ex.reasonLabel;
  log(state, now, "admin", "retenida", o.orderId);
  return { ok: true, exception: ex };
}

/** Admin board drag / "Mover a": move one pending order to another agent's queue. */
export function moveOrder(state, orderId, toAgentId) {
  const o = state.orders.find((x) => x.orderId === orderId);
  if (!o || o.status !== "por_comprar") return { ok: false, errors: ["Solo se mueve un pedido por comprar"] };
  if (!state.agents.some((a) => a.id === toAgentId)) return { ok: false, errors: ["Ese comprador no existe"] };
  o.assignedTo = toAgentId;
  return { ok: true, order: o };
}

/**
 * Midday auto-rebalance (design delta 4): a lagging agent's remaining
 * queue is shared with whoever has the least left, whole orders from the
 * END of her queue, until no two clocked-in agents differ by more than
 * `tolerance`. Agents not clocked in receive nothing.
 */
export function rebalance(state, { tolerance = 1 } = {}) {
  const live = state.agents.filter((a) => state.shifts[a.id] && state.shifts[a.id].clockIn);
  const moves = [];
  if (live.length < 2) return moves;
  for (let guard = 0; guard < 1000; guard++) {
    const left = live.map((a) => ({ a, q: porComprar(state, a.id) })).sort((x, y) => y.q.length - x.q.length);
    const most = left[0], least = left[left.length - 1];
    if (most.q.length - least.q.length <= tolerance) break;
    const o = most.q[most.q.length - 1];
    o.assignedTo = least.a.id;
    moves.push({ orderId: o.orderId, from: most.a.id, to: least.a.id });
  }
  return moves;
}

/* ---------------- the one-order card (design delta 3) ----------------- */

export const CARD_REVEAL_MS = 10 * 60 * 1000;

/**
 * The SANDBOX one-order virtual card. Amount and merchant locked to this
 * order; shown ONCE, for ten minutes, then hidden for good; closed when
 * the purchase is captured. There is no card issuer in this repo yet
 * (no Lithic prototype was found), so the number is an obviously fake
 * placeholder and never a real PAN.
 */
export function revealCard(state, orderId, agentId, now) {
  const o = state.orders.find((x) => x.orderId === orderId);
  if (!o || o.assignedTo !== agentId || o.status !== "por_comprar") return { ok: false, errors: ["Este pedido no está en tu lista"] };
  const existing = state.cards[orderId];
  if (existing) return { ok: false, errors: [existing.closedAt ? "La tarjeta de este pedido ya se cerró" : "La tarjeta ya se mostró una vez"], card: existing };
  const card = {
    orderId,
    sandbox: true,
    label: "SANDBOX",
    numberMasked: "0000 0000 0000 0000",
    last4: "0000",
    exp: "00/00",
    cvc: "000",
    amountLockedUsd: o.ceilingUsd,
    merchantLocked: o.storeLabel,
    revealedAt: now,
    hidesAt: new Date(Date.parse(now) + CARD_REVEAL_MS).toISOString(),
    closedAt: null,
  };
  state.cards[orderId] = card;
  log(state, now, agentId, "tarjeta", orderId);
  return { ok: true, card };
}
export function cardVisible(card, now) {
  if (!card || card.closedAt) return false;
  return Date.parse(now) < Date.parse(card.hidesAt);
}
export function cardSecondsLeft(card, now) {
  if (!cardVisible(card, now)) return 0;
  return Math.max(0, Math.ceil((Date.parse(card.hidesAt) - Date.parse(now)) / 1000));
}

/* ---------------- deep link + link-health guard (deep-link spec) ------ */

/* Variant pinning (spec 2): a store goes here only once its product
   pages are verified to select a colour/size from URL parameters. None
   is verified yet, so every packet carries the photo-check step. */
export const VARIANT_PARAM_RULES = Object.freeze({});

export function buyLink(order) {
  const rule = VARIANT_PARAM_RULES[order.store];
  if (!rule || !order.url) return { href: order.url || null, pinned: false };
  return { href: rule(order), pinned: true };
}

export function checklistFor(order) {
  const steps = [{ id: "abri", label: "Abrí la tienda" }];
  if (!buyLink(order).pinned) steps.push({ id: "exacto", label: "Es el producto exacto (foto, modelo, color, talla)" });
  steps.push({ id: "carrito", label: "Agregué al carrito" }, { id: "pague", label: "Pagué con tarjeta Aria" });
  return steps;
}

const LOCALE_SEG = /^(?:[a-z]{2}(?:[-_][a-z]{2})?)$/i;
const SEARCH_SEG = new Set(["search", "s", "find", "busqueda", "catalogsearch", "searchpage", "search.jsp", "search.html"]);
const SEARCH_KEYS = ["q", "query", "searchterm", "search", "keyword", "keywords", "text", "term", "k", "ntt", "st"];
const PRODUCT_KEYS = ["pid", "productid", "product_id", "prodid", "itemid", "sku", "skuid", "variant"];
const LISTING_FIRST = new Set(["c", "category", "categories", "browse", "catalog", "department", "departments", "dept",
  "sale", "clearance", "new", "new-arrivals", "brands", "brand", "shop-all", "all", "women", "womens", "men", "mens", "kids"]);

/**
 * Is this stored product URL usable as a direct product link?
 *   { ok: true }  or  { ok: false, reason: "missing" | "invalid" | "homepage" | "search" | "listing" }
 * Pure: no network. The server hook below adds 404s and redirects.
 */
export function classifyProductUrl(raw) {
  if (raw == null || String(raw).trim() === "") return { ok: false, reason: "missing" };
  let u;
  try { u = new URL(String(raw).trim()); } catch { return { ok: false, reason: "invalid" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "invalid" };
  const segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponentSafe(s).toLowerCase());
  const keys = [...u.searchParams.keys()].map((k) => k.toLowerCase());
  if (segs.some((s) => SEARCH_SEG.has(s)) || keys.some((k) => SEARCH_KEYS.includes(k) && u.searchParams.get(k))) return { ok: false, reason: "search" };
  const meaningful = segs.filter((s) => !LOCALE_SEG.test(s) && !["index.html", "home", "shop", "us"].includes(s));
  if (!meaningful.length) return { ok: false, reason: "homepage" };
  /* A product id anywhere (digits in the path, a product page file, or a
     product query key such as ?pid=) reads as a product page:
     gap.com/browse/product.do?pid=... is a product, not a listing. */
  const productish = /\d/.test(meaningful.join("")) || /\.(?:html?|do|aspx?|php)$/.test(meaningful.at(-1))
    || keys.some((k) => PRODUCT_KEYS.includes(k)) || segs.some((s) => ["p", "dp", "pdp", "product", "products", "item", "ip"].includes(s));
  if (segs[0] === "collections" && !segs.includes("products")) return { ok: false, reason: "listing" };
  if (!productish && LISTING_FIRST.has(meaningful[0]) && meaningful.length <= 3) return { ok: false, reason: "listing" };
  return { ok: true, reason: null };
}
function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

export const LINK_REASON_LABELS = Object.freeze({
  missing: "No hay link guardado",
  invalid: "El link no es una dirección web",
  homepage: "El link lleva a la portada de la tienda",
  search: "El link lleva a una búsqueda",
  listing: "El link lleva a una lista de productos",
  not_found: "La página ya no existe (404)",
  redirect_home: "La página redirige a la portada",
  redirect_search: "La página redirige a una búsqueda",
  redirect_listing: "La página redirige a una lista",
});

/**
 * Server-side check hook. `fetchImpl` is injected (the function passes
 * global fetch; the tests pass fixtures). Follows up to 4 redirects by
 * hand so a redirect to the homepage/search is SEEN, not silently taken.
 * A network failure is "unknown" -- not flagged: an unreachable store is
 * not proof the link is dead.
 */
export async function checkLinkHealth(url, fetchImpl, { maxHops = 4 } = {}) {
  const first = classifyProductUrl(url);
  if (!first.ok) return { ok: false, reason: first.reason, finalUrl: url || null };
  let current = String(url).trim();
  for (let hop = 0; hop <= maxHops; hop++) {
    let res;
    try { res = await fetchImpl(current, { method: "GET", redirect: "manual" }); }
    catch { return { ok: true, reason: "unknown", finalUrl: current }; }
    const status = Number(res.status);
    if (status === 404 || status === 410) return { ok: false, reason: "not_found", finalUrl: current };
    if (status >= 300 && status < 400) {
      const loc = res.headers && (typeof res.headers.get === "function" ? res.headers.get("location") : res.headers.location);
      if (!loc) return { ok: true, reason: "unknown", finalUrl: current };
      const next = new URL(loc, current).toString();
      const c = classifyProductUrl(next);
      if (!c.ok) return { ok: false, reason: "redirect_" + (c.reason === "search" ? "search" : c.reason === "listing" ? "listing" : "home"), finalUrl: next };
      current = next;
      continue;
    }
    return { ok: status < 400, reason: status < 400 ? null : "http_" + status, finalUrl: current };
  }
  return { ok: true, reason: "unknown", finalUrl: current };
}

/** Every pending order with a bad stored URL becomes a "Link caído" exception; no agent hunts the store. */
export function linkGuard(state, now, results = null) {
  const flagged = [];
  for (const o of state.orders) {
    if (o.status !== "por_comprar" && o.status !== "retenida") continue;
    const r = results && results[o.orderId] ? results[o.orderId] : classifyProductUrl(o.url);
    if (r.ok) continue;
    if (o.status === "retenida") continue;
    o.linkProblem = r.reason;
    flagged.push(openException(state, o, LINK_DOWN, null, now, LINK_REASON_LABELS[r.reason] || r.reason));
  }
  return flagged;
}

/* ---------------- talk: chat, comments, store notes, store flags ------ */

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export function postChat(state, agentId, text, now) {
  const t = clip(text, 500);
  if (!t) return null;
  const m = { by: agentId, text: t, at: now };
  state.chat.push(m);
  return m;
}
export function addOrderComment(state, orderId, by, text, now) {
  const o = state.orders.find((x) => x.orderId === orderId) || (state.history || []).find((x) => x.orderId === orderId);
  const t = clip(text, 500);
  if (!o || !t) return null;
  (o.comments || (o.comments = [])).push({ by, text: t, at: now });
  return o.comments.at(-1);
}
export function addStoreNote(state, store, agentId, text, now) {
  const t = clip(text, 500);
  if (!t) return null;
  const n = { store, by: agentId, text: t, at: now };
  state.storeNotes.push(n);
  return n;
}
export function flagStore(state, store, agentId, text, now) {
  const f = { id: "TF-" + String(state.storeFlags.length + 1).padStart(3, "0"), store, by: agentId, text: clip(text, 500), at: now, status: "nueva" };
  state.storeFlags.push(f);
  return f;
}

/* ---------------- search my history ----------------------------------- */

/** Any past order of hers by store, order number (Aria's or the retailer's) or date (2026-10-30 or 30/10). */
export function searchOrders(state, agentId, query) {
  const all = [...(state.history || []), ...state.orders.filter((o) => o.status === "comprada")]
    .filter((o) => o.assignedTo === agentId);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return all.sort(byBoughtDesc);
  const dm = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(q);
  return all.filter((o) => {
    const day = String(o.boughtAt || "").slice(0, 10);
    if (dm) {
      const [, d, m] = dm;
      return day.slice(5) === `${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return [o.store, o.storeLabel, o.orderId, o.retailerOrderNumber, day, o.title]
      .some((v) => String(v || "").toLowerCase().includes(q));
  }).sort(byBoughtDesc);
}
const byBoughtDesc = (a, b) => String(b.boughtAt).localeCompare(String(a.boughtAt));

/* ---------------- Mi día ---------------------------------------------- */

export function miDia(state, agentId) {
  const mine = state.orders.filter((o) => o.assignedTo === agentId || o.previousAgent === agentId);
  const done = state.orders.filter((o) => o.assignedTo === agentId && o.status === "comprada").length;
  const left = porComprar(state, agentId).length;
  const total = done + left;
  const sent = state.exceptions.filter((e) => e.fromAgent === agentId).length;
  const spent = round2(state.orders.filter((o) => o.assignedTo === agentId && o.status === "comprada").reduce((s, o) => s + (o.chargedTotalUsd || 0), 0));
  return { done, left, total, pct: total ? Math.round((done / total) * 100) : 0, sentToLead: sent, spentUsd: spent, touched: mine.length };
}

/* THE CELEBRATIONS (improvement pass 7). The copy lives here, and only
   here: agente.html renders whatever milestoneFor returns. Counted
   milestones fire on the purchase that reaches them; "mitad" on the one
   that reaches half her list; "todo" when her list is empty. */
export const MILESTONES = Object.freeze([
  { id: "primera", at: 1, title: "¡Primera compra del día!", line: "¡Felicitaciones! Ya arrancaste. Sigue así." },
  { id: "diez", at: 10, title: "¡Diez compradas!", line: "¡Felicitaciones! Diez pedidos que ya van camino a Miami." },
  { id: "veinticinco", at: 25, title: "¡Veinticinco compradas!", line: "¡Felicitaciones! Vas a un ritmo buenísimo." },
  { id: "cincuenta", at: 50, title: "¡Cincuenta compradas!", line: "¡Felicitaciones! Cincuenta clientes van a recibir su pedido gracias a ti." },
  { id: "cien", at: 100, title: "¡Cien compradas!", line: "¡Felicitaciones! Cien pedidos en un día. Eres una máquina." },
  { id: "cientocincuenta", at: 150, title: "¡Ciento cincuenta!", line: "¡Felicitaciones! Ya ves la meta de cerca." },
  { id: "doscientos", at: 200, title: "¡Doscientas compradas!", line: "¡Felicitaciones! Doscientos pedidos. Día histórico." },
  { id: "mitad", half: true, title: "¡Mitad del día!", line: "¡Felicitaciones! La mitad de tu lista ya está comprada." },
  { id: "todo", all: true, title: "¡Lista completa!", line: "¡Felicitaciones! Compraste todo lo de hoy. Gracias de verdad." },
]);
function milestoneHits(d) {
  return MILESTONES.filter((m) => (m.at && d.done === m.at) || (m.half && d.total >= 4 && d.done === Math.ceil(d.total / 2)) || (m.all && d.total > 0 && d.left === 0));
}
/** The milestone this purchase reached, if any; "todo" beats a count, a count beats "mitad". */
export function milestoneFor(state, agentId) {
  const hits = milestoneHits(miDia(state, agentId));
  return hits.find((m) => m.all) || hits.find((m) => m.at) || hits[0] || null;
}

/* ---------------- running earnings (improvement pass 6) --------------
   The pay per purchase is NOT SET yet. It is an admin setting
   (state.settings.payPerPurchasePen, admin-agents.js on the server)
   that defaults to null; until Danny sets it, the agent reads
   "Tarifa por compra: por definir" and no earnings figure. */
export const RATE_UNSET_TEXT = "Tarifa por compra: por definir";
export function payRate(state) {
  const v = state && state.settings ? state.settings.payPerPurchasePen : null;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}
export function earnings(state, agentId) {
  const d = miDia(state, agentId);
  const rate = payRate(state);
  return {
    bought: d.done, exceptions: d.sentToLead, ratePen: rate,
    totalPen: rate == null ? null : round2(rate * d.done),
    rateText: rate == null ? RATE_UNSET_TEXT : `Tarifa por compra: ${pen(rate)}`,
  };
}

/** The end-of-shift summary (shown at clock-out). */
export function shiftSummary(state, agentId, now) {
  const s = state.shifts[agentId] || {};
  const d = miDia(state, agentId);
  const day = String(s.clockIn || now).slice(0, 10);
  return {
    clockIn: s.clockIn || null, clockOut: s.clockOut || null,
    workedMin: workedMinutes(state, agentId, now), breaks: (s.breaks || []).length,
    bought: d.done, left: d.left, exceptions: d.sentToLead, spentUsd: d.spentUsd,
    earnings: earnings(state, agentId), pendingSync: pendingEvents(state).length,
    orders: compradas(state, agentId), searchQuery: day,
  };
}

/* ---------------- the outbox (improvement pass 4) --------------------
   Every completion, exception and clock-out is also written here, in
   order, on the phone. The page sends the pending ones whenever there
   is signal and marks them synced; nothing waits on the network to let
   the agent move to her next order. */
export function queueEvent(state, ev) {
  const box = state.outbox || (state.outbox = []);
  state.seq = (state.seq || 0) + 1;
  const e = { id: `${ev.agentId}-${Date.parse(ev.at) || 0}-${state.seq}`, ...ev, synced: false };
  box.push(e);
  return e;
}
export function pendingEvents(state) {
  return (state.outbox || []).filter((e) => !e.synced);
}
export function markSynced(state, ids, now) {
  const set = new Set(ids);
  for (const e of state.outbox || []) if (set.has(e.id)) { e.synced = true; e.syncedAt = now; }
  return pendingEvents(state).length;
}

/* ---------------- admin board ----------------------------------------- */

export function boardRows(state, now) {
  return state.agents.map((a) => {
    const d = miDia(state, a.id);
    const s = state.shifts[a.id] || null;
    return {
      agentId: a.id, name: a.name,
      clockIn: s && s.clockIn, onBreak: s && s.onBreak ? s.onBreak.label : null,
      breakSince: s && s.onBreak ? s.onBreak.start : null,
      workedMin: workedMinutes(state, a.id, now),
      done: d.done, left: d.left, total: d.total, pct: d.pct, sentToLead: d.sentToLead,
    };
  });
}

export function accountRows(state) {
  const used = accountUsage(state);
  const planned = {};
  for (const o of state.orders) if (o.accountId && o.status !== "excepcion") planned[o.accountId] = (planned[o.accountId] || 0) + 1;
  return state.accounts.map((a) => ({ ...a, used: used[a.id] || 0, planned: planned[a.id] || 0, full: (used[a.id] || 0) >= a.dailyCap }));
}

/** Card charge <-> retailer order <-> customer order, one row per bought order. */
export function reconciliation(state) {
  return state.orders.filter((o) => o.status === "comprada").map((o) => {
    const card = state.cards[o.orderId] || null;
    const issues = [];
    if (!card) issues.push("Sin tarjeta de un pedido");
    else {
      if (card.capturedUsd != null && card.amountLockedUsd != null && card.capturedUsd > card.amountLockedUsd) issues.push("Cobro mayor al tope");
      if (card.merchantLocked !== o.storeLabel) issues.push("Comercio distinto");
    }
    if (!o.retailerOrderNumber) issues.push("Sin número de la tienda");
    return {
      orderId: o.orderId, customerName: o.customerName, store: o.storeLabel,
      cardLockedUsd: card ? card.amountLockedUsd : null, cardCapturedUsd: card ? card.capturedUsd ?? null : null,
      retailerOrderNumber: o.retailerOrderNumber, chargedTotalUsd: o.chargedTotalUsd, lineUsd: round2(o.priceUsd * (o.qty || 1)),
      agentId: o.assignedTo, boughtAt: o.boughtAt, ok: issues.length === 0, issues,
    };
  });
}

function log(state, at, by, what, orderId) {
  (state.log || (state.log = [])).push({ at, by, what, orderId });
}

/* ---------------- copy guards ----------------------------------------- */

/** True when the text holds an emoji or pictograph. The dashboard shows none, anywhere. */
/* (c), (R) and TM are Extended_Pictographic in Unicode but are plain text
   marks in product names ("Studio Ghibli(R)"); they count only with the
   emoji presentation selector after them. */
export function hasEmoji(text) {
  return /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u.test(String(text));
}
