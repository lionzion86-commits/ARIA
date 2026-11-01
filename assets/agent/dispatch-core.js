/* ==================================================================
   COMPRADORES PHASE 2 -- LIVE DISPATCH RULES (#443: c.6551091244
   dispatch engineering, c.6550884334 breaks/pass/caps, c.6551173008 +
   c.6551204246 pay and pop-up, c.6551428878 payouts, c.6550830674 auth).

   PURE, LIKE agent-core.js. No DOM, no network, no storage: every
   function takes records and returns what changed. The same module runs
   in agente.html / admin-agentes.html (the pop-up, the fee and net shown
   before a cash-out) and on the server (netlify/functions/_dispatch.js,
   which adds Blobs, the atomic writes and the card program).

   THE PIPELINE, ONE CUSTOMER ORDER
     PAID          Stripe said so (stripe-webhook.js, signature verified)
     FUNDS_HOLD    the float gate held it: the card program's available
                   balance does not cover it yet (the shortfall is shown)
     CLAIMABLE     released: the pop-up rings for every online, available
                   buyer for ringSeconds
     SIN_ASIGNAR   nobody took it inside the ring
     CLAIMED       one buyer won the conditional write; her cards exist
     BOUGHT        every store checkout BOUGHT
     PARTIAL       done, some store checkouts became exceptions
     EXCEPTION     done, none bought
   Every state has a timer (DISPATCH_DEFAULTS.stateTimersMin): an order
   that sits past it escalates to Danny with what is stuck and how long.

   NOTHING HERE IS A PRICE, A RATE OR A FEE TYPED FROM THIN AIR. The pay
   ladder per store checkout (Danny, c.6552741348 + c.6553050668: S/ 1.00
   for one product, +S/ 0.50 per two more), cash-out minimum (S/ 10), cash-out fee (S/ 2) and the
   Yape monthly cap (S/ 27,500) are Danny's numbers, as CONFIG defaults
   he can change. The exchange rate is never here: the page uses Phase
   1's SUNAT source (agent-store.js loadFx).
   ================================================================== */
import { almacenLines, ceilingUsd, CEILING_MARGIN, classifyProductUrl, LINK_REASON_LABELS, pickAccount, round2, PROBLEM_PRESETS } from "./agent-core.js";
export { round2 };

/* ---------------- config: Danny's numbers, overridable ---------------- */

export const DISPATCH_DEFAULTS = Object.freeze({
  /* THE PAY LADDER (final, replaces S/ 1 per checkout). Per STORE
     CHECKOUT, from its number of products (quantities counted):
       pay(n) = payBasePen + payStepPen * floor(n / payStepEvery)
     1 -> 1.00, 2-3 -> 1.50, 4-5 -> 2.00, 6-7 -> 2.50, 8-9 -> 3.00, ... */
  payBasePen: 1,
  payStepPen: 0.5,
  payStepEvery: 2,
  ringSeconds: 30,               // c.6551091244: about a 30-second ring
  pollSeconds: 4,                // agente.html short polling while clocked in
  presenceTtlSeconds: 20,        // a buyer not heard from in this long is not ONLINE
  cashoutMinPen: 10,             // c.6551428878: minimum S/ 10
  cashoutFeePen: 2,              // c.6551428878: S/ 2 now, deducted from the payout
  yapeMonthlyCapPen: 27500,      // c.6551428878: Yape receive cap, about S/ 27,500 a month
  yapeNearRatio: 0.95,           // "nearing it": past 95% of the cap, the payout goes to CCI
  sweepWeekday: 1,               // weekly sweep to CCI (0 = domingo ... 1 = lunes). A schedule, set by Danny
  potBalancePen: null,           // the payout pot: entered by hand
  potLowAlertPen: null,          // refill alert threshold: not stated yet, so no alert until Danny sets it
  payoutFileDraft: true,         // the BCP layout is not known: the file is a DRAFT and is never sent
  ceilingMargin: CEILING_MARGIN, // Phase 1's ceiling margin (sales tax room)
  floatCacheSeconds: 10,         // how long one card-program balance read is reused
  /* WATCHDOG WINDOWS, minutes per state. Danny asked for "a set window";
     these are first values for him to tune on the board. */
  stateTimersMin: Object.freeze({ PAID: 2, FUNDS_HOLD: 30, CLAIMABLE: 2, SIN_ASIGNAR: 10, CLAIMED: 60 }),
});

/** Danny's overrides on top of the defaults; anything not a sane number keeps the default. */
export function dispatchConfig(overrides = {}) {
  const o = overrides || {};
  const num = (k, lo, hi) => (typeof o[k] === "number" && Number.isFinite(o[k]) && o[k] >= lo && o[k] <= hi ? o[k] : DISPATCH_DEFAULTS[k]);
  const nullable = (k) => (o[k] === null ? null : typeof o[k] === "number" && Number.isFinite(o[k]) && o[k] >= 0 ? o[k] : DISPATCH_DEFAULTS[k]);
  const timers = { ...DISPATCH_DEFAULTS.stateTimersMin };
  for (const [k, v] of Object.entries(o.stateTimersMin || {})) if (k in timers && typeof v === "number" && v > 0 && v < 10000) timers[k] = v;
  return {
    payBasePen: num("payBasePen", 0, 1000),
    payStepPen: num("payStepPen", 0, 1000),
    payStepEvery: Number.isInteger(o.payStepEvery) && o.payStepEvery >= 1 && o.payStepEvery <= 100 ? o.payStepEvery : DISPATCH_DEFAULTS.payStepEvery,
    ringSeconds: num("ringSeconds", 5, 600),
    pollSeconds: num("pollSeconds", 2, 30),
    presenceTtlSeconds: num("presenceTtlSeconds", 5, 600),
    cashoutMinPen: num("cashoutMinPen", 0, 100000),
    cashoutFeePen: num("cashoutFeePen", 0, 1000),
    yapeMonthlyCapPen: num("yapeMonthlyCapPen", 0, 10000000),
    yapeNearRatio: num("yapeNearRatio", 0.1, 1),
    sweepWeekday: Number.isInteger(o.sweepWeekday) && o.sweepWeekday >= 0 && o.sweepWeekday <= 6 ? o.sweepWeekday : DISPATCH_DEFAULTS.sweepWeekday,
    potBalancePen: nullable("potBalancePen"),
    potLowAlertPen: nullable("potLowAlertPen"),
    payoutFileDraft: typeof o.payoutFileDraft === "boolean" ? o.payoutFileDraft : DISPATCH_DEFAULTS.payoutFileDraft,
    ceilingMargin: num("ceilingMargin", 0, 1),
    floatCacheSeconds: num("floatCacheSeconds", 0, 300),
    stateTimersMin: timers,
  };
}

/** Pay for one store checkout of `n` products: the ladder. */
export function payForProducts(n, cfg = DISPATCH_DEFAULTS) {
  const k = Math.max(1, Math.floor(Number(n) || 0));
  return round2(cfg.payBasePen + cfg.payStepPen * Math.floor(k / cfg.payStepEvery));
}
/* A checkout's pay is stamped when it is offered, so what the pop-up
   promised is what she earns, even if Danny edits the ladder meanwhile. */
export function checkoutPay(c, cfg) {
  return typeof c.payPen === "number" ? c.payPen : payForProducts(c.itemCount, cfg);
}
export function stampPay(rec, cfg) {
  for (const c of rec.packet.checkouts) if (typeof c.payPen !== "number") c.payPen = payForProducts(c.itemCount, cfg);
  return rec;
}

/* ---------------- states ---------------------------------------------- */

export const STATES = Object.freeze({
  PAID: "PAID", FUNDS_HOLD: "FUNDS_HOLD", CLAIMABLE: "CLAIMABLE", SIN_ASIGNAR: "SIN_ASIGNAR",
  CLAIMED: "CLAIMED", BOUGHT: "BOUGHT", PARTIAL: "PARTIAL", EXCEPTION: "EXCEPTION",
});
export const STATE_LABELS = Object.freeze({
  PAID: "Pagado", FUNDS_HOLD: "Fondos en espera", CLAIMABLE: "Sonando", SIN_ASIGNAR: "Sin asignar",
  CLAIMED: "Tomado", BOUGHT: "Comprado", PARTIAL: "Comprado en parte", EXCEPTION: "Excepción",
});
export const TERMINAL = new Set([STATES.BOUGHT, STATES.PARTIAL, STATES.EXCEPTION]);
/* Released: its budget counts against the float until it is spent. */
export const RELEASED = new Set([STATES.CLAIMABLE, STATES.SIN_ASIGNAR, STATES.CLAIMED]);
const ALLOWED = Object.freeze({
  PAID: ["FUNDS_HOLD", "CLAIMABLE"],
  FUNDS_HOLD: ["CLAIMABLE"],
  CLAIMABLE: ["CLAIMED", "SIN_ASIGNAR"],
  SIN_ASIGNAR: ["CLAIMABLE", "CLAIMED"],
  CLAIMED: ["BOUGHT", "PARTIAL", "EXCEPTION", "SIN_ASIGNAR"],
});
export const CHECKOUT = Object.freeze({ PENDING: "PENDING", BOUGHT: "BOUGHT", EXCEPTION: "EXCEPTION" });

export function dispatchError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

/**
 * One timestamped state change. Every transition lands in `history` and
 * `stateAt`, so the board can say since when, and the watchdog can say
 * for how long.
 */
export function transition(rec, to, now, by = "sistema", extra = {}) {
  const from = rec.state;
  if (!(ALLOWED[from] || []).includes(to)) throw dispatchError(409, `No se puede pasar de ${STATE_LABELS[from] || from} a ${STATE_LABELS[to] || to}`);
  rec.state = to;
  rec.stateSince = now;
  rec.stateAt = { ...(rec.stateAt || {}), [to]: now };
  (rec.history || (rec.history = [])).push({ from, to, at: now, by, ...(extra.note ? { note: extra.note } : {}) });
  rec.updatedAt = now;
  return rec;
}

/* ---------------- the buy packet -------------------------------------- */

const storeKey = (s) => String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
function storeLabelOf(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Tienda sin nombre";
  return s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
const cleanUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

/**
 * The buy packet: one customer order, split into ONE sub-checkout PER
 * STORE (never per item). A store's checkout holds all of that store's
 * items as rows, one card sized to their summed ceilings, and is
 * registered once (number, total, screenshot).
 * Each line keeps the exact product link it was sold from (when the cart
 * line carried one), its size and colour, and a ceiling; each checkout's
 * budget is the sum of its ceilings, and is the card's spend limit.
 *
 * The ceiling is based on what the STORE charges (dutiableUsd, the
 * retailer price with its sales tax, falling back to the line price)
 * plus Phase 1's margin. Staff-only: the packet is served to the buyer
 * who claimed it and to Danny, never to a shopper.
 */
export function buildPacket(order, { ceilingMargin = CEILING_MARGIN } = {}) {
  const name = String((order.customer && (order.customer.name || order.customer.nombre)) || "").replace(/\s+/g, " ").trim();
  const groups = new Map();
  for (const it of order.items || []) {
    if (!it || it.lineType === "bundle-discount") continue;
    const qty = Math.max(1, Math.round(Number(it.qty) || 1));
    const base = Number(it.dutiableUsd) > 0 ? Number(it.dutiableUsd) : Number(it.priceUsd);
    if (!(base > 0)) continue;
    const raw = it.retailer || it.store || it.storeLabel || "";
    const key = storeKey(raw) || "tienda";
    if (!groups.has(key)) groups.set(key, { store: key, storeLabel: storeLabelOf(raw), items: [] });
    /* line.url: the exact retailer product page, copied from the catalogue
       record onto the cart and order line. Never invented: a line without
       one shows «Sin link guardado» and Danny pastes it («Poner link»). */
    const url = cleanUrl(it.url);
    const link = classifyProductUrl(url);
    groups.get(key).items.push({
      title: String(it.title || it.name || "").slice(0, 200),
      image: cleanUrl(it.image),
      url,
      linkOk: link.ok,
      linkProblem: link.ok ? null : (LINK_REASON_LABELS[link.reason] || link.reason),
      qty,
      unitUsd: round2(base),
      lineUsd: round2(base * qty),
      ceilingUsd: ceilingUsd(base, qty, ceilingMargin),
      selectedSize: it.selectedSize || null,
      color: it.color || null,
    });
  }
  const checkouts = [...groups.values()].map((g, i) => ({
    id: `${order.orderId}~${g.store}`,
    n: i + 1,
    store: g.store,
    storeLabel: g.storeLabel,
    items: g.items,
    itemCount: g.items.reduce((s, x) => s + x.qty, 0),
    totalUsd: round2(g.items.reduce((s, x) => s + x.lineUsd, 0)),
    budgetUsd: round2(g.items.reduce((s, x) => s + (x.ceilingUsd || 0), 0)),
    state: CHECKOUT.PENDING,
    accountId: null,
    card: null,
  }));
  const ship = order.shipping || {};
  const cust = order.customer || {};
  return {
    orderId: order.orderId,
    customerName: name,
    almacen: almacenLines(name),
    checkouts,
    itemCount: checkouts.reduce((s, c) => s + c.itemCount, 0),
    totalUsd: round2(checkouts.reduce((s, c) => s + c.totalUsd, 0)),
    budgetUsd: round2(checkouts.reduce((s, c) => s + c.budgetUsd, 0)),
    /* Only the claimed buyer's focus screen and Danny's board read this.
       The pop-up model below never copies it. */
    private: {
      dni: cust.idNumber || cust.dni || null,
      phone: cust.phone || cust.telefono || ship.phone || ship.telefono || null,
      address: [ship.address || ship.direccion || ship.street || "", ship.district || ship.distrito || "", ship.destCity || ship.ciudad || ""].filter(Boolean).join(", ") || null,
    },
  };
}

/** A fresh dispatch record in PAID, from a paid order. */
export function newDispatch(order, { now, eventId = null, ceilingMargin = CEILING_MARGIN, sandbox = false } = {}) {
  const packet = buildPacket(order, { ceilingMargin });
  return {
    orderId: order.orderId,
    customerName: packet.customerName,
    sandbox: Boolean(sandbox),
    state: STATES.PAID,
    stateSince: now,
    stateAt: { PAID: now },
    history: [{ from: null, to: STATES.PAID, at: now, by: "stripe", ...(eventId ? { note: eventId } : {}) }],
    paidAt: order.paidAt || now,
    paymentId: order.paymentId || null,
    amountCapturedPen: order.amountCapturedPen ?? null,
    stripeEventIds: eventId ? [eventId] : [],
    packet,
    ringEndsAt: null,
    pinged: [],
    passes: [],
    claimedBy: null,
    claimedAt: null,
    fundsHold: null,
    unassignedReason: null,
    escalations: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ---------------- the float gate --------------------------------------- */

/** Budgets released and not yet spent: what the float must still cover. */
export function outstandingUsd(records) {
  let sum = 0;
  for (const r of records) {
    if (!RELEASED.has(r.state)) continue;
    for (const c of r.packet.checkouts) if (c.state === CHECKOUT.PENDING) sum += c.budgetUsd;
  }
  return round2(sum);
}

/**
 * Which waiting orders may ring now. Oldest first; each is released only
 * while (outstanding released budgets + its budget) <= available float.
 * The rest are FUNDS_HOLD with their shortfall -- nothing waits silently.
 *   returns [{ orderId, release: true } | { orderId, release: false, shortfallUsd }]
 */
export function floatGate(records, availableUsd) {
  const avail = Number(availableUsd);
  let out = outstandingUsd(records);
  const waiting = records.filter((r) => r.state === STATES.PAID || r.state === STATES.FUNDS_HOLD)
    .sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt)) || String(a.orderId).localeCompare(String(b.orderId)));
  const decisions = [];
  for (const r of waiting) {
    const need = r.packet.budgetUsd;
    if (Number.isFinite(avail) && round2(out + need) <= avail) {
      out = round2(out + need);
      decisions.push({ orderId: r.orderId, release: true });
    } else {
      decisions.push({ orderId: r.orderId, release: false, shortfallUsd: round2(out + need - (Number.isFinite(avail) ? avail : 0)), availableUsd: Number.isFinite(avail) ? avail : null, outstandingUsd: out, budgetUsd: need });
    }
  }
  return decisions;
}

export function release(rec, now, cfg) {
  transition(rec, STATES.CLAIMABLE, now, "compuerta");
  stampPay(rec, cfg);
  rec.ringStartedAt = now;
  rec.ringEndsAt = new Date(Date.parse(now) + cfg.ringSeconds * 1000).toISOString();
  rec.fundsHold = null;
  rec.unassignedReason = null;
  return rec;
}
export function hold(rec, now, d) {
  if (rec.state === STATES.PAID) transition(rec, STATES.FUNDS_HOLD, now, "compuerta");
  rec.fundsHold = { shortfallUsd: d.shortfallUsd, availableUsd: d.availableUsd, outstandingUsd: d.outstandingUsd, budgetUsd: d.budgetUsd, checkedAt: now };
  return rec;
}

/** Past the ring with no claim: the sin-asignar pool. */
export function ringExpired(rec, now) {
  return rec.state === STATES.CLAIMABLE && rec.ringEndsAt && Date.parse(now) >= Date.parse(rec.ringEndsAt);
}
export function toPool(rec, now, reason) {
  transition(rec, STATES.SIN_ASIGNAR, now, "timbre");
  rec.unassignedReason = reason || `Nadie lo tomó en el timbre`;
  return rec;
}
/** Danny: ring it again. */
export function reRing(rec, now, cfg) {
  transition(rec, STATES.CLAIMABLE, now, "admin");
  stampPay(rec, cfg);
  rec.ringStartedAt = now;
  rec.ringEndsAt = new Date(Date.parse(now) + cfg.ringSeconds * 1000).toISOString();
  rec.unassignedReason = null;
  rec.passes = [];
  return rec;
}

/* ---------------- who gets pinged ------------------------------------- */

/**
 * ONLINE and available: clocked in, heard from inside presenceTtl, not on
 * a break (Baño / Almuerzo), not in focus mode mid-checkout.
 */
export function availability(presence, now, cfg) {
  if (!presence || !presence.clockedIn || presence.clockedOut) return { ok: false, reason: "fuera" };
  if (!(Date.parse(now) - Date.parse(presence.seenAt) <= cfg.presenceTtlSeconds * 1000)) return { ok: false, reason: "sin_senal" };
  if (presence.onBreak) return { ok: false, reason: "pausa" };
  if (presence.focus) return { ok: false, reason: "enfocada" };
  return { ok: true, reason: null };
}

/** Purchases per store account today (bought, or reserved by a claimed bundle). */
export function accountUsageToday(records, day) {
  const used = {};
  for (const r of records) {
    for (const c of r.packet.checkouts) {
      if (!c.accountId) continue;
      const when = c.boughtAt || r.claimedAt;
      if (c.state === CHECKOUT.EXCEPTION || !when || limaDay(when) !== day) continue;
      used[c.accountId] = (used[c.accountId] || 0) + 1;
    }
  }
  return used;
}

/**
 * Default posted on #443: a bundle goes only to a buyer whose store
 * accounts have daily cap left for EVERY store in it. An account with no
 * owner is shared; one with `agentId` is that buyer's alone.
 *   returns { ok, accounts: { [checkoutId]: accountId }, missing: [storeLabel] }
 */
export function capsFor(packet, agentId, accounts, usage) {
  const used = { ...usage };
  const picked = {};
  const missing = [];
  for (const c of packet.checkouts) {
    if (c.state !== CHECKOUT.PENDING) continue;
    const pool = (accounts || []).filter((a) => a.store === c.store && (!a.agentId || a.agentId === agentId));
    const acc = pickAccount(pool, used);
    if (!acc) { missing.push(c.storeLabel); continue; }
    used[acc.id] = (used[acc.id] || 0) + 1;
    picked[c.id] = acc.id;
  }
  return { ok: missing.length === 0, accounts: picked, missing };
}

/** Is this order a ping for this buyer right now? */
export function eligibleFor(rec, agentId, { presence, accounts, usage, now, cfg }) {
  if (rec.state !== STATES.CLAIMABLE) return { ok: false, reason: "no_suena" };
  if ((rec.passes || []).some((p) => p.agentId === agentId)) return { ok: false, reason: "paso" };
  const av = availability(presence, now, cfg);
  if (!av.ok) return av;
  const caps = capsFor(rec.packet, agentId, accounts, usage);
  if (!caps.ok) return { ok: false, reason: "tope", missing: caps.missing };
  return { ok: true, reason: null };
}

/* ---------------- the pop-up (c.6551173008 + c.6551204246) ------------- */

export function payText(n) {
  const v = Number(n);
  return "S/ " + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * What the pop-up shows -- and NOTHING else. No DNI, no street address,
 * no phone: those exist only on the claimed order's focus screen.
 */
export function popupModel(rec, cfg) {
  const p = rec.packet;
  const n = p.checkouts.length;
  /* ONE total for the bundle; the ladder itself is never shown (Danny's fare rule). */
  const pay = round2(p.checkouts.reduce((s, c) => s + checkoutPay(c, cfg), 0));
  return {
    orderId: rec.orderId,
    header: `Pedido de ${p.customerName}`,
    payPen: pay,
    headline: payText(pay),
    sub: `${plural(n, "compra", "compras")} · ${plural(n, "tienda", "tiendas")}`,
    stores: p.checkouts.map((c) => c.storeLabel),
    photos: p.checkouts.flatMap((c) => c.items.map((i) => i.image)).filter(Boolean).slice(0, 8),
    itemCount: p.itemCount,
    itemText: plural(p.itemCount, "artículo", "artículos"),
    totalUsd: p.totalUsd,
    ringEndsAt: rec.ringEndsAt,
    sandbox: Boolean(rec.sandbox),
  };
}

/* ---------------- claim, pass ----------------------------------------- */

/**
 * The claim, as a pure change. The ATOMIC part -- two buyers can never
 * both win -- is the conditional write in _dispatch.js: this function
 * runs inside it against the record as it stood at that etag.
 */
export function claim(rec, agentId, now, { accounts, usage }) {
  if (rec.state !== STATES.CLAIMABLE && rec.state !== STATES.SIN_ASIGNAR) {
    throw dispatchError(409, rec.claimedBy && rec.claimedBy !== agentId ? "Otra compradora ya lo tomó" : "Este pedido ya no está disponible", { taken: true, state: rec.state });
  }
  const caps = capsFor(rec.packet, agentId, accounts, usage);
  if (!caps.ok) throw dispatchError(409, `Tus cuentas no tienen cupo hoy en: ${caps.missing.join(", ")}`, { caps: caps.missing });
  transition(rec, STATES.CLAIMED, now, agentId);
  stampPay(rec, dispatchConfig());
  rec.claimedBy = agentId;
  rec.claimedAt = now;
  for (const c of rec.packet.checkouts) if (caps.accounts[c.id]) c.accountId = caps.accounts[c.id];
  return rec;
}

/** Pasar: always allowed, and recorded -- on the order and in her history. */
export function pass(rec, agentId, now) {
  if (!(rec.passes || []).some((p) => p.agentId === agentId)) (rec.passes || (rec.passes = [])).push({ agentId, at: now });
  rec.updatedAt = now;
  return rec;
}

/* ---------------- checkouts: BOUGHT or an exception -------------------- */

function settle(rec, now, by) {
  const cs = rec.packet.checkouts;
  if (cs.some((c) => c.state === CHECKOUT.PENDING)) return rec;
  const bought = cs.filter((c) => c.state === CHECKOUT.BOUGHT).length;
  transition(rec, bought === cs.length ? STATES.BOUGHT : bought ? STATES.PARTIAL : STATES.EXCEPTION, now, by);
  return rec;
}

/**
 * One store checkout bought. Needs the retailer's order number, the total
 * charged and the confirmation screenshot, and the total may not pass the
 * checkout's budget (the card would not have let it anyway). Idempotent
 * on the event id: a resend after a dropped signal changes nothing.
 *   returns { rec, earning | null, duplicate }
 */
export function checkoutBought(rec, checkoutId, agentId, input, now, cfg) {
  const c = rec.packet.checkouts.find((x) => x.id === checkoutId);
  if (!c) throw dispatchError(404, "Esa compra no es de este pedido");
  if (rec.claimedBy !== agentId) throw dispatchError(403, "Este pedido no es tuyo");
  if (c.state === CHECKOUT.BOUGHT && (!input.eventId || c.eventId === input.eventId)) return { rec, earning: null, duplicate: true };
  if (c.state !== CHECKOUT.PENDING) throw dispatchError(409, "Esta compra ya se cerró");
  const num = String(input.retailerOrderNumber || "").trim().slice(0, 80);
  const total = Number(String(input.chargedTotalUsd ?? "").replace(/[^0-9.]/g, ""));
  const errors = [];
  if (!num) errors.push("Falta el número de pedido de la tienda");
  if (!(Number.isFinite(total) && total > 0)) errors.push("Falta el total cobrado");
  if (!input.screenshot || !input.screenshot.name) errors.push("Falta la captura de la confirmación");
  if (Number.isFinite(total) && total > c.budgetUsd) errors.push(`El total pasa el tope de $${c.budgetUsd.toFixed(2)}. Usa Problema, «Precio subió».`);
  if (errors.length) throw dispatchError(400, errors[0], { errors });
  Object.assign(c, {
    state: CHECKOUT.BOUGHT, boughtAt: now, boughtBy: agentId, eventId: input.eventId || null,
    retailerOrderNumber: num, chargedTotalUsd: round2(total),
    screenshot: { name: String(input.screenshot.name).slice(0, 120), size: Number(input.screenshot.size) || null },
  });
  (rec.history || (rec.history = [])).push({ from: null, to: "CHECKOUT_BOUGHT", at: now, by: agentId, note: `${c.storeLabel} · ${num}` });
  rec.updatedAt = now;
  settle(rec, now, agentId);
  /* Earnings accrue the moment a checkout is BOUGHT -- and only then. */
  const earning = { id: c.id, orderId: rec.orderId, store: c.storeLabel, customerName: rec.customerName, amountPen: checkoutPay(c, cfg), items: c.itemCount, at: now };
  return { rec, earning, duplicate: false };
}

/** A failed store inside a bundle: an exception with its reason; she finishes the others. */
export function checkoutException(rec, checkoutId, agentId, reasonId, now, note = "") {
  const c = rec.packet.checkouts.find((x) => x.id === checkoutId);
  if (!c) throw dispatchError(404, "Esa compra no es de este pedido");
  if (rec.claimedBy !== agentId && agentId !== "admin") throw dispatchError(403, "Este pedido no es tuyo");
  if (c.state === CHECKOUT.EXCEPTION) return { rec, duplicate: true };
  if (c.state !== CHECKOUT.PENDING) throw dispatchError(409, "Esta compra ya se cerró");
  const preset = PROBLEM_PRESETS.find((p) => p.id === reasonId) || (reasonId === "link_caido" ? { id: "link_caido", label: "Link caído" } : null);
  if (!preset) throw dispatchError(400, "Ese problema no existe");
  Object.assign(c, { state: CHECKOUT.EXCEPTION, exceptionAt: now, exceptionBy: agentId, reason: preset.id, reasonLabel: preset.label, note: String(note || "").slice(0, 500) });
  (rec.history || (rec.history = [])).push({ from: null, to: "CHECKOUT_EXCEPTION", at: now, by: agentId, note: `${c.storeLabel} · ${preset.label}` });
  rec.updatedAt = now;
  settle(rec, now, agentId);
  return { rec, duplicate: false };
}

/* ---------------- the watchdog ----------------------------------------- */

export function minutesIn(rec, now) {
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(rec.stateSince)) / 60000));
}

/**
 * Every non-final state has a timer. Past it, Danny sees exactly what is
 * stuck and for how long, in one sentence.
 */
export function stuck(rec, now, cfg) {
  if (TERMINAL.has(rec.state)) return null;
  const limit = cfg.stateTimersMin[rec.state];
  if (!limit) return null;
  const mins = minutesIn(rec, now);
  if (mins < limit) return null;
  const who = rec.claimedBy ? ` (${rec.claimedBy})` : "";
  const what = rec.state === STATES.CLAIMED
    ? `tomado${who} y sin compra`
    : rec.state === STATES.FUNDS_HOLD
      ? `en fondos en espera, faltan $${(rec.fundsHold && rec.fundsHold.shortfallUsd != null ? rec.fundsHold.shortfallUsd : 0).toFixed(2)}`
      : `en «${STATE_LABELS[rec.state]}»`;
  return {
    orderId: rec.orderId, customerName: rec.customerName, state: rec.state, stateLabel: STATE_LABELS[rec.state],
    since: rec.stateSince, minutes: mins, limitMin: limit,
    text: `Pedido de ${rec.customerName}: lleva ${durationText(mins)} ${what} (límite ${durationText(limit)}).`,
  };
}
export function durationText(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ---------------- 3-way reconciliation ---------------------------------- */

/**
 * Stripe payment <-> retailer order number <-> card charge, one row per
 * BOUGHT store checkout. `payments` by order id, `charges` by card token
 * ([{ amountUsd, merchant, status }]).
 */
export function reconcile3(records, payments = {}, charges = {}) {
  const rows = [];
  for (const r of records) {
    for (const c of r.packet.checkouts) {
      if (c.state !== CHECKOUT.BOUGHT) continue;
      const pay = payments[r.orderId] || null;
      const ch = (c.card && charges[c.card.token]) || [];
      const captured = round2(ch.filter((x) => x.status !== "DECLINED").reduce((s, x) => s + (Number(x.amountUsd) || 0), 0));
      const issues = [];
      if (!pay || pay.status !== "paid") issues.push("Sin pago de Stripe confirmado");
      if (!c.retailerOrderNumber) issues.push("Sin número de la tienda");
      if (!c.card) issues.push("Sin tarjeta de un pedido");
      else if (!ch.length) issues.push("Sin cobro en la tarjeta");
      else {
        if (captured > c.budgetUsd) issues.push("Cobro mayor al tope");
        if (Math.abs(captured - (c.chargedTotalUsd || 0)) > 0.01) issues.push("El cobro no coincide con lo reportado");
      }
      rows.push({
        orderId: r.orderId, customerName: r.customerName, checkoutId: c.id, store: c.storeLabel,
        stripeStatus: pay ? pay.status : null, stripeAmountPen: pay ? pay.amountPen ?? null : null,
        retailerOrderNumber: c.retailerOrderNumber || null, reportedUsd: c.chargedTotalUsd ?? null,
        cardLast4: c.card ? c.card.last4 : null, cardCapturedUsd: ch.length ? captured : null, budgetUsd: c.budgetUsd,
        agentId: c.boughtBy || r.claimedBy, ok: issues.length === 0, issues,
      });
    }
  }
  return rows;
}

/* ---------------- payouts (c.6551428878) -------------------------------- */

export const PAYOUT_STATUS = Object.freeze({ SOLICITADO: "solicitado", EN_LOTE: "en_lote", ENVIADO: "enviado", CONFIRMADO: "confirmado" });
export const PAYOUT_STATUS_LABELS = Object.freeze({ solicitado: "Solicitado", en_lote: "En lote", enviado: "Enviado", confirmado: "Confirmado" });
const NEXT_STATUS = Object.freeze({ solicitado: "en_lote", en_lote: "enviado", enviado: "confirmado" });

export function emptyLedger(agentId) {
  return { agentId, registration: null, earnings: [], payouts: [], passes: [] };
}

/** Yape/Plin: a Peruvian mobile, nine digits starting with 9. CCI: twenty digits. */
export function validateRegistration({ yape, cci } = {}) {
  const phone = String(yape || "").replace(/[\s-]/g, "").replace(/^\+?51/, "");
  const acct = String(cci || "").replace(/[\s-]/g, "");
  const errors = [];
  if (!/^9\d{8}$/.test(phone)) errors.push("El número de Yape o Plin debe tener 9 dígitos y empezar con 9");
  if (!/^\d{20}$/.test(acct)) errors.push("La cuenta CCI debe tener 20 dígitos");
  return errors.length ? { ok: false, errors } : { ok: true, yape: phone, cci: acct };
}

export function earnedPen(ledger) { return round2((ledger.earnings || []).reduce((s, e) => s + e.amountPen, 0)); }
export function cashedOutPen(ledger) { return round2((ledger.payouts || []).reduce((s, p) => s + p.grossPen, 0)); }
export function feesPen(ledger) { return round2((ledger.payouts || []).reduce((s, p) => s + p.feePen, 0)); }
export function balancePen(ledger) { return round2(earnedPen(ledger) - cashedOutPen(ledger)); }

const monthOf = (iso) => limaDay(iso).slice(0, 7);
/** Net already sent (or on its way) through Yape this calendar month. */
export function yapeMonthPen(ledger, now) {
  const m = monthOf(now);
  return round2((ledger.payouts || []).filter((p) => p.channel === "yape" && monthOf(p.requestedAt) === m).reduce((s, p) => s + p.netPen, 0));
}

/**
 * What a cash-out of `amountPen` would be, before she confirms: the fee,
 * the net, and where it goes. Yape unless this payout would take her past
 * the near-cap line this month -- then CCI, automatically.
 */
export function cashoutQuote(ledger, amountPen, cfg, now) {
  const gross = round2(Number(amountPen));
  const bal = balancePen(ledger);
  const errors = [];
  if (!ledger.registration) errors.push("Primero registra tu Yape o Plin y tu cuenta CCI");
  if (!(Number.isFinite(gross) && gross > 0)) errors.push("Escribe un monto");
  else {
    if (gross < cfg.cashoutMinPen) errors.push(`El retiro mínimo es ${payText(cfg.cashoutMinPen)}`);
    if (gross > bal) errors.push(`Tu saldo es ${payText(bal)}`);
    if (gross - cfg.cashoutFeePen <= 0) errors.push("El monto no cubre la comisión");
  }
  const fee = cfg.cashoutFeePen;
  const net = Number.isFinite(gross) ? round2(gross - fee) : 0;
  const nearLine = round2(cfg.yapeMonthlyCapPen * cfg.yapeNearRatio);
  const toCci = yapeMonthPen(ledger, now) + net > nearLine;
  return {
    ok: errors.length === 0, errors, grossPen: gross, feePen: fee, netPen: net, balancePen: bal,
    channel: toCci ? "cci" : "yape",
    channelReason: toCci ? `Este mes ya te acercas al tope de Yape (${payText(cfg.yapeMonthlyCapPen)}): va a tu cuenta CCI` : null,
  };
}

export function requestCashout(ledger, amountPen, cfg, now, kind = "retiro") {
  const q = cashoutQuote(ledger, amountPen, cfg, now);
  if (!q.ok) throw dispatchError(400, q.errors[0], { errors: q.errors });
  const seq = (ledger.payouts || []).length + 1;
  const p = {
    id: `PO-${limaDay(now).replace(/-/g, "")}-${String(ledger.agentId).replace(/[^a-z0-9]/gi, "").slice(0, 10)}-${seq}`,
    kind, requestedAt: now, grossPen: q.grossPen, feePen: q.feePen, netPen: q.netPen,
    channel: kind === "barrido" ? "cci" : q.channel, status: PAYOUT_STATUS.SOLICITADO,
    statusAt: { solicitado: now }, batchId: null,
  };
  (ledger.payouts || (ledger.payouts = [])).push(p);
  return p;
}

/** solicitado -> en lote -> enviado -> confirmado; never backwards. */
export function advancePayout(p, to, now, batchId = null) {
  if (NEXT_STATUS[p.status] !== to) throw dispatchError(409, `No se puede pasar de ${PAYOUT_STATUS_LABELS[p.status]} a ${PAYOUT_STATUS_LABELS[to] || to}`);
  p.status = to;
  p.statusAt = { ...(p.statusAt || {}), [to]: now };
  if (batchId) p.batchId = batchId;
  return p;
}

/** Weekly: whatever was not cashed out goes to CCI, less the same fee. */
export function sweepDue(ledger, cfg) {
  const bal = balancePen(ledger);
  return Boolean(ledger.registration) && bal - cfg.cashoutFeePen > 0 ? bal : 0;
}

/**
 * ONE payment file per batch for BCP Telecrédito "Pagos Masivos Yape".
 * WE DO NOT HAVE BCP'S LAYOUT. This is a DRAFT CSV, labelled as such in
 * its first line, generated only behind cfg.payoutFileDraft, and this
 * code never sends it anywhere.
 */
export function payoutBatchCsv(batch) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "\t" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lines = [
    [`BORRADOR - formato pendiente de la especificación de BCP Telecrédito "Pagos Masivos Yape". No enviar.`],
    [`Lote ${batch.id}`, `Generado ${batch.createdAt}`, `Total neto S/ ${batch.totalNetPen.toFixed(2)}`, `${batch.rows.length} pagos`],
    ["comprador", "canal", "telefono_yape", "cuenta_cci", "monto_neto_pen", "id_pago"],
    ...batch.rows.map((r) => [r.agentName || r.agentId, r.channel === "cci" ? "CCI" : "Yape", r.channel === "yape" ? r.yape : "", r.channel === "cci" ? r.cci : "", r.netPen.toFixed(2), r.payoutId]),
  ];
  return "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Earnings, fees and cash-outs per agent: the payout ledger the nightly reconciliation reads. */
export function payoutLedgerRow(ledger) {
  return {
    agentId: ledger.agentId,
    earnedPen: earnedPen(ledger), checkouts: (ledger.earnings || []).length,
    feesPen: feesPen(ledger), cashedOutPen: cashedOutPen(ledger),
    netPaidPen: round2((ledger.payouts || []).filter((p) => p.status === "confirmado").reduce((s, p) => s + p.netPen, 0)),
    pendingPen: round2((ledger.payouts || []).filter((p) => p.status !== "confirmado").reduce((s, p) => s + p.netPen, 0)),
    balancePen: balancePen(ledger), passes: (ledger.passes || []).length,
  };
}

/* ---------------- time ----------------------------------------------- */

/** The Lima calendar day of an instant (caps reset and months turn on Lima time). */
export function limaDay(iso) {
  const d = new Date(Date.parse(iso) - 5 * 3600 * 1000); // Peru has no DST: UTC-5 all year
  return d.toISOString().slice(0, 10);
}
export function limaWeekday(iso) {
  return new Date(Date.parse(iso) - 5 * 3600 * 1000).getUTCDay();
}
