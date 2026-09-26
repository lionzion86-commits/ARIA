/* ============================================================
   ADAPTER #3 — LADY A COURIER, IN MANUAL MODE

   Lady A is the quality/secondary carrier in Aria's multi-courier
   architecture while the primary slot is settled. She has no shipping
   API, so this adapter runs the same paper process as the AVI and
   Velozzy ones: Aria generates a manifest, a human at Lady A picks the
   boxes up against it, and an operator records pickup, customs, reparto
   and delivery from the ops dashboard.

   Same contract, same honesty rules: every caller — routing, tracking,
   the admin queue, the customer's status page — talks to this object
   exactly as it will talk to a courier with a real REST API. The manual
   part is sealed inside these five methods.

   WHAT IS HONEST ABOUT THIS ADAPTER
     - track() does not invent movement. It reports what an operator
       actually recorded, and nothing else.
     - quote() is a contract-rate calculation, not a live rate. It is
       marked `estimated: true` so nothing downstream can mistake it for
       a number Lady A returned. $8.90/kg is the agreed month-one rate.
     - confirmDelivery() reports the ops confirmation, with who
       confirmed it. There is no proof-of-delivery image because there
       is no API to fetch one from; `proof` says how it was confirmed
       instead of pretending to a photo that does not exist.

   COST. Lady A's month-one rate is read only here, server side,
   overridable by env var so the real figure need not be committed —
   same discipline as _courier-economics.js. The customer pays the flat
   published rate in weight-data.js — a different, larger number, decided
   at checkout and unaffected by which courier carries the box. These two
   must never meet in a browser.
   ============================================================ */

import { randomBytes } from "node:crypto";
import { assertNormalized } from "./provider.js";

export const LADYA_KEY = "ladya";

/* Agreed month-one rate: $8.90/kg. Env var exists so the real figure
   never has to be committed. */
export const LADYA_COST_PER_KG = Number(process.env.LADYA_COST_PER_KG) || 8.90;
export const LADYA_TRANSIT_DAYS_MIN = 3;
export const LADYA_TRANSIT_DAYS_MAX = 10;

/** LADYA-YYMMDD-XXXXXX. Ours, not hers: Lady A issues no numbers. */
export function makeLadyaTracking(now = new Date()) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `LADYA-${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * @param {object} deps
 * @param {(trackingNumber: string) => Promise<object|null>} deps.readShipmentByTracking
 *        How this adapter reads back what ops recorded. Injected rather
 *        than imported so the adapter can be tested without Blobs, and so
 *        a future API-backed adapter can drop the dependency entirely.
 */
export function createLadyaAdapter({ readShipmentByTracking } = {}) {
  const read = typeof readShipmentByTracking === "function"
    ? readShipmentByTracking
    : async () => null;

  return {
    key: LADYA_KEY,
    label: "Lady A Courier",
    /* `manual` is what the ops dashboard reads to decide whether to show
       the status buttons. A provider with an API would set false and the
       same dashboard would poll instead — no new UI. */
    mode: "manual",
    capabilities: { labels: false, livePolling: false, proofOfDelivery: false },

    /**
     * Internal cost and the transit window. No network call: Lady A's
     * rate is a contract number, not an endpoint.
     */
    async quote(shipment) {
      const kg = Number(shipment?.weightKg);
      if (!Number.isFinite(kg) || kg <= 0) {
        throw new Error("No se puede cotizar un envío sin peso real.");
      }
      return {
        costUsd: Math.round(kg * LADYA_COST_PER_KG * 100) / 100,
        transitDaysMin: LADYA_TRANSIT_DAYS_MIN,
        transitDaysMax: LADYA_TRANSIT_DAYS_MAX,
        estimated: true,
      };
    },

    /**
     * There is no API call to make, so "creating" a shipment with
     * Lady A means minting the identifiers the manifest will carry.
     * The box becomes real to Lady A when a human picks it up against
     * that manifest, which is what the first ops status update records.
     */
    async createShipment(shipment) {
      const trackingNumber = makeLadyaTracking();
      return {
        providerShipmentId: `ladya-manual-${trackingNumber}`,
        trackingNumber,
        // No API, no label endpoint. Null rather than a dead URL: the ops
        // dashboard renders the manifest row instead.
        labelUrl: null,
        manifestRequired: true,
      };
    },

    /**
     * What ops recorded, mapped through the normalized vocabulary. The
     * assert is not ceremony: it is the thing that guarantees a courier's
     * own wording can never reach a shopper, and it would fire here the
     * day someone types a raw Lady A string into the dashboard.
     */
    async track(trackingNumber) {
      const shipment = await read(String(trackingNumber || ""));
      if (!shipment) return { status: null, events: [], found: false };
      const events = (shipment.statusHistory || []).map((e) => ({
        status: assertNormalized(e.status, LADYA_KEY),
        at: e.at,
        note: e.note || "",
        // The operator's own words, kept for debugging and never rendered
        // to a customer — see the tracking endpoint, which drops it.
        raw: e.raw || null,
      }));
      return {
        status: shipment.status ? assertNormalized(shipment.status, LADYA_KEY) : null,
        events,
        found: true,
      };
    },

    async confirmDelivery(trackingNumber) {
      const shipment = await read(String(trackingNumber || ""));
      if (!shipment || shipment.status !== "delivered") {
        return { deliveredAt: null, proof: null };
      }
      const last = [...(shipment.statusHistory || [])].reverse()
        .find((e) => e.status === "delivered");
      return {
        deliveredAt: last?.at || null,
        /* No photo, because there is no API to fetch one from. What we do
           have is who confirmed it and when, which is a real audit trail
           and does not pretend to be more than it is. */
        proof: last ? { kind: "ops_confirmation", by: last.by || "ops", at: last.at } : null,
      };
    },

    /**
     * Cancellable right up until the box is on its way. Once Lady A has
     * it in transit there is nothing this system can do to recall it,
     * and returning true would be a lie the ops team acts on.
     */
    async cancel(providerShipmentId) {
      const trackingNumber = String(providerShipmentId || "").replace(/^ladya-manual-/, "");
      const shipment = await read(trackingNumber);
      if (!shipment) return false;
      return ["purchased_usa", "retailer_shipped", "miami_received", "created"].includes(shipment.status);
    },
  };
}
