// ARIA HOME SHIELD -- ZIP3 centroids (approximate, committed, no geocoder).
// Underscore: not an endpoint.
//
// Area matching only needs "is this case roughly inside the pro's radius",
// so a ZIP is reduced to its first three digits and looked up here.
// Florida (launch market) has one approximate centroid per ZIP3 with the
// area name a pro sees ("Tampa area"). Every other state falls back to a
// few metro ZIP3s plus the state's rough centre, which is coarse on
// purpose: good enough to keep a Miami case away from a Pensacola pro, not
// a survey. Nothing here is precise to a street, and nothing leaves the
// server except the ZIP3 and the area name.

/* Florida, ZIP3 -> [lat, lon, area name]. */
const FL = {
  "320": [30.19, -82.64, "North Central Florida"],
  "321": [29.21, -81.02, "Daytona Beach area"],
  "322": [30.33, -81.66, "Jacksonville area"],
  "323": [30.44, -84.28, "Tallahassee area"],
  "324": [30.16, -85.66, "Panama City area"],
  "325": [30.42, -87.22, "Pensacola area"],
  "326": [29.65, -82.32, "Gainesville area"],
  "327": [28.80, -81.27, "Sanford / North Orlando area"],
  "328": [28.54, -81.38, "Orlando area"],
  "329": [28.08, -80.61, "Melbourne / Space Coast area"],
  "330": [25.55, -80.45, "South Miami-Dade / Keys area"],
  "331": [25.77, -80.21, "Miami area"],
  "332": [25.78, -80.19, "Miami area"],
  "333": [26.12, -80.14, "Fort Lauderdale area"],
  "334": [26.71, -80.06, "West Palm Beach area"],
  "335": [27.94, -82.29, "East Tampa / Brandon area"],
  "336": [27.95, -82.46, "Tampa area"],
  "337": [27.77, -82.64, "St. Petersburg area"],
  "338": [28.04, -81.95, "Lakeland area"],
  "339": [26.64, -81.87, "Fort Myers area"],
  "341": [26.14, -81.79, "Naples area"],
  "342": [27.34, -82.53, "Sarasota / Bradenton area"],
  "344": [29.19, -82.14, "Ocala area"],
  "346": [28.40, -82.55, "Hernando / Pasco area"],
  "347": [28.29, -81.41, "Kissimmee / St. Cloud area"],
  "349": [27.45, -80.33, "Fort Pierce / Port St. Lucie area"],
};

/* Some metros outside Florida (hurricane / hail belt first). */
const METRO = {
  "100": [40.75, -73.99, "New York City area"], "112": [40.65, -73.95, "Brooklyn area"],
  "282": [35.23, -80.84, "Charlotte area"], "276": [35.78, -78.64, "Raleigh area"],
  "294": [32.78, -79.93, "Charleston area"], "295": [33.69, -78.89, "Myrtle Beach area"],
  "303": [33.75, -84.39, "Atlanta area"], "314": [32.08, -81.09, "Savannah area"],
  "365": [30.69, -88.04, "Mobile area"], "366": [30.69, -88.04, "Mobile area"],
  "395": [30.37, -89.09, "Gulfport / Biloxi area"],
  "700": [29.95, -90.07, "New Orleans area"], "701": [29.95, -90.07, "New Orleans area"],
  "708": [30.45, -91.15, "Baton Rouge area"], "706": [30.22, -93.22, "Lake Charles area"],
  "750": [32.91, -96.80, "North Dallas area"], "752": [32.78, -96.80, "Dallas area"], "761": [32.75, -97.33, "Fort Worth area"],
  "770": [29.76, -95.37, "Houston area"], "775": [29.55, -95.10, "Houston Bay area"], "776": [29.31, -94.80, "Galveston area"],
  "782": [29.42, -98.49, "San Antonio area"], "787": [30.27, -97.74, "Austin area"], "784": [27.80, -97.40, "Corpus Christi area"],
  "800": [39.74, -104.99, "Denver area"], "802": [39.74, -104.99, "Denver area"],
  "731": [35.47, -97.52, "Oklahoma City area"], "741": [36.15, -95.99, "Tulsa area"],
  "850": [33.45, -112.07, "Phoenix area"], "900": [34.05, -118.24, "Los Angeles area"],
  "941": [37.77, -122.42, "San Francisco area"], "921": [32.72, -117.16, "San Diego area"],
};

/* State by ZIP3 range, with the state's rough centre. [from, to, state, lat, lon]. */
const RANGES = [
  [10, 27, "MA", 42.26, -71.80], [28, 29, "RI", 41.68, -71.51], [30, 38, "NH", 43.45, -71.56],
  [39, 49, "ME", 44.69, -69.38], [50, 54, "VT", 44.07, -72.67], [55, 55, "MA", 42.26, -71.80],
  [56, 59, "VT", 44.07, -72.67], [60, 69, "CT", 41.60, -72.70], [70, 89, "NJ", 40.19, -74.67],
  [100, 149, "NY", 42.95, -75.53], [150, 196, "PA", 40.88, -77.80], [197, 199, "DE", 39.00, -75.50],
  [200, 205, "DC", 38.90, -77.03], [206, 219, "MD", 39.05, -76.80], [220, 246, "VA", 37.52, -78.85],
  [247, 268, "WV", 38.64, -80.62], [270, 289, "NC", 35.56, -79.39], [290, 299, "SC", 33.86, -80.95],
  [300, 319, "GA", 32.68, -83.22], [398, 399, "GA", 32.68, -83.22], [320, 349, "FL", 28.10, -81.60],
  [350, 369, "AL", 32.80, -86.79], [370, 385, "TN", 35.86, -86.35], [386, 397, "MS", 32.74, -89.68],
  [400, 427, "KY", 37.53, -85.30], [430, 459, "OH", 40.29, -82.79], [460, 479, "IN", 39.89, -86.28],
  [480, 499, "MI", 43.33, -84.54], [500, 528, "IA", 42.08, -93.50], [530, 549, "WI", 44.63, -89.71],
  [550, 567, "MN", 46.28, -94.31], [570, 577, "SD", 44.44, -100.23], [580, 588, "ND", 47.53, -100.47],
  [590, 599, "MT", 47.03, -109.64], [600, 629, "IL", 40.04, -89.20], [630, 658, "MO", 38.46, -92.29],
  [660, 679, "KS", 38.53, -98.38], [680, 693, "NE", 41.50, -99.79], [700, 714, "LA", 31.07, -92.00],
  [716, 729, "AR", 34.89, -92.44], [730, 749, "OK", 35.59, -97.49], [750, 799, "TX", 31.47, -99.33],
  [885, 885, "TX", 31.76, -106.44], [800, 816, "CO", 39.00, -105.55], [820, 831, "WY", 42.99, -107.55],
  [832, 838, "ID", 44.35, -114.61], [840, 847, "UT", 39.32, -111.09], [850, 865, "AZ", 34.27, -111.66],
  [870, 884, "NM", 34.41, -106.11], [889, 898, "NV", 39.33, -116.63], [900, 961, "CA", 37.18, -119.47],
  [967, 968, "HI", 20.80, -156.33], [970, 979, "OR", 43.93, -120.56], [980, 994, "WA", 47.38, -120.45],
  [995, 999, "AK", 63.35, -152.84],
];

export const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** { zip3, state, lat, lon, area, precise } for a 5-digit ZIP, or null. */
export function zip3Info(zip) {
  const z = String(zip || "").trim();
  if (!/^\d{5}$/.test(z)) return null;
  const zip3 = z.slice(0, 3);
  const n = Number(zip3);
  const range = RANGES.find(([a, b]) => n >= a && n <= b);
  if (!range) return null;
  const state = range[2];
  const hit = (state === "FL" ? FL[zip3] : METRO[zip3]) || null;
  if (hit) return { zip3, state, lat: hit[0], lon: hit[1], area: hit[2], precise: true };
  return { zip3, state, lat: range[3], lon: range[4], area: `${STATE_NAMES[state] || state} (${zip3}xx)`, precise: false };
}

export function stateForZip(zip) {
  const i = zip3Info(zip);
  return i ? i.state : null;
}

/** Great-circle miles between two ZIPs' ZIP3 centroids; Infinity when either is unknown. */
export function distanceMiles(zipA, zipB) {
  const a = zip3Info(zipA), b = zip3Info(zipB);
  if (!a || !b) return Infinity;
  if (a.zip3 === b.zip3) return 0;
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A city name -> the nearest ZIP3 area we know ("Tampa, FL" -> Tampa area). Approximate; null when unknown. */
export function findArea(text) {
  const q = String(text || "").toLowerCase().replace(/,?\s+(fl|florida|ga|georgia|tx|texas|la|louisiana|al|nc|sc|ny|ca|co|ok|az)\.?$/, "").replace(/[^a-z .'-]/g, "").trim();
  if (q.length < 3) return null;
  for (const exact of [true, false]) for (const [table, state] of [[FL, "FL"], [METRO, null]]) {
    for (const [zip3, v] of Object.entries(table)) {
      const names = v[2].replace(/ area$/, "").toLowerCase().split(/\s*\/\s*/);
      if (names.some((n) => n === q || (!exact && (n.endsWith(" " + q) || n.startsWith(q + " "))))) {
        return { zip3, lat: v[0], lon: v[1], label: v[2], state: state || zip3Info(zip3 + "00").state };
      }
    }
  }
  return null;
}
