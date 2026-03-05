## ADDED Requirements

### Requirement: Create directory preset

The system SHALL accept a named list of directories via
`POST /api/add-dirs` and persist it to
`~/.companion/add-dirs/<slug>.json` with metadata (name, slug,
directories array, createdAt, updatedAt).

#### Scenario: Valid preset creation

- **WHEN** a user creates a preset with a name and a non-empty array
  of directory paths
- **THEN** the system saves the preset and returns it with a
  generated slug

#### Scenario: Empty directories array

- **WHEN** a user creates a preset with an empty directories array
- **THEN** the system returns HTTP 400 with error "At least one
  directory is required"

#### Scenario: Duplicate name

- **WHEN** a user creates a preset with a name that slugifies to an
  existing preset's slug
- **THEN** the system returns HTTP 409

### Requirement: List directory presets

The system SHALL return all saved directory presets via
`GET /api/add-dirs`, sorted alphabetically by name.

#### Scenario: List with presets

- **WHEN** presets exist
- **THEN** the system returns an array with name, slug, directory
  count, and timestamps for each

#### Scenario: List when empty

- **WHEN** no presets exist
- **THEN** the system returns an empty array

### Requirement: Get directory preset

The system SHALL return a single directory preset by slug via
`GET /api/add-dirs/:slug`.

#### Scenario: Existing preset

- **WHEN** a valid slug is provided
- **THEN** the system returns the full preset including the
  directories array

#### Scenario: Non-existent preset

- **WHEN** a non-existent slug is provided
- **THEN** the system returns HTTP 404

### Requirement: Update directory preset

The system SHALL update a directory preset by slug via
`PUT /api/add-dirs/:slug`, supporting name and directories changes.
If the name changes, the file MUST be renamed to the new slug.

#### Scenario: Update directories

- **WHEN** a user updates the directories array of an existing preset
- **THEN** the preset is saved with the updated directories and
  `updatedAt` timestamp

#### Scenario: Rename preset

- **WHEN** a user updates the name of an existing preset
- **THEN** the old file is deleted, a file with the new slug is
  created, and the preset reflects the new name and slug

### Requirement: Delete directory preset

The system SHALL delete a directory preset by slug via
`DELETE /api/add-dirs/:slug`.

#### Scenario: Successful deletion

- **WHEN** a valid slug is provided
- **THEN** the file is removed and HTTP 200 is returned

#### Scenario: Non-existent preset deletion

- **WHEN** a non-existent slug is provided
- **THEN** the system returns HTTP 404

### Requirement: Pass additional directories to Claude Code at launch

The system SHALL pass each directory as a separate `--add-dir` argument
when spawning a Claude Code session that has additional directories
configured (from a preset and/or ad-hoc entries).

#### Scenario: Session with directory preset

- **WHEN** a session is created with `addDirsSlug` set to a valid
  preset containing directories `["/a", "/b"]`
- **THEN** the CLI process is spawned with `--add-dir /a --add-dir /b`

#### Scenario: Session without additional directories

- **WHEN** a session is created without `addDirsSlug` or ad-hoc
  directories
- **THEN** the CLI process is spawned without `--add-dir` flags

### Requirement: Pass additional directories to Codex at launch

The system SHALL pass each directory as a separate `--add-dir` argument
when spawning a Codex session that has additional directories
configured.

#### Scenario: Codex session with directories

- **WHEN** a Codex session is created with additional directories
  `["/a", "/b"]`
- **THEN** the Codex CLI process is spawned with
  `--add-dir /a --add-dir /b`

### Requirement: Multi-directory input with folder picker

The session creation UI SHALL provide a multi-entry input where each
row has a text field showing the directory path and a button to open the
FolderPicker. Users MUST be able to add and remove directory rows.

#### Scenario: Add directory via folder picker

- **WHEN** a user clicks the folder picker button on a directory row
- **THEN** the FolderPicker opens, and selecting a folder populates
  that row's path

#### Scenario: Add directory manually

- **WHEN** a user types a path into a directory row's text field
- **THEN** the path is accepted as-is

#### Scenario: Remove a directory row

- **WHEN** a user clicks the remove button on a directory row
- **THEN** the row is removed from the list

#### Scenario: Select saved preset

- **WHEN** a user selects a saved directory preset from the dropdown
- **THEN** the directory rows are populated with the preset's
  directories

### Requirement: Directory preset management UI

The settings or management page SHALL provide a section to list, edit,
and delete saved directory presets.

#### Scenario: View saved presets

- **WHEN** a user navigates to the directory presets management section
- **THEN** all saved presets are listed with name, directory count,
  and creation date

#### Scenario: Edit preset

- **WHEN** a user clicks edit on a preset
- **THEN** the preset's name and directories are editable and can be
  saved

#### Scenario: Delete preset

- **WHEN** a user clicks delete on a preset
- **THEN** the preset is removed after confirmation
