import { describe, it, expect } from 'vitest';
import { buildGreeting, getMixinEligibleCount, QUICK_ACTIONS } from './chat-page-helpers';

describe('QUICK_ACTIONS color tokens (Capability 10)', () => {
  // Image generation chip removed by product decision — the three remaining
  // chips are text-only tasks (write, search, ideas).
  it('does NOT include an image-generation chip', () => {
    expect(QUICK_ACTIONS.map((a) => a.labelKey)).not.toContain('chat.quickActions.image');
  });

  it('renders exactly 3 chips', () => {
    expect(QUICK_ACTIONS).toHaveLength(3);
  });

  it('Escribir chip uses --m-blue', () => {
    expect(QUICK_ACTIONS[0].labelKey).toBe('chat.quickActions.write');
    expect(QUICK_ACTIONS[0].iconColorToken).toBe('--m-blue');
  });

  it('Buscar chip uses --m-green', () => {
    expect(QUICK_ACTIONS[1].labelKey).toBe('chat.quickActions.search');
    expect(QUICK_ACTIONS[1].iconColorToken).toBe('--m-green');
  });

  it('Ideas chip uses --m-rose (NOT --m-amber, which is overloaded)', () => {
    expect(QUICK_ACTIONS[2].labelKey).toBe('chat.quickActions.ideas');
    expect(QUICK_ACTIONS[2].iconColorToken).toBe('--m-rose');
  });
});

describe('buildGreeting (Capability 9)', () => {
  it('profileLoading=true: returns just the prefix, ignoring name and incognito', () => {
    expect(buildGreeting('Good morning', 'Elias', true, false)).toBe('Good morning');
    expect(buildGreeting('Good morning', 'Elias', true, true)).toBe('Good morning');
  });

  it('incognito=true: returns just the prefix, ignoring name', () => {
    expect(buildGreeting('Good morning', 'Elias', false, true)).toBe('Good morning');
  });

  it('normal + non-empty name: returns "prefix, name"', () => {
    expect(buildGreeting('Good morning', 'Elias', false, false)).toBe('Good morning, Elias');
  });

  it('normal + empty name: returns just the prefix', () => {
    expect(buildGreeting('Good morning', '', false, false)).toBe('Good morning');
  });

  it("preserves the prefix verbatim (time-of-day is the caller's responsibility)", () => {
    expect(buildGreeting('Buenos días', 'Carlos', false, true)).toBe('Buenos días');
  });
});

describe('getMixinEligibleCount', () => {
  it('counts only chat-capable models for the Mixin notice', () => {
    expect(
      getMixinEligibleCount([
        { capabilities: ['text', 'image'] },
        { capabilities: ['image'] },
        { capabilities: undefined },
      ])
    ).toBe(2);
  });
});
