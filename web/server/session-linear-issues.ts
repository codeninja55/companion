import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredLinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  url: string;
  branchName: string;
  priorityLabel: string;
  stateName: string;
  stateType: string;
  teamName: string;
  teamKey: string;
  teamId: string;
  assigneeName?: string;
  updatedAt?: string;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const DEFAULT_PATH = join(homedir(), ".companion", "session-linear-issues.json");

// ─── Store ───────────────────────────────────────────────────────────────────

let issues: Record<string, StoredLinearIssue[]> = {};
let loaded = false;
let filePath = DEFAULT_PATH;

/** Detect whether a value is a bare StoredLinearIssue (legacy format). */
function isBareIssue(value: unknown): value is StoredLinearIssue {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).identifier === "string"
  );
}

function ensureLoaded(): void {
  if (loaded) return;
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Migrate legacy format: bare objects → single-element arrays
      let migrated = false;
      const result: Record<string, StoredLinearIssue[]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
          result[key] = value as StoredLinearIssue[];
        } else if (isBareIssue(value)) {
          result[key] = [value];
          migrated = true;
        }
      }
      issues = result;

      if (migrated) {
        persist();
      }
    }
  } catch {
    issues = {};
  }
  loaded = true;
}

function persist(): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(issues, null, 2), "utf-8");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getLinearIssues(sessionId: string): StoredLinearIssue[] {
  ensureLoaded();
  return issues[sessionId] ?? [];
}

/** Add an issue to a session. Deduplicates by issue ID (updates if exists). */
export function addLinearIssue(sessionId: string, issue: StoredLinearIssue): void {
  ensureLoaded();
  const existing = issues[sessionId] ?? [];
  const idx = existing.findIndex((i) => i.id === issue.id);
  if (idx >= 0) {
    existing[idx] = issue;
  } else {
    existing.push(issue);
  }
  issues[sessionId] = existing;
  persist();
}

/** Remove a single issue by its Linear issue ID. */
export function removeLinearIssue(sessionId: string, issueId: string): void {
  ensureLoaded();
  const existing = issues[sessionId];
  if (!existing) return;
  issues[sessionId] = existing.filter((i) => i.id !== issueId);
  if (issues[sessionId].length === 0) {
    delete issues[sessionId];
  }
  persist();
}

/** Remove all issues for a session. Used during session deletion. */
export function removeAllLinearIssues(sessionId: string): void {
  ensureLoaded();
  if (!(sessionId in issues)) return;
  delete issues[sessionId];
  persist();
}

export function getAllLinearIssues(): Record<string, StoredLinearIssue[]> {
  ensureLoaded();
  return { ...issues };
}

/** Reset internal state and optionally set a custom file path (for testing). */
export function _resetForTest(customPath?: string): void {
  issues = {};
  loaded = false;
  filePath = customPath || DEFAULT_PATH;
}
