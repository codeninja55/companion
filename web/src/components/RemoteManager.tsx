import { useState, useEffect, useCallback } from "react";
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
  const [editAuthMethod, setEditAuthMethod] = useState<"key" | "password" | "tailscale">("key");
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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-cc-fg">Remote Profiles</h2>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={startCreate}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white transition-colors cursor-pointer"
              data-testid="add-remote-btn"
            >
              Add Remote
            </button>
          )}
          {!embedded && onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-cc-muted hover:text-cc-fg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer"
              data-testid="close-remote-btn"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-lg bg-cc-error/10 border border-cc-error/20 text-xs text-cc-error"
          role="alert"
        >
          {error}
        </div>
      )}

      {isEditing && (
        <div className="remote-form space-y-3" data-testid="remote-form">
          <div>
            <label htmlFor="remote-name" className="block text-[11px] text-cc-muted mb-1.5">Name</label>
            <input
              id="remote-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. GPU Server"
              className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
            />
          </div>
          <div>
            <label htmlFor="remote-host" className="block text-[11px] text-cc-muted mb-1.5">Host</label>
            <input
              id="remote-host"
              value={editHost}
              onChange={(e) => setEditHost(e.target.value)}
              placeholder="e.g. 192.168.1.100"
              className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
            />
          </div>
          <div>
            <label htmlFor="remote-port" className="block text-[11px] text-cc-muted mb-1.5">Port</label>
            <input
              id="remote-port"
              type="number"
              value={editPort}
              onChange={(e) => setEditPort(Number(e.target.value))}
              className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
            />
          </div>
          <div>
            <label htmlFor="remote-username" className="block text-[11px] text-cc-muted mb-1.5">Username</label>
            <input
              id="remote-username"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              placeholder="e.g. root"
              className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
            />
          </div>
          <div>
            <label className="block text-[11px] text-cc-muted mb-1.5">Auth Method</label>
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
                  aria-checked={editAuthMethod === method}
                  onClick={() => setEditAuthMethod(method)}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                    editAuthMethod === method
                      ? "bg-cc-primary/15 text-cc-primary border-r border-cc-border"
                      : "bg-cc-input-bg text-cc-muted hover:text-cc-fg hover:bg-cc-hover border-r border-cc-border"
                  } last:border-r-0`}
                >
                  {method === "key" ? "SSH Key" : method === "password" ? "Password" : "Tailscale"}
                </button>
              ))}
            </div>
          </div>
          {editAuthMethod === "key" && (
            <div>
              <label htmlFor="remote-keypath" className="block text-[11px] text-cc-muted mb-1.5">Key Path</label>
              <input
                id="remote-keypath"
                value={editKeyPath}
                onChange={(e) => setEditKeyPath(e.target.value)}
                placeholder="e.g. ~/.ssh/id_rsa"
                className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg font-mono-code"
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-cc-primary hover:bg-cc-primary-hover text-white transition-colors cursor-pointer"
              data-testid="save-remote-btn"
            >
              {editingSlug === "__new__" ? "Create" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-xs text-cc-muted hover:text-cc-fg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer"
              data-testid="cancel-remote-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-cc-muted">Loading...</div>
      ) : profiles.length === 0 && !isEditing ? (
        <div data-testid="empty-message" className="text-sm text-cc-muted py-4">
          No remote profiles yet. Add one to get started.
        </div>
      ) : (
        !isEditing && (
          <div className="space-y-1" data-testid="profile-list">
            {profiles.map((p) => (
              <div
                key={p.slug}
                data-testid={`profile-${p.slug}`}
                className="flex justify-between items-center px-3 py-2.5 rounded-lg bg-cc-hover"
              >
                <div>
                  <strong className="text-sm text-cc-fg">{p.name}</strong>
                  <span className="text-xs text-cc-muted ml-2">
                    {p.username}@{p.host}:{p.port}
                  </span>
                  <span className="text-xs text-cc-muted/60 ml-2">
                    ({p.authMethod})
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(p)}
                    className="px-2 py-1 text-[11px] rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-active transition-colors cursor-pointer"
                    data-testid={`edit-${p.slug}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.slug)}
                    className="px-2 py-1 text-[11px] rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                    data-testid={`delete-${p.slug}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="remote-manager-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="mx-4 w-full max-w-lg bg-cc-card border border-cc-border rounded-xl shadow-2xl p-5 max-h-[80vh] overflow-auto">
        {content}
      </div>
    </div>
  );
}
