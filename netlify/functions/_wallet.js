/* ============================================================
   SALDO ARIA — the wallet ledger. SERVER ONLY.

   Scope, deliberately small (launch v1): a per-user balance, a ledger of
   the transactions that produced it, display in the account area and at
   checkout, and application to an order. That is all. No member
   dashboard, no payouts, no expiry, no transfers.

   Credit is ISSUED BY HAND today — an admin calls admin-wallet-credit.js.
   Nothing reconciles quoted freight against actual freight on its own;
   that job is a post-launch build, and until it exists the homepage must
   not say "automáticamente" (see the Precio Honesto section comment).

   MONEY IS IN SOLES. Every amount here is PEN, because PEN is what the
   customer is shown everywhere on this site. The order total is quoted in USD
   and converted with the day's venta rate, so applying a balance records
   the rate it was applied at — see applyToOrderPen().

   NOT ATOMIC: balance updates are a read-modify-write against Netlify
   Blobs, the same caveat orders-create.js carries for the daily counter.
   Two credits issued in the same instant could lose one. Acceptable while
   issuance is manual and low-volume; it is NOT acceptable once an
   automatic job starts writing here, which is another reason that job is
   its own build.
   ============================================================ */
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

export const WALLET_STORE = "wallet";
// A ledger is only useful if it is readable; this is not an accounting
// system of record, so old entries roll off rather than growing forever.
export const MAX_TXNS = 200;
export const MAX_REASON_LEN = 140;

export const roundPen = (n) => Math.round(Number(n) * 100) / 100;

const emptyWallet = (email) => ({ email, balancePen: 0, txns: [] });

/** The wallet as stored, or an empty one. Never throws for a new user. */
export async function readWallet(email) {
  if (!email) return null;
  const store = getStore(WALLET_STORE);
  const wallet = await store.get(email, { type: "json" });
  if (!wallet) return emptyWallet(email);
  return {
    email,
    balancePen: roundPen(wallet.balancePen || 0),
    txns: Array.isArray(wallet.txns) ? wallet.txns : [],
  };
}

/**
 * Appends a transaction and moves the balance with it.
 *
 * kind:   "credit" (money in) or "debit" (money out)
 * reason: required, and stored — a balance nobody can explain is worse
 *         than no balance. "Ajuste" is not a reason; say what happened.
 * by:     who issued it (an admin email, or "order" for a checkout debit)
 *
 * A debit may never exceed the balance: the wallet cannot go negative,
 * because a negative saldo is a debt we never agreed to give anyone.
 */
export async function postTransaction({ email, kind, amountPen, reason, by, orderId = null }) {
  if (!email) throw new Error("email requerido");
  if (kind !== "credit" && kind !== "debit") throw new Error("kind debe ser credit o debit");
  const amount = roundPen(amountPen);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("monto inválido");
  const cleanReason = String(reason || "").trim().slice(0, MAX_REASON_LEN);
  if (!cleanReason) throw new Error("motivo requerido");

  const store = getStore(WALLET_STORE);
  const wallet = await readWallet(email);
  if (kind === "debit" && amount > wallet.balancePen) throw new Error("saldo insuficiente");

  const balancePen = roundPen(kind === "credit" ? wallet.balancePen + amount : wallet.balancePen - amount);
  const txn = {
    id: randomBytes(6).toString("hex"),
    ts: new Date().toISOString(),
    kind,
    amountPen: amount,
    reason: cleanReason,
    by: String(by || "sistema").slice(0, 120),
    orderId,
    balanceAfterPen: balancePen,
  };
  const next = { email, balancePen, txns: [txn, ...wallet.txns].slice(0, MAX_TXNS) };
  await store.setJSON(email, next);
  return { balancePen, txn };
}

/**
 * How much of a balance an order may actually consume: never more than
 * the balance, never more than the order, never negative.
 *
 * `requestedPen` comes from the browser and is treated as a request, not
 * a fact — the caller re-reads the balance server-side and passes it in.
 */
export function applicableCreditPen(balancePen, orderTotalPen, requestedPen = null) {
  const balance = roundPen(balancePen);
  const total = roundPen(orderTotalPen);
  if (!(balance > 0) || !(total > 0)) return 0;
  const cap = Math.min(balance, total);
  if (requestedPen == null) return roundPen(cap);
  const requested = roundPen(requestedPen);
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return roundPen(Math.min(requested, cap));
}
