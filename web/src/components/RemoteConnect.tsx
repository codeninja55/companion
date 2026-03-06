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

  const content = (
    <div className="remote-connect" data-testid="remote-connect">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Connect to Remote</h2>
        <button onClick={onClose} data-testid="close-connect-btn">Close</button>
      </div>

      {error && (
        <div className="error-banner" role="alert" style={{ color: "red", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Phase 1: Select profile */}
      {phase === "select" && (
        <div data-testid="phase-select">
          <label htmlFor="remote-profile-select">Select a remote profile</label>
          <select
            id="remote-profile-select"
            value={selectedSlug}
            onChange={(e) => {
              setSelectedSlug(e.target.value);
              localStorage.setItem("cc-remote-profile", e.target.value);
            }}
            style={{ display: "block", width: "100%", marginBottom: 12 }}
          >
            <option value="">-- Choose a profile --</option>
            {profiles.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} ({p.username}@{p.host}:{p.port})
              </option>
            ))}
          </select>
          <button
            onClick={handleConnect}
            disabled={!selectedSlug}
            data-testid="connect-btn"
          >
            Connect
          </button>
        </div>
      )}

      {/* Phase 2: Connecting */}
      {phase === "connecting" && (
        <div data-testid="phase-connecting">
          <p>Connecting to {selectedProfile?.host}...</p>
          {loading && <div className="spinner" data-testid="spinner">Establishing SSH connection...</div>}
        </div>
      )}

      {/* Phase 3: Bootstrap check */}
      {phase === "bootstrap" && (
        <div data-testid="phase-bootstrap">
          {loading ? (
            <p>Checking for Claude Code on remote...</p>
          ) : hasClaudeCode === false ? (
            <div>
              <p>Claude Code not found on the remote machine.</p>
              <p>Install it first, then try again.</p>
              <button onClick={handleDisconnect} data-testid="back-btn">
                Back
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Phase 4: Browse directories */}
      {phase === "browse" && (
        <div data-testid="phase-browse">
          <p>Current path: <strong>{currentPath}</strong></p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={handleSelectCurrentDir}
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
                data-testid="go-up-btn"
              >
                Go up
              </button>
            )}
          </div>
          {loading ? (
            <p>Loading directories...</p>
          ) : remoteDirs.length === 0 ? (
            <p>No subdirectories found.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }} data-testid="dir-list">
              {remoteDirs.map((dir) => (
                <li
                  key={dir}
                  style={{ padding: "4px 0", cursor: "pointer" }}
                >
                  <button
                    style={{ background: "none", border: "none", color: "#4fc3f7", cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => handleNavigate(dir)}
                    data-testid={`dir-navigate-${dir.replace(/\//g, "-")}`}
                  >
                    {dir}
                  </button>
                  <button
                    onClick={() => handleSelectDir(dir)}
                    style={{ marginLeft: 8 }}
                    data-testid={`dir-select-${dir.replace(/\//g, "-")}`}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Phase 5: Confirm */}
      {phase === "confirm" && (
        <div data-testid="phase-confirm">
          <h3>Connection Summary</h3>
          <dl>
            <dt>Remote</dt>
            <dd data-testid="confirm-remote">
              {selectedProfile?.username}@{selectedProfile?.host}:{selectedProfile?.port}
            </dd>
            <dt>Directory</dt>
            <dd data-testid="confirm-dir">{selectedDir}</dd>
          </dl>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={handleStartSession}
              data-testid="start-session-btn"
            >
              Start Session
            </button>
            <button
              onClick={() => setPhase("browse")}
              data-testid="change-dir-btn"
            >
              Change Directory
            </button>
            <button
              onClick={handleDisconnect}
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
      className="modal-overlay"
      data-testid="remote-connect-modal"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#1a1a1a",
        borderRadius: 12,
        padding: 24,
        maxWidth: 600,
        width: "90%",
        maxHeight: "80vh",
        overflow: "auto",
      }}>
        {content}
      </div>
    </div>,
    document.body,
  );
}
