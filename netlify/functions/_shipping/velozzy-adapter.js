/* ============================================================
   ADAPTER #2 — VELOZZY GLOBAL SERVICES (AMEX COURIER), IN MANUAL MODE

   Velozzy has no shipping API, so this adapter runs the same paper
   process as the AVI one: Aria generates a manifest, a human at Velozzy
   picks the boxes up against it, and an operator records pickup, flight,
   arrival at Lince and pickup confirmation from the ops dashboard.

   Same contract, same honesty rules as the AVI adapter: every caller —
   routing, tracking, the admin queue, the customer's status page —
   talks to this object exactly as it will talk to a courier with a
   real REST API. The manual part is sealed inside these five methods.

   WHAT IS HONEST ABOUT THIS ADAPTER
     - track() does not invent movement. It reports what an operator
       actually recorded, and nothing else.
     - quote() is a contract-rate calculation, not a live rate. It is
       marked `estimated: true` so nothing downstream can mistake it for
       a number Velozzy returned. The rate is $7.00/kg of actual scale
       weight rounded to the nearest 0.1 kg — there is no volumetric
       weight and no perfume/aerosol surcharge, per the draft agreement.
     - confirmDelivery() reports the ops confirmation, with who
       confirmed it. There is no proof-of-delivery image because there
       is no API to fetch one from; `proof` says how it was confirmed
       instead of pretending to a photo that does not exist.

   COST. Velozzy's contract rate is read only here, server side,
   overridable by env var so the real figure need not be committed —
   same discipline as _courier-economics.js. The customer pays the flat
   published rate in weight-data.js — a different, larger number, decided
   at checkout and unaffected by which courier carries the box. These two
   must never meet in a browser.

   TERMS THAT MATTER TO OPS (draft Freight Services Agreement, unsigned
   as of 2026-09-25 — do not quote these to anyone outside ops):
     - 6 cargo flights/week, Miami–Lima; 3–10 day transit target.
     - Responsibility ends at pickup availability at Av. José Leal 1436,
       Lince, Lima; the client collects within 48h. Last-mile is Aria's.
     - Minimum 1 kg charge per guía — sub-kilo customer orders batch
       into one consolidated shipment and the minimum applies to the
       batch total, sorted by Danny's team at Lince.
     - 15-day written claim window. Item-level country of manufacture
       required on every shipment.
     - Rates renegotiable after 30 days (not locked).
   ============================================================ */

import { randomBytes } from "node:crypto";
import { assertNormalized } from "./provider.js";

export const VELOZZY_KEY = "velozzy";

/* Draft contract rate: $7.00 per kg of actual scale weight, nearest
   0.1 kg, no volumetric, no perfume/aerosol surcharge. Env var exists
   so the real figure never has to be committed. */
export const VELOZZY_COST_PER_KG = Number(process.env.VELOZZY_COST_PER_KG) || 7.0;
export const VELOZZY_TRANSIT_DAYS_MIN = 3;
export const VELOZZY_TRANSIT_DAYS_MAX = 10;

/** VELOZZY-YYMMDD-XXXXXX. Ours, not theirs: Velozzy issues no numbers. */
export function makeVelozzyTracking(now = new Date()) {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `VELOZZY-${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * @param {object} deps
 * @param {(trackingNumber: string) => Promise<object|null>} deps.readShipmentByTracking
 *        How this adapter reads back what ops recorded. Injected rather
 *        than imported so the adapter can be tested without Blobs, and so
 *        a future API-backed adapter can drop the dependency entirely.
 */
export function createVelozzyAdapter({ readShipmentByTracking } = {}) {
  const read = typeof readShipmentByTracking === "function"
    ? readShipmentByTracking
    : async () => null;

  return {
    key: VELOZZY_KEY,
    label: "Velozzy Global Services (Amex Courier)",
    /* `manual` is what the ops dashboard reads to decide whether to show
       the status buttons. A provider with an API would set false and the
       same dashboard would poll instead — no new UI. */
    mode: "manual",
    capabilities: { labels: false, livePolling: false, proofOfDelivery: false },

    /**
     * Internal cost and the transit window. No network call: Velozzy's
     * rate is a contract number, not an endpoint. Weight is billed at
     * actual scale weight rounded to the nearest 0.1 kg, exactly as the
     * draft agreement prices it — rounding down a 0.37 kg parcel would
     * undercharge our own ledger.
     */
    async quote(shipment) {
      const kg = Number(shipment?.weightKg);
      if (!Number.isFinite(kg) || kg <= 0) {
        throw new Error("No se puede cotizar un envío sin peso real.");
      }
      const billedKg = Math.round(kg * 10) / 10;
      return {
        costUsd: Math.round(billedKg * VELOZZY_COST_PER_KG * 100) / 100,
        transitDaysMin: VELOZZY_TRANSIT_DAYS_MIN,
        transitDaysMax: VELOZZY_TRANSIT_DAYS_MAX,
        estimated: true,
      };
    },

    /**
     * There is no API call to make, so "creating" a shipment with
     * Velozzy means minting the identifiers the manifest will carry.
     * The box becomes real to Velozzy when a human picks it up against
     * that manifest, which is what the first ops status update records.
     */
    async createShipment(shipment) {
      const trackingNumber = makeVelozzyTracking();
      return {
        providerShipmentId: `velozzy-manual-${trackingNumber}`,
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
     * day someone types a raw Velozzy string into the dashboard.
     */
    async track(trackingNumber) {
      const shipment = await read(String(trackingNumber || ""));
      if (!shipment) return { status: null, events: [], found: false };
      const events = (shipment.statusHistory || []).map((e) => ({
        status: assertNormalized(e.status, VELOZZY_KEY),
        at: e.at,
        note: e.note || "",
        // The operator's own words, kept for debugging and never rendered
        // to a customer — see the tracking endpoint, which drops it.
        raw: e.raw || null,
      }));
      return {
        status: shipment.status ? assertNormalized(shipment.status, VELOZZY_KEY) : null,
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
     * Cancellable right up until the box is on its way. Once Velozzy has
     * it in transit there is nothing this system can do to recall it,
     * and returning true would be a lie the ops team acts on.
     */
    async cancel(providerShipmentId) {
      const trackingNumber = String(providerShipmentId || "").replace(/^velozzy-manual-/, "");
      const shipment = await read(trackingNumber);
      if (!shipment) return false;
      return ["purchased_usa", "retailer_shipped", "miami_received", "created"].includes(shipment.status);
    },
  };
}
