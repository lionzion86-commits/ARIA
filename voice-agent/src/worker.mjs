#!/usr/bin/env node
/* The worker process LiveKit Cloud runs (voice-agent/Dockerfile):
     node src/worker.mjs start     production
     node src/worker.mjs dev       against a project, with reload
   Many sessions per worker, each in its own job process; concurrency
   is LiveKit Cloud's dial (more workers), never a code change. */
import { cli, ServerOptions } from "@livekit/agents";
import { fileURLToPath } from "node:url";
import { planFromEnv, AGENT_NAME_DEFAULT } from "./config.mjs";

const got = planFromEnv();
if (!got.ok) {
  console.error(`[aria-voice] refusing to start: missing ${got.missing.join(", ")}`);
  process.exit(1);
}
cli.runApp(new ServerOptions({
  agent: fileURLToPath(new URL("./agent.mjs", import.meta.url)),
  agentName: process.env.ARIA_VOICE_AGENT_NAME || AGENT_NAME_DEFAULT,
}));
