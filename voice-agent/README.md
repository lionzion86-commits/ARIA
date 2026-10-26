# Aria's owned voice

The owned cascade from #443 (start order c.6416074857, kickoff c.6399639486, scale gate c.6399852356):

```
shopper's mic -> LiveKit -> Deepgram nova-3 (es) -> Aria's brain -> Cartesia (Jacqueline) -> LiveKit -> speaker
```

It sits **behind a flag**. The Realtime voice stays the shop's voice until this one passes its gates. A tap that the owned voice cannot take goes to the Realtime voice, so there is never a tap with no voice at all.

## What runs where

| Piece | Where | File |
|---|---|---|
| Worker: ears, brain, voice | LiveKit Cloud (managed agents), from this folder's `Dockerfile` | `src/agent.mjs`, `src/worker.mjs` |
| Brain: instructions, tools, model | Same modules as the Realtime voice and the chat assistant, bundled | `src/brain.entry.mjs` produces `src/brain.generated.mjs` |
| Her hands (the tools) | The shopper's page, over LiveKit RPC: `executeRealtimeTool`, the same as Realtime | `src/page-bridge.mjs` |
| Token: one shopper, one fresh room, agent dispatched | Netlify function `/api/voice-token` | `netlify/functions/voice-token.js`, `_livekit-token.js` |
| Page side | Loaded only on a mic tap with the flag on | `assets/js/aria-voice-owned.js` plus the vendored `assets/vendor/livekit-client-2.22.4.umd.js` |

**Stateless.** The conversation's memory belongs to the page:
- it is read once over RPC when a session starts;
- each line is written back to the page as it is spoken.

Any worker can therefore serve any session, and scaling means adding workers.

**One plan per worker, failing closed.**
- `src/config.mjs` either holds the full plan or the worker refuses to start. There is no variant ladder.
- Every session logs `session-start` and `session-end`, with the plan, its usage, its latency and its tool calls.

**Doctrine.** The opening nudge, the 10-second silence sign-off, panel-closed and page-hidden all stay in the page, where the Realtime voice already runs them.
- When the page needs a doctrine line, it asks the brain over `aria.cue`.
- The worker owns only the hard cap on session length.
- The greeting waits until the page reports that its speaker is actually playing (`aria.ready`). This is the fix for the clipped greeting.

## Turning it on for a browser

- Open `https://<preview>/?voz=propia`. The setting sticks.
- `?voz=vivo` puts that browser back on the Realtime voice.
- `ariaVoiceDiag().motor` tells you which engine a call is using.

## Environment (names only; values live in the secret stores, never in the repo)

**Netlify** (`/api/voice-token`):
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `ARIA_VOICE_AGENT_NAME` (optional, default `aria`)
- `ARIA_VOICE_OWNED=off` is the kill switch.

**LiveKit Cloud agent secrets** (the worker):

| Name | |
|---|---|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Project "Aria Shop" |
| `ARIA_VOICE_ID` | Cartesia voice id for Jacqueline (Mexican Spanish). Required. |
| `OPENAI_API_KEY`, `GROQ_API_KEY` | The brain, primary and fallback, as for the chat assistant |
| `CARTESIA_API_KEY` | Optional. Without it, TTS goes through LiveKit Inference. |
| `DEEPGRAM_API_KEY` | Optional. Without it, STT goes through LiveKit Inference. |
| `ARIA_VOICE_LANE` | `quality` (default, sonic-3) or `lean` (sonic-turbo) |
| `ARIA_VOICE_MAX_SECONDS` | Default 300 |
| `ARIA_VOICE_READY_WAIT_MS` | Default 3000 |
| `ARIA_VOICE_RATE_*` | Optional per-unit prices (`src/cost.mjs`). With all five set, `session-end` prices each session. Without them it logs usage only. |

## Deploy

```
cd voice-agent
npm install
node scripts/build-brain.mjs     # after any prompt or tool change; the tests fail if it is stale
lk agent create                  # first time, from this folder (managed LiveKit Cloud)
lk agent deploy                  # later versions
```

## Gates (all of them before any production flip)

1. **Spanish numbers.** Run `node gates/stt-numbers.mjs`.
   - It speaks 20 price and size phrases in the cast voice, hears them with the production ears, and requires every number to come through.
   - The pass mark is `ARIA_GATE_MIN_ACCURACY`, default 95%.
2. **Load ladder.** Run `node gates/load-ladder.mjs`.
   - It simulates shoppers at `ARIA_GATE_STEPS` concurrency (default `25,100`) against the deployed agent.
   - It reports join, greeting and reply latency (p50 and p95) and the failure rate.
   - Cost per session comes from the worker's `session-end` lines and the LiveKit dashboard.
3. **Danny's ear test** on a preview, quality lane first. The lean lane auditions separately.

Both gate scripts write their reports to `reports/voice-gates/`.

Tests: `node scripts/test/owned-voice-tests.mjs` (from the repo root; the worker checks need `npm install` in this folder).
