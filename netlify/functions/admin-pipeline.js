// admin-pipeline.js — Orders pipeline view for the Aria ops dashboard v1.
//
// One module of the ops dashboard (repo lionzion86-commits/ARIA, base main).
// EXCLUSIVE FILE: no other module writes here.
//
// Contract (the UI agent builds against this — keep it stable):
//   GET /.netlify/functions/admin-pipeline?view=pipeline&q=&stage=&express=&limit=25&offset=0
//     -> { orders: [{ orderId, createdAt, customerName, customerEmail,
//                      totalPen, paymentStatus, expressSelected, expressFeeUsd,
//                      currentStage, currentStageLabel,
//                      stages: [{ key, label, at }] }],
//            total, hasMore, unreadable }
//
// Each order is reduced to 11 pipeline stages (Spanish labels — the ops
// dashboard shows these to the Lima team):
//   received, payment_confirmed, purchased_usa, retailer_shipped,
//   miami_received, preparing_intl, in_transit, in_customs,
//   lince_available, out_for_delivery, delivered
//
// Stage sources:
//   - received / payment_confirmed come from the order record itself
//     (order.createdAt / order.paidAt; paidAt is null until a payment
//     event lands, per orders-create.js).
//   - Everything else comes from the order's shipments (Blobs store
//     "shipments" via ./_shipping/store.js listShipments()). An order's
//     shipments are the ones whose orderIds[] contains the order id.
//     Each stage timestamp is the EARLIEST matching statusHistory event
//     across those shipments (ISO 8601 strings compare lexicographically,
//     so "earliest" is a plain string min).
//   - purchased_usa is a NEW shipment status being added by another
//     module; old shipments don't have it and it reads as null.
//   - preparing_intl is the earliest "created" statusHistory event,
//     falling back to the shipment's createdAt.
//   - delivered is the earliest "delivered" event, falling back to
//     shipment.deliveredAt.
//   - lince_available may be absent (it anchors the Velozzy 15-day claim
//     window); null is a real answer here, not an error.
//
// currentStage is the furthest stage (in the 11-stage order above) with a
// timestamp. An order with no shipment yet sits at received /
// payment_confirmed.
//
// Auth: same as every other admin-* function — a real logged-in session
// (getSessionEmail) whose email is on ADMIN_EMAILS (isAdmin). Never trust a
// client-claimed email.
//
// "count:*" keys in the orders store are orders-create.js's daily
// counters, not real orders — filtered out here.

import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { listShipments } from "./_shipping/store.js";

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

export const DEFAULT_PAGE = 25;
export const MAX_PAGE = 100;
const FILTER_SCAN_CHUNK = 25;

const STAGES = [
  { key: "received", label: "Pedido recibido" },
  { key: "payment_confirmed", label: "Pago confirmado" },
  { key: "purchased_usa", label: "Comprado en EE.UU." },
  { key: "retailer_shipped", label: "Tienda lo envió" },
  { key: "miami_received", label: "Recibido en Miami" },
  { key: "preparing_intl", label: "Preparando envío" },
  { key: "in_transit", label: "En camino a Perú" },
  { key: "in_customs", label: "En aduana" },
  { key: "lince_available", label: "Disponible en Lince" },
  { key: "out_for_delivery", label: "En reparto" },
  { key: "delivered", label: "Entregado" },
];
const STAGE_KEYS = new Set(STAGES.map((s) => s.key));
const STAGE_LABELS = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

/** Null (never throw) for an unreadable record; non-objects count as unreadable too. */
async function fetchOrderSettled(store, key) {
  try {
    const v = await store.get(key, { type: "json" });
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Lexicographic min over ISO 8601 strings = earliest timestamp. */
function minIso(values) {
  const vals = values.filter(Boolean).map(String);
  if (!vals.length) return null;
  return vals.reduce((a, b) => (b < a ? b : a));
}

/** Earliest statusHistory event with the given status across shipments, or null. */
function earliestEventAt(shipments, status) {
  let best = null;
  for (const s of shipments || []) {
    const hist = Array.isArray(s.statusHistory) ? s.statusHistory : [];
    for (const e of hist) {
      if (e && e.status === status && e.at) {
        const at = String(e.at);
        if (best === null || at < best) best = at;
      }
    }
  }
  return best;
}

function buildPipelineRow(order, shipmentsByOrder) {
  const orderId = String(order.orderId || "");
  const shipments = shipmentsByOrder.get(orderId) || [];

  const at = {
    received: order.createdAt || null,
    payment_confirmed: order.paidAt || null,
    purchased_usa: earliestEventAt(shipments, "purchased_usa"),
    retailer_shipped: earliestEventAt(shipments, "retailer_shipped"),
    miami_received: earliestEventAt(shipments, "miami_received"),
    preparing_intl: minIso([
      earliestEventAt(shipments, "created"),
      ...shipments.map((s) => s.createdAt),
    ]),
    in_transit: earliestEventAt(shipments, "in_transit"),
    in_customs: earliestEventAt(shipments, "in_customs"),
    lince_available: earliestEventAt(shipments, "lince_available"),
    out_for_delivery: earliestEventAt(shipments, "out_for_delivery"),
    delivered: minIso([
      earliestEventAt(shipments, "delivered"),
      ...shipments.map((s) => s.deliveredAt),
    ]),
  };

  let currentStage = "received";
  for (const s of STAGES) {
    if (at[s.key]) currentStage = s.key;
  }

  // order.express is being added by another module — read defensively.
  // Missing entirely means consolidated (the pre-toggle default).
  const expressSelected = Boolean(order.express && order.express.selected);
  const expressFeeUsd = Number(order.express && order.express.feeUsd) || 0;

  return {
    orderId,
    createdAt: order.createdAt || null,
    customerName: (order.customer && order.customer.name) || "",
    customerEmail: (order.customer && order.customer.email) || "",
    totalPen: order.pricePenCharged ?? null,
    paymentStatus: order.paymentStatus ?? null,
    expressSelected,
    expressFeeUsd,
    currentStage,
    currentStageLabel: STAGE_LABELS[currentStage],
    stages: STAGES.map((s) => ({ key: s.key, label: s.label, at: at[s.key] ?? null })),
  };
}

function rowMatches(row, { q, stage, expressMode }) {
  if (stage && row.currentStage !== stage) return false;
  if (expressMode === "express" && !row.expressSelected) return false;
  if (expressMode === "consolidated" && row.expressSelected) return false;
  if (q) {
    const hay = `${row.orderId} ${row.customerName} ${row.customerEmail}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return json(405, headers, { error: "Method not allowed" });
  }

  const email = await getSessionEmail(event);
  if (!isAdmin(email)) {
    return json(403, headers, { error: "No autorizado" });
  }

  try {
    const params = event.queryStringParameters || {};
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(params.limit) || DEFAULT_PAGE));
    const offset = Math.max(0, Number(params.offset) || 0);
    const q = String(params.q || "").trim().toLowerCase();

    // view: only "pipeline" exists in v1; anything else is treated as pipeline.
    const rawStage = String(params.stage || "").trim();
    if (rawStage !== "" && !STAGE_KEYS.has(rawStage)) {
      // Unknown stage key: no order can be at it, so the honest answer is
      // an empty page rather than silently ignoring the filter.
      return json(200, headers, { orders: [], total: 0, hasMore: false, unreadable: 0 });
    }
    const stage = rawStage === "" ? null : rawStage;

    const rawExpress = String(params.express || "all").trim().toLowerCase();
    const expressMode =
      rawExpress === "express" || rawExpress === "consolidated" ? rawExpress : "all";

    // Shipments index, loaded once: orderId -> [shipments].
    const shipments = await listShipments();
    const shipmentsByOrder = new Map();
    for (const s of shipments) {
      for (const oid of s && Array.isArray(s.orderIds) ? s.orderIds : []) {
        const key = String(oid);
        if (!shipmentsByOrder.has(key)) shipmentsByOrder.set(key, []);
        shipmentsByOrder.get(key).push(s);
      }
    }

    const ordersStore = getStore("orders");
    const { blobs } = await ordersStore.list();
    // Newest day first. Order ids are ARIA-YYYYMMDD-XXXXXX, so descending
    // key order is exact by day (same paging note as admin-dashboard.js:
    // same-day rows can straddle a page boundary; harmless, fixed for real
    // with a real index).
    const keys = blobs
      .map((b) => b.key)
      .filter((k) => !k.startsWith("count:"))
      .sort((a, b) => b.localeCompare(a));

    const filtersActive = q !== "" || stage !== null || expressMode !== "all";

    if (!filtersActive) {
      // Same paging as admin-dashboard.js ordersPage: fetch the slice only,
      // count unreadable instead of throwing.
      const slice = keys.slice(offset, offset + limit);
      const settled = await Promise.all(slice.map((k) => fetchOrderSettled(ordersStore, k)));
      const orders = settled.filter(Boolean);
      const rows = orders.map((o) => buildPipelineRow(o, shipmentsByOrder));
      rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json(200, headers, {
        orders: rows,
        total: keys.length,
        hasMore: offset + slice.length < keys.length,
        unreadable: slice.length - orders.length,
      });
    }

    // With filters active we must scan to know what matches — chunked so we
    // never have more than FILTER_SCAN_CHUNK reads in flight. total here is
    // the exact match count, not a page count.
    let unreadable = 0;
    const matches = [];
    const filter = { q, stage, expressMode };
    for (let i = 0; i < keys.length; i += FILTER_SCAN_CHUNK) {
      const chunk = keys.slice(i, i + FILTER_SCAN_CHUNK);
      const settled = await Promise.all(chunk.map((k) => fetchOrderSettled(ordersStore, k)));
      for (const o of settled) {
        if (!o) {
          unreadable++;
          continue;
        }
        const row = buildPipelineRow(o, shipmentsByOrder);
        if (rowMatches(row, filter)) matches.push(row);
      }
    }
    matches.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const page = matches.slice(offset, offset + limit);
    return json(200, headers, {
      orders: page,
      total: matches.length,
      hasMore: offset + page.length < matches.length,
      unreadable,
    });
  } catch (error) {
    return json(500, headers, { error: error.message });
  }
}
