import { Fragment, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HeatmapDay, HeatmapResponse } from '../hooks/useUsageHeatmap';

const CELL = 16;
const GAP = 3;
const CELL_MIN = 12;
// Display order in the leftmost label column. We pad the first week so that
// `getUTCDay()` (0 = Sun) maps cleanly: row 0 = Mon, row 6 = Sun.
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
  days: (HeatmapDay | null)[]; // length 7, indexed 0..6 = Sun..Sat
}

function groupByWeek(days: HeatmapDay[]): WeekColumn[] {
  if (days.length === 0) return [];
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

  // Render one month label per visible month boundary. We start the label at
  // the first week of each new month — the previous month label sits exactly
  // under its first column, just like GitHub's contribution graph.
  const seenMonths = new Set<string>();
  const monthLabels: { col: number; label: string }[] = [];
  weeks.forEach((w, idx) => {
    const d = new Date(`${w.startDate}T00:00:00.000Z`);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (seenMonths.has(key)) return;
    seenMonths.add(key);
    monthLabels.push({
      col: idx,
      label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
    });
  });

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
            data-testid="usage-heatmap-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: `32px repeat(${weeks.length}, minmax(${CELL_MIN}px, 1fr))`,
              gridTemplateRows: `auto repeat(7, ${CELL}px)`,
              columnGap: GAP,
              rowGap: GAP,
              color: 'var(--text-3)',
              width: '100%',
            }}
          >
            {/* Row 0: month labels (one per new month, others blank). */}
            <span />
            {weeks.map((_w, idx) => {
              const ml = monthLabels.find((m) => m.col === idx);
              return (
                <span
                  key={`month-${idx}`}
                  className="text-[10px] uppercase tracking-wide"
                  style={{ height: 14, lineHeight: '14px' }}
                >
                  {ml?.label ?? ''}
                </span>
              );
            })}

            {/* Rows 1..7: Mon..Sun. The first column is the row label, the rest
                are the actual cells (one per week, ISO Sun=0 .. Sat=6). */}
            {ROW_LABELS.map((rowLabel, displayRow) => {
              // displayRow 0..6 = Mon..Sun. We need to look up the matching
              // index inside each week's `days` (which is Sun=0 .. Sat=6).
              const isoDow = (displayRow + 1) % 7; // 0..6, Mon=1
              return (
                <Fragment key={`row-${rowLabel}`}>
                  <span
                    className="text-[10px] uppercase tracking-wide"
                    style={{
                      color: 'var(--text-3)',
                      alignSelf: 'center',
                      height: CELL,
                      lineHeight: `${CELL}px`,
                    }}
                  >
                    {rowLabel}
                  </span>
                  {weeks.map((w) => {
                    const day = w.days[isoDow] ?? null;
                    if (day === null) {
                      return (
                        <div
                          key={`empty-${w.startDate}-${isoDow}`}
                          style={{ width: CELL, height: CELL }}
                        />
                      );
                    }
                    return (
                      <div
                        key={day.date}
                        role="button"
                        tabIndex={0}
                        aria-label={`${day.date}: ${formatTokens(day.tokens)} tokens`}
                        onMouseEnter={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          // Viewport-relative coords — the tooltip uses
                          // position: fixed so it sticks to the cell on scroll.
                          setHover({
                            day,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onFocus={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setHover({
                            day,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onBlur={() => setHover(null)}
                        style={{
                          width: '100%',
                          height: CELL,
                          borderRadius: 3,
                          backgroundColor: colorFor(day.tokens, max),
                        }}
                        data-testid={`heatmap-day-${day.date}`}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
          </div>

          <div
            className="flex items-center gap-2 mt-4 text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            <span>{t('usage.heatmap.less')}</span>
            {[1, 40, 60, 80, 100].map((p, i) => (
              <span
                key={i}
                style={{
                  width: CELL,
                  height: CELL,
                  backgroundColor: colorFor(p, 100),
                  borderRadius: 3,
                }}
              />
            ))}
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
          data-testid="usage-heatmap-tooltip"
          className="fixed z-50 px-3 py-2 text-xs rounded-md pointer-events-none"
          style={{
            left: hover.x,
            top: hover.y - 8,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--bg-elevated, #2a2a2a)',
            color: 'var(--text-1, #fff)',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
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
