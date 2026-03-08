import { useState, useRef, useEffect } from "react";
import { useStore } from "../store.js";

/**
 * TaskPanel section showing additional directories for the active session.
 * Displays directories as compact badges with remove capability.
 */
export function AddDirsPanel({ sessionId }: { sessionId: string }) {
  const sdkSession = useStore((s) =>
    s.sdkSessions.find((sdk) => sdk.sessionId === sessionId),
  );
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  // Parse additional directories from session info
  // Sessions don't currently expose addDirs in real-time state,
  // so we show what was configured at creation time
  const cwd = sdkSession?.cwd || "";
  const remoteCwd = sdkSession?.remoteCwd;

  // Display the primary working directory info
  const displayPath = remoteCwd || cwd;

  if (!displayPath) return null;

  return (
    <div className="px-3 py-2" data-testid="add-dirs-panel">
      <div className="flex flex-wrap gap-1.5">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border border-cc-primary/30 bg-cc-primary/8 text-cc-primary font-mono-code"
          title={displayPath}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-60 shrink-0">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3.379a1.5 1.5 0 011.06.44l.622.621a.5.5 0 00.353.146H13.5A1.5 1.5 0 0115 4.707V12.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
          </svg>
          <span className="max-w-[160px] truncate">{displayPath}</span>
          {remoteCwd && (
            <span className="text-[9px] text-cc-muted uppercase tracking-wider ml-0.5">remote</span>
          )}
        </span>
      </div>
    </div>
  );
}
