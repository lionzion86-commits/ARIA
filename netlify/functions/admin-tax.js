/* ============================================================
   TAX RECONCILIATION READ VIEW — the SUNAT ledger page, read-only.

     GET ?view=tax&filter=all|unreconciled&limit=25&offset=0

   Every order that carried a SUNAT tax estimate (taxEstimatedPen > 0 —
   the same predicate as the dashboard's awaitingTax alert), with the
   estimate-vs-actual comparison and its derived outcome:

     state "pending"    — taxReconciledAt is not set; SUNAT document not
                          yet matched against this order.
     state "credit-due" — we over-estimated; the difference becomes Aria
                          wallet credit for the buyer (issued manually via
                          admin-wallet-credit.js).
     state "absorbed"   — we under-estimated; Aria absorbs the difference.
     state "exact"      — estimate matched the real SUNAT figure exactly.

   PURE READ. This function never writes, never issues credit, never
   touches reconciliation state — that lives in admin-orders-update.js and
   is not altered here.

   SCAN BOUNDS (same honesty contract as admin-dashboard.js): listing
   keys is one call, but finding "orders with a tax estimate" requires
   reading records, so the scan is capped at TAX_SCAN_MAX. When the cap
   bites, `truncated` says so and `scanned`/`scanTotal` show the coverage —
   a tax total that silently covers 300 of 900 orders is the kind of
   number someone would take to an accountant. The filter is applied
   across the whole scanned set, and pagination slices the filtered list,
   so page boundaries are stable (not the dashboard's day-granular paging).
   ------------------------------------------------------------ */

import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

export const DEFAULT_PAGE = 25;
export const MAX_PAGE = 100;
/* Same scan cap as the dashboard's SUMMARY_SCAN_MAX: one read per order
   inside a 10-second function budget. */
export const TAX_SCAN_MAX = 400;

const finite = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Order keys, newest day first. The "count:*" keys are daily counters. */
async function orderKeysNewestFirst(store) {
  const { blobs } = await store.list();
  return blobs
    .map((b) => b.key)
    .filter((k) => !k.startsWith("count:"))
    .sort((a, b) => b.localeCompare(a));
}

/**
 * One row of the tax view, derived from stored fields only.
 *
 * The writer (admin-orders-update.js) sets taxReconciledAt only when a
 * real SUNAT figure (taxActualPen) was stored, so "pending" is decided
 * from taxReconciledAt, never by guessing from null actuals.
 */
function taxRow(order) {
  const estimatedPen = round2(Number(order.taxEstimatedPen) || 0);
  const actualPen = finite(order.taxActualPen);
  const reconciledAt = order.taxReconciledAt || null;

  let state = "pending";
  let differencePen = null;
  if (reconciledAt) {
    differencePen = round2(estimatedPen - (actualPen ?? 0));
    state = differencePen > 0 ? "credit-due" : differencePen < 0 ? "absorbed" : "exact";
  }

  return {
    orderId: order.orderId || null,
    createdAt: order.createdAt || null,
    customerName: order?.customer?.name || order?.customer?.nombre || null,
    customerEmail: order.buyerEmail || order?.customer?.email || null,
    taxEstimatedPen: estimatedPen,
    taxActualPen: actualPen,
    sunatDocRef: order.sunatDocRef || null,
    taxReconciledAt: reconciledAt,
    differencePen,
    creditDuePen: differencePen != null && differencePen > 0 ? differencePen : 0,
    absorbedPen: differencePen != null && differencePen < 0 ? Math.abs(differencePen) : 0,
    state,
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
  const filter = String(q.filter || "all");
  if (!["all", "unreconciled"].includes(filter)) {
    return json(400, headers, { error: "filter debe ser all o unreconciled" });
  }
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(q.limit) || DEFAULT_PAGE));
  const offset = Math.max(0, Number(q.offset) || 0);

  try {
    const store = getStore("orders");
    const keys = await orderKeysNewestFirst(store);

    /* The tax predicate (taxEstimatedPen > 0) lives on the record, so
       the scan reads every key in the capped window and keeps only the
       ones with an estimate. Unreadable records are counted, not thrown. */
    const capped = keys.slice(0, TAX_SCAN_MAX);
    const settled = await Promise.all(
      capped.map((k) => store.get(k, { type: "json" }).then((v) => v, () => null)),
    );
    const unreadable = settled.filter((v) => v === null).length;
    const withTax = settled
      .filter(Boolean)
      .filter((o) => Number(o.taxEstimatedPen) > 0)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const rows = withTax.map(taxRow);
    const filtered = filter === "unreconciled" ? rows.filter((r) => r.state === "pending") : rows;

    /* Totals over the whole scanned-and-filtered set, not just the page —
       but honest about the scan cap. */
    const totals = {
      estimatedPen: 0,
      actualPen: 0,
      creditDuePen: 0,
      absorbedPen: 0,
      unreconciledCount: 0,
    };
    for (const r of filtered) {
      totals.estimatedPen += r.taxEstimatedPen;
      if (r.taxActualPen != null) totals.actualPen += r.taxActualPen;
      totals.creditDuePen += r.creditDuePen;
      totals.absorbedPen += r.absorbedPen;
      if (r.state === "pending") totals.unreconciledCount += 1;
    }
    for (const k of Object.keys(totals)) {
      totals[k] = k === "unreconciledCount" ? totals[k] : round2(totals[k]);
    }

    const page = filtered.slice(offset, offset + limit);

    return json(200, headers, {
      rows: page,
      totals,
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
      unreadable,
      scan: {
        orders: keys.length,
        scanned: capped.length,
        truncated: keys.length > capped.length,
      },
    });
  } catch (error) {
    return json(500, headers, { error: error.message });
  }
}
