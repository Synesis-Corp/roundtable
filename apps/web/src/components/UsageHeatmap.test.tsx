import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import { UsageHeatmap } from './UsageHeatmap';
import type { HeatmapResponse } from '../hooks/useUsageHeatmap';

function withI18n(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

const sample: HeatmapResponse = {
  period: '6m',
  days: [
    { date: '2026-06-15', tokens: 0 },
    { date: '2026-06-16', tokens: 50 },
    { date: '2026-06-17', tokens: 250 },
  ],
  totalTokens: 300,
  peakTokens: 250,
  activeDays: 2,
};

describe('UsageHeatmap', () => {
  it('renders loading state', () => {
    render(withI18n(<UsageHeatmap data={null} loading />));
    expect(screen.getByText(/loading|cargando/i)).toBeDefined();
  });

  it('renders error state', () => {
    render(withI18n(<UsageHeatmap data={null} error="nope" />));
    expect(screen.getByText(/nope/)).toBeDefined();
  });

  it('renders the three KPIs and the day cells', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    expect(screen.getByTestId('heatmap-total').textContent).toBe('300');
    expect(screen.getByTestId('heatmap-peak').textContent).toBe('250');
    expect(screen.getByTestId('heatmap-active-days').textContent).toBe('2');
    expect(screen.getByTestId('heatmap-day-2026-06-17')).toBeDefined();
  });

  it('returns null when there is no data and not loading', () => {
    const { container } = render(withI18n(<UsageHeatmap data={null} />));
    expect(container.firstChild).toBeNull();
  });

  it('grid stays compact: 7 rows × CELL_HEIGHT + header (regression: vertical overflow)', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    const grid = screen.getByTestId('usage-heatmap-grid');
    // inline style is on the element (style attribute wins over CSS).
    // gridTemplateRows should be `auto repeat(7, ${CELL}px)` where CELL=14
    // → roughly 14 * 7 + gap * 6 = 98 + 18 = 116px of body plus the auto header.
    const style = (grid as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain('grid-template-rows: auto repeat(7, 14px)');
    // No implicit row expansion (the old grid bug made the body grow to
    // thousands of pixels because all weeks + labels collided in 2 columns).
    expect(style).not.toMatch(/min-height/i);
  });

  it('renders one row per weekday label (Mon..Sun, exactly 7)', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    const grid = screen.getByTestId('usage-heatmap-grid');
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const l of labels) {
      // Each label appears exactly once in the grid (leftmost column).
      const matches = Array.from(grid.querySelectorAll('span')).filter((s) => s.textContent === l);
      expect(matches.length, `label ${l}`).toBe(1);
    }
  });
});
