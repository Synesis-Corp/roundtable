import { QUICK_ACTIONS } from "../lib/chat-page-helpers";

interface QuickActionsProps {
  onSelect: (prefix: string) => void;
}

export function QuickActions({ onSelect }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
      {QUICK_ACTIONS.map((a) => (
        <button
          key={a.label}
          onClick={() => onSelect(a.prefix)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-app)] active:scale-95"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)",
            color: "var(--text-2)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--bg-surface)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)";
          }}
        >
          <span style={{ color: "var(--text-3)" }}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

const DELIBERATION_STEPS = ["Proponen", "Debaten", "Votan", "Sintetizan"] as const;

export function DeliberationSteps() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
      {DELIBERATION_STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-full"
            style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
              style={{ width: 16, height: 16, backgroundColor: "var(--accent-quiet)", color: "var(--accent-text)" }}
            >
              {i + 1}
            </span>
            {label}
          </span>
          {i < DELIBERATION_STEPS.length - 1 && (
            <svg className="w-3.5 h-3.5" style={{ color: "var(--text-4)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
