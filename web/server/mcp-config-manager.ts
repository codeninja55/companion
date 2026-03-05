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

export interface McpConfigPreset {
  name: string;
  slug: string;
  config: Record<string, unknown>; // the mcpServers object content
  createdAt: number;
  updatedAt: number;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const COMPANION_DIR = join(homedir(), ".companion");
const MCP_CONFIGS_DIR = join(COMPANION_DIR, "mcp-configs");

function ensureDir(): void {
  mkdirSync(MCP_CONFIGS_DIR, { recursive: true });
}

function filePath(slug: string): string {
  return join(MCP_CONFIGS_DIR, `${slug}.json`);
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

/**
 * Validate that the config object has the expected MCP config structure:
 * top-level `mcpServers` key where each entry has `type` and either
 * `command` (for stdio) or `url` (for sse/http/sdk).
 */
function validateConfig(config: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { valid: false, error: "Config must be a JSON object" };
  }

  const obj = config as Record<string, unknown>;
  if (!("mcpServers" in obj) || typeof obj.mcpServers !== "object" || obj.mcpServers === null) {
    return { valid: false, error: "Config must have a top-level \"mcpServers\" key" };
  }

  const servers = obj.mcpServers as Record<string, unknown>;
  for (const [name, entry] of Object.entries(servers)) {
    if (typeof entry !== "object" || entry === null) {
      return { valid: false, error: `Server "${name}" must be an object` };
    }
    const server = entry as Record<string, unknown>;
    if (typeof server.type !== "string") {
      return { valid: false, error: `Server "${name}" is missing a "type" field` };
    }
    const hasCommand = typeof server.command === "string";
    const hasUrl = typeof server.url === "string";
    if (!hasCommand && !hasUrl) {
      return {
        valid: false,
        error: `Server "${name}" must have either a "command" or "url" field`,
      };
    }
  }

  return { valid: true };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export function listMcpConfigs(): McpConfigPreset[] {
  ensureDir();
  try {
    const files = readdirSync(MCP_CONFIGS_DIR).filter((f) => f.endsWith(".json"));
    const presets: McpConfigPreset[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(MCP_CONFIGS_DIR, file), "utf-8");
        presets.push(JSON.parse(raw));
      } catch {
        // Skip corrupt files
      }
    }
    presets.sort((a, b) => a.name.localeCompare(b.name));
    return presets;
  } catch {
    return [];
  }
}

export function getMcpConfig(slug: string): McpConfigPreset | null {
  ensureDir();
  try {
    const raw = readFileSync(filePath(slug), "utf-8");
    return JSON.parse(raw) as McpConfigPreset;
  } catch {
    return null;
  }
}

/**
 * Return the full file path to a saved MCP config preset.
 * Used by the launcher to pass `--mcp-config <path>` to the CLI.
 */
export function getMcpConfigFilePath(slug: string): string {
  return filePath(slug);
}

export function createMcpConfig(
  name: string,
  config: Record<string, unknown>,
): McpConfigPreset {
  if (!name || !name.trim()) throw new Error("MCP config name is required");
  const slug = slugify(name.trim());
  if (!slug) throw new Error("MCP config name must contain alphanumeric characters");

  const validation = validateConfig(config);
  if (!validation.valid) throw new Error(validation.error);

  ensureDir();
  if (existsSync(filePath(slug))) {
    throw new Error(
      `An MCP config with a similar name already exists ("${slug}")`,
    );
  }

  const now = Date.now();
  const preset: McpConfigPreset = {
    name: name.trim(),
    slug,
    config,
    createdAt: now,
    updatedAt: now,
  };

  writeFileSync(filePath(slug), JSON.stringify(preset, null, 2), "utf-8");
  return preset;
}

export function deleteMcpConfig(slug: string): boolean {
  ensureDir();
  if (!existsSync(filePath(slug))) return false;
  try {
    unlinkSync(filePath(slug));
    return true;
  } catch {
    return false;
  }
}
