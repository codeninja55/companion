// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DropZoneOverlay } from "./DropZoneOverlay.js";

describe("DropZoneOverlay", () => {
  it("renders the drop instruction text", () => {
    render(<DropZoneOverlay />);
    expect(screen.getByText("Drop files to attach")).toBeTruthy();
  });

  it("lists supported file types", () => {
    render(<DropZoneOverlay />);
    const typesText = screen.getByText(/Images, PDF, DICOM/);
    expect(typesText).toBeTruthy();
  });

  it("has an accessible label", () => {
    render(<DropZoneOverlay />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByLabelText("Drop files to attach")).toBeTruthy();
  });

  it("has pointer-events-none so drag events pass through", () => {
    const { container } = render(<DropZoneOverlay />);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain("pointer-events-none");
  });

  it("passes axe accessibility checks", async () => {
    const { axe } = await import("vitest-axe");
    const { container } = render(<DropZoneOverlay />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
