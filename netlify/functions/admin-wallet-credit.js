// Manual issuance of saldo Aria. This is the ONLY way credit enters a
// wallet today: an admin decides, states a reason, and it is written to
// the ledger under their name. There is no automatic reconciliation job
// yet, which is exactly why the homepage does not promise one.
//
// Admin-gated the same way every other admin-* function is: a real
// logged-in session AND an email on the ADMIN_EMAILS allowlist. Claiming
// an admin email in the body proves nothing and is not read here.
import { connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail, isAdmin, normalizeEmail } from "./_auth-helpers.js";
import { postTransaction, readWallet, roundPen } from "./_wallet.js";

// A guard rail on a manual process: a typo'd amount is a real risk when a
// human types it. Anything larger goes through more than one person.
const MAX_MANUAL_PEN = 2000;

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const callerEmail = await getSessionEmail(event);
  if (!callerEmail) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Autenticación requerida" }) };
  }
  if (!isAdmin(callerEmail)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) }; }

  const email = normalizeEmail(body.email);
  const amountPen = roundPen(body.amountPen);
  const kind = body.kind === "debit" ? "debit" : "credit";
  const reason = String(body.reason || "").trim();
  /* OPTIONAL, AND THE LEDGER NEEDS IT (2026-09-22). A credit is usually
     issued BECAUSE of an order — a SUNAT assessment that came in under
     the estimate, a goodwill refund on a late parcel — and without the
     order id on the transaction there is no way to put that credit on
     the order's ledger row. It stays optional: a pure goodwill credit
     that belongs to no order passes null, which is honest. */
  const orderId = String(body.orderId || "").trim().slice(0, 64) || null;

  if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: "Email inválido" }) };
  if (!Number.isFinite(amountPen) || amountPen <= 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Monto inválido" }) };
  }
  if (amountPen > MAX_MANUAL_PEN) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Monto sobre el límite manual (S/ ${MAX_MANUAL_PEN})` }) };
  }
  if (!reason) return { statusCode: 400, headers, body: JSON.stringify({ error: "Motivo requerido" }) };

  try {
    const { balancePen, txn } = await postTransaction({
      email, kind, amountPen, reason, by: callerEmail, orderId,
    });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email, balancePen, txn }) };
  } catch (error) {
    // "saldo insuficiente" on a debit is a client error, not a server one.
    const status = /saldo insuficiente|monto|motivo|kind/.test(error.message) ? 400 : 500;
    return { statusCode: status, headers, body: JSON.stringify({ error: error.message }) };
  }
}

// Exported for tests and for an operator running it directly against the
// store (the "direct operation" path) without going through HTTP.
export { postTransaction, readWallet };
