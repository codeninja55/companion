import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import webpush from "web-push";
import type { PushSubscription } from "web-push";

// ─── Paths ──────────────────────────────────────────────────────────────────

const COMPANION_DIR = join(homedir(), ".companion");
const VAPID_KEYS_PATH = join(COMPANION_DIR, "vapid-keys.json");
const SUBSCRIPTIONS_PATH = join(COMPANION_DIR, "push-subscriptions.json");
const VAPID_SUBJECT = "mailto:companion@thecompanion.app";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(): void {
  mkdirSync(COMPANION_DIR, { recursive: true });
}

function loadVapidKeys(): VapidKeys {
  ensureDir();
  if (existsSync(VAPID_KEYS_PATH)) {
    try {
      const raw = readFileSync(VAPID_KEYS_PATH, "utf-8");
      return JSON.parse(raw) as VapidKeys;
    } catch {
      // Corrupt file — regenerate
    }
  }

  const keys = webpush.generateVAPIDKeys();
  const vapidKeys: VapidKeys = {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
  writeFileSync(VAPID_KEYS_PATH, JSON.stringify(vapidKeys, null, 2), "utf-8");
  chmodSync(VAPID_KEYS_PATH, 0o600);
  return vapidKeys;
}

function loadSubscriptions(): PushSubscription[] {
  ensureDir();
  if (!existsSync(SUBSCRIPTIONS_PATH)) return [];
  try {
    const raw = readFileSync(SUBSCRIPTIONS_PATH, "utf-8");
    return JSON.parse(raw) as PushSubscription[];
  } catch {
    return [];
  }
}

function saveSubscriptions(subs: PushSubscription[]): void {
  ensureDir();
  writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2), "utf-8");
}

// ─── Push Manager ───────────────────────────────────────────────────────────

export class PushManager {
  private vapidKeys: VapidKeys;

  constructor() {
    this.vapidKeys = loadVapidKeys();
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      this.vapidKeys.publicKey,
      this.vapidKeys.privateKey,
    );
  }

  getPublicKey(): string {
    return this.vapidKeys.publicKey;
  }

  listSubscriptions(): PushSubscription[] {
    return loadSubscriptions();
  }

  addSubscription(sub: PushSubscription): void {
    const subs = loadSubscriptions();
    // Avoid duplicates by endpoint
    if (subs.some((s) => s.endpoint === sub.endpoint)) return;
    subs.push(sub);
    saveSubscriptions(subs);
  }

  removeSubscription(endpoint: string): boolean {
    const subs = loadSubscriptions();
    const filtered = subs.filter((s) => s.endpoint !== endpoint);
    if (filtered.length === subs.length) return false;
    saveSubscriptions(filtered);
    return true;
  }

  async sendPushNotification(title: string, body: string): Promise<void> {
    const subs = loadSubscriptions();
    if (subs.length === 0) return;

    const payload = JSON.stringify({ title, body });
    const expired: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err: unknown) {
          // HTTP 410 Gone — subscription is expired, mark for removal
          if (
            err &&
            typeof err === "object" &&
            "statusCode" in err &&
            (err as { statusCode: number }).statusCode === 410
          ) {
            expired.push(sub.endpoint);
          }
        }
      }),
    );

    // Prune expired subscriptions
    if (expired.length > 0) {
      const remaining = loadSubscriptions().filter(
        (s) => !expired.includes(s.endpoint),
      );
      saveSubscriptions(remaining);
    }
  }
}

/** Shared singleton — lazily initialized on first use. */
let _instance: PushManager | null = null;

export function getPushManager(): PushManager {
  if (!_instance) _instance = new PushManager();
  return _instance;
}
