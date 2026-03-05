import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;
let addDirsManager: typeof import("./add-dirs-manager.js");

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
  tempDir = mkdtempSync(join(tmpdir(), "add-dirs-test-"));
  mockHomedir.set(tempDir);
  vi.resetModules();
  addDirsManager = await import("./add-dirs-manager.js");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helper to get the add-dirs directory path used by the module
// ---------------------------------------------------------------------------
function addDirsDir(): string {
  return join(tempDir, ".companion", "add-dirs");
}

// ===========================================================================
// Slugification (tested indirectly via createAddDirs)
// ===========================================================================
describe("slugification via createAddDirs", () => {
  it("converts spaces to hyphens and lowercases", () => {
    const preset = addDirsManager.createAddDirs("My Dirs", ["/tmp"]);
    expect(preset.slug).toBe("my-dirs");
  });

  it("strips special characters", () => {
    const preset = addDirsManager.createAddDirs("Hello World! @#$%", ["/tmp"]);
    expect(preset.slug).toBe("hello-world");
  });

  it("collapses consecutive hyphens", () => {
    const preset = addDirsManager.createAddDirs("a   ---  b", ["/tmp"]);
    expect(preset.slug).toBe("a-b");
  });

  it("trims leading and trailing hyphens", () => {
    const preset = addDirsManager.createAddDirs(" -cool dirs- ", ["/tmp"]);
    expect(preset.slug).toBe("cool-dirs");
  });

  it("throws when name is empty string", () => {
    expect(() => addDirsManager.createAddDirs("", ["/tmp"])).toThrow("Preset name is required");
  });

  it("throws when name is only whitespace", () => {
    expect(() => addDirsManager.createAddDirs("   ", ["/tmp"])).toThrow("Preset name is required");
  });

  it("throws when name contains no alphanumeric characters", () => {
    expect(() => addDirsManager.createAddDirs("@#$%^&", ["/tmp"])).toThrow(
      "Preset name must contain alphanumeric characters",
    );
  });
});

// ===========================================================================
// listAddDirs
// ===========================================================================
describe("listAddDirs", () => {
  it("returns empty array when no presets exist", () => {
    const result = addDirsManager.listAddDirs();
    expect(result).toEqual([]);
  });

  it("returns presets sorted alphabetically by name", () => {
    addDirsManager.createAddDirs("Zebra", ["/z"]);
    addDirsManager.createAddDirs("Alpha", ["/a"]);
    addDirsManager.createAddDirs("Mango", ["/m"]);

    const result = addDirsManager.listAddDirs();
    expect(result.map((p) => p.name)).toEqual(["Alpha", "Mango", "Zebra"]);
  });

  it("skips corrupt JSON files", () => {
    addDirsManager.createAddDirs("Valid", ["/valid"]);

    // Write a corrupt file directly into the add-dirs directory
    writeFileSync(join(addDirsDir(), "corrupt.json"), "NOT VALID JSON{{{", "utf-8");

    const result = addDirsManager.listAddDirs();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Valid");
  });
});

// ===========================================================================
// getAddDirs
// ===========================================================================
describe("getAddDirs", () => {
  it("returns the preset when it exists", () => {
    addDirsManager.createAddDirs("My Project", ["/src", "/lib"]);

    const result = addDirsManager.getAddDirs("my-project");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("My Project");
    expect(result!.slug).toBe("my-project");
    expect(result!.directories).toEqual(["/src", "/lib"]);
  });

  it("returns null when the preset does not exist", () => {
    const result = addDirsManager.getAddDirs("nonexistent");
    expect(result).toBeNull();
  });
});

// ===========================================================================
// createAddDirs
// ===========================================================================
describe("createAddDirs", () => {
  it("returns a preset with correct structure and timestamps", () => {
    const before = Date.now();
    const preset = addDirsManager.createAddDirs("Production", ["/app", "/config"]);
    const after = Date.now();

    expect(preset.name).toBe("Production");
    expect(preset.slug).toBe("production");
    expect(preset.directories).toEqual(["/app", "/config"]);
    expect(preset.createdAt).toBeGreaterThanOrEqual(before);
    expect(preset.createdAt).toBeLessThanOrEqual(after);
    expect(preset.updatedAt).toBe(preset.createdAt);
  });

  it("persists the preset to disk as JSON", () => {
    addDirsManager.createAddDirs("Disk Check", ["/check"]);

    const raw = readFileSync(join(addDirsDir(), "disk-check.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("Disk Check");
    expect(parsed.slug).toBe("disk-check");
    expect(parsed.directories).toEqual(["/check"]);
  });

  it("throws when directories array is empty", () => {
    expect(() => addDirsManager.createAddDirs("No Dirs", [])).toThrow(
      "At least one directory is required",
    );
  });

  it("throws when creating a duplicate slug", () => {
    addDirsManager.createAddDirs("My App", ["/app"]);
    expect(() => addDirsManager.createAddDirs("My App", ["/other"])).toThrow(
      'A preset with a similar name already exists ("my-app")',
    );
  });

  it("trims the name before saving", () => {
    const preset = addDirsManager.createAddDirs("  Spaced Out  ", ["/sp"]);
    expect(preset.name).toBe("Spaced Out");
    expect(preset.slug).toBe("spaced-out");
  });
});

// ===========================================================================
// updateAddDirs
// ===========================================================================
describe("updateAddDirs", () => {
  it("updates name and directories", () => {
    addDirsManager.createAddDirs("Original", ["/old"]);

    const updated = addDirsManager.updateAddDirs("original", {
      name: "Renamed",
      directories: ["/new"],
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Renamed");
    expect(updated!.slug).toBe("renamed");
    expect(updated!.directories).toEqual(["/new"]);
  });

  it("renames the file on disk when slug changes", () => {
    addDirsManager.createAddDirs("Old Name", ["/dir"]);

    addDirsManager.updateAddDirs("old-name", { name: "New Name" });

    // Old file should be gone, new file should exist
    const oldPath = join(addDirsDir(), "old-name.json");
    const newPath = join(addDirsDir(), "new-name.json");

    expect(() => readFileSync(oldPath, "utf-8")).toThrow();
    const parsed = JSON.parse(readFileSync(newPath, "utf-8"));
    expect(parsed.name).toBe("New Name");
    expect(parsed.slug).toBe("new-name");
  });

  it("throws on slug collision during rename", () => {
    addDirsManager.createAddDirs("Alpha", ["/a"]);
    addDirsManager.createAddDirs("Beta", ["/b"]);

    expect(() => addDirsManager.updateAddDirs("alpha", { name: "Beta" })).toThrow(
      'A preset with a similar name already exists ("beta")',
    );
  });

  it("returns null for a non-existent slug", () => {
    const result = addDirsManager.updateAddDirs("ghost", { name: "New" });
    expect(result).toBeNull();
  });

  it("preserves createdAt and advances updatedAt", async () => {
    const preset = addDirsManager.createAddDirs("Timestamps", ["/ts"]);
    const originalCreatedAt = preset.createdAt;

    // Small delay to ensure Date.now() advances
    await new Promise((r) => setTimeout(r, 10));

    const updated = addDirsManager.updateAddDirs("timestamps", { directories: ["/ts2"] });

    expect(updated).not.toBeNull();
    expect(updated!.createdAt).toBe(originalCreatedAt);
    expect(updated!.updatedAt).toBeGreaterThan(originalCreatedAt);
  });

  it("keeps existing directories when only name is updated", () => {
    addDirsManager.createAddDirs("Keep Dirs", ["/a", "/b"]);

    const updated = addDirsManager.updateAddDirs("keep-dirs", { name: "Kept Dirs" });
    expect(updated!.directories).toEqual(["/a", "/b"]);
  });
});

// ===========================================================================
// deleteAddDirs
// ===========================================================================
describe("deleteAddDirs", () => {
  it("deletes an existing preset and returns true", () => {
    addDirsManager.createAddDirs("To Delete", ["/del"]);
    const result = addDirsManager.deleteAddDirs("to-delete");
    expect(result).toBe(true);

    // Confirm it is gone
    expect(addDirsManager.getAddDirs("to-delete")).toBeNull();
  });

  it("returns false when the preset does not exist", () => {
    const result = addDirsManager.deleteAddDirs("missing");
    expect(result).toBe(false);
  });
});
