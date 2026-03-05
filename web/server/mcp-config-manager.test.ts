import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;
let mcpConfigManager: typeof import("./mcp-config-manager.js");

const mockHomedir = vi.hoisted(() => {
  let dir = "";
  return {
    get: () => dir,
    set: (d: string) => {
      dir = d;
    },
  };
});

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockHomedir.get(),
  };
});

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "mcp-config-test-"));
  mockHomedir.set(tempDir);
  vi.resetModules();
  mcpConfigManager = await import("./mcp-config-manager.js");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper to get the mcp-configs directory path used by the module
// ---------------------------------------------------------------------------
function configsDir(): string {
  return join(tempDir, ".companion", "mcp-configs");
}

/** A minimal valid MCP config object for use in tests */
function validConfig(): Record<string, unknown> {
  return {
    mcpServers: {
      myServer: {
        type: "stdio",
        command: "/usr/bin/my-server",
      },
    },
  };
}

// ===========================================================================
// Slugification (tested indirectly via createMcpConfig)
// ===========================================================================
describe("slugification via createMcpConfig", () => {
  it("converts spaces to hyphens and lowercases", () => {
    const preset = mcpConfigManager.createMcpConfig("My Config", validConfig());
    expect(preset.slug).toBe("my-config");
  });

  it("strips special characters", () => {
    const preset = mcpConfigManager.createMcpConfig("Hello World! @#$%", validConfig());
    expect(preset.slug).toBe("hello-world");
  });

  it("collapses consecutive hyphens", () => {
    const preset = mcpConfigManager.createMcpConfig("a   ---  b", validConfig());
    expect(preset.slug).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    const preset = mcpConfigManager.createMcpConfig(" -cool config- ", validConfig());
    expect(preset.slug).toBe("cool-config");
  });

  it("throws when name is empty string", () => {
    expect(() => mcpConfigManager.createMcpConfig("", validConfig())).toThrow(
      "MCP config name is required",
    );
  });

  it("throws when name is only whitespace", () => {
    expect(() => mcpConfigManager.createMcpConfig("   ", validConfig())).toThrow(
      "MCP config name is required",
    );
  });

  it("throws when name contains no alphanumeric characters", () => {
    expect(() => mcpConfigManager.createMcpConfig("@#$%^&", validConfig())).toThrow(
      "MCP config name must contain alphanumeric characters",
    );
  });
});

// ===========================================================================
// Validation
// ===========================================================================
describe("config validation", () => {
  it("rejects config without mcpServers key", () => {
    expect(() =>
      mcpConfigManager.createMcpConfig("Test", { servers: {} }),
    ).toThrow('must have a top-level "mcpServers" key');
  });

  it("rejects server entry missing type field", () => {
    expect(() =>
      mcpConfigManager.createMcpConfig("Test", {
        mcpServers: { bad: { command: "foo" } },
      }),
    ).toThrow('Server "bad" is missing a "type" field');
  });

  it("rejects server entry missing both command and url", () => {
    expect(() =>
      mcpConfigManager.createMcpConfig("Test", {
        mcpServers: { bad: { type: "stdio" } },
      }),
    ).toThrow('Server "bad" must have either a "command" or "url" field');
  });

  it("accepts server with type and command", () => {
    const preset = mcpConfigManager.createMcpConfig("Stdio", {
      mcpServers: { s: { type: "stdio", command: "/bin/x" } },
    });
    expect(preset.slug).toBe("stdio");
  });

  it("accepts server with type and url", () => {
    const preset = mcpConfigManager.createMcpConfig("SSE", {
      mcpServers: { s: { type: "sse", url: "http://localhost:3000" } },
    });
    expect(preset.slug).toBe("sse");
  });

  it("rejects non-object config", () => {
    expect(() =>
      mcpConfigManager.createMcpConfig("Test", "not an object" as unknown as Record<string, unknown>),
    ).toThrow("Config must be a JSON object");
  });

  it("rejects array config", () => {
    expect(() =>
      mcpConfigManager.createMcpConfig("Test", [] as unknown as Record<string, unknown>),
    ).toThrow("Config must be a JSON object");
  });
});

// ===========================================================================
// listMcpConfigs
// ===========================================================================
describe("listMcpConfigs", () => {
  it("returns empty array when no configs exist", () => {
    const result = mcpConfigManager.listMcpConfigs();
    expect(result).toEqual([]);
  });

  it("returns configs sorted alphabetically by name", () => {
    mcpConfigManager.createMcpConfig("Zebra", validConfig());
    mcpConfigManager.createMcpConfig("Alpha", validConfig());
    mcpConfigManager.createMcpConfig("Mango", validConfig());

    const result = mcpConfigManager.listMcpConfigs();
    expect(result.map((p) => p.name)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("skips corrupt JSON files", () => {
    mcpConfigManager.createMcpConfig("Valid", validConfig());

    // Write a corrupt file directly
    writeFileSync(join(configsDir(), "corrupt.json"), "NOT VALID JSON{{{", "utf-8");

    const result = mcpConfigManager.listMcpConfigs();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Valid");
  });
});

// ===========================================================================
// getMcpConfig
// ===========================================================================
describe("getMcpConfig", () => {
  it("returns the config when it exists", () => {
    mcpConfigManager.createMcpConfig("My Config", validConfig());

    const result = mcpConfigManager.getMcpConfig("my-config");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("My Config");
    expect(result!.slug).toBe("my-config");
    expect(result!.config).toEqual(validConfig());
  });

  it("returns null when the config does not exist", () => {
    const result = mcpConfigManager.getMcpConfig("nonexistent");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// createMcpConfig
// ===========================================================================
describe("createMcpConfig", () => {
  it("returns a preset with correct structure and timestamps", () => {
    const before = Date.now();
    const preset = mcpConfigManager.createMcpConfig("Production", validConfig());
    const after = Date.now();

    expect(preset.name).toBe("Production");
    expect(preset.slug).toBe("production");
    expect(preset.config).toEqual(validConfig());
    expect(preset.createdAt).toBeGreaterThanOrEqual(before);
    expect(preset.createdAt).toBeLessThanOrEqual(after);
    expect(preset.updatedAt).toBe(preset.createdAt);
  });

  it("persists the preset to disk as JSON", () => {
    mcpConfigManager.createMcpConfig("Disk Check", validConfig());

    const raw = readFileSync(join(configsDir(), "disk-check.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("Disk Check");
    expect(parsed.slug).toBe("disk-check");
  });

  it("throws when creating a duplicate slug", () => {
    mcpConfigManager.createMcpConfig("My Config", validConfig());
    expect(() => mcpConfigManager.createMcpConfig("My Config", validConfig())).toThrow(
      'An MCP config with a similar name already exists ("my-config")',
    );
  });

  it("trims the name before saving", () => {
    const preset = mcpConfigManager.createMcpConfig("  Spaced Out  ", validConfig());
    expect(preset.name).toBe("Spaced Out");
    expect(preset.slug).toBe("spaced-out");
  });
});

// ===========================================================================
// getMcpConfigFilePath
// ===========================================================================
describe("getMcpConfigFilePath", () => {
  it("returns the full file path for a slug", () => {
    const path = mcpConfigManager.getMcpConfigFilePath("my-config");
    expect(path).toBe(join(configsDir(), "my-config.json"));
  });
});

// ===========================================================================
// deleteMcpConfig
// ===========================================================================
describe("deleteMcpConfig", () => {
  it("deletes an existing config and returns true", () => {
    mcpConfigManager.createMcpConfig("To Delete", validConfig());
    const result = mcpConfigManager.deleteMcpConfig("to-delete");
    expect(result).toBe(true);

    // Confirm it is gone
    expect(mcpConfigManager.getMcpConfig("to-delete")).toBeNull();
  });

  it("returns false when the config does not exist", () => {
    const result = mcpConfigManager.deleteMcpConfig("missing");
    expect(result).toBe(false);
  });
});
