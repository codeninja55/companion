## 1. Default permission mode (settings foundation)

- [ ] 1.1 Add `defaultPermissionMode` field to `CompanionSettings` in
  `settings-manager.ts` with default `"plan"`, update `normalize()`
  and `updateSettings()` patch type
- [ ] 1.2 Expose `defaultPermissionMode` in GET/PUT `/api/settings` in
  `settings-routes.ts` with validation (must be one of `plan`,
  `default`, `acceptEdits`, `bypassPermissions`)
- [ ] 1.3 Unit tests for `settings-manager.ts`: default value, persist
  round-trip, invalid value handling
- [ ] 1.4 Update `getDefaultMode()` in `web/src/utils/backends.ts` to
  accept an optional override parameter
- [ ] 1.5 Update `HomePage.tsx` to fetch settings on mount and pass
  `defaultPermissionMode` to `getDefaultMode()` for initial mode
  state
- [ ] 1.6 Add default permission mode dropdown to the Settings page UI
- [ ] 1.7 Update `POST /sessions/create` in `routes.ts` to fall back
  to `defaultPermissionMode` from settings when `permissionMode` is
  not provided in the request body
- [ ] 1.8 Component test for Settings page dropdown (render, change,
  persist)

## 2. MCP config manager (backend)

- [ ] 2.1 Create `mcp-config-manager.ts` following env-manager pattern:
  types (`McpConfigPreset` with name, slug, config, timestamps),
  `slugify()`, `ensureDir()` for `~/.companion/mcp-configs/`
- [ ] 2.2 Implement CRUD functions: `listMcpConfigs()`,
  `getMcpConfig(slug)`, `createMcpConfig(name, config)`,
  `deleteMcpConfig(slug)`
- [ ] 2.3 Add JSON validation: parse uploaded content, verify
  top-level `mcpServers` key, verify each entry has `type` and
  either `command` or `url`
- [ ] 2.4 Unit tests for `mcp-config-manager.ts`: create, list, get,
  delete, duplicate slug rejection, invalid JSON, missing
  mcpServers key
- [ ] 2.5 Create `routes/mcp-config-routes.ts` with
  `registerMcpConfigRoutes(api)`: `POST` (multipart upload),
  `GET /api/mcp-configs`, `GET /api/mcp-configs/:slug`,
  `DELETE /api/mcp-configs/:slug`
- [ ] 2.6 Import and register in `routes.ts`
- [ ] 2.7 Unit tests for `mcp-config-routes.ts`: upload valid file,
  reject invalid, list, get, delete, 404 cases

## 3. Additional directories manager (backend)

- [ ] 3.1 Create `add-dirs-manager.ts` following env-manager pattern:
  types (`AddDirsPreset` with name, slug, directories array,
  timestamps), `slugify()`, `ensureDir()` for
  `~/.companion/add-dirs/`
- [ ] 3.2 Implement CRUD functions: `listAddDirs()`,
  `getAddDirs(slug)`, `createAddDirs(name, directories)`,
  `updateAddDirs(slug, updates)`, `deleteAddDirs(slug)` — update
  supports rename (delete old file, write new slug)
- [ ] 3.3 Unit tests for `add-dirs-manager.ts`: create, list, get,
  update, rename, delete, duplicate slug rejection, empty array
  rejection
- [ ] 3.4 Create `routes/add-dirs-routes.ts` with
  `registerAddDirsRoutes(api)`: `POST`, `GET /api/add-dirs`,
  `GET /api/add-dirs/:slug`, `PUT /api/add-dirs/:slug`,
  `DELETE /api/add-dirs/:slug`
- [ ] 3.5 Import and register in `routes.ts`
- [ ] 3.6 Unit tests for `add-dirs-routes.ts`: create, list, get,
  update, delete, 404 cases, validation errors

## 4. Session types and API contract

- [ ] 4.1 Extend `SdkSessionInfo` in `cli-launcher.ts` with
  `mcpConfigSlug?: string`, `allowDangerousPermissions?: boolean`,
  `addDirsSlug?: string`
- [ ] 4.2 Extend `LaunchOptions` in `cli-launcher.ts` with
  `mcpConfigSlug?: string`, `allowDangerousPermissions?: boolean`,
  `addDirs?: string[]`
- [ ] 4.3 Extend `CreateSessionOpts` in `api.ts` with
  `mcpConfigSlug?: string`, `allowDangerousPermissions?: boolean`,
  `addDirsSlug?: string`
- [ ] 4.4 Update `POST /sessions/create` in `routes.ts` to accept
  and pass through the three new fields to the launcher

## 5. CLI launcher flag injection

- [ ] 5.1 In `spawnCLI()`: add `--mcp-config <path>` arg when
  `mcpConfigSlug` is set (resolve path via
  `getMcpConfig(slug)` file path)
- [ ] 5.2 In `spawnCLI()`: add `--allow-dangerously-skip-permissions`
  flag when `allowDangerousPermissions` is `true`
- [ ] 5.3 In `spawnCLI()`: add repeated `--add-dir <dir>` args from
  `addDirs` array
- [ ] 5.4 In `spawnCodex()` / `spawnCodexWs()`: add
  `--dangerously-bypass-approvals-and-sandbox` flag when
  `allowDangerousPermissions` is `true`
- [ ] 5.5 In `spawnCodex()` / `spawnCodexWs()`: add repeated
  `--add-dir <dir>` args from `addDirs` array
- [ ] 5.6 In Codex adapter initialization: write MCP config content
  via JSON-RPC `config/value/write` when `mcpConfigSlug` is set
- [ ] 5.7 Tests for CLI launcher: verify args array includes
  `--mcp-config`, `--allow-dangerously-skip-permissions`,
  `--add-dir` for Claude Code sessions
- [ ] 5.8 Tests for CLI launcher: verify args include
  `--dangerously-bypass-approvals-and-sandbox`, `--add-dir` for
  Codex sessions
- [ ] 5.9 Tests for Codex adapter: verify MCP config written via
  JSON-RPC at init

## 6. Session creation UI (HomePage)

- [ ] 6.1 Add MCP config preset dropdown to session creation UI —
  fetch presets on mount, show selector with "None" default
- [ ] 6.2 Add file upload button next to MCP config dropdown — on
  upload, POST to `/api/mcp-configs`, refresh preset list, select
  the uploaded preset
- [ ] 6.3 Add dangerous permissions toggle — visually distinct from
  mode selector, off by default
- [ ] 6.4 Add confirmation dialog component for dangerous permissions
  — backend-specific warning copy (Claude Code vs Codex), requires
  checkbox acknowledgment before confirming
- [ ] 6.5 Wire confirmation dialog: show on toggle enable, revert
  toggle if cancelled
- [ ] 6.6 Add multi-directory input section — add/remove rows, each
  with text input and FolderPicker button
- [ ] 6.7 Add directory preset dropdown — fetch presets on mount,
  populate rows on selection
- [ ] 6.8 Wire all new fields into `createSessionStream()` call:
  `mcpConfigSlug`, `allowDangerousPermissions`, `addDirsSlug`
  (or resolve ad-hoc dirs inline)
- [ ] 6.9 Component tests for MCP config selector (render, select,
  upload flow)
- [ ] 6.10 Component tests for dangerous permissions toggle and
  confirmation dialog (enable, cancel, confirm, backend-specific
  copy)
- [ ] 6.11 Component tests for multi-directory input (add row, remove
  row, folder picker integration, preset selection)

## 7. Session view indicator

- [ ] 7.1 Add warning banner/badge component for dangerous permissions
  — persistent, visible in session top bar or chat header
- [ ] 7.2 Read `allowDangerousPermissions` from session state and
  conditionally render the indicator
- [ ] 7.3 Component test for indicator (visible when flag is true,
  hidden when false)

## 8. Management UI (settings/management page)

- [ ] 8.1 Add MCP config management section — list presets with name,
  server count, date; preview button shows server names/types;
  delete with confirmation
- [ ] 8.2 Add directory presets management section — list presets with
  name, directory count, date; edit (name + directories); delete
  with confirmation
- [ ] 8.3 Component tests for MCP config management (list, preview,
  delete)
- [ ] 8.4 Component tests for directory presets management (list,
  edit, delete)

## 9. Agent progress panel

- [ ] 9.1 Create `AgentProgressPanel.tsx` component — reads
  `toolProgress` from store, filters for Agent/Task tools, shows
  collapsible panel with count and per-agent duration
- [ ] 9.2 Persist collapse state to `localStorage` key
  `cc-agent-panel-collapsed`, read on mount
- [ ] 9.3 Render `AgentProgressPanel` in `TaskPanel.tsx` after the
  section loop
- [ ] 9.4 Component tests for `AgentProgressPanel`: render empty,
  render with agents, axe accessibility, collapse/expand toggle,
  localStorage persist, tool filtering, duration formatting
- [ ] 9.5 Playground section for `AgentProgressPanel` with mock
  Agent/Task/Bash tool progress data

## 10. Playground updates

- [ ] 10.1 Add mock states for dangerous permissions indicator to
  Playground page
- [ ] 10.2 Add mock states for MCP config selector and multi-directory
  input to Playground page
