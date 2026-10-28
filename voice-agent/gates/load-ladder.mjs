#!/usr/bin/env node
/* ============================================================
   GATE 2 -- THE LOAD LADDER (#443 c.6399852356: "load test at stated
   concurrency steps (e.g. 25 -> 100 simultaneous sessions) with latency
   + failure rate reported -- no production flip on demo success
   alone").

   Each simulated shopper does what a phone does: takes a token from
   the same signer /api/voice-token uses, joins a fresh room (the
   deployed agent is dispatched into it), says it is ready to hear,
   waits for the greeting, then says one sentence in the cast voice and
   waits for the answer. Its page answers her tools with a fixed test
   result -- the gate measures the voice, not the catalogue.

   Measured per shopper:
     joinMs     token to agent in the room
     greetMs    ready to the first audible frame of her greeting
     replyMs    end of his sentence to the first audible frame of her
                answer (the number a shopper feels)
   A shopper fails when any of the three never happens.

     cd voice-agent && node gates/load-ladder.mjs
     ARIA_GATE_STEPS=25,100        concurrency steps (default 25,100)
     ARIA_GATE_MAX_FAIL=0.02       failure rate allowed per step

   Cost per session is the worker's: every session logs `session-end`
   with its usage (and its price once the rate variables are set);
   read those lines, and the LiveKit dashboard, for the same window.
   Writes reports/voice-gates/load-ladder-<date>.json.
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Room, RoomEvent, AudioSource, AudioStream, AudioFrame, LocalAudioTrack, TrackPublishOptions, TrackSource, TrackKind, ParticipantKind } from "@livekit/rtc-node";
import { initializeLogger } from "@livekit/agents";
import { planFromEnv, planSummary } from "../src/config.mjs";
import { buildVoice } from "../src/agent.mjs";
import { RPC } from "../src/page-bridge.mjs";
import { shopperToken } from "../../netlify/functions/_livekit-token.js";

const REPORTS = fileURLToPath(new URL("../../reports/voice-gates/", import.meta.url));
export const SENTENCE = "Hola, busco zapatillas Nike para hombre, de menos de cuatrocientos soles.";
export const TEST_TOOL_RESULT = Object.freeze({ items: [{ id: "gate1", title: "Zapatillas de prueba", price_pen: 199, store: "prueba" }], note: "resultado de prueba de carga" });
const AUDIBLE_RMS = 500;
const QUIET_MS = 1200;
const LIMIT_MS = { join: 15000, greet: 15000, reply: 20000 };

export function percentile(xs, p) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
}

export function summarizeStep(n, results) {
  const ok = results.filter((r) => !r.error);
  return {
    sessions: n,
    failed: results.length - ok.length,
    failureRate: (results.length - ok.length) / Math.max(1, results.length),
    joinMs: { p50: percentile(ok.map((r) => r.joinMs), 50), p95: percentile(ok.map((r) => r.joinMs), 95) },
    greetMs: { p50: percentile(ok.map((r) => r.greetMs), 50), p95: percentile(ok.map((r) => r.greetMs), 95) },
    replyMs: { p50: percentile(ok.map((r) => r.replyMs), 50), p95: percentile(ok.map((r) => r.replyMs), 95) },
    errors: results.filter((r) => r.error).map((r) => r.error).slice(0, 10),
  };
}

const rms = (data) => {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / Math.max(1, data.length));
};

/** The sentence as one mono PCM buffer, from the cast voice. */
async function sentencePcm(plan) {
  const tts = buildVoice(plan);
  const parts = [];
  let rate = 24000;
  for await (const a of tts.synthesize(SENTENCE)) { parts.push(a.frame.data); rate = a.frame.sampleRate; }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const pcm = new Int16Array(total);
  let o = 0;
  for (const p of parts) { pcm.set(p, o); o += p.length; }
  return { pcm, rate };
}

/** One simulated shopper. Resolves its measurements, or { error }. */
async function shopper(i, plan, env, speech) {
  const room = new Room();
  const t = shopperToken({ apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, agentName: plan.agentName });
  const r = { i, room: t.room };
  const lp = () => room.localParticipant;
  let agent = null, lastAudible = 0, firstAudibleAfter = (since) => null;
  const audibleAt = [];
  const waitFor = (pred, ms, what) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => { const v = pred(); if (v) return resolve(v); if (Date.now() - t0 > ms) return reject(new Error(`no ${what} in ${ms}ms`)); setTimeout(tick, 20); };
    tick();
  });
  try {
    const t0 = Date.now();
    room.on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      (async () => {
        for await (const f of new AudioStream(track)) {
          if (rms(f.data) > AUDIBLE_RMS) { const now = Date.now(); audibleAt.push(now); lastAudible = now; }
        }
      })().catch(() => {});
    });
    firstAudibleAfter = (since) => audibleAt.find((x) => x >= since) || null;
    await room.connect(env.LIVEKIT_URL, t.token, { autoSubscribe: true, dynacast: false });
    lp().registerRpcMethod(RPC.CONTEXT, async () => JSON.stringify({ history: [] }));
    lp().registerRpcMethod(RPC.TOOL, async () => JSON.stringify(TEST_TOOL_RESULT));
    lp().registerRpcMethod(RPC.TURN, async () => JSON.stringify({ speech: true }));

    /* The microphone: silence, then his sentence, then silence -- a
       steady 10ms pump, as a phone sends. */
    const source = new AudioSource(speech.rate, 1);
    const track = LocalAudioTrack.createAudioTrack("mic", source);
    await lp().publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    const step = Math.round(speech.rate / 100);
    let queue = null, sentenceEnd = 0, pumping = true;
    const silence = new Int16Array(step);
    (async () => {
      while (pumping) {
        let chunk = silence;
        if (queue && queue.o < queue.pcm.length) {
          chunk = queue.pcm.subarray(queue.o, queue.o + step);
          queue.o += step;
          if (queue.o >= queue.pcm.length) sentenceEnd = Date.now() + 1000; /* the source buffers ~1s */
        }
        await source.captureFrame(new AudioFrame(chunk.length === step ? chunk : Int16Array.from({ length: step }, (_, k) => chunk[k] || 0), speech.rate, 1, step));
      }
    })().catch(() => {});

    agent = await waitFor(() => [...room.remoteParticipants.values()].find((p) => p.kind === ParticipantKind.AGENT), LIMIT_MS.join, "agent");
    r.joinMs = Date.now() - t0;
    const readyAt = Date.now();
    await lp().performRpc({ destinationIdentity: agent.identity, method: RPC.READY, payload: "{}" }).catch(() => {});
    const greetAt = await waitFor(() => firstAudibleAfter(readyAt), LIMIT_MS.greet, "greeting");
    r.greetMs = greetAt - readyAt;
    await waitFor(() => (lastAudible && Date.now() - lastAudible > QUIET_MS ? true : null), LIMIT_MS.greet, "end of greeting");

    queue = { pcm: speech.pcm, o: 0 };
    await waitFor(() => (sentenceEnd && Date.now() >= sentenceEnd ? true : null), 20000, "end of sentence");
    const replyAt = await waitFor(() => firstAudibleAfter(sentenceEnd), LIMIT_MS.reply, "reply");
    r.replyMs = replyAt - sentenceEnd;
    pumping = false;
  } catch (e) {
    r.error = e.message;
  } finally {
    try { await room.disconnect(); } catch { /* gone */ }
  }
  return r;
}

async function main() {
  const got = planFromEnv();
  if (!got.ok) {
    console.error(`load-ladder: missing ${got.missing.join(", ")} (see voice-agent/README.md)`);
    process.exit(2);
  }
  initializeLogger({ pretty: false, level: "warn" });
  const env = process.env, plan = got.plan;
  const steps = String(env.ARIA_GATE_STEPS || "25,100").split(",").map(Number).filter((n) => n > 0);
  const maxFail = Number(env.ARIA_GATE_MAX_FAIL) || 0.02;
  const speech = await sentencePcm(plan);
  const report = { gate: "load-ladder", at: new Date().toISOString(), plan: planSummary(plan), sentence: SENTENCE, maxFail, steps: [] };
  for (const n of steps) {
    console.log(`step ${n}: starting ${n} simultaneous sessions`);
    /* Arrivals spread over five seconds, as real taps are. */
    const runs = Array.from({ length: n }, (_, i) => new Promise((res) => setTimeout(res, (i * 5000) / n)).then(() => shopper(i, plan, env, speech)));
    const s = summarizeStep(n, await Promise.all(runs));
    report.steps.push(s);
    console.log(`  failed ${s.failed}/${n}; reply p50 ${s.replyMs.p50}ms p95 ${s.replyMs.p95}ms; greeting p50 ${s.greetMs.p50}ms`);
  }
  report.passed = report.steps.every((s) => s.failureRate <= maxFail);
  mkdirSync(REPORTS, { recursive: true });
  const file = REPORTS + `load-ladder-${report.at.slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify(report, null, 1));
  console.log(`\n  ${report.passed ? "PASSED" : "FAILED"}  ${file}`);
  process.exit(report.passed ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
