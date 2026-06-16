import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActiveModelsModal } from './ActiveModelsModal';

const saveMock = vi.fn().mockResolvedValue(undefined);

// Mutable state the mocked hook returns; reassigned per test.
let hookState: {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
    contextWindow: number;
    capabilities: string[];
  }>;
  activeIds: string[];
  loading: boolean;
  error: string | null;
  save: typeof saveMock;
};

vi.mock('../hooks/useActiveModels', () => ({
  useActiveModels: () => hookState,
}));

function model(id: string) {
  return {
    id,
    name: id.toUpperCase(),
    provider: 'openai',
    description: '',
    contextWindow: 1000,
    capabilities: [],
  };
}

describe('ActiveModelsModal (#1)', () => {
  beforeEach(() => {
    saveMock.mockClear();
    hookState = {
      models: [model('gpt-5.4'), model('gpt-5.4-mini'), model('o5')],
      activeIds: [],
      loading: false,
      error: null,
      save: saveMock,
    };
  });

  it('renders nothing when providerId is null', () => {
    const { container } = render(
      <ActiveModelsModal providerId={null} providerName="OpenAI" onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('checks every model when no allow-list is saved (activeIds empty = show all)', () => {
    render(<ActiveModelsModal providerId="openai" providerName="OpenAI" onClose={() => {}} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('checks only the saved ids when an allow-list exists', () => {
    hookState.activeIds = ['gpt-5.4'];
    render(<ActiveModelsModal providerId="openai" providerName="OpenAI" onClose={() => {}} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const checked = boxes.filter((b) => b.checked);
    expect(checked).toHaveLength(1);
  });

  it('saves the chosen subset when the user unchecks a model', async () => {
    hookState.activeIds = ['gpt-5.4', 'gpt-5.4-mini', 'o5']; // start: all three
    render(<ActiveModelsModal providerId="openai" providerName="OpenAI" onClose={() => {}} />);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(boxes[2]); // uncheck "o5"
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith(['gpt-5.4', 'gpt-5.4-mini']);
  });

  it('saves an empty list (reset to show all) when every model stays selected', async () => {
    render(<ActiveModelsModal providerId="openai" providerName="OpenAI" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock).toHaveBeenCalledWith([]);
  });
});
