import { useState, useRef, useEffect } from "react";
import { FolderPicker } from "../FolderPicker.js";

interface AddDirsSectionProps {
  directories: string[];
  onChange: (dirs: string[]) => void;
  /** Base path for FolderPicker */
  initialPath?: string;
}

export function AddDirsSection({ directories, onChange, initialPath = "" }: AddDirsSectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  function handleAddDir(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;
    if (directories.includes(trimmed)) return;
    onChange([...directories, trimmed]);
    setInputValue("");
    setShowInput(false);
  }

  function handleRemoveDir(dir: string) {
    onChange(directories.filter((d) => d !== dir));
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddDir(inputValue);
    } else if (e.key === "Escape") {
      setShowInput(false);
      setInputValue("");
    }
  }

  return (
    <div
      className="rounded-[12px] border border-cc-border bg-cc-card/90 px-2.5 py-2"
      data-testid="add-dirs-section"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wide text-cc-muted">
          Directories
        </span>
      </div>

      {/* Selected directories as badges */}
      {directories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2" data-testid="dirs-badges">
          {directories.map((dir) => (
            <span
              key={dir}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-cc-primary/35 bg-cc-primary/10 text-cc-primary font-mono-code"
            >
              <span className="max-w-[180px] truncate">{dir}</span>
              <button
                type="button"
                onClick={() => handleRemoveDir(dir)}
                className="text-cc-primary/60 hover:text-cc-primary transition-colors cursor-pointer"
                aria-label={`Remove ${dir}`}
                data-testid={`remove-dir-${dir.replace(/\//g, "-")}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Inline input for manual path entry */}
      {showInput && (
        <div className="flex items-center gap-1.5 mb-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="/path/to/directory"
            className="flex-1 px-2.5 py-1.5 text-xs bg-cc-input-bg border border-cc-border rounded-lg text-cc-fg font-mono-code"
            data-testid="add-dir-input"
          />
          <button
            type="button"
            onClick={() => handleAddDir(inputValue)}
            className="px-2 py-1.5 text-xs rounded-lg bg-cc-primary/15 text-cc-primary hover:bg-cc-primary/25 transition-colors cursor-pointer"
            data-testid="add-dir-confirm"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="px-2 py-1.5 text-xs rounded-lg bg-cc-hover text-cc-muted hover:text-cc-fg transition-colors cursor-pointer"
            title="Browse directories"
            data-testid="add-dir-browse"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.353.146H13.5A1.5 1.5 0 0115 4.707V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
            </svg>
          </button>
        </div>
      )}

      {/* Add directory button */}
      <button
        type="button"
        onClick={() => setShowInput(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-cc-muted hover:text-cc-fg border border-dashed border-cc-border rounded-lg hover:border-cc-muted transition-colors cursor-pointer w-full justify-center"
        data-testid="add-dir-btn"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z" />
        </svg>
        Add directory
      </button>

      {/* FolderPicker integration */}
      {showPicker && (
        <FolderPicker
          initialPath={initialPath}
          onSelect={(path) => {
            handleAddDir(path);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
