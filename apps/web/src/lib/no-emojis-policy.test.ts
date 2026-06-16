/**
 * Regression guard (2026-06-14): the user has explicitly requested that
 * the product contain NO emoji characters — they look unprofessional in
 * a serious product (success/error states, AI buttons, etc.). Use
 * proper SVG icons instead. See:
 *   - commit dd8754a: initial removal (5 emojis)
 *   - commit a3cef7f: step 4 fix accidentally reintroduced 3 in
 *     OnboardingWizard.tsx (regression)
 *
 * This test fails CI if any emoji sneaks into the product. The pattern
 * matches Unicode emoji ranges (Misc Symbols, Dingbats, Emoticons,
 * Transport, Misc Symbols & Pictographs, etc.) — not just the common
 * 5 that were removed. Skips `openspec/`, `docs/`, and CHANGELOG/
 * STATUS files (project-management artifacts that legitimately use
 * status indicators like ✅/❌/🔴/🕒 as semantic markers, per user
 * decision in commit dd8754a).
 *
 * The test runs from the apps/web/ directory and greps the rest of
 * the monorepo (apps/api/, apps/web/, packages/) for emojis.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../');

// Unicode ranges that cover most emoji usage. The full emoji set is huge;
// this matches the most common ones (Misc Symbols, Dingbats, Emoticons,
// Transport, Misc Symbols & Pictographs, Supplemental Symbols and
// Pictographs, Symbols & Pictographs Extended-A). Anything outside this
// pattern in product code is almost certainly a regression.
const EMOJI_PATTERN = '[\\x{1F000}-\\x{1FFFF}]|[\\x{2600}-\\x{27BF}]';

function findEmojis(): { file: string; line: number; match: string }[] {
  // -n: line numbers
  // -P: perl regex (needed for unicode classes)
  // -g '*.{ts,tsx,js,jsx,html}': only source files
  // -g '!*.test.{ts,tsx}': EXCLUDE test files (tests can have emojis in
  //   fixtures, assertions, comments — they're not user-facing product)
  //   Note: this test file itself contains emojis as documentation about
  //   the policy (e.g. "may keep ✅/❌/🔴/🕒 as semantic markers") so
  //   excluding test files is necessary.
  let raw: string;
  try {
    raw = execSync(
      `rg -nP "${EMOJI_PATTERN}" ` +
        `apps/api/src ` +
        `apps/web/src ` +
        `apps/web/index.html ` +
        `packages/ ` +
        `-g '*.{ts,tsx,js,jsx,html}' ` +
        `-g '!*.test.{ts,tsx}' ` +
        `--no-ignore 2>/dev/null || true`,
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    );
  } catch {
    raw = '';
  }

  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // Format: "path/to/file:line:match"
      const lastColon = line.lastIndexOf(':');
      const secondLastColon = line.lastIndexOf(':', lastColon - 1);
      const file = line.slice(0, secondLastColon);
      const lineNum = parseInt(line.slice(secondLastColon + 1, lastColon), 10);
      const match = line.slice(lastColon + 1);
      return { file, line: lineNum, match };
    });
}

describe('no-emojis policy (product code)', () => {
  it('apps/ and packages/ contain no emoji characters', () => {
    const hits = findEmojis();
    if (hits.length > 0) {
      const summary = hits
        .map((h) => `  ${h.file}:${h.line}  →  ${h.match.trim().slice(0, 80)}`)
        .join('\n');
      throw new Error(
        `Found ${hits.length} emoji(s) in product code. ` +
          `Replace with SVG icons (Feather-style stroke) or text. ` +
          `Project docs (CHANGELOG/STATUS/ROADMAP) may keep ✅/❌/🔴/🕒 as semantic markers, but product UI must be emoji-free.\n\n${summary}`
      );
    }
    expect(hits).toEqual([]);
  });
});
