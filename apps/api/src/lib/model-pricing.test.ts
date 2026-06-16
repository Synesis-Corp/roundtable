import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchOpenRouterPricing,
  getLivePrice,
  getModelPrice,
  calculateCost,
  initializePricing,
} from '../lib/model-pricing';

// Mock fetch globally
global.fetch = vi.fn();

describe('model-pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state by re-importing would be complex; instead we test
    // the public API surface which caches results.
  });

  describe('fetchOpenRouterPricing', () => {
    it('populates cache with OpenRouter pricing data', async () => {
      const mockData = {
        data: [
          {
            id: 'openai/gpt-4o',
            pricing: { prompt: '0.0000025', completion: '0.00001' },
          },
          {
            id: 'anthropic/claude-3-5-sonnet-20241022',
            pricing: { prompt: '0.000003', completion: '0.000015' },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      await fetchOpenRouterPricing();

      const price = await getLivePrice('openai', 'gpt-4o');
      expect(price).toEqual({ inputPrice: 0.0000025, outputPrice: 0.00001 });
    });

    it('handles fetch errors gracefully', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(fetchOpenRouterPricing()).resolves.toBeUndefined();
    });

    it('handles non-200 responses gracefully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
      } as Response);

      await expect(fetchOpenRouterPricing()).resolves.toBeUndefined();
    });
  });

  describe('getModelPrice', () => {
    it('returns static fallback price for known model', async () => {
      const price = await getModelPrice('openai', 'gpt-4o');
      expect(price).toEqual({ inputPrice: 0.0000025, outputPrice: 0.00001 });
    });

    it('returns static fallback price for another known model', async () => {
      const price = await getModelPrice('anthropic', 'claude-3-5-sonnet-20241022');
      expect(price).toEqual({ inputPrice: 0.000003, outputPrice: 0.000015 });
    });

    it('returns default price for unknown model', async () => {
      const price = await getModelPrice('unknown', 'unknown-model');
      expect(price).toEqual({ inputPrice: 0.000001, outputPrice: 0.000003 });
    });

    it('uses live cache when available', async () => {
      const mockData = {
        data: [
          {
            id: 'custom/provider-model',
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      // First call populates cache
      await fetchOpenRouterPricing();

      const price = await getModelPrice('custom', 'provider-model');
      expect(price).toEqual({ inputPrice: 0.000001, outputPrice: 0.000002 });
    });
  });

  describe('calculateCost', () => {
    it('calculates cost correctly with input and output tokens', () => {
      const price = { inputPrice: 0.0000025, outputPrice: 0.00001 };
      const cost = calculateCost(1000, 500, price);
      expect(cost).toBe(1000 * 0.0000025 + 500 * 0.00001);
    });

    it('handles null tokens gracefully', () => {
      const price = { inputPrice: 0.0000025, outputPrice: 0.00001 };
      const cost = calculateCost(null, null, price);
      expect(cost).toBe(0);
    });

    it('handles undefined tokens gracefully', () => {
      const price = { inputPrice: 0.0000025, outputPrice: 0.00001 };
      const cost = calculateCost(undefined, undefined, price);
      expect(cost).toBe(0);
    });

    it('calculates cost with only input tokens', () => {
      const price = { inputPrice: 0.0000025, outputPrice: 0.00001 };
      const cost = calculateCost(1000, null, price);
      expect(cost).toBe(1000 * 0.0000025);
    });
  });

  describe('initializePricing', () => {
    it('populates cache on initialization', async () => {
      const mockData = {
        data: [
          {
            id: 'openai/gpt-4o',
            pricing: { prompt: '0.0000025', completion: '0.00001' },
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      await initializePricing();

      const price = await getLivePrice('openai', 'gpt-4o');
      expect(price).toEqual({ inputPrice: 0.0000025, outputPrice: 0.00001 });
    });
  });
});
