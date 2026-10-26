/* ============================================================
   A LIVEKIT ACCESS TOKEN, SIGNED HERE (#443 owned voice).

   A LiveKit token is a JWT (HS256) signed with the project's API
   secret. Twenty lines of node:crypto instead of livekit-server-sdk,
   because every dependency of a site function ships in every deploy;
   scripts/test/owned-voice-tests.mjs verifies the result with the
   SDK's own TokenVerifier so the two cannot drift.

   The token admits ONE shopper to ONE fresh room and dispatches the
   voice agent into it. The room is small and short-lived on purpose:
   at most the shopper and the agent, and it closes seconds after the
   shopper leaves, so an abandoned call stops costing at once.
   ============================================================ */
import { createHmac, randomBytes } from "node:crypto";

export const TOKEN_TTL_SECONDS = 600;
export const ROOM_DEPARTURE_TIMEOUT_S = 10;
export const ROOM_EMPTY_TIMEOUT_S = 30;
export const ROOM_MAX_PARTICIPANTS = 3;

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

export function signJwt(claims, secret) {
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url(claims);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function newRoomName() {
  return "aria-" + randomBytes(9).toString("base64url");
}

/**
 * The shopper's token for a fresh room with the agent dispatched.
 * `now` is seconds since the epoch, injectable for tests.
 */
export function shopperToken({ apiKey, apiSecret, agentName, room = newRoomName(), identity, now = Math.floor(Date.now() / 1000) }) {
  const who = identity || "shopper-" + randomBytes(6).toString("base64url");
  const claims = {
    iss: apiKey,
    sub: who,
    nbf: now - 5,
    exp: now + TOKEN_TTL_SECONDS,
    video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true },
    roomConfig: {
      name: room,
      emptyTimeout: ROOM_EMPTY_TIMEOUT_S,
      departureTimeout: ROOM_DEPARTURE_TIMEOUT_S,
      maxParticipants: ROOM_MAX_PARTICIPANTS,
      agents: [{ agentName }],
    },
  };
  return { token: signJwt(claims, apiSecret), room, identity: who, expires_at: claims.exp };
}
