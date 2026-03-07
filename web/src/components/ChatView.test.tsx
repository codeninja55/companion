// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Polyfill scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn();

vi.mock("../ws.js", () => ({
  sendToSession: vi.fn(),
}));

vi.mock("../api.js", () => ({
  api: {
    relaunchSession: vi.fn().mockResolvedValue({}),
    listPrompts: vi.fn().mockResolvedValue([]),
    createPrompt: vi.fn(),
    gitPull: vi.fn().mockResolvedValue({ success: true, output: "", git_ahead: 0, git_behind: 0 }),
  },
}));

vi.mock("../analytics.js", () => ({
  captureException: vi.fn(),
}));

vi.mock("../utils/file-attachments.js", () => ({
  processFiles: vi.fn().mockResolvedValue({ attachments: [], errors: [] }),
  FILE_INPUT_ACCEPT: "image/*,.dcm,.md,.pdf,.docx,.xlsx,.pptx",
}));

vi.mock("../utils/image.js", () => ({
  readFileAsBase64: vi.fn(),
}));

// Build a controllable mock store state
let mockStoreState: Record<string, unknown> = {};

vi.mock("../store.js", () => {
  const useStore = (selector: (state: Record<string, unknown>) => unknown) => {
    return selector(mockStoreState);
  };
  useStore.getState = () => mockStoreState;
  return { useStore };
});

import { ChatView } from "./ChatView.js";

function setupMockStore(overrides: {
  cliConnected?: boolean;
  connStatus?: string;
} = {}) {
  const { cliConnected = true, connStatus = "connected" } = overrides;

  const pendingPermsMap = new Map();
  const aiResolvedMap = new Map();
  const connStatusMap = new Map();
  connStatusMap.set("s1", connStatus);
  const cliConnectedMap = new Map();
  cliConnectedMap.set("s1", cliConnected);
  const sessionStatusMap = new Map();
  sessionStatusMap.set("s1", "idle");
  const sessionsMap = new Map();
  sessionsMap.set("s1", {
    session_id: "s1",
    model: "claude-sonnet-4-6",
    cwd: "/test",
    tools: [],
    permissionMode: "acceptEdits",
    claude_code_version: "1.0",
    mcp_servers: [],
    agents: [],
    slash_commands: [],
    skills: [],
    total_cost_usd: 0,
    num_turns: 0,
    context_used_percent: 0,
    is_compacting: false,
    git_branch: "",
    is_worktree: false,
    is_containerized: false,
    repo_root: "",
    git_ahead: 0,
    git_behind: 0,
    total_lines_added: 0,
    total_lines_removed: 0,
  });

  mockStoreState = {
    sessions: sessionsMap,
    cliConnected: cliConnectedMap,
    connectionStatus: connStatusMap,
    pendingPermissions: pendingPermsMap,
    aiResolvedPermissions: aiResolvedMap,
    sessionStatus: sessionStatusMap,
    messages: new Map(),
    sessionNames: new Map(),
    sdkSessions: [],
    previousPermissionMode: new Map(),
    appendMessage: vi.fn(),
    updateSession: vi.fn(),
    clearMessages: vi.fn(),
    setSdkSessions: vi.fn(),
    setPreviousPermissionMode: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMockStore();
});

// Mock MessageFeed to simplify rendering
vi.mock("./MessageFeed.js", () => ({
  MessageFeed: () => <div data-testid="message-feed" />,
}));

describe("ChatView drop zone", () => {
  it("does not show drop overlay by default", () => {
    render(<ChatView sessionId="s1" />);
    expect(screen.queryByText("Drop files to attach")).toBeNull();
  });

  it("shows drop overlay on dragEnter", () => {
    // Validates that the DropZoneOverlay renders when files are dragged over.
    render(<ChatView sessionId="s1" />);
    const container = screen.getByTestId("message-feed").parentElement!;

    fireEvent.dragEnter(container, {
      dataTransfer: { files: [], dropEffect: "none" },
    });

    expect(screen.getByText("Drop files to attach")).toBeTruthy();
  });

  it("hides drop overlay on dragLeave", () => {
    // Validates overlay disappears when dragging away.
    render(<ChatView sessionId="s1" />);
    const container = screen.getByTestId("message-feed").parentElement!;

    fireEvent.dragEnter(container, {
      dataTransfer: { files: [], dropEffect: "none" },
    });
    expect(screen.getByText("Drop files to attach")).toBeTruthy();

    fireEvent.dragLeave(container, {
      dataTransfer: { files: [], dropEffect: "none" },
    });
    expect(screen.queryByText("Drop files to attach")).toBeNull();
  });

  it("does not show overlay when CLI is disconnected", () => {
    // Drop zone is disabled when not connected.
    setupMockStore({ cliConnected: false });
    render(<ChatView sessionId="s1" />);
    const container = screen.getByTestId("message-feed").parentElement!;

    fireEvent.dragEnter(container, {
      dataTransfer: { files: [], dropEffect: "none" },
    });
    expect(screen.queryByText("Drop files to attach")).toBeNull();
  });

  it("renders the composer and message feed", () => {
    // Basic rendering smoke test.
    render(<ChatView sessionId="s1" />);
    expect(screen.getByTestId("message-feed")).toBeTruthy();
    expect(screen.getByLabelText("Message input")).toBeTruthy();
  });

  it("passes axe accessibility checks", async () => {
    const { axe } = await import("vitest-axe");
    const { container } = render(<ChatView sessionId="s1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
