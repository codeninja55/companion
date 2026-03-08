// @vitest-environment jsdom
/**
 * Tests for AddDirsPanel component.
 *
 * AddDirsPanel is a TaskPanel section that displays the working directory
 * for the active session. It reads the session's cwd (or remoteCwd for
 * remote sessions) from the Zustand store and renders it as a compact badge.
 * Returns null when no display path is available.
 *
 * Coverage:
 * - Render test and axe accessibility scan
 * - Shows working directory path from session cwd
 * - Shows remote path when remoteCwd is set, with "remote" badge
 * - Returns null when no path is available
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Store Mock ──────────────────────────────────────────────────
const mockUseStore = vi.fn();

vi.mock("../store.js", () => ({
  useStore: (selector: (state: unknown) => unknown) => mockUseStore(selector),
}));

import { AddDirsPanel } from "./AddDirsPanel.js";

function makeStoreState(overrides: Record<string, unknown> = {}) {
  return {
    sdkSessions: [{
      sessionId: "test-session",
      cwd: "/home/user/project",
      state: "running",
      createdAt: Date.now(),
      ...overrides,
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return a session with a local cwd
  mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
    selector(makeStoreState()),
  );
});

describe("AddDirsPanel", () => {
  it("renders without crashing", () => {
    render(<AddDirsPanel sessionId="test-session" />);
    expect(screen.getByTestId("add-dirs-panel")).toBeInTheDocument();
  });

  it("passes axe accessibility scan", async () => {
    const { container } = render(<AddDirsPanel sessionId="test-session" />);
    const { axe } = await import("vitest-axe");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("shows working directory path", () => {
    render(<AddDirsPanel sessionId="test-session" />);
    expect(screen.getByText("/home/user/project")).toBeInTheDocument();
  });

  it("shows remoteCwd when available, with remote label", () => {
    mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector(makeStoreState({
        cwd: "/home/user/project",
        remoteCwd: "/remote/workspace",
      })),
    );

    render(<AddDirsPanel sessionId="test-session" />);
    expect(screen.getByText("/remote/workspace")).toBeInTheDocument();
    expect(screen.getByText("remote")).toBeInTheDocument();
  });

  it("returns null when no display path is available", () => {
    mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector(makeStoreState({ cwd: "", remoteCwd: undefined })),
    );

    const { container } = render(<AddDirsPanel sessionId="test-session" />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when session is not found", () => {
    mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ sdkSessions: [] }),
    );

    const { container } = render(<AddDirsPanel sessionId="nonexistent" />);
    expect(container.innerHTML).toBe("");
  });
});
