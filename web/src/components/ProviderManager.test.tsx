// @vitest-environment jsdom
/**
 * Tests for ProviderManager component.
 *
 * ProviderManager manages model provider profiles with CRUD operations.
 * Each provider has a name, base URL, optional API key, model list, and
 * optional max context tokens setting.
 *
 * Coverage targets:
 * - Render test and axe accessibility scan
 * - Loading and empty states
 * - Provider list rendering with model count badges
 * - Create flow: form display, create, cancel
 * - Edit flow: expand, modify, save
 * - Delete flow
 * - Test connection button: success populates models, failure shows error
 * - Error handling on API failures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── API Mocks ─────────────────────────────────────────────────

const mockListProviders = vi.fn();
const mockCreateProvider = vi.fn();
const mockUpdateProvider = vi.fn();
const mockDeleteProvider = vi.fn();
const mockTestProviderConnection = vi.fn();
const mockTestProviderConnectionDirect = vi.fn();

vi.mock("../api.js", () => ({
  api: {
    listProviders: (...args: unknown[]) => mockListProviders(...args),
    createProvider: (...args: unknown[]) => mockCreateProvider(...args),
    updateProvider: (...args: unknown[]) => mockUpdateProvider(...args),
    deleteProvider: (...args: unknown[]) => mockDeleteProvider(...args),
    testProviderConnection: (...args: unknown[]) => mockTestProviderConnection(...args),
    testProviderConnectionDirect: (...args: unknown[]) => mockTestProviderConnectionDirect(...args),
  },
}));

import { ProviderManager } from "./ProviderManager.js";

// ─── Helpers ───────────────────────────────────────────────────

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    slug: "local-vllm",
    name: "Local vLLM",
    baseUrl: "http://localhost:8000/v1",
    models: ["llama-3-70b", "llama-3-8b"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  mockListProviders.mockResolvedValue([makeProvider()]);
  mockCreateProvider.mockResolvedValue(makeProvider());
  mockUpdateProvider.mockResolvedValue(makeProvider());
  mockDeleteProvider.mockResolvedValue({ ok: true });
  mockTestProviderConnection.mockResolvedValue({ ok: true, models: ["model-a"] });
  mockTestProviderConnectionDirect.mockResolvedValue({ ok: true, models: ["model-a"] });
});

// ─── Render & Accessibility ────────────────────────────────────

describe("ProviderManager render & accessibility", () => {
  it("renders modal and shows provider list", async () => {
    const onClose = vi.fn();
    render(<ProviderManager onClose={onClose} />);
    await screen.findByText("Model Providers");
    expect(screen.getByText("Local vLLM")).toBeInTheDocument();
  });

  it("passes axe accessibility scan", async () => {
    // Portal renders outside landmark regions, which is standard for modals.
    const { axe } = await import("vitest-axe");
    const onClose = vi.fn();
    render(<ProviderManager onClose={onClose} />);
    await screen.findByText("Local vLLM");
    const results = await axe(document.body, {
      rules: { region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

// ─── Loading & Empty ───────────────────────────────────────────

describe("ProviderManager states", () => {
  it("shows empty state when no providers exist", async () => {
    mockListProviders.mockResolvedValue([]);
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("No providers configured.");
  });

  it("shows model count badge", async () => {
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("2 models");
  });

  it("shows singular model badge", async () => {
    mockListProviders.mockResolvedValue([makeProvider({ models: ["one"] })]);
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("1 model");
  });
});

// ─── Create flow ───────────────────────────────────────────────

describe("ProviderManager create", () => {
  it("shows create form when clicking add button", async () => {
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("+ Add Provider"));
    expect(screen.getByText("Add Provider")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Local vLLM")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("http://localhost:8000/v1")).toBeInTheDocument();
  });

  it("creates provider on form submit", async () => {
    mockListProviders
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeProvider({ slug: "new", name: "New Provider" })]);

    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("No providers configured.");

    fireEvent.click(screen.getByText("+ Add Provider"));

    fireEvent.change(screen.getByPlaceholderText("e.g. Local vLLM"), {
      target: { value: "New Provider" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://localhost:8000/v1"), {
      target: { value: "http://localhost:9000/v1" },
    });

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Provider",
          baseUrl: "http://localhost:9000/v1",
        }),
      );
    });
  });

  it("hides create form on cancel", async () => {
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("+ Add Provider"));
    expect(screen.getByText("Add Provider")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Add Provider")).not.toBeInTheDocument();
  });
});

// ─── Edit flow ─────────────────────────────────────────────────

describe("ProviderManager edit", () => {
  it("expands provider for editing on click", async () => {
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("Local vLLM"));

    // Editing form should show Save and Delete buttons
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });
  });

  it("saves edited provider", async () => {
    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("Local vLLM"));

    await waitFor(() => {
      expect(screen.getByText("Save")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalled();
    });
  });
});

// ─── Delete flow ───────────────────────────────────────────────

describe("ProviderManager delete", () => {
  it("deletes provider when clicking delete", async () => {
    mockListProviders
      .mockResolvedValueOnce([makeProvider()])
      .mockResolvedValueOnce([makeProvider()])
      .mockResolvedValueOnce([]);

    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("Local vLLM"));

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => {
      expect(mockDeleteProvider).toHaveBeenCalledWith("local-vllm");
    });
  });
});

// ─── Test connection ───────────────────────────────────────────

describe("ProviderManager test connection", () => {
  it("shows connected status on successful test", async () => {
    mockTestProviderConnection.mockResolvedValue({
      ok: true,
      models: ["llama-3-70b"],
    });

    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("Local vLLM"));

    await waitFor(() => {
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Connection"));
    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("shows error on failed test", async () => {
    mockTestProviderConnection.mockResolvedValue({
      ok: false,
      models: [],
      error: "Connection refused",
    });

    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("Local vLLM"));

    await waitFor(() => {
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Connection"));
    await waitFor(() => {
      expect(screen.getByText("Connection refused")).toBeInTheDocument();
    });
  });
});

// ─── Error handling ────────────────────────────────────────────

describe("ProviderManager error handling", () => {
  it("shows error when create fails", async () => {
    mockCreateProvider.mockRejectedValue(new Error("Duplicate name"));

    render(<ProviderManager onClose={vi.fn()} />);
    await screen.findByText("Local vLLM");
    fireEvent.click(screen.getByText("+ Add Provider"));

    fireEvent.change(screen.getByPlaceholderText("e.g. Local vLLM"), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByPlaceholderText("http://localhost:8000/v1"), {
      target: { value: "http://localhost:8000/v1" },
    });

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(screen.getByText("Duplicate name")).toBeInTheDocument();
    });
  });

  it("calls onClose when clicking overlay", async () => {
    const onClose = vi.fn();
    render(<ProviderManager onClose={onClose} />);
    await screen.findByText("Model Providers");

    // Click the overlay (the outermost div)
    const overlay = screen.getByText("Model Providers").closest(".fixed");
    if (overlay) {
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
