/* ============================================================
   MI CUENTA — what a signed-in member sees about themselves (#443,
   member-account-area brief, 2026-10-22). SERVER ONLY, AND PURE.

   Every store arrives injected (`stores.orders`, `.shipments`, `.wallet`,
   `.carts`, `.users`, `.packs`), the same split as _member.js and
   _dni-docs.js: @netlify/blobs exists only in the deployed runtime, and
   the rules below need tests that run against stubs, above all the one
   that proves an account never reads another person's orders.

   THE IDENTITY IS THE SESSION'S EMAIL, PASSED IN BY THE HANDLER. Nothing
   here takes an email from a request body or a query string.

   EVERY FIELD IS COPIED OUT BY NAME, as in _member.js. An order record
   carries our cost, our margin, the courier's quote and the operator's
   notes; none of that is built into a view below, and a field added to
   the record later cannot ride along.

   ORDERS ATTACH BY EMAIL. An order placed while signed in carries
   buyerEmail; a guest order carries only customer.email. Danny's rule
   is that both belong to the account with that email. A guest order is
   matched on a typed email nobody verified, so its view leaves out the
   delivery address and the recipient: the account shows what was
   bought and where it is, not where it is going.

   STATUS IS ARIA'S, NEVER THE MECHANICS. Seven words (Procesando,
   Comprado, En tránsito, En aduanas, En reparto, Entregado, Cancelado),
   and each state is a message from Aria that answers three things:
   where it is, what happens next, and whether she has to do anything
   (Danny's addendum, c.6356561175). One text, so the same words can go
   to the timeline here and to WhatsApp later.
   ============================================================ */

export const ORDER_SCAN_LIMIT = 600;

export const STAGES = ["processing", "purchased", "in_transit", "in_customs", "out_for_delivery", "delivered"];
export const STAGE_LABEL = {
  processing: "Procesando",
  purchased: "Comprado",
  in_transit: "En tránsito",
  in_customs: "En aduanas",
  out_for_delivery: "En reparto",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

/* Shipment statuses (scripts/lib/shipping-status.js) onto the seven. */
const SHIPMENT_STAGE = {
  purchased_usa: "purchased",
  retailer_shipped: "purchased",
  miami_received: "purchased",
  created: "purchased",
  in_transit: "in_transit",
  in_customs: "in_customs",
  lince_available: "out_for_delivery",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  cancelled: "cancelled",
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));

/* ---------------- the wallet rules (Danny, c.6354385327 / c.6355472638) ---------------- */

export const KEY_CLUB_RATE = 0.05;
export const FREIGHT_OVERAGE_USD_PER_KG = 13;

/** Merchandise only: product prices x quantity. Never taxes, never freight. */
export function merchandiseSubtotalUsd(items) {
  let total = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const price = num(it && it.priceUsd);
    if (!(price > 0)) continue;
    const qty = Math.max(1, Math.round(num(it.qty) || 1));
    total += price * qty;
  }
  return round2(total);
}

/** Key Club credit: 5% of the merchandise subtotal, proportional, to the cent. S/ 37 earns S/ 1.85. */
export function keyClubCreditPen(merchandisePen) {
  const m = num(merchandisePen);
  return m > 0 ? round2(m * KEY_CLUB_RATE) : 0;
}

/** Freight overage: the kilos we over-estimated, at the customer rate of $13/kg exact. 1.4 kg is $18.20. */
export function freightOverageCreditUsd(kgOverEstimated) {
  const kg = num(kgOverEstimated);
  return kg > 0 ? round2(kg * FREIGHT_OVERAGE_USD_PER_KG) : 0;
}

export const WALLET_RULES = [
  "$5 por cada $100 en productos con Key Club: el 5% exacto de lo que pagas en productos, sin contar impuestos ni flete.",
  "Si tu paquete pesa menos de lo que estimamos, te devolvemos la diferencia a $13 por kilo, exacto.",
  "Las devoluciones y cualquier error nuestro vuelven como saldo al instante.",
  "Tu saldo se descuenta solo en tu próxima compra, y puedes usar una parte.",
];

/** One balance and the full ledger. Renders at S/ 0.00 too: the wallet never hides. */
export function walletView(wallet) {
  const txns = Array.isArray(wallet && wallet.txns) ? wallet.txns : [];
  return {
    balancePen: round2((wallet && wallet.balancePen) || 0),
    ledger: txns.map((t) => ({
      date: str(t.ts, 40),
      kind: t.kind === "debit" ? "debit" : "credit",
      amountPen: round2(t.amountPen || 0),
      reason: str(t.reason, 140),
      orderId: t.orderId ? str(t.orderId, 40) : null,
      balanceAfterPen: num(t.balanceAfterPen),
    })),
    rules: WALLET_RULES,
  };
}

/* ---------------- whose order is it ---------------- */

const lc = (s) => String(s || "").trim().toLowerCase();

/** "account" when placed signed in, "email" when a guest typed this email, else null. */
export function orderBelongsTo(order, email) {
  const e = lc(email);
  if (!order || !e) return null;
  if (lc(order.buyerEmail) === e) return "account";
  if (!order.buyerEmail && lc(order.customer && order.customer.email) === e) return "email";
  return null;
}

/* ---------------- status as a message from Aria ---------------- */

function etaLine(shipment) {
  const min = num(shipment && shipment.transitDaysMin);
  const max = num(shipment && shipment.transitDaysMax);
  if (!(min > 0) && !(max > 0)) return "";
  if (min > 0 && max > 0 && min !== max) return ` Calculamos entre ${min} y ${max} días.`;
  return ` Calculamos unos ${max > 0 ? max : min} días.`;
}

function refundState(order, credits) {
  const refundedPen = num(order.amountRefundedPen);
  const creditPen = round2(credits.reduce((s, t) => s + (Number(t.amountPen) || 0), 0));
  return {
    refundedToCardPen: refundedPen > 0 ? round2(refundedPen) : 0,
    creditedAsSaldoPen: creditPen > 0 ? creditPen : 0,
  };
}

const money = (pen) => "S/ " + Number(pen || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The stage, Aria's message for it, and the refund state when cancelled.
 * `credits` are the wallet credits that name this order.
 */
export function orderStatus(order, shipment = null, credits = []) {
  const paid = order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded";
  const refunded = order.paymentStatus === "refunded";
  const unpaidClosed = ["payment_expired", "payment_not_started"].includes(order.status);
  const shipStatus = shipment && shipment.status;

  let stage;
  let message;
  if (order.status === "cancelled" || shipStatus === "cancelled" || refunded || unpaidClosed) {
    stage = "cancelled";
    const r = refundState(order, credits);
    const paidSomething = refunded || paid || r.refundedToCardPen > 0 || r.creditedAsSaldoPen > 0;
    if (!paidSomething) {
      message = "Este pedido no se completó porque el pago no se confirmó, así que no se te cobró nada. Tus productos siguen en tu carrito por si quieres intentarlo de nuevo.";
    } else {
      const parts = [];
      if (r.refundedToCardPen > 0) parts.push(`te devolvimos ${money(r.refundedToCardPen)} a tu tarjeta`);
      if (r.creditedAsSaldoPen > 0) parts.push(`te devolvimos ${money(r.creditedAsSaldoPen)} como saldo Aria, listo para tu próxima compra`);
      message = parts.length
        ? `Cancelamos este pedido y ${parts.join(", y ")}. No tienes que hacer nada.`
        : "Cancelamos este pedido. Estamos procesando tu devolución y te avisamos aquí apenas esté hecha. No tienes que hacer nada.";
    }
    return { stage, label: STAGE_LABEL[stage], message, refund: refundState(order, credits) };
  }

  if (!paid) {
    stage = "processing";
    message = "Recibimos tu pedido y estamos esperando la confirmación de tu pago. Apenas llegue, compramos tus productos en Estados Unidos. Si ya pagaste, no tienes que hacer nada.";
  } else if (!shipStatus || shipStatus === "exception" && !lastForward(shipment)) {
    stage = "processing";
    message = "Tu pago está confirmado. Ahora estamos comprando tus productos en la tienda de Estados Unidos y te avisamos aquí apenas la compra esté hecha. No tienes que hacer nada.";
  } else {
    const effective = shipStatus === "exception" ? lastForward(shipment) : shipStatus;
    stage = SHIPMENT_STAGE[effective] || "processing";
    message = {
      purchased_usa: "Ya compramos tus productos en Estados Unidos. La tienda los va a enviar a nuestro almacén en Miami y te avisamos aquí cuando lleguen. No tienes que hacer nada.",
      retailer_shipped: "La tienda ya envió tus productos a nuestro almacén en Miami. Cuando lleguen, los preparamos para el vuelo a Lima. No tienes que hacer nada.",
      miami_received: "Tu pedido ya está con nosotros en Miami. Lo estamos preparando para que vuele a Lima en el próximo envío, y en cuanto despegue te avisamos aquí. No tienes que hacer nada.",
      created: "Tu pedido ya está con nosotros en Miami, listo para el próximo vuelo a Lima. En cuanto despegue te avisamos aquí. No tienes que hacer nada.",
      in_transit: "Tu pedido ya está volando de Miami a Lima." + etaLine(shipment) + " Al llegar pasa por el trámite normal de aduana. No tienes que hacer nada.",
      in_customs: "Tu pedido ya está en Lima, en el trámite normal de aduana. Los impuestos ya los pagaste al comprar, así que no hay nada más que pagar. Apenas salga, coordinamos la entrega.",
      lince_available: "Tu pedido ya está en Lima y listo para recoger en Av. José Leal 1436, Lince. Te lo tenemos guardado para cuando vengas.",
      out_for_delivery: "Tu pedido sale hoy hacia tu dirección. Si no vas a estar, avisa a quien lo vaya a recibir. No hay nada más que pagar.",
      delivered: "Tu pedido llegó. Gracias por comprar con Aria. Si algo no está como esperabas, escríbenos y lo resolvemos.",
    }[effective] || "Estamos trabajando en tu pedido y te avisamos aquí apenas avance. No tienes que hacer nada.";
    if (shipStatus === "exception") {
      message = "Hubo un inconveniente con tu envío y ya lo estamos revisando. Te escribimos aquí con la nueva fecha apenas la tengamos. No tienes que hacer nada por ahora.";
    }
  }
  return { stage, label: STAGE_LABEL[stage], message, refund: null };
}

function lastForward(shipment) {
  const hist = Array.isArray(shipment && shipment.statusHistory) ? shipment.statusHistory : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const s = hist[i] && hist[i].status;
    if (s && s !== "exception" && SHIPMENT_STAGE[s]) return s;
  }
  return null;
}

/** The vertical progress line: one step per stage, done / current / ahead. */
export function timeline(stage) {
  if (stage === "cancelled") return [];
  const at = STAGES.indexOf(stage);
  return STAGES.map((s, i) => ({ stage: s, label: STAGE_LABEL[s], state: i < at ? "done" : i === at ? (s === "delivered" ? "done" : "current") : "ahead" }));
}

/* ---------------- one order, as the member may see it ---------------- */

function itemView(it) {
  const qty = Math.max(1, Math.round(num(it && it.qty) || 1));
  const image = typeof (it && it.image) === "string" && /^https?:\/\//i.test(it.image) ? it.image : null;
  return {
    title: str(it && (it.title || it.name), 160),
    brand: it && it.brand ? str(it.brand, 60) : null,
    size: it && (it.selectedSize || it.size) ? str(it.selectedSize || it.size, 30) : null,
    /* The colourway picked on the product page (#443 variants). */
    color: it && it.colorway ? str(it.colorway, 80) : null,
    /* Caja abierta / Reacondicionado / Usado certificado, as orders-create stored it. */
    condition: it && it.condition ? str(it.condition, 30) : null,
    qty,
    image,
  };
}

/* One line per Aria stage, dated by the latest event that reached it:
   three warehouse events are one "Comprado" to the customer. */
function historyByStage(events) {
  const out = [];
  for (const e of Array.isArray(events) ? events : []) {
    const stage = e && SHIPMENT_STAGE[e.status];
    if (!stage) continue;
    const prev = out.find((h) => h.stage === stage);
    if (prev) prev.at = str(e.at, 40);
    else out.push({ stage, label: STAGE_LABEL[stage], at: str(e.at, 40) });
  }
  return out;
}

export function orderView(order, { shipment = null, credits = [], via = "account" } = {}) {
  const status = orderStatus(order, shipment, credits);
  const view = {
    orderId: str(order.orderId, 40),
    createdAt: str(order.createdAt, 40),
    stage: status.stage,
    label: status.label,
    message: status.message,
    timeline: timeline(status.stage),
    refund: status.refund,
    items: (Array.isArray(order.items) ? order.items : []).map(itemView).filter((it) => it.title),
    totals: {
      totalPen: num(order.orderTotalPen),
      saldoPen: num(order.walletAppliedPen) > 0 ? round2(order.walletAppliedPen) : 0,
      cardPen: num(order.pricePenCharged),
    },
    /* The tracking spot: Aria's own reference and the status history as
       soon as a shipment exists. Never the courier's name or number
       (_shipping/service.js publicTrackingView is the same allowlist).
       The live tracking view drops into this object later. */
    tracking: shipment ? {
      guia: str(shipment.shipmentId, 40),
      etaDaysMin: num(shipment.transitDaysMin),
      etaDaysMax: num(shipment.transitDaysMax),
      deliveredAt: shipment.deliveredAt ? str(shipment.deliveredAt, 40) : null,
      history: historyByStage(shipment.statusHistory),
    } : null,
    via,
  };
  /* Only an order placed from this account shows where it is going. */
  if (via === "account") {
    const s = order.shipping || {};
    const r = order.recipient || null;
    view.delivery = {
      address: [str(s.addrLine, 160), str(s.addrDistrict, 80), str(s.destCity || s.addrRegion, 80)].filter(Boolean).join(", ") || null,
      recipient: r ? { name: str(r.name, 120), relationship: str(r.relationship, 80) || null } : null,
    };
  }
  return view;
}

/* ---------------- the stores, read ---------------- */

/* In batches, not hundreds of reads at once: a burst like that is what a
   store throttles, and a throttled read here is a member staring at an
   empty account. */
const READ_BATCH = 40;
async function listJson(store, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += READ_BATCH) {
    out.push(...await Promise.all(keys.slice(i, i + READ_BATCH).map((k) => store.get(k, { type: "json" }).catch(() => null))));
  }
  return out;
}

/** The raw records that belong to this email, newest first, each with how it attached. */
async function collectOrders(stores, email) {
  if (!email) return [];
  const { blobs } = await stores.orders.list();
  const keys = blobs.map((b) => b.key).filter((k) => k && k.startsWith("ARIA-") && !k.startsWith("ARIA-SHIP-"))
    .sort().reverse().slice(0, ORDER_SCAN_LIMIT);
  const mine = [];
  for (const o of await listJson(stores.orders, keys)) {
    const via = orderBelongsTo(o, email);
    if (via) mine.push({ o, via });
  }
  return mine.sort((a, b) => String(b.o.createdAt || "").localeCompare(String(a.o.createdAt || "")));
}

async function shipmentsFor(stores, orderIds) {
  const out = new Map();
  if (!stores.shipments || !orderIds.size) return out;
  const { blobs } = await stores.shipments.list();
  const keys = blobs.map((b) => b.key).filter((k) => k && !k.startsWith("track:"));
  for (const s of await listJson(stores.shipments, keys)) {
    if (!s || !Array.isArray(s.orderIds)) continue;
    for (const id of s.orderIds) {
      if (!orderIds.has(id)) continue;
      const prev = out.get(id);
      if (!prev || String(s.createdAt || "") > String(prev.createdAt || "")) out.set(id, s);
    }
  }
  return out;
}

function viewsOf(mine, shipments, wallet) {
  const txns = Array.isArray(wallet && wallet.txns) ? wallet.txns : [];
  return mine.map(({ o, via }) => orderView(o, {
    shipment: shipments.get(o.orderId) || null,
    credits: txns.filter((t) => t && t.kind === "credit" && t.orderId === o.orderId),
    via,
  }));
}

/** This member's orders, newest first, with their shipments and the credits that name them. */
export async function accountOrders(stores, email, { wallet = null } = {}) {
  const mine = await collectOrders(stores, email);
  if (!mine.length) return [];
  return viewsOf(mine, await shipmentsFor(stores, new Set(mine.map(({ o }) => o.orderId))), wallet);
}

/** Saved cart lines, as the account shows them. Prices stay in USD; the page converts. */
export function cartView(record) {
  const cart = Array.isArray(record && record.cart) ? record.cart : [];
  return cart.map((it) => ({ ...itemView(it), priceUsd: num(it && it.priceUsd) })).filter((it) => it.title);
}

/** "terminado en 912": the account never prints a whole document number. */
export function maskDoc(doc) {
  const d = String(doc || "").replace(/\s+/g, "");
  return d ? d.slice(-3) : "";
}

/** Profile, membership and saved recipients (the alternate recipients this account has sent to). */
export function profileView(user, email, { orders = [], recipients = [] } = {}) {
  const u = user || {};
  const member = u.founderStatus === "fundador";
  const seen = new Map();
  for (const r of recipients) {
    seen.set(String(r.docNumber || ""), { name: str(r.name, 120), docEnd: maskDoc(r.docNumber), relationship: null, savedDocuments: true });
  }
  for (const o of orders) {
    const rec = o && o.recipient;
    if (!rec || !rec.idNumber) continue;
    const k = String(rec.idNumber).replace(/\s+/g, "").toUpperCase();
    const prev = seen.get(k);
    seen.set(k, { name: str(rec.name, 120) || (prev && prev.name) || "", docEnd: maskDoc(k), relationship: str(rec.relationship, 80) || (prev && prev.relationship) || null, savedDocuments: !!(prev && prev.savedDocuments) });
  }
  return {
    email: str(email, 200),
    name: str(u.name, 120) || null,
    phone: str(u.phone, 40) || null,
    memberSince: u.createdAt ? str(u.createdAt, 40) : null,
    keyClub: { member, status: member ? "fundador" : (u.founderStatus || "pending") },
    recipients: [...seen.values()].filter((r) => r.name || r.docEnd),
  };
}

/**
 * The whole account in one read (one round trip on a slow phone line).
 * stores: { orders, shipments, wallet, carts, users, packs }.
 */
export async function accountOverview(stores, email) {
  if (!email) return { signedIn: false };
  const [user, wallet, cartRec, packRec] = await Promise.all([
    stores.users.get(email, { type: "json" }).catch(() => null),
    stores.wallet.get(email, { type: "json" }).catch(() => null),
    stores.carts.get(email, { type: "json" }).catch(() => null),
    stores.packs ? stores.packs.get(email, { type: "json" }).catch(() => null) : null,
  ]);
  /* Each part fails on its own: an unreadable shipments store still shows
     the orders, an unreadable orders store still shows the wallet. */
  const problems = [];
  let mine = [];
  try { mine = await collectOrders(stores, email); } catch (e) { problems.push("orders"); }
  let shipments = new Map();
  try { shipments = await shipmentsFor(stores, new Set(mine.map(({ o }) => o.orderId))); } catch (e) { problems.push("shipments"); }
  const orders = viewsOf(mine, shipments, wallet);
  const recipients = packRec && Array.isArray(packRec.recipients) ? packRec.recipients : [];
  /* Saved recipients come from orders placed FROM this account only. */
  const ownOrders = mine.filter(({ via }) => via === "account").map(({ o }) => o);
  return {
    signedIn: true,
    profile: profileView(user, email, { orders: ownOrders, recipients }),
    orders,
    cart: cartView(cartRec),
    wallet: walletView(wallet),
    documents: recipients.map((r) => ({ docEnd: maskDoc(r.docNumber), name: str(r.name, 120), updatedAt: str(r.updatedAt, 40), ref: r.docNumber })),
    problems,
  };
}
