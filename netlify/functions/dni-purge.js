// THE DAILY DNI PURGE (#443, Danny's storage & retention rules).
//
// Runs once a day and applies _dni-docs.js purgeDecision() to every
// stored photo:
//   - a guest's photo: deleted 30 days after its order is delivered;
//   - an upload that never became an order: deleted after 48 hours;
//   - an order that never got paid: its photos go after 7 days;
//   - a Key Club pack: kept while the account exists, deleted with it.
// "Delivered" is the order's shipments' earliest delivered event (or
// deliveredAt), the same reading as admin-pipeline.js. An order with no
// delivery yet keeps its photos: Amex may still ask about that guía.
//
// It logs counts only -- never a name, number or id.
import { connectLambda, getStore } from "@netlify/blobs";
import { listShipments } from "./_shipping/store.js";
import { DNI_DOCS_STORE, purgeDecision, deleteDoc } from "./_dni-docs.js";

export const config = { schedule: "@daily" };

/** When an order was delivered, from its shipments; null when not yet. */
export function deliveredAtFor(orderId, shipments) {
  let best = null;
  for (const s of shipments || []) {
    if (!Array.isArray(s.orderIds) || !s.orderIds.includes(orderId)) continue;
    const times = [s.deliveredAt, ...(s.statusHistory || []).filter((e) => e && e.status === "delivered").map((e) => e.at)].filter(Boolean);
    for (const t of times) if (best === null || String(t) < best) best = String(t);
  }
  return best;
}

/** One pass over the store. Injected so the test drives it against stubs. */
export async function runPurge({ docs, orders, users, shipments, now = Date.now() }) {
  const { blobs } = await docs.list({ prefix: "meta:" });
  const tally = { kept: 0, deleted: 0, reasons: {} };
  const orderCache = new Map();
  const userCache = new Map();
  for (const { key } of blobs) {
    if (!key.startsWith("meta:")) continue;
    const meta = await docs.get(key, { type: "json" });
    const ctxOrders = {};
    for (const id of (meta && meta.orderIds) || []) {
      if (!orderCache.has(id)) {
        const o = await orders.get(id, { type: "json" });
        orderCache.set(id, o ? { status: o.status, createdAt: o.createdAt, deliveredAt: deliveredAtFor(id, shipments) } : null);
      }
      if (orderCache.get(id)) ctxOrders[id] = orderCache.get(id);
    }
    let memberExists = true;
    if (meta && meta.retention === "member" && meta.owner) {
      if (!userCache.has(meta.owner)) userCache.set(meta.owner, Boolean(await users.get(meta.owner, { type: "json" })));
      memberExists = userCache.get(meta.owner);
    }
    const d = purgeDecision(meta, { now, orders: ctxOrders, memberExists });
    tally.reasons[d.reason] = (tally.reasons[d.reason] || 0) + 1;
    if (d.action === "delete") {
      await deleteDoc(docs, key.slice(5));
      if (!meta) await docs.delete(key);
      tally.deleted++;
    } else tally.kept++;
  }
  return tally;
}

export async function handler(event) {
  connectLambda(event);
  try {
    const tally = await runPurge({
      docs: getStore(DNI_DOCS_STORE),
      orders: getStore("orders"),
      users: getStore("users"),
      shipments: await listShipments(),
    });
    console.info("[dni-purge]", JSON.stringify(tally));
    return { statusCode: 200, body: JSON.stringify(tally) };
  } catch (error) {
    console.error("[dni-purge] failed", error && error.message);
    return { statusCode: 500, body: JSON.stringify({ error: "purge failed" }) };
  }
}
