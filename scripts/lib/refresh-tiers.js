/* ============================================================
   REFRESH TIERS AND THE APIFY SPEND GUARD

   WHY THIS EXISTS: ~$88 IN ONE CYCLE, 1,000+ RUNS.
   No single Apify run is expensive — a cent to six cents. The volume was
   the problem, and it came from two places:

     1. Browsing scraped. Ofertas ran a twelve-actor live scan from the
        VISITOR'S BROWSER whenever the cache was stale, and the cache was
        stale most of the day. That is fixed at the source (index.html no
        longer scrapes at all; see the note on salesFreshnessNote).

     2. Everything refreshed at the same cadence. Deals genuinely move
        daily. A store's general catalogue does not, and a brake pad's
        listing certainly does not — but all of it was being re-scraped
        on the same clock, or would have been as more scripts came
        online.

   SO: TIERS. Each tier names which refresh work runs on which clock, and
   carries an estimate of how many actor runs that costs. The GitHub
   workflow (.github/workflows/refresh-sales-cache.yml) is the ONLY
   scheduler — deliberately no Apify-side schedules, so there is exactly
   one place to look when spend moves and exactly one place to change it.

   AND A BUDGET. Before a cycle spends anything it projects what it is
   about to cost. Over budget, the non-sale tiers are skipped and the
   reason is printed loudly. Silence is how $88 happens.
   ============================================================ */

/* Conservative per-run estimate. The observed range was $0.01-$0.06; the
   guard uses the TOP of it, because a spend guard that under-projects is
   not a guard. Override with APIFY_COST_PER_RUN_USD when the real
   invoice says otherwise. */
export const DEFAULT_COST_PER_RUN_USD = 0.06;

/* What one refresh cycle is allowed to project. $3 a cycle is roughly
   $60/month at the daily tier, against an $88 incident. Override with
   APIFY_CYCLE_BUDGET_USD. */
export const DEFAULT_CYCLE_BUDGET_USD = 3.0;

/**
 * The tiers, in the order a human reads them.
 *
 * `runs` is how many actor runs that tier starts — the number the budget
 * is projected from. Keep it honest: it is the count of sources the
 * corresponding script actually iterates.
 */
export const REFRESH_TIERS = {
  /* Deals move daily and Ofertas is the page that goes stale fastest, so
     this is the one tier that runs every day and the last one the budget
     guard will ever skip. */
  sale: {
    key: "sale",
    label: "Ofertas (deals)",
    script: "scripts/refresh-sales-cache.js",
    cron: "0 12 * * *",
    cadence: "daily",
    runs: 12,
    essential: true,
  },
  /* A store's general catalogue changes slowly — new stock, not new
     prices. Every three days is four fewer runs a week per source than
     daily, for a page nobody experiences as out of date. */
  catalog: {
    key: "catalog",
    label: "Catálogo por departamento",
    script: "scripts/refresh-department-cache.js",
    cron: "0 13 */3 * *",
    cadence: "every 3 days",
    runs: 26,
    essential: false,
  },
  /* A brake pad's listing does not move. Weekly is generous. */
  auto: {
    key: "auto",
    label: "Aria Auto (repuestos)",
    script: "scripts/refresh-auto-cache.js",
    cron: "0 14 * * 1",
    cadence: "weekly (Monday)",
    runs: 40,
    essential: false,
  },
};

/** Which tier a cron expression belongs to, or null. */
export function tierForCron(cron) {
  const hit = Object.values(REFRESH_TIERS).find((t) => t.cron === String(cron || "").trim());
  return hit ? hit.key : null;
}

export function tierFor(key) {
  return REFRESH_TIERS[String(key || "").toLowerCase()] || null;
}

/** What a tier is projected to cost, in dollars. */
export function projectedCostUsd(tierKey, costPerRun = DEFAULT_COST_PER_RUN_USD) {
  const tier = tierFor(tierKey);
  if (!tier) return 0;
  return Math.round(tier.runs * Number(costPerRun) * 100) / 100;
}

/**
 * Should this cycle spend the money?
 *
 * Returns { allowed, projectedUsd, budgetUsd, reason }. A tier marked
 * `essential` is never skipped on budget alone — losing Ofertas entirely
 * is a worse outcome than the overage, and the loud log is what gets a
 * human to look. Everything else yields.
 */
export function spendDecision(tierKey, {
  costPerRun = DEFAULT_COST_PER_RUN_USD,
  budgetUsd = DEFAULT_CYCLE_BUDGET_USD,
  alreadySpentUsd = 0,
} = {}) {
  const tier = tierFor(tierKey);
  if (!tier) {
    return { allowed: false, projectedUsd: 0, budgetUsd, reason: `tier desconocido: "${tierKey}"` };
  }
  const projectedUsd = projectedCostUsd(tierKey, costPerRun);
  const total = Math.round((projectedUsd + Number(alreadySpentUsd || 0)) * 100) / 100;
  if (total <= budgetUsd) {
    return { allowed: true, projectedUsd, budgetUsd, reason: null };
  }
  if (tier.essential) {
    return {
      allowed: true,
      projectedUsd,
      budgetUsd,
      overBudget: true,
      reason: `PROYECCIÓN SOBRE PRESUPUESTO ($${total} > $${budgetUsd}) pero "${tier.label}" es esencial — se ejecuta igual. Revisa el presupuesto.`,
    };
  }
  return {
    allowed: false,
    projectedUsd,
    budgetUsd,
    overBudget: true,
    reason: `PROYECCIÓN SOBRE PRESUPUESTO ($${total} > $${budgetUsd}) — se omite "${tier.label}". Ajusta APIFY_CYCLE_BUDGET_USD o reduce la cadencia.`,
  };
}

/** Budget numbers from the environment, falling back to the defaults. */
export function budgetFromEnv(env = process.env) {
  const num = (raw, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    costPerRun: num(env.APIFY_COST_PER_RUN_USD, DEFAULT_COST_PER_RUN_USD),
    budgetUsd: num(env.APIFY_CYCLE_BUDGET_USD, DEFAULT_CYCLE_BUDGET_USD),
  };
}
