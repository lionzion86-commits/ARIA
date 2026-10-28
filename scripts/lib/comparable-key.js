/* The key a product's comparables estimate is stored under
   (assets/data/weight-comparables.json). Its own .js module because the
   functions import it: Netlify's default bundler turns .js sources into
   CommonJS but leaves a .mjs as an ES module, and require() of it kills
   the function at load (#443 c.6475013417: every search answered 502).
   scripts/lib/weight-comparables.mjs re-exports it for the build. */
export function comparableKey(retailer, title) {
  return String(retailer || "").toLowerCase() + "::" + String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
}
