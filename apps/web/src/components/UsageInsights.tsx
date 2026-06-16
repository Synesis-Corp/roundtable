import { Icons } from '../lib/usage-icons';
import { useTranslation } from 'react-i18next';

/** Insight cards rendered below the usage table (empty list → renders nothing). */
export function UsageInsights({ insights }: { insights: string[] }) {
  const { t } = useTranslation();
  if (insights.length === 0) return null;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--text-1)] mb-4">
        {t('usage.insights.title')}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {insights.map((insight, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border)]"
          >
            <div
              className="shrink-0 mt-0.5 p-1 rounded-lg"
              style={{ backgroundColor: 'var(--accent-quiet)', color: 'var(--accent-text)' }}
            >
              {Icons.lightbulb}
            </div>
            <p className="text-sm text-[var(--text-2)] leading-relaxed">{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
