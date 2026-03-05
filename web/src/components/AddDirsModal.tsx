import { useState } from "react";
import { createPortal } from "react-dom";
import { FolderPicker } from "./FolderPicker.js";

interface AddDirsModalProps {
  directories: string[];
  onChange: (dirs: string[]) => void;
  onClose: () => void;
  initialPath: string;
}

/**
 * Modal for managing additional directories (`--add-dir`).
 * Shows the current list with remove buttons, and lets users
 * add directories via FolderPicker or manual text input.
 */
export function AddDirsModal({ directories, onChange, onClose, initialPath }: AddDirsModalProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  function handleAdd(path: string) {
    if (!path.trim()) return;
    const trimmed = path.trim();
    if (directories.includes(trimmed)) return;
    onChange([...directories, trimmed]);
  }

  function handleRemove(index: number) {
    onChange(directories.filter((_, i) => i !== index));
  }

  if (showPicker) {
    return (
      <FolderPicker
        initialPath={initialPath}
        onSelect={(path) => {
          handleAdd(path);
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-[min(420px,80dvh)] mx-0 sm:mx-4 flex flex-col bg-cc-bg border border-cc-border rounded-t-[14px] sm:rounded-[14px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-cc-border shrink-0">
          <h2 className="text-sm font-semibold text-cc-fg">Additional Directories</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Directory list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {directories.length === 0 ? (
            <div className="px-4 py-8 text-xs text-cc-muted text-center">
              No additional directories added yet.
              <br />
              Use the buttons below to add directories.
            </div>
          ) : (
            directories.map((dir, i) => (
              <div
                key={dir}
                className="flex items-center gap-2 px-4 py-2 hover:bg-cc-hover/50 transition-colors group"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-40 shrink-0">
                  <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.353.146H13.5A1.5 1.5 0 0115 4.707V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
                </svg>
                <span className="flex-1 min-w-0 truncate text-xs text-cc-fg font-mono-code">{dir}</span>
                <button
                  onClick={() => handleRemove(i)}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-cc-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  title="Remove directory"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Manual input row */}
        {showManualInput && (
          <div className="px-4 py-2 border-t border-cc-border flex items-center gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualInput.trim()) {
                  handleAdd(manualInput.trim());
                  setManualInput("");
                  setShowManualInput(false);
                }
                if (e.key === "Escape") {
                  setShowManualInput(false);
                  setManualInput("");
                }
              }}
              placeholder="/path/to/directory"
              className="flex-1 px-2 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-md text-cc-fg font-mono-code placeholder:text-cc-muted focus:outline-none focus:border-cc-primary/50"
              autoFocus
            />
            <button
              onClick={() => {
                if (manualInput.trim()) {
                  handleAdd(manualInput.trim());
                  setManualInput("");
                }
                setShowManualInput(false);
              }}
              className="px-2.5 py-1.5 text-xs bg-cc-primary/10 text-cc-primary rounded-md hover:bg-cc-primary/20 transition-colors cursor-pointer"
            >
              Add
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-4 py-3 border-t border-cc-border flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-cc-hover/70 text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-60">
              <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.353.146H13.5A1.5 1.5 0 0115 4.707V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
            </svg>
            Browse
          </button>
          <button
            onClick={() => { setShowManualInput(true); setManualInput(""); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-cc-hover/70 text-cc-fg rounded-md hover:bg-cc-hover transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-60">
              <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61z" />
            </svg>
            Type path
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs text-cc-primary rounded-md hover:bg-cc-primary/10 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
