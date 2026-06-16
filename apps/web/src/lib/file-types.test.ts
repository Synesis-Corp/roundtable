import { describe, it, expect } from 'vitest';
import { isAllowedFile, filterAllowedFiles, ALLOWED_MIME_PREFIXES } from './file-types';

function mockFile(name: string, type: string): File {
  // Minimal File polyfill for tests; jsdom provides File in node tests.
  return new File([new Uint8Array(0)], name, { type });
}

describe('isAllowedFile', () => {
  it('accepts image/* mime types', () => {
    expect(isAllowedFile(mockFile('photo.jpg', 'image/jpeg'))).toBe(true);
    expect(isAllowedFile(mockFile('photo.png', 'image/png'))).toBe(true);
    expect(isAllowedFile(mockFile('anim.gif', 'image/gif'))).toBe(true);
    expect(isAllowedFile(mockFile('ph.webp', 'image/webp'))).toBe(true);
  });

  it('accepts application/pdf mime types', () => {
    expect(isAllowedFile(mockFile('doc.pdf', 'application/pdf'))).toBe(true);
  });

  it('rejects common non-image, non-pdf types', () => {
    expect(
      isAllowedFile(
        mockFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      )
    ).toBe(false);
    expect(
      isAllowedFile(
        mockFile(
          'doc.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      )
    ).toBe(false);
    expect(isAllowedFile(mockFile('notes.txt', 'text/plain'))).toBe(false);
    expect(isAllowedFile(mockFile('archive.zip', 'application/zip'))).toBe(false);
    expect(isAllowedFile(mockFile('page.html', 'text/html'))).toBe(false);
  });

  it('rejects files with empty mime type', () => {
    expect(isAllowedFile(mockFile('mystery.bin', ''))).toBe(false);
  });
});

describe('filterAllowedFiles', () => {
  it('returns the allowed files and the rejected files separately', () => {
    const pdf = mockFile('doc.pdf', 'application/pdf');
    const png = mockFile('img.png', 'image/png');
    const xlsx = mockFile(
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const txt = mockFile('notes.txt', 'text/plain');

    const result = filterAllowedFiles([pdf, png, xlsx, txt]);

    expect(result.allowed).toEqual([pdf, png]);
    expect(result.rejected).toEqual([xlsx, txt]);
  });

  it('returns empty arrays for an empty input', () => {
    const result = filterAllowedFiles([]);
    expect(result.allowed).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('preserves the order of the input in both arrays', () => {
    const a = mockFile('a.pdf', 'application/pdf');
    const b = mockFile('b.txt', 'text/plain');
    const c = mockFile('c.png', 'image/png');
    const d = mockFile('d.docx', 'application/msword');

    const result = filterAllowedFiles([a, b, c, d]);
    expect(result.allowed).toEqual([a, c]);
    expect(result.rejected).toEqual([b, d]);
  });
});

describe('ALLOWED_MIME_PREFIXES', () => {
  it("exposes the allowed prefixes for the input element's accept attribute", () => {
    // The native `accept` attribute on `<input type="file">` understands MIME
    // types and wildcards. Keeping this list in sync with isAllowedFile's logic
    // is the single source of truth for "what the user can upload".
    expect(ALLOWED_MIME_PREFIXES).toEqual(['image/*', 'application/pdf']);
  });
});
