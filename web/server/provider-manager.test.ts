import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// vi.hoisted ensures the variable is available when vi.mock is hoisted
const { TEST_HOME } = vi.hoisted(() => {
  const os = require("node:os");
  const path = require("node:path");
  return { TEST_HOME: path.join(os.tmpdir(), `provider-test-${Date.now()}`) };
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => TEST_HOME };
});

import {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  resolveProviderEnv,
  testConnection,
} from "./provider-manager.js";

const PROVIDERS_DIR = join(TEST_HOME, ".companion", "providers");

beforeEach(() => {
  mkdirSync(PROVIDERS_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(PROVIDERS_DIR, { recursive: true, force: true });
  } catch { /* ok */ }
});

// ─── CRUD ───────────────────────────────────────────────────────────────────

describe("provider-manager CRUD", () => {
  it("lists providers sorted by name", () => {
    const p1 = createProvider({ name: "Zeta Provider", baseUrl: "http://localhost:8000/v1" });
    const p2 = createProvider({ name: "Alpha Provider", baseUrl: "http://localhost:9000/v1" });

    const list = listProviders();
    expect(list).toHaveLength(2);
    expect(list[0].slug).toBe(p2.slug);
    expect(list[1].slug).toBe(p1.slug);
  });

  it("creates a provider with slug derived from name", () => {
    const provider = createProvider({
      name: "My Local vLLM",
      baseUrl: "http://localhost:8000/v1",
      apiKey: "sk-test-123",
      models: ["llama-3-70b"],
      maxContextTokens: 8192,
    });

    expect(provider.slug).toBe("my-local-vllm");
    expect(provider.name).toBe("My Local vLLM");
    expect(provider.baseUrl).toBe("http://localhost:8000/v1");
    expect(provider.apiKey).toBe("sk-test-123");
    expect(provider.models).toEqual(["llama-3-70b"]);
    expect(provider.maxContextTokens).toBe(8192);
    expect(provider.createdAt).toBeGreaterThan(0);
    expect(provider.updatedAt).toBe(provider.createdAt);

    // Verify file on disk
    expect(existsSync(join(PROVIDERS_DIR, "my-local-vllm.json"))).toBe(true);
  });

  it("rejects empty name", () => {
    expect(() => createProvider({ name: "", baseUrl: "http://localhost:8000" }))
      .toThrow("Provider name is required");
  });

  it("rejects empty base URL", () => {
    expect(() => createProvider({ name: "Test", baseUrl: "" }))
      .toThrow("Base URL is required");
  });

  it("rejects invalid URL protocol", () => {
    expect(() => createProvider({ name: "Test", baseUrl: "ftp://localhost:8000" }))
      .toThrow("Base URL must be a valid http or https URL");
  });

  it("rejects duplicate slug", () => {
    createProvider({ name: "My Provider", baseUrl: "http://localhost:8000/v1" });
    expect(() => createProvider({ name: "My Provider", baseUrl: "http://localhost:9000/v1" }))
      .toThrow(/already exists/);
  });

  it("gets a provider by slug", () => {
    createProvider({ name: "Test Provider", baseUrl: "http://localhost:8000/v1" });
    const found = getProvider("test-provider");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Provider");
  });

  it("returns null for missing provider", () => {
    expect(getProvider("nonexistent")).toBeNull();
  });

  it("updates a provider", () => {
    createProvider({ name: "Original", baseUrl: "http://localhost:8000/v1" });
    const updated = updateProvider("original", {
      baseUrl: "http://localhost:9000/v1",
      models: ["gpt-4"],
    });

    expect(updated).not.toBeNull();
    expect(updated!.baseUrl).toBe("http://localhost:9000/v1");
    expect(updated!.models).toEqual(["gpt-4"]);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(updated!.createdAt);
  });

  it("updates provider name and renames file", () => {
    createProvider({ name: "Old Name", baseUrl: "http://localhost:8000/v1" });
    const updated = updateProvider("old-name", { name: "Brand Name" });

    expect(updated).not.toBeNull();
    expect(updated!.slug).toBe("brand-name");
    expect(existsSync(join(PROVIDERS_DIR, "brand-name.json"))).toBe(true);
    expect(existsSync(join(PROVIDERS_DIR, "old-name.json"))).toBe(false);
  });

  it("returns null when updating nonexistent provider", () => {
    expect(updateProvider("nope", { name: "X" })).toBeNull();
  });

  it("deletes a provider", () => {
    createProvider({ name: "Deletable", baseUrl: "http://localhost:8000/v1" });
    expect(deleteProvider("deletable")).toBe(true);
    expect(getProvider("deletable")).toBeNull();
    expect(existsSync(join(PROVIDERS_DIR, "deletable.json"))).toBe(false);
  });

  it("returns false when deleting nonexistent provider", () => {
    expect(deleteProvider("nope")).toBe(false);
  });

  it("skips corrupt files when listing", () => {
    createProvider({ name: "Good", baseUrl: "http://localhost:8000/v1" });
    writeFileSync(join(PROVIDERS_DIR, "bad.json"), "NOT JSON", "utf-8");

    const list = listProviders();
    expect(list).toHaveLength(1);
    expect(list[0].slug).toBe("good");
  });

  it("creates a provider without optional fields", () => {
    const provider = createProvider({
      name: "Minimal",
      baseUrl: "http://localhost:8000/v1",
    });
    expect(provider.apiKey).toBeUndefined();
    expect(provider.models).toEqual([]);
    expect(provider.maxContextTokens).toBeUndefined();
  });
});

// ─── resolveProviderEnv ─────────────────────────────────────────────────────

describe("resolveProviderEnv", () => {
  it("returns ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY", () => {
    createProvider({
      name: "Local",
      baseUrl: "http://localhost:8000/v1",
      apiKey: "sk-secret",
    });

    const env = resolveProviderEnv("local", "llama-70b");
    expect(env).toEqual({
      ANTHROPIC_BASE_URL: "http://localhost:8000/v1",
      ANTHROPIC_API_KEY: "sk-secret",
      ANTHROPIC_MODEL: "llama-70b",
    });
  });

  it("omits ANTHROPIC_API_KEY when not set", () => {
    createProvider({
      name: "NoKey",
      baseUrl: "http://localhost:8000/v1",
    });

    const env = resolveProviderEnv("nokey");
    expect(env).toEqual({
      ANTHROPIC_BASE_URL: "http://localhost:8000/v1",
    });
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_MODEL");
  });

  it("returns null for nonexistent provider", () => {
    expect(resolveProviderEnv("nonexistent")).toBeNull();
  });
});

// ─── testConnection ─────────────────────────────────────────────────────────

describe("testConnection", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns models on successful response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "llama-3-70b" },
          { id: "llama-3-8b" },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await testConnection("http://localhost:8000/v1", "sk-test");
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["llama-3-70b", "llama-3-8b"]);
  });

  it("handles non-standard models array format", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: ["model-a", "model-b"],
      }),
    }) as unknown as typeof fetch;

    const result = await testConnection("http://localhost:8000/v1");
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["model-a", "model-b"]);
  });

  it("returns error on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }) as unknown as typeof fetch;

    const result = await testConnection("http://localhost:8000/v1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("returns error on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("Connection refused"),
    ) as unknown as typeof fetch;

    const result = await testConnection("http://localhost:8000/v1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Connection refused");
  });

  it("rejects invalid URLs", async () => {
    const result = await testConnection("not-a-url");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("rejects non-http URLs", async () => {
    const result = await testConnection("ftp://localhost:8000");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("handles abort/timeout", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError"),
    ) as unknown as typeof fetch;

    const result = await testConnection("http://localhost:8000/v1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("appends /v1/models when base URL does not end with /v1", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "model-x" }] }),
    }) as unknown as typeof fetch;

    await testConnection("http://localhost:8000");
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0])
      .toBe("http://localhost:8000/v1/models");
  });

  it("appends /models when base URL already ends with /v1", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "model-y" }] }),
    }) as unknown as typeof fetch;

    await testConnection("http://localhost:8000/v1");
    expect(vi.mocked(globalThis.fetch).mock.calls[0][0])
      .toBe("http://localhost:8000/v1/models");
  });

  it("includes Authorization header when apiKey is provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;

    await testConnection("http://localhost:8000/v1", "sk-secret");
    const callOpts = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(callOpts?.headers?.Authorization).toBe("Bearer sk-secret");
  });
});
