/* ============================================================
   WHAT A VIN TELLS YOU BY ITSELF.

   Three of the seventeen characters are decodable with no database
   at all: the World Manufacturer Identifier in positions 1-3, and the
   model year in position 10. Everything else — model, trim, engine —
   lives in positions 4-8, which each manufacturer defines for itself.
   There is no way to read "Tacoma" out of a VIN without a table that
   says what Toyota meant by those letters.

   So this file decodes exactly what is decodable and says nothing
   about the rest. The model, the trim and the engine come from NHTSA
   or they come back null; they are never inferred. A wrong model here
   becomes a wrong part, and the shopper pays for it.

   THE CHECK DIGIT IS A WARNING, NOT A VERDICT. Position 9 is a
   checksum over the other sixteen characters, and it catches
   transcription errors — exactly what happens when someone reads a
   number off a windscreen into a phone. But it is mandatory only in
   North America. Peru's used-import market runs heavily on Japanese
   and Korean vehicles whose VINs frequently do not carry a valid one,
   so rejecting on the checksum would reject real cars belonging to
   real customers. It is reported, and the caller decides whether to
   ask the shopper to read it again.
   ============================================================ */

/* I, O and Q are excluded from VINs precisely because they are
   confusable with 1, 0 and 0. A VIN containing one is a misreading. */
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/* Position 10. The cycle is 30 long, so a code means two years thirty
   apart; the recent one is taken unless that would be in the future. */
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function vinYear(code, now = new Date()) {
  const i = YEAR_CODES.indexOf(code);
  if (i < 0) return null;
  const base = 1980 + i;
  const recent = base + 30;
  return recent <= now.getFullYear() + 1 ? recent : base;
}

/* Only manufacturers we would actually see. An unknown WMI returns
   null rather than a guess — "probably Japanese" is not a make. */
const WMI = {
  "1FA": "Ford", "1FB": "Ford", "1FC": "Ford", "1FD": "Ford", "1FM": "Ford",
  "1FT": "Ford", "2FA": "Ford", "3FA": "Ford",
  "1G1": "Chevrolet", "1GC": "Chevrolet", "2G1": "Chevrolet", "3GC": "Chevrolet",
  "KL1": "Chevrolet", "1GK": "GMC", "1GT": "GMC",
  "1C3": "Chrysler", "1C4": "Jeep", "1C6": "Ram", "1J4": "Jeep", "3C4": "Chrysler",
  "JA3": "Mitsubishi", "JA4": "Mitsubishi",
  "JF1": "Subaru", "JF2": "Subaru", "4S3": "Subaru", "4S4": "Subaru",
  "JH4": "Acura", "19U": "Acura",
  "JHM": "Honda", "1HG": "Honda", "2HG": "Honda", "3HG": "Honda", "5J6": "Honda",
  "JM1": "Mazda", "JM3": "Mazda", "3MZ": "Mazda", "4F2": "Mazda",
  "JN1": "Nissan", "JN8": "Nissan", "1N4": "Nissan", "3N1": "Nissan", "5N1": "Nissan",
  "JT2": "Toyota", "JT3": "Toyota", "JT4": "Toyota", "JTD": "Toyota", "JTE": "Toyota",
  "JTH": "Lexus", "JTJ": "Lexus", "JTK": "Toyota", "JTL": "Toyota", "JTM": "Toyota",
  "JTN": "Toyota", "2T1": "Toyota", "4T1": "Toyota", "4T3": "Toyota", "5TB": "Toyota",
  "5TD": "Toyota", "5TE": "Toyota", "5TF": "Toyota", "3TM": "Toyota",
  "KMH": "Hyundai", "KM8": "Hyundai", "5NP": "Hyundai",
  "KNA": "Kia", "KND": "Kia", "KNM": "Kia", "5XY": "Kia", "3KP": "Kia",
  "WAU": "Audi", "TRU": "Audi", "WA1": "Audi",
  "WBA": "BMW", "WBS": "BMW", "WBY": "BMW", "5UX": "BMW", "4US": "BMW",
  "WDB": "Mercedes-Benz", "WDC": "Mercedes-Benz", "WDD": "Mercedes-Benz",
  "W1K": "Mercedes-Benz", "4JG": "Mercedes-Benz",
  "WVW": "Volkswagen", "WV1": "Volkswagen", "WV2": "Volkswagen", "3VW": "Volkswagen",
  "1VW": "Volkswagen", "YV1": "Volvo", "YV4": "Volvo",
  "SAL": "Land Rover", "SAJ": "Jaguar", "ZFA": "Fiat", "ZAR": "Alfa Romeo",
  "VF1": "Renault", "VF3": "Peugeot", "VF7": "Citroën",
  "LGB": "Chery", "LSV": "Volkswagen", "LVS": "Ford",
  "MA1": "Mahindra", "MA3": "Suzuki", "MAL": "Hyundai", "MB1": "Ashok Leyland",
  "9BW": "Volkswagen", "93Y": "Renault", "8AP": "Fiat", "8AG": "Chevrolet",
};

export function vinChecksumOk(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /[0-9]/.test(c) ? Number(c) : TRANSLIT[c];
    if (v === undefined) return false;
    sum += v * WEIGHTS[i];
  }
  const rest = sum % 11;
  return (rest === 10 ? "X" : String(rest)) === vin[8];
}

/**
 * What the VIN itself says. No network, no guessing.
 *
 * Returns `{ unavailable }` when the string cannot be a VIN at all —
 * wrong length, or a character VINs do not use. Everything it does
 * return is read straight out of the number.
 */
export function decodeVinLocal(vin, now = new Date()) {
  const v = String(vin || "").toUpperCase().replace(/[\s-]/g, "");
  if (!v) return { unavailable: "dime el VIN y lo reviso" };
  if (v.length !== 17) {
    return { unavailable: `ese VIN no parece válido: tiene ${v.length} caracteres y un VIN tiene 17` };
  }
  if (/[IOQ]/.test(v)) {
    return { unavailable: "ese VIN no parece válido: lleva una I, O o Q, y los VIN no usan esas letras. ¿Puede ser un 1 o un 0?" };
  }
  if (!VIN_RE.test(v)) {
    return { unavailable: "ese VIN no parece válido, ¿lo puedes revisar?" };
  }
  return {
    vin: v,
    year: vinYear(v[9], now),
    make: WMI[v.slice(0, 3)] || null,
    /* Not decodable without a manufacturer table. Null, never a guess. */
    model: null,
    trim: null,
    engine: null,
    checksum_ok: vinChecksumOk(v),
  };
}
