import { Link } from "react-router-dom";

interface SidebarUserCardProps {
  userName: string;
  conversationCount: number;
  onCloseMobile: () => void;
  onLogout: () => void;
}

/** Sidebar footer card: avatar, username, conversation count, logout. */
export function SidebarUserCard({
  userName,
  conversationCount,
  onCloseMobile,
  onLogout,
}: SidebarUserCardProps) {
  return (
    <div className="space-y-2">
      <Link
        to="/settings"
        onClick={onCloseMobile}
        className="flex items-center gap-3 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
        style={{
          padding: 12,
          borderRadius: "var(--r-md)",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-strong)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)";
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center text-sm font-semibold text-white"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--r-sm)",
            background: "linear-gradient(150deg, #5b91d6, #7c6cf0 70%)",
          }}
        >
          {userName ? userName[0].toUpperCase() : "U"}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}
          >
            {userName || "User"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
            {conversationCount} {conversationCount === 1 ? "conversación" : "conversaciones"}
          </div>
        </div>
        {/* Logout icon button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLogout();
          }}
          className="shrink-0 p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-sidebar)]"
          style={{ color: "var(--text-3)", borderRadius: "var(--r-xs)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          }}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </Link>
    </div>
  );
}
