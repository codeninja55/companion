# CLAUDE.md

This file provides guidance to Claude Code & Codex when working with code in this repository.

## What This Is

The Companion — a web UI for Claude Code & Codex. 
It reverse-engineers the undocumented `--sdk-url` WebSocket protocol in the Claude Code CLI to provide a browser-based interface for running multiple Claude Code sessions with streaming, tool call visibility, and permission control.

## Development Commands

```bash
# Dev server (Hono backend on :3456 + Vite HMR on :5174)
cd web && bun install && bun run dev

# Or from repo root (requires mise — see .mise.toml)
mise run dev

# Type checking
cd web && bun run typecheck

# Production build + serve
cd web && bun run build && bun run start

# Auth token management
cd web && bun run generate-token          # show current token
cd web && bun run generate-token --force  # regenerate a new token

# Landing page (thecompanion.sh) — idempotent: starts if down, no-op if up
# IMPORTANT: Always use this script to run the landing page. Never cd into landing/ and run bun/vite manually.
./scripts/landing-start.sh          # start
./scripts/landing-start.sh --stop   # stop
```

## Testing

```bash
# Run tests
cd web && bun run test

# Watch mode
cd web && bun run test:watch
```

- All new backend (`web/server/`) and frontend (`web/src/`) code **must** include tests when possible.
- **Every new or modified frontend component** (`web/src/components/`) **must** have an accompanying `.test.tsx` file with at minimum: a render test, an axe accessibility scan (`toHaveNoViolations()`), and tests for any interactive behavior (clicks, keyboard shortcuts, state changes).
- Tests use Vitest. Server tests live alongside source files (e.g. `routes.test.ts` next to `routes.ts`).
- A husky pre-commit hook runs typecheck and tests automatically before each commit.
- **Never remove or delete existing tests.** If a test is failing, fix the code or the test. If you believe a test should be removed, you must first explain to the user why and get explicit approval before removing it.
- When creating test, make sure to document what the test is validating, and any important context or edge cases in comments within the test code.

## Component Playground

All UI components used in the message/chat flow **must** be represented in the Playground page (`web/src/components/Playground.tsx`, accessible at `#/playground`). When adding or modifying a message-related component (e.g. `MessageBubble`, `ToolBlock`, `PermissionBanner`, `Composer`, streaming indicators, tool groups, subagent groups), update the Playground to include a mock of the new or changed state.

## Architecture

### Data flow

```
Browser (React) ←→ WebSocket ←→ Hono Server (Bun) ←→ WebSocket ←→ CLI
     :5174        /ws/browser/:id      :3456       /ws/cli/:id    (--sdk-url)
                  /ws/terminal/:id                                 PTY sessions
```

1. Browser sends a "create session" REST call to the server
2. Server spawns `claude --sdk-url ws://…/ws/cli/SESSION_ID` as a
   subprocess (or `codex --full-auto` for Codex sessions)
3. CLI connects back to the server over WebSocket — Claude Code uses
   NDJSON, Codex uses JSON-RPC (`codex-adapter.ts` translates)
4. Server bridges messages between CLI WebSocket and browser WebSocket
5. Tool calls arrive as `control_request` (subtype `can_use_tool`) —
   browser renders approval UI, server relays `control_response` back
6. Terminal sessions use `/ws/terminal/:id` for PTY connections
   (`terminal-manager.ts`)

### All code lives under `web/`

- **`web/server/`** — Hono + Bun backend (runs on port 3456). Key
  subsystems:
  - **Core:** `index.ts` (bootstrap, Bun.serve, WebSocket upgrade
    routing), `constants.ts`, `service.ts` (launchd/systemd),
    `cache-headers.ts`
  - **WebSocket bridge:** `ws-bridge.ts` (core router, per-session
    state) + split modules: `-browser`, `-codex`, `-controls`,
    `-replay`, `-types`
  - **CLI management:** `cli-launcher.ts` (spawn/kill/resume),
    `codex-adapter.ts` (JSON-RPC translation), `codex-home.ts`,
    `path-resolver.ts`
  - **Session persistence:** `session-store.ts` (JSON file in
    `$TMPDIR/vibe-sessions/`), `session-types.ts`,
    `session-names.ts`, `session-git-info.ts`,
    `session-linear-issues.ts`
  - **Auth/containers:** `auth-manager.ts`, `container-manager.ts`,
    `image-pull-manager.ts`, `claude-container-auth.ts`,
    `codex-container-auth.ts`
  - **Agents/scheduling:** `agent-executor.ts`, `agent-store.ts`,
    `agent-types.ts`, `cron-scheduler.ts`, `cron-store.ts`,
    `cron-types.ts`
  - **Integrations:** `relay-client.ts` (cloud relay),
    `chat-bot.ts` (chat SDK), `pr-poller.ts` (GitHub PR polling),
    `linear-project-manager.ts`, `linear-cache.ts`
  - **Manager pattern** (`~/.companion/<feature>/` CRUD):
    `env-manager.ts`, `provider-manager.ts`, `push-manager.ts`,
    `remote-profile-manager.ts`, `prompt-manager.ts`,
    `settings-manager.ts`, `ssh-manager.ts`, `terminal-manager.ts`
  - **Utilities:** `think-tag-parser.ts`, `recorder.ts`, `replay.ts`,
    `auto-namer.ts`, `ai-validator.ts`, `update-checker.ts`,
    `git-utils.ts`, `worktree-tracker.ts`, `usage-limits.ts`
  - **Routes** (`web/server/routes/`): 14 modules following the
    `registerXRoutes(api)` pattern — agent, chat, cron, env, fs,
    git, linear, prompt, provider, push, remote, settings, skills,
    system. `routes.ts` imports all 14 + inline session CRUD.

- **`web/src/`** — React 19 frontend
  - `store.ts` — Zustand store, all state keyed by session ID.
  - `ws.ts` — Browser WebSocket client per session, auto-reconnects.
  - `terminal-ws.ts` — Terminal WebSocket client.
  - `sw.ts` / `sw-register.ts` — Service worker for push
    notifications.
  - `api.ts` — REST client for session management.
  - `types.ts` — Re-exports server types + client-only types.
  - `App.tsx` — Root layout with hash routing (`#/playground`).
  - `components/` — 50+ UI components grouped by area:
    - **Session flow:** `ChatView`, `MessageFeed`, `MessageBubble`,
      `ToolBlock`, `Composer`, `PermissionBanner`,
      `SessionCreationProgress`, `SessionLaunchOverlay`,
      `SessionEditorPane`
    - **Navigation:** `Sidebar`, `TopBar`, `HomePage`, `LoginPage`,
      `SettingsPage`
    - **Panels:** `TaskPanel`, `FilesPanel`, `DiffPanel`,
      `DiffViewer`, `McpPanel`, `ProcessPanel`
    - **Terminal:** `TerminalView`, `TerminalPage`,
      `SessionTerminalDock`
    - **Integrations:** `LinearSettingsPage`, `IntegrationsPage`
    - **Config:** `EnvManager`, `ProviderManager`, `RemoteManager`,
      `RemoteConnect`, `ModelSwitcher`, `ClaudeMdEditor`,
      `PromptsPage`, `FolderPicker`
    - **Agents:** `AgentsPage`, `RunsPage`, `CronManager`
    - **Utilities:** `AppErrorBoundary`, `Playground`,
      `DockerBuilderPage`, `UpdateBanner`, `UpdateOverlay`

- **`web/bin/cli.ts`** — CLI entry point (`bunx the-companion`). Sets
  `__COMPANION_PACKAGE_ROOT` and imports the server.

### WebSocket protocol

The CLI uses NDJSON (newline-delimited JSON). Key message types from CLI:
`system` (init/status), `assistant`, `result`, `stream_event`,
`control_request`, `tool_progress`, `tool_use_summary`, `keep_alive`.
Messages to CLI: `user`, `control_response`, `control_request` (for
interrupt/set_model/set_permission_mode).

Terminal sessions use `/ws/terminal/:id` for PTY connections
(`terminal-manager.ts`). Codex sessions use JSON-RPC instead of NDJSON;
`codex-adapter.ts` translates between the two wire formats.

Full protocol documentation: `WEBSOCKET_PROTOCOL_REVERSED.md` (Claude
Code NDJSON) and `CODEX_MAPPING.md` (Codex JSON-RPC translation).

### Session Lifecycle

Sessions persist to disk (`$TMPDIR/vibe-sessions/`) and survive server restarts. On restart, live CLI processes are detected by PID and given a grace period to reconnect their WebSocket. If they don't, they're killed and relaunched with `--resume` using the CLI's internal session ID.

### Raw Protocol Recordings

The server automatically records **all raw protocol messages** (both Claude Code NDJSON and Codex JSON-RPC) to JSONL files. This is useful for debugging, understanding the protocol, and building replay-based tests.

- **Location**: `~/.companion/recordings/` (override with `COMPANION_RECORDINGS_DIR`)
- **Format**: JSONL — one JSON object per line. First line is a header with session metadata, subsequent lines are raw message entries.
- **File naming**: `{sessionId}_{backendType}_{ISO-timestamp}_{randomSuffix}.jsonl`
- **Disable**: set `COMPANION_RECORD=0` or `COMPANION_RECORD=false`
- **Rotation**: automatic cleanup when total lines exceed 1M (configurable via `COMPANION_RECORDINGS_MAX_LINES`)

Each entry captures:
```json
{"ts": 1771153996875, "dir": "in", "raw": "{\"type\":\"system\",...}", "ch": "cli"}
```
- `dir`: `"in"` (received by server) or `"out"` (sent by server)
- `ch`: `"cli"` (Claude Code / Codex process) or `"browser"` (frontend WebSocket)
- `raw`: the exact original string — never re-serialized, preserving the true protocol payload

**REST API**:
- `GET /api/recordings` — list all recording files with metadata
- `GET /api/sessions/:id/recording/status` — check if a session is recording + file path
- `POST /api/sessions/:id/recording/start` / `stop` — enable/disable per session

**Code**: `web/server/recorder.ts` (recorder + manager), `web/server/replay.ts` (load & filter utilities).

## Browser Exploration

Always use `agent-browser` CLI command to explore the browser. Never use playwright or other browser automation libraries.

## Development Guidelines

This document contains critical information about working with this codebase. Follow these guidelines precisely.

### Writing code

- CRITICAL: NEVER USE `--no-verify` WHEN COMMITTING CODE
- We prefer simple, clean, maintainable solutions over clever or complex ones, even if the latter is more concise or performant. Readability and maintainability are primary concerns.
- Make the smallest reasonable changes to get to the desired outcome. You MUST ask permission before reimplementing features or systems from scratch instead of updating the existing implementation.
- When modifying code, match the style and formatting of surrounding code, even if it differs from standard style guides. Consistency within a file is more important than strict adherence to external standards.
- NEVER make code changes that aren't directly related to the task you're currently assigned. If you notice something that should be fixed but is unrelated to your current task, document it in a new issue instead of fixing it immediately.
- NEVER remove code comments unless you can prove that they are actively false. Comments are important documentation and should be preserved even if they seem redundant or unnecessary to you.
- When writing comments, avoid referring to temporal context about refactoring or recent changes. Comments should be evergreen and describe the code as it is, not how it evolved or was recently changed.
- When you are trying to fix a bug or compilation error or any other issue, YOU MUST NEVER throw away the old implementation and rewrite without explicit permission from me. If you are going to do this, YOU MUST STOP and get explicit permission from me.
- NEVER name things as 'improved' or 'new' or 'enhanced,' etc. Code naming should be evergreen. What is "new" today will be "old" someday.

### Coding Best Practices

- **Early Returns**: Use to avoid nested conditions
- **Descriptive Names**: Use clear variable/function names (prefix handlers with "handle")
- **Constants Over Functions**: Use constants where possible
- **DRY Code**: Don't repeat yourself
- **Functional Style**: Prefer functional, immutable approaches when not verbose
- **Minimal Changes**: Only modify code related to the task at hand
- **Function Ordering**: Define composing functions before their components
- **TODO Comments**: Mark issues in existing code with "TODO:" prefix
- **Simplicity**: Prioritize simplicity and readability over clever solutions
- **Build Iteratively** Start with minimal functionality and verify it works before adding complexity
- **Run Tests**: Test your code frequently with realistic inputs and validate outputs
- **Build Test Environments**: Create testing environments for components that are challenging and difficult to validate directly
- **Functional Code**: Use functional and stateless approaches where they improve clarity
- **Clean logic**: Keep core logic clean and push implementation details to the edges
- **File Organisation**: Balance file organization with simplicity - use an appropriate number of files for the project scale

## Pull Requests

When submitting a pull request:
- use commitzen to format the commit message and the PR title
- Add a screenshot of the changes in the PR description if its a visual change
- Explain simply what the PR does and why it's needed
- Tell me if the code was reviewed by a human or simply generated directly by an AI. 

## Linear Issues

When creating or updating Linear issues:
- do not use commitzen-style titles in Linear
- use clear product-style titles that describe user value/outcome

### How To Open A PR With GitHub CLI

Use this flow from the repository root:

```bash
# 1) Create a branch
git checkout -b fix/short-description (commitzen)

# 2) Commit using commitzen format
git add <files>
git commit -m "fix(scope): short summary" (commitzen)

# 3) Push and set upstream
git push -u origin fix/short-description

# 4) Create PR (title should follow commitzen style)
gh pr create --base main --head fix/short-description --title "fix(scope): short summary"
```

For multi-line PR descriptions, prefer a body file to avoid shell quoting issues:

```bash
cat > /tmp/pr_body.md <<'EOF'
## Summary
- what changed

## Why
- why this is needed

## Testing
- what was run

## Review provenance
- Implemented by AI agent / Human
- Human review: yes/no
EOF

gh pr edit --body-file /tmp/pr_body.md
```

## Codex & Claude Code
- All features must be compatible with both Codex and Claude Code. If a feature is only compatible with one, it must be gated behind a clear UI affordance (e.g. "This feature requires Claude Code") and the incompatible option should be hidden or disabled.
- When implementing a new feature, always consider how it will work with both models and test with both if possible. If a feature is only implemented for one model, document that clearly in the code and in the UI.

## Content Strategy

- Document just enough for user success - not too much, not too little.
- Prioritize accuracy and usability of information.
- Make content evergreen when possible.
- Search for existing information before adding new content.
- Check existing patterns for consistency
- Start by making the smallest reasonable changes.
- When writing in Markdown, ensure the content does not exceed 120 characters per line.

## Writing standards

- Second-person voice ("you")
- Prerequisites at the start of procedural content.
- Test all code examples before publishing.
- Match style and formatting of existing pages.
- Include both basic and advanced use cases.
- Language tags on all code blocks.
- Relative paths for internal links.
- Use broadly applicable examples rather than overly specific business cases.
- Lead with context when helpful, - explain what something is before diving into implementation detail.
- Use sentence case for all headers ("Getting started" not "Getting Started").
- Use sentence case for code block titles ("Expanded example" not "Expanded Example")
- Prefer active voice and direct language.
- Remove unnecessary words while maintaining clarity.
- Break complex instructions into clear numbered steps.
- Make language more precise and contextual.

### Language and tone standards

- Avoid promotional language. You are a technical writing assistant, not a marketer or marketing person. Never use phrases like "breathtaking" or "exceptional value."
- Reduce conjunction overuse. Limit use of "moreover," "furthermore," "additionally," "on the other hand," and "consequently." Favour direct, clear statements.
- Avoid editorializing. Remove phrases like "it's important to note," "this article will," "in conclusion," or personal interpretations.
- No undue emphasis. Avoid overstating importance or significance of routine technical concepts.

### Technical accuracy standards

- **VERIFY** all links. Every link, both internal and external, must be tested and functional before publication.
- Maintain consistency. Use consistent terminology, formatting, and language variety throughout all documentation.
- Valid technical references. Ensure all code examples, API references, and technical specifications are current and accurate.
