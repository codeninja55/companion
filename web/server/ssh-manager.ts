import { randomUUID } from "node:crypto";
import type { Subprocess } from "bun";
import type { RemoteProfile } from "./remote-profile-manager.js";
import { validateHost, validatePort, validateUsername } from "./remote-profile-manager.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface RemoteConnection {
  id: string;
  profileSlug: string;
  status: ConnectionStatus;
  tunnelPort: number;
  error?: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

const connections = new Map<string, RemoteConnection>();
const processes = new Map<string, Subprocess>();
// Tracks ports currently allocated to active connections to prevent double-allocation.
const allocatedPorts = new Set<number>();

// ─── Port allocation ────────────────────────────────────────────────────────

/** Find a free TCP port, skipping ports already allocated to active connections. */
async function findFreePort(start = 9500, end = 9600): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (allocatedPorts.has(port)) continue;
    try {
      const server = Bun.listen({
        hostname: "127.0.0.1",
        port,
        socket: {
          data() {},
          open() {},
          close() {},
        },
      });
      server.stop(true);
      return port;
    } catch {
      // Port in use by OS, try next
    }
  }
  throw new Error("No free port found in range " + start + "-" + end);
}

// ─── SSH argument builders ──────────────────────────────────────────────────

function buildSshArgs(profile: RemoteProfile, extraArgs: string[] = []): string[] {
  if (!validateHost(profile.host)) throw new Error("Invalid host");
  if (!validatePort(profile.port)) throw new Error("Invalid port");
  if (!validateUsername(profile.username)) throw new Error("Invalid username");

  const args = [
    "ssh",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-p", String(profile.port),
  ];

  if (profile.authMethod === "key" && profile.keyPath) {
    args.push("-i", profile.keyPath);
  }

  args.push(...extraArgs);
  args.push(profile.username + "@" + profile.host);

  return args;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Test SSH connectivity by running "ssh ... echo ok".
 * Returns { ok: true } on success, or { ok: false, error: message } on failure.
 */
export async function testConnection(
  profile: RemoteProfile,
): Promise<{ ok: boolean; error?: string }> {
  const args = buildSshArgs(profile, ["-o", "ConnectTimeout=10"]);
  args.push("echo", "ok");

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      return { ok: true };
    }
    const stderr = await new Response(proc.stderr).text();
    return { ok: false, error: stderr.trim() || "SSH exited with code " + exitCode };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Establish an SSH connection with a reverse tunnel port allocated.
 * The actual SSH tunnel process is NOT started here — it is started
 * when a session is launched via buildRemoteLaunchCommand.
 */
export async function connect(profile: RemoteProfile): Promise<RemoteConnection> {
  const tunnelPort = await findFreePort();
  const id = randomUUID();

  const conn: RemoteConnection = {
    id,
    profileSlug: profile.slug,
    status: "connected",
    tunnelPort,
  };

  allocatedPorts.add(tunnelPort);
  connections.set(id, conn);
  return conn;
}

/** Disconnect and clean up a connection. */
export async function disconnect(connectionId: string): Promise<void> {
  const conn = connections.get(connectionId);
  if (!conn) return;

  conn.status = "disconnected";
  allocatedPorts.delete(conn.tunnelPort);

  const proc = processes.get(connectionId);
  if (proc) {
    try {
      proc.kill("SIGTERM");
      await Promise.race([
        proc.exited,
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch { /* ok */ }
    processes.delete(connectionId);
  }

  connections.delete(connectionId);
}

/**
 * Check if Claude Code is installed on the remote machine.
 * Uses `command -v` (POSIX built-in) instead of `which` for consistent behavior.
 */
export async function bootstrapRemote(
  connectionId: string,
  profile: RemoteProfile,
): Promise<{ hasClaudeCode: boolean }> {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error("Connection not found");

  const args = buildSshArgs(profile, ["-o", "ConnectTimeout=10"]);
  // Use $SHELL -lc so nvm/fnm/Homebrew paths are sourced.
  // Use `command -v` instead of `which` — it's a POSIX built-in with consistent behavior,
  // whereas `which` on some systems outputs "claude not found" to stdout (truthy garbage).
  args.push("exec \"${SHELL:-bash}\" -lc 'command -v claude 2>/dev/null'");

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return { hasClaudeCode: false };
    const stdout = await new Response(proc.stdout).text();
    const path = stdout.trim();
    // Validate it looks like an absolute path
    return { hasClaudeCode: path.startsWith("/") && !path.includes(" ") };
  } catch {
    return { hasClaudeCode: false };
  }
}

/**
 * List directories on the remote machine at the given path.
 * Lists subdirectories by running ls via SSH.
 */
export async function listRemoteDirs(
  connectionId: string,
  profile: RemoteProfile,
  path: string,
): Promise<string[]> {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error("Connection not found");

  const args = buildSshArgs(profile, ["-o", "ConnectTimeout=10"]);
  // Use a shell command to list dirs. ls -1 -d may fail on empty dirs, so || true.
  const lsCmd = "ls -1 -d " + JSON.stringify(path) + "/*/ 2>/dev/null || true";
  args.push("sh", "-c", lsCmd);

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];

    const stdout = await new Response(proc.stdout).text();
    return stdout
      .split("\n")
      .map((line) => line.trim().replace(/\/+$/, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Create a directory on the remote machine.
 */
export async function mkdirRemote(
  connectionId: string,
  profile: RemoteProfile,
  path: string,
): Promise<{ ok: boolean; error?: string }> {
  const conn = connections.get(connectionId);
  if (!conn) throw new Error("Connection not found");

  const args = buildSshArgs(profile, ["-o", "ConnectTimeout=10"]);
  args.push("mkdir", "-p", path);

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) return { ok: true };
    const stderr = await new Response(proc.stderr).text();
    return { ok: false, error: stderr.trim() || "mkdir exited with code " + exitCode };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Shell-escape a value for use in a single-quoted shell string. */
function shellEscape(val: string): string {
  return val.replace(/'/g, "'\\''");
}

/**
 * Build the SSH command array for launching Claude Code on a remote
 * machine via a reverse tunnel. The remote CLI connects back to
 * the local Companion server through the tunnel.
 */
export function buildRemoteLaunchCommand(
  conn: RemoteConnection,
  profile: RemoteProfile,
  sessionId: string,
  serverPort: number,
  cwd: string,
  envVars?: Record<string, string>,
): string[] {
  if (!validateHost(profile.host)) throw new Error("Invalid host");
  if (!validatePort(profile.port)) throw new Error("Invalid port");
  if (!validateUsername(profile.username)) throw new Error("Invalid username");

  const tunnelSpec = conn.tunnelPort + ":localhost:" + serverPort;
  const userHost = profile.username + "@" + profile.host;
  const sdkUrl = "ws://localhost:" + conn.tunnelPort + "/ws/cli/" + sessionId;

  const args = [
    "ssh",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-R", tunnelSpec,
    "-p", String(profile.port),
  ];

  if (profile.authMethod === "key" && profile.keyPath) {
    args.push("-i", profile.keyPath);
  }

  args.push(userHost);

  // Build the remote command as a single shell string so env vars and cd work correctly
  const envParts: string[] = [];
  if (envVars) {
    for (const [k, v] of Object.entries(envVars)) {
      envParts.push(`${k}='${shellEscape(v)}'`);
    }
  }
  const envPrefix = envParts.length > 0 ? envParts.join(" ") + " " : "";

  const cliArgs = [
    "claude",
    "--sdk-url", sdkUrl,
    "--print",
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "-p", "''",
  ].join(" ");

  const escapedCwd = shellEscape(cwd || "~");
  const innerCommand = `cd '${escapedCwd}' && ${envPrefix}${cliArgs}`;

  // Pass the entire remote invocation as a single SSH arg. SSH concatenates
  // all args after user@host with spaces and passes to the remote's default
  // shell. Using a single arg avoids `&&` being split at the wrong level.
  // The outer exec "$SHELL" -lc '...' sources the user's login shell for
  // PATH config (nvm, fnm, Homebrew), falling back to bash if $SHELL is unset.
  args.push(`exec "\${SHELL:-bash}" -lc '${shellEscape(innerCommand)}'`);

  return args;
}

/** Get a connection by ID. */
export function getConnection(id: string): RemoteConnection | undefined {
  return connections.get(id);
}

/** List all active connections. */
export function listConnections(): RemoteConnection[] {
  return Array.from(connections.values());
}

/** Track a subprocess for a connection (for cleanup on disconnect). */
export function trackProcess(connectionId: string, proc: Subprocess): void {
  processes.set(connectionId, proc);
}

/** Disconnect all connections (for server shutdown). */
export async function disconnectAll(): Promise<void> {
  const ids = Array.from(connections.keys());
  await Promise.all(ids.map((id) => disconnect(id)));
}
