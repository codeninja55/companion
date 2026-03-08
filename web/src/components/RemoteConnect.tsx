import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import type { RemoteProfile, RemoteConnection } from "../types.js";

type Phase = "select" | "connecting" | "bootstrap" | "browse" | "confirm";

interface Props {
  onClose: () => void;
  onSessionStart: (connectionId: string, remoteCwd: string) => void;
}

export function RemoteConnect({ onClose, onSessionStart }: Props) {
  const [phase, setPhase] = useState<Phase>("select");
  const [profiles, setProfiles] = useState<RemoteProfile[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(
    () => localStorage.getItem("cc-remote-profile") || "",
  );
  const [connection, setConnection] = useState<RemoteConnection | null>(null);
  const [hasClaudeCode, setHasClaudeCode] = useState<boolean | null>(null);
  const [remoteDirs, setRemoteDirs] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState("~");
  const [selectedDir, setSelectedDir] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Manual connection form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualHost, setManualHost] = useState("");
  const [manualPort, setManualPort] = useState(22);
  const [manualUsername, setManualUsername] = useState("");
  const [manualAuthMethod, setManualAuthMethod] = useState<"key" | "password" | "tailscale">("key");
  const [manualKeyPath, setManualKeyPath] = useState("");

  const loadProfiles = useCallback(() => {
    api.listRemoteProfiles().then(setProfiles).catch(() => {});
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // Phase 1 → Phase 2: connect
  async function handleConnect() {
    if (!selectedSlug) return;
    setError("");
    setPhase("connecting");
    setLoading(true);

    try {
      const conn = await api.connectRemote(selectedSlug);
      setConnection(conn);
      setPhase("bootstrap");
      await handleBootstrap(conn.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("select");
    } finally {
      setLoading(false);
    }
  }

  // Manual connect flow
  async function handleManualConnect() {
    if (!manualHost || !manualUsername) return;
    setError("");
    setLoading(true);

    try {
      // Create a temporary profile
      const profile = await api.createRemoteProfile({
        name: `${manualUsername}@${manualHost}`,
        host: manualHost,
        port: manualPort,
        username: manualUsername,
        authMethod: manualAuthMethod,
        keyPath: manualAuthMethod === "key" ? manualKeyPath : undefined,
      });

      setPhase("connecting");
      const conn = await api.connectRemote(profile.slug);
      setConnection(conn);
      setPhase("bootstrap");
      await handleBootstrap(conn.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("select");
    } finally {
      setLoading(false);
    }
  }

  // Phase 3: bootstrap check
  async function handleBootstrap(connId: string) {
    setLoading(true);
    setError("");
    try {
      const result = await api.bootstrapRemote(connId);
      setHasClaudeCode(result.hasClaudeCode);
      if (result.hasClaudeCode) {
        setPhase("browse");
        await loadDirs(connId, "~");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Phase 4: browse directories
  async function loadDirs(connId: string, path: string) {
    setLoading(true);
    try {
      const result = await api.listRemoteDirs(connId, path);
      setRemoteDirs(result.dirs);
      setCurrentPath(path);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleNavigate(dir: string) {
    if (!connection) return;
    setSelectedDir("");
    loadDirs(connection.id, dir);
  }

  function handleSelectDir(dir: string) {
    setSelectedDir(dir);
    setPhase("confirm");
  }

  function handleSelectCurrentDir() {
    setSelectedDir(currentPath);
    setPhase("confirm");
  }

  // Phase 5: confirm and start
  function handleStartSession() {
    if (!connection || !selectedDir) return;
    onSessionStart(connection.id, selectedDir);
    onClose();
  }

  async function handleDisconnect() {
    if (connection) {
      try {
        await api.disconnectRemote(connection.id);
      } catch { /* ok */ }
    }
    setConnection(null);
    setPhase("select");
    setError("");
  }

  const selectedProfile = profiles.find((p) => p.slug === selectedSlug);

  // Phase step indicators
  const phases: { key: Phase; label: string }[] = [
    { key: "select", label: "Select" },
    { key: "connecting", label: "Connect" },
    { key: "bootstrap", label: "Check" },
    { key: "browse", label: "Browse" },
    { key: "confirm", label: "Confirm" },
  ];
  const phaseIndex = phases.findIndex((p) => p.key === phase);

  const content = (
    <div className="remote-connect" data-testid="remote-connect">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-cc-fg">Connect to Remote</h2>
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs text-cc-muted hover:text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
          data-testid="close-connect-btn"
        >
          Close
        </button>
      </div>

      {/* Phase step dots */}
      <div className="flex items-center gap-1 mb-4">
        {phases.map((p, i) => (
          <div key={p.key} className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                i <= phaseIndex ? "bg-cc-primary" : "bg-cc-border"
              }`}
              title={p.label}
            />
            {i < phases.length - 1 && (
              <div className={`w-4 h-px ${i < phaseIndex ? "bg-cc-primary" : "bg-cc-border"}`} />
            )}
          </div>
        ))}
        <span className="ml-2 text-[10px] text-cc-muted">{phases[phaseIndex]?.label}</span>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-lg bg-cc-error/10 border border-cc-error/20 text-xs text-cc-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Phase 1: Select profile */}
      {phase === "select" && (
        <div data-testid="phase-select" className="space-y-3">
          {!showManualForm ? (
            <>
              <div>
                <label
                  htmlFor="remote-profile-select"
                  className="block text-[11px] text-cc-muted mb-1.5"
                >
                  Select a remote profile
                </label>
                <select
                  id="remote-profile-select"
                  value={selectedSlug}
                  onChange={(e) => {
                    setSelectedSlug(e.target.value);
                    localStorage.setItem("cc-remote-profile", e.target.value);
                  }}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
                >
                  <option value="">-- Choose a profile --</option>
                  {profiles.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} ({p.username}@{p.host}:{p.port})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConnect}
                  disabled={!selectedSlug}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  data-testid="connect-btn"
                >
                  Connect
                </button>
                <button
                  onClick={() => setShowManualForm(true)}
                  className="px-3 py-2 text-xs text-cc-muted hover:text-cc-fg rounded-lg hover:bg-cc-hover transition-colors cursor-pointer"
                  data-testid="manual-connect-btn"
                >
                  Connect manually
                </button>
              </div>
            </>
          ) : (
            /* Manual connection form */
            <div className="space-y-3" data-testid="manual-form">
              <div>
                <label htmlFor="manual-host" className="block text-[11px] text-cc-muted mb-1.5">Host</label>
                <input
                  id="manual-host"
                  value={manualHost}
                  onChange={(e) => setManualHost(e.target.value)}
                  placeholder="e.g. 192.168.1.100"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="manual-port" className="block text-[11px] text-cc-muted mb-1.5">Port</label>
                  <input
                    id="manual-port"
                    type="number"
                    value={manualPort}
                    onChange={(e) => setManualPort(Number(e.target.value))}
                    className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
                  />
                </div>
                <div>
                  <label htmlFor="manual-username" className="block text-[11px] text-cc-muted mb-1.5">Username</label>
                  <input
                    id="manual-username"
                    value={manualUsername}
                    onChange={(e) => setManualUsername(e.target.value)}
                    placeholder="e.g. root"
                    className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-cc-muted mb-1.5">Auth method</label>
                <div
                  className="flex rounded-lg border border-cc-border overflow-hidden"
                  role="radiogroup"
                  aria-label="Authentication method"
                >
                  {(["key", "password", "tailscale"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={manualAuthMethod === method}
                      onClick={() => setManualAuthMethod(method)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                        manualAuthMethod === method
                          ? "bg-cc-primary/15 text-cc-primary border-r border-cc-border"
                          : "bg-cc-input-bg text-cc-muted hover:text-cc-fg hover:bg-cc-hover border-r border-cc-border"
                      } last:border-r-0`}
                    >
                      {method === "key" ? "SSH Key" : method === "password" ? "Password" : "Tailscale"}
                    </button>
                  ))}
                </div>
              </div>
              {manualAuthMethod === "key" && (
                <div>
                  <label htmlFor="manual-keypath" className="block text-[11px] text-cc-muted mb-1.5">Key path</label>
                  <input
                    id="manual-keypath"
                    value={manualKeyPath}
                    onChange={(e) => setManualKeyPath(e.target.value)}
                    placeholder="e.g. ~/.ssh/id_rsa"
                    className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg font-mono-code"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualConnect}
                  disabled={!manualHost || !manualUsername}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  data-testid="manual-connect-submit"
                >
                  Connect
                </button>
                <button
                  onClick={() => setShowManualForm(false)}
                  className="px-3 py-2 text-xs text-cc-muted hover:text-cc-fg rounded-lg hover:bg-cc-hover transition-colors cursor-pointer"
                >
                  Back to profiles
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase 2: Connecting */}
      {phase === "connecting" && (
        <div data-testid="phase-connecting" className="py-4">
          <div className="flex items-center gap-2 text-sm text-cc-muted">
            <span className="w-4 h-4 border-2 border-cc-primary/30 border-t-cc-primary rounded-full animate-spin" />
            <span>Connecting to {selectedProfile?.host || manualHost}...</span>
          </div>
          {loading && (
            <div className="mt-2 text-xs text-cc-muted" data-testid="spinner">
              Establishing SSH connection...
            </div>
          )}
        </div>
      )}

      {/* Phase 3: Bootstrap check */}
      {phase === "bootstrap" && (
        <div data-testid="phase-bootstrap" className="py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-cc-muted">
              <span className="w-4 h-4 border-2 border-cc-primary/30 border-t-cc-primary rounded-full animate-spin" />
              <span>Checking for Claude Code on remote...</span>
            </div>
          ) : hasClaudeCode === false ? (
            <div className="space-y-3">
              <div className="px-3 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-400">
                  Claude Code not found on the remote machine.
                </p>
                <p className="text-xs text-cc-muted mt-1">
                  Install it first, then try again.
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                className="px-3 py-2 text-xs text-cc-muted hover:text-cc-fg rounded-lg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer"
                data-testid="back-btn"
              >
                Back
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Phase 4: Browse directories */}
      {phase === "browse" && (
        <div data-testid="phase-browse" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-cc-muted">Current path:</span>
            <span className="text-xs font-medium text-cc-fg font-mono-code">{currentPath}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSelectCurrentDir}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cc-primary/15 text-cc-primary hover:bg-cc-primary/25 transition-colors cursor-pointer"
              data-testid="select-current-dir-btn"
            >
              Select this directory
            </button>
            {currentPath !== "~" && (
              <button
                onClick={() => {
                  const parent = currentPath.replace(/\/[^/]+$/, "") || "/";
                  handleNavigate(parent);
                }}
                className="px-3 py-1.5 text-xs rounded-lg text-cc-muted hover:text-cc-fg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer"
                data-testid="go-up-btn"
              >
                Go up
              </button>
            )}
          </div>
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-cc-muted">
              <span className="w-3 h-3 border-2 border-cc-primary/30 border-t-cc-primary rounded-full animate-spin" />
              Loading directories...
            </div>
          ) : remoteDirs.length === 0 ? (
            <p className="text-xs text-cc-muted py-2">No subdirectories found.</p>
          ) : (
            <div className="space-y-0.5" data-testid="dir-list">
              {remoteDirs.map((dir) => (
                <div
                  key={dir}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-cc-hover transition-colors group"
                >
                  <button
                    className="text-xs text-cc-primary hover:text-cc-primary-hover font-mono-code cursor-pointer bg-transparent border-none"
                    onClick={() => handleNavigate(dir)}
                    data-testid={`dir-navigate-${dir.replace(/\//g, "-")}`}
                  >
                    {dir}
                  </button>
                  <button
                    onClick={() => handleSelectDir(dir)}
                    className="px-2 py-1 text-[11px] rounded-md text-cc-muted hover:text-cc-fg bg-cc-hover hover:bg-cc-active opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    data-testid={`dir-select-${dir.replace(/\//g, "-")}`}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 5: Confirm */}
      {phase === "confirm" && (
        <div data-testid="phase-confirm" className="space-y-4">
          <h3 className="text-xs font-semibold text-cc-fg uppercase tracking-wide">
            Connection summary
          </h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
            <span className="text-cc-muted">Remote</span>
            <span className="text-cc-fg font-mono-code" data-testid="confirm-remote">
              {selectedProfile?.username}@{selectedProfile?.host}:{selectedProfile?.port}
            </span>
            <span className="text-cc-muted">Directory</span>
            <span className="text-cc-fg font-mono-code" data-testid="confirm-dir">
              {selectedDir}
            </span>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleStartSession}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white transition-colors cursor-pointer"
              data-testid="start-session-btn"
            >
              Start Session
            </button>
            <button
              onClick={() => setPhase("browse")}
              className="px-3 py-2 text-xs text-cc-muted hover:text-cc-fg rounded-lg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer"
              data-testid="change-dir-btn"
            >
              Change Directory
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 text-xs text-red-400 hover:text-red-300 rounded-lg bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer"
              data-testid="disconnect-btn"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="remote-connect-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-4 w-full max-w-lg bg-cc-card border border-cc-border rounded-xl shadow-2xl p-5 max-h-[80vh] overflow-auto space-y-4">
        {content}
      </div>
    </div>,
    document.body,
  );
}
