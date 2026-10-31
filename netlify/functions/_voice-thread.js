/* ============================================================
   THE OWNED VOICE'S MEMORY, IN OUR SYSTEMS (#443 c.6420805882,
   acceptance rider 3: "RETURN WITH MEMORY -- reopening greets with the
   live thread, session memory in OUR systems"; Stage 0 of the own-AI
   goal: "every owned-engine conversation is reviewed and becomes
   corpus").

   One THREAD per shopper device: /api/voice-token mints its id (or
   keeps the one the page brings back) and seals it into the LiveKit
   token, so the worker learns it from LiveKit, never from the page.
   Two records per thread in the "voice-threads" Blobs store:

     thread/<id>              the live memory: the last MEMORY_TURNS
                              lines, read when a call opens so she
                              picks up where the shopper left off
     corpus/<id>/<room>       one finished call, whole: every line,
                              the tools she ran (names and timings,
                              never their output), the plan, latency
                              and cost -- the review queue the
                              training corpus is built from

   Only what was SAID is kept: the shopper's speech as our ears heard
   it and Aria's answers. No recipient, no DNI, no payment data, no
   email -- the order's details never pass through here.

   Only the worker reads or writes, with a short HS256 token signed by
   the LiveKit API secret it already holds (no second secret to mint):
   the page holds the thread id but cannot read the thread with it.
   ============================================================ */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { signJwt } from "./_livekit-token.js";

export const VOICE_THREAD_STORE = "voice-threads";
export const MEMORY_TURNS = 40;
export const MAX_LINE_CHARS = 2000;
export const MAX_SESSION_LINES = 400;
export const WORKER_ISSUER = "aria-voice-worker";
export const WORKER_TOKEN_MAX_TTL_S = 900;

const THREAD_RE = /^[A-Za-z0-9_-]{22}$/;
export const isThreadId = (v) => typeof v === "string" && THREAD_RE.test(v);
export const newThreadId = () => randomBytes(16).toString("base64url");

/** The thread the page brought back, if it is one; otherwise a new one. */
export function threadFor(requested) {
  return isThreadId(requested) ? { thread: requested, resumed: true } : { thread: newThreadId(), resumed: false };
}

/** The worker's token for one thread (voice-agent/src/thread-store.mjs signs the same). */
export function workerToken(secret, thread, now = Math.floor(Date.now() / 1000), ttl = 300) {
  return signJwt({ iss: WORKER_ISSUER, thread, iat: now, exp: now + ttl }, secret);
}

/** The thread a worker token speaks for, or null. */
export function verifyWorkerToken(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const want = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
  let got;
  try { got = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let head, claims;
  try {
    head = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch { return null; }
  if (!head || head.alg !== "HS256") return null;
  if (!claims || claims.iss !== WORKER_ISSUER || !isThreadId(claims.thread)) return null;
  if (!(claims.exp > now) || !(claims.iat <= now + 60) || claims.exp - claims.iat > WORKER_TOKEN_MAX_TTL_S) return null;
  return claims.thread;
}

/** One line of the conversation, or null: only the two speakers' words. */
export function cleanLine(raw) {
  if (!raw || (raw.role !== "user" && raw.role !== "assistant")) return null;
  const text = String(raw.text || "").trim().slice(0, MAX_LINE_CHARS);
  if (!text) return null;
  const at = Number.isFinite(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : new Date().toISOString();
  const line = { role: raw.role, text, at };
  if (raw.room && /^aria-[A-Za-z0-9_-]{1,40}$/.test(raw.room)) line.room = raw.room;
  return line;
}

export async function readThread(store, thread) {
  const rec = await store.get("thread/" + thread, { type: "json" });
  return rec && Array.isArray(rec.turns) ? rec : { thread, turns: [], calls: 0 };
}

/** Append lines to the live memory, keeping the last MEMORY_TURNS. */
export async function appendLines(store, thread, lines, room) {
  const clean = lines.map((l) => cleanLine({ ...l, room })).filter(Boolean);
  if (!clean.length) return { added: 0 };
  const rec = await readThread(store, thread);
  rec.turns = rec.turns.concat(clean).slice(-MEMORY_TURNS);
  rec.updatedAt = new Date().toISOString();
  if (!rec.createdAt) rec.createdAt = rec.updatedAt;
  await store.setJSON("thread/" + thread, rec);
  return { added: clean.length };
}

/** A finished call, whole, for review. */
export async function saveCall(store, thread, room, call) {
  if (!/^aria-[A-Za-z0-9_-]{1,40}$/.test(String(room || ""))) throw new Error("bad room");
  const c = call && typeof call === "object" ? call : {};
  const lines = (Array.isArray(c.lines) ? c.lines : []).slice(0, MAX_SESSION_LINES).map(cleanLine).filter(Boolean);
  const tools = (Array.isArray(c.tools) ? c.tools : []).slice(0, 200)
    .filter((t) => t && typeof t.name === "string")
    .map((t) => ({ name: t.name.slice(0, 60), ms: Number(t.ms) || 0, failed: !!t.failed }));
  const rec = {
    thread,
    room,
    savedAt: new Date().toISOString(),
    review: "pending",
    memory: c.memory === "server" || c.memory === "page" ? c.memory : "none",
    plan: c.plan && typeof c.plan === "object" ? c.plan : null,
    seconds: Number(c.seconds) || 0,
    usd: Number.isFinite(Number(c.usd)) ? Number(c.usd) : null,
    latency: (Array.isArray(c.latency) ? c.latency : []).slice(0, 400),
    tools,
    lines,
  };
  await store.setJSON(`corpus/${thread}/${room}`, rec);
  const mem = await readThread(store, thread);
  mem.calls = (mem.calls || 0) + 1;
  mem.lastCallAt = rec.savedAt;
  await store.setJSON("thread/" + thread, mem);
  return { lines: lines.length, tools: tools.length };
}
