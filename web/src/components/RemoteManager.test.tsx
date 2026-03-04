// @vitest-environment jsdom
/**
 * Tests for RemoteManager component.
 *
 * RemoteManager handles CRUD for remote SSH profiles. It renders either
 * embedded (full-page) or as a modal portal. Each profile stores SSH
 * connection details (host, port, username, auth method, key path).
 *
 * Coverage:
 * - Render test and axe accessibility scan
 * - Loading and empty states
 * - Profile list display
 * - Create flow: form display, field editing, save, cancel
 * - Edit flow: pre-populated fields, save
 * - Delete flow
 * - Auth method toggle (key vs password)
 * - Error handling on API failures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
// axe is imported dynamically via vitest-axe below

// ─── API Mocks ─────────────────────────────────────────────────
const mockListRemoteProfiles = vi.fn();
const mockCreateRemoteProfile = vi.fn();
const mockUpdateRemoteProfile = vi.fn();
const mockDeleteRemoteProfile = vi.fn();

vi.mock("../api.js", () => ({
  api: {
    listRemoteProfiles: (...args: unknown[]) => mockListRemoteProfiles(...args),
    createRemoteProfile: (...args: unknown[]) => mockCreateRemoteProfile(...args),
    updateRemoteProfile: (...args: unknown[]) => mockUpdateRemoteProfile(...args),
    deleteRemoteProfile: (...args: unknown[]) => mockDeleteRemoteProfile(...args),
  },
}));

import { RemoteManager } from "./RemoteManager.js";

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-server",
    name: "Test Server",
    host: "192.168.1.100",
    port: 22,
    username: "root",
    authMethod: "key",
    keyPath: "/home/user/.ssh/id_rsa",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListRemoteProfiles.mockResolvedValue([makeProfile()]);
  mockCreateRemoteProfile.mockResolvedValue(makeProfile());
  mockUpdateRemoteProfile.mockResolvedValue(makeProfile());
  mockDeleteRemoteProfile.mockResolvedValue({ ok: true });
});

describe("RemoteManager", () => {
  it("renders without crashing in embedded mode", async () => {
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("remote-manager")).toBeInTheDocument();
    });
  });

  it("passes axe accessibility scan", async () => {
    const { container } = render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("remote-manager")).toBeInTheDocument();
    });
    const { axe } = await import("vitest-axe");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("shows loading state then profiles", async () => {
    render(<RemoteManager embedded />);
    // After load completes, profile should appear
    await waitFor(() => {
      expect(screen.getByText("Test Server")).toBeInTheDocument();
    });
  });

  it("shows empty message when no profiles exist", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("empty-message")).toBeInTheDocument();
    });
  });

  it("opens create form when Add Remote is clicked", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-remote-btn"));
    expect(screen.getByTestId("remote-form")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("shows key path field only for key auth", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-remote-btn"));

    // Key auth is default — key path should be visible
    expect(screen.getByLabelText("Key Path")).toBeInTheDocument();

    // Switch to password auth
    fireEvent.click(screen.getByLabelText("Password"));
    expect(screen.queryByLabelText("Key Path")).not.toBeInTheDocument();
  });

  it("creates a profile via the form", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-remote-btn"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "My GPU" } });
    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "10.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });

    fireEvent.click(screen.getByTestId("save-remote-btn"));

    await waitFor(() => {
      expect(mockCreateRemoteProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My GPU",
          host: "10.0.0.1",
          username: "admin",
          authMethod: "key",
        }),
      );
    });
  });

  it("cancels create form", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("add-remote-btn"));
    expect(screen.getByTestId("remote-form")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-remote-btn"));
    expect(screen.queryByTestId("remote-form")).not.toBeInTheDocument();
  });

  it("opens edit form with pre-populated fields", async () => {
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("edit-test-server")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("edit-test-server"));

    expect(screen.getByLabelText("Name")).toHaveValue("Test Server");
    expect(screen.getByLabelText("Host")).toHaveValue("192.168.1.100");
    expect(screen.getByLabelText("Username")).toHaveValue("root");
  });

  it("deletes a profile", async () => {
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByTestId("delete-test-server")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("delete-test-server"));

    await waitFor(() => {
      expect(mockDeleteRemoteProfile).toHaveBeenCalledWith("test-server");
    });
  });

  it("shows error on API failure", async () => {
    mockListRemoteProfiles.mockRejectedValue(new Error("Network error"));
    render(<RemoteManager embedded />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
  });

  it("renders as modal when not embedded", async () => {
    render(<RemoteManager onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("remote-manager-modal")).toBeInTheDocument();
    });
  });
});
