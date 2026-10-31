/* ============================================================
   THE WORKER'S SIDE OF THE VOICE MEMORY (#443 c.6420805882 rider 3;
   the store is netlify/functions/_voice-thread.js).

   The shopper's thread id and the store's address arrive sealed in the
   shopper's LiveKit token (participant metadata, set by
   /api/voice-token), so nothing the page says can point the worker at
   another thread. Every request carries a short token signed with
   LIVEKIT_API_SECRET, which the worker already holds to join rooms.

   Nothing here may cost the shopper her voice: every call has a short
   timeout and every failure is logged and swallowed. A store that is
   down means a call without server memory (the page's memory stands
   in), never a call without Aria.
   ============================================================ */
import { createHmac } from "node:crypto";
import { cleanHistory } from "./page-bridge.mjs";

export const WORKER_ISSUER = "aria-voice-worker";
export const STORE_TIMEOUT_MS = 2500;
/* Every line goes to the memory as it is said: a shopper who hangs up
   and taps again a few seconds later must find the call she just had
   (the room's own close comes later than that). */
export const FLUSH_EVERY = 1;

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** Same token as _voice-thread.js workerToken(); the tests verify one with the other. */
export function workerToken(secret, thread, now = Math.floor(Date.now() / 1000), ttl = 300) {
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({ iss: WORKER_ISSUER, thread, iat: now, exp: now + ttl });
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}

/** { thread, memoryUrl } from the shopper's participant metadata, or null. */
export function threadFromMetadata(metadata) {
  let m;
  try { m = JSON.parse(String(metadata || "")); } catch { return null; }
  if (!m || !/^[A-Za-z0-9_-]{22}$/.test(String(m.thread || ""))) return null;
  if (!/^https?:\/\/[^\s]+\/api\/voice-thread$/.test(String(m.memoryUrl || ""))) return null;
  return { thread: m.thread, memoryUrl: m.memoryUrl };
}

/**
 * The store client for one call. `fetchImpl` is injectable for tests.
 * Without a thread (an old page, a token minted before this) it is a
 * no-op client: the call works, it is just not remembered.
 */
export function threadStore({ meta, secret, room, fetchImpl = globalThis.fetch, log = () => {} }) {
  const on = !!(meta && secret && fetchImpl);
  const lines = [];   // the whole call, for the corpus
  let pending = [];   // not yet in the live memory
  let chain = Promise.resolve();

  async function call(method, body) {
    const url = method === "GET" ? `${meta.memoryUrl}?thread=${encodeURIComponent(meta.thread)}` : meta.memoryUrl;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), STORE_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        method,
        headers: { Authorization: "Bearer " + workerToken(secret, meta.thread), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error("store answered " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    enabled: on,
    lines,
    /** The thread's last turns as chat history ([] when there are none or the store failed). */
    async history() {
      if (!on) return [];
      try {
        const out = await call("GET");
        return cleanHistory((out.turns || []).map((t) => ({ role: t.role, content: t.text })));
      } catch (e) {
        log("memory-read-failed", { room, error: e.message });
        return [];
      }
    },
    /** One spoken line: kept for the corpus, and written to the memory every FLUSH_EVERY lines. */
    say(role, text) {
      const t = String(text || "").trim();
      if (!t) return;
      const line = { role, text: t, at: new Date().toISOString() };
      lines.push(line);
      pending.push(line);
      if (on && pending.length >= FLUSH_EVERY) this.flush();
    },
    /** Write what the memory has not seen yet; calls are serialized so lines keep their order. */
    flush() {
      if (!on || !pending.length) return chain;
      const batch = pending;
      pending = [];
      chain = chain.then(() => call("POST", { thread: meta.thread, room, lines: batch }))
        .catch((e) => log("memory-write-failed", { room, error: e.message, lines: batch.length }));
      return chain;
    },
    /** The finished call, for review; the memory is flushed first. */
    async finish(summary) {
      if (!on) return;
      await this.flush();
      try {
        await call("POST", { thread: meta.thread, room, call: { ...summary, lines } });
      } catch (e) {
        log("corpus-write-failed", { room, error: e.message, lines: lines.length });
      }
    },
  };
}
