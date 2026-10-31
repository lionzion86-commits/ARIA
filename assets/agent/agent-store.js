/* ==================================================================
   COMPRADORES -- where the day's state lives in Phase 1.

   DEMO: one shared day in this browser's localStorage, so agente.html and
   admin-agentes.html opened side by side show each other's moves (the
   admin board updates when an agent buys). LIVE (an invited agent signed
   in): the queue comes from /.netlify/functions/agent-queue and her moves
   are kept in this browser only -- Phase 2 writes them to the orders
   store. Every storage call is wrapped: a private window or blocked
   storage still runs the dashboard, it just forgets on reload.
   ================================================================== */
import { buildDay } from "./agent-core.js";
import { SAMPLE_BATCH } from "./sample-batch.js";

export const DEMO_KEY = "aria-compradores-demo-v1";

let memory = {};
function read(key) {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch { /* storage off */ }
  return memory[key] ? JSON.parse(memory[key]) : null;
}
function write(key, value) {
  const s = JSON.stringify(value);
  memory[key] = s;
  try { localStorage.setItem(key, s); } catch { /* storage off: memory only */ }
}

/** The demo day: today's saved one, or a fresh split of the sample batch. */
export function loadDemoDay() {
  const saved = read(DEMO_KEY);
  if (saved && saved.date === SAMPLE_BATCH.date && saved.version === 1) return saved;
  return resetDemoDay();
}
export function resetDemoDay() {
  const day = buildDay(SAMPLE_BATCH);
  day.version = 1;
  write(DEMO_KEY, day);
  return day;
}
export function saveDay(day, key = DEMO_KEY) { write(key, day); }
export function loadDay(key) { return read(key); }

/** Re-render when the other page changes the shared day. */
export function onDayChange(fn, key = DEMO_KEY) {
  try { window.addEventListener("storage", (e) => { if (e.key === key && e.newValue) fn(JSON.parse(e.newValue)); }); } catch { /* no window */ }
}
