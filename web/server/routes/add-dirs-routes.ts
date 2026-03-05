import type { Hono } from "hono";
import * as addDirsManager from "../add-dirs-manager.js";

export function registerAddDirsRoutes(api: Hono): void {
  api.get("/add-dirs", (c) => {
    try {
      return c.json(addDirsManager.listAddDirs());
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.get("/add-dirs/:slug", (c) => {
    const preset = addDirsManager.getAddDirs(c.req.param("slug"));
    if (!preset) return c.json({ error: "Preset not found" }, 404);
    return c.json(preset);
  });

  api.post("/add-dirs", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { name, directories } = body;

    if (!directories || !Array.isArray(directories) || directories.length === 0) {
      return c.json({ error: "At least one directory is required" }, 400);
    }

    try {
      const preset = addDirsManager.createAddDirs(name, directories);
      return c.json(preset, 201);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Distinguish duplicate slug (409) from other validation errors (400)
      if (msg.includes("already exists")) {
        return c.json({ error: msg }, 409);
      }
      return c.json({ error: msg }, 400);
    }
  });

  api.put("/add-dirs/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json().catch(() => ({}));
    try {
      const preset = addDirsManager.updateAddDirs(slug, {
        name: body.name,
        directories: body.directories,
      });
      if (!preset) return c.json({ error: "Preset not found" }, 404);
      return c.json(preset);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  api.delete("/add-dirs/:slug", (c) => {
    const deleted = addDirsManager.deleteAddDirs(c.req.param("slug"));
    if (!deleted) return c.json({ error: "Preset not found" }, 404);
    return c.json({ ok: true });
  });
}
