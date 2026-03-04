import type { Hono } from "hono";
import type { PushManager } from "../push-manager.js";

export function registerPushRoutes(api: Hono, pushManager: PushManager): void {
  api.get("/push/vapid-key", (c) => {
    return c.json({ publicKey: pushManager.getPublicKey() });
  });

  api.post("/push/subscribe", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.endpoint) {
      return c.json({ error: "Invalid push subscription" }, 400);
    }
    try {
      pushManager.addSubscription(body);
      return c.json({ ok: true });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.post("/push/unsubscribe", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.endpoint) {
      return c.json({ error: "Endpoint is required" }, 400);
    }
    const removed = pushManager.removeSubscription(body.endpoint);
    if (!removed) return c.json({ error: "Subscription not found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/push/test", async (c) => {
    try {
      await pushManager.sendPushNotification(
        "Companion",
        "Push notifications are working!",
      );
      return c.json({ ok: true });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });
}
