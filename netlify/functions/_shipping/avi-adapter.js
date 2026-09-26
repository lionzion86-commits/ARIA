/* ============================================================
   ADAPTER #1 — AVI COURIER, IN MANUAL MODE

   AVI is a mom-and-pop operation with no shipping API, and waiting for
   one is not a plan. So this adapter implements the full ShippingProvider
   contract over a PAPER PROCESS: Aria generates a manifest, a human at
   AVI picks the boxes up against it, and an operator records pickup,
   customs, reparto and delivery from the ops dashboard.

   THAT IS NOT A STUB, AND THE DISTINCTION MATTERS. Every caller —
   routing, tracking, the admin queue, the customer's status page — talks
   to this object exactly as it will talk to a courier with a real REST
   API. The manual part is sealed inside these five methods. The day AVI
   ships an API, or the day Danny's own courier operation stands up, the
   internals of one file change and nothing else in the codebase does.
   That is the whole reason the seam was built before it was needed.

   WHAT IS HONEST ABOUT THIS ADAPTER
     - track() does not invent movement. It reports what an operator
       actually recorded, and nothing else. A parcel with no update since
       pickup says exactly that.
     - quote() is a contract-rate calculation, not a live rate. It is
       marked `estimated: true` so nothing downstream can mistake it for a
       number AVI returned.
     - confirmDelivery() reports the ops confirmation, with who confirmed
       it. There is no proof-of-delivery image because there is no API to
       fetch one from; `proof` says how it was confirmed instead of
       pretending to a photo that does not exist.

   COST. AVI's contract rate lives in _courier-economics.js and is read
   only here, server side. The customer pays the flat published rate in
   weight-data.js — a different, larger number, decided at checkout and
   unaffected by which courier carries the box. These two must never meet
   in a browser.
   ============================================================ */

import { randomBytes } from "node:crypto";
import { COST_PER_KG } from "../_courier-economics.js";
import { assertNormalized } from "./provider.js";

export const AVI_KEY = "avi";

/* Miami consolidation to a Lima doorstep, door to door, as AVI actually
   runs it. A range rather than a number because customs is the variable
   and pretending otherwise is how a delivery promise becomes a
   complaint. */
export const AVI_TRANSIT_DAYS_MIN = 7;
export const AVI_TRANSIT_DAYS_MAX = 14;

/** AVI-YYMMDD-XXXXXX. Ours, not theirs: AVI issues no numbers. */
export function makeAviTracking(now = new Date()) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `AVI-${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * @param {object} deps
 * @param {(trackingNumber: string) => Promise<object|null>} deps.readShipmentByTracking
 *        How this adapter reads back what ops recorded. Injected rather
 *        than imported so the adapter can be tested without Blobs, and so
 *        a future API-backed adapter can drop the dependency entirely.
 */
export function createAviAdapter({ readShipmentByTracking } = {}) {
  const read = typeof readShipmentByTracking === "function"
    ? readShipmentByTracking
    : async () => null;

  return {
    key: AVI_KEY,
    label: "AVI Courier",
    /* `manual` is what the ops dashboard reads to decide whether to show
       the status buttons. A provider with an API would set false and the
       same dashboard would poll instead — no new UI. */
    mode: "manual",
    capabilities: { labels: false, livePolling: false, proofOfDelivery: false },

    /**
     * Internal cost and the transit window. No network call: AVI's rate
     * is a contract number, not an endpoint.
     */
    async quote(shipment) {
      const kg = Number(shipment?.weightKg);
      if (!Number.isFinite(kg) || kg <= 0) {
        throw new Error("No se puede cotizar un envío sin peso real.");
      }
      return {
        costUsd: Math.round(kg * COST_PER_KG * 100) / 100,
        transitDaysMin: AVI_TRANSIT_DAYS_MIN,
        transitDaysMax: AVI_TRANSIT_DAYS_MAX,
        estimated: true,
      };
    },

    /**
     * There is no API call to make, so "creating" a shipment with AVI
     * means minting the identifiers the manifest will carry. The box
     * becomes real to AVI when a human picks it up against that manifest,
     * which is what the first ops status update records.
     */
    async createShipment(shipment) {
      const trackingNumber = makeAviTracking();
      return {
        providerShipmentId: `avi-manual-${trackingNumber}`,
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
     * day someone types a raw AVI string into the dashboard.
     */
    async track(trackingNumber) {
      const shipment = await read(String(trackingNumber || ""));
      if (!shipment) return { status: null, events: [], found: false };
      const events = (shipment.statusHistory || []).map((e) => ({
        status: assertNormalized(e.status, AVI_KEY),
        at: e.at,
        note: e.note || "",
        // The operator's own words, kept for debugging and never rendered
        // to a customer — see the tracking endpoint, which drops it.
        raw: e.raw || null,
      }));
      return {
        status: shipment.status ? assertNormalized(shipment.status, AVI_KEY) : null,
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
     * Cancellable right up until the box is on its way. Once AVI has it
     * in transit there is nothing this system can do to recall it, and
     * returning true would be a lie the ops team acts on.
     */
    async cancel(providerShipmentId) {
      const trackingNumber = String(providerShipmentId || "").replace(/^avi-manual-/, "");
      const shipment = await read(trackingNumber);
      if (!shipment) return false;
      return ["purchased_usa", "retailer_shipped", "miami_received", "created"].includes(shipment.status);
    },
  };
}
