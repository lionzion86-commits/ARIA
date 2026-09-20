/* ============================================================
   BLOBS FOR SHIPMENTS — storage, and nothing that makes a decision.

   Two stores:
     "shipments"       shipmentId -> the shipment record
                       "track:<trackingNumber>" -> shipmentId (a pointer,
                       so ops can look a parcel up by the number the
                       courier wrote on it)
     "settings"        "shipping" -> { enabled, primary }
                       (the same store the launch kill switch uses; a
                       different key, so neither can clobber the other)

   NOT ATOMIC, and said out loud for the same reason orders-create.js says
   it: Blobs gives read-modify-write, not compare-and-swap. Two operators
   updating the same shipment in the same second could have one write win.
   At launch volume, with a handful of people in the ops dashboard, that
   is acceptable — and every update appends to statusHistory, so a lost
   write loses an event's position, never the record of it.
   ============================================================ */

import { getStore } from "@netlify/blobs";
import { DEFAULT_SHIPPING_SETTINGS, normalizeShippingSettings } from "./registry.js";

const SHIPMENTS = "shipments";
const SETTINGS = "settings";
const SETTINGS_KEY = "shipping";
const TRACK_PREFIX = "track:";

export async function readShippingSettings() {
  const store = getStore(SETTINGS);
  const raw = (await store.get(SETTINGS_KEY, { type: "json" })) || DEFAULT_SHIPPING_SETTINGS;
  return normalizeShippingSettings(raw);
}

export async function writeShippingSettings(settings) {
  const store = getStore(SETTINGS);
  const clean = normalizeShippingSettings(settings);
  await store.setJSON(SETTINGS_KEY, clean);
  return clean;
}

export async function readShipment(shipmentId) {
  if (!shipmentId) return null;
  const store = getStore(SHIPMENTS);
  return (await store.get(String(shipmentId), { type: "json" })) || null;
}

export async function writeShipment(shipment) {
  const store = getStore(SHIPMENTS);
  await store.setJSON(shipment.shipmentId, shipment);
  // The pointer is rewritten on every save rather than only on create, so
  // a manual provider override (new courier, new tracking number) cannot
  // leave ops looking a parcel up by a number that resolves to nothing.
  if (shipment.trackingNumber) {
    await store.setJSON(TRACK_PREFIX + shipment.trackingNumber, { shipmentId: shipment.shipmentId });
  }
  return shipment;
}

export async function readShipmentByTracking(trackingNumber) {
  if (!trackingNumber) return null;
  const store = getStore(SHIPMENTS);
  const pointer = await store.get(TRACK_PREFIX + String(trackingNumber), { type: "json" });
  if (!pointer?.shipmentId) return null;
  return readShipment(pointer.shipmentId);
}

export async function listShipments() {
  const store = getStore(SHIPMENTS);
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).filter((k) => !k.startsWith(TRACK_PREFIX));
  const all = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));
  return all
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
