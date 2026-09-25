// Consolidation batches + claims tracker (Aria ops dashboard v1).
//
// Velozzy small-order consolidation: sub-kilo customer orders are batched
// into one consolidated shipment and the 1 kg minimum applies to the
// CONSOLIDATED batch total, not per customer order (Danny's team sorts at
// Lince). The claim window against the carrier is 15 days from when the
// batch becomes available for pickup at Lince.
//
// Endpoints:
//   GET ?view=batches  -> { batches, total }
//   GET ?view=claims   -> { claims }
//
// Admin-gated exactly like the other admin-* functions: a real session
// cookie (getSessionEmail) whose email is on ADMIN_EMAILS (isAdmin).
// Never a client-claimed identity.

import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { PROVIDER_REGISTRY } from "./_shipping/registry.js";
import { listShipments } from "./_shipping/store.js";

// Business constants (Velozzy Freight Services Agreement, 2026-09-25).
const MIN_BATCH_KG = 1;      // 1 kg minimum, on the consolidated batch total.
const CLAIM_WINDOW_DAYS = 15; // Claim window, counted from Lince availability.
const DAY_MS = 86400000;

// Anchor statuses the claims clock can hang on. The normalized shipping
// vocabulary (scripts/lib/shipping-status.js) has no "lince_available"
// event on main yet, so this is read defensively: prefer an explicit
// `linceAvailableAt` field on the shipment record, else the first
// "lince_available" statusHistory event, else null ("no-data").
// See NOTES.md for the decision the statuses module still owes us.
const LINCE_AVAILABLE_STATUS = "lince_available";

const json = (statusCode, headers, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

/** Defensive label: the registry row may not exist yet (courier module). */
function providerLabel(provider) {
  return PROVIDER_REGISTRY?.[provider]?.label || provider || "—";
}

/**
 * The Lince-availability anchor for the claim clock.
 * Prefers shipment.linceAvailableAt, falls back to the first
 * "lince_available" event in statusHistory, else null.
 */
function resolveLinceAvailableAt(shipment) {
  if (shipment?.linceAvailableAt) return shipment.linceAvailableAt;
  const history = shipment?.statusHistory || [];
  const event = history.find((e) => e?.status === LINCE_AVAILABLE_STATUS);
  return event?.at || null;
}

function toFiniteKg(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Batch weight = Σ over orderIds of (actuals.pesoRealKg ?? weightEstimatedKg).
 * actuals.pesoRealKg is the planned actual-scale-weight field (not on main
 * yet — the statuses/express module records it at weigh-in); until it
 * exists everything resolves to the estimate and weightSource reads
 * "all-estimated". Missing orders / missing weights contribute nothing
 * and count toward the "none" sources.
 */
async function buildBatch(shipment, ordersStore) {
  const orderIds = Array.isArray(shipment?.orderIds) ? shipment.orderIds : [];
  const orderCount = orderIds.length;

  const orders = orderCount
    ? await Promise.all(orderIds.map((id) => ordersStore.get(String(id), { type: "json" }).catch(() => null)))
    : [];

  let totalKg = 0;
  let actualCount = 0;
  let estimatedCount = 0;
  for (const order of orders) {
    const actualKg = toFiniteKg(order?.actuals?.pesoRealKg);
    const estimatedKg = toFiniteKg(order?.weightEstimatedKg);
    if (actualKg != null) {
      totalKg += actualKg;
      actualCount += 1;
    } else if (estimatedKg != null) {
      totalKg += estimatedKg;
      estimatedCount += 1;
    }
  }
  totalKg = round2(totalKg);

  const hasWeightData = actualCount > 0 || estimatedCount > 0;
  const weightSource = !hasWeightData
    ? "none"
    : actualCount > 0 && estimatedCount === 0
      ? "all-actual"
      : estimatedCount > 0 && actualCount === 0
        ? "all-estimated"
        : "mixed";

  // null when there is no weight data to judge against the minimum —
  // explicitly including batches with zero orders.
  const meetsMinimum = orderCount === 0 || !hasWeightData ? null : totalKg >= MIN_BATCH_KG;

  return {
    shipmentId: shipment?.shipmentId ?? null,
    provider: shipment?.provider ?? null,
    providerLabel: providerLabel(shipment?.provider),
    orderIds,
    orderCount,
    totalWeightKg: totalKg,
    weightSource,
    minKg: MIN_BATCH_KG,
    meetsMinimum,
    status: shipment?.status ?? null,
    createdAt: shipment?.createdAt ?? null,
    linceAvailableAt: resolveLinceAvailableAt(shipment),
  };
}

/**
 * daysRemaining = ceil((deadlineAt - now) / day). With ceil, a deadline
 * minutes past still reads 0 (warning, not expired); only more than a
 * full day past the deadline reads negative (expired). That is the ops
 * definition of "expired": the deadline day is over, not started.
 */
function buildClaim(batch) {
  const linceAvailableAt = batch.linceAvailableAt;
  if (!linceAvailableAt) {
    return {
      shipmentId: batch.shipmentId,
      providerLabel: batch.providerLabel,
      orderIds: batch.orderIds,
      orderCount: batch.orderCount,
      linceAvailableAt: null,
      deadlineAt: null,
      daysRemaining: null,
      state: "no-data",
    };
  }
  const deadlineAt = new Date(new Date(linceAvailableAt).getTime() + CLAIM_WINDOW_DAYS * DAY_MS).toISOString();
  const daysRemaining = Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / DAY_MS);
  const state = daysRemaining < 0 ? "expired" : daysRemaining <= 3 ? "warning" : "ok";
  return {
    shipmentId: batch.shipmentId,
    providerLabel: batch.providerLabel,
    orderIds: batch.orderIds,
    orderCount: batch.orderCount,
    linceAvailableAt,
    deadlineAt,
    daysRemaining,
    state,
  };
}

const CLAIM_STATE_ORDER = { expired: 0, warning: 1, ok: 2, "no-data": 3 };

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

  const view = (event.queryStringParameters?.view || "batches").trim().toLowerCase();
  if (view !== "batches" && view !== "claims") {
    return json(400, headers, { error: `Vista desconocida: "${view}". Usa view=batches o view=claims.` });
  }

  try {
    const shipments = await listShipments();
    const ordersStore = getStore("orders");
    const batches = [];
    for (const shipment of shipments) {
      batches.push(await buildBatch(shipment, ordersStore));
    }
    // Newest first — re-sorted here so the contract holds even if the
    // store's own ordering ever changes. createdAt is an ISO string.
    batches.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    if (view === "batches") {
      return json(200, headers, { batches, total: batches.length });
    }

    // Claims: cancelled shipments never reached Lince, so there is no
    // claim window for them — they are noise in this view.
    // Sort: expired first, then warning, then ok, then no-data. Within a
    // state, the most urgent (fewest days remaining) leads; no-data rows
    // sort newest first. The sort key stays internal — the response shape
    // is exactly the contract.
    const claims = batches
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({ claim: buildClaim(b), createdAt: b.createdAt }))
      .sort((x, y) => {
        const byState = CLAIM_STATE_ORDER[x.claim.state] - CLAIM_STATE_ORDER[y.claim.state];
        if (byState !== 0) return byState;
        if (x.claim.state === "no-data") {
          return String(y.createdAt || "").localeCompare(String(x.createdAt || ""));
        }
        return (x.claim.daysRemaining ?? 0) - (y.claim.daysRemaining ?? 0);
      })
      .map(({ claim }) => claim);
    return json(200, headers, { claims });
  } catch (error) {
    return json(500, headers, { error: error.message });
  }
}
