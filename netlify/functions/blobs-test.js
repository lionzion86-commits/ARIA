// Temporary — verifies Netlify Blobs works in this deployment before
// building the Aria Auto cache system on top of it. Delete once confirmed.
import { getStore } from "@netlify/blobs";

export async function handler() {
  const headers = { "Content-Type": "application/json" };
  try {
    const store = getStore("auto-cache-test");
    const testValue = { hello: "world", writtenAt: new Date().toISOString() };
    await store.setJSON("ping", testValue);
    const readBack = await store.get("ping", { type: "json" });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ wrote: testValue, readBack, match: JSON.stringify(testValue) === JSON.stringify(readBack) }),
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  }
}
