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

export interface ModelProvider {
  slug: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: string[];
  maxContextTokens?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderUpdateFields {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  maxContextTokens?: number;
}

export interface TestConnectionResult {
  ok: boolean;
  models: string[];
  error?: string;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const COMPANION_DIR = join(homedir(), ".companion");
const PROVIDERS_DIR = join(COMPANION_DIR, "providers");

function ensureDir(): void {
  mkdirSync(PROVIDERS_DIR, { recursive: true });
}

function filePath(slug: string): string {
  return join(PROVIDERS_DIR, `${slug}.json`);
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

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function listProviders(): ModelProvider[] {
  ensureDir();
  try {
    const files = readdirSync(PROVIDERS_DIR).filter((f) => f.endsWith(".json"));
    const providers: ModelProvider[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(PROVIDERS_DIR, file), "utf-8");
        providers.push(JSON.parse(raw));
      } catch {
        // Skip corrupt files
      }
    }
    providers.sort((a, b) => a.name.localeCompare(b.name));
    return providers;
  } catch {
    return [];
  }
}

export function getProvider(slug: string): ModelProvider | null {
  ensureDir();
  try {
    const raw = readFileSync(filePath(slug), "utf-8");
    return JSON.parse(raw) as ModelProvider;
  } catch {
    return null;
  }
}

export function createProvider(data: {
  name: string;
  baseUrl: string;
  apiKey?: string;
  models?: string[];
  maxContextTokens?: number;
}): ModelProvider {
  if (!data.name || !data.name.trim()) {
    throw new Error("Provider name is required");
  }
  if (!data.baseUrl || !data.baseUrl.trim()) {
    throw new Error("Base URL is required");
  }
  if (!isValidUrl(data.baseUrl.trim())) {
    throw new Error("Base URL must be a valid http or https URL");
  }

  const slug = slugify(data.name.trim());
  if (!slug) {
    throw new Error("Provider name must contain alphanumeric characters");
  }

  ensureDir();
  if (existsSync(filePath(slug))) {
    throw new Error(
      `A provider with a similar name already exists ("${slug}")`,
    );
  }

  const now = Date.now();
  const provider: ModelProvider = {
    slug,
    name: data.name.trim(),
    baseUrl: data.baseUrl.trim(),
    apiKey: data.apiKey || undefined,
    models: data.models || [],
    maxContextTokens: data.maxContextTokens,
    createdAt: now,
    updatedAt: now,
  };

  writeFileSync(filePath(slug), JSON.stringify(provider, null, 2), "utf-8");
  return provider;
}

export function updateProvider(
  slug: string,
  updates: ProviderUpdateFields,
): ModelProvider | null {
  ensureDir();
  const existing = getProvider(slug);
  if (!existing) return null;

  const newName = updates.name?.trim() || existing.name;
  const newSlug = slugify(newName);
  if (!newSlug) {
    throw new Error("Provider name must contain alphanumeric characters");
  }

  if (newSlug !== slug && existsSync(filePath(newSlug))) {
    throw new Error(
      `A provider with a similar name already exists ("${newSlug}")`,
    );
  }

  const newBaseUrl = updates.baseUrl?.trim() || existing.baseUrl;
  if (!isValidUrl(newBaseUrl)) {
    throw new Error("Base URL must be a valid http or https URL");
  }

  const provider: ModelProvider = {
    ...existing,
    name: newName,
    slug: newSlug,
    baseUrl: newBaseUrl,
    apiKey: updates.apiKey !== undefined ? (updates.apiKey || undefined) : existing.apiKey,
    models: updates.models ?? existing.models,
    maxContextTokens: updates.maxContextTokens !== undefined
      ? updates.maxContextTokens
      : existing.maxContextTokens,
    updatedAt: Date.now(),
  };

  // If slug changed, delete old file
  if (newSlug !== slug) {
    try { unlinkSync(filePath(slug)); } catch { /* ok */ }
  }

  writeFileSync(filePath(newSlug), JSON.stringify(provider, null, 2), "utf-8");
  return provider;
}

export function deleteProvider(slug: string): boolean {
  ensureDir();
  if (!existsSync(filePath(slug))) return false;
  try {
    unlinkSync(filePath(slug));
    return true;
  } catch {
    return false;
  }
}

// ─── Provider Environment Resolution ────────────────────────────────────────

/**
 * Resolve the environment variables needed to route Claude Code
 * through a custom provider endpoint.
 */
export function resolveProviderEnv(
  slug: string,
  model?: string,
): Record<string, string> | null {
  const provider = getProvider(slug);
  if (!provider) return null;

  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: provider.baseUrl,
  };

  if (provider.apiKey) {
    env.ANTHROPIC_API_KEY = provider.apiKey;
  }

  if (model) {
    env.ANTHROPIC_MODEL = model;
  }

  return env;
}

// ─── Test Connection ────────────────────────────────────────────────────────

/**
 * Test a connection to a provider endpoint by fetching /v1/models.
 * Returns available model IDs on success.
 */
export async function testConnection(
  baseUrl: string,
  apiKey?: string,
): Promise<TestConnectionResult> {
  if (!isValidUrl(baseUrl)) {
    return { ok: false, models: [], error: "Invalid URL: must be http or https" };
  }

  // Normalize: strip trailing slash
  const normalizedUrl = baseUrl.replace(/\/+$/, "");
  // If baseUrl already ends with /v1, use /models; otherwise append /v1/models
  const modelsUrl = normalizedUrl.endsWith("/v1")
    ? `${normalizedUrl}/models`
    : `${normalizedUrl}/v1/models`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(modelsUrl, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        models: [],
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await res.json() as {
      data?: Array<{ id: string }>;
      models?: Array<{ id: string } | string>;
    };

    // OpenAI-compatible format: { data: [{ id: "..." }] }
    let models: string[] = [];
    if (Array.isArray(data.data)) {
      models = data.data
        .map((m) => (typeof m === "string" ? m : m.id))
        .filter(Boolean);
    } else if (Array.isArray(data.models)) {
      models = data.models
        .map((m) => (typeof m === "string" ? m : m.id))
        .filter(Boolean);
    }

    return { ok: true, models };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("abort")) {
      return { ok: false, models: [], error: "Connection timed out (10s)" };
    }
    return { ok: false, models: [], error: message };
  } finally {
    clearTimeout(timeout);
  }
}
