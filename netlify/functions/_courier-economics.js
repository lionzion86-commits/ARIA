// AVI Courier's internal economics. SERVER ONLY.
//
// These used to live in weight-data.js, which checkout.html imports as an
// ES module — meaning the browser downloads that file and anyone could
// read our courier cost and per-kg margin from view-source. The file's own
// comment forbade importing them into the frontend, but the values shipped
// with it regardless. Moved here, to a function-only module (underscore
// prefix = Netlify never deploys it as an endpoint), so nothing
// customer-facing carries them.
//
// Overridable by environment variable so the real figures need not be
// committed at all; the fallbacks keep the quote function working if the
// variables are unset.
//
// NEVER import this from index.html, checkout.html, weight-data.js or any
// scripts/lib module that customer-facing code reaches. Only
// CHARGE_PER_KG ($13, the rate actually charged and shown) belongs there.

export const COST_PER_KG = Number(process.env.AVI_COST_PER_KG) || 9;
export const PROFIT_PER_KG = Number(process.env.AVI_PROFIT_PER_KG) || 4;
