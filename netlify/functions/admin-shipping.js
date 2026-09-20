/* ============================================================
   THE OPS ENDPOINT FOR SHIPPING — one door, one auth gate.

   GET   -> { providers, settings, shipments, rollup, blocked }
   POST  -> { action, ... }
             setProviderEnabled  enable/disable a courier
             setPrimary          which courier Phase 1 routes to
             createShipment      mint a shipment and route it
             updateStatus        record pickup / customs / reparto / entrega
             overrideProvider    move a shipment to another courier
             confirmDelivery     read the delivery confirmation back
             cancel              cancel, if the courier still can

   Everything here is admin-gated the same way admin-orders-* is: a real
   session cookie whose email is on ADMIN_EMAILS. Never a client-claimed
   identity.

   THIS IS THE ONLY PLACE INTERNAL COURIER COST IS EVER SERVED, and it is
   served behind that gate because margin visibility is the reason ops
   asked for the dashboard. The customer-facing endpoint is
   shipment-track.js, which shares no code path with this one and returns
   an allowlisted view with no cost, no courier and no tracking number.
   ============================================================ */

import { connectLambda } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { getSessionEmail, isAdmin, corsHeaders } from "./_auth-helpers.js";
import { peruDateKey } from "./_peru-time.js";
import { normalizeShipment } from "./_shipping/provider.js";
import {
  providerRows, selectProvider, buildProvider, enabledProviderKeys,
  NoProviderError, PROVIDER_REGISTRY,
} from "./_shipping/registry.js";
import {
  applyStatusUpdate, dailyRollup, makeShipmentId, manifestCsv,
} from "./_shipping/service.js";
import {
  readShippingSettings, writeShippingSettings, readShipment, writeShipment,
  listShipments, readShipmentByTracking,
} from "./_shipping/store.js";

const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

/** Adapters read ops-recorded state through this; see avi-adapter.js. */
const adapterDeps = { readShipmentByTracking };

export async function handler(event) {
  connectLambda(event);
  const headers = corsHeaders("GET, POST, OPTIONS");

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const email = await getSessionEmail(event);
  if (!isAdmin(email)) return json(403, headers, { error: "No autorizado" });

  try {
    if (event.httpMethod === "GET") return await handleGet(event, headers);
    if (event.httpMethod === "POST") return await handlePost(event, headers, email);
    return json(405, headers, { error: "Method not allowed" });
  } catch (error) {
    if (error instanceof NoProviderError) {
      // 409, not 500: nothing is broken, the system is refusing on
      // purpose and the message says what to do about it.
      return json(409, headers, { error: error.message, code: error.code });
    }
    return json(500, headers, { error: error.message });
  }
}

async function handleGet(event, headers) {
  const settings = await readShippingSettings();
  const shipments = await listShipments();

  // The CSV the operator hands AVI. Same endpoint, because it is the same
  // data and the same permission; `?format=csv` keeps it one round trip.
  if ((event.queryStringParameters?.format || "") === "csv") {
    const wanted = (event.queryStringParameters?.status || "created").split(",").filter(Boolean);
    const rows = shipments.filter((s) => wanted.includes(s.status));
    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="manifiesto-${peruDateKey()}.csv"`,
      },
      body: manifestCsv(rows),
    };
  }

  const enabled = enabledProviderKeys(settings);
  return json(200, headers, {
    providers: providerRows(settings),
    settings,
    shipments,
    rollup: dailyRollup(shipments),
    /* The dashboard's standing warning. Computed here rather than in the
       page so the page cannot be wrong about it: if this says blocked,
       createShipment is genuinely refusing right now. */
    blocked: enabled.length === 0
      ? "No hay ningún courier activo — la creación de envíos está bloqueada."
      : null,
  });
}

async function handlePost(event, headers, email) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, headers, { error: "JSON inválido" });
  }

  const action = String(body.action || "");
  const settings = await readShippingSettings();

  switch (action) {
    case "setProviderEnabled": {
      const key = String(body.provider || "");
      if (!PROVIDER_REGISTRY[key]) return json(400, headers, { error: `Courier desconocido: "${key}".` });
      const next = await writeShippingSettings({
        ...settings,
        enabled: { ...settings.enabled, [key]: Boolean(body.enabled) },
      });
      const stillOn = enabledProviderKeys(next);
      return json(200, headers, {
        ok: true,
        settings: next,
        providers: providerRows(next),
        /* Disabling the last courier is allowed — an operator may need to
           stop the world — but it is never silent. The next createShipment
           will refuse, and this tells them so at the moment they do it
           rather than when the first order fails. */
        blocked: stillOn.length === 0
          ? "Desactivaste el último courier activo. No se crearán envíos nuevos hasta que actives uno."
          : null,
      });
    }

    case "setPrimary": {
      const key = String(body.provider || "");
      if (!PROVIDER_REGISTRY[key]) return json(400, headers, { error: `Courier desconocido: "${key}".` });
      const next = await writeShippingSettings({ ...settings, primary: key });
      return json(200, headers, { ok: true, settings: next, providers: providerRows(next) });
    }

    case "createShipment": {
      const { shipment: model, errors } = normalizeShipment(body.shipment || {});
      if (errors.length) return json(400, headers, { error: errors[0], errors });

      // Throws NoProviderError -> 409. Fail closed: no courier, no box.
      const routed = selectProvider(settings, { override: body.provider });
      const adapter = buildProvider(routed.key, adapterDeps);

      const quote = await adapter.quote(model);
      const created = await adapter.createShipment(model);

      const dateKey = peruDateKey();
      const shipmentId = makeShipmentId(dateKey, randomBytes(2).toString("hex"));
      const now = new Date().toISOString();

      const shipment = {
        ...model,
        shipmentId,
        createdAt: now,
        updatedAt: now,
        provider: routed.key,
        routingReason: routed.reason,
        providerShipmentId: created.providerShipmentId,
        trackingNumber: created.trackingNumber,
        labelUrl: created.labelUrl || null,
        manifestRequired: Boolean(created.manifestRequired),
        transitDaysMin: quote.transitDaysMin ?? null,
        transitDaysMax: quote.transitDaysMax ?? null,
        /* INTERNAL. Recorded per shipment for margin tracking, served
           only by this admin endpoint, never by shipment-track.js. */
        internalCostUsd: quote.costUsd,
        internalCostEstimated: Boolean(quote.estimated),
        chargedFreightUsd: Number.isFinite(Number(body.chargedFreightUsd))
          ? Math.round(Number(body.chargedFreightUsd) * 100) / 100
          : null,
        status: null,
        statusHistory: [],
      };

      const opened = applyStatusUpdate(shipment, {
        status: "created", by: email, note: routed.reason,
      });
      await writeShipment(opened.shipment);
      return json(200, headers, { ok: true, shipment: opened.shipment });
    }

    case "updateStatus": {
      const shipment = await readShipment(body.shipmentId);
      if (!shipment) return json(404, headers, { error: "Envío no encontrado" });
      const result = applyStatusUpdate(shipment, {
        status: body.status, note: body.note, raw: body.raw, by: email,
      });
      await writeShipment(result.shipment);
      return json(200, headers, {
        ok: true, shipment: result.shipment, changed: result.changed, rejected: result.rejected,
      });
    }

    case "overrideProvider": {
      const shipment = await readShipment(body.shipmentId);
      if (!shipment) return json(404, headers, { error: "Envío no encontrado" });
      // Same fail-closed check as creation: an override onto a disabled
      // courier is exactly the misroute this must not allow.
      const routed = selectProvider(settings, { override: String(body.provider || "") });
      const adapter = buildProvider(routed.key, adapterDeps);
      const quote = await adapter.quote(shipment);
      const created = await adapter.createShipment(shipment);
      const moved = {
        ...shipment,
        provider: routed.key,
        routingReason: `${routed.reason} (movido desde ${shipment.provider} por ${email})`,
        providerShipmentId: created.providerShipmentId,
        trackingNumber: created.trackingNumber,
        labelUrl: created.labelUrl || null,
        internalCostUsd: quote.costUsd,
        internalCostEstimated: Boolean(quote.estimated),
        transitDaysMin: quote.transitDaysMin ?? null,
        transitDaysMax: quote.transitDaysMax ?? null,
        updatedAt: new Date().toISOString(),
      };
      await writeShipment(moved);
      return json(200, headers, { ok: true, shipment: moved });
    }

    case "confirmDelivery": {
      const shipment = await readShipment(body.shipmentId);
      if (!shipment) return json(404, headers, { error: "Envío no encontrado" });
      const adapter = buildProvider(shipment.provider, adapterDeps);
      const confirmation = await adapter.confirmDelivery(shipment.trackingNumber);
      return json(200, headers, { ok: true, confirmation });
    }

    case "cancel": {
      const shipment = await readShipment(body.shipmentId);
      if (!shipment) return json(404, headers, { error: "Envío no encontrado" });
      const adapter = buildProvider(shipment.provider, adapterDeps);
      const cancellable = await adapter.cancel(shipment.providerShipmentId);
      if (!cancellable) {
        return json(409, headers, {
          error: "El courier ya no puede cancelar este envío. Gestiónalo con ellos directamente.",
        });
      }
      const result = applyStatusUpdate(shipment, {
        status: "cancelled", by: email, note: String(body.note || "Cancelado por ops"),
      });
      await writeShipment(result.shipment);
      return json(200, headers, { ok: true, shipment: result.shipment });
    }

    default:
      return json(400, headers, { error: `Acción desconocida: "${action}".` });
  }
}
