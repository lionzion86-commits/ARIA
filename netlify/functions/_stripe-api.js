/* ============================================================
   THE ONE STRIPE CALL THIS SITE MAKES: open a Checkout Session.

   Plain fetch against Stripe's REST API, form-encoded -- no SDK, the
   same choice _stripe-verify.js made for the webhook. The parameters are
   built (and tested) in _checkout-model.js; this file only sends them.
   ============================================================ */
export async function createCheckoutSession(form, secretKey, { fetchImpl = fetch, idempotencyKey } = {}) {
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: new URLSearchParams(form).toString(),
  });
  let data = null;
  try { data = await res.json(); } catch { /* fall through */ }
  if (!res.ok || !data || !data.url) {
    const msg = (data && data.error && data.error.message) || `Stripe respondió ${res.status}`;
    throw new Error(msg);
  }
  return { id: data.id, url: data.url, livemode: Boolean(data.livemode), expiresAt: data.expires_at || null };
}

/** The session, to confirm a return from Stripe before saying "paid". */
export async function retrieveCheckoutSession(id, secretKey, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error((data && data.error && data.error.message) || `Stripe respondió ${res.status}`);
  return data;
}
