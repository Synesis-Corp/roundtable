import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CouncilMembersModal } from './CouncilMembersModal';
import type { ModelInfo } from '@chat/sdk';
import type { CouncilConfig } from '../hooks/useCouncilConfig';

const mockModels: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'Flagship model',
    contextWindow: 128000,
    capabilities: ['text', 'vision'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Fast and affordable',
    contextWindow: 128000,
    capabilities: ['text'],
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    description: 'Most capable',
    contextWindow: 200000,
    capabilities: ['text'],
  },
  {
    id: 'claude-3-haiku',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    description: 'Fast',
    contextWindow: 200000,
    capabilities: ['text'],
  },
];

function renderModal(props: Partial<Parameters<typeof CouncilMembersModal>[0]> = {}) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    models: mockModels,
    currentConfig: null as CouncilConfig | null,
    onSave: vi.fn(),
    onReset: vi.fn(),
  };
  return render(<CouncilMembersModal {...defaultProps} {...props} />);
}

describe('CouncilMembersModal', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders header and close button', () => {
    renderModal();
    expect(screen.getByText('Miembros del Consejo')).toBeInTheDocument();
    expect(screen.getByLabelText('Cerrar')).toBeInTheDocument();
  });

  it('groups models by provider with colored dots', () => {
    renderModal();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('Claude 3 Opus')).toBeInTheDocument();
  });

  it('shows tier badges (Fuerte/Liviano)', () => {
    renderModal();
    expect(screen.getAllByText('Fuerte').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Liviano').length).toBeGreaterThanOrEqual(1);
  });

  it('updates counter when selecting models', () => {
    renderModal();
    const checkboxes = screen
      .getAllByRole('checkbox')
      .filter((cb) => cb.getAttribute('type') === 'checkbox' && !cb.classList.contains('sr-only'));
    // Auto mode is on by default when no config, so first we need to turn it off
    const autoToggle = screen
      .getAllByRole('checkbox')
      .find((cb) => cb.classList.contains('sr-only'));
    if (autoToggle) fireEvent.click(autoToggle);

    // Now select models
    const gpt4o = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes('GPT-4o'));
    const claude = checkboxes.find((cb) =>
      cb.closest('label')?.textContent?.includes('Claude 3 Opus')
    );
    if (gpt4o) fireEvent.click(gpt4o);
    if (claude) fireEvent.click(claude);

    expect(screen.getByText((content) => content.includes('seleccionados'))).toBeInTheDocument();
  });

  it('disables checkboxes and shows auto-selected models when auto toggle is on', () => {
    renderModal();
    // Auto toggle is on by default
    const checkboxes = screen
      .getAllByRole('checkbox')
      .filter((cb) => cb.getAttribute('type') === 'checkbox' && !cb.classList.contains('sr-only'));
    expect(checkboxes.length).toBeGreaterThan(0);
    for (const cb of checkboxes) {
      expect(cb).toBeDisabled();
    }
  });

  it('shows validation error when fewer than 2 models selected', async () => {
    renderModal();
    // Turn off auto
    const autoToggle = screen
      .getAllByRole('checkbox')
      .find((cb) => cb.classList.contains('sr-only'));
    if (autoToggle) fireEvent.click(autoToggle);

    // Uncheck all but one
    const checkboxes = screen
      .getAllByRole('checkbox')
      .filter((cb) => cb.getAttribute('type') === 'checkbox' && !cb.classList.contains('sr-only'));
    for (const cb of checkboxes) {
      if ((cb as HTMLInputElement).checked) fireEvent.click(cb);
    }
    // Check just one
    if (checkboxes[0]) fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByText('Selecciona al menos 2 modelos')).toBeInTheDocument();
    });
  });

  it('disables Guardar when manual selection is invalid', () => {
    renderModal();
    // Turn off auto
    const autoToggle = screen
      .getAllByRole('checkbox')
      .find((cb) => cb.classList.contains('sr-only'));
    if (autoToggle) fireEvent.click(autoToggle);

    // Uncheck all
    const checkboxes = screen
      .getAllByRole('checkbox')
      .filter((cb) => cb.getAttribute('type') === 'checkbox' && !cb.classList.contains('sr-only'));
    for (const cb of checkboxes) {
      if ((cb as HTMLInputElement).checked) fireEvent.click(cb);
    }

    const guardar = screen.getByText('Guardar');
    expect(guardar).toBeDisabled();
  });

  it('calls onSave when Guardar clicked with valid manual selection', () => {
    const onSave = vi.fn();
    renderModal({
      currentConfig: {
        id: 'cfg-1',
        userId: 'u-1',
        modelIds: ['openai:gpt-4o', 'anthropic:claude-3-opus'],
        mode: 'manual',
        createdAt: '',
        updatedAt: '',
      },
      onSave,
    });

    const guardar = screen.getByText('Guardar');
    fireEvent.click(guardar);
    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining(['openai:gpt-4o', 'anthropic:claude-3-opus']),
      'manual'
    );
  });

  it('calls onReset when Guardar clicked in auto mode', async () => {
    const onReset = vi.fn();
    renderModal({ onReset });
    // Auto mode is on by default
    const guardar = screen.getByText('Guardar');
    await act(async () => {
      fireEvent.click(guardar);
    });
    expect(onReset).toHaveBeenCalled();
  });

  it('calls onClose when Cancelar is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
