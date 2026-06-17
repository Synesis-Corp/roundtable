import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HeatmapDay, HeatmapResponse } from '../hooks/useUsageHeatmap';

const CELL = 14;
const GAP = 3;
const ROW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  data: HeatmapResponse | null;
  loading?: boolean;
  error?: string | null;
}

function colorFor(tokens: number, max: number): string {
  if (tokens <= 0) return 'var(--heat-0, #1a1a1a)';
  if (max <= 0) return 'var(--heat-0, #1a1a1a)';
  const ratio = tokens / max;
  if (ratio < 0.2) return 'var(--heat-1, #5a2a25)';
  if (ratio < 0.4) return 'var(--heat-2, #8a3a2e)';
  if (ratio < 0.6) return 'var(--heat-3, #c44a3a)';
  if (ratio < 0.8) return 'var(--heat-4, #e85a48)';
  return 'var(--heat-5, #ff6a55)';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface WeekColumn {
  startDate: string; // Sunday of the week, ISO date
  days: (HeatmapDay | null)[]; // length 7, Sun..Sat
}

function groupByWeek(days: HeatmapDay[]): WeekColumn[] {
  if (days.length === 0) return [];
  // Pad the first week so that index 0 is the Sunday before/at the first day.
  const first = new Date(`${days[0].date}T00:00:00.000Z`);
  const firstDow = first.getUTCDay(); // 0 = Sunday
  const padded: (HeatmapDay | null)[] = [...Array(firstDow).fill(null), ...days.map((d) => d)];
  while (padded.length % 7 !== 0) padded.push(null);

  const cols: WeekColumn[] = [];
  for (let i = 0; i < padded.length; i += 7) {
    const slice = padded.slice(i, i + 7);
    const startDate = slice[0]?.date ?? days[Math.max(0, i - firstDow)].date;
    cols.push({ startDate, days: slice });
  }
  return cols;
}

export function UsageHeatmap({ data, loading, error }: Props) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<{ day: HeatmapDay; x: number; y: number } | null>(null);

  const weeks = useMemo(() => groupByWeek(data?.days ?? []), [data]);
  const max = data?.peakTokens ?? 0;

  if (loading) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="text-sm" style={{ color: 'var(--text-3)' }}>
          {t('usage.heatmap.loading')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl p-6"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="text-sm" style={{ color: 'var(--m-rose)' }}>
          {t('usage.heatmap.error', { error })}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const monthLabelEvery = 4;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      data-testid="usage-heatmap"
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('usage.heatmap.title')}
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          {t('usage.heatmap.periodLabel', { period: data.period })}
        </span>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div
            className="grid items-center mb-2 text-[10px] uppercase tracking-wide"
            style={{ gridTemplateColumns: '32px 1fr', color: 'var(--text-3)' }}
          >
            <span />
            <div className="relative" style={{ height: 14 }}>
              {weeks.map((w, idx) => {
                if (idx % monthLabelEvery !== 0) return null;
                const d = new Date(`${w.startDate}T00:00:00.000Z`);
                const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
                return (
                  <span key={w.startDate} className="absolute" style={{ left: idx * (CELL + GAP) }}>
                    {month}
                  </span>
                );
              })}
            </div>
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: '32px 1fr',
              gridTemplateRows: `repeat(7, ${CELL}px)`,
              columnGap: GAP,
              rowGap: GAP,
            }}
          >
            {ROW_LABELS.map((label) => (
              <div
                key={label}
                className="text-[10px] uppercase tracking-wide self-center"
                style={{ color: 'var(--text-3)' }}
              >
                {label}
              </div>
            )).reduce<JSX.Element[]>((acc, labelNode, idx) => {
              acc.push(labelNode);
              acc.push(<div key={`row-fill-${idx}`} />);
              return acc;
            }, [])}

            {weeks.map((w) => (
              <div
                key={w.startDate}
                className="contents"
                data-testid={`heatmap-week-${w.startDate}`}
              >
                {w.days.map((day, dayIdx) =>
                  day === null ? (
                    <div
                      key={`empty-${w.startDate}-${dayIdx}`}
                      style={{ width: CELL, height: CELL }}
                    />
                  ) : (
                    <div
                      key={day.date}
                      role="button"
                      tabIndex={0}
                      aria-label={`${day.date}: ${formatTokens(day.tokens)} tokens`}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHover({
                          day,
                          x: rect.left + window.scrollX + rect.width / 2,
                          y: rect.top + window.scrollY,
                        });
                      }}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHover({
                          day,
                          x: rect.left + window.scrollX + rect.width / 2,
                          y: rect.top + window.scrollY,
                        });
                      }}
                      onBlur={() => setHover(null)}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 3,
                        backgroundColor: colorFor(day.tokens, max),
                      }}
                      data-testid={`heatmap-day-${day.date}`}
                    />
                  )
                )}
              </div>
            ))}
          </div>

          <div
            className="flex items-center gap-2 mt-4 text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            <span>{t('usage.heatmap.less')}</span>
            <span
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: colorFor(1, 100),
                borderRadius: 3,
              }}
            />
            <span
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: colorFor(40, 100),
                borderRadius: 3,
              }}
            />
            <span
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: colorFor(60, 100),
                borderRadius: 3,
              }}
            />
            <span
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: colorFor(80, 100),
                borderRadius: 3,
              }}
            />
            <span
              style={{
                width: CELL,
                height: CELL,
                backgroundColor: colorFor(100, 100),
                borderRadius: 3,
              }}
            />
            <span>{t('usage.heatmap.more')}</span>
          </div>
        </div>

        <div className="w-44 flex flex-col gap-3 shrink-0">
          <Stat
            label={t('usage.heatmap.totalLabel')}
            value={formatTokens(data.totalTokens)}
            testId="heatmap-total"
          />
          <Stat
            label={t('usage.heatmap.peakLabel')}
            value={formatTokens(data.peakTokens)}
            testId="heatmap-peak"
          />
          <Stat
            label={t('usage.heatmap.activeDaysLabel')}
            value={String(data.activeDays)}
            testId="heatmap-active-days"
          />
        </div>
      </div>

      {hover && (
        <div
          role="tooltip"
          className="absolute z-50 px-3 py-2 text-xs rounded-md pointer-events-none"
          style={{
            left: hover.x,
            top: hover.y - 8,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--bg-elevated, #2a2a2a)',
            color: 'var(--text-1, #fff)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div className="font-semibold">{hover.day.date}</div>
          <div>{formatTokens(hover.day.tokens)} tokens</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <div
        className="text-2xl font-semibold"
        style={{ color: 'var(--text-1)' }}
        data-testid={testId}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
    </div>
  );
}
