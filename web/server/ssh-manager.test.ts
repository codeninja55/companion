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
      4567,
      "/home/user/project",
    );

    // SSH transport args
    expect(args[0]).toBe("ssh");
    expect(args).toContain("-o");
    expect(args).toContain("ExitOnForwardFailure=yes");
    expect(args).toContain("-R");
    expect(args).toContain("9500:localhost:4567");
    expect(args).toContain("-p");
    expect(args).toContain("22");
    expect(args).toContain("-i");
    expect(args).toContain("/home/user/.ssh/id_rsa");
    expect(args).toContain("admin@192.168.1.100");

    // Remote command is a single arg wrapping the full invocation
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("${SHELL:-bash}");
    expect(remoteCmd).toContain("cd ");
    expect(remoteCmd).toContain("/home/user/project");
    expect(remoteCmd).toContain("claude");
    expect(remoteCmd).toContain("--sdk-url ws://localhost:9500/ws/cli/session-123");
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
      4567,
      "/workspace",
    );

    expect(args).not.toContain("-i");
    expect(args).toContain("admin@192.168.1.100");
  });

  it("includes cd and claude in a single remote command arg", () => {
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      testProfile,
      "session-789",
      4567,
      "/home/user/project",
    );

    // Everything after user@host is a single SSH arg to avoid && splitting
    const userHostIdx = args.indexOf("admin@192.168.1.100");
    expect(args.length).toBe(userHostIdx + 2); // user@host + single remote cmd
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("cd ");
    expect(remoteCmd).toContain("/home/user/project");
    expect(remoteCmd).toContain("&& ");
    expect(remoteCmd).toContain("claude");
  });

  it("uses $SHELL -lc to invoke the remote command", () => {
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      testProfile,
      "session-shell",
      4567,
      "/workspace",
    );

    // Single remote arg wraps everything in exec "$SHELL" -lc '...'
    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toMatch(/exec "\$\{SHELL:-bash\}" -lc '/);
  });

  it("forwards env vars as shell-escaped prefix", () => {
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      testProfile,
      "session-env",
      4567,
      "/workspace",
      { ANTHROPIC_API_KEY: "sk-test-123", MY_VAR: "hello" },
    );

    const remoteCmd = args[args.length - 1];
    expect(remoteCmd).toContain("ANTHROPIC_API_KEY=");
    expect(remoteCmd).toContain("sk-test-123");
    expect(remoteCmd).toContain("MY_VAR=");
    expect(remoteCmd).toContain("hello");
  });

  it("shell-escapes single quotes in env var values", () => {
    const conn = makeConn();
    const args = buildRemoteLaunchCommand(
      conn,
      testProfile,
      "session-escape",
      4567,
      "/workspace",
      { TOKEN: "it's-a-test" },
    );

    const remoteCmd = args[args.length - 1];
    // The value is double-escaped: once for the inner -lc arg, once for the env var
    expect(remoteCmd).toContain("TOKEN=");
    expect(remoteCmd).toContain("it");
    expect(remoteCmd).toContain("s-a-test");
  });

  it("rejects invalid host in profile", () => {
    const badProfile: RemoteProfile = {
      ...testProfile,
      host: "bad host",
    };
    const conn = makeConn();

    expect(() =>
      buildRemoteLaunchCommand(conn, badProfile, "s", 4567, "/tmp"),
    ).toThrow("Invalid host");
  });

  it("rejects invalid port in profile", () => {
    const badProfile: RemoteProfile = {
      ...testProfile,
      port: 99999,
    };
    const conn = makeConn();

    expect(() =>
      buildRemoteLaunchCommand(conn, badProfile, "s", 4567, "/tmp"),
    ).toThrow("Invalid port");
  });

  it("rejects invalid username in profile", () => {
    const badProfile: RemoteProfile = {
      ...testProfile,
      username: "bad user",
    };
    const conn = makeConn();

    expect(() =>
      buildRemoteLaunchCommand(conn, badProfile, "s", 4567, "/tmp"),
    ).toThrow("Invalid username");
  });
});
