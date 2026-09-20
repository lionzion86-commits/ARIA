/* Maps a workflow trigger to a refresh tier, and prints it as GitHub
   Actions step outputs.
 *
 * GitHub gives a scheduled run the cron line that fired it
 * (github.event.schedule) and nothing else, so this is the one place
 * that turns "0 13 * / 3 * *" back into "the catalogue tier". Doing it in
 * JS rather than in shell keeps the cron-to-tier mapping in
 * scripts/lib/refresh-tiers.js, where the run counts and the budget
 * guard already live — one source of truth, and a test asserts the
 * workflow's cron lines still match it.
 *
 * Usage (in the workflow):  node scripts/resolve-refresh-tier.js >> "$GITHUB_OUTPUT"
 */
import { tierForCron, tierFor, REFRESH_TIERS } from "./lib/refresh-tiers.js";

const schedule = (process.env.SCHEDULE || "").trim();
const manual = (process.env.MANUAL || "").trim();

// A hand-run (workflow_dispatch) names its tier outright; a scheduled run
// is identified by the cron line that fired it.
const key = manual || tierForCron(schedule);
const tier = tierFor(key);

if (!tier) {
  console.error(
    `No pude resolver el tier.\n` +
      `  schedule: ${JSON.stringify(schedule)}\n` +
      `  manual:   ${JSON.stringify(manual)}\n` +
      `  known crons: ${Object.values(REFRESH_TIERS).map((t) => `${t.key}="${t.cron}"`).join(", ")}\n` +
      `Si cambiaste el cron en el workflow, cambia también scripts/lib/refresh-tiers.js.`,
  );
  process.exit(1);
}

process.stdout.write(`tier=${tier.key}\n`);
process.stdout.write(`script=${tier.script}\n`);
process.stdout.write(`label=${tier.label} (${tier.cadence})\n`);
