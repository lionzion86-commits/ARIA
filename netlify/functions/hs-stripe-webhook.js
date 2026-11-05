// ARIA HOME SHIELD -- hs-stripe-webhook. Credits a paid partner pack into hs-ledger.
// Its own Stripe endpoint (register it in Stripe for checkout.session.completed and
// checkout.session.async_payment_succeeded) with its own signing secret,
// HS_STRIPE_WEBHOOK_SECRET; the signature check is the shop's verifyStripeSignature.
// Idempotent: one purchase entry per Checkout Session (ledger ref "stripe/<session id>").
// The shop's stripe-webhook.js is untouched.
import { reply, fail, openStores, getJSON } from "./_hs-store.js";
import { verifyStripeSignature, rawBodyOf } from "./_stripe-verify.js";
import { PACKS, appendLedger, packWithPrice, readSettings } from "./_hs-partners.js";

export async function applyPackEvent(S, ev, now = Date.now()) {
  const type = String(ev && ev.type || "");
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(type)) return { ignored: "type" };
  const s = ev.data && ev.data.object || {};
  const md = s.metadata || {};
  if (md.hs !== "pack") return { ignored: "not_home_shield" };
  if (s.payment_status !== "paid") return { ignored: "unpaid" };
  const pack = PACKS[md.packId] && packWithPrice(PACKS[md.packId], await readSettings(S));
  const pro = md.proId && await getJSON(S.pros, md.proId);
  if (!pack || !pro) return { ignored: "unknown_pack_or_partner" };
  if (pack.usd == null || Number(s.amount_total) !== pack.usd * 100 || String(s.currency).toLowerCase() !== "usd") return { ignored: "amount_mismatch" };
  const r = await appendLedger(S, { proId: pro.id, type: "purchase", credits: pack.credits, usd: pack.usd, packId: pack.id,
    stripeSession: s.id, livemode: !!ev.livemode, by: "stripe", ref: `stripe/${s.id}` }, now);
  return { credited: !r.duplicate, entry: r.entry };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return fail(405, "method", "Method not allowed");
  const secret = process.env.HS_STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return fail(503, "not_configured", "HS_STRIPE_WEBHOOK_SECRET is not set");
  const rawBody = rawBodyOf(event);
  const h = event.headers || {};
  const v = verifyStripeSignature({ rawBody, header: h["stripe-signature"] || h["Stripe-Signature"], secret });
  if (!v.ok) return fail(400, "bad_signature", v.reason);
  let ev;
  try { ev = JSON.parse(rawBody); } catch { return fail(400, "bad_json", "Invalid JSON"); }
  const S = openStores(event);
  return reply(200, { received: true, ...(await applyPackEvent(S, ev)) });
}
