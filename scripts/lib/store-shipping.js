/* This module re-exports /store-shipping.js (the one store-shipping rule;
   see its header) for checkout's server side and the tests. */
import "../../store-shipping.js";

const api = globalThis.AriaStoreShipping;
export const STORE_SHIPPING = api.STORE_SHIPPING;
export const SHIPPING_SALES_TAX_EXEMPT = api.SALES_TAX_EXEMPT;
export const shippingRuleOf = api.ruleOf;
export const shippingRuleText = api.ruleText;
export const storeValueOf = api.storeValueOf;
export const shippingStandingOf = api.standingOf;
export const cartShipping = api.cartShipping;
export const shippingMeterText = api.meterText;
export const shippingStandingText = api.standingText;
export const SHIPPING_LINE_LABEL = api.SHIPPING_LINE_LABEL;
