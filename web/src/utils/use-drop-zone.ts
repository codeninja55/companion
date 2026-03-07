import { useState, useRef, useCallback, type DragEvent } from "react";

interface UseDropZoneOptions {
  onFilesDropped: (files: File[]) => void;
  enabled?: boolean;
}

interface UseDropZoneReturn {
  isDragging: boolean;
  dropZoneProps: {
    onDragEnter: (e: DragEvent) => void;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
}

export function useDropZone({ onFilesDropped, enabled = true }: UseDropZoneOptions): UseDropZoneReturn {
  const [isDragging, setIsDragging] = useState(false);
  // Counter tracks nested enter/leave events to avoid flickering
  const dragCounter = useRef(0);

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!enabled) return;
      dragCounter.current++;
      if (dragCounter.current === 1) {
        setIsDragging(true);
      }
    },
    [enabled],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!enabled) return;
      e.dataTransfer.dropEffect = "copy";
    },
    [enabled],
  );

  const onDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!enabled) return;
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDragging(false);
      }
    },
    [enabled],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      if (!enabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [enabled, onFilesDropped],
  );

  return {
    isDragging,
    dropZoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
