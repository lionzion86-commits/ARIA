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
| Memory and call log (ours) | Netlify Blobs store `voice-threads`, behind `/api/voice-thread` (worker only) | `src/thread-store.mjs`; `netlify/functions/voice-thread.js`, `_voice-thread.js` |

**Stateless, with the memory in our systems** (#443 rider 3):
- `/api/voice-token` gives each device a thread id (the page keeps it and brings it back) and seals the thread and the store's address into the LiveKit token. The worker reads them from the shopper's participant metadata, never from the page.
- When a call opens, the worker reads the thread's last lines from `/api/voice-thread`. A returning shopper is greeted with the thread (`RETURN_GREETING_INSTRUCTIONS`). The page's own memory stands in only when the store has nothing.
- Every spoken line, the shopper's and Aria's, is written to the thread as it is said. The store keeps the last 40.
- When the call ends, it is saved whole under `corpus/<thread>/<room>` with `review: "pending"`: the lines, the tools run (names and timings only), the plan, latency and cost. That is the review queue for the training corpus.
- Only the spoken words are kept: no recipient, DNI, payment data or email.
- The worker signs its requests with `LIVEKIT_API_SECRET`, which it already holds, so no new secret is needed. The page cannot read a thread.
- A store that is down costs the call its memory, never its voice.

Any worker can therefore serve any session, and scaling means adding workers.

**One plan per worker, failing closed.**
- `src/config.mjs` either holds the full plan or the worker refuses to start. There is no variant ladder.
- Every session logs `session-start` and `session-end`, with the plan, its usage, its latency and its tool calls.

**Doctrine.** The opening nudge, the 10-second silence sign-off, panel-closed and page-hidden all stay in the page, where the Realtime voice already runs them.
- When the page needs a doctrine line, it asks the brain over `aria.cue`.
- The worker owns only the hard cap on session length.
- The greeting waits until the page reports that its speaker is actually playing (`aria.ready`). This is the fix for the clipped greeting.

**Ear tests 1 and 2 (#443, 2026-10-26).**
- *Silence and hang-ups.* The page's 10-second silence clock stops while she is thinking or speaking. It is held while the shopper talks: the worker forwards our VAD's user state over `aria.user`. It restarts only when she hands the floor back. A silence goodbye that lands inside anyone's turn is refused.
- *Interruptions.* An interruption needs at least 2 transcribed words over 600 ms (`INTERRUPTION` in `src/agent.mjs`). One with no words within 1.5 s resumes her sentence.
- *Opening.*
  - The worker looks the shopper up itself (`get_current_user`, plus `get_order_history` for a member) while the room comes up.
  - A guest with no thread hears the rules' own opening line straight from the voice, with no model turn. A member or a returning shopper gets one model turn, told the lookup is done.
  - Our thread and the lookup are awaited only alongside the speaker-ready wait, never before `session.start`.
- *Startup budget.* The worker logs `spinup` at her first audio: ms from job start to connected, joined, context, sessionStart, memory, facts, ready, greeting and firstAudio. The page's `ariaVoiceDiag()` covers tap → token → room.
- *Tap feedback.* The tap shows "Conectando con Aria…" in the same frame. The page warms the client and a room token when the chat opens. No room exists, and nothing is billed, until the tap connects.
- *Cards.* Product ids in a `[[SHOW: …]]` line are never spoken; they go to the page over `aria.show`, which puts up any card not already on screen. `open_product` on a product with no card tells her to search for it by name, never to say she no longer has it.

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
- `/api/voice-thread` uses `LIVEKIT_API_SECRET` and the site's Blobs. Netlify's own `URL` / `DEPLOY_PRIME_URL` give the store's address, so a preview's calls stay in the preview's store.

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
