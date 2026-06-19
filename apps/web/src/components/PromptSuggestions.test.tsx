import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptSuggestions } from './PromptSuggestions';
import type { PromptSuggestion } from '../lib/prompt-suggestions';

const SUGGESTIONS: PromptSuggestion[] = [
  { key: 'a', kind: 'continue', title: 'Payments architecture' },
  { key: 'b', kind: 'summarize', title: 'Yesterday notes' },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PromptSuggestions', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<PromptSuggestions suggestions={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one button per suggestion', () => {
    render(<PromptSuggestions suggestions={SUGGESTIONS} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('shows each conversation title in its pill', () => {
    render(<PromptSuggestions suggestions={SUGGESTIONS} onSelect={vi.fn()} />);
    expect(screen.getByText(/Payments architecture/)).toBeInTheDocument();
    expect(screen.getByText(/Yesterday notes/)).toBeInTheDocument();
  });

  it('calls onSelect with a non-empty prompt containing the title when clicked', () => {
    const onSelect = vi.fn();
    render(<PromptSuggestions suggestions={SUGGESTIONS} onSelect={onSelect} />);
    fireEvent.click(screen.getByText(/Payments architecture/));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0] as string;
    expect(arg).toContain('Payments architecture');
    expect(arg.length).toBeGreaterThan('Payments architecture'.length);
  });

  it('renders the "based on your usage" context label', () => {
    render(<PromptSuggestions suggestions={SUGGESTIONS} onSelect={vi.fn()} />);
    // i18n is forced to English in the test setup.
    expect(screen.getByText(/based on your usage/i)).toBeInTheDocument();
  });
});
