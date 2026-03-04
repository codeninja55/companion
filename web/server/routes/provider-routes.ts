import type { Hono } from "hono";
import * as providerManager from "../provider-manager.js";

export function registerProviderRoutes(api: Hono): void {
  api.get("/providers", (c) => {
    try {
      return c.json(providerManager.listProviders());
    } catch (e: unknown) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        500,
      );
    }
  });

  api.post("/providers", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const provider = providerManager.createProvider({
        name: body.name,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        models: body.models,
        maxContextTokens: body.maxContextTokens,
      });
      return c.json(provider, 201);
    } catch (e: unknown) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        400,
      );
    }
  });

  // Direct test connection (without a saved provider) — registered before
  // /:slug routes so "test-connection" is not captured as a slug param.
  api.post("/providers/test-connection", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.baseUrl) {
      return c.json({ error: "baseUrl is required" }, 400);
    }
    const result = await providerManager.testConnection(
      body.baseUrl,
      body.apiKey,
    );
    return c.json(result);
  });

  api.get("/providers/:slug", (c) => {
    const provider = providerManager.getProvider(c.req.param("slug"));
    if (!provider) return c.json({ error: "Provider not found" }, 404);
    return c.json(provider);
  });

  api.put("/providers/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json().catch(() => ({}));
    try {
      const provider = providerManager.updateProvider(slug, {
        name: body.name,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        models: body.models,
        maxContextTokens: body.maxContextTokens,
      });
      if (!provider) return c.json({ error: "Provider not found" }, 404);
      return c.json(provider);
    } catch (e: unknown) {
      return c.json(
        { error: e instanceof Error ? e.message : String(e) },
        400,
      );
    }
  });

  api.delete("/providers/:slug", (c) => {
    const deleted = providerManager.deleteProvider(c.req.param("slug"));
    if (!deleted) return c.json({ error: "Provider not found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/providers/:slug/test", async (c) => {
    const provider = providerManager.getProvider(c.req.param("slug"));
    if (!provider) return c.json({ error: "Provider not found" }, 404);

    const result = await providerManager.testConnection(
      provider.baseUrl,
      provider.apiKey,
    );
    return c.json(result);
  });
}
