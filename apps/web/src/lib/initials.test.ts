import { describe, it, expect } from 'vitest';
import { getInitials } from './initials';

describe('getInitials', () => {
  it('takes up to two initials, uppercased', () => {
    expect(getInitials('john doe')).toBe('JD');
    expect(getInitials('john michael doe')).toBe('JM');
  });

  it('splits on dots, underscores and dashes', () => {
    expect(getInitials('john.doe')).toBe('JD');
    expect(getInitials('ada_lovelace')).toBe('AL');
  });

  it('handles a single token', () => {
    expect(getInitials('elias')).toBe('E');
  });

  it("falls back to 'U' for empty input", () => {
    expect(getInitials('')).toBe('U');
    expect(getInitials('   ')).toBe('U');
  });
});
