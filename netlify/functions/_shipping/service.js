/* ============================================================
   SHIPMENT LOGIC, WITH NO STORAGE IN IT

   Everything here is a pure function of its arguments. Blobs lives next
   door in store.js, for one reason: this is the part that decides whether
   a parcel may move from one state to another, what an operator hands the
   courier, and what a customer is allowed to see — and all three deserve
   tests that run in a plain node process with no @netlify/blobs and no
   network. Same split as ondemand-policy.js, same reason.
   ============================================================ */

import {
  canTransition, isShippingStatus, statusLabelEs, statusNoteEs, isTerminalStatus,
} from "../../../scripts/lib/shipping-status.js";

/* THE CUSTOMER'S REFERENCE IS OURS, NOT THE COURIER'S.

   AVI's tracking numbers begin "AVI-". Handing one to a shopper would put
   a courier's name on the customer's screen and in their email, which is
   the exact thing this whole seam exists to prevent — and it would make
   changing couriers a customer-visible event forever after. So a shipment
   carries two identifiers: `shipmentId`, which is Aria's and is public,
   and `trackingNumber`, which is the courier's and stays in ops. */
export function makeShipmentId(dateKey, rand) {
  return `ARIA-SHIP-${String(dateKey).replace(/-/g, "").slice(2)}-${String(rand).toUpperCase()}`;
}

function round2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

/**
 * Record a status update.
 *
 * Returns { shipment, changed, rejected }. An event that cannot move the
 * shipment forward is still WRITTEN TO HISTORY and simply does not become
 * the current status — couriers re-send old events routinely, and the
 * choice is between a customer watching a delivered parcel walk backwards
 * to "in transit" or an ops trail that shows exactly what arrived and
 * when. The second is strictly better and costs nothing.
 */
export function applyStatusUpdate(shipment, update = {}) {
  const status = String(update.status || "");
  if (!isShippingStatus(status)) {
    return { shipment, changed: false, rejected: `Estado desconocido: "${status}".` };
  }

  const at = update.at || new Date().toISOString();
  const event = {
    status,
    at,
    by: String(update.by || "ops").slice(0, 120),
    note: String(update.note || "").slice(0, 300),
    // The courier's own wording, if there was any. Kept for debugging,
    // never rendered — publicTrackingView() drops it.
    raw: update.raw ? String(update.raw).slice(0, 200) : null,
  };

  const history = [...(shipment.statusHistory || []), event];
  const allowed = canTransition(shipment.status, status);

  return {
    shipment: {
      ...shipment,
      status: allowed ? status : shipment.status,
      statusHistory: history,
      updatedAt: at,
      ...(allowed && status === "delivered" ? { deliveredAt: at } : {}),
      ...(allowed && status === "cancelled" ? { cancelledAt: at } : {}),
    },
    changed: allowed,
    rejected: allowed
      ? null
      : isTerminalStatus(shipment.status)
        ? `El envío ya está en estado final ("${shipment.status}"); el evento quedó registrado en el historial.`
        : `No se puede pasar de "${shipment.status}" a "${status}"; el evento quedó registrado en el historial.`,
  };
}

/**
 * What a shopper is allowed to see.
 *
 * An allowlist, not a blocklist. Everything not named here — the courier,
 * its tracking number, our internal cost, the operator's name, the raw
 * provider strings — is absent because it was never copied in, rather
 * than present-but-deleted. A field added to the shipment record next
 * month cannot leak through this by accident.
 */
export function publicTrackingView(shipment) {
  if (!shipment) return null;
  return {
    shipmentId: shipment.shipmentId,
    status: shipment.status,
    label: statusLabelEs(shipment.status),
    note: statusNoteEs(shipment.status),
    orderIds: Array.isArray(shipment.orderIds) ? shipment.orderIds : [],
    deliveredAt: shipment.deliveredAt || null,
    etaDaysMin: shipment.transitDaysMin ?? null,
    etaDaysMax: shipment.transitDaysMax ?? null,
    history: (shipment.statusHistory || [])
      // Only the events that actually moved the parcel forward, in order.
      // A re-sent duplicate is real data for ops and noise for a shopper.
      .filter((e, i, all) => all.findIndex((x) => x.status === e.status) === i)
      .map((e) => ({ status: e.status, label: statusLabelEs(e.status), at: e.at })),
  };
}

/* ------------------------------------------------------------
   THE MANIFEST — what AVI is actually handed

   A courier with no API still needs to know, per box: who it goes to,
   where, how heavy, what it is worth, and whether there is anything in it
   that customs treats differently. That is this table. It is also the
   pickup receipt, so the columns are the ones a person reads down a page,
   not the ones a database would pick.
   ------------------------------------------------------------ */
export const MANIFEST_COLUMNS = [
  "Envío", "Tracking", "Pedidos", "Destinatario", "Documento", "Teléfono",
  "Dirección", "Ciudad", "Peso real (kg)", "Valor declarado (USD)",
  "Restricciones", "Estado", "Notas",
];

export function manifestRow(s) {
  return [
    s.shipmentId || "",
    s.trackingNumber || "",
    (s.orderIds || []).join(" | "),
    s.recipient?.name || "",
    s.recipient?.idNumber || "",
    s.recipient?.phone || "",
    s.recipient?.address || "",
    s.recipient?.city || "",
    s.weightKg == null ? "" : String(s.weightKg),
    s.declaredValueUsd == null ? "" : String(s.declaredValueUsd),
    (s.restrictedFlags || []).join(" | "),
    statusLabelEs(s.status),
    s.notes || "",
  ];
}

/* THE MANIFEST CARRIES NO COST COLUMN. Deliberate: this sheet is handed
   to the courier, and what Aria charges its customer is none of the
   courier's business, while what the courier charges Aria is already on
   their own invoice. Margin lives in the admin rollup, behind a login. */
export function manifestCsv(shipments) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [MANIFEST_COLUMNS.map(esc).join(",")];
  for (const s of shipments) lines.push(manifestRow(s).map(esc).join(","));
  // CRLF and a UTF-8 BOM: this opens in Excel on an ops laptop, and
  // without the BOM every "ó" in a Lima address arrives mangled.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------
   MARGIN VISIBILITY

   Per courier, per day: how many boxes, how heavy, what they cost us and
   what we charged. Admin-only, and the numbers are reported as what they
   are — `chargedFreightUsd` is null when the shipment was not built from
   orders that recorded a freight charge, and a null is shown as unknown
   rather than counted as zero. A margin dashboard that silently treats
   missing revenue as no revenue is worse than no dashboard.
   ------------------------------------------------------------ */
export function dailyRollup(shipments, { dayKeyOf } = {}) {
  const dayOf = dayKeyOf || ((s) => String(s.createdAt || "").slice(0, 10));
  const buckets = new Map();

  for (const s of shipments) {
    if (s.status === "cancelled") continue;
    const day = dayOf(s);
    const key = `${day}::${s.provider || "sin-courier"}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        day, provider: s.provider || null, shipments: 0, weightKg: 0,
        internalCostUsd: 0, chargedFreightUsd: 0, chargedKnown: 0, marginUsd: null,
      });
    }
    const b = buckets.get(key);
    b.shipments += 1;
    b.weightKg = round2(b.weightKg + (Number(s.weightKg) || 0));
    b.internalCostUsd = round2(b.internalCostUsd + (Number(s.internalCostUsd) || 0));
    /* Number(null) is 0 and Number.isFinite(0) is true, so a plain
       isFinite check counts "we never recorded what we charged" as "we
       charged nothing" — which is exactly the silent zero this rollup
       is written to avoid. Unknown has to be tested for first. */
    const charged = s.chargedFreightUsd;
    const chargedKnown = charged !== null && charged !== undefined && charged !== ""
      && Number.isFinite(Number(charged));
    if (chargedKnown) {
      b.chargedFreightUsd = round2(b.chargedFreightUsd + Number(charged));
      b.chargedKnown += 1;
    }
  }

  return [...buckets.values()]
    .map((b) => ({
      ...b,
      // Only a margin when we know both sides for every box in the bucket.
      marginUsd: b.chargedKnown === b.shipments ? round2(b.chargedFreightUsd - b.internalCostUsd) : null,
      chargedComplete: b.chargedKnown === b.shipments,
    }))
    .sort((a, b) => (a.day === b.day ? String(a.provider).localeCompare(String(b.provider)) : b.day.localeCompare(a.day)));
}
