// @vitest-environment jsdom
/**
 * Tests for the AgentProgressPanel component.
 *
 * AgentProgressPanel displays a collapsible list of active sub-agents
 * (tools with toolName "Agent" or "Task") for a given session. It reads
 * from the toolProgress map in the Zustand store and persists its
 * collapsed state to localStorage.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---- Mock Store ----
interface MockStoreState {
  toolProgress: Map<string, Map<string, { toolName: string; elapsedSeconds: number }>>;
}

let mockState: MockStoreState;

function resetStore(overrides: Partial<MockStoreState> = {}) {
  mockState = {
    toolProgress: new Map(),
    ...overrides,
  };
}

vi.mock("../store.js", () => ({
  useStore: Object.assign(
    (selector: (s: MockStoreState) => unknown) => selector(mockState),
    { getState: () => mockState },
  ),
}));

import { AgentProgressPanel } from "./AgentProgressPanel.js";

beforeEach(() => {
  vi.resetAllMocks();
  resetStore();
  localStorage.clear();
});

// ---- Helpers ----

/** Build a toolProgress map for a single session with the given tools. */
function makeProgress(
  sessionId: string,
  tools: Array<{ id: string; toolName: string; elapsedSeconds: number }>,
): Map<string, Map<string, { toolName: string; elapsedSeconds: number }>> {
  const inner = new Map<string, { toolName: string; elapsedSeconds: number }>();
  for (const t of tools) {
    inner.set(t.id, { toolName: t.toolName, elapsedSeconds: t.elapsedSeconds });
  }
  return new Map([[sessionId, inner]]);
}

describe("AgentProgressPanel", () => {
  it("renders nothing when no sub-agents are in the store", () => {
    // With an empty toolProgress map, the component should return null
    const { container } = render(<AgentProgressPanel sessionId="s1" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when tools exist but none are Agent or Task", () => {
    // Only Agent/Task tools should trigger rendering; other tools are ignored
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "t1", toolName: "Bash", elapsedSeconds: 10 },
        { id: "t2", toolName: "Read", elapsedSeconds: 5 },
      ]),
    });
    const { container } = render(<AgentProgressPanel sessionId="s1" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders panel with sub-agent count when Agent/Task tools are present", () => {
    // Two sub-agents should display "Sub-agents (2)" in the toggle button
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 30 },
        { id: "a2", toolName: "Task", elapsedSeconds: 60 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);
    expect(screen.getByTestId("agent-progress-panel")).toBeInTheDocument();
    expect(screen.getByText("Sub-agents (2)")).toBeInTheDocument();
  });

  it("filters out non-Agent/Task tools and only shows matching ones", () => {
    // Mixed tools: only Agent and Task should appear in the panel
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 10 },
        { id: "b1", toolName: "Bash", elapsedSeconds: 5 },
        { id: "t1", toolName: "Task", elapsedSeconds: 20 },
        { id: "r1", toolName: "Read", elapsedSeconds: 3 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);

    // Panel should show count of 2 (Agent + Task only)
    expect(screen.getByText("Sub-agents (2)")).toBeInTheDocument();
    // The agent list items should show the tool names
    expect(screen.getAllByText("Agent")).toHaveLength(1);
    expect(screen.getAllByText("Task")).toHaveLength(1);
    // Bash and Read should NOT appear
    expect(screen.queryByText("Bash")).not.toBeInTheDocument();
    expect(screen.queryByText("Read")).not.toBeInTheDocument();
  });

  it("formats duration correctly (e.g. 125 seconds becomes '2m 05s')", () => {
    // The formatDuration helper should produce zero-padded seconds
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 125 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);
    expect(screen.getByText("2m 05s")).toBeInTheDocument();
  });

  it("formats duration for zero seconds as '0m 00s'", () => {
    // Edge case: zero elapsed seconds
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 0 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);
    expect(screen.getByText("0m 00s")).toBeInTheDocument();
  });

  it("clicking toggle button collapses the agent list", () => {
    // The panel starts expanded; clicking the toggle should hide the agent rows
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 10 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);

    // Agent row should be visible initially
    expect(screen.getByText("Agent")).toBeInTheDocument();

    // Click the toggle button to collapse
    fireEvent.click(screen.getByText("Sub-agents (1)"));

    // The header should remain but the agent list should be hidden
    expect(screen.getByText("Sub-agents (1)")).toBeInTheDocument();
    // "Agent" as a list item should no longer be visible (only in the button text area)
    // The agent row text is rendered inside the collapsible div, so it should be gone
    const agentTexts = screen.queryAllByText("Agent");
    expect(agentTexts).toHaveLength(0);
  });

  it("clicking toggle again expands the agent list", () => {
    // Collapse then expand: the agent list should reappear
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 10 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);

    const toggleButton = screen.getByText("Sub-agents (1)");

    // Collapse
    fireEvent.click(toggleButton);
    expect(screen.queryAllByText("Agent")).toHaveLength(0);

    // Expand
    fireEvent.click(toggleButton);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("persists collapsed state to localStorage on toggle", () => {
    // Toggling should write the collapsed state to localStorage
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 10 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);

    // Initially not collapsed
    expect(localStorage.getItem("cc-agent-panel-collapsed")).toBeNull();

    // Collapse
    fireEvent.click(screen.getByText("Sub-agents (1)"));
    expect(localStorage.getItem("cc-agent-panel-collapsed")).toBe("true");

    // Expand
    fireEvent.click(screen.getByText("Sub-agents (1)"));
    expect(localStorage.getItem("cc-agent-panel-collapsed")).toBe("false");
  });

  it("reads initial collapsed state from localStorage", () => {
    // If localStorage has "true", the panel should start collapsed
    localStorage.setItem("cc-agent-panel-collapsed", "true");
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 10 },
      ]),
    });
    render(<AgentProgressPanel sessionId="s1" />);

    // The header should be visible but the agent list should be hidden
    expect(screen.getByText("Sub-agents (1)")).toBeInTheDocument();
    expect(screen.queryAllByText("Agent")).toHaveLength(0);
  });
});

describe("AgentProgressPanel accessibility", () => {
  it("passes axe accessibility checks with sub-agents visible", async () => {
    const { axe } = await import("vitest-axe");
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 45 },
        { id: "a2", toolName: "Task", elapsedSeconds: 120 },
      ]),
    });
    const { container } = render(<AgentProgressPanel sessionId="s1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("passes axe accessibility checks when collapsed", async () => {
    const { axe } = await import("vitest-axe");
    localStorage.setItem("cc-agent-panel-collapsed", "true");
    resetStore({
      toolProgress: makeProgress("s1", [
        { id: "a1", toolName: "Agent", elapsedSeconds: 10 },
      ]),
    });
    const { container } = render(<AgentProgressPanel sessionId="s1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
