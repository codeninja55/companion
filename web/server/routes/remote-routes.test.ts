import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Mock remote-profile-manager ─────────────────────────────────────────
vi.mock("../remote-profile-manager.js", () => ({
  listProfiles: vi.fn(() => []),
  getProfile: vi.fn(() => null),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(() => false),
  validateHost: vi.fn(() => true),
  validatePort: vi.fn(() => true),
  validateUsername: vi.fn(() => true),
}));

// ─── Mock ssh-manager ────────────────────────────────────────────────────
vi.mock("../ssh-manager.js", () => ({
  testConnection: vi.fn(async () => ({ ok: true })),
  connect: vi.fn(async () => ({
    id: "conn-1",
    profileSlug: "test",
    status: "connected",
    tunnelPort: 9500,
  })),
  disconnect: vi.fn(async () => {}),
  bootstrapRemote: vi.fn(async () => ({ hasClaudeCode: true })),
  listRemoteDirs: vi.fn(async () => ["/home/user/project1", "/home/user/project2"]),
  mkdirRemote: vi.fn(async () => ({ ok: true })),
  getConnection: vi.fn(() => undefined),
  listConnections: vi.fn(() => []),
}));

import { Hono } from "hono";
import * as profileManager from "../remote-profile-manager.js";
import * as sshManager from "../ssh-manager.js";
import { registerRemoteRoutes } from "./remote-routes.js";

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = new Hono();
  const api = new Hono();
  registerRemoteRoutes(api);
  app.route("/api", api);
});

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-server",
    name: "Test Server",
    host: "example.com",
    port: 22,
    username: "root",
    authMethod: "key",
    keyPath: "/path/to/key",
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

// ─── Profile CRUD ────────────────────────────────────────────────────────

describe("GET /api/remotes", () => {
  it("returns empty list when no profiles exist", async () => {
    vi.mocked(profileManager.listProfiles).mockReturnValue([]);
    const res = await app.request("/api/remotes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns profiles when they exist", async () => {
    const profiles = [makeProfile()];
    vi.mocked(profileManager.listProfiles).mockReturnValue(profiles as any);
    const res = await app.request("/api/remotes");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].slug).toBe("test-server");
  });
});

describe("GET /api/remotes/:slug", () => {
  it("returns 404 for missing profile", async () => {
    const res = await app.request("/api/remotes/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns profile when found", async () => {
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);
    const res = await app.request("/api/remotes/test-server");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("test-server");
  });
});

describe("POST /api/remotes", () => {
  it("creates a profile", async () => {
    vi.mocked(profileManager.createProfile).mockReturnValue(makeProfile() as any);
    const res = await app.request("/api/remotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Server",
        host: "example.com",
        username: "root",
        authMethod: "key",
        keyPath: "/path/to/key",
      }),
    });
    expect(res.status).toBe(201);
    expect(profileManager.createProfile).toHaveBeenCalledWith({
      name: "Test Server",
      host: "example.com",
      port: undefined,
      username: "root",
      authMethod: "key",
      keyPath: "/path/to/key",
    });
  });

  it("returns 400 on validation error", async () => {
    vi.mocked(profileManager.createProfile).mockImplementation(() => {
      throw new Error("Invalid host");
    });
    const res = await app.request("/api/remotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad", host: "bad host" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid host");
  });
});

describe("PUT /api/remotes/:slug", () => {
  it("updates a profile", async () => {
    vi.mocked(profileManager.updateProfile).mockReturnValue(
      makeProfile({ host: "updated.com" }) as any,
    );
    const res = await app.request("/api/remotes/test-server", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "updated.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.host).toBe("updated.com");
  });

  it("returns 404 when profile not found", async () => {
    vi.mocked(profileManager.updateProfile).mockReturnValue(null);
    const res = await app.request("/api/remotes/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "x.com" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/remotes/:slug", () => {
  it("deletes a profile", async () => {
    vi.mocked(profileManager.deleteProfile).mockReturnValue(true);
    const res = await app.request("/api/remotes/test-server", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 404 when profile not found", async () => {
    vi.mocked(profileManager.deleteProfile).mockReturnValue(false);
    const res = await app.request("/api/remotes/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

// ─── SSH operations ──────────────────────────────────────────────────────

describe("POST /api/remotes/:slug/test", () => {
  it("returns ok on successful test", async () => {
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);
    vi.mocked(sshManager.testConnection).mockResolvedValue({ ok: true });

    const res = await app.request("/api/remotes/test-server/test", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 404 when profile not found", async () => {
    vi.mocked(profileManager.getProfile).mockReturnValue(null);
    const res = await app.request("/api/remotes/nonexistent/test", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/remotes/:slug/connect", () => {
  it("establishes a connection", async () => {
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);
    const res = await app.request("/api/remotes/test-server/connect", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("conn-1");
    expect(body.status).toBe("connected");
  });
});

describe("POST /api/remotes/connections/:id/disconnect", () => {
  it("returns 404 for unknown connection", async () => {
    vi.mocked(sshManager.getConnection).mockReturnValue(undefined);
    const res = await app.request("/api/remotes/connections/unknown/disconnect", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("disconnects a connection", async () => {
    vi.mocked(sshManager.getConnection).mockReturnValue({
      id: "conn-1",
      profileSlug: "test-server",
      status: "connected",
      tunnelPort: 9500,
    });
    const res = await app.request("/api/remotes/connections/conn-1/disconnect", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(sshManager.disconnect).toHaveBeenCalledWith("conn-1");
  });
});

describe("POST /api/remotes/connections/:id/bootstrap", () => {
  it("checks for Claude Code on remote", async () => {
    vi.mocked(sshManager.getConnection).mockReturnValue({
      id: "conn-1",
      profileSlug: "test-server",
      status: "connected",
      tunnelPort: 9500,
    });
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);
    vi.mocked(sshManager.bootstrapRemote).mockResolvedValue({ hasClaudeCode: true });

    const res = await app.request("/api/remotes/connections/conn-1/bootstrap", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasClaudeCode: true });
  });
});

describe("GET /api/remotes/connections/:id/dirs", () => {
  it("lists remote directories", async () => {
    vi.mocked(sshManager.getConnection).mockReturnValue({
      id: "conn-1",
      profileSlug: "test-server",
      status: "connected",
      tunnelPort: 9500,
    });
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);
    vi.mocked(sshManager.listRemoteDirs).mockResolvedValue(["/home/user/a", "/home/user/b"]);

    const res = await app.request("/api/remotes/connections/conn-1/dirs?path=/home/user");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dirs).toEqual(["/home/user/a", "/home/user/b"]);
  });
});

describe("POST /api/remotes/connections/:id/mkdir", () => {
  it("creates a remote directory", async () => {
    vi.mocked(sshManager.getConnection).mockReturnValue({
      id: "conn-1",
      profileSlug: "test-server",
      status: "connected",
      tunnelPort: 9500,
    });
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);
    vi.mocked(sshManager.mkdirRemote).mockResolvedValue({ ok: true });

    const res = await app.request("/api/remotes/connections/conn-1/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/home/user/new-dir" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 400 when path is missing", async () => {
    vi.mocked(sshManager.getConnection).mockReturnValue({
      id: "conn-1",
      profileSlug: "test-server",
      status: "connected",
      tunnelPort: 9500,
    });
    vi.mocked(profileManager.getProfile).mockReturnValue(makeProfile() as any);

    const res = await app.request("/api/remotes/connections/conn-1/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/remotes/connections", () => {
  it("lists all connections", async () => {
    vi.mocked(sshManager.listConnections).mockReturnValue([
      { id: "c1", profileSlug: "test", status: "connected", tunnelPort: 9500 },
    ]);
    const res = await app.request("/api/remotes/connections");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});
