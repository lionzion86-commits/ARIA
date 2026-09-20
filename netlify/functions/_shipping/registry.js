/* ============================================================
   THE COURIER REGISTRY, AND WHY IT REFUSES RATHER THAN GUESSES

   One row per courier. A row is identity and policy — what it is called,
   what part it plays, and how to build its adapter. The adapter itself
   knows how to ship; this file knows which adapter to reach for.

   ADDING THE SECOND COURIER
     1. Write netlify/functions/_shipping/<name>-adapter.js exporting a
        factory that returns the five ShippingProvider operations.
     2. Add a row below with its factory and its role.
     3. Enable it in the admin Envíos panel.
   Nothing in checkout, in the order record, or in any tracking view
   changes. That is the acceptance test for this whole design, and
   test-shipping asserts it by walking those files for courier names.

   ------------------------------------------------------------
   FAIL CLOSED, ALWAYS

   The dangerous failure here is not "no courier available" — that is
   visible and someone fixes it in a minute. The dangerous failure is a
   box quietly routed to a courier an operator had just switched off,
   which nobody notices until a customer asks where their parcel is. So
   selectProvider() throws NoProviderError rather than falling back to
   anything, and disabling the last enabled courier stops shipment
   creation outright, with a message that says what to do.
   ------------------------------------------------------------

   PHASES. Phase 1 is what is built: route to the primary, with a manual
   per-shipment override. Phase 2 adds a second adapter and automatic
   overflow; Phase 3 adds SLA-based failover. Neither is built here and
   neither is painted shut — `role`, the reason string and the override
   path are the three places they attach.
   ============================================================ */

import { createAviAdapter, AVI_KEY } from "./avi-adapter.js";
import { assertImplementsProvider } from "./provider.js";

/**
 * `role` records Danny's call on what a courier IS to Aria:
 *   primary    — the shipper we build volume on.
 *   secondary  — overflow and the test week. A distribution employee,
 *                not a distribution partner.
 * It is policy, not plumbing: Phase 2's automatic overflow reads it. In
 * Phase 1 it only shapes the routing reason, which is exactly where an
 * operator needs to see it.
 */
export const PROVIDER_REGISTRY = {
  [AVI_KEY]: {
    key: AVI_KEY,
    label: "AVI Courier",
    role: "secondary",
    mode: "manual",
    factory: createAviAdapter,
    note: "Mom-and-pop, sin API: opera por manifiesto y confirmación manual de ops.",
  },
  /* THE PRIMARY IS NOT WRITTEN YET. Danny is courting a second shipper;
     the follow-up is due Mon 2026-09-21. When that lands it becomes a row
     here with role: "primary" and its own adapter file, and Phase 1
     routing starts choosing it with no other change. Leaving the slot
     described rather than stubbed is deliberate: a stub row would show up
     in the admin list as a courier that cannot ship. */
};

/** Defaults for a site that has never opened the Envíos panel. */
export const DEFAULT_SHIPPING_SETTINGS = {
  enabled: { [AVI_KEY]: true },
  primary: AVI_KEY,
};

/** Thrown when there is no courier to route to. Carries its own message. */
export class NoProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = "NoProviderError";
    this.code = "NO_PROVIDER_ENABLED";
  }
}

export function normalizeShippingSettings(raw) {
  const enabled = {};
  for (const key of Object.keys(PROVIDER_REGISTRY)) {
    const fromRaw = raw?.enabled?.[key];
    enabled[key] = fromRaw === undefined
      ? Boolean(DEFAULT_SHIPPING_SETTINGS.enabled[key])
      : Boolean(fromRaw);
  }
  const primary = PROVIDER_REGISTRY[raw?.primary] ? raw.primary : DEFAULT_SHIPPING_SETTINGS.primary;
  return { enabled, primary };
}

/** Every courier the admin panel lists, with its live enabled state. */
export function providerRows(settings) {
  const s = normalizeShippingSettings(settings);
  return Object.values(PROVIDER_REGISTRY).map((p) => ({
    key: p.key,
    label: p.label,
    role: p.role,
    mode: p.mode,
    note: p.note,
    enabled: Boolean(s.enabled[p.key]),
    isPrimary: s.primary === p.key,
  }));
}

export function enabledProviderKeys(settings) {
  const s = normalizeShippingSettings(settings);
  return Object.keys(PROVIDER_REGISTRY).filter((k) => s.enabled[k]);
}

/**
 * Which courier carries this shipment, and the sentence explaining why.
 *
 * The reason is stored on the shipment as `routingReason` and shown in
 * the ops queue. It exists because "why did this box go to that courier"
 * is the first question asked when something goes wrong, and
 * reconstructing it from settings that have since changed is guesswork.
 *
 * @throws {NoProviderError} when nothing is enabled, or when an override
 *         names a courier that is disabled or does not exist.
 */
export function selectProvider(settings, { override } = {}) {
  const s = normalizeShippingSettings(settings);
  const enabled = enabledProviderKeys(s);

  if (!enabled.length) {
    throw new NoProviderError(
      "No hay ningún courier activo. No se puede crear un envío hasta que actives uno en Envíos → Couriers. " +
      "Ningún pedido se enruta a un courier desactivado.",
    );
  }

  if (override) {
    if (!PROVIDER_REGISTRY[override]) {
      throw new NoProviderError(`El courier "${override}" no existe en el registro.`);
    }
    if (!s.enabled[override]) {
      throw new NoProviderError(
        `El courier "${PROVIDER_REGISTRY[override].label}" está desactivado. Actívalo antes de asignarle envíos.`,
      );
    }
    return {
      key: override,
      reason: `Override manual del operador → ${PROVIDER_REGISTRY[override].label}.`,
    };
  }

  /* PHASE 1: THE PRIMARY, AND ONLY THE PRIMARY. Phase 2's overflow and
     Phase 3's SLA failover both attach here — they choose differently
     among `enabled` and write a different reason. Nothing else moves. */
  if (s.enabled[s.primary]) {
    const row = PROVIDER_REGISTRY[s.primary];
    /* An honest reason when the only courier we have is the one Danny
       classed as overflow. It is not a warning the system can act on, but
       it is the single most important fact about fulfilment right now and
       the ops queue should say it out loud rather than reading as though
       a primary had been chosen on merit. */
    const reason = row.role === "primary"
      ? `Courier primario configurado → ${row.label}.`
      : `${row.label} es el único courier activo y está marcado como ${row.role}: ` +
        `lleva el 100% de los envíos hasta que se configure un primario.`;
    return { key: s.primary, reason };
  }

  // The configured primary was switched off but something else is on.
  // Phase 1 does not auto-route to a non-primary, because "quietly used a
  // different courier" is the misroute this system exists to prevent.
  throw new NoProviderError(
    `El courier primario (${PROVIDER_REGISTRY[s.primary]?.label || s.primary}) está desactivado. ` +
    `Actívalo, o elige otro courier como primario, o asigna el envío manualmente.`,
  );
}

/**
 * Build a courier's adapter, checked against the contract.
 *
 * `deps` is how an adapter gets at anything outside itself — AVI needs to
 * read back what ops recorded, an API-backed courier would need none of
 * it. Validated on every construction so a broken adapter announces
 * itself with its own name.
 */
export function buildProvider(key, deps = {}) {
  const row = PROVIDER_REGISTRY[key];
  if (!row) throw new NoProviderError(`El courier "${key}" no existe en el registro.`);
  const adapter = row.factory(deps);
  assertImplementsProvider(adapter, key);
  return adapter;
}
