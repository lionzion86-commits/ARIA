// The signed-in customer's saldo Aria: balance plus the transactions that
// explain it. Read-only, session-scoped — a wallet is only ever returned
// to the person it belongs to, never by email in a query string.
import { connectLambda } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { readWallet } from "./_wallet.js";

// Enough to answer "where did this come from?" without turning this into
// a dashboard — the scope for v1 is money, not account history.
const RECENT_TXNS = 10;

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, OPTIONS");

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const email = await getSessionEmail(event);
  // Not an error: the header and checkout both ask for this on every load,
  // logged in or not, and a logged-out visitor simply has no wallet.
  if (!email) {
    return { statusCode: 200, headers, body: JSON.stringify({ signedIn: false, balancePen: 0, transactions: [] }) };
  }

  try {
    const wallet = await readWallet(email);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        signedIn: true,
        balancePen: wallet.balancePen,
        transactions: wallet.txns.slice(0, RECENT_TXNS),
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}
