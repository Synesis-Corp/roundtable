import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActions } from './QuickActions';

describe('QuickActions — colorful chips (Capability 10)', () => {
  it('renders exactly 3 chips', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('does NOT render an image-generation chip (icon color violet)', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const violetChips = buttons.filter(
      (b) => b.querySelector('span')?.style.color === 'var(--m-violet)'
    );
    expect(violetChips).toHaveLength(0);
  });

  it('Ideas chip: icon color is rose (NOT amber)', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const ideas = buttons[2];
    const iconWrap = ideas.querySelector('span')!;
    expect(iconWrap.style.color).toBe('var(--m-rose)');
  });

  it('Escribir chip: icon color is blue', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const escribir = buttons[0];
    const iconWrap = escribir.querySelector('span')!;
    expect(iconWrap.style.color).toBe('var(--m-blue)');
  });

  it('Buscar chip: icon color is green', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const buscar = buttons[1];
    const iconWrap = buscar.querySelector('span')!;
    expect(iconWrap.style.color).toBe('var(--m-green)');
  });

  it('chip text color idle = var(--text-3)', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    // Text color is applied to the button itself; the label span inherits.
    expect((buttons[0] as HTMLElement).style.color).toBe('var(--text-3)');
  });

  it('chip text color hover = var(--text-1)', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const button = buttons[0] as HTMLElement;
    fireEvent.mouseEnter(button);
    expect(button.style.color).toBe('var(--text-1)');
  });

  it('clicking a chip calls onSelect with the localized prefix', () => {
    const onSelect = vi.fn();
    render(<QuickActions onSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // buttons[0] is now the "write" chip — prefix = "Help me write " in en.
    expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/help me write/i));
  });

  it('icon container is a 24px square (or 18-24 range)', () => {
    render(<QuickActions onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const iconWrap = buttons[0].querySelector('span')!;
    const w = parseInt(iconWrap.style.width, 10);
    const h = parseInt(iconWrap.style.height, 10);
    expect(w).toBeGreaterThanOrEqual(18);
    expect(w).toBeLessThanOrEqual(24);
    expect(h).toBeGreaterThanOrEqual(18);
    expect(h).toBeLessThanOrEqual(24);
  });
});
