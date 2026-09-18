// GET/POST the same "settings" Blob orders-create.js/orders-remaining.js
// read — lets the admin flip the kill switch (paused) or edit the daily
// order cap with no deploy, per the brief.
import { getStore, connectLambda } from "@netlify/blobs";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { normalizeBatchHour, DEFAULT_BATCH_HOUR } from "./_peru-time.js";

const DEFAULT_SETTINGS = { paused: false, dailyCap: 40, batchHour: DEFAULT_BATCH_HOUR };

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const email = await getSessionEmail(event);
  if (!isAdmin(email)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "No autorizado" }) };
  }

  const settingsStore = getStore("settings");

  if (event.httpMethod === "GET") {
    try {
      const settings = (await settingsStore.get("global", { type: "json" })) || DEFAULT_SETTINGS;
      // Settings blobs written before batchHour existed have no such key;
      // normalize on read so the admin UI never shows a blank hour.
      settings.batchHour = normalizeBatchHour(settings.batchHour);
      return { statusCode: 200, headers, body: JSON.stringify(settings) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "JSON inválido" }) };
    }
    const dailyCap = Number.isFinite(Number(body.dailyCap)) && Number(body.dailyCap) >= 0 ? Number(body.dailyCap) : DEFAULT_SETTINGS.dailyCap;
    const paused = Boolean(body.paused);
    // Batch hour is Peru local time (the batch runs at 09:00 PET by
    // default); normalizeBatchHour falls back rather than clamping, so a
    // bad value can never quietly reschedule the batch.
    const batchHour = normalizeBatchHour(body.batchHour);
    try {
      await settingsStore.setJSON("global", { paused, dailyCap, batchHour });
      return { statusCode: 200, headers, body: JSON.stringify({ paused, dailyCap, batchHour }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
}
