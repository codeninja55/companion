import { useState, useEffect, useCallback } from "react";
import { api } from "../api.js";
import type { RemoteProfile } from "../types.js";

type AuthMethod = "key" | "password" | "tailscale";
type KeyInputMode = "path" | "upload" | "paste";

interface VarRow {
  key: string;
  value: string;
}

export function RemotesPage() {
  const [profiles, setProfiles] = useState<RemoteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editPort, setEditPort] = useState(22);
  const [editUsername, setEditUsername] = useState("");
  const [editAuthMethod, setEditAuthMethod] = useState<AuthMethod>("key");
  const [editKeyPath, setEditKeyPath] = useState("");
  const [editKeyContent, setEditKeyContent] = useState("");
  const [keyInputMode, setKeyInputMode] = useState<KeyInputMode>("path");
  const [editEnvVars, setEditEnvVars] = useState<VarRow[]>([]);

  // Connection test state
  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    slug: string;
    ok: boolean;
    error?: string;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listRemoteProfiles().then((data) => {
      setProfiles(data);
      setLoading(false);
    }).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
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
    setEditKeyContent("");
    setKeyInputMode("path");
    setEditEnvVars([]);
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
    setEditKeyContent(profile.keyContent || "");
    setKeyInputMode(profile.keyContent ? "paste" : "path");
    setEditEnvVars(
      profile.envVars
        ? Object.entries(profile.envVars).map(([key, value]) => ({ key, value }))
        : [],
    );
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
    setEditKeyContent("");
    setKeyInputMode("path");
    setEditEnvVars([]);
    setError("");
  }

  async function handleSave() {
    setError("");
    try {
      const envVarsObj: Record<string, string> = {};
      for (const row of editEnvVars) {
        const k = row.key.trim();
        if (k) envVarsObj[k] = row.value;
      }

      const data = {
        name: editName,
        host: editHost,
        port: editPort,
        username: editUsername,
        authMethod: editAuthMethod,
        keyPath: editAuthMethod === "key" && keyInputMode === "path"
          ? editKeyPath : undefined,
        keyContent: editAuthMethod === "key" &&
          (keyInputMode === "paste" || keyInputMode === "upload")
          ? editKeyContent : undefined,
        envVars: Object.keys(envVarsObj).length > 0
          ? envVarsObj : undefined,
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

  async function handleTest(slug: string) {
    setTestingSlug(slug);
    setTestResult(null);
    try {
      const result = await api.testRemote(slug);
      setTestResult({ slug, ok: result.ok, error: result.error });
    } catch (e: unknown) {
      setTestResult({
        slug,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTestingSlug(null);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditKeyContent(reader.result as string);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const isEditing = editingSlug !== null;

  function authBadge(method: AuthMethod) {
    const labels: Record<AuthMethod, string> = {
      key: "SSH Key",
      password: "Password",
      tailscale: "Tailscale",
    };
    const colors: Record<AuthMethod, string> = {
      key: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      password: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      tailscale: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[method]}`}>
        {labels[method]}
      </span>
    );
  }

  return (
    <div className="h-full bg-cc-bg text-cc-fg font-sans-ui antialiased overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 pb-safe">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Remotes</h1>
            <p className="text-xs text-cc-muted mt-1">
              Manage SSH remote profiles for running Claude Code on
              remote machines.
            </p>
          </div>
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
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mb-4 px-3 py-2 rounded-lg bg-cc-error/10 border border-cc-error/20 text-xs text-cc-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Profile form */}
        {isEditing && (
          <div
            className="mb-6 bg-cc-card border border-cc-border rounded-xl p-4 sm:p-5 space-y-4"
            data-testid="remote-form"
          >
            <h2 className="text-sm font-semibold">
              {editingSlug === "__new__"
                ? "Add remote profile"
                : "Edit remote profile"}
            </h2>

            {/* Name */}
            <div>
              <label
                htmlFor="remote-name"
                className="block text-[11px] text-cc-muted mb-1.5"
              >
                Name
              </label>
              <input
                id="remote-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. GPU Server"
                className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
              />
            </div>

            {/* Host + Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label
                  htmlFor="remote-host"
                  className="block text-[11px] text-cc-muted mb-1.5"
                >
                  Host
                </label>
                <input
                  id="remote-host"
                  value={editHost}
                  onChange={(e) => setEditHost(e.target.value)}
                  placeholder="e.g. 192.168.1.100"
                  className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
                />
              </div>
              <div>
                <label
                  htmlFor="remote-port"
                  className="block text-[11px] text-cc-muted mb-1.5"
                >
                  Port
                </label>
                <input
                  id="remote-port"
                  type="number"
                  value={editPort}
                  onChange={(e) => setEditPort(Number(e.target.value))}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label
                htmlFor="remote-username"
                className="block text-[11px] text-cc-muted mb-1.5"
              >
                Username
              </label>
              <input
                id="remote-username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="e.g. root"
                className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg"
              />
            </div>

            {/* Auth method toggle group */}
            <div>
              <label className="block text-[11px] text-cc-muted mb-1.5">
                Authentication
              </label>
              <div
                className="flex rounded-lg border border-cc-border overflow-hidden"
                role="radiogroup"
                aria-label="Authentication method"
              >
                {(["key", "password", "tailscale"] as AuthMethod[]).map(
                  (method) => (
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
                      {method === "key"
                        ? "SSH Key"
                        : method === "password"
                          ? "Password"
                          : "Tailscale"}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* SSH Key sub-section */}
            {editAuthMethod === "key" && (
              <div className="space-y-3">
                {/* Key input mode tabs */}
                <div className="flex gap-1">
                  {(["path", "upload", "paste"] as KeyInputMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setKeyInputMode(mode)}
                        className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                          keyInputMode === mode
                            ? "bg-cc-hover text-cc-fg font-medium"
                            : "text-cc-muted hover:text-cc-fg"
                        }`}
                      >
                        {mode === "path"
                          ? "Path"
                          : mode === "upload"
                            ? "Upload"
                            : "Paste"}
                      </button>
                    ),
                  )}
                </div>

                {keyInputMode === "path" && (
                  <div>
                    <label
                      htmlFor="remote-keypath"
                      className="block text-[11px] text-cc-muted mb-1.5"
                    >
                      Key path
                    </label>
                    <input
                      id="remote-keypath"
                      value={editKeyPath}
                      onChange={(e) => setEditKeyPath(e.target.value)}
                      placeholder="e.g. ~/.ssh/id_rsa"
                      className="w-full px-3 py-2.5 min-h-[44px] bg-cc-input-bg border border-cc-border rounded-lg text-sm text-cc-fg font-mono-code"
                    />
                  </div>
                )}

                {keyInputMode === "upload" && (
                  <div>
                    <label className="block text-[11px] text-cc-muted mb-1.5">
                      Upload key file
                    </label>
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-cc-border rounded-lg bg-cc-input-bg hover:bg-cc-hover transition-colors cursor-pointer">
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="w-5 h-5 text-cc-muted mb-1"
                      >
                        <path d="M.5 9.9a.5.5 0 01.5.1v2.5a1 1 0 001 1h12a1 1 0 001-1V10a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2V10a.5.5 0 01.5-.1zM7.646 1.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 2.707V11.5a.5.5 0 01-1 0V2.707L5.354 4.854a.5.5 0 11-.708-.708l3-3z" />
                      </svg>
                      <span className="text-[11px] text-cc-muted">
                        {editKeyContent
                          ? "Key loaded"
                          : "Drop or click to upload"}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={handleFileUpload}
                        data-testid="key-file-input"
                      />
                    </label>
                  </div>
                )}

                {keyInputMode === "paste" && (
                  <div>
                    <label
                      htmlFor="remote-keycontent"
                      className="block text-[11px] text-cc-muted mb-1.5"
                    >
                      Paste key content
                    </label>
                    <textarea
                      id="remote-keycontent"
                      value={editKeyContent}
                      onChange={(e) => setEditKeyContent(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      rows={4}
                      className="w-full px-3 py-2.5 bg-cc-input-bg border border-cc-border rounded-lg text-xs text-cc-fg font-mono-code resize-none"
                      data-testid="key-paste-textarea"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Environment variables */}
            <div>
              <label className="block text-[11px] text-cc-muted mb-1.5">
                Environment variables
              </label>
              <div className="space-y-1.5">
                {editEnvVars.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      value={row.key}
                      onChange={(e) => {
                        const updated = [...editEnvVars];
                        updated[i] = { ...row, key: e.target.value };
                        setEditEnvVars(updated);
                      }}
                      placeholder="KEY"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-md text-cc-fg font-mono-code"
                      data-testid={`env-key-${i}`}
                    />
                    <span className="text-cc-muted text-xs">=</span>
                    <input
                      value={row.value}
                      onChange={(e) => {
                        const updated = [...editEnvVars];
                        updated[i] = { ...row, value: e.target.value };
                        setEditEnvVars(updated);
                      }}
                      placeholder="value"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-md text-cc-fg font-mono-code"
                      data-testid={`env-value-${i}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditEnvVars(editEnvVars.filter((_, j) => j !== i))
                      }
                      className="text-red-400 hover:text-red-300 text-xs px-1.5 cursor-pointer"
                      title="Remove variable"
                      data-testid={`env-remove-${i}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setEditEnvVars([...editEnvVars, { key: "", value: "" }])
                  }
                  className="text-[11px] text-cc-muted hover:text-cc-fg transition-colors cursor-pointer"
                  data-testid="add-env-var-btn"
                >
                  + Add variable
                </button>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 pt-2">
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

        {/* Profile list */}
        {loading ? (
          <div className="text-sm text-cc-muted">Loading...</div>
        ) : profiles.length === 0 && !isEditing ? (
          <div
            className="bg-cc-card border border-cc-border rounded-xl p-8 text-center"
            data-testid="empty-message"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-8 h-8 text-cc-muted/40 mx-auto mb-3"
            >
              <path d="M0 2.5A1.5 1.5 0 011.5 1h5.879a1.5 1.5 0 011.06.44l.44.44H14.5A1.5 1.5 0 0116 3.38v1.12H0V2.5zM16 6H0v7.5A1.5 1.5 0 001.5 15h13a1.5 1.5 0 001.5-1.5V6zM5 10.5a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5z" />
            </svg>
            <p className="text-sm text-cc-muted">
              No remote profiles yet.
            </p>
            <p className="text-xs text-cc-muted mt-1">
              Add one to get started with remote sessions.
            </p>
          </div>
        ) : (
          !isEditing && (
            <div className="space-y-2" data-testid="profile-list">
              {profiles.map((p) => (
                <div
                  key={p.slug}
                  className="flex items-center justify-between gap-3 px-4 py-3 bg-cc-card border border-cc-border rounded-xl hover:bg-cc-hover/50 transition-colors"
                  data-testid={`profile-${p.slug}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-cc-fg">
                        {p.name}
                      </span>
                      {authBadge(p.authMethod)}
                      {p.envVars &&
                        Object.keys(p.envVars).length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-cc-border text-cc-muted">
                            {Object.keys(p.envVars).length} env var
                            {Object.keys(p.envVars).length !== 1 ? "s" : ""}
                          </span>
                        )}
                    </div>
                    <div className="text-xs text-cc-muted mt-0.5 font-mono-code">
                      {p.username}@{p.host}:{p.port}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {testResult?.slug === p.slug && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          testResult.ok
                            ? "text-emerald-400 bg-emerald-500/10"
                            : "text-red-400 bg-red-500/10"
                        }`}
                      >
                        {testResult.ok
                          ? "Connected"
                          : testResult.error || "Failed"}
                      </span>
                    )}
                    <button
                      onClick={() => handleTest(p.slug)}
                      disabled={testingSlug === p.slug}
                      className="px-2.5 py-1.5 text-[11px] rounded-lg text-cc-muted hover:text-cc-fg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer disabled:opacity-50"
                      data-testid={`test-${p.slug}`}
                    >
                      {testingSlug === p.slug ? "Testing..." : "Test"}
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="px-2.5 py-1.5 text-[11px] rounded-lg text-cc-muted hover:text-cc-fg bg-cc-hover hover:bg-cc-active transition-colors cursor-pointer"
                      data-testid={`edit-${p.slug}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.slug)}
                      className="px-2.5 py-1.5 text-[11px] rounded-lg text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer"
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
    </div>
  );
}
