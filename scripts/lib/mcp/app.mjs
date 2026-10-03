/* ============================================================
   ONE APP, BOOTED ONCE.

   Building the catalogue takes ~11s and ~300MB: index.html's pricing
   runs over 139,000 raw records and the search index is built on top.
   That is cheap ONCE and ruinous per request, which is the whole
   argument for a long-lived process (see the PR body). Everything here
   is therefore module-level and memoised; the first caller awaits the
   same promise every later caller gets for free.
   ============================================================ */
import { buildCatalog } from "./catalog.mjs";
import { createFxCache } from "./pricing.mjs";
import { createRateLimiter, handleMcpRequest } from "./server.mjs";

let appPromise = null;

export function getApp(opts = {}) {
  if (!appPromise) appPromise = boot(opts);
  return appPromise;
}

async function boot(opts) {
  const t0 = Date.now();
  const catalog = buildCatalog();
  const catalogMs = Date.now() - t0;
  const fx = createFxCache();
  /* Warm the rate so the first shopper is not quoted a null in soles,
     but never block the server on it: a reachable catalogue with no
     exchange rate still answers usefully in dollars. */
  const fxWarm = fx.warm().catch(() => {});
  if (opts.awaitFx) await fxWarm;
  const limiter = createRateLimiter({ limit: opts.rateLimit ?? 60, windowMs: 60_000 });

  const deps = { catalog, fx, limiter, log: opts.log };
  return {
    deps,
    stats: { ...catalog.stats, catalogMs, bootedAt: new Date().toISOString() },
    handle: (req) => handleMcpRequest(req, deps),
  };
}
