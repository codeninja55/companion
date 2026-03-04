// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isPushSupported,
  isPushSubscribed,
  registerPushSubscription,
  unregisterPushSubscription,
} from "./push-notifications.js";

// ─── Mock helpers ─────────────────────────────────────────────────────────

function makeMockSubscription(endpoint = "https://push.example.com/sub1") {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: "key1", auth: "auth1" },
    }),
    unsubscribe: vi.fn(async () => true),
  };
}

function setupPushEnvironment(subscription: ReturnType<typeof makeMockSubscription> | null = null) {
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => makeMockSubscription()),
  };

  const registration = { pushManager } as unknown as ServiceWorkerRegistration;

  Object.defineProperty(navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registration) },
    writable: true,
    configurable: true,
  });

  // Ensure PushManager exists on window
  if (!("PushManager" in window)) {
    Object.defineProperty(window, "PushManager", {
      value: class PushManager {},
      writable: true,
      configurable: true,
    });
  }

  return { pushManager, registration };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("push-notifications", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isPushSupported", () => {
    it("returns true when service worker and PushManager are available", () => {
      setupPushEnvironment();
      expect(isPushSupported()).toBe(true);
    });

    it("returns false when PushManager is not available", () => {
      // Remove PushManager temporarily
      const desc = Object.getOwnPropertyDescriptor(window, "PushManager");
      // @ts-expect-error — intentionally deleting for test
      delete (window as Record<string, unknown>).PushManager;

      expect(isPushSupported()).toBe(false);

      // Restore
      if (desc) Object.defineProperty(window, "PushManager", desc);
    });
  });

  describe("isPushSubscribed", () => {
    it("returns true when a subscription exists", async () => {
      const sub = makeMockSubscription();
      setupPushEnvironment(sub as unknown as ReturnType<typeof makeMockSubscription>);
      const result = await isPushSubscribed();
      expect(result).toBe(true);
    });

    it("returns false when no subscription exists", async () => {
      setupPushEnvironment(null);
      const result = await isPushSubscribed();
      expect(result).toBe(false);
    });
  });

  describe("registerPushSubscription", () => {
    it("subscribes and sends subscription to server", async () => {
      const { pushManager } = setupPushEnvironment();

      const result = await registerPushSubscription("test-vapid-key");

      expect(result).toBe(true);
      expect(pushManager.subscribe).toHaveBeenCalledWith({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      });
      expect(fetchSpy).toHaveBeenCalledWith("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("https://push.example.com/sub1"),
      });
    });

    it("returns false when server responds with error", async () => {
      setupPushEnvironment();
      fetchSpy.mockResolvedValue(new Response("error", { status: 500 }));

      const result = await registerPushSubscription("test-vapid-key");
      expect(result).toBe(false);
    });
  });

  describe("unregisterPushSubscription", () => {
    it("unsubscribes and notifies server", async () => {
      const sub = makeMockSubscription();
      setupPushEnvironment(sub as unknown as ReturnType<typeof makeMockSubscription>);

      const result = await unregisterPushSubscription();

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "https://push.example.com/sub1" }),
      });
      expect(sub.unsubscribe).toHaveBeenCalled();
    });

    it("returns true when no subscription exists", async () => {
      setupPushEnvironment(null);
      const result = await unregisterPushSubscription();
      expect(result).toBe(true);
    });
  });
});
