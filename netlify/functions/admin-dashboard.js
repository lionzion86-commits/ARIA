/* ============================================================
   THE OPS DASHBOARD ENDPOINT — one door, one auth gate, four views.

     GET ?view=summary   (default) counts, money, health, alerts
     GET ?view=orders    a page of orders, newest first
     GET ?view=payments  gateway payments, with what is unmatched
     GET ?view=couriers  every adapter in the registry, probed live
     GET ?view=ledger&format=csv   the accountant's file

   Gated exactly like every other admin-* function: a real session cookie
   whose email is on ADMIN_EMAILS. Never a client-claimed identity.

   ------------------------------------------------------------
   WHY THIS IS NOT admin-orders-list.js

   That function is kept (the existing margin view in index.html calls
   it), but it cannot back a dashboard, and the reason is worth writing
   down because it is the bug this endpoint exists to not have:

     const { blobs } = await ordersStore.list();
     const orders = await Promise.all(keys.map(k => store.get(k)));

   Netlify Blobs has no batch read, so that is ONE GET PER ORDER, all of
   them, every time the page loads. At the launch cap of 40 orders a day
   it is 1,200 blob reads after a month and 3,600 after a quarter, in a
   function with a 10-second budget — and the whole order history,
   customer PII and all, over a phone's mobile data. It also fails whole:
   Promise.all rejects if a single record is unreadable, so one bad blob
   takes the view down.

   So: keys are listed (one call), sorted, and only the requested page is
   fetched. Reads that fail are dropped from the page and COUNTED in
   `unreadable` rather than throwing — a dashboard that renders 24 of 25
   orders and says so is worth more than one that renders none.

   PAGING IS DAY-GRANULAR, and honestly so. Order ids are
   ARIA-YYYYMMDD-XXXXXX, so sorting keys descending is exact by day and
   arbitrary within a day. Each page is then re-sorted by createdAt, which
   makes it exact inside the page. Two orders from the same day can
   therefore straddle a page boundary in the wrong order. At 40/day with
   a 25-row page that is visible; it is also harmless, and the honest fix
   is a real index, not a cleverer sort.
   ------------------------------------------------------------ */

import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { peruDateKey } from "./_peru-time.js";
import {
  listPayments, needsAttention, paymentStatusFor, AMOUNT_TOLERANCE_PEN,
} from "./_payments.js";
import { providerRows, buildProvider, enabledProviderKeys, PROVIDER_REGISTRY } from "./_shipping/registry.js";
import { readShippingSettings, listShipments, readShipmentByTracking } from "./_shipping/store.js";
import { ledgerRows, ledgerCsv } from "./_ledger.js";

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

export const DEFAULT_PAGE = 25;
export const MAX_PAGE = 100;

/** Order keys, newest day first. The "count:*" keys are daily counters. */
async function orderKeysNewestFirst(store) {
  const { blobs } = await store.list();
  return blobs
    .map((b) => b.key)
    .filter((k) => !k.startsWith("count:"))
    .sort((a, b) => b.localeCompare(a));
}

/**
 * One page of orders. Unreadable records are counted, not thrown.
 */
async function ordersPage(store, keys, { offset = 0, limit = DEFAULT_PAGE } = {}) {
  const slice = keys.slice(offset, offset + limit);
  const settled = await Promise.all(
    slice.map((k) => store.get(k, { type: "json" }).then((v) => v, () => null)),
  );
  const orders = settled.filter(Boolean);
  return {
    orders: orders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    unreadable: slice.length - orders.length,
    offset,
    limit,
    total: keys.length,
    hasMore: offset + slice.length < keys.length,
  };
}

/**
 * Every courier in the registry, probed for real.
 *
 * "Live status" for an adapter with no API is not a ping — AVI has no
 * endpoint to ping. What CAN be established, and is what ops actually
 * needs, is: does the adapter build against the contract, does quote()
 * answer with a number, and does track() return what ops recorded for
 * the most recent parcel it carried. Each is attempted inside its own
 * try, so a broken quote still reports a working track.
 *
 * A provider that throws anywhere is reported `health: "down"`, and the
 * page paints it red. A provider that is switched off is `"disabled"` —
 * a different thing, and not an error.
 *
 * FAILS CLOSED is not asserted here, it is OBSERVED: `createBlocked` is
 * computed from the same enabledProviderKeys() that admin-shipping.js's
 * createShipment calls, so if this says creation is blocked, creation is
 * genuinely refusing right now.
 */
async function courierPanel(shipments) {
  const settings = await readShippingSettings();
  const rows = providerRows(settings);
  const enabled = enabledProviderKeys(settings);

  /* A probe shipment, never written anywhere. One kilo so the returned
     cost is the per-kg contract rate, which is the number ops recognises. */
  const probe = { weightKg: 1 };

  const providers = await Promise.all(rows.map(async (row) => {
    const mine = shipments.filter((s) => s.provider === row.key);
    const latest = mine[0] || null;
    const out = {
      ...row,
      shipmentsTotal: mine.length,
      shipmentsOpen: mine.filter((s) => !["delivered", "cancelled"].includes(s.status)).length,
      health: row.enabled ? "up" : "disabled",
      errors: [],
      lastQuote: null,
      lastTrack: null,
    };

    let adapter;
    try {
      adapter = buildProvider(row.key, { readShipmentByTracking });
      out.capabilities = adapter.capabilities || null;
      out.mode = adapter.mode || row.mode;
    } catch (error) {
      // The adapter does not satisfy the contract, or is not in the
      // registry. Nothing else about it can be trusted.
      out.health = "down";
      out.errors.push(`adapter: ${error.message}`);
      return out;
    }

    try {
      const quote = await adapter.quote(probe);
      out.lastQuote = {
        probeWeightKg: probe.weightKg,
        costUsd: quote.costUsd,
        estimated: Boolean(quote.estimated),
        transitDaysMin: quote.transitDaysMin ?? null,
        transitDaysMax: quote.transitDaysMax ?? null,
        at: new Date().toISOString(),
      };
    } catch (error) {
      out.health = "down";
      out.errors.push(`quote: ${error.message}`);
    }

    if (latest?.trackingNumber) {
      try {
        const track = await adapter.track(latest.trackingNumber);
        out.lastTrack = {
          shipmentId: latest.shipmentId,
          trackingNumber: latest.trackingNumber,
          found: Boolean(track.found),
          status: track.status || null,
          events: (track.events || []).length,
          lastEventAt: track.events?.length ? track.events[track.events.length - 1].at : null,
          at: new Date().toISOString(),
        };
      } catch (error) {
        out.health = "down";
        out.errors.push(`track: ${error.message}`);
      }
    }
    return out;
  }));

  return {
    providers,
    settings,
    /* The standing warning, computed rather than remembered. */
    createBlocked: enabled.length === 0
      ? "No hay ningún courier activo — la creación de envíos está bloqueada. Ningún pedido se enruta a un courier desactivado."
      : null,
    registryCount: Object.keys(PROVIDER_REGISTRY).length,
  };
}

/**
 * The top of the dashboard: what needs a human, and today's money.
 *
 * Totals are over the whole order history, so this reads every order —
 * bounded by SUMMARY_SCAN_MAX so the function cannot be made to time out
 * by its own success. When the cap bites, `scanned` says so and the page
 * prints it; a total that silently covers 500 of 900 orders is the kind
 * of number someone would take to an accountant.
 */
export const SUMMARY_SCAN_MAX = 400;

function summarize(orders, payments) {
  const byId = new Map(orders.map((o) => [o.orderId, o]));
  const money = {
    billedPen: 0, capturedPen: 0, refundedPen: 0,
    freightPen: 0, taxEstimatedPen: 0, taxActualPen: 0, walletAppliedPen: 0,
  };
  /* THREE BUCKETS, NOT TWO. A partially refunded order HAS been paid —
     bucketing it as "sin pagar" would send an operator chasing money
     that already arrived, which is the opposite of useful. And a
     refunded or disputed order is neither paid nor unpaid: it is money
     that came and went, and it needs a human, not a counter. */
  const PAID_STATES = new Set(["paid", "partially_refunded"]);
  const GONE_STATES = new Set(["refunded", "disputed", "lost_dispute"]);
  let unpaid = 0, paid = 0, reversed = 0;

  for (const o of orders) {
    money.billedPen += Number(o.pricePenCharged) || 0;
    money.capturedPen += Number(o.amountCapturedPen) || 0;
    money.refundedPen += Number(o.amountRefundedPen) || 0;
    money.walletAppliedPen += Number(o.walletAppliedPen) || 0;
    money.taxEstimatedPen += Number(o.taxEstimatedPen) || 0;
    money.taxActualPen += Number(o.taxActualPen) || 0;
    const fx = Number(o.fxRateUsed) || 0;
    money.freightPen += fx ? (Number(o.freteChargedUsd) || 0) * fx : 0;
    const ps = o.paymentStatus || "unpaid";
    if (PAID_STATES.has(ps)) paid += 1;
    else if (GONE_STATES.has(ps)) reversed += 1;
    else unpaid += 1;
  }
  for (const k of Object.keys(money)) money[k] = round2(money[k]);

  /* ALERTS. Each one is a sentence an operator can act on, and each is
     derived — nothing here is a stored flag that could go stale. */
  const alerts = [];
  const unmatched = payments.filter((p) => needsAttention(p, byId.get(p.orderId)));
  for (const p of unmatched) {
    alerts.push({
      level: "warn",
      kind: "payment",
      message: `Pago ${p.paymentId}: ${needsAttention(p, byId.get(p.orderId))}.`,
    });
  }
  const awaitingTax = orders.filter((o) => Number(o.taxEstimatedPen) > 0 && !o.taxReconciledAt);
  if (awaitingTax.length) {
    alerts.push({
      level: "info",
      kind: "tax",
      message: `${awaitingTax.length} pedido(s) con impuesto estimado sin conciliar contra SUNAT.`,
    });
  }
  const mismatched = orders.filter((o) => Number(o.amountMismatchPen));
  if (mismatched.length) {
    alerts.push({
      level: "warn",
      kind: "amount",
      message: `${mismatched.length} pedido(s) cobrados por un monto distinto al facturado (tolerancia S/ ${AMOUNT_TOLERANCE_PEN}).`,
    });
  }

  if (reversed) {
    alerts.push({
      level: "warn",
      kind: "reversed",
      message: `${reversed} pedido(s) con el pago revertido (reembolso total o disputa).`,
    });
  }

  return {
    money,
    counts: { orders: orders.length, paid, unpaid, reversed, payments: payments.length },
    alerts,
  };
}

/**
 * Whether a gateway is wired up at all.
 *
 * The Payments view is meaningless without this: an empty payments list
 * means "nobody has paid" if Stripe is connected, and "we cannot know"
 * if it is not. The page shows the difference in words rather than
 * leaving an operator to read an empty table and guess.
 *
 * Only the PRESENCE of the secret is reported. Never its value, never a
 * prefix, never a length.
 */
function gatewayState() {
  const configured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  return {
    provider: "stripe",
    webhookConfigured: configured,
    webhookPath: "/.netlify/functions/stripe-webhook",
    note: configured
      ? "El webhook puede verificar eventos. Un pedido solo dice «pagado» cuando Stripe lo confirmó."
      : "STRIPE_WEBHOOK_SECRET no está configurado: no hay ninguna pasarela conectada, no se ha cobrado ningún pago, y el webhook responde 503 para que Stripe reintente en vez de perder eventos.",
  };
}

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") return json(405, headers, { error: "Method not allowed" });

  const email = await getSessionEmail(event);
  if (!isAdmin(email)) return json(403, headers, { error: "No autorizado" });

  const q = event.queryStringParameters || {};
  const view = String(q.view || "summary");
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(q.limit) || DEFAULT_PAGE));
  const offset = Math.max(0, Number(q.offset) || 0);

  try {
    const ordersStore = getStore("orders");

    if (view === "orders") {
      const keys = await orderKeysNewestFirst(ordersStore);
      const page = await ordersPage(ordersStore, keys, { offset, limit });
      const { payments } = await listPayments({ limit: MAX_PAGE });
      const byOrder = new Map(payments.filter((p) => p.orderId).map((p) => [p.orderId, p]));

      /* COURIER AND TRACKING PER ORDER. A shipment carries orderIds (one
         box can consolidate several orders), so the join is
         shipment -> orders, not the other way round, and one order can
         legitimately appear on more than one shipment if ops re-sent
         part of it. Only the fields the card shows are copied over — the
         shipment's internal cost stays out of this response. */
      const shipments = await listShipments();
      const shipmentsByOrder = {};
      for (const s of shipments) {
        for (const oid of s.orderIds || []) {
          (shipmentsByOrder[oid] ||= []).push({
            shipmentId: s.shipmentId,
            provider: s.provider,
            trackingNumber: s.trackingNumber,
            status: s.status,
            updatedAt: s.updatedAt,
            transitDaysMin: s.transitDaysMin ?? null,
            transitDaysMax: s.transitDaysMax ?? null,
          });
        }
      }

      return json(200, headers, {
        ...page,
        // The matched payment travels with the order so the card can show
        // "cobrado" without the page joining two lists by hand.
        payments: Object.fromEntries(page.orders
          .filter((o) => byOrder.has(o.orderId))
          .map((o) => [o.orderId, byOrder.get(o.orderId)])),
        shipments: Object.fromEntries(page.orders
          .filter((o) => shipmentsByOrder[o.orderId])
          .map((o) => [o.orderId, shipmentsByOrder[o.orderId]])),
      });
    }

    if (view === "payments") {
      const { payments, total } = await listPayments({ limit });
      const keys = await orderKeysNewestFirst(ordersStore);
      /* Only the orders these payments name are fetched, not the whole
         history — a payments view that reads 900 orders to annotate 12
         payments is the same timeout in a different shirt. */
      const wanted = [...new Set(payments.map((p) => p.orderId).filter(Boolean))];
      const fetched = await Promise.all(
        wanted.map((id) => ordersStore.get(id, { type: "json" }).then((v) => v, () => null)),
      );
      const byId = new Map(wanted.map((id, i) => [id, fetched[i]]));
      return json(200, headers, {
        gateway: gatewayState(),
        total,
        orderCount: keys.length,
        payments: payments.map((p) => {
          const order = byId.get(p.orderId) || null;
          return {
            ...p,
            orderExists: Boolean(order),
            orderBilledPen: order ? order.pricePenCharged ?? null : null,
            orderCustomer: order?.customer?.name || order?.customer?.nombre || null,
            attention: needsAttention(p, order),
            orderPaymentStatus: order ? order.paymentStatus || "unpaid" : null,
            derivedPaymentStatus: paymentStatusFor(p),
          };
        }),
      });
    }

    if (view === "couriers") {
      const shipments = await listShipments();
      return json(200, headers, await courierPanel(shipments));
    }

    if (view === "ledger") {
      const keys = await orderKeysNewestFirst(ordersStore);
      const capped = keys.slice(0, SUMMARY_SCAN_MAX);
      const page = await ordersPage(ordersStore, capped, { offset: 0, limit: capped.length });
      const { payments } = await listPayments({ limit: MAX_PAGE });
      const wallets = await readWalletsFor(page.orders);
      const rows = ledgerRows(page.orders, payments, wallets);

      if (String(q.format || "") === "csv") {
        return {
          statusCode: 200,
          headers: {
            ...headers,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="aria-libro-mayor-${peruDateKey()}.csv"`,
          },
          body: ledgerCsv(rows),
        };
      }
      return json(200, headers, {
        rows,
        scanned: page.orders.length,
        total: keys.length,
        truncated: keys.length > capped.length,
        unreadable: page.unreadable,
      });
    }

    // ---- summary (default) --------------------------------------------
    const keys = await orderKeysNewestFirst(ordersStore);
    const capped = keys.slice(0, SUMMARY_SCAN_MAX);
    const page = await ordersPage(ordersStore, capped, { offset: 0, limit: capped.length });
    const { payments, total: paymentsTotal } = await listPayments({ limit: MAX_PAGE });
    const shipments = await listShipments();
    const base = summarize(page.orders, payments);

    return json(200, headers, {
      ...base,
      gateway: gatewayState(),
      couriers: await courierPanel(shipments),
      shipments: {
        total: shipments.length,
        open: shipments.filter((s) => !["delivered", "cancelled"].includes(s.status)).length,
      },
      scan: {
        orders: keys.length,
        scanned: page.orders.length,
        truncated: keys.length > capped.length,
        unreadable: page.unreadable,
        paymentsTotal,
      },
      today: peruDateKey(),
      me: email,
    });
  } catch (error) {
    return json(500, headers, { error: error.message });
  }
}

/**
 * Wallet ledgers for the buyers on these orders, keyed by email.
 *
 * The ledger needs credits ISSUED against an order (a SUNAT over-estimate
 * coming back as saldo), and those live on the buyer's wallet, not on the
 * order. One read per distinct buyer, never one per order.
 */
export function walletEmailFor(order) {
  /* buyerEmail is only set when the order was placed from a signed-in
     session. A GUEST order has none — and a guest's tax refund still
     gets issued to the email they typed at checkout, which is the email
     they will eventually register with. Keying on buyerEmail alone left
     those credits orphaned: issued, owed, and invisible in the ledger.
     A wallet only exists for a registered address, so reading the
     checkout email cannot invent one. */
  return order?.buyerEmail || order?.customer?.email || null;
}

async function readWalletsFor(orders) {
  const emails = [...new Set(orders.map(walletEmailFor).filter(Boolean))];
  const store = getStore("wallet");
  const read = await Promise.all(
    emails.map((e) => store.get(e, { type: "json" }).then((v) => v, () => null)),
  );
  return new Map(emails.map((e, i) => [e, read[i]]));
}
