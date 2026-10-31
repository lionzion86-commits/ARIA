#!/usr/bin/env node
/* ============================================================
   GATE 1 -- SPANISH NUMBERS (#443 c.6399639486).

   Speaks every phrase in price-phrases.mjs in the cast voice, hears it
   with the production ears, and checks that every number survived.
   It runs the worker's own STT and TTS objects (agent.mjs buildEars /
   buildVoice), so it tests exactly what a shopper's call runs -- direct
   keys or LiveKit Inference, whichever the environment configures.

     cd voice-agent && node gates/stt-numbers.mjs
     ARIA_GATE_MIN_ACCURACY=0.95   pass mark (default 0.95)

   Writes reports/voice-gates/stt-numbers-<date>.json at the repo root
   and exits non-zero below the pass mark. Needs the worker's
   environment (config.mjs); without it, says which names are missing.
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeLogger, stt as sttNs } from "@livekit/agents";
import { planFromEnv, planSummary } from "../src/config.mjs";
import { buildEars, buildVoice } from "../src/agent.mjs";
import { PHRASES, scorePhrase, MIN_ACCURACY_DEFAULT } from "./price-phrases.mjs";

const REPORTS = fileURLToPath(new URL("../../reports/voice-gates/", import.meta.url));

/** The cast voice saying `text`, as audio frames. */
async function speak(tts, text) {
  const frames = [];
  const t0 = Date.now();
  let ttfb = null;
  for await (const a of tts.synthesize(text)) {
    if (ttfb == null) ttfb = Date.now() - t0;
    frames.push(a.frame);
  }
  return { frames, ttfb };
}

/** The production ears hearing those frames; the final transcript. */
async function hear(stt, frames) {
  const stream = stt.stream();
  const t0 = Date.now();
  const finals = [];
  const done = (async () => {
    for await (const ev of stream) {
      if (ev.type === sttNs.SpeechEventType.FINAL_TRANSCRIPT && ev.alternatives && ev.alternatives[0]) finals.push(ev.alternatives[0].text);
    }
  })();
  for (const f of frames) stream.pushFrame(f);
  stream.endInput();
  await done;
  return { transcript: finals.join(" ").trim(), ms: Date.now() - t0 };
}

async function main() {
  const got = planFromEnv();
  if (!got.ok) {
    console.error(`stt-numbers: missing ${got.missing.join(", ")} (see voice-agent/README.md)`);
    process.exit(2);
  }
  initializeLogger({ pretty: false, level: "warn" });
  const plan = got.plan;
  const ears = buildEars(plan), voice = buildVoice(plan);
  const pass = Number(process.env.ARIA_GATE_MIN_ACCURACY) || MIN_ACCURACY_DEFAULT;
  const rows = [];
  for (const p of PHRASES) {
    const { frames, ttfb } = await speak(voice, p.say);
    const { transcript, ms } = await hear(ears, frames);
    const s = scorePhrase(transcript, p.expect);
    rows.push({ say: p.say, expect: p.expect, transcript, heard: s.heard, ok: s.ok, ttsTtfbMs: ttfb, sttMs: ms });
    console.log(`${s.ok ? "ok  " : "MISS"} ${p.say}\n      heard: ${transcript}`);
  }
  const accuracy = rows.filter((r) => r.ok).length / rows.length;
  const report = { gate: "stt-numbers", at: new Date().toISOString(), plan: planSummary(plan), accuracy, pass, passed: accuracy >= pass, rows };
  mkdirSync(REPORTS, { recursive: true });
  const file = REPORTS + `stt-numbers-${report.at.slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(report, null, 1));
  console.log(`\n  ${rows.filter((r) => r.ok).length}/${rows.length} phrases exact (${(accuracy * 100).toFixed(1)}%), pass mark ${(pass * 100).toFixed(0)}%: ${report.passed ? "PASSED" : "FAILED"}\n  ${file}`);
  process.exit(report.passed ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
