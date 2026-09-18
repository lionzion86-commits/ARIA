// Peru-time helpers. Underscore prefix means Netlify does NOT deploy this
// as its own endpoint — it's imported by the order/settings functions.
//
// WHY THIS EXISTS
// Netlify functions run in UTC, and orders-create.js / orders-remaining.js
// both keyed the daily order counter off `new Date().toISOString()`, i.e.
// the UTC date. Peru is UTC-5, so the "daily" cap was rolling over at
// 19:00 Peru time, not Peru midnight: every order placed between 7pm and
// midnight Peru counted against the NEXT day's cap, and the "quedan X
// cupos hoy" counter jumped back to full mid-evening. The batch itself
// runs at 09:00 PET, so the whole system has to agree on what a Peru day
// is.
//
// Peru has observed no daylight saving since 1994 and its offset is a
// flat UTC-5, so a fixed offset would work today. Intl with the IANA zone
// is used anyway so a future rule change is picked up automatically,
// falling back to the fixed offset only if the runtime ships without full
// ICU data (where an unknown zone silently resolves to UTC, which would
// reintroduce exactly the bug above).

export const PERU_TIME_ZONE = "America/Lima";
export const PERU_UTC_OFFSET_HOURS = -5; // fallback only; see above
export const DEFAULT_BATCH_HOUR = 9; // 09:00 PET

let limaFormatter = null;
try {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: PERU_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // resolvedOptions() echoing the zone back is the reliable signal that
  // the runtime really knows it rather than having fallen back to UTC.
  if (f.resolvedOptions().timeZone === PERU_TIME_ZONE) limaFormatter = f;
} catch {
  limaFormatter = null;
}

// YYYY-MM-DD for the given instant, in Peru local time. This is the key
// the daily order counter is stored under.
export function peruDateKey(date = new Date()) {
  if (limaFormatter) return limaFormatter.format(date); // en-CA gives YYYY-MM-DD
  const shifted = new Date(date.getTime() + PERU_UTC_OFFSET_HOURS * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

// Normalizes a stored/posted batch hour to a whole hour of the day.
// Anything invalid falls back to 09:00 rather than being clamped to a
// neighbouring hour, so a bad value can't quietly reschedule the batch.
//
// Only real numbers and numeric strings are accepted. Bare Number()
// coercion is not safe here: Number(null), Number(""), Number(false) and
// Number([]) are all 0 — a valid hour — so a missing or empty stored
// value would silently move the batch to midnight instead of falling
// back to 09:00.
export function normalizeBatchHour(value) {
  const isNumeric = typeof value === "number"
    || (typeof value === "string" && value.trim() !== "");
  if (!isNumeric) return DEFAULT_BATCH_HOUR;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_BATCH_HOUR;
}

// "9:00 a. m." / "2:00 p. m." — es-PE style, for customer-facing copy.
// Returned without the timezone label; callers add "(hora de Perú)".
export function formatBatchHourEs(hour) {
  const h = normalizeBatchHour(hour);
  const suffix = h < 12 ? "a. m." : "p. m.";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
}
