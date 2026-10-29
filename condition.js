/* ============================================================
   CONDITION — REFURBISHED, USED AND OPEN-BOX. ONE RULE.

   WHY (2026-10-23, issue #443, Danny: "refurbished electronics is our
   biggest hit"). The Reacondicionados department, its rail inside every
   other department, the card label, the product page's disclosure and
   the order line all read THIS rule, so a product is called the same
   thing everywhere it appears.

   DISCLOSURE IS THE DESIGN (INDECOPI, Ley 29571 art. 11). The condition
   is read from the store's own title and shown; it is never upgraded.
   The grade is the store's words, verbatim, or nothing.

   NOT SOLD AS USED (item 28): clothing and footwear (Ley 28514), auto
   parts, and phones tied to a carrier. Those titles get no condition
   here, so they never enter the department or its rails.

   SHAPE. A plain script, like /off-sale.js: a classic <script src> on
   the pages (window.AriaCondition), and a side-effect ESM import
   (scripts/lib/condition.js re-exports it for the builders and the
   Netlify functions). It must stay free of import/export.
   ============================================================ */
(function (root) {
  var REFURB_RX = /\b(refurbished|renewed|remanufactured|reconditioned|certified pre-?owned|reacondicionad[oa]s?)\b/i;
  var OPEN_BOX_RX = /\bopen[- ]box\b|\bcaja abierta\b/i;
  var USED_RX = /\bpre-?owned\b|\bsegunda mano\b/i;
  /* Walmart's refurbished programme leads the title with "Restored"
     ("Restored Dell 3100 Chromebook"); a seller's suffix shouts "USED".
     Both are the store's own words, so both disclose. */
  var RESTORED_RX = /^\s*restored\b(?!\s+(?:i{1,3}|iv|v|vi{1,3})\b)|\(restored\)/i;
  var SHOUTED_USED_RX = /(?:^|[\s(\[,\-\u2013])USED\b|\((?:used|usado)\)/;
  var NO_USED_SALE_RX = /\b(shirts?|t-shirts?|tees?|pants|jeans|dress(es)?|skirts?|jackets?|coats?|hoodies?|sweaters?|leggings|shorts|socks|underwear|bras?|pajamas?|shoes?|sneakers?|boots?|sandals?|slippers?|heels|loafers?|cleats|brakes?|rotors?|alternators?|radiators?|transmissions?|bumpers?|fenders?)\b/i;
  var PHONE_RX = /\b(iphone|galaxy [sza]\d+|galaxy z|pixel \d+|smartphone|cell ?phone|flip phone|razr|moto g|tcl \d+|tcl flip)\b/i;
  var CARRIER_RX = /\b(locked|straight talk|tracfone|total wireless|cricket|metro ?pcs|boost mobile|visible|verizon|at&t|t-mobile|spectrum mobile|xfinity mobile|us cellular)\b/i;

  var LABELS = { refurbished: 'Reacondicionado', used: 'Usado', 'open-box': 'Caja abierta' };

  /** { condition, label } for a sellable refurbished / used / open-box title, else null. */
  function conditionOfTitle(title) {
    var t = String(title || '');
    var c = REFURB_RX.test(t) || RESTORED_RX.test(t) ? 'refurbished' : USED_RX.test(t) || SHOUTED_USED_RX.test(t) ? 'used' : OPEN_BOX_RX.test(t) ? 'open-box' : '';
    if (!c) return null;
    if (NO_USED_SALE_RX.test(t)) return null;
    if (PHONE_RX.test(t) && CARRIER_RX.test(t) && !/\bunlocked\b/i.test(t)) return null;
    return { condition: c, label: LABELS[c] };
  }

  /* THE GRADE, VERBATIM. Only a qualified phrase is a grade ("Target
     Certified Refurbished", "Manufacturer Refurbished", "Renewed
     Premium", "Grade A", "[Damaged Package]"); a bare "Refurbished" or
     "Open Box" says nothing about the grade, so it returns ''. */
  var GRADE_RXS = [
    /\b(?:target |amazon |apple |samsung |seller |manufacturer |factory |walmart )?certified (?:refurbished|renewed|pre-?owned)\b/i,
    /\b(?:manufacturer|factory|seller|professionally) (?:refurbished|renewed|reconditioned)\b/i,
    /\b(?:refurbished|renewed) (?:premium|excellent|good|fair|acceptable)\b/i,
    /\bgrade [a-d]\b/i,
    /\[[^\]]*(?:damaged|missing|opened|scratch|dent)[^\]]*\]/i,
    /\((?:[^)]*(?:damaged|missing|scratch|dent)[^)]*)\)/i
  ];
  function gradeOfTitle(title) {
    var t = String(title || ''), out = [];
    for (var i = 0; i < GRADE_RXS.length; i++) {
      var m = t.match(GRADE_RXS[i]);
      if (m && out.indexOf(m[0].trim()) === -1) out.push(m[0].trim());
    }
    return out.join(' · ');
  }

  root.AriaCondition = Object.freeze({
    conditionOfTitle: conditionOfTitle,
    gradeOfTitle: gradeOfTitle,
    LABELS: Object.freeze(LABELS),
    NO_GRADE_NOTE: 'La tienda no indica un grado.'
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
