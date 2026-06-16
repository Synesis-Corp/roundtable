import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storage } from '../lib/storage';
import { useMemory } from './useMemory';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../lib/api-client', () => ({
  apiGet: api.get,
  apiPost: api.post,
  apiPatch: api.patch,
  apiDelete: api.delete,
}));

const firstMemory = {
  id: 'memory-1',
  userId: 'user-a',
  content: 'Prefiere TypeScript',
  source: 'manual',
  tags: ['tecnologia'],
  createdAt: '2026-06-12T18:00:00.000Z',
  updatedAt: '2026-06-12T18:00:00.000Z',
};

describe('useMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.set('token', 'test-token');
    storage.remove('memoryEnabled');
    api.get.mockResolvedValue([firstMemory]);
  });

  it('loads memories and exposes the enabled-by-default preference', async () => {
    const { result } = renderHook(() => useMemory());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.memories).toEqual([firstMemory]);
    expect(result.current.memoryEnabled).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/memory');
  });

  it('creates, updates, and deletes memories while keeping local state in sync', async () => {
    const created = { ...firstMemory, id: 'memory-2', content: 'Trabaja en Roundtable' };
    const updated = { ...created, content: 'Construye Roundtable', tags: ['proyecto'] };
    api.post.mockResolvedValue(created);
    api.patch.mockResolvedValue(updated);
    api.delete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMemory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.createMemory('Trabaja en Roundtable', ['proyecto']));
    expect(result.current.memories.map((item) => item.id)).toEqual(['memory-2', 'memory-1']);
    expect(api.post).toHaveBeenCalledWith('/memory', {
      content: 'Trabaja en Roundtable',
      tags: ['proyecto'],
    });

    await act(() =>
      result.current.updateMemory('memory-2', 'Construye Roundtable', ['proyecto'])
    );
    expect(result.current.memories[0]).toEqual(updated);
    expect(api.patch).toHaveBeenCalledWith('/memory/memory-2', {
      content: 'Construye Roundtable',
      tags: ['proyecto'],
    });

    await act(() => result.current.deleteMemory('memory-2'));
    expect(result.current.memories.map((item) => item.id)).toEqual(['memory-1']);
    expect(api.delete).toHaveBeenCalledWith('/memory/memory-2');
  });

  it('persists the global toggle in the existing client preference store', async () => {
    const { result } = renderHook(() => useMemory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setMemoryEnabled(false));

    expect(result.current.memoryEnabled).toBe(false);
    expect(storage.get('memoryEnabled')).toBe('false');
  });

  it('surfaces mutation errors without discarding the loaded list', async () => {
    api.post.mockRejectedValue(new Error('No se pudo guardar'));
    const { result } = renderHook(() => useMemory());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.createMemory('Nueva memoria', []);
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toEqual(new Error('No se pudo guardar'));
    expect(result.current.error).toBe('No se pudo guardar');
    expect(result.current.memories).toEqual([firstMemory]);
  });
});
