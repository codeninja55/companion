// @vitest-environment jsdom
/**
 * Tests for RemotesPage component.
 *
 * RemotesPage is a full-page CRUD interface for managing SSH remote profiles.
 * It lists existing profiles with auth method badges, allows creating new
 * profiles via a form, editing existing ones, deleting profiles, and testing
 * SSH connections. The form supports SSH key (path/upload/paste), password,
 * and Tailscale authentication methods, plus environment variable management.
 *
 * Coverage:
 * - Render test and axe accessibility scan
 * - Profile list display when profiles exist
 * - Empty state when no profiles
 * - Opens create form on Add Remote click
 * - Edit populates form with existing profile data
 * - Delete calls the API and reloads the list
 * - Error handling on API failures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── API Mocks ─────────────────────────────────────────────────
const mockListRemoteProfiles = vi.fn();
const mockCreateRemoteProfile = vi.fn();
const mockUpdateRemoteProfile = vi.fn();
const mockDeleteRemoteProfile = vi.fn();
const mockTestRemote = vi.fn();

vi.mock("../api.js", () => ({
  api: {
    listRemoteProfiles: (...args: unknown[]) => mockListRemoteProfiles(...args),
    createRemoteProfile: (...args: unknown[]) => mockCreateRemoteProfile(...args),
    updateRemoteProfile: (...args: unknown[]) => mockUpdateRemoteProfile(...args),
    deleteRemoteProfile: (...args: unknown[]) => mockDeleteRemoteProfile(...args),
    testRemote: (...args: unknown[]) => mockTestRemote(...args),
  },
}));

import { RemotesPage } from "./RemotesPage.js";

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    slug: "test-server",
    name: "Test Server",
    host: "192.168.1.100",
    port: 22,
    username: "root",
    authMethod: "key" as const,
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
  mockTestRemote.mockResolvedValue({ ok: true });
});

describe("RemotesPage", () => {
  it("renders without crashing", async () => {
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByText("Remotes")).toBeInTheDocument();
    });
  });

  it("passes axe accessibility scan", async () => {
    const { container } = render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByText("Test Server")).toBeInTheDocument();
    });
    const { axe } = await import("vitest-axe");
    const results = await axe(container, {
      // Disable region rule since this is a standalone page component
      // rendered outside of landmark context in tests
      rules: { region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("shows profile list when profiles exist", async () => {
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("profile-list")).toBeInTheDocument();
    });
    expect(screen.getByText("Test Server")).toBeInTheDocument();
    // Connection string shown: username@host:port
    expect(screen.getByText("root@192.168.1.100:22")).toBeInTheDocument();
    // Auth badge
    expect(screen.getByText("SSH Key")).toBeInTheDocument();
  });

  it("shows empty state when no profiles exist", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("empty-message")).toBeInTheDocument();
    });
    expect(screen.getByText("No remote profiles yet.")).toBeInTheDocument();
  });

  it("opens create form on Add Remote click", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-remote-btn"));

    expect(screen.getByTestId("remote-form")).toBeInTheDocument();
    expect(screen.getByText("Add remote profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Port")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("edit populates form with existing profile data", async () => {
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("edit-test-server")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("edit-test-server"));

    expect(screen.getByTestId("remote-form")).toBeInTheDocument();
    expect(screen.getByText("Edit remote profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Test Server");
    expect(screen.getByLabelText("Host")).toHaveValue("192.168.1.100");
    expect(screen.getByLabelText("Username")).toHaveValue("root");
  });

  it("delete calls API and reloads the list", async () => {
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("delete-test-server")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("delete-test-server"));

    await waitFor(() => {
      expect(mockDeleteRemoteProfile).toHaveBeenCalledWith("test-server");
    });

    // After deletion, listRemoteProfiles should be called again to reload
    // Initial load + reload after delete = at least 2 calls
    await waitFor(() => {
      expect(mockListRemoteProfiles.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("creates a profile via the form", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-remote-btn"));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GPU Box" } });
    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "10.0.0.5" } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });

    fireEvent.click(screen.getByTestId("save-remote-btn"));

    await waitFor(() => {
      expect(mockCreateRemoteProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "GPU Box",
          host: "10.0.0.5",
          username: "admin",
          authMethod: "key",
        }),
      );
    });
  });

  it("cancels the form and returns to list view", async () => {
    mockListRemoteProfiles.mockResolvedValue([]);
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("add-remote-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-remote-btn"));
    expect(screen.getByTestId("remote-form")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-remote-btn"));
    expect(screen.queryByTestId("remote-form")).not.toBeInTheDocument();
  });

  it("shows error on API failure during load", async () => {
    mockListRemoteProfiles.mockRejectedValue(new Error("Network error"));
    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
  });

  it("shows auth badge for different auth methods", async () => {
    mockListRemoteProfiles.mockResolvedValue([
      makeProfile({ slug: "key-server", name: "Key Server", authMethod: "key" }),
      makeProfile({ slug: "pw-server", name: "PW Server", authMethod: "password" }),
      makeProfile({ slug: "ts-server", name: "TS Server", authMethod: "tailscale" }),
    ]);

    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("profile-list")).toBeInTheDocument();
    });

    expect(screen.getByText("SSH Key")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Tailscale")).toBeInTheDocument();
  });

  it("shows env var count badge when profile has environment variables", async () => {
    mockListRemoteProfiles.mockResolvedValue([
      makeProfile({
        envVars: { API_KEY: "abc123", DB_HOST: "localhost" },
      }),
    ]);

    render(<RemotesPage />);
    await waitFor(() => {
      expect(screen.getByText("2 env vars")).toBeInTheDocument();
    });
  });
});
