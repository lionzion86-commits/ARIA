/* ============================================================
   THE ShippingProvider SEAM

   THE PROBLEM THIS EXISTS FOR, stated plainly: today one hundred per cent
   of Aria's orders leave through one mom-and-pop courier. Launch month
   projects one to five thousand orders. A single courier is not a
   supplier, it is a single point of failure, and the cost of discovering
   that at volume is the whole business.

   So: a seam, built before it is needed. A courier is an object with five
   methods. Nothing outside this folder knows which courier is carrying a
   parcel — not checkout, not the order record, not the tracking view.
   Adding the second courier is a new file next to avi-adapter.js and a
   row in the registry. That is the entire contract, and it is the point.

   ------------------------------------------------------------
   THE FIVE OPERATIONS

     quote(shipment)             -> { costUsd, transitDaysMin, transitDaysMax }
     createShipment(shipment)    -> { providerShipmentId, trackingNumber, labelUrl? }
     track(trackingNumber)       -> { status, events: [{ status, at, raw?, note? }] }
     confirmDelivery(tracking)   -> { deliveredAt, proof? }
     cancel(providerShipmentId)  -> boolean

   `status` and every `events[].status` are NORMALIZED — the vocabulary in
   scripts/lib/shipping-status.js and nothing else. An adapter that lets a
   provider's own string through has failed its one job; `assertNormalized`
   below is what stops it, loudly, at the seam rather than on a customer's
   screen.

   `costUsd` is INTERNAL. It is what the courier charges Aria. It is not
   what the customer pays, it is never returned by a public endpoint, and
   it is never rendered anywhere a shopper can reach. What the customer
   pays is the flat published rate in weight-data.js, decided long before
   any of this runs and unaffected by which courier ends up carrying the
   box. There is no rate shopping at checkout, by design: a price that
   moves with our supplier negotiations is not a price a shopper can
   trust.
   ------------------------------------------------------------
   ============================================================ */

import { isShippingStatus } from "../../../scripts/lib/shipping-status.js";
import { MAX_FRAGRANCES_PER_SHIPMENT } from "../../../scripts/lib/beauty-weight.js";

/** The five operations, by name. A provider implements all of them. */
export const PROVIDER_OPERATIONS = [
  "quote",
  "createShipment",
  "track",
  "confirmDelivery",
  "cancel",
];

/**
 * Peru's de minimis: a shipment over this declared value stops being a
 * personal import and starts being a formal one, per box per person. The
 * split happens in ops, not here — this file's job is to refuse to create
 * a shipment that would quietly cross it.
 */
export const DE_MINIMIS_USD = 200;

/** How many store orders one box may consolidate. */
export const MAX_ORDERS_PER_SHIPMENT = 5;

/* Restrictions that travel with the parcel. Ops and the manifest both
   read these; the courier needs to know before the box is on a plane. */
export const RESTRICTION_FRAGRANCE_LIMIT = "fragrance_limit";
export const RESTRICTION_OVER_DE_MINIMIS = "over_de_minimis";

/**
 * Does this object implement the provider contract?
 *
 * Called when the registry loads an adapter, so a half-written courier
 * fails at startup with its own name in the message rather than at 2am
 * with a TypeError inside a status poll.
 */
export function assertImplementsProvider(adapter, key) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error(`Courier "${key}": el adaptador no es un objeto.`);
  }
  const missing = PROVIDER_OPERATIONS.filter((op) => typeof adapter[op] !== "function");
  if (missing.length) {
    throw new Error(`Courier "${key}": faltan operaciones del contrato ShippingProvider: ${missing.join(", ")}.`);
  }
  return true;
}

/**
 * Guard at the seam: nothing leaves an adapter carrying a provider's own
 * status string. Throwing here is deliberate — a normalized status is not
 * a nicety, it is the thing that lets a courier be swapped without the
 * customer noticing, so a violation is a build error, not a warning.
 */
export function assertNormalized(status, key) {
  if (!isShippingStatus(status)) {
    throw new Error(
      `Courier "${key}" devolvió el estado "${status}", que no pertenece al vocabulario normalizado. ` +
      `Mapea en el adaptador, nunca dejes pasar la jerga del courier.`,
    );
  }
  return status;
}

function cleanText(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : "";
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * The shipment model, validated.
 *
 * Returns { shipment, errors }. Errors are Spanish, because an operator
 * reads them. Anything wrong enough to make a shipment unsafe to send is
 * an error rather than a silent correction: this is the object a real box
 * on a real plane is built from.
 *
 * WEIGHT IS ACTUAL SCALE WEIGHT. Not volumetric, not billable, not the
 * greater of the two — the courier contract bills the scale reading and
 * the dimensional helpers were deleted from this codebase for that
 * reason. A shipment carrying a volumetric figure would over-charge us
 * against our own contract and mis-state the parcel to customs.
 */
export function normalizeShipment(input = {}) {
  const errors = [];

  const orderIds = (Array.isArray(input.orderIds) ? input.orderIds : [])
    .map((id) => cleanText(id, 40))
    .filter(Boolean);
  if (!orderIds.length) errors.push("Un envío necesita al menos un pedido.");
  if (orderIds.length > MAX_ORDERS_PER_SHIPMENT) {
    errors.push(`Un envío consolida como máximo ${MAX_ORDERS_PER_SHIPMENT} pedidos (recibidos ${orderIds.length}).`);
  }

  const r = input.recipient || {};
  const recipient = {
    name: cleanText(r.name, 120),
    address: cleanText(r.address, 300),
    city: cleanText(r.city, 80),
    phone: cleanText(r.phone, 40),
    idNumber: cleanText(r.idNumber ?? r.dni, 40),
    /* WHO IS ACTUALLY AT THE DOOR (2026-09-21). A buyer may nominate
       someone else to receive the parcel — a parent, a porter, an
       office. Both fields travel to the courier on the manifest, and
       both are optional HERE because plenty of parcels are received by
       the buyer; when a shopper does nominate someone, orders-create.js
       refuses the order without a name and a document, because the
       courier checks ID at handoff and cannot hand a box to a name it
       cannot verify. */
    relationship: cleanText(r.relationship, 80),
    deliveryInstructions: cleanText(r.deliveryInstructions, 400),
  };
  /* relationship and deliveryInstructions are deliberately NOT in this
     list: a shipment to the buyer themselves has neither, and demanding
     them would block every ordinary box. */
  for (const [field, label] of [
    ["name", "nombre"], ["address", "dirección"], ["city", "ciudad"],
    ["phone", "teléfono"], ["idNumber", "documento de identidad"],
  ]) {
    if (!recipient[field]) errors.push(`Falta el ${label} del destinatario.`);
  }

  const weightKg = Number(input.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    errors.push("El peso real (kg) es obligatorio y debe ser mayor que cero.");
  }

  const declaredValueUsd = Number(input.declaredValueUsd);
  if (!Number.isFinite(declaredValueUsd) || declaredValueUsd <= 0) {
    errors.push("El valor declarado (USD) es obligatorio y debe ser mayor que cero.");
  }

  /* RESTRICTIONS ARE COMPUTED, NOT ACCEPTED. A caller may pass extra
     flags, but the two that carry legal weight are derived here from the
     numbers themselves, so no caller can talk a box past them. */
  const passed = (Array.isArray(input.restrictedFlags) ? input.restrictedFlags : [])
    .map((f) => cleanText(f, 40)).filter(Boolean);
  const restrictedFlags = new Set(passed);

  if (Number.isFinite(declaredValueUsd) && declaredValueUsd > DE_MINIMIS_USD) {
    restrictedFlags.add(RESTRICTION_OVER_DE_MINIMIS);
    errors.push(
      `El valor declarado ($${round2(declaredValueUsd)}) supera el de minimis de $${DE_MINIMIS_USD} por caja por persona. ` +
      `Divide el envío antes de crearlo.`,
    );
  }

  const fragranceCount = Number(input.fragranceCount) || 0;
  if (fragranceCount > MAX_FRAGRANCES_PER_SHIPMENT) {
    restrictedFlags.add(RESTRICTION_FRAGRANCE_LIMIT);
    errors.push(
      `${fragranceCount} fragancias en un envío; el máximo es ${MAX_FRAGRANCES_PER_SHIPMENT}. Divide el envío.`,
    );
  } else if (fragranceCount > 0) {
    // Under the limit is not a problem, but the courier still has to be
    // told there is perfume in the box.
    restrictedFlags.add(RESTRICTION_FRAGRANCE_LIMIT);
  }

  const shipment = {
    shipmentId: cleanText(input.shipmentId, 40) || null,
    orderIds,
    recipient,
    weightKg: Number.isFinite(weightKg) ? round2(weightKg) : null,
    declaredValueUsd: Number.isFinite(declaredValueUsd) ? round2(declaredValueUsd) : null,
    fragranceCount,
    restrictedFlags: [...restrictedFlags],
    notes: cleanText(input.notes, 500),
  };

  return { shipment, errors };
}
