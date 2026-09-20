/* ============================================================
   NORMALIZED SHIPPING STATUSES — the only vocabulary a customer sees

   WHY THIS IS ITS OWN FILE, AND WHY IT IS THE SMALL ONE.
   Aria is about to have more than one courier. Every courier names its
   states differently — one says "EN RUTA", the next "OUT_FOR_DEL", the
   next a numeric code — and the moment any of that reaches a shopper,
   two things break at once: the page reads like someone else's software,
   and switching couriers becomes a customer-visible event. So there is
   exactly one vocabulary on this site, it is the one below, and every
   adapter maps into it. A provider's own string is kept on the shipment
   record for ops to debug with; it is never rendered.

   This file is deliberately free of anything operational — no costs, no
   provider names, no credentials — because it is the one piece of the
   shipping system the BROWSER is allowed to have. Everything else lives
   under netlify/functions/_shipping/, server side. Mirrored into
   index.html (a plain <script> cannot import); test-shipping asserts the
   two agree.
   ============================================================ */

/* The happy path, in order. `exception` and `cancelled` are off it: they
   can be reached from anywhere and they are where a shipment stops. */
export const SHIPPING_FLOW = [
  "created",
  "in_transit",
  "in_customs",
  "out_for_delivery",
  "delivered",
];

export const SHIPPING_TERMINAL = ["delivered", "cancelled"];

export const SHIPPING_STATUSES = [...SHIPPING_FLOW, "exception", "cancelled"];

/* What the shopper reads. Spanish (Peru), plain, and never a translation
   of a courier's own jargon — these are Aria's words for Aria's states.
   `note` is the one-line explanation the tracking view shows underneath,
   because "En aduana" on its own reads as a problem when it is routine. */
export const SHIPPING_STATUS_ES = {
  created:          { label: "Pedido registrado",   note: "Lo estamos preparando para enviar desde Miami." },
  in_transit:       { label: "En camino",           note: "Tu paquete salió de Miami rumbo a Lima." },
  in_customs:       { label: "En aduana",           note: "Trámite normal de importación. No tienes que hacer nada." },
  out_for_delivery: { label: "En reparto",          note: "Sale hoy hacia tu dirección." },
  delivered:        { label: "Entregado",           note: "Tu pedido llegó. Nada más que pagar." },
  exception:        { label: "Con novedad",         note: "Hubo un inconveniente y ya lo estamos revisando. Te escribimos." },
  cancelled:        { label: "Cancelado",           note: "Este envío fue cancelado." },
};

export function isShippingStatus(value) {
  return SHIPPING_STATUSES.includes(String(value || ""));
}

export function isTerminalStatus(value) {
  return SHIPPING_TERMINAL.includes(String(value || ""));
}

/** Where a status sits on the happy path, or -1 for the two off it. */
export function flowIndex(status) {
  return SHIPPING_FLOW.indexOf(String(status || ""));
}

/**
 * May a shipment move from `from` to `to`?
 *
 * Forward along the flow, or out to exception/cancelled from anywhere
 * that is not already terminal. Never backwards: a courier that re-sends
 * an older event (they all do) must not walk a delivered parcel back to
 * "in transit" on the customer's screen. An out-of-order event is still
 * RECORDED in statusHistory — it is just not allowed to become the
 * current state.
 */
export function canTransition(from, to) {
  if (!isShippingStatus(to)) return false;
  if (from == null || from === "") return to === "created";
  if (!isShippingStatus(from)) return false;
  if (isTerminalStatus(from)) return false;
  if (to === "exception" || to === "cancelled") return true;
  const a = flowIndex(from);
  const b = flowIndex(to);
  // An exception can be worked back onto the path from wherever it is.
  if (a === -1) return b >= 0;
  return b > a;
}

/** The customer-facing label, never a provider's own string. */
export function statusLabelEs(status) {
  return SHIPPING_STATUS_ES[String(status || "")]?.label || "Estado no disponible";
}

export function statusNoteEs(status) {
  return SHIPPING_STATUS_ES[String(status || "")]?.note || "";
}
