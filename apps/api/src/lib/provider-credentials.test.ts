import { describe, expect, it, vi } from 'vitest';

vi.mock('@chat/crypto', () => ({
  decrypt: vi.fn(() => {
    throw new Error('Unsupported state or unable to authenticate data');
  }),
  encrypt: vi.fn((value: string) => value),
}));

import { resolveProviderCredential } from './provider-credentials';

describe('resolveProviderCredential', () => {
  it('surfaces a reconnect message when stored credentials cannot be decrypted', async () => {
    await expect(
      resolveProviderCredential({
        id: 'cfg-1',
        providerId: 'openai',
        encryptedApiKey: 'broken-ciphertext',
        options: JSON.stringify({ authType: 'codex' }),
      })
    ).rejects.toThrow(
      'Stored credentials for provider "openai" can no longer be decrypted. Reconnect this provider in Settings.'
    );
  });
});
