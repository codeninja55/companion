import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Mock add-dirs-manager ────────────────────────────────────────────────
vi.mock("../add-dirs-manager.js", () => ({
  listAddDirs: vi.fn(() => []),
  getAddDirs: vi.fn(() => null),
  createAddDirs: vi.fn(),
  updateAddDirs: vi.fn(),
  deleteAddDirs: vi.fn(() => false),
}));

import { Hono } from "hono";
import * as addDirsManager from "../add-dirs-manager.js";
import { registerAddDirsRoutes } from "./add-dirs-routes.js";

// ─── Test setup ────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();

  app = new Hono();
  const api = new Hono();
  registerAddDirsRoutes(api);
  app.route("/api", api);
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Minimal preset fixture matching the AddDirsPreset shape. */
function makePreset(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Preset",
    slug: "test-preset",
    directories: ["/src", "/lib"],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/add-dirs
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/add-dirs", () => {
  it("returns an empty list when no presets exist", async () => {
    vi.mocked(addDirsManager.listAddDirs).mockReturnValue([]);

    const res = await app.request("/api/add-dirs");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns a list of presets", async () => {
    const presets = [makePreset(), makePreset({ slug: "second", name: "Second" })];
    vi.mocked(addDirsManager.listAddDirs).mockReturnValue(presets as any);

    const res = await app.request("/api/add-dirs");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].slug).toBe("test-preset");
  });

  it("returns 500 when listAddDirs throws", async () => {
    vi.mocked(addDirsManager.listAddDirs).mockImplementation(() => {
      throw new Error("disk failure");
    });

    const res = await app.request("/api/add-dirs");

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("disk failure");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/add-dirs/:slug
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/add-dirs/:slug", () => {
  it("returns the preset when it exists", async () => {
    const preset = makePreset();
    vi.mocked(addDirsManager.getAddDirs).mockReturnValue(preset as any);

    const res = await app.request("/api/add-dirs/test-preset");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(preset);
    expect(addDirsManager.getAddDirs).toHaveBeenCalledWith("test-preset");
  });

  it("returns 404 when the preset does not exist", async () => {
    vi.mocked(addDirsManager.getAddDirs).mockReturnValue(null as any);

    const res = await app.request("/api/add-dirs/missing");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/add-dirs
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/add-dirs", () => {
  it("creates a preset and returns 201", async () => {
    const created = makePreset();
    vi.mocked(addDirsManager.createAddDirs).mockReturnValue(created as any);

    const res = await app.request("/api/add-dirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Preset", directories: ["/src", "/lib"] }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(addDirsManager.createAddDirs).toHaveBeenCalledWith(
      "Test Preset",
      ["/src", "/lib"],
    );
  });

  it("returns 400 when directories array is empty", async () => {
    const res = await app.request("/api/add-dirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Empty", directories: [] }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/at least one directory/i);
    // createAddDirs should not be called when route-level validation fails
    expect(addDirsManager.createAddDirs).not.toHaveBeenCalled();
  });

  it("returns 400 when directories is missing", async () => {
    const res = await app.request("/api/add-dirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Dirs" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/at least one directory/i);
  });

  it("returns 409 when a duplicate slug exists", async () => {
    vi.mocked(addDirsManager.createAddDirs).mockImplementation(() => {
      throw new Error('A preset with a similar name already exists ("test-preset")');
    });

    const res = await app.request("/api/add-dirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Preset", directories: ["/src"] }),
    });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/already exists/i);
  });

  it("returns 400 when createAddDirs throws a validation error", async () => {
    vi.mocked(addDirsManager.createAddDirs).mockImplementation(() => {
      throw new Error("Preset name is required");
    });

    const res = await app.request("/api/add-dirs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", directories: ["/src"] }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Preset name is required");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/add-dirs/:slug
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/add-dirs/:slug", () => {
  it("updates an existing preset", async () => {
    const updated = makePreset({ name: "Updated", directories: ["/new"] });
    vi.mocked(addDirsManager.updateAddDirs).mockReturnValue(updated as any);

    const res = await app.request("/api/add-dirs/test-preset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", directories: ["/new"] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(addDirsManager.updateAddDirs).toHaveBeenCalledWith(
      "test-preset",
      expect.objectContaining({ name: "Updated", directories: ["/new"] }),
    );
  });

  it("returns 404 when the preset does not exist", async () => {
    vi.mocked(addDirsManager.updateAddDirs).mockReturnValue(null as any);

    const res = await app.request("/api/add-dirs/missing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it("returns 400 when updateAddDirs throws", async () => {
    vi.mocked(addDirsManager.updateAddDirs).mockImplementation(() => {
      throw new Error("Invalid slug");
    });

    const res = await app.request("/api/add-dirs/test-preset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid slug");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/add-dirs/:slug
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/add-dirs/:slug", () => {
  it("deletes a preset and returns ok", async () => {
    vi.mocked(addDirsManager.deleteAddDirs).mockReturnValue(true);

    const res = await app.request("/api/add-dirs/test-preset", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(addDirsManager.deleteAddDirs).toHaveBeenCalledWith("test-preset");
  });

  it("returns 404 when the preset does not exist", async () => {
    vi.mocked(addDirsManager.deleteAddDirs).mockReturnValue(false);

    const res = await app.request("/api/add-dirs/missing", { method: "DELETE" });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });
});
