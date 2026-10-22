/* ============================================================
   THE END OF EVERY CATALOGUE PULL (DSW, Neiman Marcus): Spanish at
   ingest, then the INGEST REPORT and the SHIP / DO NOT SHIP line.
   scripts/lib/pull-quality.js holds the thresholds; this file runs the
   steps that touch the disk.

   SPANISH AT INGEST. The repo's translator
   (scripts/translate-catalog-descriptions.mjs, reads GROQ_API_KEY) runs
   on the written catalogue as part of the build when the key is in the
   environment. Without it the builder says, loudly, that the Spanish
   coverage is what the source gave (0% for an English source) and that
   the catalogue must not ship; the verdict is DO NOT SHIP and the exit
   code is DO_NOT_SHIP_EXIT.
   ============================================================ */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coverageOf, verdictOf, formatReport } from "./pull-quality.js";

export const DO_NOT_SHIP_EXIT = 4;

export function hasGroqKey(env = process.env) {
  return Boolean(String(env.GROQ_API_KEY || "").trim());
}

/** Run the translator on one written catalogue file. */
export function runTranslation(file, { root, env = process.env } = {}) {
  if (!hasGroqKey(env)) return { ran: false, ok: false, reason: "GROQ_API_KEY is not set: the translation step did not run" };
  try {
    execFileSync(process.execPath, [join(root, "scripts/translate-catalog-descriptions.mjs"), "--strict", file], { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] });
    return { ran: true, ok: true };
  } catch (err) {
    return { ran: true, ok: false, reason: `the translation step failed (exit ${err.status ?? "?"})` };
  }
}

/**
 * Print the INGEST REPORT for a catalogue and return the verdict.
 *   stage: "dry-run" (nothing written yet: steps that run at write are
 *          explained, not counted) or "written" (the file as it stands).
 */
export function reportCatalog({ label, key, catalog, rows, explain = {}, stage, weightEstimates = true, translation = null, env = process.env, log = console.log }) {
  const ex = { ...explain };
  const notes = [];
  if (stage === "dry-run") {
    if (weightEstimates && !ex.weight) ex.weight = "apply-weight-estimates.py fills unpublished weights at write (flagged weightEstimated)";
    if (hasGroqKey(env) && !ex.es) ex.es = "GROQ_API_KEY is set: translate-catalog-descriptions.mjs runs at write";
  }
  const cov = coverageOf(catalog, key, { rows });
  const v = verdictOf(cov, { explain: ex });
  const esShare = (100 * cov.shares.es).toFixed(1) + "%";
  if (!hasGroqKey(env)) {
    notes.push(`ES description coverage is ${esShare}: GROQ_API_KEY is not set, so the Spanish step did not run. This catalogue must not ship until it does.`);
  } else if (translation && !translation.ok) {
    notes.push(`ES description coverage is ${esShare}: ${translation.reason}. This catalogue must not ship until it runs.`);
  }
  if (cov.counts.described < cov.published) notes.push(`${cov.published - cov.counts.described} published products carry no source description at all (nothing to translate; never written for them).`);
  log(formatReport(label, cov, v, { notes }));
  return { coverage: cov, verdict: v };
}

/** Re-read a written catalogue (after the weight and translation steps). */
export function readCatalog(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
