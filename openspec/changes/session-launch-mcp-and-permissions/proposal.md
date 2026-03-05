## Why

Session creation lacks several capabilities that power users need: the
ability to bring additional MCP servers into a session, a controlled way
to opt into dangerous permission bypass for sandboxed or trusted
environments, the ability to add extra directories to a session's tool
access scope, and a global default for session permission mode. The
first three map to CLI flags (`--mcp-config`,
`--allow-dangerously-skip-permissions`, `--add-dir`) not yet exposed
through the Companion UI. The fourth addresses the lack of a persistent
default — every session currently starts with an implicit default rather
than a user-chosen mode like `plan`.

## What changes

### Feature 1: MCP config upload at session creation

- Users can upload a JSON file containing MCP server definitions when
  creating a session.
- Uploaded configs persist to `~/.companion/mcp-configs/` for reuse
  across sessions (following the existing manager pattern used by
  env-manager, provider-manager, etc.).
- A management UI allows listing, previewing, and deleting saved MCP
  configs.
- At launch time, the saved config file path is passed to:
  - **Claude Code:** `--mcp-config <path>` flag (additive to existing
    MCP servers from the CLI's own config).
  - **Codex:** written into the Codex config via the JSON-RPC
    `config/value/write` call at session startup.
- The uploaded config format follows the standard Claude Code MCP config
  schema (`{ "mcpServers": { "<name>": { "type", "command", "args",
  "env", "url" } } }`).

### Feature 2: Dangerous permission bypass toggle

- A per-session toggle at creation time to enable dangerous permission
  bypass.
- The toggle is **opt-in and off by default** — it makes bypass
  *available* without enabling it automatically.
- At launch time, the flag is passed to:
  - **Claude Code:** `--allow-dangerously-skip-permissions` (makes
    bypass available as an option, does not enable it by default).
  - **Codex:** `--dangerously-bypass-approvals-and-sandbox` (Codex has
    no soft-enable equivalent; this is the closest parity).
- Safety guardrails:
  - A confirmation dialog with a clear warning before the session
    launches when the toggle is enabled.
  - A persistent visual indicator (e.g. banner or badge) in the session
    UI when a session is running with dangerous permissions enabled.
  - The toggle is visually distinct from the standard permission mode
    selector to avoid confusion.

### Feature 3: Additional directories at session creation

- Users can specify one or more extra directories to include in the
  session's tool access scope when creating a session.
- Directory lists persist to `~/.companion/add-dirs/` for reuse across
  sessions (following the existing manager pattern).
- The session creation UI provides a multi-directory input with a folder
  picker for selecting paths.
- At launch time, directories are passed to:
  - **Claude Code:** `--add-dir <dir1> --add-dir <dir2> ...` (allows
    tool access to those directories in addition to the session CWD).
  - **Codex:** `--add-dir <dir1> --add-dir <dir2> ...` (makes those
    directories writable alongside the primary workspace).
- A management UI allows listing, editing, and deleting saved directory
  presets.

### Feature 4: Default permission mode setting

- A global setting in `CompanionSettings` (`~/.companion/settings.json`)
  that defines the default permission mode for all sessions.
- **Default value: `plan`** — sessions start in plan mode unless the
  user overrides at creation time.
- Allowed values match the Claude Code `--permission-mode` choices:
  `plan`, `default` (agent mode), `acceptEdits`, `bypassPermissions`.
- The per-session permission mode selector in the session creation UI
  pre-populates from this global default but can be overridden per
  session.
- For Codex sessions, the global default maps to the equivalent
  `--ask-for-approval` value (`untrusted` for plan, `on-request` for
  default/agent, etc.).
- The setting is exposed in the Settings page alongside other global
  preferences.

### Feature 5: Agent progress panel

- An inline collapsible panel in the TaskPanel showing active sub-agents
  (Claude Code teammates) running within the current session.
- Sub-agents are detected from the `toolProgress` store: any active tool
  with `toolName` of `"Agent"` or `"Task"` represents a running
  sub-agent.
- The panel shows a count of active sub-agents and, when expanded, each
  agent's tool name and elapsed duration (formatted as `Xm XXs`).
- Collapse/expand state persists to `localStorage`.
- The panel renders nothing when no sub-agents are active — zero visual
  overhead for sessions without sub-agents.

## Capabilities

### New capabilities

- `mcp-config-manager`: upload, persist, list, preview, and delete MCP
  server configuration files. Integrates with session creation to pass
  configs to both Claude Code and Codex backends.
- `dangerous-permissions-toggle`: per-session opt-in toggle for
  dangerous permission bypass with confirmation dialog, visual indicator,
  and backend parity across Claude Code and Codex.
- `additional-directories`: persist and select directory presets at
  session creation, passed as `--add-dir` to both Claude Code and Codex
  backends. Includes a multi-path input with folder picker.
- `default-permission-mode`: global setting for the default permission
  mode applied to all sessions. Defaults to `plan`. Overridable per
  session at creation time.
- `agent-progress-panel`: inline sub-agent status panel in the
  TaskPanel. Filters `toolProgress` for Agent/Task tools, shows count
  and elapsed duration per agent. Collapsible with localStorage
  persistence.

### Modified capabilities

<!-- No existing specs to modify — this is a greenfield openspec setup. -->

## Impact

### Backend (`web/server/`)

- **`cli-launcher.ts`** — add `--mcp-config <path>`, `--add-dir`
  repeated args, and `--dangerously-bypass-approvals-and-sandbox` /
  `--allow-dangerously-skip-permissions` flags based on session opts.
- **`codex-adapter.ts`** — write uploaded MCP config into Codex via
  JSON-RPC at session startup.
- **`routes.ts`** (session creation) — accept `mcpConfigSlug`,
  `allowDangerousPermissions`, and `addDirsSlug` in
  `POST /sessions/create` body.
- **New file: `mcp-config-manager.ts`** — CRUD manager following the
  existing `~/.companion/<feature>/` pattern (env-manager, provider-
  manager, etc.).
- **New route module: `mcp-config-routes.ts`** — REST endpoints for
  upload, list, get, delete.
- **New file: `add-dirs-manager.ts`** — CRUD manager for directory
  presets following the `~/.companion/<feature>/` pattern.
- **New route module: `add-dirs-routes.ts`** — REST endpoints for
  create, list, get, update, delete directory presets.
- **`settings-manager.ts`** — add `defaultPermissionMode` field to
  `CompanionSettings` (default: `"plan"`), update `normalize()` and
  `updateSettings()`.
- **`routes/settings-routes.ts`** — expose `defaultPermissionMode` in
  GET/PUT `/settings`.
- **`routes.ts`** (session creation) — when `permissionMode` is not
  provided in the request body, fall back to the global
  `defaultPermissionMode` from settings.
- **`session-types.ts`** — extend `SdkSessionInfo` with
  `mcpConfigSlug`, `allowDangerousPermissions`, and `addDirsSlug`
  fields.

### Frontend (`web/src/`)

- **`api.ts`** — extend `CreateSessionOpts` with `mcpConfigSlug?`,
  `allowDangerousPermissions?`, and `addDirsSlug?` fields.
- **Session creation UI** — add MCP config file picker/uploader,
  dangerous permissions toggle with confirmation dialog,
  multi-directory input with folder picker, and pre-populate the
  permission mode selector from the global default setting.
- **Session view** — add a visual indicator (banner/badge) when
  dangerous permissions are active.
- **Settings/management page** — add MCP config management section
  (list, preview, delete saved configs), directory presets management
  section (list, edit, delete), and a default permission mode dropdown.
- **New file: `AgentProgressPanel.tsx`** — collapsible panel rendered in
  `TaskPanel` showing active sub-agents (Agent/Task tools from
  `toolProgress` store). Includes count header, per-agent duration, and
  localStorage collapse persistence.
- **`TaskPanel.tsx`** — renders `AgentProgressPanel` after the section
  loop.

### Testing

- Unit tests for `mcp-config-manager.ts` (CRUD, slug generation, file
  validation).
- Unit tests for `mcp-config-routes.ts` (upload, list, get, delete
  endpoints).
- Unit tests for `add-dirs-manager.ts` (CRUD, slug generation, path
  validation).
- Unit tests for `add-dirs-routes.ts` (create, list, get, update,
  delete endpoints).
- Tests for CLI launcher flag injection (all features, both backends).
- Tests for settings manager `defaultPermissionMode` (default value,
  persistence, fallback in session creation).
- Component tests for the upload UI, confirmation dialog, visual
  indicator, multi-directory input with folder picker, and default
  permission mode dropdown in settings.
- Component tests for `AgentProgressPanel`: render (empty/populated),
  axe accessibility, collapse/expand toggle, localStorage persistence,
  tool filtering (only Agent/Task), duration formatting.
- Playground section for `AgentProgressPanel` with mock sub-agent data.
