import { Link } from "react-router-dom";

interface SidebarHeaderProps {
  /** Returns false to cancel navigation when a stream is in progress. */
  confirmLeaveIfStreaming: () => boolean;
  onCloseMobile: () => void;
  onToggleDesktopCollapsed: () => void;
}

/** Sidebar header: brand link + desktop-collapse / mobile-close controls. */
export function SidebarHeader({
  confirmLeaveIfStreaming,
  onCloseMobile,
  onToggleDesktopCollapsed,
}: SidebarHeaderProps) {
  return (
    <div
      className="p-3 flex items-center justify-between"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <Link
        to="/"
        className="flex items-center gap-3 px-1 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
        style={{ color: "var(--text-1)", borderRadius: "var(--r-xs)" }}
        onClick={(e) => {
          if (!confirmLeaveIfStreaming()) {
            e.preventDefault();
            return;
          }
          onCloseMobile();
        }}
      >
        <img
          src="/logo/symbol-color.svg"
          alt="Roundtable"
          className="shrink-0"
          style={{ width: 34, height: 34, borderRadius: 10 }}
        />
        <span className="leading-tight">
          <span className="block" style={{ fontSize: 15, fontWeight: 600 }}>
            Roundtable
          </span>
          <span
            className="block uppercase"
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.14em",
              color: "var(--text-3)",
            }}
          >
            orchestrator
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-1">
        {/* Desktop collapse */}
        <button
          onClick={onToggleDesktopCollapsed}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="hidden lg:inline-flex p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
          style={{ color: "var(--text-3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        {/* Mobile close */}
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
          style={{ color: "var(--text-3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
          aria-label="Close sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
