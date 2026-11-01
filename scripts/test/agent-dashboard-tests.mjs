/* ==================================================================
   COMPRADORES -- the purchasing-agent dashboard's rules (#443, build
   order c.6548594565, design c.6548851542, deep links c.6548858279).

   In-memory stand-ins for Netlify Blobs; every person and email here is
   a TEST FIXTURE. The sample orders are the repo's own catalogue records
   (scripts/build-agent-sample.mjs).

     node scripts/test/agent-dashboard-tests.mjs
   ================================================================== */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as C from "../../assets/agent/agent-core.js";
import { SAMPLE_BATCH } from "../../assets/agent/sample-batch.js";
import * as G from "../../netlify/functions/_agent-auth.js";
import { ledgerRow } from "../../netlify/functions/_ledger.js";

const ROOT = new URL("../../", import.meta.url).pathname;
let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed++; console.log("    ok   " + name); }
  catch (e) { failures.push(`${name}\n         ${String(e.stack).split("\n").slice(0, 2).join(" | ")}`); console.log("    FAIL " + name); }
}
function memStore(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    m,
    get: async (k, o) => (m.has(k) ? (o && o.type === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null),
    setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
    delete: async (k) => { m.delete(k); },
    list: async () => ({ blobs: [...m.keys()].map((key) => ({ key })) }),
  };
}
const T0 = "2026-10-31T13:00:00.000Z";
const at = (min) => new Date(Date.parse(T0) + min * 60000).toISOString();
const fresh = () => C.buildDay(SAMPLE_BATCH);
const clocked = () => { const d = fresh(); for (const a of d.agents) C.clockIn(d, a.id, T0); return d; };
const SHOT = { name: "confirmacion.png", size: 12345 };

/* TEST FIXTURES */
const ADMIN = "jefe@correo.test", AG1 = "compra1@correo.test", AG2 = "compra2@correo.test", SHOPPER = "clienta@correo.test";
const users = () => memStore({
  [ADMIN]: { email: ADMIN }, [SHOPPER]: { email: SHOPPER, name: "Clienta" },
  [AG1]: { email: AG1, name: "Compradora Uno", role: "agent", agentActive: true },
  [AG2]: { email: AG2, name: "Comprador Dos", role: "agent", agentActive: true },
});
const ctxFor = async (email, U) => G.callerRole({}, { users: U, getEmail: async () => email, admin: (e) => e === ADMIN });

console.log("\n  Compradores -- roles");

await check("roleOf: admin by ADMIN_EMAILS, agent only when invited and active, everyone else nobody", () => {
  assert.equal(C.roleOf({ email: ADMIN, isAdmin: true }), "admin");
  assert.equal(C.roleOf({ email: AG1, user: { role: "agent", agentActive: true } }), "agent");
  assert.equal(C.roleOf({ email: AG1, user: { role: "agent", agentActive: false } }), null);
  assert.equal(C.roleOf({ email: SHOPPER, user: { email: SHOPPER } }), null);
  assert.equal(C.roleOf({ email: null, isAdmin: true }), null);
});

await check("agent-queue gating: 401 signed out, 403 shopper, agent gets only her own queue, admin the day", async () => {
  const U = users();
  assert.equal((await G.queueResponse(await ctxFor(null, U), { users: U })).status, 401);
  assert.equal((await G.queueResponse(await ctxFor(SHOPPER, U), { users: U })).status, 403);
  const a = await G.queueResponse(await ctxFor(AG1, U), { users: U });
  assert.equal(a.status, 200);
  assert.equal(a.body.role, "agent");
  assert.ok(a.body.orders.length > 0);
  assert.ok(a.body.orders.every((o) => o.assignedTo === a.body.agentId), "an agent saw someone else's order");
  assert.ok(a.body.history.every((o) => o.assignedTo === a.body.agentId));
  assert.ok(a.body.orders.every((o) => !("fallbackSearch" in o)), "the fallback search string is admin/lead only");
  assert.equal(a.body.agent.name, "Compradora Uno");
  const b = await G.queueResponse(await ctxFor(AG2, U), { users: U });
  assert.notEqual(a.body.agentId, b.body.agentId, "two agents share one queue");
  const adm = await G.queueResponse(await ctxFor(ADMIN, U), { users: U });
  assert.equal(adm.status, 200);
  assert.equal(adm.body.day.orders.length, SAMPLE_BATCH.orders.length);
});

await check("admin board is admin-only: agents and shoppers are refused", async () => {
  const U = users();
  assert.equal((await G.boardResponse(await ctxFor(AG1, U), { users: U })).status, 403);
  assert.equal((await G.boardResponse(await ctxFor(SHOPPER, U), { users: U })).status, 403);
  assert.equal((await G.boardResponse(await ctxFor(null, U), { users: U })).status, 401);
  const ok = await G.boardResponse(await ctxFor(ADMIN, U), { users: U });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.logins.length, 2);
  assert.equal(ok.body.board.length, SAMPLE_BATCH.agents.length);
});

await check("invite-only logins and instant deactivation", async () => {
  const U = users();
  assert.equal((await G.setAgent(U, "nadie@correo.test", { agent: true }, ADMIN)).status, 404, "an agent can only be an existing account");
  assert.equal((await G.setAgent(U, SHOPPER, { agent: true }, ADMIN)).status, 200);
  assert.equal((await ctxFor(SHOPPER, U)).role, "agent");
  assert.equal((await G.setAgent(U, AG1, { active: false }, ADMIN)).status, 200);
  const off = await ctxFor(AG1, U);
  assert.equal(off.role, null, "a deactivated agent still has a role");
  assert.equal((await G.queueResponse(off, { users: U })).status, 403, "deactivation is not instant");
  await G.setAgent(U, AG1, { active: true }, ADMIN);
  assert.equal((await ctxFor(AG1, U)).role, "agent");
  await G.setAgent(U, AG1, { agent: false }, ADMIN);
  assert.equal((await ctxFor(AG1, U)).role, null);
});

await check("scopeForRole refuses anyone who is not admin or agent", () => {
  assert.throws(() => C.scopeForRole(fresh(), null, "a1"));
  assert.throws(() => C.scopeForRole(fresh(), "agent", null));
});

console.log("\n  Compradores -- the morning split");

await check("even split: 800 orders over 4 agents is 200 each", () => {
  const stores = ["s1", "s2", "s3", "s4", "s5"];
  const orders = Array.from({ length: 800 }, (_, i) => ({ orderId: "O" + String(i).padStart(4, "0"), store: stores[i % 5] }));
  const accounts = stores.flatMap((s) => [{ id: s + "-a", store: s, dailyCap: 100 }, { id: s + "-b", store: s, dailyCap: 100 }]);
  const agents = [{ id: "x1" }, { id: "x2" }, { id: "x3" }, { id: "x4" }];
  const { assigned, held } = C.morningSplit(orders, agents, accounts);
  assert.equal(held.length, 0);
  for (const a of agents) assert.equal(assigned.filter((x) => x.agentId === a.id).length, 200);
});

await check("split keeps stores and store accounts together; uneven counts differ by at most one", () => {
  const d = fresh();
  const per = d.agents.map((a) => d.orders.filter((o) => o.assignedTo === a.id).length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 1, "uneven split " + per);
  /* Each agent's queue is contiguous by store then account: a store-account never interleaves inside one queue. */
  for (const a of d.agents) {
    const seq = d.orders.filter((o) => o.assignedTo === a.id).map((o) => o.accountId);
    const seen = new Set();
    seq.forEach((acc, i) => { if (i && seq[i - 1] !== acc) assert.ok(!seen.has(acc), `account ${acc} split inside ${a.id}'s queue`); seen.add(acc); });
  }
  /* Every assigned order is on an account of its own store. */
  for (const o of d.orders.filter((x) => x.accountId)) assert.equal(d.accounts.find((a) => a.id === o.accountId).store, o.store);
});

await check("daily caps are enforced in software: an order past every account's cap is held, never assigned", () => {
  const d = fresh();
  const revolve = d.orders.filter((o) => o.store === "revolve");
  assert.equal(revolve.length, 4);
  assert.equal(revolve.filter((o) => o.status === "por_comprar").length, 3, "cap 3 on the only Revolve account");
  const held = revolve.find((o) => o.status === "retenida");
  assert.ok(held && held.assignedTo === null && /Tope diario/.test(held.heldReason));
  const { held: h2 } = C.morningSplit([{ orderId: "a", store: "z" }, { orderId: "b", store: "z" }], [{ id: "x" }], [{ id: "z1", store: "z", dailyCap: 1 }]);
  assert.deepEqual(h2.map((x) => x.orderId), ["b"]);
  const { held: h3 } = C.morningSplit([{ orderId: "a", store: "z" }], [{ id: "x" }], [{ id: "z1", store: "z", dailyCap: 5 }], { z1: 5 });
  assert.equal(h3.length, 1, "purchases already made today count against the cap");
});

await check("daily cap refuses a completion on a full account", () => {
  const d = clocked();
  const o = d.orders.find((x) => x.status === "por_comprar");
  d.accounts.find((a) => a.id === o.accountId).dailyCap = 0;
  const r = C.completeOrder(d, o.orderId, o.assignedTo, { retailerOrderNumber: "R1", chargedTotalUsd: o.priceUsd, screenshot: SHOT }, at(5));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /tope diario/.test(e)));
  assert.equal(o.status, "por_comprar");
});

console.log("\n  Compradores -- the two lists and completion");

await check("Por comprar starts full and grouped by store, Compradas starts empty; completion moves one across", () => {
  const d = clocked();
  const a = d.agents[0].id;
  const before = C.porComprar(d, a).length;
  assert.ok(before > 0);
  assert.equal(C.compradas(d, a).length, 0);
  const groups = C.porComprarByStore(d, a);
  assert.equal(groups.reduce((n, g) => n + g.orders.length, 0), before);
  assert.equal(new Set(groups.map((g) => g.store)).size, groups.length, "a store appears twice");
  const o = C.nextOrder(d, a);
  const r = C.completeOrder(d, o.orderId, a, { retailerOrderNumber: "  112-55 ", chargedTotalUsd: String(o.priceUsd), screenshot: SHOT }, at(12));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(C.porComprar(d, a).length, before - 1);
  assert.equal(C.compradas(d, a).length, 1);
  assert.equal(C.compradas(d, a)[0].boughtAt, at(12));
  assert.equal(C.compradas(d, a)[0].retailerOrderNumber, "112-55");
  assert.equal(r.next && r.next.orderId, C.nextOrder(d, a).orderId, "the next order slides in");
  assert.deepEqual(d.ledger.at(-1), { orderId: o.orderId, status: "paid", amountUsd: o.priceUsd, retailerOrderNumber: "112-55", at: at(12), agentId: a });
});

await check("completion requires the order number, the charged total and the screenshot -- all three", () => {
  const d = clocked();
  const a = d.agents[1].id, o = C.nextOrder(d, a);
  const tries = [
    [{ chargedTotalUsd: 10, screenshot: SHOT }, /número de pedido/],
    [{ retailerOrderNumber: "R", screenshot: SHOT }, /total cobrado/],
    [{ retailerOrderNumber: "R", chargedTotalUsd: 10 }, /captura/],
    [{ retailerOrderNumber: "R", chargedTotalUsd: "0", screenshot: SHOT }, /total cobrado/],
  ];
  for (const [input, rx] of tries) {
    const r = C.completeOrder(d, o.orderId, a, input, at(1));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => rx.test(e)), JSON.stringify(r.errors));
    assert.equal(o.status, "por_comprar");
  }
  const over = C.completeOrder(d, o.orderId, a, { retailerOrderNumber: "R", chargedTotalUsd: o.ceilingUsd + 0.01, screenshot: SHOT }, at(1));
  assert.equal(over.ok, false, "a charge over the ceiling is not a purchase");
  assert.ok(over.errors.some((e) => /Precio subió/.test(e)));
  assert.equal(C.completeOrder(d, o.orderId, d.agents[0].id, { retailerOrderNumber: "R", chargedTotalUsd: 1, screenshot: SHOT }, at(1)).ok, false, "someone else's order");
});

await check("completion writes the existing ledger's ops entry (Costo producto)", () => {
  const d = clocked();
  const a = d.agents[0].id, o = C.nextOrder(d, a);
  C.completeOrder(d, o.orderId, a, { retailerOrderNumber: "R9", chargedTotalUsd: o.priceUsd, screenshot: SHOT }, at(3));
  assert.equal(o.actuals.precioRealPagadoUsd, o.priceUsd);
  const row = ledgerRow({ ...o, fxRateUsed: 3.5, items: [{ priceUsd: o.priceUsd, qty: 1 }] }, null, null);
  assert.ok(JSON.stringify(row).includes(String(Math.round(o.priceUsd * 3.5 * 100) / 100)), "ledger did not pick up the real product cost");
});

await check("the ceiling sentence is plain words, from the order's own price", () => {
  assert.equal(C.ceilingUsd(29.99, 1), 32.99);
  assert.equal(C.ceilingSentence(32.99, 3.75), "Paga hasta $32.99 (S/ 123.71) — si cuesta más, no compres, repórtalo");
  assert.equal(C.ceilingSentence(32.99, null), "Paga hasta $32.99 (S/ no disponible) — si cuesta más, no compres, repórtalo");
  for (const o of fresh().orders) assert.equal(o.ceilingUsd, C.ceilingUsd(o.priceUsd, o.qty));
});

console.log("\n  Compradores -- problems, exceptions, reasignar");

await check("the four presets, and only those, route to the exception queue tagged with the reason", () => {
  assert.deepEqual(C.PROBLEM_PRESETS.map((p) => p.label), ["Precio subió", "Sin stock", "La tienda me bloqueó", "La tarjeta no pasó"]);
  const d = clocked();
  const a = d.agents[0].id;
  const base = d.exceptions.length;
  for (const p of C.PROBLEM_PRESETS) {
    const o = C.nextOrder(d, a);
    if (!o) break;
    const r = C.reportProblem(d, o.orderId, a, p.id, at(2));
    assert.equal(r.ok, true);
    const ex = d.exceptions.at(-1);
    assert.equal(ex.reason, p.id); assert.equal(ex.reasonLabel, p.label); assert.equal(ex.fromAgent, a); assert.equal(ex.status, "abierta");
    assert.equal(o.status, "excepcion"); assert.equal(o.assignedTo, null);
    assert.ok(!C.porComprar(d, a).includes(o), "the order stayed in her queue");
    assert.notEqual(r.next && r.next.orderId, o.orderId, "she keeps moving");
  }
  assert.equal(d.exceptions.length - base, Math.min(4, d.exceptions.length - base));
  const o = C.nextOrder(d, a) || C.nextOrder(d, d.agents[1].id);
  assert.equal(C.reportProblem(d, o.orderId, o.assignedTo, "otra_cosa", at(3)).ok, false, "a fifth reason exists");
});

await check("REASIGNAR puts the order at the top of the chosen agent's queue; Retener keeps it out of every queue", () => {
  const d = clocked();
  const [a1, a2] = d.agents.map((a) => a.id);
  const o = C.nextOrder(d, a1);
  const { exception } = C.reportProblem(d, o.orderId, a1, "sin_stock", at(1));
  const r = C.reassignException(d, exception.id, a2, at(4));
  assert.equal(r.ok, true);
  assert.equal(exception.status, "reasignada"); assert.equal(exception.toAgent, a2);
  assert.equal(C.nextOrder(d, a2).orderId, o.orderId, "not at the top of her queue");
  assert.equal(C.reassignException(d, exception.id, a1, at(5)).ok, false, "resolved twice");
  const o2 = C.nextOrder(d, a1);
  const { exception: e2 } = C.reportProblem(d, o2.orderId, a1, "tienda_bloqueo", at(6));
  assert.equal(C.holdException(d, e2.id, at(7)).ok, true);
  assert.equal(o2.status, "retenida");
  assert.ok(d.agents.every((a) => !C.porComprar(d, a.id).includes(o2)));
});

await check("midday rebalance evens out a lagging agent's remaining queue among clocked-in agents", () => {
  const d = clocked();
  const [a1, a2, a3] = d.agents.map((a) => a.id);
  for (const o of C.porComprar(d, a2).concat(C.porComprar(d, a3)).slice(0, 10)) o.assignedTo = a1; // a1 lagging
  const before = d.agents.map((a) => C.porComprar(d, a.id).length);
  const moves = C.rebalance(d);
  const after = d.agents.map((a) => C.porComprar(d, a.id).length);
  assert.ok(moves.length > 0);
  assert.equal(after.reduce((s, n) => s + n, 0), before.reduce((s, n) => s + n, 0), "orders lost in the rebalance");
  assert.ok(Math.max(...after) - Math.min(...after) <= 1, "still uneven: " + after);
  assert.ok(moves.every((m) => m.from === a1 || before[d.agents.findIndex((a) => a.id === m.from)] > Math.min(...before)));
  const lone = fresh(); C.clockIn(lone, "a1", T0);
  assert.deepEqual(C.rebalance(lone), [], "nobody clocked in receives orders");
});

await check("breaks pause the clock and show on the board", () => {
  const d = clocked();
  const a = d.agents[0].id;
  C.startBreak(d, a, "almuerzo", at(60));
  assert.equal(C.boardRows(d, at(70)).find((r) => r.agentId === a).onBreak, "Almuerzo");
  assert.equal(C.workedMinutes(d, a, at(90)), 60);
  C.endBreak(d, a, at(100));
  assert.equal(C.workedMinutes(d, a, at(130)), 90);
  assert.throws(() => C.startBreak(d, a, "siesta", at(131)));
  assert.deepEqual(Object.values(C.BREAKS), ["Baño", "Almuerzo"]);
});

console.log("\n  Compradores -- the one-order card");

await check("card reveal: amount and merchant locked, shown once, auto-hides at exactly 10 minutes, closed on capture", () => {
  const d = clocked();
  const a = d.agents[0].id, o = C.nextOrder(d, a);
  const r = C.revealCard(d, o.orderId, a, at(0));
  assert.equal(r.ok, true);
  assert.equal(C.CARD_REVEAL_MS, 600000);
  assert.equal(r.card.amountLockedUsd, o.ceilingUsd);
  assert.equal(r.card.merchantLocked, o.storeLabel);
  assert.equal(r.card.sandbox, true);
  assert.match(r.card.numberMasked, /^[0 ]+$/, "the sandbox card shows a real-looking number");
  assert.equal(C.cardVisible(r.card, at(9.99)), true);
  assert.equal(C.cardSecondsLeft(r.card, at(5)), 300);
  assert.equal(C.cardVisible(r.card, at(10)), false, "visible past 10 minutes");
  assert.equal(C.revealCard(d, o.orderId, a, at(11)).ok, false, "revealed twice");
  const o2 = C.nextOrder(d, a) === o ? C.porComprar(d, a)[1] : C.nextOrder(d, a);
  const r2 = C.revealCard(d, o2.orderId, a, at(20));
  C.completeOrder(d, o2.orderId, a, { retailerOrderNumber: "R", chargedTotalUsd: o2.priceUsd, screenshot: SHOT }, at(22));
  assert.equal(C.cardVisible(r2.card, at(23)), false, "the card stayed open after capture");
  assert.equal(r2.card.capturedUsd, o2.priceUsd);
  assert.equal(C.revealCard(d, o2.orderId, d.agents[1].id, at(1)).ok, false, "another agent's order");
});

console.log("\n  Compradores -- deep links and the link-health guard");

await check("classifier: missing, invalid, bare homepage, search and listing are caught; product pages pass", () => {
  const bad = {
    missing: [null, "", "   "],
    invalid: ["/us/vs/beauty-catalog/1128680200", "ftp://x.com/p/1", "nota"],
    homepage: ["https://www.crocs.com/", "https://www.crocs.com", "https://www.ae.com/us/en", "https://www.hottopic.com/index.html"],
    search: ["https://www.zumiez.com/catalogsearch/result/?q=dress", "https://www.revolve.com/r/Search.jsp?search=coat", "https://www.crocs.com/search?q=clog", "https://shop.example.test/?q=polo"],
    listing: ["https://www.revolve.com/sale", "https://www.crocs.com/c/women", "https://shop.example.test/collections/vestidos", "https://www.hottopic.com/womens/tops"],
  };
  for (const [reason, urls] of Object.entries(bad)) for (const u of urls) assert.equal(C.classifyProductUrl(u).reason, reason, `${u} -> ${JSON.stringify(C.classifyProductUrl(u))}`);
  const good = ["https://www.crocs.com/p/classic-clog/10001.html", "https://www.zumiez.com/empyre-remi-brown-slip-dress-1.html",
    "https://www.revolve.com/helsa-the-dramatic-collar-peacoat-in-navy/dp/HLSA-WO64/", "https://www.gap.com/browse/product.do?pid=500303032",
    "https://shop.example.test/collections/vestidos/products/vestido-azul", "https://www.ae.com/us/en/p/women/tops/tank-tops/ae-sunchaser-side-slit-babydoll-tube-top/0366_6547_073"];
  for (const u of good) assert.equal(C.classifyProductUrl(u).ok, true, u);
});

await check("server check hook (fixtures): 404 and redirects to homepage/search flag; a network error does not", async () => {
  const fx = {
    "https://s.test/p/1.html": { status: 200 },
    "https://s.test/p/gone.html": { status: 404 },
    "https://s.test/p/moved.html": { status: 301, location: "/p/new-1.html" },
    "https://s.test/p/new-1.html": { status: 200 },
    "https://s.test/p/home.html": { status: 302, location: "https://s.test/" },
    "https://s.test/p/srch.html": { status: 302, location: "/search?q=polo" },
  };
  const fetchFx = async (u, o) => {
    assert.equal(o.redirect, "manual", "redirects must be seen, not followed");
    if (u === "https://s.test/p/down.html") throw new Error("ECONNRESET");
    const f = fx[u]; return { status: f.status, headers: { get: (k) => (k === "location" ? f.location || null : null) } };
  };
  assert.deepEqual(await C.checkLinkHealth("https://s.test/p/1.html", fetchFx), { ok: true, reason: null, finalUrl: "https://s.test/p/1.html" });
  assert.equal((await C.checkLinkHealth("https://s.test/p/gone.html", fetchFx)).reason, "not_found");
  assert.equal((await C.checkLinkHealth("https://s.test/p/moved.html", fetchFx)).ok, true);
  assert.equal((await C.checkLinkHealth("https://s.test/p/home.html", fetchFx)).reason, "redirect_home");
  assert.equal((await C.checkLinkHealth("https://s.test/p/srch.html", fetchFx)).reason, "redirect_search");
  assert.equal((await C.checkLinkHealth("https://s.test/p/down.html", fetchFx)).ok, true, "unreachable is not proof of a dead link");
  assert.equal((await C.checkLinkHealth("", fetchFx)).reason, "missing");
});

await check("a bad stored URL auto-flags the order as «Link caído» into Danny's queue; no agent gets it", () => {
  const d = fresh();
  const vs = d.orders.find((o) => o.store === "victoriassecret");
  assert.equal(vs.url, "/us/vs/beauty-catalog/1128680200", "the sample's link-guard case is that record's own stored URL");
  assert.equal(vs.status, "excepcion"); assert.equal(vs.assignedTo, null);
  const ex = d.exceptions.find((e) => e.orderId === vs.orderId);
  assert.equal(ex.reason, "link_caido"); assert.equal(ex.reasonLabel, "Link caído"); assert.equal(ex.fromAgent, null);
  const e2 = fresh(); const o = C.nextOrder(e2, "a1");
  const flagged = C.linkGuard(e2, T0, { [o.orderId]: { ok: false, reason: "not_found" } });
  assert.equal(flagged.length, 1); assert.equal(o.status, "excepcion"); assert.match(flagged[0].note, /404/);
});

await check("COMPRAR is the order's own URL; no variant pinning yet, so the photo check comes before add-to-cart", () => {
  const o = fresh().orders[0];
  assert.deepEqual(C.buyLink(o), { href: o.url, pinned: false });
  assert.deepEqual(C.checklistFor(o).map((s) => s.label), ["Abrí la tienda", "Es el producto exacto (foto, modelo, color, talla)", "Agregué al carrito", "Pagué con tarjeta Aria"]);
  const page = readFileSync(ROOT + "agente.html", "utf8");
  assert.match(page, /id="comprar" href="\$\{esc\(link\.href\)\}" target="_blank" rel="noopener noreferrer"/);
});

await check("sample orders are real catalogue records: title, price, photo, URL and size copied from the record", () => {
  const cache = new Map();
  const recs = (file) => {
    if (!cache.has(file)) {
      const out = []; (function w(o) { if (!o || typeof o !== "object") return; if (Array.isArray(o)) { o.forEach(w); return; } if (o.price != null && o.name && "url" in o) { out.push(o); return; } for (const k in o) w(o[k]); })(JSON.parse(readFileSync(ROOT + file, "utf8")));
      cache.set(file, out);
    }
    return cache.get(file);
  };
  for (const o of [...SAMPLE_BATCH.orders, ...SAMPLE_BATCH.history]) {
    const r = recs(o.source).find((x) => x.url === o.url && x.name === o.title);
    assert.ok(r, `${o.orderId}: no record in ${o.source} with that URL and title`);
    assert.equal(Number(r.price), o.priceUsd);
    const sizes = (r.availableSizes && r.availableSizes.length ? r.availableSizes : r.sizes) || [];
    assert.ok(sizes.includes(o.selectedSize), `${o.orderId}: size ${o.selectedSize} is not one of the record's`);
    assert.ok([r.image, r.thumbnail, ...(r.images || [])].includes(o.image), `${o.orderId}: photo is not the record's`);
    if (o.color) assert.ok((o.title + " " + o.url).toLowerCase().includes(o.color.toLowerCase().replace(/ /g, "")) || (o.title + " " + o.url).toLowerCase().replace(/-/g, " ").includes(o.color.toLowerCase()), `${o.orderId}: colour ${o.color} not stated by the record`);
    assert.match(o.customerName, / Prueba /, "customers are obviously fictional");
  }
  assert.ok(!/@/.test(readFileSync(ROOT + "assets/agent/sample-batch.js", "utf8")), "an email in the sample");
});

console.log("\n  Compradores -- copy");

await check("ALMACEN block is exactly the four lines, with the customer's full name", () => {
  assert.equal(C.almacenBlock("Valeria Prueba Quispe"), "ARIASHOP Valeria Prueba Quispe\nAMEX\n8010 NW 66th Street, Miami, FL 33166\n+1 828 458 8578");
  assert.equal(C.almacenBlock("  Diego   Prueba Rojas "), "ARIASHOP Diego Prueba Rojas\nAMEX\n8010 NW 66th Street, Miami, FL 33166\n+1 828 458 8578");
  const page = readFileSync(ROOT + "agente.html", "utf8");
  assert.match(page, /C\.almacenBlock\(o\.customerName\)/);
  assert.match(page, /id="copyAlmacen"/, "no one-tap copy");
});

await check("no emoji anywhere in the dashboard's pages, styles or scripts", () => {
  for (const f of ["agente.html", "admin-agentes.html", "agente-sw.js", "assets/agent/agent-core.js", "assets/agent/agent-store.js", "assets/agent/agent.css", "assets/agent/sample-batch.js"]) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.equal(C.hasEmoji(src), false, `${f} holds an emoji: ${(src.match(/[\p{Extended_Pictographic}️]/u) || [])[0]}`);
  }
  assert.equal(C.hasEmoji("Comprada \u{1F389}"), true);
  assert.equal(C.hasEmoji("Comprada a las 10:42"), false);
  assert.equal(C.hasEmoji("Studio Ghibli® My Neighbor Totoro"), false, "a registered mark in a product name is not an emoji");
  assert.equal(C.hasEmoji("\u2714\uFE0F listo"), true);
});

await check("staff pages are noindex, disallowed for crawlers, and linked from no public page", () => {
  for (const f of ["agente.html", "admin-agentes.html"]) {
    assert.match(readFileSync(ROOT + f, "utf8"), /<meta name="robots" content="noindex, nofollow">/);
  }
  const robots = readFileSync(ROOT + "robots.txt", "utf8");
  assert.match(robots, /Disallow: \/agente/); assert.match(robots, /Disallow: \/admin-agentes/);
  assert.ok(!readFileSync(ROOT + "sitemap.xml", "utf8").includes("agente"));
  for (const f of ["index.html", "producto.html", "checkout.html", "cuenta.html"].filter((x) => existsSync(ROOT + x))) {
    assert.ok(!/agente\.html|admin-agentes/.test(readFileSync(ROOT + f, "utf8")), `${f} links to a staff page`);
  }
});


console.log("\n  Compradores -- improvement pass (c.6550822918) and auth rule (c.6550830674)");

/* TEST FIXTURE rate: the value the other suites use for SUNAT venta. The pages
   read the real one from /.netlify/functions/exchange-rate. */
const FX = 3.75;

await check("soles next to dollars from the site's own rate; no rate means «S/ no disponible», never a guess", () => {
  assert.equal(C.penOf(7.69, FX), 28.84);
  assert.equal(C.dual(7.69, FX), "$7.69 · S/ 28.84");
  assert.equal(C.dual(7.69, null), "$7.69 · S/ no disponible");
  assert.equal(C.dual(7.69, 0), "$7.69 · S/ no disponible", "a zero rate is not a rate");
  assert.equal(C.dual(7.69, 38), "$7.69 · S/ no disponible", "an absurd rate is not a rate");
  assert.equal(C.FX_CACHE_KEY, "aria_fx_rate_v1", "not the storefront's shared cache key");
  const t = Date.now();
  assert.equal(C.fxFromCache(JSON.stringify({ venta: FX, fetchedAt: t - 1000 }), t).venta, FX);
  assert.equal(C.fxFromCache(JSON.stringify({ venta: FX, fetchedAt: t - 25 * 3600e3 }), t), null, "a stale rate was used");
  assert.equal(C.fxFromCache("{oops", t), null);
  const store = readFileSync(ROOT + "assets/agent/agent-store.js", "utf8");
  assert.match(store, /\/\.netlify\/functions\/exchange-rate/);
  for (const f of ["agente.html", "admin-agentes.html", "agente-sw.js", "assets/agent/agent-core.js", "assets/agent/agent-store.js"]) {
    const src = readFileSync(ROOT + f, "utf8");
    assert.ok(!/FX_FALLBACK|venta\s*[:=]\s*3\.\d|\b3\.(?:4|5|6|7|8)\d?\s*\*\s*/.test(src), `${f} hard-codes an exchange rate`);
  }
});

await check("demo mode exists only on deploy previews and localhost, never on the production domain", () => {
  for (const h of ["localhost", "127.0.0.1", "127.0.0.1:8765", "deploy-preview-576--ariashopperu.netlify.app"]) assert.equal(C.demoAllowed(h), true, h);
  for (const h of ["ariashop.pe", "www.ariashop.pe", "auto.ariashop.pe", "ariashopperu.netlify.app", "main--ariashopperu.netlify.app",
    "claude-agent-dashboard--ariashopperu.netlify.app", "deploy-preview-576--otrositio.netlify.app", "deploy-preview-576--ariashopperu.netlify.app.evil.test", ""]) assert.equal(C.demoAllowed(h), false, h);
  const page = readFileSync(ROOT + "agente.html", "utf8"), admin = readFileSync(ROOT + "admin-agentes.html", "utf8");
  assert.match(page, /const DEMO_OK = C\.demoAllowed\(location\.hostname\)/);
  assert.match(admin, /const demo = DEMO_OK && new URLSearchParams\(location\.search\)\.has\("demo"\)/);
  assert.match(page, /if \(DEMO_OK\) window\.__compradores/, "the test handle leaks to production");
});

await check("production server: no sample day; an agent's login works with an empty queue, admins see an empty board", async () => {
  const U = users();
  const prod = await G.queueResponse(await ctxFor(AG1, U), { users: U, host: "ariashop.pe" });
  assert.equal(prod.status, 200); assert.equal(prod.body.sample, false); assert.deepEqual(prod.body.orders, []);
  const prev = await G.queueResponse(await ctxFor(AG1, U), { users: U, host: "deploy-preview-576--ariashopperu.netlify.app" });
  assert.equal(prev.body.sample, true); assert.ok(prev.body.orders.length > 0);
  const board = await G.boardResponse(await ctxFor(ADMIN, U), { users: U, host: "www.ariashop.pe" });
  assert.equal(board.status, 200); assert.equal(board.body.sample, false); assert.deepEqual(board.body.exceptions, []);
  assert.equal(G.hostOf({ headers: { host: "AriaShop.pe" } }), "ariashop.pe");
});

await check("admin-agentes uses the SAME admin session as /admin.html: no password field, no second login", () => {
  const admin = readFileSync(ROOT + "admin-agentes.html", "utf8");
  assert.ok(!/type="password"|auth-login|auth-signup/.test(admin), "the admin page has its own login");
  const fn = readFileSync(ROOT + "netlify/functions/admin-agents.js", "utf8"), auth = readFileSync(ROOT + "netlify/functions/_agent-auth.js", "utf8");
  assert.match(auth, /import \{ getSessionEmail, isAdmin, normalizeEmail \} from "\.\/_auth-helpers\.js"/);
  assert.match(auth, /roleOf\(\{ email, isAdmin: admin\(email\), user \}\)/);
  assert.match(fn, /ctx\.role !== "admin"/);
  const adminList = readFileSync(ROOT + "netlify/functions/admin-orders-list.js", "utf8");
  assert.match(adminList, /getSessionEmail\(event\)/); assert.match(adminList, /isAdmin\(email\)/);
});

await check("earnings: the pay per purchase defaults to unset and reads «por definir»; set by admin, it multiplies", () => {
  const d = clocked();
  const a = d.agents[0].id;
  assert.equal(C.payRate(d), null);
  for (let i = 0; i < 2; i++) { const o = C.nextOrder(d, a); C.completeOrder(d, o.orderId, a, { retailerOrderNumber: "R" + i, chargedTotalUsd: o.priceUsd, screenshot: SHOT }, at(i + 1)); }
  const e0 = C.earnings(d, a);
  assert.equal(e0.rateText, "Tarifa por compra: por definir"); assert.equal(e0.totalPen, null); assert.equal(e0.bought, 2);
  d.settings.payPerPurchasePen = 1.5;
  assert.deepEqual([C.earnings(d, a).totalPen, C.earnings(d, a).rateText], [3, "Tarifa por compra: S/ 1.50"]);
  const page = readFileSync(ROOT + "agente.html", "utf8");
  assert.ok(!/payPerPurchasePen\s*[:=]\s*\d/.test(page + readFileSync(ROOT + "assets/agent/sample-batch.js", "utf8")), "a pay rate was invented");
});

await check("pay rate setting: admin-only store write, a number in soles or null", async () => {
  const st = memStore();
  assert.equal(await G.readPay(st), null);
  assert.equal((await G.writePay(st, -1, ADMIN)).status, 400);
  assert.equal((await G.writePay(st, "dos", ADMIN)).status, 400);
  assert.equal((await G.writePay(st, 2.5, ADMIN)).status, 200);
  assert.equal(await G.readPay(st), 2.5);
  const U = users();
  const q = await G.queueResponse(await ctxFor(AG1, U), { users: U, settings: st });
  assert.equal(q.body.settings.payPerPurchasePen, 2.5);
  assert.equal((await G.writePay(st, null, ADMIN)).status, 200);
  assert.equal(await G.readPay(st), null);
});

await check("clock-out and the end-of-shift summary: bought, exceptions, earnings, tied to the history search", () => {
  const d = clocked();
  const a = d.agents[0].id;
  let o = C.nextOrder(d, a);
  C.completeOrder(d, o.orderId, a, { retailerOrderNumber: "R1", chargedTotalUsd: o.priceUsd, screenshot: SHOT }, at(30));
  o = C.nextOrder(d, a); C.reportProblem(d, o.orderId, a, "sin_stock", at(40));
  C.startBreak(d, a, "bano", at(50));
  C.clockOut(d, a, at(60));
  const sm = C.shiftSummary(d, a, at(500));
  assert.equal(sm.bought, 1); assert.equal(sm.exceptions, 1); assert.equal(sm.clockOut, at(60));
  assert.equal(sm.workedMin, 50, "the open break ended at clock-out and the clock stopped");
  assert.equal(sm.earnings.rateText, "Tarifa por compra: por definir");
  assert.equal(sm.searchQuery, T0.slice(0, 10));
  assert.deepEqual(C.searchOrders(d, a, sm.searchQuery).map((x) => x.orderId).filter((id) => sm.orders.some((y) => y.orderId === id)), sm.orders.map((x) => x.orderId));
});

await check("outbox: every completion, exception and clock-out waits on the phone until synced", () => {
  const d = clocked();
  const a = d.agents[0].id;
  let o = C.nextOrder(d, a);
  C.completeOrder(d, o.orderId, a, { retailerOrderNumber: "R1", chargedTotalUsd: o.priceUsd, screenshot: SHOT }, at(1));
  o = C.nextOrder(d, a); C.reportProblem(d, o.orderId, a, "precio_subio", at(2));
  C.clockOut(d, a, at(3));
  const p = C.pendingEvents(d);
  assert.deepEqual(p.map((e) => e.type), ["comprada", "excepcion", "salida"]);
  assert.equal(new Set(p.map((e) => e.id)).size, 3);
  assert.equal(C.markSynced(d, [p[0].id, p[1].id], at(9)), 1);
  assert.equal(C.pendingEvents(d)[0].type, "salida");
  assert.equal(C.linkGuard(fresh(), T0).length, 0, "the link guard is not an agent's event");
});

await check("sync endpoint: agent only, own events, idempotent per event id, bad events refused", async () => {
  const U = users(), ev = memStore();
  const good = { id: "a1-1-1", type: "comprada", orderId: "DEMO-20261030-001", at: at(1), data: { retailerOrderNumber: "R1" } };
  assert.equal((await G.acceptEvents(await ctxFor(null, U), { events: [good] }, { events: ev })).status, 401);
  assert.equal((await G.acceptEvents(await ctxFor(SHOPPER, U), { events: [good] }, { events: ev })).status, 403);
  assert.equal((await G.acceptEvents(await ctxFor(ADMIN, U), { events: [good] }, { events: ev })).status, 403);
  const r = await G.acceptEvents(await ctxFor(AG1, U), { events: [good, { id: "x", type: "borrar_todo", at: at(1) }, { id: "y", type: "comprada", at: "ayer" }] }, { events: ev });
  assert.deepEqual(r.body.accepted, ["a1-1-1"]); assert.deepEqual(r.body.rejected, ["x", "y"]);
  await G.acceptEvents(await ctxFor(AG1, U), { events: [good] }, { events: ev });
  assert.equal(ev.m.size, 1, "a resend duplicated the event");
  assert.equal(JSON.parse([...ev.m.values()][0]).agentEmail, AG1, "the event is filed under someone else");
});

await check("celebrations: real Spanish copy, and the 50th completion fires «¡Cincuenta compradas!»", () => {
  for (const m of C.MILESTONES) { assert.match(m.line, /^¡Felicitaciones! /, m.id); assert.equal(C.hasEmoji(m.title + m.line), false); }
  assert.deepEqual(C.MILESTONES.filter((m) => m.at).map((m) => m.at), [1, 10, 25, 50, 100, 150, 200]);
  /* A 210-order day for one agent: the sample's real records, repeated under new ids (fixture). */
  const d = fresh();
  const base = d.orders.filter((o) => o.status === "por_comprar");
  d.agents = [d.agents[0]];
  d.orders = Array.from({ length: 210 }, (_, i) => ({ ...base[i % base.length], orderId: `FX-${String(i).padStart(3, "0")}`, assignedTo: "a1", status: "por_comprar", accountId: "fx" }));
  d.accounts = [{ id: "fx", store: "x", dailyCap: 999 }];
  C.clockIn(d, "a1", T0);
  const fired = {};
  for (let i = 1; i <= 210; i++) {
    const o = C.nextOrder(d, "a1");
    const r = C.completeOrder(d, o.orderId, "a1", { retailerOrderNumber: "R" + i, chargedTotalUsd: o.priceUsd, screenshot: SHOT }, at(i));
    assert.equal(r.ok, true);
    if (r.milestone) fired[i] = r.milestone.id;
  }
  assert.equal(fired[50], "cincuenta");
  assert.equal(C.MILESTONES.find((m) => m.id === "cincuenta").title, "¡Cincuenta compradas!");
  assert.deepEqual(fired, { 1: "primera", 10: "diez", 25: "veinticinco", 50: "cincuenta", 100: "cien", 105: "mitad", 150: "cientocincuenta", 200: "doscientos", 210: "todo" });
});

/* ------------------------- in the browser ------------------------- */
let pw = null;
try { pw = await import("playwright"); } catch { /* reported below */ }
await check("browser: playwright is available for the page checks", () => assert.ok(pw, "playwright is not installed"));
if (pw) {
  const { createServer } = await import("node:http");
  const { join, extname } = await import("node:path");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
  const fileFor = (urlPath) => {
    let p = decodeURIComponent(urlPath.split("?")[0]);
    if (p === "/agente") p = "/agente.html";
    const f = join(ROOT, p);
    return f.startsWith(ROOT) && existsSync(f) && !f.endsWith("/") ? f : null;
  };
  let fxMode = "ok"; // what /.netlify/functions/exchange-rate answers (fixture)
  const srv = createServer((req, res) => {
    if (req.url.startsWith("/.netlify/functions/exchange-rate")) {
      if (fxMode !== "ok") { res.writeHead(502, { "Content-Type": "application/json" }); return res.end("{}"); }
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ compra: 3.74, venta: FX, fecha: "fixture", origen: "SUNAT" }));
    }
    const f = fileFor(req.url);
    if (!f) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  const browser = await pw.chromium.launch();
  const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
  const phone = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === "image" ? r.fulfill({ status: 200, contentType: "image/svg+xml", body: STUB }) : r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    return { ctx, page, errors };
  };
  const clockInAs = async (page, id = "a1") => {
    await page.goto(BASE + "/agente.html");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click(`[data-pick="${id}"]`);
    await page.click("#clockIn");
    await page.waitForSelector("#startNext");
  };
  /* The real three taps: COMPRAR -> Mostrar tarjeta -> Ya pagué, then the form. */
  const buyFocused = async (page, num) => {
    await page.waitForSelector(".dock .primary-act");
    const price = await page.evaluate(() => { const { S } = window.__compradores; return S.day.orders.find((o) => o.orderId === S.focusId).priceUsd; });
    if (await page.$("#comprar")) { await page.click("#comprar"); await page.waitForSelector("#primaryCard"); }
    if (await page.$("#primaryCard")) { await page.click("#primaryCard"); await page.waitForSelector(".sheet [data-paid]"); await page.click(".sheet [data-paid]"); }
    else await page.click("#done");
    await page.waitForSelector("#cf");
    await page.fill("#cf [name=num]", num); await page.fill("#cf [name=total]", String(price));
    await page.setInputFiles("#cf [name=shot]", { name: "c.png", mimeType: "image/png", buffer: Buffer.from("89504e47", "hex") });
    await page.click("#cf button[type=submit]");
  };

  await check("browser: the ALMACEN block in the rendered focus card is exactly the four lines with the order's customer", async () => {
    const { ctx, page, errors } = await phone();
    await clockInAs(page);
    await page.click("#startNext");
    const { text, name } = await page.evaluate(() => { const { S } = window.__compradores; return { text: document.getElementById("almacenText").textContent, name: S.day.orders.find((o) => o.orderId === S.focusId).customerName }; });
    assert.equal(text, `ARIASHOP ${name}\nAMEX\n8010 NW 66th Street, Miami, FL 33166\n+1 828 458 8578`);
    assert.match(name, / Prueba /);
    assert.ok(await page.$("#copyAlmacen"));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check("browser: one primary action per state, sticky at the bottom; completion goes straight to the next order", async () => {
    const { ctx, page, errors } = await phone();
    await clockInAs(page);
    await page.click("#startNext");
    await page.waitForSelector(".dock .primary-act");
    const stateOf = () => page.evaluate(() => ({ n: document.querySelectorAll(".dock .primary-act").length, id: (document.querySelector(".dock .primary-act") || {}).id,
      bottom: Math.round(document.querySelector(".dock").getBoundingClientRect().bottom), vh: innerHeight, focus: window.__compradores.S.focusId }));
    let s1 = await stateOf();
    assert.equal(s1.n, 1); assert.equal(s1.id, "comprar"); assert.equal(s1.bottom, s1.vh, "the primary is not at the bottom");
    const href = await page.getAttribute("#comprar", "href");
    assert.equal(await page.getAttribute("#comprar", "target"), "_blank");
    assert.equal(await page.getAttribute("#comprar", "rel"), "noopener noreferrer");
    assert.equal(href, await page.evaluate(() => { const { S } = window.__compradores; return S.day.orders.find((o) => o.orderId === S.focusId).url; }));
    await page.evaluate(() => window.scrollTo(0, 99999));
    assert.equal((await stateOf()).bottom, s1.vh, "the dock scrolled away");
    await page.click("#comprar"); await page.waitForSelector("#primaryCard");
    assert.equal((await stateOf()).id, "primaryCard");
    await page.click("#primaryCard"); await page.waitForSelector(".vcard");
    await page.click(".sheet [data-x]"); await page.waitForSelector("#done");
    assert.equal((await stateOf()).id, "done");
    /* Every tap target on the card is at least 48px; the primary at least 56px. */
    const small = await page.evaluate(() => [...document.querySelectorAll("main .btn, .dock .btn, .checklist label")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 48).map((b) => b.textContent.trim()));
    assert.deepEqual(small, []);
    assert.ok(await page.evaluate(() => document.querySelector(".dock .primary-act").getBoundingClientRect().height >= 56));
    const first = s1.focus;
    await buyFocused(page, "R-1");
    await page.waitForSelector("#comprar");
    const s2 = await stateOf();
    assert.notEqual(s2.focus, first, "the next order did not slide in");
    assert.ok(await page.$(".focus"), "went back to the list");
    assert.equal(s2.id, "comprar");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check("browser: order cards and the ceiling show soles from the rate endpoint; without it, «S/ no disponible»", async () => {
    fxMode = "ok";
    let { ctx, page } = await phone();
    await clockInAs(page);
    await page.waitForFunction(() => window.__compradores.S.fx);
    const row = await page.evaluate(() => document.querySelectorAll(".row .s")[1].textContent);
    assert.match(row, /^Hasta \$\d+\.\d{2} · S\/ \d+\.\d{2}$/);
    await page.click("#startNext");
    const ceil = await page.textContent("#ceiling");
    const o = await page.evaluate(() => { const { S } = window.__compradores; return S.day.orders.find((x) => x.orderId === S.focusId).ceilingUsd; });
    assert.equal(ceil, `Paga hasta $${o.toFixed(2)} (S/ ${(Math.round(o * FX * 100) / 100).toFixed(2)}) — si cuesta más, no compres, repórtalo`);
    await ctx.close();
    fxMode = "down";
    ({ ctx, page } = await phone());
    await clockInAs(page);
    await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => document.querySelectorAll(".row .s")[1].textContent), /^Hasta \$\d+\.\d{2} · S\/ no disponible$/);
    await ctx.close();
    fxMode = "ok";
  });

  await check("browser (offline): a dropped signal keeps her working; completions queue with a visible indicator and sync on return", async () => {
    const { ctx, page, errors } = await phone();
    await clockInAs(page);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); // now under the worker
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForSelector("#startNext");
    await ctx.setOffline(true);
    await page.click("#startNext");
    await buyFocused(page, "R-OFF-1");
    await page.waitForTimeout(200);
    assert.match(await page.textContent("#syncTag"), /Sin señal · 1 por sincronizar/);
    await page.click("#problem"); await page.click('[data-p="sin_stock"]');
    await page.waitForTimeout(150);
    assert.match(await page.textContent("#syncTag"), /Sin señal · 2 por sincronizar/);
    /* Reload with no signal: the worker serves the page, the day is still there. */
    await page.reload();
    await page.waitForSelector(".shift");
    assert.match(await page.textContent("#syncTag"), /Sin señal · 2 por sincronizar/);
    assert.equal(await page.evaluate(() => window.__compradores.C.compradas(window.__compradores.S.day, "a1").length), 1);
    await ctx.setOffline(false);
    await page.evaluate(() => window.__compradores.sync());
    await page.waitForFunction(() => /Sincronizado/.test(document.getElementById("syncTag").textContent));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check("browser: the 50th completion fires the celebration «¡Cincuenta compradas!» with ¡Felicitaciones!", async () => {
    const { ctx, page, errors } = await phone();
    await clockInAs(page);
    await page.evaluate(() => {
      const { S, C, render } = window.__compradores;
      const base = S.day.orders.filter((o) => o.assignedTo === "a1" && o.status === "por_comprar");
      for (let i = 0; i < 52; i++) S.day.orders.push({ ...base[i % base.length], orderId: "FX-" + i, accountId: "fx" });
      S.day.accounts.push({ id: "fx", store: "x", label: "fixture", dailyCap: 999 });
      for (let i = 0; i < 49; i++) { const o = C.nextOrder(S.day, "a1"); C.completeOrder(S.day, o.orderId, "a1", { retailerOrderNumber: "R" + i, chargedTotalUsd: o.priceUsd, screenshot: { name: "c.png" } }, new Date().toISOString()); }
      render();
    });
    await page.click("#startNext");
    await buyFocused(page, "R-50");
    await page.waitForSelector('.party[data-milestone="cincuenta"]');
    const t = await page.textContent(".party");
    assert.match(t, /50/); assert.match(t, /¡Cincuenta compradas!/); assert.match(t, /¡Felicitaciones!/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".party")).pointerEvents), "none", "the celebration blocks the next tap");
    assert.ok(await page.$(".focus"), "the next order is not underneath");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await check("browser: on the production domain there is no demo; the admin board is never shown signed out", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route("https://ariashop.pe/**", async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.startsWith("/.netlify/functions/")) return r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Inicia sesión"}' });
      const f = fileFor(u.pathname);
      return f ? r.fulfill({ status: 200, contentType: MIME[extname(f)] || "text/plain", body: readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
    });
    await ctx.route("https://deploy-preview-576--ariashopperu.netlify.app/**", async (r) => {
      const u = new URL(r.request().url());
      if (u.pathname.startsWith("/.netlify/functions/")) return r.fulfill({ status: 401, contentType: "application/json", body: "{}" });
      const f = fileFor(u.pathname);
      return f ? r.fulfill({ status: 200, contentType: MIME[extname(f)] || "text/plain", body: readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
    });
    const page = await ctx.newPage();
    await page.goto("https://ariashop.pe/agente.html");
    await page.waitForSelector("#login");
    assert.equal(await page.$("[data-pick]"), null, "the demo picker is on production");
    assert.equal(await page.evaluate(() => typeof window.__compradores), "undefined");
    assert.equal(await page.isVisible("#demoTag"), false);
    await page.goto("https://ariashop.pe/admin-agentes.html?demo=1");
    await page.waitForSelector("#gate");
    assert.equal(await page.$(".agent"), null, "the board showed without Danny's session");
    assert.ok(!/pedidos de muestra/.test(await page.textContent("#gate")), "production offers the demo");
    await page.goto("https://deploy-preview-576--ariashopperu.netlify.app/agente.html");
    await page.waitForSelector("[data-pick]");
    await page.goto("https://deploy-preview-576--ariashopperu.netlify.app/admin-agentes.html?demo=1");
    await page.waitForSelector(".agent");
    await ctx.close();
  });

  await check("browser: Danny's admin session sees the board with no second prompt; a non-admin is denied", async () => {
    const run = async (status, body) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.route("https://ariashop.pe/**", async (r) => {
        const u = new URL(r.request().url());
        if (u.pathname === "/.netlify/functions/admin-agents") return r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        const f = fileFor(u.pathname);
        return f ? r.fulfill({ status: 200, contentType: MIME[extname(f)] || "text/plain", body: readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
      });
      const page = await ctx.newPage();
      await page.goto("https://ariashop.pe/admin-agentes.html");
      await page.waitForSelector("#gate, .tabsbar");
      const out = { gate: !!(await page.$("#gate")), board: !!(await page.$(".tabsbar")), password: !!(await page.$('input[type="password"]')), text: await page.textContent("main") };
      await ctx.close();
      return out;
    };
    const ok = await run(200, { sample: false, payPerPurchasePen: null, logins: [{ email: AG1, name: "Compradora Uno", active: true }], board: [], accounts: [], exceptions: [] });
    assert.deepEqual([ok.gate, ok.board, ok.password], [false, true, false]);
    assert.match(ok.text, /Compradora Uno/);
    const denied = await run(403, { error: "No autorizado" });
    assert.deepEqual([denied.gate, denied.board], [true, false]); assert.match(denied.text, /Acceso denegado/);
    const out = await run(401, { error: "Inicia sesión" });
    assert.deepEqual([out.gate, out.board, out.password], [true, false, false]); assert.match(out.text, /misma de \/admin\.html/);
  });

  await browser.close();
  srv.close();
}

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.log("  FAIL " + f + "\n"); process.exit(1); }
