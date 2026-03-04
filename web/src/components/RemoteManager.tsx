import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api } from "../api.js";
import type { RemoteProfile } from "../types.js";

interface Props {
  onClose?: () => void;
  embedded?: boolean;
}

export function RemoteManager({ onClose, embedded = false }: Props) {
  const [profiles, setProfiles] = useState<RemoteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editPort, setEditPort] = useState(22);
  const [editUsername, setEditUsername] = useState("");
  const [editAuthMethod, setEditAuthMethod] = useState<"key" | "password">("key");
  const [editKeyPath, setEditKeyPath] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.listRemoteProfiles().then((data) => {
      setProfiles(data);
      setLoading(false);
    }).catch((e) => {
      setError(e.message || "Failed to load profiles");
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEditingSlug(null);
    setEditName("");
    setEditHost("");
    setEditPort(22);
    setEditUsername("");
    setEditAuthMethod("key");
    setEditKeyPath("");
    setError("");
  }

  function startEdit(profile: RemoteProfile) {
    setEditingSlug(profile.slug);
    setEditName(profile.name);
    setEditHost(profile.host);
    setEditPort(profile.port);
    setEditUsername(profile.username);
    setEditAuthMethod(profile.authMethod);
    setEditKeyPath(profile.keyPath || "");
    setError("");
  }

  function startCreate() {
    setEditingSlug("__new__");
    setEditName("");
    setEditHost("");
    setEditPort(22);
    setEditUsername("");
    setEditAuthMethod("key");
    setEditKeyPath("");
    setError("");
  }

  async function handleSave() {
    setError("");
    try {
      const data = {
        name: editName,
        host: editHost,
        port: editPort,
        username: editUsername,
        authMethod: editAuthMethod,
        keyPath: editAuthMethod === "key" ? editKeyPath : undefined,
      };

      if (editingSlug === "__new__") {
        await api.createRemoteProfile(data);
      } else if (editingSlug) {
        await api.updateRemoteProfile(editingSlug, data);
      }
      resetForm();
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(slug: string) {
    setError("");
    try {
      await api.deleteRemoteProfile(slug);
      if (editingSlug === slug) resetForm();
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const isEditing = editingSlug !== null;

  const content = (
    <div className="remote-manager" data-testid="remote-manager">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Remote Profiles</h2>
        <div>
          {!isEditing && (
            <button onClick={startCreate} data-testid="add-remote-btn">
              Add Remote
            </button>
          )}
          {!embedded && onClose && (
            <button onClick={onClose} style={{ marginLeft: 8 }} data-testid="close-remote-btn">
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert" style={{ color: "red", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {isEditing && (
        <div className="remote-form" data-testid="remote-form">
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="remote-name">Name</label>
            <input
              id="remote-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. GPU Server"
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="remote-host">Host</label>
            <input
              id="remote-host"
              value={editHost}
              onChange={(e) => setEditHost(e.target.value)}
              placeholder="e.g. 192.168.1.100"
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="remote-port">Port</label>
            <input
              id="remote-port"
              type="number"
              value={editPort}
              onChange={(e) => setEditPort(Number(e.target.value))}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label htmlFor="remote-username">Username</label>
            <input
              id="remote-username"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              placeholder="e.g. root"
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Auth Method</label>
            <div role="radiogroup" aria-label="Authentication method">
              <label>
                <input
                  type="radio"
                  name="authMethod"
                  value="key"
                  checked={editAuthMethod === "key"}
                  onChange={() => setEditAuthMethod("key")}
                />
                SSH Key
              </label>
              <label style={{ marginLeft: 16 }}>
                <input
                  type="radio"
                  name="authMethod"
                  value="password"
                  checked={editAuthMethod === "password"}
                  onChange={() => setEditAuthMethod("password")}
                />
                Password
              </label>
            </div>
          </div>
          {editAuthMethod === "key" && (
            <div style={{ marginBottom: 8 }}>
              <label htmlFor="remote-keypath">Key Path</label>
              <input
                id="remote-keypath"
                value={editKeyPath}
                onChange={(e) => setEditKeyPath(e.target.value)}
                placeholder="e.g. ~/.ssh/id_rsa"
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} data-testid="save-remote-btn">
              {editingSlug === "__new__" ? "Create" : "Save"}
            </button>
            <button onClick={resetForm} data-testid="cancel-remote-btn">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div>Loading...</div>
      ) : profiles.length === 0 && !isEditing ? (
        <div data-testid="empty-message">
          No remote profiles yet. Add one to get started.
        </div>
      ) : (
        !isEditing && (
          <ul style={{ listStyle: "none", padding: 0 }} data-testid="profile-list">
            {profiles.map((p) => (
              <li
                key={p.slug}
                data-testid={`profile-${p.slug}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid #333",
                }}
              >
                <div>
                  <strong>{p.name}</strong>
                  <span style={{ color: "#888", marginLeft: 8 }}>
                    {p.username}@{p.host}:{p.port}
                  </span>
                  <span style={{ color: "#666", marginLeft: 8 }}>
                    ({p.authMethod})
                  </span>
                </div>
                <div>
                  <button onClick={() => startEdit(p)} data-testid={`edit-${p.slug}`}>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.slug)}
                    style={{ marginLeft: 4 }}
                    data-testid={`delete-${p.slug}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );

  if (embedded) return content;

  return createPortal(
    <div
      className="modal-overlay"
      data-testid="remote-manager-modal"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
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
