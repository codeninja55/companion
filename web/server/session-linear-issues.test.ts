import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getLinearIssues,
  addLinearIssue,
  getAllLinearIssues,
  removeLinearIssue,
  removeAllLinearIssues,
  _resetForTest,
  type StoredLinearIssue,
} from "./session-linear-issues.js";

let tempDir: string;

const mockIssue: StoredLinearIssue = {
  id: "issue-1",
  identifier: "ENG-123",
  title: "Fix auth bug",
  description: "Authentication is broken when using SSO",
  url: "https://linear.app/team/issue/ENG-123",
  branchName: "eng-123-fix-auth-bug",
  priorityLabel: "High",
  stateName: "In Progress",
  stateType: "started",
  teamName: "Engineering",
  teamKey: "ENG",
  teamId: "team-1",
};

const mockIssue2: StoredLinearIssue = {
  ...mockIssue,
  id: "issue-2",
  identifier: "ENG-456",
  title: "Add dark mode",
};

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "session-linear-issues-test-"));
  _resetForTest(join(tempDir, "session-linear-issues.json"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("session-linear-issues", () => {
  // ─── getLinearIssues ─────────────────────────────────────────────────

  it("returns empty array for unknown session", () => {
    expect(getLinearIssues("unknown")).toEqual([]);
  });

  // ─── addLinearIssue ──────────────────────────────────────────────────

  it("addLinearIssue + getLinearIssues round-trip", () => {
    addLinearIssue("s1", mockIssue);
    expect(getLinearIssues("s1")).toEqual([mockIssue]);
  });

  it("addLinearIssue appends multiple issues", () => {
    addLinearIssue("s1", mockIssue);
    addLinearIssue("s1", mockIssue2);
    const issues = getLinearIssues("s1");
    expect(issues).toHaveLength(2);
    expect(issues[0].identifier).toBe("ENG-123");
    expect(issues[1].identifier).toBe("ENG-456");
  });

  it("addLinearIssue deduplicates by ID (updates in place)", () => {
    addLinearIssue("s1", mockIssue);
    const updated = { ...mockIssue, stateName: "Done", stateType: "completed" };
    addLinearIssue("s1", updated);
    const issues = getLinearIssues("s1");
    expect(issues).toHaveLength(1);
    expect(issues[0].stateName).toBe("Done");
  });

  it("persists to disk in array format", () => {
    addLinearIssue("s1", mockIssue);
    const raw = readFileSync(join(tempDir, "session-linear-issues.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.s1).toEqual([mockIssue]);
  });

  // ─── removeLinearIssue ───────────────────────────────────────────────

  it("removeLinearIssue removes one issue by ID", () => {
    addLinearIssue("s1", mockIssue);
    addLinearIssue("s1", mockIssue2);
    removeLinearIssue("s1", "issue-1");
    const issues = getLinearIssues("s1");
    expect(issues).toHaveLength(1);
    expect(issues[0].identifier).toBe("ENG-456");
  });

  it("removeLinearIssue cleans up entry when last issue is removed", () => {
    addLinearIssue("s1", mockIssue);
    removeLinearIssue("s1", "issue-1");
    expect(getLinearIssues("s1")).toEqual([]);
    const raw = readFileSync(join(tempDir, "session-linear-issues.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual({});
  });

  it("removeLinearIssue is a no-op for non-existent issue ID", () => {
    addLinearIssue("s1", mockIssue);
    removeLinearIssue("s1", "nonexistent");
    expect(getLinearIssues("s1")).toEqual([mockIssue]);
  });

  it("removeLinearIssue is a no-op for non-existent session", () => {
    removeLinearIssue("nonexistent", "issue-1");
    expect(getLinearIssues("nonexistent")).toEqual([]);
  });

  // ─── removeAllLinearIssues ───────────────────────────────────────────

  it("removeAllLinearIssues removes all issues for a session", () => {
    addLinearIssue("s1", mockIssue);
    addLinearIssue("s1", mockIssue2);
    removeAllLinearIssues("s1");
    expect(getLinearIssues("s1")).toEqual([]);
  });

  it("removeAllLinearIssues does not affect other sessions", () => {
    addLinearIssue("s1", mockIssue);
    addLinearIssue("s2", mockIssue2);
    removeAllLinearIssues("s1");
    expect(getLinearIssues("s2")).toEqual([mockIssue2]);
  });

  // ─── getAllLinearIssues ───────────────────────────────────────────────

  it("getAllLinearIssues returns a copy", () => {
    addLinearIssue("s1", mockIssue);
    const all = getAllLinearIssues();
    expect(all.s1).toEqual([mockIssue]);
    // Verify it's a copy (mutating doesn't affect internal state)
    all.s2 = [mockIssue2];
    expect(getLinearIssues("s2")).toEqual([]);
  });

  // ─── Cross-session independence ──────────────────────────────────────

  it("supports multiple sessions with different issues", () => {
    addLinearIssue("s1", mockIssue);
    addLinearIssue("s2", mockIssue2);
    expect(getLinearIssues("s1")[0].identifier).toBe("ENG-123");
    expect(getLinearIssues("s2")[0].identifier).toBe("ENG-456");
    const all = getAllLinearIssues();
    expect(Object.keys(all)).toHaveLength(2);
  });

  // ─── Legacy migration ───────────────────────────────────────────────

  it("migrates legacy single-issue format to array on load", () => {
    // Write legacy format: bare object instead of array
    writeFileSync(
      join(tempDir, "session-linear-issues.json"),
      JSON.stringify({ s1: mockIssue }),
    );
    _resetForTest(join(tempDir, "session-linear-issues.json"));

    // Should return as array after migration
    expect(getLinearIssues("s1")).toEqual([mockIssue]);

    // File should have been rewritten in array format
    const raw = readFileSync(join(tempDir, "session-linear-issues.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(Array.isArray(data.s1)).toBe(true);
    expect(data.s1).toEqual([mockIssue]);
  });

  it("loads already-migrated array format without modification", () => {
    writeFileSync(
      join(tempDir, "session-linear-issues.json"),
      JSON.stringify({ s1: [mockIssue] }),
    );
    _resetForTest(join(tempDir, "session-linear-issues.json"));
    expect(getLinearIssues("s1")).toEqual([mockIssue]);
  });

  // ─── Edge cases ──────────────────────────────────────────────────────

  it("handles corrupt JSON gracefully", () => {
    writeFileSync(join(tempDir, "session-linear-issues.json"), "NOT VALID JSON");
    _resetForTest(join(tempDir, "session-linear-issues.json"));
    expect(getLinearIssues("any")).toEqual([]);
  });

  it("creates parent directories if needed", () => {
    const nestedPath = join(tempDir, "nested", "dir", "issues.json");
    _resetForTest(nestedPath);
    addLinearIssue("s1", mockIssue);
    expect(getLinearIssues("s1")).toEqual([mockIssue]);
  });
});
