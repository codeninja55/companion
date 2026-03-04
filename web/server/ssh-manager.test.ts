import { describe, it, expect } from "vitest";
import {
  buildRemoteLaunchCommand,
  getConnection,
  disconnect,
} from "./ssh-manager.js";
import type { RemoteConnection } from "./ssh-manager.js";
import type { RemoteProfile } from "./remote-profile-manager.js";

const testProfile: RemoteProfile = {
  slug: "test-server",
  name: "Test Server",
  host: "192.168.1.100",
  port: 22,
  username: "admin",
  authMethod: "key",
  keyPath: "/home/user/.ssh/id_rsa",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/**
 * Helper to create a RemoteConnection object without needing Bun.listen()
 * (which is unavailable in the Vitest environment).
 */
function makeConn(overrides: Partial<RemoteConnection> = {}): RemoteConnection {
  return {
    id: "test-conn-1",
    profileSlug: "test-server",
    status: "connected",
    tunnelPort: 9500,
    ...overrides,
  };
}

describe("connection state helpers", () => {
  it("returns undefined for unknown connection ID", () => {
    expect(getConnection("nonexistent")).toBeUndefined();
  });

  it("handles disconnecting an unknown connection gracefully", async () => {
    // Should not throw
    await disconnect("nonexistent");
  });
});

describe("buildRemoteLaunchCommand", () => {
  it("builds correct SSH command with key auth", () => {
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      testProfile,
      "session-123",
      3456,
      "/home/user/project",
    );

    expect(args[0]).toBe("ssh");
    expect(args).toContain("-o");
    expect(args).toContain("ExitOnForwardFailure=yes");
    expect(args).toContain("-R");
    expect(args).toContain("9500:localhost:3456");
    expect(args).toContain("-p");
    expect(args).toContain("22");
    expect(args).toContain("-i");
    expect(args).toContain("/home/user/.ssh/id_rsa");
    expect(args).toContain("admin@192.168.1.100");
    expect(args).toContain("claude");
    expect(args).toContain("--sdk-url");
    expect(args).toContain("ws://localhost:9500/ws/cli/session-123");
  });

  it("builds command without -i for password auth", () => {
    const pwProfile: RemoteProfile = {
      ...testProfile,
      authMethod: "password",
      keyPath: undefined,
    };
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      pwProfile,
      "session-456",
      3456,
      "/workspace",
    );

    expect(args).not.toContain("-i");
    expect(args).toContain("admin@192.168.1.100");
  });

  it("includes cd for remote cwd", () => {
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      testProfile,
      "session-789",
      3456,
      "/home/user/project",
    );

    const cdIdx = args.indexOf("cd");
    expect(cdIdx).toBeGreaterThan(-1);
    expect(args[cdIdx + 1]).toBe("/home/user/project");
    expect(args[cdIdx + 2]).toBe("&&");
  });

  it("rejects invalid host in profile", () => {
    const badProfile: RemoteProfile = {
      ...testProfile,
      host: "bad host",
    };
    const conn = makeConn();

    expect(() =>
      buildRemoteLaunchCommand(conn, badProfile, "s", 3456, "/tmp"),
    ).toThrow("Invalid host");
  });

  it("rejects invalid port in profile", () => {
    const badProfile: RemoteProfile = {
      ...testProfile,
      port: 99999,
    };
    const conn = makeConn();

    expect(() =>
      buildRemoteLaunchCommand(conn, badProfile, "s", 3456, "/tmp"),
    ).toThrow("Invalid port");
  });

  it("rejects invalid username in profile", () => {
    const badProfile: RemoteProfile = {
      ...testProfile,
      username: "bad user",
    };
    const conn = makeConn();

    expect(() =>
      buildRemoteLaunchCommand(conn, badProfile, "s", 3456, "/tmp"),
    ).toThrow("Invalid username");
  });
});
