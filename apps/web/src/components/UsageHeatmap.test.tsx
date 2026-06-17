import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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
    const style = (grid as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain('grid-template-rows: auto repeat(7, 16px)');
    expect(style).not.toMatch(/min-height/i);
  });

  it('renders one row per weekday label (Mon..Sun, exactly 7)', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    const grid = screen.getByTestId('usage-heatmap-grid');
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const l of labels) {
      const matches = Array.from(grid.querySelectorAll('span')).filter((s) => s.textContent === l);
      expect(matches.length, `label ${l}`).toBe(1);
    }
  });

  it('uses minmax(12px, 1fr) for week columns so the grid fills the available width', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    const grid = screen.getByTestId('usage-heatmap-grid');
    const style = (grid as HTMLElement).getAttribute('style') ?? '';
    // Cells expand to fill width but never shrink below 12px (avoids a
    // wall of zero-width squares on narrow viewports). Rows stay at a
    // fixed 16px (cells stay square-ish when the column is wider than tall).
    expect(style).toContain('minmax(12px, 1fr)');
    expect(style).toContain('repeat(7, 16px)');
  });

  it('cell width is 100% (defers to the column track size, not a fixed pixel)', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    const cell = screen.getByTestId('heatmap-day-2026-06-17');
    const style = (cell as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain('width: 100%');
    expect(style).not.toMatch(/width:\s*16px/);
  });

  it('tooltip is position: fixed and uses viewport coordinates (regression: flew outside the card)', () => {
    render(withI18n(<UsageHeatmap data={sample} />));
    const cell = screen.getByTestId('heatmap-day-2026-06-17');
    // Mock getBoundingClientRect so the cell reports a known viewport position.
    cell.getBoundingClientRect = vi.fn(() => ({
      left: 200,
      top: 100,
      width: 16,
      height: 16,
      right: 216,
      bottom: 116,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    }));
    fireEvent.mouseEnter(cell);

    const tooltip = screen.getByTestId('usage-heatmap-tooltip');
    const style = (tooltip as HTMLElement).getAttribute('style') ?? '';
    // 'fixed' (not 'absolute') keeps the tooltip anchored to the cell
    // regardless of any ancestor's positioning context.
    expect((tooltip as HTMLElement).className).toContain('fixed');
    // Coords are viewport-relative (no window.scrollX/Y added).
    expect(style).toMatch(/left:\s*208/); // 200 + width/2 = 208
    expect(style).toMatch(/top:\s*92/); // 100 (rect.top) - 8 (gap)
  });
});
