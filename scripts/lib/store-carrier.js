/* This module re-exports /store-carrier.js (USPS exposure, the alert, the
   widened window and the store's own paid tiers; see its header) with its
   generated data, /store-carrier-data.js, for checkout's server side and
   the tests. */
import "../../store-carrier-data.js";
import "../../store-carrier.js";

const api = globalThis.AriaStoreCarrier;
export const STORE_CARRIER = api;
export const CARRIER_DATA = api.data();
export const WIDEN_DAYS = api.WIDEN_DAYS;
export const ALERT_USPS = api.ALERT_USPS;
export const ALERT_MIXED = api.ALERT_MIXED;
export const ALERT_GROUP1 = api.ALERT_GROUP1;
export const PRICE_AT_STORE = api.PRICE_AT_STORE;
export const carrierOf = api.carrierOf;
export const carrierClassOf = api.classOf;
export const isUspsExposed = api.isExposed;
export const hasCarrierOptions = api.hasOptions;
export const carrierAlertLines = api.alertLines;
export const widenDelivery = api.widen;
export const carrierWindowOf = api.windowOf;
export const carrierWindowLineEs = api.windowLineEs;
export const carrierOptionsFor = api.optionsFor;
export const applyCarrierTier = api.applyTier;
export const carrierOrderChoice = api.orderChoice;
export const sanitizeCarrierTiers = api.sanitizeTiers;
export const exposedStores = api.exposedStores;
