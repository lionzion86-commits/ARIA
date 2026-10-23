// Mi cuenta (#443, member-account-area brief): the signed-in member's
// orders, tracking, saved cart, documents, Key Club wallet and profile,
// in one read. Session-scoped like wallet-get and dni-pack: the account
// is the session's email and nothing else. The rules live in
// _account.js, which is pure and tested against stub stores.
import { connectLambda, getStore } from "@netlify/blobs";
import { corsHeaders, getSessionEmail } from "./_auth-helpers.js";
import { accountOverview } from "./_account.js";
import { DNI_PACKS_STORE } from "./_dni-docs.js";
import { WALLET_STORE } from "./_wallet.js";

export async function handler(event) {
  connectLambda(event);
  const headers = { ...corsHeaders("GET, OPTIONS"), "Content-Type": "application/json", "Cache-Control": "private, no-store" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const email = await getSessionEmail(event);
  // Not an error: the page shows the sign-in form.
  if (!email) return { statusCode: 200, headers, body: JSON.stringify({ signedIn: false }) };

  try {
    const stores = {
      orders: getStore("orders"),
      shipments: getStore("shipments"),
      wallet: getStore(WALLET_STORE),
      carts: getStore("carts"),
      users: getStore("users"),
      packs: getStore(DNI_PACKS_STORE),
    };
    const t0 = Date.now();
    const overview = await accountOverview(stores, email);
    // Counts and timings only: never the email or an order id.
    console.info("[account]", JSON.stringify({ ms: Date.now() - t0, orders: overview.orders.length, problems: overview.problems }));
    return { statusCode: 200, headers, body: JSON.stringify(overview) };
  } catch (error) {
    // Counts and messages only: never the email or an order id.
    console.error("[account] failed", error && error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "No pudimos cargar tu cuenta. Intenta de nuevo en un momento." }) };
  }
}
