import { useState, useMemo } from "react";
import { useStore } from "../store.js";

interface SubAgentInfo {
  toolUseId: string;
  toolName: string;
  elapsedSeconds: number;
}

/**
 * Collapsible panel showing active sub-agents (Claude Code teammates)
 * within the current session. Renders in the TaskPanel's scrollable area.
 *
 * Sub-agents are detected via the `toolProgress` store: any active tool
 * with toolName "Agent" or "Task" represents a running sub-agent.
 */
export function AgentProgressPanel({ sessionId }: { sessionId: string }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("cc-agent-panel-collapsed") === "true";
    } catch {
      return false;
    }
  });

  // Select the raw Map reference (stable when unchanged) to avoid
  // returning a new array from the selector on every render.
  const sessionProgress = useStore(
    (s) => s.toolProgress.get(sessionId),
  );

  const subAgents = useMemo(() => {
    if (!sessionProgress) return [];
    const agents: SubAgentInfo[] = [];
    for (const [toolUseId, info] of sessionProgress) {
      if (info.toolName === "Agent" || info.toolName === "Task") {
        agents.push({ toolUseId, ...info });
      }
    }
    return agents;
  }, [sessionProgress]);

  if (subAgents.length === 0) return null;

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("cc-agent-panel-collapsed", String(next));
    } catch { /* ignore */ }
  };

  return (
    <div className="border-t border-cc-border" data-testid="agent-progress-panel">
      <button
        onClick={toggleCollapse}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium text-emerald-400 uppercase tracking-wider hover:bg-cc-hover/50 transition-colors cursor-pointer"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 transition-transform ${collapsed ? "" : "rotate-90"}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 opacity-60">
          <path d="M8 1.5a2.5 2.5 0 00-2.5 2.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5S9.38 1.5 8 1.5zM4 8a4 4 0 00-4 4v1.5a.5.5 0 00.5.5h15a.5.5 0 00.5-.5V12a4 4 0 00-4-4H4z" />
        </svg>
        Sub-agents ({subAgents.length})
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-1.5">
          {subAgents.map((agent) => (
            <div
              key={agent.toolUseId}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-cc-hover/50 text-xs"
            >
              <span className="relative shrink-0 w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 animate-[pulse-dot_1.5s_ease-in-out_infinite]" />
                <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
              </span>
              <span className="flex-1 min-w-0 truncate text-cc-fg font-medium">
                {agent.toolName}
              </span>
              <span className="text-cc-muted shrink-0">
                {formatDuration(agent.elapsedSeconds)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
