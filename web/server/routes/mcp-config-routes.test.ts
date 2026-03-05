import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerMcpConfigRoutes } from "./mcp-config-routes.js";

// Mock the mcp-config-manager module
vi.mock("../mcp-config-manager.js", () => ({
  listMcpConfigs: vi.fn(),
  getMcpConfig: vi.fn(),
  createMcpConfig: vi.fn(),
  deleteMcpConfig: vi.fn(),
  getMcpConfigFilePath: vi.fn(),
}));

import * as mcpConfigManager from "../mcp-config-manager.js";

const mockList = mcpConfigManager.listMcpConfigs as ReturnType<typeof vi.fn>;
const mockGet = mcpConfigManager.getMcpConfig as ReturnType<typeof vi.fn>;
const mockCreate = mcpConfigManager.createMcpConfig as ReturnType<typeof vi.fn>;
const mockDelete = mcpConfigManager.deleteMcpConfig as ReturnType<typeof vi.fn>;

function createApp() {
  const app = new Hono();
  registerMcpConfigRoutes(app);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

/** A sample preset for use in test responses */
function samplePreset() {
  return {
    name: "My MCP",
    slug: "my-mcp",
    config: { mcpServers: { s: { type: "stdio", command: "/bin/x" } } },
    createdAt: 1000,
    updatedAt: 1000,
  };
}

describe("mcp-config-routes", () => {
  describe("GET /mcp-configs", () => {
    it("returns list of presets", async () => {
      mockList.mockReturnValue([samplePreset()]);

      const app = createApp();
      const res = await app.request("/mcp-configs");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].slug).toBe("my-mcp");
    });

    it("returns empty array when no presets exist", async () => {
      mockList.mockReturnValue([]);

      const app = createApp();
      const res = await app.request("/mcp-configs");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("returns 500 on internal error", async () => {
      mockList.mockImplementation(() => {
        throw new Error("disk error");
      });

      const app = createApp();
      const res = await app.request("/mcp-configs");
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("disk error");
    });
  });

  describe("GET /mcp-configs/:slug", () => {
    it("returns a preset", async () => {
      mockGet.mockReturnValue(samplePreset());

      const app = createApp();
      const res = await app.request("/mcp-configs/my-mcp");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.slug).toBe("my-mcp");
      expect(body.config.mcpServers).toBeDefined();
    });

    it("returns 404 for missing preset", async () => {
      mockGet.mockReturnValue(null);

      const app = createApp();
      const res = await app.request("/mcp-configs/nope");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });

  describe("POST /mcp-configs", () => {
    it("creates a preset and returns 201", async () => {
      mockCreate.mockReturnValue(samplePreset());

      const app = createApp();
      const res = await app.request("/mcp-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My MCP",
          config: { mcpServers: { s: { type: "stdio", command: "/bin/x" } } },
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.slug).toBe("my-mcp");
    });

    it("returns 400 on validation error", async () => {
      mockCreate.mockImplementation(() => {
        throw new Error("MCP config name is required");
      });

      const app = createApp();
      const res = await app.request("/mcp-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("required");
    });

    it("returns 409 on duplicate slug", async () => {
      mockCreate.mockImplementation(() => {
        throw new Error('An MCP config with a similar name already exists ("my-mcp")');
      });

      const app = createApp();
      const res = await app.request("/mcp-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My MCP",
          config: { mcpServers: { s: { type: "stdio", command: "/bin/x" } } },
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already exists");
    });

    it("returns 400 for invalid config structure", async () => {
      mockCreate.mockImplementation(() => {
        throw new Error('Config must have a top-level "mcpServers" key');
      });

      const app = createApp();
      const res = await app.request("/mcp-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bad", config: { servers: {} } }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("mcpServers");
    });
  });

  describe("POST /mcp-configs (FormData upload)", () => {
    /** Helper to build a FormData with a JSON file */
    function buildFormData(
      fileContent: string,
      fileName: string,
      name?: string,
    ): FormData {
      const fd = new FormData();
      const file = new File([fileContent], fileName, {
        type: "application/json",
      });
      fd.append("file", file);
      if (name !== undefined) {
        fd.append("name", name);
      }
      return fd;
    }

    it("creates a preset from uploaded file with explicit name", async () => {
      mockCreate.mockReturnValue(samplePreset());

      const app = createApp();
      const configJson = JSON.stringify({
        mcpServers: { s: { type: "stdio", command: "/bin/x" } },
      });
      const fd = buildFormData(configJson, "my-mcp.json", "My MCP");

      const res = await app.request("/mcp-configs", {
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);

      // Verify createMcpConfig was called with the explicit name and parsed config
      expect(mockCreate).toHaveBeenCalledWith("My MCP", {
        mcpServers: { s: { type: "stdio", command: "/bin/x" } },
      });
    });

    it("derives name from filename when no name field is provided", async () => {
      mockCreate.mockReturnValue({
        ...samplePreset(),
        name: "cool-servers",
        slug: "cool-servers",
      });

      const app = createApp();
      const configJson = JSON.stringify({
        mcpServers: { a: { type: "stdio", command: "/bin/a" } },
      });
      const fd = buildFormData(configJson, "cool-servers.json");

      const res = await app.request("/mcp-configs", {
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);

      // Name should be derived from filename with .json stripped
      expect(mockCreate).toHaveBeenCalledWith(
        "cool-servers",
        expect.any(Object),
      );
    });

    it("returns 400 when uploaded file is not valid JSON", async () => {
      const app = createApp();
      const fd = buildFormData("not-json{{{{", "bad.json");

      const res = await app.request("/mcp-configs", {
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("not valid JSON");
    });

    it("returns 400 when no file field is provided", async () => {
      const app = createApp();
      const fd = new FormData();
      fd.append("name", "No File");

      const res = await app.request("/mcp-configs", {
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("file field is required");
    });
  });

  describe("DELETE /mcp-configs/:slug", () => {
    it("deletes a preset", async () => {
      mockDelete.mockReturnValue(true);

      const app = createApp();
      const res = await app.request("/mcp-configs/my-mcp", { method: "DELETE" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 404 for missing preset", async () => {
      mockDelete.mockReturnValue(false);

      const app = createApp();
      const res = await app.request("/mcp-configs/nope", { method: "DELETE" });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });
  });
});
