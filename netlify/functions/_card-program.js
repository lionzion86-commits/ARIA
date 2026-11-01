// THE CARD PROGRAM (Lithic) -- an adapter, and a FAKE when there is no key
// (#443 c.6551091244: a scoped one-order card is issued at claim, merchant-
// locked, exact amount, closed after capture; the float gate reads the card
// program's AVAILABLE balance, not a bank balance).
//
// Underscore: not an endpoint. _dispatch.js is the only caller.
//
// ENV (names only, never values in this repo):
//   LITHIC_API_KEY   the API key. Absent -> the FAKE below, labelled SANDBOX.
//   LITHIC_ENV       "sandbox" -> https://sandbox.lithic.com, anything else
//                    -> https://api.lithic.com
//
// REST SHAPES, AS LITHIC DOCUMENTS THEM
//   GET   /v1/balances                     { data: [{ available_amount (cents), currency, financial_account_type }] }
//   POST  /v1/cards                        { type: "MERCHANT_LOCKED" | "SINGLE_USE", spend_limit (cents),
//                                            spend_limit_duration: "TRANSACTION" | "FOREVER", memo }
//                                          -> { token, last_four, state, type, spend_limit, exp_month, exp_year }
//   PATCH /v1/cards/{token}                { state: "PAUSED" | "CLOSED" }
//   GET   /v1/transactions?card_token=...  { data: [{ token, amount (cents), status, merchant: { descriptor } }] }
// Auth: the key in the Authorization header.
//
// A FULL PAN NEVER LEAVES THIS FILE. The real API returns `pan` and `cvv`
// only to PCI-scoped callers; this adapter drops both and keeps last four.
// Phase 1's reveal rule (shown once, ten minutes) applies to what the page
// shows; with a real key the full number would come from Lithic's hosted
// card embed, which is not built here.

const cents = (usd) => Math.round(Number(usd) * 100);
const usd = (c) => Math.round(Number(c || 0)) / 100;

/* The fake float when nothing has set one: a sandbox figure, adjustable on
   Danny's board and in the tests. It is not money; the UI says SANDBOX. */
export const FAKE_FLOAT_DEFAULT_USD = 1000;

export function cardProgramMode(env = process.env) {
  if (!env.LITHIC_API_KEY) return { live: false, sandbox: true, label: "SANDBOX", source: "fake" };
  const sandbox = String(env.LITHIC_ENV || "").toLowerCase() === "sandbox";
  return { live: true, sandbox, label: sandbox ? "SANDBOX" : "LIVE", source: "lithic" };
}
export function lithicBaseUrl(env = process.env) {
  return String(env.LITHIC_ENV || "").toLowerCase() === "sandbox" ? "https://sandbox.lithic.com" : "https://api.lithic.com";
}

function publicCard(c, extra = {}) {
  return {
    token: c.token, last4: c.last_four || c.last4 || null, state: c.state, type: c.type,
    spendLimitUsd: usd(c.spend_limit), expMonth: c.exp_month || null, expYear: c.exp_year || null, ...extra,
  };
}

/** The real Lithic client. `fetchImpl` is injected so the shapes are testable with no network. */
export function lithicProgram({ env = process.env, fetchImpl = fetch } = {}) {
  const base = lithicBaseUrl(env);
  const call = async (method, path, body) => {
    const r = await fetchImpl(base + path, {
      method,
      headers: { Authorization: env.LITHIC_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Lithic ${method} ${path}: ${r.status} ${j.message || j.debugging_request_id || ""}`.trim()), { code: 502 });
    return j;
  };
  return {
    mode: cardProgramMode(env),
    async availableFloatUsd() {
      const j = await call("GET", "/v1/balances");
      const rows = Array.isArray(j.data) ? j.data : [];
      const issuing = rows.find((b) => /ISSUING/i.test(b.financial_account_type || "")) || rows[0];
      if (!issuing || !Number.isFinite(Number(issuing.available_amount))) throw Object.assign(new Error("Lithic no devolvió un saldo disponible"), { code: 502 });
      return usd(issuing.available_amount);
    },
    async issueCard({ checkoutId, amountUsd, merchant }) {
      const c = await call("POST", "/v1/cards", {
        type: "MERCHANT_LOCKED",
        spend_limit: cents(amountUsd),
        spend_limit_duration: "TRANSACTION",
        memo: `Aria ${checkoutId} ${merchant}`.slice(0, 120),
      });
      return publicCard(c, { merchant, issuedAt: new Date().toISOString() });
    },
    async setState(token, state) {
      if (state !== "PAUSED" && state !== "CLOSED") throw new Error("Estado de tarjeta inválido");
      const c = await call("PATCH", `/v1/cards/${encodeURIComponent(token)}`, { state });
      return publicCard(c);
    },
    async charges(token) {
      const j = await call("GET", `/v1/transactions?card_token=${encodeURIComponent(token)}`);
      return (j.data || []).map((t) => ({ token: t.token, amountUsd: usd(t.settled_amount ?? t.amount), status: t.status, merchant: (t.merchant && t.merchant.descriptor) || null }));
    },
    /* The fake's knobs do not exist on a real program. */
    async recordCapture() { return null; },
  };
}

/**
 * THE FAKE. Deterministic and kept in the blob store (`meta` store, keys
 * fake-float / fake-card:<token>), so a claim on one function instance and
 * a capture on another agree. Captures lower the fake float exactly as a
 * real program's available balance would drop.
 */
export function fakeProgram({ meta }) {
  const tokenFor = (checkoutId) => {
    let h = 2166136261;
    for (const ch of String(checkoutId)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return { token: "fake_" + h.toString(16).padStart(8, "0"), last4: String(h % 10000).padStart(4, "0") };
  };
  return {
    mode: cardProgramMode({}),
    async availableFloatUsd() {
      const f = await meta.get("fake-float", { type: "json" });
      return f && Number.isFinite(f.availableUsd) ? f.availableUsd : FAKE_FLOAT_DEFAULT_USD;
    },
    async setFloat(availableUsd, by) {
      await meta.setJSON("fake-float", { availableUsd: Math.round(Number(availableUsd) * 100) / 100, setBy: by || null, setAt: new Date().toISOString() });
    },
    async issueCard({ checkoutId, amountUsd, merchant }) {
      const { token, last4 } = tokenFor(checkoutId);
      const existing = await meta.get("fake-card:" + token, { type: "json" });
      if (existing) return existing;
      const card = { token, last4, state: "OPEN", type: "MERCHANT_LOCKED", spendLimitUsd: Math.round(Number(amountUsd) * 100) / 100,
        spendLimitDuration: "TRANSACTION", merchant, expMonth: "00", expYear: "00", fake: true, issuedAt: new Date().toISOString(), charges: [] };
      await meta.setJSON("fake-card:" + token, card);
      return card;
    },
    async setState(token, state) {
      const c = await meta.get("fake-card:" + token, { type: "json" });
      if (!c) throw Object.assign(new Error("Tarjeta desconocida"), { code: 404 });
      c.state = state;
      await meta.setJSON("fake-card:" + token, c);
      return c;
    },
    /** A capture on the fake card: within its limit, once per checkout; the fake float drops by it. */
    async recordCapture(token, amountUsd, checkoutId) {
      const c = await meta.get("fake-card:" + token, { type: "json" });
      if (!c) return null;
      if ((c.charges || []).some((x) => x.checkoutId === checkoutId)) return c;
      const amt = Math.round(Number(amountUsd) * 100) / 100;
      const declined = c.state !== "OPEN" || amt > c.spendLimitUsd;
      c.charges = [...(c.charges || []), { amountUsd: amt, status: declined ? "DECLINED" : "SETTLED", merchant: c.merchant, checkoutId, at: new Date().toISOString() }];
      await meta.setJSON("fake-card:" + token, c);
      if (!declined) {
        const f = await this.availableFloatUsd();
        await this.setFloat(f - amt, "captura");
      }
      return c;
    },
    async charges(token) {
      const c = await meta.get("fake-card:" + token, { type: "json" });
      return c ? (c.charges || []) : [];
    },
  };
}

/** The program this deploy uses: Lithic with a key, the fake without. */
export function cardProgram({ env = process.env, meta, fetchImpl } = {}) {
  return env.LITHIC_API_KEY ? lithicProgram({ env, fetchImpl }) : fakeProgram({ meta });
}
