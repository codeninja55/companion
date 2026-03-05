## ADDED Requirements

### Requirement: Upload MCP config file

The system SHALL accept a JSON file upload via
`POST /api/mcp-configs` (multipart/form-data) containing MCP server
definitions in the standard Claude Code format
(`{ "mcpServers": { ... } }`). The system SHALL validate the JSON
structure before saving and return 400 with a descriptive error if
validation fails.

#### Scenario: Valid MCP config upload

- **WHEN** a user uploads a valid JSON file with a top-level
  `mcpServers` key where each entry has a `type` field and either
  `command` (for stdio) or `url` (for sse/http/sdk)
- **THEN** the system saves the file to `~/.companion/mcp-configs/`
  as `<slug>.json` with metadata envelope (name, slug, config content,
  createdAt, updatedAt) and returns the saved preset

#### Scenario: Invalid JSON structure

- **WHEN** a user uploads a file that is not valid JSON
- **THEN** the system returns HTTP 400 with error "Invalid JSON"

#### Scenario: Missing mcpServers key

- **WHEN** a user uploads valid JSON that lacks a top-level
  `mcpServers` key
- **THEN** the system returns HTTP 400 with error describing the
  missing key

#### Scenario: Duplicate name

- **WHEN** a user uploads a config with a name that slugifies to an
  existing preset's slug
- **THEN** the system returns HTTP 409 with error indicating a preset
  with a similar name already exists

### Requirement: List MCP config presets

The system SHALL return all saved MCP config presets via
`GET /api/mcp-configs`, sorted alphabetically by name.

#### Scenario: List with presets

- **WHEN** a user requests the list and presets exist
- **THEN** the system returns an array of presets with name, slug,
  server count, createdAt, and updatedAt for each

#### Scenario: List when empty

- **WHEN** a user requests the list and no presets exist
- **THEN** the system returns an empty array

### Requirement: Get MCP config preset

The system SHALL return a single MCP config preset by slug via
`GET /api/mcp-configs/:slug`, including the full config content.

#### Scenario: Existing preset

- **WHEN** a user requests a preset by a valid slug
- **THEN** the system returns the full preset including config content

#### Scenario: Non-existent preset

- **WHEN** a user requests a preset by a slug that does not exist
- **THEN** the system returns HTTP 404

### Requirement: Delete MCP config preset

The system SHALL delete an MCP config preset by slug via
`DELETE /api/mcp-configs/:slug`.

#### Scenario: Successful deletion

- **WHEN** a user deletes a preset by a valid slug
- **THEN** the system removes the file and returns HTTP 200

#### Scenario: Non-existent preset deletion

- **WHEN** a user deletes a preset by a slug that does not exist
- **THEN** the system returns HTTP 404

### Requirement: Pass MCP config to Claude Code at launch

The system SHALL pass the saved config file path as
`--mcp-config <path>` when spawning a Claude Code session that has an
`mcpConfigSlug` specified.

#### Scenario: Session with MCP config

- **WHEN** a session is created with `mcpConfigSlug` set to a valid
  preset slug and the backend is Claude Code
- **THEN** the CLI process is spawned with `--mcp-config` pointing to
  the preset file in `~/.companion/mcp-configs/`

#### Scenario: Session without MCP config

- **WHEN** a session is created without `mcpConfigSlug`
- **THEN** the CLI process is spawned without the `--mcp-config` flag

### Requirement: Pass MCP config to Codex at launch

The system SHALL write the MCP server definitions from the saved config
into the Codex config via JSON-RPC `config/value/write` at adapter
initialization when a Codex session has an `mcpConfigSlug` specified.

#### Scenario: Codex session with MCP config

- **WHEN** a session is created with `mcpConfigSlug` set to a valid
  preset slug and the backend is Codex
- **THEN** the adapter writes the MCP server definitions into the
  Codex config at initialization

### Requirement: MCP config file upload UI

The session creation UI SHALL provide a file input that accepts `.json`
files for MCP config upload, and a dropdown to select from previously
saved presets.

#### Scenario: Upload via file picker

- **WHEN** a user clicks the MCP config upload control and selects a
  JSON file
- **THEN** the file is uploaded to the server and appears in the
  preset dropdown as selected

#### Scenario: Select existing preset

- **WHEN** a user selects a previously saved preset from the dropdown
- **THEN** the `mcpConfigSlug` is set for the session being created

### Requirement: MCP config management UI

The settings or management page SHALL provide a section to list, preview
(showing server names and types), and delete saved MCP config presets.

#### Scenario: View saved presets

- **WHEN** a user navigates to the MCP config management section
- **THEN** all saved presets are listed with name, server count, and
  creation date

#### Scenario: Delete from management UI

- **WHEN** a user clicks delete on a preset in the management UI
- **THEN** the preset is removed after confirmation
