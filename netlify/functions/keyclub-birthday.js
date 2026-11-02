// THE DAILY BIRTHDAY CREDIT (#443, Danny 2026-11-02): «$5 en tu
// cumpleaños». Runs once a day (Netlify scheduled function, like
// dni-purge.js) and credits every confirmed member whose birthday is
// today in Lima, once per year (keyed claim, _keyclub.js grantCredit), so
// a second run the same day pays nothing.
//
// 1 crédito = US$1; the wallet keeps soles, so the credit is posted at
// today's SUNAT venta rate (exchange-rate.js). Without a rate it pays
// nothing and logs it -- the next day's run catches no one up, so the
// log line is the alarm. It logs counts only, never an address.
import { connectLambda, getStore } from "@netlify/blobs";
import { KEYCLUB_STORE, runBirthdayCredits } from "./_keyclub.js";
import { postTransaction } from "./_wallet.js";

export const config = { schedule: "0 6 * * *" }; // 06:00 UTC = 01:00 Lima

export async function fetchVenta(origin, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${origin}/.netlify/functions/exchange-rate`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const v = Number(data && data.venta);
    return v > 0 ? v : null;
  } catch { return null; }
}

export async function handler(event) {
  connectLambda(event);
  const origin = String(process.env.URL || "https://ariashop.pe").replace(/\/+$/, "");
  const fx = await fetchVenta(origin);
  if (!fx) {
    console.error("[keyclub-birthday] no exchange rate; nothing credited today");
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "sin tipo de cambio" }) };
  }
  const tally = await runBirthdayCredits({ users: getStore("users"), claims: getStore(KEYCLUB_STORE), post: postTransaction }, { fx });
  console.info("[keyclub-birthday]", JSON.stringify(tally));
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...tally }) };
}
