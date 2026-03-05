import type { Hono } from "hono";
import * as mcpConfigManager from "../mcp-config-manager.js";

export function registerMcpConfigRoutes(api: Hono): void {
  api.get("/mcp-configs", (c) => {
    try {
      return c.json(mcpConfigManager.listMcpConfigs());
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.get("/mcp-configs/:slug", (c) => {
    const preset = mcpConfigManager.getMcpConfig(c.req.param("slug"));
    if (!preset) return c.json({ error: "MCP config not found" }, 404);
    return c.json(preset);
  });

  api.post("/mcp-configs", async (c) => {
    let name: string;
    let config: Record<string, unknown>;

    const contentType = c.req.header("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await c.req.parseBody();
      const file = formData["file"];
      if (!file || !(file instanceof File)) {
        return c.json({ error: "A file field is required" }, 400);
      }

      const text = await file.text();
      try {
        config = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return c.json({ error: "Uploaded file is not valid JSON" }, 400);
      }

      const formName = formData["name"];
      if (typeof formName === "string" && formName.trim()) {
        name = formName.trim();
      } else {
        // Derive name from filename, stripping .json extension
        name = file.name.replace(/\.json$/i, "");
      }
    } else {
      const body = await c.req.json().catch(() => ({}));
      name = body.name ?? "";
      config = body.config;
    }

    try {
      const preset = mcpConfigManager.createMcpConfig(name, config);
      return c.json(preset, 201);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Return 409 for duplicate slug errors
      if (msg.includes("already exists")) {
        return c.json({ error: msg }, 409);
      }
      return c.json({ error: msg }, 400);
    }
  });

  api.delete("/mcp-configs/:slug", (c) => {
    const deleted = mcpConfigManager.deleteMcpConfig(c.req.param("slug"));
    if (!deleted) return c.json({ error: "MCP config not found" }, 404);
    return c.json({ ok: true });
  });
}
