import { describe, it, expect } from 'vitest';
import type { Message } from '@chat/sdk';
import { convertMessages, throwIfErrorPart } from './utils';

describe('throwIfErrorPart', () => {
  it('does nothing for a non-error part', () => {
    expect(() => throwIfErrorPart({ type: 'text-delta', textDelta: 'hi' })).not.toThrow();
  });

  it('rethrows an Error instance from the error part', () => {
    const original = new Error('provider exploded');
    expect(() => throwIfErrorPart({ type: 'error', error: original })).toThrow('provider exploded');
  });

  it('throws with the string when the error is a string', () => {
    expect(() => throwIfErrorPart({ type: 'error', error: 'rate limited' })).toThrow(
      'rate limited'
    );
  });

  it('throws with the message field when the error is an object', () => {
    expect(() => throwIfErrorPart({ type: 'error', error: { message: 'bad request' } })).toThrow(
      'bad request'
    );
  });

  it('throws a generic message when the error has no usable shape', () => {
    expect(() => throwIfErrorPart({ type: 'error', error: null })).toThrow(
      'The model provider returned a stream error.'
    );
  });
});

const base64Pdf =
  'data:application/pdf;base64,JVBERi0xLjQKJcfsj6IKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMjAwXT4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2MyAwMDAwMCBuIAowMDAwMDAwMTEyIDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA0L1Jvb3QgMSAwIFI+PgpzdGFydHhyZWYKMTQ0CiUlRU9G';

const base64Jpeg =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z';

const pdfAttachment: Message['attachments'] = [
  {
    type: 'pdf',
    base64: base64Pdf,
    mimeType: 'application/pdf',
    name: 'informe.pdf',
    extractedText: 'Cláusula 7: el proveedor debe responder en 24h hábiles.',
    pageCount: 12,
  },
];

const imageAttachment: Message['attachments'] = [
  {
    type: 'image',
    base64: base64Jpeg,
    mimeType: 'image/jpeg',
    name: 'foto.jpg',
  },
];

const pdfNoText: Message['attachments'] = [
  {
    type: 'pdf',
    base64: base64Pdf,
    mimeType: 'application/pdf',
    name: 'broken.pdf',
    // No extractedText, no pageCount — extraction failed.
  },
];

type ContentPart = { type: string; mimeType?: string; data?: unknown; text?: string };

/** Normalizes AI SDK content (which can be a string OR an array of parts) to
 *  an array of parts. The pre-change implementation returned a string when
 *  there was only a single text part; this helper handles both shapes. */
function asParts(content: unknown): ContentPart[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return content as ContentPart[];
}

describe('convertMessages — PDF routing', () => {
  it("sends a PDF as a native file part when target modalities include 'pdf'", () => {
    const messages: Message[] = [
      { role: 'user', content: 'summarize this', attachments: pdfAttachment },
    ];
    const out = convertMessages(messages, { targetModalities: ['text', 'image', 'pdf'] });

    const parts = asParts(out[0].content);
    const filePart = parts.find((p) => p.type === 'file');
    expect(filePart).toBeDefined();
    expect(filePart?.mimeType).toBe('application/pdf');
    // The base64 prefix must be stripped — the AI SDK wants the raw base64 string.
    expect(typeof filePart?.data).toBe('string');
    // The user text is the only text part (no PDF placeholder when routing native).
    const textParts = parts.filter((p) => p.type === 'text');
    expect(textParts).toHaveLength(1);
    expect(textParts[0]?.text).toBe('summarize this');
  });

  it('inlines the extracted text when the target model does NOT support PDF', () => {
    const messages: Message[] = [
      { role: 'user', content: "what's in clause 7?", attachments: pdfAttachment },
    ];
    const out = convertMessages(messages, { targetModalities: ['text'] });

    const parts = asParts(out[0].content);
    // No file part was emitted (model can't handle it).
    expect(parts.find((p) => p.type === 'file')).toBeUndefined();
    // The text part contains the user message + the labeled extracted content.
    const joinedText = parts.map((p) => p.text ?? '').join('');
    expect(joinedText).toContain("what's in clause 7?");
    expect(joinedText).toContain('[Documento adjunto: informe.pdf, 12 páginas]');
    expect(joinedText).toContain('Cláusula 7: el proveedor debe responder en 24h hábiles.');
  });

  it('routes mixed PDF + image correctly when the model supports both', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: 'compare this photo and this PDF',
        attachments: [...(imageAttachment ?? []), ...(pdfAttachment ?? [])],
      },
    ];
    const out = convertMessages(messages, { targetModalities: ['text', 'image', 'pdf'] });

    const parts = asParts(out[0].content);
    expect(parts.find((p) => p.type === 'image' && p.mimeType === 'image/jpeg')).toBeDefined();
    expect(parts.find((p) => p.type === 'file' && p.mimeType === 'application/pdf')).toBeDefined();
    // No PDF text placeholder — the file part is enough.
    const joinedText = parts.map((p) => p.text ?? '').join('');
    expect(joinedText).not.toContain('informe.pdf');
  });

  it("falls back to the legacy [File: name] placeholder when PDF has no extractedText and model can't handle PDF", () => {
    const messages: Message[] = [
      { role: 'user', content: "what's in this?", attachments: pdfNoText },
    ];
    const out = convertMessages(messages, { targetModalities: ['text'] });

    const parts = asParts(out[0].content);
    const joinedText = parts.map((p) => p.text ?? '').join('');
    expect(joinedText).toContain('[File: broken.pdf (application/pdf)]');
    // No labeled document block because there was no extracted text to embed.
    expect(joinedText).not.toContain('[Documento adjunto:');
  });

  it('preserves the pre-change behavior when no options are passed (backward compat)', () => {
    const messages: Message[] = [{ role: 'user', content: 'hi', attachments: pdfAttachment }];
    const out = convertMessages(messages);

    const parts = asParts(out[0].content);
    // No file part was emitted (legacy path didn't know about native PDF).
    expect(parts.find((p) => p.type === 'file')).toBeUndefined();
    // The legacy text placeholder was used.
    const joinedText = parts.map((p) => p.text ?? '').join('');
    expect(joinedText).toContain('[File: informe.pdf (application/pdf)]');
  });
});
