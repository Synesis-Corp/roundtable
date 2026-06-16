import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import { extractAttachments } from "./attachments";

function mockFile(
  mimetype: string,
  originalname: string,
  content: string | Buffer,
): Express.Multer.File {
  const buffer = typeof content === "string" ? Buffer.from(content) : content;
  return {
    buffer,
    mimetype,
    originalname,
    fieldname: "files",
    encoding: "7bit",
    size: buffer.length,
    destination: "",
    filename: originalname,
    path: "",
    stream: null as any,
  };
}

/** Generates a small valid PDF buffer with a marker word, for happy-path tests. */
async function generatePdfBuffer(marker: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.addPage();
    doc.fontSize(12).text(`Document with marker ${marker}.`);
    doc.end();
  });
}

describe("extractAttachments", () => {
  it("converts image/png buffer to base64 data URI", async () => {
    const files = [mockFile("image/png", "photo.png", "test-image-data")];
    const result = await extractAttachments(files);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("image");
    expect(result[0].mimeType).toBe("image/png");
    expect(result[0].name).toBe("photo.png");
    expect(result[0].base64).toMatch(/^data:image\/png;base64,/);
    // Verify the base64 content decodes back to original
    const b64Content = result[0].base64!.split(",")[1];
    const decoded = Buffer.from(b64Content, "base64").toString();
    expect(decoded).toBe("test-image-data");
  });

  it("assigns type 'image' for image/jpeg", async () => {
    const files = [mockFile("image/jpeg", "photo.jpg", "jpeg-data")];
    const result = await extractAttachments(files);

    expect(result[0].type).toBe("image");
    expect(result[0].base64).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("assigns type 'pdf' for application/pdf and extracts text eagerly", async () => {
    const marker = "PdfAttachMarker7";
    const pdfBuffer = await generatePdfBuffer(marker);
    const files = [mockFile("application/pdf", "informe.pdf", pdfBuffer)];
    const result = await extractAttachments(files);

    expect(result[0].type).toBe("pdf");
    expect(result[0].mimeType).toBe("application/pdf");
    expect(result[0].base64).toMatch(/^data:application\/pdf;base64,/);
    expect(result[0].extractedText).toContain(marker);
    expect(result[0].pageCount).toBe(1);
  });

  it("soft-fails when PDF extraction throws (corrupted buffer) — keeps type 'pdf' but no extractedText", async () => {
    const garbage = Buffer.from("not a real pdf, just text bytes");
    const files = [mockFile("application/pdf", "broken.pdf", garbage)];

    const result = await extractAttachments(files);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("pdf");
    expect(result[0].mimeType).toBe("application/pdf");
    expect(result[0].base64).toMatch(/^data:application\/pdf;base64,/);
    // No extractedText because extraction failed, but the call did not throw.
    expect(result[0].extractedText).toBeUndefined();
    expect(result[0].pageCount).toBeUndefined();
  });

  it("assigns type 'file' for text/plain", async () => {
    const files = [mockFile("text/plain", "notes.txt", "hello world")];
    const result = await extractAttachments(files);

    expect(result[0].type).toBe("file");
    expect(result[0].mimeType).toBe("text/plain");
  });

  it("handles multiple files", async () => {
    const files = [
      mockFile("image/png", "img1.png", "png-data"),
      mockFile("application/pdf", "doc.pdf", "pdf-data"),
      mockFile("image/jpeg", "img2.jpg", "jpeg-data"),
    ];
    const result = await extractAttachments(files);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("image");
    expect(result[1].type).toBe("pdf");
    expect(result[2].type).toBe("image");
  });

  it("returns empty array for empty input", async () => {
    const result = await extractAttachments([]);
    expect(result).toEqual([]);
  });

  it("produces valid base64 that decodes correctly with binary data", async () => {
    const binaryData = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
    const files = [{
      buffer: binaryData,
      mimetype: "image/gif",
      originalname: "anim.gif",
      fieldname: "files",
      encoding: "7bit",
      size: binaryData.length,
      destination: "",
      filename: "anim.gif",
      path: "",
      stream: null as any,
    }];
    const result = await extractAttachments(files);

    const b64Content = result[0].base64!.split(",")[1];
    const decoded = Buffer.from(b64Content, "base64");
    expect(decoded).toEqual(binaryData);
    expect(decoded.toString()).toBe("Hello");
  });
});
