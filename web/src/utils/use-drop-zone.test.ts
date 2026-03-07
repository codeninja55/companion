// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDropZone } from "./use-drop-zone.js";

function makeDragEvent(type: string, files: File[] = []) {
  const event = {
    type,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      files,
      dropEffect: "none",
    },
  };
  return event as unknown as React.DragEvent;
}

describe("useDropZone", () => {
  it("starts with isDragging false", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));
    expect(result.current.isDragging).toBe(false);
  });

  it("sets isDragging true on dragEnter", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));

    act(() => {
      result.current.dropZoneProps.onDragEnter(makeDragEvent("dragenter"));
    });
    expect(result.current.isDragging).toBe(true);
  });

  it("sets isDragging false on dragLeave", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));

    act(() => {
      result.current.dropZoneProps.onDragEnter(makeDragEvent("dragenter"));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.dropZoneProps.onDragLeave(makeDragEvent("dragleave"));
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("handles nested dragEnter/dragLeave without flickering", () => {
    // Simulates dragging over a child element (enter parent, enter child,
    // leave parent) — isDragging should remain true until all leaves match.
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));

    act(() => {
      // Enter parent
      result.current.dropZoneProps.onDragEnter(makeDragEvent("dragenter"));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      // Enter child
      result.current.dropZoneProps.onDragEnter(makeDragEvent("dragenter"));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      // Leave parent (but still over child)
      result.current.dropZoneProps.onDragLeave(makeDragEvent("dragleave"));
    });
    // Should still be dragging because counter is 1
    expect(result.current.isDragging).toBe(true);

    act(() => {
      // Leave child
      result.current.dropZoneProps.onDragLeave(makeDragEvent("dragleave"));
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("calls onFilesDropped on drop with files", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));
    const files = [new File(["data"], "test.png", { type: "image/png" })];

    act(() => {
      result.current.dropZoneProps.onDragEnter(makeDragEvent("dragenter"));
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.dropZoneProps.onDrop(makeDragEvent("drop", files));
    });

    expect(result.current.isDragging).toBe(false);
    expect(onFilesDropped).toHaveBeenCalledWith(files);
  });

  it("does not call onFilesDropped on drop with no files", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));

    act(() => {
      result.current.dropZoneProps.onDrop(makeDragEvent("drop", []));
    });

    expect(onFilesDropped).not.toHaveBeenCalled();
  });

  it("does not activate when enabled is false", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() =>
      useDropZone({ onFilesDropped, enabled: false })
    );

    act(() => {
      result.current.dropZoneProps.onDragEnter(makeDragEvent("dragenter"));
    });
    // Should NOT set isDragging
    expect(result.current.isDragging).toBe(false);

    act(() => {
      result.current.dropZoneProps.onDrop(
        makeDragEvent("drop", [new File(["data"], "test.png", { type: "image/png" })])
      );
    });
    expect(onFilesDropped).not.toHaveBeenCalled();
  });

  it("sets dropEffect to copy on dragOver", () => {
    const onFilesDropped = vi.fn();
    const { result } = renderHook(() => useDropZone({ onFilesDropped }));
    const event = makeDragEvent("dragover");

    act(() => {
      result.current.dropZoneProps.onDragOver(event);
    });
    expect(event.dataTransfer.dropEffect).toBe("copy");
  });
});
