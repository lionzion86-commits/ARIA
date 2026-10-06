/* ============================================================
   WHAT ARIA MAY KNOW ABOUT THE PERSON SHE IS TALKING TO.

   A salesperson who remembers you is worth a great deal; one who
   makes things up about you is worth less than a stranger. These
   three lookups are built so the second is impossible.

   THE IDENTITY COMES FROM THE SESSION COOKIE, NEVER FROM AN
   ARGUMENT. The brief specifies get_order_history(user_id, limit),
   and that signature cannot be built safely: the model would be
   choosing whose orders to read. It mis-hears, it infers, and a
   shopper can simply say "my customer number is 4471" — any of which
   would hand one person another person's purchase history through a
   voice line. So the tools take no user id at all. The server already
   knows who is on the call, because the browser sent the cookie, and
   that is the only answer it will accept.

   EVERY FIELD IS COPIED OUT BY NAME. An order record carries the
   customer's name, their address, what we charged, what it cost us
   and the margin on it. None of that is built one field at a time
   into the replies below, which is the point: a spread of the record
   would leak all of it into a conversation the moment someone asked
   a question nobody anticipated. Adding a field here has to be a
   decision, not an accident.

   WHAT WE CANNOT SAY, WE DO NOT SAY. The brief asks for a delivery
   status — "delivered" or "in_transit" — and asks Aria to follow up
   on anything delivered in the last fourteen days. The order record
   has no shipment id on it. Its own comment says shipping statuses
   live on the shipment rather than the order, and nothing links the
   two, so whether a parcel arrived is not knowable from here. These
   replies carry the fulfilment and payment states that ARE recorded,
   plus `delivery_known: false`, and the instructions tell her to ask
   how an order went rather than to assert that it arrived. Wiring a
   real delivery status means storing the shipment id at order
   creation — a change on the payment path, and a separate one.
   ============================================================ */
/* NOTHING IS IMPORTED HERE. The session lookup and the two blob
   stores arrive as `ctx` from the caller, because every path to them
   goes through @netlify/blobs, which exists only in the deployed
   runtime — a top-level import of it makes this file unloadable
   anywhere else, tests included. Injected, this module is pure: it
   can be driven against a stub session and a stub store, which is the
   only way to prove it never reads the wrong person's orders. */

/* Enough orders to find a member's recent ones without reading the
   whole store. Keys are ARIA-YYYYMMDD-XXXXXX, so sorting them
   descending is sorting by date, and the newest slice is where a
   given person's latest purchases will be if they have any.

   This is a bounded scan, not an index. At this shop's volume it is
   the right trade; past a few thousand orders it stops being one, and
   the fix then is a per-member index written at order creation. */
const ORDER_SCAN_LIMIT = 300;

/** The first name only — "María Elena Quispe" is "María" out loud. */
function firstNameOf(name) {
  const s = String(name || "").trim();
  if (!s) return null;
  return s.split(/\s+/)[0];
}

/* An opaque handle, so the model has something to refer to without
   the email ever entering the conversation's context. Nothing is
   looked up by it — it exists because the brief's shape includes an
   id, and this is the version of that which cannot leak anything. */
function opaqueId(email) {
  let h = 0;
  const s = String(email || "");
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return "m" + h.toString(36);
}

/**
 * Who is on the call, or nobody.
 *
 * `{ user_id: null }` for a guest is a normal answer, not a failure:
 * most shoppers are not logged in and must never be asked to be.
 */
export async function getCurrentUser(ctx) {
  const email = await ctx.email();
  if (!email) return { user_id: null, logged_in: false };
  let profile = null;
  try { profile = await ctx.users().get(email, { type: "json" }); }
  catch { profile = null; }
  return {
    user_id: opaqueId(email),
    logged_in: true,
    first_name: firstNameOf(profile && profile.name),
    member_since: profile && profile.createdAt
      ? String(new Date(profile.createdAt).getFullYear())
      : null,
    /* "fundador" is the approved state in founders-pick.js; everyone
       else is "pending" or rejected, and neither is a club member. */
    key_club_member: !!profile && profile.founderStatus === "fundador",
  };
}

/** Days between then and now, floored, or null if the date is unusable. */
export function daysAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/**
 * This member's recent orders, newest first.
 *
 * Returns `{ orders: [] }` for a guest and for a member who has never
 * bought anything. Both are ordinary, and the note tells Aria to greet
 * them without inventing a history.
 */
export async function getOrderHistory(ctx, limit = 3, now = Date.now()) {
  const email = await ctx.email();
  if (!email) {
    return { orders: [], logged_in: false,
             note: "No está logueado. Salúdalo normal y NO le pidas que inicie sesión." };
  }
  const want = Math.min(Math.max(Math.round(Number(limit) || 3), 1), 5);
  let records = [];
  try {
    const orders = ctx.orders();
    const { blobs } = await orders.list();
    const keys = blobs
      .map((b) => b.key)
      .filter((k) => k && k.startsWith("ARIA-"))
      .sort()
      .reverse()
      .slice(0, ORDER_SCAN_LIMIT);
    const fetched = await Promise.all(keys.map((k) => orders.get(k, { type: "json" }).catch(() => null)));
    records = fetched.filter((o) => o && o.buyerEmail === email);
  } catch {
    return { orders: [], unavailable: "no pude revisar sus pedidos ahorita" };
  }
  records.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

  const out = records.slice(0, want).map((o) => ({
    order_id: o.orderId,
    date: String(o.createdAt || "").slice(0, 10),
    days_ago: daysAgo(o.createdAt, now),
    /* NAME AND BRAND ONLY. Not the price we charged, not the weight,
       not the dutiable base, and above all not o.customer or
       o.shipping. */
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 6).map((it) => ({
      name: String((it && (it.title || it.name)) || "").slice(0, 80),
      brand: (it && it.brand) || null,
    })).filter((it) => it.name),
    /* The states that are actually written down. */
    status: o.status || "pending_payment",
    paid: o.paymentStatus === "paid",
    /* Said plainly so it cannot be read as "not delivered". */
    delivery_known: false,
  }));

  return {
    orders: out,
    logged_in: true,
    note: out.length
      ? "No sabemos si llegó: no hay estado de entrega en estos datos. Pregunta cómo le fue, " +
        "NUNCA afirmes que le llegó ni que está en camino."
      : "Nunca ha comprado. Salúdalo normal y NO inventes un historial.",
  };
}

/**
 * What this member actually buys, counted off their own orders.
 *
 * Derived, never declared: if the orders are not there the lists are
 * empty, and Aria has nothing to claim.
 */
export async function getUserPreferences(ctx, now = Date.now()) {
  const hist = await getOrderHistory(ctx, 5, now);
  if (!hist.logged_in) return { logged_in: false, brands_they_buy: [], note: hist.note };
  const brands = new Map();
  for (const o of hist.orders || []) {
    for (const it of o.items || []) {
      if (!it.brand) continue;
      const k = String(it.brand).trim();
      if (k) brands.set(k, (brands.get(k) || 0) + 1);
    }
  }
  const ranked = [...brands.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
  return {
    logged_in: true,
    brands_they_buy: ranked.slice(0, 5),
    order_count: (hist.orders || []).length,
    /* Sizes are not recorded on an order line today, so there is
       nothing honest to return. Null rather than a guess. */
    sizes: null,
    preferred_categories: null,
    note: ranked.length
      ? "Puedes mencionar estas marcas porque las compró de verdad."
      : "No hay suficiente historial. No inventes gustos.",
  };
}
