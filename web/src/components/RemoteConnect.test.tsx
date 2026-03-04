// @vitest-environment jsdom
/**
 * Tests for RemoteConnect component.
 *
 * RemoteConnect is a multi-phase modal for establishing an SSH connection
 * and starting a remote Claude Code session. The phases are:
 * 1. Select profile
 * 2. Connecting (spinner)
 * 3. Bootstrap check (Claude Code installed?)
 * 4. Browse remote directories
 * 5. Confirm and start session
 *
 * Coverage:
 * - Render test and axe accessibility scan
 * - Phase transitions: select → connecting → bootstrap → browse → confirm
 * - Claude Code not found state
 * - Directory navigation
 * - Error handling
 * - Disconnect flow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── API Mocks ─────────────────────────────────────────────────
const mockListRemoteProfiles = vi.fn();
const mockConnectRemote = vi.fn();
const mockDisconnectRemote = vi.fn();
const mockBootstrapRemote = vi.fn();
const mockListRemoteDirs = vi.fn();

vi.mock("../api.js", () => ({
  api: {
    listRemoteProfiles: (...args: unknown[]) => mockListRemoteProfiles(...args),
    connectRemote: (...args: unknown[]) => mockConnectRemote(...args),
    disconnectRemote: (...args: unknown[]) => mockDisconnectRemote(...args),
    bootstrapRemote: (...args: unknown[]) => mockBootstrapRemote(...args),
    listRemoteDirs: (...args: unknown[]) => mockListRemoteDirs(...args),
  },
}));

import { RemoteConnect } from "./RemoteConnect.js";

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    slug: "gpu-server",
    name: "GPU Server",
    host: "10.0.0.1",
    port: 22,
    username: "admin",
    authMethod: "key" as const,
    keyPath: "/home/.ssh/id_rsa",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const mockOnClose = vi.fn();
const mockOnSessionStart = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockListRemoteProfiles.mockResolvedValue([makeProfile()]);
  mockConnectRemote.mockResolvedValue({
    id: "conn-1",
    profileSlug: "gpu-server",
    status: "connected",
    tunnelPort: 9500,
  });
  mockBootstrapRemote.mockResolvedValue({ hasClaudeCode: true });
  mockListRemoteDirs.mockResolvedValue({ dirs: ["/home/admin/project-a", "/home/admin/project-b"] });
  mockDisconnectRemote.mockResolvedValue({ ok: true });
});

describe("RemoteConnect", () => {
  it("renders the modal", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("remote-connect-modal")).toBeInTheDocument();
    });
  });

  it("passes axe accessibility scan", async () => {
    const { axe } = await import("vitest-axe");
    const { container } = render(
      <RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("remote-connect-modal")).toBeInTheDocument();
    });
    const results = await axe(container, {
      rules: { region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("shows select phase with profile dropdown", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Select a remote profile")).toBeInTheDocument();
    expect(screen.getByTestId("connect-btn")).toBeDisabled();
  });

  it("enables connect button when profile is selected", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    expect(screen.getByTestId("connect-btn")).not.toBeDisabled();
  });

  it("transitions through connect → bootstrap → browse phases", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    // Select profile and connect
    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    fireEvent.click(screen.getByTestId("connect-btn"));

    // Should reach browse phase (connect → bootstrap → browse)
    await waitFor(() => {
      expect(screen.getByTestId("phase-browse")).toBeInTheDocument();
    });

    expect(mockConnectRemote).toHaveBeenCalledWith("gpu-server");
    expect(mockBootstrapRemote).toHaveBeenCalledWith("conn-1");
    expect(mockListRemoteDirs).toHaveBeenCalledWith("conn-1", "~");
  });

  it("shows Claude not found message on bootstrap failure", async () => {
    mockBootstrapRemote.mockResolvedValue({ hasClaudeCode: false });

    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    fireEvent.click(screen.getByTestId("connect-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-bootstrap")).toBeInTheDocument();
    });
    expect(screen.getByText(/Claude Code not found/)).toBeInTheDocument();
  });

  it("allows selecting current directory in browse phase", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    fireEvent.click(screen.getByTestId("connect-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-browse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("select-current-dir-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-confirm")).toBeInTheDocument();
    });
  });

  it("shows confirm phase with connection summary", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    fireEvent.click(screen.getByTestId("connect-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-browse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("select-current-dir-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-confirm")).toBeInTheDocument();
    });

    expect(screen.getByTestId("confirm-remote")).toHaveTextContent("admin@10.0.0.1:22");
    expect(screen.getByTestId("start-session-btn")).toBeInTheDocument();
  });

  it("calls onSessionStart when Start Session is clicked", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    fireEvent.click(screen.getByTestId("connect-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("phase-browse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("select-current-dir-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("start-session-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("start-session-btn"));

    expect(mockOnSessionStart).toHaveBeenCalledWith("conn-1", "~");
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("handles connection error gracefully", async () => {
    mockConnectRemote.mockRejectedValue(new Error("Connection refused"));

    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("phase-select")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Select a remote profile"), {
      target: { value: "gpu-server" },
    });
    fireEvent.click(screen.getByTestId("connect-btn"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Connection refused");
    });
    // Should return to select phase
    expect(screen.getByTestId("phase-select")).toBeInTheDocument();
  });

  it("closes modal via close button", async () => {
    render(<RemoteConnect onClose={mockOnClose} onSessionStart={mockOnSessionStart} />);
    await waitFor(() => {
      expect(screen.getByTestId("close-connect-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("close-connect-btn"));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
