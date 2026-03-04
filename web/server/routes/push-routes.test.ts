import { vi, describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerPushRoutes } from "./push-routes.js";
import type { PushManager } from "../push-manager.js";

// ─── Mock PushManager ─────────────────────────────────────────────────────

function makeMockPushManager(): PushManager {
  return {
    getPublicKey: vi.fn(() => "test-vapid-public-key"),
    listSubscriptions: vi.fn(() => []),
    addSubscription: vi.fn(),
    removeSubscription: vi.fn(() => true),
    sendPushNotification: vi.fn(async () => {}),
  } as unknown as PushManager;
}

// ─── Test setup ────────────────────────────────────────────────────────────

let app: Hono;
let mockPushManager: PushManager;

beforeEach(() => {
  vi.clearAllMocks();
  mockPushManager = makeMockPushManager();
  app = new Hono();
  const api = new Hono();
  registerPushRoutes(api, mockPushManager);
  app.route("/api", api);
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/push/vapid-key
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/push/vapid-key", () => {
  it("returns the VAPID public key", async () => {
    const res = await app.request("/api/push/vapid-key");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ publicKey: "test-vapid-public-key" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/push/subscribe
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/push/subscribe", () => {
  it("subscribes with valid push subscription data", async () => {
    const sub = {
      endpoint: "https://push.example.com/sub1",
      keys: { p256dh: "key1", auth: "auth1" },
    };

    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockPushManager.addSubscription).toHaveBeenCalledWith(sub);
  });

  it("rejects invalid subscription without endpoint", async () => {
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { p256dh: "k", auth: "a" } }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid push subscription");
  });

  it("rejects empty body", async () => {
    const res = await app.request("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/push/unsubscribe
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/push/unsubscribe", () => {
  it("unsubscribes an existing endpoint", async () => {
    const res = await app.request("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockPushManager.removeSubscription).toHaveBeenCalledWith(
      "https://push.example.com/sub1",
    );
  });

  it("returns 404 for non-existent subscription", async () => {
    vi.mocked(mockPushManager.removeSubscription).mockReturnValue(false);

    const res = await app.request("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/unknown" }),
    });

    expect(res.status).toBe(404);
  });

  it("rejects missing endpoint", async () => {
    const res = await app.request("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/push/test
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/push/test", () => {
  it("sends a test push notification", async () => {
    const res = await app.request("/api/push/test", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockPushManager.sendPushNotification).toHaveBeenCalledWith(
      "Companion",
      "Push notifications are working!",
    );
  });

  it("returns 500 when sending fails", async () => {
    vi.mocked(mockPushManager.sendPushNotification).mockRejectedValue(
      new Error("Push service down"),
    );

    const res = await app.request("/api/push/test", {
      method: "POST",
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Push service down");
  });
});
