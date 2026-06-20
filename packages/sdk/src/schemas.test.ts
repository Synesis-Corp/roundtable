import { describe, it, expect } from 'vitest';
import { ProviderOptionsSchema } from './schemas';

/** True when the schema accepts this baseURL (i.e. it is NOT blocked). */
function accepts(baseURL: string): boolean {
  return ProviderOptionsSchema.safeParse({ baseURL }).success;
}

describe('ProviderOptionsSchema baseURL SSRF guard', () => {
  it('accepts legitimate public HTTPS and localhost endpoints', () => {
    expect(accepts('https://api.openai.com/v1')).toBe(true);
    expect(accepts('http://localhost:11434/v1')).toBe(true);
    expect(accepts('https://[::1]:11434')).toBe(true); // IPv6 loopback for local LLMs
  });

  it('rejects private, loopback and metadata IPv4', () => {
    expect(accepts('https://10.0.0.1/api')).toBe(false);
    expect(accepts('https://127.0.0.1:8080')).toBe(false);
    expect(accepts('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(accepts('https://metadata.google.internal')).toBe(false);
  });

  it('rejects decimal/hex IPv4 encodings (normalized to dotted by new URL())', () => {
    expect(accepts('https://2130706433/')).toBe(false); // 127.0.0.1
    expect(accepts('https://0x7f000001/')).toBe(false); // 127.0.0.1
  });

  // THE FIX: IPv4-mapped IPv6 smuggles a private/metadata IPv4 past the plain
  // IPv4 checks — new URL() serializes ::ffff:169.254.169.254 to ::ffff:a9fe:a9fe.
  it('rejects IPv4-mapped IPv6 forms (the bypass)', () => {
    expect(accepts('https://[::ffff:169.254.169.254]/latest/meta-data/')).toBe(false);
    expect(accepts('https://[::ffff:127.0.0.1]/')).toBe(false);
    expect(accepts('https://[::ffff:10.0.0.1]/')).toBe(false);
    expect(accepts('https://[0:0:0:0:0:ffff:a9fe:a9fe]/')).toBe(false); // long form of metadata
  });

  it('rejects the IPv6 unspecified address', () => {
    expect(accepts('https://[::]/')).toBe(false);
  });
});
