import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorySettingsSection } from './MemorySettingsSection';

const memoryHook = vi.hoisted(() => ({
  useMemory: vi.fn(),
}));

vi.mock('../hooks/useMemory', () => ({
  useMemory: memoryHook.useMemory,
}));

const createMemory = vi.fn();
const updateMemory = vi.fn();
const deleteMemory = vi.fn();
const setMemoryEnabled = vi.fn();

function hookValue(overrides: Record<string, unknown> = {}) {
  return {
    memories: [
      {
        id: 'memory-1',
        userId: 'user-a',
        content: 'Prefiere respuestas directas',
        source: 'manual',
        tags: ['preferencia'],
        createdAt: '2026-06-12T18:00:00.000Z',
        updatedAt: '2026-06-12T18:00:00.000Z',
      },
    ],
    loading: false,
    error: null,
    saving: false,
    deletingId: null,
    memoryEnabled: true,
    setMemoryEnabled,
    createMemory,
    updateMemory,
    deleteMemory,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('MemorySettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryHook.useMemory.mockReturnValue(hookValue());
  });

  it('renders the toggle and existing memories with accessible actions', () => {
    render(<MemorySettingsSection />);

    expect(screen.getByRole('switch', { name: 'Usar memoria' })).toBeChecked();
    expect(screen.getByText('Prefiere respuestas directas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar memoria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Borrar memoria' })).toBeInTheDocument();
  });

  it('shows an honest empty state and loading/error feedback', () => {
    memoryHook.useMemory.mockReturnValue(
      hookValue({ memories: [], loading: false, error: 'No se pudo cargar' })
    );

    render(<MemorySettingsSection />);

    expect(screen.getByText('Todavía no hay memorias guardadas')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar');
  });

  it('creates a memory from content and comma-separated tags', async () => {
    createMemory.mockResolvedValue(undefined);
    render(<MemorySettingsSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Añadir memoria' }));
    fireEvent.change(screen.getByLabelText('Contenido de la memoria'), {
      target: { value: 'Trabaja en Roundtable' },
    });
    fireEvent.change(screen.getByLabelText('Etiquetas'), {
      target: { value: 'proyecto, typescript' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar memoria' }));

    await waitFor(() => {
      expect(createMemory).toHaveBeenCalledWith('Trabaja en Roundtable', [
        'proyecto',
        'typescript',
      ]);
    });
  });

  it('edits and deletes an existing memory', async () => {
    updateMemory.mockResolvedValue(undefined);
    deleteMemory.mockResolvedValue(undefined);
    render(<MemorySettingsSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar memoria' }));
    fireEvent.change(screen.getByLabelText('Contenido de la memoria'), {
      target: { value: 'Prefiere respuestas breves' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(updateMemory).toHaveBeenCalledWith(
        'memory-1',
        'Prefiere respuestas breves',
        ['preferencia']
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Borrar memoria' }));
    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith('memory-1'));
  });

  it('updates the global memory preference', () => {
    render(<MemorySettingsSection />);

    fireEvent.click(screen.getByRole('switch', { name: 'Usar memoria' }));

    expect(setMemoryEnabled).toHaveBeenCalledWith(false);
  });
});
