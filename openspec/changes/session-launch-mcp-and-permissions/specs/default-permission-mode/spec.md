## ADDED Requirements

### Requirement: Default permission mode setting

The system SHALL store a `defaultPermissionMode` field in
`CompanionSettings` (`~/.companion/settings.json`). The allowed values
are `plan`, `default`, `acceptEdits`, and `bypassPermissions`. The
default value MUST be `"plan"`.

#### Scenario: Default value for new installations

- **WHEN** a user has no existing `settings.json` or the file lacks
  a `defaultPermissionMode` field
- **THEN** the `normalize()` function returns `"plan"` as the default

#### Scenario: Persist setting

- **WHEN** a user updates `defaultPermissionMode` via
  `PUT /api/settings` with a valid value
- **THEN** the value is saved to `settings.json` and returned in the
  response

#### Scenario: Invalid value rejected

- **WHEN** a user sends an invalid `defaultPermissionMode` value
  (not one of the four allowed values)
- **THEN** the system returns HTTP 400 with a descriptive error

### Requirement: Settings UI for default permission mode

The Settings page SHALL provide a dropdown or selector for choosing the
default permission mode, alongside other global preferences.

#### Scenario: View current default

- **WHEN** a user navigates to the Settings page
- **THEN** the current `defaultPermissionMode` is shown in the
  selector

#### Scenario: Change default

- **WHEN** a user selects a different permission mode from the
  dropdown
- **THEN** the setting is saved via `PUT /api/settings` and the UI
  reflects the change

### Requirement: Session creation pre-populates from global default

The session creation UI SHALL read the `defaultPermissionMode` from
settings and use it as the initial value for the per-session permission
mode selector. The user MUST be able to override this per session.

#### Scenario: Pre-populate with global default

- **WHEN** a user opens the session creation UI and the global
  default is `"plan"`
- **THEN** the permission mode selector shows "Plan" as the selected
  value

#### Scenario: Override per session

- **WHEN** a user changes the permission mode selector to a value
  different from the global default
- **THEN** the session is created with the overridden value, not the
  global default

#### Scenario: Global default applies to both backends

- **WHEN** the global default is `"plan"` and the user switches
  between Claude Code and Codex backends
- **THEN** the permission mode selector shows the equivalent of
  `"plan"` for both backends

### Requirement: Fallback in session creation API

The `POST /sessions/create` endpoint SHALL use the global
`defaultPermissionMode` from settings when no `permissionMode` is
provided in the request body.

#### Scenario: No permission mode in request

- **WHEN** a session creation request omits `permissionMode`
- **THEN** the server reads `defaultPermissionMode` from settings
  and uses it as the session's permission mode

#### Scenario: Explicit permission mode in request

- **WHEN** a session creation request includes an explicit
  `permissionMode`
- **THEN** the provided value is used, ignoring the global default
