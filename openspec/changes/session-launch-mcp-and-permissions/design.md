## Context

The Companion UI launches Claude Code and Codex CLI sessions with a set
of flags configured at session creation time (`HomePage.tsx` →
`api.createSessionStream()` → `POST /sessions/create` →
`cli-launcher.ts`). Several CLI flags that users need are not yet
surfaced:

- `--mcp-config` (Claude Code) / JSON-RPC config write (Codex) — extra
  MCP servers
- `--allow-dangerously-skip-permissions` (Claude Code) /
  `--dangerously-bypass-approvals-and-sandbox` (Codex) — dangerous
  permission bypass
- `--add-dir` (both CLIs) — additional directories for tool access
- `--permission-mode` (Claude Code) / approval policy (Codex) — already
  wired but defaults to `bypassPermissions` with no global override

Existing patterns to build on:
- **Manager pattern** (`env-manager.ts`, `provider-manager.ts`): JSON
  files in `~/.companion/<feature>/`, slug-based CRUD, sorted listing.
- **Settings pattern** (`settings-manager.ts`): single
  `~/.companion/settings.json` with typed fields, `normalize()` for
  defaults, `updateSettings()` with patch semantics.
- **Route registration** (`registerXRoutes(api)` in
  `web/server/routes/`).
- **FolderPicker** component: existing directory browser with recent
  dirs, manual input, and path navigation.
- **Mode selector** (`backends.ts`): `CLAUDE_MODES` / `CODEX_MODES`
  arrays, `getDefaultMode()` returns first entry.

## Goals / Non-goals

**Goals:**

- Surface `--mcp-config`, `--add-dir`,
  `--allow-dangerously-skip-permissions`, and a global default
  permission mode through the Companion UI.
- Persist MCP configs and directory presets for reuse across sessions.
- Maintain full parity between Claude Code and Codex backends.
- Add safety guardrails for dangerous permission bypass.

**Non-goals:**

- Mid-session MCP config changes (existing `mcp_set_servers` WebSocket
  message already handles this).
- MCP config editing within the UI (users upload pre-built JSON files).
- Changing the existing in-session permission mode toggle in
  `Composer.tsx`.
- Remote/container-specific handling of additional directories (handled
  by the CLI itself).

## Decisions

### D1: MCP config manager follows the env-manager pattern

**Choice:** New `mcp-config-manager.ts` with CRUD operations storing
JSON files in `~/.companion/mcp-configs/`.

**Rationale:** The env-manager pattern is well-established in this
codebase (env-manager, provider-manager, remote-profile-manager). It
provides slug-based file naming, collision detection, and sorted
listing. The MCP config content is stored as-is (the uploaded JSON),
wrapped in a metadata envelope with `name`, `slug`, `createdAt`,
`updatedAt`.

**Alternative considered:** Storing MCP configs inline in settings.json.
Rejected because configs can be large and users may want multiple named
presets.

### D2: MCP config passed as file path, not inline JSON

**Choice:** Write the uploaded JSON to `~/.companion/mcp-configs/` and
pass the file path to `--mcp-config <path>`.

**Rationale:** Claude Code's `--mcp-config` accepts file paths or
inline JSON strings. File paths avoid shell escaping issues and work
cleanly with `Bun.spawn` args arrays. The file already exists from the
upload step.

For Codex, the MCP config is written via the JSON-RPC
`config/value/write` call at adapter initialization, since Codex manages
MCP through its config system rather than CLI flags.

### D3: Additional directories manager as a lightweight preset system

**Choice:** New `add-dirs-manager.ts` storing named directory presets
in `~/.companion/add-dirs/`. Each preset is a JSON file with `name`,
`slug`, `directories: string[]`, and timestamps.

**Rationale:** Users often work across the same set of directories
(e.g. a monorepo with shared libs). Persisting presets avoids re-entry.
The manager pattern keeps it consistent with MCP configs and envs.

The session creation UI provides:
1. A dropdown to select a saved preset (or "None").
2. An inline multi-input for ad-hoc directories (each with a
   FolderPicker button).
3. Ad-hoc directories can be saved as a preset from the UI.

At launch time, directories from the selected preset and any ad-hoc
entries are merged and passed as repeated `--add-dir` flags.

### D4: Dangerous permissions as a separate boolean, not a permission mode

**Choice:** `allowDangerousPermissions: boolean` as a standalone field
on `CreateSessionOpts` and `SdkSessionInfo`, separate from the existing
`permissionMode` selector.

**Rationale:** The dangerous bypass flags are orthogonal to the
permission mode. Claude Code's `--allow-dangerously-skip-permissions`
makes bypass *available* without changing the active mode. Conflating
them in the mode selector would confuse the UX — the mode selector
controls normal operation, while this toggle unlocks a safety hatch.

For Codex, `--dangerously-bypass-approvals-and-sandbox` is more
aggressive (it activates immediately). The UI warning must reflect this
difference.

### D5: Confirmation dialog for dangerous permissions

**Choice:** A modal confirmation dialog shown after the user enables the
toggle and before the session launches. The dialog:
- States clearly what the flag does for the selected backend.
- Requires the user to type a confirmation word (e.g. "DANGER") or
  check a checkbox.
- Shows different copy for Claude Code vs Codex (since Codex's flag is
  more aggressive).

**Rationale:** This is a high-risk action. A simple toggle without
friction is insufficient. The confirmation pattern is standard for
dangerous operations.

### D6: Default permission mode in CompanionSettings

**Choice:** Add `defaultPermissionMode: string` to
`CompanionSettings` with default value `"plan"`.

**Rationale:** Currently `getDefaultMode()` in `backends.ts` returns
the first entry in `CLAUDE_MODES` / `CODEX_MODES` (which is
`bypassPermissions`). This is hardcoded and not user-configurable.
Adding it to settings allows users to set their preferred default once.

The flow:
1. `getDefaultMode()` is updated to accept an optional override from
   settings.
2. `HomePage.tsx` fetches settings on mount and passes the default to
   `getDefaultMode()`.
3. The per-session mode selector pre-populates from this default but
   remains fully overridable.

The setting maps to both Claude Code and Codex backends:

| Setting value      | Claude Code `--permission-mode` | Codex approval      |
|--------------------|-------------------------------|---------------------|
| `plan`             | `plan`                        | `untrusted`         |
| `default`          | `default`                     | `untrusted`         |
| `acceptEdits`      | `acceptEdits`                 | `on-request`        |
| `bypassPermissions`| `bypassPermissions`           | (full-auto flag)    |

### D7: Upload via multipart form POST

**Choice:** MCP config upload uses `POST /api/mcp-configs` with
`multipart/form-data` containing the JSON file and an optional `name`
field.

**Rationale:** Standard file upload pattern. The server validates the
JSON structure before saving. If no name is provided, the filename
(minus extension) is used as the preset name.

## Risks / Trade-offs

**[Risk] Codex has no soft-enable for dangerous permissions**
Codex's `--dangerously-bypass-approvals-and-sandbox` activates
immediately (no soft-enable like Claude Code's `--allow-...` variant).
→ *Mitigation:* The confirmation dialog for Codex sessions uses stronger
warning language and explicitly states that bypass is immediate, not
optional.

**[Risk] Invalid MCP config uploaded**
A malformed JSON file or one missing required fields could cause CLI
startup failures.
→ *Mitigation:* Server-side validation on upload: parse JSON, verify
top-level `mcpServers` key exists, verify each entry has `type` and
either `command` (stdio) or `url` (sse/http). Return 400 with specific
error on failure.

**[Risk] Directory paths may not exist at session launch time**
Saved presets may reference directories that have been deleted or
renamed.
→ *Mitigation:* The CLI itself validates `--add-dir` paths. No
server-side existence check needed — the CLI error surfaces through the
normal session error flow.

**[Risk] Settings migration for existing users**
Adding `defaultPermissionMode` to settings requires handling the case
where existing `settings.json` files lack this field.
→ *Mitigation:* The `normalize()` function in `settings-manager.ts`
already handles missing fields by applying defaults. The new field
defaults to `"plan"`, so existing users get plan mode on upgrade.

**[Trade-off] No MCP config editor**
Users must create MCP config JSON externally and upload it. An in-app
editor would be more convenient but adds significant complexity.
→ *Accepted:* File upload is sufficient for the initial implementation.
An editor can be added later if demand warrants it.
