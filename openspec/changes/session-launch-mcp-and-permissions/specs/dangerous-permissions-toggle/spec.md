## ADDED Requirements

### Requirement: Dangerous permissions toggle at session creation

The session creation UI SHALL provide a toggle for enabling dangerous
permission bypass. The toggle MUST be off by default, visually distinct
from the standard permission mode selector, and clearly labeled as
dangerous.

#### Scenario: Toggle off by default

- **WHEN** a user opens the session creation UI
- **THEN** the dangerous permissions toggle is off

#### Scenario: Enable toggle

- **WHEN** a user enables the dangerous permissions toggle
- **THEN** a confirmation dialog is shown before the setting takes
  effect

### Requirement: Confirmation dialog for dangerous permissions

The system SHALL show a modal confirmation dialog when a user enables
the dangerous permissions toggle. The dialog MUST require explicit user
action (checkbox acknowledgment or typed confirmation) before
proceeding.

#### Scenario: Confirmation for Claude Code backend

- **WHEN** the user enables the toggle with Claude Code as the
  selected backend
- **THEN** the dialog explains that
  `--allow-dangerously-skip-permissions` makes permission bypass
  available as an option and requires the user to confirm

#### Scenario: Confirmation for Codex backend

- **WHEN** the user enables the toggle with Codex as the selected
  backend
- **THEN** the dialog explains that
  `--dangerously-bypass-approvals-and-sandbox` immediately skips all
  confirmations and removes sandboxing, and requires the user to
  confirm

#### Scenario: User cancels confirmation

- **WHEN** the user dismisses the confirmation dialog without
  confirming
- **THEN** the toggle remains off

### Requirement: Pass dangerous permissions flag to Claude Code

The system SHALL pass `--allow-dangerously-skip-permissions` when
spawning a Claude Code session that has `allowDangerousPermissions`
set to `true`.

#### Scenario: Dangerous permissions enabled

- **WHEN** a Claude Code session is created with
  `allowDangerousPermissions: true`
- **THEN** the CLI process is spawned with
  `--allow-dangerously-skip-permissions`

#### Scenario: Dangerous permissions disabled

- **WHEN** a Claude Code session is created with
  `allowDangerousPermissions` unset or `false`
- **THEN** the CLI process is spawned without the flag

### Requirement: Pass dangerous permissions flag to Codex

The system SHALL pass `--dangerously-bypass-approvals-and-sandbox` when
spawning a Codex session that has `allowDangerousPermissions` set to
`true`.

#### Scenario: Codex dangerous permissions enabled

- **WHEN** a Codex session is created with
  `allowDangerousPermissions: true`
- **THEN** the CLI process is spawned with
  `--dangerously-bypass-approvals-and-sandbox`

### Requirement: Visual indicator for active dangerous permissions

The session UI SHALL display a persistent visual indicator (banner or
badge) when a session is running with dangerous permissions enabled.
The indicator MUST remain visible for the lifetime of the session.

#### Scenario: Session with dangerous permissions

- **WHEN** a session with `allowDangerousPermissions: true` is active
- **THEN** a warning indicator is visible in the session view (e.g.
  in the top bar or as a banner)

#### Scenario: Session without dangerous permissions

- **WHEN** a session without dangerous permissions is active
- **THEN** no warning indicator is shown

### Requirement: Persist dangerous permissions in session state

The system SHALL persist the `allowDangerousPermissions` boolean in
`SdkSessionInfo` so that the flag survives server restarts and is
available for UI display.

#### Scenario: Session state persistence

- **WHEN** a session with `allowDangerousPermissions: true` is saved
  to disk
- **THEN** the field is present in the persisted session JSON and
  restored on server restart
