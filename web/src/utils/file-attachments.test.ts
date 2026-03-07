// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyFile, validateFile, MAX_FILE_SIZE } from "./file-attachments.js";

// ─── classifyFile ────────────────────────────────────────────────────────────

describe("classifyFile", () => {
  it("classifies image files by MIME type", () => {
    const file = new File(["data"], "photo.png", { type: "image/png" });
    expect(classifyFile(file)).toBe("image");
  });

  it("classifies JPEG images", () => {
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    expect(classifyFile(file)).toBe("image");
  });

  it("classifies PDF by MIME type", () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    expect(classifyFile(file)).toBe("pdf");
  });

  it("classifies PDF by extension when MIME is octet-stream", () => {
    // Browsers may report octet-stream for PDFs from drag-and-drop
    const file = new File(["data"], "doc.pdf", { type: "application/octet-stream" });
    expect(classifyFile(file)).toBe("pdf");
  });

  it("classifies DICOM files by .dcm extension", () => {
    // Browsers give empty or octet-stream MIME for .dcm files
    const file = new File(["data"], "scan.dcm", { type: "" });
    expect(classifyFile(file)).toBe("dicom");
  });

  it("classifies Markdown files by extension", () => {
    const file = new File(["data"], "notes.md", { type: "" });
    expect(classifyFile(file)).toBe("document");
  });

  it("classifies Markdown files by MIME type", () => {
    const file = new File(["data"], "notes", { type: "text/markdown" });
    expect(classifyFile(file)).toBe("document");
  });

  it("classifies .docx files", () => {
    const file = new File(["data"], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(classifyFile(file)).toBe("document");
  });

  it("classifies .xlsx files", () => {
    const file = new File(["data"], "data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(classifyFile(file)).toBe("document");
  });

  it("classifies .pptx files", () => {
    const file = new File(["data"], "slides.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    expect(classifyFile(file)).toBe("document");
  });

  it("returns unsupported for unknown file types", () => {
    const file = new File(["data"], "archive.zip", { type: "application/zip" });
    expect(classifyFile(file)).toBe("unsupported");
  });

  it("returns unsupported for extensionless files with generic MIME", () => {
    const file = new File(["data"], "unknownfile", { type: "application/octet-stream" });
    expect(classifyFile(file)).toBe("unsupported");
  });
});

// ─── validateFile ────────────────────────────────────────────────────────────

describe("validateFile", () => {
  it("accepts valid image files", () => {
    const file = new File(["data"], "photo.png", { type: "image/png" });
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it("accepts valid PDF files", () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it("rejects files exceeding max size", () => {
    // Create a file object that reports a large size
    const file = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE + 1 });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
    expect(result.error).toContain("50MB");
  });

  it("rejects unsupported file types", () => {
    const file = new File(["data"], "archive.zip", { type: "application/zip" });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not a supported file type");
  });

  it("accepts .dcm files", () => {
    const file = new File(["data"], "scan.dcm", { type: "" });
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it("accepts .md files", () => {
    const file = new File(["data"], "readme.md", { type: "" });
    expect(validateFile(file)).toEqual({ valid: true });
  });
});
