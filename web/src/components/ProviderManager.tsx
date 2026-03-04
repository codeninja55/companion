import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api, type ModelProvider } from "../api.js";

interface Props {
  onClose?: () => void;
}

export function ProviderManager({ onClose }: Props) {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editing state
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editMaxTokens, setEditMaxTokens] = useState("");
  const [editModels, setEditModels] = useState<string[]>([]);

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBaseUrl, setCreateBaseUrl] = useState("");
  const [createApiKey, setCreateApiKey] = useState("");
  const [createMaxTokens, setCreateMaxTokens] = useState("");
  const [createModels, setCreateModels] = useState<string[]>([]);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const list = await api.listProviders();
      setProviders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  function startEdit(provider: ModelProvider) {
    setEditingSlug(provider.slug);
    setEditName(provider.name);
    setEditBaseUrl(provider.baseUrl);
    setEditApiKey(provider.apiKey || "");
    setEditMaxTokens(provider.maxContextTokens?.toString() || "");
    setEditModels(provider.models);
    setTestResult(null);
    setShowCreate(false);
  }

  function cancelEdit() {
    setEditingSlug(null);
    setTestResult(null);
  }

  async function handleSave() {
    if (!editingSlug) return;
    setError("");
    try {
      await api.updateProvider(editingSlug, {
        name: editName,
        baseUrl: editBaseUrl,
        apiKey: editApiKey || undefined,
        models: editModels,
        maxContextTokens: editMaxTokens ? Number(editMaxTokens) : undefined,
      });
      setEditingSlug(null);
      setTestResult(null);
      await loadProviders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreate() {
    setError("");
    try {
      await api.createProvider({
        name: createName,
        baseUrl: createBaseUrl,
        apiKey: createApiKey || undefined,
        models: createModels,
        maxContextTokens: createMaxTokens ? Number(createMaxTokens) : undefined,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateBaseUrl("");
      setCreateApiKey("");
      setCreateMaxTokens("");
      setCreateModels([]);
      setTestResult(null);
      await loadProviders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(slug: string) {
    setError("");
    try {
      await api.deleteProvider(slug);
      if (editingSlug === slug) setEditingSlug(null);
      await loadProviders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTestConnection(slug?: string) {
    setTesting(true);
    setTestResult(null);
    try {
      let result: { ok: boolean; models: string[]; error?: string };
      if (slug) {
        result = await api.testProviderConnection(slug);
      } else {
        // For creating, test via a temporary create+test+delete — but we
        // don't have a slug yet. Instead, use the unsaved baseUrl/apiKey to
        // test. The route tests an existing slug, so we need to create first.
        // For simplicity, call the testConnection endpoint directly.
        result = await api.testProviderConnectionDirect(
          editingSlug ? editBaseUrl : createBaseUrl,
          editingSlug ? editApiKey : createApiKey,
        );
      }
      setTestResult({ ok: result.ok, error: result.error });
      if (result.ok && result.models.length > 0) {
        if (editingSlug) {
          setEditModels(result.models);
        } else {
          setCreateModels(result.models);
        }
      }
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────

  function renderProviderForm(
    name: string,
    setName: (v: string) => void,
    baseUrl: string,
    setBaseUrl: (v: string) => void,
    apiKey: string,
    setApiKey: (v: string) => void,
    maxTokens: string,
    setMaxTokens: (v: string) => void,
    models: string[],
    slug?: string,
  ) {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-cc-muted mb-1 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Local vLLM"
            className="w-full px-3 py-2 min-h-[44px] text-xs bg-cc-input border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary"
          />
        </div>
        <div>
          <label className="text-[11px] text-cc-muted mb-1 block">Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:8000/v1"
            className="w-full px-3 py-2 min-h-[44px] text-xs bg-cc-input border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-cc-muted mb-1 block">API Key (optional)</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            className="w-full px-3 py-2 min-h-[44px] text-xs bg-cc-input border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-cc-muted mb-1 block">Max Context Tokens (optional)</label>
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            placeholder="e.g. 8192"
            className="w-full px-3 py-2 min-h-[44px] text-xs bg-cc-input border border-cc-border rounded-lg text-cc-fg placeholder:text-cc-muted focus:outline-none focus:border-cc-primary font-mono"
          />
        </div>

        {/* Test connection button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleTestConnection(slug)}
            disabled={testing || !(slug ? true : baseUrl.trim())}
            className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg transition-colors cursor-pointer bg-cc-hover text-cc-fg hover:bg-cc-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testResult && (
            <span className={`text-[11px] ${testResult.ok ? "text-green-500" : "text-cc-error"}`}>
              {testResult.ok ? "Connected" : testResult.error || "Failed"}
            </span>
          )}
        </div>

        {/* Model list */}
        {models.length > 0 && (
          <div>
            <label className="text-[11px] text-cc-muted mb-1 block">
              Available Models ({models.length})
            </label>
            <div className="rounded-lg border border-cc-border bg-cc-input p-2 max-h-32 overflow-y-auto">
              {models.map((m) => (
                <div key={m} className="text-xs text-cc-fg py-0.5 font-mono">{m}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Provider list ────────────────────────────────────────────────

  const providersList = loading ? (
    <div className="text-xs text-cc-muted text-center py-4">Loading...</div>
  ) : providers.length === 0 && !showCreate ? (
    <div className="text-xs text-cc-muted text-center py-4">
      No providers configured.
    </div>
  ) : (
    <div className="space-y-2">
      {providers.map((provider) => (
        <div key={provider.slug} className="rounded-xl border border-cc-border bg-cc-card">
          <div
            className="flex items-center justify-between px-3 py-2.5 min-h-[44px] cursor-pointer"
            onClick={() => editingSlug === provider.slug ? cancelEdit() : startEdit(provider)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") editingSlug === provider.slug ? cancelEdit() : startEdit(provider); }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-cc-fg truncate">{provider.name}</div>
              <div className="text-[10px] text-cc-muted truncate font-mono">{provider.baseUrl}</div>
            </div>
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {provider.models.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cc-primary/10 text-cc-primary">
                  {provider.models.length} model{provider.models.length !== 1 ? "s" : ""}
                </span>
              )}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`w-3 h-3 text-cc-muted transition-transform ${editingSlug === provider.slug ? "rotate-180" : ""}`}
              >
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {editingSlug === provider.slug && (
            <div className="px-3 pb-3 pt-1 border-t border-cc-border space-y-3">
              {renderProviderForm(
                editName, setEditName,
                editBaseUrl, setEditBaseUrl,
                editApiKey, setEditApiKey,
                editMaxTokens, setEditMaxTokens,
                editModels,
                provider.slug,
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex-1 px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg bg-cc-primary text-white hover:bg-cc-primary/90 transition-colors cursor-pointer"
                >
                  Save
                </button>
                <button
                  onClick={() => handleDelete(provider.slug)}
                  className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg bg-cc-error/10 text-cc-error hover:bg-cc-error/20 transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  // ─── Create form ──────────────────────────────────────────────────

  const createForm = showCreate ? (
    <div className="rounded-xl border border-cc-primary/30 bg-cc-card p-3 space-y-3">
      <div className="text-xs font-medium text-cc-fg">Add Provider</div>
      {renderProviderForm(
        createName, setCreateName,
        createBaseUrl, setCreateBaseUrl,
        createApiKey, setCreateApiKey,
        createMaxTokens, setCreateMaxTokens,
        createModels,
      )}
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={!createName.trim() || !createBaseUrl.trim()}
          className="flex-1 px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg bg-cc-primary text-white hover:bg-cc-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
        <button
          onClick={() => {
            setShowCreate(false);
            setTestResult(null);
          }}
          className="px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg bg-cc-hover text-cc-fg hover:bg-cc-border transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => {
        setShowCreate(true);
        setEditingSlug(null);
        setTestResult(null);
      }}
      className="w-full px-3 py-2.5 min-h-[44px] text-xs text-cc-primary hover:bg-cc-primary/5 rounded-xl border border-dashed border-cc-primary/30 transition-colors cursor-pointer"
    >
      + Add Provider
    </button>
  );

  // ─── Panel layout ─────────────────────────────────────────────────

  const panel = (
    <div
      className="w-full max-w-lg max-h-[90dvh] sm:max-h-[80dvh] mx-0 sm:mx-4 flex flex-col bg-cc-bg rounded-t-[14px] sm:rounded-[14px] shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4">
        <h2 className="text-sm font-semibold text-cc-fg">Model Providers</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 sm:py-4 pb-safe space-y-4">
        {error && <div className="px-3 py-2 rounded-lg bg-cc-error/10 text-xs text-cc-error">{error}</div>}
        {providersList}
        {createForm}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      {panel}
    </div>,
    document.body,
  );
}
