import { describe, it, expect } from 'vitest';
import en from './en.json';
import es from './es.json';

/**
 * Locale parity smoke test — the i18n completeness contract.
 *
 * Every key we expect to be present in both locales is enumerated below.
 * The list is intentionally narrow (the keys most likely to fall through
 * the cracks in manual edits). Add keys here whenever you introduce a new
 * fallback `|| '…'` in the UI layer, or whenever you ship a UI string
 * without verifying it exists in es.json.
 *
 * Failures point to a real defect: the user-facing string is being
 * rendered as the key (e.g., "chat.incognito.explainer.dismiss") instead
 * of the localized text.
 */
const REQUIRED_KEYS: ReadonlyArray<string> = [
  // Incognito explainer modal — both languages must ship the dismiss label
  // for the close (×) button. Without it, the modal falls back to a
  // hardcoded English "Dismiss" in ES locales (see verify-report.md).
  'chat.incognito.explainer.dismiss',
];

function read(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

describe('i18n locales — completeness', () => {
  it.each(REQUIRED_KEYS)('en.json has key %s', (key) => {
    const value = read(en, key);
    expect(value).toBeTypeOf('string');
    expect((value as string).length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_KEYS)('es.json has key %s', (key) => {
    const value = read(es, key);
    expect(value).toBeTypeOf('string');
    expect((value as string).length).toBeGreaterThan(0);
  });
});
