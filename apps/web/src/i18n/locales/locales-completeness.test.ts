import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
  // Auto-fallback rate-limit/quota (2026-06-20-auto-rate-limit-fallback).
  // Multi-provider exhaustion (attemptsTried > 1) — interpolates {{count}}
  // and {{provider}}.
  'chat.errors.rateLimitExceeded',
  // Single-provider quota exhaustion (attemptsTried === 1) — interpolates
  // {{provider}}.
  'chat.errors.allCandidatesExhausted',
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

  it('search namespace has the same keys in English and Spanish', () => {
    const enKeys = Object.keys(en.search).sort();
    const esKeys = Object.keys(es.search).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it('locale JSON files do not contain duplicate keys at the same object level', () => {
    const localeDir = path.resolve(__dirname);
    for (const fileName of ['en.json', 'es.json']) {
      const raw = fs.readFileSync(path.join(localeDir, fileName), 'utf8');
      const duplicates = findDuplicateJsonKeys(raw);
      expect(duplicates, `${fileName} duplicate keys`).toEqual([]);
    }
  });
});

function findDuplicateJsonKeys(raw: string): string[] {
  const duplicates: string[] = [];
  const stack: Array<{ path: string; keys: Set<string> }> = [];
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    if (char === '{') {
      stack.push({ path: stack.at(-1)?.path ?? '$', keys: new Set() });
      i++;
      continue;
    }
    if (char === '}') {
      stack.pop();
      i++;
      continue;
    }
    if (char !== '"') {
      i++;
      continue;
    }

    const start = i;
    i++;
    let value = '';
    while (i < raw.length) {
      if (raw[i] === '\\') {
        value += raw.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (raw[i] === '"') break;
      value += raw[i];
      i++;
    }
    i++;

    let cursor = i;
    while (/\s/.test(raw[cursor] ?? '')) cursor++;
    if (raw[cursor] !== ':') continue;

    const current = stack.at(-1);
    if (!current) continue;
    if (current.keys.has(value)) duplicates.push(`${current.path}.${value}`);
    current.keys.add(value);

    cursor++;
    while (/\s/.test(raw[cursor] ?? '')) cursor++;
    if (raw[cursor] === '{') {
      stack.push({ path: `${current.path}.${value}`, keys: new Set() });
      i = cursor + 1;
    } else {
      i = Math.max(i, start + 1);
    }
  }

  return duplicates;
}
