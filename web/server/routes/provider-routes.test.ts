import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerProviderRoutes } from "./provider-routes.js";

// Mock the provider-manager module
vi.mock("../provider-manager.js", () => ({
  listProviders: vi.fn(),
  getProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testConnection: vi.fn(),
}));

import * as providerManager from "../provider-manager.js";

const mockList = providerManager.listProviders as ReturnType<typeof vi.fn>;
const mockGet = providerManager.getProvider as ReturnType<typeof vi.fn>;
const mockCreate = providerManager.createProvider as ReturnType<typeof vi.fn>;
const mockUpdate = providerManager.updateProvider as ReturnType<typeof vi.fn>;
const mockDelete = providerManager.deleteProvider as ReturnType<typeof vi.fn>;
const mockTest = providerManager.testConnection as ReturnType<typeof vi.fn>;

function createApp() {
  const app = new Hono();
  registerProviderRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provider-routes", () => {
  describe("GET /providers", () => {
    it("returns list of providers", async () => {
      mockList.mockReturnValue([
        { slug: "vllm", name: "vLLM", baseUrl: "http://localhost:8000/v1", models: [], createdAt: 1, updatedAt: 1 },
      ]);

      const app = createApp();
      const res = await app.request("/providers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].slug).toBe("vllm");
    });

    it("returns 500 on internal error", async () => {
      mockList.mockImplementation(() => { throw new Error("disk error"); });

      const app = createApp();
      const res = await app.request("/providers");
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("disk error");
    });
  });

  describe("GET /providers/:slug", () => {
    it("returns a provider", async () => {
      mockGet.mockReturnValue({
        slug: "vllm",
        name: "vLLM",
        baseUrl: "http://localhost:8000/v1",
        models: ["llama-70b"],
        createdAt: 1,
        updatedAt: 1,
      });

      const app = createApp();
      const res = await app.request("/providers/vllm");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slug).toBe("vllm");
    });

    it("returns 404 for missing provider", async () => {
      mockGet.mockReturnValue(null);

      const app = createApp();
      const res = await app.request("/providers/nope");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /providers", () => {
    it("creates a provider", async () => {
      const provider = {
        slug: "my-llm",
        name: "My LLM",
        baseUrl: "http://localhost:8000/v1",
        models: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      mockCreate.mockReturnValue(provider);

      const app = createApp();
      const res = await app.request("/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My LLM", baseUrl: "http://localhost:8000/v1" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.slug).toBe("my-llm");
    });

    it("returns 400 on validation error", async () => {
      mockCreate.mockImplementation(() => { throw new Error("Provider name is required"); });

      const app = createApp();
      const res = await app.request("/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("required");
    });
  });

  describe("PUT /providers/:slug", () => {
    it("updates a provider", async () => {
      const updated = {
        slug: "vllm",
        name: "vLLM",
        baseUrl: "http://localhost:9000/v1",
        models: ["new-model"],
        createdAt: 1,
        updatedAt: Date.now(),
      };
      mockUpdate.mockReturnValue(updated);

      const app = createApp();
      const res = await app.request("/providers/vllm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "http://localhost:9000/v1", models: ["new-model"] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.baseUrl).toBe("http://localhost:9000/v1");
    });

    it("returns 404 for missing provider", async () => {
      mockUpdate.mockReturnValue(null);

      const app = createApp();
      const res = await app.request("/providers/nope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 on validation error", async () => {
      mockUpdate.mockImplementation(() => { throw new Error("bad url"); });

      const app = createApp();
      const res = await app.request("/providers/vllm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: "bad" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /providers/:slug", () => {
    it("deletes a provider", async () => {
      mockDelete.mockReturnValue(true);

      const app = createApp();
      const res = await app.request("/providers/vllm", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 404 for missing provider", async () => {
      mockDelete.mockReturnValue(false);

      const app = createApp();
      const res = await app.request("/providers/nope", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /providers/:slug/test", () => {
    it("tests connection and returns models", async () => {
      mockGet.mockReturnValue({
        slug: "vllm",
        name: "vLLM",
        baseUrl: "http://localhost:8000/v1",
        apiKey: "sk-test",
        models: [],
        createdAt: 1,
        updatedAt: 1,
      });
      mockTest.mockResolvedValue({
        ok: true,
        models: ["llama-3-70b", "llama-3-8b"],
      });

      const app = createApp();
      const res = await app.request("/providers/vllm/test", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.models).toEqual(["llama-3-70b", "llama-3-8b"]);
    });

    it("returns 404 for missing provider", async () => {
      mockGet.mockReturnValue(null);

      const app = createApp();
      const res = await app.request("/providers/nope/test", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("returns connection error", async () => {
      mockGet.mockReturnValue({
        slug: "broken",
        name: "Broken",
        baseUrl: "http://localhost:99999/v1",
        models: [],
        createdAt: 1,
        updatedAt: 1,
      });
      mockTest.mockResolvedValue({
        ok: false,
        models: [],
        error: "Connection refused",
      });

      const app = createApp();
      const res = await app.request("/providers/broken/test", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toContain("Connection refused");
    });
  });
});
