export function DropZoneOverlay() {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-cc-bg/80 backdrop-blur-sm pointer-events-none"
      role="status"
      aria-label="Drop files to attach"
    >
      <div className="flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-cc-primary/50 bg-cc-card/90">
        {/* Upload icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-10 h-10 text-cc-primary"
        >
          <path
            d="M12 16V4m0 0l-4 4m4-4l4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 16.7V19a2 2 0 01-2 2H6a2 2 0 01-2-2v-2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="text-sm font-medium text-cc-fg">
          Drop files to attach
        </div>
        <div className="text-xs text-cc-muted text-center">
          Images, PDF, DICOM, Markdown, Word, Excel, PowerPoint
        </div>
      </div>
    </div>
  );
}
