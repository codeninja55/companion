import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RemoteProfile = {
  slug: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "key" | "password";
  keyPath?: string;
  createdAt: number;
  updatedAt: number;
};

export interface RemoteProfileCreateFields {
  name: string;
  host: string;
  port?: number;
  username: string;
  authMethod: "key" | "password";
  keyPath?: string;
}

export interface RemoteProfileUpdateFields {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  authMethod?: "key" | "password";
  keyPath?: string;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const HOST_PATTERN = /^[a-zA-Z0-9._\-]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._\-@]+$/;

export function validateHost(host: string): boolean {
  return HOST_PATTERN.test(host) && host.length > 0 && host.length <= 253;
}

export function validatePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function validateUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username) && username.length > 0 && username.length <= 64;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const COMPANION_DIR = join(homedir(), ".companion");
const REMOTES_DIR = join(COMPANION_DIR, "remotes");

/** Allow overriding the directory for testing. */
let remotesDir = REMOTES_DIR;

export function setRemotesDir(dir: string): void {
  remotesDir = dir;
}

export function resetRemotesDir(): void {
  remotesDir = REMOTES_DIR;
}

function ensureDir(): void {
  mkdirSync(remotesDir, { recursive: true });
}

function filePath(slug: string): string {
  return join(remotesDir, `${slug}.json`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function listProfiles(): RemoteProfile[] {
  ensureDir();
  try {
    const files = readdirSync(remotesDir).filter((f) => f.endsWith(".json"));
    const profiles: RemoteProfile[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(remotesDir, file), "utf-8");
        profiles.push(JSON.parse(raw));
      } catch {
        // Skip corrupt files
      }
    }
    profiles.sort((a, b) => a.name.localeCompare(b.name));
    return profiles;
  } catch {
    return [];
  }
}

export function getProfile(slug: string): RemoteProfile | null {
  ensureDir();
  try {
    const raw = readFileSync(filePath(slug), "utf-8");
    return JSON.parse(raw) as RemoteProfile;
  } catch {
    return null;
  }
}

export function createProfile(data: RemoteProfileCreateFields): RemoteProfile {
  if (!data.name || !data.name.trim()) {
    throw new Error("Profile name is required");
  }
  if (!data.host || !validateHost(data.host)) {
    throw new Error("Invalid host: only alphanumeric, dots, hyphens, and underscores allowed");
  }
  if (!data.username || !validateUsername(data.username)) {
    throw new Error("Invalid username: only alphanumeric, dots, hyphens, underscores, and @ allowed");
  }
  const port = data.port ?? 22;
  if (!validatePort(port)) {
    throw new Error("Invalid port: must be 1-65535");
  }

  const slug = slugify(data.name.trim());
  if (!slug) {
    throw new Error("Profile name must contain alphanumeric characters");
  }

  ensureDir();
  if (existsSync(filePath(slug))) {
    throw new Error(`A remote profile with a similar name already exists ("${slug}")`);
  }

  const now = Date.now();
  const profile: RemoteProfile = {
    slug,
    name: data.name.trim(),
    host: data.host,
    port,
    username: data.username,
    authMethod: data.authMethod,
    keyPath: data.authMethod === "key" ? data.keyPath : undefined,
    createdAt: now,
    updatedAt: now,
  };

  writeFileSync(filePath(slug), JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}

export function updateProfile(
  slug: string,
  updates: RemoteProfileUpdateFields,
): RemoteProfile | null {
  ensureDir();
  const existing = getProfile(slug);
  if (!existing) return null;

  if (updates.host !== undefined && !validateHost(updates.host)) {
    throw new Error("Invalid host: only alphanumeric, dots, hyphens, and underscores allowed");
  }
  if (updates.username !== undefined && !validateUsername(updates.username)) {
    throw new Error("Invalid username: only alphanumeric, dots, hyphens, underscores, and @ allowed");
  }
  if (updates.port !== undefined && !validatePort(updates.port)) {
    throw new Error("Invalid port: must be 1-65535");
  }

  const newName = updates.name?.trim() || existing.name;
  const newSlug = slugify(newName);
  if (!newSlug) {
    throw new Error("Profile name must contain alphanumeric characters");
  }

  if (newSlug !== slug && existsSync(filePath(newSlug))) {
    throw new Error(`A remote profile with a similar name already exists ("${newSlug}")`);
  }

  const authMethod = updates.authMethod ?? existing.authMethod;
  const profile: RemoteProfile = {
    ...existing,
    name: newName,
    slug: newSlug,
    host: updates.host ?? existing.host,
    port: updates.port ?? existing.port,
    username: updates.username ?? existing.username,
    authMethod,
    keyPath: authMethod === "key" ? (updates.keyPath ?? existing.keyPath) : undefined,
    updatedAt: Date.now(),
  };

  if (newSlug !== slug) {
    try { unlinkSync(filePath(slug)); } catch { /* ok */ }
  }

  writeFileSync(filePath(newSlug), JSON.stringify(profile, null, 2), "utf-8");
  return profile;
}

export function deleteProfile(slug: string): boolean {
  ensureDir();
  if (!existsSync(filePath(slug))) return false;
  try {
    unlinkSync(filePath(slug));
    return true;
  } catch {
    return false;
  }
}
