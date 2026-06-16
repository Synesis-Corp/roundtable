import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { extractPdfText, type PdfExtraction } from "./pdf-convert";

/**
 * Generates an in-memory PDF with the given number of pages. Each page contains
 * a copy of `pageText` followed by enough Lorem ipsum filler to make the total
 * text length roughly the target. Returns a Node Buffer suitable for `extractPdfText`.
 */
async function generatePdfBuffer(
  pageCount: number,
  pageText: string,
  fillerPerPage = 100,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (let i = 0; i < pageCount; i++) {
      doc.addPage();
      doc.fontSize(12).text(pageText);
      // Filler Lorem ipsum to inflate text length.
      doc.text(
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(fillerPerPage),
      );
    }
    doc.end();
  });
}

describe("extractPdfText", () => {
  it("returns the extracted text and page count for a valid small PDF", async () => {
    const marker = "RoundtableTestMarker42";
    // No filler → exactly 3 pages, no auto-breaks.
    const buffer = await generatePdfBuffer(3, `Page with ${marker} content.`, 0);

    const result = await extractPdfText(buffer);

    expect(result.pageCount).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain(marker);
  });

  it("truncates extracted text to 50K chars when the PDF is very large", async () => {
    // Each page contributes ~5K chars of Lorem ipsum × 30 pages = ~150K chars,
    // well over the 50K cap. 30 pages keeps the test fast.
    const buffer = await generatePdfBuffer(30, "Page header.", 200);

    const result: PdfExtraction = await extractPdfText(buffer);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(50_000 + 200); // small slack for the marker
    expect(result.text).toContain("contenido truncado");
    expect(result.text).toContain("caracteres omitidos");
  });

  it("throws when given a corrupted buffer that is not a valid PDF", async () => {
    const garbage = Buffer.from("this is not a pdf at all, just random text bytes");

    await expect(extractPdfText(garbage)).rejects.toBeDefined();
  });
});
