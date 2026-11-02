/* ============================================================
   MODEL SHOT OR FLAT? (#443 c.6578377916 item 5, Danny 2026-11-02:
   "every women's apparel carousel leads with a MODEL wearing the piece,
   never a standalone garment/product shot in the lead slot").

   Nothing here looks at pixels. A photo counts as a model shot only
   when the store's own file naming says so, and as a flat only when it
   says that; everything else is UNKNOWN and is never promoted as a
   model. The signals, each one read off the committed catalogues:

     victoriassecret  ..._OM_F / _OM_B / _OM_S  on model
                      ..._OF_F / _OF_DET        off figure (flat, detail)
     montce           ..._studio_... / _lifestyle_  on model (Danny's
                      reference: the Montce pill's studio_front lead is
                      "a model, right"); ...flat...  flat. Montce's
                      shoot frames (MontceSwim-5738) are UNKNOWN: Danny
                      called the «Todas» lead on that frame a flat top on
                      white, so they are never treated as a model.
     skims            ..._0063-FR / -SD / -BK  shoot frames (on body)
                      ...-FLT / -FL            flat
     intimissimi      -FI / -BI  front / back "indossato" (worn)
                      -F / -SW / -D1 / -DT1W   still, swatch, detail
     any store        "on-model", "onmodel", "lifestyle", "model2_1"
                      -> model; "flat", "laydown", "ghost", "packshot"
                      -> flat.
   ============================================================ */

const fileOf = (url) => String(url || "").split("?")[0].split("#")[0].split("/").pop() || "";

const STORE_RULES = {
  victoriassecret: (f) => (/_OM_[A-Z]+\.\w+$/i.test(f) ? true : /_OF_[A-Z]+\.\w+$/i.test(f) ? false : null),
  montce: (f) => (/flat/i.test(f) ? false : /(^|[_-])(studio|studiofront|lifestyle)([_.-]|$)/i.test(f) || /studio_?front|studio_?back/i.test(f) ? true : null),
  skims: (f) => (/-(FLT|FL)\.\w+$/i.test(f) ? false : /_\d{3,5}-(FR|SD|BK)\.\w+$/i.test(f) ? true : null),
  intimissimi: (f) => (/-(FI|BI)\.\w+$/i.test(f) ? true : /-(F|SW|D\d|DT\d\w*)\.\w+$/i.test(f) ? false : null),
};
const GENERIC_MODEL = /(^|[^a-z])(on[-_]?model|on[-_]?body|lifestyle|model\d*)([^a-z]|$)/i;
const GENERIC_FLAT = /(^|[^a-z])(flat|flats?lay|laydown|lay[-_]?flat|ghost|packshot|still[-_]?life)([^a-z]|$)/i;

/** true: a model wears it; false: a flat / product shot; null: the data cannot tell. */
export function modelShot(store, url) {
  const f = fileOf(url);
  if (!f) return null;
  const rule = STORE_RULES[String(store || "").toLowerCase()];
  if (rule) { const v = rule(f); if (v !== null) return v; }
  if (GENERIC_FLAT.test(f)) return false;
  if (GENERIC_MODEL.test(f)) return true;
  return null;
}

/** The first photo of a gallery that is a known model shot, or "". */
export function modelPhotoOf(store, images) {
  for (const u of images || []) if (/^https?:\/\//.test(String(u)) && modelShot(store, u) === true) return String(u);
  return "";
}
