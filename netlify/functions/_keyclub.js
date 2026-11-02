/* ============================================================
   ARIA KEY CLUB -- the rules (#443, Danny 2026-11-01/02, comments
   6569401037 .. 6569684988; the FINAL credit rules, c.6569722842,
   c.6569780599, c.6569814495, c.6569863826). SERVER ONLY, AND PURE.

   Every store arrives injected, as in _account.js and _dni-docs.js:
   @netlify/blobs exists only in the deployed runtime, and these rules
   are tested against in-memory stubs (scripts/test/key-club-tests.mjs).

   ONE ACCOUNT. The member is the existing "users" record (auth-signup.js);
   this file only adds fields to it:
     confirmRequired   true for every account created after the door
                       shipped. Accounts created before it carry no flag
                       and stay able to sign in (they joined through the
                       old signup, which had no confirmation step).
     emailConfirmedAt  set once, when the confirmation link is used.
     confirmTokenHash  sha256 of the latest confirmation token; the token
                       itself is only ever in the email.
     memberNumber      1, 2, 3... in the order emails are confirmed.
     birthday          "YYYY-MM-DD" or "--MM-DD" (year optional), or null.
     referralCode      this member's invite code (?ref=CODE on the door).
     referredBy        the inviting member's email, resolved at signup.
     theme             "lounge" | "amanecer" (the dashboard's two moods).
     keyClub           { spentUsd, firstPaidOrderId } running tallies.
     verifyRequired    true for every account created after the
                       verification step shipped (#443, Danny c.6570940933
                       .. c.6570984289): activation needs BOTH the email
                       link AND a 6-digit code (_keyclub-verify.js).
                       Accounts without the flag are not asked for it.
     verifiedAt        when the code step was completed (once).
     verifiedVia       "whatsapp" | "sms" | "email": where that code went.
     phoneVerified     true ONLY when a code sent to her phone (WhatsApp or
                       SMS) came back right. A member verified by email is
                       active with phoneVerified false, and is never
                       promised WhatsApp alerts.

   CREDITS. 1 crédito = US$1. The wallet (_wallet.js) keeps soles, so a
   credit is posted as soles at the exchange rate of the moment, and the
   transaction carries the dollars it stands for. Exactly four ways to
   earn, and nothing else is true (Danny killed the per-purchase
   percentage credit and the one-time «first US$100» credit):
     1. devolución por sobrepeso: the exact freight difference, kilos
        under the estimate x US$13 (100 g = US$1.30). Computed in
        admin-orders-update.js, issued by hand. Copy states the mechanism
        only, never a fixed amount;
     2. US$5 per order whose MERCHANDISE subtotal (never taxes, never
        freight) is US$100 or more -- flat, a US$200 order is still US$5:
          - her first 60 days as a member: every such order;
          - after day 60: only the first such order of each calendar
            month (Lima's date);
     3. US$5 (5 créditos) to the member who invited a friend, when that
        friend becomes a member AND makes her first purchase;
     4. US$5 on her birthday, once a year.
   MEMBERS ONLY: every grant posts only to a confirmed member's account
   (grantCredit checks the recipient itself). A guest earns nothing.
   Every grant is keyed (claims store, create-only write) so a retried
   webhook or a second run of the daily job cannot pay twice.
   ============================================================ */
import { createHash, randomBytes } from "node:crypto";

export const KEYCLUB_STORE = "keyclub";
export const CONFIRM_TTL_MS = 48 * 3600 * 1000;
export const FOUNDERS_LIMIT = 1000;
export const THEMES = ["lounge", "amanecer"];
export const DEFAULT_THEME = "lounge";

export const OVERWEIGHT_USD_PER_KG = 13;
export const PERK_THRESHOLD_USD = 100;
export const PERK_CREDIT_USD = 5;
export const PERK_INTRO_DAYS = 60;
export const REFERRAL_CREDIT_USD = 5;
export const BIRTHDAY_CREDIT_USD = 5;

/* The four lines, word for word -- the door, the dashboard and the
   account's wallet all print these and nothing else under «Cómo se ganan». */
export const EARN_WAYS = [
  "Devolución por sobrepeso: si tu paquete pesa menos de lo estimado, la diferencia exacta del flete vuelve en créditos, a $13 por kilo (100 g = $1.30).",
  "$5 por compra de $100 o más: durante tus primeros 60 días, en todas las que hagas; después, en la primera de cada mes. Cuenta solo el valor de los productos, sin impuestos ni flete.",
  "$5 (5 créditos) cuando tu amiga invitada se une al Key Club y hace su primera compra.",
  "$5 en tu cumpleaños.",
];
export const CREDIT_UNIT = "1 crédito = US$1";

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---------------- confirmation token ---------------- */

export function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

/** A fresh token (only ever sent by email) and what we keep of it. */
export function newConfirmToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), expiresAt: new Date(now + CONFIRM_TTL_MS).toISOString() };
}

/** Is this account allowed in? Old accounts (no flag) yes; new ones once confirmed. */
export function isConfirmed(user) {
  if (!user) return false;
  if (user.confirmRequired !== true) return true;
  return Boolean(user.emailConfirmedAt);
}

/** Where an email-confirmed account that still owes the code step lands. */
export const VERIFY_PATH = "/keyclub.html?verificar=1";

/**
 * Email confirmed, code step not done yet: she is signed in, but she lands
 * on the verification step (keyclub.html?verificar=1), never the dashboard.
 */
export function needsVerification(user) {
  return Boolean(user && user.verifyRequired === true && isConfirmed(user) && !user.verifiedAt);
}

/** An active Key Club member: an account that exists, is confirmed and (when asked) verified. The only accounts credits post to. */
export function isMember(user) {
  return Boolean(user && typeof user === "object" && isConfirmed(user) && !needsVerification(user));
}

/** Stores the hashed token on the side (keyed by hash, never the token). */
export async function issueConfirmation(stores, email, now = Date.now()) {
  const t = newConfirmToken(now);
  await stores.keyclub.setJSON(`confirm:${t.hash}`, { email, createdAt: new Date(now).toISOString(), expiresAt: t.expiresAt });
  const user = await stores.users.get(email, { type: "json" });
  if (user) await stores.users.setJSON(email, { ...user, confirmTokenHash: t.hash, confirmExpiresAt: t.expiresAt });
  return t;
}

/**
 * Spend a token: single use, expiring, and only the latest one sent.
 * Returns { ok: true, email, user } or { ok: false, code, error }.
 */
export async function consumeConfirmation(stores, token, now = Date.now()) {
  const raw = String(token || "").trim();
  if (!raw || raw.length > 200) return { ok: false, code: "invalid", error: "El enlace no es válido." };
  const hash = hashToken(raw);
  const rec = await stores.keyclub.get(`confirm:${hash}`, { type: "json" });
  if (!rec) return { ok: false, code: "invalid", error: "Este enlace ya se usó o no es válido." };
  /* Spent the moment it is read: a second click finds nothing. */
  await stores.keyclub.delete(`confirm:${hash}`);
  if (Date.parse(rec.expiresAt) < now) return { ok: false, code: "expired", error: "Este enlace venció. Te enviamos uno nuevo si lo pides.", email: rec.email };
  const user = await stores.users.get(rec.email, { type: "json" });
  if (!user) return { ok: false, code: "invalid", error: "La cuenta ya no existe." };
  if (user.confirmTokenHash && user.confirmTokenHash !== hash && !user.emailConfirmedAt) {
    return { ok: false, code: "superseded", error: "Te enviamos un enlace más nuevo. Usa el último correo.", email: rec.email };
  }
  const next = { ...user, emailConfirmedAt: user.emailConfirmedAt || new Date(now).toISOString(), confirmTokenHash: null, confirmExpiresAt: null };
  if (!next.memberNumber) next.memberNumber = await assignMemberNumber(stores.keyclub, rec.email);
  if (!next.referralCode) next.referralCode = await assignReferralCode(stores.keyclub, rec.email);
  await stores.users.setJSON(rec.email, next);
  return { ok: true, email: rec.email, user: next };
}

/* ---------------- member number + Fundador ---------------- */

/**
 * The next free number, claimed with a create-only write so two
 * confirmations in the same instant never share one. `counter` is only a
 * hint for where to start looking.
 */
export async function assignMemberNumber(store, email) {
  const hint = await store.get("counter", { type: "json" }).catch(() => null);
  let n = Math.max(0, Number(hint && hint.last) || 0) + 1;
  for (let guard = 0; guard < 10000; guard++, n++) {
    const r = await store.setJSON(`n:${n}`, { email, at: new Date().toISOString() }, { onlyIfNew: true });
    if (r === undefined || (r && r.modified !== false)) {
      await store.setJSON("counter", { last: n });
      return n;
    }
  }
  throw new Error("no se pudo asignar un número de miembro");
}

/** «Los primeros 1,000 miembros ... quedan como Fundadores para siempre». */
export function isFounder(memberNumber) {
  const n = Number(memberNumber);
  return Number.isInteger(n) && n >= 1 && n <= FOUNDERS_LIMIT;
}

export function formatMemberNumber(n) {
  return n ? String(n).padStart(4, "0") : "";
}

/* ---------------- referral ---------------- */

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newReferralCode() {
  const b = randomBytes(7);
  let s = "";
  for (const x of b) s += REF_ALPHABET[x % REF_ALPHABET.length];
  return s;
}

export function normalizeRefCode(raw) {
  const s = String(raw || "").trim().toUpperCase();
  return /^[A-Z0-9]{5,12}$/.test(s) ? s : null;
}

export async function assignReferralCode(store, email) {
  for (let i = 0; i < 8; i++) {
    const code = newReferralCode();
    const r = await store.setJSON(`ref:${code}`, { email }, { onlyIfNew: true });
    if (r === undefined || (r && r.modified !== false)) return code;
  }
  throw new Error("no se pudo crear el código de invitación");
}

/** The inviting member's email for a code, never the invitee herself. */
export async function resolveReferrer(store, code, inviteeEmail) {
  const c = normalizeRefCode(code);
  if (!c) return null;
  const rec = await store.get(`ref:${c}`, { type: "json" }).catch(() => null);
  if (!rec || !rec.email || rec.email === inviteeEmail) return null;
  return rec.email;
}

/* ---------------- birthday ---------------- */

/** "YYYY-MM-DD" (a real date, not in the future) or "--MM-DD"; else null. */
export function normalizeBirthday(raw, now = Date.now()) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    if (y < 1900 || dt.getTime() > now) return null;
    return s;
  }
  m = /^--(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const dt = new Date(Date.UTC(2000, +m[1] - 1, +m[2]));
    if (dt.getUTCMonth() !== +m[1] - 1 || dt.getUTCDate() !== +m[2]) return null;
    return s;
  }
  return null;
}

/** Is `ymd` ("YYYY-MM-DD", Peru's date) her birthday? 29 Feb counts on 28 Feb in other years. */
export function isBirthdayOn(birthday, ymd) {
  const b = /(\d{2})-(\d{2})$/.exec(String(birthday || ""));
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!b || !t) return false;
  const [bm, bd] = [b[1], b[2]];
  if (bm === t[2] && bd === t[3]) return true;
  const y = +t[1];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return bm === "02" && bd === "29" && !leap && t[2] === "02" && t[3] === "28";
}

/** Today's date in Lima (UTC-5, no DST). */
export function limaDate(now = Date.now()) {
  return new Date(now - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/* ---------------- credits ---------------- */

/** Kilos under the estimate x US$13, to the cent. Never negative. */
export function overweightCreditUsd(estimatedKg, realKg) {
  const e = Number(estimatedKg), r = Number(realKg);
  if (!(e > 0) || !(r > 0) || r >= e) return 0;
  return round2((e - r) * OVERWEIGHT_USD_PER_KG);
}

/**
 * What the admin is offered after recording the real weight
 * (admin-orders-update.js): the overweight credit owed to a MEMBER, or
 * null -- no real weight, no estimate, or a buyer who is not a confirmed
 * Key Club member (a guest order earns no credit of any kind).
 */
export function weightCreditDueFor(order, buyer) {
  const realKg = order && order.actuals && order.actuals.pesoRealKg;
  if (realKg == null || !(Number(order.weightEstimatedKg) > 0)) return null;
  if (!order.buyerEmail || !isMember(buyer)) return null;
  const usd = overweightCreditUsd(order.weightEstimatedKg, realKg);
  const fx = Number(order.fxRateUsed) || null;
  return {
    estimatedKg: Number(order.weightEstimatedKg), realKg: Number(realKg),
    creditUsd: usd, creditPen: usd > 0 && fx ? round2(usd * fx) : 0,
    buyerEmail: order.buyerEmail,
  };
}

/**
 * Pay one credit, once, to a MEMBER. `post` is _wallet.postTransaction
 * (or a stub); `claims` takes create-only writes; `users` is the account
 * store, read here so no caller can credit a guest or an unconfirmed
 * account (no store, no credit). The soles amount is the dollars at
 * `fx`; without a rate nothing is paid (no invented exchange rate).
 */
export async function grantCredit({ claims, post, users }, { email, usd, fx, reason, key, orderId = null }) {
  const amountUsd = round2(usd);
  const rate = Number(fx);
  if (!email || !(amountUsd > 0)) return { granted: false, why: "nada que acreditar" };
  if (!users || typeof users.get !== "function") return { granted: false, why: "no es miembro" };
  const recipient = await users.get(email, { type: "json" }).catch(() => null);
  if (!isMember(recipient)) return { granted: false, why: "no es miembro" };
  if (!(rate > 0)) return { granted: false, why: "sin tipo de cambio" };
  const r = await claims.setJSON(`claim:${key}`, { email, usd: amountUsd, at: new Date().toISOString() }, { onlyIfNew: true });
  if (r && r.modified === false) return { granted: false, why: "ya acreditado" };
  try {
    const out = await post({ email, kind: "credit", amountPen: round2(amountUsd * rate), reason, by: "keyclub", orderId, credits: amountUsd, fxRate: rate });
    return { granted: true, balancePen: out && out.balancePen };
  } catch (e) {
    await claims.delete(`claim:${key}`).catch(() => {});
    throw e;
  }
}

/** Merchandise only: product prices x quantity (no taxes, no freight). */
export function merchandiseUsd(items) {
  let t = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const p = Number(it && it.priceUsd);
    if (!(p > 0) || (it && it.lineType === "bundle-discount")) continue;
    t += p * Math.max(1, Math.round(Number(it.qty) || 1));
  }
  return round2(t);
}

/** When her membership began: the confirmation, else (an old account) its creation. */
export function memberSinceMs(user) {
  const t = Date.parse((user && (user.emailConfirmedAt || user.createdAt)) || "");
  return Number.isFinite(t) ? t : null;
}

/**
 * The spend perk for one paid order (pure; onOrderPaid pays it):
 *   merchandise < US$100 -> nothing;
 *   her first 60 days as a member -> US$5, keyed per order;
 *   after day 60 -> US$5 keyed per Lima calendar month, so only the
 *   first US$100+ order of the month earns it.
 * Returns null or { phase, key, reason }.
 */
export function spendPerkFor(user, order, now = Date.now()) {
  const email = user && user.email;
  if (!email || !order || !order.orderId) return null;
  if (merchandiseUsd(order.items) < PERK_THRESHOLD_USD) return null;
  const since = memberSinceMs(user);
  const intro = since != null && now - since < PERK_INTRO_DAYS * 86400000;
  if (intro) return { phase: "intro", key: `perk:${email}:${order.orderId}`, reason: "Key Club: compra de $100+ — primeros 60 días" };
  return { phase: "monthly", key: `perk:${email}:${limaDate(now).slice(0, 7)}`, reason: "Key Club: compra de $100+ — beneficio mensual" };
}

/**
 * The paid-order hook (stripe-webhook.js, the first time an order reads
 * paid). Two rules live here:
 *   - spend perk: US$5 for a US$100+ order (merchandise only), every
 *     such order in her first 60 days, then the first of each month;
 *   - referral: her FIRST paid order, when she is a confirmed member who
 *     came with a friend's code -> 5 créditos to that friend (who must
 *     be a confirmed member herself; grantCredit checks).
 * Only orders placed signed in (buyerEmail) by a confirmed member count:
 * a guest order earns nothing. Returns what happened, for the log.
 */
export async function onOrderPaid({ users, claims, post }, order, { now = Date.now() } = {}) {
  const out = { perk: null, referral: null };
  const email = order && order.buyerEmail;
  if (!email || !order.orderId) return out;
  const user = await users.get(email, { type: "json" });
  if (!isMember(user)) return out;
  const fx = Number(order.fxRateUsed);

  /* Count this order once into her tally. */
  const counted = await claims.setJSON(`spent:${order.orderId}`, { email }, { onlyIfNew: true });
  let kc = { ...(user.keyClub || {}) };
  const firstOrder = !kc.firstPaidOrderId;
  if (!(counted && counted.modified === false)) {
    kc.spentUsd = round2((Number(kc.spentUsd) || 0) + merchandiseUsd(order.items));
    if (firstOrder) kc.firstPaidOrderId = order.orderId;
    await users.setJSON(email, { ...user, keyClub: kc });
  }

  const perk = spendPerkFor({ ...user, email }, order, now);
  if (perk) {
    out.perk = await grantCredit({ claims, post, users }, {
      email, usd: PERK_CREDIT_USD, fx, key: perk.key, orderId: order.orderId, reason: perk.reason,
    });
    out.perk.phase = perk.phase;
  }

  if (user.referredBy && kc.firstPaidOrderId === order.orderId) {
    out.referral = await grantCredit({ claims, post, users }, {
      email: user.referredBy, usd: REFERRAL_CREDIT_USD, fx, key: `referral:${email}`, orderId: null,
      reason: "Tu amiga invitada se unió al Key Club e hizo su primera compra",
    });
  }
  return out;
}

/**
 * The daily birthday pass (keyclub-birthday.js). Every confirmed member
 * whose birthday is today in Lima gets US$5, once per year.
 */
export async function runBirthdayCredits({ users, claims, post }, { now = Date.now(), fx }) {
  const today = limaDate(now);
  const year = today.slice(0, 4);
  const tally = { checked: 0, credited: 0, skipped: 0 };
  const { blobs } = await users.list();
  for (const { key } of blobs) {
    const u = await users.get(key, { type: "json" }).catch(() => null);
    if (!u || !u.birthday) continue;
    tally.checked++;
    if (!isMember(u) || !isBirthdayOn(u.birthday, today)) { tally.skipped++; continue; }
    const r = await grantCredit({ claims, post, users }, {
      email: u.email || key, usd: BIRTHDAY_CREDIT_USD, fx, key: `birthday:${u.email || key}:${year}`,
      reason: "Feliz cumpleaños de parte de Aria",
    });
    if (r.granted) tally.credited++; else tally.skipped++;
  }
  return tally;
}

/* ---------------- the dashboard's view of her ---------------- */

export function normalizeTheme(t) {
  return THEMES.includes(t) ? t : null;
}

/** What the dashboard may show about her membership. Copied out by name. */
export function keyClubView(user) {
  const u = user || {};
  const n = Number(u.memberNumber) || null;
  return {
    active: isMember(u),
    needsVerification: needsVerification(u),
    phoneVerified: u.phoneVerified === true,
    verifiedVia: u.verifiedVia || null,
    memberNumber: n,
    memberNumberLabel: formatMemberNumber(n),
    founder: isFounder(n),
    memberSince: u.emailConfirmedAt || u.createdAt || null,
    theme: normalizeTheme(u.theme) || DEFAULT_THEME,
    birthday: u.birthday || null,
    referralCode: u.referralCode || null,
    earnWays: EARN_WAYS,
    creditUnit: CREDIT_UNIT,
  };
}

/* ---------------- early access («Próximas ofertas de temporada») ----------------
   Honesty rule: an offer is listed only once a store confirms it; members
   see it before everyone. */

/**
 * Config: { sales: [{ id, title, unlockAt, items: [{ id, title, brand,
 * store, usd, wasUsd, image }] }] } (assets/keyclub/early-access.json).
 * Before unlockAt the items are members-only: public pages hide them,
 * the dashboard shows them. The same function runs in the browser
 * (assets/js/early-access.js mirrors it) and here for the tests.
 */
export function lockedIds(config, now = Date.now()) {
  const ids = new Set();
  for (const s of (config && Array.isArray(config.sales) ? config.sales : [])) {
    const t = Date.parse(s && s.unlockAt);
    if (!Number.isFinite(t) || t <= now) continue;
    for (const it of Array.isArray(s.items) ? s.items : []) if (it && it.id) ids.add(String(it.id));
  }
  return ids;
}

export function visibleItems(items, config, { member = false, now = Date.now() } = {}) {
  if (member) return items.slice();
  const locked = lockedIds(config, now);
  return items.filter((it) => !(it && locked.has(String(it.id))));
}

export function activeEarlySales(config, now = Date.now()) {
  return (config && Array.isArray(config.sales) ? config.sales : [])
    .filter((s) => { const t = Date.parse(s && s.unlockAt); return Number.isFinite(t) && t > now && Array.isArray(s.items) && s.items.length; });
}

/**
 * A confirmed account without a member number (one created before the
 * door existed) gets one, and an invite code, on its first dashboard
 * load. An unconfirmed account gets nothing.
 */
export async function ensureMembership(stores, email) {
  const user = await stores.users.get(email, { type: "json" });
  if (!user || !isConfirmed(user) || (user.memberNumber && user.referralCode)) return user;
  const next = { ...user };
  if (!next.memberNumber) next.memberNumber = await assignMemberNumber(stores.keyclub, email);
  if (!next.referralCode) next.referralCode = await assignReferralCode(stores.keyclub, email);
  await stores.users.setJSON(email, next);
  return next;
}
