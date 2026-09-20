/* ============================================================
   DOES THIS PART FIT THIS CAR?

   THE BUG THIS EXISTS FOR, reported live 2026-09-20: a shopper picked
   2020 / Hyundai / Sonata, searched "pastillas de freno", and got
   generic brake pads under an amber "Verifica el calce · Hyundai Sonata
   2020" badge and the line "La tienda no confirma el calce por vehículo,
   así que verifícalo antes de pedir." The vehicle picker did nothing.
   It was decoration over a keyword search.

   That middle ground is the worst of the three options. It keeps the
   liability — a wrong-fit part is a return Aria pays for — AND the
   uselessness, because a shopper who has to verify fitment themselves
   did not need us. So there are two outcomes now and no third:

     1. WE HAVE FITMENT DATA -> show only the parts confirmed to fit, with
        the green "Compatible con tu [vehículo]" badge.
     2. WE DO NOT -> say so, per store, and offer the concierge path.

   WHAT THIS FILE DOES. Danny's finding is that the product data already
   carries the compatibility list — "fits Hyundai Sonata, Hyundai Tucson,
   Kia K5, Kia Sportage 2020–2024". So this is a matching problem: pull
   that list out of whatever shape a source publishes it in, and compare
   it against the year/make/model the shopper picked. Make and model must
   match; the year must fall inside the range.

   IT FAILS CLOSED, TWICE OVER. A list we cannot parse is not a match. A
   part with no list at all is not a match either — it is `unknown`, and
   a store whose results are all unknown gets the honest empty state
   rather than a page of maybes. The only thing that earns the green
   badge is a compatibility list that names this car.
   ============================================================ */

/* Makes seen in Peru, plus the US-market brands whose parts these stores
   actually stock. Used to split "Mercedes-Benz C-Class" into a make and
   a model without guessing at whitespace — two-word makes are why a
   naive split(" ") gets this wrong. Longest first, so "Land Rover" wins
   over "Land". */
export const VEHICLE_MAKES = [
  "Mercedes-Benz", "Mercedes Benz", "Land Rover", "Alfa Romeo", "Great Wall",
  "Aston Martin", "Rolls-Royce",
  "Toyota", "Honda", "Ford", "Chevrolet", "Nissan", "Hyundai", "Kia", "Suzuki",
  "Mitsubishi", "Mazda", "Subaru", "Volkswagen", "Volvo", "Audi", "BMW", "Jeep",
  "Dodge", "Chrysler", "Ram", "GMC", "Buick", "Cadillac", "Lincoln", "Acura",
  "Infiniti", "Lexus", "Genesis", "Tesla", "Mini", "Porsche", "Fiat", "Renault",
  "Peugeot", "Citroen", "Citroën", "Seat", "Skoda", "Chery", "JAC", "Changan",
  "BYD", "Haval", "MG", "Geely", "Isuzu", "Daihatsu", "Ssangyong", "Datsun",
].sort((a, b) => b.length - a.length);

const MAKE_ALIASES = {
  "mercedes benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  benz: "mercedes-benz",
  vw: "volkswagen",
  chevy: "chevrolet",
  citroën: "citroen",
};

/* A year range only means anything inside the span a car has existed.
   1950 rules out a phone number and a part number; two years ahead of
   today rules out a price that happens to look like a year. */
const MIN_MODEL_YEAR = 1950;
const MAX_MODEL_YEAR = new Date().getFullYear() + 2;

export function normalizeVehicleText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalMake(make) {
  const m = normalizeVehicleText(make);
  return MAKE_ALIASES[m] || m;
}

/* "Sonata SE", "Corolla LE Hatchback" — a trim is not a different car for
   brake-pad purposes, and a shopper picks a model, not a trim. Compared
   on the first token so "Sonata" matches "Sonata Hybrid", while "3
   Series" and "F-150" survive intact. */
export function canonicalModel(model) {
  const m = normalizeVehicleText(model);
  if (!m) return "";
  // Multi-token model names we must not truncate to their first word.
  if (/^\d\s?series$/.test(m) || /^[a-z]-(class|series)$/.test(m)) return m;
  if (/^[a-z]+-\d+$/.test(m)) return m;            // f-150, cx-5
  return m.split(" ")[0];
}

function yearsIn(text) {
  const t = String(text || "");
  const range = /\b(19|20)(\d{2})\s*(?:-|–|—|to|a|hasta)\s*(?:(19|20))?(\d{2})\b/i.exec(t);
  if (range) {
    const from = Number(range[1] + range[2]);
    // "2020-24" is a real way to write it.
    const toPrefix = range[3] || (Number(range[4]) >= Number(range[2]) ? range[1] : String(Number(range[1]) + 1));
    const to = Number(toPrefix + range[4]);
    if (from >= MIN_MODEL_YEAR && to <= MAX_MODEL_YEAR && to >= from) {
      return { yearFrom: from, yearTo: to };
    }
  }
  const single = /\b(19|20)\d{2}\b/.exec(t);
  if (single) {
    const y = Number(single[0]);
    if (y >= MIN_MODEL_YEAR && y <= MAX_MODEL_YEAR) return { yearFrom: y, yearTo: y };
  }
  return null;
}

/** Splits "Hyundai Sonata" into its make and model, or null. */
export function splitMakeModel(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const norm = normalizeVehicleText(raw);
  for (const make of VEHICLE_MAKES) {
    const m = normalizeVehicleText(make);
    if (norm === m) return { make: canonicalMake(m), model: "" };
    if (norm.startsWith(m + " ")) {
      return { make: canonicalMake(m), model: norm.slice(m.length + 1).trim() };
    }
  }
  return null;
}

/**
 * Every vehicle a compatibility STRING names.
 *
 * Handles the shapes these listings actually use:
 *   "Fits Hyundai Sonata, Hyundai Tucson, Kia K5, Kia Sportage 2020–2024"
 *   "Fits: 2014-2019 Toyota Corolla"
 *   "2014 Toyota Corolla; 2015 Honda Civic"
 *
 * A year range at the END of the list applies to every entry that does
 * not carry its own — which is exactly how the first example reads to a
 * person, and getting it wrong would either drop every match or claim
 * all of them.
 */
export function parseFitmentText(text) {
  const raw = String(text || "");
  if (!raw.trim()) return [];

  const cleaned = raw.replace(/^\s*(fits?|compatible with|compatibility|aplicaciones?|compatibilidad|calza con)\s*:?\s*/i, "");
  // A range sitting at the end of the whole list is the shared one.
  const trailing = /(?:^|[\s,;])((?:19|20)\d{2}\s*(?:-|–|—|to|a|hasta)\s*(?:(?:19|20))?\d{2})\s*$/.exec(cleaned);
  const shared = trailing ? yearsIn(trailing[1]) : null;
  const body = trailing ? cleaned.slice(0, trailing.index) : cleaned;

  const out = [];
  for (const segment of body.split(/[;,]|\band\b|\by\b/i)) {
    const seg = segment.trim();
    if (!seg) continue;
    const own = yearsIn(seg);
    /* Strip the years, and ONLY the years. An earlier version also
       stripped every range separator wherever it appeared, which ate the
       hyphen in "Mercedes-Benz" and "F-150" and the letter "a" inside
       "Toyota" — "a" is a Spanish range word and was being matched
       without word boundaries. The separators are removed as part of the
       year pattern itself now, and nothing else is touched. */
    const withoutYears = seg
      .replace(/\b(19|20)\d{2}\s*(?:-|–|—|to|\ba\b|hasta)\s*(?:19|20)?\d{2}\b/gi, " ")
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const pair = splitMakeModel(withoutYears);
    if (!pair || !pair.model) continue;
    const years = own || shared;
    out.push({
      make: pair.make,
      model: canonicalModel(pair.model),
      yearFrom: years ? years.yearFrom : null,
      yearTo: years ? years.yearTo : null,
    });
  }
  return out;
}

/* Where a source might publish its compatibility list. Checked in order,
   most structured first: a field built for the purpose beats prose. */
const FITMENT_ARRAY_FIELDS = ["fitment", "fitments", "compatibility", "compatibleVehicles", "vehicles", "fits", "applications"];
const FITMENT_TEXT_FIELDS = ["fitmentText", "compatibilityText", "vehicleFitmentText", "description", "productDescription", "longDescription"];
const FITMENT_SPEC_KEYS = /^(fits|fitment|vehicle fitment|compatibility|compatible|applications?|aplicaciones?|compatibilidad)$/i;

function vehiclesFromStructured(value) {
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const entry of list) {
    if (!entry) continue;
    if (typeof entry === "string") {
      out.push(...parseFitmentText(entry));
      continue;
    }
    if (typeof entry !== "object") continue;
    const make = entry.make ?? entry.brand ?? entry.manufacturer;
    const model = entry.model ?? entry.modelName;
    if (!make || !model) {
      const text = entry.text ?? entry.name ?? entry.label ?? entry.description;
      if (text) out.push(...parseFitmentText(text));
      continue;
    }
    const years = entry.year != null
      ? yearsIn(String(entry.year))
      : (entry.yearFrom || entry.startYear)
        ? { yearFrom: Number(entry.yearFrom ?? entry.startYear), yearTo: Number(entry.yearTo ?? entry.endYear ?? entry.yearFrom ?? entry.startYear) }
        : null;
    out.push({
      make: canonicalMake(make),
      model: canonicalModel(model),
      yearFrom: years ? years.yearFrom : null,
      yearTo: years ? years.yearTo : null,
    });
  }
  return out;
}

/**
 * The compatibility list a raw product record carries, or null when it
 * carries none.
 *
 * Returns { vehicles, from } — `from` names the field it came out of, so
 * a source that starts publishing fitment somewhere new shows up in the
 * ops output instead of silently doing nothing.
 */
export function extractFitment(raw) {
  if (!raw || typeof raw !== "object") return null;

  for (const field of FITMENT_ARRAY_FIELDS) {
    const value = raw[field];
    if (value == null) continue;
    // A bare marketing string like "VEHICLE_SPECIFIC" is not a list.
    if (typeof value === "string" && !/\d|,/.test(value)) continue;
    const vehicles = vehiclesFromStructured(value);
    if (vehicles.length) return { vehicles, from: field };
  }

  const specs = raw.specs && typeof raw.specs === "object" ? raw.specs : {};
  for (const [key, value] of Object.entries(specs)) {
    if (!FITMENT_SPEC_KEYS.test(String(key).trim())) continue;
    const vehicles = parseFitmentText(value);
    if (vehicles.length) return { vehicles, from: `specs:${key}` };
  }

  const features = Array.isArray(raw.features) ? raw.features : [];
  for (const feature of features) {
    if (!/fits|compatib|aplicaci/i.test(String(feature))) continue;
    const vehicles = parseFitmentText(feature);
    if (vehicles.length) return { vehicles, from: "features" };
  }

  for (const field of FITMENT_TEXT_FIELDS) {
    const text = raw[field];
    if (!text || typeof text !== "string") continue;
    if (!/fits|compatib|aplicaci/i.test(text)) continue;
    const vehicles = parseFitmentText(text);
    if (vehicles.length) return { vehicles, from: field };
  }

  return null;
}

/** Does a parsed compatibility list name this car? */
export function matchesVehicle(vehicles, vehicle) {
  if (!Array.isArray(vehicles) || !vehicles.length || !vehicle) return false;
  const make = canonicalMake(vehicle.make);
  const model = canonicalModel(vehicle.model);
  const year = Number(vehicle.year);
  if (!make || !model) return false;

  return vehicles.some((v) => {
    if (canonicalMake(v.make) !== make) return false;
    if (canonicalModel(v.model) !== model) return false;
    // A list that names the car but no year is a match on make/model
    // alone: the source is telling us the part is for this model line.
    if (v.yearFrom == null || !Number.isFinite(year)) return true;
    const to = v.yearTo == null ? v.yearFrom : v.yearTo;
    return year >= v.yearFrom && year <= to;
  });
}

/**
 * The verdict for one part against one car.
 *
 *   "fits"          the compatibility list names this vehicle.
 *   "does-not-fit"  there is a list and this vehicle is not on it.
 *   "unknown"       there is no list. Not a maybe — an absence.
 *
 * Nothing downstream may treat "unknown" as "probably fine". That was the
 * bug.
 */
export function fitmentVerdict(raw, vehicle) {
  const fitment = extractFitment(raw);
  if (!fitment) return "unknown";
  return matchesVehicle(fitment.vehicles, vehicle) ? "fits" : "does-not-fit";
}
