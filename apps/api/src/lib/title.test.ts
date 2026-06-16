import { describe, expect, it, vi } from 'vitest';
import { cleanTitle, generateConversationTitle } from './title';

function titleProvider(id: string, content = 'Un título corto') {
  return {
    id,
    chat: vi.fn().mockResolvedValue({ content }),
  };
}

describe('cleanTitle', () => {
  it('strips wrapping quotes, a leading label and a trailing period', () => {
    expect(cleanTitle('"Hola mundo".')).toBe('Hola mundo');
    expect(cleanTitle('Título: Plan de marketing')).toBe('Plan de marketing');
  });

  it('truncates titles longer than 60 chars', () => {
    expect(cleanTitle('a'.repeat(80)).length).toBeLessThanOrEqual(61);
  });
});

describe('generateConversationTitle', () => {
  it('returns a cleaned title for an eligible model', async () => {
    const provider = titleProvider('openai', '"Plan de viaje".');
    const title = await generateConversationTitle(provider, 'gpt-4o', 'key', 'hola', 'respuesta');
    expect(title).toBe('Plan de viaje');
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it('skips generation (no provider call) when the model is excluded from title', async () => {
    const provider = titleProvider('openai');
    const title = await generateConversationTitle(
      provider,
      'text-embedding-3-small',
      'key',
      'hola',
      'respuesta'
    );
    expect(title).toBeNull();
    expect(provider.chat).not.toHaveBeenCalled();
  });
});
