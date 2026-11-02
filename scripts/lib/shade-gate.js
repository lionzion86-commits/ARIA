/* THE SHADE GATE for the builders, checkout.html and the Netlify
   functions: the one rule in /shade-gate.js (a plain script, like
   /off-sale.js), re-exported. Read its header for the rule. */
import "../../shade-gate.js";

const api = globalThis.AriaShadeGate;
export const kindOf = api.kindOf;
export const beautyContext = api.beautyContext;
export const isShadeDependent = api.isShadeDependent;
export const lineNeedsShade = api.lineNeedsShade;
export const shadeOrderError = api.shadeOrderError;
export const SHADE_PENDING_NOTE = api.SHADE_PENDING_NOTE;
export const SHADE_PENDING_BUTTON = api.SHADE_PENDING_BUTTON;
/** The order lines that may not be sold: a shade product with no shade. */
export function shadeMissingLines(items) {
  return (Array.isArray(items) ? items : []).filter((it) => api.lineNeedsShade(it));
}
