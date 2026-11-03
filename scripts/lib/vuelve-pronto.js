/* VUELVE PRONTO for the order endpoint, the restock-interest function and
   the Muse connector: the one rule in /vuelve-pronto.js (a plain script,
   like /off-sale.js), re-exported, reading the full keys the build wrote
   (scripts/build-vuelve-pronto.mjs -> vuelve-pronto-data.js) instead of
   the pages' hashes. Read /vuelve-pronto.js for the rule. */
import "./off-sale.js";
import "../../vuelve-pronto.js";
import { VUELVE_PRONTO } from "./vuelve-pronto-data.js";

const api = globalThis.AriaVuelvePronto;
api.useKeys(VUELVE_PRONTO);

export const VUELVE_PRONTO_LABEL = api.LABEL;
export const VUELVE_PRONTO_LINE_NOTE = api.LINE_NOTE;
export const vuelveProntoKey = api.key;
/** Sold out at its store: a record ({ retailer, name, so, v }) or a line ({ retailer, title, variantId }). */
export const isVuelvePronto = api.isSoldOut;
/** The order lines that may not be sold now. */
export const vuelveProntoLines = api.soldOutLines;
export const vuelveProntoOrderError = api.orderError;
