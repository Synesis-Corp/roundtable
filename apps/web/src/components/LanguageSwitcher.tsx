import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type Language } from "../i18n";

const LABELS: Record<Language, string> = { en: "EN", es: "ES" };

/**
 * Compact EN/ES toggle. Persists the choice via i18next's localStorage detector,
 * so the selection survives reloads and propagates to every `useTranslation`
 * consumer through the shared i18n instance.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const resolved = i18n.resolvedLanguage as Language | undefined;
  const current: Language =
    resolved && SUPPORTED_LANGUAGES.includes(resolved) ? resolved : "en";

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs font-medium ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => void i18n.changeLanguage(lng)}
          aria-pressed={current === lng}
          className={`rounded-md px-2 py-1 transition-colors ${
            current === lng ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
          }`}
        >
          {LABELS[lng]}
        </button>
      ))}
    </div>
  );
}
