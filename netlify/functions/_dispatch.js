// LIVE DISPATCH -- the server half of #443 c.6551091244. Underscore: not an
// endpoint. stripe-webhook.js (intake), agent-dispatch.js (the buyer's
// phone), admin-dispatch.js (Danny's board) and the two scheduled
// functions (dispatch-watchdog.js, dispatch-reconcile.js) call it.
//
// The RULES are in /assets/agent/dispatch-core.js (pure, shared with the
// pages, unit-tested). This file adds three things only: Netlify Blobs,
// the atomic writes, and the card program (_card-program.js).
//
// ------------------------------------------------------------------
// NO PARALLEL DATABASE. Orders stay where they are: the "orders" store
// that orders-create.js writes and stripe-webhook.js marks paid. When a
// store checkout is BOUGHT, the order there gets the real cost on the
// field the existing ledger already reads (actuals.precioRealPagadoUsd,
// _ledger.js "Costo producto real") plus the retailer order numbers.
// What is new is the dispatch record of each paid order -- its state
// machine, packet, claim, cards -- in its own stores:
//
//   <ns>-orders   <orderId>            the dispatch record
//   <ns>-agents   ledger/<email>       earnings, payouts, passes, Yape/CCI
//                 presence/<email>     the last poll: clocked in, break, focus
//   <ns>-meta     config, accounts     Danny's settings
//                 evt:<stripeEventId>  every Stripe event that reached intake, once
//                 batch:<id>           payout batches (DRAFT file inside)
//                 recon:last, recon:<day>  the 3-way reconciliation
//                 fake-float, fake-card:<token>  the card FAKE (no Lithic key)
//   <ns>-archive  <orderId>            finished records older than 48 h
//
// <ns> is "dispatch" on the production domain and "dispatch-sandbox" on
// deploy previews and localhost (demoAllowed). Blobs are shared by every
// deploy of a site, so this split is what keeps a preview's test orders
// off Danny's real board (auth rule c.6550830674).
//
// ATOMIC: every change to a record is a compare-and-set -- read it with
// its etag, change it, write it back with onlyIfMatch (onlyIfNew for a
// new key). If anyone wrote in between, the write is refused and the
// change re-runs against the record as it now stands. The claim is that
// change: two buyers pressing ACEPTAR at once both read CLAIMABLE, one
// write lands, the other re-reads CLAIMED and gets "taken".
// ------------------------------------------------------------------
import * as D from "../../assets/agent/dispatch-core.js";
import { demoAllowed } from "../../assets/agent/agent-core.js";
import { cardProgram } from "./_card-program.js";

export const ARCHIVE_AFTER_MS = 48 * 3600 * 1000;

export function namespaceFor(host) {
  return demoAllowed(host) ? "dispatch-sandbox" : "dispatch";
}

/**
 * Compare-and-set. `mutate(current)` returns the next value, or null for
 * "no change"; it may throw to refuse. Retries on a lost race.
 *   returns { value, written }
 */
export async function casUpdate(store, key, mutate, { retries = 30 } = {}) {
  for (let i = 0; i < retries; i++) {
    /* Lost the last race: back off a little, with jitter, before re-reading. */
    if (i) await new Promise((r) => setTimeout(r, Math.random() * 15 * Math.min(i, 6)));
    const got = await store.getWithMetadata(key, { type: "json" });
    const cur = got ? got.data : null;
    const next = mutate(cur == null ? null : structuredClone(cur));
    if (next == null) return { value: cur, written: false };
    const w = cur == null
      ? await store.setJSON(key, next, { onlyIfNew: true })
      : await store.setJSON(key, next, { onlyIfMatch: got.etag });
    if (w && w.modified) return { value: next, written: true };
  }
  throw D.dispatchError(503, "Mucho movimiento en este pedido. Intenta de nuevo.");
}

async function listJson(store, prefix) {
  const { blobs } = await store.list(prefix ? { prefix } : undefined);
  const rows = await Promise.all(blobs.filter((b) => !prefix || b.key.startsWith(prefix)).map((b) => store.get(b.key, { type: "json" }).catch(() => null)));
  return rows.filter(Boolean);
}

/**
 * The engine for one namespace.
 *   getStore(name)  -> a Blobs store (strong consistency in production)
 *   host            -> which namespace; sandbox hosts also get the simulator
 *   card            -> optional injected card program (tests); default by env
 */
export function dispatchEngine({ getStore, host = "", env = process.env, clock = () => new Date().toISOString(), card = null, fetchImpl } = {}) {
  const ns = namespaceFor(host);
  const sandbox = ns === "dispatch-sandbox";
  const orders = getStore(`${ns}-orders`);
  const agents = getStore(`${ns}-agents`);
  const meta = getStore(`${ns}-meta`);
  const archive = getStore(`${ns}-archive`);
  const program = card || cardProgram({ env, meta, fetchImpl });

  const config = async () => D.dispatchConfig((await meta.get("config", { type: "json" })) || {});
  const accounts = async () => ((await meta.get("accounts", { type: "json" })) || {}).list || [];
  const records = () => listJson(orders);
  const presences = () => listJson(agents, "presence/");
  const ledgers = () => listJson(agents, "ledger/");
  const ledgerKey = (id) => "ledger/" + id;
  const updateLedger = (id, fn) => casUpdate(agents, ledgerKey(id), (cur) => fn(cur || D.emptyLedger(id)));

  async function floatUsd(cfg) {
    if (!program.mode.live) return program.availableFloatUsd();
    const c = await meta.get("float-cache", { type: "json" });
    if (c && Date.now() - Date.parse(c.at) < cfg.floatCacheSeconds * 1000) return c.usd;
    const usd = await program.availableFloatUsd();
    await meta.setJSON("float-cache", { usd, at: new Date().toISOString() });
    return usd;
  }

  /* Who could have taken it: the reason an order lands in sin asignar. */
  function poolReason(rec, pres, accs, usage, now, cfg) {
    const avail = pres.filter((p) => D.availability(p, now, cfg).ok);
    if (!avail.length) return "Nadie disponible en el timbre";
    const capable = avail.filter((p) => D.capsFor(rec.packet, p.agentId, accs, usage).ok);
    if (!capable.length) {
      const miss = new Set(avail.flatMap((p) => D.capsFor(rec.packet, p.agentId, accs, usage).missing));
      return `Sin cuenta de tienda con cupo para: ${[...miss].join(", ")}`;
    }
    return `Nadie lo tomó en ${cfg.ringSeconds} s`;
  }

  /**
   * One pass of the clock: rings that ran out go to sin asignar, and the
   * float gate releases or holds what is waiting. Safe to run from every
   * poll at once: each change is a conditional write that re-checks state.
   */
  async function tick() {
    const now = clock();
    const cfg = await config();
    let recs = await records();
    const expired = recs.filter((r) => D.ringExpired(r, now));
    if (expired.length) {
      const [pres, accs] = await Promise.all([presences(), accounts()]);
      const usage = D.accountUsageToday(recs, D.limaDay(now));
      for (const r of expired) {
        const reason = poolReason(r, pres, accs, usage, now, cfg);
        await casUpdate(orders, r.orderId, (cur) => (cur && D.ringExpired(cur, now) ? D.toPool(cur, now, reason) : null));
      }
    }
    const waiting = recs.filter((r) => r.state === D.STATES.PAID || r.state === D.STATES.FUNDS_HOLD);
    let released = 0, held = 0, floatAvail = null;
    if (waiting.length) {
      recs = await records();
      floatAvail = await floatUsd(cfg);
      const [pres, accs] = await Promise.all([presences(), accounts()]);
      const usage = D.accountUsageToday(recs, D.limaDay(now));
      for (const d of D.floatGate(recs, floatAvail)) {
        await casUpdate(orders, d.orderId, (cur) => {
          if (!cur || (cur.state !== D.STATES.PAID && cur.state !== D.STATES.FUNDS_HOLD)) return null;
          if (d.release) {
            D.release(cur, now, cfg);
            /* The broadcast list at the instant it became claimable (audit and board). */
            cur.pinged = pres.filter((p) => D.eligibleFor(cur, p.agentId, { presence: p, accounts: accs, usage, now, cfg }).ok).map((p) => p.agentId);
            released++;
            return cur;
          }
          const same = cur.state === D.STATES.FUNDS_HOLD && cur.fundsHold && cur.fundsHold.shortfallUsd === d.shortfallUsd && cur.fundsHold.availableUsd === d.availableUsd;
          if (same) return null;
          held++;
          return D.hold(cur, now, d);
        });
      }
    }
    return { released, held, expired: expired.length, floatUsd: floatAvail };
  }

  /** Stripe said paid: the dispatch record, once per order, then the gate. */
  async function intake(order, { eventId = null } = {}) {
    if (!order || !order.orderId) return { skipped: "sin pedido" };
    if (order.paymentStatus !== "paid") return { skipped: "no pagado" };
    const now = clock();
    const cfg = await config();
    if (eventId) await meta.setJSON("evt:" + eventId, { orderId: order.orderId, at: now }, { onlyIfNew: true });
    const rec = D.newDispatch(order, { now, eventId, ceilingMargin: cfg.ceilingMargin, sandbox });
    const w = await orders.setJSON(order.orderId, rec, { onlyIfNew: true });
    if (!w || !w.modified) {
      /* Order id is the idempotency key: a second event for the same order is noted, never re-dispatched. */
      if (eventId) await casUpdate(orders, order.orderId, (cur) => (cur && !cur.stripeEventIds.includes(eventId) ? { ...cur, stripeEventIds: [...cur.stripeEventIds, eventId] } : null));
      return { duplicate: true, orderId: order.orderId };
    }
    await tick();
    const after = await orders.get(order.orderId, { type: "json" });
    return { created: true, orderId: order.orderId, state: after && after.state };
  }

  /** What the claimed buyer sees of her order: everything, cards as public fields only. */
  function agentPacket(rec) {
    return {
      orderId: rec.orderId, customerName: rec.customerName, state: rec.state, stateLabel: D.STATE_LABELS[rec.state],
      claimedAt: rec.claimedAt, sandbox: rec.sandbox, packet: rec.packet,
    };
  }

  /** The phone's short poll: presence in, ping / taken / her orders / her money out. */
  async function poll(agentId, input = {}) {
    const now = clock();
    const presence = {
      agentId, name: String(input.name || "").slice(0, 80) || null,
      clockedIn: Boolean(input.clockedIn), clockedOut: Boolean(input.clockedOut),
      onBreak: input.onBreak ? String(input.onBreak).slice(0, 20) : null, focus: Boolean(input.focus), seenAt: now,
    };
    await agents.setJSON("presence/" + agentId, presence);
    await tick();
    const cfg = await config();
    const [recs, accs, ledger] = await Promise.all([records(), accounts(), agents.get(ledgerKey(agentId), { type: "json" })]);
    const usage = D.accountUsageToday(recs, D.limaDay(now));
    const ringing = recs.filter((r) => r.state === D.STATES.CLAIMABLE).sort((a, b) => String(a.ringStartedAt).localeCompare(String(b.ringStartedAt)));
    const pingRec = ringing.find((r) => D.eligibleFor(r, agentId, { presence, accounts: accs, usage, now, cfg }).ok) || null;
    let watch = null;
    if (input.watching) {
      const w = recs.find((r) => r.orderId === input.watching);
      watch = w ? { orderId: w.orderId, state: w.state, takenByOther: Boolean(w.claimedBy && w.claimedBy !== agentId), mine: w.claimedBy === agentId } : { orderId: input.watching, state: null, takenByOther: false };
    }
    const today = D.limaDay(now);
    const mine = recs.filter((r) => r.claimedBy === agentId && (!D.TERMINAL.has(r.state) || D.limaDay(r.updatedAt) === today)).map(agentPacket);
    const L = ledger || D.emptyLedger(agentId);
    return {
      now, me: agentId, sandbox, cardMode: program.mode.label,
      config: { payPerCheckoutPen: cfg.payPerCheckoutPen, ringSeconds: cfg.ringSeconds, pollSeconds: cfg.pollSeconds, cashoutMinPen: cfg.cashoutMinPen, cashoutFeePen: cfg.cashoutFeePen, yapeMonthlyCapPen: cfg.yapeMonthlyCapPen, yapeNearRatio: cfg.yapeNearRatio },
      availability: D.availability(presence, now, cfg),
      ping: pingRec ? { ...D.popupModel(pingRec, cfg), secondsLeft: Math.max(0, Math.ceil((Date.parse(pingRec.ringEndsAt) - Date.parse(now)) / 1000)) } : null,
      watch, mine, ledger: ledgerView(L),
    };
  }

  function ledgerView(L) {
    return {
      registration: L.registration, balancePen: D.balancePen(L), earnedPen: D.earnedPen(L), feesPen: D.feesPen(L),
      earnings: L.earnings.slice(-50).reverse(), payouts: [...L.payouts].reverse(), passes: L.passes.length,
      // the raw ledger, so the page can show the exact quote rule before confirming
      ledger: { agentId: L.agentId, registration: L.registration, earnings: L.earnings, payouts: L.payouts, passes: [] },
    };
  }

  async function issueCards(orderId) {
    const rec = await orders.get(orderId, { type: "json" });
    const issued = {};
    for (const c of rec.packet.checkouts) {
      if (c.state !== D.CHECKOUT.PENDING || (c.card && c.card.token)) continue;
      try {
        issued[c.id] = await program.issueCard({ checkoutId: c.id, amountUsd: c.budgetUsd, merchant: c.storeLabel });
      } catch (e) {
        issued[c.id] = { error: e.message };
      }
    }
    const { value } = await casUpdate(orders, orderId, (cur) => {
      let changed = false;
      for (const c of cur.packet.checkouts) {
        const got = issued[c.id];
        if (!got || (c.card && c.card.token)) continue;
        changed = true;
        if (got.error) { c.cardError = got.error; continue; }
        c.cardError = null;
        c.card = { token: got.token, last4: got.last4, state: got.state, type: got.type, spendLimitUsd: got.spendLimitUsd, merchant: got.merchant, fake: Boolean(got.fake), mode: program.mode.label, issuedAt: got.issuedAt || clock() };
      }
      return changed ? cur : null;
    });
    return value;
  }

  /** ACEPTAR. First conditional write wins; the loser gets 409 taken. Cards are issued at claim. */
  async function claimOrder(agentId, orderId) {
    const now = clock();
    const [recs, accs] = await Promise.all([records(), accounts()]);
    const usage = D.accountUsageToday(recs.filter((r) => r.orderId !== orderId), D.limaDay(now));
    const { value } = await casUpdate(orders, orderId, (cur) => {
      if (!cur) throw D.dispatchError(404, "Ese pedido no existe");
      return D.claim(cur, agentId, now, { accounts: accs, usage });
    });
    const withCards = await issueCards(orderId);
    return agentPacket(withCards || value);
  }

  /** Pasar: on the order and in her history, so Danny sees cherry-picking. */
  async function passOrder(agentId, orderId) {
    const now = clock();
    const { value } = await casUpdate(orders, orderId, (cur) => {
      if (!cur) throw D.dispatchError(404, "Ese pedido no existe");
      if ((cur.passes || []).some((p) => p.agentId === agentId)) return null;
      return D.pass(cur, agentId, now);
    });
    await updateLedger(agentId, (L) => (L.passes.some((p) => p.orderId === orderId) ? null : { ...L, passes: [...L.passes, { orderId, customerName: value.customerName, at: now, stores: value.packet.checkouts.length }] }));
    return { ok: true };
  }

  /* The real cost onto the existing order, for the ledger's Costo producto real. */
  async function writeActualsToOrder(rec) {
    let real;
    try { real = getStore("orders"); } catch { return; }
    const bought = rec.packet.checkouts.filter((c) => c.state === D.CHECKOUT.BOUGHT);
    await casUpdate(real, rec.orderId, (cur) => {
      if (!cur) return null;
      const total = D.round2(bought.reduce((s, c) => s + c.chargedTotalUsd, 0));
      const retailerOrders = bought.map((c) => ({ store: c.storeLabel, retailerOrderNumber: c.retailerOrderNumber, chargedTotalUsd: c.chargedTotalUsd, at: c.boughtAt }));
      if (cur.actuals && cur.actuals.precioRealPagadoUsd === total && (cur.retailerOrders || []).length === retailerOrders.length) return null;
      return { ...cur, actuals: { ...(cur.actuals || {}), precioRealPagadoUsd: total }, retailerOrders, dispatchState: rec.state };
    }).catch(() => null);
  }

  async function closeCard(orderId, checkoutId, captureUsd) {
    const rec = await orders.get(orderId, { type: "json" });
    const c = rec && rec.packet.checkouts.find((x) => x.id === checkoutId);
    if (!c || !c.card || !c.card.token || c.card.state === "CLOSED") return;
    if (captureUsd != null) await program.recordCapture(c.card.token, captureUsd, checkoutId);
    let state = "CLOSED";
    try { await program.setState(c.card.token, "CLOSED"); } catch { state = c.card.state; }
    await casUpdate(orders, orderId, (cur) => {
      const cc = cur.packet.checkouts.find((x) => x.id === checkoutId);
      if (!cc || !cc.card || cc.card.state === state) return null;
      cc.card.state = state; cc.card.closedAt = clock();
      return cur;
    });
  }

  /**
   * The phone's outbox, for dispatch: checkout_comprado and
   * checkout_excepcion. Each event id is applied once; a resend after a
   * dropped signal is accepted again and changes nothing.
   */
  async function applyEvents(agentId, events) {
    const cfg = await config();
    const accepted = [], rejected = [];
    for (const e of (Array.isArray(events) ? events : []).slice(0, 100)) {
      try {
        if (!e || typeof e.id !== "string" || !e.orderId || !e.checkoutId) throw D.dispatchError(400, "Evento incompleto");
        const at = !Number.isNaN(Date.parse(e.at)) && Date.parse(e.at) <= Date.parse(clock()) + 60000 ? e.at : clock();
        if (e.type === "checkout_comprado") {
          const { value } = await casUpdate(orders, e.orderId, (cur) => {
            if (!cur) throw D.dispatchError(404, "Ese pedido no existe");
            const out = D.checkoutBought(cur, e.checkoutId, agentId, { ...(e.data || {}), eventId: e.id }, at, cfg);
            return out.duplicate ? null : out.rec;
          });
          const c = value.packet.checkouts.find((x) => x.id === e.checkoutId);
          if (c && c.state === D.CHECKOUT.BOUGHT && c.boughtBy === agentId) {
            /* Earnings accrue now, once per checkout id. */
            await updateLedger(agentId, (L) => (L.earnings.some((x) => x.id === c.id) ? null
              : { ...L, earnings: [...L.earnings, { id: c.id, orderId: value.orderId, store: c.storeLabel, customerName: value.customerName, amountPen: cfg.payPerCheckoutPen, at: c.boughtAt }] }));
            await closeCard(e.orderId, e.checkoutId, c.chargedTotalUsd);
            await writeActualsToOrder(await orders.get(e.orderId, { type: "json" }));
          }
        } else if (e.type === "checkout_excepcion") {
          await casUpdate(orders, e.orderId, (cur) => {
            if (!cur) throw D.dispatchError(404, "Ese pedido no existe");
            const out = D.checkoutException(cur, e.checkoutId, agentId, (e.data || {}).reason, at, (e.data || {}).note);
            return out.duplicate ? null : out.rec;
          });
          await closeCard(e.orderId, e.checkoutId, null);
        } else throw D.dispatchError(400, "Tipo de evento desconocido");
        accepted.push(e.id);
      } catch (err) {
        rejected.push({ id: e && e.id, error: err.message, errors: err.errors || null, code: err.code || 500 });
      }
    }
    return { accepted, rejected };
  }

  async function register(agentId, input) {
    const v = D.validateRegistration(input);
    if (!v.ok) throw D.dispatchError(400, v.errors[0], { errors: v.errors });
    const now = clock();
    const { value } = await updateLedger(agentId, (L) => ({ ...L, registration: { yape: v.yape, cci: v.cci, registeredAt: now } }));
    return ledgerView(value);
  }

  async function cashout(agentId, amountPen) {
    const cfg = await config();
    const now = clock();
    let payout = null;
    const { value } = await updateLedger(agentId, (L) => { payout = D.requestCashout(L, amountPen, cfg, now); return L; });
    return { payout, ledger: ledgerView(value) };
  }

  /* ---------------- Danny ---------------- */

  async function board() {
    const now = clock();
    const cfg = await config();
    const [recs, accs, pres, leds, batchRows, recon] = await Promise.all([records(), accounts(), presences(), ledgers(), listJson(meta, "batch:"), meta.get("recon:last", { type: "json" })]);
    let floatAvail = null, floatError = null;
    try { floatAvail = await floatUsd(cfg); } catch (e) { floatError = e.message; }
    const counts = Object.fromEntries(Object.keys(D.STATES).map((k) => [k, 0]));
    for (const r of recs) counts[r.state]++;
    const holds = recs.filter((r) => r.state === D.STATES.FUNDS_HOLD);
    const payouts = leds.flatMap((L) => L.payouts.map((p) => ({ ...p, agentId: L.agentId, registration: L.registration })));
    return {
      now, sandbox, cardMode: program.mode.label, config: cfg, accounts: accs,
      float: { availableUsd: floatAvail, outstandingUsd: D.outstandingUsd(recs), error: floatError, source: program.mode.source },
      counts,
      fundsHoldShortfallUsd: D.round2(holds.reduce((s, r) => s + ((r.fundsHold && r.fundsHold.shortfallUsd) || 0), 0)),
      orders: recs.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).map((r) => ({
        orderId: r.orderId, customerName: r.customerName, state: r.state, stateLabel: D.STATE_LABELS[r.state], stateSince: r.stateSince,
        minutesInState: D.minutesIn(r, now), paidAt: r.paidAt, ringEndsAt: r.ringEndsAt, claimedBy: r.claimedBy, claimedAt: r.claimedAt,
        fundsHold: r.fundsHold, unassignedReason: r.unassignedReason, passes: r.passes, pinged: r.pinged, sandbox: r.sandbox,
        budgetUsd: r.packet.budgetUsd, totalUsd: r.packet.totalUsd, itemCount: r.packet.itemCount,
        checkouts: r.packet.checkouts.map((c) => ({ id: c.id, storeLabel: c.storeLabel, state: c.state, budgetUsd: c.budgetUsd, retailerOrderNumber: c.retailerOrderNumber || null,
          chargedTotalUsd: c.chargedTotalUsd ?? null, reasonLabel: c.reasonLabel || null, accountId: c.accountId, cardLast4: c.card ? c.card.last4 : null, cardState: c.card ? c.card.state : null, cardError: c.cardError || null,
          items: c.items.map((i) => ({ title: i.title, image: i.image, url: i.url, linkProblem: i.linkProblem })) })),
        history: r.history, escalations: r.escalations,
      })),
      escalations: recs.map((r) => D.stuck(r, now, cfg)).filter(Boolean),
      presence: pres.map((p) => ({ ...p, availability: D.availability(p, now, cfg) })),
      payoutLedger: leds.map(D.payoutLedgerRow),
      passesByAgent: Object.fromEntries(leds.map((L) => [L.agentId, L.passes])),
      payoutQueue: payouts.filter((p) => p.status === "solicitado"),
      payoutsInFlight: payouts.filter((p) => p.status === "en_lote" || p.status === "enviado"),
      batches: batchRows.map(({ csv, ...b }) => b).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), // eslint-disable-line no-unused-vars
      pot: { balancePen: cfg.potBalancePen, lowAlertPen: cfg.potLowAlertPen, low: cfg.potBalancePen != null && cfg.potLowAlertPen != null && cfg.potBalancePen < cfg.potLowAlertPen,
        pendingNetPen: D.round2(payouts.filter((p) => p.status !== "confirmado").reduce((s, p) => s + p.netPen, 0)) },
      reconciliation: recon || null,
    };
  }

  async function setConfig(partial) {
    const cur = (await meta.get("config", { type: "json" })) || {};
    const next = { ...cur };
    for (const [k, v] of Object.entries(partial || {})) if (k in D.DISPATCH_DEFAULTS) next[k] = v;
    const clean = D.dispatchConfig(next);
    await meta.setJSON("config", { ...next, ...clean });
    return clean;
  }

  async function setAccounts(list) {
    if (!Array.isArray(list)) throw D.dispatchError(400, "Faltan las cuentas");
    const clean = list.slice(0, 200).map((a, i) => ({
      id: String(a.id || `${a.store}-${i + 1}`).slice(0, 60), store: String(a.store || "").trim().toLowerCase().replace(/\s+/g, ""),
      label: String(a.label || a.store || "").slice(0, 80), dailyCap: Math.max(0, Math.min(999, Math.round(Number(a.dailyCap) || 0))),
      agentId: a.agentId ? String(a.agentId).toLowerCase().slice(0, 120) : null, active: a.active !== false,
    })).filter((a) => a.store);
    await meta.setJSON("accounts", { list: clean, at: clock() });
    return clean;
  }

  async function setFakeFloat(usd, by) {
    if (program.mode.live) throw D.dispatchError(409, "Con Lithic conectado el saldo viene de Lithic");
    if (!(Number.isFinite(Number(usd)) && Number(usd) >= 0)) throw D.dispatchError(400, "Monto inválido");
    await program.setFloat(Number(usd), by);
    await tick();
    return program.availableFloatUsd();
  }

  async function reRingOrder(orderId) {
    const cfg = await config();
    const now = clock();
    const { value } = await casUpdate(orders, orderId, (cur) => {
      if (!cur) throw D.dispatchError(404, "Ese pedido no existe");
      if (cur.state !== D.STATES.SIN_ASIGNAR) throw D.dispatchError(409, "Solo se vuelve a ofrecer un pedido sin asignar");
      return D.reRing(cur, now, cfg);
    });
    return value;
  }

  /* The cart line had no product link: Danny pastes it here. */
  async function setItemLink(orderId, checkoutId, index, url) {
    const { classifyProductUrl, LINK_REASON_LABELS } = await import("../../assets/agent/agent-core.js");
    const c0 = classifyProductUrl(url);
    if (!c0.ok) throw D.dispatchError(400, LINK_REASON_LABELS[c0.reason] || "Link inválido");
    const { value } = await casUpdate(orders, orderId, (cur) => {
      const c = cur && cur.packet.checkouts.find((x) => x.id === checkoutId);
      const it = c && c.items[Number(index)];
      if (!it) throw D.dispatchError(404, "Ese artículo no existe");
      Object.assign(it, { url: String(url).trim(), linkOk: true, linkProblem: null });
      return cur;
    });
    return value;
  }

  async function generateBatch(by) {
    const cfg = await config();
    if (!cfg.payoutFileDraft) throw D.dispatchError(409, "El archivo de pagos está desactivado (payoutFileDraft)");
    const now = clock();
    const id = "LOTE-" + now.replace(/[-:TZ.]/g, "").slice(0, 14);
    const rows = [];
    for (const L of await ledgers()) {
      const pending = L.payouts.filter((p) => p.status === "solicitado");
      if (!pending.length) continue;
      await updateLedger(L.agentId, (cur) => {
        for (const p of cur.payouts) if (p.status === "solicitado") D.advancePayout(p, "en_lote", now, id);
        return cur;
      });
      for (const p of pending) rows.push({ payoutId: p.id, agentId: L.agentId, agentName: L.agentId, channel: p.channel, yape: L.registration ? L.registration.yape : "", cci: L.registration ? L.registration.cci : "", netPen: p.netPen });
    }
    if (!rows.length) throw D.dispatchError(409, "No hay retiros solicitados");
    const batch = { id, createdAt: now, createdBy: by || null, draft: true, sent: false, rows, totalNetPen: D.round2(rows.reduce((s, r) => s + r.netPen, 0)), status: "en_lote" };
    batch.csv = D.payoutBatchCsv(batch);
    await meta.setJSON("batch:" + id, batch);
    return batch;
  }

  async function batchFile(id) {
    const b = await meta.get("batch:" + id, { type: "json" });
    if (!b) throw D.dispatchError(404, "Ese lote no existe");
    return b;
  }

  async function markBatch(id, to) {
    const b = await batchFile(id);
    const now = clock();
    for (const agentId of new Set(b.rows.map((r) => r.agentId))) {
      await updateLedger(agentId, (cur) => {
        for (const p of cur.payouts) if (p.batchId === id && p.status !== to) D.advancePayout(p, to, now);
        return cur;
      });
    }
    await meta.setJSON("batch:" + id, { ...b, status: to, [to + "At"]: now });
    return { id, status: to };
  }

  /** Nightly: Stripe payment <-> retailer order number <-> card charge. */
  async function reconcile() {
    const now = clock();
    const recs = (await records()).concat(await listJson(archive).catch(() => []));
    const payStore = getStore("payments");
    const payments = {}, charges = {};
    for (const r of recs) {
      if (!r.packet.checkouts.some((c) => c.state === D.CHECKOUT.BOUGHT)) continue;
      if (r.paymentId) {
        const p = await payStore.get(r.paymentId, { type: "json" }).catch(() => null);
        if (p) payments[r.orderId] = { status: p.status === "succeeded" || p.status === "partially_refunded" ? "paid" : p.status, amountPen: p.amount ?? null };
      }
      for (const c of r.packet.checkouts) if (c.card && c.card.token) charges[c.card.token] = await program.charges(c.card.token).catch(() => []);
    }
    const rows = D.reconcile3(recs, payments, charges);
    const out = { at: now, day: D.limaDay(now), rows, ok: rows.filter((r) => r.ok).length, issues: rows.filter((r) => !r.ok).length, payoutLedger: (await ledgers()).map(D.payoutLedgerRow) };
    await meta.setJSON("recon:last", out);
    await meta.setJSON("recon:" + out.day, out);
    return out;
  }

  /** Every five minutes: the clock, escalations stamped once per state, and old records archived. */
  async function watchdog() {
    await tick();
    const now = clock();
    const cfg = await config();
    const out = [];
    for (const r of await records()) {
      const s = D.stuck(r, now, cfg);
      if (s) {
        out.push(s);
        await casUpdate(orders, r.orderId, (cur) => {
          if (!cur || cur.state !== s.state || (cur.escalations || []).some((x) => x.state === s.state && x.since === cur.stateSince)) return null;
          cur.escalations = [...(cur.escalations || []), { state: s.state, since: cur.stateSince, at: now, minutes: s.minutes, text: s.text }];
          return cur;
        });
      } else if (D.TERMINAL.has(r.state) && Date.parse(now) - Date.parse(r.updatedAt) > ARCHIVE_AFTER_MS) {
        await archive.setJSON(r.orderId, r);
        await orders.delete(r.orderId);
      }
    }
    return { escalations: out };
  }

  /** Weekly: balances not cashed out go to CCI (once per Lima day it is due). */
  async function sweep() {
    const now = clock();
    const cfg = await config();
    if (D.limaWeekday(now) !== cfg.sweepWeekday) return { due: false };
    const key = "sweep:" + D.limaDay(now);
    const w = await meta.setJSON(key, { at: now }, { onlyIfNew: true });
    if (!w || !w.modified) return { due: true, already: true };
    const swept = [];
    for (const L of await ledgers()) {
      const amt = D.sweepDue(L, cfg);
      if (!amt) continue;
      await updateLedger(L.agentId, (cur) => { const a = D.sweepDue(cur, cfg); if (!a) return null; D.requestCashout(cur, a, { ...cfg, cashoutMinPen: 0 }, now, "barrido"); return cur; });
      swept.push({ agentId: L.agentId, amountPen: amt });
    }
    return { due: true, swept };
  }

  return {
    ns, sandbox, program, config, accounts, records, tick, intake, poll, claimOrder, passOrder, applyEvents, register, cashout,
    board, setConfig, setAccounts, setFakeFloat, reRingOrder, setItemLink, generateBatch, batchFile, markBatch, reconcile, watchdog, sweep,
    ledger: async (id) => (await agents.get(ledgerKey(id), { type: "json" })) || D.emptyLedger(id),
    updateLedger, orderRecord: (id) => orders.get(id, { type: "json" }),
  };
}
