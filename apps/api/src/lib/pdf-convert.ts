import { extractText, getDocumentProxy } from 'unpdf';

/** Maximum characters of extracted text we keep per PDF (~12-15K tokens).
 *  Caps memory + token usage for huge documents; the truncation marker
 *  tells the model the rest was omitted. */
const MAX_EXTRACTED_CHARS = 50_000;

const TRUNCATION_MARKER = '\n\n[... contenido truncado, {remaining} caracteres omitidos ...]';

export interface PdfExtraction {
  text: string;
  pageCount: number;
  truncated: boolean;
}

/**
 * Extracts the text content of a PDF buffer using `unpdf` (a thin wrapper
 * around Mozilla's pdfjs). Returns the merged text across all pages plus
 * the total page count. If the extracted text exceeds `MAX_EXTRACTED_CHARS`,
 * it is truncated and a marker indicates the omitted character count.
 *
 * The function is async because pdfjs loads its worker lazily in Node.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtraction> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  // unpdf exposes the underlying pdfjs proxy which carries `numPages`. The
  // raw PDF document object is available via `_pdfInfo` but is overkill here.
  const pageCount = (pdf as unknown as { numPages?: number }).numPages ?? 0;
  // unpdf returns text as `string | string[]` — when `mergePages: true` is set
  // we get a single string, but the types don't narrow. Normalize defensively.
  const raw = await extractText(pdf, { mergePages: true });
  const text: string = Array.isArray(raw.text) ? raw.text.join('\n') : raw.text;

  if (text.length <= MAX_EXTRACTED_CHARS) {
    return { text, pageCount, truncated: false };
  }

  const remaining = text.length - MAX_EXTRACTED_CHARS;
  const truncatedText =
    text.slice(0, MAX_EXTRACTED_CHARS) +
    TRUNCATION_MARKER.replace('{remaining}', String(remaining));

  return { text: truncatedText, pageCount, truncated: true };
}
