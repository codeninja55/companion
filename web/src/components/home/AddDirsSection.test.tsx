// @vitest-environment jsdom
/**
 * Tests for AddDirsSection component.
 *
 * AddDirsSection renders a list of directory badges with remove buttons,
 * a manual text input for adding directories, and a FolderPicker integration
 * for browsing the filesystem. It is used during session creation to specify
 * additional working directories.
 *
 * Coverage:
 * - Render test and axe accessibility scan
 * - Directory badges display when directories are provided
 * - Remove button calls onChange without the removed directory
 * - Add directory button reveals the text input
 * - Input field adds a directory on Enter key press
 * - Duplicate and empty paths are rejected
 * - Escape key dismisses the input
 * - FolderPicker browse button is present and triggers the picker
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ─── Mock FolderPicker (complex component with filesystem access) ───
vi.mock("../FolderPicker.js", () => ({
  FolderPicker: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="folder-picker"><button onClick={onClose}>Close</button></div>
  ),
}));

import { AddDirsSection } from "./AddDirsSection.js";

const mockOnChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddDirsSection", () => {
  it("renders without crashing", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);
    expect(screen.getByTestId("add-dirs-section")).toBeInTheDocument();
  });

  it("passes axe accessibility scan", async () => {
    const { container } = render(
      <AddDirsSection directories={["/home/user/project"]} onChange={mockOnChange} />,
    );
    const { axe } = await import("vitest-axe");
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("shows directory badges when directories are provided", () => {
    const dirs = ["/home/user/project-a", "/home/user/project-b"];
    render(<AddDirsSection directories={dirs} onChange={mockOnChange} />);

    expect(screen.getByTestId("dirs-badges")).toBeInTheDocument();
    expect(screen.getByText("/home/user/project-a")).toBeInTheDocument();
    expect(screen.getByText("/home/user/project-b")).toBeInTheDocument();
  });

  it("does not show badges container when directories list is empty", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);
    expect(screen.queryByTestId("dirs-badges")).not.toBeInTheDocument();
  });

  it("remove button calls onChange without that directory", () => {
    const dirs = ["/home/user/a", "/home/user/b"];
    render(<AddDirsSection directories={dirs} onChange={mockOnChange} />);

    // Click remove on the first directory
    fireEvent.click(screen.getByLabelText("Remove /home/user/a"));

    expect(mockOnChange).toHaveBeenCalledWith(["/home/user/b"]);
  });

  it("add directory button shows input", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    // Input should not be visible initially
    expect(screen.queryByTestId("add-dir-input")).not.toBeInTheDocument();

    // Click the add directory button
    fireEvent.click(screen.getByTestId("add-dir-btn"));

    // Input should now be visible
    expect(screen.getByTestId("add-dir-input")).toBeInTheDocument();
  });

  it("input field adds directory on Enter key", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    // Show the input
    fireEvent.click(screen.getByTestId("add-dir-btn"));
    const input = screen.getByTestId("add-dir-input");

    // Type a path and press Enter
    fireEvent.change(input, { target: { value: "/home/user/new-dir" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockOnChange).toHaveBeenCalledWith(["/home/user/new-dir"]);
  });

  it("rejects empty paths", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    fireEvent.click(screen.getByTestId("add-dir-btn"));
    const input = screen.getByTestId("add-dir-input");

    // Try adding an empty/whitespace-only path
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it("rejects duplicate paths", () => {
    render(
      <AddDirsSection
        directories={["/home/user/existing"]}
        onChange={mockOnChange}
      />,
    );

    fireEvent.click(screen.getByTestId("add-dir-btn"));
    const input = screen.getByTestId("add-dir-input");

    // Try adding a path that already exists
    fireEvent.change(input, { target: { value: "/home/user/existing" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it("Escape key dismisses the input", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    fireEvent.click(screen.getByTestId("add-dir-btn"));
    expect(screen.getByTestId("add-dir-input")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId("add-dir-input"), { key: "Escape" });

    // Input should be hidden again
    expect(screen.queryByTestId("add-dir-input")).not.toBeInTheDocument();
  });

  it("FolderPicker browse button is present when input is shown", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    // Show the input to reveal the browse button
    fireEvent.click(screen.getByTestId("add-dir-btn"));

    expect(screen.getByTestId("add-dir-browse")).toBeInTheDocument();
  });

  it("clicking browse button opens the FolderPicker", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    fireEvent.click(screen.getByTestId("add-dir-btn"));
    fireEvent.click(screen.getByTestId("add-dir-browse"));

    expect(screen.getByTestId("folder-picker")).toBeInTheDocument();
  });

  it("cancel button dismisses the input", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    // Show the input
    fireEvent.click(screen.getByTestId("add-dir-btn"));
    expect(screen.getByTestId("add-dir-input")).toBeInTheDocument();

    // Click the cancel button
    fireEvent.click(screen.getByTestId("add-dir-cancel"));

    // Input should be hidden
    expect(screen.queryByTestId("add-dir-input")).not.toBeInTheDocument();
  });

  it("Add button confirms input value", () => {
    render(<AddDirsSection directories={[]} onChange={mockOnChange} />);

    fireEvent.click(screen.getByTestId("add-dir-btn"));
    const input = screen.getByTestId("add-dir-input");

    fireEvent.change(input, { target: { value: "/home/user/via-button" } });
    fireEvent.click(screen.getByTestId("add-dir-confirm"));

    expect(mockOnChange).toHaveBeenCalledWith(["/home/user/via-button"]);
  });
});
