import { useTranslation } from "react-i18next";

interface SidebarTopbarTogglesProps {
  desktopCollapsed: boolean;
  onOpenMobile: () => void;
  onToggleDesktopCollapsed: () => void;
  onNewChat: () => void;
}

/**
 * Floating toggles over the main content: mobile drawer open, plus desktop
 * expand + quick "new chat" shown only when the sidebar rail is collapsed.
 */
export function SidebarTopbarToggles({
  desktopCollapsed,
  onOpenMobile,
  onToggleDesktopCollapsed,
  onNewChat,
}: SidebarTopbarTogglesProps) {
  const { t } = useTranslation();
  return (
    <div className="absolute top-0 left-0 z-30 flex items-center gap-1 m-2">
      {/* Mobile open */}
      <button
        onClick={onOpenMobile}
        className="lg:hidden p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
        style={{ color: "var(--text-3)", borderRadius: "var(--r-sm)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
        }}
        title={t("shell.openSidebar")}
        aria-label={t("shell.openSidebar")}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {/* Desktop expand — only shown when collapsed */}
      {desktopCollapsed && (
        <button
          onClick={onToggleDesktopCollapsed}
          className="hidden lg:inline-flex p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
          style={{ color: "var(--text-3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
          title={t("shell.openSidebar")}
          aria-label={t("shell.openSidebar")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      )}
      {/* Quick "new chat" when collapsed */}
      {desktopCollapsed && (
        <button
          onClick={onNewChat}
          className="hidden lg:inline-flex p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)]"
          style={{ color: "var(--text-3)", borderRadius: "var(--r-sm)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
          title={t("shell.newChat")}
          aria-label={t("shell.newChat")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}
