import { describe, it, expect } from 'vitest';
import {
  getKnownProviderBaseURL,
  getProvider,
  LruCache,
  stableStringify,
} from './provider-registry';

describe('provider base URL fallbacks', () => {
  it('uses the Gemini API endpoint when Models.dev omits Google.api', () => {
    expect(getKnownProviderBaseURL('google')).toBe(
      'https://generativelanguage.googleapis.com/v1beta'
    );
  });

  it('does not assign the OpenAI endpoint to native providers without a catalog URL', () => {
    expect(getKnownProviderBaseURL('anthropic')).toBeUndefined();
  });

  it('fails closed instead of sending an unknown provider key to api.openai.com', () => {
    expect(getProvider('unknown-provider-without-endpoint')).toBeUndefined();
  });
});

describe('LruCache', () => {
  it('round-trips set → get', () => {
    const cache = new LruCache<string, string>(10);
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for missing keys', () => {
    const cache = new LruCache<string, string>(10);
    expect(cache.get('nope')).toBeUndefined();
  });

  it('evicts the oldest entry when capacity is exceeded', () => {
    const cache = new LruCache<string, string>(3);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4'); // exceeds capacity → evicts "a"

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  it('re-inserting an existing key does not count toward capacity', () => {
    const cache = new LruCache<string, string>(2);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', 'one'); // update → no eviction (a already exists)

    expect(cache.get('a')).toBe('one');
    expect(cache.get('b')).toBe('2');
    expect(cache.size).toBe(2);
  });

  it('evicts the correct oldest after updates', () => {
    const cache = new LruCache<string, string>(3);

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    // a is oldest. Update b — does not change insertion order.
    cache.set('b', 'two');
    // Still a, b, c. Push d → evict a (still oldest).
    cache.set('d', '4');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('two');
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  it('respects the max size (not one-off)', () => {
    const cache = new LruCache<number, string>(5);
    for (let i = 0; i < 100; i++) cache.set(i, `val-${i}`);
    expect(cache.size).toBe(5);
    expect(cache.get(0)).toBeUndefined(); // first 95 evicted
    expect(cache.get(99)).toBe('val-99'); // last 5 retained
  });
});

describe('stableStringify', () => {
  it('produces the same output regardless of key insertion order', () => {
    const a = { baseURL: 'https://x.com', apiKey: 'secret' };
    const b = { apiKey: 'secret', baseURL: 'https://x.com' };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('produces a valid JSON string with sorted keys', () => {
    const obj = { zebra: 1, apple: 2, mango: 3 };
    const result = stableStringify(obj);
    expect(result).toBe('{"apple":2,"mango":3,"zebra":1}');
  });

  it('handles empty objects', () => {
    expect(stableStringify({})).toBe('{}');
  });
});
