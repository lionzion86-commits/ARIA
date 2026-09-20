/* ============================================================
   HOW A SHOPPER REACHES A HUMAN

   THE BUG THIS EXISTS FOR, reported live: at the bottom of Devoluciones,
   "¿Necesitas ayuda con una devolución?" had a "Contactar soporte"
   button, and the button re-opened the AI chat assistant. A shopper with
   a return problem — the exact moment they most need a person — was
   handed the same robot they had presumably just failed to get an answer
   from. A dead end dressed as a door.

   So support CTAs are plain mailto links now. No JavaScript handler, no
   chat handoff, no interstitial: the anchor carries a real href, which is
   what makes it work in every browser, on a phone, with JS disabled, and
   on a long-press "copy address".

   ONE CONSTANT, NOT SIX. The address below is the only place it is
   decided. It is a person's inbox today and will become a dedicated
   support@ address; when it does, this line changes and every CTA on the
   site follows, because index.html rewrites its support links from this
   value at load and a test fails if any authored href has drifted from
   it.

   WHY THE MARKUP STILL CARRIES A REAL ADDRESS. Rewriting the href from
   the constant is what keeps them in sync; authoring the correct one in
   the HTML anyway is what keeps the link working if the script never
   runs. Both, deliberately — a support link that depends on JavaScript is
   the failure mode this whole file exists to remove.
   ============================================================ */

/* Support: a real human who handles returns and order problems.
   Swap for support@ariashop.pe when that inbox exists — nothing else
   needs to change. */
export const SUPPORT_EMAIL = "daniel.leon@ariashop.pe";

/* General correspondence: terms questions, press, anything not a live
   order. Separate on purpose — a returns queue that also receives
   everything else stops being a returns queue. */
export const GENERAL_CONTACT_EMAIL = "contacto@ariashop.pe";

/* Pre-filled subjects, so a message arrives already sorted. Spanish,
   because the person writing it is writing in Spanish. */
export const SUPPORT_SUBJECT_RETURNS = "Ayuda con una devolución";
export const SUPPORT_SUBJECT_ORDER = "Ayuda con mi pedido";

/** `mailto:` with the subject pre-filled, encoded. */
export function supportMailto(subject, email = SUPPORT_EMAIL) {
  const address = String(email || SUPPORT_EMAIL);
  const s = String(subject || "").trim();
  return s ? `mailto:${address}?subject=${encodeURIComponent(s)}` : `mailto:${address}`;
}

/* The link each `data-support` value resolves to. The attribute is what
   index.html and checkout.html tag their CTAs with, so a new CTA is a
   data attribute rather than another copy of an address. */
export const SUPPORT_LINKS = {
  returns: () => supportMailto(SUPPORT_SUBJECT_RETURNS),
  order: () => supportMailto(SUPPORT_SUBJECT_ORDER),
  general: () => supportMailto("", GENERAL_CONTACT_EMAIL),
};
