import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PushSubscription } from "web-push";

// Mock web-push before importing push-manager
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: "test-public-key",
      privateKey: "test-private-key",
    })),
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// Mock fs operations
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  chmodSync: vi.fn(),
}));

import { PushManager } from "./push-manager.js";
import webpush from "web-push";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";

function makeSub(endpoint: string): PushSubscription {
  return {
    endpoint,
    keys: {
      p256dh: "test-p256dh",
      auth: "test-auth",
    },
  } as PushSubscription;
}

describe("PushManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    vi.mocked(existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("VAPID key management", () => {
    it("generates VAPID keys on first run and persists them", () => {
      const manager = new PushManager();
      expect(webpush.generateVAPIDKeys).toHaveBeenCalledOnce();
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("vapid-keys.json"),
        expect.stringContaining("test-public-key"),
        "utf-8",
      );
      expect(chmodSync).toHaveBeenCalledWith(
        expect.stringContaining("vapid-keys.json"),
        0o600,
      );
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        "mailto:companion@thecompanion.app",
        "test-public-key",
        "test-private-key",
      );
      expect(manager.getPublicKey()).toBe("test-public-key");
    });

    it("loads existing VAPID keys from disk", () => {
      vi.mocked(existsSync).mockImplementation((path) =>
        String(path).includes("vapid-keys.json"),
      );
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ publicKey: "existing-pub", privateKey: "existing-priv" }),
      );

      const manager = new PushManager();
      expect(webpush.generateVAPIDKeys).not.toHaveBeenCalled();
      expect(manager.getPublicKey()).toBe("existing-pub");
      expect(webpush.setVapidDetails).toHaveBeenCalledWith(
        "mailto:companion@thecompanion.app",
        "existing-pub",
        "existing-priv",
      );
    });
  });

  describe("subscription CRUD", () => {
    it("returns empty list when no subscriptions file exists", () => {
      const manager = new PushManager();
      expect(manager.listSubscriptions()).toEqual([]);
    });

    it("adds a subscription", () => {
      const manager = new PushManager();
      const sub = makeSub("https://push.example.com/sub1");

      manager.addSubscription(sub);

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("push-subscriptions.json"),
        expect.stringContaining("https://push.example.com/sub1"),
        "utf-8",
      );
    });

    it("does not add duplicate subscriptions with same endpoint", () => {
      const sub = makeSub("https://push.example.com/dup");
      // After first add, simulate file existing with the subscription
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new PushManager();
      manager.addSubscription(sub);

      // Reset and simulate the subscription already being stored
      vi.mocked(writeFileSync).mockClear();
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify([sub]));

      manager.addSubscription(sub);
      // writeFileSync should not have been called for the duplicate add
      expect(writeFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining("push-subscriptions.json"),
        expect.any(String),
        "utf-8",
      );
    });

    it("removes a subscription by endpoint", () => {
      const sub1 = makeSub("https://push.example.com/sub1");
      const sub2 = makeSub("https://push.example.com/sub2");

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify([sub1, sub2]));

      const manager = new PushManager();
      const removed = manager.removeSubscription("https://push.example.com/sub1");

      expect(removed).toBe(true);
      const written = JSON.parse(
        vi.mocked(writeFileSync).mock.calls.find(
          (c) => String(c[0]).includes("push-subscriptions.json"),
        )![1] as string,
      );
      expect(written).toHaveLength(1);
      expect(written[0].endpoint).toBe("https://push.example.com/sub2");
    });

    it("returns false when removing a non-existent subscription", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify([]));

      const manager = new PushManager();
      const removed = manager.removeSubscription("https://push.example.com/nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("sendPushNotification", () => {
    it("sends notifications to all subscriptions", async () => {
      const sub1 = makeSub("https://push.example.com/sub1");
      const sub2 = makeSub("https://push.example.com/sub2");

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify([sub1, sub2]));
      vi.mocked(webpush.sendNotification).mockResolvedValue({} as any);

      const manager = new PushManager();
      await manager.sendPushNotification("Test Title", "Test Body");

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
      expect(webpush.sendNotification).toHaveBeenCalledWith(
        sub1,
        JSON.stringify({ title: "Test Title", body: "Test Body" }),
      );
    });

    it("does nothing when there are no subscriptions", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const manager = new PushManager();
      await manager.sendPushNotification("Title", "Body");

      expect(webpush.sendNotification).not.toHaveBeenCalled();
    });

    it("prunes subscriptions that return 410 Gone", async () => {
      const sub1 = makeSub("https://push.example.com/active");
      const sub2 = makeSub("https://push.example.com/expired");

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify([sub1, sub2]));

      vi.mocked(webpush.sendNotification).mockImplementation(async (sub) => {
        if ((sub as PushSubscription).endpoint.includes("expired")) {
          const err = new Error("Gone") as Error & { statusCode: number };
          err.statusCode = 410;
          throw err;
        }
        return {} as any;
      });

      const manager = new PushManager();
      await manager.sendPushNotification("Title", "Body");

      // Should write back only the active subscription
      const writeCalls = vi.mocked(writeFileSync).mock.calls.filter(
        (c) => String(c[0]).includes("push-subscriptions.json"),
      );
      const lastWrite = writeCalls[writeCalls.length - 1];
      const saved = JSON.parse(lastWrite[1] as string);
      expect(saved).toHaveLength(1);
      expect(saved[0].endpoint).toBe("https://push.example.com/active");
    });
  });
});
