import type { Hono } from "hono";
import * as profileManager from "../remote-profile-manager.js";
import * as sshManager from "../ssh-manager.js";

export function registerRemoteRoutes(api: Hono): void {
  // ─── Connection listing (before :slug to avoid route conflict) ────────

  api.get("/remotes/connections", (c) => {
    return c.json(sshManager.listConnections());
  });

  // ─── Profile CRUD ──────────────────────────────────────────────────────

  api.get("/remotes", (c) => {
    try {
      return c.json(profileManager.listProfiles());
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.get("/remotes/:slug", (c) => {
    const profile = profileManager.getProfile(c.req.param("slug"));
    if (!profile) return c.json({ error: "Remote profile not found" }, 404);
    return c.json(profile);
  });

  api.post("/remotes", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const profile = profileManager.createProfile({
        name: body.name,
        host: body.host,
        port: body.port,
        username: body.username,
        authMethod: body.authMethod,
        keyPath: body.keyPath,
        keyContent: body.keyContent,
        envVars: body.envVars,
      });
      return c.json(profile, 201);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  api.put("/remotes/:slug", async (c) => {
    const slug = c.req.param("slug");
    const body = await c.req.json().catch(() => ({}));
    try {
      const profile = profileManager.updateProfile(slug, {
        name: body.name,
        host: body.host,
        port: body.port,
        username: body.username,
        authMethod: body.authMethod,
        keyPath: body.keyPath,
        keyContent: body.keyContent,
        envVars: body.envVars,
      });
      if (!profile) return c.json({ error: "Remote profile not found" }, 404);
      return c.json(profile);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  });

  api.delete("/remotes/:slug", (c) => {
    const deleted = profileManager.deleteProfile(c.req.param("slug"));
    if (!deleted) return c.json({ error: "Remote profile not found" }, 404);
    return c.json({ ok: true });
  });

  // ─── SSH operations ────────────────────────────────────────────────────

  api.post("/remotes/:slug/test", async (c) => {
    const profile = profileManager.getProfile(c.req.param("slug"));
    if (!profile) return c.json({ error: "Remote profile not found" }, 404);

    const result = await sshManager.testConnection(profile);
    return c.json(result);
  });

  api.post("/remotes/:slug/connect", async (c) => {
    const profile = profileManager.getProfile(c.req.param("slug"));
    if (!profile) return c.json({ error: "Remote profile not found" }, 404);

    try {
      const conn = await sshManager.connect(profile);
      return c.json(conn);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.post("/remotes/connections/:id/disconnect", async (c) => {
    const id = c.req.param("id");
    const conn = sshManager.getConnection(id);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    await sshManager.disconnect(id);
    return c.json({ ok: true });
  });

  api.post("/remotes/connections/:id/bootstrap", async (c) => {
    const id = c.req.param("id");
    const conn = sshManager.getConnection(id);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const profile = profileManager.getProfile(conn.profileSlug);
    if (!profile) return c.json({ error: "Profile not found for connection" }, 404);

    try {
      const result = await sshManager.bootstrapRemote(id, profile);
      return c.json(result);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.get("/remotes/connections/:id/dirs", async (c) => {
    const id = c.req.param("id");
    const conn = sshManager.getConnection(id);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const profile = profileManager.getProfile(conn.profileSlug);
    if (!profile) return c.json({ error: "Profile not found for connection" }, 404);

    const path = c.req.query("path") || "~";
    try {
      const dirs = await sshManager.listRemoteDirs(id, profile, path);
      return c.json({ dirs });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  // Upload SSH key file
  api.post("/remotes/:slug/upload-key", async (c) => {
    const profile = profileManager.getProfile(c.req.param("slug"));
    if (!profile) return c.json({ error: "Remote profile not found" }, 404);

    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || typeof file === "string") {
      return c.json({ error: "File upload required" }, 400);
    }

    const content = await (file as File).text();
    const updated = profileManager.updateProfile(profile.slug, { keyContent: content });
    return c.json(updated);
  });

  // Check if remote directory exists
  api.post("/remotes/connections/:id/check-dir", async (c) => {
    const id = c.req.param("id");
    const conn = sshManager.getConnection(id);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const profile = profileManager.getProfile(conn.profileSlug);
    if (!profile) return c.json({ error: "Profile not found for connection" }, 404);

    const body = await c.req.json().catch(() => ({}));
    if (!body.path) return c.json({ error: "path is required" }, 400);

    try {
      const result = await sshManager.checkRemoteDir(id, profile, body.path);
      return c.json(result);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  // Sync local directory to remote
  api.post("/remotes/connections/:id/sync-dir", async (c) => {
    const id = c.req.param("id");
    const conn = sshManager.getConnection(id);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const profile = profileManager.getProfile(conn.profileSlug);
    if (!profile) return c.json({ error: "Profile not found for connection" }, 404);

    const body = await c.req.json().catch(() => ({}));
    if (!body.localPath || !body.remotePath) {
      return c.json({ error: "localPath and remotePath are required" }, 400);
    }

    try {
      const result = await sshManager.syncDirectory(id, profile, body.localPath, body.remotePath);
      return c.json(result);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  api.post("/remotes/connections/:id/mkdir", async (c) => {
    const id = c.req.param("id");
    const conn = sshManager.getConnection(id);
    if (!conn) return c.json({ error: "Connection not found" }, 404);

    const profile = profileManager.getProfile(conn.profileSlug);
    if (!profile) return c.json({ error: "Profile not found for connection" }, 404);

    const body = await c.req.json().catch(() => ({}));
    if (!body.path) return c.json({ error: "path is required" }, 400);

    try {
      const result = await sshManager.mkdirRemote(id, profile, body.path);
      return c.json(result);
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

}
